export const DISMISSAL_CASE_TYPE = "dismissal";

export const DISMISSAL_EVIDENCE_KEYS = Object.freeze([
  "dismissalNotice",
  "messagesWithEmployer",
  "resignationLetter",
  "employmentContract",
  "payslip",
]);

const EVIDENCE_STATES = new Set(["have", "planned", "missing", "unknown"]);
const SEPARATION_TYPES = new Set(["dismissal", "advised_resignation", "contract_end", "unclear"]);

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
  for (const key of DISMISSAL_EVIDENCE_KEYS) {
    result[key] = EVIDENCE_STATES.has(source[key]) ? source[key] : "unknown";
  }
  return result;
}

export function normalizeDismissalFacts(input = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const separationType = SEPARATION_TYPES.has(source.separationType) ? source.separationType : null;

  return {
    separationType,
    employmentStartDate: isIsoDate(source.employmentStartDate) ? source.employmentStartDate : cleanString(source.employmentStartDate) || null,
    noticeDate: isIsoDate(source.noticeDate) ? source.noticeDate : cleanString(source.noticeDate) || null,
    effectiveDate: isIsoDate(source.effectiveDate) ? source.effectiveDate : cleanString(source.effectiveDate) || null,
    workplaceEmployeeCount: cleanNumber(source.workplaceEmployeeCount),
    employerReason: cleanString(source.employerReason) || null,
    writtenNoticeReceived: cleanBoolean(source.writtenNoticeReceived),
    noticePayPaid: cleanBoolean(source.noticePayPaid),
    ordinaryDailyWage: cleanNumber(source.ordinaryDailyWage),
    workerAcceptedRecommendation: cleanBoolean(source.workerAcceptedRecommendation),
    resignationLetterSubmitted: cleanBoolean(source.resignationLetterSubmitted),
    pressureOrDeception: cleanBoolean(source.pressureOrDeception),
    fixedTermContract: cleanBoolean(source.fixedTermContract),
    contractEndDate: isIsoDate(source.contractEndDate) ? source.contractEndDate : cleanString(source.contractEndDate) || null,
    wantsReinstatement: cleanBoolean(source.wantsReinstatement),
    evidence: normalizeEvidence(source.evidence),
  };
}

function dateMs(value) {
  if (!isIsoDate(value)) return null;
  return Date.parse(`${value}T00:00:00Z`);
}

