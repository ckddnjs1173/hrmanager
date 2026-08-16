export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;

export function createGracefulShutdown({
  server,
  stopJobs = [],
  timeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS,
  log = console.log,
  warn = console.warn,
  exit = (code) => process.exit(code),
} = {}) {
  if (!server || typeof server.close !== "function") {
    throw new Error("shutdown_server_required");
  }

  let shuttingDown = false;

  return function shutdown(signal = "shutdown") {
    if (shuttingDown) return false;
    shuttingDown = true;
    log(`🛑 종료 신호 수신: ${signal}`);

    for (const stop of stopJobs) {
      if (typeof stop !== "function") continue;
      try {
        stop();
      } catch (error) {
        warn("shutdown job stop error:", error?.message || error);
      }
    }

    const forceTimer = setTimeout(() => {
      warn(`graceful shutdown timeout after ${timeoutMs}ms`);
      exit(1);
    }, timeoutMs);
    forceTimer.unref?.();

    try {
      server.close((error) => {
        clearTimeout(forceTimer);
        if (error) {
          warn("server close error:", error?.message || error);
          exit(1);
          return;
        }
        log("✅ HTTP 서버 종료 완료");
        exit(0);
      });
    } catch (error) {
      clearTimeout(forceTimer);
      warn("server close error:", error?.message || error);
      exit(1);
    }

    return true;
  };
}
