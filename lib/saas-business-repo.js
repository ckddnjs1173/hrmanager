import crypto from "node:crypto";
import { getRuntimePostgresPool } from "./runtime-postgres.js";
import { withPostgresTransaction } from "./postgres-client.js";
import {
  COMPANY_PROFILE_FACTS,
  FACT_CONFIDENCE,
  evaluateBusinessActivation,
  evaluateOnboardingReadiness,
  nextOnboardingStep,
} from "./business-onboarding-contract.js";
import { requireOrganizationPermission } from "./saas-tenant-repo.js";

const nowISO = () => new Date().toISOString();
const id = (prefix) => `${prefix}_${crypto.randomUUID()}`;
const PROFILE_COLUMN_MAP = Object.freeze({
  industryCode: "industry_code",
  payday: "payday",
  defaultWeeklyHours: "default_weekly_hours",
  wageSystem: "wage_system",
  inclusiveWage: "inclusive_wage",
  rulesOfEmploymentExists: "rules_of_employment_exists",
  externalAdvisorExists: "external_advisor_exists",
});

function toIso(value) {
  return value instanceof Date ? value.toISOString() : value;
}
function toDateString(value) {
  if (value == null || value === "") return null;
  const text = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(new Date(`${text}T00:00:00Z`).getTime())) return null;
  return text;
}
function safeNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function generatedCode(prefix) {
  return `${prefix}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

async function audit(client, { organizationId, actorUserId, action, resourceType = null, resourceId = null, requestId = null, metadata = {} }) {
  await client.query(
    `INSERT INTO audit_logs
      (id,organization_id,actor_user_id,actor_type,action,resource_type,resource_id,result,request_id,metadata,created_at)
     VALUES ($1,$2,$3,'USER',$4,$5,$6,'SUCCESS',$7,$8,$9)`,
    [id("aud"), organizationId, actorUserId, action, resourceType, resourceId, requestId, JSON.stringify(metadata || {}), nowISO()]
  );
}

async function ensureSession(client, organizationId) {
  const existing = await client.query("SELECT * FROM business_onboarding_sessions WHERE organization_id=$1 FOR UPDATE", [organizationId]);
  if (existing.rows[0]) return existing.rows[0];
  const sessionId = id("onb");
  const now = nowISO();
  await client.query(
    `INSERT INTO business_onboarding_sessions
     (id,organization_id,status,current_step,completed_steps,missing_milestones,activation_signal,started_at,completed_at,activated_at,last_seen_at,created_at,updated_at)
     VALUES ($1,$2,'IN_PROGRESS','COMPANY_PROFILE','[]'::jsonb,'[]'::jsonb,NULL,$3,NULL,NULL,$3,$3,$3)`,
    [sessionId, organizationId, now]
  );
  return { id: sessionId, organization_id: organizationId, completed_steps: [] };
}

async function deriveMilestones(client, organizationId) {
  const result = await client.query(
    `SELECT
      EXISTS(SELECT 1 FROM organizations WHERE id=$1 AND status='ACTIVE') AS organization_active,
      EXISTS(SELECT 1 FROM business_profiles WHERE organization_id=$1) AS company_profile_saved,
      EXISTS(SELECT 1 FROM workplaces WHERE organization_id=$1 AND status='ACTIVE') AS workplace_created,
      EXISTS(SELECT 1 FROM employees WHERE organization_id=$1 AND status='ACTIVE' AND deleted_at IS NULL) AS employee_count_at_least_one,
      EXISTS(SELECT 1 FROM risk_evaluation_runs WHERE organization_id=$1 AND status='COMPLETED') AS risk_scan_completed,
      EXISTS(SELECT 1 FROM compliance_actions WHERE organization_id=$1 AND status='IN_PROGRESS') AS first_action_started,
      EXISTS(SELECT 1 FROM compliance_actions WHERE organization_id=$1 AND status='DONE') AS first_action_completed`,
    [organizationId]
  );
  const row = result.rows[0] || {};
  return {
    organizationActive: !!row.organization_active,
    companyProfileSaved: !!row.company_profile_saved,
    workplaceCreated: !!row.workplace_created,
    employeeCountAtLeastOne: !!row.employee_count_at_least_one,
    riskScanCompleted: !!row.risk_scan_completed,
    firstActionStarted: !!row.first_action_started,
    firstActionCompleted: !!row.first_action_completed,
    firstDocumentGenerated: false,
  };
}

async function syncSession(client, organizationId, { actorUserId = null, step = null, eventType = "SYNC", metadata = {} } = {}) {
  const session = await ensureSession(client, organizationId);
  const completed = new Set(Array.isArray(session.completed_steps) ? session.completed_steps : []);
  if (step) completed.add(step);
  const milestones = await deriveMilestones(client, organizationId);
  if (milestones.companyProfileSaved) completed.add("COMPANY_PROFILE");
  if (milestones.workplaceCreated) completed.add("WORKPLACES");
  const scopeExists = await client.query("SELECT 1 FROM compliance_scopes WHERE organization_id=$1 AND status <> 'ARCHIVED' LIMIT 1", [organizationId]);
  if (scopeExists.rowCount) completed.add("COMPLIANCE_SCOPE");
  if (milestones.employeeCountAtLeastOne) completed.add("EMPLOYEES");
  if (milestones.riskScanCompleted) completed.add("RISK_SCAN");

  const activation = evaluateBusinessActivation(milestones);
  if (activation.activationSignal) completed.add("FIRST_ACTION");
  if (activation.activated) completed.add("COMPLETE");
  const completedSteps = [...completed];
  const readiness = evaluateOnboardingReadiness(milestones);
  const currentStep = completed.has("COMPLETE") ? "COMPLETE" : nextOnboardingStep(completedSteps);
  const status = completed.has("COMPLETE") ? "COMPLETED" : "IN_PROGRESS";
  const now = nowISO();

  await client.query(
    `UPDATE business_onboarding_sessions SET
      status=$1,current_step=$2,completed_steps=$3,missing_milestones=$4,activation_signal=$5::text,
      completed_at=CASE WHEN $1='COMPLETED' THEN COALESCE(completed_at,$6) ELSE completed_at END,
      activated_at=CASE WHEN $5::text IS NOT NULL THEN COALESCE(activated_at,$6) ELSE activated_at END,
      last_seen_at=$6,updated_at=$6
     WHERE id=$7`,
    [status, currentStep, JSON.stringify(completedSteps), JSON.stringify(readiness.missing), activation.activationSignal, now, session.id]
  );
  await client.query(
    `INSERT INTO onboarding_events (id,organization_id,session_id,actor_user_id,event_type,step,metadata,created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id("one"), organizationId, session.id, actorUserId, eventType, step, JSON.stringify(metadata || {}), now]
  );

  return {
    id: session.id,
    organizationId,
    status,
    currentStep,
    completedSteps,
    missingMilestones: readiness.missing,
    activationSignal: activation.activationSignal,
    activated: activation.activated,
    milestones,
  };
}

