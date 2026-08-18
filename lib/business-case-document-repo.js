import crypto from "node:crypto";
import { getRuntimePostgresPool } from "./runtime-postgres.js";
import { withPostgresTransaction } from "./postgres-client.js";
import {
  normalizeBusinessCaseDocumentContent,
  normalizeBusinessCaseDocumentReviewBody,
  normalizeBusinessCaseDocumentReviewDecision,
  normalizeBusinessCaseDocumentTitle,
  normalizeBusinessCaseDocumentType,
} from "./business-case-document-contract.js";

const id = (prefix) => `${prefix}_${crypto.randomUUID()}`;
const iso = (value) => value instanceof Date ? value.toISOString() : value || null;
const sha256 = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
const BUSINESS_MUTABLE_CASE_STATUSES = new Set(["DRAFT", "OPEN", "RESOLVED"]);
const ADVISOR_SHAREABLE_CASE_STATUSES = new Set(["OPEN", "RESOLVED"]);

function mapVersion(row) {
  if (!row) return null;
  return {
    id: row.id,
    documentId: row.document_id,
    organizationId: row.organization_id,
    businessCaseId: row.business_case_id,
    versionNumber: Number(row.version_number),
    contentText: row.content_text,
    contentSha256: row.content_sha256,
    createdByUserId: row.created_by_user_id,
    createdAt: iso(row.created_at),
  };
}

function mapDocument(row) {
  if (!row) return null;
  const latestVersion = row.latest_version_id ? {
    id: row.latest_version_id,
    documentId: row.id,
    organizationId: row.organization_id,
    businessCaseId: row.business_case_id,
    versionNumber: Number(row.latest_version_number),
    contentText: row.latest_content_text,
    contentSha256: row.latest_content_sha256,
    createdByUserId: row.latest_created_by_user_id,
    createdAt: iso(row.latest_created_at),
  } : null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    businessCaseId: row.business_case_id,
    title: row.title,
    documentType: row.document_type,
    createdByUserId: row.created_by_user_id,
    createdAt: iso(row.created_at),
    latestVersion,
  };
}

function mapReview(row) {
  if (!row) return null;
  return {
    id: row.id,
    documentVersionId: row.document_version_id,
    organizationId: row.organization_id,
    businessCaseId: row.business_case_id,
    reviewerUserId: row.reviewer_user_id,
    shareGrantId: row.share_grant_id,
    decision: row.decision,
    body: row.body,
    createdAt: iso(row.created_at),
  };
}

async function requireActiveOrganization(client, organizationId, errorCode = "business_case_document_not_found") {
  const result = await client.query("SELECT status FROM organizations WHERE id=$1", [organizationId]);
  if (!result.rows[0] || result.rows[0].status !== "ACTIVE") throw new Error(errorCode);
}

async function requireActiveUser(client, userId, errorCode = "business_case_document_not_found") {
  const result = await client.query("SELECT status FROM users WHERE id=$1", [userId]);
  if (!result.rows[0] || result.rows[0].status !== "active") throw new Error(errorCode);
}

async function requireActiveMembership(client, organizationId, userId) {
  const result = await client.query(
    `SELECT role_key FROM organization_memberships
     WHERE organization_id=$1 AND user_id=$2 AND status='ACTIVE'`,
    [organizationId, userId],
  );
  if (!result.rows[0]) throw new Error("business_case_document_not_found");
  return result.rows[0];
}

async function requireBusinessCase(client, organizationId, businessCaseId, { mutable = false } = {}) {
  const result = await client.query(
    "SELECT id,organization_id,status FROM business_cases WHERE id=$1 AND organization_id=$2",
    [businessCaseId, organizationId],
  );
  const businessCase = result.rows[0];
  if (!businessCase) throw new Error("business_case_document_not_found");
  if (mutable && !BUSINESS_MUTABLE_CASE_STATUSES.has(businessCase.status)) {
    throw new Error("business_case_document_case_not_mutable");
  }
  return businessCase;
}

async function requireExternalAdvisor(client, organizationId, advisorUserId) {
  const result = await client.query(
    `SELECT 1 FROM organization_memberships
     WHERE organization_id=$1 AND user_id=$2 AND status='ACTIVE' LIMIT 1`,
    [organizationId, advisorUserId],
  );
  if (result.rowCount) throw new Error("external_advisor_documents_not_found");
}

