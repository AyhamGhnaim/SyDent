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

  // ─────────────────────────────────────────────────────────
  // Phase F — SyDentAuth namespace (platform admin checks)
  // ─────────────────────────────────────────────────────────
  // Single source of truth for "is this user a platform admin?".
  // Reads from the platform_admins table (Phase F Migration 30) instead
  // of the legacy doctors.role='admin' flag.
  //
  // Why a helper instead of inline queries:
  //   • 12 sites used to inline the same pattern — moved them all here
  //   • Easier to audit / change auth-source in future
  //   • Returns a consistent { isAdmin, error } shape for caller logic
  //
  // Fail-closed semantics: any DB error → isAdmin=false. The caller treats
  // this as "not an admin" rather than blocking — matches pre-Phase-F
  // behavior where errors fell through to non-admin code paths.
  window.SyDentAuth = window.SyDentAuth || {};

  window.SyDentAuth.isPlatformAdmin = async function(userId) {
    if (!userId || !window.sb) return { isAdmin: false, error: 'no_user_or_sb' };
    try {
      var res = await window.sb.from('platform_admins')
        .select('user_id').eq('user_id', userId).maybeSingle();
      if (res.error) {
        console.warn('[SyDentAuth] isPlatformAdmin error:', res.error.message);
        return { isAdmin: false, error: res.error.message };
      }
      return { isAdmin: !!res.data, error: null };
    } catch (e) {
      console.warn('[SyDentAuth] isPlatformAdmin exception:', e && e.message);
      return { isAdmin: false, error: (e && e.message) || 'exception' };
    }
  };

  // Count rows in platform_admins. Used by last-admin guards in admin.html
  // (suspend/delete/demote workflows must ensure at least 1 admin remains
  // after the operation, otherwise the platform locks itself out).
  window.SyDentAuth.countPlatformAdmins = async function() {
    if (!window.sb) return { count: 0, error: 'no_sb' };
    try {
      var res = await window.sb.from('platform_admins')
        .select('user_id', { count: 'exact', head: true });
      if (res.error) {
        return { count: 0, error: res.error.message };
      }
      return { count: res.count || 0, error: null };
    } catch (e) {
      return { count: 0, error: (e && e.message) || 'exception' };
    }
  };

  // ─────────────────────────────────────────────────────────
  // Phase 7.6F — ensureAccountAccessible
  // ─────────────────────────────────────────────────────────
  // Called by tenant pages AFTER authentication (sbGetUser / sbRequireAuth).
  // Blocks access when the trial_request is in a non-accessible state:
  //   • 'new'       → admin hasn't reviewed yet → redirect to pending.html
  //   • 'rejected'  → admin declined → sign-out + redirect to landing
  //   • 'suspended' → admin paused service → sign-out + redirect to landing
  // For 'accepted' (incl. trial/monthly/yearly/permanent) the gate is a pass-through.
  //
  // Skip rules:
  //   • Admin users (platform_admins) always bypass — they manage the platform
  //     and don't have a tenant trial_request.
  //   • The grandfathered pre-Phase 7.6E owners with NULL trial_request also bypass
  //     (treated as legacy 'accepted' — Migration 22 backfilled them anyway).
  //
  // Returns: true if the account is accessible, false if a redirect was issued.
  // Callers should `if (!await ensureAccountAccessible()) return;` to short-circuit.
  //
  // Resilience: any RPC error or unexpected shape → fail-open (return true).
  // We prefer letting an authenticated user IN over a false-positive lockout,
  // because the per-page RLS rules already protect tenant data.
  window.ensureAccountAccessible = async function(user) {
    try {
      if (!user) user = await window.sbGetUser();
      if (!user) return false; // shouldn't get here — caller should auth-check first

      // Admin bypass: platform users have no tenant subscription.
      // Phase F: switched from doctors.role='admin' to platform_admins table.
      var adminCheck = await window.SyDentAuth.isPlatformAdmin(user.id);
      if (adminCheck.isAdmin) return true;

      // Read the trial_request for this user.
      var trRes = await window.sb.from('trial_requests')
        .select('status').eq('user_id', user.id).maybeSingle();
      // No row at all → legacy pre-7.6E account or RLS hid it. Migration 22 should
      // have backfilled. Fail-open (the RLS layer still gates the actual data).
      if (!trRes || !trRes.data) return true;

      var status = trRes.data.status;

      // 'accepted' covers all paid/trial active states (plan field carries the tier).
      if (status === 'accepted') return true;

      // Non-accessible states → redirect.
      if (status === 'new') {
        window.location.replace('pending.html');
        return false;
      }
      if (status === 'rejected' || status === 'suspended') {
        try { await window.sb.auth.signOut({ scope: 'local' }); } catch(e){}
        window.location.replace('auth.html?denied=' + encodeURIComponent(status));
        return false;
      }
      // Unknown status → fail-open (don't lock out on a typo'd value).
      return true;
    } catch(err) {
      console.warn('[ensureAccountAccessible] gate error (fail-open):', err);
      return true;
    }
  };

  // تسجيل خروج
  window.sbSignOut = async function() {
    await window.sb.auth.signOut();
    window.location.href = 'auth.html';
  };

  // ─────────────────────────────────────────────────────────
  // Entitlements — per-plan feature gating + quota limits
  // ─────────────────────────────────────────────────────────
  // Single source of truth: subscription_plans.entitlements (JSONB boolean
  // map, keyed by the same module ids as sidebar.js nav) + max_employees /
  // max_patients numeric quotas. The tenant's tier comes from
  // trial_requests.plan. Pattern: Stripe Entitlements + the pricing_plans
  // model — the catalog DEFINES, the runtime ENFORCES.
  //
  // Fail-open by design (mirrors ensureAccountAccessible): a missing key, a
  // missing column (pre-migration), or any error → feature ALLOWED / limit
  // UNLIMITED. We never lock a paying tenant out of their own data over a
  // config glitch. Under-enforcement is the safe failure direction here; the
  // hard quota enforcement lives in the DB triggers (Migration 36).
  (function(){
    var _plan = null;     // cached resolved plan object
    var _loading = null;  // in-flight promise (dedupe concurrent callers)

    async function _resolve() {
      try {
        var user = await window.sbGetUser();
        if (!user) return null;
        var tr = await window.sb.from('trial_requests')
          .select('plan').eq('user_id', user.id).maybeSingle();
        var code = (tr && tr.data && tr.data.plan) ? tr.data.plan : null;
        if (!code) return { code:null, entitlements:{}, max_patients:null, max_employees:null };
        var pl = await window.sb.from('subscription_plans')
          .select('code, display_name, entitlements, max_patients, max_employees')
          .eq('code', code).maybeSingle();
        var row = (pl && pl.data) ? pl.data : {};
        return {
          code: code,
          display_name: row.display_name || code,
          entitlements: (row.entitlements && typeof row.entitlements === 'object') ? row.entitlements : {},
          max_patients:  (row.max_patients  == null ? null : Number(row.max_patients)),
          max_employees: (row.max_employees == null ? null : Number(row.max_employees))
        };
      } catch(e) {
        console.warn('[SyDentPlan] resolve failed (fail-open):', e);
        return { code:null, entitlements:{}, max_patients:null, max_employees:null };
      }
    }

    window.SyDentPlan = {
      load: function() {
        if (_plan) return Promise.resolve(_plan);
        if (_loading) return _loading;
        _loading = _resolve().then(function(p){ _plan = p; _loading = null; return p; });
        return _loading;
      },
      getPlan: function() { return _plan; },
      // boolean feature — default ALLOW when key/plan unknown (grandfather)
      can: function(key) {
        if (!_plan || !_plan.entitlements) return true;
        return (_plan.entitlements[key] === false) ? false : true;
      },
      // numeric quota — null = unlimited
      limit: function(kind) {
        if (!_plan) return null;
        if (kind === 'patients')  return _plan.max_patients;
        if (kind === 'employees') return _plan.max_employees;
        return null;
      }
    };
  })();

  // Phase C: full-screen "this module is not in your plan" gate. Mirrors the
  // suspension/pending screens in sidebar.js for visual consistency.
  window.__sydentRenderPlanBlock = function() {
    var planName = (window.SyDentPlan && window.SyDentPlan.getPlan() && window.SyDentPlan.getPlan().display_name) || '';
    var nameLine = planName ? ('خطتك الحالية: ' + planName) : 'هذه الميزة غير متاحة في خطتك الحالية.';
    document.body.innerHTML =
      '<div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--bg,#0a1628);padding:24px;font-family:\'Cairo\',sans-serif;text-align:center;">' +
        '<div style="font-size:60px;margin-bottom:16px;">🔒</div>' +
        '<div style="font-size:22px;font-weight:800;color:var(--text,#e1f4ee);margin-bottom:10px;">هذه الميزة غير متاحة في خطتك</div>' +
        '<div style="font-size:14px;color:var(--text2,#8a9ab5);margin-bottom:28px;max-width:340px;line-height:1.7;">' + nameLine + '<br>للترقية والوصول لكل الميزات، تواصل معنا.</div>' +
        '<a href="index.html" style="padding:14px 28px;background:var(--green,var(--green));border-radius:12px;color:#062a1c;font-size:15px;font-weight:800;text-decoration:none;">← العودة للوحة التحكم</a>' +
      '</div>';
  };

  // ─────────────────────────────────────────────────────────
  // Phase 7.6F — Auto-gate on page load
  // ─────────────────────────────────────────────────────────
  // Runs ensureAccountAccessible automatically on tenant pages, so we don't
  // need to modify 9+ tenant pages individually. The gate runs after the
  // first auth state event (we know whether a user is logged in by then).
  //
  // Skipped pages: auth.html, landing.html, pending.html, admin.html.
  // These are either pre-auth (landing/auth/pending) or admin-only (admin),
  // none of which should be gated against trial_request status.
  //
  // Why a small delay before running: tenant pages do their own auth check
  // shortly after load (await getUser → redirect-if-null). Running the gate
  // too eagerly races with that. We wait for either:
  //   • The first onAuthStateChange event (SIGNED_IN / TOKEN_REFRESHED), OR
  //   • A 1.2 second fallback timer (if no event fires, fall back to a
  //     direct getUser check — handles already-signed-in pages).
  (function autoGate() {
    try {
      var path = (window.location.pathname || '').toLowerCase();
      var page = path.split('/').pop() || 'index.html';
      // Phase Email Part 3b: Cloudflare Pages serves clean URLs (no .html).
      // Normalize so both '/reset-password' and '/reset-password.html' skip alike.
      // Rule #63 applied to autoGate skip (was already applied to isPublicPage).
      if (page && page.indexOf('.') === -1) page = page + '.html';
      var skip = { 'auth.html':1, 'landing.html':1, 'pending.html':1, 'admin.html':1, 'reset-password.html':1 };
      if (skip[page]) return;

      // Phase C: map gateable pages → entitlement module id (same ids as the
      // sidebar nav). Core pages (dashboard/patients/appointments/settings)
      // are intentionally absent — they are never plan-gated.
      var PAGE_MODULE = {
        'treatments.html':'treatments',
        'doctors.html':'doctors',
        'employees.html':'employees',
        'payouts.html':'payouts',
        'expenses.html':'expenses',
        'inventory.html':'inventory',
        'labs.html':'labs',
        'accounting.html':'accounting',
        'provider-reports.html':'provider-reports',
        'audit-log.html':'audit-log'
      };

      var gateRan = false;
      var runGate = async function(reason) {
        if (gateRan) return;
        gateRan = true;
        try {
          var user = await window.sbGetUser();
          if (!user) return; // tenant page's own auth check will redirect — let it
          var accessible = await window.ensureAccountAccessible(user);
          if (accessible === false) return; // a redirect was already issued

          // Phase C: per-plan module gate. If this page maps to a module that
          // the tenant's plan disables, block it. Fail-open: any error here
          // leaves the page accessible (SyDentPlan.can defaults to allow).
          var moduleId = PAGE_MODULE[page];
          if (moduleId && window.SyDentPlan) {
            try {
              await window.SyDentPlan.load();
              if (!window.SyDentPlan.can(moduleId)) {
                window.__sydentRenderPlanBlock();
              }
            } catch(mErr) { console.warn('[autoGate] module gate skipped:', mErr); }
          }
        } catch(e) {
          console.warn('[autoGate] failed (' + reason + '):', e);
        }
      };

      // Listen for the first auth event (preferred path).
      try {
        var sub = window.sb.auth.onAuthStateChange(function(event, session){
          if (session) runGate('authEvent:' + event);
        });
        // Best-effort unsubscribe after the first run to avoid leaks; supabase
        // returns { data: { subscription: { unsubscribe } } } shape.
        setTimeout(function(){
          try { if (sub && sub.data && sub.data.subscription) sub.data.subscription.unsubscribe(); } catch(e){}
        }, 5000);
      } catch(subErr) { /* listener unavailable — fall back to timer below */ }

      // Fallback: if no auth event fires within 1.2s, run the gate directly.
      // Covers the case where the user is already signed in (no fresh event).
      setTimeout(function(){ runGate('fallback'); }, 1200);
    } catch(outerErr) {
      console.warn('[autoGate] init error:', outerErr);
    }
  })();

  console.log('[SyDent] Supabase initialized');
})();

