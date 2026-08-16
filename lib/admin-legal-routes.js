import express from "express";
import { createAdminAccess } from "./admin-access.js";
import { LEGAL_CHANGE_STATUSES, LEGAL_PROPOSAL_STATUSES, LEGAL_SOURCE_TYPES } from "./legal-change-contract.js";
import {
  attachProposalFixtures,
  createLegalChangeCandidate,
  createLegalRuleProposal,
  getLegalChangeCandidate,
  listLegalChangeCandidates,
  listLegalGovernanceEvents,
  listLegalRuleProposals,
  markProposalReadyForImplementation,
  reviewLegalChangeCandidate,
  submitLegalChangeCandidate,
  verifyLegalRuleProposal,
} from "./legal-change-repo.js";
import { listCanonicalLegalSources, normalizeLegalSource } from "./legal-registry.js";

const text = (value, max = 2000) => typeof value === "string" ? value.trim().slice(0, max) : "";
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : null;

function actorFrom(req) {
  return text(req.body?.operator || req.get("x-admin-operator") || "", 120);
}

function statusForError(error) {
  const code = String(error?.message || "");
  if (code.includes("not_found")) return 404;
  if (code.includes("duplicate")) return 409;
  if (code.includes("transition_invalid") || code.includes("not_allowed") || code.includes("candidate_not_verified") || code.includes("fixture_update_not_allowed")) return 409;
  if (code.startsWith("legal_")) return 400;
  return null;
}

function asyncRoute(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res);
    } catch (error) {
      const status = statusForError(error);
      if (!status) return next(error);
      return res.status(status).json({ error: String(error.message || "legal_admin_error") });
    }
  };
}

function requireActor(req, res) {
  const actor = actorFrom(req);
  if (!actor) {
    res.status(400).json({ error: "legal_admin_operator_required" });
    return null;
  }
  return actor;
}

export function createAdminLegalRouter({ adminToken, parseCookies, verifySession } = {}) {
  const router = express.Router();
  const { adminAuth } = createAdminAccess({ adminToken, parseCookies, verifySession });

  router.use("/admin/legal", adminAuth);

  router.get("/admin/legal/meta", asyncRoute(async (_req, res) => {
    res.json({
      sourceTypes: LEGAL_SOURCE_TYPES,
      candidateStatuses: LEGAL_CHANGE_STATUSES,
      proposalStatuses: LEGAL_PROPOSAL_STATUSES,
      canonicalSources: listCanonicalLegalSources().map(normalizeLegalSource).filter(Boolean),
      runtimeActivationAllowed: false,
    });
  }));

  router.get("/admin/legal/candidates", asyncRoute(async (req, res) => {
    const status = text(req.query.status, 80) || null;
    const candidates = await listLegalChangeCandidates({ status, limit: req.query.limit });
    res.json({ candidates });
  }));

  router.get("/admin/legal/candidates/:id", asyncRoute(async (req, res) => {
    const candidate = await getLegalChangeCandidate(req.params.id);
    if (!candidate) return res.status(404).json({ error: "legal_change_not_found" });
    const [proposals, events] = await Promise.all([
      listLegalRuleProposals({ candidateId: candidate.id, limit: 100 }),
      listLegalGovernanceEvents({ candidateId: candidate.id, limit: 300 }),
    ]);
    res.json({ candidate, proposals, events, runtimeActivationAllowed: false });
  }));

  router.post("/admin/legal/candidates", asyncRoute(async (req, res) => {
    const actor = requireActor(req, res);
    if (!actor) return;
    const sourceSnapshot = object(req.body?.sourceSnapshot);
    if (!sourceSnapshot) return res.status(400).json({ error: "legal_change_source_snapshot_required" });
    const candidate = await createLegalChangeCandidate({
      sourceType: text(req.body?.sourceType, 80),
      canonicalSourceId: text(req.body?.canonicalSourceId, 200) || null,
      authority: text(req.body?.authority, 300),
      title: text(req.body?.title, 500),
      article: text(req.body?.article, 300) || null,
      officialUrl: text(req.body?.officialUrl, 2000),
      sourcePublishedAt: text(req.body?.sourcePublishedAt, 20) || null,
      effectiveFrom: text(req.body?.effectiveFrom, 20) || null,
      effectiveTo: text(req.body?.effectiveTo, 20) || null,
      changeNote: text(req.body?.changeNote, 4000),
      sourceSnapshot,
      detectedBy: "MANUAL_ADMIN",
      createdBy: actor,
    });
    res.status(201).json({ candidate });
  }));

  router.post("/admin/legal/candidates/:id/submit", asyncRoute(async (req, res) => {
    const actor = requireActor(req, res);
    if (!actor) return;
    const candidate = await submitLegalChangeCandidate({ candidateId: req.params.id, actor });
    res.json({ candidate });
  }));

  router.post("/admin/legal/candidates/:id/review", asyncRoute(async (req, res) => {
    const actor = requireActor(req, res);
    if (!actor) return;
    const candidate = await reviewLegalChangeCandidate({
      candidateId: req.params.id,
      reviewer: actor,
      decision: text(req.body?.decision, 40).toUpperCase(),
      note: text(req.body?.note, 4000),
      metadata: { channel: "INTERNAL_ADMIN" },
    });
    res.json({ candidate });
  }));

  router.post("/admin/legal/candidates/:id/proposals", asyncRoute(async (req, res) => {
    const actor = requireActor(req, res);
    if (!actor) return;
    const proposedChange = object(req.body?.proposedChange);
    if (!proposedChange) return res.status(400).json({ error: "legal_proposal_change_required" });
    const proposal = await createLegalRuleProposal({
      candidateId: req.params.id,
      ruleKey: text(req.body?.ruleKey, 300),
      currentRuleVersion: text(req.body?.currentRuleVersion, 120) || null,
      proposedRuleVersion: text(req.body?.proposedRuleVersion, 120),
      proposedEffectiveFrom: text(req.body?.proposedEffectiveFrom, 20),
      proposedChange,
      createdBy: actor,
    });
    res.status(201).json({ proposal });
  }));

  router.post("/admin/legal/proposals/:id/fixtures", asyncRoute(async (req, res) => {
    const actor = requireActor(req, res);
    if (!actor) return;
    if (!Array.isArray(req.body?.fixtures)) return res.status(400).json({ error: "legal_proposal_fixture_evidence_required" });
    const proposal = await attachProposalFixtures({ proposalId: req.params.id, actor, fixtures: req.body.fixtures });
    res.json({ proposal });
  }));

  router.post("/admin/legal/proposals/:id/verify", asyncRoute(async (req, res) => {
    const actor = requireActor(req, res);
    if (!actor) return;
    const proposal = await verifyLegalRuleProposal({ proposalId: req.params.id, reviewer: actor });
    res.json({ proposal });
  }));

  router.post("/admin/legal/proposals/:id/ready", asyncRoute(async (req, res) => {
    const actor = requireActor(req, res);
    if (!actor) return;
    const proposal = await markProposalReadyForImplementation({ proposalId: req.params.id, actor });
    res.json({ proposal, runtimeActivationAllowed: false });
  }));

  return router;
}
