/* PlayMona Celebrations: the MC panel, /c/<event>/mc#k=<secret> (FF.CelebrateMC).
   The person running the evening, on a phone: what the TV shows (and the QR code on it),
   start / pause / resume / next / end a game with every team's progress, the leaderboard,
   messages to approve and a message to put on the TV, and the winners' announcement.
   The organiser's dashboard can do the same; this link lets someone else run it.
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
  function devMode() { return !!(FF.Net && FF.Net.devMode && FF.Net.devMode()); }

  var LAYOUTS = [
    ['auto', 'sparkle', ['celTvAuto', 'Automatic'], ['celTvAutoText', 'Follows the evening']],
    ['welcome', 'qr-scan', ['celTvWelcome', 'Welcome'], ['celTvWelcomeText', 'How to join']],
    ['game', 'puzzle-piece', ['celTvGame', 'Game'], ['celTvGameText', 'The game being played']],
    ['scores', 'medal', ['celTvScores', 'Scores'], ['celTvScoresText', 'The leaderboard']],
    ['wall', 'heart', ['celTvWall', 'Wall of Love'], ['celTvWallText', 'Messages, one by one']],
    ['winner', 'trophy', ['celTvWinner', 'Winners'], ['celTvWinnerText', 'Announce the champions']]
  ];
  var POLL_MS = 15000;
  var SHOWN_MAX = 20;

  function label(pair, vars) { return t(pair[0], pair[1], vars); }

  function start(main, slug) {
    var st = { id: null, ev: null, data: null, T: null, live: null, busy: false, showAll: false };
    var api = null;
    document.body.classList.remove('ev-page');
    document.body.classList.add('mc-page');
    var root = div('mc');
    var tvBox, gameBox, scoreBox, msgBox, countEl;

    main.appendChild(div('ev-loading', t('loading', 'Loading…')));
    S().open(slug, ['mc']).then(function (h) {
      api = h.api;
      st.id = h.id;
      st.ev = h.event;
      return api('GET', '/c/' + h.id + '/mc');
    }).then(function (r) {
      st.data = r;
      st.ev = r.event;
      build();
      return S().connect(st.id).then(function (T) {
        st.T = T;
        // A game starting or ending, and new scores: ask the API again at once.
        // The first answers repeat what GET /mc just gave; later ones are news.
        var seen = {};
        function news(path) { return function () { if (seen[path]) load(); seen[path] = true; }; }
        T.watch('live/run', news('run'));
        T.watch('live/scores', news('scores'));
      }, function () { /* the panel still works without live updates; it asks every 15 s */ });
    }).then(function () {
      setInterval(function () { if (!document.hidden && !document.querySelector('.ff-dialog')) load(); }, POLL_MS);
    }).catch(function (e) {
      document.body.classList.remove('mc-page');
      document.body.classList.add('ev-page');
      S().plain(main, t('celLinkBroken', 'This link does not work'), e.message);
    });

    function load() {
      if (!api || st.busy) return Promise.resolve();
      return api('GET', '/c/' + st.id + '/mc').then(function (r) {
        var before = JSON.stringify(st.data);
        st.data = r;
        st.ev = r.event;
        if (JSON.stringify(r) !== before) draw();
      }, function () { /* the next poll tries again */ });
    }

    /* The dev transport is not the local API's database: put the TV's state there too. */
    function mirror(path, value) {
      if (devMode() && st.T) return st.T.set(path, value);
      return Promise.resolve();
    }

    function setDisplay(body, done) {
      return api('POST', '/c/' + st.id + '/mc/display', body).then(function (r) {
        st.data.display = r.display;
        return mirror('live/display', r.display).then(function () {
          drawTv();
          drawMessages();
          if (done) FF.UI.toast(done);
        });
      }, function (e) { FF.UI.toast(e.message); });
    }

    /* ---------- the page ---------- */

    function build() {
      FF.ui.clear(main);
      document.title = t('celMcTitle', 'MC panel') + ' · ' + st.ev.title;
      var head = el('header', { class: 'mc-head' });
      var h = div('mc-head__text');
      h.appendChild(el('p', { class: 'mc-head__kicker' }, t('celMcTitle', 'MC panel')));
      h.appendChild(el('h1', { class: 'mc-head__title' }, st.ev.title));
      head.appendChild(h);
      countEl = el('span', { class: 'mc-head__count' });
      head.appendChild(countEl);
      root.appendChild(head);
      tvBox = el('section', { class: 'mc-card', 'aria-labelledby': 'mc-tv-title' });
      gameBox = el('section', { class: 'mc-card', 'aria-labelledby': 'mc-game-title' });
      scoreBox = el('section', { class: 'mc-card', 'aria-labelledby': 'mc-score-title' });
      msgBox = el('section', { class: 'mc-card', 'aria-labelledby': 'mc-msg-title' });
      [tvBox, gameBox, scoreBox, msgBox].forEach(function (b) { root.appendChild(b); });
      main.appendChild(root);
      draw();
    }

    function draw() {
      var n = st.ev.guestCount || 0;
      countEl.textContent = t(n === 1 ? 'celHereOne' : 'celHereMany', n === 1 ? '1 guest has joined' : '{n} guests have joined', { n: n });
      drawTv();
      drawGame();
      drawScores();
      drawMessages();
    }

    function title(box, id, text, ic) {
      var h = el('h2', { class: 'mc-card__title', id: id });
      h.appendChild(icon(ic));
      h.appendChild(FF.ui.span('', text));
      box.appendChild(h);
    }

    /* ---------- the TV ---------- */

    function drawTv() {
      var d = st.data.display;
      FF.ui.clear(tvBox);
      title(tvBox, 'mc-tv-title', t('celMcOnTv', 'On the TV'), 'monitor');
      var grid = el('div', { class: 'mc-layouts', role: 'group', 'aria-label': t('celMcPickScreen', 'What the TV shows') });
      LAYOUTS.forEach(function (l) {
        var on = !d.messageId && d.layout === l[0];
        var b = el('button', { type: 'button', class: 'mc-layout' + (on ? ' is-on' : ''), 'aria-pressed': on ? 'true' : 'false' });
        b.appendChild(icon(l[1]));
        b.appendChild(el('strong', {}, label(l[2])));
        b.appendChild(el('span', {}, label(l[3])));
        b.addEventListener('click', function () {
          if (on) return;
          b.disabled = true;
          setDisplay({ layout: l[0] }).then(function () { b.disabled = false; });
        });
        grid.appendChild(b);
      });
      tvBox.appendChild(grid);
      if (d.messageId) {
        var shown = message(d.messageId);
        var note = div('mc-pinned');
        note.appendChild(el('p', {}, shown
          ? t('celMcShowingMsg', 'Showing a message from {name}.', { name: W().byline(shown) })
          : t('celMcShowingMsgGone', 'Showing a message.')));
        note.appendChild(FF.UI.button(t('celMcStopShowing', 'Back to {screen}', { screen: label(layoutOf(d.layout)[2]) }), { class: 'btn-secondary btn-sm', icon: 'arrow-left', onClick: function () { setDisplay({ messageId: null }); } }));
        tvBox.appendChild(note);
      }
      tvBox.appendChild(FF.UI.switchRow({
        label: t('celMcShowQr', 'Show the QR code'),
        description: t('celMcShowQrText', 'In a corner of the TV, so late guests can join.'),
        checked: !!d.showQr,
        onChange: function (on) { setDisplay({ showQr: on }); }
      }));
    }

    function layoutOf(id) {
      for (var i = 0; i < LAYOUTS.length; i++) if (LAYOUTS[i][0] === id) return LAYOUTS[i];
      return LAYOUTS[0];
    }

    /* ---------- the game ---------- */

    function drawGame() {
      var r = st.data;
      // The live panel stays while its game runs, and after it ends until it is closed.
      if (st.live && st.live.el.isConnected && (r.active ? r.active.runId === st.live.runId : st.live.ended())) return;
      if (st.live) { st.live.stop(); st.live = null; }
      FF.ui.clear(gameBox);
      title(gameBox, 'mc-game-title', t('celMcGame', 'Game'), 'puzzle-piece');
      if (r.active) {
        st.live = FF.CelebrateLivePanel.create(st.ev, r.active, {
          alive: function () { return gameBox.isConnected; },
          reload: function () { st.live = null; load().then(drawGame); },
          control: function (action, index) { return api('POST', '/c/' + st.id + '/mc/control', index == null ? { action: action } : { action: action, index: index }); },
          watch: function () { return Promise.resolve(); }   // GET /mc already lets this sign-in watch
        });
        gameBox.appendChild(st.live.el);
        return;
      }
      if (!r.games.length) {
        gameBox.appendChild(el('p', { class: 'mc-empty' }, t('celMcNoGames', 'No game is ready yet. The organiser publishes games from the dashboard.')));
        return;
      }
      gameBox.appendChild(el('p', { class: 'hint' }, t('celMcPickGame', 'Start a game when everyone is in a team. It opens on every guest\'s phone and on the TV.')));
      var ul = el('ul', { class: 'mc-games' });
      r.games.forEach(function (g) {
        var li = el('li', { class: 'mc-game' });
        if (g.thumb) li.appendChild(el('img', { class: 'mc-game__thumb', src: g.thumb, alt: '' }));
        var text = div('mc-game__text');
        text.appendChild(el('strong', {}, g.name));
        text.appendChild(el('span', {}, t(g.rounds === 1 ? 'celMcPictureOne' : 'celMcPictures', g.rounds === 1 ? '1 picture' : '{n} pictures', { n: g.rounds })));
        li.appendChild(text);
        var go = FF.UI.button(t('celStart', 'Start'), { class: 'btn-primary btn-sm', icon: 'play', onClick: function () { startGame(g, go); } });
        li.appendChild(go);
        ul.appendChild(li);
      });
      gameBox.appendChild(ul);
    }

    function startGame(g, btn) {
      FF.UI.confirm({
        title: t('celStartTitle', 'Start {name}?', { name: g.name }),
        body: t('celStartText', 'The game opens on every guest\'s phone and starts after a 10 second countdown. Guests need the event page open.'),
        confirmLabel: t('celStart', 'Start'), icon: 'play',
        onConfirm: function () {
          FF.UI.busy(btn, true);
          st.busy = true;
          api('POST', '/c/' + st.id + '/mc/start', { gameId: g.id }).then(function (r) {
            // Locally there is no crew runner: this tab referees, as the organiser's would.
            if (!devMode()) return r;
            return FF.CelebrateLivePanel.loadDev().then(function (d) {
              return d.host(r, { scores: function () { return api('GET', '/c/' + st.id + '/mc').then(function (x) { return x.scores; }); } });
            });
          }).then(function () {
            st.busy = false;
            var d = st.data.display;
            // The TV follows the game unless the MC chose the game screen already.
            var follow = !d.messageId && (d.layout === 'auto' || d.layout === 'game') ? Promise.resolve() : setDisplay({ layout: 'auto' });
            return follow.then(load);
          }).then(function () {
            FF.UI.toast(t('celMcStarted', 'Started! Phones and the TV are counting down.'));
          }, function (e) { st.busy = false; FF.UI.busy(btn, false); FF.UI.toast(e.message); });
        }
      });
    }

    /* ---------- the scores ---------- */

    function drawScores() {
      FF.ui.clear(scoreBox);
      title(scoreBox, 'mc-score-title', t('celLeaderboard', 'Leaderboard'), 'medal');
      var any = st.data.scores.some(function (s) { return s.points > 0; });
      var ol = el('ol', { class: 'mc-scores' });
      st.data.scores.forEach(function (s) {
        var li = el('li', { class: 'mc-score' });
        li.style.setProperty('--team', s.color);
        li.appendChild(el('span', { class: 'mc-score__place' }, any ? String(s.place) : '–'));
        li.appendChild(el('span', { class: 'mc-score__swatch', 'aria-hidden': 'true' }));
        li.appendChild(el('strong', {}, s.name));
        li.appendChild(el('span', { class: 'mc-score__pts' }, t('celPoints', '{n} points', { n: s.points })));
        ol.appendChild(li);
      });
      scoreBox.appendChild(ol);
      if (st.data.last) {
        scoreBox.appendChild(el('p', { class: 'hint' }, t('celMcLastGame', 'Last game: {name}', { name: st.data.last.name })));
      }
      var winners = st.data.display.layout === 'winner' && !st.data.display.messageId;
      scoreBox.appendChild(FF.UI.button(winners ? t('celMcWinnersShown', 'The winners are on the TV') : t('celMcAnnounce', 'Announce the winners on the TV'), {
        class: winners ? 'btn-secondary btn-block' : 'btn-primary btn-block', icon: 'trophy',
        onClick: function () {
          if (winners) return;
          if (!any) { FF.UI.toast(t('celMcNoPointsYet', 'No team has points yet. Play a game first.')); return; }
          setDisplay({ layout: 'winner' }, t('celMcAnnounced', 'The winners are on the TV.')).then(drawScores);
        }
      }));
    }

    /* ---------- messages ---------- */

    function message(id) {
      var found = null;
      (st.data.messages || []).forEach(function (m) { if (m.id === id) found = m; });
      return found;
    }

    function moderate(m, action, done) {
      return api('POST', '/c/' + st.id + '/mc/messages/' + m.id + '/' + action, {}).then(function (r) {
        st.data.messages = r.messages;
        st.data.waiting = r.waiting;
        st.data.display = r.display;
        return mirror('live/display', r.display).then(function () {
          drawTv();
          drawMessages();
          if (done) FF.UI.toast(done);
        });
      }, function (e) { FF.UI.toast(e.message); });
    }

    function msgRow(m, waiting) {
      var cat = W().category(m.category);
      var pinned = st.data.display.messageId === m.id;
      var li = el('li', { class: 'mc-msg' + (pinned ? ' is-pinned' : '') });
      var tag = el('span', { class: 'mc-msg__tag' });
      tag.appendChild(icon(cat.icon));
      tag.appendChild(FF.ui.span('', W().label(cat.label)));
      li.appendChild(tag);
      if (waiting && m.reports) li.appendChild(el('span', { class: 'cel-msg__reports' }, t(m.reports === 1 ? 'celWallReportOne' : 'celWallReportMany', m.reports === 1 ? 'Reported by 1 guest' : 'Reported by {n} guests', { n: m.reports })));
      li.appendChild(el('p', { class: 'mc-msg__body' }, m.body));
      if (m.photo) li.appendChild(el('img', { class: 'mc-msg__photo', src: m.photo.thumb, alt: t('celMsgPhotoBy', 'Photo from {name}', { name: W().byline(m) }), loading: 'lazy' }));
      li.appendChild(el('p', { class: 'mc-msg__by' }, '— ' + W().byline(m)));
      var acts = div('mc-msg__acts');
      if (waiting) {
        acts.appendChild(FF.UI.button(t('celWallApprove', 'Put on the wall'), { class: 'btn-primary btn-sm', icon: 'check', onClick: function () { moderate(m, 'approve'); } }));
        acts.appendChild(FF.UI.button(t('celWallReject', 'Do not show'), { class: 'btn-ghost btn-sm', icon: 'eye-slash', onClick: function () { moderate(m, 'reject'); } }));
      } else if (pinned) {
        acts.appendChild(FF.UI.button(t('celMcOnTvNow', 'On the TV now · Stop'), { class: 'btn-secondary btn-sm', icon: 'monitor', onClick: function () { setDisplay({ messageId: null }); } }));
      } else {
        acts.appendChild(FF.UI.button(t('celMcShowOnTv', 'Show on the TV'), { class: 'btn-secondary btn-sm', icon: 'monitor', onClick: function () { setDisplay({ messageId: m.id }, t('celMcShownOnTv', 'On the TV now.')); } }));
        acts.appendChild(FF.UI.button(t('celWallTakeOff', 'Take off the wall'), { class: 'btn-ghost btn-sm', icon: 'eye-slash', onClick: function () { moderate(m, 'reject', t('celMcTakenOff', 'Taken off the wall.')); } }));
      }
      li.appendChild(acts);
      return li;
    }

    function drawMessages() {
      FF.ui.clear(msgBox);
      title(msgBox, 'mc-msg-title', t('celWallTitle', 'Wall of Love'), 'heart');
      var waiting = st.data.waiting || [];
      var shown = st.data.messages || [];
      msgBox.appendChild(el('h3', { class: 'mc-sub' }, t('celMcWaiting', 'To read ({n})', { n: waiting.length })));
      if (!waiting.length) msgBox.appendChild(el('p', { class: 'mc-empty' }, t('celWallNothingToRead', 'Nothing to read right now. New messages appear here.')));
      else {
        var w = el('ul', { class: 'mc-msgs' });
        waiting.forEach(function (m) { w.appendChild(msgRow(m, true)); });
        msgBox.appendChild(w);
      }
      msgBox.appendChild(el('h3', { class: 'mc-sub' }, t('celMcOnWall', 'On the wall ({n})', { n: shown.length })));
      if (!shown.length) msgBox.appendChild(el('p', { class: 'mc-empty' }, t('celWallNoneHere', 'No messages here.')));
      else {
        var ul = el('ul', { class: 'mc-msgs' });
        (st.showAll ? shown : shown.slice(0, SHOWN_MAX)).forEach(function (m) { ul.appendChild(msgRow(m, false)); });
        msgBox.appendChild(ul);
        if (!st.showAll && shown.length > SHOWN_MAX) {
          msgBox.appendChild(FF.UI.button(t('celMcShowAll', 'Show all {n}', { n: shown.length }), { class: 'btn-ghost btn-block', onClick: function () { st.showAll = true; drawMessages(); } }));
        }
      }
    }
  }

  FF.CelebrateMC = { start: start };
})();
