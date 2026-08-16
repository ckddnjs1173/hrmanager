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
    await page.getByText("검증 완료").first().waitFor();
    await page.getByText("+ Rule 변경 제안 작성").click();

    await page.locator("#ruleKey").fill("minimum_wage.2027");
    await page.locator("#currentRuleVersion").fill("2026");
    await page.locator("#proposedRuleVersion").fill("2027");
    await page.locator("#proposedEffectiveFrom").fill("2027-01-01");
    await page.locator("#proposedChange").fill(JSON.stringify({ category: "minimum_wage", hourly: 11000, sourceId: "source.minimum_wage_commission.annual" }));
    await page.locator("#proposalForm button[type=submit]").click();
    await page.getByText("minimum_wage.2027").waitFor();

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
  } finally {
    await assertPool.end();
  }

  console.log("Legal Admin browser E2E passed: admin auth -> candidate -> human verification -> fixture-gated proposal -> READY_FOR_IMPLEMENTATION with no runtime activation.");
} finally {
  server.kill("SIGTERM");
  await new Promise((resolve) => {
    if (server.exitCode !== null) return resolve();
    server.once("exit", resolve);
    setTimeout(() => { if (server.exitCode === null) server.kill("SIGKILL"); }, 3000).unref();
  });
}
