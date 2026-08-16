import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { once } from "node:events";
import { createPostgresPool } from "../lib/postgres-client.js";
import { applyPostgresMigrations } from "../lib/postgres-migrations.js";
import { kstMonth } from "../lib/compliance-close-contract.js";
import { addDays, kstDateOnly } from "../lib/compliance-calendar-contract.js";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
Object.assign(process.env, {
  STORAGE_DRIVER: "postgres",
  SAAS_ENABLED: "1",
  SAAS_AUTH_TOKEN_ECHO: "1",
  SAAS_SESSION_SECRET: "business-close-e2e-secret",
  SESSION_SECRET: "business-close-legacy-secret",
  ADMIN_TOKEN: "business-close-admin",
  NODE_ENV: "test",
  REQUIRE_PERSISTENT_DB: "0",
  PERSISTENT_STORAGE: "0",
});

const now = new Date();
const month = kstMonth(now);
const yesterday = addDays(kstDateOnly(now), -1);

const migrationPool = createPostgresPool({ applicationName: "insaya-business-close-e2e-migrate" });
await applyPostgresMigrations(migrationPool, { logger: { log() {} } });
await migrationPool.end();

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "insaya-business-close-"));
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
  return { cookie: cookieFrom(verified.response), csrf: verified.body.csrf, userId: verified.body.user.id };
}

