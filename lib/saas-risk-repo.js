import crypto from "node:crypto";
import { getRuntimePostgresPool } from "./runtime-postgres.js";
import { withPostgresTransaction } from "./postgres-client.js";
import { requireOrganizationPermission } from "./saas-tenant-repo.js";
import {
  buildRiskFinding,
  createRiskFingerprint,
  shouldCreateAction,
  summarizeRiskDashboard,
} from "./risk-contract.js";
import {
  assertComplianceActionTransition,
  deriveActionEventType,
} from "./compliance-action-contract.js";
import {
  BUSINESS_RISK_RULES,
  BUSINESS_RISK_RULE_PACK_VERSION,
  evaluateBusinessRiskRule,
} from "./saas-risk-rules.js";
import { getBusinessOnboarding } from "./saas-business-repo.js";

const nowISO = () => new Date().toISOString();
const id = (prefix) => `${prefix}_${crypto.randomUUID()}`;

const ACTION_TITLES = Object.freeze({
  "scope.verify": "사업장 적용범위 확인",
  "employment.verify_written_terms": "근로조건 핵심정보 확인",
  "wage.review_minimum": "최저임금 기준으로 시급 검토",
});

function stableHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function toIso(value) {
  return value instanceof Date ? value.toISOString() : value;
}

async function audit(client, { organizationId, actorUserId, action, resourceType = null, resourceId = null, requestId = null, metadata = {} }) {
  await client.query(
    `INSERT INTO audit_logs
      (id,organization_id,actor_user_id,actor_type,action,resource_type,resource_id,result,request_id,metadata,created_at)
     VALUES ($1,$2,$3,'USER',$4,$5,$6,'SUCCESS',$7,$8,$9)`,
    [id("aud"), organizationId, actorUserId, action, resourceType, resourceId, requestId, JSON.stringify(metadata || {}), nowISO()]
  );
}

async function loadRiskInputs(client, organizationId, complianceScopeId = null) {
  const scopeArgs = [organizationId];
  let scopeSql = "SELECT * FROM compliance_scopes WHERE organization_id=$1 AND status <> 'ARCHIVED'";
  if (complianceScopeId) {
    scopeArgs.push(complianceScopeId);
    scopeSql += " AND id=$2";
  }
  scopeSql += " ORDER BY created_at,id";
  const scopes = await client.query(scopeSql, scopeArgs);
  if (complianceScopeId && !scopes.rowCount) throw new Error("compliance_scope_not_found");

  const employments = await client.query(
    `SELECT e.id AS employee_id,e.employee_number,e.display_name,
      m.id AS employment_id,m.workplace_id,m.employment_type,m.hire_date,m.termination_date,
      m.weekly_contract_hours,m.wage_type,m.base_wage,m.fixed_allowances,m.probation_end,m.fixed_term_end
     FROM employees e
     JOIN employments m ON m.employee_id=e.id AND m.organization_id=e.organization_id AND m.status='ACTIVE'
     WHERE e.organization_id=$1 AND e.status='ACTIVE' AND e.deleted_at IS NULL
     ORDER BY e.id,m.id`,
    [organizationId]
  );

  return {
    scopes: scopes.rows.map((row) => ({ id: row.id, name: row.name, status: row.status, basis: row.basis })),
    employments: employments.rows.map((row) => ({
      employeeId: row.employee_id,
      employeeNumber: row.employee_number,
      displayName: row.display_name,
      employment: {
        id: row.employment_id,
        workplaceId: row.workplace_id,
        employmentType: row.employment_type,
        hireDate: row.hire_date,
        terminationDate: row.termination_date,
        weeklyContractHours: row.weekly_contract_hours == null ? null : Number(row.weekly_contract_hours),
        wageType: row.wage_type,
        baseWage: row.base_wage == null ? null : Number(row.base_wage),
        fixedAllowances: row.fixed_allowances || [],
        probationEnd: row.probation_end,
        fixedTermEnd: row.fixed_term_end,
      },
    })),
  };
}

function evaluationsForInputs(organizationId, inputs) {
  const evaluations = [];
  for (const scope of inputs.scopes) {
    const rule = BUSINESS_RISK_RULES.find((item) => item.evaluatorKey === "scopeVerificationRequired");
    const result = evaluateBusinessRiskRule(rule, { scope });
    evaluations.push({
      rule,
      result,
      complianceScopeId: scope.id,
      subjectType: "compliance_scope",
      subjectId: scope.id,
    });
  }

  for (const employee of inputs.employments) {
    for (const rule of BUSINESS_RISK_RULES.filter((item) => item.domain !== "workplace_scope")) {
      const result = evaluateBusinessRiskRule(rule, employee);
      evaluations.push({
        rule,
        result,
        complianceScopeId: null,
        subjectType: "employee",
        subjectId: employee.employeeId,
      });
    }
  }

  return evaluations.map((entry) => ({
    ...entry,
    fingerprint: createRiskFingerprint({
      organizationId,
      complianceScopeId: entry.complianceScopeId || "",
      subjectType: entry.subjectType,
      subjectId: entry.subjectId || "",
      ruleId: entry.rule.id,
      ruleVersion: entry.rule.version,
    }),
  }));
}

