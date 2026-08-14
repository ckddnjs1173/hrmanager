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

test("dismissal client keeps case access session-only and uses protected endpoints", () => {
  const js = read("dismissal-intake-client.js");
  assert.match(js, /sessionStorage/);
  assert.doesNotMatch(js, /localStorage/);
  assert.match(js, /x-case-token/);
  assert.match(js, /dismissal-intake/);
  assert.match(js, /dismissal-document/);
  assert.match(js, /dismissal-report/);
});

test("dismissal document preview renders server output as plain text", () => {
  const js = read("dismissal-intake-client.js");
  assert.match(js, /querySelector\("pre"\)\.textContent/);
  assert.doesNotMatch(js, /innerHTML\s*=\s*result\.document/);
});

test("home launcher exposes separate wage and dismissal case entries", () => {
  const js = read("wage-intake-launcher.js");
  assert.match(js, /\/wage-intake/);
  assert.match(js, /\/dismissal-intake/);
  assert.match(js, /해고·권고사직 사건 시작하기/);
  assert.match(js, /\["fire", "dismissal"\]/);
});
