const ROOT = document.getElementById("wageApp");
const STORAGE_KEY = "insaya:wage-case-session";

const STEP_LABELS = {
  case: "1 · 사건 구분",
  dates: "2 · 날짜 확인",
  money: "3 · 금액 확인",
  extra_pay: "4 · 추가 수당",
  evidence: "5 · 증거",
  complete: "완료",
};

const ISSUE_LABELS = {
  "wage.base_pay": "기본급",
  "wage.overtime": "연장근로수당",
  "wage.night": "야간근로수당",
  "wage.holiday": "휴일근로수당",
  "wage.annual_leave_pay": "연차수당",
  "wage.delay_interest": "지연이자",
  "severance.payment": "퇴직금",
};

const EVIDENCE_LABELS = {
  employmentContract: "근로계약서",
  payslip: "급여명세서",
  bankHistory: "급여 입금 계좌내역",
  attendanceRecord: "출퇴근·근무시간 기록",
  messagesWithEmployer: "회사와 주고받은 문자·메신저",
};

const EXTRA_LABELS = {
  overtimeWork: "연장근로가 있었나요?",
  nightWork: "야간근로가 있었나요?",
  holidayWork: "휴일근로가 있었나요?",
  unusedAnnualLeave: "미사용 연차 문제가 있나요?",
};

let session = loadSession();
let current = null;
let busy = false;

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function loadSession() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
    if (parsed?.id && parsed?.token) return parsed;
  } catch {}
  return null;
}

