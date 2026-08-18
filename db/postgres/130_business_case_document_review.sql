-- Business Case document review control plane.
-- This migration defines metadata/version/review/audit records only.
-- It intentionally does not expose file upload/download or object-storage access.

BEGIN;

CREATE TABLE IF NOT EXISTS business_case_documents (
  id TEXT PRIMARY KEY,
  business_case_id TEXT NOT NULL REFERENCES business_cases(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  document_kind TEXT NOT NULL CHECK (document_kind IN (
    'EMPLOYMENT_CONTRACT','NOTICE','AGREEMENT','PAYROLL_SUPPORT','EVIDENCE','OTHER'
  )),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
    'DRAFT','IN_REVIEW','APPROVED','CHANGES_REQUESTED','WITHDRAWN'
  )),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_business_case_documents_case
  ON business_case_documents(business_case_id,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS business_case_document_versions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES business_case_documents(id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL CHECK (version_no >= 1),
  file_name TEXT NOT NULL CHECK (
    char_length(file_name) BETWEEN 1 AND 180
    AND position('/' in file_name)=0
    AND position(chr(92) in file_name)=0
  ),
  mime_type TEXT NOT NULL CHECK (mime_type IN (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/x-hwp',
    'application/haansofthwp',
    'application/vnd.hancom.hwpx'
  )),
  size_bytes BIGINT NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  content_sha256 TEXT NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  storage_object_key TEXT NOT NULL CHECK (char_length(storage_object_key) BETWEEN 1 AND 500),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (document_id,version_no),
  UNIQUE (document_id,content_sha256),
  UNIQUE (id,document_id)
);

CREATE INDEX IF NOT EXISTS idx_business_case_document_versions_document
  ON business_case_document_versions(document_id,version_no DESC);

CREATE TABLE IF NOT EXISTS business_case_document_reviews (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES business_case_documents(id) ON DELETE CASCADE,
  version_id TEXT NOT NULL,
  share_grant_id TEXT NOT NULL REFERENCES external_advisor_share_grants(id),
  reviewer_user_id TEXT NOT NULL REFERENCES users(id),
  decision TEXT NOT NULL CHECK (decision IN ('APPROVED','CHANGES_REQUESTED')),
  review_note TEXT NOT NULL DEFAULT '' CHECK (char_length(review_note) <= 5000),
  created_at TIMESTAMPTZ NOT NULL,
  FOREIGN KEY (version_id,document_id)
    REFERENCES business_case_document_versions(id,document_id) ON DELETE CASCADE,
  CHECK (decision <> 'CHANGES_REQUESTED' OR char_length(btrim(review_note)) >= 1),
  UNIQUE (version_id,share_grant_id)
);

CREATE INDEX IF NOT EXISTS idx_business_case_document_reviews_document
  ON business_case_document_reviews(document_id,created_at ASC,id ASC);
CREATE INDEX IF NOT EXISTS idx_business_case_document_reviews_grant
  ON business_case_document_reviews(share_grant_id,created_at ASC);

CREATE TABLE IF NOT EXISTS business_case_document_events (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES business_case_documents(id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('BUSINESS','ADVISOR')),
  share_grant_id TEXT REFERENCES external_advisor_share_grants(id),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'CREATED','VERSION_ADDED','SUBMITTED_FOR_REVIEW',
    'REVIEW_APPROVED','REVIEW_CHANGES_REQUESTED','WITHDRAWN'
  )),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  CHECK (
    (actor_type='BUSINESS' AND share_grant_id IS NULL)
    OR
    (actor_type='ADVISOR' AND share_grant_id IS NOT NULL)
  ),
  CHECK (
    event_type NOT IN ('REVIEW_APPROVED','REVIEW_CHANGES_REQUESTED')
    OR actor_type='ADVISOR'
  )
);

CREATE INDEX IF NOT EXISTS idx_business_case_document_events_document
  ON business_case_document_events(document_id,created_at ASC,id ASC);
CREATE INDEX IF NOT EXISTS idx_business_case_document_events_grant
  ON business_case_document_events(share_grant_id,created_at ASC)
  WHERE share_grant_id IS NOT NULL;

COMMIT;
