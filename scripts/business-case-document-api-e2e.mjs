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
  SAAS_SESSION_SECRET: "document-api-e2e-session-secret",
  SESSION_SECRET: "document-api-e2e-legacy-secret",
  ADMIN_TOKEN: "document-api-e2e-admin",
  NODE_ENV: "test",
  REQUIRE_PERSISTENT_DB: "0",
  PERSISTENT_STORAGE: "0",
});

const migrationPool = createPostgresPool({ applicationName: "insaya-document-api-migrate" });
await applyPostgresMigrations(migrationPool, { logger: { log() {} } });
await migrationPool.end();

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "insaya-document-api-e2e-"));
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

async function acceptGrant(grantId, actor) {
  const accepted = await request(`/api/saas/advisor/share-grants/${grantId}/accept`, {
    method: "POST",
    cookie: actor.cookie,
    csrf: actor.csrf,
  });
  assert.equal(accepted.response.status, 200, JSON.stringify(accepted.body));
  assert.equal(accepted.body.shareGrant.status, "ACTIVE");
}

const suffix = crypto.randomUUID();
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fixturePool = createPostgresPool({ applicationName: "insaya-document-api-fixtures" });

try {
  const owner = await login(`document-owner-${suffix}@example.com`);
  const hr = await login(`document-hr-${suffix}@example.com`);
  const manager = await login(`document-manager-${suffix}@example.com`);
  const readAdvisor = await login(`document-read-advisor-${suffix}@example.com`);
  const reviewAdvisor = await login(`document-review-advisor-${suffix}@example.com`);
  const outsider = await login(`document-outsider-${suffix}@example.com`);

  const createOrg = await request("/api/saas/organizations", {
    method: "POST",
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: { type: "BUSINESS", displayName: `Document API ${suffix}` },
  });
  assert.equal(createOrg.response.status, 201, JSON.stringify(createOrg.body));
  const orgId = createOrg.body.organization.id;

  const membershipNow = new Date().toISOString();
  await fixturePool.query(
    `INSERT INTO organization_memberships
     (id,organization_id,user_id,role_key,status,scope,joined_at,removed_at,created_at,updated_at)
     VALUES
       ($1,$2,$3,'HR_ADMIN','ACTIVE','{}'::jsonb,$6,NULL,$6,$6),
       ($4,$2,$5,'MANAGER','ACTIVE','{}'::jsonb,$6,NULL,$6,$6)`,
    [`doc-api-hr-${suffix}`, orgId, hr.user.id, `doc-api-manager-${suffix}`, manager.user.id, membershipNow],
  );

  const createCase = await request(`/api/saas/organizations/${orgId}/business-cases`, {
    method: "POST",
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: { title: "문서 검토 Case", summary: "Bundle 33 HTTP E2E" },
  });
  assert.equal(createCase.response.status, 201, JSON.stringify(createCase.body));
  const caseId = createCase.body.businessCase.id;
  const openCase = await request(`/api/saas/business-cases/${caseId}/status`, {
    method: "PATCH",
    cookie: hr.cookie,
    csrf: hr.csrf,
    body: { status: "OPEN" },
  });
  assert.equal(openCase.response.status, 200, JSON.stringify(openCase.body));

  const unauthenticated = await request(`/api/saas/business-cases/${caseId}/documents`);
  assert.equal(unauthenticated.response.status, 401);
  assert.equal(unauthenticated.body.error, "authentication_required");

  const noCsrf = await request(`/api/saas/business-cases/${caseId}/documents`, {
    method: "POST",
    cookie: owner.cookie,
    body: { title: "CSRF", documentKind: "NOTICE" },
  });
  assert.equal(noCsrf.response.status, 403);
  assert.equal(noCsrf.body.error, "csrf_invalid");

  const managerCreate = await request(`/api/saas/business-cases/${caseId}/documents`, {
    method: "POST",
    cookie: manager.cookie,
    csrf: manager.csrf,
    body: { title: "Manager 금지", documentKind: "NOTICE", actorUserId: owner.user.id },
  });
  assert.equal(managerCreate.response.status, 403);
  assert.equal(managerCreate.body.error, "business_case_document_management_role_required");

  const createDocument = await request(`/api/saas/business-cases/${caseId}/documents`, {
    method: "POST",
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: { title: "근로계약서 검토본", documentKind: "EMPLOYMENT_CONTRACT", actorUserId: outsider.user.id },
  });
  assert.equal(createDocument.response.status, 201, JSON.stringify(createDocument.body));
  assert.equal(createDocument.body.document.createdByUserId, owner.user.id, "actor must come from session");
  const documentId = createDocument.body.document.id;

  const rejectStorageKey = await request(`/api/saas/business-case-documents/${documentId}/versions`, {
    method: "POST",
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: {
      fileName: "contract.pdf",
      mimeType: "application/pdf",
      sizeBytes: 100,
      contentSha256: sha(`reject-key-${suffix}`),
      storageObjectKey: "attacker/chosen/key",
    },
  });
  assert.equal(rejectStorageKey.response.status, 400);
  assert.equal(rejectStorageKey.body.error, "business_case_document_binary_payload_forbidden");

  const rejectBase64 = await request(`/api/saas/business-case-documents/${documentId}/versions`, {
    method: "POST",
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: {
      fileName: "contract.pdf",
      mimeType: "application/pdf",
      sizeBytes: 100,
      contentSha256: sha(`reject-base64-${suffix}`),
      base64: "c2Vuc2l0aXZlLWJ5dGVz",
    },
  });
  assert.equal(rejectBase64.response.status, 400);
  assert.equal(rejectBase64.body.error, "business_case_document_binary_payload_forbidden");

  const addVersion = await request(`/api/saas/business-case-documents/${documentId}/versions`, {
    method: "POST",
    cookie: hr.cookie,
    csrf: hr.csrf,
    body: {
      fileName: "employment-contract.pdf",
      mimeType: "application/pdf",
      sizeBytes: 4096,
      contentSha256: sha(`document-v1-${suffix}`),
      actorUserId: outsider.user.id,
    },
  });
  assert.equal(addVersion.response.status, 201, JSON.stringify(addVersion.body));
  assert.equal(addVersion.body.version.createdByUserId, hr.user.id);
  assert.equal(Object.hasOwn(addVersion.body.version, "storageObjectKey"), false);
  assert.equal(JSON.stringify(addVersion.body).includes("business-case-documents/"), false);

  const managerGet = await request(`/api/saas/business-case-documents/${documentId}`, { cookie: manager.cookie });
  assert.equal(managerGet.response.status, 403);
  assert.equal(managerGet.body.error, "business_case_document_management_role_required");

  const businessGet = await request(`/api/saas/business-case-documents/${documentId}`, { cookie: owner.cookie });
  assert.equal(businessGet.response.status, 200, JSON.stringify(businessGet.body));
  assert.equal(businessGet.body.document.id, documentId);
  assert.equal(JSON.stringify(businessGet.body).includes("storageObjectKey"), false);
  assert.equal(JSON.stringify(businessGet.body).includes("business-case-documents/"), false);

  const submitNoCsrf = await request(`/api/saas/business-case-documents/${documentId}/submit-review`, {
    method: "POST",
    cookie: hr.cookie,
  });
  assert.equal(submitNoCsrf.response.status, 403);
  const submit = await request(`/api/saas/business-case-documents/${documentId}/submit-review`, {
    method: "POST",
    cookie: hr.cookie,
    csrf: hr.csrf,
  });
  assert.equal(submit.response.status, 200, JSON.stringify(submit.body));
  assert.equal(submit.body.document.status, "IN_REVIEW");

  const grantExpiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const readGrantResponse = await request(`/api/saas/organizations/${orgId}/business-cases/${caseId}/advisor-grants`, {
    method: "POST",
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: { advisorUserId: readAdvisor.user.id, permissions: ["case.read", "document.read"], expiresAt: grantExpiresAt },
  });
  assert.equal(readGrantResponse.response.status, 201, JSON.stringify(readGrantResponse.body));
  const readGrantId = readGrantResponse.body.shareGrant.id;
  await acceptGrant(readGrantId, readAdvisor);

  const reviewGrantResponse = await request(`/api/saas/organizations/${orgId}/business-cases/${caseId}/advisor-grants`, {
    method: "POST",
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: { advisorUserId: reviewAdvisor.user.id, permissions: ["case.read", "document.read", "document.review"], expiresAt: grantExpiresAt },
  });
  assert.equal(reviewGrantResponse.response.status, 201, JSON.stringify(reviewGrantResponse.body));
  const reviewGrantId = reviewGrantResponse.body.shareGrant.id;
  await acceptGrant(reviewGrantId, reviewAdvisor);

  const outsiderGrantRead = await request(`/api/saas/advisor/share-grants/${readGrantId}/documents`, { cookie: outsider.cookie });
  assert.equal(outsiderGrantRead.response.status, 404);
  assert.equal(outsiderGrantRead.body.error, "business_case_document_advisor_not_found");

  const advisorList = await request(`/api/saas/advisor/share-grants/${readGrantId}/documents`, { cookie: readAdvisor.cookie });
  assert.equal(advisorList.response.status, 200, JSON.stringify(advisorList.body));
  assert.equal(advisorList.body.documents.length, 1);
  assert.equal(advisorList.body.documents[0].id, documentId);

  const advisorGet = await request(`/api/saas/advisor/share-grants/${readGrantId}/documents/${documentId}`, { cookie: readAdvisor.cookie });
  assert.equal(advisorGet.response.status, 200, JSON.stringify(advisorGet.body));
  assert.equal(advisorGet.body.document.id, documentId);
  assert.equal(Object.hasOwn(advisorGet.body.versions[0], "createdByUserId"), false);
  assert.equal(JSON.stringify(advisorGet.body).includes("storageObjectKey"), false);
  assert.equal(JSON.stringify(advisorGet.body).includes("business-case-documents/"), false);

  const readOnlyReview = await request(`/api/saas/advisor/share-grants/${readGrantId}/documents/${documentId}/review`, {
    method: "POST",
    cookie: readAdvisor.cookie,
    csrf: readAdvisor.csrf,
    body: { decision: "APPROVED" },
  });
  assert.equal(readOnlyReview.response.status, 404);
  assert.equal(readOnlyReview.body.error, "business_case_document_advisor_not_found");

  const reviewNoCsrf = await request(`/api/saas/advisor/share-grants/${reviewGrantId}/documents/${documentId}/review`, {
    method: "POST",
    cookie: reviewAdvisor.cookie,
    body: { decision: "CHANGES_REQUESTED", note: "수정 필요" },
  });
  assert.equal(reviewNoCsrf.response.status, 403);
  assert.equal(reviewNoCsrf.body.error, "csrf_invalid");

  const requestChanges = await request(`/api/saas/advisor/share-grants/${reviewGrantId}/documents/${documentId}/review`, {
    method: "POST",
    cookie: reviewAdvisor.cookie,
    csrf: reviewAdvisor.csrf,
    body: { decision: "CHANGES_REQUESTED", note: "근무장소 조항을 확인해 주세요.", actorUserId: owner.user.id },
  });
  assert.equal(requestChanges.response.status, 201, JSON.stringify(requestChanges.body));
  assert.equal(requestChanges.body.review.reviewerUserId, reviewAdvisor.user.id);
  assert.equal(requestChanges.body.review.decision, "CHANGES_REQUESTED");

  const afterChanges = await request(`/api/saas/business-case-documents/${documentId}`, { cookie: owner.cookie });
  assert.equal(afterChanges.response.status, 200);
  assert.equal(afterChanges.body.document.status, "CHANGES_REQUESTED");

  const addVersionTwo = await request(`/api/saas/business-case-documents/${documentId}/versions`, {
    method: "POST",
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: {
      fileName: "employment-contract-v2.pdf",
      mimeType: "application/pdf",
      sizeBytes: 5000,
      contentSha256: sha(`document-v2-${suffix}`),
    },
  });
  assert.equal(addVersionTwo.response.status, 201, JSON.stringify(addVersionTwo.body));
  assert.equal(addVersionTwo.body.version.versionNo, 2);

  const resubmit = await request(`/api/saas/business-case-documents/${documentId}/submit-review`, {
    method: "POST",
    cookie: owner.cookie,
    csrf: owner.csrf,
  });
  assert.equal(resubmit.response.status, 200);
  assert.equal(resubmit.body.document.status, "IN_REVIEW");

  const approve = await request(`/api/saas/advisor/share-grants/${reviewGrantId}/documents/${documentId}/review`, {
    method: "POST",
    cookie: reviewAdvisor.cookie,
    csrf: reviewAdvisor.csrf,
    body: { decision: "APPROVED", note: "검토 완료" },
  });
  assert.equal(approve.response.status, 201, JSON.stringify(approve.body));
  assert.equal(approve.body.review.decision, "APPROVED");

  const finalBusinessGet = await request(`/api/saas/business-case-documents/${documentId}`, { cookie: hr.cookie });
  assert.equal(finalBusinessGet.response.status, 200);
  assert.equal(finalBusinessGet.body.document.status, "APPROVED");
  assert.deepEqual(finalBusinessGet.body.versions.map((item) => item.versionNo), [1, 2]);
  assert.deepEqual(finalBusinessGet.body.reviews.map((item) => item.decision), ["CHANGES_REQUESTED", "APPROVED"]);

  const events = await request(`/api/saas/business-case-documents/${documentId}/events`, { cookie: owner.cookie });
  assert.equal(events.response.status, 200);
  assert.deepEqual(events.body.events.map((item) => item.eventType), [
    "CREATED", "VERSION_ADDED", "SUBMITTED_FOR_REVIEW", "REVIEW_CHANGES_REQUESTED",
    "VERSION_ADDED", "SUBMITTED_FOR_REVIEW", "REVIEW_APPROVED",
  ]);

  const revokeReviewGrant = await request(`/api/saas/advisor-grants/${reviewGrantId}/revoke`, {
    method: "POST",
    cookie: owner.cookie,
    csrf: owner.csrf,
  });
  assert.equal(revokeReviewGrant.response.status, 200, JSON.stringify(revokeReviewGrant.body));
  const afterRevoke = await request(`/api/saas/advisor/share-grants/${reviewGrantId}/documents`, { cookie: reviewAdvisor.cookie });
  assert.equal(afterRevoke.response.status, 404);
  assert.equal(afterRevoke.body.error, "business_case_document_advisor_not_found");

  const storageKeys = await fixturePool.query(
    `SELECT storage_object_key FROM business_case_document_versions WHERE document_id=$1 ORDER BY version_no ASC`,
    [documentId],
  );
  assert.equal(storageKeys.rows.length, 2);
  assert.equal(storageKeys.rows.every((row) => row.storage_object_key.startsWith(`business-case-documents/${orgId}/${caseId}/${documentId}/`)), true);
  assert.equal(storageKeys.rows.some((row) => row.storage_object_key === "attacker/chosen/key"), false);

  console.log("Business Case document HTTP API E2E passed: session identity, CSRF, management RBAC, binary/storage-key rejection, Advisor not-found semantics and two-version review flow are enforced.");
} finally {
  await fixturePool.end();
  await new Promise((resolve) => server.close(resolve));
  await closeRuntimeStorage();
  await closeRuntimePostgres();
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
