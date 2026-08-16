-- Insaya Business deterministic Risk Engine persistence.
-- Rule definitions remain versioned application/legal-registry assets. This schema stores
-- evaluation runs, resulting findings and concrete remediation actions.

BEGIN;

CREATE TABLE IF NOT EXISTS risk_evaluation_runs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  compliance_scope_id TEXT REFERENCES compliance_scopes(id) ON DELETE SET NULL,
  trigger_type TEXT NOT NULL,
  legal_registry_version TEXT NOT NULL,
  input_snapshot_hash TEXT,
  status TEXT NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING','COMPLETED','FAILED')),
  critical_count INTEGER NOT NULL DEFAULT 0,
  high_count INTEGER NOT NULL DEFAULT 0,
  medium_count INTEGER NOT NULL DEFAULT 0,
  info_count INTEGER NOT NULL DEFAULT 0,
  uncertain_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_risk_runs_org ON risk_evaluation_runs(organization_id, started_at DESC);

CREATE TABLE IF NOT EXISTS risk_findings (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  compliance_scope_id TEXT REFERENCES compliance_scopes(id) ON DELETE SET NULL,
  evaluation_run_id TEXT REFERENCES risk_evaluation_runs(id) ON DELETE SET NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT,
  fingerprint TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  rule_version TEXT NOT NULL,
  domain TEXT NOT NULL,
  title TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('CRITICAL','HIGH','MEDIUM','INFO')),
  applicability TEXT NOT NULL CHECK (applicability IN ('APPLIES','NOT_APPLIES','UNCERTAIN')),
  status TEXT NOT NULL CHECK (status IN ('OPEN','ACKNOWLEDGED','RESOLVED','SUPPRESSED')),
  explanation TEXT NOT NULL DEFAULT '',
  missing_facts JSONB NOT NULL DEFAULT '[]'::jsonb,
  legal_source_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommended_action_key TEXT,
  due_at TIMESTAMPTZ,
  detected_at TIMESTAMPTZ NOT NULL,
  last_evaluated_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  suppressed_until TIMESTAMPTZ,
  suppression_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE(organization_id, fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_risk_findings_org_status ON risk_findings(organization_id, status, severity);
CREATE INDEX IF NOT EXISTS idx_risk_findings_scope ON risk_findings(organization_id, compliance_scope_id, status);
CREATE INDEX IF NOT EXISTS idx_risk_findings_subject ON risk_findings(organization_id, subject_type, subject_id);

CREATE TABLE IF NOT EXISTS compliance_actions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  risk_finding_id TEXT REFERENCES risk_findings(id) ON DELETE SET NULL,
  action_key TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','BLOCKED','DONE','DISMISSED')),
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('CRITICAL','HIGH','MEDIUM','INFO')),
  owner_membership_id TEXT REFERENCES organization_memberships(id) ON DELETE SET NULL,
  due_at TIMESTAMPTZ,
  blocked_reason TEXT,
  completed_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  dismissed_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_compliance_actions_org_status ON compliance_actions(organization_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_compliance_actions_risk ON compliance_actions(organization_id, risk_finding_id);

CREATE TABLE IF NOT EXISTS risk_finding_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  risk_finding_id TEXT NOT NULL REFERENCES risk_findings(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_risk_events_finding ON risk_finding_events(organization_id, risk_finding_id, created_at);

COMMIT;
