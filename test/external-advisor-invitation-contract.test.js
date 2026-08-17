import test from "node:test";
import assert from "node:assert/strict";
import {
  EXTERNAL_ADVISOR_INVITATION_DEFAULT_TTL_DAYS,
  EXTERNAL_ADVISOR_INVITATION_MAX_TTL_DAYS,
  EXTERNAL_ADVISOR_INVITATION_STATUSES,
  deriveExternalAdvisorInvitationStatus,
  validateExternalAdvisorInvitationInput,
} from "../lib/external-advisor-invitation-contract.js";

test("advisor invitation taxonomy and TTL are bounded", () => {
  assert.deepEqual(EXTERNAL_ADVISOR_INVITATION_STATUSES, ["PENDING", "ACCEPTED", "REVOKED"]);
  assert.equal(EXTERNAL_ADVISOR_INVITATION_DEFAULT_TTL_DAYS, 7);
  assert.equal(EXTERNAL_ADVISOR_INVITATION_MAX_TTL_DAYS, 14);
});

test("invitation validates normalized email, permissions and grant expiry after invitation", () => {
  const input = validateExternalAdvisorInvitationInput({
    organizationId: "org-a",
    resourceId: "case-a",
    advisorEmail: " Advisor@Example.COM ",
    permissions: ["case.read", "document.read"],
    createdByUserId: "owner-a",
    createdAt: "2026-08-17T00:00:00Z",
    invitationExpiresAt: "2026-08-24T00:00:00Z",
    grantExpiresAt: "2026-09-17T00:00:00Z",
  });
  assert.equal(input.advisorEmail, "advisor@example.com");
  assert.deepEqual(input.permissions, ["case.read", "document.read"]);
  assert.throws(() => validateExternalAdvisorInvitationInput({ ...input, advisorEmail: "invalid" }), /external_advisor_invitation_email_invalid/);
  assert.throws(() => validateExternalAdvisorInvitationInput({ ...input, permissions: ["case.read", "salary.read"] }), /external_advisor_permission_invalid/);
  assert.throws(() => validateExternalAdvisorInvitationInput({ ...input, invitationExpiresAt: "2026-09-10T00:00:00Z" }), /external_advisor_invitation_ttl_too_long/);
  assert.throws(() => validateExternalAdvisorInvitationInput({ ...input, grantExpiresAt: "2026-08-24T00:00:00Z" }), /external_advisor_grant_expiry_after_invitation_required/);
});

test("invitation expiry is derived while accepted/revoked stay terminal", () => {
  const pending = { status: "PENDING", invitationExpiresAt: "2026-08-24T00:00:00Z" };
  assert.equal(deriveExternalAdvisorInvitationStatus(pending, "2026-08-23T23:59:59Z"), "PENDING");
  assert.equal(deriveExternalAdvisorInvitationStatus(pending, "2026-08-24T00:00:00Z"), "EXPIRED");
  assert.equal(deriveExternalAdvisorInvitationStatus({ ...pending, status: "ACCEPTED" }, "2026-09-01T00:00:00Z"), "ACCEPTED");
  assert.equal(deriveExternalAdvisorInvitationStatus({ ...pending, status: "REVOKED" }, "2026-09-01T00:00:00Z"), "REVOKED");
});
