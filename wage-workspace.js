import { createCaseAccessClient, escapeHtml as esc, formatWon as won, openAccessibleDocumentPreview } from "./case-client-core.js";

const ROOT = document.getElementById("wageApp");
const STORAGE_KEY = "insaya:wage-case-session";
const MOUNT_ID = "wage-workspace-resources";
const access = createCaseAccessClient({ storageKey: STORAGE_KEY });

let rendering = false;
let closeActivePreview = null;
const session = access.getSession;
const api = access.api;

function valueOrBlank(value) {
  return value === null || value === undefined ? "" : String(value);
}

function moneyCards(money) {
  return [
    ["확인된 미지급 원금", won(money?.principal)],
    ["법정 가산 추정", won(money?.premiumEstimate)],
    ["지연이자 추정", won(money?.delayInterestEstimate)],
    ["현재 계산 가능 합계", won(money?.knownTotalEstimate)],
  ].map(([label, value]) => `<div class="money-stat"><span>${esc(label)}</span><b>${esc(value)}</b></div>`).join("");
}

function moneyForm(facts = {}, money = {}) {
  const missing = new Set(money.missingFacts || []);
  return `
    <form class="money-form" data-money-form>
      <div class="money-fields">
        <label><span>미지급 예정액</span><input class="case-input" type="number" min="0" step="1" name="expectedUnpaidAmount" value="${esc(valueOrBlank(facts.expectedUnpaidAmount))}" placeholder="부분월·복합임금이면 입력" /></label>
        <label><span>상시근로자 수</span><input class="case-input" type="number" min="0" step="1" name="workplaceEmployeeCount" value="${esc(valueOrBlank(facts.workplaceEmployeeCount))}" placeholder="예: 8" /></label>
        <label><span>통상시급</span><input class="case-input" type="number" min="0" step="1" name="ordinaryHourlyWage" value="${esc(valueOrBlank(facts.ordinaryHourlyWage))}" placeholder="가산수당 계산 시" /></label>
        <label><span>미지급 근로시간</span><input class="case-input" type="number" min="0" step="0.1" name="unpaidWorkHours" value="${esc(valueOrBlank(facts.unpaidWorkHours))}" placeholder="시급제일 때" /></label>
        <label><span>연장근로 시간</span><input class="case-input" type="number" min="0" step="0.1" name="overtimeHours" value="${esc(valueOrBlank(facts.overtimeHours))}" /></label>
        <label><span>야간근로 시간</span><input class="case-input" type="number" min="0" step="0.1" name="nightHours" value="${esc(valueOrBlank(facts.nightHours))}" /></label>
        <label><span>휴일근로 8시간 이내</span><input class="case-input" type="number" min="0" step="0.1" name="holidayHoursWithin8" value="${esc(valueOrBlank(facts.holidayHoursWithin8))}" /></label>
        <label><span>휴일근로 8시간 초과</span><input class="case-input" type="number" min="0" step="0.1" name="holidayHoursOver8" value="${esc(valueOrBlank(facts.holidayHoursOver8))}" /></label>
      </div>
      ${missing.size ? `<div class="money-missing">추가 확인: ${[...missing].map(esc).join(", ")}</div>` : ""}
      <div class="case-actions"><button class="btn primary" type="submit">금액 정보 저장·재계산</button></div>
    </form>`;
}

function sourcesSection(legal = {}) {
  const sources = Array.isArray(legal.sources) ? legal.sources : [];
  return `<section class="workspace-card wide" id="sources">
    <div class="resource-head"><div><h3>적용 기준과 공식 근거</h3><p>사건 기간 기준으로 서버가 선택한 근거입니다.</p></div><span class="source-date">기준일 ${esc(legal.referenceDate || "미확인")}</span></div>
    <div class="source-list">${sources.length ? sources.map((source) => `<a class="source-row" href="${esc(source.url)}" target="_blank" rel="noopener noreferrer"><span><b>${esc(source.article || source.title)}</b><small>${esc(source.authority)} · 확인 ${esc(source.verifiedAt || legal.verifiedAt || "")}</small></span><span aria-hidden="true">↗</span></a>`).join("") : '<div class="resource-empty">현재 사건 기준일에 연결된 공식 근거가 없습니다.</div>'}</div>
    ${(legal.warnings || []).length ? `<div class="resource-warn">검토 필요: ${(legal.warnings || []).map(esc).join(", ")}</div>` : ""}
  </section>`;
}

function documentsSection(documents = []) {
  return `<section class="workspace-card wide" id="documents"><div class="resource-head"><div><h3>이 사건에서 바로 만들 문서</h3><p>사건의 기간·항목·계산 금액을 자동으로 채운 참고용 초안을 만듭니다.</p></div></div><div class="document-grid">${documents.map((doc) => `<button class="document-card" type="button" data-doc="${esc(doc.templateKey)}"><span class="doc-state">${doc.status === "ready" ? "초안 가능" : "금액 확인 후"}</span><b>${esc(doc.title)}</b><small>${esc(doc.description)}</small></button>`).join("") || '<div class="resource-empty">추천 문서가 없습니다.</div>'}</div></section>`;
}

