/* Arena shooter engine. API: G.arena.start({canvas,onEnd,loadout}), stop, pause, resume, state. Test hooks: window.__arenaTest. */
window.G = window.G || {};
(function () {
  var C = G.ARENA_CFG, W = C.W, H = C.H, DT = C.DT;
  var TAU = Math.PI * 2, cos = Math.cos, sin = Math.sin, sqrt = Math.sqrt, atan2 = Math.atan2, min = Math.min, max = Math.max;

  // ---------------- rng ----------------
  var seed = (Date.now() ^ 0x5bd1e995) >>> 0;
  function rnd() { seed = (seed + 0x6D2B79F5) | 0; var t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  function rr(a, b) { return a + (b - a) * rnd(); }
  function setting(k) { try { var s = G.save && G.save.state && G.save.state.settings; return !(s && s[k] === false); } catch (e) { return true; } }
  function sfx(n) { try { if (G.audio) G.audio.play(n); } catch (e) {} }

  // ---------------- builtin fx (replaceable: G.fx with same methods) ----------------
  if (!G.fx) {
    var P = [], pi = 0, beams = [];
    for (var q = 0; q < C.POOL.particles; q++) P.push({ a: false, t: 0, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, s: 1, c: '#fff', k: 0 });
    var add = function (k, x, y, vx, vy, life, s, c) {
      var p = null, n = P.length;
      for (var i = 0; i < n; i++) { var j = (pi + i) % n; if (!P[j].a) { p = P[j]; pi = j + 1; break; } }
      if (!p) return;
      p.a = true; p.k = k; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.max = life; p.s = s; p.c = c;
    };
    G.fx = {
      muzzle: function (x, y, ang) { if (!setting('flashes')) return; add(2, x + cos(ang) * 6, y + sin(ang) * 6, 0, 0, 0.06, 7, '#fff3b0'); },
      hit: function (x, y, ang) { for (var i = 0; i < 3; i++) { var a = ang + Math.PI + rr(-0.9, 0.9), s = rr(60, 190); add(0, x, y, cos(a) * s, sin(a) * s, rr(0.1, 0.22), 2, '#ffe9a0'); } },
      blood: function (x, y, ang, n) { n = n || 4; for (var i = 0; i < n; i++) { var a = ang + rr(-1.2, 1.2), s = rr(40, 170); add(1, x, y, cos(a) * s, sin(a) * s, rr(0.25, 0.55), rr(1.5, 3.2), '#8e1b22'); } },
      explosion: function (x, y, r) { add(3, x, y, 0, 0, 0.3, r, '#ffb347'); for (var i = 0; i < 10; i++) { var a = rnd() * TAU, s = rr(60, 260); add(0, x, y, cos(a) * s, sin(a) * s, rr(0.2, 0.45), 2.5, i % 2 ? '#ff7043' : '#ffe082'); } },
      coin: function (x, y, gold) { for (var i = 0; i < 4; i++) add(4, x + rr(-6, 6), y + rr(-6, 6), rr(-20, 20), rr(-90, -30), 0.4, 2, gold ? '#ffd23f' : '#6fe07a'); },
      beam: function (x1, y1, x2, y2, c) { beams.push({ x1: x1, y1: y1, x2: x2, y2: y2, t: 0.09, c: c }); if (beams.length > 14) beams.shift(); },
      update: function (dt) {
        for (var i = 0; i < P.length; i++) {
          var p = P[i]; if (!p.a) continue;
          p.life -= dt; if (p.life <= 0) { p.a = false; continue; }
          p.x += p.vx * dt; p.y += p.vy * dt; var f = p.k === 4 ? 1 : 0.9; p.vx *= f; p.vy *= f;
        }
        for (var b = beams.length - 1; b >= 0; b--) { beams[b].t -= dt; if (beams[b].t <= 0) beams.splice(b, 1); }
      },
      draw: function (ctx) {
        for (var i = 0; i < P.length; i++) {
          var p = P[i]; if (!p.a) continue;
          var k = p.life / p.max;
          ctx.globalAlpha = k > 1 ? 1 : k;
          if (p.k === 3) { ctx.strokeStyle = p.c; ctx.lineWidth = 4 * k + 1; ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (1 - k * 0.8), 0, TAU); ctx.stroke(); }
          else if (p.k === 0) { ctx.strokeStyle = p.c; ctx.lineWidth = p.s; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); ctx.stroke(); }
          else { ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (p.k === 2 ? k : 1), 0, TAU); ctx.fill(); }
        }
        ctx.globalAlpha = 1;
        for (var b = 0; b < beams.length; b++) {
          var m = beams[b]; ctx.globalAlpha = min(1, m.t / 0.09);
          ctx.strokeStyle = m.c; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(m.x1, m.y1); ctx.lineTo(m.x2, m.y2); ctx.stroke();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
        }
        ctx.globalAlpha = 1;
      },
      clear: function () { for (var i = 0; i < P.length; i++) P[i].a = false; beams.length = 0; }
    };
  }

  // ---------------- state ----------------
  var cv, ctx, opts, running = false, paused = false, raf = 0, lastTs = 0, acc = 0, bgCanvas = null;
  var hero, S, enemies, bullets, pickups, warns;
  var gridHead, gridNext, GC = C.GRID_CELL, GCOLS = Math.ceil(W / GC), GROWS = Math.ceil(H / GC);
  var qbuf = new Int16Array(C.POOL.enemies), qbuf2 = new Int16Array(C.POOL.enemies);
  var keys = {}, joy = { on: false, id: -1, bx: 0, by: 0, tx: 0, ty: 0, dx: 0, dy: 0 };
  var testMove = null, god = false, listeners = [];
  var actor = { kind: '', x: 0, y: 0, facing: 0, moving: false, speed: 0, state: 'idle', t: 0, animT: 0, weaponId: null, scale: 1 };

  var pub = {
    hp: 0, maxHp: 0, xp: 0, xpNeed: 1, level: 1, wave: 1, timeLeft: 0, cash: 0, gold: 0, weapons: [], kills: 0,
    phase: 'idle', bossHp: 0, bossMaxHp: 0, enemies: 0, bullets: 0, frameMs: 0, stats: {}, items: {}
  };

  function makePools() {
    enemies = []; bullets = []; pickups = []; warns = [];
    for (var i = 0; i < C.POOL.enemies; i++) enemies.push({ active: false, id: i, kind: '', def: null, x: 0, y: 0, vx: 0, vy: 0, r: 10, hp: 1, maxHp: 1, dmg: 1, spd: 0, scale: 1, elite: false, facing: 0, moving: false, speed: 0, state: 'idle', t: 0, animT: 0, weaponId: null, atkCd: 0, fireCd: 0, burstLeft: 0, burstT: 0, hurtT: 0, shootT: 0, patIdx: 0, ps: 0, pat: '', patT: 0, chx: 0, chy: 0, volley: 0, boss: false });
    for (i = 0; i < C.POOL.bullets; i++) bullets.push({ active: false, friendly: true, x: 0, y: 0, vx: 0, vy: 0, r: 3, dmg: 0, life: 0, pierce: 0, splash: 0, color: '#fff', hitN: 0, hit: new Int16Array(10) });
    for (i = 0; i < C.POOL.pickups; i++) pickups.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, v: 1, gold: false, mag: false, t: 0 });
    for (i = 0; i < 90; i++) warns.push({ active: false, x: 0, y: 0, t: 0, kind: '', elite: false });
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
  function syncWeaponsPub() {
    var a = [];
    for (var i = 0; i < S.weapons.length; i++) { var w = S.weapons[i]; if (w) a.push({ id: w.id, tier: w.tier, slot: i }); }
    pub.weapons = a;
  }

  // ---------------- run setup ----------------
  function newRun() {
    var save = null; try { save = G.save && G.save.state; } catch (e) {}
    S = {
      wave: 0, phase: 'idle', waveT: 0, waveLen: 20, spawnAcc: 0, spawned: 0, spawnTotal: 0, eliteLeft: 0, eliteEvery: 0,
      kills: 0, cash: 0, cashEarned: 0, gold: 0, xp: 0, level: 1, pending: 0, resolved: 0,
      bag: { cash: 0, gold: 0 }, weapons: [], items: {}, cardBonus: {}, perm: permBonuses(), st: {},
      cards: null, cardRerolls: 0, offers: [], shopRerolls: 0, shake: 0, flash: 0, endT: 0, result: null, bossDown: false, boss: null,
      bossSpawned: false, miniSpawned: false, wlevels: (save && save.weapons) || {}, hintT: 4, tickT: 0
    };
    if (opts.loadout && opts.loadout.weapons) S.wlevels = opts.loadout.weapons;
    hero = { kind: 'hero', x: W / 2, y: H / 2 + 60, r: C.HERO.r, hp: C.HERO.startHp, maxHp: 0, facing: -Math.PI / 2, moving: false, speed: 0, state: 'idle', t: 0, animT: 0, weaponId: null, scale: 1, inv: 0, hurtT: 0, shootT: 0, lsCd: 0, dead: false };
    recompute(); hero.hp = hero.maxHp;
    var sw = (opts.loadout && (opts.loadout.startWeapon || opts.loadout.weapon)) || (save && save.startWeapon) || C.START_WEAPON;
    if (!C.WEAPONS[sw]) sw = C.START_WEAPON;
    addWeaponToSlot(sw, 0, C.WEAPONS[sw].price);
    hero.weaponId = sw;
  }
  function newWeapon(id, tier, paid) { return { id: id, tier: tier, cd: 0.2, mag: C.WEAPONS[id].mag, reloadT: 0, aim: -Math.PI / 2, paid: paid }; }
  function addWeaponToSlot(id, tier, paid) {
    for (var i = 0; i < C.SLOTS; i++) if (!S.weapons[i]) { S.weapons[i] = newWeapon(id, tier, paid); syncWeaponsPub(); return true; }
    return false;
  }
  function freeSlot() { for (var i = 0; i < C.SLOTS; i++) if (!S.weapons[i]) return i; return -1; }
  function findPair(slot) {
    var w = S.weapons[slot]; if (!w || w.tier >= 3) return -1;
    for (var j = 0; j < C.SLOTS; j++) if (j !== slot && S.weapons[j] && S.weapons[j].id === w.id && S.weapons[j].tier === w.tier) return j;
    return -1;
  }
  function mergeSlot(slot) {
    var j = findPair(slot); if (j < 0) return false;
    var w = S.weapons[slot], o = S.weapons[j]; w.tier++; w.paid += o.paid; S.weapons[j] = null; syncWeaponsPub(); return true;
  }
  function canMergeBuy(id, tier) {
    if (tier >= 3) return false;
    for (var j = 0; j < C.SLOTS; j++) if (S.weapons[j] && S.weapons[j].id === id && S.weapons[j].tier === tier) return true;
    return false;
  }

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
  function spawnEnemy(kind, x, y, elite) {
    var def = C.ENEMIES[kind], e = null;
    for (var i = 0; i < enemies.length; i++) if (!enemies[i].active) { e = enemies[i]; break; }
    if (!e) return null;
    var w = max(1, S.wave), boss = !!def.boss;
    e.active = true; e.kind = kind; e.def = def; e.boss = boss; e.elite = !!elite;
    e.scale = elite ? C.ELITE.scale : 1; e.r = def.r * e.scale;
    var hp = def.hp * (boss ? C.BOSS_HP_SCALE(w) : C.hpMult(w)) * (elite ? C.ELITE.hp : 1);
    e.hp = e.maxHp = hp; e.dmg = def.dmg * C.dmgMult(w) * (elite ? C.ELITE.dmg : 1);
    e.spd = def.spd * C.speedMult(w) * (1 + rr(-0.06, 0.06)); e.x = x; e.y = y; e.vx = e.vy = 0;
    e.facing = atan2(hero.y - y, hero.x - x); e.moving = false; e.speed = 0; e.state = 'idle'; e.t = 0; e.animT = rnd() * 3; e.weaponId = null;
    e.atkCd = rr(0.2, 0.6); e.fireCd = rr(0.8, (def.fireCd || 2)); e.burstLeft = 0; e.burstT = 0; e.hurtT = 0; e.shootT = 0;
    e.patIdx = 0; e.ps = 0; e.pat = ''; e.patT = 0; e.volley = 0;
    if (boss) S.boss = e;
    return e;
  }
  function edgePoint() {
    var m = C.SPAWN_MARGIN, s = rnd() * 4 | 0, t = rnd();
    if (s === 0) return [t * W, m]; if (s === 1) return [W - m, t * H]; if (s === 2) return [t * W, H - m]; return [m, t * H];
  }
  function addWarn(kind, x, y, elite, t) {
    for (var i = 0; i < warns.length; i++) if (!warns[i].active) { var w = warns[i]; w.active = true; w.x = x; w.y = y; w.kind = kind; w.elite = elite; w.t = t || C.SPAWN_WARN; return; }
    spawnEnemy(kind, x, y, elite);
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
      var p = edgePoint(), grp = 1 + (rnd() < 0.3 ? 1 : 0) + (rnd() < 0.1 ? 1 : 0);
      for (var g = 0; g < grp && S.spawned < S.spawnTotal; g++) {
        var elite = S.eliteLeft > 0 && rnd() < S.eliteLeft / max(1, S.spawnTotal - S.spawned);
        if (elite) S.eliteLeft--;
        S.spawned++;
        if (aliveCount() + countWarns() < C.ALIVE_CAP) addWarn(pickKind(), min(W - 12, max(12, p[0] + rr(-24, 24))), min(H - 12, max(12, p[1] + rr(-24, 24))), elite);
      }
    }
  }
  function countWarns() { var n = 0; for (var i = 0; i < warns.length; i++) if (warns[i].active) n++; return n; }

  // ---------------- bullets ----------------
  function newBullet() { for (var i = 0; i < bullets.length; i++) if (!bullets[i].active) return bullets[i]; return null; }
  function fireEnemyBullet(x, y, ang, spd, dmg) {
    var b = newBullet(); if (!b) return;
    b.active = true; b.friendly = false; b.x = x; b.y = y; b.vx = cos(ang) * spd; b.vy = sin(ang) * spd; b.r = C.ENEMY_BULLET_R; b.dmg = dmg; b.life = 4; b.pierce = 0; b.splash = 0; b.color = '#ff2d6f'; b.hitN = 0;
  }
  function weaponStats(w) {
    var d = C.WEAPONS[w.id], st = S.st, lv = S.wlevels[w.id] ? (S.wlevels[w.id].level || 0) : 0;
    return {
      dmg: d.dmg * C.TIER_MULT[w.tier] * (1 + st.damage / 100) * (1 + C.WEAPON_LEVEL_DMG * lv),
      cd: 1 / (d.rate * max(0.2, 1 + st.attack_speed / 100)),
      range: max(80, d.range + st.range)
    };
  }
  var SLOT_R = 17;
  function slotPos(i, out) { var a = -Math.PI / 2 + i * TAU / C.SLOTS; out.x = hero.x + cos(a) * SLOT_R; out.y = hero.y + sin(a) * SLOT_R; }
  var sp = { x: 0, y: 0 };
  function fireWeapon(w, i, target) {
    var d = C.WEAPONS[w.id], ws = weaponStats(w), st = S.st;
    slotPos(i, sp);
    var ang = atan2(target.y - sp.y, target.x - sp.x), mx = sp.x + cos(ang) * 14, my = sp.y + sin(ang) * 14;
    w.aim = ang; hero.shootT = 0.15;
    if (G.fx) G.fx.muzzle(mx, my, ang);
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
    var n = d.pellets, pr = Math.floor(st.pierce) + (d.pierce || 0);
    for (var p = 0; p < n; p++) {
      var b = newBullet(); if (!b) break;
      var a = ang + (n > 1 ? (p / (n - 1) - 0.5) * d.spread + rr(-0.04, 0.04) : rr(-d.spread, d.spread));
      var crit2 = rnd() * 100 < st.crit;
      b.active = true; b.friendly = true; b.x = mx; b.y = my; b.vx = cos(a) * d.speed; b.vy = sin(a) * d.speed; b.r = C.BULLET_R;
      b.dmg = ws.dmg * (crit2 ? C.CRIT_MULT : 1); b.life = ws.range / d.speed + 0.04; b.pierce = pr; b.color = d.color; b.hitN = 0;
      b.splash = d.splash ? d.splash * (1 + st.explosion / 100) : 0;
    }
    sfx('shoot');
  }

  function hitEnemy(e, dmg, ang) {
    if (!e.active) return;
    e.hp -= dmg; e.hurtT = 0.12;
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
      b.life -= dt;
      if (b.life <= 0 || b.x < -30 || b.x > W + 30 || b.y < -30 || b.y > H + 30) b.active = false;
    }
  }

  // ---------------- pickups ----------------
  function dropPickup(x, y, v, gold) {
    var p = null;
    for (var i = 0; i < pickups.length; i++) if (!pickups[i].active) { p = pickups[i]; break; }
    if (!p) { collect({ v: v, gold: gold, x: x, y: y }); return; }
    var a = rnd() * TAU, s = rr(30, 110);
    p.active = true; p.x = x; p.y = y; p.vx = cos(a) * s; p.vy = sin(a) * s; p.v = v; p.gold = gold; p.mag = false; p.t = 0;
  }
  function collect(p) {
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
        p.x = max(8, min(W - 8, p.x)); p.y = max(8, min(H - 8, p.y));
      }
    }
  }
  function killEnemy(e, drops) {
    e.active = false;
    if (G.fx) G.fx.blood(e.x, e.y, rnd() * TAU, 8);
    if (!drops) return;
    S.kills++;
    var def = e.def, vm = valueMult(), el = e.elite;
    if (def.boss) {
      var nd = def.drops, per = max(1, Math.round(def.val * vm));
      for (var i = 0; i < nd; i++) dropPickup(e.x + rr(-30, 30), e.y + rr(-30, 30), per, false);
      for (var g = 0; g < def.gold; g++) dropPickup(e.x + rr(-30, 30), e.y + rr(-30, 30), 1, true);
      S.shake = 14; if (G.fx) G.fx.explosion(e.x, e.y, 70); sfx('explode');
      if (e.kind === 'boss_leader') { S.bossDown = true; }
      if (S.boss === e) S.boss = null;
    } else {
      dropPickup(e.x, e.y, max(1, Math.round(def.val * vm * (el ? C.ELITE.value : 1))), false);
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
    sfx('hurt'); if (setting('shake')) S.shake = max(S.shake, 6); if (setting('flashes')) S.flash = 0.25;
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
    hero.x = max(hero.r + 2, min(W - hero.r - 2, hero.x + m[0] * sp2 * dt)); hero.y = max(hero.r + 2, min(H - hero.r - 2, hero.y + m[1] * sp2 * dt));
    hero.moving = mag > 0.05; hero.speed = mag;
    hero.inv = max(0, hero.inv - dt); hero.hurtT = max(0, hero.hurtT - dt); hero.shootT = max(0, hero.shootT - dt); hero.lsCd = max(0, hero.lsCd - dt);
    if (S.st.regen > 0 && hero.hp < hero.maxHp) hero.hp = min(hero.maxHp, hero.hp + S.st.regen * dt);
    var tg = findNearest(), anyFire = false;
    for (var i = 0; i < C.SLOTS; i++) {
      var w = S.weapons[i]; if (!w) continue;
      var ws = weaponStats(w), d = C.WEAPONS[w.id];
      w.cd -= dt;
      if (w.reloadT > 0) { w.reloadT -= dt; if (w.reloadT <= 0) w.mag = d.mag; continue; }
      if (!tg) continue;
      if (best.d2 > (ws.range + tg.r) * (ws.range + tg.r)) continue;
      if (w.cd <= 0) {
        fireWeapon(w, i, tg); anyFire = true; w.cd += ws.cd; if (w.cd < -ws.cd) w.cd = 0;
        if (d.mag > 0) { w.mag--; if (w.mag <= 0) w.reloadT = d.reload / max(0.2, 1 + S.st.reload_speed / 100); }
      }
    }
    if (tg && (anyFire || hero.shootT > 0)) hero.facing = atan2(tg.y - hero.y, tg.x - hero.x);
    else if (hero.moving) hero.facing = atan2(m[1], m[0]);
    if (tg) for (var k = 0; k < C.SLOTS; k++) { var ww = S.weapons[k]; if (ww) { slotPos(k, sp); ww.aim = atan2(tg.y - sp.y, tg.x - sp.x); } }
    hero.animT += dt * (hero.moving ? 1 : 0.2); hero.t += dt;
    var ns = hero.hurtT > 0 ? 'hurt' : hero.shootT > 0 ? 'shoot' : hero.moving ? 'walk' : 'idle';
    if (ns !== hero.state) { hero.state = ns; hero.t = 0; }
    if (S.weapons[0]) hero.weaponId = S.weapons[0].id;
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
      e.x = max(e.r, min(W - e.r, e.x)); e.y = max(e.r, min(H - e.r, e.y));
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
    for (var i = 0; i < n; i++) { var a = rnd() * TAU; addWarn(kind, max(14, min(W - 14, e.x + cos(a) * 70)), max(14, min(H - 14, e.y + sin(a) * 70)), false, 0.5); }
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
        var volleys = e.kind === 'boss_leader' ? 3 : 1;
        if (e.volley < volleys && e.patT >= e.volley * 0.28) {
          e.volley++; var a = atan2(uy, ux);
          for (var p = 0; p < def.pellets; p++) fireEnemyBullet(e.x + cos(a) * e.r, e.y + sin(a) * e.r, a + (p / (def.pellets - 1) - 0.5) * def.spread, def.bspd * (1 + (p % 2) * 0.12), dmgB);
          sfx('shoot'); if (G.fx) G.fx.muzzle(e.x + cos(a) * e.r, e.y + sin(a) * e.r, a);
        }
        if (e.patT >= volleys * 0.28 + 0.2) { e.ps = 0; e.patT = 0; }
      } else if (e.patT >= 0.45) { e.ps = 0; e.patT = 0; }
    }
    e.x = max(e.r, min(W - e.r, e.x + vx * dt)); e.y = max(e.r, min(H - e.r, e.y + vy * dt));
    e.moving = vx !== 0 || vy !== 0; e.speed = e.moving ? 0.6 : 0; e.animT += dt * (e.moving ? 1 : 0.2);
    if (!hero.dead && d < e.r + hero.r) {
      if (e.atkCd <= 0) { e.atkCd = 0.7; hurtHero(def.contact * C.dmgMult(S.wave) * (e.pat === 'charge' && e.ps === 2 ? 1.5 : 1)); }
    }
  }

  // ---------------- wave flow ----------------
  function startWave(n) {
    S.wave = n; S.phase = 'fight'; S.waveT = 0; S.waveLen = C.waveTime(n); S.spawnAcc = 1.5; S.spawned = 0;
    S.spawnTotal = C.waveEnemyCount(n); S.eliteLeft = C.ELITES_PER_WAVE(n); S.bossSpawned = false; S.miniSpawned = false; S.boss = null;
    var i;
    for (i = 0; i < enemies.length; i++) enemies[i].active = false;
    for (i = 0; i < bullets.length; i++) bullets[i].active = false;
    for (i = 0; i < pickups.length; i++) pickups[i].active = false;
    for (i = 0; i < warns.length; i++) warns[i].active = false;
    hero.x = W / 2; hero.y = H / 2 + 60; hero.inv = 0.8;
    // bag respawn (Brotato rule)
    var bc = S.bag.cash, bg = S.bag.gold;
    if (bc > 0) {
      var cnt = min(C.BAG_RESPAWN_MAX, bc), base = Math.floor(bc / cnt), rem = bc - base * cnt;
      for (i = 0; i < cnt; i++) { var p = null; for (var k = 0; k < pickups.length; k++) if (!pickups[k].active) { p = pickups[k]; break; } if (!p) break; p.active = true; p.x = rr(50, W - 50); p.y = rr(110, H - 60); p.vx = p.vy = 0; p.v = base + (i < rem ? 1 : 0); p.gold = false; p.mag = false; p.t = 0; }
    }
    for (i = 0; i < bg; i++) { var q = null; for (var k2 = 0; k2 < pickups.length; k2++) if (!pickups[k2].active) { q = pickups[k2]; break; } if (!q) break; q.active = true; q.x = rr(50, W - 50); q.y = rr(110, H - 60); q.vx = q.vy = 0; q.v = 1; q.gold = true; q.mag = false; q.t = 0; }
    S.bag.cash = 0; S.bag.gold = 0;
    for (i = 0; i < S.weapons.length; i++) if (S.weapons[i]) { S.weapons[i].cd = 0.3; S.weapons[i].mag = C.WEAPONS[S.weapons[i].id].mag; S.weapons[i].reloadT = 0; }
    if (n === 1) { spawnWarnInstant(); }
  }
  function spawnWarnInstant() { for (var i = 0; i < 3; i++) { var p = edgePoint(); addWarn('thug_knife', p[0], p[1], false, 0.4 + i * 0.1); S.spawned++; } }
  function waveUpdate(dt) {
    S.waveT += dt;
    if (S.wave === C.MINI_BOSS_WAVE && !S.miniSpawned && S.waveT >= C.MINI_BOSS_AT) { S.miniSpawned = true; addWarn('mini_boss', W / 2, 50, false, 1.2); sfx('boss'); }
    if (S.wave === C.WAVES && !S.bossSpawned && S.waveT >= C.BOSS_SPAWN_AT) { S.bossSpawned = true; addWarn('boss_leader', W / 2, 60, false, 1.4); sfx('boss'); }
    spawnTick(dt);
    for (var i = 0; i < warns.length; i++) {
      var w = warns[i]; if (!w.active) continue;
      w.t -= dt; if (w.t <= 0) { w.active = false; spawnEnemy(w.kind, w.x, w.y, w.elite); }
    }
    if (S.bossDown && S.wave === C.WAVES) { beginEnd(true); return; }
    if (S.waveT >= S.waveLen) endWave();
  }
  function endWave() {
    var i;
    for (i = 0; i < enemies.length; i++) if (enemies[i].active) killEnemy(enemies[i], false);
    for (i = 0; i < bullets.length; i++) bullets[i].active = false;
    for (i = 0; i < warns.length; i++) warns[i].active = false;
    for (i = 0; i < pickups.length; i++) { var p = pickups[i]; if (p.active) { p.active = false; if (p.gold) S.bag.gold += p.v; else S.bag.cash += p.v; } }
    if (S.wave >= C.WAVES) { beginEnd(true); return; }
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
  function beginEnd(win) {
    if (S.phase === 'ending' || S.phase === 'won') return;
    S.phase = win ? 'won' : 'ending'; S.endT = win ? 1.6 : 1.4;
    var i; for (i = 0; i < warns.length; i++) warns[i].active = false;
    for (i = 0; i < bullets.length; i++) bullets[i].active = false;
    if (win) { for (i = 0; i < enemies.length; i++) if (enemies[i].active) killEnemy(enemies[i], false); }
    S.result = { win: !!win, wave: S.wave, kills: S.kills, cash: 0, gold: 0, bossDown: !!S.bossDown };
  }
  function finishRun() {
    var r = S.result || { win: false, wave: S.wave, kills: S.kills, bossDown: S.bossDown };
    for (var i = 0; i < pickups.length; i++) if (pickups[i].active) { pickups[i].active = false; collect(pickups[i]); }
    r.cash = S.cashEarned + (r.win ? C.BOSS_WIN_CASH : 0); r.gold = S.gold; r.wave = S.wave; r.kills = S.kills;
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
      if (!fresh && old && old.locked && !old.sold) { out.push(old); continue; }
      if (fresh && old && old.locked && !old.sold) { out.push(old); continue; }
      out.push(rollOffer(wave));
    }
    S.offers = out;
  }
  function rollOffer(wave) {
    if (rnd() < C.SHOP_WEAPON_CHANCE) {
      var el = C.WEAPON_IDS.filter(function (id) { return wave >= (C.SHOP_WEAPON_MIN_WAVE[id] || 1); });
      var id = el[rnd() * el.length | 0], tier = 0;
      if (wave >= 8 && rnd() < 0.1) tier = 2; else if (wave >= 4 && rnd() < 0.2) tier = 1;
      return { kind: 'weapon', id: id, tier: tier, price: C.shopPrice(C.WEAPONS[id].price * C.TIER_PRICE_MULT[tier], wave), locked: false, sold: false };
    }
    var ids = Object.keys(C.ITEMS), it = ids[rnd() * ids.length | 0];
    return { kind: 'item', id: it, tier: 0, price: C.shopPrice(C.ITEMS[it].price, wave), locked: false, sold: false };
  }
  function weaponDesc(id, tier) {
    var d = C.WEAPONS[id], dm = d.dmg * C.TIER_MULT[tier];
    return Math.round(dm * 10) / 10 + ' dmg' + (d.pellets > 1 ? ' x' + d.pellets : '') + ' | ' + d.rate + '/s | rng ' + d.range + (d.beam ? ' | pierce beam' : '') + (d.splash ? ' | splash' : '') + (d.pierce ? ' | pierce' : '');
  }
  function showShop() {
    var view = shopView();
    G.arenaUI.showShop(view, shopActions);
  }
  function shopView() {
    var mp = null, i;
    for (i = 0; i < C.SLOTS; i++) if (findPair(i) >= 0) { mp = 'You have two identical weapons - merge them to upgrade a tier!'; break; }
    return {
      wave: S.wave, cash: S.cash, rerollCost: C.shopRerollCost(S.wave, S.shopRerolls), mergePrompt: mp, lastWave: false,
      offers: S.offers.map(function (o) {
        var canBuy = !o.sold && S.cash >= o.price, why = null, name, desc, emb, col;
        if (o.kind === 'weapon') {
          var d = C.WEAPONS[o.id]; name = d.name; desc = weaponDesc(o.id, o.tier); emb = G.arenaUI.helpers.initials(d.name); col = C.TIER_COLORS[o.tier];
          if (canBuy && freeSlot() < 0 && !canMergeBuy(o.id, o.tier)) { canBuy = false; why = 'No slot'; }
        } else { var it = C.ITEMS[o.id]; name = it.name; desc = it.desc; emb = G.arenaUI.helpers.initials(it.name); col = '#4caf50'; }
        if (!o.sold && S.cash < o.price) why = 'Need $' + o.price;
        return { kind: o.kind, id: o.id, name: name, desc: desc, price: o.price, locked: o.locked, sold: o.sold, canBuy: canBuy, why: why, tier: o.tier, tierName: C.TIER_NAMES[o.tier], emblem: emb, color: col };
      }),
      weapons: S.weapons.length || true ? (function () { var a = []; for (var k = 0; k < C.SLOTS; k++) { var w = S.weapons[k]; a.push(w ? { slot: k, id: w.id, name: C.WEAPONS[w.id].name, tier: w.tier, tierName: C.TIER_NAMES[w.tier], sellPrice: Math.floor(w.paid * C.RECYCLE_REFUND), canMerge: findPair(k) >= 0 } : null); } return a; })() : [],
      items: Object.keys(S.items).map(function (id) { return { id: id, name: C.ITEMS[id].name, count: S.items[id], sellPrice: Math.floor(C.ITEMS[id].price * C.RECYCLE_REFUND) }; })
    };
  }
  var shopActions = {
    buy: function (i) {
      var o = S.offers[i]; if (!o || o.sold || S.cash < o.price) return;
      if (o.kind === 'weapon') {
        var slot = freeSlot();
        if (slot < 0) {
          if (!canMergeBuy(o.id, o.tier)) return;
          for (var j = 0; j < C.SLOTS; j++) if (S.weapons[j] && S.weapons[j].id === o.id && S.weapons[j].tier === o.tier) { S.weapons[j].tier++; S.weapons[j].paid += o.price; break; }
          syncWeaponsPub(); G.arenaUI.toast('Auto-merged!');
        } else { addWeaponToSlot(o.id, o.tier, o.price); if (findPair(slot) >= 0) G.arenaUI.toast('Merge available!'); }
      } else { S.items[o.id] = (S.items[o.id] || 0) + 1; recompute(); }
      S.cash -= o.price; o.sold = true; o.locked = false; sfx('buy'); showShop();
    },
    lock: function (i) { var o = S.offers[i]; if (o && !o.sold) { o.locked = !o.locked; showShop(); } },
    reroll: function () {
      var c = C.shopRerollCost(S.wave, S.shopRerolls); if (S.cash < c) return;
      S.cash -= c; S.shopRerolls++;
      for (var i = 0; i < S.offers.length; i++) if (!(S.offers[i].locked && !S.offers[i].sold)) S.offers[i] = rollOffer(S.wave);
      showShop();
    },
    recycleWeapon: function (slot) {
      var w = S.weapons[slot]; if (!w) return;
      var live = 0; for (var i = 0; i < C.SLOTS; i++) if (S.weapons[i]) live++;
      if (live <= 1) { G.arenaUI.toast('Keep at least one weapon'); return; }
      S.cash += Math.floor(w.paid * C.RECYCLE_REFUND); S.weapons[slot] = null; syncWeaponsPub(); showShop();
    },
    recycleItem: function (id) {
      if (!S.items[id]) return; S.cash += Math.floor(C.ITEMS[id].price * C.RECYCLE_REFUND);
      if (--S.items[id] <= 0) delete S.items[id]; recompute(); showShop();
    },
    merge: function (slot) { if (mergeSlot(slot)) { sfx('buy'); showShop(); } },
    next: function () {
      G.arenaUI.hide(); S.shopEntered = false;
      for (var i = 0; i < S.offers.length; i++) if (S.offers[i].sold) S.offers[i] = rollOffer(S.wave + 1);   // sold slots refill, locked remain
      startWave(S.wave + 1);
    }
  };

  // ---------------- main update ----------------
  function update(dt) {
    S.tickT += dt;
    if (S.shake > 0) S.shake = max(0, S.shake - 40 * dt);
    if (S.flash > 0) S.flash = max(0, S.flash - dt);
    if (S.hintT > 0) S.hintT -= dt;
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
  }
  function syncPub() {
    pub.hp = hero.hp; pub.maxHp = hero.maxHp; pub.xp = S.xp; pub.xpNeed = C.xpNeed(S.level); pub.level = S.level; pub.wave = S.wave;
    pub.timeLeft = max(0, S.waveLen - S.waveT); pub.cash = S.cash; pub.gold = S.gold; pub.kills = S.kills; pub.phase = S.phase;
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
    for (var i = 0; i < C.SLOTS; i++) {
      var w = S.weapons[i]; if (!w) continue; slotPos(i, sp);
      var L = C.WEAPONS[w.id].muzzle[0] * 0.2 + 4;
      ctx.save(); ctx.translate(sp.x, sp.y); ctx.rotate(w.aim); ctx.fillStyle = C.TIER_COLORS[w.tier]; ctx.strokeStyle = '#000'; ctx.lineWidth = 2.5; ctx.strokeRect(-2, -2.5, L, 5); ctx.fillRect(-2, -2.5, L, 5); ctx.restore();
    }
    ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, TAU); ctx.lineWidth = 5; ctx.strokeStyle = '#000'; ctx.stroke(); ctx.fillStyle = h.hurtT > 0 ? '#ff9c9c' : '#f2efe9'; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#e8a317'; ctx.stroke();
    ctx.fillStyle = '#14161a'; ctx.beginPath(); ctx.arc(h.x + cos(h.facing) * 5, h.y + sin(h.facing) * 5, 3, 0, TAU); ctx.fill();
    // player marker
    ctx.fillStyle = '#e8a317'; ctx.beginPath(); ctx.moveTo(h.x, h.y - h.r - 14); ctx.lineTo(h.x - 5, h.y - h.r - 22); ctx.lineTo(h.x + 5, h.y - h.r - 22); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  }
  function makeBg() {
    bgCanvas = document.createElement('canvas'); bgCanvas.width = W; bgCanvas.height = H;
    var c = bgCanvas.getContext('2d'), g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#171a1f'); g.addColorStop(1, '#101215'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(255,255,255,.04)'; c.lineWidth = 1;
    for (var x = 0; x <= W; x += 60) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
    for (var y = 0; y <= H; y += 60) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    c.strokeStyle = 'rgba(232,163,23,.35)'; c.lineWidth = 4; c.strokeRect(2, 2, W - 4, H - 4);
  }
  function bar(x, y, w, h, k, col, bg) { ctx.fillStyle = bg || '#000'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2); ctx.fillStyle = col; ctx.fillRect(x, y, w * max(0, min(1, k)), h); }
  function txt(s, x, y, size, col, al) { ctx.font = '800 ' + size + 'px system-ui,Segoe UI,Roboto,sans-serif'; ctx.textAlign = al || 'left'; ctx.fillStyle = '#000'; ctx.fillText(s, x + 1.5, y + 1.5); ctx.fillStyle = col; ctx.fillText(s, x, y); }
  function drawHud() {
    bar(14, 12, 210, 18, hero.hp / hero.maxHp, '#c0392b', '#14161a'); txt(Math.ceil(hero.hp) + '/' + hero.maxHp, 20, 27, 14, '#fff');
    bar(14, 36, 210, 9, S.xp / C.xpNeed(S.level), '#4caf50', '#14161a'); txt('LV ' + S.level, 230, 46, 13, '#9be59f');
    txt('WAVE ' + S.wave + '/' + C.WAVES, W / 2 + 20, 24, 18, '#f2efe9', 'center');
    var tl = max(0, S.waveLen - S.waveT);
    txt(S.wave === C.WAVES && S.boss ? 'BOSS' : Math.ceil(tl) + 's', W / 2 + 20, 50, 22, tl < 5 ? '#ff6b6b' : '#e8a317', 'center');
    ctx.fillStyle = 'rgba(31,34,39,.9)'; ctx.fillRect(W - 50, 10, 38, 38); ctx.strokeStyle = '#f2efe9'; ctx.lineWidth = 2; ctx.strokeRect(W - 50, 10, 38, 38);
    ctx.fillStyle = '#f2efe9'; ctx.fillRect(W - 40, 19, 6, 20); ctx.fillRect(W - 28, 19, 6, 20);
    txt('$' + S.cash, W - 14, 74, 18, '#6fe07a', 'right'); if (S.gold > 0) txt('G ' + S.gold, W - 14, 96, 15, '#ffd23f', 'right');
    if (S.boss) {
      bar(40, 66, W - 80, 14, S.boss.hp / S.boss.maxHp, '#b3202a', '#14161a');
      txt(S.boss.def.name, W / 2, 62, 13, '#f2efe9', 'center');
    }
    if (S.hintT > 0 && S.wave === 1) { ctx.globalAlpha = min(1, S.hintT); txt('Drag on the left half / WASD to move. Guns auto-fire.', W / 2, H - 40, 15, '#f2efe9', 'center'); ctx.globalAlpha = 1; }
    if (S.phase === 'ending') { ctx.globalAlpha = 0.55; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; txt('YOU WENT DOWN', W / 2, H / 2, 38, '#ff6b6b', 'center'); }
    if (S.phase === 'won') txt('VICTORY!', W / 2, H / 2 - 80, 44, '#e8a317', 'center');
    if (S.toastT > 0) { S.toastT -= 1 / 60; txt('LEVEL UP!', hero.x, hero.y - 40 - (1.2 - S.toastT) * 20, 18, '#9be59f', 'center'); }
    if (joy.on) {
      ctx.globalAlpha = 0.35; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(joy.bx, joy.by, 56, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.arc(joy.tx, joy.ty, 26, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    }
  }
  function draw() {
    var c = ctx; c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(bgCanvas, 0, 0);
    c.save();
    if (S.shake > 0) c.translate(rr(-S.shake, S.shake) * 0.5, rr(-S.shake, S.shake) * 0.5);
    var pup = usePuppet(), i;
    // rain
    c.strokeStyle = 'rgba(160,190,230,.10)'; c.lineWidth = 1; c.beginPath();
    for (i = 0; i < 36; i++) { var rx = (i * 97 + S.tickT * 60) % W, ry = (i * 211 + S.tickT * 700) % H; c.moveTo(rx, ry); c.lineTo(rx - 4, ry + 16); }
    c.stroke();
    // warnings
    for (i = 0; i < warns.length; i++) {
      var w = warns[i]; if (!w.active) continue;
      var col = C.ENEMIES[w.kind].color, pr = 1 - w.t / C.SPAWN_WARN, rad = 10 + (C.ENEMIES[w.kind].r) * 0.5;
      c.globalAlpha = 0.5 + 0.5 * ((S.tickT * 8 | 0) & 1); c.strokeStyle = col; c.lineWidth = 3; c.beginPath(); c.arc(w.x, w.y, rad + 6 * (1 - pr), 0, TAU); c.stroke();
      c.fillStyle = col; c.font = '800 14px system-ui'; c.textAlign = 'center'; c.fillText('!', w.x, w.y + 5); c.globalAlpha = 1;
    }
    // pickups
    for (i = 0; i < pickups.length; i++) {
      var p = pickups[i]; if (!p.active) continue;
      if (p.gold) { c.fillStyle = '#000'; c.fillRect(p.x - 9, p.y - 5, 18, 10); c.fillStyle = '#ffd23f'; c.fillRect(p.x - 7, p.y - 3, 14, 6); c.fillStyle = '#fff6c2'; c.fillRect(p.x - 6, p.y - 2, 8, 2); }
      else { var big = p.v >= 5, pw = big ? 14 : 10, ph = big ? 9 : 6; c.fillStyle = '#000'; c.fillRect(p.x - pw / 2 - 1.5, p.y - ph / 2 - 1.5, pw + 3, ph + 3); c.fillStyle = big ? '#7dff8a' : '#4caf50'; c.fillRect(p.x - pw / 2, p.y - ph / 2, pw, ph); }
    }
    for (i = 0; i < enemies.length; i++) { var e = enemies[i]; if (e.active && !e.boss) drawEnemy(e, pup); }
    for (i = 0; i < enemies.length; i++) { var e2 = enemies[i]; if (e2.active && e2.boss) drawEnemy(e2, pup); }
    drawHero(pup);
    for (i = 0; i < bullets.length; i++) {
      var b = bullets[i]; if (!b.active) continue;
      c.beginPath(); c.arc(b.x, b.y, b.r + 1.5, 0, TAU); c.fillStyle = '#000'; c.fill();
      c.beginPath(); c.arc(b.x, b.y, b.r, 0, TAU); c.fillStyle = b.color; c.fill();
    }
    if (G.fx) G.fx.draw(c);
    c.restore();
    if (S.flash > 0) { c.globalAlpha = S.flash; c.fillStyle = '#b3202a'; c.fillRect(0, 0, W, H); c.globalAlpha = 1; }
    drawHud();
  }

  // ---------------- input ----------------
  function toCanvas(ev) { var r = cv.getBoundingClientRect(); return [(ev.clientX - r.left) / r.width * W, (ev.clientY - r.top) / r.height * H]; }
  function on(target, type, fn, opt) { target.addEventListener(type, fn, opt); listeners.push([target, type, fn, opt]); }
  function bindInput() {
    cv.style.touchAction = 'none';
    on(cv, 'pointerdown', function (ev) {
      var p = toCanvas(ev);
      if (S.phase !== 'fight') return;
      if (p[0] > W - 58 && p[1] < 58) { pause(); ev.preventDefault(); return; }
      if (p[0] < W / 2 && !joy.on) {
        joy.on = true; joy.id = ev.pointerId; joy.bx = joy.tx = p[0]; joy.by = joy.ty = p[1]; joy.dx = joy.dy = 0;
        try { cv.setPointerCapture(ev.pointerId); } catch (e) {} ev.preventDefault();
      }
    });
    on(cv, 'pointermove', function (ev) {
      if (!joy.on || ev.pointerId !== joy.id) return;
      var p = toCanvas(ev), dx = p[0] - joy.bx, dy = p[1] - joy.by, d = sqrt(dx * dx + dy * dy), R = 56;
      if (d > R) { joy.bx += dx / d * (d - R); joy.by += dy / d * (d - R); dx = p[0] - joy.bx; dy = p[1] - joy.by; d = R; }
      joy.tx = p[0]; joy.ty = p[1]; var k = min(1, d / R); joy.dx = d > 6 ? dx / d * k : 0; joy.dy = d > 6 ? dy / d * k : 0; ev.preventDefault();
    });
    var up = function (ev) { if (joy.on && ev.pointerId === joy.id) { joy.on = false; joy.dx = joy.dy = 0; } };
    on(cv, 'pointerup', up); on(cv, 'pointercancel', up); on(cv, 'lostpointercapture', up);
    on(window, 'keydown', function (ev) {
      keys[ev.code] = true;
      if (ev.code === 'Escape' || ev.code === 'KeyP') { if (paused) resume(); else pause(); }
      if (/^(Arrow|Space)/.test(ev.code)) ev.preventDefault();
    });
    on(window, 'keyup', function (ev) { keys[ev.code] = false; });
    on(window, 'blur', function () { keys = {}; joy.on = false; joy.dx = joy.dy = 0; });
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
    makePools(); newRun(); makeBg(); keys = {}; joy.on = false; paused = false; acc = 0;
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
    paused = true; joy.on = false; joy.dx = joy.dy = 0;
    G.arenaUI.showPause({ resume: resume, quit: function () { S.result = { win: false, wave: S.wave, kills: S.kills, bossDown: S.bossDown }; finishRun(); } });
  }
  function resume() {
    if (!running || !paused) return;
    paused = false; acc = 0; lastTs = performance.now(); G.arenaUI.hide();
  }

  G.arena = { start: start, stop: stop, pause: pause, resume: resume, state: pub, isPaused: function () { return paused; } };

  // ---------------- test hooks ----------------
  window.__arenaTest = {
    spawn: function (kind, n) {
      n = n || 1; var c = 0;
      for (var i = 0; i < n; i++) {
        var p = edgePoint(), e = spawnEnemy(kind, rr(30, W - 30), rr(100, H - 30), false);
        if (e) c++;
      }
      return c;
    },
    skipWave: function () { if (S && S.phase === 'fight') { if (S.wave >= C.WAVES) { S.waveT = S.waveLen; } endWave(); } },
    giveCash: function (n) { if (S) S.cash += n; },
    setSeed: function (n) { seed = n >>> 0; },
    step: function (n) { for (var i = 0; i < n && running; i++) update(DT); syncPub(); },
    setInput: function (dx, dy) { testMove = dx == null ? null : [dx, dy]; },
    god: function (b) { god = !!b; },
    render: function () { draw(); },
    fireBullets: function (n) { for (var i = 0; i < n; i++) { var b = newBullet(); if (!b) break; var a = rnd() * TAU; b.active = true; b.friendly = false; b.x = rr(0, W); b.y = rr(0, H); b.vx = cos(a) * 60; b.vy = sin(a) * 60; b.r = 5; b.dmg = 0; b.life = 30; b.color = '#ff2d6f'; b.pierce = 0; b.splash = 0; b.hitN = 0; } },
    snapshot: function () {
      var es = [], ps = [], bs = [], i;
      for (i = 0; i < enemies.length; i++) { var e = enemies[i]; if (e.active) es.push({ x: e.x, y: e.y, r: e.r, kind: e.kind, hp: e.hp, boss: e.boss }); }
      for (i = 0; i < pickups.length; i++) if (pickups[i].active) ps.push({ x: pickups[i].x, y: pickups[i].y, gold: pickups[i].gold });
      for (i = 0; i < bullets.length; i++) if (bullets[i].active && !bullets[i].friendly) bs.push({ x: bullets[i].x, y: bullets[i].y, vx: bullets[i].vx, vy: bullets[i].vy });
      return { hero: { x: hero.x, y: hero.y, hp: hero.hp, maxHp: hero.maxHp, r: hero.r }, enemies: es, pickups: ps, bullets: bs, phase: S.phase, wave: S.wave, cash: S.cash, weapons: S.weapons.map(function (w) { return w && { id: w.id, tier: w.tier }; }), stats: S.st, bag: S.bag, offers: S.offers };
    },
    internals: function () { return { S: S, hero: hero, enemies: enemies, pickups: pickups }; }
  };
})();
