/* ============================================================
   FAMILY FUN — reactionGames.js
   Reaction games: Quick Tap (reflex test) and Color Reaction
   (Stroop-style ink-colour challenge).
   Classic script (no ES modules) so the app runs from file://
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  /* ================= helpers ================= */

  // The DEV_GUIDE references FF.registerGame, but the engine exposes
  // FF.Games.register. Prefer the documented alias if it exists, then
  // fall back to the engine function so registration always works.
  function registerGame(def) {
    if (typeof FF.registerGame === 'function') { FF.registerGame(def); return; }
    if (FF.Games && typeof FF.Games.register === 'function') { FF.Games.register(def); }
  }

  function difficultyBonus(difficulty) {
    if (difficulty === 'easy') return 1;
    if (difficulty === 'hard') return 2;
    return 1.5; // normal
  }

  function ensureStyles(id, css) {
    if (document.getElementById(id)) return;
    var style = document.createElement('style');
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function renderMissing(api, msg) {
    var root = api.shell.root;
    api.ui.clear(root);
    var wrap = api.ui.div('rt-empty');
    wrap.appendChild(api.ui.div('rt-empty__icon', '😅'));
    wrap.appendChild(api.ui.el('p', { class: 'rt-empty__msg' }, msg));
    wrap.appendChild(api.ui.button('🏠 Exit', { primary: true, class: 'btn-lg', onClick: function () {
      FF.GameFlow.exitToHome();
    } }));
    root.appendChild(wrap);
  }

  function focusSafe(node) {
    if (node && typeof FF.Nav !== 'undefined' && FF.Nav.focus) { FF.Nav.focus(node); }
  }

  /* Shared layout styles for both reaction games (theme-aware). */
  var REACTION_CSS = [
    '.rt-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;text-align:center;min-height:60vh;padding:24px;}',
    '.rt-empty__icon{font-size:4rem;}',
    '.rt-empty__msg{font-size:1.1rem;max-width:34ch;}',
    '.rt-wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;text-align:center;min-height:70vh;padding:16px;}',
    '.rt-avatar{font-size:4rem;line-height:1;}',
    '.rt-name{font-size:1.6rem;font-weight:900;margin:0;}',
    '.rt-hint{font-size:1rem;opacity:0.8;max-width:40ch;margin:0;}',
    '.rt-stats{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;}',
    '.rt-stat{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px 18px;min-width:112px;}',
    '.rt-stat__label{display:block;font-size:0.76rem;opacity:0.7;text-transform:uppercase;letter-spacing:0.05em;}',
    '.rt-stat__value{display:block;font-size:1.35rem;font-weight:800;margin-top:2px;}',
    '.rt-stat--row{display:flex;justify-content:space-between;gap:24px;width:100%;max-width:340px;padding:10px 16px;}',
    '.rt-stat--row .rt-stat__value{font-size:1.15rem;}',
    '',
    /* Quick Tap */
    '.qt-who{font-size:1.2rem;font-weight:800;}',
    '.qt-round{font-size:0.9rem;opacity:0.75;}',
    '.qt-prompt{font-size:2.6rem;font-weight:900;letter-spacing:0.06em;min-height:3.6rem;margin:0;}',
    '.qt-prompt--go{color:var(--accent);}',
    '.qt-prompt--good{color:#22c55e;}',
    '.qt-prompt--bad{color:#ef4444;}',
    '.qt-pad{width:280px;height:280px;max-width:62vw;max-height:62vw;border-radius:50%;font-size:2rem;font-weight:900;border:6px solid var(--border);background:var(--surface);color:var(--text);cursor:pointer;box-shadow:0 12px 30px rgba(0,0,0,0.18);transition:transform .08s ease;}',
    '.qt-pad:hover{transform:scale(1.03);}',
    '.qt-pad:active{transform:scale(0.95);}',
    '.qt-pad.go{background:var(--accent);color:var(--accent-text);border-color:var(--accent-dark);}',
    '.qt-pad.fail{background:#ef4444;color:#fff;border-color:#b91c1c;}',
    '.qt-times{width:100%;max-width:420px;display:flex;flex-direction:column;gap:8px;}',
    '.qt-time{display:flex;justify-content:space-between;gap:12px;padding:10px 14px;background:var(--surface);border:1px solid var(--border);border-radius:12px;}',
    '.qt-time__num{opacity:0.7;}',
    '.qt-time__val{font-weight:700;}',
    '.qt-time--bad .qt-time__val{color:#ef4444;}',
    '',
    /* Color Reaction */
    '.cr-who{font-size:1.15rem;font-weight:800;}',
    '.cr-word{font-size:4.2rem;font-weight:900;letter-spacing:0.05em;line-height:1.1;text-shadow:0 4px 14px rgba(0,0,0,0.25);}',
    '.cr-question{font-size:1.2rem;font-weight:700;opacity:0.9;}',
    '.cr-options{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;width:100%;max-width:440px;}',
    '.cr-btn{display:flex;flex-direction:column;align-items:center;gap:8px;padding:14px 10px;border-radius:14px;background:var(--surface);border:2px solid var(--border);cursor:pointer;}',
    '.cr-btn:hover,.cr-btn:focus,.cr-btn.focused{border-color:var(--accent);}',
    '.cr-btn.correct{border-color:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,0.35);}',
    '.cr-btn:disabled{cursor:default;opacity:0.9;}',
    '.cr-swatch{width:46px;height:46px;border-radius:10px;box-shadow:inset 0 0 0 1px rgba(0,0,0,0.12);}',
    '.cr-label{font-weight:700;}',
    '.cr-bar{width:100%;max-width:440px;height:8px;border-radius:6px;background:var(--border);overflow:hidden;}',
    '.cr-bar__fill{height:100%;width:100%;background:var(--accent);transition:width .1s linear;}',
    '.cr-feedback{min-height:1.7rem;font-weight:800;font-size:1.1rem;}',
    '.cr-feedback.good{color:#22c55e;}',
    '.cr-feedback.bad{color:#ef4444;}'
  ].join('\n');

  /* ================= Game 1: Quick Tap ================= */

  registerGame({
    id: 'quickTap',
    name: 'Quick Tap',
    description: 'Test your reflexes — tap the moment the signal appears.',
    category: 'reaction',
    icon: '👆',
    players: [1, 8],
    difficulty: 'Easy',
    duration: 3,
    tags: ['quick', 'reflex'],
    modes: ['solo', 'turn'],
    defaultMode: 'turn',
    howToPlay: [
      'Watch the screen — it will show GET READY.',
      'The moment it changes to TAP!, hit the big button.',
      'Tap during the wait and that round is a false start.',
      'Fastest average reaction time wins!'
    ],
    start: function (api) { startQuickTap(api); }
  });

  function startQuickTap(api) {
    ensureStyles('ff-reaction-css', REACTION_CSS);

    var scorers = api.config.scorers;
    if (!scorers || !scorers.length) {
      renderMissing(api, 'Add at least one player to play Quick Tap.');
      return;
    }

    var bonus = difficultyBonus(api.config.difficulty);
    var roundsPerPlayer = 3;
    var players = scorers.slice();
    if (api.config.randomOrder) players = api.util.shuffle(players);

    var summary = [];
    var index = 0;

    function scoreForAverage(avg) {
      if (avg < 0.3) return 300;
      if (avg < 0.5) return 200;
      if (avg < 0.8) return 150;
      return 100;
    }

    function statCard(label, value) {
      var c = api.ui.div('rt-stat');
      c.appendChild(api.ui.span('rt-stat__label', label));
      c.appendChild(api.ui.span('rt-stat__value', value));
      return c;
    }

    function next() {
      if (index >= players.length) { finish(); return; }
      var player = players[index];
      index++;
      intro(player);
    }

    function intro(player) {
      var root = api.shell.root;
      api.ui.clear(root);
      var wrap = api.ui.div('rt-wrap');
      wrap.appendChild(api.ui.div('rt-avatar', player.avatar));
      wrap.appendChild(api.ui.el('h2', { class: 'rt-name' }, player.name));
      wrap.appendChild(api.ui.div('rt-hint', players.length > 1 ? 'Pass the device to ' + player.name + '.' : 'Ready when you are.'));
      wrap.appendChild(api.ui.div('rt-hint', roundsPerPlayer + ' tries — tap only when you see TAP!'));
      var startBtn = api.ui.button('▶ START', { primary: true, class: 'btn-lg', onClick: function () {
        api.audio.play('roundStart');
        runRounds(player, 0, []);
      } });
      wrap.appendChild(startBtn);
      root.appendChild(wrap);
      focusSafe(startBtn);
    }

    function runRounds(player, roundNumber, times) {
      if (roundNumber >= roundsPerPlayer) { finalize(player, times); return; }
      runRound(player, roundNumber, times, function () {
        runRounds(player, roundNumber + 1, times);
      });
    }

    function runRound(player, roundNumber, times, onDone) {
      var root = api.shell.root;
      api.ui.clear(root);

      var state = { phase: 'waiting', timer: null, startTime: 0, done: false };

      var wrap = api.ui.div('rt-wrap');
      var who = api.ui.div('qt-who', player.avatar + ' ' + player.name);
      var roundLabel = api.ui.div('qt-round', 'Round ' + (roundNumber + 1) + ' of ' + roundsPerPlayer);
      var prompt = api.ui.div('qt-prompt', 'GET READY...');
      var pad = api.ui.button('WAIT', { class: 'qt-pad', ariaLabel: 'Tap button', onClick: onTap });

      wrap.appendChild(who);
      wrap.appendChild(roundLabel);
      wrap.appendChild(prompt);
      wrap.appendChild(pad);
      root.appendChild(wrap);
      focusSafe(pad);

      function onTap() {
        if (state.done) return;
        if (state.phase === 'waiting') {
          state.done = true;
          clearTimeout(state.timer);
          prompt.textContent = 'Too soon!';
          prompt.className = 'qt-prompt qt-prompt--bad';
          pad.textContent = 'TOO SOON!';
          pad.classList.add('fail');
          pad.disabled = true;
          api.audio.play('wrong');
          times.push(null);
          setTimeout(onDone, 900);
        } else if (state.phase === 'ready') {
          state.done = true;
          clearTimeout(state.timer);
          var ms = Date.now() - state.startTime;
          var sec = ms / 1000;
          prompt.textContent = sec.toFixed(3) + ' seconds';
          prompt.className = 'qt-prompt qt-prompt--good';
          pad.disabled = true;
          api.audio.play('tap');
          times.push(sec);
          setTimeout(onDone, 900);
        }
      }

      // FF._rand() so the signal fires at the same instant on every device in a room.
      var delay = 2000 + Math.floor(FF._rand() * 3001); // 2–5 seconds
      state.timer = setTimeout(function () {
        if (state.done) return;
        state.phase = 'ready';
        state.startTime = Date.now();
        prompt.textContent = 'TAP!';
        prompt.className = 'qt-prompt qt-prompt--go';
        pad.textContent = 'TAP!';
        pad.classList.add('go');
        api.audio.play('countdown');
      }, delay);
    }

    function finalize(player, times) {
      var valid = times.filter(function (t) { return t != null; });
      var best = null;
      var sum = 0;
      valid.forEach(function (t) { if (best == null || t < best) best = t; sum += t; });
      var avg = valid.length ? (sum / valid.length) : null;
      var points = avg == null ? 0 : Math.round(scoreForAverage(avg) * bonus);

      var bestMs = best == null ? null : Math.round(best * 1000);
      api.scoring.add(player.id, points, { correct: valid.length > 0, fastest: bestMs });
      api.shell.updateScores(player.id);

      summary.push({
        id: player.id, name: player.name, avatar: player.avatar, color: player.color,
        points: points, correct: valid.length, fastest: best
      });

      var root = api.shell.root;
      api.ui.clear(root);
      var wrap = api.ui.div('rt-wrap');
      wrap.appendChild(api.ui.el('h2', { class: 'rt-name' }, player.avatar + ' ' + player.name));

      var list = api.ui.div('qt-times');
      times.forEach(function (t, i) {
        var row = api.ui.div('qt-time' + (t == null ? ' qt-time--bad' : ''));
        row.appendChild(api.ui.span('qt-time__num', 'Try ' + (i + 1)));
        row.appendChild(api.ui.span('qt-time__val', t == null ? 'False start!' : t.toFixed(3) + ' seconds'));
        list.appendChild(row);
      });
      wrap.appendChild(list);

      var stats = api.ui.div('rt-stats');
      stats.appendChild(statCard('Best', best == null ? '—' : best.toFixed(3) + ' s'));
      stats.appendChild(statCard('Average', avg == null ? '—' : avg.toFixed(3) + ' s'));
      stats.appendChild(statCard('Points', api.util.formatNumber(points)));
      wrap.appendChild(stats);

      var isLast = index >= players.length;
      var nextBtn = FF.Advance.button(isLast ? '🏆 RESULTS' : 'NEXT ▶', function () {
        api.audio.play('select');
        next();
      }, { class: 'btn-lg' });
      wrap.appendChild(nextBtn);
      root.appendChild(wrap);
      focusSafe(nextBtn);
    }

    function finish() {
      var results = summary.slice().sort(function (a, b) { return b.points - a.points; });
      var winner = results[0];
      var fastestSec = null;
      results.forEach(function (r) {
        if (r.fastest != null && (fastestSec == null || r.fastest < fastestSec)) fastestSec = r.fastest;
      });
      api.end({
        results: results.map(function (r) {
          return { id: r.id, name: r.name, avatar: r.avatar, color: r.color, points: r.points, correct: r.correct, bestStreak: 0, fastest: r.fastest };
        }),
        winnerId: winner ? winner.id : null,
        fastest: fastestSec
      });
    }

    next();
  }

  /* ================= Game 2: Color Reaction ================= */

  var STROOP_COLORS = [
    { name: 'Red', css: '#ef4444' },
    { name: 'Blue', css: '#3b82f6' },
    { name: 'Green', css: '#22c55e' },
    { name: 'Yellow', css: '#eab308' }
  ];

  registerGame({
    id: 'colorReaction',
    name: 'Color Reaction',
    description: 'A tricky colour challenge — name the ink, not the word.',
    category: 'reaction',
    icon: '🌈',
    players: [1, 8],
    difficulty: 'Normal',
    duration: 4,
    tags: ['quick', 'brain'],
    modes: ['turn', 'solo'],
    defaultMode: 'turn',
    howToPlay: [
      'A colour word appears on screen (like RED).',
      'The word is drawn in a different colour of ink.',
      'Tap the button that matches the INK colour, not the word.',
      'Quick answers earn a speed bonus!'
    ],
    start: function (api) { startColorReaction(api); }
  });

  function startColorReaction(api) {
    ensureStyles('ff-reaction-css', REACTION_CSS);

    var scorers = api.config.scorers;
    if (!scorers || !scorers.length) {
      renderMissing(api, 'Add at least one player to play Color Reaction.');
      return;
    }

    var difficulty = api.config.difficulty || 'normal';
    var bonus = difficultyBonus(difficulty);
    var roundsPerPlayer = 8;

    // Difficulty tuning: easy = 50% conflicting, normal = mostly
    // conflicting, hard = always conflicting + a shorter timer.
    var conflictChance = difficulty === 'easy' ? 0.5 : (difficulty === 'hard' ? 1 : 0.75);
    var timeLimitMs = difficulty === 'hard' ? 1600 : (difficulty === 'normal' ? 3200 : 4500);
    var fastMs = difficulty === 'hard' ? 1200 : 1500;

    var players = scorers.slice();
    if (api.config.randomOrder) players = api.util.shuffle(players);

    var stats = {};
    players.forEach(function (p) {
      stats[p.id] = { correct: 0, wrong: 0, streak: 0, bestStreak: 0, fastestMs: null };
    });

    var index = 0;

    function statRow(label, value) {
      var r = api.ui.div('rt-stat rt-stat--row');
      r.appendChild(api.ui.span('rt-stat__label', label));
      r.appendChild(api.ui.span('rt-stat__value', value));
      return r;
    }

    function next() {
      if (index >= players.length) { finish(); return; }
      var player = players[index];
      index++;
      intro(player);
    }

    function intro(player) {
      var root = api.shell.root;
      api.ui.clear(root);
      var wrap = api.ui.div('rt-wrap');
      wrap.appendChild(api.ui.div('rt-avatar', player.avatar));
      wrap.appendChild(api.ui.el('h2', { class: 'rt-name' }, player.name));
      wrap.appendChild(api.ui.div('rt-hint', players.length > 1 ? 'Pass the device to ' + player.name + '.' : 'Ready when you are.'));
      wrap.appendChild(api.ui.div('rt-hint', roundsPerPlayer + ' rounds — answer the colour of the INK, not the word.'));
      var startBtn = api.ui.button('▶ START', { primary: true, class: 'btn-lg', onClick: function () {
        api.audio.play('roundStart');
        runRounds(player, 0);
      } });
      wrap.appendChild(startBtn);
      root.appendChild(wrap);
      focusSafe(startBtn);
    }

    function runRounds(player, roundNumber) {
      if (roundNumber >= roundsPerPlayer) { finalize(player); return; }
      runRound(player, roundNumber, function () { runRounds(player, roundNumber + 1); });
    }

    function makeRound() {
      var word = STROOP_COLORS[api.util.int(0, STROOP_COLORS.length - 1)];
      var ink;
      if (FF._rand() < conflictChance) {
        var others = STROOP_COLORS.filter(function (c) { return c.name !== word.name; });
        ink = api.util.pick(others);
      } else {
        ink = word;
      }
      return { word: word, ink: ink };
    }

    function runRound(player, roundNumber, onDone) {
      var round = makeRound();
      var resolved = false;
      var timer = null;
      var startedAt = Date.now();

      var root = api.shell.root;
      api.ui.clear(root);

      var wrap = api.ui.div('rt-wrap');
      var who = api.ui.div('cr-who', player.avatar + ' ' + player.name + ' — Round ' + (roundNumber + 1) + '/' + roundsPerPlayer);
      var word = api.ui.div('cr-word', round.word.name);
      word.style.color = round.ink.css;
      var question = api.ui.div('cr-question', 'What colour is the text?');

      var options = api.ui.div('cr-options');
      var buttons = [];
      STROOP_COLORS.forEach(function (c) {
        var btn = api.ui.el('button', {
          class: 'cr-btn',
          ariaLabel: c.name,
          onclick: function () { answer(c); }
        });
        btn.appendChild(api.ui.el('span', { class: 'cr-swatch', style: { background: c.css } }, ''));
        btn.appendChild(api.ui.span('cr-label', c.name));
        options.appendChild(btn);
        buttons.push(btn);
      });

      var bar = api.ui.div('cr-bar');
      var barFill = api.ui.div('cr-bar__fill');
      bar.appendChild(barFill);

      var feedback = api.ui.div('cr-feedback', '');

      wrap.appendChild(who);
      wrap.appendChild(word);
      wrap.appendChild(question);
      wrap.appendChild(options);
      wrap.appendChild(bar);
      wrap.appendChild(feedback);
      root.appendChild(wrap);
      focusSafe(buttons[0]);

      var limitSec = timeLimitMs / 1000;

      function resolve(correct, elapsedMs, msgOverride) {
        if (resolved) return;
        resolved = true;
        if (timer) timer.stop();
        var s = stats[player.id];
        if (correct) {
          s.correct++;
          s.streak++;
          if (s.streak > s.bestStreak) s.bestStreak = s.streak;
          if (s.fastestMs == null || elapsedMs < s.fastestMs) s.fastestMs = elapsedMs;
          var speed = elapsedMs <= fastMs ? 50 : 0;
          var pts = Math.round(100 * bonus) + speed;
          api.scoring.add(player.id, pts, { correct: true, fastest: elapsedMs });
          feedback.textContent = 'Correct! +' + pts + (speed ? ' ⚡fast!' : '');
          feedback.className = 'cr-feedback good';
          api.audio.play('correct');
        } else {
          s.wrong++;
          s.streak = 0;
          api.scoring.add(player.id, 0, { wrong: true });
          api.scoring.resetStreak(player.id);
          feedback.textContent = msgOverride || ('Wrong — the text is ' + round.ink.name + '.');
          feedback.className = 'cr-feedback bad';
          api.audio.play('wrong');
        }
        reveal();
        api.shell.updateScores(player.id);
        setTimeout(onDone, 1100);
      }

      function reveal() {
        buttons.forEach(function (b, i) {
          b.disabled = true;
          if (STROOP_COLORS[i].name === round.ink.name) b.classList.add('correct');
        });
      }

      function answer(picked) {
        if (resolved) return;
        var elapsed = Date.now() - startedAt;
        resolve(picked.name === round.ink.name, elapsed);
      }

      timer = api.timer.create({
        onTick: function (remaining) {
          var pct = Math.max(0, Math.min(100, (remaining / limitSec) * 100));
          barFill.style.width = pct + '%';
        },
        onFinish: function () {
          if (resolved) return;
          resolve(false, timeLimitMs, 'Too slow! The text was ' + round.ink.name + '.');
        }
      });
      timer.start(limitSec);
    }

    function finalize(player) {
      var s = stats[player.id];
      api.shell.updateScores(player.id);

      var root = api.shell.root;
      api.ui.clear(root);
      var wrap = api.ui.div('rt-wrap');
      wrap.appendChild(api.ui.el('h2', { class: 'rt-name' }, player.avatar + ' ' + player.name));

      var list = api.ui.div('rt-stats');
      list.appendChild(statRow('Correct', s.correct + ' / ' + roundsPerPlayer));
      list.appendChild(statRow('Wrong', s.wrong));
      list.appendChild(statRow('Best streak', s.bestStreak));
      list.appendChild(statRow('Fastest', s.fastestMs == null ? '—' : (s.fastestMs / 1000).toFixed(3) + ' s'));
      list.appendChild(statRow('Points', api.util.formatNumber(api.scoring.get(player.id))));
      wrap.appendChild(list);

      var isLast = index >= players.length;
      var nextBtn = FF.Advance.button(isLast ? '🏆 RESULTS' : 'NEXT ▶', function () {
        api.audio.play('select');
        next();
      }, { class: 'btn-lg' });
      wrap.appendChild(nextBtn);
      root.appendChild(wrap);
      focusSafe(nextBtn);
    }

    function finish() {
      var results = players.slice().map(function (p) {
        var s = stats[p.id];
        return {
          id: p.id, name: p.name, avatar: p.avatar, color: p.color,
          points: api.scoring.get(p.id),
          correct: s.correct, wrong: s.wrong,
          bestStreak: s.bestStreak,
          fastest: s.fastestMs
        };
      }).sort(function (a, b) { return b.points - a.points; });

      var winner = results[0];
      var bestStreak = 0;
      var fastestMs = null;
      results.forEach(function (r) {
        if (r.bestStreak > bestStreak) bestStreak = r.bestStreak;
        if (r.fastest != null && (fastestMs == null || r.fastest < fastestMs)) fastestMs = r.fastest;
      });

      api.end({
        results: results,
        winnerId: winner ? winner.id : null,
        bestStreak: bestStreak,
        fastest: fastestMs == null ? null : fastestMs / 1000
      });
    }

    next();
  }
})();
