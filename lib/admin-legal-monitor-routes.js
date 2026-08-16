import express from "express";
import { createAdminAccess } from "./admin-access.js";
import { getLegalSourceMonitorSchedulerStatus } from "./legal-source-monitor-scheduler.js";
import {
  createLegalSourceWatch,
  getLegalSourceWatch,
  listLegalSourceMonitorRuns,
  listLegalSourceWatches,
  runLegalSourceWatch,
  setLegalSourceWatchEnabled,
} from "./legal-source-monitor-repo.js";

const text = (value, max = 2000) => typeof value === "string" ? value.trim().slice(0, max) : "";

function actorFrom(req) {
  return text(req.body?.operator || req.get("x-admin-operator") || "", 120);
}

function requireActor(req, res) {
  const actor = actorFrom(req);
  if (!actor) {
    res.status(400).json({ error: "legal_admin_operator_required" });
    return null;
  }
  return actor;
}

function statusForError(error) {
  const code = String(error?.message || "");
  if (code.includes("not_found")) return 404;
  if (code.includes("duplicate")) return 409;
  if (code.includes("disabled")) return 409;
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
      return res.status(status).json({ error: String(error.message || "legal_source_monitor_error") });
    }
  };
}

function queryBoolean(value) {
  if (value == null || value === "") return null;
  if (String(value).toLowerCase() === "true") return true;
  if (String(value).toLowerCase() === "false") return false;
  throw new Error("legal_source_watch_enabled_invalid");
}

export function createAdminLegalMonitorRouter({ adminToken, parseCookies, verifySession } = {}) {
  const router = express.Router();
  const { adminAuth } = createAdminAccess({ adminToken, parseCookies, verifySession });
  router.use("/admin/legal/monitor", adminAuth);

  router.get("/admin/legal/monitor/scheduler", asyncRoute(async (_req, res) => {
    res.json({
      scheduler: getLegalSourceMonitorSchedulerStatus(),
      mutableFromApi: false,
      automaticReviewAllowed: false,
      runtimeActivationAllowed: false,
    });
  }));

  router.get("/admin/legal/monitor/watches", asyncRoute(async (req, res) => {
    const watches = await listLegalSourceWatches({ enabled: queryBoolean(req.query.enabled), limit: req.query.limit });
    res.json({ watches, automaticReviewAllowed: false, runtimeActivationAllowed: false });
  }));

  router.get("/admin/legal/monitor/watches/:id", asyncRoute(async (req, res) => {
    const watch = await getLegalSourceWatch(req.params.id);
    if (!watch) return res.status(404).json({ error: "legal_source_watch_not_found" });
    const runs = await listLegalSourceMonitorRuns({ watchId: watch.id, limit: req.query.limit || 100 });
    res.json({ watch, runs, automaticReviewAllowed: false, runtimeActivationAllowed: false });
  }));

  router.post("/admin/legal/monitor/watches", asyncRoute(async (req, res) => {
    const actor = requireActor(req, res);
    if (!actor) return;
    const watch = await createLegalSourceWatch({
      canonicalSourceId: text(req.body?.canonicalSourceId, 200),
      sourceType: text(req.body?.sourceType, 80),
      createdBy: actor,
    });
    res.status(201).json({ watch });
  }));

  router.post("/admin/legal/monitor/watches/:id/enabled", asyncRoute(async (req, res) => {
    const actor = requireActor(req, res);
    if (!actor) return;
    if (typeof req.body?.enabled !== "boolean") return res.status(400).json({ error: "legal_source_watch_enabled_required" });
    const watch = await setLegalSourceWatchEnabled({ watchId: req.params.id, enabled: req.body.enabled, actor });
    res.json({ watch });
  }));

  router.post("/admin/legal/monitor/watches/:id/run", asyncRoute(async (req, res) => {
    const actor = requireActor(req, res);
    if (!actor) return;
    const run = await runLegalSourceWatch({ watchId: req.params.id, triggeredBy: actor });
    res.json({ run, automaticReviewAllowed: false, runtimeActivationAllowed: false });
  }));

  router.get("/admin/legal/monitor/runs", asyncRoute(async (req, res) => {
    const runs = await listLegalSourceMonitorRuns({ watchId: text(req.query.watchId, 200) || null, limit: req.query.limit });
    res.json({ runs });
  }));

  return router;
}
