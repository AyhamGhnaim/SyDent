-- ============================================================================
-- Migration 48 — platform_settings_audit (append-only settings change log) ⭐ v74
-- Applied to production: ✅ (commit 4f63723)
-- ============================================================================
-- ⚠️ PROVENANCE NOTICE — READ BEFORE TRUSTING THIS FILE
--   RECONSTRUCTED from context documentation (v74) on 07 Jun 2026 for repo
--   completeness. COLUMN definitions are verbatim from the documented schema;
--   INDEX names and RLS policy bodies were summarized as `--` comments in the
--   source doc and are reconstructed here to the project's standard patterns.
--   Functionally equivalent to production, possibly not byte-identical.
--   The LIVE DATABASE is authoritative. Verify with:
--     SELECT policyname, cmd FROM pg_policies
--     WHERE schemaname='public' AND tablename='platform_settings_audit';
--   (Confirmed live on 07 Jun 2026: psa_admin_insert (INSERT) + psa_admin_read
--    (SELECT) only — no UPDATE/DELETE → true append-only.)
--   See migrations/README.md.
-- ============================================================================
-- Purpose: closes the gap where platform_settings kept only updated_by (the
-- last editor) with no change history. This append-only table records every
-- settings change (key, old → new, who, when). Admin email/password are NOT
-- logged here (they go through Supabase Auth, not platform_settings).
--
-- Append-only is enforced at the RLS layer (Golden Rule #131): INSERT + SELECT
-- policies only, no UPDATE/DELETE → the log is tamper-evident even to admins.
-- ============================================================================

-- ───── 1. Table (columns verbatim from documented schema) ─────────────────
CREATE TABLE IF NOT EXISTS public.platform_settings_audit (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text NOT NULL,
  old_value   text,
  new_value   text,
  changed_by  text,                         -- admin email
  changed_at  timestamptz NOT NULL DEFAULT now()
);

-- ───── 2. Indexes ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_psa_changed_at ON public.platform_settings_audit (changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_psa_key        ON public.platform_settings_audit (setting_key, changed_at DESC);

-- ───── 3. RLS (append-only: INSERT + SELECT only, NO UPDATE/DELETE) ────────
ALTER TABLE public.platform_settings_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS psa_admin_read   ON public.platform_settings_audit;
CREATE POLICY psa_admin_read
  ON public.platform_settings_audit
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_platform_admin()));

DROP POLICY IF EXISTS psa_admin_insert ON public.platform_settings_audit;
CREATE POLICY psa_admin_insert
  ON public.platform_settings_audit
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.is_platform_admin()));

-- Intentionally NO UPDATE and NO DELETE policy → RLS denies both → immutable.

-- ───── Verification ───────────────────────────────────────────────────────
-- SELECT policyname, cmd FROM pg_policies
-- WHERE schemaname='public' AND tablename='platform_settings_audit' ORDER BY cmd;
--   Expected exactly 2 rows: psa_admin_insert (INSERT) + psa_admin_read (SELECT).
