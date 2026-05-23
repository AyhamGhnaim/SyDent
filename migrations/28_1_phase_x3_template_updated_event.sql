-- Migration 28.1 — Phase X3 — Add template_updated event_type
-- Date: 23 May 2026 (Phase X3 محادثة 1)
--
-- Purpose: Allow logEvent('template_updated', ...) when admin edits a
-- row in notification_templates. Same Stripe-style immutable audit
-- pattern used for plan_updated in Migration 27 (Phase X2).
--
-- This is a small standalone migration (rule #48) — Migration 28 created
-- the table, this extends the event_type CHECK, and Migration 28.2 seeds
-- the 4 default templates. Each can be rolled back independently if
-- something goes wrong in live test.
--
-- Constraint history:
--   Migration 23  → 14 values (foundation)
--   Migration 26  → 15 values (+ promote_to_admin, demote_from_admin
--                              + activate_permanent, convert_permanent_yearly
--                              + others reorganised)
--   Migration 27  → 16 values (+ plan_updated)
--   Migration 28.1 → 17 values (+ template_updated) ← this one
--
-- Apply to Supabase production via SQL editor AFTER Migration 28 and
-- BEFORE Migration 28.2.

ALTER TABLE public.subscription_events
  DROP CONSTRAINT IF EXISTS subscription_events_event_type_check;

ALTER TABLE public.subscription_events
  ADD CONSTRAINT subscription_events_event_type_check CHECK (event_type IN (
    'accept','convert_monthly','convert_yearly','renew','extend',
    'shorten','enter_grace','reactivate','suspend','delete',
    'activate_permanent','convert_permanent_yearly','reject',
    'promote_to_admin','demote_from_admin',
    'plan_updated',
    'template_updated'  -- ⭐ Phase X3 (new)
  ));

-- ───── Verification queries (run AFTER apply) ────────────────────────
-- 1) Constraint includes template_updated:
--    SELECT pg_get_constraintdef(oid)
--    FROM pg_constraint
--    WHERE conrelid='public.subscription_events'::regclass
--      AND conname='subscription_events_event_type_check';
--    Expected: a CHECK definition containing 'template_updated'.
--
-- 2) Smoke test (must succeed, then ROLLBACK to avoid littering audit log):
--    BEGIN;
--    INSERT INTO public.subscription_events
--      (trial_request_id, event_type, performed_by, notes)
--    VALUES
--      ('00000000-0000-0000-0000-000000000000'::uuid,
--       'template_updated',
--       'migration-test',
--       '{"smoke":"test"}'::jsonb);
--    -- Expected: INSERT 0 1 (or RLS denial if not running as admin,
--    -- but NEVER a CHECK violation).
--    ROLLBACK;
