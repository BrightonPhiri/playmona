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

  var main, state = { ev: null, me: null, code: null, timer: null, live: null, liveFor: null, game: null, scores: {} };

  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem('playmona:cel:' + key);
      if (value === null) localStorage.removeItem('playmona:cel:' + key);
      else localStorage.setItem('playmona:cel:' + key, value);
    } catch (e) { return null; }
    return null;
  }

  function route() {
    var m = /^\/c(?:\/([a-z0-9-]{3,40})(?:\/(for|mc|tv))?)?\/?$/.exec(location.pathname);
    var q = /[?&]code=([A-Za-z0-9]{6})/.exec(location.search);
    return { slug: m ? m[1] || null : null, page: m ? m[2] || null : null, code: q ? q[1].toUpperCase() : null };
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
    if (state.game) return;            // a game is on screen: it stays until it ends
    FF.ui.clear(main);
    main.appendChild(C().hero(ev, { tag: 'h1', extra: countdown(ev) }));
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
      state.gamesSlot = div('ev-games-slot');
      main.appendChild(state.gamesSlot);
      drawLineup();
      loadLineup();
      var board = scoresCard();
      if (board) main.appendChild(board);
      if (FF.CelebrateWall) FF.CelebrateWall.mount(main, { ev: state.ev, me: state.me });
      keepFresh();
      goLive();
    }
    if (!state.me) stopLive();
  }

  /* ---------- games ---------- */

  /* The live connection: open while the guest is in, closed when they are not. */
  function goLive() {
    var key = state.ev.id + ':' + state.me.uid;
    if (state.liveFor === key) return;
    stopLive();
    state.liveFor = key;
    FF.CelebrateLive.start({ cid: state.ev.id, uid: state.me.uid, onRun: onRun, onScores: onScores }).then(function (h) {
      if (state.liveFor !== key) { h.stop(); return; }
      state.live = h;
      if (state.pending) { var p = state.pending; state.pending = null; onRun(p); }
    }, function () {
      state.liveFor = null;
      if (FF.UI && FF.UI.toast) FF.UI.toast(t('celLiveFailed', 'We could not connect for the games. Check your connection and reload.'));
    });
  }
  function stopLive() {
    if (state.live) state.live.stop();
    state.live = null;
    state.liveFor = null;
  }

  function onRun(p) {
    if (!state.live) { state.pending = p; return; }
    if (p && !p.template) return;     // half-written: the rest is on its way
    if (p && (!state.game || state.game.runId !== p.runId || (state.game.unknown && PLAYERS[p.template]))) openGame(p);
    else if (!p && state.game) {
      // Over: keep the final results until the guest goes back; anything else returns to the lobby.
      var v = state.game.view();
      if (!(v && v.phase === 'ended')) closeGame();
    }
  }

  function onScores(s) {
    var before = JSON.stringify(state.scores);
    state.scores = s;
    if (!state.game && before !== JSON.stringify(s)) paint();
  }

  var PLAYERS = {
    pictureRush: function () { return FF.PictureRushPlay; },
    wordByWord: function () { return FF.WordByWordPlay; }
  };

  function openGame(p) {
    if (state.game) state.game.destroy();
    state.game = null;
    FF.ui.clear(main);
    var host = div('ev-game');
    main.appendChild(host);
    var player = PLAYERS[p.template] && PLAYERS[p.template]();
    if (!player) {
      host.appendChild(card(t('celGameOld', 'Please reload this page'), [el('p', {}, t('celGameOldText', 'A game started that this page does not know yet.'))]));
      state.game = { runId: p.runId, unknown: true, view: function () { return null; }, destroy: function () { FF.ui.clear(host); } };
      return;
    }
    var g = player.mount(host, { transport: state.live.transport, uid: state.live.uid, onClose: closeGame });
    state.game = { runId: p.runId, view: g.view, destroy: g.destroy };
    window.scrollTo(0, 0);
    if (navigator.wakeLock && navigator.wakeLock.request) navigator.wakeLock.request('screen').then(function (w) { state.wake = w; }, function () {});
  }

  function closeGame() {
    if (state.game) state.game.destroy();
    state.game = null;
    if (state.wake) { try { state.wake.release(); } catch (e) { /* fine */ } state.wake = null; }
    paint();
    refresh();
  }

  function scoresCard() {
    if (!state.ev.settings.leaderboard) return null;
    var ids = Object.keys(state.scores || {}).filter(function (id) { return team(id); });
    if (!ids.length) return null;
    ids.sort(function (a, b) { return state.scores[a].place - state.scores[b].place; });
    var list = el('ol', { class: 'ev-board' });
    ids.forEach(function (id) {
      var tm = team(id);
      var li = el('li', { class: id === state.me.teamId ? 'is-mine' : '' });
      li.style.setProperty('--team', tm.color);
      li.appendChild(el('span', { class: 'ev-board__place' }, String(state.scores[id].place)));
      li.appendChild(el('strong', {}, tm.name));
      li.appendChild(el('span', { class: 'ev-board__pts' }, t('celPoints', '{n} points', { n: state.scores[id].points })));
      list.appendChild(li);
    });
    return card(t('celLeaderboard', 'Leaderboard'), [list]);
  }

  function joinCard() {
    var ev = state.ev;
    var input = el('input', { type: 'text', class: 'input', maxlength: '24', autocomplete: 'given-name', placeholder: t('celYourNameGroupPh', 'e.g. Tracey, or Table 4') });
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
    form.appendChild(el('label', { class: 'field__label', for: 'ev-name' }, t('celWhatNameGroup', "Your name, or your group's name")));
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
    return !!(ev.settings.guestTeams && !ev.settings.teamsLocked && ((ev.teams && ev.teams.length) || ev.settings.guestMakeTeams));
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
    else if (!state.ev.teams.length && needsTeamPick()) line = t('celMakeTeamBelow', 'Make your team below.');
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
    var kids = state.ev.teams.length ? [list] : [];
    if (state.ev.settings.guestMakeTeams) kids.push(makeTeam());
    return card(state.me.teamId ? t('celChangeTeam', 'Change team') : state.ev.teams.length ? t('celPickTeam', 'Pick your team') : t('celMakeTeamTitle', 'Make your team'), kids);
  }

  /* A group (often several people on one phone) makes its own team and moves into it. */
  function makeTeam() {
    var box = div('ev-maketeam');
    var open = button(t('celMakeOwnTeam', 'Make our own team'), { icon: 'users', ghost: true });
    var input = el('input', { type: 'text', class: 'input', id: 'ev-team-name', maxlength: '30', autocomplete: 'off', placeholder: t('celTeamNamePh', 'e.g. The Aunties') });
    var err = el('p', { class: 'field__error', 'aria-live': 'assertive' });
    var go = button(t('celMakeTeamGo', 'Make the team'), { type: 'submit', icon: 'check' });
    var cancel = button(t('cancel', 'Cancel'), { ghost: true });
    var form = el('form', { class: 'ev-form', hidden: 'hidden', onsubmit: function (e) {
      e.preventDefault();
      var name = input.value.trim();
      if (!name) { err.textContent = t('celNeedTeamName', 'Type a name for your team.'); input.focus(); return; }
      go.disabled = true;
      err.textContent = '';
      FF.Api.call('POST', '/c/' + state.ev.id + '/team/new', { name: name }, { guest: true }).then(function (r) {
        state.me = r.me;
        state.ev = r.event;
        paint();
        if (FF.UI && FF.UI.toast) FF.UI.toast(t('celJoinedTeam', 'Welcome to {team}!', { team: name }));
      }, function (e2) {
        go.disabled = false;
        err.textContent = e2.message;
        if (e2.code === 'teams-locked' || e2.code === 'no-guest-teams' || e2.code === 'teams-by-organiser') refresh();
      });
    } });
    form.appendChild(el('label', { class: 'field__label', for: 'ev-team-name' }, t('celTeamName', 'Team name')));
    form.appendChild(input);
    var acts = div('ev-maketeam__acts');
    acts.appendChild(go);
    acts.appendChild(cancel);
    form.appendChild(acts);
    form.appendChild(err);
    open.addEventListener('click', function () { open.hidden = true; form.hidden = false; input.focus(); });
    cancel.addEventListener('click', function () { form.hidden = true; open.hidden = false; err.textContent = ''; });
    if (!state.ev.teams.length) { open.hidden = true; form.hidden = false; cancel.hidden = true; }
    box.appendChild(open);
    box.appendChild(form);
    return box;
  }

  /* "Starts in 2 days 4 h", ticking every second until the start; nothing without a date and time. */
  function countdown(ev) {
    var at = C().startsAt(ev);
    if (!at || at <= Date.now()) return null;
    var line = el('p', { class: 'ev-countdown', role: 'timer', 'aria-live': 'off' });
    function tick() {
      var left = at - Date.now();
      if (left <= 0 || !line.isConnected) {
        clearInterval(timer);
        if (line.parentNode) line.parentNode.removeChild(line);
        return;
      }
      line.textContent = C().countdownText(left);
    }
    var timer = setInterval(tick, 1000);
    line.textContent = C().countdownText(at - Date.now());
    return line;
  }

  /* The games planned: names and rules only (the server never sends their photos before play). */
  function loadLineup() {
    if (!state.ev || !state.me) return;
    FF.Api.call('GET', '/c/' + state.ev.id + '/lineup', null, { guest: true }).then(function (r) {
      var key = JSON.stringify(r.games);
      if (key === state.lineupKey) return;
      state.lineupKey = key;
      state.lineup = r.games;
      drawLineup();
    }, function () {});
  }

  function drawLineup() {
    var slot = state.gamesSlot;
    if (!slot) return;
    FF.ui.clear(slot);
    var games = state.lineup || [];
    if (!games.length) return;
    var ul = el('ul', { class: 'ev-games' });
    games.forEach(function (g) {
      var li = el('li', { class: 'ev-game' + (g.live ? ' is-live' : '') });
      var top = div('ev-game__top');
      top.appendChild(el('strong', { class: 'ev-game__name' }, g.name));
      var chip = el('span', { class: 'ev-game__chip' });
      chip.appendChild(FF.Icons.icon(g.live ? 'play' : 'eye-slash'));
      chip.appendChild(FF.ui.span('', g.live ? t('celGameOnNow', 'On now') : t('celGameLocked', 'Locked: opens when the MC starts it')));
      top.appendChild(chip);
      li.appendChild(top);
      var wbw = g.template === 'wordByWord';
      var facts = [g.template === 'pictureRush' ? t('celTplPictureRush', 'Picture Rush') : wbw ? t('celTplWordByWord', 'Word by Word') : g.template];
      if (g.rounds && wbw) facts.push(t(g.rounds === 1 ? 'celWbwTurnOne' : 'celWbwTurnsEach', g.rounds === 1 ? '1 turn each' : '{n} turns each', { n: g.rounds }));
      else if (g.rounds) facts.push(t(g.rounds === 1 ? 'celPicturesOne' : 'celPicturesMany', g.rounds === 1 ? '1 picture' : '{n} pictures', { n: g.rounds }));
      if (g.level) facts.push(levelLabel(g.level));
      li.appendChild(el('p', { class: 'ev-game__facts' }, facts.join(' · ')));
      if (g.instructions) li.appendChild(el('p', { class: 'ev-game__how' }, g.instructions));
      ul.appendChild(li);
    });
    slot.appendChild(card(t('celGamesPlanned', 'Games planned'), [ul]));
  }

  function levelLabel(level) {
    var L = { easy: ['celLevelEasy', 'Easy'], medium: ['celLevelMedium', 'Medium'], hard: ['celLevelHard', 'Hard'], expert: ['celLevelExpert', 'Expert'] }[level];
    return L ? t(L[0], L[1]) : level;
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
        if (state.game) { state.game.destroy(); state.game = null; }
        paint();
        return;
      }
      var changed = JSON.stringify([r.me, r.event.teams, r.event.settings, r.event.guestCount]) !== JSON.stringify([state.me, state.ev.teams, state.ev.settings, state.ev.guestCount]);
      state.me = r.me;
      state.ev = r.event;
      if (changed && !document.activeElement.closest('form')) paint();
      else loadLineup();
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
      // The private pages: the celebrant's messages and memory book, the TV display, the MC panel.
      if (r.page === 'for' && FF.CelebrantPage) { FF.CelebrantPage.start(main, r.slug); return; }
      if (r.page === 'tv' && FF.CelebrateTV) { FF.CelebrateTV.start(main, r.slug); return; }
      if (r.page === 'mc' && FF.CelebrateMC) { FF.CelebrateMC.start(main, r.slug); return; }
      main.appendChild(div('ev-loading', t('loading', 'Loading…')));
      find(r.slug, r.code).catch(function (e) {
        paintPlain([card(e.status === 404 ? t('celNotFound', 'We could not find that celebration') : t('celLoadFailed', 'That did not load'), [el('p', {}, e.message)]), codeCard()]);
      });
    },
    _route: route
  };
})();
