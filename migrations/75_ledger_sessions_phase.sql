-- Migration 75: treatment-plan phase on ledger_sessions
-- Feature C (chart improvements): planned sessions can be grouped into phases
-- (1..3) for the patient-facing treatment-plan document. Display-only field —
-- phase NEVER enters FIFO allocation, splitIsEarned, or any balance math.
-- Nullable (= unclassified), no backfill. Existing RLS covers it.

ALTER TABLE ledger_sessions ADD COLUMN IF NOT EXISTS phase smallint;

ALTER TABLE ledger_sessions DROP CONSTRAINT IF EXISTS ledger_sessions_phase_check;
ALTER TABLE ledger_sessions ADD CONSTRAINT ledger_sessions_phase_check
  CHECK (phase IS NULL OR phase BETWEEN 1 AND 3);

COMMENT ON COLUMN ledger_sessions.phase IS
  'Treatment-plan stage (1..3) for planned sessions; presentation-only, excluded from all financial logic.';
