import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createPostgresPool } from "../lib/postgres-client.js";
import { applyPostgresMigrations } from "../lib/postgres-migrations.js";
import { closeRuntimePostgres } from "../lib/runtime-postgres.js";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");

const migrationPool = createPostgresPool({ applicationName: "insaya-advisor-service-migrate" });
await applyPostgresMigrations(migrationPool, { logger: { log() {} } });
await migrationPool.end();

const fixturePool = createPostgresPool({ applicationName: "insaya-advisor-service-e2e" });
const suffix = crypto.randomUUID();
const orgA = `org-service-a-${suffix}`;
const orgB = `org-service-b-${suffix}`;
const owner = `owner-service-${suffix}`;
const hr = `hr-service-${suffix}`;
const manager = `manager-service-${suffix}`;
const advisor = `advisor-service-${suffix}`;
const outsider = `outsider-service-${suffix}`;
const now = new Date();
const expiresAt = new Date(now.getTime() + 7 * 86_400_000).toISOString();

async function insertUser(userId, index) {
  await fixturePool.query(
    `INSERT INTO users(id,email_normalized,status,created_at,updated_at)
     VALUES ($1,$2,'active',$3,$3)`,
    [userId, `advisor-service-${index}-${suffix}@example.com`, now],
  );
}

try {
  for (const [index, userId] of [owner, hr, manager, advisor, outsider].entries()) await insertUser(userId, index);
  await fixturePool.query(
    `INSERT INTO organizations(id,type,legal_name,display_name,status,created_at,updated_at)
     VALUES
      ($1,'BUSINESS','Service A','Service A','ACTIVE',$3,$3),
      ($2,'BUSINESS','Service B','Service B','ACTIVE',$3,$3)`,
    [orgA, orgB, now],
  );
  const memberships = [
    [`mem-owner-${suffix}`, owner, "OWNER"],
    [`mem-hr-${suffix}`, hr, "HR_ADMIN"],
    [`mem-manager-${suffix}`, manager, "MANAGER"],
  ];
  for (const [membershipId, userId, roleKey] of memberships) {
    await fixturePool.query(
      `INSERT INTO organization_memberships
       (id,organization_id,user_id,role_key,status,scope,joined_at,removed_at,created_at,updated_at)
       VALUES ($1,$2,$3,$4,'ACTIVE','{}'::jsonb,$5,NULL,$5,$5)`,
      [membershipId, orgA, userId, roleKey, now],
    );
  }

  const { createExternalAdvisorCollaborationService } = await import("../lib/external-advisor-collaboration-service.js");
  const service = createExternalAdvisorCollaborationService();

  const draft = await service.createBusinessCase({
    organizationId: orgA,
    actorUserId: owner,
    title: "외부 자문 검토 케이스",
    summary: "서비스 RBAC 실제 DB 검증",
  });
  assert.equal(draft.status, "DRAFT");

  await assert.rejects(
    () => service.createBusinessCase({ organizationId: orgA, actorUserId: manager, title: "Manager 금지" }),
    /external_advisor_management_role_required/,
  );
  await assert.rejects(
    () => service.createBusinessCase({ organizationId: orgA, actorUserId: outsider, title: "Outsider 금지" }),
    /external_advisor_management_membership_required/,
  );
  await assert.rejects(
    () => service.issueExternalAdvisorShareGrant({
      organizationId: orgA,
      caseId: draft.id,
      advisorUserId: advisor,
      permissions: ["case.read"],
      actorUserId: owner,
      expiresAt,
    }),
    /external_advisor_business_case_not_shareable/,
  );

  const opened = await service.transitionBusinessCase({ caseId: draft.id, actorUserId: hr, toStatus: "OPEN" });
  assert.equal(opened.status, "OPEN");

  await assert.rejects(
    () => service.issueExternalAdvisorShareGrant({
      organizationId: orgB,
      caseId: draft.id,
      advisorUserId: advisor,
      permissions: ["case.read"],
      actorUserId: owner,
      expiresAt,
    }),
    /external_advisor_management_membership_required/,
  );

  const grant = await service.issueExternalAdvisorShareGrant({
    organizationId: orgA,
    caseId: draft.id,
    advisorUserId: advisor,
    permissions: ["case.read", "document.read", "comment.create"],
    actorUserId: hr,
    expiresAt,
    metadata: { purpose: "service-e2e" },
  });
  assert.equal(grant.status, "PENDING");
  assert.equal(grant.createdByUserId, hr);

  await assert.rejects(
    () => service.acceptExternalAdvisorShareGrant({ grantId: grant.id, actorUserId: outsider }),
    /external_advisor_accept_identity_mismatch/,
  );
  const active = await service.acceptExternalAdvisorShareGrant({ grantId: grant.id, actorUserId: advisor });
  assert.equal(active.status, "ACTIVE");

  const advisorGrants = await service.listAdvisorShareGrants({ advisorUserId: advisor, actorUserId: advisor });
  assert.equal(advisorGrants.some((item) => item.id === grant.id), true);
  await assert.rejects(
    () => service.listAdvisorShareGrants({ advisorUserId: advisor, actorUserId: outsider }),
    /external_advisor_list_identity_mismatch/,
  );

  const orgGrants = await service.listOrganizationShareGrants({ organizationId: orgA, actorUserId: owner });
  assert.equal(orgGrants.some((item) => item.id === grant.id), true);
  await assert.rejects(
    () => service.listOrganizationShareGrants({ organizationId: orgA, actorUserId: manager }),
    /external_advisor_management_role_required/,
  );

  const advisorMembership = await fixturePool.query(
    `SELECT COUNT(*)::integer AS count FROM organization_memberships
     WHERE organization_id=$1 AND user_id=$2 AND status='ACTIVE'`,
    [orgA, advisor],
  );
  assert.equal(advisorMembership.rows[0].count, 0, "advisor collaboration service must never create organization Membership");

  const revoked = await service.revokeExternalAdvisorShareGrant({
    grantId: grant.id,
    actorUserId: hr,
    metadata: { reason: "service-e2e-complete" },
  });
  assert.equal(revoked.status, "REVOKED");

  const row = await fixturePool.query(
    "SELECT status,revoked_by_user_id FROM external_advisor_share_grants WHERE id=$1",
    [grant.id],
  );
  assert.equal(row.rows[0].status, "REVOKED");
  assert.equal(row.rows[0].revoked_by_user_id, hr);

  console.log("External Advisor collaboration service PostgreSQL E2E passed: OWNER/HR_ADMIN management, MANAGER denial, shareable Case boundary, exact advisor identity and revocation.");
} finally {
  await closeRuntimePostgres();
  await fixturePool.end();
}
