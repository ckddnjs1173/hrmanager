import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACTION_STATUSES,
  RISK_APPLICABILITY,
  RISK_DOMAINS,
  RISK_SEVERITIES,
  RISK_STATUSES,
  buildRiskFinding,
  createRiskFingerprint,
  shouldCreateAction,
  summarizeRiskDashboard,
  validateRiskRuleDefinition,
} from "../lib/risk-contract.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const riskSql = fs.readFileSync(path.join(ROOT, "db/postgres/030_business_risk.sql"), "utf8");

const RULE = Object.freeze({
  id: "contract.example",
  version: "2026.1",
  domain: "employment_contract",
  title: "계약 점검 예시",
  severity: "HIGH",
  requiredFacts: ["contractExists"],
  legalSourceIds: ["source.example"],
  evaluatorKey: "contract.example",
  recommendedActionKey: "contract.review",
});

function tableBlock(sql, table) {
  const match = sql.match(new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${table}\\s*\\(([\\s\\S]*?)\\n\\);`, "i"));
  assert.ok(match, `missing table block: ${table}`);
  return match[1];
}

test("risk taxonomy is finite and unique", () => {
  for (const list of [RISK_DOMAINS, RISK_SEVERITIES, RISK_APPLICABILITY, RISK_STATUSES, ACTION_STATUSES]) {
    assert.equal(new Set(list).size, list.length);
  }
});

test("risk rule definition requires deterministic evaluator and legal sources", () => {
  assert.equal(validateRiskRuleDefinition(RULE).ok, true);
  const noSource = validateRiskRuleDefinition({ ...RULE, legalSourceIds: [] });
  assert.equal(noSource.ok, false);
  assert.ok(noSource.errors.includes("legal_source_ids_required"));
  const badSeverity = validateRiskRuleDefinition({ ...RULE, severity: "SCARY" });
  assert.equal(badSeverity.ok, false);
  assert.ok(badSeverity.errors.includes("severity_invalid"));
});

test("risk fingerprint is stable and version-sensitive", () => {
  const input = {
    organizationId: "org-a",
    complianceScopeId: "scope-a",
    subjectType: "employee",
    subjectId: "emp-a",
    ruleId: RULE.id,
    ruleVersion: RULE.version,
  };
  assert.equal(createRiskFingerprint(input), createRiskFingerprint({ ...input }));
  assert.notEqual(createRiskFingerprint(input), createRiskFingerprint({ ...input, ruleVersion: "2026.2" }));
  assert.notEqual(createRiskFingerprint(input), createRiskFingerprint({ ...input, organizationId: "org-b" }));
});

test("uncertain finding preserves missing facts and does not create a remediation action", () => {
  const finding = buildRiskFinding({
    organizationId: "org-a",
    complianceScopeId: "scope-a",
    rule: RULE,
    applicability: "UNCERTAIN",
    missingFacts: ["contractExists"],
  });
  assert.equal(finding.status, "ACKNOWLEDGED");
  assert.deepEqual(finding.missingFacts, ["contractExists"]);
  assert.equal(shouldCreateAction(finding), false);
});

test("applicable high finding opens and becomes an action candidate", () => {
  const finding = buildRiskFinding({
    organizationId: "org-a",
    rule: RULE,
    applicability: "APPLIES",
    explanation: "deterministic test result",
  });
  assert.equal(finding.status, "OPEN");
  assert.equal(finding.severity, "HIGH");
  assert.equal(shouldCreateAction(finding), true);
});

test("risk dashboard counts active risk without fake numeric score", () => {
  const summary = summarizeRiskDashboard([
    { severity: "CRITICAL", applicability: "APPLIES", status: "OPEN", actionStatus: "OPEN" },
    { severity: "HIGH", applicability: "APPLIES", status: "ACKNOWLEDGED", actionStatus: "DONE" },
    { severity: "MEDIUM", applicability: "UNCERTAIN", status: "ACKNOWLEDGED" },
    { severity: "HIGH", applicability: "APPLIES", status: "SUPPRESSED", actionStatus: "OPEN" },
    { severity: "INFO", applicability: "APPLIES", status: "RESOLVED" },
  ]);
  assert.deepEqual(summary, {
    CRITICAL: 1,
    HIGH: 1,
    MEDIUM: 0,
    INFO: 0,
    uncertain: 1,
    openActions: 1,
  });
  assert.equal("score" in summary, false);
});

test("risk persistence is tenant-owned and duplicate-safe", () => {
  for (const table of ["risk_evaluation_runs", "risk_findings", "compliance_actions", "risk_finding_events"]) {
    assert.match(tableBlock(riskSql, table), /\borganization_id\b/i, `${table} must be tenant-owned`);
  }
  const finding = tableBlock(riskSql, "risk_findings");
  assert.match(finding, /UNIQUE\(organization_id, fingerprint\)/i);
  assert.match(finding, /rule_version\s+TEXT\s+NOT NULL/i);
  assert.match(finding, /legal_source_ids\s+JSONB\s+NOT NULL/i);
  assert.match(finding, /applicability\s+TEXT\s+NOT NULL/i);
});

test("action persistence carries explicit lifecycle and ownership", () => {
  const action = tableBlock(riskSql, "compliance_actions");
  for (const status of ACTION_STATUSES) assert.match(action, new RegExp(`'${status}'`));
  assert.match(action, /owner_membership_id/i);
  assert.match(action, /due_at\s+TIMESTAMPTZ/i);
});
