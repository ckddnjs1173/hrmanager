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
  SAAS_SESSION_SECRET: "document-review-e2e-session-secret",
  SESSION_SECRET: "document-review-e2e-legacy-secret",
  ADMIN_TOKEN: "document-review-e2e-admin",
  NODE_ENV: "test",
  REQUIRE_PERSISTENT_DB: "0",
  PERSISTENT_STORAGE: "0",
});

const migrationPool = createPostgresPool({ applicationName: "insaya-document-review-migrate" });
await applyPostgresMigrations(migrationPool, { logger: { log() {} } });
await migrationPool.end();

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "insaya-document-review-e2e-"));
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
    body: { title, summary: "Bundle 31 document review E2E" },
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
const fixturePool = createPostgresPool({ applicationName: "insaya-document-review-fixtures" });

try {
  const owner = await login(`doc-owner-${suffix}@example.com`);
  const manager = await login(`doc-manager-${suffix}@example.com`);
  const advisor = await login(`doc-advisor-${suffix}@example.com`);
  const readOnlyAdvisor = await login(`doc-readonly-${suffix}@example.com`);
  const outsider = await login(`doc-outsider-${suffix}@example.com`);

  const orgCreated = await request("/api/saas/organizations", {
    method: "POST",
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: { type: "BUSINESS", displayName: `Document Review ${suffix}` },
  });
  assert.equal(orgCreated.response.status, 201, JSON.stringify(orgCreated.body));
  const organizationId = orgCreated.body.organization.id;

  const membershipNow = new Date().toISOString();
  await fixturePool.query(
    `INSERT INTO organization_memberships
     (id,organization_id,user_id,role_key,status,scope,joined_at,removed_at,created_at,updated_at)
     VALUES ($1,$2,$3,'MANAGER','ACTIVE','{}'::jsonb,$4,NULL,$4,$4)`,
    [`mem-doc-manager-${suffix}`, organizationId, manager.user.id, membershipNow],
  );

  const caseA = await createAndOpenCase(owner, organizationId, "취업규칙 개정 검토");
  const caseB = await createAndOpenCase(owner, organizationId, "근로계약서 별도 검토");

  const managerCreate = await request(`/api/saas/organizations/${organizationId}/business-cases/${caseA}/documents`, {
    method: "POST",
    cookie: manager.cookie,
    csrf: manager.csrf,
    body: { title: "관리자 작성 시도", documentType: "POLICY", contentText: "허용되면 안 됩니다." },
  });
  assert.equal(managerCreate.response.status, 404);
  assert.equal(managerCreate.body?.error, "business_case_document_not_found");

  const ownerNoCsrf = await request(`/api/saas/organizations/${organizationId}/business-cases/${caseA}/documents`, {
    method: "POST",
    cookie: owner.cookie,
    body: { title: "취업규칙 초안", documentType: "WORK_RULES", contentText: "제1조 초기안" },
  });
  assert.equal(ownerNoCsrf.response.status, 403);
  assert.equal(ownerNoCsrf.body?.error, "csrf_invalid");

  const createdA = await request(`/api/saas/organizations/${organizationId}/business-cases/${caseA}/documents`, {
    method: "POST",
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: { title: "취업규칙 개정안", documentType: "WORK_RULES", contentText: "제1조 최초 검토안\n제2조 근무시간" },
  });
  assert.equal(createdA.response.status, 201, JSON.stringify(createdA.body));
  const documentA = createdA.body.document;
  const versionA1 = documentA.latestVersion;
  assert.equal(versionA1.versionNumber, 1);
  assert.match(versionA1.contentSha256, /^[0-9a-f]{64}$/);
  assert.equal("organizationId" in documentA, false);
  assert.equal("createdByUserId" in documentA, false);
  assert.equal("organizationId" in versionA1, false);
  assert.equal("createdByUserId" in versionA1, false);
  assert.equal("shareGrantId" in documentA, false);

  const createdB = await request(`/api/saas/organizations/${organizationId}/business-cases/${caseB}/documents`, {
    method: "POST",
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: { title: "근로계약서 별건", documentType: "EMPLOYMENT_CONTRACT", contentText: "Case B 전용 문서" },
  });
  assert.equal(createdB.response.status, 201, JSON.stringify(createdB.body));
  const versionB1 = createdB.body.document.latestVersion;

  const fullGrantId = await issueAndAcceptGrant({
    owner,
    advisor,
    organizationId,
    caseId: caseA,
    permissions: ["case.read", "document.read", "document.review"],
  });
  const readOnlyGrantId = await issueAndAcceptGrant({
    owner,
    advisor: readOnlyAdvisor,
    organizationId,
    caseId: caseA,
    permissions: ["case.read", "document.read"],
  });

  const advisorList = await request(`/api/saas/advisor/share-grants/${fullGrantId}/documents`, {
    cookie: advisor.cookie,
  });
  assert.equal(advisorList.response.status, 200, JSON.stringify(advisorList.body));
  assert.equal(advisorList.body.documents.length, 1);
  assert.equal(advisorList.body.documents[0].id, documentA.id);
  assert.equal(advisorList.body.documents[0].latestVersion.versionNumber, 1);
  assert.equal("organizationId" in advisorList.body.documents[0], false);
  assert.equal("createdByUserId" in advisorList.body.documents[0].latestVersion, false);

  const outsiderRead = await request(`/api/saas/advisor/share-grants/${fullGrantId}/documents`, {
    cookie: outsider.cookie,
  });
  assert.equal(outsiderRead.response.status, 404);
  assert.equal(outsiderRead.body?.error, "external_advisor_documents_not_found");

  const reviewNoCsrf = await request(`/api/saas/advisor/share-grants/${fullGrantId}/document-versions/${versionA1.id}/reviews`, {
    method: "POST",
    cookie: advisor.cookie,
    body: { decision: "CHANGES_REQUESTED", body: "CSRF 없이 검토" },
  });
  assert.equal(reviewNoCsrf.response.status, 403);
  assert.equal(reviewNoCsrf.body?.error, "csrf_invalid");

  const readOnlyReview = await request(`/api/saas/advisor/share-grants/${readOnlyGrantId}/document-versions/${versionA1.id}/reviews`, {
    method: "POST",
    cookie: readOnlyAdvisor.cookie,
    csrf: readOnlyAdvisor.csrf,
    body: { decision: "COMMENT", body: "읽기 전용 grant는 검토를 작성할 수 없어야 합니다." },
  });
  assert.equal(readOnlyReview.response.status, 404);
  assert.equal(readOnlyReview.body?.error, "external_advisor_documents_not_found");

  const crossCaseReview = await request(`/api/saas/advisor/share-grants/${fullGrantId}/document-versions/${versionB1.id}/reviews`, {
    method: "POST",
    cookie: advisor.cookie,
    csrf: advisor.csrf,
    body: { decision: "COMMENT", body: "다른 Case 버전 주입 시도" },
  });
  assert.equal(crossCaseReview.response.status, 404);
  assert.equal(crossCaseReview.body?.error, "external_advisor_documents_not_found");

  const reviewV1 = await request(`/api/saas/advisor/share-grants/${fullGrantId}/document-versions/${versionA1.id}/reviews`, {
    method: "POST",
    cookie: advisor.cookie,
    csrf: advisor.csrf,
    body: { decision: "CHANGES_REQUESTED", body: "제2조의 휴게시간 기준을 명확히 적어주세요." },
  });
  assert.equal(reviewV1.response.status, 201, JSON.stringify(reviewV1.body));
  assert.equal(reviewV1.body.review.decision, "CHANGES_REQUESTED");
  assert.equal("reviewerUserId" in reviewV1.body.review, false);
  assert.equal("shareGrantId" in reviewV1.body.review, false);
  assert.equal("organizationId" in reviewV1.body.review, false);

  const version2 = await request(`/api/saas/business-case-documents/${documentA.id}/versions`, {
    method: "POST",
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: { contentText: "제1조 수정안\n제2조 근무시간 및 휴게시간을 구분해 명시" },
  });
  assert.equal(version2.response.status, 201, JSON.stringify(version2.body));
  assert.equal(version2.body.version.versionNumber, 2);
  assert.notEqual(version2.body.version.contentSha256, versionA1.contentSha256);

  const versions = await request(`/api/saas/organizations/${organizationId}/business-cases/${caseA}/documents/${documentA.id}/versions`, {
    cookie: owner.cookie,
  });
  assert.equal(versions.response.status, 200, JSON.stringify(versions.body));
  assert.deepEqual(versions.body.versions.map((version) => version.versionNumber), [2, 1]);
  assert.equal(versions.body.versions[1].contentSha256, versionA1.contentSha256, "v1 must remain immutable after v2 creation");

  const businessV1Reviews = await request(`/api/saas/organizations/${organizationId}/business-cases/${caseA}/document-versions/${versionA1.id}/reviews`, {
    cookie: owner.cookie,
  });
  assert.equal(businessV1Reviews.response.status, 200, JSON.stringify(businessV1Reviews.body));
  assert.equal(businessV1Reviews.body.reviews.length, 1);
  assert.equal(businessV1Reviews.body.reviews[0].decision, "CHANGES_REQUESTED");

  const advisorListAfterV2 = await request(`/api/saas/advisor/share-grants/${fullGrantId}/documents`, {
    cookie: advisor.cookie,
  });
  assert.equal(advisorListAfterV2.response.status, 200, JSON.stringify(advisorListAfterV2.body));
  assert.equal(advisorListAfterV2.body.documents[0].latestVersion.versionNumber, 2);

  const reviewV2 = await request(`/api/saas/advisor/share-grants/${fullGrantId}/document-versions/${version2.body.version.id}/reviews`, {
    method: "POST",
    cookie: advisor.cookie,
    csrf: advisor.csrf,
    body: { decision: "APPROVED", body: "" },
  });
  assert.equal(reviewV2.response.status, 201, JSON.stringify(reviewV2.body));
  assert.equal(reviewV2.body.review.decision, "APPROVED");

  const dbReviews = await fixturePool.query(
    `SELECT r.document_version_id,r.reviewer_user_id,r.share_grant_id,r.decision
       FROM business_case_document_reviews r
      WHERE r.organization_id=$1 AND r.business_case_id=$2
      ORDER BY r.created_at ASC,r.id ASC`,
    [organizationId, caseA],
  );
  assert.equal(dbReviews.rowCount, 2);
  assert.deepEqual(dbReviews.rows.map((row) => row.decision), ["CHANGES_REQUESTED", "APPROVED"]);
  assert.equal(dbReviews.rows[0].document_version_id, versionA1.id);
  assert.equal(dbReviews.rows[0].reviewer_user_id, advisor.user.id);
  assert.equal(dbReviews.rows[0].share_grant_id, fullGrantId);

  await assert.rejects(
    fixturePool.query(
      `INSERT INTO business_case_document_versions
       (id,document_id,organization_id,business_case_id,version_number,content_text,content_sha256,created_by_user_id,created_at)
       VALUES ($1,$2,$3,$4,99,'cross-case','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',$5,$6)`,
      [`bcdv-cross-${suffix}`, documentA.id, organizationId, caseB, owner.user.id, new Date().toISOString()],
    ),
    /foreign key|violates/i,
    "composite FK must reject a document version mixed with another Case",
  );

  const revoke = await request(`/api/saas/advisor-grants/${fullGrantId}/revoke`, {
    method: "POST",
    cookie: owner.cookie,
    csrf: owner.csrf,
  });
  assert.equal(revoke.response.status, 200, JSON.stringify(revoke.body));

  const afterRevoke = await request(`/api/saas/advisor/share-grants/${fullGrantId}/documents`, {
    cookie: advisor.cookie,
  });
  assert.equal(afterRevoke.response.status, 404);
  assert.equal(afterRevoke.body?.error, "external_advisor_documents_not_found");

  const archiveGrantId = await issueAndAcceptGrant({
    owner,
    advisor,
    organizationId,
    caseId: caseA,
    permissions: ["case.read", "document.read", "document.review"],
  });
  const archived = await request(`/api/saas/business-cases/${caseA}/status`, {
    method: "PATCH",
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: { status: "ARCHIVED" },
  });
  assert.equal(archived.response.status, 200, JSON.stringify(archived.body));

  const afterArchive = await request(`/api/saas/advisor/share-grants/${archiveGrantId}/documents`, {
    cookie: advisor.cookie,
  });
  assert.equal(afterArchive.response.status, 404);
  assert.equal(afterArchive.body?.error, "external_advisor_documents_not_found");

  const versionAfterArchive = await request(`/api/saas/business-case-documents/${documentA.id}/versions`, {
    method: "POST",
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: { contentText: "ARCHIVED 이후 새 버전 생성 시도" },
  });
  assert.equal(versionAfterArchive.response.status, 409);
  assert.equal(versionAfterArchive.body?.error, "business_case_document_case_not_mutable");

  const advisorMembership = await fixturePool.query(
    `SELECT COUNT(*)::integer AS count FROM organization_memberships
     WHERE organization_id=$1 AND user_id IN ($2,$3) AND status='ACTIVE'`,
    [organizationId, advisor.user.id, readOnlyAdvisor.user.id],
  );
  assert.equal(advisorMembership.rows[0].count, 0, "document collaboration must never create advisor Membership");

  console.log("Business Case document review E2E passed: immutable versions, safe projection, OWNER/HR gate, CSRF, document.read/document.review separation, cross-case FK isolation, revoke/archive cut-off and no advisor Membership.");
} finally {
  await new Promise((resolve) => server.close(resolve));
  await Promise.allSettled([closeRuntimeStorage(), closeRuntimePostgres()]);
  await fixturePool.end();
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
