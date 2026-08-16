import { getSaasRuntimeConfig } from "./saas-runtime-config.js";
import { runComplianceNotificationSweep } from "./saas-notification-repo.js";

export const COMPLIANCE_NOTIFICATION_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

function positiveInterval(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed >= 60_000 ? parsed : fallback;
}

export async function runComplianceNotificationSchedulerSweep({ env = process.env, log = console.log, warn = console.warn, now = new Date() } = {}) {
  let config;
  try { config = getSaasRuntimeConfig(env); }
  catch (error) { warn("notification scheduler config error:", error?.message || error); return null; }
  if (!config.enabled) return { skipped: true, reason: "saas_disabled" };
  try {
    const result = await runComplianceNotificationSweep({ now });
    if (result.generated || result.cancelled || result.delivered) {
      log(`🔔 Business 기한 알림: 후보 ${result.generated}, 취소 ${result.cancelled}, 인앱전달 ${result.delivered}`);
    }
    return result;
  } catch (error) {
    warn("notification sweep error:", error?.message || error);
    return null;
  }
}

export function startComplianceNotificationScheduler({
  env = process.env,
  intervalMs = positiveInterval(env.COMPLIANCE_NOTIFICATION_SWEEP_INTERVAL_MS, COMPLIANCE_NOTIFICATION_SWEEP_INTERVAL_MS),
  runImmediately = true,
  log = console.log,
  warn = console.warn,
} = {}) {
  let config;
  try { config = getSaasRuntimeConfig(env); }
  catch (error) { warn("notification scheduler config error:", error?.message || error); return () => {}; }
  if (!config.enabled) return () => {};
  const sweep = () => runComplianceNotificationSchedulerSweep({ env, log, warn }).catch((error) => warn("notification scheduler error:", error?.message || error));
  if (runImmediately) sweep();
  const timer = setInterval(sweep, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
