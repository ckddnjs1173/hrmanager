import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PORT = Number(process.env.DETAIL_E2E_PORT || 32271);
const BASE = `http://127.0.0.1:${PORT}`;
const CASES = [
  "/wage-intake",
  "/dismissal-intake",
  "/retirement-intake",
  "/worktime-intake",
  "/annual-leave-intake",
];

const server = spawn(process.execPath, ["server.js"], {
  env: {
    ...process.env,
    PORT: String(PORT),
    DB_PATH: ":memory:",
    NODE_ENV: "test",
    SITE_URL: BASE,
    SAAS_ENABLED: "0",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
server.stdout.on("data", (chunk) => { output += chunk.toString(); });
server.stderr.on("data", (chunk) => { output += chunk.toString(); });

async function waitForServer() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`server exited before detail smoke\n${output}`);
    try {
      const response = await fetch(`${BASE}/`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`server did not become ready\n${output}`);
}

async function assertNoOverflow(page, label) {
  const size = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  assert.ok(size.scroll <= size.client + 2, `${label} horizontal overflow: ${size.scroll} > ${size.client}`);
}

async function browserErrors(page) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`);
  });
  return errors;
}

await waitForServer();
const browser = await chromium.launch({ headless: true });

try {
  for (const route of CASES) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const errors = await browserErrors(page);
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
    await page.locator(".case-app").waitFor();
    await page.locator("#case-detail-status").waitFor({ state: "attached" });
    assert.equal(await page.locator(".case-app").getAttribute("aria-live"), "polite", `${route} must expose the shared live region contract`);
    assert.ok(await page.locator('link[href="/case-detail.css"]').count() === 1, `${route} must load case-detail.css once`);
    assert.ok(await page.locator('script[src="/case-detail.js"]').count() === 1, `${route} must load case-detail.js once`);
    await assertNoOverflow(page, route);
    assert.deepEqual(errors, [], `${route} browser errors:\n${errors.join("\n")}`);
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const errors = await browserErrors(page);
    await page.goto(`${BASE}/business-login.html`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "링크를 사용할 수 없습니다." }).waitFor();
    assert.equal(await page.locator("#state").getAttribute("data-kind"), "error");
    assert.equal(await page.locator("#state").getAttribute("role"), "alert");
    assert.match(await page.locator("#message").innerText(), /로그인 토큰이 없거나 이미 제거된 링크/);
    assert.ok(await page.getByRole("link", { name: "Business 로그인으로 돌아가기" }).isVisible());
    await assertNoOverflow(page, "business-login-mobile");
    assert.deepEqual(errors, [], `business login browser errors:\n${errors.join("\n")}`);
    await context.close();
  }

  console.log("Predeploy detail browser smoke passed");
} finally {
  await browser.close();
  server.kill("SIGTERM");
}
