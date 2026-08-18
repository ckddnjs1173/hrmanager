import crypto from "node:crypto";
import { getRuntimePostgresPool } from "./runtime-postgres.js";
import { withPostgresTransaction } from "./postgres-client.js";
import {
  canAddBusinessCaseDocumentVersion,
  isBusinessCaseDocumentAdvisorReadable,
  validateBusinessCaseDocumentVersionMetadata,
} from "./business-case-document-contract.js";

const MANAGEMENT_ROLES = new Set(["OWNER", "HR_ADMIN"]);
const SHAREABLE_CASE_STATUSES = new Set(["OPEN", "RESOLVED"]);
const KEY_CONTEXT = Buffer.from("insaya/business-case-document/aes-256-gcm/v1", "utf8");
const id = (prefix) => `${prefix}_${crypto.randomUUID()}`;

function storageSecret(env) {
  const secret = String(env?.DOCUMENT_STORAGE_SECRET || "");
  if (secret.length < 32) throw new Error("business_case_document_storage_unavailable");
  return secret;
}

function encryptionKey(env) {
  return Buffer.from(crypto.hkdfSync(
    "sha256",
    Buffer.from(storageSecret(env), "utf8"),
    Buffer.from("insaya-document-storage-v1", "utf8"),
    KEY_CONTEXT,
    32,
  ));
}

function startsWith(bytes, expected) {
  if (!Buffer.isBuffer(bytes) || bytes.length < expected.length) return false;
  for (let index = 0; index < expected.length; index += 1) {
    if (bytes[index] !== expected[index]) return false;
  }
  return true;
}

export function verifyBusinessCaseDocumentSignature({ mimeType, bytes } = {}) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 4) throw new Error("business_case_document_content_invalid");
  const pdf = Buffer.from("%PDF-", "ascii");
  const zipLocal = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  const zipEmpty = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

  if (mimeType === "application/pdf" && startsWith(bytes, pdf)) return "BUILTIN_SIGNATURE_V1";
  if ([
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.hancom.hwpx",
  ].includes(mimeType) && (startsWith(bytes, zipLocal) || startsWith(bytes, zipEmpty))) return "BUILTIN_SIGNATURE_V1";
  if (["application/x-hwp", "application/haansofthwp"].includes(mimeType) && startsWith(bytes, ole)) return "BUILTIN_SIGNATURE_V1";
  throw new Error("business_case_document_content_signature_invalid");
}

function aadFor({ versionId, documentId, mimeType, sizeBytes, contentSha256 }) {
  return Buffer.from(JSON.stringify({
    v: 1,
    versionId,
    documentId,
    mimeType,
    sizeBytes,
    contentSha256,
  }), "utf8");
}

function encryptBytes({ env, bytes, versionId, documentId, mimeType, sizeBytes, contentSha256 }) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(env), iv);
  cipher.setAAD(aadFor({ versionId, documentId, mimeType, sizeBytes, contentSha256 }));
  const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return { ciphertext, iv, authTag: cipher.getAuthTag() };
}

function decryptBytes({ env, blob, version }) {
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(env), blob.iv);
    decipher.setAAD(aadFor({
      versionId: version.id,
      documentId: version.document_id,
      mimeType: version.mime_type,
      sizeBytes: Number(version.size_bytes),
      contentSha256: version.content_sha256,
    }));
    decipher.setAuthTag(blob.auth_tag);
    const plaintext = Buffer.concat([decipher.update(blob.ciphertext), decipher.final()]);
    const digest = crypto.createHash("sha256").update(plaintext).digest("hex");
    if (plaintext.length !== Number(version.size_bytes) || digest !== version.content_sha256) {
      throw new Error("integrity_mismatch");
    }
    return plaintext;
  } catch (error) {
    if (String(error?.message || error) === "business_case_document_storage_unavailable") throw error;
    throw new Error("business_case_document_storage_integrity_failed");
  }
}

