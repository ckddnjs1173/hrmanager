import assert from "node:assert/strict";
import { assertProductionReadinessProfile, normalizeProductionReadinessProfile } from "../lib/production-readiness-profile.js";

const BASE = String(process.env.PRODUCTION_URL || "https://insaya.onrender.com").replace(/\/$/, "");
const EXPECTED_COMMIT = String(process.env.EXPECTED_COMMIT || "").trim();
const PROFILE = normalizeProductionReadinessProfile(process.env.EXPECTED_PRODUCTION_PROFILE || "free");
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
      last = `HTTP ${response.status}, commit=${body?.build?.commit || "missing"}, engine=${body?.database?.engine || "missing"}`;
      if (response.ok && body?.build?.commit === EXPECTED_COMMIT) return body;
    } catch (error) {
      last = error?.message || String(error);
    }
    await sleep(POLL_MS);
  }
  throw new Error(`runtime readiness did not reach expected commit ${EXPECTED_COMMIT}; last=${last}`);
}

const readiness = await waitForReadiness();
assertProductionReadinessProfile(readiness, { expectedCommit: EXPECTED_COMMIT, profile: PROFILE });

// Backward compatibility: existing operational clients may still call the Case-scoped alias.
const aliasResponse = await fetch(`${BASE}/api/cases/readiness?t=${Date.now()}`, {
  headers: { "cache-control": "no-cache" },
});
assert.equal(aliasResponse.status, 200);
const alias = await aliasResponse.json();
assert.equal(alias.build?.commit, EXPECTED_COMMIT);
assert.equal(alias.ready, readiness.ready);
assert.equal(alias.readyForSensitiveCaseStorage, readiness.readyForSensitiveCaseStorage);
assert.equal(alias.database?.engine, readiness.database?.engine);

console.log(`✅ runtime readiness passed · ${EXPECTED_COMMIT.slice(0, 12)} · profile=${PROFILE} · ${BASE}`);
