import { AI_ENABLED, AI_INFO } from "./ai.js";
import { CASE_DOMAIN_REGISTRY } from "./case-domain-registry.js";
import { validateLegalRegistry } from "./legal-registry.js";
import { REQUIRED_APP_TABLES } from "./sqlite-backup.js";
import { LEGACY_CORE_TABLES } from "./storage-contract.js";
import { describeStorageRuntime } from "./storage-runtime-contract.js";
import { getRuntimePostgresPool } from "./runtime-postgres.js";

async function sqliteDatabaseStatus() {
  try {
    const [{ ensureCaseSchema }, { db }] = await Promise.all([
      import("./case-db.js"),
      import("./db.js"),
    ]);
    ensureCaseSchema();
    const probe = db.prepare("SELECT 1 AS ok").get();
    const journal = db.prepare("PRAGMA journal_mode").get();
    const foreignKeys = db.prepare("PRAGMA foreign_keys").get();
    const tableRows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
    const tables = tableRows.map((row) => String(row.name));
    const missingRequiredTables = REQUIRED_APP_TABLES.filter((table) => !tables.includes(table));
    const foreignKeysEnabled = Number(foreignKeys?.foreign_keys ?? Object.values(foreignKeys || {})[0] ?? 0) === 1;
    const probeOk = probe?.ok === 1;
    return {
      ok: probeOk && foreignKeysEnabled && missingRequiredTables.length === 0,
      engine: "sqlite",
      journalMode: String(journal?.journal_mode || Object.values(journal || {})[0] || "unknown"),
      foreignKeysEnabled,
      applicationTableCount: tables.length,
      requiredTableCount: REQUIRED_APP_TABLES.length,
      missingRequiredTables,
    };
  } catch (error) {
    return { ok: false, engine: "sqlite", error: "database_probe_failed", detail: error?.message || String(error) };
  }
}

async function postgresDatabaseStatus() {
  try {
    const pool = getRuntimePostgresPool();
    const [probe, tablesResult] = await Promise.all([
      pool.query("SELECT 1 AS ok"),
      pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public'"),
    ]);
    const tables = tablesResult.rows.map((row) => String(row.tablename));
    const missingRequiredTables = LEGACY_CORE_TABLES.filter((table) => !tables.includes(table));
    return {
      ok: Number(probe.rows[0]?.ok || 0) === 1 && missingRequiredTables.length === 0,
      engine: "postgres",
      applicationTableCount: tables.length,
      requiredTableCount: LEGACY_CORE_TABLES.length,
      missingRequiredTables,
    };
  } catch (error) {
    return { ok: false, engine: "postgres", error: "database_probe_failed", detail: error?.message || String(error) };
  }
}

function normalizePersistenceStorageInfo(storageInfo, env) {
  if (storageInfo?.primary) return storageInfo;
  if (storageInfo && ("explicitPathConfigured" in storageInfo || "inMemory" in storageInfo)) {
    return {
      primary: "sqlite",
      sqliteExplicitPathConfigured: Boolean(storageInfo.explicitPathConfigured),
      sqliteInMemory: Boolean(storageInfo.inMemory),
    };
  }
  return describeStorageRuntime(env);
}

export function evaluatePersistenceStatus({ env = process.env, storageInfo = null } = {}) {
  const runtime = normalizePersistenceStorageInfo(storageInfo, env);
  const required = env.REQUIRE_PERSISTENT_DB === "1";
  const durableStorageDeclared = env.PERSISTENT_STORAGE === "1";
  const postgresConfigured = runtime.primary === "postgres" && Boolean(String(env.DATABASE_URL || "").trim());
  const sqliteInMemory = runtime.sqliteInMemory ?? (env.DB_PATH === ":memory:");
  const sqliteExplicitPathConfigured = runtime.sqliteExplicitPathConfigured ?? Boolean(env.DB_PATH);
  const sqlitePathConfigured = runtime.primary === "sqlite" && sqliteExplicitPathConfigured && !sqliteInMemory;
  const storageTargetConfigured = postgresConfigured || sqlitePathConfigured;
  const readyForSensitiveCaseStorage = durableStorageDeclared && storageTargetConfigured;
  const requirementSatisfied = !required || readyForSensitiveCaseStorage;

  return {
    required,
    durableStorageDeclared,
    dbPathConfigured: sqlitePathConfigured,
    postgresConfigured,
    storageTargetConfigured,
    requirementSatisfied,
    readyForSensitiveCaseStorage,
    warning: required ? (requirementSatisfied ? null : "persistent_storage_requirement_not_satisfied") : "persistent_storage_not_enforced",
    verificationWarning: readyForSensitiveCaseStorage ? null : "persistent_storage_not_verified",
  };
}

function buildStatus(env) {
  return {
    commit: env.RENDER_GIT_COMMIT || env.GITHUB_SHA || null,
    branch: env.RENDER_GIT_BRANCH || env.GITHUB_REF_NAME || null,
    environment: env.NODE_ENV || "development",
    node: process.version,
  };
}

export async function getRuntimeReadiness({ env = process.env } = {}) {
  let runtime;
  try { runtime = describeStorageRuntime(env); }
  catch (error) {
    return {
      ready: false,
      readyForSensitiveCaseStorage: false,
      build: buildStatus(env),
      ai: { enabled: AI_ENABLED, provider: AI_INFO?.provider || null, model: AI_INFO?.model || null },
      cases: { ok: false, count: 0, ids: [] },
      legal: { ok: false, errors: [] },
      database: { ok: false, engine: "unknown", error: error?.message || String(error) },
      persistence: { required: env.REQUIRE_PERSISTENT_DB === "1", requirementSatisfied: false, readyForSensitiveCaseStorage: false },
      warnings: ["storage_runtime_invalid"],
    };
  }

  const database = runtime.primary === "postgres" ? await postgresDatabaseStatus() : await sqliteDatabaseStatus();
  const legal = validateLegalRegistry();
  const sqliteStorageInfo = runtime.primary === "sqlite"
    ? { ...runtime, sqliteExplicitPathConfigured: Boolean(String(env.DB_PATH || "").trim()), sqliteInMemory: env.DB_PATH === ":memory:" }
    : runtime;
  const persistence = evaluatePersistenceStatus({ env, storageInfo: sqliteStorageInfo });
  const caseIds = CASE_DOMAIN_REGISTRY.map((domain) => domain.id);
  const cases = { ok: caseIds.length === 5 && new Set(caseIds).size === 5, count: caseIds.length, ids: caseIds };
  const ready = database.ok && legal.ok && cases.ok && persistence.requirementSatisfied;
  const readyForSensitiveCaseStorage = database.ok && persistence.readyForSensitiveCaseStorage;
  const warnings = [];
  if (persistence.warning) warnings.push(persistence.warning);
  if (persistence.verificationWarning && !warnings.includes(persistence.verificationWarning)) warnings.push(persistence.verificationWarning);
  if (!AI_ENABLED) warnings.push("ai_demo_mode");

  return {
    ready,
    readyForSensitiveCaseStorage,
    build: buildStatus(env),
    storage: runtime,
    ai: { enabled: AI_ENABLED, provider: AI_INFO?.provider || null, model: AI_INFO?.model || null },
    cases,
    legal: { ok: legal.ok, errors: legal.errors },
    database,
    persistence,
    warnings,
  };
}
