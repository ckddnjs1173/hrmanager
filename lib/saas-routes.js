import express from "express";
import crypto from "node:crypto";
import { errorCode, createErrorStatusResolver } from "./error-utils.js";
import { getSaasRuntimeConfig } from "./saas-runtime-config.js";
import {
  consumeMagicChallenge,
  findSessionByRawToken,
  issueMagicChallenge,
  revokeSession,
} from "./saas-auth-repo.js";
import {
  SAAS_INVITABLE_ROLES,
  acceptOrganizationInvitation,
  changeMemberRole,
  createOrganization,
  createOrganizationInvitation,
  getOrganizationForMember,
  listOrganizationMembers,
  listOrganizationsForUser,
  removeMember,
  requireOrganizationPermission,
  revokeOrganizationInvitation,
} from "./saas-tenant-repo.js";
import {
  createComplianceScope,
  createEmployee,
  createWorkplace,
  getBusinessOnboarding,
  getBusinessProfile,
  importEmployees,
  listComplianceScopes,
  listEmployees,
  listWorkplaces,
  updatePolicyFacts,
  upsertBusinessProfile,
} from "./saas-business-repo.js";

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

function ipHash(req, secret) {
  return crypto.createHmac("sha256", secret).update(String(req.ip || "")).digest("hex").slice(0, 32);
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

function sessionCookie(config, rawToken) {
  const maxAge = config.sessionTtlDays * 86_400;
  return [
    `${config.cookieName}=${encodeURIComponent(rawToken)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/api/saas",
    `Max-Age=${maxAge}`,
    config.production ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

function clearSessionCookie(config) {
  return [
    `${config.cookieName}=`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/api/saas",
    "Max-Age=0",
    config.production ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

const errorStatus = createErrorStatusResolver([
  { codes: [
    "invalid_email", "magic_token_required", "organization_name_required", "organization_type_invalid",
    "invitation_role_invalid", "member_role_invalid", "payday_invalid", "weekly_hours_invalid",
    "onboarding_fact_confidence_invalid", "workplace_name_required", "compliance_scope_name_required",
    "workplace_not_found", "display_name_required", "hire_date_required", "base_wage_invalid",
    "fixed_allowances_invalid", "employee_rows_required", "employee_import_too_large", "employee_number_duplicate",
  ], status: 400 },
  { codes: ["magic_token_invalid", "magic_token_consumed", "magic_token_expired", "user_unavailable"], status: 401 },
  { codes: ["invitation_invalid", "invitation_not_pending", "invitation_expired", "invitation_email_mismatch"], status: 400 },
  { codes: ["permission_denied", "owner_transfer_required"], status: 403 },
]);

export function createSaasRouter({ env = process.env, rateLimit } = {}) {
  if (typeof rateLimit !== "function") throw new Error("saas_rate_limit_required");
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
    const config = req.saasConfig;
    const rawToken = parseCookies(req)[config.cookieName] || "";
    const session = await findSessionByRawToken(rawToken);
    if (!session) return res.status(401).json({ error: "authentication_required" });
    req.saasSession = session;
    req.saasRawSessionToken = rawToken;
    next();
  }

  function requireCsrf(req, res, next) {
    const expected = csrfFor(req.saasSession?.sessionId, req.saasConfig.sessionSecret);
    if (!safeEqual(req.get("x-csrf-token"), expected)) return res.status(403).json({ error: "csrf_invalid" });
    next();
  }

  async function requireOrg(permission, req, res, next) {
    const organizationId = req.params.organizationId;
    const access = await requireOrganizationPermission({ organizationId, userId: req.saasSession.userId, permission });
    if (!access.membership) return res.status(404).json({ error: "organization_not_found" });
    if (!access.allowed) return res.status(403).json({ error: access.reason || "permission_denied" });
    req.organizationMembership = access.membership;
    next();
  }

  const orgPermission = (permission) => (req, res, next) => requireOrg(permission, req, res, next);
  const sendBusiness = (res, fn) => Promise.resolve().then(fn).then((value) => res.json(value)).catch((error) => res.status(errorStatus(error)).json({ error: errorCode(error) }));

  router.post("/auth/magic-link", rateLimit({ max: 10 }), async (req, res) => {
    const config = req.saasConfig;
    if (!config.debugTokenEcho) return res.status(503).json({ error: "magic_link_delivery_not_configured" });
    try {
      const challenge = await issueMagicChallenge({ email: req.body?.email, ttlMinutes: config.challengeTtlMinutes, ipHash: ipHash(req, config.sessionSecret), requestId: req.requestId || null });
      return res.status(202).json({ ok: true, expiresAt: challenge.expiresAt, debugToken: challenge.rawToken });
    } catch (error) { return res.status(errorStatus(error)).json({ error: errorCode(error) }); }
  });

  router.post("/auth/magic-link/verify", rateLimit({ max: 20 }), async (req, res) => {
    const config = req.saasConfig;
    try {
      const result = await consumeMagicChallenge({ token: req.body?.token, sessionTtlDays: config.sessionTtlDays, ipHash: ipHash(req, config.sessionSecret), userAgent: req.get("user-agent") || "", requestId: req.requestId || null });
      res.append("Set-Cookie", sessionCookie(config, result.session.rawToken));
      return res.json({ ok: true, user: result.user, csrf: csrfFor(result.session.id, config.sessionSecret), sessionExpiresAt: result.session.expiresAt });
    } catch (error) { return res.status(errorStatus(error)).json({ error: errorCode(error) }); }
  });

  router.get("/auth/me", requireAuth, async (req, res) => res.json({ user: req.saasSession.user, csrf: csrfFor(req.saasSession.sessionId, req.saasConfig.sessionSecret), sessionExpiresAt: req.saasSession.expiresAt }));
  router.post("/auth/logout", requireAuth, requireCsrf, async (req, res) => {
    await revokeSession({ sessionId: req.saasSession.sessionId, userId: req.saasSession.userId, requestId: req.requestId || null, ipHash: ipHash(req, req.saasConfig.sessionSecret) });
    res.append("Set-Cookie", clearSessionCookie(req.saasConfig));
    return res.json({ ok: true });
  });

  router.get("/organizations", requireAuth, async (req, res) => res.json({ organizations: await listOrganizationsForUser(req.saasSession.userId) }));
  router.post("/organizations", requireAuth, requireCsrf, async (req, res) => {
    try {
      const result = await createOrganization({ userId: req.saasSession.userId, type: req.body?.type || "BUSINESS", legalName: req.body?.legalName || "", displayName: req.body?.displayName || "", requestId: req.requestId || null });
      return res.status(201).json(result);
    } catch (error) { return res.status(errorStatus(error)).json({ error: errorCode(error) }); }
  });
  router.get("/organizations/:organizationId", requireAuth, async (req, res) => {
    const result = await getOrganizationForMember(req.params.organizationId, req.saasSession.userId);
    if (!result) return res.status(404).json({ error: "organization_not_found" });
    return res.json(result);
  });
  router.get("/organizations/:organizationId/members", requireAuth, orgPermission("member.read"), async (req, res) => res.json({ members: await listOrganizationMembers(req.params.organizationId) }));

  router.post("/organizations/:organizationId/invitations", requireAuth, requireCsrf, orgPermission("member.invite"), rateLimit({ max: 30 }), async (req, res) => {
    const config = req.saasConfig;
    if (!config.debugTokenEcho) return res.status(503).json({ error: "invitation_delivery_not_configured" });
    try {
      const invitation = await createOrganizationInvitation({ organizationId: req.params.organizationId, actorUserId: req.saasSession.userId, email: req.body?.email, roleKey: req.body?.roleKey || "HR_ADMIN", ttlDays: config.invitationTtlDays, requestId: req.requestId || null });
      return res.status(201).json({ invitation: { id: invitation.id, organizationId: invitation.organizationId, email: invitation.email, roleKey: invitation.roleKey, expiresAt: invitation.expiresAt }, debugToken: invitation.rawToken, allowedRoles: SAAS_INVITABLE_ROLES });
    } catch (error) { return res.status(errorStatus(error)).json({ error: errorCode(error) }); }
  });
  router.post("/invitations/accept", requireAuth, requireCsrf, async (req, res) => {
    try {
      const membership = await acceptOrganizationInvitation({ rawToken: req.body?.token, userId: req.saasSession.userId, userEmail: req.saasSession.user.email, requestId: req.requestId || null });
      return res.json({ membership });
    } catch (error) { return res.status(errorStatus(error)).json({ error: errorCode(error) }); }
  });
  router.post("/organizations/:organizationId/invitations/:invitationId/revoke", requireAuth, requireCsrf, orgPermission("member.invite"), async (req, res) => {
    try {
      const revoked = await revokeOrganizationInvitation({ organizationId: req.params.organizationId, invitationId: req.params.invitationId, actorUserId: req.saasSession.userId, requestId: req.requestId || null });
      if (!revoked) return res.status(404).json({ error: "invitation_not_found" });
      return res.json({ ok: true });
    } catch (error) { return res.status(errorStatus(error)).json({ error: errorCode(error) }); }
  });
  router.patch("/organizations/:organizationId/members/:membershipId/role", requireAuth, requireCsrf, orgPermission("member.role.change"), async (req, res) => {
    try {
      const membership = await changeMemberRole({ organizationId: req.params.organizationId, membershipId: req.params.membershipId, actorUserId: req.saasSession.userId, roleKey: req.body?.roleKey, requestId: req.requestId || null });
      if (!membership) return res.status(404).json({ error: "membership_not_found" });
      return res.json({ membership });
    } catch (error) { return res.status(errorStatus(error)).json({ error: errorCode(error) }); }
  });
  router.delete("/organizations/:organizationId/members/:membershipId", requireAuth, requireCsrf, orgPermission("member.remove"), async (req, res) => {
    try {
      const removed = await removeMember({ organizationId: req.params.organizationId, membershipId: req.params.membershipId, actorUserId: req.saasSession.userId, requestId: req.requestId || null });
      if (!removed) return res.status(404).json({ error: "membership_not_found" });
      return res.status(204).end();
    } catch (error) { return res.status(errorStatus(error)).json({ error: errorCode(error) }); }
  });

  // Business onboarding/configuration is intentionally Owner/HR-Admin oriented in this bundle.
  // Manager broad reads are deferred until assigned workplace scope enforcement is live.
  router.get("/organizations/:organizationId/onboarding", requireAuth, orgPermission("compliance.manage"), async (req, res) => sendBusiness(res, () => getBusinessOnboarding(req.params.organizationId)));
  router.get("/organizations/:organizationId/business-profile", requireAuth, orgPermission("compliance.manage"), async (req, res) => {
    const profile = await getBusinessProfile(req.params.organizationId);
    return res.json({ profile });
  });
  router.put("/organizations/:organizationId/business-profile", requireAuth, requireCsrf, orgPermission("compliance.manage"), async (req, res) => sendBusiness(res, () => upsertBusinessProfile({ organizationId: req.params.organizationId, actorUserId: req.saasSession.userId, profile: req.body?.profile || {}, confidence: req.body?.confidence || {}, requestId: req.requestId || null })));
  router.put("/organizations/:organizationId/policy-facts", requireAuth, requireCsrf, orgPermission("compliance.manage"), async (req, res) => sendBusiness(res, () => updatePolicyFacts({ organizationId: req.params.organizationId, actorUserId: req.saasSession.userId, facts: req.body?.facts || {}, confidence: req.body?.confidence || {}, requestId: req.requestId || null })));

  router.get("/organizations/:organizationId/workplaces", requireAuth, orgPermission("workplace.manage"), async (req, res) => res.json({ workplaces: await listWorkplaces(req.params.organizationId) }));
  router.post("/organizations/:organizationId/workplaces", requireAuth, requireCsrf, orgPermission("workplace.manage"), async (req, res) => {
    try { return res.status(201).json(await createWorkplace({ organizationId: req.params.organizationId, actorUserId: req.saasSession.userId, data: req.body || {}, requestId: req.requestId || null })); }
    catch (error) { return res.status(errorStatus(error)).json({ error: errorCode(error) }); }
  });

  router.get("/organizations/:organizationId/compliance-scopes", requireAuth, orgPermission("compliance.manage"), async (req, res) => res.json({ scopes: await listComplianceScopes(req.params.organizationId) }));
  router.post("/organizations/:organizationId/compliance-scopes", requireAuth, requireCsrf, orgPermission("compliance.manage"), async (req, res) => {
    try { return res.status(201).json(await createComplianceScope({ organizationId: req.params.organizationId, actorUserId: req.saasSession.userId, data: req.body || {}, requestId: req.requestId || null })); }
    catch (error) { return res.status(errorStatus(error)).json({ error: errorCode(error) }); }
  });

  router.get("/organizations/:organizationId/employees", requireAuth, orgPermission("employee.write"), async (req, res) => res.json({ employees: await listEmployees(req.params.organizationId) }));
  router.post("/organizations/:organizationId/employees", requireAuth, requireCsrf, orgPermission("employee.write"), async (req, res) => {
    try { return res.status(201).json(await createEmployee({ organizationId: req.params.organizationId, actorUserId: req.saasSession.userId, data: req.body || {}, requestId: req.requestId || null })); }
    catch (error) { return res.status(errorStatus(error)).json({ error: errorCode(error) }); }
  });
  router.post("/organizations/:organizationId/employees/import", requireAuth, requireCsrf, orgPermission("employee.write"), rateLimit({ max: 10 }), async (req, res) => sendBusiness(res, () => importEmployees({ organizationId: req.params.organizationId, actorUserId: req.saasSession.userId, rows: req.body?.rows || [], requestId: req.requestId || null })));

  return router;
}
