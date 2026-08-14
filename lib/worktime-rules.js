import { normalizeWorktimeFacts, WORKTIME_HOUR_KEYS } from "./worktime-intake.js";

const VERIFIED_AT = "2026-08-15";

export const WORKTIME_SOURCES = Object.freeze({
  HOURS: Object.freeze({
    id: "source.lsa.article50",
    authority: "국가법령정보센터",
    title: "근로기준법 제50조 근로시간",
    article: "근로기준법 제50조",
    url: "https://www.law.go.kr/LSW/lsInfoP.do?lsId=001872",
    verifiedAt: VERIFIED_AT,
  }),
  OVERTIME: Object.freeze({
    id: "source.lsa.article53",
    authority: "국가법령정보센터",
    title: "근로기준법 제53조 연장 근로의 제한",
    article: "근로기준법 제53조",
    url: "https://www.law.go.kr/LSW/lsInfoP.do?lsId=001872",
    verifiedAt: VERIFIED_AT,
  }),
  BREAK: Object.freeze({
    id: "source.lsa.article54",
    authority: "국가법령정보센터",
    title: "근로기준법 제54조 휴게",
    article: "근로기준법 제54조",
    url: "https://www.law.go.kr/LSW/lsInfoP.do?lsId=001872",
    verifiedAt: VERIFIED_AT,
  }),
  HOLIDAY: Object.freeze({
    id: "source.lsa.article55",
    authority: "국가법령정보센터",
    title: "근로기준법 제55조 휴일",
    article: "근로기준법 제55조",
    url: "https://www.law.go.kr/LSW/lsInfoP.do?lsId=001872",
    verifiedAt: VERIFIED_AT,
  }),
  PREMIUM: Object.freeze({
    id: "source.lsa.article56",
    authority: "국가법령정보센터",
    title: "근로기준법 제56조 연장·야간 및 휴일 근로",
    article: "근로기준법 제56조",
    url: "https://www.law.go.kr/LSW/lsInfoP.do?lsId=001872",
    verifiedAt: VERIFIED_AT,
  }),
  SMALL_SCOPE: Object.freeze({
    id: "source.lsa_decree.appendix1",
    authority: "국가법령정보센터",
    title: "근로기준법 시행령 제7조·별표 1 상시 4명 이하 사업장 적용범위",
    article: "근로기준법 시행령 제7조·별표 1",
    url: "https://www.law.go.kr/LSW/lsInfoP.do?lsId=003058",
    verifiedAt: VERIFIED_AT,
  }),
});

const TOTAL_MULTIPLIERS = Object.freeze({
  weekdayOvertimeDayHours: 1.5,
  weekdayOvertimeNightHours: 2.0,
  holidayDayUpTo8Hours: 1.5,
  holidayNightUpTo8Hours: 2.0,
  holidayDayOver8Hours: 2.0,
  holidayNightOver8Hours: 2.5,
});

const PREMIUM_ONLY_MULTIPLIERS = Object.freeze({
  weekdayOvertimeDayHours: 0.5,
  weekdayOvertimeNightHours: 1.0,
  holidayDayUpTo8Hours: 0.5,
  holidayNightUpTo8Hours: 1.0,
  holidayDayOver8Hours: 1.0,
  holidayNightOver8Hours: 1.5,
});

