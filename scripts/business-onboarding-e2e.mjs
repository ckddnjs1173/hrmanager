import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { createPostgresPool } from "../lib/postgres-client.js";
import { applyPostgresMigrations } from "../lib/postgres-migrations.js";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
Object.assign(process.env, {
  STORAGE_DRIVER: "postgres",
  SAAS_ENABLED: "1",
  SAAS_AUTH_TOKEN_ECHO: "1",
  SAAS_SESSION_SECRET: "business-onboarding-e2e-secret",
  SESSION_SECRET: "business-onboarding-legacy-secret",
  ADMIN_TOKEN: "business-onboarding-admin",
  NODE_ENV: "test",
  REQUIRE_PERSISTENT_DB: "0",
  PERSISTENT_STORAGE: "0",
});

const migrationPool = createPostgresPool({ applicationName: "insaya-business-onboarding-e2e-migrate" });
await applyPostgresMigrations(migrationPool, { logger: { log() {} } });
await migrationPool.end();

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "insaya-business-onboarding-"));
const { createApplication } = await import("../lib/application.js");
const { closeRuntimeStorage } = await import("../lib/runtime-repo.js");
const { closeRuntimePostgres } = await import("../lib/runtime-postgres.js");
const { app } = createApplication({ rootDir: tempRoot, env: process.env, warn: () => {} });
const server = app.listen(0, "127.0.0.1");
await once(server, "listening");
const base = `http://127.0.0.1:${server.address().port}`;

