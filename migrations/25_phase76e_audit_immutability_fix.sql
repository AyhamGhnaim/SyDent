-- =====================================================
-- Migration 25 — Phase 7.6E audit log immutability fix
-- =====================================================
-- Context: Migration 23 created subscription_events with a critical flaw:
--   subscription_events.trial_request_id FK = ON DELETE CASCADE
--   AND trial_request_id is NOT NULL
--
-- Consequences (confirmed live):
--   1. When admin deletes a trial_request, ALL subscription_events
--      pointing to it are wiped — destroys the audit trail.
--   2. transitionAccount('delete') tries to log the delete event with
--      trial_request_id=NULL (so the event survives the row deletion),
--      but the NOT NULL constraint rejects the insert — silent failure.
--
-- Impact discovered: Dr. مجدي بورج's lifecycle events were preserved
-- (5 events), but his earlier history + the delete event itself were
-- wiped or never written. The audit log is incomplete.
--
-- This migration:
--   1) Makes trial_request_id NULLABLE (so orphan events can exist)
--   2) Replaces the CASCADE FK with ON DELETE SET NULL (so deleting a
--      trial_request now updates pointing events to NULL instead of
--      wiping them — Stripe pattern, true immutable audit log).
--
-- This restores Phase 7.6E's enterprise-grade subscription_events
-- design intent. Rule #34 (Platform layer = enterprise mindset)
-- requires audit logs to be immutable. CASCADE violates that.

-- =====================================================
-- Step 1: Verify current state (run manually first to confirm bug)
-- =====================================================
-- SELECT
--   tc.constraint_name, kcu.column_name,
--   rc.delete_rule, c.is_nullable
-- FROM information_schema.table_constraints tc
-- JOIN information_schema.key_column_usage kcu
--   ON tc.constraint_name = kcu.constraint_name
-- JOIN information_schema.referential_constraints rc
--   ON tc.constraint_name = rc.constraint_name
-- JOIN information_schema.columns c
--   ON c.table_name = tc.table_name AND c.column_name = kcu.column_name
-- WHERE tc.table_name = 'subscription_events'
--   AND tc.constraint_type = 'FOREIGN KEY';
-- Expected (before): trial_request_id_fkey, CASCADE, NO
-- Expected (after) : trial_request_id_fkey, SET NULL, YES

-- =====================================================
-- Step 2: Allow trial_request_id to be NULL
-- =====================================================
ALTER TABLE subscription_events
  ALTER COLUMN trial_request_id DROP NOT NULL;

-- =====================================================
-- Step 3: Drop the old CASCADE constraint
-- =====================================================
ALTER TABLE subscription_events
  DROP CONSTRAINT subscription_events_trial_request_id_fkey;

-- =====================================================
-- Step 4: Recreate with ON DELETE SET NULL
-- =====================================================
ALTER TABLE subscription_events
  ADD CONSTRAINT subscription_events_trial_request_id_fkey
  FOREIGN KEY (trial_request_id)
  REFERENCES trial_requests(id)
  ON DELETE SET NULL;

-- =====================================================
-- Step 5: Verify the fix (re-run Step 1 query)
-- =====================================================
-- After this migration:
--   delete_rule: 'SET NULL'   (was CASCADE)
--   is_nullable: 'YES'        (was NO)
--
-- Behavior change:
--   • Deleting a trial_request now preserves all its events
--     (sets their trial_request_id to NULL instead of deleting them).
--   • transitionAccount('delete') can now successfully insert the
--     delete event with trial_request_id=NULL.
--   • The user_id column on each event keeps the audit trail
--     usable (we can still group events by user even after
--     trial_request is gone).

-- =====================================================
-- Step 6 (informational): post-fix sanity check on existing events
-- =====================================================
-- SELECT COUNT(*) AS total_events,
--        COUNT(trial_request_id) AS events_with_trial_request,
--        COUNT(*) FILTER (WHERE trial_request_id IS NULL) AS orphan_events
-- FROM subscription_events;
-- Expected: total = with_trial_request + orphan
-- Today: all 8 events should still have a trial_request_id (no
-- orphans yet — the bug means we never managed to create one).
