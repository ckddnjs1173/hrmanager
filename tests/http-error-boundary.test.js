import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";

process.env.DB_PATH = ":memory:";

const { createApplication } = await import("../lib/application.js");
const { createApplicationErrorHandler, createRequestContextMiddleware } = await import("../lib/http-error-boundary.js");

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function fakeResponse() {
  return {
    headersSent: false,
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    set(name, value) { this.headers[name] = value; return this; },
    send(value) { this.body = value; return this; },
  };
}

test("request context creates a server-owned request ID", () => {
  const req = {};
  const res = fakeResponse();
  let nextCalled = false;
  createRequestContextMiddleware({ idFactory: () => "request-123" })(req, res, () => { nextCalled = true; });

  assert.equal(req.requestId, "request-123");
  assert.equal(res.headers["X-Request-Id"], "request-123");
  assert.equal(nextCalled, true);
});

test("unexpected API errors hide internal messages and return request ID", () => {
  const warnings = [];
  const req = { requestId: "request-500", method: "GET", path: "/api/private" };
  const res = fakeResponse();
  const handler = createApplicationErrorHandler({ warn: (...args) => warnings.push(args.join(" ")) });

  handler(new Error("database password must never reach client"), req, res, () => {});

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "internal_error", requestId: "request-500" });
  assert.doesNotMatch(JSON.stringify(res.body), /database password/);
  assert.ok(warnings.some((message) => message.includes("request-500")));
});

test("malformed JSON receives safe 400 JSON with matching request ID and security headers", async (t) => {
  const { app } = createApplication({ rootDir: ROOT, env: { ...process.env, NODE_ENV: "test" }, warn: () => {} });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());

  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/cases/wage-intake`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: '{"facts":',
  });
  const body = await response.json();
  const requestId = response.headers.get("x-request-id");

  assert.equal(response.status, 400);
  assert.equal(body.error, "invalid_json");
  assert.ok(requestId);
  assert.equal(body.requestId, requestId);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
});
