-- ============================================================
-- Migration 72: Inventory batches (per-shipment expiry / FEFO)
-- Auxiliary display/alert layer. Does NOT touch quantity logic.
-- Additive + idempotent. Mirrors inventory_items RLS pattern.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.inventory_batches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id     UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  quantity    NUMERIC,
  expiry_date DATE,
  note        TEXT,
  is_finished BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "batch_owner_all" ON public.inventory_batches;
CREATE POLICY "batch_owner_all" ON public.inventory_batches
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_inv_batches_item
  ON public.inventory_batches(owner_id, item_id, is_finished);

-- Migrate legacy item-level expiry (Migration 71) into batches — one-time, re-run safe
INSERT INTO public.inventory_batches (owner_id, item_id, quantity, expiry_date)
SELECT i.owner_id, i.id, i.quantity, i.expiry_date
FROM public.inventory_items i
WHERE i.expiry_date IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.inventory_batches b WHERE b.item_id = i.id);
