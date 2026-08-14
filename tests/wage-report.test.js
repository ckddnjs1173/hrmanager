import test from "node:test";
import assert from "node:assert/strict";

import { buildWageCaseReport } from "../lib/wage-report.js";

test("wage report contains facts, money, evidence, official sources and next action", () => {
  const report = buildWageCaseReport({
    case: {
      id: "case-1",
      facts: {
        employmentStatus: "resigned",
        employmentStartDate: "2025-01-02",
        employmentEndDate: "2026-08-01",
        unpaidPeriodStart: "2026-07-01",
        unpaidPeriodEnd: "2026-07-31",
        payDay: "매월 10일",
        unpaidItems: ["월급"],
        evidence: { payslip: "have", bankHistory: "planned" },
      },
      issues: ["wage.base_pay"],
    },
    intake: { issues: ["wage.base_pay"] },
    money: {
      principal: 3000000,
      premiumEstimate: 0,
      delayInterestEstimate: 8219,
      knownTotalEstimate: 3008219,
      referenceDate: "2026-07-31",
      asOfDate: "2026-08-20",
      limitations: ["테스트 계산 한계"],
    },
    legal: {
      sources: [{ article: "근로기준법 제36조", authority: "국가법령정보센터", url: "https://www.law.go.kr/" }],
    },
    documents: [{ title: "내용증명" }],
    officialProcedure: { title: "임금체불 진정", url: "https://labor.moel.go.kr/" },
    nextAction: { title: "증거를 정리하세요.", description: "급여명세서를 확인하세요." },
  });

  assert.match(report.text, /3,000,000원/);
  assert.match(report.text, /급여명세서: 보유/);
  assert.match(report.text, /근로기준법 제36조/);
  assert.match(report.text, /내용증명/);
  assert.match(report.text, /임금체불 진정/);
  assert.match(report.text, /증거를 정리하세요/);
});
