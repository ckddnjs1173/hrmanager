import test from "node:test";
import assert from "node:assert/strict";

import { getWageLegalContext } from "../lib/legal-rules.js";
import { calculateWageMoney, getWageMoneyMissingFacts } from "../lib/wage-money.js";

const resignedFullMonth = {
  employmentStatus: "resigned",
  employmentEndDate: "2026-08-01",
  unpaidPeriodStart: "2026-07-01",
  unpaidPeriodEnd: "2026-07-31",
  monthlyBasePay: 3000000,
  alreadyPaidAmount: 500000,
};

test("full calendar month derives unpaid principal from monthly base pay", () => {
  const legal = getWageLegalContext(resignedFullMonth, { asOfDate: "2026-08-20" });
  const money = calculateWageMoney(resignedFullMonth, { legal, asOfDate: "2026-08-20" });

  assert.equal(money.principal, 2500000);
  assert.equal(money.principalBasis, "full_month_monthly_base_pay");
  assert.equal(money.calculations.find((item) => item.id === "wage.unpaid_principal")?.amount, 2500000);
});

test("partial month requires an explicit expected unpaid amount instead of guessing", () => {
  const facts = {
    ...resignedFullMonth,
    unpaidPeriodStart: "2026-07-15",
  };

  assert.ok(getWageMoneyMissingFacts(facts).includes("expectedUnpaidAmount"));
  const money = calculateWageMoney(facts, { asOfDate: "2026-08-20" });
  assert.equal(money.principal, null);
});

test("minimum wage check uses the legal version for the case period", () => {
  const money2025 = calculateWageMoney({
    hourlyWage: 10000,
    unpaidWorkHours: 10,
    unpaidPeriodEnd: "2025-06-30",
    expectedUnpaidAmount: 100000,
    alreadyPaidAmount: 0,
  }, { asOfDate: "2026-08-15" });

  const check = money2025.calculations.find((item) => item.type === "minimum_wage_check");
  assert.equal(check.legalHourly, 10030);
  assert.equal(check.gapPerHour, 30);
  assert.equal(check.estimatedShortfall, 300);
});

test("statutory premium estimate requires five or more employees and work details", () => {
  const base = {
    expectedUnpaidAmount: 1000000,
    alreadyPaidAmount: 0,
    unpaidPeriodEnd: "2026-07-31",
    hourlyWage: 12000,
    overtimeWork: true,
    nightWork: false,
    holidayWork: false,
  };

  const missing = calculateWageMoney({ ...base, workplaceEmployeeCount: 6 }, { asOfDate: "2026-08-15" });
  assert.ok(missing.missingFacts.includes("overtimeHours"));

  const fivePlus = calculateWageMoney({
    ...base,
    workplaceEmployeeCount: 6,
    overtimeHours: 10,
  }, { asOfDate: "2026-08-15" });
  assert.equal(fivePlus.premiumEstimate, 60000);

  const small = calculateWageMoney({
    ...base,
    workplaceEmployeeCount: 4,
    overtimeHours: 10,
  }, { asOfDate: "2026-08-15" });
  assert.equal(small.premiumEstimate, null);
});

test("retirement delay interest starts after the 14-day settlement period", () => {
  const legal = getWageLegalContext(resignedFullMonth, { asOfDate: "2026-08-20" });
  const money = calculateWageMoney(resignedFullMonth, { legal, asOfDate: "2026-08-20" });
  const interest = money.calculations.find((item) => item.type === "delay_interest");

  assert.equal(interest.interestStartDate, "2026-08-16");
  assert.equal(interest.delayDays, 5);
  assert.equal(interest.annualRate, 0.2);
  assert.equal(interest.amount, Math.round(2500000 * 0.2 * 5 / 365));
});
