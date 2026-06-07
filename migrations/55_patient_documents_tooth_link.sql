-- Migration 55 — ربط ملفات/صور المريض بسنّ محدد (إكمال P2)
-- ============================================================
-- ⚠️ خذ snapshot منطقي أولاً (Free tier: لا backup تلقائي). هذا الـmigration
--    additive فقط — يضيف عمودين nullable على patient_documents؛ لا تعديل/كتابة
--    على أي بيانات موجودة، وكل صف حالي يبقى صالحاً.
-- ⚠️ ترتيب التشغيل: snapshot → هذا الـmigration → (الكود منشور؛ الرفع يعمل قبل
--    الـmigration عبر fallback graceful في SyDentFiles.upload، فالترتيب آمن).
--
-- Why: كان Phase 9 يخزّن المستندات على مستوى المريض فقط. هذا يربط الصورة/الملف
--   بسنّ محدد (tooth_num) — يحقّق معيار نجاح P2: «رفع صورة أشعة وربطها بسن محدد
--   وعرضها». session_id اختياري ومستقبلي (لا يُكتب من الواجهة بعد).
--
-- معزول تماماً عن المالية: patient_documents لا يمسّ splits/ledger.
-- idempotent + آمن لإعادة التشغيل.
-- ============================================================

ALTER TABLE public.patient_documents
  ADD COLUMN IF NOT EXISTS tooth_num  TEXT,    -- FDI كنص (يطابق teeth_status.tooth_num)
  ADD COLUMN IF NOT EXISTS session_id UUID;    -- ربط اختياري بجلسة (مستقبلي)

-- FK للجلسة: SET NULL عند حذف الجلسة حتى لا يُحذف/يضيع الملف.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'patient_documents_session_id_fkey'
      AND table_name      = 'patient_documents'
  ) THEN
    ALTER TABLE public.patient_documents
      ADD CONSTRAINT patient_documents_session_id_fkey
      FOREIGN KEY (session_id) REFERENCES public.ledger_sessions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- فهرس للفلترة حسب السن داخل ملف المريض.
CREATE INDEX IF NOT EXISTS idx_pdocs_patient_tooth
  ON public.patient_documents(patient_id, tooth_num);

-- ملاحظة RLS: لا تغيير. سياسة media_owner_all (owner_id = auth.uid()) تغطّي
-- الأعمدة الجديدة تلقائياً.
