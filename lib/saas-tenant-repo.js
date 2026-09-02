import crypto from "node:crypto";
import { getRuntimePostgresPool } from "./runtime-postgres.js";
import { withPostgresTransaction } from "./postgres-client.js";
import { authorizeRolePermission, ROLE_TEMPLATES } from "./access-control-contract.js";
import { hashOpaqueToken, normalizeEmail } from "./saas-auth-repo.js";
import { isValidEmail } from "./validators.js";

const nowISO = () => new Date().toISOString();
const id = (prefix) => `${prefix}_${crypto.randomUUID()}`;
const INVITABLE_ROLES = Object.freeze(["HR_ADMIN", "MANAGER", "EMPLOYEE", "BILLING_ADMIN"]);

function plusDays(days) {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

function mapOrganization(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    legalName: row.legal_name,
    displayName: row.display_name,
    status: row.status,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

function mapMembership(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    roleKey: row.role_key,
    status: row.status,
    scope: row.scope || {},
    joinedAt: row.joined_at instanceof Date ? row.joined_at.toISOString() : row.joined_at,
    removedAt: row.removed_at instanceof Date ? row.removed_at.toISOString() : row.removed_at,
  };
}

async function audit(client, { organizationId, actorUserId, action, resourceType = null, resourceId = null, result = "SUCCESS", requestId = null, metadata = {} }) {
  await client.query(
    `INSERT INTO audit_logs
      (id,organization_id,actor_user_id,actor_type,action,resource_type,resource_id,result,request_id,metadata,created_at)
     VALUES ($1,$2,$3,'USER',$4,$5,$6,$7,$8,$9,$10)`,
    [id("aud"), organizationId, actorUserId, action, resourceType, resourceId, result, requestId, JSON.stringify(metadata || {}), nowISO()]
  );
}

export async function createOrganization({ userId, type = "BUSINESS", legalName = "", displayName = "", requestId = null } = {}) {
  if (!userId) throw new Error("user_required");
  if (!["BUSINESS", "PRO_OFFICE"].includes(type)) throw new Error("organization_type_invalid");
  const name = String(displayName || legalName || "").trim();
  if (!name) throw new Error("organization_name_required");
  const createdAt = nowISO();
  const organizationId = id("org");
  const membershipId = id("mem");

  return withPostgresTransaction(getRuntimePostgresPool(), async (client) => {
    await client.query(
      `INSERT INTO organizations (id,type,legal_name,display_name,status,created_at,updated_at,deletion_requested_at,deleted_at)
       VALUES ($1,$2,$3,$4,'ACTIVE',$5,$5,NULL,NULL)`,
      [organizationId, type, String(legalName || "").trim(), name, createdAt]
    );
    await client.query(
      `INSERT INTO organization_memberships
       (id,organization_id,user_id,role_key,status,scope,joined_at,removed_at,created_at,updated_at)
       VALUES ($1,$2,$3,'OWNER','ACTIVE','{}'::jsonb,$4,NULL,$4,$4)`,
      [membershipId, organizationId, userId, createdAt]
    );
    await audit(client, { organizationId, actorUserId: userId, action: "organization.create", resourceType: "organization", resourceId: organizationId, requestId });
    const row = await client.query("SELECT * FROM organizations WHERE id=$1", [organizationId]);
    return { organization: mapOrganization(row.rows[0]), membership: { id: membershipId, organizationId, userId, roleKey: "OWNER", status: "ACTIVE", scope: {}, joinedAt: createdAt, removedAt: null } };
  });
}

export async function listOrganizationsForUser(userId) {
  const result = await getRuntimePostgresPool().query(
    `SELECT o.*,m.id AS membership_id,m.role_key,m.status AS membership_status,m.scope,m.joined_at,m.removed_at
     FROM organization_memberships m JOIN organizations o ON o.id=m.organization_id
     WHERE m.user_id=$1 AND m.status='ACTIVE' AND o.status <> 'DELETED'
     ORDER BY o.created_at ASC`,
    [userId]
  );
  return result.rows.map((row) => ({
    organization: mapOrganization(row),
    membership: {
      id: row.membership_id,
      organizationId: row.id,
      userId,
      roleKey: row.role_key,
      status: row.membership_status,
      scope: row.scope || {},
      joinedAt: row.joined_at instanceof Date ? row.joined_at.toISOString() : row.joined_at,
      removedAt: row.removed_at,
    },
  }));
}

export async function getActiveMembership(organizationId, userId) {
  const result = await getRuntimePostgresPool().query(
    `SELECT m.*,o.status AS organization_status
     FROM organization_memberships m JOIN organizations o ON o.id=m.organization_id
     WHERE m.organization_id=$1 AND m.user_id=$2 AND m.status='ACTIVE' AND o.status <> 'DELETED'`,
    [organizationId, userId]
  );
  return result.rows[0] ? { ...mapMembership(result.rows[0]), organizationStatus: result.rows[0].organization_status } : null;
}

export async function getOrganizationForMember(organizationId, userId) {
  const result = await getRuntimePostgresPool().query(
    `SELECT o.*,m.id AS membership_id,m.role_key,m.status AS membership_status,m.scope,m.joined_at
     FROM organizations o JOIN organization_memberships m ON m.organization_id=o.id
     WHERE o.id=$1 AND m.user_id=$2 AND m.status='ACTIVE' AND o.status <> 'DELETED'`,
    [organizationId, userId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    organization: mapOrganization(row),
    membership: { id: row.membership_id, organizationId, userId, roleKey: row.role_key, status: row.membership_status, scope: row.scope || {}, joinedAt: row.joined_at instanceof Date ? row.joined_at.toISOString() : row.joined_at },
  };
}

export async function requireOrganizationPermission({ organizationId, userId, permission } = {}) {
  const membership = await getActiveMembership(organizationId, userId);
  if (!membership) return { allowed: false, reason: "membership_not_found", membership: null };
  const authorization = authorizeRolePermission({ roleKey: membership.roleKey, permission, membershipStatus: membership.status });
  return { ...authorization, membership };
}

export async function listOrganizationMembers(organizationId) {
  const result = await getRuntimePostgresPool().query(
    `SELECT m.*,u.email_normalized
     FROM organization_memberships m JOIN users u ON u.id=m.user_id
     WHERE m.organization_id=$1 AND m.status <> 'REMOVED'
     ORDER BY m.created_at ASC`,
    [organizationId]
  );
  return result.rows.map((row) => ({ ...mapMembership(row), email: row.email_normalized }));
}

export async function createOrganizationInvitation({ organizationId, actorUserId, email, roleKey = "HR_ADMIN", ttlDays = 7, requestId = null } = {}) {
  const emailNormalized = normalizeEmail(email);
  if (!isValidEmail(emailNormalized)) throw new Error("invalid_email");
  if (!INVITABLE_ROLES.includes(roleKey) || !ROLE_TEMPLATES[roleKey]) throw new Error("invitation_role_invalid");
  const authorization = await requireOrganizationPermission({ organizationId, userId: actorUserId, permission: "member.invite" });
  if (!authorization.allowed) throw new Error("permission_denied");

  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashOpaqueToken(rawToken);
  const invitationId = id("inv");
  const createdAt = nowISO();
  const expiresAt = plusDays(ttlDays);

  await withPostgresTransaction(getRuntimePostgresPool(), async (client) => {
    await client.query(
      `UPDATE organization_invitations SET status='REVOKED',revoked_at=$1
       WHERE organization_id=$2 AND email_normalized=$3 AND status='PENDING'`,
      [createdAt, organizationId, emailNormalized]
    );
    await client.query(
      `INSERT INTO organization_invitations
       (id,organization_id,email_normalized,role_key,token_hash,invited_by_user_id,status,expires_at,accepted_at,revoked_at,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,'PENDING',$7,NULL,NULL,$8)`,
      [invitationId, organizationId, emailNormalized, roleKey, tokenHash, actorUserId, expiresAt, createdAt]
    );
    await audit(client, { organizationId, actorUserId, action: "member.invite", resourceType: "invitation", resourceId: invitationId, requestId, metadata: { roleKey, emailHash: hashOpaqueToken(emailNormalized) } });
  });

  return { id: invitationId, organizationId, email: emailNormalized, roleKey, rawToken, expiresAt };
}

export async function acceptOrganizationInvitation({ rawToken, userId, userEmail, requestId = null } = {}) {
  if (!rawToken || !userId) throw new Error("invitation_token_required");
  const tokenHash = hashOpaqueToken(rawToken);
  const emailNormalized = normalizeEmail(userEmail);
  const acceptedAt = nowISO();

  return withPostgresTransaction(getRuntimePostgresPool(), async (client) => {
    const result = await client.query("SELECT * FROM organization_invitations WHERE token_hash=$1 FOR UPDATE", [tokenHash]);
    const invitation = result.rows[0];
    if (!invitation) throw new Error("invitation_invalid");
    if (invitation.status !== "PENDING") throw new Error("invitation_not_pending");
    if (new Date(invitation.expires_at).getTime() <= Date.now()) {
      await client.query("UPDATE organization_invitations SET status='EXPIRED' WHERE id=$1", [invitation.id]);
      throw new Error("invitation_expired");
    }
    if (normalizeEmail(invitation.email_normalized) !== emailNormalized) throw new Error("invitation_email_mismatch");

    const existing = await client.query("SELECT * FROM organization_memberships WHERE organization_id=$1 AND user_id=$2 FOR UPDATE", [invitation.organization_id, userId]);
    let membership;
    if (existing.rows[0]) {
      await client.query(
        `UPDATE organization_memberships SET role_key=$1,status='ACTIVE',joined_at=COALESCE(joined_at,$2),removed_at=NULL,updated_at=$2 WHERE id=$3`,
        [invitation.role_key, acceptedAt, existing.rows[0].id]
      );
      membership = { ...existing.rows[0], role_key: invitation.role_key, status: "ACTIVE", joined_at: existing.rows[0].joined_at || acceptedAt, removed_at: null };
    } else {
      const membershipId = id("mem");
      await client.query(
        `INSERT INTO organization_memberships
         (id,organization_id,user_id,role_key,status,scope,joined_at,removed_at,created_at,updated_at)
         VALUES ($1,$2,$3,$4,'ACTIVE','{}'::jsonb,$5,NULL,$5,$5)`,
        [membershipId, invitation.organization_id, userId, invitation.role_key, acceptedAt]
      );
      membership = { id: membershipId, organization_id: invitation.organization_id, user_id: userId, role_key: invitation.role_key, status: "ACTIVE", scope: {}, joined_at: acceptedAt, removed_at: null };
    }
    await client.query("UPDATE organization_invitations SET status='ACCEPTED',accepted_at=$1 WHERE id=$2", [acceptedAt, invitation.id]);
    await audit(client, { organizationId: invitation.organization_id, actorUserId: userId, action: "member.invite.accept", resourceType: "membership", resourceId: membership.id, requestId, metadata: { invitationId: invitation.id, roleKey: invitation.role_key } });
    return mapMembership(membership);
  });
}

export async function revokeOrganizationInvitation({ organizationId, invitationId, actorUserId, requestId = null } = {}) {
  const authorization = await requireOrganizationPermission({ organizationId, userId: actorUserId, permission: "member.invite" });
  if (!authorization.allowed) throw new Error("permission_denied");
  const revokedAt = nowISO();
  return withPostgresTransaction(getRuntimePostgresPool(), async (client) => {
    const result = await client.query(
      "UPDATE organization_invitations SET status='REVOKED',revoked_at=$1 WHERE id=$2 AND organization_id=$3 AND status='PENDING'",
      [revokedAt, invitationId, organizationId]
    );
    if (!result.rowCount) return false;
    await audit(client, { organizationId, actorUserId, action: "member.invite.revoke", resourceType: "invitation", resourceId: invitationId, requestId });
    return true;
  });
}

export async function changeMemberRole({ organizationId, membershipId, actorUserId, roleKey, requestId = null } = {}) {
  const authorization = await requireOrganizationPermission({ organizationId, userId: actorUserId, permission: "member.role.change" });
  if (!authorization.allowed) throw new Error("permission_denied");
  if (!INVITABLE_ROLES.includes(roleKey)) throw new Error("member_role_invalid");
  return withPostgresTransaction(getRuntimePostgresPool(), async (client) => {
    const memberResult = await client.query("SELECT * FROM organization_memberships WHERE id=$1 AND organization_id=$2 FOR UPDATE", [membershipId, organizationId]);
    const member = memberResult.rows[0];
    if (!member || member.status !== "ACTIVE") return null;
    if (member.role_key === "OWNER") throw new Error("owner_transfer_required");
    await client.query("UPDATE organization_memberships SET role_key=$1,updated_at=$2 WHERE id=$3", [roleKey, nowISO(), membershipId]);
    await audit(client, { organizationId, actorUserId, action: "member.role.change", resourceType: "membership", resourceId: membershipId, requestId, metadata: { from: member.role_key, to: roleKey } });
    return { ...mapMembership(member), roleKey };
  });
}

export async function removeMember({ organizationId, membershipId, actorUserId, requestId = null } = {}) {
  const authorization = await requireOrganizationPermission({ organizationId, userId: actorUserId, permission: "member.remove" });
  if (!authorization.allowed) throw new Error("permission_denied");
  const removedAt = nowISO();
  return withPostgresTransaction(getRuntimePostgresPool(), async (client) => {
    const memberResult = await client.query("SELECT * FROM organization_memberships WHERE id=$1 AND organization_id=$2 FOR UPDATE", [membershipId, organizationId]);
    const member = memberResult.rows[0];
    if (!member || member.status !== "ACTIVE") return false;
    if (member.role_key === "OWNER") throw new Error("owner_transfer_required");
    await client.query("UPDATE organization_memberships SET status='REMOVED',removed_at=$1,updated_at=$1 WHERE id=$2", [removedAt, membershipId]);
    await audit(client, { organizationId, actorUserId, action: "member.remove", resourceType: "membership", resourceId: membershipId, requestId, metadata: { roleKey: member.role_key } });
    return true;
  });
}

export const SAAS_INVITABLE_ROLES = INVITABLE_ROLES;
