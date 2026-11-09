/* ============================================================
   PLAYMONA — games/charades.js
   Charades: act it out in silence while your team guesses.
   Fast rounds, the modern party way: the actor gets a timer and acts
   as many cards as they can, tapping (or swiping) Got it or Pass.
   Teams take turns, actors rotate inside each team, and a recap after
   every turn shows what was guessed and what was passed.

   - Rules: js/charades/rules.js (FF.CharadesRules).
   - Cards: js/data/charadesDecks.js (12 themed decks, easy/normal/hard).
   - Look: a theatre stage (velvet, curtains, spotlight, marquee bulbs)
     with GeoSpin's glass panels and arcade buttons (.chr- in games.css).
   - TV display: the whole room acts the same card together.
   One device, passed around. No online rooms.
   Classic script, ES5.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.CharadesRules;
  var SETUP_KEY = 'charades:setup:v1';
  var SWIPE_PX = 60;

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
  function later(fn, ms) { return setTimeout(fn, animationsOn() ? ms : Math.min(ms, 60)); }
  function stillShown(api) { return !!(api.shell.root && document.body && document.body.contains(api.shell.root)); }
  function decks() { return (FF.data && FF.data.charadesDecks) || []; }
  function deckIds() { return decks().map(function (d) { return d.id; }); }
  function deckById(id) { return decks().filter(function (d) { return d.id === id; })[0] || null; }

  function deckName(id) { var d = deckById(id); return t('chrDeck_' + id, d ? d.name : id); }
  function levelName(l) { return l === 'easy' ? t('easy', 'Easy') : l === 'hard' ? t('hard', 'Hard') : t('normal', 'Normal'); }
  function signalName(id) {
    var s = R.SIGNALS.filter(function (x) { return x.id === id; })[0];
    return s ? t('chrSig_' + id, s.name) : id;
  }
  function signalLine(id) {
    return id === 'film' ? t('chrSigLineFilm', 'Film: crank the camera')
      : id === 'song' ? t('chrSigLineSong', 'Song: pretend to sing')
      : id === 'tv' ? t('chrSigLineTv', 'TV: draw a screen')
      : t('chrSigLineBook', 'Book: open your hands');
  }

  /* Small inline drawings (stroke uses currentColor). */
  var GLYPHS = {
    paw: '<circle cx="7" cy="9" r="2"/><circle cx="12" cy="6.5" r="2"/><circle cx="17" cy="9" r="2"/><path d="M8 17c0-3 2-5 4-5s4 2 4 5c0 2-2 2.5-4 2.5S8 19 8 17z"/>',
    run: '<circle cx="14" cy="4.5" r="2"/><path d="M8 21l3-6 3 3v3M11 15l1-5 3 2 3-1M7 11l3-2h3"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2M3 12h18"/>',
    ball: '<circle cx="12" cy="12" r="9"/><path d="M12 7l4 3-1.5 4.5h-5L8 10z"/><path d="M12 3v4M21 10l-5 0M17.5 19l-3-4.5M6.5 19l3-4.5M3 10h5"/>',
    fork: '<path d="M7 3v7a2 2 0 0 0 4 0V3M9 10v11"/><path d="M17 3c-2 2-2 6 0 8v10"/>',
    house: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    smile: '<circle cx="12" cy="12" r="9"/><path d="M8 14c1.2 1.6 2.5 2.3 4 2.3s2.8-.7 4-2.3"/><path d="M9 9.5h.01M15 9.5h.01"/>',
    film: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/><circle cx="7" cy="10" r="1"/>',
    music: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
    book: '<path d="M12 6c-2-1.5-5-2-8-2v14c3 0 6 .5 8 2 2-1.5 5-2 8-2V4c-3 0-6 .5-8 2z"/><path d="M12 6v14"/>',
    tv: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 21h8M9 3l3 3 3-3"/>',
    dove: '<path d="M3 14c4 0 6-2 8-5 1-1.6 3-3 5-3l2 1-2 1c0 5-4 9-9 9-2 0-3-1-4-3z"/><path d="M11 9c-1-2-3-3-5-3 0 2 1 4 3 5"/>',
    mix: '<path d="M12 3l2.4 5 5.6.8-4 3.9.9 5.6L12 15.6 7.1 18.3l.9-5.6-4-3.9 5.6-.8z"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    skip: '<path d="M6 6l6 6-6 6M13 6l6 6-6 6"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 1-1 1.7v.5M12 17h.01"/>',
    soundOn: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/>',
    soundOff: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9l5 6M22 9l-5 6"/>',
    mask: '<path d="M4 5c5 2 11 2 16 0v6c0 5-4 9-8 9s-8-4-8-9z"/><path d="M8 10h2M14 10h2M9 15c1.8 1.3 4.2 1.3 6 0"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M9 17h6"/>'
  };
  function glyph(name, cls) {
    var s = document.createElement('span');
    s.className = 'chr-glyph' + (cls ? ' ' + cls : '');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (GLYPHS[name] || GLYPHS.mix) + '</svg>';
    return s;
  }
  function button(label, cls, icon, onClick) {
    var b = FF.ui.el('button', { type: 'button', class: 'chr-btn' + (cls ? ' ' + cls : '') });
    if (icon) b.appendChild(glyph(icon));
    b.appendChild(FF.ui.span('chr-btn__label', label));
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }
  function chip(text, cls, icon) {
    var c = FF.ui.span('chr-chip' + (cls ? ' ' + cls : ''));
    if (icon) c.appendChild(glyph(icon));
    c.appendChild(FF.ui.span('', text));
    return c;
  }
  function bulbs() {
    var b = FF.ui.div('chr-bulbs');
    b.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 14; i++) b.appendChild(FF.ui.span('chr-bulb'));
    return b;
  }

  function soundButton() {
    var b = FF.ui.el('button', { type: 'button', class: 'chr-iconbtn' });
    function sync() {
      var on = FF.Audio.effectsEnabled !== false;
      FF.ui.clear(b);
      b.appendChild(glyph(on ? 'soundOn' : 'soundOff'));
      var label = on ? t('gsFxOff', 'Turn sound effects off') : t('gsFxOn', 'Turn sound effects on');
      b.setAttribute('aria-label', label);
      b.title = label;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.classList.toggle('is-off', !on);
    }
    b.addEventListener('click', function () {
      FF.Audio.setEffects(FF.Audio.effectsEnabled === false);
      if (FF.Audio.effectsEnabled) FF.Audio.play('tap');
      sync();
    });
    sync();
    return b;
  }

  /* The countdown ring: seconds in the middle, a draining gold arc. */
  function timerRing() {
    var el = FF.ui.div('chr-timer');
    el.setAttribute('role', 'timer');
    el.innerHTML = '<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="chr-timer__track" cx="50" cy="50" r="44"/>' +
      '<circle class="chr-timer__arc" cx="50" cy="50" r="44" pathLength="100"/></svg>';
    var num = FF.ui.span('chr-timer__num', '');
    el.appendChild(num);
    var arc = el.querySelector ? el.querySelector('.chr-timer__arc') : null;
    return {
      el: el,
      set: function (rem, total) {
        var r = Math.max(0, rem);
        var s = Math.ceil(r);
        num.textContent = String(s);
        var p = total ? Math.max(0, Math.min(1, r / total)) : 0;
        if (arc) arc.style.strokeDashoffset = String(100 - p * 100);
        el.classList.toggle('is-low', r <= 5 && r > 0);
        el.setAttribute('aria-label', t('secondsLeft', '{n} seconds left', { n: s }));
      }
    };
  }

  /* The stage: curtains, a top bar (title, chips, help and sound) and the main area. */
  function frame(api, cls, onHelp) {
    var root = api.shell.root;
    FF.ui.clear(root);
    if (api.shell.el) api.shell.el.classList.add('chr-shell');
    var ch = FF.ui.div('chr' + (cls ? ' ' + cls : ''));
    var curtL = FF.ui.div('chr-curtain chr-curtain--l');
    var curtR = FF.ui.div('chr-curtain chr-curtain--r');
    curtL.setAttribute('aria-hidden', 'true');
    curtR.setAttribute('aria-hidden', 'true');
    ch.appendChild(curtL);
    ch.appendChild(curtR);
    var spot = FF.ui.div('chr-spot');
    spot.setAttribute('aria-hidden', 'true');
    ch.appendChild(spot);

    var top = FF.ui.div('chr-top');
    var brand = FF.ui.div('chr-brand');
    brand.appendChild(glyph('mask', 'chr-brand__mask'));
    brand.appendChild(FF.ui.span('chr-brand__name', t('chrName', 'Charades')));
    top.appendChild(brand);
    var chips = FF.ui.div('chr-chips');
    top.appendChild(chips);
    var tools = FF.ui.div('chr-tools');
    if (onHelp) {
      var help = FF.ui.el('button', { type: 'button', class: 'chr-iconbtn', 'aria-label': t('chrSignals', 'Charades signals'), title: t('chrSignals', 'Charades signals') });
      help.appendChild(glyph('help'));
      help.addEventListener('click', onHelp);
      tools.appendChild(help);
    }
    tools.appendChild(soundButton());
    top.appendChild(tools);
    ch.appendChild(top);

    var main = FF.ui.div('chr-main');
    var stage = FF.ui.div('chr-stage');
    var side = FF.ui.div('chr-side');
    main.appendChild(stage);
    main.appendChild(side);
    ch.appendChild(main);
    root.appendChild(ch);
    return { root: ch, top: top, chips: chips, main: main, stage: stage, side: side };
  }

  function segmented(label, items, current, onPick) {
    var wrap = FF.ui.div('chr-seg');
    wrap.appendChild(FF.ui.el('h3', { class: 'chr-h3' }, label));
    var row = FF.ui.el('div', { class: 'chr-seg__row', role: 'group', 'aria-label': label });
    var btns = items.map(function (it) {
      var b = FF.ui.el('button', { type: 'button', class: 'chr-seg__btn' }, it.label);
      b.addEventListener('click', function () { onPick(it.id); });
      row.appendChild(b);
      return { el: b, id: it.id };
    });
    wrap.appendChild(row);
    return {
      el: wrap,
      sync: function (v) { btns.forEach(function (x) { x.el.classList.toggle('is-on', x.id === v); x.el.setAttribute('aria-pressed', x.id === v ? 'true' : 'false'); }); }
    };
  }

  /* ================= signals sheet (filled in by signals()) ================= */

  function openSignals() {
    if (FF.CharadesGame && FF.CharadesGame.signals) FF.CharadesGame.signals();
  }

  /* ================= setup ================= */

  function setupScreen(api, onGo) {
    api.shell.hideTimer();
    if (FF.GameLength && FF.GameLength.pause) FF.GameLength.pause();
    var c = R.sanitize(store().get(SETUP_KEY, null) || R.STANDARD, deckIds());
    var f = frame(api, 'chr--setup', openSignals);

    var hero = FF.ui.div('chr-hero');
    hero.appendChild(bulbs());
    hero.appendChild(FF.ui.el('h2', { class: 'chr-hero__title' }, t('chrTagline', 'Act it out. No talking!')));
    var how = FF.ui.el('ol', { class: 'chr-how' });
    [t('chrHow1', 'Pass the phone to the actor. Only they look.'), t('chrHow2', 'Act as many cards as you can before time runs out.'),
      t('chrHow3', 'Your team shouts guesses. Tap Got it or Pass.')].forEach(function (x, i) {
      var li = FF.ui.el('li', {});
      li.appendChild(FF.ui.span('chr-how__n', String(i + 1)));
      li.appendChild(FF.ui.span('', x));
      how.appendChild(li);
    });
    hero.appendChild(how);
    f.stage.appendChild(hero);

    var p = FF.ui.div('chr-card chr-setup');
    p.appendChild(FF.ui.el('h3', { class: 'chr-h3' }, t('chrDecks', 'Cards')));
    var grid = FF.ui.el('div', { class: 'chr-decks', role: 'group', 'aria-label': t('chrDecks', 'Cards') });
    var tiles = [{ id: 'mix', name: t('chrMixed', 'Mixed'), glyph: 'mix', n: decks().reduce(function (n, d) { return n + d.cards.length; }, 0) }]
      .concat(decks().map(function (d) { return { id: d.id, name: deckName(d.id), glyph: d.glyph, n: d.cards.length }; }))
      .map(function (d) {
        var b = FF.ui.el('button', { type: 'button', class: 'chr-deck' + (d.id === 'mix' ? ' chr-deck--mix' : '') });
        b.appendChild(glyph(d.glyph));
        b.appendChild(FF.ui.span('chr-deck__name', d.name));
        b.appendChild(FF.ui.span('chr-deck__n', String(d.n)));
        b.addEventListener('click', function () { toggleDeck(d.id); api.audio.play('tap'); sync(); });
        grid.appendChild(b);
        return { el: b, id: d.id };
      });
    p.appendChild(grid);

    function toggleDeck(id) {
      if (id === 'mix') { c.decks = ['mix']; return; }
      var list = c.decks.indexOf('mix') !== -1 ? [] : c.decks.slice();
      var at = list.indexOf(id);
      if (at === -1) list.push(id); else list.splice(at, 1);
      c.decks = list.length ? list : ['mix'];
    }

    var level = segmented(t('gcLevel', 'Level'), R.LEVELS.map(function (l) { return { id: l, label: levelName(l) }; }), c.level, function (v) { c.level = v; api.audio.play('select'); sync(); });
    var secs = segmented(t('chrTurnLength', 'Time to act'), R.SECONDS.map(function (n) { return { id: n, label: t('wmSecs', '{n} s', { n: n }) }; }), c.seconds, function (v) { c.seconds = v; api.audio.play('tap'); sync(); });
    var turns = segmented(t('chrTurnsEach', 'Turns each'), R.TURNS.map(function (n) { return { id: n, label: String(n) }; }), c.turns, function (v) { c.turns = v; api.audio.play('tap'); sync(); });
    var twists = segmented(t('chrTwists', 'Acting twists'), [{ id: false, label: t('off', 'Off') }, { id: true, label: t('on', 'On') }], c.twists, function (v) { c.twists = v; api.audio.play('tap'); sync(); });
    var row = FF.ui.div('chr-setup__row');
    [level, secs, turns, twists].forEach(function (x) { row.appendChild(x.el); });
    p.appendChild(row);
    var note = FF.ui.el('p', { class: 'chr-note', 'aria-live': 'polite' });
    p.appendChild(note);

    var foot = FF.ui.div('chr-setup__foot');
    foot.appendChild(button(t('chrSignalsShort', 'Signals'), 'chr-btn--ghost', 'help', openSignals));
    var go = button(t('chrStart', 'Start the show'), 'chr-btn--go chr-btn--big', 'mask', function () {
      var cfg = R.sanitize(c, deckIds());
      try { store().set(SETUP_KEY, cfg); } catch (e) { /* storage full */ }
      api.audio.play('roundStart');
      if (FF.GameLength && FF.GameLength.resume) FF.GameLength.resume();
      onGo(cfg);
    });
    foot.appendChild(go);
    p.appendChild(foot);
    f.side.appendChild(p);

    function sync() {
      tiles.forEach(function (x) {
        var on = c.decks.indexOf(x.id) !== -1;
        x.el.classList.toggle('is-on', on);
        x.el.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      level.sync(c.level); secs.sync(c.seconds); turns.sync(c.turns); twists.sync(c.twists);
      var n = R.pool(decks(), c).length;
      note.textContent = t('chrNReady', '{n} cards ready', { n: n }) + ' · ' +
        (c.level === 'easy' ? t('chrEasyNote', 'Easy: simple words little ones can act.')
          : c.level === 'hard' ? t('chrHardNote', 'Hard: tricky words and titles.')
          : t('chrNormalNote', 'Normal: a mix of easy and medium cards.')) +
        (c.twists ? ' · ' + t('chrTwistNote', 'About 1 card in 4 gets a twist worth +1.') : '');
    }
    sync();
    if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(p);
  }

  /* ================= the game ================= */

  function scorerList(config) {
    if (config.scorers && config.scorers.length) return config.scorers.slice();
    if (config.players && config.players.length) return config.players.slice();
    return [{ id: 'p1', name: t('you', 'You'), avatar: null }];
  }

  function play(api, cfg) {
    cfg = R.sanitize(cfg, deckIds());
    var scorers = scorerList(api.config);
    var byId = {};
    scorers.forEach(function (s) { byId[s.id] = s; });
    var order = R.turnOrder(scorers, cfg.turns);
    // Teams with nobody in them: play as individuals named after the scorers.
    if (!order.length) order = R.turnOrder(scorers.map(function (s) { return { id: s.id, name: s.name }; }), cfg.turns);
    var dealer = R.Dealer(R.pool(decks(), cfg), rand0);
    var k = 0;
    var stats = {};   // actorId -> { guessed, best }
    var ended = false;
    var f = null;

    function actorOf(spec) {
      var p = FF.Players && FF.Players.byId ? FF.Players.byId(spec.actorId) : null;
      return p || byId[spec.actorId] || byId[spec.scorerId] || { id: spec.actorId, name: t('playerLabel', 'Player') };
    }
    function teamOf(spec) { return byId[spec.scorerId] || null; }
    function isTeam(spec) { var s = teamOf(spec); return !!(s && s.players); }
    function scoreOf(id) { return api.scoring.get ? (api.scoring.get(id) || 0) : 0; }
    function turnChip() { return chip(t('chrTurnOf', 'Turn {n} of {total}', { n: k + 1, total: order.length }), 'chr-chip--turn'); }

    function scoreboard(highlightId, pending) {
      var list = FF.ui.el('ol', { class: 'chr-board' });
      scorers.slice().sort(function (a, b) { return scoreOf(b.id) - scoreOf(a.id); }).forEach(function (s) {
        var li = FF.ui.el('li', { class: 'chr-row' + (s.id === highlightId ? ' is-now' : '') });
        var dot = FF.ui.span('chr-row__dot');
        if (s.color) dot.style.background = s.color;
        li.appendChild(dot);
        li.appendChild(FF.ui.span('chr-row__name', s.name || t('playerLabel', 'Player')));
        if (pending && s.id === highlightId && pending > 0) li.appendChild(FF.ui.span('chr-row__plus', '+' + pending));
        li.appendChild(FF.ui.span('chr-row__pts', FF.util.formatNumber(scoreOf(s.id))));
        list.appendChild(li);
      });
      return list;
    }

    function next() {
      if (ended || !stillShown(api)) return;
      if (k >= order.length) { podium(); return; }
      handOver(order[k]);
    }

    /* ---------- 1. pass the phone ---------- */
    function handOver(spec) {
      api.shell.hideTimer();
      var actor = actorOf(spec);
      var team = teamOf(spec);
      f = frame(api, 'chr--handover', openSignals);
      f.chips.appendChild(turnChip());
      api.shell.updateScores(spec.scorerId);

      var box = FF.ui.div('chr-handover');
      box.appendChild(bulbs());
      var ava = FF.ui.div('chr-handover__ava');
      if (FF.Players && FF.Players.avatarEl) ava.appendChild(FF.Players.avatarEl(actor, ''));
      if (team && team.color) ava.style.setProperty('--team', team.color);
      box.appendChild(ava);
      box.appendChild(FF.ui.el('p', { class: 'chr-handover__pass' }, scorers.length > 1 || order.length > 1 ? t('chrPassTo', 'Pass the phone to') : t('chrYourTurn', 'Your turn')));
      box.appendChild(FF.ui.el('h2', { class: 'chr-handover__name' }, actor.name || t('playerLabel', 'Player')));
      if (isTeam(spec)) {
        var tm = FF.ui.span('chr-handover__team', team.name);
        if (team.color) tm.style.setProperty('--team', team.color);
        box.appendChild(tm);
      }
      box.appendChild(FF.ui.el('p', { class: 'chr-handover__only' }, t('chrOnlyLooks', 'Only {name} looks at the screen.', { name: actor.name || t('playerLabel', 'Player') })));
      if (spec.again) box.appendChild(FF.ui.el('p', { class: 'chr-note chr-note--gold' }, t('chrActsAgain', '{name} acts again: {team} has fewer players.', { name: actor.name, team: team ? team.name : '' })));
      var rules = FF.ui.el('ul', { class: 'chr-rules' });
      [t('chrRule1', 'No talking or mouthing words'), t('chrRule2', 'No spelling letters in the air'), t('chrRule3', 'No pointing at things in the room')].forEach(function (x) {
        rules.appendChild(FF.ui.el('li', {}, x));
      });
      box.appendChild(rules);
      var ready = button(t('chrReady', 'I’m ready'), 'chr-btn--go chr-btn--big', 'check', function () { api.audio.play('select'); countdown(spec); });
      box.appendChild(ready);
      f.stage.appendChild(box);
      f.side.appendChild(scoreboard(spec.scorerId));
      if (FF.Nav && FF.Nav.focus) FF.Nav.focus(ready);
    }

    /* ---------- 2. three, two, one ---------- */
    function countdown(spec) {
      FF.ui.clear(f.stage);
      var big = FF.ui.div('chr-count');
      big.setAttribute('aria-live', 'assertive');
      f.stage.appendChild(big);
      var n = 3;
      function step() {
        if (!big.isConnected) return;
        if (n === 0) { acting(spec); return; }
        big.textContent = String(n);
        big.classList.remove('is-pop');
        void big.offsetWidth;
        big.classList.add('is-pop');
        api.audio.play('countdown');
        n--;
        later(step, 750);
      }
      step();
    }

    /* ---------- 3. act! ---------- */
    function acting(spec) {
      var turn = R.Turn(dealer, { twists: cfg.twists, rand: rand0 });
      var team = teamOf(spec);
      f = frame(api, 'chr--act', openSignals);
      f.chips.appendChild(turnChip());
      var gotChip = chip(t('chrGotN', '{n} got', { n: 0 }), 'chr-chip--got', 'check');
      f.chips.appendChild(gotChip);

      var ring = timerRing();
      f.stage.appendChild(ring.el);
      var cardHost = FF.ui.div('chr-cardhost');
      f.stage.appendChild(cardHost);
      var stamp = FF.ui.div('chr-stamp');
      stamp.setAttribute('aria-live', 'assertive');
      f.stage.appendChild(stamp);

      var actions = FF.ui.div('chr-actions');
      var passBtn = button(t('chrPass', 'Pass'), 'chr-btn--pass', 'skip', function () { answer(false); });
      var gotBtn = button(t('chrGotIt', 'Got it'), 'chr-btn--go', 'check', function () { answer(true); });
      actions.appendChild(passBtn);
      actions.appendChild(gotBtn);
      f.stage.appendChild(actions);
      f.stage.appendChild(FF.ui.el('p', { class: 'chr-swipe' }, t('chrSwipeHint', 'Swipe up for Got it, down to pass')));
      f.side.appendChild(scoreboard(spec.scorerId));

      var cardEl = null;
      var busy = false;
      var over = false;

      function drawCard() {
        var c = turn.card();
        FF.ui.clear(cardHost);
        if (!c) return;
        cardEl = FF.ui.div('chr-cardface' + (c.twist ? ' has-twist' : ''));
        cardEl.appendChild(chip(deckName(c.deck), 'chr-chip--deck', (deckById(c.deck) || {}).glyph));
        cardEl.appendChild(FF.ui.div('chr-cardface__text' + (c.t.length > 22 ? ' is-long' : ''), c.t));
        if (c.kind === 'title') {
          var sig = FF.ui.div('chr-cardface__sig');
          sig.appendChild(glyph(c.signal === 'song' ? 'music' : c.signal === 'tv' ? 'tv' : c.signal === 'film' ? 'film' : 'book'));
          sig.appendChild(FF.ui.span('', signalLine(c.signal) + ' · ' + t('chrNWords', '{n} words', { n: R.wordCount(c.t) })));
          cardEl.appendChild(sig);
        }
        if (c.twist) {
          var rib = FF.ui.div('chr-twist');
          rib.appendChild(FF.ui.span('chr-twist__label', t('chrTwist', 'Twist')));
          rib.appendChild(FF.ui.span('', t('chrTw_' + c.twist.id, c.twist.text) + ' (+1)'));
          cardEl.appendChild(rib);
        }
        cardHost.appendChild(cardEl);
        swipeOn(cardEl);
      }

      function answer(got) {
        if (busy || over || !turn.card()) return;
        busy = true;
        api.audio.play(got ? 'correct' : 'whoosh');
        if (got) turn.got(); else turn.pass();
        var n = turn.entries().filter(function (e) { return e.got; }).length;
        gotChip.lastChild.textContent = t('chrGotN', '{n} got', { n: n });
        if (cardEl) cardEl.classList.add(got ? 'is-got' : 'is-passed');
        later(function () { busy = false; if (!over) drawCard(); }, 220);
      }

      function swipeOn(el) {
        var y0 = null;
        el.addEventListener('pointerdown', function (e) { y0 = e.clientY; });
        el.addEventListener('pointerup', function (e) {
          if (y0 == null) return;
          var dy = e.clientY - y0;
          y0 = null;
          if (dy < -SWIPE_PX) answer(true);
          else if (dy > SWIPE_PX) answer(false);
        });
        el.addEventListener('pointercancel', function () { y0 = null; });
      }

      function onKey(e) {
        if (!f.root.isConnected) { document.removeEventListener('keydown', onKey); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); answer(true); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); answer(false); }
      }
      document.addEventListener('keydown', onKey);

      // The shell's timer keeps time, so the pause menu pauses the turn too.
      var total = cfg.seconds;
      var lastWhole = total;
      ring.set(total, total);
      api.shell.setTimer(total, timeUp);
      if (api.shell.timerEl) api.shell.timerEl.classList.add('hidden');
      var watch = setInterval(function () {
        if (!f.root.isConnected) { clearInterval(watch); document.removeEventListener('keydown', onKey); return; }
        var tm = api.shell.timer;
        var rem = tm && typeof tm.remaining === 'number' ? tm.remaining : 0;
        ring.set(rem, total);
        var whole = Math.ceil(rem);
        if (whole < lastWhole && whole <= 5 && whole > 0) api.audio.play('warning');
        lastWhole = whole;
      }, 200);

      function timeUp() {
        if (over) return;
        over = true;
        clearInterval(watch);
        document.removeEventListener('keydown', onKey);
        if (!f.root.isConnected) return;
        turn.timeUp();
        ring.set(0, total);
        passBtn.disabled = true;
        gotBtn.disabled = true;
        stamp.textContent = t('timeUpShort', 'Time!');
        stamp.classList.add('is-on');
        later(function () { if (f.root.isConnected) recap(spec, turn); }, 1300);
      }

      drawCard();
      if (team && team.color) f.root.style.setProperty('--team', team.color);
    }

    /* ---------- 4. how did it go? ---------- */
    function recap(spec, turn) {
      api.shell.hideTimer();
      var actor = actorOf(spec);
      f = frame(api, 'chr--recap', null);
      f.chips.appendChild(turnChip());
      var box = FF.ui.div('chr-card chr-recap');
      var entries = turn.entries();
      var head = FF.ui.div('chr-recap__head');
      var pts = FF.ui.span('chr-recap__pts', '0');
      head.appendChild(FF.ui.el('h2', { class: 'chr-h2' }, t('chrTurnOver', '{name}’s turn', { name: actor.name || t('playerLabel', 'Player') })));
      head.appendChild(pts);
      box.appendChild(head);
      box.appendChild(FF.ui.el('p', { class: 'chr-note' }, entries.length ? t('chrFixHint', 'Tap a card to fix a mis-tap.') : t('chrNoCards', 'No cards this time. Act faster next turn!')));
      var list = FF.ui.el('ul', { class: 'chr-recap__list' });
      entries.forEach(function (e, i) {
        var li = FF.ui.el('li', {});
        var b = FF.ui.el('button', { type: 'button', class: 'chr-recap__item' });
        var mark = FF.ui.span('chr-recap__mark');
        var text = FF.ui.span('chr-recap__text', e.card.t);
        b.appendChild(mark);
        b.appendChild(text);
        if (e.twist) b.appendChild(FF.ui.span('chr-recap__twist', t('chrTw_' + e.twist.id, e.twist.text)));
        function paint() {
          b.classList.toggle('is-got', e.got);
          b.setAttribute('aria-pressed', e.got ? 'true' : 'false');
          FF.ui.clear(mark);
          mark.appendChild(glyph(e.got ? 'check' : 'skip'));
          b.setAttribute('aria-label', e.card.t + ': ' + (e.got ? t('chrGotIt', 'Got it') : t('chrPassed', 'Passed')));
        }
        b.addEventListener('click', function () { turn.flip(i); api.audio.play('tap'); paint(); refresh(); });
        paint();
        li.appendChild(b);
        list.appendChild(li);
      });
      box.appendChild(list);
      var boardHost = FF.ui.div('chr-recap__board');
      var last = k + 1 >= order.length;
      var nextSpec = last ? null : order[k + 1];
      var nextLabel = last ? t('chrSeeWinners', 'See who won')
        : t('chrNextActor', 'Next: {name}', { name: actorOf(nextSpec).name || t('playerLabel', 'Player') }) + (isTeam(nextSpec) ? ' (' + teamOf(nextSpec).name + ')' : '');
      var go = button(nextLabel, 'chr-btn--go chr-btn--big', last ? 'trophy' : 'check', function () {
        var score = turn.score();
        if (score > 0) api.scoring.add(spec.scorerId, score, { correct: true });
        var guessed = turn.entries().filter(function (e) { return e.got; }).length;
        var st = stats[spec.actorId] || (stats[spec.actorId] = { guessed: 0, best: 0, name: actor.name });
        st.guessed += guessed;
        st.best = Math.max(st.best, guessed);
        api.shell.updateScores(spec.scorerId);
        k++;
        api.audio.play('select');
        next();
      });
      f.stage.appendChild(box);
      f.side.appendChild(boardHost);
      f.side.appendChild(go);
      var shown = 0;
      function refresh() {
        var s = turn.score();
        pts.textContent = t('chrPts', '{n} pts', { n: s });
        FF.ui.clear(boardHost);
        boardHost.appendChild(scoreboard(spec.scorerId, s));
        shown = s;
      }
      refresh();
      api.audio.play(shown > 0 ? 'roundEnd' : 'click');
      if (FF.Nav && FF.Nav.focus) FF.Nav.focus(go);
    }

    /* ---------- 5. the winners ---------- */
    function podium() {
      api.shell.hideTimer();
      f = frame(api, 'chr--podium', null);
      var ranked = scorers.slice().sort(function (a, b) { return scoreOf(b.id) - scoreOf(a.id); });
      var top = ranked.length ? scoreOf(ranked[0].id) : 0;
      var winners = ranked.filter(function (s) { return scoreOf(s.id) === top; });
      var box = FF.ui.div('chr-podium');
      box.appendChild(bulbs());
      box.appendChild(glyph('trophy', 'chr-podium__trophy'));
      var title = winners.length > 1 ? t('chrTie', 'It’s a tie!')
        : ranked.length > 1 ? t('chrWins', '{name} wins!', { name: winners[0].name || t('playerLabel', 'Player') })
        : t('chrGroupScore', '{n} cards guessed', { n: top });
      box.appendChild(FF.ui.el('h2', { class: 'chr-podium__title' }, title));
      var bestId = null;
      Object.keys(stats).forEach(function (id) { if (!bestId || stats[id].best > stats[bestId].best) bestId = id; });
      if (bestId && stats[bestId].best > 0) {
        box.appendChild(FF.ui.el('p', { class: 'chr-note chr-note--gold' },
          t('chrBestActor', 'Best actor: {name}, {n} cards in {s} seconds', { name: stats[bestId].name || t('playerLabel', 'Player'), n: stats[bestId].best, s: cfg.seconds })));
      }
      f.stage.appendChild(box);
      f.side.appendChild(scoreboard(winners.length === 1 ? winners[0].id : null));
      f.side.appendChild(button(t('seeResults', 'See results'), 'chr-btn--go chr-btn--big', 'trophy', end));
      api.audio.play('winner');
      if (FF.Confetti && FF.Confetti.burst && animationsOn()) { try { FF.Confetti.burst(120); } catch (e) { /* no canvas */ } }
    }

    function end() {
      if (ended) return;
      ended = true;
      var res = api.scoring.results ? api.scoring.results() : null;
      api.end({ results: (res && res.results) || [], winnerId: res ? res.winnerId : null });
    }

    next();
  }

  /* ================= TV display ================= */

  function displayStart(api) {
    var pool = R.pool(decks(), { decks: ['mix'], level: 'normal' });
    FF.Display.deck(api, {
      title: t('chrName', 'Charades'),
      tag: t('chrEveryoneActs', 'Everyone acts at once'),
      items: pool,
      interval: 30,
      render: function (item) { return FF.ui.div('dsp-word', item.t); },
      label: function (item) { return deckName(item.deck); }
    });
  }

  /* ================= registration ================= */

  FF.registerGame({
    id: 'charades',
    featured: true,
    name: 'Charades',
    description: 'Act it out in silence while your team shouts guesses. As many cards as you can before the timer runs out.',
    category: 'creative',
    icon: '🎭',
    players: [1, 8],
    difficulty: 'Easy',
    duration: 8,
    tags: ['party', 'acting', 'teams'],
    modes: ['solo', 'turn', 'team'],
    defaultMode: 'team',
    howToPlay: [
      'Split into teams. Teams take turns, and the actor changes every turn.',
      'Pass the phone to the actor. Only they look at the screen.',
      'Act the card in silence: no talking, no spelling, no pointing at things.',
      'Your team shouts guesses. Tap Got it (or swipe up) when they say it, Pass (or swipe down) to skip.',
      'Act as many cards as you can before the timer runs out. Each card guessed is a point, twists are worth 2.',
      'After the turn, check the list together and fix any mis-taps. The team with the most points wins.'
    ],
    display: true,
    displayStart: function (api) { displayStart(api); },
    start: function (api) {
      if (!decks().length || !R) { api.fail ? api.fail('No charades cards') : null; return; }
      setupScreen(api, function (cfg) {
        if (!stillShown(api)) return;
        play(api, cfg);
      });
    }
  });

  FF.CharadesGame = FF.CharadesGame || {};
  FF.CharadesGame.glyph = glyph;
})();
