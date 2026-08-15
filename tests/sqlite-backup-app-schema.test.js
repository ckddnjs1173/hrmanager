import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createVerifiedBackup, REQUIRED_APP_TABLES } from "../lib/sqlite-backup.js";

test("online backup validates the real app and Case schema with default required tables", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "insaya-app-backup-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const source = path.join(dir, "app.db");
  const destination = path.join(dir, "app-backup.db");

  process.env.DB_PATH = source;
  const { db } = await import("../lib/db.js");
  await import("../lib/case-repo.js");
  db.prepare("INSERT INTO leads(id, at, kind, contact) VALUES (?, ?, ?, ?)").run(
    "backup-test-lead",
    new Date().toISOString(),
    "test",
    "masked@example.invalid"
  );

  try {
    const result = await createVerifiedBackup({ sourcePath: source, destinationPath: destination });
    assert.equal(result.ok, true);
    for (const table of REQUIRED_APP_TABLES) assert.ok(result.tables.includes(table), `missing table: ${table}`);
  } finally {
    db.close();
  }
});
