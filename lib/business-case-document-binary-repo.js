import crypto from "node:crypto";
import { getRuntimePostgresPool } from "./runtime-postgres.js";
import { withPostgresTransaction } from "./postgres-client.js";
import {
  canAddBusinessCaseDocumentVersion,
  isBusinessCaseDocumentAdvisorReadable,
  validateBusinessCaseDocumentVersionMetadata,
} from "./business-case-document-contract.js";
import {
  DOCUMENT_DOWNLOAD_GRANT_DEFAULT_TTL_SECONDS,
  DOCUMENT_UPLOAD_INTENT_DEFAULT_TTL_SECONDS,
  assertPrivateDocumentStorageConfiguration,
  canIssueDocumentDownloadGrant,
  canVerifyDocumentStorage,
  compareDocumentUploadMetadata,
} from "./business-case-document-storage-contract.js";

const MANAGEMENT_ROLES = new Set(["OWNER", "HR_ADMIN"]);
const SHAREABLE_CASE_STATUSES = new Set(["OPEN", "RESOLVED"]);
const KEY_CONTEXT = Buffer.from("insaya/business-case-document/aes-256-gcm/v1", "utf8");
const id = (prefix) => `${prefix}_${crypto.randomUUID()}`;
const iso = (value) => value instanceof Date ? value.toISOString() : String(value);

function storageSecret(env) {
  const secret = String(env?.DOCUMENT_STORAGE_SECRET || "");
  if (secret.length < 32) throw new Error("business_case_document_storage_unavailable");
  return secret;
}

