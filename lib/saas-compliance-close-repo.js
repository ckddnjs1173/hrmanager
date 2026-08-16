import crypto from "node:crypto";
import { getRuntimePostgresPool } from "./runtime-postgres.js";
import { withPostgresTransaction } from "./postgres-client.js";
import { requireOrganizationPermission } from "./saas-tenant-repo.js";
import { classifyActionDeadline, kstDateOnly } from "./compliance-calendar-contract.js";
import {
  evaluateCloseReadiness,
  normalizePeriodMonth,
  periodMonthBounds,
  snapshotHash,
  validateCloseConfirmation,
} from "./compliance-close-contract.js";

const id = (prefix) => `${prefix}_${crypto.randomUUID()}`;
const nowISO = (now = new Date()) => (now instanceof Date ? now : new Date(now)).toISOString();
const toIso = (value) => value instanceof Date ? value.toISOString() : value;

async function audit(client, { organizationId, actorUserId, action, resourceType, resourceId, requestId = null, metadata = {}, now = new Date() }) {
  await client.query(
    `INSERT INTO audit_logs
      (id,organization_id,actor_user_id,actor_type,action,resource_type,resource_id,result,request_id,metadata,created_at)
     VALUES ($1,$2,$3,'USER',$4,$5,$6,'SUCCESS',$7,$8,$9)`,
    [id("aud"), organizationId, actorUserId, action, resourceType, resourceId, requestId, JSON.stringify(metadata), nowISO(now)]
  );
}

