-- ============================================================================
-- Migration 47 — subscription_payments (platform-level cash ledger)  ⭐ v73
-- Applied to production: ✅ (Phase A, commit 75cfa56)
-- ============================================================================
-- ⚠️ PROVENANCE NOTICE — READ BEFORE TRUSTING THIS FILE
--   This file was RECONSTRUCTED from the context documentation (v73) on
--   07 Jun 2026, to restore repo completeness. The COLUMN definitions are
--   verbatim from the documented schema, but the INDEX names, RLS policy
--   bodies, and the conditional FK block were summarized as `--` comments in
--   the source doc and are reconstructed here to the project's standard
--   patterns. They are functionally equivalent to production but may not be
--   byte-identical to the exact DDL that was applied via the SQL Editor.
--   The LIVE DATABASE is authoritative. To get the exact current shape, run
--   `migrations/_rls_audit_unified.sql` (policies) +
--   `\d+ public.subscription_payments` (columns/indexes/constraints).
--   See migrations/README.md.
-- ============================================================================
-- Purpose: a cash-received ledger at the PLATFORM level (not tenant clinical
-- payments). Answers "when did this clinic actually pay, how much, and how?"
-- which the price_paid snapshot + subscription_events stream could not.
--
-- Core principle (Golden Rule #121): recording a payment is SEPARATE from a
-- lifecycle transition. Transitions stay in transitionAccount (the atomic
-- choke point); a payment row is LINKED to a lifecycle event (event_id) for
-- tracing, never a trigger for one. Deletion is forbidden — soft-void only
-- (voided_at/by/reason), extending Migration 25's immutable-audit philosophy.
-- ============================================================================

-- ───── 1. Table (columns verbatim from documented schema) ─────────────────
CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_user_id uuid NOT NULL,                 -- auth.users.id of the paying clinic (ledger key)
  doctor_id      uuid,                           -- denormalized owner (optional; left NULL — avoid wrong assumption)
  amount         bigint NOT NULL CHECK (amount > 0),  -- SYP integer (matches pricing model)
  currency       text NOT NULL DEFAULT 'SYP',
  method         text NOT NULL,                  -- CHECK added/normalized in Migration 47.1
  reference      text,                           -- transfer/receipt reference (optional)
  paid_at        date NOT NULL DEFAULT CURRENT_DATE,
  plan_code      text,                           -- snapshot: the paid tier
  billing_cycle  text CHECK (billing_cycle IS NULL OR billing_cycle IN ('monthly','yearly')),
  covers_from    date,
  covers_to      date,                           -- period (computed JS: covers_from + CYCLE_DAYS[cycle])
  event_id       uuid,                           -- FK→subscription_events(id) ON DELETE SET NULL (added below, conditional)
  note           text,
  recorded_by    text,                           -- admin email (audit)
  created_at     timestamptz NOT NULL DEFAULT now(),
  voided_at      timestamptz,
  voided_by      text,
  void_reason    text                            -- soft-void (no hard-delete)
);

-- ───── 2. Conditional FK: event_id → subscription_events(id) ───────────────
-- ON DELETE SET NULL so a deleted event never cascades away a cash record.
-- Conditional: only add if subscription_events exists and the FK is absent.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='subscription_events')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint
                     WHERE conname='subscription_payments_event_id_fkey') THEN
    ALTER TABLE public.subscription_payments
      ADD CONSTRAINT subscription_payments_event_id_fkey
      FOREIGN KEY (event_id) REFERENCES public.subscription_events(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ───── 3. Indexes ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_subpay_tenant  ON public.subscription_payments (tenant_user_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_subpay_paid_at ON public.subscription_payments (paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_subpay_event   ON public.subscription_payments (event_id);

-- ───── 4. RLS ─────────────────────────────────────────────────────────────
-- admin: full access via is_platform_admin() (recursion-safe SECURITY DEFINER).
-- tenant: read OWN payments only (tenant_user_id = auth.uid()).
-- NOTE: window.sb in admin.html is the publishable-key client (NOT service
-- key), so admin insert/select pass through the admin RLS path — same as
-- logSubscriptionEvent.
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subpay_admin_all   ON public.subscription_payments;
CREATE POLICY subpay_admin_all
  ON public.subscription_payments
  FOR ALL
  TO authenticated
  USING ((SELECT public.is_platform_admin()))
  WITH CHECK ((SELECT public.is_platform_admin()));

DROP POLICY IF EXISTS subpay_tenant_read ON public.subscription_payments;
CREATE POLICY subpay_tenant_read
  ON public.subscription_payments
  FOR SELECT
  TO authenticated
  USING (tenant_user_id = auth.uid());

-- ───── Verification ───────────────────────────────────────────────────────
-- SELECT policyname, cmd, roles, qual, with_check FROM pg_policies
-- WHERE schemaname='public' AND tablename='subscription_payments' ORDER BY cmd;
--   Expected: subpay_admin_all (ALL, is_platform_admin) + subpay_tenant_read (SELECT, tenant_user_id=auth.uid())
