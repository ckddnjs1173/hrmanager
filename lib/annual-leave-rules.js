import { normalizeAnnualLeaveFacts } from "./annual-leave-intake.js";

const VERIFIED_AT = "2026-08-16";

export const ANNUAL_LEAVE_SOURCES = Object.freeze({
  ARTICLE18: Object.freeze({ id:"source.lsa.article18.short_time", authority:"국가법령정보센터", title:"근로기준법 제18조 단시간근로자의 근로조건", article:"근로기준법 제18조제3항", url:"https://www.law.go.kr/LSW/lsLinkProc.do?joNo=001800&lnkJoNo=undefined&lsClsCd=L&lsId=001872&lsNm=%EA%B7%BC%EB%A1%9C%EA%B8%B0%EC%A4%80%EB%B2%95&mode=4", verifiedAt:VERIFIED_AT }),
  ARTICLE60_CURRENT: Object.freeze({ id:"source.lsa.article60.2025_10_23", authority:"국가법령정보센터", title:"근로기준법 제60조 연차 유급휴가", article:"근로기준법 제60조", url:"https://www.law.go.kr/LSW/lsInfoP.do?chrClsCd=010202&efYd=20251023&joNo=002300&lsiSeq=265959&urlMode=lsInfoP", verifiedAt:VERIFIED_AT }),
  ARTICLE60_20260820: Object.freeze({ id:"source.lsa.article60.2026_08_20", authority:"국가법령정보센터", title:"근로기준법 제60조 연차 유급휴가 [2026.8.20 시행]", article:"근로기준법 제60조", url:"https://www.law.go.kr/LSW/lsInfoP.do?ancNo=21373&ancYd=20260219&efYd=20260820&lsiSeq=283457", verifiedAt:VERIFIED_AT }),
  ARTICLE60_20270610: Object.freeze({ id:"source.lsa.article60.2027_06_10", authority:"국가법령정보센터", title:"근로기준법 제60조 연차 유급휴가 [2027.6.10 시행 예정]", article:"근로기준법 제60조", url:"https://www.law.go.kr/LSW/lsInfoP.do?ancYnChk=0&chrClsCd=010202&efYd=20270610&lsiSeq=286771&urlMode=lsEfInfoR&viewCls=lsRvsDocInfoR", verifiedAt:VERIFIED_AT }),
  ARTICLE61: Object.freeze({ id:"source.lsa.article61", authority:"국가법령정보센터", title:"근로기준법 제61조 연차 유급휴가의 사용 촉진", article:"근로기준법 제61조", url:"https://www.law.go.kr/lsLinkProc.do?ancYd=20160302&joNo=006100000&lsClsCd=L&lsId=2031481&lsNm=%EA%B7%BC%EB%A1%9C%EA%B8%B0%EC%A4%80%EB%B2%95&mode=4", verifiedAt:VERIFIED_AT }),
  SCOPE: Object.freeze({ id:"source.lsa_decree.article7_2", authority:"국가법령정보센터", title:"근로기준법 시행령 제7조의2 상시 사용하는 근로자 수의 산정 방법", article:"근로기준법 시행령 제7조의2", url:"https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=270551", verifiedAt:VERIFIED_AT }),
  ONE_YEAR_CASE: Object.freeze({ id:"source.supreme.2021da227100", authority:"대법원·국가법령정보센터", title:"대법원 2021.10.14. 선고 2021다227100 판결", article:"대법원 2021다227100", url:"https://www.law.go.kr/LSW/precInfoP.do?precSeq=219067", verifiedAt:VERIFIED_AT }),
});

function parseIso(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y,m,d] = value.split("-").map(Number);
  return new Date(Date.UTC(y,m-1,d));
}
function dateToIso(date) { return date.toISOString().slice(0,10); }
function addMonthsClamped(value, months) {
  const date = parseIso(value); if (!date) return null;
  const y=date.getUTCFullYear(), m=date.getUTCMonth(), d=date.getUTCDate();
  const first=new Date(Date.UTC(y,m+months,1));
  const last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
  return dateToIso(new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth(),Math.min(d,last))));
}
function minIso(a,b) { if (!a) return b; if (!b) return a; return a < b ? a : b; }
function relationExistsOn(date, facts) {
  if (!date || !facts.employmentStartDate || date < facts.employmentStartDate) return false;
  return !facts.employmentEndDate || date <= facts.employmentEndDate;
}
function unique(items) { const seen=new Set(); return items.filter((item)=>item?.id&&!seen.has(item.id)&&seen.add(item.id)); }

