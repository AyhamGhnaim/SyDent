-- Migration 37 — Phase X11 — Plan display layer (decoupled from enforcement)
-- ============================================================================
-- Adds PURE-DISPLAY columns to subscription_plans. None of these are ever read
-- by the activation/upgrade path (transitionAccount reads duration_days + price
-- only), so they cannot affect any tenant's trial_end, limits, or entitlements.
--
--   subtitle            — marketing tagline under the plan name (NULL = hidden)
--   price_period_label  — free text shown instead of "لمدة N يوم" (e.g. "شهرياً")
--   patients_display    — free-text override for the patients limit chip
--   employees_display   — free-text override for the employees limit chip
--   is_featured         — manual "الأكثر شعبية" highlight (replaces auto-compute)
--   featured_label      — text on the highlight badge (default "الأكثر شعبية")
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + guarded seed UPDATEs (only fill NULLs).
-- RLS unchanged: existing p_sub_plans_admin_write (FOR ALL via is_platform_admin)
-- already covers these columns; anon read policy already SELECTs *.
-- ============================================================================

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS subtitle           TEXT,
  ADD COLUMN IF NOT EXISTS price_period_label TEXT,
  ADD COLUMN IF NOT EXISTS patients_display   TEXT,
  ADD COLUMN IF NOT EXISTS employees_display  TEXT,
  ADD COLUMN IF NOT EXISTS is_featured        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS featured_label     TEXT;

-- Seed the existing 3 plans so the public pricing page looks IDENTICAL to today
-- the moment this runs, then becomes fully editable from the admin Plans Editor.
-- Guarded with "IS NULL" so re-running never clobbers admin edits.

UPDATE public.subscription_plans SET subtitle = 'جرّب كل الميزات بدون التزام أو بطاقة ائتمان.'
  WHERE code = 'trial'   AND subtitle IS NULL;
UPDATE public.subscription_plans SET subtitle = 'دفعة شهرية مرنة. أوقف متى شئت.'
  WHERE code = 'monthly' AND subtitle IS NULL;
UPDATE public.subscription_plans SET subtitle = 'الأنسب للعيادات المستقرة — وفّر أكثر بدفعة سنوية.'
  WHERE code = 'yearly'  AND subtitle IS NULL;

-- Period label: trial keeps the day-count phrasing; monthly/yearly get the
-- friendly billing-cadence wording the owner asked for.
UPDATE public.subscription_plans SET price_period_label = 'لمدة 30 يوم'
  WHERE code = 'trial'   AND price_period_label IS NULL;
UPDATE public.subscription_plans SET price_period_label = 'شهرياً'
  WHERE code = 'monthly' AND price_period_label IS NULL;
UPDATE public.subscription_plans SET price_period_label = 'سنوياً'
  WHERE code = 'yearly'  AND price_period_label IS NULL;

-- Featured highlight: preserve current behavior (yearly was the auto-featured
-- card) but now as an explicit, editable flag. Single-featured is enforced at
-- the app layer (saving a featured plan un-features the rest).
UPDATE public.subscription_plans SET is_featured = true  WHERE code = 'yearly';
UPDATE public.subscription_plans SET is_featured = false WHERE code IN ('trial','monthly') AND is_featured IS DISTINCT FROM false;

UPDATE public.subscription_plans SET featured_label = 'الأكثر شعبية' WHERE featured_label IS NULL;

-- Verify:
-- SELECT code, display_name, subtitle, price_period_label,
--        patients_display, employees_display, is_featured, featured_label
-- FROM public.subscription_plans ORDER BY sort_order;