async function resolveAdvisorGrant(client, { grantId, advisorUserId, permission, now }) {
  const result = await client.query(
    `SELECT * FROM external_advisor_share_grants
     WHERE id=$1 AND advisor_user_id=$2 AND resource_type='BUSINESS_CASE'`,
    [grantId, advisorUserId],
  );
  const grant = result.rows[0];
  const permissions = Array.isArray(grant?.permissions) ? grant.permissions : [];
  if (!grant || grant.status !== "ACTIVE" || new Date(grant.expires_at).getTime() <= now.getTime()
    || !permissions.includes("case.read") || !permissions.includes("document.read") || !permissions.includes(permission)) {
    throw new Error("external_advisor_documents_not_found");
  }
  await requireActiveOrganization(client, grant.organization_id, "external_advisor_documents_not_found");
  await requireActiveUser(client, advisorUserId, "external_advisor_documents_not_found");
  await requireExternalAdvisor(client, grant.organization_id, advisorUserId);
  const caseResult = await client.query(
    "SELECT id,status FROM business_cases WHERE id=$1 AND organization_id=$2",
    [grant.resource_id, grant.organization_id],
  );
  const businessCase = caseResult.rows[0];
  if (!businessCase || !ADVISOR_SHAREABLE_CASE_STATUSES.has(businessCase.status)) {
    throw new Error("external_advisor_documents_not_found");
  }
  return { grant, businessCase };
}

const DOCUMENT_LIST_SQL = `
  SELECT d.*,
         v.id AS latest_version_id,
         v.version_number AS latest_version_number,
         v.content_text AS latest_content_text,
         v.content_sha256 AS latest_content_sha256,
         v.created_by_user_id AS latest_created_by_user_id,
         v.created_at AS latest_created_at
    FROM business_case_documents d
    LEFT JOIN LATERAL (
      SELECT * FROM business_case_document_versions
       WHERE document_id=d.id
       ORDER BY version_number DESC
       LIMIT 1
    ) v ON TRUE
   WHERE d.organization_id=$1 AND d.business_case_id=$2
   ORDER BY d.created_at DESC,d.id DESC`;

