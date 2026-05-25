-- ═══════════════════════════════════════════════════════════════
-- Migration 32 — trial_requests self-signup hardening
-- Phase: Email Part 3a
-- Date: 2026-05-26
-- ═══════════════════════════════════════════════════════════════
-- Root cause: phone NOT NULL blocks email-only signups (Phase 7.6F
-- intends to support BOTH email-only and phone-only signups; email
-- path sends phone=null → 23502 NOT NULL violation → HTTP 400 →
-- "trial_requests insert failed" red banner shown to the user).
--
-- Bonus security: the pre-existing "Anyone can insert request" RLS
-- policy was discovered to be dangerously permissive:
--
--   CREATE POLICY "Anyone can insert request" ON trial_requests
--     FOR INSERT WITH CHECK (true);
--
-- This let any authenticated user INSERT a trial_request with ANY
-- user_id (impersonation) and ANY status (e.g., self-promotion to
-- 'accepted', bypassing admin review). We replace it with a properly-
-- scoped self-INSERT policy.
--
-- Discovery (قاعدة #76): Q1 diagnostic (`SELECT * FROM pg_policies
-- WHERE tablename='trial_requests'`) revealed 5 policies in production,
-- only 1 of which was documented in v50 context. Always run the
-- diagnostic before assuming RLS state from docs.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────
-- STEP 1 — Make phone nullable (the actual bug fix)
-- ─────────────────────────────────────────────────────────
-- Phase 7.6F intent: support BOTH email-only and phone-only signups.
-- For email-only signups, phone is NULL by design.
-- ALTER COLUMN ... DROP NOT NULL is metadata-only (no table rewrite).
ALTER TABLE public.trial_requests ALTER COLUMN phone DROP NOT NULL;

-- ─────────────────────────────────────────────────────────
-- STEP 2 — Verify no duplicate user_ids (defensive guard)
-- ─────────────────────────────────────────────────────────
-- We expect 0 duplicates today (no user-facing path creates them).
-- If we find any, ABORT the migration so a human can inspect.
-- Never silently delete trial_requests data.
DO $$
DECLARE v_dup INT;
BEGIN
  SELECT COUNT(*) INTO v_dup FROM (
    SELECT user_id FROM public.trial_requests
    WHERE user_id IS NOT NULL
    GROUP BY user_id HAVING COUNT(*) > 1
  ) x;
  IF v_dup > 0 THEN
    RAISE EXCEPTION 'Found % duplicate user_id values in trial_requests. Inspect with: SELECT user_id, COUNT(*) FROM trial_requests WHERE user_id IS NOT NULL GROUP BY user_id HAVING COUNT(*) > 1;', v_dup;
  END IF;
END$$;

-- ─────────────────────────────────────────────────────────
-- STEP 3 — Add UNIQUE constraint on user_id
-- ─────────────────────────────────────────────────────────
-- Prevents double-INSERT (e.g., button double-click, RLS retry).
-- NULLABLE column → PostgreSQL allows multiple NULLs (won't block
-- legacy orphan rows that have user_id=NULL, if any exist).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'trial_requests_user_id_unique'
  ) THEN
    ALTER TABLE public.trial_requests
      ADD CONSTRAINT trial_requests_user_id_unique UNIQUE (user_id);
  END IF;
END$$;

-- ─────────────────────────────────────────────────────────
-- STEP 4 — Replace weak INSERT policy with properly-scoped one
-- ─────────────────────────────────────────────────────────
-- BEFORE: "Anyone can insert request" → WITH CHECK (true)
--   → any authenticated user could INSERT with any user_id / status
--   → security hole: impersonation + self-promotion to 'accepted'
--
-- AFTER:  "trial_requests_self_insert" → WITH CHECK
--   (auth.uid() = user_id AND status = 'new')
--   → user_id must match the JWT (no impersonation)
--   → status forced to 'new' (admin still gates accept/reject)
DROP POLICY IF EXISTS "Anyone can insert request" ON public.trial_requests;
DROP POLICY IF EXISTS "trial_requests_self_insert" ON public.trial_requests;

CREATE POLICY "trial_requests_self_insert"
  ON public.trial_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND status = 'new'
  );

-- ═══════════════════════════════════════════════════════════════
-- VERIFICATION (run after migration to confirm all 4 fixes landed):
--
-- SELECT '1_phone_nullable' AS check_name, is_nullable AS value
-- FROM information_schema.columns
-- WHERE table_name='trial_requests' AND column_name='phone'
-- UNION ALL
-- SELECT '2_unique_constraint',
--   CASE WHEN EXISTS(SELECT 1 FROM pg_constraint WHERE conname='trial_requests_user_id_unique')
--   THEN 'YES' ELSE 'NO' END
-- UNION ALL
-- SELECT '3_old_policy_dropped',
--   CASE WHEN NOT EXISTS(SELECT 1 FROM pg_policies
--     WHERE tablename='trial_requests' AND policyname='Anyone can insert request')
--   THEN 'YES' ELSE 'NO' END
-- UNION ALL
-- SELECT '4_new_policy_added',
--   CASE WHEN EXISTS(SELECT 1 FROM pg_policies
--     WHERE tablename='trial_requests' AND policyname='trial_requests_self_insert')
--   THEN 'YES' ELSE 'NO' END;
--
-- EXPECTED: all 4 rows = YES
-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK (if needed — destructive, run only as recovery):
--
-- -- 1. Restore phone NOT NULL (will fail if any NULL rows exist post-migration)
-- ALTER TABLE public.trial_requests ALTER COLUMN phone SET NOT NULL;
--
-- -- 2. Drop UNIQUE constraint
-- ALTER TABLE public.trial_requests DROP CONSTRAINT trial_requests_user_id_unique;
--
-- -- 3. Restore weak policy (NOT RECOMMENDED — leaves security hole)
-- DROP POLICY IF EXISTS "trial_requests_self_insert" ON public.trial_requests;
-- CREATE POLICY "Anyone can insert request" ON public.trial_requests
--   FOR INSERT WITH CHECK (true);
-- ═══════════════════════════════════════════════════════════════

-- Live tested 2026-05-26: signup with drayhamghnaim+test5@gmail.com
-- → INSERT succeeded → redirect to pending.html → trial_request row
-- created with status='new', phone=NULL. No console errors.
