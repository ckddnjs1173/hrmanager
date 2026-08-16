-- Bundle 10: runtime support for deterministic Business Risk scanning and action history.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS idx_compliance_actions_finding_key_unique
  ON compliance_actions(organization_id, risk_finding_id, action_key)
  WHERE risk_finding_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS compliance_action_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  compliance_action_id TEXT NOT NULL REFERENCES compliance_actions(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  note TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_compliance_action_events_action
  ON compliance_action_events(organization_id, compliance_action_id, created_at);

COMMIT;
