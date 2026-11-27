/* ============================================================
   PLAYMONA — games/hiddenObject.js
   Hidden Object: one busy picture with 12 objects tucked into it. A list
   says which to find; tap each one before the clock runs out. Pinch (or
   the + and − buttons, or the mouse wheel) to zoom in, drag to look round.

   - The level picks how many objects are on the list (Easy 6, Normal 9,
     Hard 12). Objects not on the list stay in the picture: tapping one
     says so, with no penalty.
   - Solo, or pass and play (everyone gets the same picture and list).
   - Online rooms: a parallel challenge (js/net/parallel.js); every phone
     deals the same picture and list from the round seed.
   - Pictures and boxes: js/data/hiddenObject.js; a scene is used once its
     picture is in the asset manifest (games/hiddenObject).

   The pure rules are FF.HiddenObject (tools/test/hiddenObject.test.js).
   Looks: css/games.css (.hob-*).
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  function t(key, fallback, vars) { return FF.t ? FF.t(key, fallback, vars) : String(fallback); }

  /* ================= rules (pure, tested) ================= */

  var COUNTS = [6, 9, 12];
  var PICTURES = [1, 3];
  var SECONDS = { 6: 90, 9: 120, 12: 150 };
  var FIND = 5;                // an object found
  var WRONG = 1;               // a tap on no object
  var SPEED = 10;              // the most for finding them all quickly
  var MARGIN = 0.025;          // finger room round each object, as a share of the picture
  var MAX_ZOOM = 3;
  var TAP_PX = 8;              // a press that moves further than this is a drag, not a tap
  var ART = 'games/hiddenObject';

  function pickOf(list, v, fallback) { return list.indexOf(v) !== -1 ? v : fallback; }

  function defaults(difficulty) {
    return { count: difficulty === 'easy' ? 6 : difficulty === 'hard' ? 12 : 9, pictures: 1 };
  }

  function sanitize(s) {
    s = s || {};
    var d = defaults(s.difficulty);
    return { count: pickOf(COUNTS, Number(s.count), d.count), pictures: pickOf(PICTURES, Number(s.pictures), d.pictures) };
  }

  var STANDARD = defaults('normal');
  function isStandard(s) {
    var c = sanitize(s);
    return c.count === STANDARD.count && c.pictures === STANDARD.pictures;
  }

  function secondsFor(count) { return SECONDS[count] || SECONDS[9]; }

  function hasArt(id) {
    var m = FF.AssetManifest && FF.AssetManifest[ART];
    return !!(m && m[id]);
  }

  function scenes() {
    var list = (FF.data && FF.data.hiddenObject && FF.data.hiddenObject.scenes) || [];
    return list.filter(function (s) { return hasArt(s.id); }).map(function (s) {
      return { id: s.id, name: t('hobPic_' + s.id.replace(/-/g, '_'), s.name), objects: s.objects };
    });
  }

  function shuffle(list, rand) {
    var a = list.slice();
    for (var j = a.length - 1; j > 0; j--) {
      var k = Math.floor(rand() * (j + 1));
      var x = a[j]; a[j] = a[k]; a[k] = x;
    }
    return a;
  }

  /* One scene with `count` of its objects on the list, in list order. */
  function dealScene(scene, count, rand) {
    var all = scene.objects.map(function (o, i) { return i; });
    return { id: scene.id, name: scene.name, objects: scene.objects, active: shuffle(all, rand).slice(0, Math.min(count, all.length)) };
  }

  /* The pictures for a game: cfg.pictures different scenes (fewer if there aren't enough). */
  function deal(cfg, rand) {
    return shuffle(scenes(), rand).slice(0, cfg.pictures).map(function (s) { return dealScene(s, cfg.count, rand); });
  }

  /* A tap at (u, v), 0..1 across the picture: the listed object it found
     (the nearest, if boxes overlap), -2 for one already found, -3 for an
     object that is in the picture but not on the list (neither costs
     anything), or -1 for a miss. */
  function hit(item, found, u, v) {
    var best = -1, bestD = Infinity, again = false, decoy = false;
    item.objects.forEach(function (o, i) {
      var b = o.b;
      if (u < b[0] - MARGIN || u > b[0] + b[2] + MARGIN || v < b[1] - MARGIN || v > b[1] + b[3] + MARGIN) return;
      if (item.active.indexOf(i) === -1) { decoy = true; return; }
      if (found[i]) { again = true; return; }
      var d = Math.pow(u - (b[0] + b[2] / 2), 2) + Math.pow(v - (b[1] + b[3] / 2), 2);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best !== -1 ? best : again ? -2 : decoy ? -3 : -1;
  }

  /* st: { found, total, wrong, usedMs }. 5 a find on every level; finding
     them all adds up to 10 more for speed; a wrong tap costs 1. Never below 0. */
  function points(st, limitMs) {
    var pts = (st.found || 0) * FIND;
    if (st.found >= st.total && limitMs > 0) {
      pts += Math.round(SPEED * Math.max(0, Math.min(1, 1 - (st.usedMs || 0) / limitMs)));
    }
    return Math.max(0, pts - (st.wrong || 0) * WRONG);
  }

  /* The zoom: the picture is drawn z times the frame's size with its top
     left corner at (x, y), all as shares of the frame. It always covers
     the frame, so x and y run from 1 - z to 0. */
  function clampView(v) {
    var z = Math.max(1, Math.min(MAX_ZOOM, v.z || 1));
    return { z: z, x: Math.max(1 - z, Math.min(0, v.x || 0)), y: Math.max(1 - z, Math.min(0, v.y || 0)) };
  }

  /* The picture position under a point (u, v) of the frame. */
  function toPicture(v, u, w) { return [(u - v.x) / v.z, (w - v.y) / v.z]; }

  /* Zoom by `factor` round the frame point (u, w), keeping what is there in place. */
  function zoomAt(v, factor, u, w) {
    var p = toPicture(v, u, w);
    var z = Math.max(1, Math.min(MAX_ZOOM, v.z * factor));
    return clampView({ z: z, x: u - p[0] * z, y: w - p[1] * z });
  }

  function isTap(dx, dy) { return Math.sqrt(dx * dx + dy * dy) <= TAP_PX; }

  /* ================= labels and settings ================= */

  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function objName(o) { return t('hobObj_' + o.n.replace(/\W+/g, '_'), o.n); }

  function summary(s) {
    var c = sanitize(s);
    var txt = t('hobNObjects', '{n} objects', { n: c.count });
    return c.pictures > 1 ? txt + ' · ' + t('sdxNPics', '{n} pictures', { n: c.pictures }) : txt;
  }

  function fields() {
    function opt(label, value) { return { label: label, value: value }; }
    var list = [{ key: 'count', label: t('hobObjects', 'Objects to find'), options: COUNTS.map(function (n) { return opt(String(n), n); }) }];
    if (scenes().length >= PICTURES[PICTURES.length - 1]) {
      list.push({ key: 'pictures', label: t('sdxPictures', 'Pictures'), options: PICTURES.map(function (n) { return opt(String(n), n); }) });
    }
    return list;
  }

  /* ================= one picture on one phone ================= */

  function rand() { return FF._rand ? FF._rand() : Math.random(); }
  function now() { return Date.now(); }
  function picUrl(id) { return FF.Assets ? FF.Assets.artPath(ART, id) : 'assets/images/' + ART + '/' + id + '.webp'; }
  function stillShown(api) { return !!(api.shell.root && (!document.body || !document.body.contains || document.body.contains(api.shell.root))); }
  function pct(v) { return (+(v * 100).toFixed(3)) + '%'; }

  function box(b, cls) {
    return FF.ui.el('div', { class: cls, style: { left: pct(b[0]), top: pct(b[1]), width: pct(b[2]), height: pct(b[3]) } });
  }

  function iconButton(icon, label, onClick) {
    var btn = FF.ui.el('button', { type: 'button', class: 'hob-zoom__btn', 'aria-label': label, title: label, onclick: onClick });
    btn.appendChild(FF.Icons.icon(icon));
    return btn;
  }

  /* o: { cfg, item, clock (use the shell timer), turnEntity, roundText, live,
     nextLabel, onDone(result) }. result: { found, total, wrong, usedMs, points }.
     Returns { start, stop } (stop ends the picture and returns the result). */
  function play(api, o) {
    var item = o.item;
    var total = item.active.length;
    var limitMs = secondsFor(total) * 1000;
    var root = api.shell.root;
    FF.ui.clear(root);
    api.shell.hideTimer();

    var found = {};
    var foundCount = 0;
    var wrong = 0;
    var phase = 'wait';        // wait | play | done
    var startedAt = 0;
    var timers = [];
    var result = null;

    var stage = FF.GameUI.stage({ center: true, className: 'hob' });
    if (o.live) stage.appendChild(o.live);
    stage.appendChild(FF.GameUI.turnBar(o.turnEntity || null, o.roundText || null));
    var meta = FF.ui.div('gm-turnbar hob-meta');
    meta.appendChild(FF.GameUI.pill(item.name, 'image'));
    var countEl = FF.GameUI.pill('', 'magnifying-glass');
    countEl.setAttribute('aria-live', 'polite');
    meta.appendChild(countEl);
    stage.appendChild(meta);
    var chip = FF.ui.div('hob-msg', '');
    chip.setAttribute('aria-live', 'polite');
    stage.appendChild(chip);

    var board = FF.ui.div('hob-board is-waiting');

    // The picture, in a frame you can zoom and drag.
    var wrap = FF.ui.div('hob-viewwrap');
    var view = FF.ui.div('hob-view');
    var layer = FF.ui.div('hob-layer');
    layer.appendChild(FF.ui.el('img', { class: 'hob-img', src: picUrl(item.id), alt: item.name, draggable: 'false' }));
    var marks = FF.ui.div('hob-marks');
    layer.appendChild(marks);
    view.appendChild(layer);
    wrap.appendChild(view);
    var zoomBar = FF.ui.div('hob-zoom');
    var zIn = iconButton('plus', t('hobZoomIn', 'Zoom in'), function () { zoomBy(1.5); });
    var zOut = iconButton('minus', t('hobZoomOut', 'Zoom out'), function () { zoomBy(1 / 1.5); });
    var zReset = iconButton('arrows-out', t('hobZoomReset', 'Whole picture'), function () { setView({ z: 1, x: 0, y: 0 }); });
    zoomBar.appendChild(zIn);
    zoomBar.appendChild(zOut);
    zoomBar.appendChild(zReset);
    wrap.appendChild(zoomBar);
    board.appendChild(wrap);

    // The list.
    var listBox = FF.ui.div('hob-listbox');
    listBox.appendChild(FF.ui.div('hob-list__title', t('hobFind', 'Find these')));
    var list = FF.ui.el('ul', { class: 'hob-list' });
    var chips = {};
    item.active.forEach(function (i) {
      var li = FF.ui.el('li', { class: 'hob-chip' });
      li.appendChild(FF.ui.span('hob-chip__tick', ''));
      li.appendChild(FF.ui.span('hob-chip__name', cap(objName(item.objects[i]))));
      chips[i] = li;
      list.appendChild(li);
    });
    listBox.appendChild(list);
    board.appendChild(listBox);
    stage.appendChild(board);

    var foot = FF.ui.div('hob-foot');
    stage.appendChild(foot);
    root.appendChild(stage);

    /* ---- zoom and drag ---- */
    var vw = { z: 1, x: 0, y: 0 };
    function setView(v) {
      vw = clampView(v);
      layer.style.transform = 'translate(' + pct(vw.x) + ', ' + pct(vw.y) + ') scale(' + vw.z + ')';
      view.classList.toggle('is-zoomed', vw.z > 1.001);
      zOut.disabled = vw.z <= 1.001;
      zReset.disabled = vw.z <= 1.001;
      zIn.disabled = vw.z >= MAX_ZOOM - 0.001;
    }
    function zoomBy(f) { api.audio.play('click'); setView(zoomAt(vw, f, 0.5, 0.5)); }
    function frameRect() { return view.getBoundingClientRect(); }

    var pts = {};
    var npts = 0;
    var press = null;          // { sx, sy, tap }: the press that may become a tap
    var pinch = null;          // { d, mx, my }: the last two-finger distance and middle
    function two() {
      var ids = Object.keys(pts);
      var a = pts[ids[0]], b = pts[ids[1]];
      return { d: Math.max(1, Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2))), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    }
    view.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button > 0) return;
      try { view.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
      if (!pts[e.pointerId]) npts++;
      pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (npts === 1) press = { sx: e.clientX, sy: e.clientY, tap: true };
      else { if (press) press.tap = false; if (npts === 2) pinch = two(); }
      view.classList.add('is-dragging');
    });
    view.addEventListener('pointermove', function (e) {
      var prev = pts[e.pointerId];
      if (!prev) return;
      pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      var r = frameRect();
      if (!r.width) return;
      if (npts >= 2 && pinch) {
        var p = two();
        var v = { z: vw.z, x: vw.x + (p.mx - pinch.mx) / r.width, y: vw.y + (p.my - pinch.my) / r.height };
        setView(zoomAt(v, p.d / pinch.d, (p.mx - r.left) / r.width, (p.my - r.top) / r.height));
        pinch = p;
        return;
      }
      if (press && press.tap && !isTap(e.clientX - press.sx, e.clientY - press.sy)) press.tap = false;
      if (press && !press.tap) setView({ z: vw.z, x: vw.x + (e.clientX - prev.x) / r.width, y: vw.y + (e.clientY - prev.y) / r.height });
    });
    function lift(e) {
      if (!pts[e.pointerId]) return;
      delete pts[e.pointerId];
      npts--;
      if (npts <= 0) {
        npts = 0;
        if (e.type === 'pointerup' && press && press.tap) onTap(e.clientX, e.clientY);
        press = null;
        pinch = null;
        view.classList.remove('is-dragging');
      } else if (npts === 1) {
        pinch = null;
        var id = Object.keys(pts)[0];
        press = { sx: pts[id].x, sy: pts[id].y, tap: false };
      }
    }
    view.addEventListener('pointerup', lift);
    view.addEventListener('pointercancel', lift);
    view.addEventListener('wheel', function (e) {
      if (phase === 'wait') return;
      e.preventDefault();
      var r = frameRect();
      if (!r.width) return;
      setView(zoomAt(vw, e.deltaY < 0 ? 1.25 : 1 / 1.25, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height));
    }, { passive: false });
    setView(vw);

    /* ---- taps ---- */
    function later(fn, ms) {
      var id = setTimeout(function () { timers.splice(timers.indexOf(id), 1); fn(); }, ms);
      timers.push(id);
    }

    function paintCount() {
      FF.ui.clear(countEl);
      countEl.appendChild(FF.Icons.icon('magnifying-glass'));
      countEl.appendChild(document.createTextNode(t('foundOf', 'Found {f} of {n}', { f: foundCount, n: total })));
    }

    function say(cls, text) {
      chip.className = 'hob-msg' + (cls ? ' ' + cls : '');
      chip.textContent = text;
    }

    function onTap(cx, cy) {
      if (phase !== 'play') return;
      var r = frameRect();
      if (!r.width || !r.height) return;
      var p = toPicture(vw, (cx - r.left) / r.width, (cy - r.top) / r.height);
      if (p[0] < 0 || p[0] > 1 || p[1] < 0 || p[1] > 1) return;
      var i = hit(item, found, p[0], p[1]);
      if (i === -2) return;
      if (i === -3) {
        say('', t('hobNotListed', 'Not on your list'));
        return;
      }
      if (i === -1) {
        wrong++;
        api.audio.play('wrong');
        var miss = FF.ui.el('div', { class: 'hob-miss', style: { left: pct(p[0]), top: pct(p[1]), transform: 'scale(' + (1 / vw.z) + ')' } });
        miss.appendChild(FF.Icons.icon('x'));
        marks.appendChild(miss);
        later(function () { if (miss.parentNode) miss.parentNode.removeChild(miss); }, 700);
        say('is-out', t('hobMiss', 'Nothing on your list there: −{n}', { n: WRONG }));
        return;
      }
      found[i] = true;
      foundCount++;
      api.audio.play('correct');
      marks.appendChild(box(item.objects[i].b, 'hob-ring'));
      chips[i].classList.add('is-found');
      paintCount();
      say('is-good', t('hobFound', 'Found the {name}!', { name: objName(item.objects[i]) }));
      if (foundCount >= total) complete();
    }

    function stats() {
      var r = { found: foundCount, total: total, wrong: wrong, usedMs: startedAt ? Math.max(0, now() - startedAt) : 0 };
      r.points = points(r, limitMs);
      return r;
    }

    function finish() {
      if (phase === 'done') return result;
      result = stats();
      phase = 'done';
      timers.forEach(clearTimeout);
      timers = [];
      api.shell.hideTimer();
      board.classList.add('is-done');
      item.active.forEach(function (i) {
        if (found[i]) return;
        marks.appendChild(box(item.objects[i].b, 'hob-ring is-missed'));
        chips[i].classList.add('is-missed');
      });
      if (result.found >= total) {
        api.audio.play('winner');
        say('is-good', t('hobAllFound', 'All {n} found! +{p}', { n: total, p: FF.util.formatNumber(result.points) }));
      } else {
        api.audio.play('roundEnd');
        say('is-out', t('sdxTimeUp', 'Time’s up: {f} of {n} found. +{p}', { f: result.found, n: total, p: FF.util.formatNumber(result.points) }));
      }
      return result;
    }

    function complete() {
      if (phase === 'done') return;
      var r = finish();
      if (!o.onDone) return;
      if (o.nextLabel) {
        foot.appendChild(FF.GameUI.action(o.nextLabel, function () {
          api.audio.play('select');
          o.onDone(r);
        }, { icon: 'arrow-right' }));
      } else later(function () { o.onDone(r); }, 1600);
    }

    paintCount();
    say('', t('sdxGetReady', 'Get ready…'));

    return {
      start: function () {
        if (phase !== 'wait') return;
        phase = 'play';
        startedAt = now();
        board.classList.remove('is-waiting');
        say('', t('hobHow', 'Tap each thing on your list. Pinch to zoom in.'));
        if (o.clock) api.shell.setTimer(secondsFor(total), function () { if (phase === 'play') complete(); });
      },
      stop: function () { return phase === 'done' ? result : finish(); }
    };
  }

  /* ================= setup, pass and results screens ================= */

  function setupScreen(api, onGo) {
    var root = api.shell.root;
    api.shell.hideTimer();
    FF.ui.clear(root);
    var saved = (FF.Storage && FF.Storage.get('hiddenObject:setup', null)) || null;
    var gs = sanitize(Object.assign({}, defaults(), saved || {}));
    var stage = FF.GameUI.stage({ center: true, className: 'hob sq-setup' });
    stage.appendChild(FF.GameUI.kicker(t('hobName', 'Hidden Object')));
    stage.appendChild(FF.GameUI.prompt(t('hobSetupTitle', 'Find everything on your list'), 'md'));
    var rows = FF.ui.el('section', { class: 'settings-section nr-setup__rows' });
    var note = FF.ui.el('p', { class: 'gm-note nr-setup__note', 'aria-live': 'polite' });
    function render() {
      FF.ui.clear(rows);
      fields().forEach(function (f) {
        rows.appendChild(FF.UI.settingRow(f.label, FF.UI.segmented({
          label: f.label, value: gs[f.key], options: f.options,
          onChange: function (v) { gs[f.key] = v; renote(); }
        })));
      });
      rows.appendChild(FF.ui.el('p', { class: 'gm-note sq-setup__hint' }, t('hobHowNote', 'Twelve things are hidden in the picture. A longer list scores more; wrong taps cost points.')));
      renote();
    }
    function renote() {
      var ranked = FF.Leaderboards && FF.Leaderboards.active && FF.Leaderboards.active(api.def);
      var secs = secondsFor(gs.count);
      var clock = FF.Parallel && FF.Parallel.clock ? FF.Parallel.clock(secs * 1000) : secs + 's';
      note.textContent = summary(gs) + ' · ' + (gs.pictures > 1 ? t('prxTimeEach', '{t} each', { t: clock }) : t('sdxTimeOne', '{t} on the clock', { t: clock })) +
        (ranked && !isStandard(gs) ? ' · ' + t('nrUnranked', 'Leaderboards use the standard settings') : '');
    }
    render();
    stage.appendChild(rows);
    stage.appendChild(note);
    var row = FF.ui.div('nr-setup__actions');
    row.appendChild(FF.UI.button(t('nrStandard', 'Standard settings'), {
      class: 'btn-lg btn-ghost', icon: 'restart',
      onClick: function () { api.audio.play('click'); gs = sanitize(STANDARD); render(); }
    }));
    row.appendChild(FF.GameUI.action(t('rsStart', 'Start'), function () {
      api.audio.play('select');
      var cfg = sanitize(gs);
      try { if (FF.Storage) FF.Storage.set('hiddenObject:setup', cfg); } catch (e) { /* storage full */ }
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
    var stage = FF.GameUI.stage({ center: true, className: 'hob nr-pass' });
    stage.appendChild(FF.GameUI.turnBar(who, roundText));
    var ava = FF.ui.div('nr-pass__ava');
    ava.appendChild(FF.Players.avatarEl(who, 'nr-pass__img'));
    stage.appendChild(ava);
    stage.appendChild(FF.GameUI.prompt(t('nrPassTo', 'Pass to {name}', { name: who.name }), 'md'));
    stage.appendChild(FF.GameUI.sub(t('hobPassSub', 'Same picture, same list for everyone. No peeking while others play!')));
    stage.appendChild(FF.GameUI.action(t('nrReady', 'I’m ready'), function () { api.audio.play('select'); onReady(); }, { icon: 'play' }));
    root.appendChild(stage);
    if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(stage);
  }

  function playLocal(api, cfg) {
    var list = (api.config.scorers || []).slice();
    if (!list.length) list = [{ id: 'me', name: t('you', 'You') }];
    var multi = list.length > 1 && api.config.mode !== 'solo';
    if (!multi) list = list.slice(0, 1);
    var dealt = deal(cfg, rand);     // one deal: everyone gets the same pictures and lists
    var runs = [];
    var who = 0;
    var pic = 0;
    var cur = null;
    function next() {
      if (!stillShown(api)) return;
      if (who >= list.length) { results(api, cfg, runs); return; }
      var p = list[who];
      if (pic === 0) {
        cur = { who: p, points: 0, found: 0, total: 0 };
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
          cur.found += r.found;
          cur.total += r.total;
          api.scoring.add(p.id, r.points, { correct: r.found >= r.total });
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

  /* What the end screen shows (FF.EndScreen). Pure: ranked runs in. */
  function endSummary(cfg, ranked) {
    var top = ranked[0];
    var solo = ranked.length === 1;
    var tie = ranked.length > 1 && ranked[1].place === 1;
    var s = { kicker: summary(cfg) };
    if (solo) s.headline = top.found >= top.total ? t('hobAllYou', 'You found them all!') : t('hobSoloN', '{f} of {n} found', { f: top.found, n: top.total });
    else if (tie) s.headline = t('nrTie', 'It’s a tie!');
    else s.headline = t('nrWins', '{name} wins!', { name: top.who.name });
    if (solo) {
      s.stats = [{ icon: 'magnifying-glass', label: t('hobFound', 'Found'), value: top.found + '/' + top.total }];
    } else {
      s.lines = {};
      ranked.forEach(function (r) { s.lines[r.who.id] = t('hobSoloN', '{f} of {n} found', { f: r.found, n: r.total }); });
    }
    return s;
  }

  function results(api, cfg, runs) {
    var ranked = runs.slice().sort(function (a, b) { return b.points - a.points || b.found - a.found; });
    var place = 0, prev = null;
    ranked.forEach(function (r, i) {
      if (!prev || prev.points !== r.points || prev.found !== r.found) place = i + 1;
      r.place = place;
      prev = r;
    });
    var top = ranked[0];
    var tie = ranked.length > 1 && ranked[1].place === 1;
    api.end({
      results: ranked.map(function (r) {
        return { id: r.who.id, name: r.who.name, avatar: r.who.avatar, color: r.who.color, photo: r.who.photo, points: r.points, correct: r.found };
      }),
      winnerId: tie ? null : top.who.id,
      summary: endSummary(cfg, ranked)
    });
  }

  /* ================= online room ================= */

  function roomSettings() {
    var r = FF.Room && FF.Room.current();
    return (r && r.meta && r.meta.settings) || {};
  }

  function playOnline(api) {
    var cfg = sanitize(roomSettings());
    // The order of pictures comes from the room's seed; each round's list from that round's seed.
    FF.Parallel.seed(api, 'pictures');
    var order = shuffle(scenes(), rand);
    FF.Parallel.run(api, {
      rounds: Math.max(1, Math.min(cfg.pictures, order.length)),
      seconds: secondsFor(cfg.count) + 2,
      gate: '.hob-zoom__btn',
      play: function (n, ctx) {
        var item = dealScene(order[n % order.length], cfg.count, rand);
        var h = play(api, {
          cfg: cfg, item: item, live: ctx.live, roundText: ctx.roundText, clock: false,
          onDone: function (r) { ctx.done(roomResult(r)); }
        });
        return { start: h.start, stop: function () { return roomResult(h.stop()); } };
      },
      describe: function () {
        return { kind: 'card', text: t('hobWatch', 'Everyone is hunting the same {n} objects', { n: cfg.count }) };
      },
      detail: function (a) {
        var line = a.found >= a.total
          ? t('spotDetailAll', 'All {n} in {time}', { n: a.total || 0, time: FF.Parallel.clock(a.usedMs || 0) })
          : t('foundOf', 'Found {f} of {n}', { f: a.found || 0, n: a.total || 0 });
        if (!a.wrong) return line;
        return line + ' · ' + (a.wrong === 1 ? t('wrongTap1', '1 wrong tap') : t('wrongTapsN', '{n} wrong taps', { n: a.wrong }));
      }
    });
  }

  function roomResult(r) {
    return { value: r.points, found: r.found, total: r.total, wrong: r.wrong, usedMs: r.usedMs };
  }

  /* ================= registration ================= */

  var ROOM = {
    defaults: STANDARD,
    fields: function () { return fields(); },
    sanitize: function (s) { return sanitize(s); },
    summary: function (s) { return summary(s); }
  };

  FF.HiddenObject = {
    COUNTS: COUNTS, PICTURES: PICTURES, SECONDS: SECONDS, MARGIN: MARGIN, MAX_ZOOM: MAX_ZOOM, STANDARD: STANDARD, ART: ART,
    defaults: defaults, sanitize: sanitize, isStandard: isStandard, secondsFor: secondsFor,
    scenes: scenes, deal: deal, dealScene: dealScene, hit: hit, points: points,
    clampView: clampView, toPicture: toPicture, zoomAt: zoomAt, isTap: isTap,
    summary: summary, fields: fields, endSummary: endSummary, ROOM: ROOM
  };

  FF.registerGame({
    id: 'hiddenObject',
    name: 'Hidden Object',
    description: 'A busy picture with a dozen things tucked into it. Find everything on your list before the clock runs out.',
    category: 'visual',
    icon: '🕵️',
    players: [1, 8],
    difficulty: 'Normal',
    duration: 3,
    tags: ['visual', 'observation', 'pictures'],
    modes: ['solo', 'turn'],
    setup: true,
    defaultMode: 'solo',
    howToPlay: [
      'A busy picture hides 12 objects. Your list says which ones to find.',
      'Tap each object on your list. Finds are circled and ticked off.',
      'Pinch, or use + and −, to zoom in, and drag to look around.',
      'Each find scores 5; a wrong tap costs 1. Find them all quickly for up to 10 more.'
    ],
    room: ROOM,
    start: function (api) {
      if (!scenes().length) {
        FF.GameUI.exitCard(api, t('hobName', 'Hidden Object'), t('needsPictures', 'This game needs its pictures, which could not be found. Please try again later.'));
        return;
      }
      if (FF.Parallel && FF.Parallel.active()) { playOnline(api); return; }
      if (api.config.daily || api.config.challenge) { playLocal(api, sanitize(STANDARD)); return; }
      FF.GameUI.setupOrReplay(api, {
        key: 'hiddenObject:setup', sanitize: sanitize,
        show: function (play) { setupScreen(api, play); },
        play: function (cfg) {
          if (!isStandard(cfg)) api.config.customRules = true;
          playLocal(api, cfg);
        }
      });
    }
  });
})();
