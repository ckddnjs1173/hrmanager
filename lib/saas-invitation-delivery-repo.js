import { getRuntimePostgresPool } from "./runtime-postgres.js";
import { hashOpaqueToken } from "./saas-auth-repo.js";

function raw(value) { return String(value || "").trim(); }
function iso(value) { return value instanceof Date ? value.toISOString() : String(value || ""); }

export async function resolveOrganizationInvitationForDelivery(rawToken) {
  const token = raw(rawToken);
  if (!token) throw new Error("invitation_invalid");
  const result = await getRuntimePostgresPool().query(
    `SELECT i.id,i.organization_id,i.email_normalized,i.role_key,i.status,i.expires_at,o.display_name,o.legal_name
     FROM organization_invitations i
     JOIN organizations o ON o.id=i.organization_id
     WHERE i.token_hash=$1`,
    [hashOpaqueToken(token)],
  );
  const row = result.rows[0];
  if (!row || row.status !== "PENDING" || new Date(row.expires_at).getTime() <= Date.now()) throw new Error("invitation_invalid");
  return {
    id: row.id,
    organizationId: row.organization_id,
    email: row.email_normalized,
    roleKey: row.role_key,
    expiresAt: iso(row.expires_at),
    organizationName: row.display_name || row.legal_name || "회사",
  };
}

export async function resolveAdvisorInvitationForDelivery(rawToken) {
  const token = raw(rawToken);
  if (!token) throw new Error("external_advisor_invitation_not_found");
  const result = await getRuntimePostgresPool().query(
    `SELECT i.id,i.advisor_email_normalized,i.status,i.invitation_expires_at,c.title AS case_title
     FROM external_advisor_invitations i
     JOIN business_cases c ON c.id=i.resource_id
     WHERE i.token_hash=$1`,
    [hashOpaqueToken(token)],
  );
  const row = result.rows[0];
  if (!row || row.status !== "PENDING" || new Date(row.invitation_expires_at).getTime() <= Date.now()) throw new Error("external_advisor_invitation_not_found");
  return {
    id: row.id,
    email: row.advisor_email_normalized,
    invitationExpiresAt: iso(row.invitation_expires_at),
    businessCaseTitle: row.case_title || "Business Case",
  };
}
