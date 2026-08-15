import {
  booleanSelect as boolOptions,
  controlValue as valueFromControl,
  createCaseClientCore,
  escapeHtml as esc,
  formatWon as money,
} from "./case-client-core.js";

const ROOT = document.getElementById("dismissalApp");
const STORAGE_KEY = "insaya:dismissal-case-session";
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
  dismissal: "회사가 일방적으로 해고 통보",
  advised_resignation: "회사 권고로 사직 논의",
  contract_end: "기간제 계약 종료",
  unclear: "해고인지 사직인지 불분명",
};

const EVIDENCE_LABELS = {
  dismissalNotice: "해고·종료 통지서",
  messagesWithEmployer: "회사와 주고받은 메시지",
  resignationLetter: "사직서·사직 합의서",
  employmentContract: "근로계약서",
  payslip: "급여명세서",
};

function yesNo(value) {
  return value === true ? "예" : value === false ? "아니오" : "미확인";
}

function renderStart() {
  ROOT.innerHTML = `
    <form class="dismissal-start" data-start-form>
      <section class="dismissal-card">
        <h2>먼저 종료 방식을 선택하세요.</h2>
        <p>회사나 문서에 적힌 명칭보다 실제 상황에 가장 가까운 항목을 골라주세요.</p>
        <div class="choice-grid">
          <label class="choice-card"><input type="radio" name="separationType" value="dismissal" required><span class="choice-dot"></span><span class="choice-copy"><b>일방 해고 통보</b><small>회사가 동의를 묻지 않고 근로관계 종료를 통보</small></span></label>
          <label class="choice-card"><input type="radio" name="separationType" value="advised_resignation" required><span class="choice-dot"></span><span class="choice-copy"><b>권고사직 논의</b><small>회사가 사직을 제안했고 동의·서명 여부를 확인해야 함</small></span></label>
          <label class="choice-card"><input type="radio" name="separationType" value="contract_end" required><span class="choice-dot"></span><span class="choice-copy"><b>기간제 계약 종료</b><small>정해진 계약기간 만료 또는 갱신 거절</small></span></label>
          <label class="choice-card"><input type="radio" name="separationType" value="unclear" required><span class="choice-dot"></span><span class="choice-copy"><b>구분이 불분명</b><small>사직서를 요구받았거나 출근하지 말라는 통보만 받은 경우 등</small></span></label>
        </div>
      </section>
      <section class="dismissal-card">
        <h3>핵심 날짜와 사업장 규모</h3>
        <p>이 네 가지가 있어야 적용되는 해고 규정과 절차를 나눌 수 있습니다.</p>
        <div class="core-fields">
          <label><span>입사일</span><input class="case-input" type="date" name="employmentStartDate" required></label>
          <label><span>종료일 또는 예정일</span><input class="case-input" type="date" name="effectiveDate" required></label>
          <label><span>상시근로자 수</span><input class="case-input" type="number" min="0" step="1" name="workplaceEmployeeCount" placeholder="예: 8" required></label>
        </div>
      </section>
      <div class="case-actions"><button class="btn primary" type="submit">사건 만들고 적용범위 확인</button></div>
    </form>`;
  ROOT.querySelector("[data-start-form]")?.addEventListener("submit", createCase);
}

async function createCase(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const count = Number(data.get("workplaceEmployeeCount"));
  const facts = {
    separationType: data.get("separationType"),
    employmentStartDate: data.get("employmentStartDate"),
    effectiveDate: data.get("effectiveDate"),
    workplaceEmployeeCount: Number.isFinite(count) ? count : null,
  };
  const button = form.querySelector("button[type=submit]");
  if (button) button.disabled = true;
  try {
    const result = await api("/api/cases/dismissal-intake", {
      method: "POST",
      body: JSON.stringify({ facts }),
    });
    setSession(result.case.id, result.accessToken);
    renderWorkspace(result);
  } catch {
    if (button) button.disabled = false;
    showError("사건을 만들지 못했습니다. 입력값을 확인하고 다시 시도해 주세요.");
  }
}

