import crypto from "node:crypto";
import { getRuntimePostgresPool } from "./runtime-postgres.js";
import { withPostgresTransaction } from "./postgres-client.js";
import { kstDateOnly } from "./compliance-calendar-contract.js";
import {
  DEADLINE_NOTIFICATION_CHANNEL,
  DEADLINE_NOTIFICATION_RECIPIENT_ROLES,
  buildDeadlineNotification,
  deadlineNotificationDedupKey,
  deadlineNotificationKey,
} from "./compliance-notification-contract.js";

const id = (prefix) => `${prefix}_${crypto.randomUUID()}`;
const nowISO = (now = new Date()) => (now instanceof Date ? now : new Date(now)).toISOString();
const ACTIVE_ACTION_STATUSES = Object.freeze(["OPEN", "IN_PROGRESS", "BLOCKED"]);

async function cancelStalePending(client, now) {
  const result = await client.query(
    `UPDATE compliance_notification_outbox n
     SET status='CANCELLED',cancelled_at=$1
     WHERE n.status='PENDING' AND n.channel='IN_APP' AND n.source_type='COMPLIANCE_ACTION'
       AND (
         NOT EXISTS (
           SELECT 1 FROM compliance_actions a
           WHERE a.id=n.source_id AND a.organization_id=n.organization_id
             AND a.status = ANY($2::text[]) AND a.due_at IS NOT NULL
         )
         OR NOT EXISTS (
           SELECT 1 FROM compliance_actions a
           WHERE a.id=n.source_id AND a.organization_id=n.organization_id
             AND to_char(a.due_at AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') = n.payload->>'dueDate'
         )
         OR NOT EXISTS (
           SELECT 1 FROM organization_memberships m
           WHERE m.organization_id=n.organization_id AND m.user_id=n.recipient_user_id
             AND m.status='ACTIVE' AND m.role_key = ANY($3::text[])
         )
       )`,
    [nowISO(now), ACTIVE_ACTION_STATUSES, DEADLINE_NOTIFICATION_RECIPIENT_ROLES]
  );
  return result.rowCount || 0;
}

export async function generateDeadlineNotificationCandidates({ now = new Date() } = {}) {
  return withPostgresTransaction(getRuntimePostgresPool(), async (client) => {
    const cancelled = await cancelStalePending(client, now);
    const result = await client.query(
      `SELECT
         a.id AS action_id,a.organization_id,a.title,a.status,a.priority,a.due_at,a.metadata,
         m.user_id AS recipient_user_id
       FROM compliance_actions a
       JOIN organizations o ON o.id=a.organization_id AND o.status='ACTIVE'
       JOIN organization_memberships m ON m.organization_id=a.organization_id
         AND m.status='ACTIVE' AND m.role_key = ANY($1::text[])
       WHERE a.status = ANY($2::text[]) AND a.due_at IS NOT NULL
       ORDER BY a.due_at,a.organization_id,a.id,m.user_id`,
      [DEADLINE_NOTIFICATION_RECIPIENT_ROLES, ACTIVE_ACTION_STATUSES]
    );

    let generated = 0;
    for (const row of result.rows) {
      const notificationKey = deadlineNotificationKey({ dueAt: row.due_at, now });
      if (!notificationKey) continue;
      const dueDate = kstDateOnly(row.due_at);
      const dueDateSource = row.metadata?.dueDateSource || null;
      const content = buildDeadlineNotification({
        actionTitle: row.title,
        dueAt: row.due_at,
        dueDateSource,
        notificationKey,
      });
      const dedupKey = deadlineNotificationDedupKey({
        organizationId: row.organization_id,
        recipientUserId: row.recipient_user_id,
        actionId: row.action_id,
        dueDate,
        notificationKey,
      });
      const outboxId = id("nout");
      const createdAt = nowISO(now);
      const inserted = await client.query(
        `INSERT INTO compliance_notification_outbox
         (id,organization_id,recipient_user_id,channel,source_type,source_id,notification_key,dedup_key,status,scheduled_for,payload,created_at,delivered_at,cancelled_at,failure_reason)
         VALUES ($1,$2,$3,$4,'COMPLIANCE_ACTION',$5,$6,$7,'PENDING',$8,$9,$8,NULL,NULL,NULL)
         ON CONFLICT(dedup_key) DO NOTHING`,
        [
          outboxId,
          row.organization_id,
          row.recipient_user_id,
          DEADLINE_NOTIFICATION_CHANNEL,
          row.action_id,
          notificationKey,
          dedupKey,
          createdAt,
          JSON.stringify({
            title: content.title,
            body: content.body,
            severity: content.severity,
            dueDate,
            dueDateSource,
            actionPriority: row.priority,
            ...content.metadata,
          }),
        ]
      );
      generated += inserted.rowCount || 0;
    }
    return { generated, cancelled, scanned: result.rowCount || 0 };
  });
}

