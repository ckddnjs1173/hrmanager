import test from "node:test";
import assert from "node:assert/strict";

process.env.DB_PATH = ":memory:";
const { cases } = await import("../lib/case-repo.js");
const { caseAccess } = await import("../lib/case-access.js");
const { db } = await import("../lib/db.js");

test("case access token becomes unusable after expiry", () => {
  const record = cases.insert({ case_type: "wage_arrears", title: "token expiry" }, "test");
  const token = caseAccess.issue(record.id);
  assert.equal(caseAccess.verify(record.id, token), true);

  db.prepare("UPDATE case_access_tokens SET expires_at=? WHERE case_id=?")
    .run("2000-01-01T00:00:00.000Z", record.id);

  assert.equal(caseAccess.verify(record.id, token), false);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM case_access_tokens WHERE case_id=?").get(record.id).c, 0);
});