function classificationText(legal) {
  const status = legal?.characterization?.status;
  const map = {
    dismissal_input: "입력상 해고",
    agreed_termination_indicators: "합의 종료 정황 있음 · 추가 검토",
    possible_involuntary_termination: "사실상 해고 가능성 검토",
    fixed_term_end_requires_review: "계약만료 · 갱신기대 등 추가 검토",
    characterization_required: "종료 성격 추가 확인 필요",
  };
  return map[status] || "추가 확인 필요";
}

function assessmentSection(result) {
  const legal = result.legal || {};
  const allowance = legal.noticeAllowance;
  return `<section class="dismissal-card">
    <div class="resource-head"><div><h3>현재 적용범위</h3><p>입력한 사업장 규모와 종료 방식에 따른 baseline입니다.</p></div><span class="assessment-pill ${legal.fivePlus === false ? "warn" : ""}">${legal.fivePlus === true ? "상시 5명 이상" : legal.fivePlus === false ? "상시 5명 미만" : "규모 미확인"}</span></div>
    <div class="assessment-list">
      <div class="assessment-row"><span>종료 성격</span><b>${esc(classificationText(legal))}</b></div>
      <div class="assessment-row"><span>부당해고 정당성·서면통지 검토</span><b>${legal.unfairDismissalReviewApplies ? "근로기준법 baseline 검토 대상" : "현재 입력상 적용 대상 아님/미확인"}</b></div>
      <div class="assessment-row"><span>노동위원회 구제 baseline</span><b>${legal.laborBoardEligibleBaseline ? "신청 가능성 검토" : "현재 입력상 연결하지 않음"}</b></div>
      <div class="assessment-row"><span>해고예고수당</span><b>${allowance ? `${esc(allowance.status)} · ${esc(money(allowance.amount))}` : "해당 없음/미확인"}</b></div>
    </div>
    ${legal.remedyWindow ? `<div class="deadline-box"><b>구제신청 기간을 먼저 챙기세요.</b><p>${esc(legal.remedyWindow.text)} · 기준 해고일 ${esc(legal.remedyWindow.from)}. 정확한 말일 계산은 실제 신청 전에 재확인합니다.</p></div>` : ""}
    ${(legal.warnings || []).length ? `<div class="dismissal-note">검토 플래그: ${(legal.warnings || []).map(esc).join(", ")}</div>` : ""}
  </section>`;
}

function conditionalFields(facts, legal) {
  if (facts.separationType === "dismissal") {
    return `
      <label><span>해고 통보일</span><input class="case-input" type="date" name="noticeDate" value="${esc(facts.noticeDate || "")}"></label>
      <label><span>서면 통지를 받았나요?</span>${boolOptions("writtenNoticeReceived", facts.writtenNoticeReceived)}</label>
      <label><span>해고예고수당을 받았나요?</span>${boolOptions("noticePayPaid", facts.noticePayPaid)}</label>
      <label><span>회사에서 말한 해고 사유</span><input class="case-input" name="employerReason" value="${esc(facts.employerReason || "")}" placeholder="예: 근무태도, 경영상 이유 등"></label>
      ${legal?.noticeAllowance?.status === "possible_shortfall" && legal.noticeAllowance.amount === null ? `<label><span>1일 통상임금(예고수당 계산용)</span><input class="case-input" type="number" min="0" step="1" name="ordinaryDailyWage" value="${esc(facts.ordinaryDailyWage ?? "")}" placeholder="예: 120000"></label>` : ""}
    `;
  }
  if (facts.separationType === "advised_resignation") {
    return `
      <label><span>권고사직에 명확히 동의했나요?</span>${boolOptions("workerAcceptedRecommendation", facts.workerAcceptedRecommendation)}</label>
      <label><span>사직서·합의서를 제출했나요?</span>${boolOptions("resignationLetterSubmitted", facts.resignationLetterSubmitted)}</label>
      <label><span>강압·기망이 있었다고 보나요?</span>${boolOptions("pressureOrDeception", facts.pressureOrDeception)}</label>
      <label><span>회사가 제시한 종료 사유</span><input class="case-input" name="employerReason" value="${esc(facts.employerReason || "")}"></label>
    `;
  }
  if (facts.separationType === "contract_end") {
    return `
      <label><span>종료일이 정해진 기간제였나요?</span>${boolOptions("fixedTermContract", facts.fixedTermContract)}</label>
      <label><span>계약서상 종료일</span><input class="case-input" type="date" name="contractEndDate" value="${esc(facts.contractEndDate || "")}"></label>
      <label><span>회사가 설명한 갱신·종료 사유</span><input class="case-input" name="employerReason" value="${esc(facts.employerReason || "")}"></label>
    `;
  }
  return `<label><span>회사에서 설명한 종료 경위</span><input class="case-input" name="employerReason" value="${esc(facts.employerReason || "")}" placeholder="받은 말이나 문구를 그대로 적어도 됩니다"></label>`;
}

