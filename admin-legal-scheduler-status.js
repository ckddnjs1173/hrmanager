(() => {
  const node = document.getElementById("schedulerStatusCard");
  const monitorMain = document.getElementById("monitorMain");
  if (!node || !monitorMain) return;

  const esc = (value) => String(value == null ? "" : value)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const fmt = (value) => value ? new Date(value).toLocaleString("ko-KR") : "-";
  const hours = (milliseconds) => {
    const value = Number(milliseconds);
    if (!Number.isFinite(value) || value <= 0) return "-";
    if (value % 3_600_000 === 0) return `${value / 3_600_000}시간`;
    return `${Math.round(value / 60_000)}분`;
  };
  const reasonLabel = (reason) => ({
    disabled_by_flag: "환경변수 OFF",
    database_url_required: "DATABASE_URL 없음",
    not_started: "프로세스 미시작",
    stopped: "종료됨",
  }[reason] || reason || "-");

  let loading = false;

  function render(payload) {
    const status = payload.scheduler || {};
    const enabled = status.enabled === true;
    const stateClass = enabled ? "ENABLED" : "DISABLED";
    const stateText = enabled ? (status.running ? "ON · 실행 중" : "ON") : "OFF";
    const summary = status.lastSummary;
    node.innerHTML = `
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
        <h3 style="margin:0;margin-right:auto">자동 점검 Scheduler</h3>
        <span id="schedulerStateBadge" class="status ${stateClass}">${esc(stateText)}</span>
      </div>
      <div class="monitor-summary">
        <div class="monitor-metric"><div class="k">상태 사유</div><div class="v">${esc(enabled ? "활성" : reasonLabel(status.reason))}</div></div>
        <div class="monitor-metric"><div class="k">실제 주기</div><div class="v">${esc(hours(status.intervalMs))}</div></div>
        <div class="monitor-metric"><div class="k">다음 예정</div><div class="v">${esc(fmt(status.nextRunAt))}</div></div>
        <div class="monitor-metric"><div class="k">마지막 Tick</div><div class="v">${esc(fmt(status.lastTickFinishedAt || status.lastTickStartedAt))}</div></div>
      </div>
      <div class="legal-grid">
        <div class="kv"><div class="k">요청 주기</div><div class="v">${esc(hours(status.requestedIntervalMs))}</div></div>
        <div class="kv"><div class="k">최소 주기</div><div class="v">${esc(hours(status.minIntervalMs))}</div></div>
        <div class="kv"><div class="k">프로세스 시작</div><div class="v">${esc(fmt(status.startedAt))}</div></div>
        <div class="kv"><div class="k">Runtime 상태</div><div class="v">running=${esc(Boolean(status.running))} · stopped=${esc(Boolean(status.stopped))}</div></div>
        <div class="kv full"><div class="k">마지막 Batch</div><div class="v">${summary ? `총 ${esc(summary.total)} · 완료 ${esc(summary.completed)} · 실패 ${esc(summary.failed)}${summary.skipped ? ` · 건너뜀(${esc(summary.reason || "-")})` : ""}` : "아직 자동 실행 이력이 없습니다."}</div></div>
      </div>
      <div class="muted small" style="margin-top:9px">읽기 전용 상태입니다. 이 화면/API에서는 Scheduler 활성화·주기 변경을 할 수 없습니다.</div>`;
  }

  function renderError(message) {
    node.innerHTML = `<h3>자동 점검 Scheduler</h3><div class="error">상태 조회 실패: ${esc(message)}</div>`;
  }

  async function refresh() {
    if (loading || monitorMain.hidden) return;
    loading = true;
    try {
      const response = await fetch("/api/admin/legal/monitor/scheduler", { credentials: "same-origin" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `http_${response.status}`);
      if (payload.mutableFromApi !== false) throw new Error("scheduler_observability_contract_invalid");
      render(payload);
    } catch (error) {
      renderError(error.message);
    } finally {
      loading = false;
    }
  }

  new MutationObserver(() => {
    if (!monitorMain.hidden) refresh();
  }).observe(monitorMain, { attributes: true, attributeFilter: ["hidden"] });

  document.getElementById("monitorRefreshButton")?.addEventListener("click", () => refresh());
  if (!monitorMain.hidden) refresh();
})();
