-- Migration 57b — Treatment favorites flag (v80, جلسة المخطّط)
-- ============================================================
-- ⚠️ **معاد بناؤه من التوثيق** (نمط 47/48): طُبّق DB-only بجلسة v80 تحت
--    الرقم «57» قبل أن تستهلك جلسة P6 نفس الرقم لقوالب واتساب
--    (watch-point #10). التسمية «57b» تحفظ الموقع الزمني دون لمس ملفات PRM.
--    المصدر **حرفي** من ملخّص v80 (السطر الموثَّق نصاً) + الكود الحيّ
--    treatments.html (toggleFavorite، update is_favorite) +
--    patient-profile.html (تبويب «⭐ المفضلة»).
--
-- 🟢 على القاعدة الحيّة: **no-op** (العمود موجود منذ v80) — آمن لإعادة
--    التشغيل. الغرض = تكافؤ الـ schema للـ clones الجديدة.
--
-- 🔒 معزول عن المالية تماماً — علم عرض/ترتيب بحت.
-- ============================================================

ALTER TABLE public.treatments
  ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT false;

-- ── تحقّق بعد التشغيل ──
--   SELECT column_name, data_type, column_default
--     FROM information_schema.columns
--    WHERE table_name='treatments' AND column_name='is_favorite';

-- ── ROLLBACK ──
-- ALTER TABLE public.treatments DROP COLUMN IF EXISTS is_favorite;