function evidenceSection(facts) {
  return `<section class="dismissal-card wide" id="dismissal-evidence">
    <div class="resource-head"><div><h3>증거 상태</h3><p>종료 의사와 통보 경위를 보여주는 자료를 먼저 표시하세요.</p></div></div>
    <form data-evidence-form><div class="evidence-grid">${Object.entries(EVIDENCE_LABELS).map(([key, label]) => `<label>${esc(label)}<select class="case-select" name="${esc(key)}"><option value="unknown" ${facts.evidence?.[key] === "unknown" ? "selected" : ""}>미확인</option><option value="have" ${facts.evidence?.[key] === "have" ? "selected" : ""}>보유</option><option value="planned" ${facts.evidence?.[key] === "planned" ? "selected" : ""}>확보 예정</option><option value="missing" ${facts.evidence?.[key] === "missing" ? "selected" : ""}>없음</option></select></label>`).join("")}</div><div class="case-actions"><button class="btn" type="submit">증거 상태 저장</button></div></form>
  </section>`;
}

function sourcesSection(legal) {
  const sources = legal?.sources || [];
  return `<section class="dismissal-card wide" id="dismissal-sources"><div class="resource-head"><div><h3>공식 근거</h3><p>현재 입력 상태에서 실제로 사용한 적용범위와 절차 근거입니다.</p></div></div><div class="source-list">${sources.map((source) => `<a class="source-row" href="${esc(source.url)}" target="_blank" rel="noopener noreferrer"><span><b>${esc(source.article || source.title)}</b><small>${esc(source.authority)} · 확인 ${esc(source.verifiedAt || legal.verifiedAt)}</small></span><span>↗</span></a>`).join("") || '<div class="resource-empty">연결된 근거가 없습니다.</div>'}</div></section>`;
}

function docsSection(documents) {
  return `<section class="dismissal-card wide" id="dismissal-documents"><div class="resource-head"><div><h3>이 사건의 문서</h3><p>현재 사건 사실을 기존 인사야 문서센터 양식에 자동 반영합니다.</p></div></div><div class="document-grid">${(documents || []).map((doc) => `<button class="document-card" type="button" data-doc="${esc(doc.templateKey)}"><span class="doc-state">${doc.status === "ready" ? "초안 가능" : "추가 확인 후"}</span><b>${esc(doc.title)}</b><small>${esc(doc.description)}</small></button>`).join("") || '<div class="resource-empty">현재 입력 기준 자동 추천 문서가 없습니다.</div>'}</div></section>`;
}

