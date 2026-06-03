-- Migration 45 — Account Adjustments (discount / write-off / refund)
-- =========================================================================
-- Closes the biggest accounting gap vs OpenDental / Arabic competitors:
-- the ability to reduce a patient's charge (discount / write-off) or return
-- cash (refund). Cash-basis semantics (parity with SyDent's existing model):
--
--   discount   — courtesy/negotiated reduction of the charge. NOT cash.
--                Reduces net production + reduces what the patient owes.
--   write_off  — uncollectible amount forgiven. NOT cash. Same effect as
--                discount on the books (reduces charge + balance).
--   refund     — cash physically returned to the patient. Reduces collected
--                revenue. At patient level: eats into prepayment/credit first,
--                then (if it exceeds credit) re-opens the balance as owed.
--
-- `amount` is always a POSITIVE magnitude; the sign/direction is implied by
-- `kind`. This mirrors how ledger_payments stores positive amounts and lets
-- the UI validate amount > 0 uniformly.
--
-- Owner column is `doctor_id` to match ledger_sessions / ledger_payments /
-- payment_splits (RLS: doctor_id = auth.uid()). session_id / provider_id are
-- OPTIONAL links (ON DELETE SET NULL keeps the adjustment as an immutable
-- record even if the referenced row is later removed — same pattern as splits).
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.account_adjustments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id  UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('discount','write_off','refund')),
  amount      BIGINT NOT NULL CHECK (amount > 0),
  session_id  UUID REFERENCES public.ledger_sessions(id) ON DELETE SET NULL,
  provider_id UUID REFERENCES public.clinic_doctors(id) ON DELETE SET NULL,
  note        TEXT,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.account_adjustments ENABLE ROW LEVEL SECURITY;

-- Owner-scoped full access (same shape as payment_splits_owner_all).
DROP POLICY IF EXISTS "account_adjustments_owner_all" ON public.account_adjustments;
CREATE POLICY "account_adjustments_owner_all" ON public.account_adjustments
  FOR ALL USING (doctor_id = auth.uid()) WITH CHECK (doctor_id = auth.uid());

-- Indexes for the two hot query paths:
--   patient ledger  → by patient_id
--   clinic accounting → by doctor_id + date range
CREATE INDEX IF NOT EXISTS idx_adjustments_patient
  ON public.account_adjustments(patient_id);
CREATE INDEX IF NOT EXISTS idx_adjustments_owner_date
  ON public.account_adjustments(doctor_id, date);
CREATE INDEX IF NOT EXISTS idx_adjustments_session
  ON public.account_adjustments(session_id);
