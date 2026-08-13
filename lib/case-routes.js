import express from "express";
import { cases } from "./case-repo.js";
import { caseAccess } from "./case-access.js";

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

export function createCaseRouter() {
  const router = express.Router();

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
