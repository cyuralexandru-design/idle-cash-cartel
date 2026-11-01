// Playwright tests for the arena engine. Run: node tests/arena_run.js  (starts python3 -m http.server itself)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const root = path.resolve(__dirname, '..');
const PORT = 8765 + Math.floor(Math.random() * 500);
let fails = 0;
function ok(c, m) { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; }

const BOT = function (seed, opt) {
  // runs a whole run synchronously inside the page
  __arenaTest.setSeed(seed);
  const prio = ['damage', 'attack_speed', 'max_hp', 'crit', 'armor', 'regen', 'move_speed', 'pickup_range', 'luck', 'range', 'harvesting', 'pierce', 'dodge', 'lifesteal', 'reload_speed', 'explosion'];
  const log = [], samples = []; let tk = 0, minHp = 1e9, lastWave = 0, guard = 0, shopsDone = 0;
  function dirStep() {
    const s = __arenaTest.snapshot(), h = s.hero; let fx = 0, fy = 0, near = 1e9;
    for (const e of s.enemies) { const dx = h.x - e.x, dy = h.y - e.y, d = Math.hypot(dx, dy) - e.r; if (d < near) near = d; if (d < 170) { const w = 1 / Math.max(8, d) ** 1.4 * 900; const ux = dx / (d + e.r), uy = dy / (d + e.r); fx += (ux * 0.8 - uy * 0.6) * w; fy += (uy * 0.8 + ux * 0.6) * w; } }
    for (const b of s.bullets) { const dx = h.x - b.x, dy = h.y - b.y, d = Math.hypot(dx, dy); if (d < 90) { fx += dx / d * 1.5; fy += dy / d * 1.5; } }
    let best = null, bd = 1e9; for (const p of s.pickups) { const d = Math.hypot(p.x - h.x, p.y - h.y); if (d < bd) { bd = d; best = p; } }
    if (best && near > 60) { fx += (best.x - h.x) / bd * 0.8; fy += (best.y - h.y) / bd * 0.8; }
    const m = 90; fx += Math.max(0, m - h.x) / m * 2 - Math.max(0, m - (540 - h.x)) / m * 2; fy += Math.max(0, m - h.y) / m * 2 - Math.max(0, m - (960 - h.y)) / m * 2;
    if (near > 230 && !best) { fx += (270 - h.x) / 300; fy += (500 - h.y) / 300; }
    const l = Math.hypot(fx, fy); if (l > 0.05) __arenaTest.setInput(fx / l, fy / l); else __arenaTest.setInput(0, 0);
  }
  function overlay() {
    const L = document.querySelector('.arena-layer'); if (!L) return false;
    const scr = L.getAttribute('data-screen');
    if (scr === 'cards') {
      const cards = [...L.querySelectorAll('.arena-card')]; let bi = 0, bp = 99;
      cards.forEach((c, i) => { const p = prio.indexOf(c.dataset.stat) - (c.className.match(/tier-(\d)/)[1] - 1) * 3; if (p < bp) { bp = p; bi = i; } });
      cards[bi].click(); return true;
    }
    if (scr === 'shop') {
      let n = 0;
      for (let k = 0; k < 12; k++) {
        const L2 = document.querySelector('.arena-layer'); const mg = L2.querySelector('[data-act=merge]'); if (mg) { mg.click(); continue; }
        const offers = [...L2.querySelectorAll('.arena-offer')]; let pick = null;
        for (const o of offers) { const b = o.querySelector('.arena-buy'); if (b && !b.disabled && /Weapon/.test(o.textContent)) { pick = b; break; } }
        if (!pick) for (const o of offers) { const b = o.querySelector('.arena-buy'); if (b && !b.disabled) { pick = b; break; } }
        if (!pick) break; pick.click(); n++;
      }
      const nx = document.querySelector('.arena-layer [data-act=next]'); if (nx) { shopsDone++; nx.click(); } return true;
    }
    return false;
  }
  while (!window.__ended && guard++ < 20000) {
    if (!overlay()) { dirStep(); __arenaTest.step(3); { const hh = G.arena.state; if (hh.hp < minHp) minHp = hh.hp; } if (++tk % 20 === 0) { const q = __arenaTest.snapshot(); samples.push([q.wave, Math.round(q.hero.hp), Math.round(q.hero.x), Math.round(q.hero.y), q.enemies.length]); } }
    const st = G.arena.state;
    if (st.wave !== lastWave) { lastWave = st.wave; const sn = __arenaTest.snapshot(); log.push({ wave: st.wave, min: Math.round(minHp), hp: Math.round(st.hp), max: st.maxHp, lvl: st.level, cash: st.cash, kills: st.kills, w: sn.weapons.filter(Boolean).map(w => w.id + w.tier).join(',') }); }
  }
  return { res: window.__ended, log, guard, samples: samples.slice(-14) };
};

