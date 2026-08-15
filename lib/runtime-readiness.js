import { db } from "./db.js";
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

function persistenceStatus() {
  const required = process.env.REQUIRE_PERSISTENT_DB === "1";
  const dbPathConfigured = Boolean(String(process.env.DB_PATH || "").trim());
  const requirementSatisfied = !required || dbPathConfigured;
  return {
    required,
    dbPathConfigured,
    requirementSatisfied,
    warning: required ? null : "persistent_storage_not_enforced",
  };
}

function buildStatus() {
  return {
    commit: process.env.RENDER_GIT_COMMIT || process.env.GITHUB_SHA || null,
    branch: process.env.RENDER_GIT_BRANCH || process.env.GITHUB_REF_NAME || null,
    environment: process.env.NODE_ENV || "development",
    node: process.version,
  };
}

export function getRuntimeReadiness() {
  const database = databaseStatus();
  const legal = validateLegalRegistry();
  const persistence = persistenceStatus();
  const caseIds = CASE_DOMAIN_REGISTRY.map((domain) => domain.id);
  const cases = {
    ok: caseIds.length === 5 && new Set(caseIds).size === 5,
    count: caseIds.length,
    ids: caseIds,
  };

  const ready = database.ok && legal.ok && cases.ok && persistence.requirementSatisfied;
  const warnings = [];
  if (persistence.warning) warnings.push(persistence.warning);
  if (!AI_ENABLED) warnings.push("ai_demo_mode");

  return {
    ready,
    build: buildStatus(),
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
