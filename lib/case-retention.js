import { db, nowISO } from "./db.js";
import { ensureCaseSchema } from "./case-db.js";

ensureCaseSchema();

function positiveDays(name, fallback) {
  const parsed = Number.parseInt(process.env[name] || String(fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const CASE_RETENTION_DAYS = positiveDays("CASE_RETENTION_DAYS", 30);
export const CASE_ARCHIVED_RETENTION_DAYS = positiveDays("CASE_ARCHIVED_RETENTION_DAYS", 7);

export function caseRetentionSweep(now = Date.now()) {
  const abandonedBefore = new Date(now - CASE_RETENTION_DAYS * 86400000).toISOString();
  const archivedBefore = new Date(now - CASE_ARCHIVED_RETENTION_DAYS * 86400000).toISOString();

  const archived = db.prepare("DELETE FROM cases WHERE deleted_at IS NOT NULL AND deleted_at < ?")
    .run(archivedBefore).changes;
  const abandoned = db.prepare("DELETE FROM cases WHERE deleted_at IS NULL AND updated_at < ?")
    .run(abandonedBefore).changes;

  return {
    at: nowISO(),
    retentionDays: CASE_RETENTION_DAYS,
    archivedRetentionDays: CASE_ARCHIVED_RETENTION_DAYS,
    deletedArchived: archived,
    deletedAbandoned: abandoned,
  };
}

// Case 기능이 로드될 때 1회 정리하고, 서버가 살아 있는 동안 하루 한 번 반복한다.
// timer는 unref하여 테스트/프로세스 종료를 막지 않는다.
caseRetentionSweep();
setInterval(() => caseRetentionSweep(), 24 * 60 * 60 * 1000).unref?.();
