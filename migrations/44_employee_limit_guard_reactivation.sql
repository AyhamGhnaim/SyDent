-- ============================================================================
-- ⚠️  WARNING: this REPLACES enforce_employee_limit() AND REBINDS its trigger to
--     also fire on UPDATE. Run manually in Supabase SQL Editor (production).
-- ============================================================================
-- Migration 44 — Close the re-activation bypass.
--
-- Migration 43 fixed the COUNT (active + owner-excluded) but the trigger was
-- bound BEFORE INSERT only. Re-activating a deactivated employee
-- (is_active false -> true) is an UPDATE, so it bypassed the seat limit: a
-- clinic could downgrade to Mini (1 seat), then re-activate several staff.
--
-- Fix: enforce on INSERT OR UPDATE, but ONLY when the operation actually
-- CONSUMES a seat — i.e. the NEW row counts (active, non-owner) AND it was not
-- already counting (INSERT, or an UPDATE flipping a non-counting row to
-- counting: reactivation, or role owner->staff). Benign edits (name/color/pin)
-- on an already-counting row, deactivations, and owner rows never trip the
-- limit. Legacy over-limit clinics can still edit/deactivate; they just cannot
-- add or re-activate beyond the limit. Threshold stays `> v_limit` (the NEW
-- counting row is included in v_count).
--
-- Idempotent (CREATE OR REPLACE + DROP TRIGGER IF EXISTS). No table structure
-- touched.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_employee_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_plan text; v_limit integer; v_count integer;
  new_counts boolean; old_counts boolean;
BEGIN
  -- Does the NEW row consume a seat? (active AND not the owner)
  new_counts := (NEW.is_active IS NOT FALSE) AND (COALESCE(NEW.role, '') <> 'owner');
  IF NOT new_counts THEN
    RETURN NEW;  -- deactivating / owner row → never blocked
  END IF;

  -- On UPDATE, if the row ALREADY counted, this op adds no seat → allow
  -- (benign edit on an already-active staff row).
  IF TG_OP = 'UPDATE' THEN
    old_counts := (OLD.is_active IS NOT FALSE) AND (COALESCE(OLD.role, '') <> 'owner');
    IF old_counts THEN
      RETURN NEW;
    END IF;
  END IF;

  -- This op consumes a NEW seat (INSERT of a counting row, or a flip to
  -- counting) → enforce the plan limit.
  SELECT plan INTO v_plan FROM trial_requests WHERE user_id = NEW.owner_id LIMIT 1;
  IF v_plan IS NULL THEN RETURN NEW; END IF;
  SELECT max_employees INTO v_limit FROM subscription_plans WHERE code = v_plan;
  IF v_limit IS NULL THEN RETURN NEW; END IF;

  SELECT count(*) INTO v_count
  FROM clinic_employees
  WHERE owner_id = NEW.owner_id
    AND is_active IS NOT FALSE
    AND COALESCE(role, '') <> 'owner'
    AND id <> NEW.id;
  v_count := v_count + 1;  -- include the NEW counting row

  IF v_count > v_limit THEN
    RAISE EXCEPTION 'PLAN_LIMIT_EMPLOYEES: reached plan limit of % employees', v_limit
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $function$;

-- Rebind the trigger: fire on INSERT and UPDATE (was INSERT only).
DROP TRIGGER IF EXISTS trg_enforce_employee_limit ON public.clinic_employees;
CREATE TRIGGER trg_enforce_employee_limit
  BEFORE INSERT OR UPDATE ON public.clinic_employees
  FOR EACH ROW EXECUTE FUNCTION public.enforce_employee_limit();
