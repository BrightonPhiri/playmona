/* ============================================================
   PLAYMONA — numberGames.js
   Number Challenge (mental maths) & Higher or Lower
   Classic script, global FF namespace, no ES modules / network.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  // The engine documents `FF.registerGame` but currently exposes the
  // registry as `FF.Games.register`. Provide the alias once, safely, so
  // games below can use the documented API.
  if (typeof FF.registerGame !== 'function') {
    FF.registerGame = function (def) { return FF.Games.register(def); };
  }

  /* ================= shared helpers ================= */

  // Difficulty bonus: easy ×1, normal ×1.5, hard ×2.
  function bonusMultiplier(diff) {
    if (diff === 'hard') return 2;
    if (diff === 'normal') return 1.5;
    return 1;
  }

  // Speed bonus: up to +50 for very fast answers, fading to 0 by 15s.
  function speedBonus(elapsedMs) {
    if (elapsedMs == null) return 0;
    var t = elapsedMs / 1000;
    if (t <= 2) return 50;
    var bonus = Math.round(50 * (1 - (t - 2) / 13));
    return Math.max(0, Math.min(50, bonus));
  }

  // Build the correct answer plus 3 unique, non-negative distractors.
  function buildOptions(answer, hints) {
    var seen = {};
    var out = [];
    function tryAdd(v) {
      if (out.length >= 3) return;
      v = Math.round(v);
      if (v < 0) return;
      if (v === answer) return;
      if (seen[v]) return;
      seen[v] = true;
      out.push(v);
    }
    (hints || []).forEach(function (h) {
      if (h == null) return;
      tryAdd(h);
      tryAdd(h + 1);
      tryAdd(h - 1);
    });
    var offs = [1, -1, 2, -2, 3, -3, 5, -5, 10, -10, 7, -7, 12, -12, 20, -20];
    offs.forEach(function (o) { tryAdd(answer + o); });
    var n = 1;
    while (out.length < 3) {
      tryAdd(answer + n);
      tryAdd(answer - n);
      n++;
    }
    return FF.util.shuffle([answer].concat(out));
  }

  // Generate one mental-maths question for the given difficulty.
  function numberQuestion(diff) {
    var type, max;
    if (diff === 'easy') {
      max = 20;
      type = FF.util.pick(['add', 'sub', 'missing']);
    } else if (diff === 'hard') {
      max = 500;
      type = FF.util.pick(['add', 'sub', 'mul', 'div', 'missing', 'sequence']);
    } else {
      max = 100;
      type = FF.util.pick(['add', 'sub', 'mul', 'div', 'missing', 'sequence']);
    }

    var a, b, answer, text;
    var hints = [];

    if (type === 'add') {
      a = FF.util.int(1, max);
      b = FF.util.int(1, max);
      answer = a + b;
      text = a + ' + ' + b + ' = ?';
      hints = [a + b - 1, a + b + 10, Math.abs(a - b), a + b + 1];
    } else if (type === 'sub') {
      a = FF.util.int(2, max);
      b = FF.util.int(1, a);
      answer = a - b;
      text = a + ' - ' + b + ' = ?';
      hints = [a - b + 1, a + b, a - b - 2, b];
    } else if (type === 'mul') {
      var maxF = (diff === 'hard') ? 12 : 10;
      a = FF.util.int(2, maxF);
      b = FF.util.int(2, maxF);
      answer = a * b;
      text = a + ' × ' + b + ' = ?';
      hints = [a * (b + 1), a * (b - 1), (a + 1) * b, (a - 1) * b];
    } else if (type === 'div') {
      var maxD = (diff === 'hard') ? 12 : 10;
      var d = FF.util.int(2, maxD);
      var q = FF.util.int(2, maxD);
      answer = q;
      text = (d * q) + ' ÷ ' + d + ' = ?';
      hints = [q + 1, q - 1, d, q + 2, q - 2];
    } else if (type === 'missing') {
      var variant = FF.util.int(1, 3);
      if (variant === 1) {
        a = FF.util.int(1, max);
        b = FF.util.int(1, max);
        answer = b;
        text = a + ' + ? = ' + (a + b);
        hints = [b + 1, b - 1, a, b + 2];
      } else if (variant === 2) {
        a = FF.util.int(2, max);
        b = FF.util.int(1, a);
        answer = a - b;
        text = a + ' - ? = ' + b;
        hints = [b, a - b + 1, a - b - 1, a + b];
      } else {
        a = FF.util.int(1, max);
        b = FF.util.int(1, max);
        answer = a + b;
        text = '? - ' + b + ' = ' + a;
        hints = [a + b + 1, a + b - 1, a + 1, b];
      }
    } else {
      // number sequence
      var start = FF.util.int(1, (diff === 'hard' ? 100 : 40));
      var step = FF.util.int(1, (diff === 'hard' ? 20 : 8));
      var terms = [start, start + step, start + 2 * step, start + 3 * step];
      answer = start + 4 * step;
      text = terms.join(', ') + ', ?';
      hints = [start + 3 * step, answer + step, start + 5 * step, start + 2 * step];
    }

    answer = Math.round(answer);
    if (answer < 0) answer = Math.abs(answer);
    return { type: type, text: text, answer: answer, options: buildOptions(answer, hints) };
  }

  // Random current/next pair for Higher or Lower (guaranteed different).
  function drawPair() {
    var current = FF.util.int(1, 100);
    var next = FF.util.int(1, 100);
    var guard = 0;
    while (next === current && guard < 50) {
      next = FF.util.int(1, 100);
      guard++;
    }
    if (next === current) next = current < 100 ? current + 1 : current - 1;
    return { current: current, next: next };
  }

  // Friendly guard when there are no scorers (should not normally happen).
  function renderNoPlayers(api) {
    FF.GameUI.exitCard(api, FF.t('noPlayers', 'No players yet'), FF.t('noPlayersText', 'Add players on your Profile to play this game.'));
  }

  // Round, whose turn and streak, above every question.
  function topBar(api, state, active, showZero) {
    var bar = FF.GameUI.turnBar(active, FF.t('roundOf', 'Round {n} of {total}', { n: state.round + 1, total: state.total }));
    var rec = api.scoring.record(active.id);
    var streak = rec ? rec.streak : 0;
    if (streak > 0 || showZero) bar.appendChild(FF.GameUI.pill(FF.t('streakN', 'Streak {n}', { n: streak }), 'flame'));
    return bar;
  }

  /* ================= Game 1: Number Challenge ================= */

  function startNumberChallenge(api) {
    var scorers = api.config.scorers;
    if (!scorers || !scorers.length) { renderNoPlayers(api); return; }
    var state = {
      round: 0,
      total: 10,
      correct: 0,
      answered: 0,
      locked: false,
      q: null,
      fb: null,
      // ---- Race support. Offline this stays null and nothing changes. ----
      race: FF.Race ? FF.Race.forGame(api, { rounds: 10, optionSelector: '.nc-option' }) : null,
      offSettle: null
    };
    api.audio.play('roundStart');
    renderNumberChallenge(api, state);
  }

  function renderNumberChallenge(api, state) {
    var scorers = api.config.scorers;
    var active = scorers[state.round % scorers.length];
    if (state.race) {
      // In a room nobody takes turns - everyone races the same question.
      state.race.beginRound(state.round);
      var me = FF.Room.current();
      active = scorers.filter(function (sc) { return sc.id === me.uid; })[0] || scorers[0];
    }
    var q = numberQuestion(api.config.difficulty || 'normal');
    var startedAt = Date.now();
    state.locked = false;
    state.q = q;

    var root = api.shell.root;
    FF.ui.clear(root);

    var wrap = FF.GameUI.stage({ className: 'nc-wrap' });
    wrap.appendChild(topBar(api, state, active));
    wrap.appendChild(FF.ui.el('h2', { class: 'gm-big', 'aria-label': q.text.replace(/×/g, ' times ').replace(/÷/g, ' divided by ').replace(/−/g, ' minus ') }, q.text));

    var grid = FF.GameUI.options({ columns: 2, className: 'nc-options' });
    q.options.forEach(function (opt, i) {
      var b = FF.GameUI.option(String(opt), function () { answerNumberChallenge(api, state, opt, q, active, startedAt); }, i, { className: 'nc-option' });
      b.dataset.value = String(opt);
      grid.appendChild(b);
    });
    wrap.appendChild(grid);

    var fb = FF.ui.el('div', { class: 'nc-feedback', 'aria-live': 'polite' });
    wrap.appendChild(fb);
    state.fb = fb;

    root.appendChild(wrap);
    api.shell.updateScores(active.id);
    if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(root);

    function openRound() {
      startedAt = Date.now();
      if (api.config.timer > 0) {
        api.shell.setTimer(api.config.timer, function () { timeoutNumberChallenge(api, state, q, active); });
      } else {
        api.shell.hideTimer();
      }
    }

    if (state.race) {
      // Hold every device until the round's shared instant, and settle it
      // for everyone at once.
      api.shell.hideTimer();
      state.race.gate(openRound);

      if (state.offSettle) state.offSettle();
      state.offSettle = state.race.onSettle(function (payload) {
        if (state.locked) return;
        state.locked = true;
        api.shell.hideTimer();
        state.race.showResult(payload, {
          answerText: String(q.answer),
          isLast: (state.round + 1) >= state.total,
          onNext: function () { nextNumberChallenge(api, state); }
        });
      });
    } else {
      openRound();
    }
  }

  function showFeedback(holder, kind, text) {
    FF.ui.clear(holder);
    holder.appendChild(FF.GameUI.feedback(kind, text));
  }

  function markNumberButtons(api, q, chosen) {
    FF.util.$$('.nc-option', api.shell.root).forEach(function (b) {
      b.disabled = true;
      var val = Number(b.dataset.value);
      if (val === q.answer) FF.GameUI.markOption(b, 'correct');
      else if (chosen != null && val === chosen) FF.GameUI.markOption(b, 'wrong');
      else FF.GameUI.markOption(b, 'dim');
    });
  }

  function answerNumberChallenge(api, state, chosen, q, active, startedAt) {
    if (state.locked) return;
    var elapsed = Date.now() - startedAt;

    if (state.race) {
      // The race decides the round; a wrong answer only locks this device
      // out while everyone else keeps playing.
      state.race.submit(null, chosen === q.answer, elapsed);
      return;
    }

    state.locked = true;
    api.shell.hideTimer();
    markNumberButtons(api, q, chosen);

    var correct = chosen === q.answer;
    if (correct) {
      var points = Math.round((100 + speedBonus(elapsed)) * bonusMultiplier(api.config.difficulty || 'normal'));
      api.scoring.add(active.id, points, { correct: true, fastest: elapsed });
      state.correct++;
      api.audio.play('correct');
      if (state.fb) showFeedback(state.fb, 'good', FF.GameUI.correctText(points));
    } else {
      api.scoring.markAnswer(active.id, false);
      api.audio.play('wrong');
      if (state.fb) showFeedback(state.fb, 'bad', FF.t('notQuiteAnswer', 'Not quite. The answer is {answer}.', { answer: q.answer }));
    }
    state.answered++;
    api.shell.updateScores(active.id);

    var delay = correct ? 800 : 1600;
    setTimeout(function () {
      if (!FF.GameFlow.current) return;
      nextNumberChallenge(api, state);
    }, delay);
  }

  function timeoutNumberChallenge(api, state, q, active) {
    if (state.locked) return;
    state.locked = true;
    api.shell.hideTimer();
    markNumberButtons(api, q, null);
    api.scoring.markAnswer(active.id, false);
    api.audio.play('wrong');
    if (state.fb) showFeedback(state.fb, 'bad', FF.t('timeUpAnswer', 'Time’s up! The answer is {answer}.', { answer: q.answer }));
    state.answered++;
    api.shell.updateScores(active.id);
    setTimeout(function () {
      if (!FF.GameFlow.current) return;
      nextNumberChallenge(api, state);
    }, 1600);
  }

  function nextNumberChallenge(api, state) {
    state.round++;
    if (state.round >= state.total) {
      finishNumberChallenge(api, state);
    } else {
      renderNumberChallenge(api, state);
    }
  }

  function finishNumberChallenge(api, state) {
    api.shell.hideTimer();
    if (state.offSettle) { state.offSettle(); state.offSettle = null; }
    if (state.race) state.race.end();
    var ranked = api.scoring.ranked();
    var bestStreak = 0;
    var fastestMs = null;
    api.config.scorers.forEach(function (s) {
      var r = api.scoring.record(s.id);
      if (!r) return;
      if (r.bestStreak > bestStreak) bestStreak = r.bestStreak;
      if (r.fastest != null && (fastestMs == null || r.fastest < fastestMs)) fastestMs = r.fastest;
    });
    var ach = [];
    if (bestStreak >= 5) ach.push('streak5');
    if (bestStreak >= 10) ach.push('streak10');
    if (state.correct === state.total && state.total > 0) ach.push('perfect');
    var res = {
      results: ranked,
      winnerId: ranked.length ? ranked[0].id : null,
      bestStreak: bestStreak,
      quizCorrect: state.correct,
      quizAnswered: state.answered,
      achievements: ach
    };
    if (fastestMs != null) res.fastest = fastestMs / 1000;
    api.end(res);
  }

  FF.registerGame({
    id: 'numberChallenge',
    name: 'Number Challenge',
    description: 'Quick mental maths: sums, missing numbers and number sequences.',
    category: 'numbers',
    icon: '🔢',
    players: [1, 8],
    difficulty: 'Normal',
    duration: 5,
    tags: ['maths', 'quick'],
    modes: ['solo', 'turn', 'team'],
    defaultMode: 'turn',
    howToPlay: [
      'Answer the maths question shown on screen.',
      'Pick the correct answer from the four choices.',
      'Answer quickly to earn a speed bonus.',
      'Score the most points across 10 rounds.'
    ],
    start: function (api) { startNumberChallenge(api); }
  });

  /* ================= Game 2: Higher or Lower ================= */

  function startHigherOrLower(api) {
    var scorers = api.config.scorers;
    if (!scorers || !scorers.length) { renderNoPlayers(api); return; }
    var state = {
      round: 0,
      total: 8 * scorers.length,
      correct: 0,
      answered: 0,
      locked: false,
      current: 0,
      next: 0,
      active: null,
      lastPoints: 0
    };
    api.audio.play('roundStart');
    renderHigherOrLower(api, state);
  }

  function renderHigherOrLower(api, state) {
    var scorers = api.config.scorers;
    var active = scorers[state.round % scorers.length];
    var pair = drawPair();
    state.locked = false;
    state.current = pair.current;
    state.next = pair.next;
    state.active = active;

    var root = api.shell.root;
    FF.ui.clear(root);

    var wrap = FF.GameUI.stage({ className: 'hol-wrap' });
    wrap.appendChild(topBar(api, state, active));
    wrap.appendChild(FF.GameUI.kicker(FF.t('currentNumber', 'The number is')));
    wrap.appendChild(FF.ui.div('gm-big', String(pair.current)));
    wrap.appendChild(FF.GameUI.prompt(FF.t('higherOrLowerQ', 'Will the next number be higher or lower?'), 'sm'));

    var actions = FF.GameUI.duo();
    actions.classList.add('hol-actions');
    var high = FF.GameUI.duoButton(FF.t('higher', 'Higher'), function () { guessHigherOrLower(api, state, 'higher'); }, 'up', 'arrow-up');
    var low = FF.GameUI.duoButton(FF.t('lower', 'Lower'), function () { guessHigherOrLower(api, state, 'lower'); }, 'down', 'arrow-down');
    actions.appendChild(high);
    actions.appendChild(low);
    wrap.appendChild(actions);

    root.appendChild(wrap);
    api.shell.updateScores(active.id);
    if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(root);

    if (api.config.timer > 0) {
      api.shell.setTimer(api.config.timer, function () { timeoutHigherOrLower(api, state); });
    } else {
      api.shell.hideTimer();
    }
  }

  function guessHigherOrLower(api, state, choice) {
    if (state.locked) return;
    state.locked = true;
    api.shell.hideTimer();
    var active = state.active;
    var current = state.current;
    var next = state.next;
    var correct = (choice === 'higher' && next > current) || (choice === 'lower' && next < current);
    var points = 0;
    if (correct) {
      points = Math.round(100 * bonusMultiplier(api.config.difficulty || 'easy'));
      api.scoring.add(active.id, points, { correct: true });
      state.correct++;
      api.audio.play('correct');
    } else {
      api.scoring.markAnswer(active.id, false);
      api.audio.play('wrong');
    }
    state.answered++;
    state.lastPoints = points;
    api.shell.updateScores(active.id);
    renderHigherOrLowerReveal(api, state, correct, false);
    setTimeout(function () {
      if (!FF.GameFlow.current) return;
      nextHigherOrLower(api, state);
    }, correct ? 1300 : 1900);
  }

  function timeoutHigherOrLower(api, state) {
    if (state.locked) return;
    state.locked = true;
    api.shell.hideTimer();
    api.scoring.markAnswer(state.active.id, false);
    state.answered++;
    state.lastPoints = 0;
    api.audio.play('wrong');
    api.shell.updateScores(state.active.id);
    renderHigherOrLowerReveal(api, state, false, true);
    setTimeout(function () {
      if (!FF.GameFlow.current) return;
      nextHigherOrLower(api, state);
    }, 1900);
  }

  function renderHigherOrLowerReveal(api, state, correct, timedOut) {
    var root = api.shell.root;
    FF.ui.clear(root);
    var active = state.active;

    var wrap = FF.GameUI.stage({ className: 'hol-wrap' });
    wrap.appendChild(topBar(api, state, active, true));

    var wentUp = state.next > state.current;
    var pair = FF.ui.div('gm-duo');
    var first = FF.ui.div('gm-card gm-card--soft');
    first.appendChild(FF.GameUI.kicker(FF.t('firstNumber', 'First number')));
    first.appendChild(FF.ui.div('gm-big', String(state.current)));
    var second = FF.ui.div('gm-card');
    second.appendChild(FF.GameUI.kicker(FF.t('nextNumber', 'Next number')));
    var nextEl = FF.ui.div('gm-big');
    nextEl.appendChild(FF.Icons.icon(wentUp ? 'arrow-up' : 'arrow-down'));
    nextEl.appendChild(document.createTextNode(' ' + String(state.next)));
    second.appendChild(nextEl);
    pair.appendChild(first);
    pair.appendChild(second);
    wrap.appendChild(pair);

    var directionWord = wentUp ? FF.t('wentHigher', 'It went higher.') : FF.t('wentLower', 'It went lower.');
    var msg;
    if (correct) msg = FF.GameUI.correctText(state.lastPoints) + ' ' + directionWord;
    else if (timedOut) msg = FF.t('timesUp', 'Time’s up!') + ' ' + directionWord;
    else msg = FF.t('notQuite', 'Not quite.') + ' ' + directionWord;
    wrap.appendChild(FF.GameUI.feedback(correct ? 'good' : 'bad', msg));

    root.appendChild(wrap);
    api.shell.updateScores(active.id);
  }

  function nextHigherOrLower(api, state) {
    state.round++;
    if (state.round >= state.total) {
      finishHigherOrLower(api, state);
    } else {
      renderHigherOrLower(api, state);
    }
  }

  function finishHigherOrLower(api, state) {
    api.shell.hideTimer();
    var ranked = api.scoring.ranked();
    var bestStreak = 0;
    api.config.scorers.forEach(function (s) {
      var r = api.scoring.record(s.id);
      if (r && r.bestStreak > bestStreak) bestStreak = r.bestStreak;
    });
    var ach = [];
    if (bestStreak >= 5) ach.push('streak5');
    if (state.correct === state.total && state.total > 0) ach.push('perfect');
    api.end({
      results: ranked,
      winnerId: ranked.length ? ranked[0].id : null,
      bestStreak: bestStreak,
      achievements: ach
    });
  }

  FF.registerGame({
    id: 'higherOrLower',
    name: 'Higher or Lower',
    description: 'Guess whether the next number is higher or lower and build a winning streak.',
    category: 'numbers',
    icon: '📈',
    players: [1, 8],
    difficulty: 'Easy',
    duration: 3,
    tags: ['quick'],
    modes: ['solo', 'turn'],
    defaultMode: 'turn',
    howToPlay: [
      'Look at the number on screen.',
      'Guess if the next number will be higher or lower.',
      'A correct guess earns points and grows your streak.',
      'Play 8 rounds each and keep the longest streak.'
    ],
    start: function (api) { startHigherOrLower(api); }
  });
})();
