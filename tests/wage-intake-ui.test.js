import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function read(name) {
  return fs.readFileSync(path.join(root, name), "utf8");
}

test("wage intake page loads dedicated client and styles", () => {
  const html = read("wage-intake.html");
  assert.match(html, /wage-intake\.css/);
  assert.match(html, /wage-intake-client\.js/);
  assert.match(html, /id="wageApp"/);
  assert.match(html, /Case Workspace/);
});

test("wage intake client uses protected API and session-only token storage", () => {
  const js = read("wage-intake-client.js");

  assert.match(js, /\/api\/cases\/wage-intake/);
  assert.match(js, /\/wage-intake`/);
  assert.match(js, /x-case-token/);
  assert.match(js, /sessionStorage/);
  assert.doesNotMatch(js, /localStorage/);
  assert.doesNotMatch(js, /accessToken=.*URL|searchParams\.set\([^)]*token/i);
});

test("home launcher routes the primary wage entry to the new case page", () => {
  const js = read("wage-intake-launcher.js");
  assert.match(js, /const TARGET = "\/wage-intake"/);
  assert.match(js, /data-wage-case-launcher/);
  assert.match(js, /key === "wage"/);
});
