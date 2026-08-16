import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHttpSecurityMiddleware } from "../lib/http-security.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("HTTP security middleware preserves baseline headers and HSTS behavior", () => {
  const middleware = createHttpSecurityMiddleware();
  const headers = {};
  let nextCalled = false;
  const res = { setHeader(name, value) { headers[name] = value; } };
  middleware({ secure: true }, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.equal(headers["X-Frame-Options"], "SAMEORIGIN");
  assert.equal(headers["Referrer-Policy"], "strict-origin-when-cross-origin");
  assert.match(headers["Content-Security-Policy"], /default-src 'self'/);
  assert.match(headers["Strict-Transport-Security"], /max-age=15552000/);
});

test("server.js remains a small bootstrap instead of owning application routes", () => {
  const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
  assert.match(server, /createApplication/);
  assert.match(server, /startRetentionScheduler/);
  assert.match(server, /app\.listen/);
  assert.doesNotMatch(server, /app\.(get|post|use)\(/);
  assert.doesNotMatch(server, /createHmac|timingSafeEqual|Content-Security-Policy/);
});

test("application composition owns all extracted route domains and operational probes", () => {
  const application = fs.readFileSync(path.join(root, "lib/application.js"), "utf8");
  for (const contract of [
    "createCaseRouter", "createAiRouter", "createExpertRouter", "createDocumentRouter",
    "createPublicOperationRouter", "createAdminRouter", "createPartnerRouter", "createSecureSummaryRouter",
    "createSessionSecurity", "createRateLimiter", "createHttpSecurityMiddleware", "createProductHomeHandler",
    "getRuntimeReadiness",
  ]) assert.match(application, new RegExp(contract), `application composition missing ${contract}`);
  assert.match(application, /app\.get\("\/api\/health"/);
  assert.match(application, /app\.get\("\/api\/readiness"/);
  assert.match(application, /express\.static/);
  assert.match(application, /renderBrandedPage/);
});
