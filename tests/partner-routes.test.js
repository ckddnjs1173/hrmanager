import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createPartnerRouter } from "../lib/partner-routes.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const clean = (value) => typeof value === "string" ? value.slice(0, 2000).trim() : "";
const noLimit = () => (_req, _res, next) => next();
const parseCookies = () => ({});
const verifySession = () => null;
const setSessionCookie = (_req, res, payload, name) => {
  res.setHeader("x-test-cookie", name || "nomu_sess");
  res.setHeader("x-test-csrf", payload.csrf || "");
};
const clearSessionCookie = (res, name) => res.setHeader("x-test-cookie", `clear:${name || "nomu_sess"}`);

function makeRouter(overrides = {}) {
  return createPartnerRouter({
    rateLimit: noLimit,
    clean,
    sessionTtl: 60_000,
    parseCookies,
    verifySession,
    setSessionCookie,
    clearSessionCookie,
    ...overrides,
  });
}

async function withServer(router, run) {
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  try { await run(`http://127.0.0.1:${port}`); }
  finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

test("partner router requires shared session dependencies", () => {
  assert.throws(() => createPartnerRouter({}), /partner_router_rateLimit_required/);
  assert.throws(() => makeRouter({ sessionTtl: 0 }), /partner_router_session_ttl_required/);
});

test("partner login and me preserve invalid-token/no-session contracts", async () => {
  await withServer(makeRouter(), async (base) => {
    const login = await fetch(`${base}/api/partner/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "__invalid_partner_token__" }),
    });
    assert.equal(login.status, 401);
    assert.deepEqual(await login.json(), { error: "invalid_token" });

    const me = await fetch(`${base}/api/partner/me`);
    assert.equal(me.status, 401);
    assert.deepEqual(await me.json(), { error: "no_session" });
  });
});

test("partner bookings preserve unauthorized contract without a valid session", async () => {
  await withServer(makeRouter(), async (base) => {
    const response = await fetch(`${base}/api/partner/bookings`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "unauthorized" });
  });
});

test("application composition delegates partner endpoints to the extracted router", () => {
  const application = readFileSync(path.join(ROOT, "lib/application.js"), "utf8");
  const server = readFileSync(path.join(ROOT, "server.js"), "utf8");
  assert.match(application, /import \{ createPartnerRouter \} from "\.\/partner-routes\.js"/);
  assert.match(application, /app\.use\("\/api", createPartnerRouter\(\{/);
  for (const route of ["login", "logout", "me", "bookings", "booking/:id"]) {
    assert.doesNotMatch(application, new RegExp(`app\\.(?:get|post)\\(\"/api/partner/${route.replace("/:id", "/:id")}`));
    assert.doesNotMatch(server, new RegExp(`app\\.(?:get|post)\\(\"/api/partner/${route.replace("/:id", "/:id")}`));
  }
  assert.doesNotMatch(application, /function partnerAuth/);
  assert.match(server, /createApplication/);
});