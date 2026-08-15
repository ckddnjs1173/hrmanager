export const ANNUAL_LEAVE_CASE_TYPE = "annual_leave";

export const ANNUAL_LEAVE_EVIDENCE_KEYS = Object.freeze([
  "employmentContract",
  "attendanceRecord",
  "leaveLedger",
  "promotionNotices",
  "payslip",
  "bankHistory",
]);

const EVIDENCE_STATES = new Set(["have", "planned", "missing", "unknown"]);
const EMPLOYMENT_STATUSES = new Set(["current", "ended"]);

function cleanBoolean(value) {
  return typeof value === "boolean" ? value : null;
}

function cleanNumber(value, { max = Infinity } = {}) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
}

function cleanInteger(value, options = {}) {
  const n = cleanNumber(value, options);
  return n !== null && Number.isInteger(n) ? n : null;
}

function isIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeEvidence(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const result = {};
  for (const key of ANNUAL_LEAVE_EVIDENCE_KEYS) result[key] = EVIDENCE_STATES.has(source[key]) ? source[key] : "unknown";
  return result;
}

export function normalizeAnnualLeaveFacts(input = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  return {
    referenceDate: isIsoDate(source.referenceDate) ? source.referenceDate : null,
    employmentStartDate: isIsoDate(source.employmentStartDate) ? source.employmentStartDate : null,
    employmentStatus: EMPLOYMENT_STATUSES.has(source.employmentStatus) ? source.employmentStatus : null,
    employmentEndDate: isIsoDate(source.employmentEndDate) ? source.employmentEndDate : null,
    workplaceEmployeeCount: cleanInteger(source.workplaceEmployeeCount),
    fivePlusContinuouslyPastYear: cleanBoolean(source.fivePlusContinuouslyPastYear),
    averageWeeklyScheduledHours: cleanNumber(source.averageWeeklyScheduledHours),
    attendanceRatePercent: cleanNumber(source.attendanceRatePercent, { max: 100 }),
    fullAttendanceMonthsPreviousYear: cleanInteger(source.fullAttendanceMonthsPreviousYear, { max: 12 }),
    claimedUnusedDays: cleanNumber(source.claimedUnusedDays),
    dailyLeavePayAmount: cleanNumber(source.dailyLeavePayAmount),
    amountAlreadyPaid: cleanNumber(source.amountAlreadyPaid),
    usePromotionImplemented: cleanBoolean(source.usePromotionImplemented),
    employerPreventedUse: cleanBoolean(source.employerPreventedUse),
    evidence: normalizeEvidence(source.evidence),
  };
}

export function getAnnualLeaveCoreMissingFacts(facts = {}) {
  const f = normalizeAnnualLeaveFacts(facts);
  const missing = [];
  if (!f.referenceDate) missing.push("referenceDate");
  if (!f.employmentStartDate) missing.push("employmentStartDate");
  if (!f.employmentStatus) missing.push("employmentStatus");
  if (f.employmentStatus === "ended" && !f.employmentEndDate) missing.push("employmentEndDate");
  if (f.workplaceEmployeeCount === null) missing.push("workplaceEmployeeCount");
  if (f.averageWeeklyScheduledHours === null) missing.push("averageWeeklyScheduledHours");
  return missing;
}

export function getAnnualLeaveMoneyMissingFacts(facts = {}) {
  const f = normalizeAnnualLeaveFacts(facts);
  const missing = [];
  if (f.claimedUnusedDays === null) missing.push("claimedUnusedDays");
  if (f.dailyLeavePayAmount === null) missing.push("dailyLeavePayAmount");
  if (f.amountAlreadyPaid === null) missing.push("amountAlreadyPaid");
  if (f.usePromotionImplemented === null) missing.push("usePromotionImplemented");
  if (f.employerPreventedUse === null) missing.push("employerPreventedUse");
  return missing;
}

export function getAnnualLeaveEvidenceState(facts = {}) {
  const evidence = normalizeAnnualLeaveFacts(facts).evidence;
  const values = Object.values(evidence);
  return {
    items: evidence,
    haveCount: values.filter((value) => value === "have").length,
    knownCount: values.filter((value) => value !== "unknown").length,
    totalCount: ANNUAL_LEAVE_EVIDENCE_KEYS.length,
  };
}

export function detectAnnualLeaveIssues(facts = {}) {
  const f = normalizeAnnualLeaveFacts(facts);
  const issues = [];
  if (f.averageWeeklyScheduledHours !== null && f.averageWeeklyScheduledHours < 15) issues.push("annual_leave.under_15_hours_scope");
  if (f.workplaceEmployeeCount !== null && f.workplaceEmployeeCount < 5) issues.push("annual_leave.small_workplace_scope");
  if (f.claimedUnusedDays !== null && f.claimedUnusedDays > 0) issues.push("annual_leave.unused_allowance_review");
  if (f.usePromotionImplemented === true) issues.push("annual_leave.use_promotion_review");
  if (f.employerPreventedUse === true) issues.push("annual_leave.employer_prevented_use");
  return [...new Set(issues)];
}

export function getAnnualLeaveIntakeState(facts = {}) {
  const normalized = normalizeAnnualLeaveFacts(facts);
  const missingCoreFacts = getAnnualLeaveCoreMissingFacts(normalized);
  const missingMoneyFacts = getAnnualLeaveMoneyMissingFacts(normalized);
  const evidence = getAnnualLeaveEvidenceState(normalized);
  return {
    facts: normalized,
    coreComplete: missingCoreFacts.length === 0,
    missingCoreFacts,
    missingMoneyFacts,
    issues: detectAnnualLeaveIssues(normalized),
    evidence,
    workspaceReady: missingCoreFacts.length === 0,
  };
}

export function createInitialAnnualLeaveCase(facts = {}) {
  const state = getAnnualLeaveIntakeState(facts);
  return {
    case_type: ANNUAL_LEAVE_CASE_TYPE,
    title: "연차유급휴가·미사용수당 사건",
    status: state.workspaceReady ? "active" : "intake",
    event_date: state.facts.referenceDate,
    period_start: state.facts.employmentStartDate,
    period_end: state.facts.employmentEndDate || state.facts.referenceDate,
    employment_start_date: state.facts.employmentStartDate,
    employment_end_date: state.facts.employmentEndDate,
    facts: state.facts,
    missing_facts: [...state.missingCoreFacts, ...state.missingMoneyFacts],
    issues: state.issues,
    evidence: state.evidence.items,
    actions: [],
    calculations: [],
    legal_sources: [],
    documents: [],
    meta: { verticalSlice: "annual-leave-v1", calculationScope: "latest-grant-and-user-confirmed-unused-days" },
  };
}
