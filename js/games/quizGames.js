/* ============================================================
   FAMILY FUN — quizGames.js
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

  function cardWrap() {
    return FF.ui.el('div', { style: { maxWidth: '660px', margin: '0 auto', textAlign: 'center' } });
  }

  function optionBtn(label, onClick) {
    return FF.ui.el('button', {
      type: 'button',
      class: 'btn quiz-option',
      style: {
        display: 'block', width: '100%', margin: '10px 0', padding: '16px 18px',
        fontSize: '1.08rem', textAlign: 'left', borderRadius: '14px', cursor: 'pointer',
        border: '2px solid var(--border)', background: 'var(--surface)', color: 'var(--text)',
        fontWeight: '700'
      },
      onclick: onClick
    }, label);
  }

  function bigTFButton(label, onClick) {
    return FF.ui.el('button', {
      type: 'button',
      class: 'btn',
      style: {
        flex: '1 1 200px', minWidth: '150px', padding: '30px 20px', fontSize: '1.6rem',
        fontWeight: '800', borderRadius: '18px', cursor: 'pointer',
        background: 'var(--surface)', color: 'var(--text)', border: '3px solid var(--border)'
      },
      onclick: onClick
    }, label);
  }

  // kind: 'correct' (green), 'wrong' (red), anything else (dim).
  function markOption(btn, kind) {
    if (!btn) return;
    if (kind === 'correct') {
      btn.style.background = '#16a34a';
      btn.style.borderColor = '#15803d';
      btn.style.color = '#ffffff';
    } else if (kind === 'wrong') {
      btn.style.background = '#dc2626';
      btn.style.borderColor = '#b91c1c';
      btn.style.color = '#ffffff';
    } else {
      btn.style.opacity = '0.45';
    }
  }

  function turnChip(entity, roundText) {
    const bar = FF.ui.div('');
    bar.style.display = 'flex';
    bar.style.justifyContent = 'center';
    bar.style.gap = '10px';
    bar.style.flexWrap = 'wrap';
    bar.style.marginBottom = '14px';
    // In a room nobody takes turns - everyone races the same question,
    // so naming one player would be wrong on every other device.
    if (FF.Race && FF.Race.active()) {
      bar.appendChild(FF.ui.span('meta-chip', '🏁 Everyone races'));
    } else if (entity) {
      bar.appendChild(FF.ui.span('meta-chip', entity.avatar + ' ' + entity.name));
    }
    if (roundText) bar.appendChild(FF.ui.span('meta-chip', roundText));
    return bar;
  }

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
      beginRound: function (n) { FF.Race.beginRound(n); },

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
    if (api.shell && api.shell.hideTimer) api.shell.hideTimer();
    FF.ui.clear(api.shell.root);
    const wrap = FF.ui.div('panel panel--center');
    wrap.style.maxWidth = '560px';
    wrap.style.margin = '8vh auto';
    wrap.appendChild(FF.ui.el('h2', { style: { fontSize: '1.6rem', margin: '0 0 10px' } }, '😕 No questions yet'));
    wrap.appendChild(FF.ui.el('p', {}, msg || 'This game needs more quiz data before it can be played.'));
    wrap.appendChild(FF.ui.button('🚪 Exit Game', {
      class: 'btn-lg',
      primary: true,
      onClick: function () { FF.Audio.play('click'); FF.GameFlow.exitToHome(); }
    }));
    api.shell.root.appendChild(wrap);
    FF.Nav.focusFirst(api.shell.root);
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
     1. FAMILY QUIZ — 10 turn-based multiple-choice rounds
     ============================================================ */
  FF.registerGame({
    id: 'familyQuiz',
    name: 'Family Quiz',
    icon: '🧠',
    category: 'quiz',
    players: [1, 8],
    difficulty: 'Easy',
    duration: 6,
    tags: ['quick', 'family'],
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
      const ROUNDS = 10;

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
          isLast: (round + 1) >= ROUNDS,
          onNext: function () { round++; nextRound(); }
        });
      }) : null;

      function nextRound() {
        round++;
        if (round >= ROUNDS) {
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
        wrap.appendChild(turnChip(entity, 'Round ' + (round + 1) + ' of ' + ROUNDS));
        if (q.category) wrap.appendChild(FF.ui.span('meta-chip meta-chip--cat', q.category));
        wrap.appendChild(FF.ui.el('h2', { style: { fontSize: '1.5rem', margin: '14px 0 6px' } }, q.q));

        const optEls = [];
        q.options.forEach(function (opt, i) {
          const b = optionBtn(opt, function () { onAnswer(i); });
          optEls.push(b);
          wrap.appendChild(b);
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
            optEls[i].style.cursor = 'default';
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
            wrap.appendChild(FF.ui.el('p', { class: 'hint', style: { fontSize: '1.05rem' } }, '✅ Correct! +' + res.pts + ' points' + (res.streak ? ' 🔥 streak bonus' : '')));
          } else {
            awardWrong(api, entity.id);
            api.audio.play('wrong');
            wrap.appendChild(FF.ui.el('p', { class: 'hint', style: { fontSize: '1.05rem' } }, '❌ Not quite.'));
          }

          if (q.explanation) wrap.appendChild(FF.ui.el('p', { class: 'hint' }, '💡 ' + q.explanation));
          const nextBtn = FF.Advance.button('Next ➡', function () { FF.Audio.play('click'); nextRound(); }, { class: 'btn-lg' });
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
      const ROUNDS = 8;

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
          isLast: (round + 1) >= ROUNDS,
          onNext: function () { nextRound(); }
        });
      }) : null;

      function nextRound() {
        round++;
        if (round >= ROUNDS) {
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
        wrap.appendChild(turnChip(entity, 'Round ' + (round + 1) + ' of ' + ROUNDS));
        wrap.appendChild(FF.ui.el('h2', { style: { fontSize: '1.5rem', margin: '10px 0 16px' } }, item.q));

        const timerLabel = FF.ui.div('');
        timerLabel.style.fontSize = '1.3rem';
        timerLabel.style.fontWeight = '800';
        timerLabel.style.color = 'var(--accent)';
        timerLabel.style.marginBottom = '12px';
        if (api.config.timer > 0) timerLabel.textContent = '⏱ ' + api.config.timer + 's';
        wrap.appendChild(timerLabel);

        const row = FF.ui.div('');
        row.style.display = 'flex';
        row.style.gap = '14px';
        row.style.flexWrap = 'wrap';
        row.style.justifyContent = 'center';

        const trueBtn = bigTFButton('✅ TRUE', function () { answer(true); });
        const falseBtn = bigTFButton('❌ FALSE', function () { answer(false); });
        row.appendChild(trueBtn);
        row.appendChild(falseBtn);
        wrap.appendChild(row);

        api.shell.root.appendChild(wrap);
        if (race) race.gate();
        FF.Nav.focusFirst(api.shell.root);

        if (api.config.timer > 0) {
          timer = api.timer.create({
            onTick: function (rem) {
              timerLabel.textContent = '⏱ ' + Math.max(0, Math.ceil(rem)) + 's';
              if (rem <= 5) timerLabel.style.color = 'var(--danger)';
            },
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
          trueBtn.style.cursor = 'default';
          falseBtn.style.cursor = 'default';
          if (item.answer === true) markOption(trueBtn, 'correct'); else markOption(trueBtn, 'dim');
          if (item.answer === false) markOption(falseBtn, 'correct'); else markOption(falseBtn, 'dim');

          answeredTotal++;
          if (correct) {
            const res = awardCorrect(api, entity.id, elapsed);
            correctTotal++;
            api.audio.play('correct');
            if (res.streak) api.audio.play('streak');
            wrap.appendChild(FF.ui.el('p', { class: 'hint', style: { fontSize: '1.05rem' } }, '✅ Correct! +' + res.pts + ' points'));
          } else {
            awardWrong(api, entity.id);
            api.audio.play('wrong');
            wrap.appendChild(FF.ui.el('p', { class: 'hint', style: { fontSize: '1.05rem' } }, '❌ Not quite.'));
          }

          wrap.appendChild(FF.ui.el('p', { class: 'hint' }, 'Answer: ' + (item.answer ? 'TRUE ✅' : 'FALSE ❌')));
          if (item.explanation) wrap.appendChild(FF.ui.el('p', { class: 'hint' }, '💡 ' + item.explanation));
          const nextBtn = FF.Advance.button('Next ➡', function () { FF.Audio.play('click'); nextRound(); }, { class: 'btn-lg' });
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
        wrap.appendChild(turnChip(current, 'Run ' + (runIdx + 1) + ' of ' + all.length));
        wrap.appendChild(FF.ui.el('h2', { style: { fontSize: '1.7rem' } }, current.avatar + ' ' + current.name));
        wrap.appendChild(FF.ui.el('p', { class: 'hint', style: { fontSize: '1.05rem' } }, 'Answer as many questions as you can. One wrong answer — or the timer running out — ends your run!'));
        wrap.appendChild(FF.ui.button('▶ START RUN', { class: 'btn-lg', primary: true, onClick: function () { FF.Audio.play('roundStart'); runQuestion(); } }));
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

        const info = FF.ui.div('');
        info.style.display = 'flex';
        info.style.justifyContent = 'center';
        info.style.gap = '12px';
        info.style.flexWrap = 'wrap';
        info.style.marginBottom = '10px';
        info.appendChild(FF.ui.span('meta-chip', '🔥 Streak: ' + streakNow));
        const timerLabel = FF.ui.span('meta-chip', '⏱ ' + perSec + 's');
        info.appendChild(timerLabel);
        wrap.appendChild(info);

        wrap.appendChild(FF.ui.el('h2', { style: { fontSize: '1.4rem', margin: '8px 0' } }, q.q));

        const optEls = [];
        q.options.forEach(function (opt, i) {
          const b = optionBtn(opt, function () { onAnswer(i, q, optEls); });
          optEls.push(b);
          wrap.appendChild(b);
        });

        api.shell.root.appendChild(wrap);
        FF.Nav.focusFirst(api.shell.root);

        timer = api.timer.create({
          onTick: function (rem) {
            timerLabel.textContent = '⏱ ' + Math.max(0, Math.ceil(rem)) + 's';
            if (rem <= 5) timerLabel.style.color = 'var(--danger)';
          },
          onFinish: function () { onTimeout(q, optEls); },
          warningAt: 5
        });
        timer.start(perSec);
      }

      function endRun(q, optEls) {
        // reveal correct answer and end the current player's run
        for (let i = 0; i < optEls.length; i++) {
          optEls[i].disabled = true;
          optEls[i].style.cursor = 'default';
          if (i === q.answer) markOption(optEls[i], 'correct');
          else markOption(optEls[i], 'dim');
        }
        api.shell.updateScores(current.id);

        const nextName = runIdx + 1 < all.length ? all[runIdx + 1].name : null;
        const rec = api.scoring.record(current.id);

        const wrap = cardWrap();
        wrap.appendChild(FF.ui.el('h2', { style: { fontSize: '1.6rem' } }, current.avatar + ' ' + current.name + '\'s run is over!'));
        wrap.appendChild(FF.ui.el('p', { class: 'hint' }, '🔥 Best streak: ' + (rec ? rec.bestStreak : 0) + '   •   ✅ ' + (rec ? rec.correct : 0) + ' correct'));
        wrap.appendChild(FF.ui.el('p', { class: 'hint', style: { fontSize: '1.05rem' } }, 'Answer: ' + q.options[q.answer]));
        if (q.explanation) wrap.appendChild(FF.ui.el('p', { class: 'hint' }, '💡 ' + q.explanation));
        wrap.appendChild(api.ui.button(nextName ? ('▶ ' + nextName + '\'s Run') : '🏁 See Results', {
          class: 'btn-lg', primary: true,
          onClick: function () {
            FF.Audio.play('roundStart');
            runIdx++;
            if (runIdx >= all.length) finishBrain();
            else renderRunIntro();
          }
        }));
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
          optEls[i].style.cursor = 'default';
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
          api.shell.toast('✅ +' + (base + streakBonus));
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
      const TOTAL = Math.min(6, items.length);
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
          isLast: (round + 1) >= TOTAL,
          onNext: function () { nextRound(); }
        });
      }) : null;

      function nextRound() {
        round++;
        if (round >= TOTAL) {
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

        api.shell.updateScores(entity ? entity.id : null);

        function pointsNow() { return cluePoints[revealed] || 50; }

        function render() {
          FF.ui.clear(api.shell.root);
          const wrap = cardWrap();
          wrap.appendChild(turnChip(entity, 'Round ' + (round + 1) + ' of ' + TOTAL));
          wrap.appendChild(FF.ui.el('h2', { style: { fontSize: '1.6rem' } }, '🕵️ Who / What am I?'));

          for (let i = 0; i < revealed; i++) {
            wrap.appendChild(FF.ui.el('p', { class: 'hint', style: { fontSize: '1.15rem' } }, '🔎 ' + item.clues[i]));
          }

          wrap.appendChild(FF.ui.span('meta-chip', '💎 ' + pointsNow() + ' points'));

          const actions = FF.ui.div('');
          actions.style.marginTop = '18px';
          actions.style.display = 'flex';
          actions.style.gap = '12px';
          actions.style.justifyContent = 'center';
          actions.style.flexWrap = 'wrap';

          actions.appendChild(api.ui.button('🕵️ Guess Now', { class: 'btn-lg', primary: true, onClick: function () { FF.Audio.play('select'); guessNow(); } }));
          if (revealed < item.clues.length) {
            actions.appendChild(api.ui.button('➡ Next Clue', { class: 'btn-lg', onClick: function () { revealed++; FF.Audio.play('flip'); render(); } }));
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
          wrap.appendChild(turnChip(entity, 'Round ' + (round + 1) + ' of ' + TOTAL));
          wrap.appendChild(FF.ui.el('h2', { style: { fontSize: '1.5rem' } }, '🕵️ Take your guess!'));
          wrap.appendChild(FF.ui.el('p', { class: 'hint' }, 'Revealed ' + revealed + ' clue(s) — worth ' + pointsNow() + ' points.'));

          const optEls = [];
          opts.forEach(function (opt, i) {
            const b = optionBtn(opt, function () { pick(i); });
            optEls.push(b);
            wrap.appendChild(b);
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
              optEls[i].style.cursor = 'default';
              if (opts[i] === item.answer) markOption(optEls[i], 'correct');
              else markOption(optEls[i], 'dim');
            }
            if (!correct) markOption(optEls[idx], 'wrong');

            answeredTotal++;
            if (correct) {
              api.scoring.add(entity.id, value, { correct: true, fastest: elapsed });
              correctTotal++;
              api.audio.play('correct');
              wrap.appendChild(FF.ui.el('p', { class: 'hint', style: { fontSize: '1.05rem' } }, '✅ Correct! +' + value + ' points'));
            } else {
              awardWrong(api, entity.id);
              api.audio.play('wrong');
              wrap.appendChild(FF.ui.el('p', { class: 'hint', style: { fontSize: '1.05rem' } }, '❌ Not quite.'));
            }

            wrap.appendChild(FF.ui.el('p', { class: 'hint' }, '🎯 Answer: ' + item.answer));
            const nextBtn = FF.Advance.button('Next ➡', function () { FF.Audio.play('click'); nextRound(); }, { class: 'btn-lg' });
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

      const TOTAL = Math.min(8, valid.length);
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
          isLast: (round + 1) >= TOTAL,
          onNext: function () { nextRound(); }
        });
      }) : null;

      function nextRound() {
        round++;
        if (round >= TOTAL) {
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
        wrap.appendChild(turnChip(entity, 'Round ' + (round + 1) + ' of ' + TOTAL));
        wrap.appendChild(FF.ui.el('h2', { style: { fontSize: '1.5rem', margin: '6px 0 10px' } }, p.q));

        const imgBox = FF.ui.div('', api.assets.illustration(v.svg, 'picquiz-img', v.name));
        imgBox.style.maxWidth = '300px';
        imgBox.style.margin = '0 auto 6px';
        wrap.appendChild(imgBox);

        const optEls = [];
        p.options.forEach(function (opt, i) {
          const b = optionBtn(opt, function () { onAnswer(i); });
          optEls.push(b);
          wrap.appendChild(b);
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
            optEls[i].style.cursor = 'default';
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
            wrap.appendChild(FF.ui.el('p', { class: 'hint', style: { fontSize: '1.05rem' } }, '✅ Correct! +' + res.pts + ' points'));
          } else {
            awardWrong(api, entity.id);
            api.audio.play('wrong');
            wrap.appendChild(FF.ui.el('p', { class: 'hint', style: { fontSize: '1.05rem' } }, '❌ Not quite.'));
          }

          if (p.explanation) wrap.appendChild(FF.ui.el('p', { class: 'hint' }, '💡 ' + p.explanation));
          const nextBtn = FF.Advance.button('Next ➡', function () { FF.Audio.play('click'); nextRound(); }, { class: 'btn-lg' });
          wrap.appendChild(nextBtn);

          api.shell.updateScores(entity.id);
          FF.Nav.focus(nextBtn);
        }
      }

      renderRound();
    }
  });
})();
