-- Migration 28.2 — Phase X3 — Seed default notification templates
-- Date: 23 May 2026 (Phase X3 محادثة 1)
--
-- Purpose: Insert 4 default templates so that post-deploy behavior is
-- IDENTICAL to current production. The wa_reminder and wa_welcome
-- strings are byte-for-byte copies of what's hardcoded in
-- admin.html today (waLink at line 3314, waReminderLink at line 3341
-- of the fe2d113 baseline). wa_suspended and wa_renewed are NEW
-- placeholder templates — they aren't wired to any button yet, but
-- exist as editable starting points for Phase X3 محادثة 2 which will
-- add the suspend/renew notification buttons.
--
-- Honorific consistency (important context for future edits):
--   - waLink today says "مرحباً د. " + name — i.e. it ADDS "د. " before
--     the stored name. The seed preserves this with "مرحباً د. {name}،"
--     in wa_welcome and wa_renewed.
--   - waReminderLink today says "مرحباً " + name — no honorific prefix,
--     because trial_requests.name already carries "د" / "د." (verified
--     from live data: 'د شذ المار', 'د مجد شاكر'). The seed preserves
--     this with "مرحباً {name} 👋" in wa_reminder and wa_suspended.
--   - This asymmetry is intentional in current production. Admin can
--     change it post-deploy via the editor if desired.
--
-- Variables format: {var_name} (single curly braces). renderTemplate()
-- in admin.html will substitute these at message-build time.
--
-- ON CONFLICT (code) DO NOTHING is used so re-running this migration
-- in a clean environment doesn't error, and re-running in an
-- environment that already has the 4 rows is a safe no-op (won't
-- overwrite admin's edits).
--
-- Apply to Supabase production via SQL editor AFTER Migration 28 and
-- Migration 28.1. Verify via the SELECT at the bottom.

-- ───── wa_welcome (login credentials, sent on accept) ────────────────
INSERT INTO public.notification_templates
  (code, channel, title_ar, description, body, variables, sort_order)
VALUES (
  'wa_welcome',
  'whatsapp',
  'رسالة الترحيب',
  'تُرسَل بعد قبول طلب اشتراك الطبيب — تتضمّن بيانات الدخول الأوّليّة.',
  E'مرحباً د. {name}،\nتم قبول طلبك في SyDent 🦷\n\n' ||
  E'بيانات الدخول:\n' ||
  E'🔗 الرابط: {login_url}\n' ||
  E'👤 البريد: {email}\n' ||
  E'🔑 كلمة المرور: 0000\n\n' ||
  E'⚠️ يمكنك تغيير كلمة المرور من صفحة الإعدادات.\n\n' ||
  E'شكراً لاختيارك SyDent!',
  '[
    {"key":"name","desc":"اسم الطبيب (بدون لقب — اللقب مُضمَّن في النص)"},
    {"key":"login_url","desc":"رابط الموقع (افتراضياً https://ayhamghnaim.github.io/SyDent)"},
    {"key":"email","desc":"البريد المُسجَّل أو phone@sydent.com"}
  ]'::jsonb,
  10
) ON CONFLICT (code) DO NOTHING;

-- ───── wa_reminder (trial expiry warning) ────────────────────────────
INSERT INTO public.notification_templates
  (code, channel, title_ar, description, body, variables, sort_order)
VALUES (
  'wa_reminder',
  'whatsapp',
  'تذكير انتهاء التجربة',
  'تُرسَل قبل انتهاء التجربة المجانية — لا تتضمّن بيانات الدخول (قد تكون مُعدَّلة).',
  E'مرحباً {name} 👋\n\n' ||
  E'هذه رسالة تذكير ودّية من SyDent 🦷\n\n' ||
  E'⏰ تجربتك المجانية تنتهي خلال {days_left} يوم بتاريخ {trial_end}.\n\n' ||
  E'للتمديد أو الاستفسار، يرجى التواصل معنا.\n\n' ||
  E'شكراً لاختيارك SyDent!',
  '[
    {"key":"name","desc":"اسم الطبيب كما هو مسجَّل (يحتوي اللقب أصلاً)"},
    {"key":"days_left","desc":"عدد الأيام المتبقّية للتجربة"},
    {"key":"trial_end","desc":"تاريخ انتهاء التجربة بصيغة عربية طويلة"},
    {"key":"plan_name","desc":"اسم الخطة الحالية (متاح لكن غير مستخدم في النص الافتراضي)"}
  ]'::jsonb,
  20
) ON CONFLICT (code) DO NOTHING;

-- ───── wa_suspended (placeholder — no button wired yet) ──────────────
INSERT INTO public.notification_templates
  (code, channel, title_ar, description, body, variables, sort_order)
VALUES (
  'wa_suspended',
  'whatsapp',
  'إشعار إيقاف الحساب',
  'placeholder — سيُربط بزر إشعار الإيقاف في Phase X3 محادثة 2.',
  E'مرحباً {name} 👋\n\n' ||
  E'نودّ إعلامك بأن حسابك في SyDent مُعلَّق مؤقتاً.\n\n' ||
  E'للاستفسار أو إعادة التفعيل، يرجى التواصل معنا.\n\n' ||
  E'شكراً لتفهّمك.',
  '[
    {"key":"name","desc":"اسم الطبيب كما هو مسجَّل (يحتوي اللقب أصلاً)"}
  ]'::jsonb,
  30
) ON CONFLICT (code) DO NOTHING;

-- ───── wa_renewed (placeholder — no button wired yet) ────────────────
INSERT INTO public.notification_templates
  (code, channel, title_ar, description, body, variables, sort_order)
VALUES (
  'wa_renewed',
  'whatsapp',
  'إشعار تجديد الاشتراك',
  'placeholder — سيُربط بزر إشعار التجديد في Phase X3 محادثة 2.',
  E'مرحباً د. {name} 👋\n\n' ||
  E'تم تجديد اشتراكك في SyDent ✅\n\n' ||
  E'📋 الخطة: {plan_name}\n' ||
  E'📅 صالح حتى: {trial_end}\n' ||
  E'💰 المبلغ: {price}\n\n' ||
  E'شكراً لاختيارك SyDent!',
  '[
    {"key":"name","desc":"اسم الطبيب (بدون لقب — اللقب مُضمَّن في النص)"},
    {"key":"plan_name","desc":"اسم الخطة (شهري / سنوي / دائم)"},
    {"key":"trial_end","desc":"تاريخ نهاية الاشتراك الجديد"},
    {"key":"price","desc":"المبلغ المدفوع (نص حر، مثلاً ‎150,000 SYP)"}
  ]'::jsonb,
  40
) ON CONFLICT (code) DO NOTHING;

-- ───── Verification queries (run AFTER apply) ────────────────────────
-- 1) All 4 templates seeded:
--    SELECT code, title_ar, is_active, sort_order, length(body) AS body_len
--    FROM public.notification_templates
--    ORDER BY sort_order;
--    Expected: 4 rows (wa_welcome, wa_reminder, wa_suspended, wa_renewed)
--    All active=true, body_len 100..400 chars.
--
-- 2) Variables JSONB structure intact:
--    SELECT code, jsonb_array_length(variables) AS var_count
--    FROM public.notification_templates ORDER BY sort_order;
--    Expected: 3, 4, 1, 4 (sums to 12)
--
-- 3) Backfill detection — confirm Arabic chars not mangled:
--    SELECT code, substring(body, 1, 30) FROM public.notification_templates;
--    Expected: starts with 'مرحباً' for all 4
