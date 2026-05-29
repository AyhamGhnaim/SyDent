-- Migration 39 — Phase X11 part 2 — generic plan assignment + add/delete audit
-- ============================================================================
-- Extends the subscription_events.event_type CHECK with three values so the
-- new admin actions are auditable:
--   convert_plan  — assign a tenant to ANY plan code (added plans included);
--                   trial_end/price come from that plan's own config row
--   plan_created  — admin created a new plan in the catalog
--   plan_deleted  — admin hard-deleted an (unreferenced) plan from the catalog
--
-- All previous values are preserved (historical events stay valid). Drop +
-- re-add is the standard way to widen a CHECK in Postgres.
-- ============================================================================

ALTER TABLE public.subscription_events
  DROP CONSTRAINT IF EXISTS subscription_events_event_type_check;

ALTER TABLE public.subscription_events
  ADD CONSTRAINT subscription_events_event_type_check CHECK (event_type IN (
    'accept','convert_monthly','convert_yearly','renew','extend',
    'shorten','enter_grace','reactivate','suspend','delete',
    'activate_permanent','convert_permanent_yearly','reject',
    'promote_to_admin','demote_from_admin',
    'plan_updated','template_updated',
    'convert_plan','plan_created','plan_deleted'  -- ⭐ Phase X11 part 2 (new)
  ));

-- Verify:
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conrelid='public.subscription_events'::regclass
--   AND conname='subscription_events_event_type_check';
