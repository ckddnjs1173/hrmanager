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

const id = (prefix) => `${prefix}_${crypto.randomUUID()}`;
const iso = (value) => value instanceof Date ? value.toISOString() : value || null;
const BUSINESS_DOCUMENT_ROLES = new Set(["OWNER", "HR_ADMIN"]);
const BUSINESS_CASE_MUTABLE_STATUSES = new Set(["DRAFT", "OPEN", "RESOLVED"]);
const ADVISOR_CASE_STATUSES = new Set(["OPEN", "RESOLVED"]);

function normalizeStorageObjectKey(value) {
  const key = String(value ?? "").trim();
  if (!key || key.length > 500) throw new Error("business_case_document_storage_key_invalid");
  return key;
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
    createdAt: iso(row.created_at),
  };
}

function mapDocument(row) {
  if (!row) return null;
  return {
    id: row.id,
    businessCaseId: row.business_case_id,
    title: row.title,
    documentKind: row.document_kind,
    status: row.status,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapReview(row) {
  if (!row) return null;
  return {
    id: row.id,
    documentId: row.document_id,
    versionId: row.version_id,
    decision: row.decision,
    reviewNote: row.review_note,
    createdAt: iso(row.created_at),
  };
}

function mapEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    documentId: row.document_id,
    actorType: row.actor_type,
    eventType: row.event_type,
    metadata: row.metadata || {},
    createdAt: iso(row.created_at),
  };
}

async function requireActiveUser(client, userId, code) {
  const result = await client.query("SELECT status FROM users WHERE id=$1", [userId]);
  if (!result.rows[0] || result.rows[0].status !== "active") throw new Error(code);
}

async function requireActiveOrganization(client, organizationId, code) {
  const result = await client.query("SELECT status FROM organizations WHERE id=$1", [organizationId]);
  if (!result.rows[0] || result.rows[0].status !== "ACTIVE") throw new Error(code);
}

async function requireBusinessActor(client, organizationId, actorUserId) {
  await requireActiveOrganization(client, organizationId, "business_case_document_not_found");
  await requireActiveUser(client, actorUserId, "business_case_document_not_found");
  const membership = await client.query(
    `SELECT role_key FROM organization_memberships
     WHERE organization_id=$1 AND user_id=$2 AND status='ACTIVE'`,
    [organizationId, actorUserId],
  );
  const roleKey = membership.rows[0]?.role_key;
  if (!BUSINESS_DOCUMENT_ROLES.has(roleKey)) throw new Error("business_case_document_not_found");
  return roleKey;
}

async function resolveBusinessCase(client, businessCaseId, { forAdvisor = false } = {}) {
  const result = await client.query(
    `SELECT bc.id,bc.organization_id,bc.status,o.status AS organization_status
       FROM business_cases bc
       JOIN organizations o ON o.id=bc.organization_id
      WHERE bc.id=$1`,
    [businessCaseId],
  );
  const businessCase = result.rows[0];
  const allowed = forAdvisor ? ADVISOR_CASE_STATUSES : BUSINESS_CASE_MUTABLE_STATUSES;
  const code = forAdvisor ? "external_advisor_documents_not_found" : "business_case_document_not_found";
  if (!businessCase || businessCase.organization_status !== "ACTIVE" || !allowed.has(businessCase.status)) throw new Error(code);
  return businessCase;
}

async function resolveDocument(client, documentId, { lock = false } = {}) {
  const result = await client.query(
    `SELECT d.*,bc.organization_id,bc.status AS business_case_status,o.status AS organization_status
       FROM business_case_documents d
       JOIN business_cases bc ON bc.id=d.business_case_id
       JOIN organizations o ON o.id=bc.organization_id
      WHERE d.id=$1${lock ? " FOR UPDATE OF d" : ""}`,
    [documentId],
  );
  return result.rows[0] || null;
}

