-- Private Business Case document storage security control plane.
-- No provider credentials, upload URLs, download URLs or file bytes are stored here.
-- The migration is intentionally idempotent because the current migration runner reapplies all files.

BEGIN;

ALTER TABLE business_case_document_versions
  ADD COLUMN IF NOT EXISTS storage_state TEXT NOT NULL DEFAULT 'METADATA_ONLY',
  ADD COLUMN IF NOT EXISTS scan_state TEXT NOT NULL DEFAULT 'NOT_SCANNED',
  ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='business_case_document_versions_storage_state_check') THEN
    ALTER TABLE business_case_document_versions
      ADD CONSTRAINT business_case_document_versions_storage_state_check
      CHECK (storage_state IN (
        'METADATA_ONLY','UPLOAD_PENDING','UPLOADED_UNVERIFIED','VERIFIED',
        'REJECTED','DELETION_PENDING','DELETED'
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='business_case_document_versions_scan_state_check') THEN
    ALTER TABLE business_case_document_versions
      ADD CONSTRAINT business_case_document_versions_scan_state_check
      CHECK (scan_state IN ('NOT_SCANNED','PENDING','CLEAN','MALICIOUS','ERROR'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='business_case_document_versions_storage_lifecycle_check') THEN
    ALTER TABLE business_case_document_versions
      ADD CONSTRAINT business_case_document_versions_storage_lifecycle_check
      CHECK (
        (storage_state='METADATA_ONLY' AND uploaded_at IS NULL AND verified_at IS NULL AND rejected_at IS NULL AND deleted_at IS NULL)
        OR (storage_state='UPLOAD_PENDING' AND verified_at IS NULL AND rejected_at IS NULL AND deleted_at IS NULL)
        OR (storage_state='UPLOADED_UNVERIFIED' AND uploaded_at IS NOT NULL AND verified_at IS NULL AND rejected_at IS NULL AND deleted_at IS NULL)
        OR (storage_state='VERIFIED' AND uploaded_at IS NOT NULL AND verified_at IS NOT NULL AND scan_state='CLEAN' AND rejected_at IS NULL AND deleted_at IS NULL)
        OR (storage_state='REJECTED' AND rejected_at IS NOT NULL AND verified_at IS NULL AND deleted_at IS NULL)
        OR (storage_state='DELETION_PENDING' AND deletion_requested_at IS NOT NULL AND deleted_at IS NULL)
        OR (storage_state='DELETED' AND deletion_requested_at IS NOT NULL AND deleted_at IS NOT NULL)
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS business_case_document_upload_intents (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES business_case_document_versions(id) ON DELETE CASCADE,
  requested_by_user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  status TEXT NOT NULL CHECK (status IN ('PENDING','CONSUMED','EXPIRED','REVOKED')),
  expected_file_name TEXT NOT NULL CHECK (char_length(expected_file_name) BETWEEN 1 AND 255),
  expected_mime_type TEXT NOT NULL,
  expected_size_bytes BIGINT NOT NULL CHECK (expected_size_bytes BETWEEN 1 AND 10485760),
  expected_content_sha256 TEXT NOT NULL CHECK (expected_content_sha256 ~ '^[0-9a-f]{64}$'),
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CHECK (expires_at > issued_at),
  CHECK (
    (status='PENDING' AND consumed_at IS NULL AND revoked_at IS NULL)
    OR (status='CONSUMED' AND consumed_at IS NOT NULL AND revoked_at IS NULL)
    OR (status='EXPIRED' AND consumed_at IS NULL AND revoked_at IS NULL)
    OR (status='REVOKED' AND revoked_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_business_case_document_upload_intent_pending
  ON business_case_document_upload_intents(version_id)
  WHERE status='PENDING';
CREATE INDEX IF NOT EXISTS idx_business_case_document_upload_intents_expiry
  ON business_case_document_upload_intents(status,expires_at);

CREATE TABLE IF NOT EXISTS business_case_document_storage_verifications (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES business_case_document_versions(id) ON DELETE CASCADE,
  upload_intent_id TEXT NOT NULL REFERENCES business_case_document_upload_intents(id) ON DELETE CASCADE,
  observed_file_name TEXT NOT NULL CHECK (char_length(observed_file_name) BETWEEN 1 AND 255),
  observed_mime_type TEXT NOT NULL,
  observed_size_bytes BIGINT NOT NULL CHECK (observed_size_bytes >= 0),
  observed_content_sha256 TEXT CHECK (observed_content_sha256 IS NULL OR observed_content_sha256 ~ '^[0-9a-f]{64}$'),
  metadata_match BOOLEAN NOT NULL,
  scan_state TEXT NOT NULL CHECK (scan_state IN ('PENDING','CLEAN','MALICIOUS','ERROR')),
  scanner_name TEXT,
  scanner_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  CHECK (char_length(COALESCE(scanner_name,'')) <= 100),
  CHECK (char_length(COALESCE(scanner_reference,'')) <= 300),
  CHECK ((scan_state='PENDING' AND completed_at IS NULL) OR (scan_state<>'PENDING' AND completed_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_business_case_document_storage_verifications_version
  ON business_case_document_storage_verifications(version_id,created_at DESC,id DESC);

CREATE TABLE IF NOT EXISTS business_case_document_download_grants (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES business_case_document_versions(id) ON DELETE CASCADE,
  grantee_user_id TEXT NOT NULL REFERENCES users(id),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('BUSINESS','ADVISOR')),
  share_grant_id TEXT REFERENCES external_advisor_share_grants(id),
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  status TEXT NOT NULL CHECK (status IN ('ACTIVE','CONSUMED','EXPIRED','REVOKED')),
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  CHECK (expires_at > issued_at),
  CHECK ((actor_type='BUSINESS' AND share_grant_id IS NULL) OR (actor_type='ADVISOR' AND share_grant_id IS NOT NULL)),
  CHECK (
    (status='ACTIVE' AND consumed_at IS NULL AND revoked_at IS NULL)
    OR (status='CONSUMED' AND consumed_at IS NOT NULL AND revoked_at IS NULL)
    OR (status='EXPIRED' AND consumed_at IS NULL AND revoked_at IS NULL)
    OR (status='REVOKED' AND revoked_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_business_case_document_download_grants_active
  ON business_case_document_download_grants(version_id,grantee_user_id,expires_at)
  WHERE status='ACTIVE';

CREATE TABLE IF NOT EXISTS business_case_document_deletion_requests (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES business_case_document_versions(id) ON DELETE CASCADE,
  requested_by_user_id TEXT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  status TEXT NOT NULL CHECK (status IN ('PENDING','COMPLETED','FAILED','CANCELLED')),
  requested_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  failure_code TEXT,
  CHECK (char_length(COALESCE(failure_code,'')) <= 120),
  CHECK ((status='COMPLETED' AND completed_at IS NOT NULL AND failure_code IS NULL)
      OR (status='FAILED' AND completed_at IS NOT NULL AND failure_code IS NOT NULL)
      OR (status IN ('PENDING','CANCELLED')))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_business_case_document_deletion_pending
  ON business_case_document_deletion_requests(version_id)
  WHERE status='PENDING';

CREATE TABLE IF NOT EXISTS business_case_document_storage_events (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES business_case_document_versions(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('SYSTEM','BUSINESS','ADVISOR')),
  share_grant_id TEXT REFERENCES external_advisor_share_grants(id),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'UPLOAD_INTENT_ISSUED','UPLOAD_INTENT_EXPIRED','UPLOAD_RECORDED',
    'CONTENT_VERIFIED','SCAN_CLEAN','SCAN_REJECTED',
    'DOWNLOAD_GRANT_ISSUED','DOWNLOAD_GRANT_CONSUMED','DOWNLOAD_GRANT_REVOKED',
    'DELETION_REQUESTED','DELETED'
  )),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  CHECK ((actor_type='SYSTEM' AND share_grant_id IS NULL)
      OR (actor_type='BUSINESS' AND actor_user_id IS NOT NULL AND share_grant_id IS NULL)
      OR (actor_type='ADVISOR' AND actor_user_id IS NOT NULL AND share_grant_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_business_case_document_storage_events_version
  ON business_case_document_storage_events(version_id,created_at ASC,id ASC);

COMMIT;
