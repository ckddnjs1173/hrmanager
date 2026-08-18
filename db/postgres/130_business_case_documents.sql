-- Versioned Business Case documents and append-only External Advisor reviews.
-- V1 stores immutable text snapshots only. Binary upload/object storage is deliberately out of scope.

BEGIN;

CREATE TABLE IF NOT EXISTS business_case_documents (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  business_case_id TEXT NOT NULL REFERENCES business_cases(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  document_type TEXT NOT NULL CHECK (char_length(document_type) BETWEEN 1 AND 80),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (id,organization_id,business_case_id)
);

CREATE INDEX IF NOT EXISTS idx_business_case_documents_case
  ON business_case_documents(organization_id,business_case_id,created_at DESC,id DESC);

CREATE TABLE IF NOT EXISTS business_case_document_versions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  business_case_id TEXT NOT NULL,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  content_text TEXT NOT NULL CHECK (char_length(content_text) BETWEEN 1 AND 100000),
  content_sha256 TEXT NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL,
  FOREIGN KEY (document_id,organization_id,business_case_id)
    REFERENCES business_case_documents(id,organization_id,business_case_id) ON DELETE CASCADE,
  UNIQUE (document_id,version_number),
  UNIQUE (id,organization_id,business_case_id)
);

CREATE INDEX IF NOT EXISTS idx_business_case_document_versions_document
  ON business_case_document_versions(document_id,version_number DESC);
CREATE INDEX IF NOT EXISTS idx_business_case_document_versions_case
  ON business_case_document_versions(organization_id,business_case_id,created_at DESC,id DESC);

CREATE TABLE IF NOT EXISTS business_case_document_reviews (
  id TEXT PRIMARY KEY,
  document_version_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  business_case_id TEXT NOT NULL,
  reviewer_user_id TEXT NOT NULL REFERENCES users(id),
  share_grant_id TEXT NOT NULL REFERENCES external_advisor_share_grants(id),
  decision TEXT NOT NULL CHECK (decision IN ('COMMENT','APPROVED','CHANGES_REQUESTED')),
  body TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL,
  FOREIGN KEY (document_version_id,organization_id,business_case_id)
    REFERENCES business_case_document_versions(id,organization_id,business_case_id) ON DELETE CASCADE,
  CHECK (char_length(body) <= 5000),
  CHECK (
    (decision='APPROVED' AND char_length(body) BETWEEN 0 AND 5000)
    OR
    (decision IN ('COMMENT','CHANGES_REQUESTED') AND char_length(body) BETWEEN 1 AND 5000)
  )
);

CREATE INDEX IF NOT EXISTS idx_business_case_document_reviews_version
  ON business_case_document_reviews(document_version_id,created_at ASC,id ASC);
CREATE INDEX IF NOT EXISTS idx_business_case_document_reviews_case
  ON business_case_document_reviews(organization_id,business_case_id,created_at ASC,id ASC);
CREATE INDEX IF NOT EXISTS idx_business_case_document_reviews_grant
  ON business_case_document_reviews(share_grant_id,created_at ASC,id ASC);

COMMIT;
