-- Migration 27.2 — Phase X2.1 — Allow anonymous read of subscription_plans
-- Date: 23 May 2026
--
-- Purpose: landing.html (the public marketing page) now renders a pricing
-- section that reads subscription_plans live, so the prices displayed
-- there are always in sync with admin edits via admin.html. Unauthenticated
-- visitors (anon role) need SELECT access for this to work.
--
-- This DOES NOT expose anything sensitive — subscription_plans is a public
-- pricing catalog by design. The existing p_sub_plans_admin_write policy
-- (refactored in Migration 27.1) still gates all writes behind
-- is_platform_admin().
--
-- We replace the existing p_sub_plans_read policy with one that grants
-- SELECT to BOTH anon AND authenticated. The previous policy targeted
-- authenticated only (which broke landing.html for visitors).
--
-- Applied to Supabase production via SQL editor before commit.

DROP POLICY IF EXISTS p_sub_plans_read ON public.subscription_plans;

CREATE POLICY p_sub_plans_read
  ON public.subscription_plans
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Verify:
-- SELECT policyname, cmd, roles, qual::text
-- FROM pg_policies
-- WHERE schemaname='public' AND tablename='subscription_plans'
-- ORDER BY policyname;
-- Expected:
--   p_sub_plans_admin_write | ALL    | {authenticated}      | (SELECT is_platform_admin())
--   p_sub_plans_read        | SELECT | {anon,authenticated} | true