async function requireActiveUser(client, userId, errorCode) {
  const result = await client.query("SELECT id,status FROM users WHERE id=$1", [userId]);
  if (!result.rows[0] || result.rows[0].status !== "active") throw new Error(errorCode);
}

async function requireBusinessVersion(client, { versionId = null, documentId = null, actorUserId, lockDocument = false }) {
  const params = versionId ? [versionId] : [documentId];
  const where = versionId ? "v.id=$1" : "d.id=$1";
  const query = `SELECT v.*,d.business_case_id,d.status AS document_status,c.organization_id,c.status AS case_status,o.status AS organization_status
    FROM business_case_documents d
    JOIN business_cases c ON c.id=d.business_case_id
    JOIN organizations o ON o.id=c.organization_id
    LEFT JOIN business_case_document_versions v ON v.document_id=d.id
    WHERE ${where}
    ${lockDocument ? "FOR UPDATE OF d" : ""}`;
  const result = await client.query(query, params);
  const row = result.rows[0];
  if (!row) throw new Error(versionId ? "business_case_document_content_not_found" : "business_case_document_not_found");
  if (!SHAREABLE_CASE_STATUSES.has(row.case_status)) throw new Error("business_case_document_case_not_shareable");
  if (row.organization_status !== "ACTIVE") throw new Error("business_case_document_organization_not_active");
  await requireActiveUser(client, actorUserId, "business_case_document_actor_not_active");
  const membership = await client.query(
    `SELECT role_key FROM organization_memberships
     WHERE organization_id=$1 AND user_id=$2 AND status='ACTIVE'`,
    [row.organization_id, actorUserId],
  );
  if (!membership.rows[0]) throw new Error("business_case_document_management_membership_required");
  if (!MANAGEMENT_ROLES.has(membership.rows[0].role_key)) throw new Error("business_case_document_management_role_required");
  return { row, roleKey: membership.rows[0].role_key };
}

async function requireAdvisorVersion(client, { versionId, grantId, advisorUserId, now }) {
  await requireActiveUser(client, advisorUserId, "business_case_document_advisor_not_found");
  const grantResult = await client.query("SELECT * FROM external_advisor_share_grants WHERE id=$1 FOR SHARE", [grantId]);
  const grant = grantResult.rows[0];
  if (!grant || grant.advisor_user_id !== advisorUserId || grant.resource_type !== "BUSINESS_CASE") {
    throw new Error("business_case_document_advisor_not_found");
  }
  if (grant.status !== "ACTIVE" || !grant.accepted_at || grant.revoked_at || new Date(grant.expires_at).getTime() <= now.getTime()) {
    throw new Error("business_case_document_advisor_not_found");
  }
  if (!Array.isArray(grant.permissions) || !grant.permissions.includes("document.read")) {
    throw new Error("business_case_document_advisor_not_found");
  }
  const internal = await client.query(
    `SELECT 1 FROM organization_memberships WHERE organization_id=$1 AND user_id=$2 AND status='ACTIVE' LIMIT 1`,
    [grant.organization_id, advisorUserId],
  );
  if (internal.rowCount) throw new Error("business_case_document_advisor_not_found");

  const result = await client.query(
    `SELECT v.*,d.business_case_id,d.status AS document_status,c.organization_id,c.status AS case_status,o.status AS organization_status
     FROM business_case_document_versions v
     JOIN business_case_documents d ON d.id=v.document_id
     JOIN business_cases c ON c.id=d.business_case_id
     JOIN organizations o ON o.id=c.organization_id
     WHERE v.id=$1`,
    [versionId],
  );
  const row = result.rows[0];
  if (!row
    || row.business_case_id !== grant.resource_id
    || row.organization_id !== grant.organization_id
    || row.organization_status !== "ACTIVE"
    || !SHAREABLE_CASE_STATUSES.has(row.case_status)
    || !isBusinessCaseDocumentAdvisorReadable(row.document_status)) {
    throw new Error("business_case_document_advisor_not_found");
  }
  return { row, grant };
}

