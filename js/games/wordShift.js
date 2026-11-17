/* ============================================================
   PLAYMONA — games/wordShift.js
   WordShift: change the start word into the target word, one
   letter at a time. Every step must be a real word, and no word
   twice. A letter that matches the target's letter in its place
   turns green. No hints of any kind: nothing is suggested, picked
   or revealed (the shortest length shows only once it is over).

   - Rules: js/wordshift/rules.js (FF.WordShiftRules), typing model
     js/wordshift/board.js (FF.WordShiftBoard), puzzles
     js/data/wordshiftPuzzles.js (made and tested by
     tools/gen-wordshift.js).
   - Modes: Classic (no clock) and Time Challenge (60-180 s); the
     WordShift daily (one Normal puzzle a day, its own board); the
     platform's daily challenge and friend challenges.
   - Scores: the server replays every move (FF.WordShiftApi ->
     api/lib/WordShift.php) and writes the boards, so this game is
     serverScored: GameFlow never writes its scores from the phone.
   - Online rooms: js/wordshift/client.js + referee.js (the Race).
   Classic script, ES5.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.WordShiftRules;
  var SETUP_KEY = 'wordShift:setup';
  var SEEN_KEY = 'wordShift:seen';
  var SEEN_MAX = 1500;
  var KEYS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

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
  function stillShown(api) { return !!(api.shell.root && document.body && document.body.contains(api.shell.root)); }
  function puzzles() { return (FF.data.wordshift && FF.data.wordshift.puzzles) || []; }
  function utcDay() { var d = new Date(); return d.toISOString().slice(0, 10); }
  function isWord(w) { return !!(FF.Words && /^[a-z]+$/.test(w) && FF.Words.tier(w) > 0); }

  function levelName(l) {
    return l === 'easy' ? t('easy', 'Easy') : l === 'hard' ? t('hard', 'Hard') : l === 'expert' ? t('expert', 'Expert') : t('normal', 'Normal');
  }
  function levelMeta(l) {
    return l === 'easy' ? t('wsLetters3', '3 letters') : l === 'normal' ? t('wsLetters4', '4 letters') : l === 'hard' ? t('wsLetters5', '5 letters') : t('wsLetters6', '6–8 letters');
  }
  function modeName(m) { return m === 'timed' ? t('wsTimed', 'Time Challenge') : t('wsClassic', 'Classic'); }
  function clockText(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
  }
  var REASONS = {
    length: function () { return t('wsBadLength', 'Keep the same number of letters.'); },
    same: function () { return t('wsBadSame', 'Change one letter first.'); },
    many: function () { return t('wsBadMany', 'Change just one letter.'); },
    word: function () { return t('wsBadWord', 'Not in our word list.'); },
    used: function () { return t('wsBadUsed', 'You already used that word.'); }
  };

  function seenGet() { var s = store().get(SEEN_KEY, null); return s && s.length ? s : []; }
  function seenAdd(id) {
    var s = seenGet().filter(function (x) { return x !== id; });
    s.push(id);
    try { store().set(SEEN_KEY, s.slice(-SEEN_MAX)); } catch (e) { /* storage full */ }
  }

  /* ================= pieces ================= */

  function frame(api, cls) {
    var root = api.shell.root;
    FF.ui.clear(root);
    if (api.shell.el) api.shell.el.classList.add('ws-shell');
    var ws = FF.ui.div('ws' + (cls ? ' ' + cls : ''));
    var top = FF.ui.div('ws-top');
    var brand = FF.ui.div('ws-brand');
    brand.appendChild(FF.ui.span('ws-brand__a', 'Word'));
    brand.appendChild(FF.ui.span('ws-brand__b', 'Shift'));
    top.appendChild(brand);
    var chips = FF.ui.div('ws-chips');
    top.appendChild(chips);
    ws.appendChild(top);
    var main = FF.ui.div('ws-main');
    ws.appendChild(main);
    root.appendChild(ws);
    return { root: ws, chips: chips, main: main };
  }
  function chip(text, cls) { return FF.ui.span('ws-chip' + (cls ? ' ' + cls : ''), text); }

  // A row of letter tiles. Returns { el, tiles[] }.
  function tileRow(word, cls, greens) {
    var row = FF.ui.div('ws-row ' + (cls || ''));
    row.setAttribute('aria-label', word.toUpperCase());
    var tiles = [];
    word.split('').forEach(function (ch, i) {
      var tile = FF.ui.span('ws-tile' + (greens && greens[i] ? ' ws-tile--green' : ''), ch.toUpperCase());
      tile.setAttribute('aria-hidden', 'true');
      row.appendChild(tile);
      tiles.push(tile);
    });
    row.style.setProperty('--n', String(word.length));
    return { el: row, tiles: tiles };
  }

  function retrigger(el, cls) {
    if (!animationsOn()) return;
    el.classList.remove(cls);
    void el.offsetWidth;   // restart the animation
    el.classList.add(cls);
  }

  /* ================= setup ================= */

  function setupScreen(api, onGo) {
    api.shell.hideTimer();
    if (FF.GameLength && FF.GameLength.pause) FF.GameLength.pause();
    var saved = R.sanitize(store().get(SETUP_KEY, null) || R.STANDARD);
    var mode = saved.mode, level = saved.level, seconds = saved.seconds;
    var f = frame(api, 'ws--setup');

    var hero = FF.ui.div('ws-hero');
    var from = tileRow('sing', 'ws-row--hero ws-row--start');
    var to = tileRow('bear', 'ws-row--hero ws-row--target', [true, true, true, true]);
    hero.appendChild(from.el);
    hero.appendChild(FF.ui.span('ws-hero__arrow', '→'));
    hero.appendChild(to.el);
    f.main.appendChild(hero);
    var how = FF.ui.el('ul', { class: 'ws-how' });
    [t('wsHow1', 'Change one letter at a time to reach the target word.'),
      t('wsHow2', 'Every step must be a real word, and you can’t use a word twice.'),
      t('wsHow3', 'Letters in the right place turn green. Fewer moves score more.')].forEach(function (x, i) {
      var li = FF.ui.el('li', {});
      li.appendChild(FF.ui.span('ws-how__n', String(i + 1)));
      li.appendChild(FF.ui.span('', x));
      how.appendChild(li);
    });
    f.main.appendChild(how);

    var box = FF.ui.div('ws-setup');
    f.main.appendChild(box);
    var syncs = [];
    function heading(text) { box.appendChild(FF.ui.el('h2', { class: 'ws-h' }, text)); }
    function group(label) { var g = FF.ui.el('div', { class: 'ws-seg', role: 'group', 'aria-label': label }); box.appendChild(g); return g; }
    function opt(wrap, label, meta, isOn, fn) {
      var b = FF.ui.el('button', { type: 'button', class: 'ws-opt' });
      b.appendChild(FF.ui.span('ws-opt__name', label));
      if (meta) b.appendChild(FF.ui.span('ws-opt__meta', meta));
      b.addEventListener('click', function () { api.audio.play('tap'); fn(); sync(); });
      wrap.appendChild(b);
      syncs.push(function () { var on = isOn(); b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      return b;
    }

    heading(t('wsMode', 'Mode'));
    var modes = group(t('wsMode', 'Mode'));
    opt(modes, modeName('classic'), t('wsClassicMeta', 'No clock'), function () { return mode === 'classic'; }, function () { mode = 'classic'; });
    opt(modes, modeName('timed'), t('wsTimedMeta', 'Beat the clock'), function () { return mode === 'timed'; }, function () { mode = 'timed'; });

    heading(t('gcLevel', 'Level'));
    var levels = group(t('gcLevel', 'Level'));
    R.LEVELS.forEach(function (l) {
      opt(levels, levelName(l), levelMeta(l), function () { return level === l; }, function () { level = l; });
    });

    var clockHead = FF.ui.el('h2', { class: 'ws-h' }, t('wsClock', 'Clock'));
    box.appendChild(clockHead);
    var clocks = group(t('wsClock', 'Clock'));
    R.CLOCKS.forEach(function (s) {
      opt(clocks, clockText(s * 1000), '', function () { return seconds === s; }, function () { seconds = s; });
    });

    var go = FF.ui.el('button', { type: 'button', class: 'ws-btn ws-btn--go ws-btn--big' });
    go.appendChild(FF.Icons.icon('play'));
    go.appendChild(FF.ui.span('', t('wsPlay', 'Play')));
    go.addEventListener('click', function () {
      var cfg = R.sanitize({ mode: mode, level: level, seconds: seconds });
      try { store().set(SETUP_KEY, cfg); } catch (e) { /* storage full */ }
      api.audio.play('click');
      onGo(cfg, null);
    });
    box.appendChild(go);

    // WordShift's own daily puzzle: the same for everyone today.
    var day = utcDay();
    var dp = R.dailyPuzzle(day, puzzles());
    if (dp) {
      var daily = FF.ui.el('button', { type: 'button', class: 'ws-btn ws-btn--daily' });
      daily.appendChild(FF.Icons.icon('calendar'));
      daily.appendChild(FF.ui.span('', t('wsDaily', 'Today’s WordShift')));
      daily.addEventListener('click', function () { api.audio.play('click'); onGo({ mode: 'classic', level: 'normal', seconds: R.DEFAULT_CLOCK }, { puzzle: dp, daily: 'ws', day: day }); });
      box.appendChild(daily);
      var board = FF.ui.div('ws-dailyboard');
      box.appendChild(board);
      drawDailyBoard(board, day);
    }

    function sync() {
      syncs.forEach(function (s) { s(); });
      var timed = mode === 'timed';
      clockHead.style.display = timed ? '' : 'none';
      clocks.style.display = timed ? '' : 'none';
    }
    sync();
    if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(box);
  }

  // Today's WordShift board (written by the server), top 10.
  function drawDailyBoard(holder, day) {
    if (!FF.Cloud || !FF.Cloud.available || !FF.Cloud.available() || !FF.Cloud.top) return;
    FF.Cloud.top('wordshiftDaily/' + day, 'score', 10).then(function (rows) {
      rows = FF.Leaderboards && FF.Leaderboards.sortRows ? FF.Leaderboards.sortRows(rows || []) : (rows || []);
      if (!rows.length) return;
      FF.ui.clear(holder);
      holder.appendChild(FF.ui.el('p', { class: 'ws-dailyboard__title' }, t('wsDailyBoard', 'Today’s best')));
      var ol = FF.ui.el('ol', { class: 'ws-lb' });
      rows.slice(0, 10).forEach(function (r) {
        var v = r.val || r;
        var li = FF.ui.el('li', { class: 'ws-lb__row' });
        li.appendChild(FF.ui.span('ws-lb__name', v.name || t('playerLabel', 'Player')));
        li.appendChild(FF.ui.span('ws-lb__meta', t('wsMovesN', '{n} moves', { n: v.moves || 0 })));
        li.appendChild(FF.ui.span('ws-lb__pts', FF.util.formatNumber(v.score || 0)));
        ol.appendChild(li);
      });
      holder.appendChild(ol);
    }).catch(function () { /* offline: no board */ });
  }

  /* ================= one puzzle ================= */

  /* opts: { mode, seconds, daily: null | 'ws' | 'platform', onDone(result), onNext, onReplay, single } */
  function playPuzzle(api, p, opts) {
    var me = (api.config.players && api.config.players[0]) || { id: 'p1' };
    var timed = opts.mode === 'timed';
    var f = frame(api, 'ws--play');
    f.chips.appendChild(chip(levelName(p.lv), 'ws-chip--lv ws-lv-' + p.lv));
    if (opts.daily) f.chips.appendChild(chip(t('wsDailyChip', 'Daily'), 'ws-chip--daily'));
    var movesChip = chip('', 'ws-chip--moves');
    f.chips.appendChild(movesChip);
    var clock = chip('', 'ws-chip--clock');
    if (timed) f.chips.appendChild(clock);

    var goal = FF.ui.div('ws-goal');
    var startBox = FF.ui.div('ws-goal__start');
    startBox.appendChild(FF.ui.span('ws-label', t('wsStart', 'Start')));
    startBox.appendChild(tileRow(p.s, 'ws-row--mini ws-row--start').el);
    goal.appendChild(startBox);
    var targetBox = FF.ui.div('ws-goal__target');
    targetBox.appendChild(FF.ui.span('ws-label', t('wsTarget', 'Target')));
    targetBox.appendChild(tileRow(p.t, 'ws-row--target').el);
    goal.appendChild(targetBox);
    f.main.appendChild(goal);

    var ladder = FF.ui.el('ol', { class: 'ws-ladder', 'aria-label': t('wsYourWords', 'Your words') });
    f.main.appendChild(ladder);

    var boardWrap = FF.ui.div('ws-board');
    var tilesEl = FF.ui.div('ws-row ws-row--board');
    tilesEl.style.setProperty('--n', String(p.s.length));
    tilesEl.setAttribute('role', 'group');
    tilesEl.setAttribute('aria-label', t('wsCurrent', 'Your word. Pick a letter, then type.'));
    boardWrap.appendChild(tilesEl);
    var msg = FF.ui.el('p', { class: 'ws-msg', role: 'status', 'aria-live': 'polite' }, t('wsPick', 'Tap a letter, then type its new letter.'));
    boardWrap.appendChild(msg);
    f.main.appendChild(boardWrap);

    var kb = FF.ui.div('ws-kb');
    f.main.appendChild(kb);
    var giveUp = FF.ui.el('button', { type: 'button', class: 'ws-link' }, t('wsGiveUp', 'Give up'));
    f.main.appendChild(giveUp);

    var board = FF.WordShiftBoard.create(p.s);
    var cur = p.s;
    var used = [p.s];
    var moves = [];
    var invalid = 0;
    var greensNow = R.greens(cur, p.t);
    var over = false;
    var started = Date.now();
    var timer = null;
    var ticket = null;
    var ticketP = FF.WordShiftApi.begin({ puzzleId: p.id, mode: opts.mode, seconds: timed ? opts.seconds : undefined, daily: opts.daily || undefined })
      .then(function (r) { ticket = r && r.ticket; return ticket; });
    seenAdd(p.id);

    var tileEls = [];
    for (var i = 0; i < p.s.length; i++) {
      (function (idx) {
        var b = FF.ui.el('button', { type: 'button', class: 'ws-tile ws-tile--big' });
        b.addEventListener('click', function () { if (over) return; api.audio.play('tap'); board.select(idx); draw(); });
        tilesEl.appendChild(b);
        tileEls.push(b);
      })(i);
    }

    KEYS.forEach(function (row, r) {
      var line = FF.ui.div('ws-kb__row');
      if (r === 2) line.appendChild(key('enter', t('wsEnter', 'Enter'), 'ws-key--wide ws-key--enter'));
      row.split('').forEach(function (ch) { line.appendChild(key(ch, ch.toUpperCase())); });
      if (r === 2) line.appendChild(key('back', '⌫', 'ws-key--wide', t('wsBack', 'Undo letter')));
      kb.appendChild(line);
    });
    function key(k, label, cls, aria) {
      var b = FF.ui.el('button', { type: 'button', class: 'ws-key' + (cls ? ' ' + cls : '') }, label);
      if (aria) b.setAttribute('aria-label', aria);
      b.addEventListener('click', function () { press(k); });
      return b;
    }

    // The player left the game screen (quit, back): drop the clock and the key listener.
    function left() {
      if (stillShown(api)) return false;
      over = true;
      document.removeEventListener('keydown', onKey, true);
      if (timer) { clearInterval(timer); timer = null; }
      return true;
    }

    function onKey(e) {
      if (over || left()) return;
      var tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      var k = FF.WordShiftBoard.keyFilter(e);
      if (!k) return;
      if (k === 'enter' && e.target && e.target.tagName === 'BUTTON' && !e.target.classList.contains('ws-tile')) return;   // let the focused button act
      e.preventDefault();
      e.stopPropagation();
      press(k);
    }
    document.addEventListener('keydown', onKey, true);

    function press(k) {
      if (over) return;
      if (k === 'enter') { submit(); return; }
      if (k === 'back') { if (board.back()) api.audio.play('tap'); draw(); return; }
      if (k === 'left') { board.move(-1); draw(); return; }
      if (k === 'right') { board.move(1); draw(); return; }
      if (board.selected() < 0) { say(t('wsPickFirst', 'Tap the letter you want to change first.'), 'warn'); return; }
      if (board.type(k)) { api.audio.play('tap'); draw(); retrigger(tileEls[board.selected()], 'is-typed'); }
    }

    function say(text, kind) {
      msg.textContent = text;
      msg.className = 'ws-msg' + (kind ? ' ws-msg--' + kind : '');
    }

    function draw() {
      var letters = board.letters();
      var edited = board.edited();
      var sel = board.selected();
      tileEls.forEach(function (b, i) {
        b.textContent = letters[i].toUpperCase();
        b.classList.toggle('ws-tile--green', !!greensNow[i] && edited.indexOf(i) === -1);
        b.classList.toggle('ws-tile--edited', edited.indexOf(i) !== -1);
        b.classList.toggle('is-selected', i === sel);
        b.setAttribute('aria-pressed', i === sel ? 'true' : 'false');
        b.setAttribute('aria-label', t('wsTileAria', 'Letter {n}: {l}', { n: i + 1, l: letters[i].toUpperCase() }) + (greensNow[i] ? ' · ' + t('wsInPlace', 'in place') : ''));
      });
      movesChip.textContent = t('wsMovesN', '{n} moves', { n: moves.length });
    }

    function submit() {
      var word = board.word();
      var res = R.checkMove(cur, word, used, isWord);
      if (!res.ok) {
        if (res.reason !== 'same') invalid++;
        api.audio.play('wrong');
        say(REASONS[res.reason](), 'bad');
        retrigger(tilesEl, 'is-shake');
        return;
      }
      var before = greensNow;
      var changed = board.edited()[0];
      cur = word;
      used.push(word);
      moves.push(word);
      greensNow = R.greens(cur, p.t);
      var li = FF.ui.el('li', { class: 'ws-ladder__step' });
      li.appendChild(tileRow(word, 'ws-row--mini', greensNow).el);
      ladder.appendChild(li);
      if (ladder.scrollTo) ladder.scrollTop = ladder.scrollHeight;
      board.reset(word);
      draw();
      retrigger(tileEls[changed], 'is-flip');
      var newGreen = greensNow[changed] && !before[changed];
      if (newGreen) retrigger(tileEls[changed], 'is-pop');
      api.audio.play(newGreen ? 'correct' : 'land');
      if (word === p.t) { win(); return; }
      say(newGreen ? t('wsInPlaceNow', 'That letter is in place.') : t('wsNice', '{w} works.', { w: word.toUpperCase() }), newGreen ? 'good' : '');
    }

    function stop() {
      over = true;
      document.removeEventListener('keydown', onKey, true);
      if (timer) { clearInterval(timer); timer = null; }
      api.shell.hideTimer();
      api.shell.setOnTick(null);
      kb.classList.add('is-off');
      giveUp.style.display = 'none';
    }

    function win() {
      var ms = Date.now() - started;
      stop();
      tileEls.forEach(function (b, i) {
        b.classList.add('ws-tile--green');
        b.style.animationDelay = (i * 90) + 'ms';
        retrigger(b, 'is-wave');
      });
      say(t('wsSolved', 'You reached {w}!', { w: p.t.toUpperCase() }), 'good');
      api.audio.play('winner');
      if (animationsOn() && FF.Confetti) FF.Confetti.burst(90);
      var local = R.score({ finished: true, moves: moves.length, shortest: p.n, invalid: invalid, timed: timed, secondsLeft: timed ? Math.floor((opts.seconds * 1000 - ms) / 1000) : 0 });
      ticketP.then(function (tk) { return FF.WordShiftApi.finish(tk, moves, invalid); }).then(function (server) {
        if (!stillShown(api)) return;
        var result = server && server.finished
          ? { score: server.score, ms: server.ms, ranked: !!server.ranked, places: server.places || [], shortest: server.shortest }
          : { score: local, ms: ms, ranked: false, places: [], shortest: p.n };
        setTimeout(function () { if (stillShown(api)) doneCard(true, result); }, animationsOn() ? 900 : 0);
      });
    }

    function lose(reason) {
      stop();
      api.audio.play('wrong');
      doneCard(false, { score: 0, ms: Date.now() - started, ranked: false, places: [], shortest: p.n, reason: reason });
    }

    function doneCard(solved, r) {
      api.scoring.add(me.id, r.score, solved ? { correct: true } : { wrong: true });
      if (r.places && r.places.length && FF.Leaderboards) {
        var lines = r.places.map(function (pl) { return { period: pl.period, best: pl.best }; });
        Promise.all(lines.map(function (pl) {
          return FF.Leaderboards.rankIn(FF.Leaderboards.path('wordShift', pl.period), (FF.Auth && FF.Auth.user && FF.Auth.user() || {}).uid, FF.Leaderboards.threshold())
            .then(function (rank) { pl.rank = rank; return pl; });
        })).then(function (ranked) {
          ranked = ranked.filter(function (x) { return x.rank; });
          if (ranked.length) FF.Leaderboards.celebrate({ game: 'wordShift', places: ranked });
        }).catch(function () { /* offline */ });
      }
      var card = FF.ui.div('ws-done' + (solved ? ' is-solved' : ''));
      card.appendChild(FF.ui.el('h2', { class: 'ws-h ws-h--xl' }, solved ? t('wsDoneTitle', 'Shifted!') : r.reason === 'time' ? t('wsTimeUp', 'Time’s up') : t('wsGaveUp', 'Puzzle over')));
      var stats = FF.ui.el('dl', { class: 'ws-stats' });
      function stat(label, value, cls) {
        var d = FF.ui.div('ws-stat' + (cls ? ' ' + cls : ''));
        d.appendChild(FF.ui.el('dt', {}, label));
        d.appendChild(FF.ui.el('dd', {}, value));
        stats.appendChild(d);
      }
      stat(t('wsMoves', 'Moves'), String(moves.length));
      stat(t('wsShortest', 'Shortest'), String(r.shortest));
      stat(t('wsTime', 'Time'), clockText(r.ms));
      stat(t('wsScore', 'Score'), FF.util.formatNumber(r.score), 'ws-stat--score');
      card.appendChild(stats);
      if (solved) {
        var extra = moves.length - r.shortest;
        card.appendChild(FF.ui.el('p', { class: 'ws-note' }, extra <= 0 ? t('wsPerfect', 'A perfect path: as short as it gets.') : t('wsExtra', '{n} more than the shortest path.', { n: extra })));
      }
      card.appendChild(FF.ui.el('p', { class: 'ws-note ws-note--rank' }, r.ranked
        ? t('wsRanked', 'Checked by the server and counted.')
        : FF.WordShiftApi.canRank() ? t('wsNotRanked', 'This run was not counted on the boards.') : t('wsSignInRank', 'Sign in to put your scores on the boards.')));
      var row = FF.ui.div('ws-done__btns');
      if (opts.onNext) row.appendChild(btn('arrow-right', t('wsNext', 'Next puzzle'), 'ws-btn--go', opts.onNext));
      if (opts.onReplay) row.appendChild(btn('play', t('wsReplay', 'Replay'), '', opts.onReplay));
      row.appendChild(btn('trophy', t('seeResults', 'See results'), opts.onNext ? 'ws-btn--ghost' : 'ws-btn--go', opts.onDone));
      card.appendChild(row);
      FF.ui.clear(boardWrap);
      boardWrap.appendChild(tilesEl);
      boardWrap.appendChild(card);
      kb.style.display = 'none';
      if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(row);
    }
    function btn(icon, label, cls, fn) {
      var b = FF.ui.el('button', { type: 'button', class: 'ws-btn ' + (cls || '') });
      if (FF.Icons && FF.Icons.icon) b.appendChild(FF.Icons.icon(icon));
      b.appendChild(FF.ui.span('', label));
      b.addEventListener('click', function () { api.audio.play('click'); fn(); });
      return b;
    }

    giveUp.addEventListener('click', function () { if (!over) lose('quit'); });

    if (timed) {
      var endAt = started + opts.seconds * 1000;
      var tick = function () {
        if (left()) return;
        var msLeft = endAt - Date.now();
        clock.textContent = clockText(msLeft);
        clock.classList.toggle('is-low', msLeft <= 10000);
        if (msLeft <= 0 && !over) lose('time');
      };
      tick();
      timer = setInterval(tick, 250);
    }
    draw();
  }

  /* ================= a session of puzzles ================= */

  function session(api, cfg, first) {
    var lastPuzzle = null;
    function done() { api.end({ results: api.scoring.results ? api.scoring.results().results : [] }); }
    function run(p, extra) {
      lastPuzzle = p;
      FF.LetterRush.whenReady(api, function () {
        if (!stillShown(api)) return;
        playPuzzle(api, p, {
          mode: cfg.mode, seconds: cfg.seconds, daily: extra && extra.daily || null,
          onDone: done,
          onNext: extra && extra.single ? null : function () { run(R.pick(puzzles(), cfg.level, seenGet(), rand0)); },
          onReplay: extra && extra.single ? null : function () { run(lastPuzzle); }
        });
      });
    }
    if (first) run(first.puzzle, first);
    else run(R.pick(puzzles(), cfg.level, seenGet(), rand0));
  }

  /* ================= registration ================= */

  function roomFields() {
    function opt(label, value) { return { label: label, value: value }; }
    return [
      { key: 'level', label: t('gcLevel', 'Level'), options: R.LEVELS.map(function (l) { return opt(levelName(l), l); }) },
      { key: 'rounds', label: t('wsPuzzles', 'Puzzles'), options: R.ROOM_ROUNDS.map(function (n) { return opt(String(n), n); }) },
      { key: 'clock', label: t('wsClockEach', 'Time for each puzzle'), options: R.ROOM_CLOCKS.map(function (s) { return opt(clockText(s * 1000), s); }) }
    ];
  }

  var ROOM = {
    minPlayers: R.MIN_PLAYERS,
    defaults: { level: 'normal', rounds: 3, clock: 120 },
    fields: function () { return roomFields(); },
    sanitize: function (s) { return R.sanitizeRoom(s); },
    summary: function (s) { var c = R.sanitizeRoom(s); return [levelName(c.level), (c.rounds === 1 ? t('wsOnePuzzle', '1 puzzle') : t('wsNPuzzles', '{n} puzzles', { n: c.rounds }))].join(' · '); },
    start: function (room, pick) { return FF.WordShiftOnline.start(room, pick); }
  };

  FF.registerGame({
    id: 'wordShift',
    name: 'WordShift',
    description: 'Change one letter at a time to turn the start word into the target. Every step must be a real word.',
    category: 'words',
    icon: '🔤',
    players: [1, R.MAX_PLAYERS],
    difficulty: 'Normal',
    duration: 4,
    tags: ['words', 'puzzle', 'ladder', 'online', 'race', 'daily'],
    modes: ['solo'],
    defaultMode: 'solo',
    leaderboard: true,
    serverScored: true,
    howToPlay: [
      'You get a start word and a target word with the same number of letters.',
      'Tap a letter, type its new letter and press Enter. Change exactly one letter each move.',
      'Every word you make must be a real word, and you can’t use a word twice.',
      'Letters that match the target in the same place turn green.',
      'Reach the target in as few moves as you can. Time Challenge adds points for time left.',
      'There are no hints: find your own way.'
    ],
    room: ROOM,
    start: function (api) {
      var room = FF.Room && FF.Room.current();
      if (api.config.room && room && FF.WordShiftOnline) { FF.WordShiftOnline.play(api, room); return; }
      if (api.config.daily) {
        var day = String(api.config.daily);
        var dp = R.dailyPuzzle(day, puzzles());
        session(api, R.STANDARD, { puzzle: dp, daily: 'platform', single: true });
        return;
      }
      if (api.config.challenge) {
        // A friend challenge: the same seeded puzzle for both, on the standard settings.
        session(api, R.STANDARD, { puzzle: R.pick(puzzles(), 'normal', [], rand0), single: true });
        return;
      }
      setupScreen(api, function (cfg, first) {
        if (!stillShown(api)) return;
        if (!R.isStandard(cfg)) api.config.customRules = true;
        session(api, cfg, first ? { puzzle: first.puzzle, daily: first.daily, single: true } : null);
      });
    }
  });

  FF.WordShiftGame = {
    frame: frame, tileRow: tileRow, chip: chip, levelName: levelName, clockText: clockText,
    retrigger: retrigger, animationsOn: animationsOn, REASONS: REASONS, KEYS: KEYS, isWord: isWord, room: ROOM
  };
})();
