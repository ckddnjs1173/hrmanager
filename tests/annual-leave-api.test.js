import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
process.env.DB_PATH=":memory:";
const { createCaseRouter }=await import("../lib/case-routes.js");
async function startApp(){const app=express();app.use(express.json());app.use("/api/cases",createCaseRouter());const server=app.listen(0,"127.0.0.1");await once(server,"listening");return{server,base:`http://127.0.0.1:${server.address().port}`};}

test("annual leave API creates protected Case and exposes claim resources",async(t)=>{
  const {server,base}=await startApp();t.after(()=>server.close());
  const facts={referenceDate:"2026-08-16",employmentStartDate:"2024-01-01",employmentStatus:"current",workplaceEmployeeCount:8,fivePlusContinuouslyPastYear:true,averageWeeklyScheduledHours:40,attendanceRatePercent:100,claimedUnusedDays:5,dailyLeavePayAmount:100000,amountAlreadyPaid:0,usePromotionImplemented:false,employerPreventedUse:false,evidence:{leaveLedger:"have",attendanceRecord:"have",payslip:"planned"}};
  const createdRes=await fetch(`${base}/api/cases/annual-leave-intake`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({facts})});
  assert.equal(createdRes.status,201);const created=await createdRes.json();assert.ok(created.case.id&&created.accessToken);assert.equal(created.legal.money.outstandingEstimate,500000);assert.equal(created.legal.entitlement.latestAnnualGrant.days,15);assert.ok(created.documents.some((doc)=>doc.templateKey==="certmail"));
  const denied=await fetch(`${base}/api/cases/${created.case.id}/annual-leave-intake`);assert.equal(denied.status,401);
  const headers={"x-case-token":created.accessToken};
  const loaded=await fetch(`${base}/api/cases/${created.case.id}/annual-leave-intake`,{headers});assert.equal(loaded.status,200);
  const docRes=await fetch(`${base}/api/cases/${created.case.id}/annual-leave-document/certmail`,{method:"POST",headers:{...headers,"content-type":"application/json"},body:JSON.stringify({values:{to:"테스트회사"}})});assert.equal(docRes.status,200);const doc=await docRes.json();assert.match(doc.document.text,/500,000원/);
  const reportRes=await fetch(`${base}/api/cases/${created.case.id}/annual-leave-report`,{headers});assert.equal(reportRes.status,200);const report=await reportRes.json();assert.match(report.text,/연차유급휴가·미사용수당 사건 요약/);assert.match(report.text,/500,000원/);
});
