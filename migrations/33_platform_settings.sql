-- Migration 33 — Platform-wide settings (key/value)
-- Date: 27 May 2026 (Phase X3 محادثة 3)
--
-- Purpose: Single source of truth for platform-level (NOT tenant-level)
-- settings — values that apply to SyDent itself (the vendor), not to
-- any individual clinic. First use: support_phone, displayed inside
-- admin WhatsApp templates (wa_welcome / wa_reminder / wa_suspended /
-- wa_renewed) so tenants can tell the message came from SyDent support
-- vs. their own clinic. Industry parallel: CareStack centralized
-- "sender names + footer disclaimers" applied system-wide with
-- location/provider overrides — same shape, simpler scope (one row).
--
-- Pattern: key/value table, not separate columns per setting. Same
-- choice the industry makes (Stripe app_settings, Auth0 tenant_settings,
-- WordPress wp_options) — adding a new setting becomes one INSERT,
-- not a column ADD + migration. Values are TEXT; callers cast as needed.
--
-- RLS notes:
--   - This is internal vendor data, NOT a public catalog. Unlike
--     subscription_plans (anon read for landing.html pricing) or
--     notification_templates (authenticated read for admin only),
--     platform_settings is admin-only for BOTH read and write —
--     same shape as the audit log (subscription_events). Tenants
--     have no business querying SyDent's internal config.
--   - Admin gate via is_platform_admin() SECURITY DEFINER (Migration
--     26.1) — recursion-safe (Golden Rule #42).
--
-- updated_at trigger uses a dedicated function (set_platform_settings_
-- updated_at) following the same per-table pattern as Migration 28's
-- set_notification_templates_updated_at — there is no shared touch_
-- updated_at helper to reuse.
--
-- Seed: one row 'support_phone' with empty value '' (per user spec —
-- empty default; admin enters the number from the UI after deploy).
-- Empty string (not NULL) so the JS side reads `r.value` as '' without
-- null-checks downstream. ON CONFLICT (key) DO NOTHING preserves the
-- value if migration re-runs in an env where admin already set it.
--
-- Apply to Supabase production via SQL editor BEFORE Migration 33.1.

-- ───── 1. Table ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  TEXT
);

-- ───── 2. RLS ────────────────────────────────────────────────────────
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_platform_settings_admin_read  ON public.platform_settings;
DROP POLICY IF EXISTS p_platform_settings_admin_write ON public.platform_settings;

-- Read: admin only. Internal vendor config; tenants don't query this.
CREATE POLICY p_platform_settings_admin_read
  ON public.platform_settings
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_platform_admin()));

-- Write: admin only. Recursion-safe via SECURITY DEFINER function.
CREATE POLICY p_platform_settings_admin_write
  ON public.platform_settings
  FOR ALL
  TO authenticated
  USING ((SELECT public.is_platform_admin()))
  WITH CHECK ((SELECT public.is_platform_admin()));

-- ───── 3. updated_at trigger ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_platform_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_platform_settings_updated_at
  ON public.platform_settings;

CREATE TRIGGER trg_platform_settings_updated_at
  BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_platform_settings_updated_at();

-- ───── 4. Seed initial key ───────────────────────────────────────────
-- Empty value per spec; admin fills it from the UI post-deploy.
-- ON CONFLICT DO NOTHING is idempotent — re-running this migration
-- in an env where admin already set the value will NOT clobber it.
INSERT INTO public.platform_settings (key, value)
VALUES ('support_phone', '')
ON CONFLICT (key) DO NOTHING;

-- ───── Verification queries (run AFTER apply) ────────────────────────
-- 1) Table exists with right columns:
--    \d+ public.platform_settings
--
-- 2) RLS enabled:
--    SELECT rowsecurity FROM pg_tables
--    WHERE schemaname='public' AND tablename='platform_settings';
--    Expected: true
--
-- 3) Policies in place (should return exactly 2 rows):
--    SELECT polname, cmd, roles, qual, with_check
--    FROM pg_policy
--    WHERE polrelid='public.platform_settings'::regclass;
--    Expected:
--      p_platform_settings_admin_read  | SELECT | {authenticated} | (SELECT is_platform_admin()) | NULL
--      p_platform_settings_admin_write | ALL    | {authenticated} | (SELECT is_platform_admin()) | (SELECT is_platform_admin())
--
-- 4) Trigger present:
--    SELECT tgname FROM pg_trigger
--    WHERE tgrelid='public.platform_settings'::regclass
--      AND NOT tgisinternal;
--    Expected: trg_platform_settings_updated_at
--
-- 5) Seed row present:
--    SELECT key, value, updated_at FROM public.platform_settings;
--    Expected: 1 row, key='support_phone', value='' (empty string)
--
-- 6) Smoke test — non-admin user (open a tenant session, run):
--    SELECT * FROM public.platform_settings;
--    Expected: 0 rows (RLS denies — admin-only read)
