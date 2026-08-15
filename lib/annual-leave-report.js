const won=(value)=>Number.isFinite(Number(value))?`${Math.round(Number(value)).toLocaleString("ko-KR")}원`:"추가 확인 필요";

export function buildAnnualLeaveCaseReport(result = {}) {
  const facts=result.case?.facts || {};
  const legal=result.legal || {};
  const latest=legal.entitlement?.latestAnnualGrant || {};
  const evidence=result.intake?.evidence || {};
  const sourceLines=(legal.sources || []).map((source)=>`- ${source.article || source.title} · ${source.authority} · ${source.url}`).join("\n") || "- 추가 확인 필요";
  const evidenceLines=Object.entries(evidence.items || {}).map(([key,value])=>`- ${key}: ${value}`).join("\n") || "- 미확인";
  const text=`인사야 연차유급휴가·미사용수당 사건 요약

[사건 기준]
- 기준일: ${facts.referenceDate || "미확인"}
- 근무기간: ${facts.employmentStartDate || "미확인"} ~ ${facts.employmentEndDate || "재직 중"}
- 상시근로자 수 입력: ${facts.workplaceEmployeeCount ?? "미확인"}명
- 평균 주 소정근로시간: ${facts.averageWeeklyScheduledHours ?? "미확인"}시간
- 법률 버전: ${legal.legalVersion?.id || "지원범위 재확인 필요"}

[연차 발생 baseline]
- 최초 1년 월 단위 발생: ${legal.entitlement?.firstYearMonthlyAccrued ?? "미확인"}일
- 최신 연차 발생일: ${latest.grantDate || "아직 발생 전/미확인"}
- 최신 연차 발생일수: ${latest.days ?? "추가 확인 필요"}일
- 발생 상태: ${latest.status || "미확인"}
※ 여러 과거 연차연도의 미사용수당을 자동 합산한 값이 아닙니다.

[미사용수당 잠정 계산]
- 사용자가 확인한 미사용 연차: ${facts.claimedUnusedDays ?? "미확인"}일
- 1일 휴가임금 기준액: ${won(facts.dailyLeavePayAmount)}
- 잠정 총액: ${won(legal.money?.potentialGross)}
- 기지급액: ${won(legal.money?.paidAmount ?? facts.amountAlreadyPaid)}
- 예상 미지급액: ${won(legal.money?.outstandingEstimate)}
- 계산 상태: ${legal.money?.status || "미확인"}

[사용촉진·사용제한]
- 회사 사용촉진 실시 여부: ${facts.usePromotionImplemented === true ? "예" : facts.usePromotionImplemented === false ? "아니오" : "미확인"}
- 사용자 귀책으로 사용하지 못한 사정: ${facts.employerPreventedUse === true ? "예" : facts.employerPreventedUse === false ? "아니오" : "미확인"}

[증거]
${evidenceLines}

[공식 근거]
${sourceLines}

[다음 행동]
- ${result.nextAction?.title || "추가 사실 확인"}
${result.nextAction?.description || ""}

[주의]
이 요약은 입력된 사실을 기준으로 한 자동 정리입니다. 상시근로자 수 산정, 출근율, 연차 사용촉진의 적법성, 과거 연차연도별 발생·사용내역은 실제 자료로 재검토해야 합니다.`;
  return { caseId:result.case?.id, title:"연차유급휴가·미사용수당 사건 요약", text, generatedAt:new Date().toISOString() };
}
