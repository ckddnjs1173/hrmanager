import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createPostgresPool } from "../lib/postgres-client.js";
import { applyPostgresMigrations } from "../lib/postgres-migrations.js";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
Object.assign(process.env, {
  STORAGE_DRIVER: "postgres",
  SAAS_ENABLED: "1",
  SAAS_AUTH_TOKEN_ECHO: "1",
  SAAS_SESSION_SECRET: "advisor-api-e2e-session-secret",
  SESSION_SECRET: "advisor-api-e2e-legacy-secret",
  ADMIN_TOKEN: "advisor-api-e2e-admin",
  NODE_ENV: "test",
  REQUIRE_PERSISTENT_DB: "0",
  PERSISTENT_STORAGE: "0",
});

const migrationPool = createPostgresPool({ applicationName: "insaya-advisor-api-migrate" });
await applyPostgresMigrations(migrationPool, { logger: { log() {} } });
await migrationPool.end();

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "insaya-advisor-api-e2e-"));
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
  return (response.headers.get("set-cookie") || "").split(";")[0];
}

async function login(email) {
  const requested = await request("/api/saas/auth/magic-link", { method: "POST", body: { email } });
  assert.equal(requested.response.status, 202, `magic-link request failed for ${email}: ${JSON.stringify(requested.body)}`);
  assert.ok(requested.body?.debugToken);
  const verified = await request("/api/saas/auth/magic-link/verify", {
    method: "POST",
    body: { token: requested.body.debugToken },
  });
  assert.equal(verified.response.status, 200, `magic-link verify failed for ${email}: ${JSON.stringify(verified.body)}`);
  assert.ok(verified.body?.csrf);
  assert.ok(verified.body?.user?.id);
  const cookie = cookieFrom(verified.response);
  assert.match(cookie, /^insaya_saas_session=/);
  return { cookie, csrf: verified.body.csrf, user: verified.body.user };
}

const suffix = crypto.randomUUID();
const fixturePool = createPostgresPool({ applicationName: "insaya-advisor-api-fixtures" });

