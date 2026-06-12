-- ═══════════════════════════════════════════════════════════════
-- Migration 60 — Dynamic booking window (doctor-set, absolute cap 365)
-- ─────────────────────────────────────────────────────────────
-- WHY: clinics configure أقصى مدى للحجز freely, but booking_busy_slots
-- hard-rejected ranges > 35 days, so book.html clamped the visible
-- window to 35 regardless of the setting (reported live 12 Jun 2026:
-- setting=90 → portal stopped at today+35 = 17 Jul).
-- v2 of this migration (file rewritten BEFORE first apply — never ran
-- as the interim "fixed 90" draft): the range guard now compares the
-- requested span against the CLINIC'S OWN stored booking_max_days_ahead
-- instead of any hardcoded constant. One absolute ceiling remains —
-- 365 days — because this is an ANON endpoint (abuse/typo guard), not
-- a product limit. Within 1..365 the doctor's number rules, fully
-- dynamic.
-- Mirrored client-side the same day:
--   · book.html   — buildDays() + loadBusy() clamp → 365
--   · settings.html — bkMaxDays input max + save clamp → 365
-- booking_clinic_info returns the stored value unclamped and
-- booking_create_request already validates against the stored value,
-- so neither needs changes.
-- Idempotent: CREATE OR REPLACE only — no schema changes.
-- Payload stays PII-free: (date, time, duration) tuples only;
-- worst case ≈ 365d × ~20 appts ≈ 7.3k rows — acceptable, capped.
-- ═══════════════════════════════════════════════════════════════

-- RPC #2 — busy slots (vs Migration 59: dynamic range guard; the old
-- separate EXISTS availability gate is folded into the SELECT INTO —
-- zero rows from booking_clinic_info ⇒ v_max IS NULL ⇒ RETURN).
CREATE OR REPLACE FUNCTION public.booking_busy_slots(p_clinic UUID, p_from DATE, p_to DATE)
RETURNS TABLE (d DATE, t TIME, dur INTEGER)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $$
DECLARE v_max INTEGER;
BEGIN
  -- availability gate + clinic's own window in one call
  SELECT i.max_days_ahead INTO v_max
  FROM public.booking_clinic_info(p_clinic) i;
  IF v_max IS NULL THEN RETURN; END IF;          -- booking unavailable
  v_max := LEAST(GREATEST(v_max, 1), 365);       -- doctor's number, abs cap 365

  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from
     OR (p_to - p_from) > v_max THEN RETURN; END IF;

  RETURN QUERY
  SELECT a.date, a.time, COALESCE(a.duration, 30)
  FROM public.appointments a
  WHERE a.doctor_id = p_clinic
    AND a.is_planned IS NOT TRUE
    AND a.date BETWEEN p_from AND p_to
    AND a.time IS NOT NULL
    -- negative filter: any FUTURE status added later blocks slots by default
    AND a.status NOT IN ('cancelled','broken','no_show')
  UNION ALL
  SELECT br.requested_date, br.requested_time, br.duration
  FROM public.booking_requests br
  WHERE br.clinic_id = p_clinic AND br.status = 'pending'
    AND br.requested_date BETWEEN p_from AND p_to;
END; $$;

-- CREATE OR REPLACE preserves the function ACL, but re-assert anyway
-- (belt-and-suspenders; idempotent — matches Migration 59 grants).
REVOKE ALL ON FUNCTION public.booking_busy_slots(uuid,date,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.booking_busy_slots(uuid,date,date) TO anon, authenticated;
