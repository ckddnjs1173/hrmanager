import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createPostgresPool } from "../lib/postgres-client.js";
import { applyPostgresMigrations } from "../lib/postgres-migrations.js";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");

const migrationPool = createPostgresPool({ applicationName: "insaya-external-advisor-foundation-migrate" });
await applyPostgresMigrations(migrationPool, { logger: { log() {} } });
await migrationPool.end();

const pool = createPostgresPool({ applicationName: "insaya-external-advisor-foundation-e2e" });
const suffix = crypto.randomUUID();
const orgId = `org-advisor-${suffix}`;
const ownerId = `user-owner-${suffix}`;
const advisorId = `user-advisor-${suffix}`;
const grantId = `easg-${suffix}`;
const createdAt = new Date("2026-08-17T00:00:00Z");
const expiresAt = new Date("2026-08-24T00:00:00Z");

try {
  await pool.query(
    `INSERT INTO users(id,email_normalized,status,created_at,updated_at)
     VALUES ($1,$2,'active',$4,$4),($3,$5,'active',$4,$4)`,
    [ownerId, `owner-${suffix}@example.com`, advisorId, createdAt, `advisor-${suffix}@example.com`],
  );
  await pool.query(
    `INSERT INTO organizations(id,type,legal_name,display_name,status,created_at,updated_at)
     VALUES ($1,'BUSINESS','Advisor Foundation Co','Advisor Foundation Co','ACTIVE',$2,$2)`,
    [orgId, createdAt],
  );

  const inserted = await pool.query(
    `INSERT INTO external_advisor_share_grants
     (id,organization_id,resource_type,resource_id,advisor_user_id,permissions,created_by_user_id,status,created_at,expires_at)
     VALUES ($1,$2,'BUSINESS_CASE',$3,$4,$5,$6,'PENDING',$7,$8)
     RETURNING *`,
    [grantId, orgId, `case-${suffix}`, advisorId, JSON.stringify(["case.read", "document.read", "document.review", "comment.create"]), ownerId, createdAt, expiresAt],
  );
  assert.equal(inserted.rowCount, 1);
  assert.equal(inserted.rows[0].status, "PENDING");
  assert.equal(inserted.rows[0].accepted_at, null);

  await assert.rejects(
    () => pool.query(
      `INSERT INTO external_advisor_share_grants
       (id,organization_id,resource_type,resource_id,advisor_user_id,permissions,created_by_user_id,status,created_at,expires_at)
       VALUES ($1,$2,'BUSINESS_CASE',$3,$4,$5,$6,'PENDING',$7,$8)`,
      [`duplicate-${suffix}`, orgId, `case-${suffix}`, advisorId, JSON.stringify(["case.read"]), ownerId, createdAt, expiresAt],
    ),
    (error) => error?.code === "23505",
  );

  await assert.rejects(
    () => pool.query(
      `INSERT INTO external_advisor_share_grants
       (id,organization_id,resource_type,resource_id,advisor_user_id,permissions,created_by_user_id,status,created_at,expires_at)
       VALUES ($1,$2,'EMPLOYEE',$3,$4,$5,$6,'PENDING',$7,$8)`,
      [`bad-resource-${suffix}`, orgId, `employee-${suffix}`, advisorId, JSON.stringify(["case.read"]), ownerId, createdAt, expiresAt],
    ),
    (error) => error?.code === "23514",
  );

  await assert.rejects(
    () => pool.query(
      `INSERT INTO external_advisor_share_grants
       (id,organization_id,resource_type,resource_id,advisor_user_id,permissions,created_by_user_id,status,created_at,expires_at)
       VALUES ($1,$2,'BUSINESS_CASE',$3,$4,$5,$6,'PENDING',$7,$8)`,
      [`bad-permission-${suffix}`, orgId, `case-bad-${suffix}`, advisorId, JSON.stringify(["salary.read"]), ownerId, createdAt, expiresAt],
    ),
    (error) => error?.code === "23514",
  );

  await assert.rejects(
    () => pool.query(
      `INSERT INTO external_advisor_share_grants
       (id,organization_id,resource_type,resource_id,advisor_user_id,permissions,created_by_user_id,status,created_at,expires_at)
       VALUES ($1,$2,'BUSINESS_CASE',$3,$4,$5,$6,'PENDING',$7,$8)`,
      [`review-without-read-${suffix}`, orgId, `case-review-${suffix}`, advisorId, JSON.stringify(["case.read", "document.review"]), ownerId, createdAt, expiresAt],
    ),
    (error) => error?.code === "23514",
  );

  await assert.rejects(
    () => pool.query(
      `INSERT INTO external_advisor_share_grants
       (id,organization_id,resource_type,resource_id,advisor_user_id,permissions,created_by_user_id,status,created_at,expires_at)
       VALUES ($1,$2,'BUSINESS_CASE',$3,$4,$5,$6,'PENDING',$7,$7)`,
      [`bad-expiry-${suffix}`, orgId, `case-expiry-${suffix}`, advisorId, JSON.stringify(["case.read"]), ownerId, createdAt],
    ),
    (error) => error?.code === "23514",
  );

  await pool.query(
    `INSERT INTO external_advisor_share_grant_events(id,share_grant_id,actor_user_id,event_type,metadata,created_at)
     VALUES ($1,$2,$3,'CREATED',$4,$5)`,
    [`event-created-${suffix}`, grantId, ownerId, JSON.stringify({ source: "foundation-e2e" }), createdAt],
  );

  const acceptedAt = new Date("2026-08-18T00:00:00Z");
  const active = await pool.query(
    `UPDATE external_advisor_share_grants
     SET status='ACTIVE',accepted_at=$2
     WHERE id=$1
     RETURNING status,accepted_at,revoked_at`,
    [grantId, acceptedAt],
  );
  assert.equal(active.rows[0].status, "ACTIVE");
  assert.ok(active.rows[0].accepted_at);
  assert.equal(active.rows[0].revoked_at, null);
  await pool.query(
    `INSERT INTO external_advisor_share_grant_events(id,share_grant_id,actor_user_id,event_type,metadata,created_at)
     VALUES ($1,$2,$3,'ACCEPTED','{}'::jsonb,$4)`,
    [`event-accepted-${suffix}`, grantId, advisorId, acceptedAt],
  );

  const revokedAt = new Date("2026-08-19T00:00:00Z");
  const revoked = await pool.query(
    `UPDATE external_advisor_share_grants
     SET status='REVOKED',revoked_at=$2,revoked_by_user_id=$3
     WHERE id=$1
     RETURNING status,accepted_at,revoked_at,revoked_by_user_id`,
    [grantId, revokedAt, ownerId],
  );
  assert.equal(revoked.rows[0].status, "REVOKED");
  assert.equal(revoked.rows[0].revoked_by_user_id, ownerId);
  await pool.query(
    `INSERT INTO external_advisor_share_grant_events(id,share_grant_id,actor_user_id,event_type,metadata,created_at)
     VALUES ($1,$2,$3,'REVOKED','{}'::jsonb,$4)`,
    [`event-revoked-${suffix}`, grantId, ownerId, revokedAt],
  );

  const events = await pool.query(
    `SELECT event_type,actor_user_id FROM external_advisor_share_grant_events
     WHERE share_grant_id=$1 ORDER BY created_at ASC`,
    [grantId],
  );
  assert.deepEqual(events.rows.map((row) => row.event_type), ["CREATED", "ACCEPTED", "REVOKED"]);
  assert.deepEqual(events.rows.map((row) => row.actor_user_id), [ownerId, advisorId, ownerId]);

  console.log("External Advisor ShareGrant foundation PostgreSQL E2E passed: strict resource/permission/expiry/state constraints and append-only lifecycle events.");
} finally {
  await pool.end();
}