function uniqueSources(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function breakAssessment(facts) {
  const f = normalizeWorktimeFacts(facts);
  if (f.representativeDailyWorkHours === null || f.representativeBreakMinutes === null) {
    return { status: "needs_input", requiredMinutes: null, providedMinutes: f.representativeBreakMinutes };
  }
  const requiredMinutes = f.representativeDailyWorkHours >= 8 ? 60 : f.representativeDailyWorkHours >= 4 ? 30 : 0;
  return {
    status: f.representativeBreakMinutes >= requiredMinutes ? "baseline_met" : "possible_shortfall",
    requiredMinutes,
    providedMinutes: f.representativeBreakMinutes,
  };
}

function premiumAssessment(facts) {
  const f = normalizeWorktimeFacts(facts);
  const fivePlus = f.workplaceEmployeeCount !== null ? f.workplaceEmployeeCount >= 5 : null;

  if (f.standardWorkSystem === false) {
    return {
      status: "unsupported_alternative_work_system",
      grossEstimate: null,
      outstandingEstimate: null,
      components: [],
      limitation: "탄력·선택·재량근로 등 변형근로시간제 또는 별도 특례는 이 baseline에서 자동 계산하지 않습니다.",
    };
  }
  if (f.ordinaryHourlyWage === null || f.baseWageForExtraHoursPaid === null || f.amountAlreadyPaid === null) {
    return { status: "needs_money_input", grossEstimate: null, outstandingEstimate: null, components: [] };
  }
  if (WORKTIME_HOUR_KEYS.some((key) => f[key] === null)) {
    return { status: "needs_hour_buckets", grossEstimate: null, outstandingEstimate: null, components: [] };
  }

  const components = [];
  let gross = 0;
  const multipliers = fivePlus
    ? (f.baseWageForExtraHoursPaid ? PREMIUM_ONLY_MULTIPLIERS : TOTAL_MULTIPLIERS)
    : null;

  for (const key of WORKTIME_HOUR_KEYS) {
    const hours = f[key] || 0;
    let multiplier;
    if (fivePlus === true) multiplier = multipliers[key];
    else if (fivePlus === false) multiplier = f.baseWageForExtraHoursPaid ? 0 : 1;
    else return { status: "needs_workplace_size", grossEstimate: null, outstandingEstimate: null, components: [] };

    const amount = f.ordinaryHourlyWage * hours * multiplier;
    gross += amount;
    components.push({ key, hours, multiplier, amount: Math.round(amount) });
  }

  return {
    status: fivePlus ? "estimated_with_statutory_premiums" : "estimated_base_wage_only_small_workplace",
    fivePlus,
    baseWageForExtraHoursPaid: f.baseWageForExtraHoursPaid,
    ordinaryHourlyWage: f.ordinaryHourlyWage,
    grossEstimate: Math.round(gross),
    alreadyPaidAmount: Math.round(f.amountAlreadyPaid),
    outstandingEstimate: Math.max(0, Math.round(gross - f.amountAlreadyPaid)),
    components,
    limitation: fivePlus
      ? "입력한 시간이 서로 겹치지 않는 배타적 버킷이라는 전제의 baseline 계산입니다."
      : "상시 4명 이하 baseline에서는 근로기준법 제56조 법정 가산을 자동 적용하지 않고, 추가 근로의 기본임금 미지급분만 계산합니다. 계약상 더 유리한 약정은 별도입니다.",
  };
}

export function getWorktimeLegalContext(facts = {}) {
  const f = normalizeWorktimeFacts(facts);
  const fivePlus = f.workplaceEmployeeCount !== null ? f.workplaceEmployeeCount >= 5 : null;
  const premium = premiumAssessment(f);
  const rest = breakAssessment(f);
  const weeklyOvertime = {
    applies: fivePlus === true && f.standardWorkSystem !== false,
    hours: f.maxWeeklyOvertimeHours,
    status:
      fivePlus !== true || f.standardWorkSystem === false || f.maxWeeklyOvertimeHours === null
        ? "not_determined"
        : f.maxWeeklyOvertimeHours > 12
          ? "possible_over_12_hour_limit"
          : "within_12_hour_baseline",
  };
  const sources = [WORKTIME_SOURCES.SMALL_SCOPE, WORKTIME_SOURCES.BREAK];
  const warnings = [];

  if (fivePlus === true) sources.push(WORKTIME_SOURCES.HOURS, WORKTIME_SOURCES.OVERTIME, WORKTIME_SOURCES.HOLIDAY, WORKTIME_SOURCES.PREMIUM);
  if (fivePlus === false) warnings.push("small_workplace_no_article56_premium_baseline");
  if (f.standardWorkSystem === false) warnings.push("alternative_work_system_requires_separate_review");
  if (weeklyOvertime.status === "possible_over_12_hour_limit") warnings.push("weekly_overtime_over_12_hours");
  if (rest.status === "possible_shortfall") warnings.push("break_time_shortfall");

  return {
    referenceDate: f.referenceDate,
    fivePlus,
    standardWorkSystem: f.standardWorkSystem,
    premium,
    weeklyOvertime,
    break: rest,
    sources: uniqueSources(sources),
    warnings,
    verifiedAt: VERIFIED_AT,
  };
}
