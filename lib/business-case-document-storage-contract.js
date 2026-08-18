import { validateBusinessCaseDocumentVersionMetadata } from "./business-case-document-contract.js";

export const DOCUMENT_UPLOAD_INTENT_DEFAULT_TTL_SECONDS = 15 * 60;
export const DOCUMENT_UPLOAD_INTENT_MAX_TTL_SECONDS = 30 * 60;
export const DOCUMENT_DOWNLOAD_GRANT_DEFAULT_TTL_SECONDS = 2 * 60;
export const DOCUMENT_DOWNLOAD_GRANT_MAX_TTL_SECONDS = 5 * 60;

export const DOCUMENT_STORAGE_STATES = Object.freeze([
  "METADATA_ONLY",
  "UPLOAD_PENDING",
  "UPLOADED_UNVERIFIED",
  "VERIFIED",
  "REJECTED",
  "DELETION_PENDING",
  "DELETED",
]);

export const DOCUMENT_SCAN_STATES = Object.freeze([
  "NOT_SCANNED",
  "PENDING",
  "CLEAN",
  "MALICIOUS",
  "ERROR",
]);

const STORAGE_STATE_SET = new Set(DOCUMENT_STORAGE_STATES);
const SCAN_STATE_SET = new Set(DOCUMENT_SCAN_STATES);
const FORBIDDEN_EXTERNAL_FIELDS = new Set([
  "storageobjectkey",
  "storage_object_key",
  "uploadurl",
  "upload_url",
  "downloadurl",
  "download_url",
  "signedurl",
  "signed_url",
  "publicurl",
  "public_url",
  "accesskey",
  "access_key",
  "secretaccesskey",
  "secret_access_key",
  "credential",
  "credentials",
  "authorization",
]);

function integerTtl(value, fallback, maximum, code) {
  const ttl = value === undefined || value === null || value === "" ? fallback : Number(value);
  if (!Number.isInteger(ttl) || ttl < 30 || ttl > maximum) throw new Error(code);
  return ttl;
}

export function normalizeDocumentUploadIntentTtlSeconds(value) {
  return integerTtl(
    value,
    DOCUMENT_UPLOAD_INTENT_DEFAULT_TTL_SECONDS,
    DOCUMENT_UPLOAD_INTENT_MAX_TTL_SECONDS,
    "business_case_document_upload_intent_ttl_invalid",
  );
}

export function normalizeDocumentDownloadGrantTtlSeconds(value) {
  return integerTtl(
    value,
    DOCUMENT_DOWNLOAD_GRANT_DEFAULT_TTL_SECONDS,
    DOCUMENT_DOWNLOAD_GRANT_MAX_TTL_SECONDS,
    "business_case_document_download_grant_ttl_invalid",
  );
}

export function normalizeDocumentStorageState(value) {
  const state = String(value || "").trim().toUpperCase();
  if (!STORAGE_STATE_SET.has(state)) throw new Error("business_case_document_storage_state_invalid");
  return state;
}

export function normalizeDocumentScanState(value) {
  const state = String(value || "").trim().toUpperCase();
  if (!SCAN_STATE_SET.has(state)) throw new Error("business_case_document_scan_state_invalid");
  return state;
}

export function normalizeDocumentDeletionReason(value) {
  const reason = String(value || "").trim();
  if (!reason) throw new Error("business_case_document_deletion_reason_required");
  if (reason.length > 500) throw new Error("business_case_document_deletion_reason_too_long");
  return reason;
}

export function expectedDocumentUploadMetadata(version) {
  if (!version || typeof version !== "object") throw new Error("business_case_document_version_required");
  return validateBusinessCaseDocumentVersionMetadata({
    fileName: version.fileName,
    mimeType: version.mimeType,
    sizeBytes: version.sizeBytes,
    contentSha256: version.contentSha256,
  });
}

export function compareDocumentUploadMetadata(expectedVersion, observed) {
  const expected = expectedDocumentUploadMetadata(expectedVersion);
  let actual;
  try {
    actual = validateBusinessCaseDocumentVersionMetadata(observed || {});
  } catch {
    return { match: false, expected, observed: null, mismatches: ["invalid_observed_metadata"] };
  }
  const mismatches = [];
  if (actual.fileName !== expected.fileName) mismatches.push("file_name");
  if (actual.mimeType !== expected.mimeType) mismatches.push("mime_type");
  if (actual.sizeBytes !== expected.sizeBytes) mismatches.push("size_bytes");
  if (actual.contentSha256 !== expected.contentSha256) mismatches.push("content_sha256");
  return { match: mismatches.length === 0, expected, observed: actual, mismatches };
}

export function canVerifyDocumentStorage({ metadataMatch, scanState } = {}) {
  return metadataMatch === true && normalizeDocumentScanState(scanState) === "CLEAN";
}

export function canIssueDocumentDownloadGrant({ storageState, scanState, deletedAt = null } = {}) {
  return deletedAt == null
    && normalizeDocumentStorageState(storageState) === "VERIFIED"
    && normalizeDocumentScanState(scanState) === "CLEAN";
}

export function assertPrivateDocumentStorageConfiguration(config = {}) {
  if (config.enabled !== true) return { enabled: false };
  const provider = String(config.provider || "").trim();
  if (!provider) throw new Error("business_case_document_storage_provider_required");
  if (String(config.visibility || "").trim().toUpperCase() !== "PRIVATE") {
    throw new Error("business_case_document_storage_must_be_private");
  }
  if (config.encryptionAtRest !== true) throw new Error("business_case_document_storage_encryption_required");
  if (config.allowUnsignedRead === true) throw new Error("business_case_document_storage_unsigned_read_forbidden");
  if (String(config.publicBaseUrl || "").trim()) throw new Error("business_case_document_storage_public_url_forbidden");
  return { enabled: true, provider, visibility: "PRIVATE", encryptionAtRest: true, allowUnsignedRead: false };
}

export function assertNoDocumentStorageSecrets(value) {
  const visit = (item) => {
    if (item == null) return;
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    if (typeof item !== "object") return;
    for (const [key, nested] of Object.entries(item)) {
      if (FORBIDDEN_EXTERNAL_FIELDS.has(String(key).toLowerCase())) {
        throw new Error("business_case_document_storage_secret_exposure_forbidden");
      }
      visit(nested);
    }
  };
  visit(value);
  return value;
}
