# Idle Cash & Cartel — build contract (all agents read this first)

Game: portrait mobile idle-tycoon hub + top-down arena shooter (Brotato-like raids). Theme: modern-day gritty London crime family, rainy night, noir palette. UI text in ENGLISH. Invented names only (no real brands/characters).
Palette tokens: charcoal #14161a, panel #1f2227, amber #e8a317, red #b3202a, cash green #4caf50, gem purple #8e44ad, text #f2efe9.

## Stack rules
- Vanilla JS, NO npm/bundler/framework, classic <script> tags (NO ES modules, NO fetch of local files) so it runs from file:// and on Cloudflare Pages.
- Global namespace `window.G`. Every module starts with `window.G = window.G || {};`.
- Logical canvas 540x960 (portrait 9:16), scaled to fit the screen. Touch + keyboard (WASD) input.
- Project root: /home/claude/game. Original art (READ-ONLY, never modify): /home/claude/assets/raw/*.png
- Python3 with PIL/numpy is available (pip install --break-system-packages scipy if missing). Playwright+Chromium is pre-installed (require('playwright') / python playwright) for headless testing; serve with `python3 -m http.server`.
- Only write inside the directories you own (below). Do not edit other agents' files.

## Ownership
- Agent slice-characters: assets/characters/**, assets/manifests/characters.js
- Agent slice-items: assets/weapons/**, assets/businesses/**, assets/managers/**, assets/manifests/items.js
- Agent slice-ui: assets/icons/**, assets/stats/**, assets/ui/**, assets/misc/**, assets/manifests/ui.js
- Agent slice-world: assets/props/**, assets/fx/**, assets/bg/**, assets/manifests/world.js
- Agent economy: src/config.js, src/save.js, src/economy.js, tests/economy_*.js
- Agent arena: src/arena_config.js, src/arena.js, src/arena_ui.js, src/audio.js, tests/arena_*
- Later agents: src/puppet.js, src/ui.js, src/main.js, index.html, css/

## Asset rules
PNG, transparent background, trimmed to content with 2px padding, lowercase snake_case names, original resolution (no upscaling). Verify every cut by compositing on a magenta (#ff00ff) background and LOOKING at a contact sheet (use the Read tool on the PNG) before reporting. Remove baked-in backgrounds/glow/checkerboard when a sheet is RGB or has an opaque backdrop.

## Manifest format (JS files, no fetch)
Each manifest file: `window.G_MANIFEST = window.G_MANIFEST || {}; window.G_MANIFEST.<name> = {...};`
Each sprite entry: `{ "file": "assets/weapons/pistol_side.png", "w": 120, "h": 64, "pivot": [x,y] }` (pivot optional, pixel coords inside the cut image; add extra named points like grip/muzzle where relevant). Paths are relative to index.html (project root).

## Fixed ids
Businesses (unlock order): pub, bookmaker, garage, boxing_club, nightclub, restaurant, gentlemens_club, car_dealership, hotel, casino. Levels art: 1 run-down, 2 clean, 3 premium.
English display names: pub "The Rusty Anchor", bookmaker "Lucky Seven Bets", garage "Dagger Auto Repairs", boxing_club "Iron Fist Boxing", nightclub "Neon Velvet Club", restaurant "La Rosa Kitchen", gentlemens_club "Velvet Room", car_dealership "Crown Motors", hotel "Grand Meridian Hotel", casino "Royal Spade Casino".
Weapons (weak→strong): revolver, pistol, machine_pistol, sawn_off, pump_shotgun, smg, assault_rifle, sniper, plasma_rifle, laser_rifle. Weapon art angles: side (points right), down_right, up_right, front, rear.
Characters: hero, thug_knife, thug_bat, gunman_smg, bruiser_shotgun, boss_leader (V1); sniper_ghillie, molotov_thrower, riot_shield, attack_dog, drone_operator, mini_boss (extra).
Currencies: cash (soft, in-run + idle), gold (permanent upgrades), gems (rare premium), respect (prestige, V2).
Stats (16): damage, attack_speed, move_speed, max_hp, regen, armor, crit, range, luck, pickup_range, dodge, harvesting, reload_speed, explosion, pierce, lifesteal.

## Save state (G.save.state, versioned, localStorage key "icc_save_v1", every access in try/catch)
{ v:1, cash, gold, gems, respect, lastSeen(ms), businesses:{<id>:{level:int, manager:bool}}, weapons:{<id>:{owned:bool, level:int}}, startWeapon:'pistol', perm:{<statId>:int}, stats:{bestWave, runs, totalCash}, settings:{sound:true, shake:true, flashes:true}, boosts:{incomeX2Until:ms} }

## Module APIs
- G.save: load(), save(), reset(), state, exportString(), importString(s).
- G.economy: bizList(), costNext(id,n), buy(id,n|'max'), hireManager(id), incomePerSec(), tick(dtSec), offlineEarnings(nowMs)->{seconds,cash,capped}, claimOffline(mult), applyRaidResult({win,wave,kills,cash,gold,bossDown}), getPermBonuses()->{<stat>:value}, buyPerm(statId), buyWeaponLevel(id), unlockWeapon(id), activateBoost(kind).
- G.arena: start({canvas, onEnd(result), loadout?}), stop(), pause(), resume(), state (live data for HUD: hp,maxHp,xp,level,wave,timeLeft,cash,gold,weapons[]). result = {win,wave,kills,cash,gold,bossDown}. Reads G.economy.getPermBonuses() and G.save.state if present (must work without them for tests).
- G.puppet (later agent): draw(ctx, actor), sizeOf(kind)->{w,h,footY}, ready(). actor = {kind, x, y(feet), facing(rad, 0=right), moving, speed(0..1), state:'idle'|'walk'|'shoot'|'hurt'|'dead', t(sec since state change), animT, weaponId, scale}. Until G.puppet exists, arena draws simple outlined shapes via the same actor struct.
- G.audio: play(name) with WebAudio-synthesized sounds (shoot, hit, explode, coin, levelup, click, boss, hurt, buy), mute from settings.

## Reporting
Final report to the lead: max 200 words — what was produced, file paths, caveats. No huge dumps.
