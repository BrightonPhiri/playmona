/* ============================================================
   FAMILY FUN — registry.js
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

    const shell = FF.ui.el('div', { class: 'game-shell' });

    const bar = FF.ui.el('header', { class: 'game-shell__bar' });
    const exitBtn = FF.ui.button('', { class: 'shell-btn exit', ariaLabel: 'Exit game', onClick: function () { FF.GameFlow.confirmExit(); } });
    exitBtn.appendChild(FF.Icons.icon('house', '🏠'));
    const title = FF.ui.div('game-shell__title', def.icon + ' ' + def.name);
    const timerEl = FF.ui.div('game-shell__timer hidden', '');
    const hostBtn = FF.ui.button('', { class: 'shell-btn', ariaLabel: 'Host controls', onClick: function () { FF.GameFlow.toggleHost(); } });
    hostBtn.appendChild(FF.Icons.icon('sliders', '🎛️'));
    const restartBtn = FF.ui.button('🔄', { class: 'shell-btn', ariaLabel: 'Restart game', onClick: function () { FF.GameFlow.restart(); } });
    const pauseBtn = FF.ui.button('⏸️', { class: 'shell-btn', ariaLabel: 'Pause', onClick: function () { FF.GameFlow.pause(); } });

    bar.appendChild(exitBtn);
    bar.appendChild(title);
    bar.appendChild(timerEl);
    bar.appendChild(hostBtn);
    bar.appendChild(restartBtn);
    bar.appendChild(pauseBtn);

    if (FF.Voice && (FF.Voice.isActive() || (config.room && FF.Voice.isSupported()))) {
      const voiceBtn = FF.ui.button(FF.Voice.isActive() ? (FF.Voice.isMuted() ? '🔇' : '🎙️') : '🎙️', {
        class: 'shell-btn voice-btn' + (FF.Voice.isActive() ? (FF.Voice.isMuted() ? ' muted' : ' voice-active') : ''),
        ariaLabel: 'Voice Chat',
        onClick: function () {
          if (!FF.Voice.isActive()) {
            FF.Voice.join().then(function () {
              syncVoiceBtn();
            }).catch(function (e) {
              if (shellObj && shellObj.toast) shellObj.toast(e.message || 'Mic blocked');
            });
          } else {
            FF.Voice.toggleMute();
            syncVoiceBtn();
          }
        }
      });
      function syncVoiceBtn() {
        if (!FF.Voice.isActive()) {
          voiceBtn.textContent = '🎙️';
          voiceBtn.classList.remove('voice-active', 'muted');
        } else if (FF.Voice.isMuted()) {
          voiceBtn.textContent = '🔇';
          voiceBtn.classList.add('muted');
          voiceBtn.classList.remove('voice-active');
        } else {
          voiceBtn.textContent = '🎙️';
          voiceBtn.classList.add('voice-active');
          voiceBtn.classList.remove('muted');
        }
      }
      FF.Voice.on('change', syncVoiceBtn);
      bar.appendChild(voiceBtn);
    }

    const scoreBar = FF.ui.div('game-shell__scores');
    if (config.variation === 'display') scoreBar.classList.add('hidden');
    const content = FF.ui.div('game-shell__content');
    content.id = 'game-content';

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
        if (extraTick) extraTick(remaining);
      },
      onFinish: function () {
        timerEl.textContent = "TIME!";
        FF.Audio.play('roundEnd');
        if (shellTimer.onFinish) shellTimer.onFinish();
      }
    });

    const host = FF.ui.el('div', { class: 'host-panel hidden' });
    host.appendChild(FF.ui.div('host-panel__title', 'HOST CONTROLS'));
    function hostAction(label, fn) {
      return FF.ui.button(label, { class: 'host-btn', onClick: function () { fn(); FF.GameFlow.toggleHost(); } });
    }
    host.appendChild(hostAction('⏸ Pause', function () { FF.GameFlow.pause(); }));
    host.appendChild(hostAction('▶ Resume', function () { FF.GameFlow.resume(); }));
    host.appendChild(hostAction('🔄 Restart', function () { FF.GameFlow.restart(); }));
    host.appendChild(hostAction('🏠 End Game', function () { FF.GameFlow.confirmExit(); }));
    screen.appendChild(host);

    const shellObj = {
      def: def,
      config: config,
      root: content,
      el: shell,
      timerEl: timerEl,
      scoreBar: scoreBar,
      timer: shellTimer,
      host: host,

      setTitle: function (t) { title.textContent = t; },

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
        scorers.forEach(function (e) {
          const r = FF.Scoring.record(e.id);
          const isSpk = FF.Voice && FF.Voice.isSpeaking(e.id);
          const chip = FF.ui.el('div', {
            class: 'score-chip' + (activeId === e.id ? ' active' : '') + (lb[0] && lb[0].id === e.id && r.points > 0 ? ' leader' : '') + (isSpk ? ' speaking' : ''),
            style: { '--chip-color': e.color || '#8b5cf6' }
          });
          chip.appendChild(FF.Players.avatarEl(e, 'score-chip__avatar'));
          chip.appendChild(FF.ui.el('span', { class: 'score-chip__name' }, e.name));
          chip.appendChild(FF.ui.el('span', { class: 'score-chip__points' }, FF.util.formatNumber(r ? r.points : 0)));
          scoreBar.appendChild(chip);
        });
      },

      highlight: function (activeId) { this.updateScores(activeId); },

      toast: function (msg, cls) {
        const t = FF.ui.el('div', { class: 'toast ' + (cls || ''), text: msg });
        screen.appendChild(t);
        setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 1600);
      }
    };
    return shellObj;
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

    showIntro: function (def, config) {
      const screen = FF.ui.$('#game-screen');
      FF.ui.clear(screen);
      screen.classList.add('game-screen--art');
      screen.style.setProperty('--art', FF.Assets.artUrl('covers', def.id));
      screen.style.setProperty('--wash', FF.Assets.wash(def.category));
      const catMeta = FF.Categories[def.category];
      if (catMeta && catMeta.color) screen.style.setProperty('--card-color', catMeta.color);
      const card = FF.ui.el('div', { class: 'game-intro' });
      const introIcon = FF.ui.div('game-intro__icon');
      introIcon.appendChild(FF.Icons.icon(FF.Icons.game[def.id], def.icon));
      card.appendChild(introIcon);
      card.appendChild(FF.ui.el('h1', { class: 'game-intro__title' }, def.name));
      card.appendChild(FF.ui.el('p', { class: 'game-intro__desc' }, def.description));

      const meta = FF.ui.div('game-intro__meta');
      meta.appendChild(FF.ui.el('span', { class: 'meta-chip' }, config.scorers.length <= 1 ? '👤 Solo' : '👥 ' + FF.util.plural(config.scorers.length, 'Player')));
      meta.appendChild(FF.ui.el('span', { class: 'meta-chip' }, '⭐ ' + (def.difficulty || 'Normal')));
      meta.appendChild(FF.ui.el('span', { class: 'meta-chip' }, '⏱ ' + (def.duration || 5) + ' min'));
      meta.appendChild(FF.ui.el('span', { class: 'meta-chip' }, def.icon + ' ' + (def.category || '').toUpperCase()));
      card.appendChild(meta);

      const actions = FF.ui.div('game-intro__actions');
      const startBtn = FF.ui.button('▶ START GAME', { class: 'btn-lg', primary: true, onClick: function () { FF.GameFlow.showGameSettings(def, config); } });
      const howBtn = FF.ui.button('📖 HOW TO PLAY', { class: 'btn-lg', onClick: function () { FF.GameFlow.showHowTo(def); } });
      const setBtn = FF.ui.button('⚙ SETTINGS', { class: 'btn-lg', onClick: function () { FF.GameFlow.showGameSettings(def, config); } });
      const backBtn = FF.ui.button('← BACK', { class: 'btn-lg', onClick: function () { FF.GameFlow.exitToHome(); } });
      actions.appendChild(startBtn);
      actions.appendChild(howBtn);
      actions.appendChild(setBtn);
      if (def.display) {
        const tvBtn = FF.ui.button('🖥 TV DISPLAY', { class: 'btn-lg', onClick: function () {
          config.variation = 'display';
          FF.GameFlow.showGameSettings(def, config);
        } });
        actions.appendChild(tvBtn);
      }
      actions.appendChild(backBtn);
      card.appendChild(actions);
      screen.appendChild(card);
      FF.Nav.focusFirst(screen);
    },

    showHowTo: function (def) {
      const screen = FF.ui.$('#game-screen');
      FF.ui.clear(screen);
      const modal = FF.ui.div('modal');
      const box = FF.ui.div('modal__box');
      box.appendChild(FF.ui.el('h2', {}, def.name));
      box.appendChild(FF.ui.el('h3', {}, 'HOW TO PLAY'));
      const steps = def.howToPlay && def.howToPlay.length
        ? def.howToPlay
        : ['1. Read the on-screen instructions.', '2. Play the game.', '3. Earn points to win.'];
      const ol = FF.ui.el('ol', { class: 'howto-list' });
      steps.forEach(function (s, i) { ol.appendChild(FF.ui.el('li', {}, s)); });
      box.appendChild(ol);
      box.appendChild(FF.ui.button('GOT IT', { primary: true, class: 'btn-lg', onClick: function () { FF.GameFlow.showIntro(def, FF.GameFlow.current.config); } }));
      box.appendChild(FF.ui.button('🏠 Back to Home', { class: 'btn-lg', onClick: function () { FF.GameFlow.exitToHome(); } }));
      modal.appendChild(box);
      screen.appendChild(modal);
      FF.Nav.focusFirst(screen);
    },

    showGameSettings: function (def, config) {
      const screen = FF.ui.$('#game-screen');
      FF.ui.clear(screen);
      const modal = FF.ui.div('modal');
      const box = FF.ui.div('modal__box modal__box--wide');
      modal.appendChild(box);
      screen.appendChild(modal);

      config.variation = config.variation || 'standard';
      if (config.displaySeconds == null) config.displaySeconds = FF.Settings.get('displaySeconds') || 60;
      if (config.timer == null) config.timer = FF.Settings.get('timer');

      const minP = FF.Games.minPlayers(def);
      const maxP = FF.Games.maxPlayers(def);
      const soloOk = FF.Games.allowsSolo(def);
      const teamOk = def.modes && def.modes.indexOf('team') !== -1;
      if (FF.Players.get().length < minP) FF.Players.ensureCount(minP);

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

      function row(label, build) {
        const r = FF.ui.div('settings-row');
        r.appendChild(FF.ui.div('settings-row__label', label));
        r.appendChild(build());
        return r;
      }
      function seg(values, current, key, onPick) {
        const wrap = FF.ui.div('seg');
        values.forEach(function (v) {
          const b = FF.ui.button(v.label, {
            class: 'seg__btn' + (v.value === current ? ' active' : ''),
            onClick: function () {
              config[key] = v.value;
              FF.ui.$$('.seg__btn', wrap).forEach(function (x) { x.classList.remove('active'); });
              b.classList.add('active');
              if (onPick) onPick(v.value);
              else if (key === 'variation') render();
            }
          });
          wrap.appendChild(b);
        });
        return wrap;
      }

      function playerRow(p, canRemove) {
        const rowEl = FF.ui.el('div', { class: 'setup-player', style: { '--p-color': p.color } });
        const avaBtn = FF.ui.el('button', {
          class: 'setup-player__photo',
          type: 'button',
          ariaLabel: 'Change picture for ' + p.name,
          onclick: function () {
            FF.Players.pickLook(p.id, { onDone: render });
          }
        });
        avaBtn.appendChild(FF.Players.avatarEl(p, 'setup-player__face'));
        rowEl.appendChild(avaBtn);

        const name = FF.ui.el('input', {
          type: 'text',
          class: 'setup-name',
          value: p.name,
          maxlength: 24,
          placeholder: 'Name or team name',
          'aria-label': 'Player name'
        });
        name.addEventListener('input', function () {
          const next = name.value.trim();
          if (next) FF.Players.rename(p.id, next);
        });
        name.addEventListener('blur', function () {
          if (!name.value.trim()) {
            name.value = p.name;
          }
        });
        rowEl.appendChild(name);

        if (canRemove) {
          rowEl.appendChild(FF.ui.button('✕', {
            class: 'icon-btn danger',
            ariaLabel: 'Remove ' + p.name,
            onClick: function () {
              FF.Players.remove(p.id);
              syncModeFromRoster();
              render();
            }
          }));
        }
        return rowEl;
      }

      function teamRow(tm) {
        const rowEl = FF.ui.el('div', { class: 'setup-player', style: { '--p-color': tm.color } });
        const avaBtn = FF.ui.el('button', {
          class: 'setup-player__photo',
          type: 'button',
          ariaLabel: 'Change picture for ' + tm.name,
          onclick: function () {
            FF.Players.pickLook(tm.id, { kind: 'team', onDone: render });
          }
        });
        avaBtn.appendChild(FF.Players.avatarEl({ name: tm.name, avatar: tm.avatar || '👥', photo: tm.photo }, 'setup-player__face'));
        rowEl.appendChild(avaBtn);
        const name = FF.ui.el('input', {
          type: 'text',
          class: 'setup-name',
          value: tm.name,
          maxlength: 24,
          placeholder: 'Team name',
          'aria-label': 'Team name'
        });
        name.addEventListener('input', function () {
          const next = name.value.trim();
          if (next) FF.Teams.rename(tm.id, next);
        });
        rowEl.appendChild(name);
        return rowEl;
      }

      function render() {
        FF.ui.clear(box);
        const players = FF.Players.get();
        const teams = FF.Teams.get();
        box.appendChild(FF.ui.el('h2', {}, 'Get ready'));
        box.appendChild(FF.ui.el('p', { class: 'setup-lead' }, def.name));

        if (def.display) {
          box.appendChild(row('Play style', function () {
            return seg([
              { label: '🎮 Standard', value: 'standard' },
              { label: '🖥 TV Display', value: 'display' }
            ], config.variation, 'variation');
          }));
        }

        if (config.variation !== 'display') {
          box.appendChild(FF.ui.el('h3', { class: 'settings-group' }, 'Who is playing'));
          const countOpts = [];
          const startCount = soloOk ? Math.min(minP, 1) : minP;
          for (let n = startCount; n <= Math.min(maxP, FF.Players.MAX); n++) {
            if (n === 1 && !soloOk) continue;
            countOpts.push({ label: String(n), value: n });
          }
          box.appendChild(row('Players', function () {
            return seg(countOpts, players.length, '_count', function (n) {
              FF.Players.ensureCount(n);
              syncModeFromRoster();
              render();
            });
          }));
          if (soloOk) {
            box.appendChild(FF.ui.div('hint', players.length <= 1
              ? 'Playing on your own — you can still set a name and a timer.'
              : 'Type each player’s name. A profile photo is optional.'));
          } else {
            box.appendChild(FF.ui.div('hint', 'This game needs at least ' + minP + ' players. Type each name — a photo is optional.'));
          }

          const roster = FF.ui.div('setup-roster');
          players.forEach(function (p) {
            roster.appendChild(playerRow(p, players.length > Math.max(minP, 1)));
          });
          box.appendChild(roster);

          if (players.length < maxP && players.length < FF.Players.MAX) {
            box.appendChild(FF.ui.button('+ Add player', {
              class: 'btn',
              onClick: function () {
                FF.Players.add();
                syncModeFromRoster();
                render();
              }
            }));
          }

          if (teamOk && players.length >= 2) {
            box.appendChild(row('Team play', function () {
              return seg([
                { label: 'Players', value: 'players' },
                { label: 'Teams', value: 'team' }
              ], config.mode === 'team' ? 'team' : 'players', '_teams', function (v) {
                config.mode = v === 'team' ? 'team' : (def.modes.indexOf('turn') !== -1 ? 'turn' : (def.defaultMode === 'team' ? 'turn' : def.defaultMode));
                if (v === 'team' && !FF.Teams.enabled()) {
                  FF.Teams.setEnabled(true);
                }
                render();
              });
            }));
            if (config.mode === 'team') {
              box.appendChild(FF.ui.div('hint', 'Enter a team name. A team photo is optional.'));
              const teamRoster = FF.ui.div('setup-roster');
              teams.teams.forEach(function (tm) { teamRoster.appendChild(teamRow(tm)); });
              box.appendChild(teamRoster);
            }
          }
        }

        if (config.variation === 'display') {
          box.appendChild(row('Time limit', function () {
            return FF.SettingsUI.duration(config.displaySeconds, function (s) {
              config.displaySeconds = s;
              FF.Settings.set('displaySeconds', s);
            });
          }));
          box.appendChild(FF.ui.div('hint', '🖥 Shown on the TV for the whole group. No turns and no typing — score is counted manually.'));
        } else {
          box.appendChild(FF.ui.el('h3', { class: 'settings-group' }, 'Game options'));
          box.appendChild(row('Difficulty', function () {
            return seg([{ label: 'Easy', value: 'easy' }, { label: 'Normal', value: 'normal' }, { label: 'Hard', value: 'hard' }], config.difficulty, 'difficulty');
          }));
          box.appendChild(row('Game length', function () {
            return seg([{ label: 'Quick', value: 'quick' }, { label: 'Short', value: 'short' }, { label: 'Normal', value: 'normal' }, { label: 'Long', value: 'long' }], config.length, 'length');
          }));
          box.appendChild(row('Time limit', function () {
            return FF.SettingsUI.duration(config.timer, function (s) {
              config.timer = s;
              FF.Settings.set('timer', s);
            }, { allowOff: true });
          }));
          box.appendChild(FF.ui.div('hint', 'Off means no countdown. Custom lets you pick any minutes and seconds.'));
        }

        box.appendChild(row('Sound effects', function () {
          return seg([{ label: 'On', value: true }, { label: 'Off', value: false }], config.sound, 'sound');
        }));

        const done = FF.ui.button('▶ START GAME', { primary: true, class: 'btn-lg', onClick: function () {
          FF.Audio.setEffects(config.sound);
          FF.Settings.set('timer', config.timer);
          const fresh = FF.GameFlow.buildConfig(def, {
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
          FF.GameFlow.current.config = fresh;
          FF.Audio.play('roundStart');
          FF.GameFlow.start(def, fresh);
        } });
        box.appendChild(done);

        const settingsNav = FF.ui.div('results__actions');
        settingsNav.appendChild(FF.ui.button('← Back to Intro', { class: 'btn-lg', onClick: function () { FF.GameFlow.showIntro(def, config); } }));
        settingsNav.appendChild(FF.ui.button('🏠 Home', { class: 'btn-lg', onClick: function () { FF.GameFlow.exitToHome(); } }));
        box.appendChild(settingsNav);

        FF.Nav.focusFirst(screen);
      }

      syncModeFromRoster();
      render();
    },

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
        FF.Stats.recordGamePlayed(cur.def.id, cur.def.name);
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
        FF.Stats.recordGamePlayed(cur.def.id, cur.def.name);
        FF.Recents.add(cur.def.id, cur.def.name);
        const flow = this;
        this._completeRoomResults(cur).then(function (snapshot) {
          if (!snapshot) {
            if (flow.current === cur) flow.close('online');
            return;
          }
          if (flow.current !== cur) return;
          const ranked = snapshot.ranked || [];
          if (typeof FF.App !== 'undefined' && FF.App.onGameEnded) FF.App.onGameEnded({ results: ranked });
          flow.showResults({ results: ranked, room: true, title: 'GAME COMPLETE!' });
        }).catch(function (err) {
          cur.roomEnding = false;
          if (window.console) console.error('[FF.Room results]', err);
          const ranked = flow._rankRoomScores();
          flow.showResults({ results: ranked, room: true, title: 'GAME COMPLETE!' });
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
      FF.Stats.recordGamePlayed(cur.def.id, cur.def.name);
      FF.Recents.add(cur.def.id, cur.def.name);
      if (winner) {
        FF.Stats.recordResult({
          winnerName: winner.name,
          bestStreak: results.bestStreak || 0,
          fastest: results.fastest,
          mostWords: results.mostWords,
          quizCorrect: results.quizCorrect,
          quizAnswered: results.quizAnswered
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
      const ranked = results.results || [];
      const winner = ranked[0];
      const top = winner ? (winner.points || 0) : 0;
      const tied = ranked.filter(function (r) { return (r.points || 0) === top && top > 0; });
      const isTie = tied.length > 1;

      const wrap = FF.ui.div('results');
      wrap.appendChild(FF.ui.div('results__crown', isTie ? '🤝' : '🏆'));
      wrap.appendChild(FF.ui.el('h1', { class: 'results__title' }, results.title || (isTie ? "IT'S A TIE!" : 'GAME COMPLETE!')));

      if (winner && top > 0) {
        const card = FF.ui.div('results__winner-card');
        const ava = FF.ui.div('results__winner-avatar');
        if (isTie) ava.textContent = '🏆';
        else if (FF.Players && FF.Players.avatarEl) ava.appendChild(FF.Players.avatarEl(winner, 'results__winner-face'));
        else ava.textContent = winner.avatar || '🏅';
        card.appendChild(ava);
        const names = (isTie ? tied : [winner]).map(function (t) { return t.name; }).join(' & ');
        card.appendChild(FF.ui.el('div', { class: 'results__winner-name' }, names.toUpperCase()));
        card.appendChild(FF.ui.el('div', { class: 'results__winner-sub' }, isTie ? 'SHARED CROWN' : 'FAMILY FUN CHAMPION'));
        card.appendChild(FF.ui.el('div', { class: 'results__winner-points' }, FF.util.formatNumber(winner.points) + ' POINTS'));
        wrap.appendChild(card);
      }

      const lb = FF.ui.div('results__leaderboard');
      ranked.forEach(function (r, i) {
        const medal = ['🥇', '🥈', '🥉'][i] || (i + 1);
        const row = FF.ui.div('results__row' + (i === 0 && top > 0 ? ' results__row--winner' : ''));
        row.appendChild(FF.ui.el('span', { class: 'results__rank' }, medal));
        row.appendChild(FF.Players.avatarEl(r, 'results__avatar'));
        row.appendChild(FF.ui.el('span', { class: 'results__name' }, r.name));
        row.appendChild(FF.ui.el('span', { class: 'results__pts' }, FF.util.formatNumber(r.points)));
        lb.appendChild(row);
      });
      wrap.appendChild(lb);

      const stats = FF.ui.div('results__stats');
      if (results.bestStreak) stats.appendChild(FF.ui.el('span', { class: 'results__stat' }, '🔥 ' + results.bestStreak + ' Streak'));
      if (results.fastest != null) stats.appendChild(FF.ui.el('span', { class: 'results__stat' }, '⚡ ' + results.fastest.toFixed(3) + 's'));
      if (results.mostWords) stats.appendChild(FF.ui.el('span', { class: 'results__stat' }, '🔤 ' + results.mostWords + ' Words'));
      if (results.quizCorrect) stats.appendChild(FF.ui.el('span', { class: 'results__stat' }, '🧠 ' + results.quizCorrect + ' Correct'));
      if (stats.childNodes.length) wrap.appendChild(stats);

      const actions = FF.ui.div('results__actions');
      if (results.room && FF.Room && FF.Room.current()) {
        if (FF.Room.current().isHost) {
          actions.appendChild(FF.ui.button('🔄 PLAY AGAIN', { class: 'btn-lg', primary: true, onClick: function () {
            FF.Audio.play('click');
            FF.Room.playAgain().catch(function (err) {
              if (FF.RoomUI && FF.RoomUI.banner) {
                FF.RoomUI.banner((err && err.message) || 'The room could not be restarted.');
              }
            });
          } }));
        } else {
          wrap.appendChild(FF.ui.div('hint', 'Waiting for the host to start another round…'));
        }
        actions.appendChild(FF.ui.button('🌐 BACK TO ROOM', { class: 'btn-lg', onClick: function () { FF.GameFlow.close('online'); } }));
        FF.Room.offAll();
        FF.Room.on('meta', function (meta) {
          if (meta && (meta.status === 'lobby' || meta.status === 'playing')) {
            FF.GameFlow.close('online');
          }
        });
      } else {
        actions.appendChild(FF.ui.button('🔄 PLAY AGAIN', { class: 'btn-lg', primary: true, onClick: function () { FF.Audio.play('roundStart'); FF.GameFlow.launch(FF.GameFlow.current.def.id, { skipIntro: true }); } }));
        actions.appendChild(FF.ui.button('🏠 HOME', { class: 'btn-lg', onClick: function () { FF.GameFlow.exitToHome(); } }));
      }
      wrap.appendChild(actions);

      screen.appendChild(wrap);

      FF.Audio.play('winner');
      if (FF.Settings.get('animations') && FF.Confetti) {
        FF.Confetti.burst(160);
        if (FF.Confetti.sideCannons) FF.Confetti.sideCannons();
        if (FF.Confetti.rain) FF.Confetti.rain(80);
      }
      FF.Nav.focusFirst(screen);
    },

    showDisplayResults: function (results) {
      const screen = FF.ui.$('#game-screen');
      FF.ui.clear(screen);
      const cur = this.current;

      const wrap = FF.ui.div('results');
      wrap.appendChild(FF.ui.div('results__banner', '⏰'));
      wrap.appendChild(FF.ui.el('h1', { class: 'results__title' }, results.title || "TIME'S UP!"));
      wrap.appendChild(FF.ui.el('p', { class: 'results__sub' }, 'No points were tracked here — count everyone\u2019s score manually.'));
      if (results.note) wrap.appendChild(FF.ui.el('p', { class: 'results__sub' }, results.note));

      const actions = FF.ui.div('results__actions');
      actions.appendChild(FF.ui.button('🔄 PLAY AGAIN', { class: 'btn-lg', primary: true, onClick: function () {
        FF.Audio.play('roundStart');
        FF.GameFlow.launch(cur.def.id, { skipIntro: true, variation: 'display', displaySeconds: cur.config.displaySeconds });
      } }));
      actions.appendChild(FF.ui.button('🏠 HOME', { class: 'btn-lg', onClick: function () { FF.GameFlow.exitToHome(); } }));
      wrap.appendChild(actions);

      screen.appendChild(wrap);
      FF.Audio.play('roundEnd');
      FF.Nav.focusFirst(screen);
    },

    pause: function () {
      const cur = this.current;
      if (!cur) return;
      if (FF.Advance) FF.Advance.pauseAll();
      if (cur.shell && cur.shell.timer && cur.shell.timer.isRunning()) cur.shell.timer.pause();
      const overlay = FF.ui.div('pause-overlay');
      overlay.appendChild(FF.ui.el('h2', {}, '⏸ GAME PAUSED'));
      const actions = FF.ui.div('pause-actions');
      actions.appendChild(FF.ui.button('▶ Resume', { class: 'btn-lg', primary: true, onClick: function () { FF.GameFlow.resume(); } }));
      actions.appendChild(FF.ui.button('🔄 Restart', { class: 'btn-lg', onClick: function () { FF.GameFlow.restart(); } }));
      actions.appendChild(FF.ui.button('🏠 Exit Game', { class: 'btn-lg', onClick: function () { FF.GameFlow.exitToHome(); } }));
      overlay.appendChild(actions);
      FF.ui.$('#game-screen').appendChild(overlay);
      FF.Nav.focusFirst(overlay);
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
      const screen = FF.ui.$('#game-screen');
      const overlay = FF.ui.div('pause-overlay');
      overlay.appendChild(FF.ui.el('h2', {}, 'EXIT GAME?'));
      overlay.appendChild(FF.ui.el('p', { class: 'pause-sub' }, 'Your progress in this game will be lost.'));
      const actions = FF.ui.div('pause-actions');
      actions.appendChild(FF.ui.button('← Keep Playing', { class: 'btn-lg', primary: true, onClick: function () { overlay.parentNode.removeChild(overlay); FF.GameFlow.resume(); } }));
      actions.appendChild(FF.ui.button('🏠 Exit Game', { class: 'btn-lg', onClick: function () { FF.GameFlow.exitToHome(); } }));
      overlay.appendChild(actions);
      screen.appendChild(overlay);
      FF.Nav.focusFirst(overlay);
    },

    close: function (view) {
      if (FF.Advance) FF.Advance.cancelAll();
      const screen = FF.ui.$('#game-screen');
      if (screen) {
        screen.classList.add('hidden');
        screen.classList.remove('game-screen--art');
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
      if (!this.current || !this.current.shell) return;
      this.current.shell.host.classList.toggle('hidden');
      if (!this.current.shell.host.classList.contains('hidden')) FF.Nav.focusFirst(this.current.shell.host);
    },

    fail: function (msg) {
      const screen = FF.ui.$('#game-screen');
      FF.ui.clear(screen);
      const box = FF.ui.div('modal');
      const inner = FF.ui.div('modal__box');
      inner.appendChild(FF.ui.el('h2', {}, '😅 Oops!'));
      inner.appendChild(FF.ui.el('p', {}, 'Something went wrong with this game.'));
      if (msg && window.console) console.error('[FamilyFun game error]', msg);
      inner.appendChild(FF.ui.button('🏠 Back to Home', { primary: true, class: 'btn-lg', onClick: function () { FF.GameFlow.exitToHome(); } }));
      box.appendChild(inner);
      screen.appendChild(box);
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
      wrap.appendChild(FF.ui.div('dsp-tag', opts.tag || '👥 EVERYONE PLAYS'));
      wrap.appendChild(FF.ui.div('dsp-title', opts.title || api.def.name));

      const card = FF.ui.div('dsp-card');
      const counter = FF.ui.div('dsp-counter', '');
      const timerEl = FF.ui.div('dsp-timer', FF.util.formatTime(seconds));
      wrap.appendChild(card);
      wrap.appendChild(counter);
      wrap.appendChild(timerEl);

      const actions = FF.ui.div('dsp-actions');
      actions.appendChild(FF.ui.button('⏮ Prev', { class: 'btn btn-lg', onClick: function () { shift(-1); resetCard(); } }));
      actions.appendChild(FF.ui.button('⏭ Next', { class: 'btn btn-lg', onClick: function () { shift(1); resetCard(); } }));
      actions.appendChild(FF.ui.button('🏁 Finish', { class: 'btn btn-lg', primary: true, onClick: finish }));
      wrap.appendChild(actions);

      root.appendChild(wrap);

      function renderCard() {
        FF.ui.clear(card);
        if (!order.length) refill();
        const item = order[idx % order.length];
        appendInto(card, opts.render(item));
        if (opts.label) card.appendChild(FF.ui.div('dsp-label', opts.label(item)));
        counter.textContent = 'Card ' + ((idx % order.length) + 1) + ' of ' + order.length;
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
        api.end({ title: "TIME'S UP!" });
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

      const wrap = FF.ui.div('results');
      wrap.appendChild(FF.ui.div('results__banner', '🎮'));
      wrap.appendChild(FF.ui.el('h1', { class: 'results__title' }, 'ROUND ' + (s.index) + ' COMPLETE!'));

      // overall standings
      const standings = s.players.slice().sort(function (a, b) { return (s.totals[b.id] || 0) - (s.totals[a.id] || 0); });
      const lb = FF.ui.div('results__leaderboard');
      standings.forEach(function (p, i) {
        const row = FF.ui.div('results__row');
        row.appendChild(FF.ui.el('span', { class: 'results__rank' }, (i + 1) + '.'));
        row.appendChild(FF.Players.avatarEl(p, 'results__avatar'));
        row.appendChild(FF.ui.el('span', { class: 'results__name' }, p.name));
        row.appendChild(FF.ui.el('span', { class: 'results__pts' }, FF.util.formatNumber(s.totals[p.id] || 0)));
        lb.appendChild(row);
      });
      wrap.appendChild(lb);

      const actions = FF.ui.div('results__actions');
      if (s.index < s.schedule.length) {
        actions.appendChild(FF.ui.button('▶ NEXT ROUND', { class: 'btn-lg', primary: true, onClick: function () { FF.Audio.play('roundStart'); FF.GameNight.playNext(); } }));
      } else {
        actions.appendChild(FF.ui.button('🏆 FINAL RESULTS', { class: 'btn-lg', primary: true, onClick: function () { FF.GameNight.finish(); } }));
      }
      actions.appendChild(FF.ui.button('🏠 END GAME NIGHT', { class: 'btn-lg', onClick: function () { FF.GameNight.abort(); } }));
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
        title: 'GAME NIGHT COMPLETE!',
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
      const wrap = FF.ui.div('results');
      wrap.appendChild(FF.ui.div('results__banner', '⚡'));
      wrap.appendChild(FF.ui.el('h1', { class: 'results__title' }, 'TIE BREAKER!'));
      wrap.appendChild(FF.ui.el('p', { class: 'results__sub' }, a.name + ' vs ' + b.name));
      wrap.appendChild(FF.ui.el('p', { class: 'results__sub' }, 'Quick Tap — fastest reaction wins.'));
      const tieActions = FF.ui.div('results__actions');
      tieActions.appendChild(FF.ui.button('⚡ START TIE BREAKER', { class: 'btn-lg', primary: true, onClick: function () {
        FF.GameNight._tieWinner = null;
        FF.GameNight._tiePair = [a, b];
        FF.GameFlow.launch('quickTap', {
          skipIntro: true,
          mode: 'turn',
          tieBreak: true,
          onEnd: function (results) { FF.GameNight.tieBreakDone(results); }
        });
      } }));
      tieActions.appendChild(FF.ui.button('🏠 End Game Night', { class: 'btn-lg', onClick: function () { FF.GameNight.abort(); } }));
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
        title: 'GAME NIGHT COMPLETE!',
        results: standings.map(function (p) {
          return { id: p.id, name: p.name, avatar: p.avatar, photo: p.photo, color: p.color, points: s.totals[p.id] || 0 };
        })
      });
    },

    abort: function () {
      this.state = null;
      FF.GameFlow.exitToHome();
    }
  };
})();
