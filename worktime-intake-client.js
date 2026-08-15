const ROOT = document.getElementById("worktimeApp");
const STORAGE_KEY = "insaya:worktime-case-session";

const EVIDENCE_LABELS = {
  employmentContract: "근로계약서",
  attendanceRecord: "출퇴근기록",
  workSchedule: "근무표·스케줄",
  payslip: "급여명세서",
  bankHistory: "급여 입금내역",
};
const HOUR_LABELS = {
  weekdayOvertimeDayHours: "평일 연장(야간 제외)",
  weekdayOvertimeNightHours: "평일 연장+야간",
  holidayDayUpTo8Hours: "휴일 8시간 이내(야간 제외)",
  holidayNightUpTo8Hours: "휴일 8시간 이내+야간",
  holidayDayOver8Hours: "휴일 8시간 초과(야간 제외)",
  holidayNightOver8Hours: "휴일 8시간 초과+야간",
};

function esc(value) {
  return String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
function getSession() {
  try { const value = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null"); return value?.id && value?.token ? value : null; } catch { return null; }
}
function setSession(id, token) { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ id, token })); }
function clearSession() { sessionStorage.removeItem(STORAGE_KEY); }
async function api(path, options = {}, token = null) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers["content-type"] = "application/json";
  const accessToken = token || getSession()?.token;
  if (accessToken) headers["x-case-token"] = accessToken;
  const response = await fetch(path, { ...options, headers });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || `http_${response.status}`);
  return body;
}
const won = (value) => Number.isFinite(Number(value)) ? `${Math.round(Number(value)).toLocaleString("ko-KR")}원` : "추가 확인 필요";
function boolSelect(name, value) {
  return `<select class="case-select" name="${esc(name)}"><option value="">선택</option><option value="true" ${value === true ? "selected" : ""}>예</option><option value="false" ${value === false ? "selected" : ""}>아니오</option></select>`;
}
function showError(text) {
  ROOT.querySelector(".worktime-error")?.remove();
  const box = document.createElement("div"); box.className = "worktime-error"; box.textContent = text; ROOT.prepend(box);
}

function renderStart() {
  ROOT.innerHTML = `<form class="worktime-start" data-start-form>
    <section class="worktime-card"><h2>먼저 적용범위를 확인할게요.</h2><p>기준일과 상시근로자 수, 근로시간제 유형에 따라 법정 가산과 자동계산 가능 범위가 달라집니다.</p><div class="worktime-fields">
      <label><span>기준일</span><input class="case-input" type="date" name="referenceDate" required></label>
      <label><span>상시근로자 수</span><input class="case-input" type="number" min="1" step="1" name="workplaceEmployeeCount" required placeholder="예: 8"></label>
      <label><span>일반 고정근로시간제인가요?</span><select class="case-select" name="standardWorkSystem" required><option value="">선택</option><option value="true">예</option><option value="false">아니오 / 잘 모르겠음</option></select></label>
    </div><div class="worktime-note">탄력·선택·재량근로, 감시·단속적 근로 등은 단순 8시간/40시간 계산과 법적 적용이 달라 별도 검토가 필요합니다.</div></section>
    <div class="case-actions"><button class="btn primary" type="submit">근로시간 사건 만들기</button></div>
  </form>`;
  ROOT.querySelector("[data-start-form]")?.addEventListener("submit", createCase);
}

async function createCase(event) {
  event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
  const facts = {
    referenceDate: data.get("referenceDate"),
    workplaceEmployeeCount: Number(data.get("workplaceEmployeeCount")),
    standardWorkSystem: data.get("standardWorkSystem") === "true",
  };
  const button = form.querySelector("button[type=submit]"); if (button) button.disabled = true;
  try { const result = await api("/api/cases/worktime-intake", { method:"POST", body:JSON.stringify({ facts }) }); setSession(result.case.id, result.accessToken); renderWorkspace(result); }
  catch { if (button) button.disabled = false; showError("사건을 만들지 못했습니다. 다시 시도해 주세요."); }
}

function hourInput(key, facts) {
  return `<label><span>${esc(HOUR_LABELS[key])}</span><input class="case-input" type="number" min="0" step="0.1" name="${esc(key)}" value="${esc(facts[key] ?? "")}" placeholder="없으면 0"></label>`;
}

