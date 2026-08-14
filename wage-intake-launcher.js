const TARGET = "/wage-intake";

function goToWageIntake() {
  window.location.assign(TARGET);
}

function injectStyles() {
  if (document.getElementById("wageIntakeLauncherStyle")) return;
  const style = document.createElement("style");
  style.id = "wageIntakeLauncherStyle";
  style.textContent = `
    .case-launcher{margin:28px 0 20px;border:1px solid #dce4ef;border-radius:18px;background:linear-gradient(135deg,#f8fbff 0%,#eef2f7 100%);padding:20px;display:flex;align-items:center;justify-content:space-between;gap:18px;box-shadow:0 10px 30px rgba(20,43,71,.07)}
    .case-launcher-copy{min-width:0}
    .case-launcher-kicker{font-size:.72rem;font-weight:800;letter-spacing:.02em;color:#1b3a5b;margin-bottom:4px}
    .case-launcher-title{font-size:1.06rem;font-weight:800;color:#0b0d12;line-height:1.35}
    .case-launcher-desc{font-size:.82rem;color:#6b7280;margin-top:4px;line-height:1.55}
    .case-launcher-btn{flex-shrink:0;border:0;border-radius:12px;background:#1b3a5b;color:#fff;padding:12px 16px;font:inherit;font-size:.86rem;font-weight:800;cursor:pointer;box-shadow:0 6px 16px rgba(27,58,91,.16)}
    .case-launcher-btn:hover{background:#142b47}
    @media(max-width:700px){.case-launcher{align-items:stretch;flex-direction:column}.case-launcher-btn{width:100%;padding:13px 16px}}
  `;
  document.head.appendChild(style);
}

function injectHomeEntry() {
  const greeting = document.getElementById("greeting");
  if (!greeting || greeting.querySelector("[data-wage-case-launcher]")) return;

  const box = document.createElement("div");
  box.className = "case-launcher";
  box.dataset.wageCaseLauncher = "true";
  box.innerHTML = `
    <div class="case-launcher-copy">
      <div class="case-launcher-kicker">내 사건 · 임금체불 베타</div>
      <div class="case-launcher-title">회사에서 아직 못 받은 돈이 있나요?</div>
      <div class="case-launcher-desc">질문에 답하면 사건이 정리되고, 다음에 확인할 내용까지 이어서 보여드려요.</div>
    </div>
    <button class="case-launcher-btn" type="button">임금체불 사건 시작하기</button>
  `;
  box.querySelector("button")?.addEventListener("click", goToWageIntake);

  const before = greeting.querySelector(".he-label");
  if (before) greeting.insertBefore(box, before);
  else greeting.appendChild(box);
}

function connectSolveFlow() {
  const original = window.openSolveCase;
  if (typeof original !== "function" || original.__wageCaseWrapped) return;

  function wrapped(key, ...rest) {
    if (key === "wage") return goToWageIntake();
    return original.call(this, key, ...rest);
  }
  wrapped.__wageCaseWrapped = true;
  window.openSolveCase = wrapped;
}

function enhanceExistingWageButtons() {
  document.addEventListener("click", (event) => {
    const target = event.target?.closest?.("[data-wage-intake]");
    if (!target) return;
    event.preventDefault();
    goToWageIntake();
  });
}

function boot() {
  injectStyles();
  injectHomeEntry();
  connectSolveFlow();
  enhanceExistingWageButtons();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
