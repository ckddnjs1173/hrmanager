-- Insaya PostgreSQL target schema: existing 1.0 Worker / booking / expert operations data.
-- This file is a migration target contract. Production runtime remains SQLite until the async
-- repository adapter/cutover bundle is validated.

BEGIN;

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'received',
  name TEXT,
  contact TEXT,
  nomu TEXT,
  message TEXT,
  summary TEXT,
  consent BOOLEAN NOT NULL DEFAULT FALSE,
  assigned TEXT NOT NULL DEFAULT '',
  assigned_nomusa_id TEXT NOT NULL DEFAULT '',
  memo TEXT NOT NULL DEFAULT '',
  token TEXT,
  expires TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_token ON bookings(token);

CREATE TABLE IF NOT EXISTS booking_events (
  id BIGSERIAL PRIMARY KEY,
  booking_id TEXT,
  at TIMESTAMPTZ,
  type TEXT,
  actor TEXT,
  note TEXT
);

CREATE TABLE IF NOT EXISTS access_logs (
  id BIGSERIAL PRIMARY KEY,
  booking_id TEXT,
  token TEXT,
  at TIMESTAMPTZ,
  ip_hash TEXT,
  ua TEXT
);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  at TIMESTAMPTZ,
  kind TEXT,
  name TEXT,
  contact TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'new'
);

CREATE TABLE IF NOT EXISTS nomusa (
  id TEXT PRIMARY KEY,
  name TEXT,
  loc TEXT,
  sido TEXT,
  opted_out BOOLEAN NOT NULL DEFAULT FALSE,
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  doc JSONB
);
CREATE INDEX IF NOT EXISTS idx_nomusa_sido ON nomusa(sido);

CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  at TIMESTAMPTZ,
  type TEXT,
  ref TEXT,
  meta JSONB
);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  at TIMESTAMPTZ,
  channel TEXT,
  recipient TEXT,
  template TEXT,
  subject TEXT,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'logged'
);

CREATE TABLE IF NOT EXISTS nomusa_accounts (
  id BIGSERIAL PRIMARY KEY,
  nomusa_id TEXT,
  name TEXT,
  token_hash TEXT,
  created_at TIMESTAMPTZ,
  last_login TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_nacc_token ON nomusa_accounts(token_hash);

CREATE TABLE IF NOT EXISTS feedback (
  id BIGSERIAL PRIMARY KEY,
  at TIMESTAMPTZ,
  kind TEXT,
  ref TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'new'
);

-- Worker Case security realm. Deliberately no organization_id and no user_id.
CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'intake',
  user_type TEXT NOT NULL DEFAULT 'worker',
  case_type TEXT NOT NULL DEFAULT 'unknown',
  title TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  event_date DATE,
  period_start DATE,
  period_end DATE,
  employment_start_date DATE,
  employment_end_date DATE,
  facts JSONB NOT NULL DEFAULT '{}'::jsonb,
  missing_facts JSONB NOT NULL DEFAULT '[]'::jsonb,
  issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  calculations JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  documents JSONB NOT NULL DEFAULT '[]'::jsonb,
  legal_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_type ON cases(case_type);
CREATE INDEX IF NOT EXISTS idx_cases_updated_at ON cases(updated_at);

CREATE TABLE IF NOT EXISTS case_events (
  id BIGSERIAL PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  at TIMESTAMPTZ NOT NULL,
  type TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'system',
  note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_case_events_case ON case_events(case_id, at);

CREATE TABLE IF NOT EXISTS case_access_tokens (
  case_id TEXT PRIMARY KEY REFERENCES cases(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_case_access_token_hash ON case_access_tokens(token_hash);

COMMIT;
