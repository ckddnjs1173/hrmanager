import { DOC_PACKS, DOC_TEMPLATES } from "./docs.js";

// The Document Center already has a real canonical server implementation in
// docs.js. This registry promotes that existing source into a platform contract
// instead of duplicating templates for Worker, Business, or Pro.

export const DOCUMENT_REGISTRY = Object.freeze(
  Object.entries(DOC_TEMPLATES).map(([id, template]) => Object.freeze({
    id,
    title: template.title,
    group: template.group,
    standard: !!template.std,
    fields: Object.freeze((template.fields || []).map((field) => Object.freeze({ ...field }))),
  })),
);

export const DOCUMENT_PACK_REGISTRY = Object.freeze(
  DOC_PACKS.map((pack) => Object.freeze({
    id: pack.key,
    title: pack.title,
    site: pack.site,
    documents: Object.freeze([...pack.docs]),
  })),
);

export function validateDocumentRegistry() {
  const errors = [];
  const documentIds = DOCUMENT_REGISTRY.map((item) => item.id);
  const packIds = DOCUMENT_PACK_REGISTRY.map((item) => item.id);
  const documentSet = new Set(documentIds);

  if (documentIds.length !== 24) errors.push(`document count: expected 24, got ${documentIds.length}`);
  if (packIds.length !== 7) errors.push(`document pack count: expected 7, got ${packIds.length}`);
  if (documentSet.size !== documentIds.length) errors.push("duplicate document id");
  if (new Set(packIds).size !== packIds.length) errors.push("duplicate document pack id");

  for (const item of DOCUMENT_REGISTRY) {
    const source = DOC_TEMPLATES[item.id];
    if (!item.title) errors.push(`${item.id}: title missing`);
    if (!item.group) errors.push(`${item.id}: group missing`);
    if (!source || typeof source.html !== "function") errors.push(`${item.id}: renderer missing`);
    if (!Array.isArray(source?.fields)) errors.push(`${item.id}: fields missing`);
  }

  for (const pack of DOCUMENT_PACK_REGISTRY) {
    if (!pack.documents.length) errors.push(`${pack.id}: empty document pack`);
    for (const documentId of pack.documents) {
      if (!documentSet.has(documentId)) errors.push(`${pack.id}: unknown document ${documentId}`);
    }
  }

  return { ok: errors.length === 0, errors };
}
