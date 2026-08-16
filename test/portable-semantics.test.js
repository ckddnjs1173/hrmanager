import test from "node:test";
import assert from "node:assert/strict";
import { buildPortableExport, validatePortableExport } from "../lib/portable-export.js";
import { semanticChecksumRows, toPostgresPortableRow } from "../lib/portable-semantics.js";

const sqliteNomusa = {
  id: "n1",
  name: "노무사",
  loc: "서울",
  sido: "서울",
  opted_out: 0,
  featured: 1,
  doc: '{"b":2,"a":1}',
};
const postgresNomusa = {
  id: "n1",
  name: "노무사",
  loc: "서울",
  sido: "서울",
  opted_out: false,
  featured: true,
  doc: { a: 1, b: 2 },
};

test("semantic checksum treats SQLite and PostgreSQL representations as equal", () => {
  assert.equal(
    semanticChecksumRows("nomusa", [sqliteNomusa]),
    semanticChecksumRows("nomusa", [postgresNomusa])
  );
});

test("portable export includes backward-compatible semantic checksums", () => {
  const payload = buildPortableExport({
    exportedAt: "2026-08-16T00:00:00.000Z",
    readRows: (table) => table === "nomusa" ? [sqliteNomusa] : [],
  });
  assert.match(payload.tables.nomusa.semanticSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(validatePortableExport(payload), { ok: true, errors: [] });
});

test("PostgreSQL conversion parses JSON and converts integer booleans", () => {
  const converted = toPostgresPortableRow("nomusa", sqliteNomusa);
  assert.deepEqual(converted.doc, { b: 2, a: 1 });
  assert.equal(converted.opted_out, false);
  assert.equal(converted.featured, true);
});

test("timestamp parity normalizes Date and ISO string", () => {
  const source = [{ id: 1, at: "2026-08-16T10:00:00.000Z", type: "view", ref: "x", meta: "{\"a\":1}" }];
  const target = [{ id: "1", at: new Date("2026-08-16T10:00:00.000Z"), type: "view", ref: "x", meta: { a: 1 } }];
  assert.equal(semanticChecksumRows("events", source), semanticChecksumRows("events", target));
});
