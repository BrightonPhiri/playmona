/* ============================================================
   PLAYMONA — watch/tv.js
   Watching (phase 3). Draws the TV view from FF.WatchView.model:
   the question on the left and a live leaderboard on the right
   (stacked on upright phones, see css/watch.css). Everything a
   host's device sent is shown as text or through <img>, never as
   HTML, so a broadcast cannot run code on a viewer's screen.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var SHAPES = ['▲', '◆', '●', '■', '★', '⬟'];   // ▲ ◆ ● ■ ★ ⬟
  var LETTERS = ['a', 'b', 'c', 'd', 'e', 'f'];
  var FLAG = /^[a-z]{2}(-[a-z0-9]{1,8})?$/;
  var ASSET = /^assets\/[A-Za-z0-9_\/.-]+\.(svg|png|jpe?g|webp)$/;

  function t(key, fallback, vars) {
    if (FF.t) return FF.t(key, fallback, vars);
    var s = fallback;
    Object.keys(vars || {}).forEach(function (k) { s = s.split('{' + k + '}').join(vars[k]); });
    return s;
  }
  function div(cls, kids) { return FF.ui.div(cls, kids); }
  function span(cls, kids) { return FF.ui.span(cls, kids); }

  function avatar(value, cls) {
    var img = FF.Avatars && FF.Avatars.img ? FF.Avatars.img(value, cls) : document.createElement('img');
    if (!img.className) img.className = cls;
    img.setAttribute('alt', '');
    return img;
  }

  /* A picture from the broadcast, or null when it is not one we draw. */
  function picture(image) {
    if (!image || typeof image !== 'object') return null;
    var src = null;
    if (typeof image.flag === 'string' && FLAG.test(image.flag)) src = 'assets/flags/' + image.flag + '.svg';
    else if (typeof image.src === 'string' && ASSET.test(image.src) && image.src.indexOf('..') === -1) src = image.src;
    else if (typeof image.svg === 'string' && image.svg.length <= 30000) src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(image.svg);
    else if (typeof image.emoji === 'string' && image.emoji.length <= 16) return span('tv-q__emoji', image.emoji);
    if (!src) return null;
    var img = document.createElement('img');
    img.className = 'tv-q__img';
    img.src = src;
    img.setAttribute('alt', t('pictureToGuess', 'Picture to guess'));
    img.setAttribute('draggable', 'false');
    return img;
  }

  function reducedMotion() {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }

  function mount(container, opts) {
    opts = opts || {};
    var now = opts.now || function () { return Date.now(); };
    var calm = reducedMotion();

    var root = div('tv');
    var live = span('tv-live', t('live', 'LIVE'));
    var title = span('tv-top__title', '');
    var viewers = span('tv-top__viewers', '');
    viewers.hidden = true;
    var stop = FF.ui.el('a', { class: 'tv-top__stop', href: opts.stopHref || 'watch' }, t('stopWatching', 'Stop watching'));
    var top = div('tv-top', [div('tv-top__left', [live, title]), div('tv-top__right', [viewers, stop])]);
    var stage = div('tv-stage');
    root.appendChild(top);
    root.appendChild(stage);
    container.appendChild(root);

    var layout = null;        // { main, qSlot, board } while a game is on
    var tiles = {};           // id -> tile (kept, so moves can animate)
    var scores = {};          // id -> last score, for the "+points" pop
    var timerFill = null;
    var timerFor = null;      // { opensAt, timerMs }
    var countdownNum = null;
    var countdownEnd = 0;
    var ticker = setInterval(tick, 250);

    function tick() {
      var at = now();
      if (countdownNum) countdownNum.textContent = String(Math.max(0, Math.ceil((countdownEnd - at) / 1000)));
      if (timerFill && timerFor) {
        var left = 1 - (at - timerFor.opensAt) / timerFor.timerMs;
        timerFill.style.width = Math.max(0, Math.min(1, left)) * 100 + '%';
      }
    }

    function resetGame() {
      layout = null; tiles = {}; timerFill = null; timerFor = null;
    }

    function questionCard(m) {
      var card = div('tv-q');
      var s = m.screen;
      if (!s) {
        card.appendChild(FF.ui.el('h2', { class: 'tv-q__text' }, m.gameName || t('gameOn', 'Game in progress')));
        card.appendChild(FF.ui.el('p', { class: 'tv-q__sub' }, m.roundText));
        return card;
      }
      card.appendChild(FF.ui.el('h2', { class: 'tv-q__text' }, String(s.text || '')));
      var pic = picture(s.image);
      if (pic) card.appendChild(div('tv-q__pic', [pic]));
      if (s.kind === 'choice' && s.options && s.options.length) {
        var grid = div('tv-opts');
        s.options.forEach(function (label, i) {
          var cls = 'tv-opt tv-opt--' + (LETTERS[i] || 'a');
          if (m.answer === i) cls += ' is-answer';
          else if (m.answer != null) cls += ' is-dim';
          grid.appendChild(div(cls, [span('tv-opt__shape', SHAPES[i] || ''), span('tv-opt__label', String(label))]));
        });
        card.appendChild(grid);
      }
      timerFill = null;
      if (m.state === 'question' && m.timerMs && m.opensAt) {
        timerFill = FF.ui.el('i');
        timerFor = { opensAt: m.opensAt, timerMs: m.timerMs };
        card.appendChild(div('tv-timer', [timerFill]));
        tick();
      }
      return card;
    }

    function makeTile(p) {
      var tile = div('tv-tile');
      tile._rank = span('tv-tile__rank', '');
      tile._ava = avatar(p.avatar, 'tv-tile__ava');
      tile._avaValue = p.avatar;
      tile._name = span('tv-tile__name', '');
      tile._score = span('tv-tile__score', '');
      tile._mark = span('tv-tile__mark', '');
      tile.appendChild(tile._rank);
      tile.appendChild(tile._ava);
      tile.appendChild(div('tv-tile__who', [tile._name, tile._score]));
      tile.appendChild(tile._mark);
      return tile;
    }

    function fillTile(tile, p, revealing) {
      var cls = 'tv-tile';
      if (p.answered) cls += ' is-answered';
      if (p.talking) cls += ' is-talking';
      if (revealing && p.correct === true) cls += ' is-right';
      if (revealing && p.correct === false) cls += ' is-wrong';
      tile.className = cls;
      tile.setAttribute('data-id', p.id);
      if (tile._avaValue !== p.avatar) {
        var fresh = avatar(p.avatar, 'tv-tile__ava');
        tile.replaceChild ? tile.replaceChild(fresh, tile._ava) : null;
        tile._ava = fresh;
        tile._avaValue = p.avatar;
      }
      tile._rank.textContent = String(p.rank || '');
      tile._name.textContent = p.name;
      tile._score.textContent = t('pointsN', '{n} pts', { n: p.score });
      tile._mark.textContent = p.answered ? '✓' : '';
      tile.setAttribute('aria-label', p.name + ', ' + p.score + (p.answered ? ', ' + t('answered', 'answered') : ''));
      var before = scores[p.id];
      if (typeof before === 'number' && p.score > before) {
        var pop = span('tv-tile__pop', '+' + (p.score - before));
        tile.appendChild(pop);
        setTimeout(function () { if (pop.parentNode) pop.parentNode.removeChild(pop); }, 1600);
      }
      scores[p.id] = p.score;
    }

    function board(m) {
      var el = layout.board;
      var canMeasure = !calm && el.children.length && typeof el.children[0].getBoundingClientRect === 'function';
      var before = {};
      if (canMeasure) Object.keys(tiles).forEach(function (id) { before[id] = tiles[id].getBoundingClientRect().top; });

      var seen = {};
      m.leaderboard.forEach(function (p) {
        var tile = tiles[p.id] || (tiles[p.id] = makeTile(p));
        fillTile(tile, p, m.state === 'reveal');
        el.appendChild(tile);   // re-appending puts it in score order
        seen[p.id] = true;
      });
      Object.keys(tiles).forEach(function (id) {
        if (seen[id]) return;
        if (tiles[id].parentNode) tiles[id].parentNode.removeChild(tiles[id]);
        delete tiles[id];
      });

      if (!canMeasure) return;
      // Slide tiles from where they were to their new place.
      Object.keys(tiles).forEach(function (id) {
        if (before[id] == null) return;
        var dy = before[id] - tiles[id].getBoundingClientRect().top;
        if (!dy) return;
        var tile = tiles[id];
        tile.style.transition = 'none';
        tile.style.transform = 'translateY(' + dy + 'px)';
        void tile.offsetHeight;
        tile.style.transition = '';
        tile.style.transform = '';
      });
    }

    function simple(view) {
      resetGame();
      FF.ui.clear(stage);
      stage.appendChild(view);
    }

    function lobbyView(m) {
      var row = div('tv-lobby__people');
      m.players.forEach(function (p) {
        row.appendChild(div('tv-person' + (p.talking ? ' is-talking' : ''), [avatar(p.avatar, 'tv-person__ava'), span('tv-person__name', p.name)]));
      });
      return div('tv-lobby', [
        FF.ui.el('h2', { class: 'tv-lobby__title' }, m.roomName),
        FF.ui.el('p', { class: 'tv-lobby__text' }, t('waitingForGame', 'Waiting for the host to pick a game')),
        row
      ]);
    }

    function countdownView(m) {
      countdownEnd = now() + m.countdownMs;
      countdownNum = span('tv-count__num', '');
      var v = div('tv-count', [
        FF.ui.el('p', { class: 'tv-count__text' }, t('startingGame', 'Starting {game}…', { game: m.gameName || t('theGame', 'the game') })),
        countdownNum
      ]);
      tick();
      return v;
    }

    function podiumView(m) {
      var places = div('tv-podium__places');
      m.podium.forEach(function (p) {
        places.appendChild(div('tv-place tv-place--' + p.place, [
          avatar(p.avatar, 'tv-place__ava'),
          span('tv-place__name', p.name),
          span('tv-place__score', t('pointsN', '{n} pts', { n: p.score })),
          span('tv-place__step', String(p.place))
        ]));
      });
      return div('tv-podium', [FF.ui.el('h2', { class: 'tv-podium__title' }, t('finalScores', 'Final scores')), places]);
    }

    function update(m) {
      if (!m) return;
      root.setAttribute('data-state', m.state);
      live.textContent = m.state === 'lobby' ? t('inLobby', 'IN LOBBY') : t('live', 'LIVE');
      title.textContent = [m.roomName, m.gameName, m.roundText].filter(Boolean).join(' · ');
      if (m.state !== 'countdown') countdownNum = null;

      if (m.state === 'question' || m.state === 'reveal') {
        if (!layout) {
          FF.ui.clear(stage);
          var qSlot = div('tv-main__q');
          var list = FF.ui.el('ol', { class: 'tv-board', 'aria-label': t('leaderboard', 'Leaderboard') });
          var main = div('tv-main', [qSlot, list]);
          stage.appendChild(main);
          layout = { main: main, qSlot: qSlot, board: list };
        }
        FF.ui.clear(layout.qSlot);
        layout.qSlot.appendChild(questionCard(m));
        board(m);
        return;
      }
      if (m.state === 'lobby') simple(lobbyView(m));
      else if (m.state === 'countdown') simple(countdownView(m));
      else if (m.state === 'podium') simple(podiumView(m));
      else showMessage(t('gameEnded', 'This game has ended.'), t('gameEndedWait', 'If the room starts again, it will show here.'));
    }

    /* A message in place of the game (it ended, or the host stopped sharing).
       The next update() puts the game back if it carries on. */
    function showMessage(title, text) {
      root.setAttribute('data-state', 'message');
      simple(div('tv-ended', [
        FF.ui.el('h2', { class: 'tv-ended__title' }, title),
        text ? FF.ui.el('p', {}, text) : null,
        FF.ui.el('a', { class: 'btn btn-primary', href: opts.stopHref || 'watch' }, t('otherGames', 'See other live games'))
      ]));
    }

    return {
      update: update,
      showMessage: showMessage,
      setViewers: function (n) {
        viewers.hidden = !(n > 0);
        viewers.textContent = t('nWatching', '{n} watching', { n: n });
      },
      destroy: function () {
        clearInterval(ticker);
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    };
  }

  FF.WatchTV = { mount: mount, picture: picture };
})();
