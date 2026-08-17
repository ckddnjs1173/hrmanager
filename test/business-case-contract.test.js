import test from "node:test";
import assert from "node:assert/strict";
import {
  BUSINESS_CASE_SHAREABLE_STATUSES,
  BUSINESS_CASE_STATUSES,
  businessCaseTransitionEvent,
  canTransitionBusinessCase,
  isBusinessCaseShareable,
  normalizeBusinessCaseSummary,
  normalizeBusinessCaseTitle,
} from "../lib/business-case-contract.js";

test("Business Case V1 status and shareable taxonomy is explicit", () => {
  assert.deepEqual(BUSINESS_CASE_STATUSES, ["DRAFT", "OPEN", "RESOLVED", "ARCHIVED"]);
  assert.deepEqual(BUSINESS_CASE_SHAREABLE_STATUSES, ["OPEN", "RESOLVED"]);
  assert.equal(isBusinessCaseShareable("DRAFT"), false);
  assert.equal(isBusinessCaseShareable("OPEN"), true);
  assert.equal(isBusinessCaseShareable("RESOLVED"), true);
  assert.equal(isBusinessCaseShareable("ARCHIVED"), false);
});

test("Business Case lifecycle allows reopen but makes archive terminal", () => {
  assert.equal(canTransitionBusinessCase("DRAFT", "OPEN"), true);
  assert.equal(canTransitionBusinessCase("DRAFT", "ARCHIVED"), true);
  assert.equal(canTransitionBusinessCase("OPEN", "RESOLVED"), true);
  assert.equal(canTransitionBusinessCase("OPEN", "ARCHIVED"), true);
  assert.equal(canTransitionBusinessCase("RESOLVED", "OPEN"), true);
  assert.equal(canTransitionBusinessCase("RESOLVED", "ARCHIVED"), true);
  assert.equal(canTransitionBusinessCase("ARCHIVED", "OPEN"), false);
  assert.equal(canTransitionBusinessCase("ARCHIVED", "DRAFT"), false);
  assert.equal(canTransitionBusinessCase("DRAFT", "RESOLVED"), false);
});

test("transition events are deterministic", () => {
  assert.equal(businessCaseTransitionEvent("DRAFT", "OPEN"), "OPENED");
  assert.equal(businessCaseTransitionEvent("OPEN", "RESOLVED"), "RESOLVED");
  assert.equal(businessCaseTransitionEvent("RESOLVED", "OPEN"), "REOPENED");
  assert.equal(businessCaseTransitionEvent("OPEN", "ARCHIVED"), "ARCHIVED");
  assert.throws(() => businessCaseTransitionEvent("DRAFT", "RESOLVED"), /business_case_transition_invalid/);
});

test("Business Case text fields are bounded", () => {
  assert.equal(normalizeBusinessCaseTitle("  임금   정산 이슈  "), "임금 정산 이슈");
  assert.equal(normalizeBusinessCaseSummary("  사실관계 확인 중  "), "사실관계 확인 중");
  assert.throws(() => normalizeBusinessCaseTitle(""), /business_case_title_required/);
  assert.throws(() => normalizeBusinessCaseTitle("x".repeat(201)), /business_case_title_too_long/);
  assert.throws(() => normalizeBusinessCaseSummary("x".repeat(5001)), /business_case_summary_too_long/);
});
