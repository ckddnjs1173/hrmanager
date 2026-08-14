// 인사야 1.0 — 임금체불 Intake 도메인
//
// 역할:
// - 임금체불 Case의 사실(facts)을 정리한다.
// - 현재 부족한 필수 사실을 찾는다.
// - 사용자에게 다음으로 물어볼 질문을 최대 3개까지 결정한다.
// - Case Workspace로 넘어갈 최소 조건을 판단한다.
//
// 하지 않는 일:
// - 법률 판단
// - 법령 시행 버전 선택
// - 임금/수당 계산
// - AI 호출
// - DB 저장
//
// 위 기능들은 각각 별도 도메인에서 담당한다.

export const WAGE_CASE_TYPE = "wage_arrears";

export const EMPLOYMENT_STATUS = Object.freeze({
  EMPLOYED: "employed",
  RESIGNED: "resigned",
  DISMISSED: "dismissed",
  UNKNOWN: "unknown",
});

export const WAGE_INTAKE_STEP = Object.freeze({
  CASE: "case",
  DATES: "dates",
  MONEY: "money",
  EXTRA_PAY: "extra_pay",
  EVIDENCE: "evidence",
  COMPLETE: "complete",
});

export const WAGE_ISSUES = Object.freeze({
  BASE_PAY: "wage.base_pay",
  OVERTIME: "wage.overtime",
  NIGHT: "wage.night",
  HOLIDAY: "wage.holiday",
  ANNUAL_LEAVE_PAY: "wage.annual_leave_pay",
  DELAY_INTEREST: "wage.delay_interest",
  SEVERANCE: "severance.payment",
});

export const WAGE_EVIDENCE_IDS = Object.freeze([
  "employmentContract",
  "payslip",
  "bankHistory",
  "attendanceRecord",
  "messagesWithEmployer",
]);

const QUESTION_DEFINITIONS = Object.freeze({
  employmentStatus: {
    step: WAGE_INTAKE_STEP.CASE,
    question: "현재 회사에 재직 중인가요, 퇴사했나요?",
  },

  unpaidItems: {
    step: WAGE_INTAKE_STEP.CASE,
    question: "받지 못한 돈이 무엇인가요? 기본급, 연장수당, 야간수당, 휴일수당 등 해당되는 항목을 알려주세요.",
  },

  employmentStartDate: {
    step: WAGE_INTAKE_STEP.DATES,
    question: "이 회사에 처음 입사한 날짜가 언제인가요?",
  },

  employmentEndDate: {
    step: WAGE_INTAKE_STEP.DATES,
    question: "퇴사 또는 근로관계가 종료된 날짜가 언제인가요?",
  },

  payDay: {
    step: WAGE_INTAKE_STEP.DATES,
    question: "원래 급여 지급일은 언제인가요?",
  },

  unpaidPeriodStart: {
    step: WAGE_INTAKE_STEP.DATES,
    question: "받지 못한 임금은 어느 날짜부터 발생했나요?",
  },

  unpaidPeriodEnd: {
    step: WAGE_INTAKE_STEP.DATES,
    question: "받지 못한 임금의 마지막 대상 날짜는 언제인가요?",
  },

  wageAmount: {
    step: WAGE_INTAKE_STEP.MONEY,
    question: "월 기본급 또는 시급이 얼마인가요?",
  },

  alreadyPaidAmount: {
    step: WAGE_INTAKE_STEP.MONEY,
    question: "일부라도 이미 받은 금액이 있나요? 없다면 0원이라고 알려주세요.",
  },

  overtimeWork: {
    step: WAGE_INTAKE_STEP.EXTRA_PAY,
    question: "정해진 근무시간을 넘겨 일한 연장근로가 있었나요?",
  },

  nightWork: {
    step: WAGE_INTAKE_STEP.EXTRA_PAY,
    question: "밤 10시부터 다음 날 오전 6시 사이에 근무한 적이 있나요?",
  },

  holidayWork: {
    step: WAGE_INTAKE_STEP.EXTRA_PAY,
    question: "휴일에 근무한 적이 있나요?",
  },

  unusedAnnualLeave: {
    step: WAGE_INTAKE_STEP.EXTRA_PAY,
    question: "사용하지 못한 연차가 남아 있거나 연차수당을 받지 못한 문제가 있나요?",
  },
});

