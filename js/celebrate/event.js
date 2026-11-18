/* PlayMona Celebrations: the guest's event page (event.html).
     /c/<slug>              the celebration: welcome, join with a name, pick a team
     /c?code=ABC234         find a celebration by its join code
     /c/<slug>?code=...     a private celebration (the QR code carries the code)
   Guests never need an account: a Firebase anonymous sign-in identifies the phone,
   made only when they press Join. Everything here uses the PHP API, so a guest who is
   just waiting holds no live Firebase connection (the free plan allows 100 at once). */
window.FF = window.FF || {};
(function () {
  'use strict';

  function t(k, f, v) { return FF.t ? FF.t(k, f, v) : f; }
  function el(tag, attrs, kids) { return FF.ui.el(tag, attrs, kids); }
  function div(cls, kids) { return FF.ui.div(cls, kids); }
  var C = function () { return FF.Celebrate; };

  var main, state = { ev: null, me: null, code: null, timer: null };

  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem('playmona:cel:' + key);
      if (value === null) localStorage.removeItem('playmona:cel:' + key);
      else localStorage.setItem('playmona:cel:' + key, value);
    } catch (e) { return null; }
    return null;
  }

  function route() {
    var m = /^\/c(?:\/([a-z0-9-]{3,40}))?\/?$/.exec(location.pathname);
    var q = /[?&]code=([A-Za-z0-9]{6})/.exec(location.search);
    return { slug: m ? m[1] || null : null, code: q ? q[1].toUpperCase() : null };
  }

  function button(label, opts) {
    opts = opts || {};
    var b = el('button', { type: opts.type || 'button', class: 'ev-btn' + (opts.ghost ? ' ev-btn--ghost' : '') });
    if (opts.icon) b.appendChild(FF.Icons.icon(opts.icon));
    b.appendChild(FF.ui.span('', label));
    if (opts.onClick) b.addEventListener('click', opts.onClick);
    return b;
  }

  function card(title, kids) {
    var c = el('section', { class: 'ev-card' });
    if (title) c.appendChild(el('h2', {}, title));
    (kids || []).forEach(function (k) { if (k) c.appendChild(k); });
    return c;
  }

  function setTitle(text) { document.title = text + ' · PlayMona'; }

  /* ---------- finding the celebration ---------- */

  function codeCard(message) {
    var input = el('input', { type: 'text', class: 'input', maxlength: '6', autocomplete: 'off', autocapitalize: 'characters', placeholder: 'ABC234', 'aria-label': t('celJoinCode', 'Join code') });
    var err = el('p', { class: 'field__error', 'aria-live': 'assertive' });
    var go = button(t('celOpen', 'Open'), { type: 'submit', icon: 'arrow-right' });
    var form = el('form', { class: 'ev-form', onsubmit: function (e) {
      e.preventDefault();
      var code = input.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      if (code.length !== 6) { err.textContent = t('celCodeShort', 'The code has 6 letters and numbers.'); return; }
      go.disabled = true;
      find(null, code).then(function (ev) {
        if (!ev) { go.disabled = false; return; }
        history.replaceState(null, '', '/c/' + ev.slug + (ev.settings && ev.settings.private ? '?code=' + code : ''));
      }, function (e) { go.disabled = false; err.textContent = e.message; });
    } });
    form.appendChild(input);
    form.appendChild(go);
    form.appendChild(err);
    return card(t('celEnterCode', 'Enter the join code'), [el('p', {}, message || t('celEnterCodeText', 'You will find it on the invitation, under the QR code.')), form]);
  }

  function find(slug, code) {
    var q = [];
    if (slug) q.push('slug=' + encodeURIComponent(slug));
    if (code) q.push('code=' + encodeURIComponent(code));
    return FF.Api.call('GET', '/c/find?' + q.join('&'), null, { noAuth: true }).then(function (ev) {
      if (ev.needsCode) {
        paintPlain([codeCard(t('celPrivateText', 'This celebration is private. Type the join code from your invitation.'))]);
        return null;
      }
      state.ev = ev;
      state.code = code;
      return start().then(function () { return ev; });
    });
  }

  function paintPlain(nodes) {
    FF.ui.clear(main);
    C().applyTheme(document.body, { look: 'gala' });
    nodes.forEach(function (n) { main.appendChild(n); });
  }

  /* ---------- the celebration ---------- */

  function start() {
    var ev = state.ev;
    C().applyTheme(document.body, ev.theme);
    setTitle(ev.title);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', getComputedStyle(document.body).getPropertyValue('--ev-bg').trim() || '#120d24');
    if (ev.status !== 'active') {
      paintPlain([card(t('celUnavailable', 'This celebration is not available'), [])]);
      return Promise.resolve();
    }
    // Only phones that joined before ask who they are; a first visit stays signed out until Join.
    if (store('joined:' + ev.id)) {
      return FF.Api.call('GET', '/c/' + ev.id + '/me', null, { guest: true }).then(function (r) {
        if (r.joined) {
          state.me = r.me;
          state.ev = r.event;
        } else {
          store('joined:' + ev.id, null);
          if (r.removed) state.removed = true;
        }
        paint();
      }, function () { paint(); });
    }
    paint();
    return Promise.resolve();
  }

  function paint() {
    var ev = state.ev;
    FF.ui.clear(main);
    main.appendChild(C().hero(ev, { tag: 'h1' }));
    if (state.removed) {
      main.appendChild(card(t('celRemovedTitle', 'You are not in this celebration'), [el('p', {}, t('celRemovedText', 'The organiser removed you from this celebration.'))]));
      return;
    }
    if (ev.welcome || ev.description) {
      var w = card(null, []);
      if (ev.welcome) w.appendChild(el('p', { class: 'ev-welcome' }, ev.welcome));
      if (ev.description) w.appendChild(el('p', { class: 'ev-welcome' }, ev.description));
      main.appendChild(w);
    }
    if (!state.me) main.appendChild(joinCard());
    else {
      main.appendChild(meCard());
      if (needsTeamPick()) main.appendChild(teamCard());
      main.appendChild(lobbyCard());
      keepFresh();
    }
  }

  function joinCard() {
    var ev = state.ev;
    var input = el('input', { type: 'text', class: 'input', maxlength: '24', autocomplete: 'given-name', placeholder: t('celYourNamePh', 'Your name'), 'aria-label': t('celYourName', 'Your name') });
    input.value = store('name') || '';
    var err = el('p', { class: 'field__error', 'aria-live': 'assertive' });
    var go = button(t('celJoin', 'Join the celebration'), { type: 'submit', icon: 'confetti' });
    var form = el('form', { class: 'ev-form', onsubmit: function (e) {
      e.preventDefault();
      var name = input.value.trim();
      if (!name) { err.textContent = t('celNeedYourName', 'Type your name so your team knows who you are.'); input.focus(); return; }
      go.disabled = true;
      err.textContent = '';
      FF.Api.call('POST', '/c/' + ev.id + '/join', { name: name, code: state.code || undefined }, { guest: true }).then(function (r) {
        store('name', name);
        store('joined:' + ev.id, '1');
        state.me = r.me;
        state.ev = r.event;
        paint();
        window.scrollTo(0, 0);
      }, function (e2) {
        go.disabled = false;
        err.textContent = e2.message;
      });
    } });
    form.appendChild(el('label', { class: 'field__label', for: 'ev-name' }, t('celWhatName', 'What is your name?')));
    input.id = 'ev-name';
    form.appendChild(input);
    form.appendChild(go);
    form.appendChild(err);
    var note = el('p', { class: 'ev-note' }, ev.settings.requireAccount
      ? t('celJoinAccountNote', 'This celebration asks guests to sign in to PlayMona first.')
      : t('celJoinNote', 'No app and no account needed. Your name is shown to the organiser and your team.'));
    return card(t('celJoinTitle', 'Join in'), [form, note]);
  }

  function team(id) {
    var found = null;
    (state.ev.teams || []).forEach(function (tm) { if (tm.id === id) found = tm; });
    return found;
  }

  function needsTeamPick() {
    var ev = state.ev;
    return ev.teams && ev.teams.length && ev.settings.guestTeams && !ev.settings.teamsLocked;
  }

  function meCard() {
    var mine = team(state.me.teamId);
    var c = card(null, []);
    var row = div('ev-me');
    var badge = div('ev-me__badge');
    if (mine) badge.style.setProperty('--team', mine.color);
    badge.textContent = (state.me.name || '?').charAt(0).toUpperCase();
    row.appendChild(badge);
    var text = div('ev-me__text');
    text.appendChild(el('strong', {}, t('celHi', 'Hi {name}!', { name: state.me.name })));
    var line;
    if (mine) line = t('celYourTeam', 'You are in {team}', { team: mine.name });
    else if (!state.ev.teams.length) line = t('celTeamsSoon', 'Teams are not set up yet. Keep this page open.');
    else if (!state.ev.settings.guestTeams || state.ev.settings.teamsLocked) line = t('celTeamByOrganiser', 'The organiser will put you in a team.');
    else line = t('celPickTeamBelow', 'Pick your team below.');
    text.appendChild(el('span', {}, line));
    row.appendChild(text);
    c.appendChild(row);
    return c;
  }

  function teamCard() {
    var list = el('ul', { class: 'ev-teams' });
    state.ev.teams.forEach(function (tm) {
      var full = tm.capacity > 0 && tm.members >= tm.capacity && tm.id !== state.me.teamId;
      var li = el('li', {});
      var b = el('button', { type: 'button', class: 'ev-team' + (tm.id === state.me.teamId ? ' is-mine' : ''), 'aria-pressed': tm.id === state.me.teamId ? 'true' : 'false' });
      b.style.setProperty('--team', tm.color);
      b.disabled = full;
      b.appendChild(el('strong', {}, tm.name));
      b.appendChild(el('span', {}, full ? t('celTeamFull', 'Full')
        : tm.capacity ? t('celTeamOf', '{n} of {max}', { n: tm.members, max: tm.capacity })
          : t(tm.members === 1 ? 'celGuestOne' : 'celGuestMany', tm.members === 1 ? '1 guest' : '{n} guests', { n: tm.members })));
      b.addEventListener('click', function () {
        if (tm.id === state.me.teamId) return;
        b.disabled = true;
        FF.Api.call('POST', '/c/' + state.ev.id + '/team', { teamId: tm.id }, { guest: true }).then(function (r) {
          state.me = r.me;
          state.ev = r.event;
          paint();
          if (FF.UI && FF.UI.toast) FF.UI.toast(t('celJoinedTeam', 'Welcome to {team}!', { team: tm.name }));
        }, function (e) {
          b.disabled = false;
          if (FF.UI && FF.UI.toast) FF.UI.toast(e.message);
          refresh();
        });
      });
      li.appendChild(b);
      list.appendChild(li);
    });
    return card(state.me.teamId ? t('celChangeTeam', 'Change team') : t('celPickTeam', 'Pick your team'), [list]);
  }

  function lobbyCard() {
    var n = state.ev.guestCount || 0;
    return card(t('celAllSet', 'You are all set'), [
      el('p', {}, t('celLobbyText', 'Keep this page open. When the MC starts a game, it opens here for your team.')),
      el('p', { class: 'ev-note' }, t(n === 1 ? 'celHereOne' : 'celHereMany', n === 1 ? '1 guest has joined' : '{n} guests have joined', { n: n }))
    ]);
  }

  /* The organiser may move people between teams: check every 20 s while the page is visible. */
  function refresh() {
    if (!state.ev || !state.me) return Promise.resolve();
    return FF.Api.call('GET', '/c/' + state.ev.id + '/me', null, { guest: true }).then(function (r) {
      if (!r.joined) {
        store('joined:' + state.ev.id, null);
        state.me = null;
        state.removed = !!r.removed;
        paint();
        return;
      }
      var changed = JSON.stringify([r.me, r.event.teams, r.event.settings, r.event.guestCount]) !== JSON.stringify([state.me, state.ev.teams, state.ev.settings, state.ev.guestCount]);
      state.me = r.me;
      state.ev = r.event;
      if (changed && !document.activeElement.closest('form')) paint();
    }, function () {});
  }
  function keepFresh() {
    if (state.timer) return;
    state.timer = setInterval(function () { if (!document.hidden) refresh(); }, 20000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
  }

  FF.EventPage = {
    start: function () {
      main = document.getElementById('main');
      var r = route();
      if (!r.slug && !r.code) { paintPlain([codeCard()]); return; }
      main.appendChild(div('ev-loading', t('loading', 'Loading…')));
      find(r.slug, r.code).catch(function (e) {
        paintPlain([card(e.status === 404 ? t('celNotFound', 'We could not find that celebration') : t('celLoadFailed', 'That did not load'), [el('p', {}, e.message)]), codeCard()]);
      });
    },
    _route: route
  };
})();
