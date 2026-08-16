import express from "express";
import { cases } from "./runtime-case-repo.js";
import { caseAccess } from "./runtime-case-access.js";
import { CASE_DOMAIN_REGISTRY } from "./case-domain-registry.js";
import { getRuntimeReadiness } from "./runtime-readiness.js";

function readCaseToken(req) {
  const direct = req.get("x-case-token");
  if (direct) return direct.trim();
  const auth = req.get("authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
}

async function requireCaseAccess(req, res, next) {
  const token = readCaseToken(req);
  if (!token || !(await caseAccess.verify(req.params.id, token))) return res.status(401).json({ error: "case_unauthorized" });
  next();
}

function readFacts(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  const facts = body.facts;
  return facts && typeof facts === "object" && !Array.isArray(facts) ? facts : {};
}

function sendCaseResult(res, result) {
  if (result?.error === "case_not_found") return res.status(404).json({ error: "case_not_found" });
  if (result?.error === "case_type_mismatch") return res.status(409).json({ error: "case_type_mismatch" });
  return res.json(result);
}

function sendDocumentResult(res, result) {
  if (result?.error === "case_not_found") return res.status(404).json({ error: "case_not_found" });
  if (result?.error === "case_type_mismatch") return res.status(409).json({ error: "case_type_mismatch" });
  if (result?.error === "document_not_supported" || result?.error === "document_not_found") return res.status(404).json({ error: result.error });
  return res.json(result);
}

function validateFactsPatch(req, res) {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) { res.status(400).json({ error: "invalid_body" }); return null; }
  if (!("facts" in req.body)) { res.status(400).json({ error: "facts_required" }); return null; }
  if (!req.body.facts || typeof req.body.facts !== "object" || Array.isArray(req.body.facts)) { res.status(400).json({ error: "invalid_facts" }); return null; }
  return req.body.facts;
}

function readDocumentValues(body) { return body && typeof body === "object" && !Array.isArray(body) ? body.values : {}; }

function registerDomainRoutes(router, domain) {
  router.post(`/${domain.intakePath}`, async (req, res) => {
    const result = await domain.create(readFacts(req.body));
    const accessToken = await caseAccess.issue(result.case.id);
    res.status(201).json({ ...result, accessToken });
  });
  router.get(`/:id/${domain.intakePath}`, requireCaseAccess, async (req, res) => sendCaseResult(res, await domain.get(req.params.id)));
  router.patch(`/:id/${domain.intakePath}`, requireCaseAccess, async (req, res) => {
    const facts = validateFactsPatch(req, res); if (!facts) return;
    return sendCaseResult(res, await domain.update(req.params.id, facts));
  });
  router.get(`/:id/${domain.reportPath}`, requireCaseAccess, async (req, res) => sendCaseResult(res, await domain.report(req.params.id)));
  router.post(`/:id/${domain.documentPath}/:templateKey`, requireCaseAccess, async (req, res) => sendDocumentResult(res, await domain.renderDocument(req.params.id, req.params.templateKey, readDocumentValues(req.body))));
}

export function createCaseRouter() {
  const router = express.Router();
  for (const domain of CASE_DOMAIN_REGISTRY) registerDomainRoutes(router, domain);

  router.get("/readiness", async (_req, res) => {
    const readiness = await getRuntimeReadiness();
    res.status(readiness.ready ? 200 : 503).json(readiness);
  });

  router.post("/", async (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const created = await cases.insert(body, "api:user");
    const accessToken = await caseAccess.issue(created.id);
    res.status(201).json({ case: created, accessToken });
  });
  router.get("/:id", requireCaseAccess, async (req, res) => {
    const found = await cases.get(req.params.id); if (!found) return res.status(404).json({ error: "case_not_found" });
    res.json({ case: found });
  });
  router.patch("/:id", requireCaseAccess, async (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const updated = await cases.update(req.params.id, body, "api:user"); if (!updated) return res.status(404).json({ error: "case_not_found" });
    res.json({ case: updated });
  });
  router.delete("/:id", requireCaseAccess, async (req, res) => {
    if (!(await cases.archive(req.params.id, "api:user"))) return res.status(404).json({ error: "case_not_found" });
    await caseAccess.revoke(req.params.id); res.status(204).end();
  });
  return router;
}
