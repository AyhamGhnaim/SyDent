# SyDent — تحديث السياق v78 (delta للدمج في الملف الرئيسي)
**التاريخ:** 07 يونيو 2026 — **فحص RLS شامل على القاعدة الحيّة + Migration 49 (تثبيت immutability على `subscription_events`)**

## ملخّص الجلسة (v78)
جلسة فحص أمني مركّزة على RLS بطلب المالك («افحص الـ RLS وتأكد إنه نظيف وصحيح وخالٍ من مشاكل مستقبلاً»). **لا تغيير كود فرونت** (HEAD ثابت = `ab6efea`، بلا cache-bust). **Migration واحدة (49)** طُبّقت يدوياً بالإنتاج + **live-confirmed بصورة** («Success. No rows returned»).

### المنهجية (Rule #76 — لا تثق بالتوثيق، افحص القاعدة الحيّة)
المستودع فيه 30 من ~48 migration فقط، ونسخة `26_1` المرفوعة تعرض `is_platform_admin()` القديمة (تقرأ `doctors`). فبدل الاستنتاج من المستودع، بُني سكربت تشخيص للقراءة فقط (`pg_policies` + `pg_class` + `pg_proc`) ودُمج في **استعلام موحّد بنتيجة واحدة** (18 صف، normalized: check_id/flag/object/detail). شُغّل على الإنتاج (`rycqzpdhxabpqrdgtdzg`).

### نتائج الفحص الحيّ (18 صف)
- ✅ **`RLS_OFF` = صفر** — كل جداول public عليها RLS. لا تسريب.
- ✅ **`DOCTORS_DRIFT` = صفر** — ما في سياسة تستعلم `doctors` مباشرة (Migration 30.2 مؤكّدة شغّالة).
- ✅ **`is_platform_admin`** — `prosecdef=true`, `provolatile='s'`, تقرأ `platform_admins` (Phase F / Migration 30.1 مؤكّدة).
- ✅ **Storage** — 4 سياسات (`pf_select/insert/update/delete_own`)، كلها `bucket_id='patient-files' AND foldername[1]=auth.uid()`.
- ✅ **`platform_settings` نظيف** — الشكّ الأكبر (Migration 34 غير الموثّقة) طلع آمن: سياستها `p_platform_settings_public_support_phone` محصورة بـ `key='support_phone'` (مش `USING(true)`). القراءة الفعلية للمستأجر = `support_phone` + `payment_instructions_ar` فقط. 4 سياسات: admin_read (SELECT/is_platform_admin) + admin_write (ALL/is_platform_admin) + public_support_phone + tenant_read.
- ✅ **`platform_settings_audit`** — INSERT + SELECT فقط = append-only حقيقي.
- ✅ **`BROAD_TRUE`** — سطران فقط، كلاهما مقصود: `notification_templates` read (authenticated) + `subscription_plans` read (anon+authenticated، كتالوج أسعار عام).
- 🔴 **`subscription_events`** — كانت سياسة واحدة `p_sub_events_admin` بـ **FOR ALL** → الأدمن يقدر UPDATE/DELETE. خالفت وصفها كـ «سجل immutable بنمط Stripe» وخالفت `platform_settings_audit` الأحدث. **→ صُلّحت بـ Migration 49.**
- 🟡 **4 جداول backup يتيمة** (RLS مفعّل بلا أي سياسة = مقفولة للكل عدا service_role، فآمنة مش مكشوفة): `subscription_plans_backup_m46`, `subscription_requests_backup_m46`, `trial_requests_backup_m46`, `trial_requests_orphan_backup_phase76f`. بقايا migrations 46 + 76f المكتملتين. **مرشّحة للحذف** (clutter + سطح خطر كامن) — قرار المالك، الحذف لا رجعة فيه.

### Migration 49 — subscription_events append-only (مُطبّقة ✅ live-confirmed)
- **التحقّق قبل التنفيذ:** grep على كامل الكود (admin.html + supabase-init.js + edge function) → `subscription_events` يُلمَس بـ `.select` (2×) + `.insert` (1×) فقط، صفر `.update`/`.delete`/`.upsert`. فالتطبيق أصلاً append-only؛ التثبيت على RLS لا يكسر أي وظيفة.
- **التغيير:** `DROP POLICY p_sub_events_admin` (FOR ALL) → استبدال بـ `p_sub_events_admin_insert` (FOR INSERT, WITH CHECK is_platform_admin) + `p_sub_events_admin_select` (FOR SELECT, USING is_platform_admin). بلا UPDATE/DELETE → RLS يرفضهما = immutability. نفس نمط `platform_settings_audit`.
- **النمط (Stripe):** سجل الفوترة لا يُحرَّر — التصحيح بحدث تعويضي لا بتعديل التاريخ. التصحيحات النادرة تتطلّب SQL متعمّد بالـ SQL Editor (service_role يتجاوز RLS).
- idempotent + reversible (rollback block موثّق).

### درفت توثيق مُكتشَف (لإغلاقه)
migrations **47 / 47.1 / 48 / 49** مش موجودة بمجلد `migrations/` بالريبو، ونسخة `26_1` المرفوعة قديمة (تعرض `is_platform_admin` تقرأ doctors قبل Migration 30.1). توصية: إرجاع عادة لصق كل migration بالمجلد لإغلاق الدرفت (معلّق قرار المالك).

## قواعد ذهبية جديدة
- **#131 — جداول السجل/الأحداث (audit/event) لازم تكون INSERT + SELECT فقط على RLS، لا FOR ALL.** سجل الفوترة tamper-evident حتى ضد الأدمن (نمط Stripe). المرجع: `subscription_events` كانت FOR ALL (صُلّحت Migration 49)، بينما `platform_settings_audit` بُنيت صح من البداية. أي جدول append-only جديد = صلاحيتان منفصلتان (insert + select)، لا سياسة واحدة FOR ALL.
- **#132 — افحص حالة RLS الحيّة بسكربت تشخيص قبل أي قرار، لا تثق بالمستودع.** المستودع ناقص (30/48 migration) ونُسخ بعض migrations قديمة. الاستعلام الموحّد (pg_policies + pg_class + pg_proc → تقرير normalized بنتيجة واحدة) هو مصدر الحقيقة. تعميق لـ Rule #76. ملف التشخيص: `rls_audit_unified.sql` (للقراءة فقط، آمن لإعادة التشغيل أي وقت).

## الحالة بعد v78
- **آخر migration: 49** (subscription_events append-only، مُطبّقة ✅).
- HEAD ثابت `ab6efea`، بلا تغيير كود/cache-bust.
- **معلّق قرار المالك:** (1) حذف الـ 4 جداول backup، (2) لصق migrations 47/47.1/48/49 بالريبو + commit، (3) Migration 31 (strip doctors.role) لسا منتظرة post-soak.
