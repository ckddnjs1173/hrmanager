import { normalizeEmail } from "./saas-auth-repo.js";
import { normalizeExternalAdvisorPermissions } from "./external-advisor-sharegrant-contract.js";

export const EXTERNAL_ADVISOR_INVITATION_STATUSES = Object.freeze(["PENDING", "ACCEPTED", "REVOKED"]);
export const EXTERNAL_ADVISOR_INVITATION_DEFAULT_TTL_DAYS = 7;
export const EXTERNAL_ADVISOR_INVITATION_MAX_TTL_DAYS = 14;

function asDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function validateExternalAdvisorInvitationInput({
  organizationId,
  resourceType = "BUSINESS_CASE",
  resourceId,
  advisorEmail,
  permissions,
  createdByUserId,
  createdAt = new Date(),
  invitationExpiresAt,
  grantExpiresAt,
} = {}) {
  const email = normalizeEmail(advisorEmail);
  if (!email || !email.includes("@")) throw new Error("external_advisor_invitation_email_invalid");
  if (!String(organizationId || "").trim()) throw new Error("external_advisor_organization_required");
  if (resourceType !== "BUSINESS_CASE") throw new Error("external_advisor_resource_type_invalid");
  if (!String(resourceId || "").trim()) throw new Error("external_advisor_resource_required");
  if (!String(createdByUserId || "").trim()) throw new Error("external_advisor_created_by_required");

  const created = asDate(createdAt);
  const inviteExpiry = asDate(invitationExpiresAt);
  const grantExpiry = asDate(grantExpiresAt);
  if (!created) throw new Error("external_advisor_created_at_invalid");
  if (!inviteExpiry) throw new Error("external_advisor_invitation_expires_at_required");
  if (!grantExpiry) throw new Error("external_advisor_expires_at_required");
  if (inviteExpiry.getTime() <= created.getTime()) throw new Error("external_advisor_invitation_expiry_must_be_future");
  if (inviteExpiry.getTime() > created.getTime() + EXTERNAL_ADVISOR_INVITATION_MAX_TTL_DAYS * 86_400_000) {
    throw new Error("external_advisor_invitation_ttl_too_long");
  }
  if (grantExpiry.getTime() <= inviteExpiry.getTime()) throw new Error("external_advisor_grant_expiry_after_invitation_required");

  return {
    organizationId: String(organizationId).trim(),
    resourceType,
    resourceId: String(resourceId).trim(),
    advisorEmail: email,
    permissions: normalizeExternalAdvisorPermissions(permissions),
    createdByUserId: String(createdByUserId).trim(),
    createdAt: created.toISOString(),
    invitationExpiresAt: inviteExpiry.toISOString(),
    grantExpiresAt: grantExpiry.toISOString(),
  };
}

export function deriveExternalAdvisorInvitationStatus(invitation, now = new Date()) {
  if (!invitation || !EXTERNAL_ADVISOR_INVITATION_STATUSES.includes(invitation.status)) return "INVALID";
  if (invitation.status === "ACCEPTED" || invitation.status === "REVOKED") return invitation.status;
  const expires = asDate(invitation.invitationExpiresAt || invitation.invitation_expires_at);
  const current = asDate(now);
  if (!expires || !current) return "INVALID";
  return expires.getTime() <= current.getTime() ? "EXPIRED" : "PENDING";
}
