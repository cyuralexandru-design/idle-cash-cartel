/* Arena DOM overlays: level-up cards, shop, pause. Classes prefixed arena-. A UI agent can restyle via CSS. */
window.G = window.G || {};
(function () {
  var CSS = [
    '.arena-layer{position:absolute;box-sizing:border-box;z-index:20;background:rgba(14,15,18,.985);color:#f2efe9;font-family:system-ui,Segoe UI,Roboto,sans-serif;overflow:hidden auto;padding:2.2% 3.5%;display:flex;flex-direction:column;gap:.6em;-webkit-user-select:none;user-select:none;touch-action:manipulation}',
    '.arena-layer *{box-sizing:border-box}',
    '.arena-title{font-size:1.7em;font-weight:800;letter-spacing:.06em;text-align:center;color:#e8a317;margin:.1em 0}',
    '.arena-sub{font-size:.95em;text-align:center;opacity:.8}',
    '.arena-row{display:flex;gap:.5em;align-items:center;justify-content:space-between;flex-wrap:wrap}',
    '.arena-cards{display:grid;grid-template-columns:1fr 1fr;gap:.6em}',
    '.arena-card,.arena-offer,.arena-wslot{background:#1f2227;border:2px solid #444;border-radius:.7em;padding:.6em;color:#f2efe9;text-align:left;font:inherit;cursor:pointer;display:flex;flex-direction:column;gap:.3em;min-height:7.5em;position:relative}',
    '.arena-card:active,.arena-offer:active{transform:scale(.98)}',
    '.arena-tier-1{border-color:#9aa0a6}.arena-tier-2{border-color:#4fa3e0}.arena-tier-3{border-color:#a45ee0}.arena-tier-4{border-color:#e8a317;box-shadow:0 0 .8em rgba(232,163,23,.5)}',
    '.arena-emblem{width:2.6em;height:2.6em;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.95em;color:#14161a;flex:none;overflow:hidden}',
    '.arena-emblem img{width:100%;height:100%;object-fit:contain}',
    '.arena-name{font-weight:700;font-size:1.02em}',
    '.arena-desc{font-size:.85em;opacity:.85}',
    '.arena-tag{font-size:.75em;font-weight:700;opacity:.9}',
    '.arena-btn{background:#e8a317;color:#14161a;border:0;border-radius:.6em;padding:.6em .9em;font:inherit;font-weight:800;cursor:pointer;min-height:2.6em}',
    '.arena-btn.arena-sec{background:#2d3138;color:#f2efe9;border:1px solid #555}',
    '.arena-btn[disabled],.arena-offer[disabled]{opacity:.4;cursor:not-allowed}',
    '.arena-money{color:#4caf50;font-weight:800}',
    '.arena-lock.arena-on{background:#b3202a;color:#fff}',
    '.arena-sold{opacity:.35;pointer-events:none}',
    '.arena-owned{display:grid;grid-template-columns:repeat(3,1fr);gap:.4em}',
    '.arena-wslot{min-height:5em;padding:.4em;cursor:default;font-size:.88em}',
    '.arena-wslot.arena-empty{opacity:.35;justify-content:center;align-items:center}',
    '.arena-chips{display:flex;flex-wrap:wrap;gap:.3em;font-size:.8em}',
    '.arena-chip{background:#2d3138;border-radius:1em;padding:.2em .6em;cursor:pointer}',
    '.arena-toast{position:absolute;left:50%;top:12%;transform:translateX(-50%);background:#e8a317;color:#14161a;font-weight:800;padding:.5em 1em;border-radius:1em;z-index:30;font-family:system-ui,sans-serif;pointer-events:none}',
    '.arena-pause-box{margin:auto;display:flex;flex-direction:column;gap:.8em;width:70%}'
  ].join('');

  var canvas = null, layer = null, toastEl = null, resizeFn = null;

  function injectCss() {
    if (document.getElementById('arena-ui-css')) return;
    var s = document.createElement('style'); s.id = 'arena-ui-css'; s.textContent = CSS; document.head.appendChild(s);
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e;
  }
  function sfx(n) { try { G.audio && G.audio.play(n); } catch (e) {} }
  function layout() {
    if (!layer || !canvas) return;
    var w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
    layer.style.left = canvas.offsetLeft + 'px'; layer.style.top = canvas.offsetTop + 'px';
    layer.style.width = w + 'px'; layer.style.height = h + 'px';
    layer.style.fontSize = Math.max(11.5, Math.min(18, w / 30)) + 'px';
  }
  function open() {
    close();
    layer = el('div', 'arena-layer');
    canvas.parentElement.appendChild(layer);
    layout();
    return layer;
  }
  function close() { if (layer && layer.parentNode) layer.parentNode.removeChild(layer); layer = null; }

  function emblem(kind, id, text, color) {
    var e = el('div', 'arena-emblem');
    var M = window.G_MANIFEST, ent = null;
    try {
      if (kind === 'stat' && M && M.stats) ent = M.stats[id];
      if (kind === 'weapon' && M && M.weapons) ent = (M.weapons[id] && (M.weapons[id].side || M.weapons[id])) || null;
      if (kind === 'item' && M && M.items) ent = M.items[id];
    } catch (x) {}
    if (ent && ent.file) {
      var img = new Image(); img.src = ent.file; img.alt = ''; e.style.background = 'transparent'; e.appendChild(img);
      img.onerror = function () { e.removeChild(img); e.style.background = color || '#888'; e.textContent = text; };
    } else { e.style.background = color || '#888'; e.textContent = text; }
    return e;
  }
  function initials(n) { var p = String(n).split(/[\s-]+/); return (p.length > 1 ? p[0][0] + p[1][0] : n.slice(0, 2)).toUpperCase(); }

  G.arenaUI = {
    attach: function (cv) {
      canvas = cv; injectCss();
      var p = cv.parentElement;
      try { if (p && getComputedStyle(p).position === 'static') p.style.position = 'relative'; } catch (e) {}
      resizeFn = layout; window.addEventListener('resize', resizeFn);
    },
    detach: function () {
      close(); if (toastEl && toastEl.parentNode) toastEl.parentNode.removeChild(toastEl);
      if (resizeFn) window.removeEventListener('resize', resizeFn); resizeFn = null; canvas = null;
    },
    hide: close,
    isOpen: function () { return !!layer; },
    toast: function (msg) {
      if (!canvas) return;
      if (toastEl && toastEl.parentNode) toastEl.parentNode.removeChild(toastEl);
      toastEl = el('div', 'arena-toast', msg); canvas.parentElement.appendChild(toastEl);
      var t = toastEl; setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 1500);
    },

    // view: {level, pendingLeft, cash, rerollCost, canReroll, choices:[{statId,name,tier,tierName,valueText,desc,color}]}
    // act: {pick(i), reroll()}
    showCards: function (view, act) {
      var L = open();
      L.setAttribute('data-screen', 'cards');
      L.appendChild(el('div', 'arena-title', 'LEVEL UP  ' + view.level));
      L.appendChild(el('div', 'arena-sub', 'Pick 1 of ' + view.choices.length + (view.pendingLeft > 0 ? '  (' + view.pendingLeft + ' more after this)' : '')));
      var grid = el('div', 'arena-cards'); L.appendChild(grid);
      view.choices.forEach(function (c, i) {
        var b = el('button', 'arena-card arena-tier-' + (c.tier + 1)); b.setAttribute('data-i', i); b.setAttribute('data-stat', c.statId);
        var top = el('div', 'arena-row'); top.style.justifyContent = 'flex-start';
        top.appendChild(emblem('stat', c.statId, c.emblem, c.color));
        var nm = el('div'); nm.appendChild(el('div', 'arena-name', c.name)); nm.appendChild(el('div', 'arena-tag', 'Tier ' + c.tierName));
        top.appendChild(nm); b.appendChild(top);
        b.appendChild(el('div', 'arena-name', c.valueText)); b.appendChild(el('div', 'arena-desc', c.desc));
        b.onclick = function () { sfx('click'); act.pick(i); };
        grid.appendChild(b);
      });
      var row = el('div', 'arena-row');
      row.appendChild(el('div', 'arena-money', 'Cash $' + view.cash));
      var rr = el('button', 'arena-btn arena-sec', 'Reroll  $' + view.rerollCost); rr.setAttribute('data-act', 'reroll');
      rr.disabled = !view.canReroll; rr.onclick = function () { sfx('click'); act.reroll(); };
      row.appendChild(rr); L.appendChild(row);
    },

    // view: {wave, cash, rerollCost, offers:[{kind,id,name,desc,price,locked,sold,canBuy,why,tier,emblem,color}], weapons:[{slot,id,name,tier,tierName,sellPrice,canMerge}|null], items:[{id,name,count,sellPrice}], mergePrompt, lastWave}
    // act: {buy(i), lock(i), reroll(), recycleWeapon(slot), recycleItem(id), merge(slot), next()}
    showShop: function (view, act) {
      var scroll = layer ? layer.scrollTop : 0;
      var L = open(); L.setAttribute('data-screen', 'shop');
      L.appendChild(el('div', 'arena-title', 'SHOP  -  after wave ' + view.wave));
      var top = el('div', 'arena-row');
      top.appendChild(el('div', 'arena-money', 'Cash $' + view.cash));
      var rr = el('button', 'arena-btn arena-sec', 'Reroll  $' + view.rerollCost); rr.setAttribute('data-act', 'reroll');
      rr.disabled = view.cash < view.rerollCost; rr.onclick = function () { sfx('click'); act.reroll(); };
      top.appendChild(rr); L.appendChild(top);
      if (view.mergePrompt) L.appendChild(el('div', 'arena-sub', view.mergePrompt));
      var grid = el('div', 'arena-cards'); L.appendChild(grid);
      view.offers.forEach(function (o, i) {
        var box = el('div', 'arena-offer arena-tier-' + (o.tier + 1) + (o.sold ? ' arena-sold' : '')); box.setAttribute('data-offer', i); box.style.cursor = 'default';
        var t = el('div', 'arena-row'); t.style.justifyContent = 'flex-start';
        t.appendChild(emblem(o.kind, o.id, o.emblem, o.color));
        var nm = el('div'); nm.appendChild(el('div', 'arena-name', o.name));
        nm.appendChild(el('div', 'arena-tag', o.kind === 'weapon' ? 'Weapon  Tier ' + o.tierName : 'Item')); t.appendChild(nm); box.appendChild(t);
        box.appendChild(el('div', 'arena-desc', o.desc));
        var r = el('div', 'arena-row');
        var buy = el('button', 'arena-btn arena-buy', o.sold ? 'Sold' : (o.canBuy ? 'Buy $' + o.price : (o.why || 'Buy $' + o.price)));
        buy.disabled = !o.canBuy || o.sold; buy.onclick = function () { act.buy(i); };
        var lk = el('button', 'arena-btn arena-sec arena-lock' + (o.locked ? ' arena-on' : ''), o.locked ? 'Locked' : 'Lock'); lk.setAttribute('data-act', 'lock');
        lk.onclick = function () { sfx('click'); act.lock(i); };
        r.appendChild(buy); r.appendChild(lk); box.appendChild(r); grid.appendChild(box);
      });
      L.appendChild(el('div', 'arena-sub', 'Your weapons (' + view.weapons.filter(Boolean).length + '/' + view.weapons.length + ')'));
      var own = el('div', 'arena-owned'); L.appendChild(own);
      view.weapons.forEach(function (w) {
        if (!w) { own.appendChild(el('div', 'arena-wslot arena-empty', 'empty')); return; }
        var s = el('div', 'arena-wslot arena-tier-' + (w.tier + 1)); s.setAttribute('data-slot', w.slot);
        s.appendChild(el('div', 'arena-name', w.name + ' ' + w.tierName));
        var br = el('div', 'arena-row');
        if (w.canMerge) { var m = el('button', 'arena-btn arena-merge', 'Merge'); m.setAttribute('data-act', 'merge'); m.onclick = function () { sfx('buy'); act.merge(w.slot); }; br.appendChild(m); }
        var rc = el('button', 'arena-btn arena-sec', 'Sell $' + w.sellPrice); rc.setAttribute('data-act', 'recycle'); rc.onclick = function () { sfx('click'); act.recycleWeapon(w.slot); };
        br.appendChild(rc); s.appendChild(br); own.appendChild(s);
      });
      if (view.items.length) {
        L.appendChild(el('div', 'arena-sub', 'Items (tap to recycle for 25%)'));
        var ch = el('div', 'arena-chips');
        view.items.forEach(function (it) {
          var c = el('span', 'arena-chip', it.name + (it.count > 1 ? ' x' + it.count : '') + '  $' + it.sellPrice); c.setAttribute('data-item', it.id);
          c.onclick = function () { sfx('click'); act.recycleItem(it.id); }; ch.appendChild(c);
        });
        L.appendChild(ch);
      }
      var nx = el('button', 'arena-btn', view.lastWave ? 'FINISH' : 'START WAVE ' + (view.wave + 1)); nx.setAttribute('data-act', 'next');
      nx.style.marginTop = 'auto'; nx.style.fontSize = '1.15em'; nx.onclick = function () { sfx('click'); act.next(); };
      L.appendChild(nx);
      L.scrollTop = scroll;
    },

    showPause: function (act) {
      var L = open(); L.setAttribute('data-screen', 'pause');
      var box = el('div', 'arena-pause-box'); L.appendChild(box);
      box.appendChild(el('div', 'arena-title', 'PAUSED'));
      var r = el('button', 'arena-btn', 'Resume'); r.setAttribute('data-act', 'resume'); r.onclick = function () { sfx('click'); act.resume(); };
      var q = el('button', 'arena-btn arena-sec', 'Abandon run'); q.setAttribute('data-act', 'quit'); q.onclick = function () { sfx('click'); act.quit(); };
      box.appendChild(r); box.appendChild(q);
    },
    helpers: { initials: initials }
  };
})();
