import test from "node:test";
import assert from "node:assert/strict";
import {
  BUSINESS_CASE_DOCUMENT_ALLOWED_MIME_TYPES,
  BUSINESS_CASE_DOCUMENT_KINDS,
  BUSINESS_CASE_DOCUMENT_MAX_BYTES,
  BUSINESS_CASE_DOCUMENT_REVIEW_DECISIONS,
  BUSINESS_CASE_DOCUMENT_STATUSES,
  canAddBusinessCaseDocumentVersion,
  canTransitionBusinessCaseDocument,
  isBusinessCaseDocumentAdvisorReadable,
  normalizeBusinessCaseDocumentFileName,
  normalizeBusinessCaseDocumentKind,
  normalizeBusinessCaseDocumentReview,
  normalizeBusinessCaseDocumentSha256,
  normalizeBusinessCaseDocumentSizeBytes,
  normalizeBusinessCaseDocumentTitle,
  validateBusinessCaseDocumentVersionMetadata,
} from "../lib/business-case-document-contract.js";

test("Business Case document taxonomy is bounded for V1 review workflow", () => {
  assert.deepEqual(BUSINESS_CASE_DOCUMENT_KINDS, [
    "EMPLOYMENT_CONTRACT",
    "NOTICE",
    "AGREEMENT",
    "PAYROLL_SUPPORT",
    "EVIDENCE",
    "OTHER",
  ]);
  assert.deepEqual(BUSINESS_CASE_DOCUMENT_STATUSES, [
    "DRAFT",
    "IN_REVIEW",
    "APPROVED",
    "CHANGES_REQUESTED",
    "WITHDRAWN",
  ]);
  assert.deepEqual(BUSINESS_CASE_DOCUMENT_REVIEW_DECISIONS, ["APPROVED", "CHANGES_REQUESTED"]);
  assert.equal(BUSINESS_CASE_DOCUMENT_ALLOWED_MIME_TYPES.includes("application/octet-stream"), false);
});

test("document metadata rejects path-like filenames, unsupported MIME, oversized files and invalid hashes", () => {
  const sha = "a".repeat(64);
  assert.deepEqual(validateBusinessCaseDocumentVersionMetadata({
    fileName: "근로계약서.pdf",
    mimeType: "application/pdf",
    sizeBytes: 12345,
    contentSha256: sha.toUpperCase(),
  }), {
    fileName: "근로계약서.pdf",
    mimeType: "application/pdf",
    sizeBytes: 12345,
    contentSha256: sha,
  });

  assert.throws(() => normalizeBusinessCaseDocumentFileName("../secret.pdf"), /business_case_document_filename_invalid/);
  assert.throws(() => normalizeBusinessCaseDocumentFileName("folder\\secret.pdf"), /business_case_document_filename_invalid/);
  assert.throws(
    () => validateBusinessCaseDocumentVersionMetadata({ fileName: "x.exe", mimeType: "application/octet-stream", sizeBytes: 1, contentSha256: sha }),
    /business_case_document_mime_type_invalid/,
  );
  assert.throws(() => normalizeBusinessCaseDocumentSizeBytes(BUSINESS_CASE_DOCUMENT_MAX_BYTES + 1), /business_case_document_size_too_large/);
  assert.throws(() => normalizeBusinessCaseDocumentSha256("not-a-sha"), /business_case_document_sha256_invalid/);
});

test("title and kind normalization are strict", () => {
  assert.equal(normalizeBusinessCaseDocumentTitle("  해고 통지서  "), "해고 통지서");
  assert.equal(normalizeBusinessCaseDocumentKind("notice"), "NOTICE");
  assert.throws(() => normalizeBusinessCaseDocumentTitle("   "), /business_case_document_title_required/);
  assert.throws(() => normalizeBusinessCaseDocumentKind("salary_export"), /business_case_document_kind_invalid/);
});

test("document lifecycle allows one review loop and terminal approval/withdrawal", () => {
  assert.equal(canTransitionBusinessCaseDocument("DRAFT", "IN_REVIEW"), true);
  assert.equal(canTransitionBusinessCaseDocument("DRAFT", "WITHDRAWN"), true);
  assert.equal(canTransitionBusinessCaseDocument("IN_REVIEW", "APPROVED"), true);
  assert.equal(canTransitionBusinessCaseDocument("IN_REVIEW", "CHANGES_REQUESTED"), true);
  assert.equal(canTransitionBusinessCaseDocument("CHANGES_REQUESTED", "IN_REVIEW"), true);
  assert.equal(canTransitionBusinessCaseDocument("APPROVED", "IN_REVIEW"), false);
  assert.equal(canTransitionBusinessCaseDocument("WITHDRAWN", "DRAFT"), false);
  assert.equal(canTransitionBusinessCaseDocument("DRAFT", "APPROVED"), false);
});

test("new versions are only allowed before or after requested changes", () => {
  assert.equal(canAddBusinessCaseDocumentVersion("DRAFT"), true);
  assert.equal(canAddBusinessCaseDocumentVersion("CHANGES_REQUESTED"), true);
  assert.equal(canAddBusinessCaseDocumentVersion("IN_REVIEW"), false);
  assert.equal(canAddBusinessCaseDocumentVersion("APPROVED"), false);
  assert.equal(canAddBusinessCaseDocumentVersion("WITHDRAWN"), false);
});

test("advisor read visibility excludes drafts and withdrawn documents", () => {
  assert.equal(isBusinessCaseDocumentAdvisorReadable("DRAFT"), false);
  assert.equal(isBusinessCaseDocumentAdvisorReadable("IN_REVIEW"), true);
  assert.equal(isBusinessCaseDocumentAdvisorReadable("CHANGES_REQUESTED"), true);
  assert.equal(isBusinessCaseDocumentAdvisorReadable("APPROVED"), true);
  assert.equal(isBusinessCaseDocumentAdvisorReadable("WITHDRAWN"), false);
});

test("changes requested must include a review note while approval note is optional", () => {
  assert.deepEqual(normalizeBusinessCaseDocumentReview({ decision: "approved" }), { decision: "APPROVED", note: "" });
  assert.deepEqual(
    normalizeBusinessCaseDocumentReview({ decision: "changes_requested", note: "서명일자를 확인해 주세요." }),
    { decision: "CHANGES_REQUESTED", note: "서명일자를 확인해 주세요." },
  );
  assert.throws(
    () => normalizeBusinessCaseDocumentReview({ decision: "CHANGES_REQUESTED", note: "   " }),
    /business_case_document_review_note_required/,
  );
  assert.throws(
    () => normalizeBusinessCaseDocumentReview({ decision: "REJECTED", note: "x" }),
    /business_case_document_review_decision_invalid/,
  );
});
