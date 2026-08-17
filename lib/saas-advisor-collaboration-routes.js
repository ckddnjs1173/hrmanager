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
  "business_case_title_", "business_case_summary_", "business_case_transition_", "business_case_review_note_body_",
  "external_advisor_permission_", "external_advisor_permissions_", "external_advisor_invitation_",
];
const BAD_REQUEST_CODES = new Set([
  "business_case_title_required", "business_case_actor_required", "external_advisor_actor_required",
  "external_advisor_organization_required", "external_advisor_resource_type_invalid", "external_advisor_resource_required",
  "external_advisor_user_required", "external_advisor_created_by_required", "external_advisor_self_grant_forbidden",
  "external_advisor_expires_at_required", "external_advisor_created_at_invalid", "external_advisor_expiry_must_be_future",
  "external_advisor_case_read_required", "external_advisor_document_review_requires_read", "external_advisor_business_case_not_shareable",
  "external_advisor_grant_expiry_after_invitation_required",
]);
const NOT_FOUND_CODES = new Set([
  "business_case_not_found", "business_case_organization_not_active", "business_case_review_note_not_found",
  "external_advisor_grant_not_found", "external_advisor_resource_not_found", "external_advisor_organization_not_active",
  "external_advisor_management_membership_required", "external_advisor_cross_tenant_case_forbidden",
  "external_advisor_cross_tenant_resource_forbidden", "external_advisor_shared_case_not_found",
  "external_advisor_invitation_not_found", "external_advisor_review_notes_not_found",
]);
const FORBIDDEN_CODES = new Set([
  "business_case_actor_not_active", "business_case_membership_required", "external_advisor_management_role_required",
  "external_advisor_accept_identity_mismatch", "external_advisor_list_identity_mismatch", "external_advisor_internal_member_forbidden",
  "external_advisor_actor_membership_required", "external_advisor_creator_not_active", "external_advisor_user_not_active",
  "external_advisor_revoker_not_active", "csrf_invalid",
]);
const CONFLICT_CODES = new Set([
  "external_advisor_live_grant_duplicate", "external_advisor_grant_not_pending", "external_advisor_grant_not_revocable",
  "external_advisor_grant_expired", "external_advisor_invitation_pending_duplicate", "external_advisor_invitation_not_revocable",
]);

function errorStatus(error) {
  const code = errorCode(error);
  if (NOT_FOUND_CODES.has(code)) return 404;
  if (FORBIDDEN_CODES.has(code)) return 403;
  if (CONFLICT_CODES.has(code)) return 409;
  if (BAD_REQUEST_CODES.has(code) || BAD_REQUEST_PREFIXES.some((prefix) => code.startsWith(prefix))) return 400;
  return 500;
}

