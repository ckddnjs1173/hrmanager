import { getWorktimeIntakeState } from "./worktime-intake.js";
import { getWorktimeLegalContext } from "./worktime-rules.js";

export const WORKTIME_ACTION_IDS = Object.freeze({
  COMPLETE_INTAKE: "worktime.complete_intake",
  REVIEW_REGIME: "worktime.review_regime",
  COMPLETE_MONEY: "worktime.complete_money",
  GATHER_EVIDENCE: "worktime.gather_evidence",
  PREPARE_CLAIM: "worktime.prepare_claim",
  REVIEW_CASE: "worktime.review_case",
});

function action(id, title, description, target, reason) {
  return { id, status: "todo", priority: "primary", title, description, target, reason };
}

export function getWorktimeNextAction(facts = {}) {
  const intake = getWorktimeIntakeState(facts);
  const legal = getWorktimeLegalContext(facts);

  if (!intake.coreComplete) {
    return action(WORKTIME_ACTION_IDS.COMPLETE_INTAKE, "사업장 규모와 근로시간제를 먼저 확인하세요.", "기준일·상시근로자 수·일반 고정근로시간제 여부가 있어야 법정 근로시간과 가산수당 적용범위를 나눌 수 있습니다.", "intake", `missing_core:${intake.missingCoreFacts.join(",")}`);
  }
  if (facts.standardWorkSystem === false) {
    return action(WORKTIME_ACTION_IDS.REVIEW_REGIME, "근로시간제 유형을 별도로 검토하세요.", "탄력·선택·재량근로 등 변형근로시간제는 단순 8시간/40시간 기준으로 자동 계산하면 오류가 생길 수 있어 현재 자동계산을 중단했습니다.", "regime", "alternative_work_system");
  }
  if (intake.missingMoneyFacts.length > 0 || legal.premium.outstandingEstimate === null) {
    return action(WORKTIME_ACTION_IDS.COMPLETE_MONEY, "시간대별 근로시간과 통상시급을 입력하세요.", "평일 연장·야간, 휴일 8시간 이내·초과, 야간 중첩을 서로 겹치지 않게 나누면 가산 중복 없이 예상 미지급액을 계산할 수 있습니다.", "money", `missing_money:${intake.missingMoneyFacts.join(",")}`);
  }
  if (intake.evidence.haveCount < 2 || intake.evidence.knownCount < 3) {
    return action(WORKTIME_ACTION_IDS.GATHER_EVIDENCE, "실제 근로시간을 입증할 자료를 정리하세요.", "출퇴근기록·근무표·급여명세서·업무메신저 등 실제 근로시간과 지급내역을 확인할 자료를 우선 체크하세요.", "evidence", `evidence:${intake.evidence.haveCount}/${intake.evidence.totalCount}`);
  }
  if ((legal.premium.outstandingEstimate ?? 0) > 0) {
    return action(WORKTIME_ACTION_IDS.PREPARE_CLAIM, "미지급 연장·야간·휴일수당 청구를 준비하세요.", "계산표와 출퇴근기록을 함께 정리하고 회사 지급요청 또는 고용노동부 진정 절차를 검토하세요.", "claim", "premium_pay_outstanding");
  }
  return action(WORKTIME_ACTION_IDS.REVIEW_CASE, "근로시간과 지급내역을 마지막으로 대조하세요.", "현재 입력 기준 자동 계산되는 미지급액은 없습니다. 시간 버킷과 기지급 수당이 정확한지 다시 확인하세요.", "review", "no_outstanding_estimate");
}

export function buildWorktimeActions(facts = {}) {
  return [getWorktimeNextAction(facts)];
}
