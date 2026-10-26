/* ============================================================
   PLAYMONA — gameLength.js
   How long a game lasts, the same way in every game.

   - Quick / Short / Normal / Long scale a game's usual number of
     rounds (Normal is the game's own number).
   - Or a game clock in minutes ("play for 20 minutes"): rounds keep
     coming until it runs out, then the game finishes at its next
     screen change, so nobody is cut off mid-answer.
   Online rooms keep the host's room settings (FF.Race.plan).

   Games ask FF.GameLength.rounds(api, usual, available) for their
   round count and FF.GameLength.roundText(n, total) for the label.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var UNBOUNDED = 200;   // rounds to plan when only the clock limits the game
  var SCALE = { quick: 0.6, short: 0.8, normal: 1, long: 1.5 };
  var LENGTHS = ['quick', 'short', 'normal', 'long'];
  var CLOCKS = [5, 10, 15, 20, 30];   // minutes offered as quick choices
  var MAX_MINUTES = 120;

  var clock = null;   // the running game clock, if any

  function racing() { return !!(FF.Race && FF.Race.active && FF.Race.active()); }

  function mmss(secs) {
    secs = Math.max(0, Math.ceil(secs));
    return Math.floor(secs / 60) + ':' + ('0' + (secs % 60)).slice(-2);
  }

  function secondsLeft() {
    if (!clock) return null;
    var ms = clock.paused ? clock.left : clock.deadline - Date.now();
    return Math.max(0, ms / 1000);
  }

  function paint() {
    if (!clock || !clock.el) return;
    var left = secondsLeft();
    clock.text.textContent = clock.up ? FF.t('lastRound', 'Last round') : mmss(left);
    clock.el.classList.toggle('is-low', !clock.up && left <= 60);
    clock.el.classList.toggle('is-up', clock.up);
  }

  function tick() {
    if (!clock || clock.paused) return;
    // The game screen is gone (exited without close): stop quietly.
    if (!clock.el.isConnected) { FF.GameLength.stop(); return; }
    var left = secondsLeft();
    if (!clock.warned && left <= 60 && clock.total > 90) {
      clock.warned = true;
      FF.UI.toast(FF.t('oneMinuteLeft', 'One minute left!'));
    }
    if (!clock.up && left <= 0) timeUp();
    paint();
  }

  // Time is up: let the current round finish, then end at the next screen.
  function timeUp() {
    clock.up = true;
    FF.Audio.play('roundEnd');
    FF.UI.toast(FF.t('timeUpLastRound', 'Time’s up! This is the last round.'));
    // A game that ends itself (FF.GameLength.manual) checks timeUp() instead.
    if (clock.manual) return;
    var root = clock.root;
    if (!root || typeof MutationObserver !== 'function') return;
    clock.observer = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        if (muts[i].removedNodes && muts[i].removedNodes.length) { finish(); return; }
      }
    });
    clock.observer.observe(root, { childList: true });
  }

  function finish() {
    var flow = FF.GameFlow;
    var cur = flow && flow.current;
    var mine = clock && cur && cur === clock.owner;
    FF.GameLength.stop();
    if (!mine || cur.ended) return;
    if (cur.shell && cur.shell.hideTimer) cur.shell.hideTimer();
    if (FF.Advance) FF.Advance.cancelAll();
    flow.end({ title: FF.t('timesUp', 'Time’s up!') });
  }

  FF.GameLength = {
    UNBOUNDED: UNBOUNDED,
    LENGTHS: LENGTHS,

    /* This game runs on a clock (not in rooms, Game Night or TV mode). */
    timed: function (config) {
      return !!(config && Number(config.clock) > 0 && !config.room && !config.tournament && config.variation !== 'display');
    },

    /* How many rounds to play. usual is the game's own number for Normal;
       available caps it so questions do not repeat (0 = no cap). */
    rounds: function (api, usual, available) {
      if (racing()) return FF.Race.plan(usual, available);
      var cfg = (api && api.config) || {};
      var cap = available > 0 ? available : UNBOUNDED;
      var n = this.timed(cfg) ? UNBOUNDED : Math.round(usual * (SCALE[cfg.length] || 1));
      return Math.max(1, Math.min(n, cap));
    },

    /* "Round 3 of 10", or just "Round 3" while a clock decides the end. */
    roundText: function (n, total) {
      if (racing()) return FF.Race.roundText(n, total);
      return (total >= UNBOUNDED || clock)
        ? FF.t('roundN', 'Round {n}', { n: n })
        : FF.t('roundOf', 'Round {n} of {total}', { n: n, total: total });
    },

    /* The clock ran out (the current round is the last). */
    timeUp: function () { return !!(clock && clock.up); },

    /* The game ends itself when timeUp() turns true (for example after
       everyone has had the same number of turns), so the clock must not
       end it at the next screen change. */
    manual: function () { if (clock) clock.manual = true; },
    secondsLeft: secondsLeft,

    /* Start the clock for the game GameFlow just opened. */
    start: function (cur) {
      this.stop();
      var secs = Number(cur.config.clock) || 0;
      var shell = cur.shell;
      var el = FF.ui.el('div', { class: 'game-shell__clock', role: 'timer', 'aria-label': FF.t('gameClockLeft', 'Game time left') });
      el.appendChild(FF.Icons.icon('clock'));
      var text = FF.ui.span('game-shell__clock-text', '');
      el.appendChild(text);
      var bar = shell.el && shell.el.querySelector('.game-shell__bar');
      if (bar && shell.timerEl) bar.insertBefore(el, shell.timerEl);
      else if (bar) bar.appendChild(el);
      clock = {
        owner: cur, root: shell.root, el: el, text: text,
        total: secs, deadline: Date.now() + secs * 1000,
        paused: false, left: 0, up: false, warned: false,
        observer: null, interval: setInterval(tick, 250)
      };
      paint();
    },

    pause: function () {
      if (!clock || clock.paused) return;
      clock.left = clock.deadline - Date.now();
      clock.paused = true;
    },

    resume: function () {
      if (!clock || !clock.paused) return;
      clock.deadline = Date.now() + clock.left;
      clock.paused = false;
      paint();
    },

    stop: function () {
      if (!clock) return;
      clearInterval(clock.interval);
      if (clock.observer) clock.observer.disconnect();
      clock = null;
    },

    /* Short description for the options summary: "Normal" or "20 min". */
    summary: function (config) {
      var t = FF.t;
      if (Number(config.clock) > 0) return t('nMin', '{n} min', { n: Math.round(config.clock / 60) });
      var len = config.length || 'normal';
      return t('len' + len.charAt(0).toUpperCase() + len.slice(1), len.charAt(0).toUpperCase() + len.slice(1));
    },

    /* The setup screen's Game length control: a number of rounds
       (Quick … Long) or a clock (5 … 30 min, or any number of minutes).
       onChange(config) after every change. */
    picker: function (config, onChange) {
      var t = FF.t;
      var wrap = FF.ui.div('length-picker');
      var rounds = FF.ui.el('div', { class: 'seg', role: 'group', 'aria-label': t('rounds', 'Rounds') });
      var clocks = FF.ui.el('div', { class: 'seg', role: 'group', 'aria-label': t('playFor', 'Play for') });
      var input;

      function sync() {
        var mins = Number(config.clock) > 0 ? Math.round(config.clock / 60) : 0;
        FF.ui.$$('.seg__btn', rounds).forEach(function (b) {
          var on = !mins && b.dataset.len === (config.length || 'normal');
          b.classList.toggle('active', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        FF.ui.$$('.seg__btn', clocks).forEach(function (b) {
          var on = mins > 0 && Number(b.dataset.min) === mins;
          b.classList.toggle('active', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        if (input && document.activeElement !== input) input.value = mins && CLOCKS.indexOf(mins) === -1 ? mins : '';
        if (onChange) onChange(config);
      }

      LENGTHS.forEach(function (len) {
        var label = t('len' + len.charAt(0).toUpperCase() + len.slice(1), len.charAt(0).toUpperCase() + len.slice(1));
        rounds.appendChild(FF.ui.button(label, {
          class: 'seg__btn', dataset: { len: len },
          onClick: function () { config.length = len; config.clock = 0; sync(); }
        }));
      });
      CLOCKS.forEach(function (m) {
        clocks.appendChild(FF.ui.button(t('nMinShort', '{n} min', { n: m }), {
          class: 'seg__btn', dataset: { min: m },
          onClick: function () { config.clock = m * 60; sync(); }
        }));
      });

      wrap.appendChild(FF.ui.div('length-picker__label', t('lengthRounds', 'Rounds')));
      wrap.appendChild(rounds);
      wrap.appendChild(FF.ui.div('length-picker__label', t('lengthClock', 'Or play for a set time')));
      wrap.appendChild(clocks);

      var custom = FF.ui.div('duration-picker__custom');
      custom.appendChild(FF.ui.span('duration-picker__label', t('customColon', 'Custom:')));
      input = FF.ui.el('input', {
        type: 'number', class: 'num-input', min: 1, max: MAX_MINUTES, inputmode: 'numeric',
        'aria-label': t('customMinutes', 'Custom game length in minutes'),
        oninput: function () {
          var m = Math.round(Number(input.value) || 0);
          if (m <= 0) return;
          config.clock = Math.min(MAX_MINUTES, m) * 60;
          sync();
        }
      });
      custom.appendChild(input);
      custom.appendChild(FF.ui.span('', t('minutesUnit', 'minutes')));
      wrap.appendChild(custom);

      sync();
      return wrap;
    }
  };
})();
