import assert from "node:assert/strict";

const BASE = String(process.env.PRODUCTION_URL || "https://insaya.onrender.com").replace(/\/$/, "");
const EXPECTED_COMMIT = String(process.env.EXPECTED_COMMIT || "").trim();
const DEPLOY_TIMEOUT_MS = Number(process.env.DEPLOY_TIMEOUT_MS || 8 * 60 * 1000);
const POLL_MS = Number(process.env.DEPLOY_POLL_MS || 10000);

if (!EXPECTED_COMMIT) throw new Error("EXPECTED_COMMIT is required");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => null);
  return { response, body };
}

async function waitForExpectedDeploy() {
  const deadline = Date.now() + DEPLOY_TIMEOUT_MS;
  let last = "no response";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/build-info.json?t=${Date.now()}`, {
        headers: { "cache-control": "no-cache" },
      });
      if (response.ok) {
        const info = await response.json();
        last = `commit=${info?.commit || "missing"}`;
        if (info?.commit === EXPECTED_COMMIT) return info;
      } else {
        last = `HTTP ${response.status}`;
      }
    } catch (error) {
      last = error?.message || String(error);
    }
    console.log(`… production deploy not ready (${last})`);
    await sleep(POLL_MS);
  }
  throw new Error(`production did not expose expected commit ${EXPECTED_COMMIT} within ${DEPLOY_TIMEOUT_MS}ms; last=${last}`);
}

async function assertPublicPages() {
  const health = await fetchJson("/api/health");
  assert.equal(health.response.status, 200, "health endpoint must return 200");
  assert.equal(typeof health.body?.ai, "boolean");

  for (const path of ["/", "/wage-intake"]) {
    const response = await fetch(`${BASE}${path}`, { headers: { "cache-control": "no-cache" } });
    assert.equal(response.status, 200, `${path} must return 200`);
    const text = await response.text();
    assert.match(text, /인사야/, `${path} must render the brand`);
  }
}

async function exerciseSyntheticCase() {
  let caseId = null;
  let token = null;
  try {
    const created = await fetchJson("/api/cases/wage-intake", {
      method: "POST",
      body: JSON.stringify({
        facts: {
          employmentStatus: "resigned",
          employmentStartDate: "2025-01-02",
          employmentEndDate: "2026-08-01",
          payDay: "매월 10일",
          unpaidPeriodStart: "2026-07-01",
          unpaidPeriodEnd: "2026-07-31",
          monthlyBasePay: 3000000,
          alreadyPaidAmount: 0,
          unpaidItems: ["월급"],
          overtimeWork: false,
          nightWork: false,
          holidayWork: false,
          unusedAnnualLeave: false,
          evidence: {
            employmentContract: "have",
            payslip: "have",
            bankHistory: "planned",
          },
        },
      }),
    });

    assert.equal(created.response.status, 201, "synthetic Case must be created");
    caseId = created.body?.case?.id;
    token = created.body?.accessToken;
    assert.ok(caseId, "Case id must be returned");
    assert.ok(token, "Case access token must be returned");
    assert.equal(created.body?.money?.principal, 3000000);
    assert.equal(created.body?.legal?.minimumWage?.hourly, 10320);
    assert.ok(created.body?.legal?.sources?.length >= 1);

    const headers = { "x-case-token": token };
    const loaded = await fetchJson(`/api/cases/${encodeURIComponent(caseId)}/wage-intake`, { headers });
    assert.equal(loaded.response.status, 200);
    assert.equal(loaded.body?.case?.id, caseId);

    const documentResult = await fetchJson(`/api/cases/${encodeURIComponent(caseId)}/wage-document/certmail`, {
      method: "POST",
      headers,
      body: JSON.stringify({ values: { to: "운영 스모크 테스트 사업장" } }),
    });
    assert.equal(documentResult.response.status, 200);
    assert.match(documentResult.body?.document?.text || "", /3,000,000원/);

    const report = await fetchJson(`/api/cases/${encodeURIComponent(caseId)}/wage-report`, { headers });
    assert.equal(report.response.status, 200);
    assert.match(report.body?.text || "", /인사야 임금체불 사건 요약/);
    assert.match(report.body?.text || "", /3,000,000원/);
  } finally {
    if (caseId && token) {
      const response = await fetch(`${BASE}/api/cases/${encodeURIComponent(caseId)}`, {
        method: "DELETE",
        headers: { "x-case-token": token },
      }).catch(() => null);
      if (response && response.status !== 204 && response.status !== 404) {
        console.warn(`⚠ synthetic Case cleanup returned ${response.status}`);
      }
    }
  }
}

const info = await waitForExpectedDeploy();
console.log(`✅ expected Render deploy live: ${info.commit.slice(0, 12)} · ${info.branch || "branch unknown"}`);
await assertPublicPages();
await exerciseSyntheticCase();
console.log(`✅ production smoke passed: ${BASE}`);