function proceduresSection(procedures) {
  return `<section class="dismissal-card wide" id="dismissal-procedures"><div class="resource-head"><div><h3>공식 절차</h3><p>부당해고 구제와 해고예고수당 진정을 서로 다른 절차로 안내합니다.</p></div></div><div class="procedure-stack">${(procedures || []).map((item) => `<div class="procedure-row"><div><b>${esc(item.title)}</b><small>${esc(item.description)}</small><small>${esc(item.authority)} · 확인 ${esc(item.verifiedAt)}</small></div><a class="btn primary" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">공식 사이트 ↗</a></div>`).join("") || '<div class="resource-empty">현재 입력 기준 자동 연결 절차가 없습니다.</div>'}</div></section>`;
}

function renderWorkspace(result) {
  const facts = result.case?.facts || {};
  ROOT.innerHTML = `<div class="dismissal-workspace">
    <section class="dismissal-card"><div class="resource-head"><div><span class="case-kicker">${esc(TYPE_LABELS[facts.separationType] || "종료 경위 확인")}</span><h2>해고·권고사직 사건</h2><p>${esc(facts.employmentStartDate || "?")} ~ ${esc(facts.effectiveDate || "?")} · 상시근로자 ${esc(facts.workplaceEmployeeCount ?? "?")}명</p></div><span class="assessment-pill">${esc(result.case?.status || "intake")}</span></div><div class="next-action"><b>${esc(result.nextAction?.title || "사건 내용을 확인하세요.")}</b><p>${esc(result.nextAction?.description || "")}</p></div></section>
    <div class="dismissal-grid">
      ${assessmentSection(result)}
      <section class="dismissal-card"><div class="resource-head"><div><h3>종료 경위 보완</h3><p>이 사건 유형에서 필요한 사실만 추가로 받습니다.</p></div></div><form data-conditional-form><div class="conditional-fields">${conditionalFields(facts, result.legal)}</div><div class="case-actions"><button class="btn primary" type="submit">사실 저장·다시 판단</button></div></form></section>
      ${evidenceSection(facts)}
      ${sourcesSection(result.legal)}
      ${docsSection(result.documents)}
      ${proceduresSection(result.procedures)}
    </div>
    <div class="workspace-foot"><button class="btn" type="button" data-report>사건 요약 복사</button><button class="btn danger" type="button" data-delete>사건 삭제</button></div>
  </div>`;

  ROOT.querySelector("[data-conditional-form]")?.addEventListener("submit", saveConditional);
  ROOT.querySelector("[data-evidence-form]")?.addEventListener("submit", saveEvidence);
  ROOT.querySelectorAll("[data-doc]").forEach((button) => button.addEventListener("click", () => previewDocument(button.dataset.doc)));
  ROOT.querySelector("[data-report]")?.addEventListener("click", copyReport);
  ROOT.querySelector("[data-delete]")?.addEventListener("click", deleteCase);
}

async function saveConditional(event) {
  event.preventDefault();
  const patch = {};
  for (const control of event.currentTarget.elements) {
    const value = valueFromControl(control);
    if (value !== undefined) patch[control.name] = value;
  }
  try {
    await patchFacts(patch, event.currentTarget.querySelector("button[type=submit]"));
  } catch {
    // Shared client core already renders the configured user-facing error.
  }
}

client = createCaseClientCore({
  root: ROOT,
  storageKey: STORAGE_KEY,
  slug: "dismissal",
  errorClass: "dismissal-error",
  previewId: "dismissal-doc-preview",
  deleteConfirm: "이 탭의 해고·권고사직 사건을 삭제할까요?",
  patchErrorText: "사건 정보를 저장하지 못했습니다. 다시 시도해 주세요.",
  previewErrorText: "문서 초안을 만들지 못했습니다. 사건 정보를 확인해 주세요.",
  closePreviewOnBackdrop: true,
  reportFailureText: "복사 실패 · 다시 시도",
  reportResetMs: 1400,
  disableReportWhileCopying: true,
  shouldClearSessionOnRestoreError: (error) => {
    const message = String(error?.message || "");
    return message.includes("unauthorized") || message.includes("not_found");
  },
  renderStart,
  renderWorkspace,
});

client.restore();
