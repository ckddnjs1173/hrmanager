export const RETIREMENT_CASE_TYPE = "retirement_benefit";

export const RETIREMENT_EVIDENCE_KEYS = Object.freeze([
  "employmentContract",
  "payslips3m",
  "bankHistory",
  "retirementPlanStatement",
  "attendanceRecord",
]);

const EVIDENCE_STATES = new Set(["have", "planned", "missing", "unknown"]);
const BENEFIT_TYPES = new Set(["severance_pay", "db_pension", "dc_pension", "unknown"]);

function cleanString(value) {
  return typeof value === "string" ? value.trim() : value;
}

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
  for (const key of RETIREMENT_EVIDENCE_KEYS) {
    result[key] = EVIDENCE_STATES.has(source[key]) ? source[key] : "unknown";
  }
  return result;
}

export function normalizeRetirementFacts(input = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  return {
    benefitType: BENEFIT_TYPES.has(source.benefitType) ? source.benefitType : null,
    employmentStartDate: isIsoDate(source.employmentStartDate) ? source.employmentStartDate : cleanString(source.employmentStartDate) || null,
    retirementDate: isIsoDate(source.retirementDate) ? source.retirementDate : cleanString(source.retirementDate) || null,
    averageWeeklyScheduledHours: cleanNumber(source.averageWeeklyScheduledHours),
    hadUnder15HourPeriods: cleanBoolean(source.hadUnder15HourPeriods),
    qualifyingServiceDays: cleanNumber(source.qualifyingServiceDays),
    hasAverageWageExcludedPeriod: cleanBoolean(source.hasAverageWageExcludedPeriod),
    adjustedAverageDailyWage: cleanNumber(source.adjustedAverageDailyWage),
    threeMonthWageTotal: cleanNumber(source.threeMonthWageTotal),
    annualBonusTotal12m: cleanNumber(source.annualBonusTotal12m),
    annualLeaveAllowanceForAverageWage: cleanNumber(source.annualLeaveAllowanceForAverageWage),
    ordinaryDailyWage: cleanNumber(source.ordinaryDailyWage),
    amountAlreadyPaid: cleanNumber(source.amountAlreadyPaid),
    dcExpectedContributionsTotal: cleanNumber(source.dcExpectedContributionsTotal),
    dcPaidContributionsTotal: cleanNumber(source.dcPaidContributionsTotal),
    paymentDate: isIsoDate(source.paymentDate) ? source.paymentDate : cleanString(source.paymentDate) || null,
    evidence: normalizeEvidence(source.evidence),
  };
}

function dateMs(value) {
  if (!isIsoDate(value)) return null;
  return Date.parse(`${value}T00:00:00Z`);
}

export function serviceDaysBetween(start, retirementDate) {
  const a = dateMs(start);
  const b = dateMs(retirementDate);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  return Math.floor((b - a) / 86400000);
}

export function getRetirementCoreMissingFacts(facts = {}) {
  const f = normalizeRetirementFacts(facts);
  const missing = [];
  if (!f.benefitType) missing.push("benefitType");
  if (!isIsoDate(f.employmentStartDate)) missing.push("employmentStartDate");
  if (!isIsoDate(f.retirementDate)) missing.push("retirementDate");
  if (f.averageWeeklyScheduledHours === null) missing.push("averageWeeklyScheduledHours");
  if (f.hadUnder15HourPeriods === null) missing.push("hadUnder15HourPeriods");
  if (f.hadUnder15HourPeriods === true && f.qualifyingServiceDays === null) missing.push("qualifyingServiceDays");
  return missing;
}

