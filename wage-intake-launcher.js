const WAGE_TARGET = "/wage-intake";
const DISMISSAL_TARGET = "/dismissal-intake";
const RETIREMENT_TARGET = "/retirement-intake";

function goToWageIntake() {
  window.location.assign(WAGE_TARGET);
}

function goToDismissalIntake() {
  window.location.assign(DISMISSAL_TARGET);
}

function goToRetirementIntake() {
  window.location.assign(RETIREMENT_TARGET);
}

function injectStyles() {
  if (document.getElementById("wageIntakeLauncherStyle")) return;
  const style = document.createElement("style");
  style.id = "wageIntakeLauncherStyle";
  style.textContent = `
    .case-launcher-stack{margin:28px 0 20px;display:grid;gap:10px}
    .case-launcher{border:1px solid #dce4ef;border-radius:18px;background:linear-gradient(135deg,#f8fbff 0%,#eef2f7 100%);padding:20px;display:flex;align-items:center;justify-content:space-between;gap:18px;box-shadow:0 10px 30px rgba(20,43,71,.07)}
    .case-launcher.dismissal{background:linear-gradient(135deg,#fffaf5 0%,#f5f7fb 100%)}
    .case-launcher.retirement{background:linear-gradient(135deg,#f7fff9 0%,#f3f7f5 100%)}
    .case-launcher-copy{min-width:0}
    .case-launcher-kicker{font-size:.72rem;font-weight:800;letter-spacing:.02em;color:#1b3a5b;margin-bottom:4px}
    .case-launcher.dismissal .case-launcher-kicker{color:#825a21}
    .case-launcher.retirement .case-launcher-kicker{color:#356449}
    .case-launcher-title{font-size:1.06rem;font-weight:800;color:#0b0d12;line-height:1.35}
    .case-launcher-desc{font-size:.82rem;color:#6b7280;margin-top:4px;line-height:1.55}
    .case-launcher-btn{flex-shrink:0;border:0;border-radius:12px;background:#1b3a5b;color:#fff;padding:12px 16px;font:inherit;font-size:.86rem;font-weight:800;cursor:pointer;box-shadow:0 6px 16px rgba(27,58,91,.16)}
    .case-launcher-btn:hover{background:#142b47}
    .case-launcher.dismissal .case-launcher-btn{background:#654a27;box-shadow:0 6px 16px rgba(101,74,39,.16)}
    .case-launcher.dismissal .case-launcher-btn:hover{background:#4f391d}
    .case-launcher.retirement .case-launcher-btn{background:#356449;box-shadow:0 6px 16px rgba(53,100,73,.16)}
    .case-launcher.retirement .case-launcher-btn:hover{background:#294f39}
    @media(max-width:700px){.case-launcher{align-items:stretch;flex-direction:column}.case-launcher-btn{width:100%;padding:13px 16px}}
  `;
  document.head.appendChild(style);
}

function injectHomeEntries() {
  const greeting = document.getElementById("greeting");
  if (!greeting || greeting.querySelector("[data-case-launcher-stack]")) return;

  const stack = document.createElement("div");
  stack.className = "case-launcher-stack";
  stack.dataset.caseLauncherStack = "true";
  stack.innerHTML = `
    <div class="case-launcher" data-wage-case-launcher>
      <div class="case-launcher-copy">
        <div class="case-launcher-kicker">내 사건 · 임금체불</div>
        <div class="case-launcher-title">회사에서 아직 못 받은 돈이 있나요?</div>
        <div class="case-launcher-desc">사건을 정리하면 받을 돈·공식 근거·증거·문서와 다음 행동까지 이어집니다.</div>
      </div>
      <button class="case-launcher-btn" type="button" data-open-wage>임금체불 사건 시작하기</button>
    </div>
    <div class="case-launcher dismissal" data-dismissal-case-launcher>
      <div class="case-launcher-copy">
        <div class="case-launcher-kicker">내 사건 · 해고·권고사직</div>
        <div class="case-launcher-title">해고인지 권고사직인지 애매한가요?</div>
        <div class="case-launcher-desc">종료 방식·사업장 규모·통보 시점을 기준으로 가능한 구제와 해고예고 문제를 나눠봅니다.</div>
      </div>
      <button class="case-launcher-btn" type="button" data-open-dismissal>해고·권고사직 사건 시작하기</button>
    </div>
    <div class="case-launcher retirement" data-retirement-case-launcher>
      <div class="case-launcher-copy">
        <div class="case-launcher-kicker">내 사건 · 퇴직금·퇴직연금</div>
        <div class="case-launcher-title">퇴직급여가 제대로 계산·지급됐는지 확인할까요?</div>
        <div class="case-launcher-desc">퇴직금·DB·DC 유형과 근속기간, 평균임금 또는 부담금 자료를 기준으로 예상 미지급액과 다음 행동을 정리합니다.</div>
      </div>
      <button class="case-launcher-btn" type="button" data-open-retirement>퇴직급여 사건 시작하기</button>
    </div>
  `;
  stack.querySelector("[data-open-wage]")?.addEventListener("click", goToWageIntake);
  stack.querySelector("[data-open-dismissal]")?.addEventListener("click", goToDismissalIntake);
  stack.querySelector("[data-open-retirement]")?.addEventListener("click", goToRetirementIntake);

  const before = greeting.querySelector(".he-label");
  if (before) greeting.insertBefore(stack, before);
  else greeting.appendChild(stack);
}

function connectSolveFlow() {
  const original = window.openSolveCase;
  if (typeof original !== "function" || original.__caseWorkspaceWrapped) return;

  function wrapped(key, ...rest) {
    if (key === "wage") return goToWageIntake();
    if (["fire", "dismissal"].includes(key)) return goToDismissalIntake();
    if (["retirement", "severance"].includes(key)) return goToRetirementIntake();
    return original.call(this, key, ...rest);
  }
  wrapped.__caseWorkspaceWrapped = true;
  window.openSolveCase = wrapped;
}

function enhanceExistingButtons() {
  document.addEventListener("click", (event) => {
    const wage = event.target?.closest?.("[data-wage-intake]");
    if (wage) {
      event.preventDefault();
      return goToWageIntake();
    }
    const dismissal = event.target?.closest?.("[data-dismissal-intake]");
    if (dismissal) {
      event.preventDefault();
      return goToDismissalIntake();
    }
    const retirement = event.target?.closest?.("[data-retirement-intake]");
    if (retirement) {
      event.preventDefault();
      return goToRetirementIntake();
    }
  });
}

function boot() {
  injectStyles();
  injectHomeEntries();
  connectSolveFlow();
  enhanceExistingButtons();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
