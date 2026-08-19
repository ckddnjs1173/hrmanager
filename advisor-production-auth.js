(() => {
  async function request(path, body) {
    const response = await fetch(`/api/saas${path}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    let data = null; try { data = await response.json(); } catch {}
    if (!response.ok) { const error = new Error(data?.error || `http_${response.status}`); error.status = response.status; throw error; }
    return data || {};
  }

  document.addEventListener("submit", async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.id !== "advisor-login-form") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const button = form.querySelector("button[type=submit]");
    const errorBox = document.getElementById("advisor-login-error");
    const magicBox = document.getElementById("advisor-magic-box");
    const email = String(document.getElementById("advisor-login-email")?.value || "").trim();
    const inviteToken = typeof advisorState !== "undefined" ? String(advisorState.inviteToken || "").trim() : "";
    if (button) button.disabled = true;
    if (errorBox) { errorBox.textContent = ""; errorBox.dataset.kind = ""; }
    try {
      let result;
      if (inviteToken) {
        try { result = await request("/advisor/invitations/magic-link", { token: inviteToken }); }
        catch (error) {
          if (error.status !== 404) throw error;
          result = await request("/auth/magic-link", { email, returnTo: "/advisor.html", advisorInviteToken: inviteToken });
        }
      } else {
        result = await request("/auth/magic-link", { email, returnTo: "/advisor.html" });
      }
      if (result.debugToken && typeof advisorState !== "undefined") {
        advisorState.magicToken = result.debugToken;
        if (magicBox) magicBox.hidden = false;
        if (errorBox) errorBox.textContent = "개발 환경 로그인 링크가 준비되었습니다.";
      } else {
        if (magicBox) magicBox.hidden = true;
        if (errorBox) {
          errorBox.dataset.kind = "success";
          errorBox.textContent = "초대받은 이메일로 로그인 링크를 보냈습니다. 메일의 버튼을 눌러 계속해 주세요.";
        }
      }
    } catch (error) {
      if (errorBox) { errorBox.dataset.kind = "error"; errorBox.textContent = `로그인 링크 발송 실패: ${error.message}`; }
    } finally { if (button) button.disabled = false; }
  }, true);
})();