export function getRetirementMoneyMissingFacts(facts = {}) {
  const f = normalizeRetirementFacts(facts);
  const missing = [];
  if (["severance_pay", "db_pension"].includes(f.benefitType)) {
    if (f.hasAverageWageExcludedPeriod === null) missing.push("hasAverageWageExcludedPeriod");
    if (f.hasAverageWageExcludedPeriod === true) {
      if (f.adjustedAverageDailyWage === null) missing.push("adjustedAverageDailyWage");
    } else if (f.hasAverageWageExcludedPeriod === false) {
      if (f.threeMonthWageTotal === null) missing.push("threeMonthWageTotal");
      if (f.annualBonusTotal12m === null) missing.push("annualBonusTotal12m");
      if (f.annualLeaveAllowanceForAverageWage === null) missing.push("annualLeaveAllowanceForAverageWage");
    }
    if (f.ordinaryDailyWage === null) missing.push("ordinaryDailyWage");
    if (f.amountAlreadyPaid === null) missing.push("amountAlreadyPaid");
  }
  if (f.benefitType === "dc_pension") {
    if (f.dcExpectedContributionsTotal === null) missing.push("dcExpectedContributionsTotal");
    if (f.dcPaidContributionsTotal === null) missing.push("dcPaidContributionsTotal");
  }
  return missing;
}

export function detectRetirementIssues(facts = {}) {
  const f = normalizeRetirementFacts(facts);
  const issues = [];
  const serviceDays = serviceDaysBetween(f.employmentStartDate, f.retirementDate);
  const qualifyingDays = f.hadUnder15HourPeriods === true ? f.qualifyingServiceDays : serviceDays;

  if (f.benefitType === "unknown") issues.push("retirement.plan_type_unknown");
  if (serviceDays !== null && serviceDays < 365) issues.push("retirement.under_one_year");
  if (f.hadUnder15HourPeriods === false && f.averageWeeklyScheduledHours !== null && f.averageWeeklyScheduledHours < 15) {
    issues.push("retirement.under_15_hours");
  }
  if (f.hadUnder15HourPeriods === true) issues.push("retirement.mixed_weekly_hours");
  if (qualifyingDays !== null && qualifyingDays < 365) issues.push("retirement.qualifying_service_under_one_year");
  if (f.hasAverageWageExcludedPeriod === true) issues.push("retirement.average_wage_excluded_period");
  if (f.benefitType === "dc_pension") issues.push("retirement.dc_contribution_review");
  if (["severance_pay", "db_pension"].includes(f.benefitType)) issues.push("retirement.average_wage_calculation");
  return [...new Set(issues)];
}

export function getRetirementEvidenceState(facts = {}) {
  const evidence = normalizeRetirementFacts(facts).evidence;
  const values = Object.values(evidence);
  return {
    items: evidence,
    haveCount: values.filter((value) => value === "have").length,
    knownCount: values.filter((value) => value !== "unknown").length,
    totalCount: RETIREMENT_EVIDENCE_KEYS.length,
  };
}

export function getRetirementIntakeState(facts = {}) {
  const normalized = normalizeRetirementFacts(facts);
  const missingCoreFacts = getRetirementCoreMissingFacts(normalized);
  const missingMoneyFacts = getRetirementMoneyMissingFacts(normalized);
  const evidence = getRetirementEvidenceState(normalized);
  return {
    facts: normalized,
    coreComplete: missingCoreFacts.length === 0,
    missingCoreFacts,
    missingMoneyFacts,
    issues: detectRetirementIssues(normalized),
    evidence,
    workspaceReady: missingCoreFacts.length === 0,
  };
}

export function createInitialRetirementCase(facts = {}) {
  const state = getRetirementIntakeState(facts);
  return {
    case_type: RETIREMENT_CASE_TYPE,
    title: "퇴직금·퇴직연금 사건",
    status: state.workspaceReady ? "active" : "intake",
    event_date: state.facts.retirementDate,
    period_start: state.facts.employmentStartDate,
    period_end: state.facts.retirementDate,
    employment_start_date: state.facts.employmentStartDate,
    employment_end_date: state.facts.retirementDate,
    facts: state.facts,
    missing_facts: [...state.missingCoreFacts, ...state.missingMoneyFacts],
    issues: state.issues,
    evidence: state.evidence.items,
    actions: [], calculations: [], legal_sources: [], documents: [],
    meta: { verticalSlice: "retirement-v1", retirementDateMeans: "day_after_last_workday" },
  };
}
