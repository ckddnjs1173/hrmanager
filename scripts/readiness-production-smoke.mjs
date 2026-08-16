import assert from "node:assert/strict";

const BASE = String(process.env.PRODUCTION_URL || "https://insaya.onrender.com").replace(/\/$/, "");
const EXPECTED_COMMIT = String(process.env.EXPECTED_COMMIT || "").trim();
const TIMEOUT = Number(process.env.DEPLOY_TIMEOUT_MS || 8 * 60 * 1000);
const POLL_MS = Number(process.env.DEPLOY_POLL_MS || 10000);

if (!EXPECTED_COMMIT) throw new Error("EXPECTED_COMMIT is required");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForReadiness() {
  const deadline = Date.now() + TIMEOUT;
  let last = "no response";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/api/readiness?t=${Date.now()}`, {
        headers: { "cache-control": "no-cache" },
      });
      const body = await response.json().catch(() => null);
      last = `HTTP ${response.status}, commit=${body?.build?.commit || "missing"}`;
      if (response.ok && body?.build?.commit === EXPECTED_COMMIT) return body;
    } catch (error) {
      last = error?.message || String(error);
    }
    await sleep(POLL_MS);
  }
  throw new Error(`runtime readiness did not reach expected commit ${EXPECTED_COMMIT}; last=${last}`);
}

const readiness = await waitForReadiness();
assert.equal(readiness.ready, true);
assert.equal(readiness.readyForSensitiveCaseStorage, false, "free Render baseline must not claim durable Case storage");
assert.equal(readiness.build.commit, EXPECTED_COMMIT);
assert.equal(readiness.database?.ok, true);
assert.equal(readiness.database?.engine, "sqlite");
assert.equal(readiness.database?.foreignKeysEnabled, true);
assert.equal(readiness.cases?.ok, true);
assert.equal(readiness.cases?.count, 5);
assert.deepEqual(readiness.cases?.ids, ["wage", "dismissal", "retirement", "worktime", "annual_leave"]);
assert.equal(readiness.legal?.ok, true);
assert.deepEqual(readiness.legal?.errors, []);
assert.equal(readiness.persistence?.required, false, "free Render deployment should not pretend persistent storage is enforced");
assert.equal(readiness.persistence?.durableStorageDeclared, false, "free Render deployment must not attest durable storage");
assert.equal(readiness.persistence?.requirementSatisfied, true);
assert.equal(readiness.persistence?.readyForSensitiveCaseStorage, false);
assert.ok(readiness.warnings?.includes("persistent_storage_not_enforced"));
assert.ok(readiness.warnings?.includes("persistent_storage_not_verified"));
assert.doesNotMatch(JSON.stringify(readiness), /\/opt\/render|data\/app\.db|DB_PATH/i, "readiness must not expose database paths or env names");

// Backward compatibility: existing operational clients may still call the Case-scoped alias.
const aliasResponse = await fetch(`${BASE}/api/cases/readiness?t=${Date.now()}`, {
  headers: { "cache-control": "no-cache" },
});
assert.equal(aliasResponse.status, 200);
const alias = await aliasResponse.json();
assert.equal(alias.build?.commit, EXPECTED_COMMIT);
assert.equal(alias.ready, readiness.ready);
assert.equal(alias.readyForSensitiveCaseStorage, readiness.readyForSensitiveCaseStorage);

console.log(`✅ runtime readiness passed · ${EXPECTED_COMMIT.slice(0, 12)} · ${BASE}`);