export function selectAnnualLeaveLegalVersion(referenceDate) {
  if (!referenceDate) return null;
  if (referenceDate >= "2027-06-10") return { id:"lsa-annual-2027-06-10", effectiveFrom:"2027-06-10", source:ANNUAL_LEAVE_SOURCES.ARTICLE60_20270610, hourlySplitAvailable:true };
  if (referenceDate >= "2026-08-20") return { id:"lsa-annual-2026-08-20", effectiveFrom:"2026-08-20", source:ANNUAL_LEAVE_SOURCES.ARTICLE60_20260820, hourlySplitAvailable:false };
  if (referenceDate >= "2020-03-31") return { id:"lsa-annual-2020-03-31-baseline", effectiveFrom:"2020-03-31", source:ANNUAL_LEAVE_SOURCES.ARTICLE60_CURRENT, hourlySplitAvailable:false };
  return null;
}

function completedFirstYearMonthlyAccruals(facts, asOf) {
  if (!facts.employmentStartDate || !asOf) return null;
  let count=0;
  for (let month=1; month<=11; month+=1) {
    const accrualDate=addMonthsClamped(facts.employmentStartDate,month);
    if (accrualDate && accrualDate <= asOf && relationExistsOn(accrualDate,facts)) count+=1;
  }
  return count;
}

function latestAnnualGrant(facts, asOf) {
  if (!facts.employmentStartDate || !asOf) return null;
  let completedYears=0;
  let grantDate=null;
  for (let year=1; year<=60; year+=1) {
    const date=addMonthsClamped(facts.employmentStartDate,year*12);
    if (!date || date > asOf || !relationExistsOn(date,facts)) break;
    completedYears=year; grantDate=date;
  }
  if (!completedYears) return { status:"not_accrued_yet", completedYears:0, grantDate:null, days:0 };
  if (facts.fivePlusContinuouslyPastYear !== true) {
    return { status:facts.fivePlusContinuouslyPastYear === false ? "annual_scope_not_confirmed" : "needs_five_plus_year_scope", completedYears, grantDate, days:null };
  }
  if (facts.attendanceRatePercent === null) return { status:"needs_attendance_rate", completedYears, grantDate, days:null };
  if (facts.attendanceRatePercent < 80) {
    if (facts.fullAttendanceMonthsPreviousYear === null) return { status:"needs_full_attendance_months", completedYears, grantDate, days:null };
    return { status:"monthly_accrual_due_low_attendance", completedYears, grantDate, days:facts.fullAttendanceMonthsPreviousYear, attendanceRatePercent:facts.attendanceRatePercent };
  }
  const days=Math.min(25,15+Math.floor((completedYears-1)/2));
  return { status:"annual_grant_calculated", completedYears, grantDate, days, attendanceRatePercent:facts.attendanceRatePercent };
}

function scopeAssessment(facts) {
  if (facts.averageWeeklyScheduledHours === null || facts.workplaceEmployeeCount === null) return { status:"needs_input", eligible:null };
  if (facts.averageWeeklyScheduledHours < 15) return { status:"under_15_hours", eligible:false };
  if (facts.workplaceEmployeeCount < 5) return { status:"small_workplace_baseline", eligible:false, limitation:"상시근로자 수는 법정 산정방식으로 재확인해야 하며, 현재 입력한 인원만으로 과거 기간 전체를 확정하지 않습니다." };
  return { status:"five_plus_provisional", eligible:true, limitation:"제60조 적용 여부의 상시근로자 수는 시행령 제7조의2의 기간별 산정방식으로 최종 확인해야 합니다." };
}

