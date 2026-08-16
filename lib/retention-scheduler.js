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

export function startRetentionScheduler({ intervalMs = RETENTION_SWEEP_INTERVAL_MS, runImmediately = true, log = console.log, warn = console.warn } = {}) {
  if (runImmediately) runRetentionSweep({ log, warn });
  const timer = setInterval(() => runRetentionSweep({ log, warn }), intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}