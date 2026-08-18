-- Private PostgreSQL-backed Business Case document binary adapter.
-- Bundle 34 already defines upload/download capabilities, verification, scan and deletion lifecycles.
-- This adapter adds only encrypted object bytes; all lifecycle/audit state stays in the existing control plane.

BEGIN;

CREATE TABLE IF NOT EXISTS business_case_document_blobs (
  version_id TEXT PRIMARY KEY REFERENCES business_case_document_versions(id) ON DELETE CASCADE,
  encryption_version SMALLINT NOT NULL CHECK (encryption_version = 1),
  iv BYTEA NOT NULL CHECK (octet_length(iv) = 12),
  auth_tag BYTEA NOT NULL CHECK (octet_length(auth_tag) = 16),
  ciphertext BYTEA NOT NULL CHECK (octet_length(ciphertext) >= 1),
  plaintext_sha256 TEXT NOT NULL CHECK (plaintext_sha256 ~ '^[0-9a-f]{64}$'),
  plaintext_size_bytes BIGINT NOT NULL CHECK (plaintext_size_bytes BETWEEN 1 AND 10485760),
  signature_engine TEXT NOT NULL CHECK (char_length(signature_engine) BETWEEN 1 AND 80),
  stored_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_business_case_document_blobs_stored
  ON business_case_document_blobs(stored_at DESC);

COMMIT;
