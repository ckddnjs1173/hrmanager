import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createPostgresPool } from "../lib/postgres-client.js";
import { applyPostgresMigrations } from "../lib/postgres-migrations.js";
import { createBusinessCaseDocumentRepository } from "../lib/business-case-document-repo.js";
import { compareDocumentUploadMetadata } from "../lib/business-case-document-storage-contract.js";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");

const migrationPool = createPostgresPool({ applicationName: "insaya-document-storage-foundation-migrate" });
await applyPostgresMigrations(migrationPool, { logger: { log() {} } });
await applyPostgresMigrations(migrationPool, { logger: { log() {} } });
await migrationPool.end();

const pool = createPostgresPool({ applicationName: "insaya-document-storage-foundation-e2e" });
const suffix = crypto.randomUUID();
const now = new Date("2026-08-18T15:00:00Z");
const ownerId = `user-storage-owner-${suffix}`;
const advisorId = `user-storage-advisor-${suffix}`;
const orgId = `org-storage-${suffix}`;
const caseId = `bcase-storage-${suffix}`;
const grantId = `easg-storage-${suffix}`;
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const repo = createBusinessCaseDocumentRepository({ pool, now: () => new Date(now) });

try {
  await pool.query(
    `INSERT INTO users(id,email_normalized,status,created_at,updated_at)
     VALUES ($1,$2,'active',$5,$5),($3,$4,'active',$5,$5)`,
    [ownerId, `storage-owner-${suffix}@example.com`, advisorId, `storage-advisor-${suffix}@example.com`, now],
  );
  await pool.query(
    `INSERT INTO organizations(id,type,legal_name,display_name,status,created_at,updated_at)
     VALUES ($1,'BUSINESS','Storage Foundation Co','Storage Foundation Co','ACTIVE',$2,$2)`,
    [orgId, now],
  );
  await pool.query(
    `INSERT INTO organization_memberships
     (id,organization_id,user_id,role_key,status,joined_at,created_at,updated_at)
     VALUES ($1,$2,$3,'OWNER','ACTIVE',$4,$4,$4)`,
    [`membership-storage-owner-${suffix}`, orgId, ownerId, now],
  );
  await pool.query(
    `INSERT INTO business_cases
     (id,organization_id,title,summary,status,created_by_user_id,opened_by_user_id,created_at,updated_at,opened_at)
     VALUES ($1,$2,'Private storage foundation','No bytes are exposed','OPEN',$3,$3,$4,$4,$4)`,
    [caseId, orgId, ownerId, now],
  );
  await pool.query(
    `INSERT INTO external_advisor_share_grants
     (id,organization_id,resource_type,resource_id,advisor_user_id,permissions,created_by_user_id,status,created_at,expires_at,accepted_at,metadata)
     VALUES ($1,$2,'BUSINESS_CASE',$3,$4,$5,$6,'ACTIVE',$7,$8,$7,'{}'::jsonb)`,
    [grantId, orgId, caseId, advisorId, JSON.stringify(["case.read", "document.read"]), ownerId, now,
      new Date(now.getTime() + 7 * 86_400_000)],
  );

  const document = await repo.createDraft({
    caseId,
    actorUserId: ownerId,
    title: "Private storage test",
    documentKind: "EVIDENCE",
  });
  const version = await repo.addVersion({
    documentId: document.id,
    actorUserId: ownerId,
    fileName: "evidence.pdf",
    mimeType: "application/pdf",
    sizeBytes: 4096,
    contentSha256: hash(`storage-v1-${suffix}`),
  });

  const initial = await pool.query(
    `SELECT storage_state,scan_state,uploaded_at,verified_at,rejected_at,deletion_requested_at,deleted_at
       FROM business_case_document_versions WHERE id=$1`,
    [version.id],
  );
  assert.deepEqual(initial.rows[0], {
    storage_state: "METADATA_ONLY",
    scan_state: "NOT_SCANNED",
    uploaded_at: null,
    verified_at: null,
    rejected_at: null,
    deletion_requested_at: null,
    deleted_at: null,
  });

  await assert.rejects(
    pool.query(
      `UPDATE business_case_document_versions
          SET storage_state='VERIFIED',scan_state='CLEAN',uploaded_at=$2
        WHERE id=$1`,
      [version.id, now],
    ),
    /storage_lifecycle|violates check constraint/i,
    "VERIFIED must not be forgeable without verified_at",
  );

  const intentId = `bcdui-${suffix}`;
  const uploadToken = `upload-${crypto.randomBytes(32).toString("base64url")}`;
  const uploadTokenHash = hash(uploadToken);
  const issuedAt = new Date("2026-08-18T15:01:00Z");
  const expiresAt = new Date(issuedAt.getTime() + 15 * 60_000);
  await pool.query(
    `INSERT INTO business_case_document_upload_intents
     (id,version_id,requested_by_user_id,token_hash,status,expected_file_name,expected_mime_type,expected_size_bytes,expected_content_sha256,issued_at,expires_at,metadata)
     VALUES ($1,$2,$3,$4,'PENDING',$5,$6,$7,$8,$9,$10,'{}'::jsonb)`,
    [intentId, version.id, ownerId, uploadTokenHash, version.fileName, version.mimeType, version.sizeBytes, version.contentSha256, issuedAt, expiresAt],
  );
  await pool.query(
    `UPDATE business_case_document_versions
        SET storage_state='UPLOAD_PENDING'
      WHERE id=$1`,
    [version.id],
  );

  const intentColumns = await pool.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name='business_case_document_upload_intents'
      ORDER BY ordinal_position`,
  );
  const intentColumnNames = intentColumns.rows.map((row) => row.column_name);
  assert.equal(intentColumnNames.includes("token"), false, "raw upload capability token must never be stored");
  assert.equal(intentColumnNames.includes("token_hash"), true);
  const storedIntent = await pool.query("SELECT token_hash FROM business_case_document_upload_intents WHERE id=$1", [intentId]);
  assert.equal(storedIntent.rows[0].token_hash, uploadTokenHash);
  assert.notEqual(storedIntent.rows[0].token_hash, uploadToken);

  await assert.rejects(
    pool.query(
      `INSERT INTO business_case_document_upload_intents
       (id,version_id,requested_by_user_id,token_hash,status,expected_file_name,expected_mime_type,expected_size_bytes,expected_content_sha256,issued_at,expires_at,metadata)
       VALUES ($1,$2,$3,$4,'PENDING',$5,$6,$7,$8,$9,$10,'{}'::jsonb)`,
      [`bcdui-too-long-${suffix}`, version.id, ownerId, hash(`too-long-${suffix}`), version.fileName, version.mimeType,
        version.sizeBytes, version.contentSha256, issuedAt, new Date(issuedAt.getTime() + 31 * 60_000)],
    ),
    /max_ttl|violates check constraint/i,
    "upload intent must never exceed 30 minutes",
  );
  await assert.rejects(
    pool.query(
      `INSERT INTO business_case_document_upload_intents
       (id,version_id,requested_by_user_id,token_hash,status,expected_file_name,expected_mime_type,expected_size_bytes,expected_content_sha256,issued_at,expires_at,metadata)
       VALUES ($1,$2,$3,$4,'PENDING',$5,$6,$7,$8,$9,$10,'{}'::jsonb)`,
      [`bcdui-second-${suffix}`, version.id, ownerId, hash(`second-${suffix}`), version.fileName, version.mimeType,
        version.sizeBytes, version.contentSha256, issuedAt, expiresAt],
    ),
    /uq_business_case_document_upload_intent_pending|duplicate key/i,
    "only one live pending upload intent is allowed per immutable version",
  );

  const observedMismatch = compareDocumentUploadMetadata(version, {
    fileName: version.fileName,
    mimeType: version.mimeType,
    sizeBytes: version.sizeBytes + 1,
    contentSha256: version.contentSha256,
  });
  assert.equal(observedMismatch.match, false);
  assert.deepEqual(observedMismatch.mismatches, ["size_bytes"]);

  const verificationId = `bcdsv-${suffix}`;
  const uploadedAt = new Date("2026-08-18T15:03:00Z");
  await pool.query(
    `UPDATE business_case_document_upload_intents SET status='CONSUMED',consumed_at=$2 WHERE id=$1`,
    [intentId, uploadedAt],
  );
  await pool.query(
    `UPDATE business_case_document_versions
        SET storage_state='UPLOADED_UNVERIFIED',scan_state='PENDING',uploaded_at=$2
      WHERE id=$1`,
    [version.id, uploadedAt],
  );
  await pool.query(
    `INSERT INTO business_case_document_storage_verifications
     (id,version_id,upload_intent_id,observed_file_name,observed_mime_type,observed_size_bytes,observed_content_sha256,metadata_match,scan_state,scanner_name,created_at,completed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,'PENDING','test-scanner',$8,NULL)`,
    [verificationId, version.id, intentId, version.fileName, version.mimeType, version.sizeBytes, version.contentSha256, uploadedAt],
  );
  await assert.rejects(
    pool.query(
      `UPDATE business_case_document_versions
          SET storage_state='VERIFIED',scan_state='PENDING',verified_at=$2
        WHERE id=$1`,
      [version.id, new Date("2026-08-18T15:04:00Z")],
    ),
    /storage_lifecycle|violates check constraint/i,
    "PENDING scan must never unlock a download-ready VERIFIED state",
  );

  const verifiedAt = new Date("2026-08-18T15:05:00Z");
  await pool.query(
    `UPDATE business_case_document_storage_verifications
        SET scan_state='CLEAN',completed_at=$2
      WHERE id=$1`,
    [verificationId, verifiedAt],
  );
  await pool.query(
    `UPDATE business_case_document_versions
        SET storage_state='VERIFIED',scan_state='CLEAN',verified_at=$2
      WHERE id=$1`,
    [version.id, verifiedAt],
  );

  const downloadToken = `download-${crypto.randomBytes(32).toString("base64url")}`;
  const downloadGrantId = `bcddg-${suffix}`;
  const downloadIssuedAt = new Date("2026-08-18T15:06:00Z");
  await pool.query(
    `INSERT INTO business_case_document_download_grants
     (id,version_id,grantee_user_id,actor_type,share_grant_id,token_hash,status,issued_at,expires_at)
     VALUES ($1,$2,$3,'ADVISOR',$4,$5,'ACTIVE',$6,$7)`,
    [downloadGrantId, version.id, advisorId, grantId, hash(downloadToken), downloadIssuedAt,
      new Date(downloadIssuedAt.getTime() + 2 * 60_000)],
  );
  const downloadColumns = await pool.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name='business_case_document_download_grants'
      ORDER BY ordinal_position`,
  );
  const downloadColumnNames = downloadColumns.rows.map((row) => row.column_name);
  assert.equal(downloadColumnNames.includes("token"), false, "raw download capability token must never be stored");
  assert.equal(downloadColumnNames.includes("url"), false, "download URL must not be persisted in the control plane");

  await assert.rejects(
    pool.query(
      `INSERT INTO business_case_document_download_grants
       (id,version_id,grantee_user_id,actor_type,share_grant_id,token_hash,status,issued_at,expires_at)
       VALUES ($1,$2,$3,'ADVISOR',$4,$5,'ACTIVE',$6,$7)`,
      [`bcddg-too-long-${suffix}`, version.id, advisorId, grantId, hash(`download-long-${suffix}`), downloadIssuedAt,
        new Date(downloadIssuedAt.getTime() + 6 * 60_000)],
    ),
    /max_ttl|violates check constraint/i,
    "download capability must never exceed five minutes",
  );
  await assert.rejects(
    pool.query(
      `INSERT INTO business_case_document_download_grants
       (id,version_id,grantee_user_id,actor_type,share_grant_id,token_hash,status,issued_at,expires_at)
       VALUES ($1,$2,$3,'ADVISOR',NULL,$4,'ACTIVE',$5,$6)`,
      [`bcddg-no-share-${suffix}`, version.id, advisorId, hash(`download-no-share-${suffix}`), downloadIssuedAt,
        new Date(downloadIssuedAt.getTime() + 60_000)],
    ),
    /violates check constraint/i,
    "Advisor download capability must remain bound to a ShareGrant",
  );

  const deletionId = `bcddr-${suffix}`;
  const deletionRequestedAt = new Date("2026-08-18T15:10:00Z");
  await pool.query(
    `INSERT INTO business_case_document_deletion_requests
     (id,version_id,requested_by_user_id,reason,status,requested_at)
     VALUES ($1,$2,$3,'retention expired','PENDING',$4)`,
    [deletionId, version.id, ownerId, deletionRequestedAt],
  );
  await pool.query(
    `UPDATE business_case_document_versions
        SET storage_state='DELETION_PENDING',deletion_requested_at=$2
      WHERE id=$1`,
    [version.id, deletionRequestedAt],
  );
  await assert.rejects(
    pool.query(
      `INSERT INTO business_case_document_deletion_requests
       (id,version_id,requested_by_user_id,reason,status,requested_at)
       VALUES ($1,$2,$3,'duplicate deletion','PENDING',$4)`,
      [`bcddr-second-${suffix}`, version.id, ownerId, deletionRequestedAt],
    ),
    /uq_business_case_document_deletion_pending|duplicate key/i,
  );
  const deletedAt = new Date("2026-08-18T15:11:00Z");
  await pool.query(
    `UPDATE business_case_document_deletion_requests SET status='COMPLETED',completed_at=$2 WHERE id=$1`,
    [deletionId, deletedAt],
  );
  await pool.query(
    `UPDATE business_case_document_versions
        SET storage_state='DELETED',deleted_at=$2
      WHERE id=$1`,
    [version.id, deletedAt],
  );

  const forbiddenColumns = await pool.query(
    `SELECT table_name,column_name FROM information_schema.columns
      WHERE table_name IN (
        'business_case_document_upload_intents',
        'business_case_document_storage_verifications',
        'business_case_document_download_grants',
        'business_case_document_deletion_requests',
        'business_case_document_storage_events'
      )
      AND lower(column_name) ~ '(url|credential|secret_access|access_key)'`,
  );
  assert.deepEqual(forbiddenColumns.rows, [], "storage control plane must not persist provider URLs or credentials");

  console.log("Business Case private document storage foundation E2E passed: idempotent migrations, state integrity, hashed capabilities, bounded TTLs, metadata verification, CLEAN-only verification, ShareGrant-bound Advisor downloads and deletion lifecycle are enforced without exposing bytes or provider URLs.");
} finally {
  await pool.end();
}
