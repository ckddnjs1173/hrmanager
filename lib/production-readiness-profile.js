import assert from "node:assert/strict";

const PROFILES = new Set(["free", "postgres-verified", "saas-postgres"]);

export function normalizeProductionReadinessProfile(value = "free") {
  const profile = String(value || "free").trim().toLowerCase();
  if (!PROFILES.has(profile)) throw new Error(`unsupported_production_readiness_profile:${profile}`);
  return profile;
}

function assertCommon(readiness, expectedCommit) {
  assert.equal(readiness.ready, true);
  assert.equal(readiness.build?.commit, expectedCommit);
  assert.equal(readiness.database?.ok, true);
  assert.equal(readiness.cases?.ok, true);
  assert.equal(readiness.cases?.count, 5);
  assert.deepEqual(readiness.cases?.ids, ["wage", "dismissal", "retirement", "worktime", "annual_leave"]);
  assert.equal(readiness.legal?.ok, true);
  assert.deepEqual(readiness.legal?.errors, []);
  assert.equal(readiness.deployment?.ok, true);
  assert.deepEqual(readiness.deployment?.errors, []);
  assert.doesNotMatch(JSON.stringify(readiness), /\/opt\/render|data\/app\.db|DB_PATH/i, "readiness must not expose database paths or env names");
}

function assertPostgresVerified(readiness) {
  assert.equal(readiness.readyForSensitiveCaseStorage, true);
  assert.equal(readiness.database?.engine, "postgres");
  assert.equal(readiness.persistence?.required, true);
  assert.equal(readiness.persistence?.durableStorageDeclared, true);
  assert.equal(readiness.persistence?.postgresConfigured, true);
  assert.equal(readiness.persistence?.storageTargetConfigured, true);
  assert.equal(readiness.persistence?.requirementSatisfied, true);
  assert.equal(readiness.persistence?.readyForSensitiveCaseStorage, true);
  assert.ok(!readiness.warnings?.includes("persistent_storage_not_enforced"));
  assert.ok(!readiness.warnings?.includes("persistent_storage_not_verified"));
}

export function assertProductionReadinessProfile(readiness, { expectedCommit, profile = "free" } = {}) {
  const normalized = normalizeProductionReadinessProfile(profile);
  assert.ok(expectedCommit, "expected commit is required");
  assertCommon(readiness, expectedCommit);

  if (normalized === "free") {
    assert.equal(readiness.readyForSensitiveCaseStorage, false, "free baseline must not claim durable Case storage");
    assert.equal(readiness.database?.engine, "sqlite");
    assert.equal(readiness.persistence?.required, false);
    assert.equal(readiness.persistence?.durableStorageDeclared, false);
    assert.equal(readiness.persistence?.requirementSatisfied, true);
    assert.equal(readiness.persistence?.readyForSensitiveCaseStorage, false);
    assert.equal(readiness.deployment?.saasEnabled, false);
    assert.ok(readiness.warnings?.includes("persistent_storage_not_enforced"));
    assert.ok(readiness.warnings?.includes("persistent_storage_not_verified"));
    return normalized;
  }

  assertPostgresVerified(readiness);

  if (normalized === "postgres-verified") {
    assert.equal(readiness.deployment?.saasEnabled, false, "PostgreSQL verification stage keeps SaaS fail-closed");
    return normalized;
  }

  assert.equal(readiness.deployment?.saasEnabled, true, "SaaS production profile requires SaaS to be enabled");
  return normalized;
}

export const PRODUCTION_READINESS_PROFILES = Object.freeze([...PROFILES]);
