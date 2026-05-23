-- =====================================================
-- Migration 24 — Phase 7.6F orphan trial_requests cleanup
-- =====================================================
-- Context: pre-Phase-7.6F the landing.html form created trial_requests
-- with no auth.users link (user_id IS NULL). These rows cannot be
-- activated under the new self-signup flow (admin.html accept() now
-- rejects rows without user_id with a clear message).
--
-- This migration:
--   1) Snapshots the orphan rows into a backup table (for forensics)
--   2) Deletes orphan rows in 'new' status (the safe class — never approved)
--   3) Leaves orphan rows in 'accepted'/'rejected'/'suspended' alone
--      (these have audit history — manual decision required)
--
-- Run order: AFTER deploying the Phase 7.6F code (landing.html, auth.html,
-- admin.html, pending.html, supabase-init.js). The new auth.html will
-- create proper rows with user_id; this migration only cleans the legacy.
--
-- Safety: ON CONFLICT DO NOTHING on the backup INSERT means the migration
-- is idempotent (re-running won't double-create the backup).

-- =====================================================
-- Step 1: Backup the orphan rows we're about to delete
-- =====================================================
CREATE TABLE IF NOT EXISTS trial_requests_orphan_backup_phase76f (
  id           UUID PRIMARY KEY,
  name         TEXT,
  phone        TEXT,
  email        TEXT,
  city         TEXT,
  notes        TEXT,
  status       TEXT,
  user_id      UUID,
  trial_end    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ,
  archived_at  TIMESTAMPTZ DEFAULT now()
);

INSERT INTO trial_requests_orphan_backup_phase76f
  (id, name, phone, email, city, notes, status, user_id, trial_end, created_at)
SELECT id, name, phone, email, city, notes, status, user_id, trial_end, created_at
FROM trial_requests
WHERE user_id IS NULL
  AND status = 'new'
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- Step 2: Inspect before deletion (run this manually first)
-- =====================================================
-- Uncomment to inspect rows that will be deleted:
--   SELECT id, name, phone, email, city, status, created_at
--   FROM trial_requests WHERE user_id IS NULL AND status = 'new'
--   ORDER BY created_at DESC;

-- =====================================================
-- Step 3: Delete the orphans
-- =====================================================
DELETE FROM trial_requests
WHERE user_id IS NULL
  AND status = 'new';

-- =====================================================
-- Step 4: Verification (expect 0 rows)
-- =====================================================
-- After running the migration, verify with:
--   SELECT COUNT(*) FROM trial_requests WHERE user_id IS NULL AND status = 'new';
-- Expected: 0
--
-- Also check the backup:
--   SELECT COUNT(*), MIN(archived_at) FROM trial_requests_orphan_backup_phase76f;
-- Expected: matches the row count deleted above, archived_at = now()
--
-- Non-'new' orphan rows (if any) are kept — they have audit history. Inspect:
--   SELECT id, name, status, created_at FROM trial_requests
--   WHERE user_id IS NULL ORDER BY status, created_at DESC;
