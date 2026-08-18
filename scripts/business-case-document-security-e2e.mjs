import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createPostgresPool } from "../lib/postgres-client.js";
import { applyPostgresMigrations } from "../lib/postgres-migrations.js";
import { createBusinessCaseDocumentRepository } from "../lib/business-case-document-repo.js";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");

const migrationPool = createPostgresPool({ applicationName: "insaya-business-case-document-security-migrate" });
await applyPostgresMigrations(migrationPool, { logger: { log() {} } });
await migrationPool.end();

const pool = createPostgresPool({ applicationName: "insaya-business-case-document-security-e2e" });
const suffix = crypto.randomUUID();
const fixedNow = new Date("2026-08-18T12:00:00Z");
const repo = createBusinessCaseDocumentRepository({ pool, now: () => new Date(fixedNow) });
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");

const ownerId = `user-docsec-owner-${suffix}`;
const ownerBId = `user-docsec-ownerb-${suffix}`;
const hrId = `user-docsec-hr-${suffix}`;
const managerId = `user-docsec-manager-${suffix}`;
const advisorId = `user-docsec-advisor-${suffix}`;
const readOnlyAdvisorId = `user-docsec-readonly-${suffix}`;
const expiredAdvisorId = `user-docsec-expired-${suffix}`;
const outsiderId = `user-docsec-outsider-${suffix}`;
const orgA = `org-docsec-a-${suffix}`;
const orgB = `org-docsec-b-${suffix}`;
const caseA = `bcase-docsec-a-${suffix}`;
const caseB = `bcase-docsec-b-${suffix}`;
const fullGrantId = `easg-docsec-full-${suffix}`;
const readOnlyGrantId = `easg-docsec-readonly-${suffix}`;
const expiredGrantId = `easg-docsec-expired-${suffix}`;

async function insertGrant({ id, organizationId, caseId, advisorUserId, permissions, status = "ACTIVE", expiresAt }) {
  await pool.query(
    `INSERT INTO external_advisor_share_grants
     (id,organization_id,resource_type,resource_id,advisor_user_id,permissions,created_by_user_id,status,created_at,expires_at,accepted_at,revoked_at)
     VALUES ($1,$2,'BUSINESS_CASE',$3,$4,$5,$6,$7,$8,$9,$8,$10)`,
    [id, organizationId, caseId, advisorUserId, JSON.stringify(permissions), ownerId, status,
      new Date("2026-08-18T10:00:00Z"), expiresAt, status === "REVOKED" ? new Date("2026-08-18T11:00:00Z") : null],
  );
}

