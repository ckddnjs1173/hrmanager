// Business onboarding contract.
// 목표: 가입 폼을 길게 만드는 것이 아니라 5~10분 안에 첫 Risk Scan과 첫 조치까지 도달한다.

export const ONBOARDING_STEPS = Object.freeze([
  "COMPANY_PROFILE",
  "WORKPLACES",
  "COMPLIANCE_SCOPE",
  "EMPLOYEES",
  "POLICY_FACTS",
  "RISK_SCAN",
  "FIRST_ACTION",
  "COMPLETE",
]);

export const ONBOARDING_STATUSES = Object.freeze([
  "NOT_STARTED",
  "IN_PROGRESS",
  "BLOCKED",
  "COMPLETED",
  "ABANDONED",
]);

export const FACT_CONFIDENCE = Object.freeze(["KNOWN", "UNKNOWN", "ESTIMATED", "VERIFIED"]);

export const COMPANY_PROFILE_FACTS = Object.freeze([
  "industryCode",
  "payday",
  "defaultWeeklyHours",
  "wageSystem",
  "inclusiveWage",
  "rulesOfEmploymentExists",
  "externalAdvisorExists",
]);

export const ONBOARDING_REQUIRED_MILESTONES = Object.freeze([
  "organizationActive",
  "companyProfileSaved",
  "workplaceCreated",
  "employeeCountAtLeastOne",
  "riskScanCompleted",
]);

export const ACTIVATION_SIGNALS = Object.freeze([
  "firstActionStarted",
  "firstActionCompleted",
  "firstDocumentGenerated",
]);

export function normalizeFactAnswer(value, confidence = "KNOWN") {
  if (!FACT_CONFIDENCE.includes(confidence)) throw new Error("onboarding_fact_confidence_invalid");
  return { value: value ?? null, confidence };
}

export function nextOnboardingStep(completedSteps = []) {
  const completed = new Set(completedSteps);
  return ONBOARDING_STEPS.find((step) => step !== "COMPLETE" && !completed.has(step)) || "COMPLETE";
}

export function evaluateOnboardingReadiness(state = {}) {
  const missing = ONBOARDING_REQUIRED_MILESTONES.filter((key) => state[key] !== true);
  return { readyForCompletion: missing.length === 0, missing };
}

export function evaluateBusinessActivation(state = {}) {
  const readiness = evaluateOnboardingReadiness(state);
  const activationSignal = ACTIVATION_SIGNALS.find((key) => state[key] === true) || null;
  return {
    activated: readiness.readyForCompletion && Boolean(activationSignal),
    missingMilestones: readiness.missing,
    activationSignal,
  };
}

export function shouldBlockRiskScan(state = {}) {
  // 물리 사업장조차 없으면 평가 대상을 만들 수 없어 scan을 막는다.
  // ComplianceScope가 불확실한 경우는 막지 않고 Risk Engine이 UNCERTAIN으로 처리한다.
  if (state.companyProfileSaved !== true) return { blocked: true, reason: "company_profile_required" };
  if (state.workplaceCreated !== true) return { blocked: true, reason: "workplace_required" };
  return { blocked: false, reason: null };
}

export function validateEmployeeImportSummary(summary = {}) {
  const total = Number(summary.total || 0);
  const accepted = Number(summary.accepted || 0);
  const rejected = Number(summary.rejected || 0);
  if (![total, accepted, rejected].every((value) => Number.isInteger(value) && value >= 0)) {
    return { ok: false, error: "employee_import_counts_invalid" };
  }
  if (accepted + rejected !== total) return { ok: false, error: "employee_import_count_mismatch" };
  return { ok: true };
}
