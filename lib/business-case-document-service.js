import { createBusinessCaseDocumentRepository } from "./business-case-document-repo.js";
import { getRuntimePostgresPool } from "./runtime-postgres.js";
import { getActiveMembership } from "./saas-tenant-repo.js";
import { isExternalAdvisorManagementRole } from "./external-advisor-collaboration-service.js";

function required(value, code) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

function safeVersion(version) {
  if (!version) return null;
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    contentText: version.contentText,
    contentSha256: version.contentSha256,
    createdAt: version.createdAt,
  };
}

function safeDocument(document) {
  return {
    id: document.id,
    title: document.title,
    documentType: document.documentType,
    createdAt: document.createdAt,
    latestVersion: safeVersion(document.latestVersion),
  };
}

function safeReview(review) {
  return {
    id: review.id,
    documentVersionId: review.documentVersionId,
    decision: review.decision,
    body: review.body,
    createdAt: review.createdAt,
  };
}

export function createBusinessCaseDocumentService({
  repository = createBusinessCaseDocumentRepository(),
  getMembership = getActiveMembership,
  pool = getRuntimePostgresPool(),
} = {}) {
  if (!repository || typeof repository.createDocument !== "function") throw new Error("business_case_document_repository_required");
  if (typeof getMembership !== "function") throw new Error("business_case_document_membership_resolver_required");
  if (!pool || typeof pool.query !== "function") throw new Error("business_case_document_postgres_pool_required");

  async function requireManagementRole(organizationId, actorUserId) {
    const orgId = required(organizationId, "business_case_document_not_found");
    const userId = required(actorUserId, "business_case_document_not_found");
    const membership = await getMembership(orgId, userId);
    if (!membership || membership.status !== "ACTIVE" || !isExternalAdvisorManagementRole(membership.roleKey)) {
      throw new Error("business_case_document_not_found");
    }
    return membership;
  }

  async function resolveDocumentContext(documentId) {
    const id = required(documentId, "business_case_document_not_found");
    const result = await pool.query(
      "SELECT id,organization_id,business_case_id FROM business_case_documents WHERE id=$1",
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new Error("business_case_document_not_found");
    return { id: row.id, organizationId: row.organization_id, businessCaseId: row.business_case_id };
  }

  async function createDocument({ organizationId, caseId, actorUserId, title, documentType, contentText } = {}) {
    await requireManagementRole(organizationId, actorUserId);
    const created = await repository.createDocument({
      organizationId,
      businessCaseId: caseId,
      actorUserId,
      title,
      documentType,
      contentText,
    });
    return { document: safeDocument({ ...created.document, latestVersion: created.version }) };
  }

  async function createVersion({ documentId, actorUserId, contentText } = {}) {
    const context = await resolveDocumentContext(documentId);
    await requireManagementRole(context.organizationId, actorUserId);
    return { version: safeVersion(await repository.createVersion({ documentId: context.id, actorUserId, contentText })) };
  }

  async function listDocuments({ organizationId, caseId, actorUserId } = {}) {
    await requireManagementRole(organizationId, actorUserId);
    return {
      documents: (await repository.listForBusinessCase({ organizationId, businessCaseId: caseId })).map(safeDocument),
    };
  }

  async function listVersions({ organizationId, caseId, documentId, actorUserId } = {}) {
    await requireManagementRole(organizationId, actorUserId);
    return {
      versions: (await repository.listVersions({ organizationId, businessCaseId: caseId, documentId })).map(safeVersion),
    };
  }

  async function listBusinessReviews({ organizationId, caseId, documentVersionId, actorUserId } = {}) {
    await requireManagementRole(organizationId, actorUserId);
    return {
      reviews: (await repository.listReviewsForVersion({
        organizationId,
        businessCaseId: caseId,
        documentVersionId,
      })).map(safeReview),
    };
  }

  async function listAdvisorDocuments({ grantId, actorUserId } = {}) {
    const userId = required(actorUserId, "external_advisor_documents_not_found");
    return {
      documents: (await repository.listForAdvisor({ grantId, advisorUserId: userId })).map(safeDocument),
    };
  }

  async function createAdvisorReview({ grantId, documentVersionId, actorUserId, decision, body } = {}) {
    const userId = required(actorUserId, "external_advisor_documents_not_found");
    return {
      review: safeReview(await repository.createAdvisorReview({
        grantId,
        advisorUserId: userId,
        documentVersionId,
        decision,
        body,
      })),
    };
  }

  async function listAdvisorReviews({ grantId, documentVersionId, actorUserId } = {}) {
    const userId = required(actorUserId, "external_advisor_documents_not_found");
    return {
      reviews: (await repository.listAdvisorReviewsForVersion({
        grantId,
        advisorUserId: userId,
        documentVersionId,
      })).map(safeReview),
    };
  }

  return {
    requireManagementRole,
    createDocument,
    createVersion,
    listDocuments,
    listVersions,
    listBusinessReviews,
    listAdvisorDocuments,
    createAdvisorReview,
    listAdvisorReviews,
  };
}
