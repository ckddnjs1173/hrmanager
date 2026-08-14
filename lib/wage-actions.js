import { getWageIntakeState } from "./wage-intake.js";
import { getWageMoneyMissingFacts } from "./wage-money.js";

export const WAGE_ACTION_IDS = Object.freeze({
  COMPLETE_INTAKE: "wage.complete_intake",
  CONFIRM_EXTRA_PAY: "wage.confirm_extra_pay",
  COMPLETE_MONEY: "wage.complete_money",
  GATHER_EVIDENCE: "wage.gather_evidence",
  REVIEW_CASE: "wage.review_case",
});

function action(id, title, description, target, reason) {
  return {
    id,
    status: "todo",
    priority: "primary",
    title,
    description,
    target,
    reason,
  };
}

export function getWageNextAction(facts = {}) {
  const intake = getWageIntakeState(facts);

  if (!intake.coreComplete) {
    return action(
      WAGE_ACTION_IDS.COMPLETE_INTAKE,
      "사건의 핵심 사실을 먼저 확인하세요.",
      "지급일·미지급 기간·급여 기준처럼 사건 판단에 필요한 기본 정보를 이어서 입력해 주세요.",
      "intake",
      `missing_core:${intake.missingCoreFacts.join(",")}`
    );
  }

  if (intake.missingExtraFacts.length > 0) {
    return action(
      WAGE_ACTION_IDS.CONFIRM_EXTRA_PAY,
      "추가 수당 가능성을 확인하세요.",
      "연장·야간·휴일근로와 미사용 연차 여부를 확인하면 빠진 임금 항목이 있는지 더 정확히 정리할 수 있습니다.",
      "extra",
      `missing_extra:${intake.missingExtraFacts.join(",")}`
    );
  }

  const moneyMissing = getWageMoneyMissingFacts(facts);
  if (moneyMissing.length > 0) {
    return action(
      WAGE_ACTION_IDS.COMPLETE_MONEY,
      "체불액 계산에 필요한 금액 정보를 보완하세요.",
      "미지급 예정액과 근로시간·사업장 규모 등 필요한 정보만 추가하면 현재 확인 가능한 체불액을 계산할 수 있습니다.",
      "money",
      `missing_money:${moneyMissing.join(",")}`
    );
  }

  if (intake.evidence.haveCount < 2 || intake.evidence.knownCount < 3) {
    return action(
      WAGE_ACTION_IDS.GATHER_EVIDENCE,
      "지급 여부를 확인할 증거를 정리하세요.",
      "급여명세서·계좌내역·근로계약서처럼 임금과 지급 여부를 확인할 수 있는 자료부터 보유 상태를 체크해 주세요.",
      "evidence",
      `evidence:${intake.evidence.haveCount}/${intake.evidence.totalCount}`
    );
  }

  return action(
    WAGE_ACTION_IDS.REVIEW_CASE,
    "사건 정리 내용을 한 번 검토하세요.",
    "핵심 사실·금액·추가 수당·증거 상태가 정리됐습니다. 다음 문서와 공식 절차 단계로 넘어가기 전에 입력 내용을 확인해 주세요.",
    "facts",
    "intake_money_and_evidence_ready"
  );
}

export function buildWageActions(facts = {}) {
  return [getWageNextAction(facts)];
}
