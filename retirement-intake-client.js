import {
  booleanSelect as boolSelect,
  controlValue,
  createCaseClientCore,
  escapeHtml as esc,
  formatWon as won,
} from "./case-client-core.js";

const ROOT = document.getElementById("retirementApp");
const STORAGE_KEY = "insaya:retirement-case-session";
let client;

const api = (...args) => client.api(...args);
const setSession = (...args) => client.setSession(...args);
const showError = (text) => client.showError(text);
const patchFacts = (...args) => client.patchFacts(...args);
const saveEvidence = (event) => client.saveEvidence(event);
const previewDocument = (templateKey) => client.previewDocument(templateKey);
const copyReport = (event) => client.copyReport(event);
const deleteCase = () => client.deleteCase();

const TYPE_LABELS = {
  severance_pay: "퇴직금제도",
  db_pension: "DB형 퇴직연금",
  dc_pension: "DC형 퇴직연금",
  unknown: "유형 모름",
};
const EVIDENCE_LABELS = {
  employmentContract: "근로계약서",
  payslips3m: "퇴직 전 3개월 급여명세서",
  bankHistory: "급여·퇴직급여 입금내역",
  retirementPlanStatement: "퇴직연금 가입·운용 명세서",
  attendanceRecord: "근무시간 기록",
};

function renderStart() {
  ROOT.innerHTML = `<form class="retirement-start" data-start-form>
    <section class="retirement-card"><h2>회사 퇴직급여 방식을 선택하세요.</h2><p>모르면 ‘유형 모름’을 선택해도 됩니다. 계산 전에 다시 확인하도록 안내합니다.</p><div class="retirement-choice-grid">
      ${[["severance_pay","일반 퇴직금","퇴직 시 회사가 직접 퇴직금을 지급"],["db_pension","DB형 퇴직연금","퇴직급여 수준이 사전에 정해지는 방식"],["dc_pension","DC형 퇴직연금","회사가 매년 부담금을 납입하는 방식"],["unknown","유형 모름","가입 안내나 금융기관 명세서를 확인해야 함"]].map(([v,t,d]) => `<label class="retirement-choice"><input type="radio" name="benefitType" value="${v}" required><span class="retirement-choice-dot"></span><span><b>${t}</b><small>${d}</small></span></label>`).join("")}
    </div></section>
    <section class="retirement-card"><h3>근속기간과 주당 근로시간</h3><p>퇴직일은 고용노동부 계산기 기준처럼 ‘마지막 근무일의 다음 날’로 입력합니다.</p><div class="retirement-fields">
      <label><span>입사일</span><input class="case-input" type="date" name="employmentStartDate" required></label>
      <label><span>퇴직일(마지막 근무일 다음날)</span><input class="case-input" type="date" name="retirementDate" required></label>
      <label><span>평균 주 소정근로시간</span><input class="case-input" type="number" min="0" step="0.1" name="averageWeeklyScheduledHours" required placeholder="예: 40"></label>
      <label><span>주 15시간 미만으로 근무한 기간이 있었나요?</span>${boolSelect("hadUnder15HourPeriods", null)}</label>
    </div></section>
    <div class="case-actions"><button class="btn primary" type="submit">퇴직급여 사건 만들기</button></div>
  </form>`;
  ROOT.querySelector("[data-start-form]")?.addEventListener("submit", createCase);
}

async function createCase(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  if (!data.get("hadUnder15HourPeriods")) return showError("주 15시간 미만 근무기간 여부를 선택해 주세요.");
  const facts = {
    benefitType: data.get("benefitType"),
    employmentStartDate: data.get("employmentStartDate"),
    retirementDate: data.get("retirementDate"),
    averageWeeklyScheduledHours: Number(data.get("averageWeeklyScheduledHours")),
    hadUnder15HourPeriods: data.get("hadUnder15HourPeriods") === "true",
  };
  const button = form.querySelector("button[type=submit]");
  if (button) button.disabled = true;
  try {
    const result = await api("/api/cases/retirement-intake", { method: "POST", body: JSON.stringify({ facts }) });
    setSession(result.case.id, result.accessToken);
    renderWorkspace(result);
  } catch {
    if (button) button.disabled = false;
    showError("사건을 만들지 못했습니다. 다시 시도해 주세요.");
  }
}

