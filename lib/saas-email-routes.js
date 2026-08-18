import express from "express";
import crypto from "node:crypto";
import { getSaasRuntimeConfig } from "./saas-runtime-config.js";
import { findSessionByRawToken, issueMagicChallenge } from "./saas-auth-repo.js";
import {
  SAAS_INVITABLE_ROLES,
  createOrganizationInvitation,
  getOrganizationForMember,
  revokeOrganizationInvitation,
} from "./saas-tenant-repo.js";
import { createExternalAdvisorCollaborationService } from "./external-advisor-collaboration-service.js";
import { createSaasEmailDelivery } from "./saas-email-delivery.js";

function ipHash(req, secret) { return crypto.createHmac("sha256", secret).update(String(req.ip || "")).digest("hex").slice(0, 32); }
function csrfFor(sessionId, secret) { return crypto.createHmac("sha256", secret).update(`csrf:${sessionId}`).digest("base64url"); }
function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
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
function errorCode(error) {
  const code = String(error?.message || error || "internal_error");
  return /^[a-z0-9_:-]+$/i.test(code) ? code : "internal_error";
}
function errorStatus(error) {
  const code = errorCode(error);
  if (["invalid_email", "invitation_role_invalid", "external_advisor_permission_invalid", "external_advisor_permissions_required"].includes(code)) return 400;
  if (code === "authentication_required") return 401;
  if (["csrf_invalid", "permission_denied", "external_advisor_management_role_required"].includes(code)) return 403;
  if (["organization_not_found", "business_case_not_found", "external_advisor_cross_tenant_case_forbidden"].includes(code)) return 404;
  if (["external_advisor_invitation_pending_duplicate", "external_advisor_business_case_not_shareable"].includes(code)) return 409;
  if (["saas_email_delivery_not_configured", "saas_email_delivery_failed"].includes(code)) return 503;
  return 500;
}

export function createSaasEmailRouter({ env = process.env, rateLimit, delivery = null, collaborationService = null } = {}) {
  if (typeof rateLimit !== "function") throw new Error("saas_email_rate_limit_required");
  const router = express.Router();
  const email = delivery || createSaasEmailDelivery({ env });
  const authRateLimit = rateLimit({ max: 10 });
  const invitationRateLimit = rateLimit({ max: 20 });
  let collaboration = collaborationService;
  const getCollaboration = () => collaboration || (collaboration = createExternalAdvisorCollaborationService());

  function requireConfiguredEmailRoute(req, _res, next) {
    if (!email.config.enabled) return next("route");
    try { req.saasEmailConfig = getSaasRuntimeConfig(env); }
    catch { return next("route"); }
    if (!req.saasEmailConfig.enabled) return next("route");
    next();
  }

  async function requireAuth(req, res, next) {
    const config = req.saasEmailConfig;
    const rawToken = parseCookies(req)[config.cookieName] || "";
    const session = await findSessionByRawToken(rawToken);
    if (!session) return res.status(401).json({ error: "authentication_required" });
    req.saasSession = session;
    next();
  }

  function requireCsrf(req, res, next) {
    const expected = csrfFor(req.saasSession?.sessionId, req.saasEmailConfig.sessionSecret);
    if (!safeEqual(req.get("x-csrf-token"), expected)) return res.status(403).json({ error: "csrf_invalid" });
    next();
  }

  router.post("/auth/magic-link", requireConfiguredEmailRoute, authRateLimit, async (req, res) => {
    try {
      const config = req.saasEmailConfig;
      const challenge = await issueMagicChallenge({
        email: req.body?.email,
        ttlMinutes: config.challengeTtlMinutes,
        ipHash: ipHash(req, config.sessionSecret),
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

  router.post(
    "/organizations/:organizationId/invitations",
    requireConfiguredEmailRoute,
    invitationRateLimit,
    requireAuth,
    requireCsrf,
    async (req, res) => {
      let invitation = null;
      try {
        invitation = await createOrganizationInvitation({
          organizationId: req.params.organizationId,
          actorUserId: req.saasSession.userId,
          email: req.body?.email,
          roleKey: req.body?.roleKey || "HR_ADMIN",
          ttlDays: req.saasEmailConfig.invitationTtlDays,
          requestId: req.requestId || null,
        });
        const org = await getOrganizationForMember(req.params.organizationId, req.saasSession.userId);
        await email.sendOrganizationInvitation({
          to: invitation.email,
          rawToken: invitation.rawToken,
          invitationId: invitation.id,
          roleKey: invitation.roleKey,
          organizationName: org?.organization?.displayName || org?.organization?.legalName || "회사",
          expiresAt: invitation.expiresAt,
        });
        return res.status(201).json({
          invitation: {
            id: invitation.id,
            organizationId: invitation.organizationId,
            email: invitation.email,
            roleKey: invitation.roleKey,
            expiresAt: invitation.expiresAt,
          },
          deliveryMode: "EMAIL",
          allowedRoles: SAAS_INVITABLE_ROLES,
        });
      } catch (error) {
        if (invitation?.id) {
          try {
            await revokeOrganizationInvitation({
              organizationId: invitation.organizationId,
              invitationId: invitation.id,
              actorUserId: req.saasSession.userId,
              requestId: req.requestId || null,
            });
          } catch {}
        }
        return res.status(errorStatus(error)).json({ error: errorCode(error) });
      }
    },
  );

  router.post(
    "/organizations/:organizationId/business-cases/:caseId/advisor-invitations",
    requireConfiguredEmailRoute,
    invitationRateLimit,
    requireAuth,
    requireCsrf,
    async (req, res) => {
      let result = null;
      try {
        result = await getCollaboration().issueExternalAdvisorInvitation({
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
          try {
            await getCollaboration().revokeExternalAdvisorInvitation({
              invitationId: result.invitation.id,
              actorUserId: req.saasSession.userId,
            });
          } catch {}
        }
        return res.status(errorStatus(error)).json({ error: errorCode(error) });
      }
    },
  );

  return router;
}