export async function getBusinessOnboarding(organizationId) {
  return withPostgresTransaction(getRuntimePostgresPool(), async (client) => syncSession(client, organizationId, { eventType: "VIEW" }));
}

export async function upsertBusinessProfile({ organizationId, actorUserId, profile = {}, confidence = {}, requestId = null } = {}) {
  const access = await requireOrganizationPermission({ organizationId, userId: actorUserId, permission: "compliance.manage" });
  if (!access.allowed) throw new Error("permission_denied");
  const values = {};
  for (const key of COMPANY_PROFILE_FACTS) if (key in profile) values[key] = profile[key];
  const payday = safeNumber(values.payday);
  if (payday != null && (!Number.isInteger(payday) || payday < 1 || payday > 31)) throw new Error("payday_invalid");
  const hours = safeNumber(values.defaultWeeklyHours);
  if (hours != null && (hours < 0 || hours > 168)) throw new Error("weekly_hours_invalid");

  return withPostgresTransaction(getRuntimePostgresPool(), async (client) => {
    const now = nowISO();
    await client.query(
      `INSERT INTO business_profiles
       (organization_id,industry_code,payday,default_weekly_hours,wage_system,inclusive_wage,rules_of_employment_exists,external_advisor_exists,profile,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT(organization_id) DO UPDATE SET
       industry_code=COALESCE(EXCLUDED.industry_code,business_profiles.industry_code),
       payday=COALESCE(EXCLUDED.payday,business_profiles.payday),
       default_weekly_hours=COALESCE(EXCLUDED.default_weekly_hours,business_profiles.default_weekly_hours),
       wage_system=COALESCE(EXCLUDED.wage_system,business_profiles.wage_system),
       inclusive_wage=COALESCE(EXCLUDED.inclusive_wage,business_profiles.inclusive_wage),
       rules_of_employment_exists=COALESCE(EXCLUDED.rules_of_employment_exists,business_profiles.rules_of_employment_exists),
       external_advisor_exists=COALESCE(EXCLUDED.external_advisor_exists,business_profiles.external_advisor_exists),
       profile=business_profiles.profile || EXCLUDED.profile,updated_at=EXCLUDED.updated_at`,
      [organizationId, values.industryCode ?? null, payday, hours, values.wageSystem ?? null, values.inclusiveWage ?? null, values.rulesOfEmploymentExists ?? null, values.externalAdvisorExists ?? null, JSON.stringify(profile || {}), now]
    );
    const session = await ensureSession(client, organizationId);
    for (const key of Object.keys(values)) {
      const factConfidence = confidence[key] || (values[key] == null ? "UNKNOWN" : "KNOWN");
      if (!FACT_CONFIDENCE.includes(factConfidence)) throw new Error("onboarding_fact_confidence_invalid");
      await client.query(
        `INSERT INTO business_onboarding_facts
         (id,organization_id,session_id,fact_key,value,confidence,source,answered_by_user_id,answered_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,'USER',$7,$8,$8)
         ON CONFLICT(organization_id,fact_key) DO UPDATE SET value=EXCLUDED.value,confidence=EXCLUDED.confidence,answered_by_user_id=EXCLUDED.answered_by_user_id,answered_at=EXCLUDED.answered_at,updated_at=EXCLUDED.updated_at`,
        [id("onf"), organizationId, session.id, key, JSON.stringify(values[key] ?? null), factConfidence, actorUserId, now]
      );
    }
    await audit(client, { organizationId, actorUserId, action: "business.profile.update", resourceType: "business_profile", resourceId: organizationId, requestId });
    const onboarding = await syncSession(client, organizationId, { actorUserId, step: "COMPANY_PROFILE", eventType: "PROFILE_SAVED" });
    return { profile: values, onboarding };
  });
}

