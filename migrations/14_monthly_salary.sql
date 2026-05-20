-- ============================================================================
-- Migration 14 — Monthly salary column on clinic_doctors
-- ============================================================================
-- Phase 6 W. Adds the storage for fixed-salary providers (hygienists,
-- assistants, secretaries on the team — once they're treated as providers in
-- a future expansion). Pairs with Migration 13's compensation_model column:
--
--   compensation_model='percentage' → monthly_salary unused (NULL is fine)
--   compensation_model='salary'     → monthly_salary required
--   compensation_model='hybrid'     → monthly_salary + share_percent BOTH used
--   compensation_model='none'       → monthly_salary unused
--
-- BIGINT chosen for Syrian Lira amounts. The upper bound of a BIGINT is
-- 9.2 quintillion — comfortable for any realistic payroll figure in any
-- currency including hyperinflation scenarios.
--
-- Nullable on purpose: we don't force a salary on every row (most existing
-- doctors are on percentage and have no monthly_salary). The UI enforces
-- "salary > 0 required when compensation_model='salary'" at save time.
-- ============================================================================

ALTER TABLE clinic_doctors
  ADD COLUMN IF NOT EXISTS monthly_salary BIGINT;

-- Sanity constraint: salary must be non-negative when set.
ALTER TABLE clinic_doctors
  DROP CONSTRAINT IF EXISTS monthly_salary_nonneg;
ALTER TABLE clinic_doctors
  ADD CONSTRAINT monthly_salary_nonneg
    CHECK (monthly_salary IS NULL OR monthly_salary >= 0);

-- Smoke test (run manually to verify):
--   SELECT compensation_model, monthly_salary, COUNT(*)
--   FROM clinic_doctors
--   GROUP BY compensation_model, monthly_salary
--   ORDER BY compensation_model;
--   -- Expected after first run: all rows have monthly_salary=NULL.
