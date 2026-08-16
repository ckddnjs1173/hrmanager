import assert from "node:assert/strict";
import { createPostgresPool } from "../lib/postgres-client.js";
import { applyPostgresMigrations } from "../lib/postgres-migrations.js";
import { closeRuntimePostgres } from "../lib/runtime-postgres.js";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");

const migrationPool = createPostgresPool({ applicationName: "insaya-legal-governance-migrate" });
await applyPostgresMigrations(migrationPool, { logger: { log() {} } });
await migrationPool.end();

const {
  attachProposalFixtures,
  createLegalChangeCandidate,
  createLegalRuleProposal,
  getLegalChangeCandidate,
  listLegalChangeCandidates,
  listLegalGovernanceEvents,
  listLegalRuleProposals,
  markProposalReadyForImplementation,
  reviewLegalChangeCandidate,
  submitLegalChangeCandidate,
  verifyLegalRuleProposal,
} = await import("../lib/legal-change-repo.js");

const actor = "legal-operator-e2e";
const reviewer = "legal-reviewer-e2e";

const candidate = await createLegalChangeCandidate({
  sourceType: "REGULATION_NOTICE",
  canonicalSourceId: "source.minimum_wage_commission.annual",
  authority: "최저임금위원회",
  title: "2027년 적용 최저임금 변경 후보",
  officialUrl: "https://minimumwage.go.kr/minWage/policy/decisionMain.do",
  sourcePublishedAt: "2026-08-17",
  effectiveFrom: "2027-01-01",
  changeNote: "공식 출처 변경 후보를 사람이 검토하기 위한 테스트 레코드",
  sourceSnapshot: {
    authority: "최저임금위원회",
    capturedAt: "2026-08-17T00:00:00+09:00",
    sourceVersion: "e2e-official-snapshot-v1",
    proposedHourly: 11000,
  },
  createdBy: actor,
});
assert.equal(candidate.status, "DRAFT");
assert.match(candidate.contentHash, /^[a-f0-9]{64}$/);

await assert.rejects(
  () => createLegalChangeCandidate({
    sourceType: "REGULATION_NOTICE",
    canonicalSourceId: "source.minimum_wage_commission.annual",
    authority: "최저임금위원회",
    title: "2027년 적용 최저임금 변경 후보",
    officialUrl: "https://minimumwage.go.kr/minWage/policy/decisionMain.do",
    sourcePublishedAt: "2026-08-17",
    effectiveFrom: "2027-01-01",
    changeNote: "duplicate",
    sourceSnapshot: {
      authority: "최저임금위원회",
      capturedAt: "2026-08-17T00:00:00+09:00",
      sourceVersion: "e2e-official-snapshot-v1",
      proposedHourly: 11000,
    },
    createdBy: actor,
  }),
  /legal_change_duplicate/,
);

await assert.rejects(
  () => createLegalRuleProposal({
    candidateId: candidate.id,
    ruleKey: "minimum_wage.2027",
    currentRuleVersion: "2026",
    proposedRuleVersion: "2027",
    proposedEffectiveFrom: "2027-01-01",
    proposedChange: { hourly: 11000 },
    createdBy: actor,
  }),
  /legal_proposal_candidate_not_verified/,
);

const submitted = await submitLegalChangeCandidate({ candidateId: candidate.id, actor });
assert.equal(submitted.status, "IN_REVIEW");

const verifiedCandidate = await reviewLegalChangeCandidate({
  candidateId: candidate.id,
  reviewer,
  decision: "VERIFY",
  note: "공식 출처·시행일·변경값 수동 대조 완료",
  metadata: { reviewMethod: "MANUAL_OFFICIAL_SOURCE_COMPARISON" },
});
assert.equal(verifiedCandidate.status, "VERIFIED");
assert.ok(verifiedCandidate.verifiedAt);

const proposal = await createLegalRuleProposal({
  candidateId: candidate.id,
  ruleKey: "minimum_wage.2027",
  currentRuleVersion: "2026",
  proposedRuleVersion: "2027",
  proposedEffectiveFrom: "2027-01-01",
  proposedChange: {
    category: "minimum_wage",
    hourly: 11000,
    sourceId: "source.minimum_wage_commission.annual",
  },
  createdBy: actor,
});
assert.equal(proposal.status, "DRAFT");

await assert.rejects(
  () => verifyLegalRuleProposal({ proposalId: proposal.id, reviewer }),
  /legal_proposal_transition_invalid|legal_proposal_fixture_evidence_required/,
);

const fixtures = [
  { name: "day-before-effective-date", input: { date: "2026-12-31" }, expected: { version: "2026" } },
  { name: "effective-date", input: { date: "2027-01-01" }, expected: { version: "2027", hourly: 11000 } },
  { name: "day-after-effective-date", input: { date: "2027-01-02" }, expected: { version: "2027", hourly: 11000 } },
];
const readyForTest = await attachProposalFixtures({ proposalId: proposal.id, actor, fixtures });
assert.equal(readyForTest.status, "READY_FOR_TEST");
assert.equal(readyForTest.fixtureEvidence.length, 3);
assert.match(readyForTest.fixtureEvidenceHash, /^[a-f0-9]{64}$/);

const verifiedProposal = await verifyLegalRuleProposal({ proposalId: proposal.id, reviewer });
assert.equal(verifiedProposal.status, "VERIFIED");
assert.equal(verifiedProposal.verifiedBy, reviewer);

const implementationReady = await markProposalReadyForImplementation({ proposalId: proposal.id, actor: reviewer });
assert.equal(implementationReady.status, "READY_FOR_IMPLEMENTATION");
assert.ok(implementationReady.readyForImplementationAt);

const storedCandidate = await getLegalChangeCandidate(candidate.id);
assert.equal(storedCandidate.status, "VERIFIED");
const candidates = await listLegalChangeCandidates({ status: "VERIFIED" });
assert.ok(candidates.some((item) => item.id === candidate.id));
const proposals = await listLegalRuleProposals({ candidateId: candidate.id });
assert.equal(proposals.length, 1);
assert.equal(proposals[0].status, "READY_FOR_IMPLEMENTATION");

const events = await listLegalGovernanceEvents({ candidateId: candidate.id });
assert.deepEqual(events.map((entry) => entry.eventType), [
  "CANDIDATE_CREATED",
  "CANDIDATE_SUBMITTED",
  "CANDIDATE_VERIFY",
  "RULE_PROPOSAL_CREATED",
  "RULE_PROPOSAL_FIXTURES_ATTACHED",
  "RULE_PROPOSAL_VERIFIED",
  "RULE_PROPOSAL_READY_FOR_IMPLEMENTATION",
]);

const pool = createPostgresPool({ applicationName: "insaya-legal-governance-assert" });
try {
  const reviews = await pool.query("SELECT decision,source_snapshot_hash FROM legal_change_reviews WHERE candidate_id=$1", [candidate.id]);
  assert.equal(reviews.rowCount, 1);
  assert.equal(reviews.rows[0].decision, "VERIFY");
  assert.match(reviews.rows[0].source_snapshot_hash, /^[a-f0-9]{64}$/);
  const forbiddenRuntimeActivation = await pool.query("SELECT COUNT(*)::integer AS count FROM legal_rule_change_proposals WHERE status='ACTIVE'");
  assert.equal(forbiddenRuntimeActivation.rows[0].count, 0);
} finally {
  await pool.end();
}

await closeRuntimePostgres();
console.log("Legal governance PostgreSQL E2E passed: official candidate -> human review -> fixture-gated rule proposal -> ready for implementation, with no runtime activation.");
