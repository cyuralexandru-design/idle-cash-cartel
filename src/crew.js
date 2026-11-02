/* Crew: each hired manager gives a permanent hero bonus that grows with crew level. No DOM. */
window.G = window.G || {};
(function () {
  'use strict';
  var S = function () { return G.save.state; };
  var MAX_LEVEL = 25;

  // stat ids and units match config perm stats (pct = fraction, flat = absolute).
  // gold_pct / cash_pct are economy multipliers. 'harvesting' = free cash + XP in the arena.
  var LIST = [
    { biz: 'pub',             key: 'gold',   stat: 'gold_pct',     unit: 'pct',  per: 0.03,  label: 'Gold' },
    { biz: 'bookmaker',       key: 'cash',   stat: 'cash_pct',     unit: 'pct',  per: 0.04,  label: 'Cash' },
    { biz: 'garage',          key: 'attack', stat: 'damage',       unit: 'pct',  per: 0.02,  label: 'Attack' },
    { biz: 'boxing_club',     key: 'hp',     stat: 'max_hp',       unit: 'flat', per: 5,     label: 'HP' },
    { biz: 'nightclub',       key: 'crit',   stat: 'crit',         unit: 'pct',  per: 0.01,  label: 'Crit' },
    { biz: 'restaurant',      key: 'regen',  stat: 'regen',        unit: 'flat', per: 0.1,   label: 'Regen' },
    { biz: 'gentlemens_club', key: 'xp',     stat: 'harvesting',   unit: 'pct',  per: 0.02,  label: 'XP' },
    { biz: 'car_dealership',  key: 'speed',  stat: 'move_speed',   unit: 'pct',  per: 0.01,  label: 'Speed' },
    { biz: 'hotel',           key: 'defence', stat: 'armor',       unit: 'flat', per: 0.5,   label: 'Defence' },
    { biz: 'casino',          key: 'luck',   stat: 'luck',         unit: 'pct',  per: 0.02,  label: 'Luck' }
  ];
  var byBiz = {}; LIST.forEach(function (c) { byBiz[c.biz] = c; });

  function lv() { var s = S(); if (!s.crew || typeof s.crew !== 'object') s.crew = { levels: {} }; if (!s.crew.levels) s.crew.levels = {}; return s.crew.levels; }
  function hired(biz) { var b = S().businesses[biz]; return !!(b && b.manager); }

  var API = {
    MAX_LEVEL: MAX_LEVEL, list: LIST, def: function (biz) { return byBiz[biz]; },
    hired: hired,
    level: function (biz) { return hired(biz) ? Math.max(1, Math.min(MAX_LEVEL, lv()[biz] | 0)) : 0; },
    valueAt: function (biz, L) { var d = byBiz[biz]; return d ? d.per * L : 0; },
    fmt: function (biz, v) {
      var d = byBiz[biz];
      if (d.unit === 'pct') return '+' + (Math.round(v * 1000) / 10) + '%';
      return '+' + (Math.round(v * 10) / 10);
    },
    levelCost: function (biz) { var L = API.level(biz); if (!L || L >= MAX_LEVEL) return Infinity; return Math.ceil(40 * Math.pow(1.28, L - 1)); },
    levelUp: function (biz) {
      var c = API.levelCost(biz); if (!isFinite(c) || S().gold < c) return false;
      S().gold -= c; lv()[biz] = API.level(biz) + 1; return true;
    },
    bonuses: function () {
      var out = {};
      LIST.forEach(function (d) { var L = API.level(d.biz); if (L > 0) out[d.stat] = (out[d.stat] || 0) + d.per * L; });
      return out;
    }
  };
  G.crew = API;
})();
