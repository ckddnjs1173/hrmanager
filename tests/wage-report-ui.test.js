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

test("report action uses the protected API and session-only token", () => {
  const js = read("wage-report-ui.js");
  assert.match(js, /\/wage-report/);
  assert.match(js, /x-case-token/);
  assert.match(js, /sessionStorage/);
  assert.doesNotMatch(js, /localStorage/);
  assert.match(js, /navigator\.clipboard\.writeText/);
});
