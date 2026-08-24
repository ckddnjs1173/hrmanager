(() => {
  const $ = (id) => document.getElementById(id);
  const nativeFetch = window.fetch.bind(window);
  let csrf = "";
  let bootstrapFailure = null;
  let pendingControl = null;

  const ERROR_COPY = {
    too_many_requests: "요청이 많습니다. 잠시 후 다시 시도해 주세요.",
    unauthorized: "로그인 시간이 만료되었습니다. 다시 로그인해 주세요.",
    forbidden: "이 작업을 수행할 권한이 없습니다.",
    csrf_invalid: "보안 확인 시간이 만료되었습니다. 다시 로그인해 주세요.",
    invalid_json: "입력값을 처리하지 못했습니다. 내용을 확인해 주세요.",
    payload_too_large: "입력한 내용이 너무 큽니다. 내용을 줄여 다시 시도해 주세요.",
    internal_error: "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
    network_error: "서버에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.",
  };

  function friendlyError(value) {
    const text = String(value || "").trim();
    if (!text) return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    if (ERROR_COPY[text]) return ERROR_COPY[text];
    if (/failed to fetch|networkerror|load failed/i.test(text)) return ERROR_COPY.network_error;
    if (/^http_5\d\d$/i.test(text)) return ERROR_COPY.internal_error;
    if (/^http_429$/i.test(text)) return ERROR_COPY.too_many_requests;
    if (/^[a-z0-9_]+$/i.test(text)) return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    return text;
  }

  function announce(message, kind = "ok") {
    const el = $("flash");
    if (!el) return;
    el.textContent = friendlyError(message);
    el.className = `flash ${kind === "error" ? "error" : ""}`;
    el.setAttribute("role", kind === "error" ? "alert" : "status");
    el.setAttribute("aria-live", kind === "error" ? "assertive" : "polite");
    el.hidden = false;
  }

  function setPending(control, pending, label = "처리 중") {
    if (!control) return;
    if (pending) {
      if (control.dataset.pending === "1") return;
      control.dataset.pending = "1";
      control.dataset.pendingLabel = control.textContent || "";
      control.disabled = true;
      control.setAttribute("aria-busy", "true");
      if (control.tagName === "BUTTON") control.textContent = label;
      return;
    }
    if (control.dataset.pending !== "1") return;
    control.disabled = false;
    control.removeAttribute("aria-busy");
    if (control.tagName === "BUTTON" && control.dataset.pendingLabel) control.textContent = control.dataset.pendingLabel;
    delete control.dataset.pending;
    delete control.dataset.pendingLabel;
  }

  function restorePending(control) {
    queueMicrotask(() => setPending(control, false));
  }

  function moveToLoginForExpiredSession() {
    const login = $("login-view");
    const workspace = $("workspace-view");
    if (!login || !workspace || workspace.hidden) return;
    workspace.hidden = true;
    login.hidden = false;
    const help = $("login-help");
    if (help) help.textContent = "로그인 시간이 만료되었습니다. 이메일로 다시 로그인해 주세요.";
    $("login-email")?.focus();
  }

  window.fetch = async (...args) => {
    const input = args[0];
    const init = args[1] || {};
    const url = typeof input === "string" ? input : String(input?.url || "");
    const method = String(init.method || "GET").toUpperCase();
    const isSaas = url.includes("/api/saas");
    const isInitialMe = /\/api\/saas\/auth\/me(?:\?|$)/.test(url);
    const claimed = pendingControl;
    pendingControl = null;

    try {
      const response = await nativeFetch(...args);
      if (isSaas) {
        const clone = response.clone();
        clone.json().then((body) => {
          if (typeof body?.csrf === "string" && body.csrf) csrf = body.csrf;
        }).catch(() => {});
      }
      if (isInitialMe && !response.ok && ![401, 404].includes(response.status)) {
        bootstrapFailure = `http_${response.status}`;
      }
      if (isSaas && response.status === 401 && !isInitialMe && !/\/auth\/(?:magic-link|magic-link\/verify)/.test(url)) {
        queueMicrotask(moveToLoginForExpiredSession);
      }
      return response;
    } catch (error) {
      if (isInitialMe) bootstrapFailure = "network_error";
      throw error;
    } finally {
      if (claimed) restorePending(claimed);
    }
  };

  function patchStaticA11y() {
    const loading = $("loading-view");
    if (loading) {
      loading.setAttribute("role", "status");
      loading.setAttribute("aria-live", "polite");
      loading.setAttribute("aria-busy", "true");
    }
    for (const id of ["flash", "collab-flash"]) {
      const el = $(id);
      if (!el) continue;
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      el.setAttribute("aria-atomic", "true");
    }
    $("page-title")?.setAttribute("tabindex", "-1");
    document.querySelectorAll("button:not([type])").forEach((button) => button.setAttribute("type", "button"));
    document.querySelectorAll(".data-table th").forEach((cell) => cell.setAttribute("scope", "col"));

    const dialog = $("org-dialog");
    const title = dialog?.querySelector("h2");
    if (dialog && title) {
      title.id ||= "org-dialog-title";
      dialog.setAttribute("aria-labelledby", title.id);
    }
  }

  function installFlashNormalizer() {
    for (const id of ["flash", "collab-flash"]) {
      const el = $(id);
      if (!el) continue;
      const normalize = () => {
        if (el.hidden || !el.textContent) return;
        const before = el.textContent;
        const after = friendlyError(before);
        if (after !== before) el.textContent = after;
        const error = el.classList.contains("error");
        el.setAttribute("role", error ? "alert" : "status");
        el.setAttribute("aria-live", error ? "assertive" : "polite");
      };
      new MutationObserver(normalize).observe(el, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden"] });
    }
  }

  function installPendingGuards() {
    document.addEventListener("submit", (event) => {
      const form = event.target.closest("form");
      if (!form || form.id === "action-reason-form") return;
      const submit = event.submitter || form.querySelector('button[type="submit"],input[type="submit"]');
      if (!submit || submit.disabled) return;
      setPending(submit, true, "저장 중");
      pendingControl = submit;
    }, true);

    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-notification-read],[data-clear-due-date]");
      if (!button || button.disabled) return;
      setPending(button, true, "처리 중");
      pendingControl = button;
    }, true);
  }

  function ensureErrorView() {
    if ($("business-error-view")) return $("business-error-view");
    const view = document.createElement("section");
    view.id = "business-error-view";
    view.className = "center-card";
    view.hidden = true;
    view.innerHTML = '<div class="eyebrow">CONNECTION ERROR</div><h1>Business Workspace에 연결하지 못했습니다.</h1><p>일시적인 네트워크 또는 서버 문제일 수 있습니다. 잠시 후 다시 시도해 주세요.</p><div class="detail-error-actions"><button id="business-retry" class="primary-button" type="button">다시 시도</button><a class="secondary-link" href="/">인사야 홈으로</a></div>';
    $("business-app")?.append(view);
    $("business-retry")?.addEventListener("click", () => location.reload());
    return view;
  }

  function installBootstrapErrorState() {
    const disabled = $("disabled-view");
    const errorView = ensureErrorView();
    if (!disabled || !errorView) return;
    const sync = () => {
      if (disabled.hidden || !bootstrapFailure) return;
      disabled.hidden = true;
      errorView.hidden = false;
      errorView.querySelector("p").textContent = friendlyError(bootstrapFailure);
      errorView.querySelector("button")?.focus();
    };
    new MutationObserver(sync).observe(disabled, { attributes: true, attributeFilter: ["hidden"] });
  }

  function ensureReasonDialog() {
    if ($("action-reason-dialog")) return $("action-reason-dialog");
    const dialog = document.createElement("dialog");
    dialog.id = "action-reason-dialog";
    dialog.className = "modal-card action-reason-dialog";
    dialog.setAttribute("aria-labelledby", "action-reason-title");
    dialog.innerHTML = '<form id="action-reason-form"><div class="eyebrow">ACTION STATUS</div><h2 id="action-reason-title">사유 입력</h2><p id="action-reason-help" class="helper"></p><label for="action-reason-input">사유<textarea id="action-reason-input" rows="4" maxlength="1000" required></textarea></label><div id="action-reason-error" class="dialog-error" role="alert" aria-live="assertive"></div><div class="dialog-actions"><button id="action-reason-cancel" type="button" class="secondary-button">취소</button><button id="action-reason-submit" type="submit" class="primary-button">상태 변경</button></div></form>';
    document.body.append(dialog);
    $("action-reason-cancel")?.addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => {
      dialog.dataset.actionId = "";
      dialog.dataset.status = "";
      $("action-reason-input").value = "";
      $("action-reason-error").textContent = "";
    });
    $("action-reason-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const actionId = dialog.dataset.actionId;
      const status = dialog.dataset.status;
      const reason = $("action-reason-input").value.trim();
      const errorEl = $("action-reason-error");
      if (!reason) {
        errorEl.textContent = "사유를 입력해 주세요.";
        $("action-reason-input").focus();
        return;
      }
      const orgId = $("org-picker")?.value;
      if (!orgId || !actionId || !csrf) {
        errorEl.textContent = "로그인 상태를 다시 확인해 주세요.";
        return;
      }
      const submit = $("action-reason-submit");
      setPending(submit, true, "변경 중");
      try {
        const body = status === "BLOCKED" ? { status, blockedReason: reason, dismissedReason: "" } : { status, blockedReason: "", dismissedReason: reason };
        const response = await window.fetch(`/api/saas/organizations/${encodeURIComponent(orgId)}/actions/${encodeURIComponent(actionId)}/status`, {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "content-type": "application/json", "x-csrf-token": csrf },
          body: JSON.stringify(body),
        });
        const result = await response.json().catch(() => null);
        if (!response.ok) throw new Error(result?.error || `http_${response.status}`);
        dialog.close();
        $("org-picker")?.dispatchEvent(new Event("change", { bubbles: true }));
        announce(status === "BLOCKED" ? "조치를 보류했습니다." : "조치를 제외했습니다.");
      } catch (error) {
        errorEl.textContent = friendlyError(error?.message);
      } finally {
        setPending(submit, false);
      }
    });
    return dialog;
  }

  function installReasonDialogOverride() {
    const dialog = ensureReasonDialog();
    document.addEventListener("click", (event) => {
      const button = event.target.closest('[data-action-status="BLOCKED"],[data-action-status="DISMISSED"]');
      if (!button) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const status = button.dataset.actionStatus;
      dialog.dataset.actionId = button.dataset.actionId || "";
      dialog.dataset.status = status;
      $("action-reason-title").textContent = status === "BLOCKED" ? "조치 보류 사유" : "조치 제외 사유";
      $("action-reason-help").textContent = status === "BLOCKED" ? "왜 지금 진행하기 어려운지 기록해 두면 다음 담당자가 상태를 이해하기 쉽습니다." : "이 조치를 제외하는 이유를 기록해 두면 추후 재검토할 때 근거로 사용할 수 있습니다.";
      dialog.showModal();
      queueMicrotask(() => $("action-reason-input")?.focus());
    }, true);
  }

  patchStaticA11y();
  installFlashNormalizer();
  installPendingGuards();
  installBootstrapErrorState();
  installReasonDialogOverride();
})();
