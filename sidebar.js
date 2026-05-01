(function() {

// ─── CSS ───
const css = `
  :root {
    --sb-width: 240px;
    --bg:    #0a1628;
    --bg2:   #0f2038;
    --bg3:   #132840;
    --green: #2ee89e;
    --green-dim: rgba(46,232,158,0.12);
    --text:  #e1f4ee;
    --text2: #8a9ab5;
    --border: rgba(46,232,158,0.15);
  }

  /* ─── Sidebar ─── */
  .sb-sidebar {
    width: var(--sb-width);
    background: var(--bg2);
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    position: fixed;
    right: 0; top: 0; bottom: 0;
    z-index: 200;
    transition: transform .3s cubic-bezier(.25,.46,.45,.94);
  }
  .sb-logo {
    padding: 22px 20px;
    border-bottom: 1px solid var(--border);
    display: flex; align-items: center; gap: 10px;
    text-decoration: none;
  }
  .sb-logo-icon {
    width: 38px; height: 38px;
    background: linear-gradient(135deg, var(--green), #1ac5a8);
    border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    font-size: 18px; flex-shrink: 0;
  }
  .sb-logo-name { font-size: 18px; font-weight: 900; color: var(--text); font-family: 'Cairo', sans-serif; }
  .sb-logo-sub  { font-size: 10px; color: var(--text2); font-family: 'Cairo', sans-serif; }

  .sb-nav { flex: 1; padding: 12px 0; overflow-y: auto; }
  .sb-section {
    padding: 14px 20px 6px;
    font-size: 10px; font-weight: 700;
    color: var(--text2);
    letter-spacing: 1px;
    font-family: 'Cairo', sans-serif;
  }
  .sb-item {
    display: flex; align-items: center; gap: 11px;
    padding: 11px 20px;
    font-size: 14px; font-weight: 600;
    color: var(--text2);
    cursor: pointer;
    transition: all .18s;
    border-right: 3px solid transparent;
    text-decoration: none;
    font-family: 'Cairo', sans-serif;
    position: relative;
  }
  .sb-item:hover { color: var(--text); background: var(--green-dim); }
  .sb-item.active {
    color: var(--green);
    background: var(--green-dim);
    border-right-color: var(--green);
  }
  .sb-icon { font-size: 16px; width: 20px; text-align: center; }
  .sb-badge {
    margin-right: auto;
    background: var(--green);
    color: #0a1628;
    font-size: 10px; font-weight: 800;
    min-width: 18px; height: 18px;
    border-radius: 9px;
    display: flex; align-items: center; justify-content: center;
    padding: 0 5px;
  }

  .sb-footer {
    padding: 14px 20px;
    border-top: 1px solid var(--border);
    font-size: 12px; color: var(--text2);
    font-family: 'Cairo', sans-serif;
  }

  /* ─── Overlay ─── */
  .sb-overlay {
    display: none;
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.6);
    backdrop-filter: blur(2px);
    z-index: 199;
  }
  .sb-overlay.open { display: block; }

  /* ─── Hamburger ─── */
  .sb-hamburger {
    display: none;
    width: 40px; height: 40px;
    background: var(--bg3);
    border: 1px solid var(--border);
    border-radius: 10px;
    flex-direction: column;
    align-items: center; justify-content: center;
    gap: 5px;
    cursor: pointer;
    flex-shrink: 0;
    position: relative; z-index: 10;
  }
  .sb-hamburger span {
    display: block;
    width: 18px; height: 2px;
    background: var(--text);
    border-radius: 2px;
    transition: all .25s ease;
  }
  .sb-hamburger.open span:nth-child(1) { transform: translateY(7px) rotate(45deg); }
  .sb-hamburger.open span:nth-child(2) { opacity: 0; transform: scaleX(0); }
  .sb-hamburger.open span:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }

  /* ─── Main content offset ─── */
  body.sb-ready .sb-main-content {
    margin-right: var(--sb-width);
  }

  /* ─── Mobile ─── */
  @media (max-width: 820px) {
    .sb-hamburger { display: flex !important; }
    .sb-sidebar {
      transform: translateX(110%);
      box-shadow: -8px 0 32px rgba(0,0,0,0.5);
    }
    .sb-sidebar.open { transform: translateX(0); }
    body.sb-ready .sb-main-content { margin-right: 0 !important; }
  }
`;

// ─── HTML ───
const navItems = [
  { section: 'الرئيسية' },
  { icon: '📊', label: 'لوحة التحكم', href: 'index.html',    id: 'dashboard' },
  { icon: '👥', label: 'المرضى',      href: 'patients.html', id: 'patients'  },
  { icon: '📅', label: 'المواعيد',    href: 'appointments.html', id: 'appointments' },
  { section: 'الإدارة' },
  { icon: '💊', label: 'قائمة العلاجات', href: 'treatments.html', id: 'treatments' },
  { icon: '💳', label: 'المدفوعات',   href: '#',             id: 'payments'  },
  { icon: '🧪', label: 'المخابر',     href: '#',             id: 'labs'      },
  { section: 'تحليل' },
  { icon: '📈', label: 'التقارير',    href: '#',             id: 'reports'   },
  { icon: '📋', label: 'السجلات',     href: '#',             id: 'logs'      },
  { section: 'النظام' },
  { icon: '⚙️', label: 'الإعدادات',  href: 'settings.html', id: 'settings'  },
  { icon: '🚪', label: 'تسجيل خروج', href: '#',             id: 'logout', onClick: 'doLogout' },
];

function buildHTML(activeId) {
  const navHTML = navItems.map(item => {
    if (item.section) {
      return `<div class="sb-section">${item.section}</div>`;
    }
    const isActive = item.id === activeId ? 'active' : '';
    const badge = item.badge ? `<span class="sb-badge">${item.badge}</span>` : '';
    const clickAttr = item.onClick ? `onclick="event.preventDefault();window.${item.onClick}();"` : '';
    return `
      <a class="sb-item ${isActive}" href="${item.href}" ${clickAttr}>
        <span class="sb-icon">${item.icon}</span>
        ${item.label}
        ${badge}
      </a>`;
  }).join('');

  return `
    <div class="sb-overlay" id="sbOverlay"></div>
    <aside class="sb-sidebar" id="sbSidebar">
      <a href="index.html" class="sb-logo">
        <div class="sb-logo-icon">🦷</div>
        <div>
          <div class="sb-logo-name">SyDent</div>
          <div class="sb-logo-sub">نظام إدارة العيادة</div>
        </div>
      </a>
      <nav class="sb-nav">${navHTML}</nav>
      <div class="sb-footer" id="sbDoctorFooter">جارٍ التحميل…</div>
    </aside>`;
}

// تحديث اسم الدكتور وعدد مواعيد اليوم بشكل ديناميكي
async function refreshSidebarDynamic() {
  if (!window.sb) return;
  const { data: u } = await window.sb.auth.getUser();
  if (!u || !u.user) return;
  const uid = u.user.id;

  // اسم الدكتور
  const meta = u.user.user_metadata || {};
  const name = meta.full_name || meta.name || u.user.email || 'دكتور';
  const role = meta.role || 'طبيب أسنان';
  const footer = document.getElementById('sbDoctorFooter');
  if (footer) footer.innerHTML = name + '<br>' + role;

  // badge المواعيد = عدد مواعيد اليوم
  const today = new Date();
  const todayStr = today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
  const { data: appts } = await window.sb.from('appointments').select('id')
    .eq('doctor_id', uid).eq('date', todayStr);
  const count = (appts || []).length;
  const apptLink = document.querySelector('.sb-item[href="appointments.html"]');
  if (apptLink) {
    let badge = apptLink.querySelector('.sb-badge');
    if (count > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'sb-badge';
        apptLink.appendChild(badge);
      }
      badge.textContent = count;
    } else if (badge) {
      badge.remove();
    }
  }
}

// ─── JS ───
function initSidebar(activeId) {
  // انتظر DOM إذا لم يكن جاهزاً بعد
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      initSidebar(activeId);
    });
    return;
  }

  // 1. Inject CSS
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // 2. Inject HTML
  const wrapper = document.createElement('div');
  wrapper.innerHTML = buildHTML(activeId);
  document.body.insertBefore(wrapper, document.body.firstChild);

  // 3. Wrap main content
  const mainEl = document.getElementById('sbMainContent') ||
                 document.querySelector('.main') ||
                 document.querySelector('main');
  if (mainEl) {
    mainEl.classList.add('sb-main-content');
    document.body.classList.add('sb-ready');
  }

  // 4. Hamburger toggle
  const sidebar = document.getElementById('sbSidebar');
  const overlay = document.getElementById('sbOverlay');

  function open()  {
    sidebar.classList.add('open');
    overlay.classList.add('open');
    if (window._sbBtn) window._sbBtn.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function close() {
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
    if (window._sbBtn) window._sbBtn.classList.remove('open');
    document.body.style.overflow = '';
  }

  overlay.addEventListener('click', close);
  sidebar.querySelectorAll('.sb-item').forEach(el => {
    el.addEventListener('click', () => { if (window.innerWidth <= 820) close(); });
  });

  // Expose globally
  window.sbOpen  = open;
  window.sbClose = close;
  window.sbToggle = function() {
    sidebar.classList.contains('open') ? close() : open();
  };

  // 4.5 Dynamic refresh: doctor name + appointments badge
  setTimeout(refreshSidebarDynamic, 200);

  // 5. Pull-to-Refresh
  initPTR();
}