function assertAdapterConfiguration(env) {
  storageSecret(env);
  return assertPrivateDocumentStorageConfiguration({
    enabled: true,
    provider: "POSTGRES_ENCRYPTED_BLOB",
    visibility: "PRIVATE",
    encryptionAtRest: true,
    allowUnsignedRead: false,
    publicBaseUrl: "",
  });
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

function capabilityHash() {
  const raw = crypto.randomBytes(32).toString("base64url");
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function plusSeconds(value, seconds) {
  return new Date(new Date(value).getTime() + seconds * 1000).toISOString();
}

function plusMilliseconds(value, milliseconds) {
  return new Date(new Date(value).getTime() + milliseconds).toISOString();
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

  if (mimeType === "application/pdf" && startsWith(bytes, pdf)) return true;
  if ([
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.hancom.hwpx",
  ].includes(mimeType) && (startsWith(bytes, zipLocal) || startsWith(bytes, zipEmpty))) return true;
  if (["application/x-hwp", "application/haansofthwp"].includes(mimeType) && startsWith(bytes, ole)) return true;
  throw new Error("business_case_document_content_signature_invalid");
}

export function scanBusinessCaseDocumentBytes({ mimeType, bytes } = {}) {
  verifyBusinessCaseDocumentSignature({ mimeType, bytes });
  const searchable = bytes.toString("latin1");
  if (mimeType === "application/pdf") {
    const activePdf = /\/(JavaScript|JS|OpenAction|Launch|EmbeddedFile)\b/i;
    if (activePdf.test(searchable)) throw new Error("business_case_document_content_active_content_forbidden");
  }
  if ([
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.hancom.hwpx",
  ].includes(mimeType)) {
    const activeArchive = /(vbaProject\.bin|\.(exe|dll|com|bat|cmd|js|vbs)(?:\x00|\r|\n|$))/i;
    if (activeArchive.test(searchable)) throw new Error("business_case_document_content_active_content_forbidden");
  }
  return "BUILTIN_SAFE_CONTENT_V1";
}

function aadFor({ versionId, documentId, mimeType, sizeBytes, contentSha256 }) {
  return Buffer.from(JSON.stringify({ v: 1, versionId, documentId, mimeType, sizeBytes, contentSha256 }), "utf8");
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
    if (plaintext.length !== Number(version.size_bytes) || digest !== version.content_sha256) throw new Error("integrity_mismatch");
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

async function requireManagementActor(client, organizationId, actorUserId) {
  await requireActiveUser(client, actorUserId, "business_case_document_actor_not_active");
  const result = await client.query(
    `SELECT role_key FROM organization_memberships
     WHERE organization_id=$1 AND user_id=$2 AND status='ACTIVE'`,
    [organizationId, actorUserId],
  );
  if (!result.rows[0]) throw new Error("business_case_document_management_membership_required");
  if (!MANAGEMENT_ROLES.has(result.rows[0].role_key)) throw new Error("business_case_document_management_role_required");
  return result.rows[0].role_key;
}

async function requireBusinessDocument(client, { documentId, actorUserId, lock = false }) {
  const result = await client.query(
    `SELECT d.*,c.organization_id,c.status AS case_status,o.status AS organization_status
     FROM business_case_documents d
     JOIN business_cases c ON c.id=d.business_case_id
     JOIN organizations o ON o.id=c.organization_id
     WHERE d.id=$1${lock ? " FOR UPDATE OF d" : ""}`,
    [documentId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("business_case_document_not_found");
  if (!SHAREABLE_CASE_STATUSES.has(row.case_status)) throw new Error("business_case_document_case_not_shareable");
  if (row.organization_status !== "ACTIVE") throw new Error("business_case_document_organization_not_active");
  const roleKey = await requireManagementActor(client, row.organization_id, actorUserId);
  return { row, roleKey };
}

async function requireBusinessVersion(client, { versionId, actorUserId }) {
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
  if (!row) throw new Error("business_case_document_content_not_found");
  if (!SHAREABLE_CASE_STATUSES.has(row.case_status)) throw new Error("business_case_document_case_not_shareable");
  if (row.organization_status !== "ACTIVE") throw new Error("business_case_document_organization_not_active");
  await requireManagementActor(client, row.organization_id, actorUserId);
  return row;
}

async function requireAdvisorVersion(client, { versionId, grantId, advisorUserId, now }) {
  await requireActiveUser(client, advisorUserId, "business_case_document_advisor_not_found");
  const grantResult = await client.query("SELECT * FROM external_advisor_share_grants WHERE id=$1 FOR SHARE", [grantId]);
  const grant = grantResult.rows[0];
  if (!grant || grant.advisor_user_id !== advisorUserId || grant.resource_type !== "BUSINESS_CASE") throw new Error("business_case_document_advisor_not_found");
  if (grant.status !== "ACTIVE" || !grant.accepted_at || grant.revoked_at || new Date(grant.expires_at).getTime() <= now.getTime()) {
    throw new Error("business_case_document_advisor_not_found");
  }
  if (!Array.isArray(grant.permissions) || !grant.permissions.includes("document.read")) throw new Error("business_case_document_advisor_not_found");
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
    createdAt: iso(row.created_at),
    storageState: row.storage_state,
    scanState: row.scan_state,
    contentStored: row.storage_state === "VERIFIED" && row.scan_state === "CLEAN" && !row.deleted_at,
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
      source: "private_storage_adapter",
    }), createdAt],
  );
}

async function insertStorageEvent(client, {
  versionId,
  actorUserId = null,
  actorType = "SYSTEM",
  shareGrantId = null,
  eventType,
  metadata = {},
  createdAt,
}) {
  await client.query(
    `INSERT INTO business_case_document_storage_events
     (id,version_id,actor_user_id,actor_type,share_grant_id,event_type,metadata,created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id("bcdse"), versionId, actorUserId, actorType, shareGrantId, eventType, JSON.stringify(metadata), createdAt],
  );
}

function assertDownloadable(version) {
  if (!canIssueDocumentDownloadGrant({
    storageState: version.storage_state,
    scanState: version.scan_state,
    deletedAt: version.deleted_at,
  })) throw new Error("business_case_document_content_not_found");
}

async function createAndConsumeDownloadGrant(client, {
  version,
  actorUserId,
  actorType,
  shareGrantId = null,
  current,
  beforeConsume,
}) {
  assertDownloadable(version);
  const blobResult = await client.query("SELECT * FROM business_case_document_blobs WHERE version_id=$1", [version.id]);
  if (!blobResult.rows[0]) throw new Error(actorType === "ADVISOR" ? "business_case_document_advisor_not_found" : "business_case_document_content_not_found");

  const downloadGrantId = id("bcddg");
  const issuedAt = current.toISOString();
  const expiresAt = plusSeconds(issuedAt, DOCUMENT_DOWNLOAD_GRANT_DEFAULT_TTL_SECONDS);
  await client.query(
    `INSERT INTO business_case_document_download_grants
     (id,version_id,grantee_user_id,actor_type,share_grant_id,token_hash,status,issued_at,expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,'ACTIVE',$7,$8)`,
    [downloadGrantId, version.id, actorUserId, actorType, shareGrantId, capabilityHash(), issuedAt, expiresAt],
  );
  await insertStorageEvent(client, {
    versionId: version.id,
    actorUserId,
    actorType,
    shareGrantId,
    eventType: "DOWNLOAD_GRANT_ISSUED",
    metadata: { downloadGrantId },
    createdAt: issuedAt,
  });

  const value = await beforeConsume(blobResult.rows[0]);
  const consumedAt = plusMilliseconds(issuedAt, 1);
  await client.query(
    "UPDATE business_case_document_download_grants SET status='CONSUMED',consumed_at=$2 WHERE id=$1 AND status='ACTIVE'",
    [downloadGrantId, consumedAt],
  );
  await insertStorageEvent(client, {
    versionId: version.id,
    actorUserId,
    actorType,
    shareGrantId,
    eventType: "DOWNLOAD_GRANT_CONSUMED",
    metadata: { downloadGrantId },
    createdAt: consumedAt,
  });
  return value;
}

export function createBusinessCaseDocumentBinaryRepository({
  pool = getRuntimePostgresPool(),
  env = process.env,
  now = () => new Date(),
} = {}) {
  if (!pool || typeof pool.query !== "function") throw new Error("business_case_document_postgres_pool_required");

  async function storeBusinessVersion({ documentId, actorUserId, fileName, mimeType, bytes } = {}) {
    assertAdapterConfiguration(env);
    if (!Buffer.isBuffer(bytes)) throw new Error("business_case_document_content_required");
    const contentSha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    const metadata = validateBusinessCaseDocumentVersionMetadata({ fileName, mimeType, sizeBytes: bytes.length, contentSha256 });
    const scannerName = scanBusinessCaseDocumentBytes({ mimeType: metadata.mimeType, bytes });
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
      const { row: document, roleKey } = await requireBusinessDocument(client, { documentId, actorUserId, lock: true });
      if (!canAddBusinessCaseDocumentVersion(document.status)) throw new Error("business_case_document_version_state_invalid");
      const current = await client.query(
        "SELECT COALESCE(MAX(version_no),0) AS current_version FROM business_case_document_versions WHERE document_id=$1",
        [documentId],
      );
      const versionNo = Number(current.rows[0]?.current_version || 0) + 1;
      const storageObjectKey = `business-case-documents/${document.organization_id}/${document.business_case_id}/${documentId}/${versionId}`;
      const uploadIntentId = id("bcdui");
      const uploadExpiresAt = plusSeconds(createdAt, DOCUMENT_UPLOAD_INTENT_DEFAULT_TTL_SECONDS);

      try {
        const inserted = await client.query(
          `INSERT INTO business_case_document_versions
           (id,document_id,version_no,file_name,mime_type,size_bytes,content_sha256,storage_object_key,created_by_user_id,created_at,storage_state,scan_state)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'UPLOAD_PENDING','NOT_SCANNED')
           RETURNING *`,
          [versionId, documentId, versionNo, metadata.fileName, metadata.mimeType, metadata.sizeBytes,
            metadata.contentSha256, storageObjectKey, actorUserId, createdAt],
        );
        await client.query(
          `INSERT INTO business_case_document_upload_intents
           (id,version_id,requested_by_user_id,token_hash,status,expected_file_name,expected_mime_type,expected_size_bytes,expected_content_sha256,issued_at,expires_at,metadata)
           VALUES ($1,$2,$3,$4,'PENDING',$5,$6,$7,$8,$9,$10,$11)`,
          [uploadIntentId, versionId, actorUserId, capabilityHash(), metadata.fileName, metadata.mimeType,
            metadata.sizeBytes, metadata.contentSha256, createdAt, uploadExpiresAt,
            JSON.stringify({ provider: "POSTGRES_ENCRYPTED_BLOB", mode: "SERVER_MEDIATED" })],
        );
        await insertStorageEvent(client, {
          versionId,
          actorUserId,
          actorType: "BUSINESS",
          eventType: "UPLOAD_INTENT_ISSUED",
          metadata: { uploadIntentId, provider: "POSTGRES_ENCRYPTED_BLOB" },
          createdAt,
        });

        const observed = {
          fileName: metadata.fileName,
          mimeType: metadata.mimeType,
          sizeBytes: bytes.length,
          contentSha256: crypto.createHash("sha256").update(bytes).digest("hex"),
        };
        const comparison = compareDocumentUploadMetadata({
          fileName: metadata.fileName,
          mimeType: metadata.mimeType,
          sizeBytes: metadata.sizeBytes,
          contentSha256: metadata.contentSha256,
        }, observed);
        if (!canVerifyDocumentStorage({ metadataMatch: comparison.match, scanState: "CLEAN" })) {
          throw new Error("business_case_document_content_verification_failed");
        }

        await client.query(
          `INSERT INTO business_case_document_blobs
           (version_id,encryption_version,iv,auth_tag,ciphertext,plaintext_sha256,plaintext_size_bytes,signature_engine,stored_at)
           VALUES ($1,1,$2,$3,$4,$5,$6,$7,$8)`,
          [versionId, encrypted.iv, encrypted.authTag, encrypted.ciphertext, metadata.contentSha256,
            metadata.sizeBytes, scannerName, createdAt],
        );
        const verifiedAt = plusMilliseconds(createdAt, 2);
        await client.query(
          `INSERT INTO business_case_document_storage_verifications
           (id,version_id,upload_intent_id,observed_file_name,observed_mime_type,observed_size_bytes,observed_content_sha256,metadata_match,scan_state,scanner_name,scanner_reference,created_at,completed_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,'CLEAN',$8,'server-mediated',$9,$10)`,
          [id("bcdsv"), versionId, uploadIntentId, observed.fileName, observed.mimeType, observed.sizeBytes,
            observed.contentSha256, scannerName, plusMilliseconds(createdAt, 1), verifiedAt],
        );
        await client.query(
          "UPDATE business_case_document_upload_intents SET status='CONSUMED',consumed_at=$2 WHERE id=$1 AND status='PENDING'",
          [uploadIntentId, plusMilliseconds(createdAt, 1)],
        );
        const finalized = await client.query(
          `UPDATE business_case_document_versions
           SET storage_state='VERIFIED',scan_state='CLEAN',uploaded_at=$2,verified_at=$3
           WHERE id=$1 RETURNING *`,
          [versionId, plusMilliseconds(createdAt, 1), verifiedAt],
        );
        await insertStorageEvent(client, {
          versionId,
          actorUserId,
          actorType: "BUSINESS",
          eventType: "UPLOAD_RECORDED",
          metadata: { uploadIntentId, provider: "POSTGRES_ENCRYPTED_BLOB" },
          createdAt: plusMilliseconds(createdAt, 1),
        });
        await insertStorageEvent(client, {
          versionId,
          eventType: "CONTENT_VERIFIED",
          metadata: { uploadIntentId, metadataMatch: true },
          createdAt: verifiedAt,
        });
        await insertStorageEvent(client, {
          versionId,
          eventType: "SCAN_CLEAN",
          metadata: { scannerName, policy: "baseline-active-content-rejection" },
          createdAt: plusMilliseconds(createdAt, 3),
        });
        await insertLifecycleEvent(client, { documentId, actorUserId, roleKey, versionId, versionNo, createdAt });
        return safeVersion(finalized.rows[0] || inserted.rows[0]);
      } catch (error) {
        if (error?.code === "23505") throw new Error("business_case_document_version_duplicate");
        throw error;
      }
    });
  }

  async function assertLatestBusinessContentStored({ documentId, actorUserId } = {}) {
    return withPostgresTransaction(pool, async (client) => {
      await requireBusinessDocument(client, { documentId, actorUserId });
      const result = await client.query(
        `SELECT v.*,b.version_id AS blob_version_id
         FROM business_case_document_versions v
         LEFT JOIN business_case_document_blobs b ON b.version_id=v.id
         WHERE v.document_id=$1 ORDER BY v.version_no DESC LIMIT 1`,
        [documentId],
      );
      const latest = result.rows[0];
      if (!latest || !latest.blob_version_id) throw new Error("business_case_document_content_required");
      try { assertDownloadable(latest); }
      catch { throw new Error("business_case_document_content_required"); }
      return true;
    });
  }

  async function getBusinessDownload({ versionId, actorUserId } = {}) {
    assertAdapterConfiguration(env);
    const current = now();
    return withPostgresTransaction(pool, async (client) => {
      const version = await requireBusinessVersion(client, { versionId, actorUserId });
      return createAndConsumeDownloadGrant(client, {
        version,
        actorUserId,
        actorType: "BUSINESS",
        current,
        beforeConsume: async (blob) => {
          const bytes = decryptBytes({ env, blob, version });
          return { fileName: version.file_name, mimeType: version.mime_type, sizeBytes: bytes.length, bytes };
        },
      });
    });
  }

  async function getAdvisorDownload({ versionId, grantId, advisorUserId } = {}) {
    assertAdapterConfiguration(env);
    const current = now();
    return withPostgresTransaction(pool, async (client) => {
      const { row: version, grant } = await requireAdvisorVersion(client, { versionId, grantId, advisorUserId, now: current });
      try { assertDownloadable(version); }
      catch { throw new Error("business_case_document_advisor_not_found"); }
      return createAndConsumeDownloadGrant(client, {
        version,
        actorUserId: advisorUserId,
        actorType: "ADVISOR",
        shareGrantId: grant.id,
        current,
        beforeConsume: async (blob) => {
          const bytes = decryptBytes({ env, blob, version });
          return { fileName: version.file_name, mimeType: version.mime_type, sizeBytes: bytes.length, bytes };
        },
      });
    });
  }

  async function listBusinessAccessEvents({ documentId, actorUserId, limit = 200 } = {}) {
    const safeLimit = Math.max(1, Math.min(500, Number(limit) || 200));
    return withPostgresTransaction(pool, async (client) => {
      await requireBusinessDocument(client, { documentId, actorUserId });
      const result = await client.query(
        `SELECT e.id,e.version_id,e.actor_user_id,e.actor_type,e.share_grant_id,e.created_at
         FROM business_case_document_storage_events e
         JOIN business_case_document_versions v ON v.id=e.version_id
         WHERE v.document_id=$1 AND e.event_type='DOWNLOAD_GRANT_CONSUMED'
         ORDER BY e.created_at DESC,e.id DESC LIMIT $2`,
        [documentId, safeLimit],
      );
      return result.rows.map((row) => ({
        id: row.id,
        documentId,
        versionId: row.version_id,
        actorUserId: row.actor_user_id,
        actorType: row.actor_type,
        shareGrantId: row.share_grant_id || null,
        accessType: "DOWNLOAD",
        createdAt: iso(row.created_at),
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
