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
    owner:     { bg: 'rgba(46,232,158,0.14)',  border: 'rgba(46,232,158,0.40)',  text: '#2ee89e' },
    doctor:    { bg: 'rgba(99,179,237,0.14)',  border: 'rgba(99,179,237,0.40)',  text: '#63b3ed' },
    secretary: { bg: 'rgba(255,167,38,0.14)',  border: 'rgba(255,167,38,0.40)',  text: '#ffa726' }
  };

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

  function isOwner()     { return getRole() === 'owner'; }
  function isDoctor()    { return getRole() === 'doctor'; }
  function isSecretary() { return getRole() === 'secretary'; }

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
        '<div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0a1628;padding:24px;font-family:\'Cairo\',sans-serif;text-align:center;direction:rtl;">' +
          '<div style="font-size:72px;margin-bottom:16px;">🔒</div>' +
          '<div style="font-size:22px;font-weight:800;color:#e1f4ee;margin-bottom:10px;">لا تملك صلاحية</div>' +
          '<div style="font-size:14px;color:#8a9ab5;margin-bottom:28px;max-width:360px;line-height:1.7;">' +
            'الوضع الحالي (' + (ROLE_LABELS[role] || role) + ') لا يسمح بالوصول إلى هذه الصفحة.' +
          '</div>' +
          '<a href="index.html" style="padding:12px 24px;background:#2ee89e;border-radius:10px;color:#0a1628;font-size:14px;font-weight:800;text-decoration:none;margin-bottom:10px;">' +
            '↩ العودة للصفحة الرئيسية' +
          '</a>' +
          '<button onclick="window.SyDentLock.openSwitchModal()" style="padding:10px 22px;background:transparent;border:1px solid rgba(255,255,255,0.18);border-radius:10px;color:#8a9ab5;font-family:\'Cairo\',sans-serif;font-size:13px;cursor:pointer;margin-top:8px;">' +
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
        .select('id, name, is_active')
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
  async function loadEmployees() {
    if (_employeesListCache) return _employeesListCache;
    try {
      var user = await window.sbGetUser();
      if (!user) return [];
      var res = await window.sb.from('clinic_employees')
        .select('id, name, role, doctor_id, pin_hash, is_active')
        .eq('owner_id', user.id)
        .order('role', { ascending: true })
        .order('name', { ascending: true });
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
      '.sd-lock-btn.sd-owner{background:rgba(46,232,158,0.14);border-color:rgba(46,232,158,0.40);color:#2ee89e;}' +
      '.sd-lock-btn.sd-doctor{background:rgba(99,179,237,0.14);border-color:rgba(99,179,237,0.40);color:#63b3ed;}' +
      '.sd-lock-btn.sd-secretary{background:rgba(255,167,38,0.14);border-color:rgba(255,167,38,0.40);color:#ffa726;}' +
      '.sd-lock-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;direction:rtl;font-family:\'Cairo\',sans-serif;}' +
      '.sd-lock-modal{background:#0f2038;border:1.5px solid rgba(46,232,158,0.25);border-radius:14px;padding:24px;max-width:440px;width:100%;color:#e1f4ee;max-height:90vh;overflow-y:auto;}' +
      '.sd-lock-modal h3{margin:0 0 6px;font-size:18px;font-weight:800;color:#2ee89e;}' +
      '.sd-lock-modal .sd-cur{font-size:13px;color:#8a9ab5;margin-bottom:16px;padding:10px 12px;background:rgba(46,232,158,0.06);border-radius:8px;}' +
      '.sd-lock-modal .sd-opt{display:block;padding:12px 14px;margin-bottom:8px;background:#132840;border:1.5px solid transparent;border-radius:10px;cursor:pointer;transition:all .15s;}' +
      '.sd-lock-modal .sd-opt:hover{border-color:rgba(46,232,158,0.30);background:rgba(46,232,158,0.05);}' +
      '.sd-lock-modal .sd-opt input[type=radio]{margin-left:8px;accent-color:#2ee89e;}' +
      '.sd-lock-modal .sd-opt.sd-active{border-color:rgba(46,232,158,0.55);background:rgba(46,232,158,0.08);}' +
      '.sd-lock-modal .sd-sub{padding:8px 12px 8px 28px;margin-top:6px;display:none;}' +
      '.sd-lock-modal .sd-opt.sd-active .sd-sub{display:block;}' +
      '.sd-lock-modal select{width:100%;padding:9px 10px;background:#0a1628;border:1px solid rgba(46,232,158,0.20);border-radius:8px;color:#e1f4ee;font-family:\'Cairo\',sans-serif;font-size:13px;}' +
      '.sd-lock-modal .sd-pin-row{margin-top:14px;padding:12px;background:rgba(99,179,237,0.06);border:1px solid rgba(99,179,237,0.25);border-radius:10px;}' +
      '.sd-lock-modal .sd-pin-row label{display:block;font-size:12px;color:#8a9ab5;margin-bottom:6px;font-weight:700;}' +
      '.sd-lock-modal .sd-pin-row input{width:100%;padding:10px 12px;background:#0a1628;border:1.5px solid rgba(99,179,237,0.30);border-radius:8px;color:#e1f4ee;font-family:\'Cairo\',sans-serif;font-size:18px;font-weight:800;text-align:center;letter-spacing:8px;}' +
      '.sd-lock-modal .sd-msg{font-size:12px;color:#ef5350;margin-top:8px;min-height:18px;font-weight:700;}' +
      '.sd-lock-modal .sd-msg.sd-ok{color:#2ee89e;}' +
      '.sd-lock-modal .sd-actions{display:flex;gap:10px;margin-top:18px;}' +
      '.sd-lock-modal .sd-btn{flex:1;padding:11px 14px;border-radius:10px;font-family:\'Cairo\',sans-serif;font-size:13px;font-weight:800;cursor:pointer;border:1.5px solid transparent;}' +
      '.sd-lock-modal .sd-btn-cancel{background:transparent;border-color:rgba(255,255,255,0.18);color:#8a9ab5;}' +
      '.sd-lock-modal .sd-btn-cancel:hover{background:rgba(255,255,255,0.06);}' +
      '.sd-lock-modal .sd-btn-primary{background:#2ee89e;color:#0a1628;}' +
      '.sd-lock-modal .sd-btn-primary:hover{filter:brightness(1.08);}' +
      '.sd-lock-modal .sd-btn-primary:disabled{opacity:0.5;cursor:not-allowed;}';
    document.head.appendChild(style);
  }

  // ── Inject header lock button into topbar (or fallback container) ──
  function injectHeaderButton() {
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
    if (empId && _employeesListCache) {
      var emp = (_employeesListCache || []).find(function(e){ return e.id === empId; });
      if (emp && emp.name) {
        // Active employee → show their name + role icon
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
        ? '<span style="color:#f5c842;font-size:11px;margin-right:6px;">⚠ بدون PIN</span>'
        : '';
      optionsHtml +=
        '<label class="sd-opt' + (current ? ' sd-active' : '') + '" data-employee-id="' + escapeHtmlLock(emp.id) + '">' +
          '<input type="radio" name="sdEmpSel" value="' + escapeHtmlLock(emp.id) + '"' + (current ? ' checked' : '') + '>' +
          '<span style="font-weight:800;">' + icon + ' ' + escapeHtmlLock(emp.name) + '</span>' +
          '<span style="color:#8a9ab5;font-size:11px;margin-right:8px;">' + escapeHtmlLock(roleLabel) + '</span>' +
          pinWarn +
        '</label>';
    });

    // Current employee display
    var curEmp = sorted.find(isCurrent);
    var curDisplay = curEmp
      ? ((ROLE_ICONS[curEmp.role] || '') + ' ' + curEmp.name + ' (' + (ROLE_LABELS[curEmp.role] || curEmp.role) + ')')
      : ((ROLE_ICONS[curRole] || '') + ' ' + (ROLE_LABELS[curRole] || curRole));

    ov.innerHTML =
      '<div class="sd-lock-modal" role="dialog" aria-label="تبديل الموظف">' +
        '<h3>🔓 تبديل الموظف</h3>' +
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
      // - Owner role → ANY other = downgrade or sibling-downgrade = no PIN (owner already supreme)
      // - Anything else → PIN required (which means PIN of the TARGET employee)
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
      } else {
        needPin = true;
      }

      // Edge case: target has NO pin_hash set yet → can't verify
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

    // Esc key closes the modal
    var escHandler = function(e){
      if (e.key === 'Escape' || e.keyCode === 27) {
        ov.remove();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    function closeModal() {
      document.removeEventListener('keydown', escHandler);
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
      if (pi && pi.offsetParent) pi.focus();
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
      : '<div style="color:#ef5350;font-size:12px;">لا يوجد أطباء — أضف طبيباً من صفحة الأطباء أولاً.</div>';

    ov.innerHTML =
      '<div class="sd-lock-modal" role="dialog" aria-label="تبديل الوضع">' +
        '<h3>🔓 تبديل الوضع</h3>' +
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
        ov.remove();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    function closeModal() {
      document.removeEventListener('keydown', escHandler);
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
    setTimeout(function(){ var pi = ov.querySelector('#sdPinInput'); if (pi && pi.offsetParent) pi.focus(); }, 80);
  }

  // ── HTML escape (local helper) ────────────────────────────────
  function escapeHtmlLock(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ── Auto-init on every page that has supabase-init ────────────
  // ── Phase 4.1: Deactivated doctor handling ────────────────────
  // If the device is locked to a Doctor whose clinic_doctors record is
  // inactive (is_active=false) or missing, render a permanent red banner
  // and disable any element tagged [data-doctor-inactive-block]. This
  // implements the OpenDental "Hidden provider = removed from selection"
  // pattern: device stays usable for read access, but new productions
  // are gated until the Owner reactivates the account.
  //
  // Reads from _doctorsListCache + _employeesListCache (preloaded in autoInit).
  // The caches contain is_active=true rows only, so "not found in cache" = inactive.
  //
  // Phase 5 update: the locked identity on a device can be either:
  //   (a) an employee (employees.is_active=false → device locked)
  //   (b) a doctor (clinic_doctors.is_active=false → device locked)
  //   (c) both (each deactivated separately) → device locked
  // The device should go read-only if EITHER is deactivated, because the
  // person on this device has effectively lost their working identity
  // (their name as employee OR their billable identity as doctor).
  function isDoctorAccountInactive() {
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
      // Employee is active. If this employee is linked to a doctor row,
      // ALSO check that doctor row is active (Owner may have deactivated
      // the doctor independently of the employee).
      if (emp.role === 'doctor' && emp.doctor_id && _doctorsListCache) {
        return !_doctorsListCache.find(function(d){ return d.id === emp.doctor_id; });
      }
      return false; // active employee, no linked doctor needed
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
    // Skip on auth & landing pages (pre-auth)
    var path = (window.location.pathname || '').toLowerCase();
    if (/auth\.html$|landing\.html$|^\/$/i.test(path)) return;

    // Wait briefly for DOM
    if (document.readyState === 'loading') {
      await new Promise(function(r){ document.addEventListener('DOMContentLoaded', r, { once: true }); });
    }
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
    'patient.', 'appointment.', 'session.', 'payment.',
    'lab.', 'doctor.', 'employee.', 'settings.', 'lock.'
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

  // ── Public API ────────────────────────────────────────────────
  window.SyDentLock = {
    // state
    getRole: getRole,
    getDoctorId: getDoctorId,
    isOwner: isOwner,
    isDoctor: isDoctor,
    isSecretary: isSecretary,
    isDoctorAccountInactive: isDoctorAccountInactive,
    // Phase 5: per-employee identity
    getEmployeeId: getEmployeeId,
    loadEmployees: loadEmployees,
    invalidateEmployeesCache: invalidateEmployeesCache,
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
