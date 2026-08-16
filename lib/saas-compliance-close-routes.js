import express from "express";
import crypto from "node:crypto";
import { getSaasRuntimeConfig } from "./saas-runtime-config.js";
import { findSessionByRawToken } from "./saas-auth-repo.js";
import { requireOrganizationPermission } from "./saas-tenant-repo.js";
import {
  closeCompliancePeriod,
  getComplianceClose,
  listComplianceCloseHistory,
  listComplianceCloseSnapshots,
  refreshComplianceClose,
} from "./saas-compliance-close-repo.js";

function parseCookies(req) {
  const header = String(req.headers.cookie || "");
  const cookies = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

function csrfFor(sessionId, secret) {
  return crypto.createHmac("sha256", secret).update(`csrf:${sessionId}`).digest("base64url");
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function errorCode(error) {
  const code = String(error?.message || error || "internal_error");
  return /^[a-z0-9_:-]+$/i.test(code) ? code : "internal_error";
}

function errorStatus(error) {
  const code = errorCode(error);
  if ([
    "compliance_close_date_invalid",
    "compliance_close_month_invalid",
    "compliance_close_future_month_invalid",
    "compliance_close_acknowledgement_required",
    "compliance_close_note_required",
    "compliance_close_already_closed",
  ].includes(code)) return 400;
  if (code === "permission_denied") return 403;
  return 500;
}

export function createSaasComplianceCloseRouter({ env = process.env } = {}) {
  const router = express.Router();

  router.use((req, res, next) => {
    let config;
    try { config = getSaasRuntimeConfig(env); }
    catch (error) { return res.status(503).json({ error: errorCode(error) }); }
    if (!config.enabled) return res.status(404).json({ error: "saas_not_enabled" });
    req.saasConfig = config;
    next();
  });

  async function requireAuth(req, res, next) {
    const rawToken = parseCookies(req)[req.saasConfig.cookieName] || "";
    const session = await findSessionByRawToken(rawToken);
    if (!session) return res.status(401).json({ error: "authentication_required" });
    req.saasSession = session;
    next();
  }

  function requireCsrf(req, res, next) {
    const expected = csrfFor(req.saasSession?.sessionId, req.saasConfig.sessionSecret);
    if (!safeEqual(req.get("x-csrf-token"), expected)) return res.status(403).json({ error: "csrf_invalid" });
    next();
  }

  const orgPermission = (permission) => async (req, res, next) => {
    const access = await requireOrganizationPermission({
      organizationId: req.params.organizationId,
      userId: req.saasSession.userId,
      permission,
    });
    if (!access.membership) return res.status(404).json({ error: "organization_not_found" });
    if (!access.allowed) return res.status(403).json({ error: access.reason || "permission_denied" });
    req.organizationMembership = access.membership;
    next();
  };

  const send = (res, fn) => Promise.resolve()
    .then(fn)
    .then((value) => res.json(value))
    .catch((error) => res.status(errorStatus(error)).json({ error: errorCode(error) }));

  router.get(
    "/organizations/:organizationId/compliance-close/current",
    requireAuth,
    orgPermission("compliance.read"),
    async (req, res) => send(res, () => getComplianceClose({
      organizationId: req.params.organizationId,
      periodMonth: req.query.month,
    })),
  );

  router.get(
    "/organizations/:organizationId/compliance-close/history",
    requireAuth,
    orgPermission("compliance.read"),
    async (req, res) => send(res, async () => ({
      periods: await listComplianceCloseHistory({
        organizationId: req.params.organizationId,
        limit: req.query.limit,
      }),
    })),
  );

  router.get(
    "/organizations/:organizationId/compliance-close/:month/snapshots",
    requireAuth,
    orgPermission("compliance.read"),
    async (req, res) => send(res, async () => ({
      snapshots: await listComplianceCloseSnapshots({
        organizationId: req.params.organizationId,
        periodMonth: req.params.month,
      }),
    })),
  );

  router.post(
    "/organizations/:organizationId/compliance-close/:month/refresh",
    requireAuth,
    requireCsrf,
    orgPermission("compliance.manage"),
    async (req, res) => send(res, () => refreshComplianceClose({
      organizationId: req.params.organizationId,
      actorUserId: req.saasSession.userId,
      periodMonth: req.params.month,
      requestId: req.requestId || null,
    })),
  );

  router.post(
    "/organizations/:organizationId/compliance-close/:month/close",
    requireAuth,
    requireCsrf,
    orgPermission("compliance.manage"),
    async (req, res) => send(res, () => closeCompliancePeriod({
      organizationId: req.params.organizationId,
      actorUserId: req.saasSession.userId,
      periodMonth: req.params.month,
      acknowledgeUnresolved: req.body?.acknowledgeUnresolved === true,
      note: req.body?.note || "",
      requestId: req.requestId || null,
    })),
  );

  return router;
}
