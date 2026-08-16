import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyActionDeadline,
  kstDateOnly,
  kstEndOfDayIso,
  normalizeCalendarRange,
  summarizeCalendarEvents,
} from "../lib/compliance-calendar-contract.js";

const NOW = new Date("2026-08-16T01:00:00.000Z"); // 2026-08-16 10:00 KST

test("KST business calendar keeps date-only deadlines stable", () => {
  assert.equal(kstDateOnly(NOW), "2026-08-16");
  assert.equal(kstEndOfDayIso("2026-08-16"), "2026-08-16T14:59:59.999Z");
  assert.throws(() => kstEndOfDayIso("2026-02-30"), /compliance_action_due_date_invalid/);
});

test("Action deadline timing classification is deterministic in Asia/Seoul", () => {
  assert.equal(classifyActionDeadline({ dueAt: kstEndOfDayIso("2026-08-15"), status: "OPEN", now: NOW }), "OVERDUE");
  assert.equal(classifyActionDeadline({ dueAt: kstEndOfDayIso("2026-08-16"), status: "OPEN", now: NOW }), "DUE_TODAY");
  assert.equal(classifyActionDeadline({ dueAt: kstEndOfDayIso("2026-08-23"), status: "IN_PROGRESS", now: NOW }), "NEXT_7_DAYS");
  assert.equal(classifyActionDeadline({ dueAt: kstEndOfDayIso("2026-08-24"), status: "BLOCKED", now: NOW }), "SCHEDULED");
  assert.equal(classifyActionDeadline({ dueAt: kstEndOfDayIso("2026-08-15"), status: "DONE", now: NOW }), "COMPLETED");
  assert.equal(classifyActionDeadline({ dueAt: kstEndOfDayIso("2026-08-15"), status: "DISMISSED", now: NOW }), "DISMISSED");
  assert.equal(classifyActionDeadline({ dueAt: null, status: "OPEN", now: NOW }), "UNSCHEDULED");
});

test("Calendar range defaults and maximum window are bounded", () => {
  assert.deepEqual(normalizeCalendarRange({ now: NOW }), {
    from: "2026-08-16",
    to: "2026-09-15",
    today: "2026-08-16",
    timeZone: "Asia/Seoul",
  });
  assert.throws(() => normalizeCalendarRange({ from: "2026-09-01", to: "2026-08-01", now: NOW }), /calendar_range_invalid/);
  assert.throws(() => normalizeCalendarRange({ from: "2026-01-01", to: "2027-01-03", now: NOW }), /calendar_range_too_large/);
});

test("Calendar summary separates overdue, today, near-term and scheduled", () => {
  assert.deepEqual(summarizeCalendarEvents([
    { timingStatus: "OVERDUE" },
    { timingStatus: "OVERDUE" },
    { timingStatus: "DUE_TODAY" },
    { timingStatus: "NEXT_7_DAYS" },
    { timingStatus: "SCHEDULED" },
  ]), { overdue: 2, dueToday: 1, next7Days: 1, scheduled: 1 });
});
