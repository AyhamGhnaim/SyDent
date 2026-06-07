-- ============================================================
-- Migration 53: Treatment Materials — Auto-Deduct Link (P3-B)
-- ============================================================
-- يربط كل علاج بقائمة مواد مخزون مستهلكة + كمية لكل استخدام (نموذج BoM/Kit
-- المعتمد عالمياً — Odoo/ERPAG). عند إكمال جلسة من العلاج، تُخصم المواد
-- (بعد تأكيد المستخدم) من المخزون.
--
-- additive بالكامل: جدول جديد واحد فقط (CREATE IF NOT EXISTS) — صفر تعديل/حذف
-- لأي جدول موجود → آمن حالياً ومستقبلياً. لا يمسّ المالية (P&L) إطلاقاً؛
-- الخصم يكتب لـ inventory_movements فقط (P3-A). ربط P&L = P3-C منفصل.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.treatment_materials (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  treatment_id UUID NOT NULL REFERENCES treatments(id) ON DELETE CASCADE,
  item_id      UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  qty_per_use  NUMERIC NOT NULL DEFAULT 1,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- RLS ----------
ALTER TABLE public.treatment_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tmat_owner_all" ON public.treatment_materials;
CREATE POLICY "tmat_owner_all" ON public.treatment_materials
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- ---------- الفهارس ----------
CREATE INDEX IF NOT EXISTS idx_tmat_treatment
  ON public.treatment_materials(treatment_id);
CREATE INDEX IF NOT EXISTS idx_tmat_owner
  ON public.treatment_materials(owner_id);
