/* ============================================================
   FAMILY FUN — creativeGames.js
   Five creative/party games:
   - charades           (act out a word)
   - visualCharades     (act out an illustrated scene)
   - dontSayIt          (describe without forbidden words)
   - drawingChallenge   (draw, then players vote)
   - pictionary         (draw, teammates guess)
   Classic script, global window.FF, no modules/network.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  /* ---------- shared helpers ---------- */
  function bonusFor(d) {
    if (d === 'easy') return 1;
    if (d === 'hard') return 2;
    return 1.5;
  }
  function roundPoints(base, d) { return Math.round(base * bonusFor(d)); }

  function scorers(api) {
    var s = (api.config && api.config.scorers && api.config.scorers.length) ? api.config.scorers : null;
    if (!s || !s.length) s = [{ id: 'p1', name: 'Player 1', avatar: '😀', color: '#8b5cf6' }];
    return s;
  }

  function buildResults(api) {
    var r = api.scoring.results();
    return { results: r.results, winnerId: r.winnerId };
  }


  function showMissing(api, msg) {
    var root = api.shell.root;
    FF.ui.clear(root);
    var box = FF.ui.div('panel panel--center', [
      FF.ui.el('h2', {}, '😅 ' + (msg || 'Missing data')),
      FF.ui.el('p', {}, 'This game needs a little more content. Please try another game.'),
      FF.UI.button('Back to home', { icon: 'house',  class: 'btn btn-primary', onClick: function () { FF.GameFlow.exitToHome(); } })
    ]);
    root.appendChild(box);
  }


  /* ---------- shared "reveal then act" flow (charades / visualCharades / dontSayIt) ---------- */
  function runRevealGame(api, items, opts) {
    var root = api.shell.root;
    FF.ui.clear(root);
    if (!items || !items.length) { showMissing(api, 'No prompts available'); return; }

    var bag = new api.random.Bag(items);
    var list = scorers(api);
    var promptsPer = opts.promptsPerPlayer || 2;
    var totalRounds = list.length * promptsPer;
    var roundIdx = 0;
    var ended = false;

    var wrap = FF.ui.div('rv-wrap');
    root.appendChild(wrap);

    function current() { return list[Math.floor(roundIdx / promptsPer) % list.length]; }

    function finish() {
      if (ended) return;
      ended = true;
      api.audio.play('winner');
      api.shell.updateScores();
      api.end(buildResults(api));
    }

    function nextRound() {
      roundIdx++;
      if (roundIdx >= totalRounds) { finish(); return; }
      render();
    }

    function render() {
      FF.ui.clear(wrap);
      var scorer = current();
      var item = bag.next();
      api.shell.updateScores(scorer.id);

      wrap.appendChild(FF.ui.div('rv-who', list.length > 1 ? ('📱 Pass the device to ' + scorer.name) : ('Your turn, ' + scorer.name)));
      wrap.appendChild(FF.UI.button('Reveal', { icon: 'eye',
        class: 'btn btn-primary btn-lg',
        onClick: function () { reveal(item, scorer); }
      }));
    }

    function reveal(item, scorer) {
      FF.ui.clear(wrap);
      api.shell.updateScores(scorer.id);

      var promptBox = FF.ui.div('rv-prompt');
      if (opts.render) {
        promptBox.appendChild(opts.render(item));
      } else {
        promptBox.appendChild(FF.ui.div('rv-word', item.word));
        if (item.category) promptBox.appendChild(FF.ui.div('rv-cat', item.category));
      }
      if (opts.forbidden) {
        var fb = FF.ui.div('rv-forbidden');
        opts.forbidden(item).forEach(function (w) { fb.appendChild(FF.ui.span('', w)); });
        promptBox.appendChild(fb);
      }
      wrap.appendChild(promptBox);

      var hint = FF.ui.div('rv-cat', opts.instruction || 'Act it out! Others guess.');
      wrap.appendChild(hint);

      var timer = null;
      var secs = api.config.timer || 60;
      var remaining = secs;
      var timerEl = FF.ui.div('rv-cat', '⏱ ' + remaining + 's');
      wrap.appendChild(timerEl);
      timer = setInterval(function () {
        remaining--;
        timerEl.textContent = '⏱ ' + remaining + 's';
        if (remaining <= 5 && remaining > 0) api.audio.play('warning');
        if (remaining <= 0) {
          clearInterval(timer);
          timerEl.textContent = "TIME!";
          api.audio.play('roundEnd');
          setTimeout(nextRound, 900);
        }
      }, 1000);

      function answered(btn, pts, sound) {
        if (ended) return;
        clearInterval(timer);
        api.audio.play(sound);
        if (pts) api.scoring.add(scorer.id, roundPoints(pts, api.config.difficulty), { correct: pts > 0 });
        api.shell.updateScores(scorer.id);
        setTimeout(nextRound, 850);
      }

      var actions = FF.ui.div('rv-actions');
      if (opts.buttons) {
        opts.buttons.forEach(function (b) {
          actions.appendChild(FF.ui.button(b.label, { class: 'btn btn-lg', onClick: function () { answered(null, b.points, b.sound); } }));
        });
      } else {
        actions.appendChild(FF.UI.button('Correct', { icon: 'check',  class: 'btn btn-lg btn-primary', onClick: function () { answered(null, 100, 'correct'); } }));
        actions.appendChild(FF.UI.button('Pass', { icon: 'chevron-right',  class: 'btn btn-lg', onClick: function () { answered(null, 0, 'click'); } }));
        actions.appendChild(FF.UI.button('Skip', { icon: 'arrow-right',  class: 'btn btn-lg', onClick: function () { answered(null, 0, 'click'); } }));
      }
      wrap.appendChild(actions);
    }

    render();
  }

  /* ---------- canvas drawing component ---------- */
  function makeCanvas(root, api) {
    var COLORS = ['#111827', '#ef4444', '#3b82f6', '#10b981', '#eab308', '#8b5cf6'];
    var wrap = FF.ui.div('cnv-wrap');

    var toolbar = FF.ui.div('cnv-toolbar');
    var swatches = [];
    var state = { color: '#111827', size: 6, eraser: false };
    var strokes = [];

    COLORS.forEach(function (c) {
      var s = FF.ui.button('', { class: 'swatch' + (c === state.color ? ' active' : ''), style: { background: c }, ariaLabel: 'Colour ' + c, onClick: function () {
        state.color = c; state.eraser = false;
        swatches.forEach(function (x) { x.classList.remove('active'); });
        s.classList.add('active');
        eraserBtn.classList.remove('active');
      } });
      swatches.push(s);
      toolbar.appendChild(s);
    });

    var eraserBtn = FF.UI.button('', {  class: 'btn', ariaLabel: 'Eraser', onClick: function () {
      state.eraser = !state.eraser;
      eraserBtn.classList.toggle('active', state.eraser);
      if (state.eraser) swatches.forEach(function (x) { x.classList.remove('active'); });
    } });
    toolbar.appendChild(eraserBtn);

    [3, 6, 14].forEach(function (sz) {
      toolbar.appendChild(FF.ui.button('●', {
        class: 'btn' + (sz === state.size ? ' btn-primary' : ''),
        style: { fontSize: (sz + 8) + 'px', lineHeight: '0.6' },
        ariaLabel: 'Brush size ' + sz,
        onClick: function () { state.size = sz; }
      }));
    });

    toolbar.appendChild(FF.UI.button('Undo', {  class: 'btn', onClick: function () { strokes.pop(); redraw(); } }));
    toolbar.appendChild(FF.UI.button('Clear', { icon: 'trash',  class: 'btn', onClick: function () { strokes = []; redraw(); } }));

    var canvas = FF.ui.el('canvas', { class: 'cnv-canvas' });
    canvas.width = 800; canvas.height = 500;
    var ctx = canvas.getContext('2d');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    wrap.appendChild(toolbar);
    wrap.appendChild(canvas);
    root.appendChild(wrap);

    function getPos(e) {
      var rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (canvas.width / rect.width),
        y: (e.clientY - rect.top) * (canvas.height / rect.height)
      };
    }

    function redraw() {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      strokes.forEach(function (st) {
        ctx.strokeStyle = st.eraser ? '#ffffff' : st.color;
        ctx.lineWidth = st.size;
        if (st.points.length === 1) {
          ctx.beginPath();
          ctx.arc(st.points[0].x, st.points[0].y, st.size / 2, 0, Math.PI * 2);
          ctx.fillStyle = st.eraser ? '#ffffff' : st.color;
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(st.points[0].x, st.points[0].y);
          for (var i = 1; i < st.points.length; i++) ctx.lineTo(st.points[i].x, st.points[i].y);
          ctx.stroke();
        }
      });
    }

    var currentStroke = null;
    canvas.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
      currentStroke = { color: state.color, size: state.size, eraser: state.eraser, points: [getPos(e)] };
      strokes.push(currentStroke);
      redraw();
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!currentStroke) return;
      currentStroke.points.push(getPos(e));
      redraw();
    });
    canvas.addEventListener('pointerup', function () { currentStroke = null; });
    canvas.addEventListener('pointerleave', function () { currentStroke = null; });

    return { canvas: canvas, wrap: wrap, clear: function () { strokes = []; redraw(); }, isEmpty: function () { return strokes.length === 0; } };
  }

  /* ---------- get items with fallbacks ---------- */
  function party() { return (FF.data && FF.data.party) ? FF.data.party : null; }
  function visual() { return (FF.data && FF.data.visual) ? FF.data.visual : null; }

  /* ============================================================
     1. CHARADES
     ============================================================ */
  FF.registerGame({
    id: 'charades',
    featured: true,
    name: 'Charades',
    description: 'Act out the word — no talking! — while everyone guesses.',
    category: 'creative',
    icon: '🎭',
    players: [1, 8],
    difficulty: 'Easy',
    duration: 6,
    modes: ['solo', 'turn', 'team'],
    defaultMode: 'turn',
    howToPlay: [
      'Pass the device to the active player.',
      'Tap Reveal to see your secret word.',
      'Act it out — no speaking!',
      'Teammates guess; tap Correct when solved.'
    ],
    display: true,
    displayStart: function (api) {
      var p = party();
      if (!p || !p.charades || !p.charades.length) { showMissing(api, 'No charades prompts'); return; }
      FF.Display.deck(api, {
        title: 'Charades',
        tag: 'Everyone plays: act it out',
        items: p.charades,
        interval: 30,
        render: function (item) { return FF.ui.div('dsp-word', item.word); },
        label: function (item) { return item.category || 'Act it out — no talking!'; }
      });
    },
    start: function (api) {
      var p = party();
      if (!p || !p.charades || !p.charades.length) { showMissing(api, 'No charades prompts'); return; }
      runRevealGame(api, p.charades, {
        instruction: 'Act it out — no talking! Others guess aloud.',
        render: function (item) {
          return [FF.ui.div('rv-word', item.word), item.category ? FF.ui.div('rv-cat', item.category) : null];
        }
      });
    }
  });

  /* ============================================================
     2. VISUAL CHARADES
     ============================================================ */
  FF.registerGame({
    id: 'visualCharades',
    name: 'Visual Charades',
    description: 'Act out the picture on screen for everyone to guess.',
    category: 'creative',
    icon: '🖼️',
    players: [1, 8],
    difficulty: 'Easy',
    duration: 6,
    modes: ['solo', 'turn', 'team'],
    defaultMode: 'turn',
    howToPlay: [
      'Pass the device to the active player.',
      'Tap Reveal to see a picture.',
      'Act out what the picture shows.',
      'Others guess; tap Correct when solved.'
    ],
    display: true,
    displayStart: function (api) {
      var v = visual();
      var items = (v && v.visualCharades && v.visualCharades.length) ? v.visualCharades : null;
      if (!items) {
        var p = party();
        if (!p || !p.charades || !p.charades.length) { showMissing(api, 'No visual charades yet'); return; }
        items = p.charades.map(function (c) { return { name: c.word, svg: null }; });
      }
      FF.Display.deck(api, {
        title: 'Visual Charades',
        tag: 'Everyone plays: act it out',
        items: items,
        interval: 30,
        render: function (item) {
          if (item.svg) return [api.assets.illustration(item.svg, 'dsp-illustration', item.name), FF.ui.div('dsp-word', item.name)];
          return FF.ui.div('dsp-word', item.name);
        },
        label: function () { return 'Act out the picture — others guess.'; }
      });
    },
    start: function (api) {
      var v = visual();
      var items = (v && v.visualCharades && v.visualCharades.length) ? v.visualCharades : null;
      if (items) {
        runRevealGame(api, items, {
          instruction: 'Act out the picture — others guess aloud.',
          render: function (item) {
            return [api.assets.illustration(item.svg, 'rv-img', item.name), FF.ui.div('rv-word', item.name)];
          }
        });
      } else {
        var p = party();
        if (!p || !p.charades || !p.charades.length) { showMissing(api, 'No visual charades yet'); return; }
        runRevealGame(api, p.charades, {
          instruction: 'Act it out — others guess aloud.',
          render: function (item) { return FF.ui.div('rv-word', item.word); }
        });
      }
    }
  });

  /* ============================================================
     3. DON'T SAY IT
     ============================================================ */
  FF.registerGame({
    id: 'dontSayIt',
    name: "Don't Say It",
    description: 'Describe the word without using any forbidden words.',
    category: 'creative',
    icon: '🚫',
    players: [1, 8],
    difficulty: 'Normal',
    duration: 6,
    modes: ['solo', 'turn', 'team'],
    defaultMode: 'turn',
    howToPlay: [
      'Describe the word to your team.',
      'Never say any of the forbidden words.',
      'Teammates guess the word.',
      'Tap Correct when they get it.'
    ],
    display: true,
    displayStart: function (api) {
      var p = party();
      if (!p || !p.dontSayIt || !p.dontSayIt.length) { showMissing(api, 'No prompts available'); return; }
      FF.Display.deck(api, {
        title: "Don't Say It",
        tag: 'Everyone plays: describe the word',
        items: p.dontSayIt,
        interval: 40,
        render: function (item) {
          var parts = [FF.ui.div('dsp-word', item.word)];
          if (item.forbidden && item.forbidden.length) {
            var fb = FF.ui.div('dsp-forbidden');
            item.forbidden.forEach(function (w) { fb.appendChild(FF.ui.el('span', {}, w)); });
            parts.push(fb);
          }
          return parts;
        },
        label: function (item) { return item.category || "Describe it — don't say the forbidden words."; }
      });
    },
    start: function (api) {
      var p = party();
      if (!p || !p.dontSayIt || !p.dontSayIt.length) { showMissing(api, 'No prompts available'); return; }
      runRevealGame(api, p.dontSayIt, {
        instruction: 'Describe the word WITHOUT saying the forbidden words.',
        render: function (item) {
          return [FF.ui.div('rv-word', item.word), item.category ? FF.ui.div('rv-cat', item.category) : null];
        },
        forbidden: function (item) { return item.forbidden || []; },
        buttons: [
          { label: '✅ Correct', points: 100, sound: 'correct' },
          { label: '⏭ Pass', points: 0, sound: 'click' },
          { label: '🚫 Forbidden said', points: 0, sound: 'wrong' }
        ]
      });
    }
  });

  /* ============================================================
     4. DRAWING CHALLENGE
     ============================================================ */
  FF.registerGame({
    id: 'drawingChallenge',
    name: 'Drawing Challenge',
    description: 'Draw the prompt, then everyone votes on your artwork.',
    category: 'creative',
    icon: '✏️',
    players: [1, 8],
    difficulty: 'Easy',
    duration: 6,
    modes: ['solo', 'turn', 'team'],
    defaultMode: 'turn',
    howToPlay: [
      'Draw the prompt on the canvas.',
      'Tap Done when finished.',
      'Everyone votes: Great, Good or Funny.',
      'Highest vote wins the round.'
    ],
    start: function (api) {
      var root = api.shell.root;
      FF.ui.clear(root);
      var p = party();
      if (!p || !p.drawingPrompts || !p.drawingPrompts.length) { showMissing(api, 'No drawing prompts'); return; }

      var list = scorers(api);
      var bag = new api.random.Bag(p.drawingPrompts);
      var drawIdx = 0;
      var ended = false;

      function finish() {
        if (ended) return;
        ended = true;
        api.audio.play('winner');
        api.shell.updateScores();
        api.end(buildResults(api));
      }

      function promptPhase(drawer) {
        FF.ui.clear(root);
        api.shell.updateScores(drawer.id);
        var wrap = FF.ui.div('rv-wrap');
        wrap.appendChild(FF.ui.div('rv-who', drawer.name + ', draw this:'));
        var prompt = bag.next();
        wrap.appendChild(FF.ui.div('rv-prompt', FF.ui.div('rv-word', prompt)));
        wrap.appendChild(FF.UI.button('Start drawing', { icon: 'pencil',  class: 'btn btn-primary btn-lg', onClick: function () { drawPhase(drawer, prompt); } }));
        root.appendChild(wrap);
      }

      function drawPhase(drawer, prompt) {
        FF.ui.clear(root);
        api.shell.updateScores(drawer.id);
        var wrap = FF.ui.div('rv-wrap');
        wrap.appendChild(FF.ui.div('rv-who', '🎨 ' + drawer.name + ' — draw: ' + prompt));
        var board = makeCanvas(root, api);
        var doneBtn = FF.UI.button('Done', { icon: 'check',  class: 'btn btn-primary btn-lg', onClick: function () { votePhase(drawer, board); } });
        wrap.appendChild(doneBtn);
        // re-append wrap after canvas
        root.appendChild(wrap);
        api.shell.setTimer(api.config.timer || 60, function () { votePhase(drawer, board); });
      }

      function votePhase(drawer, board) {
        api.shell.hideTimer();
        FF.ui.clear(root);
        api.shell.updateScores(drawer.id);
        var wrap = FF.ui.div('rv-wrap');
        wrap.appendChild(FF.ui.div('rv-who', '👍 Vote on ' + drawer.name + "'s drawing!"));
        wrap.appendChild(board.wrap);
        wrap.appendChild(FF.ui.div('rv-cat', 'What do you think?'));
        var voted = false;
        var actions = FF.ui.div('vote-actions');
        [['👍 Great', 120, 'correct'], ['🙂 Good', 80, 'click'], ['😂 Funny', 60, 'streak']].forEach(function (opt) {
          actions.appendChild(FF.ui.button(opt[0], { class: 'vote-btn', onClick: function () {
            if (voted) return;
            voted = true;
            api.audio.play(opt[2]);
            api.scoring.add(drawer.id, roundPoints(opt[1], api.config.difficulty), { correct: true });
            // voters get a small participation bonus
            list.forEach(function (s) { if (s.id !== drawer.id) api.scoring.add(s.id, roundPoints(30, api.config.difficulty)); });
            api.shell.updateScores();
            drawIdx++;
            if (drawIdx >= list.length) finish(); else promptPhase(list[drawIdx % list.length]);
          } }));
        });
        wrap.appendChild(actions);
        root.appendChild(wrap);
      }

      promptPhase(list[0]);
    }
  });

  /* ============================================================
     5. FAMILY PICTIONARY
     ============================================================ */
  FF.registerGame({
    id: 'pictionary',
    name: 'Family Pictionary',
    description: 'Draw the word and let your team guess it before time runs out.',
    category: 'creative',
    icon: '🎨',
    players: [1, 8],
    difficulty: 'Normal',
    duration: 7,
    modes: ['solo', 'team', 'turn'],
    defaultMode: 'turn',
    howToPlay: [
      'The drawer sees a secret word and draws it.',
      'Everyone else types their guesses.',
      'First correct guess scores for both sides.',
      'Pass or get a new word anytime.'
    ],
    start: function (api) {
      var root = api.shell.root;
      FF.ui.clear(root);
      var p = party();
      if (!p || !p.pictionary || !p.pictionary.length) { showMissing(api, 'No drawing words'); return; }

      var list = scorers(api);
      var bag = new api.random.Bag(p.pictionary);
      var turnIdx = 0;
      var totalRounds = list.length;
      var ended = false;

      function finish() {
        if (ended) return;
        ended = true;
        api.audio.play('winner');
        api.shell.updateScores();
        api.end(buildResults(api));
      }

      function round(drawer, item) {
        FF.ui.clear(root);
        api.shell.updateScores(drawer.id);

        var wrap = FF.ui.div('rv-wrap');
        var promptBox = FF.ui.div('rv-prompt');
        promptBox.appendChild(FF.ui.div('rv-cat', '🎨 ' + drawer.name + ' draws… (keep it secret!)'));
        promptBox.appendChild(FF.ui.div('rv-word', item.word));
        if (item.hint) promptBox.appendChild(FF.ui.div('rv-cat', 'Hint: ' + item.hint));
        wrap.appendChild(promptBox);
        root.appendChild(wrap);

        var board = makeCanvas(root, api);

        var guessWrap = FF.ui.div('rv-wrap');
        guessWrap.appendChild(FF.ui.div('rv-cat', 'Everyone else: type your guesses below.'));
        var input = FF.ui.el('input', { class: 'guess-input', type: 'text', placeholder: 'Your guess…', maxlength: 30 });
        var msg = FF.ui.div('rv-cat', '');

        var solved = false;
        function checkGuess() {
          if (solved || ended) return;
          var g = api.util.normalize(input.value);
          var target = api.util.normalize(item.word);
          if (!g) return;
          if (g === target) {
            solved = true;
            api.audio.play('correct');
            api.scoring.add(drawer.id, roundPoints(100, api.config.difficulty), { correct: true });
            var guesser = list[(turnIdx + 1) % list.length];
            if (guesser.id !== drawer.id) api.scoring.add(guesser.id, roundPoints(100, api.config.difficulty), { correct: true });
            msg.textContent = '🎉 Correct! It was ' + item.word + '.';
            api.shell.updateScores();
            setTimeout(nextRound, 1600);
          } else {
            input.value = '';
            msg.textContent = 'Not quite — keep guessing!';
            api.audio.play('click');
          }
        }

        input.addEventListener('keydown', function (e) { if (e.key === 'Enter') checkGuess(); });
        guessWrap.appendChild(input);
        guessWrap.appendChild(FF.ui.button('Guess', { class: 'btn btn-primary', onClick: checkGuess }));
        guessWrap.appendChild(msg);

        var actions = FF.ui.div('rv-actions');
        actions.appendChild(FF.UI.button('Pass', { icon: 'chevron-right',  class: 'btn', onClick: function () { api.audio.play('click'); nextRound(); } }));
        actions.appendChild(FF.UI.button('New word', {  class: 'btn', onClick: function () { round(drawer, bag.next()); } }));
        guessWrap.appendChild(actions);
        root.appendChild(guessWrap);

        api.shell.setTimer(api.config.timer || 90, function () {
          if (!solved) {
            msg.textContent = "⏱ Time! The word was " + item.word + '.';
            api.audio.play('roundEnd');
            setTimeout(nextRound, 1500);
          }
        });
      }

      function nextRound() {
        turnIdx++;
        if (turnIdx >= totalRounds) { finish(); return; }
        api.shell.hideTimer();
        round(list[turnIdx % list.length], bag.next());
      }

      round(list[0], bag.next());
    }
  });
})();