function saveSession(next) {
  session = next;
  if (!next) sessionStorage.removeItem(STORAGE_KEY);
  else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers["content-type"]) headers["content-type"] = "application/json";
  if (session?.token) headers["x-case-token"] = session.token;

  const response = await fetch(path, { ...options, headers });
  if (response.status === 204) return null;

  let body = null;
  try { body = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error(body?.error || `http_${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

function setBusy(next) {
  busy = next;
  ROOT.querySelectorAll("button,select,input").forEach((el) => {
    if (el.dataset.keepEnabled === "true") return;
    el.disabled = next;
  });
}

function showError(message) {
  const old = ROOT.querySelector(".case-alert.error");
  if (old) old.remove();
  const box = document.createElement("div");
  box.className = "case-alert error";
  box.textContent = message;
  ROOT.prepend(box);
}

function friendlyError(error) {
  if (error?.status === 401) return "사건 접근 정보가 만료됐습니다. 새 사건으로 다시 시작해 주세요.";
  if (error?.message === "facts_required") return "입력 내용을 확인해 주세요.";
  if (error?.message === "case_not_found") return "사건을 찾을 수 없습니다.";
  return "저장 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.";
}

function renderStart() {
  current = null;
  ROOT.innerHTML = `
    <div class="case-start">
      <div class="case-start-grid">
        <div>
          <h2>먼저 두 가지만 알려주세요.</h2>
          <p>사건을 만들기 전에 현재 상태와 못 받은 임금 항목만 확인합니다.</p>
        </div>
        <div class="question-card">
          <span class="question-label">현재 회사와의 근로관계는 어떤 상태인가요?</span>
          <div class="choice-grid" data-start-status>
            ${choice("employmentStatus", "employed", "재직 중")}
            ${choice("employmentStatus", "resigned", "퇴사")}
            ${choice("employmentStatus", "dismissed", "해고·계약종료")}
          </div>
        </div>
        <div class="question-card">
          <span class="question-label">받지 못한 돈이 무엇인가요?</span>
          <div class="choice-grid" data-start-items>
            ${choice("unpaidItems", "월급", "월급·기본급", "checkbox")}
            ${choice("unpaidItems", "연장수당", "연장수당", "checkbox")}
            ${choice("unpaidItems", "야간수당", "야간수당", "checkbox")}
            ${choice("unpaidItems", "휴일수당", "휴일수당", "checkbox")}
            ${choice("unpaidItems", "연차수당", "연차수당", "checkbox")}
            ${choice("unpaidItems", "퇴직금", "퇴직금", "checkbox")}
          </div>
        </div>
        <div class="case-start-note">사건 접근 토큰은 이 브라우저 탭의 세션에만 보관됩니다. URL에는 포함하지 않습니다.</div>
        <button class="btn primary full" type="button" data-start-case>사건 만들고 계속하기</button>
      </div>
    </div>
  `;
  ROOT.querySelector("[data-start-case]")?.addEventListener("click", startCase);
}

function choice(name, value, label, type = "radio", checked = false) {
  return `<label class="choice"><input type="${type}" name="${esc(name)}" value="${esc(value)}" ${checked ? "checked" : ""}/><span>${esc(label)}</span></label>`;
}

async function startCase() {
  if (busy) return;
  const status = ROOT.querySelector('input[name="employmentStatus"]:checked')?.value;
  const items = [...ROOT.querySelectorAll('input[name="unpaidItems"]:checked')].map((el) => el.value);
  if (!status || !items.length) {
    showError("현재 상태와 받지 못한 임금 항목을 선택해 주세요.");
    return;
  }

  try {
    setBusy(true);
    const result = await api("/api/cases/wage-intake", {
      method: "POST",
      body: JSON.stringify({ facts: { employmentStatus: status, unpaidItems: items } }),
    });
    saveSession({ id: result.case.id, token: result.accessToken });
    current = result;
    renderCurrent();
  } catch (error) {
    showError(friendlyError(error));
  } finally {
    setBusy(false);
  }
}

function progressIndex(step) {
  return ({ case: 1, dates: 2, money: 3, extra_pay: 4, evidence: 5, complete: 5 })[step] || 1;
}

function renderProgress(step) {
  const n = progressIndex(step);
  return `<div class="case-progress" aria-label="진행 단계">${[1,2,3,4,5].map((i) => `<span class="${i <= n ? "on" : ""}"></span>`).join("")}</div>`;
}

function renderCurrent() {
  if (!current?.case || !current?.intake) return renderStart();
  if (current.intake.readyForWorkspace) return renderWorkspace();
  renderIntake();
}

function renderIntake() {
  const intake = current.intake;
  ROOT.innerHTML = `
    ${renderProgress(intake.step)}
    <div class="case-panel">
      <div class="case-panel-head">
        <div>
          <div class="case-step">${esc(STEP_LABELS[intake.step] || intake.step)}</div>
          <h2>지금 필요한 내용만 확인할게요.</h2>
          <p>한 번에 최대 3개만 묻고, 저장하면 다음 단계로 넘어갑니다.</p>
        </div>
        <button class="btn" type="button" data-reset>새 사건</button>
      </div>
      <form class="case-form" data-intake-form>
        ${intake.questions.map(renderQuestion).join("")}
        <div class="case-actions">
          <button class="btn primary" type="submit">저장하고 다음</button>
        </div>
      </form>
    </div>
  `;
  ROOT.querySelector("[data-intake-form]")?.addEventListener("submit", submitQuestions);
  ROOT.querySelector("[data-reset]")?.addEventListener("click", confirmDeleteCase);
}

function renderQuestion(item) {
  const key = item.key;
  const facts = current.case.facts || {};
  const label = esc(item.question || key);

  if (key === "employmentStatus") {
    return `<div class="question-card"><span class="question-label">${label}</span><div class="choice-grid">
      ${choice(key, "employed", "재직 중", "radio", facts[key] === "employed")}
      ${choice(key, "resigned", "퇴사", "radio", facts[key] === "resigned")}
      ${choice(key, "dismissed", "해고·계약종료", "radio", facts[key] === "dismissed")}
    </div></div>`;
  }

  if (key === "unpaidItems") {
    const selected = new Set(Array.isArray(facts.unpaidItems) ? facts.unpaidItems : []);
    const values = ["월급", "연장수당", "야간수당", "휴일수당", "연차수당", "퇴직금"];
    return `<div class="question-card"><span class="question-label">${label}</span><div class="choice-grid">${values.map((v) => choice(key, v, v, "checkbox", selected.has(v))).join("")}</div></div>`;
  }

  if (["employmentStartDate","employmentEndDate","unpaidPeriodStart","unpaidPeriodEnd"].includes(key)) {
    return `<label class="question-card"><span class="question-label">${label}</span><input class="case-input" type="date" name="${esc(key)}" value="${esc(facts[key] || "")}" required /></label>`;
  }

  if (key === "payDay") {
    return `<label class="question-card"><span class="question-label">${label}</span><div class="question-help">예: 매월 10일, 매월 말일</div><input class="case-input" type="text" name="payDay" maxlength="80" placeholder="예: 매월 10일" value="${esc(facts.payDay || "")}" required /></label>`;
  }

  if (key === "wageAmount") {
    const type = facts.hourlyWage != null ? "hourlyWage" : facts.dailyWage != null ? "dailyWage" : "monthlyBasePay";
    const amount = facts[type] ?? "";
    return `<div class="question-card"><span class="question-label">${label}</span><div class="input-row"><select class="case-select" name="wageType"><option value="monthlyBasePay" ${type === "monthlyBasePay" ? "selected" : ""}>월 기본급</option><option value="hourlyWage" ${type === "hourlyWage" ? "selected" : ""}>시급</option><option value="dailyWage" ${type === "dailyWage" ? "selected" : ""}>일급</option></select><input class="case-input" type="number" min="0" step="1" name="wageAmount" value="${esc(amount)}" placeholder="금액 입력" required /></div></div>`;
  }

  if (key === "alreadyPaidAmount") {
    return `<label class="question-card"><span class="question-label">${label}</span><div class="question-help">전혀 받지 못했다면 0을 입력하세요.</div><input class="case-input" type="number" min="0" step="1" name="alreadyPaidAmount" value="${esc(facts.alreadyPaidAmount ?? "")}" required /></label>`;
  }

  if (Object.hasOwn(EXTRA_LABELS, key)) {
    return `<div class="question-card"><span class="question-label">${label}</span><div class="choice-grid">${choice(key, "true", "있어요", "radio", facts[key] === true)}${choice(key, "false", "없어요", "radio", facts[key] === false)}</div></div>`;
  }

  return `<label class="question-card"><span class="question-label">${label}</span><input class="case-input" type="text" name="${esc(key)}" value="${esc(facts[key] || "")}" required /></label>`;
}

function collectQuestionFacts(form) {
  const patch = {};
  const keys = current.intake.questions.map((item) => item.key);

  for (const key of keys) {
    if (key === "unpaidItems") {
      patch.unpaidItems = [...form.querySelectorAll('input[name="unpaidItems"]:checked')].map((el) => el.value);
      continue;
    }
    if (key === "wageAmount") {
      const type = form.elements.wageType?.value;
      const amount = Number(form.elements.wageAmount?.value);
      if (type && Number.isFinite(amount)) patch[type] = amount;
      continue;
    }
    if (Object.hasOwn(EXTRA_LABELS, key)) {
      const value = form.querySelector(`input[name="${key}"]:checked`)?.value;
      if (value === "true" || value === "false") patch[key] = value === "true";
      continue;
    }
    const field = form.elements[key];
    if (!field) continue;
    if (key === "alreadyPaidAmount") patch[key] = Number(field.value);
    else patch[key] = field.value;
  }
  return patch;
}

async function submitQuestions(event) {
  event.preventDefault();
  if (busy || !session) return;
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const patch = collectQuestionFacts(form);

  try {
    setBusy(true);
    current = await api(`/api/cases/${encodeURIComponent(session.id)}/wage-intake`, {
      method: "PATCH",
      body: JSON.stringify({ facts: patch }),
    });
    renderCurrent();
  } catch (error) {
    if (error.status === 401) saveSession(null);
    showError(friendlyError(error));
  } finally {
    setBusy(false);
  }
}

function formatMoney(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toLocaleString("ko-KR")}원` : "미확인";
}

function wageValue(facts) {
  if (facts.monthlyBasePay != null) return `월 기본급 ${formatMoney(facts.monthlyBasePay)}`;
  if (facts.hourlyWage != null) return `시급 ${formatMoney(facts.hourlyWage)}`;
  if (facts.dailyWage != null) return `일급 ${formatMoney(facts.dailyWage)}`;
  return "미확인";
}

function factRows(facts) {
  const status = ({ employed: "재직 중", resigned: "퇴사", dismissed: "해고·계약종료" })[facts.employmentStatus] || "미확인";
  return [
    ["근로 상태", status],
    ["미지급 항목", (facts.unpaidItems || []).join(", ") || "미확인"],
    ["미지급 기간", facts.unpaidPeriodStart && facts.unpaidPeriodEnd ? `${facts.unpaidPeriodStart} ~ ${facts.unpaidPeriodEnd}` : "미확인"],
    ["급여 기준", wageValue(facts)],
    ["이미 받은 금액", formatMoney(facts.alreadyPaidAmount)],
    ["퇴사·종료일", facts.employmentEndDate || "해당 없음·미확인"],
  ];
}

function nextAction(intake) {
  const serverAction = current?.nextAction || current?.case?.actions?.[0];
  if (serverAction) {
    return {
      title: serverAction.title,
      desc: serverAction.description,
      target: serverAction.target,
    };
  }
  if (intake.missingExtraFacts?.length) return { title: "추가 수당 가능성을 확인하세요.", desc: "연장·야간·휴일근로와 미사용 연차 여부를 확인하면 사건 금액 범위를 더 정확하게 좁힐 수 있습니다.", target: "extra" };
  if ((intake.evidence?.haveCount || 0) < 2) return { title: "증거를 먼저 확보해 두세요.", desc: "급여명세서와 계좌내역처럼 지급 여부를 바로 확인할 수 있는 자료부터 정리하는 것이 좋습니다.", target: "evidence" };
  return { title: "핵심 사실 정리가 끝났습니다.", desc: "다음 단계에서는 확인된 사실을 기준으로 체불액 계산과 공식 절차 준비로 이어집니다.", target: "facts" };
}

function renderWorkspace() {
  const { case: caseData, intake } = current;
  const facts = caseData.facts || {};
  const action = nextAction(intake);
  ROOT.innerHTML = `
    <div class="workspace">
      <div class="workspace-top">
        <div><div class="case-step">Case Workspace</div><div class="workspace-title">임금체불 · 진행 중</div><div class="workspace-sub">핵심 사실이 모여 사건 Workspace를 만들었습니다.</div></div>
        <span class="status-pill">사건 정리 중</span>
      </div>
      <div class="workspace-grid">
        <section class="workspace-card" id="facts">
          <h3>확인된 사실</h3>
          <div class="fact-list">${factRows(facts).map(([k,v]) => `<div class="fact-row"><span class="fact-key">${esc(k)}</span><span class="fact-value">${esc(v)}</span></div>`).join("")}</div>
        </section>
        <section class="workspace-card">
          <h3>현재 쟁점</h3>
          <div class="issue-list">${(intake.issues || []).length ? intake.issues.map((id) => `<span class="issue-chip">${esc(ISSUE_LABELS[id] || id)}</span>`).join("") : '<span class="workspace-sub">아직 활성화된 추가 쟁점이 없습니다.</span>'}</div>
        </section>
        <section class="workspace-card next-action wide">
          <div class="eyebrow">NEXT BEST ACTION</div>
          <h3>${esc(action.title)}</h3><p>${esc(action.desc)}</p>
          <button class="btn" type="button" data-scroll-target="${esc(action.target)}">지금 확인하기</button>
        </section>
        ${renderExtraSection(facts, intake)}
        ${renderEvidenceSection(facts, intake)}
      </div>
      <div class="workspace-foot"><small>사건 ID ${esc(caseData.id)} · 접근 토큰은 화면에 표시하지 않습니다.</small><button class="btn danger" type="button" data-reset>이 사건 삭제</button></div>
    </div>
  `;

  ROOT.querySelector("[data-extra-form]")?.addEventListener("submit", submitExtraFacts);
  ROOT.querySelector("[data-evidence-form]")?.addEventListener("submit", submitEvidence);
  ROOT.querySelector("[data-reset]")?.addEventListener("click", confirmDeleteCase);
  ROOT.querySelectorAll("[data-scroll-target]").forEach((button) => button.addEventListener("click", () => {
    document.getElementById(button.dataset.scrollTarget)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }));
}

function renderExtraSection(facts, intake) {
  const keys = ["overtimeWork","nightWork","holidayWork","unusedAnnualLeave"];
  return `<section class="workspace-card wide" id="extra"><h3>추가 수당 가능성</h3><form data-extra-form><div class="extra-grid">${keys.map((key) => `<div class="extra-item"><b>${esc(EXTRA_LABELS[key])}</b><div class="choice-grid">${choice(key,"true","있음","radio",facts[key]===true)}${choice(key,"false","없음","radio",facts[key]===false)}</div></div>`).join("")}</div><div class="case-actions"><button class="btn primary" type="submit">추가 수당 정보 저장</button></div></form></section>`;
}

function renderEvidenceSection(facts, intake) {
  const evidence = facts.evidence || {};
  return `<section class="workspace-card wide" id="evidence"><h3>증거 체크리스트</h3><div class="evidence-summary">보유 ${intake.evidence?.haveCount || 0}개 · 상태 확인 ${intake.evidence?.knownCount || 0}/${intake.evidence?.totalCount || 5}</div><form class="evidence-list" data-evidence-form>${Object.entries(EVIDENCE_LABELS).map(([id,label]) => `<label class="evidence-row"><span class="evidence-name">${esc(label)}</span><select class="evidence-select" name="${esc(id)}"><option value="unknown" ${evidence[id]==="unknown"||!evidence[id]?"selected":""}>아직 확인 안 함</option><option value="have" ${evidence[id]==="have"?"selected":""}>보유</option><option value="planned" ${evidence[id]==="planned"?"selected":""}>확보 예정</option><option value="missing" ${evidence[id]==="missing"?"selected":""}>없음</option></select></label>`).join("")}<div class="case-actions"><button class="btn primary" type="submit">증거 상태 저장</button></div></form></section>`;
}

async function submitExtraFacts(event) {
  event.preventDefault();
  const patch = {};
  for (const key of Object.keys(EXTRA_LABELS)) {
    const v = event.currentTarget.querySelector(`input[name="${key}"]:checked`)?.value;
    if (v === "true" || v === "false") patch[key] = v === "true";
  }
  await patchWorkspace(patch);
}

async function submitEvidence(event) {
  event.preventDefault();
  const evidence = {};
  for (const id of Object.keys(EVIDENCE_LABELS)) evidence[id] = event.currentTarget.elements[id]?.value || "unknown";
  await patchWorkspace({ evidence });
}

async function patchWorkspace(facts) {
  if (busy || !session) return;
  try {
    setBusy(true);
    current = await api(`/api/cases/${encodeURIComponent(session.id)}/wage-intake`, {
      method: "PATCH",
      body: JSON.stringify({ facts }),
    });
    renderWorkspace();
  } catch (error) {
    if (error.status === 401) saveSession(null);
    showError(friendlyError(error));
  } finally {
    setBusy(false);
  }
}

async function confirmDeleteCase() {
  if (!session) return renderStart();
  if (!window.confirm("이 사건과 현재 접근 권한을 삭제할까요?")) return;
  try {
    setBusy(true);
    await api(`/api/cases/${encodeURIComponent(session.id)}`, { method: "DELETE" });
  } catch (error) {
    if (error.status !== 401 && error.status !== 404) {
      showError(friendlyError(error));
      setBusy(false);
      return;
    }
  }
  saveSession(null);
  setBusy(false);
  renderStart();
}

async function restore() {
  if (!session) return renderStart();
  try {
    current = await api(`/api/cases/${encodeURIComponent(session.id)}/wage-intake`);
    renderCurrent();
  } catch (error) {
    if (error.status === 401 || error.status === 404) {
      saveSession(null);
      renderStart();
      return;
    }
    ROOT.innerHTML = `<div class="case-empty"><h2>사건을 불러오지 못했습니다.</h2><p>${esc(friendlyError(error))}</p><button class="btn primary" type="button" data-retry>다시 시도</button></div>`;
    ROOT.querySelector("[data-retry]")?.addEventListener("click", restore);
  }
}

restore();
