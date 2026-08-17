import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createPostgresPool } from "../lib/postgres-client.js";
import { applyPostgresMigrations } from "../lib/postgres-migrations.js";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");

const migrationPool = createPostgresPool({ applicationName: "insaya-business-case-foundation-migrate" });
await applyPostgresMigrations(migrationPool, { logger: { log() {} } });
await migrationPool.end();

const pool = createPostgresPool({ applicationName: "insaya-business-case-foundation-e2e" });
const suffix = crypto.randomUUID();
const orgA = `org-bcase-a-${suffix}`;
const orgB = `org-bcase-b-${suffix}`;
const ownerA = `owner-bcase-a-${suffix}`;
const ownerB = `owner-bcase-b-${suffix}`;
const advisor = `advisor-bcase-${suffix}`;
const outsider = `outsider-bcase-${suffix}`;
let currentNow = new Date("2026-08-17T05:00:00Z");

try {
  for (const [index, userId] of [ownerA, ownerB, advisor, outsider].entries()) {
    await pool.query(
      `INSERT INTO users(id,email_normalized,status,created_at,updated_at)
       VALUES ($1,$2,'active',$3,$3)`,
      [userId, `business-case-${index}-${suffix}@example.com`, currentNow],
    );
  }
  await pool.query(
    `INSERT INTO organizations(id,type,legal_name,display_name,status,created_at,updated_at)
     VALUES
       ($1,'BUSINESS','Business Case A','Business Case A','ACTIVE',$3,$3),
       ($2,'BUSINESS','Business Case B','Business Case B','ACTIVE',$3,$3)`,
    [orgA, orgB, currentNow],
  );
  await pool.query(
    `INSERT INTO organization_memberships
     (id,organization_id,user_id,role_key,status,scope,joined_at,removed_at,created_at,updated_at)
     VALUES
       ($1,$2,$3,'OWNER','ACTIVE','{}'::jsonb,$7,NULL,$7,$7),
       ($4,$5,$6,'OWNER','ACTIVE','{}'::jsonb,$7,NULL,$7,$7)`,
    [`mem-bcase-a-${suffix}`, orgA, ownerA, `mem-bcase-b-${suffix}`, orgB, ownerB, currentNow],
  );

  const { createBusinessCaseRepository, resolveBusinessCaseOrganizationId } = await import("../lib/business-case-repo.js");
  const { createExternalAdvisorShareGrantRepository } = await import("../lib/external-advisor-sharegrant-repo.js");
  const cases = createBusinessCaseRepository({ pool, now: () => new Date(currentNow) });

  await assert.rejects(
    () => cases.create({ organizationId: orgA, actorUserId: outsider, title: "권한 없는 생성" }),
    /business_case_membership_required/,
  );

  const businessCase = await cases.create({
    organizationId: orgA,
    actorUserId: ownerA,
    title: "  임금   정산 이슈  ",
    summary: "퇴직 시점 임금 정산 사실관계 확인",
  });
  assert.equal(businessCase.organizationId, orgA);
  assert.equal(businessCase.status, "DRAFT");
  assert.equal(businessCase.title, "임금 정산 이슈");
  assert.equal(await resolveBusinessCaseOrganizationId({ resourceId: businessCase.id, client: pool }), orgA);
  assert.equal(await resolveBusinessCaseOrganizationId({ resourceType: "EMPLOYEE", resourceId: businessCase.id, client: pool }), null);

  currentNow = new Date("2026-08-17T06:00:00Z");
  const opened = await cases.transition({ caseId: businessCase.id, actorUserId: ownerA, toStatus: "OPEN" });
  assert.equal(opened.status, "OPEN");
  assert.ok(opened.openedAt);

  currentNow = new Date("2026-08-17T07:00:00Z");
  const resolved = await cases.transition({
    caseId: businessCase.id,
    actorUserId: ownerA,
    toStatus: "RESOLVED",
    resolutionNote: "미지급 금액 확인 및 지급 완료",
  });
  assert.equal(resolved.status, "RESOLVED");
  assert.equal(resolved.resolutionNote, "미지급 금액 확인 및 지급 완료");
  assert.ok(resolved.resolvedAt);

  currentNow = new Date("2026-08-17T08:00:00Z");
  const reopened = await cases.transition({ caseId: businessCase.id, actorUserId: ownerA, toStatus: "OPEN" });
  assert.equal(reopened.status, "OPEN");
  assert.equal(reopened.resolutionNote, "");
  assert.equal(reopened.resolvedAt, null);

  currentNow = new Date("2026-08-17T09:00:00Z");
  const archived = await cases.transition({ caseId: businessCase.id, actorUserId: ownerA, toStatus: "ARCHIVED" });
  assert.equal(archived.status, "ARCHIVED");
  assert.ok(archived.archivedAt);
  await assert.rejects(
    () => cases.transition({ caseId: businessCase.id, actorUserId: ownerA, toStatus: "OPEN" }),
    /business_case_transition_invalid/,
  );

  const lifecycleEvents = await cases.listEvents(businessCase.id);
  assert.deepEqual(lifecycleEvents.map((event) => event.eventType), ["CREATED", "OPENED", "RESOLVED", "REOPENED", "ARCHIVED"]);
  assert.deepEqual(lifecycleEvents.map((event) => event.toStatus), ["DRAFT", "OPEN", "RESOLVED", "OPEN", "ARCHIVED"]);

  await assert.rejects(
    () => pool.query(
      `INSERT INTO business_cases
       (id,organization_id,title,summary,status,created_by_user_id,resolution_note,created_at,updated_at)
       VALUES ($1,$2,'Invalid Open','','OPEN',$3,'',$4,$4)`,
      [`invalid-open-${suffix}`, orgA, ownerA, currentNow],
    ),
    (error) => error?.code === "23514",
  );

  currentNow = new Date("2026-08-17T10:00:00Z");
  const shareableCase = await cases.create({ organizationId: orgA, actorUserId: ownerA, title: "외부 자문 공유 케이스" });
  currentNow = new Date("2026-08-17T10:05:00Z");
  await cases.transition({ caseId: shareableCase.id, actorUserId: ownerA, toStatus: "OPEN" });

  currentNow = new Date("2026-08-17T10:10:00Z");
  const otherTenantCase = await cases.create({ organizationId: orgB, actorUserId: ownerB, title: "B사 케이스" });
  currentNow = new Date("2026-08-17T10:15:00Z");
  await cases.transition({ caseId: otherTenantCase.id, actorUserId: ownerB, toStatus: "OPEN" });

  const grants = createExternalAdvisorShareGrantRepository({ pool, now: () => new Date(currentNow) });
  const grant = await grants.create({
    organizationId: orgA,
    resourceId: shareableCase.id,
    advisorUserId: advisor,
    permissions: ["case.read", "comment.create"],
    createdByUserId: ownerA,
    expiresAt: "2026-09-01T00:00:00Z",
  });
  assert.equal(grant.resourceId, shareableCase.id);
  assert.equal(grant.status, "PENDING");

  await assert.rejects(
    () => grants.create({
      organizationId: orgA,
      resourceId: otherTenantCase.id,
      advisorUserId: advisor,
      permissions: ["case.read"],
      createdByUserId: ownerA,
      expiresAt: "2026-09-01T00:00:00Z",
    }),
    /external_advisor_cross_tenant_resource_forbidden/,
  );

  currentNow = new Date("2026-08-17T10:30:00Z");
  const accepted = await grants.accept({ grantId: grant.id, actorUserId: advisor });
  assert.equal(accepted.status, "ACTIVE");
  assert.equal((await grants.hasPermission({ grantId: grant.id, advisorUserId: advisor, permission: "case.read" })).allowed, true);

  const advisorMemberships = await pool.query(
    "SELECT COUNT(*)::integer AS count FROM organization_memberships WHERE organization_id=$1 AND user_id=$2",
    [orgA, advisor],
  );
  assert.equal(advisorMemberships.rows[0].count, 0, "Business Case sharing must not create organization membership");

  const listed = await cases.listForOrganization({ organizationId: orgA });
  assert.equal(listed.some((item) => item.id === businessCase.id), true);
  assert.equal(listed.some((item) => item.id === shareableCase.id), true);

  console.log("Business Case foundation PostgreSQL E2E passed: tenant-owned lifecycle, canonical ownership resolver and default ShareGrant integration.");
} finally {
  await pool.end();
}
