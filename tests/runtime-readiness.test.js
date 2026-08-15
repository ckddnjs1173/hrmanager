import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";

process.env.DB_PATH = ":memory:";
process.env.REQUIRE_PERSISTENT_DB = "0";

const { getRuntimeReadiness } = await import("../lib/runtime-readiness.js");
const { createCaseRouter } = await import("../lib/case-routes.js");

test("runtime readiness verifies database, five Case domains and Legal registry", () => {
  const result = getRuntimeReadiness();
  assert.equal(result.ready, true);
  assert.equal(result.database.ok, true);
  assert.equal(result.database.engine, "sqlite");
  assert.equal(result.database.foreignKeysEnabled, true);
  assert.equal(result.cases.ok, true);
  assert.equal(result.cases.count, 5);
  assert.deepEqual(result.cases.ids, ["wage", "dismissal", "retirement", "worktime", "annual_leave"]);
  assert.equal(result.legal.ok, true);
  assert.deepEqual(result.legal.errors, []);
  assert.equal(result.persistence.required, false);
  assert.equal(result.persistence.requirementSatisfied, true);
  assert.ok(result.warnings.includes("persistent_storage_not_enforced"));
});

test("readiness never exposes the configured database path", () => {
  process.env.DB_PATH = "/very/secret/production/location/app.db";
  const result = getRuntimeReadiness();
  const serialized = JSON.stringify(result);
  assert.equal(result.persistence.dbPathConfigured, true);
  assert.doesNotMatch(serialized, /very\/secret/);
  assert.doesNotMatch(serialized, /production\/location/);
  process.env.DB_PATH = ":memory:";
});

test("persistent requirement fails closed when DB_PATH is not configured", () => {
  const previous = process.env.DB_PATH;
  delete process.env.DB_PATH;
  process.env.REQUIRE_PERSISTENT_DB = "1";
  const result = getRuntimeReadiness();
  assert.equal(result.persistence.required, true);
  assert.equal(result.persistence.dbPathConfigured, false);
  assert.equal(result.persistence.requirementSatisfied, false);
  assert.equal(result.ready, false);
  process.env.REQUIRE_PERSISTENT_DB = "0";
  process.env.DB_PATH = previous;
});

test("public Case readiness endpoint returns the non-secret snapshot without a Case token", async (t) => {
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
  assert.equal(body.cases.count, 5);
  assert.equal(body.legal.ok, true);
  assert.equal(body.database.ok, true);
});
