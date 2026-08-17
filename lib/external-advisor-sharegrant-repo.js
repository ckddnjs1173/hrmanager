import crypto from "node:crypto";
import { getRuntimePostgresPool } from "./runtime-postgres.js";
import { withPostgresTransaction } from "./postgres-client.js";
import { resolveBusinessCaseOrganizationId } from "./business-case-repo.js";
import {
  canTransitionExternalAdvisorShareGrant,
  deriveExternalAdvisorShareGrantStatus,
  externalAdvisorGrantAllows,
  validateExternalAdvisorShareGrantInput,
} from "./external-advisor-sharegrant-contract.js";

const id = (prefix) => `${prefix}_${crypto.randomUUID()}`;
const iso = (value) => value instanceof Date ? value.toISOString() : value || null;
const nowIso = (now = new Date()) => now.toISOString();

function mapGrant(row, now = new Date()) {
  if (!row) return null;
  const grant = {
    id: row.id,
    organizationId: row.organization_id,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    advisorUserId: row.advisor_user_id,
    permissions: Array.isArray(row.permissions) ? row.permissions : [],
    createdByUserId: row.created_by_user_id,
    status: row.status,
    createdAt: iso(row.created_at),
    expiresAt: iso(row.expires_at),
    acceptedAt: iso(row.accepted_at),
    revokedAt: iso(row.revoked_at),
    revokedByUserId: row.revoked_by_user_id || null,
    metadata: row.metadata || {},
  };
  return { ...grant, effectiveStatus: deriveExternalAdvisorShareGrantStatus(grant, now) };
}

function mapEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    shareGrantId: row.share_grant_id,
    actorUserId: row.actor_user_id,
    eventType: row.event_type,
    metadata: row.metadata || {},
    createdAt: iso(row.created_at),
  };
}

async function requireActiveOrganization(client, organizationId) {
  const result = await client.query("SELECT id,status FROM organizations WHERE id=$1", [organizationId]);
  if (!result.rows[0] || result.rows[0].status !== "ACTIVE") throw new Error("external_advisor_organization_not_active");
  return result.rows[0];
}

async function requireActiveUser(client, userId, code = "external_advisor_user_not_active") {
  const result = await client.query("SELECT id,status FROM users WHERE id=$1", [userId]);
  if (!result.rows[0] || result.rows[0].status !== "active") throw new Error(code);
  return result.rows[0];
}

async function getActiveMembership(client, organizationId, userId) {
  const result = await client.query(
    `SELECT id,organization_id,user_id,role_key,status
     FROM organization_memberships
     WHERE organization_id=$1 AND user_id=$2 AND status='ACTIVE'`,
    [organizationId, userId],
  );
  return result.rows[0] || null;
}

async function requireActiveMember(client, organizationId, userId) {
  const membership = await getActiveMembership(client, organizationId, userId);
  if (!membership) throw new Error("external_advisor_actor_membership_required");
  return membership;
}

async function requireAdvisorIsExternal(client, organizationId, advisorUserId) {
  const membership = await getActiveMembership(client, organizationId, advisorUserId);
  if (membership) throw new Error("external_advisor_internal_member_forbidden");
}

