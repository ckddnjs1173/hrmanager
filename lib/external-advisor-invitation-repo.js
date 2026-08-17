import crypto from "node:crypto";
import { getRuntimePostgresPool } from "./runtime-postgres.js";
import { withPostgresTransaction } from "./postgres-client.js";
import { hashOpaqueToken, normalizeEmail } from "./saas-auth-repo.js";
import { isBusinessCaseShareable } from "./business-case-contract.js";
import { deriveExternalAdvisorInvitationStatus, validateExternalAdvisorInvitationInput } from "./external-advisor-invitation-contract.js";

const id = (prefix) => `${prefix}_${crypto.randomUUID()}`;
const iso = (value) => value instanceof Date ? value.toISOString() : value || null;

function mapInvitation(row, now = new Date()) {
  if (!row) return null;
  const invitation = {
    id: row.id,
    organizationId: row.organization_id,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    advisorEmail: row.advisor_email_normalized,
    permissions: Array.isArray(row.permissions) ? row.permissions : [],
    createdByUserId: row.created_by_user_id,
    status: row.status,
    createdAt: iso(row.created_at),
    invitationExpiresAt: iso(row.invitation_expires_at),
    grantExpiresAt: iso(row.grant_expires_at),
    acceptedAt: iso(row.accepted_at),
    acceptedByUserId: row.accepted_by_user_id || null,
    shareGrantId: row.share_grant_id || null,
    revokedAt: iso(row.revoked_at),
    revokedByUserId: row.revoked_by_user_id || null,
    metadata: row.metadata || {},
  };
  return { ...invitation, effectiveStatus: deriveExternalAdvisorInvitationStatus(invitation, now) };
}

