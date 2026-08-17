-- Append-only Business Case review notes for Business <-> External Advisor collaboration.
-- V1 exposes create/list only; no update/delete route or repository method is provided.

BEGIN;

CREATE TABLE IF NOT EXISTS business_case_review_notes (
  id TEXT PRIMARY KEY,
  business_case_id TEXT NOT NULL REFERENCES business_cases(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  author_user_id TEXT NOT NULL REFERENCES users(id),
  author_type TEXT NOT NULL CHECK (author_type IN ('BUSINESS','ADVISOR')),
  share_grant_id TEXT REFERENCES external_advisor_share_grants(id),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  CHECK (
    (author_type='BUSINESS' AND share_grant_id IS NULL)
    OR
    (author_type='ADVISOR' AND share_grant_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_business_case_review_notes_case
  ON business_case_review_notes(business_case_id,created_at ASC,id ASC);
CREATE INDEX IF NOT EXISTS idx_business_case_review_notes_org
  ON business_case_review_notes(organization_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_case_review_notes_grant
  ON business_case_review_notes(share_grant_id,created_at ASC)
  WHERE share_grant_id IS NOT NULL;

COMMIT;
