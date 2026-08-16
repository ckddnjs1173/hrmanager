import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { createPostgresPool } from "../lib/postgres-client.js";
import { applyPostgresMigrations } from "../lib/postgres-migrations.js";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
process.env.STORAGE_DRIVER = "postgres";
process.env.REQUIRE_PERSISTENT_DB = "0";
process.env.PERSISTENT_STORAGE = "0";
process.env.NODE_ENV = "test";
process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || "postgres-e2e-admin";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "postgres-e2e-session-secret";

const migrationPool = createPostgresPool({ applicationName: "insaya-postgres-runtime-e2e-migrate" });
await applyPostgresMigrations(migrationPool, { logger: { log() {} } });
await migrationPool.end();

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "insaya-pg-runtime-"));
const { createApplication } = await import("../lib/application.js");
const { closeRuntimeStorage } = await import("../lib/runtime-repo.js");
const { closeRuntimePostgres } = await import("../lib/runtime-postgres.js");

const { app } = createApplication({ rootDir: tempRoot, env: process.env, warn: () => {} });
const server = app.listen(0, "127.0.0.1");
await once(server, "listening");
const base = `http://127.0.0.1:${server.address().port}`;

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { response, body };
}

try {
  const readiness = await jsonRequest(`${base}/api/readiness`);
  if (readiness.response.status !== 200 || readiness.body?.database?.engine !== "postgres" || readiness.body?.ready !== true) {
    throw new Error(`postgres readiness failed: ${readiness.response.status} ${JSON.stringify(readiness.body)}`);
  }

  const wageCreate = await jsonRequest(`${base}/api/cases/wage-intake`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ facts: {} }),
  });
  if (wageCreate.response.status !== 201 || !wageCreate.body?.case?.id || !wageCreate.body?.accessToken) {
    throw new Error(`postgres wage create failed: ${wageCreate.response.status} ${JSON.stringify(wageCreate.body)}`);
  }
  const caseId = wageCreate.body.case.id;
  const caseToken = wageCreate.body.accessToken;

  const wageGet = await jsonRequest(`${base}/api/cases/${caseId}/wage-intake`, {
    headers: { "x-case-token": caseToken },
  });
  if (wageGet.response.status !== 200 || wageGet.body?.case?.id !== caseId) {
    throw new Error(`postgres wage read failed: ${wageGet.response.status}`);
  }

  const lead = await jsonRequest(`${base}/api/lead`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contact: "010-0000-0000", kind: "postgres-e2e", name: "테스트" }),
  });
  if (lead.response.status !== 200 || !lead.body?.id) throw new Error(`postgres lead failed: ${lead.response.status}`);

  const booking = await jsonRequest(`${base}/api/booking`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contact: "010-1111-2222", name: "테스트", consent: true, message: "PG runtime E2E" }),
  });
  if (booking.response.status !== 200 || !booking.body?.id) throw new Error(`postgres booking failed: ${booking.response.status}`);

  const admin = await jsonRequest(`${base}/api/admin/data`, {
    headers: { "x-admin-token": process.env.ADMIN_TOKEN },
  });
  if (admin.response.status !== 200 || !Array.isArray(admin.body?.bookings) || !Array.isArray(admin.body?.leads)) {
    throw new Error(`postgres admin read failed: ${admin.response.status}`);
  }

  const removed = await fetch(`${base}/api/cases/${caseId}`, {
    method: "DELETE",
    headers: { "x-case-token": caseToken },
  });
  if (removed.status !== 204) throw new Error(`postgres case delete failed: ${removed.status}`);

  const verifyPool = createPostgresPool({ applicationName: "insaya-postgres-runtime-e2e-verify" });
  try {
    const counts = await verifyPool.query(`SELECT
      (SELECT COUNT(*)::int FROM cases) AS cases,
      (SELECT COUNT(*)::int FROM leads) AS leads,
      (SELECT COUNT(*)::int FROM bookings) AS bookings,
      (SELECT COUNT(*)::int FROM booking_events) AS booking_events`);
    const row = counts.rows[0];
    if (row.cases < 1 || row.leads < 1 || row.bookings < 1 || row.booking_events < 1) {
      throw new Error(`postgres persistence counts invalid: ${JSON.stringify(row)}`);
    }
  } finally {
    await verifyPool.end();
  }

  console.log("PostgreSQL runtime E2E passed: readiness + Core Case + lead + booking + admin + persistence.");
} finally {
  await new Promise((resolve) => server.close(resolve));
  await Promise.allSettled([closeRuntimeStorage(), closeRuntimePostgres()]);
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