async function buildSnapshot(client, organizationId, periodMonth, { now = new Date() } = {}) {
  const bounds = periodMonthBounds(periodMonth);
  const [riskCounts, riskRows, actionRows, completedRows, orgCounts, latestRun] = await Promise.all([
    client.query(
      `SELECT
         COUNT(*)::integer AS active_total,
         COUNT(*) FILTER (WHERE severity='CRITICAL')::integer AS critical,
         COUNT(*) FILTER (WHERE severity='HIGH')::integer AS high,
         COUNT(*) FILTER (WHERE severity='MEDIUM')::integer AS medium,
         COUNT(*) FILTER (WHERE severity='INFO')::integer AS info,
         COUNT(*) FILTER (WHERE applicability='UNCERTAIN')::integer AS uncertain
       FROM risk_findings
       WHERE organization_id=$1 AND status = ANY($2::text[])`,
      [organizationId, ["OPEN", "ACKNOWLEDGED"]]
    ),
    client.query(
      `SELECT id,title,severity,applicability,status,rule_id,rule_version,domain,due_at,last_evaluated_at
       FROM risk_findings
       WHERE organization_id=$1 AND status = ANY($2::text[])
       ORDER BY CASE severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END,
                CASE applicability WHEN 'APPLIES' THEN 1 ELSE 2 END,last_evaluated_at DESC,id
       LIMIT 25`,
      [organizationId, ["OPEN", "ACKNOWLEDGED"]]
    ),
    client.query(
      `SELECT id,title,status,priority,due_at,risk_finding_id,updated_at
       FROM compliance_actions
       WHERE organization_id=$1 AND status = ANY($2::text[])
       ORDER BY CASE priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END,
                due_at NULLS LAST,updated_at DESC,id`,
      [organizationId, ["OPEN", "IN_PROGRESS", "BLOCKED"]]
    ),
    client.query(
      `SELECT id,title,priority,completed_at,risk_finding_id
       FROM compliance_actions
       WHERE organization_id=$1 AND status='DONE' AND completed_at >= $2 AND completed_at < $3
       ORDER BY completed_at DESC,id
       LIMIT 25`,
      [organizationId, bounds.startAt, bounds.endAtExclusive]
    ),
    client.query(
      `SELECT
         (SELECT COUNT(*)::integer FROM employees WHERE organization_id=$1 AND status='ACTIVE' AND deleted_at IS NULL) AS employees,
         (SELECT COUNT(*)::integer FROM workplaces WHERE organization_id=$1 AND status='ACTIVE') AS workplaces,
         (SELECT COUNT(*)::integer FROM compliance_scopes WHERE organization_id=$1 AND status <> 'ARCHIVED') AS compliance_scopes`,
      [organizationId]
    ),
    client.query(
      `SELECT id,legal_registry_version,finished_at,input_snapshot_hash
       FROM risk_evaluation_runs
       WHERE organization_id=$1 AND status='COMPLETED'
       ORDER BY finished_at DESC NULLS LAST,started_at DESC
       LIMIT 1`,
      [organizationId]
    ),
  ]);

  const rc = riskCounts.rows[0] || {};
  const activeActions = actionRows.rows.map((row) => {
    const dueAt = toIso(row.due_at);
    return {
      id: row.id,
      title: row.title,
      status: row.status,
      priority: row.priority,
      dueAt,
      dueDate: dueAt ? kstDateOnly(dueAt) : null,
      timingStatus: classifyActionDeadline({ dueAt, status: row.status, now }),
      riskFindingId: row.risk_finding_id || null,
    };
  });
  const overdue = activeActions.filter((action) => action.timingStatus === "OVERDUE").length;
  const activeByStatus = { OPEN: 0, IN_PROGRESS: 0, BLOCKED: 0 };
  const activeByPriority = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, INFO: 0 };
  for (const action of activeActions) {
    if (action.status in activeByStatus) activeByStatus[action.status] += 1;
    if (action.priority in activeByPriority) activeByPriority[action.priority] += 1;
  }

  const snapshot = {
    schemaVersion: 1,
    period: bounds,
    risks: {
      activeTotal: Number(rc.active_total || 0),
      CRITICAL: Number(rc.critical || 0),
      HIGH: Number(rc.high || 0),
      MEDIUM: Number(rc.medium || 0),
      INFO: Number(rc.info || 0),
      uncertain: Number(rc.uncertain || 0),
      items: riskRows.rows.map((row) => ({
        id: row.id,
        title: row.title,
        severity: row.severity,
        applicability: row.applicability,
        status: row.status,
        ruleId: row.rule_id,
        ruleVersion: row.rule_version,
        domain: row.domain,
        dueAt: toIso(row.due_at),
        lastEvaluatedAt: toIso(row.last_evaluated_at),
      })),
      itemsTruncated: Number(rc.active_total || 0) > riskRows.rows.length,
    },
    actions: {
      active: activeActions.length,
      overdue,
      byStatus: activeByStatus,
      byPriority: activeByPriority,
      items: activeActions.slice(0, 25),
      itemsTruncated: activeActions.length > 25,
      completedInPeriod: completedRows.rowCount || 0,
      completedItems: completedRows.rows.map((row) => ({
        id: row.id,
        title: row.title,
        priority: row.priority,
        completedAt: toIso(row.completed_at),
        riskFindingId: row.risk_finding_id || null,
      })),
    },
    organization: {
      employeeCount: Number(orgCounts.rows[0]?.employees || 0),
      workplaceCount: Number(orgCounts.rows[0]?.workplaces || 0),
      complianceScopeCount: Number(orgCounts.rows[0]?.compliance_scopes || 0),
    },
    legalContext: latestRun.rows[0] ? {
      latestRiskRunId: latestRun.rows[0].id,
      legalRegistryVersion: latestRun.rows[0].legal_registry_version,
      riskRunFinishedAt: toIso(latestRun.rows[0].finished_at),
      inputSnapshotHash: latestRun.rows[0].input_snapshot_hash || null,
    } : null,
  };
  return { snapshot, hash: snapshotHash(snapshot), readiness: evaluateCloseReadiness(snapshot) };
}

async function ensurePeriod(client, organizationId, periodMonth, now) {
  const existing = await client.query(
    "SELECT * FROM compliance_close_periods WHERE organization_id=$1 AND period_month=$2 FOR UPDATE",
    [organizationId, periodMonth]
  );
  if (existing.rows[0]) return existing.rows[0];
  const periodId = id("clp");
  const timestamp = nowISO(now);
  await client.query(
    `INSERT INTO compliance_close_periods
     (id,organization_id,period_month,status,current_snapshot,current_snapshot_hash,last_refreshed_at,closed_at,closed_by_user_id,close_note,unresolved_acknowledged,created_at,updated_at)
     VALUES ($1,$2,$3,'OPEN','{}'::jsonb,NULL,NULL,NULL,NULL,'',FALSE,$4,$4)`,
    [periodId, organizationId, periodMonth, timestamp]
  );
  return { id: periodId, organization_id: organizationId, period_month: periodMonth, status: "OPEN" };
}

