-- Migration 38 — Phase X11 — Editable plan icon (emoji)
-- ============================================================================
-- The little emoji next to each plan name (🆓 / 💵 / 💎) was hard-coded in the
-- admin tab markup, so renaming a plan never changed it and it couldn't be
-- removed. This makes it a pure-display column like the Migration 37 fields —
-- never read by the activation/upgrade path.
--
--   icon — emoji/glyph shown before the plan name (NULL/'' = no icon)
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + guarded seed (only fills NULLs).
-- RLS unchanged (p_sub_plans_admin_write FOR ALL covers it; anon read = *).
-- ============================================================================

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS icon TEXT;

-- Seed the 3 existing plans with their current hard-coded tab icons so the
-- admin tabs look identical the moment this runs, then become editable.
UPDATE public.subscription_plans SET icon = '🆓' WHERE code = 'trial'   AND icon IS NULL;
UPDATE public.subscription_plans SET icon = '💵' WHERE code = 'monthly' AND icon IS NULL;
UPDATE public.subscription_plans SET icon = '💎' WHERE code = 'yearly'  AND icon IS NULL;

-- Verify:
-- SELECT code, display_name, icon FROM public.subscription_plans ORDER BY sort_order;
