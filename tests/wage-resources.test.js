import test from "node:test";
import assert from "node:assert/strict";

import { buildWageDocuments, buildWageOfficialProcedure } from "../lib/wage-resources.js";

test("wage documents prefill known case period, issues and amount", () => {
  const docs = buildWageDocuments({
    employmentStartDate: "2025-01-02",
    employmentEndDate: "2026-08-01",
    unpaidPeriodStart: "2026-07-01",
    unpaidPeriodEnd: "2026-07-31",
    unpaidItems: ["월급", "연장수당"],
  }, {
    principal: 3000000,
    knownTotalEstimate: 3060000,
  });

  const certmail = docs.find((doc) => doc.templateKey === "certmail");
  assert.equal(certmail.status, "ready");
  assert.equal(certmail.prefill.amount, 3060000);
  assert.equal(certmail.prefill.work, "2025-01-02 ~ 2026-08-01");
  assert.match(certmail.prefill.detail, /2026-07-01 ~ 2026-07-31/);
  assert.match(certmail.prefill.detail, /월급, 연장수당/);
});

test("official wage procedure points to the Ministry of Employment and Labor portal", () => {
  const procedure = buildWageOfficialProcedure();
  assert.equal(procedure.authority, "고용노동부 노동포털");
  assert.match(procedure.url, /^https:\/\/labor\.moel\.go\.kr\//);
  assert.ok(procedure.preparation.includes("급여명세서"));
});
