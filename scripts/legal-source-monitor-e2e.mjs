import assert from "node:assert/strict";
import { createPostgresPool } from "../lib/postgres-client.js";
import { applyPostgresMigrations } from "../lib/postgres-migrations.js";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");

const migrationPool = createPostgresPool({ applicationName: "insaya-legal-source-monitor-migrate" });
await applyPostgresMigrations(migrationPool, { logger: { log() {} } });
await migrationPool.end();

const {
  createLegalSourceWatch,
  getLegalSourceWatch,
  listLegalSourceMonitorRuns,
  runLegalSourceWatch,
  setLegalSourceWatchEnabled,
} = await import("../lib/legal-source-monitor-repo.js");
const { closeRuntimePostgres } = await import("../lib/runtime-postgres.js");

function html(body, { status = 200, headers = {} } = {}) {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", ...headers } });
}

const baselineFetch = async () => html("<html><script>clock=1</script><body><h1>연도별 최저임금</h1><p>2026 10,320원</p></body></html>", { headers: { etag: '"v1"' } });
const sameSemanticFetch = async () => html("<main> <h2>연도별 최저임금</h2> <div>2026   10,320원</div> </main>", { headers: { etag: '"v1-markup"' } });
const changedFetch = async () => html("<main><h2>연도별 최저임금</h2><div>2026 10,320원</div><div>2027 11,000원</div></main>", { headers: { etag: '"v2"' } });
const failureFetch = async () => new Response("server error", { status: 503, headers: { "content-type": "text/plain" } });

