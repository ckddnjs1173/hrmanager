import { calendarDaysBetween, normalizeDismissalFacts } from "./dismissal-intake.js";

const VERIFIED_AT = "2026-08-15";

export const DISMISSAL_SOURCES = Object.freeze({
  SCOPE: Object.freeze({
    id: "source.lsa.scope",
    authority: "국가법령정보센터",
    title: "근로기준법 제11조 및 시행령 제7조·별표 1",
    article: "근로기준법 제11조 / 시행령 제7조·별표 1",
    url: "https://www.law.go.kr/LSW/lsInfoP.do?lsId=003058",
    verifiedAt: VERIFIED_AT,
  }),
  JUST_CAUSE: Object.freeze({
    id: "source.lsa.article23",
    authority: "국가법령정보센터",
    title: "근로기준법 제23조 해고 등의 제한",
    article: "근로기준법 제23조",
    url: "https://www.law.go.kr/LSW/LsiJoLinkP.do?docType=JO&joNo=002300000&languageType=KO&lsNm=%EA%B7%BC%EB%A1%9C%EA%B8%B0%EC%A4%80%EB%B2%95&paras=1",
    verifiedAt: VERIFIED_AT,
  }),
  NOTICE: Object.freeze({
    id: "source.lsa.article26",
    authority: "국가법령정보센터",
    title: "근로기준법 제26조 해고의 예고",
    article: "근로기준법 제26조",
    url: "https://www.law.go.kr/LSW/LsiJoLinkP.do?docType=JO&joNo=002600000&languageType=KO&lsNm=%EA%B7%BC%EB%A1%9C%EA%B8%B0%EC%A4%80%EB%B2%95&paras=1",
    verifiedAt: VERIFIED_AT,
  }),
  WRITTEN_NOTICE: Object.freeze({
    id: "source.lsa.article27",
    authority: "국가법령정보센터",
    title: "근로기준법 제27조 해고사유 등의 서면통지",
    article: "근로기준법 제27조",
    url: "https://www.law.go.kr/LSW/LsiJoLinkP.do?docType=JO&joNo=002700000&languageType=KO&lsNm=%EA%B7%BC%EB%A1%9C%EA%B8%B0%EC%A4%80%EB%B2%95&paras=1",
    verifiedAt: VERIFIED_AT,
  }),
  REMEDY: Object.freeze({
    id: "source.lsa.article28",
    authority: "국가법령정보센터",
    title: "근로기준법 제28조 부당해고등의 구제신청",
    article: "근로기준법 제28조",
    url: "https://www.law.go.kr/LSW/LsiJoLinkP.do?docType=JO&joNo=002800000&languageType=KO&lsNm=%EA%B7%BC%EB%A1%9C%EA%B8%B0%EC%A4%80%EB%B2%95&paras=1",
    verifiedAt: VERIFIED_AT,
  }),
  NLRC_GUIDE: Object.freeze({
    id: "source.nlrc.dismissal",
    authority: "중앙노동위원회",
    title: "부당해고 등 구제신청 안내",
    url: "https://nlrc.go.kr/nlrc/minwon/CmmnEventRequest/EltrDlivPrivacy.do",
    verifiedAt: VERIFIED_AT,
  }),
});

function uniqueSources(items) {
  const seen = new Set();
  return items.filter((item) => item?.id && !seen.has(item.id) && seen.add(item.id));
}

function noticeAllowanceAssessment(facts) {
  const f = normalizeDismissalFacts(facts);
  if (f.separationType !== "dismissal") return null;

  const serviceDays = calendarDaysBetween(f.employmentStartDate, f.effectiveDate);
  const noticeDays = calendarDaysBetween(f.noticeDate, f.effectiveDate);
  const underThreeMonths = serviceDays !== null && serviceDays < 90;
  const thirtyDayNotice = noticeDays !== null && noticeDays >= 30;

  if (underThreeMonths) {
    return {
      status: "statutory_exception_under_3_months",
      serviceDays,
      noticeDays,
      amount: 0,
      reason: "계속근로기간 3개월 미만 예외 가능",
    };
  }

  if (thirtyDayNotice || f.noticePayPaid === true) {
    return {
      status: "no_shortfall_detected",
      serviceDays,
      noticeDays,
      amount: 0,
      reason: thirtyDayNotice ? "30일 이상 사전 예고" : "해고예고수당 지급 확인",
    };
  }

  if (serviceDays === null || noticeDays === null || f.noticePayPaid === null) {
    return {
      status: "needs_input",
      serviceDays,
      noticeDays,
      amount: null,
      reason: "근속기간·예고일·예고수당 지급 여부 추가 확인 필요",
    };
  }

  return {
    status: "possible_shortfall",
    serviceDays,
    noticeDays,
    amount: f.ordinaryDailyWage !== null ? Math.round(f.ordinaryDailyWage * 30) : null,
    reason: "30일 미만 예고 및 예고수당 미지급 입력",
    missingFacts: f.ordinaryDailyWage === null ? ["ordinaryDailyWage"] : [],
  };
}

