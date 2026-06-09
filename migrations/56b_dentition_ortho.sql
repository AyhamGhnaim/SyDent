-- Migration 56b — Dentition mode + Orthodontics duration fields (v80, جلسة المخطّط)
-- ============================================================
-- ⚠️ **معاد بناؤه من التوثيق + الكود** (نمط 47/48): طُبّق أصلاً DB-only
--    بجلسة v80 تحت الرقم «56» **قبل** أن تستهلك جلسة P6 نفس الرقم لملفّ PRM
--    (watch-point #10). التسمية «56b» تحفظ الموقع الزمني الصحيح بين 56 و57
--    دون لمس ملفات PRM. المصدر: ملخّص v80 (patients.dentition_mode +
--    patients.primary_teeth + ledger_sessions.ortho_start/ortho_months) +
--    الكود الحيّ patient-profile.html (الكتابة 3639/6764-6767، القراءة
--    3646-3650/6523).
--
-- 🟢 على القاعدة الحيّة: **no-op كامل** (الأعمدة موجودة منذ v80) — آمن
--    لإعادة التشغيل. الغرض الفعلي = تكافؤ الـ schema لأي clone/مشروع جديد.
--
-- 🔒 معزول عن المالية: أعمدة عرض/تصنيف بحتة — ortho_* لا تُقرأ في
--    FIFO/splitIsEarned/اختبارات الهوية إطلاقاً.
--
-- ملاحظات الأنواع (مطابقة للكود — لا CHECK، الكود graceful):
--   • dentition_mode TEXT nullable — المفردات بالكود: 'permanent'|'primary'|'mixed'
--     (الافتراضي مشتق من العمر عند NULL: ≤6 لبنية، ≤12 مختلطة، غيره دائمة).
--   • primary_teeth TEXT nullable — يخزَّن JSON-string لمصفوفة flips
--     (الكود يقرأه بـ JSON.parse(... || '[]')).
--   • ortho_start DATE / ortho_months INT — على ledger_sessions (الجلسات
--     الجماعية لفئة orthodontics فقط؛ regPayload → insert).
-- ============================================================

BEGIN;

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS dentition_mode TEXT,
  ADD COLUMN IF NOT EXISTS primary_teeth  TEXT;

ALTER TABLE public.ledger_sessions
  ADD COLUMN IF NOT EXISTS ortho_start  DATE,
  ADD COLUMN IF NOT EXISTS ortho_months INT;

COMMIT;

-- ── تحقّق بعد التشغيل ──
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name='patients'
--      AND column_name IN ('dentition_mode','primary_teeth');
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name='ledger_sessions'
--      AND column_name IN ('ortho_start','ortho_months');

-- ── ROLLBACK (آمن — لا بيانات مالية؛ يفقد فقط حالة الإطباق/مدد التقويم المحفوظة) ──
-- BEGIN;
-- ALTER TABLE public.ledger_sessions
--   DROP COLUMN IF EXISTS ortho_months,
--   DROP COLUMN IF EXISTS ortho_start;
-- ALTER TABLE public.patients
--   DROP COLUMN IF EXISTS primary_teeth,
--   DROP COLUMN IF EXISTS dentition_mode;
-- COMMIT;
