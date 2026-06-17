-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ Migration 67 — Format-agnostic phone matching (normalize_phone)          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- PROBLEM
--   Signup stores the phone exactly as typed (e.g. "0991234567"). If a tenant
--   later logs in with a different but equivalent format ("+963991234567",
--   "00963991234567"), the raw-digit comparison in resolve_login_email() (and the
--   raw-digit unique index from Migration 65) treats them as different numbers, so
--   the row isn't found and login falls back / fails. Pre-existing; widened the
--   moment phone became the primary identifier.
--
-- FIX (Rule #62-safe — NEVER mutates any stored identifier)
--   Normalization happens ONLY in (a) the resolver's phone COMPARISON and (b) the
--   phone UNIQUE INDEX — NOT in how the synthesized {digits}@sydent.com identifier
--   is built. So:
--     • Existing accounts keep their exact auth.users.email (synthesized or real);
--       the resolver still returns the STORED email, just finds the row regardless
--       of the format typed.
--     • The synthesized-email fallback (non-existent accounts only) is unchanged.
--   normalize_phone() collapses the common Syrian variants to one canonical national
--   number (drop "00", then "963", then a trunk "0"):
--       0991234567      -> 991234567
--       963991234567    -> 991234567
--       +963 99 123 4567-> 991234567
--       00963991234567  -> 991234567
--
-- WHY THE INDEX MUST CHANGE TOO
--   If only the resolver normalized, two active rows that are distinct under raw
--   digits ("0991234567" vs "963991234567") but identical under normalization could
--   coexist, making the resolver's phone lookup AMBIGUOUS. Moving the unique index
--   onto normalize_phone() guarantees one active account per canonical number, so
--   the lookup stays deterministic.
--
-- IDEMPOTENT — safe to re-run.
--
-- ════════════════════════════════════════════════════════════════════════════

-- STEP 1 — IMMUTABLE canonicalizer (required for the expression index).
CREATE OR REPLACE FUNCTION public.normalize_phone(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(                                   -- 4) drop trunk leading 0
           regexp_replace(                                 -- 3) drop Syria country code 963
             regexp_replace(                               -- 2) drop intl 00 prefix
               regexp_replace(coalesce(p,''), '\D', '', 'g'), -- 1) keep digits only
               '^00', ''),
             '^963', ''),
           '^0', '')
$$;

-- STEP 2 — Pre-flight: abort if any ACTIVE rows collide under normalization.
--          (Migration 65 confirmed no raw-digit dups; this catches cross-format dups
--           like 0991234567 vs 963991234567 belonging to different accounts.)
DO $$
DECLARE v_dup INT;
BEGIN
  SELECT COUNT(*) INTO v_dup FROM (
    SELECT public.normalize_phone(phone) AS np
    FROM public.trial_requests
    WHERE phone IS NOT NULL AND phone <> '' AND status <> 'rejected'
    GROUP BY 1 HAVING COUNT(*) > 1
  ) x;
  IF v_dup > 0 THEN
    RAISE EXCEPTION 'Abort: % cross-format duplicate phone(s) found — resolve before applying Migration 67', v_dup;
  END IF;
END$$;

-- STEP 3 — Swap the phone unique index from raw digits to the canonical form.
DROP INDEX IF EXISTS public.trial_requests_phone_norm_active_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS trial_requests_phone_canon_active_uidx
  ON public.trial_requests (public.normalize_phone(phone))
  WHERE phone IS NOT NULL AND phone <> '' AND status <> 'rejected';

-- STEP 4 — Replace the resolver: phone comparison now normalizes BOTH sides.
--          Everything else is byte-identical to Migration 65.
CREATE OR REPLACE FUNCTION public.resolve_login_email(p_input text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_in     text := btrim(coalesce(p_input, ''));
  v_digits text;
  v_uid    uuid;
  v_email  text;
BEGIN
  IF v_in = '' THEN
    RETURN v_in;
  END IF;

  -- ── Phone-shaped input: digits + optional separators, and no '@' ──────────
  IF position('@' in v_in) = 0 AND v_in ~ '^[0-9+()\-\s]+$' THEN
    v_digits := regexp_replace(v_in, '\D', '', 'g');
    IF length(v_digits) = 0 THEN
      RETURN v_in;
    END IF;

    -- Format-agnostic match (Migration 67): normalize both stored + entered phone.
    SELECT user_id INTO v_uid
    FROM public.trial_requests
    WHERE phone IS NOT NULL
      AND public.normalize_phone(phone) = public.normalize_phone(v_in)
      AND status <> 'rejected'
      AND user_id IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_uid IS NOT NULL THEN
      SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
      IF v_email IS NOT NULL AND v_email <> '' THEN
        RETURN v_email;
      END IF;
    END IF;

    -- Fallback: synthesized identifier (anti-enumeration; signIn fails generically
    -- afterwards if the account does not actually exist).
    RETURN v_digits || '@sydent.com';
  END IF;

  -- ── Email-shaped input: authoritative canonical via auth.users ────────────
  v_email := lower(v_in);

  PERFORM 1 FROM auth.users WHERE lower(email) = v_email;
  IF FOUND THEN
    RETURN v_email;
  END IF;

  -- Indirect: trial_requests.email → user_id → auth.users.email
  -- (covers legacy rows where the two stores disagree).
  SELECT user_id INTO v_uid
  FROM public.trial_requests
  WHERE email IS NOT NULL
    AND lower(btrim(email)) = v_email
    AND status <> 'rejected'
    AND user_id IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_uid IS NOT NULL THEN
    SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
    IF v_email IS NOT NULL AND v_email <> '' THEN
      RETURN v_email;
    END IF;
  END IF;

  -- Fallback: echo the lowercased input (signIn fails generically if not real).
  RETURN lower(v_in);
END$$;

GRANT EXECUTE ON FUNCTION public.resolve_login_email(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_phone(text)      TO anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFICATION (run after applying)
--   SELECT public.normalize_phone('0991234567'),
--          public.normalize_phone('+963 99 123 4567'),
--          public.normalize_phone('00963991234567');     -- all → 991234567
--   -- For a real phone account, every format should resolve to the same email:
--   SELECT public.resolve_login_email('0991234567');
--   SELECT public.resolve_login_email('963991234567');
--   SELECT indexname FROM pg_indexes
--    WHERE tablename='trial_requests' AND indexname LIKE 'trial_requests_phone%';
--   -- Expect ONLY trial_requests_phone_canon_active_uidx (old _norm_ dropped).
-- ════════════════════════════════════════════════════════════════════════════
