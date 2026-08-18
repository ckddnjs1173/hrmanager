-- Business Case document audit events must have a reproducible per-document order.
-- Multiple application operations can share the same millisecond timestamp, while
-- event IDs are opaque UUIDs and therefore cannot be used as chronological order.
-- Serialize event insertion on the parent document and advance duplicate/older
-- timestamps by one microsecond. This keeps the existing immutable event model
-- while making created_at a strict per-document audit timeline.

BEGIN;

CREATE OR REPLACE FUNCTION insaya_business_case_document_event_monotonic_time()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  latest_created_at TIMESTAMPTZ;
BEGIN
  -- Serialize event writers for this document so concurrent Business/Advisor
  -- events cannot receive the same or decreasing audit timestamp.
  PERFORM 1
  FROM business_case_documents
  WHERE id = NEW.document_id
  FOR UPDATE;

  SELECT MAX(created_at)
  INTO latest_created_at
  FROM business_case_document_events
  WHERE document_id = NEW.document_id;

  IF latest_created_at IS NOT NULL AND NEW.created_at <= latest_created_at THEN
    NEW.created_at := latest_created_at + INTERVAL '1 microsecond';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_business_case_document_event_monotonic_time
  ON business_case_document_events;

CREATE TRIGGER trg_business_case_document_event_monotonic_time
BEFORE INSERT ON business_case_document_events
FOR EACH ROW
EXECUTE FUNCTION insaya_business_case_document_event_monotonic_time();

COMMIT;
