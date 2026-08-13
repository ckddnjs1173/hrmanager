import crypto from "node:crypto";
import { db, nowISO } from "./db.js";
import { ensureCaseSchema } from "./case-db.js";

ensureCaseSchema();

db.exec(`
  CREATE TABLE IF NOT EXISTS case_access_tokens (
    case_id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    last_used_at TEXT,
    FOREIGN KEY(case_id) REFERENCES cases(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_case_access_token_hash ON case_access_tokens(token_hash);
`);

const hashToken = (token) => crypto.createHash("sha256").update(String(token || "")).digest("hex");

export const caseAccess = {
  issue(caseId) {
    const token = crypto.randomBytes(32).toString("base64url");
    db.prepare(`INSERT INTO case_access_tokens (case_id,token_hash,created_at,last_used_at)
      VALUES (?,?,?,NULL)
      ON CONFLICT(case_id) DO UPDATE SET token_hash=excluded.token_hash,created_at=excluded.created_at,last_used_at=NULL`)
      .run(caseId, hashToken(token), nowISO());
    return token;
  },

  verify(caseId, token) {
    if (!caseId || !token) return false;
    const row = db.prepare("SELECT case_id FROM case_access_tokens WHERE case_id=? AND token_hash=?")
      .get(caseId, hashToken(token));
    if (!row) return false;
    db.prepare("UPDATE case_access_tokens SET last_used_at=? WHERE case_id=?").run(nowISO(), caseId);
    return true;
  },

  revoke(caseId) {
    return db.prepare("DELETE FROM case_access_tokens WHERE case_id=?").run(caseId).changes > 0;
  },
};