export async function updatePolicyFacts({ organizationId, actorUserId, facts = {}, confidence = {}, requestId = null } = {}) {
  const result = await upsertBusinessProfile({ organizationId, actorUserId, profile: facts, confidence, requestId });
  return withPostgresTransaction(getRuntimePostgresPool(), async (client) => {
    const onboarding = await syncSession(client, organizationId, { actorUserId, step: "POLICY_FACTS", eventType: "POLICY_FACTS_SAVED" });
    return { ...result, onboarding };
  });
}

export async function getBusinessProfile(organizationId) {
  const result = await getRuntimePostgresPool().query("SELECT * FROM business_profiles WHERE organization_id=$1", [organizationId]);
  const row = result.rows[0];
  if (!row) return null;
  return {
    organizationId,
    industryCode: row.industry_code,
    payday: row.payday,
    defaultWeeklyHours: row.default_weekly_hours == null ? null : Number(row.default_weekly_hours),
    wageSystem: row.wage_system,
    inclusiveWage: row.inclusive_wage,
    rulesOfEmploymentExists: row.rules_of_employment_exists,
    externalAdvisorExists: row.external_advisor_exists,
    profile: row.profile || {},
    updatedAt: toIso(row.updated_at),
  };
}

export async function createWorkplace({ organizationId, actorUserId, data = {}, requestId = null } = {}) {
  const access = await requireOrganizationPermission({ organizationId, userId: actorUserId, permission: "workplace.manage" });
  if (!access.allowed) throw new Error("permission_denied");
  const name = String(data.name || "").trim();
  if (!name) throw new Error("workplace_name_required");
  const workplaceId = id("wrk");
  const code = String(data.code || generatedCode("WP")).trim();
  const now = nowISO();
  return withPostgresTransaction(getRuntimePostgresPool(), async (client) => {
    await client.query(
      `INSERT INTO workplaces (id,organization_id,code,name,address,status,opened_at,closed_at,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,'ACTIVE',$6,NULL,$7,$7)`,
      [workplaceId, organizationId, code, name, JSON.stringify(data.address || {}), toDateString(data.openedAt), now]
    );
    await audit(client, { organizationId, actorUserId, action: "workplace.create", resourceType: "workplace", resourceId: workplaceId, requestId });
    const onboarding = await syncSession(client, organizationId, { actorUserId, step: "WORKPLACES", eventType: "WORKPLACE_CREATED", metadata: { workplaceId } });
    return { workplace: { id: workplaceId, organizationId, code, name, address: data.address || {}, status: "ACTIVE", openedAt: toDateString(data.openedAt) }, onboarding };
  });
}

