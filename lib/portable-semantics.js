import crypto from "node:crypto";
import {
  PORTABLE_BOOLEAN_INTEGER_COLUMNS,
  PORTABLE_JSON_TEXT_COLUMNS,
} from "./storage-contract.js";

const TIMESTAMP_COLUMNS = Object.freeze({
  bookings: ["at", "expires", "deleted_at"],
  booking_events: ["at"],
  access_logs: ["at"],
  leads: ["at"],
  events: ["at"],
  notifications: ["at"],
  nomusa_accounts: ["created_at", "last_login"],
  feedback: ["at"],
  cases: ["created_at", "updated_at", "deleted_at"],
  case_events: ["at"],
  case_access_tokens: ["created_at", "last_used_at", "expires_at"],
});

const NUMERIC_ID_TABLES = new Set([
  "booking_events",
  "access_logs",
  "events",
  "notifications",
  "nomusa_accounts",
  "feedback",
  "case_events",
]);

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stableValue(value[key])])
    );
  }
  return value;
}

function parseJson(value) {
  if (value == null || value === "") return null;
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}

function normalizeTimestamp(value) {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : String(value);
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value === "1" || value.toLowerCase() === "true";
  return Boolean(value);
}

function normalizeNumericId(value) {
  if (value == null || value === "") return value;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : String(value);
}

export function normalizePortableRow(table, row = {}) {
  const jsonColumns = new Set(PORTABLE_JSON_TEXT_COLUMNS[table] || []);
  const booleanColumns = new Set(PORTABLE_BOOLEAN_INTEGER_COLUMNS[table] || []);
  const timestampColumns = new Set(TIMESTAMP_COLUMNS[table] || []);

  const normalized = {};
  for (const key of Object.keys(row).sort()) {
    let value = row[key];
    if (jsonColumns.has(key)) value = stableValue(parseJson(value));
    else if (booleanColumns.has(key)) value = normalizeBoolean(value);
    else if (timestampColumns.has(key)) value = normalizeTimestamp(value);
    else if (key === "id" && NUMERIC_ID_TABLES.has(table)) value = normalizeNumericId(value);
    normalized[key] = stableValue(value);
  }
  return normalized;
}

export function semanticChecksumRows(table, rows = []) {
  const serialized = rows
    .map((row) => JSON.stringify(normalizePortableRow(table, row)))
    .sort();
  return crypto.createHash("sha256").update(JSON.stringify(serialized)).digest("hex");
}

export function toPostgresPortableRow(table, row = {}) {
  const jsonColumns = new Set(PORTABLE_JSON_TEXT_COLUMNS[table] || []);
  const booleanColumns = new Set(PORTABLE_BOOLEAN_INTEGER_COLUMNS[table] || []);
  const converted = {};

  for (const [key, rawValue] of Object.entries(row)) {
    let value = rawValue;
    if (jsonColumns.has(key)) value = parseJson(value);
    else if (booleanColumns.has(key)) value = normalizeBoolean(value);
    converted[key] = value;
  }
  return converted;
}