function safeVersion(row) {
  return {
    id: row.id,
    documentId: row.document_id,
    versionNo: Number(row.version_no),
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    contentSha256: row.content_sha256,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    contentStored: true,
    contentSafety: "SIGNATURE_VERIFIED",
  };
}

async function insertLifecycleEvent(client, { documentId, actorUserId, roleKey, versionId, versionNo, createdAt }) {
  await client.query(
    `INSERT INTO business_case_document_events
     (id,document_id,actor_user_id,actor_type,event_type,metadata,created_at)
     VALUES ($1,$2,$3,'BUSINESS','VERSION_ADDED',$4,$5)`,
    [id("bcde"), documentId, actorUserId, JSON.stringify({
      actorRoleKey: roleKey,
      versionId,
      versionNo,
      source: "encrypted_binary_upload",
      contentSafety: "SIGNATURE_VERIFIED",
    }), createdAt],
  );
}

async function insertAccessEvent(client, { documentId, versionId, actorUserId, actorType, shareGrantId = null, createdAt }) {
  await client.query(
    `INSERT INTO business_case_document_access_events
     (id,document_id,version_id,actor_user_id,actor_type,share_grant_id,access_type,created_at)
     VALUES ($1,$2,$3,$4,$5,$6,'DOWNLOAD',$7)`,
    [id("bcdae"), documentId, versionId, actorUserId, actorType, shareGrantId, createdAt],
  );
}

