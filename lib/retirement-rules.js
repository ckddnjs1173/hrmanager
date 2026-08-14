import { normalizeRetirementFacts, serviceDaysBetween } from "./retirement-intake.js";

const VERIFIED_AT = "2026-08-15";

export const RETIREMENT_SOURCES = Object.freeze({
  SCOPE: Object.freeze({
    id: "source.erbsa.article4",
    authority: "국가법령정보센터",
    title: "근로자퇴직급여 보장법 제4조 퇴직급여제도의 설정",
    article: "근로자퇴직급여 보장법 제4조",
    url: "https://www.law.go.kr/LSW/lsInfoP.do?lsId=009883",
    verifiedAt: VERIFIED_AT,
  }),
  SEVERANCE: Object.freeze({
    id: "source.erbsa.article8",
    authority: "국가법령정보센터",
    title: "근로자퇴직급여 보장법 제8조 퇴직금제도의 설정 등",
    article: "근로자퇴직급여 보장법 제8조",
    url: "https://www.law.go.kr/LSW/lsInfoP.do?lsId=009883",
    verifiedAt: VERIFIED_AT,
  }),
  PAYMENT: Object.freeze({
    id: "source.erbsa.article9",
    authority: "국가법령정보센터",
    title: "근로자퇴직급여 보장법 제9조 퇴직금의 지급 등",
    article: "근로자퇴직급여 보장법 제9조",
    url: "https://www.law.go.kr/LSW/lsInfoP.do?lsId=009883",
    verifiedAt: VERIFIED_AT,
  }),
  DB: Object.freeze({
    id: "source.erbsa.article15",
    authority: "국가법령정보센터",
    title: "근로자퇴직급여 보장법 제15조 확정급여형퇴직연금제도의 급여 수준",
    article: "근로자퇴직급여 보장법 제15조",
    url: "https://www.law.go.kr/LSW/lsInfoP.do?lsId=009883",
    verifiedAt: VERIFIED_AT,
  }),
  DC: Object.freeze({
    id: "source.erbsa.article20",
    authority: "국가법령정보센터",
    title: "근로자퇴직급여 보장법 제20조 확정기여형퇴직연금제도의 부담금 수준",
    article: "근로자퇴직급여 보장법 제20조",
    url: "https://www.law.go.kr/LSW/lsInfoP.do?lsId=009883",
    verifiedAt: VERIFIED_AT,
  }),
  AVERAGE_WAGE: Object.freeze({
    id: "source.lsa.article2.average_wage",
    authority: "국가법령정보센터",
    title: "근로기준법 제2조 평균임금",
    article: "근로기준법 제2조제1항제6호·제2항",
    url: "https://www.law.go.kr/LSW/lsInfoP.do?lsId=001872",
    verifiedAt: VERIFIED_AT,
  }),
  AVERAGE_WAGE_EXCLUSION: Object.freeze({
    id: "source.lsa_decree.article2.average_wage",
    authority: "국가법령정보센터",
    title: "근로기준법 시행령 제2조 평균임금 계산에서 제외되는 기간과 임금",
    article: "근로기준법 시행령 제2조",
    url: "https://www.law.go.kr/LSW/lsInfoP.do?lsId=003058",
    verifiedAt: VERIFIED_AT,
  }),
  MOEL_GUIDE: Object.freeze({
    id: "source.moel.retirement_calculator",
    authority: "고용노동부",
    title: "퇴직금 계산기 및 평균임금 안내",
    url: "https://www.moel.go.kr/retirementpayCal.do",
    verifiedAt: VERIFIED_AT,
  }),
});

