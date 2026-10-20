/* ============================================================
   PLAYMORA — memoryGames.js
   Four memory-category games:
   - memoryMatch        (emoji card pairs)
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

  function runMatch(api, opts) {
    var root = api.shell.root;
    var scorers = scorersFor(api);
    var pairs = opts.pairs;

    var items = (opts.items && opts.items.length) ? opts.items.slice(0, pairs) : [];
    while (items.length < pairs) {
      items.push(EMOJI[items.length % EMOJI.length]);
    }

    var deck = [];
    items.forEach(function (it) { deck.push(it); deck.push(it); });
    deck = api.util.shuffle(deck);

    var wrap = api.ui.div('match-wrap');
    var header = api.ui.div('match-header');
    var turnLabel = api.ui.div('match-turn', '');
    var status = api.ui.span('match-status', '');
    header.appendChild(turnLabel);
    header.appendChild(status);
    wrap.appendChild(header);

    var grid = api.ui.el('div', {
      class: 'match-grid',
      style: { gridTemplateColumns: 'repeat(' + opts.cols + ', 1fr)' }
    });
    wrap.appendChild(grid);

    var cards = [];
    var first = -1;
    var busy = false;
    var matched = 0;
    var turnIdx = 0;
    var ended = false;

    function currentScorer() { return scorers[turnIdx % scorers.length]; }

    function renderTurn() {
      turnLabel.textContent = '' + currentScorer().name + "'s turn";
      api.shell.updateScores(currentScorer().id);
    }

    function finishMatch() {
      if (ended) return;
      ended = true;
      status.textContent = 'All pairs found! 🎉';
      api.audio.play('winner');
      api.shell.updateScores();
      setTimeout(function () { api.end(buildResults(api)); }, 900);
    }

    function onCard(i) {
      if (ended || busy) return;
      if (cards[i].classList.contains('flipped') || cards[i].classList.contains('matched')) return;
      if (first === -1) {
        first = i;
        cards[i].classList.add('flipped');
        api.audio.play('flip');
        return;
      }
      cards[i].classList.add('flipped');
      api.audio.play('flip');
      busy = true;
      var aIdx = first;
      var bIdx = i;
      first = -1;
      setTimeout(function () {
        if (deck[aIdx] === deck[bIdx]) {
          cards[aIdx].classList.add('matched');
          cards[bIdx].classList.add('matched');
          matched++;
          api.audio.play('correct');
          var pts = roundPoints(50, api.config.difficulty);
          api.scoring.add(currentScorer().id, pts, { correct: true });
          status.textContent = currentScorer().name + ' found a match! +' + pts;
          api.shell.updateScores(currentScorer().id);
          busy = false;
          if (matched >= pairs) {
            finishMatch();
          }
          // same player keeps their turn
        } else {
          api.audio.play('wrong');
          setTimeout(function () {
            cards[aIdx].classList.remove('flipped');
            cards[bIdx].classList.remove('flipped');
            busy = false;
            turnIdx++;
            status.textContent = 'No match — ' + currentScorer().name + "'s turn.";
            renderTurn();
          }, 750);
        }
      }, 620);
    }

    deck.forEach(function (item, i) {
      var inner = api.ui.div('match-card__inner');
      inner.appendChild(api.ui.div('match-card__face match-card__back', FF.ui.el('img', { class: 'match-card__mark', src: 'assets/brand/mark-256.webp', alt: '' })));
      var front = api.ui.div('match-card__face match-card__front');
      front.appendChild(opts.buildFront(item));
      inner.appendChild(front);
      var card = api.ui.el('button', {
        class: 'match-card',
        type: 'button',
        tabindex: 0,
        ariaLabel: 'Card ' + (i + 1)
      }, inner);
      card.addEventListener('click', function () { onCard(i); });
      grid.appendChild(card);
      cards.push(card);
    });

    root.appendChild(wrap);
    renderTurn();
    status.textContent = 'Flip two cards to find a match.';
    if (api.config.timer > 0) {
      api.shell.setTimer(api.config.timer, function () {
        if (ended) return;
        ended = true;
        status.textContent = "Time's up!";
        api.audio.play('roundEnd');
        setTimeout(function () { api.end(buildResults(api)); }, 700);
      });
    }
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
     ============================================================ */
  FF.registerGame({
    id: 'memoryMatch',
    featured: true,
    name: 'Memory Match',
    description: 'Flip cards to find matching pairs and score big.',
    category: 'memory',
    icon: '🃏',
    players: [1, 8],
    difficulty: 'Easy',
    duration: 4,
    tags: ['classic', 'quick'],
    modes: ['solo', 'turn'],
    defaultMode: 'turn',
    howToPlay: [
      'Take turns flipping two cards.',
      'If they match, you score and go again.',
      'If not, they flip back and the next player goes.',
      'Find every pair to win.'
    ],
    start: function (api) {
      var d = api.config.difficulty;
      var cfg = {
        easy: { pairs: 6, cols: 4 },
        normal: { pairs: 8, cols: 4 },
        hard: { pairs: 12, cols: 6 }
      };
      var c = cfg[d] || cfg.normal;
      runMatch(api, {
        pairs: c.pairs,
        cols: c.cols,
        items: EMOJI.slice(),
        buildFront: function (item) {
          return api.ui.span('match-emoji', item);
        }
      });
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
        easy: { pairs: 6, cols: 4 },
        normal: { pairs: 8, cols: 4 },
        hard: { pairs: 10, cols: 5 }
      };
      var c = cfg[d] || cfg.normal;
      var items = getPictureItems(c.pairs);
      runMatch(api, {
        pairs: c.pairs,
        cols: c.cols,
        items: items,
        buildFront: function (item) {
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

      if (api.config.timer > 0) {
        api.shell.setTimer(api.config.timer, function () { finish(); });
      }

      var revealTimer = null;

      // ---- Race support. Offline this is all inert. ----
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
        if (round > ROUNDS) {
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
          ? ('Round ' + round + ' of ' + ROUNDS + ' — everyone, memorise the emoji!')
          : ('Round ' + round + ' of ' + ROUNDS + ' — ' + currentScorer().name + ', memorise the emoji!');
        api.shell.updateScores(currentScorer().id);

        var shown = api.util.sample(EMOJI, count);
        var missingIdx = api.util.int(0, count - 1);
        var missing = shown[missingIdx];

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
                isLast: round >= ROUNDS,
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
