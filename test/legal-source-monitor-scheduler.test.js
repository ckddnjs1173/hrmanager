import test from "node:test";
import assert from "node:assert/strict";
import {
  LEGAL_SOURCE_MONITOR_DEFAULT_INTERVAL_MS,
  LEGAL_SOURCE_MONITOR_MIN_INTERVAL_MS,
  clampLegalSourceMonitorIntervalMs,
  resolveLegalSourceMonitorSchedulerConfig,
  startLegalSourceMonitorScheduler,
} from "../lib/legal-source-monitor-scheduler.js";

function logger() {
  return { logs: [], warns: [], errors: [], log(...args) { this.logs.push(args); }, warn(...args) { this.warns.push(args); }, error(...args) { this.errors.push(args); } };
}

function timerHarness() {
  const state = { callback: null, interval: null, cleared: null, unrefCalled: false };
  return {
    state,
    setIntervalFn(callback, interval) {
      state.callback = callback;
      state.interval = interval;
      return { unref() { state.unrefCalled = true; } };
    },
    clearIntervalFn(timer) { state.cleared = timer; },
  };
}

test("scheduler is disabled by default and creates no timer", () => {
  const timers = timerHarness();
  const scheduler = startLegalSourceMonitorScheduler({ env: {}, ...timers, logger: logger() });
  assert.equal(scheduler.config.enabled, false);
  assert.equal(scheduler.config.reason, "disabled_by_flag");
  assert.equal(timers.state.callback, null);
});

test("enabled flag without DATABASE_URL stays disabled", () => {
  const timers = timerHarness();
  const log = logger();
  const scheduler = startLegalSourceMonitorScheduler({ env: { LEGAL_SOURCE_MONITOR_ENABLED: "1" }, ...timers, logger: log });
  assert.equal(scheduler.config.enabled, false);
  assert.equal(scheduler.config.reason, "database_url_required");
  assert.equal(timers.state.callback, null);
  assert.equal(log.warns.length, 1);
});

test("default interval is six hours and scheduler does not run immediately", () => {
  let listCalls = 0;
  const timers = timerHarness();
  const scheduler = startLegalSourceMonitorScheduler({
    env: { LEGAL_SOURCE_MONITOR_ENABLED: "true", DATABASE_URL: "postgresql://test" },
    listWatches: async () => { listCalls += 1; return []; },
    runWatch: async () => ({ status: "UNCHANGED" }),
    ...timers,
    logger: logger(),
  });
  assert.equal(scheduler.config.enabled, true);
  assert.equal(scheduler.config.intervalMs, LEGAL_SOURCE_MONITOR_DEFAULT_INTERVAL_MS);
  assert.equal(timers.state.interval, LEGAL_SOURCE_MONITOR_DEFAULT_INTERVAL_MS);
  assert.equal(timers.state.unrefCalled, true);
  assert.equal(listCalls, 0, "server startup must not immediately fetch official sources");
});

test("interval clamp preserves requested value and enforces one-hour effective minimum", () => {
  const clamp1000 = clampLegalSourceMonitorIntervalMs(1000);
  const config = resolveLegalSourceMonitorSchedulerConfig({
    LEGAL_SOURCE_MONITOR_ENABLED: "1",
    LEGAL_SOURCE_MONITOR_INTERVAL_MS: "1000",
    DATABASE_URL: "postgresql://test",
  });
  const diagnostics = {
    min: LEGAL_SOURCE_MONITOR_MIN_INTERVAL_MS,
    defaultInterval: LEGAL_SOURCE_MONITOR_DEFAULT_INTERVAL_MS,
    clamp1000,
    requested: config.requestedIntervalMs,
    effective: config.intervalMs,
    enabled: config.enabled,
    reason: config.reason,
  };
  if (
    diagnostics.min !== 3_600_000 ||
    diagnostics.clamp1000 !== 3_600_000 ||
    diagnostics.requested !== 1000 ||
    diagnostics.effective !== 3_600_000
  ) {
    console.log(`::error file=test/legal-source-monitor-scheduler.test.js,line=69::scheduler clamp diagnostics ${JSON.stringify(diagnostics)}`);
  }

  assert.equal(LEGAL_SOURCE_MONITOR_MIN_INTERVAL_MS, 3_600_000);
  assert.equal(clamp1000, 3_600_000);
  assert.equal(clampLegalSourceMonitorIntervalMs(3_600_000), 3_600_000);
  assert.equal(clampLegalSourceMonitorIntervalMs(7_200_000), 7_200_000);
  assert.equal(clampLegalSourceMonitorIntervalMs("invalid"), LEGAL_SOURCE_MONITOR_DEFAULT_INTERVAL_MS);
  assert.equal(config.requestedIntervalMs, 1000);
  assert.equal(config.intervalMs, 3_600_000);
});

