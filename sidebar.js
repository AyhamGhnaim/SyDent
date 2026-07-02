(function() {

// ─── CSS ───
// Theme variables (--bg, --bg2, --bg3, --green, --text, --text2, --border)
// are owned by theme.css. We only define --sb-width here (sidebar-local) and
// fallback values via var(...,fallback) for any rare case where theme.css
// hasn't loaded yet (e.g. file:// preview). Removing the duplicate :root
// block here lets the light/dark theme cascade work for the sidebar.
const css = `
  :root {
    --sb-width: 240px;
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
    width: 46px; height: 46px;
    color: var(--green);
    border: 1.5px solid rgba(var(--green-rgb),0.28);
    border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .sb-logo-name { font-size: 18px; font-weight: 900; color: var(--text); font-family: 'Cairo', sans-serif; }
  .sb-logo-sub  { font-size: 10px; color: var(--text2); font-family: 'Cairo', sans-serif; }
  :root[data-theme="light"] .sd-sy{background:linear-gradient(135deg,#3d8577 0%,#2f7d52 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:#368a64;}
  :root[data-theme="light"] .sd-dent{color:#16362c;}
  :root[data-theme="dark"] .sd-sy{background:linear-gradient(135deg,#4fb89f 0%,#3ec77a 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:#46b88c;}
  :root[data-theme="dark"] .sd-dent{color:#e8f6f0;}

  .sb-nav { flex: 1; padding: 12px 0; overflow-y: auto; scrollbar-width: none; -ms-overflow-style: none; }
  .sb-nav::-webkit-scrollbar { display: none; width: 0; height: 0; }
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
  .sb-item:hover { color: var(--text); background: var(--green-dim, rgba(var(--green-rgb),0.12)); }
  .sb-item.active {
    color: var(--green);
    background: var(--green-dim, rgba(var(--green-rgb),0.12));
    border-right-color: var(--green);
  }
  .sb-icon { width: 20px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .sb-icon svg { width: 17px; height: 17px; }
  .sb-badge {
    margin-right: auto;
    background: var(--green);
    color: #ffffff;
    font-size: 10px; font-weight: 800;
    min-width: 18px; height: 18px;
    border-radius: 9px;
    display: flex; align-items: center; justify-content: center;
    padding: 0 5px;
  }

  /* ─── Footer: doctor identity + theme toggle on one row ─── */
  .sb-footer {
    padding: 12px 20px;
    border-top: 1px solid var(--border);
    font-family: 'Cairo', sans-serif;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .sb-footer-name {
    font-size: 12px;
    color: var(--text2);
    line-height: 1.55;
    flex: 1;
    min-width: 0;
  }

  /* ─── Theme toggle (pill style — matches auth/login page) ─── */
  .sb-theme-switch {
    position: relative;
    display: inline-flex;
    align-items: center;
    width: 56px;
    height: 30px;
    border-radius: 999px;
    background: var(--bg3);
    border: 1px solid var(--border);
    cursor: pointer;
    padding: 0;
    flex-shrink: 0;
    vertical-align: middle;
    transition: background .2s ease, border-color .2s ease;
    -webkit-tap-highlight-color: transparent;
  }
  .sb-theme-switch:focus-visible {
    outline: 2px solid var(--green);
    outline-offset: 2px;
  }
  .sb-theme-switch-knob {
    position: absolute;
    top: 50%;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #ffffff;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    transform: translateY(-50%);
    transition: right .22s cubic-bezier(0.4,0,0.2,1), background .22s ease;
  }
  /* RTL: in light mode knob sits on the right (sun side); in dark on the left (moon side) */
  :root[data-theme="light"] .sb-theme-switch-knob { right: 2px; }
  :root[data-theme="dark"]  .sb-theme-switch-knob { right: calc(100% - 26px); }
  :root[data-theme="dark"]  .sb-theme-switch       { background: #1e3556; }
  .sb-theme-icon-sun,
  .sb-theme-icon-moon {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 14px;
    height: 14px;
    pointer-events: none;
    opacity: 0.55;
    transition: opacity .2s ease;
  }
  .sb-theme-icon-sun  { right: 7px; color: #f59e0b; }
  .sb-theme-icon-moon { left:  7px; color: #818cf8; }
  :root[data-theme="light"] .sb-theme-icon-sun  { opacity: 1; }
  :root[data-theme="dark"]  .sb-theme-icon-moon { opacity: 1; }

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
  { icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></svg>', label: 'لوحة التحكم', href: 'index.html',    id: 'dashboard' },
  { icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><path d="M16 3.128a4 4 0 0 1 0 7.744" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><circle cx="9" cy="7" r="4" /></svg>', label: 'المرضى',      href: 'patients.html', id: 'patients'  },
  { icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /><path d="M8 14h.01" /><path d="M12 14h.01" /><path d="M16 14h.01" /><path d="M8 18h.01" /><path d="M12 18h.01" /><path d="M16 18h.01" /></svg>', label: 'المواعيد',    href: 'appointments.html', id: 'appointments' },
  { section: 'الإدارة' },
  { icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="m18 2 4 4" /><path d="m17 7 3-3" /><path d="M19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5" /><path d="m9 11 4 4" /><path d="m5 19-3 3" /><path d="m14 4 6 6" /></svg>', label: 'قائمة العلاجات', href: 'treatments.html', id: 'treatments' },
  { icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M11 2v2" /><path d="M5 2v2" /><path d="M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1" /><path d="M8 15a6 6 0 0 0 12 0v-3" /><circle cx="20" cy="10" r="2" /></svg>', label: 'أطباء العيادة', href: 'doctors.html', id: 'doctors' },
  { icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M16 10h2" /><path d="M16 14h2" /><path d="M6.17 15a3 3 0 0 1 5.66 0" /><circle cx="9" cy="11" r="2" /><rect x="2" y="5" width="20" height="14" rx="2" /></svg>', label: 'الموظفون',     href: 'employees.html', id: 'employees' },
  { icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" /><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" /></svg>', label: 'الرواتب والدفعات', href: 'payouts.html',  id: 'payouts'   },
  { icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M12 17V7" /><path d="M16 8h-6a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H8" /><path d="M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z" /></svg>', label: 'المصاريف',    href: 'expenses.html', id: 'expenses'  },
  { icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z" /><path d="M12 22V12" /><polyline points="3.29 7 12 12 20.71 7" /><path d="m7.5 4.27 9 5.15" /></svg>', label: 'المخزون',     href: 'inventory.html', id: 'inventory' },
  { icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2" /><path d="M6.453 15h11.094" /><path d="M8.5 2h7" /></svg>', label: 'المخابر',     href: 'labs.html',     id: 'labs'      },
  { section: 'تحليل' },
  { icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><rect width="16" height="20" x="4" y="2" rx="2" /><line x1="8" x2="16" y1="6" y2="6" /><line x1="16" x2="16" y1="14" y2="18" /><path d="M16 10h.01" /><path d="M12 10h.01" /><path d="M8 10h.01" /><path d="M12 14h.01" /><path d="M8 14h.01" /><path d="M12 18h.01" /><path d="M8 18h.01" /></svg>', label: 'المحاسبة',       href: 'accounting.html', id: 'accounting' },
  { icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M3 3v16a2 2 0 0 0 2 2h16" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></svg>', label: 'تقارير الأطباء', href: 'provider-reports.html', id: 'provider-reports' },
  { icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l4 2" /></svg>', label: 'سجل النشاطات', href: 'audit-log.html', id: 'audit-log' },
  { section: 'النظام' },
  { icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M10.5 3 8 9l4 13 4-13-2.5-6" /><path d="M17 3a2 2 0 0 1 1.6.8l3 4a2 2 0 0 1 .013 2.382l-7.99 10.986a2 2 0 0 1-3.247 0l-7.99-10.986A2 2 0 0 1 2.4 7.8l2.998-3.997A2 2 0 0 1 7 3z" /><path d="M2 9h20" /></svg>', label: 'الاشتراك',   href: 'subscription.html', id: 'subscription' },
  { icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" /><circle cx="12" cy="12" r="3" /></svg>', label: 'الإعدادات',  href: 'settings.html', id: 'settings'  },
  { icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /></svg>', label: 'تسجيل خروج', href: '#',             id: 'logout', onClick: 'doLogout' },
];

function buildHTML(activeId) {
  // Phase 4: filter nav items by current device role.
  // Owner sees everything; Doctor hides Owner-only pages; Secretary hides
  // both Owner-only pages and provider-reports. We compute this at render
  // time so SyDentLock (attached synchronously by supabase-init.js) is ready.
  var role = (window.SyDentLock && window.SyDentLock.getRole) ? window.SyDentLock.getRole() : 'owner';
  var BLOCKED = {
    owner:     [],
    doctor:    ['treatments', 'doctors', 'employees', 'settings', 'subscription', 'audit-log', 'expenses', 'inventory', 'payouts', 'accounting'],
    secretary: ['treatments', 'doctors', 'employees', 'settings', 'subscription', 'provider-reports', 'audit-log', 'expenses', 'inventory', 'payouts', 'accounting']
  };
  var blocked = BLOCKED[role] || [];

  // Drop blocked items + drop adjacent section headers that would become orphans.
  var filtered = navItems.filter(function(item){
    if (item.section) return true; // keep sections for now, prune below
    return blocked.indexOf(item.id) < 0;
  });
  // Prune sections that have no items following them before the next section
  var pruned = [];
  for (var i = 0; i < filtered.length; i++) {
    var it = filtered[i];
    if (it.section) {
      // Look ahead — is there at least one non-section item before the next section/end?
      var hasItems = false;
      for (var j = i + 1; j < filtered.length; j++) {
        if (filtered[j].section) break;
        hasItems = true;
        break;
      }
      if (hasItems) pruned.push(it);
    } else {
      pruned.push(it);
    }
  }

  const navHTML = pruned.map(item => {
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
        <div class="sb-logo-icon"><svg viewBox="0 0 1279 1400" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="width:34px;height:34px"><g transform="translate(0.000000,1400.000000) scale(0.100000,-0.100000)"
fill="#1ed99a" stroke="none">
<path d="M8460 13985 c-102 -19 -306 -72 -389 -101 -91 -32 -282 -119 -368
-167 -34 -20 -72 -39 -85 -43 -12 -4 -34 -15 -48 -24 -41 -29 -104 -32 -153
-6 -23 12 -78 32 -122 45 -44 13 -100 30 -125 38 -106 34 -186 44 -395 45
-177 1 -228 -2 -328 -21 -199 -36 -368 -91 -427 -136 -8 -6 -31 -18 -50 -25
-19 -7 -51 -25 -70 -40 -20 -15 -59 -39 -88 -54 -29 -14 -52 -30 -52 -35 0 -4
-26 -24 -57 -44 -55 -33 -190 -159 -241 -223 -144 -181 -200 -285 -251 -461
-47 -163 -67 -272 -76 -402 -8 -119 -19 -141 -136 -261 -51 -52 -113 -122
-139 -155 -45 -58 -120 -171 -120 -180 0 -3 -13 -26 -29 -52 -59 -98 -109
-234 -125 -343 -41 -277 -42 -373 -6 -670 15 -131 94 -365 151 -450 9 -14 43
-68 75 -120 32 -52 63 -100 69 -106 5 -7 33 -38 60 -69 28 -32 57 -63 65 -70
8 -8 67 -62 130 -122 227 -215 471 -365 655 -404 22 -4 72 -16 110 -25 57 -13
152 -18 510 -24 466 -7 493 -10 538 -56 12 -13 32 -33 45 -46 12 -13 22 -29
22 -36 0 -7 9 -33 20 -58 20 -43 21 -65 23 -797 2 -845 7 -793 -73 -869 -21
-21 -42 -43 -47 -50 -4 -8 -41 -43 -82 -78 -40 -36 -169 -159 -286 -275 -117
-115 -241 -238 -276 -271 -35 -34 -89 -88 -120 -120 -31 -33 -117 -118 -192
-190 -74 -73 -144 -147 -154 -165 -17 -32 -18 -81 -21 -889 -1 -545 -6 -874
-13 -907 -8 -41 -19 -59 -50 -87 -21 -20 -40 -37 -42 -37 -1 -1 -66 -4 -143
-8 -79 -4 -148 -12 -155 -18 -8 -6 -42 -23 -76 -37 -45 -19 -77 -41 -110 -78
-27 -29 -62 -66 -78 -83 -77 -76 -145 -166 -201 -266 -6 -10 -18 -27 -26 -36
-8 -10 -27 -43 -41 -73 -14 -30 -38 -75 -53 -100 -43 -73 -94 -176 -94 -191 0
-8 -12 -34 -26 -59 -15 -25 -48 -110 -74 -190 -64 -193 -98 -290 -114 -320 -8
-14 -19 -43 -26 -65 -7 -22 -23 -63 -36 -91 -12 -29 -26 -69 -30 -90 -7 -38
-111 -321 -133 -362 -5 -10 -19 -48 -30 -83 -77 -247 -91 -296 -91 -317 0 -14
-14 -77 -31 -141 -16 -64 -35 -134 -40 -156 -18 -70 -79 -223 -95 -236 -29
-24 -50 22 -58 124 -3 50 -6 1065 -6 2256 0 1191 -4 2183 -9 2203 -5 20 -19
51 -32 68 -33 43 -188 205 -343 358 -294 290 -360 358 -371 387 -7 17 -10 48
-7 70 12 82 4 289 -13 353 -39 150 -132 288 -250 368 -40 27 -54 32 -160 59
-108 28 -191 27 -321 -3 -73 -16 -104 -30 -155 -65 -57 -40 -159 -136 -159
-150 0 -3 -18 -35 -40 -71 -57 -94 -73 -171 -67 -330 l5 -130 53 -105 c42 -83
66 -118 113 -161 63 -59 141 -114 178 -126 121 -39 302 -54 371 -30 62 21 145
23 182 4 52 -27 250 -219 483 -468 62 -65 143 -177 153 -211 13 -41 20 -2938
10 -4064 -6 -686 -7 -743 -24 -768 -9 -15 -24 -27 -33 -27 -48 0 -173 148
-246 293 -17 34 -38 73 -47 87 -10 14 -30 59 -46 100 -16 41 -35 84 -41 95
-42 68 -198 523 -260 755 -8 30 -32 120 -54 200 -22 80 -42 163 -46 185 -3 22
-14 74 -25 115 -19 77 -46 231 -75 425 -9 61 -22 146 -30 190 -7 44 -20 166
-28 270 -9 105 -24 236 -35 292 -22 115 -21 108 -55 365 -14 103 -30 196 -35
206 -6 10 -15 68 -21 127 -6 60 -13 112 -16 116 -5 8 -27 112 -49 234 -54 290
-179 737 -250 891 -13 28 -29 71 -35 95 -6 24 -22 60 -34 79 -26 41 -41 73
-91 195 -20 50 -49 115 -65 145 -15 30 -40 82 -55 115 -15 33 -34 74 -42 90
-9 17 -47 90 -84 164 -38 73 -73 139 -78 145 -5 6 -13 25 -16 41 -4 17 -16 44
-25 60 -35 59 -64 111 -77 140 -14 29 -22 45 -43 83 -8 15 -36 74 -122 262
-16 36 -33 72 -38 80 -32 55 -100 200 -106 225 -4 17 -12 37 -18 45 -18 22
-33 57 -61 139 -13 40 -29 79 -34 85 -6 6 -22 45 -37 86 -14 41 -34 89 -44
105 -24 40 -50 134 -50 179 0 28 6 39 27 53 25 17 85 18 993 18 839 0 968 -2
991 -15 27 -15 295 -264 333 -310 12 -13 93 -95 181 -181 88 -87 165 -162 170
-168 6 -7 102 -105 215 -219 114 -114 224 -229 245 -256 38 -47 40 -52 39
-120 0 -39 -8 -95 -17 -125 -21 -66 -22 -143 -3 -202 7 -24 22 -71 32 -104 28
-94 116 -210 205 -274 30 -21 87 -53 128 -71 64 -28 88 -32 186 -37 133 -7
206 8 325 68 118 58 185 127 250 253 l54 106 0 152 c0 134 -3 161 -23 216 -54
149 -140 245 -320 357 -69 43 -120 50 -340 42 -120 -5 -187 -3 -213 5 -31 9
-96 69 -321 296 -155 157 -304 309 -332 339 -27 30 -115 119 -195 198 -80 79
-174 179 -209 222 -61 74 -146 147 -215 185 -29 16 -116 17 -1146 18 -1056 0
-1117 1 -1155 19 -22 10 -45 24 -51 32 -26 32 -63 203 -84 389 -6 52 -18 138
-28 190 -24 136 -25 629 0 710 9 30 21 96 28 145 17 132 25 162 86 355 56 177
105 288 190 435 26 44 56 98 67 120 11 22 56 85 100 140 92 114 96 118 118
131 9 5 34 29 54 54 52 63 160 155 225 192 30 18 69 41 86 53 16 11 75 42 130
69 54 27 106 53 114 57 45 25 102 48 131 54 19 4 54 16 79 28 25 11 90 28 145
38 55 11 118 24 140 30 22 6 146 13 275 16 187 4 257 1 345 -12 61 -9 135 -20
165 -25 30 -4 68 -13 83 -19 16 -6 41 -11 56 -11 16 0 44 -7 64 -15 19 -8 77
-24 127 -35 50 -11 108 -27 128 -36 20 -9 62 -22 92 -30 30 -8 83 -26 118 -39
34 -14 69 -25 78 -25 9 0 52 -16 95 -35 118 -52 129 -49 178 45 13 25 30 52
37 61 8 8 14 18 14 21 0 8 67 118 83 137 8 9 22 30 30 47 9 17 32 50 51 73 20
24 36 51 36 62 0 22 -56 89 -75 89 -7 0 -30 12 -51 26 -21 15 -82 45 -134 66
-52 22 -122 51 -155 65 -95 40 -125 50 -210 69 -44 9 -92 23 -106 30 -31 16
-202 54 -239 54 -14 0 -36 6 -50 13 -88 46 -290 62 -760 61 -312 0 -401 -4
-470 -17 -47 -9 -101 -19 -120 -23 -19 -3 -57 -14 -85 -24 -27 -9 -84 -25
-125 -35 -41 -10 -82 -23 -90 -30 -8 -7 -46 -22 -85 -35 -38 -12 -84 -30 -101
-41 -17 -10 -38 -19 -46 -19 -9 0 -21 -7 -28 -15 -7 -8 -19 -15 -26 -15 -7 0
-47 -21 -89 -47 -41 -27 -83 -52 -93 -58 -61 -35 -102 -63 -133 -91 -20 -18
-61 -47 -91 -66 -29 -19 -122 -104 -205 -189 -200 -202 -195 -197 -234 -252
-19 -27 -46 -65 -62 -85 -54 -72 -96 -138 -114 -177 -10 -22 -42 -79 -71 -126
-28 -48 -52 -90 -52 -93 0 -4 -14 -35 -31 -69 -47 -94 -107 -258 -144 -392
-18 -66 -42 -154 -53 -195 -12 -41 -28 -118 -36 -170 -8 -52 -24 -147 -35
-210 -26 -152 -36 -478 -22 -715 14 -223 88 -664 139 -825 12 -36 26 -90 32
-120 7 -30 20 -80 30 -110 34 -106 40 -127 40 -140 0 -8 15 -53 34 -100 18
-47 43 -112 56 -145 26 -71 84 -213 110 -270 39 -85 59 -133 90 -209 17 -44
45 -107 62 -140 16 -34 39 -86 50 -116 12 -30 32 -71 45 -90 12 -19 23 -40 23
-48 0 -7 11 -29 24 -50 23 -37 96 -187 96 -198 0 -3 38 -83 84 -177 46 -95 87
-183 91 -197 12 -43 144 -306 160 -320 8 -7 15 -19 15 -26 0 -13 100 -231 121
-264 5 -8 12 -22 16 -30 3 -8 14 -33 23 -55 10 -22 21 -51 25 -65 4 -14 17
-43 30 -65 13 -22 29 -60 36 -85 7 -25 22 -61 34 -80 12 -19 29 -60 39 -90 10
-30 28 -75 41 -100 12 -25 26 -61 30 -80 3 -19 22 -81 41 -138 19 -56 34 -110
34 -120 0 -10 13 -61 30 -113 34 -110 65 -261 85 -421 26 -208 36 -271 45
-289 6 -9 17 -86 25 -171 9 -84 22 -187 31 -228 8 -41 21 -136 29 -210 8 -74
22 -168 30 -209 8 -40 15 -86 15 -103 0 -16 4 -38 10 -48 5 -10 14 -71 20
-136 6 -66 15 -141 21 -169 6 -27 14 -72 19 -100 4 -27 20 -108 34 -179 15
-71 29 -156 33 -190 3 -33 14 -78 25 -99 10 -21 28 -84 39 -140 11 -56 33
-138 49 -182 15 -44 35 -114 45 -155 9 -41 26 -95 37 -120 11 -25 31 -83 44
-130 13 -47 32 -105 41 -130 27 -78 84 -224 99 -257 8 -17 14 -35 14 -40 0 -4
12 -30 25 -58 14 -27 25 -56 25 -63 0 -12 26 -64 89 -178 16 -29 47 -76 69
-105 22 -30 48 -70 57 -89 10 -19 33 -56 51 -81 19 -26 34 -50 34 -54 0 -4 11
-20 25 -37 14 -16 25 -36 25 -43 0 -8 9 -19 21 -25 11 -6 28 -24 37 -39 48
-78 305 -321 339 -321 6 0 16 -7 23 -15 14 -17 139 -77 224 -108 51 -19 82
-22 196 -22 l135 0 79 38 c43 20 83 37 88 37 19 0 132 87 196 150 134 133 284
447 373 780 11 41 24 79 30 84 5 6 9 18 9 28 0 10 9 46 19 80 11 35 29 115 40
178 12 63 26 135 32 160 6 25 14 63 20 85 17 73 87 297 184 585 53 156 105
318 116 360 11 41 24 84 29 95 6 11 21 56 34 100 13 44 40 121 59 170 19 50
50 131 69 180 29 81 75 175 179 374 40 75 111 157 177 203 l47 33 200 -3 c250
-4 304 -16 410 -93 46 -33 171 -162 221 -227 53 -69 180 -263 211 -322 18 -36
37 -72 42 -80 5 -8 19 -35 31 -60 12 -25 40 -81 62 -125 46 -90 105 -235 150
-370 17 -49 36 -106 43 -125 14 -39 76 -237 99 -315 8 -27 18 -72 22 -100 3
-27 19 -81 34 -120 31 -79 55 -160 65 -220 4 -22 13 -54 21 -71 14 -28 61
-193 99 -344 8 -30 23 -86 34 -125 11 -38 34 -118 50 -176 17 -59 37 -122 45
-140 8 -19 26 -65 41 -104 102 -266 290 -463 528 -552 157 -59 308 -62 430 -9
32 14 63 26 70 26 40 0 195 93 287 171 86 74 96 84 159 159 34 41 72 86 84
100 12 14 26 32 32 41 5 9 27 41 48 72 20 31 37 60 37 65 0 5 9 20 19 34 38
47 206 376 237 463 9 28 20 55 24 60 3 6 19 42 34 80 15 39 38 95 51 125 13
30 28 75 35 100 11 44 35 124 85 288 14 46 25 92 25 102 0 18 35 145 59 215 6
17 18 70 26 118 9 49 23 108 32 130 8 23 24 94 34 157 11 63 26 149 33 190 19
102 57 341 66 415 14 103 29 197 45 275 9 41 24 131 35 200 10 69 24 148 30
175 6 28 18 91 27 140 9 50 29 137 45 195 17 58 36 139 44 180 7 41 25 102 38
135 14 33 35 103 46 155 30 138 153 496 217 630 31 63 68 144 83 180 40 95
114 241 175 350 41 73 54 105 54 138 1 30 -4 44 -15 49 -14 5 -436 -22 -510
-33 -17 -2 -38 -12 -46 -22 -18 -20 -101 -160 -153 -257 -21 -38 -41 -74 -45
-80 -25 -32 -226 -450 -236 -491 -4 -16 -20 -54 -35 -84 -15 -30 -33 -75 -40
-100 -7 -25 -17 -51 -22 -58 -14 -18 -55 -135 -77 -219 -10 -39 -30 -95 -44
-123 -14 -28 -26 -62 -26 -75 0 -24 -34 -145 -50 -180 -5 -11 -17 -67 -25
-125 -19 -132 -40 -247 -59 -330 -9 -36 -16 -85 -16 -110 0 -25 -6 -81 -14
-125 -8 -44 -22 -127 -32 -185 -9 -58 -25 -149 -35 -204 -11 -54 -19 -115 -19
-135 0 -32 -6 -68 -39 -264 -6 -32 -15 -73 -20 -90 -6 -18 -20 -90 -31 -160
-11 -71 -27 -138 -35 -150 -7 -12 -16 -40 -20 -62 -10 -64 -35 -165 -56 -225
-10 -30 -30 -95 -43 -145 -28 -102 -80 -255 -100 -300 -32 -67 -56 -128 -56
-142 0 -8 -32 -78 -72 -156 -39 -78 -85 -168 -100 -200 -16 -31 -33 -57 -38
-57 -5 0 -17 -15 -26 -33 -9 -17 -39 -62 -67 -98 -82 -111 -140 -125 -165 -41
-9 30 -12 481 -12 1826 l0 1787 26 52 c23 47 125 156 179 193 26 17 59 18 246
9 146 -7 160 -6 220 14 35 12 83 32 105 44 23 12 58 30 77 40 30 16 104 88
156 152 18 23 49 104 72 192 15 56 18 92 14 165 -13 205 -45 286 -158 398
-104 104 -212 160 -329 170 -99 9 -245 -4 -291 -25 -178 -86 -274 -175 -338
-315 -32 -72 -37 -93 -43 -196 -4 -73 -2 -151 5 -213 18 -142 8 -165 -136
-306 -90 -88 -119 -124 -146 -180 l-34 -70 -6 -1555 c-7 -1616 -10 -1720 -49
-1720 -7 0 -20 34 -79 208 -6 17 -16 47 -22 65 -6 17 -14 50 -19 72 -4 22 -19
69 -35 105 -15 36 -31 81 -35 100 -5 19 -17 64 -28 100 -11 36 -32 106 -47
155 -15 50 -56 178 -92 285 -35 107 -70 220 -78 250 -8 30 -28 84 -46 120 -17
36 -37 79 -44 95 -7 17 -26 59 -43 95 -75 160 -92 205 -102 278 -9 57 -11 365
-8 1108 4 919 7 1034 21 1079 18 56 55 102 105 131 17 10 32 21 32 25 0 9 113
131 305 329 94 96 198 204 230 240 33 36 126 129 207 208 175 170 240 254 259
332 9 41 13 203 14 656 l2 602 25 43 c23 43 25 44 73 43 51 0 101 -20 185 -72
37 -23 53 -43 85 -108 36 -72 52 -121 102 -309 34 -128 101 -297 152 -383 17
-29 31 -55 31 -59 0 -3 12 -20 28 -38 15 -17 56 -70 92 -115 94 -121 225 -247
290 -280 30 -15 91 -47 136 -72 73 -40 122 -61 224 -97 208 -73 553 -111 745
-82 150 23 376 84 475 129 196 87 257 129 400 272 105 106 128 137 166 219 8
18 34 63 56 98 22 35 45 83 50 105 5 23 15 56 22 73 7 16 24 68 36 115 13 47
33 101 45 120 24 38 99 110 115 110 5 0 27 15 47 34 21 18 46 35 55 37 21 5
182 150 226 204 18 22 53 65 78 95 38 46 154 239 154 255 0 3 18 44 41 91 22
48 49 123 60 167 11 45 25 89 30 100 34 62 58 548 37 723 -7 65 -13 90 -58
244 -10 36 -25 91 -34 123 -9 32 -28 79 -42 105 -15 26 -30 59 -34 73 -4 14
-34 65 -66 113 -33 49 -64 98 -71 109 -7 12 -23 35 -37 52 -14 16 -51 61 -82
99 -40 48 -62 84 -71 119 -7 27 -11 53 -8 56 6 11 35 226 45 336 10 112 0 302
-24 462 -18 116 -70 281 -126 392 -21 42 -41 86 -45 98 -3 13 -24 49 -46 80
-22 32 -55 81 -73 109 -58 87 -218 262 -319 346 -40 35 -166 128 -172 128 -2
0 -32 18 -66 40 -34 22 -68 40 -75 40 -7 0 -21 8 -31 19 -10 10 -34 22 -53 26
-33 7 -93 31 -150 61 -35 17 -214 60 -335 78 -286 45 -297 48 -336 83 -24 22
-62 83 -113 185 -43 84 -96 180 -119 213 -76 111 -397 410 -493 458 -18 9 -46
29 -64 43 -28 24 -114 64 -230 108 -19 7 -60 25 -90 40 -30 15 -82 33 -115 41
-33 7 -88 20 -121 29 -179 45 -494 60 -644 31z m531 -440 c164 -28 242 -49
280 -76 15 -10 48 -28 74 -39 76 -32 299 -186 345 -238 23 -26 59 -65 79 -87
77 -84 146 -182 194 -275 24 -47 26 -58 16 -83 -17 -40 -92 -94 -157 -113 -30
-9 -70 -27 -89 -39 -18 -13 -51 -29 -71 -36 -51 -16 -189 -95 -234 -133 -20
-17 -58 -47 -85 -66 -26 -19 -57 -43 -68 -54 -11 -10 -36 -30 -55 -45 -171
-129 -194 -244 -74 -368 40 -41 45 -43 99 -43 68 0 106 19 195 100 10 8 26 22
37 31 12 10 25 23 29 31 40 64 453 278 594 308 25 5 70 16 100 24 130 35 467
39 551 7 14 -5 63 -16 109 -26 47 -9 121 -33 165 -52 154 -70 280 -135 294
-154 7 -10 19 -19 25 -19 42 0 296 -288 357 -405 20 -38 46 -88 58 -110 39
-75 93 -228 113 -319 17 -79 19 -118 15 -296 -4 -136 -10 -225 -20 -265 -17
-66 -108 -278 -131 -304 -7 -9 -17 -30 -21 -48 -3 -17 -13 -37 -21 -44 -8 -6
-14 -17 -14 -24 0 -8 -12 -23 -26 -34 -14 -11 -38 -37 -53 -58 -60 -83 -243
-247 -296 -266 -37 -14 -165 -44 -280 -67 -138 -27 -168 -65 -161 -199 5 -101
18 -123 99 -164 l57 -29 93 12 c209 27 192 23 332 91 147 71 225 130 378 283
l145 146 48 0 c44 0 51 -4 94 -48 80 -83 153 -208 181 -311 10 -36 28 -97 41
-136 19 -63 22 -93 22 -290 1 -174 -3 -241 -18 -320 -10 -55 -22 -105 -26
-110 -5 -6 -20 -49 -33 -96 -21 -70 -55 -143 -105 -225 -41 -68 -98 -137 -184
-225 -89 -91 -115 -111 -189 -147 -95 -46 -160 -62 -254 -62 -105 0 -143 20
-259 134 -57 55 -119 126 -138 156 -19 30 -54 74 -76 96 -23 23 -42 47 -42 52
0 6 -17 29 -37 50 -21 21 -46 50 -56 64 -10 14 -48 41 -84 59 -65 33 -68 34
-252 42 -102 4 -203 12 -223 18 -75 20 -72 -1 -78 589 -5 547 -7 569 -48 585
-9 3 -216 5 -462 5 -616 0 -611 1 -699 -160 -22 -41 -49 -91 -60 -111 -11 -19
-33 -50 -49 -67 -17 -18 -44 -56 -62 -85 -32 -54 -86 -134 -118 -177 -26 -35
-189 -280 -217 -329 -54 -91 -164 -236 -199 -262 -38 -29 -114 -36 -169 -16
-23 9 -82 25 -132 37 -49 11 -112 31 -140 44 -27 13 -80 36 -118 51 -37 15
-70 31 -73 36 -3 5 -29 25 -57 44 -66 43 -81 57 -142 130 -102 122 -136 192
-155 327 -24 163 16 257 148 347 66 46 122 52 521 57 205 3 383 9 396 14 14 5
25 20 29 40 3 18 6 208 6 422 0 438 6 491 62 545 l29 28 292 3 c160 2 306 1
323 -3 45 -8 99 -54 143 -122 81 -125 197 -210 338 -249 48 -13 88 -16 185
-12 148 6 165 12 313 115 89 62 185 170 185 208 0 9 12 51 26 93 25 72 26 83
20 201 -5 90 -12 136 -27 167 -10 24 -19 49 -19 57 0 29 -107 158 -172 207
-36 27 -73 50 -80 50 -8 0 -19 5 -25 11 -17 17 -151 49 -233 55 -84 7 -208
-18 -290 -57 -57 -27 -193 -164 -249 -251 -38 -60 -50 -70 -100 -90 -55 -22
-67 -22 -521 -25 -289 -3 -478 -8 -498 -14 -21 -7 -37 -21 -44 -37 -7 -17 -12
-177 -15 -427 -4 -482 -6 -496 -43 -538 l-28 -32 -309 -5 c-249 -4 -313 -8
-334 -20 -15 -8 -44 -25 -65 -37 -49 -27 -180 -144 -219 -197 -16 -22 -46 -62
-65 -89 -61 -87 -60 -87 -408 -87 -399 0 -408 4 -355 140 15 40 42 89 59 109
18 20 39 52 48 71 9 19 29 55 46 80 16 25 47 75 70 112 22 36 55 86 73 110 18
24 48 70 66 103 19 33 44 71 56 85 12 14 48 71 80 128 76 135 97 157 165 170
30 6 179 13 330 16 l275 6 22 27 c20 25 23 39 23 128 0 85 -4 106 -23 140 -13
23 -33 42 -47 46 -14 4 -205 7 -424 8 l-400 1 -39 -27 c-39 -27 -92 -98 -136
-183 -13 -25 -36 -61 -51 -80 -15 -19 -35 -50 -44 -67 -9 -18 -21 -33 -26 -33
-5 0 -14 -17 -20 -39 -5 -21 -17 -44 -25 -51 -8 -7 -15 -17 -15 -23 0 -5 -16
-34 -35 -63 -20 -29 -49 -81 -65 -116 -57 -120 -150 -269 -227 -361 -13 -16
-23 -34 -23 -40 0 -7 -9 -23 -20 -37 -11 -14 -20 -30 -20 -36 0 -23 -84 -140
-119 -168 -32 -25 -42 -27 -90 -23 -32 4 -67 15 -90 30 -20 13 -58 37 -86 52
-108 62 -216 147 -279 223 -164 195 -189 228 -236 324 -27 55 -50 108 -50 117
0 9 -7 27 -16 40 -54 77 -74 489 -33 674 11 50 27 102 35 114 7 12 14 29 14
37 0 18 68 154 81 162 5 3 24 29 43 58 18 29 69 89 112 133 66 66 99 90 195
141 64 34 125 62 136 62 10 0 23 4 29 9 13 12 101 38 154 45 94 13 303 16 380
7 49 -7 104 -22 146 -41 37 -16 72 -30 79 -30 6 0 20 -9 30 -20 10 -11 24 -20
31 -20 26 0 103 -61 264 -211 86 -79 139 -104 204 -97 140 16 195 128 137 279
-38 100 -245 286 -423 380 -189 100 -267 127 -469 160 l-184 30 -122 -15 c-68
-9 -150 -16 -183 -16 -51 0 -62 3 -75 23 -14 21 -13 31 6 106 21 84 98 263
118 276 6 3 23 29 36 56 14 27 29 49 33 49 5 0 37 28 73 63 35 35 84 77 109
94 25 17 58 45 74 62 16 17 45 36 65 42 20 6 67 27 104 45 37 19 91 39 120 45
29 6 61 14 72 18 63 26 228 51 337 51 117 0 278 -25 349 -54 19 -7 59 -19 89
-26 30 -7 69 -23 85 -35 17 -12 46 -28 67 -35 91 -33 306 -230 393 -360 24
-36 49 -87 56 -115 6 -27 15 -55 20 -60 18 -24 53 -127 71 -210 14 -67 21
-156 28 -350 10 -321 12 -327 101 -373 84 -43 157 -41 221 4 36 25 44 37 49
74 4 25 13 59 20 75 8 19 14 108 17 250 4 198 2 232 -18 340 -26 137 -110 405
-140 442 -11 14 -20 31 -20 38 0 7 -17 37 -37 66 -20 30 -51 77 -67 105 -17
28 -44 70 -60 93 -73 104 -7 179 225 257 71 24 153 47 182 53 28 5 63 14 77
20 14 5 106 10 206 10 148 1 206 -3 325 -24z m980 -2339 c58 -33 101 -111 107
-197 6 -88 -4 -125 -50 -175 -32 -35 -54 -48 -108 -64 -64 -19 -69 -19 -116
-3 -83 28 -113 51 -143 112 -40 79 -45 112 -27 173 29 99 59 128 186 181 29
12 105 -2 151 -27z m-120 -1716 c10 -6 27 -23 37 -37 16 -25 17 -70 17 -571
l0 -544 22 -18 c23 -18 57 -21 529 -34 131 -4 146 -6 200 -33 41 -20 84 -55
141 -113 84 -88 123 -133 139 -161 14 -27 84 -108 143 -168 84 -85 154 -128
240 -147 92 -21 126 -49 118 -97 -8 -48 -64 -190 -84 -213 -10 -10 -31 -38
-47 -62 -29 -42 -171 -170 -231 -207 -18 -11 -52 -33 -76 -50 -54 -36 -217
-92 -324 -111 -44 -8 -132 -14 -195 -14 -117 0 -314 23 -334 39 -6 4 -32 11
-59 14 -26 4 -64 16 -85 26 -20 11 -63 31 -95 45 -105 45 -380 297 -402 366
-4 14 -11 30 -16 36 -5 6 -27 47 -49 91 -37 75 -71 171 -135 378 -16 50 -40
115 -55 145 -15 30 -30 68 -34 84 -14 57 -177 239 -259 290 -125 76 -147 100
-147 161 0 34 9 53 45 101 24 32 45 63 45 68 0 5 11 24 25 42 42 55 136 197
156 236 10 21 33 51 49 68 17 17 30 38 30 46 0 9 11 29 24 45 14 16 43 62 65
102 22 41 56 91 76 111 19 21 35 41 35 46 0 14 45 41 83 51 43 11 383 2 408
-11z m-2194 -1090 c57 -27 107 -50 110 -50 4 0 14 -6 22 -13 9 -8 44 -19 77
-25 34 -5 80 -22 103 -36 22 -14 47 -26 54 -26 25 0 65 -49 72 -88 3 -20 9
-312 12 -649 l5 -612 -25 -53 c-17 -37 -64 -94 -156 -188 -72 -74 -137 -142
-144 -150 -8 -8 -57 -53 -110 -99 -54 -46 -97 -88 -97 -92 0 -4 -122 -131
-271 -281 -320 -321 -344 -349 -359 -421 -7 -37 -8 -244 -3 -702 8 -760 8
-760 -2 -848 -6 -51 -12 -70 -27 -78 -30 -16 -52 -3 -144 82 -47 43 -89 79
-94 79 -5 0 -24 13 -42 28 -39 34 -126 84 -293 167 -103 52 -122 65 -137 96
-15 32 -17 116 -23 820 -4 539 -3 793 4 811 14 38 178 225 202 231 10 3 22 13
25 24 4 10 19 30 33 44 14 14 65 65 113 115 47 49 139 139 203 199 64 61 142
137 173 170 31 33 135 138 231 233 160 160 197 202 233 264 10 18 14 138 18
518 6 510 8 538 47 568 32 23 84 13 190 -38z m-4945 -1210 c72 -44 91 -68 108
-145 21 -93 -34 -202 -118 -235 -18 -7 -64 -13 -102 -12 -82 0 -136 25 -184
85 -27 33 -31 48 -34 111 -5 93 12 135 70 173 24 15 45 30 48 34 15 18 51 28
94 29 41 0 63 -8 118 -40z m2123 -21 c59 -22 101 -66 131 -138 28 -68 -22
-192 -93 -230 -15 -7 -56 -17 -92 -22 -89 -11 -152 9 -204 65 -45 48 -52 71
-51 151 0 67 29 136 65 156 78 41 165 48 244 18z m4221 -1592 c87 -44 126
-132 105 -239 -11 -63 -46 -113 -99 -143 -61 -34 -101 -40 -164 -21 -78 22
-118 54 -151 116 -25 49 -27 62 -23 120 4 46 13 77 34 110 54 88 186 114 298
57z"/>
<path d="M3200 10710 c-47 -9 -97 -30 -142 -62 -14 -10 -33 -18 -41 -18 -30 0
-172 -186 -183 -240 -3 -14 -11 -43 -19 -65 -41 -123 -43 -293 -4 -408 26 -77
121 -221 164 -250 18 -12 52 -36 76 -52 119 -82 311 -122 434 -89 88 24 139
27 181 14 27 -9 106 -82 304 -279 147 -146 371 -367 496 -490 126 -123 301
-295 389 -382 88 -88 165 -159 172 -159 7 0 16 -6 20 -13 4 -6 28 -26 52 -42
l44 -30 346 -5 c376 -5 376 -6 411 -63 19 -30 20 -53 20 -372 0 -252 3 -344
12 -353 7 -7 26 -12 43 -12 26 0 45 14 108 79 42 43 98 96 124 117 57 45 70
61 84 93 6 14 10 179 9 418 0 334 -2 398 -15 423 -33 64 -19 62 -531 66 -457
3 -466 4 -510 26 -48 24 -195 156 -320 287 -114 120 -190 196 -274 277 -41 39
-143 140 -227 225 -83 85 -213 215 -288 289 -75 74 -150 154 -167 177 -27 37
-29 46 -24 90 29 212 13 356 -52 490 -38 77 -147 207 -185 219 -12 4 -41 20
-64 36 -24 16 -62 36 -85 44 -51 18 -290 28 -358 14z m265 -379 c66 -26 72
-31 102 -87 51 -92 42 -191 -23 -270 -50 -62 -90 -77 -192 -72 -69 4 -87 8
-101 24 -9 11 -29 28 -44 38 -34 21 -77 114 -77 165 0 83 89 192 176 216 69
19 81 18 159 -14z"/>
</g></svg></div>
        <div>
          <div class="sb-logo-name"><span class="sd-sy">Sy</span><span class="sd-dent">Dent</span></div>
          <div class="sb-logo-sub" id="sbLogoSub">نظام إدارة العيادة</div>
        </div>
      </a>
      <nav class="sb-nav">${navHTML}</nav>
      <div class="sb-footer" id="sbDoctorFooter">
        <div class="sb-footer-name" id="sbDoctorName">جارٍ التحميل…</div>
        <button type="button" class="sb-theme-switch" id="sbThemeSwitch" role="switch" aria-label="تبديل الوضع الفاتح/الداكن" title="تبديل الوضع الفاتح/الداكن">
          <svg class="sb-theme-icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
          <svg class="sb-theme-icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          <span class="sb-theme-switch-knob" aria-hidden="true"></span>
        </button>
      </div>
    </aside>`;
}

// تحديث اسم الدكتور وعدد مواعيد اليوم بشكل ديناميكي
async function refreshSidebarDynamic() {
  if (!window.sb) return;
  const { data: u } = await window.sb.auth.getUser();
  if (!u || !u.user) return;
  const uid = u.user.id;

  // فحص حالة الحساب — إذا موقوف يحجب الصفحة
  const { data: trialData } = await window.sb.from('trial_requests')
    .select('status, trial_end')
    .eq('email', u.user.email)
    .maybeSingle();

  if (trialData && trialData.status === 'rejected') {
    // Phase X11 — read vendor support_phone from platform_settings (Migration 33
    // table + Migration 34 public-read policy). Falls back to the legacy
    // hardcoded value on RLS/network failure so the suspension screen always
    // shows a working WhatsApp link. Single query per suspension render.
    var SB_SUPPORT_PHONE_FALLBACK = '963934012433';
    var sbSupportPhone = SB_SUPPORT_PHONE_FALLBACK;
    try {
      const psRes = await window.sb.from('platform_settings')
        .select('value')
        .eq('key', 'support_phone')
        .maybeSingle();
      if (psRes && psRes.data && psRes.data.value) {
        const v = String(psRes.data.value).trim();
        if (/^\d{8,15}$/.test(v)) sbSupportPhone = v;
      }
    } catch (e) { /* keep fallback */ }

    document.body.innerHTML = `
      <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--bg3);padding:24px;font-family:'Cairo',sans-serif;text-align:center;">
        <div style="margin-bottom:16px;color:var(--red);"><svg width="56" height="56" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><circle cx="12" cy="12" r="10" /><path d="M4.929 4.929 19.07 19.071" /></svg></div>
        <div style="font-size:22px;font-weight:800;color:#e1f4ee;margin-bottom:10px;">تم إيقاف حسابك</div>
        <div style="font-size:14px;color:#8a9ab5;margin-bottom:28px;max-width:320px;line-height:1.7;">للاستفسار أو تجديد الاشتراك، تواصل معنا عبر واتساب.</div>
        <a href="https://wa.me/${sbSupportPhone}?text=${encodeURIComponent('مرحباً، حسابي في SyDent موقوف وأريد الاستفسار')}" target="_blank"
          style="padding:14px 28px;background:#25d366;border-radius:12px;color:#fff;font-size:15px;font-weight:800;text-decoration:none;margin-bottom:12px;">
          <svg width="15" height="15" style="vertical-align:-2px;margin-left:6px;" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719" /></svg> تواصل معنا عبر واتساب
        </a>
        <button onclick="window.doLogout()"
          style="padding:10px 20px;background:transparent;border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:#8a9ab5;font-family:'Cairo',sans-serif;font-size:13px;cursor:pointer;margin-top:8px;">
          تسجيل الخروج
        </button>
      </div>`;
    return;
  }

  if (trialData && trialData.status === 'new') {
    document.body.innerHTML = `
      <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--bg3);padding:24px;font-family:'Cairo',sans-serif;text-align:center;">
        <div style="font-size:60px;margin-bottom:16px;">⏳</div>
        <div style="font-size:22px;font-weight:800;color:#e1f4ee;margin-bottom:10px;">طلبك قيد المراجعة</div>
        <div style="font-size:14px;color:#8a9ab5;margin-bottom:28px;max-width:320px;line-height:1.7;">شكراً لتسجيلك في SyDent. سيتم مراجعة طلبك وتفعيل حسابك قريباً.</div>
        <button onclick="window.doLogout()"
          style="padding:10px 20px;background:transparent;border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:#8a9ab5;font-family:'Cairo',sans-serif;font-size:13px;cursor:pointer;">
          تسجيل الخروج
        </button>
      </div>`;
    return;
  }

  // اسم الدكتور
  const meta = u.user.user_metadata || {};
  const name = meta.full_name || meta.name || u.user.email || 'دكتور';
  const role = meta.role || 'طبيب أسنان';
  const nameEl = document.getElementById('sbDoctorName');
  if (nameEl) nameEl.innerHTML = name + '<br>' + role;

  // Clinic name in the brand sub-line. The clinic name lives in
  // clinic_settings.clinic_name (edited on settings.html) and was previously
  // only surfaced on the dashboard; loading it here shows it on every tenant
  // page via the shared sidebar. Falls back to the generic subtitle.
  try {
    const subEl = document.getElementById('sbLogoSub');
    if (subEl && window.sb && u.user && u.user.id) {
      const csRes = await window.sb.from('clinic_settings')
        .select('clinic_name').eq('owner_id', u.user.id).maybeSingle();
      const cn = csRes && csRes.data && csRes.data.clinic_name;
      if (cn && String(cn).trim()) subEl.textContent = String(cn).trim();
    }
  } catch (e) { /* keep default subtitle on any error */ }

  // Phase C: hide nav items for modules disabled by the tenant's plan.
  // Composes with the device-role BLOCKED filter in buildHTML: an item shows
  // only if (role allows) AND (plan allows). Fail-open via SyDentPlan.can.
  try {
    if (window.SyDentPlan) {
      await window.SyDentPlan.load();
      const nav = document.querySelector('.sb-nav');
      if (nav) {
        const GATEABLE = ['treatments','doctors','employees','payouts','expenses','inventory','labs','accounting','provider-reports','audit-log'];
        GATEABLE.forEach(function(id){
          if (window.SyDentPlan.can(id)) return;
          let href = null;
          for (let ni = 0; ni < navItems.length; ni++) { if (navItems[ni].id === id) { href = navItems[ni].href; break; } }
          if (!href) return;
          const a = nav.querySelector('.sb-item[href="' + href + '"]');
          if (a) a.remove();
        });
        // Prune section headers left with no items (followed by another section or the end).
        const secs = nav.querySelectorAll('.sb-section');
        secs.forEach(function(sec){
          const nx = sec.nextElementSibling;
          if (!nx || (nx.classList && nx.classList.contains('sb-section'))) sec.remove();
        });
      }
    }
  } catch (entErr) { console.warn('[sidebar] entitlement filter skipped:', entErr); }

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

  // 2.5. Wire theme toggle — self-contained (works whether theme.js is loaded or not).
  //  Uses the same localStorage key 'sydent_theme' as theme.js for cross-page persistence.
  //  IMPORTANT: hide the toggle on pages that don't ship theme.css (Tier B/C pages
  //  not yet migrated) — otherwise the knob moves but the page doesn't change,
  //  which is confusing. Detection: theme.css presence in document.styleSheets,
  //  OR window.SyDentTheme (loaded via theme.js, which always accompanies theme.css).
  try {
    const sw  = document.getElementById('sbThemeSwitch');
    const themeCssLoaded = !!(window.SyDentTheme) ||
      Array.from(document.styleSheets || []).some(function(s){
        try { return (s.href || '').indexOf('theme.css') !== -1; } catch(e) { return false; }
      });
    if (sw && !themeCssLoaded) {
      sw.style.display = 'none';
    }
    if (sw && themeCssLoaded) {
      const KEY = 'sydent_theme';
      const VALID = { light: 1, dark: 1 };
      const readMode = function() {
        try {
          const v = localStorage.getItem(KEY);
          return (v && VALID[v]) ? v : 'light';
        } catch (e) { return 'light'; }
      };
      const writeMode = function(m) {
        try { localStorage.setItem(KEY, m); } catch (e) {}
      };
      const applyMode = function(m) {
        if (!VALID[m]) m = 'light';
        document.documentElement.setAttribute('data-theme', m);
        sw.setAttribute('aria-checked', m === 'dark' ? 'true' : 'false');
        // Update mobile status bar tint if a theme-color meta exists
        try {
          const meta = document.querySelector('meta[name="theme-color"]');
          if (meta) meta.setAttribute('content', m === 'dark' ? '#0a1628' : '#f4f7fa');
        } catch (e) {}
        // Notify other widgets (e.g. Chart.js) — same event name as theme.js
        try {
          window.dispatchEvent(new CustomEvent('sydent:themechange', { detail: { mode: m } }));
        } catch (e) {}
      };
      // Initial sync: read stored or default, then apply (ensures sidebar + page agree)
      const initial = readMode();
      applyMode(initial);
      // Click handler — toggles + persists
      sw.addEventListener('click', function(e) {
        e.preventDefault();
        const next = (document.documentElement.getAttribute('data-theme') === 'dark') ? 'light' : 'dark';
        writeMode(next);
        applyMode(next);
      });
    }
  } catch (e) { /* non-fatal */ }

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
      'background:var(--bg3);' +
      'font-size:13px;font-weight:700;color:var(--green);' +
      'font-family:"Cairo",sans-serif;' +
      'transition:height .25s ease;' +
      'border-bottom:1px solid transparent;}' +
    '.ptr-bar.show{height:38px;border-bottom-color:rgba(var(--green-rgb),0.2);}' +
    '.ptr-ring{' +
      'width:15px;height:15px;' +
      'border:2px solid rgba(var(--green-rgb),0.25);' +
      'border-top-color:var(--green);' +
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
