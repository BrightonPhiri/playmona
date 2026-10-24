/* ============================================================
   PLAYMONA — visualGames.js
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

  /* Styles live in css/games.css (.ffv-*); buttons come from FF.GameUI. */
  function markCorrect(btn) { FF.GameUI.markOption(btn, 'correct'); }
  function markWrong(btn) { FF.GameUI.markOption(btn, 'wrong'); }

  /* ================= Reusable multiple-choice visual round =================
     Renders the image large + centered, the question, 4 option buttons, and
     after an answer highlights correct/wrong and shows the fact lines.      */
  function visualRound(container, opts) {
    var answered = false;
    var buttons = [];
    var correctBtn = null;

    var media = FF.ui.el('div', { class: 'ffv-media' });
    media.appendChild(opts.imageDOM);
    container.appendChild(media);

    container.appendChild(FF.ui.el('h2', { class: 'ffv-prompt gm-prompt' }, opts.promptText));

    var grid = FF.GameUI.options({ columns: 2, className: 'ffv-options' });

    opts.options.forEach(function (name, i) {
      var btn = FF.GameUI.option(name, function () { choose(btn, name); }, i, { className: 'ffv-option' });
      if (name === opts.correctName) correctBtn = btn;
      buttons.push(btn);
      grid.appendChild(btn);
    });
    container.appendChild(grid);

    var factBox = FF.ui.el('div', { class: 'ffv-fact', role: 'status', hidden: true });
    container.appendChild(factBox);

    function showFact() {
      FF.ui.clear(factBox);
      if (opts.factLines && opts.factLines.length) {
        factBox.appendChild(FF.Icons.icon('lightbulb'));
        var lines = FF.ui.div('ffv-fact__lines');
        opts.factLines.forEach(function (line) {
          lines.appendChild(FF.ui.el('p', { class: 'ffv-fact-line' }, String(line).replace(/^💡\s*/, '')));
        });
        factBox.appendChild(lines);
        factBox.hidden = false;
      }
    }

    function disableAll() {
      buttons.forEach(function (b) {
        b.disabled = true;
        if (b !== correctBtn) FF.GameUI.markOption(b, 'dim');
      });
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
    var svgEl = ill.querySelector('svg');
    if (svgEl) svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    return ill;
  }

  // Guess the Object: presentation changes with difficulty.
  function objectImage(api, item, difficulty) {
    var hard = (difficulty === 'hard');
    var box = FF.ui.div('obj-frame' + (hard ? ' obj-frame--zoom' : ''));
    var ill = api.assets.illustration(item.svg, 'vis-img', FF.t('pictureToGuess', 'Picture to guess'));
    var svg = ill.querySelector('svg');
    if (svg) svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    box.appendChild(ill);

    if (difficulty === 'normal') {
      // partially obscured: a semi-transparent scrim + two opaque blocks
      box.appendChild(FF.ui.div('obj-cover obj-cover--scrim'));
      box.appendChild(FF.ui.div('obj-cover obj-cover--a'));
      box.appendChild(FF.ui.div('obj-cover obj-cover--b'));
    }
    return box;
  }

  /* ================= Friendly missing-data screen ================= */
  function showMissingData(api, label) {
    FF.GameUI.exitCard(api, FF.t('noDataFor', 'No {x} data', { x: label }), FF.t('noDataText', 'This content has not loaded. Check the data files and try again.'));
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
    if (FF.Race && FF.Race.active && FF.Race.active()) rounds = FF.Race.plan(rounds, items.length);
    var scorers = (api.config.scorers && api.config.scorers.length) ? api.config.scorers : api.config.players;
    var bag = api.random.Bag(items);
    var roundIndex = 0;
    var totalCorrect = 0;
    var totalAnswered = 0;
    var finished = false;

    // ---- Race support. Offline this is all inert. ----
    var racing = !!(FF.Race && FF.Race.active && FF.Race.active());
    var offSettle = null;
    var currentCorrectName = null;

    if (racing) {
      FF.Race.begin(api.def.id, {
        rounds: rounds,
        timerMs: (api.config.timer || 0) * 1000,
        pointsFor: function (answer) {
          var pts = Math.round(BASE_POINTS * difficultyBonus(api.config.difficulty));
          if (answer.ms != null && answer.ms <= FAST_MS) pts += SPEED_BONUS;
          return pts;
        }
      });
      offSettle = FF.Race.onSettle(function (payload) {
        stopShellTimer();
        if (payload.winnerId) totalCorrect++;
        totalAnswered++;
        FF.Race.syncScoring();
        api.shell.updateScores();
        FF.RaceUI.result(api.shell.root, {
          payload: payload,
          answerText: currentCorrectName,
          isLast: FF.Race.isLastRound(roundIndex, rounds),
          onNext: function () { roundIndex++; nextRound(); }
        });
      });
    }

    function stopShellTimer() {
      try { api.shell.hideTimer(); } catch (e) { /* ignore */ }
    }

    function finish() {
      if (finished) return;
      finished = true;
      stopShellTimer();
      if (offSettle) { offSettle(); offSettle = null; }
      if (racing) FF.Race.end();
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
      var nextBtn = FF.Advance.button(last ? FF.t('finish', 'Finish') : FF.t('next', 'Next'), function () {
        roundIndex++;
        nextRound();
      }, { class: 'btn-lg', icon: last ? 'check' : 'arrow-right' });
      var holder = api.shell.root.querySelector('.ffv-round') || api.shell.root;
      holder.appendChild(nextBtn);
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
      if (roundIndex >= rounds || (racing && FF.Race.over(roundIndex))) { finish(); return; }
      if (racing) FF.Race.beginRound(roundIndex);

      var active = scorers[roundIndex % scorers.length];
      var item = bag.next();

      var q = FF.safe(function () { return spec.build(item, api.config.difficulty); });
      if (!q) { roundIndex++; nextRound(); return; }

      FF.ui.clear(api.shell.root);
      api.shell.updateScores(active ? active.id : null);

      var wrap = FF.GameUI.stage({ className: 'ffv-round' });

      // Round + turn header. In a room nobody takes turns - everyone races
      // the same question (FF.GameUI.turnBar handles that).
      wrap.appendChild(FF.GameUI.turnBar(api.config.mode !== 'solo' ? active : null,
        racing ? FF.Race.roundText(roundIndex + 1, rounds) : FF.t('roundOf', 'Round {n} of {total}', { n: roundIndex + 1, total: rounds })));

      var startTime = Date.now();
      var answered = false;
      currentCorrectName = q.correctName;

      var controls = visualRound(wrap, {
        imageDOM: q.imageDOM,
        promptText: q.promptText,
        correctName: q.correctName,
        options: q.options,
        factLines: q.factLines,
        onAnswer: function (correct) {
          if (answered) return;
          if (racing) {
            // Measure from the shared open instant so times compare fairly.
            var shared = FF.Race.msSinceOpen();
            // The race decides the round; a wrong answer only locks
            // this device out while everyone else keeps playing.
            FF.Race.submit(null, correct, shared != null ? shared : (Date.now() - startTime));
            if (!correct) FF.RaceUI.lockOut(api.shell.root, '.ffv-option');
            return;
          }
          answered = true;
          handleAnswer(active, correct, Date.now() - startTime);
        }
      });

      api.shell.root.appendChild(wrap);

      function openRound() {
        startTime = Date.now();
        if (api.config.timer && api.config.timer > 0) {
          api.shell.setTimer(api.config.timer, function () {
            if (answered) return;
            answered = true;
            controls.reveal();
            handleTimeout(active);
          });
        }
      }

      if (racing) {
        api.shell.hideTimer();
        FF.RaceUI.gate(api.shell.root, '.ffv-option', openRound);
      } else if (api.config.timer && api.config.timer > 0) {
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
    featured: true,
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
          var flag = api.flags.render(country.flag, { code: code, cls: 'flag-big', alt: FF.t('aFlag', 'A country flag') });
          return {
            imageDOM: flag,
            promptText: FF.t('whichCountry', 'Which country is this?'),
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
            '' + (item.name || ''),
            'Country: ' + (item.country || '—'),
            'City: ' + (item.city || '—')
          ];
          if (item.fact) factLines.push('' + item.fact);
          return {
            imageDOM: illustrationImage(api, item.svg, FF.t('pictureToGuess', 'Picture to guess')),
            promptText: FF.t('whereIsThis', 'Where is this?'),
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
          if (item.category) factLines.push('' + item.category);
          if (item.fact) factLines.push('' + item.fact);
          return {
            imageDOM: illustrationImage(api, item.svg, FF.t('pictureToGuess', 'Picture to guess')),
            promptText: FF.t('whatAnimal', 'What animal is this?'),
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
          if (item.origin) factLines.push('Origin: ' + item.origin);
          if (item.fact) factLines.push('' + item.fact);
          return {
            imageDOM: illustrationImage(api, item.svg, FF.t('pictureToGuess', 'Picture to guess')),
            promptText: FF.t('whatFood', 'What food is this?'),
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
          if (item.fact) factLines.push('' + item.fact);
          return {
            imageDOM: objectImage(api, item, difficulty),
            promptText: FF.t('whatIsThis', 'What is this?'),
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
            imageDOM: illustrationImage(api, item.svg, FF.t('pictureToGuess', 'Picture to guess')),
            promptText: FF.t('whichSport', 'Which sport is this?'),
            correctName: item.name,
            options: makeOptions(item.name, names),
            factLines: ['' + item.name]
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
            imageDOM: illustrationImage(api, item.svg, FF.t('pictureToGuess', 'Picture to guess')),
            promptText: FF.t('whatVehicle', 'What vehicle is this?'),
            correctName: item.name,
            options: makeOptions(item.name, names),
            factLines: ['' + item.name]
          };
        }
      });
    }
  });
})();
