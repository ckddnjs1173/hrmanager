import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { createPostgresPool } from "../lib/postgres-client.js";
import { applyPostgresMigrations } from "../lib/postgres-migrations.js";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
Object.assign(process.env, {
  STORAGE_DRIVER: "postgres",
  SAAS_ENABLED: "1",
  SAAS_AUTH_TOKEN_ECHO: "1",
  SAAS_SESSION_SECRET: "saas-e2e-session-secret",
  SESSION_SECRET: "legacy-e2e-session-secret",
  ADMIN_TOKEN: "saas-e2e-admin",
  NODE_ENV: "test",
  REQUIRE_PERSISTENT_DB: "0",
  PERSISTENT_STORAGE: "0",
});

const migrationPool = createPostgresPool({ applicationName: "insaya-saas-e2e-migrate" });
await applyPostgresMigrations(migrationPool, { logger: { log() {} } });
await migrationPool.end();

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "insaya-saas-e2e-"));
const { createApplication } = await import("../lib/application.js");
const { closeRuntimeStorage } = await import("../lib/runtime-repo.js");
const { closeRuntimePostgres } = await import("../lib/runtime-postgres.js");
const { app } = createApplication({ rootDir: tempRoot, env: process.env, warn: () => {} });
const server = app.listen(0, "127.0.0.1");
await once(server, "listening");
const base = `http://127.0.0.1:${server.address().port}`;