function parseIso(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function dateToIso(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(value, days) {
  const date = parseIso(value);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return dateToIso(date);
}

function addMonthsClamped(value, months) {
  const date = parseIso(value);
  if (!date) return null;
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const first = new Date(Date.UTC(year, month + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return dateToIso(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day, lastDay))));
}

function hasCompletedCalendarYear(start, retirementDate) {
  const oneYear = addMonthsClamped(start, 12);
  return !!oneYear && typeof retirementDate === "string" && retirementDate >= oneYear;
}

function daysBetween(from, toExclusive) {
  const start = parseIso(from);
  const end = parseIso(toExclusive);
  if (!start || !end || end <= start) return null;
  return Math.floor((end - start) / 86400000);
}

function uniqueSources(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function getAverageWagePeriod(retirementDate) {
  const start = addMonthsClamped(retirementDate, -3);
  if (!start || !retirementDate) return null;
  return {
    start,
    end: addDays(retirementDate, -1),
    days: daysBetween(start, retirementDate),
  };
}

function eligibilityAssessment(facts) {
  const f = normalizeRetirementFacts(facts);
  const serviceDays = serviceDaysBetween(f.employmentStartDate, f.retirementDate);
  const completedOneYear = hasCompletedCalendarYear(f.employmentStartDate, f.retirementDate);

  if (serviceDays === null) return { status: "needs_input", eligible: null, serviceDays: null, qualifyingServiceDays: null };
  if (!completedOneYear) {
    return { status: "under_one_year", eligible: false, serviceDays, qualifyingServiceDays: serviceDays };
  }

  if (f.hadUnder15HourPeriods === null || f.averageWeeklyScheduledHours === null) {
    return { status: "needs_weekly_hours", eligible: null, serviceDays, qualifyingServiceDays: null };
  }

  if (f.hadUnder15HourPeriods === false) {
    if (f.averageWeeklyScheduledHours < 15) {
      return { status: "under_15_hours", eligible: false, serviceDays, qualifyingServiceDays: 0 };
    }
    return { status: "eligible_baseline", eligible: true, serviceDays, qualifyingServiceDays: serviceDays };
  }

  if (f.qualifyingServiceDays === null) {
    return { status: "mixed_hours_needs_qualifying_days", eligible: null, serviceDays, qualifyingServiceDays: null };
  }

  return {
    status: f.qualifyingServiceDays >= 365 ? "eligible_mixed_hours_baseline" : "qualifying_service_under_one_year",
    eligible: f.qualifyingServiceDays >= 365,
    serviceDays,
    qualifyingServiceDays: f.qualifyingServiceDays,
    limitation: "주 15시간 미만 기간이 섞인 경우 실제 계속근로기간 산정은 기간별 소정근로시간 자료로 재검토가 필요합니다.",
  };
}

function averageWageAssessment(facts) {
  const f = normalizeRetirementFacts(facts);
  if (!["severance_pay", "db_pension"].includes(f.benefitType)) return null;
  const period = getAverageWagePeriod(f.retirementDate);
  if (!period) return { status: "needs_input", amount: null, period: null };

  let calculatedAverage = null;
  let basis = null;
  if (f.hasAverageWageExcludedPeriod === true) {
    if (f.adjustedAverageDailyWage === null) {
      return {
        status: "excluded_period_requires_adjusted_average",
        amount: null,
        period,
        basis: "manual_adjusted_average",
      };
    }
    calculatedAverage = f.adjustedAverageDailyWage;
    basis = "manual_adjusted_average";
  } else if (f.hasAverageWageExcludedPeriod === false) {
    if (
      f.threeMonthWageTotal === null ||
      f.annualBonusTotal12m === null ||
      f.annualLeaveAllowanceForAverageWage === null
    ) {
      return { status: "needs_wage_inputs", amount: null, period, basis: "three_month_formula" };
    }
    const adjustedTotal =
      f.threeMonthWageTotal +
      f.annualBonusTotal12m * 3 / 12 +
      f.annualLeaveAllowanceForAverageWage * 3 / 12;
    calculatedAverage = adjustedTotal / period.days;
    basis = "three_month_formula";
  } else {
    return { status: "needs_exclusion_check", amount: null, period, basis: null };
  }

  if (f.ordinaryDailyWage === null) {
    return {
      status: "needs_ordinary_wage",
      amount: null,
      calculatedAverageDailyWage: calculatedAverage,
      period,
      basis,
    };
  }

  return {
    status: calculatedAverage < f.ordinaryDailyWage ? "ordinary_wage_floor_applied" : "calculated",
    amount: Math.max(calculatedAverage, f.ordinaryDailyWage),
    calculatedAverageDailyWage: calculatedAverage,
    ordinaryDailyWage: f.ordinaryDailyWage,
    period,
    basis,
  };
}

function moneyAssessment(facts, eligibility, averageWage) {
  const f = normalizeRetirementFacts(facts);
  if (eligibility.eligible === false) {
    return { status: "not_eligible_baseline", statutoryEstimate: 0, outstandingEstimate: 0 };
  }
  if (eligibility.eligible !== true) {
    return { status: "eligibility_needs_review", statutoryEstimate: null, outstandingEstimate: null };
  }

  if (f.benefitType === "unknown") {
    return { status: "plan_type_needs_confirmation", statutoryEstimate: null, outstandingEstimate: null };
  }

  if (f.benefitType === "dc_pension") {
    if (f.dcExpectedContributionsTotal === null || f.dcPaidContributionsTotal === null) {
      return { status: "dc_contributions_need_input", statutoryEstimate: null, outstandingEstimate: null };
    }
    return {
      status: "dc_contribution_shortfall_estimated",
      statutoryEstimate: Math.round(f.dcExpectedContributionsTotal),
      paidAmount: Math.round(f.dcPaidContributionsTotal),
      outstandingEstimate: Math.max(0, Math.round(f.dcExpectedContributionsTotal - f.dcPaidContributionsTotal)),
      basis: "user_supplied_dc_contribution_totals",
    };
  }

  if (!averageWage || averageWage.amount === null) {
    return { status: "average_wage_needs_input", statutoryEstimate: null, outstandingEstimate: null };
  }

  const serviceDays = eligibility.qualifyingServiceDays;
  const statutoryEstimate = averageWage.amount * 30 * serviceDays / 365;
  const paid = f.amountAlreadyPaid;
  if (paid === null) {
    return {
      status: "paid_amount_needs_input",
      statutoryEstimate: Math.round(statutoryEstimate),
      outstandingEstimate: null,
      basis: "30_day_average_wage_x_service_days_over_365",
    };
  }

  return {
    status: "estimated",
    statutoryEstimate: Math.round(statutoryEstimate),
    paidAmount: Math.round(paid),
    outstandingEstimate: Math.max(0, Math.round(statutoryEstimate - paid)),
    basis: "30_day_average_wage_x_service_days_over_365",
  };
}

export function getRetirementLegalContext(facts = {}, { asOfDate = new Date().toISOString().slice(0, 10) } = {}) {
  const f = normalizeRetirementFacts(facts);
  const eligibility = eligibilityAssessment(f);
  const averageWage = averageWageAssessment(f);
  const money = moneyAssessment(f, eligibility, averageWage);
  const paymentDueDate = f.retirementDate ? addDays(f.retirementDate, 14) : null;
  const paymentLate = !!paymentDueDate && !!asOfDate && asOfDate > paymentDueDate && (money.outstandingEstimate ?? 0) > 0;
  const sources = [RETIREMENT_SOURCES.SCOPE];
  const warnings = [];

  if (f.benefitType === "severance_pay") sources.push(RETIREMENT_SOURCES.SEVERANCE, RETIREMENT_SOURCES.PAYMENT, RETIREMENT_SOURCES.AVERAGE_WAGE, RETIREMENT_SOURCES.MOEL_GUIDE);
  if (f.benefitType === "db_pension") sources.push(RETIREMENT_SOURCES.DB, RETIREMENT_SOURCES.AVERAGE_WAGE, RETIREMENT_SOURCES.MOEL_GUIDE);
  if (f.benefitType === "dc_pension") sources.push(RETIREMENT_SOURCES.DC);
  if (f.hasAverageWageExcludedPeriod === true) sources.push(RETIREMENT_SOURCES.AVERAGE_WAGE_EXCLUSION);
  if (f.benefitType === "unknown") warnings.push("retirement_plan_type_requires_confirmation");
  if (eligibility.limitation) warnings.push("mixed_weekly_hours_requires_period_review");
  if (averageWage?.status === "excluded_period_requires_adjusted_average") warnings.push("average_wage_excluded_period_requires_adjustment");

  return {
    referenceDate: f.retirementDate,
    asOfDate,
    eligibility,
    averageWage,
    money,
    payment: {
      dueDate: paymentDueDate,
      late: paymentLate,
      rule: "퇴직금은 원칙적으로 지급사유 발생일부터 14일 이내 지급",
      extensionCaveat: "특별한 사정이 있는 경우 당사자 합의로 지급기일을 연장할 수 있습니다.",
    },
    sources: uniqueSources(sources),
    warnings,
    verifiedAt: VERIFIED_AT,
  };
}
