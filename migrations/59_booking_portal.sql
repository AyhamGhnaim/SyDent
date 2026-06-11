-- ════════════════════════════════════════════════════════════════════
-- Migration 59 — P5: Online Booking Portal (بوابة الحجز الإلكتروني)
-- Date: 11 June 2026 | Idempotent: yes | Applied manually via SQL Editor
--
-- Architecture (security model):
--   • booking_requests is RLS deny-all for anon (NO anon policies at all).
--   • The ONLY anonymous surface = 3 SECURITY DEFINER functions below.
--   • booking_busy_slots returns (date,time,duration) ONLY — zero PII.
--   • All validation (working hours, rate limits, conflicts) lives in the
--     DB so any future client inherits the same protection.
--   • Precedents: M27_2 (anon read on subscription_plans),
--     is_platform_admin (SECURITY DEFINER + SET search_path, Rule #42).
--
-- ROLLBACK (only if reverting the whole feature):
--   DROP FUNCTION IF EXISTS public.booking_create_request(uuid,text,text,date,time,text);
--   DROP FUNCTION IF EXISTS public.booking_busy_slots(uuid,date,date);
--   DROP FUNCTION IF EXISTS public.booking_clinic_info(uuid);
--   DROP TABLE IF EXISTS public.booking_requests;
--   ALTER TABLE public.clinic_settings
--     DROP COLUMN IF EXISTS booking_enabled,
--     DROP COLUMN IF EXISTS booking_slot_minutes,
--     DROP COLUMN IF EXISTS booking_work_days,
--     DROP COLUMN IF EXISTS booking_work_start,
--     DROP COLUMN IF EXISTS booking_work_end,
--     DROP COLUMN IF EXISTS booking_max_days_ahead,
--     DROP COLUMN IF EXISTS booking_note;
-- ════════════════════════════════════════════════════════════════════

-- ── 1) clinic_settings — booking configuration (live-verified: zero collision)
ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS booking_enabled        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS booking_slot_minutes   INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS booking_work_days      TEXT    NOT NULL DEFAULT '0,1,2,3,4,6',
  ADD COLUMN IF NOT EXISTS booking_work_start     TIME    NOT NULL DEFAULT '10:00',
  ADD COLUMN IF NOT EXISTS booking_work_end       TIME    NOT NULL DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS booking_max_days_ahead INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS booking_note           TEXT;
-- booking_work_days: JS getDay() indices CSV (0=الأحد … 6=السبت).
-- Default 'سبت–خميس، الجمعة عطلة' = '0,1,2,3,4,6'.

-- ── 2) booking_requests — anon writes ONLY through the RPC below
CREATE TABLE IF NOT EXISTS public.booking_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id      UUID NOT NULL,                    -- = owner auth.uid
  patient_name   TEXT NOT NULL CHECK (char_length(btrim(patient_name)) BETWEEN 2 AND 80),
  phone          TEXT NOT NULL CHECK (phone ~ '^\+?[0-9]{8,15}$'),
  requested_date DATE NOT NULL,
  requested_time TIME NOT NULL,
  duration       INTEGER NOT NULL DEFAULT 30 CHECK (duration BETWEEN 10 AND 240),
  note           TEXT CHECK (char_length(note) <= 300),
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','confirmed','rejected')),
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at    TIMESTAMPTZ
);

-- Final race guard: one PENDING request per exact slot per clinic.
CREATE UNIQUE INDEX IF NOT EXISTS uq_booking_pending_slot
  ON public.booking_requests (clinic_id, requested_date, requested_time)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_booking_clinic_status
  ON public.booking_requests (clinic_id, status, requested_date, requested_time);

-- RLS: owner ALL only. NO anon policy at all → anon's sole door = the RPCs.
ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "booking_owner_all" ON public.booking_requests;
CREATE POLICY "booking_owner_all" ON public.booking_requests
  FOR ALL USING (clinic_id = auth.uid()) WITH CHECK (clinic_id = auth.uid());

