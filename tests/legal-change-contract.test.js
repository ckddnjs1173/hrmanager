import test from "node:test";
import assert from "node:assert/strict";
import {
  assertCandidateTransition,
  assertProposalTransition,
  stableHash,
  validateLegalChangeCandidate,
  validateOfficialSource,
  validateRuleProposal,
} from "../lib/legal-change-contract.js";

test("official legal sources require known official HTTPS hosts", () => {
  assert.equal(validateOfficialSource({
    sourceType: "STATUTE",
    authority: "국가법령정보센터",
    title: "근로기준법",
    officialUrl: "https://www.law.go.kr/법령/근로기준법",
  }).ok, true);

  const invalid = validateOfficialSource({
    sourceType: "STATUTE",
    authority: "블로그",
    title: "요약",
    officialUrl: "https://example.com/law",
  });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.includes("legal_source_official_url_invalid"));
});

test("canonical source ids must already exist in the static Legal Registry", () => {
  const known = validateOfficialSource({
    sourceType: "DECREE",
    canonicalSourceId: "source.lsa_decree.appendix1",
    authority: "국가법령정보센터",
    title: "근로기준법 시행령",
    officialUrl: "https://law.go.kr/LSW/lsInfoP.do?lsId=003058",
  });
  assert.equal(known.ok, true);

  const unknown = validateOfficialSource({
    sourceType: "DECREE",
    canonicalSourceId: "source.unknown",
    authority: "국가법령정보센터",
    title: "미등록",
    officialUrl: "https://law.go.kr/LSW/lsInfoP.do?lsId=003058",
  });
  assert.ok(unknown.errors.includes("legal_source_canonical_id_unknown"));
});

test("candidate validation requires a source snapshot and valid effective range", () => {
  const valid = validateLegalChangeCandidate({
    sourceType: "STATUTE",
    canonicalSourceId: "source.lsa.article36",
    authority: "국가법령정보센터",
    title: "근로기준법 제36조 개정 후보",
    officialUrl: "https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1029728519",
    sourcePublishedAt: "2026-08-17",
    effectiveFrom: "2027-01-01",
    sourceSnapshot: { article: "제36조", textHashBasis: "official-snapshot-v1" },
    createdBy: "legal-operator",
  });
  assert.equal(valid.ok, true);

  const invalid = validateLegalChangeCandidate({
    sourceType: "STATUTE",
    authority: "국가법령정보센터",
    title: "잘못된 후보",
    officialUrl: "https://law.go.kr/LSW/lsInfoP.do?lsId=001872",
    effectiveFrom: "2027-02-01",
    effectiveTo: "2027-01-01",
    sourceSnapshot: {},
    createdBy: "legal-operator",
  });
  assert.ok(invalid.errors.includes("legal_change_source_snapshot_required"));
  assert.ok(invalid.errors.includes("legal_change_effective_range_invalid"));
});

test("candidate lifecycle forbids skipping human review", () => {
  assert.equal(assertCandidateTransition("DRAFT", "IN_REVIEW"), true);
  assert.equal(assertCandidateTransition("IN_REVIEW", "VERIFIED"), true);
  assert.throws(() => assertCandidateTransition("DRAFT", "VERIFIED"), /legal_change_transition_invalid/);
  assert.throws(() => assertCandidateTransition("VERIFIED", "DRAFT"), /legal_change_transition_invalid/);
});

test("rule proposals require verified source and fixture evidence before verification", () => {
  assert.equal(validateRuleProposal({
    ruleKey: "minimum_wage.2027",
    proposedRuleVersion: "2027",
    proposedEffectiveFrom: "2027-01-01",
    proposedChange: { hourly: 11000 },
    createdBy: "legal-operator",
  }).ok, true);

  assert.equal(assertProposalTransition("DRAFT", "READY_FOR_TEST", { candidateStatus: "VERIFIED" }), true);
  assert.throws(
    () => assertProposalTransition("READY_FOR_TEST", "VERIFIED", { candidateStatus: "IN_REVIEW", fixtureEvidence: [{ name: "boundary", expected: 11000 }] }),
    /legal_proposal_candidate_not_verified/,
  );
  assert.throws(
    () => assertProposalTransition("READY_FOR_TEST", "VERIFIED", { candidateStatus: "VERIFIED", fixtureEvidence: [] }),
    /legal_proposal_fixture_evidence_required/,
  );
  assert.equal(assertProposalTransition("READY_FOR_TEST", "VERIFIED", {
    candidateStatus: "VERIFIED",
    fixtureEvidence: [{ name: "effective-date", input: { date: "2027-01-01" }, expected: 11000 }],
  }), true);
  assert.equal(assertProposalTransition("VERIFIED", "READY_FOR_IMPLEMENTATION", {
    candidateStatus: "VERIFIED",
    fixtureEvidence: [{ name: "effective-date", expected: 11000 }],
  }), true);
});

test("stable governance hashes include nested source snapshot content", () => {
  const left = stableHash({ sourceSnapshot: { article: "17", text: "A" }, effectiveFrom: "2027-01-01" });
  const right = stableHash({ sourceSnapshot: { article: "17", text: "B" }, effectiveFrom: "2027-01-01" });
  assert.notEqual(left, right);
  assert.equal(left, stableHash({ effectiveFrom: "2027-01-01", sourceSnapshot: { text: "A", article: "17" } }));
});
