-- External Advisor ShareGrant control plane.
-- This intentionally does not reuse the older generic share_grants table because V1 advisor
-- access needs a narrower permission vocabulary, explicit acceptance, mandatory expiry and
-- append-only lifecycle events.

BEGIN;

CREATE TABLE IF NOT EXISTS external_advisor_share_grants (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('BUSINESS_CASE')),
  resource_id TEXT NOT NULL,
  advisor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permissions JSONB NOT NULL,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACTIVE','REVOKED')),
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_by_user_id TEXT REFERENCES users(id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CHECK (expires_at > created_at),
  CHECK (jsonb_typeof(permissions) = 'array'),
  CHECK (permissions @> '["case.read"]'::jsonb),
  CHECK (permissions <@ '["case.read","document.read","document.review","comment.create"]'::jsonb),
  CHECK (NOT (permissions ? 'document.review') OR permissions ? 'document.read'),
  CHECK (
    (status='PENDING' AND accepted_at IS NULL AND revoked_at IS NULL AND revoked_by_user_id IS NULL)
    OR (status='ACTIVE' AND accepted_at IS NOT NULL AND revoked_at IS NULL AND revoked_by_user_id IS NULL)
    OR (status='REVOKED' AND revoked_at IS NOT NULL AND revoked_by_user_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_external_advisor_share_grants_live
  ON external_advisor_share_grants(organization_id, resource_type, resource_id, advisor_user_id)
  WHERE status IN ('PENDING','ACTIVE');
CREATE INDEX IF NOT EXISTS idx_external_advisor_share_grants_org
  ON external_advisor_share_grants(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_external_advisor_share_grants_advisor
  ON external_advisor_share_grants(advisor_user_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_external_advisor_share_grants_resource
  ON external_advisor_share_grants(organization_id, resource_type, resource_id, status);

CREATE TABLE IF NOT EXISTS external_advisor_share_grant_events (
  id TEXT PRIMARY KEY,
  share_grant_id TEXT NOT NULL REFERENCES external_advisor_share_grants(id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('CREATED','ACCEPTED','REVOKED')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_external_advisor_share_grant_events_grant
  ON external_advisor_share_grant_events(share_grant_id, created_at ASC);

COMMIT;
