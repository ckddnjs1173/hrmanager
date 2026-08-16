// Provider-neutral billing/entitlement contract.
// Stripe/PortOne/etc.는 payment rail일 뿐 제품 권한의 source of truth가 아니다.

export const PLAN_KEYS = Object.freeze(["FREE", "STARTER", "STANDARD", "PRO", "ENTERPRISE"]);

export const SUBSCRIPTION_STATUSES = Object.freeze([
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "GRACE",
  "SUSPENDED",
  "CANCELLED",
  "EXPIRED",
]);

export const SUBSCRIPTION_LIFECYCLE = Object.freeze({
  TRIALING: Object.freeze(["ACTIVE", "CANCELLED", "EXPIRED"]),
  ACTIVE: Object.freeze(["PAST_DUE", "CANCELLED"]),
  PAST_DUE: Object.freeze(["ACTIVE", "GRACE", "SUSPENDED", "CANCELLED"]),
  GRACE: Object.freeze(["ACTIVE", "SUSPENDED", "CANCELLED"]),
  SUSPENDED: Object.freeze(["ACTIVE", "CANCELLED"]),
  CANCELLED: Object.freeze(["EXPIRED"]),
  EXPIRED: Object.freeze([]),
});

export const ENTITLEMENT_DEFINITIONS = Object.freeze({
  "employee.limit": Object.freeze({ type: "integer", meter: "employee_count" }),
  "admin.limit": Object.freeze({ type: "integer", meter: "admin_seat_count" }),
  "workplace.limit": Object.freeze({ type: "integer", meter: "workplace_count" }),
  "case.full": Object.freeze({ type: "boolean" }),
  "risk.dashboard": Object.freeze({ type: "boolean" }),
  "document.workflow": Object.freeze({ type: "boolean" }),
  "advisor.collaboration": Object.freeze({ type: "boolean" }),
  "audit.read": Object.freeze({ type: "boolean" }),
  "audit.export": Object.freeze({ type: "boolean" }),
  "audit.retention_days": Object.freeze({ type: "integer" }),
  "ai.monthly_credits": Object.freeze({ type: "integer", meter: "ai_credit_usage" }),
  "bulk.import": Object.freeze({ type: "boolean" }),
  "api.access": Object.freeze({ type: "boolean" }),
  "sso.access": Object.freeze({ type: "boolean" }),
});

export const ENTITLEMENT_KEYS = Object.freeze(Object.keys(ENTITLEMENT_DEFINITIONS));

export const USAGE_METER_KEYS = Object.freeze([
  "employee_count",
  "admin_seat_count",
  "workplace_count",
  "ai_credit_usage",
]);

export function canTransitionSubscription(from, to) {
  return Array.isArray(SUBSCRIPTION_LIFECYCLE[from]) && SUBSCRIPTION_LIFECYCLE[from].includes(to);
}

export function assertSubscriptionTransition(from, to) {
  if (!SUBSCRIPTION_STATUSES.includes(from) || !SUBSCRIPTION_STATUSES.includes(to)) {
    throw new Error("subscription_status_invalid");
  }
  if (!canTransitionSubscription(from, to)) {
    throw new Error(`subscription_transition_denied:${from}:${to}`);
  }
  return true;
}

export function validateEntitlementValue(key, value) {
  const definition = ENTITLEMENT_DEFINITIONS[key];
  if (!definition) return { ok: false, error: "entitlement_unknown" };
  if (definition.type === "boolean" && typeof value !== "boolean") return { ok: false, error: "entitlement_boolean_required" };
  if (definition.type === "integer" && (!Number.isInteger(value) || value < 0)) return { ok: false, error: "entitlement_nonnegative_integer_required" };
  return { ok: true };
}

export function resolveEntitlement({ planValue, subscriptionOverride } = {}) {
  return subscriptionOverride === undefined ? planValue : subscriptionOverride;
}