function moneyFields(facts) {
  if (facts.benefitType === "dc_pension") return `
    <label><span>회사 납입의무 총액</span><input class="case-input" type="number" min="0" name="dcExpectedContributionsTotal" value="${esc(facts.dcExpectedContributionsTotal ?? "")}" placeholder="명세서 기준"></label>
    <label><span>실제 납입된 총액</span><input class="case-input" type="number" min="0" name="dcPaidContributionsTotal" value="${esc(facts.dcPaidContributionsTotal ?? "")}" placeholder="명세서 기준"></label>`;
  if (!["severance_pay", "db_pension"].includes(facts.benefitType)) return `<div class="retirement-warning">퇴직급여 유형을 확인해야 계산할 수 있습니다.</div>`;
  const excluded = facts.hasAverageWageExcludedPeriod;
  return `
    <label><span>평균임금 산정 제외기간이 있나요?</span>${boolSelect("hasAverageWageExcludedPeriod", excluded)}</label>
    ${excluded === true ? `<label><span>보정된 1일 평균임금</span><input class="case-input" type="number" min="0" name="adjustedAverageDailyWage" value="${esc(facts.adjustedAverageDailyWage ?? "")}" placeholder="제외기간 반영 후"></label>` : ""}
    ${excluded === false ? `
      <label><span>퇴직 전 3개월 임금총액</span><input class="case-input" type="number" min="0" name="threeMonthWageTotal" value="${esc(facts.threeMonthWageTotal ?? "")}"></label>
      <label><span>최근 12개월 상여금 총액</span><input class="case-input" type="number" min="0" name="annualBonusTotal12m" value="${esc(facts.annualBonusTotal12m ?? "")}" placeholder="없으면 0"></label>
      <label><span>평균임금 반영 연차수당</span><input class="case-input" type="number" min="0" name="annualLeaveAllowanceForAverageWage" value="${esc(facts.annualLeaveAllowanceForAverageWage ?? "")}" placeholder="없으면 0"></label>` : ""}
    <label><span>1일 통상임금</span><input class="case-input" type="number" min="0" name="ordinaryDailyWage" value="${esc(facts.ordinaryDailyWage ?? "")}"></label>
    <label><span>이미 지급받은 퇴직급여</span><input class="case-input" type="number" min="0" name="amountAlreadyPaid" value="${esc(facts.amountAlreadyPaid ?? "")}" placeholder="없으면 0"></label>
    ${facts.hadUnder15HourPeriods === true ? `<label><span>주 15시간 이상 기간의 합산 일수</span><input class="case-input" type="number" min="0" name="qualifyingServiceDays" value="${esc(facts.qualifyingServiceDays ?? "")}"></label>` : ""}`;
}

