// Idle economy. Pure logic, no DOM.
window.G = window.G || {};
(function () {
  'use strict';
  var clock = function () { return Date.now(); };
  var pending = null;   // unclaimed offline result

  function C() { return G.config; }
  function S() { return G.save.state; }
  var byId = {}, idxOf = {};
  C().businesses.forEach(function (b, i) { byId[b.id] = b; idxOf[b.id] = i; });
  function def(id) { return byId[id]; }
  function B(id) { return S().businesses[id]; }
  function lvl(id) { return B(id).level; }

  function milestoneCount(level) {
    var n = 0, L = C().milestones.levels;
    for (var i = 0; i < L.length; i++) if (level >= L[i]) n++;
    return n;
  }
  function milestoneMult(level) { return Math.pow(C().milestones.mult, milestoneCount(level)); }

  function costFor(id, level, n) {
    var d = def(id), g = d.growth;
    return d.baseCost * Math.pow(g, level) * (Math.pow(g, n) - 1) / (g - 1);
  }
  function maxAffordable(id, cash) {
    var d = def(id), g = d.growth, L = lvl(id);
    if (cash === undefined) cash = S().cash;
    var first = d.baseCost * Math.pow(g, L);
    if (cash < first) return 0;
    var n = Math.floor(Math.log(1 + cash * (g - 1) / first) / Math.log(g));
    while (n > 0 && costFor(id, L, n) > cash) n--;
    while (costFor(id, L, n + 1) <= cash) n++;
    return Math.max(0, Math.min(n, C().maxBizLevel - L));
  }
  function unlocked(id) {
    var i = idxOf[id];
    return i === 0 || lvl(id) >= 1 || lvl(C().businesses[i - 1].id) >= 1;
  }

  // ---- multipliers ----
  function permBonuses() {
    var out = {}, st = C().perm.stats, p = S().perm;
    st.forEach(function (s) { out[s.id] = (p[s.id] || 0) * s.perLevel; });
    return out;
  }
  function boostActive() { return S().boosts.incomeX2Until > clock(); }
  function globalMult(noBoost) {
    var h = (S().perm.harvesting || 0) * C().perm.stats.filter(function (s) { return s.id === 'harvesting'; })[0].perLevel;
    var m = 1 + h;
    if (!noBoost && boostActive()) m *= C().boosts.incomeX2_gems.mult;
    return m;
  }
  function incomeAt(id, level, gm) {
    return level * def(id).baseIncome * milestoneMult(level) * (gm === undefined ? globalMult() : gm);
  }
  function bizIncome(id) { return incomeAt(id, lvl(id)); }

  function incomePerSec() {
    var t = 0, gm = globalMult();
    C().businesses.forEach(function (d) { t += incomeAt(d.id, lvl(d.id), gm); });
    return t;
  }
  function accCap(id) { return bizIncome(id) * C().collectCapSec; }

  function addCash(x) { S().cash += x; S().stats.totalCash += x; }

  function nextMilestone(level) {
    var L = C().milestones.levels;
    for (var i = 0; i < L.length; i++) if (level < L[i]) return { level: L[i], toGo: L[i] - level, from: i > 0 ? L[i - 1] : 0, mult: Math.pow(C().milestones.mult, i + 1) };
    return null;
  }

  var E = {
    setClock: function (fn) { clock = fn || function () { return Date.now(); }; },
    now: function () { return clock(); },
    milestoneMult: milestoneMult,
    maxAffordable: maxAffordable,
    unlocked: unlocked,
    bizIncome: bizIncome,
    incomeAt: function (id, level) { return incomeAt(id, level); },
    boostActive: boostActive,

    bizList: function () { return C().businesses.map(function (d) { return d.id; }); },

    costNext: function (id, n) {
      if (n === 'max') n = Math.max(1, maxAffordable(id));
      n = Math.max(1, Math.floor(n || 1));
      return costFor(id, lvl(id), n);
    },

    buy: function (id, n) {
      if (!def(id) || !unlocked(id)) return 0;
      if (n === 'max') n = maxAffordable(id);
      n = Math.floor(n || 0);
      n = Math.min(n, C().maxBizLevel - lvl(id));
      if (n < 1) return 0;
      var cost = costFor(id, lvl(id), n);
      if (S().cash < cost) return 0;
      S().cash -= cost;
      B(id).level += n;
      return n;
    },

    hireManager: function (id) {
      var d = def(id), b = d && B(id);
      if (!d || b.manager || b.level < 1 || S().cash < d.managerCost) return false;
      S().cash -= d.managerCost;
      b.manager = true;
      if (b.acc > 0) { addCash(b.acc); b.acc = 0; }
      return true;
    },

    collect: function (id) {
      var b = B(id);
      if (!b || b.manager || b.level < 1) return 0;
      var a = Math.min(b.acc || 0, accCap(id));
      b.acc = 0;
      if (a > 0) addCash(a);
      return a;
    },
    collectAll: function () {
      var t = 0; C().businesses.forEach(function (d) { t += E.collect(d.id); }); return t;
    },

    incomePerSec: incomePerSec,
    passiveIncomePerSec: function () {
      var t = 0, gm = globalMult();
      C().businesses.forEach(function (d) { if (B(d.id).manager) t += incomeAt(d.id, lvl(d.id), gm); });
      return t;
    },

    tick: function (dt) {
      if (!(dt > 0)) return;
      var gm = globalMult(), cap = C().collectCapSec;
      C().businesses.forEach(function (d) {
        var b = B(d.id);
        if (b.level < 1) return;
        var inc = incomeAt(d.id, b.level, gm);
        if (b.manager) addCash(inc * dt);
        else b.acc = Math.min((b.acc || 0) + inc * dt, inc * cap);
      });
    },

    // ---- offline ----
    offlineEarnings: function (nowMs) {
      if (pending) return pending;
      nowMs = nowMs || clock();
      var raw = (nowMs - S().lastSeen) / 1000, cfg = C();
      if (!(raw >= cfg.offlineMinSec)) return { seconds: 0, cash: 0, capped: false };
      var capped = raw > cfg.offlineCapSec, sec = Math.min(raw, cfg.offlineCapSec);
      var gm = globalMult(true), cash = 0, managed = 0;
      cfg.businesses.forEach(function (d) {
        var inc = incomeAt(d.id, lvl(d.id), gm);
        if (B(d.id).manager) { cash += inc * sec; managed += inc; }
        else cash += inc * Math.min(sec, cfg.collectCapSec);
      });
      var bs = Math.max(0, Math.min(sec, (S().boosts.incomeX2Until - S().lastSeen) / 1000));
      cash += managed * bs * (cfg.boosts.incomeX2_gems.mult - 1);
      cash *= cfg.offlineEfficiency;
      pending = { seconds: sec, cash: cash, capped: capped };
      G.save.holdLastSeen = true;
      return pending;
    },
    claimOffline: function (mult) {
      var p = E.offlineEarnings(clock());
      mult = mult > 0 ? mult : 1;
      var cash = p.cash * mult;
      if (cash > 0) addCash(cash);
      pending = null;
      G.save.holdLastSeen = false;
      S().lastSeen = clock();
      G.save.save();
      return { seconds: p.seconds, cash: cash, capped: p.capped };
    },
    hasPendingOffline: function () { return !!pending; },

    // ---- raids ----
    applyRaidResult: function (r) {
      r = r || {};
      var R = C().raid, s = S(), wave = Math.max(0, Math.floor(r.wave || 0));
      var cash = (r.cash || 0) * R.cashConv + incomePerSec() * R.incomeSecPerWave * wave * (r.win ? R.winMult : 1);
      var gold = (r.gold || 0) * R.goldConv + wave * R.goldPerWave +
        (r.bossDown ? R.bossGold : 0) +
        Math.floor(wave / R.milestoneEveryWaves) * R.milestoneGold +
        (r.win ? R.winGold : 0);
      gold = Math.floor(gold);
      var gems = 0, prev = s.stats.bestWave;
      R.gemMilestones.forEach(function (m) { if (prev < m && wave >= m) gems += R.gemMilestoneReward; });
      addCash(cash);
      s.gold += gold; s.gems += gems;
      s.stats.runs += 1;
      var newBest = wave > prev;
      if (newBest) s.stats.bestWave = wave;
      return { cash: cash, gold: gold, gems: gems, newBest: newBest };
    },

    // ---- perm / weapons ----
    getPermBonuses: permBonuses,
    permCost: function (statId) {
      var st = C().perm.stats.filter(function (s) { return s.id === statId; })[0];
      if (!st) return Infinity;
      var n = S().perm[statId] || 0;
      if (n >= st.maxLevel) return Infinity;
      return Math.ceil(st.baseCost * Math.pow(C().perm.costGrowth, n));
    },
    buyPerm: function (statId) {
      var c = E.permCost(statId);
      if (!isFinite(c) || S().gold < c) return false;
      S().gold -= c; S().perm[statId] = (S().perm[statId] || 0) + 1;
      return true;
    },
    weaponDef: function (id) { return C().weapons.list.filter(function (w) { return w.id === id; })[0]; },
    weaponLevelCost: function (id) {
      var w = E.weaponDef(id), ws = S().weapons[id];
      if (!w || !ws || !ws.owned || ws.level >= w.maxLevel) return Infinity;
      return Math.ceil(w.levelBase * Math.pow(w.levelGrowth, ws.level - 1));
    },
    buyWeaponLevel: function (id) {
      var c = E.weaponLevelCost(id);
      if (!isFinite(c) || S().gold < c) return false;
      S().gold -= c; S().weapons[id].level += 1;
      return true;
    },
    unlockWeapon: function (id) {
      var w = E.weaponDef(id), ws = S().weapons[id];
      if (!w || !ws || ws.owned || S().gold < w.unlockGold) return false;
      S().gold -= w.unlockGold; ws.owned = true; ws.level = 1;
      return true;
    },

    // ---- boosts ----
    activateBoost: function (kind) {
      var cfg = C().boosts, k = kind === 'incomeX2' ? 'incomeX2_gems' : kind, b = cfg[k], s = S(), now = clock();
      if (!b || typeof b !== 'object') return { ok: false, reason: 'unknown' };
      var left = Math.max(0, s.boosts.incomeX2Until - now) / 1000;
      if (left + b.durationSec > cfg.maxStackSec) return { ok: false, reason: 'max_stack' };
      if (b.gemCost) {
        if (s.gems < b.gemCost) return { ok: false, reason: 'gems' };
        s.gems -= b.gemCost;
      } else if (b.ad) {
        if (!C().adStub) return { ok: false, reason: 'no_ads' };   // real SDK hook goes here
      }
      s.boosts.incomeX2Until = Math.max(now, s.boosts.incomeX2Until) + b.durationSec * 1000;
      return { ok: true, until: s.boosts.incomeX2Until };
    },

    // ---- UI snapshot ----
    snapshot: function () {
      var s = S(), gm = globalMult(), cash = s.cash;
      var biz = C().businesses.map(function (d, i) {
        var b = B(d.id), L = b.level, prevLvl = i > 0 ? lvl(C().businesses[i - 1].id) : 1;
        var isUnlocked = unlocked(d.id), mx = maxAffordable(d.id), c1 = costFor(d.id, L, 1);
        var income = incomeAt(d.id, L, gm), nm = nextMilestone(L);
        return {
          id: d.id, name: d.name, index: i, tier: d.tier, level: L, owned: L >= 1,
          unlocked: isUnlocked,
          visible: isUnlocked || prevLvl >= 1 || cash >= c1 * 0.5,
          state: L >= 1 ? 'owned' : (isUnlocked ? 'available' : 'locked'),
          canAfford: isUnlocked && cash >= c1,
          cost1: c1, cost10: costFor(d.id, L, 10), cost100: costFor(d.id, L, 100),
          costMax: mx > 0 ? costFor(d.id, L, mx) : c1, maxN: mx,
          income: income, incomeNext: incomeAt(d.id, L + 1, gm) - income,
          multiplier: milestoneMult(L) * gm,
          milestone: nm ? { next: nm.level, toGo: nm.toGo, mult: nm.mult, progress: (L - nm.from) / (nm.level - nm.from) } : null,
          manager: { cost: d.managerCost, hired: b.manager, canAfford: L >= 1 && !b.manager && cash >= d.managerCost },
          acc: b.manager ? 0 : Math.min(b.acc || 0, income * C().collectCapSec),
          accCap: income * C().collectCapSec,
          collectReady: !b.manager && L >= 1 && (b.acc || 0) > 0
        };
      });
      var bl = Math.max(0, s.boosts.incomeX2Until - clock()) / 1000;
      return {
        cash: s.cash, gold: s.gold, gems: s.gems, respect: s.respect,
        incomePerSec: incomePerSec(), passiveIncomePerSec: E.passiveIncomePerSec(),
        boost: { active: bl > 0, remainingSec: bl },
        businesses: biz,
        perm: C().perm.stats.map(function (st) {
          var n = s.perm[st.id] || 0;
          return { id: st.id, level: n, maxLevel: st.maxLevel, value: n * st.perLevel, perLevel: st.perLevel, unit: st.unit, cost: E.permCost(st.id), canAfford: s.gold >= E.permCost(st.id) };
        }),
        weapons: C().weapons.list.map(function (w) {
          var ws = s.weapons[w.id];
          return { id: w.id, tier: w.tier, owned: ws.owned, level: ws.level, maxLevel: w.maxLevel, unlockCost: w.unlockGold, levelCost: E.weaponLevelCost(w.id), canUnlock: !ws.owned && s.gold >= w.unlockGold, canLevel: s.gold >= E.weaponLevelCost(w.id) };
        }),
        startWeapon: s.startWeapon,
        offline: pending,
        stats: s.stats
      };
    },

    fmt: function (n) {
      if (!isFinite(n)) return '0';
      var a = Math.abs(n);
      if (a < 1000) return a < 10 && n % 1 ? n.toFixed(2) : String(Math.floor(n * 10) / 10);
      var suf = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'], i = -1;
      while (a >= 1000 && i < suf.length - 1) { a /= 1000; i++; }
      return (n < 0 ? '-' : '') + a.toFixed(a < 10 ? 2 : a < 100 ? 1 : 0) + suf[i];
    }
  };
  G.economy = E;
})();
