import test from "node:test";
import assert from "node:assert/strict";

import { CASE_DOMAIN_REGISTRY, getCaseDomain, getCaseDomainByIntakePath } from "../lib/case-domain-registry.js";

const expected = [
  ["wage", "/wage-intake", "wage-intake", "wage-report", "wage-document"],
  ["dismissal", "/dismissal-intake", "dismissal-intake", "dismissal-report", "dismissal-document"],
  ["retirement", "/retirement-intake", "retirement-intake", "retirement-report", "retirement-document"],
  ["worktime", "/worktime-intake", "worktime-intake", "worktime-report", "worktime-document"],
  ["annual_leave", "/annual-leave-intake", "annual-leave-intake", "annual-leave-report", "annual-leave-document"],
];

test("core Case registry contains exactly the five 1.0 vertical slices", () => {
  assert.equal(CASE_DOMAIN_REGISTRY.length, 5);
  assert.deepEqual(
    CASE_DOMAIN_REGISTRY.map((item) => [item.id, item.uiPath, item.intakePath, item.reportPath, item.documentPath]),
    expected
  );
});

test("all Case registry route fragments remain unique", () => {
  for (const field of ["id", "uiPath", "intakePath", "reportPath", "documentPath"]) {
    const values = CASE_DOMAIN_REGISTRY.map((item) => item[field]);
    assert.equal(new Set(values).size, values.length, `${field} must be unique`);
  }
});

test("all Case registry operations are executable service functions", () => {
  for (const item of CASE_DOMAIN_REGISTRY) {
    for (const operation of ["create", "get", "update", "report", "renderDocument"]) {
      assert.equal(typeof item[operation], "function", `${item.id}.${operation}`);
    }
  }
});

test("Case registry lookup helpers resolve ids and intake paths without fallback", () => {
  assert.equal(getCaseDomain("retirement")?.intakePath, "retirement-intake");
  assert.equal(getCaseDomainByIntakePath("annual-leave-intake")?.id, "annual_leave");
  assert.equal(getCaseDomain("unknown"), null);
  assert.equal(getCaseDomainByIntakePath("unknown"), null);
});
