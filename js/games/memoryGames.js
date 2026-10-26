/* ============================================================
   PLAYMONA — memoryGames.js
   Four memory-category games:
   - memoryMatch        (picture decks, js/data/memoryDecks.js)
   - pictureMemory      (SVG illustration pairs)
   - whatsMissing       (spot the removed emoji)
   - rememberSequence   (repeat the coloured sequence)
   Classic script, global window.FF, no modules/network.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  /* ---------- shared constants & helpers ---------- */

  var EMOJI = [
    '🐶', '🐱', '🦊', '🐼', '🦁', '🐸', '🦄', '🐯', '🐨', '🦉',
    '🐙', '🦖', '🐳', '🐵', '🦋', '🐢', '🦜', '🐬', '🍎', '🍌',
    '🍓', '🍕', '🍩', '🎈', '🚗', '🚀', '⚽', '🎸', '🌈', '⭐'
  ];

  var SEQUENCE_COLORS = [
    { name: 'Red', color: '#ef4444' },
    { name: 'Blue', color: '#3b82f6' },
    { name: 'Green', color: '#10b981' },
    { name: 'Yellow', color: '#eab308' },
    { name: 'Purple', color: '#8b5cf6' },
    { name: 'Orange', color: '#f97316' }
  ];

  function bonusFor(difficulty) {
    if (difficulty === 'easy') return 1;
    if (difficulty === 'hard') return 2;
    return 1.5;
  }

  function roundPoints(base, difficulty) {
    return Math.round(base * bonusFor(difficulty));
  }

  function scorersFor(api) {
    var s = (api && api.config && api.config.scorers && api.config.scorers.length)
      ? api.config.scorers
      : null;
    if (!s || !s.length) {
      s = [{ id: 'p1', name: 'Player 1', avatar: null, color: '#8b5cf6' }];
    }
    return s;
  }

  function buildResults(api) {
    var r = api.scoring.results();
    var bestStreak = 0;
    var list = r && r.results ? r.results : [];
    list.forEach(function (x) { if (x.bestStreak > bestStreak) bestStreak = x.bestStreak; });
    return { results: list, winnerId: r && r.winnerId ? r.winnerId : null, bestStreak: bestStreak };
  }





  /* ---------- shared card-matching engine (memoryMatch + pictureMemory) ---------- */

  var MAX_CARD = 168;   // px; bigger cards only look empty

  /* Columns and card size that fit n square cards into w x h without
     scrolling. The biggest card wins; on a near tie, fewer empty slots. */
  function fitGrid(n, w, h, gap) {
    var best = null;
    for (var cols = 2; cols <= n; cols++) {
      var rows = Math.ceil(n / cols);
      var size = Math.min((w - gap * (cols - 1)) / cols, (h - gap * (rows - 1)) / rows);
      var empty = cols * rows - n;
      if (!best || size > best.size + 2 || (size > best.size - 2 && empty < best.empty)) {
        best = { cols: cols, size: size, empty: empty };
      }
    }
    best.size = Math.max(36, Math.floor(Math.min(best.size, MAX_CARD)));
    return best;
  }

  /* One or more boards of face-down pairs.
     opts: deal()        -> the items for a new board (one per pair)
           render(item)  -> the node shown on the card's face
           label(item)   -> the name read out once the card is face up
           boards        -> how many boards to play (default 1)
           colour        -> a colour token that tints the card faces */
  function runMatch(api, opts) {
    var root = api.shell.root;
    var scorers = scorersFor(api);
    var many = scorers.length > 1;
    var racing = !!(FF.Race && FF.Race.active && FF.Race.active());
    var timed = !!(FF.GameLength && FF.GameLength.timed(api.config));
    var boards = opts.boards || 1;
    // "Time per turn" limits each player's turn; alone there are no turns to limit.
    var turnSecs = many && !racing ? (api.config.timer || 0) : 0;
    if (timed) FF.GameLength.manual();

    var wrap = api.ui.div('match-wrap');
    if (opts.colour) wrap.style.setProperty('--deck', 'var(' + opts.colour + ')');
    var header = api.ui.div('match-header');
    var who = api.ui.div('match-who');
    var stats = api.ui.div('match-stats');
    var pairsStat = api.ui.span('match-stat');
    var movesStat = api.ui.span('match-stat');
    stats.appendChild(pairsStat);
    if (!many) stats.appendChild(movesStat);
    header.appendChild(who);
    header.appendChild(stats);
    var meter = api.ui.div('match-meter');
    var meterFill = api.ui.div('match-meter__fill');
    meter.appendChild(meterFill);
    var board = api.ui.div('match-board');
    var grid = api.ui.div('match-grid');
    var toast = api.ui.div('match-toast');
    toast.setAttribute('aria-hidden', 'true');
    board.appendChild(grid);
    board.appendChild(toast);
    wrap.appendChild(header);
    wrap.appendChild(meter);
    wrap.appendChild(board);
    root.appendChild(wrap);

    var items = [];
    var deck = [];       // card position -> item index
    var cards = [];
    var first = -1;
    var busy = false;
    var matched = 0;
    var moves = 0;
    var boardNo = 0;
    var turnIdx = 0;
    var ended = false;
    var toastTimer = null;

    function currentScorer() { return scorers[turnIdx % scorers.length]; }
    function shown() { return wrap.isConnected; }
    function later(fn, ms) { setTimeout(function () { if (!ended && shown()) fn(); }, ms); }
    function timeUp() { return timed && FF.GameLength.timeUp(); }

    function renderTurn() {
      FF.ui.clear(who);
      var boardText = boards > 1 && boards < (FF.GameLength ? FF.GameLength.UNBOUNDED : Infinity)
        ? FF.t('mmBoardOf', 'Board {n} of {total}', { n: boardNo, total: boards })
        : (boardNo > 1 ? FF.t('mmBoardN', 'Board {n}', { n: boardNo }) : null);
      if (many || racing) who.appendChild(FF.GameUI.turnBar(currentScorer(), boardText));
      else who.appendChild(FF.GameUI.pill(boardText || FF.t('mmFindPairs', 'Find the pairs'), 'cards', 'turn'));
      api.shell.updateScores(many ? currentScorer().id : undefined);
    }

    function renderStats() {
      pairsStat.textContent = FF.t('mmPairs', '{n} of {total} pairs', { n: matched, total: items.length });
      movesStat.textContent = moves === 1 ? FF.t('mmMove', '1 move') : FF.t('mmMoves', '{n} moves', { n: moves });
      meterFill.style.width = (items.length ? Math.round(matched / items.length * 100) : 0) + '%';
    }

    function say(text, kind) {
      FF.UI.announce(text);
      toast.textContent = text;
      toast.className = 'match-toast is-on' + (kind ? ' match-toast--' + kind : '');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { toast.classList.remove('is-on'); }, 1100);
    }

    function cardLabel(i) {
      var c = cards[i];
      var n = FF.t('mmCardN', 'Card {n}', { n: i + 1 });
      if (!c || !c.classList.contains('flipped')) return n;
      var name = opts.label ? opts.label(items[deck[i]]) : '';
      return c.classList.contains('matched')
        ? FF.t('mmCardMatched', '{card}: {name}, matched', { card: n, name: name })
        : n + ': ' + name;
    }

    function flip(i, up) {
      cards[i].classList.toggle('flipped', up);
      cards[i].setAttribute('aria-label', cardLabel(i));
    }

    /* ----- Sizing: every card on screen at once, no scrolling ----- */
    function fit() {
      if (!shown()) { stopFit(); return; }
      var cs = window.getComputedStyle(root);
      var w = root.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      var h = root.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      var gap = w < 520 ? 6 : 10;
      // Twice: the header can wrap once the board's width is known.
      for (var pass = 0; pass < 2; pass++) {
        var chrome = header.offsetHeight + meter.offsetHeight + 2 * (parseFloat(window.getComputedStyle(wrap).rowGap) || 0);
        var g = fitGrid(deck.length, w, h - chrome, gap);
        var gridW = g.cols * g.size + (g.cols - 1) * gap;
        grid.style.setProperty('--mm-size', g.size + 'px');
        grid.style.setProperty('--mm-gap', gap + 'px');
        grid.style.width = gridW + 'px';
        // The header lines up with the board, but never squeezes onto two lines on a phone.
        wrap.style.width = Math.min(w, Math.max(gridW, 480)) + 'px';
      }
    }
    var observer = null;
    function stopFit() {
      if (observer) observer.disconnect();
      window.removeEventListener('resize', fit);
    }
    if (typeof ResizeObserver === 'function') {
      observer = new ResizeObserver(function () { fit(); });
      observer.observe(root);
    } else {
      window.addEventListener('resize', fit);
    }

    /* ----- Turns ----- */
    function startTurnTimer() {
      if (turnSecs > 0) api.shell.setTimer(turnSecs, onTurnTimeout);
    }

    function onTurnTimeout() {
      if (ended || busy || !shown()) return;
      if (first !== -1) { flip(first, false); first = -1; }
      nextTurn();
      say(FF.t('mmTurnTimeUp', 'Time’s up. {name}’s turn', { name: currentScorer().name }));
    }

    function nextTurn() {
      turnIdx++;
      renderTurn();
      startTurnTimer();
    }

    function onCard(i) {
      if (ended || busy) return;
      if (cards[i].classList.contains('flipped')) return;
      flip(i, true);
      api.audio.play('flip');
      if (first === -1) { first = i; return; }
      var a = first;
      var b = i;
      first = -1;
      busy = true;
      moves++;
      renderStats();
      later(function () {
        if (deck[a] === deck[b]) {
          cards[a].classList.add('matched');
          cards[b].classList.add('matched');
          cards[a].setAttribute('aria-disabled', 'true');
          cards[b].setAttribute('aria-disabled', 'true');
          flip(a, true);
          flip(b, true);
          matched++;
          api.audio.play('correct');
          var pts = roundPoints(50, api.config.difficulty);
          api.scoring.add(currentScorer().id, pts, { correct: true });
          renderStats();
          renderTurn();
          say(many
            ? FF.t('mmMatchBy', '{name} found a pair! +{pts}', { name: currentScorer().name, pts: pts })
            : FF.t('mmMatch', 'A pair! +{pts}', { pts: pts }), 'good');
          busy = false;
          if (matched >= items.length) boardDone();
          else if (timeUp()) finish();
          else startTurnTimer();   // a pair earns another go, with a fresh clock
        } else {
          api.audio.play('wrong');
          api.scoring.add(currentScorer().id, 0, { wrong: true });
          api.scoring.resetStreak(currentScorer().id);
          cards[a].classList.add('miss');
          cards[b].classList.add('miss');
          later(function () {
            cards[a].classList.remove('miss');
            cards[b].classList.remove('miss');
            flip(a, false);
            flip(b, false);
            busy = false;
            if (timeUp()) { finish(); return; }
            if (many) {
              nextTurn();
              say(FF.t('mmNoMatchNext', 'No match. {name}’s turn', { name: currentScorer().name }));
            }
          }, 800);
        }
      }, 520);
    }

    /* ----- Boards ----- */
    function deal() {
      boardNo++;
      items = opts.deal();
      matched = 0;
      first = -1;
      var order = [];
      items.forEach(function (it, k) { order.push(k); order.push(k); });
      deck = api.util.shuffle(order);
      FF.ui.clear(grid);
      cards = [];
      deck.forEach(function (k, i) {
        var inner = api.ui.div('match-card__inner');
        var back = api.ui.div('match-card__face match-card__back');
        back.appendChild(FF.ui.el('img', { class: 'match-card__mark', src: 'assets/brand/mark-256.webp', alt: '', draggable: 'false' }));
        var front = api.ui.div('match-card__face match-card__front');
        front.appendChild(opts.render(items[k]));
        inner.appendChild(back);
        inner.appendChild(front);
        var card = api.ui.el('button', { class: 'match-card', type: 'button' }, inner);
        card.style.setProperty('--i', i);
        card.addEventListener('click', function () { onCard(i); });
        grid.appendChild(card);
        cards.push(card);
        card.setAttribute('aria-label', cardLabel(i));
      });
      grid.classList.remove('is-dealt');
      renderStats();
      renderTurn();
      fit();
      // Cards fly in once their size is known.
      requestAnimationFrame(function () { grid.classList.add('is-dealt'); });
      setTimeout(function () { grid.classList.add('is-dealt'); }, 60);
      startTurnTimer();
    }

    function boardDone() {
      if (boardNo < boards && !timeUp()) {
        api.audio.play('roundEnd');
        say(FF.t('mmBoardClear', 'Board cleared!'), 'good');
        api.shell.hideTimer();
        busy = true;
        later(function () { busy = false; deal(); }, 1300);
        return;
      }
      finish(true);
    }

    function finish(cleared) {
      if (ended) return;
      ended = true;
      stopFit();
      api.shell.hideTimer();
      if (cleared) {
        say(FF.t('mmAllFound', 'All pairs found!'), 'good');
        wrap.classList.add('is-done');
        api.audio.play('winner');
      }
      api.shell.updateScores();
      setTimeout(function () { api.end(buildResults(api)); }, cleared ? 1100 : 700);
    }

    deal();
  }

  /* ---------- pictureMemory data helper ---------- */

  function getPictureItems(count) {
    var visual = (window.FF && FF.data && FF.data.visual) ? FF.data.visual : null;
    var out = [];
    var seen = {};
    if (visual) {
      var groups = [];
      if (visual.animals && visual.animals.length) groups.push(visual.animals);
      if (visual.food && visual.food.length) groups.push(visual.food);
      if (visual.objects && visual.objects.length) groups.push(visual.objects);
      groups.forEach(function (g) {
        FF.util.shuffle(g).forEach(function (it) {
          if (out.length < count && it && it.name && it.svg && !seen[it.name]) {
            seen[it.name] = true;
            out.push({ name: it.name, svg: it.svg });
          }
        });
      });
    }
    return out;
  }

  /* ============================================================
     1. MEMORY MATCH
     Picture decks from js/data/memoryDecks.js. A card shows its
     picture once tools/cut-art-sheets.py has made it, else its emoji.
     ============================================================ */
  var MM_PAIRS = { easy: 6, normal: 10, hard: 15 };
  var MM_DECK_KEY = 'memoryMatch:deck';
  var MM_ART = 'games/memoryMatch';
  var mmRecent = [];   // card ids from recent boards, dealt last so boards look fresh

  function mmHasPic(id) {
    var m = FF.AssetManifest && FF.AssetManifest[MM_ART];
    return !!(m && m[id]);
  }

  function mmCard(row) {
    return { id: row[0], name: FF.t('mmCard_' + row[0].replace(/-/g, '_'), row[1]), emoji: row[2], pic: mmHasPic(row[0]) };
  }

  function mmDeck(id) {
    var decks = FF.MemoryDecks || [];
    for (var i = 0; i < decks.length; i++) if (decks[i].id === id) return decks[i];
    return null;
  }

  /* n different cards from one deck, or from every deck when deckId is empty. */
  function mmDeal(deckId, n) {
    var pool = [];
    (FF.MemoryDecks || []).forEach(function (d) {
      if (deckId && d.id !== deckId) return;
      d.cards.forEach(function (row) { pool.push(mmCard(row)); });
    });
    pool = FF.util.shuffle(pool);
    pool.sort(function (a, b) { return (mmRecent.indexOf(a.id) !== -1) - (mmRecent.indexOf(b.id) !== -1); });
    var out = [];
    var seen = {};
    for (var i = 0; i < pool.length && out.length < n; i++) {
      // Two different cards must never look alike (emoji stand-ins can repeat).
      var face = pool[i].pic ? pool[i].id : pool[i].emoji;
      if (seen[face]) continue;
      seen[face] = true;
      out.push(pool[i]);
    }
    mmRecent = out.map(function (c) { return c.id; }).concat(mmRecent).slice(0, 60);
    return out;
  }

  function mmFace(card) {
    if (card.pic) {
      return FF.ui.el('img', {
        class: 'match-pic', src: FF.Assets.artPath(MM_ART, card.id), alt: '', draggable: 'false', decoding: 'async'
      });
    }
    return FF.ui.span('match-emoji', card.emoji);
  }

  /* Choose a deck before a local game. Tapping a deck starts it. */
  function mmDeckPicker(api, onPick) {
    var t = FF.t;
    var root = api.shell.root;
    FF.ui.clear(root);
    api.shell.hideTimer();
    if (FF.GameLength) FF.GameLength.pause();
    var last = FF.Storage.get(MM_DECK_KEY, null);   // null before the first game
    var decks = FF.MemoryDecks || [];

    var stage = FF.GameUI.stage({ wide: true, className: 'mm-pick' });
    stage.appendChild(FF.GameUI.kicker(t('mmPickKicker', 'Memory Match')));
    stage.appendChild(FF.GameUI.prompt(t('mmPickTitle', 'Pick a deck'), 'xl'));

    var mixSample = [['animals', 10], ['food', 0], ['vehicles', 9]].map(function (x) {
      var d = mmDeck(x[0]);
      return d ? mmCard(d.cards[x[1]]) : null;
    }).filter(Boolean);
    var options = [{ id: '', name: t('mmMix', 'Mix it up'), sub: t('mmMixSub', 'A bit of everything'), colour: '--accent-vivid', sample: mixSample }];
    decks.forEach(function (d) {
      options.push({
        id: d.id,
        name: t('mmDeck_' + d.id, d.name),
        sub: t('mmNCards', '{n} pictures', { n: d.cards.length }),
        colour: d.colour,
        sample: [d.cards[0], d.cards[2], d.cards[1]].map(mmCard)
      });
    });

    var grid = FF.ui.el('div', { class: 'mm-decks', role: 'group', 'aria-label': t('mmDecks', 'Decks') });
    options.forEach(function (o) {
      var b = FF.ui.el('button', { type: 'button', class: 'mm-deck' + (o.id === last ? ' is-last' : '') });
      b.style.setProperty('--deck', 'var(' + o.colour + ')');
      var art = FF.ui.span('mm-deck__art');
      art.setAttribute('aria-hidden', 'true');
      o.sample.forEach(function (card) {
        var s = FF.ui.span('mm-deck__card');
        s.appendChild(mmFace(card));
        art.appendChild(s);
      });
      b.appendChild(art);
      var txt = FF.ui.span('mm-deck__text');
      txt.appendChild(FF.ui.span('mm-deck__name', o.name));
      txt.appendChild(FF.ui.span('mm-deck__sub', o.id === last ? t('mmLastPlayed', 'Last played') : o.sub));
      b.appendChild(txt);
      b.addEventListener('click', function () {
        FF.Storage.set(MM_DECK_KEY, o.id);
        if (FF.GameLength) FF.GameLength.resume();
        FF.Audio.play('roundStart');
        FF.ui.clear(root);
        onPick(o.id);
      });
      grid.appendChild(b);
    });
    stage.appendChild(grid);
    root.appendChild(stage);
    FF.Nav.focusFirst(stage);
  }

  function mmPlay(api, deckId) {
    var pairs = MM_PAIRS[api.config.difficulty] || MM_PAIRS.normal;
    var deck = mmDeck(deckId);
    var timed = !!(FF.GameLength && FF.GameLength.timed(api.config));
    runMatch(api, {
      // Longer games and a game clock deal fresh boards; Normal is one board.
      boards: timed ? FF.GameLength.UNBOUNDED : (FF.GameLength ? FF.GameLength.rounds(api, 1, 0) : 1),
      colour: deck ? deck.colour : null,
      deal: function () { return mmDeal(deckId, pairs); },
      render: mmFace,
      label: function (card) { return card.name; }
    });
  }

  FF.registerGame({
    id: 'memoryMatch',
    featured: true,
    name: 'Memory Match',
    // The wide banner shows the glowing pair of foxes in the middle of the cover.
    coverFocus: 'center 46%',
    description: 'Pick a deck of cute pictures, flip the cards and find every pair.',
    category: 'memory',
    icon: '🃏',
    players: [1, 8],
    difficulty: 'Easy',
    duration: 4,
    tags: ['classic', 'quick', 'kids'],
    modes: ['solo', 'turn'],
    defaultMode: 'turn',
    howToPlay: [
      'Pick a deck: animals, food, characters and more, or mix them up.',
      'Flip two cards. If they match, you score and go again.',
      'If not, they flip back and the next player goes.',
      'Find every pair to win. Hard mode has 30 cards.'
    ],
    start: function (api) {
      if (FF.Race && FF.Race.active && FF.Race.active()) { mmPlay(api, ''); return; }
      mmDeckPicker(api, function (deckId) { mmPlay(api, deckId); });
    }
  });

  /* ============================================================
     2. PICTURE MEMORY
     ============================================================ */
  FF.registerGame({
    id: 'pictureMemory',
    name: 'Picture Memory',
    description: 'Match pairs of beautiful picture cards.',
    category: 'memory',
    icon: '🖼️',
    players: [1, 8],
    difficulty: 'Normal',
    duration: 4,
    tags: ['visual', 'pairs'],
    modes: ['solo', 'turn'],
    defaultMode: 'turn',
    howToPlay: [
      'Take turns flipping two cards.',
      'Match the pictures to score and go again.',
      'No match? The cards flip back and the next player goes.',
      'Find all the pairs to win.'
    ],
    start: function (api) {
      var d = api.config.difficulty;
      var cfg = {
        easy: { pairs: 6 },
        normal: { pairs: 8 },
        hard: { pairs: 10 }
      };
      var c = cfg[d] || cfg.normal;
      runMatch(api, {
        deal: function () {
          var items = getPictureItems(c.pairs);
          while (items.length < c.pairs) items.push(EMOJI[items.length % EMOJI.length]);
          return items;
        },
        label: function (item) { return typeof item === 'string' ? item : item.name; },
        render: function (item) {
          if (typeof item === 'string') return api.ui.span('match-emoji', item);
          var face = api.assets.illustration(item.svg, 'mem-img', item.name);
          var cap = api.ui.div('mem-caption', item.name);
          var wrap = api.ui.div('match-face-wrap');
          wrap.appendChild(face);
          wrap.appendChild(cap);
          return wrap;
        }
      });
    }
  });

  /* ============================================================
     3. WHAT'S MISSING?
     ============================================================ */
  FF.registerGame({
    id: 'whatsMissing',
    name: "What's Missing?",
    description: 'Study the emoji, then spot which one vanished.',
    category: 'memory',
    icon: '🧐',
    players: [1, 8],
    difficulty: 'Easy',
    duration: 3,
    tags: ['quick', 'observation'],
    modes: ['turn', 'solo'],
    defaultMode: 'turn',
    howToPlay: [
      'Memorise the emoji on screen.',
      'One emoji disappears.',
      'Pick the missing one from 4 choices.',
      'Correct answers earn points — 6 rounds!'
    ],
    start: function (api) {
      var root = api.shell.root;
      var scorers = scorersFor(api);
      var diff = api.config.difficulty;
      var startCount = diff === 'easy' ? 5 : (diff === 'hard' ? 9 : 7);
      var ROUNDS = 6;
      var MAX_COUNT = 9;
      var round = 0;
      var ended = false;

      var wrap = api.ui.div('wm-wrap');
      var status = api.ui.div('wm-status', '');
      var stage = api.ui.div('wm-stage');
      wrap.appendChild(status);
      wrap.appendChild(stage);
      root.appendChild(wrap);

      // Offline the time limit is for the whole game. In a room it is the time
      // to answer each round (the race handles it), so it must not end the game.
      if (api.config.timer > 0 && !(FF.Race && FF.Race.active && FF.Race.active())) {
        api.shell.setTimer(api.config.timer, function () { finish(); });
      }

      var revealTimer = null;

      // ---- Race support. Offline this is all inert. ----
      ROUNDS = FF.GameLength.rounds(api, ROUNDS, 0);
      var race = FF.Race ? FF.Race.forGame(api, {
        rounds: ROUNDS,
        optionSelector: '.wm-opt'
      }) : null;
      var offSettle = null;

      // In a room nobody takes turns - everyone races the same question.
      function currentScorer() {
        if (race) {
          var me = FF.Room.current();
          var mine = scorers.filter(function (sc) { return sc.id === me.uid; })[0];
          return mine || scorers[0];
        }
        return scorers[(round - 1) % scorers.length];
      }

      function finish() {
        if (ended) return;
        ended = true;
        if (offSettle) { offSettle(); offSettle = null; }
        if (race) race.end();
        api.audio.play('winner');
        api.shell.updateScores();
        api.end(buildResults(api));
      }

      function nextRound() {
        round++;
        if (round > ROUNDS || (race && race.over(round - 1))) {
          finish();
          return;
        }
        var count = Math.min(startCount + (round - 1), MAX_COUNT);
        playRound(count);
      }

      function playRound(count) {
        if (race) race.beginRound(round - 1);
        // The shared result screen clears the shell root, detaching our
        // wrap - reattach it before drawing the next round.
        if (wrap.parentNode !== root) { api.ui.clear(root); root.appendChild(wrap); }
        api.ui.clear(stage);
        status.textContent = race
          ? (FF.Race.roundText(round, ROUNDS) + ' — everyone, memorise the emoji!')
          : ('Round ' + round + ' of ' + ROUNDS + ' — ' + currentScorer().name + ', memorise the emoji!');
        api.shell.updateScores(currentScorer().id);

        var shown = api.util.sample(EMOJI, count);
        var missingIdx = api.util.int(0, count - 1);
        var missing = shown[missingIdx];
        // For people watching: what players are doing, not the set itself (a player
        // with the watch link open could compare it with the gap on their screen).
        if (race) race.describe({ kind: 'card', text: FF.t('wmWatch', 'Everyone is memorising a row of pictures. Next, one goes missing.') }, null);

        var pool = EMOJI.filter(function (e) { return shown.indexOf(e) === -1; });
        pool = api.util.shuffle(pool);
        var distractors = [];
        for (var k = 0; k < 3; k++) {
          if (pool[k] !== undefined) distractors.push(pool[k]);
        }
        var options = api.util.shuffle([missing].concat(distractors));

        // Step A: show the full row to memorise
        var row = api.ui.div('wm-row');
        shown.forEach(function (em) { row.appendChild(api.ui.div('wm-tile', em)); });
        stage.appendChild(row);
        stage.appendChild(api.ui.div('wm-hint', 'Memorise these emoji…'));

        var countdown = api.ui.span('wm-count', '');
        stage.appendChild(countdown);

        // No early reveal in a room: it would both hand that device a head
        // start and put it on a different screen from everyone else.
        if (!race) {
          stage.appendChild(api.ui.button("I'm ready!", {
            class: 'btn btn-primary',
            onClick: function () { reveal(); }
          }));
        }

        var revealed = false;
        var remaining = 3;

        function startMemorising() {
          countdown.textContent = 'Revealing in ' + remaining + '…';
          revealTimer = setInterval(function () {
            remaining--;
            if (remaining <= 0) {
              clearInterval(revealTimer);
              reveal();
            } else {
              countdown.textContent = 'Revealing in ' + remaining + '…';
            }
          }, 1000);
        }

        if (race) {
          // Start the memorise clock at the round's shared instant, or the
          // device that rendered first reaches the answer screen first.
          countdown.textContent = 'Get ready…';
          FF.RaceUI.gate(root, '.wm-opt', startMemorising);
        } else {
          startMemorising();
        }

        function reveal() {
          if (revealed) return;
          revealed = true;
          if (revealTimer) clearInterval(revealTimer);
          api.ui.clear(stage);

          // Step B: show the rest, with a gap where the missing emoji was
          var row2 = api.ui.div('wm-row');
          shown.forEach(function (em, i) {
            if (i === missingIdx) {
              row2.appendChild(api.ui.div('wm-tile wm-missing', '?'));
            } else {
              row2.appendChild(api.ui.div('wm-tile', em));
            }
          });
          stage.appendChild(row2);
          stage.appendChild(api.ui.div('wm-q', 'Which emoji is missing?'));

          var opts = api.ui.div('wm-options');
          var answered = false;
          var startMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

          options.forEach(function (em) {
            var b = api.ui.button(em, {
              class: 'btn wm-opt',
              dataset: { emoji: em },
              onClick: function () {
                if (answered || ended) return;
                var elapsed = (typeof performance !== 'undefined' && performance.now)
                  ? (performance.now() - startMs)
                  : (Date.now() - startMs);

                if (race) {
                  // The race decides the round; a wrong answer only locks
                  // this device out while the others keep playing.
                  race.submit(null, em === missing, elapsed);
                  return;
                }

                answered = true;
                if (em === missing) {
                  b.classList.add('correct');
                  api.audio.play('correct');
                  var pts = roundPoints(100, api.config.difficulty);
                  api.scoring.add(currentScorer().id, pts, { correct: true, fastest: Math.round(elapsed) });
                  status.textContent = 'Correct, ' + currentScorer().name + '! +' + pts;
                } else {
                  b.classList.add('wrong');
                  api.audio.play('wrong');
                  api.scoring.markAnswer(currentScorer().id, false, Math.round(elapsed));
                  status.textContent = 'Not quite — it was ' + missing;
                  Array.prototype.forEach.call(opts.childNodes, function (ob) {
                    if (ob.dataset && ob.dataset.emoji === missing) ob.classList.add('correct');
                  });
                }
                api.shell.updateScores(currentScorer().id);
                setTimeout(nextRound, 1400);
              }
            });
            opts.appendChild(b);
          });
          stage.appendChild(opts);

          if (race) {
            race.gate();
            if (offSettle) offSettle();
            offSettle = race.onSettle(function (payload) {
              if (answered || ended) return;
              answered = true;
              race.showResult(payload, {
                answerText: missing,
                isLast: race.isLastRound(round - 1, ROUNDS),
                onNext: function () { nextRound(); }
              });
            });
          }
        }
      }

      nextRound();
    }
  });

  /* ============================================================
     4. REMEMBER THE SEQUENCE
     ============================================================ */
  FF.registerGame({
    id: 'rememberSequence',
    name: 'Remember the Sequence',
    description: 'Watch the colours light up, then repeat them in order.',
    category: 'memory',
    icon: '🔢',
    players: [1, 8],
    difficulty: 'Normal',
    duration: 4,
    tags: ['colours', 'sequence'],
    modes: ['turn', 'solo'],
    defaultMode: 'turn',
    howToPlay: [
      'Watch the coloured tiles light up.',
      'Tap the tiles back in the same order.',
      'Each correct round adds a tile and earns points.',
      'One mistake ends your turn.'
    ],
    start: function (api) {
      var root = api.shell.root;
      var scorers = scorersFor(api);
      var diff = api.config.difficulty;
      var startLen = diff === 'easy' ? 3 : (diff === 'hard' ? 5 : 4);
      var colorCount = diff === 'easy' ? 4 : (diff === 'hard' ? 6 : 5);
      var MAX_LEN = 12;

      var palette = SEQUENCE_COLORS.slice(0, colorCount);
      var wrap = api.ui.div('rs-wrap');
      var status = api.ui.div('rs-status', '');
      var seqEl = api.ui.div('rs-seq');
      var pad = api.ui.div('rs-pad');
      var msg = api.ui.div('rs-msg', '');
      wrap.appendChild(status);
      wrap.appendChild(seqEl);
      wrap.appendChild(pad);
      wrap.appendChild(msg);
      root.appendChild(wrap);

      var tiles = [];
      palette.forEach(function (c, i) {
        var b = api.ui.el('button', {
          class: 'rs-tile',
          type: 'button',
          tabindex: 0,
          style: { background: c.color },
          ariaLabel: c.name
        }, c.name);
        b.addEventListener('click', function () { onTile(i); });
        pad.appendChild(b);
        tiles.push(b);
      });

      var seq = [];
      var inputIdx = 0;
      var locked = true;
      var turnIdx = 0;
      var donePlayers = {};
      var ended = false;
      if (api.config.timer > 0) {
        api.shell.setTimer(api.config.timer, function () { finish(); });
      }

      function currentScorer() { return scorers[turnIdx % scorers.length]; }

      function finish() {
        if (ended) return;
        ended = true;
        api.audio.play('winner');
        api.shell.updateScores();
        api.end(buildResults(api));
      }

      function buildSeq(len) {
        var s = [];
        for (var i = 0; i < len; i++) s.push(api.util.int(0, colorCount - 1));
        return s;
      }

      function seqNames() {
        return seq.map(function (i) { return palette[i].name; }).join(' → ');
      }

      function renderSeqProgress() {
        api.ui.clear(seqEl);
        for (var i = 0; i < seq.length; i++) {
          seqEl.appendChild(api.ui.div('rs-dot' + (i < inputIdx ? ' done' : '')));
        }
      }

      function flash(i) {
        var t = tiles[i];
        t.classList.add('lit');
        setTimeout(function () { t.classList.remove('lit'); }, 220);
      }

      function revealSequence(onDone) {
        var i = 0;
        function step() {
          if (i >= seq.length) {
            setTimeout(onDone, 350);
            return;
          }
          var t = tiles[seq[i]];
          t.classList.add('lit');
          api.audio.play('tap');
          setTimeout(function () {
            t.classList.remove('lit');
            i++;
            setTimeout(step, 180);
          }, 420);
        }
        setTimeout(step, 550);
      }

      function playRound(len) {
        seq = buildSeq(len);
        inputIdx = 0;
        locked = true;
        renderSeqProgress();
        msg.textContent = currentScorer().name + ', watch the sequence!';
        revealSequence(function () {
          locked = false;
          msg.textContent = 'Your turn — repeat the sequence!';
        });
      }

      function onTile(i) {
        if (ended || locked) return;
        flash(i);
        api.audio.play('tap');
        if (i !== seq[inputIdx]) {
          locked = true;
          api.audio.play('wrong');
          api.scoring.markAnswer(currentScorer().id, false);
          msg.textContent = '' + currentScorer().name + ' — the sequence was ' + seqNames() + '.';
          donePlayers[currentScorer().id] = true;
          turnIdx++;
          setTimeout(beginTurn, 1600);
          return;
        }
        inputIdx++;
        renderSeqProgress();
        if (inputIdx >= seq.length) {
          locked = true;
          api.audio.play('correct');
          var pts = roundPoints(100, api.config.difficulty);
          api.scoring.add(currentScorer().id, pts, { correct: true });
          msg.textContent = 'Correct! +' + pts;
          api.shell.updateScores(currentScorer().id);
          if (seq.length >= MAX_LEN) {
            msg.textContent = 'Amazing memory, ' + currentScorer().name + '!';
            donePlayers[currentScorer().id] = true;
            turnIdx++;
            setTimeout(beginTurn, 1400);
          } else {
            setTimeout(function () { playRound(seq.length + 1); }, 1200);
          }
        }
      }

      function beginTurn() {
        var guard = 0;
        while (donePlayers[currentScorer().id] && guard < scorers.length) {
          turnIdx++;
          guard++;
        }
        if (guard >= scorers.length) {
          finish();
          return;
        }
        status.textContent = currentScorer().name + "'s turn";
        api.shell.updateScores(currentScorer().id);
        playRound(startLen);
      }

      beginTurn();
    }
  });
})();
