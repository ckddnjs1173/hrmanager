import { getWorktimeLegalContext } from "./worktime-rules.js";

export function buildWorktimeDocuments(facts = {}, legal = getWorktimeLegalContext(facts)) {
  const amount = legal.premium?.outstandingEstimate;
  if (amount === null || amount === undefined || amount <= 0) return [];
  const detail = [
    `기준일: ${facts.referenceDate || "미확인"}`,
    `상시근로자 수: ${facts.workplaceEmployeeCount ?? "미확인"}`,
    `통상시급: ${facts.ordinaryHourlyWage ?? "미확인"}`,
    `법정가산 적용 baseline: ${legal.fivePlus ? "예" : "아니오"}`,
  ].join(" / ");
  return [
    {
      id: "certmail",
      templateKey: "certmail",
      title: "연장·야간·휴일수당 지급 요청 내용증명",
      description: "시간대별 근로시간과 예상 미지급액을 반영해 지급 요청 초안을 만듭니다.",
      status: "ready",
      prefill: { work: `기준일 ${facts.referenceDate || "미확인"}`, amount, detail },
    },
    {
      id: "complaint",
      templateKey: "complaint",
      title: "연장·야간·휴일수당 미지급 진정서",
      description: "출퇴근기록과 계산 결과를 고용노동부 진정서 초안에 반영합니다.",
      status: "ready",
      prefill: {
        type: "연장·야간·휴일근로수당 미지급",
        work: `기준일 ${facts.referenceDate || "미확인"}`,
        fact: `${detail}. 현재 시스템 예상 미지급액은 ${amount}원입니다.`,
        ask: "실제 근로시간과 임금 지급내역을 조사하여 미지급 임금의 지급 등 필요한 시정을 요청합니다.",
      },
    },
  ];
}

export function buildWorktimeProcedures(facts = {}, legal = getWorktimeLegalContext(facts)) {
  if ((legal.premium?.outstandingEstimate ?? 0) <= 0 && legal.weeklyOvertime?.status !== "possible_over_12_hour_limit" && legal.break?.status !== "possible_shortfall") return [];
  return [{
    id: "worktime.moel_claim",
    authority: "고용노동부 노동포털",
    title: "근로시간·임금 관련 진정",
    description: "연장·야간·휴일근로수당 미지급 또는 근로시간·휴게 위반 가능성이 있으면 근무기록과 급여자료를 정리해 고용노동부 진정 절차를 검토합니다.",
    url: "https://labor.moel.go.kr/minwonApply/minwonFormat.do?searchGubun=1&searchVal=SN001&urlAddr=%2FminwonRqst%2FSN001.do",
    verifiedAt: "2026-08-15",
  }];
}
