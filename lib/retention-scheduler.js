import { caseRetentionSweep } from "./case-retention.js";
import { retentionSweep } from "./repo.js";

export const RETENTION_SWEEP_INTERVAL_MS = 24 * 3600 * 1000;

export function runRetentionSweep({ log = console.log, warn = console.warn } = {}) {
  try {
    const result = retentionSweep();
    if (result.deletedBookings || result.deletedLeads || result.abandonedSoftDeleted) {
      log(`🧹 보존정책 정리: 예약삭제 ${result.deletedBookings}, 리드삭제 ${result.deletedLeads}, 미수락파기 ${result.abandonedSoftDeleted}`);
    }
    return result;
  } catch (error) {
    warn("sweep error:", error?.message || error);
    return null;
  }
}

export function runCaseRetentionSweep({ now = Date.now(), log = console.log, warn = console.warn } = {}) {
  try {
    const result = caseRetentionSweep(now);
    if (result.deletedArchived || result.deletedAbandoned) {
      log(`🧹 Case 보존정책 정리: 삭제완료 ${result.deletedArchived}, 방치사건 ${result.deletedAbandoned}`);
    }
    return result;
  } catch (error) {
    warn("case sweep error:", error?.message || error);
    return null;
  }
}

export function startRetentionScheduler({ intervalMs = RETENTION_SWEEP_INTERVAL_MS, runImmediately = true, log = console.log, warn = console.warn } = {}) {
  const sweep = () => {
    runRetentionSweep({ log, warn });
    runCaseRetentionSweep({ log, warn });
  };
  if (runImmediately) sweep();
  const timer = setInterval(sweep, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
