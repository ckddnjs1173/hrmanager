import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createAdminRouter } from "../lib/admin-routes.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const clean = (value) => typeof value === "string" ? value.slice(0, 2000).trim() : "";
const noLimit = () => (_req, _res, next) => next();
const parseCookies = () => ({});
const verifySession = () => null;
const setSessionCookie = (_req, res, payload) => res.setHeader("x-test-session", payload.csrf || "set");
const clearSessionCookie = (res) => res.setHeader("x-test-session", "cleared");

function makeRouter(overrides = {}) {
  return createAdminRouter({
    rateLimit: noLimit,
    clean,
    adminToken: "secret-admin-token",
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

test("admin router requires shared security dependencies", () => {
  assert.throws(() => createAdminRouter({}), /admin_router_rateLimit_required/);
  assert.throws(() => makeRouter({ adminToken: "" }), /admin_router_admin_token_required/);
  assert.throws(() => makeRouter({ sessionTtl: 0 }), /admin_router_session_ttl_required/);
});

test("admin login preserves invalid-token and successful session contracts", async () => {
  await withServer(makeRouter(), async (base) => {
    const invalid = await fetch(`${base}/api/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "wrong" }),
    });
    assert.equal(invalid.status, 401);
    assert.deepEqual(await invalid.json(), { error: "invalid_token" });

    const valid = await fetch(`${base}/api/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "secret-admin-token" }),
    });
    assert.equal(valid.status, 200);
    assert.match(valid.headers.get("x-test-session") || "", /^[a-f0-9]{32}$/);
    const body = await valid.json();
    assert.equal(body.ok, true);
    assert.match(body.csrf, /^[a-f0-9]{32}$/);
  });
});

test("admin protected endpoints preserve header-token authentication", async () => {
  await withServer(makeRouter(), async (base) => {
    const unauthorized = await fetch(`${base}/api/admin/data`);
    assert.equal(unauthorized.status, 401);
    assert.deepEqual(await unauthorized.json(), { error: "unauthorized" });

    const authorized = await fetch(`${base}/api/admin/data`, { headers: { "x-admin-token": "secret-admin-token" } });
    assert.equal(authorized.status, 200);
    const body = await authorized.json();
    assert.ok(Array.isArray(body.bookings));
    assert.ok(Array.isArray(body.leads));
  });
});

test("server delegates admin endpoints to the extracted router", () => {
  const server = readFileSync(path.join(ROOT, "server.js"), "utf8");
  assert.match(server, /import \{ createAdminRouter \} from "\.\/lib\/admin-routes\.js"/);
  assert.match(server, /app\.use\("\/api", createAdminRouter\(\{/);
  for (const route of ["login", "logout", "session", "data", "summary", "notifications", "feedback", "bookings", "nomu"]) {
    assert.doesNotMatch(server, new RegExp(`app\\.(?:get|post)\\(\"/api/admin/${route}`));
  }
  assert.doesNotMatch(server, /function adminAuth/);
  assert.doesNotMatch(server, /function tokenOk/);
});
