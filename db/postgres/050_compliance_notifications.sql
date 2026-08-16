-- Insaya Business compliance deadline notification substrate.
-- Requires 010_saas_identity.sql and 030_business_risk.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS compliance_notification_outbox (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'IN_APP' CHECK (channel IN ('IN_APP')),
  source_type TEXT NOT NULL CHECK (source_type IN ('COMPLIANCE_ACTION')),
  source_id TEXT NOT NULL REFERENCES compliance_actions(id) ON DELETE CASCADE,
  notification_key TEXT NOT NULL,
  dedup_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','DELIVERED','CANCELLED','FAILED')),
  scheduled_for TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  delivered_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  failure_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_notification_outbox_pending
  ON compliance_notification_outbox(status, scheduled_for, organization_id);
CREATE INDEX IF NOT EXISTS idx_notification_outbox_source
  ON compliance_notification_outbox(organization_id, source_type, source_id, status);

CREATE TABLE IF NOT EXISTS in_app_notifications (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  outbox_id TEXT NOT NULL UNIQUE REFERENCES compliance_notification_outbox(id) ON DELETE CASCADE,
  notification_key TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'INFO' CHECK (severity IN ('INFO','WARNING','CRITICAL')),
  source_type TEXT NOT NULL CHECK (source_type IN ('COMPLIANCE_ACTION')),
  source_id TEXT NOT NULL REFERENCES compliance_actions(id) ON DELETE CASCADE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  read_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_in_app_notifications_recipient
  ON in_app_notifications(organization_id, recipient_user_id, read_at, created_at DESC);

COMMIT;