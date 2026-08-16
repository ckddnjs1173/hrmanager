import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createGracefulShutdown } from "../lib/graceful-shutdown.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("graceful shutdown stops jobs, closes HTTP server and exits cleanly once", () => {
  const calls = [];
  const server = {
    close(callback) {
      calls.push("server.close");
      callback();
    },
  };
  const shutdown = createGracefulShutdown({
    server,
    stopJobs: [() => calls.push("job.stop")],
    log: (message) => calls.push(`log:${message}`),
    warn: (message) => calls.push(`warn:${message}`),
    exit: (code) => calls.push(`exit:${code}`),
  });

  assert.equal(shutdown("SIGTERM"), true);
  assert.equal(shutdown("SIGINT"), false);
  assert.ok(calls.indexOf("job.stop") < calls.indexOf("server.close"));
  assert.equal(calls.filter((item) => item === "server.close").length, 1);
  assert.ok(calls.includes("exit:0"));
});

test("shutdown job cleanup failure does not prevent HTTP close", () => {
  const warnings = [];
  const exits = [];
  let closed = false;
  const shutdown = createGracefulShutdown({
    server: { close(callback) { closed = true; callback(); } },
    stopJobs: [() => { throw new Error("job failed"); }],
    log: () => {},
    warn: (...args) => warnings.push(args.join(" ")),
    exit: (code) => exits.push(code),
  });

  shutdown("SIGTERM");
  assert.equal(closed, true);
  assert.ok(warnings.some((message) => message.includes("job failed")));
  assert.deepEqual(exits, [0]);
});

test("server close failure exits non-zero", () => {
  const exits = [];
  const shutdown = createGracefulShutdown({
    server: { close(callback) { callback(new Error("close failed")); } },
    log: () => {},
    warn: () => {},
    exit: (code) => exits.push(code),
  });

  shutdown("SIGTERM");
  assert.deepEqual(exits, [1]);
});

test("server bootstrap wires SIGTERM and SIGINT to the graceful shutdown lifecycle", () => {
  const source = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
  assert.match(source, /createGracefulShutdown/);
  assert.match(source, /const stopRetentionScheduler = startRetentionScheduler\(\)/);
  assert.match(source, /const server = app\.listen/);
  assert.match(source, /process\.once\("SIGTERM"/);
  assert.match(source, /process\.once\("SIGINT"/);
  assert.match(source, /stopJobs: \[stopRetentionScheduler\]/);
});
