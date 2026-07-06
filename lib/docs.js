// 문서센터 — 고용노동부 표준양식을 충실히 반영한 "완본" 서식 HTML.
// 빈 칸으로 생성해도 표준 조항·안내(※)·체크항목·유의사항이 모두 포함되도록 작성.
// renderDoc() → {title, html, text}. 표준양식(공개) 기반 참고용이며 법률 효력 보장 X.

const b = (v) => (v && String(v).trim() ? String(v).trim() : "____");
const won = (v) => { const n = Number(String(v ?? "").replace(/[^\d]/g, "")); return n ? n.toLocaleString("ko-KR") + "원" : "____원"; };
const stripTags = (s) => s.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(tr|p|div|li|h2)>/gi, "\n").replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").replace(/[ \t]+\n/g, "\n").trim();

const T = (t) => `<h2 class="dt">${t}</h2>`;
const lead = (t) => `<p class="dlead">${t}</p>`;
const sub = (t) => `<div class="dsub">${t}</div>`;
const note = (t) => `<p class="dmini">※ ${t}</p>`;
const kv = (rows) => `<table class="dform">${rows.map((r) => `<tr><th>${r[0]}</th><td>${r[1]}</td></tr>`).join("")}</table>`;
const cols = (head, rows) => `<table class="dform"><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</table>`;
const clauses = (items) => `<ol class="dclauses">${items.map((t) => `<li>${t}</li>`).join("")}</ol>`;
const dateLine = () => `<p class="ddate">${"____ 년 ____ 월 ____ 일"}</p>`;
const sealRight = (who) => `<div class="dsign">${who} <span class="seal">(서명 또는 인)</span></div>`;
const recv = (to, from) => `<table class="drecv"><tr><th>수&nbsp;신</th><td>${to}</td></tr><tr><th>발&nbsp;신</th><td>${from}</td></tr></table>`;
const guide = (items) => `<div class="dguide"><div class="gt">📌 작성·법적 안내</div><ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul></div>`;

export const DOC_GROUPS = [
  { g: "근로계약", icon: "📝" }, { g: "임금", icon: "💵" },
  { g: "해고·징계", icon: "⚖️" }, { g: "근태·증명", icon: "🗂️" }, { g: "근로자 대응", icon: "🙋" },
];

