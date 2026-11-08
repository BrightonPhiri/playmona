/* ============================================================
   PLAYMONA — games/whatsMissing.js
   What's Missing?: study a board of glossy picture tiles, the
   tiles flip, something changes, and you work out what.

   - Rules: js/whatsmissing/rules.js (FF.WhatsMissingRules), shared
     with the server referee. Every board comes from one seed.
   - Twists: Gone (a picture vanished: what was it?), Added (a new
     one sneaked in: tap it), Swapped (two traded places: tap both)
     and Several gone (fill every gap).
   - Levels: Easy 4 pictures, Normal 6, Hard 8, Expert 10 growing to
     16 (spell the missing names with letter tiles), Endless (from 3,
     one more for every right answer, until a miss).
   - Solo and pass and play here; daily and friend challenges play
     the standard settings on a shared deal. Online rooms: the
     server's referee runs the match (see online() below).
   Classic script, ES5.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.WhatsMissingRules;
  var SETUP_KEY = 'whatsMissing:setup';
  var BEST_KEY = 'whatsMissing:endlessBest';
  var MM_ART = 'games/memoryMatch';
  var FLIP_MS = 420;          // tiles turn face down, the board changes, they turn back
  var POP_MS = 60;            // stagger between tiles popping in
  var SIDES = 6;              // tile side colours (wm-side-0..5)

  function t(key, fallback, vars) { return FF.t ? FF.t(key, fallback, vars) : String(fallback); }
  function store() { return FF.Storage || { get: function (k, d) { return d; }, set: function () {} }; }
  function rand0() { return FF._rand ? FF._rand() : Math.random(); }
  function reduceMotion() {
    try {
      if (document.documentElement.getAttribute('data-reduce') === '1') return true;
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { return false; }
  }
  function animationsOn() { return !reduceMotion() && (!FF.Settings || !FF.Settings.get || FF.Settings.get('animations') !== false); }
  function racingRoom(api) { return !!(api.config.room && FF.Room && FF.Room.current()); }
  function stillShown(api) { return !!(api.shell.root && document.body && document.body.contains(api.shell.root)); }
  function later(fn, ms) { return setTimeout(fn, animationsOn() ? ms : Math.min(ms, 60)); }

  /* ---------- pictures ---------- */

  function hasPic(id) {
    var m = FF.AssetManifest && FF.AssetManifest[MM_ART];
    return !!(m && m[id]);
  }
  function cardName(id) {
    var c = R.cardOf(id);
    return c ? t('mmCard_' + id.replace(/-/g, '_'), c.name) : String(id);
  }
  function picEl(id, cls) {
    var c = R.cardOf(id) || { emoji: '?' };
    var el = FF.ui.span(cls || 'wm-pic');
    if (hasPic(id) && FF.Assets) el.appendChild(FF.ui.el('img', { src: FF.Assets.artPath(MM_ART, id), alt: '', draggable: 'false', decoding: 'async' }));
    else el.appendChild(FF.ui.span('wm-pic__emoji', c.emoji));
    return el;
  }
  function preload(round) {
    if (typeof Image !== 'function' || !FF.Assets) return;
    var ids = round.before.concat(round.after, round.choices || []);
    ids.forEach(function (id) { if (id && hasPic(id)) { var im = new Image(); im.src = FF.Assets.artPath(MM_ART, id); } });
  }

  /* ---------- words ---------- */

  function levelName(l) {
    return l === 'easy' ? t('easy', 'Easy') : l === 'hard' ? t('hard', 'Hard') : l === 'expert' ? t('expert', 'Expert')
      : l === 'endless' ? t('wmEndless', 'Endless') : t('normal', 'Normal');
  }
  function levelMeta(l) {
    if (l === 'expert') return t('wmLvExpert', '10 to 16 pictures · spell the answer');
    if (l === 'endless') return t('wmLvEndless', 'From 3 pictures · until you miss');
    return t('wmLvN', '{n} pictures', { n: R.picturesAt(l, 0) });
  }
  function themeName(id) {
    if (id === 'mix') return t('wmMix', 'Mix');
    var d = (FF.MemoryDecks || []).filter(function (x) { return x.id === id; })[0];
    return d ? t('mmDeck_' + id, d.name) : id;
  }
  function summary(s) {
    var c = R.sanitize(s);
    return [levelName(c.level), themeName(c.theme), t('wmStudyN', '{n} s to study', { n: c.seconds }),
      c.level === 'expert' ? t('wmSpelled', 'spelled answers') : t('wmNChoices', '{n} choices', { n: c.choices }),
      c.twists === 'gone' ? t('wmGoneOnly', 'Gone only') : t('wmAllTwists', 'all twists')].join(' · ');
  }
  function question(round) {
    if (round.twist === 'added') return t('wmQAdded', 'Which picture is new?');
    if (round.twist === 'swapped') return t('wmQSwapped', 'Which two pictures swapped places?');
    if (round.twist === 'several') return t('wmQSeveral', '{n} pictures are gone. What was in each gap?', { n: round.gaps });
    return t('wmQGone', 'One picture is gone. What was here?');
  }
  function twistName(tw) {
    return tw === 'added' ? t('wmTwAdded', 'Added') : tw === 'swapped' ? t('wmTwSwapped', 'Swapped')
      : tw === 'several' ? t('wmTwSeveral', 'Several gone') : t('wmTwGone', 'Gone');
  }

  /* ---------- small pieces ---------- */

  var GLYPHS = {
    soundOn: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/>',
    soundOff: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9l5 6M22 9l-5 6"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2" stroke-dasharray="2 2"/>'
  };
  function glyph(name, cls) {
    var s = document.createElement('span');
    s.className = 'wm-glyph' + (cls ? ' ' + cls : '');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + GLYPHS[name] + '</svg>';
    return s;
  }
  function soundButton() {
    var b = FF.ui.el('button', { type: 'button', class: 'wm-iconbtn' });
    function sync() {
      var on = FF.Audio.effectsEnabled !== false;
      FF.ui.clear(b);
      b.appendChild(glyph(on ? 'soundOn' : 'soundOff'));
      var label = on ? t('gsFxOff', 'Turn sound effects off') : t('gsFxOn', 'Turn sound effects on');
      b.setAttribute('aria-label', label);
      b.title = label;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    b.addEventListener('click', function () {
      FF.Audio.setEffects(FF.Audio.effectsEnabled === false);
      if (FF.Audio.effectsEnabled) FF.Audio.play('tap');
      sync();
    });
    sync();
    return b;
  }
  function chip(text, cls) { return FF.ui.span('wm-chip' + (cls ? ' ' + cls : ''), text); }

  /* A draining bar for the study and answer clocks. */
  function clockBar() {
    var el = FF.ui.div('wm-clock');
    el.setAttribute('role', 'timer');
    var fill = FF.ui.span('wm-clock__fill');
    var num = FF.ui.span('wm-clock__num', '');
    el.appendChild(fill);
    el.appendChild(num);
    return {
      el: el,
      set: function (rem, total, kind) {
        var r = Math.max(0, rem);
        el.className = 'wm-clock' + (kind ? ' is-' + kind : '') + (kind === 'answer' && r <= 5 && r > 0 ? ' is-low' : '');
        fill.style.width = (total ? Math.max(0, Math.min(1, r / total)) * 100 : 0) + '%';
        num.textContent = Math.ceil(r) + 's';
        el.setAttribute('aria-label', t('secondsLeft', '{n} seconds left', { n: Math.ceil(r) }));
      },
      idle: function () { el.className = 'wm-clock is-idle'; fill.style.width = '0%'; num.textContent = ''; }
    };
  }

  function countUp(el, from, to, ms) {
    if (!animationsOn() || from === to) { el.textContent = FF.util.formatNumber(to); return; }
    var start = Date.now();
    function tick() {
      var p = Math.min(1, (Date.now() - start) / ms);
      el.textContent = FF.util.formatNumber(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1 && el.isConnected) setTimeout(tick, 30);
    }
    tick();
  }

  /* ================= the screen ================= */

  function frame(api, cls) {
    var root = api.shell.root;
    FF.ui.clear(root);
    if (api.shell.el) api.shell.el.classList.add('wm-shell');
    var wm = FF.ui.div('wm' + (cls ? ' ' + cls : ''));
    var top = FF.ui.div('wm-top');
    var brand = FF.ui.div('wm-brand');
    brand.appendChild(FF.ui.span('wm-brand__a', t('wmBrandA', 'What’s')));
    brand.appendChild(FF.ui.span('wm-brand__b', t('wmBrandB', 'Missing?')));
    top.appendChild(brand);
    var chips = FF.ui.div('wm-chips');
    top.appendChild(chips);
    top.appendChild(soundButton());
    wm.appendChild(top);
    var main = FF.ui.div('wm-main');
    var stage = FF.ui.div('wm-stage');
    var host = FF.ui.div('wm-board-host');
    stage.appendChild(host);
    var panel = FF.ui.div('wm-panel');
    main.appendChild(stage);
    main.appendChild(panel);
    wm.appendChild(main);
    root.appendChild(wm);
    var out = { root: wm, top: top, chips: chips, stage: stage, host: host, panel: panel };
    out.fit = function () { fitBoard(out); };
    function onResize() { if (!wm.isConnected) { window.removeEventListener('resize', onResize); return; } out.fit(); }
    window.addEventListener('resize', onResize);
    return out;
  }

  /* The board takes the room the top bar and the panel leave, so a phone never scrolls:
     tiles shrink to fit (never under MIN_TILE) and never grow past MAX_TILE. */
  var MIN_TILE = 40, MAX_TILE = 132, GAP = 8;
  function fitBoard(f) {
    var b = f.host.querySelector('.wm-board');
    if (!b || !f.root.isConnected) return;
    var cols = Number(b.getAttribute('data-cols')) || 3;
    var rows = Number(b.getAttribute('data-rows')) || 3;
    var wide = window.innerWidth >= 900;
    var scroller = f.root.closest ? f.root.closest('.game-shell__content') : null;
    var top = f.host.getBoundingClientRect().top + (scroller ? scroller.scrollTop : 0);
    var cs = window.getComputedStyle(f.root);
    var below = (parseFloat(cs.paddingBottom) || 0) + (wide ? 0 : f.panel.offsetHeight + GAP * 3) + 6;   // + rounding and the board's own padding
    var availH = window.innerHeight - top - below;
    var availW = f.host.clientWidth;
    var size = Math.floor(Math.min((availW - GAP * (cols - 1)) / cols, (availH - GAP * (rows - 1)) / rows, MAX_TILE));
    b.style.setProperty('--wm-tile', Math.max(MIN_TILE, size) + 'px');
    if (scroller && !f.root.classList.contains('is-revealed')) scroller.scrollTop = 0;
  }

  /* ================= the board =================
     makeBoard(round, list, opts) draws one board (list = round.before or round.after).
     opts.onTap(slot) makes tiles tappable. Returns helpers to change single tiles. */
  function makeBoard(round, list, opts) {
    opts = opts || {};
    var el = FF.ui.div('wm-board');
    el.setAttribute('data-cols', String(round.cols));
    el.setAttribute('data-rows', String(round.rows));
    el.style.setProperty('--wm-cols', String(round.cols));
    var tiles = [];
    for (var s = 0; s < round.slots; s++) {
      var tile = FF.ui.el('button', { type: 'button', class: 'wm-tile wm-side-' + (s % SIDES) });
      tile.style.setProperty('--i', String(s));
      tile.setAttribute('data-slot', String(s));
      (function (slot, tl) {
        tl.addEventListener('click', function () { if (opts.onTap && !tl.disabled) opts.onTap(slot); });
      })(s, tile);
      tiles.push(tile);
      el.appendChild(tile);
    }
    var api = {
      el: el, tiles: tiles,
      set: function (slot, id, extra) {
        var tl = tiles[slot];
        FF.ui.clear(tl);
        tl.classList.remove('is-full', 'is-empty');
        if (id) {
          tl.classList.add('is-full');
          var face = FF.ui.span('wm-tile__face');
          face.appendChild(picEl(id));
          tl.appendChild(face);
          tl.setAttribute('aria-label', cardName(id));
        } else {
          tl.classList.add('is-empty');
          tl.setAttribute('aria-label', t('wmEmpty', 'Empty tile'));
        }
        if (extra) tl.classList.add(extra);
      },
      fill: function (l) { for (var i = 0; i < round.slots; i++) api.set(i, l[i]); },
      tappable: function (which) {
        tiles.forEach(function (tl, i) {
          var on = !!which && which(i);
          tl.disabled = !on;
          tl.classList.toggle('is-tappable', on);
          tl.tabIndex = on ? 0 : -1;
        });
      },
      mark: function (slot, cls, on) { tiles[slot].classList.toggle(cls, on !== false); },
      unmarkAll: function (cls) { tiles.forEach(function (tl) { tl.classList.remove(cls); }); }
    };
    api.fill(list);
    api.tappable(null);
    return api;
  }

  /* Sparkles and little glowing squares rising out of an emptied tile (as the cover). */
  function sparkle(tile, many) {
    if (!animationsOn() || !tile) return;
    var box = FF.ui.span('wm-sparks');
    box.setAttribute('aria-hidden', 'true');
    var n = many ? 14 : 10;
    for (var i = 0; i < n; i++) {
      var p = FF.ui.span(i % 3 === 0 ? 'wm-spark wm-spark--star' : 'wm-spark');
      p.style.setProperty('--x', String(((i * 37) % 100) - 50));
      p.style.setProperty('--d', String((i * 53) % 400));
      p.style.setProperty('--s', String(4 + (i * 7) % 7));
      box.appendChild(p);
    }
    tile.appendChild(box);
    setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 1500);
  }

  /* The gap slots. Online the answer stays on the server, so the view says where the gaps are. */
  function holesOf(round) {
    if (round.twist !== 'gone' && round.twist !== 'several') return [];
    return round.answer ? round.answer.slots : (round.holes || []);
  }

  /* The flip: every tile turns face down, the board changes underneath, the tiles turn back. */
  function flipTo(board, round, list, done) {
    board.el.classList.add('is-hidden');
    later(function () {
      board.fill(list);
      holesOf(round).forEach(function (s) { board.mark(s, 'is-gap'); });
      board.el.classList.remove('is-hidden');
      later(function () {
        holesOf(round).forEach(function (s) { sparkle(board.tiles[s]); });
        done();
      }, FLIP_MS);
    }, FLIP_MS);
  }

  /* ================= answering =================
     answerPanel(api, round, board, o) builds the controls for one round's twist and
     calls o.onSubmit(answer) once: { picks } or { text } for gaps, { slots } for taps.
     It also returns current() for the clock running out (what was filled so far). */
  function answerPanel(api, round, board, o) {
    var box = FF.ui.div('wm-answer');
    var sent = false;
    function submit(a) { if (sent) return; sent = true; lockAll(); o.onSubmit(a); }
    var lockers = [];
    function lockAll() { board.tappable(null); lockers.forEach(function (fn) { fn(); }); }

    if (round.twist === 'added' || round.twist === 'swapped') {
      var picked = [];
      var need = round.twist === 'added' ? 1 : 2;
      box.appendChild(FF.ui.el('p', { class: 'wm-tip' }, round.twist === 'added' ? t('wmTipAdded', 'Tap the newcomer.') : t('wmTipSwapped', 'Tap both pictures that moved.')));
      board.tappable(function (s) { return round.after[s] != null; });
      o.onTap(function (s) {
        if (sent) return;
        var at = picked.indexOf(s);
        if (at !== -1) { picked.splice(at, 1); board.mark(s, 'is-picked', false); api.audio.play('tap'); return; }
        picked.push(s);
        board.mark(s, 'is-picked');
        api.audio.play('select');
        if (picked.length >= need) submit({ slots: picked.slice() });
      });
      return { el: box, current: function () { return { slots: picked.slice() }; }, finish: function () {} };
    }

    // Gone and Several gone: one answer per gap, in gap order.
    var gaps = holesOf(round);
    var many = gaps.length > 1;
    var active = 0;
    var filled = gaps.map(function () { return null; });
    function markActive() {
      gaps.forEach(function (s, i) { board.mark(s, 'is-active', many && i === active && !sent); });
    }
    function nextEmpty(from) {
      for (var i = 0; i < gaps.length; i++) { var j = (from + i) % gaps.length; if (filled[j] == null) return j; }
      return -1;
    }
    if (many) {
      board.tappable(function (s) { return gaps.indexOf(s) !== -1; });
      o.onTap(function (s) {
        var i = gaps.indexOf(s);
        if (i === -1 || sent) return;
        active = i;
        api.audio.play('tap');
        markActive();
        if (spell) openSpell();
      });
    }
    var spell = round.spell;
    var check = null;

    if (!spell) {
      var grid = FF.ui.div('wm-choices');
      grid.setAttribute('data-n', String(round.choices.length));
      var btns = round.choices.map(function (id) {
        var b = FF.ui.el('button', { type: 'button', class: 'wm-choice' });
        b.appendChild(picEl(id, 'wm-pic wm-choice__pic'));
        b.appendChild(FF.ui.span('wm-choice__name', cardName(id)));
        b.setAttribute('data-id', id);
        b.addEventListener('click', function () {
          if (sent) return;
          api.audio.play('select');
          if (!many) { b.classList.add('is-picked'); submit({ picks: [id] }); return; }
          var was = filled.indexOf(id);
          if (was !== -1) { filled[was] = null; board.set(gaps[was], null, 'is-gap'); }
          filled[active] = id;
          board.set(gaps[active], id, 'is-guess');
          board.mark(gaps[active], 'is-gap');
          var nx = nextEmpty(active);
          if (nx !== -1) active = nx;
          sync();
        });
        grid.appendChild(b);
        return b;
      });
      box.appendChild(grid);
      lockers.push(function () { btns.forEach(function (b) { b.disabled = true; }); });
      if (many) {
        check = FF.ui.el('button', { type: 'button', class: 'wm-btn wm-btn--go' });
        check.appendChild(glyph('check'));
        check.appendChild(FF.ui.span('', t('wmCheck', 'Check my answers')));
        check.addEventListener('click', function () { if (nextEmpty(0) === -1) submit({ picks: filled.slice() }); });
        box.appendChild(check);
        lockers.push(function () { check.disabled = true; });
      }
    }

    var spellHost = null, spellBoard = null, texts = gaps.map(function () { return null; });
    function openSpell() {
      if (sent) return;
      if (spellBoard && spellBoard.destroy) spellBoard.destroy();
      FF.ui.clear(spellHost);
      var gapNo = active;
      spellHost.appendChild(FF.ui.el('p', { class: 'wm-tip' }, many ? t('wmSpellGapN', 'Spell gap {n} of {m}', { n: gapNo + 1, m: gaps.length }) : t('wmSpellIt', 'Spell the missing picture')));
      var set = o.tiles ? maskedSet(o.tiles[gapNo]) : FF.SpellTiles.deal(R.cardOf(round.answer.ids[gapNo]).name, R.rng(R.hash('spell|' + o.seed + '|' + round.k + '|' + gapNo)), { difficulty: api.config.difficulty });
      spellBoard = FF.SpellTiles.board(set, {
        audio: api.audio,
        onSubmit: function (text) {
          if (sent) return;
          texts[gapNo] = text;
          board.set(gaps[gapNo], null, 'is-gap');
          board.mark(gaps[gapNo], 'is-written');
          var nx = -1;
          for (var i = 0; i < gaps.length; i++) if (texts[i] == null) { nx = i; break; }
          if (nx === -1) { submit({ text: texts.slice() }); return; }
          active = nx;
          markActive();
          openSpell();
        }
      });
      spellHost.appendChild(spellBoard.el);
      spellBoard.open();
      if (o.onLayout) o.onLayout();
    }
    if (spell) {
      spellHost = FF.ui.div('wm-spell');
      box.appendChild(spellHost);
      lockers.push(function () { if (spellBoard && spellBoard.lock) spellBoard.lock(); });
    }

    function sync() {
      markActive();
      if (check) check.disabled = nextEmpty(0) !== -1;
      if (!spell) btnsUsed();
    }
    function btnsUsed() {
      Array.prototype.forEach.call(box.querySelectorAll('.wm-choice'), function (b) {
        b.classList.toggle('is-used', many && filled.indexOf(b.getAttribute('data-id')) !== -1);
      });
    }
    if (spell) later(openSpell, 0);
    sync();
    return {
      el: box,
      current: function () {
        if (!spell) return { picks: filled.slice() };
        var out = texts.slice();
        if (spellBoard && out[active] == null && typeof spellBoard.text === 'function') out[active] = spellBoard.text() || null;
        return { text: out };
      },
      // Online tiles carry no letters to show, so the board shows the truth instead.
      finish: function (ok) { if (spellBoard && spellBoard.finish && !o.tiles) spellBoard.finish(ok); }
    };
  }

  /* Letter tiles from the referee: the name's shape (_ for each letter) and the tiles, never the name. */
  function maskedSet(g) {
    g = g || { shape: '', tiles: '' };
    var cells = String(g.shape || '').split('').map(function (ch) {
      if (ch === '_') return { ch: '', letter: true };
      if (ch === ' ') return { ch: ' ', gap: true };
      return { ch: ch, fixed: true };
    });
    return { target: '', cells: cells, letters: [], tiles: String(g.tiles || '').split('') };
  }

  /* After the answer: put the truth on the board. */
  function showTruth(board, round, answer, res) {
    board.tappable(null);
    board.unmarkAll('is-active');
    board.unmarkAll('is-picked');
    if (round.twist === 'gone' || round.twist === 'several') {
      round.answer.slots.forEach(function (s, i) {
        board.set(s, round.answer.ids[i], 'is-back');
        board.mark(s, res.right[i] ? 'is-right' : 'is-wrong');
      });
    } else if (round.twist === 'added') {
      board.mark(round.answer.slots[0], 'is-new');
      (answer.slots || []).forEach(function (s) { if (s !== round.answer.slots[0] && board.tiles[s]) board.mark(s, 'is-wrong'); });
    } else {
      round.answer.slots.forEach(function (s) { board.mark(s, res.ok ? 'is-right' : 'is-swap'); });
      (answer.slots || []).forEach(function (s) { if (round.answer.slots.indexOf(s) === -1 && board.tiles[s]) board.mark(s, 'is-wrong'); });
    }
  }

  /* What the player gave, in words, when it was wrong. */
  function saidLine(round, answer, res) {
    if (res.ok) return '';
    if (round.twist === 'gone' || round.twist === 'several') {
      var names = round.answer.ids.map(cardName);
      return round.gaps > 1 ? t('wmItWereN', 'They were {list}.', { list: names.join(', ') }) : t('wmItWas', 'It was the {x}.', { x: names[0] });
    }
    if (round.twist === 'added') return t('wmNewWas', 'The {x} sneaked in.', { x: cardName(round.answer.ids[0]) });
    return t('wmSwapWas', 'The {a} and the {b} swapped places.', { a: cardName(round.answer.ids[0]), b: cardName(round.answer.ids[1]) });
  }

  function pointsLine(pts) {
    var bits = [t('wmPtsBase', '{n} points', { n: pts.base })];
    if (pts.speed) bits.push(t('wmPtsSpeed', 'speed +{n}', { n: pts.speed }));
    if (pts.bonus) bits.push(t('wmPtsExpert', 'Expert +{n}', { n: pts.bonus }));
    if (pts.mult > 1) bits.push(t('wmPtsStreak', 'streak ×{m}', { m: pts.mult }));
    return bits.join(' · ');
  }

  /* ================= setup ================= */

  function segmented(label, items, current, onPick) {
    var wrap = FF.ui.div('wm-field');
    wrap.appendChild(FF.ui.el('h3', { class: 'wm-h' }, label));
    var row = FF.ui.el('div', { class: 'wm-seg', role: 'group', 'aria-label': label });
    var btns = items.map(function (it) {
      var b = FF.ui.el('button', { type: 'button', class: 'wm-seg__btn' }, it.label);
      b.addEventListener('click', function () { onPick(it.id); });
      row.appendChild(b);
      return { el: b, id: it.id };
    });
    wrap.appendChild(row);
    return { el: wrap, sync: function (v) { btns.forEach(function (x) { x.el.classList.toggle('is-on', x.id === v); x.el.setAttribute('aria-pressed', x.id === v ? 'true' : 'false'); }); } };
  }

  function setupScreen(api, onGo) {
    api.shell.hideTimer();
    if (FF.GameLength && FF.GameLength.pause) FF.GameLength.pause();
    var c = R.sanitize(store().get(SETUP_KEY, null) || R.STANDARD);
    var f = frame(api, 'wm--setup');
    var hero = FF.ui.div('wm-hero');
    var demo = { cols: 3, rows: 2, slots: 6 };
    var demoBoard = makeBoard(demo, ['strawberry', 'rocket', 'duck', null, 'cupcake', 'teddy']);
    demoBoard.mark(3, 'is-gap');
    hero.appendChild(demoBoard.el);
    demoBoard.el.style.setProperty('--wm-tile', '64px');
    f.host.appendChild(hero);
    var how = FF.ui.el('ul', { class: 'wm-how' });
    [t('wmHow1', 'Study the pictures.'), t('wmHow2', 'The tiles flip and something changes.'), t('wmHow3', 'Spot what’s missing, new or swapped. Fast and in a row scores more.')].forEach(function (x, i) {
      var li = FF.ui.el('li', {});
      li.appendChild(FF.ui.span('wm-how__n', String(i + 1)));
      li.appendChild(FF.ui.span('', x));
      how.appendChild(li);
    });
    f.host.appendChild(how);

    var p = f.panel;
    p.appendChild(FF.ui.el('h2', { class: 'wm-h wm-h--lg' }, t('wmChooseLevel', 'Choose your level')));
    var levels = FF.ui.el('div', { class: 'wm-levels', role: 'group', 'aria-label': t('gcLevel', 'Level') });
    var levelBtns = R.LEVELS.map(function (l) {
      var b = FF.ui.el('button', { type: 'button', class: 'wm-level wm-lv-' + l });
      b.appendChild(FF.ui.span('wm-level__name', levelName(l)));
      b.appendChild(FF.ui.span('wm-level__meta', levelMeta(l)));
      b.addEventListener('click', function () { c.level = l; api.audio.play('select'); sync(); });
      levels.appendChild(b);
      return { el: b, id: l };
    });
    p.appendChild(levels);
    var theme = segmented(t('wmTheme', 'Pictures'), R.THEMES.map(function (id) { return { id: id, label: themeName(id) }; }), c.theme, function (v) { c.theme = v; api.audio.play('tap'); sync(); });
    var secs = segmented(t('wmStudyTime', 'Time to study'), R.SECONDS.map(function (n) { return { id: n, label: t('wmSecs', '{n} s', { n: n }) }; }), c.seconds, function (v) { c.seconds = v; api.audio.play('tap'); sync(); });
    var choices = segmented(t('wmChoices', 'Answers to pick from'), R.CHOICES.map(function (n) { return { id: n, label: String(n) }; }), c.choices, function (v) { c.choices = v; api.audio.play('tap'); sync(); });
    var twists = segmented(t('wmTwists', 'Twists'), [{ id: 'mix', label: t('wmTwMix', 'Mix them up') }, { id: 'gone', label: t('wmGoneOnly', 'Gone only') }], c.twists, function (v) { c.twists = v; api.audio.play('tap'); sync(); });
    [theme, secs, choices, twists].forEach(function (x) { p.appendChild(x.el); });

    var foot = FF.ui.div('wm-setup__foot');
    var info = FF.ui.el('p', { class: 'wm-note', 'aria-live': 'polite' });
    foot.appendChild(info);
    var go = FF.ui.el('button', { type: 'button', class: 'wm-btn wm-btn--go wm-btn--big' });
    go.appendChild(glyph('eye'));
    go.appendChild(FF.ui.span('', t('wmStart', 'Start')));
    go.addEventListener('click', function () {
      var cfg = R.sanitize(c);
      try { store().set(SETUP_KEY, cfg); } catch (e) { /* storage full */ }
      api.audio.play('roundStart');
      if (FF.GameLength && FF.GameLength.resume) FF.GameLength.resume();
      onGo(cfg);
    });
    foot.appendChild(go);
    p.appendChild(foot);

    function sync() {
      levelBtns.forEach(function (x) { x.el.classList.toggle('is-on', x.id === c.level); x.el.setAttribute('aria-pressed', x.id === c.level ? 'true' : 'false'); });
      theme.sync(c.theme); secs.sync(c.seconds); choices.sync(c.choices); twists.sync(c.twists);
      choices.el.classList.toggle('is-off', c.level === 'expert');
      var ranked = FF.Leaderboards && FF.Leaderboards.active && FF.Leaderboards.active(api.def);
      var notes = [];
      if (c.level === 'expert') notes.push(t('wmExpertNote', 'Expert: spell each missing picture with letter tiles.'));
      if (c.level === 'endless') {
        var best = Number(store().get(BEST_KEY, 0)) || 0;
        notes.push(best ? t('wmBestN', 'Your best: {n} pictures', { n: best }) : t('wmEndlessNote', 'One more picture after every right answer.'));
      }
      if (ranked && !R.isStandard(c)) notes.push(t('nrUnranked', 'Leaderboards use the standard settings'));
      info.textContent = notes.join(' · ');
    }
    sync();
    f.fit();
    if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(p);
  }

  /* ================= solo and pass and play ================= */

  function scorerList(config) {
    if (config.scorers && config.scorers.length) return config.scorers.slice();
    if (config.players && config.players.length) return config.players.slice();
    return [{ id: 'p1', name: t('you', 'You'), avatar: null }];
  }

  function play(api, cfg, seed) {
    cfg = R.sanitize(cfg);
    var config = api.config;
    var scorers = scorerList(config);
    var np = scorers.length;
    var endless = cfg.level === 'endless';
    var timed = !endless && FF.GameLength.timed(config);
    var rounds = endless ? Infinity : FF.GameLength.rounds(api, cfg.rounds || 8, 0);
    if (!endless && !timed && np > 1) rounds = Math.ceil(rounds / np) * np;
    if (timed) FF.GameLength.manual();
    var answerBase = Number(config.timer);
    if (!(answerBase >= 0)) answerBase = R.ANSWER_SECS;

    var f = frame(api, 'wm--play');
    var k = -1;
    var turn = -1;
    var stats = {};
    scorers.forEach(function (e) { stats[e.id] = { right: 0, played: 0, fastest: null, streak: 0, best: 0, n: R.ENDLESS_START, out: false, prev: [], reached: 0 }; });
    var totals = { right: 0, played: 0 };
    var roundChip = chip('', 'wm-chip--round');
    var levelChip = chip(levelName(cfg.level), 'wm-chip--level wm-lv-' + cfg.level);
    f.chips.appendChild(roundChip);
    f.chips.appendChild(levelChip);

    function nextPlayer() {
      if (!endless) return scorers[(k) % np];
      for (var i = 1; i <= np; i++) {
        var j = (turn + i) % np;
        if (!stats[scorers[j].id].out) { turn = j; return scorers[j]; }
      }
      return null;
    }
    function over() {
      if (endless) return scorers.every(function (e) { return stats[e.id].out; });
      if (k >= rounds) return true;
      return timed && FF.GameLength.timeUp() && k % np === 0;
    }
    function next() {
      k++;
      if (over()) { recap(); return; }
      render();
    }

    function scoreCard(entity, bump) {
      var box = FF.ui.div('wm-card wm-score');
      var st = stats[entity.id];
      var head = FF.ui.div('wm-score__head');
      head.appendChild(FF.ui.span('wm-score__who', np > 1 ? (entity.name || t('playerLabel', 'Player')) : t('gsYourScore', 'Your score')));
      var pts = FF.ui.span('wm-score__pts', FF.util.formatNumber(api.scoring.get(entity.id) || 0));
      head.appendChild(pts);
      if (bump) countUp(pts, bump.from, bump.to, 800);
      box.appendChild(head);
      var flame = FF.ui.span('wm-streak' + (st.streak >= 3 ? ' is-hot' : ''), t('gsStreakN', 'Streak {n}', { n: st.streak }));
      box.appendChild(flame);
      var mult = R.streakMult(st.streak + 1);
      if (mult > 1) box.appendChild(FF.ui.span('wm-streak__mult', t('gsNextX', 'Next ×{m}', { m: mult })));
      return box;
    }

    function render() {
      var entity = nextPlayer();
      if (!entity) { recap(); return; }
      var st = stats[entity.id];
      var rd = endless ? R.deal(cfg, seed, k, { n: st.n, prev: st.prev }) : R.deal(cfg, seed, k, { step: Math.floor(k / np) });
      preload(rd);
      api.shell.hideTimer();
      api.shell.updateScores(entity.id);
      roundChip.textContent = (np > 1 ? (entity.name || '') + ' · ' : '') +
        (endless ? t('wmNPictures', '{n} pictures', { n: rd.n }) : FF.GameLength.roundText(k + 1, rounds));
      f.root.classList.remove('is-revealed', 'is-open');
      f.root.classList.add('is-study');
      FF.ui.clear(f.host);
      FF.ui.clear(f.panel);
      var card = scoreCard(entity);
      f.panel.appendChild(card);
      var clock = clockBar();
      f.panel.appendChild(clock.el);
      var q = FF.ui.el('h2', { class: 'wm-question' }, t('wmStudy', 'Remember every picture'));
      f.panel.appendChild(q);
      var body = FF.ui.div('wm-body');
      f.panel.appendChild(body);
      var after = FF.ui.div('wm-after');
      f.panel.appendChild(after);

      var tapHandler = null;
      var board = makeBoard(rd, rd.before, { onTap: function (s) { if (tapHandler) tapHandler(s); } });
      board.el.classList.add('is-popping');
      f.host.appendChild(board.el);
      api.audio.play('flip');
      later(function () { board.el.classList.remove('is-popping'); }, POP_MS * rd.slots + 500);

      var ready = FF.ui.el('button', { type: 'button', class: 'wm-btn wm-btn--soft' });
      ready.appendChild(glyph('eye'));
      ready.appendChild(FF.ui.span('', t('wmReady', 'I’m ready')));
      body.appendChild(ready);
      f.fit();

      var studyEnd = Date.now() + cfg.seconds * 1000;
      var studyTimer = setInterval(tickStudy, 100);
      clock.set(cfg.seconds, cfg.seconds, 'study');
      function tickStudy() {
        if (!stillShown(api)) { clearInterval(studyTimer); return; }
        var rem = (studyEnd - Date.now()) / 1000;
        clock.set(rem, cfg.seconds, 'study');
        if (rem <= 0) change();
      }
      ready.addEventListener('click', function () { api.audio.play('click'); change(); });

      var changed = false;
      function change() {
        if (changed) return;
        changed = true;
        clearInterval(studyTimer);
        clock.idle();
        FF.ui.clear(body);
        q.textContent = t('wmWatch', 'Something is changing…');
        api.audio.play('whoosh');
        flipTo(board, rd, rd.after, open);
      }

      var done = false, started = 0, secs = 0, panel = null;
      function open() {
        if (!stillShown(api) || done) return;
        f.root.classList.remove('is-study');
        f.root.classList.add('is-open');
        q.textContent = question(rd);
        panel = answerPanel(api, rd, board, { seed: seed, onLayout: f.fit, onTap: function (fn) { tapHandler = fn; }, onSubmit: function (a) { answer(a, false); } });
        body.appendChild(panel.el);
        f.fit();
        started = Date.now();
        secs = answerBase > 0 ? rd.secs - R.ANSWER_SECS + answerBase : 0;
        if (secs > 0) {
          clock.set(secs, secs, 'answer');
          api.shell.setOnTick(function (rem) { clock.set(rem, secs, 'answer'); });
          api.shell.setTimer(secs, function () { answer(panel.current(), true); });
        }
        if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(panel.el);
      }

      function answer(a, timeout) {
        if (done) return;
        done = true;
        tapHandler = null;
        var ms = started ? Date.now() - started : (secs || rd.secs) * 1000;
        api.shell.setOnTick(null);
        api.shell.hideTimer();
        if (timeout) clock.set(0, secs || 1, 'answer');
        var res = R.check(rd, a);
        st.played++; totals.played++;
        var streak = res.ok ? st.streak + 1 : 0;
        var pts = R.points({ round: rd, res: res, ms: ms, secs: secs || rd.secs, streak: streak });
        var before = api.scoring.get(entity.id) || 0;
        if (res.ok) {
          st.right++; totals.right++;
          st.streak = streak;
          st.best = Math.max(st.best, streak);
          if (st.fastest == null || ms < st.fastest) st.fastest = ms;
          api.scoring.add(entity.id, pts.total, { correct: true, fastest: ms / 1000 });
          api.audio.play(R.streakMult(streak) > R.streakMult(streak - 1) ? 'streak' : 'correct');
          if (animationsOn() && FF.Confetti) FF.Confetti.burst(streak >= 3 ? 60 : 30);
        } else {
          st.streak = 0;
          if (pts.total) api.scoring.add(entity.id, pts.total, { wrong: true });
          else api.scoring.add(entity.id, 0, { wrong: true });
          if (api.scoring.resetStreak) api.scoring.resetStreak(entity.id);
          api.audio.play('wrong');
        }
        if (endless) {
          st.reached = Math.max(st.reached, rd.n);
          st.prev.push(rd.twist);
          if (res.ok) st.n = Math.min(st.n + 1, R.ENDLESS_MAX);
          else st.out = true;
        }
        panel.finish(res.ok);
        showTruth(board, rd, a || {}, res);
        FF.ui.clear(card);
        var fresh = scoreCard(entity, { from: before, to: api.scoring.get(entity.id) || 0 });
        card.parentNode.replaceChild(fresh, card);
        card = fresh;
        api.shell.updateScores(entity.id);
        var head = res.ok ? t('wmRight', 'Spot on!') : timeout ? t('wmTimeUp', 'Time’s up!') : res.rightGaps ? t('wmSome', '{n} of {m} right', { n: res.rightGaps, m: rd.gaps }) : t('wmWrong', 'Not quite');
        var rc = FF.ui.div('wm-reveal is-' + (res.ok ? 'good' : res.rightGaps ? 'part' : 'bad'));
        rc.appendChild(FF.ui.el('p', { class: 'wm-reveal__head' }, head));
        var said = saidLine(rd, a || {}, res);
        if (said) rc.appendChild(FF.ui.el('p', { class: 'wm-reveal__said' }, said));
        if (pts.total) {
          rc.appendChild(FF.ui.el('p', { class: 'wm-reveal__pts' }, '+' + FF.util.formatNumber(pts.total)));
          rc.appendChild(FF.ui.el('p', { class: 'wm-reveal__why' }, pointsLine(pts)));
        }
        if (endless && !res.ok) rc.appendChild(FF.ui.el('p', { class: 'wm-reveal__said' }, t('wmReached', 'You reached {n} pictures.', { n: st.reached })));
        after.appendChild(rc);
        f.root.classList.add('is-revealed');
        var last = endless ? over() || scorers.every(function (e) { return stats[e.id].out; })
          : k + 1 >= rounds || (timed && FF.GameLength.timeUp() && (k + 1) % np === 0);
        var nextBtn = FF.Advance.button(last ? t('seeResults', 'See results') : t('wmNextRound', 'Next board'), function () {
          api.audio.play('click');
          next();
        }, { class: 'wm-btn wm-btn--go wm-next' });
        after.appendChild(nextBtn);
        f.fit();
        if (after.scrollIntoView && window.innerWidth < 900) { try { after.scrollIntoView({ behavior: animationsOn() ? 'smooth' : 'auto', block: 'nearest' }); } catch (e) { /* old browser */ } }
        if (FF.Nav && FF.Nav.focus) setTimeout(function () { if (document.body.contains(nextBtn)) FF.Nav.focus(nextBtn); }, 400);
      }
    }

    function recap() {
      api.shell.hideTimer();
      api.shell.setOnTick(null);
      FF.ui.clear(f.host);
      FF.ui.clear(f.panel);
      FF.ui.clear(f.chips);
      f.root.classList.remove('is-study', 'is-open', 'is-revealed');
      f.root.classList.add('is-recap');
      var box = FF.ui.div('wm-recap');
      var best = 0;
      if (endless) {
        scorers.forEach(function (e) { best = Math.max(best, stats[e.id].reached); });
        var old = Number(store().get(BEST_KEY, 0)) || 0;
        if (best > old) { try { store().set(BEST_KEY, best); } catch (e) { /* storage full */ } }
        box.appendChild(FF.ui.el('h2', { class: 'wm-h wm-h--xl' }, t('wmRecapEndless', 'You reached {n} pictures', { n: best })));
        box.appendChild(FF.ui.el('p', { class: 'wm-note' }, best > old ? t('wmNewBest', 'A new personal best!') : t('wmBestN', 'Your best: {n} pictures', { n: Math.max(old, best) })));
      } else {
        var pct = totals.played ? Math.round(totals.right / totals.played * 100) : 0;
        var ring = FF.ui.div('wm-recap__ring');
        ring.style.setProperty('--p', String(pct));
        ring.appendChild(FF.ui.span('', pct + '%'));
        box.appendChild(ring);
        box.appendChild(FF.ui.el('h2', { class: 'wm-h wm-h--xl' }, t('wmRecapTitle', '{c} of {a} boards spotted', { c: totals.right, a: totals.played })));
        box.appendChild(FF.ui.el('p', { class: 'wm-note' }, summary(cfg)));
      }
      var people = FF.ui.el('ol', { class: 'wm-list' });
      scorers.slice().sort(function (a, b) { return (api.scoring.get(b.id) || 0) - (api.scoring.get(a.id) || 0); }).forEach(function (e, i) {
        var s = stats[e.id];
        var li = FF.ui.el('li', { class: 'wm-row' + (i === 0 ? ' is-top' : '') });
        li.appendChild(FF.ui.span('wm-row__place', String(i + 1)));
        var ava = FF.ui.span('wm-row__ava');
        if (FF.Players && FF.Players.avatarEl) ava.appendChild(FF.Players.avatarEl(e, ''));
        li.appendChild(ava);
        var who = FF.ui.span('wm-row__name');
        who.appendChild(FF.ui.span('', e.name || t('playerLabel', 'Player')));
        var bits = [t('qmRightOf', '{c}/{a} right', { c: s.right, a: s.played })];
        if (endless) bits.push(t('wmNPictures', '{n} pictures', { n: s.reached }));
        if (s.best > 1) bits.push(t('qmBestStreak', 'best streak {n}', { n: s.best }));
        who.appendChild(FF.ui.span('wm-row__meta', bits.join(' · ')));
        li.appendChild(who);
        li.appendChild(FF.ui.span('wm-row__pts', FF.util.formatNumber(api.scoring.get(e.id) || 0)));
        people.appendChild(li);
      });
      box.appendChild(people);
      var go = FF.ui.el('button', { type: 'button', class: 'wm-btn wm-btn--go wm-btn--big' });
      if (FF.Icons && FF.Icons.icon) go.appendChild(FF.Icons.icon('trophy'));
      go.appendChild(FF.ui.span('', t('seeResults', 'See results')));
      go.addEventListener('click', end);
      box.appendChild(go);
      f.panel.appendChild(box);
      api.audio.play('winner');
      if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(box);
    }

    function end() {
      var res = api.scoring.results ? api.scoring.results() : null;
      var best = 0, fastest = null;
      Object.keys(stats).forEach(function (id) {
        best = Math.max(best, stats[id].best);
        if (stats[id].fastest != null && (fastest == null || stats[id].fastest < fastest)) fastest = stats[id].fastest / 1000;
      });
      api.end({ results: (res && res.results) || [], winnerId: res ? res.winnerId : null, bestStreak: best, fastest: fastest, quizCorrect: totals.right, quizAnswered: totals.played });
    }

    next();
  }


  /* ================= online =================
     The referee on the server deals every board and decides every result. Phones draw
     rooms/<code>/wm by phase: study (the board), change (tiles face down), open (the
     changed board and the answer controls), reveal (the truth and everyone's results). */

  var NUDGE_MS = 8000;
  var AUTO_SCORES_MS = 90000;

  function online(api, room) {
    var f = frame(api, 'wm--play wm--online');
    api.shell.hideTimer();
    if (FF.Race && FF.Race.begin) FF.Race.begin(api.def.id, { rounds: 1, mode: 'parallel' });
    var client = FF.WhatsMissingClient.create({ room: room, onChange: schedule });
    var ended = false, pending = null, nudged = {}, autoScores = null, finishedShown = false;
    var autoSent = null;
    var shown = null;        // matchId|k of the round on screen
    var phaseShown = null;   // matchId|k|phase drawn
    var board = null, panel = null, tapHandler = null, sentAnswer = null;
    var lastScores = {};
    var roundChip = chip('', 'wm-chip--round');
    var levelHolder = FF.ui.span('');
    f.chips.appendChild(roundChip);
    f.chips.appendChild(levelHolder);
    var card = FF.ui.div('wm-card wm-leader');
    var clock = clockBar();
    var q = FF.ui.el('h2', { class: 'wm-question' }, '');
    var body = FF.ui.div('wm-body');
    var after = FF.ui.div('wm-after');
    var ticker = setInterval(tick, 200);

    function expected() { return room.meta && room.meta.wmMatch; }
    function who(uid) {
      var p = (room.players || {})[uid] || {};
      return { id: uid, uid: uid, name: p.name || t('playerLabel', 'Player'), avatar: p.avatar || null, color: p.color || null };
    }
    function schedule() { if (!pending) pending = setTimeout(function () { pending = null; render(); }, 0); }
    function cleanup() {
      if (ended) return;
      ended = true;
      clearInterval(ticker);
      if (pending) clearTimeout(pending);
      if (autoScores) clearTimeout(autoScores);
      client.stop();
      if (FF.Race && FF.Race.end) { try { FF.Race.end(); } catch (e) { /* not running */ } }
    }
    function finish() { if (ended) return; cleanup(); api.end({}); }
    function maybeNudge(key, due) {
      if (nudged[key] || !due) return;
      if (client.serverNow() - due < NUDGE_MS) return;
      nudged[key] = true;
      FF.WhatsMissingApi.nudge(room.code);
    }
    function dueOf(wm) {
      return wm.phase === 'starting' ? wm.studyAt : wm.phase === 'study' ? wm.changeAt : wm.phase === 'change' ? wm.openAt
        : wm.phase === 'open' ? wm.closeAt : wm.phase === 'reveal' ? wm.nextAt : 0;
    }

    function tick() {
      if (ended) return;
      var wm = client.view().wm;
      if (!wm || wm.matchId !== expected()) return;
      var now = client.serverNow();
      if (wm.phase === 'study') clock.set((wm.changeAt - now) / 1000, wm.settings.seconds, 'study');
      else if (wm.phase === 'open') {
        clock.set((wm.closeAt - now) / 1000, (wm.closeAt - wm.openAt) / 1000, 'answer');
        // Time is up: send what is filled in so far (a Several gone half done still scores its right gaps).
        var key = wm.matchId + '|' + wm.k;
        if (panel && !sentAnswer && autoSent !== key && now >= wm.closeAt - 250) {
          autoSent = key;
          var cur = panel.current();
          if (hasAny(cur) && client.send(cur)) sentAnswer = cur;
        }
      }
      var due = dueOf(wm);
      if (due) maybeNudge(wm.phase + wm.k, due);
    }

    /* Everyone's score, with a tick for who has answered and their result at the reveal. */
    function drawLeader(wm, reveal) {
      FF.ui.clear(card);
      var list = FF.ui.el('ol', { class: 'wm-list wm-list--room' });
      var order = (wm.order || []).slice().sort(function (a, b) { return ((wm.p[b] || {}).score || 0) - ((wm.p[a] || {}).score || 0); });
      order.forEach(function (uid, i) {
        var row = wm.p[uid] || {};
        var li = FF.ui.el('li', { class: 'wm-row' + (uid === client.uid ? ' is-me' : '') + (i === 0 && (row.score || 0) > 0 ? ' is-top' : '') });
        li.appendChild(FF.ui.span('wm-row__place', String(i + 1)));
        var ava = FF.ui.span('wm-row__ava');
        if (FF.Players && FF.Players.avatarEl) ava.appendChild(FF.Players.avatarEl(who(uid), ''));
        li.appendChild(ava);
        var nm = FF.ui.span('wm-row__name');
        nm.appendChild(FF.ui.span('', who(uid).name + (uid === client.uid ? ' ' + t('youTag', '(you)') : '')));
        if (reveal && row.last && row.last.k === wm.k) {
          var l = row.last;
          li.classList.add(l.ok ? 'is-good' : l.rightGaps ? 'is-part' : 'is-bad');
          nm.appendChild(FF.ui.span('wm-row__meta', l.ok ? t('wmRight', 'Spot on!') : l.none ? t('wmTimeUp', 'Time’s up!')
            : l.rightGaps ? t('wmSome', '{n} of {m} right', { n: l.rightGaps, m: (wm.round && wm.round.gaps) || 1 }) : t('wmWrong', 'Not quite')));
        } else if (wm.phase === 'open') {
          nm.appendChild(FF.ui.span('wm-row__meta', row.inK === wm.k ? t('wmAnswered', 'Answered') : t('wmThinking', 'Thinking…')));
        }
        li.appendChild(nm);
        if (wm.phase === 'open' && row.inK === wm.k) li.appendChild(FF.ui.span('wm-row__in', '✓'));
        var pts = FF.ui.span('wm-row__pts', FF.util.formatNumber(row.score || 0));
        li.appendChild(pts);
        if (reveal && row.last && row.last.k === wm.k && lastScores[uid] != null) countUp(pts, lastScores[uid], row.score || 0, 900);
        if (!reveal || lastScores[uid] == null || (row.last && row.last.k === wm.k)) lastScores[uid] = row.score || 0;
        list.appendChild(li);
      });
      card.appendChild(list);
    }

    function waiting(title, sub) {
      FF.ui.clear(f.host);
      FF.ui.clear(f.panel);
      board = null;
      var w = FF.ui.div('wm-wait');
      w.appendChild(FF.ui.div('wm-wait__spin'));
      w.appendChild(FF.ui.el('h2', { class: 'wm-h' }, title));
      if (sub) w.appendChild(FF.ui.el('p', { class: 'wm-note' }, sub));
      f.panel.appendChild(w);
    }

    /* The panel for a round: scores, clock, the question, the controls, the result. */
    function layout() {
      FF.ui.clear(f.panel);
      FF.ui.clear(body);
      FF.ui.clear(after);
      f.panel.appendChild(card);
      f.panel.appendChild(clock.el);
      f.panel.appendChild(q);
      f.panel.appendChild(body);
      f.panel.appendChild(after);
    }

    function render() {
      if (ended) return;
      if (!f.root.isConnected) { cleanup(); return; }
      var v = client.view();
      var wm = v.wm;
      if (!wm || (expected() && wm.matchId !== expected())) {
        waiting(t('wmGettingReady', 'Laying out the tiles…'), t('wmGettingReadySub', 'Everyone sees the same board at the same moment.'));
        return;
      }
      FF.ui.clear(levelHolder);
      levelHolder.appendChild(chip(levelName(wm.settings.level), 'wm-chip--level wm-lv-' + wm.settings.level));
      roundChip.textContent = wm.k >= 0 ? t('gsRoundOf', 'Round {r} of {n}', { r: wm.k + 1, n: wm.total }) : t('gsGetReady', 'Get ready');
      if (wm.phase === 'ended') { if (!finishedShown && FF.WhatsMissingClient.ready(wm)) showEnd(wm, v); return; }
      if (wm.phase === 'starting') {
        if (phaseShown !== 'starting') {
          phaseShown = 'starting';
          waiting(t('wmBrief', 'Study the board. Spot what changed.'), t('wmBriefSub', 'Everyone studies the same board, then the tiles flip and something changes. Faster right answers score more, and streaks multiply your points.'));
        }
        return;
      }
      var rd = wm.round;
      // Half a round (it can arrive in pieces): wait for the rest before drawing this phase.
      if (!rd || rd.k !== wm.k || !FF.WhatsMissingClient.ready(wm)) return;
      var key = wm.matchId + '|' + wm.k;
      var pkey = key + '|' + wm.phase;
      var seated = v.seated;
      drawLeader(wm, wm.phase === 'reveal');
      if (pkey === phaseShown) { lockIfIn(wm, v); return; }
      var was = phaseShown;
      phaseShown = pkey;

      if (wm.phase === 'study') { study(wm, rd, key); return; }
      if (shown !== key) {
        // Joined (or came back) after the study time: no study board to show.
        startRound(rd, key);
        board = makeBoard(rd, rd.after || blankList(rd), { onTap: function (s) { if (tapHandler) tapHandler(s); } });
        f.host.appendChild(board.el);
        f.fit();
      }
      if (wm.phase === 'change') {
        clock.idle();
        q.textContent = t('wmWatch', 'Something is changing…');
        if (board) board.el.classList.add('is-hidden');
        api.audio.play('whoosh');
        return;
      }
      if (wm.phase === 'open') { openRound(wm, rd, v, was === key + '|change'); return; }
      if (wm.phase === 'reveal') showReveal(wm, rd, v);
    }

    function hasAny(a) {
      if (!a) return false;
      var l = a.slots || a.picks || a.text || [];
      return l.some(function (x) { return x != null && x !== ''; });
    }
    function blankList(rd) { var a = []; for (var i = 0; i < rd.slots; i++) a.push(null); return a; }

    function startRound(rd, key) {
      shown = key;
      sentAnswer = null;
      panel = null;
      tapHandler = null;
      preload(rd);
      f.root.classList.remove('is-revealed', 'is-open', 'is-recap');
      FF.ui.clear(f.host);
      layout();
    }

    function study(wm, rd, key) {
      startRound(rd, key);
      f.root.classList.add('is-study');
      q.textContent = t('wmStudy', 'Remember every picture');
      board = makeBoard(rd, rd.before, { onTap: function (s) { if (tapHandler) tapHandler(s); } });
      board.el.classList.add('is-popping');
      f.host.appendChild(board.el);
      api.audio.play('flip');
      later(function () { if (board) board.el.classList.remove('is-popping'); }, POP_MS * rd.slots + 500);
      if (!client.view().seated) body.appendChild(FF.ui.el('p', { class: 'wm-note' }, t('gsWatchingSub', 'You can join the next one.')));
      f.fit();
      tick();
    }

    function openRound(wm, rd, v, flipping) {
      var go = function () {
        if (ended || phaseShown !== wm.matchId + '|' + wm.k + '|open') return;
        f.root.classList.remove('is-study');
        f.root.classList.add('is-open');
        q.textContent = question(rd);
        FF.ui.clear(body);
        if (!v.seated) { body.appendChild(FF.ui.el('p', { class: 'wm-note' }, t('gsWatching', 'This game started without you'))); f.fit(); return; }
        panel = answerPanel(api, rd, board, {
          tiles: rd.tiles || null, onLayout: f.fit,
          onTap: function (fn) { tapHandler = fn; },
          onSubmit: function (a) {
            if (!client.send(a)) return;
            sentAnswer = a;
            api.audio.play('select');
            body.appendChild(FF.ui.el('p', { class: 'wm-locked is-on', 'aria-live': 'polite' }, t('bqLockedIn', 'Answer locked in. Waiting for everyone…')));
            f.fit();
          }
        });
        body.appendChild(panel.el);
        lockIfIn(wm, v);
        f.fit();
        tick();
        if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(panel.el);
      };
      if (flipping && board) {
        // The tiles are face down from the change phase: turn them over onto the new board.
        board.fill(rd.after);
        holesOf(rd).forEach(function (s) { board.mark(s, 'is-gap'); });
        board.el.classList.remove('is-hidden');
        later(function () { holesOf(rd).forEach(function (s) { if (board) sparkle(board.tiles[s]); }); }, FLIP_MS);
        go();
      } else {
        if (board) { board.fill(rd.after); holesOf(rd).forEach(function (s) { board.mark(s, 'is-gap'); }); board.el.classList.remove('is-hidden'); }
        go();
      }
    }

    /* Answered on another tab or before a reload: the server already has it. */
    function lockIfIn(wm, v) {
      var me = wm.p[v.uid];
      if (wm.phase !== 'open' || !me || me.inK !== wm.k || !board) return;
      if (panel && !panel.locked) {
        panel.locked = true;
        board.tappable(null);
        Array.prototype.forEach.call(body.querySelectorAll('button'), function (b) { b.disabled = true; });
        if (!body.querySelector('.wm-locked')) body.appendChild(FF.ui.el('p', { class: 'wm-locked is-on', 'aria-live': 'polite' }, t('bqLockedIn', 'Answer locked in. Waiting for everyone…')));
      }
    }

    function showReveal(wm, rd, v) {
      if (!board) return;
      f.root.classList.remove('is-study');
      f.root.classList.add('is-open', 'is-revealed');
      clock.idle();
      tapHandler = null;
      var me = (wm.p[v.uid] || {}).last;
      var mine = me && me.k === wm.k ? me : { ok: false, right: [], rightGaps: 0, pts: 0, none: true };
      var said = { picks: mine.picks, text: mine.text, slots: mine.slots || (sentAnswer && sentAnswer.slots) || [] };
      var right = rd.answer.ids.map(function (x, i) { return !!(mine.right && mine.right[i]); });
      if (panel) panel.finish(!!mine.ok);
      showTruth(board, rd, said, { ok: !!mine.ok, right: right, rightGaps: mine.rightGaps || 0 });
      FF.ui.clear(body);
      FF.ui.clear(after);
      if (!v.seated) { after.appendChild(FF.ui.el('p', { class: 'wm-reveal__said' }, saidLine(rd, {}, { ok: false }))); f.fit(); return; }
      api.audio.play(mine.ok ? 'correct' : 'wrong');
      if (mine.ok && animationsOn() && FF.Confetti) FF.Confetti.burst(mine.streak >= 3 ? 60 : 30);
      var head = mine.ok ? t('wmRight', 'Spot on!') : mine.none ? t('wmTimeUp', 'Time’s up!')
        : mine.rightGaps ? t('wmSome', '{n} of {m} right', { n: mine.rightGaps, m: rd.gaps }) : t('wmWrong', 'Not quite');
      var rc = FF.ui.div('wm-reveal is-' + (mine.ok ? 'good' : mine.rightGaps ? 'part' : 'bad'));
      rc.appendChild(FF.ui.el('p', { class: 'wm-reveal__head' }, head));
      var line = saidLine(rd, said, { ok: !!mine.ok });
      if (line) rc.appendChild(FF.ui.el('p', { class: 'wm-reveal__said' }, line));
      if (mine.pts) {
        rc.appendChild(FF.ui.el('p', { class: 'wm-reveal__pts' }, '+' + FF.util.formatNumber(mine.pts)));
        rc.appendChild(FF.ui.el('p', { class: 'wm-reveal__why' }, pointsLine({ base: mine.base || 0, speed: mine.speed || 0, bonus: mine.bonus || 0, mult: mine.mult || 1 })));
      }
      after.appendChild(rc);
      after.appendChild(FF.ui.el('p', { class: 'wm-note wm-nextin' }, wm.k + 1 >= wm.total ? t('gsFinalSoon', 'Final results coming up…') : t('wmNextSoon', 'Next board in a moment…')));
      f.fit();
    }

    function showEnd(wm, v) {
      finishedShown = true;
      board = null;
      FF.ui.clear(f.host);
      FF.ui.clear(f.panel);
      FF.ui.clear(f.chips);
      clock.idle();
      f.root.classList.remove('is-study', 'is-open', 'is-revealed');
      f.root.classList.add('is-recap');
      var rows = (wm.result && wm.result.rows) || [];
      var top = rows[0];
      var meWon = !!top && top.uid === v.uid && !(rows[1] && rows[1].place === 1);
      var box = FF.ui.div('wm-recap wm-recap--room');
      box.appendChild(FF.ui.el('h2', { class: 'wm-h wm-h--xl' }, meWon ? t('wmYouWin', 'You spotted the most!')
        : top ? t('wmWinner', '{name} spotted the most!', { name: who(top.uid).name }) : t('gsOver', 'Game over')));
      box.appendChild(FF.ui.el('p', { class: 'wm-note' }, summary(wm.settings)));
      var list = FF.ui.el('ol', { class: 'wm-list' });
      rows.forEach(function (r) {
        var li = FF.ui.el('li', { class: 'wm-row' + (r.place === 1 ? ' is-top' : '') + (r.uid === v.uid ? ' is-me' : '') });
        li.appendChild(FF.ui.span('wm-row__place', String(r.place)));
        var ava = FF.ui.span('wm-row__ava');
        if (FF.Players && FF.Players.avatarEl) ava.appendChild(FF.Players.avatarEl(who(r.uid), ''));
        li.appendChild(ava);
        var nm = FF.ui.span('wm-row__name');
        nm.appendChild(FF.ui.span('', who(r.uid).name));
        var bits = [t('qmRightOf', '{c}/{a} right', { c: r.right || 0, a: wm.total })];
        if (r.best > 1) bits.push(t('qmBestStreak', 'best streak {n}', { n: r.best }));
        nm.appendChild(FF.ui.span('wm-row__meta', bits.join(' · ')));
        li.appendChild(nm);
        li.appendChild(FF.ui.span('wm-row__pts', FF.util.formatNumber(r.points || 0)));
        list.appendChild(li);
      });
      box.appendChild(list);
      var go = FF.ui.el('button', { type: 'button', class: 'wm-btn wm-btn--go wm-btn--big' });
      if (FF.Icons && FF.Icons.icon) go.appendChild(FF.Icons.icon('trophy'));
      go.appendChild(FF.ui.span('', t('srtSeeScores', 'See scores')));
      go.addEventListener('click', function () { api.audio.play('click'); finish(); });
      box.appendChild(go);
      f.panel.appendChild(box);
      api.audio.play(meWon ? 'winner' : 'roundEnd');
      if (meWon && animationsOn() && FF.Confetti) FF.Confetti.burst(100);
      if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(box);
      if (!autoScores) autoScores = setTimeout(finish, AUTO_SCORES_MS);
    }

    render();
  }

  /* ================= room settings ================= */

  function roomFields() {
    function opt(label, value) { return { label: label, value: value }; }
    return [
      { key: 'level', label: t('gcLevel', 'Level'), options: R.ROOM_LEVELS.map(function (l) { return opt(levelName(l), l); }) },
      { key: 'theme', label: t('wmTheme', 'Pictures'), options: R.THEMES.map(function (x) { return opt(themeName(x), x); }) },
      { key: 'seconds', label: t('wmStudyTime', 'Study time'), options: R.SECONDS.map(function (n) { return opt(n + 's', n); }) },
      { key: 'choices', label: t('wmChoices', 'Answers to pick from'), options: R.CHOICES.map(function (n) { return opt(String(n), n); }) },
      { key: 'twists', label: t('wmTwists', 'Changes'), options: R.TWISTS.map(function (x) { return opt(x === 'gone' ? t('wmTwistGoneOnly', 'Only gone') : t('wmTwistMix', 'All kinds'), x); }) },
      { key: 'rounds', label: t('wmRounds', 'Boards'), options: R.ROUNDS.map(function (n) { return opt(String(n), n); }) }
    ];
  }

  var ROOM = {
    minPlayers: R.MIN_PLAYERS,
    defaults: R.STANDARD,
    fields: function () { return roomFields(); },
    sanitize: function (s) { return R.sanitizeRoom(s); },
    summary: function (s) { var c = R.sanitizeRoom(s); return summary(c) + ' · ' + t('wmNBoards', '{n} boards', { n: c.rounds }); },
    start: function (room, pick) { return FF.WhatsMissingApi.start(room, pick); }
  };

  /* ================= register ================= */

  FF.registerGame({
    id: 'whatsMissing',
    name: "What's Missing?",
    description: 'Study the picture tiles, watch them flip, then spot what vanished, what sneaked in or what swapped.',
    category: 'memory',
    icon: '🧐',
    players: [1, 8],
    difficulty: 'Easy',
    duration: 4,
    tags: ['quick', 'observation', 'memory'],
    modes: ['solo', 'turn'],
    defaultMode: 'solo',
    leaderboard: true,
    room: ROOM,
    howToPlay: [
      'Study the board of picture tiles before the time runs out (or tap I’m ready).',
      'The tiles flip and one thing changes: a picture is gone, a new one sneaks in, two swap places, or on Hard several go at once.',
      'Pick what was in each gap, or tap the newcomer, or tap both pictures that swapped.',
      'Easy has 4 pictures, Normal 6, Hard 8. Expert starts at 10 and you spell the missing names. Endless grows by one picture until you miss.',
      'Fast answers score more, and 3 or 5 right in a row multiply your points.'
    ],
    start: function (api) {
      var room = FF.Room && FF.Room.current();
      if (racingRoom(api) && room) { online(api, room); return; }
      // One number decides every board, drawn first so a challenge deals the same everywhere.
      var seed = Math.floor(rand0() * 4294967296);
      if (api.config.daily || api.config.challenge) { play(api, R.STANDARD, seed); return; }
      setupScreen(api, function (cfg) {
        if (!stillShown(api)) return;
        if (!R.isStandard(cfg)) api.config.customRules = true;
        play(api, cfg, seed);
      });
    }
  });

  FF.WhatsMissingGame = {
    frame: frame, makeBoard: makeBoard, flipTo: flipTo, answerPanel: answerPanel, showTruth: showTruth,
    saidLine: saidLine, pointsLine: pointsLine, question: question, summary: summary, cardName: cardName,
    picEl: picEl, preload: preload, clockBar: clockBar, chip: chip, glyph: glyph, levelName: levelName, twistName: twistName,
    holesOf: holesOf, maskedSet: maskedSet, roomFields: roomFields, online: online
  };
})();
