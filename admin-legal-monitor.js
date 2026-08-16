const monitor$ = (id) => document.getElementById(id);
const monitorEsc = (value) => String(value == null ? "" : value)
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const monitorFmt = (value) => value ? new Date(value).toLocaleString("ko-KR") : "-";
const runStatusLabel = (status) => ({
  STARTED: "실행 중", BASELINED: "Baseline 저장", UNCHANGED: "변경 없음", CHANGE_DETECTED: "변경 감지", FAILED: "실패",
}[status] || status || "-");

let monitorCsrf = "";
let monitorMeta = null;
let monitorWatches = [];
let selectedWatchId = null;
let monitorStarted = false;

function monitorToast(message) {
  const node = monitor$("toast");
  if (!node) return;
  node.textContent = message;
  node.classList.add("show");
  setTimeout(() => node.classList.remove("show"), 2200);
}

async function monitorApi(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (options.method && options.method !== "GET") headers["x-csrf-token"] = monitorCsrf;
  const response = await fetch(path, { credentials: "same-origin", ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `http_${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function monitorOperator() {
  const value = monitor$("operator")?.value.trim() || "";
  if (!value) throw new Error("운영자명을 먼저 입력하세요.");
  sessionStorage.setItem("insaya_legal_operator", value);
  return value;
}

function sourceById(id) {
  return monitorMeta?.canonicalSources?.find((source) => source.id === id) || null;
}

function shortHash(value) {
  if (!value) return "-";
  const text = String(value);
  return text.length > 18 ? `${text.slice(0, 10)}…${text.slice(-6)}` : text;
}

function setTab(tab) {
  const monitorOn = tab === "monitor";
  monitor$("candidateMain").hidden = monitorOn;
  monitor$("monitorMain").hidden = !monitorOn;
  monitor$("candidateTab").classList.toggle("on", !monitorOn);
  monitor$("monitorTab").classList.toggle("on", monitorOn);
  monitor$("candidateTab").setAttribute("aria-selected", String(!monitorOn));
  monitor$("monitorTab").setAttribute("aria-selected", String(monitorOn));
  sessionStorage.setItem("insaya_legal_admin_tab", monitorOn ? "monitor" : "candidate");
  if (monitorOn) loadWatches().catch((error) => monitorToast(`모니터 조회 실패: ${error.message}`));
}

async function ensureMonitorSession() {
  const response = await fetch("/api/admin/session", { credentials: "same-origin" });
  if (!response.ok) throw new Error("admin_session_required");
  monitorCsrf = (await response.json()).csrf;
}

async function startMonitorUi() {
  if (monitorStarted) return;
  monitorStarted = true;
  try {
    await ensureMonitorSession();
    monitorMeta = await monitorApi("/api/admin/legal/meta");
    populateMonitorMeta();
    const savedTab = sessionStorage.getItem("insaya_legal_admin_tab");
    if (savedTab === "monitor") setTab("monitor");
  } catch (error) {
    monitorStarted = false;
    if (error.message !== "admin_session_required") monitorToast(`모니터 초기화 실패: ${error.message}`);
  }
}

function populateMonitorMeta() {
  const sourceSelect = monitor$("watchCanonicalSourceId");
  sourceSelect.innerHTML = `<option value="">선택</option>${(monitorMeta.canonicalSources || []).map((source) => `<option value="${monitorEsc(source.id)}">${monitorEsc(source.title || source.id)} · ${monitorEsc(source.authority || "")}</option>`).join("")}`;
  monitor$("watchSourceType").innerHTML = (monitorMeta.sourceTypes || []).map((type) => `<option value="${monitorEsc(type)}">${monitorEsc(type)}</option>`).join("");
  updateWatchSourcePreview();
}

function updateWatchSourcePreview() {
  const source = sourceById(monitor$("watchCanonicalSourceId")?.value);
  monitor$("watchOfficialUrl").textContent = source?.url || "Canonical Source를 선택하면 공식 URL이 표시됩니다.";
  if (!source) return;
  const id = String(source.id || "");
  if (id.includes("decree")) monitor$("watchSourceType").value = "DECREE";
  else if (id.includes(".lsa.")) monitor$("watchSourceType").value = "STATUTE";
  else if (id.includes("minimum_wage")) monitor$("watchSourceType").value = "REGULATION_NOTICE";
}

async function loadWatches({ keepSelection = true } = {}) {
  if (!monitorMeta) return;
  const filter = monitor$("monitorEnabledFilter").value;
  const payload = await monitorApi(`/api/admin/legal/monitor/watches${filter ? `?enabled=${encodeURIComponent(filter)}` : ""}`);
  monitorWatches = payload.watches || [];
  if (!keepSelection || !monitorWatches.some((watch) => watch.id === selectedWatchId)) selectedWatchId = null;
  renderWatchList();
  if (selectedWatchId) await loadWatchDetail(selectedWatchId);
  else showMonitorEmpty();
}

function renderWatchList() {
  const list = monitor$("watchList");
  list.innerHTML = monitorWatches.length ? monitorWatches.map((watch) => {
    const source = sourceById(watch.canonicalSourceId);
    const state = watch.enabled ? "ENABLED" : "DISABLED";
    return `<button class="legal-item ${watch.id === selectedWatchId ? "on" : ""}" data-watch-id="${monitorEsc(watch.id)}">
      <div class="t">${monitorEsc(source?.title || watch.canonicalSourceId)}</div>
      <div class="m"><span class="status ${state}">${watch.enabled ? "활성" : "중지"}</span><span>${monitorEsc(watch.sourceType)}</span><span>${monitorEsc(shortHash(watch.lastContentHash))}</span></div>
      <div class="m" style="margin-top:5px"><span>최근 확인 ${monitorEsc(monitorFmt(watch.lastCheckedAt))}</span></div>
    </button>`;
  }).join("") : `<div class="empty">등록된 공식 출처 Watch가 없습니다.</div>`;
}

function showMonitorEmpty() {
  monitor$("monitorDetailEmpty").hidden = false;
  monitor$("monitorDetailView").hidden = true;
  monitor$("monitorDetailView").innerHTML = "";
}

async function loadWatchDetail(id) {
  selectedWatchId = id;
  renderWatchList();
  const payload = await monitorApi(`/api/admin/legal/monitor/watches/${encodeURIComponent(id)}`);
  monitor$("monitorDetailEmpty").hidden = true;
  monitor$("monitorDetailView").hidden = false;
  monitor$("monitorDetailView").innerHTML = renderWatchDetail(payload);
}

function renderWatchDetail({ watch, runs, automaticReviewAllowed, runtimeActivationAllowed }) {
  const source = sourceById(watch.canonicalSourceId);
  const latest = runs?.[0] || null;
  const state = watch.enabled ? "ENABLED" : "DISABLED";
  return `
    <div class="notice"><b>자동 검토 ${automaticReviewAllowed ? "허용" : "금지"} · Runtime 자동 반영 ${runtimeActivationAllowed ? "허용" : "금지"}</b><br>첫 성공 실행은 baseline만 저장합니다. 이후 변경 감지 시에도 DRAFT 후보만 생성되며 사람이 공식 원문을 검토해야 합니다.</div>
    <div class="monitor-summary">
      <div class="monitor-metric"><div class="k">Watch</div><div class="v"><span class="status ${state}">${watch.enabled ? "활성" : "중지"}</span></div></div>
      <div class="monitor-metric"><div class="k">최근 실행</div><div class="v">${latest ? `<span class="status ${monitorEsc(latest.status)}">${monitorEsc(runStatusLabel(latest.status))}</span>` : "없음"}</div></div>
      <div class="monitor-metric"><div class="k">최근 성공</div><div class="v">${monitorEsc(monitorFmt(watch.lastSuccessAt))}</div></div>
      <div class="monitor-metric"><div class="k">현재 Hash</div><div class="v hash">${monitorEsc(shortHash(watch.lastContentHash))}</div></div>
    </div>
    <div class="legal-card">
      <div style="display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin-bottom:12px"><span class="status ${state}">${watch.enabled ? "활성" : "중지"}</span><h2 style="margin:0">${monitorEsc(source?.title || watch.canonicalSourceId)}</h2></div>
      <div class="legal-grid">
        ${monitorKv("기관", source?.authority || "-")}${monitorKv("출처 유형", watch.sourceType)}${monitorKv("Canonical Source", watch.canonicalSourceId)}${monitorKv("Adapter", watch.adapterKey)}
        ${monitorKv("최근 확인", monitorFmt(watch.lastCheckedAt))}${monitorKv("최근 성공", monitorFmt(watch.lastSuccessAt))}${monitorKv("ETag", watch.lastEtag || "-")}${monitorKv("Last-Modified", watch.lastModified || "-")}
        <div class="kv full"><div class="k">현재 정상 Hash</div><div class="v hash">${monitorEsc(watch.lastContentHash || "-")}</div></div>
        <div class="kv full"><div class="k">공식 URL</div><div class="v"><a href="${monitorEsc(watch.officialUrl)}" target="_blank" rel="noopener noreferrer">${monitorEsc(watch.officialUrl)} ↗</a></div></div>
      </div>
      <div class="legal-actions">
        ${watch.enabled ? `<button class="btn primary" data-monitor-action="run" data-id="${monitorEsc(watch.id)}">수동 점검 실행</button><button class="btn danger-btn" data-monitor-action="toggle" data-enabled="false" data-id="${monitorEsc(watch.id)}">Watch 중지</button>` : `<button class="btn primary" data-monitor-action="toggle" data-enabled="true" data-id="${monitorEsc(watch.id)}">Watch 재개</button>`}
      </div>
      ${!watch.lastContentHash ? `<div class="muted small" style="margin-top:9px">아직 baseline이 없습니다. 첫 성공 점검은 기준 hash만 저장하고 변경 후보를 생성하지 않습니다.</div>` : ""}
    </div>
    <div class="legal-card"><h3>점검 실행 이력</h3>${renderMonitorRuns(runs || [])}</div>`;
}

function monitorKv(key, value) {
  return `<div class="kv"><div class="k">${monitorEsc(key)}</div><div class="v">${monitorEsc(value)}</div></div>`;
}

function renderMonitorRuns(runs) {
  if (!runs.length) return `<div class="empty">아직 점검 실행 이력이 없습니다.</div>`;
  return runs.map((run) => `<div class="monitor-run">
    <div class="time">${monitorEsc(monitorFmt(run.finishedAt || run.startedAt))}</div>
    <div><span class="status ${monitorEsc(run.status)}">${monitorEsc(runStatusLabel(run.status))}</span>${run.httpStatus ? `<div class="muted small" style="margin-top:4px">HTTP ${monitorEsc(run.httpStatus)}</div>` : ""}</div>
    <div>
      <div class="hash">${monitorEsc(shortHash(run.previousContentHash))} → ${monitorEsc(shortHash(run.currentContentHash))}</div>
      ${run.errorCode ? `<div class="error">${monitorEsc(run.errorCode)}</div>` : ""}
      ${run.candidateId ? `<div style="margin-top:5px"><button class="btn" data-monitor-action="open-candidate" data-candidate-id="${monitorEsc(run.candidateId)}">생성된 DRAFT 후보 열기</button></div>` : ""}
      ${run.metadata?.triggeredBy ? `<div class="muted small" style="margin-top:4px">실행 주체 ${monitorEsc(run.metadata.triggeredBy)}</div>` : ""}
    </div>
  </div>`).join("");
}

async function createWatch(event) {
  event.preventDefault();
  monitor$("watchFormError").textContent = "";
  try {
    const canonicalSourceId = monitor$("watchCanonicalSourceId").value;
    if (!canonicalSourceId) throw new Error("Canonical Source를 선택하세요.");
    const operator = monitorOperator();
    const payload = await monitorApi("/api/admin/legal/monitor/watches", {
      method: "POST",
      body: JSON.stringify({ operator, canonicalSourceId, sourceType: monitor$("watchSourceType").value }),
    });
    selectedWatchId = payload.watch.id;
    event.target.reset();
    populateMonitorMeta();
    monitorToast("공식 출처 Watch를 등록했습니다. 첫 성공 실행은 baseline만 저장됩니다.");
    await loadWatches();
  } catch (error) {
    monitor$("watchFormError").textContent = error.message;
  }
}

async function handleMonitorAction(button) {
  button.disabled = true;
  try {
    const action = button.dataset.monitorAction;
    const id = button.dataset.id;
    if (action === "run") {
      const operator = monitorOperator();
      const payload = await monitorApi(`/api/admin/legal/monitor/watches/${encodeURIComponent(id)}/run`, { method: "POST", body: JSON.stringify({ operator }) });
      const status = payload.run?.status || "UNKNOWN";
      monitorToast(`점검 완료: ${runStatusLabel(status)}${payload.run?.candidateId ? " · DRAFT 후보 생성" : ""}`);
      await loadWatches();
      selectedWatchId = id;
      await loadWatchDetail(id);
      return;
    }
    if (action === "toggle") {
      const operator = monitorOperator();
      const enabled = button.dataset.enabled === "true";
      await monitorApi(`/api/admin/legal/monitor/watches/${encodeURIComponent(id)}/enabled`, { method: "POST", body: JSON.stringify({ operator, enabled }) });
      monitorToast(enabled ? "Watch를 재개했습니다." : "Watch를 중지했습니다.");
      await loadWatches();
      selectedWatchId = id;
      if (monitorWatches.some((watch) => watch.id === id)) await loadWatchDetail(id);
      return;
    }
    if (action === "open-candidate") {
      const candidateId = button.dataset.candidateId;
      setTab("candidate");
      monitor$("statusFilter").value = "";
      monitor$("refreshButton").click();
      setTimeout(() => {
        const target = document.querySelector(`[data-candidate-id="${CSS.escape(candidateId)}"]`);
        target?.click();
      }, 350);
    }
  } catch (error) {
    monitorToast(`처리 실패: ${error.message}`);
  } finally {
    button.disabled = false;
  }
}

monitor$("candidateTab").addEventListener("click", () => setTab("candidate"));
monitor$("monitorTab").addEventListener("click", () => setTab("monitor"));
monitor$("watchCanonicalSourceId").addEventListener("change", updateWatchSourcePreview);
monitor$("watchForm").addEventListener("submit", createWatch);
monitor$("monitorEnabledFilter").addEventListener("change", () => loadWatches({ keepSelection: false }).catch((error) => monitorToast(error.message)));
monitor$("monitorRefreshButton").addEventListener("click", () => loadWatches().catch((error) => monitorToast(error.message)));
monitor$("watchList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-watch-id]");
  if (!button) return;
  loadWatchDetail(button.dataset.watchId).catch((error) => monitorToast(`Watch 상세 조회 실패: ${error.message}`));
});
monitor$("monitorDetailView").addEventListener("click", (event) => {
  const button = event.target.closest("[data-monitor-action]");
  if (!button) return;
  handleMonitorAction(button);
});

const appNode = monitor$("app");
if (appNode && !appNode.hidden) startMonitorUi();
if (appNode) {
  new MutationObserver(() => {
    if (!appNode.hidden) startMonitorUi();
  }).observe(appNode, { attributes: true, attributeFilter: ["hidden"] });
}