export const DOC_TEMPLATES = {
  // ============ 근로계약 ============
  contract: {
    title: "표준근로계약서 (정규직)", group: "근로계약", std: true, em: "📝",
    fields: [
      { name: "biz", label: "사업체명" }, { name: "ceo", label: "대표자" }, { name: "bizAddr", label: "사업장 주소" }, { name: "bizTel", label: "사업장 전화" },
      { name: "worker", label: "근로자 성명" }, { name: "workerAddr", label: "근로자 주소" }, { name: "workerTel", label: "근로자 연락처" },
      { name: "start", label: "근로개시일", placeholder: "예: 2026-07-01" },
      { name: "workplace", label: "근무장소" }, { name: "job", label: "업무 내용" },
      { name: "startTime", label: "시업 시각", placeholder: "09:00" }, { name: "endTime", label: "종업 시각", placeholder: "18:00" }, { name: "breakTime", label: "휴게시간", placeholder: "12:00~13:00" },
      { name: "days", label: "근무일", placeholder: "주 5일(월~금)" }, { name: "holidayDay", label: "주휴일", placeholder: "일" },
      { name: "pay", label: "월(시간)급" }, { name: "bonus", label: "상여금(있으면)" }, { name: "otherPay", label: "기타급여·제수당(있으면)" }, { name: "payDay", label: "임금지급일", placeholder: "25" },
    ],
    html: (v) => T("표 준 근 로 계 약 서") +
      lead(`${b(v.biz)}(이하 "사업주"라 함)과(와) ${b(v.worker)}(이하 "근로자"라 함)은 다음과 같이 근로계약을 체결한다.`) +
      kv([
        ["1. 근로개시일", `${b(v.start)} 부터<br/><span class="dmini">※ 근로계약기간을 정하는 경우에는 "${b(v.start)}부터 ____년 ____월 ____일까지" 등으로 기재한다.</span>`],
        ["2. 근 무 장 소", v.workplace ? b(v.workplace) : b(v.biz)],
        ["3. 업무의 내용", b(v.job)],
        ["4. 소정근로시간", `${b(v.startTime)} 부터 ${b(v.endTime)} 까지 (휴게시간 : ${b(v.breakTime)})`],
        ["5. 근무일 / 휴일", `매주 ${b(v.days)} 근무, 주휴일은 매주 ${b(v.holidayDay)}요일`],
      ]) +
      sub("6. 임 금") +
      kv([
        ["월(일·시간)급", b(v.pay)],
        ["상여금", v.bonus ? `있음 ( O )  ${b(v.bonus)}` : "있음 (   )  ____원        없음 (   )"],
        ["기타급여(제수당 등)", v.otherPay ? `있음 ( O )  ${b(v.otherPay)}` : "있음 (   )  ( ____원 ,  ____원 )        없음 (   )"],
        ["임금지급일", `매월(매주 또는 매일) ${b(v.payDay)}일 (휴일의 경우는 전일 지급)`],
        ["지급방법", "근로자에게 직접지급 (   )        근로자 명의 예금통장에 입금 (   )"],
      ]) +
      clauses([
        "<b>연차유급휴가</b><br/>연차유급휴가는 근로기준법에서 정하는 바에 따라 부여한다.",
        "<b>사회보험 적용여부</b>(해당란에 체크)<br/>□ 고용보험    □ 산재보험    □ 국민연금    □ 건강보험",
        "<b>근로계약서 교부</b><br/>사업주는 근로계약을 체결함과 동시에 본 계약서를 사본하여 근로자의 교부요구와 관계없이 근로자에게 교부한다(근로기준법 제17조 이행).",
        "<b>근로계약, 취업규칙 등의 성실한 이행의무</b><br/>사업주와 근로자는 각자가 근로계약, 취업규칙, 단체협약을 지키고 성실하게 이행하여야 한다.",
        "<b>기 타</b><br/>이 계약에 정함이 없는 사항은 근로기준법령에 의한다.",
      ]) + dateLine() +
      `<div class="dsign">(사업주) 사업체명 : ${b(v.biz)}　(전화 : ${b(v.bizTel)})<br/>주&nbsp;&nbsp;&nbsp;소 : ${b(v.bizAddr)}<br/>대표자 : ${b(v.ceo)} <span class="seal">(서명)</span><br/><br/>
      (근로자) 주&nbsp;&nbsp;&nbsp;소 : ${b(v.workerAddr)}<br/>연락처 : ${b(v.workerTel)}<br/>성&nbsp;&nbsp;&nbsp;명 : ${b(v.worker)} <span class="seal">(서명)</span></div>` +
      guide([
        "근로기준법 제17조: 임금(구성·계산·지급방법), 소정근로시간, 휴일, 연차유급휴가는 <b>반드시 서면 명시·교부</b>해야 합니다.",
        "1주 소정근로 15시간 이상이면 주휴수당·연차가 발생합니다.",
        "수습기간을 두는 경우 기간·수습 중 임금(최저임금의 90% 이상 등)을 별도 명시하세요.",
        "2026년 최저임금 시급 10,320원 이상이어야 합니다.",
      ]),
  },
  contract_fixed: {
    title: "표준근로계약서 (기간제)", group: "근로계약", std: true, em: "📝",
    fields: [
      { name: "biz", label: "사업체명" }, { name: "ceo", label: "대표자" }, { name: "bizAddr", label: "사업장 주소" }, { name: "bizTel", label: "사업장 전화" },
      { name: "worker", label: "근로자 성명" }, { name: "workerAddr", label: "근로자 주소" }, { name: "workerTel", label: "근로자 연락처" },
      { name: "start", label: "계약 시작일" }, { name: "end", label: "계약 종료일" },
      { name: "workplace", label: "근무장소" }, { name: "job", label: "업무 내용" },
      { name: "startTime", label: "시업 시각", placeholder: "09:00" }, { name: "endTime", label: "종업 시각", placeholder: "18:00" }, { name: "breakTime", label: "휴게시간" },
      { name: "days", label: "근무일" }, { name: "holidayDay", label: "주휴일", placeholder: "일" },
      { name: "pay", label: "임금" }, { name: "payDay", label: "임금지급일", placeholder: "25" },
    ],
    html: (v) => T("표 준 근 로 계 약 서 (기간제)") +
      lead(`${b(v.biz)}(이하 "사업주"라 함)과(와) ${b(v.worker)}(이하 "근로자"라 함)은 다음과 같이 근로계약을 체결한다.`) +
      kv([
        ["1. 근로계약기간", `${b(v.start)} 부터 ${b(v.end)} 까지`],
        ["2. 근 무 장 소", v.workplace ? b(v.workplace) : b(v.biz)],
        ["3. 업무의 내용", b(v.job)],
        ["4. 소정근로시간", `${b(v.startTime)} 부터 ${b(v.endTime)} 까지 (휴게시간 : ${b(v.breakTime)})`],
        ["5. 근무일 / 휴일", `매주 ${b(v.days)} 근무, 주휴일은 매주 ${b(v.holidayDay)}요일`],
      ]) +
      sub("6. 임 금") +
      kv([["월(일·시간)급", b(v.pay)], ["임금지급일", `매월 ${b(v.payDay)}일 (휴일의 경우는 전일 지급)`], ["지급방법", "근로자 명의 예금통장에 입금 (   )"]]) +
      clauses([
        "<b>연차유급휴가</b> : 근로기준법에서 정하는 바에 따라 부여한다.",
        "<b>사회보험 적용여부</b>(해당란 체크) : □ 고용보험  □ 산재보험  □ 국민연금  □ 건강보험",
        "<b>근로계약서 교부</b> : 체결과 동시에 사본하여 근로자에게 교부한다(근로기준법 제17조 이행).",
        "<b>성실한 이행의무</b> : 사업주와 근로자는 근로계약·취업규칙·단체협약을 성실히 이행한다.",
        "<b>기 타</b> : 이 계약에 정함이 없는 사항은 근로기준법령에 의한다.",
      ]) + dateLine() +
      `<div class="dsign">(사업주) 사업체명 : ${b(v.biz)}　(전화 : ${b(v.bizTel)})<br/>주소 : ${b(v.bizAddr)}<br/>대표자 : ${b(v.ceo)} <span class="seal">(서명)</span><br/><br/>
      (근로자) 주소 : ${b(v.workerAddr)}<br/>연락처 : ${b(v.workerTel)}<br/>성명 : ${b(v.worker)} <span class="seal">(서명)</span></div>` +
      guide(["기간제 2년 초과 사용 시 기간의 정함이 없는 근로자로 간주될 수 있습니다(기간제법).", "계약기간을 반드시 명시해야 합니다."]),
  },
  contract_parttime: {
    title: "표준근로계약서 (단시간)", group: "근로계약", std: true, em: "📝",
    fields: [
      { name: "biz", label: "사업체명" }, { name: "ceo", label: "대표자" }, { name: "bizAddr", label: "사업장 주소" }, { name: "bizTel", label: "사업장 전화" },
      { name: "worker", label: "근로자 성명" }, { name: "workerAddr", label: "근로자 주소" }, { name: "workerTel", label: "근로자 연락처" },
      { name: "start", label: "근로개시일" }, { name: "workplace", label: "근무장소" }, { name: "job", label: "업무 내용" },
      { name: "schedule", label: "근로일별 근로시간", full: true, placeholder: "예: 월 10:00~15:00(휴게 30분) / 수 10:00~15:00 / 금 10:00~15:00" },
      { name: "pay", label: "시급", placeholder: "10,320" }, { name: "payDay", label: "임금지급일", placeholder: "25" },
    ],
    html: (v) => T("표 준 근 로 계 약 서 (단시간근로자)") +
      lead(`${b(v.biz)}(이하 "사업주"라 함)과(와) ${b(v.worker)}(이하 "근로자"라 함)은 다음과 같이 근로계약을 체결한다.`) +
      kv([
        ["1. 근로개시일", `${b(v.start)} 부터`], ["2. 근 무 장 소", v.workplace ? b(v.workplace) : b(v.biz)], ["3. 업무의 내용", b(v.job)],
        ["4. 근로일·근로일별 근로시간", `${b(v.schedule)}<br/><span class="dmini">※ 단시간근로자는 근로일 및 근로일별 근로시간을 반드시 명시해야 한다.</span>`],
        ["5. 시 급", won(v.pay)], ["6. 임금지급일", `매월 ${b(v.payDay)}일 (계좌이체)`],
      ]) +
      clauses([
        "<b>주휴일</b> : 1주 소정근로시간이 15시간 이상이고 개근한 경우 유급 주휴를 부여한다.",
        "<b>연차유급휴가</b> : 통상근로자의 근로시간에 비례하여 부여한다.",
        "<b>사회보험 적용여부</b>(해당란 체크) : □ 고용보험  □ 산재보험  □ 국민연금  □ 건강보험",
        "<b>근로계약서 교부</b> : 체결과 동시에 근로자에게 교부한다(근로기준법 제17조 이행).",
        "<b>기 타</b> : 이 계약에 정함이 없는 사항은 근로기준법령에 의한다.",
      ]) + dateLine() +
      `<div class="dsign">(사업주) 사업체명 : ${b(v.biz)}　(전화 : ${b(v.bizTel)})<br/>주소 : ${b(v.bizAddr)}<br/>대표자 : ${b(v.ceo)} <span class="seal">(서명)</span><br/><br/>
      (근로자) 주소 : ${b(v.workerAddr)}<br/>연락처 : ${b(v.workerTel)}<br/>성명 : ${b(v.worker)} <span class="seal">(서명)</span></div>` +
      guide(["단시간근로자도 주 15시간 이상이면 주휴수당·연차·퇴직금 대상입니다.", "2026 최저임금 시급 10,320원 이상이어야 합니다."]),
  },

  // ============ 임금 ============
  payslip: {
    title: "임금명세서", group: "임금", std: true, em: "🧾",
    fields: [
      { name: "biz", label: "사업체명" }, { name: "worker", label: "성명" }, { name: "empno", label: "사번(또는 생년월일)" }, { name: "month", label: "지급 대상기간", placeholder: "예: 2026.7.1~7.31" }, { name: "payDate", label: "지급일", placeholder: "2026-07-25" },
      { name: "base", label: "기본급" }, { name: "ot", label: "연장근로수당" }, { name: "night", label: "야간근로수당" }, { name: "holiday", label: "휴일근로수당" }, { name: "etc", label: "기타수당(식대 등)" },
      { name: "otHours", label: "연장근로 시간수", placeholder: "예: 10" },
      { name: "pension", label: "국민연금" }, { name: "health", label: "건강보험" }, { name: "employ", label: "고용보험" }, { name: "tax", label: "소득세(+지방소득세)" },
    ],
    html: (v) => {
      const n = (x) => Number(String(x ?? "").replace(/[^\d]/g, "")) || 0;
      const base = n(v.base), ot = n(v.ot), night = n(v.night), hol = n(v.holiday), etc = n(v.etc);
      const pen = n(v.pension), hea = n(v.health), emp = n(v.employ), tax = n(v.tax);
      const gross = base + ot + night + hol + etc, ded = pen + hea + emp + tax, net = gross - ded;
      const f = (x) => x ? x.toLocaleString("ko-KR") + "원" : "____원";
      return T("임 금 명 세 서") +
        kv([["사업체명", b(v.biz)], ["성명", b(v.worker)], ["사번/생년월일", b(v.empno)], ["임금 지급일", b(v.payDate)], ["산정 기간", b(v.month)]]) +
        sub("① 지급 항목") +
        cols(["항목", "금액", "계산방법"], [
          ["기본급", f(base), "소정근로시간 × 통상시급"],
          ["연장근로수당", f(ot), `연장 ${b(v.otHours)}시간 × 통상시급 × 1.5`],
          ["야간근로수당", f(night), "야간시간 × 통상시급 × 0.5(가산)"],
          ["휴일근로수당", f(hol), "휴일근로 × 통상시급 × 1.5"],
          ["기타수당", f(etc), "식대 등"],
          ["<b>지급액 계</b>", `<b>${f(gross)}</b>`, ""],
        ]) +
        sub("② 공제 항목") +
        cols(["항목", "금액"], [["국민연금", f(pen)], ["건강보험(+장기요양)", f(hea)], ["고용보험", f(emp)], ["소득세(+지방소득세)", f(tax)], ["<b>공제액 계</b>", `<b>${f(ded)}</b>`]]) +
        sub("③ 실지급액") + `<p class="dbig">${f(net)}</p>` +
        guide([
          "근로기준법 제48조 제2항: 사용자는 임금 지급 시 <b>임금명세서를 서면(전자문서 포함)으로 교부</b>해야 합니다(2021.11.19~).",
          "필수 기재: 성명·생년월일(또는 사번), 임금 지급일, 임금 총액, 항목별 금액, 출근일수·근로시간 등에 따른 계산방법, 공제 항목별 금액.",
        ]) + dateLine() + sealRight(b(v.biz));
    },
  },

  // ============ 해고·징계 ============
  notice_dismissal: {
    title: "해고예고 통지서", group: "해고·징계", em: "📢",
    fields: [{ name: "biz", label: "사업체명" }, { name: "ceo", label: "대표자" }, { name: "worker", label: "대상자 성명" }, { name: "dept", label: "부서/직위" }, { name: "noticeDate", label: "통지일" }, { name: "date", label: "해고 예정일" }, { name: "reason", label: "해고 사유", full: true }],
    html: (v) => T("해 고 예 고 통 지 서") + recv(`${b(v.dept)} ${b(v.worker)} 귀하`, `${b(v.biz)} 대표 ${b(v.ceo)}`) +
      clauses([
        "귀하를 아래와 같이 해고할 예정임을 근로기준법 제26조에 따라 미리 통지합니다.",
        `해고 예정일 : <b>${b(v.date)}</b>`,
        `해고 사유 : ${b(v.reason)}`,
        "본 예고는 해고일 30일 전에 이루어진 것이며, 30일 전에 예고하지 못한 경우 사용자는 30일분 이상의 통상임금을 해고예고수당으로 지급합니다.",
      ]) + `<p class="ddate">통지일 : ${b(v.noticeDate)}</p>` + sealRight(`${b(v.biz)} 대표 ${b(v.ceo)}`) +
      `<p class="dnote">수령확인 : ${b(v.worker)} (서명 / 일자 : ____)</p>` +
      guide([
        "해고예고 예외: 근로 3개월 미만, 천재·사변 등 부득이한 사유, 근로자의 고의로 인한 손해 등(고용노동부 고시).",
        "해고예고와 별개로, 해고의 <b>사유와 시기는 반드시 서면통지</b>(근로기준법 제27조)해야 효력이 있습니다 → '해고 서면통지서' 함께 사용.",
      ]),
  },
  dismissal_written: {
    title: "해고 서면통지서 (사유·시기)", group: "해고·징계", em: "📄",
    fields: [{ name: "biz", label: "사업체명" }, { name: "ceo", label: "대표자" }, { name: "worker", label: "대상자 성명" }, { name: "dept", label: "부서/직위" }, { name: "date", label: "해고일" }, { name: "reason", label: "해고 사유(구체적 사실·근거)", full: true }, { name: "basis", label: "근거 규정", placeholder: "예: 취업규칙 제○조" }],
    html: (v) => T("해 고 (서면) 통 지 서") + recv(`${b(v.dept)} ${b(v.worker)} 귀하`, `${b(v.biz)} 대표 ${b(v.ceo)}`) +
      kv([["해고일(효력 발생일)", b(v.date)], ["해고 사유(구체적 사실)", b(v.reason)], ["근거 규정", b(v.basis)]]) +
      clauses([
        "위와 같이 근로기준법 제27조에 따라 해고의 사유와 시기를 서면으로 통지합니다.",
        "해고에 이의가 있는 경우, 해고일로부터 3개월 이내에 관할 지방노동위원회에 부당해고 구제를 신청할 수 있습니다.",
      ]) + dateLine() + sealRight(`${b(v.biz)} 대표 ${b(v.ceo)}`) +
      `<p class="dnote">수령확인 : ${b(v.worker)} (서명 / 일자 : ____)</p>` +
      guide([
        "해고 사유와 시기를 <b>서면으로 통지하지 않은 해고는 효력이 없습니다</b>(근로기준법 제27조).",
        "사유는 '근무태도 불량' 같은 추상적 표현이 아니라, 일시·행위 등 <b>구체적 사실</b>로 적어야 합니다.",
      ]),
  },
  resign: {
    title: "권고사직 확인서 / 사직 합의서", group: "해고·징계", em: "📄",
    fields: [{ name: "biz", label: "사업체명" }, { name: "ceo", label: "대표자" }, { name: "worker", label: "근로자 성명" }, { name: "hire", label: "입사일" }, { name: "date", label: "사직일" }, { name: "reason", label: "권고사직 사유", full: true }],
    html: (v) => T("권 고 사 직 확 인 서") +
      kv([["사업체명", b(v.biz)], ["성명", b(v.worker)], ["입사일", b(v.hire)], ["사직(근로관계 종료)일", b(v.date)], ["권고사직 사유", b(v.reason)]]) +
      clauses([
        "상기 본인은 사용자의 권고에 따라 위 사직일자로 사직하는 것에 합의하며 이를 확인합니다.",
        "본 사직은 사용자의 일방적 해고가 아니라 노사 합의에 의한 근로관계 종료임을 확인합니다.",
        "양 당사자는 위 종료와 관련하여 상호 이의를 제기하지 않습니다.",
      ]) + dateLine() +
      `<div class="dsign">확인자(근로자) : ${b(v.worker)} <span class="seal">(서명)</span><br/>사업주 : ${b(v.biz)} 대표 ${b(v.ceo)} <span class="seal">(직인)</span></div>` +
      guide([
        "권고사직은 합의 종료라 부당해고 구제신청 대상이 아닙니다. 서명 전 신중히 판단하세요.",
        "비자발적 이직(경영상 사정 등)인 경우 실업급여 수급이 가능할 수 있어, 사유 기재가 중요합니다.",
      ]),
  },
  warning: {
    title: "경고장 (개선요구서)", group: "해고·징계", em: "⚠️",
    fields: [{ name: "biz", label: "사업체명" }, { name: "ceo", label: "대표자" }, { name: "worker", label: "대상자 성명" }, { name: "dept", label: "부서/직위" }, { name: "date", label: "사실 발생일" }, { name: "fact", label: "사실 관계(구체적으로)", full: true }, { name: "basis", label: "위반 근거", placeholder: "예: 취업규칙 제○조" }, { name: "ask", label: "개선 요구사항", full: true }],
    html: (v) => T("경 고 장") + recv(`${b(v.dept)} ${b(v.worker)} 귀하`, `${b(v.biz)} 대표 ${b(v.ceo)}`) +
      clauses([
        `<b>사실관계</b> (발생일 ${b(v.date)})<br/>${b(v.fact)}`,
        `<b>위반 근거</b> : ${b(v.basis)} 및 근로계약상 성실의무에 위배되는 행위로 판단됩니다.`,
        `<b>개선 요구</b><br/>${b(v.ask)}`,
        "향후 동일·유사 행위가 반복될 경우 취업규칙에 따라 징계 등 인사조치가 있을 수 있음을 알려드립니다.",
      ]) + dateLine() + sealRight(`${b(v.biz)} 대표 ${b(v.ceo)}`) +
      `<p class="dnote">수령확인 : ${b(v.worker)} (서명 / 일자 : ____)</p>` +
      guide(["감정적 표현을 피하고, 일시·행위 등 객관적 사실 위주로 기재하세요.", "경고장은 향후 징계의 정당성을 뒷받침하는 증거가 됩니다. 수령 확인을 받아 보관하세요."]),
  },
  apology: {
    title: "시말서 / 경위서", group: "해고·징계", em: "🖊️",
    fields: [{ name: "biz", label: "사업체명" }, { name: "writer", label: "작성자 성명" }, { name: "dept", label: "부서/직위" }, { name: "date", label: "사건 발생일" }, { name: "fact", label: "사건 경위(육하원칙)", full: true }, { name: "cause", label: "원인·사유", full: true }, { name: "prevent", label: "재발 방지 대책", full: true }],
    html: (v) => T("시 말 서") + kv([["소속", b(v.dept)], ["성명", b(v.writer)], ["사건 발생일", b(v.date)]]) +
      sub("1. 사건 경위") + `<p class="dpara">${b(v.fact)}</p>` +
      sub("2. 원인 및 사유") + `<p class="dpara">${b(v.cause)}</p>` +
      sub("3. 재발 방지 대책") + `<p class="dpara">${b(v.prevent)}</p>` +
      clauses(["상기 사실이 발생하였음을 인정하며, 향후 동일한 일이 재발하지 않도록 성실히 근무할 것을 다짐합니다."]) +
      dateLine() + `<div class="dsign">작성자 : ${b(v.writer)} <span class="seal">(서명)</span></div>` +
      guide(["시말서는 사실 인정·반성의 의미가 있으며, 강요로 작성하게 하는 것은 부적절할 수 있습니다."]),
  },
  discipline: {
    title: "징계 처분 통지서", group: "해고·징계", em: "⚖️",
    fields: [{ name: "biz", label: "사업체명" }, { name: "ceo", label: "대표자" }, { name: "worker", label: "대상자 성명" }, { name: "dept", label: "부서/직위" }, { name: "type", label: "징계 종류", placeholder: "견책/감봉/정직/해고 등" }, { name: "reason", label: "징계 사유(구체적 사실)", full: true }, { name: "basis", label: "근거(취업규칙 조항)" }, { name: "effect", label: "효력 발생일" }, { name: "date", label: "통지일" }],
    html: (v) => T("징 계 처 분 통 지 서") + recv(`${b(v.dept)} ${b(v.worker)} 귀하`, `${b(v.biz)} 대표 ${b(v.ceo)}`) +
      kv([["징계 종류", b(v.type)], ["징계 사유", b(v.reason)], ["근거 규정", b(v.basis)], ["효력 발생일", b(v.effect)]]) +
      clauses([
        "위와 같이 징계위원회의 의결에 따라 징계 처분하였음을 통지합니다.",
        "본 처분에 이의가 있는 경우 통지일로부터 ____일 이내에 재심을 청구할 수 있습니다.",
      ]) + `<p class="ddate">통지일 : ${b(v.date)}</p>` + sealRight(`${b(v.biz)} 대표 ${b(v.ceo)}`) +
      `<p class="dnote">수령확인 : ${b(v.worker)} (서명 / 일자 : ____)</p>` +
      guide(["징계는 취업규칙에 정한 사유·절차(소명기회 부여 등)를 지켜야 정당성이 인정됩니다.", "해고에 해당하는 징계는 사유·시기를 서면으로 통지해야 합니다(근로기준법 제27조)."]),
  },

  // ============ 근태·증명 ============
  annual_promote: {
    title: "연차유급휴가 사용촉진 통지서", group: "근태·증명", em: "🗓️",
    fields: [{ name: "biz", label: "사업체명" }, { name: "ceo", label: "대표자" }, { name: "worker", label: "근로자 성명" }, { name: "year", label: "대상 연도" }, { name: "remain", label: "미사용 연차일수" }, { name: "deadline", label: "사용시기 통보 기한" }, { name: "round", label: "촉진 차수", placeholder: "1차 / 2차" }],
    html: (v) => T(`연차유급휴가 사용촉진 통지서 (${b(v.round)})`) + recv(`${b(v.worker)} 귀하`, `${b(v.biz)} 대표 ${b(v.ceo)}`) +
      clauses([
        `${b(v.year)}년도 귀하의 미사용 연차유급휴가는 <b>${b(v.remain)}일</b>입니다.`,
        `근로기준법 제61조에 따라 위 미사용 휴가의 사용 시기를 정하여 <b>${b(v.deadline)}까지</b> 사업주에게 통보하여 주시기 바랍니다.`,
        "기한 내에 사용 시기를 통보하지 않을 경우, 사용자가 미사용 휴가의 사용 시기를 지정하여 서면으로 통보할 수 있습니다.",
        "적법한 사용촉진 절차를 거친 경우, 미사용 휴가에 대한 금전 보상 의무가 면제될 수 있습니다.",
      ]) + dateLine() + sealRight(`${b(v.biz)} 대표 ${b(v.ceo)}`) +
      guide(["1차 촉진: 사용기간 만료 6개월 전 기준 10일 이내. 2차(사용자 지정): 만료 2개월 전까지. (근로기준법 제61조)"]),
  },
  employment_cert: {
    title: "재직증명서", group: "근태·증명", em: "📃",
    fields: [{ name: "biz", label: "사업체명" }, { name: "ceo", label: "대표자" }, { name: "bizNo", label: "사업자등록번호" }, { name: "bizAddr", label: "사업장 주소" }, { name: "worker", label: "성명" }, { name: "birth", label: "생년월일" }, { name: "dept", label: "부서/직위" }, { name: "hire", label: "입사일" }, { name: "purpose", label: "용도", placeholder: "예: 은행 제출용" }],
    html: (v) => T("재 직 증 명 서") +
      kv([["성명", b(v.worker)], ["생년월일", b(v.birth)], ["소속/직위", b(v.dept)], ["입사일", b(v.hire)], ["용도", b(v.purpose)]]) +
      lead(`위 사람은 현재 ${b(v.biz)}에 재직 중임을 증명합니다.`) + dateLine() +
      `<div class="dsign">사업체명 : ${b(v.biz)}　(사업자등록번호 : ${b(v.bizNo)})<br/>주소 : ${b(v.bizAddr)}<br/>대표자 : ${b(v.ceo)} <span class="seal">(직인)</span></div>` +
      guide(["발급 목적 외 사용을 제한하며, 본인 동의 없는 제3자 제공은 개인정보 침해가 될 수 있습니다."]),
  },
  career_cert: {
    title: "경력증명서", group: "근태·증명", em: "📑",
    fields: [{ name: "biz", label: "사업체명" }, { name: "ceo", label: "대표자" }, { name: "bizNo", label: "사업자등록번호" }, { name: "worker", label: "성명" }, { name: "birth", label: "생년월일" }, { name: "dept", label: "부서/직위" }, { name: "hire", label: "입사일" }, { name: "leave", label: "퇴사일" }, { name: "duties", label: "담당 업무", full: true }, { name: "purpose", label: "용도" }],
    html: (v) => T("경 력 증 명 서") +
      kv([["성명", b(v.worker)], ["생년월일", b(v.birth)], ["소속/직위", b(v.dept)], ["재직기간", `${b(v.hire)} ~ ${b(v.leave)}`], ["담당업무", b(v.duties)], ["용도", b(v.purpose)]]) +
      lead(`위 사람은 상기 기간 동안 ${b(v.biz)}에 근무하였음을 증명합니다.`) + dateLine() +
      `<div class="dsign">사업체명 : ${b(v.biz)}　(사업자등록번호 : ${b(v.bizNo)})<br/>대표자 : ${b(v.ceo)} <span class="seal">(직인)</span></div>`,
  },

  // ============ 근로자 대응 ============
  certmail: {
    title: "내용증명 (임금·퇴직금 청구)", group: "근로자 대응", em: "📮",
    fields: [{ name: "from", label: "발신인(본인)" }, { name: "fromAddr", label: "발신인 주소" }, { name: "fromTel", label: "발신인 연락처" }, { name: "to", label: "수신인(사업주/상호)" }, { name: "toAddr", label: "수신인 주소" }, { name: "work", label: "근무기간", placeholder: "예: 2025.3~2026.5" }, { name: "amount", label: "청구 금액" }, { name: "detail", label: "청구 내용(항목·기간)", full: true }, { name: "account", label: "입금 계좌" }, { name: "date", label: "작성일" }],
    html: (v) => T("내 용 증 명") +
      recv(`${b(v.to)}<br/>(주소 : ${b(v.toAddr)})`, `${b(v.from)}<br/>(주소 : ${b(v.fromAddr)} / 연락처 : ${b(v.fromTel)})`) +
      sub("제목 : 미지급 임금(퇴직금) 지급 청구의 건") +
      clauses([
        `본인은 ${b(v.work)} 기간 동안 귀하(귀사) ${b(v.to)}에서 근로한 사실이 있습니다.`,
        `아래와 같이 미지급 금품이 있어 그 지급을 청구합니다.<br/>　- 청구 내용 : ${b(v.detail)}<br/>　- 청구 금액 : <b>${won(v.amount)}</b><br/>　- 입금 계좌 : ${b(v.account)}`,
        "본 내용증명을 수령한 날로부터 <b>7일 이내</b>에 위 금액을 위 계좌로 지급하여 주시기 바랍니다.",
        "위 기한 내에 지급되지 않을 경우, 부득이 고용노동부 진정 및 민사소송 등 법적 절차를 진행할 것임을 통지합니다.",
        "임금채권의 소멸시효는 3년이며, 퇴직 후 14일이 경과한 미지급 금품에는 연 20%의 지연이자가 가산됩니다.",
      ]) + dateLine() + `<div class="dsign">발신인 : ${b(v.from)} <span class="seal">(인)</span></div>` +
      guide([
        "내용증명은 우체국에서 동일 문서 3부(발신·수신·우체국 보관)로 발송합니다.",
        "법적 강제력은 없지만, 청구 사실·시점을 입증하는 증거가 되어 추후 진정·소송에 유리합니다.",
      ]),
  },
  complaint: {
    title: "노동청 진정서", group: "근로자 대응", em: "🏛️",
    fields: [{ name: "from", label: "진정인 성명" }, { name: "birth", label: "생년월일" }, { name: "fromAddr", label: "주소" }, { name: "fromContact", label: "연락처" }, { name: "biz", label: "피진정인(사업장명)" }, { name: "ceo", label: "대표자" }, { name: "bizAddr", label: "사업장 주소" }, { name: "type", label: "사건 유형", placeholder: "임금체불/부당해고 등" }, { name: "work", label: "근무기간" }, { name: "fact", label: "사실 내용(경위·금액)", full: true }, { name: "ask", label: "요구 사항", full: true }],
    html: (v) => T("진 정 서") +
      kv([["진정인", `${b(v.from)} (생년월일 ${b(v.birth)})`], ["주소/연락처", `${b(v.fromAddr)} / ${b(v.fromContact)}`], ["피진정인", `${b(v.biz)} 대표 ${b(v.ceo)}`], ["사업장 주소", b(v.bizAddr)], ["근무기간", b(v.work)]]) +
      clauses([
        `<b>진정 취지</b><br/>진정인은 피진정인을 상대로 <b>${b(v.type)}</b> 건에 관하여 진정하오니 조사하여 시정하여 주시기 바랍니다.`,
        `<b>사실 내용</b><br/>${b(v.fact)}`,
        `<b>요구 사항</b><br/>${b(v.ask)}`,
        "위 내용은 사실과 다름이 없으며, 관련 증빙자료를 함께 제출합니다.",
      ]) + dateLine() + `<div class="dsign">진정인 : ${b(v.from)} <span class="seal">(서명)</span></div>` +
      guide([
        "고용노동부 노동포털(labor.moel.go.kr) 또는 관할 지방고용노동관서에 접수합니다(무료).",
        "증빙: 근로계약서·급여명세서·통장 입금내역·출퇴근기록·카톡 등.",
        "임금체불 진정의 임금채권 소멸시효는 3년입니다.",
      ]),
  },
  relief_app: {
    title: "부당해고 등 구제신청서", group: "근로자 대응", em: "⚖️",
    fields: [{ name: "from", label: "신청인 성명" }, { name: "birth", label: "생년월일" }, { name: "contact", label: "연락처" }, { name: "fromAddr", label: "주소" }, { name: "biz", label: "사용자(사업장)" }, { name: "ceo", label: "대표자" }, { name: "bizAddr", label: "사업장 주소" }, { name: "hire", label: "입사일" }, { name: "date", label: "해고일" }, { name: "reason", label: "해고 경위", full: true }, { name: "want", label: "구제 내용", placeholder: "예: 원직복직 및 임금 상당액 지급" }],
    html: (v) => T("부당해고 등 구제신청서") +
      kv([["신청인", `${b(v.from)} (생년월일 ${b(v.birth)})`], ["주소/연락처", `${b(v.fromAddr)} / ${b(v.contact)}`], ["사용자", `${b(v.biz)} 대표 ${b(v.ceo)}`], ["사업장 주소", b(v.bizAddr)], ["입사일 / 해고일", `${b(v.hire)} / ${b(v.date)}`]]) +
      clauses([
        `<b>신청 취지</b><br/>"사용자가 ${b(v.date)} 신청인에게 행한 해고는 부당해고임을 인정한다. 사용자는 신청인을 원직에 복직시키고 해고기간 동안의 임금 상당액을 지급하라."는 판정을 구합니다.`,
        `<b>신청 이유(해고 경위)</b><br/>${b(v.reason)}`,
        `<b>구제 내용</b> : ${b(v.want)}`,
      ]) + dateLine() + `<div class="dsign">신청인 : ${b(v.from)} <span class="seal">(서명)</span></div>` +
      guide([
        "구제신청은 <b>해고일로부터 3개월 이내</b>에 관할 지방노동위원회에 제출해야 합니다(근로기준법 제28조).",
        "부당해고 구제신청은 상시근로자 5인 이상 사업장에 적용됩니다(5인 미만은 해고예고수당 등 별도 청구).",
      ]),
  },

  // ============ 추가 문서 ============
  contract_minor: {
    title: "표준근로계약서 (연소근로자·18세 미만)", group: "근로계약", std: true, em: "📝",
    fields: [
      { name: "biz", label: "사업체명" }, { name: "ceo", label: "대표자" }, { name: "bizAddr", label: "사업장 주소" }, { name: "bizTel", label: "사업장 전화" },
      { name: "worker", label: "근로자(연소자) 성명" }, { name: "birth", label: "생년월일" }, { name: "workerAddr", label: "주소" },
      { name: "guardian", label: "친권자(후견인) 성명" }, { name: "guardianRel", label: "관계", placeholder: "예: 부 / 모" }, { name: "guardianTel", label: "친권자 연락처" },
      { name: "start", label: "근로개시일" }, { name: "job", label: "업무 내용" },
      { name: "startTime", label: "시업", placeholder: "09:00" }, { name: "endTime", label: "종업", placeholder: "16:00" }, { name: "breakTime", label: "휴게시간" },
      { name: "days", label: "근무일" }, { name: "pay", label: "임금(시급 등)" }, { name: "payDay", label: "임금지급일", placeholder: "25" },
    ],
    html: (v) => T("표 준 근 로 계 약 서 (연소근로자)") +
      lead(`${b(v.biz)}(이하 "사업주")과(와) ${b(v.worker)}(이하 "근로자")은 다음과 같이 근로계약을 체결한다.`) +
      kv([
        ["1. 근로개시일", `${b(v.start)} 부터`], ["2. 근 무 장 소", b(v.biz)], ["3. 업무의 내용", b(v.job)],
        ["4. 소정근로시간", `${b(v.startTime)} 부터 ${b(v.endTime)} 까지 (휴게 : ${b(v.breakTime)})<br/><span class="dmini">※ 15세 이상 18세 미만은 1일 7시간·1주 35시간 한도(당사자 합의 시 1일 1시간·1주 5시간 연장 가능).</span>`],
        ["5. 근무일 / 휴일", `매주 ${b(v.days)} 근무, 주휴일 매주 ____요일`],
        ["6. 임 금", `${b(v.pay)} / 임금지급일 매월 ${b(v.payDay)}일 / 계좌이체`],
      ]) +
      clauses([
        "<b>연소자 보호</b> : 18세 미만자의 야간(22:00~06:00)·휴일근로는 원칙적으로 금지되며, 본인 동의와 고용노동부장관 인가가 있어야 가능하다.",
        "<b>연차·사회보험</b> : 근로기준법령에 따른다.",
        "<b>가족관계증명서·동의서 비치</b> : 사업주는 연령을 증명하는 가족관계기록사항 증명서와 친권자(후견인)의 동의서를 사업장에 갖추어 둔다(근로기준법 제66조).",
        "<b>근로계약서 교부</b> : 체결과 동시에 근로자에게 교부한다(제17조).",
        "<b>기 타</b> : 이 계약에 정함이 없는 사항은 근로기준법령에 의한다.",
      ]) + dateLine() +
      `<div class="dsign">(사업주) ${b(v.biz)} 대표 ${b(v.ceo)} <span class="seal">(서명)</span>　전화 ${b(v.bizTel)} / ${b(v.bizAddr)}<br/><br/>
      (근로자) ${b(v.worker)} (생년월일 ${b(v.birth)}) <span class="seal">(서명)</span>　${b(v.workerAddr)}<br/>
      (친권자·후견인) ${b(v.guardian)} (${b(v.guardianRel)}) <span class="seal">(서명)</span>　연락처 ${b(v.guardianTel)}</div>` +
      guide([
        "15세 미만(중학교 재학 중인 18세 미만 포함)은 원칙적으로 고용 금지, 취직인허증이 있어야 합니다.",
        "친권자(후견인) 동의서와 가족관계증명서를 반드시 비치해야 합니다(근로기준법 제66조).",
      ]),
  },
  guardian_consent: {
    title: "친권자(후견인) 동의서 (연소근로자)", group: "근로계약", std: true, em: "🧾",
    fields: [
      { name: "guardian", label: "친권자(후견인) 성명" }, { name: "guardianRel", label: "미성년자와의 관계", placeholder: "예: 부 / 모" },
      { name: "guardianTel", label: "친권자 연락처" }, { name: "guardianAddr", label: "친권자 주소" },
      { name: "worker", label: "연소근로자 성명" }, { name: "birth", label: "생년월일" },
      { name: "biz", label: "사업체명" }, { name: "job", label: "종사할 업무" },
    ],
    html: (v) => T("친 권 자 ( 후 견 인 ) 동 의 서") +
      lead(`아래 친권자(후견인)는 연소근로자 ${b(v.worker)}이(가) ${b(v.biz)}에서 근로하는 것에 동의합니다.`) +
      kv([
        ["연소근로자 성명", b(v.worker)], ["생년월일", b(v.birth)],
        ["종사할 업무", b(v.job)], ["사업장", b(v.biz)],
      ]) +
      clauses([
        "위 연소근로자가 귀 사업장에서 근로기준법령이 정한 범위 내에서 근로하는 것에 동의합니다.",
        "본 동의서는 근로기준법 제66조에 따라 사업장에 비치되는 서류입니다.",
        "18세 미만자의 근로시간(1일 7시간·1주 35시간 한도)·야간 및 휴일근로 제한 등 법정 보호규정을 확인하였습니다.",
      ]) + dateLine() +
      `<div class="dsign">(친권자·후견인) ${b(v.guardian)} (${b(v.guardianRel)}) <span class="seal">(서명 또는 인)</span><br/>연락처 ${b(v.guardianTel)}　주소 ${b(v.guardianAddr)}</div>` +
      guide([
        "이 동의서는 가족관계증명서와 함께 사업장에 비치해야 합니다(근로기준법 제66조).",
        "연소근로자 표준근로계약서와 함께 작성하세요. 동의서·증명서 미비치는 사업주의 위반사항입니다.",
      ]),
  },
  work_rules: {
    title: "표준 취업규칙 (기본형)", group: "근로계약", std: true, em: "📋",
    fields: [
      { name: "biz", label: "사업체명" }, { name: "ceo", label: "대표자" }, { name: "bizAddr", label: "사업장 주소" },
      { name: "workStart", label: "시업 시각", placeholder: "09:00" }, { name: "workEnd", label: "종업 시각", placeholder: "18:00" },
      { name: "breakTime", label: "휴게시간", placeholder: "12:00~13:00" }, { name: "payDay", label: "임금 지급일", placeholder: "매월 25일" },
      { name: "effective", label: "시행일" },
    ],
    html: (v) => T(`취 업 규 칙`) +
      lead(`${b(v.biz)}(이하 "회사")의 근로자 복무 및 근로조건에 관한 기준을 정한다. 상시 10명 이상 근로자를 사용하는 사업장은 취업규칙을 작성해 고용노동부장관에게 신고해야 한다(근로기준법 제93조).`) +
      sub("제1장 총칙") +
      clauses([
        "<b>목적</b> : 이 규칙은 회사와 근로자의 근로조건 및 복무규율에 관한 사항을 정함을 목적으로 한다.",
        "<b>적용범위</b> : 이 규칙은 회사에 근로하는 모든 근로자에게 적용한다. 이 규칙에 정하지 않은 사항은 근로기준법 등 노동관계법령에 따른다.",
        "<b>차별금지</b> : 회사는 성별·연령·신앙·사회적 신분 등을 이유로 근로조건을 차별하지 않는다(근기법 제6조).",
      ]) +
      sub("제2장 채용 및 근로계약") +
      clauses([
        "<b>근로계약</b> : 회사는 채용된 근로자와 근로계약을 서면으로 체결하고 그 사본을 교부한다(제17조).",
        "<b>수습기간</b> : 신규 채용자는 3개월의 수습기간을 둘 수 있으며, 수습기간도 계속근로기간에 포함한다.",
      ]) +
      sub("제3장 근로시간·휴게·휴일") +
      kv([
        ["소정근로시간", `${b(v.workStart)} 부터 ${b(v.workEnd)} 까지 (1일 8시간, 1주 40시간)`],
        ["휴게시간", `${b(v.breakTime)} (근로시간 4시간당 30분 이상)`],
        ["휴일", "매주 일요일(주휴일) 및 근로자의 날, 관공서 공휴일"],
      ]) +
      clauses([
        "<b>연장·야간·휴일근로</b> : 당사자 합의로 1주 12시간 한도 내에서 연장할 수 있으며, 연장·야간·휴일근로에 대해 통상임금의 50%를 가산 지급한다(제53·56조, 상시 5인 이상).",
      ]) +
      sub("제4장 휴가") +
      clauses([
        "<b>연차유급휴가</b> : 1년간 80% 이상 출근한 근로자에게 15일의 유급휴가를 부여하고, 계속근로 3년 이상이면 2년마다 1일을 가산한다(최대 25일, 제60조).",
        "<b>모성보호</b> : 출산전후휴가(90일)·육아휴직·육아기 근로시간 단축 등은 관계 법령에 따라 부여한다.",
      ]) +
      sub("제5장 임금") +
      kv([
        ["임금 지급", `${b(v.payDay)}, 통화로 직접·전액 지급`],
        ["최저임금", "2026년 최저임금(시급 10,320원) 이상"],
      ]) +
      clauses([
        "<b>임금명세서</b> : 회사는 임금 지급 시 구성항목·계산방법·공제내역을 적은 임금명세서를 교부한다(제48조).",
      ]) +
      sub("제6장 퇴직·해고 및 퇴직급여") +
      clauses([
        "<b>해고</b> : 회사는 정당한 이유 없이 근로자를 해고하지 못하며, 해고 시 사유와 시기를 서면으로 통지한다(제23·27조).",
        "<b>해고예고</b> : 부득이 해고할 때에는 30일 전에 예고하거나 30일분 이상의 통상임금(해고예고수당)을 지급한다(제26조).",
        "<b>퇴직급여</b> : 1년 이상 계속근로한 근로자에게 퇴직금 또는 퇴직연금을 지급하며, 퇴직일부터 14일 이내에 지급한다(퇴직급여법 제4·9조).",
      ]) +
      sub("제7장 표창·징계") +
      clauses([
        "<b>징계</b> : 근로자가 규칙을 위반한 경우 경고·견책·감봉·정직·해고 등의 징계를 할 수 있다. 감봉은 1회 평균임금 1일분의 1/2, 총액은 1임금지급기 임금총액의 1/10을 초과하지 못한다(제95조).",
      ]) +
      sub("제8장 직장 내 괴롭힘·성희롱 예방") +
      clauses([
        "<b>직장 내 괴롭힘 금지</b> : 누구든지 직장에서의 지위·관계 우위를 이용해 업무상 적정범위를 넘어 신체적·정신적 고통을 주는 행위를 해서는 안 된다(제76조의2). 회사는 신고 접수 시 지체 없이 조사·조치한다.",
        "<b>성희롱 예방</b> : 회사는 연 1회 이상 성희롱 예방교육을 실시하고, 성희롱 발생 시 조사·피해자 보호·가해자 징계 등 필요한 조치를 한다(남녀고용평등법 제13·14조).",
      ]) +
      sub("제9장 안전보건·재해보상") +
      clauses([
        "<b>안전보건</b> : 회사와 근로자는 산업안전보건법령이 정한 안전·보건 조치를 성실히 이행한다.",
        "<b>재해보상</b> : 업무상 재해는 산업재해보상보험법에 따라 보상한다.",
      ]) +
      sub("부칙") +
      clauses([`이 규칙은 ${b(v.effective)} 부터 시행한다. 이 규칙의 작성·변경 시 근로자 과반수의 의견을 듣고(불이익 변경 시 과반수 동의), 상시 10명 이상이면 고용노동부장관에게 신고한다(제93·94조).`]) +
      dateLine() +
      `<div class="dsign">${b(v.biz)} 대표 ${b(v.ceo)} <span class="seal">(직인)</span>　${b(v.bizAddr)}</div>` +
      guide([
        "상시 10명 이상 근로자를 사용하면 취업규칙 작성·신고가 의무입니다(근기법 제93조, 미신고 시 500만원 이하 과태료).",
        "취업규칙을 근로자에게 불리하게 변경하려면 근로자 과반수(과반수 노조)의 동의가 필요합니다(제94조).",
        "이 서식은 필수 기재사항 중심의 기본형입니다. 업종·규모에 맞게 조정하고, 구체적 사안은 노무사 검토를 권장합니다.",
      ]),
  },
  annual_salary: {
    title: "연봉계약서", group: "근로계약", em: "📝",
    fields: [
      { name: "biz", label: "사업체명" }, { name: "ceo", label: "대표자" }, { name: "worker", label: "근로자 성명" },
      { name: "period", label: "연봉계약기간", placeholder: "예: 2026.1.1~12.31" }, { name: "annual", label: "연봉(총액)" },
      { name: "monthly", label: "월 지급액" }, { name: "compose", label: "연봉 구성", full: true, placeholder: "예: 기본급, 제수당, (포함 시)연장수당 등" }, { name: "payDay", label: "지급일", placeholder: "25" },
    ],
    html: (v) => T("연 봉 계 약 서") +
      lead(`${b(v.biz)}(이하 "회사")과(와) ${b(v.worker)}(이하 "근로자")은 다음과 같이 연봉계약을 체결한다.`) +
      kv([
        ["1. 연봉계약기간", b(v.period)], ["2. 연봉(총액)", won(v.annual)], ["3. 월 지급액", won(v.monthly)],
        ["4. 연봉 구성", b(v.compose)], ["5. 지급일", `매월 ${b(v.payDay)}일 (계좌이체)`],
      ]) +
      clauses([
        "연봉에는 기본급 외 법정수당이 포함될 수 있으며, 포괄임금으로 정한 경우 그 구성을 명시한다.",
        "실제 연장·야간·휴일근로가 약정 시간을 초과하는 경우 추가 수당이 발생할 수 있다.",
        "본 계약에 정함이 없는 사항은 근로계약서·취업규칙 및 근로기준법령에 따른다.",
      ]) + dateLine() +
      `<div class="dsign">회사 : ${b(v.biz)} 대표 ${b(v.ceo)} <span class="seal">(인)</span><br/>근로자 : ${b(v.worker)} <span class="seal">(서명)</span></div>` +
      guide(["포괄임금제라도 약정 근로시간을 초과하면 추가 수당이 발생할 수 있습니다.", "연봉계약은 근로계약을 대체하지 않으므로 근로조건은 근로계약서에 별도 명시하세요."]),
  },
  nda: {
    title: "비밀유지 서약서", group: "근로계약", em: "🔒",
    fields: [
      { name: "biz", label: "회사명" }, { name: "worker", label: "근로자 성명" }, { name: "dept", label: "부서/직위" },
      { name: "scope", label: "비밀정보 범위", full: true, placeholder: "예: 고객정보, 기술자료, 영업전략 등" }, { name: "duration", label: "유지 기간", placeholder: "예: 재직 중 및 퇴직 후 2년" }, { name: "date", label: "작성일" },
    ],
    html: (v) => T("비 밀 유 지 서 약 서") +
      lead(`${b(v.worker)}(이하 "본인")은 ${b(v.biz)}(이하 "회사")의 영업비밀 보호를 위하여 다음을 서약합니다.`) +
      clauses([
        `<b>비밀정보의 범위</b> : ${b(v.scope)} 및 업무상 알게 된 회사·고객의 일체의 비공개 정보.`,
        "본인은 재직 중은 물론 퇴직 후에도 비밀정보를 제3자에게 누설하거나 부정한 목적으로 사용하지 않는다.",
        `<b>유지 기간</b> : ${b(v.duration)}.`,
        "퇴직 시 비밀정보가 포함된 일체의 자료(문서·전자파일 등)를 반납하며 사본을 보유하지 않는다.",
        "본 서약을 위반하여 회사에 손해가 발생한 경우 관련 법령에 따라 책임을 진다.",
      ]) + dateLine() +
      `<div class="dsign">서약자 : ${b(v.dept)} ${b(v.worker)} <span class="seal">(서명)</span></div>` +
      guide(["영업비밀 보호 범위는 구체적으로 특정할수록 효력 인정에 유리합니다(부정경쟁방지법).", "과도한 경업금지·위약벌은 무효가 될 수 있어 별도 검토가 필요합니다."]),
  },
  payledger: {
    title: "임금대장 (법정 비치서류)", group: "임금", std: true, em: "📒",
    fields: [
      { name: "biz", label: "사업체명" }, { name: "period", label: "임금계산 기간", placeholder: "예: 2026.7" },
      { name: "worker", label: "근로자 성명" }, { name: "empno", label: "사번/생년월일" }, { name: "days", label: "근로일수" }, { name: "hours", label: "근로시간수" }, { name: "otHours", label: "연장·야간·휴일 시간수" }, { name: "base", label: "기본급" }, { name: "allow", label: "수당 합계" }, { name: "deduct", label: "공제 합계" },
    ],
    html: (v) => {
      const n = (x) => Number(String(x ?? "").replace(/[^\d]/g, "")) || 0;
      const base = n(v.base), allw = n(v.allow), ded = n(v.deduct); const f = (x) => x ? x.toLocaleString("ko-KR") + "원" : "____";
      return T("임 금 대 장") +
        kv([["사업체명", b(v.biz)], ["임금계산 기간", b(v.period)]]) +
        cols(["성명", "사번/생년월일", "근로일수", "근로시간", "연장/야간/휴일", "기본급", "수당계", "공제계", "실지급"],
          [[b(v.worker), b(v.empno), b(v.days), b(v.hours), b(v.otHours), f(base), f(allw), f(ded), f(base + allw - ded)]]) +
        guide([
          "임금대장은 사용자가 작성·비치해야 하는 <b>법정 서류</b>입니다(근로기준법 제48조 제1항).",
          "필수 기재: 성명·생년월일(또는 사번)·고용연월일·종사업무·임금계산기초·근로일수·근로시간수·연장/야간/휴일 근로시간수·기본급 및 수당별 금액·공제 내역.",
          "3년간 보존해야 합니다(근로기준법 제42조).",
        ]) + dateLine();
    },
  },
  resignation: {
    title: "사직서 (자발적)", group: "해고·징계", em: "📄",
    fields: [
      { name: "biz", label: "사업체명" }, { name: "worker", label: "성명" }, { name: "dept", label: "부서/직위" }, { name: "hire", label: "입사일" }, { name: "resignDate", label: "사직 희망일" }, { name: "reason", label: "사직 사유", full: true, placeholder: "예: 개인 사정 / 이직 등" }, { name: "date", label: "작성일" },
    ],
    html: (v) => T("사 직 서") +
      kv([["소속", b(v.dept)], ["성명", b(v.worker)], ["입사일", b(v.hire)], ["사직 희망일", b(v.resignDate)]]) +
      sub("사직 사유") + `<p class="dpara">${b(v.reason)}</p>` +
      clauses(["본인은 위와 같은 사유로 사직하고자 하오니 처리하여 주시기 바랍니다.", "업무 인수인계에 성실히 협조하겠습니다."]) +
      `<p class="ddate">작성일 : ${b(v.date)}</p>` +
      `<div class="dsign">사직인 : ${b(v.worker)} <span class="seal">(서명)</span></div>` +
      guide(["자발적 사직은 원칙적으로 실업급여 대상이 아닙니다(권고사직·정당한 이직사유 제외).", "사직 의사표시 후 사용자 수리 전 철회는 제한될 수 있습니다."]),
  },
  agreement: {
    title: "합의서 (임금·퇴직금 지급)", group: "근로자 대응", em: "🤝",
    fields: [
      { name: "biz", label: "사업주(상호)" }, { name: "ceo", label: "대표자" }, { name: "worker", label: "근로자 성명" },
      { name: "subject", label: "합의 대상", placeholder: "예: 2026.3~5월 미지급 임금" }, { name: "amount", label: "지급 금액" }, { name: "payDate", label: "지급 기일" }, { name: "account", label: "입금 계좌" }, { name: "date", label: "작성일" },
    ],
    html: (v) => T("합 의 서") +
      lead(`${b(v.biz)}(이하 "갑")과(와) ${b(v.worker)}(이하 "을")은 아래와 같이 합의한다.`) +
      kv([["1. 합의 대상", b(v.subject)], ["2. 지급 금액", won(v.amount)], ["3. 지급 기일", b(v.payDate)], ["4. 입금 계좌", b(v.account)]]) +
      clauses([
        "갑은 위 금액을 지급 기일까지 을의 계좌로 지급한다.",
        "을은 위 금액 수령으로 본 합의 대상에 관한 일체의 청구권이 소멸함을 확인한다.",
        "양 당사자는 본 합의 내용에 대하여 민·형사상 이의를 제기하지 아니한다.",
        "본 합의서는 2부를 작성하여 갑과 을이 각 1부씩 보관한다.",
      ]) + dateLine() +
      `<div class="dsign">갑 : ${b(v.biz)} 대표 ${b(v.ceo)} <span class="seal">(인)</span><br/>을 : ${b(v.worker)} <span class="seal">(서명)</span></div>` +
      guide(["부제소 합의는 신중히 — 정당한 권리까지 포기될 수 있어 금액·범위를 명확히 하세요.", "임금·퇴직금은 합의해도 일부 강행규정 위반 부분은 추후 다툴 여지가 있습니다."]),
  },

};

