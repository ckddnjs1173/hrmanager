import { getAnnualLeaveIntakeState } from "./annual-leave-intake.js";
import { getAnnualLeaveLegalContext } from "./annual-leave-rules.js";

export const ANNUAL_LEAVE_ACTION_IDS = Object.freeze({
  COMPLETE_INTAKE:"annual_leave.complete_intake",
  REVIEW_SCOPE:"annual_leave.review_scope",
  COMPLETE_ENTITLEMENT:"annual_leave.complete_entitlement",
  COMPLETE_MONEY:"annual_leave.complete_money",
  REVIEW_PROMOTION:"annual_leave.review_use_promotion",
  GATHER_EVIDENCE:"annual_leave.gather_evidence",
  PREPARE_CLAIM:"annual_leave.prepare_claim",
  REVIEW_CASE:"annual_leave.review_case",
});

function action(id,title,description,target,reason){return {id,status:"todo",priority:"primary",title,description,target,reason};}

export function getAnnualLeaveNextAction(facts = {}) {
  const intake=getAnnualLeaveIntakeState(facts);
  const legal=getAnnualLeaveLegalContext(facts);
  if (!intake.coreComplete) return action(ANNUAL_LEAVE_ACTION_IDS.COMPLETE_INTAKE,"근속기간과 적용범위부터 확인하세요.","입사일·재직/퇴직 여부·상시근로자 수·주 소정근로시간을 먼저 입력해야 연차 적용범위를 판단할 수 있습니다.","intake",`missing_core:${intake.missingCoreFacts.join(",")}`);
  if (legal.scope.eligible === false) return action(ANNUAL_LEAVE_ACTION_IDS.REVIEW_SCOPE,"연차 적용 제외 가능성을 먼저 재확인하세요.","현재 입력상 주 15시간 미만 또는 5명 미만 사업장 baseline에 해당합니다. 실제 기간별 소정근로시간과 법정 상시근로자 수 산정이 맞는지 확인하세요.","scope",legal.scope.status);
  const grant=legal.entitlement.latestAnnualGrant;
  if (["needs_five_plus_year_scope","needs_attendance_rate","needs_full_attendance_months"].includes(grant?.status)) return action(ANNUAL_LEAVE_ACTION_IDS.COMPLETE_ENTITLEMENT,"연차 발생일수에 필요한 사실을 보완하세요.","1년 이상 근속자의 연차는 직전 1년의 사업장 적용범위와 출근율을 확인해야 합니다. 80% 미만이면 월별 개근정보가 필요합니다.","entitlement",grant.status);
  if (intake.missingMoneyFacts.some((key)=>["claimedUnusedDays","dailyLeavePayAmount","amountAlreadyPaid"].includes(key))) return action(ANNUAL_LEAVE_ACTION_IDS.COMPLETE_MONEY,"미사용수당 계산 정보를 입력하세요.","연차대장에서 확인한 미사용 일수와 1일 휴가임금 기준액, 이미 지급된 수당을 입력하면 잠정 금액을 계산할 수 있습니다.","money",`missing_money:${intake.missingMoneyFacts.join(",")}`);
  if (facts.usePromotionImplemented === null || facts.employerPreventedUse === null || legal.money.status === "use_promotion_effect_needs_review") return action(ANNUAL_LEAVE_ACTION_IDS.REVIEW_PROMOTION,"회사의 연차 사용촉진 절차를 확인하세요.","사용촉진 여부와 사용자 귀책으로 휴가를 쓰지 못했는지에 따라 미사용수당 결론이 달라질 수 있습니다. 서면 촉구·시기지정 자료를 확인하세요.","promotion",legal.money.status);
  if (intake.evidence.haveCount < 2 || intake.evidence.knownCount < 3) return action(ANNUAL_LEAVE_ACTION_IDS.GATHER_EVIDENCE,"연차대장과 출근·사용촉진 자료를 모아두세요.","연차 발생·사용·소멸 및 미사용수당을 확인할 연차대장, 출근기록, 사용촉진 서면, 급여명세서를 체크하세요.","evidence",`evidence:${intake.evidence.haveCount}/${intake.evidence.totalCount}`);
  if ((legal.money.outstandingEstimate ?? 0) > 0) return action(ANNUAL_LEAVE_ACTION_IDS.PREPARE_CLAIM,"미사용 연차수당 청구 준비를 진행하세요.","현재 입력 기준 예상 미지급액이 있습니다. 계산 근거와 연차대장·사용촉진 자료를 보관하고 지급요청 또는 고용노동부 진정을 검토하세요.","claim","annual_leave_outstanding_estimated");
  return action(ANNUAL_LEAVE_ACTION_IDS.REVIEW_CASE,"연차 발생·사용내역을 마지막으로 검토하세요.","현재 자동 계산 가능한 미지급액은 없습니다. 과거 연차연도나 사용촉진 절차가 빠지지 않았는지 확인하세요.","review",legal.money.status);
}

export function buildAnnualLeaveActions(facts = {}) { return [getAnnualLeaveNextAction(facts)]; }
