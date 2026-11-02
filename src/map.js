/* Hub map (hex hotspots over the London map) + business interior screen. Exposes G.map. */
window.G = window.G || {};
(function () {
  'use strict';
  var M = window.G_MANIFEST || {};
  var MAP = M.map || { img: 'assets/bg/map_hex.jpg', w: 1536, h: 1024, hexes: [], locked: [] };
  var MW = MAP.w || 1536, MH = MAP.h || 1024;
  var $ = function (id) { return document.getElementById(id); };
  function h(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function sfx(n) { try { if (G.audio && G.audio.play) G.audio.play(n); } catch (e) {} }
  function setText(el, t) { if (el._t !== t) { el._t = t; el.textContent = t; } }
  function setCls(el, c, on) { if (el._c === undefined) el._c = {}; if (el._c[c] !== on) { el._c[c] = on; el.classList.toggle(c, !!on); } }
  function setDis(el, d) { d = !!d; if (el._d !== d) { el._d = d; el.disabled = d; el.classList.toggle('is-off', d); } }
  function setHide(el, v) { v = !!v; if (el._h !== v) { el._h = v; el.hidden = v; } }
  function money(n) { return '$' + G.economy.fmt(n); }
  function file(g, k, s) { try { var e = M[g][k]; if (s != null) e = e[s]; return e && e.file ? e.file : ''; } catch (x) { return ''; } }
  function img(src, cls) { var i = new Image(); i.src = src; i.alt = ''; i.draggable = false; if (cls) i.className = cls; return i; }

  // ---- rarity tiers by business level (config override: G.config.bizRarity = [[minLevel, id], ...] ascending) ----
  var TIERS = [[0, 'common'], [25, 'uncommon'], [50, 'rare'], [100, 'epic'], [200, 'legendary'], [300, 'ultra']];
  var RCOL = { common: '#9aa0a6', uncommon: '#4caf50', rare: '#3b8fe0', epic: '#a45ee0', legendary: '#ff9a1f', ultra: '#ff2f3d' };
  var RNAME = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legendary: 'Legendary', ultra: 'Ultra' };
  function tiers() { try { return (G.config && G.config.bizRarity) || TIERS; } catch (e) { return TIERS; } }
  function rarityOf(L) { var t = tiers(), id = t[0][1]; for (var i = 0; i < t.length; i++) if (L >= t[i][0]) id = t[i][1]; return id; }
  // interior art tier: L1 < 25, L2 < 100, L3 beyond
  function interiorTier(L) { return L >= 100 ? 3 : L >= 25 ? 2 : 1; }

  var SQ3 = Math.sqrt(3);
  function hexNorm(dx, dy, R) { dx = Math.abs(dx); dy = Math.abs(dy); return Math.max(dy / (SQ3 / 2), dx + dy / SQ3) / R; }

  var vp, world, mapEl = {}, hexEls = {}, btn, btnLab, selId = null, view = { x: 0, y: 0, s: 1 }, lastSnap = null, built = false;
  var allHex = [];

  // ---------- voronoi hex masks (no pixel reads from the map -> works on file://) ----------
  function buildMasks() {
    var cs = allHex;
    cs.forEach(function (c) {
      var R = c.r * MW, ry = R * SQ3 / 2, pad = 10;
      c.R = R; c.px = c.cx * MW; c.py = c.cy * MH;
      c.x0 = Math.floor(c.px - R - pad); c.y0 = Math.floor(c.py - ry - pad);
      c.w = Math.ceil(2 * R + 2 * pad); c.h = Math.ceil(2 * ry + 2 * pad);
      var cv = document.createElement('canvas'); cv.width = c.w; cv.height = c.h;
      var ctx = cv.getContext('2d'), id = ctx.createImageData(c.w, c.h), d = id.data, nm = new Float32Array(c.w * c.h);
      for (var y = 0; y < c.h; y++) for (var x = 0; x < c.w; x++) {
        var gx = c.x0 + x, gy = c.y0 + y, mine = hexNorm(gx - c.px, gy - c.py, R), best = true;
        if (mine > 1.07) { nm[y * c.w + x] = 9; continue; }
        for (var k = 0; k < cs.length; k++) {
          var o = cs[k]; if (o === c) continue;
          var n2 = hexNorm(gx - o.cx * MW, gy - o.cy * MH, o.r * MW);
          if (n2 < mine) { best = false; break; }
        }
        if (!best) { nm[y * c.w + x] = 9; continue; }
        nm[y * c.w + x] = mine;
        var i = (y * c.w + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = mine <= 1.0 ? 255 : Math.round(255 * (1.07 - mine) / 0.07);
      }
      ctx.putImageData(id, 0, 0);
      c.mask = cv.toDataURL('image/png'); c.norm = nm;
    });
  }
  function drawGlow(c, color) {
    var ctx = c.glow.getContext('2d'), id = ctx.createImageData(c.w, c.h), d = id.data, nm = c.norm;
    var rgb = [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16)];
    for (var i = 0; i < nm.length; i++) {
      var n = nm[i]; if (n > 1.06 || n < 0.9) continue;
      var a = n < 0.97 ? (n - 0.9) / 0.07 : n > 1.0 ? (1.06 - n) / 0.06 : 1;
      d[i * 4] = rgb[0]; d[i * 4 + 1] = rgb[1]; d[i * 4 + 2] = rgb[2]; d[i * 4 + 3] = Math.round(255 * a * 0.95);
    }
    ctx.putImageData(id, 0, 0); c.glowColor = color;
  }

  // ---------- build map ----------
  function build(pane) {
    pane.innerHTML = '';
    vp = h('div', 'map-vp'); world = h('div', 'map-world');
    world.style.width = MW + 'px'; world.style.height = MH + 'px';
    var base = img(MAP.img, 'map-img'); world.appendChild(base);
    allHex = [];
    MAP.hexes.forEach(function (c) { var o = { biz: c.biz, cx: c.cx, cy: c.cy, r: c.r }; allHex.push(o); });
    MAP.locked.forEach(function (c, i) { allHex.push({ biz: null, fut: i, cx: c.cx, cy: c.cy, r: c.r }); });
    buildMasks();
    allHex.forEach(function (c) {
      var el = h('div', 'hx' + (c.biz ? '' : ' hx-future'));
      el.style.cssText = 'left:' + c.x0 + 'px;top:' + c.y0 + 'px;width:' + c.w + 'px;height:' + c.h + 'px;';
      var inner = h('div', 'hx-in');
      var art = h('div', 'hx-art');
      art.style.backgroundImage = 'url("' + MAP.img + '")';
      art.style.backgroundPosition = (-c.x0) + 'px ' + (-c.y0) + 'px';
      art.style.webkitMaskImage = art.style.maskImage = 'url(' + c.mask + ')';
      art.style.webkitMaskSize = art.style.maskSize = '100% 100%';
      inner.appendChild(art);
      var gl = document.createElement('canvas'); gl.width = c.w; gl.height = c.h; gl.className = 'hx-glow'; inner.appendChild(gl); c.glow = gl;
      var lk = img(file('icons', 'lock'), 'hx-lock'); inner.appendChild(lk);
      var badge = h('div', 'hx-badge'); inner.appendChild(badge);
      el.appendChild(inner); world.appendChild(el);
      c.el = el; c.inner = inner; c.art = art; c.lock = lk; c.badge = badge;
      if (c.biz) hexEls[c.biz] = c;
    });
    btn = h('button', 'map-btn'); btnLab = h('span', 'mb-l'); var bc = h('span', 'mb-c'); btn.appendChild(btnLab); btn.appendChild(bc); btn._c2 = bc;
    btn.hidden = true; world.appendChild(btn);
    btn.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    btn.addEventListener('click', function (e) { e.stopPropagation(); onBtn(); });
    vp.appendChild(world); pane.appendChild(vp);
    wirePan();
    built = true; fitView(true);
    window.addEventListener('resize', function () { setTimeout(function () { fitView(false); }, 60); });
  }

  // ---------- pan ----------
  function vpSize() { return { w: vp.clientWidth || 540, h: vp.clientHeight || 700 }; }
  function minScale() { var v = vpSize(); return Math.max(v.w / MW, v.h / MH); }
  function clamp() {
    var v = vpSize(), sw = MW * view.s, sh = MH * view.s;
    view.x = sw <= v.w ? (v.w - sw) / 2 : Math.min(0, Math.max(v.w - sw, view.x));
    view.y = sh <= v.h ? (v.h - sh) / 2 : Math.min(0, Math.max(v.h - sh, view.y));
  }
  function apply(anim) {
    world.classList.toggle('anim', !!anim);
    world.style.transform = 'translate(' + view.x.toFixed(1) + 'px,' + view.y.toFixed(1) + 'px) scale(' + view.s.toFixed(4) + ')';
    if (btn) btn.style.setProperty('--inv', (1 / view.s).toFixed(4));
  }
  function fitView(first) {
    if (!vp) return;
    var ms = minScale(), v = vpSize();
    if (first || view.s < ms || !view.init) {
      view.s = ms; view.init = true;
      // centre on the first unlocked/owned business, else map centre
      var c = hexEls.pub; view.x = v.w / 2 - (c ? c.px : MW / 2) * ms; view.y = v.h / 2 - (c ? c.py : MH / 2) * ms;
    }
    clamp(); apply(false);
  }
  function wirePan() {
    var d = null;
    vp.addEventListener('pointerdown', function (e) {
      var k = ui_scale();
      d = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y, moved: false, k: k };
      try { vp.setPointerCapture(e.pointerId); } catch (x) {}
    });
    vp.addEventListener('pointermove', function (e) {
      if (!d || e.pointerId !== d.id) return;
      var dx = (e.clientX - d.sx) / d.k, dy = (e.clientY - d.sy) / d.k;
      if (!d.moved && Math.abs(dx) + Math.abs(dy) < 6) return;
      d.moved = true; view.x = d.ox + dx; view.y = d.oy + dy; clamp(); apply(false);
    });
    function up(e) {
      if (!d || e.pointerId !== d.id) return;
      var wasMove = d.moved; d = null;
      if (wasMove) return;
      var r = vp.getBoundingClientRect(), k = ui_scale();
      tapAt((e.clientX - r.left) / k, (e.clientY - r.top) / k);
    }
    vp.addEventListener('pointerup', up);
    vp.addEventListener('pointercancel', function () { d = null; });
  }
  function ui_scale() { return (G.ui && G.ui.scale) || 1; }
  function tapAt(x, y) {
    var wx = (x - view.x) / view.s, wy = (y - view.y) / view.s, best = null, bn = 1.0;
    allHex.forEach(function (c) { var n = hexNorm(wx - c.px, wy - c.py, c.R); if (n < bn) { bn = n; best = c; } });
    if (best && best.biz) select(best.biz); else if (best) { sfx('click'); select(null); } else select(null);
  }

  function select(id) {
    if (selId === id) return;
    if (selId && hexEls[selId]) hexEls[selId].el.classList.remove('sel');
    selId = id;
    if (id) {
      sfx('click'); var c = hexEls[id]; c.el.classList.add('sel');
      var v = vpSize(), sx = view.x + c.px * view.s, sy = view.y + c.py * view.s, mx = v.w * 0.22, my = v.h * 0.18, ch = false;
      if (sx < mx || sx > v.w - mx) { view.x += v.w / 2 - sx; ch = true; }
      if (sy < my || sy > v.h - my * 2.4) { view.y += v.h * 0.42 - sy; ch = true; }
      if (ch) { clamp(); apply(true); }
      btn.style.left = c.px + 'px'; btn.style.top = (c.py + c.R * SQ3 / 2 * 0.98) + 'px'; btn.hidden = false;
      btn.classList.remove('in'); void btn.offsetWidth; btn.classList.add('in');
    } else btn.hidden = true;
    if (lastSnap) paintBtn(lastSnap);
  }
  function bizSnap(snap, id) { return snap && snap.businesses.filter(function (b) { return b.id === id; })[0]; }
  function paintBtn(snap) {
    if (!selId) return;
    var b = bizSnap(snap, selId); if (!b) return;
    if (b.owned) { setText(btnLab, 'Manage'); setText(btn._c2, ''); setDis(btn, false); setCls(btn, 'unlock', false); }
    else {
      setCls(btn, 'unlock', true);
      if (b.state === 'locked') { var prev = snap.businesses[b.index - 1]; setText(btnLab, 'Open ' + (prev ? prev.name : 'previous') + ' first'); setText(btn._c2, ''); setDis(btn, true); }
      else { setText(btnLab, 'Unlock'); setText(btn._c2, money(b.cost1)); setDis(btn, !b.canAfford); }
    }
  }
  function onBtn() {
    if (!selId || !lastSnap) return;
    var b = bizSnap(lastSnap, selId); if (!b) return;
    if (b.owned) { openInterior(selId); return; }
    if (G.economy.buy(selId, 1)) {
      sfx('buy'); try { G.save.save(); } catch (e) {}
      if (G.ui) { G.ui.float('Unlocked', btn, 'f-lv'); G.ui.update(true); }
      setTimeout(function () { openInterior(selId); }, 350);
    } else { sfx('hurt'); if (G.ui) G.ui.shake(btn); }
  }

  // ---------- update ----------
  function update(snap) {
    lastSnap = snap;
    if (built) {
      var vs = vp.clientWidth + 'x' + vp.clientHeight; if (vs !== view.vs && vp.clientHeight > 50) { view.vs = vs; view.init = false; fitView(true); }
      allHex.forEach(function (c) {
        if (!c.biz) { setCls(c.el, 'is-owned', false); return; }
        var b = bizSnap(snap, c.biz); if (!b) return;
        var owned = b.owned, col = RCOL[rarityOf(b.level)];
        setCls(c.el, 'is-owned', owned); setCls(c.el, 'is-off', !owned);
        if (owned && c.glowColor !== col) drawGlow(c, col);
        if (owned) { c.inner.style.setProperty('--rc', col); setText(c.badge, 'Lv ' + b.level); }
      });
      paintBtn(snap);
    }
    if (intr.open) updInterior(snap);
  }

  // ---------- interior ----------
  var intr = { open: false, id: null, tier: 0, front: 0 }, IE = {};
  function buildInterior() {
    if (IE.root) return;
    var r = h('section', 'screen intr'); r.id = 'scr-interior'; r.hidden = true;
    var bg = h('div', 'intr-bg'); r.appendChild(bg);
    var scene = h('div', 'intr-scene');
    IE.a = img('', 'intr-img'); IE.b = img('', 'intr-img'); scene.appendChild(IE.a); scene.appendChild(IE.b);
    IE.mgr = img('', 'intr-mgr'); scene.appendChild(IE.mgr);
    r.appendChild(scene);
    var head = h('div', 'intr-head');
    IE.back = h('button', 'intr-back'); IE.back.setAttribute('aria-label', 'Back to map'); IE.back.appendChild(h('span', '', 'Map'));
    var tt = h('div', 'intr-title'); IE.name = h('div', 'intr-name'); var sub = h('div', 'intr-sub');
    IE.lv = h('span', 'intr-lv'); IE.rar = h('span', 'intr-rar'); IE.inc = h('span', 'intr-inc'); sub.appendChild(IE.lv); sub.appendChild(IE.rar); sub.appendChild(IE.inc);
    tt.appendChild(IE.name); tt.appendChild(sub);
    IE.cash = h('div', 'intr-cash'); IE.cashV = h('b'); IE.cash.appendChild(h('i', 'ci ci-cash sm')); IE.cash.appendChild(IE.cashV);
    head.appendChild(IE.back); head.appendChild(tt); head.appendChild(IE.cash); r.appendChild(head);
    var panel = h('div', 'intr-panel');
    var modes = h('div', 'intr-modes'); IE.modes = [];
    [['1', 'x1'], ['10', 'x10'], ['100', 'x100'], ['max', 'Max']].forEach(function (m) {
      var b = h('button', '', m[1]); b.setAttribute('data-m', m[0]); modes.appendChild(b); IE.modes.push(b);
      b.addEventListener('click', function () { G.ui.mode = m[0]; sfx('click'); G.ui.update(true); });
    });
    panel.appendChild(modes);
    var row = h('div', 'intr-row');
    IE.buy = h('button', 'btn btn-primary intr-buy'); IE.bl = h('span', 'buy-l'); IE.bc = h('span', 'buy-c'); IE.buy.appendChild(IE.bl); IE.buy.appendChild(IE.bc);
    IE.mg = h('button', 'btn btn-secondary intr-hire'); IE.mgl = h('span', 'buy-l'); IE.mgc = h('span', 'buy-c'); IE.mg.appendChild(IE.mgl); IE.mg.appendChild(IE.mgc);
    row.appendChild(IE.buy); row.appendChild(IE.mg); panel.appendChild(row);
    IE.bar = h('div', 'bar collect'); IE.fill = h('div', 'bar-fill'); IE.bt = h('span', 'bar-text'); IE.bar.appendChild(IE.fill); IE.bar.appendChild(IE.bt); panel.appendChild(IE.bar);
    IE.ms = h('div', 'intr-ms'); panel.appendChild(IE.ms);
    r.appendChild(panel);
    $('stage').appendChild(r); IE.root = r; IE.panel = panel;
    IE.back.addEventListener('click', function () { sfx('click'); closeInterior(); });
    IE.buy.addEventListener('click', function () {
      var b = bizSnap(lastSnap, intr.id); if (!b) return;
      var n = b.level < 1 ? 1 : (G.ui.mode === 'max' ? 'max' : +G.ui.mode), got = G.economy.buy(intr.id, n);
      if (got) { sfx('buy'); G.ui.float('+' + got + ' Lv', IE.buy, 'f-lv'); pop(); G.ui.update(true); } else { sfx('hurt'); G.ui.shake(IE.buy); }
    });
    IE.mg.addEventListener('click', function () {
      if (G.economy.hireManager(intr.id)) {
        sfx('buy'); G.ui.float('Manager hired', IE.mg, 'f-lv'); try { G.save.save(); } catch (e) {} G.ui.update(true);
        try { G.story.playHire(intr.id); } catch (e) {}
      } else G.ui.shake(IE.mg);
    });
    IE.bar.addEventListener('click', function () {
      var got = G.economy.collect(intr.id);
      if (got > 0) { sfx('coin'); G.ui.float('+' + money(got), IE.bar, 'f-cash'); smirk(); G.ui.update(true); }
    });
  }
  var smirkT = 0;
  function smirk() { var s = file('managers', intr.id, 'smirk'); if (s) { IE.mgr.src = s; clearTimeout(smirkT); smirkT = setTimeout(function () { IE.mgr.src = file('managers', intr.id, 'neutral'); }, 900); } }
  function pop() { IE.root.classList.remove('pop'); void IE.root.offsetWidth; IE.root.classList.add('pop'); }
  function setInteriorImg(id, tier, instant) {
    var src = MAP.interior ? MAP.interior(id, tier) : 'assets/interiors/' + id + '_L' + tier + '.webp';
    var front = intr.front ? IE.b : IE.a, back = intr.front ? IE.a : IE.b;
    if (instant || !intr.tier) { front.src = src; front.classList.add('on'); back.classList.remove('on'); }
    else {
      back.src = src; back.classList.add('on'); front.classList.remove('on'); intr.front = intr.front ? 0 : 1;
    }
    intr.tier = tier;
  }
  function openInterior(id) {
    buildInterior();
    intr.id = id; intr.open = true; intr.tier = 0; intr.front = 0;
    var b = bizSnap(lastSnap, id), tier = interiorTier(b ? b.level : 1);
    IE.mgr.src = file('managers', id, 'neutral');
    setInteriorImg(id, tier, true);
    IE.root.hidden = false; IE.root.classList.remove('out'); IE.root.classList.add('in');
    updInterior(lastSnap);
    // preload other tiers lazily
    [1, 2, 3].forEach(function (t) { if (t !== tier) { var i = new Image(); i.src = MAP.interior(id, t); } });
    var seen = false; try { seen = G.story.seenBiz(id); } catch (e) { seen = true; }
    if (!seen) setTimeout(function () { try { G.story.playBiz(id); } catch (e) {} }, 450);
    sfx('click');
  }
  function closeInterior() {
    if (!intr.open) return; intr.open = false; IE.root.classList.remove('in'); IE.root.classList.add('out');
    setTimeout(function () { if (!intr.open) IE.root.hidden = true; }, 220);
    G.ui.update(true);
  }
  function updInterior(snap) {
    var b = bizSnap(snap, intr.id); if (!b) return;
    var mode = G.ui.mode, tier = interiorTier(b.level), rid = rarityOf(b.level);
    if (tier !== intr.tier) setInteriorImg(intr.id, tier, false);
    setText(IE.name, b.name); setText(IE.lv, 'Lv ' + b.level);
    setText(IE.rar, RNAME[rid]); IE.rar.style.color = RCOL[rid]; IE.root.style.setProperty('--rc', RCOL[rid]);
    setText(IE.inc, '+' + money(b.income) + '/s'); setText(IE.cashV, G.economy.fmt(Math.floor(snap.cash)));
    IE.modes.forEach(function (m) { setCls(m, 'on', m.getAttribute('data-m') === mode); });
    var n = 1, cost = b.cost1, can;
    if (mode === '10') { n = 10; cost = b.cost10; } else if (mode === '100') { n = 100; cost = b.cost100; } else if (mode === 'max') { n = Math.max(1, b.maxN); cost = b.costMax; }
    can = snap.cash >= cost && (mode !== 'max' || b.maxN > 0);
    setText(IE.bl, mode === 'max' ? 'Max x' + (b.maxN || 0) : 'Buy x' + n); setText(IE.bc, money(cost)); setDis(IE.buy, !can);
    var mgr = b.manager;
    setText(IE.mgl, mgr.hired ? 'Manager' : 'Hire manager'); setText(IE.mgc, mgr.hired ? 'On the job' : money(mgr.cost));
    setDis(IE.mg, mgr.hired || !mgr.canAfford); setCls(IE.mg, 'hired', mgr.hired);
    if (mgr.hired) {
      setCls(IE.bar, 'auto', true); setCls(IE.bar, 'ready', false); setText(IE.bt, 'Running itself');
      if (IE.fill._w !== '100') { IE.fill._w = '100'; IE.fill.style.width = '100%'; }
    } else {
      setCls(IE.bar, 'auto', false);
      var p = b.accCap > 0 ? Math.min(1, b.acc / b.accCap) : 0, pw = (p * 100).toFixed(1);
      if (IE.fill._w !== pw) { IE.fill._w = pw; IE.fill.style.width = pw + '%'; }
      setCls(IE.bar, 'ready', b.acc > 0.5); setText(IE.bt, b.acc > 0.5 ? 'Collect ' + money(b.acc) : 'Nothing to collect yet');
    }
    var ms = b.milestone; setText(IE.ms, ms ? 'Income x' + ms.mult + ' at Lv ' + ms.next + '  -  ' + ms.toGo + ' to go' : 'All milestones reached');
  }

  G.map = { build: build, update: update, openInterior: openInterior, closeInterior: closeInterior, rarityOf: rarityOf, interiorTier: interiorTier,
    _pos: function (id) { var c = hexEls[id], r = vp.getBoundingClientRect(), k = ui_scale(); return [r.left + (view.x + c.px * view.s) * k, r.top + (view.y + c.py * view.s) * k]; },
    isInteriorOpen: function () { return intr.open; }, select: select, TIERS: TIERS, RCOL: RCOL,
    preloadFiles: function () { return [MAP.img]; } };
})();
