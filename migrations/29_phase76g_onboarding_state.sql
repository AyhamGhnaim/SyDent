-- ════════════════════════════════════════════════════════════════════
-- Migration 29 — Phase 7.6G: Tenant Onboarding State
-- ════════════════════════════════════════════════════════════════════
--
-- Adds two optional timestamp columns to clinic_settings to track:
--   1. When the welcome banner was dismissed (user agency preserved)
--   2. When the clinic_name was confirmed by the user (so we don't
--      keep nagging them about the auto-generated "عيادة د. <name>")
--
-- The checklist completion items themselves are NOT stored — they are
-- computed at read time from existing data:
--   ☐ Clinic info confirmed → clinic_name_confirmed_at IS NOT NULL
--   ☐ First patient         → COUNT(patients) > 0
--   ☐ First appointment     → COUNT(appointments) > 0
--   ☐ First session         → COUNT(sessions) > 0
--
-- This means the dashboard checklist is always accurate without any
-- sync logic. Adding a patient in patients.html automatically marks
-- the "أضف أول مريض" item as done on the dashboard (next render).
--
-- Idempotent: safe to run multiple times. Uses IF NOT EXISTS so no-op
-- on re-execution. No RLS changes — clinic_settings RLS is already
-- per-owner from Migration 5, and these columns inherit it.
--
-- Rollback (if ever needed):
--   ALTER TABLE clinic_settings DROP COLUMN IF EXISTS onboarding_dismissed_at;
--   ALTER TABLE clinic_settings DROP COLUMN IF EXISTS clinic_name_confirmed_at;
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE clinic_settings
  ADD COLUMN IF NOT EXISTS onboarding_dismissed_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE clinic_settings
  ADD COLUMN IF NOT EXISTS clinic_name_confirmed_at TIMESTAMPTZ DEFAULT NULL;

-- Verify (the dashboard query reads these columns; ensure they're visible)
COMMENT ON COLUMN clinic_settings.onboarding_dismissed_at IS
  'Phase 7.6G: timestamp when the owner dismissed the welcome banner. NULL = still show banner if checklist incomplete.';

COMMENT ON COLUMN clinic_settings.clinic_name_confirmed_at IS
  'Phase 7.6G: timestamp when the owner confirmed (or edited) the clinic_name. NULL = show inline prompt suggesting they verify the auto-generated name.';
