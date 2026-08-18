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
  DOCUMENT_STORAGE_SECRET: "document-api-e2e-storage-secret-0123456789-abcdef",
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

async function upload(pathname, { bytes, mimeType, cookie = "", csrf = "" } = {}) {
  const headers = { "content-type": mimeType };
  if (cookie) headers.cookie = cookie;
  if (csrf) headers["x-csrf-token"] = csrf;
  const response = await fetch(`${base}${pathname}`, { method: "POST", headers, body: bytes });
  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { response, body: parsed };
}

async function download(pathname, { cookie = "" } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${base}${pathname}`, { headers });
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || contentType.includes("application/json")) {
    const text = await response.text();
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
    return { response, body: parsed, bytes: null };
  }
  return { response, body: null, bytes: Buffer.from(await response.arrayBuffer()) };
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
const fixturePool = createPostgresPool({ applicationName: "insaya-document-api-fixtures" });
const v1Bytes = Buffer.from(`%PDF-1.7\n% Insaya encrypted document v1 ${suffix}\n1 0 obj\n<<>>\nendobj\n%%EOF`, "utf8");
const v2Bytes = Buffer.from(`%PDF-1.7\n% Insaya encrypted document v2 ${suffix}\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF`, "utf8");

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
    method: "POST", cookie: owner.cookie, csrf: owner.csrf,
    body: { title: "문서 검토 Case", summary: "Encrypted binary HTTP E2E" },
  });
  assert.equal(createCase.response.status, 201, JSON.stringify(createCase.body));
  const caseId = createCase.body.businessCase.id;
  const openCase = await request(`/api/saas/business-cases/${caseId}/status`, {
    method: "PATCH", cookie: hr.cookie, csrf: hr.csrf, body: { status: "OPEN" },
  });
  assert.equal(openCase.response.status, 200, JSON.stringify(openCase.body));

  const createDocument = await request(`/api/saas/business-cases/${caseId}/documents`, {
    method: "POST", cookie: owner.cookie, csrf: owner.csrf,
    body: { title: "근로계약서 검토본", documentKind: "EMPLOYMENT_CONTRACT", actorUserId: outsider.user.id },
  });
  assert.equal(createDocument.response.status, 201, JSON.stringify(createDocument.body));
  assert.equal(createDocument.body.document.createdByUserId, owner.user.id);
  const documentId = createDocument.body.document.id;

  const rejectStorageKey = await request(`/api/saas/business-case-documents/${documentId}/versions`, {
    method: "POST", cookie: owner.cookie, csrf: owner.csrf,
    body: { fileName: "contract.pdf", mimeType: "application/pdf", sizeBytes: 100, contentSha256: "a".repeat(64), storageObjectKey: "attacker/chosen/key" },
  });
  assert.equal(rejectStorageKey.response.status, 400);
  assert.equal(rejectStorageKey.body.error, "business_case_document_binary_payload_forbidden");

  const rejectBase64 = await request(`/api/saas/business-case-documents/${documentId}/versions`, {
    method: "POST", cookie: owner.cookie, csrf: owner.csrf,
    body: { fileName: "contract.pdf", mimeType: "application/pdf", sizeBytes: 100, contentSha256: "b".repeat(64), base64: "c2Vuc2l0aXZl" },
  });
  assert.equal(rejectBase64.response.status, 400);
  assert.equal(rejectBase64.body.error, "business_case_document_binary_payload_forbidden");

  const noCsrfUpload = await upload(`/api/saas/business-case-documents/${documentId}/content?fileName=employment-contract.pdf`, {
    bytes: v1Bytes, mimeType: "application/pdf", cookie: owner.cookie,
  });
  assert.equal(noCsrfUpload.response.status, 403);
  assert.equal(noCsrfUpload.body.error, "csrf_invalid");

  const managerUpload = await upload(`/api/saas/business-case-documents/${documentId}/content?fileName=employment-contract.pdf`, {
    bytes: v1Bytes, mimeType: "application/pdf", cookie: manager.cookie, csrf: manager.csrf,
  });
  assert.equal(managerUpload.response.status, 403);
  assert.equal(managerUpload.body.error, "business_case_document_management_role_required");

  const disguisedExecutable = await upload(`/api/saas/business-case-documents/${documentId}/content?fileName=disguised.pdf`, {
    bytes: Buffer.from("MZ-not-a-pdf", "utf8"), mimeType: "application/pdf", cookie: owner.cookie, csrf: owner.csrf,
  });
  assert.equal(disguisedExecutable.response.status, 400);
  assert.equal(disguisedExecutable.body.error, "business_case_document_content_signature_invalid");

  const uploadV1 = await upload(`/api/saas/business-case-documents/${documentId}/content?fileName=${encodeURIComponent("근로계약서-v1.pdf")}`, {
    bytes: v1Bytes, mimeType: "application/pdf", cookie: hr.cookie, csrf: hr.csrf,
  });
  assert.equal(uploadV1.response.status, 201, JSON.stringify(uploadV1.body));
  assert.equal(uploadV1.body.version.versionNo, 1);
  assert.equal(uploadV1.body.version.createdByUserId, hr.user.id);
  assert.equal(uploadV1.body.version.contentStored, true);
  assert.equal(uploadV1.body.version.contentSafety, "SIGNATURE_VERIFIED");
  assert.equal(JSON.stringify(uploadV1.body).includes("storageObjectKey"), false);
  const versionOneId = uploadV1.body.version.id;

  const businessDownloadV1 = await download(`/api/saas/business-case-document-versions/${versionOneId}/download`, { cookie: owner.cookie });
  assert.equal(businessDownloadV1.response.status, 200);
  assert.deepEqual(businessDownloadV1.bytes, v1Bytes);
  assert.match(businessDownloadV1.response.headers.get("content-disposition") || "", /^attachment;/);
  assert.match(businessDownloadV1.response.headers.get("cache-control") || "", /no-store/);
  assert.equal(businessDownloadV1.response.headers.get("x-content-type-options"), "nosniff");

  const submit = await request(`/api/saas/business-case-documents/${documentId}/submit-review`, {
    method: "POST", cookie: hr.cookie, csrf: hr.csrf,
  });
  assert.equal(submit.response.status, 200, JSON.stringify(submit.body));
  assert.equal(submit.body.document.status, "IN_REVIEW");

  const metadataOnlyDocument = await request(`/api/saas/business-cases/${caseId}/documents`, {
    method: "POST", cookie: owner.cookie, csrf: owner.csrf,
    body: { title: "메타데이터 전용 차단 확인", documentKind: "NOTICE" },
  });
  const metadataOnlyId = metadataOnlyDocument.body.document.id;
  const metadataOnlyVersion = await request(`/api/saas/business-case-documents/${metadataOnlyId}/versions`, {
    method: "POST", cookie: owner.cookie, csrf: owner.csrf,
    body: { fileName: "notice.pdf", mimeType: "application/pdf", sizeBytes: 12, contentSha256: crypto.createHash("sha256").update("metadata-only").digest("hex") },
  });
  assert.equal(metadataOnlyVersion.response.status, 201);
  const metadataSubmit = await request(`/api/saas/business-case-documents/${metadataOnlyId}/submit-review`, {
    method: "POST", cookie: owner.cookie, csrf: owner.csrf,
  });
  assert.equal(metadataSubmit.response.status, 409);
  assert.equal(metadataSubmit.body.error, "business_case_document_content_required");

  const grantExpiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const readGrantResponse = await request(`/api/saas/organizations/${orgId}/business-cases/${caseId}/advisor-grants`, {
    method: "POST", cookie: owner.cookie, csrf: owner.csrf,
    body: { advisorUserId: readAdvisor.user.id, permissions: ["case.read", "document.read"], expiresAt: grantExpiresAt },
  });
  assert.equal(readGrantResponse.response.status, 201, JSON.stringify(readGrantResponse.body));
  const readGrantId = readGrantResponse.body.shareGrant.id;
  await acceptGrant(readGrantId, readAdvisor);

  const reviewGrantResponse = await request(`/api/saas/organizations/${orgId}/business-cases/${caseId}/advisor-grants`, {
    method: "POST", cookie: owner.cookie, csrf: owner.csrf,
    body: { advisorUserId: reviewAdvisor.user.id, permissions: ["case.read", "document.read", "document.review"], expiresAt: grantExpiresAt },
  });
  assert.equal(reviewGrantResponse.response.status, 201, JSON.stringify(reviewGrantResponse.body));
  const reviewGrantId = reviewGrantResponse.body.shareGrant.id;
  await acceptGrant(reviewGrantId, reviewAdvisor);

  const outsiderDownload = await download(`/api/saas/advisor/share-grants/${readGrantId}/document-versions/${versionOneId}/download`, { cookie: outsider.cookie });
  assert.equal(outsiderDownload.response.status, 404);
  assert.equal(outsiderDownload.body.error, "business_case_document_advisor_not_found");

  const advisorDownloadV1 = await download(`/api/saas/advisor/share-grants/${readGrantId}/document-versions/${versionOneId}/download`, { cookie: readAdvisor.cookie });
  assert.equal(advisorDownloadV1.response.status, 200);
  assert.deepEqual(advisorDownloadV1.bytes, v1Bytes);

  const requestChanges = await request(`/api/saas/advisor/share-grants/${reviewGrantId}/documents/${documentId}/review`, {
    method: "POST", cookie: reviewAdvisor.cookie, csrf: reviewAdvisor.csrf,
    body: { decision: "CHANGES_REQUESTED", note: "근무장소 조항을 확인해 주세요.", actorUserId: owner.user.id },
  });
  assert.equal(requestChanges.response.status, 201, JSON.stringify(requestChanges.body));
  assert.equal(requestChanges.body.review.reviewerUserId, reviewAdvisor.user.id);

  const uploadV2 = await upload(`/api/saas/business-case-documents/${documentId}/content?fileName=employment-contract-v2.pdf`, {
    bytes: v2Bytes, mimeType: "application/pdf", cookie: owner.cookie, csrf: owner.csrf,
  });
  assert.equal(uploadV2.response.status, 201, JSON.stringify(uploadV2.body));
  assert.equal(uploadV2.body.version.versionNo, 2);
  const versionTwoId = uploadV2.body.version.id;

  const resubmit = await request(`/api/saas/business-case-documents/${documentId}/submit-review`, {
    method: "POST", cookie: owner.cookie, csrf: owner.csrf,
  });
  assert.equal(resubmit.response.status, 200, JSON.stringify(resubmit.body));
  assert.equal(resubmit.body.document.status, "IN_REVIEW");

  const approve = await request(`/api/saas/advisor/share-grants/${reviewGrantId}/documents/${documentId}/review`, {
    method: "POST", cookie: reviewAdvisor.cookie, csrf: reviewAdvisor.csrf,
    body: { decision: "APPROVED", note: "검토 완료" },
  });
  assert.equal(approve.response.status, 201, JSON.stringify(approve.body));
  assert.equal(approve.body.review.decision, "APPROVED");

  const reviewDownloadV2 = await download(`/api/saas/advisor/share-grants/${reviewGrantId}/document-versions/${versionTwoId}/download`, { cookie: reviewAdvisor.cookie });
  assert.equal(reviewDownloadV2.response.status, 200);
  assert.deepEqual(reviewDownloadV2.bytes, v2Bytes);

  const accessEvents = await request(`/api/saas/business-case-documents/${documentId}/access-events`, { cookie: owner.cookie });
  assert.equal(accessEvents.response.status, 200, JSON.stringify(accessEvents.body));
  assert.equal(accessEvents.body.accessEvents.some((item) => item.actorType === "BUSINESS" && item.versionId === versionOneId), true);
  assert.equal(accessEvents.body.accessEvents.some((item) => item.actorType === "ADVISOR" && item.shareGrantId === readGrantId), true);
  assert.equal(accessEvents.body.accessEvents.some((item) => item.actorType === "ADVISOR" && item.shareGrantId === reviewGrantId), true);

  const blob = await fixturePool.query(
    `SELECT b.ciphertext,b.iv,b.auth_tag,b.plaintext_sha256,b.plaintext_size_bytes,b.signature_status,b.signature_engine,v.storage_object_key
     FROM business_case_document_blobs b JOIN business_case_document_versions v ON v.id=b.version_id
     WHERE b.version_id=$1`,
    [versionOneId],
  );
  assert.equal(blob.rowCount, 1);
  assert.notDeepEqual(blob.rows[0].ciphertext, v1Bytes, "plaintext must not be stored in ciphertext column");
  assert.equal(blob.rows[0].plaintext_sha256, crypto.createHash("sha256").update(v1Bytes).digest("hex"));
  assert.equal(Number(blob.rows[0].plaintext_size_bytes), v1Bytes.length);
  assert.equal(blob.rows[0].signature_status, "VERIFIED");
  assert.equal(blob.rows[0].signature_engine, "BUILTIN_SIGNATURE_V1");
  assert.equal(blob.rows[0].iv.length, 12);
  assert.equal(blob.rows[0].auth_tag.length, 16);
  assert.equal(blob.rows[0].storage_object_key.startsWith(`business-case-documents/${orgId}/${caseId}/${documentId}/`), true);

  const revokeReviewGrant = await request(`/api/saas/advisor-grants/${reviewGrantId}/revoke`, {
    method: "POST", cookie: owner.cookie, csrf: owner.csrf,
  });
  assert.equal(revokeReviewGrant.response.status, 200, JSON.stringify(revokeReviewGrant.body));
  const afterRevokeDownload = await download(`/api/saas/advisor/share-grants/${reviewGrantId}/document-versions/${versionTwoId}/download`, { cookie: reviewAdvisor.cookie });
  assert.equal(afterRevokeDownload.response.status, 404);
  assert.equal(afterRevokeDownload.body.error, "business_case_document_advisor_not_found");

  const finalBusinessGet = await request(`/api/saas/business-case-documents/${documentId}`, { cookie: hr.cookie });
  assert.equal(finalBusinessGet.response.status, 200);
  assert.equal(finalBusinessGet.body.document.status, "APPROVED");
  assert.deepEqual(finalBusinessGet.body.versions.map((item) => item.versionNo), [1, 2]);
  assert.deepEqual(finalBusinessGet.body.reviews.map((item) => item.decision), ["CHANGES_REQUESTED", "APPROVED"]);
  assert.equal(JSON.stringify(finalBusinessGet.body).includes("storageObjectKey"), false);
  assert.equal(JSON.stringify(finalBusinessGet.body).includes(process.env.DOCUMENT_STORAGE_SECRET), false);

  console.log("Business Case document binary HTTP E2E passed: encrypted storage, server-side signature/hash verification, stored-content review gate, guarded downloads, access audit and immediate ShareGrant revocation are enforced.");
} finally {
  await fixturePool.end();
  await new Promise((resolve) => server.close(resolve));
  await closeRuntimeStorage();
  await closeRuntimePostgres();
  fs.rmSync(tempRoot, { recursive: true, force: true });
}