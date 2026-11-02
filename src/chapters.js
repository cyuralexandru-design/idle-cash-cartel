/* Raid chapters: 3 chapters x 15 waves. Elite w5, Super Elite w10, Boss w15. No DOM. */
window.G = window.G || {};
(function () {
  'use strict';
  var S = function () { return G.save.state; };
  var WAVES = 15;
  var LIST = [
    { n: 1, name: 'Docklands',    tag: 'Cold wharves, hot cargo.',      art: 'assets/bg/bg_alley.jpg',   pos: '50% 62%' },
    { n: 2, name: 'Soho',         tag: 'Neon, fog and bad debts.',      art: 'assets/bg/bg_street.jpg',  pos: '50% 40%' },
    { n: 3, name: 'Canary Wharf', tag: 'Glass towers, dirty money.',    art: 'assets/bg/map_london.png', pos: '62% 50%' }
  ];
  function st() {
    var s = S(); if (!s.chapters || typeof s.chapters !== 'object') s.chapters = { progress: {}, selected: 1 };
    if (!s.chapters.progress) s.chapters.progress = {};
    return s.chapters;
  }
  var API = {
    WAVES: WAVES, list: LIST,
    enemies: [{ wave: 5, label: 'Elite' }, { wave: 10, label: 'Super Elite' }, { wave: 15, label: 'Boss' }],
    progress: function (n) { return st().progress[n] | 0; },
    unlocked: function (n) { return n <= 1 || API.progress(n - 1) >= WAVES; },
    selected: function () { var n = st().selected | 0; if (n < 1 || n > LIST.length || !API.unlocked(n)) n = 1; return n; },
    select: function (n) { if (API.unlocked(n)) st().selected = n; },
    // returns {newBest, unlockedNext}
    record: function (n, r) {
      r = r || {}; var p = st().progress, prev = p[n] | 0;
      var reached = Math.min(WAVES, Math.max(0, r.wave | 0));
      if (r.win || r.bossDown) reached = WAVES;
      var wasLocked = n < LIST.length && !API.unlocked(n + 1);
      if (reached > prev) p[n] = reached;
      return { newBest: reached > prev, unlockedNext: wasLocked && API.unlocked(n + 1), reached: reached };
    }
  };
  G.chapters = API;
})();
