/* ============================================================
   PLAYMONA — wordGames.js
   Word games: Word Scramble, Word Builder, Word Chain and Mini
   Crossword (Letter Rush lives in letterRush.js).
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

      var bag = new api.random.Bag(filtered);
      var items = [];
      for (var i = 0; i < 6; i++) items.push(bag.next());

      var state = {
        order: order,
        round: 0,
        total: 6,
        items: items,
        busy: false,
        ended: false
      };

      function renderRound() {
        if (state.ended) return;
        var entity = state.order[state.round % state.order.length];
        var item = state.items[state.round];
        var word = item.word.toLowerCase();
        var scrambled = scrambleWord(word);
        var hinted = false;
        var answered = false;
        var seconds = turnSeconds(api, null);

        var root = api.shell.root;
        FF.ui.clear(root);
        api.shell.hideTimer();
        api.shell.setTitle(api.def.name);

        var wrap = FF.ui.div('panel panel--center wg-wrap');
        wrap.appendChild(FF.ui.el('h2', {}, entityLabel(entity) + ' — Round ' + (state.round + 1) + ' of ' + state.total));
        wrap.appendChild(FF.ui.div('wg-scramble', scrambled.toUpperCase()));
        wrap.appendChild(FF.ui.el('p', { class: 'hint' }, 'Clue: ' + item.clue));

        var form = FF.ui.div('wg-word-form');
        var input = FF.ui.el('input', {
          type: 'text', class: 'wg-input', placeholder: 'Your answer…',
          autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', maxlength: 16,
          onkeydown: function (e) { if (e.key === 'Enter') { e.preventDefault(); check(); } }
        });
        var checkBtn = FF.UI.button('Check', { icon: 'check',  primary: true, class: 'btn', onClick: check });
        var hintBtn = FF.UI.button('Hint (-30)', { icon: 'lightbulb',  class: 'btn', onClick: hint });
        var skipBtn = FF.UI.button('Skip', { icon: 'chevron-right',  class: 'btn', onClick: function () { resolve(false, 'skip'); } });
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
          api.scoring.subtract(entity.id, 30);
          api.shell.updateScores(entity.id);
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
          if (ans === word) resolve(true, ''); else resolve(false, 'wrong');
        }

        function resolve(correct, kind) {
          if (answered) return;
          answered = true;
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

        function next() {
          api.audio.play('click');
          state.round++;
          state.busy = false;
          if (state.round >= state.total) { renderEnd(); return; }
          renderRound();
        }

        if (seconds && seconds > 0) {
          api.shell.setTimer(seconds, function () { resolve(false, 'timeout'); });
        } else {
          wrap.appendChild(FF.ui.div('wg-timer-note', 'No timer — take your time.'));
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

      renderRound();
    }
  });

  /* ================= Game 3: Word Builder ================= */

  FF.registerGame({
    id: 'wordBuilder',
    name: 'Word Builder',
    description: 'Everyone shares one set of letters — claim words fast and build the most!',
    category: 'words',
    icon: '🧱',
    players: [1, 8],
    difficulty: 'Normal',
    duration: 5,
    tags: ['spelling', 'party'],
    modes: ['solo', 'everyone', 'team'],
    defaultMode: 'everyone',
    howToPlay: [
      'Everyone shares one set of 10 letters.',
      'Tap your name, then type a word using those letters.',
      'Longer words earn more points — a word can only be used once.',
      'The player with the most words when time runs out wins!'
    ],
    display: true,
    displayStart: function (api) {
      if (!hasDictionary()) { showMissingData(api, 'Word Builder'); return; }
      runLetterDisplay(api, 10);
    },
    start: function (api) {
      if (!hasDictionary()) { showMissingData(api, 'Word Builder'); return; }
      var players = (api.config.players && api.config.players.length) ? api.config.players.slice() : scorerEntities(api);
      if (!players.length) { showMissingData(api, 'Word Builder', 'No players were found.'); return; }

      var state = {
        players: players,
        activeId: players[0].id,
        letters: makeLetterPool(api, 10),
        words: {},   // playerId -> [words]
        counts: {},  // playerId -> number
        used: {},
        dict: dictMap(),
        busy: false,
        ended: false,
        finished: false
      };
      players.forEach(function (p) { state.words[p.id] = []; state.counts[p.id] = 0; });

      function render() {
        var root = api.shell.root;
        FF.ui.clear(root);
        api.shell.hideTimer();
        api.shell.setTitle(api.def.name);

        var wrap = FF.ui.div('wg-wrap');
        wrap.appendChild(FF.ui.el('h2', { class: 'wg-center' }, FF.t('sharedLetters', 'Shared letters')));

        var letterRow = FF.ui.div('wg-letters');
        state.letters.forEach(function (ch) { letterRow.appendChild(FF.ui.el('span', { class: 'wg-letter' }, ch.toUpperCase())); });
        wrap.appendChild(letterRow);

        var claimRow = FF.ui.div('wg-claim-row');
        players.forEach(function (p) {
          var b = FF.ui.button([FF.Players.avatarEl(p, 'who-ava'), p.name], {
            class: 'wg-claim-btn' + (p.id === state.activeId ? ' active' : ''),
            onClick: function () {
              state.activeId = p.id;
              FF.ui.$$('.wg-claim-btn', claimRow).forEach(function (x) { x.classList.remove('active'); });
              b.classList.add('active');
              api.audio.play('tap');
              api.shell.updateScores(p.id);
              focusSoon(input);
            }
          });
          claimRow.appendChild(b);
        });
        wrap.appendChild(claimRow);
        wrap.appendChild(FF.ui.div('wg-sub wg-center', 'Tap your name, then type a word to claim it.'));

        var form = FF.ui.div('wg-word-form');
        var input = FF.ui.el('input', {
          type: 'text', class: 'wg-input', placeholder: 'Type a word…',
          autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', maxlength: 12,
          onkeydown: function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } }
        });
        var submitBtn = FF.UI.button('Add word', { icon: 'check',  primary: true, class: 'btn', onClick: submit });
        form.appendChild(input);
        form.appendChild(submitBtn);
        wrap.appendChild(form);

        var listBox = FF.ui.div('panel');
        wrap.appendChild(listBox);
        root.appendChild(wrap);

        function renderLists() {
          FF.ui.clear(listBox);
          listBox.appendChild(FF.ui.el('h3', { class: 'wg-center' }, FF.t('wordsFound', 'Words found')));
          players.forEach(function (p) {
            var ws = state.words[p.id] || [];
            var row = FF.ui.div('wg-word-row');
            row.appendChild(FF.ui.el('span', { class: 'wg-word-row__name' }, [FF.Players.avatarEl(p, 'who-ava'), p.name + ' (' + ws.length + ')']));
            row.appendChild(FF.ui.el('span', { class: 'wg-word-row__words' }, ws.length ? ws.map(function (w) { return w.toUpperCase(); }).join(', ') : '—'));
            listBox.appendChild(row);
          });
        }

        function submit() {
          if (state.busy || state.finished) return;
          var word = FF.util.lettersOnly(input.value);
          input.value = '';
          if (word.length < 3) { api.shell.toast('Too short — use at least 3 letters.', 'warning'); api.audio.play('wrong'); return; }
          if (!canBuild(word, state.letters)) { api.shell.toast('Only use the letters shown.', 'warning'); api.audio.play('wrong'); return; }
          if (!inDictionary(word)) { api.shell.toast('That word is not in the dictionary.', 'warning'); api.audio.play('wrong'); return; }
          if (state.used[word]) { api.shell.toast('That word was already used!', 'warning'); api.audio.play('wrong'); return; }
          var entity = scoreEntityForPlayer(api, state.activeId);
          state.used[word] = true;
          state.words[state.activeId].push(word);
          state.counts[state.activeId]++;
          var pts = wordLengthScore(word.length);
          api.scoring.add(entity.id, pts, { correct: true });
          api.shell.updateScores(entity.id);
          api.audio.play('correct');
          api.shell.toast('+' + pts + ' ' + word.toUpperCase() + '!', 'correct');
          renderLists();
          focusSoon(input);
        }

        renderLists();
        var seconds = turnSeconds(api, 60);
        if (seconds && seconds > 0) {
          api.shell.setTimer(seconds, renderEnd);
        } else {
          wrap.appendChild(FF.ui.div('wg-timer-note', 'No timer — press "Finish" when done.'));
        }
        wrap.appendChild(FF.UI.button('Finish', { icon: 'check',  class: 'btn', onClick: renderEnd }));
        focusSoon(input);
      }

      function renderEnd() {
        if (state.finished) return;
        state.finished = true;
        api.shell.hideTimer();
        var root = api.shell.root;
        FF.ui.clear(root);
        var wrap = FF.ui.div('panel wg-wrap');
        wrap.appendChild(FF.ui.el('h2', { class: 'wg-center' }, FF.t('timesUp', 'Time\u2019s up!')));
        var mostWords = 0;
        players.forEach(function (p) {
          var ws = state.words[p.id] || [];
          if (ws.length > mostWords) mostWords = ws.length;
          var row = FF.ui.div('wg-word-row');
          row.appendChild(FF.ui.el('span', { class: 'wg-word-row__name' }, [FF.Players.avatarEl(p, 'who-ava'), p.name + ' (' + ws.length + ')']));
          row.appendChild(FF.ui.el('span', { class: 'wg-word-row__words' }, ws.length ? ws.map(function (w) { return w.toUpperCase(); }).join(', ') : '—'));
          wrap.appendChild(row);
        });
        var achievements = mostWords >= 15 ? ['wordMaster'] : [];
        wrap.appendChild(FF.UI.button('Finish', { icon: 'check',  primary: true, class: 'btn btn-lg', onClick: function () {
          playEnd(api);
          var sr = api.scoring.results();
          api.end({
            results: sr.results,
            winnerId: sr.winnerId,
            mostWords: mostWords,
            bestStreak: maxStreak(sr.results),
            achievements: achievements
          });
        } }));
        root.appendChild(wrap);
      }

      render();
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
        maxRounds: 10,
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
        if (aliveCount() <= 1 || state.round > state.maxRounds) { renderEnd(); return; }

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

  /* ================= Game 5: Mini Crossword ================= */

  FF.registerGame({
    id: 'miniCrossword',
    name: 'Mini Crossword',
    description: 'Solve a mini crossword puzzle together — fill every square to win.',
    category: 'words',
    icon: '🧩',
    players: [1, 8],
    difficulty: 'Normal',
    duration: 6,
    tags: ['spelling', 'puzzle'],
    modes: ['solo', 'turn', 'everyone'],
    defaultMode: 'solo',
    howToPlay: [
      'Tap a clue or a square to select it.',
      'Type letters to fill the grid — correct letters turn green.',
      'Use Reveal Letter or Reveal Word for help (they cost points).',
      'Fill every square to complete the puzzle!'
    ],
    start: function (api) {
      var w = wordsData();
      var list = (w && w.crosswords) ? w.crosswords.filter(function (p) { return p && p.size && p.grid && p.clues; }) : [];
      if (!list.length) { showMissingData(api, 'Mini Crossword', 'The crossword puzzles are missing.'); return; }

      function pickPuzzle() {
        var target = api.config.difficulty === 'easy' ? 5 : (api.config.difficulty === 'hard' ? 9 : 7);
        var matches = list.filter(function (p) { return p.size === target; });
        var pool = matches.length ? matches : list;
        return FF.util.pick(pool);
      }

      var puzzle = pickPuzzle();
      var scorers = scorerEntities(api);
      if (!scorers.length) scorers = [{ id: 'p1', name: 'Player 1', avatar: null, color: '#8b5cf6' }];

      var state = {
        puzzle: puzzle,
        size: puzzle.size,
        grid: puzzle.grid,
        numberAt: {},
        cellWords: {},
        solved: {},
        totalCells: 0,
        selR: 0,
        selC: 0,
        dir: 'across',
        activeClue: null,
        activeId: scorers[0].id,
        scorers: scorers,
        mode: api.config.mode,
        busy: false,
        ended: false,
        inputs: []
      };

      // Build number map + per-cell word map + total cell count.
      var numberAt = {};
      var acrossStart = {};
      var downStart = {};
      (puzzle.clues.across || []).forEach(function (c) {
        numberAt[c.row + ',' + c.col] = c.num;
        acrossStart[c.row + ',' + c.col] = c;
      });
      (puzzle.clues.down || []).forEach(function (c) {
        numberAt[c.row + ',' + c.col] = c.num;
        downStart[c.row + ',' + c.col] = c;
      });
      state.numberAt = numberAt;

      var cellWords = {};
      for (var r = 0; r < puzzle.size; r++) {
        for (var c = 0; c < puzzle.size; c++) {
          if (puzzle.grid[r][c] == null) continue;
          var ac = null, dc = null, rr, cc;
          cc = c;
          while (cc - 1 >= 0 && puzzle.grid[r][cc - 1] != null) cc--;
          ac = acrossStart[r + ',' + cc] || null;
          rr = r;
          while (rr - 1 >= 0 && puzzle.grid[rr - 1][c] != null) rr--;
          dc = downStart[rr + ',' + c] || null;
          cellWords[r + ',' + c] = { across: ac, down: dc };
        }
      }
      state.cellWords = cellWords;

      function activeEntity() {
        for (var i = 0; i < state.scorers.length; i++) if (state.scorers[i].id === state.activeId) return state.scorers[i];
        return state.scorers[0];
      }

      function clueCells(clue, dir) {
        var cells = [];
        var rr = clue.row, cc = clue.col, grid = state.grid, size = state.size;
        var guard = 0;
        while (rr < size && cc < size && grid[rr][cc] != null && guard < size) {
          cells.push([rr, cc]);
          if (dir === 'across') cc++; else rr++;
          guard++;
        }
        return cells;
      }

      function focusCell(r, c) {
        var inp = state.inputs[r] && state.inputs[r][c];
        if (inp) { try { inp.focus(); } catch (e) {} }
      }

      function selectCell(r, c) {
        if (r < 0 || c < 0 || r >= state.size || c >= state.size) return;
        if (state.grid[r][c] == null) return;
        state.selR = r;
        state.selC = c;
        var words = state.cellWords[r + ',' + c];
        if (words) {
          if (state.dir === 'across' && words.across) state.activeClue = words.across;
          else if (state.dir === 'down' && words.down) state.activeClue = words.down;
          else if (words.across) { state.dir = 'across'; state.activeClue = words.across; }
          else if (words.down) { state.dir = 'down'; state.activeClue = words.down; }
        }
        updateHighlight();
      }

      function updateHighlight() {
        var r, c, inp;
        for (r = 0; r < state.size; r++) {
          for (c = 0; c < state.size; c++) {
            inp = state.inputs[r] && state.inputs[r][c];
            if (inp) { inp.classList.remove('selected'); inp.classList.remove('word-hl'); }
          }
        }
        inp = state.inputs[state.selR] && state.inputs[state.selR][state.selC];
        if (inp) inp.classList.add('selected');
        if (state.activeClue) {
          var cells = clueCells(state.activeClue, state.dir);
          cells.forEach(function (pair) {
            var i = state.inputs[pair[0]] && state.inputs[pair[0]][pair[1]];
            if (i) i.classList.add('word-hl');
          });
        }
        // clue buttons
        var root = api.shell.root;
        FF.ui.$$('.wg-cw-clue', root).forEach(function (b) {
          var isActive = (b.dataset.dir === state.dir) && state.activeClue && String(state.activeClue.num) === b.dataset.num;
          b.classList.toggle('active', isActive);
        });
        // player buttons
        FF.ui.$$('.wg-player-btn', root).forEach(function (b) {
          b.classList.toggle('active', b.dataset.pid === state.activeId);
        });
      }

      function fillCorrect(r, c, awardPoints) {
        var sol = state.grid[r][c];
        var inp = state.inputs[r] && state.inputs[r][c];
        if (!inp || sol == null) return;
        inp.value = sol.toUpperCase();
        inp.classList.remove('wrong');
        inp.classList.add('correct');
        inp.disabled = true;
        state.solved[r + ',' + c] = true;
        if (awardPoints) {
          var entity = activeEntity();
          var pts = applyBonus(api, 50);
          api.scoring.add(entity.id, pts, { correct: true });
          api.shell.updateScores(entity.id);
          api.audio.play('correct');
          if (state.mode === 'turn') advanceActive();
        }
      }

      function advanceActive() {
        var scorers = state.scorers;
        if (scorers.length < 2) return;
        var idx = 0;
        for (var i = 0; i < scorers.length; i++) if (scorers[i].id === state.activeId) { idx = i; break; }
        state.activeId = scorers[(idx + 1) % scorers.length].id;
      }

      function moveNext(r, c) {
        var dir = state.dir;
        var rr = r, cc = c;
        var guard = 0;
        while (guard < state.size * 2) {
          if (dir === 'across') cc++; else rr++;
          guard++;
          if (rr >= state.size || cc >= state.size) return;
          if (state.grid[rr][cc] == null) return;
          if (!state.solved[rr + ',' + cc]) { selectCell(rr, cc); focusCell(rr, cc); return; }
        }
      }

      function onCellInput(r, c, input) {
        if (state.ended) return;
        var raw = input.value;
        if (!raw) return;
        var ch = FF.util.lettersOnly(raw).charAt(0);
        var sol = state.grid[r][c];
        if (!ch || sol == null) { input.value = ''; return; }
        if (ch === sol) {
          input.value = '';
          if (state.solved[r + ',' + c]) { moveNext(r, c); return; }
          fillCorrect(r, c, true);
          checkComplete();
          moveNext(r, c);
        } else {
          input.value = ch.toUpperCase();
          input.classList.add('wrong');
          api.audio.play('wrong');
          setTimeout(function () {
            if (!state.solved[r + ',' + c]) { input.value = ''; input.classList.remove('wrong'); }
          }, 450);
        }
      }

      function onCellKey(r, c, e) {
        var key = e.key;
        var dr = 0, dc = 0, newDir = null;
        if (key === 'ArrowLeft') { dc = -1; newDir = 'across'; }
        else if (key === 'ArrowRight') { dc = 1; newDir = 'across'; }
        else if (key === 'ArrowUp') { dr = -1; newDir = 'down'; }
        else if (key === 'ArrowDown') { dr = 1; newDir = 'down'; }
        else return;
        e.preventDefault();
        if (newDir) state.dir = newDir;
        var nr = r + dr, nc = c + dc;
        if (nr < 0 || nc < 0 || nr >= state.size || nc >= state.size) return;
        if (state.grid[nr][nc] == null) return;
        selectCell(nr, nc);
        focusCell(nr, nc);
      }

      function checkComplete() {
        for (var r = 0; r < state.size; r++) {
          for (var c = 0; c < state.size; c++) {
            if (state.grid[r][c] != null && !state.solved[r + ',' + c]) return;
          }
        }
        finish(true);
      }

      function revealLetter() {
        var candidates = [];
        for (var r = 0; r < state.size; r++) {
          for (var c = 0; c < state.size; c++) {
            if (state.grid[r][c] != null && !state.solved[r + ',' + c]) candidates.push([r, c]);
          }
        }
        if (!candidates.length) return;
        var pair = FF.util.pick(candidates);
        var entity = activeEntity();
        api.scoring.subtract(entity.id, 20);
        api.shell.updateScores(entity.id);
        fillCorrect(pair[0], pair[1], false);
        api.audio.play('tap');
        api.shell.toast('Revealed a letter (-20).', 'hint');
        checkComplete();
      }

      function revealWord() {
        var entity = activeEntity();
        api.scoring.subtract(entity.id, 40);
        api.shell.updateScores(entity.id);
        var cells = state.activeClue ? clueCells(state.activeClue, state.dir) : [];
        var count = 0;
        cells.forEach(function (pair) {
          if (!state.solved[pair[0] + ',' + pair[1]]) { fillCorrect(pair[0], pair[1], false); count++; }
        });
        api.audio.play('tap');
        api.shell.toast('Revealed ' + (count || '') + ' letter(s) (-40).', 'hint');
        checkComplete();
      }

      function finish(complete) {
        if (state.ended) return;
        state.ended = true;
        api.shell.hideTimer();
        if (complete) {
          playEnd(api);
          if (FF.Confetti && FF.Confetti.burst) FF.Confetti.burst(120);
        }
        var sr = api.scoring.results();
        api.end({ results: sr.results, winnerId: sr.winnerId, bestStreak: maxStreak(sr.results) });
      }

      function onClueClick(dir, clue) {
        state.dir = dir;
        state.activeClue = clue;
        state.selR = clue.row;
        state.selC = clue.col;
        updateHighlight();
        focusCell(clue.row, clue.col);
      }

      function makeCell(r, c) {
        var letter = state.grid[r][c];
        if (letter == null) {
          return FF.ui.el('div', { class: 'wg-cw-cell wg-cw-block' });
        }
        state.totalCells++;
        var num = state.numberAt[r + ',' + c] || null;
        var holder = FF.ui.el('div', { class: 'wg-cw-cell' });
        if (num) holder.appendChild(FF.ui.el('span', { class: 'wg-cw-num' }, num));
        var input = FF.ui.el('input', {
          type: 'text', class: 'wg-cw-input', maxlength: 1, value: '',
          autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false'
        });
        input.addEventListener('input', function () { onCellInput(r, c, input); });
        input.addEventListener('keydown', function (e) { onCellKey(r, c, e); });
        input.addEventListener('focus', function () { selectCell(r, c); });
        holder.appendChild(input);
        state.inputs[r] = state.inputs[r] || [];
        state.inputs[r][c] = input;
        return holder;
      }

      function selectInitial() {
        for (var r = 0; r < state.size; r++) {
          for (var c = 0; c < state.size; c++) {
            if (state.grid[r][c] != null) {
              var words = state.cellWords[r + ',' + c];
              if (words && words.across) { state.dir = 'across'; state.activeClue = words.across; }
              else if (words && words.down) { state.dir = 'down'; state.activeClue = words.down; }
              state.selR = r;
              state.selC = c;
              return;
            }
          }
        }
      }

      function render() {
        var root = api.shell.root;
        FF.ui.clear(root);
        api.shell.hideTimer();
        api.shell.setTitle(api.def.name);

        var wrap = FF.ui.div('wg-wrap');

        if (state.scorers.length > 1) {
          var sel = FF.ui.div('wg-cw-players');
          state.scorers.forEach(function (e) {
            sel.appendChild(FF.ui.button([FF.Players.avatarEl(e, 'who-ava'), e.name], {
              class: 'wg-player-btn' + (e.id === state.activeId ? ' active' : ''),
              dataset: { pid: e.id },
              onClick: function () { state.activeId = e.id; updateHighlight(); api.audio.play('tap'); }
            }));
          });
          wrap.appendChild(sel);
          wrap.appendChild(FF.ui.div('wg-sub wg-center', state.mode === 'turn' ? 'Points rotate to the active player after each correct letter.' : 'Tap a name to choose who earns points.'));
        }

        var gridwrap = FF.ui.div('wg-cw-gridwrap');
        var gridEl = FF.ui.div('wg-cw-grid');
        gridEl.style.gridTemplateColumns = 'repeat(' + state.size + ', minmax(34px, 46px))';
        for (var r = 0; r < state.size; r++) {
          for (var c = 0; c < state.size; c++) {
            gridEl.appendChild(makeCell(r, c));
          }
        }
        gridwrap.appendChild(gridEl);
        wrap.appendChild(gridwrap);

        var controls = FF.ui.div('wg-cw-controls');
        controls.appendChild(FF.UI.button('Reveal letter (-20)', { icon: 'search',  class: 'btn', onClick: revealLetter }));
        controls.appendChild(FF.UI.button('Reveal word (-40)', { icon: 'search',  class: 'btn', onClick: revealWord }));
        controls.appendChild(FF.UI.button('Reveal puzzle', { icon: 'check',  class: 'btn danger', onClick: function () { finish(false); } }));
        wrap.appendChild(controls);

        var clues = FF.ui.div('wg-cw-clues');
        var acCol = FF.ui.div('wg-cw-clues-col');
        acCol.appendChild(FF.ui.el('h3', {}, 'Across'));
        (state.puzzle.clues.across || []).forEach(function (clue) {
          acCol.appendChild(FF.ui.el('button', {
            class: 'wg-cw-clue',
            dataset: { dir: 'across', num: String(clue.num) },
            onclick: function () { onClueClick('across', clue); }
          }, clue.num + '. ' + clue.clue));
        });
        var dnCol = FF.ui.div('wg-cw-clues-col');
        dnCol.appendChild(FF.ui.el('h3', {}, 'Down'));
        (state.puzzle.clues.down || []).forEach(function (clue) {
          dnCol.appendChild(FF.ui.el('button', {
            class: 'wg-cw-clue',
            dataset: { dir: 'down', num: String(clue.num) },
            onclick: function () { onClueClick('down', clue); }
          }, clue.num + '. ' + clue.clue));
        });
        clues.appendChild(acCol);
        clues.appendChild(dnCol);
        wrap.appendChild(clues);

        root.appendChild(wrap);
        selectInitial();
        updateHighlight();
        focusCell(state.selR, state.selC);
      }

      render();
    }
  });
})();
