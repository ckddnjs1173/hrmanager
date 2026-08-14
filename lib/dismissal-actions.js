import { getDismissalIntakeState } from "./dismissal-intake.js";
import { getDismissalLegalContext } from "./dismissal-rules.js";

export const DISMISSAL_ACTION_IDS = Object.freeze({
  COMPLETE_INTAKE: "dismissal.complete_intake",
  CHARACTERIZE: "dismissal.characterize",
  CONFIRM_NOTICE_PAY: "dismissal.confirm_notice_pay",
  GATHER_EVIDENCE: "dismissal.gather_evidence",
  PREPARE_REMEDY: "dismissal.prepare_remedy",
  REVIEW_CASE: "dismissal.review_case",
});

function action(id, title, description, target, reason) {
  return { id, status: "todo", priority: "primary", title, description, target, reason };
}

export function getDismissalNextAction(facts = {}) {
  const intake = getDismissalIntakeState(facts);
  const legal = getDismissalLegalContext(facts);

  if (!intake.coreComplete) {
    return action(
      DISMISSAL_ACTION_IDS.COMPLETE_INTAKE,
      "종료 방식과 핵심 날짜부터 확인하세요.",
      "해고인지 권고사직인지, 입사일·종료일·상시근로자 수를 먼저 정리해야 적용 절차를 나눌 수 있습니다.",
      "intake",
      `missing_core:${intake.missingCoreFacts.join(",")}`
    );
  }

  if (legal.characterization.confidence === "needs_review" && intake.missingConditionalFacts.length > 0) {
    return action(
      DISMISSAL_ACTION_IDS.CHARACTERIZE,
      "해고인지 합의 종료인지 경위를 더 확인하세요.",
      "권고사직 동의·사직서·강압 여부 등 실제 종료 경위를 보완해야 부당해고 절차를 잘못 안내하지 않습니다.",
      "characterization",
      `missing_characterization:${intake.missingConditionalFacts.join(",")}`
    );
  }

  if (legal.noticeAllowance?.status === "possible_shortfall" && legal.noticeAllowance.amount === null) {
    return action(
      DISMISSAL_ACTION_IDS.CONFIRM_NOTICE_PAY,
      "해고예고수당 계산 기준을 확인하세요.",
      "30일 전에 예고받지 못하고 예고수당도 받지 못했다면 통상임금 기준을 입력해 예상액을 확인할 수 있습니다.",
      "notice-pay",
      "ordinary_daily_wage_missing"
    );
  }

  if (intake.evidence.haveCount < 2 || intake.evidence.knownCount < 3) {
    return action(
      DISMISSAL_ACTION_IDS.GATHER_EVIDENCE,
      "종료 경위를 확인할 증거를 정리하세요.",
      "해고통지·메신저·사직서·근로계약서처럼 누가 어떤 방식으로 근로관계를 끝냈는지 보여주는 자료부터 체크하세요.",
      "evidence",
      `evidence:${intake.evidence.haveCount}/${intake.evidence.totalCount}`
    );
  }

  if (legal.laborBoardEligibleBaseline) {
    return action(
      DISMISSAL_ACTION_IDS.PREPARE_REMEDY,
      "노동위원회 구제신청 준비를 검토하세요.",
      "현재 입력상 상시 5명 이상 사업장의 해고 가능성이 있어 해고일로부터 3개월 이내 구제신청 기간을 놓치지 않도록 자료와 신청서를 준비하세요.",
      "remedy",
      "labor_board_baseline_eligible"
    );
  }

  return action(
    DISMISSAL_ACTION_IDS.REVIEW_CASE,
    "사건 분류와 가능한 절차를 다시 확인하세요.",
    "현재 사실과 적용범위를 정리했습니다. 작은 사업장·권고사직·계약만료는 가능한 절차가 달라질 수 있으니 사건 요약을 검토하세요.",
    "review",
    "baseline_review_ready"
  );
}

export function buildDismissalActions(facts = {}) {
  return [getDismissalNextAction(facts)];
}
