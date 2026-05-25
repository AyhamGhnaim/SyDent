# SyDent — Email Templates

قوالب البريد الإلكتروني المخصّصة لـ SyDent، بالعربية الفصحى ومُحسَّنة لـ RTL، تعمل مع Supabase Auth + Resend SMTP.

---

## 📁 محتويات المجلد

| # | الملف | غرض | حالة التطبيق |
|---|---|---|---|
| 1 | `01-confirm-signup.html` | تأكيد التسجيل لمستخدم جديد | ✅ **Apply في Supabase Dashboard** |
| 2 | `02-invite-user.html` | دعوة من قِبل المسؤول | ⚠️ **Apply but DO NOT use** (راجع التحذير أدناه) |
| 3 | `03-magic-link.html` | تسجيل دخول برابط بدون كلمة مرور | ⏳ Repo-only (مؤجَّل — مش مستخدم حالياً) |
| 4 | `04-change-email.html` | تأكيد تغيير البريد الإلكتروني | ✅ **Apply في Supabase Dashboard** |
| 5 | `05-reset-password.html` | إعادة تعيين كلمة المرور | ✅ **Apply في Supabase Dashboard** |
| 6 | `06-reauthentication.html` | رمز OTP لعمليات حسّاسة | ⏳ Repo-only (مؤجَّل — للمستقبل) |
| 7 | `07-password-changed.html` | تنبيه أمني بعد تغيير كلمة المرور | 🔮 يحتاج Send Email Hook (Edge Function) |
| 8 | `08-email-changed.html` | تنبيه أمني بعد تغيير البريد | 🔮 يحتاج Send Email Hook |
| 9 | `09-phone-changed.html` | تنبيه أمني بعد تغيير الهاتف | 🔮 Repo-only — مش متوقّع الاستخدام |
| 10 | `10-mfa-enrolled.html` | تنبيه بعد تفعيل المصادقة الثنائية | 🔮 يحتاج Send Email Hook + MFA enable |

### 💡 ملاحظات حول الحالة

