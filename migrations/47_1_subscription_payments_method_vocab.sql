-- ============================================================================
-- Migration 47.1 — subscription_payments.method vocabulary unification  ⭐ v73
-- Applied to production: ✅ (Phase A)
-- ============================================================================
-- The ALTER statements below are VERBATIM from the context documentation.
--
-- Reason: Migration 47 originally wrote the method CHECK with 'bank_transfer',
-- but the existing requests path (subscription_requests.payment_method +
-- SRQ_METHOD_AR) uses 'transfer'. The mismatch would have failed the CHECK on
-- auto-prefill from a request. Fixed here by aligning the vocabulary (Golden
-- Rule #122). The table was empty (0 rows) at the time → drop/recreate of the
-- constraint was safe with no backfill.
--
-- Unified vocabulary (single source across the platform, Rule #66):
--   'sham_cash' | 'transfer' | 'bank_card' | 'cash' | 'other'
-- ============================================================================

ALTER TABLE public.subscription_payments DROP CONSTRAINT IF EXISTS subscription_payments_method_check;
ALTER TABLE public.subscription_payments ADD CONSTRAINT subscription_payments_method_check
  CHECK (method IN ('sham_cash','transfer','bank_card','cash','other'));

-- ───── Verification ───────────────────────────────────────────────────────
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conname='subscription_payments_method_check';
--   Expected: CHECK (method = ANY (ARRAY['sham_cash','transfer','bank_card','cash','other']))
