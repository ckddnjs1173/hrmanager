-- Insaya SaaS foundation schema.
-- Global identity is shared, but Worker private Case data is never automatically linked to an
-- employer tenant. Business/Pro resources are tenant-owned and cross-org access uses share_grants.

BEGIN;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email_normalized TEXT NOT NULL UNIQUE,
  email_verified_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','locked','deleted')),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS auth_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_subject TEXT NOT NULL,
  password_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE(provider, provider_subject)
);
CREATE INDEX IF NOT EXISTS idx_auth_identities_user ON auth_identities(user_id);

CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  ip_hash TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('BUSINESS','PRO_OFFICE','INTERNAL')),
  legal_name TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT','ACTIVE','SUSPENDED','DELETION_PENDING','DELETED')),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deletion_requested_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS organization_memberships (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'INVITED' CHECK (status IN ('INVITED','ACTIVE','SUSPENDED','REMOVED')),
  scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  joined_at TIMESTAMPTZ,
  removed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE(organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON organization_memberships(user_id, status);
CREATE INDEX IF NOT EXISTS idx_memberships_org ON organization_memberships(organization_id, status);

CREATE TABLE IF NOT EXISTS organization_invitations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email_normalized TEXT NOT NULL,
  role_key TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  invited_by_user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','EXPIRED','REVOKED')),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_org_invitations_org ON organization_invitations(organization_id, status);

CREATE TABLE IF NOT EXISTS business_profiles (
  organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  industry_code TEXT,
  payday SMALLINT CHECK (payday IS NULL OR payday BETWEEN 1 AND 31),
  default_weekly_hours NUMERIC(6,2),
  wage_system TEXT,
  inclusive_wage BOOLEAN,
  rules_of_employment_exists BOOLEAN,
  external_advisor_exists BOOLEAN,
  profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS workplaces (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  address JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CLOSED')),
  opened_at DATE,
  closed_at DATE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE(organization_id, code)
);
CREATE INDEX IF NOT EXISTS idx_workplaces_org ON workplaces(organization_id, status);

-- Legal applicability grouping. A physical workplace is not automatically a separate
-- "사업 또는 사업장" for employee-count/application rules.
CREATE TABLE IF NOT EXISTS compliance_scopes (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  basis TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','UNCERTAIN','ARCHIVED')),
  worker_count_method TEXT,
  rule_version TEXT,
  effective_from DATE,
  effective_to DATE,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_compliance_scopes_org ON compliance_scopes(organization_id, status);

CREATE TABLE IF NOT EXISTS compliance_scope_workplaces (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  compliance_scope_id TEXT NOT NULL REFERENCES compliance_scopes(id) ON DELETE CASCADE,
  workplace_id TEXT NOT NULL REFERENCES workplaces(id) ON DELETE CASCADE,
  effective_from DATE,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scope_workplaces_scope ON compliance_scope_workplaces(organization_id, compliance_scope_id);
CREATE INDEX IF NOT EXISTS idx_scope_workplaces_workplace ON compliance_scope_workplaces(organization_id, workplace_id);

-- Employee is a tenant-owned person record, not a global login identity.
CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_number TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL,
  work_email TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','DELETED')),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  UNIQUE(organization_id, employee_number)
);
CREATE INDEX IF NOT EXISTS idx_employees_org ON employees(organization_id, status);

CREATE TABLE IF NOT EXISTS employments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  workplace_id TEXT REFERENCES workplaces(id),
  employment_type TEXT,
  hire_date DATE NOT NULL,
  termination_date DATE,
  weekly_contract_hours NUMERIC(6,2),
  wage_type TEXT,
  probation_start DATE,
  probation_end DATE,
  fixed_term_start DATE,
  fixed_term_end DATE,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PLANNED','ACTIVE','ENDED','CANCELLED')),
  effective_from TIMESTAMPTZ NOT NULL,
  effective_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_employments_employee ON employments(organization_id, employee_id, status);
CREATE INDEX IF NOT EXISTS idx_employments_workplace ON employments(organization_id, workplace_id, status);

-- Explicit opt-in only. No email/phone auto matching is permitted.
CREATE TABLE IF NOT EXISTS employee_user_links (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'INVITED' CHECK (status IN ('INVITED','ACTIVE','REVOKED')),
  invited_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  UNIQUE(organization_id, employee_id),
  UNIQUE(organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_employee_user_links_user ON employee_user_links(user_id, status);

CREATE TABLE IF NOT EXISTS share_grants (
  id TEXT PRIMARY KEY,
  owner_organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  grantee_organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  grantee_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  granted_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  CHECK (grantee_organization_id IS NOT NULL OR grantee_user_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_share_grants_owner ON share_grants(owner_organization_id, resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_share_grants_grantee_org ON share_grants(grantee_organization_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_share_grants_grantee_user ON share_grants(grantee_user_id, expires_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id),
  actor_type TEXT NOT NULL DEFAULT 'USER',
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  result TEXT NOT NULL DEFAULT 'SUCCESS',
  request_id TEXT,
  ip_hash TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_time ON audit_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(organization_id, resource_type, resource_id);

CREATE TABLE IF NOT EXISTS organization_deletion_requests (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requested_by_user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','CANCELLED','EXECUTED','LEGAL_HOLD')),
  requested_at TIMESTAMPTZ NOT NULL,
  execute_after TIMESTAMPTZ NOT NULL,
  cancelled_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  export_reference TEXT,
  reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_org_deletion_status ON organization_deletion_requests(organization_id, status);

COMMIT;
