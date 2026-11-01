// Run: node tests/puppet_arena_run.js  -> arena with puppet rendering: errors, usage check, frame cost (puppet vs fallback shapes)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const root = path.resolve(__dirname, '..');
const PORT = 8800 + Math.floor(Math.random() * 500);
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: root, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
  const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://localhost:${PORT}/tests/puppet_arena.html`);
  await page.waitForFunction('G.puppet.ready()', null, { timeout: 30000 });
  await page.evaluate(() => { window.__draws = 0; const d = G.puppet.draw; G.puppet.draw = function (c, a) { window.__draws++; return d(c, a); }; startArena(); __arenaTest.god(true); __arenaTest.setSeed(5); });
  await page.evaluate(() => { __arenaTest.spawn('thug_knife', 30); __arenaTest.spawn('thug_bat', 25); __arenaTest.spawn('gunman_smg', 25); __arenaTest.spawn('bruiser_shotgun', 15); __arenaTest.spawn('mini_boss', 1); __arenaTest.spawn('boss_leader', 1); __arenaTest.step(90); });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(__dirname, 'puppet_arena_shot.png') });
  const measure = () => page.evaluate(() => new Promise(res => { let n = 0, sum = 0; (function f() { const h = G.arena.state.frameMs; if (h) { sum += h; n++; } if (n < 150) requestAnimationFrame(f); else res({ ms: sum / n, enemies: G.arena.state.enemies }); })(); }));
  const withP = await measure();
  await page.evaluate(() => { window.__r = G.puppet.ready; G.puppet.ready = () => false; });
  const without = await measure();
  await page.evaluate(() => { G.puppet.ready = window.__r; });
  const draws = await page.evaluate(() => window.__draws);
  console.log('puppet draw calls', draws, 'frameMs puppet', withP.ms.toFixed(2), 'fallback shapes', without.ms.toFixed(2), 'enemies', withP.enemies);
  // direct micro-benchmark of G.puppet.draw
  const bench = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 540; c.height = 960; const x = c.getContext('2d'); const ks = ['thug_knife', 'thug_bat', 'gunman_smg', 'bruiser_shotgun', 'hero', 'sniper_ghillie']; const a = { kind: '', x: 0, y: 0, facing: 0, moving: true, speed: 1, state: 'walk', t: 0, animT: 0, weaponId: null, scale: 1 }; const d = G.puppet.draw; for (let i = 0; i < 300; i++) { a.kind = ks[i % 6]; a.x = i % 500; a.y = 100 + i; a.facing = i * 0.7; a.animT = i; d(x, a); } const t = performance.now(); const N = 3000; for (let i = 0; i < N; i++) { a.kind = ks[i % 6]; a.x = 20 + (i * 7) % 500; a.y = 100 + (i * 3) % 800; a.facing = i * 0.37; a.animT = i * 0.05; a.state = i % 9 === 0 ? 'shoot' : 'walk'; a.t = 0.05; d(x, a); } return (performance.now() - t) / N; });
  console.log('draw avg ms/call', bench.toFixed(4));
  console.log('errors:', errors.length, errors.slice(0, 5));
  await browser.close(); srv.kill();
})();
