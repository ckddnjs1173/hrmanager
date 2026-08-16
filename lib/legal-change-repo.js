import crypto from "node:crypto";
import { getRuntimePostgresPool } from "./runtime-postgres.js";
import { withPostgresTransaction } from "./postgres-client.js";
import {
  assertCandidateTransition,
  assertProposalTransition,
  stableHash,
  validateLegalChangeCandidate,
  validateRuleProposal,
} from "./legal-change-contract.js";

const id = (prefix) => `${prefix}_${crypto.randomUUID()}`;
const nowISO = () => new Date().toISOString();
const dateOnly = (value) => value instanceof Date ? value.toISOString().slice(0, 10) : (value == null ? null : String(value).slice(0, 10));
const iso = (value) => value instanceof Date ? value.toISOString() : value;

function mapCandidate(row) {
  if (!row) return null;
  return {
    id: row.id,
    sourceType: row.source_type,
    canonicalSourceId: row.canonical_source_id,
    authority: row.authority,
    title: row.title,
    article: row.article,
    officialUrl: row.official_url,
    sourcePublishedAt: dateOnly(row.source_published_at),
    effectiveFrom: dateOnly(row.effective_from),
    effectiveTo: dateOnly(row.effective_to),
    changeNote: row.change_note,
    sourceSnapshot: row.source_snapshot || {},
    contentHash: row.content_hash,
    detectedBy: row.detected_by,
    status: row.status,
    createdBy: row.created_by,
    submittedAt: iso(row.submitted_at),
    verifiedAt: iso(row.verified_at),
    rejectedAt: iso(row.rejected_at),
    supersededAt: iso(row.superseded_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapProposal(row) {
  if (!row) return null;
  return {
    id: row.id,
    candidateId: row.candidate_id,
    ruleKey: row.rule_key,
    currentRuleVersion: row.current_rule_version,
    proposedRuleVersion: row.proposed_rule_version,
    proposedEffectiveFrom: dateOnly(row.proposed_effective_from),
    proposedChange: row.proposed_change || {},
    fixtureEvidence: row.fixture_evidence || [],
    fixtureEvidenceHash: row.fixture_evidence_hash,
    status: row.status,
    createdBy: row.created_by,
    verifiedBy: row.verified_by,
    verifiedAt: iso(row.verified_at),
    readyForImplementationAt: iso(row.ready_for_implementation_at),
    rejectedAt: iso(row.rejected_at),
    supersededAt: iso(row.superseded_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

async function event(client, { candidateId = null, proposalId = null, actor, eventType, fromStatus = null, toStatus = null, metadata = {} }) {
  await client.query(
    `INSERT INTO legal_governance_events
      (id,candidate_id,proposal_id,actor,event_type,from_status,to_status,metadata,created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id("lge"), candidateId, proposalId, actor, eventType, fromStatus, toStatus, JSON.stringify(metadata || {}), nowISO()],
  );
}

export async function createLegalChangeCandidate(input = {}) {
  const validation = validateLegalChangeCandidate(input);
  if (!validation.ok) throw new Error(validation.errors[0]);
  const candidateId = id("lgc");
  const now = nowISO();
  const contentHash = stableHash({
    sourceType: input.sourceType,
    canonicalSourceId: input.canonicalSourceId || null,
    authority: String(input.authority).trim(),
    title: String(input.title).trim(),
    article: input.article || null,
    officialUrl: input.officialUrl,
    sourcePublishedAt: input.sourcePublishedAt || null,
    effectiveFrom: input.effectiveFrom || null,
    effectiveTo: input.effectiveTo || null,
    sourceSnapshot: input.sourceSnapshot,
  });
  return withPostgresTransaction(getRuntimePostgresPool(), async (client) => {
    const duplicate = await client.query(
      "SELECT id FROM legal_change_candidates WHERE content_hash=$1 AND status <> 'REJECTED' LIMIT 1",
      [contentHash],
    );
    if (duplicate.rowCount) throw new Error("legal_change_duplicate");
    await client.query(
      `INSERT INTO legal_change_candidates
       (id,source_type,canonical_source_id,authority,title,article,official_url,source_published_at,effective_from,effective_to,
        change_note,source_snapshot,content_hash,detected_by,status,created_by,submitted_at,verified_at,rejected_at,superseded_at,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'DRAFT',$15,NULL,NULL,NULL,NULL,$16,$16)`,
      [candidateId, input.sourceType, input.canonicalSourceId || null, String(input.authority).trim(), String(input.title).trim(), input.article || null, input.officialUrl,
        input.sourcePublishedAt || null, input.effectiveFrom || null, input.effectiveTo || null, String(input.changeNote || "").trim(), JSON.stringify(input.sourceSnapshot),
        contentHash, input.detectedBy || "MANUAL", String(input.createdBy).trim(), now],
    );
    await event(client, { candidateId, actor: input.createdBy, eventType: "CANDIDATE_CREATED", toStatus: "DRAFT", metadata: { contentHash } });
    const row = await client.query("SELECT * FROM legal_change_candidates WHERE id=$1", [candidateId]);
    return mapCandidate(row.rows[0]);
  });
}

export async function getLegalChangeCandidate(candidateId) {
  const row = await getRuntimePostgresPool().query("SELECT * FROM legal_change_candidates WHERE id=$1", [candidateId]);
  return mapCandidate(row.rows[0]);
}

export async function listLegalChangeCandidates({ status = null, limit = 100 } = {}) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
  const result = status
    ? await getRuntimePostgresPool().query("SELECT * FROM legal_change_candidates WHERE status=$1 ORDER BY created_at DESC LIMIT $2", [status, safeLimit])
    : await getRuntimePostgresPool().query("SELECT * FROM legal_change_candidates ORDER BY created_at DESC LIMIT $1", [safeLimit]);
  return result.rows.map(mapCandidate);
}

export async function submitLegalChangeCandidate({ candidateId, actor } = {}) {
  if (!actor) throw new Error("legal_change_actor_required");
  return withPostgresTransaction(getRuntimePostgresPool(), async (client) => {
    const locked = await client.query("SELECT * FROM legal_change_candidates WHERE id=$1 FOR UPDATE", [candidateId]);
    if (!locked.rows[0]) throw new Error("legal_change_not_found");
    const row = locked.rows[0];
    assertCandidateTransition(row.status, "IN_REVIEW");
    const now = nowISO();
    await client.query("UPDATE legal_change_candidates SET status='IN_REVIEW',submitted_at=COALESCE(submitted_at,$1),updated_at=$1 WHERE id=$2", [now, candidateId]);
    await event(client, { candidateId, actor, eventType: "CANDIDATE_SUBMITTED", fromStatus: row.status, toStatus: "IN_REVIEW" });
    const updated = await client.query("SELECT * FROM legal_change_candidates WHERE id=$1", [candidateId]);
    return mapCandidate(updated.rows[0]);
  });
}

export async function reviewLegalChangeCandidate({ candidateId, reviewer, decision, note = "", metadata = {} } = {}) {
  if (!reviewer) throw new Error("legal_change_reviewer_required");
  if (!['VERIFY','REJECT','REQUEST_CHANGES'].includes(decision)) throw new Error("legal_change_review_decision_invalid");
  return withPostgresTransaction(getRuntimePostgresPool(), async (client) => {
    const locked = await client.query("SELECT * FROM legal_change_candidates WHERE id=$1 FOR UPDATE", [candidateId]);
    if (!locked.rows[0]) throw new Error("legal_change_not_found");
    const row = locked.rows[0];
    if (row.status !== "IN_REVIEW") throw new Error("legal_change_review_not_allowed");
    const toStatus = decision === "VERIFY" ? "VERIFIED" : decision === "REJECT" ? "REJECTED" : "DRAFT";
    assertCandidateTransition(row.status, toStatus);
    const now = nowISO();
    const snapshotHash = stableHash(row.source_snapshot || {});
    await client.query(
      `INSERT INTO legal_change_reviews
       (id,candidate_id,reviewer,decision,note,source_snapshot_hash,metadata,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id("lgr"), candidateId, reviewer, decision, String(note || "").trim(), snapshotHash, JSON.stringify(metadata || {}), now],
    );
    await client.query(
      `UPDATE legal_change_candidates SET status=$1,
       verified_at=CASE WHEN $1='VERIFIED' THEN $2 ELSE verified_at END,
       rejected_at=CASE WHEN $1='REJECTED' THEN $2 ELSE rejected_at END,
       updated_at=$2 WHERE id=$3`,
      [toStatus, now, candidateId],
    );
    await event(client, { candidateId, actor: reviewer, eventType: `CANDIDATE_${decision}`, fromStatus: row.status, toStatus, metadata: { note: String(note || "").trim(), snapshotHash } });
    const updated = await client.query("SELECT * FROM legal_change_candidates WHERE id=$1", [candidateId]);
    return mapCandidate(updated.rows[0]);
  });
}

export async function createLegalRuleProposal(input = {}) {
  const validation = validateRuleProposal(input);
  if (!validation.ok) throw new Error(validation.errors[0]);
  const proposalId = id("lgp");
  const now = nowISO();
  return withPostgresTransaction(getRuntimePostgresPool(), async (client) => {
    const candidate = await client.query("SELECT * FROM legal_change_candidates WHERE id=$1", [input.candidateId]);
    if (!candidate.rows[0]) throw new Error("legal_change_not_found");
    if (candidate.rows[0].status !== "VERIFIED") throw new Error("legal_proposal_candidate_not_verified");
    await client.query(
      `INSERT INTO legal_rule_change_proposals
       (id,candidate_id,rule_key,current_rule_version,proposed_rule_version,proposed_effective_from,proposed_change,fixture_evidence,fixture_evidence_hash,
        status,created_by,verified_by,verified_at,ready_for_implementation_at,rejected_at,superseded_at,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'[]'::jsonb,NULL,'DRAFT',$8,NULL,NULL,NULL,NULL,NULL,$9,$9)`,
      [proposalId, input.candidateId, String(input.ruleKey).trim(), input.currentRuleVersion || null, String(input.proposedRuleVersion).trim(), input.proposedEffectiveFrom,
        JSON.stringify(input.proposedChange), String(input.createdBy).trim(), now],
    );
    await event(client, { candidateId: input.candidateId, proposalId, actor: input.createdBy, eventType: "RULE_PROPOSAL_CREATED", toStatus: "DRAFT", metadata: { ruleKey: input.ruleKey } });
    const result = await client.query("SELECT * FROM legal_rule_change_proposals WHERE id=$1", [proposalId]);
    return mapProposal(result.rows[0]);
  });
}

export async function attachProposalFixtures({ proposalId, actor, fixtures = [] } = {}) {
  if (!actor) throw new Error("legal_change_actor_required");
  if (!Array.isArray(fixtures) || fixtures.length < 1) throw new Error("legal_proposal_fixture_evidence_required");
  return withPostgresTransaction(getRuntimePostgresPool(), async (client) => {
    const locked = await client.query(
      `SELECT p.*,c.status AS candidate_status FROM legal_rule_change_proposals p
       JOIN legal_change_candidates c ON c.id=p.candidate_id WHERE p.id=$1 FOR UPDATE`,
      [proposalId],
    );
    if (!locked.rows[0]) throw new Error("legal_proposal_not_found");
    const row = locked.rows[0];
    const target = row.status === "DRAFT" ? "READY_FOR_TEST" : row.status;
    if (row.status === "DRAFT") assertProposalTransition(row.status, target, { candidateStatus: row.candidate_status, fixtureEvidence: fixtures });
    if (!["DRAFT","READY_FOR_TEST"].includes(row.status)) throw new Error("legal_proposal_fixture_update_not_allowed");
    for (const fixture of fixtures) {
      if (!fixture || typeof fixture !== "object" || !String(fixture.name || "").trim() || !("expected" in fixture)) throw new Error("legal_proposal_fixture_invalid");
    }
    const now = nowISO();
    const evidenceHash = stableHash(fixtures);
    await client.query("UPDATE legal_rule_change_proposals SET fixture_evidence=$1,fixture_evidence_hash=$2,status=$3,updated_at=$4 WHERE id=$5", [JSON.stringify(fixtures), evidenceHash, target, now, proposalId]);
    await event(client, { candidateId: row.candidate_id, proposalId, actor, eventType: "RULE_PROPOSAL_FIXTURES_ATTACHED", fromStatus: row.status, toStatus: target, metadata: { evidenceHash, fixtureCount: fixtures.length } });
    const result = await client.query("SELECT * FROM legal_rule_change_proposals WHERE id=$1", [proposalId]);
    return mapProposal(result.rows[0]);
  });
}

export async function verifyLegalRuleProposal({ proposalId, reviewer } = {}) {
  if (!reviewer) throw new Error("legal_change_reviewer_required");
  return withPostgresTransaction(getRuntimePostgresPool(), async (client) => {
    const locked = await client.query(
      `SELECT p.*,c.status AS candidate_status FROM legal_rule_change_proposals p
       JOIN legal_change_candidates c ON c.id=p.candidate_id WHERE p.id=$1 FOR UPDATE`,
      [proposalId],
    );
    if (!locked.rows[0]) throw new Error("legal_proposal_not_found");
    const row = locked.rows[0];
    assertProposalTransition(row.status, "VERIFIED", { candidateStatus: row.candidate_status, fixtureEvidence: row.fixture_evidence || [] });
    const now = nowISO();
    await client.query("UPDATE legal_rule_change_proposals SET status='VERIFIED',verified_by=$1,verified_at=$2,updated_at=$2 WHERE id=$3", [reviewer, now, proposalId]);
    await event(client, { candidateId: row.candidate_id, proposalId, actor: reviewer, eventType: "RULE_PROPOSAL_VERIFIED", fromStatus: row.status, toStatus: "VERIFIED", metadata: { fixtureEvidenceHash: row.fixture_evidence_hash } });
    const result = await client.query("SELECT * FROM legal_rule_change_proposals WHERE id=$1", [proposalId]);
    return mapProposal(result.rows[0]);
  });
}

export async function markProposalReadyForImplementation({ proposalId, actor } = {}) {
  if (!actor) throw new Error("legal_change_actor_required");
  return withPostgresTransaction(getRuntimePostgresPool(), async (client) => {
    const locked = await client.query(
      `SELECT p.*,c.status AS candidate_status FROM legal_rule_change_proposals p
       JOIN legal_change_candidates c ON c.id=p.candidate_id WHERE p.id=$1 FOR UPDATE`,
      [proposalId],
    );
    if (!locked.rows[0]) throw new Error("legal_proposal_not_found");
    const row = locked.rows[0];
    assertProposalTransition(row.status, "READY_FOR_IMPLEMENTATION", { candidateStatus: row.candidate_status, fixtureEvidence: row.fixture_evidence || [] });
    const now = nowISO();
    await client.query("UPDATE legal_rule_change_proposals SET status='READY_FOR_IMPLEMENTATION',ready_for_implementation_at=$1,updated_at=$1 WHERE id=$2", [now, proposalId]);
    await event(client, { candidateId: row.candidate_id, proposalId, actor, eventType: "RULE_PROPOSAL_READY_FOR_IMPLEMENTATION", fromStatus: row.status, toStatus: "READY_FOR_IMPLEMENTATION" });
    const result = await client.query("SELECT * FROM legal_rule_change_proposals WHERE id=$1", [proposalId]);
    return mapProposal(result.rows[0]);
  });
}

export async function listLegalRuleProposals({ candidateId = null, limit = 100 } = {}) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
  const result = candidateId
    ? await getRuntimePostgresPool().query("SELECT * FROM legal_rule_change_proposals WHERE candidate_id=$1 ORDER BY created_at DESC LIMIT $2", [candidateId, safeLimit])
    : await getRuntimePostgresPool().query("SELECT * FROM legal_rule_change_proposals ORDER BY created_at DESC LIMIT $1", [safeLimit]);
  return result.rows.map(mapProposal);
}

export async function listLegalGovernanceEvents({ candidateId = null, proposalId = null, limit = 200 } = {}) {
  const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 200));
  let result;
  if (proposalId) result = await getRuntimePostgresPool().query("SELECT * FROM legal_governance_events WHERE proposal_id=$1 ORDER BY created_at LIMIT $2", [proposalId, safeLimit]);
  else if (candidateId) result = await getRuntimePostgresPool().query("SELECT * FROM legal_governance_events WHERE candidate_id=$1 ORDER BY created_at LIMIT $2", [candidateId, safeLimit]);
  else result = await getRuntimePostgresPool().query("SELECT * FROM legal_governance_events ORDER BY created_at DESC LIMIT $1", [safeLimit]);
  return result.rows.map((row) => ({
    id: row.id,
    candidateId: row.candidate_id,
    proposalId: row.proposal_id,
    actor: row.actor,
    eventType: row.event_type,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    metadata: row.metadata || {},
    createdAt: iso(row.created_at),
  }));
}
