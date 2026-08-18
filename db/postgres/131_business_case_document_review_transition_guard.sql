-- Defense-in-depth: Business Case document decision states must be backed by
-- an Advisor review on the current immutable version.

BEGIN;

CREATE OR REPLACE FUNCTION enforce_business_case_document_review_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_version_id TEXT;
  expected_decision TEXT;
BEGIN
  IF NEW.status NOT IN ('APPROVED','CHANGES_REQUESTED') OR NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT id INTO current_version_id
    FROM business_case_document_versions
   WHERE document_id = NEW.id
   ORDER BY version_no DESC
   LIMIT 1;

  expected_decision := NEW.status;

  IF current_version_id IS NULL OR NOT EXISTS (
    SELECT 1
      FROM business_case_document_reviews r
     WHERE r.document_id = NEW.id
       AND r.version_id = current_version_id
       AND r.decision = expected_decision
  ) THEN
    RAISE EXCEPTION 'business_case_document_transition_invalid'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_business_case_document_review_transition ON business_case_documents;
CREATE TRIGGER trg_business_case_document_review_transition
BEFORE UPDATE OF status ON business_case_documents
FOR EACH ROW
EXECUTE FUNCTION enforce_business_case_document_review_transition();

COMMIT;