export async function listWorkplaces(organizationId) {
  const result = await getRuntimePostgresPool().query("SELECT * FROM workplaces WHERE organization_id=$1 AND status <> 'CLOSED' ORDER BY created_at", [organizationId]);
  return result.rows.map((row) => ({ id: row.id, organizationId, code: row.code, name: row.name, address: row.address || {}, status: row.status, openedAt: toDateString(row.opened_at), createdAt: toIso(row.created_at) }));
}

export async function createComplianceScope({ organizationId, actorUserId, data = {}, requestId = null } = {}) {
  const access = await requireOrganizationPermission({ organizationId, userId: actorUserId, permission: "compliance.manage" });
  if (!access.allowed) throw new Error("permission_denied");
  const name = String(data.name || "").trim();
  if (!name) throw new Error("compliance_scope_name_required");
  const status = ["ACTIVE", "UNCERTAIN"].includes(data.status) ? data.status : "UNCERTAIN";
  const scopeId = id("scp");
  const now = nowISO();
  return withPostgresTransaction(getRuntimePostgresPool(), async (client) => {
    await client.query(
      `INSERT INTO compliance_scopes
       (id,organization_id,name,basis,status,worker_count_method,rule_version,effective_from,effective_to,verified_at,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL,$9,$10,$10)`,
      [scopeId, organizationId, name, String(data.basis || ""), status, data.workerCountMethod || null, data.ruleVersion || null, toDateString(data.effectiveFrom), status === "ACTIVE" && data.verified === true ? now : null, now]
    );
    const workplaceIds = Array.isArray(data.workplaceIds) ? [...new Set(data.workplaceIds.map(String))] : [];
    for (const workplaceId of workplaceIds) {
      const owned = await client.query("SELECT 1 FROM workplaces WHERE id=$1 AND organization_id=$2 AND status='ACTIVE'", [workplaceId, organizationId]);
      if (!owned.rowCount) throw new Error("workplace_not_found");
      await client.query(
        `INSERT INTO compliance_scope_workplaces (id,organization_id,compliance_scope_id,workplace_id,effective_from,effective_to,created_at)
         VALUES ($1,$2,$3,$4,$5,NULL,$6)
         ON CONFLICT DO NOTHING`,
        [id("scw"), organizationId, scopeId, workplaceId, toDateString(data.effectiveFrom), now]
      );
    }
    await audit(client, { organizationId, actorUserId, action: "compliance.scope.create", resourceType: "compliance_scope", resourceId: scopeId, requestId, metadata: { status, workplaceIds } });
    const onboarding = await syncSession(client, organizationId, { actorUserId, step: "COMPLIANCE_SCOPE", eventType: "COMPLIANCE_SCOPE_CREATED", metadata: { scopeId, status } });
    return { scope: { id: scopeId, organizationId, name, basis: String(data.basis || ""), status, workplaceIds }, onboarding };
  });
}

export async function listComplianceScopes(organizationId) {
  const scopes = await getRuntimePostgresPool().query("SELECT * FROM compliance_scopes WHERE organization_id=$1 AND status <> 'ARCHIVED' ORDER BY created_at", [organizationId]);
  const mappings = await getRuntimePostgresPool().query("SELECT compliance_scope_id,workplace_id FROM compliance_scope_workplaces WHERE organization_id=$1 AND effective_to IS NULL", [organizationId]);
  const byScope = new Map();
  for (const row of mappings.rows) {
    if (!byScope.has(row.compliance_scope_id)) byScope.set(row.compliance_scope_id, []);
    byScope.get(row.compliance_scope_id).push(row.workplace_id);
  }
  return scopes.rows.map((row) => ({ id: row.id, organizationId, name: row.name, basis: row.basis, status: row.status, workerCountMethod: row.worker_count_method, ruleVersion: row.rule_version, verifiedAt: toIso(row.verified_at), workplaceIds: byScope.get(row.id) || [] }));
}