async function request(pathname, { method = "GET", body, cookie = "", csrf = "" } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  if (csrf) headers["x-csrf-token"] = csrf;
  const response = await fetch(`${base}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { response, body: parsed };
}

function cookieFrom(response) {
  return (response.headers.get("set-cookie") || "").split(";")[0];
}

async function login(email) {
  const challenge = await request("/api/saas/auth/magic-link", { method: "POST", body: { email } });
  if (challenge.response.status !== 202 || !challenge.body?.debugToken) throw new Error(`challenge failed for ${email}`);
  const verified = await request("/api/saas/auth/magic-link/verify", { method: "POST", body: { token: challenge.body.debugToken } });
  if (verified.response.status !== 200 || !verified.body?.csrf) throw new Error(`verify failed for ${email}`);
  return { cookie: cookieFrom(verified.response), csrf: verified.body.csrf, user: verified.body.user };
}

try {
  const owner = await login("business-owner@example.com");
  const orgResponse = await request("/api/saas/organizations", {
    method: "POST", cookie: owner.cookie, csrf: owner.csrf,
    body: { type: "BUSINESS", legalName: "인사야 테스트 유한회사", displayName: "온보딩 테스트 회사" },
  });
  if (orgResponse.response.status !== 201) throw new Error(`org create failed: ${orgResponse.response.status}`);
  const orgId = orgResponse.body.organization.id;

  const initial = await request(`/api/saas/organizations/${orgId}/onboarding`, { cookie: owner.cookie });
  if (initial.response.status !== 200 || initial.body?.currentStep !== "COMPANY_PROFILE") {
    throw new Error(`initial onboarding state invalid: ${JSON.stringify(initial.body)}`);
  }

  const profile = await request(`/api/saas/organizations/${orgId}/business-profile`, {
    method: "PUT", cookie: owner.cookie, csrf: owner.csrf,
    body: {
      profile: {
        industryCode: "G47",
        payday: 25,
        defaultWeeklyHours: 40,
        wageSystem: "MONTHLY",
        inclusiveWage: false,
        rulesOfEmploymentExists: null,
        externalAdvisorExists: true
      },
      confidence: { rulesOfEmploymentExists: "UNKNOWN" }
    },
  });
  if (profile.response.status !== 200 || !profile.body?.onboarding?.completedSteps?.includes("COMPANY_PROFILE")) {
    throw new Error(`profile save failed: ${profile.response.status} ${JSON.stringify(profile.body)}`);
  }

  const workplace = await request(`/api/saas/organizations/${orgId}/workplaces`, {
    method: "POST", cookie: owner.cookie, csrf: owner.csrf,
    body: { name: "서울 본점", address: { city: "서울", district: "강남구" }, openedAt: "2026-01-01" },
  });
  if (workplace.response.status !== 201 || !workplace.body?.workplace?.id) throw new Error("workplace create failed");
  const workplaceId = workplace.body.workplace.id;

  const scope = await request(`/api/saas/organizations/${orgId}/compliance-scopes`, {
    method: "POST", cookie: owner.cookie, csrf: owner.csrf,
    body: { name: "기본 법 적용범위", status: "UNCERTAIN", basis: "초기 온보딩 - 추가 사실 확인 필요", workplaceIds: [workplaceId] },
  });
  if (scope.response.status !== 201 || scope.body?.scope?.status !== "UNCERTAIN") throw new Error("compliance scope create failed");

  const employee = await request(`/api/saas/organizations/${orgId}/employees`, {
    method: "POST", cookie: owner.cookie, csrf: owner.csrf,
    body: {
      employeeNumber: "E-001",
      displayName: "김테스트",
      workEmail: "employee-record@example.com",
      workplaceId,
      employmentType: "REGULAR",
      hireDate: "2026-02-01",
      weeklyContractHours: 40,
      wageType: "MONTHLY",
      baseWage: 2800000,
      fixedAllowances: [{ code: "MEAL", amount: 200000 }],
      jobTitle: "운영",
      jobGrade: "사원"
    },
  });
  if (employee.response.status !== 201 || employee.body?.employment?.baseWage !== 2800000) {
    throw new Error(`employee create failed: ${employee.response.status} ${JSON.stringify(employee.body)}`);
  }

  const policy = await request(`/api/saas/organizations/${orgId}/policy-facts`, {
    method: "PUT", cookie: owner.cookie, csrf: owner.csrf,
    body: { facts: { rulesOfEmploymentExists: true, inclusiveWage: false }, confidence: { rulesOfEmploymentExists: "KNOWN" } },
  });
  if (policy.response.status !== 200 || !policy.body?.onboarding?.completedSteps?.includes("POLICY_FACTS")) throw new Error("policy facts save failed");

  const profileAfterPolicy = await request(`/api/saas/organizations/${orgId}/business-profile`, { cookie: owner.cookie });
  if (profileAfterPolicy.body?.profile?.industryCode !== "G47" || profileAfterPolicy.body?.profile?.payday !== 25) {
    throw new Error(`partial policy update wiped company profile: ${JSON.stringify(profileAfterPolicy.body)}`);
  }

  const imported = await request(`/api/saas/organizations/${orgId}/employees/import`, {
    method: "POST", cookie: owner.cookie, csrf: owner.csrf,
    body: { rows: [
      { employeeNumber: "E-002", displayName: "이정상", hireDate: "2026-03-01", workplaceId, weeklyContractHours: 20, wageType: "HOURLY", baseWage: 13000 },
      { employeeNumber: "E-003", displayName: "", hireDate: "bad-date", workplaceId }
    ] },
  });
  if (imported.response.status !== 200 || imported.body?.job?.accepted !== 1 || imported.body?.job?.rejected !== 1) {
    throw new Error(`employee import accounting failed: ${imported.response.status} ${JSON.stringify(imported.body)}`);
  }

  const employees = await request(`/api/saas/organizations/${orgId}/employees`, { cookie: owner.cookie });
  if (employees.response.status !== 200 || employees.body?.employees?.length !== 2) throw new Error("employee list count invalid");

  const onboarding = await request(`/api/saas/organizations/${orgId}/onboarding`, { cookie: owner.cookie });
  const completed = new Set(onboarding.body?.completedSteps || []);
  for (const step of ["COMPANY_PROFILE", "WORKPLACES", "COMPLIANCE_SCOPE", "EMPLOYEES", "POLICY_FACTS"]) {
    if (!completed.has(step)) throw new Error(`onboarding step missing: ${step}`);
  }
  if (onboarding.body?.currentStep !== "RISK_SCAN" || !onboarding.body?.missingMilestones?.includes("riskScanCompleted")) {
    throw new Error(`onboarding should be waiting for Risk Scan: ${JSON.stringify(onboarding.body)}`);
  }

  const managerInvite = await request(`/api/saas/organizations/${orgId}/invitations`, {
    method: "POST", cookie: owner.cookie, csrf: owner.csrf,
    body: { email: "business-manager@example.com", roleKey: "MANAGER" },
  });
  const manager = await login("business-manager@example.com");
  const managerAccept = await request("/api/saas/invitations/accept", {
    method: "POST", cookie: manager.cookie, csrf: manager.csrf, body: { token: managerInvite.body.debugToken },
  });
  if (managerAccept.response.status !== 200) throw new Error("manager invitation accept failed");
  const managerEmployees = await request(`/api/saas/organizations/${orgId}/employees`, { cookie: manager.cookie });
  if (managerEmployees.response.status !== 403) throw new Error("Manager broad employee collection must stay blocked before assigned-scope enforcement");

  const pool = createPostgresPool({ applicationName: "insaya-business-onboarding-e2e-verify" });
  try {
    const [employeeCount, links, importJob, auditRows, profileRow] = await Promise.all([
      pool.query("SELECT COUNT(*)::int c FROM employees WHERE organization_id=$1", [orgId]),
      pool.query("SELECT COUNT(*)::int c FROM employee_user_links WHERE organization_id=$1", [orgId]),
      pool.query("SELECT total_rows,accepted_rows,rejected_rows,status FROM employee_import_jobs WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 1", [orgId]),
      pool.query("SELECT action FROM audit_logs WHERE organization_id=$1 ORDER BY created_at", [orgId]),
      pool.query("SELECT industry_code,payday,rules_of_employment_exists FROM business_profiles WHERE organization_id=$1", [orgId]),
    ]);
    if (Number(employeeCount.rows[0]?.c) !== 2) throw new Error("persisted employee count invalid");
    if (Number(links.rows[0]?.c) !== 0) throw new Error("Employee records must not auto-link to global Users");
    if (importJob.rows[0]?.status !== "COMPLETED" || Number(importJob.rows[0]?.accepted_rows) !== 1 || Number(importJob.rows[0]?.rejected_rows) !== 1) throw new Error("import job persistence invalid");
    if (profileRow.rows[0]?.industry_code !== "G47" || Number(profileRow.rows[0]?.payday) !== 25 || profileRow.rows[0]?.rules_of_employment_exists !== true) throw new Error("profile merge persistence invalid");
    const actions = auditRows.rows.map((row) => row.action);
    for (const expected of ["business.profile.update", "workplace.create", "compliance.scope.create", "employee.create", "employee.import"]) {
      if (!actions.includes(expected)) throw new Error(`Business audit missing: ${expected}`);
    }
  } finally {
    await pool.end();
  }

  console.log("Business onboarding E2E passed: profile + workplace + ComplianceScope + Employee Lite + import accounting + onboarding state + Manager scope safety.");
} finally {
  await new Promise((resolve) => server.close(resolve));
  await Promise.allSettled([closeRuntimeStorage(), closeRuntimePostgres()]);
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
