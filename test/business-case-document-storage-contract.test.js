import test from "node:test";
import assert from "node:assert/strict";
import {
  DOCUMENT_DOWNLOAD_GRANT_DEFAULT_TTL_SECONDS,
  DOCUMENT_DOWNLOAD_GRANT_MAX_TTL_SECONDS,
  DOCUMENT_UPLOAD_INTENT_DEFAULT_TTL_SECONDS,
  DOCUMENT_UPLOAD_INTENT_MAX_TTL_SECONDS,
  assertNoDocumentStorageSecrets,
  assertPrivateDocumentStorageConfiguration,
  canIssueDocumentDownloadGrant,
  canVerifyDocumentStorage,
  compareDocumentUploadMetadata,
  normalizeDocumentDeletionReason,
  normalizeDocumentDownloadGrantTtlSeconds,
  normalizeDocumentUploadIntentTtlSeconds,
} from "../lib/business-case-document-storage-contract.js";

const VERSION = {
  fileName: "employment-contract.pdf",
  mimeType: "application/pdf",
  sizeBytes: 4096,
  contentSha256: "a".repeat(64),
};

test("document storage TTLs are short and bounded", () => {
  assert.equal(normalizeDocumentUploadIntentTtlSeconds(), DOCUMENT_UPLOAD_INTENT_DEFAULT_TTL_SECONDS);
  assert.equal(normalizeDocumentUploadIntentTtlSeconds(DOCUMENT_UPLOAD_INTENT_MAX_TTL_SECONDS), DOCUMENT_UPLOAD_INTENT_MAX_TTL_SECONDS);
  assert.throws(() => normalizeDocumentUploadIntentTtlSeconds(DOCUMENT_UPLOAD_INTENT_MAX_TTL_SECONDS + 1), /upload_intent_ttl_invalid/);
  assert.equal(normalizeDocumentDownloadGrantTtlSeconds(), DOCUMENT_DOWNLOAD_GRANT_DEFAULT_TTL_SECONDS);
  assert.equal(normalizeDocumentDownloadGrantTtlSeconds(DOCUMENT_DOWNLOAD_GRANT_MAX_TTL_SECONDS), DOCUMENT_DOWNLOAD_GRANT_MAX_TTL_SECONDS);
  assert.throws(() => normalizeDocumentDownloadGrantTtlSeconds(DOCUMENT_DOWNLOAD_GRANT_MAX_TTL_SECONDS + 1), /download_grant_ttl_invalid/);
});

test("document storage requires exact immutable upload metadata and a clean scan", () => {
  assert.deepEqual(compareDocumentUploadMetadata(VERSION, VERSION), {
    match: true,
    expected: VERSION,
    observed: VERSION,
    mismatches: [],
  });
  const mismatch = compareDocumentUploadMetadata(VERSION, { ...VERSION, sizeBytes: 4097, contentSha256: "b".repeat(64) });
  assert.equal(mismatch.match, false);
  assert.deepEqual(mismatch.mismatches, ["size_bytes", "content_sha256"]);
  assert.equal(canVerifyDocumentStorage({ metadataMatch: true, scanState: "CLEAN" }), true);
  assert.equal(canVerifyDocumentStorage({ metadataMatch: false, scanState: "CLEAN" }), false);
  assert.equal(canVerifyDocumentStorage({ metadataMatch: true, scanState: "PENDING" }), false);
});

test("download capability is allowed only for verified clean non-deleted storage", () => {
  assert.equal(canIssueDocumentDownloadGrant({ storageState: "VERIFIED", scanState: "CLEAN" }), true);
  assert.equal(canIssueDocumentDownloadGrant({ storageState: "UPLOADED_UNVERIFIED", scanState: "CLEAN" }), false);
  assert.equal(canIssueDocumentDownloadGrant({ storageState: "VERIFIED", scanState: "MALICIOUS" }), false);
  assert.equal(canIssueDocumentDownloadGrant({ storageState: "VERIFIED", scanState: "CLEAN", deletedAt: "2026-08-18T00:00:00Z" }), false);
});

test("enabled object storage must be private, encrypted and have no public base URL", () => {
  assert.deepEqual(assertPrivateDocumentStorageConfiguration({ enabled: false }), { enabled: false });
  assert.deepEqual(assertPrivateDocumentStorageConfiguration({
    enabled: true,
    provider: "test-private-provider",
    visibility: "PRIVATE",
    encryptionAtRest: true,
    allowUnsignedRead: false,
  }), {
    enabled: true,
    provider: "test-private-provider",
    visibility: "PRIVATE",
    encryptionAtRest: true,
    allowUnsignedRead: false,
  });
  assert.throws(() => assertPrivateDocumentStorageConfiguration({ enabled: true, provider: "x", visibility: "PUBLIC", encryptionAtRest: true }), /must_be_private/);
  assert.throws(() => assertPrivateDocumentStorageConfiguration({ enabled: true, provider: "x", visibility: "PRIVATE", encryptionAtRest: false }), /encryption_required/);
  assert.throws(() => assertPrivateDocumentStorageConfiguration({ enabled: true, provider: "x", visibility: "PRIVATE", encryptionAtRest: true, allowUnsignedRead: true }), /unsigned_read_forbidden/);
  assert.throws(() => assertPrivateDocumentStorageConfiguration({ enabled: true, provider: "x", visibility: "PRIVATE", encryptionAtRest: true, publicBaseUrl: "https://public.example" }), /public_url_forbidden/);
});

test("external document storage payloads cannot contain storage pointers, URLs or credentials", () => {
  assert.deepEqual(assertNoDocumentStorageSecrets({ version: { id: "v1", fileName: "safe.pdf" } }), { version: { id: "v1", fileName: "safe.pdf" } });
  for (const payload of [
    { storageObjectKey: "private/key" },
    { nested: { storage_object_key: "private/key" } },
    { uploadUrl: "https://example" },
    { download_url: "https://example" },
    { signedUrl: "https://example" },
    { credentials: { token: "secret" } },
  ]) {
    assert.throws(() => assertNoDocumentStorageSecrets(payload), /secret_exposure_forbidden/);
  }
});

test("deletion reasons are explicit and bounded", () => {
  assert.equal(normalizeDocumentDeletionReason("  retention expired  "), "retention expired");
  assert.throws(() => normalizeDocumentDeletionReason(""), /deletion_reason_required/);
  assert.throws(() => normalizeDocumentDeletionReason("x".repeat(501)), /deletion_reason_too_long/);
});
