-- Migration 27.1 — Phase X2 — Refactor subscription_plans admin policy
-- Date: 23 May 2026
--
-- Purpose: Replace the existing p_sub_plans_admin_write policy (which used
-- a self-referencing EXISTS subquery on doctors) with one that calls the
-- is_platform_admin() SECURITY DEFINER helper function created in
-- Migration 26.1.
--
-- Rationale (Rule #42 from Phase X1 lessons):
--   1. Self-referencing subqueries on tables that themselves have RLS
--      policies trigger recursive evaluation (HTTP 500 in extreme cases,
--      slow query plans always).
--   2. SECURITY DEFINER bypasses RLS for the lookup, breaking the cycle.
--   3. Wrapping the function call in (SELECT ...) enables Supabase
--      initPlan caching — function evaluated once per query, not per row.
--   4. Consistent with doctors_admin_all policy pattern (same audit, same
--      maintenance story).
--
-- The p_sub_plans_read policy (cmd=SELECT, qual=true) is intentionally
-- LEFT UNCHANGED — public read access is required so tenant pages and
-- the future landing pricing display can read subscription_plans without
-- needing admin rights.
--
-- Applied to Supabase production prior to commit (verified via
-- "Success. No rows returned" on 23 May 2026).

DROP POLICY IF EXISTS p_sub_plans_admin_write ON public.subscription_plans;

CREATE POLICY p_sub_plans_admin_write
  ON public.subscription_plans
  FOR ALL
  TO authenticated
  USING ((SELECT public.is_platform_admin()))
  WITH CHECK ((SELECT public.is_platform_admin()));

-- Verify:
-- SELECT policyname, cmd, qual::text, with_check::text
-- FROM pg_policies
-- WHERE schemaname='public' AND tablename='subscription_plans'
-- ORDER BY policyname;
-- Expected:
--   p_sub_plans_admin_write | ALL    | (SELECT is_platform_admin()) | (SELECT is_platform_admin())
--   p_sub_plans_read        | SELECT | true                          | NULL
