-- Migration 58 — per-patient post-op instruction records (P6, mirrors prescriptions)
-- ============================================================
-- ADDITIVE + idempotent. جدول جديد لكل مريض (post_op_notes) — نظير جدول
-- prescriptions. القوالب المشتركة تبقى في post_op_templates (Migration 56).
-- 🔒 معزول عن المالية تماماً.
--
-- ملاحظة: لو الرقم 58 محجوز عندك، بدّل التسمية فقط؛ الـSQL idempotent.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.post_op_notes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id    UUID NOT NULL,
  body          TEXT NOT NULL DEFAULT '',
  treatment_key TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.post_op_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "post_op_notes_owner_all" ON public.post_op_notes;
CREATE POLICY "post_op_notes_owner_all" ON public.post_op_notes
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_postop_notes_patient
  ON public.post_op_notes(owner_id, patient_id, created_at DESC);

COMMIT;

-- ── تحقّق ──
--   SELECT to_regclass('public.post_op_notes');

-- ── ROLLBACK ──
-- DROP TABLE IF EXISTS public.post_op_notes;
