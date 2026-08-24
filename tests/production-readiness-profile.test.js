import test from "node:test";
import assert from "node:assert/strict";
import { assertProductionReadinessProfile, normalizeProductionReadinessProfile } from "../lib/production-readiness-profile.js";

const commit = "67b752be017cb49c6630da0c431660da31c6b105";

function baseReadiness() {
  return {
    ready: true,
    readyForSensitiveCaseStorage: false,
    build: { commit },
    database: { ok: true, engine: "sqlite" },
    cases: { ok: true, count: 5, ids: ["wage", "dismissal", "retirement", "worktime", "annual_leave"] },
    legal: { ok: true, errors: [] },
    persistence: {
      required: false,
      durableStorageDeclared: false,
      postgresConfigured: false,
      storageTargetConfigured: false,
      requirementSatisfied: true,
      readyForSensitiveCaseStorage: false,
    },
    deployment: { ok: true, saasEnabled: false, errors: [], warnings: ["persistent_storage_not_enforced"] },
    warnings: ["persistent_storage_not_enforced", "persistent_storage_not_verified"],
  };
}

function postgresReadiness({ saasEnabled = false } = {}) {
  const readiness = baseReadiness();
  readiness.readyForSensitiveCaseStorage = true;
  readiness.database.engine = "postgres";
  readiness.persistence = {
    required: true,
    durableStorageDeclared: true,
    postgresConfigured: true,
    storageTargetConfigured: true,
    requirementSatisfied: true,
    readyForSensitiveCaseStorage: true,
  };
  readiness.deployment = { ok: true, saasEnabled, errors: [], warnings: [] };
  readiness.warnings = [];
  return readiness;
}

test("normalizes only supported production readiness profiles", () => {
  assert.equal(normalizeProductionReadinessProfile(), "free");
  assert.equal(normalizeProductionReadinessProfile(" POSTGRES-VERIFIED "), "postgres-verified");
  assert.throws(() => normalizeProductionReadinessProfile("unknown"), /unsupported_production_readiness_profile/);
});

test("free profile requires SQLite and unverified persistence", () => {
  assert.equal(assertProductionReadinessProfile(baseReadiness(), { expectedCommit: commit, profile: "free" }), "free");
  assert.throws(() => assertProductionReadinessProfile(postgresReadiness(), { expectedCommit: commit, profile: "free" }));
});

test("postgres-verified profile requires durable PostgreSQL while SaaS stays off", () => {
  assert.equal(assertProductionReadinessProfile(postgresReadiness(), { expectedCommit: commit, profile: "postgres-verified" }), "postgres-verified");
  assert.throws(() => assertProductionReadinessProfile(postgresReadiness({ saasEnabled: true }), { expectedCommit: commit, profile: "postgres-verified" }));
});

test("saas-postgres profile requires durable PostgreSQL and SaaS enabled", () => {
  assert.equal(assertProductionReadinessProfile(postgresReadiness({ saasEnabled: true }), { expectedCommit: commit, profile: "saas-postgres" }), "saas-postgres");
  assert.throws(() => assertProductionReadinessProfile(postgresReadiness(), { expectedCommit: commit, profile: "saas-postgres" }));
});

test("all profiles reject a mismatched deployed commit", () => {
  assert.throws(() => assertProductionReadinessProfile(baseReadiness(), { expectedCommit: "different", profile: "free" }));
});
