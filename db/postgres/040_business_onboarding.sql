-- Insaya Business onboarding + compliance action operational history.
-- Requires 010_saas_identity.sql and 030_business_risk.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS compliance_action_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  compliance_action_id TEXT NOT NULL REFERENCES compliance_actions(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_type TEXT NOT NULL DEFAULT 'USER',
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  note TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_compliance_action_events_action
  ON compliance_action_events(organization_id, compliance_action_id, created_at);

CREATE TABLE IF NOT EXISTS compliance_action_dependencies (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  compliance_action_id TEXT NOT NULL REFERENCES compliance_actions(id) ON DELETE CASCADE,
  depends_on_action_id TEXT NOT NULL REFERENCES compliance_actions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL,
  CHECK (compliance_action_id <> depends_on_action_id),
  UNIQUE(organization_id, compliance_action_id, depends_on_action_id)
);
CREATE INDEX IF NOT EXISTS idx_action_dependencies_target
  ON compliance_action_dependencies(organization_id, depends_on_action_id);

CREATE TABLE IF NOT EXISTS business_onboarding_sessions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'NOT_STARTED'
    CHECK (status IN ('NOT_STARTED','IN_PROGRESS','BLOCKED','COMPLETED','ABANDONED')),
  current_step TEXT NOT NULL DEFAULT 'COMPANY_PROFILE',
  completed_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  missing_milestones JSONB NOT NULL DEFAULT '[]'::jsonb,
  activation_signal TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS business_onboarding_facts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES business_onboarding_sessions(id) ON DELETE CASCADE,
  fact_key TEXT NOT NULL,
  value JSONB,
  confidence TEXT NOT NULL DEFAULT 'KNOWN'
    CHECK (confidence IN ('KNOWN','UNKNOWN','ESTIMATED','VERIFIED')),
  source TEXT NOT NULL DEFAULT 'USER',
  answered_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  answered_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE(organization_id, fact_key)
);
CREATE INDEX IF NOT EXISTS idx_onboarding_facts_session
  ON business_onboarding_facts(organization_id, session_id);

CREATE TABLE IF NOT EXISTS employee_import_jobs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requested_by_user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','VALIDATING','READY','IMPORTING','COMPLETED','FAILED','CANCELLED')),
  source_type TEXT NOT NULL DEFAULT 'CSV' CHECK (source_type IN ('CSV','MANUAL','INTEGRATION')),
  source_object_ref TEXT,
  total_rows INTEGER NOT NULL DEFAULT 0,
  accepted_rows INTEGER NOT NULL DEFAULT 0,
  rejected_rows INTEGER NOT NULL DEFAULT 0,
  error_summary JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_employee_import_jobs_org
  ON employee_import_jobs(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS onboarding_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES business_onboarding_sessions(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  step TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_onboarding_events_session
  ON onboarding_events(organization_id, session_id, created_at);

COMMIT;