function characterizeSeparation(facts) {
  const f = normalizeDismissalFacts(facts);
  if (f.separationType === "dismissal") return { status: "dismissal_input", confidence: "user_reported" };
  if (f.separationType === "contract_end") {
    return {
      status: "fixed_term_end_requires_review",
      confidence: "needs_review",
      reason: "계약기간 만료라도 갱신기대권 등 추가 사실에 따라 판단이 달라질 수 있음",
    };
  }
  if (f.separationType === "unclear") return { status: "characterization_required", confidence: "needs_review" };
  if (f.separationType === "advised_resignation") {
    if (f.workerAcceptedRecommendation === true && f.resignationLetterSubmitted === true && f.pressureOrDeception === false) {
      return {
        status: "agreed_termination_indicators",
        confidence: "preliminary",
        reason: "동의·사직서 제출·강압 없음이 입력됐으나 실제 의사와 경위 확인 필요",
      };
    }
    if (f.workerAcceptedRecommendation === false || f.pressureOrDeception === true) {
      return {
        status: "possible_involuntary_termination",
        confidence: "needs_review",
        reason: "사직 동의 부재 또는 강압·기망 입력",
      };
    }
    return { status: "characterization_required", confidence: "needs_review" };
  }
  return { status: "characterization_required", confidence: "needs_review" };
}

export function getDismissalLegalContext(facts = {}) {
  const f = normalizeDismissalFacts(facts);
  const employeeCount = f.workplaceEmployeeCount;
  const fivePlus = employeeCount !== null ? employeeCount >= 5 : null;
  const characterization = characterizeSeparation(f);
  const noticeAllowance = noticeAllowanceAssessment(f);
  const isDismissalLike = f.separationType === "dismissal" || characterization.status === "possible_involuntary_termination";
  const laborBoardEligibleBaseline = fivePlus === true && isDismissalLike && !!f.effectiveDate;
  const writtenNoticeRuleApplies = fivePlus === true && f.separationType === "dismissal";
  const sources = [DISMISSAL_SOURCES.SCOPE];
  const warnings = [];

  if (f.separationType === "dismissal") sources.push(DISMISSAL_SOURCES.NOTICE);
  if (fivePlus === true && isDismissalLike) {
    sources.push(DISMISSAL_SOURCES.JUST_CAUSE, DISMISSAL_SOURCES.REMEDY, DISMISSAL_SOURCES.NLRC_GUIDE);
  }
  if (writtenNoticeRuleApplies) sources.push(DISMISSAL_SOURCES.WRITTEN_NOTICE);
  if (fivePlus === false) warnings.push("small_workplace_labor_board_remedy_not_available_under_lsa_baseline");
  if (characterization.confidence === "needs_review") warnings.push("separation_characterization_requires_review");

  return {
    referenceDate: f.effectiveDate || f.noticeDate || null,
    workplaceEmployeeCount: employeeCount,
    fivePlus,
    characterization,
    noticeAllowance,
    writtenNoticeRuleApplies,
    writtenNoticeCompliance:
      writtenNoticeRuleApplies && f.writtenNoticeReceived !== null
        ? (f.writtenNoticeReceived ? "reported_received" : "possible_violation")
        : "not_determined",
    unfairDismissalReviewApplies: fivePlus === true && isDismissalLike,
    laborBoardEligibleBaseline,
    remedyWindow: laborBoardEligibleBaseline
      ? {
          from: f.effectiveDate,
          months: 3,
          text: "부당해고등이 있었던 날부터 3개월 이내",
          exactDeadline: null,
          limitation: "말일·휴일 등 정확한 기간 계산은 실제 신청 전에 재확인하세요.",
        }
      : null,
    sources: uniqueSources(sources),
    warnings,
    verifiedAt: VERIFIED_AT,
  };
}
