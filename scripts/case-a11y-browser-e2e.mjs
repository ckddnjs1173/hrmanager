import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PORT = Number(process.env.A11Y_E2E_PORT || 32181);
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
    if (server.exitCode !== null) throw new Error(`server exited before accessibility E2E\n${serverOutput}`);
    try {
      const response = await fetch(`${BASE}/retirement-intake`);
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

await waitForServer();
const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({
    viewport: { width: 1365, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(`${BASE}/retirement-intake`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "퇴직급여 사건 만들기" }).waitFor();

  await choose(page, "benefitType", "severance_pay");
  await page.locator('[name="employmentStartDate"]').fill("2024-01-01");
  await page.locator('[name="retirementDate"]').fill("2026-08-01");
  await page.locator('[name="averageWeeklyScheduledHours"]').fill("40");
  await page.locator('[name="hadUnder15HourPeriods"]').selectOption("false");
  await page.getByRole("button", { name: "퇴직급여 사건 만들기" }).click();
  await page.locator(".retirement-workspace").waitFor();

  await page.locator('[name="hasAverageWageExcludedPeriod"]').selectOption("false");
  await page.getByRole("button", { name: "계산 정보 저장·재계산" }).click();
  await page.locator('[name="threeMonthWageTotal"]').waitFor();
  await page.locator('[name="threeMonthWageTotal"]').fill("9200000");
  await page.locator('[name="annualBonusTotal12m"]').fill("1200000");
  await page.locator('[name="annualLeaveAllowanceForAverageWage"]').fill("400000");
  await page.locator('[name="ordinaryDailyWage"]').fill("100000");
  await page.locator('[name="amountAlreadyPaid"]').fill("0");
  await page.getByRole("button", { name: "계산 정보 저장·재계산" }).click();
  await page.locator("#retirement-documents").waitFor();

  const trigger = page.getByRole("button", { name: /퇴직급여 지급 요청 내용증명/ });
  await trigger.focus();
  assert.equal(await trigger.evaluate((element) => document.activeElement === element), true, "document trigger should be focused before opening dialog");
  await trigger.click();

  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  assert.equal(await dialog.getAttribute("aria-modal"), "true");
  const closeButton = page.getByRole("button", { name: "문서 미리보기 닫기" });
  assert.equal(await closeButton.evaluate((element) => document.activeElement === element), true, "dialog close button should receive initial focus");

  await page.keyboard.press("Escape");
  await page.locator("#retirement-doc-preview").waitFor({ state: "detached" });
  assert.equal(await trigger.evaluate((element) => document.activeElement === element), true, "focus should return to the document trigger after closing");
  assert.deepEqual(errors, [], `accessibility browser console errors:\n${errors.join("\n")}`);

  await context.close();
  console.log("Case accessibility browser E2E passed");
} finally {
  await browser.close();
  server.kill("SIGTERM");
}
