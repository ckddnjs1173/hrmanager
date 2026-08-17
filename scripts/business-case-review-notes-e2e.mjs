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
  SAAS_SESSION_SECRET: "review-notes-e2e-session-secret",
  SESSION_SECRET: "review-notes-e2e-legacy-secret",
  ADMIN_TOKEN: "review-notes-e2e-admin",
  NODE_ENV: "test",
  REQUIRE_PERSISTENT_DB: "0",
  PERSISTENT_STORAGE: "0",
});

const migrationPool = createPostgresPool({ applicationName: "insaya-review-notes-migrate" });
await applyPostgresMigrations(migrationPool, { logger: { log() {} } });
await migrationPool.end();

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "insaya-review-notes-e2e-"));
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
  assert.equal(requested.response.status, 202, `magic-link request failed: ${JSON.stringify(requested.body)}`);
  const verified = await request("/api/saas/auth/magic-link/verify", {
    method: "POST",
    body: { token: requested.body.debugToken },
  });
  assert.equal(verified.response.status, 200, `magic-link verify failed: ${JSON.stringify(verified.body)}`);
  return { cookie: cookieFrom(verified.response), csrf: verified.body.csrf, user: verified.body.user };
}

async function createAndOpenCase(owner, organizationId, title) {
  const created = await request(`/api/saas/organizations/${organizationId}/business-cases`, {
    method: "POST",
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: { title, summary: "Bundle 30 review-note E2E" },
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
  const caseId = created.body.businessCase.id;
  const opened = await request(`/api/saas/business-cases/${caseId}/status`, {
    method: "PATCH",
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: { status: "OPEN" },
  });
  assert.equal(opened.response.status, 200, JSON.stringify(opened.body));
  return caseId;
}

async function issueAndAcceptGrant({ owner, advisor, organizationId, caseId, permissions }) {
  const issued = await request(`/api/saas/organizations/${organizationId}/business-cases/${caseId}/advisor-grants`, {
    method: "POST",
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: {
      advisorUserId: advisor.user.id,
      permissions,
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    },
  });
  assert.equal(issued.response.status, 201, JSON.stringify(issued.body));
  const grantId = issued.body.shareGrant.id;
  const accepted = await request(`/api/saas/advisor/share-grants/${grantId}/accept`, {
    method: "POST",
    cookie: advisor.cookie,
    csrf: advisor.csrf,
  });
  assert.equal(accepted.response.status, 200, JSON.stringify(accepted.body));
  return grantId;
}

const suffix = crypto.randomUUID();
const fixturePool = createPostgresPool({ applicationName: "insaya-review-notes-fixtures" });

try {
  const owner = await login(`review-owner-${suffix}@example.com`);
  const manager = await login(`review-manager-${suffix}@example.com`);
  const advisor = await login(`review-advisor-${suffix}@example.com`);
  const outsider = await login(`review-outsider-${suffix}@example.com`);

  const orgCreated = await request("/api/saas/organizations", {
    method: "POST",
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: { type: "BUSINESS", displayName: `Review Notes ${suffix}` },
  });
  assert.equal(orgCreated.response.status, 201, JSON.stringify(orgCreated.body));
  const organizationId = orgCreated.body.organization.id;

  const membershipNow = new Date().toISOString();
  await fixturePool.query(
    `INSERT INTO organization_memberships
     (id,organization_id,user_id,role_key,status,scope,joined_at,removed_at,created_at,updated_at)
     VALUES ($1,$2,$3,'MANAGER','ACTIVE','{}'::jsonb,$4,NULL,$4,$4)`,
    [`mem-review-manager-${suffix}`, organizationId, manager.user.id, membershipNow],
  );

  const caseId = await createAndOpenCase(owner, organizationId, "외부 노무자문 코멘트 Case");

  const managerList = await request(`/api/saas/organizations/${organizationId}/business-cases/${caseId}/review-notes`, {
    cookie: manager.cookie,
  });
  assert.equal(managerList.response.status, 403);
  assert.equal(managerList.body?.error, "external_advisor_management_role_required");

  const readOnlyCaseId = await createAndOpenCase(owner, organizationId, "읽기 전용 Case");
  const readOnlyGrantId = await issueAndAcceptGrant({
    owner,
    advisor: outsider,
    organizationId,
    caseId: readOnlyCaseId,
    permissions: ["case.read"],
  });
  const commentWithoutPermission = await request(`/api/saas/advisor/share-grants/${readOnlyGrantId}/review-notes`, {
    method: "POST",
    cookie: outsider.cookie,
    csrf: outsider.csrf,
    body: { body: "권한 없이 작성 시도" },
  });
  assert.equal(commentWithoutPermission.response.status, 404);
  assert.equal(commentWithoutPermission.body?.error, "external_advisor_review_notes_not_found");

  const grantId = await issueAndAcceptGrant({
    owner,
    advisor,
    organizationId,
    caseId,
    permissions: ["case.read", "comment.create"],
  });

  const initialAdvisorList = await request(`/api/saas/advisor/share-grants/${grantId}/review-notes`, {
    cookie: advisor.cookie,
  });
  assert.equal(initialAdvisorList.response.status, 200, JSON.stringify(initialAdvisorList.body));
  assert.deepEqual(initialAdvisorList.body.reviewNotes, []);

  const noCsrf = await request(`/api/saas/advisor/share-grants/${grantId}/review-notes`, {
    method: "POST",
    cookie: advisor.cookie,
    body: { body: "CSRF 없이 작성" },
  });
  assert.equal(noCsrf.response.status, 403);
  assert.equal(noCsrf.body?.error, "csrf_invalid");

  const blankBody = await request(`/api/saas/advisor/share-grants/${grantId}/review-notes`, {
    method: "POST",
    cookie: advisor.cookie,
    csrf: advisor.csrf,
    body: { body: "   " },
  });
  assert.equal(blankBody.response.status, 400);
  assert.equal(blankBody.body?.error, "business_case_review_note_body_required");

  const advisorCreated = await request(`/api/saas/advisor/share-grants/${grantId}/review-notes`, {
    method: "POST",
    cookie: advisor.cookie,
    csrf: advisor.csrf,
    body: { body: "외부 노무전문가 검토 의견입니다." },
  });
  assert.equal(advisorCreated.response.status, 201, JSON.stringify(advisorCreated.body));
  assert.equal(advisorCreated.body.reviewNote.authorType, "ADVISOR");
  assert.equal(advisorCreated.body.reviewNote.body, "외부 노무전문가 검토 의견입니다.");
  assert.equal("authorUserId" in advisorCreated.body.reviewNote, false);
  assert.equal("organizationId" in advisorCreated.body.reviewNote, false);
  assert.equal("shareGrantId" in advisorCreated.body.reviewNote, false);
  assert.equal("metadata" in advisorCreated.body.reviewNote, false);

  const outsiderRead = await request(`/api/saas/advisor/share-grants/${grantId}/review-notes`, {
    cookie: outsider.cookie,
  });
  assert.equal(outsiderRead.response.status, 404);
  assert.equal(outsiderRead.body?.error, "external_advisor_review_notes_not_found");

  const ownerList = await request(`/api/saas/organizations/${organizationId}/business-cases/${caseId}/review-notes`, {
    cookie: owner.cookie,
  });
  assert.equal(ownerList.response.status, 200, JSON.stringify(ownerList.body));
  assert.equal(ownerList.body.reviewNotes.length, 1);
  assert.equal(ownerList.body.reviewNotes[0].authorType, "ADVISOR");
  assert.equal("authorUserId" in ownerList.body.reviewNotes[0], false);

  const businessNoCsrf = await request(`/api/saas/organizations/${organizationId}/business-cases/${caseId}/review-notes`, {
    method: "POST",
    cookie: owner.cookie,
    body: { body: "회사 측 회신" },
  });
  assert.equal(businessNoCsrf.response.status, 403);
  assert.equal(businessNoCsrf.body?.error, "csrf_invalid");

  const businessCreated = await request(`/api/saas/organizations/${organizationId}/business-cases/${caseId}/review-notes`, {
    method: "POST",
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: { body: "회사 측 확인 및 회신입니다." },
  });
  assert.equal(businessCreated.response.status, 201, JSON.stringify(businessCreated.body));
  assert.equal(businessCreated.body.reviewNote.authorType, "BUSINESS");

  const advisorList = await request(`/api/saas/advisor/share-grants/${grantId}/review-notes`, {
    cookie: advisor.cookie,
  });
  assert.equal(advisorList.response.status, 200, JSON.stringify(advisorList.body));
  assert.deepEqual(advisorList.body.reviewNotes.map((note) => note.authorType), ["ADVISOR", "BUSINESS"]);
  assert.equal(advisorList.body.reviewNotes.every((note) => !("authorUserId" in note) && !("organizationId" in note) && !("shareGrantId" in note)), true);

  const dbNotes = await fixturePool.query(
    `SELECT author_type,author_user_id,share_grant_id,body
     FROM business_case_review_notes
     WHERE organization_id=$1 AND business_case_id=$2
     ORDER BY created_at ASC,id ASC`,
    [organizationId, caseId],
  );
  assert.equal(dbNotes.rowCount, 2);
  assert.deepEqual(dbNotes.rows.map((row) => row.author_type), ["ADVISOR", "BUSINESS"]);
  assert.equal(dbNotes.rows[0].author_user_id, advisor.user.id);
  assert.equal(dbNotes.rows[0].share_grant_id, grantId);
  assert.equal(dbNotes.rows[1].author_user_id, owner.user.id);
  assert.equal(dbNotes.rows[1].share_grant_id, null);

  const archived = await request(`/api/saas/business-cases/${caseId}/status`, {
    method: "PATCH",
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: { status: "ARCHIVED" },
  });
  assert.equal(archived.response.status, 200, JSON.stringify(archived.body));

  const advisorAfterArchive = await request(`/api/saas/advisor/share-grants/${grantId}/review-notes`, {
    cookie: advisor.cookie,
  });
  assert.equal(advisorAfterArchive.response.status, 404);
  assert.equal(advisorAfterArchive.body?.error, "external_advisor_review_notes_not_found");

  const businessAfterArchive = await request(`/api/saas/organizations/${organizationId}/business-cases/${caseId}/review-notes`, {
    cookie: owner.cookie,
  });
  assert.equal(businessAfterArchive.response.status, 200);
  assert.equal(businessAfterArchive.body.reviewNotes.length, 2, "Business audit view must retain append-only notes after archive");

  const revoke = await request(`/api/saas/advisor-grants/${grantId}/revoke`, {
    method: "POST",
    cookie: owner.cookie,
    csrf: owner.csrf,
  });
  assert.equal(revoke.response.status, 200, JSON.stringify(revoke.body));

  const advisorAfterRevoke = await request(`/api/saas/advisor/share-grants/${grantId}/review-notes`, {
    method: "POST",
    cookie: advisor.cookie,
    csrf: advisor.csrf,
    body: { body: "철회 후 작성 시도" },
  });
  assert.equal(advisorAfterRevoke.response.status, 404);
  assert.equal(advisorAfterRevoke.body?.error, "external_advisor_review_notes_not_found");

  const advisorMembership = await fixturePool.query(
    `SELECT COUNT(*)::integer AS count FROM organization_memberships
     WHERE organization_id=$1 AND user_id=$2 AND status='ACTIVE'`,
    [organizationId, advisor.user.id],
  );
  assert.equal(advisorMembership.rows[0].count, 0, "review-note collaboration must never create advisor Membership");

  console.log("Business Case review notes E2E passed: append-only notes, safe projection, CSRF, comment.create permission, identity isolation, archive/revoke cut-off and no advisor Membership.");
} finally {
  await new Promise((resolve) => server.close(resolve));
  await Promise.allSettled([closeRuntimeStorage(), closeRuntimePostgres()]);
  await fixturePool.end();
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
