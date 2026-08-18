-- Defense-in-depth TTL guards for document storage capabilities.
-- Idempotent because all migrations are reapplied by the current runner.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='business_case_document_upload_intents_max_ttl_check') THEN
    ALTER TABLE business_case_document_upload_intents
      ADD CONSTRAINT business_case_document_upload_intents_max_ttl_check
      CHECK (expires_at <= issued_at + INTERVAL '30 minutes');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='business_case_document_download_grants_max_ttl_check') THEN
    ALTER TABLE business_case_document_download_grants
      ADD CONSTRAINT business_case_document_download_grants_max_ttl_check
      CHECK (expires_at <= issued_at + INTERVAL '5 minutes');
  END IF;
END $$;

COMMIT;
