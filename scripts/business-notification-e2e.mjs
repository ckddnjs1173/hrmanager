import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { once } from "node:events";
import { createPostgresPool } from "../lib/postgres-client.js";
import { applyPostgresMigrations } from "../lib/postgres-migrations.js";
import { addDays, kstDateOnly } from "../lib/compliance-calendar-contract.js";
import {
  generateDeadlineNotificationCandidates,
  runComplianceNotificationSweep,
} from "../lib/saas-notification-repo.js";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
Object.assign(process.env, {
  STORAGE_DRIVER: "postgres",
  SAAS_ENABLED: "1",
  SAAS_AUTH_TOKEN_ECHO: "1",
  SAAS_SESSION_SECRET: "business-notification-e2e-secret",
  SESSION_SECRET: "business-notification-legacy-secret",
  ADMIN_TOKEN: "business-notification-admin",
  NODE_ENV: "test",
  REQUIRE_PERSISTENT_DB: "0",
  PERSISTENT_STORAGE: "0",
});

const now = new Date();
const today = kstDateOnly(now);
const due3 = addDays(today, 3);
const due1 = addDays(today, 1);
const due4 = addDays(today, 4);
const overdueDate = addDays(today, -1);
const oneDayLater = new Date(now.getTime() + 86_400_000);

const migrationPool = createPostgresPool({ applicationName: "insaya-business-notification-e2e-migrate" });
await applyPostgresMigrations(migrationPool, { logger: { log() {} } });
await migrationPool.end();

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "insaya-business-notification-"));
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

async function seedAction(pool, organizationId, title) {
  const actionId = `act_${crypto.randomUUID()}`;
  await pool.query(
    `INSERT INTO compliance_actions
     (id,organization_id,risk_finding_id,action_key,title,status,priority,owner_membership_id,due_at,blocked_reason,completed_at,dismissed_at,dismissed_reason,metadata,created_at,updated_at)
     VALUES ($1,$2,NULL,$3,$4,'OPEN','HIGH',NULL,NULL,NULL,NULL,NULL,NULL,'{}'::jsonb,NOW(),NOW())`,
    [actionId, organizationId, `manual.notification.${actionId}`, title]
  );
  return actionId;
}

async function setDue(owner, organizationId, actionId, dueDate) {
  const result = await request(`/api/saas/organizations/${organizationId}/actions/${actionId}/due-date`, {
    method: "PATCH", cookie: owner.cookie, csrf: owner.csrf, body: { dueDate },
  });
  if (result.response.status !== 200) throw new Error(`set due failed: ${JSON.stringify(result.body)}`);
}

