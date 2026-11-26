/* ============================================================
   PLAYMONA — games/pictureRush.js
   Picture Rush: a picture is cut into square tiles and scrambled.
   Swap two tiles at a time (tap one then another, or drag one onto
   another) until the picture is whole. Nothing marks a tile in its place.
   A quick look at the whole picture first, and a Peek button that
   costs points.

   - Solo, or pass and play (everyone gets the same pictures with the
     same scramble, in turn).
   - Online rooms: a parallel challenge (js/net/parallel.js); every phone
     deals the same pictures and scrambles from the room seed.
   - Leaderboards, the daily game and friend challenges play the
     standard settings on the shared deal.
   - Pictures: js/data/pictureRush.js, used once their webp is in the
     asset manifest (games/pictureRush). Until a theme has enough, the
     old drawings in js/data/visual.js and visual2.js stand in.
   - The board and the round scoring are the Celebrations Picture Rush's
     (js/celebrate/pictureRush/board.js and rules.js).

   The pure rules are FF.PictureRush (tools/test/pictureRush.test.js).
   Looks: css/games.css (.prx-*) and css/celebrate.css (.prb board).
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  function t(key, fallback, vars) { return FF.t ? FF.t(key, fallback, vars) : String(fallback); }
  function R() { return FF.PictureRushRules; }

  /* ================= rules (pure, tested) ================= */

  var GRIDS = [3, 4, 5, 6];
  var COUNTS = [1, 3, 5];
  var PEEKS = [0, 3, 5];
  var SECONDS = { 3: 60, 4: 120, 5: 180, 6: 300 };
  var FACTOR = { 3: 0.5, 4: 1, 5: 1.5, 6: 2 };
  var HINTS = 2;               // Peeks per picture
  var HINT_MS = 3000;
  var SCORING = { base: 1000, speed: 500, hintCost: 100, partial: 500 };
  var ART = 'games/pictureRush';
  var MAX_COUNT = COUNTS[COUNTS.length - 1];

  function pickOf(list, v, fallback) { return list.indexOf(v) !== -1 ? v : fallback; }

  function themes() { return (FF.data && FF.data.pictureRush && FF.data.pictureRush.themes) || []; }
  function themeIds() { return ['mix'].concat(themes().map(function (th) { return th.id; })); }

  function defaults(difficulty) {
    return { theme: 'mix', grid: difficulty === 'easy' ? 3 : difficulty === 'hard' ? 5 : 4, count: 3, peek: 3 };
  }

  function sanitize(s) {
    s = s || {};
    var d = defaults(s.difficulty);
    var out = {
      theme: pickOf(themeIds(), s.theme, d.theme),
      grid: pickOf(GRIDS, Number(s.grid), d.grid),
      count: pickOf(COUNTS, Number(s.count), d.count),
      peek: pickOf(PEEKS, Number(s.peek), d.peek)
    };
    if (s.difficulty) out.difficulty = String(s.difficulty);
    return out;
  }

  var STANDARD = defaults('normal');
  function isStandard(s) {
    var c = sanitize(s);
    return c.theme === STANDARD.theme && c.grid === STANDARD.grid && c.count === STANDARD.count && c.peek === STANDARD.peek;
  }
  function key(s) { return [s.theme, s.grid, s.count, s.peek].join('|'); }

  function secondsFor(grid) { return SECONDS[grid] || SECONDS[4]; }
  function factor(grid) { return FACTOR[grid] || 1; }

  function hasArt(id) {
    var m = FF.AssetManifest && FF.AssetManifest[ART];
    return !!(m && m[id]);
  }

  function photos(theme) {
    var out = [];
    themes().forEach(function (th) {
      if (theme !== 'mix' && th.id !== theme) return;
      th.pictures.forEach(function (p) {
        if (hasArt(p[0])) out.push({ id: p[0], name: t('prxPic_' + p[0].replace(/-/g, '_'), p[1]), theme: th.id });
      });
    });
    return out;
  }

  function drawings() {
    var vis = (FF.data && FF.data.visual) || {};
    var out = [];
    ['animals', 'food', 'landmarks', 'objects', 'sports', 'vehicles'].forEach(function (k) {
      (vis[k] || []).forEach(function (it, i) {
        if (it && it.svg && it.name) out.push({ id: 'svg-' + k + '-' + i, name: it.name, svg: it.svg });
      });
    });
    return out;
  }

  /* Themes with enough photos for the longest game: the only ones offered. */
  function readyThemes() {
    return themes().filter(function (th) { return photos(th.id).length >= MAX_COUNT; });
  }

  /* The pictures a game draws from: the theme's photos, or the drawings
     while it has fewer than the game needs. */
  function pool(theme, need) {
    var p = photos(theme || 'mix');
    return p.length >= (need || 1) ? p : drawings();
  }

  function shuffle(list, rand) {
    var a = list.slice();
    for (var j = a.length - 1; j > 0; j--) {
      var k = Math.floor(rand() * (j + 1));
      var x = a[j]; a[j] = a[k]; a[k] = x;
    }
    return a;
  }

  /* The game's pictures, each with its scramble: [{ id, name, svg|theme, tiles }].
     tiles[position] = piece, as FF.PictureRushRules. rand() is the shared seeded
     random on a shared deal. */
  function deal(cfg, rand) {
    var picked = shuffle(pool(cfg.theme, cfg.count), rand).slice(0, cfg.count);
    return picked.map(function (p) {
      var out = {};
      Object.keys(p).forEach(function (k) { out[k] = p[k]; });
      out.tiles = R().scramble(cfg.grid, function (n) { return Math.floor(rand() * n); });
      return out;
    });
  }

  /* One picture's points. r: { solved, usedMs, hints, correct, startCorrect }. */
  function points(r, grid) {
    var roundMs = secondsFor(grid) * 1000;
    var raw = R().roundPoints(SCORING, {
      solved: !!r.solved, usedMs: r.usedMs || 0, hints: r.hints || 0,
      correct: r.correct || 0, startCorrect: r.startCorrect || 0, size: grid
    }, roundMs);
    return Math.max(0, Math.round(raw * factor(grid)));
  }

  /* A room round: the look first, then the picture's time, and a moment for the last swap. */
  function roomSeconds(cfg) { return cfg.peek + secondsFor(cfg.grid) + 2; }

  /* ================= labels and settings ================= */

  function themeName(id) {
    if (id === 'mix') return t('prxMix', 'A bit of everything');
    var th = themes().filter(function (x) { return x.id === id; })[0];
    return th ? t('prxTheme_' + id, th.name) : id;
  }

  function summary(s) {
    s = sanitize(s);
    return [
      s.grid + '×' + s.grid,
      t(s.count === 1 ? 'prxOnePic' : 'prxNPics', s.count === 1 ? '1 picture' : '{n} pictures', { n: s.count }),
      s.peek ? t('prxNPeek', '{n}s look', { n: s.peek }) : t('prxNoPeek', 'No look'),
      themeName(s.theme)
    ].join(' · ');
  }

  function fields() {
    function opt(label, value) { return { label: label, value: value }; }
    var list = [
      { key: 'grid', label: t('prxGrid', 'Tiles'), options: GRIDS.map(function (n) { return opt(n + '×' + n, n); }) },
      { key: 'count', label: t('prxPictures', 'Pictures'), options: COUNTS.map(function (n) { return opt(String(n), n); }) },
      { key: 'peek', label: t('prxLook', 'Look first'), options: PEEKS.map(function (n) { return opt(n ? n + 's' : t('off', 'Off'), n); }) }
    ];
    var ready = readyThemes();
    if (ready.length) {
      list.unshift({ key: 'theme', label: t('prxThemeLabel', 'Theme'), options: [opt(themeName('mix'), 'mix')].concat(ready.map(function (th) { return opt(themeName(th.id), th.id); })) });
    }
    return list;
  }

  /* ================= device helpers ================= */

  function rand() { return FF._rand ? FF._rand() : Math.random(); }

  function now() { return Date.now(); }

  function picUrl(api, item) {
    if (item.svg) return api.assets.svgUri(item.svg);
    return FF.Assets ? FF.Assets.artPath(ART, item.id) : 'assets/images/' + ART + '/' + item.id + '.webp';
  }

  function preload(api, items) {
    if (typeof Image !== 'function') return;
    items.forEach(function (it) { if (!it.svg) { var im = new Image(); im.src = picUrl(api, it); } });
  }

  function stillShown(api) { return !!(api.shell.root && (!document.body || !document.body.contains || document.body.contains(api.shell.root))); }

  /* ================= one picture on one phone =================
     o: { cfg, item, n, total, turnEntity, roundText, live, clock (true: use the
     shell timer), nextLabel, onDone(result) }. result: { solved, usedMs, hints,
     correct, startCorrect, moves, points }. Returns { start, stop } (stop ends the
     picture where it is and returns the result). */
  function play(api, o) {
    var cfg = o.cfg;
    var size = cfg.grid;
    var total = size * size;
    var root = api.shell.root;
    FF.ui.clear(root);
    api.shell.hideTimer();

    var tiles = o.item.tiles.slice();
    var startCorrect = R().correct(tiles);
    var selected = -1;
    var moves = 0;
    var hints = 0;
    var phase = 'wait';        // wait | look | play | done
    var startedAt = 0;
    var timers = [];
    var result = null;
    var peeking = false;

    var stage = FF.GameUI.stage({ center: true, className: 'prx' });
    if (o.live) stage.appendChild(o.live);
    stage.appendChild(FF.GameUI.turnBar(o.turnEntity || null, o.roundText || null));
    var meta = FF.ui.div('gm-turnbar prx-meta');
    meta.appendChild(FF.GameUI.pill(o.item.name, 'image'));
    var countEl = FF.GameUI.pill('', 'check');
    countEl.classList.add('prx-count');
    meta.appendChild(countEl);
    stage.appendChild(meta);
    var chip = FF.ui.div('prx-msg', '');
    chip.setAttribute('aria-live', 'polite');
    stage.appendChild(chip);
    var host = FF.ui.div('prx-board');
    stage.appendChild(host);
    var foot = FF.ui.div('prx-foot');
    var peekBtn = FF.UI.button('', { class: 'btn-ghost prx-peek', icon: 'eye', onClick: onPeek });
    foot.appendChild(peekBtn);
    stage.appendChild(foot);
    root.appendChild(stage);

    var board = FF.PictureRushBoard.create(host, {
      size: size,
      url: picUrl(api, o.item),
      onPick: function (p) { if (phase !== 'play') return; selected = p; api.audio.play('click'); paint(); },
      onDrop: function () { selected = -1; paint(); },
      onSwap: onSwap,
      canTake: function () { return phase === 'play'; }
    });

    function later(fn, ms) {
      var id = setTimeout(function () { timers.splice(timers.indexOf(id), 1); fn(); }, ms);
      timers.push(id);
    }

    function setText(el, icon, text) {
      FF.ui.clear(el);
      el.appendChild(FF.Icons.icon(icon));
      el.appendChild(document.createTextNode(text));
    }

    function paint() {
      // The opening look and a Peek lay the whole picture over the board.
      board.update({
        tiles: tiles,
        selected: phase === 'play' ? selected : -1,
        held: {},
        locked: phase !== 'play' || peeking,
        solved: phase === 'done' && result && result.solved,
        peek: peeking || phase === 'look'
      });
      var home = R().correct(tiles);
      setText(countEl, 'check', t('prxInPlace', '{n} of {total} in place', { n: home, total: total }));
      peekBtn.disabled = phase !== 'play' || peeking || hints >= HINTS;
      FF.ui.clear(peekBtn);
      peekBtn.appendChild(FF.Icons.icon('eye'));
      peekBtn.appendChild(document.createTextNode(t('prxPeekLeft', 'Peek ({n} left)', { n: HINTS - hints })));
    }

    function onSwap(a, b) {
      if (phase !== 'play' || a === b || tiles[a] === a || tiles[b] === b) { selected = -1; paint(); return; }
      tiles = R().swap(tiles, a, b);
      moves++;
      selected = -1;
      var landed = (tiles[a] === a ? 1 : 0) + (tiles[b] === b ? 1 : 0);
      api.audio.play(landed ? 'correct' : 'tap');
      paint();
      if (R().solved(tiles)) complete(true);
    }

    function onPeek() {
      if (phase !== 'play' || peeking || hints >= HINTS) return;
      hints++;
      peeking = true;
      api.audio.play('flip');
      paint();
      later(function () { peeking = false; paint(); }, HINT_MS);
    }

    function stats(solved) {
      var r = {
        solved: !!solved, usedMs: startedAt ? Math.max(0, now() - startedAt) : 0, hints: hints,
        correct: R().correct(tiles), startCorrect: startCorrect, moves: moves
      };
      r.points = points(r, size);
      return r;
    }

    function finish(solved) {
      if (phase === 'done') return result;
      result = stats(solved);
      phase = 'done';
      peeking = false;
      selected = -1;
      timers.forEach(clearTimeout);
      timers = [];
      api.shell.hideTimer();
      paint();
      if (solved) {
        api.audio.play('winner');
        chip.className = 'prx-msg is-good';
        chip.textContent = t('prxSolved', 'Solved in {m} swaps! +{n}', { m: moves, n: FF.util.formatNumber(result.points) });
      } else {
        api.audio.play('roundEnd');
        chip.className = 'prx-msg is-out';
        chip.textContent = t('prxTimeUp', 'Time’s up: {n} of {total} in place. +{p}', { n: result.correct, total: total, p: FF.util.formatNumber(result.points) });
      }
      return result;
    }

    function begin() {
      phase = 'play';
      startedAt = now();
      chip.className = 'prx-msg';
      chip.textContent = t('prxHow', 'Tap a tile, then the tile to swap it with');
      paint();
      if (o.clock) api.shell.setTimer(secondsFor(size), function () { if (phase === 'play') complete(false); });
    }

    /* The picture is over: show it, then move on (a button, or by itself in a room). */
    function complete(solved) {
      if (phase === 'done') return;
      var r = finish(solved);
      if (!o.onDone) return;
      if (o.nextLabel) {
        peekBtn.style.display = 'none';
        foot.appendChild(FF.GameUI.action(o.nextLabel, function () {
          api.audio.play('select');
          o.onDone(r);
        }, { icon: 'arrow-right', className: 'prx-next' }));
      } else later(function () { o.onDone(r); }, 1400);
    }

    preload(api, [o.item]);
    chip.textContent = cfg.peek ? t('prxLookNow', 'Remember the picture…') : t('prxGetReady', 'Get ready…');
    paint();

    return {
      start: function () {
        if (phase !== 'wait') return;
        if (cfg.peek > 0) {
          phase = 'look';
          paint();
          later(begin, cfg.peek * 1000);
        } else begin();
      },
      stop: function () { return phase === 'done' ? result : finish(false); }
    };
  }

  /* ================= setup, pass and results screens ================= */

  function setupScreen(api, onGo) {
    var root = api.shell.root;
    api.shell.hideTimer();
    FF.ui.clear(root);
    var saved = (FF.Storage && FF.Storage.get('pictureRush:setup', null)) || null;
    var gs = sanitize(Object.assign({}, defaults(api.config.difficulty), saved || {}));
    var stage = FF.GameUI.stage({ center: true, className: 'prx sq-setup' });
    stage.appendChild(FF.GameUI.kicker(t('prxName', 'Picture Rush')));
    stage.appendChild(FF.GameUI.prompt(t('prxSetupTitle', 'Swap the tiles to rebuild the picture'), 'md'));
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
      box.appendChild(FF.ui.el('p', { class: 'gm-note sq-setup__hint' }, t('prxHowNote', 'Bigger grids score more; each Peek costs points.')));
      renote();
    }
    function renote() {
      var ranked = FF.Leaderboards && FF.Leaderboards.active && FF.Leaderboards.active(api.def);
      note.textContent = summary(gs) + ' · ' + t('prxTimeEach', '{t} each', { t: FF.Parallel && FF.Parallel.clock ? FF.Parallel.clock(secondsFor(gs.grid) * 1000) : secondsFor(gs.grid) + 's' }) +
        (ranked && !isStandard(gs) ? ' · ' + t('nrUnranked', 'Leaderboards use the standard settings') : '');
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
      try { if (FF.Storage) FF.Storage.set('pictureRush:setup', cfg); } catch (e) { /* storage full */ }
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
    var stage = FF.GameUI.stage({ center: true, className: 'prx nr-pass' });
    stage.appendChild(FF.GameUI.turnBar(who, roundText));
    var ava = FF.ui.div('nr-pass__ava');
    ava.appendChild(FF.Players.avatarEl(who, 'nr-pass__img'));
    stage.appendChild(ava);
    stage.appendChild(FF.GameUI.prompt(t('nrPassTo', 'Pass to {name}', { name: who.name }), 'md'));
    stage.appendChild(FF.GameUI.sub(t('prxPassSub', 'Same pictures, same scramble for everyone. No peeking while others play!')));
    stage.appendChild(FF.GameUI.action(t('nrReady', 'I’m ready'), function () { api.audio.play('select'); onReady(); }, { icon: 'play' }));
    root.appendChild(stage);
    if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(stage);
  }

  function playLocal(api, cfg) {
    var list = (api.config.scorers || []).slice();
    if (!list.length) list = [{ id: 'me', name: t('you', 'You') }];
    var multi = list.length > 1;
    var dealt = deal(cfg, rand);     // one deal: everyone gets the same pictures and scrambles
    var runs = [];
    var who = 0;
    var pic = 0;
    var cur = null;
    function next() {
      if (!stillShown(api)) return;
      if (who >= list.length) { results(api, cfg, runs); return; }
      var p = list[who];
      if (pic === 0) {
        cur = { who: p, points: 0, solved: 0, count: dealt.length };
        runs.push(cur);
        if (multi) { passScreen(api, p, t('nrPlayerOf', 'Player {n} of {total}', { n: who + 1, total: list.length }), go); return; }
      }
      go();
    }
    function go() {
      var p = list[who];
      api.shell.updateScores(p.id);
      var last = pic + 1 >= dealt.length;
      var h = play(api, {
        cfg: cfg, item: dealt[pic], clock: true,
        turnEntity: multi ? p : null,
        roundText: dealt.length > 1 ? t('prxPicOf', 'Picture {n} of {total}', { n: pic + 1, total: dealt.length }) : null,
        nextLabel: !last ? t('prxNextPic', 'Next picture') : multi && who + 1 < list.length ? t('bkNextPlayer', 'Next player') : t('seeResults', 'See results'),
        onDone: function (r) {
          cur.points += r.points;
          if (r.solved) cur.solved++;
          api.scoring.add(p.id, r.points, { correct: r.solved });
          api.shell.updateScores(p.id);
          pic++;
          if (pic >= dealt.length) { pic = 0; who++; }
          next();
        }
      });
      h.start();
    }
    next();
  }

  function rankRuns(runs) {
    var sorted = runs.slice().sort(function (a, b) { return b.points - a.points || b.solved - a.solved; });
    var place = 0, prev = null;
    sorted.forEach(function (r, i) {
      if (!prev || prev.points !== r.points || prev.solved !== r.solved) place = i + 1;
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
    var stage = FF.GameUI.stage({ center: true, className: 'prx nr-results' });
    var title;
    if (solo) title = top.solved >= top.count ? t('prxAllSolved', 'Every picture rebuilt!') : t('prxSoloN', '{n} of {total} rebuilt', { n: top.solved, total: top.count });
    else if (tie) title = t('nrTie', 'It’s a tie!');
    else title = t('nrWins', '{name} wins!', { name: top.who.name });
    stage.appendChild(FF.GameUI.kicker(summary(cfg)));
    stage.appendChild(FF.GameUI.prompt(title, 'xl'));
    if (solo) stage.appendChild(FF.ui.div('nr-results__score', FF.util.formatNumber(top.points)));
    var table = FF.ui.el('ol', { class: 'nr-table' });
    ranked.forEach(function (r) {
      var li = FF.ui.el('li', { class: 'nr-row' + (r.place === 1 ? ' is-winner' : '') });
      if (!solo) li.appendChild(FF.ui.span('nr-row__rank', String(r.place)));
      li.appendChild(FF.Players.avatarEl(r.who, 'nr-row__ava'));
      var who = FF.ui.span('nr-row__who');
      who.appendChild(FF.ui.span('nr-row__name', r.who.name));
      who.appendChild(FF.ui.span('nr-row__status', t('prxNSolved', '{n} of {total} rebuilt', { n: r.solved, total: r.count })));
      li.appendChild(who);
      li.appendChild(FF.ui.span('nr-row__pts', FF.util.formatNumber(r.points)));
      table.appendChild(li);
    });
    stage.appendChild(table);
    stage.appendChild(FF.GameUI.action(t('seeResults', 'See results'), function () {
      api.audio.play('select');
      api.end({
        results: ranked.map(function (r) {
          return { id: r.who.id, name: r.who.name, avatar: r.who.avatar, color: r.who.color, photo: r.who.photo, points: r.points, correct: r.solved };
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
    // Dealt once from the room's seed: every phone gets the same pictures and scrambles, none twice.
    FF.Parallel.seed(api, 'pictures');
    var dealt = deal(cfg, rand);
    FF.Parallel.run(api, {
      rounds: cfg.count,
      seconds: roomSeconds(cfg),
      gate: '.prb__tile',
      play: function (n, ctx) {
        var item = dealt[n % dealt.length];
        var h = play(api, {
          cfg: cfg, item: item, live: ctx.live, roundText: ctx.roundText, clock: false,
          onDone: function (r) { ctx.done(roomResult(r)); }
        });
        return {
          start: h.start,
          stop: function () { return roomResult(h.stop()); }
        };
      },
      describe: function () {
        return { kind: 'card', text: t('prxWatch', 'Everyone is rebuilding the same picture: {s}', { s: summary(cfg) }) };
      },
      detail: function (a) {
        return a.solved
          ? t('prxDetailSolved', '{m} swaps · {time}', { m: a.moves || 0, time: FF.Parallel.clock(a.usedMs || 0) })
          : t('prxDetailPlaced', '{n} tiles in place', { n: a.correct || 0 });
      }
    });
  }

  function roomResult(r) {
    return { value: r.points, solved: !!r.solved, moves: r.moves, correct: r.correct, usedMs: r.usedMs, hints: r.hints };
  }

  /* ================= registration ================= */

  var ROOM = {
    defaults: STANDARD,
    fields: function () { return fields(); },
    sanitize: function (s) { return sanitize(s); },
    summary: function (s) { return summary(s); }
  };

  FF.PictureRush = {
    GRIDS: GRIDS, COUNTS: COUNTS, PEEKS: PEEKS, SECONDS: SECONDS, FACTOR: FACTOR, HINTS: HINTS, HINT_MS: HINT_MS,
    SCORING: SCORING, STANDARD: STANDARD, ART: ART,
    defaults: defaults, sanitize: sanitize, isStandard: isStandard, key: key, secondsFor: secondsFor, factor: factor,
    photos: photos, drawings: drawings, readyThemes: readyThemes, pool: pool, deal: deal, points: points,
    roomSeconds: roomSeconds, summary: summary, fields: fields, ROOM: ROOM
  };

  FF.registerGame({
    id: 'pictureRush',
    name: 'Picture Rush',
    description: 'A picture cut into tiles and scrambled. Swap two tiles at a time to rebuild it before the clock runs out.',
    category: 'visual',
    icon: '🧩',
    players: [1, 8],
    difficulty: 'Normal',
    duration: 5,
    tags: ['visual', 'puzzle', 'pictures'],
    modes: ['solo', 'turn'],
    defaultMode: 'solo',
    howToPlay: [
      'Look at the whole picture for a moment, then it breaks into scrambled tiles.',
      'Tap a tile, then the tile you want to swap it with (or drag one onto the other).',
      'Rebuild the picture before the clock runs out. Nothing tells you which tiles are already right.',
      'Quicker means more points. Peek shows the whole picture again, but costs points.'
    ],
    room: ROOM,
    start: function (api) {
      if (FF.Parallel && FF.Parallel.active()) { playOnline(api); return; }
      // The daily challenge, a friend's challenge and a celebration play the standard rules on the shared deal.
      if (api.config.daily || api.config.challenge) { playLocal(api, sanitize(STANDARD)); return; }
      setupScreen(api, function (cfg) {
        if (!isStandard(cfg)) api.config.customRules = true;
        playLocal(api, cfg);
      });
    }
  });
})();
