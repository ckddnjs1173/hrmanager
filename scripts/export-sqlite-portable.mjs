import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { buildPortableExport, validatePortableExport } from "../lib/portable-export.js";
import { LEGACY_CORE_TABLES } from "../lib/storage-contract.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dbPath = String(process.env.DB_PATH || path.join(ROOT, "data", "app.db")).trim();
const argIndex = process.argv.indexOf("--output");
const outputPath = path.resolve(
  argIndex >= 0 && process.argv[argIndex + 1]
    ? process.argv[argIndex + 1]
    : path.join(ROOT, "data", `insaya-portable-${Date.now()}.json`)
);

if (!fs.existsSync(dbPath)) {
  console.error(`Database not found: ${dbPath}`);
  process.exit(1);
}

const db = new DatabaseSync(dbPath);
try {
  const existing = new Set(
    db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name)
  );
  const missing = LEGACY_CORE_TABLES.filter((table) => !existing.has(table));
  if (missing.length) throw new Error(`portable_export_missing_tables:${missing.join(",")}`);

  const payload = buildPortableExport({
    readRows: (table) => db.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all(),
  });
  const validation = validatePortableExport(payload);
  if (!validation.ok) throw new Error(`portable_export_invalid:${validation.errors.join(",")}`);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2) + "\n", "utf8");

  const totalRows = Object.values(payload.tables).reduce((sum, entry) => sum + entry.count, 0);
  console.log(`Portable export written: ${outputPath}`);
  console.log(`Tables: ${payload.tableOrder.length}, rows: ${totalRows}`);
} finally {
  db.close();
}
