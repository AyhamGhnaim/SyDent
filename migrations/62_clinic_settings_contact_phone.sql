-- Migration 62 — optional extra contact phone for clinics
--
-- Adds a second, NON-WhatsApp contact line that a clinic owner can set in
-- Settings (المعلومات الشخصية → "رقم اتصال إضافي"), for doctors who keep a
-- separate phone that has no WhatsApp.
--
-- Purely additive: nullable, no default, idempotent. Does NOT touch the
-- WhatsApp number (clinic_settings.clinic_phone) or any reminder / billing
-- logic. No RLS change is required:
--   • the clinic owner already has write access to their own clinic_settings
--     row (same path the WhatsApp reminder settings use), and
--   • the platform admin already reads clinic_settings via the existing admin
--     SELECT policy (Migration 31) and shows this value as a display-only row.
--
-- Safe to run before or after the matching admin.html / settings.html deploy:
-- both read it through a graceful 42703 retry that falls back to the core
-- columns when this column is not yet present.

ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS contact_phone text;
