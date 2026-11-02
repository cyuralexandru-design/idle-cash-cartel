/* Gear inventory: data model + drops. No DOM. Feeds G.economy.getPermBonuses via G.inventory.bonuses(). */
window.G = window.G || {};
(function () {
  'use strict';
  var S = function () { return G.save.state; };

  var RARITIES = [
    { id: 'common',    name: 'Common',    color: '#9aa0a6', frame: 'gray',   mult: 1,   maxLevel: 10 },
    { id: 'uncommon',  name: 'Uncommon',  color: '#4caf50', frame: 'green',  mult: 1.7, maxLevel: 15 },
    { id: 'rare',      name: 'Rare',      color: '#3b8fe0', frame: 'blue',   mult: 2.8, maxLevel: 20 },
    { id: 'epic',      name: 'Epic',      color: '#a45ee0', frame: 'purple', mult: 4.5, maxLevel: 25 },
    { id: 'legendary', name: 'Legendary', color: '#e8a317', frame: 'orange', mult: 7,   maxLevel: 30 },
    { id: 'ultra',     name: 'Ultra',     color: '#e0343e', frame: 'red',    mult: 11,  maxLevel: 40 }
  ];
  var LEVEL_SCALE = 0.08;    // +8% of base per item level
  var SLOTS = ['weapon', 'chain', 'gloves', 'jacket', 'pants', 'shoes'];

  // stat output ids use the same units as config perm stats: pct = fraction, flat = absolute.
  // gold_pct is an economy-only multiplier on raid gold.
  var STAT_LABEL = { damage: 'Attack', attack_speed: 'Attack Speed', max_hp: 'HP', armor: 'Armor', luck: 'Luck', gold_pct: 'Gold', move_speed: 'Speed', dodge: 'Dodge', crit: 'Crit', regen: 'Regen', cash_pct: 'Cash', harvesting: 'XP' };

  var SLOT_DEFS = {
    weapon: { name: 'Weapon', stats: [{ stat: 'damage', base: 0.04, unit: 'pct' }],
      items: [['Revolver', 'revolver'], ['Pistol', 'pistol'], ['Sawn-Off', 'shotgun'], ['Tommy Gun', 'tommy_gun'], ['Marksman Rifle', 'sniper_rifle']] },
    chain: { name: 'Chain', stats: [{ stat: 'luck', base: 0.02, unit: 'pct' }, { stat: 'gold_pct', base: 0.02, unit: 'pct' }],
      items: [['Iron Chain', 'handcuffs'], ['Gold Medallion', 'medal_gold'], ['Silver Locket', 'medal_silver'], ['Lucky Key', 'key']] },
    gloves: { name: 'Gloves', stats: [{ stat: 'attack_speed', base: 0.03, unit: 'pct' }],
      items: [['Knuckle Dusters', 'brass_knuckles'], ['Boxing Wraps', 'brass_knuckles'], ['Leather Gloves', 'brass_knuckles']] },
    jacket: { name: 'Jacket', stats: [{ stat: 'max_hp', base: 6, unit: 'flat' }],
      items: [['Kevlar Vest', 'armor_vest'], ['Donkey Jacket', 'armor_vest'], ['Pinstripe Coat', 'armor_vest']] },
    pants: { name: 'Pants', stats: [{ stat: 'armor', base: 0.8, unit: 'flat' }],
      items: [['Work Trousers', 'svg:pants'], ['Cargo Pants', 'svg:pants'], ['Suit Trousers', 'svg:pants']] },
    shoes: { name: 'Shoes', stats: [{ stat: 'move_speed', base: 0.012, unit: 'pct' }, { stat: 'dodge', base: 0.008, unit: 'pct' }],
      items: [['Steel Toecaps', 'svg:shoes'], ['Hi-Top Trainers', 'svg:shoes'], ['Brogues', 'svg:shoes']] }
  };

  var SVG = {
    pants: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g stroke="#0b0c0e" stroke-width="4" stroke-linejoin="round"><path d="M27 12h46l7 78H56L50 44l-6 46H20z" fill="#8795b3"/><path d="M27 12h46v11H27z" fill="#5e6b88"/><path d="M50 23v21" fill="none"/></g><rect x="45" y="12" width="10" height="11" fill="#e8a317" stroke="#0b0c0e" stroke-width="3"/></svg>',
    shoes: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g stroke="#0b0c0e" stroke-width="4" stroke-linejoin="round"><path d="M22 14h28v36c14 4 32 8 38 18 3 5 2 12-2 14H22z" fill="#8b5a2b"/><path d="M22 74h64v8c0 2-1 4-4 4H22z" fill="#2b2f36"/><path d="M22 14h28v8H22z" fill="#5c3a1b"/></g><path d="M60 62l8 4M54 56l8 4" stroke="#f2efe9" stroke-width="3" stroke-linecap="round"/></svg>'
  };
  function svgUri(k) { return 'data:image/svg+xml;utf8,' + encodeURIComponent(SVG[k]); }

  var CHESTS = {
    street:  { name: 'Street Crate',  desc: 'Mostly common gear.',        cost: { gold: 150 },  icon: 'crate_closed_gray',   weights: [80, 17, 3, 0, 0, 0] },
    gang:    { name: 'Gang Crate',    desc: 'Good odds of rare gear.',    cost: { gold: 600 },  icon: 'crate_closed_blue',   weights: [30, 40, 24, 6, 0, 0] },
    boss:    { name: 'Boss Crate',    desc: 'Epic gear is common here.',  cost: { gems: 40 },   icon: 'crate_closed_purple', weights: [0, 25, 45, 26, 4, 0] },
    kingpin: { name: 'Kingpin Crate', desc: 'Legendary and Ultra shots.', cost: { gems: 150 },  icon: 'crate_closed_gold',   weights: [0, 0, 30, 45, 22, 3] }
  };
  var RAID_WEIGHTS = { 1: [70, 25, 5, 0, 0, 0], 2: [45, 35, 17, 3, 0, 0], 3: [25, 35, 28, 10, 2, 0] };

  function inv() {
    var s = S(); if (!s.inventory || typeof s.inventory !== 'object') s.inventory = { items: [], equipped: {}, nextId: 1, starter: false };
    var i = s.inventory; if (!Array.isArray(i.items)) i.items = []; if (!i.equipped) i.equipped = {}; if (!(i.nextId > 0)) i.nextId = 1;
    return i;
  }
  function rar(r) { return RARITIES[Math.max(0, Math.min(RARITIES.length - 1, r | 0))]; }
  function get(id) { var it = inv().items; for (var i = 0; i < it.length; i++) if (it[i].id === id) return it[i]; return null; }
  function pick(weights) {
    var t = 0, i; for (i = 0; i < weights.length; i++) t += weights[i];
    var r = Math.random() * t; for (i = 0; i < weights.length; i++) { r -= weights[i]; if (r < 0) return i; }
    return 0;
  }
  function mul(it) { return rar(it.rarity).mult * (1 + LEVEL_SCALE * (it.level - 1)); }

  var API = {
    RARITIES: RARITIES, SLOTS: SLOTS, SLOT_DEFS: SLOT_DEFS, CHESTS: CHESTS, STAT_LABEL: STAT_LABEL,
    rarity: rar,
    get: get,
    items: function () { return inv().items; },
    equippedId: function (slot) { return inv().equipped[slot] || null; },
    equippedItem: function (slot) { var id = inv().equipped[slot]; return id ? get(id) : null; },
    iconOf: function (it) { var d = SLOT_DEFS[it.slot], e = d.items[it.base % d.items.length]; return e[1]; },
    nameOf: function (it) { var d = SLOT_DEFS[it.slot]; return d.items[it.base % d.items.length][0]; },
    // icon file path for a gear slot+rarity from G_MANIFEST.items3, else null (weapon: use G_MANIFEST.weapons[id].side)
    iconFor: function (slot, rarity) {
      var m = window.G_MANIFEST && G_MANIFEST.items3, r = typeof rarity === 'number' ? rar(rarity).id : rarity;
      var e = m && m[slot] && m[slot][r]; return e ? e.file : null;
    },
    iconUri: function (key) { return key.indexOf('svg:') === 0 ? svgUri(key.slice(4)) : null; },
    iconFiles: function () {   // all 30 items3 gear icon paths (preload)
      var out = [], m = (window.G_MANIFEST && G_MANIFEST.items3) || {};
      SLOTS.forEach(function (s) { RARITIES.forEach(function (r) { var f = API.iconFor(s, r.id); if (f) out.push(f); }); });
      return out;
    },
    iconKeys: function () {   // legacy: manifest icon keys used by items + chests   // manifest icon keys used by items + chests (for preload)
      var out = []; SLOTS.forEach(function (s) { SLOT_DEFS[s].items.forEach(function (e) { if (e[1].indexOf('svg:') !== 0 && out.indexOf(e[1]) < 0) out.push(e[1]); }); });
      Object.keys(CHESTS).forEach(function (k) { out.push(CHESTS[k].icon); });
      return out;
    },

    // main stats of an item: [{stat,value,unit,label}]
    statsOf: function (it) {
      var m = mul(it);
      return SLOT_DEFS[it.slot].stats.map(function (d) { return { stat: d.stat, unit: d.unit, value: d.base * m, label: STAT_LABEL[d.stat] || d.stat }; });
    },
    fmtStat: function (s) {
      if (s.unit === 'pct') return '+' + (s.value * 100).toFixed(s.value * 100 < 10 ? 1 : 0) + '%';
      return '+' + (s.value < 10 ? s.value.toFixed(1) : Math.round(s.value));
    },
    maxLevel: function (it) { return rar(it.rarity).maxLevel; },

    addItem: function (slot, rarity, base, level) {
      var d = SLOT_DEFS[slot]; if (!d) return null;
      var i = inv(), it = { id: i.nextId++, slot: slot, rarity: rarity | 0, base: base == null ? Math.floor(Math.random() * d.items.length) : base, level: level || 1 };
      i.items.push(it); return it;
    },
    roll: function (weights) {
      var slot = SLOTS[Math.floor(Math.random() * SLOTS.length)];
      return API.addItem(slot, pick(weights));
    },
    ensureStarter: function () {
      var i = inv(); if (i.starter) return false;
      SLOTS.forEach(function (s) { var it = API.addItem(s, 0, 0, 1); i.equipped[s] = it.id; });
      i.starter = true; return true;
    },

    equip: function (id) {
      var it = get(id); if (!it) return false; inv().equipped[it.slot] = id; return true;
    },
    isEquipped: function (id) { var it = get(id); return !!it && inv().equipped[it.slot] === id; },

    upgradeCost: function (it) {
      if (!it || it.level >= API.maxLevel(it)) return Infinity;
      return Math.ceil(15 * Math.pow(1.22, it.level - 1) * (1 + 0.9 * it.rarity));
    },
    upgrade: function (id) {
      var it = get(id), c = API.upgradeCost(it);
      if (!it || !isFinite(c) || S().gold < c) return false;
      S().gold -= c; it.level += 1; return true;
    },
    // merge: selected item + 2 other unequipped items of same slot AND rarity -> next rarity, level 1
    mergeFodder: function (id) {
      var it = get(id); if (!it || it.rarity >= RARITIES.length - 1) return [];
      var eq = inv().equipped;
      return inv().items.filter(function (o) { return o.id !== id && o.slot === it.slot && o.rarity === it.rarity && eq[o.slot] !== o.id; })
        .sort(function (a, b) { return a.level - b.level; });
    },
    canMerge: function (id) { return API.mergeFodder(id).length >= 2; },
    merge: function (id) {
      var it = get(id); if (!it) return null;
      var f = API.mergeFodder(id); if (f.length < 2) return null;
      var gone = { }; gone[f[0].id] = 1; gone[f[1].id] = 1;
      var i = inv(); i.items = i.items.filter(function (o) { return !gone[o.id]; });
      it.rarity += 1; it.level = 1;
      return it;
    },

    openChest: function (key) {
      var c = CHESTS[key]; if (!c) return { ok: false, reason: 'unknown' };
      var s = S();
      for (var cur in c.cost) if ((s[cur] || 0) < c.cost[cur]) return { ok: false, reason: cur };
      for (var cur2 in c.cost) s[cur2] -= c.cost[cur2];
      return { ok: true, item: API.roll(c.weights) };
    },
    raidDrops: function (r, chapter) {
      r = r || {}; var w = r.wave | 0, out = [];
      var ws = RAID_WEIGHTS[chapter] || RAID_WEIGHTS[1];
      var n = w >= 3 ? 1 + Math.floor(w / 6) + (r.win ? 1 : 0) : 0;
      for (var i = 0; i < n; i++) out.push(API.roll(ws));
      if (r.bossDown) { var up = ws.slice(); for (var k = up.length - 1; k > 0; k--) { up[k] += up[k - 1] * 0.6; } out.push(API.roll(up)); }
      return out;
    },

    // permanent bonuses from equipped gear, summed per stat (perm units)
    bonuses: function () {
      var out = {};
      SLOTS.forEach(function (s) {
        var it = API.equippedItem(s); if (!it) return;
        API.statsOf(it).forEach(function (st) { out[st.stat] = (out[st.stat] || 0) + st.value; });
      });
      return out;
    },
    power: function () {
      var p = 0; SLOTS.forEach(function (s) { var it = API.equippedItem(s); if (it) p += Math.round(100 * mul(it)); });
      return p;
    },
    sorted: function () {
      var eq = inv().equipped;
      return inv().items.slice().sort(function (a, b) { return (b.rarity - a.rarity) || (b.level - a.level) || (SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot)) || (a.id - b.id); });
    }
  };
  G.inventory = API;
})();
