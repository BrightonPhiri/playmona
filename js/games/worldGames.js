/* ============================================================
   FAMILY FUN — worldGames.js
   World category games (read FF.data.countries):
     · Where in the World?   (flag / landmark / food / capital clues)
     · Map Challenge          (continent / borders / capital)
     · Capital Challenge      (country -> capital)
     · Guess the Flag         (fast flag identification)
   Classic script (no ES modules). Offline, family-friendly.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  /* The engine registers games via FF.Games.register; expose the
     FF.registerGame(...) helper described in the dev contract. */
  if (typeof FF.registerGame !== 'function') {
    if (FF.Games && typeof FF.Games.register === 'function') {
      FF.registerGame = FF.Games.register;
    }
  }

  /* ============================================================
     Shared constants & helpers
     ============================================================ */
  var SPEED_MS = 2500;      // "fast" threshold for the +50 speed bonus
  var SPEED_BONUS = 50;

  function allCountries() {
    var c = FF.data && FF.data.countries;
    if (!Array.isArray(c)) return [];
    return c.filter(function (x) { return x && x.name; });
  }

  function hasData() {
    return allCountries().length >= 4;
  }

  function countryHas(c, field) {
    return !!(c && c[field] && Array.isArray(c[field]) && c[field].length);
  }

  function uniqueStrings(list) {
    var seen = {};
    var out = [];
    list.forEach(function (s) {
      if (s != null && String(s).length && !seen[s]) { seen[s] = true; out.push(String(s)); }
    });
    return out;
  }

  function uniqueValues(pool, field) {
    return uniqueStrings(pool.map(function (c) { return c && c[field]; }));
  }

  // Pick `n` countries whose NAME is not in `excludeNames`.
  function sampleDistractorCountries(pool, excludeNames, n) {
    var seen = {};
    (excludeNames || []).forEach(function (nm) { seen[nm] = true; });
    var sh = FF.util.shuffle(pool);
    var out = [];
    for (var i = 0; i < sh.length && out.length < n; i++) {
      var c = sh[i];
      if (c && c.name && !seen[c.name]) { out.push(c); seen[c.name] = true; }
    }
    return out;
  }

  // Build 4 shuffled options (correct + distractors) with answer index.
  function makeOptionsFromNames(correctText, distractorTexts) {
    var seen = {};
    seen[correctText] = true;
    var dists = [];
    (distractorTexts || []).forEach(function (s) {
      var v = (s == null) ? '' : String(s);
      if (v.length && !seen[v]) { dists.push(v); seen[v] = true; }
    });
    var opts = [correctText].concat(dists);
    opts = FF.util.shuffle(opts);
    return { options: opts, answer: opts.indexOf(correctText) };
  }

  function bonusMultiplier(api) {
    var d = api.config.difficulty || 'normal';
    if (d === 'easy') return 1;
    if (d === 'hard') return 2;
    return 1.5;
  }

  function basePoints(api) {
    return Math.round(100 * bonusMultiplier(api));
  }

  function computePoints(api, elapsedMs) {
    var base = basePoints(api);
    var speed = (elapsedMs != null && elapsedMs <= SPEED_MS) ? SPEED_BONUS : 0;
    return base + speed;
  }

  function renderFlagNode(api, country, size) {
    var code = (FF.data && FF.data.flagCodes) ? FF.data.flagCodes[country && country.id] : null;
    var f = api.flags.render(country && country.flag, {
      code: code,
      cls: 'wg-flag-svg',
      alt: (country && country.name) ? country.name + ' flag' : 'Flag'
    });
    var w = size || 220;
    f.style.width = w + 'px';
    f.style.height = Math.round(w * 2 / 3) + 'px';
    f.style.maxWidth = '100%';
    return f;
  }

  function div(cls, children) { return FF.ui.div(cls, children); }
  function span(cls, children) { return FF.ui.span(cls, children); }

  /* ---------- Style injection (once) ---------- */
  var STYLE_READY = false;
  function ensureStyles() {
    if (STYLE_READY) return;
    STYLE_READY = true;
    if (!document || !document.head) return;
    var style = document.createElement('style');
    style.id = 'world-games-style';
    style.textContent = [
      '.wg-wrap{display:flex;flex-direction:column;gap:16px;max-width:780px;margin:0 auto;width:100%;}',
      '.wg-head{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;}',
      '.wg-round{font-weight:800;color:var(--muted,#6b7280);}',
      '.wg-turn{font-weight:700;display:flex;align-items:center;gap:6px;}',
      '.wg-turn .wg-ava{font-size:1.3rem;}',
      '.wg-prompt{text-align:center;}',
      '.wg-prompt-title{font-size:1.4rem;font-weight:800;line-height:1.3;margin-bottom:12px;}',
      '.wg-flag{display:flex;justify-content:center;margin:6px 0;}',
      '.wg-options{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;}',
      '.wg-option{flex:1 1 calc(50% - 12px);min-width:210px;display:flex;align-items:center;gap:10px;padding:14px 16px;font-size:1.05rem;font-weight:700;text-align:left;border-radius:14px;background:var(--surface-2,#f1eef9);color:var(--text,#211e33);border:1px solid var(--border,#e7e3f2);}',
      '.wg-option:hover{background:var(--surface,#ffffff);box-shadow:var(--shadow,0 6px 24px rgba(38,30,70,.08));}',
      '.wg-option__letter{background:var(--accent-soft,rgba(139,92,246,.16));color:var(--accent,#8b5cf6);font-weight:800;border-radius:8px;padding:2px 9px;}',
      '.wg-option__label{flex:1;}',
      '.wg-fb{text-align:center;display:flex;flex-direction:column;gap:14px;align-items:center;}',
      '.wg-fb-result{font-size:1.6rem;font-weight:800;}',
      '.wg-correct{color:var(--success,#10b981);}',
      '.wg-wrong{color:var(--danger,#ef4444);}',
      '.wg-fb-points{color:var(--accent,#8b5cf6);font-weight:800;font-size:1.2rem;}',
      '.wg-fb-answer{font-weight:700;}'
    ].join('\n');
    document.head.appendChild(style);
  }

  /* ---------- Friendly guards ---------- */
  function showFriendlyMessage(api, title, message) {
    var root = api.shell.root;
    FF.ui.clear(root);
    var box = div('panel');
    box.style.textAlign = 'center';
    box.style.margin = '30px auto';
    box.style.maxWidth = '540px';
    box.appendChild(FF.ui.el('h2', {}, title));
    box.appendChild(FF.ui.el('p', {}, message));
    box.appendChild(FF.ui.button('🏠 Exit', {
      class: 'btn btn-lg', primary: true,
      onClick: function () { FF.Audio.play('click'); FF.GameFlow.exitToHome(); }
    }));
    root.appendChild(box);
  }

  function showMissingData(api) {
    showFriendlyMessage(
      api,
      '🌍 World games need country data',
      'The country data file could not be found or is empty. Add country data (js/data/countries.js) to play the World games.'
    );
  }

  /* ============================================================
     Shared turn-based trivia engine
     ============================================================ */
  function buildResults(api, totalCorrect, totalAnswered) {
    var ranked = api.scoring.ranked();
    var winner = ranked.length ? ranked[0] : null;
    var bestStreak = 0;
    var fastestMs = null;
    ranked.forEach(function (r) {
      if (r.bestStreak > bestStreak) bestStreak = r.bestStreak;
      if (r.fastest != null && (fastestMs == null || r.fastest < fastestMs)) fastestMs = r.fastest;
    });
    var achievements = [];
    if (totalCorrect >= 10) { achievements.push('explorer'); achievements.push('brainBox'); }
    if (totalAnswered > 0 && totalCorrect === totalAnswered) achievements.push('perfect');
    if (bestStreak >= 5) achievements.push('streak5');
    if (bestStreak >= 10) achievements.push('streak10');
    if (fastestMs != null && fastestMs <= 1000) achievements.push('fastest');
    return {
      results: ranked,
      winnerId: winner ? winner.id : null,
      bestStreak: bestStreak,
      fastest: fastestMs != null ? fastestMs / 1000 : null,
      quizCorrect: totalCorrect,
      quizAnswered: totalAnswered,
      achievements: achievements
    };
  }

  function runTrivia(api, opts) {
    var root = api.shell.root;
    FF.ui.clear(root);

    var scorers = api.config.scorers || [];
    if (!scorers.length) { showMissingData(api); return; }
    var pool = allCountries();
    if (pool.length < 4) { showMissingData(api); return; }

    var roundCount = opts.rounds || 8;
    var order = scorers.slice();
    if (api.config.randomOrder && order.length > 1) order = FF.util.shuffle(order);

    var roundIndex = 0;
    var totalCorrect = 0;
    var totalAnswered = 0;
    var roundStart = 0;
    var answered = false;
    var currentQuestion = null;

    // ---- Race support. Offline this is all inert. ----
    var racing = !!(FF.Race && FF.Race.active && FF.Race.active());
    var offSettle = null;

    if (racing) {
      FF.Race.begin(api.def.id, {
        rounds: roundCount,
        timerMs: (api.config.timer || 0) * 1000,
        pointsFor: function (answer) { return computePoints(api, answer.ms); }
      });
      offSettle = FF.Race.onSettle(function (payload) {
        answered = true;
        api.shell.hideTimer();
        if (payload.winnerId) { totalCorrect++; }
        totalAnswered++;
        FF.Race.syncScoring();
        api.shell.updateScores();
        renderRaceFeedback(currentQuestion, payload);
      });
    }

    // In a room everyone plays every round on their own device, so the
    // 'active' scorer is always this device rather than a rotating turn.
    function activeScorer() {
      if (racing) {
        var me = FF.Room.current();
        var mine = me && order.filter(function (sc) { return sc.id === me.uid; })[0];
        return mine || order[0];
      }
      return order[roundIndex % order.length];
    }

    function finish() {
      api.shell.hideTimer();
      if (offSettle) { offSettle(); offSettle = null; }
      if (racing) FF.Race.end();
      api.shell.updateScores();
      api.end(buildResults(api, totalCorrect, totalAnswered));
    }

    function renderRound() {
      answered = false;
      if (racing) FF.Race.beginRound(roundIndex);
      var scorer = activeScorer();
      api.shell.updateScores(scorer.id);

      try {
        currentQuestion = opts.buildQuestion(roundIndex);
      } catch (e) {
        finish();
        return;
      }
      if (!currentQuestion || !currentQuestion.options || currentQuestion.options.length < 2) {
        finish();
        return;
      }

      FF.ui.clear(root);
      var wrap = div('wg-wrap');

      var head = div('wg-head');
      head.appendChild(div('wg-round', 'ROUND ' + (roundIndex + 1) + ' / ' + roundCount));
      // In a room nobody takes turns - everyone races the same question.
      if (racing) {
        head.appendChild(div('wg-turn', '🏁 Everyone races'));
      } else {
        head.appendChild(div('wg-turn', [span('wg-ava', scorer.avatar || '😀'), scorer.name]));
      }
      wrap.appendChild(head);

      var prompt = div('wg-prompt');
      prompt.appendChild(div('wg-prompt-title', currentQuestion.promptTitle || ''));
      if (currentQuestion.flagNode) {
        var fwrap = div('wg-flag');
        fwrap.appendChild(currentQuestion.flagNode);
        prompt.appendChild(fwrap);
      }
      wrap.appendChild(prompt);

      var optionsWrap = div('wg-options');
      var letters = ['A', 'B', 'C', 'D', 'E'];
      currentQuestion.options.forEach(function (optText, i) {
        var b = FF.ui.button('', {
          class: 'wg-option',
          ariaLabel: String(optText),
          onClick: (function (idx) { return function () { handleAnswer(idx); }; })(i)
        });
        b.appendChild(span('wg-option__letter', letters[i] || String(i + 1)));
        b.appendChild(span('wg-option__label', String(optText)));
        optionsWrap.appendChild(b);
      });
      wrap.appendChild(optionsWrap);

      wrap.appendChild(div('hint', 'Correct answer = ' + basePoints(api) + ' points · Speed bonus +' + SPEED_BONUS + ' if fast!'));

      root.appendChild(wrap);
      if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(root);

      roundStart = Date.now();
      if (api.config.timer > 0) {
        api.shell.setTimer(api.config.timer, function () { handleAnswer(null); });
      } else {
        api.shell.hideTimer();
      }
    }

    function handleAnswer(choiceIndex) {
      if (answered) return;
      var elapsed = Date.now() - roundStart;
      var q = currentQuestion;
      var correct = (choiceIndex != null && choiceIndex === q.answer);

      if (racing) {
        // The race decides the round. A wrong answer only locks this
        // device out; everyone else keeps playing.
        FF.Race.submit(choiceIndex, correct, elapsed);
        if (!correct) FF.RaceUI.lockOut(root, '.wg-option');
        return;
      }

      answered = true;
      api.shell.hideTimer();
      var scorer = activeScorer();
      totalAnswered++;
      var points = 0;
      if (correct) {
        totalCorrect++;
        points = computePoints(api, elapsed);
        api.scoring.add(scorer.id, points, { correct: true, fastest: elapsed });
        api.audio.play('correct');
      } else {
        api.scoring.markAnswer(scorer.id, false, elapsed);
        api.audio.play('wrong');
      }
      api.shell.updateScores(scorer.id);
      renderFeedback(q, correct, points);
    }

    function renderRaceFeedback(q, payload) {
      FF.RaceUI.result(root, {
        payload: payload,
        answerText: (q && q.answerText != null) ? q.answerText : '',
        isLast: (roundIndex + 1) >= roundCount,
        onNext: function () {
          roundIndex++;
          if (roundIndex >= roundCount) finish();
          else renderRound();
        }
      });
    }

    function renderFeedback(q, correct, points) {
      FF.ui.clear(root);
      var wrap = div('wg-fb');

      var result = div('wg-fb-result');
      if (correct) {
        result.textContent = '✅ Correct!';
        result.classList.add('wg-correct');
      } else {
        result.textContent = '❌ Not quite';
        result.classList.add('wg-wrong');
      }
      wrap.appendChild(result);

      if (correct && points > 0) {
        wrap.appendChild(div('wg-fb-points', '+' + points + ' points'));
      }

      var answerLine = correct ? 'Answer: ' : 'The answer was ';
      wrap.appendChild(div('wg-fb-answer', answerLine + (q.answerText != null ? q.answerText : '')));

      if (q.feedbackFlagNode) {
        var fwrap = div('wg-flag');
        fwrap.appendChild(q.feedbackFlagNode);
        wrap.appendChild(fwrap);
      }

      var isLast = (roundIndex + 1) >= roundCount;
      var next = FF.Advance.button(isLast ? '🏆 See Results' : 'Next ➜', function () {
        api.audio.play('select');
        roundIndex++;
        if (roundIndex >= roundCount) finish();
        else renderRound();
      }, { class: 'btn btn-lg' });
      wrap.appendChild(next);

      root.appendChild(wrap);
      if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(root);
    }

    renderRound();
  }

  function startWorldGame(api, opts) {
    ensureStyles();
    if (!hasData()) { showMissingData(api); return; }
    FF.safe(function () { runTrivia(api, opts); }, function () {
      showFriendlyMessage(api, '😅 Oops!', 'Something went wrong starting this game. Please try again.');
    });
  }

  /* ============================================================
     Question builders
     ============================================================ */

  /* --- Where in the World? : flag / landmark / food / capital --- */
  function whereInWorldBuilder(api) {
    var pool = allCountries();
    var seq = [];
    if (pool.some(function (c) { return c.capital; })) seq.push('capital');
    if (pool.some(function (c) { return c.flag; })) seq.push('flag');
    if (pool.some(function (c) { return countryHas(c, 'landmarks'); })) seq.push('landmark');
    if (pool.some(function (c) { return countryHas(c, 'food'); })) seq.push('food');
    if (!seq.length) seq.push('flag');
    seq = FF.util.shuffle(seq);

    return function (roundIndex) {
      var type = seq[roundIndex % seq.length];
      var correct = null;
      var promptTitle = '';

      if (type === 'landmark') {
        var lmPool = pool.filter(function (c) { return countryHas(c, 'landmarks'); });
        correct = FF.util.pick(lmPool);
        var lm = FF.util.pick(correct.landmarks.filter(function (l) { return l; }));
        promptTitle = 'This country is home to the ' + lm + '.';
      } else if (type === 'food') {
        var fdPool = pool.filter(function (c) { return countryHas(c, 'food'); });
        correct = FF.util.pick(fdPool);
        var fd = FF.util.pick(correct.food.filter(function (f) { return f; }));
        promptTitle = 'This country is known for ' + fd + '.';
      } else if (type === 'flag') {
        var flPool = pool.filter(function (c) { return c.flag; });
        correct = FF.util.pick(flPool);
        promptTitle = 'Which country does this flag belong to?';
      } else {
        var capPool = pool.filter(function (c) { return c.capital; });
        correct = FF.util.pick(capPool);
        promptTitle = 'Which country has the capital ' + correct.capital + '?';
      }

      var others = sampleDistractorCountries(pool, [correct.name], 3);
      var made = makeOptionsFromNames(correct.name, others.map(function (c) { return c.name; }));
      return {
        promptTitle: promptTitle,
        flagNode: (type === 'flag') ? renderFlagNode(api, correct, 240) : null,
        options: made.options,
        answer: made.answer,
        answerText: correct.name,
        feedbackFlagNode: renderFlagNode(api, correct, 180)
      };
    };
  }

  /* --- Map Challenge : continent / borders / capital --- */
  function mapChallengeBuilder(api) {
    var pool = allCountries();
    var continents = uniqueValues(pool, 'continent');
    var seq = [];
    if (pool.some(function (c) { return c.capital; })) seq.push('capital');
    if (continents.length >= 4) seq.push('continent');
    var neighborPool = pool.filter(function (c) {
      return countryHas(c, 'neighbors') && (pool.length - c.neighbors.length - 1) >= 3;
    });
    if (neighborPool.length) seq.push('neighbor');
    if (!seq.length) seq.push('capital');
    seq = FF.util.shuffle(seq);

    return function (roundIndex) {
      var type = seq[roundIndex % seq.length];

      if (type === 'continent') {
        var correct = FF.util.pick(pool);
        var otherContinents = FF.util.shuffle(
          continents.filter(function (ct) { return ct !== correct.continent; })
        ).slice(0, 3);
        var made = makeOptionsFromNames(correct.continent, otherContinents);
        return {
          promptTitle: 'Which continent is ' + correct.name + ' in?',
          flagNode: null,
          options: made.options,
          answer: made.answer,
          answerText: correct.continent,
          feedbackFlagNode: renderFlagNode(api, correct, 180)
        };
      }

      if (type === 'neighbor') {
        var subject = FF.util.pick(neighborPool);
        var neighborName = FF.util.pick(subject.neighbors.filter(function (n) { return n; }));
        var exclude = [subject.name].concat(subject.neighbors);
        var others = sampleDistractorCountries(pool, exclude, 3);
        var madeN = makeOptionsFromNames(neighborName, others.map(function (c) { return c.name; }));
        return {
          promptTitle: 'Which country borders ' + subject.name + '?',
          flagNode: null,
          options: madeN.options,
          answer: madeN.answer,
          answerText: neighborName,
          feedbackFlagNode: renderFlagNode(api, subject, 180)
        };
      }

      // capital reverse (default)
      var capPool = pool.filter(function (c) { return c.capital; });
      var correctC = FF.util.pick(capPool);
      var othersC = sampleDistractorCountries(pool, [correctC.name], 3);
      var madeC = makeOptionsFromNames(correctC.name, othersC.map(function (c) { return c.name; }));
      return {
        promptTitle: 'Which country is ' + correctC.capital + ' the capital of?',
        flagNode: null,
        options: madeC.options,
        answer: madeC.answer,
        answerText: correctC.name,
        feedbackFlagNode: renderFlagNode(api, correctC, 180)
      };
    };
  }

  /* --- Capital Challenge : country -> capital --- */
  function capitalChallengeBuilder(api) {
    var pool = allCountries();
    var capPool = pool.filter(function (c) { return c.capital; });
    return function () {
      var correct = FF.util.pick(capPool);
      var others = sampleDistractorCountries(capPool, [correct.name], 3);
      var otherCaps = others.map(function (c) { return c.capital; });
      var made = makeOptionsFromNames(correct.capital, otherCaps);
      return {
        promptTitle: 'Which is the capital of ' + correct.name + '?',
        flagNode: null,
        options: made.options,
        answer: made.answer,
        answerText: correct.capital,
        feedbackFlagNode: renderFlagNode(api, correct, 180)
      };
    };
  }

  /* --- Guess the Flag : fast flag identification --- */
  function guessFlagBuilder(api) {
    var pool = allCountries().filter(function (c) { return c.flag; });
    return function () {
      var correct = FF.util.pick(pool);
      var others = sampleDistractorCountries(pool, [correct.name], 3);
      var made = makeOptionsFromNames(correct.name, others.map(function (c) { return c.name; }));
      return {
        promptTitle: 'WHICH FLAG?',
        flagNode: renderFlagNode(api, correct, 260),
        options: made.options,
        answer: made.answer,
        answerText: correct.name,
        feedbackFlagNode: renderFlagNode(api, correct, 180)
      };
    };
  }

  /* ============================================================
     Register the four games
     ============================================================ */

  FF.registerGame({
    id: 'whereInWorld',
    name: 'Where in the World?',
    description: 'Follow the clues — flags, landmarks, foods and capitals — to guess the country.',
    category: 'world',
    icon: '🌍',
    players: [1, 8],
    difficulty: 'Normal',
    duration: 5,
    tags: ['quick'],
    modes: ['solo', 'turn', 'team'],
    defaultMode: 'turn',
    howToPlay: [
      'Read the clue about a mystery country.',
      'Pick the right country from four choices.',
      'Correct answers earn points — be fast for a bonus!',
      'The next clue follows automatically.'
    ],
    start: function (api) {
      startWorldGame(api, { rounds: 8, buildQuestion: whereInWorldBuilder(api) });
    }
  });

  FF.registerGame({
    id: 'mapChallenge',
    name: 'Map Challenge',
    description: 'A geography challenge — continents, borders and capital cities.',
    category: 'world',
    icon: '🗺️',
    players: [1, 8],
    difficulty: 'Hard',
    duration: 5,
    tags: ['hard'],
    modes: ['solo', 'turn', 'team'],
    defaultMode: 'turn',
    howToPlay: [
      'Answer geography questions about continents, borders and capitals.',
      'Choose from four options.',
      'Hard difficulty doubles your points.',
      'The next question follows automatically.'
    ],
    start: function (api) {
      startWorldGame(api, { rounds: 8, buildQuestion: mapChallengeBuilder(api) });
    }
  });

  FF.registerGame({
    id: 'capitalChallenge',
    name: 'Capital Challenge',
    description: 'Name the capital city of each country.',
    category: 'world',
    icon: '🏙️',
    players: [1, 8],
    difficulty: 'Normal',
    duration: 4,
    tags: ['quick'],
    modes: ['solo', 'turn', 'team'],
    defaultMode: 'turn',
    howToPlay: [
      'A country name appears on screen.',
      'Pick its capital city from four choices.',
      'Correct answers earn points — be fast for a bonus!',
      'The next question follows automatically.'
    ],
    start: function (api) {
      startWorldGame(api, { rounds: 8, buildQuestion: capitalChallengeBuilder(api) });
    }
  });

  FF.registerGame({
    id: 'guessFlag',
    name: 'Guess the Flag',
    description: 'Fast flag identification — how many can you name?',
    category: 'world',
    icon: '🚩',
    players: [1, 8],
    difficulty: 'Easy',
    duration: 4,
    tags: ['quick'],
    modes: ['solo', 'turn', 'team'],
    defaultMode: 'turn',
    howToPlay: [
      'A big flag appears on screen.',
      'Pick the matching country from four choices.',
      'Answer fast for a speed bonus!',
      'The next flag follows automatically.'
    ],
    start: function (api) {
      startWorldGame(api, { rounds: 10, buildQuestion: guessFlagBuilder(api) });
    }
  });
})();
