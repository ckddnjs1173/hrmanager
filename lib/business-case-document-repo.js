import crypto from "node:crypto";
import { getRuntimePostgresPool } from "./runtime-postgres.js";
import { withPostgresTransaction } from "./postgres-client.js";
import {
  canAddBusinessCaseDocumentVersion,
  canTransitionBusinessCaseDocument,
  isBusinessCaseDocumentAdvisorReadable,
  normalizeBusinessCaseDocumentKind,
  normalizeBusinessCaseDocumentReview,
  normalizeBusinessCaseDocumentTitle,
  validateBusinessCaseDocumentVersionMetadata,
} from "./business-case-document-contract.js";

const MANAGEMENT_ROLES = new Set(["OWNER", "HR_ADMIN"]);
const SHAREABLE_CASE_STATUSES = new Set(["OPEN", "RESOLVED"]);
const id = (prefix) => `${prefix}_${crypto.randomUUID()}`;
const iso = (value) => value instanceof Date ? value.toISOString() : value || null;

function mapDocument(row) {
  if (!row) return null;
  return {
    id: row.id,
    businessCaseId: row.business_case_id,
    title: row.title,
    documentKind: row.document_kind,
    status: row.status,
    createdByUserId: row.created_by_user_id,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapVersion(row) {
  if (!row) return null;
  return {
    id: row.id,
    documentId: row.document_id,
    versionNo: Number(row.version_no),
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    contentSha256: row.content_sha256,
    createdByUserId: row.created_by_user_id,
    createdAt: iso(row.created_at),
  };
}

function mapReview(row) {
  if (!row) return null;
  return {
    id: row.id,
    documentId: row.document_id,
    versionId: row.version_id,
    shareGrantId: row.share_grant_id,
    reviewerUserId: row.reviewer_user_id,
    decision: row.decision,
    reviewNote: row.review_note || "",
    createdAt: iso(row.created_at),
  };
}

function mapEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    documentId: row.document_id,
    actorUserId: row.actor_user_id,
    actorType: row.actor_type,
    shareGrantId: row.share_grant_id || null,
    eventType: row.event_type,
    metadata: row.metadata || {},
    createdAt: iso(row.created_at),
  };
}

async function requireActiveUser(client, userId, code) {
  const result = await client.query("SELECT id,status FROM users WHERE id=$1", [userId]);
  if (!result.rows[0] || result.rows[0].status !== "active") throw new Error(code);
  return result.rows[0];
}

async function requireActiveOrganization(client, organizationId) {
  const result = await client.query("SELECT id,status FROM organizations WHERE id=$1", [organizationId]);
  if (!result.rows[0] || result.rows[0].status !== "ACTIVE") throw new Error("business_case_document_organization_not_active");
  return result.rows[0];
}

async function requireShareableBusinessCase(client, caseId, { lock = false } = {}) {
  const result = await client.query(
    `SELECT id,organization_id,status FROM business_cases WHERE id=$1${lock ? " FOR UPDATE" : ""}`,
    [caseId],
  );
  const businessCase = result.rows[0];
  if (!businessCase) throw new Error("business_case_document_case_not_found");
  if (!SHAREABLE_CASE_STATUSES.has(businessCase.status)) throw new Error("business_case_document_case_not_shareable");
  await requireActiveOrganization(client, businessCase.organization_id);
  return businessCase;
}

async function requireManagementActor(client, organizationId, actorUserId) {
  await requireActiveUser(client, actorUserId, "business_case_document_actor_not_active");
  const result = await client.query(
    `SELECT role_key,status FROM organization_memberships
     WHERE organization_id=$1 AND user_id=$2 AND status='ACTIVE'`,
    [organizationId, actorUserId],
  );
  const membership = result.rows[0];
  if (!membership) throw new Error("business_case_document_management_membership_required");
  if (!MANAGEMENT_ROLES.has(membership.role_key)) throw new Error("business_case_document_management_role_required");
  return membership;
}

