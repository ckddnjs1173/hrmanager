import { getDismissalLegalContext } from "./dismissal-rules.js";

export function buildDismissalDocuments(facts = {}, legal = getDismissalLegalContext(facts)) {
  const docs = [];
  const work = facts.employmentStartDate && facts.effectiveDate
    ? `${facts.employmentStartDate} ~ ${facts.effectiveDate}`
    : facts.employmentStartDate || facts.effectiveDate || "";

  if (legal.laborBoardEligibleBaseline) {
    docs.push({
      id: "relief_app",
      templateKey: "relief_app",
      title: "부당해고 등 구제신청서",
      description: "입사일·해고일·회사 사유를 반영해 노동위원회 구제신청서 초안을 만듭니다.",
      status: "ready",
      prefill: {
        hire: facts.employmentStartDate || "",
        date: facts.effectiveDate || "",
        reason: facts.employerReason || "",
        want: facts.wantsReinstatement === false ? "금전보상 등 가능한 구제 검토" : "원직복직 및 해고기간 임금 상당액 지급",
      },
    });
  }

  if (facts.separationType === "dismissal" || legal.characterization.status === "possible_involuntary_termination") {
    docs.push({
      id: "certmail",
      templateKey: "certmail",
      title: "해고 이의·사실확인 내용증명",
      description: "종료 경위와 회사가 제시한 사유를 남겨 사실관계를 확인하는 내용증명 초안을 만듭니다.",
      status: "ready",
      prefill: {
        work,
        amount: legal.noticeAllowance?.amount || "",
        detail: `근로관계 종료일: ${facts.effectiveDate || "미확인"} / 회사 제시 사유: ${facts.employerReason || "미확인"}`,
      },
    });
  }

  if (legal.noticeAllowance?.status === "possible_shortfall") {
    docs.push({
      id: "complaint",
      templateKey: "complaint",
      title: "해고예고수당 진정서",
      description: "30일 예고 또는 예고수당 문제를 고용노동부에 확인하기 위한 진정서 초안을 만듭니다.",
      status: legal.noticeAllowance.amount === null ? "needs_money" : "ready",
      prefill: {
        type: "해고예고수당 미지급",
        work,
        fact: `해고 통보일 ${facts.noticeDate || "미확인"}, 해고일 ${facts.effectiveDate || "미확인"}. 입력 기준 해고예고수당 미지급 가능성 검토가 필요합니다.`,
        ask: "해고예고수당 지급의무 및 미지급 여부를 조사하여 필요한 시정을 요청합니다.",
      },
    });
  }

  return docs;
}

export function buildDismissalProcedures(facts = {}, legal = getDismissalLegalContext(facts)) {
  const procedures = [];

  if (legal.laborBoardEligibleBaseline) {
    procedures.push({
      id: "dismissal.nlrc_relief",
      authority: "중앙노동위원회",
      title: "부당해고등 구제신청",
      description: "상시 5명 이상 사업장의 부당해고 가능성이 있다면 해고 등이 있었던 날부터 3개월 이내 관할 지방노동위원회에 신청할 수 있습니다.",
      url: "https://nlrc.go.kr/nlrc/minwon/CmmnEventRequest/choice.do",
      verifiedAt: "2026-08-15",
    });
  }

  if (legal.noticeAllowance?.status === "possible_shortfall") {
    procedures.push({
      id: "dismissal.moel_notice_pay",
      authority: "고용노동부 노동포털",
      title: "해고예고수당 등 노동관계법 위반 진정",
      description: "해고예고수당 문제는 노동위원회 부당해고 구제와 별개로 고용노동부 진정 절차를 검토합니다.",
      url: "https://labor.moel.go.kr/minwonApply/minwonFormat.do?searchGubun=1&searchVal=SN001&urlAddr=%2FminwonRqst%2FSN001.do",
      verifiedAt: "2026-08-15",
    });
  }

  return procedures;
}
