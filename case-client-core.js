export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatWon(value) {
  return Number.isFinite(Number(value))
    ? `${Math.round(Number(value)).toLocaleString("ko-KR")}원`
    : "추가 확인 필요";
}

export function booleanSelect(name, value, { yesLabel = "예", noLabel = "아니오" } = {}) {
  const esc = escapeHtml;
  return `<select class="case-select" name="${esc(name)}"><option value="">선택</option><option value="true" ${value === true ? "selected" : ""}>${esc(yesLabel)}</option><option value="false" ${value === false ? "selected" : ""}>${esc(noLabel)}</option></select>`;
}

export function controlValue(control) {
  if (!control?.name || control.value === "") return undefined;
  if (control.value === "true" || control.value === "false") return control.value === "true";
  if (control.type === "number") {
    const number = Number(control.value);
    return Number.isFinite(number) ? number : undefined;
  }
  return control.value;
}

export function createCaseClientCore({
  root,
  storageKey,
  slug,
  errorClass = "case-error",
  previewId = `${slug}-doc-preview`,
  deleteConfirm = "이 사건을 삭제할까요?",
  patchErrorText = "사건 정보를 저장하지 못했습니다.",
  previewErrorText = "문서 초안을 만들지 못했습니다.",
  closePreviewOnBackdrop = false,
  reportSuccessText = "사건 요약 복사됨",
  reportFailureText = "복사 실패",
  reportResetMs = 0,
  disableReportWhileCopying = false,
  shouldClearSessionOnRestoreError = () => true,
  renderStart,
  renderWorkspace,
}) {
  if (!root) throw new Error("case_client_root_required");
  if (!storageKey) throw new Error("case_client_storage_key_required");
  if (!slug) throw new Error("case_client_slug_required");
  if (typeof renderStart !== "function" || typeof renderWorkspace !== "function") {
    throw new Error("case_client_renderers_required");
  }

  function getSession() {
    try {
      const value = JSON.parse(sessionStorage.getItem(storageKey) || "null");
      return value?.id && value?.token ? value : null;
    } catch {
      return null;
    }
  }

  function setSession(id, token) {
    sessionStorage.setItem(storageKey, JSON.stringify({ id, token }));
  }

  function clearSession() {
    sessionStorage.removeItem(storageKey);
  }

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

  function showError(text) {
    root.querySelector(`.${errorClass}`)?.remove();
    const box = document.createElement("div");
    box.className = errorClass;
    box.textContent = text;
    root.prepend(box);
  }

  async function patchFacts(patch, button) {
    const session = getSession();
    if (!session) return renderStart();
    if (button) button.disabled = true;
    try {
      const result = await api(`/api/cases/${encodeURIComponent(session.id)}/${slug}-intake`, {
        method: "PATCH",
        body: JSON.stringify({ facts: patch }),
      });
      renderWorkspace(result);
      return result;
    } catch (error) {
      if (button) button.disabled = false;
      showError(patchErrorText);
      throw error;
    }
  }

  async function saveEvidence(event) {
    event.preventDefault();
    const evidence = {};
    for (const control of event.currentTarget.elements) {
      if (control.name) evidence[control.name] = control.value;
    }
    try {
      await patchFacts({ evidence }, event.currentTarget.querySelector("button[type=submit]"));
    } catch {
      // patchFacts already renders the user-facing error.
    }
  }

  function closePreview() {
    document.getElementById(previewId)?.remove();
  }

  async function previewDocument(templateKey) {
    const session = getSession();
    if (!session) return;
    try {
      const result = await api(`/api/cases/${encodeURIComponent(session.id)}/${slug}-document/${encodeURIComponent(templateKey)}`, {
        method: "POST",
        body: JSON.stringify({ values: {} }),
      });
      closePreview();
      const overlay = document.createElement("div");
      overlay.id = previewId;
      overlay.className = "doc-preview-overlay";
      overlay.innerHTML = `<div class="doc-preview"><div class="doc-preview-head"><div><span>사건 정보 자동 반영</span><h3>${escapeHtml(result.document?.title || "문서 초안")}</h3></div><button class="btn" type="button" data-close>닫기</button></div><pre></pre><div class="doc-preview-actions"><button class="btn primary" type="button" data-copy>텍스트 복사</button></div></div>`;
      overlay.querySelector("pre").textContent = result.document?.text || "";
      overlay.querySelector("[data-close]").onclick = closePreview;
      overlay.querySelector("[data-copy]").onclick = async (event) => {
        await navigator.clipboard.writeText(result.document?.text || "").catch(() => {});
        event.currentTarget.textContent = "복사됨";
      };
      if (closePreviewOnBackdrop) {
        overlay.addEventListener("click", (event) => {
          if (event.target === overlay) closePreview();
        });
      }
      document.body.appendChild(overlay);
    } catch {
      showError(previewErrorText);
    }
  }

  async function copyReport(event) {
    const session = getSession();
    if (!session) return;
    const button = event.currentTarget;
    const original = button.textContent;
    if (disableReportWhileCopying) button.disabled = true;
    try {
      const result = await api(`/api/cases/${encodeURIComponent(session.id)}/${slug}-report`);
      await navigator.clipboard.writeText(result.text || "");
      button.textContent = reportSuccessText;
      if (reportResetMs > 0) {
        setTimeout(() => {
          button.textContent = original;
          button.disabled = false;
        }, reportResetMs);
      } else if (disableReportWhileCopying) {
        button.disabled = false;
      }
    } catch {
      button.textContent = reportFailureText;
      button.disabled = false;
    }
  }

  async function deleteCase() {
    const session = getSession();
    if (!session) return renderStart();
    if (!window.confirm(deleteConfirm)) return;
    try {
      await api(`/api/cases/${encodeURIComponent(session.id)}`, { method: "DELETE" });
    } finally {
      clearSession();
      closePreview();
      renderStart();
    }
  }

  async function restore() {
    const session = getSession();
    if (!session) return renderStart();
    try {
      renderWorkspace(await api(`/api/cases/${encodeURIComponent(session.id)}/${slug}-intake`));
    } catch (error) {
      if (shouldClearSessionOnRestoreError(error)) clearSession();
      renderStart();
    }
  }

  return {
    api,
    clearSession,
    closePreview,
    copyReport,
    deleteCase,
    getSession,
    patchFacts,
    previewDocument,
    restore,
    saveEvidence,
    setSession,
    showError,
  };
}