try {
  const owner = await login("close-owner@example.com");
  const org = await request("/api/saas/organizations", {
    method: "POST", cookie: owner.cookie, csrf: owner.csrf,
    body: { type: "BUSINESS", legalName: "월간점검 테스트 주식회사", displayName: "월간점검 테스트" },
  });
  if (org.response.status !== 201) throw new Error(`org create failed: ${JSON.stringify(org.body)}`);
  const orgId = org.body.organization.id;
  const actionId = `act_${crypto.randomUUID()}`;
  const pool = createPostgresPool({ applicationName: "insaya-business-close-e2e-seed" });
  try {
    const due = await request(`/api/saas/organizations/${orgId}/actions/${actionId}/due-date`, { cookie: owner.cookie });
    void due;
    const dueAt = new Date(`${yesterday}T14:59:59.999Z`).toISOString();
    await pool.query(
      `INSERT INTO compliance_actions
       (id,organization_id,risk_finding_id,action_key,title,status,priority,owner_membership_id,due_at,blocked_reason,completed_at,dismissed_at,dismissed_reason,metadata,created_at,updated_at)
       VALUES ($1,$2,NULL,$3,'월간 점검 미완료 조치','OPEN','HIGH',NULL,$4,NULL,NULL,NULL,NULL,$5,NOW(),NOW())`,
      [actionId, orgId, `manual.close.${actionId}`, dueAt, JSON.stringify({ dueDateSource: "MANUAL_INTERNAL" })]
    );

    const preview = await request(`/api/saas/organizations/${orgId}/compliance-close/current?month=${month}`, { cookie: owner.cookie });
    if (preview.response.status !== 200 || preview.body?.period?.status !== "OPEN" || preview.body?.period?.readiness?.unresolvedCount !== 1 || preview.body?.period?.snapshot?.actions?.overdue !== 1) {
      throw new Error(`close preview invalid: ${JSON.stringify(preview.body)}`);
    }

    const refresh = await request(`/api/saas/organizations/${orgId}/compliance-close/${month}/refresh`, { method: "POST", cookie: owner.cookie, csrf: owner.csrf, body: {} });
    if (refresh.response.status !== 200 || !refresh.body?.period?.id || !refresh.body?.period?.snapshotHash) throw new Error(`close refresh failed: ${JSON.stringify(refresh.body)}`);
    const openHash = refresh.body.period.snapshotHash;

    const noAck = await request(`/api/saas/organizations/${orgId}/compliance-close/${month}/close`, { method: "POST", cookie: owner.cookie, csrf: owner.csrf, body: {} });
    if (noAck.response.status !== 400 || noAck.body?.error !== "compliance_close_acknowledgement_required") throw new Error(`close must require acknowledgement: ${JSON.stringify(noAck.body)}`);

    const noNote = await request(`/api/saas/organizations/${orgId}/compliance-close/${month}/close`, { method: "POST", cookie: owner.cookie, csrf: owner.csrf, body: { acknowledgeUnresolved: true } });
    if (noNote.response.status !== 400 || noNote.body?.error !== "compliance_close_note_required") throw new Error(`close must require note for overdue/high impact: ${JSON.stringify(noNote.body)}`);

    const closed = await request(`/api/saas/organizations/${orgId}/compliance-close/${month}/close`, {
      method: "POST", cookie: owner.cookie, csrf: owner.csrf,
      body: { acknowledgeUnresolved: true, note: "지연 조치를 확인했고 다음 영업일 처리 예정" },
    });
    if (closed.response.status !== 200 || closed.body?.period?.status !== "CLOSED" || closed.body?.idempotent !== false || !closed.body?.snapshotId) throw new Error(`close failed: ${JSON.stringify(closed.body)}`);
    const closedHash = closed.body.period.snapshotHash;
    if (closedHash !== openHash) throw new Error("unchanged state should close with same deterministic snapshot hash");

    const repeated = await request(`/api/saas/organizations/${orgId}/compliance-close/${month}/close`, {
      method: "POST", cookie: owner.cookie, csrf: owner.csrf,
      body: { acknowledgeUnresolved: true, note: "다시 닫기" },
    });
    if (repeated.response.status !== 200 || repeated.body?.idempotent !== true) throw new Error("repeated close must be idempotent");

    await pool.query("UPDATE compliance_actions SET status='DONE',completed_at=NOW(),updated_at=NOW() WHERE id=$1 AND organization_id=$2", [actionId, orgId]);
    const closedView = await request(`/api/saas/organizations/${orgId}/compliance-close/current?month=${month}`, { cookie: owner.cookie });
    if (closedView.body?.period?.snapshotHash !== closedHash || closedView.body?.period?.snapshot?.actions?.active !== 1) throw new Error("closed snapshot changed after source data mutation");

    const history = await request(`/api/saas/organizations/${orgId}/compliance-close/history`, { cookie: owner.cookie });
    if (history.response.status !== 200 || history.body?.periods?.length !== 1 || history.body.periods[0].periodMonth !== month) throw new Error(`history invalid: ${JSON.stringify(history.body)}`);
    const snapshots = await request(`/api/saas/organizations/${orgId}/compliance-close/${month}/snapshots`, { cookie: owner.cookie });
    if (snapshots.response.status !== 200 || snapshots.body?.snapshots?.length !== 1 || snapshots.body.snapshots[0].snapshotHash !== closedHash) throw new Error(`snapshot history invalid: ${JSON.stringify(snapshots.body)}`);

    const outsider = await login("close-outsider@example.com");
    const isolated = await request(`/api/saas/organizations/${orgId}/compliance-close/current?month=${month}`, { cookie: outsider.cookie });
    if (isolated.response.status !== 404) throw new Error("cross-tenant close access must return not found");

    const periodRows = await pool.query("SELECT status,unresolved_acknowledged,close_note FROM compliance_close_periods WHERE organization_id=$1 AND period_month=$2", [orgId, month]);
    const snapshotRows = await pool.query("SELECT COUNT(*)::integer AS count FROM compliance_close_snapshots WHERE organization_id=$1", [orgId]);
    const eventRows = await pool.query("SELECT event_type FROM compliance_close_events WHERE organization_id=$1 ORDER BY created_at", [orgId]);
    const auditRows = await pool.query("SELECT action FROM audit_logs WHERE organization_id=$1 AND action LIKE 'compliance.close.%' ORDER BY created_at", [orgId]);
    if (periodRows.rows[0]?.status !== "CLOSED" || periodRows.rows[0]?.unresolved_acknowledged !== true || !periodRows.rows[0]?.close_note) throw new Error("closed period persistence invalid");
    if (snapshotRows.rows[0]?.count !== 1) throw new Error("closed snapshot must be append-only single V1 row");
    if (eventRows.rows.filter((row) => row.event_type === "CLOSED").length !== 1 || !eventRows.rows.some((row) => row.event_type === "REFRESHED")) throw new Error(`close events invalid: ${JSON.stringify(eventRows.rows)}`);
    if (!auditRows.rows.some((row) => row.action === "compliance.close.refresh") || !auditRows.rows.some((row) => row.action === "compliance.close.complete")) throw new Error(`close audit invalid: ${JSON.stringify(auditRows.rows)}`);
  } finally { await pool.end(); }

  console.log("Business Compliance Close E2E passed: preview + refresh + explicit unresolved acknowledgement + immutable close snapshot + idempotency + tenant isolation + audit.");
} finally {
  await new Promise((resolve) => server.close(resolve));
  await Promise.allSettled([closeRuntimeStorage(), closeRuntimePostgres()]);
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
