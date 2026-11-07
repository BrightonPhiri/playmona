/* ============================================================
   PLAYMONA — games/sequence.js
   Remember the Sequence: pads light up one after another, each with its
   own note. Watch, then tap them back in the same order.

   - Sets (what you remember): colours, pictures (the Memory Match card
     art), numbers, shapes, or sounds (the pads stay dark while they play).
   - Twists (how you recall): grow (the same sequence gets one longer each
     round), fresh (a new one each round), backwards, shuffle (the pads
     swap places before you tap), speed up.
   - Solo: an endless run until your lives run out. Pass and play: every
     player gets the same deal, in turn. "Add one": a party mode on one
     phone, where each player repeats the chain and adds a pad.
   - Online rooms: a parallel challenge (js/net/parallel.js), every phone
     builds the same rounds from the round seed.

   The pure rules are FF.Sequence (tested in tools/test/sequence.test.js).
   Looks: css/games.css (.sq-*). Notes: FF.Audio.note (js/audio.js).
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  function t(key, fallback, vars) { return FF.t ? FF.t(key, fallback, vars) : String(fallback); }

  /* ================= rules (pure, tested) ================= */

  var SETS = ['colours', 'pictures', 'numbers', 'shapes', 'sounds'];
  var TWISTS = ['grow', 'fresh', 'backwards', 'shuffle', 'speedup'];
  var PADS = [4, 6, 9];
  var LIVES = [1, 2, 3];
  var PLAYS = ['turns', 'addone'];
  var START_LEN = 3;        // a local run starts this long
  var ONLINE_START = 4;     // room round 1 is this long
  var RS_MAX_LEN = 12;      // room rounds stop growing here
  var SOLO_MAX_LEN = 30;    // a local run that gets this far is complete
  var ADDONE_MAX_LEN = 40;
  var SHOW_ON = 420;        // ms a pad stays lit during the show
  var SHOW_GAP = 180;       // ms between two pads

  function pickOf(list, v, fallback) { return list.indexOf(v) !== -1 ? v : fallback; }

  function defaults(difficulty) {
    return {
      set: 'colours',
      twist: 'grow',
      pads: difficulty === 'easy' ? 4 : difficulty === 'hard' ? 9 : 6,
      lives: 1,
      play: 'turns'
    };
  }

  function sanitize(s) {
    s = s || {};
    var d = defaults(s.difficulty);
    var out = {
      set: pickOf(SETS, s.set, d.set),
      twist: pickOf(TWISTS, s.twist, d.twist),
      pads: pickOf(PADS, Number(s.pads), d.pads),
      lives: pickOf(LIVES, Number(s.lives), d.lives),
      play: pickOf(PLAYS, s.play, d.play)
    };
    if (s.difficulty) out.difficulty = String(s.difficulty);
    return out;
  }

  var STANDARD = defaults('normal');
  var RULE_KEYS = ['set', 'twist', 'pads', 'lives', 'play'];
  function isStandard(s) {
    var c = sanitize(s);
    return RULE_KEYS.every(function (k) { return c[k] === STANDARD[k]; });
  }
  function key(s) { return [s.set, s.twist, s.pads, s.lives].join('|'); }

  function randInt(rand, n) { return Math.floor(rand() * n); }

  /* n pad indexes in [0, pads). Never the same pad three times running:
     a long run of one pad is dull and hard to count. */
  function deal(n, pads, rand) {
    var out = [];
    for (var i = 0; i < n; i++) {
      var k = randInt(rand, pads);
      if (i >= 2 && out[i - 1] === k && out[i - 2] === k) k = (k + 1 + randInt(rand, pads - 1)) % pads;
      out.push(k);
    }
    return out;
  }

  /* A new order for the pads that moves at least two of them. */
  function shuffleOrder(pads, rand) {
    var p;
    var guard = 0;
    do {
      p = [];
      for (var i = 0; i < pads; i++) p.push(i);
      for (var j = p.length - 1; j > 0; j--) {
        var k = randInt(rand, j + 1);
        var x = p[j]; p[j] = p[k]; p[k] = x;
      }
    } while (p.every(function (v, i) { return v === i; }) && guard++ < 20);
    return p;
  }

  /* Every round of a local run, dealt up front so each player in pass and
     play meets exactly the same rounds. Grow (and the twists built on it)
     keeps one sequence and shows one more of it each round; Fresh deals a
     new sequence every round. Returns [{ seq, perm }]. */
  function script(cfg, rand, startLen, maxLen) {
    startLen = startLen || START_LEN;
    maxLen = maxLen || SOLO_MAX_LEN;
    var master = deal(maxLen, cfg.pads, rand);
    var rounds = [];
    for (var len = startLen; len <= maxLen; len++) {
      var seq = cfg.twist === 'fresh' ? deal(len, cfg.pads, rand) : master.slice(0, len);
      rounds.push({ seq: seq, perm: cfg.twist === 'shuffle' ? shuffleOrder(cfg.pads, rand) : null });
    }
    return rounds;
  }

  /* What the player must tap: the sequence, or it reversed. */
  function expected(seq, twist) { return twist === 'backwards' ? seq.slice().reverse() : seq.slice(); }

  /* How fast the show runs in round r (0-based). Speed up shortens both
     the light and the gap every round, down to a floor. */
  function timing(twist, r) {
    if (twist !== 'speedup') return { on: SHOW_ON, gap: SHOW_GAP };
    return { on: Math.max(170, SHOW_ON - 22 * r), gap: Math.max(70, SHOW_GAP - 10 * r) };
  }

  function bonusFor(difficulty) {
    if (difficulty === 'easy') return 1;
    if (difficulty === 'hard') return 2;
    return 1.5;
  }

  function speedBonus(ms, limitMs, max) {
    if (FF.Parallel && FF.Parallel.speedBonus) return FF.Parallel.speedBonus(ms, limitMs, max);
    if (ms == null || !limitMs) return 0;
    return Math.round(max * Math.max(0, Math.min(1, 1 - ms / limitMs)));
  }

  /* Points for one sequence in a room challenge: the whole sequence scores
     by its length plus a bonus for a quick repeat; a slip keeps a little
     for every pad that was right. */
  function sequencePoints(len, got, inputMs, bonus) {
    if (got >= len) return Math.round((bonus || 1) * (len * 20 + speedBonus(inputMs, len * 1500, len * 10)));
    return Math.round((bonus || 1) * got * 5);
  }

  /* Points for a sequence repeated in a local run: longer is worth more. */
  function roundPoints(len, inputMs, bonus) {
    return Math.round((bonus || 1) * (len * 10 + speedBonus(inputMs, len * 1500, len * 5)));
  }

  /* Online, round n plays a sequence one longer than the last. */
  function rsLength(startLen, n) { return Math.min(RS_MAX_LEN, startLen + n); }
  // Watching takes about 0.6 s a pad; repeating gets 1.5 s a pad, plus slack
  // (and a moment for the pads to swap places).
  function rsSeconds(len) { return Math.ceil(8 + 2.1 * len); }

  /* ================= labels and settings ================= */

  function setLabel(s) {
    return {
      colours: t('rsSetColours', 'Colours'), pictures: t('rsSetPictures', 'Pictures'), numbers: t('rsSetNumbers', 'Numbers'),
      shapes: t('rsSetShapes', 'Shapes'), sounds: t('rsSetSounds', 'Sounds only')
    }[s];
  }
  function twistLabel(w) {
    return {
      grow: t('rsTwistGrow', 'Grow'), fresh: t('rsTwistFresh', 'Fresh each round'), backwards: t('rsTwistBackwards', 'Backwards'),
      shuffle: t('rsTwistShuffle', 'Shuffle'), speedup: t('rsTwistSpeedup', 'Speed up')
    }[w];
  }
  function twistNote(w) {
    return {
      grow: t('rsTwistGrowNote', 'The same sequence gets one longer every round.'),
      fresh: t('rsTwistFreshNote', 'A brand new sequence every round.'),
      backwards: t('rsTwistBackwardsNote', 'Watch it, then tap it back from last to first.'),
      shuffle: t('rsTwistShuffleNote', 'After the show the pads swap places. Remember what lit up, not where.'),
      speedup: t('rsTwistSpeedupNote', 'The show gets faster every round.')
    }[w];
  }
  function playLabel(p) { return p === 'addone' ? t('rsPlayAddOne', 'Add one') : t('rsPlayTurns', 'Take turns'); }
  function livesLabel(n) { return n === 1 ? t('rsOneLife', '1 life') : t('rsNLives', '{n} lives', { n: n }); }

  function summary(s) {
    s = sanitize(s);
    var bits = [setLabel(s.set)];
    if (s.play === 'addone') bits.push(playLabel(s.play));
    else bits.push(twistLabel(s.twist));
    bits.push(t('rsNPads', '{n} pads', { n: s.pads }));
    if (s.play !== 'addone') bits.push(livesLabel(s.lives));
    return bits.join(' · ');
  }

  /* Setting rows for the solo setup screen and the room lobby.
     opts: { room: lobby rows only, multi: more than one local player } */
  function fields(gs, opts) {
    opts = opts || {};
    gs = gs || {};
    function opt(label, value) { return { label: label, value: value }; }
    var out = [];
    if (opts.multi && !opts.room) {
      out.push({ key: 'play', label: t('rsPlay', 'How to play'), redraw: true, options: PLAYS.map(function (p) { return opt(playLabel(p), p); }) });
    }
    out.push({ key: 'set', label: t('rsSet', 'Remember'), options: SETS.map(function (s) { return opt(setLabel(s), s); }) });
    var addOne = !opts.room && gs.play === 'addone';
    if (!addOne) out.push({ key: 'twist', label: t('rsTwist', 'Twist'), redraw: true, options: TWISTS.map(function (w) { return opt(twistLabel(w), w); }) });
    out.push({ key: 'pads', label: t('rsPads', 'Pads'), options: PADS.map(function (n) { return opt(String(n), n); }) });
    if (!opts.room && !addOne) out.push({ key: 'lives', label: t('rsLives', 'Lives'), options: LIVES.map(function (n) { return opt(String(n), n); }) });
    if (addOne) out.push({ note: t('rsAddOneNote', 'Add one: repeat the whole chain from memory, then tap one more pad and pass the phone. Miss and you are out. Last one in wins.') });
    else out.push({ note: twistNote(sanitize(gs).twist) });
    return out;
  }

  /* ================= pad faces ================= */

  var SHAPES = {
    circle: '<circle cx="12" cy="12" r="9"/>',
    square: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/>',
    triangle: '<path d="M12 3 21.8 20.5H2.2z"/>',
    star: '<path d="M12 2.2l2.95 6.2 6.75.8-5 4.7 1.33 6.7L12 17.3l-6.03 3.3 1.33-6.7-5-4.7 6.75-.8z"/>',
    heart: '<path d="M12 21.2s-9-5.4-9-11.6A5 5 0 0 1 12 6.7a5 5 0 0 1 9 2.9c0 6.2-9 11.6-9 11.6z"/>',
    diamond: '<path d="M12 2 22 12 12 22 2 12z"/>',
    moon: '<path d="M20.5 14.6A9 9 0 1 1 9.4 3.5a7.1 7.1 0 0 0 11.1 11.1z"/>',
    drop: '<path d="M12 2.2s7.4 8 7.4 12.9a7.4 7.4 0 0 1-14.8 0C4.6 10.2 12 2.2 12 2.2z"/>',
    bolt: '<path d="M13.8 1.8 4.2 13.6h6.5L9.4 22.2l10.4-12.9h-6.7z"/>'
  };
  var SHAPE_ORDER = ['circle', 'square', 'triangle', 'star', 'heart', 'diamond', 'moon', 'drop', 'bolt'];

  /* Colour pads carry a shape too, so players who cannot tell two colours
     apart can still play. The first four are the classic four. */
  var COLOURS = [
    { id: 'red', name: 'Red', color: '#ef4444', mark: 'circle' },
    { id: 'blue', name: 'Blue', color: '#3b82f6', mark: 'square' },
    { id: 'green', name: 'Green', color: '#10b981', mark: 'triangle' },
    { id: 'yellow', name: 'Yellow', color: '#eab308', mark: 'star' },
    { id: 'purple', name: 'Purple', color: '#8b5cf6', mark: 'heart' },
    { id: 'orange', name: 'Orange', color: '#f97316', mark: 'diamond' },
    { id: 'pink', name: 'Pink', color: '#ec4899', mark: 'moon' },
    { id: 'cyan', name: 'Cyan', color: '#06b6d4', mark: 'drop' },
    { id: 'lime', name: 'Lime', color: '#65a30d', mark: 'bolt' }
  ];

  function shapeUri(id, fill) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="' + (fill || '#fff') + '">' + SHAPES[id] + '</svg>';
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }

  var MM_ART = 'games/memoryMatch';
  function hasPic(id) {
    var m = FF.AssetManifest && FF.AssetManifest[MM_ART];
    return !!(m && m[id]);
  }

  /* The pads for a game: [{ id, name, kind, color, mark, digit, pic, emoji }].
     Pictures draw one Memory Match deck (from rand, so a room agrees) and
     take its first cards after a shuffle; the deck tints the pads. */
  function faces(cfg, rand) {
    var n = cfg.pads;
    var out = [];
    var i;
    if (cfg.set === 'pictures' && FF.MemoryDecks && FF.MemoryDecks.length) {
      var deck = FF.MemoryDecks[randInt(rand, FF.MemoryDecks.length)];
      var cards = deck.cards.slice();
      for (var j = cards.length - 1; j > 0; j--) {
        var k = randInt(rand, j + 1);
        var x = cards[j]; cards[j] = cards[k]; cards[k] = x;
      }
      var seen = {};
      for (i = 0; i < cards.length && out.length < n; i++) {
        var row = cards[i];
        var pic = hasPic(row[0]);
        var face = pic ? row[0] : row[2];
        if (seen[face]) continue;   // two emoji stand-ins can look alike
        seen[face] = true;
        out.push({ id: row[0], kind: 'picture', name: t('mmCard_' + row[0].replace(/-/g, '_'), row[1]), pic: pic, emoji: row[2], tint: deck.colour });
      }
      out.deckName = t('mmDeck_' + deck.id, deck.name);
      return out;
    }
    for (i = 0; i < n; i++) {
      if (cfg.set === 'numbers') out.push({ id: 'n' + (i + 1), kind: 'number', name: String(i + 1), digit: String(i + 1) });
      else if (cfg.set === 'shapes') {
        var sid = SHAPE_ORDER[i];
        out.push({ id: sid, kind: 'shape', name: t('rsShape_' + sid, sid.charAt(0).toUpperCase() + sid.slice(1)), mark: sid });
      } else {
        var c = COLOURS[i];
        out.push({ id: c.id, kind: 'colour', name: t('rsColour_' + c.id, c.name), color: c.color, mark: c.mark });
      }
    }
    return out;
  }

  function columns(n) { return n === 4 ? 2 : 3; }

  /* ================= device helpers ================= */

  function reduceMotion() {
    var setting = FF.Settings && FF.Settings.get && FF.Settings.get('reduceMotion');
    var os = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return !!(setting || os);
  }

  function buzz(pattern) {
    if (FF.Audio && FF.Audio.effectsEnabled === false) return;
    var touched = !navigator.userActivation || navigator.userActivation.hasBeenActive;
    try { if (touched && navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* not supported */ }
  }

  function rand() { return FF._rand ? FF._rand() : Math.random(); }

  function note(api, i, dur) {
    if (api.audio && api.audio.note) api.audio.note(i, dur);
    else if (api.audio) api.audio.play('tap');
  }

  /* ================= the board =================
     One screen: a header (pills + stats), the state chip, the trail of
     what has been tapped, the pads and a line for messages.
     opts: { cfg, faces, turnEntity, roundText, live, onTap(i) } */
  function makeBoard(api, opts) {
    var cfg = opts.cfg;
    var list = opts.faces;
    var calm = reduceMotion();
    var root = api.shell.root;
    FF.ui.clear(root);
    api.shell.hideTimer();
    var stage = FF.GameUI.stage({ center: true, className: 'sq sq--' + cfg.set });
    if (opts.live) stage.appendChild(opts.live);
    stage.appendChild(FF.GameUI.turnBar(opts.turnEntity || null, opts.roundText || null));

    var head = FF.ui.div('sq-head');
    var stats = FF.ui.div('sq-stats');
    var livesEl = FF.ui.div('sq-lives');
    head.appendChild(stats);
    head.appendChild(livesEl);
    stage.appendChild(head);

    var chip = FF.ui.div('sq-state', '');
    chip.setAttribute('aria-live', 'polite');
    stage.appendChild(chip);
    var trail = FF.ui.div('sq-trail');
    trail.setAttribute('aria-hidden', 'true');
    stage.appendChild(trail);

    var pad = FF.ui.div('sq-pad sq-pad--' + cfg.pads);
    pad.style.setProperty('--sq-cols', String(columns(cfg.pads)));
    var tiles = list.map(function (f, i) {
      var b = FF.ui.el('button', {
        class: 'sq-tile sq-tile--' + f.kind,
        type: 'button',
        ariaLabel: f.name,
        dataset: { pad: String(i), place: String(i) }
      });
      if (f.color) b.style.setProperty('--c', f.color);
      if (f.tint) b.style.setProperty('--c', 'var(' + f.tint + ')');
      b.appendChild(faceEl(f, 'sq-face'));
      b.addEventListener('click', function () { if (opts.onTap) opts.onTap(i); });
      pad.appendChild(b);
      return b;
    });
    stage.appendChild(pad);
    var msg = FF.ui.div('sq-msg', '');
    stage.appendChild(msg);
    root.appendChild(stage);

    var timers = [];
    function later(fn, ms) {
      var id = setTimeout(function () {
        timers.splice(timers.indexOf(id), 1);
        if (alive()) fn();
      }, ms);
      timers.push(id);
      return id;
    }
    function alive() { return !!stage.isConnected; }

    // Keys 1-9 tap the pad in that place on screen (after a shuffle too).
    function onKey(e) {
      if (!alive()) { document.removeEventListener('keydown', onKey); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var d = parseInt(e.key, 10);
      if (!(d >= 1 && d <= list.length)) return;
      var at = order[d - 1];
      if (at == null) return;
      e.preventDefault();
      tiles[at].classList.add('is-pressed');
      setTimeout(function () { tiles[at].classList.remove('is-pressed'); }, 140);
      if (opts.onTap) opts.onTap(at);
    }
    document.addEventListener('keydown', onKey);

    var order = list.map(function (f, i) { return i; });   // screen place -> pad

    var self = {
      stage: stage, tiles: tiles, calm: calm, alive: alive, later: later,

      state: function (kind, text) {
        chip.className = 'sq-state sq-state--' + kind;
        FF.ui.clear(chip);
        var iconKey = { watch: 'eye', turn: 'hand-tap', good: 'check', bad: 'x', ready: 'clock', out: 'x', best: 'trophy' }[kind];
        if (iconKey && FF.Icons && FF.Icons.icon) chip.appendChild(FF.Icons.icon(iconKey));
        chip.appendChild(FF.ui.span('sq-state__text', text));
      },

      stats: function (bits) {
        FF.ui.clear(stats);
        bits.forEach(function (b) {
          var s = FF.ui.span('sq-stat');
          s.appendChild(FF.ui.span('sq-stat__label', b[0]));
          s.appendChild(FF.ui.span('sq-stat__value', String(b[1])));
          stats.appendChild(s);
        });
      },

      lives: function (left, max) {
        FF.ui.clear(livesEl);
        if (!max || max < 2) return;
        livesEl.setAttribute('aria-label', t('rsLivesLeft', '{n} lives left', { n: left }));
        for (var i = 0; i < max; i++) livesEl.appendChild(FF.ui.span('sq-heart' + (i < left ? ' is-on' : ''), i < left ? '♥' : '♡'));
      },

      /* len empty slots, the first filled with what was tapped. */
      trail: function (len, filled) {
        FF.ui.clear(trail);
        trail.classList.toggle('is-long', len > 12);
        for (var i = 0; i < len; i++) {
          var slot = FF.ui.span('sq-slot' + (i < filled.length ? ' is-filled' : ''));
          if (i < filled.length) {
            var f = list[filled[i]];
            if (f.color) slot.style.setProperty('--c', f.color);
            if (f.tint) slot.style.setProperty('--c', 'var(' + f.tint + ')');
            slot.appendChild(faceEl(f, 'sq-mini'));
          }
          trail.appendChild(slot);
        }
      },

      msg: function (text) { msg.textContent = text || ''; },

      lock: function (on) {
        pad.classList.toggle('is-locked', !!on);
        tiles.forEach(function (b) { b.setAttribute('aria-disabled', on ? 'true' : 'false'); });
      },

      light: function (i, ms, kind) {
        var b = tiles[i];
        b.classList.remove('lit', 'good', 'bad');
        void b.offsetWidth;
        b.classList.add(kind || 'lit');
        later(function () { b.classList.remove(kind || 'lit'); }, ms || 220);
      },

      /* Play seq on the pads (lit, or only heard when dark), then onDone. */
      show: function (seq, tm, dark, onDone) {
        var k = 0;
        pad.classList.toggle('is-dark', !!dark);
        function step() {
          if (k >= seq.length) { pad.classList.remove('is-dark'); later(onDone, 320); return; }
          var i = seq[k];
          if (dark) { chip.classList.remove('is-beat'); void chip.offsetWidth; chip.classList.add('is-beat'); }
          else self.light(i, tm.on);
          note(api, i, tm.on / 1000 + 0.08);
          k++;
          later(step, tm.on + tm.gap);
        }
        later(step, 450);
      },

      /* Move pads to the places in perm (perm[place] = pad), sliding them
         there unless motion is reduced. */
      arrange: function (perm, onDone) {
        var before = tiles.map(function (b) { return b.getBoundingClientRect ? b.getBoundingClientRect() : null; });
        order = perm ? perm.slice() : list.map(function (f, i) { return i; });
        order.forEach(function (padIdx, place) {
          tiles[padIdx].style.order = String(place);
          tiles[padIdx].setAttribute('data-place', String(place));
        });
        if (calm || !before[0]) { if (onDone) later(onDone, calm ? 200 : 0); return; }
        tiles.forEach(function (b, i) {
          var a = before[i];
          var now = b.getBoundingClientRect();
          var dx = a.left - now.left;
          var dy = a.top - now.top;
          if (!dx && !dy) return;
          b.style.transition = 'none';
          b.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        });
        void pad.offsetWidth;
        tiles.forEach(function (b) {
          b.style.transition = 'transform 520ms cubic-bezier(.5,1.4,.4,1)';
          b.style.transform = '';
        });
        later(function () { tiles.forEach(function (b) { b.style.transition = ''; }); if (onDone) onDone(); }, 560);
      },

      shake: function () {
        if (calm) return;
        pad.classList.remove('is-shake');
        void pad.offsetWidth;
        pad.classList.add('is-shake');
      },

      destroy: function () {
        timers.forEach(clearTimeout);
        timers = [];
        document.removeEventListener('keydown', onKey);
      }
    };
    return self;
  }

  function faceEl(f, cls) {
    var el = FF.ui.span(cls + ' ' + cls + '--' + f.kind);
    if (f.kind === 'picture') {
      if (f.pic && FF.Assets) el.appendChild(FF.ui.el('img', { src: FF.Assets.artPath(MM_ART, f.id), alt: '', draggable: 'false', decoding: 'async' }));
      else el.appendChild(FF.ui.span(cls + '__emoji', f.emoji));
    } else if (f.kind === 'number') {
      el.appendChild(FF.ui.span(cls + '__digit', f.digit));
    } else {
      el.appendChild(FF.ui.el('img', { src: shapeUri(f.mark), alt: '', draggable: 'false' }));
    }
    return el;
  }

  /* ================= one attempt =================
     Show the sequence, shuffle the pads if the twist says so, then take
     taps until the whole sequence is in or one is wrong.
     o: { board, cfg, seq, perm, tm, timer (s, 0 = none), onResult({ ok, got, wrong, inputMs }) } */
  function attempt(api, o) {
    var b = o.board;
    var want = expected(o.seq, o.cfg.twist);
    var got = [];
    var open = false;
    var from = 0;
    var finished = false;

    b.lock(true);
    b.arrange(null);
    b.trail(want.length, []);
    b.state('watch', o.cfg.set === 'sounds' ? t('rsListen', 'Listen…') : t('rsWatch', 'Watch the sequence!'));
    b.msg(o.intro || '');
    b.show(o.seq, o.tm, o.cfg.set === 'sounds', function () {
      if (o.perm) {
        b.state('watch', t('rsShuffling', 'Shuffling…'));
        b.arrange(o.perm, go);
      } else go();
    });

    function go() {
      if (finished) return;
      open = true;
      from = Date.now();
      b.lock(false);
      b.state('turn', o.cfg.twist === 'backwards' ? t('rsYourTurnBack', 'Your turn: tap it backwards!') : t('rsYourTurn', 'Your turn: repeat the sequence!'));
      if (o.timer > 0) api.shell.setTimer(o.timer, function () { if (open) fail(null, true); });
    }

    function fail(i, timedOut) {
      open = false;
      finished = true;
      b.lock(true);
      api.shell.hideTimer();
      if (i != null) b.light(i, 600, 'bad');
      b.shake();
      buzz([60, 40, 60]);
      api.audio.play('wrong');
      b.state('bad', timedOut ? t('timesUp', 'Time’s up!') : t('rsOops', 'Oops!'));
      o.onResult({ ok: false, got: got.length, wrong: i, timedOut: !!timedOut, want: want });
    }

    return {
      tap: function (i) {
        if (!open) return;
        var right = i === want[got.length];
        if (!right) { fail(i, false); return; }
        b.light(i, 220);
        note(api, i, 0.26);
        buzz(12);
        got.push(i);
        b.trail(want.length, got);
        if (got.length >= want.length) {
          open = false;
          finished = true;
          b.lock(true);
          api.shell.hideTimer();
          var ms = Date.now() - from;
          o.onResult({ ok: true, got: got.length, inputMs: ms, want: want });
        }
      },
      stop: function () { open = false; finished = true; api.shell.hideTimer(); return got.length; }
    };
  }

  /* After a miss: play the right answer on the pads (where they sit now),
     filling the trail as it goes, then onDone. */
  function replay(api, b, want, tm, onDone) {
    b.msg(t('rsItWas', 'It was this:'));
    var k = 0;
    var shown = [];
    function step() {
      if (k >= want.length) { b.later(onDone, 700); return; }
      var i = want[k];
      b.light(i, 300, 'good');
      note(api, i, 0.3);
      shown.push(i);
      b.trail(want.length, shown);
      k++;
      b.later(step, 300 + Math.min(140, tm.gap));
    }
    b.later(step, 700);
  }

  /* ================= a local run (one player) =================
     Rounds from the shared script until the lives run out or the run is
     complete. o: { cfg, faces, rounds, who, multi, roundText, onDone(stats) } */
  function run(api, o) {
    var cfg = o.cfg;
    var bonus = bonusFor(api.config.difficulty);
    var r = 0;
    var lives = cfg.lives;
    var points = 0;
    var longest = 0;
    var current = null;
    var best = bestFor(o.who.id, cfg);
    var cheered = false;
    var b = makeBoard(api, {
      cfg: cfg, faces: o.faces,
      turnEntity: o.multi ? o.who : null,
      roundText: o.roundText,
      onTap: function (i) { if (current) current.tap(i); }
    });
    if (o.faces.deckName) b.msg(o.faces.deckName);
    paint();
    countIn(b, function () { play(null); });

    function paint() {
      var bits = [[t('rsLength', 'Length'), o.rounds[r] ? o.rounds[r].seq.length : longest]];
      bits.push([t('rsScore', 'Score'), FF.util && FF.util.formatNumber ? FF.util.formatNumber(points) : points]);
      bits.push([t('rsBest', 'Best'), Math.max(best ? best.longest : 0, longest) || '–']);
      b.stats(bits);
      b.lives(lives, cfg.lives);
    }

    function play(intro) {
      var round = o.rounds[r];
      if (!round) { finish(true); return; }
      paint();
      current = attempt(api, {
        board: b, cfg: cfg, seq: round.seq, perm: round.perm, tm: timing(cfg.twist, r),
        timer: api.config.timer || 0, intro: intro || o.faces.deckName,
        onResult: function (res) {
          current = null;
          if (res.ok) {
            var len = round.seq.length;
            var pts = roundPoints(len, res.inputMs, bonus);
            points += pts;
            longest = Math.max(longest, len);
            api.scoring.add(o.who.id, pts, { correct: true });
            api.shell.updateScores(o.who.id);
            api.audio.play('correct');
            var beat = best && longest > best.longest && !cheered;
            if (beat) {
              cheered = true;
              b.state('best', t('rsNewBestLen', 'New best: {n}!', { n: longest }));
              api.audio.play('streak');
            } else {
              b.state('good', t('rsCorrectPts', 'Correct! +{n}', { n: pts }));
            }
            b.msg(r + 1 < o.rounds.length && cfg.twist !== 'fresh' ? t('rsOneMore', 'One more each round…') : '');
            r++;
            paint();
            b.later(function () { play(null); }, 1100);
            return;
          }
          api.scoring.markAnswer(o.who.id, false);
          lives--;
          paint();
          b.later(function () {
            replay(api, b, res.want, timing(cfg.twist, r), function () {
              if (lives > 0) {
                b.state('ready', lives === 1 ? t('rsLastLife', 'Last life! Try again') : t('rsTryAgain', 'Try again'));
                b.later(function () { play(t('rsSameAgain', 'Same sequence again')); }, 1100);
              } else finish(false);
            });
          }, 500);
        }
      });
    }

    function finish(complete) {
      b.destroy();
      o.onDone({ longest: longest, points: points, rounds: r, complete: !!complete });
    }
  }

  function countIn(b, onGo) {
    var n = 3;
    b.lock(true);
    b.trail(0, []);
    function tick() {
      if (n === 0) { onGo(); return; }
      b.state('ready', t('rsGetReadyN', 'Get ready… {n}', { n: n }));
      n--;
      b.later(tick, 650);
    }
    tick();
  }

  /* ================= personal bests ================= */

  var BEST_KEY = 'rememberSequence:best';
  function bests() { return (FF.Storage && FF.Storage.get(BEST_KEY, {})) || {}; }
  function bestFor(id, cfg) { return bests()[id + '|' + key(cfg)] || null; }
  function saveBest(id, cfg, st) {
    var all = bests();
    var k = id + '|' + key(cfg);
    var old = all[k];
    if (old && old.longest >= st.longest && old.points >= st.points) return;
    all[k] = { longest: Math.max(st.longest, old ? old.longest : 0), points: Math.max(st.points, old ? old.points : 0) };
    try { FF.Storage.set(BEST_KEY, all); } catch (e) { /* storage full */ }
  }

  /* ================= setup, pass and results screens ================= */

  function setupScreen(api, multi, onGo) {
    var root = api.shell.root;
    api.shell.hideTimer();
    FF.ui.clear(root);
    var saved = (FF.Storage && FF.Storage.get('rememberSequence:setup', null)) || null;
    var gs = sanitize(Object.assign({}, defaults(api.config.difficulty), saved || {}));
    if (!multi) gs.play = 'turns';
    var stage = FF.GameUI.stage({ center: true, className: 'sq sq-setup' });
    stage.appendChild(FF.GameUI.kicker(t('rsSetupKicker', 'Remember the Sequence')));
    stage.appendChild(FF.GameUI.prompt(t('rsSetupTitle', 'Choose your challenge'), 'md'));
    var box = FF.ui.el('section', { class: 'settings-section nr-setup__rows' });
    var note = FF.ui.el('p', { class: 'gm-note nr-setup__note', 'aria-live': 'polite' });

    function render() {
      FF.ui.clear(box);
      fields(gs, { multi: multi }).forEach(function (f) {
        if (f.note) { box.appendChild(FF.ui.el('p', { class: 'gm-note sq-setup__hint' }, f.note)); return; }
        box.appendChild(FF.UI.settingRow(f.label, FF.UI.segmented({
          label: f.label, value: gs[f.key], options: f.options,
          onChange: function (v) { gs[f.key] = v; if (f.redraw) render(); else renote(); }
        })));
      });
      renote();
    }
    function renote() {
      var ranked = FF.Leaderboards && FF.Leaderboards.active && FF.Leaderboards.active(api.def);
      var b = !multi && bestFor(((api.config.scorers || [])[0] || { id: 'me' }).id, sanitize(gs));
      note.textContent = summary(gs) +
        (b ? ' · ' + t('rsYourBestShort', 'your best {n}', { n: b.longest }) : '') +
        (ranked && !isStandard(gs) ? ' · ' + t('nrUnranked', 'Leaderboards use the standard settings') : '');
    }
    render();
    stage.appendChild(box);
    stage.appendChild(note);
    var row = FF.ui.div('nr-setup__actions');
    row.appendChild(FF.UI.button(t('nrStandard', 'Standard settings'), {
      class: 'btn-lg btn-ghost', icon: 'restart',
      onClick: function () { api.audio.play('click'); var p = gs.play; gs = sanitize(STANDARD); if (multi) gs.play = p; render(); }
    }));
    row.appendChild(FF.GameUI.action(t('rsStart', 'Start'), function () {
      api.audio.play('select');
      var cfg = sanitize(gs);
      try { if (FF.Storage) FF.Storage.set('rememberSequence:setup', cfg); } catch (e) { /* storage full */ }
      onGo(cfg);
    }, { icon: 'play' }));
    stage.appendChild(row);
    root.appendChild(stage);
    if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(stage);
  }

  function passScreen(api, who, roundText, sub, onReady) {
    var root = api.shell.root;
    api.shell.hideTimer();
    FF.ui.clear(root);
    var stage = FF.GameUI.stage({ center: true, className: 'sq nr-pass' });
    stage.appendChild(FF.GameUI.turnBar(who, roundText));
    var ava = FF.ui.div('nr-pass__ava');
    ava.appendChild(FF.Players.avatarEl(who, 'nr-pass__img'));
    stage.appendChild(ava);
    stage.appendChild(FF.GameUI.prompt(t('nrPassTo', 'Pass to {name}', { name: who.name }), 'md'));
    if (sub) stage.appendChild(FF.GameUI.sub(sub));
    stage.appendChild(FF.GameUI.action(t('nrReady', 'I’m ready'), function () { api.audio.play('select'); onReady(); }, { icon: 'play' }));
    root.appendChild(stage);
    if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(stage);
  }

  function stillShown(api) { return !!(api.shell.root && (!document.body || !document.body.contains || document.body.contains(api.shell.root))); }

  /* Take turns: every player plays the same rounds; most points wins. */
  function playTurns(api, cfg) {
    var list = (api.config.scorers || []).slice();
    if (!list.length) list = [{ id: 'me', name: t('you', 'You') }];
    var multi = list.length > 1;
    var face = faces(cfg, rand);
    var rounds = script(cfg, rand);
    var runs = [];
    var i = 0;

    function next() {
      if (!stillShown(api)) return;
      if (i >= list.length) { results(api, cfg, runs); return; }
      var who = list[i];
      var rt = multi ? t('nrPlayerOf', 'Player {n} of {total}', { n: i + 1, total: list.length }) : null;
      if (multi) passScreen(api, who, rt, t('rsPassSub', 'Same sequence for everyone. Go further than the others!'), function () { go(who, rt); });
      else go(who, rt);
    }
    function go(who, rt) {
      api.shell.updateScores(who.id);
      run(api, {
        cfg: cfg, faces: face, rounds: rounds, who: who, multi: multi, roundText: rt,
        onDone: function (st) {
          runs.push({ who: who, st: st });
          api.scoring.set(who.id, st.points);
          api.shell.updateScores(who.id);
          i++;
          setTimeout(next, 200);
        }
      });
    }
    next();
  }

  function rankRuns(runs) {
    var sorted = runs.slice().sort(function (a, b) { return b.st.points - a.st.points || b.st.longest - a.st.longest; });
    var place = 0, prev = null;
    sorted.forEach(function (r, i) {
      if (!prev || prev.st.points !== r.st.points || prev.st.longest !== r.st.longest) place = i + 1;
      r.place = place;
      prev = r;
    });
    return sorted;
  }

  function results(api, cfg, runs, opts) {
    opts = opts || {};
    var root = api.shell.root;
    api.shell.hideTimer();
    FF.ui.clear(root);
    var ranked = opts.ranked || rankRuns(runs);
    var top = ranked[0];
    var tie = ranked.length > 1 && ranked[1].place === 1;
    var solo = ranked.length === 1;
    var newBest = {};
    if (!opts.noBests) {
      ranked.forEach(function (r) {
        var had = bestFor(r.who.id, cfg);
        if (!had || r.st.longest > had.longest || r.st.points > had.points) {
          newBest[r.who.id] = !!had && r.st.longest > had.longest;
          saveBest(r.who.id, cfg, r.st);
        }
      });
    }

    var stage = FF.GameUI.stage({ center: true, className: 'sq nr-results' });
    var title;
    if (solo) title = top.st.complete ? t('rsSoloComplete', 'Perfect memory!') : t('rsSoloLongest', 'You remembered {n}!', { n: top.st.longest });
    else if (tie) title = t('nrTie', 'It’s a tie!');
    else title = t('nrWins', '{name} wins!', { name: top.who.name });
    stage.appendChild(FF.GameUI.kicker(summary(cfg)));
    stage.appendChild(FF.GameUI.prompt(title, 'xl'));
    if (solo) {
      stage.appendChild(FF.ui.div('nr-results__score', FF.util.formatNumber(top.st.points)));
      if (newBest[top.who.id] === true) stage.appendChild(FF.GameUI.feedback('good', t('nrNewBest', 'New personal best!')));
      else {
        var bb = bestFor(top.who.id, cfg);
        if (bb && bb.longest > top.st.longest) stage.appendChild(FF.GameUI.note(t('rsYourBest', 'Your best on these settings: {n} long', { n: bb.longest })));
      }
    }
    var table = FF.ui.el('ol', { class: 'nr-table' });
    ranked.forEach(function (r) {
      var st = r.st;
      var li = FF.ui.el('li', { class: 'nr-row' + (r.place === 1 ? ' is-winner' : '') + (st.out ? ' is-out' : '') });
      if (!solo) li.appendChild(FF.ui.span('nr-row__rank', String(r.place)));
      li.appendChild(FF.Players.avatarEl(r.who, 'nr-row__ava'));
      var who = FF.ui.span('nr-row__who');
      who.appendChild(FF.ui.span('nr-row__name', r.who.name));
      var status = st.status || (st.complete ? t('rsStatusComplete', 'Went all the way') : t('rsStatusNoLives', 'Out of lives'));
      who.appendChild(FF.ui.span('nr-row__status', status + (newBest[r.who.id] === true && !solo ? ' · ' + t('nrBestShort', 'personal best') : '')));
      li.appendChild(who);
      var nums = FF.ui.span('nr-row__nums');
      nums.appendChild(cell(t('rsLongest', 'Longest'), String(st.longest)));
      if (st.rounds != null) nums.appendChild(cell(t('rsRounds', 'Rounds'), String(st.rounds)));
      li.appendChild(nums);
      li.appendChild(FF.ui.span('nr-row__pts', FF.util.formatNumber(st.points)));
      table.appendChild(li);
    });
    stage.appendChild(table);
    stage.appendChild(FF.GameUI.action(t('seeResults', 'See results'), function () {
      api.audio.play('select');
      api.end({
        results: ranked.map(function (r) {
          return { id: r.who.id, name: r.who.name, avatar: r.who.avatar, color: r.who.color, photo: r.who.photo, points: r.st.points, correct: r.st.rounds || 0 };
        }),
        winnerId: tie ? null : top.who.id
      });
    }, { icon: 'trophy' }));
    root.appendChild(stage);
    var cheer = solo ? newBest[top.who.id] === true || top.st.complete : true;
    if (!reduceMotion() && FF.Confetti && cheer && (!FF.Settings || FF.Settings.get('animations') !== false)) {
      setTimeout(function () { if (stage.isConnected) FF.Confetti.rain(100); }, 300);
    }
    api.audio.play(cheer ? 'winner' : 'roundEnd');
    if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(stage);

    function cell(label, value) {
      var c = FF.ui.span('nr-cell');
      c.appendChild(FF.ui.span('nr-cell__label', label));
      c.appendChild(FF.ui.span('nr-cell__value', value));
      return c;
    }
  }

  /* ================= Add one (party, one phone) =================
     The chain starts empty. On your go, repeat the whole chain from memory
     (it is not shown), then tap one more pad and pass the phone. A miss
     knocks you out; the last player in wins. */
  function playAddOne(api, cfg) {
    var list = (api.config.scorers || []).slice();
    var face = faces(cfg, rand);
    var chain = [];
    var inPlay = list.map(function (p) { return { who: p, out: false, points: 0, longest: 0, outAt: null }; });
    var turn = 0;
    var outOrder = 0;

    function alivePlayers() { return inPlay.filter(function (p) { return !p.out; }); }

    function nextTurn() {
      if (!stillShown(api)) return;
      var left = alivePlayers();
      if (left.length <= 1 || chain.length >= ADDONE_MAX_LEN) { finish(); return; }
      while (inPlay[turn % inPlay.length].out) turn++;
      var p = inPlay[turn % inPlay.length];
      var sub = chain.length
        ? t('rsAddOnePassSub', 'Repeat all {n}, then add one more.', { n: chain.length })
        : t('rsAddOneFirst', 'Start the chain: tap any pad.');
      passScreen(api, p.who, t('rsInPlay', '{n} still in', { n: left.length }), sub, function () { go(p); });
    }

    function go(p) {
      api.shell.updateScores(p.who.id);
      var got = 0;
      var phase = chain.length ? 'repeat' : 'add';
      var b = makeBoard(api, {
        cfg: cfg, faces: face, turnEntity: p.who,
        roundText: t('rsChainN', 'Chain: {n}', { n: chain.length }),
        onTap: tap
      });
      b.stats([[t('rsChain', 'Chain'), chain.length], [t('rsInPlayShort', 'Still in'), alivePlayers().length]]);
      b.trail(chain.length + 1, []);
      b.lock(false);
      if (phase === 'add') b.state('turn', t('rsAddFirst', 'Tap a pad to start the chain'));
      else b.state('turn', t('rsRepeatChain', 'Repeat the chain from memory'));
      if (api.config.timer > 0) api.shell.setTimer(api.config.timer + chain.length, function () { miss(null, true); });

      function tap(i) {
        if (phase === 'done') return;
        b.light(i, 220);
        note(api, i, 0.26);
        buzz(12);
        if (phase === 'repeat') {
          if (i !== chain[got]) { miss(i, false); return; }
          got++;
          b.trail(chain.length + 1, chain.slice(0, got));
          if (got >= chain.length) {
            phase = 'add';
            api.audio.play('correct');
            b.state('good', t('rsNowAdd', 'Now add one more!'));
          }
          return;
        }
        // phase add
        phase = 'done';
        api.shell.hideTimer();
        chain.push(i);
        b.trail(chain.length, chain);
        var pts = chain.length * 10;
        p.points += pts;
        p.longest = Math.max(p.longest, chain.length - 1);
        api.scoring.add(p.who.id, pts, { correct: true });
        api.shell.updateScores(p.who.id);
        b.lock(true);
        b.state('good', t('rsAdded', 'Added! The chain is {n} long', { n: chain.length }));
        b.later(function () { b.destroy(); turn++; nextTurn(); }, 1100);
      }

      function miss(i, timedOut) {
        if (phase === 'done') return;
        phase = 'done';
        api.shell.hideTimer();
        b.lock(true);
        if (i != null) b.light(i, 600, 'bad');
        b.shake();
        buzz([60, 40, 60]);
        api.audio.play('wrong');
        api.scoring.markAnswer(p.who.id, false);
        p.out = true;
        p.outAt = ++outOrder;
        b.state('out', timedOut ? t('rsOutTime', 'Time’s up, {name} is out', { name: p.who.name }) : t('rsOut', '{name} is out!', { name: p.who.name }));
        replay(api, b, chain, timing('grow', 0), function () { b.destroy(); turn++; nextTurn(); });
      }
    }

    function finish() {
      // Still in beats out; then whoever went out later; then points.
      var rows = inPlay.map(function (p) {
        return {
          who: p.who,
          st: {
            points: p.points, longest: p.longest, rounds: null, out: p.out, outAt: p.outAt,
            status: p.out ? t('rsStatusOut', 'Out') : t('rsStatusIn', 'Still in')
          }
        };
      });
      rows.sort(function (a, b) {
        if (a.st.out !== b.st.out) return a.st.out ? 1 : -1;
        if (a.st.out && b.st.outAt !== b.st.outAt) return b.st.outAt - a.st.outAt;
        return b.st.points - a.st.points;
      });
      var place = 0, prev = null;
      rows.forEach(function (r, i) {
        var same = prev && prev.st.out === r.st.out && prev.st.outAt === r.st.outAt && prev.st.points === r.st.points;
        if (!same) place = i + 1;
        r.place = place;
        prev = r;
      });
      results(api, cfg, null, { ranked: rows, noBests: true });
    }

    nextTurn();
  }

  /* ================= online room ================= */

  function roomSettings() {
    var r = FF.Room && FF.Room.current();
    return (r && r.meta && r.meta.settings) || {};
  }

  function playOnline(api) {
    var cfg = sanitize(roomSettings());
    cfg.lives = 1;
    cfg.play = 'turns';
    var bonus = bonusFor(api.config.difficulty);
    FF.Parallel.run(api, {
      rounds: 6,
      seconds: function (n) { return rsSeconds(rsLength(ONLINE_START, n)) + (cfg.twist === 'shuffle' ? 2 : 0); },
      gate: '.sq-tile',
      play: function (n, ctx) {
        // Drawn from the round seed: every phone gets the same pads and sequence.
        var face = faces(cfg, rand);
        var len = rsLength(ONLINE_START, n);
        var seq = deal(len, cfg.pads, rand);
        var perm = cfg.twist === 'shuffle' ? shuffleOrder(cfg.pads, rand) : null;
        var tm = timing(cfg.twist, n);
        var got = 0;
        var inputMs = null;
        var current = null;
        var b = makeBoard(api, {
          cfg: cfg, faces: face, live: ctx.live, roundText: ctx.roundText,
          onTap: function (i) { if (current) current.tap(i); }
        });
        b.stats([[t('rsLength', 'Length'), len], [t('rsSet', 'Remember'), setLabel(cfg.set)]]);
        b.trail(len, []);
        b.lock(true);
        b.state('ready', t('rsGetReady', 'Get ready to watch'));
        if (face.deckName) b.msg(face.deckName);

        function result() { return { value: sequencePoints(len, got, inputMs, bonus), len: len, got: got }; }

        return {
          start: function () {
            current = attempt(api, {
              board: b, cfg: cfg, seq: seq, perm: perm, tm: tm, timer: 0, intro: face.deckName,
              onResult: function (res) {
                current = null;
                got = res.got;
                if (res.ok) {
                  inputMs = res.inputMs;
                  api.audio.play('correct');
                  b.state('good', t('correct', 'Correct!'));
                  b.later(function () { b.destroy(); ctx.done(result()); }, 900);
                } else {
                  replay(api, b, res.want, tm, function () { b.destroy(); ctx.done(result()); });
                }
              }
            });
          },
          stop: function () {
            if (current) got = current.stop();
            b.lock(true);
            b.destroy();
            return result();
          }
        };
      },
      describe: function (n) {
        return { kind: 'card', text: t('rsWatchRoomSet', 'Everyone repeats the same {n}: {s}', { n: rsLength(ONLINE_START, n), s: summary(cfg) }) };
      },
      detail: function (a) {
        return a.got >= a.len
          ? t('rsDetailAllPads', 'All {n} right', { n: a.len || 0 })
          : t('rsDetailSomePads', '{got} of {n} right', { got: a.got || 0, n: a.len || 0 });
      }
    });
  }

  /* ================= registration ================= */

  var ROOM = {
    defaults: STANDARD,
    fields: function (gs) { return fields(gs, { room: true }); },
    sanitize: function (s) { return sanitize(s); },
    summary: function (s) { var c = sanitize(s); c.lives = 1; c.play = 'turns'; return [setLabel(c.set), twistLabel(c.twist), t('rsNPads', '{n} pads', { n: c.pads })].join(' · '); }
  };

  FF.Sequence = {
    SETS: SETS, TWISTS: TWISTS, PADS: PADS, LIVES: LIVES, PLAYS: PLAYS, STANDARD: STANDARD, COLOURS: COLOURS,
    START_LEN: START_LEN, ONLINE_START: ONLINE_START, RS_MAX_LEN: RS_MAX_LEN, SOLO_MAX_LEN: SOLO_MAX_LEN,
    defaults: defaults, sanitize: sanitize, isStandard: isStandard, key: key,
    deal: deal, shuffleOrder: shuffleOrder, script: script, expected: expected, timing: timing,
    faces: faces, fields: fields, summary: summary,
    sequencePoints: sequencePoints, roundPoints: roundPoints, rsLength: rsLength, rsSeconds: rsSeconds,
    ROOM: ROOM
  };

  FF.registerGame({
    id: 'rememberSequence',
    name: 'Remember the Sequence',
    description: 'Pads light up and sing. Repeat them in order: colours, pictures, numbers or shapes, with twists like backwards and shuffle.',
    category: 'memory',
    icon: '🔢',
    players: [1, 8],
    difficulty: 'Normal',
    duration: 4,
    tags: ['colours', 'sequence', 'music'],
    modes: ['solo', 'turn'],
    defaultMode: 'solo',
    howToPlay: [
      'Watch (and listen to) the pads light up one after another.',
      'Tap them back in the same order. Every round the sequence gets one longer.',
      'Pick what to remember: colours, pictures, numbers, shapes, or sounds only.',
      'Try a twist: tap it backwards, or remember it while the pads shuffle.',
      'With friends on one phone, play Add one: repeat the chain, add a pad, pass it on.'
    ],
    room: ROOM,
    start: function (api) {
      if (FF.Parallel && FF.Parallel.active()) { playOnline(api); return; }
      // The daily challenge and a friend's challenge play the standard rules on the shared deal.
      if (api.config.daily || api.config.challenge) { playTurns(api, sanitize(STANDARD)); return; }
      var multi = (api.config.scorers || []).length > 1;
      setupScreen(api, multi, function (cfg) {
        // Rules that differ from the standard ones keep the run off the leaderboards.
        if (!isStandard(cfg)) api.config.customRules = true;
        if (multi && cfg.play === 'addone') playAddOne(api, cfg);
        else playTurns(api, cfg);
      });
    }
  });
})();
