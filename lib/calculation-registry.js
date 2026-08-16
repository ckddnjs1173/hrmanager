// Stable inventory for the 27 calculator assets already shipped by Insaya.
// The legacy calculator implementation still lives in index.html during the
// incremental migration. This registry prevents silent calculator loss or ID
// drift while the runtime is promoted into a shared Calculation Engine.

const IDS = [
  "annual",
  "annualdays",
  "attendance",
  "audit",
  "average",
  "convert",
  "daytax",
  "dcpension",
  "delay",
  "headcount",
  "holiday",
  "injurypay",
  "insur4",
  "laborcost",
  "matleave",
  "minwage",
  "net",
  "notice",
  "ordinary",
  "ot",
  "pkgwage",
  "prorate",
  "retiretax",
  "severance",
  "unemploy",
  "usagepromote",
  "withtax",
];

export const CALCULATION_REGISTRY = Object.freeze(
  IDS.map((id) => Object.freeze({
    id,
    runtime: "legacy-index",
    migration: "shared-engine-pending",
  })),
);

export function listCalculationIds() {
  return CALCULATION_REGISTRY.map((item) => item.id);
}

export function validateCalculationRegistry(legacyMeta = {}) {
  const errors = [];
  const ids = listCalculationIds();
  if (ids.length !== 27) errors.push(`calculator count: expected 27, got ${ids.length}`);
  if (new Set(ids).size !== ids.length) errors.push("duplicate calculator id");

  const legacyIds = Object.keys(legacyMeta || {}).sort();
  const registryIds = [...ids].sort();
  if (JSON.stringify(legacyIds) !== JSON.stringify(registryIds)) {
    const missingFromRegistry = legacyIds.filter((id) => !registryIds.includes(id));
    const missingFromLegacy = registryIds.filter((id) => !legacyIds.includes(id));
    if (missingFromRegistry.length) errors.push(`unregistered legacy calculators: ${missingFromRegistry.join(",")}`);
    if (missingFromLegacy.length) errors.push(`registry calculators missing legacy metadata: ${missingFromLegacy.join(",")}`);
  }

  return { ok: errors.length === 0, errors };
}
