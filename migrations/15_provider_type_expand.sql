-- ============================================================================
-- Migration 15 — Expand provider_type to include secretary + other
-- ============================================================================
-- Phase 6 X. The unified role dropdown now drives every employee's
-- clinic_doctors row (yes — even secretaries and miscellaneous staff get a
-- row, so their salary + hours + color all live in one place). That means
-- provider_type needs values beyond the original doctor/hygienist/assistant
-- trio:
--
--   doctor    : full-scope dentist                  (unchanged)
--   hygienist : trainee / cleaning assistant         (renamed UX label to
--                                                     'متدرب/مساعد' but the
--                                                     internal value stays
--                                                     'hygienist' for stability)
--   assistant : chair-side assistant                 (unchanged)
--   secretary : front desk / scheduling staff        (NEW — was role-only)
--   other     : cleaner / accountant / manager / ...  (NEW — catch-all)
--
-- The split between role (clinic_employees) and provider_type
-- (clinic_doctors) remains: role drives lock-mode + permissions; provider_type
-- drives reports + payroll attribution. A 'secretary' role employee gets a
-- secretary-typed clinic_doctors row so their salary lives next to the
-- doctors' salaries in a single payroll table.
-- ============================================================================

ALTER TABLE clinic_doctors
  DROP CONSTRAINT IF EXISTS provider_type_valid;
ALTER TABLE clinic_doctors
  ADD CONSTRAINT provider_type_valid
    CHECK (provider_type IN ('doctor', 'hygienist', 'assistant', 'secretary', 'other'));

-- Smoke test:
--   SELECT provider_type, COUNT(*)
--   FROM clinic_doctors
--   GROUP BY provider_type
--   ORDER BY provider_type;
