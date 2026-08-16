const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const BUSINESS_CALENDAR_TIME_ZONE = "Asia/Seoul";
export const ACTIVE_ACTION_STATUSES = Object.freeze(["OPEN", "IN_PROGRESS", "BLOCKED"]);

export function isValidDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function kstDateOnly(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("calendar_date_invalid");
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function kstEndOfDayIso(dateOnly) {
  if (!isValidDateOnly(dateOnly)) throw new Error("compliance_action_due_date_invalid");
  return new Date(`${dateOnly}T14:59:59.999Z`).toISOString();
}

export function addDays(dateOnly, days) {
  if (!isValidDateOnly(dateOnly) || !Number.isInteger(days)) throw new Error("calendar_date_invalid");
  return new Date(Date.parse(`${dateOnly}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(fromDate, toDate) {
  if (!isValidDateOnly(fromDate) || !isValidDateOnly(toDate)) throw new Error("calendar_date_invalid");
  return Math.round((Date.parse(`${toDate}T00:00:00.000Z`) - Date.parse(`${fromDate}T00:00:00.000Z`)) / DAY_MS);
}

export function normalizeCalendarRange({ from, to, now = new Date(), maxDays = 366 } = {}) {
  const today = kstDateOnly(now);
  const normalizedFrom = from || today;
  const normalizedTo = to || addDays(normalizedFrom, 30);
  if (!isValidDateOnly(normalizedFrom) || !isValidDateOnly(normalizedTo) || normalizedFrom > normalizedTo) {
    throw new Error("calendar_range_invalid");
  }
  if (daysBetween(normalizedFrom, normalizedTo) > maxDays) throw new Error("calendar_range_too_large");
  return { from: normalizedFrom, to: normalizedTo, today, timeZone: BUSINESS_CALENDAR_TIME_ZONE };
}

export function classifyActionDeadline({ dueAt, status, now = new Date() } = {}) {
  if (status === "DONE") return "COMPLETED";
  if (status === "DISMISSED") return "DISMISSED";
  if (!dueAt) return "UNSCHEDULED";
  const dueDate = kstDateOnly(dueAt);
  const today = kstDateOnly(now);
  if (dueDate < today) return "OVERDUE";
  if (dueDate === today) return "DUE_TODAY";
  if (daysBetween(today, dueDate) <= 7) return "NEXT_7_DAYS";
  return "SCHEDULED";
}

export function summarizeCalendarEvents(events = []) {
  const summary = { overdue: 0, dueToday: 0, next7Days: 0, scheduled: 0 };
  for (const event of events) {
    if (event.timingStatus === "OVERDUE") summary.overdue += 1;
    else if (event.timingStatus === "DUE_TODAY") summary.dueToday += 1;
    else if (event.timingStatus === "NEXT_7_DAYS") summary.next7Days += 1;
    else if (event.timingStatus === "SCHEDULED") summary.scheduled += 1;
  }
  return summary;
}
