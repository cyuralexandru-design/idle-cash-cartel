// node tests/economy_test.js
var path = require('path'), assert = require('assert');
var store = {};
global.window = global;
global.localStorage = { getItem: function (k) { return k in store ? store[k] : null; }, setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; } };
global.G = undefined; window.G = {};
['config', 'save', 'economy'].forEach(function (m) { require(path.join(__dirname, '..', 'src', m + '.js')); });
var E = G.economy, S = function () { return G.save.state; };
var t = 0; function test(n, f) { try { G.save.reset(); f(); t++; console.log('ok  ' + n); } catch (e) { console.log('FAIL ' + n + ': ' + e.message); process.exitCode = 1; } }
function near(a, b, eps) { assert(Math.abs(a - b) <= (eps || 1e-6) * Math.max(1, Math.abs(b)), a + ' != ' + b); }

test('bulk cost geometric', function () {
  var d = G.config.businesses[0], g = d.growth, sum = 0;
  S().businesses.pub.level = 3;
  for (var i = 0; i < 10; i++) sum += d.baseCost * Math.pow(g, 3 + i);
  near(E.costNext('pub', 10), sum); near(E.costNext('pub', 1), d.baseCost * Math.pow(g, 3));
  var s100 = 0; for (i = 0; i < 100; i++) s100 += d.baseCost * Math.pow(g, 3 + i);
  near(E.costNext('pub', 100), s100);
});
test('buy x1/x10/max and max exactness', function () {
  S().cash = 1e6; S().businesses.pub.level = 0;
  assert.strictEqual(E.buy('pub', 10), 10); assert.strictEqual(S().businesses.pub.level, 10);
  S().cash = 5000; var n = E.maxAffordable('pub'); var c = E.costNext('pub', n);
  assert(c <= 5000); assert(E.costNext('pub', n + 1) > 5000);
  assert.strictEqual(E.buy('pub', 'max'), n);
  S().cash = 0; assert.strictEqual(E.buy('pub', 1), 0);
});
test('locked until previous owned', function () {
  S().cash = 1e9; assert.strictEqual(E.buy('bookmaker', 1), 0);
  E.buy('pub', 1); assert.strictEqual(E.buy('bookmaker', 1), 1);
});
test('milestone multiplier', function () {
  assert.strictEqual(E.milestoneMult(24), 1); assert.strictEqual(E.milestoneMult(25), 2);
  assert.strictEqual(E.milestoneMult(50), 4); assert.strictEqual(E.milestoneMult(100), 8);
  assert.strictEqual(E.milestoneMult(400), 64);
  S().businesses.pub.level = 25; near(E.incomePerSec(), 25 * G.config.businesses[0].baseIncome * 2);
});
test('manual collect cap 60s and manager auto', function () {
  S().cash = 0; S().businesses.pub.level = 10; var inc = E.incomePerSec();
  E.tick(1000); near(E.collect('pub'), inc * 60); near(S().cash, inc * 60);
  S().cash = 1e6; assert(E.hireManager('pub')); var c0 = S().cash; E.tick(10); near(S().cash - c0, inc * 10);
  assert.strictEqual(E.collect('pub'), 0);
});
test('offline cap 8h', function () {
  var b = S().businesses.pub; b.level = 10; b.manager = true; var inc = E.incomePerSec();
  var now = 1e12; S().lastSeen = now - 20 * 3600 * 1000;
  var r = E.offlineEarnings(now); assert(r.capped); assert.strictEqual(r.seconds, 8 * 3600); near(r.cash, inc * 8 * 3600);
  E.setClock(function () { return now; }); var c0 = S().cash; var cl = E.claimOffline(2); near(S().cash - c0, inc * 8 * 3600 * 2); E.setClock();
  assert.strictEqual(E.offlineEarnings(now).cash, 0);
});
test('raid result', function () {
  S().businesses.pub.level = 10;
  var r = E.applyRaidResult({ win: true, wave: 20, kills: 100, cash: 100, gold: 0, bossDown: true });
  assert(r.gold >= 45 && r.cash > 100 && r.gems === 20); assert.strictEqual(S().stats.bestWave, 20);
});
test('perm/weapon/boost', function () {
  S().gold = 1e5; assert(E.buyPerm('damage')); near(E.getPermBonuses().damage, 0.04);
  assert(E.unlockWeapon('smg')); assert(E.buyWeaponLevel('smg')); assert.strictEqual(S().weapons.smg.level, 2);
  S().gems = 20; assert(E.activateBoost('incomeX2_gems').ok); assert(E.boostActive());
  assert(E.activateBoost('incomeX2_ad').ok); assert.strictEqual(E.activateBoost('x').ok, false);
});
test('snapshot shape', function () {
  var s = E.snapshot(); assert.strictEqual(s.businesses.length, 10); assert.strictEqual(s.perm.length, 16);
  assert.strictEqual(s.businesses[0].state, 'available'); assert.strictEqual(s.businesses[1].state, 'locked');
});
test('save round-trip + export/import', function () {
  S().cash = 123.5; S().businesses.garage.level = 7; G.save.save();
  var raw = store[G.save.KEY]; S().cash = 0; G.save.load(); assert.strictEqual(S().cash, 123.5); assert.strictEqual(S().businesses.garage.level, 7);
  var ex = G.save.exportString(); assert(ex.indexOf('ICC1.') === 0);
  G.save.reset(); assert.strictEqual(S().cash, G.config.start.cash); assert(G.save.importString(ex)); assert.strictEqual(S().businesses.garage.level, 7);
  assert.strictEqual(G.save.importString('garbage'), false);
});
test('migration from unversioned + corrupt + no storage', function () {
  store[G.save.KEY] = JSON.stringify({ cash: 55, businesses: { pub: { level: 4 } } });
  G.save.load(); assert.strictEqual(S().v, 1); assert.strictEqual(S().cash, 55); assert.strictEqual(S().businesses.pub.level, 4); assert.strictEqual(S().businesses.pub.manager, false); assert.strictEqual(S().perm.damage, 0);
  store[G.save.KEY] = '{bad'; G.save.load(); assert.strictEqual(S().v, 1);
  var ls = global.localStorage; global.localStorage = { getItem: function () { throw 1; }, setItem: function () { throw 1; }, removeItem: function () { throw 1; } };
  G.save.load(); S().cash = 9; assert.doesNotThrow(function () { G.save.save(); }); global.localStorage = ls;
});
console.log(t + ' passed');
