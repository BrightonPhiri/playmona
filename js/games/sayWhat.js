/* ============================================================
   PLAYMONA — games/sayWhat.js
   Say What?: a well-known saying shows with a word missing
   ("____ wasn't built in a day"); fill the gap. On Hard some
   sayings hide two words. The reveal lights the whole saying up
   with what it means.

   - Rules: js/saywhat/rules.js (FF.SayWhatRules), shared with the referee.
   - Answer: the shared letter tiles (FF.SpellTiles, twice the letters,
     scrambled with decoys), or pick one of 4 words. The letters
     fill the gap in the saying as they are placed.
   - Looks: Speech bubble (the cover's world) or Chalkboard, the
     player's own choice (sayWhat:look), drawn by data-sw-look.
   - Solo and Turns on one device remember which gaps were played
     (sayWhat:seen) so nothing repeats too soon; a saying never shows
     twice in one round. Daily and challenges play the standard
     settings on a shared deal, with no history.
   - Online rooms: the server's referee (js/saywhat/referee.js) deals,
     checks and scores; this phone shows its view (FF.SayWhatClient).
   Classic script, ES5.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.SayWhatRules;
  var SETUP_KEY = 'sayWhat:setup';
  var LOOK_KEY = 'sayWhat:look';
  var SEEN_KEY = 'sayWhat:seen';
  var LOOKS = ['bubble', 'chalk'];
  var AUTO_SCORES_MS = 90000;
  var NUDGE_MS = 8000;

  function G() { return FF.GeoSpinGame; }
  function t(key, fallback, vars) { return FF.t ? FF.t(key, fallback, vars) : String(fallback).replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] != null ? vars[k] : m; }); }
  function store() { return FF.Storage || { get: function (k, d) { return d; }, set: function () {} }; }
  function rand0() { return FF._rand ? FF._rand() : Math.random(); }
  function reduceMotion() {
    try {
      if (document.documentElement.getAttribute('data-reduce') === '1') return true;
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { return false; }
  }
  function animationsOn() { return !reduceMotion() && (!FF.Settings || !FF.Settings.get || FF.Settings.get('animations') !== false); }
  function racingRoom(api) { return !!(api.config.room && FF.Room && FF.Room.current()); }
  function stillShown(api) { return !!(api.shell.root && document.body && document.body.contains(api.shell.root)); }
  function look() { var l = store().get(LOOK_KEY, 'bubble'); return LOOKS.indexOf(l) !== -1 ? l : 'bubble'; }

  function packName(id) {
    var p = (FF.data.sayings.packs || []).filter(function (x) { return x.id === id; })[0];
    return t('swPack_' + id, p ? p.name : id);
  }
  function packsName(packs) {
    if (packs === 'mixed') return t('swMixed', 'Mixed');
    return packs.map(packName).join(' + ');
  }
  function levelName(l) { return l === 'easy' ? t('easy', 'Easy') : l === 'hard' ? t('hard', 'Hard') : t('normal', 'Normal'); }
  function timeName(x) { return x === 'quick' ? t('swQuick', 'Quick') : x === 'relaxed' ? t('swRelaxed', 'Relaxed') : x === 'none' ? t('swNoLimit', 'No limit') : t('normal', 'Normal'); }
  function answerName(a) { return a === 'choice' ? t('swChoices', 'Pick a word') : t('swTiles', 'Letter tiles'); }
  function lookName(l) { return l === 'chalk' ? t('swChalk', 'Chalkboard') : t('swBubble', 'Speech bubble'); }
  function summary(s) { return [packsName(s.packs), levelName(s.level), answerName(s.answer)].join(' · '); }

  /* Small drawings for the pack tiles (currentColor). */
  var GLYPHS = {
    mixed: '<path d="M4 6h10a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3H9l-4 3v-3H4a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3z"/><path d="M19 9h1a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3v2l-3-2h-3"/>',
    everyday: '<path d="M4 5h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-9l-5 4v-4H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><path d="M7 10h10M7 13h6"/>',
    african: '<path d="M12 3c-3 4-6 6-9 7 2 2 3 5 3 8h12c0-3 1-6 3-8-3-1-6-3-9-7z"/><path d="M8 18v3h8v-3M12 9v5"/>',
    bible: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11M12 7v5M9.5 9h5"/>',
    kids: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14a4 4 0 0 0 7 0"/><circle cx="9" cy="10" r=".8"/><circle cx="15" cy="10" r=".8"/>'
  };
  function glyph(name) {
    var s = document.createElementNS ? document.createElementNS('http://www.w3.org/2000/svg', 'svg') : document.createElement('svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('class', 'sw-glyph');
    s.innerHTML = GLYPHS[name] || GLYPHS.mixed;
    return s;
  }

  /* ================= the frame ================= */

  function frame(api, opts) {
    opts = opts || {};
    var root = api.shell.root;
    FF.ui.clear(root);
    if (api.shell.el) api.shell.el.classList.add('sw-shell');
    var sw = FF.ui.div('sw' + (opts.className ? ' ' + opts.className : ''));
    sw.setAttribute('data-sw-look', look());
    var top = FF.ui.div('sw-top');
    var brand = FF.ui.div('sw-brand');
    brand.appendChild(FF.ui.span('sw-brand__say', 'Say'));
    brand.appendChild(FF.ui.span('sw-brand__what', 'What?'));
    top.appendChild(brand);
    var chips = FF.ui.div('sw-chips');
    top.appendChild(chips);
    if (G() && G().soundButtons) top.appendChild(G().soundButtons(api));
    sw.appendChild(top);
    var main = FF.ui.div('sw-main');
    var side = FF.ui.div('sw-side');
    var stage = FF.ui.div('sw-stage');
    var panel = FF.ui.div('sw-panel');
    main.appendChild(side);
    main.appendChild(stage);
    main.appendChild(panel);
    sw.appendChild(main);
    if (look() === 'chalk') sw.appendChild(chalkTray());
    root.appendChild(sw);
    return { root: sw, top: top, chips: chips, side: side, stage: stage, panel: panel };
  }

  /* The chalkboard's ledge: a stick of chalk and a duster. */
  function chalkTray() {
    var tray = FF.ui.div('sw-tray');
    tray.setAttribute('aria-hidden', 'true');
    tray.appendChild(FF.ui.span('sw-tray__chalk'));
    tray.appendChild(FF.ui.span('sw-tray__chalk sw-tray__chalk--y'));
    tray.appendChild(FF.ui.span('sw-tray__duster'));
    return tray;
  }

  function chip(text, cls) { return FF.ui.span('sw-chip' + (cls ? ' ' + cls : ''), text); }

  /* The countdown ring: seconds in the middle, a draining arc. */
  function timerRing() {
    var el = FF.ui.div('sw-ring is-idle');
    el.setAttribute('aria-hidden', 'true');
    var num = FF.ui.span('sw-ring__num', '');
    el.appendChild(num);
    return {
      el: el,
      set: function (rem, total) {
        el.classList.remove('is-idle');
        var p = total ? Math.max(0, Math.min(1, rem / total)) : 0;
        el.style.setProperty('--p', String(p));
        num.textContent = String(Math.max(0, Math.ceil(rem)));
        el.classList.toggle('is-low', rem <= 5);
      },
      idle: function () { el.classList.add('is-idle'); num.textContent = ''; el.style.setProperty('--p', '1'); }
    };
  }

  /* ================= the saying ================= */

  /* The saying as pills (or chalk words) with the gap(s) as slots that
     fill as tiles are placed. round: R.roundAt's words, gaps, cells. */
  function sayingCard(round) {
    var el = FF.ui.div('sw-card');
    var text = FF.ui.el('p', { class: 'sw-saying', 'aria-live': 'polite' });
    el.appendChild(text);
    var gaps = [];
    // Letter cells per gap word, from the board's own layout (so marks line up).
    var groups = [[]];
    (round.cells || []).forEach(function (c) { if (c.gap) groups.push([]); else groups[groups.length - 1].push(c); });
    (round.words || []).forEach(function (w) {
      if (typeof w === 'string') {
        w.split(/(\s+)/).forEach(function (bit) {
          if (!bit) return;
          if (/^\s+$/.test(bit)) { text.appendChild(document.createTextNode(' ')); return; }
          // Punctuation right after a gap (", and") sits on the gap, not in a pill of its own.
          var lead = /^[,;:.!?]+/.exec(bit);
          if (lead) { text.appendChild(FF.ui.span('sw-punct', lead[0])); bit = bit.slice(lead[0].length); if (!bit) return; }
          text.appendChild(FF.ui.span('sw-word', bit));
        });
        return;
      }
      var g = FF.ui.span('sw-gap');
      g.setAttribute('aria-label', t('swGap', 'missing word, {n} letters', { n: w.len }));
      var cells = groups[w.gap] || [];
      if (!cells.length) for (var i = 0; i < w.len; i++) cells.push({ letter: true });
      var letters = [];
      cells.forEach(function (c) {
        if (c.fixed) { g.appendChild(FF.ui.span('sw-gap__m', c.ch)); return; }
        var l = FF.ui.span('sw-gap__l', '');
        g.appendChild(l);
        letters.push(l);
      });
      gaps[w.gap] = { el: g, letters: letters };
      text.appendChild(g);
    });
    function active(i) { gaps.forEach(function (g, j) { if (g) g.el.classList.toggle('is-active', j === i); }); }
    active(0);
    var meaning = FF.ui.el('p', { class: 'sw-meaning' });
    el.appendChild(meaning);
    return {
      el: el,
      /* chars: the board's slot letters in order (null when empty). */
      fill: function (chars) {
        var at = 0, first = -1;
        gaps.forEach(function (g, j) {
          if (!g) return;
          g.letters.forEach(function (l) {
            var ch = chars[at++] || '';
            l.textContent = ch;
            l.classList.toggle('is-on', !!ch);
            if (!ch && first === -1) first = j;
          });
        });
        active(first);
      },
      /* Show the right word(s); ok paints them gold (or yellow chalk), wrong shows the guess struck through. */
      reveal: function (ok, guess, mean, packLabel) {
        active(-1);
        var guessWords = guess ? String(guess).trim().split(/\s+/) : [];
        round.gaps.forEach(function (word, j) {
          var g = gaps[j];
          if (!g) return;
          FF.ui.clear(g.el);
          g.el.classList.add('is-done', ok ? 'is-right' : 'is-wrong');
          if (!ok && guessWords.length === round.gaps.length && guessWords[j] && !R.same(guessWords[j], word)) {
            g.el.appendChild(FF.ui.el('s', { class: 'sw-gap__guess' }, guessWords[j].toLowerCase()));
          }
          g.el.appendChild(FF.ui.span('sw-gap__word', word));
        });
        el.classList.add('is-revealed', ok ? 'is-good' : 'is-bad');
        FF.ui.clear(meaning);
        if (mean) meaning.appendChild(FF.ui.span('sw-meaning__text', mean));
        if (packLabel) meaning.appendChild(FF.ui.span('sw-meaning__pack', packLabel));
      }
    };
  }

  /* Four words (or word pairs) to pick from. */
  function choiceBoard(api, round, onPick) {
    var el = FF.ui.el('div', { class: 'sw-choices is-waiting', role: 'group', 'aria-label': t('swPickWord', 'Pick the missing word') });
    var open = false, locked = false;
    var btns = (round.choices || []).map(function (c, i) {
      var b = FF.ui.el('button', { type: 'button', class: 'sw-choice' });
      b.appendChild(FF.ui.span('sw-choice__n', String(i + 1)));
      b.appendChild(FF.ui.span('sw-choice__text', c.split(' ').join(' · ')));
      b.addEventListener('click', function () { pick(c, b); });
      el.appendChild(b);
      return { el: b, text: c };
    });
    function pick(c, b) {
      if (!open || locked) return;
      locked = true;
      b.classList.add('is-picked');
      api.audio.play('tap');
      onPick(c);
    }
    function onKey(e) {
      if (locked || !document.body.contains(el)) { document.removeEventListener('keydown', onKey, true); return; }
      if (!open || e.ctrlKey || e.metaKey || e.altKey) return;
      var n = parseInt(e.key, 10);
      if (n >= 1 && n <= btns.length) { e.preventDefault(); e.stopPropagation(); pick(btns[n - 1].text, btns[n - 1].el); }
    }
    document.addEventListener('keydown', onKey, true);
    return {
      el: el,
      open: function () { open = true; el.classList.remove('is-waiting'); },
      finish: function (ok, target) {
        locked = true;
        document.removeEventListener('keydown', onKey, true);
        btns.forEach(function (x) {
          x.el.disabled = true;
          if (x.text === target) x.el.classList.add('is-right');
          else if (x.el.classList.contains('is-picked')) x.el.classList.add('is-wrong');
        });
      },
      destroy: function () { locked = true; document.removeEventListener('keydown', onKey, true); }
    };
  }

  function tilesBoard(api, round, card, onSubmit) {
    var b = FF.SpellTiles.board(round, { audio: api.audio, onSubmit: onSubmit, onChange: function (chars) { card.fill(chars); } });
    b.el.classList.add('sw-spell');
    return { el: b.el, open: b.open, finish: function (ok) { b.finish(ok); }, destroy: function () { b.finish(false); } };
  }

  /* The points line under the saying at the reveal. */
  function revealBar(info) {
    var bar = FF.ui.div('sw-reveal sw-reveal--' + info.state);
    var stamp = FF.ui.span('sw-stamp', info.stampText || (info.state === 'good' ? t('gsCorrect', 'Correct!') : info.state === 'late' ? t('gsTimesUp', 'Time’s up!') : t('gsIncorrect', 'Incorrect')));
    bar.appendChild(stamp);
    var pts = FF.ui.span('sw-reveal__pts');
    pts.appendChild(FF.ui.span('', '+'));
    var num = FF.ui.span('sw-reveal__num', '0');
    pts.appendChild(num);
    pts.appendChild(FF.ui.span('sw-reveal__unit', t('gsPts', 'pts')));
    bar.appendChild(pts);
    var br = info.breakdown;
    if (br && info.points > 0) {
      var bits = [t('swBase', '{n} for the saying', { n: br.base })];
      if (br.speed) bits.push(t('gsSpeed', '+{n} speed', { n: br.speed }));
      if (br.two) bits.push(t('swTwoBonus', '+{n} two words', { n: br.two }));
      if (br.streak) bits.push(t('swStreakBonus', '+{n} streak', { n: br.streak }));
      bar.appendChild(FF.ui.el('p', { class: 'sw-reveal__break' }, bits.join(' · ')));
    }
    if (info.said) bar.appendChild(FF.ui.el('p', { class: 'sw-reveal__said' }, info.said));
    setTimeout(function () { if (G() && G().countUp) G().countUp(num, 0, info.points || 0, 700); else num.textContent = String(info.points || 0); }, 250);
    return bar;
  }

  /* The flame that grows with the streak. */
  function flame(n) {
    var el = FF.ui.span('sw-flame' + (n >= 8 ? ' is-blaze' : n >= 5 ? ' is-hot' : n >= 3 ? ' is-warm' : ''));
    el.appendChild(FF.Icons.icon('fire'));
    el.appendChild(FF.ui.span('sw-flame__n', String(n)));
    el.setAttribute('aria-label', t('swStreakN', 'Streak {n}', { n: n }));
    return el;
  }

  /* ================= setup ================= */

  function setupScreen(api, players, onGo) {
    api.shell.hideTimer();
    if (FF.GameLength && FF.GameLength.pause) FF.GameLength.pause();
    var saved = R.sanitize(store().get(SETUP_KEY, null) || R.STANDARD);
    var on = {};
    if (saved.packs !== 'mixed') saved.packs.forEach(function (p) { on[p] = true; });
    var level = saved.level, answer = saved.answer, time = saved.time, rounds = saved.rounds;
    var f = frame(api, { className: 'sw--setup' });

    var teaser = sayingCard({ words: ['', { gap: 0, len: 4 }, ' wasn’t built in a day'], gaps: ['Rome'], cells: [] });
    teaser.el.classList.add('is-teaser');
    teaser.fill(['R', 'O', null, null]);
    f.stage.appendChild(teaser.el);
    f.side.appendChild(FF.ui.el('p', { class: 'sw-tagline' }, [
      FF.ui.span('', t('swTag1', 'A saying. ')), FF.ui.span('', t('swTag2', 'A missing word. ')), FF.ui.span('sw-gold', t('swTag3', 'Can you fill it?'))
    ]));
    var how = FF.ui.el('ul', { class: 'sw-how' });
    [t('swHow1', 'A well-known saying shows with a word missing.'),
      t('swHow2', 'Spell it with the letter tiles, or pick it.'),
      t('swHow3', 'Fast answers and streaks score more. Learn what it means.')].forEach(function (x, i) {
      var li = FF.ui.el('li', {});
      li.appendChild(FF.ui.span('sw-how__n', String(i + 1)));
      li.appendChild(FF.ui.span('', x));
      how.appendChild(li);
    });
    f.side.appendChild(how);

    var p = f.panel;
    var box = FF.ui.div('sw-setup');
    p.appendChild(box);
    function heading(text) { box.appendChild(FF.ui.el('h2', { class: 'sw-h' }, text)); }
    function group(cls, label) { var g = FF.ui.el('div', { class: 'sw-seg ' + cls, role: 'group', 'aria-label': label }); box.appendChild(g); return g; }
    function seg(wrap, label, meta, fn) {
      var b = FF.ui.el('button', { type: 'button', class: 'sw-opt' });
      b.appendChild(FF.ui.span('sw-opt__name', label));
      var m = FF.ui.span('sw-opt__meta', meta || '');
      b.appendChild(m);
      b.addEventListener('click', function () { if (b.disabled) return; api.audio.play('tap'); fn(); sync(); });
      wrap.appendChild(b);
      return { el: b, meta: m };
    }

    heading(t('swPacks', 'Sayings'));
    var packWrap = group('sw-packs', t('swPacks', 'Sayings'));
    function packTile(id, fn) {
      var b = FF.ui.el('button', { type: 'button', class: 'sw-pack sw-pack--' + id });
      b.appendChild(glyph(id));
      b.appendChild(FF.ui.span('sw-pack__name', id === 'mixed' ? t('swMixed', 'Mixed') : packName(id)));
      var n = id === 'mixed' ? FF.data.sayings.rows.length : FF.data.sayings.rows.filter(function (r) { return r.pack === id; }).length;
      b.appendChild(FF.ui.span('sw-pack__n', String(n)));
      b.addEventListener('click', function () { api.audio.play('tap'); fn(); sync(); });
      packWrap.appendChild(b);
      return b;
    }
    var mixedBtn = packTile('mixed', function () { on = {}; });
    var packBtns = R.PACKS.map(function (id) {
      return { id: id, el: packTile(id, function () {
        on[id] = !on[id];
        if (R.PACKS.every(function (x) { return on[x]; })) on = {};
      }) };
    });

    heading(t('gsChooseLevel', 'Choose your level'));
    var levelWrap = group('sw-levels', t('gcLevel', 'Level'));
    var levelBtns = R.LEVELS.map(function (l) { var x = seg(levelWrap, levelName(l), '', function () { level = l; }); x.id = l; return x; });
    var levelNote = FF.ui.el('p', { class: 'sw-note' });
    box.appendChild(levelNote);

    heading(t('gsAnswerStyle', 'How do you answer?'));
    var ansWrap = group('sw-answers', t('gsAnswerStyle', 'How do you answer?'));
    var ansBtns = R.ANSWERS.map(function (a) {
      var x = seg(ansWrap, answerName(a), a === 'choice' ? t('swChoicesMeta', '4 words to pick from') : t('swTilesMeta', 'Spell it from mixed-up letters'), function () { answer = a; });
      x.id = a;
      return x;
    });

    heading(t('swTimeEach', 'Time for each saying'));
    var timeWrap = group('sw-times', t('swTimeEach', 'Time for each saying'));
    var timeBtns = R.TIMES.map(function (x) { var b = seg(timeWrap, timeName(x), '', function () { time = x; }); b.id = x; return b; });

    heading(t('swHowMany', 'Sayings per round'));
    var roundWrap = group('sw-rounds', t('swHowMany', 'Sayings per round'));
    var roundBtns = R.ROUNDS.map(function (n) { var b = seg(roundWrap, String(n), '', function () { rounds = n; }); b.id = n; return b; });

    heading(t('swLook', 'Look'));
    var lookWrap = group('sw-looks', t('swLook', 'Look'));
    var lookBtns = LOOKS.map(function (l) {
      var b = seg(lookWrap, lookName(l), '', function () {
        try { store().set(LOOK_KEY, l); } catch (e) { /* storage full */ }
        f.root.setAttribute('data-sw-look', l);
        var tray = f.root.querySelector ? f.root.querySelector('.sw-tray') : null;
        if (l === 'chalk' && !tray) f.root.appendChild(chalkTray());
        if (l !== 'chalk' && tray && tray.parentNode) tray.parentNode.removeChild(tray);
      });
      b.id = l;
      b.el.classList.add('sw-look--' + l);
      return b;
    });

    var foot = FF.ui.div('sw-setup__foot');
    var info = FF.ui.el('p', { class: 'sw-note', 'aria-live': 'polite' });
    foot.appendChild(info);
    var go = FF.ui.el('button', { type: 'button', class: 'sw-btn sw-btn--go sw-btn--big' });
    go.appendChild(FF.Icons.icon('play'));
    go.appendChild(FF.ui.span('', t('swGo', 'Start')));
    go.addEventListener('click', function () {
      var cfg = current();
      try { store().set(SETUP_KEY, cfg); } catch (e) { /* storage full */ }
      api.audio.play('roundStart');
      if (FF.GameLength && FF.GameLength.resume) FF.GameLength.resume();
      onGo(cfg);
    });
    foot.appendChild(go);
    box.appendChild(foot);

    function chosenPacks() { var l = R.PACKS.filter(function (x) { return on[x]; }); return l.length ? l : 'mixed'; }
    function current() { return R.sanitize({ level: level, packs: chosenPacks(), answer: answer, time: time, rounds: rounds }); }
    function pressed(el, yes) { el.classList.toggle('is-on', yes); el.setAttribute('aria-pressed', yes ? 'true' : 'false'); }
    function sync() {
      var packs = chosenPacks();
      pressed(mixedBtn, packs === 'mixed');
      packBtns.forEach(function (x) { pressed(x.el, !!on[x.id]); });
      var counts = R.levelCounts(packs);
      // A level with no sayings in these packs can't be picked; move to the nearest that has some.
      if (!counts[level]) {
        var order = level === 'easy' ? ['normal', 'hard'] : level === 'hard' ? ['normal', 'easy'] : ['easy', 'hard'];
        level = order.filter(function (l) { return counts[l]; })[0] || 'normal';
      }
      levelBtns.forEach(function (x) {
        pressed(x.el, x.id === level);
        x.el.disabled = !counts[x.id];
        x.meta.textContent = t('swNSayings', '{n} sayings', { n: counts[x.id] });
      });
      levelNote.textContent = level === 'hard' ? t('swHardNote', 'Some sayings hide two words.') : level === 'easy' ? t('swEasyNote', 'The best-known sayings.') : t('swNormalNote', 'Well-known sayings for everyone.');
      ansBtns.forEach(function (x) { pressed(x.el, x.id === answer); });
      timeBtns.forEach(function (x) {
        pressed(x.el, x.id === time);
        var secs = R.secondsFor({ answer: answer, time: x.id }, { gaps: ['x'] });
        x.meta.textContent = secs ? secs + ' s' : '∞';
      });
      roundBtns.forEach(function (x) { pressed(x.el, x.id === rounds); });
      lookBtns.forEach(function (x) { pressed(x.el, x.id === look()); });
      var cfg = current();
      var total = R.rows(cfg).length;
      var want = rounds * Math.max(1, players);
      var bits = [];
      if (want > total) bits.push(t('swCapped', '{p} has {n} sayings, so this round has {n}', { p: packsName(cfg.packs), n: total }));
      else bits.push(t('swNReady', '{n} sayings ready', { n: total }));
      var ranked = FF.Leaderboards && FF.Leaderboards.active && FF.Leaderboards.active(api.def);
      if (ranked && !R.isStandard(cfg)) bits.push(t('nrUnranked', 'Leaderboards use the standard settings'));
      info.textContent = bits.join(' · ');
    }
    sync();
    if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(box);
  }

  /* ================= solo and turns ================= */

  function scorerList(config) {
    if (config.scorers && config.scorers.length) return config.scorers;
    return config.players && config.players.length ? config.players : [{ id: 'p1', name: t('playerLabel', 'Player') }];
  }
  function playModeOf(config) { return scorerList(config).length > 1 && config.mode === 'turn' ? 'turn' : 'solo'; }

  function seenGet() { var s = store().get(SEEN_KEY, null); return s && typeof s === 'object' ? s : {}; }
  function seenSave(s) { try { store().set(SEEN_KEY, s); } catch (e) { /* storage full */ } }

  /* What the player gave, when it was wrong. */
  function saidLine(text, round, picked) {
    if (!text) return '';
    var shown = String(text).trim().toLowerCase();
    if (picked) return t('swYouPicked', 'You picked “{x}”.', { x: shown });
    return t('swYouGave', 'You spelt “{x}”.', { x: shown });
  }

  function play(api, cfg, seed, playMode) {
    cfg = R.sanitize(cfg);
    var config = api.config;
    var scorers = scorerList(config);
    var turns = playMode === 'turn' && scorers.length > 1;
    if (!turns) scorers = scorers.slice(0, 1);
    var n = scorers.length;
    var shared = !!config.sharedDeal || !!config.daily || !!config.challenge;
    var seen = shared ? null : seenGet();
    var dealt = R.deal(cfg, seed, cfg.rounds * n, seen || undefined);
    if (!shared) seenSave(R.markSeen(dealt.reset ? {} : seen, dealt.items));
    var list = dealt.items;
    var rounds = list.length;
    var turn = FF.SayWhatTurns.create(scorers.map(function (e) { return e.id; }));
    var f = frame(api, { className: 'sw--play' });
    var round = -1;
    var stats = {};
    scorers.forEach(function (e) { stats[e.id] = { right: 0, played: 0, fastest: null }; });
    var missed = [], played = [];
    var totals = { right: 0, played: 0 };
    var passed = {};

    var scoreBox = FF.ui.div('sw-card-s sw-score');
    f.side.appendChild(scoreBox);
    var roundChip = chip('', 'sw-chip--round');
    f.chips.appendChild(roundChip);
    f.chips.appendChild(chip(levelName(cfg.level), 'sw-chip--lv sw-lv-' + cfg.level));
    var flameHost = FF.ui.span('sw-flamehost');
    f.chips.appendChild(flameHost);
    var ring = timerRing();
    f.stage.appendChild(ring.el);
    var cardHost = FF.ui.div('sw-cardhost');
    f.stage.appendChild(cardHost);
    f.side.appendChild(chip(packsName(cfg.packs), 'sw-chip--pack'));

    function drawScores(activeId, bump) {
      FF.ui.clear(scoreBox);
      scoreBox.appendChild(FF.ui.el('p', { class: 'sw-card-s__title' }, n > 1 ? t('swTakingTurns', 'Taking turns') : t('gsYourScore', 'Your score')));
      var rows = FF.ui.el('ol', { class: 'sw-board' });
      scorers.slice().sort(function (a, b) { return (api.scoring.get(b.id) || 0) - (api.scoring.get(a.id) || 0); }).forEach(function (e, i) {
        var li = FF.ui.el('li', { class: 'sw-row' + (e.id === activeId && n > 1 ? ' is-active' : '') });
        li.appendChild(FF.ui.span('sw-row__place', String(i + 1)));
        var ava = FF.ui.span('sw-row__ava');
        if (FF.Players && FF.Players.avatarEl) ava.appendChild(FF.Players.avatarEl(e, ''));
        li.appendChild(ava);
        li.appendChild(FF.ui.span('sw-row__name', e.name || t('playerLabel', 'Player')));
        var pts = FF.ui.span('sw-row__pts', FF.util.formatNumber(api.scoring.get(e.id) || 0));
        li.appendChild(pts);
        if (bump && bump.id === e.id && G() && G().countUp) G().countUp(pts, bump.from, bump.to, 800);
        rows.appendChild(li);
      });
      scoreBox.appendChild(rows);
      FF.ui.clear(flameHost);
      flameHost.appendChild(flame(turn.streak[activeId] || 0));
    }

    function next() {
      round++;
      if (round >= rounds) { recap(); return; }
      render();
    }

    /* Turns: hand the device over before each saying. */
    function passCard(entity, go) {
      ring.idle();
      FF.ui.clear(cardHost);
      FF.ui.clear(f.panel);
      var card = FF.ui.div('sw-pass');
      var ava = FF.ui.span('sw-pass__ava');
      if (FF.Players && FF.Players.avatarEl) ava.appendChild(FF.Players.avatarEl(entity, ''));
      card.appendChild(ava);
      card.appendChild(FF.ui.el('h2', { class: 'sw-h sw-h--xl' }, t('swPassTo', 'Pass to {name}', { name: entity.name || t('playerLabel', 'Player') })));
      card.appendChild(FF.ui.el('p', { class: 'sw-note' }, t('swPassNote', 'No peeking, everyone else!')));
      var b = FF.ui.el('button', { type: 'button', class: 'sw-btn sw-btn--go sw-btn--big' });
      b.appendChild(FF.Icons.icon('play'));
      b.appendChild(FF.ui.span('', t('swReady', 'I’m ready')));
      b.addEventListener('click', function () { api.audio.play('click'); go(); });
      card.appendChild(b);
      f.panel.appendChild(card);
      if (FF.Nav && FF.Nav.focus) FF.Nav.focus(b);
    }

    function render() {
      var k = round;
      var entity = turns ? scorers[turn.cur] : scorers[0];
      api.shell.hideTimer();
      api.shell.updateScores(n > 1 ? entity.id : undefined);
      roundChip.textContent = (n > 1 ? (entity.name || '') + ' · ' : '') + t('swRoundOf', 'Saying {r} of {n}', { r: k + 1, n: rounds });
      drawScores(entity.id);
      if (turns && !passed[k]) { passCard(entity, function () { passed[k] = true; render(); }); return; }
      var info = R.roundAt(cfg, seed, k, list[k]);
      ring.idle();
      FF.ui.clear(cardHost);
      FF.ui.clear(f.panel);
      f.root.classList.remove('is-revealed');
      var card = sayingCard(info);
      cardHost.appendChild(card.el);
      var done = false, started = 0;
      var board = cfg.answer === 'choice'
        ? choiceBoard(api, info, function (c) { answer(c, false); })
        : tilesBoard(api, info, card, function (text) { answer(text, false); });
      f.panel.appendChild(board.el);
      var after = FF.ui.div('sw-after');
      f.panel.appendChild(after);
      api.audio.play('land');
      started = Date.now();
      board.open();
      if (info.seconds) {
        api.shell.setOnTick(function (rem) { ring.set(rem, info.seconds); });
        api.shell.setTimer(info.seconds, function () { answer('', true); });
        ring.set(info.seconds, info.seconds);
      }
      if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(board.el);

      function answer(text, timeout) {
        if (done) return;
        done = true;
        var ms = started ? Date.now() - started : (info.seconds || 0) * 1000;
        api.shell.setOnTick(null);
        api.shell.hideTimer();
        if (timeout && info.seconds) ring.set(0, info.seconds);
        var res = timeout || !text ? { ok: false } : R.check(info, text);
        var st = stats[entity.id];
        st.played++; totals.played++;
        var streakNow = res.ok ? (turn.streak[entity.id] || 0) + 1 : 0;
        var pts = R.points({ level: info.level, ok: res.ok, ms: ms, secs: info.seconds, two: info.two, streak: streakNow });
        var before = api.scoring.get(entity.id) || 0;
        turn = FF.SayWhatTurns.award(turn, entity.id, pts.total, res.ok);
        played.push({ round: info, ok: res.ok });
        if (res.ok) {
          st.right++; totals.right++;
          if (st.fastest == null || ms < st.fastest) st.fastest = ms;
          api.scoring.add(entity.id, pts.total, { correct: true, fastest: ms / 1000 });
          api.audio.play(streakNow >= 3 ? 'streak' : 'correct');
          if (animationsOn() && FF.Confetti) FF.Confetti.burst(streakNow >= 3 ? 70 : 40);
        } else {
          api.scoring.add(entity.id, 0, { wrong: true });
          if (api.scoring.resetStreak) api.scoring.resetStreak(entity.id);
          api.audio.play('wrong');
          missed.push(info);
        }
        board.finish(res.ok, info.target);
        card.reveal(res.ok, timeout ? '' : text, info.meaning, packName(info.pack));
        f.root.classList.add('is-revealed');
        drawScores(entity.id, { id: entity.id, from: before, to: api.scoring.get(entity.id) || 0 });
        after.appendChild(revealBar({
          state: res.ok ? 'good' : timeout ? 'late' : 'bad', points: pts.total, breakdown: pts,
          said: res.ok ? '' : saidLine(timeout ? '' : text, info, cfg.answer === 'choice')
        }));
        if (turns) turn = FF.SayWhatTurns.next(turn);
        var last = round + 1 >= rounds;
        var nextBtn = FF.Advance.button(last ? t('seeResults', 'See results') : t('swNext', 'Next saying'), function () {
          api.audio.play('click');
          board.destroy();
          next();
        }, { class: 'sw-btn sw-btn--go sw-next' });
        after.appendChild(nextBtn);
        if (after.scrollIntoView && window.innerWidth < 900) { try { after.scrollIntoView({ behavior: animationsOn() ? 'smooth' : 'auto', block: 'nearest' }); } catch (e) { /* old browser */ } }
        if (FF.Nav && FF.Nav.focus) setTimeout(function () { if (document.body.contains(nextBtn)) FF.Nav.focus(nextBtn); }, 400);
      }
    }

    function recap() {
      api.shell.hideTimer();
      api.shell.setOnTick(null);
      FF.ui.clear(cardHost);
      FF.ui.clear(f.panel);
      FF.ui.clear(f.chips);
      ring.el.style.display = 'none';
      f.root.classList.add('is-recap');
      var box = FF.ui.div('sw-recap');
      var pct = totals.played ? Math.round(totals.right / totals.played * 100) : 0;
      var ringEl = FF.ui.div('sw-recap__ring');
      ringEl.style.setProperty('--p', String(pct));
      ringEl.appendChild(FF.ui.span('', pct + '%'));
      box.appendChild(ringEl);
      box.appendChild(FF.ui.el('h2', { class: 'sw-h sw-h--xl' }, t('swRecapTitle', '{c} of {a} sayings filled', { c: totals.right, a: totals.played })));
      box.appendChild(FF.ui.el('p', { class: 'sw-note' }, summary(cfg)));
      var people = FF.ui.el('ol', { class: 'sw-board sw-board--big' });
      scorers.slice().sort(function (a, b) { return (api.scoring.get(b.id) || 0) - (api.scoring.get(a.id) || 0); }).forEach(function (e, i) {
        var s = stats[e.id];
        var li = FF.ui.el('li', { class: 'sw-row' + (i === 0 ? ' is-top' : '') });
        li.appendChild(FF.ui.span('sw-row__place', String(i + 1)));
        var ava = FF.ui.span('sw-row__ava');
        if (FF.Players && FF.Players.avatarEl) ava.appendChild(FF.Players.avatarEl(e, ''));
        li.appendChild(ava);
        var who = FF.ui.span('sw-row__name');
        who.appendChild(FF.ui.span('', e.name || t('playerLabel', 'Player')));
        var bits = [t('qmRightOf', '{c}/{a} right', { c: s.right, a: s.played })];
        if ((turn.best[e.id] || 0) > 1) bits.push(t('qmBestStreak', 'best streak {n}', { n: turn.best[e.id] }));
        who.appendChild(FF.ui.span('sw-row__meta', bits.join(' · ')));
        li.appendChild(who);
        li.appendChild(FF.ui.span('sw-row__pts', FF.util.formatNumber(api.scoring.get(e.id) || 0)));
        people.appendChild(li);
      });
      box.appendChild(people);
      // Every saying of the round, the missed ones first, with what it means.
      var order = played.filter(function (p) { return !p.ok; }).concat(played.filter(function (p) { return p.ok; }));
      if (order.length) {
        box.appendChild(FF.ui.el('h3', { class: 'sw-h' }, t('swRemember', 'Sayings to remember')));
        var learn = FF.ui.el('ul', { class: 'sw-learn' });
        order.forEach(function (p) {
          var li = FF.ui.el('li', { class: p.ok ? 'is-ok' : 'is-miss' });
          li.appendChild(FF.ui.el('p', { class: 'sw-learn__text' }, p.round.text));
          li.appendChild(FF.ui.el('p', { class: 'sw-learn__mean' }, p.round.meaning));
          learn.appendChild(li);
        });
        box.appendChild(learn);
      }
      var go = FF.ui.el('button', { type: 'button', class: 'sw-btn sw-btn--go sw-btn--big' });
      go.appendChild(FF.Icons.icon('trophy'));
      go.appendChild(FF.ui.span('', t('seeResults', 'See results')));
      go.addEventListener('click', end);
      box.appendChild(go);
      f.panel.appendChild(box);
      api.audio.play('winner');
      if (pct >= 80 && animationsOn() && FF.Confetti) FF.Confetti.burst(90);
      if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(box);
    }

    function end() {
      var res = api.scoring.results ? api.scoring.results() : null;
      var best = 0, fastest = null;
      Object.keys(stats).forEach(function (id) {
        best = Math.max(best, turn.best[id] || 0);
        if (stats[id].fastest != null && (fastest == null || stats[id].fastest < fastest)) fastest = stats[id].fastest / 1000;
      });
      api.end({ results: (res && res.results) || [], winnerId: res ? res.winnerId : null, bestStreak: best, fastest: fastest, quizCorrect: totals.right, quizAnswered: totals.played });
    }

    next();
  }

  /* ================= online Race ================= */

  /* Slots from the referee's masked letters ('_' a letter, ' ' between gap words, marks as they are). */
  function maskedCells(masked) {
    var cells = [];
    String(masked || '').split('').forEach(function (ch) {
      if (ch === '_') cells.push({ ch: '', letter: true });
      else if (ch === ' ') cells.push({ ch: ' ', gap: true });
      else cells.push({ ch: ch, fixed: true });
    });
    return cells;
  }

  /* Everyone gets the same saying at once; the server's referee (js/saywhat/referee.js) checks,
     times and scores every answer. Each phone keeps its own look. */
  function online(api, room) {
    var f = frame(api, { className: 'sw--play sw--online' });
    api.shell.hideTimer();
    if (FF.Race && FF.Race.begin) FF.Race.begin(api.def.id, { rounds: 1, mode: 'parallel' });
    var client = FF.SayWhatClient.create({ room: room, onChange: schedule });
    var ended = false, pending = null, nudged = {}, autoScores = null;
    var shownRound = null, board = null, card = null, cardRound = null, sentText = null, revealShown = null, finishedShown = false, opened = null;
    var lastScores = {};
    var ring = timerRing();
    f.stage.appendChild(ring.el);
    var cardHost = FF.ui.div('sw-cardhost');
    f.stage.appendChild(cardHost);
    var roundChip = chip('', 'sw-chip--round');
    f.chips.appendChild(roundChip);
    var levelHolder = FF.ui.span('');
    f.chips.appendChild(levelHolder);
    var flameHost = FF.ui.span('sw-flamehost');
    f.chips.appendChild(flameHost);
    var boardBox = FF.ui.div('sw-card-s sw-score');
    f.side.appendChild(boardBox);
    var ticker = setInterval(tick, 200);

    function expected() { return room.meta && room.meta.swMatch; }
    function who(uid) {
      var p = (room.players || {})[uid] || {};
      return { id: uid, uid: uid, name: p.name || t('playerLabel', 'Player'), avatar: p.avatar || null, color: p.color || null };
    }
    function schedule() { if (!pending) pending = setTimeout(function () { pending = null; render(); }, 0); }
    function cleanup() {
      if (ended) return;
      ended = true;
      clearInterval(ticker);
      if (pending) clearTimeout(pending);
      if (autoScores) clearTimeout(autoScores);
      if (board) board.destroy();
      client.stop();
      if (FF.Race && FF.Race.end) { try { FF.Race.end(); } catch (e) { /* not running */ } }
    }
    function finish() { if (ended) return; cleanup(); api.end({}); }
    function maybeNudge(key, due) {
      if (nudged[key] || !due) return;
      if (client.serverNow() - due < NUDGE_MS) return;
      nudged[key] = true;
      FF.SayWhatApi.nudge(room.code);
    }

    /* The race board: points, who has answered (a tick, never what), and the round's results at the reveal. */
    function drawLeader(sw) {
      FF.ui.clear(boardBox);
      boardBox.appendChild(FF.ui.el('p', { class: 'sw-card-s__title' }, t('swRace', 'Saying race')));
      var rows = FF.ui.el('ol', { class: 'sw-board' });
      var reveal = sw.phase === 'reveal' && sw.last && sw.last.k === sw.k;
      var order = (sw.order || []).slice().sort(function (a, b) { return ((sw.p[b] || {}).score || 0) - ((sw.p[a] || {}).score || 0); });
      order.forEach(function (uid, i) {
        var row = sw.p[uid] || {};
        var li = FF.ui.el('li', { class: 'sw-row' + (uid === client.uid ? ' is-me' : '') });
        li.appendChild(FF.ui.span('sw-row__place', String(i + 1)));
        var ava = FF.ui.span('sw-row__ava');
        if (FF.Players && FF.Players.avatarEl) ava.appendChild(FF.Players.avatarEl(who(uid), ''));
        li.appendChild(ava);
        li.appendChild(FF.ui.span('sw-row__name', who(uid).name + (uid === client.uid ? ' ' + t('youTag', '(you)') : '')));
        var pts = FF.ui.span('sw-row__pts', FF.util.formatNumber(row.score || 0));
        li.appendChild(pts);
        if ((sw.phase === 'open' || sw.phase === 'ready') && row.inK === sw.k) {
          var tickEl = FF.ui.span('sw-row__in', '✓');
          tickEl.setAttribute('aria-label', t('swAnswered', 'answered'));
          li.appendChild(tickEl);
        }
        if (reveal) {
          var res = sw.last.results[uid] || {};
          li.classList.add(res.ok ? 'is-good' : 'is-bad');
          var before = lastScores[uid] != null ? lastScores[uid] : (row.score || 0) - (res.points || 0);
          if (before !== (row.score || 0) && G() && G().countUp) G().countUp(pts, before, row.score || 0, 900);
        }
        lastScores[uid] = row.score || 0;
        rows.appendChild(li);
      });
      boardBox.appendChild(rows);
      FF.ui.clear(flameHost);
      var me = sw.p[client.uid];
      if (me) flameHost.appendChild(flame(me.streak || 0));
    }

    function waiting(title, sub) {
      FF.ui.clear(cardHost);
      FF.ui.clear(f.panel);
      var w = FF.ui.div('sw-wait');
      w.appendChild(FF.ui.div('sw-wait__spin'));
      w.appendChild(FF.ui.el('h2', { class: 'sw-h' }, title));
      if (sub) w.appendChild(FF.ui.el('p', { class: 'sw-note' }, sub));
      f.panel.appendChild(w);
    }

    function tick() {
      if (ended) return;
      var sw = client.view().sw;
      if (!sw || sw.matchId !== expected()) return;
      var now = client.serverNow();
      if (sw.phase === 'open' && sw.round) ring.set((sw.closeAt - now) / 1000, sw.round.seconds || 1);
      var due = sw.phase === 'starting' ? sw.readyAt : sw.phase === 'ready' ? sw.openAt : sw.phase === 'open' ? sw.closeAt : sw.phase === 'reveal' ? sw.nextAt : 0;
      if (due) maybeNudge(sw.phase + sw.k, due);
    }

    function render() {
      if (ended) return;
      if (!f.root.isConnected) { cleanup(); return; }
      var v = client.view();
      var sw = v.sw;
      if (!sw || (expected() && sw.matchId !== expected()) || !FF.SayWhatClient.ready(sw)) {
        if (!sw || sw.matchId !== expected()) waiting(t('swGettingReady', 'Choosing the sayings…'), t('swGettingReadySub', 'Everyone gets the same saying at the same moment.'));
        return;
      }
      FF.ui.clear(levelHolder);
      levelHolder.appendChild(chip(levelName(sw.settings.level), 'sw-chip--lv sw-lv-' + sw.settings.level));
      roundChip.textContent = sw.k >= 0 ? t('swRoundOf', 'Saying {r} of {n}', { r: sw.k + 1, n: sw.total }) : t('gsGetReady', 'Get ready');
      drawLeader(sw);
      if (sw.phase === 'ended') { if (!finishedShown) showEnd(sw, v); return; }
      if (sw.phase === 'starting') {
        ring.idle();
        waiting(t('swBrief', 'Fill in the missing word.'), sw.settings.answer === 'choice'
          ? t('swBriefChoice', 'Pick the missing word from four. Faster right answers score more, and a streak adds a bonus. One answer per saying.')
          : t('swBriefTiles', 'Spell the missing word with the letter tiles. Faster right answers score more, and a streak adds a bonus. One answer per saying.'));
        return;
      }
      if (!v.seated) {
        waiting(t('gsWatching', 'This game started without you'), t('gsWatchingSub', 'You can join the next one.'));
        return;
      }
      var key = sw.matchId + '|' + sw.k;
      if (shownRound !== key) buildRound(sw, key);
      if (sw.phase === 'open' && board && opened !== key) {
        opened = key;
        board.open();
        api.audio.play('land');
        if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(board.el);
      }
      var me = sw.p[v.uid] || {};
      if ((sw.phase === 'open' || sw.phase === 'ready') && me.inK === sw.k && board && !board.sent) {
        board.sent = true;
        board.lock();
      }
      if (sw.phase === 'reveal' && revealShown !== key) showReveal(sw, v, key);
    }

    function buildRound(sw, key) {
      shownRound = key;
      revealShown = null;
      sentText = null;
      if (board) board.destroy();
      FF.ui.clear(cardHost);
      FF.ui.clear(f.panel);
      f.root.classList.remove('is-revealed');
      ring.idle();
      var rd = sw.round;
      var choice = sw.settings.answer === 'choice';
      cardRound = { words: rd.words, gaps: [], cells: choice ? [] : maskedCells(rd.cells), tiles: rd.tiles || [], letters: [], choices: rd.choices || [] };
      card = sayingCard(cardRound);
      cardHost.appendChild(card.el);
      var lock = FF.ui.el('p', { class: 'sw-locked', 'aria-live': 'polite' });
      function onSubmit(text) {
        if (board.sent) return;
        if (!client.send(text)) return;
        board.sent = true;
        sentText = text;
        board.lock();
        api.audio.play('select');
        lock.textContent = t('bqLockedIn', 'Answer locked in. Waiting for everyone…');
        lock.classList.add('is-on');
      }
      var inner = choice ? choiceBoard(api, cardRound, onSubmit) : tilesBoard(api, cardRound, card, onSubmit);
      board = {
        el: inner.el, sent: false,
        open: inner.open, finish: inner.finish, destroy: inner.destroy,
        lock: function () { inner.el.classList.add('is-locked'); if (inner.lock) inner.lock(); }
      };
      f.panel.appendChild(board.el);
      f.panel.appendChild(lock);
      f.panel.appendChild(FF.ui.div('sw-after'));
    }

    function showReveal(sw, v, key) {
      revealShown = key;
      var last = sw.last;
      var mine = last.results[v.uid] || { ok: false, points: 0, text: '' };
      var choice = sw.settings.answer === 'choice';
      cardRound.gaps = last.gaps;
      if (board) board.finish(!!mine.ok, last.target);
      card.reveal(!!mine.ok, mine.ok ? '' : (mine.text || ''), last.meaning, packName(last.pack));
      ring.set(0, 1);
      f.root.classList.add('is-revealed');
      api.audio.play(mine.ok ? (((sw.p[v.uid] || {}).streak || 0) >= 3 ? 'streak' : 'correct') : 'wrong');
      if (mine.ok && animationsOn() && FF.Confetti) FF.Confetti.burst(40);
      var lockEl = f.panel.querySelector('.sw-locked');
      if (lockEl) lockEl.classList.remove('is-on');
      var after = f.panel.querySelector('.sw-after') || f.panel.appendChild(FF.ui.div('sw-after'));
      FF.ui.clear(after);
      var text = mine.text || sentText;
      after.appendChild(revealBar({
        state: mine.ok ? 'good' : text ? 'bad' : 'late', points: mine.points || 0,
        breakdown: mine.ok ? breakdownOf(mine, sw) : null,
        said: mine.ok ? '' : saidLine(text, null, choice)
      }));
      // Everyone's result for this saying, quickest right answer first.
      var list = FF.ui.el('ul', { class: 'sw-results' });
      (sw.order || []).slice().sort(function (a, b) {
        var ra = last.results[a] || {}, rb = last.results[b] || {};
        return (rb.ok ? 1 : 0) - (ra.ok ? 1 : 0) || (ra.ms || 0) - (rb.ms || 0);
      }).forEach(function (uid) {
        var r = last.results[uid] || {};
        var li = FF.ui.el('li', { class: 'sw-results__row ' + (r.ok ? 'is-good' : 'is-bad') });
        li.appendChild(FF.ui.span('sw-results__name', who(uid).name));
        li.appendChild(FF.ui.span('sw-results__said', r.ok ? (r.ms / 1000).toFixed(1) + 's' : r.text ? '“' + String(r.text).toLowerCase() + '”' : t('swNoAnswer', 'no answer')));
        li.appendChild(FF.ui.span('sw-results__pts', '+' + FF.util.formatNumber(r.points || 0)));
        list.appendChild(li);
      });
      after.appendChild(list);
      after.appendChild(FF.ui.el('p', { class: 'sw-note sw-nextin' }, sw.k + 1 >= sw.total ? t('gsFinalSoon', 'Final results coming up…') : t('swNextSoon', 'Next saying in a moment…')));
    }

    /* The referee sends the total and the streak bonus; the rest is worked out the same way it scored. */
    function breakdownOf(mine, sw) {
      var rd = sw.round || {};
      var base = 100 * (R.WEIGHT[rd.level] || 1);
      var two = rd.two ? 50 : 0;
      var bonus = mine.bonus || 0;
      return { base: base, speed: Math.max(0, (mine.points || 0) - base - two - bonus), two: two, streak: bonus };
    }

    function showEnd(sw, v) {
      finishedShown = true;
      if (board) board.destroy();
      board = null;
      ring.idle();
      ring.el.style.display = 'none';
      FF.ui.clear(cardHost);
      FF.ui.clear(f.panel);
      f.root.classList.add('is-recap');
      var rows = (sw.result && sw.result.rows) || [];
      var box = FF.ui.div('sw-recap sw-recap--room');
      var top = rows[0];
      var meWon = top && top.uid === v.uid && !(rows[1] && rows[1].place === 1);
      box.appendChild(FF.ui.el('h2', { class: 'sw-h sw-h--xl' }, meWon ? t('swYouWin', 'You win the saying race!')
        : top ? t('swWinner', '{name} wins the saying race!', { name: who(top.uid).name }) : t('gsOver', 'Game over')));
      var podium = FF.ui.div('sw-podium');
      [1, 0, 2].forEach(function (i) {
        var r = rows[i];
        if (!r) return;
        var col = FF.ui.div('sw-podium__col sw-podium__col--' + (i + 1));
        var ava = FF.ui.span('sw-podium__ava');
        if (FF.Players && FF.Players.avatarEl) ava.appendChild(FF.Players.avatarEl(who(r.uid), ''));
        col.appendChild(ava);
        col.appendChild(FF.ui.span('sw-podium__name', who(r.uid).name));
        col.appendChild(FF.ui.span('sw-podium__pts', FF.util.formatNumber(r.points || 0)));
        var step = FF.ui.div('sw-podium__step');
        step.appendChild(FF.ui.span('', String(r.place || i + 1)));
        col.appendChild(step);
        podium.appendChild(col);
      });
      box.appendChild(podium);
      var list = FF.ui.el('ol', { class: 'sw-board sw-board--big' });
      rows.forEach(function (r) {
        var li = FF.ui.el('li', { class: 'sw-row' + (r.uid === v.uid ? ' is-me' : '') + (r.place === 1 ? ' is-top' : '') });
        li.appendChild(FF.ui.span('sw-row__place', String(r.place)));
        var ava = FF.ui.span('sw-row__ava');
        if (FF.Players && FF.Players.avatarEl) ava.appendChild(FF.Players.avatarEl(who(r.uid), ''));
        li.appendChild(ava);
        var nm = FF.ui.span('sw-row__name');
        nm.appendChild(FF.ui.span('', who(r.uid).name));
        var bits = [t('qmRightOf', '{c}/{a} right', { c: r.right || 0, a: sw.total })];
        if (r.best > 1) bits.push(t('qmBestStreak', 'best streak {n}', { n: r.best }));
        nm.appendChild(FF.ui.span('sw-row__meta', bits.join(' · ')));
        li.appendChild(nm);
        li.appendChild(FF.ui.span('sw-row__pts', FF.util.formatNumber(r.points || 0)));
        list.appendChild(li);
      });
      box.appendChild(list);
      var go = FF.ui.el('button', { type: 'button', class: 'sw-btn sw-btn--go sw-btn--big' });
      go.appendChild(FF.Icons.icon('trophy'));
      go.appendChild(FF.ui.span('', t('srtSeeScores', 'See scores')));
      go.addEventListener('click', function () { api.audio.play('click'); finish(); });
      box.appendChild(go);
      f.panel.appendChild(box);
      api.audio.play(meWon ? 'winner' : 'roundEnd');
      if (meWon && animationsOn() && FF.Confetti) FF.Confetti.burst(100);
      if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(box);
      if (!autoScores) autoScores = setTimeout(finish, AUTO_SCORES_MS);
    }

    render();
  }

  /* ================= room settings ================= */

  function roomFields() {
    function opt(label, value) { return { label: label, value: value }; }
    return [
      { key: 'answer', label: t('gsAnswerStyle', 'How do you answer?'), options: R.ANSWERS.map(function (a) { return opt(answerName(a), a); }) },
      { key: 'level', label: t('gcLevel', 'Level'), options: ['normal', 'hard'].map(function (l) { return opt(levelName(l), l); }) },
      { key: 'time', label: t('swTimeEach', 'Time for each saying'), options: ['quick', 'normal', 'relaxed'].map(function (x) { return opt(timeName(x), x); }) },
      { key: 'rounds', label: t('swSayings', 'Sayings'), options: R.ROUNDS.map(function (n) { return opt(String(n), n); }) }
    ];
  }

  var ROOM = {
    minPlayers: R.MIN_PLAYERS,
    defaults: R.STANDARD,
    fields: function () { return roomFields(); },
    sanitize: function (s) { return R.sanitizeRoom(s); },
    summary: function (s) { var c = R.sanitizeRoom(s); return [levelName(c.level), answerName(c.answer), t('swNSayings', '{n} sayings', { n: c.rounds })].join(' · '); },
    start: function (room, pick) { return FF.SayWhatApi.start(room, pick); }
  };

  /* ================= turns (pure) ================= */

  /* Whose go it is, and each player's points and streak. */
  FF.SayWhatTurns = {
    create: function (ids) {
      var s = { order: ids.slice(), cur: 0, points: {}, streak: {}, best: {} };
      ids.forEach(function (id) { s.points[id] = 0; s.streak[id] = 0; s.best[id] = 0; });
      return s;
    },
    next: function (s) {
      var o = JSON.parse(JSON.stringify(s));
      o.cur = o.order.length ? (o.cur + 1) % o.order.length : 0;
      return o;
    },
    award: function (s, id, pts, ok) {
      var o = JSON.parse(JSON.stringify(s));
      o.points[id] = (o.points[id] || 0) + (pts || 0);
      o.streak[id] = ok ? (o.streak[id] || 0) + 1 : 0;
      o.best[id] = Math.max(o.best[id] || 0, o.streak[id]);
      return o;
    }
  };

  /* ================= registration ================= */

  FF.registerGame({
    id: 'sayWhat',
    name: 'Say What?',
    description: 'A well-known saying with a word missing. Spell it or pick it before time runs out, and learn what it means.',
    category: 'word',
    icon: '💬',
    players: [1, R.MAX_PLAYERS],
    difficulty: 'Normal',
    duration: 5,
    tags: ['words', 'sayings', 'proverbs', 'online', 'race'],
    modes: ['solo', 'turn'],
    defaultMode: 'solo',
    leaderboard: true,
    howToPlay: [
      'A well-known saying shows with a word missing: “____ wasn’t built in a day”.',
      'Spell the missing word with the letter tiles, or choose Pick a word to tap one of four.',
      'On Hard, some sayings hide two words. Fill both.',
      'Faster right answers score more, and three or more in a row light the streak flame for extra points.',
      'After each one, see the whole saying and what it means.',
      'Pick Everyday, African proverbs, Bible or Kids sayings, and a Speech bubble or Chalkboard look.'
    ],
    room: ROOM,
    start: function (api) {
      var room = FF.Room && FF.Room.current();
      if (racingRoom(api) && room) { online(api, room); return; }
      // One number decides the whole deal, drawn first so a challenge deals the same everywhere.
      var seed = Math.floor(rand0() * 4294967296);
      var playMode = playModeOf(api.config);
      if (api.config.daily || api.config.challenge) { play(api, R.STANDARD, seed, 'solo'); return; }
      var players = playMode === 'turn' ? scorerList(api.config).length : 1;
      setupScreen(api, players, function (cfg) {
        if (!stillShown(api)) return;
        if (!R.isStandard(cfg)) api.config.customRules = true;
        play(api, cfg, seed, playMode);
      });
    }
  });

  FF.SayWhatGame = {
    frame: frame, sayingCard: sayingCard, choiceBoard: choiceBoard, tilesBoard: tilesBoard, revealBar: revealBar,
    timerRing: timerRing, flame: flame, chip: chip, summary: summary, packName: packName, levelName: levelName,
    answerName: answerName, timeName: timeName, look: look, AUTO_SCORES_MS: AUTO_SCORES_MS, NUDGE_MS: NUDGE_MS,
    online: online, maskedCells: maskedCells, room: ROOM
  };
})();
