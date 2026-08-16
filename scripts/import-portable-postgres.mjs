import fs from "node:fs";
import path from "node:path";
import { createPostgresPool, pingPostgres } from "../lib/postgres-client.js";
import { applyPostgresMigrations } from "../lib/postgres-migrations.js";
import { importPortableIntoPostgres } from "../lib/postgres-portable.js";

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

const input = argValue("--input");
if (!input) throw new Error("portable_input_required: use --input <file>");
const inputPath = path.resolve(input);
if (!fs.existsSync(inputPath)) throw new Error(`portable_input_not_found:${inputPath}`);
const replace = process.argv.includes("--replace");
const migrate = process.argv.includes("--migrate");
const payload = JSON.parse(fs.readFileSync(inputPath, "utf8"));

const pool = createPostgresPool({ applicationName: "insaya-postgres-import" });
try {
  const ping = await pingPostgres(pool);
  console.log(`PostgreSQL connected: ${ping.database} (${ping.latencyMs}ms)`);
  if (migrate) await applyPostgresMigrations(pool);
  const counts = await importPortableIntoPostgres(pool, payload, { replace });
  console.log("Portable import complete.");
  for (const [table, count] of Object.entries(counts)) console.log(`${table}: ${count}`);
} finally {
  await pool.end();
}
