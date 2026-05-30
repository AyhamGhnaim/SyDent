-- ⚠️ WARNING — DATA migration on PRODUCTION. Take a logical snapshot FIRST (Free tier: no auto backup).
-- ⚠️ RUN ORDER: snapshot  →  this migration  →  deploy occlusal-view code. Do NOT deploy the code before this runs.
--
-- Why: the facial cervical/gingival zone was stored as surface code 'L' (labelled "لثوي").
--   That is wrong — under the FDI / Universal standard 'L' MUST mean Lingual (لساني), and the
--   teeth_status_surface_check constraint already allows BOTH 'L' and 'V'. The schema was always
--   meant to use 'L' = lingual and 'V' = cervical (عنقي); the app code mis-used 'L' for the
--   cervical zone. The new occlusal view records the true lingual surface as 'L'.
--   So we recode the existing cervical data 'L' -> 'V' (cervical), which frees 'L' for lingual.
--   UI keeps showing "لثوي" for code 'V' (label-only); this corrects CODES, not positions.
--
-- Safe: 'V' is ALREADY permitted by teeth_status_surface_check (no schema/constraint change needed).
--   teeth_status unique key is (doctor_id,patient_id,tooth_num,surface); no 'V' rows exist yet, so
--   renaming 'L'->'V' cannot collide.
-- Scope: every LIVE table that stores a per-surface code. audit_log is intentionally NOT touched
--   (immutable historical snapshots).
-- Defensive: each UPDATE is guarded by a column-existence check so it cannot fail if a column is absent.
-- NOTE: if ledger_sessions / lab_orders carry their OWN surface CHECK constraint, confirm it permits
--   'V' before running (it should -- same schema design). Verify with:
--     SELECT conrelid::regclass::text tbl, conname, pg_get_constraintdef(oid)
--     FROM pg_constraint WHERE contype='c' AND pg_get_constraintdef(oid) ILIKE '%surface%';

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'teeth_status' AND column_name = 'surface') THEN
    UPDATE teeth_status    SET surface = 'V' WHERE surface = 'L';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'ledger_sessions' AND column_name = 'surface') THEN
    UPDATE ledger_sessions SET surface = 'V' WHERE surface = 'L';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'lab_orders' AND column_name = 'surface') THEN
    UPDATE lab_orders      SET surface = 'V' WHERE surface = 'L';
  END IF;
END $$;

COMMIT;

-- Verify after running (expect: NO rows with surface='L' until dentists record new lingual entries):
--   SELECT surface, count(*) FROM teeth_status    GROUP BY surface ORDER BY surface;
--   SELECT surface, count(*) FROM ledger_sessions WHERE surface IS NOT NULL GROUP BY surface;
--   SELECT surface, count(*) FROM lab_orders      WHERE surface IS NOT NULL GROUP BY surface;
