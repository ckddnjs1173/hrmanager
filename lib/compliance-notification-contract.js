import { daysBetween, kstDateOnly } from "./compliance-calendar-contract.js";

export const DEADLINE_NOTIFICATION_KEYS = Object.freeze({
  DUE_7D: "ACTION_DUE_7D",
  DUE_3D: "ACTION_DUE_3D",
  DUE_1D: "ACTION_DUE_1D",
  DUE_TODAY: "ACTION_DUE_TODAY",
  OVERDUE: "ACTION_OVERDUE",
});

export const DEADLINE_NOTIFICATION_RECIPIENT_ROLES = Object.freeze(["OWNER", "HR_ADMIN"]);
export const DEADLINE_NOTIFICATION_CHANNEL = "IN_APP";

const MILESTONE_BY_DAYS = new Map([
  [7, DEADLINE_NOTIFICATION_KEYS.DUE_7D],
  [3, DEADLINE_NOTIFICATION_KEYS.DUE_3D],
  [1, DEADLINE_NOTIFICATION_KEYS.DUE_1D],
  [0, DEADLINE_NOTIFICATION_KEYS.DUE_TODAY],
]);

export function deadlineNotificationKey({ dueAt, now = new Date() } = {}) {
  if (!dueAt) return null;
  const dueDate = kstDateOnly(dueAt);
  const today = kstDateOnly(now);
  const daysRemaining = daysBetween(today, dueDate);
  if (daysRemaining < 0) return DEADLINE_NOTIFICATION_KEYS.OVERDUE;
  return MILESTONE_BY_DAYS.get(daysRemaining) || null;
}

export function deadlineNotificationSeverity(key) {
  if (key === DEADLINE_NOTIFICATION_KEYS.OVERDUE) return "CRITICAL";
  if (key === DEADLINE_NOTIFICATION_KEYS.DUE_TODAY || key === DEADLINE_NOTIFICATION_KEYS.DUE_1D) return "WARNING";
  return "INFO";
}

export function deadlineSourceLabel(source) {
  return source === "MANUAL_INTERNAL" ? "내부 관리 기한" : "관리 기한";
}

export function buildDeadlineNotification({ actionTitle, dueAt, dueDateSource, notificationKey } = {}) {
  const title = String(actionTitle || "노무 조치").trim() || "노무 조치";
  const dueDate = kstDateOnly(dueAt);
  const sourceLabel = deadlineSourceLabel(dueDateSource);
  const suffix = {
    [DEADLINE_NOTIFICATION_KEYS.DUE_7D]: "7일 남았습니다.",
    [DEADLINE_NOTIFICATION_KEYS.DUE_3D]: "3일 남았습니다.",
    [DEADLINE_NOTIFICATION_KEYS.DUE_1D]: "내일입니다.",
    [DEADLINE_NOTIFICATION_KEYS.DUE_TODAY]: "오늘입니다.",
    [DEADLINE_NOTIFICATION_KEYS.OVERDUE]: "지났습니다.",
  }[notificationKey];
  if (!suffix) throw new Error("notification_key_invalid");
  return {
    title: notificationKey === DEADLINE_NOTIFICATION_KEYS.OVERDUE ? `기한이 지난 조치 · ${title}` : `조치 기한 알림 · ${title}`,
    body: `${sourceLabel} ${dueDate}까지 ${suffix}`,
    severity: deadlineNotificationSeverity(notificationKey),
    metadata: { dueDate, dueDateSource: dueDateSource || null, sourceLabel },
  };
}

export function deadlineNotificationDedupKey({ organizationId, recipientUserId, actionId, dueDate, notificationKey, channel = DEADLINE_NOTIFICATION_CHANNEL } = {}) {
  for (const value of [organizationId, recipientUserId, actionId, dueDate, notificationKey, channel]) {
    if (!String(value || "").trim()) throw new Error("notification_dedup_input_required");
  }
  return [channel, organizationId, recipientUserId, "COMPLIANCE_ACTION", actionId, dueDate, notificationKey].join(":");
}
