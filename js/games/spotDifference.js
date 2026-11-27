/* ============================================================
   PLAYMONA — games/spotDifference.js
   Spot the Difference: two copies of a busy picture, the second with
   changes. Tap each change, on either picture; a find is circled on both.
   Side by side on wide screens; on phones one picture at a time, swiped
   (or switched with Original / Changed).

   - Each pair has 10 changes. The level picks how many count (Easy 5,
     Normal 7, Hard 10); the others are painted back from picture A.
   - Solo, or pass and play (everyone gets the same picture and spots).
   - Online rooms: a parallel challenge (js/net/parallel.js); every phone
     deals the same picture and spots from the round seed.
   - Leaderboards, the daily game and friend challenges play the
     standard settings.
   - Pictures and spots: js/data/spotDifference.js; a pair is used once
     both its pictures are in the asset manifest (games/spotDifference).

   The pure rules are FF.SpotDifference (tools/test/spotDifference.test.js).
   Looks: css/games.css (.sdx-*).
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  function t(key, fallback, vars) { return FF.t ? FF.t(key, fallback, vars) : String(fallback); }

  /* ================= rules (pure, tested) ================= */

  var COUNTS = [5, 7, 10];
  var PICTURES = [1, 3];
  var SECONDS = { 5: 90, 7: 120, 10: 150 };
  var FIND = 5;                // a difference found
  var WRONG = 1;               // a tap on no difference
  var SPEED = 10;              // the most for finding them all quickly
  var MARGIN = 0.03;           // finger room round each spot, as a share of the picture
  var ART = 'games/spotDifference';

  function pickOf(list, v, fallback) { return list.indexOf(v) !== -1 ? v : fallback; }

  function defaults(difficulty) {
    return { count: difficulty === 'easy' ? 5 : difficulty === 'hard' ? 10 : 7, pictures: 1 };
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

  function secondsFor(count) { return SECONDS[count] || SECONDS[7]; }

  function hasArt(id) {
    var m = FF.AssetManifest && FF.AssetManifest[ART];
    return !!(m && m[id + '-a'] && m[id + '-b']);
  }

  function pairs() {
    var list = (FF.data && FF.data.spotDifference && FF.data.spotDifference.pairs) || [];
    return list.filter(function (p) { return hasArt(p.id); }).map(function (p) {
      return { id: p.id, name: t('sdxPic_' + p.id.replace(/-/g, '_'), p.name), spots: p.spots };
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

  /* One pair with `count` of its spots live, chosen by rand(). Spots that
     share a group `g` overlap (a canoe and the rod lying across it), so they
     are live together or painted back together: painting one back would
     cover part of the other. Tries a few shuffles to hit the count exactly. */
  function dealPair(pair, count, rand) {
    var units = [], groups = {};
    pair.spots.forEach(function (s, i) {
      if (s.g == null) { units.push([i]); return; }
      if (!groups[s.g]) { groups[s.g] = []; units.push(groups[s.g]); }
      groups[s.g].push(i);
    });
    var want = Math.min(count, pair.spots.length), active = [];
    for (var tries = 0; tries < 40 && active.length !== want; tries++) {
      active = [];
      shuffle(units, rand).forEach(function (u) {
        if (active.length + u.length <= want) active = active.concat(u);
      });
    }
    return { id: pair.id, name: pair.name, spots: pair.spots, active: active.sort(function (a, b) { return a - b; }) };
  }

  /* The pictures for a game: cfg.pictures different pairs (fewer if there aren't enough). */
  function deal(cfg, rand) {
    return shuffle(pairs(), rand).slice(0, cfg.pictures).map(function (p) { return dealPair(p, cfg.count, rand); });
  }

  /* A tap at (u, v), 0..1 across the picture: the live spot it found, -2 for
     a spot already found (no penalty), or -1 for a miss. */
  function hit(item, found, u, v) {
    var best = -1, bestD = Infinity, again = false;
    item.active.forEach(function (i) {
      var b = item.spots[i].b;
      if (u < b[0] - MARGIN || u > b[0] + b[2] + MARGIN || v < b[1] - MARGIN || v > b[1] + b[3] + MARGIN) return;
      if (found[i]) { again = true; return; }
      var d = Math.pow(u - (b[0] + b[2] / 2), 2) + Math.pow(v - (b[1] + b[3] / 2), 2);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best !== -1 ? best : again ? -2 : -1;
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

  function pct(v) { return (+(v * 100).toFixed(3)) + '%'; }

  /* Picture A shown over one spot of picture B, fading out at its edges
     (but not against the picture's own edge), so the change disappears. */
  function patchStyle(spot, urlA) {
    var b = spot.b, p = spot.p;
    function fade(dir, near, far, size, atStart, atEnd) {
      var a = atStart ? 0 : near / size, z = atEnd ? 0 : far / size;
      return 'linear-gradient(' + dir + ', ' + (a ? 'transparent 0%, ' : '') + '#000 ' + pct(a) + ', #000 ' + pct(1 - z) +
        ', ' + (z ? 'transparent' : '#000') + ' 100%)';
    }
    var mask = fade('to right', b[0] - p[0], (p[0] + p[2]) - (b[0] + b[2]), p[2], p[0] <= 0, p[0] + p[2] >= 0.999) + ', ' +
      fade('to bottom', b[1] - p[1], (p[1] + p[3]) - (b[1] + b[3]), p[3], p[1] <= 0, p[1] + p[3] >= 0.999);
    return {
      left: pct(p[0]), top: pct(p[1]), width: pct(p[2]), height: pct(p[3]),
      backgroundImage: 'url("' + urlA + '")',
      backgroundSize: pct(1 / p[2]) + ' ' + pct(1 / p[3]),
      backgroundPosition: pct(p[2] >= 1 ? 0 : p[0] / (1 - p[2])) + ' ' + pct(p[3] >= 1 ? 0 : p[1] / (1 - p[3])),
      maskImage: mask, webkitMaskImage: mask,
      maskComposite: 'intersect', webkitMaskComposite: 'source-in'
    };
  }

  /* ================= labels and settings ================= */

  function summary(s) {
    var c = sanitize(s);
    var txt = t('sdxNDiffs', '{n} differences', { n: c.count });
    return c.pictures > 1 ? txt + ' · ' + t('sdxNPics', '{n} pictures', { n: c.pictures }) : txt;
  }

  function fields() {
    function opt(label, value) { return { label: label, value: value }; }
    var list = [{ key: 'count', label: t('sdxDiffs', 'Differences'), options: COUNTS.map(function (n) { return opt(String(n), n); }) }];
    if (pairs().length >= PICTURES[PICTURES.length - 1]) {
      list.push({ key: 'pictures', label: t('sdxPictures', 'Pictures'), options: PICTURES.map(function (n) { return opt(String(n), n); }) });
    }
    return list;
  }

  /* ================= one picture on one phone ================= */

  function rand() { return FF._rand ? FF._rand() : Math.random(); }
  function now() { return Date.now(); }
  function picUrl(id, side) { return FF.Assets ? FF.Assets.artPath(ART, id + '-' + side) : 'assets/images/' + ART + '/' + id + '-' + side + '.webp'; }
  function stillShown(api) { return !!(api.shell.root && (!document.body || !document.body.contains || document.body.contains(api.shell.root))); }

  function box(b, cls) {
    return FF.ui.el('div', { class: cls, style: { left: pct(b[0]), top: pct(b[1]), width: pct(b[2]), height: pct(b[3]) } });
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

    var stage = FF.GameUI.stage({ center: true, className: 'sdx' });
    if (o.live) stage.appendChild(o.live);
    stage.appendChild(FF.GameUI.turnBar(o.turnEntity || null, o.roundText || null));
    var meta = FF.ui.div('gm-turnbar sdx-meta');
    meta.appendChild(FF.GameUI.pill(item.name, 'image'));
    var countEl = FF.GameUI.pill('', 'magnifying-glass');
    countEl.setAttribute('aria-live', 'polite');
    meta.appendChild(countEl);
    stage.appendChild(meta);
    var chip = FF.ui.div('sdx-msg', '');
    chip.setAttribute('aria-live', 'polite');
    stage.appendChild(chip);

    // Phones: a switch between the pictures (they also swipe).
    var sw = FF.ui.div('sdx-switch');
    sw.setAttribute('role', 'tablist');
    var swBtns = [t('original', 'Original'), t('sdxChanged', 'Changed')].map(function (label, i) {
      var btn = FF.ui.el('button', { type: 'button', class: 'sdx-switch__btn', role: 'tab', onclick: function () { show(i, true); } }, label);
      sw.appendChild(btn);
      return btn;
    });
    stage.appendChild(sw);

    var track = FF.ui.div('sdx-track is-waiting');
    var frames = ['a', 'b'].map(function (side) {
      var panel = FF.ui.div('sdx-panel');
      panel.appendChild(FF.ui.div('sdx-label', side === 'a' ? t('original', 'Original') : t('sdxChanged', 'Changed')));
      var frame = FF.ui.div('sdx-frame');
      frame.appendChild(FF.ui.el('img', { class: 'sdx-img', src: picUrl(item.id, side), alt: side === 'a' ? t('original', 'Original') : t('sdxChanged', 'Changed'), draggable: 'false' }));
      if (side === 'b') {
        item.spots.forEach(function (s, i) {
          if (item.active.indexOf(i) === -1) frame.appendChild(FF.ui.el('div', { class: 'sdx-patch', style: patchStyle(s, picUrl(item.id, 'a')), 'aria-hidden': 'true' }));
        });
      }
      var marks = FF.ui.div('sdx-marks');
      frame.appendChild(marks);
      frame.addEventListener('click', function (e) { onTap(frame, e); });
      panel.appendChild(frame);
      track.appendChild(panel);
      return { frame: frame, marks: marks };
    });
    stage.appendChild(track);

    var foot = FF.ui.div('sdx-foot');
    stage.appendChild(foot);
    root.appendChild(stage);

    var current = 1;
    function show(i, scroll) {
      current = i;
      swBtns.forEach(function (btn, j) {
        btn.classList.toggle('is-on', j === i);
        btn.setAttribute('aria-selected', j === i ? 'true' : 'false');
      });
      if (scroll && track.scrollTo) track.scrollTo({ left: i * track.clientWidth, behavior: 'smooth' });
    }
    track.addEventListener('scroll', function () {
      if (!track.clientWidth) return;
      var i = Math.round(track.scrollLeft / track.clientWidth);
      if (i !== current) show(i, false);
    });
    show(1, false);
    // Start on the changed picture on phones (it's the one with the differences).
    setTimeout(function () { if (track.scrollWidth > track.clientWidth + 4) track.scrollLeft = track.clientWidth; }, 0);

    function later(fn, ms) {
      var id = setTimeout(function () { timers.splice(timers.indexOf(id), 1); fn(); }, ms);
      timers.push(id);
    }

    function paintCount() {
      FF.ui.clear(countEl);
      countEl.appendChild(FF.Icons.icon('magnifying-glass'));
      countEl.appendChild(document.createTextNode(t('foundOf', 'Found {f} of {n}', { f: foundCount, n: total })));
    }

    function ring(i, cls) {
      frames.forEach(function (f) { f.marks.appendChild(box(item.spots[i].b, 'sdx-ring' + (cls ? ' ' + cls : ''))); });
    }

    function onTap(frame, e) {
      if (phase !== 'play') return;
      var r = frame.getBoundingClientRect();
      if (!r.width || !r.height) return;
      var u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height;
      var i = hit(item, found, u, v);
      if (i === -2) return;
      if (i === -1) {
        wrong++;
        api.audio.play('wrong');
        var miss = FF.ui.el('div', { class: 'sdx-miss', style: { left: pct(u), top: pct(v) } });
        miss.appendChild(FF.Icons.icon('x'));
        frame.querySelector('.sdx-marks').appendChild(miss);
        later(function () { if (miss.parentNode) miss.parentNode.removeChild(miss); }, 700);
        chip.className = 'sdx-msg is-out';
        chip.textContent = t('sdxMiss', 'Not there: −{n}', { n: WRONG });
        return;
      }
      found[i] = true;
      foundCount++;
      api.audio.play('correct');
      ring(i);
      paintCount();
      chip.className = 'sdx-msg is-good';
      chip.textContent = item.spots[i].l ? t('sdxSpot_' + item.id.replace(/-/g, '_') + '_' + i, item.spots[i].l) : t('correct', 'Correct!');
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
      track.classList.add('is-done');
      item.active.forEach(function (i) { if (!found[i]) ring(i, 'is-missed'); });
      if (result.found >= total) {
        api.audio.play('winner');
        chip.className = 'sdx-msg is-good';
        chip.textContent = t('sdxAllFound', 'All {n} found! +{p}', { n: total, p: FF.util.formatNumber(result.points) });
      } else {
        api.audio.play('roundEnd');
        chip.className = 'sdx-msg is-out';
        chip.textContent = t('sdxTimeUp', 'Time’s up: {f} of {n} found. +{p}', { f: result.found, n: total, p: FF.util.formatNumber(result.points) });
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
    chip.textContent = t('sdxGetReady', 'Get ready…');

    return {
      start: function () {
        if (phase !== 'wait') return;
        phase = 'play';
        startedAt = now();
        track.classList.remove('is-waiting');
        chip.className = 'sdx-msg';
        chip.textContent = t('sdxHow', 'Tap each change, on either picture');
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
    var saved = (FF.Storage && FF.Storage.get('spotDifference:setup', null)) || null;
    var gs = sanitize(Object.assign({}, defaults(api.config.difficulty), saved || {}));
    var stage = FF.GameUI.stage({ center: true, className: 'sdx sq-setup' });
    stage.appendChild(FF.GameUI.kicker(t('sdxName', 'Spot the Difference')));
    stage.appendChild(FF.GameUI.prompt(t('sdxSetupTitle', 'Find what changed in the picture'), 'md'));
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
      box.appendChild(FF.ui.el('p', { class: 'gm-note sq-setup__hint' }, t('sdxHowNote', 'Tap a change on either picture. More differences score more; wrong taps cost points.')));
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
      try { if (FF.Storage) FF.Storage.set('spotDifference:setup', cfg); } catch (e) { /* storage full */ }
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
    var stage = FF.GameUI.stage({ center: true, className: 'sdx nr-pass' });
    stage.appendChild(FF.GameUI.turnBar(who, roundText));
    var ava = FF.ui.div('nr-pass__ava');
    ava.appendChild(FF.Players.avatarEl(who, 'nr-pass__img'));
    stage.appendChild(ava);
    stage.appendChild(FF.GameUI.prompt(t('nrPassTo', 'Pass to {name}', { name: who.name }), 'md'));
    stage.appendChild(FF.GameUI.sub(t('sdxPassSub', 'Same picture, same differences for everyone. No peeking while others play!')));
    stage.appendChild(FF.GameUI.action(t('nrReady', 'I’m ready'), function () { api.audio.play('select'); onReady(); }, { icon: 'play' }));
    root.appendChild(stage);
    if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(stage);
  }

  function playLocal(api, cfg) {
    var list = (api.config.scorers || []).slice();
    if (!list.length) list = [{ id: 'me', name: t('you', 'You') }];
    var multi = list.length > 1 && api.config.mode !== 'solo';
    if (!multi) list = list.slice(0, 1);
    var dealt = deal(cfg, rand);     // one deal: everyone gets the same pictures and spots
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

  function results(api, cfg, runs) {
    var root = api.shell.root;
    api.shell.hideTimer();
    FF.ui.clear(root);
    var ranked = runs.slice().sort(function (a, b) { return b.points - a.points || b.found - a.found; });
    var place = 0, prev = null;
    ranked.forEach(function (r, i) {
      if (!prev || prev.points !== r.points || prev.found !== r.found) place = i + 1;
      r.place = place;
      prev = r;
    });
    var top = ranked[0];
    var tie = ranked.length > 1 && ranked[1].place === 1;
    var solo = ranked.length === 1;
    var stage = FF.GameUI.stage({ center: true, className: 'sdx nr-results' });
    var title;
    if (solo) title = top.found >= top.total ? t('sdxAllSpotted', 'You spotted them all!') : t('sdxSoloN', '{f} of {n} spotted', { f: top.found, n: top.total });
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
      var whoEl = FF.ui.span('nr-row__who');
      whoEl.appendChild(FF.ui.span('nr-row__name', r.who.name));
      whoEl.appendChild(FF.ui.span('nr-row__status', t('sdxSoloN', '{f} of {n} spotted', { f: r.found, n: r.total })));
      li.appendChild(whoEl);
      li.appendChild(FF.ui.span('nr-row__pts', FF.util.formatNumber(r.points)));
      table.appendChild(li);
    });
    stage.appendChild(table);
    stage.appendChild(FF.GameUI.action(t('seeResults', 'See results'), function () {
      api.audio.play('select');
      api.end({
        results: ranked.map(function (r) {
          return { id: r.who.id, name: r.who.name, avatar: r.who.avatar, color: r.who.color, photo: r.who.photo, points: r.points, correct: r.found };
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
    // The order of pictures comes from the room's seed; each round's spots from that round's seed.
    FF.Parallel.seed(api, 'pictures');
    var order = shuffle(pairs(), rand);
    FF.Parallel.run(api, {
      rounds: Math.max(1, Math.min(cfg.pictures, order.length)),
      seconds: secondsFor(cfg.count) + 2,
      gate: '.sdx-switch__btn',
      play: function (n, ctx) {
        var item = dealPair(order[n % order.length], cfg.count, rand);
        var h = play(api, {
          cfg: cfg, item: item, live: ctx.live, roundText: ctx.roundText, clock: false,
          onDone: function (r) { ctx.done(roomResult(r)); }
        });
        return { start: h.start, stop: function () { return roomResult(h.stop()); } };
      },
      describe: function () {
        return { kind: 'card', text: t('spotWatch', 'Everyone is hunting the same {n} differences', { n: cfg.count }) };
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

  FF.SpotDifference = {
    COUNTS: COUNTS, PICTURES: PICTURES, SECONDS: SECONDS, MARGIN: MARGIN, STANDARD: STANDARD, ART: ART,
    defaults: defaults, sanitize: sanitize, isStandard: isStandard, secondsFor: secondsFor,
    pairs: pairs, deal: deal, dealPair: dealPair, hit: hit, points: points, patchStyle: patchStyle,
    summary: summary, fields: fields, ROOM: ROOM
  };

  FF.registerGame({
    id: 'spotDifference',
    name: 'Spot the Difference',
    description: 'Two copies of a busy picture, one with sneaky changes. Tap every difference before the clock runs out.',
    category: 'visual',
    icon: '🔍',
    players: [1, 8],
    difficulty: 'Normal',
    duration: 3,
    tags: ['visual', 'observation', 'pictures'],
    modes: ['solo', 'turn'],
    defaultMode: 'solo',
    howToPlay: [
      'Two pictures look the same, but the second has changes.',
      'Tap each change on either picture. Each find is circled on both.',
      'On a phone, swipe (or use Original / Changed) to flip between them.',
      'Each find scores 5; a wrong tap costs 1. Find them all quickly for up to 10 more.'
    ],
    room: ROOM,
    start: function (api) {
      if (!pairs().length) {
        FF.GameUI.exitCard(api, t('sdxName', 'Spot the Difference'), t('needsPictures', 'This game needs its pictures, which could not be found. Please try again later.'));
        return;
      }
      if (FF.Parallel && FF.Parallel.active()) { playOnline(api); return; }
      if (api.config.daily || api.config.challenge) { playLocal(api, sanitize(STANDARD)); return; }
      setupScreen(api, function (cfg) {
        if (!isStandard(cfg)) api.config.customRules = true;
        playLocal(api, cfg);
      });
    }
  });
})();
