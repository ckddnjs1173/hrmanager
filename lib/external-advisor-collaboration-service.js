import { isBusinessCaseShareable } from "./business-case-contract.js";
import { createBusinessCaseRepository } from "./business-case-repo.js";
import { createBusinessCaseReviewNoteRepository } from "./business-case-review-note-repo.js";
import { EXTERNAL_ADVISOR_INVITATION_DEFAULT_TTL_DAYS } from "./external-advisor-invitation-contract.js";
import { createExternalAdvisorInvitationRepository } from "./external-advisor-invitation-repo.js";
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

function safeReviewNote(note) {
  return {
    id: note.id,
    authorType: note.authorType,
    body: note.body,
    createdAt: note.createdAt,
  };
}

function safeOrganizationInvitation(invitation) {
  return {
    id: invitation.id,
    resourceId: invitation.resourceId,
    advisorEmail: invitation.advisorEmail,
    permissions: [...invitation.permissions],
    status: invitation.status,
    effectiveStatus: invitation.effectiveStatus,
    invitationExpiresAt: invitation.invitationExpiresAt,
    grantExpiresAt: invitation.grantExpiresAt,
    acceptedAt: invitation.acceptedAt,
    shareGrantId: invitation.shareGrantId,
    revokedAt: invitation.revokedAt,
    createdAt: invitation.createdAt,
  };
}

