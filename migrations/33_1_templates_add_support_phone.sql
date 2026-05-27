-- Migration 33.1 — Phase X3 محادثة 3 — Add {support_phone} to default templates
-- Date: 27 May 2026 (Phase X3 محادثة 3)
--
-- Purpose: Insert {support_phone} variable into the 4 default admin
-- WhatsApp templates seeded by Migration 28.2 so that tenants can
-- distinguish SyDent support contact from their own clinic phone. The
-- {support_phone} value comes from platform_settings (Migration 33).
--
-- Strategy — CONDITIONAL UPDATE (idempotent + admin-edit-respecting):
--   - WHERE body = '<exact-original-text>' ensures the UPDATE applies
--     ONLY to rows that still match the Migration 28.2 seed exactly.
--   - If an admin already edited the template body via the UI, the
--     WHERE clause won't match and the UPDATE will be a no-op for
--     that row — their edits are preserved. The admin can then insert
--     {support_phone} manually via the chip pill in the editor.
--   - Same pattern guarantees re-running this migration is idempotent:
--     once the seed-text is replaced, the WHERE no longer matches, so
--     the second run is a no-op.
--
-- Template body changes (all four):
--   wa_welcome   → insert "📞 للدعم الفني: {support_phone}" line before
--                  final "شكراً لاختيارك SyDent!" line.
--   wa_reminder  → replace "للتمديد أو الاستفسار، يرجى التواصل معنا."
--                  with "للتمديد أو الاستفسار: {support_phone}".
--   wa_suspended → replace "للاستفسار أو إعادة التفعيل، يرجى التواصل معنا."
--                  with "للاستفسار أو إعادة التفعيل: {support_phone}".
--   wa_renewed   → insert "📞 للدعم الفني: {support_phone}" line before
--                  final "شكراً لاختيارك SyDent!" line.
--
-- Variables JSONB:
--   Append { "key":"support_phone", "desc":"رقم الدعم الفني لـ SyDent" }
--   to each row's variables array. Done in the same UPDATE to keep the
--   chip pills in sync with the body text. Uses jsonb concat (||) which
--   is safe and idempotent (re-runs append duplicates — but the WHERE
--   guards prevent re-runs from reaching this point anyway).
--
-- Empty-value behavior (admin-side):
--   When platform_settings.support_phone is empty, the admin.html JS
--   intentionally does NOT pass support_phone to renderTemplate(),
--   leaving {support_phone} literal in the message body as a visible
--   reminder to fill it in. This is UX-deliberate, not a bug.
--
-- Apply to Supabase production via SQL editor AFTER Migration 33.

-- ───── wa_welcome ────────────────────────────────────────────────────
UPDATE public.notification_templates
SET body =
      E'مرحباً د. {name}،\nتم قبول طلبك في SyDent 🦷\n\n' ||
      E'بيانات الدخول:\n' ||
      E'🔗 الرابط: {login_url}\n' ||
      E'👤 البريد: {email}\n' ||
      E'🔑 كلمة المرور: 0000\n\n' ||
      E'⚠️ يمكنك تغيير كلمة المرور من صفحة الإعدادات.\n\n' ||
      E'📞 للدعم الفني: {support_phone}\n\n' ||
      E'شكراً لاختيارك SyDent!',
    variables = variables || '[{"key":"support_phone","desc":"رقم الدعم الفني لـ SyDent"}]'::jsonb
WHERE code = 'wa_welcome'
  AND body = E'مرحباً د. {name}،\nتم قبول طلبك في SyDent 🦷\n\n' ||
             E'بيانات الدخول:\n' ||
             E'🔗 الرابط: {login_url}\n' ||
             E'👤 البريد: {email}\n' ||
             E'🔑 كلمة المرور: 0000\n\n' ||
             E'⚠️ يمكنك تغيير كلمة المرور من صفحة الإعدادات.\n\n' ||
             E'شكراً لاختيارك SyDent!';