async function persistFinding(client, organizationId, runId, entry, detectedAt) {
  const finding = buildRiskFinding({
    organizationId,
    complianceScopeId: entry.complianceScopeId,
    subjectType: entry.subjectType,
    subjectId: entry.subjectId,
    rule: entry.rule,
    applicability: entry.result.applicability,
    missingFacts: entry.result.missingFacts,
    explanation: entry.result.explanation,
    detectedAt,
  });

  if (finding.applicability === "NOT_APPLIES") {
    await client.query(
      `UPDATE risk_findings SET status='RESOLVED',applicability='NOT_APPLIES',explanation=$1,missing_facts=$2,
       last_evaluated_at=$3,resolved_at=COALESCE(resolved_at,$3),updated_at=$3
       WHERE organization_id=$4 AND fingerprint=$5 AND status <> 'SUPPRESSED'`,
      [finding.explanation, JSON.stringify(finding.missingFacts), detectedAt, organizationId, finding.fingerprint]
    );
    return null;
  }

  const findingId = id("rsk");
  const stored = await client.query(
    `INSERT INTO risk_findings
     (id,organization_id,compliance_scope_id,evaluation_run_id,subject_type,subject_id,fingerprint,rule_id,rule_version,
      domain,title,severity,applicability,status,explanation,missing_facts,legal_source_ids,recommended_action_key,due_at,
      detected_at,last_evaluated_at,resolved_at,suppressed_until,suppression_reason,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$20,NULL,NULL,NULL,$20,$20)
     ON CONFLICT(organization_id,fingerprint) DO UPDATE SET
       compliance_scope_id=EXCLUDED.compliance_scope_id,evaluation_run_id=EXCLUDED.evaluation_run_id,
       applicability=EXCLUDED.applicability,
       status=CASE WHEN risk_findings.status='SUPPRESSED' AND (risk_findings.suppressed_until IS NULL OR risk_findings.suppressed_until > EXCLUDED.last_evaluated_at)
                   THEN 'SUPPRESSED' ELSE EXCLUDED.status END,
       explanation=EXCLUDED.explanation,missing_facts=EXCLUDED.missing_facts,legal_source_ids=EXCLUDED.legal_source_ids,
       recommended_action_key=EXCLUDED.recommended_action_key,due_at=EXCLUDED.due_at,last_evaluated_at=EXCLUDED.last_evaluated_at,
       resolved_at=NULL,updated_at=EXCLUDED.updated_at
     RETURNING *`,
    [findingId, organizationId, finding.complianceScopeId, runId, finding.subjectType, finding.subjectId, finding.fingerprint,
      finding.ruleId, finding.ruleVersion, finding.domain, finding.title, finding.severity, finding.applicability, finding.status,
      finding.explanation, JSON.stringify(finding.missingFacts), JSON.stringify(finding.legalSourceIds), finding.recommendedActionKey,
      finding.dueAt, detectedAt]
  );
  const row = stored.rows[0];

  await client.query(
    `INSERT INTO risk_finding_events (id,organization_id,risk_finding_id,actor_user_id,type,note,metadata,created_at)
     VALUES ($1,$2,$3,NULL,'EVALUATED','',$4,$5)`,
    [id("rfe"), organizationId, row.id, JSON.stringify({ runId, applicability: finding.applicability, ruleVersion: finding.ruleVersion }), detectedAt]
  );

  if (shouldCreateAction({ ...finding, status: row.status })) {
    const actionId = id("act");
    await client.query(
      `INSERT INTO compliance_actions
       (id,organization_id,risk_finding_id,action_key,title,status,priority,owner_membership_id,due_at,blocked_reason,
        completed_at,dismissed_at,dismissed_reason,metadata,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,'OPEN',$6,NULL,$7,NULL,NULL,NULL,NULL,$8,$9,$9)
       ON CONFLICT(organization_id,risk_finding_id,action_key) WHERE risk_finding_id IS NOT NULL DO NOTHING`,
      [actionId, organizationId, row.id, finding.recommendedActionKey,
        ACTION_TITLES[finding.recommendedActionKey] || finding.title, finding.severity, finding.dueAt,
        JSON.stringify({ origin: "RISK_FINDING", ruleId: finding.ruleId, ruleVersion: finding.ruleVersion }), detectedAt]
    );
  }
  return row;
}

