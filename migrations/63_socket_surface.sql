-- Migration 63 — 'SOCKET' surface value (post-extraction site treatment shown on the chart)
-- ⚠️ خُذ snapshot منطقي أولاً (Free tier: لا backup تلقائي).
-- ⚠️ ترتيب التشغيل: snapshot → هذا الميغريشن → ثم انشر كود العميل المطابق.
--    هذا الميغريشن SUPERSET صارم لقيود Migration 61: يوسّع فقط مجموعة surface المسموحة
--    بإضافة 'SOCKET'. كل صف teeth_status / ledger_sessions موجود يبقى صالحاً؛ لا تُقرأ
--    بيانات ولا تتغيّر ولا يُعاد التحقق منها. تطبيقه غير مرئي حتى يكتب العميل صف 'SOCKET'،
--    فهو آمن قبل شحن الكود.
--
--   الغرض: علاج ما-بعد-القلع (طعم عظمي / ضماد سنخ / أي علاج post_extraction) يُطبَّق على
--   سن مقلوع يُخزَّن كـ teeth_status surface='SOCKET' — صف منفصل عن القلع (surface='WHOLE'
--   ='extracted')، فيبقى شبح القلع ويظهر لون العلاج فوقه. surface يبقى تسمية سريرية بحتة:
--   صفر أثر مالي (FIFO, splitIsEarned, اختبارات الهوية A–E لا تقرأ surface) — تماماً مثل 'SPACER'.
--
-- Idempotent: DROP CONSTRAINT IF EXISTS + ADD → آمن لإعادة التشغيل.

BEGIN;

ALTER TABLE public.teeth_status   DROP CONSTRAINT IF EXISTS teeth_status_surface_check;
ALTER TABLE public.teeth_status   ADD  CONSTRAINT teeth_status_surface_check CHECK (
  (surface ~ '^M?[OI]?D?B?L?V?$' AND surface <> '')
  OR surface IN ('WHOLE','PONTIC','CROWN_FULL','BRIDGE','SPACER','SOCKET','R1','R2','R3')
);

ALTER TABLE public.ledger_sessions DROP CONSTRAINT IF EXISTS ledger_sessions_surface_check;
ALTER TABLE public.ledger_sessions ADD  CONSTRAINT ledger_sessions_surface_check CHECK (
  surface IS NULL
  OR (surface ~ '^M?[OI]?D?B?L?V?$' AND surface <> '')
  OR surface IN ('WHOLE','PONTIC','CROWN_FULL','BRIDGE','SPACER','SOCKET','R1','R2','R3')
);

COMMIT;

-- تحقّق بعد التشغيل (لازم 'SOCKET' تظهر بقائمة IN لكلا القيدين):
--   SELECT conrelid::regclass::text AS tbl, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conname IN ('teeth_status_surface_check','ledger_sessions_surface_check');
