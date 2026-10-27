/* ============================================================
   PLAYMONA — net/parallel.js
   Parallel challenges in an online room. Every phone gets the
   same puzzle at the same instant, plays it alone and banks its
   own score (FF.Race 'parallel' mode). While a round runs each
   phone sees who has finished; between rounds the whole room
   sees one standings screen, and a podium at the end.

   A game supplies only its puzzle:

     FF.Parallel.run(api, {
       rounds: 3,                  // the usual count (the room's settings win)
       seconds: 90,                // each round's clock, or function (n)
       gate: '.my-btn',            // controls held until the round opens
       play: function (n, ctx) {   // build round n into api.shell.root NOW:
         ...                       // the random numbers are seeded for it
         return { start: fn,       // runs at the shared open instant
                  stop: fn };      // the clock ran out: freeze, return the result so far
       },                          // call ctx.done({ value, ...stats }) on finishing
       describe: function (n) { return { kind: 'card', text: '...' }; },
       detail: function (answer) { return '8 moves'; }   // one line per player
     });
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  // The room waits this long past a round's clock, so the last phone's
  // score lands before the round closes for everyone.
  var GRACE_SECS = 4;
  var STANDINGS_MS = 6000;
  var PODIUM_MS = 8000;
  // Fields the race itself keeps on every answer; a game's stats never replace them.
  var RESERVED = { choice: true, correct: true, ms: true, out: true };

  /* A game's result as it is stored: whole numbers, flags and short text,
     with value never below zero. */
  function cleanResult(result, outOfTime) {
    result = result || {};
    var record = {};
    Object.keys(result).forEach(function (k) {
      if (RESERVED[k]) return;
      var v = result[k];
      if (typeof v === 'number' && isFinite(v)) record[k] = Math.round(v);
      else if (typeof v === 'boolean') record[k] = v;
      else if (typeof v === 'string') record[k] = v.slice(0, 40);
    });
    record.value = Math.max(0, Math.round(Number(result.value) || 0));
    if (outOfTime) record.out = true;
    return record;
  }

  function t(key, fallback, vars) { return FF.t(key, fallback, vars); }

  function reduceMotion() {
    if (FF.Settings && typeof FF.Settings.get === 'function' && FF.Settings.get('reduceMotion')) return true;
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* Points for finishing early: all of max at 0 ms, none at the limit. */
  function speedBonus(ms, limitMs, max) {
    if (ms == null || !limitMs || limitMs <= 0) return 0;
    var left = 1 - ms / limitMs;
    return Math.round(max * Math.max(0, Math.min(1, left)));
  }

  /* Everyone in a round and where they are: finished (with what they
     scored) or still playing. Finished first, best score first. */
  function progress(answers, players, meId) {
    answers = answers || {};
    var rows = (players || []).map(function (p) {
      var a = answers[p.uid] || null;
      return {
        uid: p.uid, id: p.uid, name: p.name, avatar: p.avatar, photo: p.photo, color: p.color,
        me: p.uid === meId,
        done: !!a,
        value: a ? (typeof a.value === 'number' ? a.value : 0) : null,
        answer: a
      };
    });
    rows.sort(function (a, b) {
      if (a.done !== b.done) return a.done ? -1 : 1;
      if (a.done && b.value !== a.value) return b.value - a.value;
      if (a.me !== b.me) return a.me ? -1 : 1;
      return a.uid < b.uid ? -1 : 1;
    });
    return rows;
  }

  function secs(ms) {
    var s = Math.max(0, Math.round((ms || 0) / 1000));
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }

  function run(api, opts) {
    var room = FF.Room.current();
    var meId = room ? room.uid : null;
    var root = api.shell.root;
    var flow = FF.GameFlow ? FF.GameFlow.current : null;
    var total = FF.Race.plan(opts.rounds || 1, opts.available || 0);

    function secondsFor(i) {
      return typeof opts.seconds === 'function' ? opts.seconds(i) : (opts.seconds || 60);
    }
    var longest = 0;
    for (var i = 0; i < Math.min(total, 30); i++) longest = Math.max(longest, secondsFor(i));

    FF.Race.begin(api.def.id, {
      rounds: total,
      mode: 'parallel',
      timerMs: (longest + GRACE_SECS) * 1000,
      pointsFor: function (answer) { return answer.value || 0; }
    });

    var n = 0;
    var handle = null;
    var sent = false;
    var over = false;
    var offRounds = null;
    var cancelGate = null;
    var strip = null;        // the live chips while playing
    var waitList = null;     // the full list while waiting
    var prevOrder = [];

    function alive() { return !over && (!FF.GameFlow || !flow || FF.GameFlow.current === flow); }

    function roundNode(i) {
      var r = FF.Room.current();
      return (r && r.rounds && r.rounds[i]) || {};
    }

    /* Players in this game: here now, or already holding points. */
    function people(answers) {
      var inGame = {};
      FF.Race.playersInGame().forEach(function (p) { inGame[p.uid] = true; });
      var scores = FF.Race.scores();
      return FF.Room.racePlayers().filter(function (p) {
        return inGame[p.uid] || scores[p.uid] || (answers && answers[p.uid]) || p.uid === meId;
      });
    }

    function me() {
      var mine = FF.Room.racePlayers().filter(function (p) { return p.uid === meId; })[0];
      return mine
        ? { id: mine.uid, name: mine.name, avatar: mine.avatar, photo: mine.photo, color: mine.color }
        : { id: meId, name: t('you', 'You') };
    }

    function detailOf(answer) {
      if (!answer) return t('ppStillPlaying', 'Still playing');
      var text = opts.detail ? opts.detail(answer) : '';
      if (answer.out) text = text ? t('ppOutOfTime', 'Out of time') + ' · ' + text : t('ppOutOfTime', 'Out of time');
      return text || t('ppFinished', 'Finished');
    }

    var offSettle = FF.Race.onSettle(function () {
      if (!alive()) return;
      stopRound();
      if (FF.Race.catchingUp && FF.Race.catchingUp()) { n++; round(); return; }
      FF.Race.syncScoring();
      api.shell.updateScores();
      // A beat so the last score to arrive shows before the screen changes.
      setTimeout(function () { if (alive()) standings(); }, 700);
    });

    /* ---------- live progress ---------- */

    function renderLive(answers) {
      var rows = progress(answers, people(answers), meId);
      if (strip) {
        FF.ui.clear(strip);
        rows.forEach(function (p) {
          if (p.me) return;
          var chip = FF.ui.div('pp-chip' + (p.done ? ' is-done' : ''));
          chip.appendChild(FF.Players.avatarEl(p, 'pp-chip__ava'));
          chip.appendChild(FF.ui.span('pp-chip__name', p.name));
          var state = FF.ui.span('pp-chip__state');
          if (p.done) {
            state.appendChild(FF.Icons.icon('check'));
            state.appendChild(document.createTextNode(FF.util.formatNumber(p.value)));
          } else {
            state.textContent = t('ppPlaying', 'playing');
          }
          chip.appendChild(state);
          strip.appendChild(chip);
        });
        strip.classList.toggle('hidden', !strip.children.length);
      }
      if (waitList) {
        FF.ui.clear(waitList);
        rows.forEach(function (p) { waitList.appendChild(row(p, { status: true })); });
      }
      // The header chips follow the banked scores as players finish.
      FF.Race.syncScoring();
      api.shell.updateScores();
    }

    function row(p, o) {
      var r = FF.ui.div('pp-row' + (p.me ? ' pp-row--me' : '') + (o.status && !p.done ? ' is-playing' : ''));
      if (o.rank) r.appendChild(FF.ui.span('pp-row__rank', String(o.rank)));
      r.appendChild(FF.Players.avatarEl(p, 'pp-row__ava'));
      var who = FF.ui.span('pp-row__who');
      var name = FF.ui.span('pp-row__name', p.me ? t('you', 'You') : p.name);
      if (o.moved > 0) name.appendChild(FF.ui.span('pp-row__up', t('qtMovedUp', 'up {n}', { n: o.moved })));
      who.appendChild(name);
      if (!o.plain) who.appendChild(FF.ui.span('pp-row__detail', detailOf(p.answer)));
      r.appendChild(who);
      if (o.status) {
        r.appendChild(FF.ui.span('pp-row__pts', p.done ? FF.util.formatNumber(p.value) : ''));
      } else {
        var pts = FF.ui.span('pp-row__pts', FF.util.formatNumber(o.points || 0));
        if (!o.plain) pts.appendChild(FF.ui.span('pp-row__gain', '+' + FF.util.formatNumber(o.gain || 0)));
        r.appendChild(pts);
      }
      return r;
    }

    /* ---------- one round ---------- */

    function round() {
      if (!alive()) return;
      if (n >= total || (n > 0 && FF.Race.over(n))) { podium(); return; }
      sent = false;
      waitList = null;
      strip = FF.ui.div('pp-live hidden');
      strip.setAttribute('aria-label', t('ppOthers', 'The other players'));
      var thisRound = n;
      var ctx = {
        n: n,
        total: total,
        me: me(),
        live: strip,
        roundText: FF.GameLength.roundText(n + 1, total),
        /* Time since the round opened on every phone, in ms. */
        elapsed: function () { return FF.Race.msSinceOpen() || 0; },
        limitMs: secondsFor(n) * 1000,
        done: function (result) { if (thisRound === n && alive()) finishMine(result, false); }
      };
      FF.ui.clear(root);
      FF.Race.beginRound(n);   // seeds this round's random numbers: the puzzle is drawn next
      handle = opts.play(n, ctx) || {};
      if (!strip.parentNode) root.insertBefore(strip, root.firstChild);
      if (opts.describe) FF.Race.describe(opts.describe(n), null);

      offRounds = FF.Room.on('rounds', function (all) {
        if (!alive()) return;
        var node = (all || {})[thisRound];
        renderLive(node ? node.answers : {});
      });
      renderLive(roundNode(n).answers);

      cancelGate = FF.RaceUI.gate(root, opts.gate || 'button', function () {
        cancelGate = null;
        if (!alive() || thisRound !== n) return;
        api.shell.setTimer(secondsFor(n), function () { timeUp(thisRound); });
        if (handle.start) handle.start();
      });
    }

    function timeUp(r) {
      if (r !== n || sent || !alive()) return;
      var part = handle && handle.stop ? handle.stop() : null;
      finishMine(part, true);
    }

    function finishMine(result, outOfTime) {
      if (sent) return;
      sent = true;
      api.shell.hideTimer();
      var record = cleanResult(result, outOfTime);
      var ms = FF.Race.msSinceOpen();
      FF.Race.submit(null, true, ms, record);
      // The stored answer carries its time as ms; show this one the same way.
      waiting(Object.assign({ ms: ms }, record), outOfTime);
    }

    function waiting(mine, outOfTime) {
      if (!alive()) return;
      FF.ui.clear(root);
      strip = null;
      var wrap = FF.ui.div('pp-screen');
      wrap.appendChild(FF.ui.el('p', { class: 'pp-lead' }, FF.GameLength.roundText(n + 1, total)));
      wrap.appendChild(FF.ui.el('h2', { class: 'pp-title', role: 'status' }, outOfTime ? t('timesUp', 'Time’s up!') : t('ppDone', 'Done!')));
      wrap.appendChild(FF.ui.div('pp-score', t('plusPoints', '+{n} points', { n: FF.util.formatNumber(mine.value) })));
      var line = opts.detail ? opts.detail(mine) : '';
      if (line) wrap.appendChild(FF.ui.el('p', { class: 'pp-detail' }, line));
      wrap.appendChild(FF.GameUI.feedback('info', t('ppWaiting', 'Waiting for the others to finish…')));
      waitList = FF.ui.div('pp-list');
      wrap.appendChild(waitList);
      root.appendChild(wrap);
      renderLive(roundNode(n).answers);
    }

    function stopRound() {
      if (cancelGate) { cancelGate(); cancelGate = null; }
      if (offRounds) { offRounds(); offRounds = null; }
      api.shell.hideTimer();
      // The round closed before this phone finished: bank what it has.
      if (!sent) {
        var part = handle && handle.stop ? handle.stop() : null;
        sent = true;
        FF.Race.submit(null, true, FF.Race.msSinceOpen(), cleanResult(part, true));
      }
      waitList = null;
      strip = null;
    }

    /* ---------- between rounds ---------- */

    function standings() {
      if (!alive()) return;
      var node = roundNode(n);
      var answers = node.answers || {};
      var scores = FF.Race.scores();
      var list = people(answers);
      var bestId = FF.RaceRules.bestOf(node);
      var best = list.filter(function (p) { return p.uid === bestId; })[0];
      var order = list.slice().sort(function (a, b) { return (scores[b.uid] || 0) - (scores[a.uid] || 0) || (a.uid < b.uid ? -1 : 1); });

      FF.ui.clear(root);
      var wrap = FF.ui.div('pp-screen');
      wrap.appendChild(FF.ui.el('p', { class: 'pp-lead' }, FF.GameLength.roundText(n + 1, total)));
      var title = best
        ? (best.uid === meId ? t('ppYouBest', 'You did best!') : t('ppNameBest', '{name} did best', { name: best.name }))
        : t('ppNobodyScored', 'Nobody scored that round');
      wrap.appendChild(FF.ui.el('h2', { class: 'pp-title', role: 'status' }, title));
      api.audio.play(best && best.uid === meId ? 'correct' : 'roundEnd');
      if (best && best.uid === meId && list.length > 1 && !reduceMotion() && FF.Confetti) FF.Confetti.burst(80);

      var board = FF.ui.div('pp-list');
      order.forEach(function (p, i) {
        var a = answers[p.uid] || null;
        var was = prevOrder.indexOf(p.uid);
        var moved = n > 0 && was !== -1 ? was - i : 0;
        var r = row({ uid: p.uid, name: p.name, avatar: p.avatar, photo: p.photo, color: p.color, me: p.uid === meId, done: !!a, answer: a },
          { rank: i + 1, points: scores[p.uid] || 0, gain: a && typeof a.value === 'number' ? a.value : 0, moved: moved });
        if (moved !== 0 && !reduceMotion()) {
          r.style.transform = 'translateY(' + (-moved * 100) + '%)';
          setTimeout(function () { r.style.transform = ''; }, 40);
        }
        board.appendChild(r);
      });
      wrap.appendChild(board);
      prevOrder = order.map(function (p) { return p.uid; });

      var last = n >= total - 1 || FF.Race.isLastRound(n, total);
      // A fixed pause, so every phone starts the next round together.
      wrap.appendChild(FF.Advance.button(last ? t('qtPodium', 'See the podium') : t('qtNextRound', 'Next round'), function () {
        api.audio.play('select');
        n++;
        if (last) podium(); else round();
      }, { class: 'btn-lg', ms: STANDINGS_MS }));
      root.appendChild(wrap);
    }

    /* ---------- the end ---------- */

    function podium() {
      if (over) return;
      stopRound();
      over = true;
      var scores = FF.Race.scores();
      var order = people(null).map(function (p) {
        return { id: p.uid, name: p.name, avatar: p.avatar, photo: p.photo, color: p.color, me: p.uid === meId, points: scores[p.uid] || 0 };
      }).sort(function (a, b) { return b.points - a.points || (a.id < b.id ? -1 : 1); });
      FF.Race.syncScoring();
      api.shell.updateScores();
      if (offSettle) { offSettle(); offSettle = null; }
      FF.Race.end();

      FF.ui.clear(root);
      var wrap = FF.ui.div('pp-screen pp-screen--final');
      var top = order[0];
      if (order.length > 1) {
        wrap.appendChild(FF.ui.el('h2', { class: 'pp-title', role: 'status' }, top.me ? t('qtChampionYou', 'You are the champion!') : t('qtChampion', '{name} wins!', { name: top.name })));
        var stand = FF.ui.div('pp-podium');
        [order[1], order[0], order[2]].forEach(function (p, k) {
          if (!p) return;
          var place = [2, 1, 3][k];
          var step = FF.ui.div('pp-step pp-step--' + place);
          step.appendChild(FF.Players.avatarEl(p, 'pp-step__ava'));
          step.appendChild(FF.ui.span('pp-step__name', p.me ? t('you', 'You') : p.name));
          var block = FF.ui.div('pp-step__block');
          block.appendChild(FF.ui.el('b', null, String(place)));
          block.appendChild(FF.ui.span('', FF.util.formatNumber(p.points)));
          step.appendChild(block);
          stand.appendChild(step);
        });
        wrap.appendChild(stand);
        setTimeout(function () {
          if (!wrap.isConnected) return;
          api.audio.play('winner');
          if (!reduceMotion() && FF.Confetti) FF.Confetti.rain(140);
        }, 900);
      } else {
        wrap.appendChild(FF.ui.el('p', { class: 'pp-lead' }, t('ppYourScore', 'Your score')));
        wrap.appendChild(FF.ui.el('h2', { class: 'pp-title' }, FF.util.formatNumber(top ? top.points : 0)));
      }
      var board = FF.ui.div('pp-list');
      order.forEach(function (p, i) {
        board.appendChild(row({ uid: p.id, name: p.name, avatar: p.avatar, photo: p.photo, color: p.color, me: p.me },
          { rank: i + 1, points: p.points, plain: true }));
      });
      wrap.appendChild(board);
      wrap.appendChild(FF.Advance.button(t('seeResults', 'See results'), function () {
        api.end({});
      }, { class: 'btn-lg', ms: PODIUM_MS }));
      root.appendChild(wrap);
    }

    round();
  }

  FF.Parallel = {
    GRACE_SECS: GRACE_SECS,
    /* True when the game should run as a parallel challenge (in a room). */
    active: function () { return !!(FF.Race && FF.Race.active && FF.Race.active()); },
    run: run,
    /* Seed the random numbers for something drawn once for the whole game
       (a deck to deal from), so every phone draws the same. */
    seed: function (api, key) {
      var r = FF.Room && FF.Room.current();
      FF.Random.seed(FF.Random.roundSeed((r && r.meta || {}).seed, api.def.id, key));
    },
    speedBonus: speedBonus,
    cleanResult: cleanResult,
    progress: progress,
    clock: secs
  };
})();
