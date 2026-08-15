import {
  booleanSelect,
  controlValue,
  createCaseClientCore,
  escapeHtml as esc,
  formatWon as won,
} from "./case-client-core.js";

const ROOT = document.getElementById("annualLeaveApp");
const STORAGE_KEY = "insaya:annual-leave-case-session";
let client;

const api = (...args) => client.api(...args);
const setSession = (...args) => client.setSession(...args);
const showError = (text) => client.showError(text);
const patchFacts = (...args) => client.patchFacts(...args);
const saveEvidence = (event) => client.saveEvidence(event);
const previewDocument = (templateKey) => client.previewDocument(templateKey);
const copyReport = (event) => client.copyReport(event);
const deleteCase = () => client.deleteCase();
const boolSelect = (name, value, labelYes = "예", labelNo = "아니오") => booleanSelect(name, value, { yesLabel: labelYes, noLabel: labelNo });

const EVIDENCE_LABELS = {
  employmentContract: "근로계약서",
  attendanceRecord: "출근·근태기록",
  leaveLedger: "연차 발생·사용대장",
  promotionNotices: "연차 사용촉진 서면",
  payslip: "급여명세서",
  bankHistory: "급여·수당 입금내역",
};

function renderStart() {
  ROOT.innerHTML = `<form class="annual-start" data-start-form>
<section class="annual-card"><h2>근속기간과 적용범위부터 확인할게요.</h2><p>연차는 주 소정근로시간과 사업장 규모, 근로관계 존속일에 따라 발생 여부가 달라집니다.</p><div class="annual-fields">
<label><span>사건 기준일</span><input class="case-input" type="date" name="referenceDate" required></label>
<label><span>입사일</span><input class="case-input" type="date" name="employmentStartDate" required></label>
<label><span>현재 재직 상태</span><select class="case-select" name="employmentStatus" required><option value="">선택</option><option value="current">재직 중</option><option value="ended">퇴직·계약종료</option></select></label>
<label><span>퇴직·계약종료일(해당 시)</span><input class="case-input" type="date" name="employmentEndDate"></label>
<label><span>현재 확인되는 상시근로자 수</span><input class="case-input" type="number" min="1" step="1" name="workplaceEmployeeCount" required></label>
<label><span>평균 주 소정근로시간</span><input class="case-input" type="number" min="0" step="0.1" name="averageWeeklyScheduledHours" required></label>
</div><div class="annual-note">상시근로자 수는 법정 산정기간에 따라 다시 확인합니다. 1년 이상 연차의 경우 직전 1년 동안 5명 이상 사업장 적용 여부를 별도로 묻습니다.</div></section>
<div class="case-actions"><button class="btn primary" type="submit">연차 사건 만들기</button></div></form>`;
  ROOT.querySelector("[data-start-form]")?.addEventListener("submit", createCase);
}

async function createCase(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  if (data.get("employmentStatus") === "ended" && !data.get("employmentEndDate")) {
    return showError("퇴직·계약종료일을 입력해 주세요.");
  }
  const facts = {
    referenceDate: data.get("referenceDate"),
    employmentStartDate: data.get("employmentStartDate"),
    employmentStatus: data.get("employmentStatus"),
    employmentEndDate: data.get("employmentEndDate") || null,
    workplaceEmployeeCount: Number(data.get("workplaceEmployeeCount")),
    averageWeeklyScheduledHours: Number(data.get("averageWeeklyScheduledHours")),
  };
  const button = form.querySelector("button[type=submit]");
  if (button) button.disabled = true;
  try {
    const result = await api("/api/cases/annual-leave-intake", { method: "POST", body: JSON.stringify({ facts }) });
    setSession(result.case.id, result.accessToken);
    renderWorkspace(result);
  } catch {
    if (button) button.disabled = false;
    showError("사건을 만들지 못했습니다. 다시 시도해 주세요.");
  }
}

