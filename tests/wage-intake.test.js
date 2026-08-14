import test from "node:test";
import assert from "node:assert/strict";

import {
  EMPLOYMENT_STATUS,
  WAGE_CASE_TYPE,
  WAGE_INTAKE_STEP,
  WAGE_ISSUES,
  createInitialWageCase,
  detectWageIssues,
  getMissingWageFacts,
  getNextWageQuestions,
  getWageEvidenceState,
  getWageIntakeState,
  normalizeWageFacts,
} from "../lib/wage-intake.js";

test("empty wage intake starts with case classification questions", () => {
  const state = getWageIntakeState({});

  assert.equal(state.caseType, WAGE_CASE_TYPE);
  assert.equal(state.step, WAGE_INTAKE_STEP.CASE);
  assert.equal(state.coreComplete, false);
  assert.equal(state.readyForWorkspace, false);
  assert.deepEqual(
    state.questions.map((item) => item.key),
    ["employmentStatus", "unpaidItems"]
  );
});

test("resigned worker requires employment end date and asks at most three questions", () => {
  const facts = {
    employmentStatus: EMPLOYMENT_STATUS.RESIGNED,
    unpaidItems: ["월급"],
  };

  const missing = getMissingWageFacts(facts);
  const questions = getNextWageQuestions(facts);

  assert.equal(missing.includes("employmentEndDate"), true);
  assert.equal(questions.length <= 3, true);
  assert.equal(questions[0].step, WAGE_INTAKE_STEP.DATES);
  assert.deepEqual(
    questions.map((item) => item.key),
    ["employmentEndDate", "payDay", "unpaidPeriodStart"]
  );
});

test("currently employed worker does not require employment end date", () => {
  const missing = getMissingWageFacts({
    employmentStatus: EMPLOYMENT_STATUS.EMPLOYED,
    unpaidItems: ["월급"],
  });

  assert.equal(missing.includes("employmentEndDate"), false);
});

test("core facts can complete workspace readiness before optional extra-pay questions", () => {
  const facts = {
    employmentStatus: EMPLOYMENT_STATUS.RESIGNED,
    employmentStartDate: "2025-01-02",
    employmentEndDate: "2026-08-01",
    payDay: "매월 10일",
    unpaidPeriodStart: "2026-07-01",
    unpaidPeriodEnd: "2026-07-31",
    monthlyBasePay: 3000000,
    alreadyPaidAmount: 0,
    unpaidItems: ["7월 월급"],
  };

  const state = getWageIntakeState(facts);
  const caseRecord = createInitialWageCase(facts);

  assert.equal(state.coreComplete, true);
  assert.equal(state.readyForWorkspace, true);
  assert.equal(state.step, WAGE_INTAKE_STEP.EXTRA_PAY);
  assert.equal(caseRecord.status, "active");
  assert.equal(caseRecord.case_type, WAGE_CASE_TYPE);
  assert.equal(caseRecord.event_date, "2026-08-01");
  assert.equal(caseRecord.period_start, "2026-07-01");
  assert.equal(caseRecord.period_end, "2026-07-31");
  assert.deepEqual(caseRecord.missing_facts, []);
});

test("wage issue detection activates issues from unpaid items and structured facts", () => {
  const issues = detectWageIssues({
    unpaidItems: ["기본급", "연차수당"],
    overtimeWork: true,
    nightWork: false,
    holidayWork: true,
  });

  assert.equal(issues.includes(WAGE_ISSUES.BASE_PAY), true);
  assert.equal(issues.includes(WAGE_ISSUES.OVERTIME), true);
  assert.equal(issues.includes(WAGE_ISSUES.HOLIDAY), true);
  assert.equal(issues.includes(WAGE_ISSUES.ANNUAL_LEAVE_PAY), true);
  assert.equal(issues.includes(WAGE_ISSUES.NIGHT), false);
});

test("evidence state normalizes known statuses and ignores unsupported values", () => {
  const evidence = getWageEvidenceState({
    evidence: {
      employmentContract: "have",
      payslip: "missing",
      bankHistory: "planned",
      attendanceRecord: "invalid",
    },
  });

  assert.equal(evidence.totalCount, 5);
  assert.equal(evidence.haveCount, 1);
  assert.equal(evidence.knownCount, 3);
  assert.deepEqual(
    evidence.items.find((item) => item.id === "attendanceRecord"),
    { id: "attendanceRecord", status: "unknown" }
  );
});

test("fact normalization trims strings and deduplicates unpaid items", () => {
  const facts = normalizeWageFacts({
    employmentStatus: "not-valid",
    employmentStartDate: " 2025-01-02 ",
    unpaidItems: [" 월급 ", "월급", "연장수당"],
  });

  assert.equal(facts.employmentStatus, EMPLOYMENT_STATUS.UNKNOWN);
  assert.equal(facts.employmentStartDate, "2025-01-02");
  assert.deepEqual(facts.unpaidItems, ["월급", "연장수당"]);
});
