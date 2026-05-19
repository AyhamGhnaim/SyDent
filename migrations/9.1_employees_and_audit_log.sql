-- ═══════════════════════════════════════════════════════════════════
-- Migration 9.1 — Phase 5 (Audit Log + Per-Employee Identity)
-- ═══════════════════════════════════════════════════════════════════
-- الهدف:
--   1. جدول clinic_employees: هويات منفصلة للموظفين (Owner/Doctor/Secretary)
--      مع PIN خاص لكل واحد. يربط مع clinic_doctors عبر doctor_id اختياري.
--   2. جدول audit_log: سجل كل العمليات المهمة في النظام.
--   3. Smart Alerts: trigger يكتشف العمليات المريبة تلقائياً.
--   4. Bootstrap: ترحيل تلقائي للـ Owner الموجود + Doctors الموجودين
--      إلى clinic_employees بدون فقدان البيانات.
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────
-- PART 1 — clinic_employees
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.clinic_employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'doctor', 'secretary')),
  doctor_id UUID REFERENCES clinic_doctors(id) ON DELETE SET NULL,
  pin_hash TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ضمان uniqueness للـ Owner داخل كل عيادة (لا يمكن وجود 2 Owners)
CREATE UNIQUE INDEX IF NOT EXISTS uq_clinic_employees_one_owner
  ON public.clinic_employees(owner_id)
  WHERE role = 'owner';

-- ضمان عدم تكرار ربط نفس clinic_doctor مع موظفَين مختلفَين
CREATE UNIQUE INDEX IF NOT EXISTS uq_clinic_employees_doctor_link
  ON public.clinic_employees(doctor_id)
  WHERE doctor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clinic_employees_owner
  ON public.clinic_employees(owner_id, is_active);

CREATE INDEX IF NOT EXISTS idx_clinic_employees_doctor
  ON public.clinic_employees(doctor_id);

-- RLS
ALTER TABLE public.clinic_employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_employees_owner_all" ON public.clinic_employees;
CREATE POLICY "clinic_employees_owner_all" ON public.clinic_employees
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_clinic_employees_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_clinic_employees_updated_at ON public.clinic_employees;
CREATE TRIGGER trg_clinic_employees_updated_at
  BEFORE UPDATE ON public.clinic_employees
  FOR EACH ROW EXECUTE FUNCTION public.set_clinic_employees_updated_at();

-- ───────────────────────────────────────────────────────────────────
-- PART 2 — audit_log
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- مين عمل العملية
  employee_id UUID REFERENCES clinic_employees(id) ON DELETE SET NULL,
  employee_name_snapshot TEXT,         -- snapshot للاسم حتى لو الموظف اتحذف
  employee_role_snapshot TEXT,         -- snapshot للدور

  -- شو صار
  action_type TEXT NOT NULL,           -- مثلاً: 'payment.delete', 'session.edit_price'
  entity_type TEXT,                    -- 'payment', 'session', 'appointment', ...
  entity_id UUID,                      -- المعرّف الذي تم التعديل عليه

  -- على مين
  patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
  patient_name_snapshot TEXT,

  -- تفاصيل
  description TEXT,                    -- وصف عربي مقروء
  old_value JSONB,                     -- القيمة قبل (للتعديل/الحذف)
  new_value JSONB,                     -- القيمة بعد (للإضافة/التعديل)

  -- التنبيهات
  is_alert BOOLEAN NOT NULL DEFAULT FALSE,
  alert_reason TEXT,

  -- الأرشفة (يدوية للـ Owner)
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  archived_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes للأداء
CREATE INDEX IF NOT EXISTS idx_audit_log_owner_date
  ON public.audit_log(owner_id, created_at DESC)
  WHERE is_archived = FALSE;

CREATE INDEX IF NOT EXISTS idx_audit_log_patient
  ON public.audit_log(owner_id, patient_id, created_at DESC)
  WHERE patient_id IS NOT NULL AND is_archived = FALSE;

CREATE INDEX IF NOT EXISTS idx_audit_log_employee
  ON public.audit_log(owner_id, employee_id, created_at DESC)
  WHERE is_archived = FALSE;

CREATE INDEX IF NOT EXISTS idx_audit_log_alerts
  ON public.audit_log(owner_id, created_at DESC)
  WHERE is_alert = TRUE AND is_archived = FALSE;

CREATE INDEX IF NOT EXISTS idx_audit_log_action_type
  ON public.audit_log(owner_id, action_type, created_at DESC);

-- RLS
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_owner_all" ON public.audit_log;
CREATE POLICY "audit_log_owner_all" ON public.audit_log
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- ───────────────────────────────────────────────────────────────────
-- PART 3 — Smart Alert Detection (Trigger)
-- ───────────────────────────────────────────────────────────────────
-- عند إدخال صف جديد، نفحص 3 قواعد:
--  1. حذف دفعة بسرعة (أقل من ساعة من إنشائها)
--  2. تعديل سعر جلسة بأكثر من 50%
--  3. 5+ تعديلات من نفس الموظف على نفس المريض في نفس اليوم
-- ───────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.detect_audit_alerts()
RETURNS TRIGGER AS $$
DECLARE
  v_old_price NUMERIC;
  v_new_price NUMERIC;
  v_pct_change NUMERIC;
  v_recent_count INT;
  v_payment_age_minutes NUMERIC;
  v_original_creation TIMESTAMPTZ;
