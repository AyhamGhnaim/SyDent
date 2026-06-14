-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ Migration 64 — Atomic patient payment-splits reallocation               ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- PROBLEM
--   The client rebuilt a patient's payment_splits with two separate round-trips:
--     1) DELETE all of the patient's splits
--     2) INSERT the freshly-computed FIFO set
--   If the INSERT failed permanently (network drop / tab closed / crash) AFTER
--   the DELETE had committed, the patient was briefly left with ZERO splits. The
--   balance display then fell back to legacy behaviour ("all paid = allocated"),
--   losing the unearned-credit distinction until the next successful rebuild.
--   This is a durability gap, not a correctness bug — but a real one.
--
-- FIX
--   Do the DELETE + INSERT inside ONE function body (a single transaction). Either
--   the whole swap commits or none of it does. The client computes the splits
--   (FIFO, integer/BIGINT math) and passes them as a JSONB array; this function
--   swaps them atomically and RETURNS the new rows (so the client can refresh its
--   in-memory cache without a second round-trip).
--
--   The client keeps a graceful fallback to the old non-atomic DELETE→INSERT for
--   when this function is absent, so client / migration deploy order does NOT
--   matter — the page works either way.
--
-- SECURITY  (Rule #42 — SECURITY DEFINER must SET search_path)
--   Owner = auth.uid(). doctor_id is FORCED to auth.uid() on every inserted row,
--   and the patient must belong to the caller, so a caller can only ever rewrite
--   their OWN patient's splits — no cross-tenant write is possible. An anonymous
--   caller (auth.uid() IS NULL) is rejected outright.
--
-- IDEMPOTENT: CREATE OR REPLACE — safe to run more than once.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.realloc_patient_splits(
  p_patient_id uuid,
  p_splits     jsonb DEFAULT '[]'::jsonb
)
RETURNS SETOF public.payment_splits
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid := auth.uid();
BEGIN
  -- Reject unauthenticated callers (SECURITY DEFINER would otherwise run as owner).
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  -- Ownership guard: the patient must belong to the caller. Prevents inserting
  -- splits that reference another clinic's patient.
  IF NOT EXISTS (
    SELECT 1 FROM public.patients
    WHERE id = p_patient_id AND doctor_id = v_owner
  ) THEN
    RAISE EXCEPTION 'patient_not_owned' USING ERRCODE = '42501';
  END IF;

  -- ── Atomic swap (this whole function body = one transaction) ──
  -- a) Clear the patient's current splits (scoped to the caller).
  DELETE FROM public.payment_splits
  WHERE patient_id = p_patient_id
    AND doctor_id  = v_owner;

  -- b) Insert the rebuilt set. doctor_id + patient_id are forced server-side;
  --    the rest is read from the JSONB the client computed. Empty string / JSON
  --    null session_id / provider_id / payment_date → SQL NULL. Rows with no
  --    payment_id are skipped defensively (the FK would reject them anyway).
  --    payment_date is carried through to match buildFifoSplits / saveManualSplits
  --    (the legacy path preserved it; it must not be dropped on reallocation).
  RETURN QUERY
  INSERT INTO public.payment_splits
    (doctor_id, patient_id, payment_id, session_id, provider_id, amount, is_unearned, payment_date)
  SELECT
    v_owner,
    p_patient_id,
    (s->>'payment_id')::uuid,
    NULLIF(s->>'session_id',   '')::uuid,
    NULLIF(s->>'provider_id',  '')::uuid,
    COALESCE((s->>'amount')::bigint, 0),
    COALESCE((s->>'is_unearned')::boolean, false),
    NULLIF(s->>'payment_date', '')::date
  FROM jsonb_array_elements(COALESCE(p_splits, '[]'::jsonb)) AS s
  WHERE (s->>'payment_id') IS NOT NULL
  RETURNING *;
END;
$$;

-- Authenticated tenants only. (No anon grant — unlike the booking RPCs, this is
-- a logged-in clinic action.) The internal auth.uid() guard is the real gate.
GRANT EXECUTE ON FUNCTION public.realloc_patient_splits(uuid, jsonb) TO authenticated;
