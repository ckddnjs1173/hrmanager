import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { createPostgresPool } from "../lib/postgres-client.js";
import { applyPostgresMigrations } from "../lib/postgres-migrations.js";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
const PORT = Number(process.env.LEGAL_SCHEDULER_STATUS_E2E_PORT || 32273);
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN_TOKEN = "legal-scheduler-status-browser-token";

const migrationPool = createPostgresPool({ applicationName: "insaya-legal-scheduler-status-migrate" });
await applyPostgresMigrations(migrationPool, { logger: { log() {} } });
await migrationPool.end();

const server = spawn(process.execPath, ["server.js"], {
  env: {
    ...process.env,
    PORT: String(PORT),
    SITE_URL: BASE,
    STORAGE_DRIVER: "postgres",
    SESSION_SECRET: "legal-scheduler-status-browser-session-secret",
    ADMIN_TOKEN,
    NODE_ENV: "test",
    REQUIRE_PERSISTENT_DB: "0",
    PERSISTENT_STORAGE: "0",
    LEGAL_SOURCE_MONITOR_ENABLED: "0",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
server.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });

async function waitForServer() {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`server exited before scheduler status browser E2E\n${serverOutput}`);
    try {
      const response = await fetch(`${BASE}/admin-legal.html`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`scheduler status server did not become ready\n${serverOutput}`);
}

try {
  await waitForServer();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto(`${BASE}/admin-legal.html`, { waitUntil: "domcontentloaded" });
    await page.locator("#adminToken").fill(ADMIN_TOKEN);
    await page.locator("#loginButton").click();
    await page.locator("#app").waitFor({ state: "visible" });
    errors.length = 0;

    await page.locator("#monitorTab").click();
    await page.locator("#monitorMain").waitFor({ state: "visible" });
    await page.locator("#schedulerStateBadge").waitFor({ state: "visible" });

    const cardText = await page.locator("#schedulerStatusCard").innerText();
    assert.match(cardText, /자동 점검 Scheduler/);
    assert.match(cardText, /OFF/);
    assert.match(cardText, /환경변수 OFF/);
    assert.match(cardText, /실제 주기\s*6시간/);
    assert.match(cardText, /최소 주기\s*1시간/);
    assert.match(cardText, /아직 자동 실행 이력이 없습니다/);
    assert.match(cardText, /읽기 전용 상태/);
    assert.equal(await page.locator("#schedulerStatusCard button").count(), 0, "scheduler observability card must not expose mutation controls");

    const payload = await page.evaluate(async () => {
      const response = await fetch("/api/admin/legal/monitor/scheduler", { credentials: "same-origin" });
      return { status: response.status, body: await response.json() };
    });
    assert.equal(payload.status, 200);
    assert.equal(payload.body.mutableFromApi, false);
    assert.equal(payload.body.automaticReviewAllowed, false);
    assert.equal(payload.body.runtimeActivationAllowed, false);
    assert.equal(payload.body.scheduler.started, true);
    assert.equal(payload.body.scheduler.enabled, false);
    assert.equal(payload.body.scheduler.reason, "disabled_by_flag");
    assert.equal(payload.body.scheduler.intervalMs, 6 * 60 * 60 * 1000);
    assert.equal(payload.body.scheduler.minIntervalMs, 60 * 60 * 1000);
    assert.equal(payload.body.scheduler.running, false);
    assert.equal(payload.body.scheduler.lastSummary, null);
    assert.deepEqual(errors, [], `scheduler status browser console errors:\n${errors.join("\n")}`);
  } finally {
    await browser.close();
  }

  console.log("Legal scheduler status Chromium E2E passed: default OFF reason, interval metadata and read-only UI/API contract.");
} finally {
  server.kill("SIGTERM");
  await new Promise((resolve) => {
    if (server.exitCode !== null) return resolve();
    server.once("exit", resolve);
    setTimeout(() => { if (server.exitCode === null) server.kill("SIGKILL"); }, 3000).unref();
  });
}
