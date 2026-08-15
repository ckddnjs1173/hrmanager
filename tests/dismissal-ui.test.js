import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

test("dismissal page loads dedicated client and responsive styles", () => {
  const html = read("dismissal-intake.html");
  assert.match(html, /id="dismissalApp"/);
  assert.match(html, /dismissal-intake\.css/);
  assert.match(html, /dismissal-intake-client\.js/);
});

test("dismissal client delegates protected Case transport to shared core", () => {
  const js = read("dismissal-intake-client.js");
  const core = read("case-client-core.js");
  assert.match(js, /from "\.\/case-client-core\.js"/);
  assert.match(js, /slug: "dismissal"/);
  assert.match(js, /\/api\/cases\/dismissal-intake/);
  assert.doesNotMatch(js, /sessionStorage/);
  assert.doesNotMatch(js, /localStorage/);
  assert.match(core, /sessionStorage/);
  assert.doesNotMatch(core, /localStorage/);
  assert.match(core, /x-case-token/);
  assert.match(core, /\$\{slug\}-document/);
  assert.match(core, /\$\{slug\}-report/);
});

test("shared dismissal document preview keeps server output plain-text and preserves prior UX", () => {
  const js = read("dismissal-intake-client.js");
  const core = read("case-client-core.js");
  assert.match(core, /querySelector\("pre"\)\.textContent/);
  assert.doesNotMatch(core, /innerHTML\s*=\s*result\.document/);
  assert.match(js, /closePreviewOnBackdrop: true/);
  assert.match(js, /reportResetMs: 1400/);
  assert.match(js, /disableReportWhileCopying: true/);
  assert.match(js, /unauthorized/);
  assert.match(js, /not_found/);
});

test("home launcher exposes separate wage and dismissal case entries", () => {
  const js = read("wage-intake-launcher.js");
  assert.match(js, /\/wage-intake/);
  assert.match(js, /\/dismissal-intake/);
  assert.match(js, /해고·권고사직 사건 시작하기/);
  assert.match(js, /\["fire", "dismissal"\]/);
});