try {
  const owner = await login("notification-owner@example.com");
  const manager = await login("notification-manager@example.com");
  const orgResponse = await request("/api/saas/organizations", {
    method: "POST", cookie: owner.cookie, csrf: owner.csrf,
    body: { type: "BUSINESS", legalName: "알림 테스트 주식회사", displayName: "알림 테스트" },
  });
  if (orgResponse.response.status !== 201) throw new Error("notification org create failed");
  const orgId = orgResponse.body.organization.id;
  const pool = createPostgresPool({ applicationName: "insaya-business-notification-e2e-seed" });
  try {
    const membershipNow = new Date().toISOString();
    await pool.query(
      `INSERT INTO organization_memberships
       (id,organization_id,user_id,role_key,status,scope,joined_at,removed_at,created_at,updated_at)
       VALUES ($1,$2,$3,'MANAGER','ACTIVE','{}'::jsonb,$4,NULL,$4,$4)`,
      [`mem_${crypto.randomUUID()}`, orgId, manager.userId, membershipNow]
    );

    const actionId = await seedAction(pool, orgId, "3일 전 알림 테스트");
    await setDue(owner, orgId, actionId, due3);

    const first = await runComplianceNotificationSweep({ now });
    if (first.generated !== 1 || first.delivered !== 1) throw new Error(`first sweep invalid: ${JSON.stringify(first)}`);
    const duplicate = await runComplianceNotificationSweep({ now });
    if (duplicate.generated !== 0 || duplicate.delivered !== 0) throw new Error(`dedup failed: ${JSON.stringify(duplicate)}`);

    const managerInbox = await request(`/api/saas/organizations/${orgId}/notifications`, { cookie: manager.cookie });
    if (managerInbox.response.status !== 200 || managerInbox.body?.unreadCount !== 0 || managerInbox.body?.notifications?.length !== 0) {
      throw new Error(`MANAGER must not receive automatic deadline notifications: ${JSON.stringify(managerInbox.body)}`);
    }

    const inbox = await request(`/api/saas/organizations/${orgId}/notifications`, { cookie: owner.cookie });
    if (inbox.response.status !== 200 || inbox.body?.unreadCount !== 1 || inbox.body?.notifications?.length !== 1) {
      throw new Error(`inbox invalid: ${JSON.stringify(inbox.body)}`);
    }
    const notice = inbox.body.notifications[0];
    if (notice.notificationKey !== "ACTION_DUE_3D" || !notice.body.includes("내부 관리 기한") || notice.metadata?.dueDate !== due3) {
      throw new Error(`notification content invalid: ${JSON.stringify(notice)}`);
    }

    const read = await request(`/api/saas/organizations/${orgId}/notifications/${notice.id}/read`, {
      method: "PATCH", cookie: owner.cookie, csrf: owner.csrf, body: {},
    });
    if (read.response.status !== 200 || !read.body?.notification?.readAt) throw new Error("notification read failed");
    const afterRead = await request(`/api/saas/organizations/${orgId}/notifications?unreadOnly=1`, { cookie: owner.cookie });
    if (afterRead.body?.unreadCount !== 0 || afterRead.body?.notifications?.length !== 0) throw new Error("notification unread state invalid");

    await setDue(owner, orgId, actionId, due1);
    const changedDue = await runComplianceNotificationSweep({ now });
    if (changedDue.generated !== 1 || changedDue.delivered !== 1) throw new Error(`changed due notification invalid: ${JSON.stringify(changedDue)}`);

    const pendingActionId = await seedAction(pool, orgId, "due date 변경 stale 취소 테스트");
    await setDue(owner, orgId, pendingActionId, due3);
    const pending = await generateDeadlineNotificationCandidates({ now });
    if (pending.generated !== 1) throw new Error(`pending candidate missing: ${JSON.stringify(pending)}`);
    await setDue(owner, orgId, pendingActionId, due4);
    const stale = await generateDeadlineNotificationCandidates({ now });
    if (stale.cancelled < 1 || stale.generated !== 0) throw new Error(`due-date stale pending not cancelled: ${JSON.stringify(stale)}`);

    const milestoneActionId = await seedAction(pool, orgId, "milestone stale 취소 테스트");
    await setDue(owner, orgId, milestoneActionId, due3);
    const milestonePending = await generateDeadlineNotificationCandidates({ now });
    if (milestonePending.generated !== 1) throw new Error(`milestone candidate missing: ${JSON.stringify(milestonePending)}`);
    const afterMilestone = await generateDeadlineNotificationCandidates({ now: oneDayLater });
    const milestoneRow = await pool.query("SELECT status FROM compliance_notification_outbox WHERE organization_id=$1 AND source_id=$2 ORDER BY created_at DESC LIMIT 1", [orgId, milestoneActionId]);
    if (afterMilestone.cancelled < 1 || milestoneRow.rows[0]?.status !== "CANCELLED") throw new Error(`expired milestone candidate not cancelled: ${JSON.stringify(afterMilestone)}`);

    const overdueActionId = await seedAction(pool, orgId, "지연 알림 테스트");
    await setDue(owner, orgId, overdueActionId, overdueDate);
    const overdueFirst = await runComplianceNotificationSweep({ now });
    if (overdueFirst.generated !== 1 || overdueFirst.delivered !== 1) throw new Error(`overdue notification invalid: ${JSON.stringify(overdueFirst)}`);
    const overdueAgain = await runComplianceNotificationSweep({ now });
    if (overdueAgain.generated !== 0) throw new Error(`overdue repeated unexpectedly: ${JSON.stringify(overdueAgain)}`);

    const outsider = await login("notification-outsider@example.com");
    const isolated = await request(`/api/saas/organizations/${orgId}/notifications`, { cookie: outsider.cookie });
    if (isolated.response.status !== 404) throw new Error("cross-tenant notification access must return not found");

    const rows = await pool.query(
      `SELECT status,notification_key,payload FROM compliance_notification_outbox
       WHERE organization_id=$1 ORDER BY created_at,id`,
      [orgId]
    );
    const cancelledRows = rows.rows.filter((row) => row.status === "CANCELLED");
    const deliveredRows = rows.rows.filter((row) => row.status === "DELIVERED");
    if (cancelledRows.length < 2 || deliveredRows.length < 3) throw new Error(`outbox lifecycle invalid: ${JSON.stringify(rows.rows)}`);
  } finally { await pool.end(); }

  console.log("Business Notification E2E passed: recipient policy + milestone + dedup + read + stale cancellation + one-time overdue + tenant isolation.");
} finally {
  await new Promise((resolve) => server.close(resolve));
  await Promise.allSettled([closeRuntimeStorage(), closeRuntimePostgres()]);
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
