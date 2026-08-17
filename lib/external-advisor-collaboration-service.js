import { isBusinessCaseShareable } from "./business-case-contract.js";
import { createBusinessCaseRepository } from "./business-case-repo.js";
import { createExternalAdvisorShareGrantRepository } from "./external-advisor-sharegrant-repo.js";
import { getActiveMembership } from "./saas-tenant-repo.js";

export const EXTERNAL_ADVISOR_MANAGEMENT_ROLES = Object.freeze(["OWNER", "HR_ADMIN"]);

export function isExternalAdvisorManagementRole(roleKey) {
  return EXTERNAL_ADVISOR_MANAGEMENT_ROLES.includes(roleKey);
}

function requireActor(actorUserId) {
  if (!String(actorUserId || "").trim()) throw new Error("external_advisor_actor_required");
  return String(actorUserId).trim();
}

function requireOrganizationId(organizationId) {
  if (!String(organizationId || "").trim()) throw new Error("external_advisor_organization_required");
  return String(organizationId).trim();
}

function safeSharedBusinessCaseReadModel(businessCase, grant) {
  return {
    shareGrant: {
      id: grant.id,
      permissions: [...grant.permissions],
      expiresAt: grant.expiresAt,
      effectiveStatus: grant.effectiveStatus,
    },
    businessCase: {
      id: businessCase.id,
      title: businessCase.title,
      summary: businessCase.summary,
      status: businessCase.status,
      resolutionNote: businessCase.resolutionNote,
      createdAt: businessCase.createdAt,
      updatedAt: businessCase.updatedAt,
      openedAt: businessCase.openedAt,
      resolvedAt: businessCase.resolvedAt,
    },
  };
}

export function createExternalAdvisorCollaborationService({
  businessCaseRepository = createBusinessCaseRepository(),
  shareGrantRepository = createExternalAdvisorShareGrantRepository(),
  getMembership = getActiveMembership,
} = {}) {
  if (!businessCaseRepository || typeof businessCaseRepository.create !== "function") {
    throw new Error("business_case_repository_required");
  }
  if (!shareGrantRepository || typeof shareGrantRepository.create !== "function") {
    throw new Error("external_advisor_sharegrant_repository_required");
  }
  if (typeof getMembership !== "function") throw new Error("external_advisor_membership_resolver_required");

  async function requireManagementRole(organizationId, actorUserId) {
    const orgId = requireOrganizationId(organizationId);
    const userId = requireActor(actorUserId);
    const membership = await getMembership(orgId, userId);
    if (!membership || membership.status !== "ACTIVE") throw new Error("external_advisor_management_membership_required");
    if (!isExternalAdvisorManagementRole(membership.roleKey)) throw new Error("external_advisor_management_role_required");
    return membership;
  }

  async function createBusinessCase({ organizationId, actorUserId, title, summary = "" } = {}) {
    await requireManagementRole(organizationId, actorUserId);
    return businessCaseRepository.create({ organizationId, actorUserId, title, summary });
  }

  async function listBusinessCases({ organizationId, actorUserId, status = null, limit = 100 } = {}) {
    await requireManagementRole(organizationId, actorUserId);
    return businessCaseRepository.listForOrganization({ organizationId, status, limit });
  }

  async function transitionBusinessCase({ caseId, actorUserId, toStatus, resolutionNote = "", metadata = {} } = {}) {
    const userId = requireActor(actorUserId);
    const businessCase = await businessCaseRepository.get(caseId);
    if (!businessCase) throw new Error("business_case_not_found");
    await requireManagementRole(businessCase.organizationId, userId);
    return businessCaseRepository.transition({ caseId, actorUserId: userId, toStatus, resolutionNote, metadata });
  }

  async function issueExternalAdvisorShareGrant({
    organizationId,
    caseId,
    advisorUserId,
    permissions,
    actorUserId,
    expiresAt,
    metadata = {},
  } = {}) {
    const orgId = requireOrganizationId(organizationId);
    const userId = requireActor(actorUserId);
    await requireManagementRole(orgId, userId);

    const businessCase = await businessCaseRepository.get(caseId);
    if (!businessCase) throw new Error("business_case_not_found");
    if (businessCase.organizationId !== orgId) throw new Error("external_advisor_cross_tenant_case_forbidden");
    if (!isBusinessCaseShareable(businessCase.status)) throw new Error("external_advisor_business_case_not_shareable");

    return shareGrantRepository.create({
      organizationId: orgId,
      resourceType: "BUSINESS_CASE",
      resourceId: businessCase.id,
      advisorUserId,
      permissions,
      createdByUserId: userId,
      expiresAt,
      metadata,
    });
  }

  async function listOrganizationShareGrants({ organizationId, actorUserId, limit = 100 } = {}) {
    const orgId = requireOrganizationId(organizationId);
    await requireManagementRole(orgId, actorUserId);
    return shareGrantRepository.listForOrganization({ organizationId: orgId, limit });
  }

  async function revokeExternalAdvisorShareGrant({ grantId, actorUserId, metadata = {} } = {}) {
    const userId = requireActor(actorUserId);
    const grant = await shareGrantRepository.get(grantId);
    if (!grant) throw new Error("external_advisor_grant_not_found");
    await requireManagementRole(grant.organizationId, userId);
    return shareGrantRepository.revoke({ grantId, actorUserId: userId, metadata });
  }

  async function acceptExternalAdvisorShareGrant({ grantId, actorUserId } = {}) {
    const userId = requireActor(actorUserId);
    const grant = await shareGrantRepository.get(grantId);
    if (!grant) throw new Error("external_advisor_grant_not_found");
    if (grant.advisorUserId !== userId) throw new Error("external_advisor_accept_identity_mismatch");
    return shareGrantRepository.accept({ grantId, actorUserId: userId });
  }

  async function listAdvisorShareGrants({ advisorUserId, actorUserId, limit = 100 } = {}) {
    const advisorId = String(advisorUserId || "").trim();
    const userId = requireActor(actorUserId);
    if (!advisorId || advisorId !== userId) throw new Error("external_advisor_list_identity_mismatch");
    return shareGrantRepository.listForAdvisor({ advisorUserId: advisorId, limit });
  }

  async function getSharedBusinessCaseForAdvisor({ grantId, actorUserId } = {}) {
    const userId = requireActor(actorUserId);
    if (!String(grantId || "").trim()) throw new Error("external_advisor_shared_case_not_found");

    const decision = await shareGrantRepository.hasPermission({
      grantId,
      advisorUserId: userId,
      permission: "case.read",
    });
    if (!decision?.allowed || !decision.grant) throw new Error("external_advisor_shared_case_not_found");

    const grant = decision.grant;
    const businessCase = await businessCaseRepository.get(grant.resourceId);
    if (!businessCase) throw new Error("external_advisor_shared_case_not_found");
    if (businessCase.organizationId !== grant.organizationId) throw new Error("external_advisor_shared_case_not_found");
    if (!isBusinessCaseShareable(businessCase.status)) throw new Error("external_advisor_shared_case_not_found");

    return safeSharedBusinessCaseReadModel(businessCase, grant);
  }

  return {
    requireManagementRole,
    createBusinessCase,
    listBusinessCases,
    transitionBusinessCase,
    issueExternalAdvisorShareGrant,
    listOrganizationShareGrants,
    revokeExternalAdvisorShareGrant,
    acceptExternalAdvisorShareGrant,
    listAdvisorShareGrants,
    getSharedBusinessCaseForAdvisor,
  };
}