// ═══════════════════════════════════════════════════════════════════
// SyDent — Device Lock Mode (Phase 4)
// ═══════════════════════════════════════════════════════════════════
// نظام أدوار محلي على مستوى الجهاز (Owner / Doctor / Secretary).
// PIN واحد يُخزَّن hashed (SHA-256) في clinic_settings.lock_pin_hash.
// الـ role يُحفظ في localStorage. Hierarchy: Owner > Doctor = Secretary.
// Owner → أي شي بدون PIN (تخفيض). أي ترقية أو تبديل أفقي → PIN مطلوب.
// Rate-limit: 5 محاولات خاطئة → 60 ثانية cooldown.
// ═══════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────
  const LS_ROLE        = 'sydent.lock.role';        // 'owner'|'doctor'|'secretary'
  const LS_DOCTOR_ID   = 'sydent.lock.doctorId';    // UUID (when role=doctor)
  const LS_EMPLOYEE_ID = 'sydent.lock.employeeId';  // ← Phase 5: per-employee identity
  const LS_FAIL_COUNT  = 'sydent.lock.failCount';
  const LS_COOLDOWN    = 'sydent.lock.cooldownUntil';
  const MAX_FAILS      = 5;
  const COOLDOWN_MS    = 60 * 1000; // 60 seconds

  const ROLE_LABELS = {
    owner:     'المالك',
    doctor:    'الطبيب',
    secretary: 'السكرتيرة'
  };
  const ROLE_ICONS = {
    owner:     '👑',
    doctor:    '👨‍⚕️',
    secretary: '👩‍💼'
  };
  const ROLE_COLORS = {
    owner:     { bg: 'rgba(var(--green-rgb),0.14)',  border: 'rgba(var(--green-rgb),0.40)',  text: 'var(--green)' },
    doctor:    { bg: 'rgba(99,179,237,0.14)',  border: 'rgba(99,179,237,0.40)',  text: '#63b3ed' },
    secretary: { bg: 'rgba(255,167,38,0.14)',  border: 'rgba(255,167,38,0.40)',  text: '#ffa726' }
  };

  // ── Public-page detection (Phase X10.1 fix) ─────────────────────────
  // Single source of truth for "is this a pre-auth page that should not
  // render tenant UI (role pill, inactive banner, sidebar)?". Used by
  // injectHeaderButton, injectInactiveBanner, and autoInit as a defense-
  // in-depth guard. Even if any of those is called directly (cached
  // service worker, manual API call, future entry point), the public
  // page check stops tenant UI from leaking onto auth/landing/index/
  // pending/admin (platform layer).
  //
  // Pages classified as "public":
  //   /                — apex (some browsers report "/" for root)
  //   /index           — dashboard router (redirects based on auth)
  //   /auth            — pre-auth login/signup
  //   /landing         — pure marketing (anon access)
  //   /pending         — post-signup waiting page (auth'd but no clinic yet)
  //   /admin           — SaaS platform admin (cross-tenant, not a tenant)
  //
  // Phase X10.2 fix: Cloudflare Pages serves clean URLs by default —
  // sydent.app/landing rewrites internally to landing.html but the
  // browser's window.location.pathname stays as "/landing" (no .html).
  // The first version of this helper required the ".html" suffix and
  // therefore failed on Brave/Chrome desktop where Cloudflare clean URLs
  // were the default rewrite mode. iPhone Safari still worked because
  // when typing the URL directly the pathname kept ".html".
  // The fix: treat ".html" as optional in the regex, so both
  // "/landing" and "/landing.html" classify as public.
  //
  // We also strip an optional trailing slash to handle "/auth.html/"
  // (rare but seen on some CDN edges) and use an explicit leading slash
  // boundary so partial matches like "myauth" don't false-positive.
  // Phase F4 — index.html is the post-auth dashboard, NOT a public page.
  // The pre-auth guard at the top of index.html redirects unauth users to
  // landing.html, so by the time any SyDentLock code runs on / or /index.html,
  // the user is guaranteed authenticated. Listing 'index' here caused the
  // header switch-employee button to disappear from the dashboard (the very
  // place users need it most). The public set is: apex `/` is intentionally
  // excluded too — apex resolves to index.html which is post-auth.
  // Truly public pages: auth, landing, pending, admin (platform), reset-password.
  function isPublicPage() {
    var path = (window.location.pathname || '').toLowerCase();
    if (path.length > 1 && path.charAt(path.length - 1) === '/') {
      path = path.slice(0, -1);
    }
    return /^\/(auth|landing|pending|admin|reset-password)(\.html)?$/.test(path);
  }



  // ── Cache (loaded once per page) ───────────────────────────────
  let _pinHashCache = null;       // SHA-256 hex من DB
  let _pinHashLoaded = false;
  let _doctorsListCache = null;    // active doctors only (for switch picker)
  let _allDoctorsListCache = null; // ALL doctors incl inactive (for name recovery)
  let _employeesListCache = null;  // Phase 5: active employees (for picker)
  let _allEmployeesListCache = null; // Phase 5: all employees incl inactive (recovery)

  // ── Low-level state ────────────────────────────────────────────
  function getRole() {
    try {
      var r = localStorage.getItem(LS_ROLE);
      if (r === 'owner' || r === 'doctor' || r === 'secretary') return r;
    } catch(e) {}
    return 'owner'; // default: جهاز جديد = Owner
  }

  function getDoctorId() {
    try {
      var d = localStorage.getItem(LS_DOCTOR_ID);
      return d && d !== 'null' && d !== 'undefined' ? d : null;
    } catch(e) { return null; }
  }

  // Phase 5: per-employee identity (which specific person is using this device)
  function getEmployeeId() {
    try {
      var e = localStorage.getItem(LS_EMPLOYEE_ID);
      return e && e !== 'null' && e !== 'undefined' ? e : null;
    } catch(err) { return null; }
  }

  // Phase 5: resolve the effective doctor_id for filter/lock purposes.
  // Priority order:
  //   1. LS_DOCTOR_ID  (legacy + Phase 5 with explicit doctor_id)
  //   2. Phase 5 employee.doctor_id from cache (if LS_DOCTOR_ID is missing
  //      but the locked employee has a doctor_id linkage in the DB)
  //   3. null
  //
  // This is critical for provider-reports.html in Phase 5 where a device
  // may have LS_EMPLOYEE_ID set but LS_DOCTOR_ID empty (e.g. employee was
  // created without doctor_id link, or LS_DOCTOR_ID got cleared by an
  // applyRole call that didn't propagate from the employee record).
  function getEffectiveDoctorId() {
    var did = getDoctorId();
    if (did) return did;
    // Fallback: look up the locked employee's doctor_id
    var empId = getEmployeeId();
    if (!empId || !_employeesListCache) return null;
    var emp = _employeesListCache.find(function(e){ return e.id === empId; });
    if (emp && emp.role === 'doctor' && emp.doctor_id) return emp.doctor_id;
    // Also check allEmployees cache (in case employee is deactivated but row exists)
    if (_allEmployeesListCache) {
      var empAny = _allEmployeesListCache.find(function(e){ return e.id === empId; });
      if (empAny && empAny.role === 'doctor' && empAny.doctor_id) return empAny.doctor_id;
    }
    return null;
  }

  function isOwner()     { return getRole() === 'owner'; }
  function isDoctor()    { return getRole() === 'doctor'; }
  function isSecretary() { return getRole() === 'secretary'; }

  // ── Owner's real person name (dynamic, no static "المالك") ─────
  // The owner identity must display the actual person's name, NOT the
  // literal role word "المالك". Resolution order (uses already-loaded
  // caches, no extra query):
  //   1. clinic_employees row with role='owner' (same name shown in the
  //      switch picker — keeps pill + modal in perfect agreement)
  //   2. clinic_doctors row with is_owner=true (fallback)
  //   3. null → callers fall back to ROLE_LABELS.owner
  // Name is used as-is (the stored name already carries the "د" title
  // when the owner is a doctor — avoids double-prefix like "د. د أيهم").
  function getOwnerPersonName() {
    try {
      var eSrc = _employeesListCache || _allEmployeesListCache;
      if (eSrc) {
        var oe = eSrc.find(function(e){ return e.role === 'owner' && e.name; });
        if (oe) return oe.name;
      }
      var dSrc = _doctorsListCache || _allDoctorsListCache;
      if (dSrc) {
        var od = dSrc.find(function(d){ return d.is_owner === true && d.name; });
        if (od) return od.name;
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  // Sync check: is a PIN configured in the DB?
  // Returns false if cache hasn't loaded yet OR if no PIN is set.
  // This is safe-by-default — if we can't confirm a PIN exists, we treat
  // the lock as unconfigured (which means no PIN-required transitions).
  // The cache is preloaded by autoInit() so this returns the correct value
  // by the time the user clicks the lock button.
  function isPinSet() {
    return !!(_pinHashLoaded && _pinHashCache);
  }

  // ── Hierarchy: Owner=3 > Doctor=2 = Secretary=2 ───────────────
  // الفلسفة: Owner → أي شي بدون PIN (تخفيض). أي ترقية → PIN.
  // التبديل الأفقي (Doctor → Secretary أو العكس) → PIN.
  // التبديل بين أطباء (Doctor:A → Doctor:B) → PIN.
  // ✱ Important: if NO PIN is configured in the DB, the lock is effectively
  //   disabled — any transition is free (otherwise Doctor/Secretary devices
  //   could lock themselves out before setup completes).
  function requirePin(targetRole, targetDoctorId) {
    // Lock not configured → no PIN required ever (prevents lockout if user
    // switches modes before setting up a PIN)
    if (!isPinSet()) return false;

    var curRole = getRole();
    var curDoctorId = getDoctorId();

    // Same exact state — no-op, no PIN
    if (curRole === targetRole) {
      if (targetRole === 'doctor') {
        if ((curDoctorId || null) === (targetDoctorId || null)) return false;
        // تبديل بين أطباء — PIN
        return true;
      }
      return false;
    }

    // Owner → أي شي = تخفيض = بدون PIN
    if (curRole === 'owner') return false;

    // Secretary/Doctor → Owner = ترقية = PIN
    if (targetRole === 'owner') return true;

    // أفقي (Secretary ↔ Doctor) = PIN
    return true;
  }

  // ── PIN hashing (SHA-256 hex) ──────────────────────────────────
  async function hashPin(pin) {
    if (typeof pin !== 'string') pin = String(pin || '');
    var enc = new TextEncoder();
    var buf = await crypto.subtle.digest('SHA-256', enc.encode(pin));
    var arr = Array.from(new Uint8Array(buf));
    return arr.map(function(b){ return b.toString(16).padStart(2,'0'); }).join('');
  }

  // ── DB: load/save PIN hash on clinic_settings ─────────────────
  async function loadPinHash() {
    if (_pinHashLoaded) return _pinHashCache;
    try {
      var user = await window.sbGetUser();
      if (!user) return null;
      var res = await window.sb.from('clinic_settings')
        .select('lock_pin_hash')
        .eq('owner_id', user.id)
        .maybeSingle();
      if (res.error) {
        // Migration not applied yet — fall back to "no PIN configured"
        var m = (res.error.message || '') + ' ' + (res.error.code || '');
        if (!/lock_pin_hash|42703|PGRST/i.test(m)) {
          console.warn('[SyDentLock] loadPinHash:', res.error);
        }
        _pinHashCache = null;
      } else {
        _pinHashCache = res.data && res.data.lock_pin_hash || null;
      }
    } catch(e) {
      console.warn('[SyDentLock] loadPinHash exception:', e);
      _pinHashCache = null;
    }
    _pinHashLoaded = true;
    return _pinHashCache;
  }

  // Force reload — used after PIN set/change
  function invalidatePinCache() {
    _pinHashLoaded = false;
    _pinHashCache = null;
  }

  async function savePinHash(newHash) {
    var user = await window.sbGetUser();
    if (!user) throw new Error('not authenticated');
    var res = await window.sb.from('clinic_settings')
      .upsert({ owner_id: user.id, lock_pin_hash: newHash }, { onConflict: 'owner_id' })
      .select('lock_pin_hash')
      .maybeSingle();
    if (res.error) throw res.error;
    _pinHashCache = newHash;
    _pinHashLoaded = true;
    return true;
  }

  // ── Rate limit ─────────────────────────────────────────────────
  function isInCooldown() {
    try {
      var until = parseInt(localStorage.getItem(LS_COOLDOWN) || '0', 10);
      return !!(until && Date.now() < until);
    } catch(e) { return false; }
  }

  function cooldownSecondsLeft() {
    try {
      var until = parseInt(localStorage.getItem(LS_COOLDOWN) || '0', 10);
      var ms = until - Date.now();
      return ms > 0 ? Math.ceil(ms / 1000) : 0;
    } catch(e) { return 0; }
  }

  function recordFail() {
    try {
      var n = parseInt(localStorage.getItem(LS_FAIL_COUNT) || '0', 10);
      n = (isNaN(n) ? 0 : n) + 1;
      localStorage.setItem(LS_FAIL_COUNT, String(n));
      if (n >= MAX_FAILS) {
        localStorage.setItem(LS_COOLDOWN, String(Date.now() + COOLDOWN_MS));
      }
      return n;
    } catch(e) { return 0; }
  }

  function resetFails() {
    try {
      localStorage.removeItem(LS_FAIL_COUNT);
      localStorage.removeItem(LS_COOLDOWN);
    } catch(e) {}
  }

  // ── Verify PIN ─────────────────────────────────────────────────
  async function verifyPin(pin) {
    if (isInCooldown()) {
      return { ok: false, reason: 'cooldown', secondsLeft: cooldownSecondsLeft() };
    }
    var pinStr = String(pin || '').trim();
    if (!/^\d{4,6}$/.test(pinStr)) {
      return { ok: false, reason: 'invalid_format' };
    }
    var dbHash = await loadPinHash();
    if (!dbHash) {
      return { ok: false, reason: 'no_pin_set' };
    }
    var inputHash = await hashPin(pinStr);
    if (inputHash === dbHash) {
      resetFails();
      return { ok: true };
    }
    var fails = recordFail();
    if (fails >= MAX_FAILS) {
      return { ok: false, reason: 'cooldown', secondsLeft: cooldownSecondsLeft() };
    }
    return { ok: false, reason: 'wrong', failsLeft: MAX_FAILS - fails };
  }

  // ── Phase 5: Verify a specific employee's PIN ────────────────
  // Used by the new per-employee lock modal. Each employee has their
  // own pin_hash in clinic_employees. This function verifies against
  // THAT employee's hash, not the clinic-wide one.
  // Returns same shape as verifyPin() for UI consistency.
  // Rate limiting is shared (same fail count regardless of which employee).
  async function verifyEmployeePin(employee, pin) {
    if (isInCooldown()) {
      return { ok: false, reason: 'cooldown', secondsLeft: cooldownSecondsLeft() };
    }
    if (!employee || !employee.pin_hash) {
      return { ok: false, reason: 'no_pin_set' };
    }
    var pinStr = String(pin || '').trim();
    if (!/^\d{4,6}$/.test(pinStr)) {
      return { ok: false, reason: 'invalid_format' };
    }
    var inputHash = await hashPin(pinStr);
    if (inputHash === employee.pin_hash) {
      resetFails();
      return { ok: true };
    }
    var fails = recordFail();
    if (fails >= MAX_FAILS) {
      return { ok: false, reason: 'cooldown', secondsLeft: cooldownSecondsLeft() };
    }
    return { ok: false, reason: 'wrong', failsLeft: MAX_FAILS - fails };
  }

  // ── Apply a role transition (after PIN check, if any) ─────────
  // Phase 5: now also accepts employeeId. If provided, stored in localStorage.
  // Backward compat: if employeeId is undefined, the old value is preserved
  // for backward compat (used by legacy callers like settings.html setup flow).
  // If null is explicitly passed, the employeeId is cleared.
  function applyRole(newRole, newDoctorId, newEmployeeId) {
    try {
      if (newRole === 'doctor') {
        localStorage.setItem(LS_ROLE, 'doctor');
        if (newDoctorId) localStorage.setItem(LS_DOCTOR_ID, newDoctorId);
        else             localStorage.removeItem(LS_DOCTOR_ID);
      } else if (newRole === 'secretary') {
        localStorage.setItem(LS_ROLE, 'secretary');
        localStorage.removeItem(LS_DOCTOR_ID);
      } else {
        // owner
        localStorage.setItem(LS_ROLE, 'owner');
        localStorage.removeItem(LS_DOCTOR_ID);
      }
      // Phase 5: employee identity (explicit: undefined=preserve, null=clear, value=set)
      if (newEmployeeId === null) {
        localStorage.removeItem(LS_EMPLOYEE_ID);
      } else if (typeof newEmployeeId === 'string' && newEmployeeId.length > 0) {
        localStorage.setItem(LS_EMPLOYEE_ID, newEmployeeId);
      }
    } catch(e) {
      console.error('[SyDentLock] applyRole failed:', e);
    }
  }

  // ── DOM guards: data-role-block / data-role-page / data-role-disable ──
  function applyRoleGuards() {
    var role = getRole();

    // Hide elements blocked for this role: data-role-block="secretary doctor"
    var hideEls = document.querySelectorAll('[data-role-block]');
    for (var i = 0; i < hideEls.length; i++) {
      var blocked = (hideEls[i].getAttribute('data-role-block') || '').split(/\s+/);
      if (blocked.indexOf(role) >= 0) {
        hideEls[i].style.display = 'none';
        hideEls[i].setAttribute('data-role-hidden', '1');
      } else if (hideEls[i].getAttribute('data-role-hidden') === '1') {
        hideEls[i].style.display = '';
        hideEls[i].removeAttribute('data-role-hidden');
      }
    }

    // Disable interaction: data-role-disable="secretary"
    var disableEls = document.querySelectorAll('[data-role-disable]');
    for (var j = 0; j < disableEls.length; j++) {
      var disabled = (disableEls[j].getAttribute('data-role-disable') || '').split(/\s+/);
      var shouldDisable = disabled.indexOf(role) >= 0;
      if (shouldDisable) {
        disableEls[j].setAttribute('disabled', 'disabled');
        disableEls[j].style.opacity = '0.55';
        disableEls[j].style.cursor = 'not-allowed';
      } else if (disableEls[j].hasAttribute('disabled') && disableEls[j].getAttribute('data-role-disabled-by-lock') === '1') {
        disableEls[j].removeAttribute('disabled');
        disableEls[j].style.opacity = '';
        disableEls[j].style.cursor = '';
        disableEls[j].removeAttribute('data-role-disabled-by-lock');
      }
      if (shouldDisable) disableEls[j].setAttribute('data-role-disabled-by-lock', '1');
    }

    // Phase 4.1: also re-apply inactive-doctor guards (re-renders pick them up)
    if (isDoctorAccountInactive()) {
      applyInactiveActionGuards();
    }
  }

  // ── Page guard: redirect if role is not allowed on this page ─────
  // Allowed roles passed as array, e.g. ['owner']
  function guardPage(allowedRoles) {
    var role = getRole();
    if (allowedRoles.indexOf(role) < 0) {
      showBlockedScreen(role);
      return false;
    }
    return true;
  }

  function showBlockedScreen(role) {
    try {
      document.body.innerHTML =
        '<div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--bg,#0a1628);padding:24px;font-family:\'Cairo\',sans-serif;text-align:center;direction:rtl;">' +
          '<div style="font-size:72px;margin-bottom:16px;">🔒</div>' +
          '<div style="font-size:22px;font-weight:800;color:var(--text,#e1f4ee);margin-bottom:10px;">لا تملك صلاحية</div>' +
          '<div style="font-size:14px;color:var(--text2,#8a9ab5);margin-bottom:28px;max-width:360px;line-height:1.7;">' +
            'الوضع الحالي (' + (ROLE_LABELS[role] || role) + ') لا يسمح بالوصول إلى هذه الصفحة.' +
          '</div>' +
          '<a href="index.html" style="padding:12px 24px;background:var(--green,var(--green));border-radius:10px;color:#0a1628;font-size:14px;font-weight:800;text-decoration:none;margin-bottom:10px;">' +
            '↩ العودة للصفحة الرئيسية' +
          '</a>' +
          '<button onclick="window.SyDentLock.openSwitchModal()" style="padding:10px 22px;background:transparent;border:1px solid var(--border2,rgba(255,255,255,0.18));border-radius:10px;color:var(--text2,#8a9ab5);font-family:\'Cairo\',sans-serif;font-size:13px;cursor:pointer;margin-top:8px;">' +
            '🔓 تبديل الوضع' +
          '</button>' +
        '</div>';
    } catch(e) {
      console.error('[SyDentLock] showBlockedScreen failed:', e);
    }
  }

  // ── Load doctors list (for Doctor role picker) ────────────────
  // Fetches ALL doctors (active + inactive). The active subset is used
  // for the role-switch picker; the full list is used for name recovery
  // when a device is locked to a doctor who was just deactivated.
  async function loadDoctors() {
    if (_doctorsListCache) return _doctorsListCache;
    try {
      var user = await window.sbGetUser();
      if (!user) return [];
      var res = await window.sb.from('clinic_doctors')
        .select('id, name, is_active, is_owner')
        .eq('owner_id', user.id)
        .order('name');
      if (res.error) {
        console.warn('[SyDentLock] loadDoctors:', res.error);
        return [];
      }
      _allDoctorsListCache = res.data || [];
      _doctorsListCache = _allDoctorsListCache.filter(function(d){ return d.is_active !== false; });
      return _doctorsListCache;
    } catch(e) {
      return [];
    }
  }

  // ── Phase 5: Load employees list (for per-employee picker) ────
  // Fetches ALL employees (active + inactive). The active subset is used
  // for the lock modal picker; the full list is used for name recovery
  // and audit-log historical display.
  // Returns [] silently if Migration 9.1 is not applied yet (graceful fallback).
  // ────────────────────────────────────────────────────────────────────
  // Phase 7.4: Lock-mode picker only shows employees with system access.
  // Employees marked has_system_access=false are HR-only (payroll/reports
  // tracking) and never appear in the lock-mode role switcher.
  //
  // Migration 21 added the has_system_access column. Graceful fallback:
  // if Migration 21 hasn't run yet, fall back to loading all employees
  // (pre-7.4 behavior — anyone with a pin_hash was effectively a user).
  // ────────────────────────────────────────────────────────────────────
  async function loadEmployees() {
    if (_employeesListCache) return _employeesListCache;
    try {
      var user = await window.sbGetUser();
      if (!user) return [];
      // Phase 7.4: filter on has_system_access=true so HR-only employees
      // don't pollute the role picker. Owners ALWAYS appear regardless of
      // the flag (defense-in-depth: prevents accidental lockout if an UPDATE
      // somehow flips an owner's access to false — Rule #16).
      var res = await window.sb.from('clinic_employees')
        .select('id, name, role, doctor_id, pin_hash, is_active, has_system_access')
        .eq('owner_id', user.id)
        .or('has_system_access.eq.true,role.eq.owner')
        .order('role', { ascending: true })
        .order('name', { ascending: true });
      // Pre-Migration-21 fallback: if has_system_access column doesn't
      // exist, retry without the filter (old behavior). 42703 = column
      // not found; PGRST205 = schema cache miss.
      if (res.error && /42703|has_system_access|PGRST/i.test((res.error.message || '') + ' ' + (res.error.code || ''))) {
        console.warn('[SyDentLock] has_system_access column missing — falling back to all-employees mode');
        res = await window.sb.from('clinic_employees')
          .select('id, name, role, doctor_id, pin_hash, is_active')
          .eq('owner_id', user.id)
          .order('role', { ascending: true })
          .order('name', { ascending: true });
      }
      if (res.error) {
        // Migration not applied yet — silently fall back to empty list
        var m = (res.error.message || '') + ' ' + (res.error.code || '');
        if (!/clinic_employees|42P01|PGRST205/i.test(m)) {
          console.warn('[SyDentLock] loadEmployees:', res.error);
        }
        return [];
      }
      _allEmployeesListCache = res.data || [];
      _employeesListCache = _allEmployeesListCache.filter(function(e){ return e.is_active !== false; });
      return _employeesListCache;
    } catch(e) {
      console.warn('[SyDentLock] loadEmployees exception:', e);
      return [];
    }
  }

  // Force reload of employees cache (after add/edit/delete in employees.html)
  function invalidateEmployeesCache() {
    _employeesListCache = null;
    _allEmployeesListCache = null;
  }

  // ── Phase X14.2: self-heal the owner's clinic_employees row ───
  // The role-switch picker, the per-employee PIN model, and the owner PIN UI
  // in employees.html (saveOwnerPin) all assume the owner has a
  // clinic_employees row with role='owner'. Clinics onboarded before that row
  // existed — or where it was never inserted — break in subtle ways: the owner
  // disappears from the switch modal, "saveOwnerPin" reports "owner account
  // not found", and a device can get stuck read-only. This idempotent helper
  // creates the row exactly once. It is safe: RLS allows owner_id=auth.uid(),
  // and a UNIQUE partial index (uq_clinic_employees_one_owner) guarantees at
  // most one owner row — concurrent inserts collide on 23505 and are ignored.
  // Callers should `await loadDoctors()` first so getOwnerPersonName() can
  // resolve the owner's name from clinic_doctors.is_owner.
  var _ownerRowEnsured = false;
  async function ensureOwnerEmployee() {
    if (_ownerRowEnsured) return;
    try {
      var user = await window.sbGetUser();
      if (!user) return;

      // Already present? Query directly (caches may be empty this early).
      var existing = await window.sb.from('clinic_employees')
        .select('id')
        .eq('owner_id', user.id)
        .eq('role', 'owner')
        .limit(1);
      if (existing.error) {
        // Table missing (pre-Migration-9.1) → nothing to heal; bail quietly.
        return;
      }
      if (existing.data && existing.data.length > 0) {
        _ownerRowEnsured = true;
        return;
      }

      // Resolve the owner's display name: clinic_doctors.is_owner (warm cache
      // from the caller's loadDoctors()), then auth metadata, then a default.
      var ownerNm = getOwnerPersonName();
      if (!ownerNm) {
        var md = (user.user_metadata || {});
        ownerNm = md.full_name || md.name || md.clinic_name || ROLE_LABELS.owner;
      }

      // Preserve any existing clinic-level lock PIN as the owner's pin_hash so
      // an already-configured lock keeps working once the row exists.
      var existingPin = await loadPinHash();

      var row = {
        owner_id: user.id,
        name: ownerNm,
        role: 'owner',
        pin_hash: existingPin || null,
        is_active: true,
        has_system_access: true
      };
      var ins = await window.sb.from('clinic_employees').insert(row).select('id').single();
      if (ins.error) {
        var m = (ins.error.message || '') + ' ' + (ins.error.code || '');
        // has_system_access missing (pre-Migration-21) → retry without it.
        if (/42703/.test(m)) {
          delete row.has_system_access;
          ins = await window.sb.from('clinic_employees').insert(row).select('id').single();
        }
      }
      if (ins.error) {
        var m2 = (ins.error.message || '') + ' ' + (ins.error.code || '');
        // 23505 = unique violation: another tab/device created it first → fine.
        if (!/23505/.test(m2)) {
          console.warn('[SyDentLock] ensureOwnerEmployee insert:', ins.error);
          return;
        }
      }
      _ownerRowEnsured = true;
      invalidateEmployeesCache();
    } catch (e) {
      console.warn('[SyDentLock] ensureOwnerEmployee exception:', e);
    }
  }

  // Get current employee object (or null if not set / migration not applied)
  // This is the snapshot used for audit logging.
  async function getCurrentEmployee() {
    var eid = getEmployeeId();
    if (!eid) return null;
    var list = await loadEmployees();
    return (list || []).find(function(e){ return e.id === eid; })
        || (_allEmployeesListCache || []).find(function(e){ return e.id === eid; })
        || null;
  }

  // ── CSS injection (once per page) ─────────────────────────────
  function injectCSS() {
    if (document.getElementById('sydent-lock-css')) return;
    var style = document.createElement('style');
    style.id = 'sydent-lock-css';
    style.textContent =
      '.sd-lock-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 12px;border-radius:10px;font-family:\'Cairo\',sans-serif;font-size:13px;font-weight:800;cursor:pointer;transition:transform .15s,filter .15s;border:1.5px solid transparent;background:transparent;white-space:nowrap;}' +
      '.sd-lock-btn:hover{transform:translateY(-1px);filter:brightness(1.1);}' +
      '.sd-lock-btn.sd-owner{background:rgba(var(--green-rgb),0.14);border-color:rgba(var(--green-rgb),0.40);color:var(--green,var(--green));}' +
      '.sd-lock-btn.sd-doctor{background:rgba(99,179,237,0.14);border-color:rgba(99,179,237,0.40);color:var(--blue,#63b3ed);}' +
      '.sd-lock-btn.sd-secretary{background:rgba(255,167,38,0.14);border-color:rgba(255,167,38,0.40);color:var(--orange,#ffa726);}' +
      '.sd-lock-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;direction:rtl;font-family:\'Cairo\',sans-serif;}' +
      '.sd-lock-modal{background:var(--bg2,#0f2038);border:1.5px solid var(--border2,rgba(var(--green-rgb),0.25));border-radius:14px;padding:24px;max-width:440px;width:100%;color:var(--text,#e1f4ee);max-height:90vh;overflow-y:auto;box-shadow:var(--shadow-modal,0 20px 60px rgba(0,0,0,0.4));}' +
      '.sd-lock-modal h3{margin:0 0 6px;font-size:18px;font-weight:800;color:var(--green,var(--green));}' +
      '.sd-lock-modal .sd-cur{font-size:13px;color:var(--text2,#8a9ab5);margin-bottom:16px;padding:10px 12px;background:var(--green-dim,rgba(var(--green-rgb),0.06));border-radius:8px;}' +
      '.sd-lock-modal .sd-opt{display:block;padding:12px 14px;margin-bottom:8px;background:var(--bg3,#132840);border:1.5px solid transparent;border-radius:10px;cursor:pointer;transition:all .15s;' +
        // Defense vs global label rules (patients.html: label{font-size:13px;
        // font-weight:600;color:var(--text2)}, appointments.html: label{
        // font-size:12px;font-weight:700;color:var(--text2)}). Since .sd-opt
        // IS a <label>, those global rules apply and dim the text + shrink it.
        // Force the modal's own typography explicitly.
        'color:var(--text,#e1f4ee);font-size:14px;font-weight:600;line-height:1.5;}' +
      '.sd-lock-modal .sd-opt:hover{border-color:rgba(var(--green-rgb),0.30);background:rgba(var(--green-rgb),0.05);}' +
      '.sd-lock-modal .sd-opt input[type=radio]{margin-left:8px;accent-color:var(--green,var(--green));' +
        // Defense vs global input resets (patients.html / appointments.html
        // define `input, select, textarea { width:100%; appearance:none }`
        // which would otherwise hide the radio circle AND stretch it to
        // 100% width, breaking the layout). Force native radio rendering.
        'width:auto !important;-webkit-appearance:radio !important;' +
        '-moz-appearance:radio !important;appearance:radio !important;' +
        'background:transparent !important;border:none !important;' +
        'padding:0 !important;height:auto !important;vertical-align:middle;' +
        'flex-shrink:0;}' +
      '.sd-lock-modal .sd-opt.sd-active{border-color:rgba(var(--green-rgb),0.55);background:rgba(var(--green-rgb),0.08);}' +
      '.sd-lock-modal .sd-sub{padding:8px 12px 8px 28px;margin-top:6px;display:none;}' +
      '.sd-lock-modal .sd-opt.sd-active .sd-sub{display:block;}' +
      '.sd-lock-modal select{width:100%;padding:9px 10px;background:var(--bg,#0a1628);border:1px solid rgba(var(--green-rgb),0.20);border-radius:8px;color:var(--text,#e1f4ee);font-family:\'Cairo\',sans-serif;font-size:13px;}' +
      '.sd-lock-modal .sd-pin-row{margin-top:14px;padding:12px;background:rgba(99,179,237,0.06);border:1px solid rgba(99,179,237,0.25);border-radius:10px;}' +
      '.sd-lock-modal .sd-pin-row label{display:block;font-size:12px;color:var(--text2,#8a9ab5);margin-bottom:6px;font-weight:700;}' +
      '.sd-lock-modal .sd-pin-row input{width:100%;padding:10px 12px;background:var(--bg,#0a1628);border:1.5px solid rgba(99,179,237,0.30);border-radius:8px;color:var(--text,#e1f4ee);font-family:\'Cairo\',sans-serif;font-size:18px;font-weight:800;text-align:center;letter-spacing:8px;-webkit-appearance:none;appearance:none;}' +
      '.sd-lock-modal .sd-msg{font-size:12px;color:var(--red,#ef5350);margin-top:8px;min-height:18px;font-weight:700;}' +
      '.sd-lock-modal .sd-msg.sd-ok{color:var(--green,var(--green));}' +
      '.sd-lock-modal .sd-actions{display:flex;gap:10px;margin-top:18px;}' +
      '.sd-lock-modal .sd-btn{flex:1;padding:11px 14px;border-radius:10px;font-family:\'Cairo\',sans-serif;font-size:13px;font-weight:800;cursor:pointer;border:1.5px solid transparent;}' +
      '.sd-lock-modal .sd-btn-cancel{background:transparent;border-color:var(--border2,rgba(255,255,255,0.18));color:var(--text2,#8a9ab5);}' +
      '.sd-lock-modal .sd-btn-cancel:hover{background:var(--bg3,rgba(255,255,255,0.06));}' +
      '.sd-lock-modal .sd-btn-primary{background:var(--green,var(--green));color:#0a1628;}' +
      '.sd-lock-modal .sd-btn-primary:hover{filter:brightness(1.08);}' +
      '.sd-lock-modal .sd-btn-primary:disabled{opacity:0.5;cursor:not-allowed;}';
    document.head.appendChild(style);
  }

  // ── Inject header lock button into topbar (or fallback container) ──
  function injectHeaderButton() {
    // Phase X10.1: defense-in-depth. The role pill ("المالك 👑"/"الطبيب"/
    // "السكرتيرة") must NEVER render on public pages. Even if a stale
    // cached supabase-init.js bypasses the autoInit() skip, or someone
    // calls window.SyDentLock.injectHeaderButton() directly, this guard
    // stops the leak at the source.
    if (isPublicPage()) return;
    if (document.getElementById('sdLockBtn')) return; // already injected
    injectCSS();
    var role = getRole();
    var btn = document.createElement('button');
    btn.id = 'sdLockBtn';
    btn.className = 'sd-lock-btn sd-' + role;
    btn.type = 'button';
    btn.title = 'تبديل الوضع';
    btn.onclick = function(){ openSwitchModal(); };
    refreshHeaderButton(btn);

    // Insertion strategy: topbar → header-actions → header → body
    var anchor = document.querySelector('.topbar') ||
                 document.querySelector('.header-actions') ||
                 document.querySelector('.header') ||
                 document.querySelector('header');
    if (anchor) {
      anchor.appendChild(btn);
    } else {
      // floating fallback
      btn.style.position = 'fixed';
      btn.style.top = '12px';
      btn.style.left = '12px';
      btn.style.zIndex = '300';
      document.body.appendChild(btn);
    }
  }

  function refreshHeaderButton(btn) {
    btn = btn || document.getElementById('sdLockBtn');
    if (!btn) return;
    var role = getRole();
    var inactive = false;
    btn.className = 'sd-lock-btn sd-' + role;
    var label = ROLE_LABELS[role] || role;
    var icon  = ROLE_ICONS[role]  || '🔒';

    // Phase 5: if we have a specific employee identity locked in, prefer that name
    var empId = getEmployeeId();
    var ownerMode = isOwner();

    if (ownerMode) {
      // ── Phase 7.6 Fix: Owner pill never enters Phase 5 employee lookup ──
      // The owner's identity comes from doctors (is_owner=true), NOT from
      // clinic_employees. Even if LS_EMPLOYEE_ID is set on this device (from
      // a pre-Phase-5 setup or stale state), we must NEVER label the owner
      // as "(محذوف)" because the owner has no clinic_employees row by design.
      //
      // Resolution order for the owner's display name:
      //   1. getOwnerPersonName() → real person name (employees role=owner,
      //      else doctors is_owner=true). Works even when LS_DOCTOR_ID is
      //      unset on a default device — this is the primary path now.
      //   2. _doctorsListCache lookup by LS_DOCTOR_ID → "د. {name}" (legacy)
      //   3. _allDoctorsListCache fallback (inactive owner doctor row)
      //   4. Default ROLE_LABELS.owner ("المالك") — NEVER "(محذوف)"
      var ownerName = getOwnerPersonName();
      if (ownerName) {
        label = ownerName; // name used as-is (already carries "د" title if doctor)
      } else if (_doctorsListCache) {
        var ownerDid = getDoctorId();
        var ownerDoc = ownerDid
          ? _doctorsListCache.find(function(x){ return x.id === ownerDid; })
          : null;
        if (ownerDoc && ownerDoc.name) {
          label = 'د. ' + ownerDoc.name;
        } else if (ownerDid && _allDoctorsListCache) {
          var ownerAny = _allDoctorsListCache.find(function(x){ return x.id === ownerDid; });
          if (ownerAny && ownerAny.name) label = 'د. ' + ownerAny.name;
        }
      }
      // icon stays as ROLE_ICONS.owner (👑), inactive stays false
    } else if (empId && _employeesListCache) {
      var emp = (_employeesListCache || []).find(function(e){ return e.id === empId; });
      if (emp && emp.name) {
        // Active employee → show their name + role icon.
        // The pill only turns red when the EMPLOYEE row is deactivated
        // (toggled from employees.html).
        label = emp.name;
        icon = ROLE_ICONS[emp.role] || icon;
      } else if (_allEmployeesListCache) {
        // Employee might be deactivated OR fully deleted → name recovery
        var empAny = (_allEmployeesListCache || []).find(function(e){ return e.id === empId; });
        if (empAny && empAny.name) {
          // Deactivated but row still exists → show name with (معطّل)
          label = empAny.name + ' (معطّل)';
          icon = ROLE_ICONS[empAny.role] || icon;
          inactive = true;
        } else {
          // Fully deleted by owner from another device → name unrecoverable
          label = (ROLE_LABELS[role] || 'موظف') + ' (محذوف)';
          inactive = true;
        }
      }
    } else if (role === 'doctor' && _doctorsListCache) {
      // Legacy fallback: device locked to a doctor but no employee_id yet
      var did = getDoctorId();
      var d = (_doctorsListCache || []).find(function(x){ return x.id === did; });
      if (d && d.name) {
        label = 'د. ' + d.name;
      } else if (did) {
        // Doctor account is inactive — try to recover the name from
        // _allDoctorsListCache (loaded by loadAllDoctors), else show generic.
        var dAny = (_allDoctorsListCache || []).find(function(x){ return x.id === did; });
        if (dAny && dAny.name) label = 'د. ' + dAny.name + ' (معطّل)';
        else label = ROLE_LABELS.doctor + ' (معطّل)';
        inactive = true;
      }
    }
    if (inactive) {
      // Red accent overlay for inactive doctor/employee
      btn.style.borderColor = '#ef5350';
      btn.style.background = 'rgba(239,83,80,0.14)';
      btn.style.color = '#ef5350';
    } else {
      btn.style.borderColor = '';
      btn.style.background = '';
      btn.style.color = '';
    }
    // Escape label to prevent XSS via doctor/employee names (defense per قاعدة #14)
    btn.innerHTML = '<span>' + escapeHtmlLock(icon) + '</span><span>' + escapeHtmlLock(label) + '</span>';
  }

  // ── A11y enhancer for the lock modal ──────────────────────────
  // Phase 6 M — Observation N: Focus trap + Escape + restore focus.
  // Applies the four missing a11y bits to the lock modal overlay:
  //   1. aria-modal="true" on the inner dialog
  //   2. Focus trap — Tab/Shift+Tab cycle within the modal only
  //   3. Restore focus to the element that opened the modal on close
  //   4. Auto-focus the first interactive element if no input is shown yet
  //
  // Returns a `cleanup` function the caller must invoke when removing the
  // modal so we clear the keydown listener and restore focus.
  //
  // The caller already wires Escape close + outside-click close — this
  // helper does NOT duplicate those; it only adds keyboard navigation.
  function _a11yEnhanceModal(ov) {
    var dialog = ov.querySelector('.sd-lock-modal');
    if (dialog) dialog.setAttribute('aria-modal', 'true');

    // Capture the element that had focus before the modal opened so we
    // can restore it on close (proper a11y pattern).
    var prevFocus = document.activeElement;

    // Build a fresh list of focusable elements on each Tab keydown.
    // (Building dynamically handles the case where #sdPinRow toggles
    //  visibility based on radio selection — its input enters/exits the
    //  tab cycle live.)
    function getFocusable() {
      var sel = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
      var nodes = ov.querySelectorAll(sel);
      var out = [];
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        // Skip hidden elements (display:none / parent hidden / radio in hidden row)
        if (el.offsetParent === null && el.tagName !== 'INPUT') continue;
        if (el.disabled) continue;
        out.push(el);
      }
      return out;
    }

    function trapHandler(e) {
      if (e.key !== 'Tab' && e.keyCode !== 9) return;
      var list = getFocusable();
      if (!list.length) { e.preventDefault(); return; }
      var first = list[0];
      var last = list[list.length - 1];
      var active = document.activeElement;
      // If focus is outside the modal entirely, pull it back in.
      if (!ov.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
      if (e.shiftKey) {
        if (active === first) { e.preventDefault(); last.focus(); }
      } else {
        if (active === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', trapHandler);

    // Cleanup: remove listener + restore focus to opener.
    // Caller invokes this in their existing closeModal().
    return function cleanup() {
      document.removeEventListener('keydown', trapHandler);
      try {
        if (prevFocus && typeof prevFocus.focus === 'function' && document.body.contains(prevFocus)) {
          prevFocus.focus();
        }
      } catch (e) { /* ignore */ }
    };
  }

  // ── Switch modal ──────────────────────────────────────────────
  // Phase 5: employee-aware modal. Lists each employee by NAME (not role),
  // and verifies that employee's own pin_hash. Falls back to legacy
  // role-picker if no employees are present (Migration 9.1 not run).
  async function openSwitchModal() {
    injectCSS();
    var employees = await loadEmployees();

    // If no employees → legacy modal (backward compat for fresh installs
    // pre-Phase 5 migration). This path uses the old role-picker UI.
    if (!employees || employees.length === 0) {
      return openSwitchModalLegacy();
    }

    var curRole = getRole();
    var curDoctorId = getDoctorId();
    var curEmployeeId = getEmployeeId();
    var hasPinSet = !!(await loadPinHash());

    // Remove any existing modal
    var ex = document.getElementById('sdLockModal');
    if (ex) ex.remove();

    var ov = document.createElement('div');
    ov.id = 'sdLockModal';
    ov.className = 'sd-lock-modal-overlay';

    // Sort: owner first, then doctors, then secretaries; alpha within group
    var sorted = employees.slice().sort(function(a, b){
      var rank = { owner: 1, doctor: 2, secretary: 3 };
      var ra = rank[a.role] || 99, rb = rank[b.role] || 99;
      if (ra !== rb) return ra - rb;
      return String(a.name).localeCompare(String(b.name), 'ar');
    });

    // Determine which one is currently active in the device.
    // Priority:
    //   1. exact employee_id match (Phase 5 mode)
    //   2. backward compat for legacy devices (no employee_id):
    //      - role=doctor → match by doctor_id
    //      - role=owner → match the one owner record (UNIQUE constraint guarantees)
    //      - role=secretary → ambiguous (multiple secretaries possible); resolve to
    //        FIRST secretary in alpha order to avoid double-selection in UI
    var _legacySecretaryClaimedId = null;
    function isCurrent(emp) {
      if (curEmployeeId && emp.id === curEmployeeId) return true;
      if (curEmployeeId) return false; // employee_id set but doesn't match
      // Backward compat: no employee_id yet
      if (emp.role !== curRole) return false;
      if (emp.role === 'doctor') return emp.doctor_id === curDoctorId;
      if (emp.role === 'owner') return true; // single owner per clinic (UNIQUE)
      // secretary: claim only the first one encountered (sorted alpha)
      if (emp.role === 'secretary') {
        if (_legacySecretaryClaimedId === null) {
          _legacySecretaryClaimedId = emp.id;
          return true;
        }
        return emp.id === _legacySecretaryClaimedId;
      }
      return false;
    }

    var optionsHtml = '';
    sorted.forEach(function(emp){
      var current = isCurrent(emp);
      var icon = ROLE_ICONS[emp.role] || '👤';
      var roleLabel = ROLE_LABELS[emp.role] || emp.role;
      var hasPinForThisEmployee = !!emp.pin_hash;
      var pinWarn = (!hasPinForThisEmployee)
        ? '<span style="color:var(--yellow,#f5c842);font-size:11px;margin-right:6px;">⚠ بدون PIN</span>'
        : '';
      // Owner row: the 👑 crown already signals ownership — omit the
      // "المالك" word badge entirely. Doctors/secretaries keep their badge.
      var roleBadge = (emp.role === 'owner')
        ? ''
        : '<span style="color:var(--text2,#8a9ab5);font-size:11px;margin-right:8px;">' + escapeHtmlLock(roleLabel) + '</span>';
      optionsHtml +=
        '<label class="sd-opt' + (current ? ' sd-active' : '') + '" data-employee-id="' + escapeHtmlLock(emp.id) + '">' +
          '<input type="radio" name="sdEmpSel" value="' + escapeHtmlLock(emp.id) + '"' + (current ? ' checked' : '') + '>' +
          '<span style="font-weight:800;">' + icon + ' ' + escapeHtmlLock(emp.name) + '</span>' +
          roleBadge +
          pinWarn +
        '</label>';
    });

    // Current employee display.
    // Owner → show the real name WITHOUT the "(المالك)" suffix (crown only).
    // Other roles keep "name (role)". If no current employee row resolved,
    // fall back to the owner's real name (getOwnerPersonName) before the
    // static role word.
    var curEmp = sorted.find(isCurrent);
    var curDisplay;
    if (curEmp) {
      curDisplay = (curEmp.role === 'owner')
        ? ((ROLE_ICONS[curEmp.role] || '') + ' ' + curEmp.name)
        : ((ROLE_ICONS[curEmp.role] || '') + ' ' + curEmp.name + ' (' + (ROLE_LABELS[curEmp.role] || curEmp.role) + ')');
    } else if (curRole === 'owner') {
      var curOwnerName = getOwnerPersonName();
      curDisplay = (ROLE_ICONS.owner || '') + ' ' + (curOwnerName || ROLE_LABELS.owner);
    } else {
      curDisplay = (ROLE_ICONS[curRole] || '') + ' ' + (ROLE_LABELS[curRole] || curRole);
    }

    ov.innerHTML =
      '<div class="sd-lock-modal" role="dialog" aria-label="تبديل الموظف" aria-labelledby="sdModalTitle">' +
        '<h3 id="sdModalTitle">🔓 تبديل الموظف</h3>' +
        '<div class="sd-cur">الموظف الحالي: ' + escapeHtmlLock(curDisplay) + '</div>' +
        optionsHtml +
        '<div class="sd-pin-row" id="sdPinRow" style="display:none;">' +
          '<label>أدخل رقم سرّ الموظف:</label>' +
          '<input type="password" inputmode="numeric" maxlength="6" id="sdPinInput" autocomplete="off">' +
          '<div class="sd-msg" id="sdPinMsg"></div>' +
        '</div>' +
        '<div class="sd-msg" id="sdMsg" style="margin-top:4px;"></div>' +
        '<div class="sd-actions">' +
          '<button type="button" class="sd-btn sd-btn-cancel" id="sdBtnCancel">إلغاء</button>' +
          '<button type="button" class="sd-btn sd-btn-primary" id="sdBtnConfirm">تبديل</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(ov);

    // Phase 6 M — Observation N: a11y enhancement (focus trap + restore)
    var _a11yCleanup = _a11yEnhanceModal(ov);

    // ── Event wiring ──
    var radios = ov.querySelectorAll('input[name="sdEmpSel"]');

    function getSelectedEmployee() {
      var checked = ov.querySelector('input[name="sdEmpSel"]:checked');
      if (!checked) return null;
      return sorted.find(function(e){ return e.id === checked.value; }) || null;
    }

    function updateActive() {
      ov.querySelectorAll('.sd-opt').forEach(function(opt){
        var checked = opt.querySelector('input').checked;
        opt.classList.toggle('sd-active', checked);
      });

      var target = getSelectedEmployee();
      var pinRow = ov.querySelector('#sdPinRow');
      var msg = ov.querySelector('#sdMsg');
      var confirmBtn = ov.querySelector('#sdBtnConfirm');

      if (!target) {
        pinRow.style.display = 'none';
        return;
      }

      // Determine if PIN is needed using employee-level hierarchy:
      // - Selecting the SAME employee = no-op = no PIN
      // - Owner role (current) → ANY other = downgrade = no PIN (owner supreme)
      // - Switching INTO owner = needs the OWNER's own PIN, but only if the
      //   owner has set one. Owner mode with no PIN is unprotected; requiring a
      //   non-existent PIN would permanently lock every device out of owner
      //   mode (the stuck-device bug when staff have PINs but the owner doesn't).
      // - Any other target → PIN required (the TARGET employee's PIN)
      // - If lock not configured (no PINs anywhere) → free
      var sameEmp = isCurrent(target);
      var lockConfigured = hasPinSet || employees.some(function(e){ return !!e.pin_hash; });

      var needPin;
      if (sameEmp) {
        needPin = false;
      } else if (!lockConfigured) {
        needPin = false; // no PINs set anywhere yet
      } else if (curRole === 'owner') {
        needPin = false; // owner can switch freely (downgrade)
      } else if (target.role === 'owner') {
        needPin = !!target.pin_hash; // owner switch-in: only if owner set a PIN
      } else {
        needPin = true;
      }

      // Edge case: a NON-owner target with no pin_hash can't be verified.
      // (Owner targets never reach here with needPin=true unless they HAVE a
      // pin_hash, per the branch above — so the owner is never falsely blocked.)
      if (needPin && !target.pin_hash) {
        msg.textContent = '⚠ هذا الموظف لم يضبط رقم سر بعد. اطلب من المالك إعداده.';
        msg.className = 'sd-msg';
        pinRow.style.display = 'none';
        confirmBtn.disabled = true;
        return;
      }

      pinRow.style.display = needPin ? 'block' : 'none';

      if (isInCooldown()) {
        msg.textContent = '⏳ تم تجاوز عدد المحاولات. أعد المحاولة بعد ' + cooldownSecondsLeft() + ' ثانية.';
        msg.className = 'sd-msg';
        confirmBtn.disabled = true;
      } else if (!lockConfigured) {
        msg.textContent = 'ℹ️ القفل غير مفعّل. يمكن التبديل بحرية. لتفعيل القفل، عيّن رقم سر من صفحة الموظفين.';
        msg.className = 'sd-msg sd-ok';
        confirmBtn.disabled = false;
      } else {
        msg.textContent = '';
        confirmBtn.disabled = false;
      }
    }

    radios.forEach(function(r){ r.addEventListener('change', updateActive); });

    // Click row → select radio
    ov.querySelectorAll('.sd-opt').forEach(function(opt){
      opt.addEventListener('click', function(e){
        if (e.target.tagName === 'INPUT') return;
        var input = opt.querySelector('input[type=radio]');
        input.checked = true;
        updateActive();
      });
    });

    // Esc key closes the modal (delegates to closeModal so a11y cleanup runs)
    var escHandler = function(e){
      if (e.key === 'Escape' || e.keyCode === 27) {
        closeModal();
      }
    };
    document.addEventListener('keydown', escHandler);

    function closeModal() {
      document.removeEventListener('keydown', escHandler);
      if (typeof _a11yCleanup === 'function') _a11yCleanup();
      ov.remove();
    }

    ov.querySelector('#sdBtnCancel').addEventListener('click', closeModal);
    ov.addEventListener('click', function(e){ if (e.target === ov) closeModal(); });

    var _switchInFlight = false;
    ov.querySelector('#sdBtnConfirm').addEventListener('click', async function(){
      if (_switchInFlight) return;
      _switchInFlight = true;
      var confirmBtn = ov.querySelector('#sdBtnConfirm');
      confirmBtn.disabled = true;
      try {
        var target = getSelectedEmployee();
        if (!target) {
          ov.querySelector('#sdMsg').textContent = 'اختر موظفاً أولاً.';
          return;
        }

        // No-op? Just close.
        if (isCurrent(target)) {
          closeModal();
          return;
        }

        // PIN logic same as updateActive
        var lockConfigured = hasPinSet || employees.some(function(e){ return !!e.pin_hash; });
        var needPin = false;
        if (!lockConfigured) {
          needPin = false;
        } else if (curRole === 'owner') {
          needPin = false;
        } else if (target.role === 'owner') {
          needPin = !!target.pin_hash; // owner switch-in: only if owner set a PIN
        } else {
          needPin = true;
        }

        if (needPin) {
          if (!target.pin_hash) {
            ov.querySelector('#sdMsg').textContent = '⚠ هذا الموظف لم يضبط رقم سر بعد.';
            return;
          }
          var pin = (ov.querySelector('#sdPinInput').value || '').trim();
          var ver = await verifyEmployeePin(target, pin);
          if (!ver.ok) {
            var pm = ov.querySelector('#sdPinMsg');
            if (ver.reason === 'cooldown') {
              pm.textContent = '⏳ تم تجاوز عدد المحاولات. أعد المحاولة بعد ' + ver.secondsLeft + ' ثانية.';
            } else if (ver.reason === 'no_pin_set') {
              pm.textContent = '⚠ لم يتم تعيين رقم سر لهذا الموظف.';
            } else if (ver.reason === 'invalid_format') {
              pm.textContent = 'رقم السر يجب أن يكون 4-6 أرقام.';
            } else if (ver.reason === 'wrong') {
              pm.textContent = '❌ رقم سر خاطئ. متبقّي ' + (ver.failsLeft || 0) + ' محاولات.';
            }
            return;
          }
        }

        // Apply: role + doctor_id derived from the employee
        var newDoctorId = (target.role === 'doctor') ? (target.doctor_id || null) : null;
        applyRole(target.role, newDoctorId, target.id);

        // Log to audit before reload (best effort, fire-and-forget)
        try {
          await logAudit('lock.role_switch', {
            entityId: target.id,
            description: 'تبديل إلى الموظف: ' + target.name + ' (' + (ROLE_LABELS[target.role] || target.role) + ')',
            oldValue: { role: curRole, doctor_id: curDoctorId, employee_id: curEmployeeId },
            newValue: { role: target.role, doctor_id: newDoctorId, employee_id: target.id }
          });
        } catch (e) { /* ignore */ }

        closeModal();
        window.location.reload();
      } finally {
        _switchInFlight = false;
        if (confirmBtn && document.body.contains(confirmBtn)) confirmBtn.disabled = false;
      }
    });

    updateActive();
    setTimeout(function(){
      var pi = ov.querySelector('#sdPinInput');
      if (pi && pi.offsetParent) { pi.focus(); return; }
      // Phase 6 M (Obs N): if PIN row is hidden, focus the first interactive
      // element (the active radio, or the Confirm button) so keyboard users
      // have a clear entry point.
      var checked = ov.querySelector('input[name="sdEmpSel"]:checked');
      if (checked && checked.offsetParent !== null) { checked.focus(); return; }
      var confirm = ov.querySelector('#sdBtnConfirm');
      if (confirm) confirm.focus();
    }, 80);
  }

  // ── Legacy modal (pre-Phase 5 fallback) ──
  // Used only when clinic_employees is empty (Migration 9.1 not run).
  // Same behavior as the original Phase 4 modal: 3 role radios + PIN.
  async function openSwitchModalLegacy() {
    injectCSS();
    var doctors = await loadDoctors();
    var curRole = getRole();
    var curDoctorId = getDoctorId();
    var hasPinSet = !!(await loadPinHash());

    // Remove any existing modal
    var ex = document.getElementById('sdLockModal');
    if (ex) ex.remove();

    var ov = document.createElement('div');
    ov.id = 'sdLockModal';
    ov.className = 'sd-lock-modal-overlay';

    var doctorOptions = '';
    doctors.forEach(function(d){
      var sel = (d.id === curDoctorId) ? ' selected' : '';
      doctorOptions += '<option value="'+d.id+'"'+sel+'>'+escapeHtmlLock(d.name)+'</option>';
    });

    var doctorBlock = doctors.length > 0
      ? '<select id="sdDoctorSel">' + doctorOptions + '</select>'
      : '<div style="color:var(--red,#ef5350);font-size:12px;">لا يوجد أطباء — أضف طبيباً من صفحة الأطباء أولاً.</div>';

    ov.innerHTML =
      '<div class="sd-lock-modal" role="dialog" aria-label="تبديل الوضع" aria-labelledby="sdLegacyTitle">' +
        '<h3 id="sdLegacyTitle">🔓 تبديل الوضع</h3>' +
        '<div class="sd-cur">الوضع الحالي: ' + (ROLE_ICONS[curRole]||'') + ' ' + (ROLE_LABELS[curRole]||curRole) + '</div>' +
        '<label class="sd-opt' + (curRole==='owner'?' sd-active':'') + '" data-role="owner">' +
          '<input type="radio" name="sdRoleSel" value="owner"' + (curRole==='owner'?' checked':'') + '> 👑 المالك' +
        '</label>' +
        '<label class="sd-opt' + (curRole==='doctor'?' sd-active':'') + '" data-role="doctor">' +
          '<input type="radio" name="sdRoleSel" value="doctor"' + (curRole==='doctor'?' checked':'') + '> 👨‍⚕️ طبيب' +
          '<div class="sd-sub">' + doctorBlock + '</div>' +
        '</label>' +
        '<label class="sd-opt' + (curRole==='secretary'?' sd-active':'') + '" data-role="secretary">' +
          '<input type="radio" name="sdRoleSel" value="secretary"' + (curRole==='secretary'?' checked':'') + '> 👩‍💼 السكرتيرة' +
        '</label>' +
        '<div class="sd-pin-row" id="sdPinRow" style="display:none;">' +
          '<label>أدخل PIN للتأكيد:</label>' +
          '<input type="password" inputmode="numeric" maxlength="6" id="sdPinInput" autocomplete="off">' +
          '<div class="sd-msg" id="sdPinMsg"></div>' +
        '</div>' +
        '<div class="sd-msg" id="sdMsg" style="margin-top:4px;"></div>' +
        '<div class="sd-actions">' +
          '<button type="button" class="sd-btn sd-btn-cancel" id="sdBtnCancel">إلغاء</button>' +
          '<button type="button" class="sd-btn sd-btn-primary" id="sdBtnConfirm">تبديل</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(ov);

    // Phase 6 M — Observation N: a11y enhancement (focus trap + restore)
    var _a11yCleanup = _a11yEnhanceModal(ov);

    // ── Event wiring ──
    var radios = ov.querySelectorAll('input[name="sdRoleSel"]');
    function updateActive() {
      ov.querySelectorAll('.sd-opt').forEach(function(opt){
        var checked = opt.querySelector('input').checked;
        opt.classList.toggle('sd-active', checked);
      });
      var targetRole = ov.querySelector('input[name="sdRoleSel"]:checked').value;
      var targetDocId = (targetRole === 'doctor') ? ov.querySelector('#sdDoctorSel') && ov.querySelector('#sdDoctorSel').value : null;
      var need = requirePin(targetRole, targetDocId);
      var pinRow = ov.querySelector('#sdPinRow');
      pinRow.style.display = need ? 'block' : 'none';

      var msg = ov.querySelector('#sdMsg');
      var confirmBtn = ov.querySelector('#sdBtnConfirm');
      if (isInCooldown()) {
        msg.textContent = '⏳ تم تجاوز عدد المحاولات. أعد المحاولة بعد ' + cooldownSecondsLeft() + ' ثانية.';
        msg.className = 'sd-msg';
        confirmBtn.disabled = true;
      } else if (!hasPinSet) {
        msg.textContent = 'ℹ️ القفل غير مفعّل (لا يوجد PIN). يمكن التبديل بحرية. لتفعيل القفل، عيّن PIN من الإعدادات.';
        msg.className = 'sd-msg sd-ok';
        confirmBtn.disabled = false;
      } else {
        msg.textContent = '';
        confirmBtn.disabled = false;
      }
    }
    radios.forEach(function(r){ r.addEventListener('change', updateActive); });
    var docSel = ov.querySelector('#sdDoctorSel');
    if (docSel) docSel.addEventListener('change', updateActive);

    ov.querySelectorAll('.sd-opt').forEach(function(opt){
      opt.addEventListener('click', function(e){
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'OPTION') return;
        var input = opt.querySelector('input[type=radio]');
        input.checked = true;
        updateActive();
      });
    });

    var escHandler = function(e){
      if (e.key === 'Escape' || e.keyCode === 27) {
        closeModal();
      }
    };
    document.addEventListener('keydown', escHandler);

    function closeModal() {
      document.removeEventListener('keydown', escHandler);
      if (typeof _a11yCleanup === 'function') _a11yCleanup();
      ov.remove();
    }

    ov.querySelector('#sdBtnCancel').addEventListener('click', closeModal);
    ov.addEventListener('click', function(e){ if (e.target === ov) closeModal(); });

    var _switchInFlight = false;
    ov.querySelector('#sdBtnConfirm').addEventListener('click', async function(){
      if (_switchInFlight) return;
      _switchInFlight = true;
      var confirmBtn = ov.querySelector('#sdBtnConfirm');
      confirmBtn.disabled = true;
      try {
        var targetRole = ov.querySelector('input[name="sdRoleSel"]:checked').value;
        var targetDocId = null;
        if (targetRole === 'doctor') {
          var sel = ov.querySelector('#sdDoctorSel');
          if (!sel || !sel.value) {
            ov.querySelector('#sdMsg').textContent = 'اختر طبيباً أولاً.';
            return;
          }
          targetDocId = sel.value;
        }
        if (targetRole === getRole() && (targetRole !== 'doctor' || targetDocId === getDoctorId())) {
          closeModal();
          return;
        }
        var need = requirePin(targetRole, targetDocId);
        if (need) {
          var pin = (ov.querySelector('#sdPinInput').value || '').trim();
          var ver = await verifyPin(pin);
          if (!ver.ok) {
            var pm = ov.querySelector('#sdPinMsg');
            if (ver.reason === 'cooldown') {
              pm.textContent = '⏳ تم تجاوز عدد المحاولات. أعد المحاولة بعد ' + ver.secondsLeft + ' ثانية.';
            } else if (ver.reason === 'no_pin_set') {
              pm.textContent = '⚠ لم يتم تعيين PIN بعد.';
            } else if (ver.reason === 'invalid_format') {
              pm.textContent = 'PIN يجب أن يكون 4-6 أرقام.';
            } else if (ver.reason === 'wrong') {
              pm.textContent = '❌ PIN خاطئ. متبقّي ' + (ver.failsLeft || 0) + ' محاولات.';
            }
            return;
          }
        }
        applyRole(targetRole, targetDocId);
        closeModal();
        window.location.reload();
      } finally {
        _switchInFlight = false;
        if (confirmBtn && document.body.contains(confirmBtn)) confirmBtn.disabled = false;
      }
    });

    updateActive();
    setTimeout(function(){
      var pi = ov.querySelector('#sdPinInput');
      if (pi && pi.offsetParent) { pi.focus(); return; }
      // Phase 6 M (Obs N): fallback focus if PIN row hidden
      var checked = ov.querySelector('input[name="sdRoleSel"]:checked');
      if (checked && checked.offsetParent !== null) { checked.focus(); return; }
      var confirm = ov.querySelector('#sdBtnConfirm');
      if (confirm) confirm.focus();
    }, 80);
  }

  // ── HTML escape (local helper) ────────────────────────────────
  function escapeHtmlLock(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ── Auto-init on every page that has supabase-init ────────────
  // ── Phase 4.1: Device lock detection ─────────────────────────
  // Returns TRUE only if the EMPLOYEE row is deactivated (or fully deleted),
  // triggering banner + action guards across the whole device.
  //
  // Reads from _employeesListCache (preloaded in autoInit).
  // Cache contains is_active=true rows only, so "not found" = deactivated.
  function isDoctorAccountInactive() {
    // ── Phase 7.6 Fix: Owner is never locked by employee logic ──
    // The clinic owner's identity comes from doctors.is_owner=true (Phase 1
    // canonical owner record), NOT from clinic_employees. A device with
    // role='owner' but a stale LS_EMPLOYEE_ID (e.g. from a pre-Phase-5 setup
    // attempt, a wiped clinic_employees row, or a re-onboarded tenant) must
    // never be flagged as inactive — that would lock the actual clinic owner
    // out of their own data.
    // Employees (secretary, doctor-as-employee) still go through Path 1 below.
    if (isOwner()) return false;

    // ── Path 1: Phase 5 employee-locked device ──
    // If a specific employee is locked in, check if that employee is still
    // active. This is the primary path for all post-Phase-5 devices.
    var empId = getEmployeeId();
    if (empId && _employeesListCache) {
      var emp = _employeesListCache.find(function(e){ return e.id === empId; });
      if (!emp) {
        // Employee deactivated (or fully deleted) → device read-only
        return true;
      }
      return false; // active employee → device unlocked
    }

    // ── Path 2: Phase 4.1 legacy doctor-only lock (pre-Phase-5 devices) ──
    // Device locked to role=doctor WITHOUT an employee_id (legacy installs).
    if (!isDoctor()) return false;
    if (!_doctorsListCache) return false; // not loaded yet — assume active
    var did = getDoctorId();
    if (!did) return false;
    return !_doctorsListCache.find(function(d){ return d.id === did; });
  }

  function injectInactiveBanner() {
    // Phase X10.1: defense-in-depth. The "حسابك معطّل" banner is for
    // clinic employees/doctors only — it has no meaning on public pages
    // and would confuse visitors who never logged in. Mirror the guard
    // in injectHeaderButton().
    if (isPublicPage()) return;
    if (document.getElementById('sdInactiveBanner')) return;
    var banner = document.createElement('div');
    banner.id = 'sdInactiveBanner';
    banner.setAttribute('role', 'alert');
    banner.style.cssText =
      'position:sticky;top:0;left:0;right:0;z-index:200;' +
      'background:linear-gradient(90deg,rgba(239,83,80,0.18),rgba(239,83,80,0.10));' +
      'border-bottom:2px solid #ef5350;color:#ef5350;' +
      'padding:10px 16px;font-family:\'Cairo\',sans-serif;font-size:13px;font-weight:800;' +
      'text-align:center;direction:rtl;white-space:normal;line-height:1.5;';
    banner.innerHTML =
      '⚠ <strong>حسابك معطّل من قِبَل المالك.</strong> ' +
      'يمكنك تصفّح البيانات للقراءة فقط — تسجيل الجلسات والدفعات والمواعيد معطّل. ' +
      'الرجاء التواصل مع المالك لإعادة التفعيل.';

    // Placement: insert into .main (sidebar layout) or at body top (no sidebar).
    // Either way, it should be ABOVE the topbar so it spans the working area
    // without breaking the sidebar's vertical full-height layout.
    var main = document.querySelector('.main');
    if (main && main.firstChild) {
      main.insertBefore(banner, main.firstChild);
    } else if (main) {
      main.appendChild(banner);
    } else if (document.body.firstChild) {
      document.body.insertBefore(banner, document.body.firstChild);
    } else {
      document.body.appendChild(banner);
    }
  }

  function applyInactiveActionGuards() {
    // Disable any element opted-in to inactive-doctor blocking
    var els = document.querySelectorAll('[data-doctor-inactive-block]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      el.setAttribute('disabled', 'disabled');
      el.setAttribute('aria-disabled', 'true');
      el.style.opacity = '0.5';
      el.style.cursor = 'not-allowed';
      el.style.pointerEvents = 'none';
      el.title = 'معطّل — حسابك غير نشط حالياً';
      el.setAttribute('data-doctor-inactive-disabled-by-lock', '1');
    }
  }

  function applyInactiveDoctorUI() {
    if (!isDoctorAccountInactive()) return;
    injectInactiveBanner();
    applyInactiveActionGuards();
    // Re-run guards after dynamic re-renders by listening for the
    // applyRoleGuards call too (patients/labs/etc. call it after render)
    // We also patch refreshHeaderButton to keep the banner visible.
  }

  async function autoInit() {
    // Skip on auth & landing pages (pre-auth) AND admin.html (platform page, not tenant).
    //
    // admin.html is the SyDent SaaS platform control panel — it manages
    // trial_requests for clinic owners across all tenants. It does NOT belong
    // to any single clinic (no clinic_doctors / clinic_employees row for the
    // admin user). Running autoInit() here would:
    //   1. Try to load clinic_employees / clinic_doctors for an admin who has
    //      no rows → empty caches → confusing "owner deleted" lock pill
    //   2. Risk injecting the "حسابك معطّل من قِبَل المالك" inactive banner
    //      (designed for clinic employees, not the platform admin)
    //   3. Inject sidebar header buttons / role guards that don't apply to
    //      the platform-level admin role
    // The admin page has its own auth guard (platform_admins check) and
    // runs entirely outside the per-tenant SyDentLock system. See Rule #28 and
    // the SaaS multi-tenant best practice: keep the global/platform layer
    // distinct from the tenant layer.
    // Phase X10.1: use the canonical isPublicPage() helper instead of
    // an inline regex. This guarantees consistency with the matching
    // guards inside injectHeaderButton() and injectInactiveBanner() so
    // all three skip the same set of pages. The helper also handles
    // trailing-slash edge cases and includes /index.html + /pending.html
    // which the old inline regex missed.
    if (isPublicPage()) return;

    // Wait briefly for DOM
    if (document.readyState === 'loading') {
      await new Promise(function(r){ document.addEventListener('DOMContentLoaded', r, { once: true }); });
    }

    // ── Defensive platform-admin redirect ─────────────────────────────
    // Belt-and-suspenders: index.html already redirects admins to admin.html,
    // but if the admin lands directly on any other tenant page (patients,
    // appointments, settings, etc.) via a bookmark, deep link, history, or
    // PWA shortcut, redirect them to admin.html before any tenant-level
    // logic (caches, banners, role guards) tries to render. Without this,
    // the admin would see the misleading "Owner deleted" pill + "account
    // deactivated" banner since they have no clinic_employees row.
    //
    // We use a deliberately-cheap check: only fire the query if there's a
    // session at all. Errors are non-fatal — if the platform_admins query
    // fails, we let the page proceed (graceful degradation; admins are rare).
    // Phase F: switched from doctors.role='admin' to platform_admins table.
    try {
      var sessRes = await window.sb.auth.getSession();
      var sUser = sessRes && sessRes.data && sessRes.data.session && sessRes.data.session.user;
      if (sUser) {
        var adminCheck = await window.SyDentAuth.isPlatformAdmin(sUser.id);
        if (adminCheck.isAdmin) {
          window.location.replace('admin.html');
          return;
        }
      }
    } catch(_adminCheckErr) {
      // Best-effort. Non-admin users far outnumber admins, so failing
      // this check should never block a tenant user from their dashboard.
      console.warn('[SyDentLock] admin role check skipped:', _adminCheckErr && _adminCheckErr.message);
    }
    // ──────────────────────────────────────────────────────────────────

    // Phase X14.2: self-heal the owner's clinic_employees row before anything
    // reads the employee list. loadDoctors() first so getOwnerPersonName() can
    // resolve the owner's name from clinic_doctors.is_owner. Both are idempotent
    // and cached, so the parallel preload below reuses the doctor cache.
    await loadDoctors();
    await ensureOwnerEmployee();

    // Preload (don't await — fire and forget for speed)
    loadPinHash();
    // Phase 5: preload BOTH caches in parallel; refresh header & apply inactive
    // UI only once BOTH are loaded so isDoctorAccountInactive() has full data.
    // Header is also refreshed as each cache lands so user sees the name asap.
    var empPromise = loadEmployees().then(function(){ refreshHeaderButton(); });
    var docPromise = loadDoctors().then(function(){ refreshHeaderButton(); });
    Promise.all([empPromise, docPromise]).then(function(){
      // Phase 4.1 + 5: now both caches are ready — check inactive status
      // against employee AND doctor, render banner + apply guards if needed
      applyInactiveDoctorUI();
    });
    injectHeaderButton();
    applyRoleGuards();

    // Phase 6 M (Obs M): multi-tab sync.
    // The lock identity lives in localStorage. If another tab switches
    // the role (or the Owner disables/changes the clinic PIN) while
    // THIS tab has the lock modal open, the modal's local snapshot of
    // curRole/curDoctorId/curEmployeeId becomes stale — the next click
    // would apply a transition computed from outdated state. Listening
    // for the 'storage' event (fires in OTHER tabs only, never in the
    // tab that wrote) lets us react cleanly.
    //
    // Strategy:
    //   • Identity keys (LS_ROLE, LS_DOCTOR_ID, LS_EMPLOYEE_ID) changed
    //     → close any open lock modal in this tab AND reload, so the
    //       page re-applies guards/banners with the new identity. This
    //       matches the behavior of a fresh tab opening after the switch.
    //   • Failure/cooldown keys (LS_FAIL_COUNT, LS_COOLDOWN) changed
    //     → don't reload; just refresh any open modal's PIN message so
    //       the cooldown countdown reflects reality.
    //   • Anything else (settings, app preferences) → ignored here.
    if (typeof window.addEventListener === 'function' && !window._sydLockStorageWired) {
      window._sydLockStorageWired = true;
      window.addEventListener('storage', function(e){
        if (!e || !e.key) return;
        var identityChanged = (e.key === LS_ROLE || e.key === LS_DOCTOR_ID || e.key === LS_EMPLOYEE_ID);
        var rateLimitChanged = (e.key === LS_FAIL_COUNT || e.key === LS_COOLDOWN);
        if (!identityChanged && !rateLimitChanged) return;
        var openModal = document.getElementById('sdLockModal');
        if (identityChanged) {
          // Close the modal (if any) so a stale snapshot doesn't act.
          // Don't bother with a11y cleanup — the page is about to reload.
          if (openModal) openModal.remove();
          // Tiny defer so the storage write in the other tab has fully
          // landed in our localStorage (avoids racing the reload).
          setTimeout(function(){ window.location.reload(); }, 50);
          return;
        }
        // rateLimitChanged: just nudge the open modal's PIN message if any.
        if (openModal) {
          var pm = openModal.querySelector('#sdPinMsg');
          if (pm) {
            if (isInCooldown()) {
              pm.textContent = '⏳ تم تجاوز عدد المحاولات (من جهاز آخر). أعد المحاولة بعد ' + cooldownSecondsLeft() + ' ثانية.';
            }
          }
        }
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Phase 5: Audit Logging API
  // ═══════════════════════════════════════════════════════════════
  // Fire-and-forget logger for every important operation in the system.
  // Records WHO (employee_id + snapshot), WHAT (action_type + entity),
  // WHEN (created_at auto), and ON WHOM (patient_id + snapshot).
  //
  // Usage:
  //   window.logAudit('payment.delete', {
  //     entityId: paymentId,
  //     patientId: patient.id,
  //     patientName: patient.name,
  //     description: 'حذف دفعة 5000 ل.س',
  //     oldValue: { amount: 5000, created_at: '...' }
  //   });
  //
  // Designed to be safe & non-blocking:
  //   - Never throws (errors go to console)
  //   - Fire-and-forget (returns immediately; logging happens async)
  //   - Falls back silently if Migration 9.1 not applied
  //   - employee_id may be NULL if device is on a legacy install (no per-employee setup)
  // ═══════════════════════════════════════════════════════════════

  // Valid action_type prefixes (used for validation, not enforcement)
  var VALID_ACTION_PREFIXES = [
    'patient.', 'appointment.', 'appointment_type.', 'session.', 'payment.',
    'lab.', 'doctor.', 'employee.', 'operatory.',
    'expense.', 'expense_category.', 'payout.',
    'settings.', 'lock.', 'report.'
  ];

  async function logAudit(actionType, opts) {
    opts = opts || {};
    try {
      // Validate action_type quickly
      if (typeof actionType !== 'string' || !actionType.includes('.')) {
        console.warn('[logAudit] invalid action_type:', actionType);
        return;
      }
      // Soft validation — warn but don't block (in case new prefixes added later)
      var validPrefix = VALID_ACTION_PREFIXES.some(function(p){ return actionType.indexOf(p) === 0; });
      if (!validPrefix) {
        console.warn('[logAudit] unrecognized action prefix:', actionType);
      }

      var user = await window.sbGetUser();
      if (!user) return; // not authenticated — nothing to log

      // Resolve employee snapshot (may be null on legacy devices)
      var emp = await getCurrentEmployee();

      var row = {
        owner_id: user.id,
        employee_id: emp ? emp.id : null,
        employee_name_snapshot: emp ? emp.name : null,
        employee_role_snapshot: emp ? emp.role : getRole(), // fallback to device role
        action_type: actionType,
        entity_type: opts.entityType || actionType.split('.')[0],
        entity_id: opts.entityId || null,
        patient_id: opts.patientId || null,
        patient_name_snapshot: opts.patientName || null,
        description: opts.description || null,
        old_value: opts.oldValue || null,
        new_value: opts.newValue || null
      };

      var res = await window.sb.from('audit_log').insert(row);
      if (res.error) {
        var m = (res.error.message || '') + ' ' + (res.error.code || '');
        // Silently swallow "table does not exist" — Migration 9.1 not run yet
        if (!/audit_log|42P01|PGRST205/i.test(m)) {
          console.warn('[logAudit] insert failed:', res.error);
        }
      }
    } catch (e) {
      console.warn('[logAudit] exception:', e);
    }
  }

  // Expose globally for convenience (every page can call window.logAudit directly)
  window.logAudit = logAudit;

  // ═══════════════════════════════════════════════════════════════
  // Phase 6 M (Obs E): Shared appointment migration-detection helpers
  // ═══════════════════════════════════════════════════════════════
  // Both appointments.html (saveAppt) and patient-profile.html (saveAppt)
  // need to detect "Gap 7 migration not applied" errors and fall back
  // to a legacy-row insert. Pre-Phase-6, both files defined IDENTICAL
  // copies of isPlannedMigrationMissing() and buildLegacyRow(). This
  // helper hoists them to a single source of truth without changing
  // any retry orchestration (those remain page-specific because their
  // surrounding state — editingId, autofill fields, no-show fees —
  // differs).
  //
  // Usage in any page:
  //   if (SyDentAppt.isPlannedMigrationMissing(err)) {
  //     var legacy = SyDentAppt.buildLegacyRow(apptData);
  //     // retry with legacy ...
  //   }
  //
  // Behavior is byte-for-byte equivalent to the previous inline copies.
  function _apptIsPlannedMigrationMissing(err) {
    if (!err) return false;
    var emsg = (err.message || '').toLowerCase();
    var code = err.code || '';
    var isPlannedCol = emsg.indexOf('is_planned') !== -1;
    var notNullDate  = /violates not-null constraint.*"(date|time)"/i.test(err.message || '');
    var schedHasDate = emsg.indexOf('scheduled_has_date') !== -1;
    if (isPlannedCol && (code === '42703' || code === 'PGRST204' || emsg.indexOf('does not exist') !== -1 || emsg.indexOf('schema cache') !== -1)) return true;
    if (notNullDate || schedHasDate) return true;
    return false;
  }

  function _apptBuildLegacyRow(src) {
    var row = Object.assign({}, src);
    delete row.is_planned;
    // Today's date in YYYY-MM-DD — matches the existing toDay() format.
    // Inlined here because supabase-init.js doesn't import page helpers.
    var t = new Date();
    var yyyy = t.getFullYear();
    var mm = String(t.getMonth() + 1).padStart(2, '0');
    var dd = String(t.getDate()).padStart(2, '0');
    var today = yyyy + '-' + mm + '-' + dd;
    if (row.date === null) row.date = today;
    if (row.time === null) row.time = '12:00';
    return row;
  }

  window.SyDentAppt = {
    isPlannedMigrationMissing: _apptIsPlannedMigrationMissing,
    buildLegacyRow: _apptBuildLegacyRow
  };

  // ── Phase 7.6G: Tenant Onboarding State ──────────────────────────────
  // Returns a snapshot of the new owner's onboarding progress. Used by
  // index.html (welcome banner + checklist) and by individual tenant
  // pages (empty states deciding whether to show first-time CTAs).
  //
  // Returns an object:
  //   {
  //     loaded:               boolean,  // false if user not logged in or query failed
  //     dismissed:            boolean,  // banner was hidden by user
  //     clinicNameConfirmed:  boolean,
  //     clinicName:           string|null,
  //     patientsCount:        number,
  //     appointmentsCount:    number,
  //     sessionsCount:        number,
  //     // derived:
  //     itemsDone:            number,   // 0..4
  //     itemsTotal:           4,
  //     allDone:              boolean,
  //     shouldShowBanner:     boolean   // !dismissed && !allDone
  //   }
  //
  // The four checklist items are intentionally computed (not stored) so
  // they reflect reality without any sync bookkeeping. Adding a patient
  // anywhere instantly bumps the count on the next render.
  //
  // Fault-tolerant: returns sensible defaults if any query fails or if
  // Migration 29 hasn't been applied. Callers should check `loaded`.
  async function getOnboardingState() {
    var fallback = {
      loaded: false,
      dismissed: false,
      clinicNameConfirmed: false,
      clinicName: null,
      patientsCount: 0,
      appointmentsCount: 0,
      sessionsCount: 0,
      itemsDone: 0,
      itemsTotal: 4,
      allDone: false,
      shouldShowBanner: false
    };

    try {
      var sessRes = await window.sb.auth.getSession();
      var u = sessRes && sessRes.data && sessRes.data.session && sessRes.data.session.user;
      if (!u) return fallback;

      // Parallel queries — much faster than serial chains. The counts are
      // head:true (no row payload), so the wire cost is essentially zero.
      var ownerId = u.id;
      var p = window.sb.from('clinic_settings')
        .select('clinic_name, onboarding_dismissed_at, clinic_name_confirmed_at')
        .eq('owner_id', ownerId).maybeSingle();
      // Tenant tables (patients/appointments/ledger_sessions) use the legacy
      // column name `doctor_id` for the tenant identity (originally there was
      // only one doctor per tenant — Phase 1 naming). Only platform-aware
      // tables (clinic_settings, clinic_employees, clinic_doctors) use
      // `owner_id`. Phase 7.6G initially used `owner_id` here, which raised
      // 400 (Bad Request) on patients/appointments + 404 (Not Found) on
      // 'sessions' (the real table is `ledger_sessions`). Onboarding state
      // silently defaulted to 0/4 — banner stayed up forever for every tenant.
      var pp = window.sb.from('patients')
        .select('id', { count: 'exact', head: true })
        .eq('doctor_id', ownerId);
      var pa = window.sb.from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('doctor_id', ownerId);
      var ps = window.sb.from('ledger_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('doctor_id', ownerId);

      var results = await Promise.all([p, pp, pa, ps]);
      var settingsRes = results[0];
      var patientsRes = results[1];
      var apptsRes    = results[2];
      var sessRes2    = results[3];

      // 28-May-2026 fix: if the tenant has no clinic_settings row yet, the
      // welcome prompt ("هل اسم عيادتك … صحيح؟") can't display because
      // st.clinic_name is null. Pre-Phase 7.6G the row was created lazily on
      // first visit to settings.html, but a freshly approved tenant typically
      // lands on index.html first → prompt was silently skipped.
      // Auto-create the row here with the same defaults settings.html uses on
      // first visit (clinic_name seeded from auth.users.user_metadata.full_name).
      // We deliberately do NOT set clinic_name_confirmed_at — the whole point
      // is for the user to confirm or edit the seeded name. The WhatsApp
      // template column has a Postgres DEFAULT so we omit it here.
      // Best-effort: on any failure (race, RLS, missing column) we fall
      // through with the original empty state. Idempotent via the existing
      // owner_id unique constraint on clinic_settings (PK).
      if (settingsRes && !settingsRes.error && !settingsRes.data) {
        try {
          var meta = u.user_metadata || {};
          var seedName = (meta.full_name || meta.name)
            ? ('عيادة ' + (meta.full_name || meta.name))
            : null;
          var seedRes = await window.sb.from('clinic_settings').insert({
            owner_id: ownerId,
            clinic_name: seedName,
            whatsapp_reminders_enabled: true,
            whatsapp_reminder_hours_before: 24
          }).select('clinic_name, onboarding_dismissed_at, clinic_name_confirmed_at').single();
          if (!seedRes.error && seedRes.data) {
            settingsRes = { data: seedRes.data };  // feed the rest of the function
          }
        } catch (seedErr) {
          console.warn('[onboarding] clinic_settings auto-create failed:', seedErr && seedErr.message);
        }
      }

      var st = (settingsRes && settingsRes.data) || {};
      var dismissed           = !!st.onboarding_dismissed_at;
      var clinicNameConfirmed = !!st.clinic_name_confirmed_at;
      var clinicName          = st.clinic_name || null;
      var patientsCount       = (patientsRes && typeof patientsRes.count === 'number') ? patientsRes.count : 0;
      var appointmentsCount   = (apptsRes    && typeof apptsRes.count    === 'number') ? apptsRes.count    : 0;
      var sessionsCount       = (sessRes2    && typeof sessRes2.count    === 'number') ? sessRes2.count    : 0;

      var itemsDone =
        (clinicNameConfirmed ? 1 : 0) +
        (patientsCount     > 0 ? 1 : 0) +
        (appointmentsCount > 0 ? 1 : 0) +
        (sessionsCount     > 0 ? 1 : 0);
      var allDone = itemsDone >= 4;

      return {
        loaded: true,
        dismissed: dismissed,
        clinicNameConfirmed: clinicNameConfirmed,
        clinicName: clinicName,
        patientsCount: patientsCount,
        appointmentsCount: appointmentsCount,
        sessionsCount: sessionsCount,
        itemsDone: itemsDone,
        itemsTotal: 4,
        allDone: allDone,
        shouldShowBanner: !dismissed && !allDone
      };
    } catch (e) {
      console.warn('[onboarding] getOnboardingState failed:', e && e.message);
      return fallback;
    }
  }

  // Mark the welcome banner as dismissed. Best-effort: silently no-ops
  // if Migration 29 isn't applied yet.
  async function dismissOnboardingBanner() {
    try {
      var sessRes = await window.sb.auth.getSession();
      var u = sessRes && sessRes.data && sessRes.data.session && sessRes.data.session.user;
      if (!u) return false;
      var res = await window.sb.from('clinic_settings')
        .update({ onboarding_dismissed_at: new Date().toISOString() })
        .eq('owner_id', u.id);
      return !res.error;
    } catch (e) {
      console.warn('[onboarding] dismiss failed:', e && e.message);
      return false;
    }
  }

  // Mark the clinic_name as confirmed by the user. Called either after
  // they tap "نعم احتفظ" on the inline prompt, or after they edit and
  // save the name in settings.html. Idempotent.
  async function confirmClinicName(newName) {
    try {
      var sessRes = await window.sb.auth.getSession();
      var u = sessRes && sessRes.data && sessRes.data.session && sessRes.data.session.user;
      if (!u) return false;
      var payload = { clinic_name_confirmed_at: new Date().toISOString() };
      if (typeof newName === 'string' && newName.trim()) {
        payload.clinic_name = newName.trim();
      }
      var res = await window.sb.from('clinic_settings')
        .update(payload)
        .eq('owner_id', u.id);
      return !res.error;
    } catch (e) {
      console.warn('[onboarding] confirmClinicName failed:', e && e.message);
      return false;
    }
  }

  window.SyDentOnboarding = {
    getState:            getOnboardingState,
    dismissBanner:       dismissOnboardingBanner,
    confirmClinicName:   confirmClinicName
  };


  // ───────────────────────────────────────────────────────────────
  // Password Visibility Toggle (👁 / 🙈)
  // ───────────────────────────────────────────────────────────────
  // Industry pattern: Microsoft Edge + Stripe + GitHub.
  //   • Auto-hide on blur (Edge pattern) — prevents accidental leak
  //   • aria-pressed + dynamic aria-label (WCAG 4.1.2)
  //   • Keyboard support (Enter / Space)
  //   • Caret + value preservation across type swap
  //   • RTL-safe positioning via inset-inline-end (logical property)
  //   • Idempotent: re-calling attach() on the same input is a no-op
  //
  // Used by: auth.html (loginPass, regPass),
  //          settings.html (fPassNew, fPassConfirm, fDeletePass),
  //          employees.html (ePin, ePinConfirm, oNewPin, oNewPinConfirm)
  function attachPwdToggle(inputId) {
    try {
      var input = document.getElementById(inputId);
      if (!input) return false;
      if (input.getAttribute('data-pwd-wired') === '1') return true; // idempotent
      if (input.type !== 'password') return false; // safety guard

      // Wrap the input in .pwd-wrap (if not already wrapped)
      var parent = input.parentNode;
      if (!parent) return false;
      var wrap;
      if (parent.classList && parent.classList.contains('pwd-wrap')) {
        wrap = parent;
      } else {
        wrap = document.createElement('span');
        wrap.className = 'pwd-wrap';
        parent.insertBefore(wrap, input);
        wrap.appendChild(input);
      }

      // Heroicons-style inline SVGs (outline, 20×20, currentColor).
      // Using SVG instead of 👁/🙈 emojis because the see-no-evil monkey
      // emoji renders at native (huge) size on some Windows font fallbacks,
      // breaking the button layout. SVGs scale perfectly across all OSes.
      var SVG_EYE      = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.21.07.439 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><circle cx="12" cy="12" r="3"/></svg>';
      var SVG_EYE_OFF  = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.243 4.243L9.88 9.88"/></svg>';

      // Build the toggle button
      var btn = document.createElement('button');
      btn.type = 'button';                       // never submits the form
      btn.className = 'pwd-toggle';
      btn.tabIndex = 0;
      btn.setAttribute('aria-pressed', 'false');
      btn.setAttribute('aria-label', 'إظهار كلمة السر');
      btn.setAttribute('aria-controls', inputId);
      btn.innerHTML = SVG_EYE;
      wrap.appendChild(btn);

      function setRevealed(reveal) {
        // Preserve caret position across the type swap
        var pos = null, end = null;
        try { pos = input.selectionStart; end = input.selectionEnd; } catch(_) {}
        input.type = reveal ? 'text' : 'password';
        btn.innerHTML = reveal ? SVG_EYE_OFF : SVG_EYE;
        btn.setAttribute('aria-pressed', reveal ? 'true' : 'false');
        btn.setAttribute('aria-label', reveal ? 'إخفاء كلمة السر' : 'إظهار كلمة السر');
        // Restore caret (some browsers reset it on type change)
        if (pos !== null) {
          try { input.setSelectionRange(pos, end); } catch(_) {}
        }
      }

      function toggle(e) {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        setRevealed(input.type === 'password');
        // Keep focus on the input so typing continues naturally
        try { input.focus(); } catch(_) {}
      }

      btn.addEventListener('click', toggle);

      // Note: native <button> already handles Enter (keydown) and Space (keyup)
      // by firing a click event, so no extra keydown handler is needed.

      // Auto-hide on blur (Microsoft Edge security pattern).
      // Use focusout on the wrap so moving focus between input and button
      // does NOT count as leaving the field.
      wrap.addEventListener('focusout', function(e){
        var next = e.relatedTarget;
        if (next && (next === input || next === btn || wrap.contains(next))) return;
        if (input.type === 'text') setRevealed(false);
      });

      input.setAttribute('data-pwd-wired', '1');
      return true;
    } catch (err) {
      console.warn('[pwd] attach failed for', inputId, err && err.message);
      return false;
    }
  }

  function attachAllPwdToggles(ids) {
    if (!ids || !ids.length) return;
    for (var i = 0; i < ids.length; i++) {
      attachPwdToggle(ids[i]);
    }
  }

  window.SyDentPwd = {
    attach:    attachPwdToggle,
    attachAll: attachAllPwdToggles
  };


  // ── Public API ────────────────────────────────────────────────
  window.SyDentLock = {
    // state
    getRole: getRole,
    getDoctorId: getDoctorId,
    getEffectiveDoctorId: getEffectiveDoctorId,
    isOwner: isOwner,
    isDoctor: isDoctor,
    isSecretary: isSecretary,
    isDoctorAccountInactive: isDoctorAccountInactive,
    // Phase 5: per-employee identity
    getEmployeeId: getEmployeeId,
    loadEmployees: loadEmployees,
    loadDoctors: loadDoctors,
    invalidateEmployeesCache: invalidateEmployeesCache,
    ensureOwnerEmployee: ensureOwnerEmployee,
    getCurrentEmployee: getCurrentEmployee,
    // pin
    hashPin: hashPin,
    verifyPin: verifyPin,
    verifyEmployeePin: verifyEmployeePin,
    loadPinHash: loadPinHash,
    savePinHash: savePinHash,
    invalidatePinCache: invalidatePinCache,
    isPinSet: isPinSet,
    // hierarchy
    requirePin: requirePin,
    // rate limit
    isInCooldown: isInCooldown,
    cooldownSecondsLeft: cooldownSecondsLeft,
    resetFails: resetFails,
    // role transition
    applyRole: applyRole,
    // UI
    injectHeaderButton: injectHeaderButton,
    refreshHeaderButton: refreshHeaderButton,
    openSwitchModal: openSwitchModal,
    applyRoleGuards: applyRoleGuards,
    applyInactiveDoctorUI: applyInactiveDoctorUI,
    applyInactiveActionGuards: applyInactiveActionGuards,
    guardPage: guardPage,
    showBlockedScreen: showBlockedScreen,
    // Phase 5: audit log
    logAudit: logAudit,
    // constants (for UI consumers)
    ROLE_LABELS: ROLE_LABELS,
    ROLE_ICONS: ROLE_ICONS
  };

  // Fire-and-forget init (safe even if some pages don't want the button — guardPage runs first)
  autoInit();
})();

// ═══════════════════════════════════════════════════════════════════════════
// Phase 6 K2.1 — SyDentColorPicker (shared color picker component)
// ═══════════════════════════════════════════════════════════════════════════
// A cross-platform color picker that replaces <input type="color">. The native
// HTML5 picker varies wildly by OS (tiny RGB-only on Windows Chrome/Brave vs.
// the gorgeous Grid/Spectrum/Sliders panel on iOS Safari). This component
// emulates the iOS panel everywhere — same tabs, same look, same behavior.
//
// Public API:
//   window.SyDentColorPicker.open(currentHex, callback)
//     • currentHex: '#RRGGBB' (sanitized; falls back to var(--green) on bad input)
//     • callback(newHex):    called with the confirmed color, or NOT called if
//                            the user cancels
//   window.SyDentColorPicker.injectDOM()  // idempotent; called automatically
//
// The picker DOM is injected once per page on first .open() call (lazy).
// Self-contained: CSS-in-JS, no external dependencies, no separate file.
// ═══════════════════════════════════════════════════════════════════════════
(function() {
  'use strict';

  // ── Sanitization helpers ────────────────────────────────────────────────
  function sanitizeHex(h) {
    // Only accept strings — numbers/objects/etc. fall back to default. This
    // protects against accidental sanitizeHex(123) returning '#112233' due to
    // the short-form expansion path.
    if (typeof h !== 'string') return '#0d8577';
    if (!h) return '#0d8577';
    var s = h.trim();
    if (s.charAt(0) !== '#') s = '#' + s;
    if (/^#[0-9A-Fa-f]{3}$/.test(s)) {
      // Expand short form #abc → #aabbcc
      s = '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
    }
    return /^#[0-9A-Fa-f]{6}$/.test(s) ? s.toLowerCase() : '#0d8577';
  }
  function hexToRgb(hex) {
    var h = sanitizeHex(hex).slice(1);
    return {
      r: parseInt(h.substr(0, 2), 16),
      g: parseInt(h.substr(2, 2), 16),
      b: parseInt(h.substr(4, 2), 16)
    };
  }
  function rgbToHex(r, g, b) {
    function c(v) {
      v = Math.max(0, Math.min(255, Math.round(v)));
      var s = v.toString(16);
      return s.length === 1 ? '0' + s : s;
    }
    return '#' + c(r) + c(g) + c(b);
  }
  // HSV ↔ RGB (used by Spectrum tab)
  function hsvToRgb(h, s, v) {
    h = ((h % 360) + 360) % 360;
    s = Math.max(0, Math.min(1, s));
    v = Math.max(0, Math.min(1, v));
    var c = v * s;
    var hp = h / 60;
    var x = c * (1 - Math.abs(hp % 2 - 1));
    var r1 = 0, g1 = 0, b1 = 0;
    if (hp < 1) { r1 = c; g1 = x; }
    else if (hp < 2) { r1 = x; g1 = c; }
    else if (hp < 3) { g1 = c; b1 = x; }
    else if (hp < 4) { g1 = x; b1 = c; }
    else if (hp < 5) { r1 = x; b1 = c; }
    else { r1 = c; b1 = x; }
    var m = v - c;
    return { r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 };
  }
  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var d = max - min;
    var h = 0;
    if (d !== 0) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h: h, s: max === 0 ? 0 : d / max, v: max };
  }

  // ── State (per-open invocation) ─────────────────────────────────────────
  var _isInjected = false;
  var _currentHex = '#0d8577';
  var _onConfirm = null;
  var _activeTab = 'grid'; // 'grid' | 'spectrum' | 'sliders'
  var _spectrumState = { h: 150, s: 0.8, v: 0.9 }; // synced from hex on open

  // ── Grid palette: 11 rows × 11 cols = 121 swatches ──────────────────────
  // Row 0 = grayscale ramp. Rows 1-10 = (hue, saturation/lightness) ramp.
  function buildGridSwatches() {
    var out = [];
    // Grayscale row
    for (var i = 0; i < 11; i++) {
      var v = 255 - Math.round(i * 25.5);
      out.push(rgbToHex(v, v, v));
    }
    // Color rows: hue varies by column, saturation/lightness varies by row
    var hues = [0, 20, 40, 60, 100, 160, 200, 240, 280, 320, 350];
    var levels = [
      { s: 0.85, v: 0.30 },
      { s: 0.85, v: 0.45 },
      { s: 0.90, v: 0.60 },
      { s: 0.95, v: 0.75 },
      { s: 1.00, v: 0.95 }, // most saturated bright
      { s: 0.70, v: 1.00 },
      { s: 0.50, v: 1.00 },
      { s: 0.35, v: 1.00 },
      { s: 0.22, v: 1.00 },
      { s: 0.12, v: 1.00 }
    ];
    for (var r = 0; r < levels.length; r++) {
      for (var c = 0; c < hues.length; c++) {
        var rgb = hsvToRgb(hues[c], levels[r].s, levels[r].v);
        out.push(rgbToHex(rgb.r, rgb.g, rgb.b));
      }
    }
    return out;
  }
  var _gridSwatches = null; // lazy

  // ── DOM injection (once per page) ───────────────────────────────────────
  function injectDOM() {
    if (_isInjected) return;
    _isInjected = true;

    // Inject CSS
    var style = document.createElement('style');
    style.id = 'sydent-color-picker-styles';
    style.textContent = [
      '#sydentCpOverlay{position:fixed;inset:0;background:rgba(0,0,0,0.65);',
      '  display:none;align-items:flex-end;justify-content:center;z-index:10050;',
      '  -webkit-tap-highlight-color:transparent;}',
      '#sydentCpOverlay.open{display:flex;}',
      '#sydentCpOverlay .cp-sheet{background:var(--bg2,#0f1f35);',
      '  border:1px solid var(--border,#1e3556);border-radius:18px 18px 0 0;',
      '  width:100%;max-width:520px;max-height:88vh;overflow-y:auto;',
      '  padding:16px 18px 22px;direction:rtl;font-family:"Cairo",sans-serif;',
      '  color:var(--text,#e7eef9);box-shadow:0 -8px 32px rgba(0,0,0,0.5);}',
      '@media(min-width:640px){#sydentCpOverlay{align-items:center;}',
      '  #sydentCpOverlay .cp-sheet{border-radius:18px;margin:auto;}}',
      '#sydentCpOverlay .cp-header{display:flex;align-items:center;',
      '  justify-content:space-between;margin-bottom:14px;}',
      '#sydentCpOverlay .cp-title{font-weight:800;font-size:16px;}',
      '#sydentCpOverlay .cp-close{width:32px;height:32px;border-radius:50%;',
      '  background:rgba(255,255,255,0.08);border:none;color:var(--text);',
      '  font-size:18px;cursor:pointer;display:flex;align-items:center;',
      '  justify-content:center;line-height:1;}',
      '#sydentCpOverlay .cp-close:hover{background:rgba(255,255,255,0.14);}',
      '#sydentCpOverlay .cp-tabs{display:flex;background:rgba(255,255,255,0.04);',
      '  border-radius:10px;padding:3px;margin-bottom:14px;}',
      '#sydentCpOverlay .cp-tab{flex:1;padding:8px 12px;text-align:center;',
      '  font-size:13px;font-weight:700;cursor:pointer;border-radius:8px;',
      '  color:var(--text2,#8da0bd);transition:all .15s;border:none;',
      '  background:transparent;font-family:inherit;}',
      '#sydentCpOverlay .cp-tab.active{background:rgba(255,255,255,0.10);',
      '  color:var(--text);}',
      '#sydentCpOverlay .cp-panel{display:none;}',
      '#sydentCpOverlay .cp-panel.active{display:block;}',
      // Grid tab
      '#sydentCpOverlay .cp-grid{display:grid;grid-template-columns:repeat(11,1fr);',
      '  gap:4px;}',
      '#sydentCpOverlay .cp-swatch{aspect-ratio:1;border-radius:6px;cursor:pointer;',
      '  border:2px solid transparent;transition:transform .1s;}',
      '#sydentCpOverlay .cp-swatch:hover{transform:scale(1.12);}',
      '#sydentCpOverlay .cp-swatch.selected{border-color:#fff;',
      '  box-shadow:0 0 0 2px var(--bg2,#0f1f35),0 0 0 4px var(--green,var(--green));}',
      // Spectrum tab
      '#sydentCpOverlay .cp-spectrum{position:relative;width:100%;aspect-ratio:1.6;',
      '  border-radius:12px;overflow:hidden;cursor:crosshair;',
      '  touch-action:none;user-select:none;}',
      '#sydentCpOverlay .cp-spectrum-canvas{width:100%;height:100%;display:block;}',
      '#sydentCpOverlay .cp-spectrum-dot{position:absolute;width:18px;height:18px;',
      '  border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,0.4),',
      '  0 2px 6px rgba(0,0,0,0.4);transform:translate(-50%,-50%);pointer-events:none;}',
      // Sliders tab
      '#sydentCpOverlay .cp-slider-row{margin-bottom:14px;}',
      '#sydentCpOverlay .cp-slider-label{display:flex;justify-content:space-between;',
      '  align-items:center;font-size:11px;font-weight:800;letter-spacing:0.5px;',
      '  color:var(--text2,#8da0bd);margin-bottom:6px;}',
      '#sydentCpOverlay .cp-slider-value{background:rgba(255,255,255,0.06);',
      '  padding:3px 10px;border-radius:6px;font-size:13px;color:var(--text);',
      '  min-width:42px;text-align:center;font-weight:700;}',
      '#sydentCpOverlay .cp-slider{width:100%;height:32px;border-radius:16px;',
      '  appearance:none;-webkit-appearance:none;outline:none;cursor:pointer;}',
      '#sydentCpOverlay .cp-slider::-webkit-slider-thumb{appearance:none;',
      '  -webkit-appearance:none;width:24px;height:24px;border-radius:50%;',
      '  background:#fff;border:3px solid rgba(0,0,0,0.15);cursor:pointer;',
      '  box-shadow:0 2px 6px rgba(0,0,0,0.3);}',
      '#sydentCpOverlay .cp-slider::-moz-range-thumb{width:24px;height:24px;',
      '  border-radius:50%;background:#fff;border:3px solid rgba(0,0,0,0.15);',
      '  cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,0.3);}',
      // Footer (preview + hex + buttons)
      '#sydentCpOverlay .cp-footer{margin-top:18px;padding-top:14px;',
      '  border-top:1px solid var(--border,#1e3556);}',
      '#sydentCpOverlay .cp-preview-row{display:flex;align-items:center;gap:12px;',
      '  margin-bottom:14px;}',
      '#sydentCpOverlay .cp-preview-swatch{width:54px;height:54px;border-radius:12px;',
      '  border:2px solid rgba(255,255,255,0.15);flex-shrink:0;}',
      '#sydentCpOverlay .cp-hex-wrap{flex:1;}',
      '#sydentCpOverlay .cp-hex-label{font-size:11px;font-weight:700;',
      '  color:var(--text2);margin-bottom:4px;letter-spacing:0.5px;}',
      '#sydentCpOverlay .cp-hex-input{width:100%;background:rgba(255,255,255,0.06);',
      '  border:1px solid var(--border);border-radius:8px;padding:8px 12px;',
      '  color:var(--text);font-family:"Courier New",monospace;font-size:14px;',
      '  font-weight:700;text-transform:uppercase;letter-spacing:1px;',
      '  direction:ltr;text-align:left;}',
      '#sydentCpOverlay .cp-hex-input:focus{outline:none;border-color:var(--green);}',
      '#sydentCpOverlay .cp-actions{display:flex;gap:10px;}',
      '#sydentCpOverlay .cp-btn{flex:1;padding:11px;border-radius:10px;border:none;',
      '  font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;',
      '  transition:opacity .15s;}',
      '#sydentCpOverlay .cp-btn:hover{opacity:0.85;}',
      '#sydentCpOverlay .cp-btn-cancel{background:rgba(255,255,255,0.08);',
      '  color:var(--text2);}',
      '#sydentCpOverlay .cp-btn-confirm{background:var(--green,var(--green));',
      '  color:#0a1628;}'
    ].join('\n');
    document.head.appendChild(style);

    // Inject HTML
    var overlay = document.createElement('div');
    overlay.id = 'sydentCpOverlay';
    overlay.innerHTML = [
      '<div class="cp-sheet" role="dialog" aria-modal="true" aria-labelledby="sydentCpTitle">',
      '  <div class="cp-header">',
      '    <div class="cp-title" id="sydentCpTitle">اختيار اللون</div>',
      '    <button type="button" class="cp-close" aria-label="إغلاق" id="sydentCpClose">×</button>',
      '  </div>',
      '  <div class="cp-tabs">',
      '    <button type="button" class="cp-tab active" data-tab="grid">شبكة</button>',
      '    <button type="button" class="cp-tab" data-tab="spectrum">طيف</button>',
      '    <button type="button" class="cp-tab" data-tab="sliders">شرائح</button>',
      '  </div>',
      '  <div class="cp-panel active" data-panel="grid">',
      '    <div class="cp-grid" id="sydentCpGrid"></div>',
      '  </div>',
      '  <div class="cp-panel" data-panel="spectrum">',
      '    <div class="cp-spectrum" id="sydentCpSpectrum">',
      '      <canvas class="cp-spectrum-canvas" id="sydentCpSpectrumCanvas" width="320" height="200"></canvas>',
      '      <div class="cp-spectrum-dot" id="sydentCpSpectrumDot"></div>',
      '    </div>',
      '  </div>',
      '  <div class="cp-panel" data-panel="sliders">',
      '    <div class="cp-slider-row">',
      '      <div class="cp-slider-label"><span>RED</span><span class="cp-slider-value" id="sydentCpRedVal">0</span></div>',
      '      <input type="range" class="cp-slider" id="sydentCpRed" min="0" max="255" value="0" aria-label="Red">',
      '    </div>',
      '    <div class="cp-slider-row">',
      '      <div class="cp-slider-label"><span>GREEN</span><span class="cp-slider-value" id="sydentCpGreenVal">0</span></div>',
      '      <input type="range" class="cp-slider" id="sydentCpGreen" min="0" max="255" value="0" aria-label="Green">',
      '    </div>',
      '    <div class="cp-slider-row">',
      '      <div class="cp-slider-label"><span>BLUE</span><span class="cp-slider-value" id="sydentCpBlueVal">0</span></div>',
      '      <input type="range" class="cp-slider" id="sydentCpBlue" min="0" max="255" value="0" aria-label="Blue">',
      '    </div>',
      '  </div>',
      '  <div class="cp-footer">',
      '    <div class="cp-preview-row">',
      '      <div class="cp-preview-swatch" id="sydentCpPreview"></div>',
      '      <div class="cp-hex-wrap">',
      '        <div class="cp-hex-label">sRGB Hex Colour #</div>',
      '        <input type="text" class="cp-hex-input" id="sydentCpHex" maxlength="7" autocomplete="off" spellcheck="false">',
      '      </div>',
      '    </div>',
      '    <div class="cp-actions">',
      '      <button type="button" class="cp-btn cp-btn-cancel" id="sydentCpCancel">إلغاء</button>',
      '      <button type="button" class="cp-btn cp-btn-confirm" id="sydentCpConfirm">✓ اختيار</button>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('');
    document.body.appendChild(overlay);

    // Wire up events
    document.getElementById('sydentCpClose').addEventListener('click', close);
    document.getElementById('sydentCpCancel').addEventListener('click', close);
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) close();
    });
    document.getElementById('sydentCpConfirm').addEventListener('click', confirm);

    // Tab switching
    var tabs = overlay.querySelectorAll('.cp-tab');
    for (var ti = 0; ti < tabs.length; ti++) {
      tabs[ti].addEventListener('click', function(e) {
        switchTab(e.currentTarget.getAttribute('data-tab'));
      });
    }

    // Sliders
    var rEl = document.getElementById('sydentCpRed');
    var gEl = document.getElementById('sydentCpGreen');
    var bEl = document.getElementById('sydentCpBlue');
    function onSliderInput() {
      var r = parseInt(rEl.value, 10);
      var g = parseInt(gEl.value, 10);
      var b = parseInt(bEl.value, 10);
      _currentHex = rgbToHex(r, g, b);
      _spectrumState = rgbToHsv(r, g, b);
      // Avoid recursive feedback: sync UI without triggering input events
      syncSlidersUI();
      syncHexInput();
      syncPreview();
      syncGridSelection();
      drawSpectrumDot(); // dot only; canvas doesn't need redraw on slider change
    }
    rEl.addEventListener('input', onSliderInput);
    gEl.addEventListener('input', onSliderInput);
    bEl.addEventListener('input', onSliderInput);

    // Hex input
    var hexEl = document.getElementById('sydentCpHex');
    hexEl.addEventListener('input', function() {
      var v = hexEl.value.trim();
      // Allow user to type without # — auto-add it
      if (v.length > 0 && v.charAt(0) !== '#') v = '#' + v;
      if (/^#[0-9A-Fa-f]{6}$/.test(v)) {
        _currentHex = v.toLowerCase();
        var rgb = hexToRgb(_currentHex);
        _spectrumState = rgbToHsv(rgb.r, rgb.g, rgb.b);
        syncSlidersUI();
        syncPreview();
        syncGridSelection();
        drawSpectrumDot();
      }
    });
    hexEl.addEventListener('blur', function() {
      // On blur, normalize the field to the current sanitized value
      hexEl.value = _currentHex.toUpperCase();
    });

    // Spectrum interaction (mouse + touch)
    var spectrumEl = document.getElementById('sydentCpSpectrum');
    function spectrumPick(clientX, clientY) {
      var rect = spectrumEl.getBoundingClientRect();
      var x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      var y = Math.max(0, Math.min(rect.height, clientY - rect.top));
      var h = (x / rect.width) * 360;
      // y maps to (saturation, value) in a perceptually pleasant way:
      //   top → white-ish (s low, v high)
      //   middle → fully saturated
      //   bottom → dark
      var ny = y / rect.height; // 0..1
      var s, v;
      if (ny < 0.5) {
        // Top half: s goes 0 → 1, v stays 1
        s = ny * 2;
        v = 1;
      } else {
        // Bottom half: s stays 1, v goes 1 → 0
        s = 1;
        v = 1 - (ny - 0.5) * 2;
      }
      _spectrumState = { h: h, s: s, v: v };
      var rgb = hsvToRgb(h, s, v);
      _currentHex = rgbToHex(rgb.r, rgb.g, rgb.b);
      syncSlidersUI();
      syncHexInput();
      syncPreview();
      syncGridSelection();
      drawSpectrumDot();
    }
    var _dragging = false;
    spectrumEl.addEventListener('mousedown', function(e) {
      _dragging = true; spectrumPick(e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', function(e) {
      if (_dragging) spectrumPick(e.clientX, e.clientY);
    });
    window.addEventListener('mouseup', function() { _dragging = false; });
    spectrumEl.addEventListener('touchstart', function(e) {
      if (e.touches.length) {
        e.preventDefault();
        spectrumPick(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: false });
    spectrumEl.addEventListener('touchmove', function(e) {
      if (e.touches.length) {
        e.preventDefault();
        spectrumPick(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: false });

    // Render grid swatches (lazy build once)
    if (!_gridSwatches) _gridSwatches = buildGridSwatches();
    var gridEl = document.getElementById('sydentCpGrid');
    var html = '';
    for (var i = 0; i < _gridSwatches.length; i++) {
      var c = _gridSwatches[i];
      html += '<div class="cp-swatch" data-color="' + c + '" style="background:' + c + ';" role="button" aria-label="' + c + '"></div>';
    }
    gridEl.innerHTML = html;
    // Delegated click handler
    gridEl.addEventListener('click', function(e) {
      var t = e.target;
      if (t && t.classList && t.classList.contains('cp-swatch')) {
        var col = t.getAttribute('data-color');
        if (col) {
          _currentHex = col;
          var rgb = hexToRgb(col);
          _spectrumState = rgbToHsv(rgb.r, rgb.g, rgb.b);
          syncSlidersUI();
          syncHexInput();
          syncPreview();
          syncGridSelection();
          drawSpectrumDot();
        }
      }
    });

    // Render spectrum canvas once (it's static — only the dot moves)
    drawSpectrumCanvas();
  }

  // ── Render helpers ──────────────────────────────────────────────────────
  function drawSpectrumCanvas() {
    var canvas = document.getElementById('sydentCpSpectrumCanvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    // Horizontal hue gradient (left → right: 0 → 360)
    var img = ctx.createImageData(W, H);
    for (var y = 0; y < H; y++) {
      var ny = y / H;
      var s, v;
      if (ny < 0.5) { s = ny * 2; v = 1; }
      else { s = 1; v = 1 - (ny - 0.5) * 2; }
      for (var x = 0; x < W; x++) {
        var h = (x / W) * 360;
        var rgb = hsvToRgb(h, s, v);
        var idx = (y * W + x) * 4;
        img.data[idx]     = rgb.r;
        img.data[idx + 1] = rgb.g;
        img.data[idx + 2] = rgb.b;
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  function drawSpectrumDot() {
    var dot = document.getElementById('sydentCpSpectrumDot');
    if (!dot) return;
    // Convert HSV state to (x%, y%)
    var x = (_spectrumState.h / 360) * 100;
    var s = _spectrumState.s, v = _spectrumState.v;
    var ny;
    if (v >= 1 - 1e-6) {
      // On top half: s ∈ [0,1] → ny ∈ [0, 0.5]
      ny = s * 0.5;
    } else {
      // On bottom half: v ∈ [0,1] → ny ∈ [1, 0.5]
      ny = 0.5 + (1 - v) * 0.5;
    }
    dot.style.left = x + '%';
    dot.style.top = (ny * 100) + '%';
  }
  function syncSlidersUI() {
    var rgb = hexToRgb(_currentHex);
    document.getElementById('sydentCpRed').value = rgb.r;
    document.getElementById('sydentCpGreen').value = rgb.g;
    document.getElementById('sydentCpBlue').value = rgb.b;
    document.getElementById('sydentCpRedVal').textContent = rgb.r;
    document.getElementById('sydentCpGreenVal').textContent = rgb.g;
    document.getElementById('sydentCpBlueVal').textContent = rgb.b;
    // Color the slider tracks so they look like the iOS gradient sliders
    var rTrack = 'linear-gradient(to right, ' + rgbToHex(0, rgb.g, rgb.b) + ', ' + rgbToHex(255, rgb.g, rgb.b) + ')';
    var gTrack = 'linear-gradient(to right, ' + rgbToHex(rgb.r, 0, rgb.b) + ', ' + rgbToHex(rgb.r, 255, rgb.b) + ')';
    var bTrack = 'linear-gradient(to right, ' + rgbToHex(rgb.r, rgb.g, 0) + ', ' + rgbToHex(rgb.r, rgb.g, 255) + ')';
    document.getElementById('sydentCpRed').style.background = rTrack;
    document.getElementById('sydentCpGreen').style.background = gTrack;
    document.getElementById('sydentCpBlue').style.background = bTrack;
  }
  function syncHexInput() {
    var el = document.getElementById('sydentCpHex');
    // Only update if not focused (so user typing isn't disturbed)
    if (document.activeElement !== el) el.value = _currentHex.toUpperCase();
  }
  function syncPreview() {
    document.getElementById('sydentCpPreview').style.background = _currentHex;
  }
  function syncGridSelection() {
    var grid = document.getElementById('sydentCpGrid');
    if (!grid) return;
    var swatches = grid.querySelectorAll('.cp-swatch');
    for (var i = 0; i < swatches.length; i++) {
      var c = swatches[i].getAttribute('data-color');
      if (c && c.toLowerCase() === _currentHex.toLowerCase()) {
        swatches[i].classList.add('selected');
      } else {
        swatches[i].classList.remove('selected');
      }
    }
  }
  function switchTab(name) {
    _activeTab = name;
    var tabs = document.querySelectorAll('#sydentCpOverlay .cp-tab');
    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i].getAttribute('data-tab') === name) tabs[i].classList.add('active');
      else tabs[i].classList.remove('active');
    }
    var panels = document.querySelectorAll('#sydentCpOverlay .cp-panel');
    for (var j = 0; j < panels.length; j++) {
      if (panels[j].getAttribute('data-panel') === name) panels[j].classList.add('active');
      else panels[j].classList.remove('active');
    }
    // Sync the active panel UI to current state
    if (name === 'spectrum') drawSpectrumDot();
    if (name === 'sliders') syncSlidersUI();
  }

  // ── Public API ──────────────────────────────────────────────────────────
  function open(currentHex, callback) {
    injectDOM();
    _currentHex = sanitizeHex(currentHex);
    _onConfirm = typeof callback === 'function' ? callback : null;
    var rgb = hexToRgb(_currentHex);
    _spectrumState = rgbToHsv(rgb.r, rgb.g, rgb.b);
    // Sync all panels to incoming hex
    syncSlidersUI();
    syncHexInput();
    syncPreview();
    syncGridSelection();
    drawSpectrumDot();
    switchTab('grid');
    document.getElementById('sydentCpOverlay').classList.add('open');
    // Defer focus so the overlay finishes painting first
    setTimeout(function() {
      var hexInput = document.getElementById('sydentCpHex');
      if (hexInput) hexInput.value = _currentHex.toUpperCase();
    }, 30);
  }
  function close() {
    var overlay = document.getElementById('sydentCpOverlay');
    if (overlay) overlay.classList.remove('open');
    _onConfirm = null; // user cancelled — drop the callback
  }
  function confirm() {
    var cb = _onConfirm;
    var hex = _currentHex;
    close();
    // Fire the callback AFTER closing so any UI updates the consumer triggers
    // (e.g. updating a swatch) don't compete with the overlay closing animation.
    if (cb) {
      try { cb(hex); } catch (e) { console.error('SyDentColorPicker callback error:', e); }
    }
  }

  window.SyDentColorPicker = {
    open: open,
    injectDOM: injectDOM,
    // Expose helpers in case consumers need them
    sanitizeHex: sanitizeHex
  };
})();

/* ============================================================
   Phase 9 — Patient Documents & Imaging  (shared helper)
   Single source of truth for Supabase Storage I/O used by
   patient-profile.html (files tab) + appointments.html (modal).
   Bucket: patient-files (private). Path: {owner_id}/{patient_id}/{uuid}-{name}
   so storage RLS (foldername[1] = auth.uid()) isolates each tenant.
   Rule #68: consolidate repeated query patterns into window.SyDent* namespace.
   ============================================================ */
(function(){
  'use strict';
  var BUCKET = 'patient-files';
  var CAT_LABELS = {
    xray:           '🦷 أشعة',
    clinical_photo: '📷 صورة سريرية',
    document:       '📄 مستند',
    receipt:        '🧾 إيصال',
    other:          '📎 أخرى'
  };

  function uuid(){
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c){
      var r = Math.random()*16|0, v = c==='x' ? r : (r&0x3|0x8); return v.toString(16);
    });
  }

  // Keep a human-readable but filesystem-safe object name (Arabic letters allowed).
  function sanitizeName(name){
    name = String(name || 'file');
    var dot  = name.lastIndexOf('.');
    var base = dot > 0 ? name.slice(0, dot) : name;
    var ext  = dot > 0 ? name.slice(dot)    : '';
    base = base.replace(/[^\w\-\u0600-\u06FF]+/g, '_').slice(0, 60) || 'file';
    ext  = ext.replace(/[^.\w]+/g, '').slice(0, 8);
    return base + ext;
  }

  function isImage(m){ return /^image\//.test(m || ''); }

  // Client-side compression. Returns a Blob for large raster images, else the
  // original File untouched (PDFs always pass through). Never enlarges a file.
  async function compressImage(file){
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    if (file.size < 400 * 1024) return file;
    try {
      var bmp   = await createImageBitmap(file);
      var maxD  = 1800;
      var scale = Math.min(1, maxD / Math.max(bmp.width, bmp.height));
      var w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
      if (bmp.close) bmp.close();
      var blob = await new Promise(function(res){ canvas.toBlob(res, 'image/jpeg', 0.85); });
      return (blob && blob.size < file.size) ? blob : file;
    } catch (e){ console.warn('[SyDentFiles] compress failed, using original', e); return file; }
  }

  async function ownerId(){
    try { var u = (await window.sb.auth.getUser()).data.user; return u ? u.id : null; }
    catch(e){ return null; }
  }

  // opts: { appointmentId, category, note }
  async function upload(patientId, file, opts){
    opts = opts || {};
    if (!window.sb)   return { ok:false, reason:'no-sb' };
    if (!patientId)   return { ok:false, reason:'no-patient' };
    var oid = await ownerId();
    if (!oid)         return { ok:false, reason:'no-owner' };

    var body = await compressImage(file);
    var mime = (body && body.type) || file.type || 'application/octet-stream';
    var displayName = file.name || ('ملف-' + Date.now());
    var storeName   = sanitizeName(displayName);
    // If compression transcoded to JPEG, keep the stored extension honest.
    if (body !== file && /image\/jpeg/.test(mime) && !/\.jpe?g$/i.test(storeName)) {
      storeName = storeName.replace(/\.[^.]+$/, '') + '.jpg';
    }
    var path = oid + '/' + patientId + '/' + uuid() + '-' + storeName;

    var up = await window.sb.storage.from(BUCKET).upload(path, body, { contentType: mime, upsert:false });
    if (up.error) return { ok:false, reason:'storage', error:up.error };

    var docRow = {
      owner_id:       oid,
      patient_id:     patientId,
      appointment_id: opts.appointmentId || null,
      storage_path:   path,
      file_name:      displayName,
      mime_type:      mime,
      size_bytes:     (body && body.size) || file.size || null,
      category:       opts.category || 'other',
      note:           opts.note || null,
      uploaded_by:    oid,
      tooth_num:      opts.toothNum || null,   // P2 (Migration 55): link image/doc to a specific tooth
      session_id:     opts.sessionId || null   // P2 (Migration 55): optional link to a ledger session
    };

    var ins = await window.sb.from('patient_documents').insert(docRow).select().single();

    // Graceful pre-Migration-55 fallback: if tooth_num/session_id columns are not
    // present yet (PGRST204 = column missing from schema cache), retry the insert
    // without them so file upload NEVER breaks before the migration is applied.
    // Parity with the account_adjustments graceful fallback pattern (v70).
    if (ins.error && (ins.error.code === 'PGRST204' ||
        /tooth_num|session_id/i.test(ins.error.message || ''))) {
      delete docRow.tooth_num;
      delete docRow.session_id;
      ins = await window.sb.from('patient_documents').insert(docRow).select().single();
    }

    if (ins.error) {
      // Roll back the orphaned object so storage never drifts from the table.
      try { await window.sb.storage.from(BUCKET).remove([path]); } catch(e){}
      return { ok:false, reason:'db', error:ins.error };
    }
    return { ok:true, row: ins.data };
  }

  // opts: { appointmentId }  → scope to one appointment's files
  async function list(patientId, opts){
    opts = opts || {};
    if (!window.sb || !patientId) return [];
    var q = window.sb.from('patient_documents').select('*')
              .eq('patient_id', patientId).order('created_at', { ascending:false });
    if (opts.appointmentId) q = q.eq('appointment_id', opts.appointmentId);
    var res = await q;
    return res.error ? [] : (res.data || []);
  }

  async function countFor(patientId){
    if (!window.sb || !patientId) return 0;
    var res = await window.sb.from('patient_documents')
                .select('id', { count:'exact', head:true }).eq('patient_id', patientId);
    return res.error ? 0 : (res.count || 0);
  }

  async function signedUrls(paths, expiry){
    if (!window.sb || !paths || !paths.length) return {};
    var res = await window.sb.storage.from(BUCKET).createSignedUrls(paths, expiry || 3600);
    var map = {};
    if (!res.error && res.data) res.data.forEach(function(d){ if (d.signedUrl) map[d.path] = d.signedUrl; });
    return map;
  }

  async function signedUrl(path, expiry){
    if (!window.sb || !path) return null;
    var res = await window.sb.storage.from(BUCKET).createSignedUrl(path, expiry || 3600);
    return res.error ? null : ((res.data && res.data.signedUrl) || null);
  }

  // Storage object removed first, then the row — a row never silently points
  // at a missing file. Non-fatal storage error still proceeds to row delete.
  async function remove(row){
    if (!window.sb || !row) return { ok:false, reason:'no-row' };
    try { await window.sb.storage.from(BUCKET).remove([row.storage_path]); } catch(e){}
    var del = await window.sb.from('patient_documents').delete().eq('id', row.id);
    return { ok: !del.error, error: del.error };
  }

  function humanSize(bytes){
    bytes = Number(bytes || 0);
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024*1024) return (bytes/1024).toFixed(0) + ' KB';
    return (bytes/1024/1024).toFixed(1) + ' MB';
  }

  window.SyDentFiles = {
    BUCKET: BUCKET, CAT_LABELS: CAT_LABELS,
    upload: upload, list: list, countFor: countFor,
    signedUrl: signedUrl, signedUrls: signedUrls,
    remove: remove, compressImage: compressImage,
    isImage: isImage, humanSize: humanSize
  };
})();
