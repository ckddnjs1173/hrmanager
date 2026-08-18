import test from "node:test";
import assert from "node:assert/strict";
import {
  BUSINESS_CASE_DOCUMENT_REVIEW_DECISIONS,
  normalizeBusinessCaseDocumentContent,
  normalizeBusinessCaseDocumentReviewBody,
  normalizeBusinessCaseDocumentReviewDecision,
  normalizeBusinessCaseDocumentTitle,
  normalizeBusinessCaseDocumentType,
} from "../lib/business-case-document-contract.js";

test("Business Case document contract normalizes safe values", () => {
  assert.equal(normalizeBusinessCaseDocumentTitle("  취업규칙 검토본  "), "취업규칙 검토본");
  assert.equal(normalizeBusinessCaseDocumentType(" policy.draft "), "POLICY.DRAFT");
  assert.equal(normalizeBusinessCaseDocumentContent("  본문  "), "본문");
  assert.deepEqual(BUSINESS_CASE_DOCUMENT_REVIEW_DECISIONS, ["COMMENT", "APPROVED", "CHANGES_REQUESTED"]);
  assert.equal(normalizeBusinessCaseDocumentReviewDecision("approved"), "APPROVED");
  assert.equal(normalizeBusinessCaseDocumentReviewBody("", "APPROVED"), "");
  assert.equal(normalizeBusinessCaseDocumentReviewBody(" 수정 필요 ", "CHANGES_REQUESTED"), "수정 필요");
});

test("Business Case document contract rejects invalid or unsafe values", () => {
  assert.throws(() => normalizeBusinessCaseDocumentTitle(""), /business_case_document_title_required/);
  assert.throws(() => normalizeBusinessCaseDocumentType("한글 유형"), /business_case_document_type_invalid/);
  assert.throws(() => normalizeBusinessCaseDocumentContent(""), /business_case_document_content_required/);
  assert.throws(() => normalizeBusinessCaseDocumentReviewDecision("DELETE"), /business_case_document_review_decision_invalid/);
  assert.throws(() => normalizeBusinessCaseDocumentReviewBody("", "COMMENT"), /business_case_document_review_body_required/);
  assert.throws(() => normalizeBusinessCaseDocumentReviewBody("", "CHANGES_REQUESTED"), /business_case_document_review_body_required/);
});
