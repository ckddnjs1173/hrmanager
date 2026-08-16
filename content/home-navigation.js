// Canonical runtime source for the legacy home information architecture.
// The legacy index.html still contains a fallback copy while the monolith is migrated incrementally.
window.INSAYA_HOME_NAV = Object.freeze({
  SITES: Object.freeze({
    worker: Object.freeze({ wm: "근로자", tag: "근로자를 위한 노무 정보" }),
    employer: Object.freeze({ wm: "사업주", tag: "사업주·인사담당자를 위한 노무 관리" }),
  }),
  CATS: Object.freeze({
    worker: Object.freeze([
      { c: "wage", label: "임금·수당", intro: "밀린 월급·주휴·연장수당·명세서, 받는 법.", arts: ["wage", "holiday", "payslip", "worktime"], facts: [["3년", "임금채권 소멸시효"], ["10,320원", "2026 최저시급"], ["1.5배", "연장·야간·휴일"]], calc: "net", pack: "wage_worker" },
      { c: "severance", label: "퇴직·실업", intro: "퇴직금·퇴직연금·실업급여·대지급금.", arts: ["severance", "pension", "unemployment", "daebul"], facts: [["1년", "퇴직금 발생 근속"], ["14일", "퇴직 후 지급기한"], ["180일", "실업급여 가입요건"]], calc: "severance", pack: "resign_worker" },
      { c: "fire", label: "해고·괴롭힘", intro: "부당해고·정리해고·괴롭힘·성희롱 대응.", arts: ["fire", "layoff", "harass", "sexharass"], facts: [["3개월", "구제신청 기한"], ["30일", "해고예고"], ["5인", "구제 보호 기준"]], calc: "notice", pack: "fire_worker" },
      { c: "contract", label: "계약·신분", intro: "근로계약·수습·비정규직·청소년·5인 미만.", arts: ["contract", "probation", "nonreg", "youthjob", "smallbiz"], facts: [["서면", "계약서 교부"], ["2년", "기간제 무기전환"], ["15시간", "주휴·연차 기준"]], calc: "", pack: "" },
      { c: "protect", label: "모성·산재·차별", intro: "출산·육아휴직·산재보상·고용차별.", arts: ["maternity", "injury", "equality"], facts: [["90일", "출산전후휴가"], ["70%", "산재 휴업급여"], ["6개월", "차별시정 기한"]], calc: "injurypay", pack: "" },
      { c: "help", label: "절차·지원·예방", intro: "노동 행정절차·국민취업지원·취업사기.", arts: ["procedure", "jobsupport", "jobscam"], facts: [["무료", "진정·구제신청"], ["50만원", "구직촉진수당"], ["112", "취업사기 신고"]], calc: "", pack: "" },
      { c: "report", label: "신고·구제", intro: "노동청 진정 절차와 준비물.", arts: [], action: "report" },
    ]),
    employer: Object.freeze([
      { c: "risk", label: "리스크·안전", intro: "노무 리스크 진단·중대재해처벌법.", arts: ["emp_risk", "severeaccident"], facts: [["5인", "법 적용 분기점"], ["2024", "중대재해 5인 확대"], ["정기", "자체 점검"]], calc: "audit", pack: "" },
      { c: "hire", label: "채용·계약", intro: "유형별 근로계약서·청소년 고용.", arts: ["emp_contract", "emp_minor"], facts: [["서면", "계약서 작성 의무"], ["당일", "계약서 교부"], ["90%", "수습 최저임금 하한"]], calc: "", pack: "hire_employer" },
      { c: "fire", label: "해고·인사문서", intro: "해고 점검·경고장·시말서·권고사직.", arts: ["emp_fire", "emp_doc"], facts: [["정당사유", "해고 요건"], ["서면통지", "근기법 제27조"], ["30일", "해고예고"]], calc: "notice", pack: "fire_employer" },
      { c: "pay", label: "임금·근태", intro: "연장·야간·휴일·주휴·연차 관리.", arts: ["emp_pay", "emp_annual"], facts: [["1.5배", "연장·야간·휴일"], ["209h", "월 소정(주40)"], ["매월", "명세서 교부"]], calc: "ot", pack: "" },
      { c: "rule", label: "규정·지원금", intro: "취업규칙·고용장려금(사업주 지원).", arts: ["emp_rule", "empsubsidy"], facts: [["10인", "취업규칙 의무"], ["720만원", "청년채용 지원"], ["3년", "문서 보존"]], calc: "laborcost", pack: "" },
      { c: "advice", label: "자문", intro: "기업 자문 노무사 찾기.", arts: [], action: "nomu" },
    ]),
  }),
});