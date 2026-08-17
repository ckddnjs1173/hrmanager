export const BUSINESS_CASE_STATUSES = Object.freeze(["DRAFT", "OPEN", "RESOLVED", "ARCHIVED"]);
export const BUSINESS_CASE_SHAREABLE_STATUSES = Object.freeze(["OPEN", "RESOLVED"]);

export function normalizeBusinessCaseTitle(value) {
  const title = String(value || "").trim().replace(/\s+/g, " ");
  if (!title) throw new Error("business_case_title_required");
  if (title.length > 200) throw new Error("business_case_title_too_long");
  return title;
}

export function normalizeBusinessCaseSummary(value) {
  const summary = String(value || "").trim();
  if (summary.length > 5000) throw new Error("business_case_summary_too_long");
  return summary;
}

export function canTransitionBusinessCase(fromStatus, toStatus) {
  if (fromStatus === "DRAFT" && ["OPEN", "ARCHIVED"].includes(toStatus)) return true;
  if (fromStatus === "OPEN" && ["RESOLVED", "ARCHIVED"].includes(toStatus)) return true;
  if (fromStatus === "RESOLVED" && ["OPEN", "ARCHIVED"].includes(toStatus)) return true;
  return false;
}

export function businessCaseTransitionEvent(fromStatus, toStatus) {
  if (fromStatus === "DRAFT" && toStatus === "OPEN") return "OPENED";
  if (fromStatus === "OPEN" && toStatus === "RESOLVED") return "RESOLVED";
  if (fromStatus === "RESOLVED" && toStatus === "OPEN") return "REOPENED";
  if (toStatus === "ARCHIVED") return "ARCHIVED";
  throw new Error("business_case_transition_invalid");
}

export function isBusinessCaseShareable(status) {
  return BUSINESS_CASE_SHAREABLE_STATUSES.includes(status);
}
