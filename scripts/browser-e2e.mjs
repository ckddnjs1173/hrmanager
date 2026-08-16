import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const PORT = 4173;
const BASE = `http://127.0.0.1:${PORT}`;
const server = spawn(process.execPath, ["server.js"], {
  env: { ...process.env, PORT: String(PORT), DB_PATH: ":memory:" },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
server.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });

async function waitForServer() {
  for (let i = 0; i < 100; i += 1) {
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error(`server did not start\n${serverOutput}`);
}

function collectConsoleErrors(page) {
  const errors = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function choose(page, name, value) {
  const field = page.locator(`[name="${name}"]`);
  if (!await field.count()) return;
  const first = field.first();
  const tag = await first.evaluate((element) => element.tagName);
  const type = await first.getAttribute("type");
  if (tag === "SELECT") await first.selectOption(value);
  else if (type === "radio") await page.locator(`[name="${name}"][value="${value}"]`).check();
  else await first.fill(value);
}

async function fillVisibleWageIntake(page) {
  const values = {
    employmentStartDate: "2025-01-02",
    employmentEndDate: "2026-08-01",
    payDay: "매월 10일",
    unpaidPeriodStart: "2026-07-01",
    unpaidPeriodEnd: "2026-07-31",
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
  const moneyText = await page.locator("#money").innerText();
  assert.match(moneyText, /3,000,000원/);
  const currentTotal = (await page.locator("#money .money-stat").nth(3).locator("b").innerText()).trim();
  assert.match(currentTotal, /^\d[\d,]*원$/);
  assert.match(await page.locator("#sources").innerText(), /최저임금위원회/);
  await page.locator('select[name="payslip"]').selectOption("have");
  await page.locator('select[name="bankHistory"]').selectOption("planned");
  await page.locator('select[name="employmentContract"]').selectOption("have");
  await page.getByRole("button", { name: "증거 상태 저장" }).click();

  await page.getByRole("button", { name: /내용증명/ }).click();
  await page.locator("#case-doc-preview").waitFor();
  assert.ok((await page.locator("#case-doc-preview pre").innerText()).includes(currentTotal));
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
  await page.getByRole("button", { name: "사건 만들고 계속하기" }).click();
  for (let step = 0; step < 5; step += 1) {
    if (await page.locator(".workspace").count()) break;
    await page.locator("form[data-intake-form]").waitFor();
    const fields = {
      employmentStartDate: "2026-01-01",
      employmentEndDate: "2026-08-01",
      dismissalNoticeDate: "2026-07-20",
      workplaceEmployeeCount: "12",
      monthlyWage: "3200000",
    };
    for (const [name, value] of Object.entries(fields)) {
      const input = page.locator(`[name="${name}"]`);
      if (await input.count() && await input.first().isVisible()) await input.first().fill(value);
    }
    for (const [name, value] of [["writtenNotice", "no"], ["dismissalReason", "경영상 이유라고만 들었습니다"], ["consentedToResignation", "no"], ["pressureOrCoercion", "yes"]]) {
      const field = page.locator(`[name="${name}"]`);
      if (await field.count() && await field.first().isVisible()) await choose(page, name, value);
    }
    await page.getByRole("button", { name: "저장하고 다음" }).click();
    await page.waitForTimeout(80);
  }
  await page.locator(".workspace").waitFor();
  assert.match(await page.locator("#assessment").innerText(), /부당해고|해고예고|서면/);
  assert.match(await page.locator("#sources").innerText(), /근로기준법/);
  await page.locator('select[name="employmentContract"]').selectOption("have");
  await page.locator('select[name="dismissalNotice"]').selectOption("planned");
  await page.getByRole("button", { name: "증거 상태 저장" }).click();
  await page.getByRole("button", { name: /노동위원회/ }).first().click();
  await page.locator("#case-doc-preview").waitFor();
  assert.match(await page.locator("#case-doc-preview pre").innerText(), /해고/);
  await page.locator("#case-doc-preview [data-close]").click();
  await page.getByRole("button", { name: "사건 요약 복사" }).click();
  await page.getByRole("button", { name: "사건 요약 복사됨" }).waitFor();
  assert.deepEqual(consoleErrors, [], `dismissal browser console errors:\n${consoleErrors.join("\n")}`);
  await context.close();
}

async function completeRetirementJourney(browser) {
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await context.newPage();
  const consoleErrors = collectConsoleErrors(page);
  await page.goto(`${BASE}/retirement-intake`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: /퇴직급여/ }).waitFor();
  await choose(page, "retirementType", "severance");
  await page.getByRole("button", { name: "사건 만들고 계속하기" }).click();
  for (let step = 0; step < 6; step += 1) {
    if (await page.locator(".workspace").count()) break;
    await page.locator("form[data-intake-form]").waitFor();
    for (const [name, value] of Object.entries({
      employmentStartDate: "2023-01-01", employmentEndDate: "2026-08-01", weeklyScheduledHours: "40",
      averageWageTotal: "9000000", averageWageDays: "92", ordinaryDailyWage: "100000",
    })) {
      const input = page.locator(`[name="${name}"]`);
      if (await input.count() && await input.first().isVisible()) await input.first().fill(value);
    }
    await page.getByRole("button", { name: "저장하고 다음" }).click();
    await page.waitForTimeout(80);
  }
  await page.locator(".workspace").waitFor();
  assert.match(await page.locator("#money").innerText(), /퇴직급여|원/);
  assert.match(await page.locator("#sources").innerText(), /근로자퇴직급여 보장법/);
  await page.getByRole("button", { name: /내용증명|진정/ }).first().click();
  await page.locator("#case-doc-preview").waitFor();
  await page.locator("#case-doc-preview [data-close]").click();
  await page.getByRole("button", { name: "사건 요약 복사" }).click();
  await page.getByRole("button", { name: "사건 요약 복사됨" }).waitFor();
  assert.deepEqual(consoleErrors, [], `retirement browser console errors:\n${consoleErrors.join("\n")}`);
  await context.close();
}

async function completeWorktimeJourney(browser) {
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await context.newPage();
  const consoleErrors = collectConsoleErrors(page);
  await page.goto(`${BASE}/worktime-intake`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: /연장·야간·휴일/ }).waitFor();
  await choose(page, "workSystem", "standard");
  await page.getByRole("button", { name: "사건 만들고 계속하기" }).click();
  for (let step = 0; step < 6; step += 1) {
    if (await page.locator(".workspace").count()) break;
    await page.locator("form[data-intake-form]").waitFor();
    for (const [name, value] of Object.entries({ workplaceEmployeeCount: "12", ordinaryHourlyWage: "20000", weeklyOvertimeHours: "13", weekdayOvertimeHours: "10", nightOvertimeHours: "2", dailyWorkHours: "9", breakMinutes: "30" })) {
      const input = page.locator(`[name="${name}"]`);
      if (await input.count() && await input.first().isVisible()) await input.first().fill(value);
    }
    for (const [name, value] of [["baseWageForExtraHoursPaid", "yes"]]) {
      const field = page.locator(`[name="${name}"]`);
      if (await field.count() && await field.first().isVisible()) await choose(page, name, value);
    }
    await page.getByRole("button", { name: "저장하고 다음" }).click();
    await page.waitForTimeout(80);
  }
  await page.locator(".workspace").waitFor();
  assert.match(await page.locator("#money").innerText(), /140,000원/);
  assert.match(await page.locator("#assessment").innerText(), /12시간/);
  await page.getByRole("button", { name: /문서|진정|내용증명/ }).first().click();
  await page.locator("#case-doc-preview").waitFor();
  await page.locator("#case-doc-preview [data-close]").click();
  await page.getByRole("button", { name: "사건 요약 복사" }).click();
  await page.getByRole("button", { name: "사건 요약 복사됨" }).waitFor();
  assert.deepEqual(consoleErrors, [], `worktime browser console errors:\n${consoleErrors.join("\n")}`);
  await context.close();
}

async function mobileSmoke(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  for (const route of ["/wage-intake", "/dismissal-intake", "/retirement-intake", "/worktime-intake"]) {
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
    assert.equal(await page.locator("body").evaluate((body) => body.scrollWidth <= window.innerWidth + 2), true, `${route} must not horizontally overflow mobile viewport`);
  }
  await context.close();
}

await waitForServer();
const browser = await chromium.launch({ headless: true });
try {
  await completeWageJourney(browser);
  await completeDismissalJourney(browser);
  await completeRetirementJourney(browser);
  await completeWorktimeJourney(browser);
  await mobileSmoke(browser);
  console.log("✅ Chromium E2E passed: wage + dismissal + retirement + working-time + mobile");
} finally {
  await browser.close();
  server.kill("SIGTERM");
}