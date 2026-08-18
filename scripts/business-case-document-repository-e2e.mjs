import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createPostgresPool } from "../lib/postgres-client.js";
import { applyPostgresMigrations } from "../lib/postgres-migrations.js";
import { createBusinessCaseDocumentRepository } from "../lib/business-case-document-repo.js";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");

const migrationPool = createPostgresPool({ applicationName: "insaya-business-case-document-repository-migrate" });
await applyPostgresMigrations(migrationPool, { logger: { log() {} } });
await migrationPool.end();

const pool = createPostgresPool({ applicationName: "insaya-business-case-document-repository-e2e" });
const suffix = crypto.randomUUID();
const ownerId = `user-docrepo-owner-${suffix}`;
const hrId = `user-docrepo-hr-${suffix}`;
const managerId = `user-docrepo-manager-${suffix}`;
const readAdvisorId = `user-docrepo-read-advisor-${suffix}`;
const reviewAdvisorId = `user-docrepo-review-advisor-${suffix}`;
const caseOnlyAdvisorId = `user-docrepo-case-advisor-${suffix}`;
const expiredAdvisorId = `user-docrepo-expired-advisor-${suffix}`;
const otherCaseAdvisorId = `user-docrepo-othercase-advisor-${suffix}`;
const outsiderId = `user-docrepo-outsider-${suffix}`;
const orgId = `org-docrepo-${suffix}`;
const otherOrgId = `org-docrepo-other-${suffix}`;
const caseId = `bcase-docrepo-${suffix}`;
const otherCaseId = `bcase-docrepo-other-${suffix}`;
const createdAt = new Date("2026-08-18T03:00:00Z");
let current = new Date(createdAt);
const now = () => new Date(current);
const repo = createBusinessCaseDocumentRepository({ pool, now });

const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");

async function createUser(userId, emailPrefix) {
  await pool.query(
    `INSERT INTO users(id,email_normalized,status,created_at,updated_at)
     VALUES ($1,$2,'active',$3,$3)`,
    [userId, `${emailPrefix}-${suffix}@example.com`, createdAt],
  );
}

async function createMembership({ membershipId, organizationId, userId, roleKey }) {
  await pool.query(
    `INSERT INTO organization_memberships
     (id,organization_id,user_id,role_key,status,joined_at,created_at,updated_at)
     VALUES ($1,$2,$3,$4,'ACTIVE',$5,$5,$5)`,
    [membershipId, organizationId, userId, roleKey, createdAt],
  );
}

async function createGrant({
  id,
  organizationId = orgId,
  resourceId = caseId,
  advisorUserId,
  permissions,
  status = "ACTIVE",
  expiresAt = "2026-09-18T03:00:00Z",
  acceptedAt = "2026-08-18T03:01:00Z",
  revokedAt = null,
} = {}) {
  await pool.query(
    `INSERT INTO external_advisor_share_grants
     (id,organization_id,resource_type,resource_id,advisor_user_id,permissions,created_by_user_id,status,created_at,expires_at,accepted_at,revoked_at,revoked_by_user_id,metadata)
     VALUES ($1,$2,'BUSINESS_CASE',$3,$4,$5,$6,$7,$8,$9,$10,$11,NULL,'{}'::jsonb)`,
    [id, organizationId, resourceId, advisorUserId, JSON.stringify(permissions), ownerId, status,
      createdAt, expiresAt, status === "ACTIVE" ? acceptedAt : null, revokedAt],
  );
}