function hasValue(value) {
  if (value === null || value === undefined) return false;

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return true;
}

function hasWageAmount(facts) {
  return (
    hasValue(facts.monthlyBasePay) ||
    hasValue(facts.hourlyWage) ||
    hasValue(facts.dailyWage) ||
    hasValue(facts.wageStructure)
  );
}

function isEmploymentEnded(status) {
  return (
    status === EMPLOYMENT_STATUS.RESIGNED ||
    status === EMPLOYMENT_STATUS.DISMISSED
  );
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : value;
}

function normalizeUnpaidItems(value) {
  if (!Array.isArray(value)) return [];

  return [
    ...new Set(
      value
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    ),
  ];
}

function normalizeEvidence(value) {
  const input =
    value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};

  const result = {};

  for (const id of WAGE_EVIDENCE_IDS) {
    const status = input[id];

    result[id] =
      status === "have" ||
      status === "missing" ||
      status === "planned"
        ? status
        : "unknown";
  }

  return result;
}

export function normalizeWageFacts(input = {}) {
  const facts =
    input && typeof input === "object" && !Array.isArray(input)
      ? input
      : {};

  return {
    ...facts,

    employmentStatus: Object.values(EMPLOYMENT_STATUS).includes(
      facts.employmentStatus
    )
      ? facts.employmentStatus
      : EMPLOYMENT_STATUS.UNKNOWN,

    employmentStartDate: normalizeString(facts.employmentStartDate),
    employmentEndDate: normalizeString(facts.employmentEndDate),

    payDay: normalizeString(facts.payDay),

    unpaidPeriodStart: normalizeString(facts.unpaidPeriodStart),
    unpaidPeriodEnd: normalizeString(facts.unpaidPeriodEnd),

    unpaidItems: normalizeUnpaidItems(facts.unpaidItems),

    monthlyBasePay: facts.monthlyBasePay ?? null,
    hourlyWage: facts.hourlyWage ?? null,
    dailyWage: facts.dailyWage ?? null,
    wageStructure: facts.wageStructure ?? null,

    alreadyPaidAmount:
      facts.alreadyPaidAmount === undefined
        ? null
        : facts.alreadyPaidAmount,

    overtimeWork:
      typeof facts.overtimeWork === "boolean"
        ? facts.overtimeWork
        : null,

    nightWork:
      typeof facts.nightWork === "boolean"
        ? facts.nightWork
        : null,

    holidayWork:
      typeof facts.holidayWork === "boolean"
        ? facts.holidayWork
        : null,

    unusedAnnualLeave:
      typeof facts.unusedAnnualLeave === "boolean"
        ? facts.unusedAnnualLeave
        : null,

    evidence: normalizeEvidence(facts.evidence),
  };
}

export function getRequiredWageFacts(input = {}) {
  const facts = normalizeWageFacts(input);

  const required = [
    "employmentStatus",
    "unpaidItems",
    "employmentStartDate",
    "payDay",
    "unpaidPeriodStart",
    "unpaidPeriodEnd",
    "wageAmount",
    "alreadyPaidAmount",
  ];

  if (isEmploymentEnded(facts.employmentStatus)) {
    required.push("employmentEndDate");
  }

  return required;
}

