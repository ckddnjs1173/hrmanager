import express from "express";
import { cases } from "./case-repo.js";
import { caseAccess } from "./case-access.js";
import {
  createWageIntakeCase,
  getWageCaseReport,
  getWageIntakeCase,
  renderWageCaseDocument,
  updateWageIntakeCase,
} from "./wage-intake-service.js";

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

function sendWageIntakeResult(res, result) {
  if (result?.error === "case_not_found") {
    return res.status(404).json({ error: "case_not_found" });
  }
  if (result?.error === "case_type_mismatch") {
    return res.status(409).json({ error: "case_type_mismatch" });
  }
  return res.json(result);
}

function sendWageDocumentResult(res, result) {
  if (result?.error === "case_not_found") return res.status(404).json({ error: "case_not_found" });
  if (result?.error === "case_type_mismatch") return res.status(409).json({ error: "case_type_mismatch" });
  if (result?.error === "document_not_supported" || result?.error === "document_not_found") {
    return res.status(404).json({ error: result.error });
  }
  return res.json(result);
}

export function createCaseRouter() {
  const router = express.Router();

  router.post("/wage-intake", (req, res) => {
    const result = createWageIntakeCase(readFacts(req.body));
    const accessToken = caseAccess.issue(result.case.id);
    res.status(201).json({ ...result, accessToken });
  });

  router.get("/:id/wage-intake", requireCaseAccess, (req, res) => {
    return sendWageIntakeResult(res, getWageIntakeCase(req.params.id));
  });

  router.patch("/:id/wage-intake", requireCaseAccess, (req, res) => {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      return res.status(400).json({ error: "invalid_body" });
    }
    if (!("facts" in req.body)) {
      return res.status(400).json({ error: "facts_required" });
    }
    if (!req.body.facts || typeof req.body.facts !== "object" || Array.isArray(req.body.facts)) {
      return res.status(400).json({ error: "invalid_facts" });
    }

    return sendWageIntakeResult(
      res,
      updateWageIntakeCase(req.params.id, req.body.facts)
    );
  });

  router.get("/:id/wage-report", requireCaseAccess, (req, res) => {
    return sendWageIntakeResult(res, getWageCaseReport(req.params.id));
  });

  router.post("/:id/wage-document/:templateKey", requireCaseAccess, (req, res) => {
    const values = req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? req.body.values
      : {};
    return sendWageDocumentResult(
      res,
      renderWageCaseDocument(req.params.id, req.params.templateKey, values)
    );
  });

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
