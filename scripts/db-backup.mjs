import path from "node:path";
import { createVerifiedBackup, defaultBackupPath, defaultDatabasePath } from "../lib/sqlite-backup.js";

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const sourcePath = readArg("--source") || defaultDatabasePath();
const destinationPath = readArg("--out") || defaultBackupPath();
const overwrite = process.argv.includes("--overwrite");

try {
  const result = await createVerifiedBackup({ sourcePath, destinationPath, overwrite });
  console.log(JSON.stringify({
    ok: true,
    source: result.sourcePath,
    backup: result.destinationPath,
    pages: result.pages,
    sizeBytes: result.sizeBytes,
    tables: result.tables,
  }, null, 2));
} catch (error) {
  console.error(`DB backup failed: ${error?.message || error}`);
  process.exitCode = 1;
}
