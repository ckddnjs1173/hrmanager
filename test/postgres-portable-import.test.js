import test from "node:test";
import assert from "node:assert/strict";
import { buildPortableExport } from "../lib/portable-export.js";
import { importPortableIntoPostgres } from "../lib/postgres-portable.js";

function createFakePool() {
  const queries = [];
  const counts = new Map();
  const client = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (/^SELECT COUNT\(\*\)::bigint AS count FROM/i.test(sql)) return { rows: [{ count: "0" }] };
      if (/^INSERT INTO/i.test(sql)) return { rowCount: 1, rows: [] };
      if (/^SELECT setval/i.test(sql)) return { rows: [] };
      if (/^(BEGIN|COMMIT|ROLLBACK)$/i.test(sql)) return { rows: [] };
      return { rows: [] };
    },
    release() {},
  };
  return {
    queries,
    counts,
    async connect() { return client; },
  };
}

test("portable importer uses one transaction and parameterized inserts", async () => {
  const payload = buildPortableExport({
    readRows(table) {
      if (table === "leads") {
        return [{ id: "l1", at: "2026-08-16T10:00:00.000Z", kind: "general", name: "A", contact: "010", message: "m", status: "new" }];
      }
      if (table === "nomusa") {
        return [{ id: "n1", name: "N", loc: "서울", sido: "서울", opted_out: 0, featured: 1, doc: '{"a":1}' }];
      }
      return [];
    },
  });

  const pool = createFakePool();
  await importPortableIntoPostgres(pool, payload);

  assert.equal(pool.queries[0].sql, "BEGIN");
  assert.equal(pool.queries.at(-1).sql, "COMMIT");
  const inserts = pool.queries.filter((entry) => /^INSERT INTO/i.test(entry.sql));
  assert.equal(inserts.length, 2);
  assert.ok(inserts.every((entry) => /\$1/.test(entry.sql)));
  const nomusaInsert = inserts.find((entry) => /"nomusa"/.test(entry.sql));
  assert.ok(nomusaInsert);
  assert.equal(nomusaInsert.params.includes(true), true);
  assert.equal(nomusaInsert.params.includes('{"a":1}'), true, "JSONB values must be sent as explicit JSON text, not PostgreSQL arrays");
});

test("portable importer refuses a non-empty target unless replace is explicit", async () => {
  const payload = buildPortableExport({ readRows: () => [] });
  const queries = [];
  const client = {
    async query(sql) {
      queries.push(sql);
      if (/^SELECT COUNT\(\*\)::bigint AS count FROM "bookings"/i.test(sql)) return { rows: [{ count: "1" }] };
      if (/^SELECT COUNT\(\*\)::bigint AS count FROM/i.test(sql)) return { rows: [{ count: "0" }] };
      if (/^(BEGIN|ROLLBACK)$/i.test(sql)) return { rows: [] };
      return { rows: [] };
    },
    release() {},
  };
  const pool = { async connect() { return client; } };

  await assert.rejects(() => importPortableIntoPostgres(pool, payload), /postgres_target_not_empty:bookings/);
  assert.equal(queries.includes("ROLLBACK"), true);
});
