import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";

process.env.DB_PATH = ":memory:";
const { createCaseRouter } = await import("../lib/case-routes.js");

async function startApp() {
  const app = express(); app.use(express.json()); app.use("/api/cases", createCaseRouter());
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

test("retirement API creates protected Case and prefilled claim resources", async (t) => {
  const { server, base } = await startApp(); t.after(() => server.close());
  const facts = {
    benefitType: "severance_pay", employmentStartDate: "2024-01-01", retirementDate: "2026-08-01",
    averageWeeklyScheduledHours: 40, hadUnder15HourPeriods: false, hasAverageWageExcludedPeriod: false,
    threeMonthWageTotal: 9200000, annualBonusTotal12m: 1200000, annualLeaveAllowanceForAverageWage: 400000,
    ordinaryDailyWage: 100000, amountAlreadyPaid: 0,
    evidence: { employmentContract: "have", payslips3m: "have", bankHistory: "planned" },
  };
  const createdRes = await fetch(`${base}/api/cases/retirement-intake`, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({facts}) });
  assert.equal(createdRes.status, 201);
  const created = await createdRes.json();
  assert.ok(created.case.id && created.accessToken);
  assert.equal(created.legal.money.outstandingEstimate, 8087671);
  assert.ok(created.documents.some((doc) => doc.templateKey === "certmail"));

  const denied = await fetch(`${base}/api/cases/${created.case.id}/retirement-intake`);
  assert.equal(denied.status, 401);
  const headers = { "x-case-token": created.accessToken };
  const docRes = await fetch(`${base}/api/cases/${created.case.id}/retirement-document/certmail`, { method:"POST", headers:{...headers,"content-type":"application/json"}, body:JSON.stringify({values:{to:"테스트회사"}}) });
  assert.equal(docRes.status, 200);
  const doc = await docRes.json();
  assert.match(doc.document.text, /8,087,671원/);

  const reportRes = await fetch(`${base}/api/cases/${created.case.id}/retirement-report`, { headers });
  assert.equal(reportRes.status, 200);
  const report = await reportRes.json();
  assert.match(report.text, /퇴직금·퇴직연금 사건 요약/);
  assert.match(report.text, /8,087,671원/);
});
