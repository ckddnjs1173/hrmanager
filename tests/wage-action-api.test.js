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

function headers(token) {
  return {
    "content-type": "application/json",
    "x-case-token": token,
  };
}

async function patchFacts(base, id, token, facts) {
  const response = await fetch(`${base}/api/cases/${id}/wage-intake`, {
    method: "PATCH",
    headers: headers(token),
    body: JSON.stringify({ facts }),
  });
  assert.equal(response.status, 200);
  return response.json();
}

test("wage intake API persists one server-owned next best action", async (t) => {
  const { server, base } = await startApp();
  t.after(() => server.close());

  const createdRes = await fetch(`${base}/api/cases/wage-intake`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      facts: {
        employmentStatus: "resigned",
        unpaidItems: ["월급"],
      },
    }),
  });
  assert.equal(createdRes.status, 201);
  const created = await createdRes.json();
  const { id } = created.case;
  const token = created.accessToken;

  assert.equal(created.nextAction.id, "wage.complete_intake");
  assert.equal(created.case.actions.length, 1);
  assert.equal(created.case.actions[0].id, created.nextAction.id);

  const core = await patchFacts(base, id, token, {
    employmentStartDate: "2025-01-02",
    employmentEndDate: "2026-08-01",
    payDay: "매월 10일",
    unpaidPeriodStart: "2026-07-01",
    unpaidPeriodEnd: "2026-07-31",
    monthlyBasePay: 3000000,
    alreadyPaidAmount: 0,
  });
  assert.equal(core.nextAction.id, "wage.confirm_extra_pay");
  assert.equal(core.case.actions[0].id, core.nextAction.id);

  const extras = await patchFacts(base, id, token, {
    overtimeWork: false,
    nightWork: false,
    holidayWork: false,
    unusedAnnualLeave: false,
  });
  assert.equal(extras.nextAction.id, "wage.gather_evidence");
  assert.equal(extras.nextAction.target, "evidence");

  const evidence = await patchFacts(base, id, token, {
    evidence: {
      employmentContract: "have",
      payslip: "have",
      bankHistory: "planned",
    },
  });
  assert.equal(evidence.nextAction.id, "wage.review_case");
  assert.equal(evidence.nextAction.target, "facts");
  assert.equal(evidence.case.actions[0].id, evidence.nextAction.id);
});