-- ───── wa_reminder ───────────────────────────────────────────────────
UPDATE public.notification_templates
SET body =
      E'مرحباً {name} 👋\n\n' ||
      E'هذه رسالة تذكير ودّية من SyDent 🦷\n\n' ||
      E'⏰ تجربتك المجانية تنتهي خلال {days_left} يوم بتاريخ {trial_end}.\n\n' ||
      E'للتمديد أو الاستفسار: {support_phone}\n\n' ||
      E'شكراً لاختيارك SyDent!',
    variables = variables || '[{"key":"support_phone","desc":"رقم الدعم الفني لـ SyDent"}]'::jsonb
WHERE code = 'wa_reminder'
  AND body = E'مرحباً {name} 👋\n\n' ||
             E'هذه رسالة تذكير ودّية من SyDent 🦷\n\n' ||
             E'⏰ تجربتك المجانية تنتهي خلال {days_left} يوم بتاريخ {trial_end}.\n\n' ||
             E'للتمديد أو الاستفسار، يرجى التواصل معنا.\n\n' ||
             E'شكراً لاختيارك SyDent!';

-- ───── wa_suspended ──────────────────────────────────────────────────
UPDATE public.notification_templates
SET body =
      E'مرحباً {name} 👋\n\n' ||
      E'نودّ إعلامك بأن حسابك في SyDent مُعلَّق مؤقتاً.\n\n' ||
      E'للاستفسار أو إعادة التفعيل: {support_phone}\n\n' ||
      E'شكراً لتفهّمك.',
    variables = variables || '[{"key":"support_phone","desc":"رقم الدعم الفني لـ SyDent"}]'::jsonb
WHERE code = 'wa_suspended'
  AND body = E'مرحباً {name} 👋\n\n' ||
             E'نودّ إعلامك بأن حسابك في SyDent مُعلَّق مؤقتاً.\n\n' ||
             E'للاستفسار أو إعادة التفعيل، يرجى التواصل معنا.\n\n' ||
             E'شكراً لتفهّمك.';

-- ───── wa_renewed ────────────────────────────────────────────────────
UPDATE public.notification_templates
SET body =
      E'مرحباً د. {name} 👋\n\n' ||
      E'تم تجديد اشتراكك في SyDent ✅\n\n' ||
      E'📋 الخطة: {plan_name}\n' ||
      E'📅 صالح حتى: {trial_end}\n' ||
      E'💰 المبلغ: {price}\n\n' ||
      E'📞 للدعم الفني: {support_phone}\n\n' ||
      E'شكراً لاختيارك SyDent!',
    variables = variables || '[{"key":"support_phone","desc":"رقم الدعم الفني لـ SyDent"}]'::jsonb
WHERE code = 'wa_renewed'
  AND body = E'مرحباً د. {name} 👋\n\n' ||
             E'تم تجديد اشتراكك في SyDent ✅\n\n' ||
             E'📋 الخطة: {plan_name}\n' ||
             E'📅 صالح حتى: {trial_end}\n' ||
             E'💰 المبلغ: {price}\n\n' ||
             E'شكراً لاختيارك SyDent!';

-- ───── Verification queries (run AFTER apply) ────────────────────────
-- 1) All 4 templates updated (body contains {support_phone}):
--    SELECT code, position('{support_phone}' IN body) > 0 AS has_var
--    FROM public.notification_templates
--    WHERE code IN ('wa_welcome','wa_reminder','wa_suspended','wa_renewed')
--    ORDER BY code;
--    Expected: 4 rows, has_var=true for all (IF this migration ran cleanly
--    against the seeded defaults; if admin pre-edited some bodies, those
--    rows will return has_var=false — that's expected, admin adds the
--    variable manually via the editor for those).
--
-- 2) variables JSONB contains support_phone:
--    SELECT code,
--           variables @> '[{"key":"support_phone"}]'::jsonb AS has_var_def
--    FROM public.notification_templates
--    WHERE code IN ('wa_welcome','wa_reminder','wa_suspended','wa_renewed')
--    ORDER BY code;
--    Expected: 4 rows, has_var_def=true for all (same caveat).
--
-- 3) Backfill detection — confirm UPDATEs didn't fire on edited rows:
--    SELECT code, updated_at FROM public.notification_templates
--    ORDER BY code;
--    Expected: rows that were updated have updated_at ≈ now();
--    rows that were skipped (admin-edited bodies) keep their older
--    updated_at.