export function listDocs() {
  return Object.entries(DOC_TEMPLATES).map(([key, t]) => ({ key, title: t.title, group: t.group, std: !!t.std, em: t.em || "📄", fields: t.fields }));
}
// 모든 생성 문서에 붙는 표준 면책 (공인노무사법·정보제공 성격 명시)
const DOC_DISCLAIMER =
  `<div class="ddisc">본 문서는 이용자가 입력한 정보를 기계적으로 정리한 <b>참고용 초안</b>이며, ` +
  `<b>공인노무사의 서류 작성·확인 또는 사건 대리를 대체하지 않습니다.</b> ` +
  `법적 효력을 보장하지 않으므로 제출 전 공인노무사·관계기관의 확인을 권장합니다.</div>`;
export function renderDoc(key, values = {}) {
  const t = DOC_TEMPLATES[key];
  if (!t) return null;
  const html = t.html(values) + DOC_DISCLAIMER;
  return { title: t.title, html, text: stripTags(html) };
}

// ============ 상황별 문서팩 ============
// 한 상황에 필요한 문서들을 묶어, 공통 정보 1회 입력으로 한 번에 생성.
export const DOC_PACKS = [
  { key: "fire_worker", title: "부당해고 대응팩", site: "worker", em: "⚖️",
    situation: "해고를 당했어요", desc: "해고에 이의를 제기하는 내용증명부터 노동위원회 구제신청서까지 한 번에.",
    docs: ["certmail", "relief_app"],
    steps: ["사업주에게 내용증명으로 부당해고 이의·복직/임금 요구", "노동위원회에 부당해고 구제신청(해고일로부터 3개월 이내)"] },
  { key: "wage_worker", title: "임금체불 대응팩", site: "worker", em: "💸",
    situation: "임금·퇴직금을 못 받았어요", desc: "사업주에게 내용증명으로 지급을 청구하고, 안 주면 노동청 진정서까지.",
    docs: ["certmail", "complaint"],
    steps: ["내용증명으로 미지급 임금·퇴직금 청구(증거 확보)", "미지급 시 관할 노동청에 진정서 제출"] },
  { key: "resign_worker", title: "퇴사 정리팩", site: "worker", em: "🪪",
    situation: "퇴사하려고 해요", desc: "사직서와 경력증명서 요청을 한 번에 준비.",
    docs: ["resignation", "career_cert"],
    steps: ["사직서 제출(희망 퇴사일·인수인계 명시)", "경력증명서 발급 요청(재직기간·담당업무)"] },
  { key: "hire_employer", title: "입사 서류팩", site: "employer", em: "📝",
    situation: "직원을 새로 채용해요", desc: "근로계약서·비밀유지서약서·임금명세서 양식을 한 묶음으로.",
    docs: ["contract", "nda", "payslip"],
    steps: ["표준근로계약서 작성·교부(법정 의무)", "비밀유지 서약서 징구", "임금명세서 양식 준비(매월 교부 의무)"] },
  { key: "fire_employer", title: "해고 처리팩", site: "employer", em: "📤",
    situation: "직원을 해고해야 해요", desc: "해고예고 통지서와 해고 서면통지서(사유·시기)를 함께.",
    docs: ["notice_dismissal", "dismissal_written"],
    steps: ["30일 전 해고예고 통지(미준수 시 예고수당)", "해고 사유·시기를 서면으로 통지(근기법 제27조)"] },
  { key: "leave_employer", title: "퇴직 처리팩", site: "employer", em: "🧾",
    situation: "직원이 퇴사해요", desc: "권고사직/사직 처리 확인서와 경력증명서를 함께 발급.",
    docs: ["resign", "career_cert"],
    steps: ["권고사직 확인서 / 사직 합의서로 종료 사유 명확화", "경력증명서 발급"] },
  { key: "discipline_employer", title: "징계 처리팩", site: "employer", em: "⚠️",
    situation: "직원 징계가 필요해요", desc: "경위서 요청·경고장·징계 처분 통지서로 절차를 빠짐없이.",
    docs: ["apology", "warning", "discipline"],
    steps: ["경위서(시말서) 제출 요구로 소명 기회 부여", "개선요구(경고장) 발부", "징계 처분 통지(사유·근거·재심 안내)"] },
];

export function listPacks() {
  return DOC_PACKS.map((p) => ({
    key: p.key, title: p.title, site: p.site, em: p.em, situation: p.situation, desc: p.desc, steps: p.steps,
    docs: p.docs.map((k) => ({ key: k, title: DOC_TEMPLATES[k]?.title || k, std: !!DOC_TEMPLATES[k]?.std, em: DOC_TEMPLATES[k]?.em || "📄" })),
    fields: packFields(p),
  }));
}
// 팩에 속한 문서들의 입력 항목을 합집합(name 기준 중복 제거)으로
function packFields(p) {
  const seen = new Set(); const out = [];
  for (const k of p.docs) {
    for (const f of DOC_TEMPLATES[k]?.fields || []) {
      if (seen.has(f.name)) continue;
      seen.add(f.name); out.push(f);
    }
  }
  return out;
}
export function renderPack(key, values = {}) {
  const p = DOC_PACKS.find((x) => x.key === key);
  if (!p) return null;
  const docs = p.docs.map((k) => {
    const d = renderDoc(k, values);
    return d ? { key: k, ...d } : null;
  }).filter(Boolean);
  return { key: p.key, title: p.title, situation: p.situation, steps: p.steps, docs };
}
