-- Private Business Case document binary storage.
-- Plaintext document bytes are never stored. The application encrypts every payload with
-- AES-256-GCM before inserting it here. Access is always mediated by session RBAC/ShareGrant checks.

BEGIN;

CREATE TABLE IF NOT EXISTS business_case_document_blobs (
  version_id TEXT PRIMARY KEY REFERENCES business_case_document_versions(id) ON DELETE CASCADE,
  encryption_version SMALLINT NOT NULL CHECK (encryption_version = 1),
  iv BYTEA NOT NULL CHECK (octet_length(iv) = 12),
  auth_tag BYTEA NOT NULL CHECK (octet_length(auth_tag) = 16),
  ciphertext BYTEA NOT NULL CHECK (octet_length(ciphertext) >= 1),
  plaintext_sha256 TEXT NOT NULL CHECK (plaintext_sha256 ~ '^[0-9a-f]{64}$'),
  plaintext_size_bytes BIGINT NOT NULL CHECK (plaintext_size_bytes BETWEEN 1 AND 10485760),
  signature_status TEXT NOT NULL CHECK (signature_status IN ('VERIFIED')),
  signature_engine TEXT NOT NULL CHECK (char_length(signature_engine) BETWEEN 1 AND 80),
  stored_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_business_case_document_blobs_stored
  ON business_case_document_blobs(stored_at DESC);

-- Sensitive content access has its own append-only audit stream. Lifecycle events remain in
-- business_case_document_events; reads/downloads are intentionally separated to avoid noise.
CREATE TABLE IF NOT EXISTS business_case_document_access_events (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES business_case_documents(id) ON DELETE CASCADE,
  version_id TEXT NOT NULL REFERENCES business_case_document_versions(id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('BUSINESS','ADVISOR')),
  share_grant_id TEXT REFERENCES external_advisor_share_grants(id),
  access_type TEXT NOT NULL CHECK (access_type IN ('DOWNLOAD')),
  created_at TIMESTAMPTZ NOT NULL,
  CHECK (
    (actor_type='BUSINESS' AND share_grant_id IS NULL)
    OR
    (actor_type='ADVISOR' AND share_grant_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_business_case_document_access_document
  ON business_case_document_access_events(document_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_business_case_document_access_grant
  ON business_case_document_access_events(share_grant_id,created_at DESC)
  WHERE share_grant_id IS NOT NULL;

COMMIT;