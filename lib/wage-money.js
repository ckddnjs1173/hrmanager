import { getWageLegalContext } from "./legal-rules.js";

function numberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function isIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function utcDate(value) {
  if (!isIsoDate(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function addUtcDays(value, days) {
  const date = utcDate(value);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function inclusiveDays(from, to) {
  const start = utcDate(from);
  const end = utcDate(to);
  if (!start || !end || end < start) return 0;
  return Math.floor((end - start) / 86400000) + 1;
}

function isFullCalendarMonth(start, end) {
  const startDate = utcDate(start);
  const endDate = utcDate(end);
  if (!startDate || !endDate) return false;
  if (startDate.getUTCDate() !== 1) return false;
  const last = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 0));
  return endDate.toISOString().slice(0, 10) === last.toISOString().slice(0, 10);
}

function roundWon(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function deriveExpectedPrincipal(facts) {
  const explicit = numberOrNull(facts.expectedUnpaidAmount);
  if (explicit !== null) {
    return { amount: explicit, basis: "user_expected_unpaid_amount" };
  }

  const monthlyBasePay = numberOrNull(facts.monthlyBasePay);
  if (
    monthlyBasePay !== null &&
    isFullCalendarMonth(facts.unpaidPeriodStart, facts.unpaidPeriodEnd)
  ) {
    return { amount: monthlyBasePay, basis: "full_month_monthly_base_pay" };
  }

  const dailyWage = numberOrNull(facts.dailyWage);
  const unpaidWorkDays = numberOrNull(facts.unpaidWorkDays);
  if (dailyWage !== null && unpaidWorkDays !== null) {
    return { amount: dailyWage * unpaidWorkDays, basis: "daily_wage_x_unpaid_days" };
  }

  const hourlyWage = numberOrNull(facts.hourlyWage);
  const unpaidWorkHours = numberOrNull(facts.unpaidWorkHours);
  if (hourlyWage !== null && unpaidWorkHours !== null) {
    return { amount: hourlyWage * unpaidWorkHours, basis: "hourly_wage_x_unpaid_hours" };
  }

  return { amount: null, basis: null };
}

function calculateMinimumWageCheck(facts, legal) {
  const rule = legal?.minimumWage;
  if (!rule) return null;

  const hourlyWage = numberOrNull(facts.hourlyWage);
  if (hourlyWage !== null) {
    const gapPerHour = Math.max(0, rule.hourly - hourlyWage);
    const unpaidWorkHours = numberOrNull(facts.unpaidWorkHours);
    return {
      id: "wage.minimum_wage_check",
      type: "minimum_wage_check",
      status: gapPerHour > 0 ? "possible_shortfall" : "meets_minimum",
      referenceDate: legal.referenceDate,
      paidHourly: hourlyWage,
      legalHourly: rule.hourly,
      gapPerHour,
      estimatedShortfall: gapPerHour > 0 && unpaidWorkHours !== null ? roundWon(gapPerHour * unpaidWorkHours) : null,
      sourceId: rule.source.id,
    };
  }

  const monthlyBasePay = numberOrNull(facts.monthlyBasePay);
  const monthlyPaidHours = numberOrNull(facts.monthlyPaidHours);
  if (monthlyBasePay !== null && monthlyPaidHours !== null && monthlyPaidHours > 0) {
    const convertedHourly = monthlyBasePay / monthlyPaidHours;
    const gapPerHour = Math.max(0, rule.hourly - convertedHourly);
    return {
      id: "wage.minimum_wage_check",
      type: "minimum_wage_check",
      status: gapPerHour > 0 ? "possible_shortfall" : "meets_minimum",
      referenceDate: legal.referenceDate,
      paidHourly: roundWon(convertedHourly),
      legalHourly: rule.hourly,
      gapPerHour: roundWon(gapPerHour),
      estimatedShortfall: gapPerHour > 0 ? roundWon(gapPerHour * monthlyPaidHours) : null,
      sourceId: rule.source.id,
    };
  }

  return {
    id: "wage.minimum_wage_reference",
    type: "minimum_wage_reference",
    status: "reference_only",
    referenceDate: legal.referenceDate,
    legalHourly: rule.hourly,
    legalMonthly209h: rule.monthly209h,
    sourceId: rule.source.id,
  };
}

function calculatePremiums(facts) {
  const employeeCount = numberOrNull(facts.workplaceEmployeeCount);
  const ordinaryHourly = numberOrNull(facts.ordinaryHourlyWage) ?? numberOrNull(facts.hourlyWage);
  const selected = [facts.overtimeWork, facts.nightWork, facts.holidayWork].some((v) => v === true);

  if (!selected) {
    return { amount: 0, status: "not_claimed", missingFacts: [], breakdown: [] };
  }

  const missingFacts = [];
  if (employeeCount === null) missingFacts.push("workplaceEmployeeCount");
  if (ordinaryHourly === null) missingFacts.push("ordinaryHourlyWage");

  if (employeeCount !== null && employeeCount < 5) {
    return {
      amount: null,
      status: "statutory_premium_not_applied_by_baseline",
      missingFacts,
      breakdown: [],
      limitation: "상시 5인 미만 사업장의 법정 가산 적용 여부는 별도 규칙 검토가 필요합니다.",
    };
  }

  if (missingFacts.length) {
    return { amount: null, status: "needs_input", missingFacts, breakdown: [] };
  }

  const hours = {
    overtime: numberOrNull(facts.overtimeHours),
    night: numberOrNull(facts.nightHours),
    holidayWithin8: numberOrNull(facts.holidayHoursWithin8),
    holidayOver8: numberOrNull(facts.holidayHoursOver8),
  };

  if (facts.overtimeWork === true && hours.overtime === null) missingFacts.push("overtimeHours");
  if (facts.nightWork === true && hours.night === null) missingFacts.push("nightHours");
  if (facts.holidayWork === true && hours.holidayWithin8 === null && hours.holidayOver8 === null) {
    missingFacts.push("holidayHoursWithin8");
  }

  if (missingFacts.length) {
    return { amount: null, status: "needs_input", missingFacts: [...new Set(missingFacts)], breakdown: [] };
  }

  const breakdown = [];
  if (facts.overtimeWork === true && hours.overtime > 0) {
    breakdown.push({ id: "overtime_premium", hours: hours.overtime, rate: 0.5, amount: roundWon(ordinaryHourly * hours.overtime * 0.5) });
  }
  if (facts.nightWork === true && hours.night > 0) {
    breakdown.push({ id: "night_premium", hours: hours.night, rate: 0.5, amount: roundWon(ordinaryHourly * hours.night * 0.5) });
  }
  if (facts.holidayWork === true && hours.holidayWithin8 > 0) {
    breakdown.push({ id: "holiday_premium_within_8h", hours: hours.holidayWithin8, rate: 0.5, amount: roundWon(ordinaryHourly * hours.holidayWithin8 * 0.5) });
  }
  if (facts.holidayWork === true && hours.holidayOver8 > 0) {
    breakdown.push({ id: "holiday_premium_over_8h", hours: hours.holidayOver8, rate: 1, amount: roundWon(ordinaryHourly * hours.holidayOver8) });
  }

  return {
    amount: breakdown.reduce((sum, item) => sum + item.amount, 0),
    status: "estimated",
    missingFacts: [],
    ordinaryHourlyWage: ordinaryHourly,
    breakdown,
  };
}

function calculateDelayInterest(facts, legal, principal, asOfDate) {
  if (!legal?.delayInterestRule || principal === null || principal <= 0) return null;
  if (!isIsoDate(facts.employmentEndDate) || !isIsoDate(asOfDate)) return null;

  const interestStartDate = addUtcDays(facts.employmentEndDate, 15);
  const delayDays = inclusiveDays(interestStartDate, asOfDate);
  const annualRate = legal.delayInterestRule.annualRate;

  return {
    id: "wage.delay_interest_estimate",
    type: "delay_interest",
    status: delayDays > 0 ? "estimated" : "not_yet_accruing",
    principal,
    annualRate,
    interestStartDate,
    asOfDate,
    delayDays,
    amount: roundWon(principal * annualRate * delayDays / 365),
    sourceIds: [legal.delayInterestRule.source.id, legal.delayInterestRule.rateSource.id],
    limitation: "지급기일 연장 합의 또는 법정 적용제외 사유가 있으면 실제 지연이자는 달라질 수 있습니다.",
  };
}

export function getWageMoneyMissingFacts(facts = {}) {
  const missing = [];
  const principal = deriveExpectedPrincipal(facts);
  if (principal.amount === null) missing.push("expectedUnpaidAmount");

  const premium = calculatePremiums(facts);
  if (premium.status === "needs_input") missing.push(...premium.missingFacts);

  return [...new Set(missing)];
}

export function calculateWageMoney(facts = {}, { legal = null, asOfDate = null } = {}) {
  const safeLegal = legal || getWageLegalContext(facts, { asOfDate });
  const expected = deriveExpectedPrincipal(facts);
  const alreadyPaid = numberOrNull(facts.alreadyPaidAmount) ?? 0;
  const principal = expected.amount === null ? null : roundWon(Math.max(0, expected.amount - alreadyPaid));
  const premiums = calculatePremiums(facts);
  const minimumWage = calculateMinimumWageCheck(facts, safeLegal);
  const delayInterest = calculateDelayInterest(facts, safeLegal, principal, asOfDate);
  const calculations = [];

  if (principal !== null) {
    calculations.push({
      id: "wage.unpaid_principal",
      type: "unpaid_principal",
      status: "estimated",
      expectedAmount: roundWon(expected.amount),
      alreadyPaidAmount: roundWon(alreadyPaid),
      amount: principal,
      basis: expected.basis,
    });
  }
  if (minimumWage) calculations.push(minimumWage);
  if (premiums.status !== "not_claimed") {
    calculations.push({
      id: "wage.statutory_premiums",
      type: "statutory_premiums",
      status: premiums.status,
      amount: premiums.amount,
      breakdown: premiums.breakdown,
      missingFacts: premiums.missingFacts,
      limitation: premiums.limitation || null,
    });
  }
  if (delayInterest) calculations.push(delayInterest);

  const premiumAmount = typeof premiums.amount === "number" ? premiums.amount : 0;
  const interestAmount = delayInterest?.amount || 0;
  const knownTotalEstimate = principal === null ? null : roundWon(principal + premiumAmount + interestAmount);
  const missingFacts = getWageMoneyMissingFacts(facts);

  return {
    status: missingFacts.length ? "needs_input" : "estimated",
    referenceDate: safeLegal.referenceDate,
    asOfDate,
    principal,
    principalBasis: expected.basis,
    premiumEstimate: premiums.amount,
    delayInterestEstimate: delayInterest?.amount ?? null,
    knownTotalEstimate,
    missingFacts,
    calculations,
    limitations: [
      "표시 금액은 입력 사실에 따른 1차 계산값이며 실제 청구액은 근로시간·임금구성·사업장 규모·합의 여부에 따라 달라질 수 있습니다.",
      ...(delayInterest?.limitation ? [delayInterest.limitation] : []),
      ...(premiums.limitation ? [premiums.limitation] : []),
    ],
  };
}
