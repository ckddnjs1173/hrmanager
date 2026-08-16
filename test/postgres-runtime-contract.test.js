import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LEGACY_CORE_TABLES } from "../lib/storage-contract.js";
import { listPostgresMigrationFiles } from "../lib/postgres-migrations.js";
import { resolveStorageRuntimeMode, describeStorageRuntime } from "../lib/storage-runtime-contract.js";

const ROOT=path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("postgres migration manifest is ordered and covers legacy core tables",()=>{
  const files=listPostgresMigrationFiles(path.join(ROOT,"db","postgres"));assert.ok(files.length>=5);assert.deepEqual(files.map((file)=>path.basename(file)),[...files.map((file)=>path.basename(file))].sort());
  const legacySql=fs.readFileSync(path.join(ROOT,"db","postgres","001_legacy_core.sql"),"utf8");for(const table of LEGACY_CORE_TABLES)assert.match(legacySql,new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${table}\\s*\\(`,"i"),table);
});

test("postgres runtime requires an explicit database URL",()=>{
  assert.equal(resolveStorageRuntimeMode({}),"sqlite");
  assert.equal(resolveStorageRuntimeMode({STORAGE_DRIVER:"postgres-shadow"}),"postgres-shadow");
  assert.throws(()=>resolveStorageRuntimeMode({STORAGE_DRIVER:"postgres"}),/database_url_required_for_postgres_runtime/);
  assert.equal(resolveStorageRuntimeMode({STORAGE_DRIVER:"postgres",DATABASE_URL:"postgres://example/test"}),"postgres");
  assert.deepEqual(describeStorageRuntime({STORAGE_DRIVER:"postgres",DATABASE_URL:"postgres://example/test"}),{mode:"postgres",primary:"postgres",postgresShadow:false,postgresProductionEnabled:true});
});
