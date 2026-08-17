import crypto from "node:crypto";
import { getRuntimePostgresPool } from "./runtime-postgres.js";
import { withPostgresTransaction } from "./postgres-client.js";
import {
  businessCaseTransitionEvent,
  canTransitionBusinessCase,
  normalizeBusinessCaseSummary,
  normalizeBusinessCaseTitle,
} from "./business-case-contract.js";

const id = (prefix) => `${prefix}_${crypto.randomUUID()}`;
const iso = (value) => value instanceof Date ? value.toISOString() : value || null;

function mapCase(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    title: row.title,
    summary: row.summary || "",
    status: row.status,
    createdByUserId: row.created_by_user_id,
    openedByUserId: row.opened_by_user_id || null,
    resolvedByUserId: row.resolved_by_user_id || null,
    archivedByUserId: row.archived_by_user_id || null,
    resolutionNote: row.resolution_note || "",
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    openedAt: iso(row.opened_at),
    resolvedAt: iso(row.resolved_at),
    archivedAt: iso(row.archived_at),
  };
}

function mapEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    businessCaseId: row.business_case_id,
    organizationId: row.organization_id,
    actorUserId: row.actor_user_id,
    eventType: row.event_type,
    fromStatus: row.from_status || null,
    toStatus: row.to_status,
    metadata: row.metadata || {},
    createdAt: iso(row.created_at),
  };
}

async function requireActiveOrganization(client, organizationId) {
  const result = await client.query("SELECT id,status FROM organizations WHERE id=$1", [organizationId]);
  if (!result.rows[0] || result.rows[0].status !== "ACTIVE") throw new Error("business_case_organization_not_active");
}

async function requireActiveUser(client, userId) {
  const result = await client.query("SELECT id,status FROM users WHERE id=$1", [userId]);
  if (!result.rows[0] || result.rows[0].status !== "active") throw new Error("business_case_actor_not_active");
}

async function requireActiveMember(client, organizationId, userId) {
  const result = await client.query(
    `SELECT id,role_key FROM organization_memberships
     WHERE organization_id=$1 AND user_id=$2 AND status='ACTIVE'`,
    [organizationId, userId],
  );
  if (!result.rows[0]) throw new Error("business_case_membership_required");
  return result.rows[0];
}

