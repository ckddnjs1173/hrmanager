import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PORT = Number(process.env.E2E_PORT || 32179);
const BASE = `http://127.0.0.1:${PORT}`;

const server = spawn(process.execPath, ["server.js"], {
  env: {
    ...process.env,
    PORT: String(PORT),
    DB_PATH: ":memory:",
    NODE_ENV: "test",
    SITE_URL: BASE,
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
server.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });

async function waitForServer() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`server exited before E2E\n${serverOutput}`);
    try {
      const response = await fetch(`${BASE}/wage-intake`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`server did not become ready\n${serverOutput}`);
}

async function choose(page, name, value) {
  const input = page.locator(`input[name="${name}"][value="${value}"]`);
  assert.equal(await input.count(), 1, `choice missing: ${name}=${value}`);
  await input.locator("..").click();
  assert.equal(await input.isChecked(), true, `choice not selected: ${name}=${value}`);
}

function collectConsoleErrors(page) {
  const errors = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function fillVisibleWageIntake(page) {
  const values = {
    employmentEndDate: "2026-08-01",
    payDay: "매월 10일",
    unpaidPeriodStart: "2026-07-01",
    unpaidPeriodEnd: "2026-07-31",
    employmentStartDate: "2025-01-02",
    alreadyPaidAmount: "0",
  };
  for (const [name, value] of Object.entries(values)) {
    const input = page.locator(`[name="${name}"]`);
    if (await input.count() && await input.first().isVisible()) await input.first().fill(value);
  }
  const wageAmount = page.locator('[name="wageAmount"]');
  if (await wageAmount.count() && await wageAmount.first().isVisible()) {
    await page.locator('[name="wageType"]').selectOption("monthlyBasePay");
    await wageAmount.first().fill("3000000");
  }
}

async function completeWageJourney(browser) {
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await context.newPage();
  const consoleErrors = collectConsoleErrors(page);
  await page.goto(`${BASE}/wage-intake`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: /못 받은 임금을/ }).waitFor();
  await choose(page, "employmentStatus", "resigned");
  await choose(page, "unpaidItems", "월급");
  await page.getByRole("button", { name: "사건 만들고 계속하기" }).click();

  for (let step = 0; step < 6; step += 1) {
    if (await page.locator(".workspace").count()) break;
    await page.locator("form[data-intake-form]").waitFor();
    await fillVisibleWageIntake(page);
    await page.getByRole("button", { name: "저장하고 다음" }).click();
    await page.waitForTimeout(80);
  }

  await page.locator(".workspace").waitFor();
  assert.match(await page.locator("#facts").innerText(), /2026-07-01 ~ 2026-07-31/);
  for (const key of ["overtimeWork", "nightWork", "holidayWork", "unusedAnnualLeave"]) await choose(page, key, "false");
  await page.getByRole("button", { name: "추가 수당 정보 저장" }).click();

  await page.locator("#money").waitFor();
  assert.match(await page.locator("#money").innerText(), /3,000,000원/);
  assert.match(await page.locator("#sources").innerText(), /최저임금위원회/);
  await page.locator('select[name="payslip"]').selectOption("have");
  await page.locator('select[name="bankHistory"]').selectOption("planned");
  await page.locator('select[name="employmentContract"]').selectOption("have");
  await page.getByRole("button", { name: "증거 상태 저장" }).click();

  await page.getByRole("button", { name: /내용증명/ }).click();
  await page.locator("#case-doc-preview").waitFor();
  assert.match(await page.locator("#case-doc-preview pre").innerText(), /3,000,000원/);
  await page.locator("#case-doc-preview [data-close]").click();
  await page.getByRole("button", { name: "사건 요약 복사" }).click();
  await page.getByRole("button", { name: "사건 요약 복사됨" }).waitFor();
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /인사야 임금체불 사건 요약/);
  assert.match(await page.locator("#procedure").innerText(), /고용노동부 노동포털/);
  assert.deepEqual(consoleErrors, [], `wage browser console errors:\n${consoleErrors.join("\n")}`);
  await context.close();
}

