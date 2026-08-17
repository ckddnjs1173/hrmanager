-- Canonical employer-owned Business Case resource.
-- This is the tenant-owned resource that External Advisor ShareGrants may reference.

BEGIN;

CREATE TABLE IF NOT EXISTS business_cases (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  summary TEXT NOT NULL DEFAULT '' CHECK (char_length(summary) <= 5000),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','OPEN','RESOLVED','ARCHIVED')),
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  opened_by_user_id TEXT REFERENCES users(id),
  resolved_by_user_id TEXT REFERENCES users(id),
  archived_by_user_id TEXT REFERENCES users(id),
  resolution_note TEXT NOT NULL DEFAULT '' CHECK (char_length(resolution_note) <= 5000),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  opened_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  CHECK ((status='ARCHIVED') = (archived_at IS NOT NULL)),
  CHECK ((archived_at IS NULL) = (archived_by_user_id IS NULL)),
  CHECK (opened_at IS NULL OR opened_by_user_id IS NOT NULL),
  CHECK (resolved_at IS NULL OR resolved_by_user_id IS NOT NULL),
  CHECK (status NOT IN ('OPEN','RESOLVED') OR opened_at IS NOT NULL),
  CHECK (status <> 'RESOLVED' OR resolved_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_business_cases_org_status
  ON business_cases(organization_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_cases_org_created
  ON business_cases(organization_id,created_at DESC);

CREATE TABLE IF NOT EXISTS business_case_events (
  id TEXT PRIMARY KEY,
  business_case_id TEXT NOT NULL REFERENCES business_cases(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('CREATED','OPENED','RESOLVED','REOPENED','ARCHIVED')),
  from_status TEXT CHECK (from_status IS NULL OR from_status IN ('DRAFT','OPEN','RESOLVED','ARCHIVED')),
  to_status TEXT NOT NULL CHECK (to_status IN ('DRAFT','OPEN','RESOLVED','ARCHIVED')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_business_case_events_case
  ON business_case_events(business_case_id,created_at ASC,id ASC);
CREATE INDEX IF NOT EXISTS idx_business_case_events_org
  ON business_case_events(organization_id,created_at DESC);

COMMIT;
