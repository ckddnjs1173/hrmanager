const $ = (id) => document.getElementById(id);
const esc = (value) => String(value == null ? "" : value)
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const fmt = (value) => value ? new Date(value).toLocaleString("ko-KR") : "-";
const statusLabel = (status) => ({
  DRAFT: "초안", IN_REVIEW: "검토 중", VERIFIED: "검증 완료", REJECTED: "반려", SUPERSEDED: "대체됨",
  READY_FOR_TEST: "테스트 준비", READY_FOR_IMPLEMENTATION: "구현 대기",
}[status] || status || "-");

let CSRF = "";
let META = null;
let CANDIDATES = [];
let SELECTED_ID = null;

function toast(message) {
  const node = $("toast");
  node.textContent = message;
  node.classList.add("show");
  setTimeout(() => node.classList.remove("show"), 1800);
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (options.method && options.method !== "GET") headers["x-csrf-token"] = CSRF;
  const response = await fetch(path, { credentials: "same-origin", ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `http_${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function operator() {
  const value = $("operator").value.trim();
  if (!value) throw new Error("운영자명을 먼저 입력하세요.");
  sessionStorage.setItem("insaya_legal_operator", value);
  return value;
}

async function login() {
  $("loginError").textContent = "";
  try {
    const response = await fetch("/api/admin/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: $("adminToken").value.trim() }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error === "invalid_token" ? "관리자 토큰이 올바르지 않습니다." : payload.error || "로그인에 실패했습니다.");
    CSRF = payload.csrf;
    await startApp();
  } catch (error) {
    $("loginError").textContent = error.message;
  }
}

async function logout() {
  try { await api("/api/admin/logout", { method: "POST", body: "{}" }); } catch {}
  location.reload();
}

async function boot() {
  $("operator").value = sessionStorage.getItem("insaya_legal_operator") || "";
  try {
    const response = await fetch("/api/admin/session", { credentials: "same-origin" });
    if (response.ok) {
      CSRF = (await response.json()).csrf;
      await startApp();
      return;
    }
  } catch {}
  $("login").hidden = false;
  $("app").hidden = true;
}

async function startApp() {
  $("login").hidden = true;
  $("app").hidden = false;
  try {
    META = await api("/api/admin/legal/meta");
    populateMeta();
    await loadCandidates();
  } catch (error) {
    if (error.status === 401) return location.reload();
    toast(`불러오기 실패: ${error.message}`);
  }
}

function populateMeta() {
  $("sourceType").innerHTML = META.sourceTypes.map((item) => `<option value="${esc(item)}">${esc(item)}</option>`).join("");
  $("statusFilter").innerHTML = `<option value="">전체</option>${META.candidateStatuses.map((item) => `<option value="${esc(item)}">${esc(statusLabel(item))}</option>`).join("")}`;
  $("canonicalSourceId").innerHTML = `<option value="">새 공식 출처 / 연결 없음</option>${META.canonicalSources.map((source) => `<option value="${esc(source.id)}">${esc(source.title || source.id)}</option>`).join("")}`;
}

async function loadCandidates({ keepSelection = true } = {}) {
  const status = $("statusFilter").value;
  const payload = await api(`/api/admin/legal/candidates${status ? `?status=${encodeURIComponent(status)}` : ""}`);
  CANDIDATES = payload.candidates || [];
  if (!keepSelection || !CANDIDATES.some((item) => item.id === SELECTED_ID)) SELECTED_ID = null;
  renderCandidates();
  if (SELECTED_ID) await loadDetail(SELECTED_ID);
  else showEmpty();
}

function renderCandidates() {
  $("candidateList").innerHTML = CANDIDATES.length ? CANDIDATES.map((candidate) => `
    <button class="legal-item ${candidate.id === SELECTED_ID ? "on" : ""}" data-candidate-id="${esc(candidate.id)}">
      <div class="t">${esc(candidate.title)}</div>
      <div class="m"><span class="status ${esc(candidate.status)}">${esc(statusLabel(candidate.status))}</span><span>${esc(candidate.authority)}</span><span>${esc(candidate.effectiveFrom || "시행일 미정")}</span></div>
    </button>`).join("") : `<div class="empty">조건에 맞는 법령 변경 후보가 없습니다.</div>`;
}

function showEmpty() {
  $("detailEmpty").hidden = false;
  $("detailView").hidden = true;
  $("detailView").innerHTML = "";
}

async function loadDetail(id) {
  SELECTED_ID = id;
  renderCandidates();
  const detail = await api(`/api/admin/legal/candidates/${encodeURIComponent(id)}`);
  $("detailEmpty").hidden = true;
  $("detailView").hidden = false;
  $("detailView").innerHTML = renderDetail(detail);
}

function renderDetail({ candidate, proposals, events, runtimeActivationAllowed }) {
  const sourceLink = /^https:\/\//.test(candidate.officialUrl || "") ? `<a href="${esc(candidate.officialUrl)}" target="_blank" rel="noopener noreferrer">공식 출처 열기 ↗</a>` : "-";
  return `
    <div class="notice">Runtime 자동 활성화: <b>${runtimeActivationAllowed ? "허용" : "금지"}</b> · 이 화면의 최종 단계는 구현 대기이며 실제 법률 규칙 변경은 코드 리뷰·회귀 테스트·배포를 별도로 거칩니다.</div>
    <div class="legal-card">
      <div style="display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin-bottom:12px"><span class="status ${esc(candidate.status)}">${esc(statusLabel(candidate.status))}</span><h2 style="margin:0">${esc(candidate.title)}</h2></div>
      <div class="legal-grid">
        ${kv("기관", candidate.authority)}${kv("출처 유형", candidate.sourceType)}${kv("조문·항목", candidate.article || "-")}${kv("Canonical Source", candidate.canonicalSourceId || "-")}
        ${kv("공표일", candidate.sourcePublishedAt || "-")}${kv("시행일", candidate.effectiveFrom || "-")}${kv("종료일", candidate.effectiveTo || "-")}${kv("등록자", candidate.createdBy || "-")}
        <div class="kv full"><div class="k">공식 출처</div><div class="v">${sourceLink}</div></div>
        <div class="kv full"><div class="k">변경 메모</div><div class="v">${esc(candidate.changeNote || "-")}</div></div>
        <div class="kv full"><div class="k">Source Snapshot · SHA-256 ${esc(candidate.contentHash)}</div><pre class="legal-json">${esc(JSON.stringify(candidate.sourceSnapshot, null, 2))}</pre></div>
      </div>
      ${candidateControls(candidate)}
    </div>
    <div class="legal-card"><h3>Rule 변경 제안</h3>${proposalCreate(candidate)}${renderProposals(proposals || [])}</div>
    <div class="legal-card"><h3>감사 이벤트</h3>${renderEvents(events || [])}</div>`;
}

function kv(key, value) {
  return `<div class="kv"><div class="k">${esc(key)}</div><div class="v">${esc(value)}</div></div>`;
}

function candidateControls(candidate) {
  if (candidate.status === "DRAFT") return `<div class="legal-actions"><button class="btn primary" data-action="submit-candidate" data-id="${esc(candidate.id)}">검토 요청</button></div>`;
  if (candidate.status === "IN_REVIEW") return `
    <div class="field" style="margin-top:14px"><label for="reviewNote">검토 메모</label><textarea id="reviewNote" placeholder="공식 출처·시행일·변경내용 대조 결과를 기록하세요."></textarea></div>
    <div class="legal-actions">
      <button class="btn primary" data-action="review-candidate" data-decision="VERIFY" data-id="${esc(candidate.id)}">검증 완료</button>
      <button class="btn warn-btn" data-action="review-candidate" data-decision="REQUEST_CHANGES" data-id="${esc(candidate.id)}">수정 요청</button>
      <button class="btn danger-btn" data-action="review-candidate" data-decision="REJECT" data-id="${esc(candidate.id)}">반려</button>
    </div>`;
  return "";
}

function proposalCreate(candidate) {
  if (candidate.status !== "VERIFIED") return `<p class="muted small">검증 완료된 법령 변경 후보에서만 Rule 변경 제안을 만들 수 있습니다.</p>`;
  return `
    <details style="margin-bottom:14px"><summary><b>+ Rule 변경 제안 작성</b></summary>
      <form id="proposalForm" data-candidate-id="${esc(candidate.id)}" style="margin-top:12px">
        <div class="form-grid">
          <div class="field"><label for="ruleKey">Rule Key</label><input id="ruleKey" required placeholder="minimum_wage.2027" /></div>
          <div class="field"><label for="currentRuleVersion">현재 버전</label><input id="currentRuleVersion" placeholder="2026" /></div>
          <div class="field"><label for="proposedRuleVersion">제안 버전</label><input id="proposedRuleVersion" required placeholder="2027" /></div>
          <div class="field"><label for="proposedEffectiveFrom">시행일</label><input id="proposedEffectiveFrom" type="date" value="${esc(candidate.effectiveFrom || "")}" required /></div>
          <div class="field full"><label for="proposedChange">제안 변경 JSON</label><textarea id="proposedChange" required placeholder='{"hourly":11000,"sourceId":"source.minimum_wage_commission.annual"}'></textarea></div>
        </div>
        <div id="proposalError" class="error"></div><button type="submit" class="btn primary" style="margin-top:9px">제안 생성</button>
      </form>
    </details>`;
}

function renderProposals(proposals) {
  if (!proposals.length) return `<div class="empty">아직 Rule 변경 제안이 없습니다.</div>`;
  return proposals.map((proposal) => `
    <div class="proposal">
      <div class="proposal-head"><b>${esc(proposal.ruleKey)} · ${esc(proposal.currentRuleVersion || "-")} → ${esc(proposal.proposedRuleVersion)}</b><span class="status ${esc(proposal.status)}">${esc(statusLabel(proposal.status))}</span></div>
      <div class="muted small" style="margin:5px 0 9px">시행 ${esc(proposal.proposedEffectiveFrom)} · 생성 ${esc(proposal.createdBy)}${proposal.verifiedBy ? ` · 검증 ${esc(proposal.verifiedBy)}` : ""}</div>
      <pre class="legal-json">${esc(JSON.stringify(proposal.proposedChange, null, 2))}</pre>
      ${proposal.fixtureEvidenceHash ? `<div class="muted small" style="margin-top:6px">Fixture SHA-256: ${esc(proposal.fixtureEvidenceHash)} · ${proposal.fixtureEvidence.length}건</div>` : ""}
      ${proposalFixtureControls(proposal)}
    </div>`).join("");
}

function proposalFixtureControls(proposal) {
  if (["DRAFT", "READY_FOR_TEST"].includes(proposal.status)) {
    return `<div class="field" style="margin-top:10px"><label>Boundary fixture JSON 배열</label><textarea data-fixture-for="${esc(proposal.id)}" placeholder='[{"name":"effective-date","input":{"date":"2027-01-01"},"expected":{"version":"2027"}}]'>${proposal.fixtureEvidence?.length ? esc(JSON.stringify(proposal.fixtureEvidence, null, 2)) : ""}</textarea></div>
      <div class="legal-actions"><button class="btn" data-action="attach-fixtures" data-id="${esc(proposal.id)}">Fixture 저장</button>${proposal.status === "READY_FOR_TEST" ? `<button class="btn primary" data-action="verify-proposal" data-id="${esc(proposal.id)}">Rule 제안 검증</button>` : ""}</div>`;
  }
  if (proposal.status === "VERIFIED") return `<div class="legal-actions"><button class="btn primary" data-action="ready-proposal" data-id="${esc(proposal.id)}">READY_FOR_IMPLEMENTATION으로 이동</button></div>`;
  if (proposal.status === "READY_FOR_IMPLEMENTATION") return `<div class="notice" style="margin-top:10px;margin-bottom:0">구현 대기 상태입니다. 이 화면에서는 운영 Rule을 활성화할 수 없습니다.</div>`;
  return "";
}

function renderEvents(events) {
  if (!events.length) return `<div class="empty">이벤트가 없습니다.</div>`;
  return events.slice().reverse().map((event) => `<div class="event"><div class="time">${esc(fmt(event.createdAt))}</div><div class="body"><b>${esc(event.eventType)}</b>${esc(event.actor || "-")} · ${esc(event.fromStatus || "-")} → ${esc(event.toStatus || "-")}${event.metadata && Object.keys(event.metadata).length ? `<pre class="legal-json" style="margin-top:5px">${esc(JSON.stringify(event.metadata, null, 2))}</pre>` : ""}</div></div>`).join("");
}

async function mutate(path, body, successMessage) {
  const op = operator();
  const payload = await api(path, { method: "POST", body: JSON.stringify({ ...body, operator: op }) });
  toast(successMessage);
  await loadCandidates();
  return payload;
}

$("candidateList").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-candidate-id]");
  if (!button) return;
  try { await loadDetail(button.dataset.candidateId); } catch (error) { toast(`상세 조회 실패: ${error.message}`); }
});

$("detailView").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  button.disabled = true;
  try {
    const id = button.dataset.id;
    if (button.dataset.action === "submit-candidate") await mutate(`/api/admin/legal/candidates/${encodeURIComponent(id)}/submit`, {}, "검토 요청으로 이동했습니다.");
    if (button.dataset.action === "review-candidate") await mutate(`/api/admin/legal/candidates/${encodeURIComponent(id)}/review`, { decision: button.dataset.decision, note: $("reviewNote")?.value || "" }, "검토 결과를 저장했습니다.");
    if (button.dataset.action === "attach-fixtures") {
      const node = document.querySelector(`[data-fixture-for="${CSS.escape(id)}"]`);
      const fixtures = JSON.parse(node.value);
      if (!Array.isArray(fixtures)) throw new Error("Fixture는 JSON 배열이어야 합니다.");
      await mutate(`/api/admin/legal/proposals/${encodeURIComponent(id)}/fixtures`, { fixtures }, "Fixture 증거를 저장했습니다.");
    }
    if (button.dataset.action === "verify-proposal") await mutate(`/api/admin/legal/proposals/${encodeURIComponent(id)}/verify`, {}, "Rule 제안을 검증했습니다.");
    if (button.dataset.action === "ready-proposal") await mutate(`/api/admin/legal/proposals/${encodeURIComponent(id)}/ready`, {}, "구현 대기 상태로 이동했습니다.");
  } catch (error) {
    toast(`처리 실패: ${error.message}`);
  } finally {
    button.disabled = false;
  }
});

$("detailView").addEventListener("submit", async (event) => {
  if (event.target.id !== "proposalForm") return;
  event.preventDefault();
  $("proposalError").textContent = "";
  try {
    const proposedChange = JSON.parse($("proposedChange").value);
    if (!proposedChange || typeof proposedChange !== "object" || Array.isArray(proposedChange)) throw new Error("제안 변경은 JSON 객체여야 합니다.");
    await mutate(`/api/admin/legal/candidates/${encodeURIComponent(event.target.dataset.candidateId)}/proposals`, {
      ruleKey: $("ruleKey").value,
      currentRuleVersion: $("currentRuleVersion").value,
      proposedRuleVersion: $("proposedRuleVersion").value,
      proposedEffectiveFrom: $("proposedEffectiveFrom").value,
      proposedChange,
    }, "Rule 변경 제안을 생성했습니다.");
  } catch (error) {
    $("proposalError").textContent = error.message;
  }
});

$("candidateForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("candidateFormError").textContent = "";
  try {
    const sourceSnapshot = JSON.parse($("sourceSnapshot").value);
    if (!sourceSnapshot || typeof sourceSnapshot !== "object" || Array.isArray(sourceSnapshot) || !Object.keys(sourceSnapshot).length) throw new Error("공식 출처 스냅샷은 비어 있지 않은 JSON 객체여야 합니다.");
    const op = operator();
    const payload = await api("/api/admin/legal/candidates", { method: "POST", body: JSON.stringify({
      operator: op,
      sourceType: $("sourceType").value,
      canonicalSourceId: $("canonicalSourceId").value,
      authority: $("authority").value,
      title: $("candidateTitle").value,
      article: $("article").value,
      officialUrl: $("officialUrl").value,
      sourcePublishedAt: $("sourcePublishedAt").value,
      effectiveFrom: $("effectiveFrom").value,
      effectiveTo: $("effectiveTo").value,
      changeNote: $("changeNote").value,
      sourceSnapshot,
    }) });
    SELECTED_ID = payload.candidate.id;
    event.target.reset();
    populateMeta();
    toast("법령 변경 후보를 DRAFT로 등록했습니다.");
    await loadCandidates();
  } catch (error) {
    $("candidateFormError").textContent = error.message;
  }
});

$("statusFilter").addEventListener("change", () => loadCandidates({ keepSelection: false }).catch((error) => toast(error.message)));
$("refreshButton").addEventListener("click", () => loadCandidates().catch((error) => toast(error.message)));
$("operator").addEventListener("change", () => sessionStorage.setItem("insaya_legal_operator", $("operator").value.trim()));
$("loginButton").addEventListener("click", login);
$("adminToken").addEventListener("keydown", (event) => { if (event.key === "Enter") login(); });
$("logoutButton").addEventListener("click", logout);

boot();