export function createBusinessCaseDocumentRepository({ pool = getRuntimePostgresPool(), now = () => new Date() } = {}) {
  if (!pool || typeof pool.query !== "function") throw new Error("business_case_document_postgres_pool_required");

  async function createDocument({ organizationId, businessCaseId, actorUserId, title, documentType = "OTHER", contentText } = {}) {
    const normalizedTitle = normalizeBusinessCaseDocumentTitle(title);
    const normalizedType = normalizeBusinessCaseDocumentType(documentType);
    const normalizedContent = normalizeBusinessCaseDocumentContent(contentText);
    if (![organizationId, businessCaseId, actorUserId].every((value) => String(value || "").trim())) {
      throw new Error("business_case_document_not_found");
    }
    const createdAt = now().toISOString();
    return withPostgresTransaction(pool, async (client) => {
      await requireActiveOrganization(client, organizationId);
      await requireActiveUser(client, actorUserId);
      await requireActiveMembership(client, organizationId, actorUserId);
      await requireBusinessCase(client, organizationId, businessCaseId, { mutable: true });
      const documentId = id("bcdoc");
      const versionId = id("bcdv");
      await client.query(
        `INSERT INTO business_case_documents
         (id,organization_id,business_case_id,title,document_type,created_by_user_id,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [documentId, organizationId, businessCaseId, normalizedTitle, normalizedType, actorUserId, createdAt],
      );
      const versionResult = await client.query(
        `INSERT INTO business_case_document_versions
         (id,document_id,organization_id,business_case_id,version_number,content_text,content_sha256,created_by_user_id,created_at)
         VALUES ($1,$2,$3,$4,1,$5,$6,$7,$8)
         RETURNING *`,
        [versionId, documentId, organizationId, businessCaseId, normalizedContent, sha256(normalizedContent), actorUserId, createdAt],
      );
      return {
        document: {
          id: documentId,
          organizationId,
          businessCaseId,
          title: normalizedTitle,
          documentType: normalizedType,
          createdByUserId: actorUserId,
          createdAt,
        },
        version: mapVersion(versionResult.rows[0]),
      };
    });
  }

  async function createVersion({ documentId, actorUserId, contentText } = {}) {
    const normalizedContent = normalizeBusinessCaseDocumentContent(contentText);
    if (!String(documentId || "").trim() || !String(actorUserId || "").trim()) throw new Error("business_case_document_not_found");
    const createdAt = now().toISOString();
    return withPostgresTransaction(pool, async (client) => {
      const documentResult = await client.query("SELECT * FROM business_case_documents WHERE id=$1 FOR UPDATE", [documentId]);
      const document = documentResult.rows[0];
      if (!document) throw new Error("business_case_document_not_found");
      await requireActiveOrganization(client, document.organization_id);
      await requireActiveUser(client, actorUserId);
      await requireActiveMembership(client, document.organization_id, actorUserId);
      await requireBusinessCase(client, document.organization_id, document.business_case_id, { mutable: true });
      const current = await client.query(
        "SELECT COALESCE(MAX(version_number),0) AS version_number FROM business_case_document_versions WHERE document_id=$1",
        [document.id],
      );
      const nextVersion = Number(current.rows[0]?.version_number || 0) + 1;
      const result = await client.query(
        `INSERT INTO business_case_document_versions
         (id,document_id,organization_id,business_case_id,version_number,content_text,content_sha256,created_by_user_id,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [id("bcdv"), document.id, document.organization_id, document.business_case_id, nextVersion,
          normalizedContent, sha256(normalizedContent), actorUserId, createdAt],
      );
      return mapVersion(result.rows[0]);
    });
  }

  async function listForBusinessCase({ organizationId, businessCaseId } = {}) {
    const result = await pool.query(DOCUMENT_LIST_SQL, [organizationId, businessCaseId]);
    return result.rows.map(mapDocument);
  }

  async function listVersions({ organizationId, businessCaseId, documentId } = {}) {
    const result = await pool.query(
      `SELECT * FROM business_case_document_versions
       WHERE organization_id=$1 AND business_case_id=$2 AND document_id=$3
       ORDER BY version_number DESC`,
      [organizationId, businessCaseId, documentId],
    );
    return result.rows.map(mapVersion);
  }

  async function listReviewsForVersion({ organizationId, businessCaseId, documentVersionId } = {}) {
    const result = await pool.query(
      `SELECT * FROM business_case_document_reviews
       WHERE organization_id=$1 AND business_case_id=$2 AND document_version_id=$3
       ORDER BY created_at ASC,id ASC`,
      [organizationId, businessCaseId, documentVersionId],
    );
    return result.rows.map(mapReview);
  }

  async function listForAdvisor({ grantId, advisorUserId } = {}) {
    if (!String(grantId || "").trim() || !String(advisorUserId || "").trim()) throw new Error("external_advisor_documents_not_found");
    return withPostgresTransaction(pool, async (client) => {
      const { grant } = await resolveAdvisorGrant(client, { grantId, advisorUserId, permission: "document.read", now: now() });
      const result = await client.query(DOCUMENT_LIST_SQL, [grant.organization_id, grant.resource_id]);
      return result.rows.map(mapDocument);
    });
  }

  async function createAdvisorReview({ grantId, advisorUserId, documentVersionId, decision, body = "" } = {}) {
    const normalizedDecision = normalizeBusinessCaseDocumentReviewDecision(decision);
    const normalizedBody = normalizeBusinessCaseDocumentReviewBody(body, normalizedDecision);
    if (![grantId, advisorUserId, documentVersionId].every((value) => String(value || "").trim())) {
      throw new Error("external_advisor_documents_not_found");
    }
    const createdAt = now().toISOString();
    return withPostgresTransaction(pool, async (client) => {
      const { grant } = await resolveAdvisorGrant(client, { grantId, advisorUserId, permission: "document.review", now: now() });
      const versionResult = await client.query(
        `SELECT * FROM business_case_document_versions
         WHERE id=$1 AND organization_id=$2 AND business_case_id=$3`,
        [documentVersionId, grant.organization_id, grant.resource_id],
      );
      const version = versionResult.rows[0];
      if (!version) throw new Error("external_advisor_documents_not_found");
      const result = await client.query(
        `INSERT INTO business_case_document_reviews
         (id,document_version_id,organization_id,business_case_id,reviewer_user_id,share_grant_id,decision,body,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [id("bcdr"), version.id, grant.organization_id, grant.resource_id, advisorUserId, grant.id,
          normalizedDecision, normalizedBody, createdAt],
      );
      return mapReview(result.rows[0]);
    });
  }

  async function listAdvisorReviewsForVersion({ grantId, advisorUserId, documentVersionId } = {}) {
    if (![grantId, advisorUserId, documentVersionId].every((value) => String(value || "").trim())) {
      throw new Error("external_advisor_documents_not_found");
    }
    return withPostgresTransaction(pool, async (client) => {
      const { grant } = await resolveAdvisorGrant(client, { grantId, advisorUserId, permission: "document.read", now: now() });
      const versionResult = await client.query(
        `SELECT id FROM business_case_document_versions
         WHERE id=$1 AND organization_id=$2 AND business_case_id=$3`,
        [documentVersionId, grant.organization_id, grant.resource_id],
      );
      if (!versionResult.rows[0]) throw new Error("external_advisor_documents_not_found");
      const result = await client.query(
        `SELECT * FROM business_case_document_reviews
         WHERE document_version_id=$1 AND organization_id=$2 AND business_case_id=$3
         ORDER BY created_at ASC,id ASC`,
        [documentVersionId, grant.organization_id, grant.resource_id],
      );
      return result.rows.map(mapReview);
    });
  }

  return {
    createDocument,
    createVersion,
    listForBusinessCase,
    listVersions,
    listReviewsForVersion,
    listForAdvisor,
    createAdvisorReview,
    listAdvisorReviewsForVersion,
  };
}
