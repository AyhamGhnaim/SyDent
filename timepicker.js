/* SyDent 12-hour AM/PM time picker
 * --------------------------------------------------------------------------
 * Chromium ignores the element `lang` attribute for <input type="time"> in
 * many builds, so the native control stays 24h. This module upgrades any
 * <input type="time"> into a custom hour : minute + AM/PM control (iPhone
 * style) that works in every browser.
 *
 * KEY GUARANTEE: the original input keeps its id and its `.value` stays in
 * 24h "HH:mm" form (HTML spec format), so every read/write in the app is
 * unchanged. We intercept `.value` (get/set) so programmatic prefills
 * (input.value = a.time) update the visible control, and selections write
 * "HH:mm" back into the input and fire input/change events.
 *
 * Graceful: if this file fails to load, the native (24h) picker still works.
 */
(function () {
  'use strict';

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  // "HH:mm[:ss]" -> {h12, min, ap} | null
  function parse24(v) {
    if (!v || !/^\d{1,2}:\d{2}/.test(v)) return null;
    var p = v.split(':');
    var h24 = parseInt(p[0], 10);
    var min = parseInt(p[1], 10);
    if (isNaN(h24) || isNaN(min) || h24 > 23 || min > 59) return null;
    var ap = h24 < 12 ? 'AM' : 'PM';
    var h12 = h24 % 12; if (h12 === 0) h12 = 12;
    return { h12: h12, min: min, ap: ap };
  }

  // (h12 1-12, min, ap) -> "HH:mm"
  function build24(h12, min, ap) {
    var h24;
    if (ap === 'AM') h24 = (h12 === 12) ? 0 : h12;
    else h24 = (h12 === 12) ? 12 : h12 + 12;
    return pad2(h24) + ':' + pad2(min);
  }

  function mkOption(value, label) {
    var o = document.createElement('option');
    o.value = value; o.textContent = label;
    return o;
  }

  // Inject (once) the CSS that makes the wrapper look like ONE form field and
  // the inner selects borderless/transparent. Uses the same theme vars as the
  // app's native inputs (--bg3/--border/--green/--text/--text2) so it matches
  // both light and dark themes on every page.
  function injectStyle() {
    if (document.getElementById('tp12-style')) return;
    var s = document.createElement('style');
    s.id = 'tp12-style';
    s.textContent =
      '.tp12{display:flex;align-items:center;gap:1px;direction:ltr;width:100%;' +
        'background:var(--bg3);border:1px solid var(--border);border-radius:9px;' +
        'padding:9px 12px;box-sizing:border-box;}' +
      '.tp12:focus-within{border-color:var(--green);}' +
      '.tp12 > select.tp12-part{-webkit-appearance:none;-moz-appearance:none;appearance:none;' +
        'background:transparent !important;background-image:none !important;' +
        'border:0 !important;border-radius:0 !important;box-shadow:none !important;' +
        'padding:0 1px !important;margin:0 !important;width:auto !important;min-width:0 !important;' +
        'height:auto !important;color:var(--text);font-family:inherit;font-size:14px;' +
        'font-weight:600;line-height:1.3;outline:none;cursor:pointer;text-align:center;' +
        'text-align-last:center;}' +
      '.tp12 > .tp12-colon{color:var(--text2);font-weight:700;opacity:.7;padding:0 1px;}' +
      '.tp12 > select.tp12-ap{font-weight:700;margin-left:7px !important;}';
    document.head.appendChild(s);
  }

  function upgrade(input) {
    if (!input || input.dataset.tpUpgraded === '1') return;
    if (input.tagName !== 'INPUT') return;
    input.dataset.tpUpgraded = '1';

    var initial = input.getAttribute('value') || input.value || '';

    injectStyle();

    // Hide native control but keep it in the DOM as the value holder.
    input.style.display = 'none';

    // One bordered field; the inner selects are borderless so the whole thing
    // reads as a single time field (hour : minute  AM/PM).
    var wrap = document.createElement('div');
    wrap.className = 'tp12';

    var hourSel = document.createElement('select'); hourSel.className = 'tp12-part tp12-h';
    var minSel  = document.createElement('select'); minSel.className  = 'tp12-part tp12-m';
    var apSel   = document.createElement('select'); apSel.className   = 'tp12-part tp12-ap';

    hourSel.appendChild(mkOption('', '--'));
    for (var h = 1; h <= 12; h++) hourSel.appendChild(mkOption(String(h), pad2(h)));

    minSel.appendChild(mkOption('', '--'));
    for (var m = 0; m < 60; m++) minSel.appendChild(mkOption(String(m), pad2(m)));

    apSel.appendChild(mkOption('AM', 'AM'));
    apSel.appendChild(mkOption('PM', 'PM'));

    var colon = document.createElement('span');
    colon.textContent = ':';
    colon.className = 'tp12-colon';

    wrap.appendChild(hourSel);
    wrap.appendChild(colon);
    wrap.appendChild(minSel);
    wrap.appendChild(apSel);
    input.parentNode.insertBefore(wrap, input.nextSibling);

    var _val = '';

    function uiToVal() {
      var h = hourSel.value, m = minSel.value;
      if (h === '' || m === '') return '';          // incomplete -> empty time
      return build24(parseInt(h, 10), parseInt(m, 10), apSel.value);
    }

    function valToUi(v) {
      var parsed = parse24(v);
      if (!parsed) { hourSel.value = ''; minSel.value = ''; apSel.value = 'AM'; return; }
      hourSel.value = String(parsed.h12);
      minSel.value = String(parsed.min);
      apSel.value = parsed.ap;
    }

    function onUiChange() {
      _val = uiToVal();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    hourSel.addEventListener('change', onUiChange);
    minSel.addEventListener('change', onUiChange);
    apSel.addEventListener('change', onUiChange);

    // Route the input's value through our storage + visible control so all
    // existing reads/writes keep working with 24h "HH:mm".
    Object.defineProperty(input, 'value', {
      configurable: true,
      get: function () { return _val; },
      set: function (v) { _val = (v == null) ? '' : String(v); valToUi(_val); }
    });

    input.value = initial; // through setter: sets _val + syncs UI
  }

  function upgradeAll(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll('input[type="time"]');
    for (var i = 0; i < nodes.length; i++) upgrade(nodes[i]);
  }

  window.SyDentTime = { upgrade: upgrade, upgradeAll: upgradeAll };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { upgradeAll(); });
  } else {
    upgradeAll();
  }
})();