test("tick processes enabled watches sequentially and isolates failures", async () => {
  const timers = timerHarness();
  const order = [];
  const scheduler = startLegalSourceMonitorScheduler({
    env: { LEGAL_SOURCE_MONITOR_ENABLED: "1", DATABASE_URL: "postgresql://test" },
    listWatches: async (options) => {
      assert.deepEqual(options, { enabled: true, limit: 100 });
      return [{ id: "watch-a" }, { id: "watch-b" }, { id: "watch-c" }];
    },
    runWatch: async ({ watchId, triggeredBy }) => {
      assert.equal(triggeredBy, "legal-source-scheduler");
      order.push(`start:${watchId}`);
      if (watchId === "watch-b") {
        order.push(`fail:${watchId}`);
        throw new Error("boom");
      }
      order.push(`end:${watchId}`);
      return watchId === "watch-c" ? { status: "FAILED", errorCode: "http_503" } : { status: "UNCHANGED" };
    },
    ...timers,
    logger: logger(),
  });
  const summary = await timers.state.callback();
  assert.deepEqual(order, ["start:watch-a", "end:watch-a", "start:watch-b", "fail:watch-b", "start:watch-c", "end:watch-c"]);
  assert.equal(summary.total, 3);
  assert.equal(summary.completed, 1);
  assert.equal(summary.failed, 2);
  assert.deepEqual(summary.results.map((item) => item.status), ["UNCHANGED", "FAILED", "FAILED"]);
  scheduler.stop();
});

test("overlapping tick is skipped until the current batch finishes", async () => {
  const timers = timerHarness();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let runCalls = 0;
  const scheduler = startLegalSourceMonitorScheduler({
    env: { LEGAL_SOURCE_MONITOR_ENABLED: "1", DATABASE_URL: "postgresql://test" },
    listWatches: async () => [{ id: "watch-a" }],
    runWatch: async () => { runCalls += 1; await gate; return { status: "UNCHANGED" }; },
    ...timers,
    logger: logger(),
  });
  const first = timers.state.callback();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(scheduler.running, true);
  const second = await timers.state.callback();
  assert.deepEqual(second, { skipped: true, reason: "overlap" });
  assert.equal(runCalls, 1);
  release();
  await first;
  assert.equal(scheduler.running, false);
});

test("stop clears timer and future manual tick is inert", async () => {
  const timers = timerHarness();
  let listCalls = 0;
  const scheduler = startLegalSourceMonitorScheduler({
    env: { LEGAL_SOURCE_MONITOR_ENABLED: "1", DATABASE_URL: "postgresql://test" },
    listWatches: async () => { listCalls += 1; return []; },
    ...timers,
    logger: logger(),
  });
  scheduler.stop();
  assert.equal(scheduler.stopped, true);
  assert.ok(timers.state.cleared);
  const result = await scheduler.tick();
  assert.deepEqual(result, { skipped: true, reason: "stopped" });
  assert.equal(listCalls, 0);
});
