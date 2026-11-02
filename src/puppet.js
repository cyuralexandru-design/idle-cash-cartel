// G.puppet - cutout/puppet renderer for window.G_MANIFEST.characters (+ weapons). Classic script, no deps.
window.G = window.G || {};
(function () {
  'use strict';
  var G = window.G;
  var M = null, WM = null;
  var PI = Math.PI, TAU = PI * 2, sin = Math.sin, cos = Math.cos, atan2 = Math.atan2, abs = Math.abs, min = Math.min, max = Math.max;
  var DN = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'];
  // farthest-opaque-pixel ("hand tip") of plain arm sprites (pivot -> tip), precomputed offline
  var TIPS = {"hero":{"arm_0":[16,147],"arm_1":[16,145],"arm_2":[17,143],"arm_3":[13,137],"arm_4":[15,136],"arm_5":[15,135],"arm_6":[25,135],"arm_7":[56,137],"arm_8":[59,138],"arm_9":[72,140],"arm_10":[72,142],"arm_11":[84,142],"arm_12":[68,147],"arm_gun_5":[10,111],"arm_gun_6":[28,113],"arm_gun_7":[66,111]},"thug_knife":{"arm_0":[55,170],"arm_1":[45,159],"arm_2":[37,172]},"thug_bat":{"arm_0":[63,162],"arm_1":[48,153],"arm_2":[39,163]},"gunman_smg":{"arm_0":[61,161],"arm_1":[60,160],"arm_2":[67,171]},"bruiser_shotgun":{"arm_0":[51,196],"arm_1":[61,198],"arm_2":[53,200]},"boss_leader":{"arm_0":[58,227],"arm_1":[42,225],"arm_2":[140,216],"arm_3":[33,227]}};
  // target on-screen figure height (px, scale 1) per kind; hero ~90 on a 540x960 arena
  var TARGET = { hero: 90, thug_knife: 74, thug_bat: 80, gunman_smg: 84, bruiser_shotgun: 108, boss_leader: 150, sniper_ghillie: 82, molotov_thrower: 80, riot_shield: 84, drone_operator: 78, mini_boss: 118, attack_dog: 52, extra_1: 78, extra_2: 78, extra_3: 78, extra_4: 78 };
  var GUNNERS = { hero: 1, gunman_smg: 1, bruiser_shotgun: 1, boss_leader: 1, sniper_ghillie: 1, molotov_thrower: 1, riot_shield: 1, drone_operator: 1, mini_boss: 1 };
  var MELEE = { thug_knife: 1, thug_bat: 1 };
  var NOROT = { riot_shield: 1, drone_operator: 1, molotov_thrower: 1 }; // separate prop is not rotated toward the target
  // optional rig overrides (kind -> dir -> field replacements); do not edit characters.js
  var FIX = {};
  var IMG = {}, K = {}, WIMG = {}, loaded = false, loading = false;
  var shadowCv = null;
  var LASTSIDE = {}; // kind -> last horizontal side (+1 east / -1 west), kept when cos(facing)~0

  function base() { return G.puppet.basePath || ''; }
  function tok(v) { return Array.isArray(v) ? [v[0], !!v[1]] : [v, false]; }
  function dirIdx(f) { var d = f * 57.29578; d = ((d % 360) + 360) % 360; return ((d + 22.5) / 45 | 0) % 8; }
  function nrm(a) { a = (a + PI) % TAU; if (a < 0) a += TAU; return a - PI; }
  var SKIP = /^(portrait|head_alt|head_expr|hand_|prop_|magazine|bullets|holster|knife|cigarette|pistol|shells|torso_cape|arm_gun_pair|weapon_)/;

  function wanted(kind, name) {
    if (kind === 'riot_shield' && name === 'prop_shield') return true;
    if (SKIP.test(name)) return false;
    if (kind === 'attack_dog') return /^walk_/.test(name);
    return /^(head_|torso_|arm_|leg_|foot_|coat_|weapon$)/.test(name);
  }
  function fileList() {
    var out = [], c, k, n, id, v;
    for (k in M) {
      c = M[k]; if (k === 'crew' || !c.parts || (C3 && C3[k])) continue;
      for (n in c.parts) if (wanted(k, n)) out.push([k + '/' + n, c.parts[n].file, 0]);
    }
    if (WM) for (id in WM) for (v in WM[id]) if (WM[id][v] && WM[id][v].file) out.push([id + '/' + v, WM[id][v].file, 1]);
    return out;
  }

  // ---------------------------------------------------------------- spec building
  function info(kind) {
    var i = K[kind]; if (i) return i;
    var c = M && M[kind]; if (!c || !c.rig) return null;
    i = K[kind] = { kind: kind, c: c, dirs: {}, dog: c.rig.type === 'frames', target: TARGET[kind] || 80, s: 1, w: 100, h: 100, melee: !!MELEE[kind], gun: !!GUNNERS[kind], sep: c.rig.weaponMode === 'separate' && !!c.parts.weapon };
    if (i.dog) {
      var ft = c.rig.side, p = c.parts[ft[0]];
      i.s = i.target / p.w * 1.0; i.w = p.w * i.s; i.h = p.h * i.s; i.sd = ft; i.td = c.rig.topdown;
      return i;
    }
    var sp = spec(i, 's'); i.s = i.target / sp.H; i.w = (c.figure && c.figure.w ? c.figure.w : 150) * i.s; i.h = i.target;
    return i;
  }
  function part(i, name) { var p = i.c.parts[name]; if (!p) return null; return { n: name, p: p, img: IMG[i.kind + '/' + name], w: p.w, h: p.h, px: p.pivot[0], py: p.pivot[1] }; }

  function spec(i, dn) {
    var sp = i.dirs[dn]; if (sp) return sp;
    var c = i.c, r = c.rig.dirs[dn], f = FIX[i.kind] && FIX[i.kind][dn];
    if (f) { var rr = {}, q; for (q in r) rr[q] = r[q]; for (q in f) rr[q] = f[q]; r = rr; }
    var at = c.attach[r.attach || dn];
    sp = { dn: dn, toks: [], z: r.z, gunSide: r.gunSide || 'R' };
    var tn = tok(r.torso), tp = part(i, tn[0]);
    var neck = at.neck, hl = at.hip_l, hr = at.hip_r;
    sp.torso = { p: tp, flip: tn[1], ax: tp.w / 2, ay: 0, px: tp.w / 2, py: 0 };
    sp.hcx = (hl[0] + hr[0]) / 2; sp.hcy = (hl[1] + hr[1]) / 2;
    var bottom = 0, side, hk, ln, lp, fl, ft, fp, ank, sgn, h0, k;
    sp.leg = {}; sp.foot = {};
    for (k = 0; k < 2; k++) {
      side = k ? 'R' : 'L'; hk = k ? hr : hl;
      ln = r['leg' + side] ? tok(r['leg' + side]) : null;
      if (!ln) continue;
      lp = part(i, ln[0]); sgn = ln[1] ? -1 : 1;
      sp.leg[side] = { p: lp, flip: ln[1], ax: hk[0], ay: hk[1], px: lp.px, py: lp.py };
      var b = hk[1] + (lp.h - lp.py);
      if (r['foot' + side] && lp.p.ankle) {
        ft = tok(r['foot' + side]); fp = part(i, ft[0]); ank = lp.p.ankle;
        sp.foot[side] = { p: fp, flip: ft[1], dx: sgn * (ank[0] - lp.px), dy: ank[1] - lp.py, px: fp.px, py: fp.py };
        b = hk[1] + (ank[1] - lp.py) + (fp.h - fp.py);
      }
      if (b > bottom) bottom = b;
    }
    var hn = tok(r.head), hp = part(i, hn[0]);
    sp.head = { p: hp, flip: hn[1], ax: neck[0], ay: neck[1], px: hp.px, py: hp.py };
    if (r.coat) { var cp = part(i, tok(r.coat)[0]); if (cp) sp.coat = { p: cp, flip: false, ax: sp.hcx, ay: sp.hcy, px: cp.px, py: cp.py }; }
    // arms
    var gsn = sp.gunSide, gk = gsn === 'L' ? 'armL' : 'armR';
    for (k = 0; k < 2; k++) {
      side = k ? 'R' : 'L'; var an = tok(r['arm' + side]), ap = part(i, an[0]), sk = at['shoulder_' + (k ? 'r' : 'l')];
      sp['arm' + side] = { p: ap, flip: an[1], ax: sk[0], ay: sk[1], px: ap.px, py: ap.py, side: side };
    }
    // gun arm (aims at target)
    var gn = r.gunArm ? tok(r.gunArm) : null;
    if (gn && i.c.parts[gn[0]]) {
      var gp = part(i, gn[0]), tipv = gp.p.muzzle || gp.p.hand || (TIPS[i.kind] && TIPS[i.kind][gn[0]]);
      var gks = gsn === 'L' ? 'armL' : 'armR', sh = sp[gks];
      sp.gunArm = { p: gp, flip: gn[1], ax: sh.ax, ay: sh.ay, px: gp.px, py: gp.py, tip: tipv, side: gsn, baked: !!gp.p.muzzle };
      // plain arm variant for sprite weapons (hero): the dir's own arm of that side
      var plain = sh, pt = TIPS[i.kind] && TIPS[i.kind][tok(r[gks])[0]];
      sp.plainArm = { p: plain.p, flip: plain.flip, ax: sh.ax, ay: sh.ay, px: plain.px, py: plain.py, tip: pt || (plain.p.p.hand) || [plain.px, plain.p.h - 6], side: gsn };
    }
    var headTop = neck[1] - hp.py;
    sp.top = headTop; sp.gy = bottom; sp.H = bottom - headTop;
    sp.ox = (neck[0] + sp.hcx) / 2;
    i.dirs[dn] = sp; return sp;
  }

  // ---------------------------------------------------------------- tint cache (hit flash)
  function tint(img) {
    var t = img._wt; if (t) return t;
    t = document.createElement('canvas'); t.width = img.naturalWidth || img.width; t.height = img.naturalHeight || img.height;
    var x = t.getContext('2d'); x.drawImage(img, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#fff'; x.fillRect(0, 0, t.width, t.height);
    img._wt = t; return t;
  }
  var FL = 0; // current flash alpha
  var LVL = 0; // current mip level (set per draw from figure scale)
  // lazily built half/quarter/eighth-size copies: cheap downscaled drawing instead of big-image minification every frame
  function mip(img, l) {
    var m = img._m; if (!m) m = img._m = [img];
    if (m[l]) return m[l];
    var p = mip(img, l - 1), w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    var c = document.createElement('canvas'); c.width = max(1, Math.round(w / (1 << l))); c.height = max(1, Math.round(h / (1 << l)));
    var x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(p, 0, 0, c.width, c.height);
    m[l] = c; return c;
  }
  // draw part image with pivot at origin of current transform (flip handled by caller via scale)
  function blit(ctx, img, px, py) {
    var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height, s = LVL ? ((img._m && img._m[LVL]) || mip(img, LVL)) : img;
    ctx.drawImage(s, -px, -py, w, h);
    if (FL > 0) { ctx.globalAlpha = FL; ctx.drawImage(tint(s), -px, -py, w, h); ctx.globalAlpha = 1; }
  }
  // draw a part placed at (x,y) in figure space, rotated by rot, mirrored if flip
  function put(ctx, o, x, y, rot, flip) {
    var im = o.p.img; if (!im) return;
    ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); if (flip) ctx.scale(-1, 1);
    blit(ctx, im, o.px, o.py); ctx.restore();
  }

  // ---------------------------------------------------------------- weapons (hero sprites)
  function wvariant(fx, fy) {
    var phi = atan2(fy, abs(fx)) * 57.29578, v;
    if (phi > 68) v = 'front'; else if (phi > 24) v = 'down_right'; else if (phi >= -24) v = 'side'; else if (phi >= -68) v = 'up_right'; else v = 'rear';
    return v;
  }
  var NOMINAL = {};

  function lvlFor(sc) { var l = Math.floor(Math.log(1 / (sc * (G.puppet.mipBias || 1.0))) / 0.6931); return l < 0 ? 0 : (l > 3 ? 3 : l); }

  // ---------------------------------------------------------------- shadow
  function shadowImg() {
    if (shadowCv) return shadowCv;
    shadowCv = document.createElement('canvas'); shadowCv.width = 64; shadowCv.height = 32;
    var x = shadowCv.getContext('2d'), g = x.createRadialGradient(32, 16, 1, 32, 16, 31);
    g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(0.6, 'rgba(0,0,0,0.28)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.setTransform(1, 0, 0, 0.5, 0, 8); x.fillStyle = g; x.fillRect(0, -16, 64, 64);
    return shadowCv;
  }
  function drawShadow(ctx, a) {
    var i = (C3 && info3(a.kind)) || info(a.kind); if (!i) return;
    var sc = (a.scale || 1), w = i.w * 0.55 * sc * (i.dog ? 1.1 : 1) + 10;
    if (a.state === 'dead') { var tt = a.t || 0; if (tt > 0.5) ctx.globalAlpha = max(0, 1 - (tt - 0.5) / 0.5); }
    ctx.drawImage(shadowImg(), a.x - w / 2, a.y - w * 0.14, w, w * 0.4);
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- dog
  function drawDog(ctx, a, i) {
    var sc = (a.scale || 1) * i.s, f = a.facing, cx = cos(f), cy = sin(f), mv = a.moving, t = a.animT || 0, st = a.state, tt = a.t || 0;
    var side = abs(cy) < 0.72, list = side ? i.sd : i.td, n = list.length;
    var fi = mv ? ((t * 9) | 0) % n : 0;
    var p = i.c.parts[list[fi]], im = IMG['attack_dog/' + list[fi]]; if (!im) return;
    var rot = 0, fl = false, lunge = 0, alpha = 1, bob = mv ? abs(sin(t * 9)) * 1.2 : sin(t * 2) * 0.5;
    FL = 0; LVL = lvlFor(sc);
    if (st === 'hurt') FL = max(0, 0.9 - tt * 5);
    if (st === 'shoot') lunge = max(0, 1 - tt / 0.25) * 5;
    if (st === 'dead') { var k = min(1, tt / 0.3); rot = (cx >= 0 ? 1 : -1) * k * 1.4; if (tt > 0.5) alpha = max(0, 1 - (tt - 0.5) / 0.5); if (alpha <= 0) return; }
    ctx.save(); if (alpha < 1) ctx.globalAlpha = alpha;
    if (side) { fl = cx < 0; ctx.translate(a.x + cx * lunge, a.y - bob); ctx.rotate(rot); ctx.scale(fl ? -sc : sc, sc); blit(ctx, im, p.pivot[0], p.h); }
    else { ctx.translate(a.x + cx * lunge, a.y - p.h * sc * 0.5 - bob + cy * lunge); ctx.rotate(rot + f - PI / 2); ctx.scale(sc, sc); blit(ctx, im, p.pivot[0], p.pivot[1]); }
    ctx.restore();
  }

  // ---------------------------------------------------------------- main draw
  function draw(ctx, a) {
    if (!loaded) return;
    var i3 = C3 && info3(a.kind);
    if (i3) { if (G.puppet.shadow !== false) drawShadow(ctx, a); draw3(ctx, a, i3); return; }
    var i = info(a.kind); if (!i) return;
    if (G.puppet.shadow !== false) drawShadow(ctx, a);
    if (i.dog) { drawDog(ctx, a, i); return; }
    var f = a.facing, fx = cos(f), fy = sin(f), sideS = abs(fx) < 0.03 ? (LASTSIDE[a.kind] || 1) : (fx >= 0 ? 1 : -1);
    LASTSIDE[a.kind] = sideS;
    var dn = sideS > 0 ? 'e' : 'w', sp = i.dirs[dn] || spec(i, dn);
    var st = a.state, tt = a.t || 0, t = a.animT || 0, sc = i.s * (a.scale || 1);
    // effective aim angle: keep arms from pointing straight up/down the screen (looks broken for cutouts)
    var elev = atan2(fy, abs(fx)); // full range: weapon arm may point straight up/down while the body stays side view
    var sgn0 = sideS;
    var fe = sgn0 > 0 ? elev : PI - elev, ex = cos(fe), ey = sin(fe);
    var moving = !!a.moving && st !== 'dead', spd = a.speed === undefined ? 1 : a.speed, amp = moving ? (0.6 + 0.4 * min(1, spd)) : 0;
    var H = sp.H, ph = t * 11, sph = sin(ph);
    var sideK = 1, SG = sgn0;
    var rec = 0, flash = 0, lean = 0, kx = 0, ky = 0, alpha = 1, frot = 0, lunge = 0, dead = st === 'dead';
    if (st === 'shoot') { rec = tt < 0.16 ? 1 - tt / 0.16 : 0; if (i.melee) { lunge = tt < 0.3 ? sin(min(1, tt / 0.3) * PI) : 0; } }
    if (st === 'hurt') { flash = tt < 0.16 ? 0.85 - tt * 2.5 : 0; var kb = tt < 0.2 ? 1 - tt / 0.2 : 0; kx = -sgn0 * kb * H * 0.03; ky = -fy * kb * H * 0.012; lean = -kb * 0.1 * sgn0; }
    if (dead) {
      var k = min(1, tt / 0.45); k = 1 - (1 - k) * (1 - k);
      frot = -sgn0 * k * 1.52; flash = tt < 0.12 ? 0.8 - tt * 5 : 0;
      if (tt > 0.55) alpha = i.kind === 'hero' ? max(0.45, 1 - (tt - 0.55) / 0.6) : max(0, 1 - (tt - 0.55) / 0.45);
      if (alpha <= 0) return;
    }
    FL = flash > 0 ? flash : 0; LVL = lvlFor(sc);
    var bob = moving ? -abs(sph) * (2.6 / sc) * amp : 0; // 2-3 screen px, 2x step frequency
    var breath = (moving || dead) ? 0 : sin(t * 2.4) * H * 0.007;
    var tilt = (moving ? (0.052 * sgn0 + sph * 0.015) * amp : 0) + lean - rec * 0.05 * sgn0 + lunge * 0.08 * sgn0;
    var ubx = kx + sgn0 * (lunge * H * 0.05 - rec * H * 0.012), uby = bob + ky + breath + (dead ? 0 : fy * lunge * H * 0.03);
    if (dead) { tilt = 0; ubx = 0; uby = 0; }
    var swA = 0.52 * amp, lift = H * 0.03 * amp;
    var hcx = sp.hcx, hcy = sp.hcy;

    ctx.save();
    if (alpha < 1) ctx.globalAlpha = alpha;
    ctx.translate(a.x, a.y); if (frot) ctx.rotate(frot); ctx.scale(sc, sc); ctx.translate(-sp.ox, -sp.gy);
    // aim parameters
    var aim = !dead && (i.gun || i.melee), aw = i.melee ? lunge : 1;
    var wid = a.weaponId, useSprite = false, gArm = sp.gunArm, wv = null, ws = null;
    if (aim && gArm) {
      if (i.kind === 'hero' && wid && wid !== 'pistol' && WM && WM[wid]) { useSprite = true; gArm = sp.plainArm; wv = 'side'; ws = WM[wid][wv]; if (!ws) { wv = 'side'; useSprite = false; } }
    } else gArm = null;
    var z = sp.z, n = z.length, q, key, o, rr, sg;
    for (q = 0; q < n; q++) {
      key = z[q];
      if (key === 'legL' || key === 'legR') {
        var sd = key === 'legL' ? 'L' : 'R', lg = sp.leg[sd]; if (!lg) continue;
        var pp = sd === 'L' ? ph : ph + PI, lr = dead ? 0.25 * (sd === 'L' ? 1 : -1) * (frot ? 1 : 0) : sin(pp) * swA, lf = moving ? max(0, -sin(pp + 0.4)) * lift : 0;
        var fr = /^leg_s_/.test(lg.p.n); // front-view leg art: shorter rotation + lateral stride so it reads as a side step
        if (fr && moving) { lr *= 0.4; lf *= 0.35; }
        ctx.save(); ctx.translate(lg.ax + ubx * 0.3 + (fr && moving ? sin(pp) * H * 0.07 * amp * sgn0 : 0), lg.ay + uby * 0.5 - lf); if (lr) ctx.rotate(lr);
        var fo = sp.foot[sd];
        if (lg.flip) ctx.scale(-1, 1);
        if (lg.p.img) blit(ctx, lg.p.img, lg.px, lg.py);
        if (lg.flip) ctx.scale(-1, 1);
        if (fo && fo.p.img) { ctx.translate(fo.dx, fo.dy); if (fo.flip) ctx.scale(-1, 1); blit(ctx, fo.p.img, fo.px, fo.py); }
        ctx.restore();
        continue;
      }
      if (key === 'footL' || key === 'footR') continue;
      // upper body parts: apply tilt about hip centre
      ctx.save(); ctx.translate(hcx + ubx, hcy + uby); if (tilt) ctx.rotate(tilt); ctx.translate(-hcx, -hcy);
      if (key === 'torso') { o = sp.torso; ctx.translate(o.ax, o.ay); if (o.flip) ctx.scale(-1, 1); blit(ctx, o.p.img, o.px, o.py); }
      else if (key === 'coat') { o = sp.coat; if (o && o.p.img) { var cs = moving ? sin(ph - 0.9) * 0.1 * amp : sin(t * 2) * 0.015; ctx.translate(o.ax, o.ay); ctx.rotate(cs + tilt * -0.6); blit(ctx, o.p.img, o.px, o.py); } }
      else if (key === 'head') { o = sp.head; ctx.translate(o.ax, o.ay); ctx.rotate(-tilt * 0.5 + (dead ? 0 : (moving ? sph * 0.015 : 0))); if (o.flip) ctx.scale(-1, 1); blit(ctx, o.p.img, o.px, o.py); }
      else if (key === 'armL' || key === 'armR') {
        sg = key === 'armL' ? 'L' : 'R'; o = sp[key];
        if (aim && gArm && sg === gArm.side) {
          var ar = gArm, tp = ar.tip || [ar.px, ar.p.h - 6], vx = (tp[0] - ar.px) * (ar.flip ? -1 : 1), vy = tp[1] - ar.py;
          var base0 = atan2(vy, vx), wgt = (NOROT[i.kind] ? 0.55 : 1) * aw;
          var rest = (moving ? -sin(sg === 'L' ? ph : ph + PI) * 0.3 * amp : 0);
          var rot = rest + wgt * nrm(fe - base0 - rest);
          var kick = rec * (i.melee ? 0 : H * 0.04), kxo = -ex * kick, kyo = -ey * kick;
          if (i.melee) { kxo = ex * lunge * H * 0.07; kyo = ey * lunge * H * 0.05; }
          var ax = ar.ax + kxo, ay = ar.ay + kyo;
          if (ar.p.img) { ctx.save(); ctx.translate(ax, ay); ctx.rotate(rot); if (ar.flip) ctx.scale(-1, 1); blit(ctx, ar.p.img, ar.px, ar.py); ctx.restore(); }
          var hx = ax + cos(rot) * vx - sin(rot) * vy, hy = ay + sin(rot) * vx + cos(rot) * vy;
          if (useSprite && ws && IMG[wid + '/' + wv]) {
            var wim = IMG[wid + '/' + wv], wf = sgn0 < 0, phi = elev, gx = ws.grip[0], gy = ws.grip[1], wr;
            var wb = atan2(ws.muzzle[1] - gy, ws.muzzle[0] - gx); wr = wf ? wb - phi : phi - wb;
          }
          if (useSprite && ws && IMG[wid + '/' + wv]) {
            ctx.restore(); ctx.save(); ctx.translate(hcx + ubx, hcy + uby); if (tilt) ctx.rotate(tilt); ctx.translate(-hcx, -hcy);
            ctx.translate(hx, hy); ctx.rotate(wr); if (wf) ctx.scale(-1, 1); ctx.scale(0.5, 0.5);
            blit(ctx, wim, gx, gy);
          } else if (i.sep && !i.melee) {
            var wp = i.c.parts.weapon, wimg = IMG[i.kind + '/weapon'];
            if (wimg) {
              var wfl = sgn0 < 0, g2 = wp.grip || wp.pivot, mz = wp.muzzle || [wp.w, wp.h / 2], ba = atan2(mz[1] - g2[1], mz[0] - g2[0]);
              ctx.restore(); ctx.save(); ctx.translate(hcx + ubx, hcy + uby); if (tilt) ctx.rotate(tilt); ctx.translate(-hcx, -hcy);
              ctx.translate(hx, hy);
              if (!NOROT[i.kind]) { var wa = wfl ? nrm(fe - (PI - ba)) : nrm(fe - ba); ctx.rotate(wa); ctx.scale(wfl ? -1 : 1, 1);  }
              else if (wfl) ctx.scale(-1, 1);
              blit(ctx, wimg, g2[0], g2[1]);
            }
          }
        } else {
          var sw2 = moving ? -sin(sg === 'L' ? ph : ph + PI) * 0.6 * amp : (dead ? 0.5 * (sg === 'L' ? -1 : 1) : sin(t * 2.4 + (sg === 'L' ? 0 : 1)) * 0.02);
          if (o.p.img) { ctx.translate(o.ax, o.ay); if (sw2) ctx.rotate(sw2); if (o.flip) ctx.scale(-1, 1); blit(ctx, o.p.img, o.px, o.py); }
        }
      }
      ctx.restore();
    }
    // riot shield prop held in front (side view)
    var shImg = i.kind === 'riot_shield' && !dead && IMG['riot_shield/prop_shield'];
    if (shImg && i.c.parts.prop_shield) {
      var shp = i.c.parts.prop_shield, shs = (H * 0.78) / shp.h, shx = hcx + sgn0 * H * 0.2 + ubx, shy = (sp.top + sp.gy) / 2 + H * 0.04 + uby;
      ctx.save(); ctx.translate(shx, shy); if (moving) ctx.rotate(sph * 0.02 * amp); ctx.scale(shs * (sgn0 < 0 ? -1 : 1), shs);
      blit(ctx, shImg, shp.pivot[0], shp.pivot[1]); ctx.restore();
    }
    ctx.restore();
    FL = 0;
  }

  // ================================================================ characters3 (3/4 skeleton puppets)
  var C3 = null, IMG3 = {}, K3 = {};
  var D2R = PI / 180, AIMMAX = 80 * D2R;
  var HERO_WEAPON = { pistol: 'grip', revolver: 'grip', machine_pistol: 'weapon_smg', smg: 'weapon_smg', assault_rifle: 'weapon_smg', plasma_rifle: 'weapon_smg', laser_rifle: 'weapon_smg', plasma: 'weapon_smg', laser: 'weapon_smg', sawn_off: 'weapon_shotgun', pump_shotgun: 'weapon_shotgun', sniper: 'weapon_shotgun' };
  function c3kinds() { var o = []; if (C3) for (var k in C3) o.push(k); return o; }
  function pt3(i, n) { return i.P[n]; }
  function info3(kind) {
    var i = K3[kind]; if (i) return i;
    var c = C3 && C3[kind]; if (!c) return null;
    var P = {}, n, p, q;
    for (n in c.parts) {
      q = c.parts[n]; p = P[n] = { n: n, w: q.w, h: q.h, px: q.pivot[0], py: q.pivot[1], img: IMG3[kind + '/' + n], m: q };
      if (q.end) {
        var vx = q.end[0] - q.pivot[0], vy = q.end[1] - q.pivot[1], a = atan2(vy, vx);
        p.len = Math.sqrt(vx * vx + vy * vy);
        p.r0 = -a; // normalise limb axis to angle 0; theta passed to limb() is the absolute axis direction (down = PI/2)
      }
    }
    var r = c.rig;
    i = K3[kind] = { kind: kind, c: c, P: P, r: r, H: r.height, s: r.target_px / r.height, target: r.target_px, melee: !!r.melee, mode: r.weaponMode, coat: !!r.coat, pan: (function (a) { var o = {}; (a || []).forEach(function (n) { o[n] = 1; }); return o; })(r.panels), w: r.target_px * 0.62, h: r.target_px, c3: true };
    i.torsoPP = { img: P.torso.img, px: 0, py: 0 };
    var g = P.hand_near_grip.m; i.gbeta = atan2(g.muzzle[1] - g.grip[1], g.muzzle[0] - g.grip[0]);
    ['weapon', 'weapon_smg', 'weapon_shotgun', 'weapon_pistol'].forEach(function (w) { var pp = P[w]; if (pp) pp.beta = atan2(pp.m.muzzle[1] - pp.m.grip[1], pp.m.muzzle[0] - pp.m.grip[0]); });
    i.nHx = P.hand_near_open.m.pivot; i.hold = r.hold.hand_near_open;
    i.soleOff = P.shoe_near.m.sole - P.shoe_near.m.pivot[1];
    return i;
  }
  // frame matrices [a,b,c,d,e,f]; pp() composes frame * T(x,y) * R(rot) and draws with a single setTransform (no save/restore)
  var FG = [1, 0, 0, 1, 0, 0], FLG = [1, 0, 0, 1, 0, 0], FTO = [1, 0, 0, 1, 0, 0], CF = FG;
  function comp(o, m, tx, ty, rot) {
    var c = cos(rot), s = sin(rot), a = m[0], b = m[1], c2 = m[2], d = m[3];
    o[4] = a * tx + c2 * ty + m[4]; o[5] = b * tx + d * ty + m[5];
    o[0] = a * c + c2 * s; o[1] = b * c + d * s; o[2] = -a * s + c2 * c; o[3] = -b * s + d * c;
  }
  function pp(ctx, p, x, y, rot) {
    if (!p.img) return;
    var m = CF, c = rot ? cos(rot) : 1, s = rot ? sin(rot) : 0;
    ctx.setTransform(m[0] * c + m[2] * s, m[1] * c + m[3] * s, -m[0] * s + m[2] * c, -m[1] * s + m[3] * c, m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]);
    blit(ctx, p.img, p.px, p.py);
  }
  var EX = 0, EY = 0;
  // draw limb: pivot at (x,y), axis direction theta (absolute); sets EX,EY to the child attach point
  function limb(ctx, p, x, y, th) {
    pp(ctx, p, x, y, th + p.r0);
    EX = x + cos(th) * p.len; EY = y + sin(th) * p.len;
  }
  function wsel(i, a) {
    // returns {mode:'baked'|'sprite'|'fist', w: weaponPartName}
    var m = i.mode;
    if (m === 'baked') return { m: 'baked' };
    if (m === 'sprite_fist') return { m: 'fist', w: 'weapon' };
    var h = HERO_WEAPON[a.weaponId || 'pistol'];
    if (!h || h === 'grip') return { m: 'baked' };
    return { m: 'sprite', w: h };
  }

  function prep3All() {
    if (!C3) return;
    for (var k in C3) { var i = info3(k); if (!i) continue; var l0 = lvlFor(i.s * 0.9), l1 = lvlFor(i.s * 1.4), n, p; for (n in i.P) { p = i.P[n]; if (!p.img) continue; for (var l = 1; l <= min(4, max(l0, l1) + 1); l++) mip(p.img, l); } }
  }
  function draw3(ctx, a, i) {
    var P = i.P, kind = a.kind, f = a.facing, fx = cos(f), fy = sin(f);
    var side = abs(fx) < 0.03 ? (LASTSIDE[kind] || 1) : (fx >= 0 ? 1 : -1); LASTSIDE[kind] = side;
    var phi = atan2(fy, abs(fx)); if (phi > AIMMAX) phi = AIMMAX; else if (phi < -AIMMAX) phi = -AIMMAX;
    var st = a.state, tt = a.t || 0, t = a.animT || 0, sc = i.s * (a.scale || 1), dead = st === 'dead';
    var moving = !!a.moving && !dead, spd = a.speed === undefined ? 1 : a.speed, amp = moving ? (0.6 + 0.4 * min(1, spd)) : 0;
    var ph = t * 11, sph = sin(ph), cph = cos(ph), inv = 1 / sc;
    var rec = 0, flash = 0, hurtK = 0, alpha = 1, frot = 0, shooting = st === 'shoot', mouth = false;
    if (shooting) { rec = tt < 0.16 ? 1 - tt / 0.16 : 0; mouth = tt < 0.25; }
    if (st === 'hurt') { flash = tt < 0.16 ? 0.85 - tt * 2.5 : 0; hurtK = tt < 0.2 ? 1 - tt / 0.2 : 0; mouth = true; }
    if (dead) {
      var k = min(1, tt / 0.45); k = 1 - (1 - k) * (1 - k); frot = -side * k * 1.52; flash = tt < 0.12 ? 0.8 - tt * 5 : 0; mouth = true;
      if (tt > 0.55) alpha = kind === 'hero' ? max(0.45, 1 - (tt - 0.55) / 0.6) : max(0, 1 - (tt - 0.55) / 0.45);
      if (alpha <= 0) return;
    }
    FL = flash > 0 ? flash : 0; LVL = lvlFor(sc);
    var breath = (moving || dead) ? 0 : sin(t * 2.4);
    var tor = P.torso.m;
    // ---- leg kinematics (y down, hip at y=0)
    var base = moving ? 0 : 0.1, fN = base + 0.489 * amp * sph, fF = -base - 0.489 * amp * sph;
    var flN = 0.7 * amp * max(0, cph), flF = 0.7 * amp * max(0, -cph);
    if (dead) { fN = 0.35; fF = -0.3; flN = 0.3; flF = 0; }
    var th1 = P.thigh_near, sh1 = P.shin_near, th2 = P.thigh_far, sh2 = P.shin_far;
    var tN = PI / 2 - fN, sN = tN + flN, tF = PI / 2 - fF, sF = tF + flF;
    var kNx = th1.len * cos(tN), kNy = th1.len * sin(tN), aNx = kNx + sh1.len * cos(sN), aNy = kNy + sh1.len * sin(sN);
    var kFx = th2.len * cos(tF), kFy = th2.len * sin(tF), aFx = kFx + sh2.len * cos(sF), aFy = kFy + sh2.len * sin(sF);
    var so = i.soleOff, lowest = max(aNy, aFy) + so;
    var hipY = moving ? -(lowest * 0.6 + (th1.len + sh1.len + so) * 0.4) : -lowest;
    var lean = (moving ? 0.052 * amp : 0) - hurtK * 0.1 - rec * 0.04; if (dead) lean = 0;
    var hxN = tor.hip_near[0] - tor.hip[0], hxF = tor.hip_far[0] - tor.hip[0];
    var rN = 0.5 * max(0, -fN) + 0.2 * flN, rF = 0.5 * max(0, -fF) + 0.2 * flF;

    var m0 = ctx.getTransform();
    ctx.save();
    if (alpha < 1) ctx.globalAlpha = alpha;
    var G0 = FG; G0[0] = m0.a; G0[1] = m0.b; G0[2] = m0.c; G0[3] = m0.d; G0[4] = m0.e; G0[5] = m0.f;
    comp(FLG, G0, a.x, a.y, frot); // ground frame at feet (then scaled/mirrored)
    FG[0] = FLG[0] * side * sc; FG[1] = FLG[1] * side * sc; FG[2] = FLG[2] * sc; FG[3] = FLG[3] * sc; FG[4] = FLG[4]; FG[5] = FLG[5];
    comp(FG, FG, -hurtK * 6 * inv * 0.3, 0, 0);
    // torso frame
    comp(FTO, FG, 0, hipY, lean); comp(FTO, FTO, -tor.hip[0], -tor.hip[1], 0);
    // ---------- far arm + back panel (torso frame)
    CF = FTO;
    var sf = tor.shoulder_far, sw = amp * 0.5 * sph, thU = PI / 2 - sw + (moving ? 0 : 0.05 + breath * 0.012) + (dead ? -0.5 : 0);
    var bend = 0.18 + 0.7 * max(0, -sw) + (dead ? 0.3 : 0);
    limb(ctx, P.arm_far_upper, sf[0], sf[1], thU); var ex = EX, ey = EY;
    limb(ctx, P.arm_far_fore, ex, ey, thU - bend); pp(ctx, P.hand_far_open, EX, EY, thU - bend + 0.15);
    if (i.pan.back) pp(ctx, P.back, tor.hip[0] - 34, tor.hip[1] - 16, (moving ? 0.1 * amp + 0.07 * amp * sin(ph - 0.9) : breath * 0.012) + 0.04);
    // ---------- legs (shoe, shin, thigh on top) in ground frame shifted to hip height
    comp(FLG, FG, 0, hipY, 0); CF = FLG;
    pp(ctx, P.shoe_far, hxF + aFx, aFy, rF); limb(ctx, sh2, hxF + kFx, kFy, sF); limb(ctx, th2, hxF, 0, tF);
    pp(ctx, P.shoe_near, hxN + aNx, aNy, rN); limb(ctx, sh1, hxN + kNx, kNy, sN); limb(ctx, th1, hxN, 0, tN);
    // ---------- upper body (torso frame)
    CF = FTO;
    if (i.pan.side_a) pp(ctx, P.side_a, tor.hip[0] + 8, tor.hip[1] - 20, (moving ? 0.09 * amp + 0.06 * amp * sin(ph - 0.7) : breath * 0.01));
    pp(ctx, i.torsoPP, 0, 0, 0);
    var nk = P.neck, np = tor.neck, tpx = np[0] + nk.px - nk.m.base[0], tpy = np[1] + nk.py - nk.m.base[1];
    pp(ctx, nk, tpx, tpy, 0);
    var hd = mouth ? P.head_open : P.head;
    pp(ctx, hd, tpx, tpy, -lean * 0.6 + (moving ? sph * 0.012 : breath * 0.006) + hurtK * -0.08);
    // ---------- near arm + weapon
    var ws = wsel(i, a), S = tor.shoulder_near, ang, rk = rec * 30;
    if (i.melee) {
      var ready = phi * 0.4 + 0.5 + (moving ? sph * 0.05 : breath * 0.02);
      if (shooting) {
        var u = min(1, tt / 0.3), w2 = tt > 0.3 ? min(1, (tt - 0.3) / 0.3) : 0, e = u * u * (3 - 2 * u);
        var swa = (phi - 1.5) + e * 2.1; ang = swa + (ready - swa) * w2; rk = 0;
      } else ang = ready;
    } else ang = phi + (moving ? sph * 0.02 : breath * 0.01) - rec * 0.05;
    if (dead) ang = 1.1;
    var cx = cos(ang), cy = sin(ang), sx = S[0] - cx * rk, sy = S[1] - cy * rk;
    var upA = P.arm_near_upper, foA = P.arm_near_fore;
    var tu = ang + (dead ? 0 : 0.2), tf = ang - (dead ? 0 : 0.1);
    limb(ctx, upA, sx, sy, tu); limb(ctx, foA, EX, EY, tf);
    var wx = EX, wy = EY;
    if (ws.m === 'baked') {
      var gh = P.hand_near_grip; pp(ctx, gh, wx, wy, ang - i.gbeta);
    } else {
      var hh = ws.m === 'fist' ? P.hand_near_grip : P.hand_near_open, hold = ws.m === 'fist' ? hh.m.grip : i.hold;
      var hcx = cos(ang), hsn = sin(ang), ox = hold[0] - hh.px, oy = hold[1] - hh.py;
      var gx = wx + hcx * ox - hsn * oy, gy = wy + hsn * ox + hcx * oy, wp = P[ws.w];
      if (wp) pp(ctx, wp, gx, gy, ang - wp.beta);
      pp(ctx, hh, wx, wy, ang);
    }
    ctx.restore();
    ctx.setTransform(m0.a, m0.b, m0.c, m0.d, m0.e, m0.f);
    FL = 0;
  }

  // ---------------------------------------------------------------- loading / API
  G.puppet = {
    basePath: '',
    shadow: true,
    load: function (cb) {
      M = (window.G_MANIFEST && window.G_MANIFEST.characters) || null; WM = (window.G_MANIFEST && window.G_MANIFEST.weapons) || null;
      C3 = (window.G_MANIFEST && window.G_MANIFEST.characters3) || null;
      if (!M && !C3) { if (cb) cb(0, 0); return; }
      if (loading) return; loading = true;
      var list = M ? fileList() : [], total, done = 0, b = base(), k, n, c;
      if (C3) for (k in C3) for (n in C3[k].parts) if (n !== 'portrait') list.push(['c3:' + k + '/' + n, C3[k].parts[n].file, 0]);
      total = list.length;
      if (!total) { loaded = true; if (cb) cb(0, 0); return; }
      list.forEach(function (e) {
        var im = new Image(), fin = function () {
          done++; if (cb) cb(done, total);
          if (done === total) { prep3All(); loaded = true; }
        };
        im.onload = fin; im.onerror = function () { e.missing = true; fin(); };
        if (e[0].indexOf('c3:') === 0) IMG3[e[0].slice(3)] = im; else IMG[e[0]] = im;
        im.src = b + e[1];
      });
    },
    ready: function () { return loaded; },
    draw: draw,
    drawShadow: drawShadow,
    sizeOf: function (kind) { var i3 = C3 && info3(kind); if (i3) return { w: i3.w, h: i3.h, footY: i3.h }; var i = M && info(kind); if (!i) return { w: 40, h: 80, footY: 80 }; return { w: i.w, h: i.h, footY: i.h }; },
    size: function (kind) { var i3 = C3 && info3(kind); if (i3) return i3.h; var i = M && info(kind); return i ? i.h : 80; },
    defaultScale: function (kind) { var i3 = C3 && info3(kind); if (i3) return i3.s; var i = M && info(kind); return i ? i.s : 0.2; },
    fix: FIX
  };
})();
