(() => {
  const CASE_API_PATTERN = /\/api\/cases(?:\/|\?|$)/;
  const ERROR_COPY = Object.freeze({
    unauthorized: "사건 접근 정보가 만료되었거나 유효하지 않습니다. 이 탭에서 사건을 다시 시작해 주세요.",
    forbidden: "이 사건에 접근할 권한이 없습니다.",
    not_found: "사건을 찾을 수 없습니다. 이미 삭제되었거나 보관기간이 끝났을 수 있습니다.",
    too_many_requests: "요청이 많습니다. 잠시 후 다시 시도해 주세요.",
    invalid_json: "입력값을 처리하지 못했습니다. 내용을 확인해 주세요.",
    payload_too_large: "입력한 내용이 너무 큽니다. 내용을 줄여 다시 시도해 주세요.",
    internal_error: "일시적인 서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
    network_error: "서버에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.",
  });

  const nativeFetch = window.fetch.bind(window);
  let statusTimer = 0;
  let lastFocusedView = null;

  function friendlyError(value) {
    const text = String(value || "").trim();
    if (!text) return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    if (ERROR_COPY[text]) return ERROR_COPY[text];
    if (/failed to fetch|networkerror|load failed/i.test(text)) return ERROR_COPY.network_error;
    if (/^http_401$/i.test(text)) return ERROR_COPY.unauthorized;
    if (/^http_403$/i.test(text)) return ERROR_COPY.forbidden;
    if (/^http_404$/i.test(text)) return ERROR_COPY.not_found;
    if (/^http_429$/i.test(text)) return ERROR_COPY.too_many_requests;
    if (/^http_5\d\d$/i.test(text)) return ERROR_COPY.internal_error;
    if (/^[a-z0-9_]+$/i.test(text)) return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    return text;
  }

  function ensureStatus() {
    let node = document.getElementById("case-detail-status");
    if (node) return node;
    const app = document.querySelector(".case-app");
    if (!app) return null;
    node = document.createElement("div");
    node.id = "case-detail-status";
    node.className = "case-detail-status";
    node.hidden = true;
    node.setAttribute("role", "status");
    node.setAttribute("aria-live", "polite");
    node.setAttribute("aria-atomic", "true");
    app.prepend(node);
    return node;
  }

  function announce(message, kind = "status", { sticky = false } = {}) {
    const node = ensureStatus();
    if (!node) return;
    window.clearTimeout(statusTimer);
    node.textContent = friendlyError(message);
    node.dataset.kind = kind;
    node.setAttribute("role", kind === "error" ? "alert" : "status");
    node.setAttribute("aria-live", kind === "error" ? "assertive" : "polite");
    node.hidden = false;
    if (!sticky) statusTimer = window.setTimeout(() => { node.hidden = true; }, 5000);
  }

  function normalizeErrorNode(node) {
    if (!(node instanceof HTMLElement) || node.hidden) return;
    const current = String(node.textContent || "").trim();
    if (!current) return;
    const direct = friendlyError(current);
    if (direct !== current) {
      node.textContent = direct;
      return;
    }
    const match = current.match(/^(.*?)(?:\s*[:(]\s*)([a-z0-9_]+)\)?$/i);
    if (!match || !ERROR_COPY[match[2]]) return;
    node.textContent = `${match[1].trim()} ${ERROR_COPY[match[2]]}`.trim();
  }

  function patchAccessibility(root = document) {
    const loadingNodes = root.querySelectorAll?.(".case-loading") || [];
    for (const node of loadingNodes) {
      node.setAttribute("role", "status");
      node.setAttribute("aria-live", "polite");
      node.setAttribute("aria-busy", "true");
    }

    const app = document.querySelector(".case-app");
    if (app) {
      app.setAttribute("aria-live", "polite");
      app.setAttribute("aria-atomic", "false");
      app.setAttribute("aria-busy", app.querySelector(".case-loading") ? "true" : "false");
    }

    const emptyNodes = root.querySelectorAll?.(".empty, .review-empty") || [];
    for (const node of emptyNodes) {
      if (!node.hasAttribute("role")) node.setAttribute("role", "status");
    }

    const errorNodes = root.querySelectorAll?.(".error, .case-error, [data-error]") || [];
    for (const node of errorNodes) {
      node.setAttribute("role", "alert");
      node.setAttribute("aria-live", "assertive");
      node.setAttribute("aria-atomic", "true");
      normalizeErrorNode(node);
    }

    const headings = root.querySelectorAll?.(".case-app h1, .case-app h2") || [];
    for (const heading of headings) {
      if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
    }

    for (const input of root.querySelectorAll?.("input, select, textarea") || []) {
      if (input.hasAttribute("aria-label") || input.hasAttribute("aria-labelledby")) continue;
      if (input.labels?.length) continue;
      const placeholder = String(input.getAttribute("placeholder") || "").trim();
      if (placeholder) input.setAttribute("aria-label", placeholder);
    }
  }

  function focusNewWorkspaceHeading() {
    const app = document.querySelector(".case-app");
    if (!app || app.querySelector(".case-loading")) return;
    const heading = app.querySelector("h1, h2");
    if (!heading || heading === lastFocusedView) return;
    lastFocusedView = heading;
    heading.setAttribute("tabindex", "-1");
    if (document.activeElement === document.body || !app.contains(document.activeElement)) {
      heading.focus({ preventScroll: true });
    }
  }

  window.fetch = async (...args) => {
    const input = args[0];
    const url = typeof input === "string" ? input : String(input?.url || "");
    const isCaseRequest = CASE_API_PATTERN.test(url);
    try {
      const response = await nativeFetch(...args);
      if (isCaseRequest && response.status === 401) announce(ERROR_COPY.unauthorized, "error", { sticky: true });
      else if (isCaseRequest && response.status === 403) announce(ERROR_COPY.forbidden, "error", { sticky: true });
      else if (isCaseRequest && response.status === 404) announce(ERROR_COPY.not_found, "error", { sticky: true });
      else if (isCaseRequest && response.status === 429) announce(ERROR_COPY.too_many_requests, "error");
      else if (isCaseRequest && response.status >= 500) announce(ERROR_COPY.internal_error, "error");
      return response;
    } catch (error) {
      if (isCaseRequest) announce(ERROR_COPY.network_error, "error", { sticky: true });
      throw error;
    }
  };

  function initialize() {
    ensureStatus();
    patchAccessibility();
    focusNewWorkspaceHeading();

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof HTMLElement) patchAccessibility(node);
        }
        if (record.target instanceof HTMLElement) normalizeErrorNode(record.target);
      }
      patchAccessibility();
      queueMicrotask(focusNewWorkspaceHeading);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["hidden", "class"] });

    window.addEventListener("offline", () => announce("인터넷 연결이 끊어졌습니다. 입력한 내용을 유지한 채 연결을 확인해 주세요.", "error", { sticky: true }));
    window.addEventListener("online", () => announce("인터넷 연결이 복구되었습니다. 필요한 작업을 다시 시도해 주세요."));
    window.addEventListener("unhandledrejection", (event) => {
      const reason = event.reason?.message || event.reason;
      if (/failed to fetch|networkerror|load failed/i.test(String(reason || ""))) announce(ERROR_COPY.network_error, "error", { sticky: true });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
