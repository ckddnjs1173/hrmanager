const STATUS_LABELS = Object.freeze({
  employed: "재직 중",
  resigned: "퇴사",
  dismissed: "해고·계약종료",
});

const EVIDENCE_LABELS = Object.freeze({
  employmentContract: "근로계약서",
  payslip: "급여명세서",
  bankHistory: "급여 입금 계좌내역",
  attendanceRecord: "출퇴근·근무시간 기록",
  messagesWithEmployer: "회사와 주고받은 지급 관련 메시지",
});

const EVIDENCE_STATUS = Object.freeze({
  have: "보유",
  planned: "확보 예정",
  missing: "없음",
  unknown: "미확인",
});

function won(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${Math.round(n).toLocaleString("ko-KR")}원` : "미확인";
}

function line(label, value) {
  return `- ${label}: ${value || "미확인"}`;
}

function range(start, end) {
  if (start && end) return `${start} ~ ${end}`;
  return start || end || "미확인";
}

export function buildWageCaseReport({ case: caseData, intake, money, legal, documents, officialProcedure, nextAction } = {}) {
  if (!caseData) return null;
  const facts = caseData.facts || {};
  const evidence = facts.evidence || {};
  const sources = legal?.sources || caseData.legal_sources || [];
  const docs = documents || caseData.documents || [];
  const issues = intake?.issues || caseData.issues || [];

  const sections = [
    "인사야 임금체불 사건 요약",
    `사건 ID: ${caseData.id}`,
    `작성 기준: ${money?.asOfDate || new Date().toISOString().slice(0, 10)}`,
    "",
    "[확인된 사실]",
    line("근로 상태", STATUS_LABELS[facts.employmentStatus] || facts.employmentStatus),
    line("근무기간", range(facts.employmentStartDate, facts.employmentEndDate || (facts.employmentStatus === "employed" ? "재직 중" : ""))),
    line("미지급 기간", range(facts.unpaidPeriodStart, facts.unpaidPeriodEnd)),
    line("원래 지급일", facts.payDay),
    line("미지급 항목", Array.isArray(facts.unpaidItems) ? facts.unpaidItems.join(", ") : ""),
    "",
    "[금액]",
    line("확인된 미지급 원금", won(money?.principal)),
    line("법정 가산 추정", won(money?.premiumEstimate)),
    line("지연이자 추정", won(money?.delayInterestEstimate)),
    line("현재 계산 가능 합계", won(money?.knownTotalEstimate)),
    line("적용 기준일", money?.referenceDate || legal?.referenceDate),
  ];

  if (money?.limitations?.length) {
    sections.push("", "[계산 한계]");
    for (const item of money.limitations) sections.push(`- ${item}`);
  }

  sections.push("", "[현재 쟁점]");
  if (issues.length) for (const issue of issues) sections.push(`- ${issue}`);
  else sections.push("- 추가 쟁점 미확인");

  sections.push("", "[증거 상태]");
  for (const [id, label] of Object.entries(EVIDENCE_LABELS)) {
    sections.push(line(label, EVIDENCE_STATUS[evidence[id] || "unknown"] || "미확인"));
  }

  sections.push("", "[다음 행동]");
  sections.push(`- ${nextAction?.title || "사건 내용 검토"}`);
  if (nextAction?.description) sections.push(`- 안내: ${nextAction.description}`);

  sections.push("", "[추천 문서]");
  if (docs.length) for (const doc of docs) sections.push(`- ${doc.title}`);
  else sections.push("- 없음");

  sections.push("", "[공식 근거]");
  if (sources.length) {
    for (const source of sources) {
      sections.push(`- ${source.article || source.title} · ${source.authority} · ${source.url}`);
    }
  } else {
    sections.push("- 현재 연결된 공식 근거 없음");
  }

  if (officialProcedure) {
    sections.push("", "[공식 절차]", `- ${officialProcedure.title}: ${officialProcedure.url}`);
  }

  sections.push(
    "",
    "※ 이 요약은 사용자가 입력한 사실과 시스템 계산을 정리한 참고자료입니다. 실제 권리·청구액은 추가 사실과 적용 법령에 따라 달라질 수 있습니다."
  );

  return {
    title: "임금체불 사건 요약",
    text: sections.join("\n"),
    generatedAt: new Date().toISOString(),
    caseId: caseData.id,
  };
}
