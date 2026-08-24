(() => {
  const ERROR_COPY = Object.freeze({
    unauthorized: "로그인 시간이 만료되었습니다. 초대받은 이메일로 다시 로그인해 주세요.",
    forbidden: "이 Case에 접근할 권한이 없거나 회사에서 접근을 종료했습니다.",
    not_found: "공유된 Case 또는 문서를 찾을 수 없습니다.",
    invitation_expired: "초대가 만료되었습니다. 회사 담당자에게 새 초대를 요청해 주세요.",
    invitation_revoked: "회사가 이 초대를 취소했습니다. 새 초대가 필요합니다.",
    share_grant_expired: "이 Case의 공유 기간이 끝났습니다. 회사 담당자에게 다시 공유를 요청해 주세요.",
    share_grant_revoked: "회사가 이 Case에 대한 접근을 종료했습니다.",
    too_many_requests: "요청이 많습니다. 잠시 후 다시 시도해 주세요.",
    csrf_invalid: "보안 확인 시간이 만료되었습니다. 다시 로그인해 주세요.",
    internal_error: "일시적인 서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
    network_error: "서버에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.",
  });

  const nativeFetch = window.fetch.bind(window);
  let lastVisibleView = null;

  function friendly(value) {
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

  function normalizeErrorNode(node) {
    if (!(node instanceof HTMLElement)) return;
    const current = String(node.textContent || "").trim();
    if (!current) return;
    const direct = friendly(current);
    if (direct !== current) {
      node.textContent = direct;
      return;
    }
    const match = current.match(/^(.*?)(?:\s*[:(]\s*)([a-z0-9_]+)\)?$/i);
    if (!match || !ERROR_COPY[match[2]]) return;
    node.textContent = `${match[1].trim()} ${ERROR_COPY[match[2]]}`.trim();
  }

  function patch() {
    const loading = document.getElementById("advisor-loading");
    if (loading) {
      loading.setAttribute("role", "status");
      loading.setAttribute("aria-live", "polite");
      loading.setAttribute("aria-busy", loading.hidden ? "false" : "true");
    }

    document.querySelectorAll(".error").forEach((node) => {
      node.setAttribute("role", "alert");
      node.setAttribute("aria-live", "assertive");
      node.setAttribute("aria-atomic", "true");
      normalizeErrorNode(node);
    });
    document.querySelectorAll(".empty,.review-empty").forEach((node) => {
      if (!node.hasAttribute("role")) node.setAttribute("role", "status");
    });
    document.querySelectorAll("button:disabled").forEach((node) => node.setAttribute("aria-disabled", "true"));
    document.querySelectorAll("button:not(:disabled)[aria-disabled='true']").forEach((node) => node.removeAttribute("aria-disabled"));

    const visibleView = [...document.querySelectorAll("#advisor-shell > section")].find((node) => !node.hidden);
    if (visibleView && visibleView !== lastVisibleView) {
      lastVisibleView = visibleView;
      const heading = visibleView.querySelector("h1");
      if (heading) {
        heading.setAttribute("tabindex", "-1");
        queueMicrotask(() => {
          if (document.activeElement === document.body || !visibleView.contains(document.activeElement)) heading.focus({ preventScroll: true });
        });
      }
    }
  }

  function showWorkspaceError(message) {
    const node = document.getElementById("advisor-workspace-error") || document.getElementById("advisor-login-error") || document.getElementById("advisor-invite-error");
    if (!node) return;
    node.textContent = friendly(message);
    node.setAttribute("role", "alert");
    node.setAttribute("aria-live", "assertive");
  }

  window.fetch = async (...args) => {
    const input = args[0];
    const url = typeof input === "string" ? input : String(input?.url || "");
    const isAdvisorRequest = url.includes("/api/saas/") || url.startsWith("/api/saas");
    try {
      const response = await nativeFetch(...args);
      if (isAdvisorRequest && response.status === 401) showWorkspaceError(ERROR_COPY.unauthorized);
      else if (isAdvisorRequest && response.status === 403) showWorkspaceError(ERROR_COPY.forbidden);
      else if (isAdvisorRequest && response.status === 429) showWorkspaceError(ERROR_COPY.too_many_requests);
      else if (isAdvisorRequest && response.status >= 500) showWorkspaceError(ERROR_COPY.internal_error);
      return response;
    } catch (error) {
      if (isAdvisorRequest) showWorkspaceError(ERROR_COPY.network_error);
      throw error;
    }
  };

  function initialize() {
    patch();
    const observer = new MutationObserver(() => patch());
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["hidden", "class", "disabled"] });
    window.addEventListener("offline", () => showWorkspaceError("인터넷 연결이 끊어졌습니다. 연결을 확인한 뒤 다시 시도해 주세요."));
    window.addEventListener("online", () => {
      const node = document.getElementById("advisor-workspace-error");
      if (node?.textContent.includes("인터넷 연결")) node.textContent = "";
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
