// Business compliance action lifecycle.
// Risk Finding은 "무엇이 위험한가"를 설명하고, Compliance Action은
// "누가 무엇을 언제까지 끝낼 것인가"를 추적한다.

export const COMPLIANCE_ACTION_STATUSES = Object.freeze([
  "OPEN",
  "IN_PROGRESS",
  "BLOCKED",
  "DONE",
  "DISMISSED",
]);

export const COMPLIANCE_ACTION_TRANSITIONS = Object.freeze({
  OPEN: Object.freeze(["IN_PROGRESS", "BLOCKED", "DONE", "DISMISSED"]),
  IN_PROGRESS: Object.freeze(["OPEN", "BLOCKED", "DONE", "DISMISSED"]),
  BLOCKED: Object.freeze(["OPEN", "IN_PROGRESS", "DISMISSED"]),
  DONE: Object.freeze(["OPEN"]),
  DISMISSED: Object.freeze(["OPEN"]),
});

export const ACTION_EVENT_TYPES = Object.freeze([
  "CREATED",
  "ASSIGNED",
  "UNASSIGNED",
  "STARTED",
  "BLOCKED",
  "UNBLOCKED",
  "COMPLETED",
  "REOPENED",
  "DISMISSED",
  "DUE_DATE_CHANGED",
  "NOTE_ADDED",
  "DOCUMENT_LINKED",
  "CASE_LINKED",
  "EVIDENCE_LINKED",
]);

export const ACTION_ORIGINS = Object.freeze([
  "RISK_FINDING",
  "BUSINESS_CASE",
  "ONBOARDING",
  "MANUAL",
  "LEGAL_CHANGE",
  "MONTHLY_CLOSE",
]);

export const ACTION_PRIORITIES = Object.freeze(["CRITICAL", "HIGH", "MEDIUM", "INFO"]);

export function canTransitionComplianceAction(from, to) {
  return Array.isArray(COMPLIANCE_ACTION_TRANSITIONS[from]) && COMPLIANCE_ACTION_TRANSITIONS[from].includes(to);
}

export function assertComplianceActionTransition(from, to, context = {}) {
  if (!COMPLIANCE_ACTION_STATUSES.includes(from) || !COMPLIANCE_ACTION_STATUSES.includes(to)) {
    throw new Error("compliance_action_status_invalid");
  }
  if (!canTransitionComplianceAction(from, to)) {
    throw new Error(`compliance_action_transition_denied:${from}:${to}`);
  }
  if (to === "BLOCKED" && !String(context.blockedReason || "").trim()) {
    throw new Error("compliance_action_blocked_reason_required");
  }
  if (to === "DISMISSED" && !String(context.dismissedReason || "").trim()) {
    throw new Error("compliance_action_dismissed_reason_required");
  }
  if (to === "DONE" && context.completionRequired === true && context.completionSatisfied !== true) {
    throw new Error("compliance_action_completion_requirement_unsatisfied");
  }
  return true;
}

export function deriveActionEventType(from, to) {
  if (to === "IN_PROGRESS" && from !== "BLOCKED") return "STARTED";
  if (to === "BLOCKED") return "BLOCKED";
  if (from === "BLOCKED" && ["OPEN", "IN_PROGRESS"].includes(to)) return "UNBLOCKED";
  if (to === "DONE") return "COMPLETED";
  if (["DONE", "DISMISSED"].includes(from) && to === "OPEN") return "REOPENED";
  if (to === "DISMISSED") return "DISMISSED";
  return "NOTE_ADDED";
}

export function normalizeActionPriority(value) {
  return ACTION_PRIORITIES.includes(value) ? value : "MEDIUM";
}

export function isActiveComplianceAction(status) {
  return ["OPEN", "IN_PROGRESS", "BLOCKED"].includes(status);
}

export function isClosedComplianceAction(status) {
  return ["DONE", "DISMISSED"].includes(status);
}

export function isOverdueComplianceAction(action, now = new Date()) {
  if (!action || !isActiveComplianceAction(action.status) || !action.dueAt) return false;
  const due = Date.parse(action.dueAt);
  const current = now instanceof Date ? now.getTime() : Date.parse(String(now));
  return Number.isFinite(due) && Number.isFinite(current) && due < current;
}
