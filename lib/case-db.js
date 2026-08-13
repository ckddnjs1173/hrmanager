import { db } from "./db.js";

let initialized = false;

export function ensureCaseSchema() {
  if (initialized) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'intake',
      user_type TEXT NOT NULL DEFAULT 'worker',
      case_type TEXT NOT NULL DEFAULT 'unknown',
      title TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      event_date TEXT,
      period_start TEXT,
      period_end TEXT,
      employment_start_date TEXT,
      employment_end_date TEXT,
      facts TEXT NOT NULL DEFAULT '{}',
      missing_facts TEXT NOT NULL DEFAULT '[]',
      issues TEXT NOT NULL DEFAULT '[]',
      calculations TEXT NOT NULL DEFAULT '[]',
      evidence TEXT NOT NULL DEFAULT '[]',
      actions TEXT NOT NULL DEFAULT '[]',
      documents TEXT NOT NULL DEFAULT '[]',
      legal_sources TEXT NOT NULL DEFAULT '[]',
      meta TEXT NOT NULL DEFAULT '{}',
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
    CREATE INDEX IF NOT EXISTS idx_cases_type ON cases(case_type);
    CREATE INDEX IF NOT EXISTS idx_cases_updated_at ON cases(updated_at);

    CREATE TABLE IF NOT EXISTS case_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id TEXT NOT NULL,
      at TEXT NOT NULL,
      type TEXT NOT NULL,
      actor TEXT NOT NULL DEFAULT 'system',
      note TEXT NOT NULL DEFAULT '',
      FOREIGN KEY(case_id) REFERENCES cases(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_case_events_case ON case_events(case_id, at);
  `);

  initialized = true;
}
