import { cases } from "./case-repo.js";
import { renderDoc } from "./docs.js";
import { ANNUAL_LEAVE_CASE_TYPE, createInitialAnnualLeaveCase, getAnnualLeaveIntakeState, normalizeAnnualLeaveFacts } from "./annual-leave-intake.js";
import { buildAnnualLeaveActions, getAnnualLeaveNextAction } from "./annual-leave-actions.js";
import { getAnnualLeaveLegalContext } from "./annual-leave-rules.js";
import { buildAnnualLeaveDocuments, buildAnnualLeaveProcedures } from "./annual-leave-resources.js";
import { buildAnnualLeaveCaseReport } from "./annual-leave-report.js";

function isObject(value){return !!value&&typeof value==="object"&&!Array.isArray(value);}
function mergeFacts(existingFacts={},patch={}){
  const safeExisting=isObject(existingFacts)?existingFacts:{};
  const safePatch=isObject(patch)?patch:{};
  const merged={...safeExisting,...safePatch};
  if("evidence" in safePatch) merged.evidence={...(isObject(safeExisting.evidence)?safeExisting.evidence:{}),...(isObject(safePatch.evidence)?safePatch.evidence:{})};
  return normalizeAnnualLeaveFacts(merged);
}
function derive(facts){
  const legal=getAnnualLeaveLegalContext(facts);
  const documents=buildAnnualLeaveDocuments(facts,legal);
  const procedures=buildAnnualLeaveProcedures(facts,legal);
  const calculations=[
    {id:"annual_leave.entitlement",type:"annual_leave_entitlement",...legal.entitlement},
    {id:"annual_leave.allowance",type:"annual_leave_allowance",...legal.money},
  ];
  return {legal,documents,procedures,calculations};
}
function toCaseUpdate(existingCase,facts){
  const generated=createInitialAnnualLeaveCase(facts);
  const derived=derive(generated.facts);
  return {
    status:generated.status,event_date:generated.event_date,period_start:generated.period_start,period_end:generated.period_end,
    employment_start_date:generated.employment_start_date,employment_end_date:generated.employment_end_date,
    facts:generated.facts,missing_facts:generated.missing_facts,issues:generated.issues,evidence:generated.evidence,
    calculations:derived.calculations,legal_sources:derived.legal.sources,documents:derived.documents,actions:buildAnnualLeaveActions(generated.facts),
    meta:{...(isObject(existingCase?.meta)?existingCase.meta:{}),...generated.meta,legalReferenceDate:derived.legal.referenceDate,legalVerifiedAt:derived.legal.verifiedAt,annualLeaveMoneyStatus:derived.legal.money?.status,annualLeaveRuleVersion:derived.legal.legalVersion?.id || null},
  };
}
function buildResult(caseRecord){
  const intake=getAnnualLeaveIntakeState(caseRecord.facts);
  const {legal,documents,procedures}=derive(caseRecord.facts);
  const nextAction=(Array.isArray(caseRecord.actions)&&caseRecord.actions[0])||getAnnualLeaveNextAction(caseRecord.facts);
  return {case:caseRecord,intake,legal,documents,procedures,nextAction};
}

export function createAnnualLeaveCase(facts={}){
  const record=createInitialAnnualLeaveCase(facts);
  const derived=derive(record.facts);
  record.calculations=derived.calculations;record.legal_sources=derived.legal.sources;record.documents=derived.documents;record.actions=buildAnnualLeaveActions(record.facts);
  record.meta={...(isObject(record.meta)?record.meta:{}),legalReferenceDate:derived.legal.referenceDate,legalVerifiedAt:derived.legal.verifiedAt,annualLeaveMoneyStatus:derived.legal.money?.status,annualLeaveRuleVersion:derived.legal.legalVersion?.id || null};
  return buildResult(cases.insert(record,"api:annual-leave-intake"));
}
export function getAnnualLeaveCase(id){const found=cases.get(id);if(!found)return{error:"case_not_found"};if(found.case_type!==ANNUAL_LEAVE_CASE_TYPE)return{error:"case_type_mismatch",case:found};return buildResult(found);}
export function updateAnnualLeaveCase(id,factsPatch={}){const current=cases.get(id);if(!current)return{error:"case_not_found"};if(current.case_type!==ANNUAL_LEAVE_CASE_TYPE)return{error:"case_type_mismatch",case:current};const facts=mergeFacts(current.facts,factsPatch);const updated=cases.update(id,toCaseUpdate(current,facts),"api:annual-leave-intake");return updated?buildResult(updated):{error:"case_not_found"};}
export function renderAnnualLeaveDocument(id,templateKey,extraValues={}){const result=getAnnualLeaveCase(id);if(result?.error)return result;const spec=result.documents.find((item)=>item.templateKey===templateKey);if(!spec)return{error:"document_not_supported"};const values={...spec.prefill,...(isObject(extraValues)?extraValues:{})};const rendered=renderDoc(templateKey,values);return rendered?{templateKey,values,document:rendered,caseId:id}:{error:"document_not_found"};}
export function getAnnualLeaveCaseReport(id){const result=getAnnualLeaveCase(id);return result?.error?result:buildAnnualLeaveCaseReport(result);}
