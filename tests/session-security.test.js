import test from "node:test";
import assert from "node:assert/strict";
import { createSessionSecurity, DEFAULT_SESSION_TTL } from "../lib/session-security.js";

test("development session security preserves admin fallback and signed-session contract", () => {
  const security = createSessionSecurity({ env: { NODE_ENV: "development" } });
  assert.equal(security.adminToken, "admin");
  assert.equal(security.generatedAdminToken, false);
  assert.equal(security.sessionTtl, DEFAULT_SESSION_TTL);
  assert.equal(security.sessionSecret, "admin::nomu-session");

  const token = security.signSession({ exp: Date.now() + 60_000, csrf: "csrf-token" });
  assert.deepEqual(security.verifySession(token), { exp: security.verifySession(token).exp, csrf: "csrf-token" });

  const tampered = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
  assert.equal(security.verifySession(tampered), null);
  assert.equal(security.verifySession(security.signSession({ exp: Date.now() - 1 })), null);
});

test("production without ADMIN_TOKEN remains fail-closed with a generated token", () => {
  const security = createSessionSecurity({ env: { NODE_ENV: "production" } });
  assert.equal(security.generatedAdminToken, true);
  assert.match(security.adminToken, /^[0-9a-f]{48}$/);
  assert.equal(security.sessionSecret, `${security.adminToken}::nomu-session`);
});

test("cookie helpers preserve HttpOnly SameSite Strict and secure proxy behavior", () => {
  const security = createSessionSecurity({ env: { NODE_ENV: "development", ADMIN_TOKEN: "known", SESSION_SECRET: "secret" } });
  assert.deepEqual(security.parseCookies({ headers: { cookie: "a=1; encoded=hello%20world" } }), { a: "1", encoded: "hello world" });

  const headers = {};
  const res = { setHeader: (name, value) => { headers[name] = value; } };
  security.setSessionCookie({ secure: true }, res, { exp: Date.now() + 60_000 }, "nomu_partner");
  assert.match(headers["Set-Cookie"], /^nomu_partner=/);
  assert.match(headers["Set-Cookie"], /HttpOnly/);
  assert.match(headers["Set-Cookie"], /SameSite=Strict/);
  assert.match(headers["Set-Cookie"], /Secure/);

  security.clearSessionCookie(res, "nomu_partner");
  assert.match(headers["Set-Cookie"], /Max-Age=0/);
});