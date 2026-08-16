import { getRuntimePostgresPool } from "./runtime-postgres.js";

export const LEGAL_MONITOR_HEALTH_STATES = Object.freeze([
  "EMPTY",
  "BASELINE_REQUIRED",
  "ATTENTION_REQUIRED",
  "HEALTHY",
]);

function iso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function mapAttention(row) {
  if (!row) return null;
  return {
    watchId: row.id,
    canonicalSourceId: row.canonical_source_id,
    kind: row.attention_kind,
    latestRunStatus: row.latest_run_status || null,
    latestErrorCode: row.latest_error_code || null,
    lastCheckedAt: iso(row.last_checked_at),
    lastSuccessAt: iso(row.last_success_at),
  };
}

export function deriveLegalMonitorHealthState({ totalWatches = 0, baselineRequired = 0, latestFailed = 0, pendingCandidates = 0 } = {}) {
  if (Number(totalWatches) === 0) return "EMPTY";
  if (Number(baselineRequired) > 0) return "BASELINE_REQUIRED";
  if (Number(latestFailed) > 0 || Number(pendingCandidates) > 0) return "ATTENTION_REQUIRED";
  return "HEALTHY";
}

export async function getLegalSourceMonitorHealth({ now = new Date(), recentWindowHours = 24 } = {}) {
  const pool = getRuntimePostgresPool();
  const safeHours = Math.max(1, Math.min(168, Number(recentWindowHours) || 24));
  const nowIso = iso(now);

  const [watchResult, candidateResult, recentFailureResult, attentionResult] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*)::integer AS total_watches,
        COUNT(*) FILTER (WHERE enabled)::integer AS enabled_watches,
        COUNT(*) FILTER (WHERE NOT enabled)::integer AS disabled_watches,
        COUNT(*) FILTER (WHERE enabled AND last_content_hash IS NOT NULL)::integer AS baselined_enabled_watches,
        COUNT(*) FILTER (WHERE enabled AND last_content_hash IS NULL)::integer AS baseline_required,
        COUNT(*) FILTER (WHERE enabled AND latest_run_status='FAILED')::integer AS latest_failed
      FROM (
        SELECT w.*,
          (
            SELECT r.status
            FROM legal_source_monitor_runs r
            WHERE r.watch_id=w.id
            ORDER BY r.started_at DESC, r.id DESC
            LIMIT 1
          ) AS latest_run_status
        FROM legal_source_watches w
      ) watches
    `),
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE detected_by='OFFICIAL_ADAPTER' AND status='DRAFT')::integer AS draft_candidates,
        COUNT(*) FILTER (WHERE detected_by='OFFICIAL_ADAPTER' AND status='IN_REVIEW')::integer AS in_review_candidates
      FROM legal_change_candidates
    `),
    pool.query(`
      SELECT COUNT(*)::integer AS recent_failed_runs
      FROM legal_source_monitor_runs
      WHERE status='FAILED'
        AND started_at >= ($1::timestamptz - ($2::integer * interval '1 hour'))
    `, [nowIso, safeHours]),
    pool.query(`
      WITH latest AS (
        SELECT DISTINCT ON (watch_id)
          watch_id,status,error_code
        FROM legal_source_monitor_runs
        ORDER BY watch_id,started_at DESC,id DESC
      )
      SELECT
        w.id,w.canonical_source_id,w.last_checked_at,w.last_success_at,
        l.status AS latest_run_status,l.error_code AS latest_error_code,
        CASE
          WHEN w.enabled AND w.last_content_hash IS NULL THEN 'BASELINE_REQUIRED'
          WHEN w.enabled AND l.status='FAILED' THEN 'LATEST_RUN_FAILED'
          ELSE NULL
        END AS attention_kind
      FROM legal_source_watches w
      LEFT JOIN latest l ON l.watch_id=w.id
      WHERE w.enabled
        AND (w.last_content_hash IS NULL OR l.status='FAILED')
      ORDER BY
        CASE WHEN w.last_content_hash IS NULL THEN 0 ELSE 1 END,
        w.updated_at DESC
      LIMIT 100
    `),
  ]);

  const watch = watchResult.rows[0] || {};
  const candidates = candidateResult.rows[0] || {};
  const draftCandidates = Number(candidates.draft_candidates) || 0;
  const inReviewCandidates = Number(candidates.in_review_candidates) || 0;
  const pendingCandidates = draftCandidates + inReviewCandidates;
  const counts = {
    totalWatches: Number(watch.total_watches) || 0,
    enabledWatches: Number(watch.enabled_watches) || 0,
    disabledWatches: Number(watch.disabled_watches) || 0,
    baselinedEnabledWatches: Number(watch.baselined_enabled_watches) || 0,
    baselineRequired: Number(watch.baseline_required) || 0,
    latestFailed: Number(watch.latest_failed) || 0,
    recentFailedRuns: Number(recentFailureResult.rows[0]?.recent_failed_runs) || 0,
    draftDetectedCandidates: draftCandidates,
    inReviewDetectedCandidates: inReviewCandidates,
    pendingDetectedCandidates: pendingCandidates,
  };

  return {
    state: deriveLegalMonitorHealthState({
      totalWatches: counts.totalWatches,
      baselineRequired: counts.baselineRequired,
      latestFailed: counts.latestFailed,
      pendingCandidates: counts.pendingDetectedCandidates,
    }),
    asOf: nowIso,
    recentWindowHours: safeHours,
    counts,
    attention: attentionResult.rows.map(mapAttention).filter(Boolean),
    score: null,
    schedulerMutationAllowed: false,
    automaticReviewAllowed: false,
    runtimeActivationAllowed: false,
  };
}
