import { cases } from "./case-repo.js";
import {
  WAGE_CASE_TYPE,
  createInitialWageCase,
  getWageIntakeState,
  normalizeWageFacts,
} from "./wage-intake.js";
import { buildWageActions, getWageNextAction } from "./wage-actions.js";
import { getWageLegalContext } from "./legal-rules.js";
import { calculateWageMoney } from "./wage-money.js";

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
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

function deriveInsights(facts, asOfDate = todayIso()) {
  const legal = getWageLegalContext(facts, { asOfDate });
  const money = calculateWageMoney(facts, { legal, asOfDate });
  return { legal, money };
}

function toCaseUpdate(existingCase, facts) {
  const generated = createInitialWageCase(facts);
  const { legal, money } = deriveInsights(generated.facts);

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
    calculations: money.calculations,
    evidence: generated.evidence,
    actions: buildWageActions(generated.facts),
    legal_sources: legal.sources,
    meta: {
      ...(isObject(existingCase?.meta) ? existingCase.meta : {}),
      ...generated.meta,
      legalReferenceDate: legal.referenceDate,
      legalVerifiedAt: legal.verifiedAt,
      moneyStatus: money.status,
      moneyAsOfDate: money.asOfDate,
    },
  };
}

function buildResult(caseRecord) {
  const intake = getWageIntakeState(caseRecord.facts);
  const { legal, money } = deriveInsights(caseRecord.facts);
  const nextAction =
    (Array.isArray(caseRecord.actions) && caseRecord.actions[0]) ||
    getWageNextAction(caseRecord.facts);

  return {
    case: caseRecord,
    intake,
    money,
    legal,
    nextAction,
  };
}

export function createWageIntakeCase(facts = {}) {
  const record = createInitialWageCase(facts);
  const { legal, money } = deriveInsights(record.facts);
  record.calculations = money.calculations;
  record.legal_sources = legal.sources;
  record.actions = buildWageActions(record.facts);
  record.meta = {
    ...(isObject(record.meta) ? record.meta : {}),
    legalReferenceDate: legal.referenceDate,
    legalVerifiedAt: legal.verifiedAt,
    moneyStatus: money.status,
    moneyAsOfDate: money.asOfDate,
  };
  const created = cases.insert(record, "api:wage-intake");

  return buildResult(created);
}

export function getWageIntakeCase(id) {
  const found = cases.get(id);
  if (!found) return { error: "case_not_found" };
  if (found.case_type !== WAGE_CASE_TYPE) {
    return { error: "case_type_mismatch", case: found };
  }

  return buildResult(found);
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

  return buildResult(updated);
}
