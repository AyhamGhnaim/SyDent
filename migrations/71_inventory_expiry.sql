-- ============================================================
-- Migration 71: Inventory expiry tracking
-- Additive, nullable, idempotent. Inherits inventory_items RLS.
-- ============================================================
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS expiry_date DATE;