export async function deliverPendingInAppNotifications({ now = new Date(), limit = 200 } = {}) {
  const safeLimit = Math.min(Math.max(Number.parseInt(String(limit), 10) || 200, 1), 500);
  return withPostgresTransaction(getRuntimePostgresPool(), async (client) => {
    const pending = await client.query(
      `SELECT * FROM compliance_notification_outbox
       WHERE status='PENDING' AND channel='IN_APP' AND scheduled_for <= $1
       ORDER BY scheduled_for,id
       LIMIT $2
       FOR UPDATE SKIP LOCKED`,
      [nowISO(now), safeLimit]
    );
    let delivered = 0;
    for (const row of pending.rows) {
      const payload = row.payload || {};
      await client.query(
        `INSERT INTO in_app_notifications
         (id,organization_id,recipient_user_id,outbox_id,notification_key,title,body,severity,source_type,source_id,metadata,created_at,read_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NULL)
         ON CONFLICT(outbox_id) DO NOTHING`,
        [
          id("nin"), row.organization_id, row.recipient_user_id, row.id, row.notification_key,
          String(payload.title || "노무 조치 알림"), String(payload.body || ""), payload.severity || "INFO",
          row.source_type, row.source_id, JSON.stringify(payload), nowISO(now),
        ]
      );
      const updated = await client.query(
        `UPDATE compliance_notification_outbox SET status='DELIVERED',delivered_at=$1
         WHERE id=$2 AND status='PENDING'`,
        [nowISO(now), row.id]
      );
      delivered += updated.rowCount || 0;
    }
    return { delivered, selected: pending.rowCount || 0 };
  });
}

export async function runComplianceNotificationSweep({ now = new Date() } = {}) {
  const candidates = await generateDeadlineNotificationCandidates({ now });
  const delivery = await deliverPendingInAppNotifications({ now });
  return { ...candidates, ...delivery };
}

export async function listInAppNotifications({ organizationId, recipientUserId, unreadOnly = false, limit = 50 } = {}) {
  const safeLimit = Math.min(Math.max(Number.parseInt(String(limit), 10) || 50, 1), 100);
  const result = await getRuntimePostgresPool().query(
    `SELECT id,notification_key,title,body,severity,source_type,source_id,metadata,created_at,read_at
     FROM in_app_notifications
     WHERE organization_id=$1 AND recipient_user_id=$2
       AND ($3::boolean = false OR read_at IS NULL)
     ORDER BY created_at DESC,id DESC
     LIMIT $4`,
    [organizationId, recipientUserId, !!unreadOnly, safeLimit]
  );
  return result.rows.map((row) => ({
    id: row.id,
    notificationKey: row.notification_key,
    title: row.title,
    body: row.body,
    severity: row.severity,
    sourceType: row.source_type,
    sourceId: row.source_id,
    metadata: row.metadata || {},
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    readAt: row.read_at instanceof Date ? row.read_at.toISOString() : row.read_at,
  }));
}

export async function getUnreadInAppNotificationCount({ organizationId, recipientUserId } = {}) {
  const result = await getRuntimePostgresPool().query(
    `SELECT COUNT(*)::integer AS count FROM in_app_notifications
     WHERE organization_id=$1 AND recipient_user_id=$2 AND read_at IS NULL`,
    [organizationId, recipientUserId]
  );
  return Number(result.rows[0]?.count || 0);
}

export async function markInAppNotificationRead({ organizationId, notificationId, recipientUserId, now = new Date() } = {}) {
  const result = await getRuntimePostgresPool().query(
    `UPDATE in_app_notifications SET read_at=COALESCE(read_at,$1)
     WHERE id=$2 AND organization_id=$3 AND recipient_user_id=$4
     RETURNING id,read_at`,
    [nowISO(now), notificationId, organizationId, recipientUserId]
  );
  if (!result.rows[0]) return null;
  return {
    id: result.rows[0].id,
    readAt: result.rows[0].read_at instanceof Date ? result.rows[0].read_at.toISOString() : result.rows[0].read_at,
  };
}
