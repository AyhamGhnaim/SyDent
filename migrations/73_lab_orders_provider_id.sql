-- ============================================================================
-- Migration 73 — lab_orders.provider_id (explicit treating-provider attribution)
-- ============================================================================
-- WHY:
--   lab_orders never stored the treating provider. provider-reports.html and
--   accounting.html INFERRED it at render time by matching each lab to a session
--   (same patient + same tooth + ±90 days of session.date). That inference is
--   anchored to the date-filtered `sessions` array, so when the real provider's
--   session falls OUTSIDE the filter window, the lab's cost silently jumps to
--   whichever other provider (usually the owner, who has the most sessions) has
--   a session on the same patient/tooth inside the window. Result: wrong per-
--   provider lab cost / net, and wrong payout when basis = "net (after lab)".
--
-- FIX (matches OpenDental labcase.ProvNum — provider stored explicitly on the lab):
--   Store provider_id directly on lab_orders, populated from the linked
--   appointment at write time. Reports then read it directly — deterministic,
--   window-independent. Labs with no provider land in an "unassigned" bucket
--   instead of being mis-attributed to the owner.
--
-- SAFETY (verified against Accounting Reference v1.2 + live code):
--   - Clinic-level accounting is UNAFFECTED. netProfit / totalExpenses depend on
--     labsTotal (the AGGREGATE), which does not change — only the per-provider
--     SPLIT of that total changes. Identity Tests A–D untouched; Test E
--     (Σ per-provider lab ≤ labsTotal) stays satisfied and actually tightens
--     toward equality once the unassigned bucket is added.
--   - Column is nullable; ON DELETE SET NULL mirrors ledger_sessions.provider_id
--     and clinic_doctors FKs (Migrations 45/51). No RLS change.
--
-- IDEMPOTENT: safe to re-run. Backfill only touches rows where provider_id IS NULL.
-- ============================================================================

BEGIN;

-- 1) Column ---------------------------------------------------------------
ALTER TABLE public.lab_orders
  ADD COLUMN IF NOT EXISTS provider_id UUID
  REFERENCES public.clinic_doctors(id) ON DELETE SET NULL;

-- 2) Index (reports filter by provider_id + date_sent) --------------------
CREATE INDEX IF NOT EXISTS idx_lab_orders_provider_id
  ON public.lab_orders (provider_id);

-- 3) Backfill — copy provider from the linked appointment -----------------
--    Reliable: appointment_id is a hard FK; appointments.provider_id is the
--    treating provider chosen for that visit. Only fills NULLs; only when the
--    appointment actually has a provider set. Labs without an appointment (or
--    whose appointment has no provider) remain NULL → "unassigned" bucket.
UPDATE public.lab_orders lo
SET provider_id = a.provider_id
FROM public.appointments a
WHERE lo.appointment_id = a.id
  AND lo.provider_id IS NULL
  AND a.provider_id IS NOT NULL;

COMMIT;

-- ============================================================================
-- 4) VERIFICATION REPORT (read-only — run after the migration, review before
--    relying on it). Tells you how the backfill landed across ALL lab_orders.
-- ============================================================================
SELECT
  COUNT(*)                                            AS total_lab_orders,
  COUNT(provider_id)                                  AS with_provider,
  COUNT(*) FILTER (WHERE provider_id IS NULL)         AS unassigned,
  COUNT(*) FILTER (WHERE appointment_id IS NULL)      AS no_appointment_link,
  COUNT(*) FILTER (WHERE appointment_id IS NOT NULL
                     AND provider_id IS NULL)         AS appt_linked_but_no_provider
FROM public.lab_orders;

-- Per-provider breakdown of total lab cost after backfill (sanity view):
SELECT
  COALESCE(d.name, '— غير مُسند —')                   AS provider,
  COUNT(lo.id)                                        AS lab_count,
  COALESCE(SUM(lo.cost), 0)                           AS total_cost
FROM public.lab_orders lo
LEFT JOIN public.clinic_doctors d ON d.id = lo.provider_id
GROUP BY d.name
ORDER BY total_cost DESC;