- **✅ Apply (3 templates):** يُلصَق نص HTML في Supabase Dashboard → Authentication → Email Templates
- **⚠️ Invite User:** نـ brand-ها للـ consistency، لكن **يُمنع استخدامها** لأن الـ Supabase "Send invitation" يخلق `auth.users` بدون `trial_requests` → phantom user. استخدم self-signup عبر `auth.html` بدلاً (قاعدة #35).
- **⏳ Repo-only:** الـ template موجود كـ source-of-truth، لكن مؤجَّل عن الـ Dashboard لحين الحاجة.
- **🔮 Send Email Hook:** هذه الـ security notifications **غير قابلة للتحرير من Supabase Dashboard** — يجب نشرها عبر [Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook) (Edge Function). مؤجَّلة لمرحلة لاحقة.

---

## 🎨 الـ Design Pattern

كل القوالب تتبع نفس الـ pattern:

| العنصر | القيمة |
|---|---|
| **Theme** | Light (Stripe/Notion/Linear pattern) |
| **Container** | 600px max-width، centered، responsive (`@media max-width:620px`) |
| **Header strip** | Dark navy `#0f172a` + SVG SyDent tooth logo (أبيض) |
| **Body BG** | `#f7f8fa` |
| **Card BG** | `#ffffff` + border `#e5e7eb` + radius 8px |
| **Accent (CTA)** | `#0066ff` (matches app primary) |
| **Text primary** | `#111827` |
| **Text secondary** | `#374151` |
| **Text muted** | `#6b7280` |
| **Text footer** | `#9ca3af` |
| **Warning panel** | `#fef3c7` + `#fcd34d` border + `#92400e` text |
| **Font stack** | `'Cairo', 'Tahoma', 'Arial', sans-serif` |
| **RTL** | `dir="rtl"` على كل `<td>` فردياً (Gmail يجرّد html-level dir) |
| **CTA Button** | مزدوج (`<td bgcolor>` + `<a bgcolor>`) لـ Outlook compatibility |
| **Preheader** | hidden text للـ inbox preview (Stripe pattern) |
| **MSO conditional** | DPI fix لـ Outlook 2007-2019 |

---

## 🔑 Supabase Go Template Variables

كل template يستخدم متغيّرات Supabase Go template syntax. الـ Supabase Auth backend يستبدلها قبل الإرسال:

| Variable | المعنى | يُستخدم في |
|---|---|---|
| `{{ .ConfirmationURL }}` | رابط الـ action (confirm/reset/magic) | كل الـ templates النشطة |
| `{{ .Email }}` | البريد الحالي للمستخدم | كل الـ templates |
| `{{ .NewEmail }}` | البريد الجديد (في change email) | `04-change-email`، `08-email-changed` |
| `{{ .OldEmail }}` | البريد القديم (في email_changed hook) | `08-email-changed` (security alert post-change) |
| `{{ .Token }}` | رمز OTP من 6 أرقام | `06-reauthentication` |
| `{{ .TokenHash }}` | hashed token لـ server-side verification | (مش مستخدم — للـ custom landing pages) |
| `{{ .SiteURL }}` | الـ Site URL المُكوَّن في Supabase | (مش مستخدم — نستخدم `https://sydent.app` مباشرة) |
| `{{ .Data.* }}` | metadata من `raw_user_meta_data` | (مش مستخدم حالياً — مفتوح للمستقبل) |

**ملاحظة قاعدة #65:** الـ `{{ .Email }}` لا يُعدَّل في النموذج (defensive normalization عند الإرسال فقط، لا عند العرض).

---

## 📋 خطوات التطبيق في Supabase Dashboard

### المرحلة 1 — Apply 3 active templates

اذهب إلى Supabase Dashboard:

1. **Project:** `rycqzpdhxabpqrdgtdzg`
2. **Sidebar:** Authentication → Email Templates
3. لكل template من الثلاثة، اتبع الخطوات:

#### Template A: Confirm signup

1. اختر التبويب **Confirm signup**
2. **Subject heading:** غيّرها إلى:
   ```
   [SyDent] تأكيد البريد الإلكتروني
   ```
3. **Message body:** افتح ملف `01-confirm-signup.html` → Ctrl+A → Ctrl+C
4. الصق في حقل الـ HTML editor (يستبدل الـ default)
5. **اضغط Save**
6. تحقّق من الـ Preview pane (يجب يُظهر الـ Arabic RTL بشكل صحيح)

#### Template B: Change Email Address

1. اختر التبويب **Change Email Address**
2. **Subject heading:**
   ```
   [SyDent] تأكيد تغيير البريد الإلكتروني
   ```
3. **Message body:** الصق محتوى `04-change-email.html`
4. Save → تحقّق من الـ Preview

#### Template C: Reset Password

1. اختر التبويب **Reset Password**
2. **Subject heading:**
   ```
   [SyDent] إعادة تعيين كلمة المرور
   ```
3. **Message body:** الصق محتوى `05-reset-password.html`
4. Save → تحقّق من الـ Preview

#### (Optional) Template D: Invite User — للـ Consistency فقط

> ⚠️ **لا تستخدم Supabase Invite User feature** — يكسر Phase 7.6F pattern. الـ template موجود فقط لو احتجت يوماً ما.

1. اختر التبويب **Invite User**
2. **Subject heading:** `[SyDent] دعوة للانضمام`
3. الصق محتوى `02-invite-user.html`
4. Save

---

## 🛡️ خطوات إضافة DMARC في Cloudflare

DMARC = Domain-based Message Authentication. تخبر servers الاستقبال (Gmail/Outlook) ماذا تفعل بالـ emails التي تفشل في SPF/DKIM.

**Strategy:** ابدأ بـ `p=none` (monitoring فقط، لا rejection) → بعد 30 يوم لو الأمور stable → `p=quarantine` → بعد 60 يوم → `p=reject`.

### الخطوات في Cloudflare Dashboard

1. اذهب إلى **Cloudflare → sydent.app → DNS → Records**
2. اضغط **Add record**
3. املأ القيم بدقّة:

| الحقل | القيمة |
|---|---|
| **Type** | `TXT` |
| **Name** | `_dmarc.mail` |
| **Content** | `v=DMARC1; p=none;` |
| **TTL** | Auto |
| **Proxy status** | DNS only (gray cloud — مهم!) |

4. اضغط **Save**

### التحقّق من إضافة DMARC

بعد 5-10 دقائق من الإضافة:

```bash
dig _dmarc.mail.sydent.app TXT +short
```

يجب يُظهر: `"v=DMARC1; p=none;"`

### Roadmap للـ DMARC enforcement

- **Day 0:** `p=none;` (الآن — monitoring)
- **Day 30:** غيّر إلى `p=quarantine; pct=25;` (25% من failing emails يذهبون لـ spam)
- **Day 60:** `p=quarantine; pct=100;`
- **Day 90+:** `p=reject;` (full enforcement)

---

## ✅ Live Test Checklist

بعد apply الـ 3 templates و DMARC:

### Test 1 — Confirm Signup

1. افتح `https://sydent.app/auth` في incognito browser
2. سجّل بـ email حقيقي (Gmail مفضّل للـ DKIM/SPF/DMARC visibility)
3. تحقّق Gmail:
   - ✅ الإيميل يصل خلال دقيقة، في **Inbox** (ليس Spam)
   - ✅ Sender = **SyDent** (`noreply@mail.sydent.app`)
   - ✅ Subject = `[SyDent] تأكيد البريد الإلكتروني`
   - ✅ الـ logo (سنّ) يظهر في الـ header strip
   - ✅ النص عربي RTL مُتساقط لليمين
   - ✅ زرّ "تأكيد البريد الإلكتروني" يفتح `sydent.app`
4. **Gmail "Show original" يجب يُظهر:**
   - SPF: PASS
   - DKIM: PASS (signed by mail.sydent.app)
   - DMARC: PASS أو NEUTRAL (depending on `p=none`)

### Test 2 — Reset Password

1. على `/auth`، اضغط "نسيت كلمة المرور؟"
2. أدخل نفس الإيميل
3. تحقّق من Gmail لإيميل reset
4. اضغط الزر → يجب يفتح `sydent.app` مع reset form

### Test 3 — Change Email

1. سجّل دخول → اذهب لـ `/settings`
2. غيّر الـ email لإيميل آخر
3. تحقّق من **كلا** الإيميلين:
   - الإيميل الجديد: confirm change link
   - (لو Send Email Hook مفعّل لاحقاً) الإيميل القديم: security notification

---

## ⚠️ Known Limitations

### 1. Phone-based users لن يستلموا الإيميلات

المستخدمون المسجَّلون بالهاتف يحملون email مصطنع (`0991234567@sydent.com`). الـ domain `sydent.com` ليس ملكنا، لذا الإيميلات لن تصل. هذا متوقّع.

### 2. Security notifications تحتاج Send Email Hook

الـ 4 templates (`07`، `08`، `09`، `10`) **غير قابلة للتحرير من Supabase Dashboard**. لتفعيلها مستقبلاً:

1. أنشئ Supabase Edge Function
2. سجّلها كـ [Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook)
3. الـ function تستقبل event metadata وترسل عبر Resend API مباشرة
4. تُستخدم نفس HTML من ملفات `07-10` كـ template source

### 3. RTL في Outlook Desktop

Outlook 2007-2019 يستخدم Word rendering engine — قد يُظهر بعض الـ alignment issues. الـ MSO conditional في الـ `<head>` يخفّف هذا، لكن الـ best fix هو استخدام Outlook 365 أو Outlook Web.

### 4. Cairo font غير موثوقة في email clients

الـ font stack `'Cairo', 'Tahoma', 'Arial'` يضمن fallback — Tahoma متوفّر widely وداعم للعربي.

---

## 🔄 Update workflow

لو احتجت تعديل template في المستقبل:

1. عدّل الـ HTML في هذا المجلد (`docs/email-templates/`)
2. Commit + push (`git add . && git commit -m "..." && git push`)
3. **بعدها** افتح Supabase Dashboard → الصق النسخة المحدَّثة في الـ template editor
4. Save → Preview check
5. أرسل test email للتأكيد

⚠️ **لا تنسَ خطوة 3-4** — Supabase Dashboard لا يقرأ من GitHub. الـ repo هو source-of-truth، لكن الـ Dashboard apply manual.

---

## 📚 المراجع

- [Supabase Email Templates Docs](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Supabase Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook)
- [Resend Documentation](https://resend.com/docs)
- [Litmus — RTL Email Best Practices](https://litmus.com/community/discussions/1160-right-to-left-text)
- [Postmark Templates (Pattern Reference)](https://postmarkapp.com/transactional-email-templates)
- SyDent Context: `SyDent_Context_md_50.md` → v50 Email Infrastructure section
- SyDent Rules: قواعد #34 (enterprise mindset)، #35 (self-signup canonical)، #65 (defensive normalization)، #71 (SVG > emoji)

---

**آخر تحديث:** 25 May 2026 — Part 2 of Phase Email Infrastructure
