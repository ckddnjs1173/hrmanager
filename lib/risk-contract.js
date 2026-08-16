import crypto from "node:crypto";

export const RISK_DOMAINS = Object.freeze([
  "workplace_scope",
  "employment_contract",
  "wage",
  "worktime",
  "annual_leave",
  "termination",
  "rules_of_employment",
  "other",
]);

export const RISK_SEVERITIES = Object.freeze(["CRITICAL", "HIGH", "MEDIUM", "INFO"]);
export const RISK_APPLICABILITY = Object.freeze(["APPLIES", "NOT_APPLIES", "UNCERTAIN"]);
export const RISK_STATUSES = Object.freeze(["OPEN", "ACKNOWLEDGED", "RESOLVED", "SUPPRESSED"]);
export const ACTION_STATUSES = Object.freeze(["OPEN", "IN_PROGRESS", "BLOCKED", "DONE", "DISMISSED"]);

export const RISK_RULE_REQUIRED_FIELDS = Object.freeze([
  "id",
  "version",
  "domain",
  "title",
  "severity",
  "requiredFacts",
  "legalSourceIds",
  "evaluatorKey",
  "recommendedActionKey",
]);

export function validateRiskRuleDefinition(rule) {
  const errors = [];
  if (!rule || typeof rule !== "object") return { ok: false, errors: ["rule_required"] };
  for (const field of RISK_RULE_REQUIRED_FIELDS) {
    if (!(field in rule)) errors.push(`field_missing:${field}`);
  }
  if (rule.domain && !RISK_DOMAINS.includes(rule.domain)) errors.push("domain_invalid");
  if (rule.severity && !RISK_SEVERITIES.includes(rule.severity)) errors.push("severity_invalid");
  if (rule.requiredFacts && !Array.isArray(rule.requiredFacts)) errors.push("required_facts_invalid");
  if (rule.legalSourceIds && !Array.isArray(rule.legalSourceIds)) errors.push("legal_source_ids_invalid");
  if (Array.isArray(rule.legalSourceIds) && rule.legalSourceIds.length === 0) errors.push("legal_source_ids_required");
  return { ok: errors.length === 0, errors };
}

export function createRiskFingerprint({ organizationId, complianceScopeId = "", subjectType = "organization", subjectId = "", ruleId, ruleVersion } = {}) {
  if (!organizationId) throw new Error("risk_organization_required");
  if (!ruleId) throw new Error("risk_rule_required");
  if (!ruleVersion) throw new Error("risk_rule_version_required");
  const canonical = [organizationId, complianceScopeId, subjectType, subjectId, ruleId, ruleVersion].join("|");
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

export function buildRiskFinding({
  organizationId,
  complianceScopeId = null,
  subjectType = "organization",
  subjectId = null,
  rule,
  applicability,
  missingFacts = [],
  explanation = "",
  dueAt = null,
  detectedAt = new Date().toISOString(),
} = {}) {
  const validation = validateRiskRuleDefinition(rule);
  if (!validation.ok) throw new Error(`risk_rule_invalid:${validation.errors.join(",")}`);
  if (!RISK_APPLICABILITY.includes(applicability)) throw new Error("risk_applicability_invalid");
  if (!organizationId) throw new Error("risk_organization_required");

  return {
    fingerprint: createRiskFingerprint({
      organizationId,
      complianceScopeId: complianceScopeId || "",
      subjectType,
      subjectId: subjectId || "",
      ruleId: rule.id,
      ruleVersion: rule.version,
    }),
    organizationId,
    complianceScopeId,
    subjectType,
    subjectId,
    ruleId: rule.id,
    ruleVersion: rule.version,
    domain: rule.domain,
    title: rule.title,
    severity: rule.severity,
    applicability,
    status: applicability === "APPLIES" ? "OPEN" : applicability === "UNCERTAIN" ? "ACKNOWLEDGED" : "RESOLVED",
    missingFacts: Array.isArray(missingFacts) ? [...missingFacts] : [],
    legalSourceIds: [...rule.legalSourceIds],
    recommendedActionKey: rule.recommendedActionKey,
    explanation: String(explanation || ""),
    dueAt,
    detectedAt,
  };
}

export function summarizeRiskDashboard(findings = []) {
  const summary = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    INFO: 0,
    uncertain: 0,
    openActions: 0,
  };

  for (const finding of findings) {
    if (!finding || finding.status === "RESOLVED" || finding.status === "SUPPRESSED") continue;
    if (finding.applicability === "UNCERTAIN") {
      summary.uncertain += 1;
      continue;
    }
    if (finding.applicability === "APPLIES" && RISK_SEVERITIES.includes(finding.severity)) {
      summary[finding.severity] += 1;
    }
    if (finding.actionStatus && !["DONE", "DISMISSED"].includes(finding.actionStatus)) summary.openActions += 1;
  }

  return summary;
}

export function shouldCreateAction(finding) {
  if (!finding) return false;
  return finding.applicability === "APPLIES" && ["CRITICAL", "HIGH", "MEDIUM"].includes(finding.severity) && finding.status !== "SUPPRESSED";
}
