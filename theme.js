/* ============================================================================
   SyDent Theme System — theme.js v1 (27 May 2026)
   ----------------------------------------------------------------------------
   IMPORTANT: this script MUST run as early as possible in <head>, BEFORE any
   page-specific inline CSS or content renders, to prevent a flash of the wrong
   theme (FOUC). It applies `data-theme` to <html> synchronously.

   Persistence: localStorage key `sydent_theme` ∈ {'light','dark'}.
   Default: 'light' (per user requirement "خلي اللايت مود هو الاساسي").

   No DOM/library dependencies. Safe to load before Supabase CDN.
   ============================================================================ */
(function(){
  'use strict';

  var STORAGE_KEY = 'sydent_theme';
  var VALID = { light: 1, dark: 1 };
  var DEFAULT_THEME = 'light';

  function readStored() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      return (v && VALID[v]) ? v : null;
    } catch (e) { return null; }
  }

  function writeStored(mode) {
    try { localStorage.setItem(STORAGE_KEY, mode); } catch (e) {}
  }

  function applyTheme(mode) {
    if (!VALID[mode]) mode = DEFAULT_THEME;
    var root = document.documentElement;
    if (root) root.setAttribute('data-theme', mode);
    // Update the iOS-style meta theme-color so the mobile status bar matches.
    try {
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) {
        meta.setAttribute('content', mode === 'dark' ? '#0a1628' : '#fafaf7');
      }
    } catch (e) {}
  }

  function getTheme() {
    var stored = readStored();
    if (stored) return stored;
    return DEFAULT_THEME; // never auto-follow system; explicit default
  }

  function setTheme(mode) {
    if (!VALID[mode]) mode = DEFAULT_THEME;
    writeStored(mode);
    applyTheme(mode);
    // Mark ready so .body transitions activate AFTER initial paint
    try { document.documentElement.setAttribute('data-theme-ready', '1'); } catch(e){}
    // Notify any listeners (e.g. charts that need to redraw with new palette)
    try {
      window.dispatchEvent(new CustomEvent('sydent:themechange', {
        detail: { theme: mode }
      }));
    } catch (e) {}
  }

  function toggleTheme() {
    var current = getTheme();
    setTheme(current === 'dark' ? 'light' : 'dark');
  }

  // -------- Initial sync apply (anti-FOUC) -----------------------------------
  // Must run BEFORE first paint. The CSS default (:root) already targets light,
  // but explicit attribute guarantees [data-theme="..."] selectors work too.
  applyTheme(getTheme());

  // Mark theme-ready on next tick to enable smooth transitions WITHOUT
  // animating the initial paint.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      try { document.documentElement.setAttribute('data-theme-ready', '1'); } catch(e){}
    }, { once: true });
  } else {
    try { document.documentElement.setAttribute('data-theme-ready', '1'); } catch(e){}
  }

  // -------- Toggle UI builders -----------------------------------------------
  // Two SVG icons (sun + moon), Heroicons-derived. inline SVG per rule #71.
  var SVG_SUN = '<svg class="stt-icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
  var SVG_MOON = '<svg class="stt-icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

  /**
   * Build a standalone toggle button (just the switch). Useful for navbars.
   * @param {Object} [opts]
   * @param {string} [opts.title='تبديل الوضع']
   * @returns {HTMLButtonElement}
   */
  function buildToggle(opts) {
    opts = opts || {};
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sydent-theme-toggle';
    btn.setAttribute('role', 'switch');
    btn.setAttribute('aria-label', opts.title || 'تبديل الوضع');
    btn.title = opts.title || 'تبديل الوضع الفاتح/الداكن';
    btn.innerHTML = SVG_SUN + SVG_MOON + '<span class="stt-knob" aria-hidden="true"></span>';
    syncAria(btn);
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      toggleTheme();
      syncAria(btn);
    });
    // Keep aria in sync when theme changes from elsewhere (e.g. sidebar)
    window.addEventListener('sydent:themechange', function() { syncAria(btn); });
    return btn;
  }

  function syncAria(btn) {
    var isDark = getTheme() === 'dark';
    btn.setAttribute('aria-checked', isDark ? 'true' : 'false');
  }

  /**
   * Build a sidebar row: "🌓 الوضع [toggle]"
   * @returns {HTMLDivElement}
   */
  function buildSidebarRow() {
    var row = document.createElement('div');
    row.className = 'sb-theme-row';
    var label = document.createElement('span');
    label.className = 'sb-theme-label';
    label.innerHTML = '<span style="font-size:15px">🌓</span><span>الوضع</span>';
    row.appendChild(label);
    row.appendChild(buildToggle({ title: 'تبديل الوضع الفاتح/الداكن' }));
    return row;
  }

  /**
   * Mount a toggle inside an element selected by CSS selector. No-op if missing.
   * @param {string} selector
   * @param {Object} [opts] passed to buildToggle
   * @returns {HTMLElement|null} the inserted toggle
   */
  function mount(selector, opts) {
    var host = document.querySelector(selector);
    if (!host) return null;
    var t = buildToggle(opts);
    host.appendChild(t);
    return t;
  }

  // -------- Public API -------------------------------------------------------
  window.SyDentTheme = {
    get: getTheme,
    set: setTheme,
    toggle: toggleTheme,
    buildToggle: buildToggle,
    buildSidebarRow: buildSidebarRow,
    mount: mount,
    DEFAULT: DEFAULT_THEME
  };
})();
