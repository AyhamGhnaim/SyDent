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

  // أضف CSS فوراً في الـ head
  var ptrStyle = document.createElement('style');
  ptrStyle.textContent = [
    '.ptr-indicator{position:fixed;top:0;left:50%;',
    'transform:translateX(-50%) translateY(-120px);',
    'background:#132840;border:1px solid rgba(46,232,158,0.15);',
    'border-top:none;border-radius:0 0 20px 20px;',
    'padding:10px 24px;display:flex;align-items:center;gap:10px;',
    'font-size:13px;font-weight:600;color:#2ee89e;',
    'font-family:"Cairo",sans-serif;z-index:9999;',
    'transition:transform .3s cubic-bezier(.175,.885,.32,1.275);',
    'white-space:nowrap;box-shadow:0 4px 20px rgba(0,0,0,0.3);}',
    '.ptr-indicator.visible{transform:translateX(-50%) translateY(0);}',
    'body{overflow-x:hidden;}',
    '.ptr-spinner{width:18px;height:18px;',
    'border:2px solid rgba(46,232,158,0.3);border-top-color:#2ee89e;',
    'border-radius:50%;flex-shrink:0;transition:transform .3s ease;}',
    '.ptr-indicator.loading .ptr-spinner{animation:ptrSpin .7s linear infinite;}',
    '@keyframes ptrSpin{to{transform:rotate(360deg);}}'
  ].join('');
  document.head.appendChild(ptrStyle);

  // أضف HTML بعد ما DOM يكون جاهز
  function attachHTML() {
    if (document.getElementById('ptrIndicator')) return;
    // wrapper يحتوي الـ indicator ويكون fixed بعرض كامل وارتفاع صفر
    var wrap = document.createElement('div');
    wrap.className = 'ptr-wrap';
    var el = document.createElement('div');
    el.className = 'ptr-indicator';
    el.id = 'ptrIndicator';
    el.innerHTML = '<div class="ptr-spinner" id="ptrSpinner"></div><span id="ptrText">اسحب للتحديث</span>';
    wrap.appendChild(el);
    document.body.appendChild(wrap);
    startListeners();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachHTML);
  } else {
    attachHTML();
  }

  function startListeners() {
    var THRESHOLD = 72, MAX_PULL = 110;
    var startY = 0, pulling = false, currentY = 0;

    function indicator()  { return document.getElementById('ptrIndicator'); }
    function ptrText()    { return document.getElementById('ptrText'); }
    function ptrSpinner() { return document.getElementById('ptrSpinner'); }

    function show(state, progress) {
      var ind = indicator(), txt = ptrText(), sp = ptrSpinner();
      if (!ind) return;
      ind.className = 'ptr-indicator visible ' + state;
      if (state === 'pulling') {
        sp.style.animation = 'none';
        sp.style.transform = 'rotate(' + Math.round((progress/THRESHOLD)*270) + 'deg)';
        txt.textContent = progress >= THRESHOLD ? '\u2191 أفلت للتحديث' : '\u2193 اسحب للتحديث';
      } else if (state === 'loading') {
        sp.style.transform = '';
        sp.style.animation = '';
        txt.textContent = 'جارٍ التحديث\u2026';
      } else if (state === 'success') {
        sp.style.animation   = 'none';
        sp.style.borderColor = '#2ee89e';
        txt.textContent = '\u2713 تم التحديث';
      }
    }

    function hide() {
      var ind = indicator(), sp = ptrSpinner();
      if (!ind) return;
      ind.className = 'ptr-indicator';
      if (sp) { sp.style.borderColor = ''; sp.style.animation = ''; }
    }

    document.addEventListener('touchstart', function(e) {
      if (document.querySelector('.modal-overlay.open')) return;
      if (window.scrollY > 0) return;
      startY = currentY = e.touches[0].clientY;
      pulling = true;
    }, { passive: true });

    document.addEventListener('touchmove', function(e) {
      if (!pulling) return;
      if (window.scrollY > 0) { pulling = false; hide(); return; }
      currentY = e.touches[0].clientY;
      var pull = Math.min(Math.max(0, currentY - startY) * 0.55, MAX_PULL);
      if (pull > 0) show('pulling', pull);
    }, { passive: true });

    document.addEventListener('touchend', function() {
      if (!pulling) return;
      pulling = false;
      var pull = Math.min(Math.max(0, currentY - startY) * 0.55, MAX_PULL);
      if (pull >= THRESHOLD) {
        show('loading', pull);
        setTimeout(function() {
          show('success', pull);
          if (typeof window.onPTRRefresh === 'function') {
            window.onPTRRefresh();
          } else {
            window.location.reload();
          }
          setTimeout(hide, 1200);
        }, 800);
      } else {
        hide();
      }
      currentY = 0;
    });
  }
}

window.initSidebar = initSidebar;

})();
