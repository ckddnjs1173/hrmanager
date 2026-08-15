import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (file) => readFileSync(path.join(ROOT, file), "utf8");

const CASE_PAGES = [
  "wage-intake.html",
  "dismissal-intake.html",
  "retirement-intake.html",
  "worktime-intake.html",
  "annual-leave-intake.html",
];

test("all five Case pages load the shared workspace resource stylesheet", () => {
  for (const file of CASE_PAGES) {
    assert.match(read(file), /\/case-workspace-core\.css/, `${file} must load shared Case workspace CSS`);
  }
});

test("non-wage Case pages no longer depend on wage workspace CSS", () => {
  for (const file of CASE_PAGES.filter((file) => file !== "wage-intake.html")) {
    assert.doesNotMatch(read(file), /\/wage-workspace\.css/, `${file} must not depend on wage-only workspace CSS`);
  }
  assert.match(read("wage-intake.html"), /\/wage-workspace\.css/);
});

test("shared workspace stylesheet owns common resources and safe document preview layout", () => {
  const css = read("case-workspace-core.css");
  for (const selector of [".resource-head", ".source-list", ".document-grid", ".procedure-box", ".doc-preview-overlay", ".doc-preview pre"]) {
    assert.match(css, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("wage and dismissal styles no longer duplicate document preview shell", () => {
  assert.doesNotMatch(read("wage-workspace.css"), /\.doc-preview-overlay/);
  assert.doesNotMatch(read("dismissal-intake.css"), /\.doc-preview-overlay/);
});
