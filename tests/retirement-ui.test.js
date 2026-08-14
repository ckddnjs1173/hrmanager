import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

test("retirement page loads dedicated client and styles", () => {
  const html = read("retirement-intake.html");
  assert.match(html, /id="retirementApp"/);
  assert.match(html, /retirement-intake\.css/);
  assert.match(html, /retirement-intake-client\.js/);
});

test("retirement client keeps Case access session-only and renders documents as text", () => {
  const js = read("retirement-intake-client.js");
  assert.match(js, /sessionStorage/);
  assert.doesNotMatch(js, /localStorage/);
  assert.match(js, /x-case-token/);
  assert.match(js, /retirement-intake/);
  assert.match(js, /retirement-document/);
  assert.match(js, /retirement-report/);
  assert.match(js, /querySelector\("pre"\)\.textContent/);
});

test("home launcher exposes retirement while preserving wage and dismissal routes", () => {
  const js = read("wage-intake-launcher.js");
  assert.match(js, /WAGE_TARGET = "\/wage-intake"/);
  assert.match(js, /DISMISSAL_TARGET = "\/dismissal-intake"/);
  assert.match(js, /RETIREMENT_TARGET = "\/retirement-intake"/);
  assert.match(js, /퇴직급여 사건 시작하기/);
});
