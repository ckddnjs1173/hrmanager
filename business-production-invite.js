(() => {
  document.addEventListener("submit", async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.id !== "advisor-invite-form") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const data = new FormData(form);
    const caseId = String(data.get("caseId") || "");
    const advisorEmail = String(data.get("advisorEmail") || "").trim();
    const days = Number(data.get("grantDays") || 30);
    if (!caseId || !advisorEmail) {
      if (typeof collabFlash === "function") collabFlash("공유할 Case와 전문가 이메일을 입력해 주세요.", "error");
      return;
    }
    const button = form.querySelector("button[type=submit]");
    if (button) button.disabled = true;
    try {
      const result = await collabApi(`/organizations/${encodeURIComponent(collab.orgId)}/business-cases/${encodeURIComponent(caseId)}/advisor-invitations`, {
        method: "POST",
        body: { advisorEmail, permissions: DOC_PERMISSIONS, grantExpiresAt: grantExpiryIso(days) },
      });
      form.elements.advisorEmail.value = "";
      const box = c$("advisor-invite-link-box");
      if (result.deliveryMode === "EMAIL") {
        if (box) box.hidden = true;
        await loadCollaboration({ quiet: true });
        collabFlash(`${advisorEmail} 주소로 검토 초대를 보냈습니다.`);
        return;
      }
      const path = result.invitationFragmentPath || "";
      if (!path) throw new Error("invitation_delivery_missing");
      const absolute = new URL(path, location.origin).href;
      c$("advisor-invite-link").value = absolute;
      if (box) box.hidden = false;
      const refreshed = await loadCollaboration({ quiet: true });
      if (!refreshed) collabFlash("초대는 생성됐지만 목록 새로고침에 실패했습니다. 아래 1회용 링크는 안전한 채널로 전달해 주세요.", "error");
      else collabFlash("문서 검토 권한을 포함한 초대를 만들었습니다. 아래 링크를 전문가에게 전달해 주세요.");
    } catch (error) {
      collabFlash(`초대 생성 실패: ${error.message}`, "error");
    } finally { if (button) button.disabled = false; }
  }, true);
})();
