-- Insaya Legal Change Governance control plane.
-- This schema stages official-source changes for human review. It never mutates
-- runtime legal rules automatically.

BEGIN;

CREATE TABLE IF NOT EXISTS legal_change_candidates (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (source_type IN (
    'STATUTE','DECREE','REGULATION_NOTICE','AGENCY_PROCEDURE',
    'ADMIN_INTERPRETATION','PRECEDENT_DECISION','GOVERNMENT_GUIDE'
  )),
  canonical_source_id TEXT,
  authority TEXT NOT NULL,
  title TEXT NOT NULL,
  article TEXT,
  official_url TEXT NOT NULL,
  source_published_at DATE,
  effective_from DATE,
  effective_to DATE,
  change_note TEXT NOT NULL DEFAULT '',
  source_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  content_hash TEXT NOT NULL,
  detected_by TEXT NOT NULL DEFAULT 'MANUAL'
    CHECK (detected_by IN ('MANUAL','OFFICIAL_ADAPTER')),
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','IN_REVIEW','VERIFIED','REJECTED','SUPERSEDED')),
  created_by TEXT NOT NULL,
  submitted_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  superseded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);
CREATE INDEX IF NOT EXISTS idx_legal_change_candidates_status
  ON legal_change_candidates(status, effective_from, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_legal_change_candidates_source
  ON legal_change_candidates(canonical_source_id, content_hash);

CREATE TABLE IF NOT EXISTS legal_change_reviews (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES legal_change_candidates(id) ON DELETE CASCADE,
  reviewer TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('VERIFY','REJECT','REQUEST_CHANGES')),
  note TEXT NOT NULL DEFAULT '',
  source_snapshot_hash TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_legal_change_reviews_candidate
  ON legal_change_reviews(candidate_id, created_at);

CREATE TABLE IF NOT EXISTS legal_rule_change_proposals (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES legal_change_candidates(id) ON DELETE RESTRICT,
  rule_key TEXT NOT NULL,
  current_rule_version TEXT,
  proposed_rule_version TEXT NOT NULL,
  proposed_effective_from DATE NOT NULL,
  proposed_change JSONB NOT NULL DEFAULT '{}'::jsonb,
  fixture_evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  fixture_evidence_hash TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','READY_FOR_TEST','VERIFIED','READY_FOR_IMPLEMENTATION','REJECTED','SUPERSEDED')),
  created_by TEXT NOT NULL,
  verified_by TEXT,
  verified_at TIMESTAMPTZ,
  ready_for_implementation_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  superseded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE(rule_key, proposed_rule_version)
);
CREATE INDEX IF NOT EXISTS idx_legal_rule_change_proposals_candidate
  ON legal_rule_change_proposals(candidate_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS legal_governance_events (
  id TEXT PRIMARY KEY,
  candidate_id TEXT REFERENCES legal_change_candidates(id) ON DELETE CASCADE,
  proposal_id TEXT REFERENCES legal_rule_change_proposals(id) ON DELETE CASCADE,
  actor TEXT NOT NULL,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  CHECK (candidate_id IS NOT NULL OR proposal_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_legal_governance_events_candidate
  ON legal_governance_events(candidate_id, created_at);
CREATE INDEX IF NOT EXISTS idx_legal_governance_events_proposal
  ON legal_governance_events(proposal_id, created_at);

COMMIT;
