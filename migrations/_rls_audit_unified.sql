-- ============================================================================
-- SyDent — RLS Audit · UNIFIED single-result report  (READ-ONLY)
-- شغّله مرّة وحدة بالـ SQL Editor → نتيجة واحدة تغطّي كل الفحوصات.
-- رتّب/افرز على عمود flag لتشوف 🔴 و 🟡 أولاً.
-- ============================================================================
WITH
rls_off AS (
  SELECT 'RLS_OFF' AS check_id, '🔴 خطر' AS flag,
         c.relname AS object,
         'RLS مطفأ — احتمال تسريب بيانات بين العيادات' AS detail
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity=false
),
rls_locked AS (
  SELECT 'RLS_NO_POLICY','🟡 انتبه', c.relname,
         'RLS مفعّل بلا أي سياسة — الجدول مقفول للكل عدا service_role'
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity=true
    AND NOT EXISTS (SELECT 1 FROM pg_policies p
                    WHERE p.schemaname='public' AND p.tablename=c.relname)
),
broad AS (
  SELECT 'BROAD_TRUE','🟡 راجع',
         tablename||' · '||policyname,
         cmd||' | roles='||roles::text||' | using='||COALESCE(qual,'-')
              ||' | check='||COALESCE(with_check,'-')
  FROM pg_policies
  WHERE schemaname='public' AND (qual='true' OR with_check='true')
),
psettings AS (
  SELECT 'PLATFORM_SETTINGS','ℹ️ افحص',
         policyname,
         cmd||' | roles='||roles::text||' | using='||COALESCE(qual,'-')
  FROM pg_policies
  WHERE schemaname='public' AND tablename='platform_settings'
),
docdrift AS (
  SELECT 'DOCTORS_DRIFT','🔴 درفت',
         tablename||' · '||policyname,
         'السياسة تستعلم doctors مباشرةً (تجاوز helper) — using='||COALESCE(qual,'-')
  FROM pg_policies
  WHERE schemaname='public' AND tablename<>'doctors'
    AND (qual ILIKE '%doctors%' OR with_check ILIKE '%doctors%')
),
fn AS (
  SELECT 'ADMIN_FN',
         CASE WHEN p.prosecdef
                   AND pg_get_functiondef(p.oid) ILIKE '%platform_admins%'
                   AND p.provolatile='s'
              THEN '✅ سليم' ELSE '🔴 خلل' END,
         p.proname,
         'security_definer='||p.prosecdef::text
           ||' | volatility='||p.provolatile::text
           ||' | reads_platform_admins='||(pg_get_functiondef(p.oid) ILIKE '%platform_admins%')::text
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='is_platform_admin'
),
append_only AS (
  SELECT 'APPEND_ONLY',
         CASE WHEN cmd IN ('UPDATE','DELETE','ALL') THEN '🔴 قابل للتعديل' ELSE '✅ ثابت' END,
         tablename||' · '||policyname,
         'cmd='||cmd||' (UPDATE/DELETE/ALL يكسر الـ immutability)'
  FROM pg_policies
  WHERE schemaname='public'
    AND tablename IN ('subscription_events','platform_settings_audit')
),
storage_pol AS (
  SELECT 'STORAGE','ℹ️ افحص',
         policyname,
         cmd||' | using='||COALESCE(qual,'-')
  FROM pg_policies
  WHERE schemaname='storage' AND tablename='objects'
)
SELECT * FROM rls_off
UNION ALL SELECT * FROM rls_locked
UNION ALL SELECT * FROM broad
UNION ALL SELECT * FROM psettings
UNION ALL SELECT * FROM docdrift
UNION ALL SELECT * FROM fn
UNION ALL SELECT * FROM append_only
UNION ALL SELECT * FROM storage_pol
ORDER BY flag, check_id, object;

-- ============================================================================
-- كيف تقرأ النتيجة:
--   🔴 RLS_OFF        → جدول بلا RLS = أخطر شي. لازم يتصفّر.
--   🔴 DOCTORS_DRIFT  → المفروض صفر صفوف (بعد Migration 30.2).
--   🔴 APPEND_ONLY    → subscription_events بـ ALL (متوقّع من Q8) — قرار تصحيح.
--   🟡 BROAD_TRUE     → using/check = true. متوقّع فقط لـ:
--                       subscription_plans (read anon — كتالوج أسعار عام) +
--                       notification_templates (read authenticated). أي غيرهم = راجعه.
--   🟡 RLS_NO_POLICY  → جدول مقفول بصمت.
--   ℹ️ PLATFORM_SETTINGS → دقّق سياسات القراءة: لازم admin-only أو محصورة
--                       بـ key IN ('support_phone','payment_instructions_ar').
--                       أي سياسة قراءة أوسع (خصوصاً من Migration 34) = ثغرة.
--   ℹ️ STORAGE        → لازم 4 سياسات، كلها foldername[1]=auth.uid()::text.
-- ============================================================================
