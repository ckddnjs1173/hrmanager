// .env를 가장 먼저 로드 (다른 모듈이 import 시점에 process.env를 읽기 전에).
// server.js에서 이 파일을 '첫 import'로 두면, 이어서 import되는 ai.js 등이 환경변수를 본다.
// Render/Railway 등은 실제 환경변수를 주입하므로 .env가 없어도 무시.
try { process.loadEnvFile?.(".env"); } catch { /* .env 없으면 무시 */ }
