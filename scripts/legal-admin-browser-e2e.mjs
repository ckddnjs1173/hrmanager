import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { createPostgresPool } from "../lib/postgres-client.js";
import { applyPostgresMigrations } from "../lib/postgres-migrations.js";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
const PORT = Number(process.env.LEGAL_ADMIN_E2E_PORT || 32271);
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN_TOKEN = "legal-admin-browser-token";

const migrationPool = createPostgresPool({ applicationName: "insaya-legal-admin-browser-migrate" });
await applyPostgresMigrations(migrationPool, { logger: { log() {} } });
await migrationPool.end();

const server = spawn(process.execPath, ["server.js"], {
  env: {
    ...process.env,
    PORT: String(PORT),
    SITE_URL: BASE,
    STORAGE_DRIVER: "postgres",
    SESSION_SECRET: "legal-admin-browser-session-secret",
    ADMIN_TOKEN,
    NODE_ENV: "test",
    REQUIRE_PERSISTENT_DB: "0",
    PERSISTENT_STORAGE: "0",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
server.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });

async function waitForServer() {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`server exited before Legal Admin browser E2E\n${serverOutput}`);
    try {
      const response = await fetch(`${BASE}/admin-legal.html`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Legal Admin server did not become ready\n${serverOutput}`);
}

function collectConsoleErrors(page) {
  const errors = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

try {
  await waitForServer();
  const unauth = await fetch(`${BASE}/api/admin/legal/meta`);
  assert.equal(unauth.status, 401);

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1050 } });
    const consoleErrors = collectConsoleErrors(page);
    await page.goto(`${BASE}/admin-legal.html`, { waitUntil: "domcontentloaded" });

    await page.locator("#login").waitFor({ state: "visible" });
    await page.locator("#adminToken").fill(ADMIN_TOKEN);
    await page.locator("#loginButton").click();
    await page.locator("#app").waitFor({ state: "visible" });
    consoleErrors.length = 0;

    const runtimeAllowed = await page.evaluate(async () => {
      const response = await fetch("/api/admin/legal/meta", { credentials: "same-origin" });
      return (await response.json()).runtimeActivationAllowed;
    });
    assert.equal(runtimeAllowed, false);

    await page.locator("#operator").fill("Legal QA");
    await page.locator("#createCandidateBox").evaluate((node) => { node.open = true; });
    await page.locator("#sourceType").selectOption("REGULATION_NOTICE");
    await page.locator("#canonicalSourceId").selectOption("source.minimum_wage_commission.annual");
    await page.locator("#authority").fill("최저임금위원회");
    await page.locator("#candidateTitle").fill("2027년 적용 최저임금 변경 후보 - Admin E2E");
    await page.locator("#officialUrl").fill("https://minimumwage.go.kr/minWage/policy/decisionMain.do");
    await page.locator("#sourcePublishedAt").fill("2026-08-17");
    await page.locator("#effectiveFrom").fill("2027-01-01");
    await page.locator("#changeNote").fill("내부 Admin 검토 큐 브라우저 회귀 테스트");
    await page.locator("#sourceSnapshot").fill(JSON.stringify({ capturedAt: "2026-08-17T02:30:00+09:00", sourceVersion: "admin-e2e-v1", proposedHourly: 11000 }));
    await page.locator("#candidateForm button[type=submit]").click();

    await page.getByText("2027년 적용 최저임금 변경 후보 - Admin E2E").first().waitFor();
    await page.getByRole("button", { name: "검토 요청" }).waitFor();
    await page.getByRole("button", { name: "검토 요청" }).click();
    await page.getByRole("button", { name: "검증 완료" }).waitFor();

    await page.locator("#reviewNote").fill("공식 출처, 공표일, 시행일, 변경값 수동 대조 완료");
    await page.getByRole("button", { name: "검증 완료" }).click();
    const verifiedStatus = page.locator("#detailView .status.VERIFIED").first();
    await verifiedStatus.waitFor({ state: "visible" });
    assert.equal((await verifiedStatus.innerText()).trim(), "검증 완료");
    await page.getByText("+ Rule 변경 제안 작성").click();

    await page.locator("#ruleKey").fill("minimum_wage.2027");
    await page.locator("#currentRuleVersion").fill("2026");
    await page.locator("#proposedRuleVersion").fill("2027");
    await page.locator("#proposedEffectiveFrom").fill("2027-01-01");
    await page.locator("#proposedChange").fill(JSON.stringify({ category: "minimum_wage", hourly: 11000, sourceId: "source.minimum_wage_commission.annual" }));
    await page.locator("#proposalForm button[type=submit]").click();
    const proposalHeader = page.locator("#detailView .proposal-head b", { hasText: "minimum_wage.2027" }).first();
    await proposalHeader.waitFor({ state: "visible" });

    const fixtures = [
      { name: "day-before-effective-date", input: { date: "2026-12-31" }, expected: { version: "2026" } },
      { name: "effective-date", input: { date: "2027-01-01" }, expected: { version: "2027", hourly: 11000 } },
      { name: "day-after-effective-date", input: { date: "2027-01-02" }, expected: { version: "2027", hourly: 11000 } },
    ];
    await page.locator("textarea[data-fixture-for]").fill(JSON.stringify(fixtures));
    await page.getByRole("button", { name: "Fixture 저장" }).click();
    await page.getByRole("button", { name: "Rule 제안 검증" }).waitFor();
    await page.getByRole("button", { name: "Rule 제안 검증" }).click();
    await page.getByRole("button", { name: "READY_FOR_IMPLEMENTATION으로 이동" }).waitFor();
    await page.getByRole("button", { name: "READY_FOR_IMPLEMENTATION으로 이동" }).click();

    await page.getByText("구현 대기 상태입니다.").waitFor();
    const detailText = await page.locator("#detailView").innerText();
    assert.match(detailText, /READY_FOR_IMPLEMENTATION|구현 대기/);
    assert.match(detailText, /운영 Rule을 활성화할 수 없습니다/);
    assert.doesNotMatch(detailText, /ACTIVE로 이동|운영 반영|자동 활성화 허용/);

    await page.locator("#monitorTab").click();
    await page.locator("#monitorMain").waitFor({ state: "visible" });
    assert.equal(await page.locator("#candidateMain").isHidden(), true);
    const monitorText = await page.locator("#monitorMain").innerText();
    assert.match(monitorText, /감지만 자동화합니다/);
    assert.match(monitorText, /자동 검증·Rule 제안·운영 반영은 금지/);

    await page.locator("#createWatchBox").evaluate((node) => { node.open = true; });
    await page.locator("#watchCanonicalSourceId option[value='source.lsa.article36']").waitFor({ state: "attached" });
    assert.equal(await page.locator("#createWatchBox input[type=url]").count(), 0, "watch UI must not accept arbitrary URL input");
    await page.locator("#watchCanonicalSourceId").selectOption("source.lsa.article36");
    await page.locator("#watchSourceType").selectOption("STATUTE");
    assert.match(await page.locator("#watchOfficialUrl").innerText(), /^https:\/\/(www\.)?law\.go\.kr\//);
    await page.locator("#watchForm button[type=submit]").click();

    const watchItem = page.locator("#watchList [data-watch-id]").filter({ hasText: "근로기준법 제36조" }).first();
    await watchItem.waitFor({ state: "visible" });
    await watchItem.click();
    await page.locator("#monitorDetailView").waitFor({ state: "visible" });
    let monitorDetailText = await page.locator("#monitorDetailView").innerText();
    assert.match(monitorDetailText, /아직 baseline이 없습니다/);
    assert.match(monitorDetailText, /자동 검토 금지/);
    assert.match(monitorDetailText, /Runtime 자동 반영 금지/);

    await page.getByRole("button", { name: "Watch 중지" }).click();
    await page.getByRole("button", { name: "Watch 재개" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Watch 재개" }).click();
    await page.getByRole("button", { name: "수동 점검 실행" }).waitFor({ state: "visible" });

    let interceptedRun = false;
    await page.route("**/api/admin/legal/monitor/watches/*/run", async (route) => {
      interceptedRun = true;
      const request = route.request();
      assert.equal(request.method(), "POST");
      assert.equal(request.postDataJSON().operator, "Legal QA");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          run: { runId: "lsr_ui_e2e", status: "BASELINED", candidateId: null },
          automaticReviewAllowed: false,
          runtimeActivationAllowed: false,
        }),
      });
    });
    await page.getByRole("button", { name: "수동 점검 실행" }).click();
    await page.locator("#toast").filter({ hasText: "Baseline 저장" }).waitFor({ state: "visible" });
    assert.equal(interceptedRun, true);

    await page.locator("#candidateTab").click();
    await page.locator("#candidateMain").waitFor({ state: "visible" });
    assert.equal(await page.locator("#monitorMain").isHidden(), true);
    assert.deepEqual(consoleErrors, [], `Legal Admin browser console errors:\n${consoleErrors.join("\n")}`);
  } finally {
    await browser.close();
  }

  const assertPool = createPostgresPool({ applicationName: "insaya-legal-admin-browser-assert" });
  try {
    const candidate = await assertPool.query("SELECT status FROM legal_change_candidates WHERE title=$1", ["2027년 적용 최저임금 변경 후보 - Admin E2E"]);
    assert.equal(candidate.rowCount, 1);
    assert.equal(candidate.rows[0].status, "VERIFIED");
    const proposals = await assertPool.query("SELECT status,fixture_evidence_hash FROM legal_rule_change_proposals WHERE rule_key='minimum_wage.2027'");
    assert.equal(proposals.rowCount, 1);
    assert.equal(proposals.rows[0].status, "READY_FOR_IMPLEMENTATION");
    assert.match(proposals.rows[0].fixture_evidence_hash, /^[a-f0-9]{64}$/);
    const active = await assertPool.query("SELECT COUNT(*)::integer AS count FROM legal_rule_change_proposals WHERE status='ACTIVE'");
    assert.equal(active.rows[0].count, 0);

    const watches = await assertPool.query("SELECT source_type,enabled,last_content_hash FROM legal_source_watches WHERE canonical_source_id=$1", ["source.lsa.article36"]);
    assert.equal(watches.rowCount, 1);
    assert.equal(watches.rows[0].source_type, "STATUTE");
    assert.equal(watches.rows[0].enabled, true);
    assert.equal(watches.rows[0].last_content_hash, null, "intercepted UI run must not perform an external fetch or mutate monitor baseline");
    const adapterCandidates = await assertPool.query("SELECT COUNT(*)::integer AS count FROM legal_change_candidates WHERE detected_by='OFFICIAL_ADAPTER'");
    assert.equal(adapterCandidates.rows[0].count, 0, "UI browser test must not create an automatic candidate");
  } finally {
    await assertPool.end();
  }

  console.log("Legal Admin browser E2E passed: candidate governance plus canonical-only monitor watch UI, toggle and manual-run control with no external network or runtime activation.");
} finally {
  server.kill("SIGTERM");
  await new Promise((resolve) => {
    if (server.exitCode !== null) return resolve();
    server.once("exit", resolve);
    setTimeout(() => { if (server.exitCode === null) server.kill("SIGKILL"); }, 3000).unref();
  });
}
