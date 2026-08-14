import crypto from "node:crypto";
import { db, nowISO } from "./db.js";
import { ensureCaseSchema } from "./case-db.js";

ensureCaseSchema();

const parsedTtl = Number.parseInt(process.env.CASE_TOKEN_TTL_DAYS || "7", 10);
export const CASE_TOKEN_TTL_DAYS = Number.isFinite(parsedTtl) && parsedTtl > 0 ? parsedTtl : 7;

function nextExpiry() {
  return new Date(Date.now() + CASE_TOKEN_TTL_DAYS * 86400000).toISOString();
}

db.exec(`
  CREATE TABLE IF NOT EXISTS case_access_tokens (
    case_id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    last_used_at TEXT,
    expires_at TEXT,
    FOREIGN KEY(case_id) REFERENCES cases(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_case_access_token_hash ON case_access_tokens(token_hash);
`);

{
  const cols = db.prepare("PRAGMA table_info(case_access_tokens)").all().map((column) => column.name);
  if (!cols.includes("expires_at")) db.exec("ALTER TABLE case_access_tokens ADD COLUMN expires_at TEXT");
  db.prepare("UPDATE case_access_tokens SET expires_at=? WHERE expires_at IS NULL OR expires_at='' ").run(nextExpiry());
}

const hashToken = (token) => crypto.createHash("sha256").update(String(token || "")).digest("hex");

export const caseAccess = {
  issue(caseId) {
    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAt = nextExpiry();
    db.prepare(`INSERT INTO case_access_tokens (case_id,token_hash,created_at,last_used_at,expires_at)
      VALUES (?,?,?,?,?)
      ON CONFLICT(case_id) DO UPDATE SET token_hash=excluded.token_hash,created_at=excluded.created_at,last_used_at=NULL,expires_at=excluded.expires_at`)
      .run(caseId, hashToken(token), nowISO(), null, expiresAt);
    return token;
  },

  verify(caseId, token) {
    if (!caseId || !token) return false;
    const row = db.prepare("SELECT case_id,expires_at FROM case_access_tokens WHERE case_id=? AND token_hash=?")
      .get(caseId, hashToken(token));
    if (!row) return false;
    const expiresAt = Date.parse(row.expires_at || "");
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      db.prepare("DELETE FROM case_access_tokens WHERE case_id=?").run(caseId);
      return false;
    }
    db.prepare("UPDATE case_access_tokens SET last_used_at=? WHERE case_id=?").run(nowISO(), caseId);
    return true;
  },

  revoke(caseId) {
    return db.prepare("DELETE FROM case_access_tokens WHERE case_id=?").run(caseId).changes > 0;
  },
};
