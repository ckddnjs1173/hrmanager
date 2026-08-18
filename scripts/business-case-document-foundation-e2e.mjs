import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createPostgresPool } from "../lib/postgres-client.js";
import { applyPostgresMigrations } from "../lib/postgres-migrations.js";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");

const migrationPool = createPostgresPool({ applicationName: "insaya-business-case-document-foundation-migrate" });
await applyPostgresMigrations(migrationPool, { logger: { log() {} } });
await migrationPool.end();

const pool = createPostgresPool({ applicationName: "insaya-business-case-document-foundation-e2e" });
const suffix = crypto.randomUUID();
const ownerId = `user-doc-owner-${suffix}`;
const advisorId = `user-doc-advisor-${suffix}`;
const orgId = `org-doc-${suffix}`;
const caseId = `bcase-doc-${suffix}`;
const grantId = `easg-doc-${suffix}`;
const documentId = `bcdoc-${suffix}`;
const versionOneId = `bcdocv1-${suffix}`;
const versionTwoId = `bcdocv2-${suffix}`;
const createdAt = new Date("2026-08-18T00:00:00Z");
const openedAt = new Date("2026-08-18T00:10:00Z");
const acceptedAt = new Date("2026-08-18T00:20:00Z");
const expiresAt = new Date("2026-09-18T00:00:00Z");
const shaOne = crypto.createHash("sha256").update(`document-one-${suffix}`).digest("hex");
const shaTwo = crypto.createHash("sha256").update(`document-two-${suffix}`).digest("hex");

