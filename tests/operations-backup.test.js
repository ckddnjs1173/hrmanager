import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (file) => readFileSync(path.join(ROOT, file), "utf8");

test("package exposes explicit backup and non-destructive restore-check commands", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.scripts["db:backup"], "node scripts/db-backup.mjs");
  assert.equal(pkg.scripts["db:restore-check"], "node scripts/db-restore-check.mjs");
});

test("runtime database and backup directories are excluded from Git", () => {
  const gitignore = read(".gitignore");
  assert.match(gitignore, /data\/app\.db/);
  assert.match(gitignore, /data\/app\.db-wal/);
  assert.match(gitignore, /backups\//);
});

test("restore check never targets DB_PATH implicitly", () => {
  const script = read("scripts/db-restore-check.mjs");
  assert.match(script, /--source/);
  assert.match(script, /--target/);
  assert.doesNotMatch(script, /process\.env\.DB_PATH/);
  assert.doesNotMatch(script, /data\/app\.db/);
});

test("operations runbook separates backup readiness from persistent storage", () => {
  const doc = read("docs/OPERATIONS.md");
  assert.match(doc, /영속 저장/);
  assert.match(doc, /db:backup/);
  assert.match(doc, /db:restore-check/);
  assert.match(doc, /Production `DB_PATH`를 자동 교체하지 않는다/);
});