// ─── Pull to Refresh ───────────────────────────────
function initPTR() {
  if (!('ontouchstart' in window)) return;

  var s = document.createElement('style');
  s.textContent =
    '.ptr-bar{' +
      'width:100%;overflow:hidden;height:0;' +
      'display:flex;align-items:center;justify-content:center;gap:8px;' +
      'background:#0a1628;' +
      'font-size:13px;font-weight:700;color:#2ee89e;' +
      'font-family:"Cairo",sans-serif;' +
      'transition:height .25s ease;' +
      'border-bottom:1px solid transparent;}' +
    '.ptr-bar.show{height:38px;border-bottom-color:rgba(46,232,158,0.2);}' +
    '.ptr-ring{' +
      'width:15px;height:15px;' +
      'border:2px solid rgba(46,232,158,0.25);' +
      'border-top-color:#2ee89e;' +
      'border-radius:50%;flex-shrink:0;}' +
    '.ptr-bar.spin .ptr-ring{animation:ptrSpin .65s linear infinite;}' +
    '@keyframes ptrSpin{to{transform:rotate(360deg);}}';
  document.head.appendChild(s);

  function attachHTML() {
    if (document.getElementById('ptrBar')) return;

    var bar = document.createElement('div');
    bar.id        = 'ptrBar';
    bar.className = 'ptr-bar';
    bar.innerHTML = '<div class="ptr-ring" id="ptrRing"></div><span id="ptrLabel">↓ اسحب للتحديث</span>';

    // ضعه قبل الـ topbar مباشرة داخل .main
    var topbar = document.querySelector('.topbar');
    if (topbar && topbar.parentNode) {
      topbar.parentNode.insertBefore(bar, topbar);
    } else {
      var main = document.getElementById('sbMainContent') || document.querySelector('.main');
      if (main) main.insertBefore(bar, main.firstChild);
      else document.body.insertBefore(bar, document.body.firstChild);
    }
    startPTR();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachHTML);
  } else {
    attachHTML();
  }

  function startPTR() {
    var THRESHOLD = 65, MAX = 95;
    var sy = 0, cy = 0, active = false;

    function bar()   { return document.getElementById('ptrBar'); }
    function ring()  { return document.getElementById('ptrRing'); }
    function label() { return document.getElementById('ptrLabel'); }

    function setState(state, pull) {
      var b = bar(), r = ring(), l = label();
      if (!b) return;
      if (state === 'hide') {
        b.className = 'ptr-bar';
      } else if (state === 'pull') {
        b.className = 'ptr-bar show';
        r.style.animation = 'none';
        r.style.transform = 'rotate(' + Math.round((pull / THRESHOLD) * 270) + 'deg)';
        l.textContent = pull >= THRESHOLD ? '\u2191 أفلت للتحديث' : '\u2193 اسحب للتحديث';
      } else if (state === 'spin') {
        b.className = 'ptr-bar show spin';
        r.style.transform = '';
        r.style.animation = '';
        l.textContent = 'جارٍ التحديث\u2026';
      } else if (state === 'done') {
        b.className = 'ptr-bar show';
        r.style.animation = 'none';
        l.textContent = '\u2713 تم التحديث';
      }
    }

    document.addEventListener('touchstart', function(e) {
      if (document.querySelector('.modal-overlay.open')) return;
      if (window.scrollY > 0) return;
      sy = cy = e.touches[0].clientY;
      active = true;
    }, { passive: true });

    document.addEventListener('touchmove', function(e) {
      if (!active) return;
      if (window.scrollY > 0) { active = false; setState('hide'); return; }
      cy = e.touches[0].clientY;
      var pull = Math.min(Math.max(0, cy - sy) * 0.55, MAX);
      if (pull > 4) setState('pull', pull);
      else setState('hide');
    }, { passive: true });

    document.addEventListener('touchend', function() {
      if (!active) return;
      active = false;
      var pull = Math.min(Math.max(0, cy - sy) * 0.55, MAX);
      if (pull >= THRESHOLD) {
        setState('spin');
        setTimeout(function() {
          if (typeof window.onPTRRefresh === 'function') {
            window.onPTRRefresh();
          } else {
            window.location.reload();
          }
          setState('done');
          setTimeout(function() { setState('hide'); }, 1400);
        }, 800);
      } else {
        setState('hide');
      }
      cy = 0;
    });
  }
}

window.initSidebar = initSidebar;

})();

// زر تسجيل خروج — معرّف على window عشان يقدر sidebar الـHTML يستدعيه
window.doLogout = async function() {
  if (!confirm('هل تريد تسجيل الخروج؟')) return;
  try {
    if (window.sb && window.sb.auth) {
      await window.sb.auth.signOut({ scope: 'local' });
    }
  } catch(e) { console.error('signOut error', e); }
  // Clear all Supabase auth storage manually as backup
  try {
    Object.keys(localStorage).forEach(function(k){
      if (k.indexOf('sydent.auth') === 0 || k.indexOf('sb-') === 0 || k.indexOf('supabase') === 0) {
        localStorage.removeItem(k);
      }
    });
  } catch(e){}
  // Hard redirect (replace prevents back button)
  window.location.replace('auth.html?logged_out=1');
};
