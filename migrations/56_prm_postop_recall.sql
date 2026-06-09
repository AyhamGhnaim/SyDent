-- Migration 56 — PRM: post-op instruction templates + recall tracking + recall interval (P6)
-- ============================================================
-- ⚠️ خذ snapshot منطقي أولاً (Free tier: لا backup تلقائي). هذا الـmigration
--    ADDITIVE بالكامل + idempotent: جداول جديدة + عمود واحد nullable. صفر تعديل
--    على أي بيانات/جداول موجودة، وكل صف حالي يبقى صالحاً.
--
-- ⚠️ رقم الـmigration: آخر ملف بالمستودع = 55. إذا الرقم 56 محجوز عندك بالـDB الحيّة
--    لميزة أخرى (مثلاً المفضّلة طُبّقت inline بدون ملف) — بدّل التسمية فقط؛ الـSQL نفسه
--    idempotent (IF NOT EXISTS) فلن يتعارض مع أي object موجود مهما كان الرقم.
--
-- 🔒 معزول تماماً عن المالية: لا يمسّ payment_splits / ledger_payments / FIFO /
--    splitIsEarned / اختبارات الهوية A–E إطلاقاً. PRM = طبقة تواصل بحتة.
-- ============================================================

BEGIN;

-- ── 1) قوالب تعليمات بعد الجلسة (نمط prescription_templates) ──
--    body = نص التعليمات. treatment_key = ربط منطقي اختياري بنوع العلاج
--    (TEXT يطابق treatments.treatment_key — وليس UUID FK، حسب Rule #134).
CREATE TABLE IF NOT EXISTS public.post_op_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  body          TEXT NOT NULL DEFAULT '',
  treatment_key TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2) سجل الاستدعاء (Recall log) ──
--    يسجّل متى استُدعي المريض، لمنع تكرار الإزعاج + لإخفاء من استُدعي حديثاً من
--    قائمة العمل خلال فترة تهدئة (cooldown). معزول عن المالية.
CREATE TABLE IF NOT EXISTS public.patient_recalls (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id  UUID NOT NULL,
  recalled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  channel     TEXT NOT NULL DEFAULT 'whatsapp',
  note        TEXT,
  CONSTRAINT patient_recalls_channel_chk CHECK (channel IN ('whatsapp','call','sms','other'))
);

ALTER TABLE public.post_op_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_recalls   ENABLE ROW LEVEL SECURITY;

-- RLS: عزل المستأجر بالمالك (نفس نمط prescriptions/inventory).
DROP POLICY IF EXISTS "post_op_tmpl_owner_all" ON public.post_op_templates;
CREATE POLICY "post_op_tmpl_owner_all" ON public.post_op_templates
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "patient_recalls_owner_all" ON public.patient_recalls;
CREATE POLICY "patient_recalls_owner_all" ON public.patient_recalls
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_postop_owner    ON public.post_op_templates(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recalls_patient ON public.patient_recalls(owner_id, patient_id, recalled_at DESC);

-- ── 3) فترة الاستدعاء الدوري (أشهر) على صف clinic_settings العريض ──
--    الصفوف القديمة → NULL، والكود يفترض 6. الصفوف الجديدة → 6.
ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS recall_interval_months INT DEFAULT 6;

COMMIT;

-- ── تحقّق بعد التشغيل ──
--   SELECT to_regclass('public.post_op_templates'), to_regclass('public.patient_recalls');
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='clinic_settings' AND column_name='recall_interval_months';

-- ── ROLLBACK (آمن — لا بيانات مالية) ──
-- BEGIN;
-- ALTER TABLE public.clinic_settings DROP COLUMN IF EXISTS recall_interval_months;
-- DROP TABLE IF EXISTS public.patient_recalls;
-- DROP TABLE IF EXISTS public.post_op_templates;
-- COMMIT;
