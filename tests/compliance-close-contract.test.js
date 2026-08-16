import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateCloseReadiness,
  kstMonth,
  normalizePeriodMonth,
  periodMonthBounds,
  snapshotHash,
  validateCloseConfirmation,
} from "../lib/compliance-close-contract.js";

const NOW = new Date("2026-08-16T01:00:00.000Z");

test("Monthly Close uses Asia/Seoul calendar months", () => {
  assert.equal(kstMonth(NOW), "2026-08");
  assert.deepEqual(periodMonthBounds("2026-08"), {
    periodMonth: "2026-08",
    timeZone: "Asia/Seoul",
    startAt: "2026-07-31T15:00:00.000Z",
    endAtExclusive: "2026-08-31T15:00:00.000Z",
  });
  assert.equal(normalizePeriodMonth(undefined, { now: NOW }), "2026-08");
  assert.throws(() => normalizePeriodMonth("2026-09", { now: NOW }), /compliance_close_future_month_invalid/);
  assert.throws(() => normalizePeriodMonth("2026-13", { now: NOW }), /compliance_close_month_invalid/);
});

test("snapshot hash is stable across object key ordering", () => {
  const left = { period: "2026-08", risks: { HIGH: 1, CRITICAL: 0 }, actions: [{ id: "a1", status: "OPEN" }] };
  const right = { actions: [{ status: "OPEN", id: "a1" }], risks: { CRITICAL: 0, HIGH: 1 }, period: "2026-08" };
  assert.equal(snapshotHash(left), snapshotHash(right));
});

test("readiness counts unique active Risks and Actions, not severity dimensions twice", () => {
  const readiness = evaluateCloseReadiness({
    risks: { activeTotal: 2, CRITICAL: 0, HIGH: 1, uncertain: 2 },
    actions: { active: 3, overdue: 1 },
  });
  assert.equal(readiness.unresolvedCount, 5);
  assert.equal(readiness.requiresAcknowledgement, true);
  assert.equal(readiness.requiresNote, true);
  assert.equal(readiness.highImpactCount, 2);
});

test("unresolved close requires acknowledgment and high-impact close also requires note", () => {
  const snapshot = { risks: { activeTotal: 1, HIGH: 1 }, actions: { active: 1, overdue: 0 } };
  assert.throws(() => validateCloseConfirmation({ snapshot }), /compliance_close_acknowledgement_required/);
  assert.throws(() => validateCloseConfirmation({ snapshot, acknowledgeUnresolved: true }), /compliance_close_note_required/);
  const readiness = validateCloseConfirmation({ snapshot, acknowledgeUnresolved: true, note: "미해결 위험 확인 후 후속조치 예정" });
  assert.equal(readiness.unresolvedCount, 2);
});

test("clean month can close without artificial acknowledgment", () => {
  const readiness = validateCloseConfirmation({ snapshot: { risks: { activeTotal: 0 }, actions: { active: 0, overdue: 0 } } });
  assert.equal(readiness.canCloseWithoutAcknowledgement, true);
  assert.equal(readiness.requiresNote, false);
});
