/* ============================================================
   PLAYMONA — games/blinkRemember.js
   Blink & Remember: a row of closed boxes. Each one opens for a blink
   (1-6 s) to show a picture, in order, and never opens again. Then the
   player taps each box and picks its picture from a grid of choices.
   Every box is filled first (answers can be changed); then the boxes
   are revealed one by one.

   - Solo, or pass and play (everyone gets the same boxes, in turn).
   - Online rooms: a parallel challenge (js/net/parallel.js), every phone
     deals the same boxes from the round seed.
   - Pictures: the Memory Match card art (js/data/memoryDecks.js), one
     surprise deck per game or a mix of every deck.

   The pure rules are FF.BlinkRemember (tools/test/blinkRemember.test.js).
   Looks: css/games.css (.bk-*).
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  function t(key, fallback, vars) { return FF.t ? FF.t(key, fallback, vars) : String(fallback); }

  /* ================= rules (pure, tested) ================= */

  var BOXES = [3, 6, 9, 12];
  var SECONDS = [1, 2, 3, 4, 5, 6];
  var DECKS = ['surprise', 'mix'];
  var ROOM_ROUNDS = 3;
  var GAP_MS = 380;          // between one box shutting and the next opening
  var COUNT_IN = 3;

  function pickOf(list, v, fallback) { return list.indexOf(v) !== -1 ? v : fallback; }

  function defaults(difficulty) {
    return {
      boxes: difficulty === 'easy' ? 3 : difficulty === 'hard' ? 9 : 6,
      seconds: 2,
      deck: 'surprise'
    };
  }

  function sanitize(s) {
    s = s || {};
    var d = defaults(s.difficulty);
    var out = {
      boxes: pickOf(BOXES, Number(s.boxes), d.boxes),
      seconds: pickOf(SECONDS, Number(s.seconds), d.seconds),
      deck: pickOf(DECKS, s.deck, d.deck)
    };
    if (s.difficulty) out.difficulty = String(s.difficulty);
    return out;
  }

  var STANDARD = defaults('normal');
  function isStandard(s) {
    var c = sanitize(s);
    return c.boxes === STANDARD.boxes && c.seconds === STANDARD.seconds && c.deck === STANDARD.deck;
  }
  function key(s) { return [s.boxes, s.seconds, s.deck].join('|'); }

  /* How many pictures the picker offers for n boxes. */
  function choicesFor(n) { return n <= 3 ? 6 : n <= 9 ? 12 : 16; }

  function shuffle(list, rand) {
    var a = list.slice();
    for (var j = a.length - 1; j > 0; j--) {
      var k = Math.floor(rand() * (j + 1));
      var x = a[j]; a[j] = a[k]; a[k] = x;
    }
    return a;
  }

  var MM_ART = 'games/memoryMatch';
  function hasPic(id) {
    var m = FF.AssetManifest && FF.AssetManifest[MM_ART];
    return !!(m && m[id]);
  }
  function card(row, tint) {
    return { id: row[0], name: t('mmCard_' + row[0].replace(/-/g, '_'), row[1]), emoji: row[2], pic: hasPic(row[0]), tint: tint || null };
  }

  /* The game's pictures: { deckName, tint, boxes: [card], choices: [card] }.
     boxes[i] is the picture hidden in box i; choices holds every box picture
     plus decoys from the same pool, in one shuffled order that the picker
     keeps for every box. rand() is the room's seeded random in a room. */
  function deal(cfg, rand) {
    var decks = FF.MemoryDecks || [];
    var pool = [];
    var deckName = t('mmMix', 'A bit of everything');
    var tint = null;
    if (cfg.deck === 'surprise' && decks.length) {
      var d = decks[Math.floor(rand() * decks.length)];
      deckName = t('mmDeck_' + d.id, d.name);
      tint = d.colour;
      pool = d.cards.map(function (r) { return card(r, d.colour); });
    } else {
      decks.forEach(function (dk) { dk.cards.forEach(function (r) { pool.push(card(r, dk.colour)); }); });
    }
    pool = shuffle(pool, rand);
    var picked = [];
    var seen = {};
    var need = choicesFor(cfg.boxes);
    for (var i = 0; i < pool.length && picked.length < need; i++) {
      var face = pool[i].pic ? pool[i].id : pool[i].emoji;   // two emoji stand-ins can look alike
      if (seen[face]) continue;
      seen[face] = true;
      picked.push(pool[i]);
    }
    var boxes = picked.slice(0, cfg.boxes);
    return { deckName: deckName, tint: tint, boxes: boxes, choices: shuffle(picked, rand) };
  }

  function bonusFor(difficulty) {
    if (difficulty === 'easy') return 1;
    if (difficulty === 'hard') return 2;
    return 1.5;
  }

  function speedBonus(ms, limitMs, max) {
    if (FF.Parallel && FF.Parallel.speedBonus) return FF.Parallel.speedBonus(ms, limitMs, max);
    if (ms == null || !limitMs) return 0;
    return Math.round(max * Math.max(0, Math.min(1, 1 - ms / limitMs)));
  }

  /* 100 a right box, half as much again when every box is right, and a
     little for answering quickly (only for the boxes that were right). */
  function points(right, n, answerMs, bonus) {
    if (!right) return 0;
    var base = right * 100 + (right >= n ? n * 50 : 0);
    return Math.round((bonus || 1) * (base + speedBonus(answerMs, n * 5000, right * 20)));
  }

  /* How many picks match their box. picks[i] is a card id or null. */
  function score(boxes, picks) {
    var right = 0;
    boxes.forEach(function (c, i) { if (picks[i] === c.id) right++; });
    return right;
  }

  /* A room round: watching (with a 3 s count-in) plus time to answer. */
  function roomSeconds(cfg) { return Math.ceil(COUNT_IN + 1 + cfg.boxes * (cfg.seconds + GAP_MS / 1000) + cfg.boxes * 6 + 6); }

  function columns(n) { return n === 12 ? 4 : 3; }

  /* ================= labels and settings ================= */

  function deckLabel(d) { return d === 'mix' ? t('bkDeckMix', 'Mix of everything') : t('bkDeckSurprise', 'Surprise deck'); }

  function summary(s) {
    s = sanitize(s);
    return [
      t('bkNBoxes', '{n} boxes', { n: s.boxes }),
      t('bkNSecEach', '{n}s each', { n: s.seconds }),
      deckLabel(s.deck)
    ].join(' · ');
  }

  function fields() {
    function opt(label, value) { return { label: label, value: value }; }
    return [
      { key: 'boxes', label: t('bkBoxes', 'Boxes'), options: BOXES.map(function (n) { return opt(String(n), n); }) },
      { key: 'seconds', label: t('bkShowFor', 'Show each for'), options: SECONDS.map(function (n) { return opt(n + 's', n); }) },
      { key: 'deck', label: t('bkPictures', 'Pictures'), options: DECKS.map(function (d) { return opt(deckLabel(d), d); }) }
    ];
  }

  /* ================= device helpers ================= */

  function reduceMotion() {
    var setting = FF.Settings && FF.Settings.get && FF.Settings.get('reduceMotion');
    var os = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return !!(setting || os);
  }

  function buzz(pattern) {
    if (FF.Audio && FF.Audio.effectsEnabled === false) return;
    var touched = !navigator.userActivation || navigator.userActivation.hasBeenActive;
    try { if (touched && navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* not supported */ }
  }

  function rand() { return FF._rand ? FF._rand() : Math.random(); }

  function note(api, i) {
    if (api.audio && api.audio.note) api.audio.note(i, 0.35);
    else if (api.audio) api.audio.play('flip');
  }

  function picEl(c, cls) {
    var el = FF.ui.span(cls);
    if (c.pic && FF.Assets) el.appendChild(FF.ui.el('img', { src: FF.Assets.artPath(MM_ART, c.id), alt: '', draggable: 'false', decoding: 'async' }));
    else el.appendChild(FF.ui.span(cls + '__emoji', c.emoji));
    return el;
  }

  function preload(cards) {
    if (typeof Image !== 'function' || !FF.Assets) return;
    cards.forEach(function (c) { if (c.pic) { var im = new Image(); im.src = FF.Assets.artPath(MM_ART, c.id); } });
  }

  /* ================= one game on one phone =================
     Watch the boxes, fill them, reveal. o: { cfg, dealt, turnEntity,
     roundText, live, timer (s, 0 = none), onDone({ right, boxes, points, answerMs }) }
     Returns { start, stop } (stop returns the result so far). */
  function play(api, o) {
    var cfg = o.cfg;
    var dealt = o.dealt;
    var n = cfg.boxes;
    var bonus = bonusFor(api.config.difficulty);
    var calm = reduceMotion();
    var root = api.shell.root;
    FF.ui.clear(root);
    api.shell.hideTimer();
    preload(dealt.choices);

    var picks = [];
    for (var p = 0; p < n; p++) picks.push(null);
    var phase = 'wait';     // wait | watch | answer | reveal | done
    var answerFrom = 0;
    var answerMs = null;
    var sheet = null;
    var timers = [];
    var ended = false;

    var stage = FF.GameUI.stage({ center: true, className: 'bk' });
    if (o.live) stage.appendChild(o.live);
    stage.appendChild(FF.GameUI.turnBar(o.turnEntity || null, o.roundText || null));
    var head = FF.ui.div('sq-head bk-head');
    var stats = FF.ui.div('sq-stats');
    [[t('bkBoxes', 'Boxes'), n], [t('bkEach', 'Each'), cfg.seconds + 's'], [t('bkPictures', 'Pictures'), dealt.deckName]].forEach(function (b) {
      var s = FF.ui.span('sq-stat');
      s.appendChild(FF.ui.span('sq-stat__label', b[0]));
      s.appendChild(FF.ui.span('sq-stat__value', String(b[1])));
      stats.appendChild(s);
    });
    head.appendChild(stats);
    stage.appendChild(head);
    var chip = FF.ui.div('sq-state sq-state--ready', '');
    chip.setAttribute('aria-live', 'polite');
    stage.appendChild(chip);

    var grid = FF.ui.div('bk-grid bk-grid--' + n);
    grid.style.setProperty('--bk-cols', String(columns(n)));
    if (dealt.tint) grid.style.setProperty('--bk-lid', 'var(' + dealt.tint + ')');
    var boxes = [];
    for (var i = 0; i < n; i++) boxes.push(makeBox(i));
    stage.appendChild(grid);

    var foot = FF.ui.div('bk-foot');
    var msg = FF.ui.div('sq-msg', '');
    foot.appendChild(msg);
    var check = FF.GameUI.action(t('bkCheck', 'Check my answers'), function () {
      if (phase !== 'answer' || picks.indexOf(null) !== -1) return;
      api.audio.play('select');
      reveal();
    }, { icon: 'check', className: 'bk-check' });
    check.disabled = true;
    check.style.display = 'none';
    foot.appendChild(check);
    stage.appendChild(foot);
    root.appendChild(stage);

    document.addEventListener('keydown', onKey);

    function makeBox(i) {
      var b = FF.ui.el('button', { class: 'bk-box', type: 'button', ariaLabel: t('bkBoxN', 'Box {n}', { n: i + 1 }), dataset: { box: String(i) } });
      b.appendChild(FF.ui.span('bk-box__num', String(i + 1)));
      var face = FF.ui.span('bk-box__face');
      b.appendChild(face);
      b.appendChild(FF.ui.span('bk-box__lid'));
      var ring = FF.ui.span('bk-box__ring');
      b.appendChild(ring);
      b.addEventListener('click', function () { openPicker(i); });
      grid.appendChild(b);
      return { el: b, face: face };
    }

    function alive() { return !!stage.isConnected && !ended; }
    function later(fn, ms) {
      var id = setTimeout(function () {
        timers.splice(timers.indexOf(id), 1);
        if (alive()) fn();
      }, ms);
      timers.push(id);
    }
    function state(kind, text) {
      chip.className = 'sq-state sq-state--' + kind;
      FF.ui.clear(chip);
      var iconKey = { watch: 'eye', turn: 'hand-tap', good: 'check', bad: 'x', ready: 'clock', best: 'trophy' }[kind];
      if (iconKey && FF.Icons && FF.Icons.icon) chip.appendChild(FF.Icons.icon(iconKey));
      chip.appendChild(FF.ui.span('sq-state__text', text));
    }
    function onKey(e) {
      if (!alive()) { document.removeEventListener('keydown', onKey); return; }
      if (sheet || phase !== 'answer' || e.ctrlKey || e.metaKey || e.altKey) return;
      var d = parseInt(e.key, 10);
      if (!(d >= 1 && d <= Math.min(9, n))) return;
      e.preventDefault();
      openPicker(d - 1);
    }

    /* ---------- watch ---------- */
    function countIn(k) {
      if (k === 0) { watch(0); return; }
      state('ready', t('rsGetReadyN', 'Get ready… {n}', { n: k }));
      later(function () { countIn(k - 1); }, 700);
    }
    function watch(i) {
      if (i >= n) {
        later(function () {
          phase = 'answer';
          answerFrom = Date.now();
          grid.classList.add('is-answering');
          state('turn', t('bkFillAll', 'Fill every box: tap a box to choose its picture'));
          check.style.display = '';
          refresh();
          if (o.timer > 0) api.shell.setTimer(o.timer, function () { if (phase === 'answer') reveal(); });
        }, 300);
        return;
      }
      phase = 'watch';
      state('watch', t('bkWatchN', 'Box {n} of {total}', { n: i + 1, total: n }));
      var b = boxes[i];
      FF.ui.clear(b.face);
      b.face.appendChild(picEl(dealt.boxes[i], 'bk-pic'));
      b.el.style.setProperty('--bk-dur', (cfg.seconds * 1000) + 'ms');
      b.el.classList.add('is-open');
      note(api, i);
      buzz(10);
      later(function () {
        b.el.classList.remove('is-open');
        b.el.classList.add('is-seen');
        // The picture is gone for good once the lid is down.
        later(function () { FF.ui.clear(b.face); }, calm ? 0 : 260);
        later(function () { watch(i + 1); }, GAP_MS);
      }, cfg.seconds * 1000);
    }

    /* ---------- answer ---------- */
    function refresh() {
      var filled = 0;
      boxes.forEach(function (b, i) {
        FF.ui.clear(b.face);
        var c = picks[i] ? findChoice(picks[i]) : null;
        b.el.classList.toggle('is-filled', !!c);
        if (c) { b.face.appendChild(picEl(c, 'bk-pic')); filled++; }
        b.el.setAttribute('aria-label', c ? t('bkBoxNIs', 'Box {n}: {name}', { n: i + 1, name: c.name }) : t('bkBoxNEmpty', 'Box {n}: empty', { n: i + 1 }));
      });
      check.disabled = filled < n;
      msg.textContent = filled < n ? t('bkFilledN', '{n} of {total} filled', { n: filled, total: n }) : t('bkAllFilled', 'All filled. Change any box, or check your answers.');
    }
    function findChoice(id) {
      for (var i = 0; i < dealt.choices.length; i++) if (dealt.choices[i].id === id) return dealt.choices[i];
      return null;
    }
    function openPicker(i) {
      if (phase !== 'answer' || sheet) return;
      api.audio.play('click');
      var gridEl = FF.ui.div('bk-choices bk-choices--' + dealt.choices.length);
      dealt.choices.forEach(function (c) {
        var usedAt = picks.indexOf(c.id);
        var btn = FF.ui.el('button', {
          class: 'bk-choice' + (picks[i] === c.id ? ' is-current' : ''),
          type: 'button',
          ariaLabel: c.name + (usedAt !== -1 && usedAt !== i ? ' · ' + t('bkUsedIn', 'in box {n}', { n: usedAt + 1 }) : '')
        });
        btn.appendChild(picEl(c, 'bk-pic'));
        if (usedAt !== -1) btn.appendChild(FF.ui.span('bk-choice__badge', String(usedAt + 1)));
        btn.addEventListener('click', function () {
          // A picture sits in one box at a time: picking it here empties its old box.
          var old = picks.indexOf(c.id);
          if (old !== -1 && old !== i) picks[old] = null;
          picks[i] = c.id;
          api.audio.play('select');
          buzz(10);
          var s = sheet;
          sheet = null;
          if (s) s.close();
          refresh();
          boxes[i].el.classList.remove('bk-pop');
          void boxes[i].el.offsetWidth;
          if (!calm) boxes[i].el.classList.add('bk-pop');
          var next = picks.indexOf(null);
          if (next !== -1 && boxes[next]) { try { boxes[next].el.focus({ preventScroll: true }); } catch (e) { /* old browsers */ } }
        });
        gridEl.appendChild(btn);
      });
      sheet = FF.UI.dialog({
        kind: 'sheet', wide: true, className: 'bk-sheet',
        title: t('bkWhichFor', 'What was in box {n}?', { n: i + 1 }),
        body: gridEl,
        onClose: function () { sheet = null; }
      });
    }

    /* ---------- reveal ---------- */
    function reveal() {
      if (phase !== 'answer') return;
      phase = 'reveal';
      answerMs = Date.now() - answerFrom;
      api.shell.hideTimer();
      if (sheet) { var s = sheet; sheet = null; s.close(); }
      check.style.display = 'none';
      grid.classList.remove('is-answering');
      grid.classList.add('is-revealing');
      state('watch', t('bkRevealing', 'Let’s see…'));
      msg.textContent = '';
      var right = 0;
      var k = 0;
      function step() {
        if (k >= n) { finish(right); return; }
        var b = boxes[k];
        var truth = dealt.boxes[k];
        var ok = picks[k] === truth.id;
        FF.ui.clear(b.face);
        b.face.appendChild(picEl(truth, 'bk-pic'));
        if (!ok && picks[k]) {
          var mine = findChoice(picks[k]);
          if (mine) b.face.appendChild(picEl(mine, 'bk-pic bk-pic--mine'));
        }
        b.el.classList.remove('is-filled');
        b.el.classList.add(ok ? 'is-right' : 'is-wrong');
        b.el.setAttribute('aria-label', t('bkBoxNWas', 'Box {n} was {name}', { n: k + 1, name: truth.name }) + (ok ? ' ✓' : ' ✗'));
        if (ok) { right++; note(api, k); } else api.audio.play('wrong');
        k++;
        later(step, calm ? 250 : 520);
      }
      later(step, 400);
    }

    function result(right) {
      return { right: right, boxes: n, points: points(right, n, answerMs, bonus), answerMs: answerMs };
    }

    function finish(right) {
      phase = 'done';
      var res = result(right);
      if (right >= n) {
        state('best', t('bkAllRight', 'All {n} right!', { n: n }));
        api.audio.play('winner');
        if (!calm && FF.Confetti && (!FF.Settings || FF.Settings.get('animations') !== false)) FF.Confetti.rain(80);
      } else {
        state(right ? 'good' : 'bad', t('bkNRight', '{n} of {total} right', { n: right, total: n }));
        api.audio.play(right ? 'correct' : 'roundEnd');
      }
      msg.textContent = t('bkPointsN', '+{n} points', { n: res.points });
      foot.appendChild(FF.GameUI.action(o.nextLabel || t('next', 'Next'), function () {
        api.audio.play('select');
        cleanup();
        o.onDone(res);
      }, { icon: 'arrow-right' }));
    }

    function cleanup() {
      ended = true;
      timers.forEach(clearTimeout);
      timers = [];
      document.removeEventListener('keydown', onKey);
      if (sheet) { var s = sheet; sheet = null; s.close(); }
      api.shell.hideTimer();
    }

    return {
      start: function () { phase = 'watch'; grid.classList.add('is-watching'); countIn(COUNT_IN); },
      stop: function () {
        var right = score(dealt.boxes, picks);
        if (answerMs == null && phase === 'answer') answerMs = Date.now() - answerFrom;
        cleanup();
        return result(right);
      }
    };
  }

  /* ================= personal bests ================= */

  var BEST_KEY = 'blinkRemember:best';
  function bests() { return (FF.Storage && FF.Storage.get(BEST_KEY, {})) || {}; }
  function bestFor(id, cfg) { return bests()[id + '|' + key(cfg)] || null; }
  function saveBest(id, cfg, st) {
    var all = bests();
    var k = id + '|' + key(cfg);
    var old = all[k];
    if (old && old.points >= st.points) return;
    all[k] = { points: st.points, right: st.right };
    try { FF.Storage.set(BEST_KEY, all); } catch (e) { /* storage full */ }
  }

  /* ================= setup, pass and results screens ================= */

  function setupScreen(api, onGo) {
    var root = api.shell.root;
    api.shell.hideTimer();
    FF.ui.clear(root);
    var saved = (FF.Storage && FF.Storage.get('blinkRemember:setup', null)) || null;
    var gs = sanitize(Object.assign({}, defaults(api.config.difficulty), saved || {}));
    var stage = FF.GameUI.stage({ center: true, className: 'bk sq-setup' });
    stage.appendChild(FF.GameUI.kicker(t('bkName', 'Blink & Remember')));
    stage.appendChild(FF.GameUI.prompt(t('bkSetupTitle', 'How many boxes can you remember?'), 'md'));
    var box = FF.ui.el('section', { class: 'settings-section nr-setup__rows' });
    var note = FF.ui.el('p', { class: 'gm-note nr-setup__note', 'aria-live': 'polite' });
    function render() {
      FF.ui.clear(box);
      fields().forEach(function (f) {
        box.appendChild(FF.UI.settingRow(f.label, FF.UI.segmented({
          label: f.label, value: gs[f.key], options: f.options,
          onChange: function (v) { gs[f.key] = v; renote(); }
        })));
      });
      box.appendChild(FF.ui.el('p', { class: 'gm-note sq-setup__hint' }, t('bkHowNote', 'Each box opens once, in order. Then pick what was in each box from the pictures.')));
      renote();
    }
    function renote() {
      var ranked = FF.Leaderboards && FF.Leaderboards.active && FF.Leaderboards.active(api.def);
      note.textContent = summary(gs) + (ranked && !isStandard(gs) ? ' · ' + t('nrUnranked', 'Leaderboards use the standard settings') : '');
    }
    render();
    stage.appendChild(box);
    stage.appendChild(note);
    var row = FF.ui.div('nr-setup__actions');
    row.appendChild(FF.UI.button(t('nrStandard', 'Standard settings'), {
      class: 'btn-lg btn-ghost', icon: 'restart',
      onClick: function () { api.audio.play('click'); gs = sanitize(STANDARD); render(); }
    }));
    row.appendChild(FF.GameUI.action(t('rsStart', 'Start'), function () {
      api.audio.play('select');
      var cfg = sanitize(gs);
      try { if (FF.Storage) FF.Storage.set('blinkRemember:setup', cfg); } catch (e) { /* storage full */ }
      onGo(cfg);
    }, { icon: 'play' }));
    stage.appendChild(row);
    root.appendChild(stage);
    if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(stage);
  }

  function passScreen(api, who, roundText, onReady) {
    var root = api.shell.root;
    api.shell.hideTimer();
    FF.ui.clear(root);
    var stage = FF.GameUI.stage({ center: true, className: 'bk nr-pass' });
    stage.appendChild(FF.GameUI.turnBar(who, roundText));
    var ava = FF.ui.div('nr-pass__ava');
    ava.appendChild(FF.Players.avatarEl(who, 'nr-pass__img'));
    stage.appendChild(ava);
    stage.appendChild(FF.GameUI.prompt(t('nrPassTo', 'Pass to {name}', { name: who.name }), 'md'));
    stage.appendChild(FF.GameUI.sub(t('bkPassSub', 'Same boxes for everyone. No peeking while others play!')));
    stage.appendChild(FF.GameUI.action(t('nrReady', 'I’m ready'), function () { api.audio.play('select'); onReady(); }, { icon: 'play' }));
    root.appendChild(stage);
    if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(stage);
  }

  function stillShown(api) { return !!(api.shell.root && (!document.body || !document.body.contains || document.body.contains(api.shell.root))); }

  function playLocal(api, cfg) {
    var list = (api.config.scorers || []).slice();
    if (!list.length) list = [{ id: 'me', name: t('you', 'You') }];
    var multi = list.length > 1;
    var dealt = deal(cfg, rand);    // one deal: everyone in pass and play gets the same boxes
    var runs = [];
    var i = 0;
    function next() {
      if (!stillShown(api)) return;
      if (i >= list.length) { results(api, cfg, runs); return; }
      var who = list[i];
      var rt = multi ? t('nrPlayerOf', 'Player {n} of {total}', { n: i + 1, total: list.length }) : null;
      if (multi) passScreen(api, who, rt, function () { go(who, rt); });
      else go(who, rt);
    }
    function go(who, rt) {
      api.shell.updateScores(who.id);
      var h = play(api, {
        cfg: cfg, dealt: dealt, turnEntity: multi ? who : null, roundText: rt,
        timer: api.config.timer > 0 ? api.config.timer * cfg.boxes : 0,
        nextLabel: multi && i + 1 < list.length ? t('bkNextPlayer', 'Next player') : t('seeResults', 'See results'),
        onDone: function (st) {
          runs.push({ who: who, st: st });
          api.scoring.add(who.id, st.points, { correct: st.right >= st.boxes });
          api.shell.updateScores(who.id);
          i++;
          next();
        }
      });
      h.start();
    }
    next();
  }

  function rankRuns(runs) {
    var sorted = runs.slice().sort(function (a, b) { return b.st.points - a.st.points || b.st.right - a.st.right; });
    var place = 0, prev = null;
    sorted.forEach(function (r, i) {
      if (!prev || prev.st.points !== r.st.points || prev.st.right !== r.st.right) place = i + 1;
      r.place = place;
      prev = r;
    });
    return sorted;
  }

  function results(api, cfg, runs) {
    var root = api.shell.root;
    api.shell.hideTimer();
    FF.ui.clear(root);
    var ranked = rankRuns(runs);
    var top = ranked[0];
    var tie = ranked.length > 1 && ranked[1].place === 1;
    var solo = ranked.length === 1;
    var newBest = {};
    ranked.forEach(function (r) {
      var had = bestFor(r.who.id, cfg);
      if (!had || r.st.points > had.points) { newBest[r.who.id] = !!had; saveBest(r.who.id, cfg, r.st); }
    });
    var stage = FF.GameUI.stage({ center: true, className: 'bk nr-results' });
    var title;
    if (solo) title = top.st.right >= top.st.boxes ? t('bkPerfect', 'Perfect recall!') : t('bkSoloN', '{n} of {total} right', { n: top.st.right, total: top.st.boxes });
    else if (tie) title = t('nrTie', 'It’s a tie!');
    else title = t('nrWins', '{name} wins!', { name: top.who.name });
    stage.appendChild(FF.GameUI.kicker(summary(cfg)));
    stage.appendChild(FF.GameUI.prompt(title, 'xl'));
    if (solo) {
      stage.appendChild(FF.ui.div('nr-results__score', FF.util.formatNumber(top.st.points)));
      if (newBest[top.who.id] === true) stage.appendChild(FF.GameUI.feedback('good', t('nrNewBest', 'New personal best!')));
      else {
        var b = bestFor(top.who.id, cfg);
        if (b && b.points > top.st.points) stage.appendChild(FF.GameUI.note(t('nrYourBest', 'Your best on these settings: {n}', { n: FF.util.formatNumber(b.points) })));
      }
    }
    var table = FF.ui.el('ol', { class: 'nr-table' });
    ranked.forEach(function (r) {
      var li = FF.ui.el('li', { class: 'nr-row' + (r.place === 1 ? ' is-winner' : '') });
      if (!solo) li.appendChild(FF.ui.span('nr-row__rank', String(r.place)));
      li.appendChild(FF.Players.avatarEl(r.who, 'nr-row__ava'));
      var who = FF.ui.span('nr-row__who');
      who.appendChild(FF.ui.span('nr-row__name', r.who.name));
      who.appendChild(FF.ui.span('nr-row__status', (r.st.right >= r.st.boxes ? t('bkStatusAll', 'Every box right') : t('bkNRight', '{n} of {total} right', { n: r.st.right, total: r.st.boxes })) +
        (newBest[r.who.id] === true && !solo ? ' · ' + t('nrBestShort', 'personal best') : '')));
      li.appendChild(who);
      li.appendChild(FF.ui.span('nr-row__pts', FF.util.formatNumber(r.st.points)));
      table.appendChild(li);
    });
    stage.appendChild(table);
    stage.appendChild(FF.GameUI.action(t('seeResults', 'See results'), function () {
      api.audio.play('select');
      api.end({
        results: ranked.map(function (r) {
          return { id: r.who.id, name: r.who.name, avatar: r.who.avatar, color: r.who.color, photo: r.who.photo, points: r.st.points, correct: r.st.right };
        }),
        winnerId: tie ? null : top.who.id
      });
    }, { icon: 'trophy' }));
    root.appendChild(stage);
    if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(stage);
  }

  /* ================= online room ================= */

  function roomSettings() {
    var r = FF.Room && FF.Room.current();
    return (r && r.meta && r.meta.settings) || {};
  }

  function playOnline(api) {
    var cfg = sanitize(roomSettings());
    FF.Parallel.run(api, {
      rounds: ROOM_ROUNDS,
      seconds: roomSeconds(cfg),
      gate: '.bk-box',
      play: function (n, ctx) {
        // Drawn from the round seed: every phone hides the same pictures in the same boxes.
        var dealt = deal(cfg, rand);
        var h = play(api, {
          cfg: cfg, dealt: dealt, live: ctx.live, roundText: ctx.roundText, timer: 0,
          nextLabel: t('next', 'Next'),
          onDone: function (st) { ctx.done({ value: st.points, right: st.right, boxes: st.boxes }); }
        });
        return {
          start: h.start,
          stop: function () { var st = h.stop(); return { value: st.points, right: st.right, boxes: st.boxes }; }
        };
      },
      describe: function () {
        return { kind: 'card', text: t('bkWatch', 'Everyone remembers the same boxes: {s}', { s: summary(cfg) }) };
      },
      detail: function (a) {
        return t('bkNRight', '{n} of {total} right', { n: a.right || 0, total: a.boxes || cfg.boxes });
      }
    });
  }

  /* ================= registration ================= */

  var ROOM = {
    defaults: STANDARD,
    fields: function () { return fields(); },
    sanitize: function (s) { return sanitize(s); },
    summary: function (s) { return summary(s); }
  };

  FF.BlinkRemember = {
    BOXES: BOXES, SECONDS: SECONDS, DECKS: DECKS, STANDARD: STANDARD, ROOM_ROUNDS: ROOM_ROUNDS,
    defaults: defaults, sanitize: sanitize, isStandard: isStandard, key: key,
    choicesFor: choicesFor, deal: deal, points: points, score: score, roomSeconds: roomSeconds,
    fields: fields, summary: summary, ROOM: ROOM
  };

  FF.registerGame({
    id: 'blinkRemember',
    name: 'Blink & Remember',
    description: 'Each box opens for a blink to show a picture, then shuts for good. Remember which picture was in which box.',
    category: 'memory',
    icon: '🎁',
    players: [1, 8],
    difficulty: 'Normal',
    duration: 3,
    tags: ['pictures', 'memory', 'quick'],
    modes: ['solo', 'turn'],
    defaultMode: 'solo',
    howToPlay: [
      'Watch the boxes: each one opens in turn, shows a picture for a moment, then shuts for good.',
      'Then tap a box and pick the picture that was inside from the grid.',
      'Fill every box (you can change your mind), then check your answers.',
      'Pick 3 to 12 boxes and how long each picture shows, from 1 to 6 seconds.'
    ],
    room: ROOM,
    start: function (api) {
      if (FF.Parallel && FF.Parallel.active()) { playOnline(api); return; }
      // The daily challenge and a friend's challenge play the standard rules on the shared deal.
      if (api.config.daily || api.config.challenge) { playLocal(api, sanitize(STANDARD)); return; }
      setupScreen(api, function (cfg) {
        if (!isStandard(cfg)) api.config.customRules = true;
        playLocal(api, cfg);
      });
    }
  });
})();
