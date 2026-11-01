/* WebAudio-synthesized SFX. G.audio.play(name). No files. */
window.G = window.G || {};
(function () {
  var ctx = null, master = null, noiseBuf = null, unlocked = false, last = {}, voices = 0;
  var MIN_GAP = { shoot: 0.035, hit: 0.045, coin: 0.04, explode: 0.08, hurt: 0.15, click: 0.03, levelup: 0.3, boss: 0.5, buy: 0.08 };

  function enabled() {
    try { var s = G.save && G.save.state && G.save.state.settings; if (s && s.sound === false) return false; } catch (e) {}
    return true;
  }
  function init() {
    if (ctx) return true;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.28; master.connect(ctx.destination);
      var len = ctx.sampleRate * 0.6, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      noiseBuf = b;
      return true;
    } catch (e) { ctx = null; return false; }
  }
  function unlock() {
    if (unlocked) return;
    if (!init()) return;
    try { if (ctx.state === 'suspended') ctx.resume(); } catch (e) {}
    unlocked = true;
    ['pointerdown', 'touchstart', 'keydown', 'mousedown'].forEach(function (ev) { window.removeEventListener(ev, unlock, true); });
  }
  ['pointerdown', 'touchstart', 'keydown', 'mousedown'].forEach(function (ev) { window.addEventListener(ev, unlock, true); });

  function tone(type, f0, f1, dur, vol, delay) {
    var t = ctx.currentTime + (delay || 0);
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
    voices++; o.onended = function () { voices--; };
  }
  function noise(dur, vol, fFrom, fTo, delay, q) {
    var t = ctx.currentTime + (delay || 0);
    var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = 'bandpass'; f.Q.value = q || 0.8;
    f.frequency.setValueAtTime(fFrom, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, fTo), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.02);
    voices++; s.onended = function () { voices--; };
  }
  var SND = {
    shoot: function () { noise(0.09, 0.5, 3200, 600, 0, 0.9); tone('square', 220, 80, 0.07, 0.12); },
    hit: function () { noise(0.05, 0.35, 1800, 700); tone('triangle', 180, 90, 0.05, 0.12); },
    explode: function () { noise(0.45, 0.9, 900, 70, 0, 0.5); tone('sawtooth', 110, 35, 0.4, 0.3); },
    coin: function () { tone('square', 988, 988, 0.05, 0.1); tone('square', 1319, 1319, 0.12, 0.1, 0.05); },
    levelup: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone('triangle', f, f, 0.18, 0.2, i * 0.08); }); },
    click: function () { tone('square', 700, 520, 0.04, 0.1); },
    boss: function () { tone('sawtooth', 90, 45, 0.9, 0.3); tone('square', 60, 40, 0.9, 0.2, 0.05); noise(0.6, 0.25, 300, 80, 0, 0.6); },
    hurt: function () { tone('sawtooth', 240, 70, 0.22, 0.28); noise(0.12, 0.3, 700, 200); },
    buy: function () { tone('square', 660, 660, 0.06, 0.12); tone('square', 880, 880, 0.06, 0.12, 0.06); tone('square', 1320, 1320, 0.14, 0.12, 0.12); }
  };

  G.audio = {
    play: function (name) {
      try {
        if (!enabled() || !unlocked || !ctx || !SND[name]) return;
        if (ctx.state === 'suspended') ctx.resume();
        if (voices > 28) return;
        var now = ctx.currentTime, gap = MIN_GAP[name] || 0.03;
        if (last[name] && now - last[name] < gap) return;
        last[name] = now;
        SND[name]();
      } catch (e) {}
    },
    unlock: unlock,
    isUnlocked: function () { return unlocked; }
  };
})();