async function event(client, invitationId, actorUserId, eventType, metadata, createdAt) {
  await client.query(
    `INSERT INTO external_advisor_invitation_events(id,invitation_id,actor_user_id,event_type,metadata,created_at)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [id("easie"), invitationId, actorUserId, eventType, JSON.stringify(metadata || {}), createdAt],
  );
}

async function activeMembership(client, organizationId, userId) {
  const result = await client.query(
    `SELECT id,role_key FROM organization_memberships WHERE organization_id=$1 AND user_id=$2 AND status='ACTIVE'`,
    [organizationId, userId],
  );
  return result.rows[0] || null;
}

export function createExternalAdvisorInvitationRepository({ pool = getRuntimePostgresPool(), now = () => new Date() } = {}) {
  async function create({ organizationId, caseId, advisorEmail, permissions, createdByUserId, invitationExpiresAt, grantExpiresAt, metadata = {} } = {}) {
    const createdAtValue = now();
    const input = validateExternalAdvisorInvitationInput({
      organizationId,
      resourceId: caseId,
      advisorEmail,
      permissions,
      createdByUserId,
      createdAt: createdAtValue,
      invitationExpiresAt,
      grantExpiresAt,
    });
    const invitationId = id("easi");
    const rawToken = crypto.randomBytes(32).toString("base64url");
    const tokenHash = hashOpaqueToken(rawToken);

    try {
      const invitation = await withPostgresTransaction(pool, async (client) => {
        const org = await client.query("SELECT status FROM organizations WHERE id=$1", [input.organizationId]);
        if (!org.rows[0] || org.rows[0].status !== "ACTIVE") throw new Error("external_advisor_organization_not_active");
        const creator = await client.query("SELECT status FROM users WHERE id=$1", [input.createdByUserId]);
        if (!creator.rows[0] || creator.rows[0].status !== "active") throw new Error("external_advisor_creator_not_active");
        if (!await activeMembership(client, input.organizationId, input.createdByUserId)) throw new Error("external_advisor_actor_membership_required");
        const businessCase = await client.query("SELECT organization_id,status FROM business_cases WHERE id=$1", [input.resourceId]);
        if (!businessCase.rows[0]) throw new Error("business_case_not_found");
        if (businessCase.rows[0].organization_id !== input.organizationId) throw new Error("external_advisor_cross_tenant_case_forbidden");
        if (!isBusinessCaseShareable(businessCase.rows[0].status)) throw new Error("external_advisor_business_case_not_shareable");

        const inserted = await client.query(
          `INSERT INTO external_advisor_invitations
           (id,organization_id,resource_type,resource_id,advisor_email_normalized,token_hash,permissions,created_by_user_id,status,created_at,invitation_expires_at,grant_expires_at,metadata)
           VALUES ($1,$2,'BUSINESS_CASE',$3,$4,$5,$6,$7,'PENDING',$8,$9,$10,$11) RETURNING *`,
          [invitationId, input.organizationId, input.resourceId, input.advisorEmail, tokenHash, JSON.stringify(input.permissions), input.createdByUserId, input.createdAt, input.invitationExpiresAt, input.grantExpiresAt, JSON.stringify(metadata || {})],
        );
        await event(client, invitationId, input.createdByUserId, "CREATED", { advisorEmailHash: hashOpaqueToken(input.advisorEmail), permissions: input.permissions }, input.createdAt);
        return mapInvitation(inserted.rows[0], createdAtValue);
      });
      return { invitation, rawToken };
    } catch (error) {
      if (error?.code === "23505") throw new Error("external_advisor_invitation_pending_duplicate");
      throw error;
    }
  }

  async function get(invitationId) {
    const result = await pool.query("SELECT * FROM external_advisor_invitations WHERE id=$1", [invitationId]);
    return mapInvitation(result.rows[0], now());
  }

  async function listForOrganization({ organizationId, limit = 100 } = {}) {
    const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
    const result = await pool.query(
      `SELECT * FROM external_advisor_invitations WHERE organization_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2`,
      [organizationId, safeLimit],
    );
    const current = now();
    return result.rows.map((row) => mapInvitation(row, current));
  }

  async function previewForAdvisor({ rawToken, actorUserId, actorEmail } = {}) {
    const tokenHash = hashOpaqueToken(String(rawToken || ""));
    const result = await pool.query(
      `SELECT i.*,c.title AS case_title,c.status AS case_status,o.display_name AS organization_name
       FROM external_advisor_invitations i
       JOIN business_cases c ON c.id=i.resource_id
       JOIN organizations o ON o.id=i.organization_id
       WHERE i.token_hash=$1`,
      [tokenHash],
    );
    const row = result.rows[0];
    if (!row) throw new Error("external_advisor_invitation_not_found");
    const invitation = mapInvitation(row, now());
    if (invitation.effectiveStatus !== "PENDING") throw new Error("external_advisor_invitation_not_found");
    if (normalizeEmail(actorEmail) !== invitation.advisorEmail) throw new Error("external_advisor_invitation_not_found");
    if (!String(actorUserId || "").trim()) throw new Error("external_advisor_invitation_not_found");
    return {
      invitation: {
        id: invitation.id,
        permissions: invitation.permissions,
        invitationExpiresAt: invitation.invitationExpiresAt,
        grantExpiresAt: invitation.grantExpiresAt,
        effectiveStatus: invitation.effectiveStatus,
      },
      organization: { displayName: row.organization_name },
      businessCase: { id: invitation.resourceId, title: row.case_title, status: row.case_status },
    };
  }

  async function accept({ rawToken, actorUserId, actorEmail } = {}) {
    const tokenHash = hashOpaqueToken(String(rawToken || ""));
    const acceptedAtValue = now();
    const acceptedAt = acceptedAtValue.toISOString();
    return withPostgresTransaction(pool, async (client) => {
      const locked = await client.query("SELECT * FROM external_advisor_invitations WHERE token_hash=$1 FOR UPDATE", [tokenHash]);
      const row = locked.rows[0];
      if (!row || row.status !== "PENDING" || new Date(row.invitation_expires_at).getTime() <= acceptedAtValue.getTime()) throw new Error("external_advisor_invitation_not_found");
      if (normalizeEmail(actorEmail) !== row.advisor_email_normalized) throw new Error("external_advisor_invitation_not_found");
      const user = await client.query("SELECT status,email_normalized,email_verified_at FROM users WHERE id=$1", [actorUserId]);
      if (!user.rows[0] || user.rows[0].status !== "active" || !user.rows[0].email_verified_at || user.rows[0].email_normalized !== row.advisor_email_normalized) throw new Error("external_advisor_invitation_not_found");
      const org = await client.query("SELECT status FROM organizations WHERE id=$1", [row.organization_id]);
      if (!org.rows[0] || org.rows[0].status !== "ACTIVE") throw new Error("external_advisor_invitation_not_found");
      if (await activeMembership(client, row.organization_id, actorUserId)) throw new Error("external_advisor_invitation_not_found");
      const businessCase = await client.query("SELECT organization_id,status FROM business_cases WHERE id=$1", [row.resource_id]);
      if (!businessCase.rows[0] || businessCase.rows[0].organization_id !== row.organization_id || !isBusinessCaseShareable(businessCase.rows[0].status)) throw new Error("external_advisor_invitation_not_found");
      if (new Date(row.grant_expires_at).getTime() <= acceptedAtValue.getTime()) throw new Error("external_advisor_invitation_not_found");

      const grantId = id("easg");
      await client.query(
        `INSERT INTO external_advisor_share_grants
         (id,organization_id,resource_type,resource_id,advisor_user_id,permissions,created_by_user_id,status,created_at,expires_at,accepted_at,metadata)
         VALUES ($1,$2,'BUSINESS_CASE',$3,$4,$5,$6,'ACTIVE',$7,$8,$7,$9)`,
        [grantId, row.organization_id, row.resource_id, actorUserId, JSON.stringify(row.permissions), row.created_by_user_id, acceptedAt, row.grant_expires_at, JSON.stringify({ invitationId: row.id })],
      );
      await client.query(
        `INSERT INTO external_advisor_share_grant_events(id,share_grant_id,actor_user_id,event_type,metadata,created_at)
         VALUES ($1,$2,$3,'CREATED',$4,$5),($6,$2,$7,'ACCEPTED',$8,$5)`,
        [id("easge"), grantId, row.created_by_user_id, JSON.stringify({ invitationId: row.id }), acceptedAt, id("easge"), actorUserId, JSON.stringify({ invitationId: row.id })],
      );
      const updated = await client.query(
        `UPDATE external_advisor_invitations SET status='ACCEPTED',accepted_at=$2,accepted_by_user_id=$3,share_grant_id=$4 WHERE id=$1 RETURNING *`,
        [row.id, acceptedAt, actorUserId, grantId],
      );
      await event(client, row.id, actorUserId, "ACCEPTED", { shareGrantId: grantId }, acceptedAt);
      return { invitation: mapInvitation(updated.rows[0], acceptedAtValue), shareGrantId: grantId };
    });
  }

  async function revoke({ invitationId, actorUserId } = {}) {
    const revokedAtValue = now();
    const revokedAt = revokedAtValue.toISOString();
    return withPostgresTransaction(pool, async (client) => {
      const locked = await client.query("SELECT * FROM external_advisor_invitations WHERE id=$1 FOR UPDATE", [invitationId]);
      const row = locked.rows[0];
      if (!row) throw new Error("external_advisor_invitation_not_found");
      if (row.status !== "PENDING") throw new Error("external_advisor_invitation_not_revocable");
      if (!await activeMembership(client, row.organization_id, actorUserId)) throw new Error("external_advisor_actor_membership_required");
      const updated = await client.query(
        `UPDATE external_advisor_invitations SET status='REVOKED',revoked_at=$2,revoked_by_user_id=$3 WHERE id=$1 RETURNING *`,
        [invitationId, revokedAt, actorUserId],
      );
      await event(client, invitationId, actorUserId, "REVOKED", {}, revokedAt);
      return mapInvitation(updated.rows[0], revokedAtValue);
    });
  }

  return { create, get, listForOrganization, previewForAdvisor, accept, revoke };
}
