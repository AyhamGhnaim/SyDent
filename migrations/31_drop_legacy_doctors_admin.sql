-- ════════════════════════════════════════════════════════════════
-- Migration 31 — تنظيف بقايا نموذج الأدمن القديم على جدول doctors
-- ────────────────────────────────────────────────────────────────
-- مؤجّلة سابقاً (post-soak). طُبّقت 07 يونيو 2026 (v79) بعد تأكيد الجاهزية حيّاً.
--
-- السياق: قبل Phase F كان الأدمن يُعرَّف بـ doctors.role='admin'. بعد
--   Phase F (Migration 30.x) صارت الهوية في platform_admins عبر
--   is_platform_admin()، وبعد Phase E (v75) صارت كل عمليات الأدمن على
--   المستخدمين/الأطباء تمرّ عبر Edge Function admin-ops بـ SERVICE_KEY
--   (يتجاوز RLS). فبقي شيئان أثريان نظّفناهما هنا.
--
-- التحقّق المسبق (مؤكّد باستعلام تشخيص حيّ + grep الكود):
--   • صفر سياسة RLS تستعلم doctors.role='admin' (DOCTORS_DRIFT=0، Migration 30.2).
--   • صفر استعلام client مباشر على جدول doctors بـ admin.html (كله عبر admin-ops).
--   • doctors.role القيم: doctor×3، admin×1 (سجل المالك القديم)، null×1.
--   • doctors_admin_all كانت FOR ALL / is_platform_admin() — امتياز JWT للمتصفّح
--     غير مستعمل بعد Phase E؛ إسقاطها يطابق فلسفة Phase E (Rule #123).
--
-- idempotent + reversible (rollback بالأسفل).
-- ════════════════════════════════════════════════════════════════

-- (1) تطبيع قيمة role الأثرية: الصفّ الوحيد 'admin' → 'doctor'.
--     'doctor' قيمة موجودة أصلاً (3 صفوف) = صالحة مؤكّدة. لا أثر وظيفي
--     (لا شيء يقرأ doctors.role للتفويض بعد Phase F).
UPDATE public.doctors SET role = 'doctor' WHERE role = 'admin';

-- (2) إسقاط سياسة الوصول الكامل للأدمن على doctors.
--     الأدمن يبقى يعمل عبر Edge Function (SERVICE_KEY يتجاوز RLS)؛ والوصول
--     لصفّه الشخصي مغطّى بسياسات «own profile» + doctors_self_read.
DROP POLICY IF EXISTS doctors_admin_all ON public.doctors;

-- ── Rollback (إن لزم فقط) ──────────────────────────────────────
--   CREATE POLICY doctors_admin_all ON public.doctors
--     FOR ALL USING ((SELECT is_platform_admin()))
--     WITH CHECK ((SELECT is_platform_admin()));
--   -- (تطبيع role كان cosmetic بلا أثر — لا يُرجَع)