-- ── 3) RPC #1 — public clinic info (empty result = booking unavailable)
CREATE OR REPLACE FUNCTION public.booking_clinic_info(p_clinic UUID)
RETURNS TABLE (
  clinic_name TEXT, clinic_phone TEXT, slot_minutes INTEGER,
  work_days TEXT, work_start TIME, work_end TIME,
  max_days_ahead INTEGER, booking_note TEXT
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $$
DECLARE v_status TEXT;
BEGIN
  -- account gate: mirrors ensureAccountAccessible (fail-open on missing row)
  SELECT tr.status INTO v_status FROM public.trial_requests tr
  WHERE tr.user_id = p_clinic LIMIT 1;
  IF v_status IN ('new','rejected','suspended') THEN RETURN; END IF;

  RETURN QUERY
  SELECT cs.clinic_name, cs.clinic_phone, cs.booking_slot_minutes,
         cs.booking_work_days, cs.booking_work_start, cs.booking_work_end,
         cs.booking_max_days_ahead, cs.booking_note
  FROM public.clinic_settings cs
  WHERE cs.owner_id = p_clinic
    AND cs.booking_enabled = true
    -- Δ5 hardening: insane slot config (e.g. 0 → division by zero in the
    -- grid check) renders the clinic unavailable rather than erroring.
    AND cs.booking_slot_minutes BETWEEN 10 AND 240;
END; $$;

-- ── 4) RPC #2 — busy slots: (date,time,duration) ONLY. Zero PII, range-capped.
CREATE OR REPLACE FUNCTION public.booking_busy_slots(p_clinic UUID, p_from DATE, p_to DATE)
RETURNS TABLE (d DATE, t TIME, dur INTEGER)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.booking_clinic_info(p_clinic)) THEN RETURN; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR (p_to - p_from) > 35 THEN RETURN; END IF;

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