function mapPeriod(row, fallbackSnapshot = null) {
  if (!row) return null;
  const snapshot = row.current_snapshot && Object.keys(row.current_snapshot).length ? row.current_snapshot : fallbackSnapshot;
  return {
    id: row.id,
    organizationId: row.organization_id,
    periodMonth: row.period_month,
    status: row.status,
    snapshot,
    snapshotHash: row.current_snapshot_hash || (snapshot ? snapshotHash(snapshot) : null),
    readiness: snapshot ? evaluateCloseReadiness(snapshot) : null,
    lastRefreshedAt: toIso(row.last_refreshed_at),
    closedAt: toIso(row.closed_at),
    closedByUserId: row.closed_by_user_id || null,
    closeNote: row.close_note || "",
    unresolvedAcknowledged: !!row.unresolved_acknowledged,
  };
}

export async function getComplianceClose({ organizationId, periodMonth, now = new Date() } = {}) {
  const month = normalizePeriodMonth(periodMonth, { now });
  const pool = getRuntimePostgresPool();
  const existing = await pool.query("SELECT * FROM compliance_close_periods WHERE organization_id=$1 AND period_month=$2", [organizationId, month]);
  if (existing.rows[0]) return { period: mapPeriod(existing.rows[0]) };
  const client = await pool.connect();
  try {
    const built = await buildSnapshot(client, organizationId, month, { now });
    return {
      period: {
        id: null,
        organizationId,
        periodMonth: month,
        status: "OPEN",
        snapshot: built.snapshot,
        snapshotHash: built.hash,
        readiness: built.readiness,
        lastRefreshedAt: null,
        closedAt: null,
        closedByUserId: null,
        closeNote: "",
        unresolvedAcknowledged: false,
      },
    };
  } finally { client.release(); }
}

export async function refreshComplianceClose({ organizationId, actorUserId, periodMonth, requestId = null, now = new Date() } = {}) {
  const access = await requireOrganizationPermission({ organizationId, userId: actorUserId, permission: "compliance.manage" });
  if (!access.allowed) throw new Error("permission_denied");
  const month = normalizePeriodMonth(periodMonth, { now });
  return withPostgresTransaction(getRuntimePostgresPool(), async (client) => {
    const period = await ensurePeriod(client, organizationId, month, now);
    if (period.status === "CLOSED") throw new Error("compliance_close_already_closed");
    const built = await buildSnapshot(client, organizationId, month, { now });
    const timestamp = nowISO(now);
    await client.query(
      `UPDATE compliance_close_periods
       SET current_snapshot=$1,current_snapshot_hash=$2,last_refreshed_at=$3,updated_at=$3
       WHERE id=$4`,
      [JSON.stringify(built.snapshot), built.hash, timestamp, period.id]
    );
    await client.query(
      `INSERT INTO compliance_close_events
       (id,organization_id,period_id,actor_user_id,event_type,from_status,to_status,metadata,created_at)
       VALUES ($1,$2,$3,$4,'REFRESHED','OPEN','OPEN',$5,$6)`,
      [id("cle"), organizationId, period.id, actorUserId, JSON.stringify({ snapshotHash: built.hash, readiness: built.readiness }), timestamp]
    );
    await audit(client, { organizationId, actorUserId, action: "compliance.close.refresh", resourceType: "compliance_close_period", resourceId: period.id, requestId, metadata: { periodMonth: month, snapshotHash: built.hash }, now });
    const updated = await client.query("SELECT * FROM compliance_close_periods WHERE id=$1", [period.id]);
    return { period: mapPeriod(updated.rows[0]) };
  });
}

