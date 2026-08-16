import crypto from "node:crypto";
import { getRuntimePostgresPool } from "./runtime-postgres.js";
import { withPostgresTransaction } from "./postgres-client.js";
import {
  LEGAL_SOURCE_TYPES,
  canonicalSourceById,
  stableHash,
  validateLegalChangeCandidate,
  validateOfficialLegalUrl,
} from "./legal-change-contract.js";
import { fetchOfficialLegalSource } from "./legal-source-http-adapter.js";

const id = (prefix) => `${prefix}_${crypto.randomUUID()}`;
const iso = (value) => value instanceof Date ? value.toISOString() : value;
const nowIso = (now = new Date()) => now.toISOString();

function mapWatch(row) {
  if (!row) return null;
  return {
    id: row.id,
    canonicalSourceId: row.canonical_source_id,
    sourceType: row.source_type,
    officialUrl: row.official_url,
    adapterKey: row.adapter_key,
    enabled: row.enabled,
    lastCheckedAt: iso(row.last_checked_at),
    lastSuccessAt: iso(row.last_success_at),
    lastContentHash: row.last_content_hash,
    lastEtag: row.last_etag,
    lastModified: row.last_modified,
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapRun(row) {
  if (!row) return null;
  return {
    id: row.id,
    watchId: row.watch_id,
    status: row.status,
    previousContentHash: row.previous_content_hash,
    currentContentHash: row.current_content_hash,
    httpStatus: row.http_status,
    candidateId: row.candidate_id,
    errorCode: row.error_code,
    metadata: row.metadata || {},
    startedAt: iso(row.started_at),
    finishedAt: iso(row.finished_at),
  };
}

function validateWatchInput({ canonicalSourceId, sourceType } = {}) {
  if (!String(canonicalSourceId || "").trim()) throw new Error("legal_source_watch_canonical_source_required");
  if (!LEGAL_SOURCE_TYPES.includes(sourceType)) throw new Error("legal_source_type_invalid");
  const source = canonicalSourceById(canonicalSourceId);
  if (!source) throw new Error("legal_source_canonical_id_unknown");
  const url = validateOfficialLegalUrl(source.url);
  if (!url.ok) throw new Error(url.error);
  return source;
}

async function governanceEvent(client, { watchId, actor, eventType, metadata = {}, createdAt = nowIso() }) {
  await client.query(
    `INSERT INTO legal_governance_events
     (id,candidate_id,proposal_id,watch_id,actor,event_type,from_status,to_status,metadata,created_at)
     VALUES ($1,NULL,NULL,$2,$3,$4,NULL,NULL,$5,$6)`,
    [id("lge"), watchId, actor, eventType, JSON.stringify(metadata || {}), createdAt],
  );
}

export async function createLegalSourceWatch({ canonicalSourceId, sourceType, createdBy } = {}) {
  if (!String(createdBy || "").trim()) throw new Error("legal_source_watch_created_by_required");
  const source = validateWatchInput({ canonicalSourceId, sourceType });
  const watchId = id("lsw");
  const now = nowIso();
  try {
    return await withPostgresTransaction(getRuntimePostgresPool(), async (client) => {
      const result = await client.query(
        `INSERT INTO legal_source_watches
         (id,canonical_source_id,source_type,official_url,adapter_key,enabled,last_checked_at,last_success_at,last_content_hash,last_etag,last_modified,created_by,created_at,updated_at)
         VALUES ($1,$2,$3,$4,'OFFICIAL_HTTP',TRUE,NULL,NULL,NULL,NULL,NULL,$5,$6,$6)
         RETURNING *`,
        [watchId, source.id, sourceType, source.url, String(createdBy).trim(), now],
      );
      await governanceEvent(client, {
        watchId,
        actor: String(createdBy).trim(),
        eventType: "LEGAL_SOURCE_WATCH_CREATED",
        metadata: { canonicalSourceId: source.id, sourceType, officialUrl: source.url },
        createdAt: now,
      });
      return mapWatch(result.rows[0]);
    });
  } catch (error) {
    if (error?.code === "23505") throw new Error("legal_source_watch_duplicate");
    throw error;
  }
}

export async function getLegalSourceWatch(watchId) {
  const result = await getRuntimePostgresPool().query("SELECT * FROM legal_source_watches WHERE id=$1", [watchId]);
  return mapWatch(result.rows[0]);
}

export async function listLegalSourceWatches({ enabled = null, limit = 100 } = {}) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
  const result = enabled == null
    ? await getRuntimePostgresPool().query("SELECT * FROM legal_source_watches ORDER BY created_at DESC LIMIT $1", [safeLimit])
    : await getRuntimePostgresPool().query("SELECT * FROM legal_source_watches WHERE enabled=$1 ORDER BY created_at DESC LIMIT $2", [Boolean(enabled), safeLimit]);
  return result.rows.map(mapWatch);
}

export async function setLegalSourceWatchEnabled({ watchId, enabled, actor } = {}) {
  if (typeof enabled !== "boolean") throw new Error("legal_source_watch_enabled_required");
  if (!String(actor || "").trim()) throw new Error("legal_source_watch_actor_required");
  const now = nowIso();
  return withPostgresTransaction(getRuntimePostgresPool(), async (client) => {
    const locked = await client.query("SELECT * FROM legal_source_watches WHERE id=$1 FOR UPDATE", [watchId]);
    if (!locked.rows[0]) throw new Error("legal_source_watch_not_found");
    const previous = Boolean(locked.rows[0].enabled);
    const result = await client.query("UPDATE legal_source_watches SET enabled=$1,updated_at=$2 WHERE id=$3 RETURNING *", [enabled, now, watchId]);
    await governanceEvent(client, {
      watchId,
      actor: String(actor).trim(),
      eventType: "LEGAL_SOURCE_WATCH_TOGGLED",
      metadata: { fromEnabled: previous, toEnabled: enabled },
      createdAt: now,
    });
    return mapWatch(result.rows[0]);
  });
}

export async function listLegalSourceMonitorRuns({ watchId = null, limit = 100 } = {}) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
  const result = watchId
    ? await getRuntimePostgresPool().query("SELECT * FROM legal_source_monitor_runs WHERE watch_id=$1 ORDER BY started_at DESC LIMIT $2", [watchId, safeLimit])
    : await getRuntimePostgresPool().query("SELECT * FROM legal_source_monitor_runs ORDER BY started_at DESC LIMIT $1", [safeLimit]);
  return result.rows.map(mapRun);
}

