import { createBusinessCaseDocumentRepository } from "./business-case-document-repo.js";
import { createBusinessCaseDocumentBinaryRepository } from "./business-case-document-binary-repo.js";

function requireActor(actorUserId) {
  const value = String(actorUserId || "").trim();
  if (!value) throw new Error("business_case_document_actor_required");
  return value;
}

function requireId(value, code) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

export function createBusinessCaseDocumentService({
  repository = createBusinessCaseDocumentRepository(),
  binaryRepository = null,
  env = process.env,
} = {}) {
  if (!repository || typeof repository.createDraft !== "function") throw new Error("business_case_document_repository_required");
  let binary = binaryRepository;
  const getBinaryRepository = () => binary || (binary = createBusinessCaseDocumentBinaryRepository({ env }));

  async function createBusinessDocument({ caseId, actorUserId, title, documentKind } = {}) {
    return repository.createDraft({
      caseId: requireId(caseId, "business_case_document_case_required"),
      actorUserId: requireActor(actorUserId),
      title,
      documentKind,
    });
  }

  async function addBusinessDocumentVersion({ documentId, actorUserId, fileName, mimeType, sizeBytes, contentSha256 } = {}) {
    return repository.addVersion({
      documentId: requireId(documentId, "business_case_document_required"),
      actorUserId: requireActor(actorUserId),
      fileName,
      mimeType,
      sizeBytes,
      contentSha256,
    });
  }

  async function uploadBusinessDocumentVersion({ documentId, actorUserId, fileName, mimeType, bytes } = {}) {
    return getBinaryRepository().storeBusinessVersion({
      documentId: requireId(documentId, "business_case_document_required"),
      actorUserId: requireActor(actorUserId),
      fileName,
      mimeType,
      bytes,
    });
  }

  async function submitBusinessDocumentForReview({ documentId, actorUserId } = {}) {
    return repository.submitForReview({
      documentId: requireId(documentId, "business_case_document_required"),
      actorUserId: requireActor(actorUserId),
    });
  }

  async function submitStoredBusinessDocumentForReview({ documentId, actorUserId } = {}) {
    const normalizedDocumentId = requireId(documentId, "business_case_document_required");
    const normalizedActorId = requireActor(actorUserId);
    await getBinaryRepository().assertLatestBusinessContentStored({
      documentId: normalizedDocumentId,
      actorUserId: normalizedActorId,
    });
    return repository.submitForReview({ documentId: normalizedDocumentId, actorUserId: normalizedActorId });
  }

  async function withdrawBusinessDocument({ documentId, actorUserId } = {}) {
    return repository.withdraw({
      documentId: requireId(documentId, "business_case_document_required"),
      actorUserId: requireActor(actorUserId),
    });
  }

  async function getBusinessDocument({ documentId, actorUserId } = {}) {
    return repository.getForBusiness({
      documentId: requireId(documentId, "business_case_document_required"),
      actorUserId: requireActor(actorUserId),
    });
  }

  async function listBusinessCaseDocuments({ caseId, actorUserId, limit = 100 } = {}) {
    return repository.listForBusinessCase({
      caseId: requireId(caseId, "business_case_document_case_required"),
      actorUserId: requireActor(actorUserId),
      limit,
    });
  }

  async function listBusinessDocumentEvents({ documentId, actorUserId } = {}) {
    return repository.listEventsForBusiness({
      documentId: requireId(documentId, "business_case_document_required"),
      actorUserId: requireActor(actorUserId),
    });
  }

  async function listBusinessDocumentAccessEvents({ documentId, actorUserId, limit = 200 } = {}) {
    return getBinaryRepository().listBusinessAccessEvents({
      documentId: requireId(documentId, "business_case_document_required"),
      actorUserId: requireActor(actorUserId),
      limit,
    });
  }

  async function downloadBusinessDocumentVersion({ versionId, actorUserId } = {}) {
    return getBinaryRepository().getBusinessDownload({
      versionId: requireId(versionId, "business_case_document_version_required"),
      actorUserId: requireActor(actorUserId),
    });
  }

  async function listAdvisorDocuments({ grantId, actorUserId, limit = 100 } = {}) {
    return repository.listForAdvisor({
      grantId: requireId(grantId, "business_case_document_grant_required"),
      advisorUserId: requireActor(actorUserId),
      limit,
    });
  }

  async function getAdvisorDocument({ grantId, documentId, actorUserId } = {}) {
    return repository.getForAdvisor({
      grantId: requireId(grantId, "business_case_document_grant_required"),
      documentId: requireId(documentId, "business_case_document_required"),
      advisorUserId: requireActor(actorUserId),
    });
  }

  async function downloadAdvisorDocumentVersion({ grantId, versionId, actorUserId } = {}) {
    return getBinaryRepository().getAdvisorDownload({
      grantId: requireId(grantId, "business_case_document_grant_required"),
      versionId: requireId(versionId, "business_case_document_version_required"),
      advisorUserId: requireActor(actorUserId),
    });
  }

  async function reviewAdvisorDocument({ grantId, documentId, actorUserId, decision, note = "" } = {}) {
    return repository.reviewForAdvisor({
      grantId: requireId(grantId, "business_case_document_grant_required"),
      documentId: requireId(documentId, "business_case_document_required"),
      advisorUserId: requireActor(actorUserId),
      decision,
      note,
    });
  }

  return {
    createBusinessDocument,
    addBusinessDocumentVersion,
    uploadBusinessDocumentVersion,
    submitBusinessDocumentForReview,
    submitStoredBusinessDocumentForReview,
    withdrawBusinessDocument,
    getBusinessDocument,
    listBusinessCaseDocuments,
    listBusinessDocumentEvents,
    listBusinessDocumentAccessEvents,
    downloadBusinessDocumentVersion,
    listAdvisorDocuments,
    getAdvisorDocument,
    downloadAdvisorDocumentVersion,
    reviewAdvisorDocument,
  };
}