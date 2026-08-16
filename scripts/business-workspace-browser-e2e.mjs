import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { createPostgresPool } from "../lib/postgres-client.js";
import { applyPostgresMigrations } from "../lib/postgres-migrations.js";
import { runComplianceNotificationSweep } from "../lib/saas-notification-repo.js";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
const PORT = Number(process.env.BUSINESS_E2E_PORT || 32241);
const BASE = `http://127.0.0.1:${PORT}`;
const DAY_MS = 86_400_000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const kstDatePlusDays = (days) => new Date(Date.now() + KST_OFFSET_MS + days * DAY_MS).toISOString().slice(0, 10);
const internalDueDate = kstDatePlusDays(3);

const migrationPool = createPostgresPool({ applicationName: "insaya-business-workspace-browser-migrate" });
await applyPostgresMigrations(migrationPool, { logger: { log() {} } });
await migrationPool.end();

const server = spawn(process.execPath, ["server.js"], {
  env: {
    ...process.env,
    PORT: String(PORT),
    SITE_URL: BASE,
    STORAGE_DRIVER: "postgres",
    SAAS_ENABLED: "1",
    SAAS_AUTH_TOKEN_ECHO: "1",
    SAAS_SESSION_SECRET: "business-workspace-browser-secret",
    SESSION_SECRET: "business-workspace-legacy-secret",
    ADMIN_TOKEN: "business-workspace-admin",
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
    if (server.exitCode !== null) throw new Error(`server exited before Business browser E2E\n${serverOutput}`);
    try {
      const response = await fetch(`${BASE}/business.html`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Business server did not become ready\n${serverOutput}`);
}

function collectConsoleErrors(page) {
  const errors = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

try {
  await waitForServer();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const consoleErrors = collectConsoleErrors(page);
    await page.goto(`${BASE}/business.html`, { waitUntil: "domcontentloaded" });

    await page.locator("#login-view").waitFor({ state: "visible" });
    await page.locator("#login-email").fill("browser-owner@example.com");
    await page.locator("#login-form button[type=submit]").click();
    await page.locator("#verify-magic").waitFor({ state: "visible" });
    await page.locator("#verify-magic").click();

    await page.locator("#workspace-view").waitFor({ state: "visible" });
    consoleErrors.length = 0;
    await page.locator("#org-dialog[open]").waitFor();
    await page.locator('#org-form input[name="legalName"]').fill("브라우저 테스트 주식회사");
    await page.locator('#org-form input[name="displayName"]').fill("브라우저테스트");
    await page.locator('#org-form button[type="submit"]').click();
    await page.locator("#page-title").waitFor();

    await page.locator('.nav-item[data-view="setup"]').click();
    await page.locator('#profile-form input[name="industryCode"]').fill("G47");
    await page.locator('#profile-form input[name="payday"]').fill("25");
    await page.locator('#profile-form input[name="defaultWeeklyHours"]').fill("40");
    await page.locator('#profile-form select[name="wageSystem"]').selectOption("MIXED");
    await page.locator('#profile-form button[type="submit"]').click();
    await page.getByText("회사정보를 저장했습니다.").waitFor();

    await page.locator('#workplace-form input[name="name"]').fill("서울 본점");
    await page.locator('#workplace-form input[name="openedAt"]').fill("2026-01-01");
    await page.locator('#workplace-form button[type="submit"]').click();
    await page.getByText("사업장을 추가했습니다.").waitFor();
    assert.match(await page.locator("#workplace-summary").innerText(), /서울 본점/);

    await page.locator('#scope-form input[name="name"]').fill("본사 적용범위");
    await page.locator('#scope-form select[name="status"]').selectOption("UNCERTAIN");
    await page.locator('#scope-form textarea[name="basis"]').fill("초기 검증 전");
    await page.locator('#scope-form button[type="submit"]').click();
    await page.getByText("법률 적용범위를 저장했습니다.").waitFor();
    assert.match(await page.locator("#scope-summary").innerText(), /확인 필요/);

    await page.locator('.nav-item[data-view="people"]').click();
    await page.locator("#show-employee-form").click();
    await page.locator('#employee-form input[name="displayName"]').fill("최저임금테스트");
    await page.locator('#employee-form input[name="employeeNumber"]').fill("B-001");
    await page.locator('#employee-form input[name="hireDate"]').fill("2026-01-01");
    await page.locator('#employee-form select[name="workplaceId"]').selectOption({ index: 1 });
    await page.locator('#employee-form input[name="weeklyContractHours"]').fill("40");
    await page.locator('#employee-form select[name="wageType"]').selectOption("HOURLY");
    await page.locator('#employee-form input[name="baseWage"]').fill("9500");
    await page.locator('#employee-form button[type="submit"]').click();
    await page.getByText("직원을 추가했습니다.").waitFor();
    assert.match(await page.locator("#employee-list").innerText(), /최저임금테스트/);

    await page.locator('.nav-item[data-view="dashboard"]').click();
    await page.locator("#risk-scan-button").click();
    await page.getByText("Risk Scan을 완료했습니다.").waitFor();
    assert.equal((await page.locator("#metric-high").innerText()).trim(), "1");
    assert.ok(Number((await page.locator("#metric-uncertain").innerText()).trim()) >= 1);
    assert.match(await page.locator("#dashboard-findings").innerText(), /2026년 최저임금보다 낮음/);

    await page.locator('.nav-item[data-view="actions"]').click();
    const actionList = page.locator("#action-list");
    let wageAction = actionList.locator(".action-card", { hasText: "최저임금 기준으로 시급 검토" });
    await wageAction.waitFor();
    await wageAction.locator('.due-date-form input[name="dueDate"]').fill(internalDueDate);
    await wageAction.locator('.due-date-form button[type="submit"]').click();
    await page.getByText("내부 관리 기한을 저장했습니다.").waitFor();

    await page.locator('.nav-item[data-view="calendar"]').click();
    const calendarText = await page.locator("#calendar-list").innerText();
    assert.match(calendarText, /최저임금 기준으로 시급 검토/);
    assert.ok(calendarText.includes(internalDueDate));
    assert.match(calendarText, /내부 관리 기한/);
    assert.equal((await page.locator("#calendar-next7").innerText()).trim(), "1");

    const notificationSweep = await runComplianceNotificationSweep({ now: new Date() });
    assert.equal(notificationSweep.generated, 1);
    assert.equal(notificationSweep.delivered, 1);
    await page.locator('.nav-item[data-view="notifications"]').click();
    await page.locator("#notification-refresh").click();
    await page.getByText("알림을 새로고침했습니다.").waitFor();
    assert.equal((await page.locator("#notification-nav-count").innerText()).trim(), "1");
    const notificationList = await page.locator("#notification-list").innerText();
    assert.match(notificationList, /조치 기한 알림/);
    assert.match(notificationList, /내부 관리 기한/);
    assert.ok(notificationList.includes(internalDueDate));
    await page.locator('#notification-list button[data-notification-read]').click();
    await page.getByText("알림을 읽음 처리했습니다.").waitFor();
    assert.equal((await page.locator("#notification-unread-label").innerText()).trim(), "읽지 않음 0");

    await page.locator('.nav-item[data-view="actions"]').click();
    wageAction = actionList.locator(".action-card", { hasText: "최저임금 기준으로 시급 검토" });
    await wageAction.locator('button[data-action-status="IN_PROGRESS"]').click();
    await page.getByText("조치 상태를 변경했습니다.").waitFor();

    const inProgressAction = actionList.locator(".action-card", { hasText: "최저임금 기준으로 시급 검토" });
    assert.match(await inProgressAction.innerText(), /IN_PROGRESS/);
    await inProgressAction.locator('button[data-action-status="DONE"]').click();
    await page.getByText(/다음 Risk Scan에서 실제 해소 여부/).waitFor();

    assert.equal((await page.locator("#onboarding-badge").innerText()).trim(), "활성화 완료");
    await page.locator('.nav-item[data-view="calendar"]').click();
    assert.doesNotMatch(await page.locator("#calendar-list").innerText(), /최저임금 기준으로 시급 검토/);
    await page.locator('.nav-item[data-view="dashboard"]').click();
    assert.match(await page.locator("#onboarding-progress").innerText(), /100% 완료/);

    assert.deepEqual(consoleErrors, [], `Business workspace browser console errors:\n${consoleErrors.join("\n")}`);
  } finally {
    await browser.close();
  }
  console.log("Business Workspace browser E2E passed: login -> Risk -> Calendar -> in-app alert -> read -> Action -> activation.");
} finally {
  server.kill("SIGTERM");
  await new Promise((resolve) => {
    if (server.exitCode !== null) return resolve();
    server.once("exit", resolve);
    setTimeout(() => { if (server.exitCode === null) server.kill("SIGKILL"); }, 3000).unref();
  });
}