export function createSaasAdvisorCollaborationRouter({ env = process.env, rateLimit, service = null } = {}) {
  if (typeof rateLimit !== "function") throw new Error("saas_advisor_rate_limit_required");
  const router = express.Router();
  let collaborationService = service;
  const getService = () => collaborationService || (collaborationService = createExternalAdvisorCollaborationService());

  router.use((req, res, next) => {
    try { req.saasConfig = getSaasRuntimeConfig(env); }
    catch (error) { return res.status(503).json({ error: errorCode(error) }); }
    if (!req.saasConfig.enabled) return res.status(404).json({ error: "saas_not_enabled" });
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
    return Promise.resolve().then(fn).then((value) => res.status(created ? 201 : 200).json(value))
      .catch((error) => res.status(errorStatus(error)).json({ error: errorCode(error) }));
  }

  router.post("/organizations/:organizationId/business-cases", requireAuth, requireCsrf, rateLimit({ max: 30 }), (req, res) => send(res, async () => ({ businessCase: await getService().createBusinessCase({ organizationId: req.params.organizationId, actorUserId: req.saasSession.userId, title: req.body?.title, summary: req.body?.summary || "" }) }), { created: true }));
  router.get("/organizations/:organizationId/business-cases", requireAuth, (req, res) => send(res, async () => ({ businessCases: await getService().listBusinessCases({ organizationId: req.params.organizationId, actorUserId: req.saasSession.userId, status: req.query.status || null, limit: req.query.limit || 100 }) })));
  router.patch("/business-cases/:caseId/status", requireAuth, requireCsrf, rateLimit({ max: 60 }), (req, res) => send(res, async () => ({ businessCase: await getService().transitionBusinessCase({ caseId: req.params.caseId, actorUserId: req.saasSession.userId, toStatus: req.body?.status, resolutionNote: req.body?.resolutionNote || "", metadata: { requestId: req.requestId || null } }) })));
  router.get("/organizations/:organizationId/business-cases/:caseId/review-notes", requireAuth, (req, res) => send(res, async () => ({ reviewNotes: await getService().listBusinessCaseReviewNotes({ organizationId: req.params.organizationId, caseId: req.params.caseId, actorUserId: req.saasSession.userId, limit: req.query.limit || 200 }) })));
  router.post("/organizations/:organizationId/business-cases/:caseId/review-notes", requireAuth, requireCsrf, rateLimit({ max: 60 }), (req, res) => send(res, async () => ({ reviewNote: await getService().createBusinessCaseReviewNote({ organizationId: req.params.organizationId, caseId: req.params.caseId, actorUserId: req.saasSession.userId, body: req.body?.body, metadata: { requestId: req.requestId || null } }) }), { created: true }));

  router.post("/organizations/:organizationId/business-cases/:caseId/advisor-grants", requireAuth, requireCsrf, rateLimit({ max: 30 }), (req, res) => send(res, async () => ({ shareGrant: await getService().issueExternalAdvisorShareGrant({ organizationId: req.params.organizationId, caseId: req.params.caseId, advisorUserId: req.body?.advisorUserId, permissions: req.body?.permissions, actorUserId: req.saasSession.userId, expiresAt: req.body?.expiresAt, metadata: { ...(req.body?.metadata || {}), requestId: req.requestId || null } }) }), { created: true }));
  router.get("/organizations/:organizationId/advisor-grants", requireAuth, (req, res) => send(res, async () => ({ shareGrants: await getService().listOrganizationShareGrants({ organizationId: req.params.organizationId, actorUserId: req.saasSession.userId, limit: req.query.limit || 100 }) })));
  router.post("/advisor-grants/:grantId/revoke", requireAuth, requireCsrf, rateLimit({ max: 60 }), (req, res) => send(res, async () => ({ shareGrant: await getService().revokeExternalAdvisorShareGrant({ grantId: req.params.grantId, actorUserId: req.saasSession.userId, metadata: { ...(req.body?.metadata || {}), requestId: req.requestId || null } }) })));

  router.post("/organizations/:organizationId/business-cases/:caseId/advisor-invitations", requireAuth, requireCsrf, rateLimit({ max: 20 }), (req, res) => send(res, async () => getService().issueExternalAdvisorInvitation({
    organizationId: req.params.organizationId,
    caseId: req.params.caseId,
    advisorEmail: req.body?.advisorEmail,
    permissions: req.body?.permissions,
    actorUserId: req.saasSession.userId,
    invitationExpiresAt: req.body?.invitationExpiresAt || null,
    grantExpiresAt: req.body?.grantExpiresAt,
    metadata: { ...(req.body?.metadata || {}), requestId: req.requestId || null },
  }), { created: true }));
  router.get("/organizations/:organizationId/advisor-invitations", requireAuth, (req, res) => send(res, async () => ({ invitations: await getService().listOrganizationInvitations({ organizationId: req.params.organizationId, actorUserId: req.saasSession.userId, limit: req.query.limit || 100 }) })));
  router.post("/advisor-invitations/:invitationId/revoke", requireAuth, requireCsrf, rateLimit({ max: 60 }), (req, res) => send(res, async () => ({ invitation: await getService().revokeExternalAdvisorInvitation({ invitationId: req.params.invitationId, actorUserId: req.saasSession.userId }) })));

  router.get("/advisor/share-grants", requireAuth, (req, res) => send(res, async () => ({ shareGrants: await getService().listAdvisorShareGrants({ advisorUserId: req.saasSession.userId, actorUserId: req.saasSession.userId, limit: req.query.limit || 100 }) })));
  router.get("/advisor/share-grants/:grantId/case", requireAuth, (req, res) => send(res, async () => getService().getSharedBusinessCaseForAdvisor({ grantId: req.params.grantId, actorUserId: req.saasSession.userId })));
  router.get("/advisor/share-grants/:grantId/review-notes", requireAuth, (req, res) => send(res, async () => ({ reviewNotes: await getService().listAdvisorCaseReviewNotes({ grantId: req.params.grantId, actorUserId: req.saasSession.userId, limit: req.query.limit || 200 }) })));
  router.post("/advisor/share-grants/:grantId/review-notes", requireAuth, requireCsrf, rateLimit({ max: 60 }), (req, res) => send(res, async () => ({ reviewNote: await getService().createAdvisorCaseReviewNote({ grantId: req.params.grantId, actorUserId: req.saasSession.userId, body: req.body?.body, metadata: { requestId: req.requestId || null } }) }), { created: true }));
  router.post("/advisor/share-grants/:grantId/accept", requireAuth, requireCsrf, rateLimit({ max: 60 }), (req, res) => send(res, async () => ({ shareGrant: await getService().acceptExternalAdvisorShareGrant({ grantId: req.params.grantId, actorUserId: req.saasSession.userId }) })));

  router.post("/advisor/invitations/preview", requireAuth, requireCsrf, rateLimit({ max: 60 }), (req, res) => send(res, async () => getService().previewExternalAdvisorInvitation({ rawToken: req.body?.token, actorUserId: req.saasSession.userId, actorEmail: req.saasSession.user?.email })));
  router.post("/advisor/invitations/accept", requireAuth, requireCsrf, rateLimit({ max: 30 }), (req, res) => send(res, async () => getService().acceptExternalAdvisorInvitation({ rawToken: req.body?.token, actorUserId: req.saasSession.userId, actorEmail: req.saasSession.user?.email })));

  return router;
}