async function request(pathname, { method = "GET", body, cookie = "", csrf = "" } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  if (csrf) headers["x-csrf-token"] = csrf;
  const response = await fetch(`${base}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { response, body: parsed };
}

function cookieFrom(response) {
  const setCookie = response.headers.get("set-cookie") || "";
  return setCookie.split(";")[0];
}

async function login(email) {
  const requested = await request("/api/saas/auth/magic-link", { method: "POST", body: { email } });
  if (requested.response.status !== 202 || !requested.body?.debugToken) {
    throw new Error(`magic link request failed: ${requested.response.status} ${JSON.stringify(requested.body)}`);
  }
  const rawMagicToken = requested.body.debugToken;
  const verified = await request("/api/saas/auth/magic-link/verify", { method: "POST", body: { token: rawMagicToken } });
  if (verified.response.status !== 200 || !verified.body?.csrf || !verified.body?.user?.id) {
    throw new Error(`magic link verify failed: ${verified.response.status} ${JSON.stringify(verified.body)}`);
  }
  const cookie = cookieFrom(verified.response);
  if (!cookie.includes("insaya_saas_session=")) throw new Error("saas session cookie missing");
  return { email, rawMagicToken, cookie, csrf: verified.body.csrf, user: verified.body.user };
}

try {
  const disabledProbe = await request("/api/saas/auth/me");
  if (disabledProbe.response.status !== 401) throw new Error(`enabled unauthenticated SaaS probe should be 401, got ${disabledProbe.response.status}`);

  const owner = await login("owner@example.com");
  const duplicateVerify = await request("/api/saas/auth/magic-link/verify", { method: "POST", body: { token: owner.rawMagicToken } });
  if (duplicateVerify.response.status !== 401 || duplicateVerify.body?.error !== "magic_token_consumed") {
    throw new Error(`magic link replay was not rejected: ${duplicateVerify.response.status} ${JSON.stringify(duplicateVerify.body)}`);
  }

  const me = await request("/api/saas/auth/me", { cookie: owner.cookie });
  if (me.response.status !== 200 || me.body?.user?.email !== "owner@example.com") throw new Error("owner session lookup failed");

  const createOrg = await request("/api/saas/organizations", {
    method: "POST",
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: { type: "BUSINESS", legalName: "테스트 주식회사", displayName: "테스트 회사" },
  });
  if (createOrg.response.status !== 201 || createOrg.body?.membership?.roleKey !== "OWNER") {
    throw new Error(`organization create failed: ${createOrg.response.status} ${JSON.stringify(createOrg.body)}`);
  }
  const org1 = createOrg.body.organization.id;

  const noCsrf = await request("/api/saas/organizations", {
    method: "POST",
    cookie: owner.cookie,
    body: { displayName: "CSRF 실패" },
  });
  if (noCsrf.response.status !== 403 || noCsrf.body?.error !== "csrf_invalid") throw new Error("CSRF gate failed");

  const invite = await request(`/api/saas/organizations/${org1}/invitations`, {
    method: "POST",
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: { email: "hr@example.com", roleKey: "HR_ADMIN" },
  });
  if (invite.response.status !== 201 || !invite.body?.debugToken) {
    throw new Error(`HR invitation failed: ${invite.response.status} ${JSON.stringify(invite.body)}`);
  }
  const rawInviteToken = invite.body.debugToken;

  const advisorInvite = await request(`/api/saas/organizations/${org1}/invitations`, {
    method: "POST",
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: { email: "advisor@example.com", roleKey: "EXTERNAL_ADVISOR" },
  });
  if (advisorInvite.response.status !== 400 || advisorInvite.body?.error !== "invitation_role_invalid") {
    throw new Error("External Advisor must not be added through normal membership invitation");
  }

  const hr = await login("hr@example.com");
  const accept = await request("/api/saas/invitations/accept", {
    method: "POST",
    cookie: hr.cookie,
    csrf: hr.csrf,
    body: { token: rawInviteToken },
  });
  if (accept.response.status !== 200 || accept.body?.membership?.roleKey !== "HR_ADMIN") {
    throw new Error(`invitation accept failed: ${accept.response.status} ${JSON.stringify(accept.body)}`);
  }
  const hrMembershipId = accept.body.membership.id;

  const ownerMembers = await request(`/api/saas/organizations/${org1}/members`, { cookie: owner.cookie });
  if (ownerMembers.response.status !== 200 || ownerMembers.body?.members?.length !== 2) {
    throw new Error(`member list failed: ${ownerMembers.response.status} ${JSON.stringify(ownerMembers.body)}`);
  }

  const hrMembers = await request(`/api/saas/organizations/${org1}/members`, { cookie: hr.cookie });
  if (hrMembers.response.status !== 200) throw new Error("HR Admin member.read permission failed");

  const hrRoleChange = await request(`/api/saas/organizations/${org1}/members/${hrMembershipId}/role`, {
    method: "PATCH",
    cookie: hr.cookie,
    csrf: hr.csrf,
    body: { roleKey: "MANAGER" },
  });
  if (hrRoleChange.response.status !== 403) throw new Error("HR Admin must not change roles");

  const secondOrg = await request("/api/saas/organizations", {
    method: "POST",
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: { displayName: "두 번째 회사" },
  });
  if (secondOrg.response.status !== 201) throw new Error("second organization create failed");
  const org2 = secondOrg.body.organization.id;

  const crossTenant = await request(`/api/saas/organizations/${org2}`, { cookie: hr.cookie });
  if (crossTenant.response.status !== 404 || crossTenant.body?.error !== "organization_not_found") {
    throw new Error(`cross-tenant organization access leaked: ${crossTenant.response.status}`);
  }

  const hrInviteEmployee = await request(`/api/saas/organizations/${org1}/invitations`, {
    method: "POST",
    cookie: hr.cookie,
    csrf: hr.csrf,
    body: { email: "employee@example.com", roleKey: "EMPLOYEE" },
  });
  if (hrInviteEmployee.response.status !== 201) throw new Error("HR Admin member.invite permission failed");

  const ownerRoleChange = await request(`/api/saas/organizations/${org1}/members/${hrMembershipId}/role`, {
    method: "PATCH",
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: { roleKey: "MANAGER" },
  });
  if (ownerRoleChange.response.status !== 200 || ownerRoleChange.body?.membership?.roleKey !== "MANAGER") {
    throw new Error("Owner role change failed");
  }

  const managerMembers = await request(`/api/saas/organizations/${org1}/members`, { cookie: hr.cookie });
  if (managerMembers.response.status !== 403) throw new Error("Manager must lose member.read after role downgrade");

  const removeHr = await request(`/api/saas/organizations/${org1}/members/${hrMembershipId}`, {
    method: "DELETE",
    cookie: owner.cookie,
    csrf: owner.csrf,
  });
  if (removeHr.response.status !== 204) throw new Error(`member removal failed: ${removeHr.response.status}`);

  const removedAccess = await request(`/api/saas/organizations/${org1}`, { cookie: hr.cookie });
  if (removedAccess.response.status !== 404) throw new Error("removed member retained organization access");

  const pool = createPostgresPool({ applicationName: "insaya-saas-e2e-verify" });
  try {
    const [challenges, sessions, invitations, audits, securityEvents] = await Promise.all([
      pool.query("SELECT token_hash FROM auth_challenges"),
      pool.query("SELECT token_hash FROM user_sessions"),
      pool.query("SELECT token_hash FROM organization_invitations"),
      pool.query("SELECT action FROM audit_logs ORDER BY created_at"),
      pool.query("SELECT event FROM security_events ORDER BY created_at"),
    ]);
    const cookieRaw = decodeURIComponent(owner.cookie.split("=").slice(1).join("="));
    const persistedHashes = [
      ...challenges.rows.map((row) => row.token_hash),
      ...sessions.rows.map((row) => row.token_hash),
      ...invitations.rows.map((row) => row.token_hash),
    ];
    for (const raw of [owner.rawMagicToken, rawInviteToken, cookieRaw]) {
      if (persistedHashes.includes(raw)) throw new Error("raw authentication/invitation token was persisted");
    }
    const auditActions = audits.rows.map((row) => row.action);
    for (const action of ["organization.create", "member.invite", "member.invite.accept", "member.role.change", "member.remove"]) {
      if (!auditActions.includes(action)) throw new Error(`audit action missing: ${action}`);
    }
    const security = securityEvents.rows.map((row) => row.event);
    if (!security.includes("auth.magic.request") || !security.includes("auth.login")) throw new Error("auth security events missing");
  } finally {
    await pool.end();
  }

  const logout = await request("/api/saas/auth/logout", { method: "POST", cookie: owner.cookie, csrf: owner.csrf });
  if (logout.response.status !== 200) throw new Error("logout failed");
  const afterLogout = await request("/api/saas/auth/me", { cookie: owner.cookie });
  if (afterLogout.response.status !== 401) throw new Error("revoked session remained active");

  console.log("SaaS Auth/Tenant E2E passed: magic-link auth + CSRF + Organization + RBAC + invitations + tenant isolation + audit + session revoke.");
} finally {
  await new Promise((resolve) => server.close(resolve));
  await Promise.allSettled([closeRuntimeStorage(), closeRuntimePostgres()]);
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
