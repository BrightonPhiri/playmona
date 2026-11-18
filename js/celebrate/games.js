/* PlayMona Celebrations: the organiser's games (FF.CelebrateGames).
     FF.CelebrateGames.tab(panel, ev)       the dashboard's Games tab: the list, New game, and
                                            the live panel while a game is being played
     view celebrationGame { id, gameId }    the game editor: content, settings, preview, publish
   Games are made from templates (Picture Rush first). Everything is saved through the PHP API;
   only the live panel opens a Firebase connection, and only while a game is on.
   Classic script, ES2017 or older. */
window.FF = window.FF || {};
(function () {
  'use strict';

  var C = function () { return FF.Celebrate; };
  var R = function () { return FF.PictureRushRules; };
  function t(k, f, v) { return FF.t(k, f, v); }
  function el(tag, attrs, kids) { return FF.ui.el(tag, attrs, kids); }
  function div(cls, kids) { return FF.ui.div(cls, kids); }
  function icon(k) { return FF.Icons.icon(k); }
  function devMode() { return !!(FF.Net && FF.Net.devMode && FF.Net.devMode()); }

  var TEMPLATES = [
    { id: 'pictureRush', icon: 'puzzle-piece', name: ['celPrName', 'Picture Rush'],
      text: ['celPrText', 'Each team rebuilds a scrambled photo together, swapping tiles on their phones. The fastest team wins the round.'] }
  ];
  var LEVELS = {
    easy: ['celLvEasy', 'Easy · 3 × 3'], medium: ['celLvMedium', 'Medium · 4 × 4'],
    hard: ['celLvHard', 'Hard · 5 × 5'], expert: ['celLvExpert', 'Expert · 6 × 6']
  };
  var STATUS = {
    draft: ['celGameDraft', 'Draft'], published: ['celGameReady', 'Ready to play'], inactive: ['celGameOff', 'Switched off']
  };

  function template(id) {
    for (var i = 0; i < TEMPLATES.length; i++) if (TEMPLATES[i].id === id) return TEMPLATES[i];
    return { id: id, icon: 'game-controller', name: ['', id], text: ['', ''] };
  }
  function mins(s) { return s < 60 ? t('celSecs', '{n} s', { n: s }) : (s % 60 ? Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60) : t('celMins', '{n} min', { n: s / 60 })); }
  function clock(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
  }
  function post(ev, path, body) { return FF.Api.call('POST', '/c/' + ev.id + path, body || {}); }

  /* ================= The Games tab ================= */

  function tab(panel, ev) {
    var box = div('cel-games');
    panel.appendChild(box);
    box.appendChild(FF.UI.loading(t('loading', 'Loading…')));
    var last = null;
    var live = null;     // the live panel: kept across redraws, and after the game ends until closed

    function load() {
      return FF.Api.call('GET', '/c/' + ev.id + '/games').then(function (r) {
        var key = JSON.stringify(r);
        if (key !== last) { last = key; draw(r); }
      }, function (e) {
        FF.ui.clear(box);
        box.appendChild(FF.UI.emptyState({ icon: 'alert', title: t('celLoadFailed', 'That did not load'), text: e.message,
          action: { label: t('tryAgain', 'Try again'), icon: 'restart', onClick: load } }));
      });
    }

    function draw(r) {
      FF.ui.clear(box);
      if (r.active && (!live || live.runId !== r.active.runId)) {
        if (live) live.stop();
        live = livePanel(ev, r.active, function () { return box.isConnected; }, function () { live = null; last = null; load(); });
      }
      if (live && !r.active && !live.ended()) { live.stop(); live = null; }
      if (live) box.appendChild(live.el);
      var head = div('cel-games__head');
      head.appendChild(el('h2', { class: 'cel-section-title' }, t('celGames', 'Games')));
      head.appendChild(FF.UI.button(t('celNewGame', 'New game'), { class: 'btn-primary btn-sm', icon: 'plus', onClick: newGame }));
      box.appendChild(head);
      if (!r.games.length) {
        box.appendChild(FF.UI.emptyState({
          icon: 'puzzle-piece', title: t('celNoGames', 'No games yet'),
          text: t('celNoGamesText', 'Make a Picture Rush from your own photos. Teams race to rebuild each picture.'),
          action: { label: t('celNewGame', 'New game'), icon: 'plus', onClick: newGame }
        }));
        return;
      }
      var ul = el('ul', { class: 'cel-gamelist' });
      r.games.forEach(function (g) { ul.appendChild(gameCard(g, r.active)); });
      box.appendChild(ul);
      if (!ev.stats.teams) box.appendChild(el('p', { class: 'hint' }, t('celGamesNeedTeams', 'Games are played in teams. Set up the teams before you start one.')));
    }

    function newGame() {
      var list = el('ul', { class: 'cel-templates' });
      var dlg = null;
      TEMPLATES.forEach(function (tp) {
        var b = el('button', { type: 'button', class: 'cel-template' });
        b.appendChild(icon(tp.icon));
        var txt = div('cel-template__text');
        txt.appendChild(el('strong', {}, C().label(tp.name)));
        txt.appendChild(el('span', {}, C().label(tp.text)));
        b.appendChild(txt);
        b.addEventListener('click', function () {
          b.disabled = true;
          post(ev, '/games', { template: tp.id, name: C().label(tp.name) }).then(function (g) {
            if (dlg) dlg.close();
            FF.Nav.go('celebrationGame', { id: ev.id, gameId: g.id });
          }, function (e) { b.disabled = false; FF.UI.toast(e.message); });
        });
        var li = el('li', {});
        li.appendChild(b);
        list.appendChild(li);
      });
      list.appendChild(el('li', { class: 'cel-template-soon' }, t('celMoreGamesSoon', 'More games are on the way: Word by Word, quizzes and more.')));
      dlg = FF.UI.sheet({ title: t('celPickTemplate', 'Choose a game'), body: list });
    }

    function gameCard(g, active) {
      var tp = template(g.template);
      var li = el('li', { class: 'cel-game is-' + g.status });
      var pic = div('cel-game__pic');
      if (g.thumb) pic.appendChild(el('img', { src: g.thumb, alt: '', loading: 'lazy' }));
      else pic.appendChild(icon(tp.icon));
      li.appendChild(pic);
      var body = div('cel-game__body');
      body.appendChild(el('strong', { class: 'cel-game__name' }, g.name));
      var bits = [C().label(tp.name)];
      if (g.template === 'pictureRush') {
        bits.push(t(g.photos === 1 ? 'celPhotoOne' : 'celPhotoMany', g.photos === 1 ? '1 photo' : '{n} photos', { n: g.photos }));
        if (g.level) bits.push(C().label(LEVELS[g.level]).split(' · ')[0]);
        if (g.seconds) bits.push(t('celPerPicture', '{time} a picture', { time: mins(g.seconds) }));
      }
      body.appendChild(el('span', { class: 'cel-game__meta' }, bits.join(' · ')));
      body.appendChild(el('span', { class: 'cel-status cel-status--' + g.status }, C().label(STATUS[g.status] || ['', g.status])));
      li.appendChild(body);

      var acts = div('cel-game__acts');
      var live = active && active.gameId === g.id;
      if (g.status === 'published' && !live) {
        var go = FF.UI.button(t('celStart', 'Start'), { class: 'btn-primary btn-sm', icon: 'play', onClick: function () { startGame(g, go, active); } });
        acts.appendChild(go);
      }
      if (live) acts.appendChild(el('span', { class: 'cel-status cel-status--live' }, t('celPlayingNow', 'Playing now')));
      acts.appendChild(FF.UI.button(t('edit', 'Edit'), { class: 'btn-ghost btn-sm', icon: 'pencil', onClick: function () { FF.Nav.go('celebrationGame', { id: ev.id, gameId: g.id }); } }));
      acts.appendChild(FF.UI.button(t('celMore', 'More'), { class: 'btn-ghost btn-sm', icon: 'chevron-down', ariaLabel: t('celMoreActions', 'More for {name}', { name: g.name }), onClick: function () { more(g, live); } }));
      li.appendChild(acts);
      return li;
    }

    function act(g, action, done) {
      return post(ev, '/games/' + g.id + '/' + action).then(function (r) {
        if (done) FF.UI.toast(done);
        last = null;
        load();
        return r;
      }, function (e) { FF.UI.toast(e.message); });
    }

    function more(g, live) {
      var items = [];
      if (g.status === 'draft') items.push([t('celPublish', 'Publish'), 'check', function () { act(g, 'publish', t('celPublished', 'Published. You can start it now.')); }]);
      if (g.status === 'published' && !live) items.push([t('celUnpublish', 'Back to draft'), 'pencil', function () { act(g, 'unpublish'); }]);
      if (g.status !== 'inactive' && !live) items.push([t('celDeactivate', 'Switch off'), 'eye-slash', function () { act(g, 'deactivate', t('celSwitchedOff', 'Switched off. Guests will not see it.')); }]);
      if (g.status === 'inactive') items.push([t('celReactivate', 'Switch on again (as a draft)'), 'eye', function () { act(g, 'unpublish'); }]);
      items.push([t('celDuplicate', 'Duplicate'), 'copy', function () { act(g, 'duplicate', t('celDuplicated', 'Copied. The copy is a draft.')); }]);
      if (!live) items.push([t('delete', 'Delete'), 'trash', function () {
        FF.UI.confirm({
          title: t('celDeleteGame', 'Delete {name}?', { name: g.name }),
          body: t('celDeleteGameText', 'The game is deleted. Points already won stay on the leaderboard.'),
          confirmLabel: t('delete', 'Delete'), danger: true,
          onConfirm: function () { act(g, 'delete', t('celGameDeleted', 'Game deleted')); }
        });
      }, true]);
      var list = el('ul', { class: 'cel-menu' });
      var dlg = null;
      items.forEach(function (it) {
        var b = FF.UI.button(it[0], { class: 'btn-ghost btn-block cel-menu__item' + (it[3] ? ' is-danger' : ''), icon: it[1], onClick: function () { if (dlg) dlg.close(); it[2](); } });
        var li = el('li', {});
        li.appendChild(b);
        list.appendChild(li);
      });
      dlg = FF.UI.sheet({ title: g.name, body: list });
    }

    function startGame(g, btn, active) {
      if (active) { FF.UI.toast(t('celOneAtATime', 'Another game is being played. End it first.')); return; }
      FF.UI.confirm({
        title: t('celStartTitle', 'Start {name}?', { name: g.name }),
        body: t('celStartText', 'The game opens on every guest\'s phone and starts after a 10 second countdown. Guests need the event page open.'),
        confirmLabel: t('celStart', 'Start'), icon: 'play',
        onConfirm: function () {
          FF.UI.busy(btn, true);
          post(ev, '/games/' + g.id + '/start').then(function (r) {
            return devMode() ? loadDev().then(function (d) { return d.host(r); }) : r;
          }).then(function () {
            FF.UI.toast(t('celStarted', 'Started! Guests\' phones are counting down.'));
            last = null;
            load();
          }, function (e) { FF.UI.busy(btn, false); FF.UI.toast(e.message); });
        }
      });
    }

    load();
    // Pick up a game ending, or one started from another device, while this tab is open.
    var poll = setInterval(function () {
      if (!box.isConnected) { clearInterval(poll); return; }
      if (!document.hidden && !document.querySelector('.ff-dialog')) load();
    }, 15000);
  }

  /* Local development has no crew runner: this tab referees (js/celebrate/dev.js, loaded on demand). */
  function loadDev() {
    if (FF.CelebrateDev) return Promise.resolve(FF.CelebrateDev);
    var files = ['js/celebrate/pictureRush/referee.js', 'js/celebrate/dev.js'];
    return files.reduce(function (p, src) {
      return p.then(function () {
        return new Promise(function (resolve, reject) {
          var s = document.createElement('script');
          s.src = src;
          s.onload = resolve;
          s.onerror = function () { reject(new Error('Could not load ' + src)); };
          document.head.appendChild(s);
        });
      });
    }, Promise.resolve()).then(function () { return FF.CelebrateDev; });
  }

  /* ================= The live panel ================= */

  function livePanel(ev, active, alive, reload) {
    var card = el('section', { class: 'cel-live', 'aria-live': 'polite' });
    var head = div('cel-live__head');
    head.appendChild(el('span', { class: 'cel-live__dot', 'aria-hidden': 'true' }));
    head.appendChild(el('strong', {}, t('celLiveNow', 'Playing now: {name}', { name: active.name })));
    var timer = el('span', { class: 'cel-live__timer', role: 'timer' });
    head.appendChild(timer);
    card.appendChild(head);
    var status = el('p', { class: 'cel-live__status' }, t('celConnecting', 'Connecting…'));
    card.appendChild(status);
    var teams = el('ul', { class: 'cel-live__teams' });
    card.appendChild(teams);
    var acts = div('cel-live__acts');
    card.appendChild(acts);

    var T = null, off = null, v = null, ticker = null, gone = false;
    var pauseBtn = FF.UI.button(t('celPause', 'Pause'), { class: 'btn-secondary btn-sm', icon: 'pause', onClick: function () { control(v && v.paused ? 'resume' : 'pause', pauseBtn); } });
    var nextBtn = FF.UI.button(t('celNext', 'Next'), { class: 'btn-secondary btn-sm', icon: 'arrow-right', onClick: function () { control('next', nextBtn); } });
    var endBtn = FF.UI.button(t('celEndGame', 'End game'), { class: 'btn-danger-soft btn-sm', icon: 'flag', onClick: function () {
      FF.UI.confirm({
        title: t('celEndTitle', 'End {name} now?', { name: active.name }),
        body: t('celEndText', 'The game stops for everyone. Points won so far count, and unfinished pictures score their tiles in place.'),
        confirmLabel: t('celEndGame', 'End game'), danger: true,
        onConfirm: function () { control('end', endBtn); }
      });
    } });
    [pauseBtn, nextBtn, endBtn].forEach(function (b) { acts.appendChild(b); });

    function control(action, btn) {
      FF.UI.busy(btn, true);
      post(ev, '/play/control', { action: action }).then(function (r) {
        // Locally the referee runs in this tab on the dev transport, so the control goes there too.
        if (devMode() && T) return T.set('control', r.control);
        return null;
      }).then(function () { FF.UI.busy(btn, false); }, function (e) { FF.UI.busy(btn, false); FF.UI.toast(e.message); });
    }

    function stop() {
      gone = true;
      if (ticker) clearInterval(ticker);
      if (typeof off === 'function') off();
    }

    var PHASE = {
      starting: ['celPhStarting', 'Counting down. Guests see the instructions.'],
      reveal: ['celPhReveal', 'Showing picture {n} of {total}.'],
      playing: ['celPhPlaying', 'Picture {n} of {total}: teams are swapping tiles.'],
      roundEnd: ['celPhRoundEnd', 'Picture {n} of {total} is over. The scores are up.'],
      ended: ['celPhEnded', 'The game is over.']
    };

    function draw() {
      if (!v) return;
      var p = PHASE[v.phase] || ['', ''];
      status.textContent = (v.paused ? t('celPausedNow', 'Paused.') + ' ' : '') + t(p[0], p[1], { n: v.round + 1, total: v.rounds });
      pauseBtn.hidden = v.phase === 'ended' || v.phase === 'starting';
      FF.ui.clear(pauseBtn);
      pauseBtn.appendChild(icon(v.paused ? 'play' : 'pause'));
      pauseBtn.appendChild(FF.ui.span('', v.paused ? t('celResume', 'Resume') : t('celPause', 'Pause')));
      nextBtn.hidden = v.phase === 'ended';
      FF.ui.clear(nextBtn);
      nextBtn.appendChild(icon('arrow-right'));
      nextBtn.appendChild(FF.ui.span('', v.phase === 'playing' ? t('celEndPicture', 'End this picture')
        : v.phase === 'roundEnd' && v.round + 1 >= v.rounds ? t('celFinalResults', 'Final results') : t('celNext', 'Next')));
      endBtn.hidden = v.phase === 'ended';

      FF.ui.clear(teams);
      var ids = Object.keys(v.teams || {});
      var totals = v.totals || {};
      ids.sort(function (a, b) { return ((totals[b] || {}).points || 0) - ((totals[a] || {}).points || 0); });
      ids.forEach(function (tid) {
        var tm = v.teams[tid];
        var b = (v.boards || {})[tid] || {};
        var n = R().list(b.tiles).length || 1;
        var li = el('li', { class: 'cel-live__team' + (b.solved ? ' is-done' : '') });
        li.style.setProperty('--team', tm.color);
        var name = div('cel-live__name');
        name.appendChild(el('span', { class: 'cel-live__swatch', 'aria-hidden': 'true' }));
        name.appendChild(el('strong', {}, tm.name));
        name.appendChild(el('span', { class: 'cel-live__people' }, t('celPlayersN', '{n} playing', { n: Object.keys(tm.players || {}).length })));
        li.appendChild(name);
        if (v.phase === 'playing' || v.phase === 'roundEnd') {
          var bar = el('span', { class: 'cel-live__bar', role: 'img', 'aria-label': t('celTilesOf', '{n} of {total} tiles in place', { n: b.correct || 0, total: n }) });
          var fill = el('span', {});
          fill.style.width = Math.round(100 * (b.correct || 0) / n) + '%';
          bar.appendChild(fill);
          li.appendChild(bar);
        }
        li.appendChild(el('span', { class: 'cel-live__pts' }, b.solved ? t('celSolvedShort', 'Solved') + ' · ' + t('celPts', '{n} pts', { n: (totals[tid] || {}).points || 0 }) : t('celPts', '{n} pts', { n: (totals[tid] || {}).points || 0 })));
        teams.appendChild(li);
      });
      if (v.phase === 'ended') {
        var res = v.result || {};
        var names = R().list(res.winners).map(function (id) { return (v.teams[id] || {}).name; }).filter(Boolean);
        if (!R().list(res.rows).some(function (r) { return r.points > 0; })) names = [];
        head.querySelector('strong').textContent = t('celLiveDone', 'Finished: {name}', { name: active.name });
        head.querySelector('.cel-live__dot').hidden = true;
        status.textContent = names.length ? t(names.length > 1 ? 'celWinnersAre' : 'celWinnerIs', names.length > 1 ? 'A tie! Winners: {names}' : 'Winner: {names}!', { names: names.join(' & ') }) : t('celNoScore', 'The game is over. Nobody scored this time.');
        if (!card.querySelector('.cel-live__done')) {
          acts.appendChild(FF.UI.button(t('celDoneClose', 'Close'), { class: 'btn-primary btn-sm cel-live__done', icon: 'check', onClick: function () { stop(); reload(); } }));
        }
      }
      tick();
    }

    function tick() {
      if (!alive()) { stop(); return; }
      if (!v) return;
      var due = { starting: v.startAt, reveal: v.revealUntil, playing: v.deadline, roundEnd: v.nextAt }[v.phase] || 0;
      timer.textContent = v.phase === 'ended' || !due ? '' : clock(due - (v.paused ? v.pausedAt : T.serverNow()));
    }

    // The organiser is let in to watch by GET /play (it marks them as a viewer).
    FF.Api.call('GET', '/c/' + ev.id + '/play').then(function () {
      return FF.Transport.open('celebrations/' + ev.id);
    }).then(function (tr) {
      if (gone) return;
      T = tr;
      off = T.watch('run', function (val) {
        if (gone) return;
        if (val && val.runId === active.runId) { v = val; draw(); }
      });
      ticker = setInterval(tick, 500);
    }, function (e) { status.textContent = (e && e.message) || t('celLiveFailed', 'We could not connect for the games. Check your connection and reload.'); });
    return { el: card, runId: active.runId, stop: stop, ended: function () { return !!(v && v.phase === 'ended'); } };
  }

  /* ================= The game editor ================= */

  function editorView(main, params) {
    params = params || {};
    if (!params.id || !params.gameId) { FF.Nav.replace('celebrations'); return; }
    main.appendChild(FF.UI.button(t('celBackToGames', 'Games'), { class: 'btn-ghost btn-sm cel-back', icon: 'arrow-left', onClick: back }));
    var shell = div('cel-editor');
    main.appendChild(shell);
    shell.appendChild(FF.UI.loading(t('loading', 'Loading…')));
    var g = null, draft = null, dirty = false, saveBtn = null, pubBtn = null;

    function back() {
      if (dirty) {
        FF.UI.confirm({
          title: t('celUnsavedTitle', 'Leave without saving?'), body: t('celUnsavedText', 'Your changes to this game are not saved yet.'),
          confirmLabel: t('celLeave', 'Leave'), danger: true,
          onConfirm: function () { dirty = false; FF.Nav.go('celebration', { id: params.id, tab: 'games' }); }
        });
        return;
      }
      FF.Nav.go('celebration', { id: params.id, tab: 'games' });
    }

    function changed() {
      dirty = true;
      if (saveBtn) saveBtn.disabled = false;
    }

    FF.Api.call('GET', '/c/' + params.id + '/games/' + params.gameId).then(function (r) {
      g = r;
      draft = JSON.parse(JSON.stringify({ name: g.name, instructions: g.instructions, config: g.config }));
      render();
    }, function (e) {
      FF.ui.clear(shell);
      shell.appendChild(FF.UI.emptyState({ icon: 'alert', title: t('celLoadFailed', 'That did not load'), text: e.message }));
    });

    function render() {
      FF.ui.clear(shell);
      var tp = template(g.template);
      document.title = g.name + ' · ' + FF.Brand.name;
      var head = div('cel-editor__head');
      head.appendChild(icon(tp.icon));
      var ht = div('');
      ht.appendChild(el('h1', { class: 'cel-editor__title' }, g.name));
      ht.appendChild(el('span', { class: 'cel-status cel-status--' + g.status }, C().label(STATUS[g.status] || ['', g.status])));
      head.appendChild(ht);
      shell.appendChild(head);

      shell.appendChild(el('h2', { class: 'cel-section-title' }, t('celStepGameAbout', 'About the game')));
      var nm = textInput(draft.name, { max: 80, onInput: function (v) { draft.name = v; changed(); } });
      shell.appendChild(field(t('celGameName', 'Name'), nm));
      var ins = textInput(draft.instructions, { multiline: true, max: 400, onInput: function (v) { draft.instructions = v; changed(); } });
      shell.appendChild(field(t('celGameHow', 'Instructions for the guests'), ins, t('celGameHowHint', 'Shown on every phone during the countdown.')));

      if (g.template === 'pictureRush') pictureRushFields();

      var bar = div('cel-savebar');
      saveBtn = FF.UI.button(t('celSaveChanges', 'Save changes'), { class: 'btn-secondary', icon: 'check', onClick: function () { save().then(function () { FF.UI.toast(t('saved', 'Saved')); }, function () {}); } });
      saveBtn.disabled = !dirty;
      bar.appendChild(saveBtn);
      if (g.status !== 'published') {
        pubBtn = FF.UI.button(t('celSavePublish', 'Save and publish'), { class: 'btn-primary', icon: 'play', onClick: function () {
          FF.UI.busy(pubBtn, true);
          save().then(function () {
            return FF.Api.call('POST', '/c/' + params.id + '/games/' + g.id + '/publish', {});
          }).then(function (r) {
            g = r;
            FF.UI.toast(t('celPublished', 'Published. You can start it now.'));
            FF.Nav.go('celebration', { id: params.id, tab: 'games' });
          }, function (e) { FF.UI.busy(pubBtn, false); if (e && e.message) FF.UI.toast(e.message); });
        } });
        bar.appendChild(pubBtn);
      }
      shell.appendChild(bar);
    }

    function save() {
      if (!draft.name.trim()) { FF.UI.toast(t('celNeedGameName', 'Give the game a name.')); return Promise.reject(new Error('')); }
      var cfg = JSON.parse(JSON.stringify(draft.config));
      cfg.photos = (cfg.photos || []).map(function (p) { return { id: p.id, title: p.title || '', hint: p.hint || '' }; });
      FF.UI.busy(saveBtn, true);
      return FF.Api.call('POST', '/c/' + params.id + '/games/' + g.id + '/save', { name: draft.name, instructions: draft.instructions, config: cfg }).then(function (r) {
        g = r;
        draft = JSON.parse(JSON.stringify({ name: g.name, instructions: g.instructions, config: g.config }));
        dirty = false;
        render();
        return r;
      }, function (e) { FF.UI.busy(saveBtn, false); FF.UI.toast(e.message); throw e; });
    }

    /* ---------- Picture Rush ---------- */

    function pictureRushFields() {
      var cfg = draft.config;
      cfg.photos = cfg.photos || [];
      shell.appendChild(el('h2', { class: 'cel-section-title' }, t('celPrPhotos', 'Photos')));
      shell.appendChild(el('p', { class: 'hint' }, t('celPrPhotosHint', 'Each photo is one round. Clear photos with faces and bright colours work best. The title shows after the round; the hint helps a team that asks for one.')));
      var list = el('ol', { class: 'cel-photos' });
      shell.appendChild(list);

      function drawPhotos() {
        FF.ui.clear(list);
        cfg.photos.forEach(function (p, i) {
          var li = el('li', { class: 'cel-photo' });
          li.appendChild(el('img', { class: 'cel-photo__img', src: p.thumb || '', alt: p.title || t('celPhotoN', 'Photo {n}', { n: i + 1 }) }));
          var f = div('cel-photo__fields');
          var title = textInput(p.title, { max: 60, placeholder: t('celPhotoTitlePh', 'Title, e.g. Graduation day'), onInput: function (v) { p.title = v; changed(); } });
          title.setAttribute('aria-label', t('celPhotoTitleN', 'Title of photo {n}', { n: i + 1 }));
          f.appendChild(title);
          var hint = textInput(p.hint, { max: 120, placeholder: t('celPhotoHintPh', 'Hint (optional), e.g. Look for the cake'), onInput: function (v) { p.hint = v; changed(); } });
          hint.setAttribute('aria-label', t('celPhotoHintN', 'Hint for photo {n}', { n: i + 1 }));
          f.appendChild(hint);
          li.appendChild(f);
          var tools = div('cel-photo__tools');
          var up = FF.UI.iconButton('arrow-up', t('celMoveUp', 'Move up'), function () { move(i, -1); }, 'btn-ghost btn-sm');
          up.disabled = i === 0;
          var down = FF.UI.iconButton('arrow-down', t('celMoveDown', 'Move down'), function () { move(i, 1); }, 'btn-ghost btn-sm');
          down.disabled = i === cfg.photos.length - 1;
          tools.appendChild(up);
          tools.appendChild(down);
          tools.appendChild(FF.UI.iconButton('trash', t('celRemovePhoto', 'Remove photo {n}', { n: i + 1 }), function () { cfg.photos.splice(i, 1); fitRounds(); changed(); drawPhotos(); }, 'btn-ghost btn-sm'));
          li.appendChild(tools);
          list.appendChild(li);
        });
        addBtn.disabled = cfg.photos.length >= R().MAX_PHOTOS;
        drawRounds();
      }

      function move(i, d) {
        var p = cfg.photos.splice(i, 1)[0];
        cfg.photos.splice(i + d, 0, p);
        changed();
        drawPhotos();
      }

      var addBtn = FF.UI.button(t('celAddPhotos', 'Add photos'), { class: 'btn-secondary', icon: 'images', onClick: function () { pick(); } });
      var progress = el('p', { class: 'hint', 'aria-live': 'polite' });
      shell.appendChild(addBtn);
      shell.appendChild(progress);

      function pick() {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/jpeg,image/png,image/webp,image/heic,image/*';
        input.multiple = true;
        input.style.display = 'none';
        input.addEventListener('change', function () {
          var files = Array.prototype.slice.call(input.files || [], 0, R().MAX_PHOTOS - cfg.photos.length);
          if (input.parentNode) input.parentNode.removeChild(input);
          upload(files, 0);
        });
        document.body.appendChild(input);
        input.click();
      }

      function upload(files, i) {
        if (i >= files.length) { progress.textContent = ''; addBtn.disabled = cfg.photos.length >= R().MAX_PHOTOS; return; }
        addBtn.disabled = true;
        progress.textContent = t('celUploadingN', 'Uploading photo {n} of {total}…', { n: i + 1, total: files.length });
        C().shrinkPicture(files[i], 2048).then(function (blob) {
          return FF.Api.upload('/c/' + params.id + '/media?purpose=puzzle', blob);
        }).then(function (m) {
          cfg.photos.push({ id: m.id, title: '', hint: '', thumb: m.thumb, play: m.play });
          fitRounds(true);
          changed();
          drawPhotos();
          upload(files, i + 1);
        }, function (e) {
          FF.UI.toast(e.message);
          upload(files, i + 1);
        });
      }

      // Settings
      shell.appendChild(el('h2', { class: 'cel-section-title' }, t('celPrHowHard', 'How hard')));
      shell.appendChild(field(t('celPrLevel', 'Grid'), FF.UI.segmented({
        label: t('celPrLevel', 'Grid'), value: cfg.level, compact: true,
        options: R().LEVELS.map(function (l) { return { label: C().label(LEVELS[l]), value: l }; }),
        onChange: function (v) { cfg.level = v; changed(); }
      }), t('celPrLevelHint', 'More tiles take longer. Medium suits most groups.')));
      shell.appendChild(field(t('celPrSeconds', 'Time for each picture'), select(R().SECONDS.map(function (s) { return [String(s), mins(s)]; }), String(cfg.seconds), function (v) { cfg.seconds = Number(v); changed(); })));
      var roundsWrap = div('');
      shell.appendChild(roundsWrap);
      function drawRounds() {
        FF.ui.clear(roundsWrap);
        var n = Math.max(1, cfg.photos.length);
        var opts = [];
        for (var i = 1; i <= n; i++) opts.push([String(i), String(i)]);
        roundsWrap.appendChild(field(t('celPrRounds', 'Pictures to play'), select(opts, String(Math.min(cfg.rounds || n, n)), function (v) { cfg.rounds = Number(v); changed(); }),
          t('celPrRoundsHint', 'Played in the order above. Add more photos to play more rounds.')));
      }
      function fitRounds(grow) {
        var n = Math.max(1, cfg.photos.length);
        if (grow && cfg.rounds === n - 1) cfg.rounds = n;
        cfg.rounds = Math.min(Math.max(1, cfg.rounds || n), n);
      }
      shell.appendChild(field(t('celPrReveal', 'Show the picture first'), select(R().REVEAL.map(function (s) { return [String(s), s ? t('celPrRevealS', 'For {n} seconds', { n: s }) : t('celPrNoReveal', 'No, start scrambled')]; }), String(cfg.reveal), function (v) { cfg.reveal = Number(v); changed(); })));
      shell.appendChild(field(t('celPrHints', 'Peeks for each team'), select(R().HINTS.map(function (s) { return [String(s), s ? String(s) : t('celNone', 'None')]; }), String(cfg.hints), function (v) { cfg.hints = Number(v); changed(); }),
        t('celPrHintsHint', 'A peek shows the whole picture for 3 seconds and costs points.')));

      // Scoring
      var sc = el('details', { class: 'cel-scoring' });
      sc.appendChild(el('summary', {}, t('celPrScoring', 'Points')));
      var S = cfg.scoring;
      [['base', t('celPrBase', 'For finishing the picture')], ['speed', t('celPrSpeed', 'Speed bonus, most for the fastest')], ['hintCost', t('celPrHintCost', 'Taken away for each peek')], ['partial', t('celPrPartial', 'Most for an unfinished picture, by tiles placed')]].forEach(function (k) {
        var inp = el('input', { type: 'number', class: 'input field__input', min: '0', max: String(R().SCORING_MAX[k[0]]), step: '50', inputmode: 'numeric' });
        inp.value = String(S[k[0]]);
        inp.addEventListener('input', function () {
          var n = Math.round(Number(inp.value));
          if (isFinite(n)) { S[k[0]] = Math.max(0, Math.min(R().SCORING_MAX[k[0]], n)); changed(); }
        });
        sc.appendChild(field(k[1], inp));
      });
      sc.appendChild(el('p', { class: 'hint' }, t('celPrScoringNote', 'A team\'s points never depend on how many people are in it.')));
      shell.appendChild(sc);

      // Preview
      shell.appendChild(el('h2', { class: 'cel-section-title' }, t('celPreview', 'Try it')));
      shell.appendChild(el('p', { class: 'hint' }, t('celPreviewHint', 'Play the first picture here, on your own, with the grid you chose. Nothing is saved or scored.')));
      shell.appendChild(FF.UI.button(t('celPreviewPlay', 'Try the first picture'), { class: 'btn-ghost', icon: 'play', onClick: function () {
        if (!cfg.photos.length) { FF.UI.toast(t('celNeedPhoto', 'Add at least one photo first.')); return; }
        preview(cfg.photos[0], R().grid(cfg));
      } }));

      drawPhotos();
    }

    function preview(photo, size) {
      var host = div('cel-preview');
      var info = el('p', { class: 'hint', 'aria-live': 'polite' });
      host.appendChild(info);
      var tiles = R().scramble(size, function (n) { return Math.floor(Math.random() * n); });
      var sel = -1;
      var moves = 0;
      var t0 = Date.now();
      var b = FF.PictureRushBoard.create(host, {
        size: size, url: photo.play,
        onPick: function (a) { sel = a; paint(); },
        onDrop: function () { sel = -1; paint(); },
        onSwap: function (a, c) { tiles = R().swap(tiles, a, c); sel = -1; moves++; paint(); }
      });
      function paint() {
        var solved = R().solved(tiles);
        b.update({ tiles: tiles, selected: sel, held: {}, locked: solved, solved: solved, peek: false });
        info.textContent = solved
          ? t('celPreviewDone', 'Solved in {s} seconds with {n} swaps.', { s: Math.round((Date.now() - t0) / 1000), n: moves })
          : t('celPreviewLeft', '{n} of {total} tiles in place', { n: R().correct(tiles), total: tiles.length });
      }
      paint();
      FF.UI.dialog({ title: photo.title || t('celPreview', 'Try it'), body: host, wide: true, className: 'cel-preview-dlg', onClose: function () { b.destroy(); } });
    }

    // Leaving with unsaved changes asks first (the browser's own warning covers closing the tab).
    window.addEventListener('beforeunload', function (e) { if (dirty && shell.isConnected) { e.preventDefault(); e.returnValue = ''; } });
  }

  /* ---------- small form helpers, like the organiser's ---------- */

  function field(label, input, hint) {
    var id = 'cel-g-' + Math.random().toString(36).slice(2, 8);
    var wrap = div('field cel-field');
    var target = input.matches && input.matches('input,select,textarea') ? input : null;
    if (target) target.id = id;
    wrap.appendChild(el(target ? 'label' : 'span', target ? { class: 'field__label', for: id } : { class: 'field__label' }, label));
    wrap.appendChild(input);
    if (hint) wrap.appendChild(el('p', { class: 'field__hint' }, hint));
    return wrap;
  }
  function textInput(value, opts) {
    opts = opts || {};
    var inp = el(opts.multiline ? 'textarea' : 'input', {
      class: 'input field__input' + (opts.multiline ? ' cel-textarea' : ''),
      type: opts.multiline ? null : 'text', maxlength: opts.max || null, placeholder: opts.placeholder || null,
      autocomplete: 'off', rows: opts.multiline ? 3 : null
    });
    inp.value = value == null ? '' : value;
    if (opts.onInput) inp.addEventListener('input', function () { opts.onInput(inp.value); });
    return inp;
  }
  function select(options, value, onChange) {
    var s = el('select', { class: 'input field__input' });
    options.forEach(function (o) {
      var opt = el('option', { value: o[0] }, o[1]);
      if (o[0] === value) opt.selected = true;
      s.appendChild(opt);
    });
    s.addEventListener('change', function () { onChange(s.value); });
    return s;
  }

  FF.CelebrateGames = {
    tab: tab,
    views: { celebrationGame: editorView },
    TEMPLATES: TEMPLATES
  };
})();
