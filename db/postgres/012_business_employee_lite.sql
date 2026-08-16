-- Employee Lite additions required by Business compliance rules.
-- Intentionally excludes resident registration numbers, bank accounts and health data.

BEGIN;

ALTER TABLE employments ADD COLUMN IF NOT EXISTS base_wage NUMERIC(14,2);
ALTER TABLE employments ADD COLUMN IF NOT EXISTS fixed_allowances JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE employments ADD COLUMN IF NOT EXISTS job_title TEXT;
ALTER TABLE employments ADD COLUMN IF NOT EXISTS job_grade TEXT;

-- Prevent duplicate active mappings of one physical workplace into the same legal scope.
CREATE UNIQUE INDEX IF NOT EXISTS uq_scope_workplace_active
  ON compliance_scope_workplaces(organization_id, compliance_scope_id, workplace_id)
  WHERE effective_to IS NULL;

COMMIT;
