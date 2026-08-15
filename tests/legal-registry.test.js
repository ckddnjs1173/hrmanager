import test from "node:test";
import assert from "node:assert/strict";

import {
  LEGAL_DOMAIN_REGISTRY,
  getLegalDomain,
  listCanonicalLegalSources,
  normalizeLegalSource,
  validateLegalRegistry,
} from "../lib/legal-registry.js";

const EXPECTED_DOMAINS = ["wage", "dismissal", "retirement", "worktime", "annual_leave"];

test("Legal registry contains the five core Case domains", () => {
  assert.deepEqual(LEGAL_DOMAIN_REGISTRY.map((domain) => domain.id), EXPECTED_DOMAINS);
  for (const domain of LEGAL_DOMAIN_REGISTRY) {
    assert.equal(typeof domain.getContext, "function");
    assert.ok(domain.sources.length > 0, `${domain.id} must expose legal sources`);
  }
});

test("Legal registry source metadata passes the common contract", () => {
  const validation = validateLegalRegistry();
  assert.equal(validation.ok, true, validation.errors.join("\n"));
  assert.deepEqual(validation.errors, []);
});

test("canonical Legal sources deduplicate shared statutes without losing official metadata", () => {
  const allDomainSources = LEGAL_DOMAIN_REGISTRY.flatMap((domain) => domain.sources);
  const canonical = listCanonicalLegalSources();
  assert.ok(canonical.length <= allDomainSources.length);
  assert.equal(new Set(canonical.map((source) => source.id)).size, canonical.length);
  const article56 = canonical.find((source) => source.id === "source.lsa.article56");
  assert.ok(article56);
  assert.equal(article56.authority, "국가법령정보센터");
  assert.match(article56.url, /^https:\/\//);
});

test("Legal source normalization preserves stable shared fields only", () => {
  const source = listCanonicalLegalSources()[0];
  const normalized = normalizeLegalSource(source);
  assert.deepEqual(Object.keys(normalized), ["id", "authority", "title", "article", "url", "verifiedAt"]);
  assert.equal(normalized.id, source.id);
});

test("Legal registry lookup has no implicit fallback", () => {
  assert.equal(getLegalDomain("worktime")?.label, "근로시간·수당");
  assert.equal(getLegalDomain("unknown"), null);
});

test("registered Legal context functions remain compatible with representative facts", () => {
  const wage = getLegalDomain("wage").getContext({ unpaidPeriodEnd: "2026-07-31" });
  assert.equal(wage.minimumWage?.hourly, 10320);

  const dismissal = getLegalDomain("dismissal").getContext({
    separationType: "dismissal",
    employmentStartDate: "2025-01-01",
    effectiveDate: "2026-08-01",
    workplaceEmployeeCount: 8,
  });
  assert.equal(dismissal.fivePlus, true);

  const retirement = getLegalDomain("retirement").getContext({
    benefitType: "severance_pay",
    employmentStartDate: "2025-01-01",
    retirementDate: "2026-01-01",
    averageWeeklyScheduledHours: 40,
    hadUnder15HourPeriods: false,
  });
  assert.equal(retirement.eligibility.eligible, true);

  const worktime = getLegalDomain("worktime").getContext({
    referenceDate: "2026-08-16",
    workplaceEmployeeCount: 8,
    standardWorkSystem: true,
  });
  assert.equal(worktime.fivePlus, true);

  const annual = getLegalDomain("annual_leave").getContext({
    referenceDate: "2026-08-16",
    employmentStartDate: "2025-01-01",
    employmentStatus: "current",
    workplaceEmployeeCount: 8,
    averageWeeklyScheduledHours: 40,
  });
  assert.equal(annual.scope.eligible, true);
});
