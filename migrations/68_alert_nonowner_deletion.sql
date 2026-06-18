-- ═══════════════════════════════════════════════════════════════════
-- Migration 68 — Smart Alert Rule #4: non-owner deletion of payment/session
-- ═══════════════════════════════════════════════════════════════════
-- WHY:
--   The owner reported that when staff (a doctor employee or a secretary)
--   delete a payment or a session — whether OLD or recent — it does NOT
--   surface as a smart alert. The existing rules only catch:
--     Rule 1 — payment deleted < 60 min after creation (recent only)
--     Rule 3 — 5+ edits/deletes by same staff on same patient same day
--   So a staff member deleting an OLD payment, or a single session, slips
--   through unflagged. The owner wants EVERY such deletion by a non-owner
--   visible, regardless of age or count.
--
-- WHAT (Rule 4, added below):
--   Any `payment.delete` or `session.delete` whose actor role snapshot is
--   a staff role ('doctor' or 'secretary') → is_alert := TRUE, with a clear
--   Arabic reason. The owner's own deletions (role snapshot 'owner') are
--   intentionally NOT flagged — owner deletions are legitimate bookkeeping.
--
-- SAFETY / DESIGN:
--   • employee_role_snapshot is NEVER null in practice: clinic_employees.role
--     is NOT NULL CHECK IN ('owner','doctor','secretary'); logAudit falls back
--     to getRole() (defaults 'owner') when no employee row exists. We use an
--     explicit WHITELIST (IN ('doctor','secretary')) so any unexpected/null
--     value fails safe (NOT flagged), never a false positive on the owner.
--   • Reason is written ONLY when alert_reason is still null, so if Rule 1
--     already produced the more precise "deleted N minutes after creation"
--     text for a recent payment, that text is preserved (no duplication).
--     is_alert is set TRUE unconditionally for the staff-deletion case.
--   • Pure column checks, no subquery — sub-millisecond, BEFORE INSERT.
--   • No automated/cascade path emits payment.delete/session.delete: both are
--     logged only by explicit user actions in patient-profile.html, so this
--     never fires on a system-generated row.
--
-- IDEMPOTENT: CREATE OR REPLACE FUNCTION + DROP/CREATE TRIGGER.
-- Until applied, the prior three rules keep working unchanged.
-- ═══════════════════════════════════════════════════════════════════

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
  -- ⚠️ DEAD-CODE NOTICE (Phase 6 M — Observation S, commit C1):
  --   This rule is intentionally kept active in the trigger even though
  --   no client feature currently emits `session.edit_price` (SyDent
  --   does not yet support editing a session's cost after creation).
  --   Rationale for keeping (not removing):
  --     • Zero runtime cost — BEFORE INSERT, sub-millisecond on miss
  --     • Forward-compatible — when an edit-session-price feature is
  --       added later, the only change required will be a single
  --       logAudit('session.edit_price', { oldValue:{cost:X},
  --       newValue:{cost:Y} }) call. The alert detection works.
  --     • Removing-then-re-adding would require a future migration
  --   If the feature is later deemed unnecessary, this rule can be
  --   safely dropped — no other code path depends on it.
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

  -- ── Rule 4: حذف دفعة/جلسة من غير المالك (طبيب موظف أو سكرتيرة) ──
  -- أي حذف دفعة أو جلسة ينفّذه موظف (ليس المالك) = تنبيه دائماً، قديم أو حديث.
  -- المالك مستثنى عمداً (حذفه إجراء محاسبي مشروع). whitelist صريح للأدوار
  -- الموظفة فقط حتى لا يُفلَغ المالك أو أي قيمة غير متوقعة خطأً.
  IF NEW.action_type IN ('payment.delete', 'session.delete')
     AND NEW.employee_role_snapshot IN ('doctor', 'secretary') THEN
    NEW.is_alert := TRUE;
    -- نكتب السبب فقط إن لم تكتبه قاعدة أدقّ سابقاً (مثل Rule 1 للدفعة الحديثة)
    IF NEW.alert_reason IS NULL THEN
      NEW.alert_reason :=
        (CASE WHEN NEW.action_type = 'payment.delete' THEN 'حذف دفعة' ELSE 'حذف جلسة' END)
        || ' بواسطة '
        || (CASE NEW.employee_role_snapshot
              WHEN 'doctor'    THEN 'الطبيب'
              WHEN 'secretary' THEN 'السكرتيرة'
              ELSE 'موظف'
            END);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_detect_audit_alerts ON public.audit_log;
CREATE TRIGGER trg_detect_audit_alerts
  BEFORE INSERT ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.detect_audit_alerts();
