import * as sqlite from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { DatabaseSync } = sqlite;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

export const REQUIRED_APP_TABLES = Object.freeze([
  "bookings",
  "leads",
  "nomusa",
  "events",
  "notifications",
  "cases",
  "case_events",
]);

function requireBackupApi() {
  if (typeof sqlite.backup !== "function") {
    throw new Error("SQLite online backup requires Node.js 22.16.0 or newer");
  }
  return sqlite.backup;
}

function timestampForFile(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

export function defaultDatabasePath() {
  return process.env.DB_PATH || path.join(ROOT, "data", "app.db");
}

export function defaultBackupPath(date = new Date()) {
  return path.join(ROOT, "backups", `app-${timestampForFile(date)}.db`);
}

function assertFileDatabase(value, label) {
  const resolved = path.resolve(String(value || ""));
  if (!value || value === ":memory:") throw new Error(`${label} must be a file-backed SQLite database`);
  return resolved;
}

function listTables(db) {
  return db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all().map((row) => row.name);
}

function readIntegrity(db) {
  const rows = db.prepare("PRAGMA integrity_check").all();
  return rows.map((row) => String(row.integrity_check ?? Object.values(row)[0] ?? ""));
}

export function verifySqliteDatabase(databasePath, { requiredTables = [] } = {}) {
  const resolved = assertFileDatabase(databasePath, "databasePath");
  if (!fs.existsSync(resolved)) throw new Error(`SQLite database not found: ${resolved}`);

  const db = new DatabaseSync(resolved, { readOnly: true });
  try {
    const integrity = readIntegrity(db);
    const tables = listTables(db);
    const missingTables = requiredTables.filter((table) => !tables.includes(table));
    const foreignKeyViolations = db.prepare("PRAGMA foreign_key_check").all();
    const ok = integrity.length === 1 && integrity[0] === "ok" && missingTables.length === 0 && foreignKeyViolations.length === 0;
    return {
      ok,
      path: resolved,
      sizeBytes: fs.statSync(resolved).size,
      integrity,
      tables,
      missingTables,
      foreignKeyViolationCount: foreignKeyViolations.length,
    };
  } finally {
    db.close();
  }
}

function prepareDestination(destinationPath, overwrite) {
  const resolved = assertFileDatabase(destinationPath, "destinationPath");
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  if (fs.existsSync(resolved)) {
    if (!overwrite) throw new Error(`destination already exists: ${resolved}`);
    fs.rmSync(resolved, { force: true });
  }
  return resolved;
}

export async function createVerifiedBackup({
  sourcePath = defaultDatabasePath(),
  destinationPath = defaultBackupPath(),
  requiredTables = REQUIRED_APP_TABLES,
  overwrite = false,
} = {}) {
  const onlineBackup = requireBackupApi();
  const source = assertFileDatabase(sourcePath, "sourcePath");
  if (!fs.existsSync(source)) throw new Error(`source database not found: ${source}`);
  const destination = prepareDestination(destinationPath, overwrite);

  const sourceDb = new DatabaseSync(source, { readOnly: true });
  let pages;
  try {
    pages = await onlineBackup(sourceDb, destination);
  } catch (error) {
    fs.rmSync(destination, { force: true });
    throw error;
  } finally {
    sourceDb.close();
  }

  const verification = verifySqliteDatabase(destination, { requiredTables });
  if (!verification.ok) {
    fs.rmSync(destination, { force: true });
    throw new Error(`backup verification failed: ${JSON.stringify({
      integrity: verification.integrity,
      missingTables: verification.missingTables,
      foreignKeyViolationCount: verification.foreignKeyViolationCount,
    })}`);
  }

  return {
    sourcePath: source,
    destinationPath: destination,
    pages,
    ...verification,
  };
}

export async function createVerifiedRestoreCopy({
  backupPath,
  targetPath,
  requiredTables = REQUIRED_APP_TABLES,
  overwrite = false,
} = {}) {
  if (!backupPath) throw new Error("backupPath is required");
  if (!targetPath) throw new Error("targetPath is required");

  const sourceVerification = verifySqliteDatabase(backupPath, { requiredTables });
  if (!sourceVerification.ok) throw new Error("backup source failed verification");

  const result = await createVerifiedBackup({
    sourcePath: backupPath,
    destinationPath: targetPath,
    requiredTables,
    overwrite,
  });

  return {
    backupPath: sourceVerification.path,
    targetPath: result.destinationPath,
    pages: result.pages,
    verification: result,
  };
}
