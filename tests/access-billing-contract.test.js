import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AUDIT_ACTIONS,
  PERMISSIONS,
  ROLE_TEMPLATES,
  authorizeRolePermission,
  getRoleScopeMode,
  roleHasPermission,
  validateRoleTemplates,
} from "../lib/access-control-contract.js";
import {
  ENTITLEMENT_KEYS,
  PLAN_KEYS,
  SUBSCRIPTION_LIFECYCLE,
  USAGE_METER_KEYS,
  assertSubscriptionTransition,
  resolveEntitlement,
  validateEntitlementValue,
} from "../lib/billing-contract.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const billingSql = fs.readFileSync(path.join(ROOT, "db/postgres/020_billing_entitlements.sql"), "utf8");

function tableNames(sql) {
  return [...sql.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z_]+)/gi)].map((match) => match[1]);
}

function tableBlock(sql, table) {
  const match = sql.match(new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${table}\\s*\\(([\\s\\S]*?)\\n\\);`, "i"));
  assert.ok(match, `missing table block: ${table}`);
  return match[1];
}

test("role templates only contain canonical unique permissions", () => {
  assert.equal(validateRoleTemplates().ok, true);
  assert.equal(new Set(PERMISSIONS).size, PERMISSIONS.length);
  assert.equal(new Set(AUDIT_ACTIONS).size, AUDIT_ACTIONS.length);
});

test("manager and billing roles cannot cross sensitive boundaries", () => {
  assert.equal(roleHasPermission("MANAGER", "employee.read"), true);
  assert.equal(roleHasPermission("MANAGER", "employee.salary.read"), false);
  assert.equal(roleHasPermission("MANAGER", "employee.export"), false);
  assert.equal(getRoleScopeMode("MANAGER"), "assigned");

  assert.equal(roleHasPermission("BILLING_ADMIN", "billing.manage"), true);
  assert.equal(roleHasPermission("BILLING_ADMIN", "subscription.change"), true);
  assert.equal(roleHasPermission("BILLING_ADMIN", "employee.read"), false);
  assert.equal(roleHasPermission("BILLING_ADMIN", "case.read"), false);
});

test("HR admin cannot mutate subscription and owner keeps destructive org permission", () => {
  assert.equal(roleHasPermission("HR_ADMIN", "subscription.change"), false);
  assert.equal(roleHasPermission("OWNER", "subscription.change"), true);
  assert.equal(roleHasPermission("OWNER", "org.delete"), true);
});

test("external advisor needs an explicit share grant", () => {
  assert.equal(getRoleScopeMode("EXTERNAL_ADVISOR"), "grant_only");
  assert.deepEqual(
    authorizeRolePermission({ roleKey: "EXTERNAL_ADVISOR", permission: "shared.case.read", hasShareGrant: false }),
    { allowed: false, reason: "share_grant_required" }
  );
  assert.deepEqual(
    authorizeRolePermission({ roleKey: "EXTERNAL_ADVISOR", permission: "shared.case.read", hasShareGrant: true }),
    { allowed: true, reason: "allowed", scopeMode: "grant_only" }
  );
  assert.equal(roleHasPermission("EXTERNAL_ADVISOR", "employee.read"), false);
});

test("inactive membership denies access before permission evaluation", () => {
  assert.deepEqual(
    authorizeRolePermission({ roleKey: "OWNER", permission: "org.read", membershipStatus: "SUSPENDED" }),
    { allowed: false, reason: "membership_inactive" }
  );
});

test("billing contract uses provider-neutral plan and entitlement keys", () => {
  assert.deepEqual(PLAN_KEYS, ["FREE", "STARTER", "STANDARD", "PRO", "ENTERPRISE"]);
  assert.equal(new Set(ENTITLEMENT_KEYS).size, ENTITLEMENT_KEYS.length);
  assert.equal(new Set(USAGE_METER_KEYS).size, USAGE_METER_KEYS.length);
  assert.ok(ENTITLEMENT_KEYS.includes("employee.limit"));
  assert.ok(ENTITLEMENT_KEYS.includes("document.workflow"));
  assert.ok(ENTITLEMENT_KEYS.includes("audit.retention_days"));
  assert.ok(ENTITLEMENT_KEYS.includes("api.access"));
  assert.ok(ENTITLEMENT_KEYS.includes("sso.access"));
});

test("subscription lifecycle prevents time-travel shortcuts", () => {
  assert.equal(assertSubscriptionTransition("TRIALING", "ACTIVE"), true);
  assert.equal(assertSubscriptionTransition("PAST_DUE", "ACTIVE"), true);
  assert.throws(() => assertSubscriptionTransition("ACTIVE", "TRIALING"), /subscription_transition_denied/);
  assert.throws(() => assertSubscriptionTransition("EXPIRED", "ACTIVE"), /subscription_transition_denied/);
  assert.deepEqual(SUBSCRIPTION_LIFECYCLE.EXPIRED, []);
});

test("entitlement values are typed and subscription override wins", () => {
  assert.deepEqual(validateEntitlementValue("case.full", true), { ok: true });
  assert.deepEqual(validateEntitlementValue("case.full", 1), { ok: false, error: "entitlement_boolean_required" });
  assert.deepEqual(validateEntitlementValue("employee.limit", 10), { ok: true });
  assert.deepEqual(validateEntitlementValue("employee.limit", -1), { ok: false, error: "entitlement_nonnegative_integer_required" });
  assert.equal(resolveEntitlement({ planValue: 10 }), 10);
  assert.equal(resolveEntitlement({ planValue: 10, subscriptionOverride: 25 }), 25);
});

test("billing SQL separates global catalog from tenant-owned billing data", () => {
  const expected = [
    "plans",
    "plan_prices",
    "plan_entitlements",
    "billing_accounts",
    "subscriptions",
    "subscription_entitlements",
    "usage_meters",
    "usage_events",
    "coupons",
    "subscription_coupons",
    "invoice_references",
  ];
  assert.deepEqual(tableNames(billingSql).sort(), expected.sort());

  for (const table of [
    "billing_accounts",
    "subscriptions",
    "subscription_entitlements",
    "usage_events",
    "subscription_coupons",
    "invoice_references",
  ]) {
    assert.match(tableBlock(billingSql, table), /\borganization_id\b/i, `${table} must be tenant-owned`);
  }

  assert.match(tableBlock(billingSql, "usage_events"), /idempotency_key\s+TEXT\s+NOT NULL/i);
  assert.match(tableBlock(billingSql, "usage_events"), /UNIQUE\(organization_id, idempotency_key\)/i);
});

test("audit contract covers the sensitive foundation actions", () => {
  for (const action of [
    "employee.salary.view",
    "employee.export",
    "case.share",
    "case.share.revoke",
    "document.approve",
    "document.download",
    "member.role.change",
    "subscription.change",
    "organization.delete.execute",
    "legal.rule.applied",
    "operator.break_glass.start",
  ]) {
    assert.ok(AUDIT_ACTIONS.includes(action), `missing audit action: ${action}`);
  }

  assert.equal(ROLE_TEMPLATES.HR_ADMIN.permissions.includes("audit.export"), false);
  assert.equal(ROLE_TEMPLATES.OWNER.permissions.includes("audit.export"), true);
});