function isFactComplete(key, facts) {
  switch (key) {
    case "employmentStatus":
      return (
        facts.employmentStatus !== EMPLOYMENT_STATUS.UNKNOWN &&
        hasValue(facts.employmentStatus)
      );

    case "unpaidItems":
      return Array.isArray(facts.unpaidItems) && facts.unpaidItems.length > 0;

    case "employmentStartDate":
      return hasValue(facts.employmentStartDate);

    case "employmentEndDate":
      return hasValue(facts.employmentEndDate);

    case "payDay":
      return hasValue(facts.payDay);

    case "unpaidPeriodStart":
      return hasValue(facts.unpaidPeriodStart);

    case "unpaidPeriodEnd":
      return hasValue(facts.unpaidPeriodEnd);

    case "wageAmount":
      return hasWageAmount(facts);

    case "alreadyPaidAmount":
      return (
        facts.alreadyPaidAmount !== null &&
        facts.alreadyPaidAmount !== undefined &&
        facts.alreadyPaidAmount !== ""
      );

    case "overtimeWork":
      return typeof facts.overtimeWork === "boolean";

    case "nightWork":
      return typeof facts.nightWork === "boolean";

    case "holidayWork":
      return typeof facts.holidayWork === "boolean";

    case "unusedAnnualLeave":
      return typeof facts.unusedAnnualLeave === "boolean";

    default:
      return hasValue(facts[key]);
  }
}

export function getMissingWageFacts(input = {}) {
  const facts = normalizeWageFacts(input);
  const required = getRequiredWageFacts(facts);

  return required.filter((key) => !isFactComplete(key, facts));
}

export function getMissingExtraPayFacts(input = {}) {
  const facts = normalizeWageFacts(input);

  const keys = [
    "overtimeWork",
    "nightWork",
    "holidayWork",
    "unusedAnnualLeave",
  ];

  return keys.filter((key) => !isFactComplete(key, facts));
}

export function detectWageIssues(input = {}) {
  const facts = normalizeWageFacts(input);
  const issues = new Set();

  const items = facts.unpaidItems.map((item) => item.toLowerCase());

  const contains = (...keywords) =>
    items.some((item) =>
      keywords.some((keyword) => item.includes(keyword))
    );

  if (
    contains(
      "기본급",
      "월급",
      "급여",
      "임금",
      "base",
      "salary",
      "wage"
    )
  ) {
    issues.add(WAGE_ISSUES.BASE_PAY);
  }

  if (
    facts.overtimeWork === true ||
    contains("연장", "초과", "overtime")
  ) {
    issues.add(WAGE_ISSUES.OVERTIME);
  }

  if (
    facts.nightWork === true ||
    contains("야간", "심야", "night")
  ) {
    issues.add(WAGE_ISSUES.NIGHT);
  }

  if (
    facts.holidayWork === true ||
    contains("휴일", "공휴일", "holiday")
  ) {
    issues.add(WAGE_ISSUES.HOLIDAY);
  }

  if (
    facts.unusedAnnualLeave === true ||
    contains("연차", "연차수당", "annual")
  ) {
    issues.add(WAGE_ISSUES.ANNUAL_LEAVE_PAY);
  }

  if (contains("퇴직금", "severance")) {
    issues.add(WAGE_ISSUES.SEVERANCE);
  }

  if (issues.size === 0 && facts.unpaidItems.length > 0) {
    issues.add(WAGE_ISSUES.BASE_PAY);
  }

  return [...issues];
}

function getCurrentStep(missingCoreFacts, missingExtraFacts) {
  if (
    missingCoreFacts.includes("employmentStatus") ||
    missingCoreFacts.includes("unpaidItems")
  ) {
    return WAGE_INTAKE_STEP.CASE;
  }

  if (
    missingCoreFacts.some((key) =>
      [
        "employmentStartDate",
        "employmentEndDate",
        "payDay",
        "unpaidPeriodStart",
        "unpaidPeriodEnd",
      ].includes(key)
    )
  ) {
    return WAGE_INTAKE_STEP.DATES;
  }

  if (
    missingCoreFacts.includes("wageAmount") ||
    missingCoreFacts.includes("alreadyPaidAmount")
  ) {
    return WAGE_INTAKE_STEP.MONEY;
  }

  if (missingExtraFacts.length > 0) {
    return WAGE_INTAKE_STEP.EXTRA_PAY;
  }

  return WAGE_INTAKE_STEP.COMPLETE;
}

