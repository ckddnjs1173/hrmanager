// SaaS RBAC + audit contract.
// Role은 편의를 위한 permission template일 뿐이며, 최종 authorization은
// membership status + permission + resource scope + share grant + entitlement를 함께 본다.

export const PERMISSIONS = Object.freeze([
  "org.read",
  "org.manage",
  "org.delete",
  "member.read",
  "member.invite",
  "member.role.change",
  "member.remove",
  "workplace.read",
  "workplace.manage",
  "compliance.read",
  "compliance.manage",
  "employee.read",
  "employee.write",
  "employee.salary.read",
  "employee.export",
  "case.read",
  "case.create",
  "case.update",
  "case.delete",
  "case.share",
  "document.generate",
  "document.review",
  "document.approve",
  "document.download",
  "audit.read",
  "audit.export",
  "billing.read",
  "billing.manage",
  "subscription.change",
  "shared.case.read",
  "shared.case.review",
  "shared.document.read",
  "shared.document.review",
]);

const p = (...permissions) => Object.freeze(permissions);

export const ROLE_TEMPLATES = Object.freeze({
  OWNER: Object.freeze({
    scopeMode: "organization",
    permissions: p(
      "org.read", "org.manage", "org.delete",
      "member.read", "member.invite", "member.role.change", "member.remove",
      "workplace.read", "workplace.manage", "compliance.read", "compliance.manage",
      "employee.read", "employee.write", "employee.salary.read", "employee.export",
      "case.read", "case.create", "case.update", "case.delete", "case.share",
      "document.generate", "document.review", "document.approve", "document.download",
      "audit.read", "audit.export",
      "billing.read", "billing.manage", "subscription.change"
    ),
  }),
  HR_ADMIN: Object.freeze({
    scopeMode: "organization",
    permissions: p(
      "org.read",
      "member.read", "member.invite",
      "workplace.read", "workplace.manage", "compliance.read", "compliance.manage",
      "employee.read", "employee.write", "employee.salary.read", "employee.export",
      "case.read", "case.create", "case.update", "case.delete", "case.share",
      "document.generate", "document.review", "document.approve", "document.download",
      "audit.read"
    ),
  }),
  MANAGER: Object.freeze({
    scopeMode: "assigned",
    permissions: p(
      "org.read", "workplace.read", "compliance.read",
      "employee.read",
      "case.read", "case.create", "case.update",
      "document.generate", "document.download"
    ),
  }),
  EMPLOYEE: Object.freeze({
    scopeMode: "self",
    permissions: p(
      "org.read",
      "employee.read", "employee.salary.read",
      "case.read", "case.create",
      "document.download"
    ),
  }),
  EXTERNAL_ADVISOR: Object.freeze({
    scopeMode: "grant_only",
    permissions: p(
      "shared.case.read", "shared.case.review",
      "shared.document.read", "shared.document.review"
    ),
  }),
  BILLING_ADMIN: Object.freeze({
    scopeMode: "billing_only",
    permissions: p("org.read", "billing.read", "billing.manage", "subscription.change"),
  }),
});

export const AUDIT_ACTIONS = Object.freeze([
  "auth.login",
  "auth.logout",
  "auth.mfa.challenge",
  "auth.session.revoke",
  "organization.create",
  "member.invite",
  "member.invite.accept",
  "member.invite.revoke",
  "member.role.change",
  "member.remove",
  "employee.view",
  "employee.update",
  "employee.salary.view",
  "employee.export",
  "risk.scan",
  "compliance.action.status",
  "case.create",
  "case.view",
  "case.update",
  "case.delete",
  "case.share",
  "case.share.revoke",
  "document.generate",
  "document.review",
  "document.approve",
  "document.download",
  "billing.account.update",
  "subscription.create",
  "subscription.change",
  "subscription.cancel",
  "organization.delete.request",
  "organization.delete.cancel",
  "organization.delete.execute",
  "retention.delete",
  "legal.rule.applied",
  "operator.break_glass.start",
  "operator.break_glass.end",
]);

export const SECURITY_EVENTS = Object.freeze([
  "auth.magic.request",
  "auth.magic.verify",
  "auth.login",
  "auth.logout",
  "auth.session.revoke",
]);

export function roleHasPermission(roleKey, permission) {
  return !!ROLE_TEMPLATES[roleKey]?.permissions?.includes(permission);
}

export function getRoleScopeMode(roleKey) {
  return ROLE_TEMPLATES[roleKey]?.scopeMode || null;
}

export function authorizeRolePermission({ roleKey, permission, membershipStatus = "ACTIVE", hasShareGrant = false } = {}) {
  if (membershipStatus !== "ACTIVE") return { allowed: false, reason: "membership_inactive" };
  const role = ROLE_TEMPLATES[roleKey];
  if (!role) return { allowed: false, reason: "role_unknown" };
  if (!PERMISSIONS.includes(permission)) return { allowed: false, reason: "permission_unknown" };
  if (!role.permissions.includes(permission)) return { allowed: false, reason: "permission_denied" };
  if (role.scopeMode === "grant_only" && !hasShareGrant) return { allowed: false, reason: "share_grant_required" };
  return { allowed: true, reason: "allowed", scopeMode: role.scopeMode };
}

export function validateRoleTemplates() {
  const errors = [];
  for (const [roleKey, role] of Object.entries(ROLE_TEMPLATES)) {
    const duplicates = role.permissions.filter((permission, index) => role.permissions.indexOf(permission) !== index);
    if (duplicates.length) errors.push(`${roleKey}:duplicate_permission`);
    for (const permission of role.permissions) {
      if (!PERMISSIONS.includes(permission)) errors.push(`${roleKey}:unknown_permission:${permission}`);
    }
  }
  return { ok: errors.length === 0, errors };
}
