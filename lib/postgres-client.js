import pg from "pg";

const { Pool } = pg;

export function createPostgresPool({ connectionString = process.env.DATABASE_URL, applicationName = "insaya" } = {}) {
  const url = String(connectionString || "").trim();
  if (!url) throw new Error("database_url_required");

  return new Pool({
    connectionString: url,
    application_name: applicationName,
    max: Number.parseInt(process.env.PG_POOL_MAX || "5", 10) || 5,
    idleTimeoutMillis: Number.parseInt(process.env.PG_IDLE_TIMEOUT_MS || "10000", 10) || 10000,
    connectionTimeoutMillis: Number.parseInt(process.env.PG_CONNECT_TIMEOUT_MS || "5000", 10) || 5000,
  });
}

export async function pingPostgres(pool) {
  const startedAt = Date.now();
  const result = await pool.query("SELECT current_database() AS database, current_user AS user, NOW() AS now");
  return {
    ok: true,
    latencyMs: Date.now() - startedAt,
    database: result.rows[0]?.database || "",
    user: result.rows[0]?.user || "",
    now: result.rows[0]?.now || null,
  };
}

export async function withPostgresTransaction(pool, fn) {
  if (!pool || typeof pool.connect !== "function") throw new Error("postgres_pool_required");
  if (typeof fn !== "function") throw new Error("postgres_transaction_callback_required");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const value = await fn(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}
