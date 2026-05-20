-- ============================================================================
-- Migration 13 — Provider type + compensation model on clinic_doctors
-- ============================================================================
-- Phase 6 R foundation. Two columns that lay the groundwork for an upcoming
-- payments + reports redesign. Until those land, only the hygienist /
-- assistant distinction is surfaced in the UI; the compensation_model column
-- is captured but not yet used in any calculation.
--
-- Why two columns rather than a single boolean (e.g. is_hygienist)?
-- The original Phase 6 R sketch was just `is_hygienist BOOLEAN`. After Ayham
-- mentioned that the next two features are a payments page (materials +
-- salaries + provider payouts) and a unified reports page, a one-bit flag
-- becomes a dead-end: each new payroll feature would need its own ALTER.
-- Splitting role-vs-compensation up front means every future expansion is
-- a pure UI change.
--
-- provider_type — WHAT the person does in the clinic
--   doctor    : full-scope dentist (default — current behavior)
--   hygienist : cleanings / prophylaxis / fluoride / sterilization assistance
--   assistant : chair-side assistant (future — no production attribution)
--
-- compensation_model — HOW the person gets paid
--   percentage : % of their production (default — current behavior, share_percent)
--   salary     : fixed monthly salary, not derived from production
--   hybrid     : base salary + production bonus (future)
--   none       : not compensated through this table (e.g. clinic owner who
--                takes profit directly, or a volunteer)
--
-- The CHECK constraints intentionally allow only the values we use today.
-- Adding more later (e.g. provider_type = 'specialist') is a simple ALTER
-- ... DROP CONSTRAINT ... ADD CONSTRAINT with an expanded IN(...) list — no
-- schema redesign needed.
-- ============================================================================

ALTER TABLE clinic_doctors
  ADD COLUMN IF NOT EXISTS provider_type TEXT NOT NULL DEFAULT 'doctor';

ALTER TABLE clinic_doctors
  ADD COLUMN IF NOT EXISTS compensation_model TEXT NOT NULL DEFAULT 'percentage';

-- Constraints separate so re-running this migration on a partially-applied
-- DB doesn't fail on the column ADDs (those are idempotent via IF NOT EXISTS,
-- but constraints aren't; DROP + ADD is the safe pattern).
ALTER TABLE clinic_doctors
  DROP CONSTRAINT IF EXISTS provider_type_valid;
ALTER TABLE clinic_doctors
  ADD CONSTRAINT provider_type_valid
    CHECK (provider_type IN ('doctor', 'hygienist', 'assistant'));

ALTER TABLE clinic_doctors
  DROP CONSTRAINT IF EXISTS compensation_model_valid;
ALTER TABLE clinic_doctors
  ADD CONSTRAINT compensation_model_valid
    CHECK (compensation_model IN ('percentage', 'salary', 'hybrid', 'none'));

-- Index for the upcoming reports page — filtering by provider_type is going
-- to be a common pattern in the provider-reports module.
CREATE INDEX IF NOT EXISTS idx_clinic_doctors_provider_type
  ON clinic_doctors(provider_type)
  WHERE is_active = TRUE;

-- All existing rows now have provider_type='doctor' + compensation_model='percentage'
-- (the DEFAULT-on-add behavior of NOT NULL on a populated table), which exactly
-- preserves current behavior. No data migration is required.

-- Smoke test (run manually to verify):
--   SELECT provider_type, compensation_model, COUNT(*)
--   FROM clinic_doctors
--   GROUP BY provider_type, compensation_model;
--   -- Expected: all rows show ('doctor', 'percentage').
