import test from "node:test";
import assert from "node:assert/strict";

import {
  WAGE_ACTION_IDS,
  buildWageActions,
  getWageNextAction,
} from "../lib/wage-actions.js";

const coreFacts = {
  employmentStatus: "resigned",
  employmentStartDate: "2025-01-02",
  employmentEndDate: "2026-08-01",
  payDay: "매월 10일",
  unpaidPeriodStart: "2026-07-01",
  unpaidPeriodEnd: "2026-07-31",
  monthlyBasePay: 3000000,
  alreadyPaidAmount: 0,
  unpaidItems: ["월급"],
};

test("next action asks for core facts before workspace readiness", () => {
  const action = getWageNextAction({
    employmentStatus: "resigned",
    unpaidItems: ["월급"],
  });

  assert.equal(action.id, WAGE_ACTION_IDS.COMPLETE_INTAKE);
  assert.equal(action.target, "intake");
});

test("next action moves from extra-pay check to evidence and review", () => {
  const extra = getWageNextAction(coreFacts);
  assert.equal(extra.id, WAGE_ACTION_IDS.CONFIRM_EXTRA_PAY);
  assert.equal(extra.target, "extra");

  const extrasDone = {
    ...coreFacts,
    overtimeWork: false,
    nightWork: false,
    holidayWork: false,
    unusedAnnualLeave: false,
  };
  const evidence = getWageNextAction(extrasDone);
  assert.equal(evidence.id, WAGE_ACTION_IDS.GATHER_EVIDENCE);
  assert.equal(evidence.target, "evidence");

  const ready = getWageNextAction({
    ...extrasDone,
    evidence: {
      employmentContract: "have",
      payslip: "have",
      bankHistory: "planned",
    },
  });
  assert.equal(ready.id, WAGE_ACTION_IDS.REVIEW_CASE);
  assert.equal(ready.target, "facts");
});

test("wage action list exposes exactly one primary next action", () => {
  const actions = buildWageActions(coreFacts);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].priority, "primary");
  assert.equal(actions[0].status, "todo");
});
