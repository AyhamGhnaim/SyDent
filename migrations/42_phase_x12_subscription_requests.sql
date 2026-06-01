-- ⚠️⚠️⚠️ APPLY IN ORDER — run sections top-to-bottom in Supabase SQL editor.
-- Migration 42 — Phase X12 — Tenant self-service upgrade/renew requests
-- Date: 01 June 2026
--
-- Purpose: Give the TENANT (clinic owner) a way to initiate an upgrade or
-- renewal from inside the app (subscription.html). Since no automated card
-- gateway is available in the target market, payment stays out-of-band
-- (شام كاش / حوالة داخلية / كرت بنك / كاش). The flow is:
--
--   tenant picks plan + payment method  →  INSERT subscription_requests (pending)
--   admin sees the queue in admin.html  →  confirms payment received off-band
--   admin clicks "موافقة وتفعيل"          →  transitionAccount('convert_plan', ...)
--                                            (the EXISTING upgrade machinery —
--                                             writes trial_requests + logs the
--                                             immutable subscription_events row)
--   admin marks the request 'approved'  →  done.
--
-- Industry parallel: Microsoft Partner Center "pay by invoice" + the manual
-- bank-transfer model common to markets without card processors. The request
-- row is a QUEUE/MESSAGE, NOT a financial record — the financial truth stays
-- in subscription_events (written only on admin approval). We deliberately do
-- NOT touch subscription_events.event_type here; 'convert_plan' (Migration 39)
-- already covers every plan code.
--
-- This migration is idempotent (IF NOT EXISTS + DROP POLICY IF EXISTS +
-- ON CONFLICT DO NOTHING) and safe to re-run.

-- ════════════════════════════════════════════════════════════════════════
-- SECTION 0 — DIAGNOSTIC (Rule #76: confirm undocumented production state
-- BEFORE changing policies). Run this FIRST, read the output, THEN run the
-- rest. It tells you what read policies already exist on platform_settings
-- (Migration 34 was applied directly to Supabase and is NOT in the repo, so
-- we must not assume its exact shape).
-- ════════════════════════════════════════════════════════════════════════
--   SELECT polname, cmd, roles,
--          pg_get_expr(polqual, polrelid)      AS using_expr,
--          pg_get_expr(polwithcheck, polrelid) AS check_expr
--   FROM pg_policy
--   WHERE polrelid = 'public.platform_settings'::regclass
--   ORDER BY polname;
--
-- Expected to ALREADY include (from Migrations 33 + 34):
--   p_platform_settings_admin_read   (admin only)
--   p_platform_settings_admin_write  (admin only)
--   <some Migration-34 policy that opens SELECT of the support_phone row to
--    authenticated tenants — name may vary>
--
-- The SECTION 3 policy below adds payment_instructions_ar to the tenant-
-- readable whitelist. Multiple PERMISSIVE SELECT policies are OR'd, so this
-- only WIDENS read for the whitelisted keys; it never narrows existing access.


-- ════════════════════════════════════════════════════════════════════════
-- SECTION 1 — subscription_requests table
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.subscription_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trial_request_id  UUID REFERENCES public.trial_requests(id) ON DELETE SET NULL,
  request_kind      TEXT NOT NULL CHECK (request_kind IN ('upgrade','renew')),
  requested_plan    TEXT NOT NULL,                          -- plan code (validated app-side against subscription_plans)
  current_plan      TEXT,                                   -- snapshot of tenant's plan at request time
  payment_method    TEXT NOT NULL CHECK (payment_method IN ('sham_cash','transfer','bank_card','cash')),
  note              TEXT,                                   -- optional message from tenant
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','approved','rejected','cancelled')),
  admin_note        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at       TIMESTAMPTZ,
  resolved_by       TEXT
);

-- One ACTIVE (pending) request per tenant — prevents duplicate-submit spam.
-- Partial unique index: only 'pending' rows are constrained; a tenant can
-- have many historical approved/rejected/cancelled rows.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sub_requests_one_pending
  ON public.subscription_requests (user_id)
  WHERE status = 'pending';

-- Admin queue ordering.
CREATE INDEX IF NOT EXISTS idx_sub_requests_status_created
  ON public.subscription_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sub_requests_user
  ON public.subscription_requests (user_id);


