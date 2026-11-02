/* Arena shooter engine. API: G.arena.start({canvas,onEnd,loadout,chapter}), stop, pause, resume, state. Test hooks: window.__arenaTest. */
window.G = window.G || {};
(function () {
  var C = G.ARENA_CFG, W = C.W, H = C.H, DT = C.DT, WW = C.WORLD_W, WH = C.WORLD_H, ZOOM = C.CAM_ZOOM, VW = W / ZOOM, VH = H / ZOOM;
  var TAU = Math.PI * 2, cos = Math.cos, sin = Math.sin, sqrt = Math.sqrt, atan2 = Math.atan2, min = Math.min, max = Math.max;

  // ---------------- rng ----------------
  var seed = (Date.now() ^ 0x5bd1e995) >>> 0;
  function rnd() { seed = (seed + 0x6D2B79F5) | 0; var t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  function rr(a, b) { return a + (b - a) * rnd(); }
  function setting(k) { try { var s = G.save && G.save.state && G.save.state.settings; return !(s && s[k] === false); } catch (e) { return true; } }
  function sfx(n) { try { if (G.audio) G.audio.play(n); } catch (e) {} }
  function sget(k, d) { try { var v = G.save.state.settings[k]; return typeof v === typeof d ? v : d; } catch (e) { return d; } }
  function vib(ms) { try { if (G.settings) G.settings.vibrate(ms); } catch (e) {} }
  var dnums = [];   // floating damage numbers (world space)

  // ---------------- fx sprites (G_MANIFEST.fx / icons) ----------------
  var FXI = null, tintCache = {}, glowCv = null;
  function imgOk(im) { return im && im.complete && im.naturalWidth > 0; }
  function fxFrame(name, i) { var a = FXI && FXI[name]; if (!a || !a.length) return null; var f = a[((i % a.length) + a.length) % a.length]; return imgOk(f.im) ? f : null; }
  function fxLen(name) { var a = FXI && FXI[name]; return a ? a.length : 0; }
  // draw frame by manifest pivot at (x,y), rotated by rot, scaled s (sx stretches x only)
  function drawFx(c, f, x, y, rot, s, sx) {
    var pv = f.d.pivot || [f.d.w / 2, f.d.h / 2], X = (sx || 1) * s;
    c.save(); c.translate(x, y); if (rot) c.rotate(rot);
    c.drawImage(f.im, -pv[0] * X, -pv[1] * s, f.d.w * X, f.d.h * s); c.restore();
  }
  // enemy tracers: same sprites tinted orange/red (cached offscreen canvases)
  function tinted(name, i, col, a) {
    var f = fxFrame(name, i); if (!f) return null;
    var key = name + i + col, t = tintCache[key];
    if (!t) {
      var cv2 = document.createElement('canvas'); cv2.width = f.d.w; cv2.height = f.d.h; var g = cv2.getContext('2d');
      g.drawImage(f.im, 0, 0); g.globalCompositeOperation = 'source-atop'; g.globalAlpha = a; g.fillStyle = col; g.fillRect(0, 0, cv2.width, cv2.height);
      t = tintCache[key] = { im: cv2, d: f.d };
    }
    return t;
  }
  function getGlow() {
    if (glowCv) return glowCv;
    glowCv = document.createElement('canvas'); glowCv.width = glowCv.height = 32; var g = glowCv.getContext('2d'), gr = g.createRadialGradient(16, 16, 1, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,200,120,.95)'); gr.addColorStop(0.4, 'rgba(255,90,30,.55)'); gr.addColorStop(1, 'rgba(255,40,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    return glowCv;
  }

  // ---------------- builtin fx (replaceable: G.fx with same methods) ----------------
  // particle kinds: 0 spark line, 1 blood dot, 2 flash dot (fallback), 3 ring, 4 coin dot, 5 shell casing, 6 sprite animation
  if (!G.fx) {
    var P = [], pi = 0, beams = [];
    for (var q = 0; q < C.POOL.particles; q++) P.push({ a: false, t: 0, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, s: 1, c: '#fff', k: 0, nm: '', rot: 0, vr: 0, g: 0, fr: 0 });
    var add = function (k, x, y, vx, vy, life, s, c) {
      var p = null, n = P.length;
      for (var i = 0; i < n; i++) { var j = (pi + i) % n; if (!P[j].a) { p = P[j]; pi = j + 1; break; } }
      if (!p) return null;
      p.a = true; p.k = k; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.max = life; p.s = s; p.c = c; p.g = 0; p.rot = 0; p.vr = 0; p.nm = ''; p.fr = 0;
      return p;
    };
    var anim = function (nm, x, y, rot, s, life) { var p = add(6, x, y, 0, 0, life, s, '#fff'); if (p) { p.nm = nm; p.rot = rot; } return p; };
    G.fx = {
      // animated muzzle flash (no-gun variant: the gun is drawn by the puppet)
      muzzle: function (x, y, ang, big) {
        if (!setting('flashes')) return;
        if (fxFrame('x_muzzle', 0)) anim('x_muzzle', x, y, ang, (big ? 0.42 : 0.3) + rnd() * 0.05, 0.11); else if (fxFrame('muzzle_flash', 0)) anim('muzzle_flash', x, y, ang, 0.3 + rnd() * 0.06, 0.12); else add(2, x + cos(ang) * 6, y + sin(ang) * 6, 0, 0, 0.06, 7, '#fff3b0');
      },
      hit: function (x, y, ang) {
        if (fxFrame('x_spark', 0)) anim('x_spark', x, y, rnd() * TAU, 0.24 + rnd() * 0.1, 0.12); else if (fxFrame('hit_spark', 0)) anim('hit_spark', x, y, rnd() * TAU, 0.26 + rnd() * 0.1, 0.115);
        for (var i = 0; i < 2; i++) { var a = ang + Math.PI + rr(-0.9, 0.9), s = rr(60, 190); add(0, x, y, cos(a) * s, sin(a) * s, rr(0.1, 0.2), 2, '#ffe9a0'); }
      },
      // ejected shell casing: pops out sideways/up, falls with gravity, fades on the ground
      casing: function (x, y, ang, shell) {
        var side = ang - Math.PI / 2, sp = rr(30, 80);
        var p = add(5, x, y, cos(side) * sp, sin(side) * sp - rr(60, 110), rr(0.7, 0.95), shell ? 0.125 : 0.13, '#e8b84a');
        if (p) { p.g = 520; p.rot = rnd() * TAU; p.vr = rr(-16, 16); p.fr = rnd() * 3 | 0; p.t = rr(10, 22); p.nm = shell ? 'x_casing_shell' : 'x_casing_pistol'; }
      },
      blood: function (x, y, ang, n) { n = n || 4; for (var i = 0; i < n; i++) { var a = ang + rr(-1.2, 1.2), s = rr(40, 170); add(1, x, y, cos(a) * s, sin(a) * s, rr(0.25, 0.55), rr(1.5, 3.2), '#8e1b22'); } },
      explosion: function (x, y, r) {
        if (fxFrame('explosion', 0)) anim('explosion', x, y, 0, max(0.3, r / 85), 0.42); else add(3, x, y, 0, 0, 0.3, r, '#ffb347');
        for (var i = 0; i < 8; i++) { var a = rnd() * TAU, s = rr(60, 260); add(0, x, y, cos(a) * s, sin(a) * s, rr(0.2, 0.45), 2.5, i % 2 ? '#ff7043' : '#ffe082'); }
      },
      coin: function (x, y, gold) { for (var i = 0; i < 4; i++) add(4, x + rr(-6, 6), y + rr(-6, 6), rr(-20, 20), rr(-90, -30), 0.4, 2, gold === 2 ? '#ff5a78' : gold ? '#ffd23f' : '#6fe07a'); },
      beam: function (x1, y1, x2, y2, c) { beams.push({ x1: x1, y1: y1, x2: x2, y2: y2, t: 0.12, c: c, f: rnd() * 3 | 0 }); if (beams.length > 14) beams.shift(); },
      update: function (dt) {
        for (var i = 0; i < P.length; i++) {
          var p = P[i]; if (!p.a) continue;
          p.life -= dt; if (p.life <= 0) { p.a = false; continue; }
          if (p.k === 6) continue;
          if (p.k === 5) {
            p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
            p.t -= 1;   // p.t counts down the airborne frames; then it lies on the floor
            if (p.t > 0) { if ((p.t & 3) === 0) p.fr++; }   // tumble: cycle the 3 orientations while airborne
            else { p.g = 0; p.vx *= 0.8; p.vy = 0; p.vr *= 0.8; }
            continue;
          }
          p.x += p.vx * dt; p.y += p.vy * dt; var f = p.k === 4 ? 1 : 0.9; p.vx *= f; p.vy *= f;
        }
        for (var b = beams.length - 1; b >= 0; b--) { beams[b].t -= dt; if (beams[b].t <= 0) beams.splice(b, 1); }
      },
      draw: function (ctx) {
        for (var i = 0; i < P.length; i++) {
          var p = P[i]; if (!p.a) continue;
          var k = p.life / p.max, pk = p.k;
          if (pk === 6) {
            var n = fxLen(p.nm), fi = n ? min(n - 1, (1 - k) * n | 0) : 0, f = fxFrame(p.nm, fi);
            if (f) { ctx.globalAlpha = p.nm === 'hit_spark' ? 1 : min(1, k * 2.2 + 0.25); drawFx(ctx, f, p.x, p.y, p.rot, p.s); ctx.globalAlpha = 1; }
            continue;
          }
          if (pk === 5) {
            var cf = p.nm ? fxFrame(p.nm, p.fr) : fxFrame('shell_casing', p.fr);
            ctx.globalAlpha = k > 0.35 ? 1 : k / 0.35;
            if (cf) drawFx(ctx, cf, p.x, p.y, p.rot, p.s * (p.nm ? 1 : 1)); else { ctx.fillStyle = '#e8b84a'; ctx.fillRect(p.x - 1.5, p.y - 1, 3, 2); }
            ctx.globalAlpha = 1; continue;
          }
          ctx.globalAlpha = k > 1 ? 1 : k;
          if (pk === 3) { ctx.strokeStyle = p.c; ctx.lineWidth = 4 * k + 1; ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (1 - k * 0.8), 0, TAU); ctx.stroke(); }
          else if (pk === 0) { ctx.strokeStyle = p.c; ctx.lineWidth = p.s; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); ctx.stroke(); }
          else { ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (pk === 2 ? k : 1), 0, TAU); ctx.fill(); }
        }
        ctx.globalAlpha = 1;
        for (var b = 0; b < beams.length; b++) {
          var m = beams[b], ex = m.x2 - m.x1, ey = m.y2 - m.y1, len = sqrt(ex * ex + ey * ey), lf = fxFrame('x_laser', m.f + (S.tickT * 12 | 0)), lo = false;
          ctx.globalAlpha = min(1, m.t / 0.08);
          if (lf) {   // glow core line + capsule segments tiled end to end along the beam
            var ba = atan2(ey, ex), sc = 0.46, segw = (lf.d.w - 6) * sc, nseg = Math.ceil(len / segw);
            ctx.strokeStyle = 'rgba(255,60,50,.35)'; ctx.lineWidth = 11; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(m.x1, m.y1); ctx.lineTo(m.x2, m.y2); ctx.stroke(); ctx.lineCap = 'butt';
            ctx.save(); ctx.translate(m.x1, m.y1); ctx.rotate(ba);
            for (var si = 0; si < nseg; si++) { var sf = fxFrame('x_laser', m.f + si + (S.tickT * 12 | 0)); if (sf) ctx.drawImage(sf.im, si * segw - 2 * sc, -sf.d.pivot[1] * sc, sf.d.w * sc, sf.d.h * sc); }
            ctx.restore(); lo = true;
          }
          else if ((lf = fxFrame('laser', m.f + (S.tickT * 12 | 0)))) drawFx(ctx, lf, m.x1, m.y1, atan2(ey, ex), 0.34, len / (lf.d.w * 0.34));
          else { ctx.strokeStyle = '#ff3b30'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(m.x1, m.y1); ctx.lineTo(m.x2, m.y2); ctx.stroke(); ctx.strokeStyle = '#ffd0d0'; ctx.lineWidth = 1.8; ctx.stroke(); ctx.lineCap = 'butt'; }
        }
        ctx.globalAlpha = 1;
      },
      clear: function () { for (var i = 0; i < P.length; i++) P[i].a = false; beams.length = 0; }
    };
  }

  // ---------------- state ----------------
  var cv, ctx, opts, running = false, paused = false, raf = 0, lastTs = 0, acc = 0, vigCanvas = null;
  var cam = { x: WW / 2, y: WH / 2, l: 0, t: 0 }, props = [], decals = [], decalN = 0, drawList = [], propImgs = null, floorImg = null, floorSeed = 0;
  var hero, S, enemies, bullets, pickups, warns;
  var gridHead, gridNext, GC = C.GRID_CELL, GCOLS = Math.ceil(WW / GC), GROWS = Math.ceil(WH / GC);
  var qbuf = new Int16Array(C.POOL.enemies), qbuf2 = new Int16Array(C.POOL.enemies);
  var keys = {}, joy = { on: false, id: -1, bx: 0, by: 0, tx: 0, ty: 0, dx: 0, dy: 0 };
  var testMove = null, god = false, listeners = [];
  var actor = { kind: '', x: 0, y: 0, facing: 0, moving: false, speed: 0, state: 'idle', t: 0, animT: 0, weaponId: null, scale: 1 };

  var pub = {
    hp: 0, maxHp: 0, xp: 0, xpNeed: 1, level: 1, wave: 1, timeLeft: 0, cash: 0, gold: 0, weapons: [], kills: 0,
    phase: 'idle', chapter: 1, chapterName: '', waves: 15, weapon: null, bossTitle: '', bossHp: 0, bossMaxHp: 0, enemies: 0, bullets: 0, frameMs: 0, stats: {}, items: {}
  };

  function makePools() {
    enemies = []; bullets = []; pickups = []; warns = [];
    for (var i = 0; i < C.POOL.enemies; i++) enemies.push({ active: false, id: i, kind: '', def: null, x: 0, y: 0, vx: 0, vy: 0, r: 10, hp: 1, maxHp: 1, dmg: 1, spd: 0, scale: 1, elite: false, tag: '', title: '', facing: 0, moving: false, speed: 0, state: 'idle', t: 0, animT: 0, weaponId: null, atkCd: 0, fireCd: 0, burstLeft: 0, burstT: 0, hurtT: 0, shootT: 0, patIdx: 0, ps: 0, pat: '', patT: 0, chx: 0, chy: 0, volley: 0, boss: false });
    for (i = 0; i < C.POOL.bullets; i++) bullets.push({ active: false, friendly: true, x: 0, y: 0, vx: 0, vy: 0, r: 3, dmg: 0, life: 0, pierce: 0, splash: 0, color: '#fff', hitN: 0, hit: new Int16Array(10), kind: 0, ang: 0, sc: 1, tr: 0, age: 0 });
    for (i = 0; i < C.POOL.pickups; i++) pickups.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, v: 1, gold: false, mag: false, t: 0, rot: 0 });
    for (i = 0; i < 90; i++) warns.push({ active: false, x: 0, y: 0, t: 0, kind: '', elite: false, tag: '' });
    gridHead = new Int16Array(GCOLS * GROWS); gridNext = new Int16Array(C.POOL.enemies);
  }

  // ---------------- stats ----------------
  function permBonuses() {
    var o = {};
    try { if (G.economy && G.economy.getPermBonuses) { var b = G.economy.getPermBonuses(), pu = {}; (G.config && G.config.perm ? G.config.perm.stats : []).forEach(function (q) { pu[q.id] = q.unit; }); for (var k in b) o[k] = pu[k] === 'pct' ? b[k] * (k === 'pickup_range' ? 60 : 100) : b[k]; } } catch (e) {}
    if (opts && opts.loadout && opts.loadout.perm) for (var k2 in opts.loadout.perm) o[k2] = (o[k2] || 0) + opts.loadout.perm[k2];
    return o;
  }
  function recompute() {
    var st = {}, ids = C.STAT_IDS;
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i], def = C.STATS[id], v = def.base + (S.perm[id] || 0) + (S.cardBonus[id] || 0);
      for (var it in S.items) { var m = C.ITEMS[it].mods[id]; if (m) v += m * S.items[it]; }
      v = max(def.cap[0], min(def.cap[1], v)); st[id] = v;
    }
    var oldMax = hero.maxHp; hero.maxHp = Math.round(st.max_hp);
    if (oldMax && hero.maxHp > oldMax) hero.hp += hero.maxHp - oldMax;
    if (hero.hp > hero.maxHp) hero.hp = hero.maxHp;
    S.st = st; pub.stats = st; pub.items = S.items;
  }
  function effId(w) { return C.weaponIdAt(w.base, w.tier); }
  function syncWeaponsPub() {
    var w = S && S.weapon;
    pub.weapons = w ? [{ id: effId(w), tier: w.tier, slot: 0 }] : [];
    pub.weapon = w ? { id: effId(w), base: w.base, tier: w.tier, tierName: C.TIER_NAMES[w.tier] } : null;
  }

  // ---------------- run setup ----------------
  function newRun() {
    var save = null; try { save = G.save && G.save.state; } catch (e) {}
    S = {
      wave: 0, phase: 'idle', waveT: 0, waveLen: 20, spawnAcc: 0, spawned: 0, spawnTotal: 0, eliteLeft: 0, eliteEvery: 0,
      kills: 0, cash: 0, cashEarned: 0, gold: 0, gems: 0, xp: 0, level: 1, pending: 0, resolved: 0,
      bag: { cash: 0, gold: 0 }, weapon: null, ch: null, minHp: 1, items: {}, cardBonus: {}, perm: permBonuses(), st: {},
      cards: null, cardRerolls: 0, offers: [], shopRerolls: 0, shake: 0, flash: 0, endT: 0, result: null, bossDown: false, boss: null,
      bossSpawned: false, miniSpawned: false, eliteSpawned: false, wlevels: (save && save.weapons) || {}, hintT: 4, tickT: 0
    };
    if (opts.loadout && opts.loadout.weapons) S.wlevels = opts.loadout.weapons;
    S.ch = pickChapter(); pub.chapter = S.ch.id; pub.chapterName = S.ch.name; pub.waves = S.ch.waves;
    hero = { kind: 'hero', x: WW / 2, y: WH / 2 + 60, r: C.HERO.r, hp: C.HERO.startHp, maxHp: 0, facing: -Math.PI / 2, moving: false, speed: 0, state: 'idle', t: 0, animT: 0, weaponId: null, scale: 1, inv: 0, hurtT: 0, shootT: 0, lsCd: 0, dead: false };
    recompute(); hero.hp = hero.maxHp;
    genProps(); snapCam();
    try { if (G.street && G.street.load && !(G.street.ready && G.street.ready())) G.street.load(function () { if (!streetOn && S && S.ch) { var ob = props; genProps(); } }); } catch (e) {}
    var sw = (opts.loadout && (opts.loadout.startWeapon || opts.loadout.weapon)) || (save && save.startWeapon) || C.START_WEAPON;
    if (!C.WEAPONS[sw]) sw = C.START_WEAPON;
    S.weapon = newWeapon(sw, 0);
    hero.weaponId = effId(S.weapon); syncWeaponsPub();
  }
  function pickChapter() {
    var n = (opts && (opts.chapter || (opts.loadout && opts.loadout.chapter))) | 0;
    n = max(1, min(C.CHAPTERS.length, n || 1));
    return C.CHAPTERS[n - 1];
  }
  function newWeapon(id, tier) { return { base: id, tier: tier, cd: 0.2, mag: C.WEAPONS[C.weaponIdAt(id, tier)].mag, reloadT: 0, aim: -Math.PI / 2 }; }

  // ---------------- grid ----------------
  function buildGrid() {
    gridHead.fill(-1);
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i]; if (!e.active) continue;
      var cx = e.x / GC | 0, cy = e.y / GC | 0;
      if (cx < 0) cx = 0; else if (cx >= GCOLS) cx = GCOLS - 1; if (cy < 0) cy = 0; else if (cy >= GROWS) cy = GROWS - 1;
      var c = cy * GCOLS + cx; gridNext[i] = gridHead[c]; gridHead[c] = i;
    }
  }
  function queryGrid(x, y, rad, buf) {
    var x0 = max(0, (x - rad) / GC | 0), x1 = min(GCOLS - 1, (x + rad) / GC | 0), y0 = max(0, (y - rad) / GC | 0), y1 = min(GROWS - 1, (y + rad) / GC | 0), n = 0;
    for (var cy = y0; cy <= y1; cy++) for (var cx = x0; cx <= x1; cx++) for (var i = gridHead[cy * GCOLS + cx]; i >= 0; i = gridNext[i]) buf[n++] = i;
    return n;
  }

  // ---------------- enemies ----------------
  function valueMult() { return 1 + 0.08 * (S.wave - 1); }
  function spawnEnemy(kind, x, y, elite, tag) {
    var def = C.ENEMIES[kind], e = null;
    for (var i = 0; i < enemies.length; i++) if (!enemies[i].active) { e = enemies[i]; break; }
    if (!e) return null;
    var w = max(1, S.wave), boss = !!def.boss, df = S.ch.diff, bm = S.ch.bossMods;
    e.active = true; e.kind = kind; e.def = def; e.boss = boss; e.elite = !!elite || tag === 'elite'; e.tag = tag || ''; e.title = '';
    var hpx = 1, dmx = 1, scl = 1;
    if (tag === 'elite') { hpx = C.ELITE_WAVE.hp; dmx = C.ELITE_WAVE.dmg; scl = C.ELITE_WAVE.scale; e.title = 'ELITE'; }
    else if (elite) { hpx = C.ELITE.hp; dmx = C.ELITE.dmg; scl = C.ELITE.scale; }
    if (tag === 'super') e.title = 'SUPER ELITE';
    if (tag === 'boss') { hpx = bm.hp; dmx = bm.dmg; scl = bm.scale; e.title = S.ch.bossName; }
    e.scale = scl; e.r = def.r * e.scale;
    var hp = def.hp * (boss ? C.BOSS_HP_SCALE(w) : C.hpMult(w)) * df.hp * hpx;
    e.hp = e.maxHp = hp; e.dmg = def.dmg * C.dmgMult(w) * df.dmg * dmx;
    e.spd = def.spd * C.speedMult(w) * df.speed * (1 + rr(-0.06, 0.06)); e.x = x; e.y = y; e.vx = e.vy = 0;
    e.facing = atan2(hero.y - y, hero.x - x); e.moving = false; e.speed = 0; e.state = 'idle'; e.t = 0; e.animT = rnd() * 3; e.weaponId = null;
    e.atkCd = rr(0.2, 0.6); e.fireCd = rr(0.8, (def.fireCd || 2)); e.burstLeft = 0; e.burstT = 0; e.hurtT = 0; e.shootT = 0;
    e.patIdx = 0; e.ps = 0; e.pat = ''; e.patT = 0; e.volley = 0;
    if (boss || tag === 'elite') S.boss = e;
    return e;
  }
  function clampW(v, lim, m) { return v < m ? m : v > lim - m ? lim - m : v; }
  // spawn point just outside the visible camera rect (inside the world; clamps at the world edge)
  var ep = [0, 0];
  function edgePoint() {
    var o = C.SPAWN_OUT, m = C.SPAWN_MARGIN, l = cam.l - o, r = cam.l + VW + o, t = cam.t - o, b = cam.t + VH + o, x = 0, y = 0;
    for (var k = 0; k < 8; k++) {
      var s = rnd() * 4 | 0, u = rnd();
      if (s === 0) { x = l + u * (r - l); y = t; } else if (s === 1) { x = r; y = t + u * (b - t); } else if (s === 2) { x = l + u * (r - l); y = b; } else { x = l; y = t + u * (b - t); }
      if (x >= m && x <= WW - m && y >= m && y <= WH - m) break;
    }
    ep[0] = clampW(x, WW, m); ep[1] = clampW(y, WH, m); return ep;
  }
  function addWarn(kind, x, y, elite, t, tag) {
    for (var i = 0; i < warns.length; i++) if (!warns[i].active) { var w = warns[i]; w.active = true; w.x = x; w.y = y; w.kind = kind; w.elite = elite; w.tag = tag || ''; w.t = t || C.SPAWN_WARN; return; }
    spawnEnemy(kind, x, y, elite, tag);
  }
  function aliveCount() { var n = 0; for (var i = 0; i < enemies.length; i++) if (enemies[i].active) n++; return n; }
  function pickKind() {
    var tot = 0, T = C.SPAWN_TABLE, i;
    for (i = 0; i < T.length; i++) if (S.wave >= T[i][1]) tot += T[i][2];
    var r = rnd() * tot;
    for (i = 0; i < T.length; i++) if (S.wave >= T[i][1]) { r -= T[i][2]; if (r <= 0) return T[i][0]; }
    return T[0][0];
  }
  function spawnTick(dt) {
    if (S.spawned >= S.spawnTotal) return;
    var rate = S.spawnTotal / (S.waveLen * 0.8);
    S.spawnAcc += rate * dt;
    while (S.spawnAcc >= 1 && S.spawned < S.spawnTotal) {
      S.spawnAcc -= 1;
      var p = edgePoint(), px0 = p[0], py0 = p[1], grp = 1 + (rnd() < 0.3 ? 1 : 0) + (rnd() < 0.1 ? 1 : 0);
      for (var g = 0; g < grp && S.spawned < S.spawnTotal; g++) {
        var elite = S.eliteLeft > 0 && rnd() < S.eliteLeft / max(1, S.spawnTotal - S.spawned);
        if (elite) S.eliteLeft--;
        S.spawned++;
        if (aliveCount() + countWarns() < C.ALIVE_CAP) addWarn(pickKind(), clampW(px0 + rr(-24, 24), WW, 12), clampW(py0 + rr(-24, 24), WH, 12), elite);
      }
    }
  }
  function countWarns() { var n = 0; for (var i = 0; i < warns.length; i++) if (warns[i].active) n++; return n; }

  // ---------------- bullets ----------------
  function newBullet() { for (var i = 0; i < bullets.length; i++) if (!bullets[i].active) return bullets[i]; return null; }
  function fireEnemyBullet(x, y, ang, spd, dmg) {
    var b = newBullet(); if (!b) return;
    b.active = true; b.friendly = false; b.x = x; b.y = y; b.vx = cos(ang) * spd; b.vy = sin(ang) * spd; b.r = C.ENEMY_BULLET_R; b.dmg = dmg; b.life = 4; b.pierce = 0; b.splash = 0; b.color = '#ff7a2d'; b.hitN = 0;
    b.kind = 2; b.ang = ang; b.sc = C.ENEMY_BULLET_SCALE; b.tr = 0; b.age = rnd() * 0.25;
  }
  // effective stats of the single weapon: evolved def x tier mults x stat bonuses
  function weaponStats(w) {
    var id = effId(w), d = C.WEAPONS[id], T = C.WEAPON_TIERS[w.tier], st = S.st, lv = S.wlevels[w.base] ? (S.wlevels[w.base].level || 0) : 0;
    var pellets = d.pellets + (d.beam ? 0 : (d.pellets > 1 ? T.proj * 2 : T.proj));
    return {
      id: id, def: d, pellets: pellets, pierce: Math.floor(st.pierce) + (d.pierce || 0) + T.pierce,
      dmg: d.dmg * T.dmg * (1 + st.damage / 100) * (1 + C.WEAPON_LEVEL_DMG * lv),
      cd: 1 / (d.rate * T.rate * max(0.2, 1 + st.attack_speed / 100)),
      range: max(80, d.range + T.range + st.range)
    };
  }
  function muzzleLen(d) { return 14 + d.muzzle[0] * 0.17; }
  var mz = { x: 0, y: 0 };
  function fireWeapon(w, target) {
    var ws = weaponStats(w), d = ws.def, st = S.st, ox = hero.x, oy = hero.y - (usePuppet() ? 14 : 3);
    var ang = atan2(target.y - oy, target.x - ox), ml = muzzleLen(d), mx = ox + cos(ang) * ml, my = oy + sin(ang) * ml;
    w.aim = ang; hero.shootT = 0.15; mz.x = mx; mz.y = my;
    if (G.fx) { G.fx.muzzle(mx, my, ang, d.pellets > 1 || d.dmg >= 40); if (!d.beam && !d.bolt && G.fx.casing) G.fx.casing(ox + cos(ang) * 8, oy + sin(ang) * 8 - 2, ang, d.pellets > 1); }
    if (d.beam) {
      var x2 = mx + cos(ang) * ws.range, y2 = my + sin(ang) * ws.range, ex = x2 - mx, ey = y2 - my, L2 = ex * ex + ey * ey;
      if (G.fx) G.fx.beam(mx, my, x2, y2, d.color);
      for (var k = 0; k < enemies.length; k++) {
        var e = enemies[k]; if (!e.active) continue;
        var t = ((e.x - mx) * ex + (e.y - my) * ey) / L2; if (t < 0 || t > 1) continue;
        var px = mx + ex * t - e.x, py = my + ey * t - e.y, rr2 = e.r + 6;
        if (px * px + py * py < rr2 * rr2) { var crit = rnd() * 100 < st.crit; hitEnemy(e, ws.dmg * (crit ? C.CRIT_MULT : 1), ang); }
      }
      sfx('shoot'); return;
    }
    var n = ws.pellets, sprd = d.pellets > 1 ? d.spread : 0.11;
    for (var p = 0; p < n; p++) {
      var b = newBullet(); if (!b) break;
      var a = ang + (n > 1 ? (p / (n - 1) - 0.5) * sprd + rr(-0.03, 0.03) : rr(-d.spread, d.spread));
      var crit2 = rnd() * 100 < st.crit;
      b.active = true; b.friendly = true; b.x = mx; b.y = my; b.vx = cos(a) * d.speed; b.vy = sin(a) * d.speed; b.r = C.BULLET_R;
      b.dmg = ws.dmg * (crit2 ? C.CRIT_MULT : 1); b.life = ws.range / d.speed + 0.04; b.pierce = ws.pierce; b.color = d.color; b.hitN = 0;
      b.splash = d.splash ? d.splash * (1 + st.explosion / 100) : 0;
      b.kind = d.bolt === 'plasma' ? 1 : 0; b.ang = a; b.sc = (d.bsc || 1) * C.BULLET_SCALE; b.tr = d.pellets > 1 ? 0 : (d.tr === 1 ? 3 : d.tr === 2 ? 2 : 1); b.age = 0;
    }
    sfx('shoot');
  }

  function hitEnemy(e, dmg, ang) {
    if (!e.active) return;
    e.hp -= dmg; e.hurtT = 0.12;
    if (dnums.length < 40 && setting('dmgNumbers')) dnums.push({ x: e.x + rr(-6, 6), y: e.y - e.r - 6, v: Math.max(1, Math.round(dmg)), t: 0.7, big: dmg >= 40 });
    if (!e.boss) { var kb = 2.5 * (1 - min(0.8, e.r / 40)); e.x += cos(ang) * kb; e.y += sin(ang) * kb; }
    if (G.fx) { G.fx.hit(e.x, e.y, ang); G.fx.blood(e.x, e.y, ang, 2); }
    var ls = S.st.lifesteal;
    if (ls > 0 && hero.lsCd <= 0 && rnd() * 100 < ls && hero.hp < hero.maxHp) { hero.hp = min(hero.maxHp, hero.hp + 1); hero.lsCd = C.LIFESTEAL_COOLDOWN; }
    sfx('hit');
    if (e.hp <= 0) killEnemy(e, true);
  }
  function explode(x, y, radius, dmg, skip) {
    if (G.fx) G.fx.explosion(x, y, radius); sfx('explode');
    var n = queryGrid(x, y, radius + 36, qbuf2);
    for (var i = 0; i < n; i++) {
      var e = enemies[qbuf2[i]]; if (!e.active || e === skip) continue;
      var dx = e.x - x, dy = e.y - y, rad = radius + e.r;
      if (dx * dx + dy * dy < rad * rad) hitEnemy(e, dmg, atan2(dy, dx));
    }
  }
  function bulletHitEnemies(b) {
    var n = queryGrid(b.x, b.y, b.r + 38, qbuf);
    for (var i = 0; i < n; i++) {
      var e = enemies[qbuf[i]]; if (!e.active) continue;
      var dx = e.x - b.x, dy = e.y - b.y, rad = e.r + b.r;
      if (dx * dx + dy * dy >= rad * rad) continue;
      var seen = false; for (var h = 0; h < b.hitN; h++) if (b.hit[h] === e.id) { seen = true; break; }
      if (seen) continue;
      var ang = atan2(b.vy, b.vx);
      if (b.splash > 0) { b.active = false; explode(b.x, b.y, b.splash, b.dmg, null); return true; }
      hitEnemy(e, b.dmg, ang);
      var ex = S.st.explosion;
      if (ex > 0) explode(b.x, b.y, min(64, 14 + ex * 0.5), b.dmg * 0.35, e);
      if (b.hitN < 10) b.hit[b.hitN++] = e.id;
      if (b.pierce <= 0) { b.active = false; return true; }
      b.pierce--;
    }
    return false;
  }
  function updateBullets(dt) {
    var hr = hero.r + C.ENEMY_BULLET_R - 2;
    for (var i = 0; i < bullets.length; i++) {
      var b = bullets[i]; if (!b.active) continue;
      var spd = sqrt(b.vx * b.vx + b.vy * b.vy), n = max(1, Math.ceil(spd * dt / 9)), sx = b.vx * dt / n, sy = b.vy * dt / n;
      for (var s = 0; s < n; s++) {
        b.x += sx; b.y += sy;
        if (b.friendly) { if (bulletHitEnemies(b)) break; }
        else if (!hero.dead) {
          var dx = hero.x - b.x, dy = hero.y - b.y;
          if (dx * dx + dy * dy < hr * hr) { b.active = false; hurtHero(b.dmg); break; }
        }
      }
      if (!b.active) continue;
      b.life -= dt; b.age += dt;
      if (b.life <= 0 || b.x < -30 || b.x > WW + 30 || b.y < -30 || b.y > WH + 30) b.active = false;
    }
  }

  // ---------------- pickups ----------------
  function fillPickup(p, x, y, vx, vy, v, gold, gem, big) { p.active = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.v = v; p.gold = gold; p.gem = gem | 0; p.big = big | 0; p.mag = false; p.t = 0; p.rot = rnd() * TAU; }
  // gem: 0 none, 1 small, 2 large. big: 0 auto-tier by value, 1 bag, 2 case (boss drops)
  function dropPickup(x, y, v, gold, gem, big) {
    var p = null;
    for (var i = 0; i < pickups.length; i++) if (!pickups[i].active) { p = pickups[i]; break; }
    if (!p) { collect({ v: v, gold: gold, gem: gem, x: x, y: y }); return; }
    var a = rnd() * TAU, s = rr(30, 110);
    fillPickup(p, x, y, cos(a) * s, sin(a) * s, v, gold, gem, big);
  }
  function collect(p) {
    if (p.gem) { S.gems += p.v; if (G.fx) G.fx.coin(p.x, p.y, 2); sfx('levelup'); return; }
    if (p.gold) { S.gold += p.v; gainXp(C.GOLD_BAR_XP * p.v); }
    else { var cv2 = Math.round(p.v * C.CASH_MULT); S.cash += cv2; S.cashEarned += cv2; gainXp(p.v); }
    if (G.fx) G.fx.coin(p.x, p.y, p.gold); sfx('coin');
  }
  function gainXp(v) {
    S.xp += v;
    while (S.xp >= C.xpNeed(S.level)) { S.xp -= C.xpNeed(S.level); S.level++; S.pending++; sfx('levelup'); if (G.arenaUI && S.phase === 'fight') S.toastT = 1.2; }
  }
  function updatePickups(dt) {
    var pr = S.st.pickup_range, win = S.phase === 'won';
    for (var i = 0; i < pickups.length; i++) {
      var p = pickups[i]; if (!p.active) continue;
      p.t += dt;
      var dx = hero.x - p.x, dy = hero.y - p.y, d2 = dx * dx + dy * dy;
      if (!p.mag && (win || (d2 < pr * pr && !hero.dead))) p.mag = true;
      if (p.mag) {
        var d = sqrt(d2) || 1, sp2 = C.MAGNET_SPEED * (0.5 + min(1.5, p.t));
        p.x += dx / d * sp2 * dt; p.y += dy / d * sp2 * dt;
        if (d < hero.r + 8) { p.active = false; collect(p); }
      } else {
        p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9;
        p.x = max(8, min(WW - 8, p.x)); p.y = max(8, min(WH - 8, p.y));
      }
    }
  }
  function killEnemy(e, drops) {
    e.active = false;
    if (G.fx) G.fx.blood(e.x, e.y, rnd() * TAU, 8);
    if (!drops) return;
    addDecal(e.x, e.y + e.r * 0.6, e.boss ? 2 : e.r > 15 ? 1 : 0);
    S.kills++;
    var def = e.def, vm = valueMult(), el = e.elite;
    if (def.boss) {
      var nd = def.drops, per = max(1, Math.round(def.val * vm)), nCase = max(1, Math.round(nd * 0.3)), nBag = max(1, Math.round(nd * 0.25)), nRest = max(0, nd - nCase - nBag), i;
      dropPickup(e.x + rr(-24, 24), e.y + rr(-24, 24), per * nCase, false, 0, 2);   // total value conserved: 1 case + 1 bag + the rest as bundles
      dropPickup(e.x + rr(-30, 30), e.y + rr(-30, 30), per * nBag, false, 0, 1);
      for (i = 0; i < nRest; i++) dropPickup(e.x + rr(-30, 30), e.y + rr(-30, 30), per, false);
      var gl = def.gold; while (gl > 0) { var gv = gl >= 4 ? 4 : gl >= 2 ? 2 : 1; dropPickup(e.x + rr(-30, 30), e.y + rr(-30, 30), gv, true); gl -= gv; }
      for (i = 0; i < (def.gems || 0); i++) dropPickup(e.x + rr(-34, 34), e.y + rr(-34, 34), C.GEM_VALUE_BIG, false, 2);
      for (i = 0; i < (def.gemsSmall || 0); i++) dropPickup(e.x + rr(-34, 34), e.y + rr(-34, 34), C.GEM_VALUE_SMALL, false, 1);
      S.shake = 14; if (G.fx) G.fx.explosion(e.x, e.y, 70); sfx('explode');
      if (e.tag === 'boss') { S.bossDown = true; }
      if (S.boss === e) S.boss = null;
    } else {
      dropPickup(e.x, e.y, max(1, Math.round(def.val * vm * (e.tag === 'elite' ? C.ELITE_WAVE.value : el ? C.ELITE.value : 1))), false);
      if (e.tag === 'elite') { for (var ge = 0; ge < 2; ge++) dropPickup(e.x + rr(-12, 12), e.y + rr(-12, 12), 1, true); if (S.boss === e) S.boss = null; }
      var gc = (def.goldChance || 0) + (el ? C.ELITE.goldChance : 0);
      if (gc > 0 && rnd() < gc * (1 + S.st.luck / 100)) dropPickup(e.x, e.y, 1, true);
    }
  }

  // ---------------- hero ----------------
  function hurtHero(dmg) {
    if (hero.dead || hero.inv > 0 || god) return;
    if (rnd() * 100 < S.st.dodge) { hero.inv = 0.12; return; }
    var ar = S.st.armor, mult = ar >= 0 ? 10 / (10 + ar) : 1 + (-ar) / 10;
    var d = max(1, Math.round(dmg * mult));
    hero.hp -= d; hero.inv = C.HERO.invuln; hero.hurtT = 0.2;
    sfx('hurt'); vib(35); if (setting('shake')) S.shake = max(S.shake, 6); if (setting('flashes')) S.flash = 0.25;
    if (G.fx) G.fx.blood(hero.x, hero.y, rnd() * TAU, 4);
    if (hero.hp <= 0) { hero.hp = 0; hero.dead = true; hero.state = 'dead'; hero.t = 0; beginEnd(false); }
  }
  function moveInput() {
    if (testMove) return testMove;
    var dx = 0, dy = 0;
    if (keys.KeyA || keys.ArrowLeft) dx -= 1; if (keys.KeyD || keys.ArrowRight) dx += 1;
    if (keys.KeyW || keys.ArrowUp) dy -= 1; if (keys.KeyS || keys.ArrowDown) dy += 1;
    if (dx || dy) { var l = sqrt(dx * dx + dy * dy); return [dx / l, dy / l]; }
    if (joy.on) return [joy.dx, joy.dy];
    return [0, 0];
  }
  var best = { e: null, d2: 1e12 };
  function findNearest() {
    var bd = 1e12, be = null;
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i]; if (!e.active) continue;
      var dx = e.x - hero.x, dy = e.y - hero.y, d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; be = e; }
    }
    best.e = be; best.d2 = bd; return be;
  }
  function updateHero(dt) {
    if (hero.dead) { hero.t += dt; return; }
    var m = moveInput(), sp2 = C.HERO.speed * S.st.move_speed / 100, mag = min(1, sqrt(m[0] * m[0] + m[1] * m[1]));
    var hm = C.HERO_MARGIN; hero.x = max(hm, min(WW - hm, hero.x + m[0] * sp2 * dt)); hero.y = max(hm, min(WH - hm, hero.y + m[1] * sp2 * dt));
    collideProps(hero, 0, 0);
    hero.moving = mag > 0.05; hero.speed = mag;
    hero.inv = max(0, hero.inv - dt); hero.hurtT = max(0, hero.hurtT - dt); hero.shootT = max(0, hero.shootT - dt); hero.lsCd = max(0, hero.lsCd - dt);
    if (S.st.regen > 0 && hero.hp < hero.maxHp) hero.hp = min(hero.maxHp, hero.hp + S.st.regen * dt);
    var tg = findNearest(), anyFire = false, w = S.weapon, ws = weaponStats(w), d = ws.def;
    w.cd -= dt;
    if (w.reloadT > 0) { w.reloadT -= dt; if (w.reloadT <= 0) w.mag = d.mag; }
    else if (tg && best.d2 <= (ws.range + tg.r) * (ws.range + tg.r) && w.cd <= 0) {
      fireWeapon(w, tg); anyFire = true; w.cd += ws.cd; if (w.cd < -ws.cd) w.cd = 0;
      if (d.mag > 0) { w.mag--; if (w.mag <= 0) w.reloadT = d.reload / max(0.2, 1 + S.st.reload_speed / 100); }
    }
    if (tg && (anyFire || hero.shootT > 0)) hero.facing = atan2(tg.y - hero.y, tg.x - hero.x);
    else if (hero.moving) hero.facing = atan2(m[1], m[0]);
    if (tg) w.aim = atan2(tg.y - hero.y, tg.x - hero.x);
    if (hero.hp / hero.maxHp < S.minHp) S.minHp = hero.hp / hero.maxHp;
    hero.animT += dt * (hero.moving ? 1 : 0.2); hero.t += dt;
    var ns = hero.hurtT > 0 ? 'hurt' : hero.shootT > 0 ? 'shoot' : hero.moving ? 'walk' : 'idle';
    if (ns !== hero.state) { hero.state = ns; hero.t = 0; }
    hero.weaponId = ws.id;
  }

  // ---------------- enemy AI ----------------
  function setES(e, s) { if (e.state !== s) { e.state = s; e.t = 0; } }
  function updateEnemies(dt) {
    var hx = hero.x, hy = hero.y;
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i]; if (!e.active) continue;
      var def = e.def, dx = hx - e.x, dy = hy - e.y, d = sqrt(dx * dx + dy * dy) || 1, ux = dx / d, uy = dy / d;
      var vx = 0, vy = 0, sp2 = e.spd;
      e.atkCd -= dt; e.fireCd -= dt; e.hurtT = max(0, e.hurtT - dt); e.shootT = max(0, e.shootT - dt); e.t += dt;
      if (e.boss) { bossAI(e, dt, d, ux, uy); continue; }
      if (def.keep) { // gunman
        if (d > def.keep + 25) { vx = ux * sp2; vy = uy * sp2; }
        else if (d < def.keep - 45) { vx = -ux * sp2; vy = -uy * sp2; }
        else { var sg = (e.id & 1) ? 1 : -1; vx = -uy * sp2 * 0.5 * sg; vy = ux * sp2 * 0.5 * sg; }
        if (e.burstLeft > 0) {
          e.burstT -= dt;
          if (e.burstT <= 0) { e.burstLeft--; e.burstT = def.burstGap; var a = atan2(hy - e.y, hx - e.x) + rr(-0.06, 0.06); fireEnemyBullet(e.x + cos(a) * e.r, e.y + sin(a) * e.r, a, def.bspd, e.dmg); e.shootT = 0.2; if (G.fx) G.fx.muzzle(e.x + cos(a) * e.r, e.y + sin(a) * e.r, a); }
        } else if (e.fireCd <= 0 && d < 420) { e.burstLeft = def.burst; e.burstT = 0; e.fireCd = def.fireCd * rr(0.9, 1.2); }
      } else {
        vx = ux * sp2; vy = uy * sp2;
        if (def.shotRange && d < def.shotRange && e.fireCd <= 0) {
          e.fireCd = def.fireCd * rr(0.9, 1.15); var a2 = atan2(dy, dx);
          for (var p = 0; p < def.pellets; p++) fireEnemyBullet(e.x + cos(a2) * e.r, e.y + sin(a2) * e.r, a2 + (p / (def.pellets - 1) - 0.5) * def.spread, def.bspd, e.dmg);
          e.shootT = 0.25; sfx('shoot');
        }
      }
      e.vx = vx; e.vy = vy; e.x += vx * dt; e.y += vy * dt;
      e.x = max(e.r, min(WW - e.r, e.x)); e.y = max(e.r, min(WH - e.r, e.y));
      collideProps(e, vx * dt, vy * dt);
      e.facing = atan2(dy, dx); e.moving = true; e.speed = min(1, sp2 / 120); e.animT += dt * (sp2 / 60);
      setES(e, e.hurtT > 0 ? 'hurt' : e.shootT > 0 ? 'shoot' : 'walk');
      // contact
      if (def.melee && !hero.dead) {
        var rad = e.r + hero.r;
        if (d < rad && e.atkCd <= 0) { e.atkCd = def.atkCd; hurtHero(def.contact ? def.contact * C.dmgMult(S.wave) : e.dmg); }
      }
    }
  }
  function separate() {
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i]; if (!e.active || e.boss) continue;
      var cx = e.x / GC | 0, cy = e.y / GC | 0;
      for (var oy = -1; oy <= 1; oy++) for (var ox = -1; ox <= 1; ox++) {
        var gx = cx + ox, gy = cy + oy; if (gx < 0 || gy < 0 || gx >= GCOLS || gy >= GROWS) continue;
        for (var j = gridHead[gy * GCOLS + gx]; j >= 0; j = gridNext[j]) {
          if (j <= i) continue;
          var o = enemies[j], dx = o.x - e.x, dy = o.y - e.y, rad = e.r + o.r, d2 = dx * dx + dy * dy;
          if (d2 < rad * rad && d2 > 0.01) {
            var d = sqrt(d2), push = (rad - d) * 0.35 / d;
            e.x -= dx * push * 0.5; e.y -= dy * push * 0.5;
            if (!o.boss) { o.x += dx * push * 0.5; o.y += dy * push * 0.5; }
          }
        }
      }
    }
  }
  function spawnAround(e, kind, n) {
    for (var i = 0; i < n; i++) { var a = rnd() * TAU; addWarn(kind, clampW(e.x + cos(a) * 70, WW, 14), clampW(e.y + sin(a) * 70, WH, 14), false, 0.5); }
  }
  function bossAI(e, dt, d, ux, uy) {
    var def = e.def, pats = def.patterns, half = e.hp < e.maxHp * 0.5;
    var vx = 0, vy = 0, dmgB = e.dmg;
    e.facing = atan2(uy, ux);
    if (e.ps === 0) {
      vx = ux * e.spd; vy = uy * e.spd; e.patT += dt; setES(e, 'walk');
      if (e.patT >= C.BOSS_MOVE_TIME * (half ? 0.7 : 1)) {
        e.ps = 1; e.patT = 0; e.pat = pats[e.patIdx++ % pats.length];
        if (e.pat === 'ring' && !half) e.pat = pats[e.patIdx++ % pats.length];
      }
    } else if (e.ps === 1) {
      e.patT += dt; setES(e, 'idle'); e.hurtT = max(e.hurtT, 0.04 * ((e.patT * 12 | 0) & 1));
      if (e.patT >= C.BOSS_TELEGRAPH) {
        e.ps = 2; e.patT = 0; e.volley = 0; e.shootT = 0.3;
        if (e.pat === 'charge') { e.chx = ux; e.chy = uy; }
        else if (e.pat === 'summon') { spawnAround(e, 'thug_knife', def.summon - 1); spawnAround(e, 'thug_bat', 1); sfx('boss'); }
        else if (e.pat === 'ring') { for (var k = 0; k < 20; k++) fireEnemyBullet(e.x, e.y, k / 20 * TAU, def.bspd * 0.8, dmgB); sfx('shoot'); }
      }
    } else {
      e.patT += dt; setES(e, 'shoot');
      if (e.pat === 'charge') { vx = e.chx * C.BOSS_CHARGE_SPEED; vy = e.chy * C.BOSS_CHARGE_SPEED; if (e.patT >= C.BOSS_CHARGE_TIME) { e.ps = 0; e.patT = 0; } }
      else if (e.pat === 'spread') {
        var volleys = (e.kind === 'boss_leader' || e.tag === 'boss') ? 3 : 1;
        if (e.volley < volleys && e.patT >= e.volley * 0.28) {
          e.volley++; var a = atan2(uy, ux);
          for (var p = 0; p < def.pellets; p++) fireEnemyBullet(e.x + cos(a) * e.r, e.y + sin(a) * e.r, a + (p / (def.pellets - 1) - 0.5) * def.spread, def.bspd * (1 + (p % 2) * 0.12), dmgB);
          sfx('shoot'); if (G.fx) G.fx.muzzle(e.x + cos(a) * e.r, e.y + sin(a) * e.r, a);
        }
        if (e.patT >= volleys * 0.28 + 0.2) { e.ps = 0; e.patT = 0; }
      } else if (e.patT >= 0.45) { e.ps = 0; e.patT = 0; }
    }
    e.x = max(e.r, min(WW - e.r, e.x + vx * dt)); e.y = max(e.r, min(WH - e.r, e.y + vy * dt));
    collideProps(e, 0, 0);
    e.moving = vx !== 0 || vy !== 0; e.speed = e.moving ? 0.6 : 0; e.animT += dt * (e.moving ? 1 : 0.2);
    if (!hero.dead && d < e.r + hero.r) {
      if (e.atkCd <= 0) { e.atkCd = 0.7; hurtHero(def.contact * C.dmgMult(S.wave) * (e.pat === 'charge' && e.ps === 2 ? 1.5 : 1)); }
    }
  }

  // ---------------- wave flow ----------------
  function startWave(n) {
    S.wave = n; S.phase = 'fight'; S.waveT = 0; S.waveLen = C.waveTime(n, n >= S.ch.waves); S.spawnAcc = 1.5; S.spawned = 0;
    S.spawnTotal = Math.round(C.waveEnemyCount(n) * S.ch.diff.count); S.eliteSpawned = false; S.eliteLeft = C.ELITES_PER_WAVE(n); S.bossSpawned = false; S.miniSpawned = false; S.boss = null;
    var i;
    for (i = 0; i < enemies.length; i++) enemies[i].active = false;
    for (i = 0; i < bullets.length; i++) bullets[i].active = false;
    for (i = 0; i < pickups.length; i++) pickups[i].active = false;
    for (i = 0; i < warns.length; i++) warns[i].active = false;
    hero.x = WW / 2; hero.y = WH / 2 + 60; hero.inv = 0.8; snapCam(); decalN = 0; for (i = 0; i < decals.length; i++) decals[i].a = 0;
    // bag respawn (Brotato rule)
    var bc = S.bag.cash, bg = S.bag.gold;
    if (bc > 0) {
      var cnt = min(C.BAG_RESPAWN_MAX, bc), base = Math.floor(bc / cnt), rem = bc - base * cnt;
      for (i = 0; i < cnt; i++) { var p = null; for (var k = 0; k < pickups.length; k++) if (!pickups[k].active) { p = pickups[k]; break; } if (!p) break; fillPickup(p, clampW(hero.x + rr(-190, 190), WW, 30), clampW(hero.y + rr(-320, 320), WH, 30), 0, 0, base + (i < rem ? 1 : 0), false); }
    }
    for (i = 0; i < bg; i++) { var q = null; for (var k2 = 0; k2 < pickups.length; k2++) if (!pickups[k2].active) { q = pickups[k2]; break; } if (!q) break; fillPickup(q, clampW(hero.x + rr(-190, 190), WW, 30), clampW(hero.y + rr(-320, 320), WH, 30), 0, 0, 1, true); }
    S.bag.cash = 0; S.bag.gold = 0;
    S.weapon.cd = 0.3; S.weapon.mag = C.WEAPONS[effId(S.weapon)].mag; S.weapon.reloadT = 0;
    if (n === 1) { spawnWarnInstant(); }
  }
  function spawnWarnInstant() { for (var i = 0; i < 3; i++) { var p = edgePoint(); addWarn('thug_knife', p[0], p[1], false, 0.4 + i * 0.1); S.spawned++; } }
  function waveUpdate(dt) {
    S.waveT += dt;
    var ch = S.ch, sx = clampW(hero.x, WW, 60), sy = clampW(cam.t - 20, WH, 60);
    if (S.wave === ch.elite && !S.eliteSpawned && S.waveT >= C.SPECIAL_AT) { S.eliteSpawned = true; addWarn(ch.eliteKind, sx, sy, false, 1.0, 'elite'); sfx('boss'); }
    if (S.wave === ch.superElite && !S.miniSpawned && S.waveT >= C.SPECIAL_AT) { S.miniSpawned = true; addWarn('mini_boss', sx, sy, false, 1.2, 'super'); sfx('boss'); }
    if (S.wave === ch.boss && !S.bossSpawned && S.waveT >= C.BOSS_SPAWN_AT) { S.bossSpawned = true; addWarn(ch.bossKind, sx, sy, false, 1.4, 'boss'); sfx('boss'); }
    spawnTick(dt);
    for (var i = 0; i < warns.length; i++) {
      var w = warns[i]; if (!w.active) continue;
      w.t -= dt; if (w.t <= 0) { w.active = false; spawnEnemy(w.kind, w.x, w.y, w.elite, w.tag); }
    }
    if (S.bossDown && S.wave >= S.ch.waves) { beginEnd(true); return; }
    if (S.waveT >= S.waveLen) endWave();
  }
  function endWave() {
    var i;
    for (i = 0; i < enemies.length; i++) if (enemies[i].active) killEnemy(enemies[i], false);
    for (i = 0; i < bullets.length; i++) bullets[i].active = false;
    for (i = 0; i < warns.length; i++) warns[i].active = false;
    for (i = 0; i < pickups.length; i++) { var p = pickups[i]; if (p.active) { p.active = false; if (p.gem) S.gems += p.v; else if (p.gold) S.bag.gold += p.v; else S.bag.cash += p.v; } }
    if (S.wave >= S.ch.waves) { beginEnd(true); return; }
    var hv = S.st.harvesting;
    if (hv > 0) { var g = Math.round(hv * (1 + 0.08 * S.wave)); S.cash += g; S.cashEarned += g; gainXp(g); }
    hero.hp = min(hero.maxHp, hero.hp + hero.maxHp * C.WAVE_END_HEAL);
    S.phase = 'between'; S.resolved = S.level - S.pending;
    nextBetween();
  }
  function nextBetween() {
    if (S.pending > 0) { S.cardRerolls = 0; S.cards = genCards(); showCards(); }
    else { if (!S.shopEntered) { S.shopRerolls = 0; genOffers(true); } S.shopEntered = true; showShop(); }
  }
  function mkResult(win) {
    var stars = 0;
    if (win) { stars = 1; for (var i = 1; i < C.STAR_HP.length; i++) if (S.minHp >= C.STAR_HP[i]) stars++; }
    return { win: win, wave: S.wave, kills: S.kills, cash: 0, gold: 0, gems: 0, bossDown: !!S.bossDown, chapter: S.ch.id, chapterName: S.ch.name, stars: stars, weaponTier: S.weapon ? S.weapon.tier + 1 : 1 };
  }
  function beginEnd(win) {
    if (S.phase === 'ending' || S.phase === 'won') return;
    S.phase = win ? 'won' : 'ending'; S.endT = win ? 1.6 : 1.4;
    var i; for (i = 0; i < warns.length; i++) warns[i].active = false;
    for (i = 0; i < bullets.length; i++) bullets[i].active = false;
    if (win) { for (i = 0; i < enemies.length; i++) if (enemies[i].active) killEnemy(enemies[i], false); }
    S.result = mkResult(!!win);
  }
  function finishRun() {
    var r = S.result || mkResult(false);
    for (var i = 0; i < pickups.length; i++) if (pickups[i].active) { pickups[i].active = false; collect(pickups[i]); }
    r.cash = S.cashEarned + (r.win ? C.BOSS_WIN_CASH : 0); r.gold = S.gold; r.gems = S.gems; r.wave = S.wave; r.kills = S.kills;
    var cb = opts && opts.onEnd; pub.lastResult = r; stop();
    if (cb) { try { cb(r); } catch (e) { console.error(e); } }
  }

  // ---------------- cards ----------------
  function rollTier(minTier) {
    var wts = C.TIER_WEIGHTS.slice(), lk = 1 + max(-0.5, S.st.luck / 50);
    wts[1] *= lk; wts[2] *= lk * lk; wts[3] *= lk * lk * lk;
    var tot = wts[0] + wts[1] + wts[2] + wts[3], r = rnd() * tot, t = 0;
    for (; t < 3; t++) { r -= wts[t]; if (r <= 0) break; }
    return max(t, minTier || 0);
  }
  function genCards() {
    var ids = C.STAT_IDS.slice(), out = [], lvl = S.resolved + 1;
    for (var i = ids.length - 1; i > 0; i--) { var j = rnd() * (i + 1) | 0, t = ids[i]; ids[i] = ids[j]; ids[j] = t; }
    var guar = lvl % C.GUARANTEE_EVERY === 0 ? min(3, Math.floor(lvl / C.GUARANTEE_EVERY)) : 0;
    for (i = 0; i < C.CARD_CHOICES; i++) {
      var id = ids[i], def = C.STATS[id], tier = rollTier(i === 0 ? guar : 0), v = def.card * C.TIER_MULT[tier];
      v = id === 'pierce' ? max(1, Math.round(v)) : Math.round(v * 10) / 10;
      out.push({ statId: id, tier: tier, value: v });
    }
    for (i = out.length - 1; i > 0; i--) { var j2 = rnd() * (i + 1) | 0, t2 = out[i]; out[i] = out[j2]; out[j2] = t2; }
    return out;
  }
  function fmt(v) { return (v > 0 ? '+' : '') + (Math.abs(v - Math.round(v)) < 1e-6 ? Math.round(v) : v.toFixed(1)); }
  function showCards() {
    var lvl = S.resolved + 1, rc = C.cardRerollCost(lvl, S.cardRerolls);
    var view = {
      level: lvl, pendingLeft: S.pending - 1, cash: S.cash, rerollCost: rc, canReroll: S.cash >= rc,
      choices: S.cards.map(function (c) { var d = C.STATS[c.statId]; return { statId: c.statId, name: d.name, tier: c.tier, tierName: C.TIER_NAMES[c.tier], valueText: fmt(c.value) + d.unit, desc: d.desc, emblem: d.emblem, color: d.color }; })
    };
    G.arenaUI.showCards(view, {
      pick: function (i) {
        var c = S.cards[i]; if (!c) return;
        S.cardBonus[c.statId] = (S.cardBonus[c.statId] || 0) + c.value; recompute();
        S.pending--; S.resolved++; S.cards = null; sfx('buy');
        if (S.pending > 0) { S.cardRerolls = 0; S.cards = genCards(); showCards(); } else { G.arenaUI.hide(); nextBetween(); }
      },
      reroll: function () {
        var cost = C.cardRerollCost(S.resolved + 1, S.cardRerolls); if (S.cash < cost) return;
        S.cash -= cost; S.cardRerolls++; S.cards = genCards(); showCards();
      }
    });
  }

  // ---------------- shop ----------------
  function genOffers(fresh) {
    var wave = S.wave, out = [];
    for (var i = 0; i < C.SHOP_OFFERS; i++) {
      var old = S.offers[i];
      if (old && old.locked && !old.sold) { out.push(old); continue; }
      out.push(rollOffer(wave, out));
    }
    S.offers = out;
  }
  function rollOffer(wave, taken) {
    var ids = Object.keys(C.ITEMS), it = ids[rnd() * ids.length | 0];
    for (var k = 0; k < 8 && taken && taken.some(function (o) { return o && o.id === it; }); k++) it = ids[rnd() * ids.length | 0];
    return { kind: 'item', id: it, tier: 0, price: C.shopPrice(C.ITEMS[it].price, wave), locked: false, sold: false };
  }
  function iconFile(key) { var M = window.G_MANIFEST; return (M && M.icons && M.icons[key] && M.icons[key].file) || null; }
  function weaponView() {
    var w = S.weapon, ws = weaponStats(w), tier = w.tier, nx = null, price = 0, why = null, canBuy = false;
    if (tier < C.WEAPON_TIERS.length - 1) {
      var up = { base: w.base, tier: tier + 1 }, us = weaponStats(up);
      nx = { id: us.id, name: C.WEAPONS[us.id].name, tier: tier + 1, tierName: C.TIER_NAMES[tier + 1], stats: statLine(us) };
      price = C.upgradePrice(tier, S.wave);
      var unlock = C.UPGRADE_UNLOCK_WAVE[tier];
      if (S.wave < unlock) why = 'Wave ' + unlock; else if (S.cash < price) why = 'Need $' + price; else canBuy = true;
    }
    return { id: ws.id, base: w.base, name: C.WEAPONS[ws.id].name, tier: tier, tierName: C.TIER_NAMES[tier], color: C.TIER_COLORS[tier], stats: statLine(ws), next: nx, price: price, canBuy: canBuy, why: why, maxed: !nx };
  }
  function statLine(ws) {
    var d = ws.def, dm = Math.round(ws.dmg * 10) / 10, rate = Math.round(1 / ws.cd * 10) / 10;
    return { dmg: dm, dps: Math.round(ws.dmg * ws.pellets / ws.cd), rate: rate, range: Math.round(ws.range), proj: ws.pellets, pierce: ws.pierce, beam: !!d.beam, splash: !!d.splash };
  }
  function showShop() {
    var view = shopView();
    G.arenaUI.showShop(view, shopActions);
  }
  function shopView() {
    return {
      wave: S.wave, cash: S.cash, rerollCost: C.shopRerollCost(S.wave, S.shopRerolls), lastWave: false,
      weapon: weaponView(),
      offers: S.offers.map(function (o) {
        var canBuy = !o.sold && S.cash >= o.price, why = null, it = C.ITEMS[o.id];
        if (!o.sold && S.cash < o.price) why = 'Need $' + o.price;
        return { kind: o.kind, id: o.id, name: it.name, desc: it.desc, price: o.price, locked: o.locked, sold: o.sold, canBuy: canBuy, why: why, tier: 0, tierName: C.TIER_NAMES[0], icon: it.icon, iconFile: iconFile(it.icon), color: '#4caf50', emblem: G.arenaUI.helpers.initials(it.name) };
      }),
      items: Object.keys(S.items).map(function (id) { var it = C.ITEMS[id]; return { id: id, name: it.name, icon: it.icon, iconFile: iconFile(it.icon), count: S.items[id], sellPrice: Math.floor(it.price * C.RECYCLE_REFUND) }; })
    };
  }
  var shopActions = {
    buy: function (i) {
      var o = S.offers[i]; if (!o || o.sold || S.cash < o.price) return;
      S.items[o.id] = (S.items[o.id] || 0) + 1; recompute();
      S.cash -= o.price; o.sold = true; o.locked = false; sfx('buy'); showShop();
    },
    upgrade: function () {
      var w = S.weapon, wv = weaponView(); if (!wv.canBuy) return;
      S.cash -= wv.price; w.tier++; w.mag = C.WEAPONS[effId(w)].mag; hero.weaponId = effId(w); syncWeaponsPub(); sfx('levelup');
      G.arenaUI.toast('Weapon upgraded: ' + C.WEAPONS[effId(w)].name + ' ' + C.TIER_NAMES[w.tier]); showShop();
    },
    lock: function (i) { var o = S.offers[i]; if (o && !o.sold) { o.locked = !o.locked; showShop(); } },
    reroll: function () {
      var c = C.shopRerollCost(S.wave, S.shopRerolls); if (S.cash < c) return;
      S.cash -= c; S.shopRerolls++;
      var keep = S.offers.filter(function (o) { return o.locked && !o.sold; });
      for (var i = 0; i < S.offers.length; i++) if (!(S.offers[i].locked && !S.offers[i].sold)) S.offers[i] = rollOffer(S.wave, S.offers.concat());
      showShop();
    },
    recycleItem: function (id) {
      if (!S.items[id]) return; S.cash += Math.floor(C.ITEMS[id].price * C.RECYCLE_REFUND);
      if (--S.items[id] <= 0) delete S.items[id]; recompute(); showShop();
    },
    next: function () {
      G.arenaUI.hide(); S.shopEntered = false;
      for (var i = 0; i < S.offers.length; i++) if (S.offers[i].sold) S.offers[i] = rollOffer(S.wave + 1, S.offers);   // sold slots refill, locked remain
      startWave(S.wave + 1);
    }
  };

  // ---------------- main update ----------------
  function update(dt) {
    S.tickT += dt;
    if (S.shake > 0) S.shake = max(0, S.shake - 40 * dt);
    if (S.flash > 0) S.flash = max(0, S.flash - dt);
    if (S.hintT > 0) S.hintT -= dt;
    for (var di = dnums.length - 1; di >= 0; di--) { var dn = dnums[di]; dn.t -= dt; dn.y -= 38 * dt; if (dn.t <= 0) { dnums[di] = dnums[dnums.length - 1]; dnums.pop(); } }
    if (G.fx) G.fx.update(dt);
    if (S.phase === 'fight') {
      updateHero(dt); waveUpdate(dt);
      if (S.phase === 'fight' || S.phase === 'won' || S.phase === 'ending') {
        updateEnemies(dt); buildGrid(); separate(); updateBullets(dt); updatePickups(dt);
      }
    } else if (S.phase === 'ending' || S.phase === 'won') {
      S.endT -= dt; updateHero(dt); updatePickups(dt); updateBullets(dt);
      if (S.endT <= 0) finishRun();
    }
    camUpdate(dt);
  }
  function syncPub() {
    pub.hp = hero.hp; pub.maxHp = hero.maxHp; pub.xp = S.xp; pub.xpNeed = C.xpNeed(S.level); pub.level = S.level; pub.wave = S.wave;
    pub.timeLeft = max(0, S.waveLen - S.waveT); pub.cash = S.cash; pub.gold = S.gold; pub.gems = S.gems; pub.kills = S.kills; pub.phase = S.phase;
    pub.bossHp = S.boss ? S.boss.hp : 0; pub.bossMaxHp = S.boss ? S.boss.maxHp : 0;
    var ne = 0, nb = 0, i; for (i = 0; i < enemies.length; i++) if (enemies[i].active) ne++; for (i = 0; i < bullets.length; i++) if (bullets[i].active) nb++;
    pub.enemies = ne; pub.bullets = nb;
  }

  // ---------------- rendering ----------------
  function poly(c, x, y, r, sides, rot, fill, lw) {
    c.beginPath();
    for (var i = 0; i < sides; i++) { var a = rot + i * TAU / sides; if (i) c.lineTo(x + cos(a) * r, y + sin(a) * r); else c.moveTo(x + cos(a) * r, y + sin(a) * r); }
    c.closePath(); c.lineWidth = lw; c.strokeStyle = '#000'; c.stroke(); c.fillStyle = fill; c.fill();
  }
  function usePuppet() { return !!(G.puppet && G.puppet.ready && G.puppet.ready()); }
  function drawEnemy(e, pup) {
    var def = e.def, r = e.r;
    if (pup) {
      actor.kind = e.kind; actor.x = e.x; actor.y = e.y + r; actor.facing = e.facing; actor.moving = e.moving; actor.speed = e.speed; actor.state = e.state; actor.t = e.t; actor.animT = e.animT; actor.weaponId = e.weaponId; actor.scale = e.scale;
      G.puppet.draw(ctx, actor); return;
    }
    var fill = e.hurtT > 0 ? '#ffffff' : def.color;
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(e.x, e.y + r * 0.8, r * 0.9, r * 0.4, 0, 0, TAU); ctx.fill();
    poly(ctx, e.x, e.y, r, def.sides, (def.rot || 0) + (def.sides === 3 || def.sides > 4 ? e.facing : 0), fill, e.boss ? 5 : 4);
    if (e.elite) { ctx.strokeStyle = '#e8a317'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x, e.y, r + 3, 0, TAU); ctx.stroke(); }
    ctx.strokeStyle = '#f2efe9'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + cos(e.facing) * r * 0.9, e.y + sin(e.facing) * r * 0.9); ctx.stroke();
    if (e.boss && e.ps === 1) { ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(e.x, e.y, r + 8 + (e.patT * 20 % 6), 0, TAU); ctx.stroke(); if (e.pat === 'charge') { ctx.setLineDash([8, 8]); ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + cos(e.facing) * 360, e.y + sin(e.facing) * 360); ctx.stroke(); ctx.setLineDash([]); } }
    if (!e.boss && e.maxHp > 60 && e.hp < e.maxHp) { var bw = r * 2; ctx.fillStyle = '#000'; ctx.fillRect(e.x - bw / 2 - 1, e.y - r - 9, bw + 2, 6); ctx.fillStyle = '#b3202a'; ctx.fillRect(e.x - bw / 2, e.y - r - 8, bw * e.hp / e.maxHp, 4); }
  }
  function drawHero(pup) {
    var h = hero;
    if (pup) {
      actor.kind = 'hero'; actor.x = h.x; actor.y = h.y + h.r; actor.facing = h.facing; actor.moving = h.moving; actor.speed = h.speed; actor.state = h.state; actor.t = h.t; actor.animT = h.animT; actor.weaponId = h.weaponId; actor.scale = 1;
      G.puppet.draw(ctx, actor); return;
    }
    if (h.inv > 0 && ((S.tickT * 20 | 0) & 1) && !h.dead) ctx.globalAlpha = 0.5;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(h.x, h.y + h.r * 0.8, h.r, h.r * 0.45, 0, 0, TAU); ctx.fill();
    var w = S.weapon, L = C.WEAPONS[effId(w)].muzzle[0] * 0.2 + 4;
    ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(w.aim); ctx.fillStyle = C.TIER_COLORS[w.tier]; ctx.strokeStyle = '#000'; ctx.lineWidth = 2.5; ctx.strokeRect(6, -2.5, L, 5); ctx.fillRect(6, -2.5, L, 5); ctx.restore();
    ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, TAU); ctx.lineWidth = 5; ctx.strokeStyle = '#000'; ctx.stroke(); ctx.fillStyle = h.hurtT > 0 ? '#ff9c9c' : '#f2efe9'; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#e8a317'; ctx.stroke();
    ctx.fillStyle = '#14161a'; ctx.beginPath(); ctx.arc(h.x + cos(h.facing) * 5, h.y + sin(h.facing) * 5, 3, 0, TAU); ctx.fill();
    // player marker
    ctx.fillStyle = '#e8a317'; ctx.beginPath(); ctx.moveTo(h.x, h.y - h.r - 14); ctx.lineTo(h.x - 5, h.y - h.r - 22); ctx.lineTo(h.x + 5, h.y - h.r - 22); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  }
  // ---------------- world: camera, props, decals ----------------
  function snapCam() { cam.x = max(VW / 2, min(WW - VW / 2, hero.x)); cam.y = max(VH / 2, min(WH - VH / 2, hero.y)); cam.l = cam.x - VW / 2; cam.t = cam.y - VH / 2; }
  function camUpdate(dt) {
    var k = 1 - Math.exp(-C.CAM_LERP * dt);
    cam.x += (max(VW / 2, min(WW - VW / 2, hero.x)) - cam.x) * k; cam.y += (max(VH / 2, min(WH - VH / 2, hero.y)) - cam.y) * k;
    cam.l = cam.x - VW / 2; cam.t = cam.y - VH / 2;
  }
  function vis(x, y, pad) { return x > cam.l - pad && x < cam.l + VW + pad && y > cam.t - pad && y < cam.t + VH + pad; }
  function imgBase() { return (G.arena && G.arena.basePath != null) ? G.arena.basePath : (G.puppet && G.puppet.basePath) || ''; }
  function loadImg(file) { var im = new Image(); im.src = imgBase() + file; return im; }
  function loadAssets() {
    if (propImgs) return;
    var M = window.G_MANIFEST || {}; propImgs = {}; decalImgs = [];
    if (M.props) for (var k in M.props) propImgs[k] = loadImg(M.props[k].file);
    if (M.bg && M.bg.arena_floor) { floorImg = loadImg(M.bg.arena_floor.file); }
    else floorImg = null;
    FXI = {};
    ['muzzle_flash', 'bullet', 'bullet_trail', 'plasma', 'laser', 'hit_spark', 'shell_casing', 'explosion'].forEach(function (n) {
      if (M.fx && M.fx[n]) FXI[n] = M.fx[n].frames.map(function (fr) { return { im: loadImg(fr.file), d: fr }; });
    });
    // fx2 sprites (G_MANIFEST.fx2): groups -> FXI['x_<name>'] frame lists, singles -> one-frame lists
    var F2 = M.fx2; if (F2) for (var k2 in F2) {
      var e2 = F2[k2]; if (/_\d$/.test(k2) && F2[k2.replace(/_\d$/, '')]) continue;
      FXI['x_' + k2] = (e2.frames || [e2]).map(function (fr) { return { im: loadImg(fr.file), d: fr }; });
    }
    icoImgs = {};
    ['cash_stack', 'money_bag', 'gold_bars', 'ruby_gem'].forEach(function (n) { if (M.icons && M.icons[n]) icoImgs[n] = { im: loadImg(M.icons[n].file), d: M.icons[n] }; });
    if (M.fx && M.fx.blood_small) for (var i = 0; i < M.fx.blood_small.frames.length; i++) decalImgs.push(loadImg(M.fx.blood_small.frames[i].file));
  }
  var decalImgs = [], icoImgs = {}, billCv = null;
  var SOLID_POOL = ['container_blue', 'container_red', 'container_green', 'container_yellow', 'crate_large', 'crate_large', 'crate_medium', 'crate_medium', 'crate_small', 'pallet_boxes', 'pallet_stack', 'pallet_wrapped',
    'barrel_blue', 'barrel_yellow', 'barrel_green', 'barrel_brown', 'barrel_brown', 'tires', 'car_suv', 'car_hatch', 'barrier_hazard', 'barrier_plain', 'barrier_redwhite', 'dumpster', 'electrical_box', 'burning_barrel', 'burning_barrel', 'lamp_post', 'cctv_pole'];
  var DECO_POOL = ['cone', 'cone', 'jerrycan_red', 'jerrycan_green', 'pallet', 'pallet_tarp'];
  var solids = [], streetCv = null, streetOn = false;
  function addProp(key, x, y, solid) {
    var d = window.G_MANIFEST && G_MANIFEST.props && G_MANIFEST.props[key]; if (!d) return null;
    var sc = C.PROP_SCALE, p = { k: key, d: d, x: x, y: y, sc: sc, img: propImgs[key], hw: d.footprint[0] * sc / 2, hh: d.footprint[1] * sc, solid: solid, glow: key === 'burning_barrel' };
    props.push(p); if (solid) solids.push(p); return p;
  }
  function genProps() {
    loadAssets(); props = []; solids = []; streetCv = null; streetOn = false;
    var ST = G.street;
    if (ST && ST.ready && ST.build) {   // street module (optional): cached floor+walls canvas, static solids, y-sorted decor
      try {
        if (ST.ready()) {
          var sd = (rnd() * 4294967295) >>> 0, chn = ST.chapters ? ST.chapters[(S.ch ? S.ch.id : 1) - 1] || ST.chapters[0] : 'docklands', cvs = ST.build(chn, WW, WH, sd);
          if (cvs && !cvs.length) {
            streetCv = cvs; streetOn = true;
            var sl = ST.solids ? ST.solids(chn, sd) : null, i0, q0;
            if (sl) for (i0 = 0; i0 < sl.length; i0++) { q0 = sl[i0]; solids.push({ k: 'street_solid', x: q0.x + q0.w / 2, y: q0.y + q0.h, hw: q0.w / 2, hh: q0.h, solid: true, st: 1 }); }
            var sp = ST.props ? ST.props(chn, sd) : null;
            if (sp) for (i0 = 0; i0 < sp.length; i0++) {
              q0 = sp[i0]; var fp = q0.footprint ? (q0.footprint.length ? { w: q0.footprint[0], h: q0.footprint[1] } : q0.footprint) : { w: q0.w * 0.8, h: q0.h * 0.25 };
              var po = { k: 'street_prop', x: q0.x, y: q0.y, img: q0.img, dw: q0.w, dh: q0.h, dx: q0.dx || 0, dy: q0.dy || 0, flip: !!q0.flip, hw: fp.w / 2, hh: fp.h, solid: !!q0.solid, st: 1, glow: false, sc: 1, d: null };
              props.push(po); if (po.solid) solids.push(po);
            }
            return;
          }
        }
      } catch (e) { streetCv = null; streetOn = false; props = []; solids = []; }
    }
    var M = window.G_MANIFEST; if (!M || !M.props) return;
    var s0 = (rnd() * 4294967296) >>> 0, rs = function () { s0 = (s0 + 0x6D2B79F5) | 0; var t = Math.imul(s0 ^ (s0 >>> 15), 1 | s0); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    var sx = WW / 2, sy = WH / 2 + 60, tries = 0, placed = 0, edge = 150, key;
    while (placed < C.PROP_COUNT && tries++ < 600) {
      key = rs() < 0.85 ? SOLID_POOL[rs() * SOLID_POOL.length | 0] : DECO_POOL[rs() * DECO_POOL.length | 0];
      var d = M.props[key], sc = C.PROP_SCALE, hw = d.footprint[0] * sc / 2, hh = d.footprint[1] * sc;
      var x = edge + rs() * (WW - 2 * edge), y = edge + hh + rs() * (WH - 2 * edge - hh), good = true, i;
      var dx = max(0, Math.abs(x - sx) - hw), dy = max(0, Math.abs(y - hh / 2 - sy) - hh / 2);
      if (dx * dx + dy * dy < C.PROP_CLEAR * C.PROP_CLEAR) continue;
      for (i = 0; i < props.length; i++) { var q = props[i]; if (Math.abs(x - q.x) < hw + q.hw + 34 && Math.abs((y - hh / 2) - (q.y - q.hh / 2)) < (hh + q.hh) / 2 + 34) { good = false; break; } }
      if (!good) continue;
      addProp(key, x, y, DECO_POOL.indexOf(key) < 0 && key !== 'pallet'); placed++;
    }
    // border fences (decoration, along top and bottom edges)
    var fd = M.props.fence_plain; if (fd) { var fw = fd.w * C.PROP_SCALE - 2, n = Math.ceil(WW / fw), keys = ['fence_plain', 'fence_tarp', 'fence_plain', 'fence_razor', 'fence_plain', 'fence_gate'];
      for (var f = 0; f < n; f++) { var fk = keys[(rs() * keys.length) | 0], fx = f * fw + fw / 2; addProp(fk, fx, 20, false); addProp(fk, fx, WH + 34, false); } }
  }
  // circle (feet) vs footprint rect. vx/vy = this tick's intended move, used to slide enemies along obstacles.
  function collideProps(o, vx, vy) {
    var fr = o.r * 0.8, cx = o.x, cy = o.y + o.r;
    for (var i = 0; i < solids.length; i++) {
      var p = solids[i], l = p.x - p.hw, r = p.x + p.hw, t = p.y - p.hh, b = p.y;
      if (cx + fr < l || cx - fr > r || cy + fr < t || cy - fr > b) continue;
      var nx = cx < l ? l : cx > r ? r : cx, ny = cy < t ? t : cy > b ? b : cy, dx = cx - nx, dy = cy - ny, d2 = dx * dx + dy * dy, px = 0, py = 0;
      if (d2 > 0.0001) { if (d2 >= fr * fr) continue; var d = sqrt(d2), k = (fr - d) / d; px = dx * k; py = dy * k; }
      else { var ex = min(cx - l, r - cx), ey = min(cy - t, b - cy); if (ex < ey) px = (cx - l < r - cx ? -(ex + fr) : ex + fr); else py = (cy - t < b - cy ? -(ey + fr) : ey + fr); }
      o.x += px; o.y += py; cx += px; cy += py;
      if (vx || vy) { var sl = sqrt(vx * vx + vy * vy) * 0.9; if (py !== 0 && px === 0) o.x += (o.x >= p.x ? 1 : -1) * sl; else if (px !== 0 && py === 0) o.y += (o.y + o.r >= p.y - p.hh / 2 ? 1 : -1) * sl; }
    }
  }
  var decalPool = null;
  function addDecal(x, y, size) {
    if (!decalPool) { decalPool = []; for (var i = 0; i < C.DECAL_CAP; i++) decalPool.push({ x: 0, y: 0, a: 0, k: 0, rot: 0, s: 1 }); decals = decalPool; }
    var d = decals[decalN++ % decals.length]; d.x = x + rr(-5, 5); d.y = y + rr(-3, 3); d.a = 0.5 + rnd() * 0.15; d.k = rnd() * 4 | 0; d.rot = rnd() * TAU; d.s = (0.38 + size * 0.2) * (0.8 + rnd() * 0.5);
  }
  function makeVig() {
    vigCanvas = document.createElement('canvas'); vigCanvas.width = W; vigCanvas.height = H;
    var c = vigCanvas.getContext('2d'), g = c.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.68);
    g.addColorStop(0, 'rgba(5,6,10,0)'); g.addColorStop(1, 'rgba(5,6,10,.6)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  }
  function drawFloor(c) {
    if (streetOn && streetCv) {   // cached street canvas: blit only the visible camera rect
      var k = streetCv.width / WW, sx0 = max(0, cam.l), sy0 = max(0, cam.t), sx1 = min(WW, cam.l + VW), sy1 = min(WH, cam.t + VH);
      if (sx1 > sx0 && sy1 > sy0) c.drawImage(streetCv, sx0 * k, sy0 * k, (sx1 - sx0) * k, (sy1 - sy0) * k, sx0, sy0, sx1 - sx0, sy1 - sy0);
      return;
    }
    var TW = 540, TH = 960, im = imgOk(floorImg) ? floorImg : null;
    c.save(); c.beginPath(); c.rect(0, 0, WW, WH); c.clip();
    if (!im) { c.fillStyle = '#16181d'; c.fillRect(cam.l, cam.t, VW, VH); c.strokeStyle = 'rgba(255,255,255,.05)'; c.lineWidth = 1; c.beginPath(); for (var gx = Math.floor(cam.l / 60) * 60; gx < cam.l + VW; gx += 60) { c.moveTo(gx, cam.t); c.lineTo(gx, cam.t + VH); } for (var gy = Math.floor(cam.t / 60) * 60; gy < cam.t + VH; gy += 60) { c.moveTo(cam.l, gy); c.lineTo(cam.l + VW, gy); } c.stroke(); }
    else {
      var x0 = Math.floor(max(0, cam.l) / TW), x1 = Math.floor(min(WW - 1, cam.l + VW) / TW), y0 = Math.floor(max(0, cam.t) / TH), y1 = Math.floor(min(WH - 1, cam.t + VH) / TH);
      for (var iy = y0; iy <= y1; iy++) for (var ix = x0; ix <= x1; ix++) {   // mirrored tiling: edges always match, no seams
        var fx = ix & 1, fy = iy & 1;
        c.save(); c.translate(ix * TW + (fx ? TW : 0), iy * TH + (fy ? TH : 0)); c.scale(fx ? -1 : 1, fy ? -1 : 1); c.drawImage(im, 0, 0, TW, TH); c.restore();
      }
    }
    var bg = S.ch && S.ch.bg;
    if (bg && bg.alpha > 0) { c.globalCompositeOperation = 'multiply'; c.globalAlpha = bg.alpha * 2.2 > 1 ? 1 : bg.alpha * 2.2; c.fillStyle = bg.tint; c.fillRect(cam.l, cam.t, VW, VH); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; }
    c.restore();
  }
  function drawBorder(c) {
    var B = C.BORDER;
    c.fillStyle = '#07080a';
    c.fillRect(-B - 400, -B - 400, WW + 2 * B + 800, 400); c.fillRect(-B - 400, WH + B, WW + 2 * B + 800, 400); c.fillRect(-B - 400, -B, 400, WH + 2 * B); c.fillRect(WW + B, -B, 400, WH + 2 * B);
    c.strokeStyle = '#1a1c21'; c.lineWidth = B; c.strokeRect(-B / 2, -B / 2, WW + B, WH + B);
    c.strokeStyle = 'rgba(232,163,23,.35)'; c.lineWidth = 3; c.setLineDash([26, 22]); c.strokeRect(-B / 2, -B / 2, WW + B, WH + B); c.setLineDash([]);
    c.strokeStyle = 'rgba(232,163,23,.6)'; c.lineWidth = 3; c.strokeRect(0, 0, WW, WH);
    // inner shadow along the wall
    var g, sh = 40;
    if (cam.t < sh) { g = c.createLinearGradient(0, 0, 0, sh); g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(cam.l, 0, VW, sh); }
    if (cam.t + VH > WH - sh) { g = c.createLinearGradient(0, WH, 0, WH - sh); g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(cam.l, WH - sh, VW, sh); }
    if (cam.l < sh) { g = c.createLinearGradient(0, 0, sh, 0); g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, cam.t, sh, VH); }
    if (cam.l + VW > WW - sh) { g = c.createLinearGradient(WW, 0, WW - sh, 0); g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(WW - sh, cam.t, sh, VH); }
  }
  function drawProp(c, p) {
    if (p.st) {
      var sim = p.img;   // ground shadow is already baked into the street canvas
      if (sim && (sim.getContext || imgOk(sim))) {
        if (p.flip) { c.save(); c.translate(p.x, 0); c.scale(-1, 1); c.drawImage(sim, p.dx, p.y + p.dy, p.dw, p.dh); c.restore(); }
        else c.drawImage(sim, p.x + p.dx, p.y + p.dy, p.dw, p.dh);
      }
      return;
    }
    var d = p.d, im = p.img, sc = p.sc;
    if (p.glow) { c.globalAlpha = 0.16 + 0.05 * sin(S.tickT * 9 + p.x); c.fillStyle = '#ff9a2e'; c.beginPath(); c.ellipse(p.x, p.y - 4, 62, 30, 0, 0, TAU); c.fill(); c.globalAlpha = 1; }
    c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(p.x, p.y - 2, p.hw * 0.95, max(5, p.hh * 0.38), 0, 0, TAU); c.fill();
    if (imgOk(im)) c.drawImage(im, p.x - d.anchor[0] * sc, p.y - d.anchor[1] * sc, d.w * sc, d.h * sc);
    else { c.fillStyle = '#555'; c.fillRect(p.x - p.hw, p.y - p.hh * 1.6, p.hw * 2, p.hh * 1.6); }
  }
  // ---- banknote sprite (pre-rendered once) + pickup drawing
  function makeBill() {
    var w = 40, h = 20, cv2 = document.createElement('canvas'); cv2.width = w + 4; cv2.height = h + 4; var g = cv2.getContext('2d');
    g.translate(2, 2); g.fillStyle = '#0d1f12'; g.fillRect(-1, -1, w + 2, h + 2);
    var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#8fd28c'); gr.addColorStop(1, '#4e9b57'); g.fillStyle = gr; g.fillRect(1, 1, w - 2, h - 2);
    g.strokeStyle = '#2f6e3a'; g.lineWidth = 1.5; g.strokeRect(3.5, 3.5, w - 7, h - 7);
    g.fillStyle = '#c9f0c3'; g.beginPath(); g.ellipse(w / 2, h / 2, 7, 6, 0, 0, TAU); g.fill(); g.strokeStyle = '#2f6e3a'; g.lineWidth = 1; g.stroke();
    g.fillStyle = '#2f6e3a'; g.font = '800 10px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', w / 2, h / 2 + 0.5);
    g.fillStyle = '#2f6e3a'; g.fillRect(6, 6, 5, 2); g.fillRect(w - 11, h - 8, 5, 2); g.fillRect(6, h - 8, 5, 2); g.fillRect(w - 11, 6, 5, 2);
    billCv = cv2;
  }
  function pickupTier(v) { var T = C.PICKUP_TIERS, k = 0; for (var i = 0; i < T.length; i++) if (v >= T[i].min) k = i; return T[k].kind; }
  function drawBillAt(c, x, y, rot, sc) { c.save(); c.translate(x, y); c.rotate(rot); c.drawImage(billCv, -22 * sc, -12 * sc, 44 * sc, 24 * sc); c.restore(); }
  function drawIcon(c, name, x, y, wpx) {
    var o = icoImgs[name]; if (!o || !imgOk(o.im)) return false;
    var h = wpx * o.d.h / o.d.w; c.drawImage(o.im, x - wpx / 2, y - h / 2, wpx, h); return true;
  }
  // pickup sprites (fx2): target on-screen width in px per sprite; tiers by value, overridden by p.big / p.gem
  var PK_W = { note_single: 25, note_fan: 28, note_bundle: 31, note_stack: 34, cash_bag: 30, cash_case: 42, gold_bar: 24, gold_bars3: 29, gold_pile: 35, gem_small: 20, gem_large: 29, coin: 18 };
  function pickupSprite(p) {
    if (p.gem) return p.gem === 2 ? 'gem_large' : 'gem_small';
    if (p.gold) return p.v >= 4 ? 'gold_pile' : p.v >= 2 ? 'gold_bars3' : 'gold_bar';
    if (p.big) return p.big === 2 ? 'cash_case' : 'cash_bag';
    return pickupTier(p.v);
  }
  function drawPickup(c, p) {
    var bob = p.mag ? 0 : sin(S.tickT * 4 + p.rot * 3) * 1.4, y = p.y + bob - 2, x = p.x, nm = pickupSprite(p), f = fxFrame('x_' + nm, 0);
    if (f) {
      var w = (PK_W[nm] || 26) * 1.2, sc = w / f.d.w, big = nm === 'cash_case' || nm === 'cash_bag', hh = f.d.h * sc;
      c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(x, p.y + 4, w * 0.4, 3.2, 0, 0, TAU); c.fill();
      var rot = (nm === 'note_single' || nm === 'note_fan' || nm === 'note_bundle') ? (p.rot % 1 - 0.5) * 0.5 : 0;
      c.save(); c.translate(x, y - hh * 0.38); if (rot) c.rotate(rot); c.drawImage(f.im, -w / 2, -hh / 2, w, hh); c.restore();
      var ph2 = (S.tickT * 0.9 + p.rot) % 1.6;
      if (ph2 < 0.3 && !big || p.gem && ph2 < 0.4) { var a2 = sin(ph2 / 0.3 * Math.PI); if (a2 > 0) { var sx2 = x + w * 0.22 * cos(p.rot * 5), sy2 = y - hh * 0.55 + 3 * sin(p.rot * 7), r2 = 3.2 * a2; c.globalAlpha = a2; c.fillStyle = '#fff8d0'; c.beginPath(); c.moveTo(sx2 - r2, sy2); c.lineTo(sx2, sy2 - r2 * 1.4); c.lineTo(sx2 + r2, sy2); c.lineTo(sx2, sy2 + r2 * 1.4); c.closePath(); c.fill(); c.globalAlpha = 1; } }
      return;
    }
    c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(x, p.y + 5, 8, 3, 0, 0, TAU); c.fill();
    if (p.gem) { c.fillStyle = '#d93a55'; c.beginPath(); c.moveTo(x, y - 7); c.lineTo(x + 6, y); c.lineTo(x, y + 6); c.lineTo(x - 6, y); c.closePath(); c.fill(); }
    else if (p.gold) { if (!drawIcon(c, 'gold_bars', x, y - 2, 24)) { c.fillStyle = '#ffd23f'; c.fillRect(x - 8, y - 4, 16, 8); } }
    else {
      var kind = nm;
      if (!billCv) makeBill();
      if (kind === 'note_single') drawBillAt(c, x, y, p.rot * 0.35 - 0.2, 0.52);
      else if (kind === 'note_fan') { var n = p.v >= 5 ? 3 : 2; for (var i = 0; i < n; i++) drawBillAt(c, x + (i - (n - 1) / 2) * 3, y - i * 0.8, (i - (n - 1) / 2) * 0.42 + p.rot * 0.05, 0.5); }
      else if (kind === 'note_bundle' || kind === 'note_stack') { if (!drawIcon(c, 'cash_stack', x, y - 2, 25)) drawBillAt(c, x, y, 0, 0.6); }
      else { if (!drawIcon(c, 'money_bag', x, y - 3, 28)) drawBillAt(c, x, y, 0, 0.7); }
    }
  }
  // ---- bullets: brass tracer + trail, plasma bolt (animated), tinted enemy tracer with glow; capsule fallback
  // trail + bullet (+ glow for enemy shots) are baked once into one offscreen sprite per (kind, trail, scale) at 2x resolution -> one drawImage per bullet
    var bspr = {};
  function bulletSprite(k, tr, sc) {
    var key = k + '|' + tr + '|' + (sc * 100 | 0), o = bspr[key]; if (o) return o;
    var bf = tr === 0 ? fxFrame('x_bullet_small', 0) : fxFrame('x_bullet_long', tr - 1); if (!bf) return null;   // images not loaded yet -> capsule fallback this frame
    var O = 2, bw = bf.d.w * sc, bh = bf.d.h * sc, pad = 3, W2 = Math.ceil(bw + pad * 2), H2 = Math.ceil(bh + pad * 2), cv2 = document.createElement('canvas'); cv2.width = W2 * O; cv2.height = H2 * O;
    var g = cv2.getContext('2d'); g.scale(O, O); var hx = W2 - pad - 1, hy = H2 / 2;
    g.drawImage(bf.im, hx - bf.d.pivot[0] * sc, hy - bf.d.pivot[1] * sc, bw, bh);
    return (bspr[key] = { cv: cv2, hx: hx, hy: hy, w: W2, h: H2 });
  }
  function drawBullet(c, b) {
    var k = b.kind, a = b.ang, o, f;
    if (k === 1) { f = fxFrame('x_plasma', (b.age * 14) | 0) || fxFrame('plasma', (b.age * 14) | 0); if (f) { drawFx(c, f, b.x, b.y, a, f.d.file.indexOf('fx2') >= 0 ? 0.5 : 0.24); return; } }
    else if (k === 2 && (f = fxFrame('x_bullet_enemy', (b.age * 14) | 0))) { drawFx(c, f, b.x, b.y, a, b.sc); return; }
    else if (k === 0 && (o = bulletSprite(k, b.tr, b.sc))) {
      c.save(); c.translate(b.x, b.y); c.rotate(a); c.drawImage(o.cv, -o.hx, -o.hy, o.w, o.h); c.restore(); return;
    }
    // fallback: simple capsule
    var L = k === 1 ? 14 : 9; c.lineCap = 'round'; c.strokeStyle = '#000'; c.lineWidth = b.r * 2 + 3; c.beginPath(); c.moveTo(b.x - cos(a) * L, b.y - sin(a) * L); c.lineTo(b.x, b.y); c.stroke();
    c.strokeStyle = k === 2 ? '#ff6a2a' : k === 1 ? '#5be3ff' : '#ffd070'; c.lineWidth = b.r * 2; c.stroke(); c.lineCap = 'butt';
  }
  var dlN = 0;
  function dl(y, kind, o) { var it = drawList[dlN]; if (!it) it = drawList[dlN] = { y: 0, k: 0, o: null }; it.y = y; it.k = kind; it.o = o; dlN++; }
  function dlSort(a, b) { return a.y - b.y; }
  function bar(x, y, w, h, k, col, bg) { ctx.fillStyle = bg || '#000'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2); ctx.fillStyle = col; ctx.fillRect(x, y, w * max(0, min(1, k)), h); }
  function txt(s, x, y, size, col, al) { ctx.font = '800 ' + size + 'px system-ui,Segoe UI,Roboto,sans-serif'; ctx.textAlign = al || 'left'; ctx.fillStyle = '#000'; ctx.fillText(s, x + 1.5, y + 1.5); ctx.fillStyle = col; ctx.fillText(s, x, y); }
  function drawHud() {
    bar(14, 12, 210, 18, hero.hp / hero.maxHp, '#c0392b', '#14161a'); txt(Math.ceil(hero.hp) + '/' + hero.maxHp, 20, 27, 14, '#fff');
    bar(14, 36, 210, 9, S.xp / C.xpNeed(S.level), '#4caf50', '#14161a'); txt('LV ' + S.level, 230, 46, 13, '#9be59f');
    txt('WAVE ' + S.wave + '/' + S.ch.waves, W / 2 + 36, 24, 18, '#f2efe9', 'center'); txt(S.ch.name.toUpperCase(), W / 2 + 36, 37, 9, '#9aa0a6', 'center');
    var tl = max(0, S.waveLen - S.waveT);
    txt(S.wave >= S.ch.waves && S.boss ? 'BOSS' : Math.ceil(tl) + 's', W / 2 + 36, 62, 22, tl < 5 ? '#ff6b6b' : '#e8a317', 'center');
    ctx.fillStyle = 'rgba(31,34,39,.9)'; ctx.fillRect(W - 50, 10, 38, 38); ctx.strokeStyle = '#f2efe9'; ctx.lineWidth = 2; ctx.strokeRect(W - 50, 10, 38, 38);
    ctx.fillStyle = '#f2efe9'; ctx.fillRect(W - 40, 19, 6, 20); ctx.fillRect(W - 28, 19, 6, 20);
    txt('$' + S.cash, W - 14, 74, 18, '#6fe07a', 'right'); if (S.gold > 0) txt('G ' + S.gold, W - 14, 96, 15, '#ffd23f', 'right');
    if (S.boss) {
      bar(40, 72, W - 80, 14, S.boss.hp / S.boss.maxHp, '#b3202a', '#14161a');
      txt(S.boss.title || S.boss.def.name, W / 2, 68, 13, '#f2efe9', 'center');
    }
    if (S.boss) {
      var bx = (S.boss.x - cam.l) * ZOOM, by = (S.boss.y - cam.t) * ZOOM;
      if (bx < 0 || bx > W || by < 0 || by > H) {
        var ax = max(24, min(W - 24, bx)), ay = max(110, min(H - 40, by)), ba = atan2(by - H / 2, bx - W / 2);
        ctx.save(); ctx.translate(ax, ay); ctx.rotate(ba); ctx.fillStyle = '#ff4d4d'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-10, -11); ctx.lineTo(-10, 11); ctx.closePath(); ctx.stroke(); ctx.fill(); ctx.restore();
      }
    }
    if (S.hintT > 0 && S.wave === 1) { ctx.globalAlpha = min(1, S.hintT); txt('Touch and drag on the ' + sget('joySide', 'right') + ' side / WASD to move. Your gun auto-fires.', W / 2, H - 40, 15, '#f2efe9', 'center'); ctx.globalAlpha = 1; }
    if (S.phase === 'ending') { ctx.globalAlpha = 0.55; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; txt('YOU WENT DOWN', W / 2, H / 2, 38, '#ff6b6b', 'center'); }
    if (S.phase === 'won') txt('VICTORY!', W / 2, H / 2 - 80, 44, '#e8a317', 'center');
    if (S.toastT > 0) { S.toastT -= 1 / 60; txt('LEVEL UP!', (hero.x - cam.l) * ZOOM, (hero.y - cam.t) * ZOOM - 70 - (1.2 - S.toastT) * 20, 18, '#9be59f', 'center'); }
    if (S.phase === 'fight' || S.phase === 'won' || S.phase === 'ending') {
      var ja = 1;
      if (joy.on) { ctx.globalAlpha = 0.18 * ja; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(joy.bx, joy.by, JOY_R, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.5 * ja; ctx.strokeStyle = '#f2efe9'; ctx.lineWidth = 3; ctx.stroke();
      ctx.globalAlpha = 0.55 * ja; ctx.fillStyle = '#f2efe9'; ctx.beginPath(); ctx.arc(joy.tx, joy.ty, 26, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
    }
  }
  function draw() {
    var c = ctx; c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#07080a'; c.fillRect(0, 0, W, H);
    c.save();
    if (S.shake > 0 && setting('shake')) c.translate(rr(-S.shake, S.shake) * 0.5, rr(-S.shake, S.shake) * 0.5);
    c.scale(ZOOM, ZOOM); c.translate(-cam.l, -cam.t);
    var pup = usePuppet(), i;
    drawFloor(c); drawBorder(c);
    // blood decals
    for (i = 0; i < decals.length; i++) {
      var dc = decals[i]; if (dc.a <= 0 || !vis(dc.x, dc.y, 60)) continue;
      c.globalAlpha = dc.a; var di = decalImgs[dc.k];
      if (imgOk(di)) { c.save(); c.translate(dc.x, dc.y); c.rotate(dc.rot); c.scale(dc.s, dc.s); c.drawImage(di, -di.naturalWidth / 2, -di.naturalHeight / 2); c.restore(); }
      else { c.fillStyle = '#5a1015'; c.beginPath(); c.ellipse(dc.x, dc.y, 16 * dc.s * 2, 8 * dc.s * 2, dc.rot, 0, TAU); c.fill(); }
    }
    c.globalAlpha = 1;
    // warnings
    for (i = 0; i < warns.length; i++) {
      var w = warns[i]; if (!w.active || !vis(w.x, w.y, 30)) continue;
      var col = C.ENEMIES[w.kind].color, pr = 1 - w.t / C.SPAWN_WARN, rad = 10 + (C.ENEMIES[w.kind].r) * 0.5;
      c.globalAlpha = 0.5 + 0.5 * ((S.tickT * 8 | 0) & 1); c.strokeStyle = col; c.lineWidth = 3; c.beginPath(); c.arc(w.x, w.y, rad + 6 * (1 - pr), 0, TAU); c.stroke();
      c.fillStyle = col; c.font = '800 14px system-ui'; c.textAlign = 'center'; c.fillText('!', w.x, w.y + 5); c.globalAlpha = 1;
    }
    // pickups
    for (i = 0; i < pickups.length; i++) {
      var p = pickups[i]; if (!p.active || !vis(p.x, p.y, 16)) continue;
      drawPickup(c, p);
    }
    // y-sorted entities: props, enemies, hero
    dlN = 0;
    for (i = 0; i < props.length; i++) { var pp = props[i]; var rh = pp.st ? max(260, pp.dw / 2 + 10) : 260, rv = pp.st ? max(260, pp.dh) : 260; if (pp.x + rh > cam.l && pp.x - rh < cam.l + VW && pp.y - rv < cam.t + VH && pp.y + 30 > cam.t) dl(pp.y, 0, pp); }
    for (i = 0; i < enemies.length; i++) { var e = enemies[i]; if (e.active && vis(e.x, e.y, 90 + e.r)) dl(e.y + e.r + (e.boss ? 0.5 : 0), 1, e); }
    dl(hero.y + hero.r, 2, hero);
    drawList.length = dlN; drawList.sort(dlSort);
    for (i = 0; i < dlN; i++) { var it = drawList[i]; if (it.k === 0) drawProp(c, it.o); else if (it.k === 1) drawEnemy(it.o, pup); else drawHero(pup); }
    for (i = 0; i < bullets.length; i++) {
      var b = bullets[i]; if (!b.active || !vis(b.x, b.y, 50)) continue;
      drawBullet(c, b);
    }
    if (G.fx) G.fx.draw(c);
    if (dnums.length) { c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = '#000'; for (i = 0; i < dnums.length; i++) { var dn = dnums[i]; if (!vis(dn.x, dn.y, 20)) continue; c.globalAlpha = min(1, dn.t * 2.2); c.font = '800 ' + (dn.big ? 20 : 14) + 'px system-ui,sans-serif'; c.fillStyle = dn.big ? '#ffd23f' : '#fff'; c.strokeText(dn.v, dn.x, dn.y); c.fillText(dn.v, dn.x, dn.y); } c.globalAlpha = 1; }
    c.restore();
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (vigCanvas) c.drawImage(vigCanvas, 0, 0);
    // rain (screen space)
    c.strokeStyle = 'rgba(160,190,230,.13)'; c.lineWidth = 1; c.beginPath();
    for (i = 0; i < C.RAIN_STREAKS; i++) { var rx = (i * 97 + S.tickT * 60) % (W + 20), ry = (i * 211 + S.tickT * 700 + i * 13) % H; c.moveTo(rx, ry); c.lineTo(rx - 4, ry + 16); }
    c.stroke();
    if (S.flash > 0 && setting('flashes')) { c.globalAlpha = S.flash; c.fillStyle = '#b3202a'; c.fillRect(0, 0, W, H); c.globalAlpha = 1; }
    drawHud();
  }

  // ---------------- input ----------------
  function toCanvas(ev) { var r = cv.getBoundingClientRect(); return [(ev.clientX - r.left) / r.width * W, (ev.clientY - r.top) / r.height * H]; }
  function on(target, type, fn, opt) { target.addEventListener(type, fn, opt); listeners.push([target, type, fn, opt]); }
  var JOY_R = 56, JOY_ZONE_X = W * 0.35, JOY_LEFT = false;   // floating stick: only touches in the right ~65% of the screen spawn it; it is drawn only while held
  function joyHome() { JOY_LEFT = sget('joySide', 'right') === 'left'; JOY_R = 56 * Math.max(0.5, Math.min(1.6, sget('joySize', 1))); joy.on = false; joy.id = -1; joy.bx = joy.tx = JOY_LEFT ? 90 : W - 90; joy.by = joy.ty = H - 110; joy.dx = joy.dy = 0; }
  function joyStart(id, p) {
    if (joy.on || S.phase !== 'fight' || paused) return false;
    if (p[0] > W - 58 && p[1] < 58) { pause(); return true; }
    if (JOY_LEFT ? p[0] > W - JOY_ZONE_X : p[0] < JOY_ZONE_X) return false;
    joy.on = true; joy.id = id; joy.bx = joy.tx = p[0]; joy.by = joy.ty = p[1]; joy.dx = joy.dy = 0; return true;
  }
  function joyMove(p) {
    var dx = p[0] - joy.bx, dy = p[1] - joy.by, d = sqrt(dx * dx + dy * dy), R = JOY_R;
    if (d > R) { joy.bx += dx / d * (d - R); joy.by += dy / d * (d - R); dx = p[0] - joy.bx; dy = p[1] - joy.by; d = R; }
    joy.tx = p[0]; joy.ty = p[1]; var k = min(1, d / R); joy.dx = d > 4 ? dx / d * k : 0; joy.dy = d > 4 ? dy / d * k : 0;
  }
  function joyEnd() { joyHome(); }
  function bindInput() {
    cv.style.touchAction = 'none'; cv.style.webkitUserSelect = 'none'; cv.style.userSelect = 'none'; cv.style.webkitTouchCallout = 'none';
    if (cv.parentElement) cv.parentElement.style.touchAction = 'none';
    joyHome();
    var nopass = { passive: false };
    // touch events (iOS Safari): act on the very first touch, track by identifier, multi-touch safe
    on(cv, 'touchstart', function (ev) {
      ev.preventDefault();
      for (var i = 0; i < ev.changedTouches.length; i++) { var t = ev.changedTouches[i]; if (joyStart(t.identifier, toCanvas(t))) break; }
    }, nopass);
    on(cv, 'touchmove', function (ev) {
      ev.preventDefault(); if (!joy.on) return;
      for (var i = 0; i < ev.changedTouches.length; i++) if (ev.changedTouches[i].identifier === joy.id) { joyMove(toCanvas(ev.changedTouches[i])); break; }
    }, nopass);
    var tend = function (ev) {
      if (ev.cancelable) ev.preventDefault();
      for (var i = 0; i < ev.changedTouches.length; i++) if (joy.on && ev.changedTouches[i].identifier === joy.id) { joyEnd(); break; }
    };
    on(cv, 'touchend', tend, nopass); on(cv, 'touchcancel', tend, nopass);
    // pointer events for mouse / pen only (touch handled above)
    on(cv, 'pointerdown', function (ev) {
      if (ev.pointerType === 'touch') return;
      if (joyStart(ev.pointerId, toCanvas(ev))) { try { cv.setPointerCapture(ev.pointerId); } catch (e) {} ev.preventDefault(); }
    });
    on(cv, 'pointermove', function (ev) { if (ev.pointerType === 'touch' || !joy.on || ev.pointerId !== joy.id) return; joyMove(toCanvas(ev)); ev.preventDefault(); });
    var up = function (ev) { if (ev.pointerType !== 'touch' && joy.on && ev.pointerId === joy.id) joyEnd(); };
    on(cv, 'pointerup', up); on(cv, 'pointercancel', up); on(cv, 'lostpointercapture', up);
    on(window, 'keydown', function (ev) {
      keys[ev.code] = true;
      if (ev.code === 'Escape' || ev.code === 'KeyP') { if (paused) resume(); else pause(); }
      if (/^(Arrow|Space)/.test(ev.code)) ev.preventDefault();
    });
    on(window, 'keyup', function (ev) { keys[ev.code] = false; });
    on(window, 'blur', function () { keys = {}; joyEnd(); });
    on(document, 'visibilitychange', function () { if (document.hidden) pause(); });
    on(cv, 'contextmenu', function (ev) { ev.preventDefault(); });
  }

  // ---------------- loop / api ----------------
  function frame(ts) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    var t0 = performance.now();
    var dt = (ts - lastTs) / 1000; lastTs = ts; if (!(dt > 0)) dt = DT; if (dt > 0.25) dt = 0.25;
    if (!paused) {
      acc += dt; var n = 0;
      while (acc >= DT && n < C.MAX_STEPS_PER_FRAME) { update(DT); acc -= DT; n++; if (!running) return; }
      if (n === C.MAX_STEPS_PER_FRAME) acc = 0;
    }
    syncPub(); draw();
    pub.frameMs = pub.frameMs * 0.95 + (performance.now() - t0) * 0.05;
  }
  function start(o) {
    stop(); opts = o || {}; cv = opts.canvas; if (!cv) throw new Error('arena.start needs canvas');
    cv.width = W; cv.height = H; ctx = cv.getContext('2d'); ctx.lineJoin = 'round';
    makePools(); newRun(); makeVig(); keys = {}; paused = false; acc = 0; dnums.length = 0;
    if (G.fx && G.fx.clear) G.fx.clear();
    G.arenaUI.attach(cv); bindInput(); syncWeaponsPub();
    running = true; startWave(1); syncPub();
    lastTs = performance.now(); raf = requestAnimationFrame(frame);
    return pub;
  }
  function stop() {
    running = false; if (raf) cancelAnimationFrame(raf); raf = 0;
    for (var i = 0; i < listeners.length; i++) listeners[i][0].removeEventListener(listeners[i][1], listeners[i][2], listeners[i][3]);
    listeners = []; paused = false; testMove = null;
    if (G.arenaUI) G.arenaUI.detach();
    pub.phase = 'idle';
  }
  function pause() {
    if (!running || paused || !S || S.phase !== 'fight') return;
    paused = true; joyEnd();
    try { if (G.audio && typeof G.audio.pauseAll === 'function') G.audio.pauseAll(); } catch (e) {}
    G.arenaUI.showPause({ resume: resume, quit: function () { S.result = mkResult(false); finishRun(); } });
  }
  function resume() {
    if (!running || !paused) return;
    paused = false; acc = 0; lastTs = performance.now(); G.arenaUI.hide();
    try { if (G.audio && typeof G.audio.resumeAll === 'function') G.audio.resumeAll(); } catch (e) {}
  }

  G.arena = { basePath: null, start: start, stop: stop, pause: pause, resume: resume, state: pub, isPaused: function () { return paused; } };

  // ---------------- test hooks ----------------
  window.__arenaTest = {
    place: function (x, y) { hero.x = x; hero.y = y; snapCam(); },
    spawn: function (kind, n) {
      n = n || 1; var c = 0;
      for (var i = 0; i < n; i++) {
        var e = spawnEnemy(kind, clampW(hero.x + rr(-VW / 2 + 30, VW / 2 - 30), WW, 30), clampW(hero.y + rr(-VH / 2 + 60, VH / 2 - 30), WH, 30), false);
        if (e) c++;
      }
      return c;
    },
    skipWave: function () { if (S && S.phase === 'fight') { if (S.wave >= S.ch.waves) { S.waveT = S.waveLen; } endWave(); } },
    drop: function (dx, dy, v, gold, gem, big) { var p = null; for (var i = 0; i < pickups.length; i++) if (!pickups[i].active) { p = pickups[i]; break; } if (p) fillPickup(p, hero.x + dx, hero.y + dy, 0, 0, v, !!gold, gem, big); },
    setWeapon: function (base, tier) { S.weapon.base = base; S.weapon.tier = tier | 0; S.weapon.mag = C.WEAPONS[effId(S.weapon)].mag; hero.weaponId = effId(S.weapon); syncWeaponsPub(); },
    freezeEnemies: function (b) { for (var i = 0; i < enemies.length; i++) if (enemies[i].active) enemies[i].spd = b ? 0 : enemies[i].def.spd; },
    setWave: function (n) { if (S) S.wave = n; },
    joy: function () { return { on: joy.on, dx: joy.dx, dy: joy.dy, bx: joy.bx, by: joy.by }; },
    spawnTag: function (kind, tag) { return !!spawnEnemy(kind, clampW(hero.x, WW, 40), clampW(hero.y - 120, WH, 40), false, tag); },
    giveCash: function (n) { if (S) S.cash += n; },
    setSeed: function (n) { seed = n >>> 0; },
    step: function (n) { for (var i = 0; i < n && running; i++) update(DT); syncPub(); },
    setInput: function (dx, dy) { testMove = dx == null ? null : [dx, dy]; },
    god: function (b) { god = !!b; },
    render: function () { draw(); },
    fireBullets: function (n) { for (var i = 0; i < n; i++) { var b = newBullet(); if (!b) break; var a = rnd() * TAU; b.active = true; b.friendly = false; b.x = cam.l + rr(0, VW); b.y = cam.t + rr(0, VH); b.vx = cos(a) * 60; b.vy = sin(a) * 60; b.r = 5; b.dmg = 0; b.life = 30; b.color = '#ff7a2d'; b.pierce = 0; b.splash = 0; b.hitN = 0; b.kind = 2; b.ang = a; b.sc = C.ENEMY_BULLET_SCALE; b.tr = 0; b.age = 0; } },
    cam: function () { return { x: cam.x, y: cam.y, l: cam.l, t: cam.t, zoom: ZOOM, vw: VW, vh: VH, ww: WW, wh: WH, props: props.length, solids: solids.length }; },
    snapshot: function () {
      var es = [], ps = [], bs = [], i;
      for (i = 0; i < enemies.length; i++) { var e = enemies[i]; if (e.active) es.push({ x: e.x, y: e.y, r: e.r, kind: e.kind, hp: e.hp, boss: e.boss }); }
      for (i = 0; i < pickups.length; i++) if (pickups[i].active) ps.push({ x: pickups[i].x, y: pickups[i].y, gold: pickups[i].gold, gem: pickups[i].gem });
      for (i = 0; i < bullets.length; i++) if (bullets[i].active && !bullets[i].friendly) bs.push({ x: bullets[i].x, y: bullets[i].y, vx: bullets[i].vx, vy: bullets[i].vy });
      return { cam: { x: cam.x, y: cam.y, l: cam.l, t: cam.t }, hero: { x: hero.x, y: hero.y, hp: hero.hp, maxHp: hero.maxHp, r: hero.r }, enemies: es, pickups: ps, bullets: bs, phase: S.phase, wave: S.wave, cash: S.cash, weapons: [{ id: effId(S.weapon), base: S.weapon.base, tier: S.weapon.tier }], chapter: S.ch.id, stats: S.st, bag: S.bag, offers: S.offers };
    },
    internals: function () { return { S: S, hero: hero, enemies: enemies, pickups: pickups }; }
  };
})();
