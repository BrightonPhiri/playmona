/* ============================================================
   PLAYMONA — quizMix.js
   Quiz Mix: multiple-choice and true-or-false questions from
   15 topics. Pick topics (or play everything), use a 50:50 once
   per game, catch the double-points rounds, and see a recap of
   how everyone did by topic.

   Questions: the hand-written set in js/data/quiz.js (with
   explanations, plus Africa and Zimbabwe) and the big bank in
   js/data/quizbank.js (Open Trivia DB, CC BY-SA 4.0), which loads
   on demand. Without the bank the built-in set still plays.
   Classic script (no modules), offline, ES2017-or-older.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var t = function (key, fallback, vars) { return FF.t(key, fallback, vars); };

  // colour: a decoration colour token for the topic's icon tile.
  var TOPICS = [
    { id: 'general', name: 'General knowledge', icon: 'lightbulb', colour: '--brand-yellow' },
    { id: 'science', name: 'Science & nature', icon: 'brain', colour: '--cat-visual' },
    { id: 'geography', name: 'Geography', icon: 'globe', colour: '--cat-world' },
    { id: 'history', name: 'History', icon: 'scroll', colour: '--cat-memory' },
    { id: 'animals', name: 'Animals', icon: 'paw-print', colour: '--brand-green' },
    { id: 'sport', name: 'Sport', icon: 'medal', colour: '--cat-reaction' },
    { id: 'screen', name: 'Movies & TV', icon: 'tv', colour: '--brand-pink' },
    { id: 'music', name: 'Music', icon: 'music', colour: '--cat-creative' },
    { id: 'books', name: 'Books & words', icon: 'book-open', colour: '--cat-words' },
    { id: 'games', name: 'Games & cartoons', icon: 'game-controller', colour: '--brand-purple' },
    { id: 'tech', name: 'Tech & maths', icon: 'monitor', colour: '--cat-numbers' },
    { id: 'food', name: 'Food', icon: 'fork-knife', colour: '--brand-orange' },
    { id: 'art', name: 'Art & myths', icon: 'palette', colour: '--cat-bible' },
    { id: 'africa', name: 'Africa & Zimbabwe', icon: 'map-pin', colour: '--cat-party' },
    { id: 'everyday', name: 'Everyday & kids', icon: 'house', colour: '--brand-blue' }
  ];
  var TOPIC = {};
  TOPICS.forEach(function (tp) { TOPIC[tp.id] = tp; });

  // Built-in categories (js/data/quiz.js) to topics.
  var BUILTIN = {
    'General Knowledge': 'general', Geography: 'geography', Science: 'science', History: 'history',
    Animals: 'animals', Sports: 'sport', Food: 'food', Movies: 'screen', Music: 'music',
    Technology: 'tech', Kids: 'everyday', Africa: 'africa', Zimbabwe: 'africa', 'Everyday Life': 'everyday'
  };

  var DOUBLE_EVERY = 5;    // every 5th question is worth double
  var SEEN_KEY = 'quizSeen';
  var SEEN_MAX = 6000;
  var TOPICS_KEY = 'quizTopics';

  /* ---------- The question bank ---------- */

  function hashId(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  // One shape for every question: { id, q, options, answer, topic, difficulty, explanation, tf }
  function fromBuiltin(q) {
    return {
      id: hashId(q.q), q: q.q, options: q.options.slice(), answer: q.answer,
      topic: BUILTIN[q.category] || 'general', difficulty: q.difficulty || 'normal',
      explanation: q.explanation || '', tf: false
    };
  }
  function fromBuiltinTF(q) {
    return {
      id: hashId(q.q), q: q.q, options: [t('true', 'True'), t('false', 'False')], answer: q.answer ? 0 : 1,
      topic: 'general', difficulty: q.difficulty || 'normal', explanation: q.explanation || '', tf: true
    };
  }
  // Bank rows: [question, [correct, wrong...], difficulty e|n|h, topic, isTrueFalse]
  var DIFF = { e: 'easy', n: 'normal', h: 'hard' };
  function fromBank(row) {
    var tf = row[4] === 1;
    var opts = tf ? [t('true', 'True'), t('false', 'False')] : row[1].slice();
    return {
      id: hashId(row[0]), q: row[0], options: opts, answer: tf ? (row[1][0] === 'True' ? 0 : 1) : 0,
      topic: TOPIC[row[3]] ? row[3] : 'general', difficulty: DIFF[row[2]] || 'normal', explanation: '', tf: tf
    };
  }

  var all = null;
  var loading = null;

  FF.QuizBank = {
    TOPICS: TOPICS,

    /* Load the big bank once. Resolves true when it is in, false if it
       could not load (the built-in questions still work). */
    load: function () {
      if (FF.QuizBankData) return Promise.resolve(true);
      if (loading) return loading;
      if (typeof document === 'undefined') return Promise.resolve(false);
      loading = new Promise(function (resolve) {
        var s = document.createElement('script');
        s.src = 'js/data/quizbank.js';
        s.async = true;
        s.onload = function () { all = null; resolve(!!FF.QuizBankData); };
        s.onerror = function () { loading = null; resolve(false); };
        document.head.appendChild(s);
      });
      return loading;
    },

    /* Every question, built-in first. Duplicates (same wording) are dropped. */
    all: function () {
      if (all) return all;
      var out = [];
      var seen = {};
      function add(q) { if (q && !seen[q.id]) { seen[q.id] = true; out.push(q); } }
      var data = FF.data && FF.data.quiz;
      if (data) {
        (data.questions || []).forEach(function (q) { add(fromBuiltin(q)); });
        (data.trueFalse || []).forEach(function (q) { add(fromBuiltinTF(q)); });
      }
      ((FF.QuizBankData && FF.QuizBankData.items) || []).forEach(function (row) { add(fromBank(row)); });
      all = out;
      return all;
    },

    counts: function () {
      var c = {};
      this.all().forEach(function (q) { c[q.topic] = (c[q.topic] || 0) + 1; });
      return c;
    },

    /* Questions for these topics at this difficulty: easy leaves out hard
       ones, hard leaves out easy ones. */
    pool: function (topics, difficulty) {
      var want = {};
      (topics || []).forEach(function (id) { want[id] = true; });
      var every = !topics || !topics.length;
      var list = this.all().filter(function (q) { return every || want[q.topic]; });
      var byDiff = list.filter(function (q) {
        if (difficulty === 'easy') return q.difficulty !== 'hard';
        if (difficulty === 'hard') return q.difficulty !== 'easy';
        return true;
      });
      return byDiff.length >= 10 ? byDiff : list;
    }
  };

  // Questions this device has already been asked, so families see new ones.
  function seenSet() {
    var arr = FF.Storage.get(SEEN_KEY, []) || [];
    var s = {};
    arr.forEach(function (id) { s[id] = true; });
    return { set: s, arr: arr };
  }
  function freshFirst(pool, need) {
    var seen = seenSet();
    var fresh = pool.filter(function (q) { return !seen.set[q.id]; });
    if (fresh.length >= Math.max(need, 1)) return fresh;
    // Nearly everything here has been played: start this pool over.
    var ids = {};
    pool.forEach(function (q) { ids[q.id] = true; });
    FF.Storage.set(SEEN_KEY, seen.arr.filter(function (id) { return !ids[id]; }));
    return pool;
  }
  function markSeen(id) {
    var arr = FF.Storage.get(SEEN_KEY, []) || [];
    arr.push(id);
    if (arr.length > SEEN_MAX) arr = arr.slice(arr.length - SEEN_MAX);
    FF.Storage.set(SEEN_KEY, arr);
  }

  /* ---------- Small helpers ---------- */

  function scorerList(config) {
    if (config.scorers && config.scorers.length) return config.scorers.slice();
    return (config.players || []).slice();
  }

  function bonusOf(config) {
    var d = config.difficulty || 'normal';
    return d === 'hard' ? 2 : (d === 'normal' ? 1.5 : 1);
  }

  function topicBadge(id) {
    var tp = TOPIC[id] || TOPIC.general;
    var b = FF.ui.span('qm-topic');
    var ic = FF.ui.span('qm-topic__icon');
    ic.style.setProperty('--tc', 'var(' + tp.colour + ')');
    ic.appendChild(FF.Icons.icon(tp.icon));
    b.appendChild(ic);
    b.appendChild(FF.ui.span('', t('qmTopic_' + tp.id, tp.name)));
    return b;
  }

  function diffDots(d) {
    var n = d === 'hard' ? 3 : (d === 'normal' ? 2 : 1);
    var box = FF.ui.el('span', { class: 'qm-diff', 'aria-label': t('diff_' + d, d) });
    for (var i = 0; i < 3; i++) box.appendChild(FF.ui.span('qm-diff__dot' + (i < n ? ' is-on' : '')));
    return box;
  }

  function stillShown(api) { return !!(api.shell.root && document.body.contains(api.shell.root)); }

  /* ---------- Screens ---------- */

  function loadingScreen(api) {
    FF.ui.clear(api.shell.root);
    api.shell.hideTimer();
    var stage = FF.GameUI.stage({ center: true, className: 'qm-loading' });
    var row = FF.ui.div('qm-loading__row');
    TOPICS.slice(0, 5).forEach(function (tp, i) {
      var ic = FF.ui.span('qm-topic__icon qm-loading__icon');
      ic.style.setProperty('--tc', 'var(' + tp.colour + ')');
      ic.style.animationDelay = (i * 110) + 'ms';
      ic.appendChild(FF.Icons.icon(tp.icon));
      row.appendChild(ic);
    });
    stage.appendChild(row);
    stage.appendChild(FF.GameUI.sub(t('qmLoading', 'Shuffling thousands of questions…')));
    api.shell.root.appendChild(stage);
  }

  // Pick topics before a local game. Remembers the last choice.
  function topicPicker(api, onStart) {
    var root = api.shell.root;
    FF.ui.clear(root);
    api.shell.hideTimer();
    // A game clock waits while topics are chosen.
    FF.GameLength.pause();
    var counts = FF.QuizBank.counts();
    var saved = FF.Storage.get(TOPICS_KEY, []) || [];
    var chosen = {};
    saved.forEach(function (id) { if (TOPIC[id] && counts[id]) chosen[id] = true; });

    var stage = FF.GameUI.stage({ wide: true, className: 'qm-pick' });
    stage.appendChild(FF.GameUI.kicker(t('qmPickKicker', 'Quiz Mix')));
    stage.appendChild(FF.GameUI.prompt(t('qmPickTitle', 'Pick your topics'), 'xl'));
    var total = 0;
    Object.keys(counts).forEach(function (k) { total += counts[k]; });
    stage.appendChild(FF.GameUI.sub(t('qmPickSub', '{n} questions to play. Choose a few topics, or leave it on Everything for a mix.', { n: FF.util.formatNumber(total) })));

    var everything = FF.ui.el('button', { type: 'button', class: 'qm-every' });
    everything.appendChild(FF.Icons.icon('shuffle'));
    everything.appendChild(FF.ui.span('qm-every__label', t('qmEverything', 'Everything')));
    everything.appendChild(FF.ui.span('qm-every__count', FF.util.formatNumber(total)));
    everything.addEventListener('click', function () { chosen = {}; FF.Audio.play('select'); sync(); });
    stage.appendChild(everything);

    var grid = FF.ui.el('div', { class: 'qm-grid', role: 'group', 'aria-label': t('qmTopics', 'Topics') });
    var tiles = [];
    TOPICS.forEach(function (tp) {
      if (!counts[tp.id]) return;
      var b = FF.ui.el('button', { type: 'button', class: 'qm-tile' });
      var ic = FF.ui.span('qm-topic__icon');
      ic.style.setProperty('--tc', 'var(' + tp.colour + ')');
      ic.appendChild(FF.Icons.icon(tp.icon));
      b.appendChild(ic);
      var txt = FF.ui.span('qm-tile__text');
      txt.appendChild(FF.ui.span('qm-tile__name', t('qmTopic_' + tp.id, tp.name)));
      txt.appendChild(FF.ui.span('qm-tile__count', t('qmNQuestions', '{n} questions', { n: FF.util.formatNumber(counts[tp.id]) })));
      b.appendChild(txt);
      b.appendChild(FF.ui.span('qm-tile__check', FF.Icons.icon('check')));
      b.addEventListener('click', function () {
        if (chosen[tp.id]) delete chosen[tp.id]; else chosen[tp.id] = true;
        FF.Audio.play('tap');
        sync();
      });
      tiles.push({ el: b, id: tp.id });
      grid.appendChild(b);
    });
    stage.appendChild(grid);

    var foot = FF.ui.div('qm-pick__foot');
    var summary = FF.ui.el('p', { class: 'qm-pick__summary', 'aria-live': 'polite' });
    foot.appendChild(summary);
    foot.appendChild(FF.GameUI.action(t('qmStart', 'Start quiz'), function () {
      var ids = Object.keys(chosen);
      FF.Storage.set(TOPICS_KEY, ids);
      FF.GameLength.resume();
      FF.Audio.play('roundStart');
      onStart(ids);
    }, { icon: 'play' }));
    stage.appendChild(foot);
    root.appendChild(stage);

    function sync() {
      var ids = Object.keys(chosen);
      everything.classList.toggle('is-on', !ids.length);
      everything.setAttribute('aria-pressed', !ids.length ? 'true' : 'false');
      tiles.forEach(function (x) {
        var on = !!chosen[x.id];
        x.el.classList.toggle('is-on', on);
        x.el.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      var n = 0;
      if (!ids.length) n = total; else ids.forEach(function (id) { n += counts[id] || 0; });
      summary.textContent = ids.length
        ? t('qmPickN', '{k} topics · {n} questions', { k: ids.length, n: FF.util.formatNumber(n) })
        : t('qmPickAll', 'A mix of all {n} questions', { n: FF.util.formatNumber(n) });
    }
    sync();
    FF.Nav.focusFirst(stage);
  }

  /* ---------- The quiz ---------- */

  function play(api, topics) {
    var config = api.config;
    var scorers = scorerList(config);
    var racing = !!(FF.Race && FF.Race.active && FF.Race.active());
    if (racing) {
      // Everyone must deal the same questions: same seed, no "already seen" filter.
      FF.Random.seed(FF.Random.roundSeed((FF.Room.current().meta || {}).seed, api.def.id, 'deck'));
      var me = FF.Room.current();
      var mine = scorers.filter(function (e) { return e.id === me.uid; });
      scorers = mine.length ? mine : scorers.slice(0, 1);
    }
    var basePool = FF.QuizBank.pool(topics, config.difficulty);
    if (basePool.length < 4) {
      FF.GameUI.exitCard(api, t('noQuestions', 'No questions yet'), t('qmNoTopicQs', 'Those topics have no questions at this difficulty. Try Everything.'));
      return;
    }
    var n = scorers.length;
    var timed = FF.GameLength.timed(config);
    var rounds = FF.GameLength.rounds(api, 10, basePool.length);
    // Pass and play: everyone gets the same number of questions.
    if (!racing && !timed && n > 1) rounds = Math.ceil(rounds / n) * n;
    var pool = racing ? basePool : freshFirst(basePool, rounds);
    // Topics take turns, so a big topic (games) cannot crowd out the rest.
    var byTopic = {};
    pool.forEach(function (q) { (byTopic[q.topic] = byTopic[q.topic] || []).push(q); });
    var topicBag = new api.random.Bag(Object.keys(byTopic).sort());
    var bags = {};
    Object.keys(byTopic).forEach(function (id) { bags[id] = new api.random.Bag(byTopic[id]); });
    function deal() { return bags[topicBag.next()].next(); }
    if (timed) FF.GameLength.manual();

    var round = 0;
    var current = null;
    var stats = {};      // entityId -> { c, a, fastest, topics: { id: { c, a } } }
    var fifty = {};      // entityId -> lifelines left
    var totals = { c: 0, a: 0, topics: {} };
    scorers.forEach(function (e) { stats[e.id] = { c: 0, a: 0, fastest: null, topics: {} }; fifty[e.id] = 1; });

    var race = racing ? FF.Race.forGame(api, {
      rounds: rounds,
      optionSelector: '.qm-opt',
      pointsFor: function (answer) {
        if (answer.value != null) return answer.value;
        var pts = Math.round(100 * bonusOf(config));
        if (answer.ms != null && answer.ms < 3000) pts += 50;
        return pts;
      }
    }) : null;
    var offSettle = race ? race.onSettle(function (payload) {
      totals.a++;
      if (payload.winnerId) totals.c++;
      race.showResult(payload, {
        answerText: current ? current.options[current.answer] : null,
        isLast: race.isLastRound(round, rounds),
        onNext: function () { next(); }
      });
    }) : null;

    function isDouble(r) { return !racing && (r + 1) % DOUBLE_EVERY === 0; }

    function over() {
      if (round >= rounds) return true;
      if (race && race.over(round)) return true;
      // On a game clock, finish once everyone has had the same number of turns.
      return timed && FF.GameLength.timeUp() && round % n === 0;
    }

    function next() {
      round++;
      if (over()) { finish(); return; }
      render();
    }

    function tally(entityId, q, correct, secs) {
      var s = stats[entityId];
      s.a++; totals.a++;
      var tp = s.topics[q.topic] || (s.topics[q.topic] = { c: 0, a: 0 });
      var sum = totals.topics[q.topic] || (totals.topics[q.topic] = { c: 0, a: 0 });
      tp.a++; sum.a++;
      if (correct) {
        s.c++; totals.c++; tp.c++; sum.c++;
        if (secs != null && (s.fastest == null || secs < s.fastest)) s.fastest = secs;
      }
    }

    function render() {
      if (race) race.beginRound(round);
      var entity = racing ? scorers[0] : scorers[round % n];
      var base = deal();
      if (!racing) markSeen(base.id);
      // Shuffle the answers (true/false stays in order).
      var order = base.tf ? [0, 1] : FF.util.shuffle(base.options.map(function (o, i) { return i; }));
      var q = {
        q: base.q, topic: base.topic, difficulty: base.difficulty, explanation: base.explanation, tf: base.tf,
        options: order.map(function (i) { return base.options[i]; }),
        answer: order.indexOf(base.answer)
      };
      current = q;
      var double = isDouble(round);
      var seconds = racing ? 0 : (config.timer || 0);
      var started = Date.now();
      var done = false;

      var root = api.shell.root;
      FF.ui.clear(root);
      api.shell.hideTimer();
      api.shell.updateScores(entity.id);

      var stage = FF.GameUI.stage({ className: 'qm' });
      var bar = FF.GameUI.turnBar(entity, FF.GameLength.roundText(round + 1, rounds));
      var rec = api.scoring.record(entity.id);
      if (rec && rec.streak >= 2) bar.appendChild(FF.GameUI.pill(t('streakN', 'Streak {n}', { n: rec.streak }), 'flame', 'streak'));
      stage.appendChild(bar);

      var card = FF.ui.div('qm-card' + (double ? ' qm-card--double' : ''));
      var head = FF.ui.div('qm-card__head');
      head.appendChild(topicBadge(q.topic));
      if (double) {
        var dbl = FF.ui.span('qm-double');
        dbl.appendChild(FF.Icons.icon('lightning'));
        dbl.appendChild(FF.ui.span('', t('qmDouble', 'Double points')));
        head.appendChild(dbl);
      }
      head.appendChild(diffDots(q.difficulty));
      card.appendChild(head);
      if (q.tf) card.appendChild(FF.ui.div('qm-card__kind', t('qmTrueFalse', 'True or false?')));
      card.appendChild(FF.GameUI.prompt(q.q, q.q.length > 110 ? 'sm' : 'md'));
      var meter = null;
      if (seconds) {
        meter = FF.GameUI.meter(1);
        meter.classList.add('qm-time');
        meter.setAttribute('aria-label', t('timeLeft', 'Time left'));
        card.appendChild(meter);
      }
      stage.appendChild(card);

      var group = FF.GameUI.options({ columns: q.tf ? 2 : 'auto', className: q.tf ? 'qm-options--tf' : '' });
      var btns = q.options.map(function (label, i) {
        var b = FF.GameUI.option(label, function () { answer(i); }, q.tf ? -1 : i, { className: 'qm-opt' + (q.tf ? ' qm-opt--tf qm-opt--' + (i === 0 ? 'true' : 'false') : '') });
        group.appendChild(b);
        return b;
      });
      stage.appendChild(group);

      var tools = FF.ui.div('qm-tools');
      var fiftyBtn = null;
      if (!q.tf) {
        fiftyBtn = FF.ui.el('button', { type: 'button', class: 'qm-life' });
        fiftyBtn.appendChild(FF.ui.span('qm-life__mark', '50:50'));
        fiftyBtn.appendChild(FF.ui.span('qm-life__text', fifty[entity.id] ? t('qmFiftyLeft', 'Remove two wrong answers (once a game)') : t('qmFiftyUsed', '50:50 used')));
        fiftyBtn.disabled = !fifty[entity.id];
        fiftyBtn.addEventListener('click', useFifty);
        tools.appendChild(fiftyBtn);
      }
      stage.appendChild(tools);
      var after = FF.ui.div('qm-after');
      stage.appendChild(after);
      root.appendChild(stage);

      if (race) {
        race.describe({ kind: 'choice', text: q.q, options: q.options }, q.answer);
        race.gate();
      } else if (seconds) {
        api.shell.setOnTick(function (rem) { if (meter) meter.set(rem / seconds); });
        api.shell.setTimer(seconds, function () { answer(-1); });
      }
      FF.Nav.focusFirst(group);

      function useFifty() {
        if (done || !fifty[entity.id]) return;
        fifty[entity.id]--;
        var wrong = [];
        btns.forEach(function (b, i) { if (i !== q.answer && !b.disabled) wrong.push(i); });
        FF.util.shuffle(wrong).slice(0, 2).forEach(function (i) {
          btns[i].disabled = true;
          btns[i].classList.add('qm-opt--gone');
        });
        fiftyBtn.disabled = true;
        fiftyBtn.lastChild.textContent = t('qmFiftyUsed', '50:50 used');
        FF.Audio.play('flip');
      }

      function answer(idx) {
        if (done) return;
        var secs = (Date.now() - started) / 1000;
        var correct = idx === q.answer;
        if (race) {
          // The race decides the round; a wrong answer only locks this device out.
          race.submit(idx, correct, Date.now() - started);
          return;
        }
        done = true;
        api.shell.setOnTick(null);
        api.shell.hideTimer();
        tools.hidden = true;
        btns.forEach(function (b, i) {
          b.disabled = true;
          if (i === q.answer) FF.GameUI.markOption(b, 'correct');
          else if (i === idx) FF.GameUI.markOption(b, 'wrong');
          else FF.GameUI.markOption(b, 'dim');
        });
        tally(entity.id, q, correct, idx < 0 ? null : secs);

        if (correct) {
          var pts = Math.round(100 * bonusOf(config));
          var left = seconds ? Math.max(0, 1 - secs / seconds) : (secs < 3 ? 1 : 0);
          pts += Math.round(50 * left);            // speed bonus, up to +50
          if (double) pts *= 2;
          api.scoring.add(entity.id, pts, { correct: true, fastest: secs });
          var r = api.scoring.record(entity.id);
          var streak = r && r.streak > 0 && r.streak % 3 === 0;
          if (streak) api.scoring.add(entity.id, 100);
          api.audio.play(streak || double ? 'streak' : 'correct');
          after.appendChild(FF.GameUI.feedback('good', FF.GameUI.correctText(pts + (streak ? 100 : 0)) +
            (double ? ' ' + t('qmDoubled', 'Doubled!') : '') + (streak ? ' ' + t('streakBonus', 'Streak bonus!') : '')));
        } else {
          api.scoring.add(entity.id, 0, { wrong: true });
          api.scoring.resetStreak(entity.id);
          api.audio.play('wrong');
          after.appendChild(FF.GameUI.feedback('bad', (idx < 0 ? t('qmOutOfTime', 'Out of time!') : t('notQuite', 'Not quite.')) + ' ' +
            t('qmAnswerWas', 'The answer is {a}.', { a: q.options[q.answer] })));
        }
        if (q.explanation) {
          var fact = FF.ui.div('qm-fact');
          fact.appendChild(FF.Icons.icon('lightbulb'));
          var ft = FF.ui.div('');
          ft.appendChild(FF.ui.span('qm-fact__label', t('didYouKnow', 'Did you know?')));
          ft.appendChild(FF.ui.el('p', {}, q.explanation));
          fact.appendChild(ft);
          after.appendChild(fact);
        }
        var last = round + 1 >= rounds || (timed && FF.GameLength.timeUp() && (round + 1) % n === 0);
        var nextBtn = FF.Advance.button(last ? t('seeResults', 'See results') : t('next', 'Next'), function () { FF.Audio.play('click'); next(); }, { class: 'btn-lg' });
        after.appendChild(nextBtn);
        api.shell.updateScores(entity.id);
        FF.Nav.focus(nextBtn);
      }
    }

    function finish() {
      if (offSettle) offSettle();
      if (race) { race.end(); return end(); }
      api.shell.hideTimer();
      recap();
    }

    function end() {
      var res = api.scoring.results();
      var ranked = (res && res.results) || [];
      var best = 0, fastest = null;
      ranked.forEach(function (r) {
        if (r.bestStreak > best) best = r.bestStreak;
        if (r.fastest != null && (fastest == null || r.fastest < fastest)) fastest = r.fastest;
      });
      var brainBox = Object.keys(stats).some(function (id) { return stats[id].c >= 10; });
      api.audio.play('winner');
      api.end({
        results: ranked, winnerId: res ? res.winnerId : null,
        bestStreak: best, fastest: fastest,
        quizCorrect: totals.c, quizAnswered: totals.a,
        achievements: brainBox ? ['brainBox'] : []
      });
    }

    // How everyone did, and which topics went well, before the results.
    function recap() {
      var root = api.shell.root;
      FF.ui.clear(root);
      var stage = FF.GameUI.stage({ className: 'qm-recap' });
      stage.appendChild(FF.GameUI.kicker(t('qmRecapKicker', 'Quiz recap')));
      var pct = totals.a ? Math.round(totals.c / totals.a * 100) : 0;
      stage.appendChild(FF.GameUI.prompt(t('qmRecapTitle', '{c} of {a} right', { c: totals.c, a: totals.a }), 'xl'));
      var ring = FF.ui.div('qm-ring');
      ring.style.setProperty('--p', String(pct));
      ring.appendChild(FF.ui.span('qm-ring__num', pct + '%'));
      stage.insertBefore(ring, stage.firstChild);

      var people = FF.ui.el('ul', { class: 'qm-people' });
      scorers.slice().sort(function (a, b) {
        return (api.scoring.get(b.id) || 0) - (api.scoring.get(a.id) || 0);
      }).forEach(function (e) {
        var s = stats[e.id];
        var li = FF.ui.el('li', { class: 'qm-person' });
        var ava = FF.ui.span('qm-person__ava');
        ava.appendChild(FF.Players.avatarEl(e, ''));
        li.appendChild(ava);
        var who = FF.ui.div('qm-person__who');
        who.appendChild(FF.ui.span('qm-person__name', e.name || t('playerLabel', 'Player')));
        var rec = api.scoring.record(e.id) || {};
        var bits = [t('qmRightOf', '{c}/{a} right', { c: s.c, a: s.a })];
        if (rec.bestStreak > 1) bits.push(t('qmBestStreak', 'best streak {n}', { n: rec.bestStreak }));
        if (s.fastest != null) bits.push(t('qmFastest', 'fastest {s}s', { s: s.fastest.toFixed(1) }));
        var top = bestTopic(s.topics);
        if (top) bits.push(t('qmStrongest', 'best at {topic}', { topic: t('qmTopic_' + top, TOPIC[top].name) }));
        who.appendChild(FF.ui.span('qm-person__meta', bits.join(' · ')));
        li.appendChild(who);
        li.appendChild(FF.ui.span('qm-person__score', FF.util.formatNumber(api.scoring.get(e.id) || 0)));
        people.appendChild(li);
      });
      stage.appendChild(people);

      var ids = Object.keys(totals.topics);
      if (ids.length > 1) {
        stage.appendChild(FF.ui.el('h3', { class: 'qm-recap__h' }, t('qmByTopic', 'By topic')));
        var list = FF.ui.div('qm-bytopic');
        ids.sort(function (a, b) { return totals.topics[b].a - totals.topics[a].a; }).forEach(function (id) {
          var x = totals.topics[id];
          var row = FF.ui.div('qm-bytopic__row');
          row.appendChild(topicBadge(id));
          var m = FF.GameUI.meter(x.a ? x.c / x.a : 0);
          m.classList.add('qm-bytopic__meter');
          m.setAttribute('aria-label', t('qmTopic_' + id, TOPIC[id].name));
          row.appendChild(m);
          row.appendChild(FF.ui.span('qm-bytopic__n', x.c + '/' + x.a));
          list.appendChild(row);
        });
        stage.appendChild(list);
      }
      stage.appendChild(FF.GameUI.action(t('seeResults', 'See results'), function () { end(); }, { icon: 'trophy' }));
      root.appendChild(stage);
      FF.Nav.focusFirst(stage);
    }

    function bestTopic(topics) {
      var best = null, score = -1;
      Object.keys(topics).forEach(function (id) {
        var x = topics[id];
        var s = x.a >= 2 ? x.c / x.a + x.a / 100 : -1;
        if (x.c && s > score) { score = s; best = id; }
      });
      return best;
    }

    render();
  }

  FF.registerGame({
    id: 'familyQuiz',
    featured: true,
    name: 'Quiz Mix',
    icon: '🧠',
    // The wide banner shows the lit top of the question mark above the title.
    coverFocus: 'center 30%',
    category: 'quiz',
    players: [1, 8],
    difficulty: 'Easy',
    duration: 6,
    tags: ['quick', 'everyone'],
    modes: ['solo', 'turn', 'team'],
    defaultMode: 'turn',
    description: 'Thousands of questions across 15 topics. Pick your favourites, use your 50:50, and catch the double-points rounds.',
    howToPlay: [
      'Pick the topics you like, or play Everything for a mix.',
      'Take turns answering. Faster answers earn up to 50 bonus points.',
      'Every fifth question is worth double, and 3 right in a row earns a streak bonus.',
      'Stuck? Use your 50:50 once a game to remove two wrong answers.',
      'Set a game length in Options, or play for 5, 10 or 20 minutes.'
    ],
    start: function (api) {
      if (!scorerList(api.config).length) {
        FF.GameUI.exitCard(api, t('noPlayers', 'No players yet'), t('noPlayersText', 'Add players on your Profile to play this game.'));
        return;
      }
      var racing = !!(FF.Race && FF.Race.active && FF.Race.active());
      if (!FF.QuizBankData) loadingScreen(api);
      FF.QuizBank.load().then(function () {
        if (!stillShown(api)) return;
        if (racing) play(api, []);
        else topicPicker(api, function (ids) { play(api, ids); });
      });
    }
  });
})();
