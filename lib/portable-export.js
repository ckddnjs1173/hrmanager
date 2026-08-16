import crypto from "node:crypto";
import { LEGACY_CORE_TABLES, STORAGE_CONTRACT_VERSION } from "./storage-contract.js";

export const PORTABLE_EXPORT_FORMAT = "insaya-sqlite-portable-v1";

function checksumRows(rows) {
  return crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

export function buildPortableExport({ readRows, exportedAt = new Date().toISOString() } = {}) {
  if (typeof readRows !== "function") throw new Error("portable_export_reader_required");

  const tables = {};
  for (const table of LEGACY_CORE_TABLES) {
    const rows = readRows(table);
    if (!Array.isArray(rows)) throw new Error(`portable_export_invalid_rows:${table}`);
    tables[table] = {
      count: rows.length,
      sha256: checksumRows(rows),
      rows,
    };
  }

  return {
    format: PORTABLE_EXPORT_FORMAT,
    contractVersion: STORAGE_CONTRACT_VERSION,
    exportedAt,
    tableOrder: [...LEGACY_CORE_TABLES],
    tables,
  };
}

export function validatePortableExport(payload) {
  const errors = [];
  if (!payload || typeof payload !== "object") return { ok: false, errors: ["payload_required"] };
  if (payload.format !== PORTABLE_EXPORT_FORMAT) errors.push("format_mismatch");
  if (payload.contractVersion !== STORAGE_CONTRACT_VERSION) errors.push("contract_version_mismatch");
  if (!Array.isArray(payload.tableOrder)) errors.push("table_order_missing");

  for (const table of LEGACY_CORE_TABLES) {
    const entry = payload.tables?.[table];
    if (!entry) {
      errors.push(`table_missing:${table}`);
      continue;
    }
    if (!Array.isArray(entry.rows)) {
      errors.push(`rows_invalid:${table}`);
      continue;
    }
    if (entry.count !== entry.rows.length) errors.push(`count_mismatch:${table}`);
    if (entry.sha256 !== checksumRows(entry.rows)) errors.push(`checksum_mismatch:${table}`);
  }

  return { ok: errors.length === 0, errors };
}
