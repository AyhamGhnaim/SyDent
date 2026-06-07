-- ============================================================================
-- Migration 49 — subscription_events true append-only (RLS-enforced immutability)
-- Date: 07 June 2026
-- ============================================================================
-- السياق (من فحص RLS الحيّ، 07 يونيو 2026):
--   الفحص أظهر أن `subscription_events` عليه سياسة واحدة `p_sub_events_admin`
--   بـ FOR ALL → الأدمن يقدر UPDATE/DELETE الأحداث. هذا يخالف وصف الجدول كـ
--   «سجل أحداث immutable بنمط Stripe»، ويخالف الجدول الأحدث
--   `platform_settings_audit` الذي بُني صح (INSERT + SELECT فقط، بلا UPDATE/DELETE).
--
-- لماذا آمن:
--   grep على كامل الكود (admin.html + supabase-init.js + edge function) أظهر أن
--   subscription_events يُلمَس بـ `.select` (2×) و `.insert` (1×) فقط — صفر
--   `.update` / `.delete` / `.upsert`. التطبيق أصلاً append-only؛ هذا الـ migration
--   يثبّت القاعدة على مستوى RLS بدل الاعتماد على «التطبيق ما يبعت UPDATE».
--
-- لماذا الصواب (نمط Stripe):
--   سجل الفوترة لا يُحرَّر — التصحيح يكون بحدث تعويضي (compensating event)، لا
--   بتعديل التاريخ. بعد هذا الـ migration، أي تصحيح نادر لحدث خاطئ يتطلّب SQL
--   متعمّد بالـ SQL Editor (إجراء استثنائي واعٍ) — وهذا بالضبط سلوك السجل الـ
--   tamper-evident.
--
-- الأثر:
--   • الأدمن: يقرأ كل الأحداث + يُدرج أحداث جديدة (logSubscriptionEvent) — بلا تغيير.
--   • الأدمن: لا يقدر UPDATE أو DELETE عبر window.sb بعد الآن (RLS يرفض).
--   • المستأجر: لا وصول إطلاقاً (كما قبل — لا سياسة tenant).
--   • service_role (الـ edge function): يتجاوز RLS — للتصحيحات الإدارية إن لزم.
--
-- Idempotent (DROP IF EXISTS + CREATE) + reversible (rollback بالأسفل).
-- ============================================================================

BEGIN;

-- إسقاط سياسة الـ FOR ALL (التي تسمح بـ UPDATE/DELETE).
DROP POLICY IF EXISTS "p_sub_events_admin" ON public.subscription_events;

-- إعادة بناء الصلاحية كـ INSERT + SELECT فقط (نفس نمط platform_settings_audit).
-- لا سياسة UPDATE ولا DELETE → RLS يرفضهما تلقائياً = immutability حقيقي.

DROP POLICY IF EXISTS "p_sub_events_admin_insert" ON public.subscription_events;
CREATE POLICY "p_sub_events_admin_insert"
  ON public.subscription_events
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.is_platform_admin()));

DROP POLICY IF EXISTS "p_sub_events_admin_select" ON public.subscription_events;
CREATE POLICY "p_sub_events_admin_select"
  ON public.subscription_events
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_platform_admin()));

COMMIT;

-- ============================================================================
-- VERIFICATION (شغّل بعد الـ COMMIT)
-- ============================================================================
-- 1) لازم تظهر سياستان فقط، cmd INSERT + SELECT، ولا UPDATE/ALL/DELETE:
--    SELECT policyname, cmd, roles, qual, with_check
--    FROM pg_policies
--    WHERE schemaname='public' AND tablename='subscription_events'
--    ORDER BY cmd, policyname;
--    Expected:
--      p_sub_events_admin_insert | INSERT | {authenticated} | -                          | (SELECT is_platform_admin())
--      p_sub_events_admin_select | SELECT | {authenticated} | (SELECT is_platform_admin())| -
--
-- 2) إعادة فحص الـ APPEND_ONLY (من سكربت التشخيص): لازم صفر صفوف 🔴 الآن.
--
-- 3) THE REAL TEST — افتح admin.html واعمل أي عملية lifecycle (قبول/تجديد/تعليق):
--    لازم يُسجَّل الحدث بنجاح (INSERT يمرّ). والـ Events Viewer + Customer 360
--    Timeline لازم يعرضوا الأحداث عادي (SELECT يمرّ).

-- ============================================================================
-- ROLLBACK (لو لزم الرجوع لسلوك FOR ALL)
-- ============================================================================
-- BEGIN;
--   DROP POLICY IF EXISTS "p_sub_events_admin_insert" ON public.subscription_events;
--   DROP POLICY IF EXISTS "p_sub_events_admin_select" ON public.subscription_events;
--   CREATE POLICY "p_sub_events_admin" ON public.subscription_events
--     FOR ALL TO authenticated
--     USING ((SELECT public.is_platform_admin()))
--     WITH CHECK ((SELECT public.is_platform_admin()));
-- COMMIT;
-- ============================================================================
