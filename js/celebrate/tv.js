/* PlayMona Celebrations: the TV display, /c/<event>/tv#k=<secret> (FF.CelebrateTV).
   A big screen in the room: how to join (QR code and join code), the game being played with
   every team's progress and the clock, the leaderboard, approved Wall of Love messages and the
   winners. The MC chooses the screen (live/display); "auto" follows the evening by itself:
   the game while one is played, then the welcome screen, the scores and the wall in turn.
   It never shows a message that waits for approval (the API only sends approved ones).
   One live Firebase connection; everything else comes from the PHP API every 30 s.
   Classic script, ES2017 or older. */
window.FF = window.FF || {};
(function () {
  'use strict';

  var C = function () { return FF.Celebrate; };
  var W = function () { return FF.CelebrateWall; };
  var S = function () { return FF.CelebrateStage; };
  function t(k, f, v) { return FF.t ? FF.t(k, f, v) : f; }
  function el(tag, attrs, kids) { return FF.ui.el(tag, attrs, kids); }
  function div(cls, kids) { return FF.ui.div(cls, kids); }
  function icon(k) { return FF.Icons.icon(k); }
  function list(x) { return Array.isArray(x) ? x : (x && typeof x === 'object' ? Object.keys(x).map(function (k) { return x[k]; }) : []); }
  function clock(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
  }
  function secs(ms) { var s = Math.round((ms || 0) / 1000); return s < 60 ? s + ' s' : clock(ms); }

  var SLOT_MS = { welcome: 25000, scores: 15000 };
  var MESSAGE_MS = 9000;          // each Wall of Love message stays this long
  var WALL_MAX = 5;               // messages per turn of the wall when the screen rotates
  var ENDED_MS = 60000;           // a finished game's results stay up this long in "auto"
  var POLL_MS = 30000;

  var LAYOUT_NAMES = {
    welcome: ['celTvWelcome', 'Welcome'], game: ['celTvGame', 'Game'], scores: ['celTvScores', 'Scores'],
    wall: ['celTvWall', 'Wall of Love'], winner: ['celTvWinner', 'Winners'], auto: ['celTvAuto', 'Automatic']
  };

  var PANELS_MAX = 8;   // more teams than this: progress bars instead of panels

  function start(main, slug) {
    var st = {
      id: null, ev: null, join: null, display: { layout: 'auto', showQr: true, messageId: null },
      scores: [], messages: [], last: null, pointer: null, v: null, endedSeen: 0, endedRun: null,
      slot: 0, slotAt: Date.now(), msg: 0, msgAt: Date.now(), drawn: '', cheered: '', T: null
    };
    var api = null;
    document.body.classList.add('tv-page');
    var root = div('tv');
    var stage, qr, count, fullBtn;

    main.appendChild(div('ev-loading', t('loading', 'Loading…')));
    S().open(slug, ['display', 'mc']).then(function (h) {
      api = h.api;
      st.id = h.id;
      st.ev = h.event;
      return api('GET', '/c/' + h.id + '/screen');
    }).then(function (r) {
      take(r);
      build();
      return S().connect(st.id);
    }).then(function (T) {
      st.T = T;
      T.watch('live/display', function (d) {
        if (d && d.layout) { st.display = d; render(); }
      });
      var firstScores = true;
      T.watch('live/scores', function () {
        // The first answer is what /screen just gave; later ones mean a game added points.
        if (firstScores) { firstScores = false; return; }
        poll();
      });
      T.watch('live/run', function (p) {
        var had = !!st.pointer;
        st.pointer = p && p.runId && p.template ? p : null;
        if (had && !st.pointer) poll();
        render();
      });
      T.watch('run', function (v) {
        v = v && v.runId ? v : null;
        // A game seen ending now (not one that ended before the TV was on) stays up for a minute.
        if (v && v.phase === 'ended' && st.v && st.v.runId === v.runId && st.v.phase !== 'ended') { st.endedSeen = Date.now(); st.endedRun = v.runId; }
        st.v = v;
        render();
      });
      setInterval(tick, 250);
      setInterval(function () { if (!document.hidden) poll(); }, POLL_MS);
    }).catch(function (e) {
      document.body.classList.remove('tv-page');
      S().plain(main, t('celLinkBroken', 'This link does not work'), e.message);
    });

    function take(r) {
      st.ev = r.event;
      st.join = r.join;
      if (r.display) st.display = r.display;
      st.scores = r.scores || [];
      st.messages = r.messages || [];
      st.last = r.last;
      if (!r.active) st.pointer = st.pointer && st.pointer.runId ? st.pointer : null;
    }

    function poll() {
      if (!api) return;
      api('GET', '/c/' + st.id + '/screen').then(function (r) {
        take(r);
        if (count) count.textContent = guests();
        st.drawn = '';
        render();
      }, function () { /* the next poll tries again */ });
    }

    /* ---------- the frame ---------- */

    function build() {
      FF.ui.clear(main);
      C().applyTheme(document.body, st.ev.theme);
      document.title = st.ev.title + ' · PlayMona TV';
      var head = el('header', { class: 'tv-head' });
      head.appendChild(el('strong', { class: 'tv-head__title' }, st.ev.title));
      count = el('span', { class: 'tv-head__count' }, guests());
      var right = div('tv-head__right');
      right.appendChild(icon('users'));
      right.appendChild(count);
      head.appendChild(right);
      root.appendChild(head);
      stage = el('section', { class: 'tv-stage', 'aria-live': 'polite' });
      root.appendChild(stage);
      qr = el('aside', { class: 'tv-qr', 'aria-label': t('celTvJoin', 'How to join') });
      root.appendChild(qr);
      fullBtn = el('button', { type: 'button', class: 'tv-full' });
      fullBtn.appendChild(icon('arrows-out'));
      fullBtn.appendChild(FF.ui.span('', t('celTvFull', 'Full screen')));
      fullBtn.addEventListener('click', function () {
        var d = document.documentElement;
        var go = d.requestFullscreen || d.webkitRequestFullscreen;
        if (go) { try { var p = go.call(d); if (p && p.catch) p.catch(function () {}); } catch (e) { /* not allowed here */ } }
      });
      root.appendChild(fullBtn);
      main.appendChild(root);
      drawQr();
      // The pointer and the full-screen button hide when the mouse rests.
      var idle = null;
      function wake() {
        root.classList.remove('is-idle');
        clearTimeout(idle);
        idle = setTimeout(function () { root.classList.add('is-idle'); }, 3000);
      }
      document.addEventListener('mousemove', wake);
      wake();
      keepAwake();
      render();
    }

    function guests() {
      var n = st.ev.guestCount || 0;
      return t(n === 1 ? 'celHereOne' : 'celHereMany', n === 1 ? '1 guest has joined' : '{n} guests have joined', { n: n });
    }

    function keepAwake() {
      if (!navigator.wakeLock || !navigator.wakeLock.request) return;
      function ask() { if (!document.hidden) navigator.wakeLock.request('screen').catch(function () {}); }
      ask();
      document.addEventListener('visibilitychange', ask);
    }

    function joinBlock(size) {
      var url = S().joinUrl(st.ev, st.join);
      var box = div('tv-join');
      var code = C().qrSvg(url, size, t('celQrFor', 'QR code to join {title}', { title: st.ev.title }));
      if (code) box.appendChild(div('tv-join__qr', [code]));
      var text = div('tv-join__text');
      text.appendChild(el('strong', { class: 'tv-join__lead' }, t('celTvScan', 'Scan to join')));
      text.appendChild(el('span', { class: 'tv-join__url' }, S().shortUrl(st.ev)));
      var c = el('span', { class: 'tv-join__code' });
      c.appendChild(FF.ui.span('', t('celTvCode', 'Code') + ' '));
      c.appendChild(el('b', {}, st.join.code));
      text.appendChild(c);
      box.appendChild(text);
      return box;
    }

    function drawQr() {
      FF.ui.clear(qr);
      qr.appendChild(joinBlock(220));
    }

    /* ---------- which screen ---------- */

    function message(id) {
      for (var i = 0; i < st.messages.length; i++) if (st.messages[i].id === id) return st.messages[i];
      return null;
    }

    function rotation() {
      var slots = ['welcome'];
      if (st.scores.some(function (s) { return s.points > 0; })) slots.push('scores');
      if (st.messages.length) slots.push('wall');
      return slots;
    }
    function slotMs(name) { return name === 'wall' ? Math.min(st.messages.length, WALL_MAX) * MESSAGE_MS : SLOT_MS[name]; }

    function current() {
      var d = st.display;
      if (d.messageId && message(d.messageId)) return { layout: 'message', message: message(d.messageId) };
      if (d.layout !== 'auto') return { layout: d.layout };
      if (st.pointer) return { layout: 'game' };
      if (st.v && st.v.phase === 'ended' && st.endedRun === st.v.runId && Date.now() - st.endedSeen < ENDED_MS) return { layout: 'game' };
      var slots = rotation();
      return { layout: slots[st.slot % slots.length], rotating: true };
    }

    function tick() {
      if (!stage) return;
      var now = Date.now();
      var c = current();
      if (c.rotating && now - st.slotAt >= slotMs(c.layout)) {
        st.slot++;
        st.slotAt = now;
        st.msgAt = now;
        // The wall's next turn starts with the next message.
        if (c.layout === 'wall' && st.messages.length) st.msg = (st.msg + 1) % st.messages.length;
        render();
        return;
      }
      if (!c.rotating) st.slotAt = now;
      if ((c.layout === 'wall') && st.messages.length > 1 && now - st.msgAt >= MESSAGE_MS) {
        st.msg = (st.msg + 1) % st.messages.length;
        st.msgAt = now;
        render();
        return;
      }
      if (c.layout === 'game' || c.layout === 'auto') updateClock();
    }

    function render() {
      if (!stage) return;
      var c = current();
      root.setAttribute('data-layout', c.layout);
      // The team panels need the whole screen, so the corner QR steps aside while they are up.
      qr.hidden = !st.display.showQr || c.layout === 'welcome' || c.layout === 'winner' || (c.layout === 'game' && usesPanels(st.v));
      root.classList.toggle('has-qr', !qr.hidden);
      var key = c.layout + '|' + (st.display.showQr ? 1 : 0) + '|' + JSON.stringify(dataKey(c));
      if (key === st.drawn) { updateClock(); return; }
      st.drawn = key;
      FF.ui.clear(stage);
      var screen = ({ welcome: welcome, scores: scores, wall: wall, message: one, winner: winner, game: game })[c.layout] || welcome;
      var node = screen(c);
      node.classList.add('tv-screen');
      // Same game, same phase: only the boards moved, so no fade-in (tiles land every second with many teams).
      var scene = c.layout === 'game' && st.v ? ['game', st.v.runId, st.v.phase, st.v.round, st.v.paused ? 1 : 0].join('|') : null;
      if (scene && scene === st.scene) node.classList.add('is-update');
      st.scene = scene;
      stage.appendChild(node);
      updateClock();
    }

    function dataKey(c) {
      if (c.layout === 'welcome') return [st.ev.title, st.ev.cover && st.ev.cover.play];
      if (c.layout === 'scores' || c.layout === 'winner') return st.scores.map(function (s) { return [s.teamId, s.points, s.place]; });
      if (c.layout === 'wall') return st.messages.length ? [st.messages[st.msg % st.messages.length].id, st.messages.length] : [];
      if (c.layout === 'message') return [c.message.id];
      var v = st.v;
      if (!v) return [st.pointer && st.pointer.runId];
      return [st.pointer && st.pointer.runId, v.runId, v.phase, v.round, v.paused, v.photo && v.photo.url,
        Object.keys(v.boards || {}).map(function (k) { var b = v.boards[k]; return [k, b.correct, b.solved, placed(b).join('')]; }),
        list(v.results).length, v.result ? 1 : 0];
    }

    /* ---------- the screens ---------- */

    function welcome() {
      var ev = st.ev;
      var box = div('tv-welcome' + (st.display.showQr ? ' has-qr' : ''));
      var info = div('tv-welcome__info');
      if (ev.cover && ev.cover.play) info.appendChild(el('img', { class: 'tv-welcome__cover', src: ev.cover.play, alt: '' }));
      info.appendChild(el('p', { class: 'tv-kicker' }, C().typesLabel(ev)));
      info.appendChild(el('h1', { class: 'tv-welcome__name' }, ev.celebrantName));
      info.appendChild(el('p', { class: 'tv-welcome__title' }, ev.title));
      var facts = [C().formatDate(ev.date), C().timeRange(ev), ev.venue].filter(Boolean).join('  ·  ');
      if (facts) info.appendChild(el('p', { class: 'tv-welcome__facts' }, facts));
      info.appendChild(el('p', { class: 'tv-welcome__count' }, guests()));
      box.appendChild(info);
      if (st.display.showQr) {
        var join = joinBlock(420);
        join.classList.add('tv-join--big');
        box.appendChild(join);
      }
      return box;
    }

    /* Many teams: smaller rows, and two columns from nine teams, so every team fits on the screen. */
    function rowsClass(n) { return 'tv-rows' + (n > 4 ? ' is-many' : '') + (n > 8 ? ' is-lots' : ''); }

    function teamRow(s, extra) {
      var li = el('li', { class: 'tv-row' + (s.place === 1 && s.points > 0 ? ' is-first' : '') });
      li.style.setProperty('--team', s.color || '#888888');
      li.appendChild(el('span', { class: 'tv-row__place' }, String(s.place || '')));
      li.appendChild(el('span', { class: 'tv-row__swatch', 'aria-hidden': 'true' }));
      li.appendChild(el('strong', { class: 'tv-row__name' }, s.name));
      if (extra) li.appendChild(extra);
      li.appendChild(el('span', { class: 'tv-row__pts' }, t('celPoints', '{n} points', { n: s.points })));
      return li;
    }

    function scores() {
      var box = div('tv-scores');
      box.appendChild(el('h1', { class: 'tv-h1' }, t('celLeaderboard', 'Leaderboard')));
      var any = st.scores.some(function (s) { return s.points > 0; });
      if (!any) {
        box.appendChild(el('p', { class: 'tv-lead' }, t('celTvNoPoints', 'No points yet. The first game decides!')));
      }
      var ol = el('ol', { class: rowsClass(st.scores.length) });
      st.scores.forEach(function (s) { ol.appendChild(teamRow(s)); });
      box.appendChild(ol);
      return box;
    }

    function messageCard(m, solo) {
      var cat = W().category(m.category);
      var card = div('tv-msg' + (m.photo ? ' has-photo' : '') + (m.body.length > 280 ? ' is-long' : m.body.length < 90 ? ' is-short' : ''));
      if (m.photo) card.appendChild(el('img', { class: 'tv-msg__photo', src: m.photo.play, alt: '' }));
      var text = div('tv-msg__text');
      var tag = el('p', { class: 'tv-msg__tag' });
      tag.appendChild(icon(cat.icon));
      tag.appendChild(FF.ui.span('', W().label(cat.label)));
      text.appendChild(tag);
      text.appendChild(el('blockquote', { class: 'tv-msg__body' }, m.body));
      text.appendChild(el('p', { class: 'tv-msg__by' }, '— ' + W().byline(m)));
      card.appendChild(text);
      if (solo) card.classList.add('is-solo');
      return card;
    }

    function wall() {
      var box = div('tv-wall');
      box.appendChild(el('h1', { class: 'tv-h1' }, t('celTvWallFor', 'Messages for {name}', { name: st.ev.celebrantName })));
      if (!st.messages.length) {
        box.appendChild(el('p', { class: 'tv-lead' }, t('celTvWallEmpty', 'Scan the code and leave a message for {name}. It goes into the memory book.', { name: st.ev.celebrantName })));
        return box;
      }
      var i = st.msg % st.messages.length;
      box.appendChild(messageCard(st.messages[i]));
      if (st.messages.length > 1) {
        var dots = div('tv-dots');
        var n = Math.min(st.messages.length, 12);
        for (var k = 0; k < n; k++) dots.appendChild(el('span', { class: k === i % n ? 'is-on' : '' }));
        box.appendChild(dots);
      }
      return box;
    }

    function one(c) {
      var box = div('tv-wall tv-wall--solo');
      box.appendChild(el('h1', { class: 'tv-h1' }, t('celTvWallFor', 'Messages for {name}', { name: st.ev.celebrantName })));
      box.appendChild(messageCard(c.message, true));
      return box;
    }

    function winner() {
      var box = div('tv-winner');
      var top = st.scores.filter(function (s) { return s.place === 1 && s.points > 0; });
      if (!top.length) {
        box.appendChild(el('h1', { class: 'tv-h1' }, t('celTvNoWinner', 'No winners yet')));
        box.appendChild(el('p', { class: 'tv-lead' }, t('celTvNoWinnerText', 'Play a game to put points on the board.')));
        return box;
      }
      var trophy = div('tv-winner__trophy');
      trophy.appendChild(icon('trophy'));
      box.appendChild(trophy);
      box.appendChild(el('p', { class: 'tv-kicker' }, top.length > 1 ? t('celTvTie', 'It is a tie!') : t('celTvChampions', 'The champions')));
      var names = div('tv-winner__names');
      top.forEach(function (s) {
        var n = el('strong', { class: 'tv-winner__name' }, s.name);
        n.style.setProperty('--team', s.color);
        names.appendChild(n);
      });
      box.appendChild(names);
      box.appendChild(el('p', { class: 'tv-lead' }, t('celPoints', '{n} points', { n: top[0].points })));
      var rest = st.scores.filter(function (s) { return top.indexOf(s) === -1; }).slice(0, 3);
      if (rest.length) {
        var ol = el('ol', { class: 'tv-rows tv-rows--small' });
        rest.forEach(function (s) { ol.appendChild(teamRow(s)); });
        box.appendChild(ol);
      }
      cheer('winner:' + top.map(function (s) { return s.teamId + s.points; }).join(','));
      return box;
    }

    function cheer(key) {
      if (st.cheered === key || !FF.Confetti) return;
      st.cheered = key;
      setTimeout(function () { FF.Confetti.burst(220); }, 300);
      setTimeout(function () { FF.Confetti.sideCannons(); }, 1400);
    }

    /* ---------- the game ---------- */

    function game() {
      var v = st.v;
      var p = st.pointer;
      if (!p && !(v && v.phase === 'ended')) {
        var none = div('tv-game tv-game--none');
        none.appendChild(el('h1', { class: 'tv-h1' }, t('celTvNoGame', 'No game right now')));
        none.appendChild(el('p', { class: 'tv-lead' }, t('celTvNoGameText', 'The next game starts soon. Join now so your team is ready!')));
        return none;
      }
      if (!v || (p && v.runId !== p.runId)) {
        var wait = div('tv-game');
        wait.appendChild(el('p', { class: 'tv-kicker' }, t('celTvGetReady', 'Get ready!')));
        wait.appendChild(el('h1', { class: 'tv-h1' }, p.name));
        return wait;
      }
      if (v.template === 'pictureRush') return pictureRush(v);
      var other = div('tv-game');
      other.appendChild(el('h1', { class: 'tv-h1' }, v.name || ''));
      return other;
    }

    function teamsOf(v) {
      var totals = v.totals || {};
      return Object.keys(v.teams || {}).map(function (id) {
        var tm = v.teams[id];
        return { id: id, name: tm.name, color: tm.color, points: (totals[id] || {}).points || 0, board: (v.boards || {})[id] || {} };
      });
    }

    function pictureRush(v) {
      var box = div('tv-game tv-pr is-' + v.phase + (v.paused ? ' is-paused' : ''));
      var head = div('tv-game__head');
      head.appendChild(el('h1', { class: 'tv-game__name' }, v.name));
      if (v.phase !== 'starting' && v.phase !== 'ended') {
        head.appendChild(el('span', { class: 'tv-chip' }, t('celTvPictureOf', 'Picture {n} of {total}', { n: v.round + 1, total: v.rounds })));
      }
      head.appendChild(el('span', { class: 'tv-timer', role: 'timer' }));
      box.appendChild(head);

      if (v.phase === 'starting') {
        var s = div('tv-pr__start');
        s.appendChild(el('p', { class: 'tv-kicker' }, t('celTvGetReady', 'Get ready!')));
        s.appendChild(el('p', { class: 'tv-pr__big tv-timer', role: 'timer' }));
        if (v.instructions) s.appendChild(el('p', { class: 'tv-lead' }, v.instructions));
        box.appendChild(s);
      } else if (v.phase === 'reveal') {
        var r = div('tv-pr__reveal');
        r.appendChild(el('p', { class: 'tv-kicker' }, t('celTvRemember', 'Remember this picture!')));
        if (v.photo && v.photo.url) r.appendChild(el('img', { class: 'tv-pr__photo', src: v.photo.url, alt: '' }));
        box.appendChild(r);
      } else if (v.phase === 'playing') {
        box.appendChild(usesPanels(v) ? panels(v) : progress(v));
      } else if (v.phase === 'roundEnd') {
        box.appendChild(roundTable(v));
      } else if (v.phase === 'ended') {
        box.appendChild(finalTable(v));
      }
      if (v.paused) box.appendChild(el('p', { class: 'tv-paused' }, t('celPausedNow', 'Paused.')));
      return box;
    }

    function usesPanels(v) {
      if (!v || v.template !== 'pictureRush' || v.phase !== 'playing') return false;
      if (st.pointer && v.runId !== st.pointer.runId) return false;
      var n = teamsOf(v).length;
      return n >= 1 && n <= PANELS_MAX;
    }

    /* Which squares hold their own tile (1) and which do not (0). */
    function placed(b) { return list(b.tiles).map(function (piece, pos) { return Number(piece) === pos ? 1 : 0; }); }

    /* One panel per team: their board as a grid with the tiles already in place lit in the team's colour.
       The picture itself never shows here (it comes with the round's results), so nobody can copy from the TV. */
    function panels(v) {
      var teams = teamsOf(v);
      var n = teams.length;
      var cols = n <= 2 ? n : n <= 4 ? 2 : n <= 6 ? 3 : 4;
      var wrap = el('ul', { class: 'tv-panels' + (n > 4 ? ' is-many' : '') });
      wrap.style.setProperty('--cols', cols);
      teams.forEach(function (tm) {
        var b = tm.board;
        var marks = placed(b);
        var size = v.size || Math.round(Math.sqrt(marks.length)) || 1;
        var total = marks.length || size * size;
        var ok = marks.filter(Boolean).length;
        var li = el('li', { class: 'tv-panel' + (b.solved ? ' is-done' : '') });
        li.style.setProperty('--team', tm.color);
        var head = div('tv-panel__head');
        head.appendChild(el('strong', { class: 'tv-panel__name' }, tm.name));
        head.appendChild(el('span', { class: 'tv-panel__note' }, b.solved
          ? t('celTvSolvedIn', 'Done in {time}!', { time: secs(b.usedMs) })
          : ok + ' / ' + total));
        li.appendChild(head);
        var body = div('tv-panel__body');
        // A finished board stays a fully lit grid: the picture waits for the end of the round,
        // so teams still solving cannot copy it from the TV.
        var grid = el('div', { class: 'tv-grid', role: 'img', 'aria-label': b.solved
          ? t('celTvSolvedPic', '{team} finished the picture', { team: tm.name })
          : t('celTilesOf', '{n} of {total} tiles in place', { n: ok, total: total }) });
        grid.style.setProperty('--size', size);
        for (var i = 0; i < total; i++) grid.appendChild(el('span', { class: 'tv-cell' + (b.solved || marks[i] ? ' is-ok' : '') }));
        body.appendChild(grid);
        if (b.solved) body.appendChild(el('span', { class: 'tv-panel__done', 'aria-hidden': 'true' }, '✓'));
        li.appendChild(body);
        wrap.appendChild(li);
      });
      return wrap;
    }

    function progress(v) {
      var ul = el('ul', { class: 'tv-bars' });
      teamsOf(v).forEach(function (tm) {
        var b = tm.board;
        var total = list(b.tiles).length || 1;
        var li = el('li', { class: 'tv-bar' + (b.solved ? ' is-done' : '') });
        li.style.setProperty('--team', tm.color);
        li.appendChild(el('strong', { class: 'tv-bar__name' }, tm.name));
        var track = el('span', { class: 'tv-bar__track', role: 'img', 'aria-label': t('celTilesOf', '{n} of {total} tiles in place', { n: b.correct || 0, total: total }) });
        var fill = el('span', { class: 'tv-bar__fill' });
        fill.style.width = Math.round(100 * (b.correct || 0) / total) + '%';
        track.appendChild(fill);
        li.appendChild(track);
        li.appendChild(el('span', { class: 'tv-bar__note' }, b.solved
          ? t('celTvSolvedIn', 'Done in {time}!', { time: secs(b.usedMs) })
          : (b.correct || 0) + ' / ' + total));
        ul.appendChild(li);
      });
      return ul;
    }

    function roundTable(v) {
      var wrap = div('tv-pr__round');
      if (v.photo && v.photo.url) {
        var fig = el('figure', { class: 'tv-pr__fig' });
        fig.appendChild(el('img', { class: 'tv-pr__photo', src: v.photo.url, alt: '' }));
        if (v.photo.title) fig.appendChild(el('figcaption', {}, v.photo.title));
        wrap.appendChild(fig);
      }
      var row = list(v.results).filter(function (r) { return r.round === v.round; })[0] || { teams: {} };
      var teams = teamsOf(v).map(function (tm) {
        var x = row.teams[tm.id] || {};
        return { teamId: tm.id, name: tm.name, color: tm.color, points: x.points || 0, solved: !!x.solved, usedMs: x.usedMs || 0 };
      });
      teams.sort(function (a, b) { return b.points - a.points || a.usedMs - b.usedMs; });
      var ol = el('ol', { class: rowsClass(teams.length) });
      teams.forEach(function (s, i) {
        s.place = i > 0 && teams[i - 1].points === s.points && teams[i - 1].usedMs === s.usedMs ? teams[i - 1].place : i + 1;
        ol.appendChild(teamRow(s, el('span', { class: 'tv-row__note' }, s.solved ? secs(s.usedMs) : t('celTvNotDone', 'not finished'))));
      });
      var side = div('tv-pr__table');
      side.appendChild(el('h2', { class: 'tv-h2' }, t('celTvThisRound', 'This picture')));
      side.appendChild(ol);
      wrap.appendChild(side);
      return wrap;
    }

    function finalTable(v) {
      var res = v.result || {};
      var rows = list(res.rows);
      var teams = {};
      teamsOf(v).forEach(function (tm) { teams[tm.id] = tm; });
      var scored = rows.some(function (r) { return r.points > 0; });
      var wrap = div('tv-pr__final');
      var names = list(res.winners).map(function (id) { return (teams[id] || {}).name; }).filter(Boolean);
      if (scored && names.length) {
        var tro = div('tv-winner__trophy');
        tro.appendChild(icon('trophy'));
        wrap.appendChild(tro);
        wrap.appendChild(el('p', { class: 'tv-kicker' }, names.length > 1 ? t('celTvTie', 'It is a tie!') : t('celTvWinsGame', 'Winner')));
        wrap.appendChild(el('p', { class: 'tv-pr__winners' }, names.join(' & ')));
        cheer('game:' + v.runId);
      } else {
        wrap.appendChild(el('p', { class: 'tv-lead' }, t('celNoScore', 'The game is over. Nobody scored this time.')));
      }
      var ol = el('ol', { class: rowsClass(rows.length) });
      rows.forEach(function (r) {
        var tm = teams[r.teamId] || {};
        ol.appendChild(teamRow({ place: r.place, name: tm.name || '', color: tm.color, points: r.points }));
      });
      wrap.appendChild(ol);
      return wrap;
    }

    function updateClock() {
      var v = st.v;
      var timers = stage ? stage.querySelectorAll('.tv-timer') : [];
      if (!timers.length) return;
      var text = '';
      if (v && st.T && v.phase !== 'ended') {
        var due = { starting: v.startAt, reveal: v.revealUntil, playing: v.deadline, roundEnd: v.nextAt }[v.phase] || 0;
        if (due) text = clock(due - (v.paused ? v.pausedAt : st.T.serverNow()));
      }
      for (var i = 0; i < timers.length; i++) timers[i].textContent = text;
    }
  }

  FF.CelebrateTV = { start: start, LAYOUT_NAMES: LAYOUT_NAMES };
})();
