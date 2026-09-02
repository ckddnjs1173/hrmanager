import crypto from "node:crypto";
import { getRuntimePostgresPool } from "./runtime-postgres.js";
import { withPostgresTransaction } from "./postgres-client.js";
import { isValidEmail } from "./validators.js";

const sha = (value) => crypto.createHash("sha256").update(String(value || "")).digest("hex");
const nowISO = () => new Date().toISOString();
const id = (prefix) => `${prefix}_${crypto.randomUUID()}`;

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function plusMinutes(minutes) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}
function plusDays(days) {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

export async function recordSecurityEvent({ userId = null, event, result = "SUCCESS", requestId = null, ipHash = null, metadata = {} } = {}, client = null) {
  const db = client || getRuntimePostgresPool();
  await db.query(
    "INSERT INTO security_events (id,user_id,event,result,request_id,ip_hash,metadata,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
    [id("sev"), userId, event, result, requestId, ipHash, JSON.stringify(metadata || {}), nowISO()]
  );
}

export async function issueMagicChallenge({ email, ttlMinutes = 15, ipHash = null, requestId = null } = {}) {
  const emailNormalized = normalizeEmail(email);
  if (!isValidEmail(emailNormalized)) throw new Error("invalid_email");
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = sha(rawToken);
  const challengeId = id("ach");
  const createdAt = nowISO();
  const expiresAt = plusMinutes(ttlMinutes);

  await withPostgresTransaction(getRuntimePostgresPool(), async (client) => {
    await client.query(
      "UPDATE auth_challenges SET consumed_at=$1 WHERE email_normalized=$2 AND consumed_at IS NULL",
      [createdAt, emailNormalized]
    );
    await client.query(
      `INSERT INTO auth_challenges
       (id,email_normalized,token_hash,purpose,created_at,expires_at,consumed_at,requested_ip_hash,request_id)
       VALUES ($1,$2,$3,'LOGIN',$4,$5,NULL,$6,$7)`,
      [challengeId, emailNormalized, tokenHash, createdAt, expiresAt, ipHash, requestId]
    );
    await recordSecurityEvent({ event: "auth.magic.request", requestId, ipHash, metadata: { emailHash: sha(emailNormalized) } }, client);
  });

  return { id: challengeId, emailNormalized, rawToken, expiresAt };
}

export async function consumeMagicChallenge({ token, sessionTtlDays = 30, ipHash = null, userAgent = "", requestId = null } = {}) {
  const raw = String(token || "").trim();
  if (!raw) throw new Error("magic_token_required");
  const tokenHash = sha(raw);
  const sessionRaw = crypto.randomBytes(32).toString("base64url");
  const sessionHash = sha(sessionRaw);
  const createdAt = nowISO();
  const sessionExpiresAt = plusDays(sessionTtlDays);

  const outcome = await withPostgresTransaction(getRuntimePostgresPool(), async (client) => {
    const challengeResult = await client.query(
      "SELECT * FROM auth_challenges WHERE token_hash=$1 FOR UPDATE",
      [tokenHash]
    );
    const challenge = challengeResult.rows[0];
    if (!challenge) return { denied: "magic_token_invalid", userId: null };
    if (challenge.consumed_at) return { denied: "magic_token_consumed", userId: null };
    if (new Date(challenge.expires_at).getTime() <= Date.now()) {
      await client.query("UPDATE auth_challenges SET consumed_at=$1 WHERE id=$2", [createdAt, challenge.id]);
      return { denied: "magic_token_expired", userId: null };
    }

    await client.query("UPDATE auth_challenges SET consumed_at=$1 WHERE id=$2", [createdAt, challenge.id]);
    const userResult = await client.query("SELECT * FROM users WHERE email_normalized=$1 FOR UPDATE", [challenge.email_normalized]);
    let user = userResult.rows[0];
    if (user?.status === "locked" || user?.status === "deleted") {
      return { denied: "user_unavailable", userId: user.id };
    }

    if (!user) {
      const userId = id("usr");
      await client.query(
        `INSERT INTO users (id,email_normalized,email_verified_at,status,created_at,updated_at,deleted_at)
         VALUES ($1,$2,$3,'active',$3,$3,NULL)`,
        [userId, challenge.email_normalized, createdAt]
      );
      user = { id: userId, email_normalized: challenge.email_normalized, email_verified_at: createdAt, status: "active" };
    } else {
      await client.query("UPDATE users SET email_verified_at=COALESCE(email_verified_at,$1),updated_at=$1 WHERE id=$2", [createdAt, user.id]);
      user.email_verified_at = user.email_verified_at || createdAt;
    }

    const identityId = id("aid");
    await client.query(
      `INSERT INTO auth_identities (id,user_id,provider,provider_subject,password_hash,created_at,updated_at)
       VALUES ($1,$2,'email_magic',$3,NULL,$4,$4)
       ON CONFLICT(provider,provider_subject) DO UPDATE SET user_id=EXCLUDED.user_id,updated_at=EXCLUDED.updated_at`,
      [identityId, user.id, challenge.email_normalized, createdAt]
    );

    const sessionId = id("ses");
    await client.query(
      `INSERT INTO user_sessions (id,user_id,token_hash,created_at,last_seen_at,expires_at,revoked_at,ip_hash,user_agent)
       VALUES ($1,$2,$3,$4,$4,$5,NULL,$6,$7)`,
      [sessionId, user.id, sessionHash, createdAt, sessionExpiresAt, ipHash, String(userAgent || "").slice(0, 300)]
    );
    await recordSecurityEvent({ userId: user.id, event: "auth.magic.verify", requestId, ipHash }, client);
    await recordSecurityEvent({ userId: user.id, event: "auth.login", requestId, ipHash }, client);

    return {
      user: { id: user.id, email: challenge.email_normalized, emailVerifiedAt: user.email_verified_at || createdAt, status: "active" },
      session: { id: sessionId, rawToken: sessionRaw, expiresAt: sessionExpiresAt },
    };
  });

  if (outcome?.denied) {
    await recordSecurityEvent({
      userId: outcome.userId || null,
      event: "auth.magic.verify",
      result: "DENIED",
      requestId,
      ipHash,
      metadata: { reason: outcome.denied },
    });
    throw new Error(outcome.denied);
  }
  return outcome;
}

export async function findSessionByRawToken(rawToken) {
  const token = String(rawToken || "").trim();
  if (!token) return null;
  const result = await getRuntimePostgresPool().query(
    `SELECT s.id AS session_id,s.user_id,s.expires_at,s.revoked_at,u.email_normalized,u.email_verified_at,u.status AS user_status
     FROM user_sessions s JOIN users u ON u.id=s.user_id
     WHERE s.token_hash=$1`,
    [sha(token)]
  );
  const row = result.rows[0];
  if (!row || row.revoked_at || row.user_status !== "active" || new Date(row.expires_at).getTime() <= Date.now()) return null;
  await getRuntimePostgresPool().query("UPDATE user_sessions SET last_seen_at=$1 WHERE id=$2", [nowISO(), row.session_id]);
  return {
    sessionId: row.session_id,
    userId: row.user_id,
    expiresAt: row.expires_at instanceof Date ? row.expires_at.toISOString() : String(row.expires_at),
    user: {
      id: row.user_id,
      email: row.email_normalized,
      emailVerifiedAt: row.email_verified_at instanceof Date ? row.email_verified_at.toISOString() : row.email_verified_at,
      status: row.user_status,
    },
  };
}

export async function revokeSession({ sessionId, userId = null, requestId = null, ipHash = null } = {}) {
  if (!sessionId) return false;
  const result = await getRuntimePostgresPool().query(
    "UPDATE user_sessions SET revoked_at=$1 WHERE id=$2 AND revoked_at IS NULL",
    [nowISO(), sessionId]
  );
  if (result.rowCount) await recordSecurityEvent({ userId, event: "auth.logout", requestId, ipHash });
  return result.rowCount > 0;
}

export function hashOpaqueToken(rawToken) {
  return sha(rawToken);
}
