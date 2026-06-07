-- ============================================================================
-- Migration 50 — subscription_requests: restrict tenant UPDATE to cancel-only
-- Date: 07 June 2026
-- ============================================================================
-- السياق (من فحص RLS، 07 يونيو 2026):
--   سياسة Migration 42 `p_sub_requests_tenant_update` كانت:
--     USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())
--   → المستأجر يقدر يحدّث صفّه لأي `status`، بما فيه `'approved'`.
--   غير مؤذٍ اليوم (التفعيل الفعلي admin-only عبر transitionAccount + trial_requests)،
--   لكنه فخّ كامن: أي كود مستقبلي يثق بـ subscription_requests.status='approved'
--   يفتح باب self-approval. نسكّره الآن (defense-in-depth).
--
-- الفعل الوحيد المشروع للمستأجر = إلغاء طلبه المعلّق (subCancelPending في
-- subscription.html: UPDATE status='cancelled' على صفّ pending). فنقصر السياسة
-- على هذا الانتقال فقط: pending → cancelled.
--
-- التحقّق قبل التنفيذ: grep على subscription.html → التحديث الوحيد للمستأجر هو
--   .update({status:'cancelled', resolved_at}).eq('id', ST.pending.id)
--   حيث ST.pending دائماً صفّ status='pending'. فالتقييد لا يكسر الإلغاء.
--
-- الأدمن غير متأثّر: p_sub_requests_admin_update (is_platform_admin) يبقى كما هو
-- للموافقة/الرفض.
--
-- Idempotent (DROP IF EXISTS + CREATE) + reversible (rollback بالأسفل).
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS p_sub_requests_tenant_update ON public.subscription_requests;

CREATE POLICY p_sub_requests_tenant_update
  ON public.subscription_requests
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND status = 'pending')
  WITH CHECK (user_id = auth.uid() AND status = 'cancelled');

COMMIT;

-- ============================================================================
-- VERIFICATION (شغّل بعد الـ COMMIT)
-- ============================================================================
-- 1) السياسة الجديدة:
--    SELECT policyname, cmd, qual, with_check FROM pg_policies
--    WHERE schemaname='public' AND tablename='subscription_requests'
--      AND policyname='p_sub_requests_tenant_update';
--    Expected:
--      qual       = ((user_id = auth.uid()) AND (status = 'pending'))
--      with_check = ((user_id = auth.uid()) AND (status = 'cancelled'))
--
-- 2) THE REAL TEST — من جلسة مستأجر على sydent.app:
--    • إنشاء طلب ترقية ثم إلغاؤه من subscription.html → لازم ينجح (pending→cancelled).
--    • محاولة UPDATE يدوية لـ status='approved' على صفّ المستأجر → لازم RLS يرفض
--      (0 rows / policy violation).

-- ============================================================================
-- ROLLBACK (للرجوع لسلوك Migration 42)
-- ============================================================================
-- BEGIN;
--   DROP POLICY IF EXISTS p_sub_requests_tenant_update ON public.subscription_requests;
--   CREATE POLICY p_sub_requests_tenant_update
--     ON public.subscription_requests FOR UPDATE TO authenticated
--     USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
-- COMMIT;
-- ============================================================================
