import { db, dbStorageInfo } from "./db.js";
import { AI_ENABLED, AI_INFO } from "./ai.js";
import { CASE_DOMAIN_REGISTRY } from "./case-domain-registry.js";
import { validateLegalRegistry } from "./legal-registry.js";
import { REQUIRED_APP_TABLES } from "./sqlite-backup.js";

function databaseStatus() {
  try {
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
    return {
      ok: false,
      engine: "sqlite",
      error: "database_probe_failed",
      detail: error?.message || String(error),
    };
  }
}

export function evaluatePersistenceStatus({ env = process.env, storageInfo = dbStorageInfo } = {}) {
  const required = env.REQUIRE_PERSISTENT_DB === "1";
  // PERSISTENT_STORAGE=1 is an explicit operator attestation. Set it only after restart/redeploy survival is verified.
  const durableStorageDeclared = env.PERSISTENT_STORAGE === "1";
  const dbPathConfigured = Boolean(storageInfo?.explicitPathConfigured) && storageInfo?.inMemory !== true;
  const readyForSensitiveCaseStorage = durableStorageDeclared && dbPathConfigured;
  const requirementSatisfied = !required || readyForSensitiveCaseStorage;

  return {
    required,
    durableStorageDeclared,
    dbPathConfigured,
    requirementSatisfied,
    readyForSensitiveCaseStorage,
    warning: required
      ? (requirementSatisfied ? null : "persistent_storage_requirement_not_satisfied")
      : "persistent_storage_not_enforced",
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

export function getRuntimeReadiness({ env = process.env } = {}) {
  const database = databaseStatus();
  const legal = validateLegalRegistry();
  const persistence = evaluatePersistenceStatus({ env, storageInfo: dbStorageInfo });
  const caseIds = CASE_DOMAIN_REGISTRY.map((domain) => domain.id);
  const cases = {
    ok: caseIds.length === 5 && new Set(caseIds).size === 5,
    count: caseIds.length,
    ids: caseIds,
  };

  const ready = database.ok && legal.ok && cases.ok && persistence.requirementSatisfied;
  const readyForSensitiveCaseStorage = database.ok && persistence.readyForSensitiveCaseStorage;
  const warnings = [];
  if (persistence.warning) warnings.push(persistence.warning);
  if (persistence.verificationWarning && !warnings.includes(persistence.verificationWarning)) {
    warnings.push(persistence.verificationWarning);
  }
  if (!AI_ENABLED) warnings.push("ai_demo_mode");

  return {
    ready,
    readyForSensitiveCaseStorage,
    build: buildStatus(env),
    ai: {
      enabled: AI_ENABLED,
      provider: AI_INFO?.provider || null,
      model: AI_INFO?.model || null,
    },
    cases,
    legal: {
      ok: legal.ok,
      errors: legal.errors,
    },
    database,
    persistence,
    warnings,
  };
}
