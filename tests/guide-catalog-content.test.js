import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("guide catalog exposes the worker and employer topic inventory", () => {
  const source = fs.readFileSync(path.join(ROOT, "content/guide-catalog.js"), "utf8");
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename: "content/guide-catalog.js" });
  const topics = sandbox.window.INSAYA_GUIDE_CATALOG.TOPICS;

  assert.equal(topics.worker.length, 23);
  assert.equal(topics.employer.length, 10);
  assert.equal(topics.worker.find((item) => item.k === "wage")?.t, "임금체불");
  assert.equal(topics.worker.find((item) => item.k === "layoff")?.t, "정리해고");
  assert.equal(topics.employer.find((item) => item.k === "emp_risk")?.t, "노무 리스크 진단");
  assert.equal(topics.employer.find((item) => item.k === "empsubsidy")?.t, "고용장려금");
});

test("guide catalog keys are globally unique", () => {
  const source = fs.readFileSync(path.join(ROOT, "content/guide-catalog.js"), "utf8");
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename: "content/guide-catalog.js" });
  const topics = sandbox.window.INSAYA_GUIDE_CATALOG.TOPICS;
  const keys = [...topics.worker, ...topics.employer].map((item) => item.k);

  assert.equal(new Set(keys).size, keys.length);
});