function moneyAssessment(facts, scope) {
  if (scope.eligible === false) return { status:"scope_not_eligible_baseline", potentialGross:0, outstandingEstimate:0 };
  if (scope.eligible !== true) return { status:"scope_needs_review", potentialGross:null, outstandingEstimate:null };
  if (facts.claimedUnusedDays === null || facts.dailyLeavePayAmount === null || facts.amountAlreadyPaid === null) {
    return { status:"money_inputs_needed", potentialGross:null, outstandingEstimate:null };
  }
  const potentialGross=Math.round(facts.claimedUnusedDays*facts.dailyLeavePayAmount);
  if (facts.employerPreventedUse === true || facts.usePromotionImplemented === false) {
    return { status:facts.employerPreventedUse === true ? "estimated_employer_prevented_use" : "estimated_no_use_promotion", potentialGross, paidAmount:Math.round(facts.amountAlreadyPaid), outstandingEstimate:Math.max(0,potentialGross-Math.round(facts.amountAlreadyPaid)) };
  }
  if (facts.usePromotionImplemented === true) {
    return { status:"use_promotion_effect_needs_review", potentialGross, paidAmount:Math.round(facts.amountAlreadyPaid), outstandingEstimate:null, limitation:"사용촉진을 했다는 사실만으로 수당 면제를 자동 확정하지 않습니다. 법정 시기·서면 절차와 사용자 귀책 여부를 확인해야 합니다." };
  }
  return { status:"use_promotion_status_needed", potentialGross, paidAmount:Math.round(facts.amountAlreadyPaid), outstandingEstimate:null };
}

export function getAnnualLeaveLegalContext(input = {}) {
  const facts=normalizeAnnualLeaveFacts(input);
  const version=selectAnnualLeaveLegalVersion(facts.referenceDate);
  const asOf=minIso(facts.referenceDate,facts.employmentEndDate || facts.referenceDate);
  const scope=scopeAssessment(facts);
  const firstYearMonthlyAccrued=scope.eligible === true ? completedFirstYearMonthlyAccruals(facts,asOf) : 0;
  const annualGrant=scope.eligible === true ? latestAnnualGrant(facts,asOf) : { status:"scope_not_eligible_baseline", days:0, grantDate:null, completedYears:0 };
  const money=moneyAssessment(facts,scope);
  const warnings=[];
  if (!version) warnings.push("annual_leave_legal_version_unsupported_before_2020_03_31");
  if (scope.limitation) warnings.push("employee_count_scope_requires_statutory_recheck");
  if (annualGrant.status === "needs_five_plus_year_scope") warnings.push("annual_grant_requires_five_plus_continuity_check");
  if (money.status === "use_promotion_effect_needs_review") warnings.push("use_promotion_requires_deadline_and_written_notice_review");
  if (facts.employmentStatus === "ended" && facts.employmentStartDate && facts.employmentEndDate) {
    const firstAnniversary=addMonthsClamped(facts.employmentStartDate,12);
    if (firstAnniversary && facts.employmentEndDate < firstAnniversary) warnings.push("employment_ended_before_first_annual_grant");
  }
  if (version?.hourlySplitAvailable) warnings.push("hourly_annual_leave_split_effective_2027_06_10_requires_decree_limits");

  const sources=[ANNUAL_LEAVE_SOURCES.ARTICLE18,version?.source,ANNUAL_LEAVE_SOURCES.ARTICLE61,ANNUAL_LEAVE_SOURCES.SCOPE,ANNUAL_LEAVE_SOURCES.ONE_YEAR_CASE].filter(Boolean);
  return {
    referenceDate:facts.referenceDate,
    asOfDate:asOf,
    legalVersion:version,
    scope,
    entitlement:{ firstYearMonthlyAccrued, latestAnnualGrant:annualGrant, limitation:"발생일수는 최신 발생 코호트와 최초 1년 월 단위 발생 baseline을 보여줍니다. 여러 과거 연차연도의 미사용수당을 자동 합산하지 않으며 실제 청구일수는 사용자의 연차대장으로 확인합니다." },
    money,
    sources:unique(sources),
    warnings,
    verifiedAt:VERIFIED_AT,
  };
}
