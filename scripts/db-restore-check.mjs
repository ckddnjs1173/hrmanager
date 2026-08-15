import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createVerifiedRestoreCopy, REQUIRED_APP_TABLES } from "../lib/sqlite-backup.js";

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const backupPath = readArg("--source");
const explicitTarget = readArg("--target");
const keep = process.argv.includes("--keep") || Boolean(explicitTarget);

if (!backupPath) {
  console.error("Usage: node scripts/db-restore-check.mjs --source <backup.db> [--target <restore-test.db>] [--keep]");
  process.exit(2);
}

const tempDir = explicitTarget ? null : fs.mkdtempSync(path.join(os.tmpdir(), "insaya-restore-check-"));
const targetPath = explicitTarget || path.join(tempDir, "restored.db");

try {
  const result = await createVerifiedRestoreCopy({
    backupPath,
    targetPath,
    requiredTables: REQUIRED_APP_TABLES,
    overwrite: false,
  });
  console.log(JSON.stringify({
    ok: true,
    backup: result.backupPath,
    restoredCopy: result.targetPath,
    pages: result.pages,
    integrity: result.verification.integrity,
    tables: result.verification.tables,
    kept: keep,
  }, null, 2));
} catch (error) {
  console.error(`DB restore check failed: ${error?.message || error}`);
  process.exitCode = 1;
} finally {
  if (!keep && tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
}
