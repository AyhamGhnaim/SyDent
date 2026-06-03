-- ============================================================
-- Migration 46 — Per-tier billing cycle (monthly + yearly prices)
-- Phase X13: decouple the billing CYCLE from the plan TIER
--            (Stripe "Product → multiple Prices" model)
-- ============================================================
-- WHAT & WHY
--   Until now each subscription_plans row carried ONE price + ONE duration, so
--   the billing cycle was baked into the plan choice (Mini=monthly, Max=yearly).
--   This migration lets each TIER (plan row) carry BOTH a monthly price and a
--   yearly price, and records the chosen cycle on the subscription itself. A
--   tier can now be billed monthly OR yearly, and the doctor picks the cycle at
--   renew/change time.
--
--   Tier codes are intentionally KEPT AS-IS ('trial'/'monthly'/'yearly' + any
--   future code) as opaque, stable identifiers — display_name is what users
--   see. We do NOT rename live billing primary keys (that would be a risky,
--   all-or-nothing operation on production subscriber rows for a purely
--   cosmetic gain). A one-line comment documents that 'monthly'/'yearly' are
--   legacy tier ids predating the cycle split.
--
-- SAFETY: idempotent, backup-first, ADDITIVE — no existing column value is ever
--   overwritten; we only ADD columns, fill the NEW columns, and backfill the
--   NEW billing_cycle. Durations stay standard in the app layer (monthly=30d,
--   yearly=365d) so no duration columns are added; trial keeps its duration_days
--   as the trial length.
-- ============================================================

-- ---- 0. Backups (first-run snapshot; re-run is a harmless no-op) ----
CREATE TABLE IF NOT EXISTS subscription_plans_backup_m46    AS SELECT * FROM subscription_plans;
CREATE TABLE IF NOT EXISTS trial_requests_backup_m46        AS SELECT * FROM trial_requests;
CREATE TABLE IF NOT EXISTS subscription_requests_backup_m46 AS SELECT * FROM subscription_requests;

-- ---- 1. New price columns on the tier catalog (nullable: NULL = that cycle
--         is not offered for this tier) ----
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS price_monthly NUMERIC;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS price_yearly  NUMERIC;

-- ---- 2. billing_cycle on the subscription + on requests (columns only;
--         CHECK added in step 7 after the enum-CHECK drop in step 6) ----
ALTER TABLE trial_requests        ADD COLUMN IF NOT EXISTS billing_cycle TEXT;
ALTER TABLE subscription_requests ADD COLUMN IF NOT EXISTS billing_cycle TEXT;

-- ---- 3. Backfill cycle prices from the existing single price ----
-- A tier whose current period is ~a year (>=182d) had a YEARLY price; one whose
-- period is short (<182d) had a MONTHLY price. trial is free on both cycles.
UPDATE subscription_plans
   SET price_yearly = price
 WHERE price_yearly IS NULL AND code <> 'trial'
   AND duration_days IS NOT NULL AND duration_days >= 182;

UPDATE subscription_plans
   SET price_monthly = price
 WHERE price_monthly IS NULL AND code <> 'trial'
   AND (duration_days IS NULL OR duration_days < 182);

UPDATE subscription_plans
   SET price_monthly = COALESCE(price_monthly, 0),
       price_yearly  = COALESCE(price_yearly,  0)
 WHERE code = 'trial';

-- ---- 4. Backfill billing_cycle on existing subscriptions ----
-- Active, non-permanent paid subscribers: infer the cycle from their tier's
-- period (permanent rows have trial_end IS NULL and stay cycle-less).
UPDATE trial_requests tr
   SET billing_cycle = CASE WHEN sp.duration_days IS NOT NULL AND sp.duration_days >= 182
                            THEN 'yearly' ELSE 'monthly' END
  FROM subscription_plans sp
 WHERE sp.code = tr.plan
   AND tr.billing_cycle IS NULL
   AND tr.plan <> 'trial'
   AND tr.status = 'accepted'
   AND tr.trial_end IS NOT NULL;

-- Pending upgrade/renew requests: infer the requested cycle the same way.
UPDATE subscription_requests sr
   SET billing_cycle = CASE WHEN sp.duration_days IS NOT NULL AND sp.duration_days >= 182
                            THEN 'yearly' ELSE 'monthly' END
  FROM subscription_plans sp
 WHERE sp.code = sr.requested_plan
   AND sr.billing_cycle IS NULL
   AND sr.requested_plan <> 'trial';

-- ---- 5. (reserved) ----

-- ---- 6. Drop enumerated CHECKs on tier codes (enable dynamic tiers) ----
-- Any CHECK still pinning code/plan to the literal set ('trial','monthly',
-- 'yearly') would block adding a NEW tier. Drop only those (def mentions all
-- three literals) — never the new billing_cycle CHECK (def has no 'trial').
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT con.conname, rel.relname
      FROM pg_constraint con
      JOIN pg_class rel     ON rel.oid = con.conrelid
      JOIN pg_namespace ns  ON ns.oid  = rel.relnamespace
     WHERE con.contype = 'c'
       AND ns.nspname  = 'public'
       AND rel.relname IN ('subscription_plans','trial_requests')
       AND pg_get_constraintdef(con.oid) LIKE '%trial%'
       AND pg_get_constraintdef(con.oid) LIKE '%monthly%'
       AND pg_get_constraintdef(con.oid) LIKE '%yearly%'
       AND pg_get_constraintdef(con.oid) NOT LIKE '%billing_cycle%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', r.relname, r.conname);
    RAISE NOTICE 'Migration 46: dropped enumerated CHECK % on %', r.conname, r.relname;
  END LOOP;
END $$;

-- ---- 7. Add billing_cycle CHECK (nullable; only monthly/yearly when set) ----
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trial_requests_billing_cycle_chk') THEN
    ALTER TABLE trial_requests ADD CONSTRAINT trial_requests_billing_cycle_chk
      CHECK (billing_cycle IS NULL OR billing_cycle IN ('monthly','yearly'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscription_requests_billing_cycle_chk') THEN
    ALTER TABLE subscription_requests ADD CONSTRAINT subscription_requests_billing_cycle_chk
      CHECK (billing_cycle IS NULL OR billing_cycle IN ('monthly','yearly'));
  END IF;
END $$;

-- ---- 8. Verification (run manually after) ----
-- SELECT code, display_name, price, price_monthly, price_yearly, duration_days, is_active
--   FROM subscription_plans ORDER BY sort_order;
-- SELECT plan, billing_cycle, status, count(*)
--   FROM trial_requests GROUP BY 1,2,3 ORDER BY 1,2,3;
-- SELECT requested_plan, billing_cycle, status, count(*)
--   FROM subscription_requests GROUP BY 1,2,3 ORDER BY 1,2,3;
