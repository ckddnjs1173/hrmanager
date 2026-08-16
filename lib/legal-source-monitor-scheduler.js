import { listLegalSourceWatches, runLegalSourceWatch } from "./legal-source-monitor-repo.js";

export const LEGAL_SOURCE_MONITOR_MIN_INTERVAL_MS = 60 * 60 * 1000;
export const LEGAL_SOURCE_MONITOR_DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;

let runtimeStatus = {
  started: false,
  enabled: false,
  reason: "not_started",
  requestedIntervalMs: null,
  intervalMs: null,
  minIntervalMs: LEGAL_SOURCE_MONITOR_MIN_INTERVAL_MS,
  defaultIntervalMs: LEGAL_SOURCE_MONITOR_DEFAULT_INTERVAL_MS,
  running: false,
  stopped: false,
  startedAt: null,
  lastTickStartedAt: null,
  lastTickFinishedAt: null,
  nextRunAt: null,
  lastSummary: null,
};

function flag(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function iso(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function plusMs(value, milliseconds) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Date(date.getTime() + milliseconds).toISOString();
}

function publicSummary(summary) {
  if (!summary) return null;
  return {
    skipped: Boolean(summary.skipped),
    reason: summary.reason || null,
    total: Number(summary.total) || 0,
    completed: Number(summary.completed) || 0,
    failed: Number(summary.failed) || 0,
  };
}

function setRuntimeStatus(patch) {
  runtimeStatus = { ...runtimeStatus, ...patch };
}

export function getLegalSourceMonitorSchedulerStatus() {
  return {
    ...runtimeStatus,
    lastSummary: runtimeStatus.lastSummary ? { ...runtimeStatus.lastSummary } : null,
  };
}

export function clampLegalSourceMonitorIntervalMs(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return LEGAL_SOURCE_MONITOR_DEFAULT_INTERVAL_MS;
  return numeric < LEGAL_SOURCE_MONITOR_MIN_INTERVAL_MS ? LEGAL_SOURCE_MONITOR_MIN_INTERVAL_MS : numeric;
}

export function resolveLegalSourceMonitorSchedulerConfig(env = process.env) {
  const requestedEnabled = flag(env.LEGAL_SOURCE_MONITOR_ENABLED);
  const raw = Number(env.LEGAL_SOURCE_MONITOR_INTERVAL_MS);
  const requestedIntervalMs = Number.isFinite(raw) && raw > 0 ? raw : LEGAL_SOURCE_MONITOR_DEFAULT_INTERVAL_MS;
  const intervalMs = clampLegalSourceMonitorIntervalMs(requestedIntervalMs);
  if (!requestedEnabled) return { enabled: false, reason: "disabled_by_flag", intervalMs, requestedIntervalMs };
  if (!String(env.DATABASE_URL || "").trim()) return { enabled: false, reason: "database_url_required", intervalMs, requestedIntervalMs };
  return { enabled: true, reason: null, intervalMs, requestedIntervalMs };
}

export function startLegalSourceMonitorScheduler({
  env = process.env,
  listWatches = listLegalSourceWatches,
  runWatch = runLegalSourceWatch,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  logger = console,
  watchLimit = 100,
  nowFn = () => new Date(),
} = {}) {
  const config = resolveLegalSourceMonitorSchedulerConfig(env);
  let timer = null;
  let running = false;
  let stopped = false;
  const startedAtValue = nowFn();
  setRuntimeStatus({
    started: true,
    enabled: config.enabled,
    reason: config.reason,
    requestedIntervalMs: config.requestedIntervalMs,
    intervalMs: config.intervalMs,
    minIntervalMs: LEGAL_SOURCE_MONITOR_MIN_INTERVAL_MS,
    defaultIntervalMs: LEGAL_SOURCE_MONITOR_DEFAULT_INTERVAL_MS,
    running: false,
    stopped: false,
    startedAt: iso(startedAtValue),
    lastTickStartedAt: null,
    lastTickFinishedAt: null,
    nextRunAt: config.enabled ? plusMs(startedAtValue, config.intervalMs) : null,
    lastSummary: null,
  });

  async function tick() {
    if (stopped || !config.enabled) {
      const summary = { skipped: true, reason: stopped ? "stopped" : config.reason };
      setRuntimeStatus({ lastSummary: publicSummary(summary) });
      return summary;
    }
    if (running) {
      logger.warn?.("[legal-monitor] scheduler tick skipped: previous run still active");
      const summary = { skipped: true, reason: "overlap" };
      setRuntimeStatus({ lastSummary: publicSummary(summary) });
      return summary;
    }
    running = true;
    const tickStartedAt = nowFn();
    setRuntimeStatus({
      running: true,
      lastTickStartedAt: iso(tickStartedAt),
      nextRunAt: plusMs(tickStartedAt, config.intervalMs),
    });
    const summary = { skipped: false, total: 0, completed: 0, failed: 0, results: [] };
    try {
      let watches;
      try {
        watches = await listWatches({ enabled: true, limit: watchLimit });
      } catch (error) {
        summary.failed += 1;
        summary.results.push({ watchId: null, status: "FAILED", error: String(error?.message || error) });
        logger.error?.("[legal-monitor] failed to list watches", error);
        return summary;
      }
      summary.total = watches.length;
      for (const watch of watches) {
        try {
          const result = await runWatch({ watchId: watch.id, triggeredBy: "legal-source-scheduler" });
          const status = result?.status || "UNKNOWN";
          if (status === "FAILED") summary.failed += 1;
          else summary.completed += 1;
          summary.results.push({ watchId: watch.id, status, candidateId: result?.candidateId || null, error: result?.errorCode || null });
        } catch (error) {
          summary.failed += 1;
          summary.results.push({ watchId: watch.id, status: "FAILED", error: String(error?.message || error) });
          logger.error?.(`[legal-monitor] watch failed: ${watch.id}`, error);
        }
      }
      return summary;
    } finally {
      running = false;
      setRuntimeStatus({
        running: false,
        lastTickFinishedAt: iso(nowFn()),
        lastSummary: publicSummary(summary),
      });
    }
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    if (timer != null) clearIntervalFn(timer);
    timer = null;
    setRuntimeStatus({ running: false, stopped: true, nextRunAt: null });
  }

  if (config.requestedIntervalMs < LEGAL_SOURCE_MONITOR_MIN_INTERVAL_MS) {
    logger.warn?.(`[legal-monitor] interval clamped to ${LEGAL_SOURCE_MONITOR_MIN_INTERVAL_MS}ms minimum`);
  }

  if (config.enabled) {
    timer = setIntervalFn(() => tick(), config.intervalMs);
    timer?.unref?.();
    logger.log?.(`[legal-monitor] scheduler enabled; interval=${config.intervalMs}ms; no immediate startup run`);
  } else if (config.reason === "database_url_required") {
    logger.warn?.("[legal-monitor] scheduler requested but DATABASE_URL is missing; scheduler disabled");
  }

  return {
    config,
    tick,
    stop,
    get running() { return running; },
    get stopped() { return stopped; },
  };
}