async function requireDocumentWithCase(client, documentId, { lock = false } = {}) {
  const result = await client.query(
    `SELECT d.*,c.organization_id,c.status AS case_status
     FROM business_case_documents d
     JOIN business_cases c ON c.id=d.business_case_id
     WHERE d.id=$1${lock ? " FOR UPDATE OF d,c" : ""}`,
    [documentId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("business_case_document_not_found");
  if (!SHAREABLE_CASE_STATUSES.has(row.case_status)) throw new Error("business_case_document_case_not_shareable");
  await requireActiveOrganization(client, row.organization_id);
  return row;
}

function grantContainsPermission(permissions, permission) {
  return Array.isArray(permissions) && permissions.includes(permission);
}

async function requireAdvisorPermission(client, { grantId, advisorUserId, permission, now }) {
  await requireActiveUser(client, advisorUserId, "business_case_document_advisor_not_active");
  const result = await client.query(
    `SELECT * FROM external_advisor_share_grants WHERE id=$1 FOR SHARE`,
    [grantId],
  );
  const grant = result.rows[0];
  if (!grant || grant.advisor_user_id !== advisorUserId) throw new Error("business_case_document_advisor_not_found");
  if (grant.status !== "ACTIVE" || !grant.accepted_at || grant.revoked_at) throw new Error("business_case_document_advisor_not_found");
  if (new Date(grant.expires_at).getTime() <= now.getTime()) throw new Error("business_case_document_advisor_not_found");
  if (!grantContainsPermission(grant.permissions, permission)) throw new Error("business_case_document_advisor_not_found");
  if (grant.resource_type !== "BUSINESS_CASE") throw new Error("business_case_document_advisor_not_found");

  await requireActiveOrganization(client, grant.organization_id);
  const internalMembership = await client.query(
    `SELECT 1 FROM organization_memberships
     WHERE organization_id=$1 AND user_id=$2 AND status='ACTIVE' LIMIT 1`,
    [grant.organization_id, advisorUserId],
  );
  if (internalMembership.rowCount) throw new Error("business_case_document_advisor_not_found");

  const businessCase = await client.query(
    `SELECT id,organization_id,status FROM business_cases WHERE id=$1`,
    [grant.resource_id],
  );
  const caseRow = businessCase.rows[0];
  if (!caseRow || caseRow.organization_id !== grant.organization_id || !SHAREABLE_CASE_STATUSES.has(caseRow.status)) {
    throw new Error("business_case_document_advisor_not_found");
  }
  return { grant, businessCase: caseRow };
}

async function insertEvent(client, {
  documentId,
  actorUserId,
  actorType,
  eventType,
  shareGrantId = null,
  metadata = {},
  createdAt,
}) {
  await client.query(
    `INSERT INTO business_case_document_events
     (id,document_id,actor_user_id,actor_type,share_grant_id,event_type,metadata,created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id("bcde"), documentId, actorUserId, actorType, shareGrantId, eventType, JSON.stringify(metadata || {}), createdAt],
  );
}

async function listVersions(client, documentId) {
  const result = await client.query(
    `SELECT * FROM business_case_document_versions WHERE document_id=$1 ORDER BY version_no ASC,id ASC`,
    [documentId],
  );
  return result.rows.map(mapVersion);
}

async function listReviews(client, documentId) {
  const result = await client.query(
    `SELECT * FROM business_case_document_reviews WHERE document_id=$1 ORDER BY created_at ASC,id ASC`,
    [documentId],
  );
  return result.rows.map(mapReview);
}

function safeAdvisorDocument(document, versions, reviews) {
  return {
    document: {
      id: document.id,
      businessCaseId: document.businessCaseId,
      title: document.title,
      documentKind: document.documentKind,
      status: document.status,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    },
    versions: versions.map((version) => ({
      id: version.id,
      versionNo: version.versionNo,
      fileName: version.fileName,
      mimeType: version.mimeType,
      sizeBytes: version.sizeBytes,
      contentSha256: version.contentSha256,
      createdAt: version.createdAt,
    })),
    reviews: reviews.map((review) => ({
      id: review.id,
      versionId: review.versionId,
      decision: review.decision,
      reviewNote: review.reviewNote,
      createdAt: review.createdAt,
    })),
  };
}

export function createBusinessCaseDocumentRepository({
  pool = getRuntimePostgresPool(),
  now = () => new Date(),
} = {}) {
  if (!pool || typeof pool.query !== "function") throw new Error("business_case_document_postgres_pool_required");

  async function createDraft({ caseId, actorUserId, title, documentKind } = {}) {
    const normalizedTitle = normalizeBusinessCaseDocumentTitle(title);
    const normalizedKind = normalizeBusinessCaseDocumentKind(documentKind);
    const documentId = id("bcdoc");
    const createdAt = now().toISOString();
    return withPostgresTransaction(pool, async (client) => {
      const businessCase = await requireShareableBusinessCase(client, caseId, { lock: true });
      const membership = await requireManagementActor(client, businessCase.organization_id, actorUserId);
      const result = await client.query(
        `INSERT INTO business_case_documents
         (id,business_case_id,title,document_kind,status,created_by_user_id,created_at,updated_at)
         VALUES ($1,$2,$3,$4,'DRAFT',$5,$6,$6)
         RETURNING *`,
        [documentId, businessCase.id, normalizedTitle, normalizedKind, actorUserId, createdAt],
      );
      await insertEvent(client, {
        documentId,
        actorUserId,
        actorType: "BUSINESS",
        eventType: "CREATED",
        metadata: { actorRoleKey: membership.role_key },
        createdAt,
      });
      return mapDocument(result.rows[0]);
    });
  }

  async function addVersion({ documentId, actorUserId, fileName, mimeType, sizeBytes, contentSha256 } = {}) {
    const metadata = validateBusinessCaseDocumentVersionMetadata({ fileName, mimeType, sizeBytes, contentSha256 });
    const createdAt = now().toISOString();
    const versionId = id("bcdocv");
    return withPostgresTransaction(pool, async (client) => {
      const document = await requireDocumentWithCase(client, documentId, { lock: true });
      const membership = await requireManagementActor(client, document.organization_id, actorUserId);
      if (!canAddBusinessCaseDocumentVersion(document.status)) throw new Error("business_case_document_version_state_invalid");
      const current = await client.query(
        `SELECT COALESCE(MAX(version_no),0) AS current_version FROM business_case_document_versions WHERE document_id=$1`,
        [documentId],
      );
      const versionNo = Number(current.rows[0]?.current_version || 0) + 1;
      const storageObjectKey = `business-case-documents/${document.organization_id}/${document.business_case_id}/${documentId}/${versionId}`;
      try {
        const inserted = await client.query(
          `INSERT INTO business_case_document_versions
           (id,document_id,version_no,file_name,mime_type,size_bytes,content_sha256,storage_object_key,created_by_user_id,created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           RETURNING *`,
          [versionId, documentId, versionNo, metadata.fileName, metadata.mimeType, metadata.sizeBytes,
            metadata.contentSha256, storageObjectKey, actorUserId, createdAt],
        );
        await insertEvent(client, {
          documentId,
          actorUserId,
          actorType: "BUSINESS",
          eventType: "VERSION_ADDED",
          metadata: { actorRoleKey: membership.role_key, versionId, versionNo },
          createdAt,
        });
        return mapVersion(inserted.rows[0]);
      } catch (error) {
        if (error?.code === "23505") throw new Error("business_case_document_version_duplicate");
        throw error;
      }
    });
  }

  async function submitForReview({ documentId, actorUserId } = {}) {
    const submittedAt = now().toISOString();
    return withPostgresTransaction(pool, async (client) => {
      const document = await requireDocumentWithCase(client, documentId, { lock: true });
      const membership = await requireManagementActor(client, document.organization_id, actorUserId);
      if (!canTransitionBusinessCaseDocument(document.status, "IN_REVIEW")) throw new Error("business_case_document_transition_invalid");
      const latest = await client.query(
        `SELECT id,version_no FROM business_case_document_versions WHERE document_id=$1 ORDER BY version_no DESC LIMIT 1`,
        [documentId],
      );
      if (!latest.rows[0]) throw new Error("business_case_document_version_required");
      const updated = await client.query(
        `UPDATE business_case_documents SET status='IN_REVIEW',updated_at=$2 WHERE id=$1 RETURNING *`,
        [documentId, submittedAt],
      );
      await insertEvent(client, {
        documentId,
        actorUserId,
        actorType: "BUSINESS",
        eventType: "SUBMITTED_FOR_REVIEW",
        metadata: { actorRoleKey: membership.role_key, versionId: latest.rows[0].id, versionNo: Number(latest.rows[0].version_no) },
        createdAt: submittedAt,
      });
      return mapDocument(updated.rows[0]);
    });
  }

  async function withdraw({ documentId, actorUserId } = {}) {
    const withdrawnAt = now().toISOString();
    return withPostgresTransaction(pool, async (client) => {
      const document = await requireDocumentWithCase(client, documentId, { lock: true });
      const membership = await requireManagementActor(client, document.organization_id, actorUserId);
      if (!canTransitionBusinessCaseDocument(document.status, "WITHDRAWN")) throw new Error("business_case_document_transition_invalid");
      const updated = await client.query(
        `UPDATE business_case_documents SET status='WITHDRAWN',updated_at=$2 WHERE id=$1 RETURNING *`,
        [documentId, withdrawnAt],
      );
      await insertEvent(client, {
        documentId,
        actorUserId,
        actorType: "BUSINESS",
        eventType: "WITHDRAWN",
        metadata: { actorRoleKey: membership.role_key },
        createdAt: withdrawnAt,
      });
      return mapDocument(updated.rows[0]);
    });
  }

  async function getForBusiness({ documentId, actorUserId } = {}) {
    return withPostgresTransaction(pool, async (client) => {
      const row = await requireDocumentWithCase(client, documentId);
      await requireManagementActor(client, row.organization_id, actorUserId);
      const document = mapDocument(row);
      return { document, versions: await listVersions(client, documentId), reviews: await listReviews(client, documentId) };
    });
  }

  async function listForBusinessCase({ caseId, actorUserId, limit = 100 } = {}) {
    const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
    return withPostgresTransaction(pool, async (client) => {
      const businessCase = await requireShareableBusinessCase(client, caseId);
      await requireManagementActor(client, businessCase.organization_id, actorUserId);
      const result = await client.query(
        `SELECT * FROM business_case_documents WHERE business_case_id=$1 ORDER BY updated_at DESC,id DESC LIMIT $2`,
        [caseId, safeLimit],
      );
      return result.rows.map(mapDocument);
    });
  }

  async function listForAdvisor({ grantId, advisorUserId, limit = 100 } = {}) {
    const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
    const current = now();
    return withPostgresTransaction(pool, async (client) => {
      const { businessCase } = await requireAdvisorPermission(client, { grantId, advisorUserId, permission: "document.read", now: current });
      const result = await client.query(
        `SELECT * FROM business_case_documents WHERE business_case_id=$1 ORDER BY updated_at DESC,id DESC LIMIT $2`,
        [businessCase.id, safeLimit],
      );
      return result.rows.filter((row) => isBusinessCaseDocumentAdvisorReadable(row.status)).map((row) => ({
        id: row.id,
        businessCaseId: row.business_case_id,
        title: row.title,
        documentKind: row.document_kind,
        status: row.status,
        createdAt: iso(row.created_at),
        updatedAt: iso(row.updated_at),
      }));
    });
  }

  async function getForAdvisor({ grantId, advisorUserId, documentId } = {}) {
    const current = now();
    return withPostgresTransaction(pool, async (client) => {
      const { businessCase } = await requireAdvisorPermission(client, { grantId, advisorUserId, permission: "document.read", now: current });
      const result = await client.query("SELECT * FROM business_case_documents WHERE id=$1", [documentId]);
      const row = result.rows[0];
      if (!row || row.business_case_id !== businessCase.id || !isBusinessCaseDocumentAdvisorReadable(row.status)) {
        throw new Error("business_case_document_advisor_not_found");
      }
      const document = mapDocument(row);
      return safeAdvisorDocument(document, await listVersions(client, documentId), await listReviews(client, documentId));
    });
  }

  async function reviewForAdvisor({ grantId, advisorUserId, documentId, decision, note = "" } = {}) {
    const review = normalizeBusinessCaseDocumentReview({ decision, note });
    const current = now();
    const reviewedAt = current.toISOString();
    return withPostgresTransaction(pool, async (client) => {
      const { grant, businessCase } = await requireAdvisorPermission(client, {
        grantId,
        advisorUserId,
        permission: "document.review",
        now: current,
      });
      const result = await client.query("SELECT * FROM business_case_documents WHERE id=$1 FOR UPDATE", [documentId]);
      const row = result.rows[0];
      if (!row || row.business_case_id !== businessCase.id || row.status !== "IN_REVIEW") {
        throw new Error("business_case_document_advisor_not_found");
      }
      const latest = await client.query(
        `SELECT * FROM business_case_document_versions WHERE document_id=$1 ORDER BY version_no DESC LIMIT 1`,
        [documentId],
      );
      if (!latest.rows[0]) throw new Error("business_case_document_advisor_not_found");
      const reviewId = id("bcdocr");
      try {
        const inserted = await client.query(
          `INSERT INTO business_case_document_reviews
           (id,document_id,version_id,share_grant_id,reviewer_user_id,decision,review_note,created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           RETURNING *`,
          [reviewId, documentId, latest.rows[0].id, grant.id, advisorUserId, review.decision, review.note, reviewedAt],
        );
        const nextStatus = review.decision === "APPROVED" ? "APPROVED" : "CHANGES_REQUESTED";
        await client.query(
          `UPDATE business_case_documents SET status=$2,updated_at=$3 WHERE id=$1`,
          [documentId, nextStatus, reviewedAt],
        );
        await insertEvent(client, {
          documentId,
          actorUserId: advisorUserId,
          actorType: "ADVISOR",
          shareGrantId: grant.id,
          eventType: review.decision === "APPROVED" ? "REVIEW_APPROVED" : "REVIEW_CHANGES_REQUESTED",
          metadata: { reviewId, versionId: latest.rows[0].id, versionNo: Number(latest.rows[0].version_no) },
          createdAt: reviewedAt,
        });
        return mapReview(inserted.rows[0]);
      } catch (error) {
        if (error?.code === "23505") throw new Error("business_case_document_review_duplicate");
        throw error;
      }
    });
  }

  async function listEventsForBusiness({ documentId, actorUserId } = {}) {
    return withPostgresTransaction(pool, async (client) => {
      const row = await requireDocumentWithCase(client, documentId);
      await requireManagementActor(client, row.organization_id, actorUserId);
      const result = await client.query(
        `SELECT * FROM business_case_document_events WHERE document_id=$1 ORDER BY created_at ASC,id ASC`,
        [documentId],
      );
      return result.rows.map(mapEvent);
    });
  }

  return {
    createDraft,
    addVersion,
    submitForReview,
    withdraw,
    getForBusiness,
    listForBusinessCase,
    listForAdvisor,
    getForAdvisor,
    reviewForAdvisor,
    listEventsForBusiness,
  };
}
