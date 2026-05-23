-- ============================================================================
-- Migration 26 — Phase X1: Promote/Demote Admin
-- ============================================================================
-- Purpose: enable the "Promote tenant to platform admin" workflow.
--
-- Phase X1 adds two new lifecycle event types and ensures the doctors
-- table is writable by platform admins (so admin.html can mutate
-- doctors.role from UI without raw SQL).
--
-- Changes:
--   1. ALTER subscription_events.event_type CHECK constraint to add:
--        • 'promote_to_admin'
--        • 'demote_from_admin'
--   2. Defensive RLS policy on doctors table allowing admin-role users
--      to INSERT/UPDATE (no-op if policy already exists with same intent).
--   3. Backfill verification: ≥1 admin must exist before promote/demote
--      flows are useful.
--
-- Idempotent: re-running is safe (DROP IF EXISTS + IF NOT EXISTS guards).
-- Reversible: ROLLBACK block at bottom.
-- ============================================================================

BEGIN;

-- ============================================================================
-- Step 1: Expand event_type CHECK constraint (13 → 15 values)
-- ============================================================================
-- The existing 13 values come from Migration 23. We add 2 new event types
-- for the admin role mutations. These do NOT change plan/status/trial_end —
-- they mutate doctors.role only. We still log them in subscription_events
-- because it is the canonical audit stream per tenant (Stripe pattern).
ALTER TABLE public.subscription_events
  DROP CONSTRAINT IF EXISTS subscription_events_event_type_check;

ALTER TABLE public.subscription_events
  ADD CONSTRAINT subscription_events_event_type_check
  CHECK (event_type IN (
    -- 13 existing (from Migration 23):
    'accept', 'reject', 'reactivate',
    'convert_monthly', 'convert_yearly',
    'renew', 'extend', 'shorten',
    'enter_grace', 'suspend', 'delete',
    'edit', 'cancel',
    -- 2 new (Phase X1):
    'promote_to_admin', 'demote_from_admin'
  ));

-- ============================================================================
-- Step 2: Ensure doctors table allows admin-role writes
-- ============================================================================
-- The doctors table predates the documented migrations folder. We don't
-- know its current RLS state. This step:
--   (a) Ensures RLS is enabled (no-op if already enabled)
--   (b) Adds a defensive admin-write policy if missing
--
-- We use a DO block to detect existing policies and avoid duplicates.
-- The policy grants admin-role users (verified via doctors self-join)
-- full read/write to the doctors table. Non-admin users keep whatever
-- policies they already have.

-- (a) Enable RLS — idempotent
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;

-- (b) Admin-write policy: any user whose own doctors row has role='admin'
--     gets full access to all rows. This is what makes promote/demote work.
DROP POLICY IF EXISTS "doctors_admin_all" ON public.doctors;
CREATE POLICY "doctors_admin_all" ON public.doctors
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.doctors d_self
      WHERE d_self.id = auth.uid() AND d_self.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.doctors d_self
      WHERE d_self.id = auth.uid() AND d_self.role = 'admin'
    )
  );

-- (c) Self-read policy: every authenticated user can read their OWN row
--     (preserves the existing role-check pattern used by index.html,
--     auth.html, admin.html, supabase-init.js). Safe to re-create.
DROP POLICY IF EXISTS "doctors_self_read" ON public.doctors;
CREATE POLICY "doctors_self_read" ON public.doctors
  FOR SELECT
  USING (id = auth.uid());

-- ============================================================================
-- Step 3: Backfill verification — at least one admin must exist
-- ============================================================================
-- Phase X1's demote flow has a hard "count(admins) > 1" guardrail. The
-- promote flow needs a current admin to perform the action. So we require
-- ≥1 admin to exist before the migration is considered successful.
DO $$
DECLARE
  v_admin_count INT;
  v_admin_emails TEXT;
BEGIN
  SELECT COUNT(*), STRING_AGG(u.email, ', ' ORDER BY u.email)
    INTO v_admin_count, v_admin_emails
  FROM public.doctors d
  JOIN auth.users u ON u.id = d.id
  WHERE d.role = 'admin';

  IF v_admin_count = 0 THEN
    RAISE EXCEPTION 'Migration 26 ABORT: no admin found in doctors table. '
      'Phase X1 requires at least one existing admin. '
      'Before retrying, run: '
      'INSERT INTO public.doctors (id, role) VALUES ('
      '(SELECT id FROM auth.users WHERE email=''drayhamghnaim@gmail.com''), '
      '''admin'') ON CONFLICT (id) DO UPDATE SET role=''admin'';';
  END IF;

  RAISE NOTICE 'Migration 26 OK: % admin(s) found: %', v_admin_count, v_admin_emails;
END $$;

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES (run AFTER COMMIT to confirm success)
-- ============================================================================
-- 1) Confirm the CHECK constraint now has 15 values:
--    SELECT pg_get_constraintdef(oid) AS definition
--    FROM pg_constraint
--    WHERE conname = 'subscription_events_event_type_check';
--    -- Expected: CHECK (event_type = ANY (ARRAY['accept'::text, ..., 'demote_from_admin'::text]))
--
-- 2) Confirm policies on doctors table:
--    SELECT policyname, cmd, qual, with_check
--    FROM pg_policies
--    WHERE schemaname = 'public' AND tablename = 'doctors'
--    ORDER BY policyname;
--    -- Expected: at minimum 'doctors_admin_all' and 'doctors_self_read'
--
-- 3) Confirm admin count:
--    SELECT u.email, d.role
--    FROM public.doctors d
--    JOIN auth.users u ON u.id = d.id
--    WHERE d.role = 'admin';
--    -- Expected: at least 1 row (د. أيهم)
--
-- 4) Smoke test the new event_types (rollback-safe):
--    BEGIN;
--      INSERT INTO public.subscription_events (event_type, performed_by, notes)
--      VALUES ('promote_to_admin', 'migration26-smoke-test', 'TEST — rollback');
--      INSERT INTO public.subscription_events (event_type, performed_by, notes)
--      VALUES ('demote_from_admin', 'migration26-smoke-test', 'TEST — rollback');
--      SELECT event_type, notes FROM public.subscription_events
--      WHERE performed_by = 'migration26-smoke-test';
--    ROLLBACK;
--    -- Expected: both INSERTs succeed, SELECT returns 2 rows, ROLLBACK undoes.

-- ============================================================================
-- ROLLBACK (if needed — restores pre-Migration-26 state)
-- ============================================================================
-- WARNING: if any rows already have event_type='promote_to_admin' or
-- 'demote_from_admin', the constraint downgrade will fail. Delete those
-- events first or accept the constraint drift.
--
-- BEGIN;
--   -- (a) Revert event_type CHECK to 13 values:
--   ALTER TABLE public.subscription_events
--     DROP CONSTRAINT IF EXISTS subscription_events_event_type_check;
--   ALTER TABLE public.subscription_events
--     ADD CONSTRAINT subscription_events_event_type_check
--     CHECK (event_type IN (
--       'accept','reject','reactivate','convert_monthly','convert_yearly',
--       'renew','extend','shorten','enter_grace','suspend','delete','edit','cancel'
--     ));
--   -- (b) Drop the new policies (other RLS on doctors is preserved):
--   DROP POLICY IF EXISTS "doctors_admin_all" ON public.doctors;
--   DROP POLICY IF EXISTS "doctors_self_read" ON public.doctors;
--   -- (c) RLS itself stays enabled (we didn't add it, just ensured it).
-- COMMIT;
