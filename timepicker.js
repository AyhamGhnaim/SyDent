/* SyDent 12-hour AM/PM time picker — iOS-style wheel popover
 * --------------------------------------------------------------------------
 * Chromium ignores the element `lang` attribute for <input type="time">, so
 * the native control stays 24h. This module upgrades any <input type="time">
 * into a single field that opens ONE popover containing three scrolling
 * wheels (hour : minute  AM/PM) with a centered selection band — exactly like
 * the iPhone time picker. Works on touch (drag), mouse wheel, and click.
 *
 * KEY GUARANTEE: the original input keeps its id and its `.value` stays in 24h
 * "HH:mm" form (HTML spec), so every read/write in the app is unchanged. We
 * intercept `.value` (get/set) so programmatic prefills (input.value = a.time)
 * sync the wheels, and wheel changes write "HH:mm" back + fire input/change.
 *
 * Graceful: if this file fails to load, the native (24h) picker still works.
 */
(function () {
  'use strict';

  var ITEM_H = 36;          // px height of one wheel row
  var VISIBLE = 5;          // visible rows (odd; centre row = selection)
  var COL_H = ITEM_H * VISIBLE;
  var PAD = (COL_H - ITEM_H) / 2;

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function parse24(v) {
    if (!v || !/^\d{1,2}:\d{2}/.test(v)) return null;
    var p = v.split(':');
    var h24 = parseInt(p[0], 10), min = parseInt(p[1], 10);
    if (isNaN(h24) || isNaN(min) || h24 > 23 || min > 59) return null;
    var ap = h24 < 12 ? 'AM' : 'PM';
    var h12 = h24 % 12; if (h12 === 0) h12 = 12;
    return { h12: h12, min: min, ap: ap };
  }

  function build24(h12, min, ap) {
    var h24;
    if (ap === 'AM') h24 = (h12 === 12) ? 0 : h12;
    else h24 = (h12 === 12) ? 12 : h12 + 12;
    return pad2(h24) + ':' + pad2(min);
  }

  function injectStyle() {
    if (document.getElementById('tpw-style')) return;
    var s = document.createElement('style');
    s.id = 'tpw-style';
    s.textContent = [
      '.tpw{position:relative;width:100%;}',
      '.tpw-field{width:100%;box-sizing:border-box;background:var(--bg3);',
        'border:1px solid var(--border);border-radius:9px;padding:10px 13px;',
        'color:var(--text);font-family:inherit;font-size:14px;font-weight:700;',
        'cursor:pointer;text-align:left;direction:ltr;letter-spacing:.5px;',
        'user-select:none;-webkit-user-select:none;}',
      '.tpw-field.empty{color:var(--text2);font-weight:500;letter-spacing:1px;}',
      '.tpw.open .tpw-field{border-color:var(--green);}',
      '.tpw-pop{position:absolute;z-index:9999;top:calc(100% + 6px);left:0;right:0;',
        'background:var(--bg2);border:1px solid var(--border);border-radius:12px;',
        'box-shadow:0 14px 36px rgba(0,0,0,.45);padding:6px 8px 8px;display:none;}',
      '.tpw.open .tpw-pop{display:block;}',
      '.tpw-cols{position:relative;display:flex;gap:4px;height:' + COL_H + 'px;direction:ltr;}',
      '.tpw-band{position:absolute;left:4px;right:4px;top:' + PAD + 'px;height:' + ITEM_H + 'px;',
        'border-top:1px solid var(--border);border-bottom:1px solid var(--border);',
        'background:rgba(46,232,158,.10);border-radius:8px;pointer-events:none;}',
      '.tpw-col{flex:1 1 0;min-width:0;height:100%;overflow-y:scroll;',
        'scroll-snap-type:y mandatory;touch-action:pan-y;scrollbar-width:none;',
        '-ms-overflow-style:none;',
        '-webkit-mask-image:linear-gradient(to bottom,transparent,#000 26%,#000 74%,transparent);',
        'mask-image:linear-gradient(to bottom,transparent,#000 26%,#000 74%,transparent);}',
      '.tpw-col::-webkit-scrollbar{display:none;width:0;height:0;}',
      '.tpw-col.ampm{flex:0 0 58px;}',
      '.tpw-item{height:' + ITEM_H + 'px;display:flex;align-items:center;justify-content:center;',
        'scroll-snap-align:center;font-size:18px;font-weight:700;color:var(--text);',
        'cursor:pointer;font-variant-numeric:tabular-nums;}',
      '.tpw-colon{display:flex;align-items:center;justify-content:center;flex:0 0 6px;',
        'font-size:18px;font-weight:800;color:var(--text2);}',
      '.tpw-spacer{height:' + PAD + 'px;}',
      '.tpw-actions{display:flex;justify-content:flex-end;padding-top:8px;}',
      '.tpw-done{background:var(--green);color:var(--bg);border:none;border-radius:8px;',
        'padding:7px 20px;font-family:inherit;font-weight:800;font-size:13px;cursor:pointer;}'
    ].join('');
    document.head.appendChild(s);
  }

  function buildCol(values, cls) {
    var col = document.createElement('div');
    col.className = 'tpw-col' + (cls ? ' ' + cls : '');
    var top = document.createElement('div'); top.className = 'tpw-spacer'; col.appendChild(top);
    for (var i = 0; i < values.length; i++) {
      var it = document.createElement('div');
      it.className = 'tpw-item';
      it.textContent = values[i].label;
      it.dataset.val = values[i].value;
      col.appendChild(it);
    }
    var bot = document.createElement('div'); bot.className = 'tpw-spacer'; col.appendChild(bot);
    return col;
  }

  function items(col) { return col.querySelectorAll('.tpw-item'); }
  function idxFromScroll(col) { return Math.round(col.scrollTop / ITEM_H); }
  function clamp(i, n) { return Math.max(0, Math.min(n - 1, i)); }
  function valAt(col, idx) {
    var its = items(col); idx = clamp(idx, its.length);
    return its[idx] ? its[idx].dataset.val : null;
  }
  function idxOfVal(col, val) {
    var its = items(col);
    for (var i = 0; i < its.length; i++) if (its[i].dataset.val === String(val)) return i;
    return 0;
  }
  function scrollToIdx(col, idx, smooth) {
    col.scrollTo({ top: idx * ITEM_H, behavior: smooth ? 'smooth' : 'auto' });
  }

  function upgrade(input) {
    if (!input || input.dataset.tpUpgraded === '1') return;
    if (input.tagName !== 'INPUT') return;
    input.dataset.tpUpgraded = '1';

    var initial = input.getAttribute('value') || input.value || '';

    injectStyle();
    input.style.display = 'none';

    var wrap  = document.createElement('div'); wrap.className = 'tpw';
    var field = document.createElement('div'); field.className = 'tpw-field';
    var pop   = document.createElement('div'); pop.className = 'tpw-pop';
    var cols  = document.createElement('div'); cols.className = 'tpw-cols';
    var band  = document.createElement('div'); band.className = 'tpw-band';

    var hourVals = [], minVals = [], apVals = [{ value: 'AM', label: 'AM' }, { value: 'PM', label: 'PM' }];
    for (var h = 1; h <= 12; h++) hourVals.push({ value: String(h), label: pad2(h) });
    for (var m = 0; m < 60; m++) minVals.push({ value: String(m), label: pad2(m) });

    var hCol = buildCol(hourVals, 'h');
    var mCol = buildCol(minVals, 'm');
    var aCol = buildCol(apVals, 'ampm');
    var colon = document.createElement('div'); colon.className = 'tpw-colon'; colon.textContent = ':';

    cols.appendChild(hCol);
    cols.appendChild(colon);
    cols.appendChild(mCol);
    cols.appendChild(aCol);
    cols.appendChild(band);
    pop.appendChild(cols);

    var actions = document.createElement('div'); actions.className = 'tpw-actions';
    var done = document.createElement('button'); done.type = 'button'; done.className = 'tpw-done'; done.textContent = 'تم';
    actions.appendChild(done);
    pop.appendChild(actions);

    wrap.appendChild(field);
    wrap.appendChild(pop);
    input.parentNode.insertBefore(wrap, input.nextSibling);

    var _val = '';

    function renderField() {
      var p = parse24(_val);
      if (!p) { field.textContent = '--:--  --'; field.classList.add('empty'); }
      else { field.textContent = pad2(p.h12) + ':' + pad2(p.min) + '  ' + p.ap; field.classList.remove('empty'); }
    }

    function readWheels() {
      var hv = valAt(hCol, idxFromScroll(hCol));
      var mv = valAt(mCol, idxFromScroll(mCol));
      var av = valAt(aCol, idxFromScroll(aCol));
      if (hv == null || mv == null || av == null) return _val;
      return build24(parseInt(hv, 10), parseInt(mv, 10), av);
    }

    function commit() {
      _val = readWheels();
      renderField();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function syncWheels() {
      var p = parse24(_val) || { h12: 9, min: 0, ap: 'AM' };
      scrollToIdx(hCol, idxOfVal(hCol, p.h12), false);
      scrollToIdx(mCol, idxOfVal(mCol, p.min), false);
      scrollToIdx(aCol, idxOfVal(aCol, p.ap), false);
    }

    function attachCol(col) {
      var t = null;
      col.addEventListener('scroll', function () {
        if (t) clearTimeout(t);
        t = setTimeout(commit, 110);
      });
      col.addEventListener('click', function (e) {
        var it = e.target.closest ? e.target.closest('.tpw-item') : null;
        if (!it) return;
        var its = items(col);
        var idx = Array.prototype.indexOf.call(its, it);
        scrollToIdx(col, idx, true);
        setTimeout(commit, 200);
      });
    }
    attachCol(hCol); attachCol(mCol); attachCol(aCol);

    function open() {
      if (wrap.classList.contains('open')) return;
      wrap.classList.add('open');
      // Layout must exist before scrolling the now-visible wheels.
      requestAnimationFrame(syncWheels);
    }
    function close() {
      if (!wrap.classList.contains('open')) return;
      // Commit WHILE the popover is still visible. A display:none element (which
      // is what removing `.open` makes the popover) reports scrollTop === 0, so
      // readWheels() would read the FIRST row of every wheel — "01:00 AM" — and
      // silently discard the user's selection. Read the wheels first, then hide.
      commit();
      wrap.classList.remove('open');
    }

    field.addEventListener('click', function () {
      if (wrap.classList.contains('open')) close(); else open();
    });
    done.addEventListener('click', function (e) { e.preventDefault(); close(); });
    document.addEventListener('click', function (e) {
      if (!wrap.classList.contains('open')) return;
      if (!wrap.contains(e.target)) close();
    });

    Object.defineProperty(input, 'value', {
      configurable: true,
      get: function () { return _val; },
      set: function (v) {
        _val = (v == null) ? '' : String(v);
        renderField();
        if (wrap.classList.contains('open')) requestAnimationFrame(syncWheels);
      }
    });

    _val = initial;
    renderField();
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
