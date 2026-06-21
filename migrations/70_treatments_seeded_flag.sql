-- Migration 70 — one-time default-treatments auto-seed flag
--
-- Purpose
--   A brand-new clinic used to open the «العلاجات» page to an EMPTY list and
--   had to click «استعادة الافتراضي» before any treatment appeared. We now
--   auto-seed the default + ready-made catalogue the first time the owner opens
--   that page on an empty account, so the dentist sees a ready guide (all prices
--   = 0, correct «يطبّق على» surfaces) without any manual step.
--
--   This column makes that auto-seed fire EXACTLY ONCE per clinic: a dentist who
--   later deletes every treatment on purpose is NOT re-seeded on the next visit.
--
-- Shape
--   • Additive, idempotent (ADD COLUMN IF NOT EXISTS), NOT NULL DEFAULT false.
--   • Existing single-row inserts/upserts to clinic_settings (onboarding seed in
--     supabase-init.js, the settings.html upsert) omit this column → the DEFAULT
--     applies; none of them is a bulk array, so Rule #163 (NULL-not-DEFAULT on
--     bulk insert) does not bite here.
--
-- RLS
--   No policy change. The clinic owner already reads + writes their own
--   clinic_settings row (same path the WhatsApp-reminder settings use), which is
--   all the client needs: it reads treatments_seeded and flips it to true.
--
-- Deploy order
--   Safe before OR after the matching treatments.html deploy. The client reads
--   the flag through a guard: if the column is absent (this migration not yet
--   run) the SELECT errors and auto-seed simply does nothing — the manual
--   «استعادة الافتراضي» button keeps working exactly as before.

-- ───── 1. The flag ───────────────────────────────────────────────────────────
ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS treatments_seeded boolean NOT NULL DEFAULT false;

-- ───── 2. Back-fill: clinics that already have treatments are "already seeded" ──
--   So that an existing clinic which later clears its list is never auto-seeded.
--   (clinic_settings.owner_id is the clinic owner; treatments.doctor_id holds the
--   owner id for that clinic's catalogue.)
UPDATE public.clinic_settings cs
   SET treatments_seeded = true
 WHERE cs.treatments_seeded = false
   AND EXISTS (
     SELECT 1 FROM public.treatments t WHERE t.doctor_id = cs.owner_id
   );

-- ───── Verification ────────────────────────────────────────────────────────────
-- 1) Column exists:
--    SELECT column_name, data_type, is_nullable, column_default
--      FROM information_schema.columns
--     WHERE table_schema='public' AND table_name='clinic_settings'
--       AND column_name='treatments_seeded';
--    → treatments_seeded | boolean | NO | false
--
-- 2) Back-fill applied (clinics with treatments are flagged):
--    SELECT cs.owner_id, cs.treatments_seeded,
--           (SELECT count(*) FROM public.treatments t WHERE t.doctor_id = cs.owner_id) AS n_treatments
--      FROM public.clinic_settings cs;
--    → every row with n_treatments > 0 must show treatments_seeded = true