try {
  const owner = await login(`owner-api-${suffix}@example.com`);
  const hr = await login(`hr-api-${suffix}@example.com`);
  const manager = await login(`manager-api-${suffix}@example.com`);
  const advisor = await login(`advisor-api-${suffix}@example.com`);
  const outsider = await login(`outsider-api-${suffix}@example.com`);

  const createOrgA = await request("/api/saas/organizations", {
    method: "POST",
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: { type: "BUSINESS", displayName: `Advisor API A ${suffix}` },
  });
  assert.equal(createOrgA.response.status, 201);
  const orgA = createOrgA.body.organization.id;

  const createOrgB = await request("/api/saas/organizations", {
    method: "POST",
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: { type: "BUSINESS", displayName: `Advisor API B ${suffix}` },
  });
  assert.equal(createOrgB.response.status, 201);
  const orgB = createOrgB.body.organization.id;

  const membershipNow = new Date().toISOString();
  await fixturePool.query(
    `INSERT INTO organization_memberships
     (id,organization_id,user_id,role_key,status,scope,joined_at,removed_at,created_at,updated_at)
     VALUES
       ($1,$2,$3,'HR_ADMIN','ACTIVE','{}'::jsonb,$6,NULL,$6,$6),
       ($4,$2,$5,'MANAGER','ACTIVE','{}'::jsonb,$6,NULL,$6,$6)`,
    [`mem-api-hr-${suffix}`, orgA, hr.user.id, `mem-api-manager-${suffix}`, manager.user.id, membershipNow],
  );

  const unauthenticated = await request(`/api/saas/organizations/${orgA}/business-cases`);
  assert.equal(unauthenticated.response.status, 401);
  assert.equal(unauthenticated.body?.error, "authentication_required");

  const missingCsrf = await request(`/api/saas/organizations/${orgA}/business-cases`, {
    method: "POST",
    cookie: owner.cookie,
    body: { title: "CSRF 차단" },
  });
  assert.equal(missingCsrf.response.status, 403);
  assert.equal(missingCsrf.body?.error, "csrf_invalid");

  const createCase = await request(`/api/saas/organizations/${orgA}/business-cases`, {
    method: "POST",
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: {
      title: "외부 노무자문 케이스",
      summary: "Bundle 26 API E2E",
      actorUserId: outsider.user.id,
    },
  });
  assert.equal(createCase.response.status, 201, JSON.stringify(createCase.body));
  assert.equal(createCase.body?.businessCase?.status, "DRAFT");
  assert.equal(createCase.body?.businessCase?.createdByUserId, owner.user.id, "route must ignore spoofed actorUserId body field");
  const caseId = createCase.body.businessCase.id;

  const managerCreate = await request(`/api/saas/organizations/${orgA}/business-cases`, {
    method: "POST",
    cookie: manager.cookie,
    csrf: manager.csrf,
    body: { title: "Manager 금지", actorUserId: owner.user.id },
  });
  assert.equal(managerCreate.response.status, 403);
  assert.equal(managerCreate.body?.error, "external_advisor_management_role_required");

  const ownerList = await request(`/api/saas/organizations/${orgA}/business-cases`, { cookie: owner.cookie });
  assert.equal(ownerList.response.status, 200);
  assert.equal(ownerList.body.businessCases.some((item) => item.id === caseId), true);

  const draftShare = await request(`/api/saas/organizations/${orgA}/business-cases/${caseId}/advisor-grants`, {
    method: "POST",
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: {
      advisorUserId: advisor.user.id,
      permissions: ["case.read"],
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    },
  });
  assert.equal(draftShare.response.status, 400);
  assert.equal(draftShare.body?.error, "external_advisor_business_case_not_shareable");

  const managerOpen = await request(`/api/saas/business-cases/${caseId}/status`, {
    method: "PATCH",
    cookie: manager.cookie,
    csrf: manager.csrf,
    body: { status: "OPEN", actorUserId: owner.user.id },
  });
  assert.equal(managerOpen.response.status, 403);
  assert.equal(managerOpen.body?.error, "external_advisor_management_role_required");

  const openCase = await request(`/api/saas/business-cases/${caseId}/status`, {
    method: "PATCH",
    cookie: hr.cookie,
    csrf: hr.csrf,
    body: { status: "OPEN" },
  });
  assert.equal(openCase.response.status, 200, JSON.stringify(openCase.body));
  assert.equal(openCase.body.businessCase.status, "OPEN");

  const crossTenantShare = await request(`/api/saas/organizations/${orgB}/business-cases/${caseId}/advisor-grants`, {
    method: "POST",
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: {
      advisorUserId: advisor.user.id,
      permissions: ["case.read"],
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    },
  });
  assert.equal(crossTenantShare.response.status, 404);
  assert.equal(crossTenantShare.body?.error, "external_advisor_cross_tenant_case_forbidden");

  const shareNoCsrf = await request(`/api/saas/organizations/${orgA}/business-cases/${caseId}/advisor-grants`, {
    method: "POST",
    cookie: hr.cookie,
    body: {
      advisorUserId: advisor.user.id,
      permissions: ["case.read"],
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    },
  });
  assert.equal(shareNoCsrf.response.status, 403);
  assert.equal(shareNoCsrf.body?.error, "csrf_invalid");

  const issueGrant = await request(`/api/saas/organizations/${orgA}/business-cases/${caseId}/advisor-grants`, {
    method: "POST",
    cookie: hr.cookie,
    csrf: hr.csrf,
    body: {
      advisorUserId: advisor.user.id,
      permissions: ["case.read", "document.read", "comment.create"],
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      actorUserId: owner.user.id,
      metadata: { purpose: "api-e2e" },
    },
  });
  assert.equal(issueGrant.response.status, 201, JSON.stringify(issueGrant.body));
  assert.equal(issueGrant.body.shareGrant.status, "PENDING");
  assert.equal(issueGrant.body.shareGrant.createdByUserId, hr.user.id, "grant creator must come from authenticated session");
  const grantId = issueGrant.body.shareGrant.id;

  const managerGrantList = await request(`/api/saas/organizations/${orgA}/advisor-grants`, { cookie: manager.cookie });
  assert.equal(managerGrantList.response.status, 403);
  assert.equal(managerGrantList.body?.error, "external_advisor_management_role_required");

  const hrGrantList = await request(`/api/saas/organizations/${orgA}/advisor-grants`, { cookie: hr.cookie });
  assert.equal(hrGrantList.response.status, 200);
  assert.equal(hrGrantList.body.shareGrants.some((item) => item.id === grantId), true);

  const advisorPendingList = await request("/api/saas/advisor/share-grants", { cookie: advisor.cookie });
  assert.equal(advisorPendingList.response.status, 200);
  assert.equal(advisorPendingList.body.shareGrants.some((item) => item.id === grantId && item.status === "PENDING"), true);

  const outsiderList = await request("/api/saas/advisor/share-grants", { cookie: outsider.cookie });
  assert.equal(outsiderList.response.status, 200);
  assert.equal(outsiderList.body.shareGrants.some((item) => item.id === grantId), false);

  const wrongAccept = await request(`/api/saas/advisor/share-grants/${grantId}/accept`, {
    method: "POST",
    cookie: outsider.cookie,
    csrf: outsider.csrf,
    body: { actorUserId: advisor.user.id },
  });
  assert.equal(wrongAccept.response.status, 403);
  assert.equal(wrongAccept.body?.error, "external_advisor_accept_identity_mismatch");

  const acceptNoCsrf = await request(`/api/saas/advisor/share-grants/${grantId}/accept`, {
    method: "POST",
    cookie: advisor.cookie,
  });
  assert.equal(acceptNoCsrf.response.status, 403);
  assert.equal(acceptNoCsrf.body?.error, "csrf_invalid");

  const acceptGrant = await request(`/api/saas/advisor/share-grants/${grantId}/accept`, {
    method: "POST",
    cookie: advisor.cookie,
    csrf: advisor.csrf,
    body: { actorUserId: outsider.user.id },
  });
  assert.equal(acceptGrant.response.status, 200, JSON.stringify(acceptGrant.body));
  assert.equal(acceptGrant.body.shareGrant.status, "ACTIVE");
  assert.equal(acceptGrant.body.shareGrant.advisorUserId, advisor.user.id);

  const managerRevoke = await request(`/api/saas/advisor-grants/${grantId}/revoke`, {
    method: "POST",
    cookie: manager.cookie,
    csrf: manager.csrf,
  });
  assert.equal(managerRevoke.response.status, 403);
  assert.equal(managerRevoke.body?.error, "external_advisor_management_role_required");

  const revokeNoCsrf = await request(`/api/saas/advisor-grants/${grantId}/revoke`, {
    method: "POST",
    cookie: hr.cookie,
  });
  assert.equal(revokeNoCsrf.response.status, 403);
  assert.equal(revokeNoCsrf.body?.error, "csrf_invalid");

  const revokeGrant = await request(`/api/saas/advisor-grants/${grantId}/revoke`, {
    method: "POST",
    cookie: hr.cookie,
    csrf: hr.csrf,
    body: { metadata: { reason: "api-e2e-complete" }, actorUserId: owner.user.id },
  });
  assert.equal(revokeGrant.response.status, 200, JSON.stringify(revokeGrant.body));
  assert.equal(revokeGrant.body.shareGrant.status, "REVOKED");
  assert.equal(revokeGrant.body.shareGrant.revokedByUserId, hr.user.id);

  const advisorAfterRevoke = await request("/api/saas/advisor/share-grants", { cookie: advisor.cookie });
  assert.equal(advisorAfterRevoke.response.status, 200);
  assert.equal(advisorAfterRevoke.body.shareGrants.some((item) => item.id === grantId && item.status === "REVOKED"), true);

  const advisorMembership = await fixturePool.query(
    `SELECT COUNT(*)::integer AS count FROM organization_memberships
     WHERE organization_id=$1 AND user_id=$2 AND status='ACTIVE'`,
    [orgA, advisor.user.id],
  );
  assert.equal(advisorMembership.rows[0].count, 0, "advisor collaboration API must never create organization Membership");

  const dbGrant = await fixturePool.query(
    `SELECT created_by_user_id,advisor_user_id,status,revoked_by_user_id
     FROM external_advisor_share_grants WHERE id=$1`,
    [grantId],
  );
  assert.equal(dbGrant.rows[0].created_by_user_id, hr.user.id);
  assert.equal(dbGrant.rows[0].advisor_user_id, advisor.user.id);
  assert.equal(dbGrant.rows[0].status, "REVOKED");
  assert.equal(dbGrant.rows[0].revoked_by_user_id, hr.user.id);

  const events = await fixturePool.query(
    `SELECT event_type,actor_user_id FROM external_advisor_share_grant_events
     WHERE share_grant_id=$1 ORDER BY created_at ASC,id ASC`,
    [grantId],
  );
  assert.deepEqual(events.rows.map((row) => row.event_type), ["CREATED", "ACCEPTED", "REVOKED"]);
  assert.deepEqual(events.rows.map((row) => row.actor_user_id), [hr.user.id, advisor.user.id, hr.user.id]);

  console.log("External Advisor collaboration API E2E passed: SaaS session actor, CSRF, OWNER/HR_ADMIN RBAC, Case sharing, advisor self-acceptance, tenant isolation and revocation.");
} finally {
  await new Promise((resolve) => server.close(resolve));
  await Promise.allSettled([closeRuntimeStorage(), closeRuntimePostgres()]);
  await fixturePool.end();
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