try {
  const users = [
    [ownerId, `owner-${suffix}@example.com`],
    [ownerBId, `ownerb-${suffix}@example.com`],
    [hrId, `hr-${suffix}@example.com`],
    [managerId, `manager-${suffix}@example.com`],
    [advisorId, `advisor-${suffix}@example.com`],
    [readOnlyAdvisorId, `readonly-${suffix}@example.com`],
    [expiredAdvisorId, `expired-${suffix}@example.com`],
    [outsiderId, `outsider-${suffix}@example.com`],
  ];
  for (const [userId, email] of users) {
    await pool.query(
      `INSERT INTO users(id,email_normalized,status,created_at,updated_at)
       VALUES ($1,$2,'active',$3,$3)`,
      [userId, email, new Date("2026-08-18T09:00:00Z")],
    );
  }

  await pool.query(
    `INSERT INTO organizations(id,type,legal_name,display_name,status,created_at,updated_at)
     VALUES ($1,'BUSINESS','Document Security A','Document Security A','ACTIVE',$3,$3),
            ($2,'BUSINESS','Document Security B','Document Security B','ACTIVE',$3,$3)`,
    [orgA, orgB, new Date("2026-08-18T09:10:00Z")],
  );
  await pool.query(
    `INSERT INTO organization_memberships
     (id,organization_id,user_id,role_key,status,scope,joined_at,removed_at,created_at,updated_at)
     VALUES
       ($1,$2,$3,'OWNER','ACTIVE','{}'::jsonb,$9,NULL,$9,$9),
       ($4,$2,$5,'HR_ADMIN','ACTIVE','{}'::jsonb,$9,NULL,$9,$9),
       ($6,$2,$7,'MANAGER','ACTIVE','{}'::jsonb,$9,NULL,$9,$9),
       ($8,$10,$11,'OWNER','ACTIVE','{}'::jsonb,$9,NULL,$9,$9)`,
    [
      `mem-owner-a-${suffix}`, orgA, ownerId,
      `mem-hr-a-${suffix}`, hrId,
      `mem-manager-a-${suffix}`, managerId,
      `mem-owner-b-${suffix}`, new Date("2026-08-18T09:20:00Z"), orgB, ownerBId,
    ],
  );
  await pool.query(
    `INSERT INTO business_cases
     (id,organization_id,title,summary,status,created_by_user_id,opened_by_user_id,created_at,updated_at,opened_at)
     VALUES ($1,$2,'Document Security Case A','org A','OPEN',$3,$3,$7,$7,$7),
            ($4,$5,'Document Security Case B','org B','OPEN',$6,$6,$7,$7,$7)`,
    [caseA, orgA, ownerId, caseB, orgB, ownerBId, new Date("2026-08-18T09:30:00Z")],
  );

  await insertGrant({
    id: fullGrantId,
    organizationId: orgA,
    caseId: caseA,
    advisorUserId: advisorId,
    permissions: ["case.read", "document.read", "document.review"],
    expiresAt: new Date("2026-09-18T00:00:00Z"),
  });
  await insertGrant({
    id: readOnlyGrantId,
    organizationId: orgA,
    caseId: caseA,
    advisorUserId: readOnlyAdvisorId,
    permissions: ["case.read", "document.read"],
    expiresAt: new Date("2026-09-18T00:00:00Z"),
  });
  await insertGrant({
    id: expiredGrantId,
    organizationId: orgA,
    caseId: caseA,
    advisorUserId: expiredAdvisorId,
    permissions: ["case.read", "document.read", "document.review"],
    expiresAt: new Date("2026-08-18T11:00:00Z"),
  });

  await assert.rejects(
    repo.createDocument({
      businessCaseId: caseA,
      actorUserId: managerId,
      title: "Manager must not create",
      documentKind: "OTHER",
      fileName: "manager.pdf",
      mimeType: "application/pdf",
      sizeBytes: 100,
      contentSha256: sha("manager"),
      storageObjectKey: `private/${caseA}/manager.pdf`,
    }),
    /business_case_document_not_found/,
  );

  const createdA = await repo.createDocument({
    businessCaseId: caseA,
    actorUserId: ownerId,
    title: "근로계약서 검토본",
    documentKind: "EMPLOYMENT_CONTRACT",
    fileName: "employment-contract-v1.pdf",
    mimeType: "application/pdf",
    sizeBytes: 4096,
    contentSha256: sha("case-a-v1"),
    storageObjectKey: `private/${caseA}/v1.pdf`,
  });
  assert.equal(createdA.document.status, "DRAFT");
  assert.equal(createdA.version.versionNo, 1);
  assert.equal("storageObjectKey" in createdA.version, false, "repository must not expose storage object pointers");

  const createdB = await repo.createDocument({
    businessCaseId: caseB,
    actorUserId: ownerBId,
    title: "다른 조직 문서",
    documentKind: "OTHER",
    fileName: "other-org.pdf",
    mimeType: "application/pdf",
    sizeBytes: 512,
    contentSha256: sha("case-b-v1"),
    storageObjectKey: `private/${caseB}/v1.pdf`,
  });

  const businessDocs = await repo.listForBusinessCase({ businessCaseId: caseA, actorUserId: hrId });
  assert.equal(businessDocs.length, 1);
  assert.equal(businessDocs[0].id, createdA.document.id);
  await assert.rejects(
    repo.listForBusinessCase({ businessCaseId: caseA, actorUserId: managerId }),
    /business_case_document_not_found/,
  );

  await assert.rejects(
    repo.transitionDocument({ documentId: createdA.document.id, actorUserId: ownerId, toStatus: "APPROVED" }),
    /business_case_document_transition_invalid/,
    "Business actors must never self-approve an Advisor review decision",
  );

  const submitted = await repo.transitionDocument({
    documentId: createdA.document.id,
    actorUserId: ownerId,
    toStatus: "IN_REVIEW",
  });
  assert.equal(submitted.status, "IN_REVIEW");

  const advisorDocs = await repo.listForAdvisor({ shareGrantId: fullGrantId, advisorUserId: advisorId });
  assert.equal(advisorDocs.length, 1);
  assert.equal(advisorDocs[0].id, createdA.document.id);
  await assert.rejects(
    repo.listForAdvisor({ shareGrantId: fullGrantId, advisorUserId: outsiderId }),
    /external_advisor_documents_not_found/,
  );
  await assert.rejects(
    repo.listVersionsForAdvisor({ shareGrantId: fullGrantId, advisorUserId: advisorId, documentId: createdB.document.id }),
    /external_advisor_documents_not_found/,
    "A grant for org A/case A must not read an org B document by ID",
  );
  await assert.rejects(
    repo.listForAdvisor({ shareGrantId: expiredGrantId, advisorUserId: expiredAdvisorId }),
    /external_advisor_documents_not_found/,
  );

  const readOnlyDocs = await repo.listForAdvisor({ shareGrantId: readOnlyGrantId, advisorUserId: readOnlyAdvisorId });
  assert.equal(readOnlyDocs.length, 1);
  await assert.rejects(
    repo.reviewDocument({
      shareGrantId: readOnlyGrantId,
      advisorUserId: readOnlyAdvisorId,
      documentId: createdA.document.id,
      versionId: createdA.version.id,
      decision: "CHANGES_REQUESTED",
      note: "읽기 전용 Grant",
    }),
    /external_advisor_documents_not_found/,
  );

  const changesRequested = await repo.reviewDocument({
    shareGrantId: fullGrantId,
    advisorUserId: advisorId,
    documentId: createdA.document.id,
    versionId: createdA.version.id,
    decision: "CHANGES_REQUESTED",
    note: "서명일과 근로시간 문구를 보완해 주세요.",
  });
  assert.equal(changesRequested.decision, "CHANGES_REQUESTED");
  assert.equal("reviewerUserId" in changesRequested, false);
  assert.equal("shareGrantId" in changesRequested, false);

  const versionTwo = await repo.addVersion({
    documentId: createdA.document.id,
    actorUserId: hrId,
    fileName: "employment-contract-v2.pdf",
    mimeType: "application/pdf",
    sizeBytes: 5000,
    contentSha256: sha("case-a-v2"),
    storageObjectKey: `private/${caseA}/v2.pdf`,
  });
  assert.equal(versionTwo.versionNo, 2);
  assert.equal("storageObjectKey" in versionTwo, false);

  await repo.transitionDocument({ documentId: createdA.document.id, actorUserId: ownerId, toStatus: "IN_REVIEW" });
  await assert.rejects(
    repo.reviewDocument({
      shareGrantId: fullGrantId,
      advisorUserId: advisorId,
      documentId: createdA.document.id,
      versionId: createdA.version.id,
      decision: "APPROVED",
    }),
    /external_advisor_document_version_not_current/,
    "Advisor review must bind to the current immutable version",
  );

  const approved = await repo.reviewDocument({
    shareGrantId: fullGrantId,
    advisorUserId: advisorId,
    documentId: createdA.document.id,
    versionId: versionTwo.id,
    decision: "APPROVED",
    note: "검토 완료",
  });
  assert.equal(approved.decision, "APPROVED");

  const reviews = await repo.listReviewsForBusiness({ documentId: createdA.document.id, actorUserId: ownerId });
  assert.deepEqual(reviews.map((review) => review.decision), ["CHANGES_REQUESTED", "APPROVED"]);
  const versions = await repo.listVersionsForBusiness({ documentId: createdA.document.id, actorUserId: ownerId });
  assert.deepEqual(versions.map((version) => version.versionNo), [2, 1]);
  assert.equal(versions.every((version) => !("storageObjectKey" in version)), true);

  const events = await repo.listEventsForBusiness({ documentId: createdA.document.id, actorUserId: ownerId });
  assert.equal(events.some((event) => event.eventType === "REVIEW_CHANGES_REQUESTED" && event.actorType === "ADVISOR"), true);
  assert.equal(events.some((event) => event.eventType === "REVIEW_APPROVED" && event.actorType === "ADVISOR"), true);

  const storagePointer = await pool.query(
    "SELECT storage_object_key FROM business_case_document_versions WHERE id=$1",
    [versionTwo.id],
  );
  assert.equal(storagePointer.rows[0].storage_object_key, `private/${caseA}/v2.pdf`, "storage pointer remains DB-only in Bundle 32");

  await pool.query(
    `INSERT INTO organization_memberships
     (id,organization_id,user_id,role_key,status,scope,joined_at,removed_at,created_at,updated_at)
     VALUES ($1,$2,$3,'EXTERNAL_ADVISOR','ACTIVE','{}'::jsonb,$4,NULL,$4,$4)`,
    [`mem-advisor-became-internal-${suffix}`, orgA, advisorId, fixedNow],
  );
  await assert.rejects(
    repo.listForAdvisor({ shareGrantId: fullGrantId, advisorUserId: advisorId }),
    /external_advisor_documents_not_found/,
    "An Advisor who becomes an active internal member must lose ShareGrant access",
  );
  await pool.query("UPDATE organization_memberships SET status='REMOVED',removed_at=$2,updated_at=$2 WHERE organization_id=$1 AND user_id=$3", [orgA, fixedNow, advisorId]);

  await pool.query(
    "UPDATE external_advisor_share_grants SET status='REVOKED',revoked_at=$2 WHERE id=$1",
    [fullGrantId, fixedNow],
  );
  await assert.rejects(
    repo.listForAdvisor({ shareGrantId: fullGrantId, advisorUserId: advisorId }),
    /external_advisor_documents_not_found/,
  );

  const advisorMemberships = await pool.query(
    `SELECT COUNT(*)::integer AS count FROM organization_memberships
     WHERE organization_id=$1 AND user_id IN ($2,$3,$4) AND status='ACTIVE'`,
    [orgA, advisorId, readOnlyAdvisorId, expiredAdvisorId],
  );
  assert.equal(advisorMemberships.rows[0].count, 0, "ShareGrant document access must never require or create active Membership");

  console.log("Business Case document security E2E passed: server-side ownership, OWNER/HR_ADMIN gate, exact Advisor identity, read/review permission split, cross-tenant isolation, immutable current-version review, internal-member/revoke/expiry cut-off and hidden storage pointers.");
} finally {
  await pool.end();
}
