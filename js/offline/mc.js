/* ============================================================
   PLAYMONA — offline/mc.js  (FF.OfflineMC)
   The MC control panel of Offline Event Mode: /offline.
   The only window that changes the event. Every action edits the
   event object, saves it (FF.OfflineStore) and redraws; the
   projector window follows. The MC's clock passes turns on when
   time runs out, so keep this window open during the games.
   Classic script, ES2017 or older.
   ============================================================ */
window.FF = window.FF || {};
(function () {
  'use strict';

  var L = function () { return FF.OfflineLogic; };
  var Store = function () { return FF.OfflineStore; };

  var S = null;                // the event
  var tab = 'setup';
  var root, mainEl, sideEl, topEl;
  var screenSeen = 0, screenInfo = null;
  var me = L().uid('mc'), otherMc = 0;
  var prPick = -1;             // the tile the MC clicked first on the mini board
  var flash = null;            // { text, kind, at }

  try { tab = sessionStorage.getItem('playmona:offlineTab') || 'setup'; } catch (e) {}

  /* ---------- helpers ---------- */
  function h(tag, cls, kids, attrs) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (k === 'style') n.style.cssText = v;
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
      else if (k === 'value') n.value = v;
      else if (k === 'checked' || k === 'disabled') n[k] = !!v;
      else n.setAttribute(k, v);
    });
    [].concat(kids == null ? [] : kids).forEach(function (c) {
      if (c == null || c === false) return;
      n.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
    return n;
  }
  function btn(label, cls, fn, attrs) {
    var b = h('button', 'mc-btn ' + (cls || ''), label, attrs);
    b.type = 'button';
    b.addEventListener('click', function (e) { e.preventDefault(); fn(e); });
    return b;
  }
  function field(label, input, hint) { return h('label', 'mc-field', [h('span', 'mc-field__label', label), input, hint ? h('span', 'mc-field__hint', hint) : null]); }
  function card(title, kids, cls) { return h('section', 'mc-card ' + (cls || ''), [title ? h('h2', 'mc-card__title', title) : null].concat(kids)); }
  function dot(c) { return h('span', 'mc-dot', null, { style: 'background:' + c }); }
  function secsInput(key, min, max) {
    return h('input', 'mc-input mc-input--num', null, { type: 'number', min: min, max: max, value: Math.round(S.settings[key] / 1000),
      onchange: function (e) { var v = Math.max(min, Math.min(max, Number(e.target.value) || min)); S.settings[key] = v * 1000; commit(); } });
  }
  function say(text, kind) { flash = { text: text, kind: kind || 'info', at: Date.now() }; }

  /* Save, tell the projector, redraw — keeping the typing cursor where it was. */
  function commit(noDraw) {
    Store().save(S);
    if (!noDraw) draw();
  }
  function act(fn) { return function () { fn.apply(null, arguments); commit(); }; }

  function draw() {
    var a = document.activeElement, keep = a && a.id ? { id: a.id, v: a.value, s: a.selectionStart, e: a.selectionEnd } : null;
    var scroll = mainEl.scrollTop;
    drawTop(); drawSide(); drawMain();
    // Same view: stay where the MC was. A new view (a game started or ended): start at the top.
    var head = mainEl.querySelector('.mc-card__title'), view = tab + '|' + (head ? head.textContent.replace(/[0-9]+/g, '') : '');
    mainEl.scrollTop = view === draw.view ? scroll : 0;
    draw.view = view;
    if (keep) {
      var b = document.getElementById(keep.id);
      if (b) { b.focus(); if (b.value !== undefined && keep.v != null && b.dataset.keepValue) { b.value = keep.v; try { b.setSelectionRange(keep.s, keep.e); } catch (e) {} } }
    }
  }

  /* ---------- top bar: projector, what's on screen, pause ---------- */
  var SCREENS = [['welcome', 'Welcome'], ['game', 'Game'], ['scores', 'Leaderboard'], ['winners', 'Winners'], ['blank', 'Blank']];
  function drawTop() {
    while (topEl.firstChild) topEl.removeChild(topEl.firstChild);
    var on = Date.now() - screenSeen < 5000;
    topEl.appendChild(h('div', 'mc-brand', [h('img', '', null, { src: 'assets/brand/mark-256.webp', alt: '', width: 28, height: 28 }), h('span', '', 'Offline Event · MC')]));
    topEl.appendChild(h('div', 'mc-proj ' + (on ? 'is-on' : 'is-off'), [
      h('span', 'mc-proj__dot'),
      h('span', 'mc-proj__text', on ? 'Projector connected' + (screenInfo && !screenInfo.full ? ' (not full screen)' : '') : 'Projector not open'),
      btn(on ? 'Open again' : 'Open projector window', 'mc-btn--small' + (on ? '' : ' mc-btn--gold'), openScreen)
    ]));
    var seg = h('div', 'mc-seg', [h('span', 'mc-seg__label', 'On screen:')]);
    SCREENS.forEach(function (x) {
      seg.appendChild(btn(x[1], S.screen === x[0] ? 'is-on' : '', act(function () {
        if (x[0] === 'game' && !S.game) { say('Start a game first.', 'warn'); return; }
        S.screen = x[0];
      })));
    });
    topEl.appendChild(seg);
    var tm = L().currentTimer(S);
    if (S.screen === 'game' && tm && (tm.running || (tm.left > 0 && tm.left < tm.dur))) {
      topEl.appendChild(btn(tm.running ? '❚❚ Pause' : '▶ Resume', 'mc-btn--pause' + (tm.running ? '' : ' is-paused'), act(function () { L().togglePause(S); })));
    }
    if (Date.now() - otherMc < 6000) topEl.appendChild(h('div', 'mc-warn', 'Another MC window is open. Close one of them.'));
  }
  function openScreen() {
    var w = window.open('offline?screen', 'playmonaProjector', 'popup=yes,width=1280,height=720');
    if (!w) say('The browser blocked the window. Open ' + location.origin + '/offline?screen yourself.', 'warn');
    else say('Drag the new window onto the projector, then click it to go full screen.');
    draw();
  }

  /* ---------- side: points and the screen preview ---------- */
  var scoresEl = null;
  function drawSide() {
    if (!scoresEl) {
      // The preview is made once: moving an iframe reloads it.
      scoresEl = h('div', 'mc-side__scores');
      sideEl.appendChild(scoresEl);
      var frame = h('iframe', 'mc-preview__frame', null, { id: 'mcPreview', src: 'offline?screen&preview', title: 'What the projector shows', tabindex: '-1' });
      sideEl.appendChild(card('On the projector now', [h('div', 'mc-preview', frame)], 'mc-card--side'));
    }
    while (scoresEl.firstChild) scoresEl.removeChild(scoresEl.firstChild);
    var list = L().standings(S);
    var box = h('div', 'mc-scores');
    list.forEach(function (r) {
      box.appendChild(h('div', 'mc-score', [
        h('span', 'mc-score__place', String(r.place)), dot(r.team.color),
        h('span', 'mc-score__name', r.team.name),
        btn('−1', 'mc-btn--tiny', act(function () { L().award(S, r.team.id, -1, 'mc', 'MC −1'); })),
        h('b', 'mc-score__pts', String(r.pts)),
        btn('+1', 'mc-btn--tiny mc-btn--gold', act(function () { L().award(S, r.team.id, 1, 'mc', 'MC +1'); }))
      ]));
    });
    scoresEl.appendChild(card('Scores (all games)', [box,
      h('div', 'mc-row', [btn('Show leaderboard', 'mc-btn--small', act(function () { S.screen = 'scores'; })), btn('Announce winners', 'mc-btn--small mc-btn--gold', act(function () { S.screen = 'winners'; }))])
    ], 'mc-card--side'));
  }

  /* ---------- tabs ---------- */
  var TABS = [['setup', 'Setup'], ['pictureRush', 'Picture Rush'], ['quiz', 'Who Knows Vicky Best?'], ['wbw', 'Word by Word'], ['memory', 'Memory'], ['scores', 'Points']];
  function drawMain() {
    while (mainEl.firstChild) mainEl.removeChild(mainEl.firstChild);
    var nav = h('nav', 'mc-tabs');
    TABS.forEach(function (x) {
      var live = S.screen === 'game' && S.game === x[0];
      nav.appendChild(btn([x[1], live ? h('span', 'mc-live', 'LIVE') : null], tab === x[0] ? 'is-on' : '', function () {
        tab = x[0];
        try { sessionStorage.setItem('playmona:offlineTab', tab); } catch (e) {}
        draw();
      }));
    });
    mainEl.appendChild(nav);
    // The message line always takes the same space, so buttons never jump under the MC's mouse.
    var live = flash && Date.now() - flash.at < 8000;
    mainEl.appendChild(h('div', 'mc-flash' + (live ? ' mc-flash--' + flash.kind : ' is-empty'), live ? flash.text : ''));
    var body = h('div', 'mc-body');
    ({ setup: tabSetup, pictureRush: tabPR, quiz: tabQuiz, wbw: tabWbw, memory: tabMemory, scores: tabScores }[tab] || tabSetup)(body);
    mainEl.appendChild(body);
  }

  function showGame(game) { S.game = game; S.screen = 'game'; }

  /* A big "whose turn" box with a live countdown. */
  function turnBox(t, tm, extra) {
    var time = h('div', 'mc-turn__time', timerText(tm), { 'data-timer': '1' });
    time._tm = tm;
    return h('div', 'mc-turn', [
      h('div', 'mc-turn__who', t ? [dot(t.color), h('span', '', t.name)] : '—'),
      time,
      extra || null
    ], t ? { style: '--team:' + t.color } : null);
  }
  function timerText(tm) {
    var left = L().timeLeft(tm), s = Math.ceil(left / 1000);
    if (!tm) return '';
    if (!tm.running && left >= tm.dur) return Math.round(tm.dur / 1000) + ' s · not started';
    if (!tm.running && left > 0) return s + ' s · paused';
    return left <= 0 ? 'Time!' : s + ' s';
  }
  function teamButtons(current, fn) {
    return h('div', 'mc-teampick', L().activeTeams(S).map(function (t) {
      return btn([dot(t.color), t.name], current === t.id ? 'is-on' : '', act(function () { fn(t.id); }));
    }));
  }

  /* ----- Setup ----- */
  function tabSetup(body) {
    var e = S.event;
    body.appendChild(card('The celebration', [
      field('Title on the screen', h('input', 'mc-input', null, { id: 'evTitle', 'data-keep-value': '1', value: e.title, maxlength: 80, oninput: function (x) { e.title = x.target.value; commit(true); } })),
      field('Second line', h('input', 'mc-input', null, { id: 'evTag', 'data-keep-value': '1', value: e.tagline, maxlength: 80, oninput: function (x) { e.tagline = x.target.value; commit(true); } })),
      field('Celebrant\'s first name', h('input', 'mc-input', null, { id: 'evName', 'data-keep-value': '1', value: e.celebrant, maxlength: 30, oninput: function (x) { e.celebrant = x.target.value; commit(true); } }), 'Used in the game titles, e.g. “Who Knows Vicky Best?”')
    ]));

    var teams = h('div', 'mc-teams');
    S.teams.forEach(function (t) {
      var on = S.active.indexOf(t.id) >= 0;
      teams.appendChild(h('div', 'mc-team' + (on ? '' : ' is-off'), [
        h('input', '', null, { type: 'checkbox', checked: on, title: 'Playing tonight', onchange: function (x) { L().setActive(S, t.id, x.target.checked); commit(); } }),
        btn('', 'mc-swatch', act(function () {
          var c = L().TEAM_COLORS, i = c.indexOf(t.color);
          t.color = c[(i + 1) % c.length];
        }), { style: 'background:' + t.color, title: 'Change colour' }),
        h('input', 'mc-input', null, { id: 'tn-' + t.id, 'data-keep-value': '1', value: t.name, maxlength: 30, oninput: function (x) { t.name = x.target.value; commit(true); }, onchange: function () { draw(); } }),
        btn('Remove', 'mc-btn--small mc-btn--ghost', function () {
          if (!confirm('Remove ' + t.name + ' and all of its points?')) return;
          L().removeTeam(S, t.id); commit();
        })
      ]));
    });
    var newName = h('input', 'mc-input', null, { id: 'newTeam', placeholder: 'New team name', maxlength: 30,
      onkeydown: function (x) { if (x.key === 'Enter') add(); } });
    function add() { L().addTeam(S, newName.value); newName.value = ''; commit(); }
    body.appendChild(card('Teams', [
      h('p', 'mc-note', 'Tick the teams that are playing. Turns go round in this order. Click a colour to change it.'),
      teams,
      h('div', 'mc-row', [newName, btn('Add team', 'mc-btn--gold', add)])
    ]));

    var input = h('input', '', null, { type: 'file', accept: 'image/*', multiple: 'multiple', style: 'display:none', onchange: function (x) {
      var files = [].slice.call(x.target.files || []);
      if (!files.length) return;
      say('Adding ' + files.length + ' photo' + (files.length > 1 ? 's' : '') + '…'); draw();
      files.reduce(function (p, f) { return p.then(function () { return Store().addPhoto(S, f); }); }, Promise.resolve())
        .then(function () { say(files.length + ' photo' + (files.length > 1 ? 's' : '') + ' added.', 'ok'); commit(); })
        .catch(function (err) { say(err.message || 'Could not add that photo.', 'warn'); commit(); });
      x.target.value = '';
    } });
    var grid = h('div', 'mc-photos');
    S.photos.forEach(function (p) {
      var img = h('img', '', null, { alt: p.name });
      Store().photoUrl(p.id).then(function (u) { if (u) img.src = u; });
      var isWelcome = S.event.welcomePhotoId === p.id;
      grid.appendChild(h('figure', 'mc-photo' + (isWelcome ? ' is-welcome' : ''), [img, h('figcaption', '', p.name), h('div', 'mc-photo__acts', [
        btn(isWelcome ? '★ Welcome' : '☆ Welcome', 'mc-btn--tiny', act(function () { S.event.welcomePhotoId = isWelcome ? null : p.id; })),
        btn('Delete', 'mc-btn--tiny mc-btn--ghost', function () { if (!confirm('Delete this photo from the laptop?')) return; Store().removePhoto(S, p.id).then(function () { commit(); }); })
      ])]));
    });
    body.appendChild(card('Photos (' + S.photos.length + ')', [
      h('p', 'mc-note', 'Photos of Vicky, family, graduation and friends for Picture Rush and the Welcome screen. They stay on this laptop.'),
      input, btn('Add photos…', 'mc-btn--gold', function () { input.click(); }), grid,
      S.event.welcomePhotoId ? h('label', 'mc-check', [
        h('input', '', null, { type: 'checkbox', checked: !!S.event.welcomeText, onchange: function (x) { S.event.welcomeText = x.target.checked; commit(); } }),
        'Also show the title on top of the Welcome photo'
      ]) : null
    ]));

    body.appendChild(card('Timers', [
      h('div', 'mc-grid2', [
        field('Picture Rush turn (seconds)', secsInput('prTurnMs', 5, 120)),
        field('Word by Word turn (seconds)', secsInput('wbwTurnMs', 3, 60)),
        field('Quiz question (seconds)', secsInput('quizMs', 5, 180)),
        field('Memory: looking time (seconds)', secsInput('memShowMs', 5, 120)),
        field('Memory: writing time (seconds)', secsInput('memWriteMs', 10, 300))
      ])
    ]));

    var imp = h('input', '', null, { type: 'file', accept: '.json,application/json', style: 'display:none', onchange: function (x) {
      var f = x.target.files && x.target.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        Store().importAll(String(r.result)).then(function (s) { S = s; say('Backup loaded.', 'ok'); commit(); }).catch(function (err) { say(err.message || 'Could not read that file.', 'warn'); draw(); });
      };
      r.readAsText(f);
      x.target.value = '';
    } });
    body.appendChild(card('Backup and reset', [
      h('p', 'mc-note', 'Everything saves on this laptop by itself, and survives a refresh or a browser restart. A backup file also lets you move the event to another laptop.'),
      h('div', 'mc-row', [
        btn('Save a backup file', '', function () {
          Store().exportAll(S).then(function (text) {
            var a = h('a', '', null, { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: 'vicky-offline-event-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.json' });
            document.body.appendChild(a); a.click(); a.remove();
          });
        }),
        imp, btn('Load a backup file…', '', function () { imp.click(); }),
        btn('Clear all points', 'mc-btn--ghost', function () { if (!confirm('Clear every team\'s points? This can\'t be undone.')) return; S.awards = []; commit(); }),
        btn('Start the event fresh', 'mc-btn--ghost', function () {
          if (!confirm('Start fresh? Teams, points, games and quiz questions go back to the start. Photos stay.')) return;
          var photos = S.photos, ev = S.event;
          S = L().fresh(); S.photos = photos; S.event = ev; commit();
        })
      ])
    ]));
  }

  /* ----- Picture Rush ----- */
  var prDraft = { photoId: null, size: 4 };
  function tabPR(body) {
    var g = S.pr;
    var live = g && !g.done;
    if (!live) {
      if (g && g.done) {
        var pts = L().prRoundPoints(S);
        body.appendChild(card('Last round: picture complete', [
          h('div', 'mc-result', L().activeTeams(S).map(function (t) { return h('div', 'mc-result__row', [dot(t.color), t.name, h('b', '', '+' + (pts[t.id] || 0))]); })),
          h('div', 'mc-row', [btn('Show it on the projector', '', act(function () { showGame('pictureRush'); }))])
        ]));
      }
      if (!S.photos.length) { body.appendChild(card('Picture Rush', [h('p', 'mc-note', 'Add photos on the Setup tab first.'), btn('Go to Setup', 'mc-btn--gold', function () { tab = 'setup'; draw(); })])); return; }
      if (!prDraft.photoId || !S.photos.some(function (p) { return p.id === prDraft.photoId; })) prDraft.photoId = S.photos[0].id;
      var grid = h('div', 'mc-photos mc-photos--pick');
      S.photos.forEach(function (p) {
        var img = h('img', '', null, { alt: p.name });
        Store().photoUrl(p.id).then(function (u) { if (u) img.src = u; });
        grid.appendChild(h('figure', 'mc-photo' + (prDraft.photoId === p.id ? ' is-picked' : ''), [img, h('figcaption', '', p.name)], { onclick: function () { prDraft.photoId = p.id; draw(); } }));
      });
      var sizes = h('div', 'mc-seg mc-seg--big', [3, 4, 5, 6].map(function (n) {
        return btn(n + ' × ' + n, prDraft.size === n ? 'is-on' : '', function () { prDraft.size = n; draw(); });
      }));
      body.appendChild(card(g ? 'New Picture Rush round' : 'Start Picture Rush', [
        field('1. Pick a photo', grid),
        field('2. How hard?', sizes, (prDraft.size * prDraft.size) + ' tiles'),
        h('div', 'mc-grid2', [
          field('Seconds per turn', secsInput('prTurnMs', 5, 120)),
          field('After a correct move', h('select', 'mc-input', [h('option', '', 'Next team\'s turn', { value: '0' }), h('option', '', 'Same team goes again', { value: '1' })],
            { onchange: function (x) { S.settings.prKeepTurn = x.target.value === '1'; commit(); } }))
        ]),
        h('div', 'mc-row', [btn('Start round and show it', 'mc-btn--gold mc-btn--big', act(function () {
          var p = S.photos.filter(function (x) { return x.id === prDraft.photoId; })[0];
          var aspect = p && p.w && p.h ? Math.max(0.6, Math.min(1.6, p.w / p.h)) : 1;
          L().prStart(S, { photoId: prDraft.photoId, size: prDraft.size, aspect: aspect });
          prPick = -1; showGame('pictureRush');
          say('Round ready. Press “Start turns” when the first team is ready.');
        }))])
      ]));
      var sel = body.querySelector('select');
      if (sel) sel.value = S.settings.prKeepTurn ? '1' : '0';
      return;
    }

    var size = g.size, n = size * size, t = L().turnTeam(S, g);
    var placed = L().prPlaced(g);
    var moveIn = h('input', 'mc-input mc-input--move', null, { id: 'prMove', 'data-keep-value': '1', placeholder: 'e.g. A1 B4', autocomplete: 'off', spellcheck: 'false',
      onkeydown: function (x) { if (x.key === 'Enter') submit(); } });
    function submit() {
      var mv = L().parseMove(moveIn.value, size);
      if (!mv) { say('Type two squares, like “A1 B4” (letters ' + L().LETTERS.charAt(0) + '–' + L().LETTERS.charAt(size - 1) + ', numbers 1–' + size + ').', 'warn'); draw(); return; }
      doMove(mv[0], mv[1]);
    }
    function doMove(a, b) {
      var r = L().prMove(S, a, b);
      prPick = -1;
      var txt = L().coord(a, size) + ' → ' + L().coord(b, size);
      if (r.error === 'locked') say(L().coord(r.pos, size) + ' is already in place. Pick another square.', 'warn');
      else if (r.error === 'same') say('Those are the same square.', 'warn');
      else if (r.error) say('That move did not work.', 'warn');
      else say((r.team ? r.team.name + ': ' : '') + txt + (r.ok ? (r.bonus ? ' ✓ correct, plus a lucky bonus (+2)' : ' ✓ correct (+1)') : ' ✗ not there'), r.ok ? 'ok' : 'no');
      if (!r.error) { var el = document.getElementById('prMove'); if (el) el.value = ''; }
      commit();
      var f = document.getElementById('prMove'); if (f) f.focus();
    }

    var mini = h('div', 'mc-mini', null, { style: '--n:' + size });
    var url = null;
    var cells = [];
    for (var p = 0; p < n; p++) (function (p) {
      var piece = g.tiles[p], home = piece === p;
      var c = h('button', 'mc-mini__cell' + (home ? ' is-home' : '') + (prPick === p ? ' is-pick' : ''), h('span', '', L().coord(p, size)), { type: 'button',
        onclick: function () {
          if (prPick < 0) { if (home) { say(L().coord(p, size) + ' is already in place.', 'warn'); draw(); return; } prPick = p; moveIn.value = L().coord(p, size) + ' '; draw(); return; }
          if (prPick === p) { prPick = -1; moveIn.value = ''; draw(); return; }
          doMove(prPick, p);
        } });
      var row = Math.floor(piece / size), col = piece % size, step = size > 1 ? 100 / (size - 1) : 0;
      c.style.backgroundSize = (size * 100) + '% ' + (size * 100) + '%';
      c.style.backgroundPosition = (col * step) + '% ' + (row * step) + '%';
      cells.push(c);
      mini.appendChild(c);
    })(p);
    Store().photoUrl(g.photoId).then(function (u) { url = u; cells.forEach(function (c) { c.style.backgroundImage = 'url("' + url + '")'; }); });
    if (prPick >= 0) moveIn.value = L().coord(prPick, size) + ' ';

    body.appendChild(h('div', 'mc-split', [
      card('Picture Rush · ' + size + ' × ' + size + ' · ' + placed + ' of ' + n + ' in place', [
        turnBox(t, g.tm, !g.started ? btn('▶ Start turns', 'mc-btn--gold mc-btn--big', act(function () { L().prGo(S); })) : null),
        h('div', 'mc-moveform', [h('span', 'mc-field__label', 'Team says “move A1 to B4”:'), h('div', 'mc-row', [moveIn, btn('Submit move', 'mc-btn--gold mc-btn--big', submit)])]),
        h('p', 'mc-note', 'Or click the tile they name, then the square it goes to. Gold squares are already in place.'),
        h('div', 'mc-row', [
          btn('Skip turn', '', act(function () { L().prSkip(S); prPick = -1; })),
          g.started ? btn(g.tm.running ? '❚❚ Pause timer' : '▶ Resume timer', '', act(function () { L().togglePause(S); })) : null,
          btn('Show on projector', S.screen === 'game' && S.game === 'pictureRush' ? 'is-on' : '', act(function () { showGame('pictureRush'); }))
        ]),
        field('Whose turn is it?', teamButtons(t && t.id, function (id) { L().prSetTurn(S, id); })),
        h('div', 'mc-row mc-row--end', [
          btn('Restart this round', 'mc-btn--ghost', function () { if (!confirm('Reshuffle this photo and take back the points from this round?')) return; L().prRestart(S); prPick = -1; commit(); }),
          btn('End round (keep points)', 'mc-btn--ghost', function () { if (!confirm('End this round now? Points already won stay.')) return; S.pr.done = true; L().tStop(S.pr.tm); S.pr = null; commit(); })
        ])
      ]),
      card('The board (only you see the answers)', [mini])
    ]));
    setTimeout(function () { var f = document.getElementById('prMove'); if (f && document.activeElement === document.body) f.focus(); }, 0);
  }

  /* ----- Who Knows Vicky Best? ----- */
  function tabQuiz(body) {
    var z = S.quiz, qs = L().quizQuestions(S);
    var name = S.event.celebrant || 'Vicky';
    var running = z.phase === 'question';
    if (!running) {
      var notReady = qs.filter(function (q) { return !q.ready; }).length;
      var ta = h('textarea', 'mc-input mc-quiz__text', null, { id: 'quizText', 'data-keep-value': '1', rows: 16, spellcheck: 'true',
        oninput: function (x) { z.text = x.target.value; commit(true); var c = document.getElementById('quizCount'); if (c) c.textContent = countText(); } });
      ta.value = z.text;
      var countText = function () {
        var q = L().quizQuestions(S), bad = q.filter(function (x) { return !x.ready; }).length;
        return q.length + ' questions' + (bad ? ' · ' + bad + ' still need answers' : ' · all ready');
      };
      body.appendChild(card('Who Knows ' + name + ' Best? · questions', [
        h('p', 'mc-note', ['One question per line. Put a ', h('b', '', '|'), ' between the options and a ', h('b', '', '*'), ' before the right one:']),
        h('pre', 'mc-code', 'What is Vicky\'s favourite colour? | Red | *Purple | Green | Gold\nWhere was Vicky born? | = Lusaka        (no options: teams write it, “=” is the answer)'),
        ta,
        h('div', 'mc-quiz__count' + (notReady ? ' is-warn' : ''), countText(), { id: 'quizCount' })
      ]));
      body.appendChild(card('Play', [
        h('div', 'mc-grid2', [
          field('How teams answer', h('select', 'mc-input', [
            h('option', '', 'Teams take turns, out loud', { value: 'turns' }),
            h('option', '', 'All teams at once, on paper', { value: 'all' })
          ], { id: 'quizMode', onchange: function (x) { z.mode = x.target.value; commit(true); } })),
          field('Points for a right answer', h('input', 'mc-input mc-input--num', null, { type: 'number', min: 1, max: 10, value: S.settings.quizPoints, onchange: function (x) { S.settings.quizPoints = Math.max(1, Math.min(10, Number(x.target.value) || 1)); commit(true); } })),
          field('Seconds per question', secsInput('quizMs', 5, 180))
        ]),
        h('div', 'mc-row', [btn(z.phase === 'done' ? 'Play the quiz again' : 'Start the quiz and show it', 'mc-btn--gold mc-btn--big', function () {
          var q = L().quizQuestions(S);
          if (!q.length) { say('Add at least one question.', 'warn'); draw(); return; }
          var bad = q.filter(function (x) { return !x.ready; }).length;
          if (bad && !confirm(bad + ' question(s) have no right answer yet (they will show without one). Start anyway?')) return;
          L().quizStart(S, document.getElementById('quizMode').value); showGame('quiz'); commit();
        }),
        z.phase === 'done' ? btn('Show the quiz results', '', act(function () { showGame('quiz'); })) : null])
      ]));
      body.querySelector('#quizMode').value = z.mode;
      return;
    }

    var q = qs[z.i] || { q: '?', options: [] };
    var t = L().turnTeam(S, z);
    var opts = h('ol', 'mc-quiz__opts', q.options.map(function (o, i) { return h('li', i === q.answer ? 'is-right' : '', ['ABCDEF'.charAt(i) + '. ', o, i === q.answer ? ' ✓' : '']); }));
    var marks = h('div', 'mc-marks', L().activeTeams(S).map(function (tm) {
      var got = L().hasAward(S, L().quizKey(S, z.i, tm.id));
      var isTurn = z.mode === 'turns' && t && t.id === tm.id;
      return h('div', 'mc-mark' + (got ? ' is-got' : '') + (isTurn ? ' is-turn' : ''), [
        dot(tm.color), h('span', 'mc-mark__name', tm.name + (isTurn ? ' (answering)' : '')),
        btn(got ? '✓ Right (+' + S.settings.quizPoints + ')' : 'Mark right', got ? 'mc-btn--gold' : '', act(function () { L().quizMark(S, tm.id, !got); }))
      ]);
    }));
    var last = z.i >= qs.length - 1;
    body.appendChild(h('div', 'mc-split', [
      card('Question ' + (z.i + 1) + ' of ' + qs.length + (z.mode === 'turns' ? ' · teams take turns' : ' · all teams at once'), [
        h('div', 'mc-quiz__q', q.q),
        q.options.length ? opts : h('div', 'mc-quiz__open', 'Open question. Answer: ' + (q.answerText || '(none given)')),
        turnBox(z.mode === 'turns' ? t : null, z.tm),
        h('div', 'mc-row', [
          !z.tm.running && !z.revealed ? btn(L().timeLeft(z.tm) < z.tm.dur ? '▶ Resume timer' : '▶ Start timer', '', act(function () { if (L().timeLeft(z.tm) < z.tm.dur && L().timeLeft(z.tm) > 0) L().tResume(z.tm); else L().quizGo(S); })) : null,
          z.tm.running ? btn('❚❚ Pause timer', '', act(function () { L().togglePause(S); })) : null,
          btn(z.revealed ? 'Answer shown' : 'Reveal the answer', z.revealed ? 'is-on' : 'mc-btn--gold mc-btn--big', act(function () { L().quizReveal(S); }))
        ]),
        h('div', 'mc-row', [
          btn('← Previous', '', act(function () { L().quizGoto(S, z.i - 1); }), { disabled: z.i === 0 }),
          btn(last ? 'Finish quiz and show results' : 'Next question →', 'mc-btn--gold mc-btn--big', act(function () { L().quizGoto(S, z.i + 1); })),
          btn('Show on projector', S.screen === 'game' && S.game === 'quiz' ? 'is-on' : '', act(function () { showGame('quiz'); }))
        ]),
        z.mode === 'turns' ? field('Answering team', teamButtons(t && t.id, function (id) { var i = z.order.indexOf(id); if (i >= 0) z.turn = i; })) : null
      ]),
      card('Who got it right?', [h('p', 'mc-note', z.mode === 'turns' ? 'Mark the answering team. If they miss, you can let another team steal.' : 'After the reveal, mark each team that wrote the right answer.'), marks,
        h('div', 'mc-row mc-row--end', [btn('Stop the quiz', 'mc-btn--ghost', function () { if (!confirm('Stop the quiz? Points so far stay.')) return; z.phase = 'done'; L().tStop(z.tm); commit(); })])])
    ]));
  }

  /* ----- Word by Word ----- */
  function tabWbw(body) {
    var w = S.wbw;
    var name = S.event.celebrant || 'Vicky';
    if (!w || (w.done && S.game !== 'wbw')) {
      var open = h('input', 'mc-input', null, { id: 'wbwOpen', 'data-keep-value': '1', value: (w && w.opening) || 'Dear ' + name + ',', maxlength: 60 });
      body.appendChild(card('Word by Word · a message for ' + name, [
        h('p', 'mc-note', 'Teams take turns adding one word each. You type the word they say. When time runs out, the turn passes on.'),
        field('The message starts with', open),
        h('div', 'mc-grid2', [
          field('Seconds per turn', secsInput('wbwTurnMs', 3, 60)),
          field('Points per word', h('select', 'mc-input', [h('option', '', 'No points (just for fun)', { value: '0' }), h('option', '', '1 point per word', { value: '1' })],
            { id: 'wbwPts', onchange: function (x) { S.settings.wbwPoints = Number(x.target.value); commit(true); } }))
        ]),
        h('div', 'mc-row', [btn('Start Word by Word and show it', 'mc-btn--gold mc-btn--big', act(function () { L().wbwStart(S, open.value.trim()); showGame('wbw'); })),
          w && w.done ? btn('Show the finished message', '', act(function () { showGame('wbw'); })) : null])
      ]));
      body.querySelector('#wbwPts').value = String(S.settings.wbwPoints || 0);
      return;
    }
    var t = L().turnTeam(S, w);
    var word = h('input', 'mc-input mc-input--move', null, { id: 'wbwWord', 'data-keep-value': '1', placeholder: 'Type the word, then Enter', autocomplete: 'off',
      onkeydown: function (x) { if (x.key === 'Enter') add(); } });
    function add() {
      var v = word.value.trim();
      if (!v) return;
      L().wbwAdd(S, v); commit();
      var f = document.getElementById('wbwWord'); if (f) { f.value = ''; f.focus(); }
    }
    body.appendChild(h('div', 'mc-split', [
      card(w.done ? 'The message is finished' : 'Word by Word · ' + w.words.length + ' words', [
        w.done ? null : turnBox(t, w.tm, !w.started ? btn('▶ Start turns', 'mc-btn--gold mc-btn--big', act(function () { L().wbwGo(S); })) : null),
        w.done ? null : h('div', 'mc-moveform', [h('span', 'mc-field__label', 'Word from ' + (t ? t.name : 'the team') + ':'), h('div', 'mc-row', [word, btn('Add word', 'mc-btn--gold mc-btn--big', add)])]),
        h('div', 'mc-row', w.done ? [
          btn('Keep adding words', '', act(function () { w.done = false; })),
          btn('New message', 'mc-btn--ghost', function () { if (!confirm('Start a new message? This one goes away.')) return; S.wbw = null; S.game = S.game === 'wbw' ? null : S.game; if (!S.game) S.screen = 'welcome'; commit(); })
        ] : [
          btn('Pass turn', '', act(function () { L().wbwPass(S); })),
          btn('Undo last word', '', act(function () { L().wbwUndo(S); }), { disabled: !w.words.length }),
          w.started ? btn(w.tm.running ? '❚❚ Pause timer' : '▶ Resume timer', '', act(function () { L().togglePause(S); })) : null,
          btn('Finish and show the message', 'mc-btn--gold', act(function () { L().wbwFinish(S); showGame('wbw'); }))
        ]),
        w.done ? null : field('Whose turn is it?', teamButtons(t && t.id, function (id) { var i = w.order.indexOf(id); if (i >= 0) { w.turn = i; if (w.started) L().tStart(w.tm, S.settings.wbwTurnMs); } })),
        h('div', 'mc-row', [btn('Show on projector', S.screen === 'game' && S.game === 'wbw' ? 'is-on' : '', act(function () { showGame('wbw'); }))])
      ]),
      card('The message so far', [h('div', 'mc-wbw__text', L().wbwText(w) || '…')])
    ]));
    setTimeout(function () { var f = document.getElementById('wbwWord'); if (f && document.activeElement === document.body) f.focus(); }, 0);
  }

  /* ----- Memory Challenge ----- */
  var memCount = 20;
  function tabMemory(body) {
    var m = S.memory;
    if (!m || S.game !== 'memory') {
      body.appendChild(card('Memory Challenge', [
        h('p', 'mc-note', 'Objects appear on the screen for a short time, then hide. Teams write down everything they remember. Then you reveal them and record each team\'s score.'),
        h('div', 'mc-grid2', [
          field('How many objects', h('input', 'mc-input mc-input--num', null, { type: 'number', min: 8, max: 30, value: memCount, onchange: function (x) { memCount = Math.max(8, Math.min(30, Number(x.target.value) || 20)); } })),
          field('Seconds to look', secsInput('memShowMs', 5, 120)),
          field('Seconds to write', secsInput('memWriteMs', 10, 300))
        ]),
        h('div', 'mc-row', [
          btn('Set up and show it', 'mc-btn--gold mc-btn--big', act(function () { L().memStart(S, (FF.OfflineObjects || []).map(function (o) { return o.id; }), memCount); showGame('memory'); })),
          m ? btn('Back to the last round', '', act(function () { showGame('memory'); })) : null
        ])
      ]));
      return;
    }
    var steps = [['ready', '1. Get ready'], ['show', '2. Show objects'], ['hidden', '3. Hide'], ['write', '4. Writing timer'], ['reveal', '5. Reveal']];
    var byId = {};
    (FF.OfflineObjects || []).forEach(function (o) { byId[o.id] = o; });
    var scores = h('div', 'mc-marks', L().activeTeams(S).map(function (t) {
      var inp = h('input', 'mc-input mc-input--num', null, { type: 'number', min: 0, max: 99, value: L().memGot(S, t.id) || '', placeholder: '0',
        onchange: function (x) { L().memScore(S, t.id, x.target.value); commit(); } });
      return h('div', 'mc-mark', [dot(t.color), h('span', 'mc-mark__name', t.name), inp, h('span', 'mc-note', 'remembered')]);
    }));
    body.appendChild(h('div', 'mc-split', [
      card('Memory Challenge · ' + m.items.length + ' objects', [
        h('div', 'mc-steps', steps.map(function (x) {
          return btn(x[1], m.phase === x[0] ? 'is-on' : '', act(function () { L().memPhase(S, x[0]); showGame('memory'); }));
        })),
        (m.phase === 'show' || m.phase === 'write') ? turnBox(null, m.tm, btn(m.tm.running ? '❚❚ Pause' : '▶ Resume', '', act(function () { L().togglePause(S); }))) : null,
        h('p', 'mc-note', m.phase === 'show' ? 'The objects hide by themselves when the time is up.' : 'Step through in order. The writing timer is optional.'),
        h('div', 'mc-row', [
          btn('Pick new objects', 'mc-btn--ghost', act(function () { L().memStart(S, (FF.OfflineObjects || []).map(function (o) { return o.id; }), m.items.length); showGame('memory'); })),
          btn('Show on projector', S.screen === 'game' && S.game === 'memory' ? 'is-on' : '', act(function () { showGame('memory'); }))
        ]),
        h('h3', 'mc-sub', 'Scores: one point per object remembered'), scores
      ]),
      card('The objects (for you)', [h('ol', 'mc-objs', m.items.map(function (id) { var o = byId[id]; return h('li', '', o ? o.name : id); }))])
    ]));
  }

  /* ----- Points ----- */
  var GAME_NAMES = { pictureRush: 'Picture Rush', quiz: 'Quiz', wbw: 'Word by Word', memory: 'Memory', mc: 'MC' };
  function tabScores(body) {
    var list = L().standings(S);
    var byGame = {};
    S.awards.forEach(function (a) { byGame[a.game] = true; });
    var games = Object.keys(GAME_NAMES).filter(function (g) { return byGame[g]; });
    var table = h('table', 'mc-table', [
      h('thead', '', h('tr', '', [h('th', '', '#'), h('th', '', 'Team')].concat(games.map(function (g) { return h('th', '', GAME_NAMES[g]); })).concat([h('th', '', 'Total')]))),
      h('tbody', '', list.map(function (r) {
        return h('tr', '', [h('td', '', String(r.place)), h('td', '', [dot(r.team.color), ' ', r.team.name])].concat(games.map(function (g) {
          return h('td', '', String(L().totals(S, function (a) { return a.game === g; })[r.team.id] || 0));
        })).concat([h('td', '', h('b', '', String(r.pts)))]));
      }))
    ]);
    var teamSel = h('select', 'mc-input', L().activeTeams(S).map(function (t) { return h('option', '', t.name, { value: t.id }); }));
    var ptsIn = h('input', 'mc-input mc-input--num', null, { type: 'number', value: 1, min: -50, max: 50 });
    var noteIn = h('input', 'mc-input', null, { placeholder: 'What for? (optional)', maxlength: 60 });
    body.appendChild(card('Points table', [table, h('div', 'mc-row', [
      btn('Show leaderboard', '', act(function () { S.screen = 'scores'; })),
      btn('Announce winners', 'mc-btn--gold mc-btn--big', act(function () { S.screen = 'winners'; }))
    ])]));
    body.appendChild(card('Give or take points', [h('div', 'mc-row', [teamSel, ptsIn, noteIn, btn('Apply', 'mc-btn--gold', act(function () {
      var p = Math.round(Number(ptsIn.value) || 0);
      if (!p) return;
      L().award(S, teamSel.value, p, 'mc', noteIn.value.trim() || (p > 0 ? 'Bonus' : 'Penalty'));
      say((p > 0 ? '+' : '') + p + ' for ' + L().team(S, teamSel.value).name, 'ok');
    }))])]));
    var hist = S.awards.slice(-40).reverse();
    body.appendChild(card('Latest points', [hist.length ? h('div', 'mc-hist', hist.map(function (a) {
      var t = L().team(S, a.teamId);
      return h('div', 'mc-hist__row', [
        h('span', 'mc-hist__time', new Date(a.at).toTimeString().slice(0, 5)),
        dot(t ? t.color : '#888'), h('span', 'mc-hist__team', t ? t.name : '?'),
        h('span', 'mc-hist__pts', (a.pts > 0 ? '+' : '') + a.pts),
        h('span', 'mc-hist__note', (GAME_NAMES[a.game] || a.game) + (a.note ? ' · ' + a.note : '')),
        btn('Undo', 'mc-btn--tiny mc-btn--ghost', act(function () { S.awards = S.awards.filter(function (x) { return x.id !== a.id; }); }))
      ]);
    })) : h('p', 'mc-note', 'No points yet.')]));
  }

  /* ---------- start ---------- */
  function start() {
    document.body.classList.add('mc-page');
    S = Store().load();
    topEl = h('header', 'mc-top');
    mainEl = h('main', 'mc-main');
    sideEl = h('aside', 'mc-side');
    root = h('div', 'mc', [topEl, h('div', 'mc-cols', [mainEl, sideEl])]);
    document.body.appendChild(root);
    Store().onChange(function (m) {
      if (m.type === 'screen') { var was = Date.now() - screenSeen < 5000; screenSeen = Date.now(); screenInfo = m; if (!was) drawTop(); }
      if (m.type === 'mc' && m.id !== me) { var had = Date.now() - otherMc < 6000; otherMc = Date.now(); if (!had) drawTop(); }
    });
    Store().save(S);
    draw();
    // The MC's clock: turns pass on when time is up, and the countdowns here stay live.
    setInterval(function () {
      if (L().tick(S)) commit();
      [].forEach.call(document.querySelectorAll('[data-timer]'), function (el) {
        var tm = el._tm;
        el.textContent = timerText(tm);
        el.classList.toggle('is-low', !!(tm && tm.running && L().timeLeft(tm) <= 5000));
      });
    }, 200);
    setInterval(function () {
      Store().send({ type: 'mc', id: me });
      var on = Date.now() - screenSeen < 5000;
      if (on !== drawTop.on) { drawTop.on = on; drawTop(); }
      if (flash && Date.now() - flash.at > 8000) { flash = null; var f = document.querySelector('.mc-flash'); if (f) { f.className = 'mc-flash is-empty'; f.textContent = ''; } }
    }, 1000);
  }

  FF.OfflineMC = { start: start };
})();
