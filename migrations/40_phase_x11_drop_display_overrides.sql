-- Migration 40 — Phase X11 — OPTIONAL cleanup
-- ============================================================================
-- Removes the two display-override columns added in Migration 37 that are no
-- longer used: the public/preview cards now show the patient/employee limits
-- directly from the enforced max_patients / max_employees, so a separate
-- free-text override is unnecessary (owner decision).
--
-- OPTIONAL: safe to skip. The columns are unused (NULL) and harmless if left.
-- Only run this AFTER the a89 deploy is live (the new code no longer reads or
-- writes these columns). DROP COLUMN is irreversible.
-- ============================================================================

ALTER TABLE public.subscription_plans
  DROP COLUMN IF EXISTS patients_display,
  DROP COLUMN IF EXISTS employees_display;

-- Verify:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='subscription_plans'
-- ORDER BY ordinal_position;
