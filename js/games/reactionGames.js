/* ============================================================
   PLAYMONA — reactionGames.js
   Reaction games: Quick Tap (reflex test) and Color Reaction
   (Stroop-style ink-colour challenge).
   Classic script (no ES modules) so the app runs from file://
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  /* ================= helpers ================= */

  // The DEV_GUIDE references FF.registerGame, but the engine exposes
  // FF.Games.register. Prefer the documented alias if it exists, then
  // fall back to the engine function so registration always works.
  function registerGame(def) {
    if (typeof FF.registerGame === 'function') { FF.registerGame(def); return; }
    if (FF.Games && typeof FF.Games.register === 'function') { FF.Games.register(def); }
  }

  function difficultyBonus(difficulty) {
    if (difficulty === 'easy') return 1;
    if (difficulty === 'hard') return 2;
    return 1.5; // normal
  }


  function renderMissing(api, msg) {
    var root = api.shell.root;
    api.ui.clear(root);
    var wrap = api.ui.div('rt-empty');
    wrap.appendChild(api.ui.div('rt-empty__icon', FF.Icons.icon('alert')));
    wrap.appendChild(api.ui.el('p', { class: 'rt-empty__msg' }, msg));
    wrap.appendChild(FF.UI.button('Exit', { icon: 'house',  primary: true, class: 'btn-lg', onClick: function () {
      FF.GameFlow.exitToHome();
    } }));
    root.appendChild(wrap);
  }

  function focusSafe(node) {
    if (node && typeof FF.Nav !== 'undefined' && FF.Nav.focus) { FF.Nav.focus(node); }
  }

  /* Shared layout styles for both reaction games (theme-aware). */

  /* ================= Game 1: Quick Tap =================
     Wait for green, then tap anywhere. Offline it is solo or pass and play;
     in a room everyone races the same signal and every valid tap scores by
     its place ('ranked' race mode). Times run from the frame the signal
     shows to the touch (pointerdown), never to the lift.
     Looks: css/games.css (.qt-*). Design: docs/superpowers/specs/
     2026-10-26-quick-tap-redesign-design.md                              */

  registerGame({
    id: 'quickTap',
    featured: true,
    name: 'Quick Tap',
    description: 'Wait for green, then tap faster than everyone else.',
    category: 'reaction',
    icon: '👆',
    players: [1, 8],
    difficulty: 'Easy',
    duration: 3,
    tags: ['quick', 'reflex'],
    modes: ['solo', 'turn'],
    defaultMode: 'turn',
    howToPlay: [
      'Wait while the screen says Wait.',
      'The moment it turns green, tap anywhere (or press Space).',
      'Tap too soon and that round is a false start. On hard, coloured decoy flashes try to trick you.',
      'Online, everyone gets the same signal at the same instant. The fastest tap wins each round.',
      'Most points wins.'
    ],
    start: function (api) { startQuickTap(api); }
  });

  /* ---------- Pure helpers (tools/test/quickTap.test.js) ---------- */
  var QT = {
    ROUNDS: 5,
    MISS_MS: 2500,        // no tap this long after the signal is a miss
    DECOY_MS: 380,        // how long a decoy flash shows
    AVG_MS: 250,          // the average person, for the meter
    METER_MIN: 100,
    METER_MAX: 600,
    ONLINE_TIMER_MS: 12000,
    TIERS: [
      { max: 180, id: 'lightning', name: 'Lightning', points: 300 },
      { max: 230, id: 'rocket', name: 'Rocket', points: 250 },
      { max: 280, id: 'quick', name: 'Quick', points: 200 },
      { max: 350, id: 'steady', name: 'Steady', points: 150 },
      { max: Infinity, id: 'sleepy', name: 'Sleepy', points: 100 }
    ],
    PLACE_POINTS: [300, 200, 150],
    OTHER_POINTS: 100,

    tier: function (ms) {
      for (var i = 0; i < this.TIERS.length; i++) if (ms < this.TIERS[i].max) return this.TIERS[i];
      return this.TIERS[this.TIERS.length - 1];
    },
    // Offline: each valid try scores by its rating.
    tierPoints: function (ms, bonus) { return ms == null ? 0 : Math.round(this.tier(ms).points * bonus); },
    // Online: each valid tap scores by its place in the round.
    placePoints: function (place, bonus) { return Math.round((this.PLACE_POINTS[place - 1] || this.OTHER_POINTS) * bonus); },

    /* When the signal comes and which decoys flash first, in ms from the
       moment the round opens. rand is FF._rand, which a room seeds per
       round, so every device draws the same schedule. It always takes the
       same number of draws whatever the difficulty. */
    schedule: function (difficulty, rand) {
      var wait = difficulty === 'easy' ? 2000 + rand() * 2000 : 1200 + rand() * 4300;
      var two = rand() < 0.5;
      var a = 700 + rand() * (wait - 1100);
      var b = 700 + rand() * (wait - 1100);
      var firstKind = rand() < 0.5 ? 'a' : 'b';
      var decoys = [];
      if (difficulty === 'hard') {
        decoys.push({ at: Math.round(a), kind: firstKind });
        if (two && Math.abs(b - a) >= this.DECOY_MS + 400) decoys.push({ at: Math.round(b), kind: firstKind === 'a' ? 'b' : 'a' });
        decoys.sort(function (x, y) { return x.at - y.at; });
        wait += 600;      // keeps a clear gap between the last decoy and the signal
      }
      return { signal: Math.round(wait), decoys: decoys };
    },

    reaction: function (signalAt, pressAt) { return Math.max(0, Math.round(pressAt - signalAt)); },

    stats: function (times) {
      var valid = (times || []).filter(function (t) { return t != null; });
      var sum = valid.reduce(function (s, t) { return s + t; }, 0);
      return {
        valid: valid.length,
        best: valid.length ? Math.min.apply(null, valid) : null,
        avg: valid.length ? Math.round(sum / valid.length) : null
      };
    },

    meterPct: function (ms) {
      var p = (ms - this.METER_MIN) / (this.METER_MAX - this.METER_MIN) * 100;
      return Math.max(0, Math.min(100, p));
    }
  };
  FF.QuickTap = QT;

  function t(k, f, v) { return FF.t ? FF.t(k, f, v) : String(f); }

  function reduceMotion() {
    var setting = FF.Settings && FF.Settings.get && FF.Settings.get('reduceMotion');
    var os = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return !!(setting || os);
  }

  function buzz(pattern) {
    // Browsers refuse (and log) vibration before the player has touched the page.
    var touched = !navigator.userActivation || navigator.userActivation.hasBeenActive;
    try { if (touched && navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* not supported */ }
  }

  function tierName(tr) { return t('qtTier_' + tr.id, tr.name); }

  // Personal bests, per player and difficulty (account-scoped storage).
  function bestFor(id, difficulty) {
    var all = (FF.Storage && FF.Storage.get('quickTapBest', {})) || {};
    var mine = all[id] || {};
    return typeof mine[difficulty] === 'number' ? mine[difficulty] : null;
  }
  function saveBest(id, difficulty, ms) {
    if (!FF.Storage) return;
    var all = FF.Storage.get('quickTapBest', {}) || {};
    var mine = all[id] || {};
    mine[difficulty] = ms;
    all[id] = mine;
    FF.Storage.set('quickTapBest', all);
  }

  function msText(ms) { return ms == null ? '—' : t('qtMs', '{n} ms', { n: ms }); }

  // What a round with no time shows: a false start, a miss, or sitting out.
  function noTimeText(kind) {
    if (kind === 'miss') return t('qtMissedShort', 'missed');
    if (kind === 'late') return t('qtSatOut', 'sat out');
    return t('qtTooSoonShort', 'too soon');
  }

  /* ---------- The arena: the whole content area is the button ----------
     cfg: { player, n, total, difficulty, best, history, schedule, racing,
            lanes: [{ id, name, avatar, photo, color }] }
     onResult({ ms, kind }) fires once: kind is 'tap', 'early', 'decoy',
     'miss' or 'late'. Returns { open(offsetMs), lanes(answers), destroy() }.
     Offline the wait starts at once; online the caller calls open() at the
     room's shared open instant, with how far past it this device already is. */
  function runArena(api, cfg, onResult) {
    var root = api.shell.root;
    api.ui.clear(root);
    var timers = [];
    var phase = cfg.racing ? 'ready' : 'wait';
    var signalAt = 0;
    var reported = false;
    var schedule = cfg.schedule;

    function later(fn, ms) { var id = setTimeout(fn, Math.max(0, ms)); timers.push(id); return id; }
    function clearTimers() { timers.forEach(function (id) { clearTimeout(id); clearInterval(id); }); timers = []; }

    var arena = api.ui.el('div', {
      class: 'qt-arena', role: 'button', tabindex: 0,
      'aria-label': t('qtTapArea', 'Tap area'),
      dataset: { phase: phase }
    });

    var top = api.ui.div('qt-top');
    top.appendChild(api.ui.span('qt-top__round', FF.GameLength.roundText(cfg.n + 1, cfg.total)));
    var dots = api.ui.span('qt-dots');
    var shown = Math.min(cfg.total, 12);
    for (var i = 0; i < shown; i++) {
      var h = cfg.history[i];
      dots.appendChild(api.ui.span('qt-dot' + (i === cfg.n ? ' qt-dot--now' : h === undefined ? '' : h == null ? ' qt-dot--bad' : ' qt-dot--ok')));
    }
    top.appendChild(dots);
    top.appendChild(api.ui.span('qt-top__best', cfg.best != null ? t('qtBestShort', 'Best {ms}', { ms: msText(cfg.best) }) : ''));
    arena.appendChild(top);

    var center = api.ui.div('qt-center');
    center.appendChild(api.ui.div('qt-ring'));
    center.appendChild(api.ui.div('qt-burst'));
    var big = api.ui.div('qt-big', cfg.racing ? t('qtGetReady', 'Get ready') : t('qtWait', 'Wait…'));
    var sub = api.ui.div('qt-sub', cfg.racing ? t('qtEveryone', 'Everyone gets the signal at the same instant') : t('qtWaitSub', 'Tap the moment it turns green'));
    center.appendChild(big);
    center.appendChild(sub);
    arena.appendChild(center);

    var laneEls = {};
    if (cfg.racing && cfg.lanes && cfg.lanes.length) {
      var lanes = api.ui.div('qt-lanes');
      cfg.lanes.forEach(function (p) {
        var lane = api.ui.div('qt-lane' + (p.me ? ' qt-lane--me' : ''));
        lane.appendChild(FF.Players.avatarEl(p, 'qt-lane__ava'));
        lane.appendChild(api.ui.span('qt-lane__name', p.me ? t('you', 'You') : p.name));
        var time = api.ui.span('qt-lane__t', '…');
        lane.appendChild(time);
        laneEls[p.id] = { lane: lane, time: time, done: false };
        lanes.appendChild(lane);
      });
      arena.appendChild(lanes);
    }

    root.appendChild(arena);
    if (FF.Nav && FF.Nav.focus) FF.Nav.focus(arena);

    function setPhase(p) { phase = p; arena.dataset.phase = p; }
    function say(msg) { if (FF.UI && FF.UI.announce) FF.UI.announce(msg); }

    function lane(id, ms, kind) {
      var l = laneEls[id];
      if (!l || l.done) return;
      l.done = true;
      l.lane.classList.add(ms == null ? 'qt-lane--early' : 'qt-lane--tapped');
      l.time.textContent = ms == null ? noTimeText(kind) : msText(ms);
    }

    function report(ms, kind) {
      if (reported) return;
      reported = true;
      if (cfg.racing && cfg.player) lane(cfg.player.id, ms, kind);
      onResult({ ms: ms, kind: kind });
    }

    // Offline only: the pause overlay sits over the arena, so a round that
    // reaches its signal while paused starts again once play resumes.
    function paused() { return !cfg.racing && !!document.querySelector('.pause-overlay'); }
    function holdForPause() {
      clearTimers();
      setPhase('wait');
      big.textContent = t('paused', 'Paused');
      sub.textContent = '';
      var poll = setInterval(function () {
        if (!arena.isConnected) { clearInterval(poll); return; }
        if (paused()) return;
        clearInterval(poll);
        schedule = QT.schedule(cfg.difficulty, FF._rand);
        startWait(0);
      }, 250);
      timers.push(poll);
    }

    function startWait(offset) {
      if (schedule.signal - offset < 150) {
        // This device arrived after the signal: sit the round out.
        setPhase('out');
        big.textContent = t('qtLate', 'You joined late');
        sub.textContent = t('qtLateSub', 'Sit this one out');
        report(null, 'late');
        return;
      }
      setPhase('wait');
      big.textContent = t('qtWait', 'Wait…');
      sub.textContent = t('qtWaitSub', 'Tap the moment it turns green');
      say(t('qtSayWait', 'Wait for green'));
      var beat = setInterval(function () { if (phase === 'wait') api.audio.play('heartbeat'); }, 900);
      timers.push(beat);

      schedule.decoys.forEach(function (d) {
        if (d.at - offset < 0) return;
        later(function () {
          if (phase !== 'wait') return;
          if (paused()) { holdForPause(); return; }
          setPhase(d.kind === 'a' ? 'decoy-a' : 'decoy-b');
          big.textContent = t('qtNotYet', 'Not yet');
          sub.textContent = t('qtNotGreen', 'That is not green');
          later(function () {
            if (phase !== 'decoy-a' && phase !== 'decoy-b') return;
            setPhase('wait');
            big.textContent = t('qtWait', 'Wait…');
            sub.textContent = t('qtWaitSub', 'Tap the moment it turns green');
          }, QT.DECOY_MS);
        }, d.at - offset);
      });

      later(signal, schedule.signal - offset);
    }

    function signal() {
      if (phase === 'early' || phase === 'out') return;
      if (paused()) { holdForPause(); return; }
      setPhase('go');
      big.textContent = t('qtTap', 'Tap!');
      sub.textContent = '';
      signalAt = performance.now();
      // Count from the frame that shows green. A background tab can hold
      // frames back, so this only refines the start; it never delays it.
      if (window.requestAnimationFrame) {
        requestAnimationFrame(function () { if (phase === 'go') signalAt = performance.now(); });
      }
      api.audio.play('countdown');
      buzz(25);
      say(t('qtSayTap', 'Tap now'));
      later(function () {
        if (phase !== 'go') return;
        setPhase('done');
        big.textContent = t('qtMissed', 'Missed it');
        sub.textContent = '';
        api.audio.play('wrong');
        report(null, 'miss');
      }, QT.MISS_MS);
    }

    function falseStart(decoy) {
      setPhase('early');
      big.textContent = t('qtTooSoon', 'Too soon!');
      sub.textContent = decoy ? t('qtWasDecoy', 'That flash was a decoy') : t('qtWaitNext', 'Wait for green next time');
      api.audio.play('wrong');
      buzz([40, 40, 40]);
      say(t('qtTooSoon', 'Too soon!'));
      report(null, decoy ? 'decoy' : 'early');
      if (cfg.racing) {
        later(function () {
          setPhase('out');
          big.textContent = t('qtOut', 'Out this round');
          sub.textContent = t('qtWatchOthers', 'Watch the others…');
        }, 900);
      }
    }

    function showTime(ms) {
      var tr = QT.tier(ms);
      var pb = cfg.best == null || ms < cfg.best;
      FF.ui.clear(center);
      var card = api.ui.div('qt-result');
      var time = api.ui.div('qt-ms', String(ms));
      time.appendChild(api.ui.span('qt-ms__unit', t('qtMsUnit', 'ms')));
      card.appendChild(time);
      card.appendChild(api.ui.el('span', { class: 'qt-tier', dataset: { tier: tr.id } }, tierName(tr)));
      if (pb) card.appendChild(api.ui.div('qt-pb', t('qtNewBest', 'New personal best')));
      var meter = api.ui.div('qt-meter');
      var track = api.ui.div('qt-meter__track');
      track.appendChild(api.ui.el('span', { class: 'qt-meter__avg', style: { left: QT.meterPct(QT.AVG_MS) + '%' } }));
      var you = api.ui.el('span', { class: 'qt-meter__you', style: { left: '0%' } });
      track.appendChild(you);
      meter.appendChild(track);
      var avgLabel = api.ui.div('qt-meter__avglabel');
      avgLabel.appendChild(api.ui.el('span', { style: { left: QT.meterPct(QT.AVG_MS) + '%' } }, t('qtAvgPerson', 'Average person {ms}', { ms: QT.AVG_MS })));
      meter.appendChild(avgLabel);
      var ends = api.ui.div('qt-meter__ends');
      ends.appendChild(api.ui.span('', msText(QT.METER_MIN)));
      ends.appendChild(api.ui.span('', msText(QT.METER_MAX)));
      meter.appendChild(ends);
      card.appendChild(meter);
      center.appendChild(card);
      later(function () { you.style.left = QT.meterPct(ms) + '%'; }, 30);
      if (pb && cfg.best != null) {
        if (!reduceMotion() && FF.Confetti) FF.Confetti.burst(90);
        api.audio.play('streak');
      }
      say(t('qtSayTime', '{ms} milliseconds. {tier}.', { ms: ms, tier: tierName(tr) }));
    }

    function press(e) {
      if (!arena.isConnected) { cleanupKeys(); return; }
      var at = (e && e.timeStamp) ? e.timeStamp : performance.now();
      if (phase === 'wait') { falseStart(false); return; }
      if (phase === 'decoy-a' || phase === 'decoy-b') { falseStart(true); return; }
      if (phase !== 'go') return;
      var ms = QT.reaction(signalAt, at);
      setPhase('done');
      api.audio.play('tap');
      buzz(10);
      showTime(ms);
      report(ms, 'tap');
    }

    function onPointer(e) {
      if (e.button != null && e.button > 0) return;
      e.preventDefault();
      press(e);
    }
    function onKey(e) {
      if (e.repeat || (e.code !== 'Space' && e.key !== ' ' && e.key !== 'Enter')) return;
      // Keys aimed at the shell's own buttons (quit, pause) stay theirs.
      var tgt = e.target;
      if (tgt && tgt !== arena && tgt !== document.body && tgt.closest && !tgt.closest('.qt-arena')) return;
      e.preventDefault();
      press(e);
    }
    function cleanupKeys() { document.removeEventListener('keydown', onKey); }
    arena.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);

    if (!cfg.racing) startWait(0);

    return {
      open: function (offsetMs) { if (phase === 'ready') startWait(offsetMs || 0); },
      lanes: function (answers) {
        Object.keys(answers || {}).forEach(function (uid) {
          var a = answers[uid];
          if (a) lane(uid, a.correct === true && a.ms != null ? a.ms : null, a.kind);
        });
      },
      destroy: function () { clearTimers(); cleanupKeys(); }
    };
  }

  /* ---------- Screens around the arena ---------- */

  function handover(api, player, many, best, onStart) {
    var root = api.shell.root;
    api.ui.clear(root);
    var wrap = api.ui.div('qt-screen');
    wrap.appendChild(FF.Players.avatarEl(player, 'qt-handover__ava'));
    wrap.appendChild(api.ui.el('h2', { class: 'qt-title' }, many ? t('qtYouAreUp', '{name}, you’re up', { name: player.name }) : t('qtReady', 'Ready?')));
    wrap.appendChild(api.ui.el('p', { class: 'qt-lead' }, many ? t('qtPassTo', 'Pass the device to {name}.', { name: player.name }) : t('qtSoloLead', 'Wait for green, then tap anywhere as fast as you can.')));
    if (best != null) wrap.appendChild(api.ui.div('qt-hint', t('qtYourBest', 'Your best: {ms}', { ms: msText(best) })));
    var btn = FF.UI.button(t('start', 'Start'), { icon: 'play', primary: true, class: 'btn-lg', onClick: function () {
      api.audio.play('roundStart');
      onStart();
    } });
    wrap.appendChild(btn);
    wrap.appendChild(api.ui.div('qt-hint', t('qtSpaceHint', 'Tip: the space bar works too.')));
    root.appendChild(wrap);
    if (FF.Nav && FF.Nav.focus) FF.Nav.focus(btn);
  }

  function countdown(api, onDone) {
    var root = api.shell.root;
    api.ui.clear(root);
    var wrap = api.ui.div('qt-screen');
    wrap.appendChild(api.ui.el('p', { class: 'qt-lead' }, t('qtGetReady', 'Get ready')));
    var num = api.ui.div('qt-count', '3');
    wrap.appendChild(num);
    root.appendChild(wrap);
    var n = 3;
    api.audio.play('countdown');
    (function step() {
      setTimeout(function () {
        if (!wrap.isConnected) return;
        n--;
        if (n === 0) { onDone(); return; }
        var next = api.ui.div('qt-count', String(n));
        num.replaceWith(next);
        num = next;
        api.audio.play('countdown');
        step();
      }, 900);
    })();
  }

  function bars(api, times) {
    var box = api.ui.div('qt-bars');
    times.forEach(function (ms) {
      if (ms == null) { box.appendChild(api.ui.span('qt-bar qt-bar--bad')); return; }
      var h = Math.max(12, Math.min(100, 100 - (ms - 120) / 4));
      box.appendChild(api.ui.el('span', { class: 'qt-bar', style: { height: h + '%' } }));
    });
    return box;
  }

  function playerCard(api, p, showPoints) {
    var st = QT.stats(p.times);
    var card = api.ui.div('qt-card');
    var head = api.ui.div('qt-card__head');
    head.appendChild(FF.Players.avatarEl(p, 'qt-card__ava'));
    head.appendChild(api.ui.span('qt-card__name', p.me ? t('you', 'You') : p.name));
    if (st.best != null) head.appendChild(api.ui.el('span', { class: 'qt-tier qt-tier--sm', dataset: { tier: QT.tier(st.best).id } }, tierName(QT.tier(st.best))));
    card.appendChild(head);
    var stats = api.ui.div('qt-card__stats');
    function stat(label, value) {
      var s = api.ui.span('qt-card__stat', label);
      s.appendChild(api.ui.el('b', null, value));
      stats.appendChild(s);
    }
    stat(t('best', 'Best'), msText(st.best));
    stat(t('average', 'Average'), msText(st.avg));
    if (showPoints) stat(t('points', 'Points'), FF.util.formatNumber(p.points));
    card.appendChild(stats);
    card.appendChild(bars(api, p.times));
    return card;
  }

  // entries: [{ id, name, avatar, photo, color, me, points, times }]
  function finalScreen(api, entries, opts, onDone) {
    var root = api.shell.root;
    api.ui.clear(root);
    var wrap = api.ui.div('qt-screen qt-screen--final');
    var order = entries.slice().sort(function (a, b) { return b.points - a.points; });
    if (order.length > 1) {
      var top = order[0];
      wrap.appendChild(api.ui.el('h2', { class: 'qt-title' }, top.me ? t('qtChampionYou', 'You are the champion!') : t('qtChampion', '{name} wins!', { name: top.name })));
      var podium = api.ui.div('qt-podium');
      [order[1], order[0], order[2]].forEach(function (p, i) {
        if (!p) return;
        var place = [2, 1, 3][i];
        var step = api.ui.div('qt-step qt-step--' + place);
        step.appendChild(FF.Players.avatarEl(p, 'qt-step__ava'));
        step.appendChild(api.ui.span('qt-step__name', p.me ? t('you', 'You') : p.name));
        var block = api.ui.div('qt-step__block');
        block.appendChild(api.ui.el('b', null, String(place)));
        block.appendChild(api.ui.span('', FF.util.formatNumber(p.points)));
        step.appendChild(block);
        podium.appendChild(step);
      });
      wrap.appendChild(podium);
      setTimeout(function () {
        if (!wrap.isConnected) return;
        api.audio.play('winner');
        if (!reduceMotion() && FF.Confetti) FF.Confetti.rain(140);
      }, 900);
    } else {
      var st = QT.stats(order[0] ? order[0].times : []);
      wrap.appendChild(api.ui.el('p', { class: 'qt-lead' }, t('qtYourReflexes', 'Your reflexes')));
      wrap.appendChild(api.ui.el('h2', { class: 'qt-title' }, st.best != null ? tierName(QT.tier(st.best)) : t('qtTryAgain', 'Try again')));
    }
    var cards = api.ui.div('qt-cards');
    order.forEach(function (p) { cards.appendChild(playerCard(api, p, opts.points)); });
    wrap.appendChild(cards);
    var next = FF.Advance.button(t('seeResults', 'See results'), onDone, { class: 'btn-lg', ms: opts.racing ? 8000 : 0 });
    wrap.appendChild(next);
    root.appendChild(wrap);
  }

  /* ---------- Quick Tap: offline (solo, pass and play) ---------- */
  function startQuickTap(api) {
    var bonus = difficultyBonus(api.config.difficulty);
    var difficulty = api.config.difficulty || 'normal';
    var rounds = FF.GameLength.rounds(api, QT.ROUNDS, 0);

    if (FF.Race && FF.Race.active && FF.Race.active()) { startQuickTapOnline(api, rounds, bonus, difficulty); return; }

    var scorers = api.config.scorers;
    if (!scorers || !scorers.length) {
      renderMissing(api, t('qtNeedPlayer', 'Add at least one player to play Quick Tap.'));
      return;
    }
    var order = scorers.slice();
    if (api.config.randomOrder) order = api.util.shuffle(order);
    var many = order.length > 1;
    var summary = [];
    var index = 0;

    function nextPlayer() {
      if (index >= order.length) { finish(); return; }
      var player = order[index++];
      handover(api, player, many, bestFor(player.id, difficulty), function () {
        countdown(api, function () { playRounds(player, 0, []); });
      });
    }

    function playRounds(player, n, times) {
      if (n >= rounds) { donePlayer(player, times); return; }
      var best = bestFor(player.id, difficulty);
      var arena = runArena(api, {
        player: player, n: n, total: rounds, difficulty: difficulty, best: best,
        history: times, schedule: QT.schedule(difficulty, FF._rand), racing: false
      }, function (res) {
        times.push(res.ms);
        if (res.ms != null && (best == null || res.ms < best)) saveBest(player.id, difficulty, res.ms);
        setTimeout(function () {
          arena.destroy();
          playRounds(player, n + 1, times);
        }, res.ms == null ? 1300 : 1900);
      });
    }

    function donePlayer(player, times) {
      var points = times.reduce(function (sum, ms) { return sum + QT.tierPoints(ms, bonus); }, 0);
      var st = QT.stats(times);
      api.scoring.add(player.id, points, { correct: st.valid > 0, fastest: st.best });
      api.shell.updateScores(player.id);
      summary.push({
        id: player.id, name: player.name, avatar: player.avatar, photo: player.photo, color: player.color,
        points: points, times: times, correct: st.valid, fastest: st.best == null ? null : st.best / 1000
      });
      if (index < order.length) {
        // A beat between players: their card, then the hand-over.
        var root = api.shell.root;
        api.ui.clear(root);
        var wrap = api.ui.div('qt-screen');
        wrap.appendChild(api.ui.el('h2', { class: 'qt-title' }, st.best != null ? tierName(QT.tier(st.best)) : t('qtTryAgain', 'Try again')));
        wrap.appendChild(playerCard(api, summary[summary.length - 1], true));
        wrap.appendChild(FF.Advance.button(t('qtNextPlayer', 'Next player'), function () { api.audio.play('select'); nextPlayer(); }, { class: 'btn-lg' }));
        root.appendChild(wrap);
        return;
      }
      nextPlayer();
    }

    function finish() {
      finalScreen(api, summary, { points: many, racing: false }, function () {
        var results = summary.slice().sort(function (a, b) { return b.points - a.points; });
        var fastest = null;
        results.forEach(function (r) { if (r.fastest != null && (fastest == null || r.fastest < fastest)) fastest = r.fastest; });
        api.end({
          results: results.map(function (r) {
            return { id: r.id, name: r.name, avatar: r.avatar, color: r.color, points: r.points, correct: r.correct, bestStreak: 0, fastest: r.fastest };
          }),
          winnerId: results[0] ? results[0].id : null,
          fastest: fastest
        });
      });
    }

    nextPlayer();
  }

  /* ---------- Quick Tap: online room ----------
     Every device plays its own player in every round. Rounds settle once
     everyone has tapped (or false-started, or missed); every device then
     shows the same standings and auto-advances after the same pause. */
  function startQuickTapOnline(api, rounds, bonus, difficulty) {
    var room = FF.Room.current();
    var meId = room ? room.uid : null;

    function racers() {
      var inGame = FF.Race.playersInGame ? FF.Race.playersInGame() : FF.Room.racePlayers();
      return inGame.map(function (p) {
        return { id: p.uid, name: p.name, avatar: p.avatar, photo: p.photo, color: p.color, me: p.uid === meId };
      }).sort(function (a, b) { return a.me ? -1 : b.me ? 1 : 0; });
    }
    var me = racers().filter(function (p) { return p.me; })[0] || { id: meId, name: t('you', 'You'), me: true };

    FF.Race.begin(api.def.id, {
      rounds: rounds,
      mode: 'ranked',
      timerMs: QT.ONLINE_TIMER_MS,
      pointsFor: function (answer, place) { return QT.placePoints(place || 1, bonus); }
    });

    var n = 0;
    var arena = null;
    var offRounds = null;
    var cancelOpen = null;
    var myTimes = [];
    var prevScores = {};
    var finished = false;

    var offSettle = FF.Race.onSettle(function () {
      stopRound();
      if (FF.Race.catchingUp && FF.Race.catchingUp()) { n++; round(); return; }
      FF.Race.syncScoring();
      api.shell.updateScores();
      // Let the last lanes land before the standings take over.
      setTimeout(standings, 900);
    });

    function stopRound() {
      if (offRounds) { offRounds(); offRounds = null; }
      if (cancelOpen) { cancelOpen(); cancelOpen = null; }
    }

    function roundNode(i) {
      var r = FF.Room.current();
      return (r && r.rounds && r.rounds[i]) || {};
    }

    function round() {
      if (finished) return;
      if (n >= rounds || (n > 0 && FF.Race.over(n))) { finish(); return; }
      FF.Race.beginRound(n);
      // Drawn straight after beginRound seeds the round: the same on every device.
      var schedule = QT.schedule(difficulty, FF._rand);
      FF.Race.describe({ kind: 'card', text: t('qtWatch', 'Tap the moment the screen turns green') }, null);
      var best = bestFor(me.id, difficulty);
      var thisRound = n;
      if (arena) arena.destroy();
      arena = runArena(api, {
        player: me, n: n, total: rounds, difficulty: difficulty, best: best,
        history: myTimes, schedule: schedule, racing: true, lanes: racers()
      }, function (res) {
        myTimes[thisRound] = res.ms;
        if (res.ms != null && (best == null || res.ms < best)) saveBest(me.id, difficulty, res.ms);
        // The time recorded is this device's own reaction time, so network
        // delay never decides who was fastest.
        FF.Race.submit(null, res.ms != null, res.ms, { kind: res.kind });
      });
      offRounds = FF.Room.on('rounds', function (all) {
        var node = (all || {})[thisRound];
        if (node && arena) arena.lanes(node.answers);
      });
      cancelOpen = FF.Race.whenOpen(function () {
        if (arena) arena.open(FF.Race.msSinceOpen() || 0);
      });
    }

    function standings() {
      if (finished) return;
      if (arena) { arena.destroy(); arena = null; }
      var scores = FF.Race.scores();
      var node = roundNode(n);
      var places = FF.RaceRules.placesOf(node);
      var placeOf = {};
      places.forEach(function (e) { placeOf[e.uid] = e.place; });
      var answers = node.answers || {};
      var people = racers();
      var before = people.slice().sort(function (a, b) { return (prevScores[b.id] || 0) - (prevScores[a.id] || 0); }).map(function (p) { return p.id; });
      var order = people.slice().sort(function (a, b) { return (scores[b.id] || 0) - (scores[a.id] || 0); });
      var winner = places.length ? people.filter(function (p) { return p.id === places[0].uid; })[0] : null;

      var root = api.shell.root;
      api.ui.clear(root);
      var wrap = api.ui.div('qt-screen');
      wrap.appendChild(api.ui.el('p', { class: 'qt-lead' }, FF.GameLength.roundText(n + 1, rounds)));
      var title = winner ? (winner.me ? t('qtYouTookIt', 'You took it!') : t('qtWasFastest', '{name} was fastest', { name: winner.name })) : t('qtAllJumped', 'Everyone jumped the gun');
      wrap.appendChild(api.ui.el('h2', { class: 'qt-title', role: 'status' }, title));
      if (winner && winner.me) {
        api.audio.play('correct');
        if (!reduceMotion() && FF.Confetti) FF.Confetti.burst(80);
      } else {
        api.audio.play('roundEnd');
      }

      var list = api.ui.div('qt-standings');
      order.forEach(function (p, i) {
        var moved = n > 0 ? before.indexOf(p.id) - i : 0;
        var a = answers[p.id];
        var ms = a && a.correct === true && a.ms != null ? a.ms : null;
        var gain = (scores[p.id] || 0) - (prevScores[p.id] || 0);
        var row = api.ui.div('qt-row' + (p.me ? ' qt-row--me' : ''));
        row.appendChild(api.ui.span('qt-row__rank', String(i + 1)));
        row.appendChild(FF.Players.avatarEl(p, 'qt-row__ava'));
        var who = api.ui.span('qt-row__who');
        var name = api.ui.span('qt-row__name', p.me ? t('you', 'You') : p.name);
        if (moved > 0) name.appendChild(api.ui.span('qt-row__up', t('qtMovedUp', 'up {n}', { n: moved })));
        who.appendChild(name);
        who.appendChild(api.ui.span('qt-row__time', ms == null ? noTimeText(a ? a.kind : 'miss') : msText(ms)));
        row.appendChild(who);
        var place = placeOf[p.id];
        if (place && place <= 3) row.appendChild(api.ui.el('span', { class: 'qt-medal', dataset: { place: String(place) } }, String(place)));
        var pts = api.ui.span('qt-row__pts', FF.util.formatNumber(scores[p.id] || 0));
        pts.appendChild(api.ui.span('qt-row__gain', '+' + FF.util.formatNumber(gain)));
        row.appendChild(pts);
        // Rows slide from last round's position to this one (computed geometry).
        if (moved !== 0 && !reduceMotion()) {
          row.style.transform = 'translateY(' + (-moved * 100) + '%)';
          setTimeout(function () { row.style.transform = ''; }, 40);
        }
        list.appendChild(row);
      });
      wrap.appendChild(list);
      prevScores = scores;

      var last = n >= rounds - 1 || FF.Race.isLastRound(n, rounds);
      // A fixed pause in a room, so every device starts the next round together.
      wrap.appendChild(FF.Advance.button(last ? t('qtPodium', 'See the podium') : t('qtNextRound', 'Next round'), function () {
        api.audio.play('select');
        n++;
        round();
      }, { class: 'btn-lg', ms: 5000 }));
      root.appendChild(wrap);
    }

    function finish() {
      if (finished) return;
      finished = true;
      stopRound();
      if (arena) { arena.destroy(); arena = null; }
      var scores = FF.Race.scores();
      var all = (FF.Room.current() && FF.Room.current().rounds) || {};
      var entries = racers().map(function (p) {
        var times = [];
        for (var i = 0; i < n; i++) {
          var a = ((all[i] || {}).answers || {})[p.id];
          times.push(a && a.correct === true && a.ms != null ? a.ms : null);
        }
        return { id: p.id, name: p.name, avatar: p.avatar, photo: p.photo, color: p.color, me: p.me, points: scores[p.id] || 0, times: times };
      });
      FF.Race.syncScoring();
      if (offSettle) { offSettle(); offSettle = null; }
      FF.Race.end();
      finalScreen(api, entries, { points: true, racing: true }, function () {
        var res = api.scoring.results();
        var fastest = null;
        entries.forEach(function (e) {
          var st = QT.stats(e.times);
          if (st.best != null && (fastest == null || st.best < fastest)) fastest = st.best;
        });
        api.end({ results: res.results, winnerId: res.winnerId, fastest: fastest == null ? null : fastest / 1000 });
      });
    }

    round();
  }

  /* ================= Game 2: Color Reaction ================= */

  var STROOP_COLORS = [
    { name: 'Red', css: '#ef4444' },
    { name: 'Blue', css: '#3b82f6' },
    { name: 'Green', css: '#22c55e' },
    { name: 'Yellow', css: '#eab308' }
  ];

  registerGame({
    id: 'colorReaction',
    name: 'Color Reaction',
    description: 'A tricky colour challenge — name the ink, not the word.',
    category: 'reaction',
    icon: '🌈',
    players: [1, 8],
    difficulty: 'Normal',
    duration: 4,
    tags: ['quick', 'brain'],
    modes: ['turn', 'solo'],
    defaultMode: 'turn',
    howToPlay: [
      'A colour word appears on screen (like RED).',
      'The word is drawn in a different colour of ink.',
      'Tap the button that matches the INK colour, not the word.',
      'Quick answers earn a speed bonus!'
    ],
    start: function (api) { startColorReaction(api); }
  });

  function startColorReaction(api) {

    var scorers = api.config.scorers;
    if (!scorers || !scorers.length) {
      renderMissing(api, 'Add at least one player to play Color Reaction.');
      return;
    }

    var difficulty = api.config.difficulty || 'normal';
    var bonus = difficultyBonus(difficulty);
    var roundsPerPlayer = FF.GameLength.rounds(api, 8, 0);

    // Difficulty tuning: easy = 50% conflicting, normal = mostly
    // conflicting, hard = always conflicting + a shorter timer.
    var conflictChance = difficulty === 'easy' ? 0.5 : (difficulty === 'hard' ? 1 : 0.75);
    var timeLimitMs = difficulty === 'hard' ? 1600 : (difficulty === 'normal' ? 3200 : 4500);
    var fastMs = difficulty === 'hard' ? 1200 : 1500;

    var players = scorers.slice();
    if (api.config.randomOrder) players = api.util.shuffle(players);

    // ---- Race support. Offline this is all inert. ----
    var racing = !!(FF.Race && FF.Race.active && FF.Race.active());

    if (racing) {
      // Everyone answers the same colour at the same moment on their own
      // device, so this device plays only its own player.
      var me = FF.Room.current();
      var mine = players.filter(function (p) { return p.id === me.uid; });
      players = mine.length ? mine : players.slice(0, 1);

      FF.Race.begin(api.def.id, {
        rounds: roundsPerPlayer,
        timerMs: timeLimitMs,
        // Quickest correct answer wins, not the first write to arrive.
        mode: 'fastest',
        pointsFor: function (answer) {
          var speed = (answer.ms != null && answer.ms <= fastMs) ? 50 : 0;
          return Math.round(100 * bonus) + speed;
        }
      });
    }

    var stats = {};
    players.forEach(function (p) {
      stats[p.id] = { correct: 0, wrong: 0, streak: 0, bestStreak: 0, fastestMs: null };
    });

    var index = 0;

    function statRow(label, value) {
      var r = api.ui.div('rt-stat rt-stat--row');
      r.appendChild(api.ui.span('rt-stat__label', label));
      r.appendChild(api.ui.span('rt-stat__value', value));
      return r;
    }

    function next() {
      if (index >= players.length) { finish(); return; }
      var player = players[index];
      index++;
      // In a room every player has their own device - no hand-off needed.
      if (racing) { runRounds(player, 0); return; }
      intro(player);
    }

    function intro(player) {
      var root = api.shell.root;
      api.ui.clear(root);
      var wrap = api.ui.div('rt-wrap');
      wrap.appendChild(FF.Players.avatarEl(player, 'rt-avatar'));
      wrap.appendChild(api.ui.el('h2', { class: 'rt-name' }, player.name));
      wrap.appendChild(api.ui.div('rt-hint', players.length > 1 ? 'Pass the device to ' + player.name + '.' : 'Ready when you are.'));
      wrap.appendChild(api.ui.div('rt-hint', roundsPerPlayer + ' rounds — answer the colour of the INK, not the word.'));
      var startBtn = FF.UI.button('Start', { icon: 'play',  primary: true, class: 'btn-lg', onClick: function () {
        api.audio.play('roundStart');
        runRounds(player, 0);
      } });
      wrap.appendChild(startBtn);
      root.appendChild(wrap);
      focusSafe(startBtn);
    }

    function runRounds(player, roundNumber) {
      if (roundNumber >= roundsPerPlayer || (racing && roundNumber > 0 && FF.Race.timeUp())) { finalize(player); return; }
      // Seed the round so every device gets the same word and ink colour.
      if (racing) FF.Race.beginRound(roundNumber);
      runRound(player, roundNumber, function () { runRounds(player, roundNumber + 1); });
    }

    function makeRound() {
      var word = STROOP_COLORS[api.util.int(0, STROOP_COLORS.length - 1)];
      var ink;
      if (FF._rand() < conflictChance) {
        var others = STROOP_COLORS.filter(function (c) { return c.name !== word.name; });
        ink = api.util.pick(others);
      } else {
        ink = word;
      }
      return { word: word, ink: ink };
    }

    function runRound(player, roundNumber, onDone) {
      var round = makeRound();
      var resolved = false;
      var timer = null;
      var startedAt = Date.now();

      var root = api.shell.root;
      api.ui.clear(root);

      var wrap = api.ui.div('rt-wrap');
      var who = api.ui.div('cr-who', [FF.Players.avatarEl(player, 'who-ava'), player.name + ' · ' + FF.GameLength.roundText(roundNumber + 1, roundsPerPlayer)]);
      var word = api.ui.div('cr-word', round.word.name);
      word.style.color = round.ink.css;
      var question = api.ui.div('cr-question', 'What colour is the text?');
      if (racing) {
        // For people watching: the word and the colour names (the right one shows after the round).
        FF.Race.describe({
          kind: 'choice',
          text: FF.t('crWatch', 'The word {word} is written in a colour. What colour is the text?', { word: round.word.name }),
          options: STROOP_COLORS.map(function (c) { return c.name; })
        }, STROOP_COLORS.indexOf(round.ink));
      }

      var options = api.ui.div('cr-options');
      var buttons = [];
      STROOP_COLORS.forEach(function (c) {
        var btn = api.ui.el('button', {
          class: 'cr-btn',
          ariaLabel: c.name,
          onclick: function () { answer(c); }
        });
        btn.appendChild(api.ui.el('span', { class: 'cr-swatch', style: { background: c.css } }, ''));
        btn.appendChild(api.ui.span('cr-label', c.name));
        options.appendChild(btn);
        buttons.push(btn);
      });

      var bar = api.ui.div('cr-bar');
      var barFill = api.ui.div('cr-bar__fill');
      bar.appendChild(barFill);

      var feedback = api.ui.div('cr-feedback', '');

      wrap.appendChild(who);
      wrap.appendChild(word);
      wrap.appendChild(question);
      wrap.appendChild(options);
      wrap.appendChild(bar);
      wrap.appendChild(feedback);
      root.appendChild(wrap);
      focusSafe(buttons[0]);

      var limitSec = timeLimitMs / 1000;


      function resolve(correct, elapsedMs, msgOverride) {
        if (resolved) return;
        resolved = true;
        if (timer) timer.stop();
        var s = stats[player.id];
        if (correct) {
          s.correct++;
          s.streak++;
          if (s.streak > s.bestStreak) s.bestStreak = s.streak;
          if (s.fastestMs == null || elapsedMs < s.fastestMs) s.fastestMs = elapsedMs;
          var speed = elapsedMs <= fastMs ? 50 : 0;
          var pts = Math.round(100 * bonus) + speed;
          api.scoring.add(player.id, pts, { correct: true, fastest: elapsedMs });
          feedback.textContent = 'Correct! +' + pts + (speed ? ' ⚡fast!' : '');
          feedback.className = 'cr-feedback good';
          api.audio.play('correct');
        } else {
          s.wrong++;
          s.streak = 0;
          api.scoring.add(player.id, 0, { wrong: true });
          api.scoring.resetStreak(player.id);
          feedback.textContent = msgOverride || ('Wrong — the text is ' + round.ink.name + '.');
          feedback.className = 'cr-feedback bad';
          api.audio.play('wrong');
        }
        reveal();
        api.shell.updateScores(player.id);
        setTimeout(onDone, 1100);
      }

      function reveal() {
        buttons.forEach(function (b, i) {
          b.disabled = true;
          if (STROOP_COLORS[i].name === round.ink.name) b.classList.add('correct');
        });
      }

      function answer(picked) {
        if (resolved) return;
        var elapsed = Date.now() - startedAt;
        var correct = picked.name === round.ink.name;
        if (racing) { var shared = FF.Race.msSinceOpen(); FF.Race.submit(null, correct, shared != null ? shared : elapsed); }
        resolve(correct, elapsed);
      }

      timer = api.timer.create({
        onTick: function (remaining) {
          var pct = Math.max(0, Math.min(100, (remaining / limitSec) * 100));
          barFill.style.width = pct + '%';
        },
        onFinish: function () {
          if (resolved) return;
          if (racing) FF.Race.submit(null, false, null);
          resolve(false, timeLimitMs, 'Too slow! The text was ' + round.ink.name + '.');
        }
      });
      // Hold every device until the round's shared open instant, and only
      // start the clock then - otherwise time would tick away while the
      // options were still disabled.
      if (racing) {
        FF.RaceUI.gate(root, 'button', function () {
          startedAt = Date.now();
          timer.start(limitSec);
        });
      } else {
        timer.start(limitSec);
      }
    }

    function finalize(player) {
      var s = stats[player.id];
      api.shell.updateScores(player.id);

      var root = api.shell.root;
      api.ui.clear(root);
      var wrap = api.ui.div('rt-wrap');
      wrap.appendChild(FF.Players.avatarEl(player, 'rt-avatar'));
      wrap.appendChild(api.ui.el('h2', { class: 'rt-name' }, player.name));

      var list = api.ui.div('rt-stats');
      list.appendChild(statRow('Correct', s.correct + ' / ' + roundsPerPlayer));
      list.appendChild(statRow('Wrong', s.wrong));
      list.appendChild(statRow('Best streak', s.bestStreak));
      list.appendChild(statRow('Fastest', s.fastestMs == null ? '—' : (s.fastestMs / 1000).toFixed(3) + ' s'));
      list.appendChild(statRow('Points', api.util.formatNumber(api.scoring.get(player.id))));
      wrap.appendChild(list);

      var isLast = index >= players.length;
      var nextBtn = FF.Advance.button(isLast ? FF.t('seeResults', 'See results') : FF.t('next', 'Next'), function () {
        api.audio.play('select');
        next();
      }, { class: 'btn-lg' });
      wrap.appendChild(nextBtn);
      root.appendChild(wrap);
      focusSafe(nextBtn);
    }

    function finish() {
      if (racing) FF.Race.end();
      var results = players.slice().map(function (p) {
        var s = stats[p.id];
        return {
          id: p.id, name: p.name, avatar: p.avatar, color: p.color,
          points: api.scoring.get(p.id),
          correct: s.correct, wrong: s.wrong,
          bestStreak: s.bestStreak,
          fastest: s.fastestMs
        };
      }).sort(function (a, b) { return b.points - a.points; });

      var winner = results[0];
      var bestStreak = 0;
      var fastestMs = null;
      results.forEach(function (r) {
        if (r.bestStreak > bestStreak) bestStreak = r.bestStreak;
        if (r.fastest != null && (fastestMs == null || r.fastest < fastestMs)) fastestMs = r.fastest;
      });

      api.end({
        results: results,
        winnerId: winner ? winner.id : null,
        bestStreak: bestStreak,
        fastest: fastestMs == null ? null : fastestMs / 1000
      });
    }

    next();
  }
})();
