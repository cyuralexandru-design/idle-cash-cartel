/* Boot, preload, main loop, offline popup, raid flow. */
window.G = window.G || {};
(function () {
  'use strict';
  var M = window.G_MANIFEST || {};
  var $ = function (id) { return document.getElementById(id); };
  var started = false, inRaid = false, raidChapter = 1, lastT = 0, hiddenAt = 0, offlineShown = false;

  function preloadList() {
    var out = [], seen = {};
    function add(f) { if (f && !seen[f]) { seen[f] = 1; out.push(f); } }
    try {
      Object.keys(M.ui || {}).forEach(function (k) { add(M.ui[k].file); });
      Object.keys(M.stats || {}).forEach(function (k) { add(M.stats[k].file); });
      Object.keys(M.businesses || {}).forEach(function (id) { [1, 2, 3].forEach(function (l) { var e = M.businesses[id][l]; if (e) add((e.thumb || e).file); }); });
      Object.keys(M.managers || {}).forEach(function (id) { add(M.managers[id].icon && M.managers[id].icon.file); });
      Object.keys(M.weapons || {}).forEach(function (id) { add(M.weapons[id].side && M.weapons[id].side.file); });
      try { G.inventory.iconKeys().forEach(function (k) { if (M.icons[k]) add(M.icons[k].file); }); } catch (e) {}
      try { G.inventory.iconFiles().forEach(add); } catch (e) {}
      try { add(M.map.img); } catch (e) {}
      ['star', 'medal_gold', 'laurel_wreath', 'briefcase', 'map_pin', 'chest', 'handshake'].forEach(function (k) { if (M.icons && M.icons[k]) add(M.icons[k].file); });
      try { G.chapters.list.forEach(function (c) { add(c.art); }); G.story.preloadFiles().forEach(add); } catch (e) {}
      ['cash_stack', 'gold_bars', 'ruby_gem', 'crown', 'gear', 'crew', 'upgrade_chevrons', 'gift_box', 'skull', 'crosshair', 'boost_2x', 'no_ads_badge', 'safe', 'gift', 'biz_bank', 'lock'].forEach(function (k) { if (M.icons && M.icons[k]) add(M.icons[k].file); });
      if (M.bg) { add(M.bg.bg_alley && M.bg.bg_alley.file); add(M.bg.map_london && M.bg.map_london.file); }
    } catch (e) {}
    return out;
  }

  function preload(done) {
    var list = preloadList(), n = list.length, loaded = 0, fin = false, t0 = performance.now(), shown = 0;
    var fill = $('loadfill');
    function finish() { if (fin) return; fin = true; done(); }
    function paint() {
      var target = n ? loaded / n : 1;
      shown += (target - shown) * 0.25; if (target - shown < 0.004) shown = target;
      fill.style.width = (shown * 100).toFixed(1) + '%';
      if (shown < 1 || performance.now() - t0 < 700) requestAnimationFrame(paint); else finish();
    }
    list.forEach(function (f) {
      var i = new Image(); i.onload = i.onerror = function () { loaded++; }; i.src = f;
    });
    try { if (G.street && G.street.load) { n += 1; G.street.load(function () { loaded++; }); } } catch (e) {}
    try { if (G.puppet && G.puppet.load) { n += 1; G.puppet.load(function (d, t) { if (d >= t) loaded++; }); } } catch (e) {}
    requestAnimationFrame(paint);
    setTimeout(finish, 9000);
  }

  function showScreen(id) {
    ['scr-loading', 'scr-hub', 'scr-arena'].forEach(function (s) { $(s).hidden = s !== id; });
    try { if (G.audio && id !== 'scr-loading') G.audio.startMusic(id === 'scr-arena' ? 'raid' : 'menu'); } catch (e) {}
  }

  function checkOffline() {
    if (inRaid || offlineShown) return;
    var off = G.economy.offlineEarnings(Date.now());
    if (off && off.seconds >= G.config.offlineMinSec && off.cash > 0) {
      offlineShown = true;
      G.ui.showOffline(off, function () { offlineShown = false; G.ui.update('init'); });
    } else { if (off && off.seconds > 0) G.economy.claimOffline(1); G.save.holdLastSeen = false; }
  }

  function loop() {
    var now = performance.now(), dt = Math.min(1, (now - lastT) / 1000); lastT = now;
    if (!document.hidden) {
      if (!offlineShown) G.economy.tick(dt);
      if (!inRaid) G.ui.update();
    }
  }

  function startRaid() {
    if (inRaid) return;
    inRaid = true; G.save.save();
    showScreen('scr-arena');
    var st = G.save.state;
    try { raidChapter = G.chapters.selected(); } catch (e) { raidChapter = 1; }
    G.arena.start({
      canvas: $('cv'),
      chapter: raidChapter,
      loadout: { startWeapon: st.startWeapon, weapons: st.weapons },
      onEnd: onRaidEnd
    });
  }

  function onRaidEnd(r) {
    var res = G.economy.applyRaidResult(r), rec = null, drops = [];
    try { rec = G.chapters.record(raidChapter, r); drops = G.inventory.raidDrops(r, raidChapter); } catch (e) {}
    G.save.save();
    showScreen('scr-hub'); inRaid = false;
    G.ui.update('init');
    G.ui.showResult(r, res, function () { G.ui.setTab('raid', true); G.ui.update('init'); }, { chapter: raidChapter, rec: rec, items: drops });
  }

  function begin() {
    if (started) return; started = true;
    try { if (G.audio && G.audio.play) G.audio.play('click'); } catch (e) {}
    var ld = $('scr-loading'); ld.classList.add('out');
    setTimeout(function () { ld.hidden = true; }, 350);
    showScreen('scr-hub'); $('scr-loading').hidden = false;
    G.ui.setTab('raid', true);
    G.ui.update('init');
    checkOffline();
    try { if (!offlineShown) G.story.maybeIntro(); } catch (e) {}
  }

  function boot() {
    if (!G.save || !G.economy) { document.body.textContent = 'Failed to load game scripts.'; return; }
    G.ui.init();
    G.ui.onRaid = startRaid;
    $('scr-hub').hidden = true;
    var tb = $('tap-start');
    preload(function () {
      $('loadbar').classList.add('done'); $('load-note').hidden = true; tb.hidden = false;
      $('scr-loading').addEventListener('click', begin);
      document.addEventListener('keydown', function (e) { if (!started && (e.key === 'Enter' || e.key === ' ')) begin(); });
      window.__iccReady = true;
    });
    lastT = performance.now();
    setInterval(loop, 100);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        if (!inRaid && started) { G.save.save(); G.save.holdLastSeen = true; }
      } else if (started && !inRaid) {
        G.economy.hasPendingOffline() || checkOffline();
      }
      lastT = performance.now();
    });
    window.addEventListener('beforeunload', function () { try { G.save.save(); } catch (e) {} });
  }

  window.__icc = { startRaid: startRaid, begin: begin, showScreen: showScreen };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
