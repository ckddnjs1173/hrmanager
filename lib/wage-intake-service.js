import { cases } from "./case-repo.js";
import {
  WAGE_CASE_TYPE,
  createInitialWageCase,
  getWageIntakeState,
  normalizeWageFacts,
} from "./wage-intake.js";

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function mergeFacts(existingFacts = {}, patch = {}) {
  const safeExisting = isObject(existingFacts) ? existingFacts : {};
  const safePatch = isObject(patch) ? patch : {};

  const merged = {
    ...safeExisting,
    ...safePatch,
  };

  if ("evidence" in safePatch) {
    merged.evidence = {
      ...(isObject(safeExisting.evidence) ? safeExisting.evidence : {}),
      ...(isObject(safePatch.evidence) ? safePatch.evidence : {}),
    };
  }

  return normalizeWageFacts(merged);
}

function toCaseUpdate(existingCase, facts) {
  const generated = createInitialWageCase(facts);

  return {
    status: generated.status,
    event_date: generated.event_date,
    period_start: generated.period_start,
    period_end: generated.period_end,
    employment_start_date: generated.employment_start_date,
    employment_end_date: generated.employment_end_date,
    facts: generated.facts,
    missing_facts: generated.missing_facts,
    issues: generated.issues,
    evidence: generated.evidence,
    meta: {
      ...(isObject(existingCase?.meta) ? existingCase.meta : {}),
      ...generated.meta,
    },
  };
}

export function createWageIntakeCase(facts = {}) {
  const record = createInitialWageCase(facts);
  const created = cases.insert(record, "api:wage-intake");

  return {
    case: created,
    intake: getWageIntakeState(created.facts),
  };
}

export function getWageIntakeCase(id) {
  const found = cases.get(id);
  if (!found) return { error: "case_not_found" };
  if (found.case_type !== WAGE_CASE_TYPE) {
    return { error: "case_type_mismatch", case: found };
  }

  return {
    case: found,
    intake: getWageIntakeState(found.facts),
  };
}

export function updateWageIntakeCase(id, factsPatch = {}) {
  const current = cases.get(id);
  if (!current) return { error: "case_not_found" };
  if (current.case_type !== WAGE_CASE_TYPE) {
    return { error: "case_type_mismatch", case: current };
  }

  const facts = mergeFacts(current.facts, factsPatch);
  const updated = cases.update(
    id,
    toCaseUpdate(current, facts),
    "api:wage-intake"
  );

  if (!updated) return { error: "case_not_found" };

  return {
    case: updated,
    intake: getWageIntakeState(updated.facts),
  };
}
