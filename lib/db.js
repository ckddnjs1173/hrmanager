// SQLite 연결 + 스키마 (Node 내장 node:sqlite — 무의존·네이티브 빌드 불필요, Node 22.5+)
// data/app.db 단일 파일. 라우트는 lib/repo.js만 호출(저장소 교체 용이).
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describeStorageRuntime } from "./storage-runtime-contract.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
fs.mkdirSync(DATA_DIR, { recursive: true });
const STORAGE_RUNTIME = describeStorageRuntime();
const CONFIGURED_DB_PATH = String(process.env.DB_PATH || "").trim();
const DB_PATH = CONFIGURED_DB_PATH || path.join(DATA_DIR, "app.db");
const IN_MEMORY_DATABASE = DB_PATH === ":memory:" || /^file::memory:/i.test(DB_PATH);

// Readiness may inspect storage semantics, but the actual filesystem path must never be serialized.
export const dbStorageInfo = Object.freeze({
  explicitPathConfigured: Boolean(CONFIGURED_DB_PATH),
  inMemory: IN_MEMORY_DATABASE,
  runtimeMode: STORAGE_RUNTIME.mode,
  postgresShadow: STORAGE_RUNTIME.postgresShadow,
});

export const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

// 스키마 (현행 API 필드명을 그대로 유지 — 프론트/대시보드 무변경)
db.exec(`
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  at TEXT, status TEXT DEFAULT 'received',
  name TEXT, contact TEXT, nomu TEXT, message TEXT, summary TEXT,
  consent INTEGER DEFAULT 0,
  assigned TEXT DEFAULT '', memo TEXT DEFAULT '',
  token TEXT, expires TEXT, deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_token ON bookings(token);

CREATE TABLE IF NOT EXISTS booking_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id TEXT, at TEXT, type TEXT, actor TEXT, note TEXT
);

CREATE TABLE IF NOT EXISTS access_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id TEXT, token TEXT, at TEXT, ip_hash TEXT, ua TEXT
);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  at TEXT, kind TEXT, name TEXT, contact TEXT, message TEXT, status TEXT DEFAULT 'new'
);

CREATE TABLE IF NOT EXISTS nomusa (
  id TEXT PRIMARY KEY,
  name TEXT, loc TEXT, sido TEXT,
  opted_out INTEGER DEFAULT 0, featured INTEGER DEFAULT 0,
  doc TEXT
);
CREATE INDEX IF NOT EXISTS idx_nomusa_sido ON nomusa(sido);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT, type TEXT, ref TEXT, meta TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT, channel TEXT, recipient TEXT, template TEXT,
  subject TEXT, body TEXT, status TEXT DEFAULT 'logged'
);

CREATE TABLE IF NOT EXISTS nomusa_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nomusa_id TEXT, name TEXT, token_hash TEXT,
  created_at TEXT, last_login TEXT
);
CREATE INDEX IF NOT EXISTS idx_nacc_token ON nomusa_accounts(token_hash);

CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT, kind TEXT, ref TEXT, message TEXT, status TEXT DEFAULT 'new'
);
`);

// 마이그레이션: bookings에 배정 노무사 ID 컬럼 추가(기존 DB 호환)
{
  const cols = db.prepare("PRAGMA table_info(bookings)").all().map((c) => c.name);
  if (!cols.includes("assigned_nomusa_id")) db.exec("ALTER TABLE bookings ADD COLUMN assigned_nomusa_id TEXT DEFAULT ''");
}

export function nowISO() { return new Date().toISOString(); }
export function genId(prefix = "r") { return prefix + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36); }
