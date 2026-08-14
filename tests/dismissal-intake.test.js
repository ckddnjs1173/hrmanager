import test from "node:test";
import assert from "node:assert/strict";

import {
  detectDismissalIssues,
  getDismissalIntakeState,
  getDismissalQuestions,
} from "../lib/dismissal-intake.js";

test("dismissal core requires type, employment dates and workplace size", () => {
  const state = getDismissalIntakeState({ separationType: "dismissal" });
  assert.deepEqual(state.missingCoreFacts, ["employmentStartDate", "effectiveDate", "workplaceEmployeeCount"]);
  assert.equal(state.workspaceReady, false);
  assert.ok(getDismissalQuestions({ separationType: "dismissal" }, 3).length <= 3);
});

test("five-plus dismissal activates just-cause, written-notice and remedy issues", () => {
  const facts = {
    separationType: "dismissal",
    employmentStartDate: "2025-01-01",
    noticeDate: "2026-07-20",
    effectiveDate: "2026-08-01",
    workplaceEmployeeCount: 8,
    writtenNoticeReceived: false,
    noticePayPaid: false,
    employerReason: "업무성과",
  };
  const issues = detectDismissalIssues(facts);
  assert.ok(issues.includes("dismissal.just_cause_review"));
  assert.ok(issues.includes("dismissal.written_notice"));
  assert.ok(issues.includes("dismissal.notice_pay"));
  assert.ok(issues.includes("dismissal.remedy_deadline"));
});

test("small workplace is separated from five-plus unfair-dismissal route", () => {
  const issues = detectDismissalIssues({
    separationType: "dismissal",
    employmentStartDate: "2025-01-01",
    noticeDate: "2026-07-20",
    effectiveDate: "2026-08-01",
    workplaceEmployeeCount: 4,
    writtenNoticeReceived: false,
    noticePayPaid: false,
    employerReason: "업무성과",
  });

  assert.ok(issues.includes("dismissal.small_workplace_scope"));
  assert.ok(issues.includes("dismissal.notice_pay"));
  assert.equal(issues.includes("dismissal.just_cause_review"), false);
  assert.equal(issues.includes("dismissal.written_notice"), false);
  assert.equal(issues.includes("dismissal.remedy_deadline"), false);
});

test("advised resignation with non-consent or pressure stays a characterization issue", () => {
  const issues = detectDismissalIssues({
    separationType: "advised_resignation",
    employmentStartDate: "2025-01-01",
    effectiveDate: "2026-08-01",
    workplaceEmployeeCount: 8,
    workerAcceptedRecommendation: false,
    resignationLetterSubmitted: true,
    pressureOrDeception: true,
  });
  assert.ok(issues.includes("dismissal.characterization"));
  assert.ok(issues.includes("dismissal.possible_involuntary_termination"));
});
