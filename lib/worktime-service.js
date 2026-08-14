import { cases } from "./case-repo.js";
import { renderDoc } from "./docs.js";
import { WORKTIME_CASE_TYPE, createInitialWorktimeCase, getWorktimeIntakeState, normalizeWorktimeFacts } from "./worktime-intake.js";
import { buildWorktimeActions, getWorktimeNextAction } from "./worktime-actions.js";
import { getWorktimeLegalContext } from "./worktime-rules.js";
import { buildWorktimeDocuments, buildWorktimeProcedures } from "./worktime-resources.js";
import { buildWorktimeCaseReport } from "./worktime-report.js";

function isObject(value) { return !!value && typeof value === "object" && !Array.isArray(value); }

function mergeFacts(existingFacts = {}, patch = {}) {
  const safeExisting = isObject(existingFacts) ? existingFacts : {};
  const safePatch = isObject(patch) ? patch : {};
  const merged = { ...safeExisting, ...safePatch };
  if ("evidence" in safePatch) {
    merged.evidence = { ...(isObject(safeExisting.evidence) ? safeExisting.evidence : {}), ...(isObject(safePatch.evidence) ? safePatch.evidence : {}) };
  }
  return normalizeWorktimeFacts(merged);
}

function derive(facts) {
  const legal = getWorktimeLegalContext(facts);
  const documents = buildWorktimeDocuments(facts, legal);
  const procedures = buildWorktimeProcedures(facts, legal);
  const calculations = legal.premium ? [{ id: "worktime.premium_pay", type: "working_time_premium", ...legal.premium }] : [];
  return { legal, documents, procedures, calculations };
}

function toCaseUpdate(existingCase, facts) {
  const generated = createInitialWorktimeCase(facts);
  const derived = derive(generated.facts);
  return {
    status: generated.status,
    event_date: generated.event_date,
    period_start: generated.period_start,
    period_end: generated.period_end,
    facts: generated.facts,
    missing_facts: generated.missing_facts,
    issues: generated.issues,
    evidence: generated.evidence,
    calculations: derived.calculations,
    legal_sources: derived.legal.sources,
    documents: derived.documents,
    actions: buildWorktimeActions(generated.facts),
    meta: {
      ...(isObject(existingCase?.meta) ? existingCase.meta : {}),
      ...generated.meta,
      legalReferenceDate: derived.legal.referenceDate,
      legalVerifiedAt: derived.legal.verifiedAt,
      premiumStatus: derived.legal.premium?.status,
    },
  };
}

function buildResult(caseRecord) {
  const intake = getWorktimeIntakeState(caseRecord.facts);
  const { legal, documents, procedures } = derive(caseRecord.facts);
  const nextAction = (Array.isArray(caseRecord.actions) && caseRecord.actions[0]) || getWorktimeNextAction(caseRecord.facts);
  return { case: caseRecord, intake, legal, documents, procedures, nextAction };
}

export function createWorktimeCase(facts = {}) {
  const record = createInitialWorktimeCase(facts);
  const derived = derive(record.facts);
  record.calculations = derived.calculations;
  record.legal_sources = derived.legal.sources;
  record.documents = derived.documents;
  record.actions = buildWorktimeActions(record.facts);
  record.meta = { ...(isObject(record.meta) ? record.meta : {}), legalReferenceDate: derived.legal.referenceDate, legalVerifiedAt: derived.legal.verifiedAt, premiumStatus: derived.legal.premium?.status };
  return buildResult(cases.insert(record, "api:worktime-intake"));
}

export function getWorktimeCase(id) {
  const found = cases.get(id);
  if (!found) return { error: "case_not_found" };
  if (found.case_type !== WORKTIME_CASE_TYPE) return { error: "case_type_mismatch", case: found };
  return buildResult(found);
}

export function updateWorktimeCase(id, factsPatch = {}) {
  const current = cases.get(id);
  if (!current) return { error: "case_not_found" };
  if (current.case_type !== WORKTIME_CASE_TYPE) return { error: "case_type_mismatch", case: current };
  const facts = mergeFacts(current.facts, factsPatch);
  const updated = cases.update(id, toCaseUpdate(current, facts), "api:worktime-intake");
  return updated ? buildResult(updated) : { error: "case_not_found" };
}

export function renderWorktimeDocument(id, templateKey, extraValues = {}) {
  const result = getWorktimeCase(id);
  if (result?.error) return result;
  const spec = result.documents.find((item) => item.templateKey === templateKey);
  if (!spec) return { error: "document_not_supported" };
  const values = { ...spec.prefill, ...(isObject(extraValues) ? extraValues : {}) };
  const rendered = renderDoc(templateKey, values);
  return rendered ? { templateKey, values, document: rendered, caseId: id } : { error: "document_not_found" };
}

export function getWorktimeCaseReport(id) {
  const result = getWorktimeCase(id);
  return result?.error ? result : buildWorktimeCaseReport(result);
}