async function completeDismissalJourney(browser) {
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await context.newPage();
  const consoleErrors = collectConsoleErrors(page);
  await page.goto(`${BASE}/dismissal-intake`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: /회사와의 종료 경위를/ }).waitFor();

  await choose(page, "separationType", "dismissal");
  await page.locator('[name="employmentStartDate"]').fill("2025-01-01");
  await page.locator('[name="effectiveDate"]').fill("2026-08-01");
  await page.locator('[name="workplaceEmployeeCount"]').fill("8");
  await page.getByRole("button", { name: "사건 만들고 적용범위 확인" }).click();
  await page.locator(".dismissal-workspace").waitFor();

  await page.locator('[name="noticeDate"]').fill("2026-07-20");
  await page.locator('[name="writtenNoticeReceived"]').selectOption("false");
  await page.locator('[name="noticePayPaid"]').selectOption("false");
  await page.locator('[name="employerReason"]').fill("업무성과를 이유로 종료 통보");
  await page.getByRole("button", { name: "사실 저장·다시 판단" }).click();

  await page.locator('[name="ordinaryDailyWage"]').waitFor();
  await page.locator('[name="ordinaryDailyWage"]').fill("120000");
  await page.getByRole("button", { name: "사실 저장·다시 판단" }).click();
  await page.waitForTimeout(100);

  const assessment = await page.locator(".assessment-list").innerText();
  assert.match(assessment, /상시 5명 이상/);
  assert.match(assessment, /신청 가능성 검토/);
  assert.match(assessment, /3,600,000원/);
  const sourceText = await page.locator("#dismissal-sources").innerText();
  assert.match(sourceText, /근로기준법 제27조/);
  assert.match(sourceText, /근로기준법 제28조/);
  assert.match(sourceText, /중앙노동위원회/);

  await page.locator('select[name="dismissalNotice"]').selectOption("have");
  await page.locator('select[name="messagesWithEmployer"]').selectOption("have");
  await page.locator('select[name="employmentContract"]').selectOption("have");
  await page.getByRole("button", { name: "증거 상태 저장" }).click();

  await page.locator("#dismissal-documents").waitFor();
  await page.getByRole("button", { name: /부당해고 등 구제신청서/ }).click();
  await page.locator("#dismissal-doc-preview").waitFor();
  assert.match(await page.locator("#dismissal-doc-preview pre").innerText(), /2026-08-01/);
  await page.locator("#dismissal-doc-preview [data-close]").click();

  await page.getByRole("button", { name: "사건 요약 복사" }).click();
  await page.getByRole("button", { name: "사건 요약 복사됨" }).waitFor();
  const report = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(report, /인사야 해고·권고사직 사건 요약/);
  assert.match(report, /3,600,000원/);
  assert.match(await page.locator("#dismissal-procedures").innerText(), /중앙노동위원회/);
  assert.deepEqual(consoleErrors, [], `dismissal browser console errors:\n${consoleErrors.join("\n")}`);
  await context.close();
}

async function verifyMobileLayout(browser, path, buttonName) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await context.newPage();
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: buttonName }).waitFor();
  const metrics = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert.ok(metrics.scrollWidth <= metrics.viewport + 1, `${path} mobile horizontal overflow: ${JSON.stringify(metrics)}`);
  assert.equal(await page.getByRole("button", { name: buttonName }).isVisible(), true);
  await context.close();
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  await completeWageJourney(browser);
  await completeDismissalJourney(browser);
  await verifyMobileLayout(browser, "/wage-intake", "사건 만들고 계속하기");
  await verifyMobileLayout(browser, "/dismissal-intake", "사건 만들고 적용범위 확인");
  console.log("✅ Chromium E2E passed: wage + dismissal desktop journeys and mobile viewports");
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 100));
  if (server.exitCode === null) server.kill("SIGKILL");
}
