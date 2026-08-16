import express from "express";
import crypto from "node:crypto";
import { getSaasRuntimeConfig } from "./saas-runtime-config.js";
import { findSessionByRawToken } from "./saas-auth-repo.js";
import { requireOrganizationPermission } from "./saas-tenant-repo.js";
import {
  getBusinessRiskDashboard,
  listComplianceActions,
  runBusinessRiskScan,
  transitionComplianceAction,
} from "./saas-risk-repo.js";

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
  if (["compliance_scope_not_found", "compliance_action_not_found"].includes(code)) return 404;
  if (["permission_denied", "csrf_invalid"].includes(code)) return 403;
  if (code.startsWith("compliance_action_") || code.startsWith("risk_")) return 400;
  return 500;
}

export function createSaasRiskRouter({ env = process.env, rateLimit } = {}) {
  if (typeof rateLimit !== "function") throw new Error("saas_risk_rate_limit_required");
  const router = express.Router();

  router.use((req, res, next) => {
    let config;
    try { config = getSaasRuntimeConfig(env); }
    catch (error) { return res.status(503).json({ error: errorCode(error) }); }
    if (!config.enabled) return next();
    req.saasConfig = config;
    next();
  });

  async function requireAuth(req, res, next) {
    if (!req.saasConfig?.enabled) return res.status(404).json({ error: "saas_not_enabled" });
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

  const requireOrg = (permission) => async (req, res, next) => {
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

  router.post(
    "/organizations/:organizationId/risk-scan",
    requireAuth,
    requireCsrf,
    requireOrg("compliance.manage"),
    rateLimit({ max: 20 }),
    async (req, res) => {
      try {
        const result = await runBusinessRiskScan({
          organizationId: req.params.organizationId,
          actorUserId: req.saasSession.userId,
          complianceScopeId: req.body?.complianceScopeId || null,
          triggerType: req.body?.triggerType || "MANUAL",
          requestId: req.requestId || null,
        });
        return res.status(201).json(result);
      } catch (error) {
        return res.status(errorStatus(error)).json({ error: errorCode(error) });
      }
    }
  );

  router.get(
    "/organizations/:organizationId/risks",
    requireAuth,
    requireOrg("compliance.manage"),
    async (req, res) => {
      try { return res.json(await getBusinessRiskDashboard(req.params.organizationId)); }
      catch (error) { return res.status(errorStatus(error)).json({ error: errorCode(error) }); }
    }
  );

  router.get(
    "/organizations/:organizationId/actions",
    requireAuth,
    requireOrg("compliance.manage"),
    async (req, res) => {
      try { return res.json({ actions: await listComplianceActions(req.params.organizationId) }); }
      catch (error) { return res.status(errorStatus(error)).json({ error: errorCode(error) }); }
    }
  );

  router.patch(
    "/organizations/:organizationId/actions/:actionId/status",
    requireAuth,
    requireCsrf,
    requireOrg("compliance.manage"),
    async (req, res) => {
      try {
        const result = await transitionComplianceAction({
          organizationId: req.params.organizationId,
          actionId: req.params.actionId,
          actorUserId: req.saasSession.userId,
          status: req.body?.status,
          blockedReason: req.body?.blockedReason || "",
          dismissedReason: req.body?.dismissedReason || "",
          note: req.body?.note || "",
          requestId: req.requestId || null,
        });
        if (!result) return res.status(404).json({ error: "compliance_action_not_found" });
        return res.json(result);
      } catch (error) {
        return res.status(errorStatus(error)).json({ error: errorCode(error) });
      }
    }
  );

  return router;
}
