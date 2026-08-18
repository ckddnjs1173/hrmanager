import express from "express";
import crypto from "node:crypto";
import { getSaasRuntimeConfig } from "./saas-runtime-config.js";
import { findSessionByRawToken, issueMagicChallenge } from "./saas-auth-repo.js";
import { createExternalAdvisorCollaborationService } from "./external-advisor-collaboration-service.js";
import { createSaasEmailDelivery } from "./saas-email-delivery.js";

function parseCookies(req) {
  const cookies = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}
function ipHash(req, secret) { return crypto.createHmac("sha256", secret).update(String(req.ip || "")).digest("hex").slice(0, 32); }
function csrfFor(sessionId, secret) { return crypto.createHmac("sha256", secret).update(`csrf:${sessionId}`).digest("base64url"); }
function safeEqual(a, b) {
  const left = Buffer.from(String(a || "")); const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function errorCode(error) {
  const code = String(error?.message || error || "internal_error");
  return /^[a-z0-9_:-]+$/i.test(code) ? code : "internal_error";
}
function errorStatus(error) {
  const code = errorCode(error);
  if (["invalid_email", "external_advisor_permission_invalid", "external_advisor_permissions_required"].includes(code)) return 400;
  if (code === "authentication_required") return 401;
  if (["csrf_invalid", "external_advisor_management_role_required"].includes(code)) return 403;
  if (["business_case_not_found", "external_advisor_cross_tenant_case_forbidden"].includes(code)) return 404;
  if (["external_advisor_invitation_pending_duplicate", "external_advisor_business_case_not_shareable"].includes(code)) return 409;
  if (["saas_email_delivery_not_configured", "saas_email_delivery_failed"].includes(code)) return 503;
  return 500;
}

export function createSaasEmailRouter({ env = process.env, rateLimit, delivery = null, collaborationService = null } = {}) {
  if (typeof rateLimit !== "function") throw new Error("saas_email_rate_limit_required");
  const router = express.Router();
  const email = delivery || createSaasEmailDelivery({ env });
  let service = collaborationService;
  const getService = () => service || (service = createExternalAdvisorCollaborationService());

  // Only intercept these routes when a production delivery provider is fully configured.
  // Otherwise the existing SaaS routers preserve debug-token behavior (non-production) or fail closed (production).
  router.use((req, _res, next) => {
    if (!email.config.enabled) return next();
    try { req.saasConfig = getSaasRuntimeConfig(env); }
    catch { return next(); }
    if (!req.saasConfig.enabled) return next();
    next();
  });

  router.post("/auth/magic-link", rateLimit({ max: 10 }), async (req, res, next) => {
    if (!email.config.enabled || !req.saasConfig?.enabled) return next();
    try {
      const challenge = await issueMagicChallenge({
        email: req.body?.email,
        ttlMinutes: req.saasConfig.challengeTtlMinutes,
        ipHash: ipHash(req, req.saasConfig.sessionSecret),
        requestId: req.requestId || null,
      });
      await email.sendMagicLink({
        to: challenge.emailNormalized,
        rawToken: challenge.rawToken,
        expiresAt: challenge.expiresAt,
        challengeId: challenge.id,
      });
      return res.status(202).json({ ok: true, expiresAt: challenge.expiresAt, deliveryMode: "EMAIL" });
    } catch (error) {
      return res.status(errorStatus(error)).json({ error: errorCode(error) });
    }
  });

  async function requireAuth(req, res, next) {
    if (!email.config.enabled || !req.saasConfig?.enabled) return next("route");
    const rawToken = parseCookies(req)[req.saasConfig.cookieName] || "";
    const session = await findSessionByRawToken(rawToken);
    if (!session) return res.status(401).json({ error: "authentication_required" });
    req.saasSession = session;
    next();
  }
  function requireCsrf(req, res, next) {
    if (!safeEqual(req.get("x-csrf-token"), csrfFor(req.saasSession?.sessionId, req.saasConfig.sessionSecret))) {
      return res.status(403).json({ error: "csrf_invalid" });
    }
    next();
  }

  router.post(
    "/organizations/:organizationId/business-cases/:caseId/advisor-invitations",
    rateLimit({ max: 20 }), requireAuth, requireCsrf,
    async (req, res, next) => {
      if (!email.config.enabled || !req.saasConfig?.enabled) return next();
      let result = null;
      try {
        result = await getService().issueExternalAdvisorInvitation({
          organizationId: req.params.organizationId,
          caseId: req.params.caseId,
          advisorEmail: req.body?.advisorEmail,
          permissions: req.body?.permissions,
          actorUserId: req.saasSession.userId,
          invitationExpiresAt: req.body?.invitationExpiresAt || null,
          grantExpiresAt: req.body?.grantExpiresAt,
          metadata: { ...(req.body?.metadata || {}), requestId: req.requestId || null, delivery: "EMAIL" },
        });
        await email.sendAdvisorInvitation({
          to: result.invitation.advisorEmail,
          rawToken: result.invitationToken,
          invitationId: result.invitation.id,
          invitationExpiresAt: result.invitation.invitationExpiresAt,
        });
        return res.status(201).json({ invitation: result.invitation, deliveryMode: "EMAIL" });
      } catch (error) {
        if (result?.invitation?.id) {
          try { await getService().revokeExternalAdvisorInvitation({ invitationId: result.invitation.id, actorUserId: req.saasSession.userId }); } catch {}
        }
        return res.status(errorStatus(error)).json({ error: errorCode(error) });
      }
    },
  );

  return router;
}
