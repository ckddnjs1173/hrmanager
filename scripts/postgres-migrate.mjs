import { createPostgresPool, pingPostgres } from "../lib/postgres-client.js";
import { applyPostgresMigrations } from "../lib/postgres-migrations.js";

const pool = createPostgresPool({ applicationName: "insaya-postgres-migrate" });
try {
  const ping = await pingPostgres(pool);
  console.log(`PostgreSQL connected: ${ping.database} (${ping.latencyMs}ms)`);
  const applied = await applyPostgresMigrations(pool);
  console.log(`PostgreSQL migrations complete: ${applied.length}`);
} finally {
  await pool.end();
}
