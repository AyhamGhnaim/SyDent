-- Migration 57 — WhatsApp recall + birthday message templates (P6)
-- ============================================================
-- ADDITIVE + idempotent: عمودان nullable على صف clinic_settings العريض.
-- الصفوف القديمة → NULL، والكود يستخدم القالب الافتراضي تلقائياً عند NULL/فراغ.
-- 🔒 معزول عن المالية تماماً.
--
-- ملاحظة: لو الرقم 57 محجوز عندك بالـDB لميزة أخرى (مثلاً المفضّلة طُبّقت inline)،
--   بدّل التسمية فقط؛ الـSQL idempotent (IF NOT EXISTS) فلن يتعارض.
-- ============================================================

ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS whatsapp_recall_template   TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_birthday_template TEXT;

-- ── تحقّق ──
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='clinic_settings'
--       AND column_name IN ('whatsapp_recall_template','whatsapp_birthday_template');

-- ── ROLLBACK ──
-- ALTER TABLE public.clinic_settings
--   DROP COLUMN IF EXISTS whatsapp_recall_template,
--   DROP COLUMN IF EXISTS whatsapp_birthday_template;