function getQuestionPriority(step) {
  switch (step) {
    case WAGE_INTAKE_STEP.CASE:
      return [
        "employmentStatus",
        "unpaidItems",
      ];

    case WAGE_INTAKE_STEP.DATES:
      return [
        "employmentEndDate",
        "payDay",
        "unpaidPeriodStart",
        "unpaidPeriodEnd",
        "employmentStartDate",
      ];

    case WAGE_INTAKE_STEP.MONEY:
      return [
        "wageAmount",
        "alreadyPaidAmount",
      ];

    case WAGE_INTAKE_STEP.EXTRA_PAY:
      return [
        "overtimeWork",
        "nightWork",
        "holidayWork",
        "unusedAnnualLeave",
      ];

    default:
      return [];
  }
}

export function getNextWageQuestions(input = {}, limit = 3) {
  const facts = normalizeWageFacts(input);
  const missingCoreFacts = getMissingWageFacts(facts);
  const missingExtraFacts = getMissingExtraPayFacts(facts);
  const step = getCurrentStep(
    missingCoreFacts,
    missingExtraFacts
  );

  const missing =
    step === WAGE_INTAKE_STEP.EXTRA_PAY
      ? missingExtraFacts
      : missingCoreFacts;

  const priority = getQuestionPriority(step);

  const ordered = [
    ...priority.filter((key) => missing.includes(key)),
    ...missing.filter((key) => !priority.includes(key)),
  ];

  return ordered
    .slice(0, Math.max(1, Math.min(3, Number(limit) || 3)))
    .map((key) => ({
      key,
      step,
      question:
        QUESTION_DEFINITIONS[key]?.question ||
        `${key} 정보를 확인해 주세요.`,
    }));
}

export function getWageEvidenceState(input = {}) {
  const facts = normalizeWageFacts(input);
  const evidence = facts.evidence;

  const items = WAGE_EVIDENCE_IDS.map((id) => ({
    id,
    status: evidence[id],
  }));

  return {
    items,
    haveCount: items.filter((item) => item.status === "have").length,
    knownCount: items.filter((item) => item.status !== "unknown").length,
    totalCount: items.length,
  };
}

export function getWageIntakeState(input = {}) {
  const facts = normalizeWageFacts(input);

  const missingCoreFacts = getMissingWageFacts(facts);
  const missingExtraFacts = getMissingExtraPayFacts(facts);

  const coreComplete = missingCoreFacts.length === 0;

  const step = getCurrentStep(
    missingCoreFacts,
    missingExtraFacts
  );

  const questions = getNextWageQuestions(facts, 3);

  const issues = detectWageIssues(facts);

  const evidence = getWageEvidenceState(facts);

  return {
    caseType: WAGE_CASE_TYPE,

    step,

    coreComplete,

    readyForWorkspace: coreComplete,

    facts,

    missingCoreFacts,

    missingExtraFacts,

    issues,

    questions,

    evidence,
  };
}

export function createInitialWageCase(input = {}) {
  const facts = normalizeWageFacts(input);
  const intake = getWageIntakeState(facts);

  return {
    status: intake.readyForWorkspace
      ? "active"
      : "intake",

    user_type: "worker",

    case_type: WAGE_CASE_TYPE,

    title: "임금체불",

    summary: "",

    event_date:
      facts.employmentEndDate ||
      facts.unpaidPeriodEnd ||
      null,

    period_start:
      facts.unpaidPeriodStart ||
      null,

    period_end:
      facts.unpaidPeriodEnd ||
      null,

    employment_start_date:
      facts.employmentStartDate ||
      null,

    employment_end_date:
      facts.employmentEndDate ||
      null,

    facts,

    missing_facts: intake.missingCoreFacts,

    issues: intake.issues,

    calculations: [],

    evidence: intake.evidence.items,

    actions: [],

    documents: [],

    legal_sources: [],

    meta: {
      intakeStep: intake.step,
      intakeCoreComplete: intake.coreComplete,
      readyForWorkspace: intake.readyForWorkspace,
    },
  };
}
