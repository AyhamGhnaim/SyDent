-- ============================================================================
-- Migration 16+17 — Expenses Foundation
-- ============================================================================
-- Phase 7.1. Two tables that anchor the accounting system:
--
--   expense_categories  : owner-managed labels (مواد سنية، إيجار، كهرباء…)
--                         that group expense rows. Mutable so the Owner can
--                         add/rename/disable categories without the developer
--                         touching schema again.
--
--   expenses            : individual expense rows, each tagged with one
--                         category. Amount in ل.س as BIGINT (no decimals —
--                         consistent with the rest of SyDent's monetary
--                         handling). Date is the EFFECTIVE date of the
--                         expense (when it was incurred, used by reports).
--
-- The two are independent of payroll and lab costs. Phase 7.2 + 7.3 add
-- payroll_periods + lab_orders.clinic_cost separately. accounting.html
-- (Phase 7.5) aggregates all four sources into a single P&L view.
--
-- No expense_categories bootstrap row is inserted here — the application
-- bootstraps a default set on first page load (so each clinic can disable
-- categories they don't use without a migration touching their data).
-- ============================================================================

-- ───── expense_categories ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.expense_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,                      -- "مواد سنية"، "إيجار"…
  icon        TEXT,                                -- emoji (🦷، 🏢…)
  color       TEXT,                                -- hex (#aabbcc) for charts
  sort_order  INT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "expense_categories_owner_all" ON public.expense_categories;
CREATE POLICY "expense_categories_owner_all" ON public.expense_categories
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_expense_categories_owner_sort
  ON public.expense_categories(owner_id, sort_order, name);

-- ───── expenses ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.expenses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date            DATE NOT NULL DEFAULT CURRENT_DATE,
  category_id     UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  -- ON DELETE SET NULL on category: if a category is deleted, expenses keep
  -- their amount + date but become "uncategorized". The accounting page
  -- shows them under a fallback bucket. The Owner can re-tag them later.
  amount          BIGINT NOT NULL CHECK (amount >= 0),
  vendor          TEXT,                            -- اسم المورّد/المتجر
  description     TEXT,                            -- وصف موجز
  payment_method  TEXT,                            -- 'cash' | 'bank' | 'check'
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "expenses_owner_all" ON public.expenses;
CREATE POLICY "expenses_owner_all" ON public.expenses
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_expenses_owner_date
  ON public.expenses(owner_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_category_date
  ON public.expenses(category_id, date DESC);

-- ───── updated_at triggers ────────────────────────────────────────────────
-- Reuses the standard update_updated_at_column() function defined in earlier
-- migrations. If it doesn't exist (pre-Migration-5 clinics), create a local
-- definition. Idempotent: CREATE OR REPLACE.
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_expense_categories_updated_at ON public.expense_categories;
CREATE TRIGGER trg_expense_categories_updated_at
  BEFORE UPDATE ON public.expense_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_expenses_updated_at ON public.expenses;
CREATE TRIGGER trg_expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Smoke test:
--   SELECT COUNT(*) FROM expense_categories;
--   SELECT COUNT(*) FROM expenses;