function validateEmployeeRow(row = {}, index = 0) {
  const errors = [];
  const displayName = String(row.displayName || "").trim();
  const hireDate = toDateString(row.hireDate);
  const weeklyHours = safeNumber(row.weeklyContractHours);
  const baseWage = safeNumber(row.baseWage);
  if (!displayName) errors.push("display_name_required");
  if (!hireDate) errors.push("hire_date_required");
  if (weeklyHours != null && (weeklyHours < 0 || weeklyHours > 168)) errors.push("weekly_hours_invalid");
  if (baseWage != null && baseWage < 0) errors.push("base_wage_invalid");
  if (row.fixedAllowances != null && !Array.isArray(row.fixedAllowances)) errors.push("fixed_allowances_invalid");
  return { index, errors, normalized: { ...row, displayName, hireDate, weeklyContractHours: weeklyHours, baseWage, fixedAllowances: Array.isArray(row.fixedAllowances) ? row.fixedAllowances : [] } };
}

async function insertEmployee(client, organizationId, normalized) {
  const employeeId = id("emp");
  const employmentId = id("emt");
  const now = nowISO();
  const employeeNumber = String(normalized.employeeNumber || generatedCode("E")).trim();
  if (normalized.workplaceId) {
    const workplace = await client.query("SELECT 1 FROM workplaces WHERE id=$1 AND organization_id=$2 AND status='ACTIVE'", [normalized.workplaceId, organizationId]);
    if (!workplace.rowCount) throw new Error("workplace_not_found");
  }
  await client.query(
    `INSERT INTO employees (id,organization_id,employee_number,display_name,work_email,status,created_at,updated_at,deleted_at)
     VALUES ($1,$2,$3,$4,$5,'ACTIVE',$6,$6,NULL)`,
    [employeeId, organizationId, employeeNumber, normalized.displayName, normalized.workEmail || null, now]
  );
  await client.query(
    `INSERT INTO employments
     (id,organization_id,employee_id,workplace_id,employment_type,hire_date,termination_date,weekly_contract_hours,wage_type,
      probation_start,probation_end,fixed_term_start,fixed_term_end,status,effective_from,effective_to,created_at,updated_at,
      base_wage,fixed_allowances,job_title,job_grade)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'ACTIVE',$14,NULL,$14,$14,$15,$16,$17,$18)`,
    [employmentId, organizationId, employeeId, normalized.workplaceId || null, normalized.employmentType || null, normalized.hireDate, toDateString(normalized.terminationDate), normalized.weeklyContractHours, normalized.wageType || null, toDateString(normalized.probationStart), toDateString(normalized.probationEnd), toDateString(normalized.fixedTermStart), toDateString(normalized.fixedTermEnd), now, normalized.baseWage, JSON.stringify(normalized.fixedAllowances || []), normalized.jobTitle || null, normalized.jobGrade || null]
  );
  return { employeeId, employmentId, employeeNumber };
}

export async function createEmployee({ organizationId, actorUserId, data = {}, requestId = null } = {}) {
  const access = await requireOrganizationPermission({ organizationId, userId: actorUserId, permission: "employee.write" });
  if (!access.allowed) throw new Error("permission_denied");
  const validation = validateEmployeeRow(data, 0);
  if (validation.errors.length) throw new Error(validation.errors[0]);
  return withPostgresTransaction(getRuntimePostgresPool(), async (client) => {
    const ids = await insertEmployee(client, organizationId, validation.normalized);
    await audit(client, { organizationId, actorUserId, action: "employee.create", resourceType: "employee", resourceId: ids.employeeId, requestId });
    const onboarding = await syncSession(client, organizationId, { actorUserId, step: "EMPLOYEES", eventType: "EMPLOYEE_CREATED", metadata: { employeeId: ids.employeeId } });
    return { employee: { id: ids.employeeId, organizationId, employeeNumber: ids.employeeNumber, displayName: validation.normalized.displayName, workEmail: validation.normalized.workEmail || null }, employment: { id: ids.employmentId, hireDate: validation.normalized.hireDate, workplaceId: validation.normalized.workplaceId || null, employmentType: validation.normalized.employmentType || null, weeklyContractHours: validation.normalized.weeklyContractHours, wageType: validation.normalized.wageType || null, baseWage: validation.normalized.baseWage, fixedAllowances: validation.normalized.fixedAllowances }, onboarding };
  });
}

