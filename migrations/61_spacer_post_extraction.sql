-- Migration 61 — Space-maintainer chart support + doctor-controlled post-extraction options
-- ⚠️ Take a logical snapshot FIRST (Free tier: no auto backup).
-- ⚠️ RUN ORDER: snapshot → this migration → deploy already live is SAFE: the new
--    client code gates every new behavior on detecting the post_extraction column
--    (window.__m61), so pre-migration the UI behaves exactly as before.
--
-- Section A — 'SPACER' surface value (chart rows for حافظ مسافة units).
--   Strict SUPERSET of Migration 54's constraints: every existing row stays valid.
--   teeth_status rows: surface='SPACER' on the gap teeth + both abutments of a unit.
--   ledger_sessions rows: surface='SPACER' labels the spacer session.
--   surface stays a pure clinical LABEL: ZERO financial effect (FIFO, splitIsEarned,
--   identity tests A–E never read surface).
--
-- Section B — treatments.post_extraction (boolean, default false).
--   When true, the treatment appears as an option in the extracted-tooth modal
--   (e.g. ضماد سنخ، طعم عظمي). bridge/implant/space-maintainer don't need the flag
--   (matched by target_part / key+name in code).
--
-- Idempotent: DROP CONSTRAINT IF EXISTS + ADD COLUMN IF NOT EXISTS → safe to re-run.

BEGIN;

-- ── Section A: surface constraints (M54 pattern + 'SPACER') ──
ALTER TABLE public.teeth_status   DROP CONSTRAINT IF EXISTS teeth_status_surface_check;
ALTER TABLE public.teeth_status   ADD  CONSTRAINT teeth_status_surface_check CHECK (
  (surface ~ '^M?[OI]?D?B?L?V?$' AND surface <> '')
  OR surface IN ('WHOLE','PONTIC','CROWN_FULL','BRIDGE','SPACER','R1','R2','R3')
);

ALTER TABLE public.ledger_sessions DROP CONSTRAINT IF EXISTS ledger_sessions_surface_check;
ALTER TABLE public.ledger_sessions ADD  CONSTRAINT ledger_sessions_surface_check CHECK (
  surface IS NULL
  OR (surface ~ '^M?[OI]?D?B?L?V?$' AND surface <> '')
  OR surface IN ('WHOLE','PONTIC','CROWN_FULL','BRIDGE','SPACER','R1','R2','R3')
);

-- ── Section B: doctor-controlled post-extraction option flag ──
ALTER TABLE public.treatments
  ADD COLUMN IF NOT EXISTS post_extraction boolean NOT NULL DEFAULT false;

COMMIT;

-- Verify after running:
--   SELECT conrelid::regclass::text AS tbl, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conname IN ('teeth_status_surface_check','ledger_sessions_surface_check');
--   SELECT column_name, data_type, column_default FROM information_schema.columns
--   WHERE table_name='treatments' AND column_name='post_extraction';
