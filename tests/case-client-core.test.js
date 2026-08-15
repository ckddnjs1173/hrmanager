import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (file) => readFileSync(path.join(ROOT, file), "utf8");

test("shared Case client core owns session-only access and protected API transport", () => {
  const core = read("case-client-core.js");
  assert.match(core, /sessionStorage/);
  assert.doesNotMatch(core, /localStorage/);
  assert.match(core, /x-case-token/);
  assert.match(core, /encodeURIComponent\(session\.id\)/);
  assert.match(core, /\$\{slug\}-intake/);
});

test("shared Case client core renders server documents as text and centralizes report/delete/restore", () => {
  const core = read("case-client-core.js");
  assert.match(core, /querySelector\("pre"\)\.textContent/);
  assert.match(core, /\$\{slug\}-document/);
  assert.match(core, /\$\{slug\}-report/);
  assert.match(core, /method: "DELETE"/);
  assert.match(core, /async function restore/);
});

test("shared Case client core has no Case-domain-specific endpoint", () => {
  const core = read("case-client-core.js");
  for (const domain of ["worktime-intake", "annual-leave-intake", "retirement-intake", "dismissal-intake", "wage-intake"]) {
    assert.doesNotMatch(core, new RegExp(domain));
  }
});
