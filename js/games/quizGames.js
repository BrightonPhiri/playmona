/* ============================================================
   PLAYMONA — quizGames.js
   Five quiz / visual games:
     familyQuiz, trueOrFalse, brainBattle, guessWho, pictureQuiz
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

  function maxStreak(api) {
    const s = scorerList(api.config);
    let best = 0;
    for (let i = 0; i < s.length; i++) {
      const r = api.scoring.record(s[i].id);
      if (r && r.bestStreak > best) best = r.bestStreak;
    }
    return best;
  }

  // Difficulty-aware question pool: easy picks easy/normal, hard picks normal/hard.
  function difficultyPool(questions, diff) {
    if (!notEmpty(questions)) return [];
    if (diff === 'easy') {
      const f = questions.filter(function (q) { return q.difficulty !== 'hard'; });
      return f.length ? f : questions.slice();
    }
    if (diff === 'hard') {
      const f = questions.filter(function (q) { return q.difficulty !== 'easy'; });
      return f.length ? f : questions.slice();
    }
    return questions.slice();
  }

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

  function roundLabel(n, total) {
    if (FF.Race && FF.Race.active && FF.Race.active()) return FF.Race.roundText(n, total);
    return FF.t('roundOf', 'Round {n} of {total}', { n: n, total: total });
  }

  function correctLine(pts, streak) {
    return FF.GameUI.feedback('good', FF.GameUI.correctText(pts) + (streak ? ' ' + FF.t('streakBonus', 'Streak bonus!') : ''));
  }
  function wrongLine() { return FF.GameUI.feedback('bad', FF.t('notQuite', 'Not quite.')); }
  function tipLine(text) { return FF.GameUI.feedback('tip', text); }

  /* ---------- Scoring helpers ---------- */

  // Standard quiz correct answer: 100 x bonus, +50 speed bonus under 3s,
  // +100 streak bonus every 3 correct in a row. Records fastest (seconds).
  function awardCorrect(api, id, elapsed) {
    const bonus = bonusOf(api.config);
    let pts = Math.round(100 * bonus);
    if (elapsed != null && elapsed < 3) pts += 50;
    api.scoring.add(id, pts, { correct: true, fastest: (elapsed != null ? elapsed : null) });
    const rec = api.scoring.record(id);
    let streakBonus = false;
    if (rec && rec.streak > 0 && rec.streak % 3 === 0) {
      api.scoring.add(id, 100);
      streakBonus = true;
    }
    return { pts: pts, streak: streakBonus };
  }

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

  // Picture quiz: find a visual item whose name matches imageKey (case-insensitive).
  function findVisual(key) {
    const v = (FF.data && FF.data.visual) ? FF.data.visual : null;
    if (!v || key == null) return null;
    const k = String(key).toLowerCase();
    const groups = [v.animals, v.food, v.landmarks, v.objects];
    for (let g = 0; g < groups.length; g++) {
      const arr = groups[g];
      if (!Array.isArray(arr)) continue;
      for (let i = 0; i < arr.length; i++) {
        const it = arr[i];
        if (it && it.svg && String(it.name).toLowerCase() === k) return it;
      }
    }
    return null;
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
     1. QUIZ MIX — 10 turn-based multiple-choice rounds
     ============================================================ */
  FF.registerGame({
    id: 'familyQuiz',
    featured: true,
    name: 'Quiz Mix',
    icon: '🧠',
    category: 'quiz',
    players: [1, 8],
    difficulty: 'Easy',
    duration: 6,
    tags: ['quick', 'everyone'],
    modes: ['solo', 'turn', 'team'],
    defaultMode: 'turn',
    description: 'Answer 10 fun multiple-choice questions. Be quick and build a streak!',
    howToPlay: [
      'Take turns answering quiz questions.',
      'Pick the correct answer from 4 choices.',
      'Answer fast for a speed bonus, and 3 correct in a row earns extra points.',
      'The player with the most points after 10 rounds wins.'
    ],
    start: function (api) {
      const data = getQuiz();
      if (!data || !notEmpty(data.questions)) {
        friendlyExit(api, 'Add some multiple-choice questions to js/data/quiz.js first.');
        return;
      }
      if (!scorerList(api.config).length) {
        friendlyExit(api, 'No players were found for this game.');
        return;
      }

      const pool = difficultyPool(data.questions, api.config.difficulty);
      const bag = new api.random.Bag(pool);
      const ROUNDS = FF.Race ? FF.Race.plan(10, pool.length) : 10;

      let round = 0;
      let correctTotal = 0;
      let answeredTotal = 0;
      const perCorrect = {};
      let currentQ = null;

      const race = raceFor(api, { rounds: ROUNDS, optionSelector: '.quiz-option' });
      const offSettle = race ? race.onSettle(function (payload) {
        if (payload.winnerId) correctTotal++;
        answeredTotal++;
        race.showResult(payload, {
          answerText: currentQ ? currentQ.options[currentQ.answer] : null,
          isLast: race.isLastRound(round, ROUNDS),
          // nextRound moves to the next round itself (this used to add one
          // more, so online Family Quiz skipped every other question).
          onNext: function () { nextRound(); }
        });
      }) : null;

      function nextRound() {
        round++;
        if (round >= ROUNDS || (race && race.over(round))) {
          const achievements = [];
          let brainBox = false;
          for (const id in perCorrect) {
            if (Object.prototype.hasOwnProperty.call(perCorrect, id) && perCorrect[id] >= 10) brainBox = true;
          }
          if (brainBox) achievements.push('brainBox');
          if (offSettle) offSettle();
          if (race) race.end();
          finishGame(api, { quizCorrect: correctTotal, quizAnswered: answeredTotal, achievements: achievements });
        } else {
          renderRound();
        }
      }

      function renderRound() {
        if (race) race.beginRound(round);
        const entity = activeScorer(api.config, round);
        const q = bag.next();
        currentQ = q;
        const startTime = Date.now();

        api.shell.updateScores(entity ? entity.id : null);
        FF.ui.clear(api.shell.root);

        const wrap = cardWrap();
        wrap.appendChild(turnChip(entity, roundLabel(round + 1, ROUNDS)));
        if (q.category) wrap.appendChild(FF.GameUI.kicker(q.category));
        wrap.appendChild(FF.GameUI.prompt(q.q));
        // For people watching (the answer is shared after the round).
        if (race) race.describe({ kind: 'choice', text: q.q, options: q.options }, q.answer);

        const optEls = [];
        const group = optionGroup(wrap);
        q.options.forEach(function (opt, i) {
          const b = optionBtn(opt, function () { onAnswer(i); }, i);
          optEls.push(b);
          group.appendChild(b);
        });

        api.shell.root.appendChild(wrap);
        if (race) race.gate();
        FF.Nav.focusFirst(api.shell.root);

        function onAnswer(idx) {
          const elapsed = (Date.now() - startTime) / 1000;
          const correct = idx === q.answer;

          if (race) {
            // The race decides the round; a wrong answer only locks
            // this device out while everyone else keeps playing.
            race.submit(idx, correct, Date.now() - startTime);
            return;
          }

          for (let i = 0; i < optEls.length; i++) {
            optEls[i].disabled = true;
            if (i === q.answer) markOption(optEls[i], 'correct');
            else markOption(optEls[i], 'dim');
          }
          if (!correct) markOption(optEls[idx], 'wrong');

          answeredTotal++;
          if (correct) {
            const res = awardCorrect(api, entity.id, elapsed);
            correctTotal++;
            perCorrect[entity.id] = (perCorrect[entity.id] || 0) + 1;
            api.audio.play('correct');
            if (res.streak) api.audio.play('streak');
            wrap.appendChild(correctLine(res.pts, res.streak));
          } else {
            awardWrong(api, entity.id);
            api.audio.play('wrong');
            wrap.appendChild(wrongLine());
          }

          if (q.explanation) wrap.appendChild(tipLine(q.explanation));
          const nextBtn = FF.Advance.button(FF.t('next', 'Next'), function () { FF.Audio.play('click'); nextRound(); }, { class: 'btn-lg' });
          wrap.appendChild(nextBtn);

          api.shell.updateScores(entity.id);
          FF.Nav.focus(nextBtn);
        }
      }

      renderRound();
    }
  });

  /* ============================================================
     2. TRUE OR FALSE — 8 fast turn-based rounds
     ============================================================ */
  FF.registerGame({
    id: 'trueOrFalse',
    name: 'True or False',
    icon: '⚖️',
    category: 'quiz',
    players: [1, 8],
    difficulty: 'Easy',
    duration: 3,
    tags: ['quick'],
    modes: ['solo', 'turn', 'team'],
    defaultMode: 'turn',
    description: 'Race to decide — is it true or false? Fast-paced quiz fun.',
    howToPlay: [
      'Take turns answering true or false questions.',
      'Tap TRUE or FALSE before the timer runs out.',
      'Correct answers earn points, plus bonuses for speed and streaks.',
      'Most points after 8 rounds wins.'
    ],
    start: function (api) {
      const data = getQuiz();
      if (!data || !notEmpty(data.trueFalse)) {
        friendlyExit(api, 'Add true/false questions to js/data/quiz.js first.');
        return;
      }
      if (!scorerList(api.config).length) {
        friendlyExit(api, 'No players were found for this game.');
        return;
      }

      const bag = new api.random.Bag(data.trueFalse);
      const ROUNDS = FF.Race ? FF.Race.plan(8, data.trueFalse.length) : 8;

      let round = 0;
      let correctTotal = 0;
      let answeredTotal = 0;
      let timer = null;
      let currentItem = null;

      const race = raceFor(api, { rounds: ROUNDS, optionSelector: '.btn' });
      const offSettle = race ? race.onSettle(function (payload) {
        if (payload.winnerId) correctTotal++;
        answeredTotal++;
        race.showResult(payload, {
          answerText: currentItem ? (currentItem.answer ? 'TRUE' : 'FALSE') : null,
          isLast: race.isLastRound(round, ROUNDS),
          onNext: function () { nextRound(); }
        });
      }) : null;

      function nextRound() {
        round++;
        if (round >= ROUNDS || (race && race.over(round))) {
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
        currentItem = item;
        const startTime = Date.now();
        let answered = false;

        api.shell.updateScores(entity ? entity.id : null);
        FF.ui.clear(api.shell.root);

        const wrap = cardWrap();
        wrap.appendChild(turnChip(entity, roundLabel(round + 1, ROUNDS)));
        wrap.appendChild(FF.GameUI.prompt(item.q));
        // For people watching (the answer is shared after the round).
        if (race) race.describe({ kind: 'choice', text: item.q, options: [FF.t('true', 'True'), FF.t('false', 'False')] }, item.answer === true ? 0 : 1);

        const meter = FF.GameUI.meter(1);
        if (api.config.timer > 0) wrap.appendChild(meter);

        const row = FF.GameUI.duo();
        const trueBtn = FF.GameUI.duoButton(FF.t('true', 'True'), function () { answer(true); }, 'yes', 'check');
        const falseBtn = FF.GameUI.duoButton(FF.t('false', 'False'), function () { answer(false); }, 'no', 'close');
        row.appendChild(trueBtn);
        row.appendChild(falseBtn);
        wrap.appendChild(row);

        api.shell.root.appendChild(wrap);
        if (race) race.gate();
        FF.Nav.focusFirst(api.shell.root);

        if (api.config.timer > 0) {
          timer = api.timer.create({
            onTick: function (rem) { meter.set(rem / api.config.timer); },
            onFinish: function () { onTimeout(); },
            warningAt: 5
          });
          timer.start(api.config.timer);
        }

        function stopTimer() { if (timer) { timer.stop(); timer = null; } }

        function settle(correct) {
          if (answered) return;
          const elapsed = (Date.now() - startTime) / 1000;

          if (race) {
            stopTimer();
            race.submit(correct ? 1 : 0, correct, Date.now() - startTime);
            return;
          }

          answered = true;
          stopTimer();

          trueBtn.disabled = true;
          falseBtn.disabled = true;
          if (item.answer === true) markOption(trueBtn, 'correct'); else markOption(trueBtn, 'dim');
          if (item.answer === false) markOption(falseBtn, 'correct'); else markOption(falseBtn, 'dim');

          answeredTotal++;
          if (correct) {
            const res = awardCorrect(api, entity.id, elapsed);
            correctTotal++;
            api.audio.play('correct');
            if (res.streak) api.audio.play('streak');
            wrap.appendChild(correctLine(res.pts));
          } else {
            awardWrong(api, entity.id);
            api.audio.play('wrong');
            wrap.appendChild(wrongLine());
          }

          wrap.appendChild(FF.GameUI.feedback('info', FF.t('itWas', 'It was {answer}.', { answer: item.answer ? FF.t('true', 'True') : FF.t('false', 'False') })));
          if (item.explanation) wrap.appendChild(tipLine(item.explanation));
          const nextBtn = FF.Advance.button(FF.t('next', 'Next'), function () { FF.Audio.play('click'); nextRound(); }, { class: 'btn-lg' });
          wrap.appendChild(nextBtn);

          api.shell.updateScores(entity.id);
          FF.Nav.focus(nextBtn);
        }

        function answer(choice) {
          if (answered) return;
          settle(choice === item.answer);
        }

        function onTimeout() {
          if (answered) return;
          settle(false);
        }
      }

      renderRound();
    }
  });

  /* ============================================================
     3. BRAIN BATTLE — rapid-fire runs, escalating difficulty
     ============================================================ */
  FF.registerGame({
    id: 'brainBattle',
    name: 'Brain Battle',
    icon: '⚡',
    category: 'quiz',
    players: [1, 8],
    difficulty: 'Normal',
    duration: 5,
    tags: ['quick', 'streak'],
    modes: ['solo', 'turn'],
    defaultMode: 'turn',
    description: 'How long can you keep your answer streak alive? Rapid-fire quiz challenge.',
    howToPlay: [
      'Each player gets their own run of rapid questions.',
      'Questions get harder as your streak grows.',
      'One wrong answer (or running out of time) ends your run.',
      'Correct answers earn points plus a growing streak bonus.'
    ],
    start: function (api) {
      const data = getQuiz();
      if (!data || !notEmpty(data.questions)) {
        friendlyExit(api, 'Add questions to js/data/quiz.js first.');
        return;
      }
      const all = scorerList(api.config);
      if (!all.length) {
        friendlyExit(api, 'No players were found for this game.');
        return;
      }

      const questions = data.questions;
      const perSec = api.config.timer > 0 ? api.config.timer : 10;

      let runIdx = 0;
      let current = null;
      let correctTotal = 0;
      let answeredTotal = 0;
      let lastQ = null;
      let timer = null;
      let startTime = 0;
      let answering = false;
      let finished = false;

      function targetDifficulty() {
        const rec = api.scoring.record(current.id);
        const streak = rec ? rec.streak : 0;
        if (streak >= 4) return 'hard';
        if (streak >= 2) return 'normal';
        return 'easy';
      }

      function pickQuestion() {
        const want = targetDifficulty();
        let pool = questions.filter(function (q) { return q.difficulty === want; });
        if (!pool.length) pool = questions.slice();
        let q = FF.util.pick(pool);
        for (let i = 0; i < 6 && q === lastQ && pool.length > 1; i++) q = FF.util.pick(pool);
        lastQ = q;
        return q;
      }

      function finishBrain() {
        finished = true;
        if (timer) timer.stop();
        const best = maxStreak(api);
        const achievements = [];
        if (best >= 5) achievements.push('streak5');
        if (best >= 10) achievements.push('streak10');
        finishGame(api, { bestStreak: best, quizCorrect: correctTotal, quizAnswered: answeredTotal, achievements: achievements });
      }

      function renderRunIntro() {
        current = all[runIdx];
        api.scoring.resetStreak(current.id);
        api.shell.updateScores(current.id);
        FF.ui.clear(api.shell.root);

        const wrap = cardWrap();
        wrap.classList.add('gm-stage--center');
        wrap.appendChild(turnChip(current, FF.t('runOf', 'Run {n} of {total}', { n: runIdx + 1, total: all.length })));
        wrap.appendChild(FF.Players.avatarEl(current, 'gm-hero-avatar'));
        wrap.appendChild(FF.GameUI.prompt(FF.t('yourRun', '{name}, you’re up!', { name: current.name }), 'xl'));
        wrap.appendChild(FF.GameUI.sub(FF.t('brainRunRules', 'Answer as many questions as you can. One wrong answer, or running out of time, ends your run.')));
        wrap.appendChild(FF.GameUI.action(FF.t('startRun', 'Start my run'), function () { FF.Audio.play('roundStart'); runQuestion(); }, { icon: 'play' }));
        api.shell.root.appendChild(wrap);
        FF.Nav.focusFirst(api.shell.root);
      }

      function runQuestion() {
        if (finished) return;
        const q = pickQuestion();
        startTime = Date.now();
        answering = true;

        api.shell.updateScores(current.id);
        FF.ui.clear(api.shell.root);

        const wrap = cardWrap();

        const rec = api.scoring.record(current.id);
        const streakNow = rec ? rec.streak : 0;

        const info = FF.ui.div('gm-turnbar');
        info.appendChild(FF.GameUI.pill(FF.t('streakN', 'Streak {n}', { n: streakNow }), 'flame', 'turn'));
        wrap.appendChild(info);
        const meter = FF.GameUI.meter(1);
        wrap.appendChild(meter);

        wrap.appendChild(FF.GameUI.prompt(q.q));

        const optEls = [];
        const group = optionGroup(wrap);
        q.options.forEach(function (opt, i) {
          const b = optionBtn(opt, function () { onAnswer(i, q, optEls); }, i);
          optEls.push(b);
          group.appendChild(b);
        });

        api.shell.root.appendChild(wrap);
        FF.Nav.focusFirst(api.shell.root);

        timer = api.timer.create({
          onTick: function (rem) { meter.set(rem / perSec); },
          onFinish: function () { onTimeout(q, optEls); },
          warningAt: 5
        });
        timer.start(perSec);
      }

      function endRun(q, optEls) {
        // reveal correct answer and end the current player's run
        for (let i = 0; i < optEls.length; i++) {
          optEls[i].disabled = true;
          if (i === q.answer) markOption(optEls[i], 'correct');
          else markOption(optEls[i], 'dim');
        }
        api.shell.updateScores(current.id);

        const nextName = runIdx + 1 < all.length ? all[runIdx + 1].name : null;
        const rec = api.scoring.record(current.id);

        const wrap = cardWrap();
        wrap.appendChild(FF.GameUI.prompt(FF.t('runOver', '{name}’s run is over', { name: current.name })));
        const runStats = FF.ui.div('gm-turnbar');
        runStats.appendChild(FF.GameUI.pill(FF.t('bestStreakN', 'Best streak {n}', { n: rec ? rec.bestStreak : 0 }), 'flame'));
        runStats.appendChild(FF.GameUI.pill(FF.t('correctN', '{n} correct', { n: rec ? rec.correct : 0 }), 'check-circle'));
        wrap.appendChild(runStats);
        wrap.appendChild(FF.GameUI.feedback('info', FF.t('answerWas', 'The answer was {answer}.', { answer: q.options[q.answer] })));
        if (q.explanation) wrap.appendChild(tipLine(q.explanation));
        wrap.appendChild(FF.GameUI.action(nextName ? FF.t('nextRun', '{name}’s run', { name: nextName }) : FF.t('seeResults', 'See results'), function () {
          FF.Audio.play('roundStart');
          runIdx++;
          if (runIdx >= all.length) finishBrain();
          else renderRunIntro();
        }, { icon: nextName ? 'play' : 'trophy' }));
        api.shell.root.appendChild(wrap);
        FF.Nav.focusFirst(api.shell.root);
      }

      function onAnswer(idx, q, optEls) {
        if (!answering) return;
        answering = false;
        if (timer) { timer.stop(); timer = null; }
        const elapsed = (Date.now() - startTime) / 1000;
        const correct = idx === q.answer;

        for (let i = 0; i < optEls.length; i++) {
          optEls[i].disabled = true;
          if (i === q.answer) markOption(optEls[i], 'correct');
          else markOption(optEls[i], 'dim');
        }
        if (!correct) markOption(optEls[idx], 'wrong');

        answeredTotal++;
        if (correct) {
          const bonus = bonusOf(api.config);
          const base = Math.round(100 * bonus);
          api.scoring.add(current.id, base, { correct: true, fastest: elapsed });
          const rec = api.scoring.record(current.id);
          const streakNow = rec ? rec.streak : 0;
          const streakBonus = 20 * streakNow;
          api.scoring.add(current.id, streakBonus);
          correctTotal++;
          api.audio.play('correct');
          if (streakNow % 5 === 0) api.audio.play('streak');
          api.shell.toast('+' + FF.util.formatNumber(base + streakBonus), 'good');
          api.shell.updateScores(current.id);
          setTimeout(function () { runQuestion(); }, 650);
        } else {
          api.scoring.add(current.id, 0, { wrong: true });
          api.scoring.resetStreak(current.id);
          api.audio.play('wrong');
          endRun(q, optEls);
        }
      }

      function onTimeout(q, optEls) {
        if (!answering) return;
        answering = false;
        if (timer) { timer.stop(); timer = null; }
        api.scoring.add(current.id, 0, { wrong: true });
        api.scoring.resetStreak(current.id);
        answeredTotal++;
        api.audio.play('wrong');
        endRun(q, optEls);
      }

      renderRunIntro();
    }
  });

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
      const TOTAL = FF.Race ? FF.Race.plan(Math.min(6, items.length), items.length) : Math.min(6, items.length);
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

  /* ============================================================
     5. PICTURE QUIZ — identify the illustration
     ============================================================ */
  FF.registerGame({
    id: 'pictureQuiz',
    name: 'Picture Quiz',
    icon: '🖼️',
    category: 'visual',
    players: [1, 8],
    difficulty: 'Easy',
    duration: 5,
    tags: ['quick'],
    modes: ['solo', 'turn', 'team'],
    defaultMode: 'turn',
    description: 'Look at the picture and pick the right answer.',
    howToPlay: [
      'Take turns looking at a picture.',
      'Pick the correct answer from 4 choices.',
      'Answer fast for a speed bonus.',
      'Most points after 8 rounds wins.'
    ],
    start: function (api) {
      const data = getQuiz();
      if (!data || !notEmpty(data.pictureQuiz)) {
        friendlyExit(api, 'Add picture quiz items to js/data/quiz.js first.');
        return;
      }
      if (!scorerList(api.config).length) {
        friendlyExit(api, 'No players were found for this game.');
        return;
      }

      // Keep only items whose imageKey resolves to an actual SVG illustration.
      const valid = [];
      data.pictureQuiz.forEach(function (p) {
        const v = findVisual(p.imageKey);
        if (v) valid.push({ p: p, v: v });
      });
      if (!valid.length) {
        friendlyExit(api, 'Picture Quiz needs matching illustrations in FF.data.visual (animals, food, landmarks, objects).');
        return;
      }

      const TOTAL = FF.Race ? FF.Race.plan(Math.min(8, valid.length), valid.length) : Math.min(8, valid.length);
      const bag = new api.random.Bag(valid);

      let round = 0;
      let correctTotal = 0;
      let answeredTotal = 0;
      let currentP = null;

      const race = raceFor(api, { rounds: TOTAL, optionSelector: '.quiz-option' });
      const offSettle = race ? race.onSettle(function (payload) {
        if (payload.winnerId) correctTotal++;
        answeredTotal++;
        race.showResult(payload, {
          answerText: currentP ? currentP.options[currentP.answer] : null,
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
        const entry = bag.next();
        const p = entry.p;
        currentP = p;
        const v = entry.v;
        const startTime = Date.now();

        api.shell.updateScores(entity ? entity.id : null);
        FF.ui.clear(api.shell.root);

        const wrap = cardWrap();
        wrap.appendChild(turnChip(entity, roundLabel(round + 1, TOTAL)));
        wrap.appendChild(FF.GameUI.prompt(p.q));
        wrap.appendChild(FF.GameUI.media(api.assets.illustration(v.svg, 'picquiz-img', FF.t('pictureToGuess', 'Picture to guess'))));
        // For people watching (the answer is shared after the round).
        if (race) race.describe({ kind: 'choice', text: p.q, options: p.options, image: { svg: v.svg } }, p.answer);

        const optEls = [];
        const group = optionGroup(wrap);
        p.options.forEach(function (opt, i) {
          const b = optionBtn(opt, function () { onAnswer(i); }, i);
          optEls.push(b);
          group.appendChild(b);
        });

        api.shell.root.appendChild(wrap);
        FF.Nav.focusFirst(api.shell.root);
        if (race) race.gate();

        function onAnswer(idx) {
          const elapsed = (Date.now() - startTime) / 1000;
          const correct = idx === p.answer;

          if (race) {
            race.submit(idx, correct, Date.now() - startTime);
            return;
          }

          for (let i = 0; i < optEls.length; i++) {
            optEls[i].disabled = true;
            if (i === p.answer) markOption(optEls[i], 'correct');
            else markOption(optEls[i], 'dim');
          }
          if (!correct) markOption(optEls[idx], 'wrong');

          answeredTotal++;
          if (correct) {
            const res = awardCorrect(api, entity.id, elapsed);
            correctTotal++;
            api.audio.play('correct');
            if (res.streak) api.audio.play('streak');
            wrap.appendChild(correctLine(res.pts));
          } else {
            awardWrong(api, entity.id);
            api.audio.play('wrong');
            wrap.appendChild(wrongLine());
          }

          if (p.explanation) wrap.appendChild(tipLine(p.explanation));
          const nextBtn = FF.Advance.button(FF.t('next', 'Next'), function () { FF.Audio.play('click'); nextRound(); }, { class: 'btn-lg' });
          wrap.appendChild(nextBtn);

          api.shell.updateScores(entity.id);
          FF.Nav.focus(nextBtn);
        }
      }

      renderRound();
    }
  });
})();
