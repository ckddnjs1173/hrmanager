-- Insaya SaaS billing/entitlement foundation.
-- Product access is derived from Plan/Entitlement/Subscription state, not from payment-provider IDs.

BEGIN;

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE CHECK (key IN ('FREE','STARTER','STANDARD','PRO','ENTERPRISE')),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT','ACTIVE','ARCHIVED')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS plan_prices (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('MONTH','YEAR','CUSTOM')),
  currency TEXT NOT NULL DEFAULT 'KRW',
  amount_minor BIGINT,
  provider TEXT,
  provider_price_ref TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE(plan_id, billing_interval, currency, provider, provider_price_ref)
);
CREATE INDEX IF NOT EXISTS idx_plan_prices_plan ON plan_prices(plan_id, active);

CREATE TABLE IF NOT EXISTS plan_entitlements (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  entitlement_key TEXT NOT NULL,
  value JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE(plan_id, entitlement_key)
);

CREATE TABLE IF NOT EXISTS billing_accounts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  billing_email TEXT,
  legal_name TEXT,
  tax_id TEXT,
  provider TEXT,
  provider_customer_ref TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','CLOSED')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  billing_account_id TEXT REFERENCES billing_accounts(id) ON DELETE SET NULL,
  plan_id TEXT NOT NULL REFERENCES plans(id),
  plan_price_id TEXT REFERENCES plan_prices(id),
  status TEXT NOT NULL CHECK (status IN ('TRIALING','ACTIVE','PAST_DUE','GRACE','SUSPENDED','CANCELLED','EXPIRED')),
  provider TEXT,
  provider_subscription_ref TEXT,
  trial_started_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  current_period_started_at TIMESTAMPTZ,
  current_period_ends_at TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  cancelled_at TIMESTAMPTZ,
  grace_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON subscriptions(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_provider ON subscriptions(provider, provider_subscription_ref);

CREATE TABLE IF NOT EXISTS subscription_entitlements (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  entitlement_key TEXT NOT NULL,
  value JSONB NOT NULL,
  reason TEXT,
  effective_from TIMESTAMPTZ NOT NULL,
  effective_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE(subscription_id, entitlement_key, effective_from)
);
CREATE INDEX IF NOT EXISTS idx_subscription_entitlements_org ON subscription_entitlements(organization_id, subscription_id);

CREATE TABLE IF NOT EXISTS usage_meters (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  unit TEXT NOT NULL,
  aggregation TEXT NOT NULL CHECK (aggregation IN ('LATEST','SUM','MAX')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_id TEXT REFERENCES subscriptions(id) ON DELETE SET NULL,
  meter_id TEXT NOT NULL REFERENCES usage_meters(id),
  quantity NUMERIC(18,4) NOT NULL,
  idempotency_key TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE(organization_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_usage_events_meter ON usage_events(organization_id, meter_id, occurred_at);

CREATE TABLE IF NOT EXISTS coupons (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('PERCENT','AMOUNT','TRIAL_EXTENSION','CUSTOM')),
  discount_value NUMERIC(18,4),
  currency TEXT,
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  max_redemptions INTEGER,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED','EXPIRED')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS subscription_coupons (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  coupon_id TEXT NOT NULL REFERENCES coupons(id),
  applied_at TIMESTAMPTZ NOT NULL,
  removed_at TIMESTAMPTZ,
  UNIQUE(subscription_id, coupon_id)
);

CREATE TABLE IF NOT EXISTS invoice_references (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_id TEXT REFERENCES subscriptions(id) ON DELETE SET NULL,
  provider TEXT,
  provider_invoice_ref TEXT,
  status TEXT,
  currency TEXT,
  amount_due_minor BIGINT,
  amount_paid_minor BIGINT,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE(provider, provider_invoice_ref)
);
CREATE INDEX IF NOT EXISTS idx_invoice_refs_org ON invoice_references(organization_id, created_at DESC);

COMMIT;
