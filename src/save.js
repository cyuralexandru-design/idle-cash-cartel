// Save system: versioned localStorage, in-memory fallback, export/import.
window.G = window.G || {};
(function () {
  'use strict';
  var CURRENT = 1;
  var KEY = (G.config && G.config.saveKey) || 'icc_save_v1';
  var BIZ_IDS = ['pub', 'bookmaker', 'garage', 'boxing_club', 'nightclub', 'restaurant', 'gentlemens_club', 'car_dealership', 'hotel', 'casino'];
  var WEAPON_IDS = ['revolver', 'pistol', 'machine_pistol', 'sawn_off', 'pump_shotgun', 'smg', 'assault_rifle', 'sniper', 'plasma_rifle', 'laser_rifle'];
  var STAT_IDS = ['damage', 'attack_speed', 'move_speed', 'max_hp', 'regen', 'armor', 'crit', 'range', 'luck', 'pickup_range', 'dodge', 'harvesting', 'reload_speed', 'explosion', 'pierce', 'lifesteal'];

  var mem = null;          // in-memory fallback copy (string)
  var timer = null, hooked = false;

  function defaultState() {
    var cfg = G.config, st = {
      v: CURRENT, cash: 0, gold: 0, gems: 0, respect: 0, lastSeen: Date.now(),
      businesses: {}, weapons: {}, startWeapon: 'pistol', perm: {},
      stats: { bestWave: 0, runs: 0, totalCash: 0 },
      settings: { sound: true, shake: true, flashes: true, master: 1, sfx: 1, music: 0.6, dmgNumbers: true, vibration: true, showFps: false, joySide: 'right', joySize: 1 },
      boosts: { incomeX2Until: 0 },
      // v0.3 additive fields
      chapters: { progress: { '1': 0, '2': 0, '3': 0 }, selected: 1 },
      inventory: { items: [], equipped: {}, nextId: 1, starter: false },
      crew: { levels: {} },
      story: { seen: {} }
    };
    if (cfg && cfg.start) {
      st.cash = cfg.start.cash; st.gold = cfg.start.gold; st.gems = cfg.start.gems; st.respect = cfg.start.respect;
      st.startWeapon = cfg.start.startWeapon;
    }
    BIZ_IDS.forEach(function (id) { st.businesses[id] = { level: 0, manager: false, acc: 0 }; });
    WEAPON_IDS.forEach(function (id) {
      var owned = id === 'revolver' || id === 'pistol';
      st.weapons[id] = { owned: owned, level: owned ? 1 : 0 };
    });
    STAT_IDS.forEach(function (id) { st.perm[id] = 0; });
    return st;
  }

  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function merge(def, src) {   // fill missing keys from def; keep src values of same type
    if (!isObj(src)) return def;
    var out = {}, k;
    for (k in def) {
      if (isObj(def[k])) out[k] = merge(def[k], src[k]);
      else out[k] = (typeof src[k] === typeof def[k] && !(typeof src[k] === 'number' && !isFinite(src[k]))) ? src[k] : def[k];
    }
    for (k in src) if (!(k in def)) out[k] = src[k];   // keep unknown keys (forward compat)
    return out;
  }

  // migrations[n] upgrades a state with v===n to v===n+1
  var migrations = {
    0: function (s) { s.v = 1; return s; }   // legacy/unversioned -> v1
  };

  function migrate(s) {
    if (!isObj(s)) return defaultState();
    var v = typeof s.v === 'number' ? s.v : 0, guard = 0;
    while (v < CURRENT && guard++ < 50) {
      var fn = G.save.migrations[v];
      if (fn) { s = fn(s) || s; }
      v = (typeof s.v === 'number' && s.v > v) ? s.v : v + 1;
      s.v = v;
    }
    return merge(defaultState(), s);
  }

  // ---- storage helpers (every access guarded) ----
  function rd() {
    try { var r = window.localStorage.getItem(KEY); if (r != null) return r; } catch (e) {}
    return mem;
  }
  function wr(str) {
    mem = str;
    try { window.localStorage.setItem(KEY, str); return true; } catch (e) { return false; }
  }

  // ---- base64 (unicode safe) ----
  function b64enc(str) {
    try { return btoa(unescape(encodeURIComponent(str))); } catch (e) {}
    return Buffer.from(str, 'utf8').toString('base64');
  }
  function b64dec(b) {
    try { return decodeURIComponent(escape(atob(b))); } catch (e) {}
    return Buffer.from(b, 'base64').toString('utf8');
  }

  var API = {
    CURRENT: CURRENT,
    KEY: KEY,
    state: null,
    holdLastSeen: false,     // economy sets true while an offline reward is unclaimed
    migrations: migrations,
    defaultState: defaultState,
    migrate: migrate,

    load: function () {
      var s = null;
      try { var raw = rd(); if (raw) s = migrate(JSON.parse(raw)); } catch (e) { s = null; }
      API.state = s || defaultState();
      API.startAutosave();
      return API.state;
    },
    save: function () {
      try {
        if (!API.state) return false;
        if (!API.holdLastSeen) API.state.lastSeen = Date.now();
        return wr(JSON.stringify(API.state));
      } catch (e) { return false; }
    },
    reset: function () {
      API.state = defaultState();
      API.holdLastSeen = false;
      mem = null;
      try { window.localStorage.removeItem(KEY); } catch (e) {}
      API.save();
      return API.state;
    },
    exportString: function () {
      try { return 'ICC1.' + b64enc(JSON.stringify(API.state)); } catch (e) { return ''; }
    },
    importString: function (str) {
      try {
        str = String(str || '').trim();
        if (str.indexOf('ICC1.') !== 0) return false;
        var obj = JSON.parse(b64dec(str.slice(5)));
        if (!isObj(obj) || !isObj(obj.businesses)) return false;
        API.state = migrate(obj);
        API.save();
        return true;
      } catch (e) { return false; }
    },
    startAutosave: function () {
      try {
        if (typeof window.document === 'undefined' || typeof setInterval === 'undefined') return;
        if (!timer) timer = setInterval(API.save, 10000);
        if (!hooked) {
          hooked = true;
          window.document.addEventListener('visibilitychange', function () { if (window.document.hidden) API.save(); });
          if (window.addEventListener) window.addEventListener('pagehide', API.save);
        }
      } catch (e) {}
    }
  };

  G.save = API;
  API.load();   // state available immediately for other modules
})();
