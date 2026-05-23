-- ============================================================================
-- Migration 26.1 — HOTFIX: Recursive RLS on doctors_admin_all policy
-- ============================================================================
-- Symptom: After Migration 26, every query to doctors returns HTTP 500
-- (confirmed in live test 23 May 2026 — 6 errors in console, admin
-- dashboard redirected to index because the role lookup query returns
-- nothing).
--
-- Root cause: Migration 26 added a policy that runs a subquery against
-- the SAME doctors table:
--
--   USING ( EXISTS (
--     SELECT 1 FROM public.doctors d_self
--     WHERE d_self.id = auth.uid() AND d_self.role = 'admin'
--   ))
--
-- PostgreSQL applies RLS to the inner SELECT, which itself requires RLS
-- to pass first, which requires the inner to pass first — infinite
-- recursion (error 42P17). Postgres surfaces this as HTTP 500 to PostgREST.
-- Confirmed pattern documented in Supabase Discussion #1138 and the
-- official RLS Performance & Best Practices doc.
--
-- Fix (Supabase-recommended pattern):
--   1. Define a SECURITY DEFINER function that bypasses RLS for the lookup.
--   2. Reference it from the policy as (select is_platform_admin()) so
--      Postgres caches the result via initPlan (one call per statement,
--      not per row).
--   3. STABLE + parameter-free + boolean return = safe and performant.
--
-- Idempotent + reversible.
-- ============================================================================

BEGIN;

-- ---- Step 1: SECURITY DEFINER helper ----
-- Bypasses RLS for the lookup (runs as function owner, not the caller).
-- STABLE: safe for use in policies, results may be cached within a stmt.
-- SET search_path: defensive — pins schema resolution to public.
-- COALESCE(..., false): safe for users with no doctors row.
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role = 'admin' FROM public.doctors WHERE id = auth.uid()),
    false
  );
$$;

-- Tighten EXECUTE — only logged-in users may call it.
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

-- ---- Step 2: Rebuild doctors_admin_all using the helper ----
-- Wrap the function in (select ...) per Supabase RLS best-practices doc:
-- this enables initPlan caching so the function is called once per
-- statement instead of once per row.
DROP POLICY IF EXISTS "doctors_admin_all" ON public.doctors;
CREATE POLICY "doctors_admin_all" ON public.doctors
  FOR ALL
  USING      ( (SELECT public.is_platform_admin()) )
  WITH CHECK ( (SELECT public.is_platform_admin()) );

COMMIT;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- 1) Function exists + is SECURITY DEFINER:
--    SELECT proname, prosecdef, provolatile
--    FROM pg_proc WHERE proname = 'is_platform_admin';
--    -- Expected: prosecdef=true, provolatile='s' (stable)
--
-- 2) Function returns the right value for the current SQL Editor session.
--    NOTE: in Supabase SQL Editor, auth.uid() returns NULL (no JWT context),
--    so this will return false. The real test is the app itself — see #4.
--    SELECT public.is_platform_admin();
--
-- 3) Policy now references the function:
--    SELECT policyname, qual
--    FROM pg_policies
--    WHERE schemaname='public' AND tablename='doctors'
--      AND policyname='doctors_admin_all';
--    -- Expected: qual contains 'is_platform_admin()'
--
-- 4) THE REAL TEST: hard-refresh admin.html
--    Expected: page loads, no 500s in console, د. أيهم email visible.

-- ============================================================================
-- ROLLBACK (if it makes things worse)
-- ============================================================================
-- BEGIN;
--   DROP POLICY IF EXISTS "doctors_admin_all" ON public.doctors;
--   DROP FUNCTION IF EXISTS public.is_platform_admin();
-- COMMIT;
-- After rollback, Phase X1 promote/demote will fail (admin writes lose
-- their RLS path). Re-run this migration to restore.