try {
  const watch = await createLegalSourceWatch({
    canonicalSourceId: "source.minimum_wage_commission.annual",
    sourceType: "REGULATION_NOTICE",
    createdBy: "monitor-e2e-operator",
  });
  assert.equal(watch.enabled, true);
  assert.equal(watch.adapterKey, "OFFICIAL_HTTP");
  assert.equal(watch.lastContentHash, null);
  assert.match(watch.officialUrl, /^https:\/\/(www\.)?minimumwage\.go\.kr\//);

  await assert.rejects(
    () => createLegalSourceWatch({
      canonicalSourceId: "source.minimum_wage_commission.annual",
      sourceType: "REGULATION_NOTICE",
      createdBy: "monitor-e2e-operator",
    }),
    /legal_source_watch_duplicate/,
  );

  const baseline = await runLegalSourceWatch({
    watchId: watch.id,
    fetchImpl: baselineFetch,
    now: new Date("2026-08-17T00:00:00Z"),
    triggeredBy: "monitor-e2e-operator",
  });
  assert.equal(baseline.status, "BASELINED");
  assert.equal(baseline.candidateId, null);
  assert.equal(baseline.previousContentHash, null);
  assert.match(baseline.currentContentHash, /^[a-f0-9]{64}$/);

  const db = createPostgresPool({ applicationName: "insaya-legal-source-monitor-assert" });
  try {
    let candidateCount = await db.query("SELECT COUNT(*)::integer AS count FROM legal_change_candidates WHERE detected_by='OFFICIAL_ADAPTER'");
    assert.equal(candidateCount.rows[0].count, 0, "first successful fetch must establish baseline only");

    const unchanged = await runLegalSourceWatch({
      watchId: watch.id,
      fetchImpl: sameSemanticFetch,
      now: new Date("2026-08-17T01:00:00Z"),
      triggeredBy: "monitor-e2e-operator",
    });
    assert.equal(unchanged.status, "UNCHANGED");
    assert.equal(unchanged.currentContentHash, baseline.currentContentHash, "markup-only differences must normalize to same hash");
    assert.equal(unchanged.candidateId, null);

    const changed = await runLegalSourceWatch({
      watchId: watch.id,
      fetchImpl: changedFetch,
      now: new Date("2026-08-17T02:00:00Z"),
      triggeredBy: "monitor-e2e-operator",
    });
    assert.equal(changed.status, "CHANGE_DETECTED");
    assert.ok(changed.candidateId);
    assert.notEqual(changed.previousContentHash, changed.currentContentHash);

    const candidate = await db.query("SELECT * FROM legal_change_candidates WHERE id=$1", [changed.candidateId]);
    assert.equal(candidate.rowCount, 1);
    assert.equal(candidate.rows[0].status, "DRAFT", "monitor must never auto-verify");
    assert.equal(candidate.rows[0].detected_by, "OFFICIAL_ADAPTER");
    assert.equal(candidate.rows[0].canonical_source_id, "source.minimum_wage_commission.annual");
    assert.match(candidate.rows[0].created_by, /^official-source-monitor:lsw_/);
    assert.equal(candidate.rows[0].verified_at, null);
    assert.equal(candidate.rows[0].source_snapshot.monitor.previousContentHash, changed.previousContentHash);
    assert.equal(candidate.rows[0].source_snapshot.monitor.currentContentHash, changed.currentContentHash);
    assert.match(candidate.rows[0].source_snapshot.evidenceText, /2027 11,000원/);

    candidateCount = await db.query("SELECT COUNT(*)::integer AS count FROM legal_change_candidates WHERE detected_by='OFFICIAL_ADAPTER'");
    assert.equal(candidateCount.rows[0].count, 1);

    const repeat = await runLegalSourceWatch({
      watchId: watch.id,
      fetchImpl: changedFetch,
      now: new Date("2026-08-17T03:00:00Z"),
      triggeredBy: "monitor-e2e-operator",
    });
    assert.equal(repeat.status, "UNCHANGED");
    assert.equal(repeat.candidateId, null);
    candidateCount = await db.query("SELECT COUNT(*)::integer AS count FROM legal_change_candidates WHERE detected_by='OFFICIAL_ADAPTER'");
    assert.equal(candidateCount.rows[0].count, 1, "same changed content must not create another candidate");

    const beforeFailure = await getLegalSourceWatch(watch.id);
    const failed = await runLegalSourceWatch({
      watchId: watch.id,
      fetchImpl: failureFetch,
      now: new Date("2026-08-17T04:00:00Z"),
      triggeredBy: "monitor-e2e-operator",
    });
    assert.equal(failed.status, "FAILED");
    assert.match(failed.errorCode, /legal_source_http_status:503/);
    const afterFailure = await getLegalSourceWatch(watch.id);
    assert.equal(afterFailure.lastContentHash, beforeFailure.lastContentHash, "failed fetch must preserve last known-good hash");
    assert.equal(afterFailure.lastSuccessAt, beforeFailure.lastSuccessAt, "failed fetch must preserve last success timestamp");
    assert.notEqual(afterFailure.lastCheckedAt, beforeFailure.lastCheckedAt, "failed fetch still records check time");

    const disabled = await setLegalSourceWatchEnabled({ watchId: watch.id, enabled: false, actor: "monitor-e2e-operator" });
    assert.equal(disabled.enabled, false);
    await assert.rejects(
      () => runLegalSourceWatch({ watchId: watch.id, fetchImpl: changedFetch, triggeredBy: "monitor-e2e-operator" }),
      /legal_source_watch_disabled/,
    );
    const enabledAgain = await setLegalSourceWatchEnabled({ watchId: watch.id, enabled: true, actor: "monitor-e2e-operator" });
    assert.equal(enabledAgain.enabled, true);

    const reviews = await db.query("SELECT COUNT(*)::integer AS count FROM legal_change_reviews WHERE candidate_id=$1", [changed.candidateId]);
    assert.equal(reviews.rows[0].count, 0, "monitor must not create human review records");
    const proposals = await db.query("SELECT COUNT(*)::integer AS count FROM legal_rule_change_proposals WHERE candidate_id=$1", [changed.candidateId]);
    assert.equal(proposals.rows[0].count, 0, "monitor must not create rule proposals");

    const watchEvents = await db.query("SELECT event_type,actor,watch_id FROM legal_governance_events WHERE watch_id=$1 ORDER BY created_at,id", [watch.id]);
    assert.ok(watchEvents.rowCount >= 7);
    assert.ok(watchEvents.rows.every((row) => row.watch_id === watch.id));
    assert.ok(watchEvents.rows.some((row) => row.event_type === "LEGAL_SOURCE_WATCH_BASELINED"));
    assert.ok(watchEvents.rows.some((row) => row.event_type === "LEGAL_SOURCE_WATCH_CHANGE_DETECTED"));
    assert.ok(watchEvents.rows.some((row) => row.event_type === "LEGAL_SOURCE_WATCH_RUN_FAILED"));

    const runs = await listLegalSourceMonitorRuns({ watchId: watch.id });
    assert.deepEqual(runs.slice(0, 5).map((run) => run.status).sort(), ["BASELINED", "CHANGE_DETECTED", "FAILED", "UNCHANGED", "UNCHANGED"].sort());
    assert.ok(runs.every((run) => run.metadata.triggeredBy === "monitor-e2e-operator"));
  } finally {
    await db.end();
  }

  console.log("Legal source monitor PostgreSQL E2E passed: baseline -> unchanged -> DRAFT change candidate -> dedupe -> failed-fetch preservation, with no auto-review or Rule activation.");
} finally {
  await closeRuntimePostgres();
}