try {
  await pool.query(
    `INSERT INTO users(id,email_normalized,status,created_at,updated_at)
     VALUES ($1,$2,'active',$5,$5),($3,$4,'active',$5,$5)`,
    [ownerId, `doc-owner-${suffix}@example.com`, advisorId, `doc-advisor-${suffix}@example.com`, createdAt],
  );
  await pool.query(
    `INSERT INTO organizations(id,type,legal_name,display_name,status,created_at,updated_at)
     VALUES ($1,'BUSINESS','Document Foundation Co','Document Foundation Co','ACTIVE',$2,$2)`,
    [orgId, createdAt],
  );
  await pool.query(
    `INSERT INTO business_cases
     (id,organization_id,title,summary,status,created_by_user_id,opened_by_user_id,created_at,updated_at,opened_at)
     VALUES ($1,$2,'Document Review Case','foundation e2e','OPEN',$3,$3,$4,$5,$5)`,
    [caseId, orgId, ownerId, createdAt, openedAt],
  );
  await pool.query(
    `INSERT INTO external_advisor_share_grants
     (id,organization_id,resource_type,resource_id,advisor_user_id,permissions,created_by_user_id,status,created_at,expires_at,accepted_at)
     VALUES ($1,$2,'BUSINESS_CASE',$3,$4,$5,$6,'ACTIVE',$7,$8,$9)`,
    [grantId, orgId, caseId, advisorId, JSON.stringify(["case.read", "document.read", "document.review"]), ownerId, createdAt, expiresAt, acceptedAt],
  );

  const document = await pool.query(
    `INSERT INTO business_case_documents
     (id,business_case_id,title,document_kind,status,created_by_user_id,created_at,updated_at)
     VALUES ($1,$2,'근로계약서 검토본','EMPLOYMENT_CONTRACT','DRAFT',$3,$4,$4)
     RETURNING *`,
    [documentId, caseId, ownerId, createdAt],
  );
  assert.equal(document.rows[0].status, "DRAFT");

  await assert.rejects(
    () => pool.query(
      `INSERT INTO business_case_documents
       (id,business_case_id,title,document_kind,status,created_by_user_id,created_at,updated_at)
       VALUES ($1,$2,'Bad','SALARY_EXPORT','DRAFT',$3,$4,$4)`,
      [`bad-kind-${suffix}`, caseId, ownerId, createdAt],
    ),
    (error) => error?.code === "23514",
  );

  const versionOne = await pool.query(
    `INSERT INTO business_case_document_versions
     (id,document_id,version_no,file_name,mime_type,size_bytes,content_sha256,storage_object_key,created_by_user_id,created_at)
     VALUES ($1,$2,1,'employment-contract.pdf','application/pdf',4096,$3,$4,$5,$6)
     RETURNING *`,
    [versionOneId, documentId, shaOne, `business-case-documents/${documentId}/${versionOneId}`, ownerId, createdAt],
  );
  assert.equal(versionOne.rows[0].version_no, 1);
  assert.equal(versionOne.rows[0].content_sha256, shaOne);

  const invalidVersions = [
    {
      id: `bad-path-${suffix}`,
      fileName: "../secret.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1,
      sha: crypto.createHash("sha256").update(`bad-path-${suffix}`).digest("hex"),
    },
    {
      id: `bad-mime-${suffix}`,
      fileName: "payload.exe",
      mimeType: "application/octet-stream",
      sizeBytes: 1,
      sha: crypto.createHash("sha256").update(`bad-mime-${suffix}`).digest("hex"),
    },
    {
      id: `too-large-${suffix}`,
      fileName: "large.pdf",
      mimeType: "application/pdf",
      sizeBytes: 10485761,
      sha: crypto.createHash("sha256").update(`too-large-${suffix}`).digest("hex"),
    },
    {
      id: `bad-sha-${suffix}`,
      fileName: "bad-sha.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1,
      sha: "not-a-sha",
    },
  ];
  for (const candidate of invalidVersions) {
    await assert.rejects(
      () => pool.query(
        `INSERT INTO business_case_document_versions
         (id,document_id,version_no,file_name,mime_type,size_bytes,content_sha256,storage_object_key,created_by_user_id,created_at)
         VALUES ($1,$2,2,$3,$4,$5,$6,$7,$8,$9)`,
        [candidate.id, documentId, candidate.fileName, candidate.mimeType, candidate.sizeBytes, candidate.sha,
          `business-case-documents/${documentId}/${candidate.id}`, ownerId, createdAt],
      ),
      (error) => error?.code === "23514",
    );
  }

  await assert.rejects(
    () => pool.query(
      `INSERT INTO business_case_document_versions
       (id,document_id,version_no,file_name,mime_type,size_bytes,content_sha256,storage_object_key,created_by_user_id,created_at)
       VALUES ($1,$2,1,'duplicate-version.pdf','application/pdf',1,$3,$4,$5,$6)`,
      [`duplicate-version-${suffix}`, documentId, shaTwo, `business-case-documents/${documentId}/duplicate-version`, ownerId, createdAt],
    ),
    (error) => error?.code === "23505",
  );
  await assert.rejects(
    () => pool.query(
      `INSERT INTO business_case_document_versions
       (id,document_id,version_no,file_name,mime_type,size_bytes,content_sha256,storage_object_key,created_by_user_id,created_at)
       VALUES ($1,$2,2,'duplicate-content.pdf','application/pdf',1,$3,$4,$5,$6)`,
      [`duplicate-content-${suffix}`, documentId, shaOne, `business-case-documents/${documentId}/duplicate-content`, ownerId, createdAt],
    ),
    (error) => error?.code === "23505",
  );

  await pool.query(
    `INSERT INTO business_case_document_events
     (id,document_id,actor_user_id,actor_type,event_type,metadata,created_at)
     VALUES ($1,$2,$3,'BUSINESS','CREATED','{}'::jsonb,$4),
            ($5,$2,$3,'BUSINESS','VERSION_ADDED',$6,$4)`,
    [`doc-event-created-${suffix}`, documentId, ownerId, createdAt,
      `doc-event-version1-${suffix}`, JSON.stringify({ versionId: versionOneId })],
  );

  await pool.query("UPDATE business_case_documents SET status='IN_REVIEW',updated_at=$2 WHERE id=$1", [documentId, openedAt]);
  await pool.query(
    `INSERT INTO business_case_document_events
     (id,document_id,actor_user_id,actor_type,event_type,metadata,created_at)
     VALUES ($1,$2,$3,'BUSINESS','SUBMITTED_FOR_REVIEW',$4,$5)`,
    [`doc-event-submit1-${suffix}`, documentId, ownerId, JSON.stringify({ versionId: versionOneId }), openedAt],
  );

  await assert.rejects(
    () => pool.query(
      `INSERT INTO business_case_document_reviews
       (id,document_id,version_id,share_grant_id,reviewer_user_id,decision,review_note,created_at)
       VALUES ($1,$2,$3,$4,$5,'CHANGES_REQUESTED','   ',$6)`,
      [`bad-empty-review-${suffix}`, documentId, versionOneId, grantId, advisorId, acceptedAt],
    ),
    (error) => error?.code === "23514",
  );

  const reviewOneId = `bcdocr1-${suffix}`;
  await pool.query(
    `INSERT INTO business_case_document_reviews
     (id,document_id,version_id,share_grant_id,reviewer_user_id,decision,review_note,created_at)
     VALUES ($1,$2,$3,$4,$5,'CHANGES_REQUESTED','서명일자를 확인해 주세요.',$6)`,
    [reviewOneId, documentId, versionOneId, grantId, advisorId, acceptedAt],
  );
  await pool.query("UPDATE business_case_documents SET status='CHANGES_REQUESTED',updated_at=$2 WHERE id=$1", [documentId, acceptedAt]);
  await pool.query(
    `INSERT INTO business_case_document_events
     (id,document_id,actor_user_id,actor_type,share_grant_id,event_type,metadata,created_at)
     VALUES ($1,$2,$3,'ADVISOR',$4,'REVIEW_CHANGES_REQUESTED',$5,$6)`,
    [`doc-event-changes-${suffix}`, documentId, advisorId, grantId, JSON.stringify({ reviewId: reviewOneId, versionId: versionOneId }), acceptedAt],
  );

  const revisedAt = new Date("2026-08-18T01:00:00Z");
  await pool.query(
    `INSERT INTO business_case_document_versions
     (id,document_id,version_no,file_name,mime_type,size_bytes,content_sha256,storage_object_key,created_by_user_id,created_at)
     VALUES ($1,$2,2,'employment-contract-v2.pdf','application/pdf',5000,$3,$4,$5,$6)`,
    [versionTwoId, documentId, shaTwo, `business-case-documents/${documentId}/${versionTwoId}`, ownerId, revisedAt],
  );
  await pool.query("UPDATE business_case_documents SET status='IN_REVIEW',updated_at=$2 WHERE id=$1", [documentId, revisedAt]);
  await pool.query(
    `INSERT INTO business_case_document_events
     (id,document_id,actor_user_id,actor_type,event_type,metadata,created_at)
     VALUES ($1,$2,$3,'BUSINESS','VERSION_ADDED',$4,$5),
            ($6,$2,$3,'BUSINESS','SUBMITTED_FOR_REVIEW',$7,$5)`,
    [`doc-event-version2-${suffix}`, documentId, ownerId, JSON.stringify({ versionId: versionTwoId }), revisedAt,
      `doc-event-submit2-${suffix}`, JSON.stringify({ versionId: versionTwoId })],
  );

  const approvedAt = new Date("2026-08-18T02:00:00Z");
  const reviewTwoId = `bcdocr2-${suffix}`;
  await pool.query(
    `INSERT INTO business_case_document_reviews
     (id,document_id,version_id,share_grant_id,reviewer_user_id,decision,review_note,created_at)
     VALUES ($1,$2,$3,$4,$5,'APPROVED','검토 완료',$6)`,
    [reviewTwoId, documentId, versionTwoId, grantId, advisorId, approvedAt],
  );
  await pool.query("UPDATE business_case_documents SET status='APPROVED',updated_at=$2 WHERE id=$1", [documentId, approvedAt]);
  await pool.query(
    `INSERT INTO business_case_document_events
     (id,document_id,actor_user_id,actor_type,share_grant_id,event_type,metadata,created_at)
     VALUES ($1,$2,$3,'ADVISOR',$4,'REVIEW_APPROVED',$5,$6)`,
    [`doc-event-approved-${suffix}`, documentId, advisorId, grantId, JSON.stringify({ reviewId: reviewTwoId, versionId: versionTwoId }), approvedAt],
  );

  await assert.rejects(
    () => pool.query(
      `INSERT INTO business_case_document_reviews
       (id,document_id,version_id,share_grant_id,reviewer_user_id,decision,review_note,created_at)
       VALUES ($1,$2,$3,$4,$5,'APPROVED','duplicate',$6)`,
      [`duplicate-review-${suffix}`, documentId, versionTwoId, grantId, advisorId, approvedAt],
    ),
    (error) => error?.code === "23505",
  );

  await assert.rejects(
    () => pool.query(
      `INSERT INTO business_case_document_events
       (id,document_id,actor_user_id,actor_type,share_grant_id,event_type,metadata,created_at)
       VALUES ($1,$2,$3,'BUSINESS',$4,'VERSION_ADDED','{}'::jsonb,$5)`,
      [`bad-business-grant-event-${suffix}`, documentId, ownerId, grantId, approvedAt],
    ),
    (error) => error?.code === "23514",
  );
  await assert.rejects(
    () => pool.query(
      `INSERT INTO business_case_document_events
       (id,document_id,actor_user_id,actor_type,event_type,metadata,created_at)
       VALUES ($1,$2,$3,'BUSINESS','REVIEW_APPROVED','{}'::jsonb,$4)`,
      [`bad-business-review-event-${suffix}`, documentId, ownerId, approvedAt],
    ),
    (error) => error?.code === "23514",
  );

  const finalDocument = await pool.query("SELECT status FROM business_case_documents WHERE id=$1", [documentId]);
  assert.equal(finalDocument.rows[0].status, "APPROVED");
  const versions = await pool.query(
    "SELECT version_no,content_sha256 FROM business_case_document_versions WHERE document_id=$1 ORDER BY version_no ASC",
    [documentId],
  );
  assert.deepEqual(versions.rows.map((row) => Number(row.version_no)), [1, 2]);
  const reviews = await pool.query(
    "SELECT decision,review_note FROM business_case_document_reviews WHERE document_id=$1 ORDER BY created_at ASC",
    [documentId],
  );
  assert.deepEqual(reviews.rows.map((row) => row.decision), ["CHANGES_REQUESTED", "APPROVED"]);
  const events = await pool.query(
    "SELECT event_type,actor_type FROM business_case_document_events WHERE document_id=$1 ORDER BY created_at ASC,id ASC",
    [documentId],
  );
  assert.deepEqual(events.rows.map((row) => row.event_type), [
    "CREATED",
    "VERSION_ADDED",
    "SUBMITTED_FOR_REVIEW",
    "REVIEW_CHANGES_REQUESTED",
    "VERSION_ADDED",
    "SUBMITTED_FOR_REVIEW",
    "REVIEW_APPROVED",
  ]);

  console.log("Business Case document foundation PostgreSQL E2E passed: bounded metadata, immutable versions, advisor review decisions and append-only audit constraints.");
} finally {
  await pool.end();
}