function moneyFields(facts) {
  if (facts.standardWorkSystem === false) return `<div class="worktime-regime-stop"><b>현재 자동계산 범위 밖의 근로시간제입니다.</b><p>근로시간제 유형과 서면합의·취업규칙을 확인한 뒤 별도 검토해야 합니다. 일반 고정근로시간제로 단정하여 계산하지 않습니다.</p></div>`;
  return `
    <label><span>통상시급</span><input class="case-input" type="number" min="0" name="ordinaryHourlyWage" value="${esc(facts.ordinaryHourlyWage ?? "")}" placeholder="예: 20000"></label>
    <label><span>추가근로 시간의 기본임금은 이미 받았나요?</span>${boolSelect("baseWageForExtraHoursPaid", facts.baseWageForExtraHoursPaid)}</label>
    <label><span>이미 지급받은 연장·야간·휴일수당</span><input class="case-input" type="number" min="0" name="amountAlreadyPaid" value="${esc(facts.amountAlreadyPaid ?? "")}" placeholder="없으면 0"></label>
    <label><span>한 주 최대 연장근로시간</span><input class="case-input" type="number" min="0" step="0.1" name="maxWeeklyOvertimeHours" value="${esc(facts.maxWeeklyOvertimeHours ?? "")}" placeholder="예: 10"></label>
    <label><span>대표 근무일 실제 근로시간</span><input class="case-input" type="number" min="0" step="0.1" name="representativeDailyWorkHours" value="${esc(facts.representativeDailyWorkHours ?? "")}" placeholder="예: 9"></label>
    <label><span>대표 근무일 휴게시간(분)</span><input class="case-input" type="number" min="0" step="1" name="representativeBreakMinutes" value="${esc(facts.representativeBreakMinutes ?? "")}" placeholder="예: 60"></label>
    <div class="worktime-hour-head">계산기간 전체 시간 · 아래 6개 칸은 서로 겹치지 않게 입력</div>
    ${Object.keys(HOUR_LABELS).map((key) => hourInput(key, facts)).join("")}`;
}

function componentRows(components = []) {
  if (!components.length) return "";
  return `<div class="worktime-component-list">${components.filter((item) => Number(item.hours) > 0).map((item) => `<div class="worktime-component"><span>${esc(HOUR_LABELS[item.key] || item.key)} · ${esc(item.hours)}시간</span><b>× ${esc(item.multiplier)}</b><b>${esc(won(item.amount))}</b></div>`).join("")}</div>`;
}

