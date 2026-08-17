import crypto from "node:crypto";
import { getRuntimePostgresPool } from "./runtime-postgres.js";
import { withPostgresTransaction } from "./postgres-client.js";

const id = (prefix) => `${prefix}_${crypto.randomUUID()}`;
const iso = (value) => value instanceof Date ? value.toISOString() : value || null;
const SHAREABLE_CASE_STATUSES = new Set(["OPEN", "RESOLVED"]);
const MAX_BODY_LENGTH = 5000;

function normalizeBody(body) {
  const normalized = String(body ?? "").trim();
  if (!normalized) throw new Error("business_case_review_note_body_required");
  if (normalized.length > MAX_BODY_LENGTH) throw new Error("business_case_review_note_body_too_long");
  return normalized;
}

function mapNote(row) {
  if (!row) return null;
  return {
    id: row.id,
    businessCaseId: row.business_case_id,
    organizationId: row.organization_id,
    authorUserId: row.author_user_id,
    authorType: row.author_type,
    shareGrantId: row.share_grant_id || null,
    body: row.body,
    metadata: row.metadata || {},
    createdAt: iso(row.created_at),
  };
}

async function requireActiveOrganization(client, organizationId) {
  const result = await client.query("SELECT status FROM organizations WHERE id=$1", [organizationId]);
  if (!result.rows[0] || result.rows[0].status !== "ACTIVE") throw new Error("business_case_review_note_not_found");
}

async function requireActiveUser(client, userId) {
  const result = await client.query("SELECT status FROM users WHERE id=$1", [userId]);
  if (!result.rows[0] || result.rows[0].status !== "active") throw new Error("business_case_review_note_not_found");
}

async function requireActiveMembership(client, organizationId, userId) {
  const result = await client.query(
    `SELECT role_key FROM organization_memberships
     WHERE organization_id=$1 AND user_id=$2 AND status='ACTIVE'`,
    [organizationId, userId],
  );
  if (!result.rows[0]) throw new Error("business_case_review_note_not_found");
  return result.rows[0];
}

async function requireExternalAdvisor(client, organizationId, advisorUserId) {
  const result = await client.query(
    `SELECT 1 FROM organization_memberships
     WHERE organization_id=$1 AND user_id=$2 AND status='ACTIVE' LIMIT 1`,
    [organizationId, advisorUserId],
  );
  if (result.rowCount) throw new Error("external_advisor_review_notes_not_found");
}

async function requireShareableCase(client, businessCaseId, organizationId) {
  const result = await client.query(
    `SELECT id,organization_id,status FROM business_cases
     WHERE id=$1 AND organization_id=$2`,
    [businessCaseId, organizationId],
  );
  const businessCase = result.rows[0];
  if (!businessCase || !SHAREABLE_CASE_STATUSES.has(businessCase.status)) {
    throw new Error("business_case_review_note_not_found");
  }
  return businessCase;
}

export function createBusinessCaseReviewNoteRepository({ pool = getRuntimePostgresPool(), now = () => new Date() } = {}) {
  if (!pool || typeof pool.query !== "function") throw new Error("business_case_review_note_postgres_pool_required");

  async function createBusinessNote({ organizationId, businessCaseId, authorUserId, body, metadata = {} } = {}) {
    const normalizedBody = normalizeBody(body);
    if (!String(organizationId || "").trim() || !String(businessCaseId || "").trim() || !String(authorUserId || "").trim()) {
      throw new Error("business_case_review_note_not_found");
    }
    const createdAt = now().toISOString();
    return withPostgresTransaction(pool, async (client) => {
      await requireActiveOrganization(client, organizationId);
      await requireActiveUser(client, authorUserId);
      const membership = await requireActiveMembership(client, organizationId, authorUserId);
      await requireShareableCase(client, businessCaseId, organizationId);
      const result = await client.query(
        `INSERT INTO business_case_review_notes
         (id,business_case_id,organization_id,author_user_id,author_type,share_grant_id,body,metadata,created_at)
         VALUES ($1,$2,$3,$4,'BUSINESS',NULL,$5,$6,$7)
         RETURNING *`,
        [id("bcrn"), businessCaseId, organizationId, authorUserId, normalizedBody,
          JSON.stringify({ ...(metadata || {}), authorRoleKey: membership.role_key }), createdAt],
      );
      return mapNote(result.rows[0]);
    });
  }

  async function createAdvisorNote({ shareGrantId, advisorUserId, body, metadata = {} } = {}) {
    const normalizedBody = normalizeBody(body);
    if (!String(shareGrantId || "").trim() || !String(advisorUserId || "").trim()) {
      throw new Error("external_advisor_review_notes_not_found");
    }
    const createdAtValue = now();
    const createdAt = createdAtValue.toISOString();
    return withPostgresTransaction(pool, async (client) => {
      const grantResult = await client.query(
        `SELECT * FROM external_advisor_share_grants
         WHERE id=$1 AND advisor_user_id=$2 AND resource_type='BUSINESS_CASE'
         FOR UPDATE`,
        [shareGrantId, advisorUserId],
      );
      const grant = grantResult.rows[0];
      const permissions = Array.isArray(grant?.permissions) ? grant.permissions : [];
      if (!grant || grant.status !== "ACTIVE" || new Date(grant.expires_at).getTime() <= createdAtValue.getTime()
        || !permissions.includes("case.read") || !permissions.includes("comment.create")) {
        throw new Error("external_advisor_review_notes_not_found");
      }

      await requireActiveOrganization(client, grant.organization_id);
      await requireActiveUser(client, advisorUserId);
      await requireExternalAdvisor(client, grant.organization_id, advisorUserId);
      const businessCase = await requireShareableCase(client, grant.resource_id, grant.organization_id);

      const result = await client.query(
        `INSERT INTO business_case_review_notes
         (id,business_case_id,organization_id,author_user_id,author_type,share_grant_id,body,metadata,created_at)
         VALUES ($1,$2,$3,$4,'ADVISOR',$5,$6,$7,$8)
         RETURNING *`,
        [id("bcrn"), businessCase.id, grant.organization_id, advisorUserId, grant.id,
          normalizedBody, JSON.stringify(metadata || {}), createdAt],
      );
      return mapNote(result.rows[0]);
    }).catch((error) => {
      if (["business_case_review_note_not_found"].includes(error?.message)) {
        throw new Error("external_advisor_review_notes_not_found");
      }
      throw error;
    });
  }

  async function listForBusinessCase({ organizationId, businessCaseId, limit = 200 } = {}) {
    const safeLimit = Math.max(1, Math.min(500, Number(limit) || 200));
    const result = await pool.query(
      `SELECT * FROM business_case_review_notes
       WHERE organization_id=$1 AND business_case_id=$2
       ORDER BY created_at ASC,id ASC LIMIT $3`,
      [organizationId, businessCaseId, safeLimit],
    );
    return result.rows.map(mapNote);
  }

  return { createBusinessNote, createAdvisorNote, listForBusinessCase };
}