function detailFields(facts) {
  return `
<div class="annual-section-label">연차 발생 baseline</div>
<label><span>직전 1년 동안 5명 이상 사업장 적용이 계속됐나요?</span>${boolSelect("fivePlusContinuouslyPastYear", facts.fivePlusContinuouslyPastYear)}</label>
<label><span>최신 연차 발생 직전 1년 출근율(%)</span><input class="case-input" type="number" min="0" max="100" step="0.1" name="attendanceRatePercent" value="${esc(facts.attendanceRatePercent ?? "")}" placeholder="예: 95"></label>
<label><span>출근율 80% 미만이면 개근한 월 수</span><input class="case-input" type="number" min="0" max="12" step="1" name="fullAttendanceMonthsPreviousYear" value="${esc(facts.fullAttendanceMonthsPreviousYear ?? "")}" placeholder="해당 시 입력"></label>
<div class="annual-section-label">미사용수당</div>
<label><span>연차대장에서 확인한 미사용 일수</span><input class="case-input" type="number" min="0" step="0.5" name="claimedUnusedDays" value="${esc(facts.claimedUnusedDays ?? "")}"></label>
<label><span>1일 휴가임금 기준액</span><input class="case-input" type="number" min="0" name="dailyLeavePayAmount" value="${esc(facts.dailyLeavePayAmount ?? "")}" placeholder="취업규칙·급여자료로 확인"></label>
<label><span>이미 지급받은 미사용수당</span><input class="case-input" type="number" min="0" name="amountAlreadyPaid" value="${esc(facts.amountAlreadyPaid ?? "")}" placeholder="없으면 0"></label>
<label><span>회사가 연차 사용촉진 절차를 실시했나요?</span>${boolSelect("usePromotionImplemented", facts.usePromotionImplemented)}</label>
<label><span>회사 사정 때문에 연차를 쓰지 못했나요?</span>${boolSelect("employerPreventedUse", facts.employerPreventedUse)}</label>`;
}

