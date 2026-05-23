-- Migration 28 — Phase X3 — Notification templates schema
-- Date: 23 May 2026 (Phase X3 محادثة 1)
--
-- Purpose: Admin-editable templates for the WhatsApp messages that
-- the platform sends to tenants (welcome on accept, trial reminders,
-- suspension notice, renewal confirmation). Today these strings live
-- hardcoded in admin.html (waLink + waReminderLink). Phase X3 moves
-- them into a database table so admin can edit copy from the UI
-- without a deploy — same pattern as Phase X2 (Plans Editor).
--
-- Scope: schema + RLS only. Migration 28.1 adds the new event_type;
-- Migration 28.2 seeds 4 default templates with the exact strings
-- that are hardcoded today, so behavior is identical post-deploy.
-- Small sequential migrations follow rule #48.
--
-- RLS notes:
--   - Read: authenticated only. This is NOT a public catalog (unlike
--     subscription_plans which anon CAN read for landing.html pricing).
--     Anon visitors have no business reading internal message templates,
--     so the read policy intentionally omits anon (contrast rule #46).
--   - Write: admin only, via the is_platform_admin() SECURITY DEFINER
--     function created in Migration 26.1 — same recursion-safe pattern
--     used by Migration 27.1 on subscription_plans (rule #42).
--
-- updated_at trigger uses a dedicated function (set_notification_templates_
-- updated_at) following the same per-table pattern as Migration 9.1's
-- set_clinic_employees_updated_at — there is no shared touch_updated_at
-- helper to reuse.
--
-- Apply to Supabase production via SQL editor BEFORE Migration 28.1.

-- ───── 1. Table ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT UNIQUE NOT NULL,
  channel     TEXT NOT NULL DEFAULT 'whatsapp',
  title_ar    TEXT NOT NULL,
  description TEXT,
  body        TEXT NOT NULL,
  variables   JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  SMALLINT NOT NULL DEFAULT 100,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  TEXT,
  CONSTRAINT notification_templates_code_check
    CHECK (code IN ('wa_reminder','wa_welcome','wa_suspended','wa_renewed')),
  CONSTRAINT notification_templates_channel_check
    CHECK (channel IN ('whatsapp','sms','email'))
);

-- ───── 2. Index ──────────────────────────────────────────────────────
-- code is already UNIQUE which auto-creates an index, but we name it
-- explicitly for clarity in pg_indexes.
CREATE INDEX IF NOT EXISTS idx_notif_templates_active_sort
  ON public.notification_templates(is_active, sort_order);

-- ───── 3. RLS ────────────────────────────────────────────────────────
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_notif_templates_read         ON public.notification_templates;
DROP POLICY IF EXISTS p_notif_templates_admin_write  ON public.notification_templates;

-- Read: any authenticated user. Templates are read by admin.html (admin
-- role) when building WhatsApp links. We don't need them readable by anon
-- — landing.html doesn't display these strings.
CREATE POLICY p_notif_templates_read
  ON public.notification_templates
  FOR SELECT
  TO authenticated
  USING (true);

-- Write: admin only, recursion-safe via SECURITY DEFINER function.
CREATE POLICY p_notif_templates_admin_write
  ON public.notification_templates
  FOR ALL
  TO authenticated
  USING ((SELECT public.is_platform_admin()))
  WITH CHECK ((SELECT public.is_platform_admin()));

-- ───── 4. updated_at trigger ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_notification_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notification_templates_updated_at
  ON public.notification_templates;

CREATE TRIGGER trg_notification_templates_updated_at
  BEFORE UPDATE ON public.notification_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_notification_templates_updated_at();

-- ───── Verification queries (run AFTER apply) ────────────────────────
-- 1) Table exists with the right columns:
--    \d+ public.notification_templates
--
-- 2) RLS enabled:
--    SELECT rowsecurity FROM pg_tables
--    WHERE schemaname='public' AND tablename='notification_templates';
--    Expected: true
--
-- 3) Policies in place (should return exactly 2 rows):
--    SELECT polname, cmd, roles, qual, with_check
--    FROM pg_policy
--    WHERE polrelid='public.notification_templates'::regclass;
--    Expected:
--      p_notif_templates_read        | SELECT | {authenticated} | true | NULL
--      p_notif_templates_admin_write | ALL    | {authenticated} | (SELECT is_platform_admin()) | (SELECT is_platform_admin())
--
-- 4) Trigger present:
--    SELECT tgname FROM pg_trigger
--    WHERE tgrelid='public.notification_templates'::regclass
--      AND NOT tgisinternal;
--    Expected: trg_notification_templates_updated_at