function parseIsoDate(value) {
  if (!isIsoDate(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function addCalendarMonthsClamped(value, months) {
  const date = parseIsoDate(value);
  if (!date) return null;
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const targetFirst = new Date(Date.UTC(year, month + months, 1));
  const lastDay = new Date(Date.UTC(targetFirst.getUTCFullYear(), targetFirst.getUTCMonth() + 1, 0)).getUTCDate();
  const target = new Date(Date.UTC(targetFirst.getUTCFullYear(), targetFirst.getUTCMonth(), Math.min(day, lastDay)));
  return target.toISOString().slice(0, 10);
}

export function hasCompletedCalendarMonths(start, end, months) {
  const anniversary = addCalendarMonthsClamped(start, months);
  return !!anniversary && isIsoDate(end) && end >= anniversary;
}

export function calendarDaysBetween(from, to) {
  const start = dateMs(from);
  const end = dateMs(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.floor((end - start) / 86400000);
}

export function getDismissalCoreMissingFacts(facts = {}) {
  const f = normalizeDismissalFacts(facts);
  const missing = [];
  if (!f.separationType) missing.push("separationType");
  if (!isIsoDate(f.employmentStartDate)) missing.push("employmentStartDate");
  if (!isIsoDate(f.effectiveDate)) missing.push("effectiveDate");
  if (f.workplaceEmployeeCount === null) missing.push("workplaceEmployeeCount");
  return missing;
}

export function getDismissalConditionalMissingFacts(facts = {}) {
  const f = normalizeDismissalFacts(facts);
  const missing = [];

  if (f.separationType === "dismissal") {
    if (f.writtenNoticeReceived === null) missing.push("writtenNoticeReceived");
    if (f.noticePayPaid === null) missing.push("noticePayPaid");
    if (!f.employerReason) missing.push("employerReason");
    if (!isIsoDate(f.noticeDate)) missing.push("noticeDate");
  }

  if (f.separationType === "advised_resignation") {
    if (f.workerAcceptedRecommendation === null) missing.push("workerAcceptedRecommendation");
    if (f.resignationLetterSubmitted === null) missing.push("resignationLetterSubmitted");
    if (f.pressureOrDeception === null) missing.push("pressureOrDeception");
  }

  if (f.separationType === "contract_end") {
    if (f.fixedTermContract === null) missing.push("fixedTermContract");
    if (!isIsoDate(f.contractEndDate)) missing.push("contractEndDate");
  }

  return missing;
}

export function detectDismissalIssues(facts = {}) {
  const f = normalizeDismissalFacts(facts);
  const issues = [];
  const employeeCount = f.workplaceEmployeeCount;
  const noticeDays = calendarDaysBetween(f.noticeDate, f.effectiveDate);
  const completedThreeMonths = hasCompletedCalendarMonths(f.employmentStartDate, f.effectiveDate, 3);

  if (["advised_resignation", "unclear"].includes(f.separationType)) issues.push("dismissal.characterization");
  if (employeeCount !== null && employeeCount < 5) issues.push("dismissal.small_workplace_scope");

  if (f.separationType === "dismissal") {
    if (employeeCount !== null && employeeCount >= 5) issues.push("dismissal.just_cause_review");
    if (employeeCount !== null && employeeCount >= 5 && f.writtenNoticeReceived === false) issues.push("dismissal.written_notice");
    if (completedThreeMonths && noticeDays !== null && noticeDays < 30 && f.noticePayPaid === false) {
      issues.push("dismissal.notice_pay");
    }
    if (employeeCount !== null && employeeCount >= 5 && isIsoDate(f.effectiveDate)) issues.push("dismissal.remedy_deadline");
  }

  if (f.separationType === "advised_resignation" && (f.workerAcceptedRecommendation === false || f.pressureOrDeception === true)) {
    issues.push("dismissal.possible_involuntary_termination");
  }

  return [...new Set(issues)];
}

export function getDismissalEvidenceState(facts = {}) {
  const evidence = normalizeDismissalFacts(facts).evidence;
  const values = Object.values(evidence);
  return {
    items: evidence,
    haveCount: values.filter((value) => value === "have").length,
    knownCount: values.filter((value) => value !== "unknown").length,
    totalCount: DISMISSAL_EVIDENCE_KEYS.length,
  };
}

export function getDismissalIntakeState(facts = {}) {
  const normalized = normalizeDismissalFacts(facts);
  const missingCoreFacts = getDismissalCoreMissingFacts(normalized);
  const missingConditionalFacts = getDismissalConditionalMissingFacts(normalized);
  const issues = detectDismissalIssues(normalized);
  const evidence = getDismissalEvidenceState(normalized);

  return {
    facts: normalized,
    coreComplete: missingCoreFacts.length === 0,
    missingCoreFacts,
    missingConditionalFacts,
    issues,
    evidence,
    workspaceReady: missingCoreFacts.length === 0,
  };
}

const QUESTION_DEFS = Object.freeze({
  separationType: { key: "separationType", label: "회사는 근로관계를 어떤 방식으로 끝냈나요?", type: "select", options: [
    ["dismissal", "회사가 일방적으로 해고 통보"],
    ["advised_resignation", "회사 권고로 사직 논의"],
    ["contract_end", "기간제 계약 종료"],
    ["unclear", "해고인지 사직인지 불분명"],
  ] },
  employmentStartDate: { key: "employmentStartDate", label: "입사일은 언제인가요?", type: "date" },
  effectiveDate: { key: "effectiveDate", label: "실제 근로관계가 끝난 날(또는 예정일)은 언제인가요?", type: "date" },
  workplaceEmployeeCount: { key: "workplaceEmployeeCount", label: "사업장의 상시근로자 수는 대략 몇 명인가요?", type: "number" },
  writtenNoticeReceived: { key: "writtenNoticeReceived", label: "해고 사유와 해고일이 적힌 서면 통지를 받았나요?", type: "boolean" },
  noticePayPaid: { key: "noticePayPaid", label: "30일 전에 예고받지 못했다면 해고예고수당을 받았나요?", type: "boolean" },
  employerReason: { key: "employerReason", label: "회사가 말한 해고 사유를 적어주세요.", type: "text" },
  noticeDate: { key: "noticeDate", label: "해고 또는 종료 통보를 받은 날은 언제인가요?", type: "date" },
  workerAcceptedRecommendation: { key: "workerAcceptedRecommendation", label: "권고사직에 명확히 동의했나요?", type: "boolean" },
  resignationLetterSubmitted: { key: "resignationLetterSubmitted", label: "사직서나 사직 합의서에 서명·제출했나요?", type: "boolean" },
  pressureOrDeception: { key: "pressureOrDeception", label: "사직 의사표시에 강압·기망이 있었다고 보나요?", type: "boolean" },
  fixedTermContract: { key: "fixedTermContract", label: "종료일이 정해진 기간제 근로계약이었나요?", type: "boolean" },
  contractEndDate: { key: "contractEndDate", label: "계약서상 종료일은 언제인가요?", type: "date" },
});

export function getDismissalQuestions(facts = {}, limit = 3) {
  const state = getDismissalIntakeState(facts);
  return [...state.missingCoreFacts, ...state.missingConditionalFacts]
    .slice(0, Math.max(1, Number(limit) || 3))
    .map((key) => QUESTION_DEFS[key])
    .filter(Boolean);
}

export function createInitialDismissalCase(facts = {}) {
  const state = getDismissalIntakeState(facts);
  return {
    case_type: DISMISSAL_CASE_TYPE,
    title: "해고·권고사직 사건",
    status: state.workspaceReady ? "active" : "intake",
    event_date: state.facts.effectiveDate,
    period_start: state.facts.employmentStartDate,
    period_end: state.facts.effectiveDate,
    employment_start_date: state.facts.employmentStartDate,
    employment_end_date: state.facts.effectiveDate,
    facts: state.facts,
    missing_facts: [...state.missingCoreFacts, ...state.missingConditionalFacts],
    issues: state.issues,
    evidence: state.evidence.items,
    actions: [],
    calculations: [],
    legal_sources: [],
    documents: [],
    meta: { verticalSlice: "dismissal-v1" },
  };
}
