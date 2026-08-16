CREATE TABLE IF NOT EXISTS legal_source_watches (
  id TEXT PRIMARY KEY,
  canonical_source_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('STATUTE','DECREE','REGULATION_NOTICE','AGENCY_PROCEDURE','ADMIN_INTERPRETATION','PRECEDENT_DECISION','GOVERNMENT_GUIDE')),
  official_url TEXT NOT NULL,
  adapter_key TEXT NOT NULL DEFAULT 'OFFICIAL_HTTP' CHECK (adapter_key IN ('OFFICIAL_HTTP')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_checked_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_content_hash TEXT,
  last_etag TEXT,
  last_modified TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (canonical_source_id, official_url)
);

CREATE TABLE IF NOT EXISTS legal_source_monitor_runs (
  id TEXT PRIMARY KEY,
  watch_id TEXT NOT NULL REFERENCES legal_source_watches(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('STARTED','BASELINED','UNCHANGED','CHANGE_DETECTED','FAILED')),
  previous_content_hash TEXT,
  current_content_hash TEXT,
  http_status INTEGER,
  candidate_id TEXT REFERENCES legal_change_candidates(id) ON DELETE SET NULL,
  error_code TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS legal_source_watches_enabled_idx
  ON legal_source_watches(enabled, updated_at DESC);
CREATE INDEX IF NOT EXISTS legal_source_monitor_runs_watch_idx
  ON legal_source_monitor_runs(watch_id, started_at DESC);
CREATE INDEX IF NOT EXISTS legal_source_monitor_runs_status_idx
  ON legal_source_monitor_runs(status, started_at DESC);
