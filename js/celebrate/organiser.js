/* PlayMona Celebrations: the organiser's screens inside the app (reached from the Online page).
   Views (merged into FF.App.views):
     celebrations      - my celebrations + "Create a celebration"
     celebrationNew    - the create wizard: details, look, settings
     celebration       - one celebration's dashboard: { id, tab }
     celebrationGame   - a game's editor (js/celebrate/games.js): { id, gameId }
   Everything goes through the PHP API (FF.Api); no Firebase connection is opened here,
   which keeps the free Firebase plan's connection limit for the guests' phones. */
window.FF = window.FF || {};
(function () {
  'use strict';

  var C = function () { return FF.Celebrate; };
  function t(k, f, v) { return FF.t(k, f, v); }
  function el(tag, attrs, kids) { return FF.ui.el(tag, attrs, kids); }
  function div(cls, kids) { return FF.ui.div(cls, kids); }
  function icon(k) { return FF.Icons.icon(k); }

  var DEFAULT_SETTINGS = {
    private: false, requireAccount: false, guestTeams: true, anonymousMessages: true,
    photoUploads: true, leaderboard: true, approveMessages: true, hasMc: false
  };
  var refreshTimer = null;

  function stopRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = null;
  }

  /* Who may organise: a real PlayMona account on the live site (or the local dev mode). */
  function blocked(main) {
    var dev = FF.Net && FF.Net.devMode && FF.Net.devMode();
    if (!dev && (!FF.Auth || FF.Auth.mode() !== 'firebase' || typeof location === 'undefined' || !/^https?:$/.test(location.protocol))) {
      main.appendChild(FF.UI.emptyState({
        icon: 'wifi', title: t('celNeedsOnline', 'Celebrations need the internet'),
        text: t('celNeedsOnlineText', 'Open PlayMona on playmona.com and sign in to organise a celebration.')
      }));
      return true;
    }
    if (FF.Auth.isGuest()) {
      main.appendChild(FF.Access.lockedPanel('celebrations', t('celSignUpTitle', 'Sign up free to organise a celebration')));
      return true;
    }
    return false;
  }

  function errorBox(main, e, retry) {
    FF.ui.clear(main);
    main.appendChild(FF.UI.emptyState({
      icon: 'alert', title: t('celLoadFailed', 'That did not load'),
      text: (e && e.message) || t('apiDown', 'Something went wrong. Please try again.'),
      action: retry ? { label: t('tryAgain', 'Try again'), icon: 'restart', onClick: retry } : null
    }));
  }

  function field(label, input, hint) {
    var id = 'cel-f-' + Math.random().toString(36).slice(2, 8);
    input.id = id;
    var wrap = div('field cel-field');
    wrap.appendChild(el('label', { class: 'field__label', for: id }, label));
    wrap.appendChild(input);
    if (hint) wrap.appendChild(el('p', { class: 'field__hint' }, hint));
    return wrap;
  }
  function textInput(value, opts) {
    opts = opts || {};
    var inp = el(opts.multiline ? 'textarea' : 'input', {
      class: 'input field__input' + (opts.multiline ? ' cel-textarea' : ''),
      type: opts.multiline ? null : (opts.type || 'text'),
      maxlength: opts.max || null,
      placeholder: opts.placeholder || null,
      autocomplete: 'off',
      rows: opts.multiline ? (opts.rows || 3) : null
    });
    inp.value = value == null ? '' : value;
    if (opts.onInput) inp.addEventListener('input', function () { opts.onInput(inp.value); });
    return inp;
  }

  /* ================= My celebrations ================= */

  function listView(main) {
    stopRefresh();
    if (blocked(main)) return;
    var head = div('cel-page-head');
    head.appendChild(FF.App.pageHead(t('celebrations', 'Celebrations'),
      t('celebrationsSub', 'Personal games, team competitions and a wall of love for birthdays, weddings, graduations and more.')));
    main.appendChild(head);

    var intro = el('section', { class: 'cel-intro' });
    C().applyTheme(intro, { look: 'gala' });
    var introBody = div('cel-intro__body');
    introBody.appendChild(el('p', { class: 'cel-intro__eyebrow' }, t('celTagline', 'Celebrate. Connect. Remember.')));
    introBody.appendChild(el('h2', { class: 'cel-intro__title' }, t('celIntroTitle', 'Make a celebration everyone plays together')));
    var points = el('ul', { class: 'cel-intro__points' });
    [['images', t('celPoint1', 'Turn your own photos into team puzzle games')],
      ['qr-scan', t('celPoint2', 'Guests join by QR code. No app, no account')],
      ['heart', t('celPoint3', 'Collect wishes and photos on a wall of love')],
      ['tv', t('celPoint4', 'Show live scores on the TV')]].forEach(function (p) {
      var li = el('li', {});
      li.appendChild(icon(p[0]));
      li.appendChild(FF.ui.span('', p[1]));
      points.appendChild(li);
    });
    introBody.appendChild(points);
    introBody.appendChild(FF.UI.button(t('celCreate', 'Create a celebration'), { class: 'btn-lg cel-btn-primary', icon: 'plus', onClick: function () { FF.Nav.go('celebrationNew'); } }));
    intro.appendChild(introBody);
    main.appendChild(intro);

    var listWrap = div('cel-list-wrap');
    main.appendChild(listWrap);
    listWrap.appendChild(FF.UI.loading(t('loading', 'Loading…')));
    FF.Api.call('GET', '/c/mine').then(function (data) {
      FF.ui.clear(listWrap);
      var items = data.celebrations || [];
      if (!items.length) return;
      listWrap.appendChild(FF.App.sectionHead(t('celYours', 'Your celebrations')));
      var grid = el('ul', { class: 'cel-cards' });
      items.forEach(function (ev) {
        var li = el('li', {});
        var b = el('button', { type: 'button', class: 'cel-card', onclick: function () { FF.Nav.go('celebration', { id: ev.id }); } });
        C().applyTheme(b, ev.theme);
        var art = div('cel-card__art');
        if (ev.cover) art.appendChild(el('img', { src: ev.cover.thumb, alt: '', loading: 'lazy' }));
        else art.appendChild(icon(C().type(ev.type).icon));
        b.appendChild(art);
        var body = div('cel-card__body');
        body.appendChild(el('strong', { class: 'cel-card__title' }, ev.title));
        body.appendChild(el('span', { class: 'cel-card__meta' }, [C().formatDate(ev.date) || C().typeLabel(ev.type), ' · ',
          t(ev.guests === 1 ? 'celGuestOne' : 'celGuestMany', ev.guests === 1 ? '1 guest' : '{n} guests', { n: ev.guests })].join('')));
        b.appendChild(body);
        b.appendChild(icon('chevron-right'));
        li.appendChild(b);
        grid.appendChild(li);
      });
      listWrap.appendChild(grid);
    }, function (e) {
      FF.ui.clear(listWrap);
      listWrap.appendChild(el('p', { class: 'field__error' }, e.message));
    });

    // Guests sometimes land here first: let them open an event by its code.
    var join = el('form', { class: 'cel-code-form', onsubmit: function (e) {
      e.preventDefault();
      var code = codeInput.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      if (code.length === 6) location.href = '/c?code=' + encodeURIComponent(code);
      else FF.UI.toast(t('celCodeShort', 'The code has 6 letters and numbers.'));
    } });
    var codeInput = textInput('', { max: 6, placeholder: 'ABC234' });
    codeInput.classList.add('cel-code-input');
    codeInput.setAttribute('autocapitalize', 'characters');
    join.appendChild(field(t('celHaveCode', 'Invited to a celebration? Type its code'), codeInput));
    join.appendChild(FF.UI.button(t('celOpen', 'Open'), { class: 'btn-ghost', icon: 'arrow-right' }));
    main.appendChild(join);
  }

  /* ================= Form sections (wizard and Settings tab) ================= */

  function detailsSection(draft, onChange) {
    var box = div('cel-form');
    var types = el('div', { class: 'cel-types', role: 'radiogroup', 'aria-label': t('celKind', 'Kind of celebration') });
    C().TYPES.forEach(function (ty) {
      var b = el('button', { type: 'button', class: 'cel-type' + (draft.type === ty.id ? ' active' : ''), role: 'radio', 'aria-checked': draft.type === ty.id ? 'true' : 'false' });
      b.appendChild(icon(ty.icon));
      b.appendChild(FF.ui.span('', C().label(ty.label)));
      b.addEventListener('click', function () {
        draft.type = ty.id;
        Array.prototype.forEach.call(types.children, function (x) { x.classList.toggle('active', x === b); x.setAttribute('aria-checked', x === b ? 'true' : 'false'); });
        autoTitle();
        onChange();
      });
      types.appendChild(b);
    });
    box.appendChild(field(t('celKind', 'Kind of celebration'), types));

    var name = textInput(draft.celebrantName, { max: 60, placeholder: t('celNamePh', 'e.g. Vicky'), onInput: function (v) { draft.celebrantName = v; autoTitle(); onChange(); } });
    box.appendChild(field(t('celCelebrant', 'Who are we celebrating?'), name, t('celCelebrantHint', 'One name, or two for a couple.')));
    var title = textInput(draft.title, { max: 100, onInput: function (v) { draft.title = v; draft.titleTouched = true; onChange(); } });
    box.appendChild(field(t('celTitle', 'Celebration title'), title, t('celTitleHint', 'Shown at the top of the event page and the TV.')));
    function autoTitle() {
      if (draft.titleTouched) return;
      draft.title = draft.celebrantName.trim() ? C().defaultTitle(draft.type, draft.celebrantName.trim()) : '';
      title.value = draft.title;
    }

    var when = div('cel-row3');
    when.appendChild(field(t('celDate', 'Date'), textInput(draft.date, { type: 'date', onInput: function (v) { draft.date = v; onChange(); } })));
    when.appendChild(field(t('celStarts', 'Starts'), textInput(draft.startTime, { type: 'time', onInput: function (v) { draft.startTime = v; onChange(); } })));
    when.appendChild(field(t('celEnds', 'Ends'), textInput(draft.endTime, { type: 'time', onInput: function (v) { draft.endTime = v; onChange(); } })));
    box.appendChild(when);
    box.appendChild(field(t('celVenue', 'Venue'), textInput(draft.venue, { max: 140, placeholder: t('celVenuePh', 'e.g. Tea Room, Trade Fair'), onInput: function (v) { draft.venue = v; onChange(); } })));
    box.appendChild(field(t('celDescription', 'About the celebration'), textInput(draft.description, { multiline: true, max: 800, placeholder: t('celDescriptionPh', 'A line or two, e.g. the theme: 40, fortified and qualified.'), onInput: function (v) { draft.description = v; onChange(); } })));
    box.appendChild(field(t('celWelcome', 'Welcome message for guests'), textInput(draft.welcome, { multiline: true, max: 500, placeholder: t('celWelcomePh', 'e.g. Welcome! Join a team, play the games and leave Vicky a message.'), onInput: function (v) { draft.welcome = v; onChange(); } })));
    return box;
  }

  /* Look: the 6 looks, own colours, font and the cover photo. coverHandler(file) uploads or keeps it. */
  function lookSection(draft, onChange, coverHandler) {
    var box = div('cel-form');
    var looks = el('div', { class: 'cel-looks', role: 'radiogroup', 'aria-label': t('celLook', 'Look') });
    C().LOOKS.forEach(function (lk) {
      var b = el('button', { type: 'button', class: 'cel-look-pick' + (draft.theme.look === lk.id ? ' active' : ''), role: 'radio', 'aria-checked': draft.theme.look === lk.id ? 'true' : 'false' });
      var sw = div('cel-look-pick__swatch');
      C().applyTheme(sw, { look: lk.id });
      sw.appendChild(div('cel-look-pick__dot'));
      sw.appendChild(div('cel-look-pick__dot cel-look-pick__dot--2'));
      b.appendChild(sw);
      b.appendChild(FF.ui.span('cel-look-pick__name', C().label(lk.label)));
      b.addEventListener('click', function () {
        draft.theme.look = lk.id;
        delete draft.theme.primary;
        delete draft.theme.secondary;
        delete draft.theme.background;
        Array.prototype.forEach.call(looks.children, function (x) { x.classList.toggle('active', x === b); x.setAttribute('aria-checked', x === b ? 'true' : 'false'); });
        colours.forEach(function (c) { c.reset(); });
        onChange();
      });
      looks.appendChild(b);
    });
    box.appendChild(field(t('celLook', 'Look'), looks, t('celLookHint', 'Every look is easy to read on phones and the TV.')));

    var colours = [];
    var row = div('cel-row3');
    [['primary', t('celPrimary', 'Main colour')], ['secondary', t('celSecondary', 'Second colour')], ['background', t('celBackground', 'Background')]].forEach(function (c) {
      var wrap = div('cel-colour');
      var inp = el('input', { type: 'color', class: 'cel-colour__input' });
      var on = el('input', { type: 'checkbox', class: 'cel-colour__on' });
      function reset() {
        on.checked = !!draft.theme[c[0]];
        inp.value = draft.theme[c[0]] || '#d4a017';
        inp.disabled = !on.checked;
      }
      reset();
      on.addEventListener('change', function () {
        inp.disabled = !on.checked;
        if (on.checked) draft.theme[c[0]] = inp.value; else delete draft.theme[c[0]];
        onChange();
      });
      inp.addEventListener('input', function () { draft.theme[c[0]] = inp.value; onChange(); });
      var lab = el('label', { class: 'cel-colour__label' }, [on, FF.ui.span('', c[1])]);
      wrap.appendChild(lab);
      wrap.appendChild(inp);
      inp.setAttribute('aria-label', c[1]);
      row.appendChild(wrap);
      colours.push({ reset: reset });
    });
    box.appendChild(field(t('celOwnColours', 'Your own colours (optional)'), row, t('celOwnColoursHint', 'Text colours adjust themselves so everything stays readable.')));

    box.appendChild(field(t('celFont', 'Lettering'), FF.UI.segmented({
      label: t('celFont', 'Lettering'), value: draft.theme.font || 'classic', compact: true,
      options: C().FONTS.map(function (f) { return { label: C().label(f.label), value: f.id }; }),
      onChange: function (v) { draft.theme.font = v; onChange(); }
    })));

    var cover = div('cel-cover-pick');
    var coverName = el('span', { class: 'cel-cover-pick__name' }, draft.coverName || (draft.cover ? t('celCoverSet', 'Cover photo added') : t('celNoCover', 'No cover photo yet')));
    cover.appendChild(coverName);
    var coverBtn = FF.UI.button(draft.cover || draft.coverName ? t('celCoverChange', 'Change photo') : t('celCoverAdd', 'Add a cover photo'), {
      class: 'btn-ghost btn-sm', icon: 'image', onClick: function () {
        C().choosePicture(function (file) {
          FF.UI.busy(coverBtn, true);
          coverHandler(file).then(function (label) {
            coverName.textContent = label || file.name;
            onChange();
          }, function (e) { FF.UI.toast(e.message); }).then(function () { FF.UI.busy(coverBtn, false); });
        });
      }
    });
    cover.appendChild(coverBtn);
    box.appendChild(field(t('celCover', 'Cover photo'), cover, t('celCoverHint', 'A photo of the person you are celebrating looks lovely here.')));
    return box;
  }

  function settingsSection(draft, onChange, opts) {
    opts = opts || {};
    var box = div('cel-form');
    var s = draft.settings;
    function sw(key, label, desc) {
      box.appendChild(FF.UI.switchRow({ label: label, description: desc, checked: !!s[key], onChange: function (on) { s[key] = on; onChange(); } }));
    }
    sw('guestTeams', t('celSetGuestTeams', 'Guests pick their own team'), t('celSetGuestTeamsDesc', 'Off: you put guests into teams yourself.'));
    sw('leaderboard', t('celSetLeaderboard', 'Show the live leaderboard to guests'), t('celSetLeaderboardDesc', 'Team scores on everyone\'s phone during the games.'));
    sw('approveMessages', t('celSetApprove', 'Approve messages before others see them'), t('celSetApproveDesc', 'Messages wait for you before they show on the wall or the TV.'));
    sw('anonymousMessages', t('celSetAnonymous', 'Allow messages without a name'), null);
    sw('photoUploads', t('celSetPhotos', 'Guests can add photos to their messages'), null);
    sw('hasMc', t('celSetMc', 'Someone else is the MC'), t('celSetMcDesc', 'Gives you a separate link for the MC\'s phone to run the games.'));
    sw('private', t('celSetPrivate', 'Private: the page needs the join code'), t('celSetPrivateDesc', 'The QR code includes the code, so scanning still works.'));
    sw('requireAccount', t('celSetAccount', 'Guests need a PlayMona account'), t('celSetAccountDesc', 'Usually off: guests join with just their name.'));

    if (opts.teamCount) {
      box.appendChild(field(t('celStartTeams', 'Start with teams'), FF.UI.segmented({
        label: t('celStartTeams', 'Start with teams'), value: String(draft.teamCount), compact: true,
        options: ['0', '2', '3', '4', '5', '6', '8'].map(function (n) { return { label: n === '0' ? t('celNone', 'None') : n, value: n }; }),
        onChange: function (v) { draft.teamCount = Number(v); onChange(); }
      }), t('celStartTeamsHint', 'Named Gold, Silver, Ruby, Emerald… You can rename them later.')));
    }

    var slugInput = textInput(draft.slug, { max: 36, placeholder: t('celSlugPh', 'e.g. vicky40') });
    var slugNote = el('p', { class: 'field__hint', 'aria-live': 'polite' }, t('celSlugHint', 'Leave empty and we make one from the name.'));
    var slugTimer = null;
    slugInput.addEventListener('input', function () {
      draft.slug = slugInput.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
      if (slugInput.value !== draft.slug) slugInput.value = draft.slug;
      clearTimeout(slugTimer);
      if (!draft.slug) { slugNote.textContent = t('celSlugHint', 'Leave empty and we make one from the name.'); return; }
      slugNote.textContent = (location.host || 'playmona.com') + '/c/' + draft.slug;
      slugTimer = setTimeout(function () {
        if (draft.slug.length < 3) { slugNote.textContent = t('celSlugShort', 'Use at least 3 letters or numbers.'); return; }
        FF.Api.call('GET', '/c/slug?s=' + encodeURIComponent(draft.slug) + (opts.self ? '&self=' + opts.self : '')).then(function (r) {
          slugNote.textContent = (location.host || 'playmona.com') + '/c/' + draft.slug + ' · ' + (r.free ? t('celSlugFree', 'available') : t('celSlugTaken', 'taken, try another'));
        }, function () {});
      }, 400);
      onChange();
    });
    var slugField = field(t('celSlug', 'Web address'), slugInput);
    slugField.appendChild(slugNote);
    box.appendChild(slugField);
    return box;
  }

  function draftFrom(ev) {
    return {
      type: ev.type, celebrantName: ev.celebrantName, title: ev.title, titleTouched: true,
      date: ev.date || '', startTime: ev.startTime || '', endTime: ev.endTime || '', venue: ev.venue || '',
      description: ev.description || '', welcome: ev.welcome || '',
      theme: Object.assign({}, ev.theme || { look: 'gala', font: 'classic' }),
      settings: Object.assign({}, DEFAULT_SETTINGS, ev.settings || {}),
      slug: ev.slug, cover: ev.cover
    };
  }
  function draftAsEvent(d) {
    return { type: d.type, title: d.title, celebrantName: d.celebrantName, date: d.date, startTime: d.startTime, endTime: d.endTime, venue: d.venue, theme: d.theme, cover: d.coverPreview || d.cover };
  }
  function payload(d) {
    var tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    return {
      type: d.type, celebrantName: d.celebrantName.trim(), title: d.title.trim(), date: d.date, startTime: d.startTime, endTime: d.endTime,
      timezone: tz, venue: d.venue, description: d.description, welcome: d.welcome, theme: d.theme, settings: d.settings
    };
  }

  /* ================= Create wizard ================= */

  function wizardView(main) {
    stopRefresh();
    if (blocked(main)) return;
    var draft = {
      type: 'birthday', celebrantName: '', title: '', titleTouched: false, date: '', startTime: '', endTime: '', venue: '',
      description: '', welcome: '', theme: { look: 'gala', font: 'classic' }, settings: Object.assign({}, DEFAULT_SETTINGS),
      teamCount: 4, slug: '', coverFile: null, coverPreview: null
    };
    var step = 0;
    var steps = [t('celStepDetails', 'Details'), t('celStepLook', 'Look'), t('celStepSettings', 'Settings')];

    var back = FF.UI.button(t('celebrations', 'Celebrations'), { class: 'btn-ghost btn-sm cel-back', icon: 'arrow-left', onClick: function () { FF.Nav.go('celebrations'); } });
    main.appendChild(back);
    main.appendChild(FF.App.pageHead(t('celCreate', 'Create a celebration'), t('celCreateSub', 'Three short steps. You can change everything later.')));

    var layout = div('cel-wizard');
    var formCol = div('cel-wizard__form');
    var previewCol = el('aside', { class: 'cel-wizard__preview', 'aria-label': t('celPreview', 'Preview') });
    layout.appendChild(formCol);
    layout.appendChild(previewCol);
    main.appendChild(layout);

    var stepper = el('ol', { class: 'cel-steps' });
    var stepBody = div('cel-step-body');
    var nav = div('cel-wizard__nav');
    var error = el('p', { class: 'field__error', 'aria-live': 'assertive' });
    formCol.appendChild(stepper);
    formCol.appendChild(stepBody);
    formCol.appendChild(error);
    formCol.appendChild(nav);

    function preview() {
      FF.ui.clear(previewCol);
      previewCol.appendChild(el('p', { class: 'cel-preview-label' }, t('celPreviewLabel', 'Your guests will see')));
      previewCol.appendChild(C().hero(draftAsEvent(draft), { compact: true }));
    }

    function coverHandler(file) {
      return C().shrinkPicture(file, 2048).then(function (blob) {
        draft.coverFile = blob;
        if (draft.coverPreview && draft.coverPreview.play) URL.revokeObjectURL(draft.coverPreview.play);
        draft.coverPreview = { play: URL.createObjectURL(blob) };
        draft.coverName = file.name;
        return file.name;
      });
    }

    function render() {
      FF.ui.clear(stepper);
      steps.forEach(function (s, i) {
        stepper.appendChild(el('li', { class: 'cel-steps__item' + (i === step ? ' is-current' : '') + (i < step ? ' is-done' : ''), 'aria-current': i === step ? 'step' : null }, [
          FF.ui.span('cel-steps__num', String(i + 1)), FF.ui.span('cel-steps__label', s)
        ]));
      });
      FF.ui.clear(stepBody);
      error.textContent = '';
      if (step === 0) stepBody.appendChild(detailsSection(draft, preview));
      if (step === 1) stepBody.appendChild(lookSection(draft, preview, coverHandler));
      if (step === 2) stepBody.appendChild(settingsSection(draft, preview, { teamCount: true }));
      FF.ui.clear(nav);
      if (step > 0) nav.appendChild(FF.UI.button(t('back', 'Back'), { class: 'btn-ghost', icon: 'arrow-left', onClick: function () { step--; render(); } }));
      var last = step === steps.length - 1;
      var next = FF.UI.button(last ? t('celCreateNow', 'Create celebration') : t('next', 'Next'), {
        class: 'btn-lg btn-primary', icon: last ? 'confetti' : 'arrow-right',
        onClick: function () {
          if (step === 0 && !draft.celebrantName.trim()) { error.textContent = t('celNeedName', 'Add the name of the person you are celebrating.'); return; }
          if (step === 0 && !draft.title.trim()) { error.textContent = t('celNeedTitle', 'Give the celebration a title.'); return; }
          if (!last) { step++; render(); FF.Nav.focusFirst(stepBody); window.scrollTo(0, 0); return; }
          create(next);
        }
      });
      nav.appendChild(next);
      preview();
    }

    function create(btn) {
      FF.UI.busy(btn, true);
      error.textContent = '';
      var body = payload(draft);
      body.teamCount = draft.teamCount;
      if (draft.slug) body.slug = draft.slug;
      FF.Api.call('POST', '/c', body).then(function (ev) {
        if (!draft.coverFile) return ev;
        return FF.Api.upload('/c/' + ev.id + '/media?purpose=cover', draft.coverFile).then(function () { return ev; }, function (e) {
          FF.UI.toast(t('celCoverLater', 'The celebration is ready, but the cover photo did not upload: ') + e.message);
          return ev;
        });
      }).then(function (ev) {
        if (FF.Confetti) FF.Confetti.burst(80);
        FF.Nav.replace('celebration', { id: ev.id, tab: 'invite', fresh: true });
      }, function (e) {
        FF.UI.busy(btn, false);
        error.textContent = e.message;
      });
    }
    render();
  }

  /* ================= Dashboard ================= */

  var TABS = [
    { id: 'overview', icon: 'squares-four', label: ['celTabOverview', 'Overview'] },
    { id: 'invite', icon: 'qr-scan', label: ['celTabInvite', 'Invite'] },
    { id: 'teams', icon: 'users-three', label: ['celTabTeams', 'Teams'] },
    { id: 'games', icon: 'puzzle-piece', label: ['celTabGames', 'Games'] },
    { id: 'wall', icon: 'heart', label: ['celTabWall', 'Wall'] },
    { id: 'settings', icon: 'gear', label: ['celTabSettings', 'Settings'] }
  ];

  function dashboardView(main, params) {
    stopRefresh();
    params = params || {};
    if (blocked(main)) return;
    if (!params.id) { FF.Nav.replace('celebrations'); return; }
    var state = { ev: null, tab: params.tab || 'overview' };
    var shell = div('cel-dash');
    main.appendChild(FF.UI.button(t('celebrations', 'Celebrations'), { class: 'btn-ghost btn-sm cel-back', icon: 'arrow-left', onClick: function () { FF.Nav.go('celebrations'); } }));
    main.appendChild(shell);
    shell.appendChild(FF.UI.loading(t('loading', 'Loading…')));

    function load() {
      return FF.Api.call('GET', '/c/' + params.id + '/manage').then(function (ev) {
        state.ev = ev;
        return ev;
      });
    }

    function render() {
      var ev = state.ev;
      FF.ui.clear(shell);
      shell.appendChild(C().hero(ev, { tag: 'h1' }));
      document.title = ev.title + ' · ' + FF.Brand.name;
      var tabs = el('div', { class: 'tabs tabs--scroll cel-tabs', role: 'tablist', 'aria-label': t('celSections', 'Celebration sections') });
      TABS.forEach(function (tb) {
        var b = el('button', { type: 'button', role: 'tab', class: 'tabs__tab' + (state.tab === tb.id ? ' active' : ''), 'aria-selected': state.tab === tb.id ? 'true' : 'false' });
        b.appendChild(icon(tb.icon));
        b.appendChild(FF.ui.span('', C().label(tb.label)));
        b.addEventListener('click', function () {
          state.tab = tb.id;
          FF.Nav.replace('celebration', { id: ev.id, tab: tb.id });
        });
        tabs.appendChild(b);
      });
      shell.appendChild(tabs);
      var panel = el('div', { class: 'cel-panel', role: 'tabpanel' });
      shell.appendChild(panel);
      var tabs2 = { overview: overviewTab, invite: inviteTab, teams: teamsTab, settings: settingsTab, games: FF.CelebrateGames.tab, wall: FF.CelebrateMessages.tab };
      (tabs2[state.tab] || overviewTab)(panel, ev, update);
    }

    /* Saves a change through the API and redraws with the server's answer. */
    function update(promise) {
      return promise.then(function (ev) {
        if (ev && ev.id) state.ev = ev;
        render();
        return ev;
      }, function (e) { FF.UI.toast(e.message); throw e; });
    }

    load().then(function () {
      render();
      if (params.fresh) FF.UI.toast(t('celCreated', 'Your celebration is ready. Invite your guests.'));
      // Guests keep arriving: refresh the numbers while this screen is open (API only, no Firebase).
      refreshTimer = setInterval(function () {
        if (!shell.isConnected) { stopRefresh(); return; }
        if (document.hidden || state.tab === 'settings' || state.tab === 'games' || state.tab === 'wall') return;
        if (shell.querySelector('.ff-dialog') || document.querySelector('.ff-dialog')) return;
        // Never redraw under the organiser's hands (an open team list, a half-typed name).
        var active = document.activeElement;
        if (active && shell.contains(active) && /^(SELECT|INPUT|TEXTAREA)$/.test(active.tagName)) return;
        var before = sameKey(state.ev);
        load().then(function (ev) { if (sameKey(ev) !== before) render(); }, function () {});
      }, 10000);
    }, function (e) { errorBox(shell, e, function () { FF.Nav.replace('celebration', params); }); });
  }

  /* What the dashboard shows, minus the heartbeat times that change on every guest refresh. */
  function sameKey(ev) {
    return JSON.stringify(ev, function (k, v) { return k === 'lastSeen' ? undefined : v; });
  }

  /* ---------- Overview ---------- */
  function overviewTab(panel, ev) {
    var stats = el('ul', { class: 'cel-stats' });
    [['users', ev.stats.guests, t('celStatGuests', 'Guests')],
      ['users-three', ev.stats.teams, t('celStatTeams', 'Teams')],
      ['clock', ev.stats.withoutTeam, t('celStatWaiting', 'Without a team')]].forEach(function (s) {
      var li = el('li', { class: 'cel-stat' });
      li.appendChild(icon(s[0]));
      li.appendChild(el('strong', { class: 'cel-stat__n' }, String(s[1])));
      li.appendChild(el('span', { class: 'cel-stat__label' }, s[2]));
      stats.appendChild(li);
    });
    panel.appendChild(stats);

    // Real next steps, ticked from the event's own data.
    panel.appendChild(FF.App.sectionHead(t('celNextSteps', 'Get ready')));
    var list = el('ul', { class: 'cel-checklist' });
    [[!!ev.cover, t('celStepCover', 'Add a cover photo'), 'settings'],
      [ev.stats.teams > 0, t('celStepTeams', 'Set up the teams'), 'teams'],
      [ev.stats.guests > 0, t('celStepInvite', 'Invite your guests with the link or QR code'), 'invite'],
      [ev.stats.guests > 0 && ev.stats.withoutTeam === 0 && ev.stats.teams > 0, t('celStepEveryone', 'Everyone is in a team'), 'teams']].forEach(function (c) {
      var li = el('li', { class: 'cel-check' + (c[0] ? ' is-done' : '') });
      var b = el('button', { type: 'button', class: 'cel-check__btn', onclick: function () { FF.Nav.replace('celebration', { id: ev.id, tab: c[2] }); } });
      b.appendChild(icon(c[0] ? 'check-circle' : 'arrow-right'));
      b.appendChild(FF.ui.span('', c[1]));
      if (c[0]) b.appendChild(FF.ui.span('sr-only', ' ' + t('done', 'Done')));
      li.appendChild(b);
      list.appendChild(li);
    });
    panel.appendChild(list);

    var acts = div('btn-stack');
    acts.appendChild(FF.UI.button(t('celOpenPage', 'Open the event page'), { class: 'btn-ghost', icon: 'arrows-out', onClick: function () { window.open(C().eventUrl(ev.slug), '_blank', 'noopener'); } }));
    panel.appendChild(acts);
  }

  /* ---------- Invite ---------- */
  function inviteTab(panel, ev) {
    var url = C().eventUrl(ev.slug) + (ev.settings.private ? '?code=' + ev.joinCode : '');
    var card = div('cel-invite');
    var qrBox = div('cel-invite__qr');
    var svg = C().qrSvg(url, 220, t('celQrFor', 'QR code to join {title}', { title: ev.title }));
    if (svg) qrBox.appendChild(svg);
    card.appendChild(qrBox);
    var info = div('cel-invite__info');
    info.appendChild(el('h2', { class: 'cel-invite__title' }, t('celInviteTitle', 'Invite your guests')));
    info.appendChild(el('p', { class: 'cel-invite__text' }, t('celInviteText', 'Guests scan the QR code or open the link, type their name and pick a team. No app and no account needed.')));
    var linkRow = div('cel-linkrow');
    var linkText = el('input', { type: 'text', class: 'input cel-linkrow__input', readonly: 'readonly', 'aria-label': t('celEventLink', 'Event link') });
    linkText.value = url;
    linkText.addEventListener('focus', function () { linkText.select(); });
    linkRow.appendChild(linkText);
    info.appendChild(linkRow);
    var code = div('cel-joincode');
    code.appendChild(el('span', { class: 'cel-joincode__label' }, t('celJoinCode', 'Join code')));
    code.appendChild(el('strong', { class: 'cel-joincode__code' }, ev.joinCode));
    info.appendChild(code);
    var acts = div('btn-stack');
    acts.appendChild(FF.UI.button(t('celCopyLink', 'Copy link'), { class: 'btn-primary', icon: 'copy', onClick: function () { C().copy(url, t('celLinkCopied', 'Link copied')); } }));
    acts.appendChild(FF.UI.button(t('celDownloadQr', 'Download QR'), { class: 'btn-ghost', icon: 'download', onClick: function () {
      C().downloadQr(url, ev.title, 'qr-' + ev.slug).catch(function () { FF.UI.toast(t('celQrFailed', 'The QR code could not be made.')); });
    } }));
    acts.appendChild(FF.UI.button(t('share', 'Share'), { class: 'btn-ghost', icon: 'share', onClick: function () {
      C().share(url, ev.title, t('celShareText', 'Join {title} on PlayMona', { title: ev.title }));
    } }));
    info.appendChild(acts);
    card.appendChild(info);
    panel.appendChild(card);
  }

  /* ---------- Teams ---------- */
  function teamDialog(ev, team, update) {
    var name = textInput(team ? team.name : '', { max: 30, placeholder: t('celTeamNamePh', 'e.g. Team Gold') });
    var colour = el('input', { type: 'color', class: 'cel-colour__input cel-colour__input--wide' });
    colour.value = team ? team.color.toLowerCase() : '#d4a017';
    var cap = el('input', { type: 'number', class: 'input field__input', min: '0', max: '200', inputmode: 'numeric' });
    cap.value = team ? String(team.capacity || 0) : '0';
    FF.UI.dialog({
      title: team ? t('celEditTeam', 'Edit team') : t('celAddTeam', 'Add a team'),
      body: [field(t('celTeamName', 'Team name'), name), field(t('celTeamColour', 'Team colour'), colour),
        field(t('celTeamCap', 'Most people in this team'), cap, t('celTeamCapHint', '0 means no limit.'))],
      actions: [
        { label: t('cancel', 'Cancel') },
        { label: t('save', 'Save'), primary: true, icon: 'check', onClick: function () {
          var body = { name: name.value, color: colour.value, capacity: Number(cap.value) || 0 };
          update(FF.Api.call('POST', '/c/' + ev.id + (team ? '/teams/' + team.id + '/update' : '/teams'), body));
        } }
      ]
    });
    setTimeout(function () { try { name.focus(); } catch (e) {} }, 50);
  }

  function teamsTab(panel, ev, update) {
    var bar = div('cel-toolbar');
    bar.appendChild(FF.UI.button(t('celAddTeam', 'Add a team'), { class: 'btn-primary', icon: 'plus', onClick: function () { teamDialog(ev, null, update); } }));
    if (ev.teams.length && ev.stats.withoutTeam > 0) {
      bar.appendChild(FF.UI.button(t('celShuffle', 'Put guests into teams'), { class: 'btn-ghost', icon: 'shuffle', onClick: function () {
        update(FF.Api.call('POST', '/c/' + ev.id + '/teams/auto')).then(function () { FF.UI.toast(t('celShuffled', 'Everyone has a team.')); }, function () {});
      } }));
    }
    panel.appendChild(bar);
    panel.appendChild(FF.UI.switchRow({
      label: t('celLockTeams', 'Lock teams'),
      description: t('celLockTeamsDesc', 'Guests can no longer change team. You still can.'),
      checked: !!ev.settings.teamsLocked,
      onChange: function (on) { update(FF.Api.call('POST', '/c/' + ev.id + '/teams/lock', { locked: on })); }
    }));

    if (!ev.teams.length) {
      panel.appendChild(FF.UI.emptyState({ icon: 'users-three', title: t('celNoTeams', 'No teams yet'), text: t('celNoTeamsText', 'Add teams like Gold, Silver and Diamond. Guests pick one when they join.') }));
    } else {
      var grid = el('ul', { class: 'cel-teams' });
      ev.teams.forEach(function (tm) {
        var li = el('li', { class: 'cel-team' });
        li.style.setProperty('--team', tm.color);
        li.appendChild(div('cel-team__swatch'));
        var body = div('cel-team__body');
        body.appendChild(el('strong', { class: 'cel-team__name' }, tm.name));
        body.appendChild(el('span', { class: 'cel-team__meta' }, tm.capacity
          ? t('celTeamOf', '{n} of {max}', { n: tm.members, max: tm.capacity })
          : t(tm.members === 1 ? 'celGuestOne' : 'celGuestMany', tm.members === 1 ? '1 guest' : '{n} guests', { n: tm.members })));
        li.appendChild(body);
        li.appendChild(FF.UI.iconButton('pencil', t('celEditTeamNamed', 'Edit {name}', { name: tm.name }), function () { teamDialog(ev, tm, update); }));
        li.appendChild(FF.UI.iconButton('trash', t('celDeleteTeamNamed', 'Remove {name}', { name: tm.name }), function () {
          FF.UI.confirm({
            title: t('celDeleteTeamTitle', 'Remove {name}?', { name: tm.name }),
            body: t('celDeleteTeamBody', 'Its guests stay in the celebration without a team.'),
            confirmLabel: t('remove', 'Remove'), danger: true,
            onConfirm: function () { update(FF.Api.call('POST', '/c/' + ev.id + '/teams/' + tm.id + '/delete')); }
          });
        }));
        grid.appendChild(li);
      });
      panel.appendChild(grid);
    }

    panel.appendChild(FF.App.sectionHead(t('celGuests', 'Guests') + ' (' + ev.guests.length + ')'));
    if (!ev.guests.length) {
      panel.appendChild(el('p', { class: 'hint' }, t('celNoGuests', 'No one has joined yet. Share the link or QR code from Invite.')));
      return;
    }
    var rows = el('ul', { class: 'cel-guests' });
    ev.guests.forEach(function (g) {
      var li = el('li', { class: 'cel-guest' });
      var team = null;
      ev.teams.forEach(function (tm) { if (tm.id === g.teamId) team = tm; });
      var dot = div('cel-guest__dot');
      if (team) dot.style.setProperty('--team', team.color);
      li.appendChild(dot);
      li.appendChild(el('span', { class: 'cel-guest__name' }, g.name));
      var sel = el('select', { class: 'select cel-guest__team', 'aria-label': t('celTeamFor', 'Team for {name}', { name: g.name }) });
      sel.appendChild(el('option', { value: '' }, t('celNoTeam', 'No team')));
      ev.teams.forEach(function (tm) {
        var o = el('option', { value: tm.id }, tm.name);
        if (tm.id === g.teamId) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', function () {
        update(FF.Api.call('POST', '/c/' + ev.id + '/guests/' + encodeURIComponent(g.uid) + '/move', { teamId: sel.value || null }));
      });
      li.appendChild(sel);
      li.appendChild(FF.UI.iconButton('x', t('celRemoveGuestNamed', 'Remove {name}', { name: g.name }), function () {
        FF.UI.confirm({
          title: t('celRemoveGuestTitle', 'Remove {name}?', { name: g.name }),
          body: t('celRemoveGuestBody', 'They leave the celebration and cannot join again from that phone.'),
          confirmLabel: t('remove', 'Remove'), danger: true,
          onConfirm: function () { update(FF.Api.call('POST', '/c/' + ev.id + '/guests/' + encodeURIComponent(g.uid) + '/remove')); }
        });
      }));
      rows.appendChild(li);
    });
    panel.appendChild(rows);
  }

  /* ---------- Settings ---------- */
  function settingsTab(panel, ev, update) {
    var draft = draftFrom(ev);
    var dirty = false;
    function changed() { dirty = true; save.disabled = false; }
    panel.appendChild(el('h2', { class: 'cel-section-title' }, t('celStepDetails', 'Details')));
    panel.appendChild(detailsSection(draft, changed));
    panel.appendChild(el('h2', { class: 'cel-section-title' }, t('celStepLook', 'Look')));
    panel.appendChild(lookSection(draft, changed, function (file) {
      return C().shrinkPicture(file, 2048).then(function (blob) {
        return FF.Api.upload('/c/' + ev.id + '/media?purpose=cover', blob);
      }).then(function () {
        FF.UI.toast(t('celCoverSaved', 'Cover photo saved'));
        return file.name;
      });
    }));
    panel.appendChild(el('h2', { class: 'cel-section-title' }, t('celStepSettings', 'Settings')));
    panel.appendChild(settingsSection(draft, changed, { self: ev.id }));

    var bar = div('cel-savebar');
    var save = FF.UI.button(t('celSaveChanges', 'Save changes'), { class: 'btn-lg btn-primary', icon: 'check', onClick: function () {
      if (!draft.celebrantName.trim() || !draft.title.trim()) { FF.UI.toast(t('celNeedNameTitle', 'The name and the title cannot be empty.')); return; }
      FF.UI.busy(save, true);
      var body = payload(draft);
      body.slug = draft.slug;
      update(FF.Api.call('POST', '/c/' + ev.id + '/update', body)).then(function () {
        FF.UI.toast(t('saved', 'Saved'));
      }, function () { FF.UI.busy(save, false); });
    } });
    save.disabled = !dirty;
    bar.appendChild(save);
    panel.appendChild(bar);

    var danger = el('section', { class: 'cel-danger' });
    danger.appendChild(el('h2', { class: 'cel-section-title' }, t('celDeleteTitle', 'Delete this celebration')));
    danger.appendChild(el('p', { class: 'hint' }, t('celDeleteText', 'The event page, teams and every photo are deleted for good. This cannot be undone.')));
    danger.appendChild(FF.UI.button(t('celDelete', 'Delete celebration'), { class: 'btn-danger-soft', icon: 'trash', onClick: function () {
      FF.UI.confirm({
        title: t('celDeleteConfirm', 'Delete {title}?', { title: ev.title }),
        body: t('celDeleteText', 'The event page, teams and every photo are deleted for good. This cannot be undone.'),
        confirmLabel: t('celDelete', 'Delete celebration'), danger: true,
        onConfirm: function () {
          FF.Api.call('POST', '/c/' + ev.id + '/delete').then(function () {
            FF.UI.toast(t('celDeleted', 'Celebration deleted'));
            FF.Nav.replace('celebrations');
          }, function (e) { FF.UI.toast(e.message); });
        }
      });
    } }));
    panel.appendChild(danger);
  }

  FF.CelebrateOrganiser = {
    views: {
      celebrations: listView,
      celebrationNew: wizardView,
      celebration: dashboardView,
      celebrationGame: function (main, params) { return FF.CelebrateGames.views.celebrationGame(main, params); }
    }
  };
})();
