// SaaS tenant/domain contract. Runtime auth endpoints are intentionally not implemented here;
// this module freezes the invariants that future repositories/policies must enforce.

export const ORGANIZATION_TYPES = Object.freeze(["BUSINESS", "PRO_OFFICE", "INTERNAL"]);
export const ORGANIZATION_STATUSES = Object.freeze(["DRAFT", "ACTIVE", "SUSPENDED", "DELETION_PENDING", "DELETED"]);
export const MEMBERSHIP_STATUSES = Object.freeze(["INVITED", "ACTIVE", "SUSPENDED", "REMOVED"]);
export const INVITATION_STATUSES = Object.freeze(["PENDING", "ACCEPTED", "EXPIRED", "REVOKED"]);
export const EMPLOYEE_LINK_STATUSES = Object.freeze(["INVITED", "ACTIVE", "REVOKED"]);

export const ROLE_KEYS = Object.freeze([
  "OWNER",
  "HR_ADMIN",
  "MANAGER",
  "EMPLOYEE",
  "EXTERNAL_ADVISOR",
  "BILLING_ADMIN",
]);

export const TENANT_BOUNDARY_INVARIANTS = Object.freeze([
  "business_and_pro_resources_require_organization_id",
  "resource_lookup_scopes_by_organization_and_resource_id",
  "worker_case_is_not_employer_tenant_data",
  "employee_does_not_auto_link_to_global_user",
  "employee_user_link_requires_explicit_invitation_acceptance",
  "external_advisor_uses_explicit_share_grant",
  "share_grant_is_resource_scoped_and_revocable",
  "membership_removal_revokes_organization_access",
  "last_active_owner_cannot_leave_without_transfer_or_org_closure",
  "break_glass_access_is_time_bounded_and_audited",
]);

export const ORGANIZATION_LIFECYCLE = Object.freeze({
  DRAFT: Object.freeze(["ACTIVE", "DELETED"]),
  ACTIVE: Object.freeze(["SUSPENDED", "DELETION_PENDING"]),
  SUSPENDED: Object.freeze(["ACTIVE", "DELETION_PENDING"]),
  DELETION_PENDING: Object.freeze(["ACTIVE", "DELETED"]),
  DELETED: Object.freeze([]),
});

export const MEMBERSHIP_LIFECYCLE = Object.freeze({
  INVITED: Object.freeze(["ACTIVE", "REMOVED"]),
  ACTIVE: Object.freeze(["SUSPENDED", "REMOVED"]),
  SUSPENDED: Object.freeze(["ACTIVE", "REMOVED"]),
  REMOVED: Object.freeze([]),
});

export function canTransition(lifecycle, from, to) {
  return Array.isArray(lifecycle?.[from]) && lifecycle[from].includes(to);
}

export function assertOrganizationTransition(from, to) {
  if (!ORGANIZATION_STATUSES.includes(from) || !ORGANIZATION_STATUSES.includes(to)) {
    throw new Error("organization_status_invalid");
  }
  if (!canTransition(ORGANIZATION_LIFECYCLE, from, to)) {
    throw new Error(`organization_transition_denied:${from}:${to}`);
  }
  return true;
}

export function assertMembershipTransition(from, to) {
  if (!MEMBERSHIP_STATUSES.includes(from) || !MEMBERSHIP_STATUSES.includes(to)) {
    throw new Error("membership_status_invalid");
  }
  if (!canTransition(MEMBERSHIP_LIFECYCLE, from, to)) {
    throw new Error(`membership_transition_denied:${from}:${to}`);
  }
  return true;
}

export function assertEmployeeUserLinkIntent({ invited = false, accepted = false } = {}) {
  if (!invited) throw new Error("employee_user_link_invitation_required");
  if (!accepted) throw new Error("employee_user_link_acceptance_required");
  return true;
}

export function assertLastOwnerExit({ activeOwnerCount = 0, transferring = false, closingOrganization = false } = {}) {
  if (Number(activeOwnerCount) <= 1 && !transferring && !closingOrganization) {
    throw new Error("last_owner_exit_denied");
  }
  return true;
}
