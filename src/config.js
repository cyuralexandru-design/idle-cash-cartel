// Idle Cash & Cartel - economy config. ALL numbers live here.
window.G = window.G || {};
(function () {
  'use strict';

  // ---- Businesses (unlock order fixed by contract) ----
  // baseCost: cost of level 1. growth: cost multiplier per level (1.07-1.15).
  // baseIncome: cash/s per level (before multipliers). managerCost: one-off cash.
  // growth: cost multiplier per level. payback: seconds for level 1->2 to pay for itself
  // (baseIncome is derived from it so the pacing knob is human-readable).
  var BIZ = [
    ['pub', 'The Rusty Anchor', 1.075, 55, 1],
    ['bookmaker', 'Lucky Seven Bets', 1.075, 55, 12],
    ['garage', 'Dagger Auto Repairs', 1.07, 60, 12],
    ['boxing_club', 'Iron Fist Boxing', 1.07, 700, 12],
    ['nightclub', 'Neon Velvet Club', 1.07, 1500, 15],
    ['restaurant', 'La Rosa Kitchen', 1.07, 4000, 15],
    ['gentlemens_club', 'Velvet Room', 1.07, 11000, 15],
    ['car_dealership', 'Crown Motors', 1.07, 25000, 15],
    ['hotel', 'Grand Meridian Hotel', 1.07, 50000, 15],
    ['casino', 'Royal Spade Casino', 1.07, 110000, 15]
  ];
  var COST_START = 4;       // pub level-1 cost
  var MANAGER_MULT = 15;    // manager cost = baseCost * this

  var businesses = [], prevCost = COST_START;
  BIZ.forEach(function (b, i) {
    var baseCost = i === 0 ? COST_START : Math.round(prevCost * b[4]);
    prevCost = baseCost;
    businesses.push({
      id: b[0], name: b[1], tier: i + 1, unlockIndex: i,
      baseCost: baseCost, growth: b[2],
      baseIncome: +(baseCost * b[2] / b[3]).toPrecision(3),
      paybackSec: b[3],
      managerCost: Math.round(baseCost * MANAGER_MULT)
    });
  });

  // ---- Perm stats (16). perLevel = arena bonus per level (units noted). ----
  // unit: 'pct' = fraction added (0.04 = +4%), 'flat' = absolute amount.
  // 'harvesting' also multiplies idle income (+perLevel per level).
  var STATS = [
    ['damage',       0.04,  'pct',  20, 50],
    ['attack_speed', 0.03,  'pct',  25, 40],
    ['move_speed',   0.02,  'pct',  15, 30],
    ['max_hp',       5,     'flat', 15, 60],
    ['regen',        0.2,   'flat', 25, 40],
    ['armor',        1,     'flat', 25, 30],
    ['crit',         0.02,  'pct',  30, 40],
    ['range',        0.03,  'pct',  20, 30],
    ['luck',         0.02,  'pct',  30, 30],
    ['pickup_range', 0.05,  'pct',  10, 30],
    ['dodge',        0.01,  'pct',  35, 30],
    ['harvesting',   0.04,  'pct',  25, 50],
    ['reload_speed', 0.03,  'pct',  25, 30],
    ['explosion',    0.05,  'pct',  35, 30],
    ['pierce',       0.2,   'flat', 40, 20],
    ['lifesteal',    0.005, 'pct',  40, 20]
  ].map(function (s) {
    return { id: s[0], perLevel: s[1], unit: s[2], baseCost: s[3], maxLevel: s[4] };
  });

  // ---- Weapons (weak -> strong). Gold costs. ----
  var WEAPONS = [
    ['revolver',       0,      20],
    ['pistol',         0,      30],
    ['machine_pistol', 150,    60],
    ['sawn_off',       400,    120],
    ['pump_shotgun',   1000,   250],
    ['smg',            2500,   600],
    ['assault_rifle',  6000,   1500],
    ['sniper',         14000,  3500],
    ['plasma_rifle',   40000,  9000],   // endgame
    ['laser_rifle',    100000, 22000]   // endgame
  ].map(function (w, i) {
    return { id: w[0], tier: i + 1, unlockGold: w[1], levelBase: w[2], levelGrowth: 1.22, maxLevel: 10, startOwned: w[1] === 0 };
  });

  G.config = {
    version: 1,
    saveKey: 'icc_save_v1',
    currencies: {
      cash: { soft: true }, gold: { permanent: true }, gems: { premium: true }, respect: { prestige: 'v2' }
    },
    start: { cash: 15, gold: 0, gems: 0, respect: 0, startWeapon: 'pistol' },
    maxBizLevel: 1000,

    // idle layer
    collectCapSec: 60,           // unmanaged accumulation cap (seconds of income)
    offlineCapSec: 8 * 3600,     // offline earnings cap (8h)
    offlineMinSec: 30,           // below this, no offline popup
    offlineEfficiency: 1.0,

    milestones: { levels: [25, 50, 100, 200, 300, 400], mult: 2 },
    businesses: businesses,

    // boosts: income x2 for 1h; paid with gems or via rewarded-ad stub
    adStub: true,                // no real ads: activateBoost('incomeX2_ad') grants immediately
    boosts: {
      incomeX2_gems: { mult: 2, durationSec: 3600, gemCost: 20 },
      incomeX2_ad:   { mult: 2, durationSec: 3600, ad: true, cooldownSec: 600 },
      maxStackSec: 4 * 3600
    },

    perm: { costGrowth: 1.15, stats: STATS },
    weapons: { list: WEAPONS },

    // raid -> economy conversion
    raid: {
      cashConv: 1.0,              // arena cash -> idle cash
      incomeSecPerWave: 5,        // + this many seconds of idle income per wave reached
      winMult: 1.5,
      goldConv: 1.0,              // arena gold passthrough
      goldPerWave: 4,
      bossGold: 40,
      milestoneEveryWaves: 5, milestoneGold: 8,
      winGold: 40,
      gemMilestones: [10, 20],    // first time bestWave reaches these: +gems
      gemMilestoneReward: 10,
      maxWave: 20
    },

    // Premium shop: DATA ONLY. No payment code. Prices USD (monetization skill ladder).
    shop: {
      starter_pack:     { price: 4.99,  oneTime: true, grants: { gems: 300, gold: 2000, cashIncomeHours: 2, weapon: 'machine_pistol' } },
      remove_ads_speed: { price: 9.99,  oneTime: true, grants: { removeAds: true, idleSpeedMult: 1.5, autoCollectNote: 'convenience only, never pay-to-win' } },
      gems_small:       { price: 0.99,  grants: { gems: 80 } },
      gems_medium:      { price: 4.99,  grants: { gems: 500 } },
      gems_large:       { price: 9.99,  grants: { gems: 1100 } },
      gems_xl:          { price: 19.99, grants: { gems: 2400 } },
      gems_huge:        { price: 49.99, grants: { gems: 6500 } },
      gems_whale:       { price: 99.99, grants: { gems: 14000 } }
    },

    // simulator-only helpers (not used by the game)
    sim: { raidEverySec: 300 }
  };
})();
