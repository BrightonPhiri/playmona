/* ============================================================
   PLAYMORA — quizRun.js
   One 10-question run, built from a seed so everyone who uses the
   same seed gets exactly the same questions in the same order.
   Used by the Daily challenge and Challenge a friend.

   FF.QuizRun.build(seed, topic)  -> questions
   FF.QuizRun.play(opts)           -> full-screen run, then opts.onDone(result)
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var t = function (k, f, v) {
    if (FF.t) return FF.t(k, f, v);
    return String(f).replace(/\{(\w+)\}/g, function (m, n) { return v && v[n] != null ? v[n] : m; });
  };
  var COUNT = 10;
  var TIME_MC = 15;
  var TIME_TF = 10;

  var TOPICS = [
    { id: 'mixed', icon: 'sparkle', name: 'Mixed', desc: 'A bit of everything' },
    { id: 'knowledge', icon: 'brain', name: 'General knowledge', desc: 'Quiz questions from every subject' },
    { id: 'world', icon: 'globe', name: 'Flags and capitals', desc: 'How well do you know the world?' },
    { id: 'truefalse', icon: 'scales', name: 'True or false', desc: 'Quick calls, ten seconds each' }
  ];

  function quiz() { return (FF.data && FF.data.quiz) || {}; }
  function countries() {
    var c = (FF.data && FF.data.countries) || [];
    return Array.isArray(c) ? c.filter(function (x) { return x && x.name; }) : [];
  }

  // Draw items from a pool without repeats inside one run.
  function drawer(list) {
    var bag = FF.util.shuffle(list.slice());
    return function () { return bag.length ? bag.pop() : null; };
  }

  function mc(item) {
    var order = FF.util.shuffle(item.options.map(function (_, i) { return i; }));
    return {
      type: 'mc', prompt: item.q, time: TIME_MC, explanation: item.explanation || '',
      options: order.map(function (i) { return item.options[i]; }),
      answer: order.indexOf(item.answer), tag: item.category || ''
    };
  }

  function tf(item) {
    return {
      type: 'tf', prompt: item.q, time: TIME_TF, explanation: item.explanation || '',
      options: [t('true', 'True'), t('false', 'False')], answer: item.answer ? 0 : 1, tag: t('trueOrFalse', 'True or false')
    };
  }

  function others(all, correct, n, field) {
    var pool = all.filter(function (c) { return c.id !== correct.id && c[field] && c[field] !== correct[field]; });
    return FF.util.sample(pool, n);
  }

  function flag(c, all) {
    var opts = FF.util.shuffle([c].concat(others(all, c, 3, 'name')));
    return {
      type: 'flag', prompt: t('whoseFlag', 'Whose flag is this?'), time: TIME_MC, country: c.id,
      options: opts.map(function (x) { return x.name; }), answer: opts.indexOf(c), tag: t('flags', 'Flags')
    };
  }

  function capital(c, all) {
    var opts = FF.util.shuffle([c].concat(others(all, c, 3, 'capital')));
    return {
      type: 'capital', prompt: t('capitalOf', 'What is the capital of {name}?', { name: c.name }), time: TIME_MC,
      options: opts.map(function (x) { return x.capital; }), answer: opts.indexOf(c), tag: t('capitals', 'Capitals')
    };
  }

  /* Build the run. The RNG is seeded only while building, then put back. */
  function build(seed, topic) {
    var wasSeeded = FF.Random.seeded();
    FF.Random.seed('quizrun|' + seed + '|' + (topic || 'mixed'));
    try {
      var qs = (quiz().questions || []).filter(function (q) { return q && q.options && q.options.length >= 2; });
      var easy = drawer(qs.filter(function (q) { return q.difficulty === 'easy'; }));
      var normal = drawer(qs.filter(function (q) { return q.difficulty === 'normal'; }));
      var hard = drawer(qs.filter(function (q) { return q.difficulty === 'hard'; }));
      var tfs = drawer(quiz().trueFalse || []);
      var all = countries();
      var flags = drawer(all.filter(function (c) { return c.flag; }));
      var caps = drawer(all.filter(function (c) { return c.capital; }));

      var plan;
      if (topic === 'knowledge') plan = ['e', 'e', 'e', 'n', 'n', 'n', 'n', 'h', 'h', 'h'];
      else if (topic === 'world') plan = ['f', 'c', 'f', 'c', 'f', 'c', 'f', 'c', 'f', 'c'];
      else if (topic === 'truefalse') plan = ['t', 't', 't', 't', 't', 't', 't', 't', 't', 't'];
      else plan = ['e', 't', 'f', 'e', 'c', 'n', 't', 'f', 'n', 'h'];

      var out = [];
      plan.forEach(function (slot) {
        var q = null;
        if (slot === 'e') q = easy() || normal();
        else if (slot === 'n') q = normal() || easy();
        else if (slot === 'h') q = hard() || normal();
        if (q) { out.push(mc(q)); return; }
        if (slot === 't') { var x = tfs(); if (x) out.push(tf(x)); return; }
        if (slot === 'f') { var f = flags(); if (f) out.push(flag(f, all)); return; }
        if (slot === 'c') { var c = caps(); if (c) out.push(capital(c, all)); }
      });
      return out.slice(0, COUNT);
    } finally {
      if (!wasSeeded) FF.Random.unseed();
    }
  }

  function topicById(id) {
    for (var i = 0; i < TOPICS.length; i++) if (TOPICS[i].id === id) return TOPICS[i];
    return TOPICS[0];
  }

  /* ---------------- Full-screen runner ---------------- */
  var run = null;   // the run on screen, if any

  function screen() { return document.getElementById('game-screen'); }

  function closeScreen() {
    var s = screen();
    if (s) { s.className = 'game-screen hidden'; FF.ui.clear(s); }
    document.body.classList.remove('game-active');
  }

  function stopTimer() {
    if (run && run.tick) { clearInterval(run.tick); run.tick = null; }
  }

  function showQuestion() {
    var q = run.questions[run.index];
    var content = run.content;
    FF.ui.clear(content);
    var G = FF.GameUI;
    var stage = G.stage({ className: 'qr-stage' });
    var bar = FF.ui.div('gm-turnbar');
    bar.appendChild(G.pill(G.roundText(run.index + 1, run.questions.length), 'list-numbers'));
    if (q.tag) bar.appendChild(G.pill(q.tag));
    stage.appendChild(bar);
    stage.appendChild(G.prompt(q.prompt, q.type === 'tf' ? 'md' : 'md'));
    if (q.type === 'flag') {
      var c = countries().filter(function (x) { return x.id === q.country; })[0];
      var code = (FF.data && FF.data.flagCodes) ? FF.data.flagCodes[q.country] : null;
      var f = FF.Flags.render(c && c.flag, { code: code, cls: 'qr-flag', alt: t('aFlag', 'A country flag') });
      stage.appendChild(G.media(f, true));
    }
    var meter = G.meter(1);
    stage.appendChild(meter);
    var opts = G.options({ columns: q.options.length > 2 ? 2 : 2 });
    var buttons = q.options.map(function (label, i) {
      var b = q.type === 'tf'
        ? G.option(label, function () { answer(i); }, -1, { center: true, className: 'qr-tf qr-tf--' + (i === 0 ? 'yes' : 'no') })
        : G.option(label, function () { answer(i); }, i);
      opts.appendChild(b);
      return b;
    });
    stage.appendChild(opts);
    var fb = FF.ui.div('qr-feedback');
    stage.appendChild(fb);
    content.appendChild(stage);
    run.scoreEl.textContent = FF.util.formatNumber(run.score);

    var started = Date.now();
    var limit = q.time * 1000;
    var locked = false;
    run.timerEl.classList.remove('hidden');
    function draw() {
      var left = Math.max(0, limit - (Date.now() - started));
      meter.set(left / limit);
      run.timerEl.textContent = String(Math.ceil(left / 1000));
      run.timerEl.classList.toggle('warning', left <= 3000);
      if (left <= 0) answer(-1);
    }
    stopTimer();
    run.tick = setInterval(draw, 100);
    draw();
    if (window.innerWidth >= 768 && FF.Nav && FF.Nav.modality === 'keyboard' && buttons[0]) buttons[0].focus();

    function answer(i) {
      if (locked || !run) return;
      locked = true;
      stopTimer();
      var ms = Math.min(limit, Date.now() - started);
      var ok = i === q.answer;
      G.lock(opts);
      buttons.forEach(function (b, j) {
        if (j === q.answer) G.markOption(b, 'correct');
        else if (j === i) G.markOption(b, 'wrong');
        else G.markOption(b, 'dim');
      });
      var pts = 0;
      if (ok) {
        pts = 100 + Math.round(50 * (1 - ms / limit));
        run.score += pts;
        run.correct++;
        FF.Audio.play('correct');
        fb.appendChild(G.feedback('good', G.correctText(pts)));
      } else {
        FF.Audio.play('wrong');
        var right = q.options[q.answer];
        fb.appendChild(G.feedback('bad', i === -1
          ? t('timeUpAnswer', 'Time is up. The answer was {a}.', { a: right })
          : t('wrongAnswerWas', 'Not quite. The answer was {a}.', { a: right })));
      }
      run.ms += ms;
      run.answers.push({ ok: ok, ms: ms, pts: pts });
      run.scoreEl.textContent = FF.util.formatNumber(run.score);
      run.next = setTimeout(function () {
        if (!run) return;
        run.index++;
        if (run.index < run.questions.length) showQuestion();
        else finish();
      }, ok ? 1100 : 1900);
    }
  }

  function finish() {
    var r = run;
    stopTimer();
    run = null;
    closeScreen();
    FF.Audio.play('winner');
    r.onDone({ score: r.score, correct: r.correct, total: r.questions.length, ms: r.ms, answers: r.answers });
  }

  FF.QuizRun = {
    COUNT: COUNT,
    TOPICS: TOPICS,
    topic: topicById,
    build: build,
    active: function () { return !!run; },

    /* opts: { title, icon, questions, onDone(result), onQuit() } */
    play: function (opts) {
      if (run) return;
      if (FF.GameFlow && FF.GameFlow.current) FF.GameFlow.close();
      var s = screen();
      if (!s) return;
      FF.ui.clear(s);
      s.className = 'game-screen';
      document.body.classList.add('game-active');

      var shell = FF.ui.el('div', { class: 'game-shell qr-shell' });
      var bar = FF.ui.el('header', { class: 'game-shell__bar' });
      bar.appendChild(FF.UI.iconButton('close', t('exitGame', 'Exit game'), function () { FF.QuizRun.askQuit(); }, 'shell-btn exit'));
      var title = FF.ui.div('game-shell__title');
      title.appendChild(FF.Icons.icon(opts.icon || 'lightning'));
      title.appendChild(FF.ui.el('h1', { class: 'game-shell__title-text', style: { font: 'inherit' } }, opts.title));
      bar.appendChild(title);
      var score = FF.ui.span('qr-score');
      score.appendChild(FF.Icons.icon('star-fill'));
      var scoreEl = FF.ui.span('qr-score__n', '0');
      score.appendChild(scoreEl);
      bar.appendChild(score);
      var timerEl = FF.ui.el('div', { class: 'game-shell__timer hidden', role: 'timer', 'aria-label': t('timeLeft', 'Time left') }, '');
      bar.appendChild(timerEl);
      var content = FF.ui.el('main', { class: 'game-shell__content', id: 'game-content' });
      shell.appendChild(bar);
      shell.appendChild(content);
      s.appendChild(shell);
      window.scrollTo(0, 0);

      run = {
        questions: opts.questions, index: 0, score: 0, correct: 0, ms: 0, answers: [],
        content: content, timerEl: timerEl, scoreEl: scoreEl, onDone: opts.onDone, onQuit: opts.onQuit,
        quitBody: opts.quitBody
      };
      FF.Audio.play('roundStart');
      showQuestion();
    },

    // Leaving part-way: the run does not count.
    askQuit: function () {
      if (!run) return;
      FF.UI.confirm({
        title: t('leaveRunQ', 'Leave this challenge?'),
        body: run.quitBody || t('leaveRunBody', 'Your answers so far will not be saved.'),
        confirmLabel: t('leave', 'Leave'),
        danger: true,
        onConfirm: function () { FF.QuizRun.quit(); }
      });
    },

    quit: function () {
      if (!run) return;
      var r = run;
      stopTimer();
      clearTimeout(r.next);
      run = null;
      closeScreen();
      // The score so far, for modes where leaving still uses up the attempt.
      if (r.onQuit) r.onQuit({ score: r.score, correct: r.correct, total: r.questions.length, ms: r.ms, answers: r.answers, quit: true });
    }
  };
})();
