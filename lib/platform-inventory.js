import { CASE_DOMAIN_REGISTRY } from "./case-domain-registry.js";
import { CALCULATION_REGISTRY } from "./calculation-registry.js";
import { DOCUMENT_PACK_REGISTRY, DOCUMENT_REGISTRY, validateDocumentRegistry } from "./document-registry.js";

// Bundle 1 freezes the product assets that already exist before SaaS expansion.
// Future Worker / Business / Pro work should reuse or migrate these capabilities
// rather than silently deleting and rebuilding them under new names.

export const PLATFORM_CAPABILITIES = Object.freeze([
  Object.freeze({ id: "ai.chat", futureRole: "case-copilot" }),
  Object.freeze({ id: "ai.summary", futureRole: "case-handoff" }),
  Object.freeze({ id: "guide.worker", futureRole: "acquisition" }),
  Object.freeze({ id: "guide.employer", futureRole: "business-acquisition" }),
  Object.freeze({ id: "expert.directory", futureRole: "expert-directory" }),
  Object.freeze({ id: "expert.booking", futureRole: "secure-handoff" }),
  Object.freeze({ id: "expert.secure_summary", futureRole: "secure-handoff" }),
  Object.freeze({ id: "admin.operations", futureRole: "operations-console" }),
  Object.freeze({ id: "partner.workspace", futureRole: "insaya-pro-seed" }),
]);

export function getPlatformInventory() {
  return {
    coreCases: CASE_DOMAIN_REGISTRY.map(({ id, label, uiPath }) => ({ id, label, uiPath })),
    calculators: CALCULATION_REGISTRY.map(({ id, runtime, migration }) => ({ id, runtime, migration })),
    documents: DOCUMENT_REGISTRY.map(({ id, title, group, standard }) => ({ id, title, group, standard })),
    documentPacks: DOCUMENT_PACK_REGISTRY.map(({ id, title, site, documents }) => ({ id, title, site, documents: [...documents] })),
    capabilities: PLATFORM_CAPABILITIES.map((item) => ({ ...item })),
  };
}

export function validatePlatformInventory() {
  const errors = [];
  const inventory = getPlatformInventory();
  const expectedCases = ["annual_leave", "dismissal", "retirement", "wage", "worktime"];
  const actualCases = inventory.coreCases.map((item) => item.id).sort();

  if (JSON.stringify(actualCases) !== JSON.stringify(expectedCases)) {
    errors.push(`Core Case inventory changed: ${actualCases.join(",")}`);
  }
  if (inventory.calculators.length !== 27) errors.push(`calculator inventory changed: ${inventory.calculators.length}`);

  const documentValidation = validateDocumentRegistry();
  if (!documentValidation.ok) errors.push(...documentValidation.errors);

  const capabilityIds = inventory.capabilities.map((item) => item.id);
  if (new Set(capabilityIds).size !== capabilityIds.length) errors.push("duplicate platform capability id");

  return { ok: errors.length === 0, errors, inventory };
}
