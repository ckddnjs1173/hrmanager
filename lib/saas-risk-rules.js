import { STATUTORY_FACTS_2026 } from "./statutory-facts.js";
import { validateRiskRuleDefinition } from "./risk-contract.js";

export const BUSINESS_RISK_RULE_PACK_VERSION = "2026.08.16-v1";

export const BUSINESS_RISK_SOURCES = Object.freeze({
  LABOR_STANDARDS_ARTICLE_17: Object.freeze({
    id: "source.lsa.article17",
    authority: "국가법령정보센터",
    title: "근로기준법 제17조 근로조건의 명시",
    url: "https://www.law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joNo=0017",
    verifiedAt: "2026-08-16",
  }),
  MINIMUM_WAGE_ANNUAL: Object.freeze({
    id: "source.minimum_wage_commission.annual",
    authority: "최저임금위원회",
    title: "연도별 최저임금 결정현황",
    url: "https://minimumwage.go.kr/minWage/policy/decisionMain.do",
    verifiedAt: "2026-08-16",
  }),
  LABOR_STANDARDS_SCOPE: Object.freeze({
    id: "source.lsa_decree.appendix1",
    authority: "국가법령정보센터",
    title: "근로기준법 시행령 제7조·별표 1 상시 4명 이하 사업장 적용 규정",
    url: "https://law.go.kr/LSW/lsInfoP.do?lsId=003058",
    verifiedAt: "2026-08-16",
  }),
});

const rules = [
  {
    id: "business.scope.verification_required",
    version: "1",
    domain: "workplace_scope",
    title: "사업장 적용범위 확인 필요",
    severity: "MEDIUM",
    requiredFacts: ["complianceScope.status"],
    legalSourceIds: [BUSINESS_RISK_SOURCES.LABOR_STANDARDS_SCOPE.id],
    evaluatorKey: "scopeVerificationRequired",
    recommendedActionKey: "scope.verify",
  },
  {
    id: "business.employment.core_terms_missing",
    version: "1",
    domain: "employment_contract",
    title: "근로조건 핵심정보 확인 필요",
    severity: "MEDIUM",
    requiredFacts: ["employment.weeklyContractHours", "employment.wageType", "employment.baseWage"],
    legalSourceIds: [BUSINESS_RISK_SOURCES.LABOR_STANDARDS_ARTICLE_17.id],
    evaluatorKey: "employmentCoreTermsMissing",
    recommendedActionKey: "employment.verify_written_terms",
  },
  {
    id: "business.wage.hourly_below_minimum_2026",
    version: "2026",
    domain: "wage",
    title: "시급이 2026년 최저임금보다 낮음",
    severity: "HIGH",
    requiredFacts: ["employment.wageType", "employment.baseWage"],
    legalSourceIds: [BUSINESS_RISK_SOURCES.MINIMUM_WAGE_ANNUAL.id],
    evaluatorKey: "hourlyBelowMinimum2026",
    recommendedActionKey: "wage.review_minimum",
  },
].map((rule) => Object.freeze(rule));

for (const rule of rules) {
  const validation = validateRiskRuleDefinition(rule);
  if (!validation.ok) throw new Error(`business_risk_rule_invalid:${rule.id}:${validation.errors.join(",")}`);
}

export const BUSINESS_RISK_RULES = Object.freeze(rules);

export function getBusinessRiskRule(ruleId) {
  return BUSINESS_RISK_RULES.find((rule) => rule.id === ruleId) || null;
}

function normalizedWageType(value) {
  const text = String(value || "").trim().toUpperCase();
  if (["HOURLY", "HOUR", "시급"].includes(text)) return "HOURLY";
  return text;
}

export function evaluateBusinessRiskRule(rule, subject = {}) {
  if (!rule) throw new Error("risk_rule_required");

  if (rule.evaluatorKey === "scopeVerificationRequired") {
    if (!subject.scope) return { applicability: "NOT_APPLIES", missingFacts: [], explanation: "적용범위 객체가 없습니다." };
    if (subject.scope.status === "UNCERTAIN") {
      return {
        applicability: "UNCERTAIN",
        missingFacts: ["complianceScope.verification"],
        explanation: "사업장 적용범위가 아직 확인되지 않아 인원수·적용조항 관련 판단을 확정하지 않습니다.",
      };
    }
    return { applicability: "NOT_APPLIES", missingFacts: [], explanation: "사업장 적용범위가 확인된 상태입니다." };
  }

  if (rule.evaluatorKey === "employmentCoreTermsMissing") {
    const employment = subject.employment || {};
    const missingFacts = [];
    if (employment.weeklyContractHours == null) missingFacts.push("employment.weeklyContractHours");
    if (!String(employment.wageType || "").trim()) missingFacts.push("employment.wageType");
    if (employment.baseWage == null) missingFacts.push("employment.baseWage");
    if (missingFacts.length) {
      return {
        applicability: "UNCERTAIN",
        missingFacts,
        explanation: "근로조건 서면 명시 여부를 점검하기 위한 핵심 정보가 부족합니다. 위반으로 단정하지 않고 확인 대상으로 표시합니다.",
      };
    }
    return { applicability: "NOT_APPLIES", missingFacts: [], explanation: "현재 저장된 핵심 근로조건 정보가 채워져 있습니다." };
  }

  if (rule.evaluatorKey === "hourlyBelowMinimum2026") {
    const employment = subject.employment || {};
    if (!String(employment.wageType || "").trim() || employment.baseWage == null) {
      return {
        applicability: "UNCERTAIN",
        missingFacts: [
          ...(!String(employment.wageType || "").trim() ? ["employment.wageType"] : []),
          ...(employment.baseWage == null ? ["employment.baseWage"] : []),
        ],
        explanation: "임금형태 또는 기준임금 정보가 없어 최저임금 비교를 수행하지 않습니다.",
      };
    }
    if (normalizedWageType(employment.wageType) !== "HOURLY") {
      return { applicability: "NOT_APPLIES", missingFacts: [], explanation: "현재 규칙은 시급제 근로자만 직접 비교합니다." };
    }
    const hourly = Number(employment.baseWage);
    if (!Number.isFinite(hourly)) return { applicability: "UNCERTAIN", missingFacts: ["employment.baseWage"], explanation: "시급 값이 유효하지 않습니다." };
    if (hourly < STATUTORY_FACTS_2026.minWageHour) {
      return {
        applicability: "APPLIES",
        missingFacts: [],
        explanation: `등록 시급 ${hourly.toLocaleString("ko-KR")}원은 2026년 최저임금 ${STATUTORY_FACTS_2026.minWageHour.toLocaleString("ko-KR")}원보다 낮습니다.`,
      };
    }
    return { applicability: "NOT_APPLIES", missingFacts: [], explanation: "등록 시급이 2026년 최저임금 이상입니다." };
  }

  throw new Error(`risk_evaluator_unknown:${rule.evaluatorKey}`);
}
