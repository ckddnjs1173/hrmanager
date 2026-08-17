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
  SAAS_SESSION_SECRET: "advisor-email-invitation-session-secret",
  SESSION_SECRET: "advisor-email-invitation-legacy-secret",
  ADMIN_TOKEN: "advisor-email-invitation-admin",
  NODE_ENV: "test",
  REQUIRE_PERSISTENT_DB: "0",
  PERSISTENT_STORAGE: "0",
});

const migrationPool = createPostgresPool({ applicationName: "insaya-advisor-email-invitation-migrate" });
await applyPostgresMigrations(migrationPool, { logger: { log() {} } });
await migrationPool.end();

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "insaya-advisor-email-invitation-"));
const { createApplication } = await import("../lib/application.js");
const { closeRuntimeStorage } = await import("../lib/runtime-repo.js");
const { closeRuntimePostgres } = await import("../lib/runtime-postgres.js");
const { app } = createApplication({ rootDir: tempRoot, env: process.env, warn: () => {} });
const server = app.listen(0, "127.0.0.1");
await once(server, "listening");
const base = `http://127.0.0.1:${server.address().port}`;
const pool = createPostgresPool({ applicationName: "insaya-advisor-email-invitation-e2e" });

async function request(pathname, { method = "GET", body, cookie = "", csrf = "" } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  if (csrf) headers["x-csrf-token"] = csrf;
  const response = await fetch(`${base}${pathname}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { response, body: parsed };
}
const cookieFrom = (response) => (response.headers.get("set-cookie") || "").split(";")[0];
async function login(email) {
  const magic = await request("/api/saas/auth/magic-link", { method: "POST", body: { email } });
  assert.equal(magic.response.status, 202);
  const verify = await request("/api/saas/auth/magic-link/verify", { method: "POST", body: { token: magic.body.debugToken } });
  assert.equal(verify.response.status, 200);
  return { cookie: cookieFrom(verify.response), csrf: verify.body.csrf, user: verify.body.user };
}

const suffix = crypto.randomUUID();
const advisorEmail = `new-advisor-${suffix}@example.com`;
try {
  const owner = await login(`owner-invite-${suffix}@example.com`);
  const wrong = await login(`wrong-invite-${suffix}@example.com`);

  const org = await request("/api/saas/organizations", {
    method: "POST", cookie: owner.cookie, csrf: owner.csrf,
    body: { type: "BUSINESS", displayName: `Advisor Invite ${suffix}` },
  });
  assert.equal(org.response.status, 201);
  const organizationId = org.body.organization.id;

  const createdCase = await request(`/api/saas/organizations/${organizationId}/business-cases`, {
    method: "POST", cookie: owner.cookie, csrf: owner.csrf,
    body: { title: "이메일 초대 테스트 케이스", summary: "계정이 없어도 먼저 초대" },
  });
  assert.equal(createdCase.response.status, 201);
  const caseId = createdCase.body.businessCase.id;
  const opened = await request(`/api/saas/business-cases/${caseId}/status`, {
    method: "PATCH", cookie: owner.cookie, csrf: owner.csrf, body: { status: "OPEN" },
  });
  assert.equal(opened.response.status, 200);

  const beforeUser = await pool.query("SELECT COUNT(*)::integer AS count FROM users WHERE email_normalized=$1", [advisorEmail]);
  assert.equal(beforeUser.rows[0].count, 0, "advisor account must not be required at invitation issue time");

  const grantExpiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
  const invitation = await request(`/api/saas/organizations/${organizationId}/business-cases/${caseId}/advisor-invitations`, {
    method: "POST", cookie: owner.cookie, csrf: owner.csrf,
    body: { advisorEmail, permissions: ["case.read", "comment.create"], grantExpiresAt },
  });
  assert.equal(invitation.response.status, 201, JSON.stringify(invitation.body));
  assert.equal(invitation.body.deliveryMode, "MANUAL_LINK");
  assert.ok(invitation.body.invitationToken);
  assert.match(invitation.body.invitationFragmentPath, /^\/advisor\.html#invite=/);
  assert.equal(invitation.body.invitation.advisorEmail, advisorEmail);
  assert.equal(invitation.body.invitation.status, "PENDING");
  const invitationId = invitation.body.invitation.id;
  const token = invitation.body.invitationToken;

  const stored = await pool.query("SELECT token_hash,status FROM external_advisor_invitations WHERE id=$1", [invitationId]);
  assert.equal(stored.rows[0].status, "PENDING");
  assert.notEqual(stored.rows[0].token_hash, token, "raw invitation token must never be stored");

  const list = await request(`/api/saas/organizations/${organizationId}/advisor-invitations`, { cookie: owner.cookie });
  assert.equal(list.response.status, 200);
  assert.equal(list.body.invitations.some((item) => item.id === invitationId && item.advisorEmail === advisorEmail), true);
  assert.equal(JSON.stringify(list.body).includes(token), false, "list endpoint must never re-expose raw token");

  const wrongPreview = await request("/api/saas/advisor/invitations/preview", {
    method: "POST", cookie: wrong.cookie, csrf: wrong.csrf, body: { token },
  });
  assert.equal(wrongPreview.response.status, 404);
  assert.equal(wrongPreview.body.error, "external_advisor_invitation_not_found");
  const wrongAccept = await request("/api/saas/advisor/invitations/accept", {
    method: "POST", cookie: wrong.cookie, csrf: wrong.csrf, body: { token },
  });
  assert.equal(wrongAccept.response.status, 404);

  const advisor = await login(advisorEmail);
  const afterUser = await pool.query("SELECT id FROM users WHERE email_normalized=$1", [advisorEmail]);
  assert.equal(afterUser.rowCount, 1);
  assert.equal(afterUser.rows[0].id, advisor.user.id);

  const noCsrfPreview = await request("/api/saas/advisor/invitations/preview", {
    method: "POST", cookie: advisor.cookie, body: { token },
  });
  assert.equal(noCsrfPreview.response.status, 403);
  assert.equal(noCsrfPreview.body.error, "csrf_invalid");

  const preview = await request("/api/saas/advisor/invitations/preview", {
    method: "POST", cookie: advisor.cookie, csrf: advisor.csrf, body: { token },
  });
  assert.equal(preview.response.status, 200, JSON.stringify(preview.body));
  assert.equal(preview.body.businessCase.id, caseId);
  assert.equal(preview.body.businessCase.title, "이메일 초대 테스트 케이스");
  assert.equal(preview.body.organization.displayName, `Advisor Invite ${suffix}`);
  assert.equal("organizationId" in preview.body.organization, false);
  assert.equal("advisorEmail" in preview.body.invitation, false);

  const accepted = await request("/api/saas/advisor/invitations/accept", {
    method: "POST", cookie: advisor.cookie, csrf: advisor.csrf, body: { token },
  });
  assert.equal(accepted.response.status, 200, JSON.stringify(accepted.body));
  assert.equal(accepted.body.invitation.status, "ACCEPTED");
  assert.equal(accepted.body.shareGrant.status, "ACTIVE");
  assert.equal(accepted.body.shareGrant.advisorUserId, advisor.user.id);
  const grantId = accepted.body.shareGrant.id;

  const repeat = await request("/api/saas/advisor/invitations/accept", {
    method: "POST", cookie: advisor.cookie, csrf: advisor.csrf, body: { token },
  });
  assert.equal(repeat.response.status, 404, "accepted invitation token must no longer be usable");

  const sharedCase = await request(`/api/saas/advisor/share-grants/${grantId}/case`, { cookie: advisor.cookie });
  assert.equal(sharedCase.response.status, 200);
  assert.equal(sharedCase.body.businessCase.id, caseId);

  const advisorMembership = await pool.query(
    "SELECT COUNT(*)::integer AS count FROM organization_memberships WHERE organization_id=$1 AND user_id=$2 AND status='ACTIVE'",
    [organizationId, advisor.user.id],
  );
  assert.equal(advisorMembership.rows[0].count, 0, "email invitation acceptance must not create organization Membership");

  const acceptedRow = await pool.query(
    "SELECT status,accepted_by_user_id,share_grant_id FROM external_advisor_invitations WHERE id=$1",
    [invitationId],
  );
  assert.equal(acceptedRow.rows[0].status, "ACCEPTED");
  assert.equal(acceptedRow.rows[0].accepted_by_user_id, advisor.user.id);
  assert.equal(acceptedRow.rows[0].share_grant_id, grantId);
  const invitationEvents = await pool.query(
    "SELECT event_type FROM external_advisor_invitation_events WHERE invitation_id=$1 ORDER BY created_at ASC,id ASC",
    [invitationId],
  );
  assert.deepEqual(invitationEvents.rows.map((row) => row.event_type), ["CREATED", "ACCEPTED"]);

  console.log("External Advisor email invitation E2E passed: issue before account exists, exact-email authenticated preview/accept, atomic active ShareGrant, no Membership, raw token stored only as hash.");
} finally {
  await new Promise((resolve) => server.close(resolve));
  await Promise.allSettled([closeRuntimeStorage(), closeRuntimePostgres()]);
  await pool.end();
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
