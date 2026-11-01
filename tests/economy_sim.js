// node tests/economy_sim.js [hours=100]  -- balance simulator (bot plays continuously, perfect collection)
var path = require('path');
var store = {}; global.window = global;
global.localStorage = { getItem: function (k) { return k in store ? store[k] : null; }, setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; } };
window.G = {};
['config', 'save', 'economy'].forEach(function (m) { require(path.join(__dirname, '..', 'src', m + '.js')); });
var E = G.economy, C = G.config, S = function () { return G.save.state; };
var HOURS = +process.argv[2] || 100, DT = 1, RAID = C.sim.raidEverySec, COLLECT = 20;
G.save.reset();
var t = 0, fake = 1e12; E.setClock(function () { return fake + t * 1000; });
var unlock = {}, lastBuy = 0, maxGap = 0, gapAt = 0, lastProg = 0, maxProg = 0, progAt = 0, walls = [], manHired = {}, ms = {}, snaps = {};
var permTotal = function () { var n = 0; for (var k in S().perm) n += S().perm[k]; return n; };
function power() {
  var best = 0, w = S().weapons, i = 0;
  C.weapons.list.forEach(function (d, j) { if (w[d.id].owned) best = Math.max(best, (j + 1) * 0.45 + w[d.id].level * 0.2); });
  return 2 + permTotal() / 6 + best;
}
function buyEvent(prog) {
  var g = t - lastBuy; if (g > maxGap) { maxGap = g; gapAt = lastBuy; } if (g > 2700) walls.push([lastBuy, t, 'any']); lastBuy = t;
  if (prog) { var p = t - lastProg; if (p > maxProg) { maxProg = p; progAt = lastProg; } if (p > 2700) walls.push([lastProg, t, 'progress']); lastProg = t; }
}
function bestBiz() {
  var best = null;
  C.businesses.forEach(function (d) {
    if (!E.unlocked(d.id)) return;
    var L = S().businesses[d.id].level, cost = E.costNext(d.id, 1);
    var gain = E.incomeAt(d.id, L + 1) - E.incomeAt(d.id, L), cost1 = cost, ml = C.milestones.levels.filter(function (x) { return x > L; })[0];
    if (ml && ml - L <= 60) { var n = ml - L; cost = E.costNext(d.id, n); gain = E.incomeAt(d.id, ml) - E.incomeAt(d.id, L); cost = Math.min(cost, cost); }
    // value milestones: look ahead to next milestone doubling
    var pb = cost / Math.max(gain, 1e-9);
    if (!best || pb < best.pb) best = { id: d.id, pb: pb, cost: cost1, d: d, L: L };
  });
  return best;
}
function step() {
  if (t % COLLECT === 0) E.collectAll();
  E.tick(DT);
  var s = S(), n = 0;
  // managers: buy when cost <= 40% cash
  C.businesses.forEach(function (d) { var b = s.businesses[d.id]; if (b.level > 0 && !b.manager && s.cash >= d.managerCost && d.managerCost <= s.cash * 0.4 && E.hireManager(d.id)) buyEvent(true); });
  // businesses: target best payback; buy cheaper alternatives only if they pay back before we could afford the target
  for (var k = 0; k < 50; k++) {
    var b = bestBiz(); if (!b) break;
    var nu = C.businesses.filter(function (d) { return E.unlocked(d.id) && S().businesses[d.id].level === 0; })[0];
    if (nu && s.cash >= E.costNext(nu.id, 1)) b = { id: nu.id, L: 0, cost: E.costNext(nu.id, 1), pb: 0 };
    var tgt = b;
    if (s.cash < b.cost) {
      var inc = Math.max(E.passiveIncomePerSec() + E.incomePerSec() * 0, 1e-9) || 1e-9;
      var wait = (b.cost - s.cash) / Math.max(E.incomePerSec(), 1e-9), alt = null;
      C.businesses.forEach(function (d) {
        if (!E.unlocked(d.id)) return; var L = S().businesses[d.id].level, c = E.costNext(d.id, 1);
        if (c > s.cash) return; var pb = c / Math.max(E.incomeAt(d.id, L + 1) - E.incomeAt(d.id, L), 1e-9);
        if (pb < wait && (!alt || pb < alt.pb)) alt = { id: d.id, pb: pb, cost: c, L: L };
      });
      if (!alt) break; tgt = alt;
    }
    var first = tgt.L === 0;
    E.buy(tgt.id, 1);
    var L = tgt.L + 1;
    var prog = first || C.milestones.levels.indexOf(L) >= 0;
    if (first && !(tgt.id in unlock)) { unlock[tgt.id] = t; }
    if (C.milestones.levels.indexOf(L) >= 0) ms[tgt.id + '@' + L] = t;
    buyEvent(prog);
  }
  // gold sinks: cheapest first
  for (k = 0; k < 20; k++) {
    var opts = [];
    C.perm.stats.forEach(function (st) { var c = E.permCost(st.id); if (isFinite(c)) opts.push([c, 'p', st.id]); });
    C.weapons.list.forEach(function (w) { var ws = s.weapons[w.id]; if (!ws.owned) opts.push([w.unlockGold, 'u', w.id]); else { var c = E.weaponLevelCost(w.id); if (isFinite(c)) opts.push([c, 'w', w.id]); } });
    if (!opts.length) break; opts.sort(function (a, b) { return a[0] - b[0]; });
    var o = opts[0]; var hv = opts.filter(function (x) { return x[2] === 'harvesting' && s.gold >= x[0] && x[0] <= o[0] * 3; })[0]; if (hv) o = hv; var wu = opts.filter(function (x) { return x[1] === 'u' && s.gold >= x[0]; })[0]; if (wu) o = wu; if (s.gold < o[0]) break;
    if (o[1] === 'p') E.buyPerm(o[2]); else if (o[1] === 'u') { E.unlockWeapon(o[2]); if (!(o[2] in unlock)) unlock[o[2]] = t; } else E.buyWeaponLevel(o[2]);
    buyEvent(false);
  }
  // raid
  if (t > 0 && t % RAID === 0) {
    var p = power(), wave = Math.max(1, Math.min(C.raid.maxWave, Math.floor(p))), win = p >= 22;
    E.applyRaidResult({ win: win, wave: wave, kills: wave * 12, cash: wave * 20, gold: 0, bossDown: wave >= C.raid.maxWave });
  }
}
var marks = [3600, 36000, 360000].filter(function (m) { return m <= HOURS * 3600; });
for (t = 0; t <= HOURS * 3600; t += DT) {
  step(); if (process.env.TRACE && t % 30 === 0 && t <= 330) console.log(t, S().cash.toFixed(1), E.incomePerSec().toFixed(2), S().businesses.pub.level, S().businesses.bookmaker.level);
  if (marks.indexOf(t) >= 0) snaps[t] = { inc: E.incomePerSec(), cash: S().cash, gold: S().gold, perm: permTotal(), wave: S().stats.bestWave, biz: C.businesses.map(function (d) { return S().businesses[d.id].level; }).join('/') };
}
function f(s) { return s < 3600 ? (s / 60).toFixed(1) + 'm' : (s / 3600).toFixed(2) + 'h'; }
console.log('--- unlock times (first level bought) ---');
C.businesses.forEach(function (d) { console.log(d.id.padEnd(16), d.id in unlock ? f(unlock[d.id]) : 'not reached'); });
console.log('weapons:', C.weapons.list.filter(function (w) { return w.id in unlock; }).map(function (w) { return w.id + '@' + f(unlock[w.id]); }).join(' '));
console.log('--- snapshots ---'); for (var m in snaps) console.log(f(+m), 'inc/s', E.fmt(snaps[m].inc), 'perm', snaps[m].perm, 'bestWave', snaps[m].wave, 'lv', snaps[m].biz);
var pub1 = C.businesses[0]; console.log('pub payback L1->2: ' + (pub1.baseCost * pub1.growth / pub1.baseIncome).toFixed(0) + 's');
console.log('max gap any purchase', f(maxGap), 'at', f(gapAt), '| max gap progress event', f(maxProg), 'at', f(progAt));
console.log('WALLS (>45m between any two purchases):', walls.filter(function (w) { return w[2] === 'any'; }).map(function (w) { return f(w[0]) + '->' + f(w[1]); }).join('; ') || 'none');
if (process.env.TRACE) { }
