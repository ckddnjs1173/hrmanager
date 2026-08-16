import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { once } from "node:events";
import { createPostgresPool } from "../lib/postgres-client.js";
import { applyPostgresMigrations } from "../lib/postgres-migrations.js";
import { addDays, kstDateOnly } from "../lib/compliance-calendar-contract.js";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
Object.assign(process.env, {
  STORAGE_DRIVER: "postgres",
  SAAS_ENABLED: "1",
  SAAS_AUTH_TOKEN_ECHO: "1",
  SAAS_SESSION_SECRET: "business-calendar-e2e-secret",
  SESSION_SECRET: "business-calendar-legacy-secret",
  ADMIN_TOKEN: "business-calendar-admin",
  NODE_ENV: "test",
  REQUIRE_PERSISTENT_DB: "0",
  PERSISTENT_STORAGE: "0",
});

const today = kstDateOnly(new Date());
const dueDate = addDays(today, 4);
const rangeTo = addDays(today, 30);

const migrationPool = createPostgresPool({ applicationName: "insaya-business-calendar-e2e-migrate" });
await applyPostgresMigrations(migrationPool, { logger: { log() {} } });
await migrationPool.end();

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "insaya-business-calendar-"));
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
  const response = await fetch(`${base}${pathname}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { response, body: parsed };
}

function cookieFrom(response) { return (response.headers.get("set-cookie") || "").split(";")[0]; }
async function login(email) {
  const challenge = await request("/api/saas/auth/magic-link", { method: "POST", body: { email } });
  const verified = await request("/api/saas/auth/magic-link/verify", { method: "POST", body: { token: challenge.body.debugToken } });
  return { cookie: cookieFrom(verified.response), csrf: verified.body.csrf };
}

try {
  const owner = await login("calendar-owner@example.com");
  const orgResponse = await request("/api/saas/organizations", {
    method: "POST", cookie: owner.cookie, csrf: owner.csrf,
    body: { type: "BUSINESS", legalName: "캘린더 테스트 유한회사", displayName: "캘린더 테스트" },
  });
  if (orgResponse.response.status !== 201) throw new Error("calendar org create failed");
  const orgId = orgResponse.body.organization.id;
  const actionId = `act_${crypto.randomUUID()}`;
  const pool = createPostgresPool({ applicationName: "insaya-business-calendar-e2e-seed" });
  try {
    await pool.query(
      `INSERT INTO compliance_actions
       (id,organization_id,risk_finding_id,action_key,title,status,priority,owner_membership_id,due_at,blocked_reason,completed_at,dismissed_at,dismissed_reason,metadata,created_at,updated_at)
       VALUES ($1,$2,NULL,'manual.calendar_test','내부 관리 기한 테스트','OPEN','HIGH',NULL,NULL,NULL,NULL,NULL,NULL,'{}'::jsonb,NOW(),NOW())`,
      [actionId, orgId]
    );
  } finally { await pool.end(); }

  const setDue = await request(`/api/saas/organizations/${orgId}/actions/${actionId}/due-date`, {
    method: "PATCH", cookie: owner.cookie, csrf: owner.csrf, body: { dueDate },
  });
  if (setDue.response.status !== 200 || setDue.body?.action?.dueDate !== dueDate || setDue.body?.action?.dueDateSource !== "MANUAL_INTERNAL") {
    throw new Error(`due date set failed: ${JSON.stringify(setDue.body)}`);
  }

  const calendarPath = `/api/saas/organizations/${orgId}/compliance-calendar?from=${today}&to=${rangeTo}`;
  const calendar = await request(calendarPath, { cookie: owner.cookie });
  const event = calendar.body?.events?.find((item) => item.sourceId === actionId);
  if (calendar.response.status !== 200 || !event || event.dueDate !== dueDate || event.timingStatus !== "NEXT_7_DAYS" || calendar.body?.range?.timeZone !== "Asia/Seoul") {
    throw new Error(`calendar projection invalid: ${JSON.stringify(calendar.body)}`);
  }

  const invalid = await request(`/api/saas/organizations/${orgId}/actions/${actionId}/due-date`, {
    method: "PATCH", cookie: owner.cookie, csrf: owner.csrf, body: { dueDate: "2026-02-30" },
  });
  if (invalid.response.status !== 400 || invalid.body?.error !== "compliance_action_due_date_invalid") throw new Error("invalid due date must be rejected");

  const outsider = await login("calendar-outsider@example.com");
  const isolated = await request(calendarPath, { cookie: outsider.cookie });
  if (isolated.response.status !== 404) throw new Error("cross-tenant calendar access must return not found");

  const cleared = await request(`/api/saas/organizations/${orgId}/actions/${actionId}/due-date`, {
    method: "PATCH", cookie: owner.cookie, csrf: owner.csrf, body: { dueDate: null },
  });
  if (cleared.response.status !== 200 || cleared.body?.action?.dueDate !== null) throw new Error("due date clear failed");
  const calendarAfter = await request(calendarPath, { cookie: owner.cookie });
  if (calendarAfter.body?.events?.some((item) => item.sourceId === actionId)) throw new Error("cleared action remained in calendar");

  const verify = createPostgresPool({ applicationName: "insaya-business-calendar-e2e-verify" });
  try {
    const events = await verify.query("SELECT type,metadata FROM compliance_action_events WHERE organization_id=$1 AND compliance_action_id=$2 ORDER BY created_at", [orgId, actionId]);
    if (events.rows.length !== 2 || events.rows.some((row) => row.type !== "DUE_DATE_CHANGED")) throw new Error(`due date history invalid: ${JSON.stringify(events.rows)}`);
    const audits = await verify.query("SELECT action FROM audit_logs WHERE organization_id=$1 AND resource_id=$2 ORDER BY created_at", [orgId, actionId]);
    if (audits.rows.filter((row) => row.action === "compliance.action.due_date").length !== 2) throw new Error(`due date audit invalid: ${JSON.stringify(audits.rows)}`);
  } finally { await verify.end(); }

  console.log("Business Calendar E2E passed: internal due date + KST projection + tenant isolation + clear + audit/history.");
} finally {
  await new Promise((resolve) => server.close(resolve));
  await Promise.allSettled([closeRuntimeStorage(), closeRuntimePostgres()]);
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
