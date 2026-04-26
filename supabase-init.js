// ═══════════════════════════════════════════════════════
// SyDent — Supabase Init (يُحمَّل في كل صفحة)
// ═══════════════════════════════════════════════════════

(function() {
  // إذا تحميل المكتبة لم يكتمل، انتظر
  if (typeof window.supabase === 'undefined') {
    console.error('Supabase library not loaded');
    return;
  }

  const SUPABASE_URL = 'https://rycqzpdhxabpqrdgtdzg.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_7LjceYIlrRrHt86sLpCwPg_TlMO8VJu';

  // إنشاء client مشترك
  window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storage: window.localStorage,
      storageKey: 'sydent.auth'
    }
  });

  // ── دوال مساعدة ──

  // الحصول على الدكتور المسجّل دخول حالياً
  window.sbGetUser = async function() {
    const { data, error } = await window.sb.auth.getUser();
    if (error || !data.user) return null;
    return data.user;
  };

  // التحقق من تسجيل الدخول — ينقل لـauth.html إذا لا
  window.sbRequireAuth = async function() {
    const user = await window.sbGetUser();
    if (!user) {
      window.location.href = 'auth.html';
      return null;
    }
    return user;
  };

  // تسجيل خروج
  window.sbSignOut = async function() {
    await window.sb.auth.signOut();
    window.location.href = 'auth.html';
  };

  console.log('[SyDent] Supabase initialized');
})();
