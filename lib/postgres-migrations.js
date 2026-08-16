import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DEFAULT_DIR = path.join(ROOT, "db", "postgres");

export function listPostgresMigrationFiles(directory = DEFAULT_DIR) {
  return fs.readdirSync(directory)
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort()
    .map((name) => path.join(directory, name));
}

export async function applyPostgresMigrations(pool, { directory = DEFAULT_DIR, logger = console } = {}) {
  const files = listPostgresMigrationFiles(directory);
  if (!files.length) throw new Error("postgres_migrations_missing");

  const applied = [];
  for (const file of files) {
    const sql = fs.readFileSync(file, "utf8");
    if (!sql.trim()) throw new Error(`postgres_migration_empty:${path.basename(file)}`);
    await pool.query(sql);
    applied.push(path.basename(file));
    logger?.log?.(`Applied PostgreSQL migration: ${path.basename(file)}`);
  }
  return applied;
}
