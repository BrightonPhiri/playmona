/* ============================================================
   FAMILY FUN — visualGames.js
   Seven turn-based visual "guess the picture" games.
   Classic script (no ES modules) so the app runs from file://.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  // The contract says games register via FF.registerGame. Older builds only
  // expose FF.Games.register, so bridge the two here (idempotent + safe).
  if (typeof FF.registerGame !== 'function' && FF.Games && typeof FF.Games.register === 'function') {
    FF.registerGame = function (def) { FF.Games.register(def); };
  }

  /* ================= Constants ================= */
  var BASE_POINTS = 100;
  var SPEED_BONUS = 50;
  var FAST_MS = 3000;   // answered correctly within 3s earns the speed bonus
  var ROUNDS = 8;

  function difficultyBonus(difficulty) {
    if (difficulty === 'easy') return 1;
    if (difficulty === 'hard') return 2;
    return 1.5; // normal
  }

  function makeOptions(correctName, pool) {
    var others = FF.util.sample(pool.filter(function (n) { return n !== correctName; }), 3);
    var opts = [correctName].concat(others);
    return FF.util.shuffle(opts);
  }

  /* ================= Shared visual styles (inline) ================= */
  function mediaStyle() {
    return {
      minHeight: '260px', maxHeight: '340px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      margin: '0 auto', padding: '12px',
      background: 'var(--surface-2, #f8fafc)',
      border: '1px solid var(--border, #e2e8f0)',
      borderRadius: '20px', overflow: 'hidden'
    };
  }

  function promptStyle() {
    return {
      textAlign: 'center', fontSize: '1.5rem', fontWeight: '900',
      margin: '14px 0 16px', color: 'var(--text, #111827)', letterSpacing: '0.5px'
    };
  }

  function optionStyle() {
    return {
      display: 'block', width: '100%', padding: '14px 16px',
      borderRadius: '14px', fontSize: '1.05rem', fontWeight: '700',
      textAlign: 'center', cursor: 'pointer',
      background: 'var(--surface-2, #f1f5f9)', color: 'var(--text, #111827)',
      border: '2px solid var(--border, #e2e8f0)',
      transition: 'transform .1s ease, background .15s ease, color .15s ease'
    };
  }

  function factStyle() {
    return {
      display: 'none', maxWidth: '640px', margin: '16px auto 0',
      padding: '16px 18px',
      background: 'var(--accent-soft, #ede9fe)',
      border: '1px solid var(--border, #e2e8f0)', borderRadius: '16px'
    };
  }

  function markCorrect(btn) { btn.style.background = '#16a34a'; btn.style.borderColor = '#16a34a'; btn.style.color = '#ffffff'; }
  function markWrong(btn) { btn.style.background = '#dc2626'; btn.style.borderColor = '#dc2626'; btn.style.color = '#ffffff'; }

  /* ================= Reusable multiple-choice visual round =================
     Renders the image large + centered, the question, 4 option buttons, and
     after an answer highlights correct/wrong and shows the fact lines.      */
  function visualRound(container, opts) {
    var answered = false;
    var buttons = [];
    var correctBtn = null;

    var media = FF.ui.el('div', { class: 'ffv-media', style: mediaStyle() });
    media.appendChild(opts.imageDOM);
    container.appendChild(media);

    container.appendChild(FF.ui.el('h2', { class: 'ffv-prompt', style: promptStyle() }, opts.promptText));

    var grid = FF.ui.el('div', {
      class: 'ffv-options',
      style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', maxWidth: '640px', margin: '0 auto' }
    });

    opts.options.forEach(function (name) {
      var btn = FF.ui.el('button', {
        class: 'ffv-option', type: 'button', tabindex: 0, style: optionStyle(),
        onclick: function () { choose(btn, name); }
      }, name);
      if (name === opts.correctName) correctBtn = btn;
      buttons.push(btn);
      grid.appendChild(btn);
    });
    container.appendChild(grid);

    var factBox = FF.ui.el('div', { class: 'ffv-fact', style: factStyle() });
    container.appendChild(factBox);

    function showFact() {
      FF.ui.clear(factBox);
      if (opts.factLines && opts.factLines.length) {
        opts.factLines.forEach(function (line) {
          factBox.appendChild(FF.ui.el('div', {
            class: 'ffv-fact-line',
            style: { fontSize: '1rem', margin: '5px 0', color: 'var(--text, #111827)', fontWeight: '600' }
          }, line));
        });
        factBox.style.display = 'block';
      }
    }

    function disableAll() {
      buttons.forEach(function (b) { b.disabled = true; b.style.cursor = 'default'; });
    }

    function choose(btn, name) {
      if (answered) return;
      answered = true;
      disableAll();
      var correct = (name === opts.correctName);
      if (correctBtn) markCorrect(correctBtn);
      if (!correct) markWrong(btn);
      showFact();
      if (opts.onAnswer) opts.onAnswer(correct);
    }

    return {
      reveal: function () {
        if (answered) return;
        answered = true;
        disableAll();
        if (correctBtn) markCorrect(correctBtn);
        showFact();
      }
    };
  }

  function illustrationImage(api, svg, alt) {
    var ill = api.assets.illustration(svg, 'vis-img', alt);
    ill.style.width = '260px';
    ill.style.height = '260px';
    ill.style.maxWidth = '100%';
    var svgEl = ill.querySelector('svg');
    if (svgEl) {
      svgEl.style.width = '100%';
      svgEl.style.height = '100%';
      svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    }
    return ill;
  }

  // Guess the Object: presentation changes with difficulty.
  function objectImage(api, item, difficulty) {
    var hard = (difficulty === 'hard');
    var box = FF.ui.el('div', {
      style: {
        width: '300px', height: '260px', maxWidth: '100%', position: 'relative',
        background: '#ffffff', borderRadius: '18px', overflow: 'hidden',
        border: '1px solid var(--border, #e2e8f0)'
      }
    });
    var ill = api.assets.illustration(item.svg, 'vis-img', item.name);
    var svg = ill.querySelector('svg');
    if (svg) {
      svg.style.width = '100%';
      svg.style.height = '100%';
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      if (hard) {
        svg.style.width = '600px';
        svg.style.height = '600px';
        svg.style.position = 'absolute';
        svg.style.left = '50%';
        svg.style.top = '50%';
        svg.style.transform = 'translate(-50%, -50%)';
      }
    }
    box.appendChild(ill);

    if (difficulty === 'normal') {
      // partially obscured: a semi-transparent scrim + two opaque blocks
      box.appendChild(FF.ui.el('div', { style: { position: 'absolute', top: '0', left: '0', right: '0', bottom: '0', background: 'rgba(100,116,139,0.35)' } }));
      box.appendChild(FF.ui.el('div', { style: { position: 'absolute', left: '10%', top: '8%', width: '44%', height: '38%', background: '#334155', borderRadius: '12px' } }));
      box.appendChild(FF.ui.el('div', { style: { position: 'absolute', right: '8%', bottom: '10%', width: '42%', height: '36%', background: '#1e293b', borderRadius: '12px' } }));
    }
    return box;
  }

  /* ================= Friendly missing-data screen ================= */
  function showMissingData(api, label) {
    FF.ui.clear(api.shell.root);
    var box = FF.ui.el('div', {
      class: 'panel',
      style: { maxWidth: '480px', margin: '8vh auto', textAlign: 'center', padding: '30px 24px' }
    });
    box.appendChild(FF.ui.el('div', { style: { fontSize: '3rem' } }, '😅'));
    box.appendChild(FF.ui.el('h2', {}, 'No ' + label + ' data'));
    box.appendChild(FF.ui.el('p', { style: { color: 'var(--muted, #6b7280)', margin: '10px 0 18px' } },
      'The ' + label + ' content has not been loaded yet. Please check the data files and try again.'));
    box.appendChild(FF.ui.button('🏠 Exit', { class: 'btn-lg', primary: true, onClick: function () { FF.GameFlow.exitToHome(); } }));
    api.shell.root.appendChild(box);
  }

  /* ================= Data access ================= */
  function getCountries() {
    return (FF.data && FF.data.countries && FF.data.countries.length) ? FF.data.countries : null;
  }
  function getVisual() {
    return (FF.data && FF.data.visual) ? FF.data.visual : null;
  }

  /* ================= Turn-based visual game engine ================= */
  function runVisualGame(api, spec) {
    var items = spec.items;
    var rounds = Math.min(spec.rounds || ROUNDS, items.length);
    var scorers = (api.config.scorers && api.config.scorers.length) ? api.config.scorers : api.config.players;
    var bag = api.random.Bag(items);
    var roundIndex = 0;
    var totalCorrect = 0;
    var totalAnswered = 0;
    var finished = false;

    function stopShellTimer() {
      try { api.shell.hideTimer(); } catch (e) { /* ignore */ }
    }

    function finish() {
      if (finished) return;
      finished = true;
      stopShellTimer();
      var res = api.scoring.results();
      var out = { results: res.results, winnerId: res.winnerId, quizCorrect: totalCorrect, quizAnswered: totalAnswered };
      var bestStreak = 0;
      var fastest = null;
      (res.results || []).forEach(function (r) {
        if (r.bestStreak > bestStreak) bestStreak = r.bestStreak;
        if (r.fastest != null && (fastest == null || r.fastest < fastest)) fastest = r.fastest;
      });
      if (bestStreak) out.bestStreak = bestStreak;
      if (fastest != null) out.fastest = fastest / 1000;
      api.end(out);
    }

    function showNext() {
      var last = roundIndex >= rounds - 1;
      var nextBtn = FF.Advance.button(last ? '🏁 FINISH' : 'NEXT ▶', function () {
        roundIndex++;
        nextRound();
      }, { class: 'btn-lg' });
      nextBtn.style.display = 'block';
      nextBtn.style.margin = '18px auto 0';
      nextBtn.style.minWidth = '200px';
      api.shell.root.appendChild(nextBtn);
      FF.safe(function () { FF.Nav.focus(nextBtn); });
    }

    function handleAnswer(active, correct, elapsed) {
      stopShellTimer();
      if (correct) {
        var pts = Math.round(BASE_POINTS * difficultyBonus(api.config.difficulty));
        if (elapsed <= FAST_MS) pts += SPEED_BONUS;
        api.scoring.add(active.id, pts, { correct: true, fastest: elapsed });
        totalCorrect++;
        api.audio.play('correct');
      } else {
        api.scoring.markAnswer(active.id, false, null);
        api.audio.play('wrong');
      }
      totalAnswered++;
      api.shell.updateScores(active.id);
      showNext();
    }

    function handleTimeout(active) {
      api.scoring.markAnswer(active.id, false, null);
      totalAnswered++;
      api.audio.play('wrong');
      api.shell.updateScores(active.id);
      showNext();
    }

    function nextRound() {
      if (finished) return;
      if (roundIndex >= rounds) { finish(); return; }

      var active = scorers[roundIndex % scorers.length];
      var item = bag.next();

      var q = FF.safe(function () { return spec.build(item, api.config.difficulty); });
      if (!q) { roundIndex++; nextRound(); return; }

      FF.ui.clear(api.shell.root);
      api.shell.updateScores(active ? active.id : null);

      var wrap = FF.ui.el('div', { class: 'ffv-round', style: { maxWidth: '720px', margin: '0 auto', paddingBottom: '20px' } });

      // round + turn header
      var head = FF.ui.el('div', {
        style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', maxWidth: '640px', margin: '0 auto 10px' }
      });
      head.appendChild(FF.ui.el('span', {
        style: { fontWeight: '800', fontSize: '0.9rem', color: 'var(--muted, #6b7280)', letterSpacing: '1px' }
      }, 'ROUND ' + (roundIndex + 1) + ' / ' + rounds));
      if (active && api.config.mode !== 'solo') {
        head.appendChild(FF.ui.el('span', {
          style: { fontWeight: '800', fontSize: '1rem', color: 'var(--accent, #8b5cf6)', background: 'var(--accent-soft, #ede9fe)', padding: '6px 14px', borderRadius: '999px' }
        }, (active.avatar || '😀') + ' ' + active.name + "'s turn"));
      }
      wrap.appendChild(head);

      var startTime = Date.now();
      var answered = false;

      var controls = visualRound(wrap, {
        imageDOM: q.imageDOM,
        promptText: q.promptText,
        correctName: q.correctName,
        options: q.options,
        factLines: q.factLines,
        onAnswer: function (correct) {
          if (answered) return;
          answered = true;
          handleAnswer(active, correct, Date.now() - startTime);
        }
      });

      api.shell.root.appendChild(wrap);

      if (api.config.timer && api.config.timer > 0) {
        api.shell.setTimer(api.config.timer, function () {
          if (answered) return;
          answered = true;
          controls.reveal();
          handleTimeout(active);
        });
      }
    }

    nextRound();
  }

  /* ================= 1. Guess the Country ================= */
  FF.registerGame({
    id: 'guessCountry',
    name: 'Guess the Country',
    description: 'Identify the country from its flag.',
    category: 'world',
    icon: '🌍',
    players: [1, 8],
    difficulty: 'Normal',
    duration: 5,
    tags: ['visual'],
    modes: ['solo', 'turn', 'team'],
    defaultMode: 'turn',
    howToPlay: [
      'Look at the flag on screen.',
      'Choose which country it belongs to.',
      'Correct answers earn points — be quick for a bonus!',
      'Most points wins.'
    ],
    start: function (api) {
      var countries = getCountries();
      if (!countries) { showMissingData(api, 'country'); return; }
      var names = countries.map(function (c) { return c.name; });
      runVisualGame(api, {
        items: countries,
        rounds: ROUNDS,
        build: function (country) {
          var code = (FF.data && FF.data.flagCodes) ? FF.data.flagCodes[country.id] : null;
          var flag = api.flags.render(country.flag, { code: code, cls: 'flag-big', alt: country.name });
          flag.style.width = '360px';
          flag.style.height = '240px';
          flag.style.maxWidth = '100%';
          return {
            imageDOM: flag,
            promptText: 'WHICH COUNTRY?',
            correctName: country.name,
            options: makeOptions(country.name, names)
          };
        }
      });
    }
  });

  /* ================= 2. Guess the Landmark ================= */
  FF.registerGame({
    id: 'guessLandmark',
    name: 'Guess the Landmark',
    description: 'Spot the famous landmark and name its country.',
    category: 'visual',
    icon: '🏛️',
    players: [1, 8],
    difficulty: 'Normal',
    duration: 5,
    tags: ['visual'],
    modes: ['solo', 'turn', 'team'],
    defaultMode: 'turn',
    howToPlay: [
      'Look at the landmark illustration.',
      'Choose which country it is in.',
      'Correct answers earn points — be quick for a bonus!',
      'Most points wins.'
    ],
    start: function (api) {
      var vis = getVisual();
      var landmarks = vis ? vis.landmarks : null;
      if (!landmarks || !landmarks.length) { showMissingData(api, 'landmark'); return; }
      var countries = [];
      landmarks.forEach(function (l) {
        if (l.country && countries.indexOf(l.country) === -1) countries.push(l.country);
      });
      runVisualGame(api, {
        items: landmarks,
        rounds: ROUNDS,
        build: function (item) {
          var factLines = [
            '🏛️ ' + (item.name || ''),
            '🌍 Country: ' + (item.country || '—'),
            '🏙️ City: ' + (item.city || '—')
          ];
          if (item.fact) factLines.push('💡 ' + item.fact);
          return {
            imageDOM: illustrationImage(api, item.svg, item.name),
            promptText: 'WHERE IS THIS?',
            correctName: item.country,
            options: makeOptions(item.country, countries),
            factLines: factLines
          };
        }
      });
    }
  });

  /* ================= 3. Guess the Animal ================= */
  FF.registerGame({
    id: 'guessAnimal',
    name: 'Guess the Animal',
    description: 'Name the animal from its picture.',
    category: 'visual',
    icon: '🐾',
    players: [1, 8],
    difficulty: 'Easy',
    duration: 4,
    tags: ['visual'],
    modes: ['solo', 'turn', 'team'],
    defaultMode: 'turn',
    howToPlay: [
      'Look at the animal illustration.',
      'Choose which animal it is.',
      'Correct answers earn points — be quick for a bonus!',
      'Most points wins.'
    ],
    start: function (api) {
      var vis = getVisual();
      var animals = vis ? vis.animals : null;
      if (!animals || !animals.length) { showMissingData(api, 'animal'); return; }
      var names = animals.map(function (a) { return a.name; });
      runVisualGame(api, {
        items: animals,
        rounds: ROUNDS,
        build: function (item) {
          var factLines = [];
          if (item.category) factLines.push('🐾 ' + item.category);
          if (item.fact) factLines.push('💡 ' + item.fact);
          return {
            imageDOM: illustrationImage(api, item.svg, item.name),
            promptText: 'WHAT ANIMAL IS THIS?',
            correctName: item.name,
            options: makeOptions(item.name, names),
            factLines: factLines
          };
        }
      });
    }
  });

  /* ================= 4. Guess the Food ================= */
  FF.registerGame({
    id: 'guessFood',
    name: 'Guess the Food',
    description: 'Name the dish from its picture.',
    category: 'visual',
    icon: '🍽️',
    players: [1, 8],
    difficulty: 'Easy',
    duration: 4,
    tags: ['visual'],
    modes: ['solo', 'turn', 'team'],
    defaultMode: 'turn',
    howToPlay: [
      'Look at the food illustration.',
      'Choose which food it is.',
      'Correct answers earn points — be quick for a bonus!',
      'Most points wins.'
    ],
    start: function (api) {
      var vis = getVisual();
      var foods = vis ? vis.food : null;
      if (!foods || !foods.length) { showMissingData(api, 'food'); return; }
      var names = foods.map(function (f) { return f.name; });
      runVisualGame(api, {
        items: foods,
        rounds: ROUNDS,
        build: function (item) {
          var factLines = [];
          if (item.origin) factLines.push('📍 Origin: ' + item.origin);
          if (item.fact) factLines.push('💡 ' + item.fact);
          return {
            imageDOM: illustrationImage(api, item.svg, item.name),
            promptText: 'WHAT FOOD IS THIS?',
            correctName: item.name,
            options: makeOptions(item.name, names),
            factLines: factLines
          };
        }
      });
    }
  });

  /* ================= 5. Guess the Object ================= */
  FF.registerGame({
    id: 'guessObject',
    name: 'Guess the Object',
    description: 'Name the everyday object — easy, obscured or zoomed in.',
    category: 'visual',
    icon: '📦',
    players: [1, 8],
    difficulty: 'Normal',
    duration: 4,
    tags: ['visual'],
    modes: ['solo', 'turn', 'team'],
    defaultMode: 'turn',
    howToPlay: [
      'Look at the object illustration.',
      'On harder levels it may be hidden or zoomed in.',
      'Choose which object it is.',
      'Correct answers earn points — be quick for a bonus!'
    ],
    start: function (api) {
      var vis = getVisual();
      var objects = vis ? vis.objects : null;
      if (!objects || !objects.length) { showMissingData(api, 'object'); return; }
      var names = objects.map(function (o) { return o.name; });
      runVisualGame(api, {
        items: objects,
        rounds: ROUNDS,
        build: function (item, difficulty) {
          var factLines = [];
          if (item.fact) factLines.push('💡 ' + item.fact);
          return {
            imageDOM: objectImage(api, item, difficulty),
            promptText: 'WHAT IS THIS?',
            correctName: item.name,
            options: makeOptions(item.name, names),
            factLines: factLines
          };
        }
      });
    }
  });

  /* ================= 6. Guess the Sport ================= */
  FF.registerGame({
    id: 'guessSport',
    name: 'Guess the Sport',
    description: 'Which sport is shown?',
    category: 'visual',
    icon: '🏅',
    players: [1, 8],
    difficulty: 'Easy',
    duration: 4,
    tags: ['visual'],
    modes: ['solo', 'turn', 'team'],
    defaultMode: 'turn',
    howToPlay: [
      'Look at the sport illustration.',
      'Choose which sport it is.',
      'Correct answers earn points — be quick for a bonus!',
      'Most points wins.'
    ],
    start: function (api) {
      var vis = getVisual();
      var sports = vis ? vis.sports : null;
      if (!sports || !sports.length) { showMissingData(api, 'sport'); return; }
      var names = sports.map(function (s) { return s.name; });
      runVisualGame(api, {
        items: sports,
        rounds: ROUNDS,
        build: function (item) {
          return {
            imageDOM: illustrationImage(api, item.svg, item.name),
            promptText: 'WHICH SPORT IS THIS?',
            correctName: item.name,
            options: makeOptions(item.name, names),
            factLines: ['🏅 ' + item.name]
          };
        }
      });
    }
  });

  /* ================= 7. Guess the Vehicle ================= */
  FF.registerGame({
    id: 'guessVehicle',
    name: 'Guess the Vehicle',
    description: 'Name the vehicle from its picture.',
    category: 'visual',
    icon: '🚗',
    players: [1, 8],
    difficulty: 'Easy',
    duration: 4,
    tags: ['visual'],
    modes: ['solo', 'turn', 'team'],
    defaultMode: 'turn',
    howToPlay: [
      'Look at the vehicle illustration.',
      'Choose which vehicle it is.',
      'Correct answers earn points — be quick for a bonus!',
      'Most points wins.'
    ],
    start: function (api) {
      var vis = getVisual();
      var vehicles = vis ? vis.vehicles : null;
      if (!vehicles || !vehicles.length) { showMissingData(api, 'vehicle'); return; }
      var names = vehicles.map(function (v) { return v.name; });
      runVisualGame(api, {
        items: vehicles,
        rounds: ROUNDS,
        build: function (item) {
          return {
            imageDOM: illustrationImage(api, item.svg, item.name),
            promptText: 'WHAT VEHICLE IS THIS?',
            correctName: item.name,
            options: makeOptions(item.name, names),
            factLines: ['🚗 ' + item.name]
          };
        }
      });
    }
  });
})();