function procedureSection(procedure) {
  if (!procedure) return "";
  return `<section class="workspace-card wide" id="procedure"><div class="resource-head"><div><h3>공식 절차</h3><p>${esc(procedure.description)}</p></div></div><div class="procedure-box"><div><b>${esc(procedure.title)}</b><small>${esc(procedure.authority)} · 확인 ${esc(procedure.verifiedAt)}</small></div><a class="btn primary" href="${esc(procedure.url)}" target="_blank" rel="noopener noreferrer">노동포털에서 확인 ↗</a></div></section>`;
}

function renderMount(result) {
  const grid = ROOT.querySelector(".workspace-grid");
  if (!grid) return;
  grid.querySelector(`#${MOUNT_ID}`)?.remove();

  const mount = document.createElement("div");
  mount.id = MOUNT_ID;
  mount.className = "workspace-resources";
  mount.innerHTML = `
    <section class="workspace-card wide" id="money">
      <div class="resource-head"><div><h3>받을 돈</h3><p>입력 사실과 사건 기준일을 사용한 1차 계산입니다.</p></div><span class="money-status">${result.money?.status === "estimated" ? "계산됨" : "보완 필요"}</span></div>
      <div class="money-stats">${moneyCards(result.money)}</div>
      <div class="money-meta">적용 기준일 ${esc(result.money?.referenceDate || "미확인")} · 계산일 ${esc(result.money?.asOfDate || "미확인")}</div>
      ${moneyForm(result.case?.facts || {}, result.money || {})}
      <div class="money-limit">${(result.money?.limitations || []).map((item) => `<p>${esc(item)}</p>`).join("")}</div>
    </section>
    ${sourcesSection(result.legal)}
    ${documentsSection(result.documents)}
    ${procedureSection(result.officialProcedure)}
  `;

  const firstWide = grid.querySelector(".workspace-card.wide");
  if (firstWide) grid.insertBefore(mount, firstWide);
  else grid.appendChild(mount);

  mount.querySelector("[data-money-form]")?.addEventListener("submit", saveMoney);
  mount.querySelectorAll("[data-doc]").forEach((button) => button.addEventListener("click", () => previewDocument(button.dataset.doc)));
}

async function saveMoney(event) {
  event.preventDefault();
  const current = session();
  if (!current) return;
  const form = event.currentTarget;
  const patch = {};
  for (const field of form.elements) {
    if (!field.name || field.tagName === "BUTTON") continue;
    if (field.value === "") continue;
    const n = Number(field.value);
    if (Number.isFinite(n) && n >= 0) patch[field.name] = n;
  }

  const button = form.querySelector("button[type=submit]");
  if (button) button.disabled = true;
  try {
    await api(`/api/cases/${encodeURIComponent(current.id)}/wage-intake`, {
      method: "PATCH",
      body: JSON.stringify({ facts: patch }),
    });
    location.reload();
  } catch {
    if (button) button.disabled = false;
    alert("금액 정보를 저장하지 못했습니다. 다시 시도해 주세요.");
  }
}

function closePreview() {
  if (closeActivePreview) {
    const close = closeActivePreview;
    closeActivePreview = null;
    close();
    return;
  }
  document.getElementById("case-doc-preview")?.remove();
}

async function previewDocument(templateKey) {
  const current = session();
  if (!current) return;
  try {
    const result = await api(`/api/cases/${encodeURIComponent(current.id)}/wage-document/${encodeURIComponent(templateKey)}`, {
      method: "POST",
      body: JSON.stringify({ values: {} }),
    });
    closePreview();
    closeActivePreview = openAccessibleDocumentPreview({
      previewId: "case-doc-preview",
      title: result.document?.title || "문서 초안",
      text: result.document?.text || "",
      closeOnBackdrop: true,
    });
  } catch {
    alert("문서 초안을 만들지 못했습니다. 사건 정보를 확인해 주세요.");
  }
}

async function enhanceWorkspace() {
  if (rendering || !ROOT.querySelector(".workspace") || ROOT.querySelector(`#${MOUNT_ID}`)) return;
  const current = session();
  if (!current) return;
  rendering = true;
  try {
    const result = await api(`/api/cases/${encodeURIComponent(current.id)}/wage-intake`);
    renderMount(result);
  } catch {
    // 기본 Case Workspace는 그대로 유지한다. 보조 리소스 로딩 실패가 핵심 사건 화면을 막지 않는다.
  } finally {
    rendering = false;
  }
}

const observer = new MutationObserver(() => enhanceWorkspace());
observer.observe(ROOT, { childList: true, subtree: true });
enhanceWorkspace();