export function createExternalAdvisorCollaborationService({
  businessCaseRepository = createBusinessCaseRepository(),
  shareGrantRepository = createExternalAdvisorShareGrantRepository(),
  invitationRepository = null,
  reviewNoteRepository = null,
  getMembership = getActiveMembership,
  now = () => new Date(),
} = {}) {
  if (!businessCaseRepository || typeof businessCaseRepository.create !== "function") {
    throw new Error("business_case_repository_required");
  }
  if (!shareGrantRepository || typeof shareGrantRepository.create !== "function") {
    throw new Error("external_advisor_sharegrant_repository_required");
  }
  if (invitationRepository && typeof invitationRepository.create !== "function") throw new Error("external_advisor_invitation_repository_invalid");
  if (reviewNoteRepository && typeof reviewNoteRepository.createBusinessNote !== "function") throw new Error("business_case_review_note_repository_invalid");
  if (typeof getMembership !== "function") throw new Error("external_advisor_membership_resolver_required");
  let invitations = invitationRepository;
  let reviewNotes = reviewNoteRepository;
  const getInvitationRepository = () => {
    if (!invitations) invitations = createExternalAdvisorInvitationRepository({ now });
    return invitations;
  };
  const getReviewNoteRepository = () => {
    if (!reviewNotes) reviewNotes = createBusinessCaseReviewNoteRepository({ now });
    return reviewNotes;
  };

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

  async function createBusinessCaseReviewNote({ organizationId, caseId, actorUserId, body, metadata = {} } = {}) {
    const orgId = requireOrganizationId(organizationId);
    const userId = requireActor(actorUserId);
    await requireManagementRole(orgId, userId);
    const businessCase = await businessCaseRepository.get(caseId);
    if (!businessCase) throw new Error("business_case_not_found");
    if (businessCase.organizationId !== orgId) throw new Error("external_advisor_cross_tenant_case_forbidden");
    if (!isBusinessCaseShareable(businessCase.status)) throw new Error("external_advisor_business_case_not_shareable");
    const note = await getReviewNoteRepository().createBusinessNote({
      organizationId: orgId,
      businessCaseId: businessCase.id,
      authorUserId: userId,
      body,
      metadata,
    });
    return safeReviewNote(note);
  }

  async function listBusinessCaseReviewNotes({ organizationId, caseId, actorUserId, limit = 200 } = {}) {
    const orgId = requireOrganizationId(organizationId);
    await requireManagementRole(orgId, actorUserId);
    const businessCase = await businessCaseRepository.get(caseId);
    if (!businessCase) throw new Error("business_case_not_found");
    if (businessCase.organizationId !== orgId) throw new Error("external_advisor_cross_tenant_case_forbidden");
    return (await getReviewNoteRepository().listForBusinessCase({ organizationId: orgId, businessCaseId: businessCase.id, limit })).map(safeReviewNote);
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

  async function issueExternalAdvisorInvitation({
    organizationId,
    caseId,
    advisorEmail,
    permissions,
    actorUserId,
    invitationExpiresAt = null,
    grantExpiresAt,
    metadata = {},
  } = {}) {
    const orgId = requireOrganizationId(organizationId);
    const userId = requireActor(actorUserId);
    await requireManagementRole(orgId, userId);
    const businessCase = await businessCaseRepository.get(caseId);
    if (!businessCase) throw new Error("business_case_not_found");
    if (businessCase.organizationId !== orgId) throw new Error("external_advisor_cross_tenant_case_forbidden");
    if (!isBusinessCaseShareable(businessCase.status)) throw new Error("external_advisor_business_case_not_shareable");
    const createdAt = now();
    const inviteExpiry = invitationExpiresAt || new Date(createdAt.getTime() + EXTERNAL_ADVISOR_INVITATION_DEFAULT_TTL_DAYS * 86_400_000).toISOString();
    const result = await getInvitationRepository().create({
      organizationId: orgId,
      caseId: businessCase.id,
      advisorEmail,
      permissions,
      createdByUserId: userId,
      invitationExpiresAt: inviteExpiry,
      grantExpiresAt,
      metadata,
    });
    return {
      invitation: safeOrganizationInvitation(result.invitation),
      invitationToken: result.rawToken,
      deliveryMode: "MANUAL_LINK",
      invitationFragmentPath: `/advisor.html#invite=${result.rawToken}`,
    };
  }

  async function listOrganizationInvitations({ organizationId, actorUserId, limit = 100 } = {}) {
    const orgId = requireOrganizationId(organizationId);
    await requireManagementRole(orgId, actorUserId);
    return (await getInvitationRepository().listForOrganization({ organizationId: orgId, limit })).map(safeOrganizationInvitation);
  }

  async function revokeExternalAdvisorInvitation({ invitationId, actorUserId } = {}) {
    const userId = requireActor(actorUserId);
    const invitation = await getInvitationRepository().get(invitationId);
    if (!invitation) throw new Error("external_advisor_invitation_not_found");
    await requireManagementRole(invitation.organizationId, userId);
    return safeOrganizationInvitation(await getInvitationRepository().revoke({ invitationId, actorUserId: userId }));
  }

  async function previewExternalAdvisorInvitation({ rawToken, actorUserId, actorEmail } = {}) {
    requireActor(actorUserId);
    return getInvitationRepository().previewForAdvisor({ rawToken, actorUserId, actorEmail });
  }

  async function acceptExternalAdvisorInvitation({ rawToken, actorUserId, actorEmail } = {}) {
    const userId = requireActor(actorUserId);
    const result = await getInvitationRepository().accept({ rawToken, actorUserId: userId, actorEmail });
    const shareGrant = await shareGrantRepository.get(result.shareGrantId);
    return { invitation: safeOrganizationInvitation(result.invitation), shareGrant };
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
    const decision = await shareGrantRepository.hasPermission({ grantId, advisorUserId: userId, permission: "case.read" });
    if (!decision?.allowed || !decision.grant) throw new Error("external_advisor_shared_case_not_found");
    const grant = decision.grant;
    const businessCase = await businessCaseRepository.get(grant.resourceId);
    if (!businessCase || businessCase.organizationId !== grant.organizationId || !isBusinessCaseShareable(businessCase.status)) {
      throw new Error("external_advisor_shared_case_not_found");
    }
    return safeSharedBusinessCaseReadModel(businessCase, grant);
  }

  async function createAdvisorCaseReviewNote({ grantId, actorUserId, body, metadata = {} } = {}) {
    const userId = requireActor(actorUserId);
    if (!String(grantId || "").trim()) throw new Error("external_advisor_review_notes_not_found");
    const decision = await shareGrantRepository.hasPermission({ grantId, advisorUserId: userId, permission: "comment.create" });
    if (!decision?.allowed || !decision.grant) throw new Error("external_advisor_review_notes_not_found");
    const businessCase = await businessCaseRepository.get(decision.grant.resourceId);
    if (!businessCase || businessCase.organizationId !== decision.grant.organizationId || !isBusinessCaseShareable(businessCase.status)) {
      throw new Error("external_advisor_review_notes_not_found");
    }
    const note = await getReviewNoteRepository().createAdvisorNote({
      shareGrantId: decision.grant.id,
      advisorUserId: userId,
      body,
      metadata,
    });
    return safeReviewNote(note);
  }

  async function listAdvisorCaseReviewNotes({ grantId, actorUserId, limit = 200 } = {}) {
    const userId = requireActor(actorUserId);
    if (!String(grantId || "").trim()) throw new Error("external_advisor_review_notes_not_found");
    const decision = await shareGrantRepository.hasPermission({ grantId, advisorUserId: userId, permission: "case.read" });
    if (!decision?.allowed || !decision.grant) throw new Error("external_advisor_review_notes_not_found");
    const businessCase = await businessCaseRepository.get(decision.grant.resourceId);
    if (!businessCase || businessCase.organizationId !== decision.grant.organizationId || !isBusinessCaseShareable(businessCase.status)) {
      throw new Error("external_advisor_review_notes_not_found");
    }
    return (await getReviewNoteRepository().listForBusinessCase({
      organizationId: decision.grant.organizationId,
      businessCaseId: businessCase.id,
      limit,
    })).map(safeReviewNote);
  }

  return {
    requireManagementRole,
    createBusinessCase,
    listBusinessCases,
    transitionBusinessCase,
    createBusinessCaseReviewNote,
    listBusinessCaseReviewNotes,
    issueExternalAdvisorShareGrant,
    issueExternalAdvisorInvitation,
    listOrganizationInvitations,
    revokeExternalAdvisorInvitation,
    previewExternalAdvisorInvitation,
    acceptExternalAdvisorInvitation,
    listOrganizationShareGrants,
    revokeExternalAdvisorShareGrant,
    acceptExternalAdvisorShareGrant,
    listAdvisorShareGrants,
    getSharedBusinessCaseForAdvisor,
    createAdvisorCaseReviewNote,
    listAdvisorCaseReviewNotes,
  };
}
