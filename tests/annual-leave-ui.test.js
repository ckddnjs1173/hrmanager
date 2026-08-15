import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (file) => readFileSync(path.join(ROOT, file), "utf8");

test("annual leave page loads dedicated client and styles", () => {
  const html = read("annual-leave-intake.html");
  assert.match(html, /id="annualLeaveApp"/);
  assert.match(html, /annual-leave-intake-client\.js/);
  assert.match(html, /annual-leave-intake\.css/);
});

test("annual leave client delegates protected Case transport to shared core", () => {
  const client = read("annual-leave-intake-client.js");
  const core = read("case-client-core.js");
  assert.match(client, /from "\.\/case-client-core\.js"/);
  assert.match(client, /slug: "annual-leave"/);
  assert.match(client, /\/api\/cases\/annual-leave-intake/);
  assert.doesNotMatch(client, /sessionStorage/);
  assert.doesNotMatch(client, /localStorage/);
  assert.match(core, /sessionStorage/);
  assert.doesNotMatch(core, /localStorage/);
  assert.match(core, /\$\{slug\}-document/);
  assert.match(core, /\$\{slug\}-report/);
  assert.match(core, /querySelector\("pre"\)\.textContent/);
});

test("home launcher exposes annual leave while preserving existing Case routes", () => {
  const launcher = read("wage-intake-launcher.js");
  for (const target of ["WAGE_TARGET", "DISMISSAL_TARGET", "RETIREMENT_TARGET", "WORKTIME_TARGET", "ANNUAL_LEAVE_TARGET"]) {
    assert.match(launcher, new RegExp(target));
  }
  assert.match(launcher, /ANNUAL_LEAVE_TARGET = "\/annual-leave-intake"/);
  assert.match(launcher, /data-open-annual-leave/);
});
