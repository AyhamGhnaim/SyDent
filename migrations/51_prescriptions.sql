-- ============================================================
-- Migration 51: Electronic Prescriptions (P1 — منافسون عرب)
-- ============================================================
-- ينشئ 3 جداول للروشتة الإلكترونية + يضيف رقم النقابة لإعدادات العيادة.
-- نمط RLS بالمالك المعتمد (owner_id = auth.uid()). idempotent + graceful.
--
-- الجداول:
--   prescriptions          — رأس الروشتة (مريض/طبيب/موعد/ملاحظات/تاريخ)
--   prescription_items     — أسطر الأدوية (دواء/جرعة/تكرار/مدة/تعليمات)
--   prescription_templates — قوالب قابلة لإعادة الاستخدام (items JSONB)
--
-- + عمود clinic_settings.license_no — رقم النقابة، يظهر على الروشتة المطبوعة.
-- ============================================================

-- ---------- 1) رأس الروشتة ----------
CREATE TABLE IF NOT EXISTS public.prescriptions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id     UUID NOT NULL,
  provider_id    UUID REFERENCES clinic_doctors(id) ON DELETE SET NULL,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 2) أسطر الأدوية ----------
CREATE TABLE IF NOT EXISTS public.prescription_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prescription_id UUID NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  drug_name       TEXT NOT NULL,
  dosage          TEXT,
  frequency       TEXT,
  duration        TEXT,
  instructions    TEXT,
  sort_order      INT NOT NULL DEFAULT 0
);

-- ---------- 3) قوالب الروشتات ----------
CREATE TABLE IF NOT EXISTS public.prescription_templates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  items      JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- RLS ----------
ALTER TABLE public.prescriptions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescription_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescription_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rx_owner_all" ON public.prescriptions;
CREATE POLICY "rx_owner_all" ON public.prescriptions
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "rx_items_owner_all" ON public.prescription_items;
CREATE POLICY "rx_items_owner_all" ON public.prescription_items
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "rx_tmpl_owner_all" ON public.prescription_templates;
CREATE POLICY "rx_tmpl_owner_all" ON public.prescription_templates
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- ---------- الفهارس ----------
CREATE INDEX IF NOT EXISTS idx_rx_patient
  ON public.prescriptions(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rx_owner
  ON public.prescriptions(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rx_items_rx
  ON public.prescription_items(prescription_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_rx_tmpl_owner
  ON public.prescription_templates(owner_id, created_at DESC);

-- ---------- رقم النقابة على إعدادات العيادة ----------
-- يظهر على رأس الروشتة المطبوعة بجانب اسم الطبيب.
ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS license_no TEXT;
