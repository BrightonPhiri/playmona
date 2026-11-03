/* ============================================================
   PLAYMONA — admin/crew.js
   The Crew page: PlayMona-run players who fill empty seats in
   Live match and Imposters when no real player is free.
   - Who gets crew (off, admins only, everyone) and the limits
   - Matches crew are in right now (with a way to end one)
   - The crew players: add (from a draft), edit, switch off
   - AI providers, used for fresher drafts (never needed)
   Data comes from the PlayMona server (api/, EngineRoutes.php)
   via FF.Billing.api. Players never see the word "crew".
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var K = function () { return FF.AdminKit; };
  var B = function () { return FF.Billing; };
  function el(tag, attrs, kids) { return FF.ui.el(tag, attrs, kids); }

  var TRAIT_LABELS = {
    competitiveness: 'Competitive', friendliness: 'Friendly', reaction: 'Reaction speed', accuracy: 'Accuracy',
    risk: 'Takes risks', strategy: 'Strategy', patience: 'Patience', consistency: 'Consistency', social: 'Social'
  };
  var ARCHETYPE_LABELS = {
    quizzer: 'Quizzer', speedster: 'Speedster', wordsmith: 'Word lover', traveller: 'Traveller', casual: 'Casual',
    thinker: 'Thinker', allrounder: 'All-rounder', sporty: 'Sporty', pictures: 'Picture spotter', learner: 'Learner'
  };
  var STATUS = {
    available: { label: 'Free', cls: 'bill-badge--paid' },
    reserved: { label: 'Seat held', cls: 'bill-badge--pending' },
    playing: { label: 'Playing', cls: 'bill-badge--pending' },
    disabled: { label: 'Off', cls: 'bill-badge--test' }
  };
  var state = { q: '' };

  function head(title, sub, actions) {
    var h = el('div', { class: 'admin-page-head' });
    var text = el('div', {});
    text.appendChild(el('h1', { class: 'page-title' }, title));
    if (sub) text.appendChild(el('p', { class: 'page-sub' }, sub));
    h.appendChild(text);
    if (actions) h.appendChild(actions);
    return h;
  }

  function failed(target, e) {
    FF.ui.clear(target);
    target.appendChild(el('p', { class: 'admin-error' }, (e && e.message) || 'Could not load this. Check the connection and try again.'));
  }

  function errorToast(e) { FF.UI.toast((e && e.message) || 'Not saved. Check the connection and try again.', { type: 'error' }); }

  function numberField(label, value, min, max, hint) {
    var id = FF.UI.uid('crew');
    var input = el('input', { id: id, type: 'number', class: 'input field__input', min: min, max: max, step: 1, value: String(value), inputmode: 'numeric' });
    var f = el('div', { class: 'field' }, [el('label', { class: 'field__label', for: id }, label), input]);
    if (hint) f.appendChild(el('span', { class: 'field__hint' }, hint));
    return { field: f, input: input };
  }

  // Two number boxes for a [lowest, highest] setting.
  function rangeField(label, pair, min, max, hint) {
    var a = el('input', { type: 'number', class: 'input admin-num', min: min, max: max, step: 1, value: String(pair[0]), 'aria-label': label + ': lowest' });
    var b = el('input', { type: 'number', class: 'input admin-num', min: min, max: max, step: 1, value: String(pair[1]), 'aria-label': label + ': highest' });
    var f = el('div', { class: 'field' }, [
      el('span', { class: 'field__label' }, label),
      el('span', { class: 'crew-pair' }, [a, el('span', { class: 'crew-pair__to' }, 'to'), b])
    ]);
    if (hint) f.appendChild(el('span', { class: 'field__hint' }, hint));
    return { field: f, a: a, b: b };
  }

  function int(input) { return Number(input.value); }

  // A labelled 0-100 slider with its value next to it.
  function slider(label, value, onChange) {
    var id = FF.UI.uid('crew');
    var out = el('output', { class: 'crew-slider__value', for: id }, String(value));
    var input = el('input', { id: id, type: 'range', class: 'crew-slider__input', min: 0, max: 100, step: 1, value: String(value) });
    input.addEventListener('input', function () {
      out.textContent = input.value;
      onChange(Number(input.value));
    });
    var row = el('div', { class: 'crew-slider' }, [el('label', { class: 'crew-slider__label', for: id }, label), input, out]);
    row.set = function (v) { input.value = String(v); out.textContent = String(v); };
    return row;
  }

  /* ================= The page ================= */
  function crew(main) {
    var refresh = FF.UI.button('Refresh', { class: 'btn-sm', icon: 'restart', onClick: function () { crew(FF.ui.clear(main)); } });
    main.appendChild(head('Crew', 'PlayMona players run by the server. They fill empty seats in Live match and Imposters when no real player is free. Players never see that they are crew.', refresh));
    if (!B().available() || FF.AdminData.mode() !== 'firebase') {
      main.appendChild(el('p', { class: 'notice notice--info' }, 'Crew live on the PlayMona server, so this page only works on playmona.com, not with device-only test accounts.'));
      return;
    }
    var box = el('div', { class: 'admin-stack' });
    main.appendChild(box);
    K().loading(box);
    B().api('GET', '/admin/crew').then(function (data) {
      FF.ui.clear(box);
      function reload() { crew(FF.ui.clear(main)); }
      var status = statusTiles(data);
      box.appendChild(status);
      box.appendChild(settingsCard(data, function () {
        var fresh = statusTiles(data);
        box.replaceChild(fresh, status);
        status = fresh;
      }));
      box.appendChild(matchesCard(data, reload));
      box.appendChild(playersCard(data, reload));
      box.appendChild(aiCard());
    }).catch(function (e) { failed(box, e); });
  }

  /* ---------- Status ---------- */
  function statusTiles(data) {
    var wrap = el('div', { class: 'admin-stack' });
    var r = data.runner || {};
    var players = data.players || [];
    var on = players.filter(function (p) { return p.enabled; });
    var busy = players.filter(function (p) { return p.status === 'reserved' || p.status === 'playing'; });
    var s = data.settings;

    var tiles = el('div', { class: 'kpi-grid kpi-grid--quiet' });
    var runTile = el('div', { class: 'kpi-tile' });
    runTile.appendChild(el('span', { class: 'kpi-tile__label' }, 'Crew runner'));
    runTile.appendChild(el('strong', { class: 'kpi-tile__value' }, r.alive ? 'Running' : 'Idle'));
    runTile.appendChild(el('span', { class: 'kpi-tile__note' }, r.alive
      ? 'Checked in ' + K().ago(r.beatAt) + (r.startedAt ? ' · up since ' + K().ago(r.startedAt) : '')
      : (r.stoppedAt ? 'Stopped ' + K().ago(r.stoppedAt) + '. ' : '') + 'Starts when a match needs crew'));
    tiles.appendChild(runTile);
    tiles.appendChild(K().tile('Crew players on', on.length, null, players.length + ' in total · ' + busy.length + ' busy now'));
    tiles.appendChild(K().tile('Matches with crew', (data.matches || []).length, null, 'Up to ' + s.maxConcurrentMatches + ' at once'));
    tiles.appendChild(K().tile('Real players online', data.humansOnline || 0, null, s.onlyWhenNoHumans ? 'Crew wait while anyone is free' : 'Crew join even when people are online'));
    wrap.appendChild(tiles);

    var why = null;
    if (s.mode === 'off') why = 'Crew are off, so nobody gets crew in their games.';
    else if (s.stopNew) why = 'Stop new matches is on: crew finish the games they are in and start no new ones.';
    else if (s.mode === 'admins') why = 'Testing: only admins get crew. Choose Everyone below when you are happy with them.';
    else if (!on.length) why = 'No crew players are switched on. Add some below, or run "php api/cron.php crew-seed" on the server.';
    if (why) wrap.appendChild(el('p', { class: 'notice notice--info crew-note' }, why));
    return wrap;
  }

  /* ---------- Settings ---------- */
  function settingsCard(data, onChanged) {
    var s = data.settings;
    var card = K().card('Who gets crew', 'Changes apply to the next match. Matches already playing carry on.');

    function saveNow(change, okText) {
      return B().api('POST', '/admin/crew/settings', change).then(function (fresh) {
        data.settings = fresh.settings;
        data.runner = fresh.runner;
        data.humansOnline = fresh.humansOnline;
        onChanged();
        FF.UI.toast(okText || 'Saved', { type: 'success' });
      }).catch(errorToast);
    }

    card.appendChild(FF.UI.segmented({
      label: 'Who gets crew', value: s.mode,
      options: [
        { label: 'Off', value: 'off', icon: 'x-circle' },
        { label: 'Admins only', value: 'admins', icon: 'shield' },
        { label: 'Everyone', value: 'everyone', icon: 'users-three' }
      ],
      onChange: function (v) { saveNow({ mode: v }); }
    }));
    card.appendChild(FF.UI.switchRow({
      label: 'Stop new matches', description: 'Crew finish the games they are in, then join no more. Use this before restarting the crew runner.',
      checked: !!s.stopNew, onChange: function (on) { saveNow({ stopNew: on }); }
    }));
    card.appendChild(FF.UI.switchRow({
      label: 'Only when no real players are free', description: 'Live match always looks for real people first. With this on, crew only join when nobody else is online.',
      checked: !!s.onlyWhenNoHumans, onChange: function (on) { saveNow({ onlyWhenNoHumans: on }); }
    }));

    // The numbers, saved together.
    var grid = el('div', { class: 'crew-grid' });
    var fallback = numberField('Look for real players first', s.fallbackSeconds, 0, 120, 'Seconds Live match waits before crew join.');
    var maxMatches = numberField('Matches with crew at once', s.maxConcurrentMatches, 0, 500, 'Keeps the server and Firebase within their limits.');
    var perMatch = rangeField('Crew in one match', s.crewPerMatch, 1, 11, 'Fewest and most.');
    var maxGames = numberField('Games before crew leave', s.maxGamesPerMatch, 1, 20, 'Crew leave a room after this many games.');
    var lease = numberField('Seat hold', s.leaseSeconds, 30, 600, 'Seconds a seat stays held if the runner stops answering.');
    var population = numberField('Crew size', s.population, 0, 1000, 'How many players the seed makes. You can always add more.');
    var decline = rangeField('Friend requests to crew fade after', s.declineHours, 0, 720, 'Hours, fewest and most.');
    [fallback, maxMatches, perMatch, maxGames, lease, population, decline].forEach(function (f) { grid.appendChild(f.field); });
    card.appendChild(grid);

    var mixBox = el('div', { class: 'field' });
    mixBox.appendChild(el('span', { class: 'field__label' }, 'Difficulty mix'));
    mixBox.appendChild(el('span', { class: 'field__hint' }, 'How often crew play at each level. Shares, not exact percentages.'));
    var mix = {};
    var mixRow = el('div', { class: 'crew-pair' });
    [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']].forEach(function (l) {
      mix[l[0]] = el('input', { type: 'number', class: 'input admin-num', min: 0, max: 100, step: 1, value: String(s.difficultyMix[l[0]] || 0), 'aria-label': 'Share for ' + l[1] });
      mixRow.appendChild(el('label', { class: 'crew-pair__item' }, [el('span', {}, l[1]), mix[l[0]]]));
    });
    mixBox.appendChild(mixRow);
    card.appendChild(mixBox);

    // Games crew play
    var games = Object.assign({}, s.games || {});
    var det = el('details', { class: 'admin-table-toggle' });
    var summary = el('summary', {});
    function count() {
      var all = (data.games || []).length;
      var off = (data.games || []).filter(function (g) { return games[g] === false; }).length;
      summary.textContent = 'Games crew play (' + (all - off) + ' of ' + all + ')';
    }
    count();
    det.appendChild(summary);
    var list = el('ul', { class: 'crew-games' });
    (data.games || []).forEach(function (g) {
      var sw = el('button', { type: 'button', class: 'switch' + (games[g] !== false ? ' on' : ''), role: 'switch', 'aria-checked': games[g] !== false ? 'true' : 'false', 'aria-label': K().gameName(g) });
      sw.appendChild(FF.ui.div('switch__knob', ''));
      sw.addEventListener('click', function () {
        var next = sw.getAttribute('aria-checked') !== 'true';
        sw.setAttribute('aria-checked', next ? 'true' : 'false');
        sw.classList.toggle('on', next);
        if (next) delete games[g]; else games[g] = false;
        count();
      });
      list.appendChild(el('li', {}, [el('span', {}, K().gameName(g)), sw]));
    });
    det.appendChild(list);
    card.appendChild(det);

    var acts = el('div', { class: 'admin-actions' });
    acts.appendChild(FF.UI.button('Save limits', { class: 'btn-primary', icon: 'check', onClick: function () {
      var change = {
        fallbackSeconds: int(fallback.input), maxConcurrentMatches: int(maxMatches.input),
        crewPerMatch: [int(perMatch.a), int(perMatch.b)], maxGamesPerMatch: int(maxGames.input),
        leaseSeconds: int(lease.input), population: int(population.input),
        declineHours: [int(decline.a), int(decline.b)],
        difficultyMix: { easy: int(mix.easy), medium: int(mix.medium), hard: int(mix.hard) },
        games: games
      };
      saveNow(change);
    } }));
    card.appendChild(acts);
    return card;
  }

  /* ---------- Matches ---------- */
  function matchesCard(data, reload) {
    var card = K().card('Matches with crew', 'Rooms where crew are playing now.');
    var matches = data.matches || [];
    if (!matches.length) {
      card.appendChild(el('p', { class: 'admin-empty' }, 'No crew are in a match right now.'));
      return card;
    }
    var wrap = el('div', { class: 'admin-table-wrap' });
    var tbl = el('table', { class: 'admin-table' });
    tbl.appendChild(el('thead', {}, [el('tr', {}, ['Game', 'Room', 'Crew', 'Games played', 'Started', ''].map(function (h, i) {
      return el('th', { scope: 'col', class: i === 2 || i === 3 ? 'num' : '' }, h);
    }))]));
    var body = el('tbody');
    matches.forEach(function (m) {
      body.appendChild(el('tr', {}, [
        el('td', {}, [el('span', { class: 'admin-game__name' }, K().gameName(m.gameId)), el('span', { class: 'admin-game__cat' }, K().catName(m.difficulty))]),
        el('td', { class: 'admin-mono' }, m.roomCode || '—'),
        el('td', { class: 'num' }, String(m.crew)),
        el('td', { class: 'num' }, String(m.gamesPlayed)),
        el('td', {}, K().ago(m.createdAt)),
        el('td', {}, [FF.UI.button('End', { class: 'btn-sm btn-ghost', icon: 'x-circle', onClick: function () {
          FF.UI.confirm({
            title: 'Take the crew out of this match?',
            body: 'Crew leave room ' + (m.roomCode || '') + ' and become free for other matches. Real players in the room can keep playing.',
            confirmLabel: 'End match', danger: true,
            onConfirm: function () {
              B().api('POST', '/admin/crew/release', { matchId: m.id }).then(function () {
                FF.UI.toast('Crew released', { type: 'success' });
                reload();
              }).catch(errorToast);
            }
          });
        } })])
      ]));
    });
    tbl.appendChild(body);
    wrap.appendChild(tbl);
    card.appendChild(wrap);
    return card;
  }

  /* ---------- Players ---------- */
  function playersCard(data, reload) {
    var add = FF.UI.button('Add player', { class: 'btn-sm btn-primary', icon: 'plus', onClick: function () { editPlayer(null, data, reload); } });
    var card = K().card('Crew players', 'Each has a lasting name, character, personality and a skill for every game. Switch one off to stop them joining new matches.');
    var tools = el('div', { class: 'admin-tools' });
    var search = el('input', { class: 'input', type: 'search', placeholder: 'Search crew', 'aria-label': 'Search crew by name or username', value: state.q });
    tools.appendChild(search);
    tools.appendChild(add);
    card.appendChild(tools);
    var box = el('div', {});
    card.appendChild(box);

    function draw() {
      FF.ui.clear(box);
      var q = state.q.toLowerCase();
      var rows = (data.players || []).filter(function (p) {
        return !q || p.displayName.toLowerCase().indexOf(q) !== -1 || p.username.indexOf(q) !== -1;
      });
      if (!rows.length) {
        box.appendChild(el('p', { class: 'admin-empty' }, q ? 'No crew match that.' : 'No crew yet. Add a player, or run "php api/cron.php crew-seed" on the server.'));
        return;
      }
      var wrap = el('div', { class: 'admin-table-wrap' });
      var tbl = el('table', { class: 'admin-table' });
      tbl.appendChild(el('thead', {}, [el('tr', {}, ['Player', 'Now', 'Played', 'Wins', 'Last game', 'On', ''].map(function (h, i) {
        return el('th', { scope: 'col', class: i === 2 || i === 3 ? 'num' : '' }, h);
      }))]));
      var body = el('tbody');
      rows.forEach(function (p) {
        var who = el('td', { class: 'admin-user' });
        if (FF.Avatars) who.appendChild(FF.Avatars.img(p.avatar, 'admin-user__ava'));
        var names = el('span', { class: 'admin-user__names' });
        names.appendChild(el('span', { class: 'admin-user__name' }, p.displayName));
        names.appendChild(el('span', { class: 'admin-user__handle' }, '@' + p.username));
        who.appendChild(names);
        var st = STATUS[p.enabled ? p.status : 'disabled'] || STATUS.available;
        var t = p.totals || {};
        var sw = el('button', { type: 'button', class: 'switch' + (p.enabled ? ' on' : ''), role: 'switch', 'aria-checked': p.enabled ? 'true' : 'false', 'aria-label': p.displayName + ' joins matches' });
        sw.appendChild(FF.ui.div('switch__knob', ''));
        sw.addEventListener('click', function () {
          var next = !p.enabled;
          sw.disabled = true;
          B().api('POST', '/admin/crew/player/enable', { id: p.id, enabled: next }).then(function (r) {
            Object.assign(p, r.player);
            FF.UI.toast(next ? p.displayName + ' is on' : p.displayName + ' is off', { type: 'success' });
            draw();
          }).catch(function (e) { sw.disabled = false; errorToast(e); });
        });
        body.appendChild(el('tr', { class: p.enabled ? '' : 'is-off' }, [
          who,
          el('td', {}, [el('span', { class: 'bill-badge ' + st.cls }, st.label)]),
          el('td', { class: 'num' }, K().num(t.played)),
          el('td', { class: 'num' }, K().num(t.wins)),
          el('td', {}, t.lastPlayedAt ? K().ago(t.lastPlayedAt) : 'Not yet'),
          el('td', {}, [sw]),
          el('td', {}, [FF.UI.button('Edit', { class: 'btn-sm btn-ghost', icon: 'pencil', onClick: function () { editPlayer(p, data, reload); } })])
        ]));
      });
      tbl.appendChild(body);
      wrap.appendChild(tbl);
      box.appendChild(wrap);
    }
    var timer = null;
    search.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { state.q = search.value.trim(); draw(); }, 200);
    });
    draw();
    return card;
  }

  /* The add / edit window. A new player starts from a draft (AI when a provider is set up). */
  function editPlayer(p, data, reload) {
    var isNew = !p;
    var form = {
      displayName: p ? p.displayName : '', username: p ? p.username : '', avatar: p ? p.avatar : 'nia',
      color: p ? p.color : '#2e86de', bio: p ? p.bio : '', personality: {}, skills: {}
    };
    (data.traits || []).forEach(function (t) { form.personality[t] = p && p.personality[t] != null ? p.personality[t] : 50; });
    (data.games || []).forEach(function (g) { form.skills[g] = p && p.skills && p.skills[g] ? p.skills[g].skill : 50; });

    var body = el('div', { class: 'admin-detail crew-edit' });

    // Draft (new players only)
    var draftNote = el('span', { class: 'field__hint' }, '');
    if (isNew) {
      var sec = el('section', { class: 'admin-detail__section crew-draft' });
      sec.appendChild(el('h3', { class: 'admin-detail__title' }, 'Start from a draft'));
      sec.appendChild(el('p', { class: 'admin-card__sub' }, 'Pick a play style and, if you like, an idea. A set-up AI provider writes a fresher name and description; without one the built-in drafts are used.'));
      var kind = el('select', { class: 'input admin-select', 'aria-label': 'Play style' });
      kind.appendChild(el('option', { value: '' }, 'Any style'));
      (data.archetypes || Object.keys(ARCHETYPE_LABELS)).forEach(function (a) { kind.appendChild(el('option', { value: a }, ARCHETYPE_LABELS[a] || a)); });
      var idea = el('input', { class: 'input crew-draft__idea', type: 'text', maxlength: 200, placeholder: 'Idea (optional), for example "a nurse from Bulawayo who loves flags"', 'aria-label': 'Idea for the draft' });
      var draftBtn = FF.UI.button('New draft', { icon: 'sparkle', onClick: function () { draft(); } });
      sec.appendChild(el('div', { class: 'prem-grant' }, [kind, idea, draftBtn]));
      sec.appendChild(draftNote);
      body.appendChild(sec);
    }

    // Who they are
    var who = el('section', { class: 'admin-detail__section' });
    who.appendChild(el('h3', { class: 'admin-detail__title' }, 'Who they are'));
    var idName = FF.UI.uid('crew'), idUser = FF.UI.uid('crew'), idAva = FF.UI.uid('crew'), idColor = FF.UI.uid('crew'), idBio = FF.UI.uid('crew');
    var name = el('input', { id: idName, class: 'input field__input', type: 'text', maxlength: 40, value: form.displayName });
    var user = el('input', { id: idUser, class: 'input field__input', type: 'text', maxlength: 20, spellcheck: 'false', autocapitalize: 'off', value: form.username });
    var ava = el('select', { id: idAva, class: 'input field__input' });
    (FF.Avatars ? FF.Avatars.all() : []).forEach(function (a) {
      var o = el('option', { value: a.id }, a.name);
      ava.appendChild(o);
    });
    ava.value = form.avatar;
    var preview = el('span', { class: 'crew-edit__ava' });
    function drawAvatar() {
      FF.ui.clear(preview);
      if (FF.Avatars) preview.appendChild(FF.Avatars.img(ava.value, 'crew-edit__img', ''));
    }
    ava.addEventListener('change', drawAvatar);
    drawAvatar();
    var color = el('input', { id: idColor, class: 'input crew-edit__color', type: 'color', value: form.color || '#2e86de' });
    var colorPicked = !isNew;
    color.addEventListener('input', function () { colorPicked = true; });
    var bio = el('textarea', { id: idBio, class: 'input admin-textarea', maxlength: 300, rows: 2 });
    bio.value = form.bio;
    var grid = el('div', { class: 'crew-grid' });
    grid.appendChild(el('div', { class: 'field' }, [el('label', { class: 'field__label', for: idName }, 'Display name'), name]));
    grid.appendChild(el('div', { class: 'field' }, [el('label', { class: 'field__label', for: idUser }, 'Username'), user,
      el('span', { class: 'field__hint' }, '3 to 20 letters, numbers, dots or underscores.')]));
    grid.appendChild(el('div', { class: 'field' }, [el('label', { class: 'field__label', for: idAva }, 'Character'), el('span', { class: 'crew-edit__ava-row' }, [preview, ava])]));
    grid.appendChild(el('div', { class: 'field' }, [el('label', { class: 'field__label', for: idColor }, 'Colour'), color,
      el('span', { class: 'field__hint' }, isNew ? 'Leave it and PlayMona picks one.' : 'Their colour in rooms and on scoreboards.')]));
    who.appendChild(grid);
    who.appendChild(el('div', { class: 'field' }, [el('label', { class: 'field__label', for: idBio }, 'Description'), bio,
      el('span', { class: 'field__hint' }, 'Shows on their profile, like any player’s. Keep it short and in the first person.')]));
    body.appendChild(who);

    // Personality
    var pers = el('section', { class: 'admin-detail__section' });
    pers.appendChild(el('h3', { class: 'admin-detail__title' }, 'Personality'));
    pers.appendChild(el('p', { class: 'admin-card__sub' }, 'How they play: how fast they answer, how often they take a guess, how chatty they are.'));
    var traitRows = {};
    var traitGrid = el('div', { class: 'crew-sliders' });
    (data.traits || []).forEach(function (t) {
      traitRows[t] = slider(TRAIT_LABELS[t] || t, form.personality[t], function (v) { form.personality[t] = v; });
      traitGrid.appendChild(traitRows[t]);
    });
    pers.appendChild(traitGrid);
    body.appendChild(pers);

    // Skills
    var skills = el('details', { class: 'admin-table-toggle' });
    skills.appendChild(el('summary', {}, 'Skill in each game'));
    skills.appendChild(el('p', { class: 'admin-card__sub' }, 'Under 40 plays like a beginner, 70 and over like an expert.'));
    var skillRows = {};
    var skillGrid = el('div', { class: 'crew-sliders' });
    (data.games || []).forEach(function (g) {
      skillRows[g] = slider(K().gameName(g), form.skills[g], function (v) { form.skills[g] = v; });
      skillGrid.appendChild(skillRows[g]);
    });
    skills.appendChild(skillGrid);
    body.appendChild(skills);

    function fill(d) {
      name.value = d.displayName || '';
      user.value = d.username || '';
      if (d.avatar) { ava.value = d.avatar; drawAvatar(); }
      bio.value = d.bio || '';
      Object.keys(d.personality || {}).forEach(function (t) {
        if (!traitRows[t]) return;
        form.personality[t] = d.personality[t];
        traitRows[t].set(d.personality[t]);
      });
      Object.keys(d.skills || {}).forEach(function (g) {
        if (!skillRows[g]) return;
        var v = typeof d.skills[g] === 'object' ? d.skills[g].skill : d.skills[g];
        form.skills[g] = v;
        skillRows[g].set(v);
      });
    }

    function draft() {
      draftNote.textContent = 'Making a draft…';
      B().api('POST', '/admin/crew/draft', { archetype: kind.value, idea: idea.value.trim() }).then(function (r) {
        fill(r.draft);
        draftNote.textContent = (r.draft.source === 'ai' ? 'Written by AI' : 'Built-in draft') + ' · style: ' + (ARCHETYPE_LABELS[r.draft.archetype] || r.draft.archetype) + '. Change anything before saving.';
      }).catch(function (e) { draftNote.textContent = ''; errorToast(e); });
    }

    var dlg = FF.UI.dialog({
      title: isNew ? 'Add a crew player' : 'Edit ' + p.displayName, body: body, wide: true,
      actions: [
        { label: isNew ? 'Add player' : 'Save', icon: 'check', primary: true, keepOpen: true, onClick: function () {
          var payload = {
            displayName: name.value.trim(), username: user.value.trim().toLowerCase(), avatar: ava.value,
            color: colorPicked ? color.value : '', bio: bio.value.trim(), personality: form.personality, skills: form.skills
          };
          if (!isNew) payload.id = p.id;
          B().api('POST', '/admin/crew/player', payload).then(function (r) {
            FF.UI.toast(isNew ? r.player.displayName + ' joined the crew' : 'Saved', { type: 'success' });
            dlg.close();
            reload();
          }).catch(errorToast);
        } },
        { label: 'Cancel' }
      ]
    });
    if (isNew) draft();
  }

  /* ---------- AI providers ---------- */
  function aiCard() {
    var card = K().card('AI providers', 'Optional. Used to write fresher crew drafts. Keys are stored encrypted on the server and never shown again. Everything works without AI.');
    var box = el('div', {});
    card.appendChild(box);
    function draw(data) {
      FF.ui.clear(box);
      if (!data.ready) box.appendChild(el('p', { class: 'notice notice--info' }, 'Keys can’t be saved yet: set ai.secret_key in the server config (and make sure PHP has sodium).'));
      var tools = el('div', { class: 'admin-actions' });
      tools.appendChild(FF.UI.button('Add provider', { class: 'btn-sm btn-primary', icon: 'plus', onClick: function () { editProvider(null, data, draw); } }));
      if (!data.providers.length) {
        box.appendChild(el('p', { class: 'admin-empty' }, 'No AI providers. Crew drafts use the built-in names and descriptions.'));
        box.appendChild(tools);
        return;
      }
      var list = el('ul', { class: 'plan-list' });
      data.providers.forEach(function (pr) {
        var li = el('li', { class: 'plan-row' + (pr.enabled ? '' : ' is-off') });
        var w = el('div', { class: 'plan-row__text' });
        w.appendChild(el('strong', {}, pr.name));
        var vendor = (data.vendors[pr.vendor] || {}).name || pr.vendor;
        var bits = [vendor + (pr.model ? ' · ' + pr.model : ''), 'for ' + pr.kind,
          'today ' + pr.today.requests + ' of ' + pr.dailyLimit + ' requests' + (pr.today.failures ? ', ' + pr.today.failures + ' failed' : '')];
        w.appendChild(el('span', {}, bits.join(' · ')));
        li.appendChild(w);
        var badges = el('span', { class: 'bill-badges' });
        badges.appendChild(el('span', { class: 'bill-badge ' + (pr.enabled ? 'bill-badge--paid' : 'bill-badge--test') }, pr.enabled ? 'On' : 'Off'));
        badges.appendChild(el('span', { class: 'bill-badge ' + (pr.hasKey ? 'bill-badge--paid' : 'bill-badge--failed') }, pr.hasKey ? 'Key saved' : 'No key'));
        li.appendChild(badges);
        var testBtn = FF.UI.button('Test', { class: 'btn-sm btn-ghost', icon: 'lightning', onClick: function () {
          testBtn.disabled = true;
          B().api('POST', '/admin/ai/test', { id: pr.id }).then(function (r) {
            testBtn.disabled = false;
            FF.UI.toast(r.message + ' (' + r.ms + ' ms)', { type: r.ok ? 'success' : 'error' });
          }).catch(function (e) { testBtn.disabled = false; errorToast(e); });
        } });
        li.appendChild(testBtn);
        li.appendChild(FF.UI.button('Edit', { class: 'btn-sm btn-ghost', icon: 'pencil', onClick: function () { editProvider(pr, data, draw); } }));
        list.appendChild(li);
      });
      box.appendChild(list);
      box.appendChild(tools);
    }
    K().loading(box);
    B().api('GET', '/admin/ai').then(draw).catch(function (e) { failed(box, e); });
    return card;
  }

  function editProvider(pr, data, redraw) {
    var isNew = !pr;
    var body = el('div', { class: 'admin-detail plan-edit' });
    function field(label, control, hint) {
      var id = FF.UI.uid('ai');
      control.id = id;
      var f = el('div', { class: 'field' }, [el('label', { class: 'field__label', for: id }, label), control]);
      if (hint) f.appendChild(el('span', { class: 'field__hint' }, hint));
      body.appendChild(f);
      return control;
    }
    var vendor = el('select', { class: 'input field__input' });
    Object.keys(data.vendors).forEach(function (v) { vendor.appendChild(el('option', { value: v }, data.vendors[v].name)); });
    vendor.value = pr ? pr.vendor : 'deepseek';
    field('Provider', vendor);
    var KIND_LABELS = { text: 'Text (crew drafts)', voice: 'Voice (later)', image: 'Pictures (later)', other: 'Other' };
    var kind = el('select', { class: 'input field__input' });
    data.kinds.forEach(function (k) { kind.appendChild(el('option', { value: k }, KIND_LABELS[k] || k)); });
    kind.value = pr ? pr.kind : 'text';
    field('Used for', kind);
    var name = field('Name', el('input', { class: 'input field__input', type: 'text', maxlength: 60, value: pr ? pr.name : '' }), 'Only admins see this.');
    var base = field('Address', el('input', { class: 'input field__input', type: 'url', spellcheck: 'false', value: pr ? pr.baseUrl : '' }), 'Starts with https://. Filled in for DeepSeek and OpenAI.');
    var model = field('Model', el('input', { class: 'input field__input', type: 'text', spellcheck: 'false', maxlength: 80, value: pr ? pr.model : '' }), 'The model name from the provider’s documentation.');
    var key = field('API key', el('input', { class: 'input field__input', type: 'password', autocomplete: 'off', spellcheck: 'false', maxlength: 500,
      placeholder: pr && pr.hasKey ? 'Saved. Leave empty to keep it.' : '' }), 'Stored encrypted. It is never shown again.');
    var limit = field('Requests a day', el('input', { class: 'input field__input', type: 'number', min: 0, max: 100000, step: 1, value: String(pr ? pr.dailyLimit : 200) }), 'After this, PlayMona stops asking it until tomorrow (UTC).');
    var timeout = field('Wait for an answer (seconds)', el('input', { class: 'input field__input', type: 'number', min: 1, max: 30, step: 1, value: String(pr ? Math.round(pr.timeoutMs / 1000) : 8) }));
    var form = { enabled: pr ? pr.enabled : true, clearKey: false };
    body.appendChild(FF.UI.switchRow({ label: 'On', description: 'Off keeps the provider saved but unused.', checked: form.enabled, onChange: function (on) { form.enabled = on; } }));
    if (pr && pr.hasKey) {
      body.appendChild(FF.UI.switchRow({ label: 'Remove the saved key', checked: false, onChange: function (on) { form.clearKey = on; } }));
    }

    // Presets fill the address and model when they are empty or still the old preset.
    function applyPreset(prev) {
      var was = data.vendors[prev] || {};
      var now = data.vendors[vendor.value] || {};
      if (!base.value || base.value === was.baseUrl) base.value = now.baseUrl || '';
      if (!model.value || model.value === was.model) model.value = now.model || '';
      if (!name.value || name.value === was.name) name.value = now.name || '';
    }
    var lastVendor = vendor.value;
    vendor.addEventListener('change', function () { applyPreset(lastVendor); lastVendor = vendor.value; });
    if (isNew) applyPreset('');

    var actions = [
      { label: 'Save', icon: 'check', primary: true, keepOpen: true, onClick: function () {
        var payload = {
          vendor: vendor.value, kind: kind.value, name: name.value.trim(), baseUrl: base.value.trim(), model: model.value.trim(),
          dailyLimit: Number(limit.value), timeoutMs: Math.round(Number(timeout.value) * 1000), enabled: form.enabled
        };
        if (pr) payload.id = pr.id;
        if (key.value.trim()) payload.apiKey = key.value.trim();
        if (form.clearKey) payload.clearKey = true;
        B().api('POST', '/admin/ai/provider', payload).then(function (fresh) {
          key.value = '';
          FF.UI.toast('Saved', { type: 'success' });
          dlg.close();
          redraw(fresh);
        }).catch(errorToast);
      } }
    ];
    if (pr) {
      actions.push({ label: 'Delete', icon: 'trash', danger: true, keepOpen: true, onClick: function () {
        FF.UI.confirm({
          title: 'Delete ' + pr.name + '?', body: 'Its saved key is deleted too. Crew drafts fall back to another provider or the built-in drafts.',
          confirmLabel: 'Delete', danger: true,
          onConfirm: function () {
            B().api('POST', '/admin/ai/provider/delete', { id: pr.id }).then(function (fresh) {
              FF.UI.toast('Deleted', { type: 'success' });
              dlg.close();
              redraw(fresh);
            }).catch(errorToast);
          }
        });
      } });
    }
    actions.push({ label: 'Cancel' });
    var dlg = FF.UI.dialog({ title: isNew ? 'Add an AI provider' : 'Edit ' + pr.name, body: body, actions: actions });
  }

  FF.AdminPages = FF.AdminPages || {};
  FF.AdminPages.crew = crew;
})();
