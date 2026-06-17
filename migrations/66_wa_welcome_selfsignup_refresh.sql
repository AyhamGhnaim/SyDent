-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ Migration 66 — Refresh wa_welcome template for the self-signup model     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
--
-- WHY
--   The wa_welcome WhatsApp template dates from the OLD "admin provisions the
--   account" flow. It still told accepted tenants:
--       👤 البريد: {email}
--       🔑 كلمة المرور: 0000
--   Under the current SELF-SIGNUP model (rule #35) the tenant chooses their OWN
--   identifier (phone and/or email) and their OWN password at registration; the
--   admin only flips status to 'accepted'. So:
--     • "كلمة المرور: 0000" is simply wrong — there is no default password.
--     • {email} resolves to the synthesized {phone}@sydent.com for phone-only
--       accounts (their internal identifier, which they never type — they log in
--       by phone). Misleading.
--   After Migration 65 (phone-mandatory + optional real email + dual-identifier
--   login), the correct guidance for EVERY account type is simply: "log in with
--   the phone or email you registered, using the password you chose."
--
-- WHAT
--   Rewrite the wa_welcome body to that guidance. Drops the {email} and the
--   "0000" lines; adds a forgot-password pointer. Keeps {name}, {login_url},
--   {support_phone}. The `variables` jsonb array is left as-is (an admin may
--   still insert {email} manually if they wish — harmless).
--
-- STRATEGY — CONDITIONAL UPDATE (same pattern as Migration 33.1)
--   The WHERE clause matches the EXACT current (post-33.1) body. Therefore:
--     • If an admin already customized the body via the UI → WHERE won't match
--       → no-op (admin edits respected).
--     • Re-running this migration → body is already the new text → WHERE won't
--       match → no-op (idempotent).
--
-- PAIRED WITH
--   admin.html FALLBACK_TEMPLATES.wa_welcome — updated to the byte-identical
--   string in the same commit, so a DB-down render equals a DB-up render.
--
-- ════════════════════════════════════════════════════════════════════════════

UPDATE public.notification_templates
SET body =
      E'مرحباً د. {name}،\nتم قبول طلبك في SyDent 🦷\n\n' ||
      E'يمكنك الآن تسجيل الدخول من:\n' ||
      E'🔗 {login_url}\n\n' ||
      E'سجّل الدخول برقم موبايلك أو بريدك الإلكتروني الذي سجّلت به، مع كلمة المرور التي اخترتها عند إنشاء الحساب.\n\n' ||
      E'🔑 نسيت كلمة المرور؟ اضغط "نسيت كلمة المرور؟" في صفحة الدخول.\n\n' ||
      E'📞 للدعم الفني: {support_phone}\n\n' ||
      E'شكراً لاختيارك SyDent!'
WHERE code = 'wa_welcome'
  AND body = E'مرحباً د. {name}،\nتم قبول طلبك في SyDent 🦷\n\n' ||
             E'بيانات الدخول:\n' ||
             E'🔗 الرابط: {login_url}\n' ||
             E'👤 البريد: {email}\n' ||
             E'🔑 كلمة المرور: 0000\n\n' ||
             E'⚠️ يمكنك تغيير كلمة المرور من صفحة الإعدادات.\n\n' ||
             E'📞 للدعم الفني: {support_phone}\n\n' ||
             E'شكراً لاختيارك SyDent!';

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFICATION (run after applying)
--   SELECT body FROM public.notification_templates WHERE code = 'wa_welcome';
--   -- Expect the new body. If it still shows "0000", the admin had customized
--   -- it (no-op by design) — update it from the templates editor instead.
-- ════════════════════════════════════════════════════════════════════════════
