-- Insaya Business monthly compliance operational close.
-- A close is an internal operational record, not a legal-compliance certification.

BEGIN;

CREATE TABLE IF NOT EXISTS compliance_close_periods (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period_month TEXT NOT NULL CHECK (period_month ~ '^\d{4}-\d{2}$'),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED')),
  current_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_snapshot_hash TEXT,
  last_refreshed_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  closed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  close_note TEXT NOT NULL DEFAULT '',
  unresolved_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE(organization_id, period_month)
);
CREATE INDEX IF NOT EXISTS idx_compliance_close_periods_org
  ON compliance_close_periods(organization_id, period_month DESC);

CREATE TABLE IF NOT EXISTS compliance_close_snapshots (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period_id TEXT NOT NULL REFERENCES compliance_close_periods(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version >= 1),
  snapshot_hash TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL,
  generated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE(period_id, version),
  UNIQUE(period_id, snapshot_hash)
);
CREATE INDEX IF NOT EXISTS idx_compliance_close_snapshots_period
  ON compliance_close_snapshots(organization_id, period_id, version DESC);

CREATE TABLE IF NOT EXISTS compliance_close_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period_id TEXT NOT NULL REFERENCES compliance_close_periods(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('REFRESHED','CLOSED')),
  from_status TEXT,
  to_status TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_compliance_close_events_period
  ON compliance_close_events(organization_id, period_id, created_at);

COMMIT;