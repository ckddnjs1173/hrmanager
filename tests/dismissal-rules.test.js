import test from "node:test";
import assert from "node:assert/strict";

import { getDismissalLegalContext } from "../lib/dismissal-rules.js";

test("five-plus dismissal exposes unfair-dismissal, written-notice and labor-board baseline", () => {
  const legal = getDismissalLegalContext({
    separationType: "dismissal",
    employmentStartDate: "2025-01-01",
    noticeDate: "2026-07-20",
    effectiveDate: "2026-08-01",
    workplaceEmployeeCount: 8,
    writtenNoticeReceived: false,
    noticePayPaid: false,
    ordinaryDailyWage: 120000,
    employerReason: "성과",
  });

  assert.equal(legal.fivePlus, true);
  assert.equal(legal.unfairDismissalReviewApplies, true);
  assert.equal(legal.writtenNoticeRuleApplies, true);
  assert.equal(legal.writtenNoticeCompliance, "possible_violation");
  assert.equal(legal.laborBoardEligibleBaseline, true);
  assert.equal(legal.remedyWindow.months, 3);
  assert.equal(legal.noticeAllowance.status, "possible_shortfall");
  assert.equal(legal.noticeAllowance.amount, 3600000);
  assert.ok(legal.sources.some((source) => source.article === "근로기준법 제27조"));
  assert.ok(legal.sources.some((source) => source.article === "근로기준법 제28조"));
});

test("small workplace keeps notice-pay baseline but does not expose unfair-dismissal remedy", () => {
  const legal = getDismissalLegalContext({
    separationType: "dismissal",
    employmentStartDate: "2025-01-01",
    noticeDate: "2026-07-20",
    effectiveDate: "2026-08-01",
    workplaceEmployeeCount: 4,
    writtenNoticeReceived: false,
    noticePayPaid: false,
    ordinaryDailyWage: 100000,
    employerReason: "성과",
  });

  assert.equal(legal.fivePlus, false);
  assert.equal(legal.unfairDismissalReviewApplies, false);
  assert.equal(legal.writtenNoticeRuleApplies, false);
  assert.equal(legal.laborBoardEligibleBaseline, false);
  assert.equal(legal.noticeAllowance.status, "possible_shortfall");
  assert.equal(legal.noticeAllowance.amount, 3000000);
  assert.ok(legal.warnings.includes("small_workplace_labor_board_remedy_not_available_under_lsa_baseline"));
});

test("under-three-calendar-month worker does not receive an automatic notice-pay estimate", () => {
  const legal = getDismissalLegalContext({
    separationType: "dismissal",
    employmentStartDate: "2026-05-31",
    noticeDate: "2026-08-29",
    effectiveDate: "2026-08-30",
    workplaceEmployeeCount: 8,
    writtenNoticeReceived: true,
    noticePayPaid: false,
    ordinaryDailyWage: 100000,
    employerReason: "성과",
  });

  assert.equal(legal.noticeAllowance.status, "statutory_exception_under_3_months");
  assert.equal(legal.noticeAllowance.amount, 0);
});

test("exact three-calendar-month boundary is no longer treated as under three months", () => {
  const legal = getDismissalLegalContext({
    separationType: "dismissal",
    employmentStartDate: "2026-05-31",
    noticeDate: "2026-08-30",
    effectiveDate: "2026-08-31",
    workplaceEmployeeCount: 8,
    writtenNoticeReceived: true,
    noticePayPaid: false,
    ordinaryDailyWage: 100000,
    employerReason: "성과",
  });

  assert.equal(legal.noticeAllowance.status, "possible_shortfall");
  assert.equal(legal.noticeAllowance.amount, 3000000);
});

test("clear advised-resignation indicators do not auto-route to labor board", () => {
  const legal = getDismissalLegalContext({
    separationType: "advised_resignation",
    employmentStartDate: "2025-01-01",
    effectiveDate: "2026-08-01",
    workplaceEmployeeCount: 8,
    workerAcceptedRecommendation: true,
    resignationLetterSubmitted: true,
    pressureOrDeception: false,
  });

  assert.equal(legal.characterization.status, "agreed_termination_indicators");
  assert.equal(legal.laborBoardEligibleBaseline, false);
});

test("non-consensual advised resignation at five-plus workplace is routed to characterization/remedy review", () => {
  const legal = getDismissalLegalContext({
    separationType: "advised_resignation",
    employmentStartDate: "2025-01-01",
    effectiveDate: "2026-08-01",
    workplaceEmployeeCount: 8,
    workerAcceptedRecommendation: false,
    resignationLetterSubmitted: true,
    pressureOrDeception: true,
  });

  assert.equal(legal.characterization.status, "possible_involuntary_termination");
  assert.equal(legal.laborBoardEligibleBaseline, true);
});
