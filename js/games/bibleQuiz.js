/* ============================================================
   PLAYMONA — games/bibleQuiz.js
   Bible Quiz: questions from js/data/bibleQuiz.js (KJV wording)
   in five kinds: choice, finish the verse, who said it, true or
   false, and put in order. Pick topics, a level and the kinds of
   question, use a 50:50 once a game, catch the double rounds, and
   read the verse behind every answer.

   - Local play: setup screen, then solo or pass and play.
   - Daily and friend challenges: the standard rules on a shared deal.
   - Online rooms: FF.Race, everyone answers the same question; a
     round scores 100 + a speed bonus, as the crew brain plays it
     (js/crew/brains/quiz.js).
   Pure rules are FF.BibleQuiz (tests: tools/test/bibleQuiz.test.js).
   Classic script, ES5.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  function t(key, fallback, vars) { return FF.t ? FF.t(key, fallback, vars) : String(fallback); }

  /* ================= rules (pure, tested) ================= */

  var LEVELS = ['kids', 'family', 'scholar'];
  var TYPES = ['choice', 'finish', 'said', 'tf', 'order'];
  var DOUBLE_EVERY = 5;       // every 5th question is worth double (local play)
  var STREAK_EVERY = 3;       // 3 right in a row earns a bonus (local play)
  var STREAK_BONUS = 50;
  var MIN_LEVEL_POOL = 12;    // fewer than this at a level: use every level
  var MIN_POOL = 4;
  var ORDER_EXTRA_SECS = 10;  // ordering takes more taps
  var STANDARD = { topics: [], level: 'family', types: [] };   // empty list = all
  var SEEN_KEY = 'bibleQuizSeen';
  var SEEN_MAX = 1500;
  var SETUP_KEY = 'bibleQuiz:setup';

  function data() { return (FF.data && FF.data.bibleQuiz) || { topics: [], items: [] }; }
  function topicIds() { return data().topics.map(function (tp) { return tp.id; }); }
  function setOf(list) { var s = {}; (list || []).forEach(function (k) { s[k] = true; }); return s; }

  /* Keep only known topics/types, in their own order; "all of them" is stored as []. */
  function sanitize(s) {
    s = s || {};
    var allTopics = topicIds();
    var want = setOf(Array.isArray(s.topics) ? s.topics : []);
    var topics = allTopics.filter(function (id) { return want[id]; });
    if (topics.length === allTopics.length) topics = [];
    var wantT = setOf(Array.isArray(s.types) ? s.types : []);
    var types = TYPES.filter(function (k) { return wantT[k]; });
    if (types.length === TYPES.length) types = [];
    return { topics: topics, level: LEVELS.indexOf(s.level) !== -1 ? s.level : STANDARD.level, types: types };
  }

  function isStandard(s) {
    var c = sanitize(s);
    return !c.topics.length && !c.types.length && c.level === STANDARD.level;
  }

  /* Kids plays kids questions; Family adds the family ones; Scholar drops the kids ones. */
  function levelOk(level, item) {
    if (level === 'kids') return item.level === 'kids';
    if (level === 'scholar') return item.level !== 'kids';
    return item.level !== 'scholar';
  }

  function pool(items, cfg) {
    var c = sanitize(cfg);
    var tp = setOf(c.topics);
    var ty = setOf(c.types);
    var base = items.filter(function (q) {
      return (!c.topics.length || tp[q.topic]) && (!c.types.length || ty[q.type]);
    });
    var atLevel = base.filter(function (q) { return levelOk(c.level, q); });
    return atLevel.length >= MIN_LEVEL_POOL ? atLevel : base;
  }

  /* A small seeded random source, so one number decides a whole deal. */
  function rng(seed) {
    var a = (Number(seed) || 0) >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var x = Math.imul(a ^ (a >>> 15), 1 | a);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(list, rand) {
    var a = list.slice();
    for (var j = a.length - 1; j > 0; j--) {
      var k = Math.floor(rand() * (j + 1));
      var x = a[j]; a[j] = a[k]; a[k] = x;
    }
    return a;
  }

  function range(n) { var a = []; for (var i = 0; i < n; i++) a.push(i); return a; }

  /* A question ready to show: choices shuffled; order events scrambled
     (never already in order). True or false keeps True first. */
  function prepare(item, rand) {
    var q = {
      id: item.id, type: item.type, topic: item.topic, level: item.level,
      q: item.q, ref: item.ref, note: item.note || '', verse: item.verse || ''
    };
    if (item.type === 'tf') {
      q.options = item.options.slice();
      q.answer = item.answer;
      return q;
    }
    var idx = shuffle(range(item.options.length), rand);
    if (item.type === 'order') {
      var tries = 0;
      while (idx.every(function (v, i) { return v === i; }) && tries++ < 5) idx = shuffle(idx, rand);
      if (idx.every(function (v, i) { return v === i; })) idx = idx.slice(1).concat(idx[0]);
      q.options = idx.map(function (i) { return item.options[i]; });
      q.correct = item.options.slice();
      q.answer = -1;
      return q;
    }
    q.options = idx.map(function (i) { return item.options[i]; });
    q.answer = idx.indexOf(item.answer);
    return q;
  }

  /* Deal `count` questions: topics take turns so none crowds out the rest.
     `seen` (optional) is a set of ids to leave out while enough are fresh. */
  function deal(items, cfg, rand, count, seen) {
    var list = pool(items, cfg);
    if (seen) {
      var fresh = list.filter(function (q) { return !seen[q.id]; });
      if (fresh.length >= count) list = fresh;
    }
    var byTopic = {};
    list.forEach(function (q) { (byTopic[q.topic] = byTopic[q.topic] || []).push(q); });
    var order = shuffle(topicIds().filter(function (id) { return byTopic[id]; }), rand);
    var bags = {};
    order.forEach(function (id) { bags[id] = shuffle(byTopic[id], rand); });
    var out = [];
    var left = true;
    while (out.length < count && left) {
      left = false;
      for (var i = 0; i < order.length && out.length < count; i++) {
        var bag = bags[order[i]];
        if (bag.length) { out.push(bag.shift()); left = true; }
      }
    }
    return out.map(function (q) { return prepare(q, rand); });
  }

  function isRightOrder(q, placed) {
    if (!q.correct || !placed || placed.length !== q.correct.length) return false;
    for (var i = 0; i < placed.length; i++) if (q.options[placed[i]] !== q.correct[i]) return false;
    return true;
  }

  /* 100 for a right answer plus up to 60 for speed; the crew brain uses the same sum. */
  function points(correct, ms, double) {
    if (!correct) return 0;
    var pts = 100 + Math.max(0, Math.round((20 - (ms || 0) / 1000) * 3));
    return double ? pts * 2 : pts;
  }

  function isDouble(round, racing) { return !racing && (round + 1) % DOUBLE_EVERY === 0; }

  /* ================= labels ================= */

  function topicOf(id) {
    var list = data().topics;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return { id: id, name: id, icon: 'book-open', colour: '--cat-bible' };
  }
  function topicName(id) { return t('bqTopic_' + id, topicOf(id).name); }
  function levelName(l) {
    return l === 'kids' ? t('bqKids', 'Kids') : l === 'scholar' ? t('bqScholar', 'Bible scholar') : t('bqFamily', 'Family');
  }
  function typeName(k) {
    return {
      choice: t('bqTypeChoice', 'Questions'),
      finish: t('bqTypeFinish', 'Finish the verse'),
      said: t('bqTypeSaid', 'Who said it?'),
      tf: t('bqTypeTf', 'True or false'),
      order: t('bqTypeOrder', 'Put in order')
    }[k] || k;
  }
  function typeIcon(k) {
    return { choice: 'question', finish: 'book-open', said: 'chat', tf: 'scales', order: 'list-numbers' }[k] || 'question';
  }
  function tfLabel(i) { return i === 0 ? t('true', 'True') : t('false', 'False'); }

  function summary(cfg) {
    var c = sanitize(cfg);
    var bits = [levelName(c.level)];
    bits.push(c.topics.length ? t('bqNTopics', '{n} topics', { n: c.topics.length }) : t('bqAllTopics', 'All topics'));
    if (c.types.length) bits.push(c.types.map(typeName).join(', '));
    return bits.join(' · ');
  }

  /* ================= device helpers ================= */

  function rand0() { return FF._rand ? FF._rand() : Math.random(); }
  function store() { return FF.Storage || { get: function (k, d) { return d; }, set: function () {} }; }

  // Ids this device has been asked. Starts a pool over once nearly all of it is seen.
  function seenFor(list, need) {
    var arr = store().get(SEEN_KEY, []) || [];
    var s = setOf(arr);
    var fresh = list.filter(function (q) { return !s[q.id]; }).length;
    if (fresh >= Math.max(need, 1)) return s;
    var ids = setOf(list.map(function (q) { return q.id; }));
    store().set(SEEN_KEY, arr.filter(function (id) { return !ids[id]; }));
    return {};
  }
  function markSeen(id) {
    var arr = store().get(SEEN_KEY, []) || [];
    arr.push(id);
    if (arr.length > SEEN_MAX) arr = arr.slice(arr.length - SEEN_MAX);
    try { store().set(SEEN_KEY, arr); } catch (e) { /* storage full */ }
  }

  function scorerList(config) {
    if (config.scorers && config.scorers.length) return config.scorers.slice();
    if (config.players && config.players.length) return config.players.slice();
    return [{ id: 'p1', name: t('you', 'You'), avatar: null }];
  }

  function racingNow() { return !!(FF.Race && FF.Race.active && FF.Race.active() && FF.Room && FF.Room.current()); }
  function stillShown(api) { return !!(api.shell.root && document.body && document.body.contains(api.shell.root)); }

  function topicIcon(id, cls) {
    var tp = topicOf(id);
    var ic = FF.ui.span('qm-topic__icon' + (cls ? ' ' + cls : ''));
    ic.style.setProperty('--tc', 'var(' + tp.colour + ')');
    ic.appendChild(FF.Icons.icon(tp.icon));
    return ic;
  }
  function topicBadge(id) {
    var b = FF.ui.span('qm-topic');
    b.appendChild(topicIcon(id));
    b.appendChild(FF.ui.span('', topicName(id)));
    return b;
  }
  function levelDots(l) {
    var n = l === 'scholar' ? 3 : l === 'family' ? 2 : 1;
    var box = FF.ui.el('span', { class: 'qm-diff', 'aria-label': levelName(l), title: levelName(l) });
    for (var i = 0; i < 3; i++) box.appendChild(FF.ui.span('qm-diff__dot' + (i < n ? ' is-on' : '')));
    return box;
  }

  /* The verse card shown after every answer. */
  function scriptureCard(q) {
    var card = FF.ui.div('bq-verse');
    var head = FF.ui.div('bq-verse__head');
    head.appendChild(FF.Icons.icon('book-open'));
    // With nothing else to show, point to where the story is.
    head.appendChild(FF.ui.span('bq-verse__ref', q.verse || q.note ? q.ref : t('bqReadIt', 'Read it in {ref}', { ref: q.ref })));
    card.appendChild(head);
    if (q.verse) card.appendChild(FF.ui.el('blockquote', { class: 'bq-verse__text' }, '“' + q.verse + '”'));
    if (q.note) card.appendChild(FF.ui.el('p', { class: 'bq-verse__note' }, q.note));
    return card;
  }

  function answerText(q) {
    if (!q) return null;
    if (q.type === 'order') return q.correct.join(' → ');
    if (q.type === 'tf') return tfLabel(q.answer);
    return q.options[q.answer];
  }

  /* ================= setup screen ================= */

  function setupScreen(api, onGo) {
    var root = api.shell.root;
    api.shell.hideTimer();
    FF.ui.clear(root);
    if (FF.GameLength && FF.GameLength.pause) FF.GameLength.pause();
    var items = data().items;
    var saved = store().get(SETUP_KEY, null);
    var gs = sanitize(saved || STANDARD);
    // While choosing, the lists hold every chosen id (empty "all" is spelled out).
    var chosenTopics = setOf(gs.topics);
    var chosenTypes = setOf(gs.types.length ? gs.types : TYPES);
    var level = gs.level;

    var stage = FF.GameUI.stage({ wide: true, className: 'bq bq-setup qm-pick' });
    stage.appendChild(FF.GameUI.kicker(t('bqName', 'Bible Quiz')));
    stage.appendChild(FF.GameUI.prompt(t('bqSetupTitle', 'Set up your quiz'), 'xl'));

    // Level
    var levelBox = FF.ui.el('section', { class: 'settings-section bq-setup__rows' });
    levelBox.appendChild(FF.UI.settingRow(t('bqLevel', 'Level'), FF.UI.segmented({
      label: t('bqLevel', 'Level'), value: level,
      options: LEVELS.map(function (l) { return { label: levelName(l), value: l }; }),
      onChange: function (v) { level = v; sync(); }
    }), t('bqLevelDesc', 'Kids keeps to the best-known stories. Bible scholar digs deeper.')));
    stage.appendChild(levelBox);

    // Kinds of question
    stage.appendChild(FF.ui.el('h3', { class: 'bq-setup__h' }, t('bqKinds', 'Kinds of question')));
    var typeRow = FF.ui.el('div', { class: 'bq-types', role: 'group', 'aria-label': t('bqKinds', 'Kinds of question') });
    var typeChips = TYPES.map(function (k) {
      var chip = FF.UI.chip({
        label: typeName(k), icon: typeIcon(k), active: !!chosenTypes[k],
        onClick: function () {
          var on = Object.keys(chosenTypes).filter(function (x) { return chosenTypes[x]; });
          if (chosenTypes[k] && on.length <= 1) { FF.Audio.play('wrong'); return; }   // keep at least one
          chosenTypes[k] = !chosenTypes[k];
          FF.Audio.play('tap');
          sync();
        }
      });
      typeRow.appendChild(chip);
      return { el: chip, id: k };
    });
    stage.appendChild(typeRow);

    // Topics
    stage.appendChild(FF.ui.el('h3', { class: 'bq-setup__h' }, t('bqTopics', 'Topics')));
    var everything = FF.ui.el('button', { type: 'button', class: 'qm-every' });
    everything.appendChild(FF.Icons.icon('shuffle'));
    everything.appendChild(FF.ui.span('qm-every__label', t('bqEverything', 'The whole Bible')));
    var everyCount = FF.ui.span('qm-every__count', '');
    everything.appendChild(everyCount);
    everything.addEventListener('click', function () { chosenTopics = {}; FF.Audio.play('select'); sync(); });
    stage.appendChild(everything);

    var grid = FF.ui.el('div', { class: 'qm-grid', role: 'group', 'aria-label': t('bqTopics', 'Topics') });
    var tiles = data().topics.map(function (tp) {
      var b = FF.ui.el('button', { type: 'button', class: 'qm-tile' });
      b.appendChild(topicIcon(tp.id));
      var txt = FF.ui.span('qm-tile__text');
      txt.appendChild(FF.ui.span('qm-tile__name', topicName(tp.id)));
      var count = FF.ui.span('qm-tile__count', '');
      txt.appendChild(count);
      b.appendChild(txt);
      b.appendChild(FF.ui.span('qm-tile__check', FF.Icons.icon('check')));
      b.addEventListener('click', function () {
        if (chosenTopics[tp.id]) delete chosenTopics[tp.id]; else chosenTopics[tp.id] = true;
        FF.Audio.play('tap');
        sync();
      });
      grid.appendChild(b);
      return { el: b, id: tp.id, count: count };
    });
    stage.appendChild(grid);

    var foot = FF.ui.div('qm-pick__foot bq-setup__foot');
    var note = FF.ui.el('p', { class: 'qm-pick__summary', 'aria-live': 'polite' });
    foot.appendChild(note);
    var actions = FF.ui.div('nr-setup__actions');
    actions.appendChild(FF.UI.button(t('nrStandard', 'Standard settings'), {
      class: 'btn-lg btn-ghost', icon: 'restart',
      onClick: function () {
        api.audio.play('click');
        try { store().set(SETUP_KEY, sanitize(STANDARD)); } catch (e) { /* storage full */ }
        setupScreen(api, onGo);     // redraw, so every control shows the standard choice
      }
    }));
    var startBtn = FF.GameUI.action(t('bqStart', 'Start quiz'), function () {
      var cfg = current();
      if (pool(items, cfg).length < MIN_POOL) return;
      api.audio.play('roundStart');
      try { store().set(SETUP_KEY, cfg); } catch (e) { /* storage full */ }
      if (FF.GameLength && FF.GameLength.resume) FF.GameLength.resume();
      onGo(cfg);
    }, { icon: 'play' });
    actions.appendChild(startBtn);
    foot.appendChild(actions);
    stage.appendChild(foot);
    root.appendChild(stage);

    function current() {
      return sanitize({
        topics: Object.keys(chosenTopics),
        types: TYPES.filter(function (k) { return chosenTypes[k]; }),
        level: level
      });
    }

    function sync() {
      var cfg = current();
      var noTopics = !cfg.topics.length;
      everything.classList.toggle('is-on', noTopics);
      everything.setAttribute('aria-pressed', noTopics ? 'true' : 'false');
      everyCount.textContent = FF.util.formatNumber(pool(items, { level: cfg.level, types: cfg.types }).length);
      tiles.forEach(function (x) {
        var on = !!chosenTopics[x.id];
        x.el.classList.toggle('is-on', on);
        x.el.setAttribute('aria-pressed', on ? 'true' : 'false');
        x.count.textContent = t('qmNQuestions', '{n} questions', { n: pool(items, { level: cfg.level, types: cfg.types, topics: [x.id] }).length });
      });
      typeChips.forEach(function (x) {
        var on = !!chosenTypes[x.id];
        x.el.classList.toggle('active', on);
        x.el.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      var n = pool(items, cfg).length;
      var ranked = FF.Leaderboards && FF.Leaderboards.active && FF.Leaderboards.active(api.def);
      note.textContent = n < MIN_POOL
        ? t('bqTooFew', 'Not enough questions for that mix. Add a topic or a kind of question.')
        : t('bqNReady', '{n} questions ready', { n: n }) + ' · ' + summary(cfg) +
          (ranked && !isStandard(cfg) ? ' · ' + t('nrUnranked', 'Leaderboards use the standard settings') : '');
      startBtn.disabled = n < MIN_POOL;
    }
    sync();
    if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(stage);
  }

  /* ================= the quiz ================= */

  function play(api, cfg, seed) {
    var config = api.config;
    var scorers = scorerList(config);
    var racing = racingNow();
    if (racing) {
      var me = FF.Room.current();
      var mine = scorers.filter(function (e) { return e.id === me.uid; });
      scorers = mine.length ? mine : scorers.slice(0, 1);
    }
    var items = data().items;
    var list = pool(items, cfg);
    if (list.length < MIN_POOL) {
      FF.GameUI.exitCard(api, t('noQuestions', 'No questions yet'), t('bqTooFew', 'Not enough questions for that mix. Add a topic or a kind of question.'));
      return;
    }
    var n = scorers.length;
    var timed = FF.GameLength.timed(config);
    var rounds = FF.GameLength.rounds(api, 10, list.length);
    // Pass and play: everyone gets the same number of questions.
    if (!racing && !timed && n > 1) rounds = Math.ceil(rounds / n) * n;
    var shared = racing || !!config.sharedDeal || !!config.daily || !!config.challenge;
    var want = Math.min(rounds, list.length);
    var deck = deal(items, cfg, rng(seed), want, shared ? null : seenFor(list, want));
    if (timed) FF.GameLength.manual();

    var round = 0;
    var current = null;
    var stats = {};      // entityId -> { c, a, fastest, topics: { id: { c, a } } }
    var fifty = {};      // entityId -> 50:50s left
    var totals = { c: 0, a: 0, topics: {} };
    var verses = [];     // verses met this game, for the recap
    scorers.forEach(function (e) { stats[e.id] = { c: 0, a: 0, fastest: null, topics: {} }; fifty[e.id] = 1; });

    var race = racing ? FF.Race.forGame(api, {
      rounds: rounds,
      optionSelector: '.bible-quiz-option',
      pointsFor: function (answer) { return answer.value || 0; }
    }) : null;
    var offSettle = race ? race.onSettle(function (payload) {
      api.shell.hideTimer();
      api.shell.setOnTick(null);
      totals.a++;
      if (payload && payload.winnerId) totals.c++;
      race.showResult(payload, {
        answerText: answerText(current),
        isLast: race.isLastRound(round, rounds),
        onNext: function () { next(); }
      });
    }) : null;

    function over() {
      if (round >= rounds) return true;
      if (race && race.over && race.over(round)) return true;
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
      var q = deck[round % deck.length];
      current = q;
      if (!shared) markSeen(q.id);
      if (q.verse && verses.length < 6 && !verses.some(function (v) { return v.ref === q.ref; })) verses.push(q);
      var entity = racing ? scorers[0] : scorers[round % n];
      var double = isDouble(round, racing);
      var opening = race ? race.beginRound(round) : null;
      var base = config.timer != null ? Number(config.timer) : 20;
      var seconds = racing ? 0 : (base > 0 ? base + (q.type === 'order' ? ORDER_EXTRA_SECS : 0) : 0);
      var started = Date.now();
      var done = false;

      var root = api.shell.root;
      FF.ui.clear(root);
      api.shell.hideTimer();
      api.shell.updateScores(entity.id);

      var stage = FF.GameUI.stage({ className: 'qm bq' });
      var bar = FF.GameUI.turnBar(racing ? null : entity, FF.GameUI.roundText(round + 1, rounds));
      var rec = api.scoring.record ? api.scoring.record(entity.id) : null;
      if (!racing && rec && rec.streak >= 2) bar.appendChild(FF.GameUI.pill(t('streakN', 'Streak {n}', { n: rec.streak }), 'flame', 'streak'));
      stage.appendChild(bar);

      var card = FF.ui.div('qm-card bq-card bq-card--' + q.type + (double ? ' qm-card--double' : ''));
      var head = FF.ui.div('qm-card__head');
      head.appendChild(topicBadge(q.topic));
      if (double) {
        var dbl = FF.ui.span('qm-double');
        dbl.appendChild(FF.Icons.icon('lightning'));
        dbl.appendChild(FF.ui.span('', t('qmDouble', 'Double points')));
        head.appendChild(dbl);
      }
      head.appendChild(levelDots(q.level));
      card.appendChild(head);
      if (q.type !== 'choice') {
        var kind = FF.ui.div('qm-card__kind bq-kind');
        kind.appendChild(FF.Icons.icon(typeIcon(q.type)));
        kind.appendChild(FF.ui.span('', typeName(q.type)));
        card.appendChild(kind);
      }
      if (q.type === 'said') {
        card.appendChild(FF.ui.el('blockquote', { class: 'bq-quote' }, '“' + q.q + '”'));
      } else {
        card.appendChild(FF.GameUI.prompt(q.q, q.q.length > 110 ? 'sm' : 'md'));
      }
      var meter = null;
      if (seconds) {
        meter = FF.GameUI.meter(1);
        meter.classList.add('qm-time');
        meter.setAttribute('aria-label', t('timeLeft', 'Time left'));
        card.appendChild(meter);
      }
      stage.appendChild(card);

      var btns = [];
      var group;
      var order = null;
      if (q.type === 'order') {
        order = orderBoard(q, function (placed) { answer(-1, placed); });
        group = order.el;
        btns = order.buttons;
      } else if (q.type === 'tf') {
        group = FF.GameUI.options({ columns: 2, className: 'qm-options--tf' });
        btns = q.options.map(function (o, i) {
          var b = FF.GameUI.option(tfLabel(i), function () { answer(i); }, -1, { className: 'bible-quiz-option qm-opt qm-opt--tf qm-opt--' + (i === 0 ? 'true' : 'false') });
          group.appendChild(b);
          return b;
        });
      } else {
        group = FF.GameUI.options({ columns: 'auto' });
        btns = q.options.map(function (label, i) {
          var b = FF.GameUI.option(label, function () { answer(i); }, i, { className: 'bible-quiz-option qm-opt' });
          group.appendChild(b);
          return b;
        });
      }
      stage.appendChild(group);

      var tools = FF.ui.div('qm-tools');
      var fiftyBtn = null;
      if (!racing && q.type !== 'tf' && q.type !== 'order') {
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

      function openQuestion() {
        if (done) return;
        started = Date.now();
        if (seconds) {
          api.shell.setOnTick(function (rem) { if (meter) meter.set(rem / seconds); });
          api.shell.setTimer(seconds, function () { answer(-1, null, true); });
        }
      }

      if (race) {
        // For people watching: the question and its answers (the answer is shared after the round).
        race.describe(q.type === 'order'
          ? { kind: 'card', text: q.q + ' ' + q.options.join(' · ') }
          : { kind: 'choice', text: q.q, options: q.type === 'tf' ? [tfLabel(0), tfLabel(1)] : q.options }, q.type === 'order' ? null : q.answer);
        var thisRound = round;
        opening.then(function () { race.gate(function () { if (round === thisRound) openQuestion(); }); });
      } else {
        openQuestion();
      }
      if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(group);

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
        api.audio.play('flip');
      }

      function answer(idx, placed, timeout) {
        if (done) return;
        done = true;
        var ms = Date.now() - started;
        var secs = ms / 1000;
        var correct = q.type === 'order' ? isRightOrder(q, placed) : idx === q.answer;
        if (timeout) correct = false;
        api.shell.setOnTick(null);
        api.shell.hideTimer();
        tools.hidden = true;

        if (race) {
          // The race decides the round. Show what this player chose and wait.
          btns.forEach(function (b, i) { b.disabled = true; if (i === idx) FF.GameUI.markOption(b, 'picked'); });
          if (order) order.lock();
          race.submit(q.type === 'order' ? (placed || []).join(',') : idx, correct, ms, { value: points(correct, ms, false) });
          after.appendChild(FF.GameUI.feedback('info', t('bqLockedIn', 'Answer locked in. Waiting for everyone…')));
          return;
        }

        if (order) order.reveal();
        else {
          btns.forEach(function (b, i) {
            b.disabled = true;
            if (i === q.answer) FF.GameUI.markOption(b, 'correct');
            else if (i === idx) FF.GameUI.markOption(b, 'wrong');
            else FF.GameUI.markOption(b, 'dim');
          });
        }
        tally(entity.id, q, correct, timeout ? null : secs);

        if (correct) {
          var pts = points(true, ms, double);
          api.scoring.add(entity.id, pts, { correct: true, fastest: secs });
          var r = api.scoring.record ? api.scoring.record(entity.id) : null;
          var streak = !!(r && r.streak > 0 && r.streak % STREAK_EVERY === 0);
          if (streak) api.scoring.add(entity.id, STREAK_BONUS);
          api.audio.play(streak || double ? 'streak' : 'correct');
          after.appendChild(FF.GameUI.feedback('good', FF.GameUI.correctText(pts + (streak ? STREAK_BONUS : 0)) +
            (double ? ' ' + t('qmDoubled', 'Doubled!') : '') + (streak ? ' ' + t('streakBonus', 'Streak bonus!') : '')));
        } else {
          api.scoring.add(entity.id, 0, { wrong: true });
          if (api.scoring.resetStreak) api.scoring.resetStreak(entity.id);
          api.audio.play('wrong');
          var lead = timeout ? t('timesUp', 'Time’s up!') : t('notQuite', 'Not quite.');
          after.appendChild(FF.GameUI.feedback('bad', q.type === 'order'
            ? lead + ' ' + t('bqRightOrder', 'Here is the right order.')
            : lead + ' ' + t('qmAnswerWas', 'The answer is {a}.', { a: answerText(q) })));
        }
        // A "who said it" quote is already on screen: the card adds where it is.
        after.appendChild(scriptureCard(q.type === 'said' ? { ref: q.ref, note: q.note } : q));
        var last = round + 1 >= rounds || (timed && FF.GameLength.timeUp() && (round + 1) % n === 0);
        var nextBtn = FF.Advance.button(last ? t('seeResults', 'See results') : t('next', 'Next'), function () { api.audio.play('click'); next(); }, { class: 'btn-lg' });
        after.appendChild(nextBtn);
        api.shell.updateScores(entity.id);
        if (FF.Nav && FF.Nav.focus) FF.Nav.focus(nextBtn);
      }
    }

    /* Tap the events in order: each tap fills the next slot; tap a filled slot to undo.
       The last tap checks the answer. */
    function orderBoard(q, onDone) {
      var el = FF.ui.div('bq-order');
      var slots = FF.ui.el('ol', { class: 'bq-order__slots', 'aria-label': t('bqYourOrder', 'Your order') });
      var poolBox = FF.ui.el('div', { class: 'bq-order__pool', role: 'group', 'aria-label': t('bqEvents', 'Events to place') });
      el.appendChild(slots);
      el.appendChild(poolBox);
      var placed = [];
      var locked = false;
      var slotEls = q.options.map(function (o, i) {
        var li = FF.ui.el('li', { class: 'bq-slot' });
        li.appendChild(FF.ui.span('bq-slot__n', String(i + 1)));
        var b = FF.ui.el('button', { type: 'button', class: 'bq-slot__btn bible-quiz-option', disabled: true });
        b.addEventListener('click', function () {
          if (locked || i >= placed.length) return;
          placed.splice(i, 1);
          api.audio.play('tap');
          draw();
        });
        li.appendChild(b);
        slots.appendChild(li);
        return { li: li, btn: b };
      });
      var buttons = q.options.map(function (label, i) {
        var b = FF.ui.el('button', { type: 'button', class: 'word-chip bq-event bible-quiz-option' }, label);
        b.addEventListener('click', function () {
          if (locked || placed.indexOf(i) !== -1) return;
          placed.push(i);
          api.audio.play('tap');
          draw();
          if (placed.length === q.options.length) { locked = true; onDone(placed.slice()); }
        });
        poolBox.appendChild(b);
        return b;
      });
      function draw() {
        slotEls.forEach(function (s, i) {
          var has = i < placed.length;
          s.btn.textContent = has ? q.options[placed[i]] : '';
          s.btn.disabled = locked || !has;
          s.btn.setAttribute('aria-label', has ? t('bqTakeBack', 'Take back {w}', { w: q.options[placed[i]] }) : t('bqEmptySlot', 'Empty'));
          s.li.classList.toggle('is-filled', has);
        });
        buttons.forEach(function (b, i) { b.hidden = placed.indexOf(i) !== -1; });
      }
      draw();
      return {
        el: el,
        buttons: buttons,
        lock: function () { locked = true; draw(); buttons.forEach(function (b) { b.disabled = true; }); },
        // Mark each slot, then list the right order underneath.
        reveal: function () {
          locked = true;
          draw();
          buttons.forEach(function (b) { b.disabled = true; });
          slotEls.forEach(function (s, i) {
            var ok = i < placed.length && q.options[placed[i]] === q.correct[i];
            s.li.classList.add(ok ? 'is-right' : 'is-wrong');
            s.li.appendChild(FF.ui.span('sr-only', ok ? t('correctAnswer', 'Correct answer') : t('wrongAnswer', 'Wrong answer')));
          });
          if (!isRightOrder(q, placed)) {
            var right = FF.ui.el('ol', { class: 'bq-order__right', 'aria-label': t('bqRightOrder', 'Here is the right order.') });
            q.correct.forEach(function (c) { right.appendChild(FF.ui.el('li', {}, c)); });
            el.appendChild(right);
          }
          poolBox.hidden = true;
        }
      };
    }

    function finish() {
      if (offSettle) offSettle();
      api.shell.hideTimer();
      if (race) { race.end(); end(); return; }
      recap();
    }

    function end() {
      var res = api.scoring.results ? api.scoring.results() : null;
      var ranked = (res && res.results) || [];
      var best = 0;
      var fastest = null;
      ranked.forEach(function (r) {
        if (r.bestStreak > best) best = r.bestStreak;
        if (r.fastest != null && (fastest == null || r.fastest < fastest)) fastest = r.fastest;
      });
      api.audio.play('winner');
      api.end({
        results: ranked, winnerId: res ? res.winnerId : null,
        bestStreak: best, fastest: fastest,
        quizCorrect: totals.c, quizAnswered: totals.a
      });
    }

    // How everyone did, by topic, and the verses met, before the results.
    function recap() {
      var root = api.shell.root;
      FF.ui.clear(root);
      var stage = FF.GameUI.stage({ className: 'qm-recap bq-recap' });
      var pct = totals.a ? Math.round(totals.c / totals.a * 100) : 0;
      var ring = FF.ui.div('qm-ring');
      ring.style.setProperty('--p', String(pct));
      ring.appendChild(FF.ui.span('qm-ring__num', pct + '%'));
      stage.appendChild(ring);
      stage.appendChild(FF.GameUI.kicker(t('bqRecapKicker', 'Bible Quiz recap')));
      stage.appendChild(FF.GameUI.prompt(t('qmRecapTitle', '{c} of {a} right', { c: totals.c, a: totals.a }), 'xl'));

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
        var rec = (api.scoring.record && api.scoring.record(e.id)) || {};
        var bits = [t('qmRightOf', '{c}/{a} right', { c: s.c, a: s.a })];
        if (rec.bestStreak > 1) bits.push(t('qmBestStreak', 'best streak {n}', { n: rec.bestStreak }));
        if (s.fastest != null) bits.push(t('qmFastest', 'fastest {s}s', { s: s.fastest.toFixed(1) }));
        who.appendChild(FF.ui.span('qm-person__meta', bits.join(' · ')));
        li.appendChild(who);
        li.appendChild(FF.ui.span('qm-person__score', FF.util.formatNumber(api.scoring.get(e.id) || 0)));
        people.appendChild(li);
      });
      stage.appendChild(people);

      var ids = Object.keys(totals.topics);
      if (ids.length > 1) {
        stage.appendChild(FF.ui.el('h3', { class: 'qm-recap__h' }, t('qmByTopic', 'By topic')));
        var listBox = FF.ui.div('qm-bytopic');
        ids.sort(function (a, b) { return totals.topics[b].a - totals.topics[a].a; }).forEach(function (id) {
          var x = totals.topics[id];
          var row = FF.ui.div('qm-bytopic__row');
          row.appendChild(topicBadge(id));
          var m = FF.GameUI.meter(x.a ? x.c / x.a : 0);
          m.classList.add('qm-bytopic__meter');
          m.setAttribute('aria-label', topicName(id));
          row.appendChild(m);
          row.appendChild(FF.ui.span('qm-bytopic__n', x.c + '/' + x.a));
          listBox.appendChild(row);
        });
        stage.appendChild(listBox);
      }

      if (verses.length) {
        stage.appendChild(FF.ui.el('h3', { class: 'qm-recap__h' }, t('bqVersesMet', 'Verses from this game')));
        var vbox = FF.ui.div('bq-verses');
        verses.forEach(function (q) { vbox.appendChild(scriptureCard({ ref: q.ref, verse: q.verse })); });
        stage.appendChild(vbox);
      }
      stage.appendChild(FF.GameUI.action(t('seeResults', 'See results'), function () { end(); }, { icon: 'trophy' }));
      root.appendChild(stage);
      if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(stage);
    }

    render();
  }

  /* ================= registration ================= */

  FF.BibleQuiz = {
    LEVELS: LEVELS, TYPES: TYPES, STANDARD: STANDARD, DOUBLE_EVERY: DOUBLE_EVERY,
    STREAK_EVERY: STREAK_EVERY, STREAK_BONUS: STREAK_BONUS, MIN_POOL: MIN_POOL,
    sanitize: sanitize, isStandard: isStandard, pool: pool, rng: rng, prepare: prepare,
    deal: deal, isRightOrder: isRightOrder, points: points, isDouble: isDouble, summary: summary
  };

  FF.registerGame({
    id: 'bibleQuiz',
    featured: true,
    name: 'Bible Quiz',
    description: 'Over 400 questions from Genesis to Revelation: finish the verse, who said it, put the story in order, and more.',
    category: 'bible',
    icon: '📖',
    players: [1, 8],
    difficulty: 'Normal',
    duration: 5,
    tags: ['quiz', 'faith', 'trivia', 'everyone'],
    modes: ['solo', 'turn', 'team', 'everyone', 'host'],
    defaultMode: 'turn',
    howToPlay: [
      'Pick a level (Kids, Family or Bible scholar), the topics and the kinds of question.',
      'Answer multiple choice, finish the verse, who said it, true or false, and put the story in order.',
      'Faster answers score more. Every fifth question is worth double, and 3 right in a row earns a bonus.',
      'Stuck? Use your 50:50 once a game. After each answer, read the verse it comes from.'
    ],
    start: function (api) {
      // One number decides the whole deal. It is drawn first, before anything
      // else uses the random source, so a challenge or a room deals the same everywhere.
      if (racingNow()) FF.Random.seed(FF.Random.roundSeed(FF.Room.current().meta.seed, api.def.id, 'deck'));
      var seed = Math.floor(rand0() * 4294967296);
      if (racingNow() || api.config.daily || api.config.challenge) { play(api, STANDARD, seed); return; }
      setupScreen(api, function (cfg) {
        if (!stillShown(api)) return;
        if (!isStandard(cfg)) api.config.customRules = true;
        play(api, cfg, seed);
      });
    }
  });
})();
