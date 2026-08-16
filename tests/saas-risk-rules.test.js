import test from "node:test";
import assert from "node:assert/strict";
import { AUDIT_ACTIONS } from "../lib/access-control-contract.js";
import { STATUTORY_FACTS_2026 } from "../lib/statutory-facts.js";
import {
  BUSINESS_RISK_RULES,
  evaluateBusinessRiskRule,
  getBusinessRiskRule,
} from "../lib/saas-risk-rules.js";

test("Business risk rule pack is small, deterministic and source-backed", () => {
  assert.equal(BUSINESS_RISK_RULES.length, 3);
  for (const rule of BUSINESS_RISK_RULES) {
    assert.ok(rule.id);
    assert.ok(rule.version);
    assert.ok(rule.evaluatorKey);
    assert.ok(Array.isArray(rule.legalSourceIds));
    assert.ok(rule.legalSourceIds.length >= 1);
  }
});

test("uncertain ComplianceScope stays UNCERTAIN instead of becoming a violation", () => {
  const rule = getBusinessRiskRule("business.scope.verification_required");
  const result = evaluateBusinessRiskRule(rule, { scope: { id: "scope_1", status: "UNCERTAIN" } });
  assert.equal(result.applicability, "UNCERTAIN");
  assert.deepEqual(result.missingFacts, ["complianceScope.verification"]);
});

test("missing employment facts stay UNCERTAIN", () => {
  const rule = getBusinessRiskRule("business.employment.core_terms_missing");
  const result = evaluateBusinessRiskRule(rule, {
    employment: { weeklyContractHours: null, wageType: "HOURLY", baseWage: null },
  });
  assert.equal(result.applicability, "UNCERTAIN");
  assert.deepEqual(result.missingFacts, ["employment.weeklyContractHours", "employment.baseWage"]);
});

test("2026 hourly minimum wage boundary is deterministic", () => {
  const rule = getBusinessRiskRule("business.wage.hourly_below_minimum_2026");
  const below = evaluateBusinessRiskRule(rule, {
    employment: { wageType: "HOURLY", baseWage: STATUTORY_FACTS_2026.minWageHour - 1 },
  });
  assert.equal(below.applicability, "APPLIES");

  const exact = evaluateBusinessRiskRule(rule, {
    employment: { wageType: "HOURLY", baseWage: STATUTORY_FACTS_2026.minWageHour },
  });
  assert.equal(exact.applicability, "NOT_APPLIES");

  const monthly = evaluateBusinessRiskRule(rule, {
    employment: { wageType: "MONTHLY", baseWage: 1000 },
  });
  assert.equal(monthly.applicability, "NOT_APPLIES");
});

test("Risk runtime audit events are part of the canonical audit catalog", () => {
  assert.ok(AUDIT_ACTIONS.includes("risk.scan"));
  assert.ok(AUDIT_ACTIONS.includes("compliance.action.status"));
});
