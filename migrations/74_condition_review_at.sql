-- Migration 74: scheduled review date for clinical-watch ("مراقبة") tooth entries
-- Feature A (chart improvements): a 'condition' save can now carry a review date
-- (3/6/12 months from save). Due watches surface on the patient chart banner and
-- merge into the PRM recall list (patients.html).
-- Nullable, no backfill. RLS on teeth_status already scopes by doctor_id.

ALTER TABLE teeth_status ADD COLUMN IF NOT EXISTS review_at date;

COMMENT ON COLUMN teeth_status.review_at IS
  'Scheduled follow-up date for status=''condition'' rows (مراقبة). Cleared (null) when the surface is re-saved with any other status.';
