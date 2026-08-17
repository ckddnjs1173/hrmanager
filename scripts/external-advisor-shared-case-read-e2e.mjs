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
  SAAS_SESSION_SECRET: "advisor-shared-case-read-session-secret",
  SESSION_SECRET: "advisor-shared-case-read-legacy-secret",
  ADMIN_TOKEN: "advisor-shared-case-read-admin",
  NODE_ENV: "test",
  REQUIRE_PERSISTENT_DB: "0",
  PERSISTENT_STORAGE: "0",
});

const migrationPool = createPostgresPool({ applicationName: "insaya-advisor-shared-case-read-migrate" });
await applyPostgresMigrations(migrationPool, { logger: { log() {} } });
await migrationPool.end();

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "insaya-advisor-shared-case-read-"));
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
  assert.equal(requested.response.status, 202);
  const verified = await request("/api/saas/auth/magic-link/verify", {
    method: "POST",
    body: { token: requested.body.debugToken },
  });
  assert.equal(verified.response.status, 200);
  return {
    cookie: cookieFrom(verified.response),
    csrf: verified.body.csrf,
    user: verified.body.user,
  };
}

const suffix = crypto.randomUUID();

try {
  const owner = await login(`owner-shared-read-${suffix}@example.com`);
  const advisor = await login(`advisor-shared-read-${suffix}@example.com`);
  const other = await login(`other-shared-read-${suffix}@example.com`);

  const createdOrg = await request("/api/saas/organizations", {
    method: "POST",
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: { type: "BUSINESS", displayName: `Shared Case Read ${suffix}` },
  });
  assert.equal(createdOrg.response.status, 201);
  const organizationId = createdOrg.body.organization.id;

  const createdCase = await request(`/api/saas/organizations/${organizationId}/business-cases`, {
    method: "POST",
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: {
      title: "외부 자문 공유용 케이스",
      summary: "외부 자문자에게 공유 가능한 최소 사실관계",
    },
  });
  assert.equal(createdCase.response.status, 201);
  const caseId = createdCase.body.businessCase.id;

  const openedCase = await request(`/api/saas/business-cases/${caseId}/status`, {
    method: "PATCH",
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: { status: "OPEN" },
  });
  assert.equal(openedCase.response.status, 200);

  const issued = await request(`/api/saas/organizations/${organizationId}/business-cases/${caseId}/advisor-grants`, {
    method: "POST",
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: {
      advisorUserId: advisor.user.id,
      permissions: ["case.read", "document.read"],
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    },
  });
  assert.equal(issued.response.status, 201, JSON.stringify(issued.body));
  const grantId = issued.body.shareGrant.id;

  const pendingRead = await request(`/api/saas/advisor/share-grants/${grantId}/case`, { cookie: advisor.cookie });
  assert.equal(pendingRead.response.status, 404);
  assert.equal(pendingRead.body?.error, "external_advisor_shared_case_not_found");

  const otherPendingRead = await request(`/api/saas/advisor/share-grants/${grantId}/case`, { cookie: other.cookie });
  assert.equal(otherPendingRead.response.status, 404);
  assert.equal(otherPendingRead.body?.error, "external_advisor_shared_case_not_found");

  const accepted = await request(`/api/saas/advisor/share-grants/${grantId}/accept`, {
    method: "POST",
    cookie: advisor.cookie,
    csrf: advisor.csrf,
  });
  assert.equal(accepted.response.status, 200);
  assert.equal(accepted.body.shareGrant.status, "ACTIVE");

  const sharedRead = await request(`/api/saas/advisor/share-grants/${grantId}/case`, { cookie: advisor.cookie });
  assert.equal(sharedRead.response.status, 200, JSON.stringify(sharedRead.body));
  assert.deepEqual(Object.keys(sharedRead.body).sort(), ["businessCase", "shareGrant"]);
  assert.deepEqual(Object.keys(sharedRead.body.shareGrant).sort(), ["effectiveStatus", "expiresAt", "id", "permissions"]);
  assert.deepEqual(Object.keys(sharedRead.body.businessCase).sort(), [
    "createdAt", "id", "openedAt", "resolutionNote", "resolvedAt", "status", "summary", "title", "updatedAt",
  ]);
  assert.equal(sharedRead.body.businessCase.id, caseId);
  assert.equal(sharedRead.body.businessCase.status, "OPEN");
  assert.equal(sharedRead.body.businessCase.title, "외부 자문 공유용 케이스");
  assert.equal(sharedRead.body.businessCase.summary, "외부 자문자에게 공유 가능한 최소 사실관계");
  assert.equal(sharedRead.body.shareGrant.id, grantId);
  assert.equal(sharedRead.body.shareGrant.effectiveStatus, "ACTIVE");
  assert.equal(sharedRead.body.shareGrant.permissions.includes("case.read"), true);
  assert.equal("organizationId" in sharedRead.body.businessCase, false);
  assert.equal("createdByUserId" in sharedRead.body.businessCase, false);
  assert.equal("advisorUserId" in sharedRead.body.shareGrant, false);

  const otherActiveRead = await request(`/api/saas/advisor/share-grants/${grantId}/case`, { cookie: other.cookie });
  assert.equal(otherActiveRead.response.status, 404);
  assert.equal(otherActiveRead.body?.error, "external_advisor_shared_case_not_found");

  const ownerExternalRead = await request(`/api/saas/advisor/share-grants/${grantId}/case`, { cookie: owner.cookie });
  assert.equal(ownerExternalRead.response.status, 404, "organization owner must not use the advisor-only external read path");

  const archived = await request(`/api/saas/business-cases/${caseId}/status`, {
    method: "PATCH",
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: { status: "ARCHIVED" },
  });
  assert.equal(archived.response.status, 200);
  assert.equal(archived.body.businessCase.status, "ARCHIVED");

  const archivedRead = await request(`/api/saas/advisor/share-grants/${grantId}/case`, { cookie: advisor.cookie });
  assert.equal(archivedRead.response.status, 404, "archived Case must disappear from external advisor read path even before grant revoke");
  assert.equal(archivedRead.body?.error, "external_advisor_shared_case_not_found");

  const revoked = await request(`/api/saas/advisor-grants/${grantId}/revoke`, {
    method: "POST",
    cookie: owner.cookie,
    csrf: owner.csrf,
  });
  assert.equal(revoked.response.status, 200);
  assert.equal(revoked.body.shareGrant.status, "REVOKED");

  const revokedRead = await request(`/api/saas/advisor/share-grants/${grantId}/case`, { cookie: advisor.cookie });
  assert.equal(revokedRead.response.status, 404);
  assert.equal(revokedRead.body?.error, "external_advisor_shared_case_not_found");

  console.log("Advisor-safe shared Case read API E2E passed: pending/wrong-user/revoked/archived hidden, active case.read allowed, internal identity fields omitted.");
} finally {
  await new Promise((resolve) => server.close(resolve));
  await Promise.allSettled([closeRuntimeStorage(), closeRuntimePostgres()]);
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
