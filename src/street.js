// street.js - builds a convincing rainy-night street level from the P2 tileset (assets/street/<chapter>/*).
// Classic script. window.G.street = { load(cb), ready(), build(ch,W,H,seed), solids(ch,seed,W,H), props(ch,seed,W,H), drawProp(ctx,p), drawProps(ctx,ch,seed,view,W,H) }
// Layout (world px, W x H; default 1620x2400): facade wall (top) / sidewalk+curb / road (long axis = X) / curb+sidewalk / facade wall (bottom;
// docklands bottom = quay wall with water). Everything is deterministic per (chapter,W,H,seed).
// props are NOT baked into build() (only their ground shadows are) - draw them y-sorted in the entity pass.
window.G = window.G || {};
(function () {
  'use strict';
  var CHAPTERS = ['docklands', 'soho', 'canary'];
  var imgs = {};            // file -> Image
  var loaded = false, started = false, failed = 0;
  var cache = {};           // layout cache
  var buildCache = {};

  // ---------- helpers ----------
  function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rngFor(seed, tag) {
    var a = (hash(String(tag)) ^ (seed * 2654435761)) >>> 0;
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function cv(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
  function man(ch) { return window.G_MANIFEST && window.G_MANIFEST.street && window.G_MANIFEST.street[ch]; }
  function im(entry) { return entry && imgs[entry.file] && imgs[entry.file].complete && imgs[entry.file].naturalWidth ? imgs[entry.file] : null; }
  function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
  function rr(rng, a, b) { return a + (b - a) * rng(); }

  function collectFiles() {
    var files = {};
    function walk(o) {
      if (!o) return;
      if (Array.isArray(o)) { o.forEach(walk); return; }
      if (typeof o === 'object') { if (typeof o.file === 'string') files[o.file] = 1; for (var k in o) if (typeof o[k] === 'object') walk(o[k]); }
    }
    CHAPTERS.forEach(function (c) { walk(man(c)); });
    return Object.keys(files);
  }

  function load(cb) {
    if (loaded) { cb && cb(true); return; }
    var fs = collectFiles();
    if (!fs.length) { loaded = true; failed = 1; cb && cb(false); return; }
    if (started) { // already loading: poll
      var t = setInterval(function () { if (loaded) { clearInterval(t); cb && cb(failed === 0); } }, 50); return;
    }
    started = true;
    var left = fs.length;
    fs.forEach(function (f) {
      var i = new Image();
      i.onload = i.onerror = function () { if (!(i.naturalWidth > 0)) failed++; if (--left === 0) { loaded = true; cb && cb(failed === 0); } };
      i.src = f; imgs[f] = i;
    });
  }
  function ready(ch) {
    if (!loaded) return false;
    var chs = ch ? [ch] : CHAPTERS;
    for (var i = 0; i < chs.length; i++) { var m = man(chs[i]); if (!m || !isUsable(m)) return false; }
    return true;
  }
  function isUsable(m) {
    return !!(im(m.ground && m.ground[0]) && m.sidewalk && im(m.sidewalk.fill) && m.facades && m.facades.length && im(m.facades[0]));
  }
  function gfind(m, id) { var g = m.ground || []; for (var i = 0; i < g.length; i++) if (g[i].id === id) return im(g[i]); return null; }

  // ---------- layout ----------
  // World (default 1000 x 1500): facade wall top / sidewalk / road (lanes run along Y) / sidewalk / facade wall bottom (docklands: quay),
  // plus facade side walls + sidewalks on BOTH left and right, so buildings are never more than ~300px away.
  var PROF = {
    docklands: { FH: 230, SWt: 170, SWb: 110, sideWall: 105, sideSW: 85, roadTile: 'seam_paving', roadScale: .62, swTile: 'seam_sidewalk', swScale: 1,
      grade: [['multiply', 'rgb(150,175,205)', .85], ['overlay', 'rgb(30,70,130)', .22]], lamp: '175,205,255', cars: ['#3d5a78', '#7a8590', '#a84a2c', '#2b3138'], kerbGut: true },
    soho: { FH: 235, SWt: 150, SWb: 150, sideWall: 105, sideSW: 175, roadTile: 'seam_asphalt', roadScale: 1, swTile: 'seam_sidewalk', swScale: 1,
      grade: [['multiply', 'rgb(215,185,225)', .5], ['overlay', 'rgb(90,20,100)', .1]], lamp: '255,90,150', cars: ['#7b2a4a', '#1f6f73', '#2a2438', '#b0b0c0'], kerbGut: true },
    canary: { FH: 245, SWt: 185, SWb: 185, sideWall: 105, sideSW: 105, roadTile: 'seam_asphalt', roadScale: 1, swTile: 'seam_paving', swScale: .6,
      grade: [['screen', 'rgb(70,100,140)', .26], ['overlay', 'rgb(120,170,230)', .2]], lamp: '190,220,255', cars: ['#d8dde4', '#1c2430', '#3a6fb0', '#8a919c'], kerbGut: false }
  };
  function plan(ch, W, H, seed) {
    var key = ch + '|' + W + '|' + H + '|' + seed;
    if (cache[key]) return cache[key];
    var m = man(ch); if (!m || !isUsable(m)) return null;
    var P = PROF[ch] || PROF.docklands;
    var rw = rngFor(seed, ch + 'walls'), rp = rngFor(seed, ch + 'props'), rd = rngFor(seed, ch + 'decals');
    var L = { ch: ch, W: W, H: H, seed: seed, m: m, P: P };
    var quay = ch === 'docklands' && m.quay && im(m.quay[0]);
    L.FHt = P.FH; L.FHb = quay ? Math.round(W / Math.ceil(W / 540) * (m.quay[0].h / m.quay[0].w)) : P.FH;
    L.quay = !!quay; L.SWt = P.SWt; L.SWb = P.SWb; L.sideWall = P.sideWall;
    var cs = m.sidewalk.curbStraight.filter(Boolean);
    L.curbS = 0.9; L.curbH = Math.round(cs[0].h * L.curbS);
    L.y1t = L.FHt + L.SWt; L.y1b = H - L.FHb - L.SWb;
    L.x0 = L.sideWall + P.sideSW; L.x1 = W - L.sideWall - P.sideSW;
    L.roadMid = (L.y1t + L.y1b) / 2; L.roadH = L.y1b - L.y1t; L.roadW = L.x1 - L.x0; L.xMid = (L.x0 + L.x1) / 2;
    L.yC = Math.round(L.y1t + L.roadH * rr(rd, .22, .3));   // the one small zebra crossing
    L.spawn = { x: W / 2, y: H / 2 + 60 };
    L.wallTop = wall(m, W, L.FHt, rw, ch);
    if (!quay) L.wallBot = wall(m, W, L.FHb, rw, ch);
    L.wallL = wall(m, H, L.sideWall, rw, ch); L.wallR = wall(m, H, L.sideWall, rw, ch);
    L.props = []; L.solids = [];
    placeProps(L, rp);
    L.props.sort(function (a, b) { return a.y - b.y; });
    L.solids.push({ x: 0, y: 0, w: W, h: L.FHt - 30, kind: 'wall' });
    L.solids.push({ x: 0, y: quay ? H - L.FHb + 50 : H - L.FHb + 12, w: W, h: quay ? L.FHb - 50 : L.FHb - 12, kind: 'wall' });
    L.solids.push({ x: 0, y: 0, w: L.sideWall - 14, h: H, kind: 'wall' });
    L.solids.push({ x: W - L.sideWall + 14, y: 0, w: L.sideWall - 14, h: H, kind: 'wall' });
    L.props.forEach(function (p) {
      if (!p.solid) return;
      if (p.posts) { p.posts.forEach(function (q) { L.solids.push({ x: p.x + q - 9, y: p.y - 14, w: 18, h: 14, kind: 'prop', id: p.id }); }); return; }
      L.solids.push({ x: p.x - p.footprint[0] / 2, y: p.y - p.footprint[1], w: p.footprint[0], h: p.footprint[1], kind: 'prop', id: p.id });
    });
    cache[key] = L; return L;
  }

  function wall(m, W, FH, rng, ch) {
    var pool = m.facades.filter(function (f) { return im(f); });
    var best = null, wsum = 0; pool.forEach(function (f) { wsum += (f.weight || 1); });
    for (var t = 0; t < 400; t++) {
      var seq = [], tot = 0, last = null, count = {};
      while (tot < W - 40 && seq.length < 22) {
        var r = rng() * wsum, f = pool[0];
        for (var i = 0; i < pool.length; i++) { r -= (pool[i].weight || 1); if (r <= 0) { f = pool[i]; break; } }
        if (f === last) continue;
        if ((count[f.id] || 0) >= 3) continue;
        var w = f.w * FH / f.h;
        seq.push({ f: f, w: w }); tot += w; last = f; count[f.id] = (count[f.id] || 0) + 1;
      }
      var over = tot - W; if (over < -5) continue;
      var score = Math.abs(over - 15) + (seq.length < 3 ? 50 : 0) + rng() * 4;
      if (!best || score < best.score) best = { seq: seq, tot: tot, score: score };
    }
    if (!best) { var f0 = pool[0]; best = { seq: [{ f: f0, w: f0.w * FH / f0.h }], tot: f0.w * FH / f0.h }; }
    var sx = Math.max(0.94, Math.min(1.12, W / best.tot));
    var x = 0, out = [];
    best.seq.forEach(function (s) { var w = s.w * sx; out.push({ f: s.f, x: x, w: w, h: FH }); x += w; });
    return out;
  }

  // ---------- procedural road sprites (cars, cones, barriers, bags) ----------
  var spriteCache = {};
  function rrect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function shade(hex, k) { var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; function f(v) { return Math.max(0, Math.min(255, Math.round(v * k))); } return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')'; }
  // top-down-ish car, nose up. w x h (sprite includes a little side wall below the roofline for depth)
  function carSprite(color, van, glass) {
    var key = 'car' + color + (van ? 'v' : '') + glass; if (spriteCache[key]) return spriteCache[key];
    var w = van ? 92 : 82, h = van ? 188 : 160, c = cv(w, h), x = c.getContext('2d');
    var bx = 8, bw = w - 16, by = 8, bh = h - 22;
    x.fillStyle = 'rgba(0,0,0,.45)'; rrect(x, bx + 2, by + 12, bw, bh, 16); x.fill();                 // underbody / depth
    var g = x.createLinearGradient(bx, 0, bx + bw, 0); g.addColorStop(0, shade(color, .7)); g.addColorStop(.5, shade(color, 1.18)); g.addColorStop(1, shade(color, .72));
    x.fillStyle = g; rrect(x, bx, by, bw, bh, 16); x.fill();
    x.strokeStyle = 'rgba(0,0,0,.55)'; x.lineWidth = 2; x.stroke();
    var ry = van ? by + 26 : by + 44, rh = van ? bh - 44 : bh - 98;                                   // cabin
    x.fillStyle = glass || 'rgba(14,22,34,.92)'; rrect(x, bx + 6, ry, bw - 12, rh, 10); x.fill();
    var rg = x.createLinearGradient(0, ry, 0, ry + rh); rg.addColorStop(0, shade(color, 1.25)); rg.addColorStop(1, shade(color, .95));
    x.fillStyle = rg; rrect(x, bx + 9, ry + (van ? 40 : 22), bw - 18, rh - (van ? 46 : 40), 8); x.fill();      // roof
    x.fillStyle = 'rgba(255,255,255,.14)'; rrect(x, bx + 13, ry + (van ? 44 : 25), 9, rh - (van ? 56 : 52), 4); x.fill();
    x.fillStyle = 'rgba(255,236,170,.95)'; x.fillRect(bx + 4, by + 2, 11, 5); x.fillRect(bx + bw - 15, by + 2, 11, 5);          // headlights
    x.fillStyle = 'rgba(255,40,40,.95)'; x.fillRect(bx + 4, by + bh - 7, 11, 5); x.fillRect(bx + bw - 15, by + bh - 7, 11, 5);   // tail lights
    x.fillStyle = '#0a0b0e'; [[ry - 6], [ry + rh - 18]].forEach(function (q) { x.fillRect(1, q[0], 8, 24); x.fillRect(w - 9, q[0], 8, 24); });  // wheels
    return (spriteCache[key] = c);
  }
  function rot90(src) { var c = cv(src.height, src.width), x = c.getContext('2d'); x.translate(0, c.height); x.rotate(-Math.PI / 2); x.drawImage(src, 0, 0); return c; }
  function coneSprite() {
    if (spriteCache.cone) return spriteCache.cone; var c = cv(26, 36), x = c.getContext('2d');
    x.fillStyle = '#16181c'; rrect(x, 2, 28, 22, 6, 2); x.fill();
    x.fillStyle = '#ff6a1a'; x.beginPath(); x.moveTo(13, 2); x.lineTo(21, 29); x.lineTo(5, 29); x.closePath(); x.fill();
    x.fillStyle = '#f2f2ee'; x.beginPath(); x.moveTo(11, 12); x.lineTo(15, 12); x.lineTo(17, 19); x.lineTo(9, 19); x.closePath(); x.fill();
    return (spriteCache.cone = c);
  }
  function barrierSprite() {
    if (spriteCache.bar) return spriteCache.bar; var c = cv(110, 44), x = c.getContext('2d');
    x.fillStyle = 'rgba(0,0,0,.4)'; rrect(x, 4, 14, 102, 28, 4); x.fill();
    x.fillStyle = '#e9e9e4'; rrect(x, 4, 4, 102, 26, 4); x.fill();
    x.save(); rrect(x, 4, 4, 102, 26, 4); x.clip(); x.fillStyle = '#d6301f';
    for (var i = -2; i < 9; i++) { x.beginPath(); x.moveTo(i * 16, 30); x.lineTo(i * 16 + 10, 30); x.lineTo(i * 16 + 26, 4); x.lineTo(i * 16 + 16, 4); x.closePath(); x.fill(); } x.restore();
    x.fillStyle = '#222'; x.fillRect(14, 30, 6, 10); x.fillRect(90, 30, 6, 10);
    return (spriteCache.bar = c);
  }
  function bagSprite(k) {
    var key = 'bag' + k; if (spriteCache[key]) return spriteCache[key]; var c = cv(30, 24), x = c.getContext('2d');
    x.fillStyle = 'rgba(0,0,0,.35)'; x.beginPath(); x.ellipse(15, 19, 12, 4, 0, 0, 6.3); x.fill();
    x.fillStyle = k ? '#59616e' : '#3d5a4e'; x.beginPath(); x.ellipse(15, 13, 10, 7, .2, 0, 6.3); x.fill();
    x.fillStyle = 'rgba(180,200,230,.25)'; x.beginPath(); x.ellipse(11, 8, 4, 2.5, -.4, 0, 6.3); x.fill();
    x.fillStyle = k ? '#59616e' : '#3d5a4e'; x.fillRect(13, 3, 4, 4);
    return (spriteCache[key] = c);
  }

  function placeProps(L, rng) {
    var m = L.m, W = L.W, H = L.H, P = L.P, imgsDef = {};
    var byId = {}; (m.props || []).forEach(function (p) { if (im(p)) byId[p.id] = p; });
    var topRow = [], botRow = [], lRow = [], rRow = [], roadRow = [];
    var rows = { curbT: topRow, wallT: topRow, yardT: topRow, curbB: botRow, wallB: botRow, yardB: botRow };
    var xLo = L.sideWall + 36, xHi = W - L.sideWall - 36;
    var yCurbT = L.y1t - L.curbH - 8, yCurbB = L.y1b + L.curbH + 36;
    var yWallT = L.FHt + 66, yWallB = H - L.FHb - 12;
    function free(row, x, hw, y) {
      var r = rows[row]; if (x - hw < xLo || x + hw > xHi) return false;
      for (var i = 0; i < r.length; i++) if (Math.abs(r[i].x - x) < r[i].hw + hw + 12) return false;
      return true;
    }
    function mk(id, x, y, row, opt) {
      var d = byId[id]; if (!d) return null;
      var w = d.w * d.scale, h = d.h * d.scale;
      var p = { id: id, img: imgs[d.file], x: Math.round(x), y: Math.round(y), w: w, h: h, dx: -w / 2, dy: -d.anchor[1] * d.scale,
        footprint: d.footprint.slice(), solid: d.solid && !(opt && opt.nosolid), zone: d.zone, row: row, hw: w / 2 };
      if (opt && opt.flip) p.flip = true;
      (rows[row] || (row === 'L' ? lRow : rRow)).push(p); L.props.push(p); return p;
    }
    function scatter(id, row, y0, jit, n, pad, tries) {
      var d = byId[id]; if (!d) return;
      var hw = d.w * d.scale / 2, c = 0;
      for (var t = 0; t < (tries || 60) && c < n; t++) {
        var x = rr(rng, xLo + hw, xHi - hw);
        if (!free(row, x, hw + (pad || 0))) continue;
        mk(id, x, y0 + rr(rng, 0, jit), row); c++;
      }
    }
    // crossing: traffic lights at the curb on both sides of the zebra
    var xs = [L.x0 - 36, L.x1 + 36];
    mk('prop_traffic_light', L.x0 + 30, yCurbT, 'curbT'); mk('prop_traffic_light', L.x1 - 30, yCurbB, 'curbB');
    // lamps along the top/bottom curb
    [['T', yCurbT, 0], ['B', yCurbB, 200]].forEach(function (s) {
      for (var x = xLo + 90 + s[2] + rr(rng, 0, 40); x < xHi - 60; x += 400 + rr(rng, -40, 50)) if (free('curb' + s[0], x, 22)) mk('prop_lamp', x, s[1] + 4, 'curb' + s[0]);
    });
    var rail = byId.prop_railing || byId.prop_glass_railing;
    if (rail && L.ch !== 'soho') {
      [['T', yCurbT], ['B', yCurbB]].forEach(function (s, si) {
        var n = 2, w = rail.w * rail.scale * 0.97, tot = n * w;
        for (var t = 0; t < 40; t++) {
          var x0 = rr(rng, xLo + 30, xHi - 30 - tot), ok = true;
          for (var k = 0; k < n && ok; k++) if (!free('curb' + s[0], x0 + w * (k + .5), w / 2 - 6)) ok = false;
          if (!ok) continue;
          for (var k = 0; k < n; k++) mk(rail.id, x0 + w * (k + .5), s[1] + (si ? 8 : 4), 'curb' + s[0]);
          break;
        }
      });
    }
    scatter('prop_bus_stop', 'curbT', yCurbT, 4, 1, 20);
    scatter('prop_bollard', 'curbB', yCurbB, 2, 3, 6, 80);
    if (byId.prop_paifang) {
      var d = byId.prop_paifang, pw = d.w * d.scale;
      for (var t = 0; t < 40; t++) {
        var ax = rr(rng, xLo + pw / 2, xHi - pw / 2);
        if (!free('curbT', ax, pw / 2 + 10)) continue;
        var p = mk('prop_paifang', ax, yCurbT - 4, 'curbT'); if (p) p.posts = [-pw * 0.36, pw * 0.36]; break;
      }
    }
    ['T', 'B'].forEach(function (s) {
      var row = 'wall' + s, y0 = s === 'T' ? yWallT : yWallB;
      scatter('prop_phone_box', row, y0, 6, 1, 50); scatter('prop_post_box', row, y0, 6, 1, 40);
      scatter('prop_bin', row, y0, 8, 2, 50); scatter('prop_bench', row, y0, 6, 1, 30);
    });
    scatter('prop_tube_sign', 'wallT', yWallT + 8, 4, 1, 50);
    scatter('prop_neon_dragon', 'wallT', yWallT, 4, 1, 40);
    // docklands: containers/crates/barrels along the wall + quay
    if (byId.prop_container_red) {
      ['T', 'B'].forEach(function (s) {
        var row = 'yard' + s, y0 = s === 'T' ? yWallT + 20 : yWallB - 6;
        ['prop_container_red', 'prop_container_blue', 'prop_container_yellow'].forEach(function (id, i) { if (s === 'B' || i === 0) scatter(id, row, y0, 6, 1, 20); });
        scatter('prop_crate', row, y0, 8, 1, 14); scatter('prop_barrel', row, y0, 8, 2, 14);
      });
      scatter('prop_crane', 'yardB', yWallB - 4, 4, 1, 20);
    }
    // side sidewalks (left/right): lamps, bins, post box, bollards, bench - x centred on the sidewalk
    var sideX = [L.sideWall + P.sideSW * .5 - 2, W - L.sideWall - P.sideSW * .5 + 2];
    [0, 1].forEach(function (sd) {
      var row = sd ? 'R' : 'L', sx = sideX[sd], arr = sd ? rRow : lRow, y = L.y1t + 40 + rr(rng, 0, 80);
      var kinds = L.ch === 'soho' ? ['prop_lamp', 'prop_bin', 'prop_bench', 'prop_post_box', 'prop_lamp', 'prop_phone_box'] : ['prop_lamp', 'prop_bollard', 'prop_bin', 'prop_lamp', 'prop_bench', 'prop_post_box'];
      var gap = L.ch === 'soho' ? 170 : 190, i = sd * 2;
      for (; y < L.y1b - 70; y += gap + rr(rng, -20, 50)) {
        var id = kinds[(i++) % kinds.length]; if (!byId[id]) continue;
        var d = byId[id], xoff = id === 'prop_bench' ? 0 : rr(rng, -8, 8);
        if (id === 'prop_bench' && P.sideSW < 120) id = byId.prop_bollard ? 'prop_bollard' : id;
        mk(id, sx + xoff, y, row);
      }
    });
    // ---- IN-ROAD props: parked cars along both kerbs, barriers/cones/bags in the playable area (kept clear of the spawn point)
    var carsBase = P.cars, rx0 = L.x0, rx1 = L.x1;
    function clearOfSpawn(x, y, r) { var dx = x - L.spawn.x, dy = y - L.spawn.y; return dx * dx + dy * dy > r * r; }
    function roadFree(x, y, hw, hh) {
      for (var i = 0; i < roadRow.length; i++) { var q = roadRow[i]; if (Math.abs(q.x - x) < q.hw + hw + 24 && Math.abs(q.y - y) < q.hh + hh + 24) return false; }
      for (var j = 0; j < L.props.length; j++) { var o = L.props[j]; if (o.row === 'road') continue; }
      return true;
    }
    function addRoad(sprite, x, y, w, h, fw, fh, solid, tag) {
      var p = { id: tag, img: sprite, x: Math.round(x), y: Math.round(y), w: w, h: h, dx: -w / 2, dy: -h, footprint: [fw, fh], solid: solid, zone: 'road', row: 'road', hw: fw / 2, hh: fh };
      roadRow.push(p); L.props.push(p); return p;
    }
    var nCar = 0, tries = 0, side = 0;
    while (nCar < 5 && tries++ < 80) {
      var van = rng() < .25, sp = carSprite(pick(rng, carsBase), van, P.glass), cwid = sp.width, chei = sp.height, left = (side++ % 2) === 0;
      var cx = left ? rx0 + 8 + cwid / 2 : rx1 - 8 - cwid / 2, cy = L.y1t + 90 + rr(rng, 0, L.roadH - 220);
      if (Math.abs(cy - (L.yC + 30)) < chei + 40) continue;
      if (!clearOfSpawn(cx, cy - chei / 2, 190)) continue;
      if (!roadFree(cx, cy, cwid * .45, chei)) continue;
      addRoad(sp, cx, cy, cwid, chei, cwid * .78, chei * .86, true, 'car'); nCar++;
    }
    // abandoned car across a lane, barrier pairs, cones
    var cs = carSprite(pick(rng, carsBase), false, P.glass), csr = rot90(cs);
    for (var t = 0; t < 40; t++) {
      var ax = rr(rng, rx0 + 150, rx1 - 150), ay = rr(rng, L.y1t + 140, L.y1b - 100);
      if (!clearOfSpawn(ax, ay - 40, 230) || Math.abs(ay - L.yC) < 140 || !roadFree(ax, ay, csr.width * .5, csr.height)) continue;
      addRoad(csr, ax, ay, csr.width, csr.height, csr.width * .86, csr.height * .78, true, 'car'); break;
    }
    var bs = barrierSprite(), nb = 0;
    for (var t = 0; t < 60 && nb < 3; t++) {
      var bx = rr(rng, rx0 + 90, rx1 - 90), by = rr(rng, L.y1t + 70, L.y1b - 70);
      if (!clearOfSpawn(bx, by, 210) || Math.abs(by - L.yC) < 90 || !roadFree(bx, by, 56, 30)) continue;
      addRoad(bs, bx, by, bs.width, bs.height, 100, 18, true, 'barrier'); nb++;
      for (var k = 0; k < 2; k++) addRoad(coneSprite(), bx + (k ? 84 : -84), by + 6, 26, 36, 12, 8, false, 'cone');
    }
    var cn = coneSprite();
    for (var t = 0, n2 = 0; t < 40 && n2 < 5; t++) {
      var qx = rr(rng, rx0 + 40, rx1 - 40), qy = rr(rng, L.y1t + 60, L.y1b - 40);
      if (!clearOfSpawn(qx, qy, 150) || !roadFree(qx, qy, 14, 10)) continue;
      addRoad(cn, qx, qy, 26, 36, 12, 8, true, 'cone'); n2++;
    }
    for (var t = 0, n3 = 0; t < 60 && n3 < 7; t++) {
      var tx = rr(rng, rx0 + 30, rx1 - 30), ty = rr(rng, L.y1t + 40, L.y1b - 30);
      if (!clearOfSpawn(tx, ty, 120) || !roadFree(tx, ty, 14, 10)) continue;
      addRoad(bagSprite(n3 & 1), tx, ty, 30, 24, 20, 8, false, 'bag'); n3++;
    }
    if (L.ch === 'docklands') {
      for (var t = 0, n4 = 0; t < 40 && n4 < 3; t++) {
        var id = ['prop_crate', 'prop_barrel', 'prop_crate'][n4], d = byId[id]; if (!d) break;
        var kx = rr(rng, rx0 + 70, rx1 - 70), ky = rr(rng, L.y1t + 80, L.y1b - 60);
        if (!clearOfSpawn(kx, ky, 190) || Math.abs(ky - L.yC) < 100 || !roadFree(kx, ky, 50, 30)) continue;
        var q = mk(id, kx, ky, 'road'); if (q) { q.hh = q.footprint[1]; roadRow.push(q); n4++; }
      }
    }
    L.props.forEach(function (p) { delete p.hw; delete p.hh; });
  }

  // ---------- drawing ----------
  function tileFill(ctx, img, x0, y0, x1, y1, rng, scale, flips) {
    var tw = img.width * scale, th = img.height * scale;
    ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
    for (var y = y0, j = 0; y < y1; y += th, j++) for (var x = x0, i = 0; x < x1; x += tw, i++) {
      var fx = flips && rng() < .5, fy = flips && rng() < .5;
      ctx.save(); ctx.translate(Math.floor(x) + (fx ? Math.ceil(tw) + 1 : 0), Math.floor(y) + (fy ? Math.ceil(th) + 1 : 0)); ctx.scale(fx ? -1 : 1, fy ? -1 : 1);
      ctx.drawImage(img, 0, 0, Math.ceil(tw) + 1, Math.ceil(th) + 1); ctx.restore();
    }
    ctx.restore();
  }
  function feathered(img, rng, size, strength) {
    // returns canvas of img with irregular soft alpha edge
    var w = img.width, h = img.height, c = cv(w, h), x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    var mk = cv(w, h), mx = mk.getContext('2d');
    mx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < 7; i++) {
      var cx = w * rr(rng, .3, .7), cy = h * rr(rng, .3, .7), r = Math.min(w, h) * rr(rng, .22, .42);
      var g = mx.createRadialGradient(cx, cy, r * .15, cx, cy, r);
      g.addColorStop(0, 'rgba(255,255,255,' + (strength || 0.9) + ')'); g.addColorStop(1, 'rgba(255,255,255,0)');
      mx.fillStyle = g; mx.fillRect(0, 0, w, h);
    }
    x.globalCompositeOperation = 'destination-in'; x.drawImage(mk, 0, 0);
    return c;
  }
  function stamp(ctx, img, cx, cy, sc, rot, alpha, flipX, mode) {
    ctx.save(); ctx.globalAlpha = alpha == null ? 1 : alpha; if (mode) ctx.globalCompositeOperation = mode;
    ctx.translate(cx, cy); ctx.rotate(rot || 0); ctx.scale((flipX ? -1 : 1) * sc, sc);
    ctx.drawImage(img, -img.width / 2, -img.height / 2); ctx.restore();
  }
  function glowAt(ctx, x, y, r, rgb, a, mode) {
    ctx.save(); ctx.globalCompositeOperation = mode || 'lighter';
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(' + rgb + ',' + a + ')'); g.addColorStop(.55, 'rgba(' + rgb + ',' + a * .35 + ')'); g.addColorStop(1, 'rgba(' + rgb + ',0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
  }
  var REFL = { docklands: ['150,175,215', '255,170,90'], soho: ['255,90,110', '255,190,80'], canary: ['90,150,255', '255,200,110'] };
  function puddle(ctx, rng, cx, cy, r, ch) {
    var n = 6 + Math.floor(rng() * 4), blobs = [];
    for (var i = 0; i < n; i++) { var a = rng() * 6.283, d = rng() * r * .6; blobs.push([cx + Math.cos(a) * d * 1.5, cy + Math.sin(a) * d * .8, r * rr(rng, .35, .7), r * rr(rng, .22, .45), rng() * 3]); }
    function path() { ctx.beginPath(); blobs.forEach(function (b) { ctx.moveTo(b[0] + b[2], b[1]); ctx.ellipse(b[0], b[1], b[2], b[3], b[4], 0, 6.2832); }); }
    ctx.save();
    path(); ctx.fillStyle = 'rgba(6,9,15,.62)'; ctx.fill();
    ctx.clip();
    var rc = REFL[ch] || REFL.docklands;
    var g = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
    g.addColorStop(0, 'rgba(' + rc[1] + ',0)'); g.addColorStop(.35, 'rgba(' + rc[0] + ',.09)'); g.addColorStop(.5, 'rgba(' + rc[1] + ',.06)'); g.addColorStop(1, 'rgba(' + rc[1] + ',0)');
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(cx - r * 2, cy - r, r * 4, r * 2);
    var h = ctx.createRadialGradient(cx - r * .2, cy - r * .1, 0, cx - r * .2, cy - r * .1, r * .9);
    h.addColorStop(0, 'rgba(' + rc[0] + ',.10)'); h.addColorStop(1, 'rgba(' + rc[0] + ',0)'); ctx.fillStyle = h; ctx.fillRect(cx - r * 2, cy - r, r * 4, r * 2);
    ctx.restore();
    // rain ripples
    ctx.save(); ctx.strokeStyle = 'rgba(210,225,245,.22)'; ctx.lineWidth = 1;
    for (var k = 0; k < 3; k++) { var b = blobs[Math.floor(rng() * blobs.length)], rx = rr(rng, 5, 12); ctx.beginPath(); ctx.ellipse(b[0] + rr(rng, -b[2] * .4, b[2] * .4), b[1], rx, rx * .45, 0, 0, 6.2832); ctx.stroke(); }
    ctx.restore();
  }
  var LAMP = { docklands: '255,170,80', soho: '255,120,80', canary: '170,205,255' };
  function bakeInto(ctx, L, ox, oy, cw, chh) {
    var m = L.m, W = L.W, H = L.H, ch = L.ch, P = L.P;
    var rt = rngFor(L.seed, ch + 'tiles'), rd = rngFor(L.seed, ch + 'draw'), rn = rngFor(L.seed, ch + 'noise');
    ctx.save(); ctx.translate(-ox, -oy);
    ctx.beginPath(); ctx.rect(ox, oy, cw, chh); ctx.clip();
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    var swImg = gfind(m, P.swTile) || im(m.sidewalk.fill), road = gfind(m, P.roadTile) || gfind(m, 'seam_asphalt'), crack = gfind(m, 'seam_cracked'), cobble = gfind(m, 'seam_cobble');
    var X0 = L.x0, X1 = L.x1, Y0 = L.y1t, Y1 = L.y1b, RW = L.roadW, RH = L.roadH;
    // --- sidewalks everywhere, road rectangle on top
    tileFill(ctx, swImg, 0, 0, W, H, rt, P.swScale, false);
    tileFill(ctx, road || swImg, X0 - 4, Y0 - 4, X1 + 4, Y1 + 4, rt, P.roadScale, true);
    ctx.save(); ctx.beginPath(); ctx.rect(X0, Y0, RW, RH); ctx.clip();
    for (var i = 0; i < 50; i++) {
      var bx = rr(rn, X0, X1), by = rr(rn, Y0, Y1), br = rr(rn, 80, 240), dark = rn() < .55;
      glowAt(ctx, bx, by, br, dark ? '0,0,0' : '70,80,100', dark ? rr(rn, .1, .22) : rr(rn, .04, .09), 'source-over');
    }
    // tyre tracks along the lanes (vertical)
    [.125, .375, .625, .875].forEach(function (ln) {
      [-1, 1].forEach(function (sd) {
        var tx = X0 + RW * ln + sd * 34, y = Y0 - 50;
        while (y < Y1) {
          var len = rr(rn, 120, 420), gap = rr(rn, 60, 260);
          var g = ctx.createLinearGradient(tx - 12, 0, tx + 12, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(.5, 'rgba(0,0,0,' + rr(rn, .1, .2) + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g; ctx.fillRect(tx - 12, y, 24, len); y += len + gap;
        }
      });
    });
    if (crack) for (var i = 0; i < 5; i++) {
      var f = feathered(crack, rn, 0, .95), sc = rr(rn, 1.1, 1.8);
      stamp(ctx, f, rr(rn, X0 + 60, X1 - 60), rr(rn, Y0 + 80, Y1 - 80), sc, Math.floor(rn() * 4) * Math.PI / 2, rr(rn, .45, .75), rn() < .5);
    }
    if (cobble && P.kerbGut) [[Y0, 1], [Y1, -1]].forEach(function (g) {
      var gh = 34, gy = g[1] > 0 ? g[0] : g[0] - gh;
      tileFill(ctx, cobble, X0, gy, X1, gy + gh, rd, .5, false);
      var gr = ctx.createLinearGradient(0, g[0], 0, g[0] + g[1] * gh); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; ctx.fillRect(X0, gy, RW, gh);
    });
    // oil stains with a faint rainbow sheen, debris
    for (var i = 0; i < 9; i++) {
      var ox2 = rr(rd, X0 + 50, X1 - 50), oy2 = rr(rd, Y0 + 60, Y1 - 60), orr = rr(rd, 18, 46);
      ctx.save(); ctx.translate(ox2, oy2); ctx.scale(1, rr(rd, .5, .9)); ctx.rotate(rd() * 3);
      var og = ctx.createRadialGradient(0, 0, 0, 0, 0, orr); og.addColorStop(0, 'rgba(4,4,6,.62)'); og.addColorStop(.7, 'rgba(8,8,12,.35)'); og.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = og; ctx.beginPath(); ctx.arc(0, 0, orr, 0, 6.3); ctx.fill();
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(120,70,190,.06)'; ctx.beginPath(); ctx.arc(-orr * .2, -orr * .1, orr * .55, 0, 6.3); ctx.fill();
      ctx.fillStyle = 'rgba(40,150,150,.05)'; ctx.beginPath(); ctx.arc(orr * .2, orr * .15, orr * .45, 0, 6.3); ctx.fill(); ctx.restore();
    }
    for (var i = 0; i < 26; i++) {
      ctx.save(); ctx.translate(rr(rd, X0 + 20, X1 - 20), rr(rd, Y0 + 20, Y1 - 20)); ctx.rotate(rd() * 6.3);
      ctx.fillStyle = 'rgba(' + (rd() < .5 ? '190,190,180' : '120,125,130') + ',' + rr(rd, .18, .4) + ')'; ctx.fillRect(0, 0, rr(rd, 5, 14), rr(rd, 3, 9)); ctx.restore();
    }
    ctx.restore();
    // --- wet lit patches under lamps + puddles
    var wet = gfind(m, 'ground_road_wet');
    ctx.save(); ctx.beginPath(); ctx.rect(X0, Y0, RW, RH); ctx.clip();
    if (wet) L.props.forEach(function (p) {
      if (p.id !== 'prop_lamp') return;
      var cx = Math.max(X0 + 60, Math.min(X1 - 60, p.x)), cy = Math.max(Y0 + 80, Math.min(Y1 - 80, p.y + (p.y < H / 2 ? 110 : -110)));
      stamp(ctx, feathered(wet, rd, 0, 1), cx, cy, 1.6, Math.PI / 2 * (rd() < .5 ? 1 : 3), .8, false, 'screen');
    });
    for (var i = 0; i < 9; i++) {
      var px = rr(rd, X0 + 100, X1 - 100), py = rr(rd, Y0 + 100, Y1 - 100), pr = rr(rd, 50, 115);
      puddle(ctx, rd, px, py, pr, ch);
    }
    ctx.restore();
    // --- lane markings: lanes run along Y, so the (horizontal) sprites are rotated 90 degrees
    var mk = m.markings || {};
    function mark(entry, cx, cy, sc, alpha, rot, flip) {
      var img = im(entry); if (!img) return; var w = img.width * sc, h = img.height * sc;
      ctx.save(); ctx.globalAlpha = alpha; ctx.translate(cx, cy); ctx.rotate(rot); if (flip) ctx.scale(-1, 1); ctx.drawImage(img, -w / 2, -h / 2, w, h); ctx.restore();
    }
    function vstrip(entry, x, sc, alpha) {   // tiled along Y, broken at the zebra crossing
      var img = im(entry); if (!img) return; var len = img.width * sc - 2;
      ctx.save(); ctx.beginPath(); ctx.rect(x - 60, Y0, 120, L.yC - 70 - Y0); ctx.rect(x - 60, L.yC + 70, 120, Y1 - L.yC - 70); ctx.clip();
      for (var y = Y0 - 40; y < Y1; y += len) mark(entry, x, y + len / 2, sc, alpha, Math.PI / 2, false);
      ctx.restore();
    }
    vstrip(mk.double_yellow, L.xMid, 1.45, .75);
    vstrip(mk.dash, X0 + RW * .25, 1.45, .5); vstrip(mk.dash, X0 + RW * .75, 1.45, .5);
    if (im(mk.arrow)) [[.125, 0], [.375, 0], [.625, 1], [.875, 1]].forEach(function (ln) {
      [.3, .78].forEach(function (f) {
        var ay = Y0 + RH * f; if (Math.abs(ay - L.yC) < 160) ay += 200;
        mark(mk.arrow, X0 + RW * ln[0], ay, 1.1, .26, ln[1] ? Math.PI / 2 : -Math.PI / 2, false);
      });
    });
    // the one small zebra crossing (bars run along Y, stacked across the road)
    var bar = im(mk.crosswalk_bar);
    if (bar) {
      var bsc = 1.45, bw = bar.width * bsc, bl = bar.height * bsc, step = bw * 2.1;
      ctx.save(); ctx.globalAlpha = .38;
      for (var x = X0 + 36; x < X1 - 30; x += step) ctx.drawImage(bar, x, L.yC - bl / 2, bw, bl);
      ctx.restore();
    }
    var mh = im(mk.manhole), dr = im(mk.drain);
    if (mh) for (var i = 0; i < 4; i++) {
      var mx = X0 + RW * [.2, .8, .35, .65][i] + rr(rd, -30, 30), my = Y0 + RH * [.2, .35, .72, .88][i] + rr(rd, -20, 20);
      ctx.drawImage(mh, mx - mh.width * .35, my - mh.height * .35, mh.width * .7, mh.height * .7);
    }
    if (dr) for (var x = X0 + 90 + rr(rd, 0, 40); x < X1 - 80; x += 260 + rr(rd, -30, 50)) {
      var dw = dr.width * .5, dh = dr.height * .5;
      ctx.drawImage(dr, x - dw / 2, Y0 + 6, dw, dh);
      ctx.save(); ctx.translate(x + 120 - dw / 2, Y1 - 6); ctx.scale(1, -1); ctx.drawImage(dr, 0, 0, dw, dh); ctx.restore();
    }
    // --- chapter set-dressing on the road
    if (ch === 'docklands') {   // dock railway tracks inlaid across the road
      var ty = Y0 + RH * .7;
      ctx.save(); ctx.beginPath(); ctx.rect(X0, Y0, RW, RH); ctx.clip();
      for (var x = X0; x < X1; x += 22) { ctx.fillStyle = 'rgba(46,34,24,.8)'; ctx.fillRect(x, ty - 26, 12, 52); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x + 12, ty - 26, 3, 52); }
      [-18, 18].forEach(function (o) {
        ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(X0, ty + o - 1, RW, 8);
        var g = ctx.createLinearGradient(0, ty + o - 4, 0, ty + o + 4); g.addColorStop(0, '#59616a'); g.addColorStop(.5, '#9aa4ad'); g.addColorStop(1, '#3b4249'); ctx.fillStyle = g; ctx.fillRect(X0, ty + o - 3, RW, 5);
      });
      ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.rect(X0, Y1 - 12, RW, 12); ctx.clip(); ctx.fillStyle = 'rgba(226,170,30,.55)';
      for (var x = X0 - 20; x < X1; x += 28) { ctx.beginPath(); ctx.moveTo(x, Y1); ctx.lineTo(x + 14, Y1); ctx.lineTo(x + 28, Y1 - 12); ctx.lineTo(x + 14, Y1 - 12); ctx.fill(); } ctx.restore();
    } else if (ch === 'canary') {   // yellow hatched box junction
      var hx = X0 + RW * .5 - 120, hy = Y0 + RH * .62;
      if (Math.abs(hy - L.spawn.y) < 130) hy += 190;
      ctx.save(); ctx.strokeStyle = 'rgba(235,200,40,.6)'; ctx.lineWidth = 4; ctx.strokeRect(hx, hy, 240, 150);
      ctx.beginPath(); ctx.rect(hx, hy, 240, 150); ctx.clip(); ctx.lineWidth = 3;
      for (var k = -150; k < 240; k += 26) { ctx.beginPath(); ctx.moveTo(hx + k, hy + 150); ctx.lineTo(hx + k + 150, hy); ctx.stroke(); } ctx.restore();
    }
    // --- curbs (4 sides; side ones are rotated)
    var cs = m.sidewalk.curbStraight.map(im).filter(Boolean), cScale = L.curbS, rc = rngFor(L.seed, ch + 'curb');
    if (cs.length) {
      [[Y0 - L.curbH, false], [Y1, true]].forEach(function (c) {
        var x = X0 - L.curbH;
        while (x < X1 + L.curbH) {
          var ci = pick(rc, cs), cw2 = ci.width * cScale - 1, h2 = ci.height * cScale;
          ctx.save(); ctx.translate(x, c[0] + (c[1] ? h2 : 0)); if (c[1]) ctx.scale(1, -1); ctx.drawImage(ci, 0, 0, cw2 + 1, h2); ctx.restore(); x += cw2;
        }
      });
      [0, 1].forEach(function (sd) {
        var y = Y0 - L.curbH;
        while (y < Y1 + L.curbH) {
          var ci = pick(rc, cs), cw2 = ci.width * cScale - 1, h2 = ci.height * cScale;
          ctx.save();
          if (!sd) { ctx.translate(X0 - h2, y + cw2); ctx.rotate(-Math.PI / 2); } else { ctx.translate(X1 + h2, y); ctx.rotate(Math.PI / 2); }
          ctx.drawImage(ci, 0, 0, cw2 + 1, h2); ctx.restore(); y += cw2;
        }
      });
    }
    [[Y0, 1, 0], [Y1, -1, 0], [X0, 1, 1], [X1, -1, 1]].forEach(function (g) {
      var a = g[0], b = a + g[1] * 26, gr = ctx.createLinearGradient(g[2] ? a : 0, g[2] ? 0 : a, g[2] ? b : 0, g[2] ? 0 : b); gr.addColorStop(0, 'rgba(0,0,0,.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; if (g[2]) ctx.fillRect(Math.min(a, b), Y0, 26, RH); else ctx.fillRect(X0, Math.min(a, b), RW, 26);
    });
    // --- facade walls: sides first (rotated), then top/bottom on top of the corners
    function sideWall(list, left) {
      var FH = L.sideWall;
      list.forEach(function (p) {
        var img = im(p.f); if (!img) return;
        ctx.save();
        if (left) { ctx.translate(0, p.x + p.w + 1); ctx.rotate(-Math.PI / 2); } else { ctx.translate(W, p.x - 1); ctx.rotate(Math.PI / 2); }
        ctx.drawImage(img, 0, 0, p.w + 2, FH); ctx.restore();
      });
      var x0 = left ? FH : W - FH - 34, gr = ctx.createLinearGradient(left ? FH : W - FH, 0, left ? FH + 34 : W - FH - 34, 0);
      gr.addColorStop(0, 'rgba(0,0,0,.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gr; ctx.fillRect(x0, 0, 34, H);
      list.forEach(function (p) { var g = p.f.glow; if (!g) return; glowAt(ctx, left ? FH + 26 : W - FH - 26, p.x + p.w / 2, p.w * .8 + 30, g[0] + ',' + g[1] + ',' + g[2], g[3] * .9); });
    }
    sideWall(L.wallL, true); sideWall(L.wallR, false);
    function drawWall(list, y, FH, bottom) {
      list.forEach(function (p) { var img = im(p.f); if (img) ctx.drawImage(img, Math.round(p.x), y, Math.ceil(p.w) + 1, FH); });
      var sy = bottom ? y - 34 : y + FH, gr = ctx.createLinearGradient(0, bottom ? y : y + FH, 0, bottom ? y - 34 : y + FH + 34);
      gr.addColorStop(0, 'rgba(0,0,0,.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gr; ctx.fillRect(0, sy, W, 34);
      list.forEach(function (p) { var g = p.f.glow; if (!g) return; glowAt(ctx, p.x + p.w / 2, bottom ? y - 30 : y + FH + 28, p.w * .8 + 40, g[0] + ',' + g[1] + ',' + g[2], g[3] * .9); });
    }
    drawWall(L.wallTop, 0, L.FHt, false);
    if (L.wallBot) drawWall(L.wallBot, H - L.FHb, L.FHb, true);
    else {
      var q = im(m.quay[0]), n = Math.ceil(W / 540), qw = W / n;
      for (var i = 0; i < n; i++) ctx.drawImage(q, i * qw, H - L.FHb, qw + 1, L.FHb);
      var gr = ctx.createLinearGradient(0, H - L.FHb, 0, H - L.FHb - 30); gr.addColorStop(0, 'rgba(0,0,0,.4)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, H - L.FHb - 30, W, 30);
    }
    var la = im((m.props || []).filter(function (p) { return p.id === 'prop_lanterns_a'; })[0]);
    var lb = im((m.props || []).filter(function (p) { return p.id === 'prop_lanterns_b'; })[0]);
    if (la && lb) {
      var rl = rngFor(L.seed, ch + 'lant');
      [[18, false], [H - L.FHb + 40, true]].forEach(function (s) {
        var x = rr(rl, -40, 40);
        while (x < W - 100) { var li = rl() < .5 ? la : lb, sc = rr(rl, .95, 1.15), w = li.width * sc, h = li.height * sc; ctx.drawImage(li, x, s[0] + rr(rl, 0, 24), w, h); glowAt(ctx, x + w / 2, s[0] + h * .7, w * .7, '255,60,40', .12); x += w * rr(rl, .92, 1.0); }
      });
    }
    // --- prop ground shadows
    L.props.forEach(function (p) {
      if (p.id.indexOf('lantern') >= 0 || p.id === 'bag') return;
      var fw = p.solid || p.posts ? Math.max(p.footprint[0], 20) : Math.max(p.w * .5, 16);
      ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.42)'; ctx.beginPath(); ctx.ellipse(p.x + 5, p.y - 2, fw * .62, Math.min(p.id === 'car' ? 24 : 14, 6 + fw * .1), 0, 0, 6.2832); ctx.fill(); ctx.restore();
    });
    // --- chapter colour grade (ground + walls only; props stay vivid for readability)
    P.grade.forEach(function (g) { ctx.save(); ctx.globalCompositeOperation = g[0]; ctx.globalAlpha = g[2]; ctx.fillStyle = g[1]; ctx.fillRect(0, 0, W, H); ctx.restore(); });
    // --- lamp light pools and chapter lights (added after the grade so they stay luminous)
    L.props.forEach(function (p) {
      if (p.id !== 'prop_lamp') return;
      var dx = W / 2 - p.x, dy = H / 2 - p.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      glowAt(ctx, p.x + dx / d * 70, p.y - 20 + dy / d * 70, 230, P.lamp, ch === 'canary' ? .2 : .24);
    });
    if (ch === 'soho') {
      var rs = rngFor(L.seed, 'soholight');
      for (var i = 0; i < 9; i++) { var sx = rs() < .5 ? L.sideWall + 30 : W - L.sideWall - 30, sy = rr(rs, 200, H - 200); glowAt(ctx, sx, sy, 170, i & 1 ? '255,40,140' : '30,215,205', .12); }
      for (var i = 0; i < 6; i++) glowAt(ctx, rr(rs, X0, X1), rr(rs, Y0 + 40, Y1 - 40), 170, i & 1 ? '255,40,140' : '30,215,205', .07);
    } else if (ch === 'canary') {
      var g2 = ctx.createLinearGradient(0, 0, W, 0); g2.addColorStop(0, 'rgba(90,150,255,.1)'); g2.addColorStop(.5, 'rgba(90,150,255,0)'); g2.addColorStop(1, 'rgba(90,150,255,.1)');
      ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
      glowAt(ctx, W / 2, Y0 + 40, 380, '120,180,255', .1); glowAt(ctx, W / 2, Y1 - 40, 380, '120,180,255', .1);
    } else {
      var g3 = ctx.createLinearGradient(0, Y1 - 160, 0, H); g3.addColorStop(0, 'rgba(120,160,210,0)'); g3.addColorStop(1, 'rgba(120,160,210,.08)'); ctx.fillStyle = g3; ctx.fillRect(0, Y1 - 160, W, H - Y1 + 160);
    }
    var vg = ctx.createLinearGradient(0, 0, 0, H); vg.addColorStop(0, 'rgba(0,0,0,.28)'); vg.addColorStop(.15, 'rgba(0,0,0,0)'); vg.addColorStop(.85, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.32)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    var vh = ctx.createLinearGradient(0, 0, W, 0); vh.addColorStop(0, 'rgba(0,0,0,.25)'); vh.addColorStop(.12, 'rgba(0,0,0,0)'); vh.addColorStop(.88, 'rgba(0,0,0,0)'); vh.addColorStop(1, 'rgba(0,0,0,.25)');
    ctx.fillStyle = vh; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // ---------- public ----------
  var MAX_PX = 5000000; // single-canvas budget; bigger worlds are returned as chunks
  function build(ch, W, H, seed) {
    W = W || 1000; H = H || 1500; seed = seed | 0;
    try {
      if (!ready(ch)) return null;
      var L = plan(ch, W, H, seed); if (!L) return null;
      var key = L.ch + '|' + W + '|' + H + '|' + seed;
      if (buildCache[key]) return buildCache[key];
      var out;
      if (W * H <= MAX_PX) { out = cv(W, H); bakeInto(out.getContext('2d'), L, 0, 0, W, H); out.ox = 0; out.oy = 0; }
      else {
        var nch = Math.ceil(W * H / 3000000), ch2 = Math.ceil(H / nch); out = [];
        for (var i = 0; i < nch; i++) { var y0 = i * ch2, hh = Math.min(ch2, H - y0), c = cv(W, hh); bakeInto(c.getContext('2d'), L, 0, y0, W, hh); c.ox = 0; c.oy = y0; out.push(c); }
      }
      buildCache = {}; buildCache[key] = out;     // keep only the latest
      return out;
    } catch (e) { if (window.console) console.warn('street.build failed', e); return null; }
  }
  function solids(ch, seed, W, H) { var L = plan(ch, W || 1000, H || 1500, seed | 0); return L ? L.solids.map(function (s) { return { x: s.x, y: s.y, w: s.w, h: s.h, kind: s.kind, id: s.id }; }) : []; }
  function props(ch, seed, W, H) { var L = plan(ch, W || 1000, H || 1500, seed | 0); return L ? L.props : []; }
  function drawProp(ctx, p) {
    if (!p.img) return;
    if (p.flip) { ctx.save(); ctx.translate(p.x, 0); ctx.scale(-1, 1); ctx.drawImage(p.img, p.dx, p.y + p.dy, p.w, p.h); ctx.restore(); }
    else ctx.drawImage(p.img, p.x + p.dx, p.y + p.dy, p.w, p.h);
  }
  // convenience: draw all props whose box intersects view {x,y,w,h} (world coords); call inside your camera transform
  function drawProps(ctx, ch, seed, view, W, H) {
    var a = props(ch, seed, W, H);
    for (var i = 0; i < a.length; i++) { var p = a[i]; if (view && (p.x + p.dx > view.x + view.w || p.x + p.dx + p.w < view.x || p.y + p.dy > view.y + view.h || p.y < view.y)) continue; drawProp(ctx, p); }
  }

  window.G.street = { load: load, ready: ready, build: build, solids: solids, props: props, drawProp: drawProp, drawProps: drawProps, chapters: CHAPTERS };
})();
