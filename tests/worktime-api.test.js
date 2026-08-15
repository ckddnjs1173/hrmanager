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

test("working-time API creates protected Case and exposes money, documents and report", async (t) => {
  const { server, base } = await startApp(); t.after(() => server.close());
  const facts = {
    referenceDate: "2026-08-16", workplaceEmployeeCount: 8, standardWorkSystem: true,
    ordinaryHourlyWage: 20000, baseWageForExtraHoursPaid: true, amountAlreadyPaid: 0,
    weekdayOvertimeDayHours: 10, weekdayOvertimeNightHours: 2,
    holidayDayUpTo8Hours: 0, holidayNightUpTo8Hours: 0, holidayDayOver8Hours: 0, holidayNightOver8Hours: 0,
    maxWeeklyOvertimeHours: 13, representativeDailyWorkHours: 9, representativeBreakMinutes: 30,
    evidence: { attendanceRecord: "have", workSchedule: "have", payslip: "planned" },
  };

  const createdRes = await fetch(`${base}/api/cases/worktime-intake`, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({facts}) });
  assert.equal(createdRes.status, 201);
  const created = await createdRes.json();
  assert.ok(created.case.id && created.accessToken);
  assert.equal(created.legal.premium.outstandingEstimate, 140000);
  assert.equal(created.legal.weeklyOvertime.status, "possible_over_12_hour_limit");
  assert.equal(created.legal.break.status, "possible_shortfall");
  assert.ok(created.documents.some((doc) => doc.templateKey === "certmail"));

  const denied = await fetch(`${base}/api/cases/${created.case.id}/worktime-intake`);
  assert.equal(denied.status, 401);
  const headers = { "x-case-token": created.accessToken };

  const loaded = await fetch(`${base}/api/cases/${created.case.id}/worktime-intake`, { headers });
  assert.equal(loaded.status, 200);

  const docRes = await fetch(`${base}/api/cases/${created.case.id}/worktime-document/certmail`, { method:"POST", headers:{...headers,"content-type":"application/json"}, body:JSON.stringify({values:{to:"테스트회사"}}) });
  assert.equal(docRes.status, 200);
  const doc = await docRes.json();
  assert.match(doc.document.text, /140,000원/);

  const reportRes = await fetch(`${base}/api/cases/${created.case.id}/worktime-report`, { headers });
  assert.equal(reportRes.status, 200);
  const report = await reportRes.json();
  assert.match(report.text, /근로시간·연장\/야간\/휴일수당 사건 요약/);
  assert.match(report.text, /140,000원/);
});
