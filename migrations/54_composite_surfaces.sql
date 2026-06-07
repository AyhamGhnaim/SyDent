-- Migration 54 — Composite surface restorations (MOD, MO, OD, MODBL…)
-- ⚠️ Take a logical snapshot FIRST (Free tier: no auto backup). This only changes
--    CHECK constraints (no data change); the new constraints are a STRICT SUPERSET
--    of the current ones, so every existing row stays valid.
-- ⚠️ RUN ORDER: snapshot → this migration → (code already deployed; composite codes
--    are only WRITTEN by the new modal chips, so running after deploy is safe too).
--
-- Why: a single restoration can span several crown surfaces (e.g. a MOD composite).
--   The current teeth_status_surface_check / ledger_sessions_surface_check allow only
--   single crown codes (O/I/B/L/M/D/V) plus the special codes. We relax both to also
--   accept canonical-ordered composite codes via a regex, while keeping every existing
--   code valid (backward-compatible).
--
-- Canonical composite pattern: ^M?[OI]?D?B?L?V?$  (order M → O/I → D → B → L → V,
--   each letter at most once → no duplicates, no reordering). This pattern also matches
--   every single crown code (O, I, B, L, M, D, V), so the old enumerated codes are a
--   subset of what the regex accepts. Special whole-tooth/crown/root codes stay in an
--   explicit IN-list. ledger_sessions keeps allowing NULL (unchanged).
--
-- Verified before writing: the live constraints enumerate exactly
--   {B,BRIDGE,CROWN_FULL,D,I,L,M,O,PONTIC,R1,R2,R3,V,WHOLE} on BOTH tables, and all
--   stored teeth_status codes are within that set → zero rows violate the new check.
--
-- Idempotent: DROP CONSTRAINT IF EXISTS before ADD → safe to re-run.
-- surface stays a pure clinical LABEL: this has ZERO financial effect (FIFO,
--   splitIsEarned, identity tests A–E never read surface).

BEGIN;

-- teeth_status (surface is NOT NULL here)
ALTER TABLE public.teeth_status   DROP CONSTRAINT IF EXISTS teeth_status_surface_check;
ALTER TABLE public.teeth_status   ADD  CONSTRAINT teeth_status_surface_check CHECK (
  (surface ~ '^M?[OI]?D?B?L?V?$' AND surface <> '')
  OR surface IN ('WHOLE','PONTIC','CROWN_FULL','BRIDGE','R1','R2','R3')
);

-- ledger_sessions (surface is NULLABLE — preserve NULL allowance)
ALTER TABLE public.ledger_sessions DROP CONSTRAINT IF EXISTS ledger_sessions_surface_check;
ALTER TABLE public.ledger_sessions ADD  CONSTRAINT ledger_sessions_surface_check CHECK (
  surface IS NULL
  OR (surface ~ '^M?[OI]?D?B?L?V?$' AND surface <> '')
  OR surface IN ('WHOLE','PONTIC','CROWN_FULL','BRIDGE','R1','R2','R3')
);

COMMIT;

-- Verify after running (expect both = the new definitions; no error on existing data):
--   SELECT conrelid::regclass::text AS tbl, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conname IN ('teeth_status_surface_check','ledger_sessions_surface_check');

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (restores the ORIGINAL enumerated constraints).
-- ⚠️ Only safe if NO composite rows exist yet. If composite codes were already saved,
--    they would violate the restored enumerated check → first run:
--      DELETE FROM teeth_status   WHERE surface ~ '^[MODBLIV]{2,}$';
--      UPDATE ledger_sessions SET surface = NULL WHERE surface ~ '^[MODBLIV]{2,}$';
--    (or convert them), THEN run the rollback below.
--
-- BEGIN;
-- ALTER TABLE public.teeth_status   DROP CONSTRAINT IF EXISTS teeth_status_surface_check;
-- ALTER TABLE public.teeth_status   ADD  CONSTRAINT teeth_status_surface_check CHECK (
--   surface = ANY (ARRAY['O','I','B','L','M','D','V','WHOLE','PONTIC','CROWN_FULL','BRIDGE','R1','R2','R3']::text[])
-- );
-- ALTER TABLE public.ledger_sessions DROP CONSTRAINT IF EXISTS ledger_sessions_surface_check;
-- ALTER TABLE public.ledger_sessions ADD  CONSTRAINT ledger_sessions_surface_check CHECK (
--   (surface IS NULL) OR
--   surface = ANY (ARRAY['O','I','B','L','M','D','V','WHOLE','PONTIC','CROWN_FULL','BRIDGE','R1','R2','R3']::text[])
-- );
-- COMMIT;
