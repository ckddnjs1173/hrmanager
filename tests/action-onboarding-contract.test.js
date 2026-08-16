import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACTION_EVENT_TYPES,
  ACTION_ORIGINS,
  COMPLIANCE_ACTION_STATUSES,
  assertComplianceActionTransition,
  deriveActionEventType,
  isActiveComplianceAction,
  isClosedComplianceAction,
  isOverdueComplianceAction,
} from "../lib/compliance-action-contract.js";
import {
  ACTIVATION_SIGNALS,
  COMPANY_PROFILE_FACTS,
  FACT_CONFIDENCE,
  ONBOARDING_REQUIRED_MILESTONES,
  ONBOARDING_STEPS,
  evaluateBusinessActivation,
  evaluateOnboardingReadiness,
  nextOnboardingStep,
  normalizeFactAnswer,
  shouldBlockRiskScan,
  validateEmployeeImportSummary,
} from "../lib/business-onboarding-contract.js";
import { ACTION_STATUSES as RISK_ACTION_STATUSES } from "../lib/risk-contract.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sql = fs.readFileSync(path.join(ROOT, "db/postgres/040_business_onboarding.sql"), "utf8");

function tableBlock(source, table) {
  const match = source.match(new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${table}\\s*\\(([\\s\\S]*?)\\n\\);`, "i"));
  assert.ok(match, `missing table block: ${table}`);
  return match[1];
}

test("compliance action state names remain aligned with Risk Engine persistence", () => {
  assert.deepEqual(COMPLIANCE_ACTION_STATUSES, RISK_ACTION_STATUSES);
  assert.equal(new Set(ACTION_EVENT_TYPES).size, ACTION_EVENT_TYPES.length);
  assert.equal(new Set(ACTION_ORIGINS).size, ACTION_ORIGINS.length);
});

test("action transition requires explicit reasons for blocked and dismissed", () => {
  assert.throws(() => assertComplianceActionTransition("OPEN", "BLOCKED"), /blocked_reason_required/);
  assert.equal(assertComplianceActionTransition("OPEN", "BLOCKED", { blockedReason: "자료 확인 대기" }), true);
  assert.throws(() => assertComplianceActionTransition("IN_PROGRESS", "DISMISSED"), /dismissed_reason_required/);
  assert.equal(assertComplianceActionTransition("IN_PROGRESS", "DISMISSED", { dismissedReason: "외부 자문으로 대체" }), true);
});

test("blocked action cannot be marked done without unblocking", () => {
  assert.throws(() => assertComplianceActionTransition("BLOCKED", "DONE"), /transition_denied/);
  assert.equal(assertComplianceActionTransition("BLOCKED", "IN_PROGRESS"), true);
  assert.equal(deriveActionEventType("BLOCKED", "IN_PROGRESS"), "UNBLOCKED");
});

test("required completion checks prevent cosmetic completion", () => {
  assert.throws(
    () => assertComplianceActionTransition("IN_PROGRESS", "DONE", { completionRequired: true, completionSatisfied: false }),
    /completion_requirement_unsatisfied/
  );
  assert.equal(
    assertComplianceActionTransition("IN_PROGRESS", "DONE", { completionRequired: true, completionSatisfied: true }),
    true
  );
  assert.equal(deriveActionEventType("IN_PROGRESS", "DONE"), "COMPLETED");
});

test("done and dismissed actions may be explicitly reopened with history", () => {
  assert.equal(assertComplianceActionTransition("DONE", "OPEN"), true);
  assert.equal(assertComplianceActionTransition("DISMISSED", "OPEN"), true);
  assert.equal(deriveActionEventType("DONE", "OPEN"), "REOPENED");
  assert.equal(deriveActionEventType("DISMISSED", "OPEN"), "REOPENED");
});

test("overdue status only applies to active actions", () => {
  const now = new Date("2026-08-16T10:00:00.000Z");
  assert.equal(isActiveComplianceAction("OPEN"), true);
  assert.equal(isClosedComplianceAction("DONE"), true);
  assert.equal(isOverdueComplianceAction({ status: "OPEN", dueAt: "2026-08-15T10:00:00.000Z" }, now), true);
  assert.equal(isOverdueComplianceAction({ status: "DONE", dueAt: "2026-08-15T10:00:00.000Z" }, now), false);
  assert.equal(isOverdueComplianceAction({ status: "OPEN", dueAt: "2026-08-17T10:00:00.000Z" }, now), false);
});

test("onboarding progression reaches risk and action without forcing unknown legal facts", () => {
  assert.equal(nextOnboardingStep([]), "COMPANY_PROFILE");
  assert.equal(nextOnboardingStep(["COMPANY_PROFILE", "WORKPLACES"]), "COMPLIANCE_SCOPE");
  assert.deepEqual(normalizeFactAnswer(null, "UNKNOWN"), { value: null, confidence: "UNKNOWN" });
  assert.ok(FACT_CONFIDENCE.includes("UNKNOWN"));
  assert.ok(COMPANY_PROFILE_FACTS.includes("rulesOfEmploymentExists"));
});

test("risk scan blocks only on minimum evaluation target facts", () => {
  assert.deepEqual(shouldBlockRiskScan({}), { blocked: true, reason: "company_profile_required" });
  assert.deepEqual(
    shouldBlockRiskScan({ companyProfileSaved: true }),
    { blocked: true, reason: "workplace_required" }
  );
  assert.deepEqual(
    shouldBlockRiskScan({ companyProfileSaved: true, workplaceCreated: true, complianceScopeCertain: false }),
    { blocked: false, reason: null }
  );
});

test("Business activation requires core milestones plus genuine first value interaction", () => {
  const baseline = Object.fromEntries(ONBOARDING_REQUIRED_MILESTONES.map((key) => [key, true]));
  const noSignal = evaluateBusinessActivation(baseline);
  assert.equal(noSignal.activated, false);
  assert.equal(noSignal.activationSignal, null);

  for (const signal of ACTIVATION_SIGNALS) {
    const result = evaluateBusinessActivation({ ...baseline, [signal]: true });
    assert.equal(result.activated, true);
    assert.equal(result.activationSignal, signal);
  }

  const missingEmployee = evaluateBusinessActivation({ ...baseline, employeeCountAtLeastOne: false, firstActionStarted: true });
  assert.equal(missingEmployee.activated, false);
  assert.ok(missingEmployee.missingMilestones.includes("employeeCountAtLeastOne"));
});

test("onboarding completion readiness is distinct from activation", () => {
  const state = Object.fromEntries(ONBOARDING_REQUIRED_MILESTONES.map((key) => [key, true]));
  assert.deepEqual(evaluateOnboardingReadiness(state), { readyForCompletion: true, missing: [] });
  assert.equal(evaluateBusinessActivation(state).activated, false);
  assert.equal(ONBOARDING_STEPS.at(-1), "COMPLETE");
});

test("employee import summary cannot silently drop rows", () => {
  assert.deepEqual(validateEmployeeImportSummary({ total: 10, accepted: 8, rejected: 2 }), { ok: true });
  assert.deepEqual(
    validateEmployeeImportSummary({ total: 10, accepted: 8, rejected: 1 }),
    { ok: false, error: "employee_import_count_mismatch" }
  );
});

test("action/onboarding persistence is tenant-owned and auditable", () => {
  for (const table of [
    "compliance_action_events",
    "compliance_action_dependencies",
    "business_onboarding_sessions",
    "business_onboarding_facts",
    "employee_import_jobs",
    "onboarding_events",
  ]) {
    assert.match(tableBlock(sql, table), /\borganization_id\b/i, `${table} must carry organization_id`);
  }

  assert.match(tableBlock(sql, "compliance_action_events"), /from_status/i);
  assert.match(tableBlock(sql, "compliance_action_events"), /to_status/i);
  assert.match(tableBlock(sql, "compliance_action_dependencies"), /CHECK \(compliance_action_id <> depends_on_action_id\)/i);
  assert.match(tableBlock(sql, "business_onboarding_sessions"), /activation_signal/i);
  assert.match(tableBlock(sql, "business_onboarding_facts"), /confidence/i);
  assert.match(tableBlock(sql, "employee_import_jobs"), /accepted_rows/i);
  assert.match(tableBlock(sql, "employee_import_jobs"), /rejected_rows/i);
});
