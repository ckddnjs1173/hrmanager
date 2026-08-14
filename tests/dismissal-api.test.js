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

test("dismissal API creates protected case and exposes legal/doc/report resources", async (t) => {
  const { server, base } = await startApp();
  t.after(() => server.close());

  const createdRes = await fetch(`${base}/api/cases/dismissal-intake`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      facts: {
        separationType: "dismissal",
        employmentStartDate: "2025-01-01",
        noticeDate: "2026-07-20",
        effectiveDate: "2026-08-01",
        workplaceEmployeeCount: 8,
        writtenNoticeReceived: false,
        noticePayPaid: false,
        ordinaryDailyWage: 120000,
        employerReason: "성과",
        evidence: { dismissalNotice: "have", messagesWithEmployer: "have", employmentContract: "have" },
      },
    }),
  });

  assert.equal(createdRes.status, 201);
  const created = await createdRes.json();
  assert.ok(created.case.id);
  assert.ok(created.accessToken);
  assert.equal(created.legal.laborBoardEligibleBaseline, true);
  assert.equal(created.legal.noticeAllowance.amount, 3600000);
  assert.ok(created.documents.some((doc) => doc.templateKey === "relief_app"));
  assert.ok(created.procedures.some((item) => item.id === "dismissal.nlrc_relief"));

  const headers = { "x-case-token": created.accessToken };
  const denied = await fetch(`${base}/api/cases/${created.case.id}/dismissal-intake`);
  assert.equal(denied.status, 401);

  const loaded = await fetch(`${base}/api/cases/${created.case.id}/dismissal-intake`, { headers });
  assert.equal(loaded.status, 200);

  const docRes = await fetch(`${base}/api/cases/${created.case.id}/dismissal-document/relief_app`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ values: { from: "테스트근로자", biz: "테스트사업장" } }),
  });
  assert.equal(docRes.status, 200);
  const doc = await docRes.json();
  assert.match(doc.document.text, /2026-08-01/);
  assert.match(doc.document.text, /테스트사업장/);

  const reportRes = await fetch(`${base}/api/cases/${created.case.id}/dismissal-report`, { headers });
  assert.equal(reportRes.status, 200);
  const report = await reportRes.json();
  assert.match(report.text, /해고·권고사직 사건 요약/);
  assert.match(report.text, /3,600,000원/);

  const updatedRes = await fetch(`${base}/api/cases/${created.case.id}/dismissal-intake`, {
    method: "PATCH",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ facts: { writtenNoticeReceived: true } }),
  });
  assert.equal(updatedRes.status, 200);
  const updated = await updatedRes.json();
  assert.equal(updated.case.facts.writtenNoticeReceived, true);
  assert.equal(updated.case.facts.evidence.dismissalNotice, "have");
});
