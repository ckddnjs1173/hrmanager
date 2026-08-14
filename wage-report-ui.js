const ROOT = document.getElementById("wageApp");
const STORAGE_KEY = "insaya:wage-case-session";
const BUTTON_ID = "wage-report-copy";

function session() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
    return parsed?.id && parsed?.token ? parsed : null;
  } catch {
    return null;
  }
}

async function copyReport(button) {
  const current = session();
  if (!current) return;
  const original = button.textContent;
  button.disabled = true;
  try {
    const response = await fetch(`/api/cases/${encodeURIComponent(current.id)}/wage-report`, {
      headers: { "x-case-token": current.token },
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.text) throw new Error(result?.error || `http_${response.status}`);
    await navigator.clipboard.writeText(result.text);
    button.textContent = "사건 요약 복사됨";
    setTimeout(() => { button.textContent = original; button.disabled = false; }, 1400);
  } catch {
    button.textContent = "복사 실패 · 다시 시도";
    button.disabled = false;
  }
}

function mount() {
  const workspace = ROOT.querySelector(".workspace");
  if (!workspace || document.getElementById(BUTTON_ID)) return;
  const foot = workspace.querySelector(".workspace-foot");
  if (!foot) return;

  const button = document.createElement("button");
  button.id = BUTTON_ID;
  button.className = "btn";
  button.type = "button";
  button.textContent = "사건 요약 복사";
  button.addEventListener("click", () => copyReport(button));
  foot.insertBefore(button, foot.querySelector(".danger") || null);
}

const observer = new MutationObserver(mount);
observer.observe(ROOT, { childList: true, subtree: true });
mount();
