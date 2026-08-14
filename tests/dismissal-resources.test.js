import test from "node:test";
import assert from "node:assert/strict";

import { getDismissalLegalContext } from "../lib/dismissal-rules.js";
import { buildDismissalDocuments, buildDismissalProcedures } from "../lib/dismissal-resources.js";

test("five-plus dismissal recommends labor-board relief and notice-pay resources independently", () => {
  const facts = {
    separationType: "dismissal",
    employmentStartDate: "2025-01-01",
    noticeDate: "2026-07-20",
    effectiveDate: "2026-08-01",
    workplaceEmployeeCount: 8,
    writtenNoticeReceived: false,
    noticePayPaid: false,
    ordinaryDailyWage: 120000,
    employerReason: "성과",
  };
  const legal = getDismissalLegalContext(facts);
  const docs = buildDismissalDocuments(facts, legal);
  const procedures = buildDismissalProcedures(facts, legal);

  assert.ok(docs.some((doc) => doc.templateKey === "relief_app"));
  assert.ok(docs.some((doc) => doc.templateKey === "complaint"));
  assert.ok(procedures.some((item) => item.id === "dismissal.nlrc_relief"));
  assert.ok(procedures.some((item) => item.id === "dismissal.moel_notice_pay"));
});

test("small workplace does not recommend labor-board relief baseline", () => {
  const facts = {
    separationType: "dismissal",
    employmentStartDate: "2025-01-01",
    noticeDate: "2026-07-20",
    effectiveDate: "2026-08-01",
    workplaceEmployeeCount: 4,
    writtenNoticeReceived: false,
    noticePayPaid: false,
    ordinaryDailyWage: 100000,
    employerReason: "성과",
  };
  const legal = getDismissalLegalContext(facts);
  const docs = buildDismissalDocuments(facts, legal);
  const procedures = buildDismissalProcedures(facts, legal);

  assert.equal(docs.some((doc) => doc.templateKey === "relief_app"), false);
  assert.equal(procedures.some((item) => item.id === "dismissal.nlrc_relief"), false);
  assert.ok(procedures.some((item) => item.id === "dismissal.moel_notice_pay"));
});
