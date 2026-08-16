import crypto from "node:crypto";
import { getRuntimePostgresPool } from "./runtime-postgres.js";
import { withPostgresTransaction } from "./postgres-client.js";
import { requireOrganizationPermission } from "./saas-tenant-repo.js";
import {
  ACTIVE_ACTION_STATUSES,
  classifyActionDeadline,
  kstDateOnly,
  kstEndOfDayIso,
  normalizeCalendarRange,
  summarizeCalendarEvents,
} from "./compliance-calendar-contract.js";

const id = (prefix) => `${prefix}_${crypto.randomUUID()}`;
const nowISO = () => new Date().toISOString();
const toIso = (value) => value instanceof Date ? value.toISOString() : value;

async function audit(client, { organizationId, actorUserId, action, resourceType, resourceId, requestId = null, metadata = {} }) {
  await client.query(
    `INSERT INTO audit_logs
      (id,organization_id,actor_user_id,actor_type,action,resource_type,resource_id,result,request_id,metadata,created_at)
     VALUES ($1,$2,$3,'USER',$4,$5,$6,'SUCCESS',$7,$8,$9)`,
    [id("aud"), organizationId, actorUserId, action, resourceType, resourceId, requestId, JSON.stringify(metadata), nowISO()]
  );
}

function mapCalendarEvent(row, now) {
  const dueAt = toIso(row.due_at);
  return {
    id: `action:${row.id}`,
    sourceType: "COMPLIANCE_ACTION",
    sourceId: row.id,
    title: row.title,
    priority: row.priority,
    actionStatus: row.status,
    dueAt,
    dueDate: kstDateOnly(dueAt),
    timingStatus: classifyActionDeadline({ dueAt, status: row.status, now }),
    riskFindingId: row.risk_finding_id || null,
    ownerMembershipId: row.owner_membership_id || null,
    dueDateSource: row.metadata?.dueDateSource || null,
  };
}

export async function setComplianceActionDueDate({ organizationId, actionId, actorUserId, dueDate, requestId = null } = {}) {
  const access = await requireOrganizationPermission({ organizationId, userId: actorUserId, permission: "compliance.manage" });
  if (!access.allowed) throw new Error("permission_denied");
  const dueAt = dueDate == null || dueDate === "" ? null : kstEndOfDayIso(String(dueDate));

  return withPostgresTransaction(getRuntimePostgresPool(), async (client) => {
    const found = await client.query(
      "SELECT * FROM compliance_actions WHERE id=$1 AND organization_id=$2 FOR UPDATE",
      [actionId, organizationId]
    );
    const current = found.rows[0];
    if (!current) return null;
    const previousDueAt = toIso(current.due_at);
    const now = nowISO();
    const metadataPatch = dueAt ? { dueDateSource: "MANUAL_INTERNAL" } : { dueDateSource: null };
    await client.query(
      `UPDATE compliance_actions SET due_at=$1,metadata=metadata || $2::jsonb,updated_at=$3
       WHERE id=$4 AND organization_id=$5`,
      [dueAt, JSON.stringify(metadataPatch), now, actionId, organizationId]
    );
    await client.query(
      `INSERT INTO compliance_action_events
       (id,organization_id,compliance_action_id,actor_user_id,type,from_status,to_status,note,metadata,created_at)
       VALUES ($1,$2,$3,$4,'DUE_DATE_CHANGED',$5,$5,'',$6,$7)`,
      [id("ace"), organizationId, actionId, actorUserId, current.status, JSON.stringify({ fromDueAt: previousDueAt, toDueAt: dueAt, source: "MANUAL_INTERNAL" }), now]
    );
    await audit(client, {
      organizationId,
      actorUserId,
      action: "compliance.action.due_date",
      resourceType: "compliance_action",
      resourceId: actionId,
      requestId,
      metadata: { fromDueAt: previousDueAt, toDueAt: dueAt, source: "MANUAL_INTERNAL" },
    });
    const updated = await client.query("SELECT * FROM compliance_actions WHERE id=$1 AND organization_id=$2", [actionId, organizationId]);
    const row = updated.rows[0];
    return {
      action: {
        id: row.id,
        organizationId: row.organization_id,
        title: row.title,
        status: row.status,
        priority: row.priority,
        dueAt: toIso(row.due_at),
        dueDate: row.due_at ? kstDateOnly(row.due_at) : null,
        dueDateSource: row.metadata?.dueDateSource || null,
      },
    };
  });
}

export async function getComplianceCalendar({ organizationId, from, to, now = new Date() } = {}) {
  const range = normalizeCalendarRange({ from, to, now });
  const result = await getRuntimePostgresPool().query(
    `SELECT id,risk_finding_id,title,status,priority,owner_membership_id,due_at,metadata
     FROM compliance_actions
     WHERE organization_id=$1 AND due_at IS NOT NULL AND status = ANY($2::text[])
     ORDER BY due_at ASC,id ASC`,
    [organizationId, ACTIVE_ACTION_STATUSES]
  );
  const allEvents = result.rows.map((row) => mapCalendarEvent(row, now));
  const overdue = allEvents.filter((event) => event.timingStatus === "OVERDUE");
  const events = allEvents.filter((event) => event.dueDate >= range.from && event.dueDate <= range.to);
  return {
    range,
    summary: summarizeCalendarEvents(allEvents),
    overdue,
    events,
  };
}
