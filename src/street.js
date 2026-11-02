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
  var FH_TOP = 262, SW = 330;
  function plan(ch, W, H, seed) {
    var key = ch + '|' + W + '|' + H + '|' + seed;
    if (cache[key]) return cache[key];
    var m = man(ch); if (!m || !isUsable(m)) return null;
    var rw = rngFor(seed, ch + 'walls'), rp = rngFor(seed, ch + 'props'), rd = rngFor(seed, ch + 'decals');
    var L = { ch: ch, W: W, H: H, seed: seed, m: m };
    var quay = ch === 'docklands' && m.quay && im(m.quay[0]);
    L.FHt = FH_TOP; L.FHb = quay ? Math.round(W / Math.ceil(W / 540) * (m.quay[0].h / m.quay[0].w)) : FH_TOP;
    L.quay = !!quay;
    L.SW = SW;
    var cs = m.sidewalk.curbStraight.filter(Boolean);
    L.curbS = 0.9; L.curbH = Math.round(cs[0].h * L.curbS);
    L.y1t = L.FHt + SW;               // road starts (top curb bottom edge)
    L.y1b = H - L.FHb - SW;           // road ends   (bottom curb top edge)
    L.roadMid = (L.y1t + L.y1b) / 2; L.roadH = L.y1b - L.y1t;
    L.xC = Math.round(W * rr(rd, 0.38, 0.62));   // zebra crossing x
    L.cw = 170;                                  // crossing half-ish clear width
    // facade walls
    L.wallTop = wall(m, W, L.FHt, rw, ch);
    if (!quay) L.wallBot = wall(m, W, L.FHb, rw, ch);
    // props
    L.props = []; L.solids = [];
    placeProps(L, rp);
    L.props.sort(function (a, b) { return a.y - b.y; });
    // solids: walls + prop footprints
    L.solids.push({ x: 0, y: 0, w: W, h: L.FHt - 30, kind: 'wall' });
    L.solids.push({ x: 0, y: quay ? H - L.FHb + 50 : H - L.FHb + 12, w: W, h: quay ? L.FHb - 50 : L.FHb - 12, kind: 'wall' });
    L.props.forEach(function (p) {
      if (!p.solid) return;
      if (p.posts) { p.posts.forEach(function (q) { L.solids.push({ x: p.x + q - 9, y: p.y - 14, w: 18, h: 14, kind: 'prop', id: p.id }); }); return; }
      L.solids.push({ x: p.x - p.footprint[0] / 2, y: p.y - p.footprint[1], w: p.footprint[0], h: p.footprint[1], kind: 'prop', id: p.id });
    });
    cache[key] = L; return L;
  }

  function wall(m, W, FH, rng, ch) {
    var pool = m.facades.filter(function (f) { return im(f); });
    var best = null;
    for (var t = 0; t < 400; t++) {
      var seq = [], tot = 0, last = null, count = {};
      var wsum = 0; pool.forEach(function (f) { wsum += (f.weight || 1); });
      while (tot < W - 40 && seq.length < 14) {
        var r = rng() * wsum, f = pool[0];
        for (var i = 0; i < pool.length; i++) { r -= (pool[i].weight || 1); if (r <= 0) { f = pool[i]; break; } }
        if (f === last) continue;
        if ((count[f.id] || 0) >= 2) continue;
        var w = f.w * FH / f.h;
        seq.push({ f: f, w: w }); tot += w; last = f; count[f.id] = (count[f.id] || 0) + 1;
      }
      var over = tot - W; if (over < -5) continue;
      var score = Math.abs(over - 15) + (seq.length < 4 ? 50 : 0) + rng() * 4;
      if (!best || score < best.score) best = { seq: seq, tot: tot, score: score };
    }
    if (!best) { var f0 = pool[0]; best = { seq: [{ f: f0, w: f0.w * FH / f0.h }], tot: f0.w * FH / f0.h }; }
    var sx = Math.max(0.94, Math.min(1.12, W / best.tot));
    var x = 0, out = [];
    best.seq.forEach(function (s) { var w = s.w * sx; out.push({ f: s.f, x: x, w: w, h: FH }); x += w; });
    return out;
  }

  function placeProps(L, rng) {
    var m = L.m, W = L.W, H = L.H;
    var byId = {}; (m.props || []).forEach(function (p) { if (im(p)) byId[p.id] = p; });
    var rows = { 'curbT': [], 'curbB': [], 'wallT': [], 'wallB': [], 'yardT': [], 'yardB': [] };
    var yCurbT = L.y1t - L.curbH - 10, yCurbB = L.y1b + L.curbH + 38;
    var yWallT = L.FHt + 112, yWallB = H - L.FHb - 22;
    function free(row, x, hw) {
      if (x - hw < 30 || x + hw > W - 30) return false;
      var r = rows[row]; for (var i = 0; i < r.length; i++) if (Math.abs(r[i].x - x) < r[i].hw + hw + 14) return false;
      return true;
    }
    function inCross(x, hw, pad) { return Math.abs(x - L.xC) < L.cw / 2 + pad + hw; }
    function mk(id, x, y, row, opt) {
      var d = byId[id]; if (!d) return null;
      var w = d.w * d.scale, h = d.h * d.scale;
      var p = { id: id, img: imgs[d.file], x: Math.round(x), y: Math.round(y), w: w, h: h, dx: -w / 2, dy: -d.anchor[1] * d.scale,
        footprint: d.footprint.slice(), solid: d.solid && !(opt && opt.nosolid), zone: d.zone, row: row, hw: w / 2 };
      if (opt && opt.flip) p.flip = true;
      rows[row].push(p); L.props.push(p); return p;
    }
    function scatter(id, row, y0, jit, n, pad, avoidCross, tries) {
      var d = byId[id]; if (!d) return;
      var hw = d.w * d.scale / 2, c = 0;
      for (var t = 0; t < (tries || 60) && c < n; t++) {
        var x = rr(rng, 60 + hw, W - 60 - hw);
        if (!free(row, x, hw + (pad || 0))) continue;
        if (avoidCross !== false && inCross(x, hw, 50)) continue;
        mk(id, x, y0 + rr(rng, 0, jit), row); c++;
      }
    }
    // --- crossing: traffic lights + bollards on both sides
    [['T', yCurbT, 1], ['B', yCurbB, -1]].forEach(function (s) {
      var row = 'curb' + s[0];
      [-1, 1].forEach(function (sd) {
        var xx = L.xC + sd * (L.cw / 2 + 46);
        if (s[0] === 'T' && sd === 1 || s[0] === 'B' && sd === -1) mk('prop_traffic_light', xx, s[1] - 6, row);
        else {
          for (var k = 0; k < 3; k++) mk('prop_bollard', xx + sd * (k * 54) - (k === 0 ? 0 : 0), s[1] + 2, row);
        }
      });
    });
    // --- lamps along the curb, alternating offsets
    [['T', yCurbT, 0], ['B', yCurbB, 240]].forEach(function (s) {
      for (var x = 150 + s[2] + rr(rng, 0, 80); x < W - 120; x += 470 + rr(rng, -50, 70)) {
        if (!inCross(x, 10, 120)) if (free('curb' + s[0], x, 22)) mk('prop_lamp', x, s[1] + 4, 'curb' + s[0]);
      }
    });
    // --- railings (continuous stretch of 2-3 pieces) on one sidewalk side each
    var rail = byId.prop_railing || byId.prop_glass_railing;
    if (rail) {
      [['T', yCurbT], ['B', yCurbB]].forEach(function (s, si) {
        var n = 2 + Math.floor(rng() * 2), w = rail.w * rail.scale * 0.97, tot = n * w;
        for (var t = 0; t < 40; t++) {
          var x0 = rr(rng, 70, W - 70 - tot), ok = true;
          for (var k = 0; k < n && ok; k++) { var cx = x0 + w * (k + .5); if (!free('curb' + s[0], cx, w / 2 - 6) || inCross(cx, w / 2, 20)) ok = false; }
          if (!ok) continue;
          for (var k = 0; k < n; k++) mk(rail.id, x0 + w * (k + .5), s[1] + (si ? 8 : 4), 'curb' + s[0]);
          break;
        }
      });
    }
    // --- bus stop (one per sidewalk, opposite ends), tube sign
    scatter('prop_bus_stop', 'curbT', yCurbT, 4, 1, 30);
    scatter('prop_bus_stop', 'curbB', yCurbB, 4, 1, 30);
    // --- soho arch over the top sidewalk
    if (byId.prop_paifang) {
      var d = byId.prop_paifang, pw = d.w * d.scale;
      for (var t = 0; t < 40; t++) {
        var ax = rr(rng, 200 + pw / 2, W - 200 - pw / 2);
        if (Math.abs(ax - L.xC) < pw / 2 + 210) continue;
        var p = mk('prop_paifang', ax, yCurbT - 4, 'curbT'); if (p) { p.posts = [-pw * 0.36, pw * 0.36]; rows.wallT.push({ x: ax, hw: pw / 2 + 40 }); } break;
      }
    }
    // --- wall row furniture
    ['T', 'B'].forEach(function (s) {
      var row = 'wall' + s[0], y0 = s === 'T' ? yWallT : yWallB;
      scatter('prop_phone_box', row, y0, 12, 1, 90, true);
      scatter('prop_post_box', row, y0, 10, 1, 60, true);
      scatter('prop_bin', row, y0, 14, 2, 90, true);
      scatter('prop_bench', row, y0, 10, 1, 60, true);
    });
    scatter('prop_tube_sign', 'wallT', yWallT + 30, 8, 1, 80, true);
    scatter('prop_neon_dragon', 'wallT', yWallT + 6, 4, 1, 80, true);
    scatter('prop_neon_dragon', 'wallB', yWallB + 6, 4, 1, 80, true);
    // --- docklands yard clutter near walls
    if (byId.prop_container_red) {
      ['T', 'B'].forEach(function (s) {
        var row = 'yard' + s[0], y0 = s === 'T' ? yWallT + 70 : yWallB - 4;
        ['prop_container_red', 'prop_container_blue', 'prop_container_yellow'].forEach(function (id, i) { if (s === 'B' || i === 0) scatter(id, row, y0, 10, 1, 40, true); });
        scatter('prop_crate', row, y0, 12, 2, 20, true);
        scatter('prop_barrel', row, y0, 12, 2, 20, true);
        scatter('prop_barrier', row, y0 + 20, 6, 1, 40, true);
      });
      scatter('prop_crane', 'yardB', yWallB - 8, 4, 1, 40, true);
      scatter('prop_gantry', 'yardB', yWallB - 8, 4, 1, 40, true);
    }
    // clean temp
    L.props.forEach(function (p) { delete p.hw; });
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
    var m = L.m, W = L.W, H = L.H, ch = L.ch;
    var rt = rngFor(L.seed, ch + 'tiles'), rd = rngFor(L.seed, ch + 'draw'), rn = rngFor(L.seed, ch + 'noise');
    ctx.save(); ctx.translate(-ox, -oy);
    ctx.beginPath(); ctx.rect(ox, oy, cw, chh); ctx.clip();
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    var swImg = im(m.sidewalk.fill), asph = gfind(m, 'seam_asphalt'), crack = gfind(m, 'seam_cracked'), cobble = gfind(m, 'seam_cobble');
    var yT0 = L.FHt - 30, yT1 = L.y1t, yB0 = L.y1b, yB1 = H - L.FHb + 30;
    // --- sidewalks
    tileFill(ctx, swImg, 0, yT0, W, yT1, rt, 1, false);
    tileFill(ctx, swImg, 0, yB0, W, yB1, rt, 1, false);
    // --- road base
    tileFill(ctx, asph || swImg, 0, L.y1t - 4, W, L.y1b + 4, rt, 1.0, true);
    // low-frequency tonal variation to break repetition
    ctx.save(); ctx.beginPath(); ctx.rect(0, L.y1t, W, L.roadH); ctx.clip();
    for (var i = 0; i < 70; i++) {
      var bx = rr(rn, 0, W), by = rr(rn, L.y1t, L.y1b), br = rr(rn, 90, 280), dark = rn() < .55;
      glowAt(ctx, bx, by, br, dark ? '0,0,0' : '70,80,100', dark ? rr(rn, .1, .22) : rr(rn, .04, .09), 'source-over');
    }
    // tyre tracks / oil wear along the lanes
    [.125, .375, .625, .875].forEach(function (ln) {
      [-1, 1].forEach(function (sd) {
        var ty = L.y1t + L.roadH * ln + sd * 46, x = -50;
        while (x < W) {
          var len = rr(rn, 140, 520), gap = rr(rn, 60, 300);
          var g = ctx.createLinearGradient(0, ty - 14, 0, ty + 14); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(.5, 'rgba(0,0,0,' + rr(rn, .12, .22) + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
          var hg = ctx.createLinearGradient(x, 0, x + len, 0); hg.addColorStop(0, 'rgba(0,0,0,0)'); hg.addColorStop(.2, 'rgba(0,0,0,1)'); hg.addColorStop(.8, 'rgba(0,0,0,1)'); hg.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.save(); ctx.fillStyle = g; ctx.fillRect(x, ty - 14, len, 28); ctx.restore();
          x += len + gap;
        }
      });
    });
    // cracked patches
    if (crack) for (var i = 0; i < 7; i++) {
      var f = feathered(crack, rn, 0, .95), sc = rr(rn, 1.3, 2.2);
      stamp(ctx, f, rr(rn, 100, W - 100), rr(rn, L.y1t + 90, L.y1b - 90), sc, Math.floor(rn() * 4) * Math.PI / 2, rr(rn, .55, .85), rn() < .5);
    }
    // gutter (cobbles) along kerbs
    if (cobble && ch !== 'canary') {
      [[L.y1t, 1], [L.y1b, -1]].forEach(function (g) {
        var gh = 40, gy = g[1] > 0 ? g[0] : g[0] - gh;
        tileFill(ctx, cobble, 0, gy, W, gy + gh, rd, .55, false);
        var gr = ctx.createLinearGradient(0, g[0], 0, g[0] + g[1] * gh);
        gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gr; ctx.fillRect(0, gy, W, gh);
      });
    }
    ctx.restore();
    // --- wet lit patches under lamps + puddles
    var wet = gfind(m, 'ground_road_wet'), pud = gfind(m, 'ground_puddle');
    ctx.save(); ctx.beginPath(); ctx.rect(0, L.y1t, W, L.roadH); ctx.clip();
    if (wet) L.props.forEach(function (p) {
      if (p.id !== 'prop_lamp') return;
      var top = p.y < H / 2; var cy = top ? L.y1t + 120 : L.y1b - 120;
      var f = feathered(wet, rd, 0, 1);
      stamp(ctx, f, p.x, cy, 1.9, Math.PI / 2 * (rd() < .5 ? 1 : 3), .85, false, 'screen');
    });
    for (var i = 0; i < 11; i++) {
      var px = rr(rd, 140, W - 140), py = rr(rd, L.y1t + 110, L.y1b - 110), pr = rr(rd, 55, 130);
      if (Math.abs(px - L.xC) < L.cw / 2 + pr) px += pr * 2 + L.cw;
      puddle(ctx, rd, px, py, pr, ch);
    }
    ctx.restore();
    // --- lane markings
    var mk = m.markings || {};
    function strip(entry, y, sc, flipY, flipX, alpha) {
      var img = im(entry); if (!img) return;
      var w = img.width * sc, h = img.height * sc;
      ctx.save(); ctx.beginPath(); ctx.rect(-5, y - h, W + 10, h * 2); ctx.rect(L.xC - 82, y - h, 164, h * 2); ctx.clip('evenodd');
      ctx.globalAlpha = alpha == null ? .93 : alpha;
      for (var x = -10; x < W; x += w - 2) {
        ctx.save(); ctx.translate(x + (flipX ? w : 0), y); ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
        ctx.drawImage(img, 0, flipY ? -h / 2 : -h / 2, w, h); ctx.restore();
      }
      ctx.restore();
    }
    var yc = L.roadMid;
    strip(mk.double_yellow, yc, 1.5, false, false);
    strip(mk.dash, L.y1t + L.roadH * .25, 1.5, false, false);
    strip(mk.dash, L.y1t + L.roadH * .75, 1.5, false, false);
    // parking bays along kerbs (a stretch each side)
    var park = im(mk.parking), parkR = [];
    if (park) {
      var psc = 1.5, pw = park.width * psc, ph = park.height * psc;
      var n = 2;
      [[L.y1t + 40, false, 0], [L.y1b - 40 - ph, true, 1]].forEach(function (b) {
        var x0 = b[2] ? 120 : W - 120 - pw * (n + 1);
        for (var k = 0; k < n; k++) {
          var px = x0 + k * (pw - 6);
          if (Math.abs(px + pw / 2 - L.xC) < pw / 2 + L.cw / 2 + 20) continue;
          parkR.push([px - 20, px + pw + 20, b[2] ? 1 : 0]);
          ctx.save(); ctx.globalAlpha = .85; ctx.translate(px, b[0]); if (b[1]) { ctx.translate(0, ph); ctx.scale(1, -1); } ctx.drawImage(park, 0, 0, pw, ph); ctx.restore();
        }
      });
    }
    // arrows in lane centres
    var arr = im(mk.arrow);
    if (arr) {
      var asc = 1.3, aw = arr.width * asc, ah = arr.height * asc;
      [[.125, 1], [.375, 1], [.625, 0], [.875, 0]].forEach(function (ln) {
        for (var k = 0; k < 2; k++) {
          var ax = (k + .35 + rd() * .3) * W / 2 * 0.98;
          if (Math.abs(ax - L.xC) < aw / 2 + L.cw) continue;
          var hit = false; parkR.forEach(function (r) { if ((ln[0] < .5) === (r[2] === 0) && ax + aw / 2 > r[0] && ax - aw / 2 < r[1] && (ln[0] === .125 || ln[0] === .875)) hit = true; }); if (hit) continue;
          ctx.save(); ctx.globalAlpha = .88; ctx.translate(ax, L.y1t + L.roadH * ln[0]); if (ln[1]) ctx.scale(-1, 1); ctx.drawImage(arr, -aw / 2, -ah / 2, aw, ah); ctx.restore();
        }
      });
    }
    // zebra crossing (bars run along the road, stacked across it)
    var bar = im(mk.crosswalk_bar);
    if (bar) {
      var bsc = 1.9, bl = bar.height * bsc, bw = bar.width * bsc, step = bw * 1.9;
      ctx.save(); ctx.globalAlpha = .9;
      for (var y = L.y1t + 52; y < L.y1b - 40; y += step) {
        ctx.save(); ctx.translate(L.xC, y + bw / 2); ctx.rotate(Math.PI / 2); if (rd() < .5) ctx.scale(1, -1); ctx.drawImage(bar, -bw / 2, -bl / 2, bw, bl); ctx.restore();
      }
      ctx.restore();
    }
    // manholes + drains
    var mh = im(mk.manhole), dr = im(mk.drain);
    if (mh) {
      var mxs = [.12, .3, .7, .88], mys = [.14, .36, .64, .86];
      for (var i = 0; i < 4; i++) {
        var mx = W * mxs[i] + rr(rd, -60, 60), my = L.y1t + L.roadH * mys[(i * 3 + Math.floor(rd() * 2)) % 4] + rr(rd, -20, 20);
        if (Math.abs(mx - L.xC) < L.cw + 70) mx = L.xC + (mx < L.xC ? -1 : 1) * (L.cw + 90);
        ctx.drawImage(mh, mx - mh.width * .4, my - mh.height * .4, mh.width * .8, mh.height * .8);
      }
    }
    if (dr) for (var x = 130 + rr(rd, 0, 60); x < W - 100; x += 330 + rr(rd, -40, 60)) {
      if (Math.abs(x - L.xC) < L.cw + 60) continue;
      var dw = dr.width * .55, dh = dr.height * .55;
      ctx.drawImage(dr, x - dw / 2, L.y1t + 6, dw, dh);
      ctx.save(); ctx.translate(x + 200 - dw / 2, L.y1b - 6); ctx.scale(1, -1); ctx.drawImage(dr, 0, 0, dw, dh); ctx.restore();
    }
    // --- sidewalk detail: puddles / cracks / lit spill from windows
    // --- curbs
    var cs = m.sidewalk.curbStraight.map(im).filter(Boolean), cScale = L.curbS;
    if (cs.length) {
      var rc = rngFor(L.seed, ch + 'curb');
      [[L.y1t - L.curbH, false], [L.y1b, true]].forEach(function (c) {
        var x = 0;
        while (x < W) {
          var ci = pick(rc, cs), cw = ci.width * cScale - 1, chh2 = ci.height * cScale;
          ctx.save(); ctx.translate(x, c[0] + (c[1] ? chh2 : 0)); if (c[1]) ctx.scale(1, -1); ctx.drawImage(ci, 0, 0, cw + 1, chh2); ctx.restore();
          x += cw;
        }
      });
    }
    // gentle shadow from curb onto road
    [[L.y1t, 1], [L.y1b, -1]].forEach(function (g) {
      var gr = ctx.createLinearGradient(0, g[0], 0, g[0] + g[1] * 26); gr.addColorStop(0, 'rgba(0,0,0,.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, g[1] > 0 ? g[0] : g[0] - 26, W, 26);
    });
    // --- facade walls
    function drawWall(list, y, FH, bottom) {
      list.forEach(function (p) { var img = im(p.f); if (img) ctx.drawImage(img, Math.round(p.x), y, Math.ceil(p.w) + 1, FH); });
      // contact shadow + window light spill on the sidewalk
      var sy = bottom ? y - 34 : y + FH;
      var gr = ctx.createLinearGradient(0, bottom ? y : y + FH, 0, bottom ? y - 34 : y + FH + 34);
      gr.addColorStop(0, 'rgba(0,0,0,.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, sy, W, 34);
      list.forEach(function (p) {
        var g = p.f.glow; if (!g) return;
        var cy = bottom ? y - 30 : y + FH + 28;
        glowAt(ctx, p.x + p.w / 2, cy, p.w * .8 + 40, g[0] + ',' + g[1] + ',' + g[2], g[3] * .9);
      });
    }
    drawWall(L.wallTop, 0, L.FHt, false);
    if (L.wallBot) drawWall(L.wallBot, H - L.FHb, L.FHb, true);
    else {
      var q = im(m.quay[0]); var n = Math.ceil(W / 540), qw = W / n;
      for (var i = 0; i < n; i++) ctx.drawImage(q, i * qw, H - L.FHb, qw + 1, L.FHb);
      var gr = ctx.createLinearGradient(0, H - L.FHb, 0, H - L.FHb - 30); gr.addColorStop(0, 'rgba(0,0,0,.4)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, H - L.FHb - 30, W, 30);
    }
    // soho: lantern strings hung across the facades
    var la = im((m.props || []).filter(function (p) { return p.id === 'prop_lanterns_a'; })[0]);
    var lb = im((m.props || []).filter(function (p) { return p.id === 'prop_lanterns_b'; })[0]);
    if (la && lb) {
      var rl = rngFor(L.seed, ch + 'lant');
      [[18, false], [H - L.FHb + 40, true]].forEach(function (s) {
        var x = rr(rl, -40, 60);
        while (x < W - 100) {
          var li = rl() < .5 ? la : lb, sc = rr(rl, .95, 1.15), w = li.width * sc, h = li.height * sc;
          ctx.drawImage(li, x, s[0] + rr(rl, 0, 24), w, h);
          glowAt(ctx, x + w / 2, s[0] + h * .7, w * .7, '255,60,40', .12);
          x += w * rr(rl, .92, 1.0);
        }
      });
    }
    // --- prop ground shadows
    L.props.forEach(function (p) {
      if (p.id.indexOf('lantern') >= 0) return;
      var fw = p.solid || p.posts ? Math.max(p.footprint[0], 20) : Math.max(p.w * .5, 16);
      ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.42)'; ctx.beginPath();
      ctx.ellipse(p.x + 5, p.y - 2, fw * .62, Math.min(14, 6 + fw * .1), 0, 0, 6.2832); ctx.fill(); ctx.restore();
    });
    // --- lamp light pools on sidewalk + road
    L.props.forEach(function (p) {
      if (p.id !== 'prop_lamp') return;
      var top = p.y < H / 2;
      glowAt(ctx, p.x, p.y + (top ? 40 : -40), 240, LAMP[ch] || '255,170,80', ch === 'canary' ? .17 : .22);
    });
    // soft overall edge vignette on the long axis for depth
    var vg = ctx.createLinearGradient(0, 0, 0, H);
    vg.addColorStop(0, 'rgba(0,0,0,.28)'); vg.addColorStop(.18, 'rgba(0,0,0,0)'); vg.addColorStop(.82, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.32)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // ---------- public ----------
  var MAX_PX = 5000000; // single-canvas budget; bigger worlds are returned as chunks
  function build(ch, W, H, seed) {
    W = W || 1620; H = H || 2400; seed = seed | 0;
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
  function solids(ch, seed, W, H) { var L = plan(ch, W || 1620, H || 2400, seed | 0); return L ? L.solids.map(function (s) { return { x: s.x, y: s.y, w: s.w, h: s.h, kind: s.kind, id: s.id }; }) : []; }
  function props(ch, seed, W, H) { var L = plan(ch, W || 1620, H || 2400, seed | 0); return L ? L.props : []; }
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
