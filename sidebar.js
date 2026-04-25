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
  { icon: '📅', label: 'المواعيد',    href: 'appointments.html', id: 'appointments', badge: '5' },
  { section: 'الإدارة' },
  { icon: '💊', label: 'قائمة العلاجات', href: '#',          id: 'treatments' },
  { icon: '💳', label: 'المدفوعات',   href: '#',             id: 'payments'  },
  { icon: '🧪', label: 'المخابر',     href: '#',             id: 'labs'      },
  { section: 'تحليل' },
  { icon: '📈', label: 'التقارير',    href: '#',             id: 'reports'   },
  { icon: '📋', label: 'السجلات',     href: '#',             id: 'logs'      },
  { section: 'النظام' },
  { icon: '⚙️', label: 'الإعدادات',  href: '#',             id: 'settings'  },
];

function buildHTML(activeId) {
  const navHTML = navItems.map(item => {
    if (item.section) {
      return `<div class="sb-section">${item.section}</div>`;
    }
    const isActive = item.id === activeId ? 'active' : '';
    const badge = item.badge ? `<span class="sb-badge">${item.badge}</span>` : '';
    return `
      <a class="sb-item ${isActive}" href="${item.href}">
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
      <div class="sb-footer">د. أيهم غنيم<br>طبيب أسنان</div>
    </aside>`;
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

  // 5. Pull-to-Refresh
  initPTR();
}

// ─── Pull to Refresh ───────────────────────────────
function initPTR() {
  if (!('ontouchstart' in window)) return;

  // CSS - indicator من الأسفل كـ toast بعيداً عن الـ topbar
  var s = document.createElement('style');
  s.textContent =
    '.ptr-box{' +
      'position:fixed;' +
      'bottom:32px;' +
      'left:50%;' +
      'transform:translateX(-50%) translateY(120px);' +
      'background:#0f2038;' +
      'border:1px solid rgba(46,232,158,0.35);' +
      'border-radius:30px;' +
      'padding:10px 20px;' +
      'display:flex;align-items:center;gap:10px;' +
      'font-size:13px;font-weight:700;color:#2ee89e;' +
      'font-family:"Cairo",sans-serif;' +
      'z-index:99999;' +
      'opacity:0;' +
      'transition:transform .35s cubic-bezier(.175,.885,.32,1.275),opacity .25s ease;' +
      'white-space:nowrap;' +
      'box-shadow:0 4px 24px rgba(0,0,0,0.5);' +
      'pointer-events:none;}' +
    '.ptr-box.show{' +
      'transform:translateX(-50%) translateY(0);' +
      'opacity:1;}' +
    '.ptr-ring{' +
      'width:18px;height:18px;' +
      'border:2.5px solid rgba(46,232,158,0.25);' +
      'border-top-color:#2ee89e;' +
      'border-radius:50%;' +
      'flex-shrink:0;}' +
    '.ptr-box.spinning .ptr-ring{animation:ptrSpin .65s linear infinite;}' +
    '@keyframes ptrSpin{to{transform:rotate(360deg);}}';
  document.head.appendChild(s);

  function attachHTML() {
    if (document.getElementById('ptrBox')) return;
    var box = document.createElement('div');
    box.id = 'ptrBox';
    box.className = 'ptr-box';
    box.innerHTML = '<div class="ptr-ring" id="ptrRing"></div><span id="ptrLabel">↓ اسحب للتحديث</span>';
    document.body.appendChild(box);
    startPTR();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachHTML);
  } else {
    attachHTML();
  }

  function startPTR() {
    var THRESHOLD = 70, MAX = 100;
    var sy = 0, cy = 0, active = false;

    function box()   { return document.getElementById('ptrBox'); }
    function ring()  { return document.getElementById('ptrRing'); }
    function label() { return document.getElementById('ptrLabel'); }

    function setBox(state, pull) {
      var b = box(), r = ring(), l = label();
      if (!b) return;
      if (state === 'hide') {
        b.className = 'ptr-box';
        return;
      }
      b.className = 'ptr-box show' + (state === 'spin' ? ' spinning' : '');
      if (state === 'pull') {
        r.style.animation = 'none';
        r.style.transform = 'rotate(' + Math.round((pull/THRESHOLD)*270) + 'deg)';
        l.textContent = pull >= THRESHOLD ? '↑ أفلت للتحديث' : '↓ اسحب للتحديث';
      } else if (state === 'spin') {
        r.style.transform = '';
        r.style.animation = '';
        l.textContent = 'جارٍ التحديث…';
      } else if (state === 'done') {
        r.style.animation = 'none';
        l.textContent = '✓ تم التحديث';
      }
    }

    document.addEventListener('touchstart', function(e) {
      if (document.querySelector('.modal-overlay.open')) return;
      if (window.scrollY > 0) return;
      sy = cy = e.touches[0].clientY;
      active = true;
    }, {passive: true});

    document.addEventListener('touchmove', function(e) {
      if (!active) return;
      if (window.scrollY > 0) { active = false; setBox('hide'); return; }
      cy = e.touches[0].clientY;
      var pull = Math.min(Math.max(0, cy - sy) * 0.55, MAX);
      if (pull > 4) setBox('pull', pull);
    }, {passive: true});

    document.addEventListener('touchend', function() {
      if (!active) return;
      active = false;
      var pull = Math.min(Math.max(0, cy - sy) * 0.55, MAX);
      if (pull >= THRESHOLD) {
        setBox('spin');
        setTimeout(function() {
          if (typeof window.onPTRRefresh === 'function') {
            window.onPTRRefresh();
          } else {
            window.location.reload();
          }
          setBox('done');
          setTimeout(function() { setBox('hide'); }, 1400);
        }, 800);
      } else {
        setBox('hide');
      }
      cy = 0;
    });
  }
}

window.initSidebar = initSidebar;

})();
