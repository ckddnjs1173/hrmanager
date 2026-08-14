import { getRetirementIntakeState } from "./retirement-intake.js";
import { getRetirementLegalContext } from "./retirement-rules.js";

export const RETIREMENT_ACTION_IDS = Object.freeze({
  COMPLETE_INTAKE: "retirement.complete_intake",
  CONFIRM_PLAN: "retirement.confirm_plan",
  COMPLETE_MONEY: "retirement.complete_money",
  GATHER_EVIDENCE: "retirement.gather_evidence",
  PREPARE_CLAIM: "retirement.prepare_claim",
  REVIEW_CASE: "retirement.review_case",
});

function action(id, title, description, target, reason) {
  return { id, status: "todo", priority: "primary", title, description, target, reason };
}

export function getRetirementNextAction(facts = {}) {
  const intake = getRetirementIntakeState(facts);
  const legal = getRetirementLegalContext(facts);

  if (!intake.coreComplete) {
    return action(
      RETIREMENT_ACTION_IDS.COMPLETE_INTAKE,
      "퇴직급여 종류와 근속기간부터 확인하세요.",
      "입사일·퇴직일·주당 소정근로시간과 퇴직금/DB/DC 유형을 먼저 정리해야 계산 방식을 고를 수 있습니다.",
      "intake",
      `missing_core:${intake.missingCoreFacts.join(",")}`
    );
  }

  if (facts.benefitType === "unknown") {
    return action(
      RETIREMENT_ACTION_IDS.CONFIRM_PLAN,
      "회사 퇴직급여 방식부터 확인하세요.",
      "일반 퇴직금·DB형·DC형은 계산 기준이 다릅니다. 근로계약서, 퇴직연금 가입 안내 또는 금융기관 명세서에서 유형을 확인해 주세요.",
      "plan",
      "retirement_plan_type_unknown"
    );
  }

  if (legal.eligibility.eligible === false) {
    return action(
      RETIREMENT_ACTION_IDS.REVIEW_CASE,
      "퇴직급여 적용 제외 사유를 다시 확인하세요.",
      "현재 입력상 1년 미만 또는 주 15시간 기준 때문에 법정 퇴직급여 대상이 아닐 가능성이 있습니다. 실제 근무기간·주별 소정근로시간을 재확인하세요.",
      "review",
      legal.eligibility.status
    );
  }

  if (intake.missingMoneyFacts.length > 0 || legal.money.outstandingEstimate === null) {
    return action(
      RETIREMENT_ACTION_IDS.COMPLETE_MONEY,
      "퇴직급여 계산에 필요한 임금 정보를 보완하세요.",
      facts.benefitType === "dc_pension"
        ? "DC형은 회사가 납입해야 할 부담금 총액과 실제 납입액을 확인해야 부족액을 계산할 수 있습니다."
        : "평균임금 산정용 3개월 임금·상여·연차수당과 통상임금을 입력하면 예상 퇴직급여를 계산할 수 있습니다.",
      "money",
      `missing_money:${intake.missingMoneyFacts.join(",")}`
    );
  }

  if (intake.evidence.haveCount < 2 || intake.evidence.knownCount < 3) {
    return action(
      RETIREMENT_ACTION_IDS.GATHER_EVIDENCE,
      "퇴직급여 계산 근거를 모아두세요.",
      "퇴직 전 3개월 급여명세서·계좌내역·근로계약서·퇴직연금 명세서 등 계산과 지급 여부를 확인할 자료를 체크하세요.",
      "evidence",
      `evidence:${intake.evidence.haveCount}/${intake.evidence.totalCount}`
    );
  }

  if ((legal.money.outstandingEstimate ?? 0) > 0) {
    return action(
      RETIREMENT_ACTION_IDS.PREPARE_CLAIM,
      "미지급 퇴직급여 청구 준비를 진행하세요.",
      legal.payment.late
        ? "지급기한이 지난 것으로 보입니다. 사건 요약·급여자료를 정리하고 내용증명 또는 고용노동부 진정 절차를 검토하세요."
        : `현재 예상 미지급액이 있습니다. 기본 지급기한(${legal.payment.dueDate || "미확인"})까지 지급 여부를 확인하고 자료를 보관하세요.`,
      "claim",
      legal.payment.late ? "payment_late" : "outstanding_before_due"
    );
  }

  return action(
    RETIREMENT_ACTION_IDS.REVIEW_CASE,
    "퇴직급여 계산 결과와 실제 지급내역을 검토하세요.",
    "현재 입력상 계산 가능한 차액은 없습니다. 평균임금 구성과 퇴직연금 명세서가 맞는지 마지막으로 확인하세요.",
    "review",
    "no_outstanding_estimate"
  );
}

export function buildRetirementActions(facts = {}) {
  return [getRetirementNextAction(facts)];
}
