import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";

process.env.DB_PATH = ":memory:";
const { createCaseRouter } = await import("../lib/case-routes.js");

async function startApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/cases", createCaseRouter());
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  return { server, base: `http://127.0.0.1:${port}` };
}

function authHeaders(token, json = false) {
  return {
    ...(json ? { "content-type": "application/json" } : {}),
    "x-case-token": token,
  };
}

test("wage intake API creates and advances a protected case", async (t) => {
  const { server, base } = await startApp();
  t.after(() => server.close());

  const createdRes = await fetch(`${base}/api/cases/wage-intake`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      facts: {
        employmentStatus: "resigned",
        unpaidItems: ["7월 월급"],
      },
    }),
  });

  assert.equal(createdRes.status, 201);
  const created = await createdRes.json();
  assert.equal(created.case.case_type, "wage_arrears");
  assert.equal(created.case.status, "intake");
  assert.ok(created.case.id);
  assert.ok(created.accessToken);
  assert.equal(created.intake.step, "dates");
  assert.deepEqual(
    created.intake.questions.map((item) => item.key),
    ["employmentEndDate", "payDay", "unpaidPeriodStart"]
  );

  const id = created.case.id;
  const token = created.accessToken;

  const deniedRes = await fetch(`${base}/api/cases/${id}/wage-intake`);
  assert.equal(deniedRes.status, 401);

  const missingFactsRes = await fetch(`${base}/api/cases/${id}/wage-intake`, {
    method: "PATCH",
    headers: authHeaders(token, true),
    body: JSON.stringify({}),
  });
  assert.equal(missingFactsRes.status, 400);

  const datesRes = await fetch(`${base}/api/cases/${id}/wage-intake`, {
    method: "PATCH",
    headers: authHeaders(token, true),
    body: JSON.stringify({
      facts: {
        employmentStartDate: "2025-01-02",
        employmentEndDate: "2026-08-01",
        payDay: "매월 10일",
        unpaidPeriodStart: "2026-07-01",
        unpaidPeriodEnd: "2026-07-31",
      },
    }),
  });

  assert.equal(datesRes.status, 200);
  const dates = await datesRes.json();
  assert.equal(dates.intake.step, "money");
  assert.equal(dates.case.status, "intake");
  assert.deepEqual(
    dates.intake.questions.map((item) => item.key),
    ["wageAmount", "alreadyPaidAmount"]
  );

  const moneyRes = await fetch(`${base}/api/cases/${id}/wage-intake`, {
    method: "PATCH",
    headers: authHeaders(token, true),
    body: JSON.stringify({
      facts: {
        monthlyBasePay: 3000000,
        alreadyPaidAmount: 0,
        evidence: {
          payslip: "have",
        },
      },
    }),
  });

  assert.equal(moneyRes.status, 200);
  const money = await moneyRes.json();
  assert.equal(money.intake.coreComplete, true);
  assert.equal(money.intake.readyForWorkspace, true);
  assert.equal(money.intake.step, "extra_pay");
  assert.equal(money.case.status, "active");
  assert.deepEqual(money.case.missing_facts, []);
  assert.equal(money.case.period_start, "2026-07-01");
  assert.equal(money.case.period_end, "2026-07-31");
  assert.equal(money.case.employment_end_date, "2026-08-01");
  assert.equal(money.intake.evidence.haveCount, 1);

  const evidenceRes = await fetch(`${base}/api/cases/${id}/wage-intake`, {
    method: "PATCH",
    headers: authHeaders(token, true),
    body: JSON.stringify({
      facts: {
        evidence: {
          bankHistory: "planned",
        },
      },
    }),
  });

  assert.equal(evidenceRes.status, 200);
  const evidence = await evidenceRes.json();
  assert.equal(evidence.case.facts.evidence.payslip, "have");
  assert.equal(evidence.case.facts.evidence.bankHistory, "planned");
  assert.equal(evidence.intake.evidence.haveCount, 1);
  assert.equal(evidence.intake.evidence.knownCount, 2);

  const foundRes = await fetch(`${base}/api/cases/${id}/wage-intake`, {
    headers: authHeaders(token),
  });
  assert.equal(foundRes.status, 200);
  const found = await foundRes.json();
  assert.equal(found.case.status, "active");
  assert.equal(found.intake.readyForWorkspace, true);
});

test("wage intake endpoint rejects a different case type", async (t) => {
  const { server, base } = await startApp();
  t.after(() => server.close());

  const createdRes = await fetch(`${base}/api/cases`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      case_type: "dismissal",
      title: "해고 사건",
    }),
  });

  assert.equal(createdRes.status, 201);
  const created = await createdRes.json();

  const intakeRes = await fetch(
    `${base}/api/cases/${created.case.id}/wage-intake`,
    { headers: authHeaders(created.accessToken) }
  );

  assert.equal(intakeRes.status, 409);
  assert.deepEqual(await intakeRes.json(), { error: "case_type_mismatch" });
});
