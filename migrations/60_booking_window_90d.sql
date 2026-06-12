-- ═══════════════════════════════════════════════════════════════
-- Migration 60 — Booking window ceiling: 35 → 90 days
-- ─────────────────────────────────────────────────────────────
-- WHY: clinics can configure أقصى مدى للحجز, but booking_busy_slots
-- hard-rejected ranges > 35 days, so book.html clamped the visible
-- window to 35 regardless of the setting (reported live 12 Jun 2026:
-- setting=90 → portal stopped at today+35 = 17 Jul).
-- Mirrored client-side the same day:
--   · book.html   — buildDays() + loadBusy() clamp 35 → 90
--   · settings.html — bkMaxDays input max + save clamp 35 → 90
-- booking_clinic_info returns the stored value unclamped and
-- booking_create_request validates against the stored value, so
-- neither needs changes.
-- Idempotent: CREATE OR REPLACE only — no schema changes.
-- Still range-capped (90) on an anon endpoint returning zero PII
-- (date, time, duration tuples only).
-- ═══════════════════════════════════════════════════════════════

-- RPC #2 — busy slots (body identical to Migration 59 except the cap)
CREATE OR REPLACE FUNCTION public.booking_busy_slots(p_clinic UUID, p_from DATE, p_to DATE)
RETURNS TABLE (d DATE, t TIME, dur INTEGER)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.booking_clinic_info(p_clinic)) THEN RETURN; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR (p_to - p_from) > 90 THEN RETURN; END IF;

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
