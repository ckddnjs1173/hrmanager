import test from "node:test";
import assert from "node:assert/strict";
import { kstEndOfDayIso } from "../lib/compliance-calendar-contract.js";
import {
  DEADLINE_NOTIFICATION_KEYS,
  buildDeadlineNotification,
  deadlineNotificationDedupKey,
  deadlineNotificationKey,
  deadlineNotificationSeverity,
} from "../lib/compliance-notification-contract.js";
import { runComplianceNotificationSchedulerSweep } from "../lib/notification-scheduler.js";

const NOW = new Date("2026-08-16T01:00:00.000Z"); // 10:00 KST

test("deadline notifications fire only on deterministic milestones", () => {
  const due = (date) => kstEndOfDayIso(date);
  assert.equal(deadlineNotificationKey({ dueAt: due("2026-08-23"), now: NOW }), DEADLINE_NOTIFICATION_KEYS.DUE_7D);
  assert.equal(deadlineNotificationKey({ dueAt: due("2026-08-19"), now: NOW }), DEADLINE_NOTIFICATION_KEYS.DUE_3D);
  assert.equal(deadlineNotificationKey({ dueAt: due("2026-08-17"), now: NOW }), DEADLINE_NOTIFICATION_KEYS.DUE_1D);
  assert.equal(deadlineNotificationKey({ dueAt: due("2026-08-16"), now: NOW }), DEADLINE_NOTIFICATION_KEYS.DUE_TODAY);
  assert.equal(deadlineNotificationKey({ dueAt: due("2026-08-15"), now: NOW }), DEADLINE_NOTIFICATION_KEYS.OVERDUE);
  assert.equal(deadlineNotificationKey({ dueAt: due("2026-08-22"), now: NOW }), null);
  assert.equal(deadlineNotificationKey({ dueAt: null, now: NOW }), null);
});

test("overdue is critical while imminent deadlines are warning-level", () => {
  assert.equal(deadlineNotificationSeverity(DEADLINE_NOTIFICATION_KEYS.OVERDUE), "CRITICAL");
  assert.equal(deadlineNotificationSeverity(DEADLINE_NOTIFICATION_KEYS.DUE_TODAY), "WARNING");
  assert.equal(deadlineNotificationSeverity(DEADLINE_NOTIFICATION_KEYS.DUE_1D), "WARNING");
  assert.equal(deadlineNotificationSeverity(DEADLINE_NOTIFICATION_KEYS.DUE_3D), "INFO");
});

test("manual dates are never worded as statutory deadlines", () => {
  const message = buildDeadlineNotification({
    actionTitle: "최저임금 검토",
    dueAt: kstEndOfDayIso("2026-08-19"),
    dueDateSource: "MANUAL_INTERNAL",
    notificationKey: DEADLINE_NOTIFICATION_KEYS.DUE_3D,
  });
  assert.match(message.body, /내부 관리 기한/);
  assert.doesNotMatch(message.body, /법정기한|법적 마감/);
  assert.equal(message.metadata.dueDate, "2026-08-19");
});

test("dedup key is stable per recipient, action, due date and milestone", () => {
  const input = {
    organizationId: "org_1",
    recipientUserId: "usr_1",
    actionId: "act_1",
    dueDate: "2026-08-19",
    notificationKey: DEADLINE_NOTIFICATION_KEYS.DUE_3D,
  };
  assert.equal(deadlineNotificationDedupKey(input), deadlineNotificationDedupKey(input));
  assert.notEqual(deadlineNotificationDedupKey(input), deadlineNotificationDedupKey({ ...input, dueDate: "2026-08-20" }));
  assert.notEqual(deadlineNotificationDedupKey(input), deadlineNotificationDedupKey({ ...input, recipientUserId: "usr_2" }));
});

test("scheduler is a no-op while SaaS is disabled", async () => {
  const warnings = [];
  const result = await runComplianceNotificationSchedulerSweep({
    env: { SAAS_ENABLED: "0", STORAGE_DRIVER: "sqlite" },
    log() {},
    warn: (value) => warnings.push(value),
    now: NOW,
  });
  assert.deepEqual(result, { skipped: true, reason: "saas_disabled" });
  assert.deepEqual(warnings, []);
});
