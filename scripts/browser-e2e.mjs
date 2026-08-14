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
    if (server.exitCode !== null) {
      throw new Error(`server exited before E2E\n${serverOutput}`);
    }
    try {
      const response = await fetch(`${BASE}/wage-intake`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`server did not become ready\n${serverOutput}`);
}

async function fillVisibleIntake(page) {
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
    if (await input.count() && await input.first().isVisible()) {
      await input.first().fill(value);
    }
  }

  const wageAmount = page.locator('[name="wageAmount"]');
  if (await wageAmount.count() && await wageAmount.first().isVisible()) {
    await page.locator('[name="wageType"]').selectOption("monthlyBasePay");
    await wageAmount.first().fill("3000000");
  }
}

async function completeDesktopJourney(browser) {
  const context = await browser.newContext({
    viewport: { width: 1365, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto(`${BASE}/wage-intake`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: /못 받은 임금을/ }).waitFor();

  await page.locator('input[name="employmentStatus"][value="resigned"]').check();
  await page.locator('input[name="unpaidItems"][value="월급"]').check();
  await page.getByRole("button", { name: "사건 만들고 계속하기" }).click();

  for (let step = 0; step < 6; step += 1) {
    if (await page.locator(".workspace").count()) break;
    await page.locator("form[data-intake-form]").waitFor();
    await fillVisibleIntake(page);
    await page.getByRole("button", { name: "저장하고 다음" }).click();
    await page.waitForTimeout(80);
  }

  await page.locator(".workspace").waitFor();
  await page.getByText("임금체불 · 진행 중").waitFor();
  assert.match(await page.locator("#facts").innerText(), /2026-07-01 ~ 2026-07-31/);

  for (const key of ["overtimeWork", "nightWork", "holidayWork", "unusedAnnualLeave"]) {
    await page.locator(`input[name="${key}"][value="false"]`).check();
  }
  await page.getByRole("button", { name: "추가 수당 정보 저장" }).click();

  await page.locator("#money").waitFor();
  const moneyText = await page.locator("#money").innerText();
  assert.match(moneyText, /3,000,000원/);
  assert.match(moneyText, /적용 기준일 2026-07-31/);

  const sourceText = await page.locator("#sources").innerText();
  assert.match(sourceText, /최저임금위원회/);
  assert.match(sourceText, /국가법령정보센터/);

  await page.locator('select[name="payslip"]').selectOption("have");
  await page.locator('select[name="bankHistory"]').selectOption("planned");
  await page.locator('select[name="employmentContract"]').selectOption("have");
  await page.getByRole("button", { name: "증거 상태 저장" }).click();

  await page.locator("#documents").waitFor();
  await page.getByRole("button", { name: /내용증명/ }).click();
  await page.locator("#case-doc-preview").waitFor();
  const previewText = await page.locator("#case-doc-preview pre").innerText();
  assert.match(previewText, /3,000,000원/);
  assert.match(previewText, /2026-07-01 ~ 2026-07-31/);
  await page.locator("#case-doc-preview [data-close]").click();

  await page.getByRole("button", { name: "사건 요약 복사" }).click();
  await page.getByRole("button", { name: "사건 요약 복사됨" }).waitFor();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(clipboard, /인사야 임금체불 사건 요약/);
  assert.match(clipboard, /현재 계산 가능 합계: 3,000,000원/);

  const procedure = page.locator("#procedure");
  assert.match(await procedure.innerText(), /고용노동부 노동포털/);
  assert.equal(await page.locator('a[href^="https://labor.moel.go.kr"]', { hasText: /노동포털/ }).count(), 1);

  assert.deepEqual(consoleErrors, [], `browser console errors:\n${consoleErrors.join("\n")}`);
  await context.close();
}

async function verifyMobileLayout(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/wage-intake`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "사건 만들고 계속하기" }).waitFor();

  const metrics = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(metrics.scrollWidth <= metrics.viewport + 1, `mobile horizontal overflow: ${JSON.stringify(metrics)}`);
  assert.equal(await page.getByRole("button", { name: "사건 만들고 계속하기" }).isVisible(), true);
  await context.close();
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  await completeDesktopJourney(browser);
  await verifyMobileLayout(browser);
  console.log("✅ Chromium E2E passed: wage desktop journey + mobile viewport");
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 100));
  if (server.exitCode === null) server.kill("SIGKILL");
}