function renderWorkspace(result) {
  const facts = result.case?.facts || {}; const legal = result.legal || {}; const premium = legal.premium || {};
  const fivePlusLabel = legal.fivePlus === true ? "상시 5명 이상" : legal.fivePlus === false ? "상시 4명 이하" : "규모 미확인";
  ROOT.innerHTML = `<div class="worktime-workspace">
    <section class="worktime-card"><div class="resource-head"><div><span class="case-kicker">근로시간·수당</span><h2>근로시간·연장/야간/휴일수당 사건</h2><p>기준일 ${esc(facts.referenceDate || "?")} · ${esc(fivePlusLabel)}</p></div><span class="worktime-pill">${esc(result.case?.status || "intake")}</span></div><div class="next-action"><b>${esc(result.nextAction?.title || "다음 정보를 확인하세요.")}</b><p>${esc(result.nextAction?.description || "")}</p></div></section>
    <div class="worktime-grid">
      <section class="worktime-card wide" id="worktime-money"><div class="resource-head"><div><h3>근로시간·수당 계산</h3><p>추가근로의 기본임금 지급 여부와 시간대 중첩을 분리해 계산합니다.</p></div></div>
        <div class="worktime-summary"><div class="worktime-stat"><span>통상시급</span><b>${esc(won(facts.ordinaryHourlyWage))}</b></div><div class="worktime-stat"><span>계산 대상 총액</span><b>${esc(won(premium.grossEstimate))}</b></div><div class="worktime-stat"><span>기지급 수당</span><b>${esc(won(premium.alreadyPaidAmount))}</b></div><div class="worktime-stat"><span>예상 미지급액</span><b>${esc(won(premium.outstandingEstimate))}</b></div></div>
        <div class="worktime-assessment"><div class="worktime-row"><span>가산수당 적용 baseline</span><b>${esc(fivePlusLabel)}</b></div><div class="worktime-row"><span>계산 상태</span><b>${esc(premium.status || "미확인")}</b></div><div class="worktime-row"><span>주 12시간 연장한도</span><b>${esc(legal.weeklyOvertime?.status || "미확인")}${facts.maxWeeklyOvertimeHours !== null && facts.maxWeeklyOvertimeHours !== undefined ? ` · ${esc(facts.maxWeeklyOvertimeHours)}시간` : ""}</b></div><div class="worktime-row"><span>대표 근무일 휴게</span><b>${esc(legal.break?.providedMinutes ?? "미확인")}분 / 필요 ${esc(legal.break?.requiredMinutes ?? "미확인")}분</b></div></div>
        ${componentRows(premium.components)}
        <form data-money-form><div class="worktime-money-fields">${moneyFields(facts)}</div>${facts.standardWorkSystem === false ? "" : '<div class="case-actions"><button class="btn primary" type="submit">계산 정보 저장·재계산</button></div>'}</form>
        ${premium.limitation ? `<div class="worktime-note">${esc(premium.limitation)}</div>` : ""}
        ${(legal.warnings || []).length ? `<div class="worktime-warning">재검토: ${(legal.warnings || []).map(esc).join(", ")}</div>` : ""}
      </section>
      <section class="worktime-card wide" id="worktime-evidence"><div class="resource-head"><div><h3>증거 상태</h3><p>실제 근로시간과 임금 지급내역을 확인할 자료를 체크하세요.</p></div></div><form data-evidence-form><div class="worktime-evidence">${Object.entries(EVIDENCE_LABELS).map(([key,label]) => `<label>${esc(label)}<select class="case-select" name="${key}"><option value="unknown" ${facts.evidence?.[key] === "unknown" ? "selected" : ""}>미확인</option><option value="have" ${facts.evidence?.[key] === "have" ? "selected" : ""}>보유</option><option value="planned" ${facts.evidence?.[key] === "planned" ? "selected" : ""}>확보 예정</option><option value="missing" ${facts.evidence?.[key] === "missing" ? "selected" : ""}>없음</option></select></label>`).join("")}</div><div class="case-actions"><button class="btn" type="submit">증거 상태 저장</button></div></form></section>
      <section class="worktime-card wide" id="worktime-sources"><div class="resource-head"><div><h3>공식 근거</h3><p>현재 판단과 계산에 사용한 근로기준법 및 시행령 근거입니다.</p></div></div><div class="source-list">${(legal.sources||[]).map((source) => `<a class="source-row" href="${esc(source.url)}" target="_blank" rel="noopener noreferrer"><span><b>${esc(source.article||source.title)}</b><small>${esc(source.authority)} · 확인 ${esc(source.verifiedAt||legal.verifiedAt)}</small></span><span>↗</span></a>`).join("")}</div></section>
      <section class="worktime-card wide" id="worktime-documents"><div class="resource-head"><div><h3>이 사건의 문서</h3><p>미지급액이 계산되면 지급요청과 진정서 초안을 연결합니다.</p></div></div><div class="document-grid">${(result.documents||[]).map((doc) => `<button class="document-card" type="button" data-doc="${esc(doc.templateKey)}"><span class="doc-state">초안 가능</span><b>${esc(doc.title)}</b><small>${esc(doc.description)}</small></button>`).join("") || '<div class="resource-empty">현재 계산 기준 추천 문서가 없습니다.</div>'}</div></section>
      <section class="worktime-card wide" id="worktime-procedures"><div class="resource-head"><div><h3>공식 절차</h3><p>수당 미지급·연장한도·휴게 위반 가능성을 기준으로 고용노동부 절차를 연결합니다.</p></div></div><div class="procedure-stack">${(result.procedures||[]).map((procedure) => `<div class="procedure-box"><div><b>${esc(procedure.title)}</b><small>${esc(procedure.description)}</small></div><a class="btn primary" href="${esc(procedure.url)}" target="_blank" rel="noopener noreferrer">노동포털 ↗</a></div>`).join("") || '<div class="resource-empty">현재 자동 연결 절차가 없습니다.</div>'}</div></section>
    </div><div class="workspace-foot"><button class="btn" type="button" data-report>사건 요약 복사</button><button class="btn danger" type="button" data-delete>사건 삭제</button></div>
  </div>`;
  ROOT.querySelector("[data-money-form]")?.addEventListener("submit", saveMoney);
  ROOT.querySelector("[data-evidence-form]")?.addEventListener("submit", saveEvidence);
  ROOT.querySelectorAll("[data-doc]").forEach((button) => button.addEventListener("click", () => previewDocument(button.dataset.doc)));
  ROOT.querySelector("[data-report]")?.addEventListener("click", copyReport);
  ROOT.querySelector("[data-delete]")?.addEventListener("click", deleteCase);
}