function mapFinding(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    complianceScopeId: row.compliance_scope_id,
    evaluationRunId: row.evaluation_run_id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    fingerprint: row.fingerprint,
    ruleId: row.rule_id,
    ruleVersion: row.rule_version,
    domain: row.domain,
    title: row.title,
    severity: row.severity,
    applicability: row.applicability,
    status: row.status,
    explanation: row.explanation,
    missingFacts: row.missing_facts || [],
    legalSourceIds: row.legal_source_ids || [],
    recommendedActionKey: row.recommended_action_key,
    dueAt: toIso(row.due_at),
    detectedAt: toIso(row.detected_at),
    lastEvaluatedAt: toIso(row.last_evaluated_at),
    actionId: row.action_id || null,
    actionStatus: row.action_status || null,
  };
}

function mapAction(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    riskFindingId: row.risk_finding_id,
    actionKey: row.action_key,
    title: row.title,
    status: row.status,
    priority: row.priority,
    ownerMembershipId: row.owner_membership_id,
    dueAt: toIso(row.due_at),
    blockedReason: row.blocked_reason,
    completedAt: toIso(row.completed_at),
    dismissedAt: toIso(row.dismissed_at),
    dismissedReason: row.dismissed_reason,
    metadata: row.metadata || {},
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export async function runBusinessRiskScan({ organizationId, actorUserId, complianceScopeId = null, triggerType = "MANUAL", requestId = null } = {}) {
  const access = await requireOrganizationPermission({ organizationId, userId: actorUserId, permission: "compliance.manage" });
  if (!access.allowed) throw new Error("permission_denied");

  const result = await withPostgresTransaction(getRuntimePostgresPool(), async (client) => {
    const inputs = await loadRiskInputs(client, organizationId, complianceScopeId);
    const evaluations = evaluationsForInputs(organizationId, inputs);
    const runId = id("rrn");
    const startedAt = nowISO();
    await client.query(
      `INSERT INTO risk_evaluation_runs
       (id,organization_id,compliance_scope_id,trigger_type,legal_registry_version,input_snapshot_hash,status,started_at)
       VALUES ($1,$2,$3,$4,$5,$6,'RUNNING',$7)`,
      [runId, organizationId, complianceScopeId, triggerType, BUSINESS_RISK_RULE_PACK_VERSION, stableHash(inputs), startedAt]
    );

    const evaluatedFingerprints = [];
    for (const entry of evaluations) {
      evaluatedFingerprints.push(entry.fingerprint);
      await persistFinding(client, organizationId, runId, entry, startedAt);
    }

    const ruleIds = BUSINESS_RISK_RULES.map((rule) => rule.id);
    if (evaluatedFingerprints.length) {
      await client.query(
        `UPDATE risk_findings SET status='RESOLVED',resolved_at=COALESCE(resolved_at,$1),last_evaluated_at=$1,updated_at=$1
         WHERE organization_id=$2 AND rule_id = ANY($3::text[]) AND NOT (fingerprint = ANY($4::text[]))
           AND status IN ('OPEN','ACKNOWLEDGED')`,
        [startedAt, organizationId, ruleIds, evaluatedFingerprints]
      );
    } else {
      await client.query(
        `UPDATE risk_findings SET status='RESOLVED',resolved_at=COALESCE(resolved_at,$1),last_evaluated_at=$1,updated_at=$1
         WHERE organization_id=$2 AND rule_id = ANY($3::text[]) AND status IN ('OPEN','ACKNOWLEDGED')`,
        [startedAt, organizationId, ruleIds]
      );
    }

    const summaryRows = await client.query(
      `SELECT severity,applicability,status,COUNT(*)::int AS count FROM risk_findings
       WHERE organization_id=$1 AND status NOT IN ('RESOLVED','SUPPRESSED') GROUP BY severity,applicability,status`,
      [organizationId]
    );
    const counts = { critical: 0, high: 0, medium: 0, info: 0, uncertain: 0 };
    for (const row of summaryRows.rows) {
      if (row.applicability === "UNCERTAIN") counts.uncertain += row.count;
      else if (row.applicability === "APPLIES") counts[row.severity.toLowerCase()] += row.count;
    }
    const finishedAt = nowISO();
    await client.query(
      `UPDATE risk_evaluation_runs SET status='COMPLETED',critical_count=$1,high_count=$2,medium_count=$3,info_count=$4,
       uncertain_count=$5,finished_at=$6 WHERE id=$7`,
      [counts.critical, counts.high, counts.medium, counts.info, counts.uncertain, finishedAt, runId]
    );
    await audit(client, { organizationId, actorUserId, action: "risk.scan", resourceType: "risk_evaluation_run", resourceId: runId, requestId, metadata: { triggerType, counts, rulePackVersion: BUSINESS_RISK_RULE_PACK_VERSION } });
    return { run: { id: runId, organizationId, complianceScopeId, triggerType, rulePackVersion: BUSINESS_RISK_RULE_PACK_VERSION, status: "COMPLETED", ...counts, startedAt, finishedAt } };
  });

  const onboarding = await getBusinessOnboarding(organizationId);
  return { ...result, onboarding };
}

export async function getBusinessRiskDashboard(organizationId) {
  const findingsResult = await getRuntimePostgresPool().query(
    `SELECT f.*,a.id AS action_id,a.status AS action_status
     FROM risk_findings f
     LEFT JOIN compliance_actions a ON a.organization_id=f.organization_id AND a.risk_finding_id=f.id
     WHERE f.organization_id=$1 AND f.status <> 'RESOLVED'
     ORDER BY CASE f.severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END,
              f.updated_at DESC`,
    [organizationId]
  );
  const findings = findingsResult.rows.map(mapFinding);
  const latestRunResult = await getRuntimePostgresPool().query(
    "SELECT * FROM risk_evaluation_runs WHERE organization_id=$1 ORDER BY started_at DESC LIMIT 1",
    [organizationId]
  );
  return { summary: summarizeRiskDashboard(findings), findings, latestRun: latestRunResult.rows[0] || null, rulePackVersion: BUSINESS_RISK_RULE_PACK_VERSION };
}

export async function listComplianceActions(organizationId) {
  const result = await getRuntimePostgresPool().query(
    `SELECT * FROM compliance_actions WHERE organization_id=$1
     ORDER BY CASE status WHEN 'IN_PROGRESS' THEN 1 WHEN 'OPEN' THEN 2 WHEN 'BLOCKED' THEN 3 ELSE 4 END,
              due_at NULLS LAST,created_at DESC`,
    [organizationId]
  );
  return result.rows.map(mapAction);
}

export async function transitionComplianceAction({ organizationId, actionId, actorUserId, status, blockedReason = "", dismissedReason = "", note = "", requestId = null } = {}) {
  const access = await requireOrganizationPermission({ organizationId, userId: actorUserId, permission: "compliance.manage" });
  if (!access.allowed) throw new Error("permission_denied");
  return withPostgresTransaction(getRuntimePostgresPool(), async (client) => {
    const found = await client.query("SELECT * FROM compliance_actions WHERE id=$1 AND organization_id=$2 FOR UPDATE", [actionId, organizationId]);
    const current = found.rows[0];
    if (!current) return null;
    assertComplianceActionTransition(current.status, status, { blockedReason, dismissedReason });
    const now = nowISO();
    const eventType = deriveActionEventType(current.status, status);
    await client.query(
      `UPDATE compliance_actions SET status=$1,
       blocked_reason=CASE WHEN $1='BLOCKED' THEN $2 ELSE NULL END,
       completed_at=CASE WHEN $1='DONE' THEN $4 WHEN $1='OPEN' THEN NULL ELSE completed_at END,
       dismissed_at=CASE WHEN $1='DISMISSED' THEN $4 WHEN $1='OPEN' THEN NULL ELSE dismissed_at END,
       dismissed_reason=CASE WHEN $1='DISMISSED' THEN $3 WHEN $1='OPEN' THEN NULL ELSE dismissed_reason END,
       metadata=metadata || $5::jsonb,updated_at=$4 WHERE id=$6`,
      [status, blockedReason || null, dismissedReason || null, now, JSON.stringify(status === "DONE" ? { requiresRiskReevaluation: true } : {}), actionId]
    );
    await client.query(
      `INSERT INTO compliance_action_events
       (id,organization_id,compliance_action_id,actor_user_id,type,from_status,to_status,note,metadata,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id("ace"), organizationId, actionId, actorUserId, eventType, current.status, status, String(note || "").slice(0, 1000), JSON.stringify({ blockedReason: blockedReason || null, dismissedReason: dismissedReason || null }), now]
    );
    await audit(client, { organizationId, actorUserId, action: "compliance.action.status", resourceType: "compliance_action", resourceId: actionId, requestId, metadata: { from: current.status, to: status } });
    const updated = await client.query("SELECT * FROM compliance_actions WHERE id=$1 AND organization_id=$2", [actionId, organizationId]);
    return { action: mapAction(updated.rows[0]), requiresRiskReevaluation: status === "DONE" };
  });
}