try {
  for (const [userId, emailPrefix] of [
    [ownerId, "docrepo-owner"],
    [hrId, "docrepo-hr"],
    [managerId, "docrepo-manager"],
    [readAdvisorId, "docrepo-read-advisor"],
    [reviewAdvisorId, "docrepo-review-advisor"],
    [caseOnlyAdvisorId, "docrepo-case-advisor"],
    [expiredAdvisorId, "docrepo-expired-advisor"],
    [otherCaseAdvisorId, "docrepo-othercase-advisor"],
    [outsiderId, "docrepo-outsider"],
  ]) {
    await createUser(userId, emailPrefix);
  }

  await pool.query(
    `INSERT INTO organizations(id,type,legal_name,display_name,status,created_at,updated_at)
     VALUES
       ($1,'BUSINESS','Document Repo Co','Document Repo Co','ACTIVE',$3,$3),
       ($2,'BUSINESS','Other Document Repo Co','Other Document Repo Co','ACTIVE',$3,$3)`,
    [orgId, otherOrgId, createdAt],
  );
  await createMembership({ membershipId: `membership-owner-${suffix}`, organizationId: orgId, userId: ownerId, roleKey: "OWNER" });
  await createMembership({ membershipId: `membership-hr-${suffix}`, organizationId: orgId, userId: hrId, roleKey: "HR_ADMIN" });
  await createMembership({ membershipId: `membership-manager-${suffix}`, organizationId: orgId, userId: managerId, roleKey: "MANAGER" });
  await createMembership({ membershipId: `membership-other-owner-${suffix}`, organizationId: otherOrgId, userId: ownerId, roleKey: "OWNER" });

  await pool.query(
    `INSERT INTO business_cases
     (id,organization_id,title,summary,status,created_by_user_id,opened_by_user_id,created_at,updated_at,opened_at)
     VALUES
       ($1,$2,'Primary Document Review','Repository security E2E','OPEN',$3,$3,$5,$5,$5),
       ($4,$6,'Other Document Review','Cross-case guard','OPEN',$3,$3,$5,$5,$5)`,
    [caseId, orgId, ownerId, otherCaseId, createdAt, otherOrgId],
  );

  await assert.rejects(
    () => repo.createDraft({ caseId, actorUserId: managerId, title: "Manager denied", documentKind: "NOTICE" }),
    /business_case_document_management_role_required/,
  );
  await assert.rejects(
    () => repo.createDraft({ caseId, actorUserId: outsiderId, title: "Non-member denied", documentKind: "NOTICE" }),
    /business_case_document_management_membership_required/,
  );

  const emptyDraft = await repo.createDraft({ caseId, actorUserId: ownerId, title: "버전 없는 문서", documentKind: "OTHER" });
  await assert.rejects(
    () => repo.submitForReview({ documentId: emptyDraft.id, actorUserId: ownerId }),
    /business_case_document_version_required/,
  );

  current = new Date("2026-08-18T03:10:00Z");
  const draft = await repo.createDraft({
    caseId,
    actorUserId: ownerId,
    title: "근로계약서 검토본",
    documentKind: "EMPLOYMENT_CONTRACT",
  });
  assert.equal(draft.status, "DRAFT");
  assert.equal(draft.businessCaseId, caseId);

  const versionOne = await repo.addVersion({
    documentId: draft.id,
    actorUserId: hrId,
    fileName: "employment-contract.pdf",
    mimeType: "application/pdf",
    sizeBytes: 4096,
    contentSha256: sha(`v1-${suffix}`),
  });
  assert.equal(versionOne.versionNo, 1);
  assert.equal(Object.hasOwn(versionOne, "storageObjectKey"), false);
  assert.equal(Object.values(versionOne).some((value) => String(value).includes("business-case-documents/")), false);

  await assert.rejects(
    () => repo.addVersion({
      documentId: draft.id,
      actorUserId: hrId,
      fileName: "employment-contract-copy.pdf",
      mimeType: "application/pdf",
      sizeBytes: 4096,
      contentSha256: sha(`v1-${suffix}`),
    }),
    /business_case_document_version_duplicate/,
  );

  const businessRead = await repo.getForBusiness({ documentId: draft.id, actorUserId: ownerId });
  assert.equal(businessRead.versions.length, 1);
  assert.equal(Object.hasOwn(businessRead.versions[0], "storageObjectKey"), false);
  await assert.rejects(
    () => repo.getForBusiness({ documentId: draft.id, actorUserId: managerId }),
    /business_case_document_management_role_required/,
  );

  const readGrantId = `grant-docread-${suffix}`;
  const reviewGrantId = `grant-docreview-${suffix}`;
  const caseOnlyGrantId = `grant-caseonly-${suffix}`;
  const expiredGrantId = `grant-expired-${suffix}`;
  const otherCaseGrantId = `grant-othercase-${suffix}`;
  await createGrant({ id: readGrantId, advisorUserId: readAdvisorId, permissions: ["case.read", "document.read"] });
  await createGrant({ id: reviewGrantId, advisorUserId: reviewAdvisorId, permissions: ["case.read", "document.read", "document.review"] });
  await createGrant({ id: caseOnlyGrantId, advisorUserId: caseOnlyAdvisorId, permissions: ["case.read"] });
  await createGrant({
    id: expiredGrantId,
    advisorUserId: expiredAdvisorId,
    permissions: ["case.read", "document.read"],
    expiresAt: "2026-08-18T03:09:59Z",
  });
  await createGrant({
    id: otherCaseGrantId,
    organizationId: otherOrgId,
    resourceId: otherCaseId,
    advisorUserId: otherCaseAdvisorId,
    permissions: ["case.read", "document.read", "document.review"],
  });

  assert.deepEqual(await repo.listForAdvisor({ grantId: readGrantId, advisorUserId: readAdvisorId }), []);
  await assert.rejects(
    () => repo.listForAdvisor({ grantId: caseOnlyGrantId, advisorUserId: caseOnlyAdvisorId }),
    /business_case_document_advisor_not_found/,
  );
  await assert.rejects(
    () => repo.listForAdvisor({ grantId: readGrantId, advisorUserId: outsiderId }),
    /business_case_document_advisor_not_found/,
  );
  await assert.rejects(
    () => repo.listForAdvisor({ grantId: expiredGrantId, advisorUserId: expiredAdvisorId }),
    /business_case_document_advisor_not_found/,
  );

  current = new Date("2026-08-18T03:20:00Z");
  const submitted = await repo.submitForReview({ documentId: draft.id, actorUserId: hrId });
  assert.equal(submitted.status, "IN_REVIEW");
  await assert.rejects(
    () => repo.addVersion({
      documentId: draft.id,
      actorUserId: ownerId,
      fileName: "should-not-write.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1,
      contentSha256: sha(`forbidden-${suffix}`),
    }),
    /business_case_document_version_state_invalid/,
  );

  const advisorList = await repo.listForAdvisor({ grantId: readGrantId, advisorUserId: readAdvisorId });
  assert.equal(advisorList.length, 1);
  assert.equal(advisorList[0].id, draft.id);
  const advisorRead = await repo.getForAdvisor({ grantId: readGrantId, advisorUserId: readAdvisorId, documentId: draft.id });
  assert.equal(advisorRead.document.title, "근로계약서 검토본");
  assert.equal(advisorRead.versions.length, 1);
  assert.equal(Object.hasOwn(advisorRead.versions[0], "createdByUserId"), false);
  assert.equal(Object.hasOwn(advisorRead.versions[0], "storageObjectKey"), false);
  assert.equal(JSON.stringify(advisorRead).includes("business-case-documents/"), false);

  await assert.rejects(
    () => repo.getForAdvisor({ grantId: otherCaseGrantId, advisorUserId: otherCaseAdvisorId, documentId: draft.id }),
    /business_case_document_advisor_not_found/,
  );
  await assert.rejects(
    () => repo.reviewForAdvisor({ grantId: readGrantId, advisorUserId: readAdvisorId, documentId: draft.id, decision: "APPROVED" }),
    /business_case_document_advisor_not_found/,
  );

  const changeRequest = await repo.reviewForAdvisor({
    grantId: reviewGrantId,
    advisorUserId: reviewAdvisorId,
    documentId: draft.id,
    decision: "CHANGES_REQUESTED",
    note: "근무장소 문구를 확인해 주세요.",
  });
  assert.equal(changeRequest.decision, "CHANGES_REQUESTED");

  const afterChanges = await repo.getForBusiness({ documentId: draft.id, actorUserId: ownerId });
  assert.equal(afterChanges.document.status, "CHANGES_REQUESTED");
  assert.equal(afterChanges.reviews.length, 1);

  current = new Date("2026-08-18T03:30:00Z");
  const versionTwo = await repo.addVersion({
    documentId: draft.id,
    actorUserId: ownerId,
    fileName: "employment-contract-v2.pdf",
    mimeType: "application/pdf",
    sizeBytes: 5120,
    contentSha256: sha(`v2-${suffix}`),
  });
  assert.equal(versionTwo.versionNo, 2);
  await repo.submitForReview({ documentId: draft.id, actorUserId: ownerId });

  current = new Date("2026-08-18T03:40:00Z");
  const approval = await repo.reviewForAdvisor({
    grantId: reviewGrantId,
    advisorUserId: reviewAdvisorId,
    documentId: draft.id,
    decision: "APPROVED",
    note: "검토 완료",
  });
  assert.equal(approval.decision, "APPROVED");
  const approved = await repo.getForBusiness({ documentId: draft.id, actorUserId: hrId });
  assert.equal(approved.document.status, "APPROVED");
  assert.deepEqual(approved.versions.map((version) => version.versionNo), [1, 2]);
  assert.deepEqual(approved.reviews.map((review) => review.decision), ["CHANGES_REQUESTED", "APPROVED"]);
  await assert.rejects(
    () => repo.reviewForAdvisor({ grantId: reviewGrantId, advisorUserId: reviewAdvisorId, documentId: draft.id, decision: "APPROVED" }),
    /business_case_document_advisor_not_found/,
  );

  const events = await repo.listEventsForBusiness({ documentId: draft.id, actorUserId: ownerId });
  assert.deepEqual(events.map((event) => event.eventType), [
    "CREATED",
    "VERSION_ADDED",
    "SUBMITTED_FOR_REVIEW",
    "REVIEW_CHANGES_REQUESTED",
    "VERSION_ADDED",
    "SUBMITTED_FOR_REVIEW",
    "REVIEW_APPROVED",
  ]);
  assert.equal(events.filter((event) => event.actorType === "ADVISOR").every((event) => event.shareGrantId === reviewGrantId), true);

  const withdrawDraft = await repo.createDraft({ caseId, actorUserId: ownerId, title: "철회 문서", documentKind: "NOTICE" });
  const withdrawn = await repo.withdraw({ documentId: withdrawDraft.id, actorUserId: hrId });
  assert.equal(withdrawn.status, "WITHDRAWN");
  const advisorAfterWithdraw = await repo.listForAdvisor({ grantId: readGrantId, advisorUserId: readAdvisorId });
  assert.equal(advisorAfterWithdraw.some((item) => item.id === withdrawDraft.id), false);

  await createMembership({
    membershipId: `membership-read-advisor-internal-${suffix}`,
    organizationId: orgId,
    userId: readAdvisorId,
    roleKey: "EMPLOYEE",
  });
  await assert.rejects(
    () => repo.listForAdvisor({ grantId: readGrantId, advisorUserId: readAdvisorId }),
    /business_case_document_advisor_not_found/,
  );

  console.log("Business Case document repository PostgreSQL E2E passed: tenant ownership, management RBAC, exact advisor identity, one-live-grant semantics, live ShareGrant permissions, review lifecycle and storage-key non-disclosure are enforced.");
} finally {
  await pool.end();
}
