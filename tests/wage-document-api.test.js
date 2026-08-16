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

test("case document endpoint is protected and pre-fills case money and period", async (t) => {
  const { server, base } = await startApp();
  t.after(() => server.close());

  const createdRes = await fetch(`${base}/api/cases/wage-intake`, {
    method: "POST",
    headers: { "content-type": "application/json" },
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
      },
    }),
  });

  assert.equal(createdRes.status, 201);
  const created = await createdRes.json();
  const path = `${base}/api/cases/${created.case.id}/wage-document/certmail`;

  const denied = await fetch(path, { method: "POST" });
  assert.equal(denied.status, 401);

  const renderedRes = await fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-case-token": created.accessToken,
    },
    body: JSON.stringify({ values: { to: "테스트회사" } }),
  });

  assert.equal(renderedRes.status, 200);
  const rendered = await renderedRes.json();
  const expectedAmount = created.money.knownTotalEstimate;
  assert.equal(rendered.templateKey, "certmail");
  assert.equal(rendered.values.amount, expectedAmount);
  assert.match(rendered.document.text, new RegExp(`${Number(expectedAmount).toLocaleString("ko-KR")}원`));
  assert.match(rendered.document.text, /2026-07-01 ~ 2026-07-31/);
  assert.match(rendered.document.text, /테스트회사/);
});