BEGIN
  -- ── Rule 1: حذف دفعة بسرعة ─────────────────────────────────────
  IF NEW.action_type = 'payment.delete' AND NEW.old_value IS NOT NULL THEN
    BEGIN
      v_original_creation := (NEW.old_value->>'created_at')::TIMESTAMPTZ;
      IF v_original_creation IS NOT NULL THEN
        v_payment_age_minutes := EXTRACT(EPOCH FROM (now() - v_original_creation)) / 60;
        IF v_payment_age_minutes < 60 THEN
          NEW.is_alert := TRUE;
          NEW.alert_reason := 'حذف دفعة بعد ' || ROUND(v_payment_age_minutes)::TEXT
                              || ' دقيقة فقط من إنشائها';
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- في حال JSON غير صالح، نتجاهل
      NULL;
    END;
  END IF;

  -- ── Rule 2: تعديل سعر جلسة بأكثر من 50% ──────────────────────
  IF NEW.action_type = 'session.edit_price'
     AND NEW.old_value IS NOT NULL AND NEW.new_value IS NOT NULL THEN
    BEGIN
      v_old_price := (NEW.old_value->>'cost')::NUMERIC;
      v_new_price := (NEW.new_value->>'cost')::NUMERIC;
      IF v_old_price IS NOT NULL AND v_old_price > 0 AND v_new_price IS NOT NULL THEN
        v_pct_change := ABS(v_new_price - v_old_price) / v_old_price * 100;
        IF v_pct_change >= 50 THEN
          NEW.is_alert := TRUE;
          NEW.alert_reason := COALESCE(NEW.alert_reason || ' · ', '')
                              || 'تعديل سعر بنسبة ' || ROUND(v_pct_change)::TEXT || '%';
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  -- ── Rule 3: 5+ تعديلات من نفس الموظف على نفس المريض اليوم ───
  -- (نفحص فقط على الإجراءات الـ destructive والـ edit)
  IF NEW.patient_id IS NOT NULL AND NEW.employee_id IS NOT NULL
     AND (NEW.action_type LIKE '%.delete' OR NEW.action_type LIKE '%.edit%') THEN
    SELECT COUNT(*) INTO v_recent_count
    FROM public.audit_log
    WHERE owner_id = NEW.owner_id
      AND employee_id = NEW.employee_id
      AND patient_id = NEW.patient_id
      AND (action_type LIKE '%.delete' OR action_type LIKE '%.edit%')
      AND created_at >= date_trunc('day', now())
      AND created_at < NEW.created_at;
    IF v_recent_count >= 4 THEN  -- 4 سابقة + هذه = 5
      NEW.is_alert := TRUE;
      NEW.alert_reason := COALESCE(NEW.alert_reason || ' · ', '')
                          || (v_recent_count + 1)::TEXT
                          || ' تعديلات من نفس الموظف على نفس المريض اليوم';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_detect_audit_alerts ON public.audit_log;
CREATE TRIGGER trg_detect_audit_alerts
  BEFORE INSERT ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.detect_audit_alerts();

-- ───────────────────────────────────────────────────────────────────
-- PART 4 — Bootstrap: ترحيل الـ Owner والـ Doctors الموجودين
-- ───────────────────────────────────────────────────────────────────
-- لكل Owner له clinic_doctors بدون clinic_employees مقابل:
--   - ننشئ Employee تلقائياً بدور 'owner' للـ is_owner=TRUE
--   - ننشئ Employee تلقائياً بدور 'doctor' لكل clinic_doctor آخر
-- pin_hash يبقى NULL حتى يضبطه الـ Owner من employees.html
-- ولكن إذا كان clinic_settings.lock_pin_hash موجود سابقاً، ينتقل للـ Owner
-- ───────────────────────────────────────────────────────────────────

INSERT INTO public.clinic_employees (owner_id, name, role, doctor_id, pin_hash, is_active)
SELECT
  cd.owner_id,
  cd.name,
  CASE WHEN cd.is_owner THEN 'owner' ELSE 'doctor' END AS role,
  cd.id AS doctor_id,
  CASE
    WHEN cd.is_owner THEN cs.lock_pin_hash    -- ينتقل PIN العيادة للـ Owner
    ELSE NULL                                  -- باقي الأطباء بدون PIN حتى يضبطوا
  END AS pin_hash,
  COALESCE(cd.is_active, TRUE) AS is_active
FROM public.clinic_doctors cd
LEFT JOIN public.clinic_settings cs ON cs.owner_id = cd.owner_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.clinic_employees ce
  WHERE ce.doctor_id = cd.id
);

-- ═══════════════════════════════════════════════════════════════════
-- DONE — Migration 9.1
-- ═══════════════════════════════════════════════════════════════════
-- النتيجة المتوقعة:
--   ✓ جدول clinic_employees جاهز مع UNIQUE constraint للـ Owner
--   ✓ جدول audit_log جاهز مع 5 indexes للأداء
--   ✓ Trigger للتنبيهات الذكية شغّال
--   ✓ كل Owner موجود سابقاً انضاف كـ employee[role=owner]
--   ✓ كل Doctor موجود سابقاً انضاف كـ employee[role=doctor]
--   ✓ السكرتيرات لازم تنضاف يدوياً من employees.html (المرحلة 3)
-- ═══════════════════════════════════════════════════════════════════
