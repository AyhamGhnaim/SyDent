# SyDent — Migrations Ledger

> **المرجع الموثوق = قاعدة البيانات الحيّة، لا هذا المجلد.**
> هذا المجلد سجل تاريخي **غير مكتمل**: كثير من الـ migrations طُبّقت يدوياً عبر
> Supabase SQL Editor ولم تُلصق هنا. لمعرفة حالة RLS/السياسات الفعلية، شغّل
> [`_rls_audit_unified.sql`](./_rls_audit_unified.sql) في الـ SQL Editor
> (للقراءة فقط، آمن لإعادة التشغيل أي وقت).

## طريقة العمل
- الـ migrations تُطبَّق **يدوياً** في Supabase SQL Editor (لا تشغيل تلقائي عند الـ deploy).
- Cloudflare Pages ينشر الواجهة من `main`؛ ملفات `migrations/` لا تُخدَم ولا تؤثّر على الـ deploy.
- ترقيم تسلسلي؛ الكسور (مثل `26_1`, `47_1`) = hotfix/تكملة لما قبلها.

## ⚠️ تنبيهات حرجة
- **`26_1_hotfix_recursive_rls.sql` متجاوَزة جزئياً.** نسختها من `is_platform_admin()` تقرأ
  `doctors.role='admin'` (المعمارية القديمة قبل Phase F). الدالة الحيّة الحالية تقرأ
  **`platform_admins`** (Migration **30.1**، DB-only). **لا تعِد تشغيل `26_1`** — رح ترجّع
  الدالة للنسخة القديمة. (تأكيد حيّ 07 Jun 2026: الدالة تقرأ `platform_admins`، SECURITY DEFINER، STABLE.)
- **`47` و`48` معاد بناؤهما من التوثيق** (الأعمدة دقيقة؛ الفهارس/السياسات على النمط القياسي).
  ليستا حرفيّتين بالضرورة — راجع ترويسة كل ملف. القاعدة الحيّة هي المرجع.
- **الرقمان `56`/`57` استُخدما مرّتين** (watch-point #10): جلسة المخطّط v80 طبّقتهما
  DB-only (dentition/ortho + is_favorite) ثم جلسة P6 أصدرت ملفّي `56`/`57` لـPRM.
  ملفا **`56b`/`57b` معاد بناؤهما من التوثيق + الكود** ويحفظان شغل v80 بموقعه
  الزمني — على القاعدة الحيّة هما no-op (idempotent). **الرقم 59 استُهلك لاحقاً (`59_booking_portal.sql` — P5 بوابة الحجز، مطبّق). الترقيم التالي يبدأ من 61 (الرقم 60 استُهلك: `60_booking_window_90d.sql` — رفع سقف نافذة الحجز 35→90 يوم).**

## سجل الحالة
الرموز: ✅ موجود بالريبو · 🗄️ مُطبّق بالقاعدة فقط (مش بالريبو) · ⏳ معلّق

| # | الميزة | الحالة |
|---|---|---|
| 1–4 | Tooth surfaces · procedures↔appointments · payment splits · lab↔appointment | 🗄️ |
| Gap 1–8 | OpenDental parity gaps | 🗄️ |
| 5b · 7.1–7.3 · 8 · 8.1 | no_show_fee · treatments · manual_allocation · lock_pin_hash | 🗄️ |
| **9.1** | clinic_employees + audit_log + alerts trigger | ✅ |
| **10** | drop broken_appointment_fee | ✅ |
| 11 · 12 | appointment_types.notes/default_lab · operatories | 🗄️ |
| **13 · 14 · 15** | provider_type/compensation · monthly_salary · provider_type CHECK | ✅ |
| **16** | expenses + expense_categories + RLS | ✅ |
| 17–23 | payouts cols · HR cols · has_system_access · trial backfill · **subscription lifecycle (23)** | 🗄️ |
| **24** | orphan trial_requests cleanup | ✅ |
| **25** | subscription_events immutability (FK CASCADE→SET NULL) | ✅ |
| **26 + 26_1** | promote_admin events + doctors RLS + recursive-RLS hotfix | ✅ ⚠️(26_1 متجاوَزة بـ30.1) |
| **27 + 27_1 + 27_2** | plan_updated event + admin policy refactor + anon read | ✅ |
| **28 + 28_1 + 28_2** | notification_templates + template_updated event + seed | ✅ |
| **29** | onboarding_dismissed_at + clinic_name_confirmed_at | ✅ |
| **30 + 30.1 + 30.2** | **Phase F: platform_admins + is_platform_admin() repoint + 2 policies refactor** | 🗄️ |
| 31 | strip doctors.role='admin' + drop doctors_admin_all | ⏳ (post-soak) |
| **32** | trial_requests phone nullable + UNIQUE user_id + replace weak INSERT policy | ✅ |
| **33 + 33_1** | platform_settings + support_phone | ✅ |
| 34 | platform_settings tenant-read (`key='support_phone'`) | 🗄️ |
| 35 · 36 | entitlements + quota triggers | 🗄️ |
| **37 · 38 · 39 · 40 · 41** | plan display fields/icon · generic plan events · surface recode | ✅ |
| **42 · 43 · 44 · 45 · 46** | subscription_requests · employee seat-limit · account_adjustments · billing cycle | ✅ |
| P9 | patient_documents + patient-files Storage bucket + 4 storage.objects policies | 🗄️ |
| **47 + 47_1** | subscription_payments cash ledger + method vocab | ✅ (معاد بناء 47) |
| **48** | platform_settings_audit (append-only) | ✅ (معاد بناء) |
| **49** | subscription_events true append-only (RLS-enforced immutability) | ✅ |
| **50** | subscription_requests: تقييد UPDATE المستأجر على cancel-only (منع self-approval) | ⏳ (apply pending) |

## السياسات الحرجة (مؤكّدة حيّة 07 Jun 2026)
- `is_platform_admin()` → `platform_admins`, SECURITY DEFINER, STABLE, `search_path=public`. حاجز الأدمن الوحيد، recursion-safe.
- عزل المستأجر: الجداول العيادية `doctor_id=auth.uid()`؛ الأحدث `owner_id=auth.uid()`.
- عزل التخزين: `bucket_id='patient-files' AND foldername[1]=auth.uid()::text` (4 سياسات).
- append-only عبر RLS (INSERT+SELECT فقط، بلا UPDATE/DELETE): `subscription_events` (Migration 49) · `platform_settings_audit` (Migration 48).
- `platform_settings`: قراءة المستأجر محصورة بـ `support_phone` + `payment_instructions_ar` فقط؛ الباقي admin-only.

## فحص دوري
شغّل [`_rls_audit_unified.sql`](./_rls_audit_unified.sql) دورياً. توقّع: صفر `RLS_OFF`، صفر `DOCTORS_DRIFT`، صفر `APPEND_ONLY` بعلم 🔴.