export async function importEmployees({ organizationId, actorUserId, rows = [], requestId = null } = {}) {
  const access = await requireOrganizationPermission({ organizationId, userId: actorUserId, permission: "employee.write" });
  if (!access.allowed) throw new Error("permission_denied");
  if (!Array.isArray(rows) || rows.length < 1) throw new Error("employee_rows_required");
  if (rows.length > 500) throw new Error("employee_import_too_large");

  return withPostgresTransaction(getRuntimePostgresPool(), async (client) => {
    const jobId = id("imp");
    const now = nowISO();
    const validations = rows.map((row, index) => validateEmployeeRow(row, index));
    const seenNumbers = new Set();
    const requestedNumbers = validations.map((entry) => String(entry.normalized.employeeNumber || "").trim()).filter(Boolean);
    if (requestedNumbers.length) {
      const existing = await client.query("SELECT employee_number FROM employees WHERE organization_id=$1 AND employee_number = ANY($2::text[]) AND status <> 'DELETED'", [organizationId, requestedNumbers]);
      const existingNumbers = new Set(existing.rows.map((row) => row.employee_number));
      for (const entry of validations) {
        const number = String(entry.normalized.employeeNumber || "").trim();
        if (!number) continue;
        if (existingNumbers.has(number) || seenNumbers.has(number)) entry.errors.push("employee_number_duplicate");
        seenNumbers.add(number);
      }
    }
    const accepted = validations.filter((entry) => entry.errors.length === 0);
    const rejected = validations.filter((entry) => entry.errors.length > 0);
    await client.query(
      `INSERT INTO employee_import_jobs
       (id,organization_id,requested_by_user_id,status,source_type,source_object_ref,total_rows,accepted_rows,rejected_rows,error_summary,created_at,started_at,finished_at)
       VALUES ($1,$2,$3,'IMPORTING','CSV',NULL,$4,$5,$6,$7,$8,$8,NULL)`,
      [jobId, organizationId, actorUserId, rows.length, accepted.length, rejected.length, JSON.stringify(rejected.map((entry) => ({ row: entry.index + 1, errors: entry.errors }))), now]
    );
    const imported = [];
    for (const entry of accepted) imported.push(await insertEmployee(client, organizationId, entry.normalized));
    await client.query("UPDATE employee_import_jobs SET status='COMPLETED',finished_at=$1 WHERE id=$2", [nowISO(), jobId]);
    await audit(client, { organizationId, actorUserId, action: "employee.import", resourceType: "employee_import_job", resourceId: jobId, requestId, metadata: { total: rows.length, accepted: accepted.length, rejected: rejected.length } });
    const onboarding = imported.length ? await syncSession(client, organizationId, { actorUserId, step: "EMPLOYEES", eventType: "EMPLOYEES_IMPORTED", metadata: { jobId, imported: imported.length } }) : await syncSession(client, organizationId, { actorUserId, eventType: "EMPLOYEE_IMPORT_VALIDATED", metadata: { jobId } });
    return { job: { id: jobId, total: rows.length, accepted: accepted.length, rejected: rejected.length, errors: rejected.map((entry) => ({ row: entry.index + 1, errors: entry.errors })) }, onboarding };
  });
}

export async function listEmployees(organizationId) {
  const result = await getRuntimePostgresPool().query(
    `SELECT e.id,e.employee_number,e.display_name,e.work_email,e.status,
      m.id AS employment_id,m.workplace_id,m.employment_type,m.hire_date,m.termination_date,m.weekly_contract_hours,m.wage_type,
      m.base_wage,m.fixed_allowances,m.probation_end,m.fixed_term_end,m.job_title,m.job_grade
     FROM employees e LEFT JOIN employments m ON m.employee_id=e.id AND m.organization_id=e.organization_id AND m.status='ACTIVE'
     WHERE e.organization_id=$1 AND e.status='ACTIVE' AND e.deleted_at IS NULL
     ORDER BY e.created_at ASC`,
    [organizationId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    employeeNumber: row.employee_number,
    displayName: row.display_name,
    workEmail: row.work_email,
    status: row.status,
    employment: row.employment_id ? {
      id: row.employment_id,
      workplaceId: row.workplace_id,
      employmentType: row.employment_type,
      hireDate: toDateString(row.hire_date),
      terminationDate: toDateString(row.termination_date),
      weeklyContractHours: row.weekly_contract_hours == null ? null : Number(row.weekly_contract_hours),
      wageType: row.wage_type,
      baseWage: row.base_wage == null ? null : Number(row.base_wage),
      fixedAllowances: row.fixed_allowances || [],
      probationEnd: toDateString(row.probation_end),
      fixedTermEnd: toDateString(row.fixed_term_end),
      jobTitle: row.job_title,
      jobGrade: row.job_grade,
    } : null,
  }));
}

export const BUSINESS_PROFILE_COLUMN_MAP = PROFILE_COLUMN_MAP;