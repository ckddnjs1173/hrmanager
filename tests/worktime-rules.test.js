import test from "node:test";
import assert from "node:assert/strict";

import { getWorktimeLegalContext } from "../lib/worktime-rules.js";

test("five-plus standard system calculates overlapping premium buckets without double counting", () => {
  const legal = getWorktimeLegalContext({
    referenceDate: "2026-08-16",
    workplaceEmployeeCount: 8,
    standardWorkSystem: true,
    ordinaryHourlyWage: 20000,
    baseWageForExtraHoursPaid: true,
    amountAlreadyPaid: 0,
    weekdayOvertimeDayHours: 10,
    weekdayOvertimeNightHours: 2,
    holidayDayUpTo8Hours: 0,
    holidayNightUpTo8Hours: 0,
    holidayDayOver8Hours: 0,
    holidayNightOver8Hours: 0,
    maxWeeklyOvertimeHours: 13,
    representativeDailyWorkHours: 9,
    representativeBreakMinutes: 30,
  });

  assert.equal(legal.fivePlus, true);
  assert.equal(legal.premium.status, "estimated_with_statutory_premiums");
  assert.equal(legal.premium.grossEstimate, 140000);
  assert.equal(legal.premium.outstandingEstimate, 140000);
  assert.equal(legal.weeklyOvertime.status, "possible_over_12_hour_limit");
  assert.equal(legal.break.status, "possible_shortfall");
  assert.equal(legal.break.requiredMinutes, 60);
  assert.ok(legal.sources.some((source) => source.article === "근로기준법 제56조"));
});

test("small workplace does not auto-apply article 56 statutory premiums", () => {
  const legal = getWorktimeLegalContext({
    referenceDate: "2026-08-16",
    workplaceEmployeeCount: 4,
    standardWorkSystem: true,
    ordinaryHourlyWage: 20000,
    baseWageForExtraHoursPaid: true,
    amountAlreadyPaid: 0,
    weekdayOvertimeDayHours: 10,
    weekdayOvertimeNightHours: 2,
    holidayDayUpTo8Hours: 0,
    holidayNightUpTo8Hours: 0,
    holidayDayOver8Hours: 0,
    holidayNightOver8Hours: 0,
  });

  assert.equal(legal.fivePlus, false);
  assert.equal(legal.premium.status, "estimated_base_wage_only_small_workplace");
  assert.equal(legal.premium.grossEstimate, 0);
  assert.equal(legal.premium.outstandingEstimate, 0);
  assert.ok(legal.warnings.includes("small_workplace_no_article56_premium_baseline"));
});

test("small workplace can estimate unpaid base wage for extra worked hours without adding statutory premium", () => {
  const legal = getWorktimeLegalContext({
    referenceDate: "2026-08-16",
    workplaceEmployeeCount: 4,
    standardWorkSystem: true,
    ordinaryHourlyWage: 20000,
    baseWageForExtraHoursPaid: false,
    amountAlreadyPaid: 0,
    weekdayOvertimeDayHours: 10,
    weekdayOvertimeNightHours: 2,
    holidayDayUpTo8Hours: 0,
    holidayNightUpTo8Hours: 0,
    holidayDayOver8Hours: 0,
    holidayNightOver8Hours: 0,
  });

  assert.equal(legal.premium.grossEstimate, 240000);
  assert.equal(legal.premium.components.find((item) => item.key === "weekdayOvertimeDayHours")?.multiplier, 1);
  assert.equal(legal.premium.components.find((item) => item.key === "weekdayOvertimeNightHours")?.multiplier, 1);
});

test("alternative work system blocks automatic premium calculation", () => {
  const legal = getWorktimeLegalContext({
    referenceDate: "2026-08-16",
    workplaceEmployeeCount: 10,
    standardWorkSystem: false,
  });
  assert.equal(legal.premium.status, "unsupported_alternative_work_system");
  assert.equal(legal.premium.outstandingEstimate, null);
  assert.ok(legal.warnings.includes("alternative_work_system_requires_separate_review"));
});
