-- Migration 27 — Phase X2 — Plans & Pricing Editor (event type)
-- Date: 23 May 2026
--
-- Purpose: Add 'plan_updated' event type to subscription_events CHECK
-- constraint so that admin edits to subscription_plans rows are auditable
-- (Stripe-style immutable change log pattern).
--
-- Scope: CHECK constraint extension only. The subscription_plans table
-- itself already exists from Migration 23 with admin-only RLS write
-- policy (which is being further refined in Migration 27.1 to use the
-- is_platform_admin() SECURITY DEFINER function — same pattern as
-- doctors_admin_all post-26.1).
--
-- This migration was applied to Supabase prior to commit (verified via
-- "Success. No rows returned" in SQL editor on 23 May 2026).

-- توسيع CHECK من 15 إلى 16 قيمة
ALTER TABLE subscription_events
  DROP CONSTRAINT subscription_events_event_type_check;

ALTER TABLE subscription_events
  ADD CONSTRAINT subscription_events_event_type_check CHECK (event_type IN (
    'accept','convert_monthly','convert_yearly','renew','extend',
    'shorten','enter_grace','reactivate','suspend','delete',
    'activate_permanent','convert_permanent_yearly','reject',
    'promote_to_admin','demote_from_admin',
    'plan_updated'  -- جديد (Phase X2)
  ));

-- Verify:
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conrelid='subscription_events'::regclass
--   AND conname='subscription_events_event_type_check';
