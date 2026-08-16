import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";

process.env.DB_PATH = ":memory:";
process.env.REQUIRE_PERSISTENT_DB = "0";
process.env.PERSISTENT_STORAGE = "0";

const { evaluatePersistenceStatus, getRuntimeReadiness } = await import("../lib/runtime-readiness.js");
const { createCaseRouter } = await import("../lib/case-routes.js");

test("runtime readiness verifies database, five Case domains and Legal registry", async () => {
  const result = await getRuntimeReadiness();
  assert.equal(result.ready, true);
  assert.equal(result.readyForSensitiveCaseStorage, false);
  assert.equal(result.database.ok, true);
  assert.equal(result.database.engine, "sqlite");
  assert.equal(result.database.foreignKeysEnabled, true);
  assert.equal(result.cases.ok, true);
  assert.equal(result.cases.count, 5);
  assert.deepEqual(result.cases.ids, ["wage", "dismissal", "retirement", "worktime", "annual_leave"]);
  assert.equal(result.legal.ok, true);
  assert.deepEqual(result.legal.errors, []);
  assert.equal(result.persistence.required, false);
  assert.equal(result.persistence.durableStorageDeclared, false);
  assert.equal(result.persistence.dbPathConfigured, false, "an in-memory database must never count as a durable DB path");
  assert.equal(result.persistence.requirementSatisfied, true);
  assert.equal(result.persistence.readyForSensitiveCaseStorage, false);
  assert.ok(result.warnings.includes("persistent_storage_not_enforced"));
  assert.ok(result.warnings.includes("persistent_storage_not_verified"));
});

test("readiness never exposes configured database path values", async () => {
  const result = await getRuntimeReadiness({
    env: {
      ...process.env,
      DB_PATH: "/very/secret/production/location/app.db",
      RENDER_GIT_COMMIT: "test-commit",
    },
  });
  const serialized = JSON.stringify(result);
  assert.equal(result.build.commit, "test-commit");
  assert.doesNotMatch(serialized, /very\/secret/);
  assert.doesNotMatch(serialized, /production\/location/);
});

test("persistent requirement needs both a durable DB path and explicit storage verification", () => {
  const withoutVerification = evaluatePersistenceStatus({
    env: { REQUIRE_PERSISTENT_DB: "1", PERSISTENT_STORAGE: "0" },
    storageInfo: { explicitPathConfigured: true, inMemory: false },
  });
  assert.equal(withoutVerification.required, true);
  assert.equal(withoutVerification.dbPathConfigured, true);
  assert.equal(withoutVerification.durableStorageDeclared, false);
  assert.equal(withoutVerification.requirementSatisfied, false);
  assert.equal(withoutVerification.readyForSensitiveCaseStorage, false);

  const verified = evaluatePersistenceStatus({
    env: { REQUIRE_PERSISTENT_DB: "1", PERSISTENT_STORAGE: "1" },
    storageInfo: { explicitPathConfigured: true, inMemory: false },
  });
  assert.equal(verified.requirementSatisfied, true);
  assert.equal(verified.readyForSensitiveCaseStorage, true);
  assert.equal(verified.warning, null);
  assert.equal(verified.verificationWarning, null);
});

test("in-memory SQLite can never satisfy the persistent storage requirement", () => {
  const result = evaluatePersistenceStatus({
    env: { REQUIRE_PERSISTENT_DB: "1", PERSISTENT_STORAGE: "1" },
    storageInfo: { explicitPathConfigured: true, inMemory: true },
  });
  assert.equal(result.dbPathConfigured, false);
  assert.equal(result.requirementSatisfied, false);
  assert.equal(result.readyForSensitiveCaseStorage, false);
  assert.equal(result.warning, "persistent_storage_requirement_not_satisfied");
});

test("public Case readiness alias returns the non-secret snapshot without a Case token", async (t) => {
  const app = express();
  app.use(express.json());
  app.use("/api/cases", createCaseRouter());
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());

  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/api/cases/readiness`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ready, true);
  assert.equal(body.readyForSensitiveCaseStorage, false);
  assert.equal(body.cases.count, 5);
  assert.equal(body.legal.ok, true);
  assert.equal(body.database.ok, true);
});