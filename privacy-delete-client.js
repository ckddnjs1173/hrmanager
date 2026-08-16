(() => {
  const VERIFIED_COPY = "삭제 요청 접수 후 본인 확인을 거쳐 처리";

  function patchConsentCopy() {
    const consent = document.getElementById("mConsentCollectText");
    if (consent?.innerHTML?.includes("삭제 요청 시 즉시")) {
      consent.innerHTML = consent.innerHTML.replaceAll("삭제 요청 시 즉시", VERIFIED_COPY);
    }
  }

  function patchPrivacySection() {
    const input = document.getElementById("delContact");
    const row = input?.closest?.(".row");
    const section = row?.parentElement;
    const paragraph = section?.querySelector?.("p");
    if (paragraph) {
      paragraph.textContent = "연락처만으로 즉시 삭제하지 않습니다. 삭제 요청을 접수한 뒤 본인 확인을 거쳐 상담·리드 정보를 처리합니다.";
    }
    const button = row?.querySelector?.("button");
    if (button) button.textContent = "삭제 요청 접수";
  }

  const originalOpenLegal = window.openLegal;
  if (typeof originalOpenLegal === "function") {
    window.openLegal = function (...args) {
      const result = originalOpenLegal.apply(this, args);
      if (args[0] === "privacy") queueMicrotask(patchPrivacySection);
      return result;
    };
  }

  const originalShowModal = window.showModal;
  if (typeof originalShowModal === "function") {
    window.showModal = function (...args) {
      const result = originalShowModal.apply(this, args);
      patchConsentCopy();
      return result;
    };
  }

  window.requestDataDelete = async function requestVerifiedDataDelete() {
    const input = document.getElementById("delContact");
    const message = document.getElementById("delMsg");
    const contact = String(input?.value || "").trim();
    if (!message) return;
    if (!contact) {
      message.style.color = "var(--danger-ink)";
      message.textContent = "연락처를 입력해 주세요.";
      input?.focus();
      return;
    }
    if (!window.confirm("개인정보 삭제 요청을 접수할까요? 연락처만으로 즉시 삭제하지 않고 본인 확인 후 처리합니다.")) return;

    message.style.color = "var(--ink-400)";
    message.textContent = "요청 접수 중…";
    try {
      const response = await fetch("/api/privacy/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.status === "verification_required") {
        message.style.color = "var(--ok-ink)";
        message.textContent = "삭제 요청이 접수됐습니다. 본인 확인 후 처리합니다.";
        input.value = "";
        return;
      }
      message.style.color = "var(--danger-ink)";
      message.textContent = "삭제 요청을 접수하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    } catch {
      message.style.color = "var(--danger-ink)";
      message.textContent = "네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
    }
  };

  patchConsentCopy();
  patchPrivacySection();
})();
