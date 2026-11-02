/* Settings: defaults, applying flags, and the full-screen settings panel (hub + arena pause). G.settings */
window.G = window.G || {};
(function () {
  'use strict';
  var CODES = { ALLIN: { cash: 1e17, gold: 1e6, gems: 1e6 } }; // 100aa = 100 x 1e15
  var DEFAULTS = {
    sound: true, master: 1, sfx: 1, music: 0.6,
    shake: true, flashes: true, dmgNumbers: true, vibration: true, showFps: false,
    joySide: 'right', joySize: 1
  };
  var panel = null, fpsEl = null, fpsRaf = 0, fpsFrames = 0, fpsT = 0;

  function st() { try { return G.save.state.settings; } catch (e) { return null; } }
  function get(k) { var s = st(), v = s && s[k]; return (v === undefined || v === null || typeof v !== typeof DEFAULTS[k]) ? DEFAULTS[k] : v; }
  function set(k, v) { var s = st(); if (!s) return; s[k] = v; try { G.save.save(); } catch (e) {} apply(); }
  function ensure() { var s = st(); if (!s) return; Object.keys(DEFAULTS).forEach(function (k) { if (typeof s[k] !== typeof DEFAULTS[k]) s[k] = DEFAULTS[k]; }); }
  function clamp01(x) { return Math.max(0, Math.min(1, +x || 0)); }

  function apply() {
    try {
      if (G.audio && typeof G.audio.setVolumes === 'function') G.audio.setVolumes({ master: clamp01(get('master')), sfx: clamp01(get('sfx')), music: clamp01(get('music')) });
    } catch (e) {}
    fpsUpdate();
  }
  function vibrate(ms) {
    try { if (get('vibration') && navigator.vibrate) navigator.vibrate(ms || 30); } catch (e) {}
  }

  // ---- FPS badge ----
  function fpsUpdate() {
    var on = get('showFps');
    if (on && !fpsEl) {
      var root = document.getElementById('stage'); if (!root) return;
      fpsEl = document.createElement('div'); fpsEl.id = 'fps-badge'; fpsEl.textContent = '-- FPS'; root.appendChild(fpsEl);
      fpsFrames = 0; fpsT = performance.now();
      var loop = function (now) {
        fpsFrames++;
        if (now - fpsT >= 500) { if (fpsEl) fpsEl.textContent = Math.round(fpsFrames * 1000 / (now - fpsT)) + ' FPS'; fpsFrames = 0; fpsT = now; }
        fpsRaf = requestAnimationFrame(loop);
      };
      fpsRaf = requestAnimationFrame(loop);
    } else if (!on && fpsEl) {
      cancelAnimationFrame(fpsRaf); if (fpsEl.parentNode) fpsEl.parentNode.removeChild(fpsEl); fpsEl = null;
    }
  }

  // ---- panel ----
  function h(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function sfxClick() { try { G.audio && G.audio.play && G.audio.play('click'); } catch (e) {} }

  function toggle(label, key, hint, onchange) {
    var r = h('div', 'set-row'); var l = h('span', 'set-l', label); if (hint) l.appendChild(h('small', '', hint)); r.appendChild(l);
    var t = h('button', 'toggle'); t.setAttribute('role', 'switch'); t.setAttribute('aria-label', label);
    function paint() { var on = !!get(key); t.classList.toggle('on', on); t.setAttribute('aria-checked', on); }
    paint();
    t.addEventListener('click', function () { set(key, !get(key)); paint(); sfxClick(); if (key === 'vibration') vibrate(40); if (onchange) onchange(); });
    r.appendChild(t); return r;
  }
  function slider(label, key, min, max, step, fmtv, onpreview) {
    var r = h('div', 'set-row set-slide'); r.appendChild(h('span', 'set-l', label));
    var v = h('b', 'set-v'); var inp = h('input'); inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = get(key); inp.setAttribute('aria-label', label);
    function paint() { v.textContent = fmtv(+inp.value); var p = (inp.value - min) / (max - min) * 100; inp.style.setProperty('--p', p + '%'); }
    paint();
    inp.addEventListener('input', function () { set(key, +inp.value); paint(); });
    inp.addEventListener('change', function () { if (onpreview) onpreview(); });
    r.appendChild(inp); r.appendChild(v); return r;
  }
  function segmented(label, key, opts) {
    var r = h('div', 'set-row'); r.appendChild(h('span', 'set-l', label));
    var g = h('div', 'seg');
    opts.forEach(function (o) {
      var b = h('button', 'seg-b', o[1]);
      function paint() { b.classList.toggle('on', get(key) === o[0]); }
      b.addEventListener('click', function () { set(key, o[0]); sfxClick(); Array.prototype.forEach.call(g.children, function (x) { x.classList.remove('on'); }); b.classList.add('on'); });
      paint(); g.appendChild(b);
    });
    r.appendChild(g); return r;
  }

  function open(o) {
    o = o || {};
    if (panel) return;
    ensure();
    var root = document.getElementById('stage') || document.body;
    var p = h('div', 'set-screen'); p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Settings');
    p.appendChild(h('div', 'set-head', 'Settings'));
    var body = h('div', 'set-body'); p.appendChild(body);

    body.appendChild(h('div', 'set-sec', 'Audio'));
    body.appendChild(toggle('Sound', 'sound', 'Mute everything'));
    var pct = function (x) { return Math.round(x * 100) + '%'; };
    body.appendChild(slider('Master volume', 'master', 0, 1, 0.05, pct, function () { try { G.audio.play('click'); } catch (e) {} }));
    body.appendChild(slider('Effects volume', 'sfx', 0, 1, 0.05, pct, function () { try { G.audio.play('buy'); } catch (e) {} }));
    body.appendChild(slider('Music volume', 'music', 0, 1, 0.05, pct));

    body.appendChild(h('div', 'set-sec', 'Effects'));
    body.appendChild(toggle('Screen shake', 'shake'));
    body.appendChild(toggle('Screen flashes', 'flashes', 'Red hit flash, muzzle flashes'));
    body.appendChild(toggle('Damage numbers', 'dmgNumbers'));
    body.appendChild(toggle('Vibration', 'vibration', 'Haptics on phones'));
    body.appendChild(toggle('Show FPS', 'showFps'));

    body.appendChild(h('div', 'set-sec', 'Controls'));
    body.appendChild(segmented('Joystick side', 'joySide', [['left', 'Left'], ['right', 'Right']]));
    body.appendChild(slider('Joystick size', 'joySize', 0.7, 1.5, 0.05, function (x) { return Math.round(x * 100) + '%'; }));

    body.appendChild(h('div', 'set-sec', 'Redeem code'));
    var rrow = h('div', 'set-btns'), rin = h('input', 'save-box'); rin.type = 'text'; rin.placeholder = 'Enter code'; rin.maxLength = 24; rin.setAttribute('autocapitalize', 'characters'); rin.setAttribute('autocomplete', 'off'); rin.setAttribute('spellcheck', 'false'); rin.style.cssText = 'flex:1;min-width:0;height:44px;text-transform:uppercase';
    var rbtn = h('button', 'btn btn-primary', 'Redeem'), rmsg = h('div', 'set-status', '');
    rbtn.addEventListener('click', function () {
      var code = (rin.value || '').trim().toUpperCase(), c = CODES[code], s0 = (G.save && G.save.state) || null;
      if (!code) { rmsg.textContent = 'Type a code first.'; return; }
      if (!c || !s0) { rmsg.textContent = 'Invalid code.'; try { G.audio.play('error'); } catch (e) {} return; }
      s0.redeemed = s0.redeemed || [];
      if (s0.redeemed.indexOf(code) >= 0) { rmsg.textContent = 'Code already used.'; try { G.audio.play('error'); } catch (e) {} return; }
      s0.redeemed.push(code); s0.cash += c.cash; s0.gold += c.gold; s0.gems += c.gems;
      try { if (s0.stats) s0.stats.totalCash += c.cash; } catch (e) {}
      try { G.save.save(); } catch (e) {} try { G.ui.update(true); } catch (e) {} try { G.audio.play('buy'); } catch (e) {}
      rin.value = ''; rmsg.textContent = 'Code accepted: +100aa cash, +1M gold, +1M gems!';
    });
    rrow.appendChild(rin); rrow.appendChild(rbtn); body.appendChild(rrow); body.appendChild(rmsg);

    body.appendChild(h('div', 'set-sec', 'Save data'));
    var status = h('div', 'set-status', o.status || 'Progress is saved automatically on this device.');
    var ta = h('textarea', 'save-box'); ta.rows = 3; ta.placeholder = 'Export shows your save string here. Paste one to import.'; ta.setAttribute('spellcheck', 'false'); ta.setAttribute('aria-label', 'Save string');
    body.appendChild(ta);
    var row = h('div', 'set-btns');
    var ex = h('button', 'btn btn-secondary', 'Export'), im = h('button', 'btn btn-secondary', 'Import'), rs = h('button', 'btn btn-secondary danger', 'Reset');
    ex.addEventListener('click', function () {
      sfxClick(); try { G.save.save(); } catch (e) {}
      ta.value = G.save.exportString(); ta.focus(); ta.select();
      var done = function () { status.textContent = 'Save string copied to clipboard.'; };
      var fail = function () { status.textContent = 'Select the text above and copy it.'; };
      try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(done, fail); else { document.execCommand('copy') ? done() : fail(); } } catch (e) { fail(); }
    });
    im.addEventListener('click', function () {
      sfxClick();
      if (!ta.value.trim()) { status.textContent = 'Paste a save string first.'; return; }
      if (G.save.importString(ta.value)) { afterChange(); repaint('Save imported.'); } else status.textContent = 'That save string is not valid.';
    });
    row.appendChild(ex); row.appendChild(im); row.appendChild(rs); body.appendChild(row);
    var conf = h('div', 'set-confirm'); conf.hidden = true;
    conf.appendChild(h('div', 'set-warn', 'Erase ALL progress? Businesses, crew, gear and currency are lost for good.'));
    var cr = h('div', 'set-btns'), no = h('button', 'btn btn-secondary', 'Cancel'), yes = h('button', 'btn btn-secondary danger', 'Yes, erase');
    cr.appendChild(no); cr.appendChild(yes); conf.appendChild(cr); body.appendChild(conf);
    rs.addEventListener('click', function () { sfxClick(); conf.hidden = false; row.hidden = true; });
    no.addEventListener('click', function () { sfxClick(); conf.hidden = true; row.hidden = false; });
    yes.addEventListener('click', function () {
      sfxClick();
      var keep = {}, s0 = st(); if (s0) Object.keys(DEFAULTS).forEach(function (k) { keep[k] = s0[k]; });
      G.save.reset(); var s1 = st(); if (s1) Object.keys(keep).forEach(function (k) { s1[k] = keep[k]; }); try { G.save.save(); } catch (e) {}
      afterChange(); repaint('Progress erased.');
    });
    body.appendChild(status);

    var foot = h('div', 'set-foot'); var cl = h('button', 'btn btn-primary', 'Close'); cl.setAttribute('data-act', 'close');
    cl.addEventListener('click', function () { sfxClick(); close(); });
    foot.appendChild(cl); p.appendChild(foot);

    // after import/reset the controls must reflect the new values: reopen in place
    function repaint(msg) { var cb = p._onClose; close(true); open({ onClose: cb, status: msg }); }
    function afterChange() { apply(); try { if (G.ui && G.ui.rebuildAll) G.ui.rebuildAll(); } catch (e) {} }

    function onKey(ev) { if (ev.code === 'Escape') { ev.stopPropagation(); close(); } }
    document.addEventListener('keydown', onKey, true);
    p._closeFn = function () { document.removeEventListener('keydown', onKey, true); };
    p._onClose = o.onClose;
    root.appendChild(p); panel = p;
    requestAnimationFrame(function () { p.classList.add('in'); });
    return p;
  }
  function close(silent) {
    if (!panel) return;
    var p = panel; panel = null;
    try { p._closeFn(); } catch (e) {}
    if (p.parentNode) p.parentNode.removeChild(p);
    if (!silent && p._onClose) { try { p._onClose(); } catch (e) {} }
  }

  G.settings = { defaults: DEFAULTS, get: get, set: set, apply: apply, open: open, close: close, vibrate: vibrate, isOpen: function () { return !!panel; } };
  ensure(); apply();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fpsUpdate); else fpsUpdate();
})();
