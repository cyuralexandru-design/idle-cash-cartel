/* Tiny dialogue system: portraits left/right, name, typewriter text, tap to continue, skip. */
window.G = window.G || {};
(function () {
  'use strict';
  var M = window.G_MANIFEST || {};
  var $ = function (id) { return document.getElementById(id); };

  function mgrImg(biz, v) { try { return M.managers[biz][v || 'neutral'].file; } catch (e) { return ''; } }
  function heroHead() { try { return M.characters.hero.parts.head_expr_0.file; } catch (e) { return 'assets/characters/hero/head_expr_0.png'; } }

  // speakers: portrait variants by mood
  var SPEAKERS = {
    hero:   { name: 'The Heir', img: function () { return heroHead(); }, cls: 'sp-hero' },
    barney: { name: 'Barney',   img: function (m) { return mgrImg('pub', m === 'smirk' ? 'smirk' : 'neutral'); }, cls: 'sp-mgr' }
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
    isOpen: function () { return !!cur; },
    seen: function (id) { try { var s = G.save.state; return !!(s.story && s.story.seen && s.story.seen[id]); } catch (e) { return false; } },
    markSeen: function (id) {
      try { var s = G.save.state; if (!s.story) s.story = { seen: {} }; if (!s.story.seen) s.story.seen = {}; s.story.seen[id] = true; G.save.save(); } catch (e) {}
    },
    // play(lines | id, {id, onDone})
    play: function (lines, o) {
      o = o || {}; if (typeof lines === 'string') { o.id = o.id || lines; lines = API.lines[lines]; }
      if (!lines || !lines.length || cur) return false;
      var r = ensureRoot(); r.innerHTML = ''; r.hidden = false; r.classList.remove('out');
      var dim = h('div', 'story-dim');
      var left = h('div', 'story-por left'), right = h('div', 'story-por right');
      var pl = new Image(), pr = new Image(); pl.draggable = pr.draggable = false; left.appendChild(pl); right.appendChild(pr);
      var box = h('div', 'story-box');
      var nm = h('div', 'story-name'), tx = h('div', 'story-text'), hint = h('div', 'story-hint', 'Tap to continue');
      box.appendChild(nm); box.appendChild(tx); box.appendChild(hint);
      var skip = h('button', 'story-skip', 'Skip');
      r.appendChild(dim); r.appendChild(left); r.appendChild(right); r.appendChild(box); r.appendChild(skip);
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
        var ln = lines[n], sp = SPEAKERS[ln.who] || { name: ln.who, img: function () { return ''; }, cls: '' };
        var side = ln.side || (n % 2 ? 'left' : 'right');
        var src = sp.img(ln.mood);
        var img = side === 'left' ? pl : pr, other = side === 'left' ? pr : pl;
        if (src && img.getAttribute('src') !== src) img.setAttribute('src', src);
        img.parentNode.className = 'story-por ' + side + ' on ' + sp.cls; other.parentNode.classList.remove('on');
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
      dim.addEventListener('click', next); box.addEventListener('click', next); left.addEventListener('click', next); right.addEventListener('click', next);
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
