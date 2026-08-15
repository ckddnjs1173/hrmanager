import test from "node:test";
import assert from "node:assert/strict";

import { getAverageWagePeriod, getRetirementLegalContext } from "../lib/retirement-rules.js";

test("retirement average wage period is the three calendar months before retirement date", () => {
  assert.deepEqual(getAverageWagePeriod("2026-08-01"), { start: "2026-05-01", end: "2026-07-31", days: 92 });
});

test("standard severance case calculates average wage and service-day prorated benefit", () => {
  const legal = getRetirementLegalContext({
    benefitType: "severance_pay",
    employmentStartDate: "2024-01-01",
    retirementDate: "2026-08-01",
    averageWeeklyScheduledHours: 40,
    hadUnder15HourPeriods: false,
    hasAverageWageExcludedPeriod: false,
    threeMonthWageTotal: 9200000,
    annualBonusTotal12m: 1200000,
    annualLeaveAllowanceForAverageWage: 400000,
    ordinaryDailyWage: 100000,
    amountAlreadyPaid: 0,
  }, { asOfDate: "2026-08-20" });

  assert.equal(legal.eligibility.eligible, true);
  assert.equal(legal.eligibility.serviceDays, 943);
  assert.equal(legal.averageWage.period.days, 92);
  assert.ok(Math.abs(legal.averageWage.amount - 104347.82608695653) < 0.01);
  assert.equal(legal.money.statutoryEstimate, 8087671);
  assert.equal(legal.money.outstandingEstimate, 8087671);
  assert.equal(legal.payment.dueDate, "2026-08-15");
  assert.equal(legal.payment.late, true);
  assert.ok(legal.sources.some((source) => source.article === "근로자퇴직급여 보장법 제8조"));
});

test("ordinary daily wage becomes the floor when calculated average wage is lower", () => {
  const legal = getRetirementLegalContext({
    benefitType: "severance_pay",
    employmentStartDate: "2025-01-01",
    retirementDate: "2026-01-01",
    averageWeeklyScheduledHours: 40,
    hadUnder15HourPeriods: false,
    hasAverageWageExcludedPeriod: false,
    threeMonthWageTotal: 6000000,
    annualBonusTotal12m: 0,
    annualLeaveAllowanceForAverageWage: 0,
    ordinaryDailyWage: 80000,
    amountAlreadyPaid: 0,
  });
  assert.equal(legal.averageWage.status, "ordinary_wage_floor_applied");
  assert.equal(legal.averageWage.amount, 80000);
  assert.equal(legal.money.statutoryEstimate, 2400000);
});

test("under one calendar year is not treated as eligible baseline", () => {
  const legal = getRetirementLegalContext({
    benefitType: "severance_pay",
    employmentStartDate: "2025-08-02",
    retirementDate: "2026-08-01",
    averageWeeklyScheduledHours: 40,
    hadUnder15HourPeriods: false,
  });
  assert.equal(legal.eligibility.status, "under_one_year");
  assert.equal(legal.eligibility.eligible, false);
  assert.equal(legal.money.statutoryEstimate, 0);
});

test("mixed under-15-hour periods require qualifying service days instead of guessing", () => {
  const pending = getRetirementLegalContext({
    benefitType: "severance_pay",
    employmentStartDate: "2024-01-01",
    retirementDate: "2026-08-01",
    averageWeeklyScheduledHours: 25,
    hadUnder15HourPeriods: true,
  });
  assert.equal(pending.eligibility.status, "mixed_hours_needs_qualifying_days");
  assert.equal(pending.eligibility.eligible, null);

  const qualified = getRetirementLegalContext({
    benefitType: "severance_pay",
    employmentStartDate: "2024-01-01",
    retirementDate: "2026-08-01",
    averageWeeklyScheduledHours: 25,
    hadUnder15HourPeriods: true,
    qualifyingServiceDays: 500,
  });
  assert.equal(qualified.eligibility.eligible, true);
});

test("DC case uses contribution totals and never applies the average-wage formula", () => {
  const legal = getRetirementLegalContext({
    benefitType: "dc_pension",
    employmentStartDate: "2024-01-01",
    retirementDate: "2026-08-01",
    averageWeeklyScheduledHours: 40,
    hadUnder15HourPeriods: false,
    dcExpectedContributionsTotal: 6000000,
    dcPaidContributionsTotal: 5200000,
  });
  assert.equal(legal.averageWage, null);
  assert.equal(legal.money.status, "dc_contribution_shortfall_estimated");
  assert.equal(legal.money.outstandingEstimate, 800000);
  assert.ok(legal.sources.some((source) => source.article === "근로자퇴직급여 보장법 제20조"));
});
