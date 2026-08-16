import test from "node:test";
import assert from "node:assert/strict";
import { createAdminAccess } from "../lib/admin-access.js";

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function request({ method = "GET", token = "", cookie = "", csrf = "" } = {}) {
  const headers = { "x-admin-token": token, "x-csrf-token": csrf };
  return {
    method,
    get(name) { return headers[String(name).toLowerCase()] || ""; },
    cookie,
  };
}

const access = createAdminAccess({
  adminToken: "fixed-admin-token",
  parseCookies: (req) => ({ nomu_sess: req.cookie || "" }),
  verifySession: (value) => value === "valid-session" ? { csrf: "csrf-123", exp: Date.now() + 1000 } : null,
});

test("admin token uses timing-safe compatible guard and bypasses session csrf", () => {
  const req = request({ method: "POST", token: "fixed-admin-token" });
  const res = response();
  let next = false;
  access.adminAuth(req, res, () => { next = true; });
  assert.equal(next, true);
  assert.equal(req.adminAccess, "token");
  assert.equal(res.statusCode, 200);
});

test("admin session allows GET without csrf", () => {
  const req = request({ cookie: "valid-session" });
  const res = response();
  let next = false;
  access.adminAuth(req, res, () => { next = true; });
  assert.equal(next, true);
  assert.equal(req.adminAccess, "session");
  assert.equal(req.adminSession.csrf, "csrf-123");
});

test("admin session rejects write without matching csrf", () => {
  const req = request({ method: "POST", cookie: "valid-session", csrf: "wrong" });
  const res = response();
  let next = false;
  access.adminAuth(req, res, () => { next = true; });
  assert.equal(next, false);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: "csrf" });
});

test("admin session accepts write with matching csrf", () => {
  const req = request({ method: "POST", cookie: "valid-session", csrf: "csrf-123" });
  const res = response();
  let next = false;
  access.adminAuth(req, res, () => { next = true; });
  assert.equal(next, true);
  assert.equal(res.statusCode, 200);
});

test("invalid session is unauthorized", () => {
  const req = request({ cookie: "invalid" });
  const res = response();
  let next = false;
  access.adminAuth(req, res, () => { next = true; });
  assert.equal(next, false);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: "unauthorized" });
});
