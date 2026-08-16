-- SaaS authentication runtime additions.
-- Raw magic-link, invite and session tokens are never persisted; only SHA-256 hashes are stored.

BEGIN;

CREATE TABLE IF NOT EXISTS auth_challenges (
  id TEXT PRIMARY KEY,
  email_normalized TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL DEFAULT 'LOGIN' CHECK (purpose IN ('LOGIN')),
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  requested_ip_hash TEXT,
  request_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_auth_challenges_email ON auth_challenges(email_normalized, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_challenges_expiry ON auth_challenges(expires_at) WHERE consumed_at IS NULL;

-- Global authentication/security events cannot use audit_logs because audit_logs is tenant-owned.
CREATE TABLE IF NOT EXISTS security_events (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  event TEXT NOT NULL,
  result TEXT NOT NULL DEFAULT 'SUCCESS',
  request_id TEXT,
  ip_hash TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_security_events_user_time ON security_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_event_time ON security_events(event, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_sessions_token_active
  ON user_sessions(token_hash, expires_at)
  WHERE revoked_at IS NULL;

COMMIT;
