import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { caseRestoreErrorText, isTerminalCaseRestoreError } from "../case-client-core.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (file) => readFileSync(path.join(ROOT, file), "utf8");

test("shared Case access client owns session-only access and protected API transport", () => {
  const core = read("case-client-core.js");
  assert.match(core, /export function createCaseAccessClient/);
  assert.match(core, /sessionStorage/);
  assert.doesNotMatch(core, /localStorage/);
  assert.match(core, /x-case-token/);
  assert.match(core, /error\.status = response\.status/);
  assert.match(core, /error\.body = body/);
  assert.match(core, /response\.status === 204/);
});

test("full shared Case client composes the access adapter", () => {
  const core = read("case-client-core.js");
  assert.match(core, /createCaseAccessClient\(\{ storageKey \}\)/);
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

test("Case restore clears access only for terminal access/not-found states", () => {
  for (const status of [401, 404, 410]) {
    assert.equal(isTerminalCaseRestoreError({ status }), true);
  }
  for (const status of [0, 400, 409, 429, 500, 503]) {
    assert.equal(isTerminalCaseRestoreError({ status }), false);
  }
  assert.equal(isTerminalCaseRestoreError(new Error("network")), false);
});

test("Case restore copy distinguishes expired access from transient failures", () => {
  assert.match(caseRestoreErrorText({ status: 401 }), /만료|유효하지/);
  assert.match(caseRestoreErrorText({ status: 404 }), /찾을 수 없습니다/);
  assert.match(caseRestoreErrorText({ status: 500 }), /그대로 보관/);
});

test("shared Case restore state preserves retry and explicit abandon actions", () => {
  const core = read("case-client-core.js");
  const css = read("case-workspace-core.css");

  assert.match(core, /shouldClearSessionOnRestoreError = isTerminalCaseRestoreError/);
  assert.match(core, /data-case-retry/);
  assert.match(core, /data-case-start-new/);
  assert.match(core, /접근 정보는 이 탭에 그대로 보관했습니다/);
  assert.match(core, /retry\?\.focus\(\)/);
  assert.match(css, /\.case-system-state/);
  assert.match(css, /\.case-system-state-actions/);
});
