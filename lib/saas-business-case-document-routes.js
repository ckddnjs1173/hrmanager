import express from "express";
import crypto from "node:crypto";
import { getSaasRuntimeConfig } from "./saas-runtime-config.js";
import { findSessionByRawToken } from "./saas-auth-repo.js";
import { createBusinessCaseDocumentService } from "./business-case-document-service.js";

function parseCookies(req) {
  const header = String(req.headers.cookie || "");
  const cookies = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

function csrfFor(sessionId, secret) {
  return crypto.createHmac("sha256", secret).update(`csrf:${sessionId}`).digest("base64url");
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function errorCode(error) {
  const code = String(error?.message || error || "internal_error");
  return /^[a-z0-9_:-]+$/i.test(code) ? code : "internal_error";
}

const BAD_REQUEST = new Set([
  "business_case_document_title_required",
  "business_case_document_title_too_long",
  "business_case_document_type_required",
  "business_case_document_type_too_long",
  "business_case_document_type_invalid",
  "business_case_document_content_required",
  "business_case_document_content_too_long",
  "business_case_document_review_decision_invalid",
  "business_case_document_review_body_required",
  "business_case_document_review_body_too_long",
]);
const NOT_FOUND = new Set([
  "business_case_document_not_found",
  "external_advisor_documents_not_found",
]);
const CONFLICT = new Set(["business_case_document_case_not_mutable"]);

function errorStatus(error) {
  const code = errorCode(error);
  if (NOT_FOUND.has(code)) return 404;
  if (CONFLICT.has(code)) return 409;
  if (BAD_REQUEST.has(code)) return 400;
  if (code === "csrf_invalid") return 403;
  return 500;
}

export function createSaasBusinessCaseDocumentRouter({ env = process.env, rateLimit, service = null } = {}) {
  if (typeof rateLimit !== "function") throw new Error("saas_business_case_document_rate_limit_required");
  const router = express.Router();
  let documentService = service;
  const getService = () => {
    if (!documentService) documentService = createBusinessCaseDocumentService();
    return documentService;
  };

  router.use((req, res, next) => {
    let config;
    try { config = getSaasRuntimeConfig(env); }
    catch (error) { return res.status(503).json({ error: errorCode(error) }); }
    if (!config.enabled) return res.status(404).json({ error: "saas_not_enabled" });
    req.saasConfig = config;
    next();
  });

  async function requireAuth(req, res, next) {
    const rawToken = parseCookies(req)[req.saasConfig.cookieName] || "";
    const session = await findSessionByRawToken(rawToken);
    if (!session) return res.status(401).json({ error: "authentication_required" });
    req.saasSession = session;
    next();
  }

  function requireCsrf(req, res, next) {
    const expected = csrfFor(req.saasSession?.sessionId, req.saasConfig.sessionSecret);
    if (!safeEqual(req.get("x-csrf-token"), expected)) return res.status(403).json({ error: "csrf_invalid" });
    next();
  }

  function send(res, fn, { created = false } = {}) {
    return Promise.resolve().then(fn)
      .then((value) => res.status(created ? 201 : 200).json(value))
      .catch((error) => res.status(errorStatus(error)).json({ error: errorCode(error) }));
  }

  router.post(
    "/organizations/:organizationId/business-cases/:caseId/documents",
    requireAuth,
    requireCsrf,
    rateLimit({ max: 30 }),
    (req, res) => send(res, () => getService().createDocument({
      organizationId: req.params.organizationId,
      caseId: req.params.caseId,
      actorUserId: req.saasSession.userId,
      title: req.body?.title,
      documentType: req.body?.documentType,
      contentText: req.body?.contentText,
    }), { created: true }),
  );

  router.get(
    "/organizations/:organizationId/business-cases/:caseId/documents",
    requireAuth,
    (req, res) => send(res, () => getService().listDocuments({
      organizationId: req.params.organizationId,
      caseId: req.params.caseId,
      actorUserId: req.saasSession.userId,
    })),
  );

  router.post(
    "/business-case-documents/:documentId/versions",
    requireAuth,
    requireCsrf,
    rateLimit({ max: 30 }),
    (req, res) => send(res, () => getService().createVersion({
      documentId: req.params.documentId,
      actorUserId: req.saasSession.userId,
      contentText: req.body?.contentText,
    }), { created: true }),
  );

  router.get(
    "/organizations/:organizationId/business-cases/:caseId/documents/:documentId/versions",
    requireAuth,
    (req, res) => send(res, () => getService().listVersions({
      organizationId: req.params.organizationId,
      caseId: req.params.caseId,
      documentId: req.params.documentId,
      actorUserId: req.saasSession.userId,
    })),
  );

  router.get(
    "/organizations/:organizationId/business-cases/:caseId/document-versions/:documentVersionId/reviews",
    requireAuth,
    (req, res) => send(res, () => getService().listBusinessReviews({
      organizationId: req.params.organizationId,
      caseId: req.params.caseId,
      documentVersionId: req.params.documentVersionId,
      actorUserId: req.saasSession.userId,
    })),
  );

  router.get(
    "/advisor/share-grants/:grantId/documents",
    requireAuth,
    (req, res) => send(res, () => getService().listAdvisorDocuments({
      grantId: req.params.grantId,
      actorUserId: req.saasSession.userId,
    })),
  );

  router.get(
    "/advisor/share-grants/:grantId/document-versions/:documentVersionId/reviews",
    requireAuth,
    (req, res) => send(res, () => getService().listAdvisorReviews({
      grantId: req.params.grantId,
      documentVersionId: req.params.documentVersionId,
      actorUserId: req.saasSession.userId,
    })),
  );

  router.post(
    "/advisor/share-grants/:grantId/document-versions/:documentVersionId/reviews",
    requireAuth,
    requireCsrf,
    rateLimit({ max: 60 }),
    (req, res) => send(res, () => getService().createAdvisorReview({
      grantId: req.params.grantId,
      documentVersionId: req.params.documentVersionId,
      actorUserId: req.saasSession.userId,
      decision: req.body?.decision,
      body: req.body?.body,
    }), { created: true }),
  );

  return router;
}
