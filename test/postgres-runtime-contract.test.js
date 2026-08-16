import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LEGACY_CORE_TABLES } from "../lib/storage-contract.js";
import { listPostgresMigrationFiles } from "../lib/postgres-migrations.js";
import { resolveStorageRuntimeMode, describeStorageRuntime } from "../lib/storage-runtime-contract.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("postgres migration manifest is ordered and covers legacy core tables", () => {
  const files = listPostgresMigrationFiles(path.join(ROOT, "db", "postgres"));
  assert.ok(files.length >= 5);
  assert.deepEqual(files.map((file) => path.basename(file)), [...files.map((file) => path.basename(file))].sort());

  const legacySql = fs.readFileSync(path.join(ROOT, "db", "postgres", "001_legacy_core.sql"), "utf8");
  for (const table of LEGACY_CORE_TABLES) {
    assert.match(legacySql, new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${table}\\s*\\(`, "i"), table);
  }
});

test("production postgres driver is blocked until async repositories are cut over", () => {
  assert.equal(resolveStorageRuntimeMode({}), "sqlite");
  assert.equal(resolveStorageRuntimeMode({ STORAGE_DRIVER: "postgres-shadow" }), "postgres-shadow");
  assert.throws(
    () => resolveStorageRuntimeMode({ STORAGE_DRIVER: "postgres" }),
    /postgres_runtime_not_enabled/
  );
  assert.deepEqual(describeStorageRuntime({ STORAGE_DRIVER: "postgres-shadow" }), {
    mode: "postgres-shadow",
    primary: "sqlite",
    postgresShadow: true,
    postgresProductionEnabled: false,
  });
});