async function insertDetectedCandidate(client, { watch, canonicalSource, fetched, previousHash, now }) {
  const candidate = {
    sourceType: watch.source_type,
    canonicalSourceId: watch.canonical_source_id,
    authority: canonicalSource.authority,
    title: `${canonicalSource.title} 변경 감지`,
    article: canonicalSource.article || null,
    officialUrl: watch.official_url,
    sourcePublishedAt: null,
    effectiveFrom: null,
    effectiveTo: null,
    changeNote: "공식 출처의 정규화된 내용 hash 변경을 감지했습니다. 법적 의미·시행일·Rule 영향은 사람이 공식 원문과 대조해 검토해야 합니다.",
    sourceSnapshot: {
      monitor: {
        watchId: watch.id,
        adapterKey: watch.adapter_key,
        previousContentHash: previousHash,
        currentContentHash: fetched.contentHash,
        fetchedAt: fetched.fetchedAt,
        finalUrl: fetched.finalUrl,
        httpStatus: fetched.httpStatus,
        contentType: fetched.contentType,
        redirects: fetched.redirects,
        etag: fetched.etag,
        lastModified: fetched.lastModified,
        evidenceTruncated: fetched.evidenceTruncated,
      },
      evidenceText: fetched.evidenceText,
    },
    detectedBy: "OFFICIAL_ADAPTER",
    createdBy: `official-source-monitor:${watch.id}`,
  };
  const validation = validateLegalChangeCandidate(candidate);
  if (!validation.ok) throw new Error(validation.errors[0]);
  const candidateId = id("lgc");
  const contentHash = stableHash({
    sourceType: candidate.sourceType,
    canonicalSourceId: candidate.canonicalSourceId,
    authority: candidate.authority,
    title: candidate.title,
    article: candidate.article,
    officialUrl: candidate.officialUrl,
    sourcePublishedAt: null,
    effectiveFrom: null,
    effectiveTo: null,
    sourceSnapshot: candidate.sourceSnapshot,
  });
  const duplicate = await client.query("SELECT id FROM legal_change_candidates WHERE content_hash=$1 AND status <> 'REJECTED' LIMIT 1", [contentHash]);
  if (duplicate.rowCount) return duplicate.rows[0].id;
  await client.query(
    `INSERT INTO legal_change_candidates
     (id,source_type,canonical_source_id,authority,title,article,official_url,source_published_at,effective_from,effective_to,
      change_note,source_snapshot,content_hash,detected_by,status,created_by,submitted_at,verified_at,rejected_at,superseded_at,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,NULL,NULL,$8,$9,$10,'OFFICIAL_ADAPTER','DRAFT',$11,NULL,NULL,NULL,NULL,$12,$12)`,
    [candidateId, candidate.sourceType, candidate.canonicalSourceId, candidate.authority, candidate.title, candidate.article, candidate.officialUrl,
      candidate.changeNote, JSON.stringify(candidate.sourceSnapshot), contentHash, candidate.createdBy, now],
  );
  await client.query(
    `INSERT INTO legal_governance_events
     (id,candidate_id,proposal_id,watch_id,actor,event_type,from_status,to_status,metadata,created_at)
     VALUES ($1,$2,NULL,$3,$4,'CANDIDATE_CREATED',NULL,'DRAFT',$5,$6)`,
    [id("lge"), candidateId, watch.id, candidate.createdBy, JSON.stringify({ contentHash, detectedBy: "OFFICIAL_ADAPTER" }), now],
  );
  return candidateId;
}

