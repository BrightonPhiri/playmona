/* ============================================================
   PLAYMONA — quizGames.js
   Quiz game:
     guessWho (Quiz Mix is in quizMix.js)
   Classic script (no ES modules) so the app runs from file://
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  /* ============================================================
     Shared helpers
     ============================================================ */

  // Difficulty multiplier for scoring: easy x1, normal x1.5, hard x2.
  function bonusOf(config) {
    const d = (config && config.difficulty) || 'normal';
    if (d === 'hard') return 2;
    if (d === 'normal') return 1.5;
    return 1;
  }

  // Entities that receive points (teams in team mode, else players).
  function scorerList(config) {
    const s = config && config.scorers;
    if (s && s.length) return s;
    const p = config && config.players;
    return (p && p.length) ? p : [];
  }

  function activeScorer(config, idx) {
    const s = scorerList(config);
    return s.length ? s[idx % s.length] : null;
  }

  function getQuiz() {
    return (FF.data && FF.data.quiz) ? FF.data.quiz : null;
  }

  function notEmpty(arr) { return Array.isArray(arr) && arr.length > 0; }

  /* ---------- DOM building helpers ---------- */

  // Screens are built from FF.GameUI (js/gameUI.js, css/games.css).
  function cardWrap() { return FF.GameUI.stage(); }

  // An answer button with its A/B/C/D key. Buttons go into an options
  // group so they lay out as a grid on wider screens.
  function optionBtn(label, onClick, index) {
    return FF.GameUI.option(label, onClick, index, { className: 'quiz-option' });
  }

  function optionGroup(wrap) {
    const group = FF.GameUI.options({ columns: 'auto' });
    wrap.appendChild(group);
    return group;
  }

  // kind: 'correct', 'wrong' or 'dim'. Adds an icon, not just a colour.
  function markOption(btn, kind) { FF.GameUI.markOption(btn, kind); }

  // In a room nobody takes turns - everyone races the same question,
  // so naming one player would be wrong on every other device.
  function turnChip(entity, roundText) { return FF.GameUI.turnBar(entity, roundText); }

  function roundLabel(n, total) { return FF.GameLength.roundText(n, total); }

  function correctLine(pts, streak) {
    return FF.GameUI.feedback('good', FF.GameUI.correctText(pts) + (streak ? ' ' + FF.t('streakBonus', 'Streak bonus!') : ''));
  }
  function wrongLine() { return FF.GameUI.feedback('bad', FF.t('notQuite', 'Not quite.')); }

  /* ---------- Scoring helpers ---------- */

  /* ---------- Race support ----------
     One helper serves every quiz loop. Returns null offline, so each
     loop's single-device path is untouched. */
  function raceFor(api, opts) {
    if (!FF.Race || !FF.Race.active()) return null;
    opts = opts || {};

    FF.Race.begin(api.def.id, {
      rounds: opts.rounds || 10,
      timerMs: (api.config.timer || 0) * 1000,
      pointsFor: opts.pointsFor || function (answer) {
        // A game may state what its answer was worth (Guess Who scores
        // by clues revealed, not by speed).
        if (answer.value != null) return answer.value;
        var pts = Math.round(100 * bonusOf(api.config));
        if (answer.ms != null && answer.ms < 3000) pts += 50;
        return pts;
      }
    });

    return {
      isLastRound: function (n, total) { return FF.Race.isLastRound(n, total); },
      over: function (n) { return FF.Race.over(n); },
      beginRound: function (n) { FF.Race.beginRound(n); },
      /* What this round shows, for people watching. */
      describe: function (screen, answer) { FF.Race.describe(screen, answer); },

      /* Hold the options until the round's shared open instant, so every
         device can answer from the same moment. */
      gate: function (onOpen) {
        return FF.RaceUI.gate(api.shell.root, opts.optionSelector || 'button', onOpen);
      },

      submit: function (choice, correct, elapsedMs, extra) {
        // Measure from the shared open instant so times compare across
        // devices rather than from when each happened to render.
        var shared = FF.Race.msSinceOpen();
        FF.Race.submit(choice, correct, shared != null ? shared : elapsedMs, extra);
        if (!correct) FF.RaceUI.lockOut(api.shell.root, opts.optionSelector || 'button');
      },
      onSettle: function (cb) { return FF.Race.onSettle(cb); },
      /* The shared result screen every racing game uses. */
      showResult: function (payload, o) {
        FF.Race.syncScoring();
        api.shell.updateScores();
        FF.RaceUI.result(api.shell.root, {
          payload: payload,
          answerText: (o && o.answerText) || null,
          isLast: !!(o && o.isLast),
          onNext: (o && o.onNext) || function () {}
        });
      },
      end: function () { FF.Race.end(); }
    };
  }

  function awardWrong(api, id) {
    api.scoring.add(id, 0, { wrong: true });
    api.scoring.resetStreak(id);
  }

  // Build the final results object and call api.end exactly once.
  function finishGame(api, extras) {
    const res = api.scoring.results();
    const ranked = (res && res.results) ? res.results : [];
    let best = 0;
    let fastest = null;
    for (let i = 0; i < ranked.length; i++) {
      if (ranked[i].bestStreak > best) best = ranked[i].bestStreak;
      if (ranked[i].fastest != null && (fastest == null || ranked[i].fastest < fastest)) fastest = ranked[i].fastest;
    }
    const out = {
      results: ranked,
      winnerId: res ? res.winnerId : (ranked.length ? ranked[0].id : null),
      bestStreak: best,
      fastest: fastest
    };
    if (extras) {
      for (const k in extras) {
        if (Object.prototype.hasOwnProperty.call(extras, k)) out[k] = extras[k];
      }
    }
    api.end(out);
  }

  // Friendly fallback when required data is missing (no api.end — user exits).
  function friendlyExit(api, msg) {
    FF.GameUI.exitCard(api, FF.t('noQuestions', 'No questions yet'), msg || FF.t('needsQuizData', 'This game needs more quiz data before it can be played.'));
  }

  // Guess Who: correct answer + up to 3 distractors from other cards.
  function buildOptions(answer, allItems) {
    const others = [];
    for (let i = 0; i < allItems.length && others.length < 3; i++) {
      const a = allItems[i].answer;
      if (a !== answer && others.indexOf(a) === -1) others.push(a);
    }
    return FF.util.shuffle([answer].concat(others));
  }

  /* ============================================================
     4. GUESS WHO / WHAT — progressive clues, shrinking points
     ============================================================ */
  FF.registerGame({
    id: 'guessWho',
    name: 'Guess Who / What',
    icon: '🕵️',
    category: 'quiz',
    players: [1, 8],
    difficulty: 'Normal',
    duration: 4,
    tags: ['clues'],
    modes: ['solo', 'turn', 'team'],
    defaultMode: 'turn',
    description: 'Read the clues and guess who or what before the points run out.',
    howToPlay: [
      'Take turns reading clues about a mystery person, place or thing.',
      'Guess now for big points, or reveal another clue for less.',
      'Fewer clues used means more points.',
      'A wrong guess scores nothing and reveals the answer.'
    ],
    start: function (api) {
      const data = getQuiz();
      if (!data || !notEmpty(data.guessWho)) {
        friendlyExit(api, 'Add guess-who clue cards to js/data/quiz.js first.');
        return;
      }
      if (!scorerList(api.config).length) {
        friendlyExit(api, 'No players were found for this game.');
        return;
      }
      if (data.guessWho.length < 2) {
        friendlyExit(api, 'Guess Who needs at least two clue cards to build answer choices.');
        return;
      }

      const items = data.guessWho.slice();
      const bag = new api.random.Bag(items);
      const TOTAL = FF.GameLength.rounds(api, Math.min(6, items.length), items.length);
      const cluePoints = [0, 300, 200, 100, 50];

      let round = 0;
      let correctTotal = 0;
      let answeredTotal = 0;
      let currentAnswerText = null;

      // 'button' rather than '.quiz-option': the clue screen's actions need
      // gating too, since options only appear after pressing Guess Now.
      const race = raceFor(api, { rounds: TOTAL, optionSelector: 'button' });
      const offSettle = race ? race.onSettle(function (payload) {
        if (payload.winnerId) correctTotal++;
        answeredTotal++;
        race.showResult(payload, {
          answerText: currentAnswerText,
          isLast: race.isLastRound(round, TOTAL),
          onNext: function () { nextRound(); }
        });
      }) : null;

      function nextRound() {
        round++;
        if (round >= TOTAL || (race && race.over(round))) {
          if (offSettle) offSettle();
          if (race) race.end();
          finishGame(api, { quizCorrect: correctTotal, quizAnswered: answeredTotal });
        } else {
          renderRound();
        }
      }

      function renderRound() {
        if (race) race.beginRound(round);
        const entity = activeScorer(api.config, round);
        const item = bag.next();
        currentAnswerText = item.answer;
        let revealed = 1;
        const startTime = Date.now();
        // For people watching: each player opens clues on their own phone, so viewers see the riddle.
        if (race) race.describe({ kind: 'card', text: FF.t('whoAmI', 'Who or what am I?') + ' ' + item.clues[0] }, null);

        api.shell.updateScores(entity ? entity.id : null);

        function pointsNow() { return cluePoints[revealed] || 50; }

        function render() {
          FF.ui.clear(api.shell.root);
          const wrap = cardWrap();
          wrap.appendChild(turnChip(entity, roundLabel(round + 1, TOTAL)));
          wrap.appendChild(FF.GameUI.prompt(FF.t('whoAmI', 'Who or what am I?')));

          const clues = FF.ui.el('ol', { class: 'gm-list', 'aria-label': FF.t('clues', 'Clues') });
          for (let i = 0; i < revealed; i++) {
            const li = FF.ui.el('li', { class: 'gm-list__row gm-list__row--start' });
            li.appendChild(FF.ui.el('strong', {}, FF.t('clueN', 'Clue {n}', { n: i + 1 })));
            li.appendChild(FF.ui.span('', item.clues[i]));
            clues.appendChild(li);
          }
          wrap.appendChild(clues);

          const worth = FF.ui.div('gm-turnbar');
          worth.appendChild(FF.GameUI.pill(FF.t('worthN', 'Worth {n} points', { n: pointsNow() }), 'sparkle', 'turn'));
          wrap.appendChild(worth);

          const actions = FF.ui.div('gm-row');
          actions.appendChild(FF.UI.button(FF.t('guessNow', 'Guess now'), { class: 'btn-lg btn-primary', icon: 'target', onClick: function () { FF.Audio.play('select'); guessNow(); } }));
          if (revealed < item.clues.length) {
            actions.appendChild(FF.UI.button(FF.t('nextClue', 'Another clue'), { class: 'btn-lg', icon: 'plus', onClick: function () { revealed++; FF.Audio.play('flip'); render(); } }));
          }
          wrap.appendChild(actions);

          api.shell.root.appendChild(wrap);
          FF.Nav.focusFirst(api.shell.root);
          if (race) race.gate();
        }

        function guessNow() {
          const opts = buildOptions(item.answer, items);
          const elapsed = (Date.now() - startTime) / 1000;

          FF.ui.clear(api.shell.root);
          const wrap = cardWrap();
          wrap.appendChild(turnChip(entity, roundLabel(round + 1, TOTAL)));
          wrap.appendChild(FF.GameUI.prompt(FF.t('takeGuess', 'Take your guess')));
          wrap.appendChild(FF.GameUI.sub(revealed === 1
            ? FF.t('oneClueWorth', '1 clue used. Worth {n} points.', { n: pointsNow() })
            : FF.t('cluesWorth', '{c} clues used. Worth {n} points.', { c: revealed, n: pointsNow() })));

          const optEls = [];
          const group = optionGroup(wrap);
          opts.forEach(function (opt, i) {
            const b = optionBtn(opt, function () { pick(i); }, i);
            optEls.push(b);
            group.appendChild(b);
          });

          api.shell.root.appendChild(wrap);
          FF.Nav.focusFirst(api.shell.root);

          function pick(idx) {
            const correct = opts[idx] === item.answer;
            const value = Math.round(pointsNow() * bonusOf(api.config));

            if (race) {
              // Points depend on how many clues THIS device revealed, so
              // send the value along rather than deriving it from time.
              race.submit(idx, correct, Date.now() - startTime, { value: value });
              return;
            }

            for (let i = 0; i < optEls.length; i++) {
              optEls[i].disabled = true;
              if (opts[i] === item.answer) markOption(optEls[i], 'correct');
              else markOption(optEls[i], 'dim');
            }
            if (!correct) markOption(optEls[idx], 'wrong');

            answeredTotal++;
            if (correct) {
              api.scoring.add(entity.id, value, { correct: true, fastest: elapsed });
              correctTotal++;
              api.audio.play('correct');
              wrap.appendChild(correctLine(value));
            } else {
              awardWrong(api, entity.id);
              api.audio.play('wrong');
              wrap.appendChild(wrongLine());
            }

            wrap.appendChild(FF.GameUI.feedback('info', FF.t('answerWas', 'The answer was {answer}.', { answer: item.answer })));
            const nextBtn = FF.Advance.button(FF.t('next', 'Next'), function () { FF.Audio.play('click'); nextRound(); }, { class: 'btn-lg' });
            wrap.appendChild(nextBtn);

            api.shell.updateScores(entity.id);
            FF.Nav.focus(nextBtn);
          }
        }

        render();
      }

      renderRound();
    }
  });

})();
