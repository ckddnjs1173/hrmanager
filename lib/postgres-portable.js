import {
  LEGACY_CORE_TABLES,
  PORTABLE_BOOLEAN_INTEGER_COLUMNS,
  PORTABLE_JSON_TEXT_COLUMNS,
} from "./storage-contract.js";
import { semanticChecksumRows, toPostgresPortableRow } from "./portable-semantics.js";
import { validatePortableExport } from "./portable-export.js";
import { withPostgresTransaction } from "./postgres-client.js";

const SERIAL_ID_TABLES = Object.freeze([
  "booking_events",
  "access_logs",
  "events",
  "notifications",
  "nomusa_accounts",
  "feedback",
  "case_events",
]);

function quoteIdentifier(value) {
  const name = String(value || "");
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new Error(`unsafe_identifier:${name}`);
  return `"${name.replaceAll('"', '""')}"`;
}

function insertSql(table, columns) {
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(",");
  return `INSERT INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(",")}) VALUES (${placeholders})`;
}

function portablePgValue(table, column, value) {
  if ((PORTABLE_JSON_TEXT_COLUMNS[table] || []).includes(column)) {
    return value == null ? null : JSON.stringify(value);
  }
  return value;
}

async function tableCount(client, table) {
  const result = await client.query(`SELECT COUNT(*)::bigint AS count FROM ${quoteIdentifier(table)}`);
  return Number(result.rows[0]?.count || 0);
}

export async function inspectPostgresLegacyTables(client) {
  const result = {};
  for (const table of LEGACY_CORE_TABLES) result[table] = await tableCount(client, table);
  return result;
}

async function resetSerialSequence(client, table) {
  if (!SERIAL_ID_TABLES.includes(table)) return;
  await client.query(
    `SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM ${quoteIdentifier(table)}`,
    [table]
  );
}

export async function importPortableIntoPostgres(pool, payload, { replace = false } = {}) {
  const validation = validatePortableExport(payload);
  if (!validation.ok) throw new Error(`portable_export_invalid:${validation.errors.join(",")}`);

  return withPostgresTransaction(pool, async (client) => {
    const before = await inspectPostgresLegacyTables(client);
    const occupied = Object.entries(before).filter(([, count]) => count > 0);
    if (occupied.length && !replace) {
      throw new Error(`postgres_target_not_empty:${occupied.map(([name]) => name).join(",")}`);
    }

    if (replace) {
      const tables = [...LEGACY_CORE_TABLES].reverse().map(quoteIdentifier).join(",");
      await client.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
    }

    for (const table of LEGACY_CORE_TABLES) {
      for (const rawRow of payload.tables[table].rows) {
        const row = toPostgresPortableRow(table, rawRow);
        const columns = Object.keys(row);
        if (!columns.length) continue;
        await client.query(
          insertSql(table, columns),
          columns.map((column) => portablePgValue(table, column, row[column]))
        );
      }
      await resetSerialSequence(client, table);
    }

    return inspectPostgresLegacyTables(client);
  });
}

export async function validatePostgresAgainstPortable(pool, payload) {
  const validation = validatePortableExport(payload);
  if (!validation.ok) return { ok: false, errors: validation.errors, tables: {} };

  const tables = {};
  const errors = [];
  for (const table of LEGACY_CORE_TABLES) {
    const result = await pool.query(`SELECT * FROM ${quoteIdentifier(table)}`);
    const sourceRows = payload.tables[table].rows;
    const sourceSemanticSha256 = payload.tables[table].semanticSha256 || semanticChecksumRows(table, sourceRows);
    const targetSemanticSha256 = semanticChecksumRows(table, result.rows);
    const countMatches = sourceRows.length === result.rows.length;
    const semanticMatches = sourceSemanticSha256 === targetSemanticSha256;

    tables[table] = {
      sourceCount: sourceRows.length,
      targetCount: result.rows.length,
      countMatches,
      sourceSemanticSha256,
      targetSemanticSha256,
      semanticMatches,
    };
    if (!countMatches) errors.push(`count_mismatch:${table}`);
    if (!semanticMatches) errors.push(`semantic_mismatch:${table}`);
  }

  return { ok: errors.length === 0, errors, tables };
}

export function describePortableConversions() {
  return {
    jsonColumns: PORTABLE_JSON_TEXT_COLUMNS,
    booleanColumns: PORTABLE_BOOLEAN_INTEGER_COLUMNS,
    serialIdTables: SERIAL_ID_TABLES,
  };
}