function renderWorkspace(result) {
  const facts = result.case?.facts || {};
  const legal = result.legal || {};
  const money = legal.money || {};
  const averageWage = legal.averageWage || {};
  ROOT.innerHTML = `<div class="retirement-workspace">
    <section class="retirement-card"><div class="resource-head"><div><span class="case-kicker">${esc(TYPE_LABELS[facts.benefitType] || "퇴직급여")}</span><h2>퇴직금·퇴직연금 사건</h2><p>${esc(facts.employmentStartDate || "?")} ~ ${esc(facts.retirementDate || "?")} · 주 ${esc(facts.averageWeeklyScheduledHours ?? "?")}시간</p></div><span class="retirement-pill">${esc(result.case?.status || "intake")}</span></div><div class="next-action"><b>${esc(result.nextAction?.title || "다음 정보를 확인하세요.")}</b><p>${esc(result.nextAction?.description || "")}</p></div></section>
    <div class="retirement-grid">
      <section class="retirement-card wide" id="retirement-money"><div class="resource-head"><div><h3>퇴직급여 계산</h3><p>제도 유형과 평균임금/부담금 기준을 분리해 계산합니다.</p></div></div>
        <div class="retirement-summary"><div class="retirement-stat"><span>1일 평균임금</span><b>${esc(won(averageWage.amount))}</b></div><div class="retirement-stat"><span>예상 법정액</span><b>${esc(won(money.statutoryEstimate))}</b></div><div class="retirement-stat"><span>기지급액</span><b>${esc(won(money.paidAmount))}</b></div><div class="retirement-stat"><span>예상 미지급액</span><b>${esc(won(money.outstandingEstimate))}</b></div></div>
        <div class="retirement-assessment"><div class="retirement-row"><span>적용 baseline</span><b>${esc(legal.eligibility?.status || "미확인")}</b></div><div class="retirement-row"><span>재직일수</span><b>${esc(legal.eligibility?.serviceDays ?? "미확인")}일</b></div><div class="retirement-row"><span>기본 지급기한</span><b>${esc(legal.payment?.dueDate || "미확인")}${legal.payment?.late ? " · 경과 가능" : ""}</b></div>${averageWage.period ? `<div class="retirement-row"><span>평균임금 산정기간</span><b>${esc(averageWage.period.start)} ~ ${esc(averageWage.period.end)} · ${esc(averageWage.period.days)}일</b></div>` : ""}</div>
        <form data-money-form><div class="retirement-money-fields">${moneyFields(facts)}</div><div class="case-actions"><button class="btn primary" type="submit">계산 정보 저장·재계산</button></div></form>
        ${(legal.warnings || []).length ? `<div class="retirement-warning">재검토: ${(legal.warnings || []).map(esc).join(", ")}</div>` : ""}
      </section>
      <section class="retirement-card wide" id="retirement-evidence"><div class="resource-head"><div><h3>증거 상태</h3><p>평균임금과 지급내역을 확인할 자료를 체크하세요.</p></div></div><form data-evidence-form><div class="retirement-evidence">${Object.entries(EVIDENCE_LABELS).map(([key, label]) => `<label>${esc(label)}<select class="case-select" name="${key}"><option value="unknown" ${facts.evidence?.[key] === "unknown" ? "selected" : ""}>미확인</option><option value="have" ${facts.evidence?.[key] === "have" ? "selected" : ""}>보유</option><option value="planned" ${facts.evidence?.[key] === "planned" ? "selected" : ""}>확보 예정</option><option value="missing" ${facts.evidence?.[key] === "missing" ? "selected" : ""}>없음</option></select></label>`).join("")}</div><div class="case-actions"><button class="btn" type="submit">증거 상태 저장</button></div></form></section>
      <section class="retirement-card wide" id="retirement-sources"><div class="resource-head"><div><h3>공식 근거</h3><p>현재 계산에 사용한 법령과 공식 계산 기준입니다.</p></div></div><div class="source-list">${(legal.sources || []).map((source) => `<a class="source-row" href="${esc(source.url)}" target="_blank" rel="noopener noreferrer"><span><b>${esc(source.article || source.title)}</b><small>${esc(source.authority)} · 확인 ${esc(source.verifiedAt || legal.verifiedAt)}</small></span><span>↗</span></a>`).join("")}</div></section>
      <section class="retirement-card wide" id="retirement-documents"><div class="resource-head"><div><h3>이 사건의 문서</h3><p>미지급액이 계산되면 지급요청과 진정서 초안을 연결합니다.</p></div></div><div class="document-grid">${(result.documents || []).map((doc) => `<button class="document-card" type="button" data-doc="${esc(doc.templateKey)}"><span class="doc-state">초안 가능</span><b>${esc(doc.title)}</b><small>${esc(doc.description)}</small></button>`).join("") || '<div class="resource-empty">현재 계산 기준 추천 문서가 없습니다.</div>'}</div></section>
      <section class="retirement-card wide" id="retirement-procedures"><div class="resource-head"><div><h3>공식 절차</h3><p>지급기한과 미지급액을 기준으로 고용노동부 절차를 연결합니다.</p></div></div><div class="procedure-stack">${(result.procedures || []).map((procedure) => `<div class="procedure-box"><div><b>${esc(procedure.title)}</b><small>${esc(procedure.description)}</small></div><a class="btn primary" href="${esc(procedure.url)}" target="_blank" rel="noopener noreferrer">노동포털 ↗</a></div>`).join("") || '<div class="resource-empty">현재 자동 연결 절차가 없습니다.</div>'}</div></section>
    </div><div class="workspace-foot"><button class="btn" type="button" data-report>사건 요약 복사</button><button class="btn danger" type="button" data-delete>사건 삭제</button></div>
  </div>`;
  ROOT.querySelector("[data-money-form]")?.addEventListener("submit", saveMoney);
  ROOT.querySelector("[data-evidence-form]")?.addEventListener("submit", saveEvidence);
  ROOT.querySelectorAll("[data-doc]").forEach((button) => button.addEventListener("click", () => previewDocument(button.dataset.doc)));
  ROOT.querySelector("[data-report]")?.addEventListener("click", copyReport);
  ROOT.querySelector("[data-delete]")?.addEventListener("click", deleteCase);
}

async function saveMoney(event) {
  event.preventDefault();
  const patch = {};
  for (const control of event.currentTarget.elements) {
    const value = controlValue(control);
    if (value !== undefined) patch[control.name] = value;
  }
  try {
    await patchFacts(patch, event.currentTarget.querySelector("button[type=submit]"));
  } catch {
    // Shared client core already renders the user-facing error.
  }
}

client = createCaseClientCore({
  root: ROOT,
  storageKey: STORAGE_KEY,
  slug: "retirement",
  errorClass: "retirement-error",
  previewId: "retirement-doc-preview",
  deleteConfirm: "이 퇴직급여 사건을 삭제할까요?",
  renderStart,
  renderWorkspace,
});

client.restore();
