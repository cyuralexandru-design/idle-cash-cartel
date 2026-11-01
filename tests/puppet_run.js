// Run: node tests/puppet_run.js  -> writes tests/puppet_grid_<kind>.png, puppet_strip_<kind>.png and prints errors
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const root = path.resolve(__dirname, '..');
const PORT = 8300 + Math.floor(Math.random() * 500);
const KINDS = (process.argv[2] ? process.argv[2].split(',') : ['hero', 'thug_knife', 'thug_bat', 'gunman_smg', 'bruiser_shotgun', 'boss_leader', 'sniper_ghillie', 'molotov_thrower', 'riot_shield', 'drone_operator', 'mini_boss', 'attack_dog', 'extra_1']);
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: root, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://localhost:${PORT}/tests/puppet_test.html`);
  await page.waitForFunction('window.__ready === true', null, { timeout: 30000 });
  for (const k of KINDS) {
    await page.evaluate(k => renderGrid(k, null), k);
    await page.locator('#cv').screenshot({ path: path.join(__dirname, `puppet_grid_${k}.png`) });
    await page.evaluate(k => renderStrip(k, null), k);
    await page.locator('#cv').screenshot({ path: path.join(__dirname, `puppet_strip_${k}.png`) });
  }
  for (const w of ['smg', 'sniper', 'pump_shotgun']) {
    await page.evaluate(w => renderGrid('hero', w), w);
    await page.locator('#cv').screenshot({ path: path.join(__dirname, `puppet_grid_hero_${w}.png`) });
  }
  console.log('errors:', errors.length, errors.slice(0, 5));
  await browser.close(); srv.kill();
})();
