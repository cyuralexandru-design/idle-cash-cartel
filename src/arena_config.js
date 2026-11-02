/* Arena config: every tunable number for the arena shooter lives here. */
window.G = window.G || {};
(function () {
  var C = {};
  C.W = 540; C.H = 960;
  C.DT = 1 / 60;
  // ---------- world / camera ----------
  C.WORLD_W = 1620; C.WORLD_H = 2400;   // world is larger than the 540x960 viewport
  C.CAM_ZOOM = 1.35;                    // ctx scale; visible world rect = 540/zoom x 960/zoom
  C.CAM_LERP = 7;                       // follow speed (1/s), exponential smoothing
  C.HERO_MARGIN = 40;                   // hero keeps this far from the world edge
  C.SPAWN_OUT = 40;                     // enemies spawn this far outside the visible camera rect
  C.PROP_COUNT = 34; C.PROP_SCALE = 0.45; C.PROP_CLEAR = 150;   // props: count, sprite scale, no-prop radius around hero start
  C.BORDER = 60;                        // dark wall strip thickness drawn around the world
  C.DECAL_CAP = 60; C.RAIN_STREAKS = 48;
  C.MAX_STEPS_PER_FRAME = 5;

  // ---------- run structure ----------
  // Each chapter is a separate 15-wave run (see CHAPTERS). Wave length: 20s, +2s per wave, capped at 40s; the boss wave lasts up to BOSS_WAVE_TIME.
  C.WAVES = 15;                 // default chapter length (CHAPTERS[i].waves overrides)
  C.WAVE_BASE_TIME = 20;        // seconds, wave 1
  C.WAVE_TIME_PER_WAVE = 2;     // +2s per wave
  C.WAVE_TIME_CAP = 40;
  C.BOSS_WAVE_TIME = 60;        // boss wave ends when the boss dies or after this
  C.SPECIAL_AT = 2.0;           // seconds into the elite / super elite wave when the special enemy appears
  C.BOSS_SPAWN_AT = 1.0;
  // elite = beefed-up thug (scale 1.35); super elite = mini_boss; boss = chapter boss (bossMods scale the base def)
  C.CHAPTERS = [
    { id: 1, name: 'Docklands',    waves: 15, elite: 5, superElite: 10, boss: 15, eliteKind: 'thug_bat',        bossKind: 'boss_leader', bossName: 'The Boss',
      diff: { hp: 1,   dmg: 1,   count: 1,    speed: 1 },    bossMods: { hp: 1,   dmg: 1,   scale: 1 },    bg: { tint: '#ffffff', alpha: 0 } },
    { id: 2, name: 'Soho',         waves: 15, elite: 5, superElite: 10, boss: 15, eliteKind: 'gunman_smg',      bossKind: 'mini_boss',   bossName: 'The Fixer',
      diff: { hp: 1.35, dmg: 1.15, count: 1.1, speed: 1.03 }, bossMods: { hp: 3.4, dmg: 1.5, scale: 1.3 },  bg: { tint: '#b48cff', alpha: 0.28 } },
    { id: 3, name: 'Canary Wharf', waves: 15, elite: 5, superElite: 10, boss: 15, eliteKind: 'bruiser_shotgun', bossKind: 'boss_leader', bossName: 'The Chairman',
      diff: { hp: 1.8, dmg: 1.3, count: 1.2, speed: 1.06 }, bossMods: { hp: 1.9, dmg: 1.6, scale: 1.2 }, bg: { tint: '#6fb4ff', alpha: 0.26 } }
  ];
  C.ELITE_WAVE = { hp: 9, dmg: 1.35, scale: 1.35, value: 4 };     // elite wave special (flagged elite)
  C.STAR_HP = [0, 0.3, 0.6];    // stars on win: 1 + (min HP ratio over the run >= each threshold)
  C.waveTime = function (w, last) {
    if (last) return C.BOSS_WAVE_TIME;
    return Math.min(C.WAVE_TIME_CAP, C.WAVE_BASE_TIME + C.WAVE_TIME_PER_WAVE * (w - 1));
  };
  // danger scaling
  C.hpMult = function (w) { return 1 + 0.2 * (w - 1) + 0.02 * (w - 1) * (w - 1); };
  C.dmgMult = function (w) { return 1 + 0.05 * (w - 1); };
  C.speedMult = function (w) { return 1 + 0.012 * (w - 1); };
  C.waveEnemyCount = function (w) { return Math.round(11 + 5.2 * w + 0.3 * w * w); };
  C.ELITES_PER_WAVE = function (w) { return w < 7 ? 0 : Math.floor((w - 3) / 4); };
  C.ELITE = { hp: 3, dmg: 1.3, scale: 1.35, value: 3, goldChance: 0.35 };
  C.ALIVE_CAP = 400;
  C.SPAWN_WARN = 0.7;           // seconds of warning marker
  C.SPAWN_MARGIN = 14;
  // enemy spawn weights per wave: [kind, firstWave, weight]
  C.SPAWN_TABLE = [
    ['thug_knife', 1, 5], ['thug_bat', 2, 3], ['gunman_smg', 3, 2.2], ['bruiser_shotgun', 5, 1.1]
  ];

  // ---------- hero ----------
  C.WAVE_END_HEAL = 0.3;        // fraction of max HP restored between waves
  C.CRIT_MULT = 2;
  C.HERO = { r: 12, speed: 175, invuln: 0.25, startHp: 60 };

  // ---------- stats (16 ids from the contract) ----------
  C.STAT_IDS = ['damage', 'attack_speed', 'move_speed', 'max_hp', 'regen', 'armor', 'crit', 'range', 'luck', 'pickup_range', 'dodge', 'harvesting', 'reload_speed', 'explosion', 'pierce', 'lifesteal'];
  C.STATS = {
    damage:       { base: 0,   card: 8,   cap: [-90, 999], name: 'Damage',        unit: '%',  emblem: 'DM', color: '#d9534f', desc: 'Bonus weapon damage' },
    attack_speed: { base: 0,   card: 8,   cap: [-60, 300], name: 'Attack Speed',  unit: '%',  emblem: 'AS', color: '#e8a317', desc: 'Weapons fire faster' },
    move_speed:   { base: 100, card: 5,   cap: [40, 220],  name: 'Move Speed',    unit: '%',  emblem: 'MS', color: '#5dade2', desc: 'Run faster' },
    max_hp:       { base: 60,  card: 8,   cap: [10, 999],  name: 'Max HP',        unit: '',   emblem: 'HP', color: '#e74c3c', desc: 'More health' },
    regen:        { base: 0.3, card: 0.4, cap: [0, 20],    name: 'Regeneration',  unit: '/s', emblem: 'RG', color: '#2ecc71', desc: 'HP per second' },
    armor:        { base: 0,   card: 1,   cap: [-5, 60],   name: 'Armor',         unit: '',   emblem: 'AR', color: '#95a5a6', desc: 'Reduces damage taken' },
    crit:         { base: 5,   card: 4,   cap: [0, 100],   name: 'Crit Chance',   unit: '%',  emblem: 'CR', color: '#f39c12', desc: 'Chance for double damage' },
    range:        { base: 0,   card: 25,  cap: [-100, 400], name: 'Range',        unit: '',   emblem: 'RN', color: '#1abc9c', desc: 'Longer weapon range' },
    luck:         { base: 0,   card: 6,   cap: [-50, 300],  name: 'Luck',         unit: '',   emblem: 'LK', color: '#8e44ad', desc: 'Better cards, more gold' },
    pickup_range: { base: 60,  card: 25,  cap: [20, 600],  name: 'Pickup Range',  unit: '',   emblem: 'PR', color: '#4caf50', desc: 'Magnet pulls cash from further' },
    dodge:        { base: 0,   card: 3,   cap: [0, 60],    name: 'Dodge',         unit: '%',  emblem: 'DG', color: '#bdc3c7', desc: 'Chance to avoid a hit' },
    harvesting:   { base: 0,   card: 2,   cap: [0, 200],   name: 'Harvesting',    unit: '',   emblem: 'HV', color: '#27ae60', desc: 'Free cash + XP each wave' },
    reload_speed: { base: 0,   card: 10,  cap: [-50, 300], name: 'Reload Speed',  unit: '%',  emblem: 'RL', color: '#e67e22', desc: 'Faster magazine reloads' },
    explosion:    { base: 0,   card: 10,  cap: [0, 400],   name: 'Explosion',     unit: '%',  emblem: 'EX', color: '#ff7043', desc: 'Bigger splash; shots splash' },
    pierce:       { base: 0,   card: 1,   cap: [0, 12],    name: 'Pierce',        unit: '',   emblem: 'PC', color: '#9b59b6', desc: 'Bullets pass through enemies' },
    lifesteal:    { base: 0,   card: 2,   cap: [0, 40],    name: 'Lifesteal',     unit: '%',  emblem: 'LS', color: '#c0392b', desc: 'Chance to heal on hit' }
  };
  C.TIER_NAMES = ['I', 'II', 'III', 'IV'];
  C.TIER_MULT = [1, 1.6, 2.4, 3.6];       // weapon damage and card value multiplier
  C.TIER_COLORS = ['#9aa0a6', '#4fa3e0', '#a45ee0', '#e8a317'];
  C.TIER_PRICE_MULT = [1, 2, 4, 8];       // weapon value (merge = 2 of previous)
  C.TIER_WEIGHTS = [70, 22, 7, 1];        // card rarity roll (base)
  C.CARD_CHOICES = 4;
  C.GUARANTEE_EVERY = 5;                  // levels: min tier = floor(level/5)+1 for one card
  C.xpNeed = function (lvl) { return Math.round(6 + 3 * lvl + 0.9 * lvl * lvl); };
  C.cardRerollCost = function (lvl, times) { return Math.floor(3 + lvl * 1.5) + 4 * times; };
  C.LIFESTEAL_COOLDOWN = 0.12;

  // ---------- weapons ----------
  // grip/muzzle: pixel offsets inside the weapon side sprite (points right), for later puppet attachment.
  // dmg = per pellet, rate = shots/s, mag/reload = magazine size / reload seconds.
  C.WEAPON_IDS = ['revolver', 'pistol', 'machine_pistol', 'sawn_off', 'pump_shotgun', 'smg', 'assault_rifle', 'sniper', 'plasma_rifle', 'laser_rifle'];
  C.WEAPONS = {
    revolver:       { name: 'Revolver',       dmg: 16, rate: 1.7, range: 270, speed: 560, pellets: 1, spread: 0.03, pierce: 0, mag: 6,  reload: 1.1, price: 24,  color: '#fff3b0', grip: [10, 22], muzzle: [58, 14] },
    pistol:         { name: 'Pistol',         dmg: 10, rate: 3.5, range: 250, speed: 540, pellets: 1, spread: 0.05, pierce: 0, mag: 12, reload: 1.0, price: 30,  color: '#fff3b0', grip: [10, 22], muzzle: [60, 12] },
    machine_pistol: { bsc: 0.85, tr: 2, name: 'Machine Pistol', dmg: 4.5, rate: 8, range: 210, speed: 520, pellets: 1, spread: 0.14, pierce: 0, mag: 24, reload: 1.3, price: 46,  color: '#fff3b0', grip: [14, 24], muzzle: [66, 14] },
    sawn_off:       { bsc: 0.7, tr: 2, name: 'Sawn-Off',       dmg: 7,  rate: 1.0, range: 170, speed: 480, pellets: 6, spread: 0.55, pierce: 0, mag: 2,  reload: 1.1, price: 55,  color: '#ffd9a0', grip: [16, 24], muzzle: [70, 12] },
    pump_shotgun:   { bsc: 0.7, tr: 2, name: 'Pump Shotgun',   dmg: 6.5, rate: 1.3, range: 200, speed: 500, pellets: 7, spread: 0.42, pierce: 0, mag: 6,  reload: 1.5, price: 84,  color: '#ffd9a0', grip: [20, 26], muzzle: [100, 14] },
    smg:            { bsc: 0.85, tr: 2, name: 'SMG',            dmg: 6,  rate: 9.5, range: 230, speed: 540, pellets: 1, spread: 0.09, pierce: 0, mag: 32, reload: 1.5, price: 96,  color: '#fff3b0', grip: [22, 26], muzzle: [90, 14] },
    assault_rifle:  { bsc: 1, tr: 1, name: 'Assault Rifle',  dmg: 13, rate: 5.5, range: 340, speed: 640, pellets: 1, spread: 0.05, pierce: 0, mag: 30, reload: 1.7, price: 140, color: '#fff3b0', grip: [30, 28], muzzle: [118, 14] },
    sniper:         { bsc: 1.3, tr: 1, name: 'Sniper',         dmg: 85, rate: 0.62, range: 560, speed: 1000, pellets: 1, spread: 0.0, pierce: 2, mag: 5,  reload: 2.0, price: 160, color: '#ffffff', grip: [30, 28], muzzle: [140, 14] },
    plasma_rifle:   { name: 'Plasma Rifle',   dmg: 24, rate: 2.2, range: 310, speed: 380, pellets: 1, spread: 0.04, pierce: 0, splash: 58, bolt: 'plasma', mag: 12, reload: 1.6, price: 210, color: '#7df9ff', grip: [30, 28], muzzle: [120, 16] },
    laser_rifle:    { name: 'Laser Rifle',    dmg: 17, rate: 3.0, range: 360, speed: 0,   pellets: 1, spread: 0.0, beam: true, mag: 0, reload: 0, price: 230, color: '#ff3b30', grip: [30, 28], muzzle: [126, 14] }
  };
  // ONE weapon per run: the start weapon upgrades through tiers I..IV (bought in the between-wave shop).
  // Tier mults apply on top of the (possibly evolved) weapon def. extra pierce / projectiles kick in at higher tiers.
  C.WEAPON_TIERS = [
    { dmg: 1,    rate: 1,    pierce: 0, proj: 0, range: 0 },
    { dmg: 1.45, rate: 1.12, pierce: 0, proj: 0, range: 15 },
    { dmg: 2.1,  rate: 1.25, pierce: 1, proj: 0, range: 30 },
    { dmg: 3.0,  rate: 1.4,  pierce: 2, proj: 1, range: 50 }
  ];
  // evolution: the weapon sprite/def swaps by tier (index = tier). Unlisted weapons keep their id.
  C.EVOLVE = {
    revolver:       ['revolver', 'revolver', 'assault_rifle', 'sniper'],
    pistol:         ['pistol', 'pistol', 'machine_pistol', 'smg'],
    machine_pistol: ['machine_pistol', 'machine_pistol', 'smg', 'assault_rifle'],
    sawn_off:       ['sawn_off', 'sawn_off', 'pump_shotgun', 'pump_shotgun'],
    smg:            ['smg', 'smg', 'assault_rifle', 'assault_rifle']
  };
  C.UPGRADE_UNLOCK_WAVE = [3, 6, 9];                // shop after this wave (or later) offers the upgrade to tier II, III, IV
  C.UPGRADE_PRICE = [70, 160, 340];
  C.upgradePrice = function (tier, wave) { return Math.round(C.UPGRADE_PRICE[tier] * (1 + 0.05 * (wave - 1))); };
  C.weaponIdAt = function (base, tier) { var e = C.EVOLVE[base]; return (e && e[tier]) || base; };
  C.WEAPON_LEVEL_DMG = 0.08;     // permanent weapon level (G.save.state.weapons[id].level) damage bonus per level
  C.START_WEAPON = 'pistol';
  C.RECYCLE_REFUND = 0.25;      // passive items only
  C.BULLET_R = 3.5;
  C.BULLET_SCALE = 0.3;          // tracer sprite scale (bullet_0 is 56px long)
  C.ENEMY_BULLET_SCALE = 0.36;
  C.ENEMY_BULLET_R = 5;

  // ---------- passive items (shop) ----------
  C.ITEMS = {
    brass_knuckles: { name: 'Brass Knuckles',  icon: 'brass_knuckles', price: 34, mods: { damage: 10 },                            desc: '+10% damage' },
    adrenaline:     { name: 'Adrenaline Shot', icon: 'lightning', price: 36, mods: { attack_speed: 10, max_hp: -4 },         desc: '+10% attack speed, -4 max HP' },
    running_shoes:  { name: 'Running Shoes',   icon: 'fast_forward', price: 28, mods: { move_speed: 8 },                        desc: '+8% move speed' },
    kevlar:         { name: 'Kevlar Vest',     icon: 'armor_vest', price: 38, mods: { armor: 2, max_hp: 6, move_speed: -3 },  desc: '+2 armor, +6 HP, -3% speed' },
    medkit:         { name: 'Medkit',          icon: 'medkit', price: 32, mods: { max_hp: 14, regen: 0.4 },               desc: '+14 max HP, +0.4 regen' },
    lucky_coin:     { name: 'Lucky Coin',      icon: 'dice', price: 30, mods: { luck: 12, harvesting: 2 },              desc: '+12 luck, +2 harvesting' },
    magnet:         { name: 'Cash Magnet',     icon: 'coins_up', price: 24, mods: { pickup_range: 45 },                     desc: '+45 pickup range' },
    scope:          { name: 'Scope',           icon: 'crosshair', price: 32, mods: { range: 45, crit: 5 },                   desc: '+45 range, +5% crit' },
    ap_rounds:      { name: 'AP Rounds',       icon: 'bullet', price: 44, mods: { pierce: 1, damage: -3 },                desc: '+1 pierce, -3% damage' },
    grenade_pin:    { name: 'Grenade Pin',     icon: 'grenade', price: 40, mods: { explosion: 20 },                        desc: '+20% explosion' },
    wolf_fang:      { name: 'Wolf Fang',       icon: 'heart', price: 36, mods: { lifesteal: 3 },                         desc: '+3% lifesteal' },
    smoke_bomb:     { name: 'Smoke Bomb',      icon: 'balaclava', price: 34, mods: { dodge: 5 },                             desc: '+5% dodge' },
    speedloader:    { name: 'Speedloader',     icon: 'res_ammo_box', price: 28, mods: { reload_speed: 20 },                     desc: '+20% reload speed' },
    glass_cannon:   { name: 'Glass Cannon',    icon: 'skull', price: 46, mods: { damage: 20, max_hp: -12 },              desc: '+20% damage, -12 max HP' }
  };
  // ---------- shop ----------
  C.SHOP_OFFERS = 4;
  C.shopPrice = function (base, wave) { return Math.round(base * (1 + 0.07 * (wave - 1))); };
  C.shopRerollCost = function (wave, times) { return Math.floor(4 + 2.5 * wave) + times * Math.floor(2 + wave * 0.5); };

  // ---------- enemies ----------
  // hp = base hp (scaled by hpMult), spd = px/s, dmg = contact dmg or bullet dmg, val = cash/xp per drop
  C.ENEMIES = {
    thug_knife:      { hp: 13,  spd: 112, dmg: 6,  r: 10, val: 1, color: '#5dade2', sides: 3, melee: true,  atkCd: 0.55 },
    thug_bat:        { hp: 30,  spd: 74,  dmg: 10, r: 13, val: 2, color: '#e67e22', sides: 4, melee: true,  atkCd: 0.8 },
    gunman_smg:      { hp: 22,  spd: 62,  dmg: 5,  r: 11, val: 2, color: '#1abc9c', sides: 4, rot: 0.785, keep: 230, burst: 3, burstGap: 0.12, fireCd: 2.0, bspd: 230, goldChance: 0.01 },
    bruiser_shotgun: { hp: 120, spd: 40,  dmg: 4,  r: 20, val: 5, color: '#8d99a6', sides: 6, melee: true, atkCd: 1.0, contact: 10, shotRange: 210, pellets: 5, spread: 0.5, fireCd: 2.6, bspd: 220, goldChance: 0.06 },
    mini_boss:       { hp: 1300, spd: 56, dmg: 7,  r: 28, val: 5, color: '#c0392b', sides: 8, boss: true, name: 'Mini Boss', contact: 14, gold: 2, drops: 8, patterns: ['spread', 'charge', 'summon'], summon: 3, pellets: 9, spread: 0.9, bspd: 240 },
    boss_leader:     { hp: 3800, spd: 52, dmg: 8,  r: 34, val: 8, color: '#b3202a', sides: 10, boss: true, name: 'The Boss', contact: 18, gold: 5, drops: 14, patterns: ['spread', 'charge', 'summon', 'ring'], summon: 5, pellets: 12, spread: 1.1, bspd: 260 }
  };
  C.BOSS_MOVE_TIME = 1.8;
  C.BOSS_TELEGRAPH = 0.6;
  C.BOSS_CHARGE_SPEED = 400;
  C.BOSS_CHARGE_TIME = 0.7;
  C.BOSS_HP_SCALE = function (w) { return 1 + 0.05 * (w - 1); };   // bosses scale lighter than rank and file

  // ---------- pickups ----------
  C.PICKUP_CAP = 300;
  C.MAGNET_SPEED = 380;
  C.BAG_RESPAWN_MAX = 40;        // max notes respawned from the bag each wave
  C.GOLD_BAR_XP = 3;
  // pickup visuals by value: single bill < fan of bills < bundle (cash_stack icon) < money bag. Gold = gold_bars icon.
  C.PICKUP_TIERS = [{ min: 0, kind: 'bill' }, { min: 3, kind: 'fan' }, { min: 8, kind: 'stack' }, { min: 30, kind: 'bag' }];
  C.CASH_MULT = 2.5;            // cash per note value (XP per note = value)
  C.BOSS_WIN_CASH = 0;           // optional bonus cash on win

  // ---------- pools / perf ----------
  C.POOL = { enemies: 420, bullets: 700, pickups: 320, particles: 320 };
  C.GRID_CELL = 48;

  G.ARENA_CFG = C;
})();