-- ════════════════════════════════════════════════════════════════════════
-- SECTION 2 — RLS on subscription_requests
--   tenant : INSERT own  + SELECT own  + UPDATE own (cancel only, app-enforced)
--   admin  : SELECT all  + UPDATE all  (approve / reject) via is_platform_admin()
-- Note: a tenant flipping their own row's status does NOTHING to their actual
-- subscription — plan changes live in trial_requests (admin-only write) and
-- only happen when the admin runs transitionAccount. The request row is just
-- a message, so tenant self-update is harmless.
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE public.subscription_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_sub_requests_tenant_insert ON public.subscription_requests;
DROP POLICY IF EXISTS p_sub_requests_tenant_select ON public.subscription_requests;
DROP POLICY IF EXISTS p_sub_requests_tenant_update ON public.subscription_requests;
DROP POLICY IF EXISTS p_sub_requests_admin_select  ON public.subscription_requests;
DROP POLICY IF EXISTS p_sub_requests_admin_update  ON public.subscription_requests;

CREATE POLICY p_sub_requests_tenant_insert
  ON public.subscription_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY p_sub_requests_tenant_select
  ON public.subscription_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY p_sub_requests_tenant_update
  ON public.subscription_requests
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY p_sub_requests_admin_select
  ON public.subscription_requests
  FOR SELECT TO authenticated
  USING ((SELECT public.is_platform_admin()));

CREATE POLICY p_sub_requests_admin_update
  ON public.subscription_requests
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_platform_admin()))
  WITH CHECK ((SELECT public.is_platform_admin()));


-- ════════════════════════════════════════════════════════════════════════
-- SECTION 3 — payment instructions in platform_settings (tenant-readable)
-- Reuses the existing Migration 33 table. Adds a tenant-read policy scoped to
-- a whitelist of "tenant-visible" keys (support_phone for the WhatsApp link +
-- payment_instructions_ar for the on-page instructions). support_phone is in
-- the list defensively in case Migration 34's policy is named/scoped
-- differently; OR-ing is harmless.
-- ════════════════════════════════════════════════════════════════════════
INSERT INTO public.platform_settings (key, value)
VALUES (
  'payment_instructions_ar',
  E'لإتمام الدفع، اختر إحدى الطرق التالية ثم تواصل معنا عبر واتساب لتأكيد التفعيل:\n\n'
  || E'• شام كاش: [أدخل رقم/معرّف المحفظة]\n'
  || E'• حوالة داخلية: [اسم المستلم + الفرع]\n'
  || E'• كرت بنك: [رقم الحساب / IBAN]\n'
  || E'• كاش: في مقر الشركة\n\n'
  || E'بعد التحويل، أرفق إشعار الدفع في رسالة الواتساب.'
)
ON CONFLICT (key) DO NOTHING;

DROP POLICY IF EXISTS p_platform_settings_tenant_read ON public.platform_settings;

CREATE POLICY p_platform_settings_tenant_read
  ON public.platform_settings
  FOR SELECT TO authenticated
  USING (key IN ('support_phone', 'payment_instructions_ar'));


-- ════════════════════════════════════════════════════════════════════════
-- VERIFICATION (run AFTER apply)
-- ════════════════════════════════════════════════════════════════════════
-- 1) Table + constraints:
--    \d+ public.subscription_requests
--
-- 2) Partial unique index present:
--    SELECT indexname FROM pg_indexes
--    WHERE tablename = 'subscription_requests';
--    Expected: uq_sub_requests_one_pending, idx_sub_requests_status_created,
--              idx_sub_requests_user (+ pkey)
--
-- 3) RLS policies (expect 5 on subscription_requests):
--    SELECT polname, cmd FROM pg_policy
--    WHERE polrelid = 'public.subscription_requests'::regclass ORDER BY polname;
--
-- 4) platform_settings now has the seed + the tenant-read policy:
--    SELECT key FROM public.platform_settings WHERE key = 'payment_instructions_ar';
--    SELECT polname FROM pg_policy
--    WHERE polrelid = 'public.platform_settings'::regclass
--      AND polname = 'p_platform_settings_tenant_read';
--
-- 5) Smoke test — open a TENANT session and run:
--    SELECT key, value FROM public.platform_settings;
--    Expected: 2 rows ONLY (support_phone + payment_instructions_ar),
--    never the other admin-only keys.
