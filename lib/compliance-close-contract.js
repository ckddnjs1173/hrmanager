import crypto from "node:crypto";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export const COMPLIANCE_CLOSE_TIME_ZONE = "Asia/Seoul";
export const COMPLIANCE_CLOSE_STATUSES = Object.freeze(["OPEN", "CLOSED"]);

export function kstMonth(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("compliance_close_date_invalid");
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 7);
}

export function isValidPeriodMonth(value) {
  const text = String(value || "");
  if (!/^\d{4}-\d{2}$/.test(text)) return false;
  const [year, month] = text.split("-").map(Number);
  return year >= 2000 && month >= 1 && month <= 12;
}

export function normalizePeriodMonth(value, { now = new Date(), allowFuture = false } = {}) {
  const month = value || kstMonth(now);
  if (!isValidPeriodMonth(month)) throw new Error("compliance_close_month_invalid");
  if (!allowFuture && month > kstMonth(now)) throw new Error("compliance_close_future_month_invalid");
  return month;
}

export function periodMonthBounds(periodMonth) {
  if (!isValidPeriodMonth(periodMonth)) throw new Error("compliance_close_month_invalid");
  const [year, month] = periodMonth.split("-").map(Number);
  const startUtc = new Date(Date.UTC(year, month - 1, 1) - KST_OFFSET_MS);
  const endUtc = new Date(Date.UTC(year, month, 1) - KST_OFFSET_MS);
  return {
    periodMonth,
    timeZone: COMPLIANCE_CLOSE_TIME_ZONE,
    startAt: startUtc.toISOString(),
    endAtExclusive: endUtc.toISOString(),
  };
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

export function snapshotHash(snapshot) {
  return crypto.createHash("sha256").update(JSON.stringify(stable(snapshot))).digest("hex");
}

export function evaluateCloseReadiness(snapshot = {}) {
  const risk = snapshot.risks || {};
  const actions = snapshot.actions || {};
  const critical = Number(risk.CRITICAL || 0);
  const high = Number(risk.HIGH || 0);
  const activeRisks = Number(risk.activeTotal || 0);
  const activeActions = Number(actions.active || 0);
  const overdue = Number(actions.overdue || 0);
  const unresolvedCount = activeRisks + activeActions;
  const requiresAcknowledgement = unresolvedCount > 0;
  const requiresNote = critical > 0 || high > 0 || overdue > 0;
  return {
    unresolvedCount,
    requiresAcknowledgement,
    requiresNote,
    highImpactCount: critical + high + overdue,
    canCloseWithoutAcknowledgement: unresolvedCount === 0,
  };
}

export function validateCloseConfirmation({ snapshot, acknowledgeUnresolved = false, note = "" } = {}) {
  const readiness = evaluateCloseReadiness(snapshot);
  if (readiness.requiresAcknowledgement && acknowledgeUnresolved !== true) throw new Error("compliance_close_acknowledgement_required");
  if (readiness.requiresNote && !String(note || "").trim()) throw new Error("compliance_close_note_required");
  return readiness;
}
