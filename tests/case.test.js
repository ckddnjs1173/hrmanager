import test from "node:test";
import assert from "node:assert/strict";

process.env.DB_PATH = ":memory:";
const { cases } = await import("../lib/case-repo.js");

test("case repository preserves structured case data", () => {
  const created = cases.insert({
    case_type: "wage_arrears",
    event_date: "2026-08-10",
    facts: { monthlyBasePay: 3000000 },
    missing_facts: ["employmentEndDate"],
  });

  assert.equal(created.case_type, "wage_arrears");
  assert.equal(created.facts.monthlyBasePay, 3000000);
  assert.deepEqual(created.missing_facts, ["employmentEndDate"]);

  const updated = cases.update(created.id, {
    status: "active",
    evidence: [{ id: "payslip", status: "have" }],
  });
  assert.equal(updated.status, "active");
  assert.equal(updated.evidence[0].status, "have");
  assert.equal(cases.events(created.id).at(-1).type, "updated");

  assert.equal(cases.archive(created.id), true);
  assert.equal(cases.get(created.id), null);
});
