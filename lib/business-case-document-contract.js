export const BUSINESS_CASE_DOCUMENT_REVIEW_DECISIONS = Object.freeze([
  "COMMENT",
  "APPROVED",
  "CHANGES_REQUESTED",
]);

const REVIEW_DECISIONS = new Set(BUSINESS_CASE_DOCUMENT_REVIEW_DECISIONS);

export function normalizeBusinessCaseDocumentTitle(value) {
  const title = String(value ?? "").trim();
  if (!title) throw new Error("business_case_document_title_required");
  if (title.length > 200) throw new Error("business_case_document_title_too_long");
  return title;
}

export function normalizeBusinessCaseDocumentType(value) {
  const documentType = String(value ?? "OTHER").trim().toUpperCase();
  if (!documentType) throw new Error("business_case_document_type_required");
  if (documentType.length > 80) throw new Error("business_case_document_type_too_long");
  if (!/^[A-Z0-9_.:-]+$/.test(documentType)) throw new Error("business_case_document_type_invalid");
  return documentType;
}

export function normalizeBusinessCaseDocumentContent(value) {
  const content = String(value ?? "").trim();
  if (!content) throw new Error("business_case_document_content_required");
  if (content.length > 100000) throw new Error("business_case_document_content_too_long");
  return content;
}

export function normalizeBusinessCaseDocumentReviewDecision(value) {
  const decision = String(value ?? "").trim().toUpperCase();
  if (!REVIEW_DECISIONS.has(decision)) throw new Error("business_case_document_review_decision_invalid");
  return decision;
}

export function normalizeBusinessCaseDocumentReviewBody(value, decision) {
  const normalizedDecision = normalizeBusinessCaseDocumentReviewDecision(decision);
  const body = String(value ?? "").trim();
  if (body.length > 5000) throw new Error("business_case_document_review_body_too_long");
  if (["COMMENT", "CHANGES_REQUESTED"].includes(normalizedDecision) && !body) {
    throw new Error("business_case_document_review_body_required");
  }
  return body;
}
