import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (file) => readFileSync(path.join(ROOT, file), "utf8");

test("working-time page loads dedicated client and styles", () => {
  const html = read("worktime-intake.html");
  assert.match(html, /id="worktimeApp"/);
  assert.match(html, /worktime-intake-client\.js/);
  assert.match(html, /worktime-intake\.css/);
});

test("working-time client delegates protected Case transport to shared core", () => {
  const client = read("worktime-intake-client.js");
  const core = read("case-client-core.js");
  assert.match(client, /from "\.\/case-client-core\.js"/);
  assert.match(client, /slug: "worktime"/);
  assert.match(client, /\/api\/cases\/worktime-intake/);
  assert.doesNotMatch(client, /sessionStorage/);
  assert.doesNotMatch(client, /localStorage/);
  assert.match(core, /sessionStorage/);
  assert.doesNotMatch(core, /localStorage/);
  assert.match(core, /\$\{slug\}-document/);
  assert.match(core, /\$\{slug\}-report/);
  assert.match(core, /querySelector\("pre"\)\.textContent/);
});

test("home launcher exposes working-time while preserving existing Case routes", () => {
  const launcher = read("wage-intake-launcher.js");
  assert.match(launcher, /WAGE_TARGET = "\/wage-intake"/);
  assert.match(launcher, /DISMISSAL_TARGET = "\/dismissal-intake"/);
  assert.match(launcher, /RETIREMENT_TARGET = "\/retirement-intake"/);
  assert.match(launcher, /WORKTIME_TARGET = "\/worktime-intake"/);
  assert.match(launcher, /data-open-worktime/);
});
