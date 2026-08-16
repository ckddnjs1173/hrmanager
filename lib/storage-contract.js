// 인사야 storage portability contract.
//
// 현재 운영 런타임은 SQLite이지만, 이 목록은 PostgreSQL 전환 시 반드시 보존해야 하는
// 1.0 데이터 자산의 canonical inventory다. 새 저장소 구현은 이 계약보다 적은 테이블을
// 지원한 채 production-ready로 표시할 수 없다.

export const STORAGE_CONTRACT_VERSION = 1;

export const LEGACY_CORE_TABLES = Object.freeze([
  "bookings",
  "booking_events",
  "access_logs",
  "leads",
  "nomusa",
  "events",
  "notifications",
  "nomusa_accounts",
  "feedback",
  "cases",
  "case_events",
  "case_access_tokens",
]);

export const PORTABLE_JSON_TEXT_COLUMNS = Object.freeze({
  nomusa: Object.freeze(["doc"]),
  events: Object.freeze(["meta"]),
  cases: Object.freeze([
    "facts",
    "missing_facts",
    "issues",
    "calculations",
    "evidence",
    "actions",
    "documents",
    "legal_sources",
    "meta",
  ]),
});

export const PORTABLE_BOOLEAN_INTEGER_COLUMNS = Object.freeze({
  bookings: Object.freeze(["consent"]),
  nomusa: Object.freeze(["opted_out", "featured"]),
});

// Global identity tables intentionally do not belong to a tenant.
export const GLOBAL_IDENTITY_TABLES = Object.freeze([
  "users",
  "auth_identities",
  "user_sessions",
  "organizations",
]);

// Every table below must carry an explicit tenant owner column. Cross-org sharing is represented
// by share_grants; it is never implemented by omitting tenant ownership from the resource.
export const TENANT_TABLE_OWNERSHIP = Object.freeze({
  organization_memberships: "organization_id",
  organization_invitations: "organization_id",
  business_profiles: "organization_id",
  workplaces: "organization_id",
  compliance_scopes: "organization_id",
  compliance_scope_workplaces: "organization_id",
  employees: "organization_id",
  employments: "organization_id",
  employee_user_links: "organization_id",
  share_grants: "owner_organization_id",
  audit_logs: "organization_id",
  organization_deletion_requests: "organization_id",
});

export const SAAS_FOUNDATION_TABLES = Object.freeze([
  ...GLOBAL_IDENTITY_TABLES,
  ...Object.keys(TENANT_TABLE_OWNERSHIP),
]);

export function assertTenantBoundary({ organizationId, resourceOrganizationId } = {}) {
  const left = String(organizationId || "").trim();
  const right = String(resourceOrganizationId || "").trim();
  if (!left) throw new Error("organization_context_required");
  if (!right) throw new Error("resource_organization_required");
  if (left !== right) throw new Error("cross_tenant_access_denied");
  return true;
}

export function validateStorageTableInventory(actualTables = [], expectedTables = LEGACY_CORE_TABLES) {
  const actual = new Set(actualTables);
  const expected = new Set(expectedTables);
  const missing = [...expected].filter((name) => !actual.has(name));
  const duplicates = actualTables.filter((name, index) => actualTables.indexOf(name) !== index);
  return {
    ok: missing.length === 0 && duplicates.length === 0,
    missing,
    duplicates: [...new Set(duplicates)],
  };
}