-- ── 5) RPC #3 — create request: the ONLY write door for anon
CREATE OR REPLACE FUNCTION public.booking_create_request(
  p_clinic UUID, p_name TEXT, p_phone TEXT,
  p_date DATE, p_time TIME, p_note TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_info    RECORD;
  v_now_dam TIMESTAMP;      -- Damascus local (target market; no DST since 2022)
  v_phone   TEXT;
  v_name    TEXT;
  v_days    INT[];
  v_new_id  UUID;
BEGIN
  -- 1. clinic open for booking? (also enforces slot_minutes sanity — Δ5)
  SELECT * INTO v_info FROM public.booking_clinic_info(p_clinic);
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_disabled'; END IF;

  -- 2. sanitize
  v_name  := btrim(COALESCE(p_name, ''));
  v_phone := regexp_replace(COALESCE(p_phone,''), '[^0-9+]', '', 'g');
  IF char_length(v_name) < 2 OR char_length(v_name) > 80 THEN RAISE EXCEPTION 'bad_name'; END IF;
  IF v_phone !~ '^\+?[0-9]{8,15}$' THEN RAISE EXCEPTION 'bad_phone'; END IF;
  IF p_note IS NOT NULL AND char_length(p_note) > 300 THEN RAISE EXCEPTION 'bad_note'; END IF;
  IF p_date IS NULL OR p_time IS NULL THEN RAISE EXCEPTION 'bad_slot'; END IF;

  -- 3. idempotent re-submit: same phone + same slot pending → return existing id
  SELECT br.id INTO v_new_id FROM public.booking_requests br
  WHERE br.clinic_id = p_clinic AND br.phone = v_phone
    AND br.requested_date = p_date AND br.requested_time = p_time
    AND br.status = 'pending' LIMIT 1;
  IF v_new_id IS NOT NULL THEN RETURN v_new_id; END IF;

  -- 4. date window + not in the past (Damascus time)
  v_now_dam := (now() AT TIME ZONE 'Asia/Damascus');
  IF p_date < v_now_dam::date
     OR p_date > v_now_dam::date + v_info.max_days_ahead THEN
    RAISE EXCEPTION 'date_out_of_range';
  END IF;
  IF p_date = v_now_dam::date AND p_time <= v_now_dam::time THEN
    RAISE EXCEPTION 'past_time';
  END IF;

  -- 5. working day + hours (midnight-wrap-safe) + grid alignment
  v_days := string_to_array(regexp_replace(v_info.work_days, '\s', '', 'g'), ',')::int[];  -- Δ5
  IF NOT (EXTRACT(DOW FROM p_date)::int = ANY (v_days)) THEN
    RAISE EXCEPTION 'closed_day';
  END IF;
  IF p_time < v_info.work_start OR p_time >= v_info.work_end THEN
    RAISE EXCEPTION 'outside_hours';
  END IF;
  IF (v_info.work_end - p_time) < make_interval(mins => v_info.slot_minutes) THEN
    RAISE EXCEPTION 'outside_hours';   -- slot must END within hours (no TIME wrap)
  END IF;
  IF (EXTRACT(EPOCH FROM (p_time - v_info.work_start))::int
      % (v_info.slot_minutes * 60)) <> 0 THEN
    RAISE EXCEPTION 'off_grid';
  END IF;

  -- 6. rate limits (Damascus calendar day; counts ALL statuses → no reject-respam)
  IF (SELECT count(*) FROM public.booking_requests br
      WHERE br.clinic_id = p_clinic AND br.phone = v_phone
        AND (br.created_at AT TIME ZONE 'Asia/Damascus')::date = v_now_dam::date) >= 3 THEN
    RAISE EXCEPTION 'rate_phone';
  END IF;
  IF (SELECT count(*) FROM public.booking_requests br
      WHERE br.clinic_id = p_clinic
        AND (br.created_at AT TIME ZONE 'Asia/Damascus')::date = v_now_dam::date) >= 40 THEN
    RAISE EXCEPTION 'rate_clinic';
  END IF;

  -- 7. overlap vs live appointments (clinic slot length)
  IF EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.doctor_id = p_clinic
      AND a.is_planned IS NOT TRUE
      AND a.date = p_date AND a.time IS NOT NULL
      AND a.status NOT IN ('cancelled','broken','no_show')
      AND a.time < p_time + make_interval(mins => v_info.slot_minutes)
      AND p_time < a.time + make_interval(mins => COALESCE(a.duration, 30))
  ) THEN RAISE EXCEPTION 'slot_taken'; END IF;

  -- 8. overlap vs other pending requests
  IF EXISTS (
    SELECT 1 FROM public.booking_requests br
    WHERE br.clinic_id = p_clinic AND br.status = 'pending'
      AND br.requested_date = p_date
      AND br.requested_time < p_time + make_interval(mins => v_info.slot_minutes)
      AND p_time < br.requested_time + make_interval(mins => br.duration)
  ) THEN RAISE EXCEPTION 'slot_taken'; END IF;

  -- 9. insert (partial UNIQUE index = final race guard)
  BEGIN
    INSERT INTO public.booking_requests
      (clinic_id, patient_name, phone, requested_date, requested_time, duration, note)
    VALUES
      (p_clinic, v_name, v_phone, p_date, p_time, v_info.slot_minutes,
       NULLIF(btrim(COALESCE(p_note,'')), ''))
    RETURNING id INTO v_new_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'slot_taken';
  END;

  RETURN v_new_id;
END; $$;

-- ── 6) Permissions: RPCs are the only anon surface
REVOKE ALL ON FUNCTION public.booking_clinic_info(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.booking_busy_slots(uuid,date,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.booking_create_request(uuid,text,text,date,time,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.booking_clinic_info(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.booking_busy_slots(uuid,date,date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.booking_create_request(uuid,text,text,date,time,text) TO anon, authenticated;

-- ── Verification (run after applying) ──
-- SELECT 'fn' src, proname info, prosecdef::text extra
-- FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
-- WHERE n.nspname='public' AND proname LIKE 'booking%'
-- UNION ALL
-- SELECT 'policy', policyname, cmd || ' ' || roles::text
-- FROM pg_policies WHERE tablename='booking_requests'
-- UNION ALL
-- SELECT 'col', column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name='clinic_settings' AND column_name LIKE 'booking%';
-- Expected: 3 functions (prosecdef=true) + 1 policy (ALL) + 7 booking_* columns
