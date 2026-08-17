-- Email-bound invitation intent for External Advisor collaboration.
-- Account existence is not looked up at issuance time. Acceptance requires an authenticated
-- user whose verified session email matches advisor_email_normalized.

BEGIN;

CREATE TABLE IF NOT EXISTS external_advisor_invitations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL CHECK (resource_type='BUSINESS_CASE'),
  resource_id TEXT NOT NULL REFERENCES business_cases(id) ON DELETE CASCADE,
  advisor_email_normalized TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  permissions JSONB NOT NULL,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','REVOKED')),
  created_at TIMESTAMPTZ NOT NULL,
  invitation_expires_at TIMESTAMPTZ NOT NULL,
  grant_expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by_user_id TEXT REFERENCES users(id),
  share_grant_id TEXT REFERENCES external_advisor_share_grants(id),
  revoked_at TIMESTAMPTZ,
  revoked_by_user_id TEXT REFERENCES users(id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CHECK (invitation_expires_at > created_at),
  CHECK (grant_expires_at > invitation_expires_at),
  CHECK (jsonb_typeof(permissions)='array'),
  CHECK (permissions @> '["case.read"]'::jsonb),
  CHECK (permissions <@ '["case.read","document.read","document.review","comment.create"]'::jsonb),
  CHECK (NOT (permissions ? 'document.review') OR permissions ? 'document.read'),
  CHECK (
    (status='PENDING' AND accepted_at IS NULL AND accepted_by_user_id IS NULL AND share_grant_id IS NULL AND revoked_at IS NULL AND revoked_by_user_id IS NULL)
    OR (status='ACCEPTED' AND accepted_at IS NOT NULL AND accepted_by_user_id IS NOT NULL AND share_grant_id IS NOT NULL AND revoked_at IS NULL AND revoked_by_user_id IS NULL)
    OR (status='REVOKED' AND accepted_at IS NULL AND accepted_by_user_id IS NULL AND share_grant_id IS NULL AND revoked_at IS NOT NULL AND revoked_by_user_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_external_advisor_invitation_pending
  ON external_advisor_invitations(organization_id,resource_type,resource_id,advisor_email_normalized)
  WHERE status='PENDING';
CREATE INDEX IF NOT EXISTS idx_external_advisor_invitations_org
  ON external_advisor_invitations(organization_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_external_advisor_invitations_email
  ON external_advisor_invitations(advisor_email_normalized,status,invitation_expires_at);

CREATE TABLE IF NOT EXISTS external_advisor_invitation_events (
  id TEXT PRIMARY KEY,
  invitation_id TEXT NOT NULL REFERENCES external_advisor_invitations(id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('CREATED','ACCEPTED','REVOKED')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_external_advisor_invitation_events_invitation
  ON external_advisor_invitation_events(invitation_id,created_at ASC,id ASC);

COMMIT;