async function insertEvent(client, { businessCaseId, organizationId, actorUserId, eventType, fromStatus = null, toStatus, metadata = {}, createdAt }) {
  await client.query(
    `INSERT INTO business_case_events
     (id,business_case_id,organization_id,actor_user_id,event_type,from_status,to_status,metadata,created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id("bce"), businessCaseId, organizationId, actorUserId, eventType, fromStatus, toStatus, JSON.stringify(metadata || {}), createdAt],
  );
}

export async function resolveBusinessCaseOrganizationId({ resourceType = "BUSINESS_CASE", resourceId, client = null } = {}) {
  if (resourceType !== "BUSINESS_CASE") return null;
  if (!String(resourceId || "").trim()) return null;
  const queryable = client && typeof client.query === "function" ? client : getRuntimePostgresPool();
  const result = await queryable.query("SELECT organization_id FROM business_cases WHERE id=$1", [resourceId]);
  return result.rows[0]?.organization_id || null;
}

export function createBusinessCaseRepository({ pool = getRuntimePostgresPool(), now = () => new Date() } = {}) {
  if (!pool || typeof pool.query !== "function") throw new Error("business_case_postgres_pool_required");

  async function create({ organizationId, actorUserId, title, summary = "" } = {}) {
    if (!String(organizationId || "").trim()) throw new Error("business_case_organization_required");
    if (!String(actorUserId || "").trim()) throw new Error("business_case_actor_required");
    const normalizedTitle = normalizeBusinessCaseTitle(title);
    const normalizedSummary = normalizeBusinessCaseSummary(summary);
    const caseId = id("bcase");
    const createdAt = now().toISOString();

    return withPostgresTransaction(pool, async (client) => {
      await requireActiveOrganization(client, organizationId);
      await requireActiveUser(client, actorUserId);
      const membership = await requireActiveMember(client, organizationId, actorUserId);
      const result = await client.query(
        `INSERT INTO business_cases
         (id,organization_id,title,summary,status,created_by_user_id,opened_by_user_id,resolved_by_user_id,archived_by_user_id,resolution_note,created_at,updated_at,opened_at,resolved_at,archived_at)
         VALUES ($1,$2,$3,$4,'DRAFT',$5,NULL,NULL,NULL,'',$6,$6,NULL,NULL,NULL)
         RETURNING *`,
        [caseId, organizationId, normalizedTitle, normalizedSummary, actorUserId, createdAt],
      );
      await insertEvent(client, {
        businessCaseId: caseId,
        organizationId,
        actorUserId,
        eventType: "CREATED",
        fromStatus: null,
        toStatus: "DRAFT",
        metadata: { actorRoleKey: membership.role_key },
        createdAt,
      });
      return mapCase(result.rows[0]);
    });
  }

  async function get(caseId) {
    const result = await pool.query("SELECT * FROM business_cases WHERE id=$1", [caseId]);
    return mapCase(result.rows[0]);
  }

  async function listForOrganization({ organizationId, status = null, limit = 100 } = {}) {
    const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
    const result = status
      ? await pool.query(
        `SELECT * FROM business_cases WHERE organization_id=$1 AND status=$2 ORDER BY updated_at DESC,id DESC LIMIT $3`,
        [organizationId, status, safeLimit],
      )
      : await pool.query(
        `SELECT * FROM business_cases WHERE organization_id=$1 ORDER BY updated_at DESC,id DESC LIMIT $2`,
        [organizationId, safeLimit],
      );
    return result.rows.map(mapCase);
  }

  async function transition({ caseId, actorUserId, toStatus, resolutionNote = "", metadata = {} } = {}) {
    if (!String(caseId || "").trim()) throw new Error("business_case_required");
    if (!String(actorUserId || "").trim()) throw new Error("business_case_actor_required");
    const transitionAt = now().toISOString();

    return withPostgresTransaction(pool, async (client) => {
      const locked = await client.query("SELECT * FROM business_cases WHERE id=$1 FOR UPDATE", [caseId]);
      const row = locked.rows[0];
      if (!row) throw new Error("business_case_not_found");
      if (!canTransitionBusinessCase(row.status, toStatus)) throw new Error("business_case_transition_invalid");

      await requireActiveOrganization(client, row.organization_id);
      await requireActiveUser(client, actorUserId);
      const membership = await requireActiveMember(client, row.organization_id, actorUserId);
      const eventType = businessCaseTransitionEvent(row.status, toStatus);
      const note = toStatus === "RESOLVED" ? normalizeBusinessCaseSummary(resolutionNote) : row.resolution_note || "";

      let updateSql;
      let params;
      if (toStatus === "OPEN" && row.status === "DRAFT") {
        updateSql = `UPDATE business_cases SET status='OPEN',opened_by_user_id=$2,opened_at=$3,updated_at=$3 WHERE id=$1 RETURNING *`;
        params = [caseId, actorUserId, transitionAt];
      } else if (toStatus === "OPEN" && row.status === "RESOLVED") {
        updateSql = `UPDATE business_cases SET status='OPEN',resolved_by_user_id=NULL,resolved_at=NULL,resolution_note='',updated_at=$2 WHERE id=$1 RETURNING *`;
        params = [caseId, transitionAt];
      } else if (toStatus === "RESOLVED") {
        updateSql = `UPDATE business_cases SET status='RESOLVED',resolved_by_user_id=$2,resolved_at=$3,resolution_note=$4,updated_at=$3 WHERE id=$1 RETURNING *`;
        params = [caseId, actorUserId, transitionAt, note];
      } else if (toStatus === "ARCHIVED") {
        updateSql = `UPDATE business_cases SET status='ARCHIVED',archived_by_user_id=$2,archived_at=$3,updated_at=$3 WHERE id=$1 RETURNING *`;
        params = [caseId, actorUserId, transitionAt];
      } else {
        throw new Error("business_case_transition_invalid");
      }

      const updated = await client.query(updateSql, params);
      await insertEvent(client, {
        businessCaseId: caseId,
        organizationId: row.organization_id,
        actorUserId,
        eventType,
        fromStatus: row.status,
        toStatus,
        metadata: { ...metadata, actorRoleKey: membership.role_key, ...(toStatus === "RESOLVED" ? { resolutionNote: note } : {}) },
        createdAt: transitionAt,
      });
      return mapCase(updated.rows[0]);
    });
  }

  async function listEvents(caseId) {
    const result = await pool.query(
      `SELECT * FROM business_case_events WHERE business_case_id=$1 ORDER BY created_at ASC,id ASC`,
      [caseId],
    );
    return result.rows.map(mapEvent);
  }

  return { create, get, listForOrganization, transition, listEvents };
}
