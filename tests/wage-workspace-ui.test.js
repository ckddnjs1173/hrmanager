import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

test("wage page loads the independent workspace resource module", () => {
  const html = read("wage-intake.html");
  assert.match(html, /wage-workspace\.css/);
  assert.match(html, /wage-workspace\.js/);
});

test("workspace resource module renders money, sources, documents and official procedure", () => {
  const js = read("wage-workspace.js");
  const core = read("case-client-core.js");
  assert.match(js, /id=\"money\"/);
  assert.match(js, /id=\"sources\"/);
  assert.match(js, /id=\"documents\"/);
  assert.match(js, /id=\"procedure\"/);
  assert.match(js, /wage-document/);
  assert.match(js, /createCaseAccessClient/);
  assert.match(js, /from "\.\/case-client-core\.js"/);
  assert.doesNotMatch(js, /x-case-token/);
  assert.doesNotMatch(js, /sessionStorage/);
  assert.doesNotMatch(js, /localStorage/);
  assert.match(core, /x-case-token/);
  assert.match(core, /sessionStorage/);
});

test("document preview uses server-rendered plain text instead of injecting document HTML", () => {
  const js = read("wage-workspace.js");
  assert.match(js, /querySelector\(\"pre\"\)\.textContent/);
  assert.doesNotMatch(js, /innerHTML\s*=\s*result\.document\?*\.html/);
});