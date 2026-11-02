/* Hub UI: DOM screens, lists updated in place at ~10Hz. Exposes G.ui. */
window.G = window.G || {};
(function () {
  'use strict';
  var M = window.G_MANIFEST || {};
  var E = function () { return G.economy; };
  var S = function () { return G.save.state; };
  var $ = function (id) { return document.getElementById(id); };

  function h(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function sfx(n) { try { if (G.audio && G.audio.play) G.audio.play(n); } catch (e) {} }
  function fmt(n) { return E().fmt(n); }
  function money(n) { return '$' + fmt(n); }
  function file(group, key, sub) {
    try { var e = M[group][key]; if (sub != null) e = e[sub]; return e && e.file ? e.file : ''; } catch (x) { return ''; }
  }
  function img(src, cls) { var i = new Image(); i.src = src; i.alt = ''; i.draggable = false; if (cls) i.className = cls; return i; }
  function setText(el, t) { if (el._t !== t) { el._t = t; el.textContent = t; } }
  function setCls(el, c, on) { if (el._c === undefined) el._c = {}; if (el._c[c] !== on) { el._c[c] = on; el.classList.toggle(c, !!on); } }
  function setDis(el, d) { d = !!d; if (el._d !== d) { el._d = d; el.disabled = d; el.classList.toggle('is-off', d); } }
  function setHide(el, hd) { hd = !!hd; if (el._h !== hd) { el._h = hd; el.hidden = hd; } }
  function tap(el, fn) { el.addEventListener('click', function (ev) { fn(ev); }); }

  var BIZ_NAME = {};
  var WEAPON_NAMES = {}, STAT_NAMES = {}, STAT_DESC = {};
  try { var AC = G.ARENA_CFG; for (var w in AC.WEAPONS) WEAPON_NAMES[w] = AC.WEAPONS[w].name; for (var s in AC.STATS) { STAT_NAMES[s] = AC.STATS[s].name; STAT_DESC[s] = AC.STATS[s].desc; } } catch (e) {}
  function prettyId(id) { return id.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  function weaponName(id) { return WEAPON_NAMES[id] || prettyId(id); }
  function statName(id) { return STAT_NAMES[id] || prettyId(id); }

  var RARITY = ['gray', 'gray', 'green', 'green', 'blue', 'blue', 'purple', 'purple', 'orange', 'red'];

  var ui = { mode: '1', tab: 'raid', scale: 1 };
  var bizEls = {}, crewEls = {}, wEls = {}, pEls = {}, shopEls = {}, raidEls = {};
  var disp = { cash: 0, gold: 0, gems: 0, respect: 0 };
  var lastSnap = null, seenBiz = {};

  // ---------- layout ----------
  ui.layout = function () {
    var st = $('stage'), vw = window.innerWidth, vh = window.innerHeight;
    var s = Math.min(vw / 540, vh / 800);
    var H = Math.max(800, Math.min(1180, vh / s));
    var W = 540;
    if (vw / s > 540 && vw / vh > 0.75) { /* wide screen: keep portrait column */ }
    ui.scale = s; ui.H = H;
    st.style.width = W + 'px'; st.style.height = H + 'px';
    st.style.transform = 'translate(-50%,-50%) scale(' + s + ')';
    var ar = $('scr-arena'), as = Math.min(1, H / 960);
    ar.style.transform = 'translate(-50%,-50%) scale(' + as + ')';
  };

  // ---------- floating text ----------
  ui.float = function (text, elOrXY, cls) {
    var root = $('fx-root'), st = $('stage').getBoundingClientRect(), x, y;
    if (elOrXY && elOrXY.getBoundingClientRect) {
      var r = elOrXY.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + r.height * 0.3;
    } else { x = elOrXY[0]; y = elOrXY[1]; }
    var f = h('div', 'float ' + (cls || ''), text);
    f.style.left = ((x - st.left) / ui.scale) + 'px'; f.style.top = ((y - st.top) / ui.scale) + 'px';
    root.appendChild(f);
    setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 1200);
  };
  ui.toast = function (msg) {
    var t = h('div', 'toast', msg); $('fx-root').appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 1800);
  };

  // ---------- modal ----------
  var modalCount = 0;
  ui.modal = function (o) {
    var root = $('modal-root');
    var back = h('div', 'modal-back'), box = h('div', 'modal ' + (o.cls || ''));
    var rib = h('div', 'modal-title', o.title || ''); box.appendChild(rib);
    if (o.closable) { var x = h('button', 'close-x'); x.setAttribute('aria-label', 'Close'); tap(x, function () { sfx('click'); close(); }); box.appendChild(x); }
    var body = h('div', 'modal-body'); box.appendChild(body);
    if (o.body) o.body(body);
    var foot = null;
    if (o.buttons && o.buttons.length) {
      foot = h('div', 'modal-foot');
      o.buttons.forEach(function (b) {
        var bt = h('button', 'btn ' + (b.cls || 'btn-primary'));
        if (b.html) bt.innerHTML = b.html; else bt.textContent = b.text;
        tap(bt, function () { sfx('click'); if (b.fn && b.fn(bt) === false) return; if (!b.keep) close(); });
        foot.appendChild(bt);
      });
      box.appendChild(foot);
    }
    back.appendChild(box); root.appendChild(back);
    requestAnimationFrame(function () { back.classList.add('in'); });
    function close() { if (back.parentNode) back.parentNode.removeChild(back); if (o.onClose) o.onClose(); }
    return { el: box, body: body, close: close };
  };

  // ---------- count-up ----------
  ui.countUp = function (el, to, ms, pre) {
    var t0 = performance.now(); pre = pre || '';
    function f(now) {
      var k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      el.textContent = pre + fmt(to * e);
      if (k < 1) requestAnimationFrame(f); else el.textContent = pre + fmt(to);
    }
    requestAnimationFrame(f);
  };

  // ---------- build: businesses ----------
  function artLevel(L) { return L >= 100 ? 3 : L >= 25 ? 2 : 1; }
  function bizThumb(id, L) { return file('businesses', id, artLevel(L)) ? (M.businesses[id][artLevel(L)].thumb || M.businesses[id][artLevel(L)]).file : ''; }

  function buildBiz() {
    var list = $('biz-list'); list.innerHTML = '';
    E().bizList().forEach(function (id) {
      var c = h('div', 'biz card'); c.setAttribute('data-biz', id);
      var art = h('div', 'biz-art'); var im = img(bizThumb(id, 1)); art.appendChild(im);
      var lk = h('i', 'biz-lock'); art.appendChild(lk);
      var main = h('div', 'biz-main');
      var top = h('div', 'biz-top');
      var name = h('div', 'biz-name'); var lv = h('div', 'biz-lv');
      top.appendChild(name); top.appendChild(lv);
      var inc = h('div', 'biz-inc');
      var bar = h('div', 'bar collect'); var fill = h('div', 'bar-fill'); var bt = h('span', 'bar-text'); bar.appendChild(fill); bar.appendChild(bt);
      var ms = h('div', 'biz-ms');
      var acts = h('div', 'biz-acts');
      var buy = h('button', 'btn btn-primary buy'); var bl = h('span', 'buy-l'); var bc = h('span', 'buy-c'); buy.appendChild(bl); buy.appendChild(bc);
      var mg = h('button', 'btn btn-secondary mgr');
      var mi = img(file('managers', id, 'icon'), 'mgr-ic'); var mc = h('span', 'mgr-c'); mg.appendChild(mi); mg.appendChild(mc);
      acts.appendChild(buy); acts.appendChild(mg);
      main.appendChild(top); main.appendChild(inc); main.appendChild(bar); main.appendChild(acts);
      c.appendChild(art); c.appendChild(main); c.appendChild(ms);
      var dot = h('em', 'dot'); dot.hidden = true; c.appendChild(dot);
      list.appendChild(c);
      var el = { c: c, im: im, name: name, lv: lv, inc: inc, bar: bar, fill: fill, bt: bt, buy: buy, bl: bl, bc: bc, mg: mg, mc: mc, dot: dot, art: art, ms: ms };
      bizEls[id] = el;
      tap(buy, function () {
        var snap = lastSnap && lastSnap.businesses.filter(function (b) { return b.id === id; })[0];
        var n = (!snap || snap.level < 1) ? 1 : (ui.mode === 'max' ? 'max' : +ui.mode);
        var bought = E().buy(id, n);
        if (bought) {
          sfx('buy'); seenBiz[id] = true; ui.float('+' + bought + ' Lv', buy, 'f-lv');
          c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); ui.update(true);
        } else { sfx('hurt'); ui.shake(buy); }
      });
      tap(mg, function () {
        if (E().hireManager(id)) { sfx('buy'); ui.float('Manager hired', mg, 'f-lv'); ui.update(true); } else ui.shake(mg);
      });
      tap(bar, function () {
        var got = E().collect(id);
        if (got > 0) { sfx('coin'); ui.float('+' + money(got), bar, 'f-cash'); ui.update(true); }
      });
    });
  }

  ui.shake = function (el) { el.classList.remove('nope'); void el.offsetWidth; el.classList.add('nope'); };

  function updBiz(snap) {
    var mode = ui.mode, anyNew = false;
    snap.businesses.forEach(function (b) {
      var el = bizEls[b.id]; if (!el) return;
      var vis = b.visible || b.owned;
      setHide(el.c, !vis);
      if (!vis) return;
      var locked = b.state === 'locked', owned = b.owned;
      setCls(el.c, 'is-locked', locked); setCls(el.c, 'is-owned', owned); setCls(el.c, 'is-avail', b.state === 'available');
      var src = bizThumb(b.id, Math.max(1, b.level));
      if (el.im._s !== src) { el.im._s = src; el.im.src = src; }
      setText(el.name, locked ? 'Locked' : b.name);
      setText(el.lv, owned ? 'Lv ' + b.level : '');
      var prev = b.index > 0 ? snap.businesses[b.index - 1].name : '';
      var ms = b.milestone;
      if (locked) setText(el.inc, 'Open ' + prev + ' first');
      else if (!owned) setText(el.inc, 'Opens at +' + money(b.incomeNext) + '/s');
      else if (ms) setText(el.inc, '+' + money(b.income) + '/s   x2 at Lv ' + ms.next);
      else setText(el.inc, '+' + money(b.income) + '/s');
      // collect bar
      setHide(el.bar, !owned);
      if (owned) {
        if (b.manager.hired) {
          setCls(el.bar, 'auto', true); setCls(el.bar, 'ready', false);
          setText(el.bt, 'Running itself');
          if (el.fill._w !== '100') { el.fill._w = '100'; el.fill.style.width = '100%'; }
        } else {
          setCls(el.bar, 'auto', false);
          var p = b.accCap > 0 ? Math.min(1, b.acc / b.accCap) : 0, pw = (p * 100).toFixed(1);
          if (el.fill._w !== pw) { el.fill._w = pw; el.fill.style.width = pw + '%'; }
          setCls(el.bar, 'ready', b.acc > 0.5);
          setText(el.bt, b.acc > 0.5 ? 'Collect ' + money(b.acc) : 'Nothing yet');
        }
      }
      // buy button
      var n = 1, cost = b.cost1, label = owned ? 'Buy' : 'Open', can = b.canAfford;
      if (owned) {
        if (mode === '10') { n = 10; cost = b.cost10; } else if (mode === '100') { n = 100; cost = b.cost100; }
        else if (mode === 'max') { n = Math.max(1, b.maxN); cost = b.costMax; }
        label = 'Buy x' + n; can = snap.cash >= cost && (mode !== 'max' || b.maxN > 0);
        if (mode === 'max') label = 'Max x' + (b.maxN || 0);
      }
      setText(el.bl, locked ? 'Locked' : label); setText(el.bc, locked ? '' : money(cost));
      setDis(el.buy, locked || !can);
      // manager
      var mgr = b.manager;
      setHide(el.mg, !owned);
      if (owned) {
        setText(el.mc, mgr.hired ? 'Hired' : money(mgr.cost));
        setDis(el.mg, mgr.hired || !mgr.canAfford); setCls(el.mg, 'hired', mgr.hired);
      }
      if (b.state === 'available' && b.canAfford && !seenBiz[b.id]) anyNew = true;
      setHide(el.dot, !(b.state === 'available' && b.canAfford && !seenBiz[b.id]));
    });
    return anyNew;
  }

  // ---------- build: crew ----------
  function buildCrew() {
    var list = $('crew-list'); list.innerHTML = '';
    var sum = h('div', 'crew-sum card'); crewEls._sum = sum; list.appendChild(sum);
    E().bizList().forEach(function (id) {
      var man = (M.managers && M.managers[id]) || {}, def = G.crew.def(id);
      var r = h('div', 'crew card');
      var ic = h('div', 'crew-ic'); var im = img(file('managers', id, 'icon')); ic.appendChild(im);
      var mid = h('div', 'crew-main');
      var nm = h('div', 'crew-name', man.name || 'Manager');
      var of = h('div', 'crew-of'); var bn = h('div', 'crew-bonus'); var nx = h('div', 'crew-next');
      mid.appendChild(nm); mid.appendChild(of); mid.appendChild(bn); mid.appendChild(nx);
      var b = h('button', 'btn btn-primary hire'); var bl = h('span', 'buy-l'); var bc = h('span', 'buy-c'); b.appendChild(bl); b.appendChild(bc);
      r.appendChild(ic); r.appendChild(mid); r.appendChild(b); list.appendChild(r);
      crewEls[id] = { r: r, of: of, bn: bn, nx: nx, b: b, bl: bl, bc: bc, ic: ic, def: def };
      tap(b, function () {
        if (G.crew.hired(id)) {
          if (G.crew.levelUp(id)) { sfx('buy'); ui.float('Crew level up', b, 'f-lv'); G.save.save(); ui.update(true); } else ui.shake(b);
        } else if (E().hireManager(id)) { sfx('buy'); ui.float('Hired', b, 'f-lv'); G.save.save(); ui.update(true); } else ui.shake(b);
      });
    });
  }
  function updCrew(snap) {
    var any = false, act = [];
    snap.businesses.forEach(function (b) {
      var el = crewEls[b.id]; if (!el) return;
      var d = el.def, known = b.owned || b.unlocked, hired = b.manager.hired, L = G.crew.level(b.id);
      setCls(el.r, 'is-locked', !b.owned); setCls(el.r, 'is-hired', hired);
      setText(el.of, hired ? 'Crew Lv ' + L + ' / ' + G.crew.MAX_LEVEL + '  -  runs ' + b.name : (b.owned ? 'Runs ' + b.name : (known ? 'Open ' + b.name + ' to hire' : 'Locked')));
      if (hired) {
        setText(el.bn, G.crew.fmt(b.id, G.crew.valueAt(b.id, L)) + ' ' + d.label);
        act.push(G.crew.fmt(b.id, G.crew.valueAt(b.id, L)) + ' ' + d.label);
        if (L >= G.crew.MAX_LEVEL) setText(el.nx, 'Max level'); else setText(el.nx, 'Next level: ' + G.crew.fmt(b.id, G.crew.valueAt(b.id, L + 1)) + ' ' + d.label);
        var cost = G.crew.levelCost(b.id), maxed = !isFinite(cost);
        setText(el.bl, maxed ? 'Max' : 'Level up'); setText(el.bc, maxed ? '' : fmt(cost) + ' G');
        setDis(el.b, maxed || snap.gold < cost);
        if (!maxed && snap.gold >= cost) any = true;
      } else {
        setText(el.bn, G.crew.fmt(b.id, d.per) + ' ' + d.label + ' per level');
        setText(el.nx, 'Hire to gain this bonus in every raid');
        setText(el.bl, 'Hire'); setText(el.bc, money(b.manager.cost));
        setDis(el.b, !b.manager.canAfford);
        if (b.manager.canAfford) any = true;
      }
    });
    setText(el_sum(), act.length ? 'Active bonuses:  ' + act.join('   ') : 'Hire managers to unlock permanent bonuses.');
    return any;
  }
  function el_sum() { return crewEls._sum; }

  // ---------- build: inventory (gear / arsenal / upgrades) ----------
  var inv = { sub: 'gear', sel: null, filter: 'all', sig: '' }, invEls = {};
  var SLOT_ORDER_L = ['weapon', 'chain', 'gloves'], SLOT_ORDER_R = ['jacket', 'pants', 'shoes'];
  function itemSrc(it) { var k = G.inventory.iconOf(it); return G.inventory.iconUri(k) || file('icons', k); }
  function slotGhost(slot) { var k = G.inventory.SLOT_DEFS[slot].items[0][1]; return G.inventory.iconUri(k) || file('icons', k); }
  function frameOf(it) { return G.inventory.rarity(it.rarity).frame; }
  function itemTile(it, extra) {
    var t = h('div', 'it r-' + frameOf(it) + (extra ? ' ' + extra : ''));
    t.style.setProperty('--rc', G.inventory.rarity(it.rarity).color);
    var ic = img(itemSrc(it), 'it-ic'); t.appendChild(ic);
    t.appendChild(h('b', 'it-lv', 'Lv ' + it.level));
    if (G.inventory.isEquipped(it.id)) t.appendChild(h('i', 'it-eq', 'E'));
    return t;
  }
  ui.itemTile = itemTile;

  function buildInv() {
    var root = $('inv-body'); root.innerHTML = '';
    var sub = h('div', 'inv-sub');
    [['gear', 'Gear'], ['arsenal', 'Arsenal'], ['upgrades', 'Upgrades']].forEach(function (s) {
      var b = h('button', 'inv-subbtn' + (s[0] === inv.sub ? ' on' : ''), s[1]); b.setAttribute('data-sub', s[0]);
      tap(b, function () { sfx('click'); ui.setSub(s[0]); });
      sub.appendChild(b);
    });
    root.appendChild(sub);
    invEls.gear = h('div', 'inv-view'); invEls.arsenal = h('div', 'inv-view'); invEls.upgrades = h('div', 'inv-view');
    root.appendChild(invEls.gear); root.appendChild(invEls.arsenal); root.appendChild(invEls.upgrades);
    buildGear(invEls.gear); buildWork(invEls.arsenal, invEls.upgrades);
    ui.setSub(inv.sub, true);
  }
  ui.setSub = function (s, quiet) {
    inv.sub = s;
    ['gear', 'arsenal', 'upgrades'].forEach(function (k) { invEls[k].hidden = k !== s; });
    Array.prototype.forEach.call(document.querySelectorAll('.inv-subbtn'), function (b) { b.classList.toggle('on', b.getAttribute('data-sub') === s); });
    if (!quiet) { $('panes').scrollTop = 0; ui.update(true); }
  };

  function buildGear(root) {
    var hero = h('div', 'inv-hero');
    var glow = h('div', 'inv-glow'); hero.appendChild(glow);
    var cv = document.createElement('canvas'); cv.width = 500; cv.height = 620; cv.className = 'inv-cv'; hero.appendChild(cv);
    var fb = h('div', 'inv-fb');
    fb.appendChild(img(file('characters', 'hero') || '', 'fb-head')); fb.appendChild(img('', 'fb-torso'));
    try { var hp = M.characters.hero.parts; fb.children[0].src = hp.head_s.file; fb.children[1].src = hp.torso_s.file; } catch (e) {}
    hero.appendChild(fb);
    invEls.cv = cv; invEls.fb = fb; invEls.slots = {};
    function mkSlot(slot, side) {
      var b = h('button', 'slot ' + side); b.setAttribute('data-slot', slot);
      var tile = h('div', 'slot-tile'); b.appendChild(tile);
      b.appendChild(h('span', 'slot-name', G.inventory.SLOT_DEFS[slot].name));
      hero.appendChild(b); invEls.slots[slot] = { b: b, tile: tile };
      tap(b, function () {
        sfx('click'); inv.filter = slot; var it = G.inventory.equippedItem(slot); inv.sel = it ? it.id : null; ui.update(true);
      });
    }
    SLOT_ORDER_L.forEach(function (s) { mkSlot(s, 'sl'); }); SLOT_ORDER_R.forEach(function (s) { mkSlot(s, 'sr'); });
    invEls.power = h('div', 'inv-power'); hero.appendChild(invEls.power);
    root.appendChild(hero);
    // filter chips
    var fl = h('div', 'inv-filter'); invEls.chips = {};
    [['all', 'All']].concat(G.inventory.SLOTS.map(function (s) { return [s, G.inventory.SLOT_DEFS[s].name]; })).forEach(function (c) {
      var b = h('button', 'chip', c[1]); fl.appendChild(b); invEls.chips[c[0]] = b;
      tap(b, function () { sfx('click'); inv.filter = c[0]; ui.update(true); });
    });
    root.appendChild(fl);
    invEls.detail = h('div', 'inv-detail card'); root.appendChild(invEls.detail);
    invEls.grid = h('div', 'inv-grid'); root.appendChild(invEls.grid);
  }

  function statLines(it, parent) {
    var I = G.inventory, eqIt = I.equippedItem(it.slot), eqStats = eqIt && eqIt.id !== it.id ? I.statsOf(eqIt) : null;
    var nextStats = it.level < I.maxLevel(it) ? I.statsOf({ slot: it.slot, rarity: it.rarity, level: it.level + 1, base: it.base }) : null;
    I.statsOf(it).forEach(function (s, i) {
      var row = h('div', 'ds-row'); row.appendChild(h('span', 'ds-l', s.label)); row.appendChild(h('b', 'ds-v', I.fmtStat(s)));
      if (nextStats) row.appendChild(h('span', 'ds-n', '> ' + I.fmtStat(nextStats[i])));
      else if (eqStats) {
        var d = s.value - (eqStats[i] ? eqStats[i].value : 0), dd = h('span', 'ds-n ' + (d >= 0 ? 'up' : 'down'), (d >= 0 ? '+' : '-') + I.fmtStat({ unit: s.unit, value: Math.abs(d) }).slice(1));
        row.appendChild(dd);
      }
      parent.appendChild(row);
    });
  }

  function renderInv(snap) {
    var I = G.inventory, items = I.sorted();
    if (inv.sel != null && !I.get(inv.sel)) inv.sel = null;
    if (inv.sel == null) { var w = I.equippedItem('weapon'); inv.sel = w ? w.id : (items[0] ? items[0].id : null); }
    // slots
    I.SLOTS.forEach(function (s) {
      var el = invEls.slots[s], it = I.equippedItem(s); el.tile.innerHTML = '';
      el.tile.className = 'slot-tile ' + (it ? 'r-' + frameOf(it) : 'r-gray empty');
      if (it) { el.tile.style.setProperty('--rc', I.rarity(it.rarity).color); el.tile.appendChild(img(itemSrc(it), 'it-ic')); el.tile.appendChild(h('b', 'it-lv', 'Lv ' + it.level)); }
      else el.tile.appendChild(img(slotGhost(s), 'it-ic ghost'));
      el.b.classList.toggle('sel', inv.sel != null && it && it.id === inv.sel);
    });
    setText(invEls.power, 'Gear power ' + I.power());
    Object.keys(invEls.chips).forEach(function (k) { invEls.chips[k].classList.toggle('on', inv.filter === k); });
    // detail
    var d = invEls.detail; d.innerHTML = '';
    var it = inv.sel != null ? I.get(inv.sel) : null;
    if (!it) { d.appendChild(h('div', 'inv-empty', 'No gear yet. Raid for loot or open a crate in the Shop.')); }
    else {
      var rr = I.rarity(it.rarity);
      var left = h('div', 'ds-left'); left.appendChild(itemTile(it, 'big'));
      var mid = h('div', 'ds-mid');
      var nm = h('div', 'ds-name', I.nameOf(it)); mid.appendChild(nm);
      var rl = h('div', 'ds-rar', rr.name + '  -  ' + I.SLOT_DEFS[it.slot].name); rl.style.color = rr.color; mid.appendChild(rl);
      mid.appendChild(h('div', 'ds-lv', 'Level ' + it.level + ' / ' + I.maxLevel(it)));
      statLines(it, mid);
      var acts = h('div', 'ds-acts');
      var eq = I.isEquipped(it.id);
      var bE = h('button', 'btn btn-primary'); bE.innerHTML = '<span class="buy-l">' + (eq ? 'Equipped' : 'Equip') + '</span>'; setDis(bE, eq);
      tap(bE, function () { if (I.equip(it.id)) { sfx('buy'); G.save.save(); ui.update(true); } });
      var cost = I.upgradeCost(it), maxed = !isFinite(cost);
      var bU = h('button', 'btn btn-secondary'); bU.innerHTML = '<span class="buy-l">' + (maxed ? 'Max level' : 'Upgrade') + '</span><span class="buy-c">' + (maxed ? '' : fmt(cost) + ' G') + '</span>';
      setDis(bU, maxed || snap.gold < cost);
      tap(bU, function () { if (I.upgrade(it.id)) { sfx('buy'); ui.float('Level ' + it.level, bU, 'f-lv'); G.save.save(); ui.update(true); } else ui.shake(bU); });
      var fod = I.mergeFodder(it.id), top = it.rarity >= I.RARITIES.length - 1;
      var bM = h('button', 'btn btn-secondary'); bM.innerHTML = '<span class="buy-l">Merge</span><span class="buy-c">' + (top ? 'Max rarity' : Math.min(3, 1 + fod.length) + ' / 3') + '</span>';
      setDis(bM, top || fod.length < 2);
      tap(bM, function () {
        var r = I.merge(it.id);
        if (r) { sfx('levelup'); ui.float(I.rarity(r.rarity).name + '!', bM, 'f-lv'); ui.toast('Merged into ' + I.rarity(r.rarity).name + ' ' + I.nameOf(r)); G.save.save(); ui.update(true); } else ui.shake(bM);
      });
      acts.appendChild(bE); acts.appendChild(bU); acts.appendChild(bM);
      var top2 = h('div', 'ds-top'); top2.appendChild(left); top2.appendChild(mid);
      d.appendChild(top2); d.appendChild(acts);
    }
    // grid
    var g = invEls.grid; g.innerHTML = '';
    var shown = items.filter(function (x) { return inv.filter === 'all' || x.slot === inv.filter; });
    shown.forEach(function (x) {
      var t = itemTile(x, x.id === inv.sel ? 'sel' : ''); t.setAttribute('data-item', x.id);
      tap(t, function () { sfx('click'); inv.sel = x.id; ui.update(true); });
      g.appendChild(t);
    });
    var minCells = 15; for (var i = shown.length; i < minCells; i++) g.appendChild(h('div', 'it empty-cell'));
  }
  function invSig(snap) {
    var I = G.inventory, it = inv.sel != null ? I.get(inv.sel) : null;
    return [I.items().map(function (x) { return x.id + ':' + x.rarity + ':' + x.level; }).join('|'), I.SLOTS.map(I.equippedId).join(','), inv.sel, inv.filter,
      it ? (snap.gold >= I.upgradeCost(it)) : '', I.power()].join('#');
  }
  function invDot() {
    var I = G.inventory, best = false;
    I.SLOTS.forEach(function (s) {
      var eq = I.equippedItem(s), score = function (x) { return x.rarity * 100 + x.level; };
      I.items().forEach(function (x) { if (x.slot === s && (!eq || (x.id !== eq.id && score(x) > score(eq)))) best = true; });
    });
    return best;
  }

  // ---------- build: workshop ----------
  function pctTxt(p) {
    if (p.unit === 'pct') return '+' + (p.value * 100).toFixed(p.perLevel < 0.01 ? 1 : 0) + '%';
    return '+' + (Math.round(p.value * 10) / 10);
  }
  function buildWork(root, root2) {
    var hd = h('div', 'sec-title', 'Armory'); root.appendChild(hd);
    var sub = h('div', 'sec-sub', 'Unlock guns with gold, level them up, and pick what you start each raid with.'); root.appendChild(sub);
    var grid = h('div', 'wgrid'); root.appendChild(grid);
    E().bizList(); var cfgw = G.config.weapons.list;
    cfgw.forEach(function (w, i) {
      var c = h('div', 'wcard rar-' + RARITY[i]);
      var dot = h('em', 'dot'); dot.hidden = true;
      var im = img(file('weapons', w.id, 'side'), 'w-img');
      var nm = h('div', 'w-name', weaponName(w.id));
      var lv = h('div', 'w-lv');
      var b1 = h('button', 'btn btn-primary w-act'); var l1 = h('span', 'buy-l'); var c1 = h('span', 'buy-c'); b1.appendChild(l1); b1.appendChild(c1);
      var b2 = h('button', 'btn btn-secondary w-eq');
      c.appendChild(im); c.appendChild(nm); c.appendChild(lv); c.appendChild(b1); c.appendChild(b2); c.appendChild(dot);
      grid.appendChild(c);
      wEls[w.id] = { c: c, lv: lv, b1: b1, l1: l1, c1: c1, b2: b2, dot: dot, im: im };
      tap(b1, function () {
        var ws = S().weapons[w.id], ok = ws.owned ? E().buyWeaponLevel(w.id) : E().unlockWeapon(w.id);
        if (ok) { sfx('buy'); ui.float(ws.owned && ws.level > 1 ? 'Level up' : 'Unlocked', b1, 'f-lv'); G.save.save(); ui.update(true); } else ui.shake(b1);
      });
      tap(b2, function () {
        if (!S().weapons[w.id].owned) return;
        S().startWeapon = w.id; sfx('click'); G.save.save(); ui.update(true);
      });
    });
    var hd2 = h('div', 'sec-title', 'Upgrades'); root2.appendChild(hd2);
    root2.appendChild(h('div', 'sec-sub', 'Permanent bonuses. They apply in every raid.'));
    var pl = h('div', 'list plist'); root2.appendChild(pl);
    G.config.perm.stats.forEach(function (st) {
      var r = h('div', 'perm card');
      var ic = h('div', 'perm-ic'); ic.appendChild(img(file('stats', st.id)));
      var mid = h('div', 'perm-main'); var nm = h('div', 'perm-name', statName(st.id)); var ds = h('div', 'perm-desc');
      mid.appendChild(nm); mid.appendChild(ds);
      var lvl = h('div', 'perm-lv');
      var b = h('button', 'btn btn-primary perm-buy'); var bl = h('span', 'buy-l', 'Train'); var bc = h('span', 'buy-c'); b.appendChild(bl); b.appendChild(bc);
      r.appendChild(ic); r.appendChild(mid); r.appendChild(b); pl.appendChild(r);
      pEls[st.id] = { r: r, ds: ds, b: b, bl: bl, bc: bc };
      tap(b, function () { if (E().buyPerm(st.id)) { sfx('buy'); ui.float('+1', b, 'f-lv'); G.save.save(); ui.update(true); } else ui.shake(b); });
    });
  }
  function updWork(snap) {
    var any = false;
    snap.weapons.forEach(function (w) {
      var el = wEls[w.id]; if (!el) return;
      var eq = snap.startWeapon === w.id;
      setCls(el.c, 'is-locked', !w.owned); setCls(el.c, 'is-eq', eq);
      setText(el.lv, w.owned ? 'Level ' + w.level + ' / ' + w.maxLevel : 'Locked');
      if (!w.owned) { setText(el.l1, 'Unlock'); setText(el.c1, fmt(w.unlockCost) + ' G'); setDis(el.b1, !w.canUnlock); setHide(el.b2, true); }
      else {
        var maxed = w.level >= w.maxLevel;
        setText(el.l1, maxed ? 'Max level' : 'Level up'); setText(el.c1, maxed ? '' : fmt(w.levelCost) + ' G'); setDis(el.b1, maxed || !w.canLevel);
        setHide(el.b2, false); setText(el.b2, eq ? 'Equipped' : 'Equip'); setDis(el.b2, eq);
      }
      setHide(el.dot, !(w.canUnlock && !w.owned));
      if (w.canUnlock && !w.owned) any = true;
    });
    snap.perm.forEach(function (p) {
      var el = pEls[p.id]; if (!el) return;
      var maxed = p.level >= p.maxLevel;
      setText(el.ds, 'Lv ' + p.level + '/' + p.maxLevel + '   ' + (p.level ? pctTxt(p) : ''));
      setText(el.bc, maxed ? 'Max' : fmt(p.cost) + ' G'); setDis(el.b, maxed || !p.canAfford);
      if (!maxed && p.canAfford) any = true;
    });
    return any;
  }

  // ---------- build: shop ----------
  var PACKS = {
    starter_pack: { name: 'Starter Pack', desc: '300 gems, 2,000 gold, a Machine Pistol and 2 hours of income.', icon: 'gift_box', tag: 'One time' },
    remove_ads_speed: { name: 'No Ads + Fast Cash', desc: 'No ad prompts and 1.5x idle speed. Never required to progress.', icon: 'no_ads_badge', tag: 'One time' },
    gems_small: { name: 'Pocket of Gems', desc: '80 gems', icon: 'ruby_gem' },
    gems_medium: { name: 'Bag of Gems', desc: '500 gems', icon: 'ruby_gem' },
    gems_large: { name: 'Case of Gems', desc: '1,100 gems', icon: 'ruby_gem' },
    gems_xl: { name: 'Safe of Gems', desc: '2,400 gems', icon: 'safe' },
    gems_huge: { name: 'Vault of Gems', desc: '6,500 gems', icon: 'safe' },
    gems_whale: { name: 'The Whole Bank', desc: '14,000 gems', icon: 'crown' }
  };
  function buildShop() {
    var root = $('shop-body'); root.innerHTML = '';
    root.appendChild(h('div', 'sec-title', 'Boosts'));
    var bc = h('div', 'card boostcard');
    var ic = h('div', 'shop-ic'); ic.appendChild(img(file('icons', 'boost_2x')));
    var mid = h('div', 'shop-main'); mid.appendChild(h('div', 'shop-name', 'Double income'));
    var bd = h('div', 'shop-desc'); mid.appendChild(bd);
    var row = h('div', 'shop-btns');
    var bg = h('button', 'btn btn-primary'); bg.innerHTML = '<span class="buy-l">1 hour</span><span class="buy-c"><i class="ci ci-gems sm"></i>' + G.config.boosts.incomeX2_gems.gemCost + '</span>';
    var ba = h('button', 'btn btn-secondary'); ba.innerHTML = '<span class="buy-l">Watch ad</span><span class="buy-c">free x2</span>';
    row.appendChild(bg); row.appendChild(ba);
    bc.appendChild(ic); bc.appendChild(mid); bc.appendChild(row); root.appendChild(bc);
    shopEls.bd = bd; shopEls.bg = bg; shopEls.ba = ba;
    function boost(kind, btn) {
      var r = E().activateBoost(kind);
      if (r.ok) { sfx('buy'); ui.float('Income x2', btn, 'f-lv'); G.save.save(); ui.update(true); }
      else { ui.shake(btn); ui.toast(r.reason === 'gems' ? 'Not enough gems' : r.reason === 'max_stack' ? 'Boost time is maxed out' : 'Not available'); }
    }
    tap(bg, function () { boost('incomeX2_gems', bg); });
    tap(ba, function () { stubAd(function () { boost('incomeX2_ad', ba); }); });
    root.appendChild(h('div', 'sec-title', 'Crates'));
    root.appendChild(h('div', 'sec-sub', 'Open crates for gear. Merge three of the same kind to rank it up.'));
    var cl = h('div', 'list'); root.appendChild(cl);
    shopEls.crates = {};
    Object.keys(G.inventory.CHESTS).forEach(function (k) {
      var ch = G.inventory.CHESTS[k], r = h('div', 'card pack');
      var i2 = h('div', 'shop-ic'); i2.appendChild(img(file('icons', ch.icon)));
      var m2 = h('div', 'shop-main'); m2.appendChild(h('div', 'shop-name', ch.name)); m2.appendChild(h('div', 'shop-desc', ch.desc));
      var cur = ch.cost.gold ? 'gold' : 'gems', amt = ch.cost.gold || ch.cost.gems;
      var b = h('button', 'btn btn-primary'); b.innerHTML = '<span class="buy-l">Open</span><span class="buy-c"><i class="ci ci-' + cur + ' sm"></i>' + fmt(amt) + '</span>';
      tap(b, function () {
        var res = G.inventory.openChest(k);
        if (res.ok) { sfx('levelup'); G.save.save(); ui.update(true); ui.showItems([res.item], ch.name); }
        else { ui.shake(b); ui.toast(res.reason === 'gems' ? 'Not enough gems' : 'Not enough gold'); }
      });
      r.appendChild(i2); r.appendChild(m2); r.appendChild(b); cl.appendChild(r);
      shopEls.crates[k] = { b: b, cur: cur, amt: amt };
    });
    root.appendChild(h('div', 'sec-title', 'Premium'));
    root.appendChild(h('div', 'sec-sub', 'Purchases are not live in this build. Everything here can also be earned by playing.'));
    var pl = h('div', 'list'); root.appendChild(pl);
    var shop = G.config.shop;
    Object.keys(shop).forEach(function (k) {
      var p = PACKS[k] || { name: prettyId(k), desc: '', icon: 'gift' }, d = shop[k];
      var r = h('div', 'card pack' + (d.oneTime ? ' hot' : ''));
      var i2 = h('div', 'shop-ic'); i2.appendChild(img(file('icons', p.icon)));
      var m2 = h('div', 'shop-main'); m2.appendChild(h('div', 'shop-name', p.name)); m2.appendChild(h('div', 'shop-desc', p.desc));
      var b = h('button', 'btn btn-primary'); b.innerHTML = '<span class="buy-l">$' + d.price.toFixed(2) + '</span>';
      tap(b, function () { sfx('click'); ui.toast('Store opens at launch'); });
      r.appendChild(i2); r.appendChild(m2); r.appendChild(b); pl.appendChild(r);
    });
  }
  function updShop(snap) {
    var bs = snap.boost;
    setText(shopEls.bd, bs.active ? 'Active: ' + clock(bs.remainingSec) + ' left' : 'Earn twice as much cash from every business.');
    setDis(shopEls.bg, snap.gems < G.config.boosts.incomeX2_gems.gemCost);
    Object.keys(shopEls.crates || {}).forEach(function (k) { var c = shopEls.crates[k]; setDis(c.b, snap[c.cur] < c.amt); });
    return !bs.active;
  }
  function clock(s) { s = Math.max(0, Math.floor(s)); var m = Math.floor(s / 60), hh = Math.floor(m / 60); m %= 60; s %= 60; return (hh ? hh + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (s < 10 ? '0' : '') + s; }

  function stubAd(done) {
    var st = 3, m = ui.modal({ title: 'Sponsor message', cls: 'modal-sm', body: function (b) { b.appendChild(h('div', 'adbox', 'Ad placeholder')); b.appendChild(h('div', 'ad-count', 'Reward in 3')); } });
    var cnt = m.body.querySelector('.ad-count');
    var iv = setInterval(function () { st--; if (st <= 0) { clearInterval(iv); m.close(); done(); } else cnt.textContent = 'Reward in ' + st; }, 700);
  }
  ui.stubAd = stubAd;

  // ---------- build: raid (chapter carousel) ----------
  function buildRaid() {
    var root = $('raid-body'); root.innerHTML = '';
    var Ch = G.chapters;
    var scroll = h('div', 'chap-scroll'); raidEls.scroll = scroll; raidEls.cards = [];
    Ch.list.forEach(function (c) {
      var card = h('div', 'chap'); card.setAttribute('data-chapter', c.n);
      var art = h('div', 'chap-art'); art.style.backgroundImage = 'url("' + c.art + '")'; art.style.backgroundPosition = c.pos; card.appendChild(art);
      var shade = h('div', 'chap-shade'); card.appendChild(shade);
      var body = h('div', 'chap-body');
      body.appendChild(h('div', 'chap-no', 'CHAPTER ' + c.n));
      body.appendChild(h('div', 'chap-name', c.name));
      body.appendChild(h('div', 'chap-tag', c.tag));
      var prog = h('div', 'chap-prog'); var pbar = h('div', 'chap-bar'); var pfill = h('div', 'chap-fill'); pbar.appendChild(pfill);
      var ptx = h('div', 'chap-ptx'); prog.appendChild(ptx); prog.appendChild(pbar); body.appendChild(prog);
      var best = h('div', 'chap-best'); body.appendChild(best);
      var en = h('div', 'chap-en');
      [['star', 'Elite', 5], ['crown', 'Super Elite', 10], ['skull', 'Boss', 15]].forEach(function (e) {
        var chip = h('div', 'en-chip'); chip.appendChild(img(file('icons', e[0]))); chip.appendChild(h('span', '', e[1] + ' w' + e[2])); en.appendChild(chip);
      });
      body.appendChild(en);
      card.appendChild(body);
      var lock = h('div', 'chap-lock'); lock.appendChild(img(file('icons', 'lock'), 'lock-ic'));
      var lt = h('div', 'lock-txt', c.n > 1 ? 'Reach wave 15 in ' + Ch.list[c.n - 2].name + ' to unlock' : ''); lock.appendChild(lt);
      card.appendChild(lock);
      scroll.appendChild(card);
      raidEls.cards.push({ c: card, fill: pfill, ptx: ptx, best: best });
      tap(card, function () { ui.raidScrollTo(c.n - 1); });
    });
    root.appendChild(scroll);
    var dots = h('div', 'chap-dots'); raidEls.dots = [];
    Ch.list.forEach(function () { var d = h('i', 'cd'); dots.appendChild(d); raidEls.dots.push(d); });
    root.appendChild(dots);
    var wc = h('div', 'raid-load card');
    raidEls.wimg = img('', 'w-img'); raidEls.wname = h('div', 'w-name'); raidEls.wlv = h('div', 'w-lv');
    var wt = h('div', 'raid-wt'); wt.appendChild(h('div', 'sec-sub', 'Loadout')); wt.appendChild(raidEls.wname); wt.appendChild(raidEls.wlv);
    var chg = h('button', 'btn btn-secondary', 'Change'); tap(chg, function () { ui.setTab('inv'); ui.setSub('arsenal'); });
    wc.appendChild(raidEls.wimg); wc.appendChild(wt); wc.appendChild(chg); root.appendChild(wc);
    var go = h('button', 'btn btn-primary raid-go'); go.innerHTML = '<span class="go-w">RAID</span><small class="go-c"></small>';
    raidEls.goc = go.querySelector('.go-c');
    tap(go, function () { if (go.disabled) return; sfx('boss'); if (ui.onRaid) ui.onRaid(); });
    root.appendChild(go); raidEls.go = go;
    var tm; scroll.addEventListener('scroll', function () {
      clearTimeout(tm); tm = setTimeout(function () { onChapScroll(); }, 70);
      var i = chapIndex(); raidEls.dots.forEach(function (d, k) { d.classList.toggle('on', k === i); });
    });
    ui.raidScrollTo(Ch.selected() - 1, true);
  }
  function chapIndex() { var s = raidEls.scroll, w = raidEls.cards[0].c.offsetWidth + 14; return Math.max(0, Math.min(raidEls.cards.length - 1, Math.round(s.scrollLeft / w))); }
  ui.chapterInView = function () { return chapIndex() + 1; };
  function onChapScroll() { var n = chapIndex() + 1; if (G.chapters.unlocked(n)) { G.chapters.select(n); } ui.update(true); }
  ui.raidScrollTo = function (i, instant) {
    var s = raidEls.scroll; if (!s) return;
    var w = raidEls.cards[0].c.offsetWidth + 14;
    var go = function () { s.scrollTo({ left: i * w, behavior: instant ? 'auto' : 'smooth' }); raidEls.dots.forEach(function (d, k) { d.classList.toggle('on', k === i); }); };
    go(); if (instant) setTimeout(go, 60);
  };
  function updRaid(snap) {
    var Ch = G.chapters, vi = chapIndex() + 1;
    Ch.list.forEach(function (c, i) {
      var el = raidEls.cards[i], un = Ch.unlocked(c.n), p = Ch.progress(c.n);
      setCls(el.c, 'is-locked', !un); setCls(el.c, 'is-view', c.n === vi);
      setText(el.ptx, un ? 'Progress ' + p + ' / ' + Ch.WAVES : 'Locked');
      var w = (p / Ch.WAVES * 100).toFixed(1) + '%'; if (el.fill._w !== w) { el.fill._w = w; el.fill.style.width = w; }
      setText(el.best, un ? (p >= Ch.WAVES ? 'Cleared  -  best wave ' + Math.max(p, 0) : 'Best wave ' + p) : '');
    });
    var wid = snap.startWeapon, w = snap.weapons.filter(function (x) { return x.id === wid; })[0];
    var src = file('weapons', wid, 'side'); if (raidEls.wimg._s !== src) { raidEls.wimg._s = src; raidEls.wimg.src = src; }
    setText(raidEls.wname, weaponName(wid)); setText(raidEls.wlv, 'Level ' + (w ? w.level : 1) + '  -  Gear power ' + G.inventory.power());
    var un = Ch.unlocked(vi), c = Ch.list[vi - 1];
    setDis(raidEls.go, !un); setText(raidEls.goc, un ? 'Chapter ' + vi + '  -  ' + c.name : 'Locked');
  }

  // ---------- items got modal ----------
  ui.showItems = function (items, title, done) {
    var m = ui.modal({
      title: title || 'New gear', cls: 'modal-items',
      body: function (b) {
        var row = h('div', 'got-row');
        items.forEach(function (it, i) {
          var c = h('div', 'got'); c.style.animationDelay = (i * 0.12) + 's';
          c.appendChild(itemTile(it, 'big')); c.appendChild(h('div', 'got-name', G.inventory.nameOf(it)));
          var r = h('div', 'got-rar', G.inventory.rarity(it.rarity).name); r.style.color = G.inventory.rarity(it.rarity).color; c.appendChild(r);
          row.appendChild(c);
        });
        b.appendChild(row);
      },
      buttons: [{ text: 'Nice' }], onClose: done
    });
    return m;
  };

  // ---------- top bar ----------
  function updTop(snap, force) {
    ['cash', 'gold', 'gems', 'respect'].forEach(function (k) {
      var t = snap[k], d = disp[k];
      if (force || Math.abs(t - d) < 0.5 || t < d) d = t; else d += (t - d) * 0.35;
      disp[k] = d;
      var el = $('v-' + k), txt = fmt(Math.floor(d));
      if (el._t !== txt) { el._t = txt; el.textContent = txt; }
    });
    setText($('v-income'), '+' + money(snap.incomePerSec) + '/s');
    var bo = $('v-boost'); setHide(bo, !snap.boost.active); if (snap.boost.active) setText(bo, 'x2  ' + clock(snap.boost.remainingSec));
  }

  // ---------- tabs ----------
  ui.setTab = function (t, quiet) {
    ui.tab = t;
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === t); });
    Array.prototype.forEach.call(document.querySelectorAll('.pane'), function (p) { p.hidden = p.getAttribute('data-pane') !== t; });
    $('panes').scrollTop = 0; if (!quiet) sfx('click'); ui.update(true);
    if (t === 'raid') ui.raidScrollTo(G.chapters.selected() - 1, true);
    if (t === 'inv') inv.sig = '';
  };

  var invT0 = performance.now();
  function drawInvHero() {
    var P = G.puppet, cv = invEls.cv; if (!cv) return;
    var ok = !!(P && P.ready && P.ready());
    setHide(invEls.fb, ok); setHide(cv, !ok);
    if (!ok) return;
    var c = cv.getContext('2d'), t = (performance.now() - invT0) / 1000;
    c.setTransform(2, 0, 0, 2, 0, 0); c.clearRect(0, 0, 250, 310);
    try {
      P.draw(c, { kind: 'hero', x: 125, y: 296, facing: Math.PI / 2, moving: false, speed: 0, state: 'idle', t: t, animT: t, weaponId: S().startWeapon, scale: 3 });
    } catch (e) {}
  }
  function updInvTab(snap) {
    if (inv.sub === 'gear') {
      var sg = invSig(snap);
      if (sg !== inv.sig) { inv.sig = sg; renderInv(snap); }
      drawInvHero();
    } else updWork(snap);
  }

  // ---------- main update (10Hz) ----------
  ui.update = function (force) {
    if (!lastSnap && !force && !G.economy) return;
    var snap = E().snapshot(); lastSnap = snap;
    updTop(snap, force === 'init');
    var d = {};
    if (ui.tab === 'biz') d.biz = updBiz(snap);
    else if (ui.tab === 'crew') updCrew(snap); else if (ui.tab === 'inv') updInvTab(snap);
    else if (ui.tab === 'shop') updShop(snap); else if (ui.tab === 'raid') updRaid(snap);
    // tab dots (cheap enough: computed from snap)
    var dots = {
      biz: snap.businesses.some(function (b) { return b.state === 'available' && b.canAfford && !seenBiz[b.id]; }),
      crew: snap.businesses.some(function (b) { return b.manager.canAfford || (b.manager.hired && isFinite(G.crew.levelCost(b.id)) && snap.gold >= G.crew.levelCost(b.id)); }),
      inv: invDot() || snap.weapons.some(function (w) { return !w.owned && w.canUnlock; }) || snap.perm.some(function (p) { return p.canAfford && p.level < p.maxLevel; }),
      shop: !snap.boost.active,
      raid: false
    };
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) { setHide(b.querySelector('.dot'), !dots[b.getAttribute('data-tab')]); });
  };

  // ---------- result / offline / settings ----------
  ui.showOffline = function (off, done) {
    var m, cashEl, claimed = false;
    function claim(mult) { if (claimed) return; claimed = true; var r = E().claimOffline(mult); sfx('coin'); ui.update('init'); if (done) done(r); }
    m = ui.modal({
      title: 'Welcome back', cls: 'modal-off', closable: true, onClose: function () { claim(1); },
      body: function (b) {
        var t = off.seconds, hrs = Math.floor(t / 3600), mn = Math.floor((t % 3600) / 60);
        b.appendChild(h('div', 'off-away', 'The firm kept earning for ' + (hrs ? hrs + 'h ' : '') + mn + 'm' + (off.capped ? ' (8h cap)' : '')));
        var big = h('div', 'off-cash'); cashEl = h('span', '', '$0'); big.appendChild(img(file('icons', 'cash_stack'))); big.appendChild(cashEl); b.appendChild(big);
        ui.countUp(cashEl, off.cash, 1100, '$');
        b.appendChild(h('div', 'off-sub', 'Managed businesses pay out in full. Others stop filling after 1 minute.'));
      },
      buttons: [
        { text: 'Collect', fn: function () { claim(1); } },
        { html: '<span class="buy-l">Watch ad</span><span class="buy-c">collect x2</span>', cls: 'btn-secondary', keep: true, fn: function () { claimed = true; m.close(); claimed = false; stubAd(function () { claim(2); }); return false; } }
      ]
    });
    return m;
  };

  ui.showResult = function (r, res, done, extra) {
    extra = extra || {};
    var win = !!r.win, fin = false;
    function finish() { if (fin) return; fin = true; if (done) done(); }
    var m = ui.modal({
      title: win ? 'Raid complete' : 'Raid over', closable: true, onClose: finish, cls: 'modal-res ' + (win ? 'win' : 'lose'),
      body: function (b) {
        var hero = h('div', 'res-hero'); hero.appendChild(img(file('ui', win ? 'banner_victory' : 'banner_defeat'), 'res-banner'));
        hero.appendChild(h('div', 'res-word', win ? 'Victory' : 'Defeat'));
        if (res.newBest) hero.appendChild(img(file('ui', 'banner_new'), 'res-new'));
        b.appendChild(hero);
        var rows = [
          ['Wave reached', r.wave + (res.newBest ? '  (new best)' : ''), 'skull', null],
          ['Kills', r.kills, 'crosshair', null],
          ['Cash', res.cash, 'cash_stack', '$'],
          ['Gold', res.gold, 'gold_bars', ''],
        ];
        if (res.gems) rows.push(['Gems', res.gems, 'ruby_gem', '']);
        if (extra.chapter) rows.push(['Chapter ' + extra.chapter, (extra.rec && extra.rec.unlockedNext ? 'Next unlocked!' : Math.min(15, extra.rec ? extra.rec.reached : 0) + ' / 15'), 'laurel_wreath', null]);
        var tb = h('div', 'res-rows'); b.appendChild(tb);
        rows.forEach(function (rw, i) {
          var row = h('div', 'res-row'); row.style.animationDelay = (0.15 + i * 0.12) + 's';
          row.appendChild(img(file('icons', rw[2]))); row.appendChild(h('span', 'res-l', rw[0]));
          var v = h('b', 'res-v', typeof rw[1] === 'number' ? '0' : rw[1]); row.appendChild(v); tb.appendChild(row);
          if (typeof rw[1] === 'number') setTimeout(function () { ui.countUp(v, rw[1], 700, rw[3] || ''); }, 250 + i * 120);
        });
        if (extra.items && extra.items.length) {
          b.appendChild(h('div', 'set-sec', 'Loot'));
          var lr = h('div', 'got-row sm'); extra.items.forEach(function (it) { var c = h('div', 'got'); c.appendChild(itemTile(it)); lr.appendChild(c); }); b.appendChild(lr);
        }
      },
      buttons: [{ text: 'Back to hub' }]
    });
    return m;
  };

  function toggleRow(label, key, onchange) {
    var r = h('div', 'set-row'); r.appendChild(h('span', '', label));
    var t = h('button', 'toggle'); t.setAttribute('role', 'switch');
    function paint() { var on = S().settings[key] !== false; t.classList.toggle('on', on); t.setAttribute('aria-checked', on); }
    paint();
    tap(t, function () { S().settings[key] = !(S().settings[key] !== false); paint(); G.save.save(); sfx('click'); if (onchange) onchange(); });
    r.appendChild(t); return r;
  }
  ui.showSettings = function () {
    ui.modal({
      title: 'Settings', closable: true, cls: 'modal-set',
      body: function (b) {
        b.appendChild(toggleRow('Sound', 'sound'));
        b.appendChild(toggleRow('Screen shake', 'shake'));
        b.appendChild(toggleRow('Flashes', 'flashes'));
        var sv = h('div', 'set-sec', 'Save data');
        b.appendChild(sv);
        var ta = h('textarea', 'save-box'); ta.rows = 3; ta.placeholder = 'Paste a save string here to import'; ta.setAttribute('spellcheck', 'false');
        b.appendChild(ta);
        var row = h('div', 'set-btns');
        var ex = h('button', 'btn btn-secondary', 'Export'); var im = h('button', 'btn btn-secondary', 'Import'); var rs = h('button', 'btn btn-secondary danger', 'Reset');
        tap(ex, function () {
          G.save.save(); ta.value = G.save.exportString(); ta.select();
          try { if (navigator.clipboard) navigator.clipboard.writeText(ta.value); } catch (e) {}
          ui.toast('Save string ready to copy');
        });
        tap(im, function () {
          if (G.save.importString(ta.value)) { ui.toast('Save imported'); ui.rebuildAll(); } else ui.toast('That save string is not valid');
        });
        var armed = 0;
        tap(rs, function () {
          if (!armed) { armed = 1; rs.textContent = 'Tap again to erase'; setTimeout(function () { armed = 0; rs.textContent = 'Reset'; }, 3000); return; }
          G.save.reset(); seenBiz = {}; ui.toast('Progress erased'); ui.rebuildAll(); armed = 0; rs.textContent = 'Reset';
        });
        row.appendChild(ex); row.appendChild(im); row.appendChild(rs); b.appendChild(row);
      }
    });
  };

  ui.rebuildAll = function () { try { G.inventory.ensureStarter(); } catch (e) {} inv.sel = null; inv.sig = ''; seenBiz = {}; ui.update('init'); };

  ui.init = function () {
    try { G.inventory.ensureStarter(); } catch (e) {}
    buildBiz(); buildCrew(); buildInv(); buildShop(); buildRaid();
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) { tap(b, function () { ui.setTab(b.getAttribute('data-tab')); }); });
    Array.prototype.forEach.call(document.querySelectorAll('#buymode button'), function (b) {
      tap(b, function () {
        ui.mode = b.getAttribute('data-m'); sfx('click');
        Array.prototype.forEach.call(document.querySelectorAll('#buymode button'), function (x) { x.classList.toggle('on', x === b); });
        ui.update(true);
      });
    });
    tap($('btn-settings'), function () { sfx('click'); ui.showSettings(); });
    ui.layout(); window.addEventListener('resize', ui.layout); window.addEventListener('orientationchange', ui.layout);
    ui.update('init');
  };

  G.ui = ui;
})();
