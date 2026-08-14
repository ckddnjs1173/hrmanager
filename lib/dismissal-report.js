const TYPE_LABELS = Object.freeze({
  dismissal: "회사 일방 해고 통보",
  advised_resignation: "권고사직 논의",
  contract_end: "기간제 계약 종료",
  unclear: "해고·사직 구분 불명확",
});

const EVIDENCE_LABELS = Object.freeze({
  dismissalNotice: "해고·종료 통지서",
  messagesWithEmployer: "회사와 주고받은 메시지",
  resignationLetter: "사직서·사직 합의서",
  employmentContract: "근로계약서",
  payslip: "급여명세서",
});

const EVIDENCE_STATUS = Object.freeze({ have: "보유", planned: "확보 예정", missing: "없음", unknown: "미확인" });

function yesNo(value) {
  return value === true ? "예" : value === false ? "아니오" : "미확인";
}

function won(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${Math.round(n).toLocaleString("ko-KR")}원` : "미확인";
}

export function buildDismissalCaseReport({ case: caseData, intake, legal, documents, procedures, nextAction } = {}) {
  if (!caseData) return null;
  const facts = caseData.facts || {};
  const sources = legal?.sources || caseData.legal_sources || [];
  const evidence = facts.evidence || {};
  const issues = intake?.issues || caseData.issues || [];
  const lines = [
    "인사야 해고·권고사직 사건 요약",
    `사건 ID: ${caseData.id}`,
    `작성일: ${new Date().toISOString().slice(0, 10)}`,
    "",
    "[종료 경위]",
    `- 입력된 종료 방식: ${TYPE_LABELS[facts.separationType] || "미확인"}`,
    `- 입사일: ${facts.employmentStartDate || "미확인"}`,
    `- 통보일: ${facts.noticeDate || "미확인"}`,
    `- 종료일: ${facts.effectiveDate || "미확인"}`,
    `- 상시근로자 수: ${facts.workplaceEmployeeCount ?? "미확인"}`,
    `- 회사가 제시한 사유: ${facts.employerReason || "미확인"}`,
    `- 해고 서면 통지 수령: ${yesNo(facts.writtenNoticeReceived)}`,
    `- 해고예고수당 지급: ${yesNo(facts.noticePayPaid)}`,
    "",
    "[잠정 분류]",
    `- 종료 성격: ${legal?.characterization?.status || "추가 확인 필요"}`,
    `- 상시 5명 이상 여부: ${legal?.fivePlus === true ? "예" : legal?.fivePlus === false ? "아니오" : "미확인"}`,
    `- 노동위원회 구제 baseline: ${legal?.laborBoardEligibleBaseline ? "검토 대상" : "현재 입력만으로는 대상 아님/미확인"}`,
    `- 해고예고수당: ${legal?.noticeAllowance?.status || "해당 없음/미확인"}`,
    `- 해고예고수당 추정액: ${won(legal?.noticeAllowance?.amount)}`,
  ];

  if (legal?.remedyWindow) {
    lines.push(`- 구제신청 기간: ${legal.remedyWindow.text} (기준일 ${legal.remedyWindow.from})`);
  }

  lines.push("", "[현재 쟁점]");
  if (issues.length) issues.forEach((issue) => lines.push(`- ${issue}`));
  else lines.push("- 추가 쟁점 미확인");

  lines.push("", "[증거 상태]");
  for (const [key, label] of Object.entries(EVIDENCE_LABELS)) {
    lines.push(`- ${label}: ${EVIDENCE_STATUS[evidence[key] || "unknown"] || "미확인"}`);
  }

  lines.push("", "[다음 행동]", `- ${nextAction?.title || "사건 내용 검토"}`);
  if (nextAction?.description) lines.push(`- 안내: ${nextAction.description}`);

  lines.push("", "[추천 문서]");
  if (documents?.length) documents.forEach((doc) => lines.push(`- ${doc.title}`));
  else lines.push("- 현재 자동 추천 문서 없음");

  lines.push("", "[공식 절차]");
  if (procedures?.length) procedures.forEach((item) => lines.push(`- ${item.title}: ${item.url}`));
  else lines.push("- 현재 입력 기준 자동 연결 절차 없음");

  lines.push("", "[공식 근거]");
  if (sources.length) sources.forEach((source) => lines.push(`- ${source.article || source.title} · ${source.authority} · ${source.url}`));
  else lines.push("- 현재 연결 근거 없음");

  lines.push(
    "",
    "※ 권고사직·계약만료·해고 여부는 명칭만으로 확정되지 않습니다. 이 요약은 입력 사실에 따른 1차 사건 정리이며 실제 법적 평가는 추가 사실과 증거에 따라 달라질 수 있습니다."
  );

  return {
    title: "해고·권고사직 사건 요약",
    text: lines.join("\n"),
    generatedAt: new Date().toISOString(),
    caseId: caseData.id,
  };
}