async function insertEvent(client, { grantId, actorUserId, eventType, metadata = {}, createdAt }) {
  await client.query(
    `INSERT INTO external_advisor_share_grant_events
     (id,share_grant_id,actor_user_id,event_type,metadata,created_at)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [id("easge"), grantId, actorUserId, eventType, JSON.stringify(metadata || {}), createdAt],
  );
}

export function createExternalAdvisorShareGrantRepository({
  pool = getRuntimePostgresPool(),
  resolveResourceOrganizationId = resolveBusinessCaseOrganizationId,
  now = () => new Date(),
} = {}) {
  if (!pool || typeof pool.query !== "function") throw new Error("external_advisor_postgres_pool_required");
  if (typeof resolveResourceOrganizationId !== "function") throw new Error("external_advisor_resource_resolver_required");

  async function resolveOwner(client, resourceType, resourceId) {
    const ownerOrganizationId = await resolveResourceOrganizationId({ resourceType, resourceId, client });
    if (!String(ownerOrganizationId || "").trim()) throw new Error("external_advisor_resource_not_found");
    return String(ownerOrganizationId).trim();
  }

  async function create({
    organizationId,
    resourceType = "BUSINESS_CASE",
    resourceId,
    advisorUserId,
    permissions,
    createdByUserId,
    expiresAt,
    metadata = {},
  } = {}) {
    const createdAtValue = now();
    const input = validateExternalAdvisorShareGrantInput({
      organizationId,
      resourceType,
      resourceId,
      advisorUserId,
      permissions,
      createdByUserId,
      createdAt: createdAtValue,
      expiresAt,
    });
    const grantId = id("easg");

    try {
      return await withPostgresTransaction(pool, async (client) => {
        await requireActiveOrganization(client, input.organizationId);
        await requireActiveUser(client, input.createdByUserId, "external_advisor_creator_not_active");
        await requireActiveUser(client, input.advisorUserId, "external_advisor_user_not_active");
        const creatorMembership = await requireActiveMember(client, input.organizationId, input.createdByUserId);
        await requireAdvisorIsExternal(client, input.organizationId, input.advisorUserId);

        const resourceOwnerOrganizationId = await resolveOwner(client, input.resourceType, input.resourceId);
        if (resourceOwnerOrganizationId !== input.organizationId) throw new Error("external_advisor_cross_tenant_resource_forbidden");

        const result = await client.query(
          `INSERT INTO external_advisor_share_grants
           (id,organization_id,resource_type,resource_id,advisor_user_id,permissions,created_by_user_id,status,created_at,expires_at,accepted_at,revoked_at,revoked_by_user_id,metadata)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING',$8,$9,NULL,NULL,NULL,$10)
           RETURNING *`,
          [grantId, input.organizationId, input.resourceType, input.resourceId, input.advisorUserId,
            JSON.stringify(input.permissions), input.createdByUserId, input.createdAt, input.expiresAt, JSON.stringify(metadata || {})],
        );
        await insertEvent(client, {
          grantId,
          actorUserId: input.createdByUserId,
          eventType: "CREATED",
          metadata: { creatorRoleKey: creatorMembership.role_key, permissions: input.permissions },
          createdAt: input.createdAt,
        });
        return mapGrant(result.rows[0], createdAtValue);
      });
    } catch (error) {
      if (error?.code === "23505") throw new Error("external_advisor_live_grant_duplicate");
      throw error;
    }
  }

  async function get(grantId) {
    const result = await pool.query("SELECT * FROM external_advisor_share_grants WHERE id=$1", [grantId]);
    return mapGrant(result.rows[0], now());
  }

  async function accept({ grantId, actorUserId } = {}) {
    if (!String(grantId || "").trim()) throw new Error("external_advisor_grant_required");
    if (!String(actorUserId || "").trim()) throw new Error("external_advisor_actor_required");
    const acceptedAtValue = now();
    const acceptedAt = nowIso(acceptedAtValue);

    return withPostgresTransaction(pool, async (client) => {
      const result = await client.query("SELECT * FROM external_advisor_share_grants WHERE id=$1 FOR UPDATE", [grantId]);
      const row = result.rows[0];
      if (!row) throw new Error("external_advisor_grant_not_found");
      if (row.advisor_user_id !== actorUserId) throw new Error("external_advisor_accept_identity_mismatch");
      if (!canTransitionExternalAdvisorShareGrant(row.status, "ACTIVE")) throw new Error("external_advisor_grant_not_pending");
      if (new Date(row.expires_at).getTime() <= acceptedAtValue.getTime()) throw new Error("external_advisor_grant_expired");

      await requireActiveOrganization(client, row.organization_id);
      await requireActiveUser(client, actorUserId, "external_advisor_user_not_active");
      await requireAdvisorIsExternal(client, row.organization_id, actorUserId);
      const resourceOwnerOrganizationId = await resolveOwner(client, row.resource_type, row.resource_id);
      if (resourceOwnerOrganizationId !== row.organization_id) throw new Error("external_advisor_cross_tenant_resource_forbidden");

      const updated = await client.query(
        `UPDATE external_advisor_share_grants
         SET status='ACTIVE',accepted_at=$2
         WHERE id=$1
         RETURNING *`,
        [grantId, acceptedAt],
      );
      await insertEvent(client, { grantId, actorUserId, eventType: "ACCEPTED", createdAt: acceptedAt });
      return mapGrant(updated.rows[0], acceptedAtValue);
    });
  }

  async function revoke({ grantId, actorUserId, metadata = {} } = {}) {
    if (!String(grantId || "").trim()) throw new Error("external_advisor_grant_required");
    if (!String(actorUserId || "").trim()) throw new Error("external_advisor_actor_required");
    const revokedAtValue = now();
    const revokedAt = nowIso(revokedAtValue);

    return withPostgresTransaction(pool, async (client) => {
      const result = await client.query("SELECT * FROM external_advisor_share_grants WHERE id=$1 FOR UPDATE", [grantId]);
      const row = result.rows[0];
      if (!row) throw new Error("external_advisor_grant_not_found");
      if (!canTransitionExternalAdvisorShareGrant(row.status, "REVOKED")) throw new Error("external_advisor_grant_not_revocable");
      await requireActiveOrganization(client, row.organization_id);
      await requireActiveUser(client, actorUserId, "external_advisor_revoker_not_active");
      const membership = await requireActiveMember(client, row.organization_id, actorUserId);

      const updated = await client.query(
        `UPDATE external_advisor_share_grants
         SET status='REVOKED',revoked_at=$2,revoked_by_user_id=$3
         WHERE id=$1
         RETURNING *`,
        [grantId, revokedAt, actorUserId],
      );
      await insertEvent(client, {
        grantId,
        actorUserId,
        eventType: "REVOKED",
        metadata: { ...metadata, revokerRoleKey: membership.role_key },
        createdAt: revokedAt,
      });
      return mapGrant(updated.rows[0], revokedAtValue);
    });
  }

  async function listForOrganization({ organizationId, limit = 100 } = {}) {
    const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
    const result = await pool.query(
      `SELECT * FROM external_advisor_share_grants
       WHERE organization_id=$1
       ORDER BY created_at DESC,id DESC LIMIT $2`,
      [organizationId, safeLimit],
    );
    const current = now();
    return result.rows.map((row) => mapGrant(row, current));
  }

  async function listForAdvisor({ advisorUserId, limit = 100 } = {}) {
    const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
    const result = await pool.query(
      `SELECT * FROM external_advisor_share_grants
       WHERE advisor_user_id=$1
       ORDER BY created_at DESC,id DESC LIMIT $2`,
      [advisorUserId, safeLimit],
    );
    const current = now();
    return result.rows.map((row) => mapGrant(row, current));
  }

  async function listEvents(grantId) {
    const result = await pool.query(
      `SELECT * FROM external_advisor_share_grant_events
       WHERE share_grant_id=$1 ORDER BY created_at ASC,id ASC`,
      [grantId],
    );
    return result.rows.map(mapEvent);
  }

  async function hasPermission({ grantId, advisorUserId, permission } = {}) {
    const current = now();
    const result = await pool.query("SELECT * FROM external_advisor_share_grants WHERE id=$1", [grantId]);
    const grant = mapGrant(result.rows[0], current);
    const decision = externalAdvisorGrantAllows({ grant, actorUserId: advisorUserId, permission, now: current });
    if (!decision.allowed) return decision;

    const user = await pool.query("SELECT status FROM users WHERE id=$1", [advisorUserId]);
    if (!user.rows[0] || user.rows[0].status !== "active") return { allowed: false, reason: "advisor_not_active" };
    const organization = await pool.query("SELECT status FROM organizations WHERE id=$1", [grant.organizationId]);
    if (!organization.rows[0] || organization.rows[0].status !== "ACTIVE") return { allowed: false, reason: "organization_not_active" };
    const membership = await pool.query(
      `SELECT 1 FROM organization_memberships
       WHERE organization_id=$1 AND user_id=$2 AND status='ACTIVE' LIMIT 1`,
      [grant.organizationId, advisorUserId],
    );
    if (membership.rowCount) return { allowed: false, reason: "advisor_became_internal_member" };

    const resourceOwnerOrganizationId = await resolveResourceOrganizationId({
      resourceType: grant.resourceType,
      resourceId: grant.resourceId,
      client: pool,
    });
    if (String(resourceOwnerOrganizationId || "") !== grant.organizationId) return { allowed: false, reason: "resource_tenant_mismatch" };
    return { allowed: true, reason: null, grant };
  }

  return {
    create,
    get,
    accept,
    revoke,
    listForOrganization,
    listForAdvisor,
    listEvents,
    hasPermission,
  };
}
