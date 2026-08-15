import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  createVerifiedBackup,
  createVerifiedRestoreCopy,
  verifySqliteDatabase,
} from "../lib/sqlite-backup.js";

function createFixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "insaya-backup-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const source = path.join(dir, "source.db");
  const db = new DatabaseSync(source);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE sample(id INTEGER PRIMARY KEY, value TEXT NOT NULL);");
  db.prepare("INSERT INTO sample(value) VALUES (?)").run("backup-me");
  db.close();
  return { dir, source };
}

test("verified backup creates a readable consistent SQLite snapshot", async (t) => {
  const { dir, source } = createFixture(t);
  const destination = path.join(dir, "backup.db");

  const result = await createVerifiedBackup({
    sourcePath: source,
    destinationPath: destination,
    requiredTables: ["sample"],
  });

  assert.equal(result.ok, true);
  assert.equal(result.integrity[0], "ok");
  assert.ok(result.pages > 0);
  assert.ok(result.tables.includes("sample"));

  const backupDb = new DatabaseSync(destination, { readOnly: true });
  try {
    assert.equal(backupDb.prepare("SELECT value FROM sample WHERE id=1").get().value, "backup-me");
  } finally {
    backupDb.close();
  }
});

test("restore check copies a verified backup to a separate target without changing the source", async (t) => {
  const { dir, source } = createFixture(t);
  const backupPath = path.join(dir, "backup.db");
  const restoredPath = path.join(dir, "restore-check.db");
  await createVerifiedBackup({ sourcePath: source, destinationPath: backupPath, requiredTables: ["sample"] });

  const result = await createVerifiedRestoreCopy({
    backupPath,
    targetPath: restoredPath,
    requiredTables: ["sample"],
  });

  assert.equal(result.verification.ok, true);
  assert.ok(fs.existsSync(restoredPath));
  assert.ok(fs.existsSync(backupPath));
  assert.notEqual(result.backupPath, result.targetPath);
});

test("backup fails closed when required application tables are missing", async (t) => {
  const { dir, source } = createFixture(t);
  const destination = path.join(dir, "invalid-backup.db");

  await assert.rejects(
    createVerifiedBackup({ sourcePath: source, destinationPath: destination, requiredTables: ["sample", "cases"] }),
    /backup verification failed/
  );
  assert.equal(fs.existsSync(destination), false, "failed backup must be removed");
});

test("backup refuses to overwrite an existing file unless explicitly requested", async (t) => {
  const { dir, source } = createFixture(t);
  const destination = path.join(dir, "existing.db");
  fs.writeFileSync(destination, "do-not-overwrite");

  await assert.rejects(
    createVerifiedBackup({ sourcePath: source, destinationPath: destination, requiredTables: ["sample"] }),
    /destination already exists/
  );
  assert.equal(fs.readFileSync(destination, "utf8"), "do-not-overwrite");
});

test("database verification reports integrity and missing tables", (t) => {
  const { source } = createFixture(t);
  const result = verifySqliteDatabase(source, { requiredTables: ["sample", "cases"] });
  assert.equal(result.ok, false);
  assert.deepEqual(result.integrity, ["ok"]);
  assert.deepEqual(result.missingTables, ["cases"]);
});
