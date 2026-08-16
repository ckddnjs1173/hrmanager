import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LEGACY_CORE_TABLES,
  SAAS_FOUNDATION_TABLES,
  TENANT_TABLE_OWNERSHIP,
  assertTenantBoundary,
} from "../lib/storage-contract.js";
import { buildPortableExport, validatePortableExport } from "../lib/portable-export.js";
import {
  ORGANIZATION_LIFECYCLE,
  MEMBERSHIP_LIFECYCLE,
  TENANT_BOUNDARY_INVARIANTS,
  assertEmployeeUserLinkIntent,
  assertLastOwnerExit,
  assertMembershipTransition,
  assertOrganizationTransition,
} from "../lib/tenant-contract.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const coreSql = fs.readFileSync(path.join(ROOT, "db/postgres/001_legacy_core.sql"), "utf8");
const tenantSql = fs.readFileSync(path.join(ROOT, "db/postgres/010_saas_identity.sql"), "utf8");

function tableNames(sql) {
  return [...sql.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z_]+)/gi)].map((match) => match[1]);
}

function tableBlock(sql, table) {
  const match = sql.match(new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${table}\\s*\\(([\\s\\S]*?)\\n\\);`, "i"));
  assert.ok(match, `missing table block: ${table}`);
  return match[1];
}

function sameSet(actual, expected) {
  assert.deepEqual([...new Set(actual)].sort(), [...new Set(expected)].sort());
}

test("PostgreSQL legacy schema covers every current 1.0 storage table", () => {
  sameSet(tableNames(coreSql), LEGACY_CORE_TABLES);
});

test("SaaS foundation schema covers global identity and every tenant-owned table", () => {
  sameSet(tableNames(tenantSql), SAAS_FOUNDATION_TABLES);
  for (const [table, ownerColumn] of Object.entries(TENANT_TABLE_OWNERSHIP)) {
    assert.match(tableBlock(tenantSql, table), new RegExp(`\\b${ownerColumn}\\b`, "i"), `${table} must carry ${ownerColumn}`);
  }
});

test("Worker Case stays outside employer tenant and account auto-linking", () => {
  const workerCase = tableBlock(coreSql, "cases");
  assert.doesNotMatch(workerCase, /\borganization_id\b/i);
  assert.doesNotMatch(workerCase, /\buser_id\b/i);

  const employee = tableBlock(tenantSql, "employees");
  assert.doesNotMatch(employee, /\buser_id\b/i);
  const link = tableBlock(tenantSql, "employee_user_links");
  assert.match(link, /\bemployee_id\b/i);
  assert.match(link, /\buser_id\b/i);
  assert.match(tenantSql, /No email\/phone auto matching is permitted/i);
});

test("physical workplace and legal compliance scope remain separate objects", () => {
  const scope = tableBlock(tenantSql, "compliance_scopes");
  const mapping = tableBlock(tenantSql, "compliance_scope_workplaces");
  assert.match(scope, /worker_count_method/i);
  assert.match(scope, /rule_version/i);
  assert.match(mapping, /compliance_scope_id/i);
  assert.match(mapping, /workplace_id/i);
});

test("cross-organization access is denied by the shared boundary contract", () => {
  assert.equal(assertTenantBoundary({ organizationId: "org-a", resourceOrganizationId: "org-a" }), true);
  assert.throws(() => assertTenantBoundary({ organizationId: "org-a", resourceOrganizationId: "org-b" }), /cross_tenant_access_denied/);
  assert.throws(() => assertTenantBoundary({ organizationId: "", resourceOrganizationId: "org-a" }), /organization_context_required/);
});

test("portable export freezes all tables with row counts and checksums", () => {
  const payload = buildPortableExport({
    exportedAt: "2026-08-16T00:00:00.000Z",
    readRows: (table) => [{ table, id: `${table}-1` }],
  });
  assert.deepEqual(payload.tableOrder, [...LEGACY_CORE_TABLES]);
  assert.equal(Object.keys(payload.tables).length, LEGACY_CORE_TABLES.length);
  assert.equal(validatePortableExport(payload).ok, true);

  payload.tables.cases.rows[0].id = "tampered";
  const tampered = validatePortableExport(payload);
  assert.equal(tampered.ok, false);
  assert.ok(tampered.errors.includes("checksum_mismatch:cases"));
});

test("tenant lifecycle forbids destructive shortcuts", () => {
  assert.ok(TENANT_BOUNDARY_INVARIANTS.length >= 8);
  assert.equal(assertOrganizationTransition("DRAFT", "ACTIVE"), true);
  assert.equal(assertOrganizationTransition("ACTIVE", "DELETION_PENDING"), true);
  assert.throws(() => assertOrganizationTransition("ACTIVE", "DELETED"), /organization_transition_denied/);
  assert.equal(assertMembershipTransition("INVITED", "ACTIVE"), true);
  assert.throws(() => assertMembershipTransition("REMOVED", "ACTIVE"), /membership_transition_denied/);
  assert.deepEqual(ORGANIZATION_LIFECYCLE.DELETED, []);
  assert.deepEqual(MEMBERSHIP_LIFECYCLE.REMOVED, []);
});

test("employee-user linking and last-owner exit require explicit safe paths", () => {
  assert.throws(() => assertEmployeeUserLinkIntent({ invited: true, accepted: false }), /acceptance_required/);
  assert.equal(assertEmployeeUserLinkIntent({ invited: true, accepted: true }), true);
  assert.throws(() => assertLastOwnerExit({ activeOwnerCount: 1 }), /last_owner_exit_denied/);
  assert.equal(assertLastOwnerExit({ activeOwnerCount: 1, transferring: true }), true);
  assert.equal(assertLastOwnerExit({ activeOwnerCount: 1, closingOrganization: true }), true);
});
