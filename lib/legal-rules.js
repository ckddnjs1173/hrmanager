// 인사야 1.0 — 사건 기준일 기반 법률 규칙 baseline
//
// 이 모듈은 LLM이 법률 버전을 임의 선택하지 않도록 날짜로 규칙을 고른다.
// 1차 범위는 임금체불 vertical slice에 실제로 필요한 최소 규칙만 포함한다.

const VERIFIED_AT = "2026-08-15";

const SOURCES = Object.freeze({
  MINIMUM_WAGE: Object.freeze({
    id: "source.minimum_wage_commission.annual",
    authority: "최저임금위원회",
    title: "연도별 최저임금 결정현황",
    url: "https://minimumwage.go.kr/minWage/policy/decisionMain.do",
    verifiedAt: VERIFIED_AT,
  }),
  LABOR_STANDARDS_36: Object.freeze({
    id: "source.lsa.article36",
    authority: "국가법령정보센터",
    title: "근로기준법 제36조 금품 청산",
    article: "근로기준법 제36조",
    url: "https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1029728519",
    verifiedAt: VERIFIED_AT,
  }),
  LABOR_STANDARDS_37: Object.freeze({
    id: "source.lsa.article37",
    authority: "국가법령정보센터",
    title: "근로기준법 제37조 미지급 임금에 대한 지연이자",
    article: "근로기준법 제37조",
    url: "https://www.law.go.kr/LSW/lsLinkCommonInfo.do?ancYnChk=&chrClsCd=010202&lsJoLnkSeq=1029729767",
    verifiedAt: VERIFIED_AT,
  }),
  LABOR_STANDARDS_DECREE_17: Object.freeze({
    id: "source.lsa_decree.article17",
    authority: "국가법령정보센터",
    title: "근로기준법 시행령 제17조 미지급 임금에 대한 지연이자의 이율",
    article: "근로기준법 시행령 제17조",
    url: "https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lspttninfSeq=70867",
    verifiedAt: VERIFIED_AT,
  }),
});

const MINIMUM_WAGE_RULES = Object.freeze([
  Object.freeze({
    id: "minimum_wage.2023",
    category: "minimum_wage",
    effectiveFrom: "2023-01-01",
    effectiveTo: "2023-12-31",
    hourly: 9620,
    daily8h: 76960,
    monthly209h: 2010580,
    source: SOURCES.MINIMUM_WAGE,
  }),
  Object.freeze({
    id: "minimum_wage.2024",
    category: "minimum_wage",
    effectiveFrom: "2024-01-01",
    effectiveTo: "2024-12-31",
    hourly: 9860,
    daily8h: 78880,
    monthly209h: 2060740,
    source: SOURCES.MINIMUM_WAGE,
  }),
  Object.freeze({
    id: "minimum_wage.2025",
    category: "minimum_wage",
    effectiveFrom: "2025-01-01",
    effectiveTo: "2025-12-31",
    hourly: 10030,
    daily8h: 80240,
    monthly209h: 2096270,
    source: SOURCES.MINIMUM_WAGE,
  }),
  Object.freeze({
    id: "minimum_wage.2026",
    category: "minimum_wage",
    effectiveFrom: "2026-01-01",
    effectiveTo: "2026-12-31",
    hourly: 10320,
    daily8h: 82560,
    monthly209h: 2156880,
    source: SOURCES.MINIMUM_WAGE,
  }),
]);

export const WAGE_LEGAL_BASELINE = Object.freeze({
  settlementAfterEmploymentEnds: Object.freeze({
    id: "wage.settlement_after_end.current_baseline",
    category: "wage_settlement",
    days: 14,
    source: SOURCES.LABOR_STANDARDS_36,
  }),
  delayInterestCurrent: Object.freeze({
    id: "wage.delay_interest.current_baseline",
    category: "delay_interest",
    effectiveFrom: "2025-10-23",
    annualRate: 0.2,
    source: SOURCES.LABOR_STANDARDS_37,
    rateSource: SOURCES.LABOR_STANDARDS_DECREE_17,
  }),
});

function isIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function inRange(date, from, to) {
  return isIsoDate(date) && date >= from && date <= to;
}

function uniqueSources(items) {
  const seen = new Set();
  return items.filter((source) => {
    if (!source?.id || seen.has(source.id)) return false;
    seen.add(source.id);
    return true;
  });
}

export function selectMinimumWageRule(referenceDate) {
  if (!isIsoDate(referenceDate)) return null;
  return MINIMUM_WAGE_RULES.find((rule) => inRange(referenceDate, rule.effectiveFrom, rule.effectiveTo)) || null;
}

export function resolveWageReferenceDate(facts = {}, asOfDate = null) {
  const candidates = [
    facts.unpaidPeriodEnd,
    facts.eventDate,
    facts.employmentEndDate,
    facts.unpaidPeriodStart,
    asOfDate,
  ];
  return candidates.find(isIsoDate) || null;
}

export function getWageLegalContext(facts = {}, { asOfDate = null } = {}) {
  const referenceDate = resolveWageReferenceDate(facts, asOfDate);
  const minimumWage = selectMinimumWageRule(referenceDate);
  const employmentEnded = ["resigned", "dismissed"].includes(facts.employmentStatus) && isIsoDate(facts.employmentEndDate);
  const sources = [];
  const warnings = [];

  if (minimumWage) sources.push(minimumWage.source);
  else if (referenceDate) warnings.push("minimum_wage_version_not_supported");
  else warnings.push("reference_date_missing");

  if (employmentEnded) {
    sources.push(WAGE_LEGAL_BASELINE.settlementAfterEmploymentEnds.source);
    sources.push(WAGE_LEGAL_BASELINE.delayInterestCurrent.source);
    sources.push(WAGE_LEGAL_BASELINE.delayInterestCurrent.rateSource);

    if (facts.employmentEndDate < WAGE_LEGAL_BASELINE.delayInterestCurrent.effectiveFrom) {
      warnings.push("delay_interest_pre_baseline_requires_review");
    }
  }

  return {
    referenceDate,
    asOfDate: isIsoDate(asOfDate) ? asOfDate : null,
    minimumWage,
    settlementRule: employmentEnded ? WAGE_LEGAL_BASELINE.settlementAfterEmploymentEnds : null,
    delayInterestRule:
      employmentEnded && facts.employmentEndDate >= WAGE_LEGAL_BASELINE.delayInterestCurrent.effectiveFrom
        ? WAGE_LEGAL_BASELINE.delayInterestCurrent
        : null,
    sources: uniqueSources(sources),
    warnings,
    verifiedAt: VERIFIED_AT,
  };
}

export function listMinimumWageRules() {
  return MINIMUM_WAGE_RULES.map((rule) => ({ ...rule }));
}
