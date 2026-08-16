import crypto from "node:crypto";
import { listCanonicalLegalSources } from "./legal-registry.js";

export const LEGAL_SOURCE_TYPES = Object.freeze([
  "STATUTE",
  "DECREE",
  "REGULATION_NOTICE",
  "AGENCY_PROCEDURE",
  "ADMIN_INTERPRETATION",
  "PRECEDENT_DECISION",
  "GOVERNMENT_GUIDE",
]);

export const LEGAL_CHANGE_STATUSES = Object.freeze([
  "DRAFT",
  "IN_REVIEW",
  "VERIFIED",
  "REJECTED",
  "SUPERSEDED",
]);

export const LEGAL_PROPOSAL_STATUSES = Object.freeze([
  "DRAFT",
  "READY_FOR_TEST",
  "VERIFIED",
  "READY_FOR_IMPLEMENTATION",
  "REJECTED",
  "SUPERSEDED",
]);

export const OFFICIAL_LEGAL_HOSTS = Object.freeze([
  "law.go.kr",
  "www.law.go.kr",
  "minimumwage.go.kr",
  "www.minimumwage.go.kr",
  "moel.go.kr",
  "www.moel.go.kr",
  "labor.moel.go.kr",
  "nlrc.go.kr",
  "www.nlrc.go.kr",
]);

const CANDIDATE_TRANSITIONS = Object.freeze({
  DRAFT: ["IN_REVIEW"],
  IN_REVIEW: ["DRAFT", "VERIFIED", "REJECTED"],
  VERIFIED: ["SUPERSEDED"],
  REJECTED: [],
  SUPERSEDED: [],
});

const PROPOSAL_TRANSITIONS = Object.freeze({
  DRAFT: ["READY_FOR_TEST", "REJECTED"],
  READY_FOR_TEST: ["DRAFT", "VERIFIED", "REJECTED"],
  VERIFIED: ["READY_FOR_IMPLEMENTATION", "SUPERSEDED"],
  READY_FOR_IMPLEMENTATION: ["SUPERSEDED"],
  REJECTED: [],
  SUPERSEDED: [],
});

function isIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function stableHash(value) {
  const serialized = typeof value === "string" ? value : JSON.stringify(canonicalize(value));
  return crypto.createHash("sha256").update(serialized).digest("hex");
}

export function canonicalSourceById(id) {
  return listCanonicalLegalSources().find((source) => source.id === id) || null;
}

export function validateOfficialLegalUrl(value) {
  let parsed = null;
  try { parsed = new URL(String(value || "")); } catch {}
  if (!parsed || parsed.protocol !== "https:") return { ok: false, error: "legal_source_official_url_invalid", url: null };
  if (parsed.username || parsed.password) return { ok: false, error: "legal_source_official_url_credentials_forbidden", url: null };
  if (!OFFICIAL_LEGAL_HOSTS.includes(parsed.hostname.toLowerCase())) return { ok: false, error: "legal_source_official_url_invalid", url: null };
  return { ok: true, error: null, url: parsed };
}

export function validateOfficialSource({ sourceType, canonicalSourceId = null, authority, title, officialUrl } = {}) {
  const errors = [];
  if (!LEGAL_SOURCE_TYPES.includes(sourceType)) errors.push("legal_source_type_invalid");
  if (!String(authority || "").trim()) errors.push("legal_source_authority_required");
  if (!String(title || "").trim()) errors.push("legal_source_title_required");
  const officialUrlValidation = validateOfficialLegalUrl(officialUrl);
  if (!officialUrlValidation.ok) errors.push(officialUrlValidation.error);
  if (canonicalSourceId && !canonicalSourceById(canonicalSourceId)) errors.push("legal_source_canonical_id_unknown");
  return { ok: errors.length === 0, errors };
}

export function validateLegalChangeCandidate(input = {}) {
  const source = validateOfficialSource(input);
  const errors = [...source.errors];
  if (!String(input.createdBy || "").trim()) errors.push("legal_change_created_by_required");
  if (!input.sourceSnapshot || typeof input.sourceSnapshot !== "object" || Array.isArray(input.sourceSnapshot) || !Object.keys(input.sourceSnapshot).length) errors.push("legal_change_source_snapshot_required");
  if (input.sourcePublishedAt != null && !isIsoDate(input.sourcePublishedAt)) errors.push("legal_change_source_published_at_invalid");
  if (input.effectiveFrom != null && !isIsoDate(input.effectiveFrom)) errors.push("legal_change_effective_from_invalid");
  if (input.effectiveTo != null && !isIsoDate(input.effectiveTo)) errors.push("legal_change_effective_to_invalid");
  if (input.effectiveFrom && input.effectiveTo && input.effectiveTo < input.effectiveFrom) errors.push("legal_change_effective_range_invalid");
  return { ok: errors.length === 0, errors };
}

export function assertCandidateTransition(from, to) {
  if (!LEGAL_CHANGE_STATUSES.includes(from) || !LEGAL_CHANGE_STATUSES.includes(to)) throw new Error("legal_change_status_invalid");
  if (!CANDIDATE_TRANSITIONS[from].includes(to)) throw new Error(`legal_change_transition_invalid:${from}:${to}`);
  return true;
}

export function assertProposalTransition(from, to, { candidateStatus, fixtureEvidence = [] } = {}) {
  if (!LEGAL_PROPOSAL_STATUSES.includes(from) || !LEGAL_PROPOSAL_STATUSES.includes(to)) throw new Error("legal_proposal_status_invalid");
  if (!PROPOSAL_TRANSITIONS[from].includes(to)) throw new Error(`legal_proposal_transition_invalid:${from}:${to}`);
  if (["VERIFIED", "READY_FOR_IMPLEMENTATION"].includes(to) && candidateStatus !== "VERIFIED") throw new Error("legal_proposal_candidate_not_verified");
  if (["VERIFIED", "READY_FOR_IMPLEMENTATION"].includes(to)) {
    if (!Array.isArray(fixtureEvidence) || fixtureEvidence.length < 1) throw new Error("legal_proposal_fixture_evidence_required");
    for (const fixture of fixtureEvidence) {
      if (!fixture || typeof fixture !== "object" || !String(fixture.name || "").trim() || !("expected" in fixture)) throw new Error("legal_proposal_fixture_invalid");
    }
  }
  return true;
}

export function validateRuleProposal(input = {}) {
  const errors = [];
  if (!String(input.ruleKey || "").trim()) errors.push("legal_proposal_rule_key_required");
  if (!String(input.proposedRuleVersion || "").trim()) errors.push("legal_proposal_version_required");
  if (!isIsoDate(input.proposedEffectiveFrom)) errors.push("legal_proposal_effective_from_invalid");
  if (!input.proposedChange || typeof input.proposedChange !== "object" || Array.isArray(input.proposedChange) || !Object.keys(input.proposedChange).length) errors.push("legal_proposal_change_required");
  if (!String(input.createdBy || "").trim()) errors.push("legal_proposal_created_by_required");
  return { ok: errors.length === 0, errors };
}
