const TYPE_LABELS = Object.freeze({
  severance_pay: "퇴직금제도",
  db_pension: "DB형 퇴직연금",
  dc_pension: "DC형 퇴직연금",
  unknown: "퇴직급여 유형 미확인",
});
const EVIDENCE_LABELS = Object.freeze({
  employmentContract: "근로계약서",
  payslips3m: "퇴직 전 3개월 급여명세서",
  bankHistory: "급여·퇴직급여 입금내역",
  retirementPlanStatement: "퇴직연금 가입·운용 명세서",
  attendanceRecord: "근무시간 기록",
});
const EVIDENCE_STATUS = Object.freeze({ have: "보유", planned: "확보 예정", missing: "없음", unknown: "미확인" });

function won(value) {
  if (value === null || value === undefined || value === "") return "미확인";
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number).toLocaleString("ko-KR")}원` : "미확인";
}

export function buildRetirementCaseReport({ case: caseData, intake, legal, documents, procedures, nextAction } = {}) {
  if (!caseData) return null;
  const facts = caseData.facts || {};
  const evidence = facts.evidence || {};
  const sources = legal?.sources || caseData.legal_sources || [];
  const lines = [
    "인사야 퇴직금·퇴직연금 사건 요약",
    `사건 ID: ${caseData.id}`,
    `작성일: ${new Date().toISOString().slice(0, 10)}`,
    "",
    "[근속·제도]",
    `- 퇴직급여 유형: ${TYPE_LABELS[facts.benefitType] || "미확인"}`,
    `- 입사일: ${facts.employmentStartDate || "미확인"}`,
    `- 퇴직일(마지막 근무일 다음날): ${facts.retirementDate || "미확인"}`,
    `- 평균 주 소정근로시간: ${facts.averageWeeklyScheduledHours ?? "미확인"}시간`,
    `- 주 15시간 미만 기간 존재: ${facts.hadUnder15HourPeriods === true ? "예" : facts.hadUnder15HourPeriods === false ? "아니오" : "미확인"}`,
    "",
    "[적용·계산]",
    `- 적용 baseline: ${legal?.eligibility?.status || "미확인"}`,
    `- 전체 재직일수: ${legal?.eligibility?.serviceDays ?? "미확인"}일`,
    `- 계산 대상 계속근로일수: ${legal?.eligibility?.qualifyingServiceDays ?? "미확인"}일`,
    `- 1일 평균임금: ${won(legal?.averageWage?.amount)}`,
    `- 예상 법정액/납입의무 총액: ${won(legal?.money?.statutoryEstimate)}`,
    `- 기지급·기납입액: ${won(legal?.money?.paidAmount)}`,
    `- 예상 미지급액: ${won(legal?.money?.outstandingEstimate)}`,
    `- 기본 지급기한: ${legal?.payment?.dueDate || "제도별 확인"}`,
    `- 지급기한 경과 여부: ${legal?.payment?.late ? "경과 가능" : "현재 입력상 미경과/제도별 확인"}`,
  ];

  if (legal?.averageWage?.period) {
    lines.push(`- 평균임금 산정기간: ${legal.averageWage.period.start} ~ ${legal.averageWage.period.end} (${legal.averageWage.period.days}일)`);
  }
  if (legal?.warnings?.length) {
    lines.push("", "[재검토 플래그]", ...legal.warnings.map((item) => `- ${item}`));
  }
  lines.push("", "[증거 상태]");
  for (const [key, label] of Object.entries(EVIDENCE_LABELS)) lines.push(`- ${label}: ${EVIDENCE_STATUS[evidence[key] || "unknown"]}`);
  lines.push("", "[다음 행동]", `- ${nextAction?.title || "사건 내용 검토"}`);
  if (nextAction?.description) lines.push(`- 안내: ${nextAction.description}`);
  lines.push("", "[추천 문서]");
  (documents?.length ? documents : [{ title: "현재 자동 추천 문서 없음" }]).forEach((doc) => lines.push(`- ${doc.title}`));
  lines.push("", "[공식 절차]");
  (procedures?.length ? procedures : [{ title: "현재 자동 연결 절차 없음", url: "" }]).forEach((item) => lines.push(`- ${item.title}${item.url ? `: ${item.url}` : ""}`));
  lines.push("", "[공식 근거]");
  if (sources.length) sources.forEach((source) => lines.push(`- ${source.article || source.title} · ${source.authority} · ${source.url}`));
  else lines.push("- 현재 연결 근거 없음");
  lines.push("", "※ 평균임금 제외기간, 주 15시간 미만 기간, DB/DC형 운용내역이 있으면 실제 퇴직급여는 추가 자료에 따라 달라질 수 있습니다.");
  return { title: "퇴직금·퇴직연금 사건 요약", text: lines.join("\n"), generatedAt: new Date().toISOString(), caseId: caseData.id };
}
