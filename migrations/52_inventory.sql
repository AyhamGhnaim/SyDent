-- ============================================================
-- Migration 52: Inventory — Basic (P3-A)
-- ============================================================
-- مخزون أساسي معزول تماماً عن المالية (لا لمس لـ P&L/الجلسات/المصاريف).
-- جدولان فقط. نمط RLS بالمالك المعتمد. additive بالكامل (صفر تعديل/حذف
-- لأي جدول موجود) → آمن حالياً ومستقبلياً: حتى لو خطأ، لا يكسر الموجود.
--
--   inventory_items      — الأصناف (الكمية مصدر حقيقة واحد، يُحدَّث مع كل حركة)
--   inventory_movements  — سجل الحركات (وارد/صادر/تعديل/مرتجع) — تاريخ غير قابل للحذف منطقياً
--
-- الربط بالمصاريف (P&L) والخصم التلقائي عند إكمال الجلسة = مراحل لاحقة
-- منفصلة (P3-B / P3-C). هذه المرحلة لا تمسّ أي منطق مالي.
-- ============================================================

-- ---------- 1) الأصناف ----------
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  unit           TEXT,                                   -- وحدة القياس (علبة/أنبوب/قطعة…)
  quantity       NUMERIC NOT NULL DEFAULT 0,             -- الكمية الحالية (مصدر حقيقة)
  reorder_level  NUMERIC NOT NULL DEFAULT 0,             -- حد التنبيه لإعادة الطلب
  purchase_price BIGINT,                                 -- آخر سعر شراء (ل.س) — اختياري
  note           TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,          -- soft-delete (لا حذف صلب لصنف له حركات)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 2) الحركات ----------
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id     UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  change      NUMERIC NOT NULL,                          -- موجب=وارد، سالب=صادر
  reason      TEXT NOT NULL,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inv_reason_valid CHECK (reason IN ('purchase','consume','adjust','return'))
);

-- ---------- RLS ----------
ALTER TABLE public.inventory_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inv_items_owner_all" ON public.inventory_items;
CREATE POLICY "inv_items_owner_all" ON public.inventory_items
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "inv_mov_owner_all" ON public.inventory_movements;
CREATE POLICY "inv_mov_owner_all" ON public.inventory_movements
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- ---------- الفهارس ----------
CREATE INDEX IF NOT EXISTS idx_inv_items_owner
  ON public.inventory_items(owner_id, is_active, name);
CREATE INDEX IF NOT EXISTS idx_inv_mov_item
  ON public.inventory_movements(item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_mov_owner
  ON public.inventory_movements(owner_id, created_at DESC);
