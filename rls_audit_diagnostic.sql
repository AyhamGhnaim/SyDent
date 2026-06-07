-- ============================================================================
-- SyDent — RLS Audit Diagnostic  (READ-ONLY · safe to run anytime)
-- Project: rycqzpdhxabpqrdgtdzg
-- ============================================================================
-- شغّل كل استعلام (Q1..Q8) على حدة في Supabase SQL Editor وصوّر/الصق النتيجة.
-- كل الاستعلامات SELECT فقط على الكتالوج — لا تكتب/تعدّل أي شيء.
-- الهدف: مقارنة حالة RLS الحيّة الفعلية مقابل ما هو موثّق (لأن المستودع ناقص).
-- ============================================================================


-- ── Q1 — كل جداول public: هل RLS مفعّل؟ هل FORCE؟ ──────────────────────────
-- 🚩 العمود الأهم: rls_enabled. أي جدول فيه بيانات مستأجرين و rls_enabled=false
--    = تسريب بيانات بين العيادات. راجع كل صف rls_enabled=false يدوياً.
SELECT
  c.relname                              AS table_name,
  c.relrowsecurity                       AS rls_enabled,
  c.relforcerowsecurity                  AS rls_forced,
  (SELECT count(*) FROM pg_policies p
     WHERE p.schemaname='public' AND p.tablename=c.relname) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public' AND c.relkind='r'
ORDER BY c.relrowsecurity ASC, c.relname;
-- 🔎 افحص: (أ) صفوف rls_enabled=false → خطر تسريب.
--          (ب) rls_enabled=true لكن policy_count=0 → الجدول مقفول للجميع
--              (إلا service_role) — قد يكسر ميزة بصمت.


-- ── Q2 — كل سياسات public (الخريطة الكاملة) ───────────────────────────────
-- 🚩 ابحث عن qual='true' أو with_check='true' على جداول حسّاسة، وعن سياسات
--    مكرّرة بنفس cmd على نفس الجدول (sprawl).
SELECT
  tablename, policyname, cmd, permissive, roles,
  qual        AS using_expr,
  with_check  AS check_expr
FROM pg_policies
WHERE schemaname='public'
ORDER BY tablename, cmd, policyname;


-- ── Q3 — دالة الأدمن: لازم تقرأ platform_admins + SECURITY DEFINER + STABLE ─
SELECT
  p.proname,
  p.prosecdef           AS is_security_definer,   -- لازم true
  p.provolatile         AS volatility,            -- لازم 's' (stable)
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname='is_platform_admin';
-- 🔎 تأكّد: definition يقرأ FROM platform_admins (مش doctors)،
--          is_security_definer=true، volatility='s'، و SET search_path=public.


-- ── Q4 — أي سياسة لسا تستعلم doctors مباشرةً (تجاوز للـ helper) ────────────
-- بعد Migration 30.2 المفروض النتيجة = صفر صفوف (إلا doctors_admin_all/
-- doctors_self_read نفسها على جدول doctors).
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname='public'
  AND (qual ILIKE '%from public.doctors%' OR qual ILIKE '%from doctors%'
       OR with_check ILIKE '%from public.doctors%' OR with_check ILIKE '%from doctors%')
ORDER BY tablename, policyname;
-- 🔎 المتوقّع: فقط سياسات جدول doctors نفسه. أي tablename آخر هنا = درفت.


-- ── Q5 — platform_settings: مصدر الخطر الأول (over-exposure) ───────────────
-- عدّة سياسات SELECT تُجمع بـ OR → الوصول الفعلي = اتحادها كلها.
-- إن وُجدت سياسة SELECT بـ qual='true' لـ authenticated → المستأجر يقرأ
-- كل الإعدادات (مش فقط support_phone + payment_instructions_ar).
SELECT policyname, cmd, roles, qual AS using_expr, with_check AS check_expr
FROM pg_policies
WHERE schemaname='public' AND tablename='platform_settings'
ORDER BY cmd, policyname;
-- 🔎 المتوقّع نظيف: admin_read/admin_write بـ is_platform_admin()،
--    tenant_read محصورة بـ key IN ('support_phone','payment_instructions_ar').
--    أي سياسة قراءة أوسع (خصوصاً من Migration 34 غير الموثّقة) = ثغرة.


-- ── Q6 — تأكيد عمليّ: ماذا يقرأ مستأجر فعلاً من platform_settings ──────────
-- شغّل هذا من جلسة TENANT (سجّل دخول عيادة عادية ثم نفّذه)، أو اتركه للتأكيد.
-- المتوقّع: صفّان فقط (support_phone + payment_instructions_ar)، لا غير.
SELECT key FROM public.platform_settings ORDER BY key;


-- ── Q7 — سياسات Storage (عزل ملفات المرضى) ───────────────────────────────
SELECT policyname, cmd, roles, qual AS using_expr, with_check AS check_expr
FROM pg_policies
WHERE schemaname='storage' AND tablename='objects'
ORDER BY cmd, policyname;
-- 🔎 المتوقّع 4 سياسات (select/insert/update/delete) كلها:
--    bucket_id='patient-files' AND (storage.foldername(name))[1]=auth.uid()::text


-- ── Q8 — جداول append-only: تأكيد عدم وجود سياسة UPDATE/DELETE ─────────────
-- subscription_events + platform_settings_audit لازم تكون immutable عبر RLS
-- (لا سياسة UPDATE ولا DELETE → RLS يرفضهما تلقائياً).
SELECT tablename, cmd, count(*) AS n
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('subscription_events','platform_settings_audit','audit_log')
GROUP BY tablename, cmd
ORDER BY tablename, cmd;
-- 🔎 المتوقّع لـ subscription_events + platform_settings_audit:
--    لا صفوف cmd='UPDATE' ولا cmd='DELETE'. (audit_log فيه FOR ALL للمالك —
--    هذا مقصود: السجل ملك العيادة، الأرشفة UPDATE.)


-- ============================================================================
-- بعد ما تجمع نتائج Q1..Q8، ابعتها لي وبحدّد بالضبط:
--   • أي جدول ناقص RLS أو مقفول كلياً
--   • أي سياسة over-broad (خصوصاً platform_settings + Migration 34)
--   • أي درفت بين المستودع والإنتاج نوثّقه أو نصلحه بـ migration
-- ============================================================================
