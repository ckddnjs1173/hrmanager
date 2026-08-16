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
  SAAS_SESSION_SECRET: "business-risk-e2e-secret",
  SESSION_SECRET: "business-risk-legacy-secret",
  ADMIN_TOKEN: "business-risk-admin",
  NODE_ENV: "test",
  REQUIRE_PERSISTENT_DB: "0",
  PERSISTENT_STORAGE: "0",
});

const migrationPool = createPostgresPool({ applicationName: "insaya-business-risk-e2e-migrate" });
await applyPostgresMigrations(migrationPool, { logger: { log() {} } });
await migrationPool.end();

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "insaya-business-risk-"));
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
  const owner = await login("risk-owner@example.com");
  const orgResponse = await request("/api/saas/organizations", {
    method: "POST", cookie: owner.cookie, csrf: owner.csrf,
    body: { type: "BUSINESS", legalName: "리스크 테스트 유한회사", displayName: "리스크 테스트 회사" },
  });
  if (orgResponse.response.status !== 201) throw new Error("risk org create failed");
  const orgId = orgResponse.body.organization.id;

  await request(`/api/saas/organizations/${orgId}/business-profile`, {
    method: "PUT", cookie: owner.cookie, csrf: owner.csrf,
    body: { profile: { industryCode: "G47", payday: 25, defaultWeeklyHours: 40, wageSystem: "MIXED" } },
  });

  const workplace = await request(`/api/saas/organizations/${orgId}/workplaces`, {
    method: "POST", cookie: owner.cookie, csrf: owner.csrf,
    body: { name: "서울 본점", openedAt: "2026-01-01" },
  });
  if (workplace.response.status !== 201) throw new Error("risk workplace create failed");
  const workplaceId = workplace.body.workplace.id;

  const scope = await request(`/api/saas/organizations/${orgId}/compliance-scopes`, {
    method: "POST", cookie: owner.cookie, csrf: owner.csrf,
    body: { name: "초기 적용범위", status: "UNCERTAIN", basis: "검증 전", workplaceIds: [workplaceId] },
  });
  if (scope.response.status !== 201) throw new Error("risk scope create failed");

  const lowWage = await request(`/api/saas/organizations/${orgId}/employees`, {
    method: "POST", cookie: owner.cookie, csrf: owner.csrf,
    body: {
      employeeNumber: "R-001", displayName: "최저임금테스트", workplaceId,
      employmentType: "REGULAR", hireDate: "2026-01-01", weeklyContractHours: 40,
      wageType: "HOURLY", baseWage: 9500,
    },
  });
  if (lowWage.response.status !== 201) throw new Error(`low wage employee failed: ${JSON.stringify(lowWage.body)}`);
  const lowWageEmployeeId = lowWage.body.employee.id;

  const incomplete = await request(`/api/saas/organizations/${orgId}/employees`, {
    method: "POST", cookie: owner.cookie, csrf: owner.csrf,
    body: {
      employeeNumber: "R-002", displayName: "정보부족테스트", workplaceId,
      employmentType: "REGULAR", hireDate: "2026-02-01", wageType: "HOURLY",
    },
  });
  if (incomplete.response.status !== 201) throw new Error("incomplete employee create failed");

  const scan = await request(`/api/saas/organizations/${orgId}/risk-scan`, {
    method: "POST", cookie: owner.cookie, csrf: owner.csrf,
    body: { triggerType: "MANUAL" },
  });
  if (scan.response.status !== 201 || scan.body?.run?.status !== "COMPLETED") {
    throw new Error(`risk scan failed: ${scan.response.status} ${JSON.stringify(scan.body)}`);
  }
  if (scan.body.run.high !== 1 || scan.body.run.uncertain < 3) {
    throw new Error(`risk scan counts invalid: ${JSON.stringify(scan.body.run)}`);
  }
  if (!scan.body?.onboarding?.completedSteps?.includes("RISK_SCAN")) {
    throw new Error(`Risk Scan did not advance onboarding: ${JSON.stringify(scan.body?.onboarding)}`);
  }

  const dashboard = await request(`/api/saas/organizations/${orgId}/risks`, { cookie: owner.cookie });
  if (dashboard.response.status !== 200 || dashboard.body?.summary?.HIGH !== 1 || dashboard.body?.summary?.uncertain < 3) {
    throw new Error(`risk dashboard invalid: ${JSON.stringify(dashboard.body)}`);
  }
  const minFinding = dashboard.body.findings.find((finding) => finding.ruleId === "business.wage.hourly_below_minimum_2026" && finding.subjectId === lowWageEmployeeId);
  if (!minFinding || minFinding.applicability !== "APPLIES" || minFinding.severity !== "HIGH") {
    throw new Error(`minimum wage finding missing: ${JSON.stringify(dashboard.body.findings)}`);
  }

  const actions = await request(`/api/saas/organizations/${orgId}/actions`, { cookie: owner.cookie });
  const minimumAction = actions.body?.actions?.find((action) => action.riskFindingId === minFinding.id);
  if (actions.response.status !== 200 || !minimumAction || minimumAction.status !== "OPEN") {
    throw new Error(`minimum wage action missing: ${JSON.stringify(actions.body)}`);
  }

  const started = await request(`/api/saas/organizations/${orgId}/actions/${minimumAction.id}/status`, {
    method: "PATCH", cookie: owner.cookie, csrf: owner.csrf,
    body: { status: "IN_PROGRESS", note: "급여 검토 시작" },
  });
  if (started.response.status !== 200 || started.body?.action?.status !== "IN_PROGRESS") throw new Error("action start failed");

  const done = await request(`/api/saas/organizations/${orgId}/actions/${minimumAction.id}/status`, {
    method: "PATCH", cookie: owner.cookie, csrf: owner.csrf,
    body: { status: "DONE", note: "시급 수정 예정" },
  });
  if (done.response.status !== 200 || done.body?.action?.status !== "DONE" || done.body?.requiresRiskReevaluation !== true) {
    throw new Error(`action completion contract invalid: ${JSON.stringify(done.body)}`);
  }

  const onboardingAfterAction = await request(`/api/saas/organizations/${orgId}/onboarding`, { cookie: owner.cookie });
  if (!onboardingAfterAction.body?.activated || !onboardingAfterAction.body?.completedSteps?.includes("FIRST_ACTION")) {
    throw new Error(`Business activation not derived from real Action: ${JSON.stringify(onboardingAfterAction.body)}`);
  }

  const outsider = await login("risk-outsider@example.com");
  const isolated = await request(`/api/saas/organizations/${orgId}/risks`, { cookie: outsider.cookie });
  if (isolated.response.status !== 404) throw new Error("cross-tenant risk access must return not found");

  const pool = createPostgresPool({ applicationName: "insaya-business-risk-e2e-verify" });
  try {
    const lowEmployment = await pool.query(
      "SELECT id FROM employments WHERE organization_id=$1 AND employee_id=$2 AND status='ACTIVE'",
      [orgId, lowWageEmployeeId]
    );
    await pool.query("UPDATE employments SET base_wage=12000,updated_at=NOW() WHERE id=$1", [lowEmployment.rows[0].id]);

    const eventRows = await pool.query("SELECT type,from_status,to_status FROM compliance_action_events WHERE organization_id=$1 AND compliance_action_id=$2 ORDER BY created_at", [orgId, minimumAction.id]);
    if (eventRows.rows.length !== 2 || eventRows.rows[0].to_status !== "IN_PROGRESS" || eventRows.rows[1].to_status !== "DONE") {
      throw new Error(`action event history invalid: ${JSON.stringify(eventRows.rows)}`);
    }
  } finally {
    await pool.end();
  }

  const rescan = await request(`/api/saas/organizations/${orgId}/risk-scan`, {
    method: "POST", cookie: owner.cookie, csrf: owner.csrf,
    body: { triggerType: "ACTION_REEVALUATION" },
  });
  if (rescan.response.status !== 201 || rescan.body?.run?.high !== 0) throw new Error(`risk re-evaluation failed: ${JSON.stringify(rescan.body)}`);

  const after = await request(`/api/saas/organizations/${orgId}/risks`, { cookie: owner.cookie });
  if (after.body?.summary?.HIGH !== 0 || after.body?.findings?.some((finding) => finding.id === minFinding.id && finding.status !== "RESOLVED")) {
    throw new Error(`resolved risk remained active: ${JSON.stringify(after.body)}`);
  }

  const verifyPool = createPostgresPool({ applicationName: "insaya-business-risk-e2e-audit" });
  try {
    const auditRows = await verifyPool.query("SELECT action FROM audit_logs WHERE organization_id=$1 ORDER BY created_at", [orgId]);
    const auditActions = auditRows.rows.map((row) => row.action);
    if (!auditActions.includes("risk.scan") || !auditActions.includes("compliance.action.status")) {
      throw new Error(`risk/action audit missing: ${JSON.stringify(auditActions)}`);
    }
    const runCount = await verifyPool.query("SELECT COUNT(*)::int c FROM risk_evaluation_runs WHERE organization_id=$1 AND status='COMPLETED'", [orgId]);
    if (Number(runCount.rows[0]?.c) !== 2) throw new Error("risk run persistence invalid");
  } finally {
    await verifyPool.end();
  }

  console.log("Business Risk E2E passed: deterministic scan + uncertainty + min-wage finding + Action lifecycle + re-evaluation + tenant isolation + audit.");
} finally {
  await new Promise((resolve) => server.close(resolve));
  await Promise.allSettled([closeRuntimeStorage(), closeRuntimePostgres()]);
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
