export const BUSINESS_CASE_DOCUMENT_KINDS = Object.freeze([
  "EMPLOYMENT_CONTRACT",
  "NOTICE",
  "AGREEMENT",
  "PAYROLL_SUPPORT",
  "EVIDENCE",
  "OTHER",
]);

export const BUSINESS_CASE_DOCUMENT_STATUSES = Object.freeze([
  "DRAFT",
  "IN_REVIEW",
  "APPROVED",
  "CHANGES_REQUESTED",
  "WITHDRAWN",
]);

export const BUSINESS_CASE_DOCUMENT_REVIEW_DECISIONS = Object.freeze([
  "APPROVED",
  "CHANGES_REQUESTED",
]);

export const BUSINESS_CASE_DOCUMENT_ALLOWED_MIME_TYPES = Object.freeze([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/x-hwp",
  "application/haansofthwp",
  "application/vnd.hancom.hwpx",
]);

export const BUSINESS_CASE_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const BUSINESS_CASE_DOCUMENT_MAX_TITLE_LENGTH = 200;
export const BUSINESS_CASE_DOCUMENT_MAX_FILENAME_LENGTH = 180;
export const BUSINESS_CASE_DOCUMENT_MAX_REVIEW_NOTE_LENGTH = 5000;

const allowedKinds = new Set(BUSINESS_CASE_DOCUMENT_KINDS);
const allowedStatuses = new Set(BUSINESS_CASE_DOCUMENT_STATUSES);
const allowedDecisions = new Set(BUSINESS_CASE_DOCUMENT_REVIEW_DECISIONS);
const allowedMimeTypes = new Set(BUSINESS_CASE_DOCUMENT_ALLOWED_MIME_TYPES);
const sha256Pattern = /^[0-9a-f]{64}$/;

export function normalizeBusinessCaseDocumentTitle(value) {
  const title = String(value ?? "").trim();
  if (!title) throw new Error("business_case_document_title_required");
  if (title.length > BUSINESS_CASE_DOCUMENT_MAX_TITLE_LENGTH) {
    throw new Error("business_case_document_title_too_long");
  }
  return title;
}

export function normalizeBusinessCaseDocumentKind(value) {
  const kind = String(value ?? "").trim().toUpperCase();
  if (!allowedKinds.has(kind)) throw new Error("business_case_document_kind_invalid");
  return kind;
}

export function normalizeBusinessCaseDocumentFileName(value) {
  const fileName = String(value ?? "").trim();
  if (!fileName) throw new Error("business_case_document_filename_required");
  if (fileName.length > BUSINESS_CASE_DOCUMENT_MAX_FILENAME_LENGTH) {
    throw new Error("business_case_document_filename_too_long");
  }
  if (fileName.includes("/") || fileName.includes("\\") || fileName.includes("\0")) {
    throw new Error("business_case_document_filename_invalid");
  }
  return fileName;
}

export function normalizeBusinessCaseDocumentMimeType(value) {
  const mimeType = String(value ?? "").trim().toLowerCase();
  if (!allowedMimeTypes.has(mimeType)) throw new Error("business_case_document_mime_type_invalid");
  return mimeType;
}

export function normalizeBusinessCaseDocumentSha256(value) {
  const sha256 = String(value ?? "").trim().toLowerCase();
  if (!sha256Pattern.test(sha256)) throw new Error("business_case_document_sha256_invalid");
  return sha256;
}

export function normalizeBusinessCaseDocumentSizeBytes(value) {
  const sizeBytes = Number(value);
  if (!Number.isInteger(sizeBytes) || sizeBytes < 1) throw new Error("business_case_document_size_invalid");
  if (sizeBytes > BUSINESS_CASE_DOCUMENT_MAX_BYTES) throw new Error("business_case_document_size_too_large");
  return sizeBytes;
}

export function validateBusinessCaseDocumentVersionMetadata({
  fileName,
  mimeType,
  sizeBytes,
  contentSha256,
} = {}) {
  return {
    fileName: normalizeBusinessCaseDocumentFileName(fileName),
    mimeType: normalizeBusinessCaseDocumentMimeType(mimeType),
    sizeBytes: normalizeBusinessCaseDocumentSizeBytes(sizeBytes),
    contentSha256: normalizeBusinessCaseDocumentSha256(contentSha256),
  };
}

export function canTransitionBusinessCaseDocument(fromStatus, toStatus) {
  if (!allowedStatuses.has(fromStatus) || !allowedStatuses.has(toStatus)) return false;
  if (fromStatus === "DRAFT" && ["IN_REVIEW", "WITHDRAWN"].includes(toStatus)) return true;
  if (fromStatus === "IN_REVIEW" && ["APPROVED", "CHANGES_REQUESTED", "WITHDRAWN"].includes(toStatus)) return true;
  if (fromStatus === "CHANGES_REQUESTED" && ["IN_REVIEW", "WITHDRAWN"].includes(toStatus)) return true;
  return false;
}

export function canAddBusinessCaseDocumentVersion(status) {
  return status === "DRAFT" || status === "CHANGES_REQUESTED";
}

export function isBusinessCaseDocumentAdvisorReadable(status) {
  return status === "IN_REVIEW" || status === "CHANGES_REQUESTED" || status === "APPROVED";
}

export function normalizeBusinessCaseDocumentReview({ decision, note = "" } = {}) {
  const normalizedDecision = String(decision ?? "").trim().toUpperCase();
  if (!allowedDecisions.has(normalizedDecision)) throw new Error("business_case_document_review_decision_invalid");
  const normalizedNote = String(note ?? "").trim();
  if (normalizedNote.length > BUSINESS_CASE_DOCUMENT_MAX_REVIEW_NOTE_LENGTH) {
    throw new Error("business_case_document_review_note_too_long");
  }
  if (normalizedDecision === "CHANGES_REQUESTED" && !normalizedNote) {
    throw new Error("business_case_document_review_note_required");
  }
  return { decision: normalizedDecision, note: normalizedNote };
}
