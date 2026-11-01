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

  function base() { return G.puppet.basePath || ''; }
  function tok(v) { return Array.isArray(v) ? [v[0], !!v[1]] : [v, false]; }
  function dirIdx(f) { var d = f * 57.29578; d = ((d % 360) + 360) % 360; return ((d + 22.5) / 45 | 0) % 8; }
  function nrm(a) { a = (a + PI) % TAU; if (a < 0) a += TAU; return a - PI; }
  var SKIP = /^(portrait|head_alt|head_expr|hand_|prop_|magazine|bullets|holster|knife|cigarette|pistol|shells|torso_cape|arm_gun_pair|weapon_)/;

  function wanted(kind, name) {
    if (SKIP.test(name)) return false;
    if (kind === 'attack_dog') return /^walk_/.test(name);
    return /^(head_|torso_|arm_|leg_|foot_|coat_|weapon$)/.test(name);
  }
  function fileList() {
    var out = [], c, k, n, id, v;
    for (k in M) {
      c = M[k]; if (k === 'crew' || !c.parts) continue;
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
    var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height, s = LVL ? mip(img, LVL) : img;
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

  function lvlFor(sc) { var l = Math.floor(Math.log(1 / (sc * (G.puppet.mipBias || 1.5))) / 0.6931); return l < 0 ? 0 : (l > 3 ? 3 : l); }

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
    var i = info(a.kind); if (!i) return;
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
    var i = info(a.kind); if (!i) return;
    if (G.puppet.shadow !== false) drawShadow(ctx, a);
    if (i.dog) { drawDog(ctx, a, i); return; }
    var f = a.facing, fx = cos(f), fy = sin(f), dn = DN[dirIdx(f)], sp = i.dirs[dn] || spec(i, dn);
    var st = a.state, tt = a.t || 0, t = a.animT || 0, sc = i.s * (a.scale || 1);
    // effective aim angle: keep arms from pointing straight up/down the screen (looks broken for cutouts)
    var elev = atan2(fy, abs(fx)); elev = elev < -0.85 ? -0.85 : (elev > 1.25 ? 1.25 : elev);
    var sgn0 = abs(fx) < 0.02 ? (sp.gunSide === 'L' ? -1 : 1) : (fx >= 0 ? 1 : -1);
    var fe = sgn0 > 0 ? elev : PI - elev, ex = cos(fe), ey = sin(fe);
    var moving = !!a.moving && st !== 'dead', spd = a.speed === undefined ? 1 : a.speed, amp = moving ? (0.35 + 0.65 * min(1, spd)) : 0;
    var H = sp.H, ph = t * 11, sph = sin(ph);
    var sideK = 0.3 + 0.7 * abs(fx), depK = abs(fy);
    var rec = 0, flash = 0, lean = 0, kx = 0, ky = 0, alpha = 1, frot = 0, lunge = 0, dead = st === 'dead';
    if (st === 'shoot') { rec = tt < 0.16 ? 1 - tt / 0.16 : 0; if (i.melee) { lunge = tt < 0.3 ? sin(min(1, tt / 0.3) * PI) : 0; } }
    if (st === 'hurt') { flash = tt < 0.16 ? 0.85 - tt * 2.5 : 0; var kb = tt < 0.2 ? 1 - tt / 0.2 : 0; kx = -fx * kb * H * 0.03; ky = -fy * kb * H * 0.012; lean = -kb * 0.1 * (fx >= 0 ? 1 : -1); }
    if (dead) {
      var k = min(1, tt / 0.45); k = 1 - (1 - k) * (1 - k);
      frot = (fx >= 0 ? -1 : 1) * k * 1.52; flash = tt < 0.12 ? 0.8 - tt * 5 : 0;
      if (tt > 0.55) alpha = i.kind === 'hero' ? max(0.45, 1 - (tt - 0.55) / 0.6) : max(0, 1 - (tt - 0.55) / 0.45);
      if (alpha <= 0) return;
    }
    FL = flash > 0 ? flash : 0; LVL = lvlFor(sc);
    var bob = moving ? -abs(sph) * H * 0.018 * amp : 0;
    var breath = (moving || dead) ? 0 : sin(t * 2.4) * H * 0.004;
    var tilt = (moving ? sph * 0.035 * amp * sideK : 0) + lean - rec * 0.05 * (fx >= 0 ? 1 : -1) + lunge * 0.08 * (fx >= 0 ? 1 : -1);
    var ubx = kx + fx * lunge * H * 0.05 - fx * rec * H * 0.012, uby = bob + ky + breath + (dead ? 0 : fy * lunge * H * 0.03);
    if (dead) { tilt = 0; ubx = 0; uby = 0; }
    var swA = 0.4 * amp * sideK, lift = H * 0.022 * amp * (0.3 + depK);
    var hcx = sp.hcx, hcy = sp.hcy;

    ctx.save();
    if (alpha < 1) ctx.globalAlpha = alpha;
    ctx.translate(a.x, a.y); if (frot) ctx.rotate(frot); ctx.scale(sc, sc); ctx.translate(-sp.ox, -sp.gy);
    // aim parameters
    var aim = !dead && (i.gun || i.melee), aw = i.melee ? lunge : 1;
    var wid = a.weaponId, useSprite = false, gArm = sp.gunArm, wv = null, ws = null;
    if (aim && gArm) {
      if (i.kind === 'hero' && wid && wid !== 'pistol' && WM && WM[wid]) { useSprite = true; gArm = sp.plainArm; wv = wvariant(ex, ey); ws = WM[wid][wv]; }
    } else gArm = null;
    var z = sp.z, n = z.length, q, key, o, rr, sg;
    for (q = 0; q < n; q++) {
      key = z[q];
      if (key === 'legL' || key === 'legR') {
        var sd = key === 'legL' ? 'L' : 'R', lg = sp.leg[sd]; if (!lg) continue;
        var pp = sd === 'L' ? ph : ph + PI, lr = dead ? 0.25 * (sd === 'L' ? 1 : -1) * (frot ? 1 : 0) : sin(pp) * swA, lf = moving ? max(0, -sin(pp + 0.4)) * lift : 0;
        ctx.save(); ctx.translate(lg.ax + ubx * 0.3, lg.ay + uby * 0.5 - lf); if (lr) ctx.rotate(lr);
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
          var rest = (moving ? -sin(sg === 'L' ? ph : ph + PI) * 0.3 * amp * sideK : 0);
          var rot = rest + wgt * nrm(fe - base0 - rest);
          var kick = rec * (i.melee ? 0 : H * 0.04), kxo = -ex * kick, kyo = -ey * kick;
          if (i.melee) { kxo = ex * lunge * H * 0.07; kyo = ey * lunge * H * 0.05; }
          var ax = ar.ax + kxo, ay = ar.ay + kyo;
          if (ar.p.img) { ctx.save(); ctx.translate(ax, ay); ctx.rotate(rot); if (ar.flip) ctx.scale(-1, 1); blit(ctx, ar.p.img, ar.px, ar.py); ctx.restore(); }
          var hx = ax + cos(rot) * vx - sin(rot) * vy, hy = ay + sin(rot) * vx + cos(rot) * vy;
          if (useSprite && ws && IMG[wid + '/' + wv]) {
            var wim = IMG[wid + '/' + wv], wf = sgn0 < 0, phi = elev, gx = ws.grip[0], gy = ws.grip[1], wr;
            if (wv === 'front') wr = phi - PI / 2; else if (wv === 'rear') wr = phi + PI / 2; else wr = phi - atan2(ws.muzzle[1] - gy, ws.muzzle[0] - gx);
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
              if (!NOROT[i.kind]) { var wa = wfl ? nrm(fe - (PI - ba)) : nrm(fe - ba); ctx.rotate(wa); ctx.scale(wfl ? -1 : 1, 1); var fs = 0.45 + 0.55 * abs(fx); ctx.scale(fs, 1); }
              else if (wfl) ctx.scale(-1, 1);
              blit(ctx, wimg, g2[0], g2[1]);
            }
          }
        } else {
          var sw2 = moving ? -sin(sg === 'L' ? ph : ph + PI) * 0.55 * amp * sideK : (dead ? 0.5 * (sg === 'L' ? -1 : 1) : sin(t * 2.4 + (sg === 'L' ? 0 : 1)) * 0.02);
          if (o.p.img) { ctx.translate(o.ax, o.ay); if (sw2) ctx.rotate(sw2); if (o.flip) ctx.scale(-1, 1); blit(ctx, o.p.img, o.px, o.py); }
        }
      }
      ctx.restore();
    }
    ctx.restore();
    FL = 0;
  }

  // ---------------------------------------------------------------- loading / API
  G.puppet = {
    basePath: '',
    shadow: true,
    load: function (cb) {
      M = (window.G_MANIFEST && window.G_MANIFEST.characters) || null; WM = (window.G_MANIFEST && window.G_MANIFEST.weapons) || null;
      if (!M) { if (cb) cb(0, 0); return; }
      if (loading) return; loading = true;
      var list = fileList(), total = list.length, done = 0, b = base();
      if (!total) { loaded = true; if (cb) cb(0, 0); return; }
      list.forEach(function (e) {
        var im = new Image(), fin = function () { done++; if (cb) cb(done, total); if (done === total) loaded = true; };
        im.onload = fin; im.onerror = function () { e.missing = true; fin(); };
        IMG[e[0]] = im; im.src = b + e[1];
      });
    },
    ready: function () { return loaded; },
    draw: draw,
    drawShadow: drawShadow,
    sizeOf: function (kind) { var i = M && info(kind); if (!i) return { w: 40, h: 80, footY: 80 }; return { w: i.w, h: i.h, footY: i.h }; },
    size: function (kind) { var i = M && info(kind); return i ? i.h : 80; },
    defaultScale: function (kind) { var i = M && info(kind); return i ? i.s : 0.2; },
    fix: FIX
  };
})();
