import test from "node:test";
import assert from "node:assert/strict";
import {
  EXTERNAL_ADVISOR_SHAREGRANT_PERMISSIONS,
  EXTERNAL_ADVISOR_SHAREGRANT_RESOURCE_TYPES,
  EXTERNAL_ADVISOR_SHAREGRANT_STATUSES,
  canTransitionExternalAdvisorShareGrant,
  deriveExternalAdvisorShareGrantStatus,
  externalAdvisorGrantAllows,
  normalizeExternalAdvisorPermissions,
  validateExternalAdvisorShareGrantInput,
} from "../lib/external-advisor-sharegrant-contract.js";

test("External Advisor V1 taxonomy is intentionally narrow", () => {
  assert.deepEqual(EXTERNAL_ADVISOR_SHAREGRANT_RESOURCE_TYPES, ["BUSINESS_CASE"]);
  assert.deepEqual(EXTERNAL_ADVISOR_SHAREGRANT_STATUSES, ["PENDING", "ACTIVE", "REVOKED"]);
  assert.deepEqual(EXTERNAL_ADVISOR_SHAREGRANT_PERMISSIONS, [
    "case.read",
    "document.read",
    "document.review",
    "comment.create",
  ]);
  for (const forbidden of ["employee.read", "salary.read", "org.manage", "member.invite", "billing.manage", "audit.export"]) {
    assert.equal(EXTERNAL_ADVISOR_SHAREGRANT_PERMISSIONS.includes(forbidden), false);
  }
});

test("permissions require case.read and document review requires document read", () => {
  assert.deepEqual(
    normalizeExternalAdvisorPermissions(["case.read", "document.read", "document.review", "case.read"]),
    ["case.read", "document.read", "document.review"],
  );
  assert.throws(() => normalizeExternalAdvisorPermissions(["document.read"]), /external_advisor_case_read_required/);
  assert.throws(
    () => normalizeExternalAdvisorPermissions(["case.read", "document.review"]),
    /external_advisor_document_review_requires_read/,
  );
  assert.throws(
    () => normalizeExternalAdvisorPermissions(["case.read", "salary.read"]),
    /external_advisor_permission_invalid/,
  );
});

test("grant input requires a future expiry and distinct creator/advisor identities", () => {
  const createdAt = new Date("2026-08-17T00:00:00Z");
  const validated = validateExternalAdvisorShareGrantInput({
    organizationId: "org-a",
    resourceType: "BUSINESS_CASE",
    resourceId: "case-a",
    advisorUserId: "advisor-a",
    permissions: ["case.read", "comment.create"],
    createdByUserId: "owner-a",
    createdAt,
    expiresAt: "2026-08-24T00:00:00Z",
  });
  assert.equal(validated.expiresAt, "2026-08-24T00:00:00.000Z");
  assert.throws(
    () => validateExternalAdvisorShareGrantInput({ ...validated, createdAt, expiresAt: createdAt }),
    /external_advisor_expiry_must_be_future/,
  );
  assert.throws(
    () => validateExternalAdvisorShareGrantInput({ ...validated, advisorUserId: "owner-a", createdByUserId: "owner-a" }),
    /external_advisor_self_grant_forbidden/,
  );
});

test("lifecycle only allows pending acceptance/revoke and active revoke", () => {
  assert.equal(canTransitionExternalAdvisorShareGrant("PENDING", "ACTIVE"), true);
  assert.equal(canTransitionExternalAdvisorShareGrant("PENDING", "REVOKED"), true);
  assert.equal(canTransitionExternalAdvisorShareGrant("ACTIVE", "REVOKED"), true);
  assert.equal(canTransitionExternalAdvisorShareGrant("ACTIVE", "PENDING"), false);
  assert.equal(canTransitionExternalAdvisorShareGrant("REVOKED", "ACTIVE"), false);
  assert.equal(canTransitionExternalAdvisorShareGrant("REVOKED", "PENDING"), false);
});

test("EXPIRED is derived and never stored as mutable state", () => {
  const grant = { status: "ACTIVE", expiresAt: "2026-08-18T00:00:00Z" };
  assert.equal(deriveExternalAdvisorShareGrantStatus(grant, "2026-08-17T23:59:59Z"), "ACTIVE");
  assert.equal(deriveExternalAdvisorShareGrantStatus(grant, "2026-08-18T00:00:00Z"), "EXPIRED");
  assert.equal(deriveExternalAdvisorShareGrantStatus({ ...grant, status: "REVOKED" }, "2026-08-17T00:00:00Z"), "REVOKED");
});

test("access requires exact advisor identity, ACTIVE unexpired grant and explicit permission", () => {
  const grant = {
    status: "ACTIVE",
    advisorUserId: "advisor-a",
    permissions: ["case.read", "document.read"],
    expiresAt: "2026-08-20T00:00:00Z",
  };
  assert.deepEqual(externalAdvisorGrantAllows({ grant, actorUserId: "advisor-a", permission: "case.read", now: "2026-08-19T00:00:00Z" }), { allowed: true, reason: null });
  assert.equal(externalAdvisorGrantAllows({ grant, actorUserId: "other", permission: "case.read", now: "2026-08-19T00:00:00Z" }).allowed, false);
  assert.equal(externalAdvisorGrantAllows({ grant, actorUserId: "advisor-a", permission: "comment.create", now: "2026-08-19T00:00:00Z" }).allowed, false);
  assert.equal(externalAdvisorGrantAllows({ grant, actorUserId: "advisor-a", permission: "case.read", now: "2026-08-20T00:00:00Z" }).reason, "grant_expired");
  assert.equal(externalAdvisorGrantAllows({ ...grant, status: "PENDING" }, "advisor-a", "case.read").allowed, false);
});