export async function closeCompliancePeriod({ organizationId, actorUserId, periodMonth, acknowledgeUnresolved = false, note = "", requestId = null, now = new Date() } = {}) {
  const access = await requireOrganizationPermission({ organizationId, userId: actorUserId, permission: "compliance.manage" });
  if (!access.allowed) throw new Error("permission_denied");
  const month = normalizePeriodMonth(periodMonth, { now });
  return withPostgresTransaction(getRuntimePostgresPool(), async (client) => {
    const period = await ensurePeriod(client, organizationId, month, now);
    if (period.status === "CLOSED") {
      const existingSnapshot = await client.query(
        "SELECT * FROM compliance_close_snapshots WHERE period_id=$1 ORDER BY version DESC LIMIT 1",
        [period.id]
      );
      const current = await client.query("SELECT * FROM compliance_close_periods WHERE id=$1", [period.id]);
      return { period: mapPeriod(current.rows[0]), snapshot: existingSnapshot.rows[0]?.snapshot || current.rows[0]?.current_snapshot || null, idempotent: true };
    }

    const built = await buildSnapshot(client, organizationId, month, { now });
    const readiness = validateCloseConfirmation({ snapshot: built.snapshot, acknowledgeUnresolved, note });
    const timestamp = nowISO(now);
    const cleanNote = String(note || "").trim();
    const snapshotId = id("cls");
    await client.query(
      `UPDATE compliance_close_periods SET
       status='CLOSED',current_snapshot=$1,current_snapshot_hash=$2,last_refreshed_at=$3,
       closed_at=$3,closed_by_user_id=$4,close_note=$5,unresolved_acknowledged=$6,updated_at=$3
       WHERE id=$7`,
      [JSON.stringify(built.snapshot), built.hash, timestamp, actorUserId, cleanNote, readiness.requiresAcknowledgement ? true : !!acknowledgeUnresolved, period.id]
    );
    await client.query(
      `INSERT INTO compliance_close_snapshots
       (id,organization_id,period_id,version,snapshot_hash,snapshot,generated_at,generated_by_user_id,created_at)
       VALUES ($1,$2,$3,1,$4,$5,$6,$7,$6)`,
      [snapshotId, organizationId, period.id, built.hash, JSON.stringify(built.snapshot), timestamp, actorUserId]
    );
    await client.query(
      `INSERT INTO compliance_close_events
       (id,organization_id,period_id,actor_user_id,event_type,from_status,to_status,metadata,created_at)
       VALUES ($1,$2,$3,$4,'CLOSED','OPEN','CLOSED',$5,$6)`,
      [id("cle"), organizationId, period.id, actorUserId, JSON.stringify({ snapshotId, snapshotHash: built.hash, readiness, note: cleanNote }), timestamp]
    );
    await audit(client, { organizationId, actorUserId, action: "compliance.close.complete", resourceType: "compliance_close_period", resourceId: period.id, requestId, metadata: { periodMonth: month, snapshotId, snapshotHash: built.hash, unresolvedAcknowledged: readiness.requiresAcknowledgement }, now });
    const updated = await client.query("SELECT * FROM compliance_close_periods WHERE id=$1", [period.id]);
    return { period: mapPeriod(updated.rows[0]), snapshot: built.snapshot, snapshotId, idempotent: false };
  });
}

export async function listComplianceCloseHistory({ organizationId, limit = 24 } = {}) {
  const safeLimit = Math.min(Math.max(Number.parseInt(String(limit), 10) || 24, 1), 60);
  const result = await getRuntimePostgresPool().query(
    `SELECT p.*,s.id AS snapshot_id,s.version AS snapshot_version,s.generated_at AS snapshot_generated_at
     FROM compliance_close_periods p
     LEFT JOIN LATERAL (
       SELECT id,version,generated_at FROM compliance_close_snapshots WHERE period_id=p.id ORDER BY version DESC LIMIT 1
     ) s ON TRUE
     WHERE p.organization_id=$1 AND p.status='CLOSED'
     ORDER BY p.period_month DESC
     LIMIT $2`,
    [organizationId, safeLimit]
  );
  return result.rows.map((row) => ({
    ...mapPeriod(row),
    snapshotId: row.snapshot_id || null,
    snapshotVersion: row.snapshot_version || null,
    snapshotGeneratedAt: toIso(row.snapshot_generated_at),
  }));
}

export async function listComplianceCloseSnapshots({ organizationId, periodMonth, now = new Date() } = {}) {
  const month = normalizePeriodMonth(periodMonth, { now });
  const result = await getRuntimePostgresPool().query(
    `SELECT s.* FROM compliance_close_snapshots s
     JOIN compliance_close_periods p ON p.id=s.period_id
     WHERE s.organization_id=$1 AND p.period_month=$2
     ORDER BY s.version DESC`,
    [organizationId, month]
  );
  return result.rows.map((row) => ({
    id: row.id,
    version: row.version,
    snapshotHash: row.snapshot_hash,
    snapshot: row.snapshot,
    generatedAt: toIso(row.generated_at),
    generatedByUserId: row.generated_by_user_id || null,
  }));
}
