function isoRange(start, end) {
  if (start && end) return `${start} ~ ${end}`;
  return start || end || "";
}

function moneyAmount(money) {
  if (Number.isFinite(Number(money?.knownTotalEstimate))) return Number(money.knownTotalEstimate);
  if (Number.isFinite(Number(money?.principal))) return Number(money.principal);
  return null;
}

export function buildWageDocuments(facts = {}, money = null) {
  const amount = moneyAmount(money);
  const workEnd = facts.employmentEndDate || "현재";
  const detailParts = [];
  if (facts.unpaidPeriodStart || facts.unpaidPeriodEnd) detailParts.push(`미지급 기간: ${isoRange(facts.unpaidPeriodStart, facts.unpaidPeriodEnd)}`);
  if (Array.isArray(facts.unpaidItems) && facts.unpaidItems.length) detailParts.push(`미지급 항목: ${facts.unpaidItems.join(", ")}`);

  const commonPrefill = {
    work: isoRange(facts.employmentStartDate, workEnd),
    amount: amount ?? "",
    detail: detailParts.join(" / "),
  };

  return [
    {
      id: "certmail",
      templateKey: "certmail",
      title: "내용증명 (임금·퇴직금 청구)",
      description: "확인된 사건 기간과 금액을 넣어 사업주에게 지급을 요구하는 초안을 만듭니다.",
      status: amount !== null ? "ready" : "needs_money",
      prefill: commonPrefill,
    },
    {
      id: "complaint",
      templateKey: "complaint",
      title: "노동청 진정서",
      description: "임금체불 사실을 정리해 고용노동부 진정 준비용 초안을 만듭니다.",
      status: "ready",
      prefill: commonPrefill,
    },
  ];
}

export function buildWageOfficialProcedure() {
  return {
    id: "wage.moel_complaint",
    authority: "고용노동부 노동포털",
    title: "임금체불 진정",
    description: "노동포털에서 온라인으로 임금체불 진정을 신청하거나 사업장 소재지 관할 지방고용노동관서를 방문해 제기할 수 있습니다.",
    url: "https://labor.moel.go.kr/minwonApply/minwonFormat.do?searchGubun=1&searchVal=SN001&urlAddr=%2FminwonRqst%2FSN001.do",
    preparation: ["근로계약서", "급여명세서", "계좌 입금내역", "출퇴근·근무시간 기록", "회사와 주고받은 지급 관련 메시지"],
    verifiedAt: "2026-08-15",
  };
}
