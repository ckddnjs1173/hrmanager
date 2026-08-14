import { getRetirementLegalContext } from "./retirement-rules.js";

export function buildRetirementDocuments(facts = {}, legal = getRetirementLegalContext(facts)) {
  const amount = legal.money?.outstandingEstimate;
  const work = facts.employmentStartDate && facts.retirementDate
    ? `${facts.employmentStartDate} ~ ${facts.retirementDate}`
    : facts.employmentStartDate || facts.retirementDate || "";
  const detail = [
    `퇴직급여 유형: ${facts.benefitType || "미확인"}`,
    `퇴직일: ${facts.retirementDate || "미확인"}`,
    `예상 법정액: ${legal.money?.statutoryEstimate ?? "미확인"}`,
    `기지급액: ${legal.money?.paidAmount ?? facts.amountAlreadyPaid ?? "미확인"}`,
  ].join(" / ");

  if (amount === null || amount === undefined || amount <= 0) return [];
  return [
    {
      id: "certmail",
      templateKey: "certmail",
      title: "퇴직급여 지급 요청 내용증명",
      description: "근속기간과 현재 계산 가능한 미지급액을 반영해 지급 요청 초안을 만듭니다.",
      status: "ready",
      prefill: { work, amount, detail },
    },
    {
      id: "complaint",
      templateKey: "complaint",
      title: "퇴직급여 미지급 진정서",
      description: "퇴직급여 미지급 사실과 계산 근거를 고용노동부 진정서 초안에 반영합니다.",
      status: "ready",
      prefill: {
        type: facts.benefitType === "dc_pension" ? "퇴직연금 부담금 미납" : "퇴직금 미지급",
        work,
        fact: `${detail}. 현재 시스템 예상 미지급액은 ${amount}원입니다.`,
        ask: "퇴직급여 지급의무와 미지급액을 조사하여 필요한 시정을 요청합니다.",
      },
    },
  ];
}

export function buildRetirementProcedures(facts = {}, legal = getRetirementLegalContext(facts)) {
  if ((legal.money?.outstandingEstimate ?? 0) <= 0) return [];
  return [{
    id: "retirement.moel_claim",
    authority: "고용노동부 노동포털",
    title: "퇴직급여 미지급 진정",
    description: legal.payment?.late
      ? "퇴직급여 지급기한이 지난 것으로 보이면 임금체불 진정 절차에서 퇴직급여 미지급을 함께 제기할 수 있습니다."
      : "지급기한 전이라도 계산 근거와 지급내역을 보관하고, 기한 경과 후 미지급이면 진정 절차를 검토하세요.",
    url: "https://labor.moel.go.kr/minwonApply/minwonFormat.do?searchGubun=1&searchVal=SN001&urlAddr=%2FminwonRqst%2FSN001.do",
    verifiedAt: "2026-08-15",
  }];
}
