export const EXTERNAL_ADVISOR_SHAREGRANT_RESOURCE_TYPES = Object.freeze(["BUSINESS_CASE"]);
export const EXTERNAL_ADVISOR_SHAREGRANT_STATUSES = Object.freeze(["PENDING", "ACTIVE", "REVOKED"]);
export const EXTERNAL_ADVISOR_SHAREGRANT_PERMISSIONS = Object.freeze([
  "case.read",
  "document.read",
  "document.review",
  "comment.create",
]);

const allowedPermissions = new Set(EXTERNAL_ADVISOR_SHAREGRANT_PERMISSIONS);

function asDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function normalizeExternalAdvisorPermissions(value) {
  if (!Array.isArray(value)) throw new Error("external_advisor_permissions_array_required");
  const normalized = [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))];
  if (!normalized.length) throw new Error("external_advisor_permissions_required");
  if (normalized.some((permission) => !allowedPermissions.has(permission))) {
    throw new Error("external_advisor_permission_invalid");
  }
  if (!normalized.includes("case.read")) throw new Error("external_advisor_case_read_required");
  if (normalized.includes("document.review") && !normalized.includes("document.read")) {
    throw new Error("external_advisor_document_review_requires_read");
  }
  return normalized;
}

export function validateExternalAdvisorShareGrantInput({
  organizationId,
  resourceType,
  resourceId,
  advisorUserId,
  permissions,
  createdByUserId,
  createdAt = new Date(),
  expiresAt,
} = {}) {
  if (!String(organizationId || "").trim()) throw new Error("external_advisor_organization_required");
  if (!EXTERNAL_ADVISOR_SHAREGRANT_RESOURCE_TYPES.includes(resourceType)) throw new Error("external_advisor_resource_type_invalid");
  if (!String(resourceId || "").trim()) throw new Error("external_advisor_resource_required");
  if (!String(advisorUserId || "").trim()) throw new Error("external_advisor_user_required");
  if (!String(createdByUserId || "").trim()) throw new Error("external_advisor_created_by_required");
  if (advisorUserId === createdByUserId) throw new Error("external_advisor_self_grant_forbidden");

  const created = asDate(createdAt);
  const expires = asDate(expiresAt);
  if (!created) throw new Error("external_advisor_created_at_invalid");
  if (!expires) throw new Error("external_advisor_expires_at_required");
  if (expires.getTime() <= created.getTime()) throw new Error("external_advisor_expiry_must_be_future");

  return {
    organizationId: String(organizationId).trim(),
    resourceType,
    resourceId: String(resourceId).trim(),
    advisorUserId: String(advisorUserId).trim(),
    permissions: normalizeExternalAdvisorPermissions(permissions),
    createdByUserId: String(createdByUserId).trim(),
    createdAt: created.toISOString(),
    expiresAt: expires.toISOString(),
  };
}

export function deriveExternalAdvisorShareGrantStatus(grant, now = new Date()) {
  if (!grant || !EXTERNAL_ADVISOR_SHAREGRANT_STATUSES.includes(grant.status)) return "INVALID";
  if (grant.status === "REVOKED") return "REVOKED";
  const expires = asDate(grant.expiresAt || grant.expires_at);
  const current = asDate(now);
  if (!expires || !current) return "INVALID";
  if (expires.getTime() <= current.getTime()) return "EXPIRED";
  return grant.status;
}

export function canTransitionExternalAdvisorShareGrant(fromStatus, toStatus) {
  if (fromStatus === "PENDING" && ["ACTIVE", "REVOKED"].includes(toStatus)) return true;
  if (fromStatus === "ACTIVE" && toStatus === "REVOKED") return true;
  return false;
}

export function externalAdvisorGrantAllows({ grant, actorUserId, permission, now = new Date() } = {}) {
  if (!grant) return { allowed: false, reason: "grant_not_found" };
  if (!String(actorUserId || "").trim() || actorUserId !== (grant.advisorUserId || grant.advisor_user_id)) {
    return { allowed: false, reason: "advisor_identity_mismatch" };
  }
  if (!allowedPermissions.has(permission)) return { allowed: false, reason: "permission_invalid" };
  const status = deriveExternalAdvisorShareGrantStatus(grant, now);
  if (status !== "ACTIVE") return { allowed: false, reason: status === "EXPIRED" ? "grant_expired" : "grant_inactive" };
  const permissions = Array.isArray(grant.permissions) ? grant.permissions : [];
  if (!permissions.includes(permission)) return { allowed: false, reason: "permission_not_granted" };
  return { allowed: true, reason: null };
}
