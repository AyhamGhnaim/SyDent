-- ============================================================================
-- ⚠️  WARNING: this REPLACES the production function enforce_employee_limit().
--     Applied manually in Supabase SQL Editor on 01 Jun 2026 (Success).
-- ============================================================================
-- Migration 43 — Employee limit counts ACTIVE staff only, OWNER EXCLUDED.
--
-- Before (Migration 36): SELECT count(*) FROM clinic_employees WHERE owner_id=...
--   → counted EVERY row, including the owner's own row and deactivated staff.
--   Consequences: (a) on a 1-seat plan the owner alone hit the limit, so the
--   clinic could not add even its first staff member; (b) deactivating a staff
--   member did NOT free a seat (only deletion did).
--
-- Decision (platform owner): the owner never consumes a seat, and a seat is a
-- live (active) staff member. Deactivation (is_active=false) frees a seat and is
-- reversible — matching the seat-based model of MS 365 / Google Workspace /
-- Slack / Dentrix, and consistent with the downgrade guard in transitionAccount
-- (admin.html) and the request guard in subscription.html.
--
-- New count = active (is_active IS NOT FALSE) AND non-owner (role <> 'owner',
-- null role still counted). The row being mutated is excluded (id <> NEW.id)
-- and re-added only if it would itself count, so UPDATEs don't double-count.
-- Threshold is now `> v_limit` (the candidate row is included in v_count), so a
-- 1-seat plan correctly allows owner + 1 active staff.
--
-- Idempotent (CREATE OR REPLACE). No table structure touched. The trigger
-- binding (trg_enforce_employee_limit on clinic_employees, BEFORE INSERT/UPDATE)
-- is unchanged and keeps pointing at this function.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_employee_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_plan text; v_limit integer; v_count integer;
BEGIN
  SELECT plan INTO v_plan FROM trial_requests WHERE user_id = NEW.owner_id LIMIT 1;
  IF v_plan IS NULL THEN RETURN NEW; END IF;
  SELECT max_employees INTO v_limit FROM subscription_plans WHERE code = v_plan;
  IF v_limit IS NULL THEN RETURN NEW; END IF;

  -- Active, non-owner staff EXCLUDING the row being mutated.
  SELECT count(*) INTO v_count
  FROM clinic_employees
  WHERE owner_id = NEW.owner_id
    AND is_active IS NOT FALSE
    AND COALESCE(role, '') <> 'owner'
    AND id <> NEW.id;

  -- Include the candidate row only if it would itself count toward the limit.
  IF (NEW.is_active IS NOT FALSE) AND (COALESCE(NEW.role, '') <> 'owner') THEN
    v_count := v_count + 1;
  END IF;

  IF v_count > v_limit THEN
    RAISE EXCEPTION 'PLAN_LIMIT_EMPLOYEES: reached plan limit of % employees', v_limit
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $function$;
