import { getWageLegalContext, listMinimumWageRules, WAGE_LEGAL_BASELINE } from "./legal-rules.js";
import { DISMISSAL_SOURCES, getDismissalLegalContext } from "./dismissal-rules.js";
import { RETIREMENT_SOURCES, getRetirementLegalContext } from "./retirement-rules.js";
import { WORKTIME_SOURCES, getWorktimeLegalContext } from "./worktime-rules.js";
import { ANNUAL_LEAVE_SOURCES, getAnnualLeaveLegalContext } from "./annual-leave-rules.js";

function uniqueSources(items) {
  const byId = new Map();
  for (const source of items.flat().filter(Boolean)) {
    if (!source?.id) continue;
    const existing = byId.get(source.id);
    if (!existing) {
      byId.set(source.id, source);
      continue;
    }
    if (existing.url !== source.url || existing.authority !== source.authority) {
      throw new Error(`conflicting legal source metadata: ${source.id}`);
    }
  }
  return [...byId.values()];
}

function objectSources(sourceObject) {
  return Object.values(sourceObject || {}).filter((source) => source?.id);
}

function wageSources() {
  return uniqueSources([
    listMinimumWageRules().map((rule) => rule.source),
    WAGE_LEGAL_BASELINE.settlementAfterEmploymentEnds?.source,
    WAGE_LEGAL_BASELINE.delayInterestCurrent?.source,
    WAGE_LEGAL_BASELINE.delayInterestCurrent?.rateSource,
    WAGE_LEGAL_BASELINE.premiumCurrent?.source,
    WAGE_LEGAL_BASELINE.premiumCurrent?.workplaceScopeSource,
  ]);
}

function domain(definition) {
  return Object.freeze({ ...definition, sources: Object.freeze(uniqueSources(definition.sources)) });
}

export const LEGAL_DOMAIN_REGISTRY = Object.freeze([
  domain({ id: "wage", label: "임금체불", getContext: getWageLegalContext, sources: wageSources() }),
  domain({ id: "dismissal", label: "해고·권고사직", getContext: getDismissalLegalContext, sources: objectSources(DISMISSAL_SOURCES) }),
  domain({ id: "retirement", label: "퇴직금·퇴직연금", getContext: getRetirementLegalContext, sources: objectSources(RETIREMENT_SOURCES) }),
  domain({ id: "worktime", label: "근로시간·수당", getContext: getWorktimeLegalContext, sources: objectSources(WORKTIME_SOURCES) }),
  domain({ id: "annual_leave", label: "연차유급휴가·미사용수당", getContext: getAnnualLeaveLegalContext, sources: objectSources(ANNUAL_LEAVE_SOURCES) }),
]);

export function getLegalDomain(id) {
  return LEGAL_DOMAIN_REGISTRY.find((domain) => domain.id === id) || null;
}

export function listCanonicalLegalSources() {
  return uniqueSources(LEGAL_DOMAIN_REGISTRY.map((domain) => domain.sources));
}

export function normalizeLegalSource(source) {
  if (!source?.id) return null;
  return {
    id: source.id,
    authority: source.authority || null,
    title: source.title || null,
    article: source.article || null,
    url: source.url || null,
    verifiedAt: source.verifiedAt || null,
  };
}

export function validateLegalRegistry() {
  const errors = [];
  const ids = LEGAL_DOMAIN_REGISTRY.map((domain) => domain.id);
  if (new Set(ids).size !== ids.length) errors.push("duplicate legal domain id");

  for (const domain of LEGAL_DOMAIN_REGISTRY) {
    if (typeof domain.getContext !== "function") errors.push(`${domain.id}: missing getContext`);
    if (!domain.sources.length) errors.push(`${domain.id}: no registered sources`);
    for (const source of domain.sources) {
      if (!source.id) errors.push(`${domain.id}: source without id`);
      if (!source.authority) errors.push(`${source.id}: authority missing`);
      if (!source.title) errors.push(`${source.id}: title missing`);
      if (!source.url || !/^https:\/\//.test(source.url)) errors.push(`${source.id}: https url missing`);
      if (!source.verifiedAt || !/^\d{4}-\d{2}-\d{2}$/.test(source.verifiedAt)) errors.push(`${source.id}: verifiedAt missing`);
    }
  }

  try {
    listCanonicalLegalSources();
  } catch (error) {
    errors.push(error?.message || String(error));
  }

  return { ok: errors.length === 0, errors };
}
