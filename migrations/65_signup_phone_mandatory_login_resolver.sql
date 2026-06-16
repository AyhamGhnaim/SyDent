-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ Migration 65 — Phone-mandatory signup + dual-identifier login resolver   ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- PROBLEM
--   Self-signup (auth.html) used ONE "phone OR email" field. An email-only
--   signup left trial_requests.phone NULL, so the admin had no number to reach
--   the trader on WhatsApp (welcome / reminder / renewal). There was also no way
--   to register BOTH a phone and an email, nor to log in with either one.
--
-- DECISION (most future-proof, agreed)
--   • Phone is MANDATORY on every new signup (guarantees an admin contact).
--   • Email is OPTIONAL.
--   • Canonical auth identifier (auth.users.email) =
--         the REAL email when one is given, else the synthesized {digits}@sydent.com.
--     This keeps the email-as-identifier path (native Supabase reset/recovery,
--     templates #04/#05) for anyone who supplies an email, and only falls back to
--     the phone-synthesized identifier for phone-only accounts. We NEVER mutate an
--     existing identifier (rule #62) — legacy rows are untouched.
--   • Login accepts EITHER the phone or the email; resolve_login_email() maps the
--     entered value → the account's canonical auth email, then the client signs in.
--
-- WHY A RESOLVER (and not trust trial_requests.email blindly)
--   Production audit (16 Jun 2026) showed trial_requests.email and auth.users.email
--   can disagree for some legacy rows (5 "synthesized-in-trial" vs 3 "synthesized-
--   in-auth"). The AUTHORITATIVE canonical is auth.users.email, reached via
--   trial_requests.user_id. The resolver therefore resolves through user_id.
--
-- ANTI-ENUMERATION
--   resolve_login_email() ALWAYS returns a string and never raises on "not found".
--   A non-existent phone returns the synthesized {digits}@sydent.com — i.e. identical
--   in shape to a phone-only account — so phone-only accounts are indistinguishable
--   from non-existent ones. (Residual, by design: a phone that belongs to a phone+
--   email account resolves to that real email — unavoidable for client-side phone
--   login into an email-identified account. Acceptable for this user base; can be
--   moved server-side to an Edge Function later if ever desired.)
--
-- PRE-FLIGHT (live, 16 Jun 2026, Supabase SQL Editor — all clean)
--   A dup active phones = 0  •  B dup active emails = 0
--   C phone_only=0 email_only=1 phone_and_email=5 total=6
--   D synthesized=3 real_email=4 total=7
--
-- IDEMPOTENT — safe to re-run.
--
-- ════════════════════════════════════════════════════════════════════════════

-- STEP 1 — Defensive abort if duplicate ACTIVE phones/emails exist
--          (should be none per pre-flight; protects the unique indexes below).
DO $$
DECLARE v_dup_phone INT; v_dup_email INT;
BEGIN
  SELECT COUNT(*) INTO v_dup_phone FROM (
    SELECT regexp_replace(phone,'\D','','g') AS p
    FROM public.trial_requests
    WHERE phone IS NOT NULL AND phone <> '' AND status <> 'rejected'
    GROUP BY 1 HAVING COUNT(*) > 1
  ) x;
  IF v_dup_phone > 0 THEN
    RAISE EXCEPTION 'Abort: % duplicate active phone(s) found — resolve before applying Migration 65', v_dup_phone;
  END IF;

  SELECT COUNT(*) INTO v_dup_email FROM (
    SELECT lower(btrim(email)) AS e
    FROM public.trial_requests
    WHERE email IS NOT NULL AND email <> '' AND status <> 'rejected'
    GROUP BY 1 HAVING COUNT(*) > 1
  ) y;
  IF v_dup_email > 0 THEN
    RAISE EXCEPTION 'Abort: % duplicate active email(s) found — resolve before applying Migration 65', v_dup_email;
  END IF;
END$$;

-- STEP 2 — Partial UNIQUE index on the NORMALIZED phone (active accounts only).
--          Makes phone → user_id deterministic for the resolver; lets a rejected
--          applicant re-register with the same number.
CREATE UNIQUE INDEX IF NOT EXISTS trial_requests_phone_norm_active_uidx
  ON public.trial_requests (regexp_replace(phone,'\D','','g'))
  WHERE phone IS NOT NULL AND phone <> '' AND status <> 'rejected';

-- STEP 3 — Partial UNIQUE index on the NORMALIZED email (active accounts only).
--          Data hygiene; auth.users.email is already globally unique at the auth layer.
CREATE UNIQUE INDEX IF NOT EXISTS trial_requests_email_norm_active_uidx
  ON public.trial_requests (lower(btrim(email)))
  WHERE email IS NOT NULL AND email <> '' AND status <> 'rejected';

-- STEP 4 — The login resolver. SECURITY DEFINER (reads auth.users + the otherwise
--          self-only trial_requests), STABLE, locked search_path (rule #42 pattern).
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

    SELECT user_id INTO v_uid
    FROM public.trial_requests
    WHERE phone IS NOT NULL
      AND regexp_replace(phone,'\D','','g') = v_digits
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

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFICATION (run after applying)
--   SELECT public.resolve_login_email('0991234567');          -- a known phone
--   SELECT public.resolve_login_email('doctor@example.com');   -- a known email
--   SELECT public.resolve_login_email('0000000000');           -- unknown → @sydent.com
--   \d+ public.trial_requests   -- confirm the two partial unique indexes exist
-- ════════════════════════════════════════════════════════════════════════════
