import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createPostgresPool } from "../lib/postgres-client.js";
import { applyPostgresMigrations } from "../lib/postgres-migrations.js";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");

const migrationPool = createPostgresPool({ applicationName: "insaya-external-advisor-repo-migrate" });
await applyPostgresMigrations(migrationPool, { logger: { log() {} } });
await migrationPool.end();

const pool = createPostgresPool({ applicationName: "insaya-external-advisor-repo-e2e" });
const suffix = crypto.randomUUID();
const orgA = `org-a-${suffix}`;
const orgB = `org-b-${suffix}`;
const owner = `owner-${suffix}`;
const advisor = `advisor-${suffix}`;
const internalAdvisor = `internal-advisor-${suffix}`;
const outsider = `outsider-${suffix}`;
const other = `other-${suffix}`;
let currentNow = new Date("2026-08-17T00:00:00Z");

const resourceOwners = new Map([
  [`case-a-${suffix}`, orgA],
  [`case-a-expiring-${suffix}`, orgA],
  [`case-b-${suffix}`, orgB],
]);

try {
  const users = [owner, advisor, internalAdvisor, outsider, other];
  for (const [index, userId] of users.entries()) {
    await pool.query(
      `INSERT INTO users(id,email_normalized,status,created_at,updated_at)
       VALUES ($1,$2,'active',$3,$3)`,
      [userId, `advisor-repo-${index}-${suffix}@example.com`, currentNow],
    );
  }
  await pool.query(
    `INSERT INTO organizations(id,type,legal_name,display_name,status,created_at,updated_at)
     VALUES
       ($1,'BUSINESS','Org A','Org A','ACTIVE',$3,$3),
       ($2,'BUSINESS','Org B','Org B','ACTIVE',$3,$3)`,
    [orgA, orgB, currentNow],
  );
  await pool.query(
    `INSERT INTO organization_memberships
     (id,organization_id,user_id,role_key,status,scope,joined_at,removed_at,created_at,updated_at)
     VALUES
       ($1,$2,$3,'OWNER','ACTIVE','{}'::jsonb,$6,NULL,$6,$6),
       ($4,$2,$5,'MANAGER','ACTIVE','{}'::jsonb,$6,NULL,$6,$6)`,
    [`mem-owner-${suffix}`, orgA, owner, `mem-internal-${suffix}`, internalAdvisor, currentNow],
  );

  const { createExternalAdvisorShareGrantRepository } = await import("../lib/external-advisor-sharegrant-repo.js");
  const repository = createExternalAdvisorShareGrantRepository({
    pool,
    now: () => new Date(currentNow),
    resolveResourceOrganizationId: async ({ resourceId }) => resourceOwners.get(resourceId) || null,
  });

  await assert.rejects(
    () => repository.create({
      organizationId: orgA,
      resourceId: `case-b-${suffix}`,
      advisorUserId: advisor,
      permissions: ["case.read"],
      createdByUserId: owner,
      expiresAt: "2026-09-01T00:00:00Z",
    }),
    /external_advisor_cross_tenant_resource_forbidden/,
  );

  await assert.rejects(
    () => repository.create({
      organizationId: orgA,
      resourceId: `case-a-${suffix}`,
      advisorUserId: internalAdvisor,
      permissions: ["case.read"],
      createdByUserId: owner,
      expiresAt: "2026-09-01T00:00:00Z",
    }),
    /external_advisor_internal_member_forbidden/,
  );

  await assert.rejects(
    () => repository.create({
      organizationId: orgA,
      resourceId: `case-a-${suffix}`,
      advisorUserId: advisor,
      permissions: ["case.read"],
      createdByUserId: outsider,
      expiresAt: "2026-09-01T00:00:00Z",
    }),
    /external_advisor_actor_membership_required/,
  );

  const grant = await repository.create({
    organizationId: orgA,
    resourceId: `case-a-${suffix}`,
    advisorUserId: advisor,
    permissions: ["case.read", "document.read", "document.review"],
    createdByUserId: owner,
    expiresAt: "2026-09-01T00:00:00Z",
    metadata: { purpose: "repository-e2e" },
  });
  assert.equal(grant.status, "PENDING");
  assert.equal(grant.effectiveStatus, "PENDING");

  const advisorMembershipBefore = await pool.query(
    "SELECT COUNT(*)::integer AS count FROM organization_memberships WHERE organization_id=$1 AND user_id=$2",
    [orgA, advisor],
  );
  assert.equal(advisorMembershipBefore.rows[0].count, 0, "ShareGrant must not create organization membership");

  await assert.rejects(
    () => repository.create({
      organizationId: orgA,
      resourceId: `case-a-${suffix}`,
      advisorUserId: advisor,
      permissions: ["case.read"],
      createdByUserId: owner,
      expiresAt: "2026-09-02T00:00:00Z",
    }),
    /external_advisor_live_grant_duplicate/,
  );

  await assert.rejects(
    () => repository.accept({ grantId: grant.id, actorUserId: other }),
    /external_advisor_accept_identity_mismatch/,
  );

  currentNow = new Date("2026-08-18T00:00:00Z");
  const active = await repository.accept({ grantId: grant.id, actorUserId: advisor });
  assert.equal(active.status, "ACTIVE");
  assert.equal(active.effectiveStatus, "ACTIVE");
  assert.ok(active.acceptedAt);

  assert.equal((await repository.hasPermission({ grantId: grant.id, advisorUserId: advisor, permission: "case.read" })).allowed, true);
  assert.equal((await repository.hasPermission({ grantId: grant.id, advisorUserId: advisor, permission: "document.review" })).allowed, true);
  assert.deepEqual(
    await repository.hasPermission({ grantId: grant.id, advisorUserId: advisor, permission: "comment.create" }),
    { allowed: false, reason: "permission_not_granted" },
  );
  assert.deepEqual(
    await repository.hasPermission({ grantId: grant.id, advisorUserId: other, permission: "case.read" }),
    { allowed: false, reason: "advisor_identity_mismatch" },
  );

  const advisorList = await repository.listForAdvisor({ advisorUserId: advisor });
  assert.equal(advisorList.some((item) => item.id === grant.id), true);
  const orgList = await repository.listForOrganization({ organizationId: orgA });
  assert.equal(orgList.some((item) => item.id === grant.id), true);

  await pool.query(
    `INSERT INTO organization_memberships
     (id,organization_id,user_id,role_key,status,scope,joined_at,removed_at,created_at,updated_at)
     VALUES ($1,$2,$3,'EMPLOYEE','ACTIVE','{}'::jsonb,$4,NULL,$4,$4)`,
    [`mem-advisor-later-${suffix}`, orgA, advisor, currentNow],
  );
  assert.deepEqual(
    await repository.hasPermission({ grantId: grant.id, advisorUserId: advisor, permission: "case.read" }),
    { allowed: false, reason: "advisor_became_internal_member" },
  );
  await pool.query(
    `UPDATE organization_memberships
     SET status='REMOVED',removed_at=$2,updated_at=$2
     WHERE organization_id=$1 AND user_id=$3`,
    [orgA, currentNow, advisor],
  );
  assert.equal((await repository.hasPermission({ grantId: grant.id, advisorUserId: advisor, permission: "case.read" })).allowed, true);

  currentNow = new Date("2026-08-19T00:00:00Z");
  const revoked = await repository.revoke({ grantId: grant.id, actorUserId: owner, metadata: { reason: "test complete" } });
  assert.equal(revoked.status, "REVOKED");
  assert.deepEqual(
    await repository.hasPermission({ grantId: grant.id, advisorUserId: advisor, permission: "case.read" }),
    { allowed: false, reason: "grant_inactive" },
  );
  await assert.rejects(
    () => repository.accept({ grantId: grant.id, actorUserId: advisor }),
    /external_advisor_grant_not_pending/,
  );

  const events = await repository.listEvents(grant.id);
  assert.deepEqual(events.map((event) => event.eventType), ["CREATED", "ACCEPTED", "REVOKED"]);
  assert.deepEqual(events.map((event) => event.actorUserId), [owner, advisor, owner]);

  currentNow = new Date("2026-08-19T01:00:00Z");
  const expiringGrant = await repository.create({
    organizationId: orgA,
    resourceId: `case-a-expiring-${suffix}`,
    advisorUserId: advisor,
    permissions: ["case.read"],
    createdByUserId: owner,
    expiresAt: "2026-08-20T00:00:00Z",
  });
  currentNow = new Date("2026-08-19T02:00:00Z");
  await repository.accept({ grantId: expiringGrant.id, actorUserId: advisor });
  currentNow = new Date("2026-08-20T00:00:00Z");
  assert.deepEqual(
    await repository.hasPermission({ grantId: expiringGrant.id, advisorUserId: advisor, permission: "case.read" }),
    { allowed: false, reason: "grant_expired" },
  );
  assert.equal((await repository.get(expiringGrant.id)).effectiveStatus, "EXPIRED");

  const membershipAfter = await pool.query(
    "SELECT COUNT(*)::integer AS count FROM organization_memberships WHERE organization_id=$1 AND user_id=$2 AND status='ACTIVE'",
    [orgA, advisor],
  );
  assert.equal(membershipAfter.rows[0].count, 0, "ShareGrant repository must leave advisor outside organization membership");

  console.log("External Advisor ShareGrant repository PostgreSQL E2E passed: tenant ownership, external identity, acceptance, expiry, membership separation, revocation and permission invariants.");
} finally {
  await pool.end();
}
