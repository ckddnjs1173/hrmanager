import fs from "node:fs";
import path from "node:path";
import { createPostgresPool } from "../lib/postgres-client.js";
import { validatePostgresAgainstPortable } from "../lib/postgres-portable.js";

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

const input = argValue("--input");
if (!input) throw new Error("portable_input_required: use --input <file>");
const inputPath = path.resolve(input);
if (!fs.existsSync(inputPath)) throw new Error(`portable_input_not_found:${inputPath}`);
const payload = JSON.parse(fs.readFileSync(inputPath, "utf8"));

const pool = createPostgresPool({ applicationName: "insaya-postgres-validate" });
try {
  const result = await validatePostgresAgainstPortable(pool, payload);
  for (const [table, info] of Object.entries(result.tables)) {
    console.log(`${table}: ${info.sourceCount} -> ${info.targetCount}, semantic=${info.semanticMatches ? "ok" : "mismatch"}`);
  }
  if (!result.ok) {
    console.error(`PostgreSQL validation failed: ${result.errors.join(",")}`);
    process.exitCode = 1;
  } else {
    console.log("PostgreSQL validation passed.");
  }
} finally {
  await pool.end();
}
