import express from "express";
import { cases } from "./case-repo.js";
import { caseAccess } from "./case-access.js";
import { CASE_DOMAIN_REGISTRY } from "./case-domain-registry.js";

function readCaseToken(req) {
  const direct = req.get("x-case-token");
  if (direct) return direct.trim();
  const auth = req.get("authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
}

function requireCaseAccess(req, res, next) {
  const token = readCaseToken(req);
  if (!token || !caseAccess.verify(req.params.id, token)) {
    return res.status(401).json({ error: "case_unauthorized" });
  }
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
  if (result?.error === "document_not_supported" || result?.error === "document_not_found") {
    return res.status(404).json({ error: result.error });
  }
  return res.json(result);
}

function validateFactsPatch(req, res) {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    res.status(400).json({ error: "invalid_body" });
    return null;
  }
  if (!("facts" in req.body)) {
    res.status(400).json({ error: "facts_required" });
    return null;
  }
  if (!req.body.facts || typeof req.body.facts !== "object" || Array.isArray(req.body.facts)) {
    res.status(400).json({ error: "invalid_facts" });
    return null;
  }
  return req.body.facts;
}

function readDocumentValues(body) {
  return body && typeof body === "object" && !Array.isArray(body) ? body.values : {};
}

function registerDomainRoutes(router, domain) {
  router.post(`/${domain.intakePath}`, (req, res) => {
    const result = domain.create(readFacts(req.body));
    const accessToken = caseAccess.issue(result.case.id);
    res.status(201).json({ ...result, accessToken });
  });

  router.get(`/:id/${domain.intakePath}`, requireCaseAccess, (req, res) => {
    return sendCaseResult(res, domain.get(req.params.id));
  });

  router.patch(`/:id/${domain.intakePath}`, requireCaseAccess, (req, res) => {
    const facts = validateFactsPatch(req, res);
    if (!facts) return;
    return sendCaseResult(res, domain.update(req.params.id, facts));
  });

  router.get(`/:id/${domain.reportPath}`, requireCaseAccess, (req, res) => {
    return sendCaseResult(res, domain.report(req.params.id));
  });

  router.post(`/:id/${domain.documentPath}/:templateKey`, requireCaseAccess, (req, res) => {
    return sendDocumentResult(
      res,
      domain.renderDocument(req.params.id, req.params.templateKey, readDocumentValues(req.body))
    );
  });
}

export function createCaseRouter() {
  const router = express.Router();

  for (const domain of CASE_DOMAIN_REGISTRY) registerDomainRoutes(router, domain);

  router.post("/", (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const created = cases.insert(body, "api:user");
    const accessToken = caseAccess.issue(created.id);
    res.status(201).json({ case: created, accessToken });
  });

  router.get("/:id", requireCaseAccess, (req, res) => {
    const found = cases.get(req.params.id);
    if (!found) return res.status(404).json({ error: "case_not_found" });
    res.json({ case: found });
  });

  router.patch("/:id", requireCaseAccess, (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const updated = cases.update(req.params.id, body, "api:user");
    if (!updated) return res.status(404).json({ error: "case_not_found" });
    res.json({ case: updated });
  });

  router.delete("/:id", requireCaseAccess, (req, res) => {
    if (!cases.archive(req.params.id, "api:user")) {
      return res.status(404).json({ error: "case_not_found" });
    }
    caseAccess.revoke(req.params.id);
    res.status(204).end();
  });

  return router;
}
