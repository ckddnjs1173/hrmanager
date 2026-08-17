import express from "express";
import crypto from "node:crypto";
import { getSaasRuntimeConfig } from "./saas-runtime-config.js";
import { findSessionByRawToken } from "./saas-auth-repo.js";
import { createExternalAdvisorCollaborationService } from "./external-advisor-collaboration-service.js";

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

const BAD_REQUEST_PREFIXES = [
  "business_case_title_",
  "business_case_summary_",
  "business_case_transition_",
  "external_advisor_permission_",
  "external_advisor_permissions_",
];
const BAD_REQUEST_CODES = new Set([
  "business_case_title_required",
  "business_case_actor_required",
  "external_advisor_actor_required",
  "external_advisor_organization_required",
  "external_advisor_resource_type_invalid",
  "external_advisor_resource_required",
  "external_advisor_user_required",
  "external_advisor_created_by_required",
  "external_advisor_self_grant_forbidden",
  "external_advisor_expires_at_required",
  "external_advisor_created_at_invalid",
  "external_advisor_expiry_must_be_future",
  "external_advisor_case_read_required",
  "external_advisor_document_review_requires_read",
  "external_advisor_business_case_not_shareable",
]);
const NOT_FOUND_CODES = new Set([
  "business_case_not_found",
  "external_advisor_grant_not_found",
  "external_advisor_resource_not_found",
  "external_advisor_management_membership_required",
  "external_advisor_cross_tenant_case_forbidden",
  "external_advisor_cross_tenant_resource_forbidden",
]);
const FORBIDDEN_CODES = new Set([
  "external_advisor_management_role_required",
  "external_advisor_accept_identity_mismatch",
  "external_advisor_list_identity_mismatch",
  "external_advisor_internal_member_forbidden",
  "external_advisor_actor_membership_required",
  "csrf_invalid",
]);
const CONFLICT_CODES = new Set([
  "external_advisor_live_grant_duplicate",
  "external_advisor_grant_not_pending",
  "external_advisor_grant_not_revocable",
  "external_advisor_grant_expired",
]);

function errorStatus(error) {
  const code = errorCode(error);
  if (NOT_FOUND_CODES.has(code)) return 404;
  if (FORBIDDEN_CODES.has(code)) return 403;
  if (CONFLICT_CODES.has(code)) return 409;
  if (BAD_REQUEST_CODES.has(code) || BAD_REQUEST_PREFIXES.some((prefix) => code.startsWith(prefix))) return 400;
  return 500;
}

export function createSaasAdvisorCollaborationRouter({
  env = process.env,
  rateLimit,
  service = createExternalAdvisorCollaborationService(),
} = {}) {
  if (typeof rateLimit !== "function") throw new Error("saas_advisor_rate_limit_required");
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

  function send(res, fn, { created = false } = {}) {
    return Promise.resolve()
      .then(fn)
      .then((value) => res.status(created ? 201 : 200).json(value))
      .catch((error) => res.status(errorStatus(error)).json({ error: errorCode(error) }));
  }

  router.post(
    "/organizations/:organizationId/business-cases",
    requireAuth,
    requireCsrf,
    rateLimit({ max: 30 }),
    (req, res) => send(res, async () => ({
      businessCase: await service.createBusinessCase({
        organizationId: req.params.organizationId,
        actorUserId: req.saasSession.userId,
        title: req.body?.title,
        summary: req.body?.summary || "",
      }),
    }), { created: true }),
  );

  router.get(
    "/organizations/:organizationId/business-cases",
    requireAuth,
    (req, res) => send(res, async () => ({
      businessCases: await service.listBusinessCases({
        organizationId: req.params.organizationId,
        actorUserId: req.saasSession.userId,
        status: req.query.status || null,
        limit: req.query.limit || 100,
      }),
    })),
  );

  router.patch(
    "/business-cases/:caseId/status",
    requireAuth,
    requireCsrf,
    rateLimit({ max: 60 }),
    (req, res) => send(res, async () => ({
      businessCase: await service.transitionBusinessCase({
        caseId: req.params.caseId,
        actorUserId: req.saasSession.userId,
        toStatus: req.body?.status,
        resolutionNote: req.body?.resolutionNote || "",
        metadata: { requestId: req.requestId || null },
      }),
    })),
  );

  router.post(
    "/organizations/:organizationId/business-cases/:caseId/advisor-grants",
    requireAuth,
    requireCsrf,
    rateLimit({ max: 30 }),
    (req, res) => send(res, async () => ({
      shareGrant: await service.issueExternalAdvisorShareGrant({
        organizationId: req.params.organizationId,
        caseId: req.params.caseId,
        advisorUserId: req.body?.advisorUserId,
        permissions: req.body?.permissions,
        actorUserId: req.saasSession.userId,
        expiresAt: req.body?.expiresAt,
        metadata: { ...(req.body?.metadata || {}), requestId: req.requestId || null },
      }),
    }), { created: true }),
  );

  router.get(
    "/organizations/:organizationId/advisor-grants",
    requireAuth,
    (req, res) => send(res, async () => ({
      shareGrants: await service.listOrganizationShareGrants({
        organizationId: req.params.organizationId,
        actorUserId: req.saasSession.userId,
        limit: req.query.limit || 100,
      }),
    })),
  );

  router.post(
    "/advisor-grants/:grantId/revoke",
    requireAuth,
    requireCsrf,
    rateLimit({ max: 60 }),
    (req, res) => send(res, async () => ({
      shareGrant: await service.revokeExternalAdvisorShareGrant({
        grantId: req.params.grantId,
        actorUserId: req.saasSession.userId,
        metadata: { ...(req.body?.metadata || {}), requestId: req.requestId || null },
      }),
    })),
  );

  router.get(
    "/advisor/share-grants",
    requireAuth,
    (req, res) => send(res, async () => ({
      shareGrants: await service.listAdvisorShareGrants({
        advisorUserId: req.saasSession.userId,
        actorUserId: req.saasSession.userId,
        limit: req.query.limit || 100,
      }),
    })),
  );

  router.post(
    "/advisor/share-grants/:grantId/accept",
    requireAuth,
    requireCsrf,
    rateLimit({ max: 60 }),
    (req, res) => send(res, async () => ({
      shareGrant: await service.acceptExternalAdvisorShareGrant({
        grantId: req.params.grantId,
        actorUserId: req.saasSession.userId,
      }),
    })),
  );

  return router;
}