async function requireExternalAdvisor(client, organizationId, advisorUserId) {
  const membership = await client.query(
    `SELECT 1 FROM organization_memberships
     WHERE organization_id=$1 AND user_id=$2 AND status='ACTIVE' LIMIT 1`,
    [organizationId, advisorUserId],
  );
  if (membership.rowCount) throw new Error("external_advisor_documents_not_found");
}

async function requireAdvisorGrant(client, { shareGrantId, advisorUserId, permission, now }) {
  const result = await client.query(
    `SELECT * FROM external_advisor_share_grants
     WHERE id=$1 AND advisor_user_id=$2 AND resource_type='BUSINESS_CASE'
     FOR UPDATE`,
    [shareGrantId, advisorUserId],
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
  const businessCase = await resolveBusinessCase(client, grant.resource_id, { forAdvisor: true });
  if (businessCase.organization_id !== grant.organization_id) throw new Error("external_advisor_documents_not_found");
  return { grant, businessCase };
}

async function insertBusinessEvent(client, { documentId, actorUserId, eventType, metadata = {}, createdAt }) {
  await client.query(
    `INSERT INTO business_case_document_events
     (id,document_id,actor_user_id,actor_type,share_grant_id,event_type,metadata,created_at)
     VALUES ($1,$2,$3,'BUSINESS',NULL,$4,$5,$6)`,
    [id("bcde"), documentId, actorUserId, eventType, JSON.stringify(metadata || {}), createdAt],
  );
}

export function createBusinessCaseDocumentRepository({ pool = getRuntimePostgresPool(), now = () => new Date() } = {}) {
  if (!pool || typeof pool.query !== "function") throw new Error("business_case_document_postgres_pool_required");

  async function createDocument({
    businessCaseId,
    actorUserId,
    title,
    documentKind,
    fileName,
    mimeType,
    sizeBytes,
    contentSha256,
    storageObjectKey,
  } = {}) {
    if (!String(businessCaseId || "").trim() || !String(actorUserId || "").trim()) throw new Error("business_case_document_not_found");
    const normalizedTitle = normalizeBusinessCaseDocumentTitle(title);
    const normalizedKind = normalizeBusinessCaseDocumentKind(documentKind);
    const versionMetadata = validateBusinessCaseDocumentVersionMetadata({ fileName, mimeType, sizeBytes, contentSha256 });
    const storageKey = normalizeStorageObjectKey(storageObjectKey);
    const createdAt = now().toISOString();

    return withPostgresTransaction(pool, async (client) => {
      const businessCase = await resolveBusinessCase(client, businessCaseId);
      await requireBusinessActor(client, businessCase.organization_id, actorUserId);
      const documentId = id("bcdoc");
      const versionId = id("bcdv");
      const documentResult = await client.query(
        `INSERT INTO business_case_documents
         (id,business_case_id,title,document_kind,status,created_by_user_id,created_at,updated_at)
         VALUES ($1,$2,$3,$4,'DRAFT',$5,$6,$6) RETURNING *`,
        [documentId, businessCase.id, normalizedTitle, normalizedKind, actorUserId, createdAt],
      );
      const versionResult = await client.query(
        `INSERT INTO business_case_document_versions
         (id,document_id,version_no,file_name,mime_type,size_bytes,content_sha256,storage_object_key,created_by_user_id,created_at)
         VALUES ($1,$2,1,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [versionId, documentId, versionMetadata.fileName, versionMetadata.mimeType, versionMetadata.sizeBytes,
          versionMetadata.contentSha256, storageKey, actorUserId, createdAt],
      );
      await insertBusinessEvent(client, { documentId, actorUserId, eventType: "CREATED", createdAt });
      await insertBusinessEvent(client, {
        documentId,
        actorUserId,
        eventType: "VERSION_ADDED",
        metadata: { versionId, versionNo: 1 },
        createdAt,
      });
      return { document: mapDocument(documentResult.rows[0]), version: mapVersion(versionResult.rows[0]) };
    });
  }

  async function addVersion({ documentId, actorUserId, fileName, mimeType, sizeBytes, contentSha256, storageObjectKey } = {}) {
    if (!String(documentId || "").trim() || !String(actorUserId || "").trim()) throw new Error("business_case_document_not_found");
    const metadata = validateBusinessCaseDocumentVersionMetadata({ fileName, mimeType, sizeBytes, contentSha256 });
    const storageKey = normalizeStorageObjectKey(storageObjectKey);
    const createdAt = now().toISOString();

    return withPostgresTransaction(pool, async (client) => {
      const document = await resolveDocument(client, documentId, { lock: true });
      if (!document || document.organization_status !== "ACTIVE" || !BUSINESS_CASE_MUTABLE_STATUSES.has(document.business_case_status)) {
        throw new Error("business_case_document_not_found");
      }
      await requireBusinessActor(client, document.organization_id, actorUserId);
      if (!canAddBusinessCaseDocumentVersion(document.status)) throw new Error("business_case_document_version_not_allowed");
      const versionNoResult = await client.query(
        "SELECT COALESCE(MAX(version_no),0)::integer AS version_no FROM business_case_document_versions WHERE document_id=$1",
        [document.id],
      );
      const versionNo = Number(versionNoResult.rows[0]?.version_no || 0) + 1;
      const versionId = id("bcdv");
      const result = await client.query(
        `INSERT INTO business_case_document_versions
         (id,document_id,version_no,file_name,mime_type,size_bytes,content_sha256,storage_object_key,created_by_user_id,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [versionId, document.id, versionNo, metadata.fileName, metadata.mimeType, metadata.sizeBytes,
          metadata.contentSha256, storageKey, actorUserId, createdAt],
      );
      await insertBusinessEvent(client, {
        documentId: document.id,
        actorUserId,
        eventType: "VERSION_ADDED",
        metadata: { versionId, versionNo },
        createdAt,
      });
      return mapVersion(result.rows[0]);
    });
  }

  async function transitionDocument({ documentId, actorUserId, toStatus } = {}) {
    if (!String(documentId || "").trim() || !String(actorUserId || "").trim()) throw new Error("business_case_document_not_found");
    const targetStatus = String(toStatus || "").trim().toUpperCase();
    const updatedAt = now().toISOString();
    return withPostgresTransaction(pool, async (client) => {
      const document = await resolveDocument(client, documentId, { lock: true });
      if (!document || document.organization_status !== "ACTIVE" || !BUSINESS_CASE_MUTABLE_STATUSES.has(document.business_case_status)) {
        throw new Error("business_case_document_not_found");
      }
      await requireBusinessActor(client, document.organization_id, actorUserId);
      if (!canTransitionBusinessCaseDocument(document.status, targetStatus)) throw new Error("business_case_document_transition_invalid");
      if (targetStatus === "IN_REVIEW") {
        const version = await client.query(
          "SELECT id,version_no FROM business_case_document_versions WHERE document_id=$1 ORDER BY version_no DESC LIMIT 1",
          [document.id],
        );
        if (!version.rows[0]) throw new Error("business_case_document_version_required");
        await insertBusinessEvent(client, {
          documentId: document.id,
          actorUserId,
          eventType: "SUBMITTED_FOR_REVIEW",
          metadata: { versionId: version.rows[0].id, versionNo: Number(version.rows[0].version_no) },
          createdAt: updatedAt,
        });
      } else if (targetStatus === "WITHDRAWN") {
        await insertBusinessEvent(client, { documentId: document.id, actorUserId, eventType: "WITHDRAWN", createdAt: updatedAt });
      }
      const result = await client.query(
        "UPDATE business_case_documents SET status=$1,updated_at=$2 WHERE id=$3 RETURNING *",
        [targetStatus, updatedAt, document.id],
      );
      return mapDocument(result.rows[0]);
    });
  }

  async function listForBusinessCase({ businessCaseId, actorUserId } = {}) {
    if (!String(businessCaseId || "").trim() || !String(actorUserId || "").trim()) throw new Error("business_case_document_not_found");
    return withPostgresTransaction(pool, async (client) => {
      const businessCase = await resolveBusinessCase(client, businessCaseId);
      await requireBusinessActor(client, businessCase.organization_id, actorUserId);
      const result = await client.query(
        "SELECT * FROM business_case_documents WHERE business_case_id=$1 ORDER BY updated_at DESC,id DESC",
        [businessCase.id],
      );
      return result.rows.map(mapDocument);
    });
  }

  async function listVersionsForBusiness({ documentId, actorUserId } = {}) {
    if (!String(documentId || "").trim() || !String(actorUserId || "").trim()) throw new Error("business_case_document_not_found");
    return withPostgresTransaction(pool, async (client) => {
      const document = await resolveDocument(client, documentId);
      if (!document || document.organization_status !== "ACTIVE") throw new Error("business_case_document_not_found");
      await requireBusinessActor(client, document.organization_id, actorUserId);
      const result = await client.query(
        "SELECT * FROM business_case_document_versions WHERE document_id=$1 ORDER BY version_no DESC",
        [document.id],
      );
      return result.rows.map(mapVersion);
    });
  }

  async function listReviewsForBusiness({ documentId, actorUserId } = {}) {
    if (!String(documentId || "").trim() || !String(actorUserId || "").trim()) throw new Error("business_case_document_not_found");
    return withPostgresTransaction(pool, async (client) => {
      const document = await resolveDocument(client, documentId);
      if (!document || document.organization_status !== "ACTIVE") throw new Error("business_case_document_not_found");
      await requireBusinessActor(client, document.organization_id, actorUserId);
      const result = await client.query(
        "SELECT * FROM business_case_document_reviews WHERE document_id=$1 ORDER BY created_at ASC,id ASC",
        [document.id],
      );
      return result.rows.map(mapReview);
    });
  }

  async function listEventsForBusiness({ documentId, actorUserId } = {}) {
    if (!String(documentId || "").trim() || !String(actorUserId || "").trim()) throw new Error("business_case_document_not_found");
    return withPostgresTransaction(pool, async (client) => {
      const document = await resolveDocument(client, documentId);
      if (!document || document.organization_status !== "ACTIVE") throw new Error("business_case_document_not_found");
      await requireBusinessActor(client, document.organization_id, actorUserId);
      const result = await client.query(
        "SELECT * FROM business_case_document_events WHERE document_id=$1 ORDER BY created_at ASC,id ASC",
        [document.id],
      );
      return result.rows.map(mapEvent);
    });
  }

  async function listForAdvisor({ shareGrantId, advisorUserId } = {}) {
    if (!String(shareGrantId || "").trim() || !String(advisorUserId || "").trim()) throw new Error("external_advisor_documents_not_found");
    return withPostgresTransaction(pool, async (client) => {
      const { grant } = await requireAdvisorGrant(client, {
        shareGrantId,
        advisorUserId,
        permission: "document.read",
        now: now(),
      });
      const result = await client.query(
        `SELECT * FROM business_case_documents
         WHERE business_case_id=$1
         ORDER BY updated_at DESC,id DESC`,
        [grant.resource_id],
      );
      return result.rows.filter((row) => isBusinessCaseDocumentAdvisorReadable(row.status)).map(mapDocument);
    });
  }

  async function listVersionsForAdvisor({ shareGrantId, advisorUserId, documentId } = {}) {
    if (![shareGrantId, advisorUserId, documentId].every((value) => String(value || "").trim())) {
      throw new Error("external_advisor_documents_not_found");
    }
    return withPostgresTransaction(pool, async (client) => {
      const { grant } = await requireAdvisorGrant(client, {
        shareGrantId,
        advisorUserId,
        permission: "document.read",
        now: now(),
      });
      const document = await resolveDocument(client, documentId);
      if (!document || document.business_case_id !== grant.resource_id || document.organization_id !== grant.organization_id
        || !isBusinessCaseDocumentAdvisorReadable(document.status)) {
        throw new Error("external_advisor_documents_not_found");
      }
      const result = await client.query(
        "SELECT * FROM business_case_document_versions WHERE document_id=$1 ORDER BY version_no DESC",
        [document.id],
      );
      return result.rows.map(mapVersion);
    });
  }

  async function reviewDocument({ shareGrantId, advisorUserId, documentId, versionId, decision, note = "" } = {}) {
    if (![shareGrantId, advisorUserId, documentId, versionId].every((value) => String(value || "").trim())) {
      throw new Error("external_advisor_documents_not_found");
    }
    const review = normalizeBusinessCaseDocumentReview({ decision, note });
    const reviewedAtValue = now();
    const reviewedAt = reviewedAtValue.toISOString();
    return withPostgresTransaction(pool, async (client) => {
      const { grant } = await requireAdvisorGrant(client, {
        shareGrantId,
        advisorUserId,
        permission: "document.review",
        now: reviewedAtValue,
      });
      const document = await resolveDocument(client, documentId, { lock: true });
      if (!document || document.business_case_id !== grant.resource_id || document.organization_id !== grant.organization_id
        || document.status !== "IN_REVIEW") {
        throw new Error("external_advisor_documents_not_found");
      }
      const versionResult = await client.query(
        `SELECT * FROM business_case_document_versions
         WHERE id=$1 AND document_id=$2`,
        [versionId, document.id],
      );
      const version = versionResult.rows[0];
      if (!version) throw new Error("external_advisor_documents_not_found");
      const latest = await client.query(
        "SELECT id FROM business_case_document_versions WHERE document_id=$1 ORDER BY version_no DESC LIMIT 1",
        [document.id],
      );
      if (latest.rows[0]?.id !== version.id) throw new Error("external_advisor_document_version_not_current");

      const result = await client.query(
        `INSERT INTO business_case_document_reviews
         (id,document_id,version_id,share_grant_id,reviewer_user_id,decision,review_note,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [id("bcdr"), document.id, version.id, grant.id, advisorUserId, review.decision, review.note, reviewedAt],
      );
      const targetStatus = review.decision === "APPROVED" ? "APPROVED" : "CHANGES_REQUESTED";
      await client.query(
        "UPDATE business_case_documents SET status=$1,updated_at=$2 WHERE id=$3",
        [targetStatus, reviewedAt, document.id],
      );
      await client.query(
        `INSERT INTO business_case_document_events
         (id,document_id,actor_user_id,actor_type,share_grant_id,event_type,metadata,created_at)
         VALUES ($1,$2,$3,'ADVISOR',$4,$5,$6,$7)`,
        [id("bcde"), document.id, advisorUserId, grant.id,
          review.decision === "APPROVED" ? "REVIEW_APPROVED" : "REVIEW_CHANGES_REQUESTED",
          JSON.stringify({ reviewId: result.rows[0].id, versionId: version.id, versionNo: Number(version.version_no) }), reviewedAt],
      );
      return mapReview(result.rows[0]);
    }).catch((error) => {
      if (String(error?.message || "").startsWith("business_case_document_")) {
        if (error.message === "business_case_document_review_note_required" || error.message === "business_case_document_review_note_too_long"
          || error.message === "business_case_document_review_decision_invalid") throw error;
        throw new Error("external_advisor_documents_not_found");
      }
      throw error;
    });
  }

  return {
    createDocument,
    addVersion,
    transitionDocument,
    listForBusinessCase,
    listVersionsForBusiness,
    listReviewsForBusiness,
    listEventsForBusiness,
    listForAdvisor,
    listVersionsForAdvisor,
    reviewDocument,
  };
}
