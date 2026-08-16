import test from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter } from "../lib/rate-limit.js";

function responseRecorder() {
  const headers = {};
  const state = { status: 200, json: null, headers };
  return {
    state,
    res: {
      setHeader(name, value) { headers[name] = value; },
      status(code) { state.status = code; return this; },
      json(value) { state.json = value; return value; },
    },
  };
}

test("rate limiter preserves per-ip and path window contract", () => {
  let clock = 1_000;
  const limiter = createRateLimiter({ now: () => clock, cleanupIntervalMs: 60_000 });
  const middleware = limiter.rateLimit({ windowMs: 1_000, max: 2 });
  const req = { ip: "127.0.0.1", path: "/api/test" };

  let passed = 0;
  for (let i = 0; i < 2; i++) {
    const { res, state } = responseRecorder();
    middleware(req, res, () => { passed += 1; });
    assert.equal(state.status, 200);
  }
  assert.equal(passed, 2);

  const blocked = responseRecorder();
  middleware(req, blocked.res, () => { passed += 1; });
  assert.equal(blocked.state.status, 429);
  assert.deepEqual(blocked.state.json, { error: "too_many_requests" });
  assert.equal(blocked.state.headers["Retry-After"], 1);
  assert.equal(passed, 2);

  clock = 2_001;
  const renewed = responseRecorder();
  middleware(req, renewed.res, () => { passed += 1; });
  assert.equal(renewed.state.status, 200);
  assert.equal(passed, 3);
  limiter.stop();
});

test("rate limiter isolates endpoint paths", () => {
  const limiter = createRateLimiter({ now: () => 5_000, cleanupIntervalMs: 60_000 });
  const middleware = limiter.rateLimit({ max: 1 });
  let passed = 0;
  middleware({ ip: "same", path: "/a" }, responseRecorder().res, () => { passed += 1; });
  middleware({ ip: "same", path: "/b" }, responseRecorder().res, () => { passed += 1; });
  assert.equal(passed, 2);
  limiter.stop();
});