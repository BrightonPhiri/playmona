/* ============================================================
   PLAYMORA — registry.js
   Game registry, universal settings, game shell (intro / how to
   play / settings / pause / results), and Game Night tournament.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  /* ================= Universal settings ================= */
  FF.Settings = {
    defaults: {
      difficulty: 'normal',
      length: 'normal',
      timer: 20,
      sound: true,
      music: true,
      musicMode: 'off',
      volume: 0.7,
      animations: true,
      reduceMotion: false,
      randomOrder: true,
      randomQuestions: true,
      displaySeconds: 60,
      autoAdvanceMs: 2000
    },
    get: function (key) { return FF.Storage.get(key, this.defaults[key]); },
    set: function (key, val) { FF.Storage.set(key, val); },
    getAll: function () {
      const out = {};
      for (const k in this.defaults) out[k] = this.get(k);
      return out;
    },
    reset: function () {
      for (const k in this.defaults) FF.Storage.remove(k);
    }
  };

  /* ================= Game registry ================= */
  FF.Games = {
    _registry: {},
    _order: [],

    register: function (def) {
      if (!def || !def.id) return;
      if (!def.howToPlay) def.howToPlay = [];
      if (!def.modes) def.modes = ['turn'];
      if (!def.tags) def.tags = [];
      if (!def.defaultMode) def.defaultMode = def.modes[0];
      this._registry[def.id] = def;
      if (this._order.indexOf(def.id) === -1) this._order.push(def.id);
    },

    get: function (id) { return FF.Games._registry[id] || null; },
    all: function () { return this._order.map(function (id) { return FF.Games._registry[id]; }); },

    byCategory: function (cat) {
      return this.all().filter(function (g) { return g.category === cat; });
    },

    minPlayers: function (def) {
      return (def && def.players && def.players[0] != null) ? def.players[0] : 1;
    },
    maxPlayers: function (def) {
      return (def && def.players && def.players[1] != null) ? def.players[1] : 8;
    },
    allowsSolo: function (def) {
      if (!def) return true;
      if (this.minPlayers(def) <= 1) return true;
      return !!(def.modes && def.modes.indexOf('solo') !== -1);
    },

    categories: function () {
      const seen = [];
      this.all().forEach(function (g) {
        if (seen.indexOf(g.category) === -1) seen.push(g.category);
      });
      return seen;
    }
  };

  // Convenience alias used by game modules.
  FF.registerGame = function (def) { FF.Games.register(def); };

  /* ================= Settings UI helpers ================= */
  FF.SettingsUI = {
    // Duration picker: preset buttons + custom minutes/seconds inputs.
    // onChange(seconds) is invoked on every change.
    // Duration picker: preset buttons + custom minutes/seconds inputs.
    // onChange(seconds) is invoked on every change. Pass { allowOff: true }
    // to include an Off (0) preset for per-game timers.
    duration: function (currentSeconds, onChange, opts) {
      opts = opts || {};
      const allowOff = !!opts.allowOff;
      if (currentSeconds == null || isNaN(currentSeconds)) currentSeconds = allowOff ? 0 : 60;
      const wrap = FF.ui.div('duration-picker');
      const presets = allowOff
        ? [
            { label: 'Off', value: 0 },
            { label: '10s', value: 10 },
            { label: '15s', value: 15 },
            { label: '30s', value: 30 },
            { label: '1m', value: 60 },
            { label: '2m', value: 120 },
            { label: '3m', value: 180 },
            { label: '5m', value: 300 }
          ]
        : [
            { label: '30s', value: 30 },
            { label: '1m', value: 60 },
            { label: '2m', value: 120 },
            { label: '3m', value: 180 },
            { label: '5m', value: 300 },
            { label: '10m', value: 600 }
          ];
      const segWrap = FF.ui.div('seg');
      let minInput, secInput, custom;

      function apply(total) {
        total = Math.round(total || 0);
        if (allowOff && total <= 0) total = 0;
        else total = Math.max(1, Math.min(3600, total));
        currentSeconds = total;
        if (onChange) onChange(total);
        FF.ui.$$('.seg__btn', segWrap).forEach(function (b) {
          b.classList.toggle('active', parseInt(b.dataset.secs, 10) === total);
        });
        if (custom) custom.classList.toggle('is-off', allowOff && total === 0);
        if (minInput) minInput.value = Math.floor(total / 60);
        if (secInput) secInput.value = total % 60;
      }

      presets.forEach(function (p) {
        segWrap.appendChild(FF.ui.button(p.label, {
          class: 'seg__btn',
          dataset: { secs: p.value },
          onClick: function () { apply(p.value); }
        }));
      });
      wrap.appendChild(segWrap);

      custom = FF.ui.div('duration-picker__custom');
      custom.appendChild(FF.ui.span('duration-picker__label', 'Custom:'));
      minInput = FF.ui.el('input', {
        type: 'number', class: 'num-input', min: 0, max: 60,
        value: Math.floor(currentSeconds / 60), 'aria-label': 'Minutes',
        oninput: function () {
          const m = parseInt(minInput.value, 10) || 0;
          const s = parseInt(secInput.value, 10) || 0;
          apply(m * 60 + s);
        }
      });
      secInput = FF.ui.el('input', {
        type: 'number', class: 'num-input', min: 0, max: 59,
        value: currentSeconds % 60, 'aria-label': 'Seconds',
        oninput: function () {
          const m = parseInt(minInput.value, 10) || 0;
          const s = parseInt(secInput.value, 10) || 0;
          apply(m * 60 + s);
        }
      });
      custom.appendChild(minInput);
      custom.appendChild(FF.ui.span('', 'min'));
      custom.appendChild(secInput);
      custom.appendChild(FF.ui.span('', 'sec'));
      wrap.appendChild(custom);

      apply(currentSeconds);
      return wrap;
    }
  };

  /* ================= Game shell ================= */
  function buildShell(def, config, api) {
    const screen = FF.ui.$('#game-screen');
    FF.ui.clear(screen);
    screen.className = 'game-screen';

    const shell = FF.ui.el('div', { class: 'game-shell' });

    const bar = FF.ui.el('header', { class: 'game-shell__bar' });
    const exitBtn = FF.UI.iconButton('close', FF.t('exitGame', 'Exit game'), function () { FF.GameFlow.confirmExit(); }, 'shell-btn exit');
    const title = FF.ui.div('game-shell__title');
    title.appendChild(FF.Icons.icon(FF.Icons.game[def.id] || (FF.Categories[def.category] || {}).iconKey, def.icon));
    const titleText = FF.ui.el('h1', { class: 'game-shell__title-text', style: { font: 'inherit' } }, def.name);
    title.appendChild(titleText);
    if (config.round) title.appendChild(FF.ui.span('game-shell__round', FF.t('roundOf', 'Round {n} of {total}', { n: config.round.index, total: config.round.total })));
    const timerEl = FF.ui.el('div', { class: 'game-shell__timer hidden', role: 'timer', 'aria-label': FF.t('timeLeft', 'Time left') }, '');
    const pauseBtn = FF.UI.iconButton('pause', FF.t('pause', 'Pause'), function () { FF.GameFlow.pause(); }, 'shell-btn');

    bar.appendChild(exitBtn);
    bar.appendChild(title);
    bar.appendChild(timerEl);

    if (FF.Voice && (FF.Voice.isActive() || (config.room && FF.Voice.isSupported()))) {
      const voiceBtn = FF.ui.el('button', { type: 'button', class: 'shell-btn voice-btn' });
      const syncVoiceBtn = function () {
        FF.ui.clear(voiceBtn);
        const active = FF.Voice.isActive();
        const muted = active && FF.Voice.isMuted();
        voiceBtn.appendChild(FF.Icons.icon(muted ? 'mic-off' : 'mic'));
        voiceBtn.classList.toggle('voice-active', active && !muted);
        voiceBtn.classList.toggle('muted', muted);
        voiceBtn.setAttribute('aria-pressed', active && !muted ? 'true' : 'false');
        const label = !active ? FF.t('joinVoice', 'Join voice chat') : (muted ? FF.t('micUnmute', 'Unmute microphone') : FF.t('micMute', 'Mute microphone'));
        voiceBtn.setAttribute('aria-label', label);
        voiceBtn.title = label;
      };
      voiceBtn.addEventListener('click', function () {
        if (!FF.Voice.isActive()) {
          FF.Voice.join().then(syncVoiceBtn).catch(function (e) {
            FF.UI.toast((e && e.message) || FF.t('micBlocked', 'Microphone access blocked.'), { type: 'error' });
          });
        } else {
          FF.Voice.toggleMute();
          syncVoiceBtn();
        }
      });
      syncVoiceBtn();
      FF.Voice.on('change', syncVoiceBtn);
      bar.appendChild(voiceBtn);
    }
    bar.appendChild(pauseBtn);

    const scoreBar = FF.ui.el('div', { class: 'game-shell__scores', role: 'list', 'aria-label': FF.t('scores', 'Scores') });
    if (config.variation === 'display') scoreBar.classList.add('hidden');
    const content = FF.ui.el('main', { class: 'game-shell__content', id: 'game-content' });

    shell.appendChild(bar);
    shell.appendChild(scoreBar);
    shell.appendChild(content);
    screen.appendChild(shell);

    let extraTick = null;
    const shellTimer = FF.Timer.create({
      onTick: function (remaining) {
        timerEl.textContent = FF.util.formatTime(remaining);
        if (remaining <= 5 && remaining > 0) timerEl.classList.add('warning');
        else timerEl.classList.remove('warning');
        if (remaining === 10 || remaining === 5) FF.UI.announce(FF.t('secondsLeft', '{n} seconds left', { n: remaining }));
        if (extraTick) extraTick(remaining);
      },
      onFinish: function () {
        timerEl.textContent = FF.t('timeUpShort', 'Time!');
        timerEl.classList.remove('warning');
        FF.UI.announce(FF.t('timeUpLong', 'Time is up'));
        FF.Audio.play('roundEnd');
        if (shellTimer.onFinish) shellTimer.onFinish();
      }
    });

    // Kept for older games that reach for api.shell.host; no longer shown.
    const host = FF.ui.el('div', { class: 'host-panel hidden' });

    let lastActive = null;
    const shellObj = {
      def: def,
      config: config,
      root: content,
      el: shell,
      timerEl: timerEl,
      scoreBar: scoreBar,
      timer: shellTimer,
      host: host,

      setTitle: function (text) { titleText.textContent = text; },

      setOnTick: function (fn) { extraTick = fn; },
      displayMode: config.variation === 'display',

      setTimer: function (seconds, onFinish) {
        if (!seconds || seconds <= 0) { this.hideTimer(); return; }
        timerEl.classList.remove('hidden');
        shellTimer.onFinish = onFinish || null;
        shellTimer.start(seconds);
      },
      hideTimer: function () { timerEl.classList.add('hidden'); shellTimer.stop(); },
      pauseTimer: function () { shellTimer.pause(); },
      resumeTimer: function () { shellTimer.resume(); },
      getTimer: function () { return shellTimer; },

      updateScores: function (activeId) {
        FF.ui.clear(scoreBar);
        if (this.displayMode) return;
        const scorers = FF.Scoring._entities;
        const lb = FF.Scoring.leaderboard();
        const many = scorers.length > 1;
        scorers.forEach(function (e) {
          const r = FF.Scoring.record(e.id);
          const pts = r ? r.points : 0;
          const isActive = many && activeId === e.id;
          const isSpk = FF.Voice && FF.Voice.isSpeaking(e.id);
          const chip = FF.ui.el('div', {
            class: 'score-chip' + (isActive ? ' active' : '') + (lb[0] && lb[0].id === e.id && pts > 0 ? ' leader' : '') + (isSpk ? ' speaking' : ''),
            role: 'listitem',
            style: { '--chip-color': e.color || '#8b5cf6' },
            'aria-label': e.name + ', ' + FF.t('pointsN', '{n} points', { n: FF.util.formatNumber(pts) }) + (isActive ? ', ' + FF.t('theirTurn', 'their turn') : '')
          });
          chip.appendChild(FF.Players.avatarEl(e, 'score-chip__avatar'));
          chip.appendChild(FF.ui.el('span', { class: 'score-chip__name' }, e.name));
          chip.appendChild(FF.ui.el('span', { class: 'score-chip__points' }, FF.util.formatNumber(pts)));
          if (isActive) chip.appendChild(FF.ui.el('span', { class: 'score-chip__turn', 'aria-hidden': 'true' }, FF.t('turn', 'Turn')));
          scoreBar.appendChild(chip);
          if (isActive && chip.scrollIntoView) {
            try { chip.scrollIntoView({ inline: 'nearest', block: 'nearest' }); } catch (err) {}
          }
        });
        if (many && activeId && activeId !== lastActive) {
          const who = scorers.filter(function (s) { return s.id === activeId; })[0];
          if (who) FF.UI.announce(FF.t('turnOf', '{name}’s turn', { name: who.name }));
        }
        if (activeId) lastActive = activeId;
      },

      highlight: function (activeId) { this.updateScores(activeId); },

      toast: function (msg, cls) {
        let type = 'info';
        if (cls === 'error' || cls === 'bad' || cls === 'wrong') type = 'error';
        else if (cls === 'good' || cls === 'success' || cls === 'correct') type = 'success';
        FF.UI.toast(msg, { type: type, duration: 1600 });
      }
    };
    return shellObj;
  }

  // Big round icon at the top of result screens. tone: gold | blue | purple | orange
  function resultBadge(iconKey, tone, cls) {
    const b = FF.ui.el('div', { class: (cls || 'results__crown') + ' result-badge result-badge--' + (tone || 'gold'), 'aria-hidden': 'true' });
    b.appendChild(FF.Icons.icon(iconKey));
    return b;
  }
  // Gold, silver, bronze medal for the top three places.
  function rankMedal(i) {
    if (i > 2) return String(i + 1);
    const m = FF.ui.span('rank-medal rank-medal--' + (i + 1));
    m.appendChild(FF.Icons.icon('medal'));
    return m;
  }

  /* ================= Game flow ================= */
  FF.GameFlow = {
    current: null,

    buildConfig: function (def, overrides) {
      overrides = overrides || {};
      const players = FF.Players.get();
      const teamsEnabled = FF.Teams.enabled();
      const teams = FF.Teams.get();

      let mode = overrides.mode || def.defaultMode || 'turn';
      if (!overrides.mode) {
        if (teamsEnabled && !overrides.forceSolo && def.modes.indexOf('team') !== -1 && players.length >= 2) mode = 'team';
        else if (players.length <= 1 && def.modes.indexOf('solo') !== -1) mode = 'solo';
      } else if (players.length <= 1 && def.modes.indexOf('solo') !== -1) {
        mode = 'solo';
      }

      const scorers = (mode === 'team') ? FF.Teams.entities() : FF.Players.entities();

      // In a room the scoreboard is the connected devices, not the
      // players configured locally on this one.
      const inRoom = !!(overrides.room && FF.Room && FF.Room.current());
      const roomScorers = inRoom ? FF.Room.scorers() : null;

      const config = {
        def: def,
        players: players,
        teams: teamsEnabled ? teams.teams : null,
        scorers: (roomScorers && roomScorers.length) ? roomScorers : scorers,
        mode: mode,
        difficulty: overrides.difficulty || FF.Settings.get('difficulty'),
        length: overrides.length || FF.Settings.get('length'),
        timer: overrides.timer != null ? overrides.timer : FF.Settings.get('timer'),
        sound: FF.Settings.get('sound'),
        music: FF.Settings.get('music'),
        animations: FF.Settings.get('animations') && !FF.Settings.get('reduceMotion'),
        randomOrder: FF.Settings.get('randomOrder'),
        randomQuestions: FF.Settings.get('randomQuestions'),
        variation: overrides.variation || 'standard',   // 'standard' | 'display'
        displaySeconds: overrides.displaySeconds != null ? overrides.displaySeconds : (FF.Settings.get('displaySeconds') || 60),
        round: overrides.round || null,
        tournament: !!overrides.tournament,
        onEnd: overrides.onEnd || null,
        room: inRoom,
        roomStartAt: inRoom ? (overrides.roomStartAt || null) : null
      };
      return config;
    },

    launch: function (id, overrides) {
      if (FF.Advance) FF.Advance.cancelAll();
      const def = FF.Games.get(id);
      if (!def) { FF.Nav.go('home'); return; }
      const config = this.buildConfig(def, overrides);
      this.current = { def: def, config: config };

      const screen = FF.ui.$('#game-screen');
      screen.classList.remove('hidden');
      document.body.classList.add('game-active');

      FF.Audio.unlock();
      FF.Scoring.init(config.scorers, config.mode);

      if (overrides && overrides.skipIntro) {
        this.start(def, config);
      } else {
        this.showIntro(def, config);
      }
    },

    // One screen to understand a game, check who is playing, adjust
    // options and start. Replaces the old Intro → Settings modal pair.
    // opts.open: 'howto' | 'players' | 'options'
    showDetails: function (def, config, opts) {
      opts = opts || {};
      const screen = FF.ui.$('#game-screen');
      const flow = this;
      const t = FF.t;
      const cat = FF.Categories.meta ? FF.Categories.meta(def.category) : { name: def.category, iconKey: 'game-controller', color: '#8b5cf6' };

      config.variation = config.variation || 'standard';
      if (config.displaySeconds == null) config.displaySeconds = FF.Settings.get('displaySeconds') || 60;
      if (config.timer == null) config.timer = FF.Settings.get('timer');

      const minP = FF.Games.minPlayers(def);
      const maxP = FF.Games.maxPlayers(def);
      const soloOk = FF.Games.allowsSolo(def);
      const teamOk = def.modes && def.modes.indexOf('team') !== -1;
      if (FF.Players.get().length < minP) FF.Players.ensureCount(minP);

      const played = FF.Recents.get().some(function (r) { return r.id === def.id; });
      const ui = {
        howOpen: opts.open === 'howto' || (!played && opts.open == null),
        editing: opts.open === 'players' || FF.Players.get().length < minP,
        optionsOpen: opts.open === 'options'
      };

      function syncModeFromRoster() {
        const n = FF.Players.get().length;
        if (n <= 1) {
          config.mode = def.modes.indexOf('solo') !== -1 ? 'solo' : (def.defaultMode || 'turn');
        } else if (config.mode === 'team' && teamOk) {
          config.mode = 'team';
        } else if (def.defaultMode && def.defaultMode !== 'solo') {
          config.mode = def.defaultMode === 'team' && !teamOk ? 'turn' : def.defaultMode;
          if (config.mode === 'team' && n < 2) config.mode = def.modes.indexOf('turn') !== -1 ? 'turn' : 'everyone';
        } else {
          config.mode = def.modes.indexOf('turn') !== -1 ? 'turn' : (def.modes.indexOf('everyone') !== -1 ? 'everyone' : def.modes[0]);
        }
      }

      function chip(iconKey, text, cls) {
        const c = FF.ui.span('meta-chip' + (cls ? ' ' + cls : ''));
        c.appendChild(FF.Icons.icon(iconKey));
        c.appendChild(document.createTextNode(text));
        return c;
      }

      function teamRow(tm) {
        const rowEl = FF.ui.el('li', { class: 'setup-player', style: { '--p-color': tm.color } });
        const avaBtn = FF.ui.el('button', {
          type: 'button', class: 'setup-player__photo',
          'aria-label': t('changePictureFor', 'Change picture for {name}', { name: tm.name }),
          onclick: function () { FF.Players.pickLook(tm.id, { kind: 'team', onDone: render }); }
        });
        avaBtn.appendChild(FF.Players.avatarEl({ name: tm.name, avatar: tm.avatar, photo: tm.photo, isTeam: !tm.avatar, color: tm.color }, 'setup-player__face'));
        rowEl.appendChild(avaBtn);
        const name = FF.ui.el('input', { type: 'text', class: 'setup-name', value: tm.name, maxlength: 24, 'aria-label': t('teamName', 'Team name'), autocomplete: 'off' });
        name.addEventListener('input', function () {
          const next = name.value.trim();
          if (next) FF.Teams.rename(tm.id, next);
        });
        rowEl.appendChild(name);
        return rowEl;
      }

      let summaryText = null;
      function rosterSummary() {
        const players = FF.Players.get();
        if (config.variation === 'display') return t('tvSummary', 'Everyone watches the TV together. Keep score out loud.');
        if (players.length <= 1) return t('soloSummary', '{name} is playing solo.', { name: players[0] ? players[0].name : t('playerLabel', 'Player') });
        if (config.mode === 'team') return t('teamSummary', '{n} players in {t} teams.', { n: players.length, t: FF.Teams.get().teams.length });
        return t('turnSummary', '{n} players, taking turns.', { n: players.length });
      }
      function renderSummary() { if (summaryText) summaryText.textContent = rosterSummary(); }

      function disclosure(iconKey, title, hint, open, onToggle, bodyNode) {
        const d = FF.ui.el('details', { class: 'disclosure details__section' });
        if (open) d.open = true;
        const s = FF.ui.el('summary', {});
        s.appendChild(FF.Icons.icon(iconKey));
        s.appendChild(FF.ui.span('', title));
        if (hint) s.appendChild(FF.ui.span('disclosure__hint', hint));
        const chev = FF.Icons.icon('chevron-down');
        chev.classList.add('disclosure__chev');
        s.appendChild(chev);
        d.appendChild(s);
        const b = FF.ui.div('disclosure__body');
        b.appendChild(bodyNode);
        d.appendChild(b);
        d.addEventListener('toggle', function () { onToggle(d.open); });
        return d;
      }

      function startGame() {
        FF.Audio.setEffects(config.sound);
        FF.Settings.set('timer', config.timer);
        const fresh = flow.buildConfig(def, {
          mode: config.mode,
          difficulty: config.difficulty,
          length: config.length,
          timer: config.timer,
          variation: config.variation,
          displaySeconds: config.displaySeconds,
          tournament: config.tournament,
          round: config.round,
          onEnd: config.onEnd,
          room: config.room
        });
        flow.current.config = fresh;
        FF.Audio.play('roundStart');
        flow.start(def, fresh);
      }

      function render() {
        const keepScroll = screen.scrollTop;
        FF.ui.clear(screen);
        screen.className = 'game-screen';
        const players = FF.Players.get();
        const teams = FF.Teams.get();

        const page = FF.ui.div('details');

        // ---- Hero ----
        const hero = FF.ui.el('header', {
          class: 'details__hero on-art',
          dataset: { cat: def.category },
          style: { '--art': FF.Assets.artUrl('covers', def.id), '--wash': FF.Assets.wash(def.category), '--card-color': cat.color }
        });
        hero.appendChild(FF.UI.iconButton('arrow-left', t('back', 'Back'), function () { flow.exitToHome(); }, 'icon-btn--glass details__close'));
        const heroInner = FF.ui.div('');
        const ic = FF.ui.div('details__icon');
        ic.appendChild(FF.Icons.icon(FF.Icons.game[def.id] || cat.iconKey, def.icon));
        heroInner.appendChild(ic);
        heroInner.appendChild(FF.ui.el('h1', { class: 'details__title', id: 'details-title' }, def.name));
        heroInner.appendChild(FF.ui.el('p', { class: 'details__desc' }, def.description));
        const meta = FF.ui.div('details__meta');
        meta.style.marginTop = 'var(--sp-3)';
        meta.appendChild(chip(cat.iconKey, cat.name));
        meta.appendChild(chip('users', minP === maxP ? String(minP) : t('playersRange', '{a}–{b} players', { a: minP, b: maxP })));
        meta.appendChild(chip('clock', t('aboutMin', 'About {n} min', { n: def.duration || 5 })));
        meta.appendChild(chip('target', t('diff_' + String(def.difficulty || 'Normal').toLowerCase(), def.difficulty || 'Normal')));
        if (config.round) meta.appendChild(chip('trophy', t('roundOf', 'Round {n} of {total}', { n: config.round.index, total: config.round.total })));
        if (FF.RoomUI && FF.RoomUI.ONLINE_GAMES && FF.RoomUI.ONLINE_GAMES.indexOf(def.id) !== -1 && FF.Net && FF.Net.configured && FF.Net.configured()) {
          const ob = FF.ui.span('badge badge--online');
          ob.appendChild(FF.Icons.icon('wifi'));
          ob.appendChild(document.createTextNode(t('online', 'Online')));
          meta.appendChild(ob);
        }
        heroInner.appendChild(meta);
        hero.appendChild(heroInner);
        page.appendChild(hero);

        const body = FF.ui.div('details__body');

        // ---- How to play ----
        const steps = def.howToPlay && def.howToPlay.length ? def.howToPlay : [t('howDefault1', 'Read the question on screen.'), t('howDefault2', 'Answer before the time runs out.'), t('howDefault3', 'Most points wins.')];
        const ol = FF.ui.el('ol', { class: 'howto-list' });
        steps.forEach(function (s) { ol.appendChild(FF.ui.el('li', {}, String(s).replace(/^\s*\d+[.)]\s*/, ''))); });
        body.appendChild(disclosure('lightbulb', t('howToPlay', 'How to play'), t('stepsN', '{n} steps', { n: steps.length }), ui.howOpen, function (o) { ui.howOpen = o; }, ol));

        // ---- Who is playing ----
        const who = FF.ui.el('section', { class: 'details__section', 'aria-labelledby': 'who-title' });
        const whoHead = FF.ui.div('details__section-head');
        const whoTitle = FF.ui.el('h2', { class: 'details__section-title', id: 'who-title' }, t('whoPlaying', 'Who is playing'));
        whoHead.appendChild(whoTitle);
        if (config.variation !== 'display') {
          const editBtn = FF.UI.button(ui.editing ? t('done', 'Done') : t('edit', 'Edit'), {
            class: 'btn-sm' + (ui.editing ? ' btn-primary' : ''), icon: ui.editing ? 'check' : 'pencil',
            onClick: function () { ui.editing = !ui.editing; render(); }
          });
          editBtn.setAttribute('aria-expanded', ui.editing ? 'true' : 'false');
          whoHead.appendChild(editBtn);
        }
        who.appendChild(whoHead);
        const sum = FF.ui.div('details__roster-summary');
        if (config.variation !== 'display') sum.appendChild(FF.App.avatarStack(config.mode === 'team' ? FF.Teams.entities() : players, 8));
        summaryText = FF.ui.span('details__note');
        sum.appendChild(summaryText);
        who.appendChild(sum);
        renderSummary();

        if (ui.editing && config.variation !== 'display') {
          const editor = FF.ui.div('details__editor');
          if (!soloOk || players.length < minP) {
            editor.appendChild(FF.ui.el('p', { class: 'details__note' }, t('needsN', 'This game needs at least {n} players.', { n: minP })));
          }
          // Saved players: tap to bring someone in or let them sit out.
          editor.appendChild(FF.App.crewCard({ embedded: true, onChange: function () { syncModeFromRoster(); render(); } }));
          if (teamOk && players.length >= 2) {
            editor.appendChild(FF.UI.settingRow(t('playAs', 'Play as'), FF.UI.segmented({
              label: t('playAs', 'Play as'), value: config.mode === 'team' ? 'team' : 'players',
              options: [{ label: t('individuals', 'Individuals'), value: 'players', icon: 'user' }, { label: t('teams', 'Teams'), value: 'team', icon: 'users' }],
              onChange: function (v) {
                config.mode = v === 'team' ? 'team' : (def.modes.indexOf('turn') !== -1 ? 'turn' : (def.defaultMode === 'team' ? 'turn' : def.defaultMode));
                if (v === 'team' && !FF.Teams.enabled()) FF.Teams.setEnabled(true);
                render();
              }
            })));
            if (config.mode === 'team') {
              const teamRoster = FF.ui.el('ul', { class: 'setup-roster' });
              teams.teams.forEach(function (tm) { teamRoster.appendChild(teamRow(tm)); });
              editor.appendChild(teamRoster);
            }
          }
          who.appendChild(editor);
        }
        body.appendChild(who);

        // ---- Options ----
        const optBox = FF.ui.div('');
        if (def.display) {
          optBox.appendChild(FF.UI.settingRow(t('playStyle', 'Play style'), FF.UI.segmented({
            label: t('playStyle', 'Play style'), value: config.variation,
            options: [{ label: t('styleStandard', 'Take turns'), value: 'standard', icon: 'game-controller' }, { label: t('styleTV', 'TV display'), value: 'display', icon: 'tv' }],
            onChange: function (v) { config.variation = v; render(); }
          }), t('styleTVDesc', 'TV display shows big cards for the whole room. No turns, no typing.')));
        }
        if (config.variation === 'display') {
          optBox.appendChild(FF.UI.settingRow(t('timeLimit', 'Time limit'), FF.SettingsUI.duration(config.displaySeconds, function (s) {
            config.displaySeconds = s;
            FF.Settings.set('displaySeconds', s);
          })));
        } else {
          optBox.appendChild(FF.UI.settingRow(t('difficulty', 'Difficulty'), FF.UI.segmented({
            label: t('difficulty', 'Difficulty'), value: config.difficulty,
            options: [{ label: t('easy', 'Easy'), value: 'easy' }, { label: t('normal', 'Normal'), value: 'normal' }, { label: t('hard', 'Hard'), value: 'hard' }],
            onChange: function (v) { config.difficulty = v; }
          })));
          optBox.appendChild(FF.UI.settingRow(t('gameLength', 'Game length'), FF.UI.segmented({
            label: t('gameLength', 'Game length'), value: config.length,
            options: [{ label: t('lenQuick', 'Quick'), value: 'quick' }, { label: t('lenShort', 'Short'), value: 'short' }, { label: t('lenNormal', 'Normal'), value: 'normal' }, { label: t('lenLong', 'Long'), value: 'long' }],
            onChange: function (v) { config.length = v; }
          })));
          optBox.appendChild(FF.UI.settingRow(t('timeLimit', 'Time limit'), FF.SettingsUI.duration(config.timer, function (s) {
            config.timer = s;
            FF.Settings.set('timer', s);
          }, { allowOff: true }), t('timeLimitDesc', 'Off means no countdown.')));
        }
        optBox.appendChild(FF.UI.switchRow({ label: t('soundEffects', 'Sound effects'), checked: !!config.sound, onChange: function (on) { config.sound = on; } }));
        const optHint = config.variation === 'display'
          ? t('styleTV', 'TV display')
          : [t('diff_' + config.difficulty, config.difficulty), config.timer ? FF.util.formatTime(config.timer) : t('noTimer', 'No timer')].join(' · ');
        body.appendChild(disclosure('sliders', t('options', 'Options'), optHint, ui.optionsOpen, function (o) { ui.optionsOpen = o; }, optBox));

        page.appendChild(body);

        // ---- Call to action ----
        const cta = FF.ui.div('details__cta');
        cta.appendChild(FF.UI.button(config.variation === 'display' ? t('playOnTV', 'Play on the TV') : t('play', 'Play'), {
          class: 'btn-lg btn-primary', icon: 'play', onClick: startGame
        }));
        page.appendChild(cta);

        screen.appendChild(page);
        screen.scrollTop = keepScroll;
        FF.Nav.focusFirst(screen);
      }

      syncModeFromRoster();
      render();
    },

    // Older entry points, now views of the details screen.
    showIntro: function (def, config) { this.showDetails(def, config); },
    showGameSettings: function (def, config) { this.showDetails(def, config, { open: 'players' }); },
    showHowTo: function (def) { this.showDetails(def, this.current.config, { open: 'howto' }); },

    start: function (def, config) {
      const screen = FF.ui.$('#game-screen');
      if (screen) {
        screen.classList.remove('game-screen--art');
        screen.style.removeProperty('--art');
        screen.style.removeProperty('--wash');
        screen.style.removeProperty('--card-color');
      }
      FF.Scoring.init(config.scorers, config.mode);
      const api = {
        def: def,
        config: config,
        scoring: FF.Scoring,
        audio: FF.Audio,
        ui: FF.ui,
        util: FF.util,
        random: FF.Random,
        timer: FF.Timer,
        assets: FF.Assets,
        flags: FF.Flags,
        end: function (results) { FF.GameFlow.end(results); },
        fail: function (msg) { FF.GameFlow.fail(msg); }
      };

      // Seed BEFORE the game builds anything. Games shuffle pools and
      // create question Bags during setup, not just per round, so every
      // device has to start from the same RNG state or they deal
      // different questions from round one.
      if (config.room && FF.Room && FF.Room.current() && FF.Random.seed) {
        const roomMeta = FF.Room.current().meta || {};
        FF.Random.seed(FF.Random.roundSeed(roomMeta.seed, def.id, 'init'));
      }

      const shell = buildShell(def, config, api);
      api.shell = shell;
      this.current.shell = shell;

      shell.updateScores();

      FF.safe(function () {
        if (config.variation === 'display' && typeof def.displayStart === 'function') {
          const ret = def.displayStart(api);
          if (ret && typeof ret.then === 'function') ret.catch(function (e) { FF.GameFlow.fail(e && e.message); });
        } else if (typeof def.start === 'function') {
          const ret = def.start(api);
          if (ret && typeof ret.then === 'function') {
            ret.catch(function (e) { FF.GameFlow.fail(e && e.message); });
          }
        } else {
          FF.GameFlow.fail('Game not implemented.');
        }
      }, function (e) { FF.GameFlow.fail(e && e.message); });
    },

    _rankRoomScores: function (rounds) {
      const room = FF.Room.current();
      const scores = (FF.Race && FF.Race.scores) ? FF.Race.scores(rounds) : {};

      if (room.meta && room.meta.mode === 'teams') {
        return FF.Room.scorers().map(function (team) {
          const points = (team.players || []).reduce(function (total, uid) {
            return total + (scores[uid] || 0);
          }, 0);
          return {
            id: team.id,
            name: team.name,
            avatar: team.avatar,
            color: team.color,
            points: points
          };
        }).sort(function (a, b) { return b.points - a.points; });
      }

      if (Object.keys(scores).length) {
        return FF.Room.racePlayers().map(function (p) {
          return {
            id: p.uid,
            uid: p.uid,
            name: p.name,
            avatar: p.avatar,
            color: p.color,
            points: scores[p.uid] || 0
          };
        }).sort(function (a, b) { return b.points - a.points; });
      }

      // A room-enabled game that did not open a Race session must not
      // erase the points it tracked through the normal scoring API.
      return (FF.Scoring.results().results || []).slice();
    },

    _roomSnapshotMatches: function (snapshot, cur) {
      return !!(snapshot && cur && snapshot.gameId === cur.def.id &&
        snapshot.startAt === cur.config.roomStartAt);
    },

    _buildRoomResultSnapshot: function (cur) {
      const flow = this;
      const room = FF.Room.current();
      const MAX_ATTEMPTS = 20;

      function readRounds(attempt) {
        return room.transport.get('rounds').then(function (rounds) {
          rounds = rounds || {};
          if (FF.RaceRules && FF.RaceRules.scoresReady(rounds)) return rounds;
          if (attempt >= MAX_ATTEMPTS) return rounds;
          return new Promise(function (resolve) {
            setTimeout(resolve, 100);
          }).then(function () { return readRounds(attempt + 1); });
        });
      }

      return readRounds(0).then(function (rounds) {
        return {
          gameId: cur.def.id,
          startAt: cur.config.roomStartAt,
          createdAt: room.transport.serverNow(),
          ranked: flow._rankRoomScores(rounds)
        };
      });
    },

    _completeRoomResults: function (cur) {
      const flow = this;
      const room = FF.Room.current();
      const expectedStartAt = cur.config.roomStartAt;
      const existing = room.meta && room.meta.results;
      if (this._roomSnapshotMatches(existing, cur)) return Promise.resolve(existing);

      if (room.isHost) {
        return this._buildRoomResultSnapshot(cur).then(function (snapshot) {
          return FF.Room.endGame(snapshot).then(function () { return snapshot; });
        });
      }

      return new Promise(function (resolve) {
        var settled = false;
        var off = null;
        var timeout = null;

        function finish(snapshot) {
          if (settled) return;
          settled = true;
          if (off) off();
          if (timeout != null) clearTimeout(timeout);
          resolve(snapshot);
        }

        off = FF.Room.on('meta', function (meta) {
          if (flow._roomSnapshotMatches(meta && meta.results, cur)) finish(meta.results);
          else if (meta && meta.status === 'playing' &&
              meta.startAt !== expectedStartAt) finish(null);
        });

        timeout = setTimeout(function () {
          flow._buildRoomResultSnapshot(cur).then(finish);
        }, 5000);
      });
    },

    end: function (results) {
      const cur = this.current;
      if (!cur) return;
      results = results || {};
      if (cur.config.variation === 'display') {
        FF.Stats.recordGamePlayed(cur.def.id, cur.def.name, cur.def.category);
        FF.Recents.add(cur.def.id, cur.def.name);
        if (typeof FF.App !== 'undefined' && FF.App.onGameEnded) FF.App.onGameEnded({ results: [] });
        this.showDisplayResults(results);
        return;
      }
      // In a room, stay on one celebration screen instead of hopping
      // home → lobby → scores.
      if (cur.config.room && FF.Room && FF.Room.current()) {
        if (cur.roomEnding) return;
        cur.roomEnding = true;
        FF.Stats.recordGamePlayed(cur.def.id, cur.def.name, cur.def.category);
        FF.Recents.add(cur.def.id, cur.def.name);
        const flow = this;
        this._completeRoomResults(cur).then(function (snapshot) {
          if (!snapshot) {
            if (flow.current === cur) flow.close('online');
            return;
          }
          if (flow.current !== cur) return;
          const ranked = snapshot.ranked || [];
          const myUid = FF.Room.current() && FF.Room.current().uid;
          FF.Stats.recordResult({ results: ranked, meId: myUid });
          if (typeof FF.App !== 'undefined' && FF.App.onGameEnded) FF.App.onGameEnded({ results: ranked });
          flow.showResults({ results: ranked, room: true, title: FF.t('gameComplete', 'Game complete!') });
        }).catch(function (err) {
          cur.roomEnding = false;
          if (window.console) console.error('[FF.Room results]', err);
          const ranked = flow._rankRoomScores();
          flow.showResults({ results: ranked, room: true, title: FF.t('gameComplete', 'Game complete!') });
        });
        return;
      }

      if (!results.results || !results.results.length) {
        const r = FF.Scoring.results();
        results.results = r.results;
        results.winner = r.winner;
        results.winnerId = r.winnerId;
      }
      const winner = results.results[0] || null;

      // persist stats
      FF.Stats.recordGamePlayed(cur.def.id, cur.def.name, cur.def.category);
      FF.Recents.add(cur.def.id, cur.def.name);
      if (winner) {
        FF.Stats.recordResult({
          winnerName: winner.name,
          bestStreak: results.bestStreak || 0,
          fastest: results.fastest,
          mostWords: results.mostWords,
          quizCorrect: results.quizCorrect,
          quizAnswered: results.quizAnswered,
          results: results.results
        });
      }
      if (results.achievements) results.achievements.forEach(function (a) { FF.Stats.unlock(a); });

      if (typeof FF.App !== 'undefined' && FF.App.onGameEnded) FF.App.onGameEnded(results);

      // tournament hook
      if (cur.config.tournament && cur.config.onEnd) {
        cur.config.onEnd(results);
        return;
      }
      this.showResults(results);
    },

    showResults: function (results) {
      const screen = FF.ui.$('#game-screen');
      FF.ui.clear(screen);
      screen.className = 'game-screen';
      const t = FF.t;
      const ranked = results.results || [];
      const winner = ranked[0];
      const top = winner ? (winner.points || 0) : 0;
      const tied = ranked.filter(function (r) { return (r.points || 0) === top && top > 0; });
      const isTie = tied.length > 1;
      const solo = ranked.length === 1;

      const wrap = FF.ui.el('main', { class: 'results', 'aria-labelledby': 'results-title' });
      wrap.appendChild(resultBadge(isTie ? 'users' : 'trophy', 'gold'));
      const title = results.title || (isTie ? t('itsATie', 'It’s a tie!') : (solo ? t('wellPlayed', 'Well played!') : t('gameComplete', 'Game complete!')));
      wrap.appendChild(FF.ui.el('h1', { class: 'results__title', id: 'results-title' }, title));

      if (winner && (top > 0 || solo)) {
        const card = FF.ui.div('results__winner-card');
        const ava = FF.ui.div('results__winner-avatar');
        if (isTie) ava.appendChild(FF.Icons.icon('trophy'));
        else ava.appendChild(FF.Players.avatarEl(winner, 'results__winner-face'));
        card.appendChild(ava);
        const names = (isTie ? tied : [winner]).map(function (x) { return x.name; }).join(' & ');
        card.appendChild(FF.ui.el('div', { class: 'results__winner-name' }, names));
        card.appendChild(FF.ui.el('div', { class: 'results__winner-sub' }, isTie ? t('sharedWin', 'Shared win') : (solo ? t('yourScore', 'Your score') : t('champion', 'Champion'))));
        card.appendChild(FF.ui.el('div', { class: 'results__winner-points' }, t('pointsN', '{n} points', { n: FF.util.formatNumber(winner.points) })));
        wrap.appendChild(card);
        FF.UI.announce(isTie ? t('tieBetween', 'Tie between {names}', { names: names }) : t('winnerIs', '{name} wins with {n} points', { name: names, n: winner.points }));
      }

      if (ranked.length > 1) {
        const lb = FF.ui.el('ol', { class: 'results__leaderboard', 'aria-label': t('leaderboard', 'Leaderboard'), style: { listStyle: 'none' } });
        ranked.forEach(function (r, i) {
          const row = FF.ui.el('li', { class: 'results__row' + (i === 0 && top > 0 ? ' results__row--winner' : '') });
          row.appendChild(FF.ui.el('span', { class: 'results__rank', 'aria-label': t('place', 'Place {n}', { n: i + 1 }) }, rankMedal(i)));
          row.appendChild(FF.Players.avatarEl(r, 'results__avatar'));
          row.appendChild(FF.ui.el('span', { class: 'results__name' }, r.name));
          row.appendChild(FF.ui.el('span', { class: 'results__pts' }, FF.util.formatNumber(r.points)));
          lb.appendChild(row);
        });
        wrap.appendChild(lb);
      }

      const stats = FF.ui.div('results__stats');
      function stat(iconKey, text) {
        const s = FF.ui.span('results__stat');
        s.appendChild(FF.Icons.icon(iconKey));
        s.appendChild(document.createTextNode(text));
        stats.appendChild(s);
      }
      if (results.bestStreak) stat('flame', t('streakN', 'Best streak {n}', { n: results.bestStreak }));
      if (results.fastest != null) stat('lightning', t('fastestN', 'Fastest {n} s', { n: results.fastest.toFixed(2) }));
      if (results.mostWords) stat('text-aa', t('wordsN', '{n} words', { n: results.mostWords }));
      if (results.quizCorrect) stat('check-circle', t('correctN', '{n} correct', { n: results.quizCorrect }));
      if (stats.childNodes.length) wrap.appendChild(stats);

      const actions = FF.ui.div('results__actions');
      if (results.room && FF.Room && FF.Room.current()) {
        if (FF.Room.current().isHost) {
          actions.appendChild(FF.UI.button(t('playAgain', 'Play again'), { class: 'btn-lg btn-primary', icon: 'restart', onClick: function () {
            FF.Audio.play('click');
            FF.Room.playAgain().catch(function (err) {
              if (FF.RoomUI && FF.RoomUI.banner) {
                FF.RoomUI.banner((err && err.message) || t('restartFailed', 'The room could not be restarted.'));
              }
            });
          } }));
        } else {
          wrap.appendChild(FF.ui.div('hint', t('waitingHostAgain', 'Waiting for the host to start another round…')));
        }
        actions.appendChild(FF.UI.button(t('backToRoom', 'Back to the room'), { class: 'btn-lg', icon: 'users', onClick: function () { FF.GameFlow.close('online'); } }));
        FF.Room.offAll();
        FF.Room.on('meta', function (meta) {
          if (meta && (meta.status === 'lobby' || meta.status === 'playing')) {
            FF.GameFlow.close('online');
          }
        });
      } else {
        actions.appendChild(FF.UI.button(t('playAgain', 'Play again'), { class: 'btn-lg btn-primary', icon: 'restart', onClick: function () { FF.Audio.play('roundStart'); FF.GameFlow.launch(FF.GameFlow.current.def.id, { skipIntro: true }); } }));
        actions.appendChild(FF.UI.button(t('anotherGame', 'Choose another game'), { class: 'btn-lg', icon: 'game-controller', onClick: function () { FF.GameFlow.close('games'); } }));
        actions.appendChild(FF.UI.button(t('navHome', 'Home'), { class: 'btn-lg btn-ghost', icon: 'house', onClick: function () { FF.GameFlow.exitToHome(); } }));
      }
      wrap.appendChild(actions);

      screen.appendChild(wrap);

      FF.Audio.play('winner');
      if (FF.Settings.get('animations') && !FF.Settings.get('reduceMotion') && FF.Confetti) {
        FF.Confetti.burst(160);
        if (FF.Confetti.sideCannons) FF.Confetti.sideCannons();
        if (FF.Confetti.rain) FF.Confetti.rain(80);
      }
      FF.Nav.focusFirst(screen);
    },

    showDisplayResults: function (results) {
      const screen = FF.ui.$('#game-screen');
      FF.ui.clear(screen);
      screen.className = 'game-screen';
      const cur = this.current;
      const t = FF.t;

      const wrap = FF.ui.el('main', { class: 'results' });
      wrap.appendChild(resultBadge('clock', 'blue', 'results__banner'));
      wrap.appendChild(FF.ui.el('h1', { class: 'results__title' }, results.title && !/^[A-Z' !]+$/.test(results.title) ? results.title : t('timesUp', 'Time’s up!')));
      wrap.appendChild(FF.ui.el('p', { class: 'results__sub' }, t('displayNoScore', 'No points were tracked on the TV. Add up everyone’s score out loud.')));
      if (results.note) wrap.appendChild(FF.ui.el('p', { class: 'results__sub' }, results.note));

      const actions = FF.ui.div('results__actions');
      actions.appendChild(FF.UI.button(t('playAgain', 'Play again'), { class: 'btn-lg btn-primary', icon: 'restart', onClick: function () {
        FF.Audio.play('roundStart');
        FF.GameFlow.launch(cur.def.id, { skipIntro: true, variation: 'display', displaySeconds: cur.config.displaySeconds });
      } }));
      actions.appendChild(FF.UI.button(t('navHome', 'Home'), { class: 'btn-lg', icon: 'house', onClick: function () { FF.GameFlow.exitToHome(); } }));
      wrap.appendChild(actions);

      screen.appendChild(wrap);
      FF.Audio.play('roundEnd');
      FF.Nav.focusFirst(screen);
    },

    // A modal card over the game, used for pause and exit confirmation.
    _overlay: function (opts) {
      const screen = FF.ui.$('#game-screen');
      const old = screen && FF.ui.$('.pause-overlay', screen);
      if (old) old.parentNode.removeChild(old);
      const overlay = FF.ui.div('pause-overlay');
      const card = FF.ui.el('div', { class: 'pause-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'pause-title', tabindex: -1 });
      if (opts.icon) {
        const ic = FF.ui.div('pause-card__icon');
        ic.appendChild(FF.Icons.icon(opts.icon));
        card.appendChild(ic);
      }
      card.appendChild(FF.ui.el('h2', { id: 'pause-title' }, opts.title));
      if (opts.sub) card.appendChild(FF.ui.el('p', { class: 'pause-sub' }, opts.sub));
      const actions = FF.ui.div('pause-actions');
      opts.actions.forEach(function (a) {
        actions.appendChild(FF.UI.button(a.label, { class: 'btn-lg' + (a.primary ? ' btn-primary' : '') + (a.danger ? ' btn-danger' : '') + (a.ghost ? ' btn-ghost' : ''), icon: a.icon, onClick: a.onClick }));
      });
      card.appendChild(actions);
      overlay.appendChild(card);
      screen.appendChild(overlay);
      if (FF.Nav.modality === 'keyboard') FF.Nav.focusFirst(overlay);
      else { try { card.focus({ preventScroll: true }); } catch (e) {} }
      return overlay;
    },

    pause: function () {
      const cur = this.current;
      if (!cur) return;
      if (FF.Advance) FF.Advance.pauseAll();
      if (cur.shell && cur.shell.timer && cur.shell.timer.isRunning()) cur.shell.timer.pause();
      const t = FF.t;
      this._overlay({
        icon: 'pause',
        title: t('paused', 'Paused'),
        sub: cur.def.name,
        actions: [
          { label: t('resume', 'Resume'), primary: true, icon: 'play', onClick: function () { FF.GameFlow.resume(); } },
          { label: t('howToPlay', 'How to play'), icon: 'lightbulb', onClick: function () { FF.GameFlow.showRules(cur.def); } },
          { label: t('restart', 'Restart'), icon: 'restart', onClick: function () { FF.GameFlow.restart(); } },
          { label: t('exitGame', 'Exit game'), ghost: true, icon: 'close', onClick: function () { FF.GameFlow.exitToHome(); } }
        ]
      });
    },

    showRules: function (def) {
      const steps = def.howToPlay && def.howToPlay.length ? def.howToPlay : [];
      const ol = FF.ui.el('ol', { class: 'howto-list' });
      steps.forEach(function (s) { ol.appendChild(FF.ui.el('li', {}, String(s).replace(/^\s*\d+[.)]\s*/, ''))); });
      FF.UI.dialog({ title: FF.t('howToPlayName', 'How to play {name}', { name: def.name }), body: ol, actions: [{ label: FF.t('gotIt', 'Got it'), primary: true }] });
    },

    resume: function () {
      const overlay = FF.ui.$('.pause-overlay', FF.ui.$('#game-screen'));
      if (overlay) overlay.parentNode.removeChild(overlay);
      if (this.current && this.current.shell && this.current.shell.timer) {
        // only resume if it was running before pause (best effort)
        if (!this.current.shell.timer.isFinished() && this.current.shell.timer.remaining > 0) this.current.shell.timer.resume();
      }
      if (FF.Advance) FF.Advance.resumeAll();
    },

    restart: function () {
      if (FF.Advance) FF.Advance.cancelAll();
      const overlay = FF.ui.$('.pause-overlay', FF.ui.$('#game-screen'));
      if (overlay) overlay.parentNode.removeChild(overlay);
      const cur = this.current;
      if (!cur) return;
      const c = cur.config;
      // Re-launch with the same settings so difficulty/length/timer and any
      // tournament/room context survive a restart.
      FF.GameFlow.launch(cur.def.id, {
        skipIntro: true,
        mode: c.mode,
        variation: c.variation,
        displaySeconds: c.displaySeconds,
        difficulty: c.difficulty,
        length: c.length,
        timer: c.timer,
        tournament: c.tournament,
        round: c.round,
        onEnd: c.onEnd,
        room: c.room
      });
    },

    // Shared "back" behaviour for the hardware/remote back key and the
    // browser back button while a game is on screen. A first press asks
    // to exit; a second press (dialog already open) means "keep playing".
    handleBack: function () {
      const screen = FF.ui.$('#game-screen');
      const overlay = screen && FF.ui.$('.pause-overlay', screen);
      if (overlay) this.resume();
      else this.confirmExit();
    },

    confirmExit: function () {
      const t = FF.t;
      const cur = this.current;
      // Local games pause while the question is open; room games keep
      // running because the round clock is shared with other devices.
      if (cur && !(cur.config && cur.config.room)) {
        if (FF.Advance) FF.Advance.pauseAll();
        if (cur.shell && cur.shell.timer && cur.shell.timer.isRunning()) cur.shell.timer.pause();
      }
      this._overlay({
        icon: 'alert',
        title: t('leaveGameQ', 'Leave this game?'),
        sub: t('progressLost', 'Scores from this game will not be saved.'),
        actions: [
          { label: t('keepPlaying', 'Keep playing'), primary: true, icon: 'play', onClick: function () { FF.GameFlow.resume(); } },
          { label: t('leaveGame', 'Leave game'), danger: true, icon: 'close', onClick: function () { FF.GameFlow.exitToHome(); } }
        ]
      });
    },

    close: function (view) {
      if (FF.Advance) FF.Advance.cancelAll();
      const screen = FF.ui.$('#game-screen');
      if (screen) {
        screen.className = 'game-screen hidden';
        screen.style.removeProperty('--art');
        screen.style.removeProperty('--wash');
        screen.style.removeProperty('--card-color');
        FF.ui.clear(screen);
      }
      document.body.classList.remove('game-active');
      this.current = null;
      if (typeof FF.App !== 'undefined' && FF.App.onGameExit) FF.App.onGameExit();
      FF.Nav.go(view || 'home');
    },

    exitToHome: function () {
      const inRoom = !!(this.current && this.current.config && this.current.config.room &&
        FF.Room && FF.Room.current());
      this.close(inRoom ? 'online' : 'home');
    },

    toggleHost: function () {
      // The host panel was folded into the pause menu.
      this.pause();
    },

    fail: function (msg) {
      const screen = FF.ui.$('#game-screen');
      FF.ui.clear(screen);
      screen.className = 'game-screen';
      if (msg && window.console) console.error('[FamilyFun game error]', msg);
      const wrap = FF.ui.el('main', { class: 'results' });
      wrap.appendChild(FF.UI.emptyState({
        icon: 'alert',
        title: FF.t('oops', 'Something went wrong'),
        text: FF.t('oopsText', 'This game hit a problem and had to stop. Your other games are fine.'),
        action: { label: FF.t('backHome', 'Back to home'), icon: 'house', onClick: function () { FF.GameFlow.exitToHome(); } }
      }));
      screen.appendChild(wrap);
      FF.Nav.focusFirst(screen);
    }

  };

  /* ================= TV Display variation helper ================= */
  // Shared engine for "Display" variations: big content on the TV for the
  // whole group, no turns, no input, manual scoring, configurable duration.
  FF.Display = {
    // Resolve the display session length (seconds), with a fallback.
    seconds: function (api, fallback) {
      const s = api.config.displaySeconds;
      return (s && !isNaN(s) && s > 0) ? s : (fallback || 60);
    },

    // Auto-cycling card deck. opts: { title, tag, items, interval, render(item), label(item) }.
    deck: function (api, opts) {
      opts = opts || {};
      const items = opts.items || [];
      const root = api.shell.root;
      if (!items.length) { api.fail('No items to display.'); return; }

      const seconds = FF.Display.seconds(api, 120);
      const interval = opts.interval || 30;
      let order = [];
      let idx = 0;
      let ended = false;
      let cardTimer = null;

      function refill() { order = api.util.shuffle(items.slice()); }
      function appendInto(parent, node) {
        if (Array.isArray(node)) node.forEach(function (n) { if (n) parent.appendChild(n); });
        else if (node) parent.appendChild(node);
      }

      FF.ui.clear(root);
      api.shell.hideTimer();
      api.shell.setTitle(api.def.name);

      const wrap = FF.ui.div('dsp-wrap');
      wrap.appendChild(FF.ui.div('dsp-tag', opts.tag || FF.t('everyonePlays', 'Everyone plays')));
      wrap.appendChild(FF.ui.div('dsp-title', opts.title || api.def.name));

      const card = FF.ui.div('dsp-card');
      const counter = FF.ui.el('div', { class: 'dsp-counter', 'aria-live': 'polite' }, '');
      const timerEl = FF.ui.div('dsp-timer', FF.util.formatTime(seconds));
      wrap.appendChild(card);
      wrap.appendChild(counter);
      wrap.appendChild(timerEl);

      const actions = FF.ui.div('dsp-actions');
      actions.appendChild(FF.UI.button(FF.t('previous', 'Previous'), { class: 'btn-lg', icon: 'chevron-left', onClick: function () { shift(-1); resetCard(); } }));
      actions.appendChild(FF.UI.button(FF.t('next', 'Next'), { class: 'btn-lg', icon: 'chevron-right', onClick: function () { shift(1); resetCard(); } }));
      actions.appendChild(FF.UI.button(FF.t('finish', 'Finish'), { class: 'btn-lg btn-primary', icon: 'check', onClick: finish }));
      wrap.appendChild(actions);

      root.appendChild(wrap);

      function renderCard() {
        FF.ui.clear(card);
        if (!order.length) refill();
        const item = order[idx % order.length];
        appendInto(card, opts.render(item));
        if (opts.label) card.appendChild(FF.ui.div('dsp-label', opts.label(item)));
        counter.textContent = FF.t('cardOf', 'Card {n} of {total}', { n: (idx % order.length) + 1, total: order.length });
      }

      function shift(delta) {
        idx = (idx + delta + order.length) % order.length;
        renderCard();
      }

      function resetCard() {
        if (cardTimer) clearInterval(cardTimer);
        if (!interval || interval <= 0) return;
        cardTimer = setInterval(function () { shift(1); }, interval * 1000);
      }

      function finish() {
        if (ended) return;
        ended = true;
        if (cardTimer) clearInterval(cardTimer);
        api.shell.hideTimer();
        api.end({ title: FF.t('timesUp', 'Time\u2019s up!') });
      }

      refill();
      renderCard();
      resetCard();
      api.shell.setOnTick(function (rem) { timerEl.textContent = FF.util.formatTime(rem); });
      api.shell.setTimer(seconds, finish);
    }
  };

  /* ================= Game Night tournament ================= */
  FF.GameNight = {
    state: null,

    eligible: function () {
      return FF.Games.all().filter(function (g) { return g.category !== 'creative' || g.id === 'drawing'; });
    },

    buildSchedule: function (settings) {
      const pool = FF.Games.all().filter(function (g) {
        if (g.id === 'drawing') return false; // drawing is long/odd for tournaments by default
        return true;
      });
      const count = FF.util.clamp(settings.rounds || 5, 1, 12);
      const schedule = [];
      const used = {};
      const bag = FF.Random.Bag(pool.map(function (g) { return g.id; }));
      for (let i = 0; i < count; i++) {
        let id = bag.next();
        let guard = 0;
        while (used[id] && guard < 20) { id = bag.next(); guard++; }
        used[id] = true;
        schedule.push(id);
      }
      return schedule;
    },

    start: function (settings) {
      const players = FF.Players.get();
      const totals = {};
      players.forEach(function (p) { totals[p.id] = 0; });
      this.state = {
        settings: settings,
        schedule: this.buildSchedule(settings),
        index: 0,
        totals: totals,
        players: players
      };
      this.playNext();
    },

    playNext: function () {
      const s = this.state;
      if (!s) return;
      if (s.index >= s.schedule.length) { this.finish(); return; }
      const gameId = s.schedule[s.index];
      const total = s.schedule.length;
      FF.GameFlow.launch(gameId, {
        tournament: true,
        forceSolo: true,
        round: { index: s.index + 1, total: total },
        difficulty: s.settings.difficulty,
        length: 'quick',
        timer: s.settings.timer != null ? s.settings.timer : 20,
        onEnd: function (results) { FF.GameNight.onGameEnd(results); }
      });
    },

    onGameEnd: function (results) {
      const s = this.state;
      const ranked = results.results || [];
      ranked.forEach(function (r) { if (r.id in s.totals) s.totals[r.id] += r.points; });
      s.index++;
      this.showRoundResults(ranked);
    },

    showRoundResults: function (roundRanked) {
      const screen = FF.ui.$('#game-screen');
      FF.ui.clear(screen);
      const s = this.state;

      screen.className = 'game-screen';
      const wrap = FF.ui.el('main', { class: 'results' });
      wrap.appendChild(resultBadge('game-controller', 'purple', 'results__banner'));
      wrap.appendChild(FF.ui.el('h1', { class: 'results__title' }, FF.t('roundComplete', 'Round {n} of {total} done', { n: s.index, total: s.schedule.length })));
      wrap.appendChild(FF.ui.el('p', { class: 'results__sub' }, FF.t('standings', 'Standings so far')));

      // overall standings
      const standings = s.players.slice().sort(function (a, b) { return (s.totals[b.id] || 0) - (s.totals[a.id] || 0); });
      const lb = FF.ui.el('ol', { class: 'results__leaderboard', style: { listStyle: 'none' } });
      standings.forEach(function (p, i) {
        const row = FF.ui.el('li', { class: 'results__row' + (i === 0 ? ' results__row--winner' : '') });
        row.appendChild(FF.ui.el('span', { class: 'results__rank' }, String(i + 1)));
        row.appendChild(FF.Players.avatarEl(p, 'results__avatar'));
        row.appendChild(FF.ui.el('span', { class: 'results__name' }, p.name));
        row.appendChild(FF.ui.el('span', { class: 'results__pts' }, FF.util.formatNumber(s.totals[p.id] || 0)));
        lb.appendChild(row);
      });
      wrap.appendChild(lb);

      const actions = FF.ui.div('results__actions');
      if (s.index < s.schedule.length) {
        actions.appendChild(FF.UI.button(FF.t('nextRound', 'Next round'), { class: 'btn-lg btn-primary', icon: 'play', onClick: function () { FF.Audio.play('roundStart'); FF.GameNight.playNext(); } }));
      } else {
        actions.appendChild(FF.UI.button(FF.t('finalResults', 'See the champion'), { class: 'btn-lg btn-primary', icon: 'trophy', onClick: function () { FF.GameNight.finish(); } }));
      }
      actions.appendChild(FF.UI.button(FF.t('endGameNight', 'End game night'), { class: 'btn-lg btn-ghost', icon: 'close', onClick: function () { FF.GameNight.confirmAbort(); } }));
      wrap.appendChild(actions);

      screen.appendChild(wrap);
      FF.Nav.focusFirst(screen);
    },

    finish: function () {
      const s = this.state;
      if (!s) return;
      const standings = s.players.slice().sort(function (a, b) { return (s.totals[b.id] || 0) - (s.totals[a.id] || 0); });

      // tie-breaker check
      if (standings.length > 1 && (s.totals[standings[0].id] || 0) === (s.totals[standings[1].id] || 0)) {
        this.tieBreak(standings[0], standings[1]);
        return;
      }

      const results = {
        title: FF.t('gameNightDone', 'Game night champion!'),
        results: standings.map(function (p) {
          return { id: p.id, name: p.name, avatar: p.avatar, photo: p.photo, color: p.color, points: s.totals[p.id] || 0 };
        }),
        winnerId: standings[0].id
      };
      FF.Stats.unlock('champion');
      this.state = null;
      FF.GameFlow.showResults(results);
    },

    tieBreak: function (a, b) {
      const screen = FF.ui.$('#game-screen');
      FF.ui.clear(screen);
      screen.className = 'game-screen';
      const wrap = FF.ui.el('main', { class: 'results' });
      wrap.appendChild(resultBadge('lightning', 'orange', 'results__banner'));
      wrap.appendChild(FF.ui.el('h1', { class: 'results__title' }, FF.t('tieBreaker', 'Tie breaker!')));
      wrap.appendChild(FF.ui.el('p', { class: 'results__sub' }, FF.t('versus', '{a} vs {b}', { a: a.name, b: b.name })));
      wrap.appendChild(FF.ui.el('p', { class: 'results__sub' }, FF.t('tieBreakRule', 'Quick Tap: the fastest reaction wins the crown.')));
      const tieActions = FF.ui.div('results__actions');
      tieActions.appendChild(FF.UI.button(FF.t('startTieBreak', 'Start the tie breaker'), { class: 'btn-lg btn-primary', icon: 'lightning', onClick: function () {
        FF.GameNight._tieWinner = null;
        FF.GameNight._tiePair = [a, b];
        FF.GameFlow.launch('quickTap', {
          skipIntro: true,
          mode: 'turn',
          tieBreak: true,
          onEnd: function (results) { FF.GameNight.tieBreakDone(results); }
        });
      } }));
      tieActions.appendChild(FF.UI.button(FF.t('endGameNight', 'End game night'), { class: 'btn-lg btn-ghost', icon: 'close', onClick: function () { FF.GameNight.confirmAbort(); } }));
      wrap.appendChild(tieActions);
      screen.appendChild(wrap);
      FF.Nav.focusFirst(screen);
    },

    tieBreakDone: function (results) {
      const winner = results.results[0];
      const s = this.state;
      const standings = s.players.slice().sort(function (a, b) { return (s.totals[b.id] || 0) - (s.totals[a.id] || 0); });
      // award tie-break winner one point to settle
      if (winner) s.totals[winner.id] = (s.totals[winner.id] || 0) + 1;
      this.state = null;
      FF.Stats.unlock('champion');
      FF.GameFlow.showResults({
        title: FF.t('gameNightDone', 'Game night champion!'),
        results: standings.map(function (p) {
          return { id: p.id, name: p.name, avatar: p.avatar, photo: p.photo, color: p.color, points: s.totals[p.id] || 0 };
        })
      });
    },

    confirmAbort: function () {
      FF.UI.confirm({
        title: FF.t('endGameNightQ', 'End game night?'),
        body: FF.t('endGameNightBody', 'The tournament scores will be lost.'),
        confirmLabel: FF.t('endGameNight', 'End game night'),
        danger: true,
        onConfirm: function () { FF.GameNight.abort(); }
      });
    },

    abort: function () {
      this.state = null;
      FF.GameFlow.exitToHome();
    }
  };
})();
