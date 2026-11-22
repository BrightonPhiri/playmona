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
    welcome: ['celTvWelcome', 'Welcome'], programme: ['celTvProgramme', 'Programme'], game: ['celTvGame', 'Game'], scores: ['celTvScores', 'Scores'],
    wall: ['celTvWall', 'Wall of Love'], winner: ['celTvWinner', 'Winners'], auto: ['celTvAuto', 'Automatic']
  };

  var PANELS_MAX = 8;   // more teams than this: progress bars instead of panels

  function start(main, slug) {
    var st = {
      id: null, ev: null, join: null, display: { layout: 'auto', showQr: true, messageId: null },
      scores: [], messages: [], slideImages: [], stopSlide: null, last: null, pointer: null, v: null, endedSeen: 0, endedRun: null,
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
        if (!d || !d.layout) return;
        st.display = d;
        // New slide pictures: their signed addresses come from the API.
        var want = FF.CelebrateSlide.normal(d.slide).mediaIds.join(','), have = st.slideImages.map(function (m) { return m.id; }).join(',');
        if (want !== have) { poll(); return; }
        render();
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
      st.slideImages = r.slideImages || [];
      st.last = r.last;
      if (!r.active) st.pointer = st.pointer && st.pointer.runId ? st.pointer : null;
    }

    function poll() {
      if (!api) return;
      api('GET', '/c/' + st.id + '/screen').then(function (r) {
        take(r);
        if (count) count.textContent = guests();
        // The programme slide redraws only when it changed (dataKey), so a slideshow keeps going.
        if (current().layout !== 'programme') st.drawn = '';
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
      return FF.Celebrate.joinedText(st.ev);
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
      qr.hidden = !st.display.showQr || c.layout === 'welcome' || c.layout === 'programme' || c.layout === 'winner' || (c.layout === 'game' && usesPanels(st.v));
      root.classList.toggle('has-qr', !qr.hidden);
      var key = c.layout + '|' + (st.display.showQr ? 1 : 0) + '|' + JSON.stringify(dataKey(c));
      if (key === st.drawn) { updateClock(); return; }
      st.drawn = key;
      if (st.stopSlide) { st.stopSlide(); st.stopSlide = null; }
      FF.ui.clear(stage);
      var screen = ({ welcome: welcome, programme: programme, scores: scores, wall: wall, message: one, winner: winner, game: game })[c.layout] || welcome;
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
      if (c.layout === 'programme') return [FF.CelebrateSlide.normal(st.display.slide), st.slideImages.map(function (m) { return m.id; }), st.ev.title, st.ev.cover && st.ev.cover.id];
      if (c.layout === 'scores' || c.layout === 'winner') return st.scores.map(function (s) { return [s.teamId, s.points, s.place]; });
      if (c.layout === 'wall') return st.messages.length ? [st.messages[st.msg % st.messages.length].id, st.messages.length] : [];
      if (c.layout === 'message') return [c.message.id];
      var v = st.v;
      if (!v) return [st.pointer && st.pointer.runId];
      return [st.pointer && st.pointer.runId, v.runId, v.phase, v.round, v.paused, v.photo && v.photo.url,
        Object.keys(v.boards || {}).map(function (k) { var b = v.boards[k]; return [k, b.correct, b.solved, placed(b).join('')]; }),
        list(v.results).length, v.result ? 1 : 0,
        // Word by Word: a new word, a struck word or the next turn.
        v.count, v.turn ? v.turn.id + '/' + v.turn.teamId : '',
        // Quiz: the question, who has picked or is sure (never which answer), and the reveal.
        // Before the countdown: which teams are ready.
        v.waitReady ? 'w' + Object.keys(v.ready || {}).sort().join(',') : '',
        v.q, v.question && v.question.text, v.question && list(v.question.choices).join('|'), v.right, v.picks ? Object.keys(v.picks).sort().map(function (k) { return k + (v.picks[k].sure ? '!' : ''); }).join(',') : ''];
    }

    /* ---------- the screens ---------- */

    /* How to join: the event's photo as a wide picture (never cropped), who and what, and the QR card. */
    function welcome() {
      var ev = st.ev;
      var cover = ev.cover && ev.cover.play;
      var box = div('tv-welcome' + (st.display.showQr ? ' has-qr' : '') + (cover ? ' has-cover' : ''));
      var main = div('tv-welcome__main');
      if (cover) {
        var fig = div('tv-media');
        fig.appendChild(el('img', { class: 'tv-media__blur', src: cover, alt: '' }));
        fig.appendChild(el('img', { class: 'tv-media__img', src: cover, alt: '' }));
        main.appendChild(fig);
      }
      var info = div('tv-welcome__info');
      info.appendChild(el('p', { class: 'tv-kicker' }, C().typesLabel(ev)));
      info.appendChild(el('h1', { class: 'tv-welcome__name' }, ev.celebrantName));
      info.appendChild(el('p', { class: 'tv-welcome__title' }, ev.title));
      var facts = [['calendar', C().formatDate(ev.date)], ['clock', C().timeRange(ev)], ['map-pin', ev.venue]].filter(function (f) { return f[1]; });
      if (facts.length) {
        var ul = el('ul', { class: 'tv-welcome__facts' });
        facts.forEach(function (f) {
          var li = el('li', {});
          li.appendChild(icon(f[0]));
          li.appendChild(FF.ui.span('', f[1]));
          ul.appendChild(li);
        });
        info.appendChild(ul);
      }
      var n = el('p', { class: 'tv-welcome__count' });
      n.appendChild(el('span', { class: 'tv-live-dot', 'aria-hidden': 'true' }));
      n.appendChild(FF.ui.span('', guests()));
      info.appendChild(n);
      main.appendChild(info);
      box.appendChild(main);
      if (st.display.showQr) {
        var join = joinBlock(420);
        join.classList.add('tv-join--big');
        box.appendChild(join);
      }
      return box;
    }

    /* The opening slide, full screen: the organiser's picture(s) or built slide, moving, with its effect. */
    function programme() {
      var node = div('tv-prog');
      st.stopSlide = FF.CelebrateSlide.render(node, { slide: st.display.slide, images: st.slideImages, ev: st.ev }).stop;
      return node;
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
      if (v.phase === 'starting' && v.waitReady) return readyScreen(v);
      if (v.template === 'pictureRush') return pictureRush(v);
      if (v.template === 'wordByWord') return wordByWord(v);
      if (v.template === 'quiz') return quiz(v);
      if (v.template === 'library') return library(v);
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

    /* ---------- Word by Word ---------- */

    var WBW_REVEAL_MS = 600;      // one word every 600 ms, as the referee times the reveal
    var WBW_REVEAL_MIN = 3000;

    function wordByWord(v) {
      var box = div('tv-game tv-wbw is-' + v.phase + (v.paused ? ' is-paused' : ''));
      var head = div('tv-game__head');
      head.appendChild(el('h1', { class: 'tv-game__name' }, v.name));
      if (v.phase === 'playing') head.appendChild(el('span', { class: 'tv-chip' }, t('celTvRoundOf', 'Round {n} of {total}', { n: (v.round || 0) + 1, total: v.rounds })));
      if (v.mode === 'blind' && v.phase === 'playing') head.appendChild(el('span', { class: 'tv-chip' }, t('celWbwBlind', 'Blind')));
      head.appendChild(el('span', { class: 'tv-timer', role: 'timer' }));
      box.appendChild(head);

      if (v.phase === 'starting') {
        var s = div('tv-pr__start');
        s.appendChild(el('p', { class: 'tv-kicker' }, t('celTvGetReady', 'Get ready!')));
        s.appendChild(el('p', { class: 'tv-pr__big tv-timer', role: 'timer' }));
        if (v.instructions) s.appendChild(el('p', { class: 'tv-lead' }, v.instructions));
        box.appendChild(s);
      } else if (v.phase === 'playing') {
        box.appendChild(v.mode === 'open' ? wbwMessage(v, list(v.words), false) : wbwLast(v));
        box.appendChild(wbwStrip(v));
      } else if (v.phase === 'reveal') {
        box.appendChild(el('p', { class: 'tv-kicker' }, t('celTvWbwMessage', 'Your message')));
        box.appendChild(wbwMessage(v, list(v.words), true));
      } else if (v.phase === 'ended') {
        var res = v.result || {};
        if (res.text) box.appendChild(wbwMessage(v, kept(res), false, true));
        box.appendChild(finalTable(v));
      }
      if (v.paused) box.appendChild(el('p', { class: 'tv-paused' }, t('celPausedNow', 'Paused.')));
      return box;
    }

    /* The finished words as the keepsake reads: a trailing comma dropped and the closing full stop added. */
    function kept(res) {
      var words = list(res.words).map(function (x) { return { w: String(x.w), teamId: x.teamId }; });
      var last = words[words.length - 1];
      if (last) {
        last.w = last.w.replace(/,$/, '');
        var mark = String(res.text || '').slice(-1);
        if ((mark === '.' || mark === '!') && !/[.!]$/.test(last.w)) last.w += mark;
      }
      return words;
    }

    /* The message so far in big type, each word underlined in its team's colour. Longer messages step the type down. */
    function wbwMessage(v, words, reveal, done) {
      var chars = (v.opening || '').length + words.reduce(function (n, x) { return n + String(x.w).length + 1; }, 0);
      var size = chars > 420 ? ' is-huge' : chars > 260 ? ' is-longest' : chars > 170 ? ' is-longer' : chars > 90 ? ' is-long' : '';
      var p = el('p', { class: 'tv-wbw__msg' + size + (done ? ' is-done' : '') });
      var bits = [];
      if (v.opening) bits.push({ w: v.opening, opening: true });
      words.forEach(function (x) { bits.push(x); });
      if (!bits.length) {
        p.appendChild(el('span', { class: 'tv-wbw__empty' }, t('celTvWbwFirst', 'Who will write the first word?')));
        return p;
      }
      // Only a word that has just arrived animates in; a redraw for the turn or the clock leaves the rest still.
      var seen = st.wbwSeen && st.wbwSeen.runId === v.runId ? st.wbwSeen.count : -1;
      if (!reveal) st.wbwSeen = { runId: v.runId, count: words.length };
      var start = 0;
      if (reveal) {
        var total = Math.max(WBW_REVEAL_MIN, words.length * WBW_REVEAL_MS);
        start = Math.max(0, (st.T ? st.T.serverNow() : Date.now()) - ((v.revealUntil || 0) - total));
      }
      bits.forEach(function (x, i) {
        var w = el('span', { class: 'tv-wbw__w' + (x.opening ? ' is-opening' : '') }, x.w);
        if (!x.opening) w.style.setProperty('--team', (v.teams[x.teamId] || {}).color || '#888888');
        var wordNo = x.opening ? -1 : i - (v.opening ? 1 : 0);
        if (!reveal && !done && seen >= 0 && wordNo >= seen) w.classList.add('is-new');
        if (reveal) {
          var at = Math.max(0, i * WBW_REVEAL_MS - start);
          if (at > 0) {
            w.classList.add('is-hidden');
            setTimeout(function () { w.classList.remove('is-hidden'); }, at);
          }
        }
        p.appendChild(w);
        p.appendChild(document.createTextNode(' '));
      });
      return p;
    }

    /* Blind: only the newest word, and how long the message has grown. */
    function wbwLast(v) {
      var wrap = div('tv-wbw__blind');
      var last = v.last ? v.last.w : v.opening;
      wrap.appendChild(el('p', { class: 'tv-kicker' }, last ? t('celTvWbwLast', 'The last word') : t('celTvWbwFirst', 'Who will write the first word?')));
      if (last) {
        var w = el('p', { class: 'tv-wbw__last' + (v.last && st.wbwSeen && st.wbwSeen.runId === v.runId && st.wbwSeen.count < v.count ? ' is-new' : '') }, last);
        if (v.last) w.style.setProperty('--team', (v.teams[v.last.teamId] || {}).color || '#888888');
        wrap.appendChild(w);
      }
      st.wbwSeen = { runId: v.runId, count: v.count || 0 };
      var n = v.count || 0;
      wrap.appendChild(el('p', { class: 'tv-lead' }, n === 1 ? t('celTvWbwOne', '1 word so far') : t('celTvWbwMany', '{n} words so far', { n: n })));
      return wrap;
    }

    /* The turn order along the bottom: whose turn it is now, and every group's points. */
    function wbwStrip(v) {
      var ol = el('ol', { class: 'tv-wbw__strip' });
      var totals = v.totals || {};
      list(v.order).forEach(function (tid) {
        var tm = v.teams[tid] || {};
        var now = v.turn && v.turn.teamId === tid;
        var li = el('li', { class: 'tv-wbw__team' + (now ? ' is-turn' : '') });
        li.style.setProperty('--team', tm.color || '#888888');
        li.appendChild(el('span', { class: 'tv-row__swatch', 'aria-hidden': 'true' }));
        li.appendChild(el('strong', { class: 'tv-wbw__name' }, tm.name || ''));
        li.appendChild(el('span', { class: 'tv-wbw__pts' }, now ? t('celTvWbwNow', 'your turn!') : t('celPoints', '{n} points', { n: (totals[tid] || {}).points || 0 })));
        ol.appendChild(li);
      });
      return ol;
    }

    /* ---------- "Press when ready", before any game's countdown ---------- */

    function readyScreen(v) {
      var box = div('tv-game tv-ready');
      var head = div('tv-game__head');
      head.appendChild(el('h1', { class: 'tv-game__name' }, v.name));
      box.appendChild(head);
      var s = div('tv-pr__start');
      s.appendChild(el('p', { class: 'tv-kicker' }, t('celTvGetReady', 'Get ready!')));
      s.appendChild(el('p', { class: 'tv-lead' }, t('celTvReadyPress', 'Each team: press "Press when ready" on your phone. The countdown starts when every team is ready.')));
      if (v.instructions) s.appendChild(el('p', { class: 'tv-lead' }, v.instructions));
      box.appendChild(s);
      var ready = v.ready || {};
      var ol = el('ol', { class: 'tv-wbw__strip tv-ready__strip' });
      Object.keys(v.teams || {}).forEach(function (tid) {
        var tm = v.teams[tid] || {};
        if (!Object.keys(tm.players || {}).length) return;
        var li = el('li', { class: 'tv-wbw__team' + (ready[tid] ? ' is-ready' : '') });
        li.style.setProperty('--team', tm.color || '#888888');
        li.appendChild(el('span', { class: 'tv-row__swatch', 'aria-hidden': 'true' }));
        li.appendChild(el('strong', { class: 'tv-wbw__name' }, tm.name || ''));
        li.appendChild(el('span', { class: 'tv-wbw__pts' }, ready[tid] ? t('celTvReadyYes', 'Ready ✓') : t('celTvReadyNo', 'Not yet')));
        ol.appendChild(li);
      });
      box.appendChild(ol);
      return box;
    }

    /* ---------- Quiz ---------- */

    var QZ_LETTERS = ['A', 'B', 'C', 'D'];

    function quiz(v) {
      var box = div('tv-game tv-qz is-' + v.phase + (v.paused ? ' is-paused' : ''));
      var head = div('tv-game__head');
      head.appendChild(el('h1', { class: 'tv-game__name' }, v.name));
      if (v.phase === 'question' || v.phase === 'reveal') head.appendChild(el('span', { class: 'tv-chip' }, t('celTvQuizOf', 'Question {n} of {total}', { n: (v.q || 0) + 1, total: v.total })));
      head.appendChild(el('span', { class: 'tv-timer', role: 'timer' }));
      box.appendChild(head);

      if (v.phase === 'starting') {
        var s = div('tv-pr__start');
        s.appendChild(el('p', { class: 'tv-kicker' }, t('celTvGetReady', 'Get ready!')));
        s.appendChild(el('p', { class: 'tv-pr__big tv-timer', role: 'timer' }));
        if (v.instructions) s.appendChild(el('p', { class: 'tv-lead' }, v.instructions));
        box.appendChild(s);
      } else if ((v.phase === 'question' || v.phase === 'reveal') && v.question) {
        var text = String(v.question.text || '');
        box.appendChild(el('p', { class: 'tv-qz__q' + (text.length > 90 ? ' is-long' : '') }, text));
        var ol = el('ol', { class: 'tv-qz__choices' });
        list(v.question.choices).forEach(function (c, i) {
          var cls = 'tv-qz__choice';
          if (v.phase === 'reveal') cls += i === v.right ? ' is-right' : ' is-wrong';
          var li = el('li', { class: cls });
          li.appendChild(el('span', { class: 'tv-qz__letter', 'aria-hidden': 'true' }, QZ_LETTERS[i]));
          li.appendChild(el('span', { class: 'tv-qz__text' }, String(c)));
          if (v.phase === 'reveal' && i === v.right) li.appendChild(icon('check'));
          ol.appendChild(li);
        });
        box.appendChild(ol);
        box.appendChild(quizStrip(v));
      } else if (v.phase === 'ended') {
        box.appendChild(finalTable(v));
      }
      if (v.paused) box.appendChild(el('p', { class: 'tv-paused' }, t('celPausedNow', 'Paused.')));
      return box;
    }

    /* A library game: every group plays it on their phones. The TV shows the time left and the groups as they finish. */
    function library(v) {
      var box = div('tv-game tv-lib is-' + v.phase);
      var head = div('tv-game__head');
      head.appendChild(el('h1', { class: 'tv-game__name' }, v.name));
      if (v.phase === 'playing') head.appendChild(el('span', { class: 'tv-chip' }, t('celTvLibOnPhones', 'Playing on your phones')));
      head.appendChild(el('span', { class: 'tv-timer', role: 'timer' }));
      box.appendChild(head);
      if (v.phase === 'starting') {
        var s = div('tv-pr__start');
        s.appendChild(FF.Celebrate.gameArt('library', 'tv-lib__art', v.game));
        s.appendChild(el('p', { class: 'tv-kicker' }, t('celTvGetReady', 'Get ready!')));
        s.appendChild(el('p', { class: 'tv-pr__big tv-timer', role: 'timer' }));
        if (v.instructions) s.appendChild(el('p', { class: 'tv-lead' }, v.instructions));
        box.appendChild(s);
      } else if (v.phase === 'playing') {
        var finished = v.finished || {};
        var done = list(v.order).filter(function (tid) { return finished[tid]; });
        var mid = div('tv-lib__mid');
        mid.appendChild(FF.Celebrate.gameArt('library', 'tv-lib__art', v.game));
        var txt = div('tv-lib__text');
        txt.appendChild(el('p', { class: 'tv-lib__count' }, t('celLibFinishedOf', '{n} of {total} groups finished', { n: done.length, total: v.total || 0 })));
        txt.appendChild(el('p', { class: 'tv-lead' }, t('celTvLibHow', 'Tap Play on your phone. Same questions for every group, best score wins.')));
        mid.appendChild(txt);
        box.appendChild(mid);
        var ol = el('ol', { class: 'tv-wbw__strip tv-qz__strip' });
        var order = list(v.order).slice().sort(function (a, b) {
          var x = finished[a], y = finished[b];
          if (x && y) return y.score - x.score;
          return x ? -1 : y ? 1 : 0;
        });
        order.forEach(function (tid) {
          var tm = v.teams[tid] || {};
          var f = finished[tid];
          var li = el('li', { class: 'tv-wbw__team' + (f ? ' is-sure' : '') });
          li.style.setProperty('--team', tm.color || '#888888');
          li.appendChild(el('span', { class: 'tv-row__swatch', 'aria-hidden': 'true' }));
          li.appendChild(el('strong', { class: 'tv-wbw__name' }, tm.name || ''));
          li.appendChild(el('span', { class: 'tv-wbw__pts' }, f ? String(f.score) : t('celTvLibPlaying', 'Playing…')));
          ol.appendChild(li);
        });
        box.appendChild(ol);
      } else if (v.phase === 'ended') {
        box.appendChild(finalTable(v));
      }
      return box;
    }

    /* Every team along the bottom. While the question is up it shows only whether a team has picked, never which answer. */
    function quizStrip(v) {
      var ol = el('ol', { class: 'tv-wbw__strip tv-qz__strip' });
      var totals = v.totals || {};
      var picks = v.picks || {};
      list(v.order).forEach(function (tid) {
        var tm = v.teams[tid] || {};
        var p = picks[tid];
        var note, cls = 'tv-wbw__team';
        if (v.phase === 'reveal') {
          var got = !!(v.got && v.got[tid]);
          cls += got ? ' is-right' : ' is-wrong';
          note = got ? t('celTvQuizRight', 'Right ✓') : (p ? t('celTvQuizWrong', 'Wrong ✗') : t('celTvQuizNone', 'No answer'));
        } else if (p && p.sure) {
          cls += ' is-sure';
          note = t('celTvQuizSure', 'Sure ✓');
        } else {
          note = p ? t('celTvQuizPicked', 'Picked…') : t('celTvQuizThinking', 'Thinking…');
        }
        var li = el('li', { class: cls });
        li.style.setProperty('--team', tm.color || '#888888');
        li.appendChild(el('span', { class: 'tv-row__swatch', 'aria-hidden': 'true' }));
        li.appendChild(el('strong', { class: 'tv-wbw__name' }, tm.name || ''));
        li.appendChild(el('span', { class: 'tv-wbw__pts' }, note));
        li.appendChild(el('span', { class: 'tv-qz__pts' }, t('celPoints', '{n} points', { n: (totals[tid] || {}).points || 0 })));
        ol.appendChild(li);
      });
      return ol;
    }

    function updateClock() {
      var v = st.v;
      var timers = stage ? stage.querySelectorAll('.tv-timer') : [];
      if (!timers.length) return;
      var text = '';
      if (v && st.T && v.template === 'wordByWord') {
        // Word by Word counts down each turn; the reveal has no clock.
        if (v.phase === 'starting') text = clock(v.startAt - st.T.serverNow());
        else if (v.phase === 'playing' && v.turn) text = clock(v.paused ? (v.turn.leftMs || 0) : v.turn.endsAt - st.T.serverNow());
      } else if (v && st.T && v.template === 'quiz') {
        // The quiz counts down to the start and each question; the reveal has no clock.
        if (v.phase === 'starting') text = clock(v.startAt - st.T.serverNow());
        else if (v.phase === 'question') text = clock(v.paused ? (v.leftMs || 0) : v.deadline - st.T.serverNow());
      } else if (v && st.T && v.template === 'library') {
        if (v.phase === 'starting' && !v.waitReady) text = clock(v.startAt - st.T.serverNow());
        else if (v.phase === 'playing') text = clock(v.endsAt - st.T.serverNow());
      } else if (v && st.T && v.phase !== 'ended') {
        var due = { starting: v.startAt, reveal: v.revealUntil, playing: v.deadline, roundEnd: v.nextAt }[v.phase] || 0;
        if (due) text = clock(due - (v.paused ? v.pausedAt : st.T.serverNow()));
      }
      for (var i = 0; i < timers.length; i++) timers[i].textContent = text;
    }
  }

  FF.CelebrateTV = { start: start, LAYOUT_NAMES: LAYOUT_NAMES };
})();
