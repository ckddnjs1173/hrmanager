import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

test("Case retention has no import-time scheduler side effect", () => {
  const source = read("lib/case-retention.js");
  assert.match(source, /export function caseRetentionSweep/);
  assert.doesNotMatch(source, /setInterval\s*\(/);
  assert.doesNotMatch(source, /caseRetentionSweep\(\);/);
});

test("Case access no longer owns retention lifecycle", () => {
  const source = read("lib/case-access.js");
  assert.doesNotMatch(source, /import\s+["']\.\/case-retention\.js["']/);
  assert.match(source, /ensureCaseSchema\(\)/);
});

test("one server retention scheduler owns operational and Case sweeps", () => {
  const source = read("lib/retention-scheduler.js");
  assert.match(source, /import \{ runtimeCaseRetentionSweep \} from "\.\/runtime-case-repo\.js"/);
  assert.match(source, /import \{ retentionSweep \} from "\.\/runtime-repo\.js"/);
  assert.match(source, /export async function runRetentionSweep/);
  assert.match(source, /export async function runCaseRetentionSweep/);
  assert.match(source, /Promise\.all\(\[runRetentionSweep\(\{log,warn\}\),runCaseRetentionSweep\(\{log,warn\}\)\]\)/);
  assert.equal((source.match(/setInterval\s*\(/g) || []).length, 1);
});

test("Case retention policy durations remain unchanged", () => {
  const source = read("lib/case-retention.js");
  assert.match(source, /positiveDays\("CASE_RETENTION_DAYS", 30\)/);
  assert.match(source, /positiveDays\("CASE_ARCHIVED_RETENTION_DAYS", 7\)/);
});