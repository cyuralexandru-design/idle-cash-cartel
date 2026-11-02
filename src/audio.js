/* Audio: pre-rendered OGG assets (assets/audio, made by tools/gen_audio.py) played via WebAudio,
   with a filtered-noise synth fallback if files cannot be loaded.
   API: G.audio.play(name), setVolumes({master,sfx,music}), getVolumes(), startMusic('menu'|'raid'),
        stopMusic(), pauseAll(), resumeAll(), duck(amount, seconds), unlock(), isUnlocked() */
window.G = window.G || {};
(function () {
  var BASE = 'assets/audio/';
  var ctx = null, master, sfxBus, musicBus, duckBus, ambBus, comp, reverbIn = null;
  var noiseBuf = null, unlocked = false, paused = false;
  var buffers = {}, loading = {}, last = {}, active = {};
  var vol = { master: 0.8, sfx: 0.9, music: 0.5 };
  var wantMusic = null, curMusic = null, curKind = null, ambNodes = [];

  // sound name -> {files, gap (min seconds between plays), max (concurrent), gain, rate (+-jitter), duck}
  var DEF = {
    shoot:   { f: ['shoot0', 'shoot1', 'shoot2'], gap: 0.06, max: 4, gain: 0.55, rate: 0.07 },
    hit:     { f: ['hit0', 'hit1'], gap: 0.05, max: 4, gain: 0.7, rate: 0.08 },
    explode: { f: ['explode'], gap: 0.12, max: 2, gain: 0.85, rate: 0.05, duck: [0.45, 1.4] },
    hurt:    { f: ['hurt'], gap: 0.18, max: 2, gain: 0.85, rate: 0.03 },
    coin:    { f: ['coin'], gap: 0.05, max: 3, gain: 0.6, rate: 0.06 },
    buy:     { f: ['buy'], gap: 0.1, max: 2, gain: 0.75, rate: 0.02 },
    click:   { f: ['click'], gap: 0.03, max: 3, gain: 0.5, rate: 0.04 },
    levelup: { f: ['levelup'], gap: 0.4, max: 1, gain: 0.8, rate: 0, duck: [0.5, 2.5] },
    boss:    { f: ['boss'], gap: 0.8, max: 1, gain: 0.95, rate: 0, duck: [0.35, 3.5] },
    pickup:  { f: ['pickup'], gap: 0.05, max: 3, gain: 0.55, rate: 0.05 },
    wave:    { f: ['wave'], gap: 0.5, max: 1, gain: 0.7, rate: 0, duck: [0.55, 1.6] },
    win:     { f: ['win'], gap: 0.5, max: 1, gain: 0.8, rate: 0, duck: [0.3, 3.5] },
    lose:    { f: ['lose'], gap: 0.5, max: 1, gain: 0.8, rate: 0, duck: [0.3, 3.5] },
    error:   { f: ['error'], gap: 0.15, max: 1, gain: 0.55, rate: 0 }
  };
  var ALIAS = { shot: 'shoot', gun: 'shoot', gunshot: 'shoot', reload: 'click', ui: 'click', tap: 'click',
    cash: 'buy', purchase: 'buy', upgrade: 'buy', gold: 'coin', money: 'coin', die: 'lose', death: 'lose',
    victory: 'win', nope: 'error', deny: 'error', wavestart: 'wave', next: 'wave' };
  var MUSIC = { menu: { file: 'music_menu', amb: 'city', ambGain: 0.22 }, raid: { file: 'music_raid', amb: 'rain', ambGain: 0.3 } };

  function clamp01(v) { v = +v; return isNaN(v) ? 0 : Math.max(0, Math.min(1, v)); }
  function settings() {
    try { return (G.save && G.save.state && G.save.state.settings) || null; } catch (e) { return null; }
  }
  function enabled() { var s = settings(); return !(s && s.sound === false); }
  function readSaved() {
    var s = settings(); if (!s) return;
    if (typeof s.master === 'number') vol.master = clamp01(s.master);
    if (typeof s.sfx === 'number') vol.sfx = clamp01(s.sfx);
    if (typeof s.music === 'number') vol.music = clamp01(s.music);
  }
  function applyGains() {
    if (!ctx) return;
    readSaved();
    var on = enabled(), t = ctx.currentTime;
    master.gain.setTargetAtTime(on ? 0.9 * vol.master : 0, t, 0.05);
    sfxBus.gain.setTargetAtTime(vol.sfx, t, 0.03);
    musicBus.gain.setTargetAtTime(vol.music * 0.8, t, 0.08);
    ambBus.gain.setTargetAtTime(vol.music * 0.8, t, 0.08);
  }

  function init() {
    if (ctx) return true;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain(); sfxBus = ctx.createGain(); musicBus = ctx.createGain();
      duckBus = ctx.createGain(); ambBus = ctx.createGain();
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
      sfxBus.connect(master); musicBus.connect(duckBus); ambBus.connect(duckBus); duckBus.connect(master);
      master.connect(comp); comp.connect(ctx.destination);
      var len = Math.floor(ctx.sampleRate * 0.8), b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      noiseBuf = b;
      applyGains();
      return true;
    } catch (e) { ctx = null; return false; }
  }

  // ---------- loading ----------
  function load(name) {
    if (buffers[name] || loading[name] || !ctx) return loading[name] || Promise.resolve(buffers[name]);
    var p = fetch(BASE + name + '.ogg').then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.arrayBuffer();
    }).then(function (ab) {
      return new Promise(function (res, rej) { var pr = ctx.decodeAudioData(ab, res, rej); if (pr && pr.catch) pr.catch(rej); });
    }).then(function (buf) { buffers[name] = buf; return buf; })
      .catch(function () { buffers[name] = false; return false; });
    loading[name] = p; return p;
  }
  function preload() {
    Object.keys(DEF).forEach(function (k) { DEF[k].f.forEach(load); });
  }

  // ---------- fallback synth (soft, non-chiptune: filtered noise + sine thumps) ----------
  function fbNoise(dur, v, f0, f1, type) {
    var t = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = type || 'lowpass'; f.Q.value = 0.7;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(sfxBus); s.start(t); s.stop(t + dur + 0.05);
  }
  function fbThump(f0, f1, dur, v, delay) {
    var t = ctx.currentTime + (delay || 0), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + dur + 0.05);
  }
  function fbBell(f, v, dur, delay) {
    [1, 2.76, 5.4].forEach(function (r, i) {
      var t = ctx.currentTime + (delay || 0), o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f * r; g.gain.setValueAtTime(v / (i + 1), t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur / (1 + i * 0.6));
      o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + dur + 0.05);
    });
  }
  var FB = {
    shoot: function () { fbNoise(0.02, 0.7, 9000, 3000, 'highpass'); fbNoise(0.22, 0.7, 5000, 300); fbThump(140, 45, 0.12, 0.6); },
    hit: function () { fbNoise(0.12, 0.5, 1800, 300); fbThump(110, 50, 0.14, 0.6); },
    explode: function () { fbNoise(1.2, 0.9, 3500, 70); fbThump(70, 28, 1.0, 0.9); },
    hurt: function () { fbThump(95, 45, 0.35, 0.8); fbNoise(0.25, 0.4, 900, 200); },
    coin: function () { fbBell(2350, 0.25, 0.4); fbBell(3120, 0.2, 0.5, 0.06); },
    buy: function () { fbThump(120, 70, 0.1, 0.5); fbBell(2093, 0.3, 0.9, 0.1); },
    click: function () { fbThump(240, 140, 0.05, 0.5); },
    levelup: function () { [220, 330, 440, 523].forEach(function (f, i) { fbBell(f * 2, 0.15, 1.2, i * 0.09); }); },
    boss: function () { fbThump(60, 30, 1.8, 1); fbNoise(1.0, 0.5, 400, 60); },
    pickup: function () { fbBell(3000, 0.2, 0.4); },
    wave: function () { fbThump(55, 35, 1.2, 0.7); },
    win: function () { fbBell(880, 0.2, 1.5); fbBell(1318, 0.15, 1.5, 0.15); },
    lose: function () { fbThump(60, 30, 1.8, 0.8); fbBell(220, 0.2, 1.5); },
    error: function () { fbThump(90, 60, 0.2, 0.6); }
  };

  // ---------- SFX ----------
  var pick = {};
  function duck(amount, secs) {
    if (!ctx) return;
    var t = ctx.currentTime, g = duckBus.gain;
    try {
      g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(clamp01(amount), t + 0.05);
      g.setValueAtTime(clamp01(amount), t + 0.05 + Math.max(0.1, (secs || 1) * 0.5));
      g.linearRampToValueAtTime(1, t + 0.05 + Math.max(0.3, secs || 1));
    } catch (e) {}
  }
  function play(name) {
    try {
      if (!unlocked || !ctx || paused || !enabled()) return;
      name = ALIAS[name] || name;
      var d = DEF[name]; if (!d) return;
      if (ctx.state === 'suspended') ctx.resume();
      var now = ctx.currentTime;
      if (last[name] && now - last[name] < d.gap) return;
      var a = active[name] || 0; if (a >= d.max) return;
      var total = 0; for (var k in active) total += active[k]; if (total > 12) return;
      last[name] = now;
      // pick a variant, avoiding an immediate repeat
      var n = d.f.length, i = n > 1 ? ((pick[name] || 0) + 1 + Math.floor(Math.random() * (n - 1))) % n : 0;
      pick[name] = i;
      var buf = buffers[d.f[i]];
      if (d.duck) duck(d.duck[0], d.duck[1]);
      if (!buf) { if (buf === undefined) load(d.f[i]); if (FB[name]) FB[name](); return; }
      var s = ctx.createBufferSource(), g = ctx.createGain();
      s.buffer = buf;
      if (d.rate) s.playbackRate.value = 1 + (Math.random() * 2 - 1) * d.rate;
      g.gain.value = d.gain * (0.92 + Math.random() * 0.16);
      s.connect(g); g.connect(sfxBus);
      active[name] = a + 1;
      s.onended = function () { active[name] = Math.max(0, (active[name] || 1) - 1); try { g.disconnect(); } catch (e) {} };
      s.start();
    } catch (e) {}
  }

  // ---------- music / ambience ----------
  function loopSrc(buf, bus, gain, fadeIn) {
    var s = ctx.createBufferSource(), g = ctx.createGain(), t = ctx.currentTime;
    s.buffer = buf; s.loop = true; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + fadeIn);
    s.connect(g); g.connect(bus); s.start(t + 0.02);
    return { s: s, g: g };
  }
  function killNodes(list, fadeOut) {
    var t = ctx.currentTime;
    list.forEach(function (n) {
      try { n.g.gain.cancelScheduledValues(t); n.g.gain.setValueAtTime(n.g.gain.value, t); n.g.gain.linearRampToValueAtTime(0.0001, t + fadeOut); n.s.stop(t + fadeOut + 0.05); } catch (e) {}
    });
  }
  function startMusic(kind) {
    kind = MUSIC[kind] ? kind : 'menu';
    wantMusic = kind;
    if (!unlocked || !ctx) return;
    if (curKind === kind && curMusic) return;
    var m = MUSIC[kind], mine = {};
    var token = startMusic.tok = (startMusic.tok || 0) + 1;
    Promise.all([load(m.file), load(m.amb)]).then(function (r) {
      if (token !== startMusic.tok || wantMusic !== kind) return;
      if (curMusic) killNodes(curMusic, 1.2);
      curMusic = [];
      if (r[0]) curMusic.push(loopSrc(r[0], musicBus, 1, 1.5));
      if (r[1]) curMusic.push(loopSrc(r[1], ambBus, m.ambGain, 2.5));
      curKind = kind;
    });
  }
  function stopMusic() {
    wantMusic = null; startMusic.tok = (startMusic.tok || 0) + 1;
    if (!ctx || !curMusic) { curMusic = null; curKind = null; return; }
    killNodes(curMusic, 0.8); curMusic = null; curKind = null;
  }
  function pauseAll() {
    paused = true;
    if (ctx && ctx.state === 'running') { try { ctx.suspend(); } catch (e) {} }
  }
  function resumeAll() {
    paused = false;
    if (ctx && unlocked && ctx.state !== 'running' && !document.hidden) { try { ctx.resume(); } catch (e) {} }
  }

  function unlock() {
    if (unlocked) return;
    if (!init()) return;
    try { if (ctx.state === 'suspended') ctx.resume(); } catch (e) {}
    unlocked = true;
    ['pointerdown', 'touchstart', 'keydown', 'mousedown', 'click'].forEach(function (ev) { window.removeEventListener(ev, unlock, true); });
    preload();
    if (wantMusic) startMusic(wantMusic);
    setInterval(applyGains, 600); // follow settings.sound toggle / saved volumes
  }
  ['pointerdown', 'touchstart', 'keydown', 'mousedown', 'click'].forEach(function (ev) { window.addEventListener(ev, unlock, true); });
  document.addEventListener('visibilitychange', function () {
    if (!ctx || !unlocked) return;
    try { if (document.hidden) ctx.suspend(); else if (!paused) ctx.resume(); } catch (e) {}
  });

  function setVolumes(v) {
    v = v || {};
    if (v.master != null) vol.master = clamp01(v.master);
    if (v.sfx != null) vol.sfx = clamp01(v.sfx);
    if (v.music != null) vol.music = clamp01(v.music);
    var s = settings();
    if (s) {
      s.master = vol.master; s.sfx = vol.sfx; s.music = vol.music;
      try { if (G.save && typeof G.save.save === 'function') G.save.save(); } catch (e) {}
    }
    applyGains();
    return getVolumes();
  }
  function getVolumes() { readSaved(); return { master: vol.master, sfx: vol.sfx, music: vol.music }; }

  readSaved();
  G.audio = {
    play: play, unlock: unlock, isUnlocked: function () { return unlocked; },
    setVolumes: setVolumes, getVolumes: getVolumes,
    startMusic: startMusic, stopMusic: stopMusic, pauseAll: pauseAll, resumeAll: resumeAll, duck: duck,
    names: function () { return Object.keys(DEF); }
  };
})();
