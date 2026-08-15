import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

test("wage page loads the report action module", () => {
  assert.match(read("wage-intake.html"), /wage-report-ui\.js/);
});

test("report action delegates protected transport to shared Case access", () => {
  const js = read("wage-report-ui.js");
  const core = read("case-client-core.js");
  assert.match(js, /createCaseAccessClient/);
  assert.match(js, /from "\.\/case-client-core\.js"/);
  assert.match(js, /\/wage-report/);
  assert.doesNotMatch(js, /x-case-token/);
  assert.doesNotMatch(js, /sessionStorage/);
  assert.doesNotMatch(js, /localStorage/);
  assert.match(core, /x-case-token/);
  assert.match(core, /sessionStorage/);
  assert.match(js, /navigator\.clipboard\.writeText/);
});