function renderWorkspace(result) {
  const facts = result.case?.facts || {};
  const legal = result.legal || {};
  const ent = legal.entitlement || {};
  const latest = ent.latestAnnualGrant || {};
  const money = legal.money || {};
  const scopeLabel = legal.scope?.eligible === true ? "적용 가능 baseline" : legal.scope?.eligible === false ? "적용 제외 가능성" : "적용범위 확인 필요";
  ROOT.innerHTML = `<div class="annual-workspace">
<section class="annual-card"><div class="resource-head"><div><span class="case-kicker">연차유급휴가·미사용수당</span><h2>연차 사건</h2><p>${esc(facts.employmentStartDate || "?")} ~ ${esc(facts.employmentEndDate || "재직 중")} · 주 ${esc(facts.averageWeeklyScheduledHours ?? "?")}시간</p><span class="annual-version">${esc(legal.legalVersion?.id || "법률 버전 재확인")}</span></div><span class="annual-pill">${esc(result.case?.status || "intake")}</span></div><div class="next-action"><b>${esc(result.nextAction?.title || "다음 정보를 확인하세요.")}</b><p>${esc(result.nextAction?.description || "")}</p></div></section>
<div class="annual-grid">
<section class="annual-card wide" id="annual-entitlement"><div class="resource-head"><div><h3>연차 발생 baseline</h3><p>최초 1년 월별 발생과 최신 연차 발생 코호트를 분리해서 보여줍니다.</p></div></div><div class="annual-summary"><div class="annual-stat"><span>최초 1년 월별 발생</span><b>${esc(ent.firstYearMonthlyAccrued ?? "미확인")}일</b></div><div class="annual-stat"><span>최신 연차 발생일</span><b>${esc(latest.grantDate || "미발생/미확인")}</b></div><div class="annual-stat"><span>최신 연차 일수</span><b>${latest.days === null || latest.days === undefined ? "추가 확인 필요" : `${esc(latest.days)}일`}</b></div><div class="annual-stat"><span>적용범위</span><b>${esc(scopeLabel)}</b></div></div><div class="annual-assessment"><div class="annual-row"><span>최신 발생 상태</span><b>${esc(latest.status || "미확인")}</b></div><div class="annual-row"><span>완료 근속연수</span><b>${esc(latest.completedYears ?? 0)}년</b></div><div class="annual-row"><span>법률 기준일</span><b>${esc(legal.referenceDate || "미확인")}</b></div></div><div class="annual-note">${esc(ent.limitation || "")}</div></section>
<section class="annual-card wide" id="annual-money"><div class="resource-head"><div><h3>미사용 연차수당 잠정 계산</h3><p>발생일수를 자동으로 청구일수로 보지 않고 실제 연차대장에서 확인한 미사용일수를 사용합니다.</p></div></div><div class="annual-summary"><div class="annual-stat"><span>확인 미사용일수</span><b>${facts.claimedUnusedDays === null || facts.claimedUnusedDays === undefined ? "추가 확인 필요" : `${esc(facts.claimedUnusedDays)}일`}</b></div><div class="annual-stat"><span>1일 휴가임금</span><b>${esc(won(facts.dailyLeavePayAmount))}</b></div><div class="annual-stat"><span>잠정 총액</span><b>${esc(won(money.potentialGross))}</b></div><div class="annual-stat"><span>예상 미지급액</span><b>${esc(won(money.outstandingEstimate))}</b></div></div><div class="annual-assessment"><div class="annual-row"><span>계산 상태</span><b>${esc(money.status || "미확인")}</b></div><div class="annual-row"><span>기지급액</span><b>${esc(won(money.paidAmount ?? facts.amountAlreadyPaid))}</b></div></div>${money.limitation ? `<div class="annual-warning">${esc(money.limitation)}</div>` : ""}<form data-detail-form><div class="annual-detail-fields">${detailFields(facts)}</div><div class="case-actions"><button class="btn primary" type="submit">연차 정보 저장·재계산</button></div></form>${(legal.warnings || []).length ? `<div class="annual-warning">재검토: ${(legal.warnings || []).map(esc).join(", ")}</div>` : ""}</section>
<section class="annual-card wide" id="annual-evidence"><div class="resource-head"><div><h3>증거 상태</h3><p>연차 발생·사용·사용촉진·수당 지급을 확인할 자료를 체크하세요.</p></div></div><form data-evidence-form><div class="annual-evidence">${Object.entries(EVIDENCE_LABELS).map(([key, label]) => `<label>${esc(label)}<select class="case-select" name="${key}"><option value="unknown" ${facts.evidence?.[key] === "unknown" ? "selected" : ""}>미확인</option><option value="have" ${facts.evidence?.[key] === "have" ? "selected" : ""}>보유</option><option value="planned" ${facts.evidence?.[key] === "planned" ? "selected" : ""}>확보 예정</option><option value="missing" ${facts.evidence?.[key] === "missing" ? "selected" : ""}>없음</option></select></label>`).join("")}</div><div class="case-actions"><button class="btn" type="submit">증거 상태 저장</button></div></form></section>
<section class="annual-card wide" id="annual-sources"><div class="resource-head"><div><h3>공식 근거</h3><p>사건 기준일 법률 버전과 연차 적용범위·365일 경계 판례를 함께 표시합니다.</p></div></div><div class="source-list">${(legal.sources || []).map((source) => `<a class="source-row" href="${esc(source.url)}" target="_blank" rel="noopener noreferrer"><span><b>${esc(source.article || source.title)}</b><small>${esc(source.authority)} · 확인 ${esc(source.verifiedAt || legal.verifiedAt)}</small></span><span>↗</span></a>`).join("")}</div></section>
<section class="annual-card wide" id="annual-documents"><div class="resource-head"><div><h3>이 사건의 문서</h3><p>미지급액이 계산되면 지급요청과 진정서 초안을 연결합니다.</p></div></div><div class="document-grid">${(result.documents || []).map((doc) => `<button class="document-card" type="button" data-doc="${esc(doc.templateKey)}"><span class="doc-state">초안 가능</span><b>${esc(doc.title)}</b><small>${esc(doc.description)}</small></button>`).join("") || '<div class="resource-empty">현재 계산 기준 추천 문서가 없습니다.</div>'}</div></section>
<section class="annual-card wide" id="annual-procedures"><div class="resource-head"><div><h3>공식 절차</h3><p>미사용 연차수당 미지급이 계산되면 고용노동부 절차를 연결합니다.</p></div></div><div class="procedure-stack">${(result.procedures || []).map((procedure) => `<div class="procedure-box"><div><b>${esc(procedure.title)}</b><small>${esc(procedure.description)}</small></div><a class="btn primary" href="${esc(procedure.url)}" target="_blank" rel="noopener noreferrer">노동포털 ↗</a></div>`).join("") || '<div class="resource-empty">현재 자동 연결 절차가 없습니다.</div>'}</div></section>
</div><div class="workspace-foot"><button class="btn" type="button" data-report>사건 요약 복사</button><button class="btn danger" type="button" data-delete>사건 삭제</button></div></div>`;
  ROOT.querySelector("[data-detail-form]")?.addEventListener("submit", saveDetails);
  ROOT.querySelector("[data-evidence-form]")?.addEventListener("submit", saveEvidence);
  ROOT.querySelectorAll("[data-doc]").forEach((button) => button.addEventListener("click", () => previewDocument(button.dataset.doc)));
  ROOT.querySelector("[data-report]")?.addEventListener("click", copyReport);
  ROOT.querySelector("[data-delete]")?.addEventListener("click", deleteCase);
}

async function saveDetails(event) {
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
  slug: "annual-leave",
  errorClass: "annual-error",
  previewId: "annual-doc-preview",
  deleteConfirm: "이 연차 사건을 삭제할까요?",
  renderStart,
  renderWorkspace,
});

client.restore();
