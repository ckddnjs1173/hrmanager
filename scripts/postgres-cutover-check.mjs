import fs from "node:fs";
import path from "node:path";
import { createPostgresPool, pingPostgres } from "../lib/postgres-client.js";
import { validatePostgresAgainstPortable } from "../lib/postgres-portable.js";
import { LEGACY_CORE_TABLES } from "../lib/storage-contract.js";
import { resolveStorageRuntimeMode } from "../lib/storage-runtime-contract.js";

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

const input = argValue("--input");
if (!input) throw new Error("portable_input_required: use --input <file>");
const inputPath = path.resolve(input);
if (!fs.existsSync(inputPath)) throw new Error(`portable_input_not_found:${inputPath}`);
const payload = JSON.parse(fs.readFileSync(inputPath, "utf8"));

// Until the async repository bundle is merged, production must remain SQLite.
const runtimeMode = resolveStorageRuntimeMode(process.env);
if (runtimeMode === "postgres-shadow") {
  console.log("Storage runtime: postgres-shadow (SQLite remains primary)");
} else {
  console.log("Storage runtime: sqlite");
}

const pool = createPostgresPool({ applicationName: "insaya-postgres-cutover-check" });
try {
  const ping = await pingPostgres(pool);
  console.log(`PostgreSQL connected: ${ping.database} (${ping.latencyMs}ms)`);

  const schemaResult = await pool.query(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename = ANY($1::text[])`,
    [LEGACY_CORE_TABLES]
  );
  const existing = new Set(schemaResult.rows.map((row) => row.tablename));
  const missing = LEGACY_CORE_TABLES.filter((table) => !existing.has(table));
  if (missing.length) throw new Error(`postgres_schema_missing:${missing.join(",")}`);

  const validation = await validatePostgresAgainstPortable(pool, payload);
  if (!validation.ok) throw new Error(`postgres_data_validation_failed:${validation.errors.join(",")}`);

  console.log("PostgreSQL shadow target is schema-complete and semantically equal to the portable SQLite export.");
  console.log("READY_FOR_ASYNC_REPOSITORY_CUTOVER");
  console.log("Production PostgreSQL is intentionally still blocked until the async repository bundle is merged.");
} finally {
  await pool.end();
}
