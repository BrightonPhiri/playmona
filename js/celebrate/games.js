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
  var W = function () { return FF.WordByWordRules; };
  var Q = function () { return FF.QuizRules; };
  function t(k, f, v) { return FF.t(k, f, v); }
  function el(tag, attrs, kids) { return FF.ui.el(tag, attrs, kids); }
  function div(cls, kids) { return FF.ui.div(cls, kids); }
  function icon(k) { return FF.Icons.icon(k); }
  function devMode() { return !!(FF.Net && FF.Net.devMode && FF.Net.devMode()); }

  var TEMPLATES = [
    { id: 'pictureRush', icon: 'puzzle-piece', name: ['celPrName', 'Picture Rush'],
      text: ['celPrText', 'Each team rebuilds a scrambled photo together, swapping tiles on their phones. The fastest team wins the round.'] },
    { id: 'wordByWord', icon: 'text-aa', cover: 'wordByWord', name: ['celWbwName', 'Word by Word'],
      text: ['celWbwText', 'All the groups write one message to the celebrant together, one word per turn. Every letter is a point.'] },
    { id: 'quiz', icon: 'question', cover: 'celebrationQuiz', name: ['celQuizName', 'Quiz'],
      text: ['celQuizText', 'Teams answer questions about the celebrant together. Every right answer scores.'] }
  ];
  var MODES = {
    open: ['celWbwOpen', 'Open'], blind: ['celWbwBlind', 'Blind']
  };
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
  function post(ev, path, body) { return FF.Api.call('POST', '/c/' + ev.id + path, body || {}); }

  /* ================= The Games tab ================= */

  function tab(panel, ev, update) {
    var box = div('cel-games');
    panel.appendChild(box);
    // On the day: the big screen and the MC's phone, each with its own private link.
    if (update && FF.CelebrateMessages && ev.tokens) {
      var day = div('cel-day');
      day.appendChild(el('h2', { class: 'cel-section-title' }, t('celOnTheDay', 'On the day')));
      day.appendChild(FF.CelebrateMessages.linkCard(ev, update, 'display'));
      day.appendChild(FF.CelebrateMessages.linkCard(ev, update, 'mc'));
      // The TV's "Scan to join" QR code: the organiser can hide it (the MC panel has the same switch).
      var qrSlot = div('cel-day__qr');
      day.appendChild(qrSlot);
      FF.Api.call('GET', '/c/' + ev.id + '/display').then(function (d) {
        qrSlot.appendChild(FF.UI.switchRow({
          label: t('celTvQrSwitch', 'Show "Scan to join" on the TV'),
          description: t('celTvQrSwitchDesc', 'The QR code and join code in a corner of the TV, so late guests can join. It always steps aside while teams play.'),
          checked: !!d.showQr,
          onChange: function (on) {
            FF.Api.call('POST', '/c/' + ev.id + '/display', { showQr: on }).then(function (r) {
              FF.UI.toast(r.showQr ? t('celTvQrOn', 'The TV shows how to join') : t('celTvQrOff', 'The QR code is hidden on the TV'));
            }, function (e) { FF.UI.toast(e.message); });
          }
        }));
      }, function () {});
      // The programme's opening slide for the TV: a picture, a slideshow or a built slide, with an effect.
      var slide = el('details', { class: 'cel-day__slide' });
      var sum = el('summary', {});
      sum.appendChild(FF.Icons.icon('images'));
      sum.appendChild(el('strong', {}, t('celSlideCard', 'Programme slide for the TV')));
      sum.appendChild(el('span', {}, t('celSlideCardText', 'What the TV shows as the programme opens. The MC switches to "Welcome" (how to join) when the games begin.')));
      slide.appendChild(sum);
      var made = false;
      slide.addEventListener('toggle', function () {
        if (!slide.open || made) return;
        made = true;
        slide.appendChild(FF.CelebrateSlide.editor({
          ev: ev,
          load: function () { return FF.Api.call('GET', '/c/' + ev.id + '/slide'); },
          save: function (part) { return FF.Api.call('POST', '/c/' + ev.id + '/slide', { slide: part }); },
          upload: function (file) {
            return C().shrinkPicture(file, 2048).then(function (blob) { return FF.Api.upload('/c/' + ev.id + '/media?purpose=slide', blob); });
          },
          onShow: function () {
            return FF.Api.call('POST', '/c/' + ev.id + '/slide', { layout: 'programme' }).then(function () {
              FF.UI.toast(t('celMcSlideOn', 'The programme slide is on the TV.'));
            }, function (e) { FF.UI.toast(e.message); });
          }
        }));
      });
      day.appendChild(slide);
      panel.appendChild(day);
    }
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
        live = FF.CelebrateLivePanel.create(ev, r.active, {
          alive: function () { return box.isConnected; },
          reload: function () { live = null; last = null; load(); },
          control: function (action, index, word) { return post(ev, '/play/control', index == null ? { action: action } : { action: action, index: index, word: word }); },
          // GET /play lets the organiser watch the game (it marks them as a viewer).
          watch: function () { return FF.Api.call('GET', '/c/' + ev.id + '/play'); }
        });
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
          text: t('celNoGamesText2', 'Make a Picture Rush from your own photos, or a Word by Word message for the celebrant.'),
          action: { label: t('celNewGame', 'New game'), icon: 'plus', onClick: newGame }
        }));
        return;
      }
      var ul = el('ul', { class: 'cel-gamelist' });
      r.games.forEach(function (g) { ul.appendChild(gameCard(g, r.active)); });
      box.appendChild(ul);
      if (!ev.stats.teams) box.appendChild(el('p', { class: 'hint' }, t('celGamesNeedTeams', 'Games are played in teams. Set up the teams before you start one.')));
    }

    /* A template's cover picture (assets/images/covers), with the manifest's version so a new picture shows at once. */
    function coverImg(tp, cls) {
      if (!tp.cover) return null;
      var m = FF.AssetManifest && FF.AssetManifest.covers;
      var v = m && m[tp.cover] ? '?v=' + m[tp.cover] : '';
      return el('img', { class: cls || null, src: 'assets/images/covers/' + tp.cover + '.webp' + v, alt: '', loading: 'lazy' });
    }

    function newGame() {
      var list = el('ul', { class: 'cel-templates' });
      var dlg = null;
      TEMPLATES.forEach(function (tp) {
        var b = el('button', { type: 'button', class: 'cel-template' });
        b.appendChild(coverImg(tp, 'cel-template__cover') || icon(tp.icon));
        var txt = div('cel-template__text');
        txt.appendChild(el('strong', {}, C().label(tp.name)));
        txt.appendChild(el('span', {}, C().label(tp.text)));
        b.appendChild(txt);
        b.addEventListener('click', function () {
          b.disabled = true;
          // A quiz gets its name from the server: "Who Knows {celebrant} Best?".
          post(ev, '/games', tp.id === 'quiz' ? { template: tp.id } : { template: tp.id, name: C().label(tp.name) }).then(function (g) {
            if (dlg) dlg.close();
            FF.Nav.go('celebrationGame', { id: ev.id, gameId: g.id });
          }, function (e) { b.disabled = false; FF.UI.toast(e.message); });
        });
        var li = el('li', {});
        li.appendChild(b);
        list.appendChild(li);
      });
      list.appendChild(el('li', { class: 'cel-template-soon' }, t('celMoreGamesSoon2', 'More games are on the way.')));
      dlg = FF.UI.sheet({ title: t('celPickTemplate', 'Choose a game'), body: list });
    }

    function gameCard(g, active) {
      var tp = template(g.template);
      var li = el('li', { class: 'cel-game is-' + g.status });
      var pic = div('cel-game__pic');
      if (g.thumb) pic.appendChild(el('img', { src: g.thumb, alt: '', loading: 'lazy' }));
      else pic.appendChild(coverImg(tp) || icon(tp.icon));
      li.appendChild(pic);
      var body = div('cel-game__body');
      body.appendChild(el('strong', { class: 'cel-game__name' }, g.name));
      var bits = [C().label(tp.name)];
      if (g.template === 'pictureRush') {
        bits.push(t(g.photos === 1 ? 'celPhotoOne' : 'celPhotoMany', g.photos === 1 ? '1 photo' : '{n} photos', { n: g.photos }));
        if (g.level) bits.push(C().label(LEVELS[g.level]).split(' · ')[0]);
        if (g.seconds) bits.push(t('celPerPicture', '{time} a picture', { time: mins(g.seconds) }));
      }
      if (g.template === 'wordByWord') {
        if (g.mode) bits.push(C().label(MODES[g.mode] || ['', g.mode]));
        if (g.rounds) bits.push(t(g.rounds === 1 ? 'celWbwTurnOne' : 'celWbwTurnsEach', g.rounds === 1 ? '1 turn each' : '{n} turns each', { n: g.rounds }));
        if (g.seconds) bits.push(t('celWbwPerTurn', '{time} a turn', { time: mins(g.seconds) }));
      }
      if (g.template === 'quiz') {
        bits.push(t(g.questions === 1 ? 'celQuizOne' : 'celQuizMany', g.questions === 1 ? '1 question' : '{n} questions', { n: g.questions || 0 }));
        if (g.seconds) bits.push(t('celQuizPerQuestion', '{time} a question', { time: mins(g.seconds) }));
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
        title: t('celStartTitle', 'Start {name}?', { name: String(g.name).replace(/[?]+$/, '') }), // "Who Knows Vicky Best?" keeps one question mark
        body: t('celStartText', 'The game opens on every guest\'s phone. When every team has pressed "Press when ready" (or you press Start now), a 10 second countdown begins. Guests need the event page open.'),
        confirmLabel: t('celStart', 'Start'), icon: 'play',
        onConfirm: function () {
          FF.UI.busy(btn, true);
          post(ev, '/games/' + g.id + '/start').then(function (r) {
            return devMode() ? FF.CelebrateLivePanel.loadDev().then(function (d) { return d.host(r); }) : r;
          }).then(function () {
            FF.UI.toast(t('celStarted', 'Started! Teams are getting ready.'));
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
      if (g.template === 'wordByWord') wordByWordFields();
      if (g.template === 'quiz') quizFields();

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
      if (g.template === 'pictureRush') cfg.photos = (cfg.photos || []).map(function (p) { return { id: p.id, title: p.title || '', hint: p.hint || '' }; });
      if (g.template === 'quiz') cfg.questions = (cfg.questions || []).map(function (q) { return { id: q.id, text: q.text || '', right: q.right || '', wrong: (q.wrong || []).slice() }; });
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

    /* ---------- Word by Word ---------- */

    function wordByWordFields() {
      var cfg = draft.config;
      shell.appendChild(el('h2', { class: 'cel-section-title' }, t('celWbwHow', 'How it is played')));
      var modeHint = el('p', { class: 'field__hint' });
      function drawModeHint() {
        modeHint.textContent = cfg.mode === 'blind'
          ? t('celWbwBlindHint', 'Each group sees only the last word. The whole message is revealed at the end.')
          : t('celWbwOpenHint', 'Everyone sees the message grow, on their phones and on the TV.');
      }
      var mode = field(t('celWbwVersion', 'Version'), FF.UI.segmented({
        label: t('celWbwVersion', 'Version'), value: cfg.mode, compact: true,
        options: W().MODES.map(function (m) { return { label: C().label(MODES[m]), value: m }; }),
        onChange: function (v) { cfg.mode = v; drawModeHint(); changed(); }
      }));
      mode.appendChild(modeHint);
      drawModeHint();
      shell.appendChild(mode);
      var rounds = [];
      for (var i = 1; i <= W().ROUNDS_MAX; i++) rounds.push([String(i), String(i)]);
      shell.appendChild(field(t('celWbwRounds', 'Turns for each group'), select(rounds, String(cfg.rounds), function (v) {
        cfg.rounds = Number(v);
        if (cfg.minUnit === 'rounds' && cfg.minCount > cfg.rounds) { cfg.minCount = cfg.rounds; minInput.value = String(cfg.minCount); }
        minInput.max = String(cfg.minUnit === 'rounds' ? cfg.rounds : W().WORDS_MIN_MAX);
        changed();
      }), t('celWbwRoundsHint', 'Every group gets the same number of turns, one word each.')));
      shell.appendChild(field(t('celWbwSeconds', 'Time for each turn'), select(W().SECONDS.map(function (s) { return [String(s), mins(s)]; }), String(cfg.seconds), function (v) { cfg.seconds = Number(v); changed(); }),
        t('celWbwSecondsHint', 'A group that runs out of time misses that turn.')));

      // When a group may end the message: after a number of rounds or of words.
      var minRow = div('cel-wbw-min');
      var minInput = el('input', { type: 'number', class: 'input field__input', min: '0', step: '1', inputmode: 'numeric' });
      minInput.value = String(cfg.minCount);
      minInput.max = String(cfg.minUnit === 'rounds' ? cfg.rounds : W().WORDS_MIN_MAX);
      minInput.setAttribute('aria-label', t('celWbwMinCount', 'How many'));
      minInput.addEventListener('input', function () {
        var n = Math.round(Number(minInput.value));
        if (!isFinite(n)) return;
        cfg.minCount = Math.max(0, Math.min(Number(minInput.max), n));
        changed();
      });
      minRow.appendChild(minInput);
      minRow.appendChild(FF.UI.segmented({
        label: t('celWbwMinUnit', 'Counted in'), value: cfg.minUnit, compact: true,
        options: [{ label: t('celWbwUnitRounds', 'Rounds'), value: 'rounds' }, { label: t('celWbwUnitWords', 'Words'), value: 'words' }],
        onChange: function (v) {
          cfg.minUnit = v;
          minInput.max = String(v === 'rounds' ? cfg.rounds : W().WORDS_MIN_MAX);
          if (cfg.minCount > Number(minInput.max)) { cfg.minCount = Number(minInput.max); minInput.value = String(cfg.minCount); }
          changed();
        }
      }));
      shell.appendChild(field(t('celWbwMin', 'Groups can end the message after'), minRow,
        t('celWbwMinHint', 'After this, the group on its turn can make its word the last one. 0 means from the very first turn.')));

      shell.appendChild(el('h2', { class: 'cel-section-title' }, t('celWbwWords', 'Words')));
      shell.appendChild(field(t('celWbwOpening', 'Opening words (optional)'), textInput(cfg.opening, {
        max: W().MAX_OPENING, placeholder: t('celWbwOpeningPh', 'e.g. Dear Vicky,'), onInput: function (v) { cfg.opening = v; changed(); }
      }), t('celWbwOpeningHint', 'Shown before the first word. They are not scored.')));
      shell.appendChild(field(t('celWbwNames', 'Names that score in full (optional)'), textInput((cfg.names || []).join(', '), {
        max: 600, placeholder: t('celWbwNamesPh', 'e.g. Vics, Harare, Mufaro'),
        onInput: function (v) {
          cfg.names = v.split(/[,\s]+/).map(function (x) { return x.trim(); }).filter(Boolean).slice(0, W().MAX_NAMES);
          changed();
        }
      }), t('celWbwNamesHint', 'Every letter is a point. Names are not in our word list, so other names score 1 point. The celebrant\'s name always counts in full; add nicknames and places here.')));
    }

    /* ---------- Quiz ---------- */

    function quizFields() {
      var cfg = draft.config;
      cfg.questions = Q().list(cfg.questions).map(function (q) { q.wrong = Q().list(q.wrong); if (!q.wrong.length) q.wrong = ['']; return q; });
      shell.appendChild(el('h2', { class: 'cel-section-title' }, t('celWbwHow', 'How it is played')));
      shell.appendChild(field(t('celQuizSeconds', 'Time for each question'), select(Q().SECONDS.map(function (s) { return [String(s), mins(s)]; }), String(cfg.seconds), function (v) { cfg.seconds = Number(v); changed(); }),
        t('celQuizSecondsHint', 'Teams can change their answer until the time runs out, or press "We\'re sure".')));
      var pts = el('input', { type: 'number', class: 'input field__input', min: String(Q().POINTS_MIN), max: String(Q().POINTS_MAX), step: String(Q().POINTS_STEP), inputmode: 'numeric' });
      pts.value = String(cfg.points);
      pts.addEventListener('input', function () {
        var n = Number(pts.value);
        if (!isFinite(n) || !pts.value) return;
        cfg.points = Math.max(Q().POINTS_MIN, Math.min(Q().POINTS_MAX, Math.round(n / Q().POINTS_STEP) * Q().POINTS_STEP));
        changed();
      });
      shell.appendChild(field(t('celQuizPoints', 'Points for a right answer'), pts, t('celQuizPointsHint', 'Every right answer scores the same. A wrong answer scores nothing.')));

      shell.appendChild(el('h2', { class: 'cel-section-title' }, t('celQuizQuestions', 'Questions')));
      var listBox = el('ol', { class: 'cel-quiz-list' });
      shell.appendChild(listBox);
      var acts = div('cel-quiz-add');
      var ideasBtn = FF.UI.button(t('celQuizIdeas', 'Add from ideas'), { class: 'btn-primary', icon: 'sparkle', onClick: ideas });
      var ownBtn = FF.UI.button(t('celQuizOwn', 'Write my own'), { class: 'btn-secondary', icon: 'plus', onClick: function () { add([{ text: '' }]); } });
      var full = el('p', { class: 'hint' }, t('celQuizFull', 'That\'s the most a quiz can have.'));
      acts.appendChild(ideasBtn);
      acts.appendChild(ownBtn);
      acts.appendChild(full);
      shell.appendChild(acts);

      function newId() { return 'q' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36); }
      function add(items) {
        var first = cfg.questions.length;
        items.forEach(function (it) {
          if (cfg.questions.length < Q().MAX_QUESTIONS) cfg.questions.push({ id: newId(), text: it.text || '', right: '', wrong: [''] });
        });
        changed();
        draw();
        // The first new card: its question when written from scratch, else its right answer.
        var card = listBox.querySelectorAll('.cel-quiz-q')[first];
        if (card) { var f = card.querySelector(items.length === 1 && !items[0].text ? 'textarea' : '.cel-quiz-q__right'); if (f) f.focus(); }
      }

      var PROBLEM = {
        noText: ['celQuizNoText', 'Add the question.'], noRight: ['celQuizNoRight', 'Add the right answer.'],
        noWrong: ['celQuizNoWrong', 'Add a wrong answer.'], same: ['celQuizSame', 'Two answers are the same.']
      };

      function draw() {
        FF.ui.clear(listBox);
        if (!cfg.questions.length) listBox.appendChild(el('li', { class: 'hint cel-quiz-empty' }, t('celQuizEmpty', 'No questions yet. Start with some ideas, then type the answers.')));
        cfg.questions.forEach(function (q, i) {
          var li = el('li', { class: 'cel-quiz-q' });
          var head = div('cel-quiz-q__head');
          head.appendChild(el('strong', {}, t('celQuizQn', 'Question {n}', { n: i + 1 })));
          var tools = div('cel-quiz-q__tools');
          var up = FF.UI.iconButton('arrow-up', t('celMoveUp', 'Move up'), function () { move(i, -1); }, 'btn-ghost btn-sm');
          up.disabled = i === 0;
          var down = FF.UI.iconButton('arrow-down', t('celMoveDown', 'Move down'), function () { move(i, 1); }, 'btn-ghost btn-sm');
          down.disabled = i === cfg.questions.length - 1;
          tools.appendChild(up);
          tools.appendChild(down);
          tools.appendChild(FF.UI.iconButton('trash', t('celQuizRemoveN', 'Remove question {n}', { n: i + 1 }), function () { cfg.questions.splice(i, 1); changed(); draw(); }, 'btn-ghost btn-sm'));
          head.appendChild(tools);
          li.appendChild(head);
          var note = el('p', { class: 'cel-quiz-q__problem', 'aria-live': 'polite' });
          function check() {
            var why = Q().problem(q);
            note.textContent = why ? C().label(PROBLEM[why]) : '';
            li.classList.toggle('is-incomplete', !!why);
          }
          li.appendChild(field(t('celQuizText', 'Question'), textInput(q.text, { multiline: true, max: Q().MAX_TEXT, onInput: function (v) { q.text = v; changed(); check(); } })));
          var right = textInput(q.right, { max: Q().MAX_ANSWER, onInput: function (v) { q.right = v; changed(); check(); } });
          right.classList.add('cel-quiz-q__right');
          li.appendChild(field(t('celQuizRight', 'Right answer'), right));
          q.wrong.forEach(function (w, k) {
            var row = div('cel-quiz-q__wrong');
            var inp = textInput(w, { max: Q().MAX_ANSWER, placeholder: t('celQuizWrongPh', 'A wrong answer'), onInput: function (v) { q.wrong[k] = v; changed(); check(); } });
            inp.setAttribute('aria-label', t('celQuizWrongN', 'Wrong answer {n}', { n: k + 1 }));
            row.appendChild(inp);
            if (q.wrong.length > 1) row.appendChild(FF.UI.iconButton('x', t('celQuizRemoveWrongN', 'Remove wrong answer {n}', { n: k + 1 }), function () { q.wrong.splice(k, 1); changed(); draw(); }, 'btn-ghost btn-sm'));
            if (k === 0) li.appendChild(el('p', { class: 'field__label' }, t('celQuizWrong', 'Wrong answers')));
            li.appendChild(row);
          });
          if (q.wrong.length < Q().MAX_WRONG) {
            li.appendChild(FF.UI.button(t('celQuizAddWrong', 'Add a wrong answer'), { class: 'btn-ghost btn-sm', icon: 'plus', onClick: function () { q.wrong.push(''); changed(); draw(); } }));
          }
          li.appendChild(note);
          check();
          listBox.appendChild(li);
        });
        var atMax = cfg.questions.length >= Q().MAX_QUESTIONS;
        ideasBtn.disabled = atMax;
        ownBtn.disabled = atMax;
        full.hidden = !atMax;
      }

      function move(i, by) {
        var j = i + by;
        if (j < 0 || j >= cfg.questions.length) return;
        var x = cfg.questions[i]; cfg.questions[i] = cfg.questions[j]; cfg.questions[j] = x;
        changed();
        draw();
      }

      function ideas() {
        var have = {};
        cfg.questions.forEach(function (q) { have[String(q.text).trim().toLowerCase()] = true; });
        var body = el('ul', { class: 'cel-quiz-ideas' });
        var picked = [];
        FF.QuizQuestions.forKind(cfg.kind, g.celebrantName || '').forEach(function (idea) {
          var li = el('li', {});
          var lab = el('label', { class: 'cel-quiz-idea' });
          var box = el('input', { type: 'checkbox' });
          var added = !!have[idea.text.trim().toLowerCase()];
          box.disabled = added;
          box.checked = added;
          box.addEventListener('change', function () {
            var at = picked.indexOf(idea);
            if (box.checked && at === -1) picked.push(idea);
            if (!box.checked && at !== -1) picked.splice(at, 1);
          });
          lab.appendChild(box);
          lab.appendChild(el('span', {}, idea.text));
          if (added) lab.appendChild(el('span', { class: 'cel-quiz-idea__added' }, t('celQuizAdded', 'Added')));
          li.appendChild(lab);
          body.appendChild(li);
        });
        FF.UI.sheet({
          title: t('celQuizIdeasTitle', 'Question ideas'), body: body,
          actions: [
            { label: t('cancel', 'Cancel') },
            { label: t('celQuizAddPicked', 'Add the ticked ones'), primary: true, icon: 'plus', onClick: function () {
              // After the sheet has closed and handed focus back, so the first new answer box can take it.
              if (picked.length) setTimeout(function () { add(picked); }, 0);
            } }
          ]
        });
      }

      draw();
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
