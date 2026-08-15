import { getAnnualLeaveLegalContext } from "./annual-leave-rules.js";

export function buildAnnualLeaveDocuments(facts = {}, legal = getAnnualLeaveLegalContext(facts)) {
  const amount=legal.money?.outstandingEstimate;
  if (amount === null || amount === undefined || amount <= 0) return [];
  const work=[facts.employmentStartDate,facts.employmentEndDate || "재직 중"].filter(Boolean).join(" ~ ");
  const detail=[
    `기준일: ${facts.referenceDate || "미확인"}`,
    `미사용 연차: ${facts.claimedUnusedDays ?? "미확인"}일`,
    `1일 휴가임금 기준액: ${facts.dailyLeavePayAmount ?? "미확인"}원`,
    `예상 미지급액: ${amount}원`,
  ].join(" / ");
  return [
    { id:"certmail",templateKey:"certmail",title:"미사용 연차수당 지급 요청 내용증명",description:"확인한 미사용 연차일수와 잠정 미지급액을 반영해 지급 요청 초안을 만듭니다.",status:"ready",prefill:{work,amount,detail} },
    { id:"complaint",templateKey:"complaint",title:"연차유급휴가·미사용수당 진정서",description:"연차 발생·사용촉진·미사용수당 사실을 고용노동부 진정서 초안에 반영합니다.",status:"ready",prefill:{type:"연차유급휴가·미사용수당",work,fact:`${detail}. 연차대장과 사용촉진 자료를 기준으로 추가 확인이 필요합니다.`,ask:"연차유급휴가 부여 및 미사용수당 지급의무를 조사하여 필요한 시정을 요청합니다."} },
  ];
}

export function buildAnnualLeaveProcedures(facts = {}, legal = getAnnualLeaveLegalContext(facts)) {
  if ((legal.money?.outstandingEstimate ?? 0) <= 0) return [];
  return [{
    id:"annual_leave.moel_claim",
    authority:"고용노동부 노동포털",
    title:"연차유급휴가·미사용수당 진정",
    description:"연차대장, 출근기록, 사용촉진 서면, 급여명세서와 현재 계산 근거를 정리해 임금 등 위반사항 진정을 검토합니다.",
    url:"https://labor.moel.go.kr/minwonApply/minwonFormat.do?searchGubun=1&searchVal=SN001&urlAddr=%2FminwonRqst%2FSN001.do",
    verifiedAt:"2026-08-16",
  }];
}