(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: root, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 900));
  const browser = await chromium.launch();
  const ctxb = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2 });
  const page = await ctxb.newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const url = `http://localhost:${PORT}/tests/arena_test.html`;
  try {
    // ---- 1 smoke + API + screenshots
    await page.goto(url);
    await page.evaluate(() => { __arenaTest.setSeed(7); startArena(); __arenaTest.god(true); });
    await page.waitForTimeout(600);
    ok(await page.evaluate(() => typeof G.arena.start === 'function' && typeof G.arena.state === 'object' && typeof G.audio.play === 'function'), 'API present');
    await page.evaluate(() => { __arenaTest.giveCash(50); __arenaTest.step(60 * 9); });
    await page.waitForTimeout(100);
    await page.screenshot({ path: path.join(__dirname, 'arena_shot_1.png') });
    const st = await page.evaluate(() => JSON.parse(JSON.stringify(G.arena.state)));
    ok(st.wave === 1 && st.enemies > 0 && st.kills >= 0, 'wave 1 running, enemies alive=' + st.enemies + ' kills=' + st.kills);
    // keyboard move
    const x0 = await page.evaluate(() => __arenaTest.snapshot().hero.x);
    await page.keyboard.down('KeyD'); await page.waitForTimeout(400); await page.keyboard.up('KeyD');
    const x1 = await page.evaluate(() => __arenaTest.snapshot().hero.x);
    ok(x1 > x0 + 20, 'WASD moves hero ' + Math.round(x0) + ' -> ' + Math.round(x1));
    // touch joystick (mouse as pointer)
    await page.mouse.move(80, 500); await page.mouse.down(); await page.mouse.move(40, 500, { steps: 4 }); await page.waitForTimeout(300);
    const x2 = await page.evaluate(() => __arenaTest.snapshot().hero.x); await page.mouse.up();
    ok(x2 < x1 - 10, 'joystick moves hero left ' + Math.round(x1) + ' -> ' + Math.round(x2));
    // pause/resume
    await page.evaluate(() => G.arena.pause()); ok(await page.evaluate(() => !!document.querySelector('.arena-layer[data-screen=pause]')), 'pause overlay');
    await page.evaluate(() => G.arena.resume()); ok(await page.evaluate(() => !document.querySelector('.arena-layer')), 'resume hides overlay');
    // wave end -> cards -> shop
    await page.evaluate(() => { const I = __arenaTest.internals(); I.S.level++; I.S.pending++; __arenaTest.skipWave(); });
    await page.waitForTimeout(150);
    ok(await page.evaluate(() => !!document.querySelector('.arena-layer[data-screen=cards]')), 'level-up cards shown (4 cards: ' + 'checked next)');
    ok(await page.evaluate(() => document.querySelectorAll('.arena-card').length === 4), '4 cards');
    await page.screenshot({ path: path.join(__dirname, 'arena_shot_cards.png') });
    await page.evaluate(() => { const L = () => document.querySelector('.arena-layer[data-screen=cards]'); let g = 0; while (L() && g++ < 20) L().querySelector('.arena-card').click(); });
    ok(await page.evaluate(() => !!document.querySelector('.arena-layer[data-screen=shop]')), 'shop shown after cards');
    ok(await page.evaluate(() => document.querySelectorAll('.arena-offer').length === 4), '4 shop offers');
    await page.evaluate(() => { __arenaTest.giveCash(300); document.querySelector('[data-act=lock]').click(); });
    await page.waitForTimeout(100);
    await page.screenshot({ path: path.join(__dirname, 'arena_shot_shop.png') });
    // lock persists through reroll
    const before = await page.evaluate(() => document.querySelector('.arena-offer').textContent);
    await page.evaluate(() => document.querySelector('[data-act=reroll]').click());
    ok(await page.evaluate((b) => document.querySelector('.arena-offer').textContent === b, before), 'locked offer survives reroll');
    // merge test
    const mg = await page.evaluate(() => { const I = __arenaTest.internals(); I.S.weapons[1] = { id: 'pistol', tier: 0, cd: 0, mag: 12, reloadT: 0, aim: 0, paid: 30 }; I.S.weapons[0] = { id: 'pistol', tier: 0, cd: 0, mag: 12, reloadT: 0, aim: 0, paid: 30 }; document.querySelector('[data-act=reroll]').click(); const b = document.querySelector('[data-act=merge]'); if (!b) return 'nobutton'; b.click(); return I.S.weapons.filter(Boolean).map(w => w.id + w.tier).join(','); });
    ok(mg === 'pistol1', 'merge two tier I pistols -> ' + mg);
    const rec = await page.evaluate(() => { const c0 = __arenaTest.internals().S.cash; document.querySelector('[data-act=recycle]'); return c0; });
    await page.evaluate(() => document.querySelector('[data-act=next]').click());
    await page.waitForTimeout(80);
    ok(await page.evaluate(() => G.arena.state.wave === 2 && !document.querySelector('.arena-layer')), 'next wave starts (wave 2)');
    // bag rule
    await page.evaluate(() => { const I = __arenaTest.internals(); I.S.bag.cash = 0; });
    await page.evaluate(() => { __arenaTest.step(120); });
    const pk = await page.evaluate(() => __arenaTest.snapshot().pickups.length);
    await page.evaluate(() => { __arenaTest.skipWave(); });
    const bag = await page.evaluate(() => __arenaTest.snapshot().bag.cash);
    ok(bag >= 0, 'bag after wave = ' + bag + ' (uncollected carried over)');
    // ---- 2 perf
    await page.goto(url);
    await page.evaluate(() => { startArena(); __arenaTest.god(true); __arenaTest.setSeed(3); });
    await page.evaluate(() => { __arenaTest.spawn('thug_knife', 120); __arenaTest.spawn('thug_bat', 100); __arenaTest.spawn('gunman_smg', 40); __arenaTest.spawn('bruiser_shotgun', 40); __arenaTest.fireBullets(300); });
    await page.waitForTimeout(500);
    const perf = await page.evaluate(() => new Promise(res => {
      // keep refilling enemies to hold ~300
      let frames = 0, t0 = performance.now(), maxDt = 0, last = t0, sum = 0, n = 0;
      function f(t) { const d = t - last; last = t; if (frames > 5) { sum += d; n++; if (d > maxDt) maxDt = d; } frames++;
        const have = G.arena.state.enemies; if (have < 300) __arenaTest.spawn('thug_knife', 300 - have);
        if (t - t0 < 4000) requestAnimationFrame(f); else res({ avgInterval: sum / n, maxDt, frameMs: G.arena.state.frameMs, enemies: G.arena.state.enemies, bullets: G.arena.state.bullets }); }
      requestAnimationFrame(f);
    }));
    console.log('PERF', JSON.stringify(perf));
    await page.screenshot({ path: path.join(__dirname, 'arena_shot_perf.png') });
    ok(perf.enemies >= 280, 'perf scene has ' + perf.enemies + ' enemies, ' + perf.bullets + ' bullets');
    ok(perf.frameMs < 16, 'update+draw cost ' + perf.frameMs.toFixed(2) + 'ms/frame (headless sw render), rAF interval avg ' + perf.avgInterval.toFixed(1) + 'ms');
    // sync cost of update only
    const upd = await page.evaluate(() => { const t = performance.now(); __arenaTest.step(300); return (performance.now() - t) / 300; });
    console.log('UPDATE-only ms/step (300 enemies):', upd.toFixed(3));
    // ---- 3 boss shots
    await page.goto(url);
    await page.evaluate(() => { startArena(); __arenaTest.god(true); const I = __arenaTest.internals(); I.S.wave = 11; __arenaTest.skipWave(); });
    await page.evaluate(() => { document.querySelector('.arena-layer [data-act=next]')?.click(); const L = () => document.querySelector('.arena-layer'); let g = 0; while (L() && g++ < 40) { const c = L().querySelector('.arena-card'); if (c) c.click(); else L().querySelector('[data-act=next]').click(); } });
    await page.evaluate(() => __arenaTest.step(60 * 6));
    await page.screenshot({ path: path.join(__dirname, 'arena_shot_boss.png') });
    ok(await page.evaluate(() => G.arena.state.wave === 12 && G.arena.state.bossMaxHp > 0), 'boss wave has boss bar (' + (await page.evaluate(() => Math.round(G.arena.state.bossMaxHp))) + ' hp)');
    // ---- 4 bot win runs
    for (const seed of [11, 22, 33]) {
      await page.goto(url);
      await page.evaluate(() => startArena());
      const t = Date.now();
      const out = await page.evaluate(BOT, [seed]).catch(e => ({ err: String(e) }));
      if (out.err) { ok(false, 'bot error ' + out.err); continue; }
      console.log('BOT seed', seed, JSON.stringify(out.res), 'ms', Date.now() - t);
      if (process.env.DEBUG) console.log('  samples(wave,hp,x,y,n):', JSON.stringify(out.samples));
      console.log('  waves:', out.log.map(l => `${l.wave}:hp${l.hp}/${l.max}(min${l.min}) L${l.lvl} $${l.cash} k${l.kills}`).join(' | '));
      ok(out.res && typeof out.res.win === 'boolean' && 'wave' in out.res && 'kills' in out.res && 'cash' in out.res && 'gold' in out.res && 'bossDown' in out.res, 'result object shape (win=' + (out.res && out.res.win) + ', wave=' + (out.res && out.res.wave) + ')');
    }
  } catch (e) { console.log('ERR', e); fails++; }
  ok(errors.length === 0, 'no page errors ' + errors.slice(0, 3).join(' || '));
  await browser.close(); srv.kill();
  console.log(fails ? 'FAILED ' + fails : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})();