function controlValue(control) {
  if (!control?.name || control.value === "") return undefined;
  if (control.value === "true" || control.value === "false") return control.value === "true";
  if (control.type === "number") { const n = Number(control.value); return Number.isFinite(n) ? n : undefined; }
  return control.value;
}
async function patchFacts(patch, button) {
  const session = getSession(); if (!session) return renderStart(); if (button) button.disabled = true;
  try { const result = await api(`/api/cases/${encodeURIComponent(session.id)}/worktime-intake`, { method:"PATCH", body:JSON.stringify({ facts:patch }) }); renderWorkspace(result); }
  catch { if (button) button.disabled = false; showError("사건 정보를 저장하지 못했습니다."); }
}
async function saveMoney(event) { event.preventDefault(); const patch={}; for (const control of event.currentTarget.elements) { const value=controlValue(control); if(value!==undefined) patch[control.name]=value; } await patchFacts(patch,event.currentTarget.querySelector("button[type=submit]")); }
async function saveEvidence(event) { event.preventDefault(); const evidence={}; for(const control of event.currentTarget.elements) if(control.name) evidence[control.name]=control.value; await patchFacts({evidence},event.currentTarget.querySelector("button[type=submit]")); }
function closePreview(){document.getElementById("worktime-doc-preview")?.remove();}
async function previewDocument(templateKey) {
  const session=getSession(); if(!session)return;
  try { const result=await api(`/api/cases/${encodeURIComponent(session.id)}/worktime-document/${encodeURIComponent(templateKey)}`,{method:"POST",body:JSON.stringify({values:{}})}); closePreview(); const overlay=document.createElement("div"); overlay.id="worktime-doc-preview"; overlay.className="doc-preview-overlay"; overlay.innerHTML=`<div class="doc-preview"><div class="doc-preview-head"><div><span>사건 정보 자동 반영</span><h3>${esc(result.document?.title||"문서 초안")}</h3></div><button class="btn" data-close>닫기</button></div><pre></pre><div class="doc-preview-actions"><button class="btn primary" data-copy>텍스트 복사</button></div></div>`; overlay.querySelector("pre").textContent=result.document?.text||""; overlay.querySelector("[data-close]").onclick=closePreview; overlay.querySelector("[data-copy]").onclick=async(event)=>{await navigator.clipboard.writeText(result.document?.text||"").catch(()=>{});event.currentTarget.textContent="복사됨";}; document.body.appendChild(overlay); } catch { showError("문서 초안을 만들지 못했습니다."); }
}
async function copyReport(event){const session=getSession();if(!session)return;const button=event.currentTarget;try{const result=await api(`/api/cases/${encodeURIComponent(session.id)}/worktime-report`);await navigator.clipboard.writeText(result.text||"");button.textContent="사건 요약 복사됨";}catch{button.textContent="복사 실패";}}
async function deleteCase(){const session=getSession();if(!session)return renderStart();if(!window.confirm("이 근로시간 사건을 삭제할까요?"))return;try{await api(`/api/cases/${encodeURIComponent(session.id)}`,{method:"DELETE"});}finally{clearSession();renderStart();}}
async function restore(){const session=getSession();if(!session)return renderStart();try{renderWorkspace(await api(`/api/cases/${encodeURIComponent(session.id)}/worktime-intake`));}catch{clearSession();renderStart();}}
restore();
