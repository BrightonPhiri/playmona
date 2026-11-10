/* ============================================================
   PLAYMONA — wordGames.js
   Word games: Word Scramble and Word Chain
   (Letter Rush lives in letterRush.js; Mini Crossword in crossword.js).
   Classic script (no modules), offline, ES2017-or-older.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  /* ================= Shared helpers ================= */


  // Inject a small stylesheet once for the word-game specific UI.

  function wordsData() {
    return (window.FF && FF.data && FF.data.words) ? FF.data.words : null;
  }

  function hasDictionary() {
    var w = wordsData();
    return !!(w && w.dictionary && w.dictionary.length);
  }

  function dictMap() {
    var map = {};
    var w = wordsData();
    var d = (w && w.dictionary) ? w.dictionary : [];
    for (var i = 0; i < d.length; i++) {
      var word = String(d[i]).toLowerCase().replace(/[^a-z]/g, '');
      if (word) map[word] = true;
    }
    return map;
  }

  function inDictionary(word) {
    var w = wordsData();
    if (w && typeof w.isWord === 'function') return w.isWord(word);
    var map = dictMap();
    return !!(word && map[word]);
  }

  function showMissingData(api, gameName, detail) {
    var root = api.shell.root;
    FF.ui.clear(root);
    api.shell.hideTimer();
    var box = FF.ui.div('panel panel--center wg-wrap');
    box.appendChild(FF.ui.div('game-intro__icon', FF.Icons.icon(FF.Icons.game[api.def.id] || 'text-aa')));
    box.appendChild(FF.ui.el('h2', {}, gameName));
    box.appendChild(FF.ui.el('p', {}, detail || 'This game needs the word list to play.'));
    box.appendChild(FF.ui.div('empty', 'The word list could not be found. Please make sure the word data is installed, then try again.'));
    box.appendChild(FF.UI.button('Exit', { icon: 'house',  primary: true, class: 'btn btn-lg', onClick: function () {
      FF.Audio.play('click');
      FF.GameFlow.exitToHome();
    } }));
    root.appendChild(box);
  }

  function scorerEntities(api) {
    if (api.config.scorers && api.config.scorers.length) return api.config.scorers.slice();
    if (api.config.players && api.config.players.length) return api.config.players.slice();
    return [];
  }

  function entityLabel(e) {
    return (e && e.name ? e.name : FF.t('playerLabel', 'Player'));
  }

  function bonusMult(api) {
    var d = api.config.difficulty;
    if (d === 'easy') return 1;
    if (d === 'hard') return 2;
    return 1.5;
  }

  function applyBonus(api, base) {
    return Math.round(base * bonusMult(api));
  }

  // One point per letter, so longer words are always worth more and there
  // is no cap - the old tiers scored every word of 7+ letters the same.
  // Deliberately NOT passed through applyBonus: the difficulty multiplier
  // would make a 3-letter word worth 5 on Normal. Difficulty still shapes
  // the letter pool and the clock in these games.
  function wordLengthScore(len) {
    return len < 3 ? 0 : len;
  }

  // Returns api.config.timer when set (may be 0 = off), else fallback.
  var BUILDER_CLOCK = { quick: 60, short: 75, normal: 90, long: 120 };

  function turnSeconds(api, fallback) {
    var t = api.config.timer;
    if (t == null) return fallback;
    return t;
  }

  // Resolve the TV display session length (seconds).
  function displaySeconds(api, fallback) {
    var s = api.config.displaySeconds;
    if (!s || isNaN(s) || s <= 0) s = fallback || 60;
    return s;
  }

  // "Big letters on the TV" display for Word Builder.
  function runLetterDisplay(api, count) {
    var root = api.shell.root;
    var seconds = displaySeconds(api, 60);
    var letters = makeLetterPool(api, count);
    var ended = false;

    FF.ui.clear(root);
    api.shell.hideTimer();
    api.shell.setTitle(api.def.name);

    var wrap = FF.ui.div('dsp-wrap');
    wrap.appendChild(FF.ui.div('dsp-tag', 'Everyone plays: no input'));
    wrap.appendChild(FF.ui.div('dsp-title', api.def.name));
    wrap.appendChild(FF.ui.div('dsp-sub', 'Find as many words as you can from the letters below. Write them in your books or on cards — count points manually.'));

    var letterRow = FF.ui.div('dsp-letters');
    function renderLetters() {
      FF.ui.clear(letterRow);
      letters.forEach(function (ch) {
        letterRow.appendChild(FF.ui.el('span', { class: 'dsp-letter' }, ch.toUpperCase()));
      });
    }
    renderLetters();
    wrap.appendChild(letterRow);

    var timerEl = FF.ui.div('dsp-timer', FF.util.formatTime(seconds));
    wrap.appendChild(timerEl);

    var actions = FF.ui.div('dsp-actions');
    actions.appendChild(FF.UI.button('New letters', { icon: 'shuffle',  class: 'btn btn-lg', onClick: function () {
      letters = makeLetterPool(api, count);
      renderLetters();
      api.audio.play('flip');
    } }));
    actions.appendChild(FF.UI.button('Finish', { icon: 'check',  class: 'btn btn-lg', primary: true, onClick: end }));
    wrap.appendChild(actions);

    root.appendChild(wrap);

    function end() {
      if (ended) return;
      ended = true;
      api.shell.hideTimer();
      api.end({ title: "TIME'S UP!" });
    }

    api.shell.setOnTick(function (rem) { timerEl.textContent = FF.util.formatTime(rem); });
    api.shell.setTimer(seconds, end);
  }

  function maxStreak(ranked) {
    var m = 0;
    (ranked || []).forEach(function (r) { if (r.bestStreak > m) m = r.bestStreak; });
    return m;
  }

  function canBuild(word, letters) {
    var pool = letters.slice();
    for (var i = 0; i < word.length; i++) {
      var idx = pool.indexOf(word.charAt(i));
      if (idx === -1) return false;
      pool.splice(idx, 1);
    }
    return true;
  }

  // Pick a dictionary word that fits inside `n` letters so the pool is
  // always guaranteed to contain at least one valid word.
  function pickSeedWord(n) {
    var w = wordsData();
    var dict = (w && w.dictionary) ? w.dictionary : [];
    if (!dict.length) return null;
    var min = 4;
    var max = Math.min(n, 7);
    var candidates = [];
    for (var i = 0; i < dict.length; i++) {
      var s = String(dict[i]).toLowerCase().replace(/[^a-z]/g, '');
      if (s.length >= min && s.length <= max) candidates.push(s);
    }
    if (!candidates.length) {
      for (var j = 0; j < dict.length; j++) {
        var t = String(dict[j]).toLowerCase().replace(/[^a-z]/g, '');
        if (t.length >= 3 && t.length <= n) candidates.push(t);
      }
    }
    return candidates.length ? FF.util.pick(candidates) : null;
  }

  function makeLetterPool(api, count) {
    var freq = {
      a: 8, e: 12, i: 8, o: 8, u: 4,
      n: 6, t: 6, s: 6, r: 6, l: 5, d: 4, h: 4,
      c: 3, m: 3, p: 3, f: 2, y: 2, w: 2, g: 2, b: 2,
      v: 1, k: 1, j: 1, x: 1, q: 1, z: 1
    };
    var weighted = '';
    for (var k in freq) { for (var i = 0; i < freq[k]; i++) weighted += k; }
    var n = count || FF.util.int(7, 10);

    // Start from a real dictionary word so the letters are always enough
    // to make one, then fill the remaining slots with weighted letters.
    var letters = [];
    var seed = pickSeedWord(n);
    if (seed) letters = seed.split('');
    while (letters.length < n) letters.push(weighted.charAt(FF.util.int(0, weighted.length - 1)));
    return FF.util.shuffle(letters);
  }

  function scrambleWord(word) {
    var arr = word.split('');
    var scrambled = word;
    var guard = 0;
    while (guard < 40) {
      scrambled = FF.util.shuffle(arr).join('');
      if (scrambled !== word) break;
      guard++;
    }
    if (scrambled === word && word.length > 1) {
      var forced = word.split('');
      var t = forced[0]; forced[0] = forced[1]; forced[1] = t;
      scrambled = forced.join('');
    }
    return scrambled;
  }

  function focusSoon(el) {
    setTimeout(function () { try { el.focus(); } catch (e) {} }, 30);
  }

  // Map an individual player id to the scoring entity (their team in team mode).
  function scoreEntityForPlayer(api, playerId) {
    if (api.config.mode === 'team') {
      var teams = api.config.scorers || [];
      for (var i = 0; i < teams.length; i++) {
        if (teams[i].players && teams[i].players.indexOf(playerId) !== -1) return teams[i];
      }
    }
    var sc = api.config.scorers || [];
    for (var j = 0; j < sc.length; j++) if (sc[j].id === playerId) return sc[j];
    return { id: playerId, name: 'Player', avatar: null, color: '#8b5cf6' };
  }

  function playEnd(api) {
    api.audio.play('winner');
  }

  /* ================= Game 2: Word Scramble ================= */

  FF.registerGame({
    id: 'wordScramble',
    name: 'Word Scramble',
    description: 'Unscramble the jumbled words using the clues before the clock runs out.',
    category: 'words',
    icon: '🔀',
    players: [1, 8],
    difficulty: 'Easy',
    duration: 3,
    tags: ['quick', 'spelling'],
    modes: ['solo', 'turn', 'team'],
    defaultMode: 'turn',
    howToPlay: [
      'Each round shows a jumbled word and a clue.',
      'Type the correct word to earn 100 points.',
      'Use a Hint to reveal the first letter (costs 30 points).',
      'Skip if you are stuck — there are 6 rounds in total!'
    ],
    display: true,
    displayStart: function (api) {
      var w = wordsData();
      var list = (w && w.scramble) ? w.scramble.filter(function (s) { return s && s.word; }) : [];
      if (!list.length) { showMissingData(api, 'Word Scramble', 'The scrambled word list is missing.'); return; }

      var seconds = displaySeconds(api, 120);
      var bag = new api.random.Bag(list);
      var item = bag.next();
      var word = item.word.toLowerCase();
      var scrambled = scrambleWord(word);
      var revealed = false;
      var ended = false;

      var root = api.shell.root;
      FF.ui.clear(root);
      api.shell.hideTimer();
      api.shell.setTitle(api.def.name);

      var wrap = FF.ui.div('dsp-wrap');
      wrap.appendChild(FF.ui.div('dsp-tag', 'Everyone plays: write your answer'));
      wrap.appendChild(FF.ui.div('dsp-title', 'Word Scramble'));

      var card = FF.ui.div('dsp-card');
      var wordEl = FF.ui.div('dsp-word', '');
      var clueEl = FF.ui.div('dsp-clue', '');
      var answerEl = FF.ui.div('dsp-answer', '');
      card.appendChild(wordEl);
      card.appendChild(clueEl);
      card.appendChild(answerEl);
      wrap.appendChild(card);

      var timerEl = FF.ui.div('dsp-timer', FF.util.formatTime(seconds));
      wrap.appendChild(timerEl);

      function renderWord() {
        wordEl.textContent = scrambled.toUpperCase();
        clueEl.textContent = '' + (item.clue || 'Unscramble the letters');
        answerEl.textContent = '';
        revealed = false;
      }

      var actions = FF.ui.div('dsp-actions');
      actions.appendChild(FF.UI.button('Reveal answer', { icon: 'eye',  class: 'btn btn-lg', onClick: function () {
        if (revealed) return;
        revealed = true;
        answerEl.textContent = '' + word.toUpperCase();
        api.audio.play('correct');
      } }));
      actions.appendChild(FF.UI.button('Next word', { icon: 'play',  class: 'btn btn-lg', onClick: function () {
        item = bag.next();
        word = item.word.toLowerCase();
        scrambled = scrambleWord(word);
        renderWord();
        api.audio.play('flip');
      } }));
      actions.appendChild(FF.UI.button('Finish', { icon: 'check',  class: 'btn btn-lg', primary: true, onClick: end }));
      wrap.appendChild(actions);

      root.appendChild(wrap);

      function end() {
        if (ended) return;
        ended = true;
        api.shell.hideTimer();
        api.end({ title: "TIME'S UP!" });
      }

      renderWord();
      api.shell.setOnTick(function (rem) { timerEl.textContent = FF.util.formatTime(rem); });
      api.shell.setTimer(seconds, end);
    },
    start: function (api) {
      var w = wordsData();
      var list = (w && w.scramble) ? w.scramble.filter(function (s) { return s && s.word; }) : [];
      if (!list.length) { showMissingData(api, 'Word Scramble', 'The scrambled word list is missing.'); return; }

      var d = api.config.difficulty;
      var filtered = list.filter(function (s) { return s.difficulty === d; });
      if (filtered.length < 6) filtered = list.slice();

      var order = scorerEntities(api);
      if (!order.length) { showMissingData(api, 'Word Scramble', 'No players were found.'); return; }
      if (api.config.randomOrder) order = FF.util.shuffle(order);

      // In a room every device deals the same words: draw them from the
      // room's seed. The race seeds each round again before scrambling.
      var racing = !!(FF.Race && FF.Race.active() && FF.Room && FF.Room.current());
      if (racing) FF.Random.seed(FF.Random.roundSeed(FF.Room.current().meta.seed, api.def.id, 'deck'));

      var bag = new api.random.Bag(filtered);
      var items = [];
      var count = FF.GameLength.rounds(api, 6, 0);
      for (var i = 0; i < count; i++) items.push(bag.next());

      // ---- Race support: the first to type the word takes the round. ----
      var race = racing ? FF.Race.forGame(api, { rounds: count, optionSelector: '.ws-play' }) : null;
      var me = null;
      if (race) {
        var uid = FF.Room.current().uid;
        me = order.filter(function (e) { return e.id === uid; })[0] || order[0];
      }

      var state = {
        order: order,
        round: 0,
        total: count,
        items: items,
        busy: false,
        ended: false,
        word: '',
        answered: false
      };

      var offSettle = race ? race.onSettle(function (payload) {
        if (state.answered) return;
        state.answered = true;
        api.shell.hideTimer();
        race.showResult(payload, {
          answerText: state.word.toUpperCase(),
          isLast: race.isLastRound(state.round, state.total),
          onNext: next
        });
      }) : null;

      function next() {
        api.audio.play('click');
        state.round++;
        state.busy = false;
        if (state.round >= state.total || (race && race.over(state.round))) { renderEnd(); return; }
        renderRound();
      }

      function renderRound() {
        if (state.ended) return;
        var entity = race ? me : state.order[state.round % state.order.length];
        var item = state.items[state.round];
        // Seeded first, so every device scrambles the word the same way.
        var opening = race ? race.beginRound(state.round) : null;
        var word = item.word.toLowerCase();
        var scrambled = scrambleWord(word);
        var hinted = false;
        var answered = false;
        var seconds = turnSeconds(api, null);
        state.word = word;
        state.answered = false;
        if (race) race.describe({ kind: 'card', text: FF.t('wsWatch', 'Unscramble {letters}. Clue: {clue}', { letters: scrambled.toUpperCase(), clue: item.clue }) }, null);

        var root = api.shell.root;
        FF.ui.clear(root);
        api.shell.hideTimer();
        api.shell.setTitle(api.def.name);

        var wrap = FF.ui.div('panel panel--center wg-wrap');
        wrap.appendChild(FF.ui.el('h2', {}, (race ? FF.t('everyoneRaces', 'Everyone races') : entityLabel(entity)) + ' — ' + FF.GameLength.roundText(state.round + 1, state.total)));
        wrap.appendChild(FF.ui.div('wg-scramble', scrambled.toUpperCase()));
        wrap.appendChild(FF.ui.el('p', { class: 'hint' }, 'Clue: ' + item.clue));

        var form = FF.ui.div('wg-word-form');
        var input = FF.ui.el('input', {
          type: 'text', class: 'wg-input ws-play', placeholder: 'Your answer…',
          autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', maxlength: 16,
          onkeydown: function (e) { if (e.key === 'Enter') { e.preventDefault(); check(); } }
        });
        var checkBtn = FF.UI.button('Check', { icon: 'check',  primary: true, class: 'btn ws-play', onClick: check });
        var hintBtn = FF.UI.button('Hint (-30)', { icon: 'lightbulb',  class: 'btn ws-play', onClick: hint });
        var skipBtn = FF.UI.button('Skip', { icon: 'chevron-right',  class: 'btn ws-play', onClick: function () { resolve(false, 'skip'); } });
        // In a room nobody can type before the round opens for everyone.
        if (race) [input, checkBtn, hintBtn, skipBtn].forEach(function (c) { c.disabled = true; });
        form.appendChild(input);
        form.appendChild(checkBtn);
        wrap.appendChild(form);
        var actions = FF.ui.div('wg-word-form');
        actions.appendChild(hintBtn);
        actions.appendChild(skipBtn);
        wrap.appendChild(actions);
        root.appendChild(wrap);

        function hint() {
          if (answered || hinted) return;
          hinted = true;
          // In a room scores come from the race, so the hint lowers what
          // this answer is worth instead.
          if (!race) {
            api.scoring.subtract(entity.id, 30);
            api.shell.updateScores(entity.id);
          }
          api.audio.play('tap');
          api.shell.toast('First letter: ' + word.charAt(0).toUpperCase(), 'hint');
          input.value = word.charAt(0);
          input.setSelectionRange(1, 1);
          focusSoon(input);
        }

        function check() {
          if (answered) return;
          var ans = FF.util.lettersOnly(input.value);
          if (!ans) { api.shell.toast('Type your answer first.', 'warning'); api.audio.play('wrong'); return; }
          if (race && ans !== word) {
            // A wrong try stays on this device: keep typing until someone gets it.
            api.audio.play('wrong');
            api.shell.toast(FF.t('wsKeepTrying', 'Not quite. Keep trying!'), 'warning');
            input.select();
            return;
          }
          if (ans === word) resolve(true, ''); else resolve(false, 'wrong');
        }

        function resolve(correct, kind) {
          if (answered) return;
          answered = true;
          if (race) {
            // The race decides the round. Skipping (or running out of time)
            // passes, so a round nobody can solve still ends.
            api.shell.hideTimer();
            if (kind === 'timeout') {
              [input, checkBtn, hintBtn, skipBtn].forEach(function (c) { c.disabled = true; });
              return;
            }
            race.submit(correct ? word : null, correct, null, { value: correct ? Math.max(0, applyBonus(api, 100) - (hinted ? 30 : 0)) : 0 });
            if (correct) [input, checkBtn, hintBtn, skipBtn].forEach(function (c) { c.disabled = true; });
            return;
          }
          api.shell.hideTimer();
          var root2 = api.shell.root;
          FF.ui.clear(root2);
          var box = FF.ui.div('panel panel--center wg-wrap wg-result');
          if (correct) {
            var pts = applyBonus(api, 100);
            api.scoring.add(entity.id, pts, { correct: true });
            api.shell.updateScores(entity.id);
            api.audio.play('correct');
            box.appendChild(FF.ui.el('h2', {}, 'Correct! +' + pts));
            box.appendChild(FF.ui.div('wg-scramble', word.toUpperCase()));
          } else {
            api.scoring.markAnswer(entity.id, false);
            api.audio.play('wrong');
            var msg = kind === 'skip' ? 'Skipped' : (kind === 'timeout' ? 'Time is up!' : 'Not quite');
            box.appendChild(FF.ui.el('h2', {}, msg));
            box.appendChild(FF.ui.el('p', {}, 'The word was: ' + word.toUpperCase()));
            box.appendChild(FF.ui.el('p', { class: 'wg-sub' }, '' + item.clue));
          }
          box.appendChild(FF.UI.button('Next', { icon: 'play',  primary: true, class: 'btn btn-lg', onClick: next }));
          root2.appendChild(box);
        }

        function startClock() {
          if (seconds && seconds > 0) {
            api.shell.setTimer(seconds, function () { resolve(false, 'timeout'); });
          }
          focusSoon(input);
        }

        if (!(seconds && seconds > 0)) {
          wrap.appendChild(FF.ui.div('wg-timer-note', 'No timer — take your time.'));
        }

        if (race) {
          // Everyone sees the letters from the same shared instant.
          var thisRound = state.round;
          opening.then(function () {
            race.gate(function () {
              if (answered || state.answered || state.round !== thisRound) return;
              [input, checkBtn, hintBtn, skipBtn].forEach(function (c) { c.disabled = false; });
              startClock();
            });
          });
        } else {
          startClock();
        }
      }

      function renderEnd() {
        if (state.ended) return;
        state.ended = true;
        api.shell.hideTimer();
        if (offSettle) offSettle();
        if (race) race.end();
        playEnd(api);
        var sr = api.scoring.results();
        api.end({ results: sr.results, winnerId: sr.winnerId, bestStreak: maxStreak(sr.results) });
      }

      renderRound();
    }
  });

  /* ================= Game 4: Word Chain ================= */

  FF.registerGame({
    id: 'wordChain',
    name: 'Word Chain',
    description: 'Take turns building a word chain where each word starts with the last letter.',
    category: 'words',
    icon: '🔗',
    players: [1, 8],
    difficulty: 'Normal',
    duration: 4,
    tags: ['spelling', 'party'],
    modes: ['solo', 'turn', 'team'],
    defaultMode: 'turn',
    howToPlay: [
      'Take turns adding a word to the chain.',
      'Each new word must begin with the last letter of the previous word.',
      'You have 3 lives — a wrong word or a skip costs a life.',
      'Last player standing (or most points) wins!'
    ],
    start: function (api) {
      if (!hasDictionary()) { showMissingData(api, 'Word Chain'); return; }
      var dictList = wordsData().dictionary;
      var order = scorerEntities(api);
      if (!order.length) { showMissingData(api, 'Word Chain', 'No players were found.'); return; }
      if (api.config.randomOrder) order = FF.util.shuffle(order);

      function pickStartWord() {
        var candidates = dictList.filter(function (w) {
          var s = String(w).toLowerCase();
          return s.length >= 4 && s.length <= 6 && /^[a-z]+$/.test(s);
        });
        if (!candidates.length) candidates = dictList.filter(function (w) { return /^[a-z]+$/.test(String(w)); });
        return String(FF.util.pick(candidates.length ? candidates : ['apple'])).toLowerCase();
      }

      var startWord = pickStartWord();

      var state = {
        order: order,
        idx: 0,
        chain: [startWord],
        used: {},
        lives: {},
        round: 1,
        maxRounds: FF.GameLength.rounds(api, 10, 0),
        dict: dictMap(),
        busy: false,
        ended: false
      };
      state.used[startWord] = true;
      order.forEach(function (e) { state.lives[e.id] = 3; });

      function aliveCount() {
        var n = 0;
        state.order.forEach(function (e) { if (state.lives[e.id] > 0) n++; });
        return n;
      }

      // Three heart icons; lost lives are dimmed. Read out as a number.
      function hearts(n) {
        var out = [];
        for (var i = 0; i < 3; i++) {
          var h = FF.Icons.icon('heart-fill');
          if (i >= n) h.classList.add('is-lost');
          out.push(h);
        }
        out.push(FF.ui.span('sr-only', FF.t('livesLeft', '{n} lives left', { n: n })));
        return out;
      }

      function render() {
        if (state.ended) return;
        // Skip any eliminated players.
        var guard = 0;
        while (aliveCount() > 1 && state.lives[state.order[state.idx].id] <= 0 && guard < state.order.length * 2) {
          state.idx = (state.idx + 1) % state.order.length;
          guard++;
        }
        // Alone, play on until the lives run out; with others, until one is left.
        var lastStanding = state.order.length > 1 ? aliveCount() <= 1 : aliveCount() === 0;
        if (lastStanding || state.round > state.maxRounds) { renderEnd(); return; }

        var entity = state.order[state.idx];
        var lastWord = state.chain[state.chain.length - 1];
        var nextLetter = lastWord.charAt(lastWord.length - 1);
        var seconds = turnSeconds(api, 15);

        var root = api.shell.root;
        FF.ui.clear(root);
        api.shell.hideTimer();
        api.shell.setTitle(api.def.name);

        var wrap = FF.ui.div('panel panel--center wg-wrap');
        wrap.appendChild(FF.ui.el('h2', {}, entityLabel(entity) + '’s turn'));
        wrap.appendChild(FF.ui.el('p', { class: 'wg-sub' }, 'Type a word that starts with:'));
        wrap.appendChild(FF.ui.div('wg-chain-letter', nextLetter.toUpperCase()));
        wrap.appendChild(FF.ui.div('wg-lives', hearts(state.lives[entity.id])));

        var hist = FF.ui.div('wg-chain');
        state.chain.forEach(function (w, i) {
          hist.appendChild(FF.ui.el('span', { class: 'wg-chip' }, (i ? '→ ' : '') + w.toUpperCase()));
        });
        wrap.appendChild(hist);

        var form = FF.ui.div('wg-word-form');
        var input = FF.ui.el('input', {
          type: 'text', class: 'wg-input', placeholder: 'Word starting with ' + nextLetter.toUpperCase() + '…',
          autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', maxlength: 16,
          onkeydown: function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } }
        });
        var submitBtn = FF.UI.button('Add', { icon: 'check',  primary: true, class: 'btn', onClick: submit });
        var skipBtn = FF.UI.button('Skip (-1 life)', { icon: 'chevron-right',  class: 'btn', onClick: function () { fail('skip'); } });
        form.appendChild(input);
        form.appendChild(submitBtn);
        form.appendChild(skipBtn);
        wrap.appendChild(form);
        root.appendChild(wrap);

        function submit() {
          if (state.busy) return;
          var word = FF.util.lettersOnly(input.value);
          input.value = '';
          if (!word) { api.shell.toast('Type a word first.', 'warning'); api.audio.play('wrong'); return; }
          if (word.charAt(0) !== nextLetter) { api.shell.toast('It must start with ' + nextLetter.toUpperCase() + '.', 'warning'); api.audio.play('wrong'); return; }
          if (!inDictionary(word)) { api.shell.toast('Not in the dictionary.', 'warning'); api.audio.play('wrong'); return; }
          if (state.used[word]) { api.shell.toast('That word was already used.', 'warning'); api.audio.play('wrong'); return; }
          success(word);
        }

        function success(word) {
          if (state.busy) return;
          state.busy = true;
          api.shell.hideTimer();
          var e = state.order[state.idx];
          var pts = applyBonus(api, 50);
          state.chain.push(word);
          state.used[word] = true;
          api.scoring.add(e.id, pts, { correct: true });
          api.shell.updateScores(e.id);
          api.audio.play('correct');
          api.shell.toast('+' + pts + ' ' + word.toUpperCase() + '!', 'correct');
          advance();
        }

        function fail(kind) {
          if (state.busy) return;
          state.busy = true;
          api.shell.hideTimer();
          var e = state.order[state.idx];
          state.lives[e.id]--;
          api.scoring.markAnswer(e.id, false);
          api.audio.play('wrong');

          var root2 = api.shell.root;
          FF.ui.clear(root2);
          var box = FF.ui.div('panel panel--center wg-wrap wg-result');
          var msg = kind === 'skip' ? 'Skipped — lose a life' : (kind === 'timeout' ? 'Time is up — lose a life' : 'Wrong word — lose a life');
          box.appendChild(FF.ui.el('h2', {}, msg));
          box.appendChild(FF.ui.div('wg-lives', hearts(state.lives[e.id])));
          box.appendChild(FF.ui.el('p', { class: 'wg-sub' }, 'The chain stays on "' + state.chain[state.chain.length - 1].toUpperCase() + '".'));
          box.appendChild(FF.UI.button('Next', { icon: 'play',  primary: true, class: 'btn btn-lg', onClick: advance }));
          root2.appendChild(box);
        }

        function advance() {
          state.round++;
          state.idx = (state.idx + 1) % state.order.length;
          state.busy = false;
          render();
        }

        if (seconds && seconds > 0) {
          api.shell.setTimer(seconds, function () { fail('timeout'); });
        }

        focusSoon(input);
      }

      function renderEnd() {
        if (state.ended) return;
        state.ended = true;
        api.shell.hideTimer();
        playEnd(api);
        var sr = api.scoring.results();
        api.end({ results: sr.results, winnerId: sr.winnerId, bestStreak: maxStreak(sr.results) });
      }

      render();
    }
  });
})();
