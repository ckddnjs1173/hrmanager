export const WORKTIME_CASE_TYPE = "working_time_pay";

export const WORKTIME_EVIDENCE_KEYS = Object.freeze([
  "employmentContract",
  "attendanceRecord",
  "workSchedule",
  "payslip",
  "bankHistory",
]);

export const WORKTIME_HOUR_KEYS = Object.freeze([
  "weekdayOvertimeDayHours",
  "weekdayOvertimeNightHours",
  "holidayDayUpTo8Hours",
  "holidayNightUpTo8Hours",
  "holidayDayOver8Hours",
  "holidayNightOver8Hours",
]);

const EVIDENCE_STATES = new Set(["have", "planned", "missing", "unknown"]);

function cleanBoolean(value) {
  return typeof value === "boolean" ? value : null;
}

function cleanNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function isIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeEvidence(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const result = {};
  for (const key of WORKTIME_EVIDENCE_KEYS) {
    result[key] = EVIDENCE_STATES.has(source[key]) ? source[key] : "unknown";
  }
  return result;
}

export function normalizeWorktimeFacts(input = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const hours = {};
  for (const key of WORKTIME_HOUR_KEYS) hours[key] = cleanNumber(source[key]);
  return {
    referenceDate: isIsoDate(source.referenceDate) ? source.referenceDate : null,
    workplaceEmployeeCount: cleanNumber(source.workplaceEmployeeCount),
    standardWorkSystem: cleanBoolean(source.standardWorkSystem),
    ordinaryHourlyWage: cleanNumber(source.ordinaryHourlyWage),
    baseWageForExtraHoursPaid: cleanBoolean(source.baseWageForExtraHoursPaid),
    amountAlreadyPaid: cleanNumber(source.amountAlreadyPaid),
    maxWeeklyOvertimeHours: cleanNumber(source.maxWeeklyOvertimeHours),
    representativeDailyWorkHours: cleanNumber(source.representativeDailyWorkHours),
    representativeBreakMinutes: cleanNumber(source.representativeBreakMinutes),
    ...hours,
    evidence: normalizeEvidence(source.evidence),
  };
}

export function getWorktimeCoreMissingFacts(facts = {}) {
  const f = normalizeWorktimeFacts(facts);
  const missing = [];
  if (!f.referenceDate) missing.push("referenceDate");
  if (f.workplaceEmployeeCount === null) missing.push("workplaceEmployeeCount");
  if (f.standardWorkSystem === null) missing.push("standardWorkSystem");
  return missing;
}

export function getWorktimeMoneyMissingFacts(facts = {}) {
  const f = normalizeWorktimeFacts(facts);
  const missing = [];
  if (f.standardWorkSystem === false) return missing;
  if (f.ordinaryHourlyWage === null) missing.push("ordinaryHourlyWage");
  if (f.baseWageForExtraHoursPaid === null) missing.push("baseWageForExtraHoursPaid");
  if (f.amountAlreadyPaid === null) missing.push("amountAlreadyPaid");
  for (const key of WORKTIME_HOUR_KEYS) if (f[key] === null) missing.push(key);
  return missing;
}

export function detectWorktimeIssues(facts = {}) {
  const f = normalizeWorktimeFacts(facts);
  const issues = [];
  if (f.standardWorkSystem === false) issues.push("worktime.alternative_work_system_review");
  if (f.workplaceEmployeeCount !== null && f.workplaceEmployeeCount < 5) issues.push("worktime.small_workplace_scope");
  if (f.workplaceEmployeeCount !== null && f.workplaceEmployeeCount >= 5 && f.maxWeeklyOvertimeHours !== null && f.maxWeeklyOvertimeHours > 12) {
    issues.push("worktime.weekly_overtime_limit");
  }
  if (f.representativeDailyWorkHours !== null && f.representativeBreakMinutes !== null) {
    if (f.representativeDailyWorkHours >= 8 && f.representativeBreakMinutes < 60) issues.push("worktime.break_shortfall");
    else if (f.representativeDailyWorkHours >= 4 && f.representativeBreakMinutes < 30) issues.push("worktime.break_shortfall");
  }
  const totalCategorizedHours = WORKTIME_HOUR_KEYS.reduce((sum, key) => sum + (f[key] ?? 0), 0);
  if (totalCategorizedHours > 0) issues.push("worktime.premium_pay_review");
  return [...new Set(issues)];
}

export function getWorktimeEvidenceState(facts = {}) {
  const evidence = normalizeWorktimeFacts(facts).evidence;
  const values = Object.values(evidence);
  return {
    items: evidence,
    haveCount: values.filter((value) => value === "have").length,
    knownCount: values.filter((value) => value !== "unknown").length,
    totalCount: WORKTIME_EVIDENCE_KEYS.length,
  };
}

export function getWorktimeIntakeState(facts = {}) {
  const normalized = normalizeWorktimeFacts(facts);
  const missingCoreFacts = getWorktimeCoreMissingFacts(normalized);
  const missingMoneyFacts = getWorktimeMoneyMissingFacts(normalized);
  const evidence = getWorktimeEvidenceState(normalized);
  return {
    facts: normalized,
    coreComplete: missingCoreFacts.length === 0,
    missingCoreFacts,
    missingMoneyFacts,
    issues: detectWorktimeIssues(normalized),
    evidence,
    workspaceReady: missingCoreFacts.length === 0,
  };
}

export function createInitialWorktimeCase(facts = {}) {
  const state = getWorktimeIntakeState(facts);
  return {
    case_type: WORKTIME_CASE_TYPE,
    title: "근로시간·연장/야간/휴일수당 사건",
    status: state.workspaceReady ? "active" : "intake",
    event_date: state.facts.referenceDate,
    period_start: null,
    period_end: state.facts.referenceDate,
    facts: state.facts,
    missing_facts: [...state.missingCoreFacts, ...state.missingMoneyFacts],
    issues: state.issues,
    evidence: state.evidence.items,
    actions: [],
    calculations: [],
    legal_sources: [],
    documents: [],
    meta: { verticalSlice: "working-time-v1", supportedRegime: "standard_fixed_work_system" },
  };
}
