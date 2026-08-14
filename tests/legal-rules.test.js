import test from "node:test";
import assert from "node:assert/strict";

import {
  getWageLegalContext,
  selectMinimumWageRule,
} from "../lib/legal-rules.js";

test("minimum wage rule is selected by the case reference date", () => {
  assert.equal(selectMinimumWageRule("2024-07-15")?.hourly, 9860);
  assert.equal(selectMinimumWageRule("2025-07-15")?.hourly, 10030);
  assert.equal(selectMinimumWageRule("2026-07-15")?.hourly, 10320);
});

test("unsupported dates do not silently fall back to the current minimum wage", () => {
  assert.equal(selectMinimumWageRule("2022-12-31"), null);

  const context = getWageLegalContext({
    unpaidPeriodEnd: "2022-12-31",
  });

  assert.equal(context.minimumWage, null);
  assert.ok(context.warnings.includes("minimum_wage_version_not_supported"));
});

test("wage legal context uses unpaid period end as its primary reference date", () => {
  const context = getWageLegalContext({
    employmentStatus: "resigned",
    employmentEndDate: "2026-08-01",
    unpaidPeriodStart: "2026-07-01",
    unpaidPeriodEnd: "2026-07-31",
  }, { asOfDate: "2026-08-15" });

  assert.equal(context.referenceDate, "2026-07-31");
  assert.equal(context.minimumWage.hourly, 10320);
  assert.equal(context.settlementRule.days, 14);
  assert.equal(context.delayInterestRule.annualRate, 0.2);
  assert.ok(context.sources.some((source) => source.article === "근로기준법 제36조"));
});