async function markRunFailed({ runId, watchId, error, now, triggeredBy }) {
  const finishedAt = nowIso(now);
  const errorCode = String(error?.message || "legal_source_monitor_failed").slice(0, 500);
  await withPostgresTransaction(getRuntimePostgresPool(), async (client) => {
    await client.query("UPDATE legal_source_watches SET last_checked_at=$1,updated_at=$1 WHERE id=$2", [finishedAt, watchId]);
    await client.query(
      "UPDATE legal_source_monitor_runs SET status='FAILED',error_code=$1,metadata=$2,finished_at=$3 WHERE id=$4",
      [errorCode, JSON.stringify({ triggeredBy }), finishedAt, runId],
    );
    await governanceEvent(client, {
      watchId,
      actor: triggeredBy,
      eventType: "LEGAL_SOURCE_WATCH_RUN_FAILED",
      metadata: { runId, errorCode },
      createdAt: finishedAt,
    });
  });
  return { status: "FAILED", errorCode };
}

export async function runLegalSourceWatch({ watchId, fetchImpl = globalThis.fetch, now = new Date(), triggeredBy = "legal-source-monitor" } = {}) {
  const actor = String(triggeredBy || "legal-source-monitor").trim() || "legal-source-monitor";
  const existing = await getLegalSourceWatch(watchId);
  if (!existing) throw new Error("legal_source_watch_not_found");
  if (!existing.enabled) throw new Error("legal_source_watch_disabled");
  const runId = id("lsr");
  const startedAt = nowIso(now);
  await getRuntimePostgresPool().query(
    `INSERT INTO legal_source_monitor_runs
     (id,watch_id,status,previous_content_hash,current_content_hash,http_status,candidate_id,error_code,metadata,started_at,finished_at)
     VALUES ($1,$2,'STARTED',$3,NULL,NULL,NULL,NULL,$4,$5,NULL)`,
    [runId, watchId, existing.lastContentHash, JSON.stringify({ triggeredBy: actor }), startedAt],
  );

  let fetched;
  try {
    fetched = await fetchOfficialLegalSource({ url: existing.officialUrl, fetchImpl, now });
  } catch (error) {
    const failed = await markRunFailed({ runId, watchId, error, now, triggeredBy: actor });
    return { runId, watchId, ...failed };
  }

  try {
    return await withPostgresTransaction(getRuntimePostgresPool(), async (client) => {
      const locked = await client.query("SELECT * FROM legal_source_watches WHERE id=$1 FOR UPDATE", [watchId]);
      const watch = locked.rows[0];
      if (!watch) throw new Error("legal_source_watch_not_found");
      if (!watch.enabled) throw new Error("legal_source_watch_disabled");
      const previousHash = watch.last_content_hash;
      const finishedAt = nowIso(now);
      let status;
      let candidateId = null;
      if (!previousHash) status = "BASELINED";
      else if (previousHash === fetched.contentHash) status = "UNCHANGED";
      else {
        status = "CHANGE_DETECTED";
        const canonicalSource = canonicalSourceById(watch.canonical_source_id);
        if (!canonicalSource) throw new Error("legal_source_canonical_id_unknown");
        candidateId = await insertDetectedCandidate(client, { watch, canonicalSource, fetched, previousHash, now: finishedAt });
      }
      await client.query(
        `UPDATE legal_source_watches SET last_checked_at=$1,last_success_at=$1,last_content_hash=$2,last_etag=$3,last_modified=$4,updated_at=$1 WHERE id=$5`,
        [finishedAt, fetched.contentHash, fetched.etag, fetched.lastModified, watchId],
      );
      const runMetadata = {
        triggeredBy: actor,
        finalUrl: fetched.finalUrl,
        contentType: fetched.contentType,
        redirects: fetched.redirects,
        evidenceTruncated: fetched.evidenceTruncated,
      };
      await client.query(
        `UPDATE legal_source_monitor_runs SET status=$1,previous_content_hash=$2,current_content_hash=$3,http_status=$4,candidate_id=$5,error_code=NULL,
         metadata=$6,finished_at=$7 WHERE id=$8`,
        [status, previousHash, fetched.contentHash, fetched.httpStatus, candidateId, JSON.stringify(runMetadata), finishedAt, runId],
      );
      await governanceEvent(client, {
        watchId,
        actor,
        eventType: `LEGAL_SOURCE_WATCH_${status}`,
        metadata: { runId, previousContentHash: previousHash, currentContentHash: fetched.contentHash, candidateId },
        createdAt: finishedAt,
      });
      return { runId, watchId, status, previousContentHash: previousHash, currentContentHash: fetched.contentHash, candidateId };
    });
  } catch (error) {
    return { runId, watchId, ...(await markRunFailed({ runId, watchId, error, now, triggeredBy: actor })) };
  }
}
