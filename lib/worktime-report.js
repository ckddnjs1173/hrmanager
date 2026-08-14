const EVIDENCE_LABELS = Object.freeze({
  employmentContract: "근로계약서",
  attendanceRecord: "출퇴근기록",
  workSchedule: "근무표·스케줄",
  payslip: "급여명세서",
  bankHistory: "급여 입금내역",
});
const EVIDENCE_STATUS = Object.freeze({ have: "보유", planned: "확보 예정", missing: "없음", unknown: "미확인" });
const HOUR_LABELS = Object.freeze({
  weekdayOvertimeDayHours: "평일 연장(야간 제외)",
  weekdayOvertimeNightHours: "평일 연장+야간",
  holidayDayUpTo8Hours: "휴일 8시간 이내(야간 제외)",
  holidayNightUpTo8Hours: "휴일 8시간 이내+야간",
  holidayDayOver8Hours: "휴일 8시간 초과(야간 제외)",
  holidayNightOver8Hours: "휴일 8시간 초과+야간",
});
function won(value) {
  if (value === null || value === undefined || value === "") return "미확인";
  const n = Number(value);
  return Number.isFinite(n) ? `${Math.round(n).toLocaleString("ko-KR")}원` : "미확인";
}

export function buildWorktimeCaseReport({ case: caseData, intake, legal, documents, procedures, nextAction } = {}) {
  if (!caseData) return null;
  const facts = caseData.facts || {};
  const evidence = facts.evidence || {};
  const sources = legal?.sources || caseData.legal_sources || [];
  const lines = [
    "인사야 근로시간·연장/야간/휴일수당 사건 요약",
    `사건 ID: ${caseData.id}`,
    `작성일: ${new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })}`,
    "",
    "[적용 기준]",
    `- 기준일: ${facts.referenceDate || "미확인"}`,
    `- 상시근로자 수: ${facts.workplaceEmployeeCount ?? "미확인"}`,
    `- 상시 5명 이상 baseline: ${legal?.fivePlus === true ? "예" : legal?.fivePlus === false ? "아니오" : "미확인"}`,
    `- 일반 고정근로시간제: ${facts.standardWorkSystem === true ? "예" : facts.standardWorkSystem === false ? "아니오" : "미확인"}`,
    `- 통상시급: ${won(facts.ordinaryHourlyWage)}`,
    `- 추가근로 기본임금 이미 지급: ${facts.baseWageForExtraHoursPaid === true ? "예" : facts.baseWageForExtraHoursPaid === false ? "아니오" : "미확인"}`,
    "",
    "[시간 버킷]",
  ];
  for (const [key, label] of Object.entries(HOUR_LABELS)) lines.push(`- ${label}: ${facts[key] ?? "미확인"}시간`);
  lines.push(
    "",
    "[계산]",
    `- 계산 상태: ${legal?.premium?.status || "미확인"}`,
    `- 계산 대상 총액: ${won(legal?.premium?.grossEstimate)}`,
    `- 이미 지급된 수당: ${won(legal?.premium?.alreadyPaidAmount)}`,
    `- 예상 미지급액: ${won(legal?.premium?.outstandingEstimate)}`,
    `- 주 최대 연장근로: ${facts.maxWeeklyOvertimeHours ?? "미확인"}시간`,
    `- 주 12시간 연장한도 baseline: ${legal?.weeklyOvertime?.status || "미확인"}`,
    `- 대표 근무일 휴게: ${legal?.break?.providedMinutes ?? "미확인"}분 / 필요 baseline ${legal?.break?.requiredMinutes ?? "미확인"}분`,
  );
  if (legal?.warnings?.length) lines.push("", "[재검토 플래그]", ...legal.warnings.map((item) => `- ${item}`));
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
  lines.push("", "※ 이 계산은 입력한 시간 버킷이 서로 겹치지 않는 일반 고정근로시간제 baseline입니다. 탄력·선택·재량근로, 감시·단속적 근로 등은 별도 검토가 필요합니다.");
  return { title: "근로시간·연장/야간/휴일수당 사건 요약", text: lines.join("\n"), generatedAt: new Date().toISOString(), caseId: caseData.id };
}
