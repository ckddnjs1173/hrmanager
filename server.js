// 노무 AI 상담 — 백엔드 bootstrap
// 실행: npm install && npm start  (AI 키가 없으면 데모 모드)

import "./lib/env.js"; // 반드시 첫 import — 이후 모듈들이 process.env를 읽기 전에 .env 로드
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApplication } from "./lib/application.js";
import { createGracefulShutdown } from "./lib/graceful-shutdown.js";
import { startRetentionScheduler } from "./lib/retention-scheduler.js";
import { startComplianceNotificationScheduler } from "./lib/notification-scheduler.js";
import { startLegalSourceMonitorScheduler } from "./lib/legal-source-monitor-scheduler.js";
import { closeRuntimeStorage } from "./lib/runtime-repo.js";
import { closeRuntimePostgres } from "./lib/runtime-postgres.js";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const { app, runtime } = createApplication({ rootDir });
const stopRetentionScheduler = startRetentionScheduler();
const stopComplianceNotificationScheduler = startComplianceNotificationScheduler();
const legalSourceMonitorScheduler = startLegalSourceMonitorScheduler();

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, "0.0.0.0", () => {
  const { aiEnabled, aiInfo } = runtime;
  console.log(`\n✅ 노무 AI 서버 실행: http://localhost:${PORT}`);
  console.log(`   모델: ${aiEnabled ? `${aiInfo.provider} · ${aiInfo.model}${aiInfo.fallbacks?.length ? `  (폴백: ${aiInfo.fallbacks.join(", ")})` : ""}` : "데모 모드(키 없음)"}\n`);
});

const shutdown = createGracefulShutdown({
  server,
  stopJobs: [
    stopRetentionScheduler,
    stopComplianceNotificationScheduler,
    () => legalSourceMonitorScheduler.stop(),
    closeRuntimeStorage,
    closeRuntimePostgres,
  ],
});
process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