export function createBusinessCaseDocumentBinaryRepository({
  pool = getRuntimePostgresPool(),
  env = process.env,
  now = () => new Date(),
} = {}) {
  if (!pool || typeof pool.query !== "function") throw new Error("business_case_document_postgres_pool_required");

  async function storeBusinessVersion({ documentId, actorUserId, fileName, mimeType, bytes } = {}) {
    if (!Buffer.isBuffer(bytes)) throw new Error("business_case_document_content_required");
    const contentSha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    const metadata = validateBusinessCaseDocumentVersionMetadata({
      fileName,
      mimeType,
      sizeBytes: bytes.length,
      contentSha256,
    });
    const signatureEngine = verifyBusinessCaseDocumentSignature({ mimeType: metadata.mimeType, bytes });
    const createdAt = now().toISOString();
    const versionId = id("bcdocv");
    const encrypted = encryptBytes({
      env,
      bytes,
      versionId,
      documentId,
      mimeType: metadata.mimeType,
      sizeBytes: metadata.sizeBytes,
      contentSha256: metadata.contentSha256,
    });

    return withPostgresTransaction(pool, async (client) => {
      const { row: document, roleKey } = await requireBusinessVersion(client, {
        documentId,
        actorUserId,
        lockDocument: true,
      });
      if (!canAddBusinessCaseDocumentVersion(document.document_status)) {
        throw new Error("business_case_document_version_state_invalid");
      }
      const current = await client.query(
        "SELECT COALESCE(MAX(version_no),0) AS current_version FROM business_case_document_versions WHERE document_id=$1",
        [documentId],
      );
      const versionNo = Number(current.rows[0]?.current_version || 0) + 1;
      const storageObjectKey = `business-case-documents/${document.organization_id}/${document.business_case_id}/${documentId}/${versionId}`;
      try {
        const inserted = await client.query(
          `INSERT INTO business_case_document_versions
           (id,document_id,version_no,file_name,mime_type,size_bytes,content_sha256,storage_object_key,created_by_user_id,created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           RETURNING *`,
          [versionId, documentId, versionNo, metadata.fileName, metadata.mimeType, metadata.sizeBytes,
            metadata.contentSha256, storageObjectKey, actorUserId, createdAt],
        );
        await client.query(
          `INSERT INTO business_case_document_blobs
           (version_id,encryption_version,iv,auth_tag,ciphertext,plaintext_sha256,plaintext_size_bytes,signature_status,signature_engine,stored_at)
           VALUES ($1,1,$2,$3,$4,$5,$6,'VERIFIED',$7,$8)`,
          [versionId, encrypted.iv, encrypted.authTag, encrypted.ciphertext, metadata.contentSha256,
            metadata.sizeBytes, signatureEngine, createdAt],
        );
        await insertLifecycleEvent(client, {
          documentId,
          actorUserId,
          roleKey,
          versionId,
          versionNo,
          createdAt,
        });
        return safeVersion(inserted.rows[0]);
      } catch (error) {
        if (error?.code === "23505") throw new Error("business_case_document_version_duplicate");
        throw error;
      }
    });
  }

  async function assertLatestBusinessContentStored({ documentId, actorUserId } = {}) {
    return withPostgresTransaction(pool, async (client) => {
      await requireBusinessVersion(client, { documentId, actorUserId });
      const result = await client.query(
        `SELECT v.id
         FROM business_case_document_versions v
         JOIN business_case_document_blobs b ON b.version_id=v.id
         WHERE v.document_id=$1
         ORDER BY v.version_no DESC LIMIT 1`,
        [documentId],
      );
      if (!result.rows[0]) throw new Error("business_case_document_content_required");
      return true;
    });
  }

  async function getBusinessDownload({ versionId, actorUserId } = {}) {
    return withPostgresTransaction(pool, async (client) => {
      const { row: version } = await requireBusinessVersion(client, { versionId, actorUserId });
      const blobResult = await client.query("SELECT * FROM business_case_document_blobs WHERE version_id=$1", [versionId]);
      const blob = blobResult.rows[0];
      if (!blob) throw new Error("business_case_document_content_not_found");
      const bytes = decryptBytes({ env, blob, version });
      await insertAccessEvent(client, {
        documentId: version.document_id,
        versionId,
        actorUserId,
        actorType: "BUSINESS",
        createdAt: now().toISOString(),
      });
      return { fileName: version.file_name, mimeType: version.mime_type, sizeBytes: bytes.length, bytes };
    });
  }

  async function getAdvisorDownload({ versionId, grantId, advisorUserId } = {}) {
    const current = now();
    return withPostgresTransaction(pool, async (client) => {
      const { row: version, grant } = await requireAdvisorVersion(client, {
        versionId,
        grantId,
        advisorUserId,
        now: current,
      });
      const blobResult = await client.query("SELECT * FROM business_case_document_blobs WHERE version_id=$1", [versionId]);
      const blob = blobResult.rows[0];
      if (!blob) throw new Error("business_case_document_advisor_not_found");
      const bytes = decryptBytes({ env, blob, version });
      await insertAccessEvent(client, {
        documentId: version.document_id,
        versionId,
        actorUserId: advisorUserId,
        actorType: "ADVISOR",
        shareGrantId: grant.id,
        createdAt: current.toISOString(),
      });
      return { fileName: version.file_name, mimeType: version.mime_type, sizeBytes: bytes.length, bytes };
    });
  }

  async function listBusinessAccessEvents({ documentId, actorUserId, limit = 200 } = {}) {
    const safeLimit = Math.max(1, Math.min(500, Number(limit) || 200));
    return withPostgresTransaction(pool, async (client) => {
      await requireBusinessVersion(client, { documentId, actorUserId });
      const result = await client.query(
        `SELECT id,document_id,version_id,actor_user_id,actor_type,share_grant_id,access_type,created_at
         FROM business_case_document_access_events
         WHERE document_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2`,
        [documentId, safeLimit],
      );
      return result.rows.map((row) => ({
        id: row.id,
        documentId: row.document_id,
        versionId: row.version_id,
        actorUserId: row.actor_user_id,
        actorType: row.actor_type,
        shareGrantId: row.share_grant_id || null,
        accessType: row.access_type,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      }));
    });
  }

  return {
    storeBusinessVersion,
    assertLatestBusinessContentStored,
    getBusinessDownload,
    getAdvisorDownload,
    listBusinessAccessEvents,
  };
}