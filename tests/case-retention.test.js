import test from "node:test";
import assert from "node:assert/strict";

process.env.DB_PATH = ":memory:";
const { cases } = await import("../lib/case-repo.js");
const { db } = await import("../lib/db.js");
const { caseRetentionSweep, CASE_RETENTION_DAYS } = await import("../lib/case-retention.js");

test("retention sweep removes abandoned cases after the configured window", () => {
  const record = cases.insert({ case_type: "wage_arrears", title: "old case" }, "test");
  const old = new Date(Date.now() - (CASE_RETENTION_DAYS + 2) * 86400000).toISOString();
  db.prepare("UPDATE cases SET updated_at=? WHERE id=?").run(old, record.id);

  const result = caseRetentionSweep(Date.now());
  assert.equal(result.deletedAbandoned, 1);
  assert.equal(cases.get(record.id), null);
});

test("retention sweep keeps recently updated cases", () => {
  const record = cases.insert({ case_type: "wage_arrears", title: "fresh case" }, "test");
  const result = caseRetentionSweep(Date.now());
  assert.equal(cases.get(record.id)?.id, record.id);
  assert.ok(result.deletedAbandoned >= 0);
});
