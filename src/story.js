/* Tiny dialogue system: portraits left/right, name, typewriter text, tap to continue, skip. */
window.G = window.G || {};
(function () {
  'use strict';
  var M = window.G_MANIFEST || {};
  var $ = function (id) { return document.getElementById(id); };

  function mgrImg(biz, v) { try { return M.managers[biz][v || 'neutral'].file; } catch (e) { return ''; } }
  function heroHead() { try { return M.characters.hero.parts.head_expr_0.file; } catch (e) { return 'assets/characters/hero/head_expr_0.png'; } }

  // speakers: portrait variants by mood
  var MGR_NAMES = { pub: 'Barney', bookmaker: 'Clive', garage: 'Mick', boxing_club: 'Frankie', nightclub: 'Jade', restaurant: 'Big Ray', gentlemens_club: 'Scarlett', car_dealership: 'Danny', hotel: 'Hugo', casino: 'Alistair' };
  var SPEAKERS = {
    hero:   { name: 'The Heir', img: function () { return heroHead(); }, cls: 'sp-hero' },
    barney: { name: 'Barney',   img: function (m) { return mgrImg('pub', m === 'smirk' ? 'smirk' : 'neutral'); }, cls: 'sp-mgr' }
  };

  function speaker(who) {
    if (SPEAKERS[who]) return SPEAKERS[who];
    if (MGR_NAMES[who]) return { name: MGR_NAMES[who], img: function (m) { return mgrImg(who, m === 'smirk' ? 'smirk' : 'neutral'); }, cls: 'sp-mgr' };
    return { name: who, img: function () { return ''; }, cls: '' };
  }
  function dlgImg(biz) { try { return M.map.dialog(biz); } catch (e) { return 'assets/dialog/' + biz + '.jpg'; } }
  function H(t) { return { who: 'hero', side: 'left', text: t }; }
  function B(biz, t, mood) { return { who: biz, side: 'right', text: t, mood: mood }; }

  // First-visit tutorials per business: 5 gritty lines each (idle income, manager auto-collects, milestones x2).
  var BIZ_LINES = {
    pub: [
      B('pub', 'Here she is, boss. The Rusty Anchor. Leaky roof, sticky floor, and the best till in the borough. Every pint pulls cash while you sleep.'),
      H('Pubs pay slow. I need more than slow, Barney.'),
      B('pub', 'Slow adds up. Pour money in, bump the level, and the takings climb every second. Tap the bar to bank what is waiting.'),
      B('pub', 'Hire me proper and I\'ll empty the till myself. You never lift a finger, and it never stops.', 'smirk'),
      B('pub', 'And mark this: every milestone level doubles the lot. Twenty-five, fifty, a hundred. Double and double again.', 'smirk')
    ],
    bookmaker: [
      B('bookmaker', 'Lucky Seven, boss. The house always wins and I keep the sums so it stays that way. Nice, steady, quiet money.'),
      H('Quiet is good. How much does it hold?'),
      B('bookmaker', 'The slips pile up in the drawer until you collect them. Leave them too long and the drawer fills and the winnings stop.'),
      B('bookmaker', 'Put me on the payroll and I bank every slip on the hour. Odds in your favour, always.', 'smirk'),
      B('bookmaker', 'Reach a milestone level and the whole shop doubles its take. I have worked it out twice. It checks out.', 'smirk')
    ],
    garage: [
      B('garage', 'Dagger Auto. We fix what cars you ask about and we do not ask about the rest. Engines ticking over means money ticking in.'),
      H('Whose cars are those on the ramps?'),
      B('garage', 'Nobody\'s you need to worry about. Level the place up, more bays, more jobs, more cash per second.'),
      B('garage', 'Hire me and I run the shop without you. Grease on my hands, not yours.', 'smirk'),
      B('garage', 'Hit a milestone and the income doubles. New lifts, new tools, same old Mick. Get cracking.', 'smirk')
    ],
    boxing_club: [
      B('boxing_club', 'Iron Fist, kid. Sweat, blood and cash on the door. Every fighter I train pays his way.'),
      H('Fighters I can use, Frankie.'),
      B('boxing_club', 'You will have them. First, the gym earns. Upgrade the ring, the bags, the weights. Better gym, bigger purse.'),
      B('boxing_club', 'Hire me as head coach and I handle the gate takings. You stay in your corner and count.', 'smirk'),
      B('boxing_club', 'Milestone levels double the purse. Twenty-five rounds, fifty rounds, and so on. Never drop your guard.', 'smirk')
    ],
    nightclub: [
      B('nightclub', 'Welcome to Neon Velvet, hon. Bass, bottles and a queue round the block. Dance floors print money after midnight.'),
      H('And the cut?'),
      B('nightclub', 'Yours, always. Level the club, better lights, bigger crowds, fatter nights. Tap to collect when the doors close.'),
      B('nightclub', 'Hire me and I count the tills myself. Nobody skims on my watch.', 'smirk'),
      B('nightclub', 'Hit a milestone and the whole place doubles. Twice the crowd, twice the cash, same pretty smile.', 'smirk')
    ],
    restaurant: [
      B('restaurant', 'La Rosa. Best table in the city, and the family eats first. Nobody argues with my sauce.'),
      H('Does it earn, Ray, or just feed people?'),
      B('restaurant', 'Both. Every cover pays. Upgrade the kitchen, the dining room, the wine list. The bill climbs with the class.'),
      B('restaurant', 'Make me head chef and the money lands on its own. You eat, you smile, I do the rest.', 'smirk'),
      B('restaurant', 'Milestone levels double the covers. Think of it as a second service. A very profitable one.', 'smirk')
    ],
    gentlemens_club: [
      B('gentlemens_club', 'The Velvet Room. Quiet corners, loud secrets and gentlemen who pay to forget their names.'),
      H('Secrets I can use, then.'),
      B('gentlemens_club', 'In time. For now the room earns by the minute. Upgrade the stage, the booths, the bar. Better room, bigger tabs.'),
      B('gentlemens_club', 'Hire me as hostess and I take the money and the discretion. Nobody sees a thing.', 'smirk'),
      B('gentlemens_club', 'Every milestone level doubles the take. Gentlemen do love a reason to spend more.', 'smirk')
    ],
    car_dealership: [
      B('car_dealership', 'Crown Motors. Polished chrome, a firm handshake and a price that just got more interesting. Welcome to the showroom.'),
      H('Everything here legitimate?'),
      B('car_dealership', 'Everything here is profitable. Level it up and the stock gets shinier, the margins fatter and the commissions bigger.'),
      B('car_dealership', 'Hire me and I close the deals while you close the others. Hands-free money.', 'smirk'),
      B('car_dealership', 'Milestones double the sales. A new showroom floor, a new class of customer. Everybody wins, mostly me.', 'smirk')
    ],
    hotel: [
      B('hotel', 'Grand Meridian, sir. Marble, chandeliers and guests who never ask what the staff do after midnight.'),
      H('A hotel keeps a lot of rooms and a lot of secrets.'),
      B('hotel', 'Quite. Each room earns its keep. Renovate the lobby, add suites, and the nightly rate rises with the stars.'),
      B('hotel', 'Appoint me manager and the takings are collected, counted and delivered. Discreetly.', 'smirk'),
      B('hotel', 'At each milestone the income doubles. Another wing, another floor, another reason to stay.', 'smirk')
    ],
    casino: [
      B('casino', 'The Royal Spade. Where fortunes arrive in a taxi and leave in a bag. Welcome to the top of the firm.'),
      H('The house always wins, they say.'),
      B('casino', 'The house always wins because I make sure of it. Upgrade the floor, the tables, the high rollers\' room. The pot grows.'),
      B('casino', 'Make me pit boss and I run the tables and the till. You just watch the money walk in.', 'smirk'),
      B('casino', 'Milestone levels double the take. Each one worth a night of the finest losers in London. Deal me in.', 'smirk')
    ]
  };
  // Short scene when a manager is hired
  var HIRE_LINES = {
    pub: [B('pub', 'You will not regret this, boss. I know every drain in this place.', 'smirk'), H('Keep the taps flowing, Barney. I\'ll handle the rest.')],
    bookmaker: [B('bookmaker', 'A wise bet, if I may say. I shall keep the books honest. Mostly.', 'smirk'), H('Honest enough for me, Clive.')],
    garage: [B('garage', 'Right then. Wrench in hand, lights on, nobody touches the ledger but me.', 'smirk'), H('Do the job and keep your mouth shut, Mick.')],
    boxing_club: [B('boxing_club', 'Proud to be in your corner, kid. This gym will never run dry.', 'smirk'), H('Train them hard, Frankie. I\'ll need every one.')],
    nightclub: [B('nightclub', 'Lovely. I\'ll keep the doors open and the cash locked down, hon.', 'smirk'), H('Make it glitter, Jade.')],
    restaurant: [B('restaurant', 'Now we are cooking. Every plate pays, every guest pays more.', 'smirk'), H('Feed them well, Ray. And count twice.')],
    gentlemens_club: [B('gentlemens_club', 'Discretion is my whole business, darling. You can trust the Room to me.', 'smirk'), H('That is what I am counting on, Scarlett.')],
    car_dealership: [B('car_dealership', 'Sold! Another happy customer, and the customer is you. I\'ll move the metal.', 'smirk'), H('Close the deals, Danny. Keep the keys safe.')],
    hotel: [B('hotel', 'It will be my pleasure to serve. The Meridian will shine under my care.', 'smirk'), H('See that it does, Hugo.')],
    casino: [B('casino', 'The pit is mine now. Let the chips fall where you want them, boss.', 'smirk'), H('Make the house win, Alistair.')]
  };

  var INTRO = [
    { who: 'barney', side: 'right', text: 'Oi, look what the rain dragged in. Your old man\'s firm is in bits, son. Every crew from here to the river has been picking at it since the funeral.' },
    { who: 'hero',   side: 'left',  text: 'Then I\'ll put it back together, Barney. The pub first. Then every last one of them.' },
    { who: 'barney', side: 'right', mood: 'smirk', text: 'That\'s the spirit. The Anchor\'s still ours, bar the leaky roof. Keep the till full and the lads will follow you.' },
    { who: 'hero',   side: 'left',  text: 'And the Docklands mob? They\'ve been sitting on our stash houses.' },
    { who: 'barney', side: 'right', mood: 'smirk', text: 'Then hit them where it hurts. Raid the wharves, bring the cash home, and I\'ll keep the books honest. Welcome back to the firm, boss.' }
  ];

  var root = null, cur = null;

  function h(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function ensureRoot() {
    if (root && root.parentNode) return root;
    root = h('div', 'story'); root.id = 'story-root'; root.hidden = true;
    $('stage').appendChild(root); return root;
  }

  var API = {
    lines: { intro: INTRO },
    bizLines: BIZ_LINES, hireLines: HIRE_LINES,
    isOpen: function () { return !!cur; },
    seen: function (id) { try { var s = G.save.state; return !!(s.story && s.story.seen && s.story.seen[id]); } catch (e) { return false; } },
    markSeen: function (id) {
      try { var s = G.save.state; if (!s.story) s.story = { seen: {} }; if (!s.story.seen) s.story.seen = {}; s.story.seen[id] = true; G.save.save(); } catch (e) {}
    },
    seenBiz: function (id) { try { var s = G.save.state; return !!(s.story && s.story.seenBiz && s.story.seenBiz[id]); } catch (e) { return true; } },
    markSeenBiz: function (id) { try { var s = G.save.state; if (!s.story) s.story = { seen: {} }; if (!s.story.seenBiz) s.story.seenBiz = {}; s.story.seenBiz[id] = true; G.save.save(); } catch (e) {} },
    playBiz: function (id, onDone) {
      var l = BIZ_LINES[id]; if (!l) return false;
      return API.play(l, { bg: dlgImg(id), onDone: function () { API.markSeenBiz(id); if (onDone) onDone(); } });
    },
    playHire: function (id, onDone) {
      var l = HIRE_LINES[id]; if (!l) return false;
      return API.play(l, { bg: dlgImg(id), onDone: onDone });
    },
    // play(lines | id, {id, onDone, bg})
    play: function (lines, o) {
      o = o || {}; if (typeof lines === 'string') { o.id = o.id || lines; lines = API.lines[lines]; }
      if (!lines || !lines.length || cur) return false;
      var r = ensureRoot(); r.innerHTML = ''; r.hidden = false; r.classList.remove('out'); r.classList.toggle('scene', !!o.bg);
      if (o.bg) {
        var sb = h('div', 'story-bg'); sb.style.backgroundImage = 'url("' + o.bg + '")'; r.appendChild(sb);
        var si = new Image(); si.className = 'story-scene'; si.alt = ''; si.draggable = false; si.src = o.bg; r.appendChild(si);
      }
      var dim = h('div', 'story-dim');
      var left = h('div', 'story-por left'), right = h('div', 'story-por right');
      var pl = new Image(), pr = new Image(); pl.draggable = pr.draggable = false; left.appendChild(pl); right.appendChild(pr);
      var box = h('div', 'story-box');
      var nm = h('div', 'story-name'), tx = h('div', 'story-text'), hint = h('div', 'story-hint', 'Tap to continue');
      box.appendChild(nm); box.appendChild(tx); box.appendChild(hint);
      var skip = h('button', 'story-skip', 'Skip');
      if (!o.bg) r.appendChild(dim); r.appendChild(left); r.appendChild(right); r.appendChild(box); r.appendChild(skip);
      var i = -1, timer = null, full = '', pos = 0, typing = false, done = false;
      cur = { };

      function finish() {
        if (done) return; done = true; clearInterval(timer); cur = null;
        r.classList.add('out');
        setTimeout(function () { r.hidden = true; r.innerHTML = ''; }, 260);
        if (o.id) API.markSeen(o.id);
        if (o.onDone) try { o.onDone(); } catch (e) {}
      }
      function typeTick() {
        pos += 2; tx.textContent = full.slice(0, pos);
        if (pos >= full.length) { typing = false; clearInterval(timer); box.classList.add('ready'); }
      }
      function show(n) {
        var ln = lines[n], sp = speaker(ln.who);
        var side = ln.side || (n % 2 ? 'left' : 'right');
        var src = sp.img(ln.mood);
        var img = side === 'left' ? pl : pr, other = side === 'left' ? pr : pl;
        if (src && img.getAttribute('src') !== src) img.setAttribute('src', src);
        img.parentNode.className = 'story-por ' + side + ' on ' + sp.cls; other.parentNode.classList.remove('on');
        if (o.bg) { left.style.visibility = right.style.visibility = 'hidden'; } else
        if (!img.getAttribute('src')) img.parentNode.style.visibility = 'hidden'; else img.parentNode.style.visibility = '';
        box.className = 'story-box ' + side; nm.textContent = sp.name;
        full = ln.text; pos = 0; tx.textContent = ''; typing = true; clearInterval(timer); timer = setInterval(typeTick, 22);
      }
      function next() {
        if (done) return;
        if (typing) { pos = full.length; tx.textContent = full; typing = false; clearInterval(timer); box.classList.add('ready'); return; }
        i++; if (i >= lines.length) { finish(); return; }
        show(i);
      }
      dim.addEventListener('click', next); if (o.bg) r.addEventListener('click', next); box.addEventListener('click', next); left.addEventListener('click', next); right.addEventListener('click', next);
      skip.addEventListener('click', function (e) { e.stopPropagation(); finish(); });
      next();
      cur.skip = finish; cur.next = next;
      return true;
    },
    skip: function () { if (cur && cur.skip) cur.skip(); },
    next: function () { if (cur && cur.next) cur.next(); },
    maybeIntro: function (onDone) {
      if (API.seen('intro')) return false;
      return API.play('intro', { id: 'intro', onDone: onDone });
    },
    preloadFiles: function () { return [heroHead(), mgrImg('pub', 'neutral'), mgrImg('pub', 'smirk')].filter(Boolean); }
  };
  G.story = API;
})();
