/* ============================================================
   PLAYMONA — games/wordFlow.js
   WordFlow: players take turns adding one word each. Make
   sentences (each ends with a full stop) or make one story
   together. A sentence counts once it is finished and makes
   sense; every word in it is a point for whoever wrote it.

   Online only. The server runs every turn, both clocks, the
   judging and the score (js/wordflow/referee.js in the crew
   runner); this file only draws the room's public view and sends
   this player's words through FF.WordFlowClient.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.WordFlowRules;
  var C = FF.WordFlowClient;
  var NUDGE_MS = 8000;           // the server this late: ask the API to wake it
  var AUTO_SCORES_MS = 90000;    // the results screen moves on by itself after this
  var FRESH_MS = 2500;           // the newest word is highlighted this long

  function t(key, fallback, vars) { return FF.t ? FF.t(key, fallback, vars) : fallback; }
  function icon(key) { return FF.Icons.icon(key); }
  function clock(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    return s >= 60 ? Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2) : String(s);
  }
  function modeName(mode) { return mode === 'story' ? t('wfModeStory', 'Make a story') : t('wfModeSentences', 'Make sentences'); }

  /* ---------- lobby settings (js/net/roomUI.js draws them) ---------- */

  function opt(label, value) { return { label: label, value: value }; }

  var ROOM = {
    minPlayers: R.MIN_PLAYERS,
    defaults: { mode: 'sentences', gameSeconds: 180, turnSeconds: 20 },

    fields: function () {
      return [
        { key: 'mode', label: t('wfMode', 'How to play'), options: [opt(t('wfModeSentences', 'Make sentences'), 'sentences'), opt(t('wfModeStory', 'Make a story'), 'story')] },
        { key: 'gameSeconds', label: t('wfGameTime', 'Game length'), options: R.GAME_SECONDS.map(function (s) { return opt((s / 60) + ' min', s); }) },
        { key: 'turnSeconds', label: t('wfTurnTime', 'Time per word'), options: R.TURN_SECONDS.map(function (s) { return opt(s + 's', s); }) }
      ];
    },

    sanitize: function (s) { return R.sanitizeSettings(s); },

    summary: function (s) {
      s = R.sanitizeSettings(s);
      return [modeName(s.mode), t('wfNMin', '{n} min', { n: s.gameSeconds / 60 }), t('wfNSecWord', '{n}s per word', { n: s.turnSeconds })].join(' · ');
    },

    start: function (room, pick) { return FF.WordFlowApi.start(room, pick); },
    findPlayers: function (code, difficulty) { return FF.WordFlowApi.findPlayers(code, difficulty); }
  };

  /* ---------- offline: what it is and where to play ---------- */

  function showIntro(api) {
    var root = api.shell.root;
    api.shell.hideTimer();
    FF.ui.clear(root);
    var stage = FF.GameUI.stage({ center: true, className: 'wf wf-intro' });
    var badge = FF.ui.div('wf-intro__badge');
    badge.appendChild(icon('pencil'));
    stage.appendChild(badge);
    stage.appendChild(FF.GameUI.prompt(t('wfIntroTitle', 'One word each. One great sentence.'), 'xl'));
    stage.appendChild(FF.GameUI.sub(t('wfIntroSub', 'Take turns adding a single word. Finish a sentence with a full stop. If it makes sense, every word in it scores for whoever wrote it.')));
    var steps = FF.ui.el('ol', { class: 'wf-intro__steps' });
    [
      ['pencil', t('wfStep1', 'On your turn, add exactly one word.')],
      ['check', t('wfStep2', 'End a sentence with a full stop, like “dragon.”')],
      ['star', t('wfStep3', 'Sentences that make sense score a point per word.')],
      ['timer', t('wfStep4', 'When time runs out, the unfinished sentence does not count.')]
    ].forEach(function (s) {
      var li = FF.ui.el('li', { class: 'wf-intro__step' });
      li.appendChild(icon(s[0]));
      li.appendChild(FF.ui.span('', s[1]));
      steps.appendChild(li);
    });
    stage.appendChild(steps);
    stage.appendChild(FF.GameUI.note(t('wfIntroOnline', 'WordFlow is played online, with 2 to 12 players on their own phones. Make sentences, or make one story together.')));
    stage.appendChild(FF.GameUI.action(t('wfPlayOnline', 'Play online'), function () {
      FF.Audio.play('select');
      FF.GameFlow.exitToHome();
      if (FF.Nav && FF.Nav.go) FF.Nav.go('online');
    }, { icon: 'wifi' }));
    root.appendChild(stage);
    FF.Nav.focusFirst(root);
  }

  /* ---------- online ---------- */

  function play(api, room) {
    var root = api.shell.root;
    api.shell.setTitle(api.def.name);
    api.shell.hideTimer();
    if (FF.Words && FF.Words.load) { try { FF.Words.load(); } catch (e) { /* checking waits */ } }
    if (FF.Race && FF.Race.begin) FF.Race.begin(api.def.id, { rounds: 1, mode: 'parallel' });

    var pending = null;
    var ended = false;
    var nudged = {};
    var autoScores = null;
    var local = { draft: '', lastCmd: null, localError: null, statuses: {}, turnSeen: null, matchId: null };
    var client = C.create({ room: room, onChange: schedule });
    var ticker = setInterval(tick, 200);

    function expectedMatch() { return room.meta && room.meta.wfMatch; }
    function players() { return room.players || {}; }
    function nameOf(uid) { var p = players()[uid]; return (p && p.name) || t('wfPlayer', 'Player'); }

    function schedule() {
      if (pending) return;
      pending = setTimeout(function () { pending = null; render(); }, 0);
    }

    function cleanup() {
      if (ended) return;
      ended = true;
      clearInterval(ticker);
      if (pending) clearTimeout(pending);
      if (autoScores) clearTimeout(autoScores);
      client.stop();
      if (FF.Race && FF.Race.end) { try { FF.Race.end(); } catch (e) { /* not running */ } }
    }

    function finish() {
      if (ended) return;
      cleanup();
      api.end({});
    }

    function maybeNudge(key, due) {
      if (nudged[key] || !due) return;
      if (client.serverNow() - due < NUDGE_MS) return;
      nudged[key] = true;
      FF.WordFlowApi.nudge(room.code);
    }

    /* Sounds and spoken updates for what just changed: your turn, a sentence judged, time up. */
    function react(wf, v) {
      if (local.matchId !== wf.matchId) {
        local = { draft: '', lastCmd: null, localError: null, statuses: {}, turnSeen: null, matchId: wf.matchId, phase: wf.phase };
        wf.sentences.forEach(function (s) { local.statuses[s.id] = s.status; });
      }
      if (local.turnSeen !== wf.turnId) {
        local.turnSeen = wf.turnId;
        local.localError = null;
        if (v.myTurn) {
          FF.Audio.play('select');
          if (FF.UI.announce) FF.UI.announce(t('wfYourTurnSay', 'Your turn. Add one word.'));
        }
      }
      wf.sentences.forEach(function (s) {
        var was = local.statuses[s.id];
        if (was === s.status) return;
        local.statuses[s.id] = s.status;
        if (was !== 'checking' && was !== undefined) return;
        if (s.status === 'accepted') {
          FF.Audio.play('correct');
          FF.UI.toast(t('wfAccepted', 'Sentence accepted: +{n} words', { n: s.words.length }), { type: 'success' });
        } else if (s.status === 'rejected') {
          FF.Audio.play('wrong');
          FF.UI.toast(t('wfRejected', 'Sentence rejected: {why}', { why: C.reasonText(s.reason) }), { type: 'error' });
        }
      });
      if (local.phase !== wf.phase) {
        if ((wf.phase === 'judging' || wf.phase === 'ended') && local.phase === 'playing') {
          FF.Audio.play('roundEnd');
          if (FF.UI.announce) FF.UI.announce(t('wfTimeUpSay', 'Time is up.'));
        }
        local.phase = wf.phase;
        describe(wf);
      }
    }

    /* People watching see the text as it grows. */
    function describe(wf) {
      if (!FF.Race || !FF.Race.describe) return;
      var text = wf.phase === 'ended' ? t('wfTvEnded', 'Game over')
        : wf.phase === 'starting' ? t('wfTvStarting', 'WordFlow is about to start')
          : modeName(wf.mode) + ' · ' + t('wfTvSentences', '{n} sentences so far', { n: wf.sentences.filter(function (s) { return s.status === 'accepted'; }).length });
      FF.Race.describe({ kind: 'card', text: text }, null);
    }

    /* ---------- drawing ---------- */

    function render() {
      if (ended) return;
      if (!root.isConnected) { cleanup(); return; }
      var v = client.view();
      var wf = v.wf;
      var input = root.querySelector('#wf-word-input');
      if (input) local.draft = input.value;
      var hadFocus = input && document.activeElement === input;
      FF.ui.clear(root);

      if (!wf || (expectedMatch() && wf.matchId !== expectedMatch())) {
        root.appendChild(waiting(t('wfGettingReady', 'Getting the game ready…'), t('wfGettingReadySub', 'The game starts on every phone at the same time.')));
        maybeNudge('start', (room.meta && room.meta.startAt) || 0);
        return;
      }
      react(wf, v);

      var stage = FF.GameUI.stage({ wide: true, className: 'wf wf--' + wf.phase + ' wf--' + wf.mode });
      stage.appendChild(header(wf));
      stage.appendChild(seatStrip(wf, v));
      if (!v.seated) stage.appendChild(FF.GameUI.feedback('info', t('wfWatching', 'This game started without you. You can watch, and join the next one.')));

      if (wf.phase === 'ended') {
        endedScreen(stage, wf, v);
      } else {
        stage.appendChild(textPanel(wf));
        stage.appendChild(turnPanel(wf, v));
      }
      root.appendChild(stage);

      var again = root.querySelector('#wf-word-input');
      if (again) {
        again.value = local.draft || '';
        if (hadFocus || (v.myTurn && local.focusTurn !== wf.turnId)) {
          local.focusTurn = wf.turnId;
          try { again.focus({ preventScroll: true }); } catch (e) { /* gone */ }
        }
      }
      if (wf.phase === 'starting') maybeNudge('s', wf.startAt);
      else if (wf.phase === 'playing') maybeNudge('t' + wf.turnId, Math.min(wf.turnDeadline, wf.gameDeadline));
      else if (wf.phase === 'judging') maybeNudge('j', wf.wrapDeadline);
      tick();
    }

    function waiting(title, text) {
      var stage = FF.GameUI.stage({ center: true, className: 'wf wf-wait' });
      var spin = FF.ui.div('wf-wait__spin');
      spin.appendChild(icon('pencil'));
      stage.appendChild(spin);
      stage.appendChild(FF.GameUI.prompt(title, 'md'));
      if (text) stage.appendChild(FF.GameUI.sub(text));
      return stage;
    }

    function header(wf) {
      var head = FF.ui.el('header', { class: 'wf-head' });
      var left = FF.ui.div('wf-head__info');
      left.appendChild(FF.GameUI.kicker(modeName(wf.mode)));
      var title = wf.phase === 'starting' ? t('wfStarting', 'Get ready')
        : wf.phase === 'judging' ? t('wfJudging', 'Time’s up: checking the last sentences')
          : wf.phase === 'ended' ? t('wfEnded', 'Game over') : t('wfPlaying', 'Build it word by word');
      left.appendChild(FF.ui.el('h2', { class: 'wf-head__title' }, title));
      head.appendChild(left);
      if (wf.phase !== 'ended') {
        var timer = FF.ui.el('div', { class: 'wf-timer', role: 'timer', 'aria-label': t('wfGameClock', 'Game time left') });
        timer.appendChild(icon('timer'));
        timer.appendChild(FF.ui.span('wf-timer__text', ''));
        head.appendChild(timer);
        var bar = FF.GameUI.meter(1);
        bar.classList.add('wf-head__meter');
        head.appendChild(bar);
      }
      return head;
    }

    /* Everyone, in turn order, with their points; whoever is up is lit. */
    function seatStrip(wf, v) {
      var listEl = FF.ui.el('ol', { class: 'wf-seats', 'aria-label': t('wfTurnOrder', 'Turn order') });
      C.seats(wf, players()).forEach(function (s) {
        var on = wf.phase === 'playing' && wf.turnUid === s.uid;
        var li = FF.ui.el('li', { class: 'wf-seat' + (on ? ' wf-seat--turn' : '') + (s.uid === v.uid ? ' wf-seat--me' : '') + (s.online ? '' : ' wf-seat--away') });
        if (s.color) li.style.setProperty('--wf-c', s.color);
        if (on) li.setAttribute('aria-current', 'step');
        li.appendChild(FF.Players.avatarEl(s, 'wf-seat__ava'));
        li.appendChild(FF.ui.span('wf-seat__name', s.name + (s.uid === v.uid ? ' ' + t('youTag', '(you)') : '')));
        li.appendChild(FF.ui.span('wf-seat__pts', s.points === 1 ? t('wfPt', '1 pt') : t('wfPts', '{n} pts', { n: s.points })));
        listEl.appendChild(li);
      });
      return listEl;
    }

    function colorOf(uid) { var p = players()[uid]; return (p && p.color) || ''; }

    function wordEl(x, fresh) {
      var span = FF.ui.span('wf-word' + (fresh ? ' wf-word--new' : ''), x.w);
      var c = colorOf(x.uid);
      if (c) span.style.setProperty('--wf-c', c);
      span.title = nameOf(x.uid);
      return span;
    }

    function wordsInto(el, words, freshId) {
      words.forEach(function (x, i) {
        if (i) el.appendChild(document.createTextNode(' '));
        el.appendChild(wordEl(x, freshId != null && i === words.length - 1 && freshId));
      });
    }

    function isFresh(wf) {
      var last = wf.last;
      return !!(last && last.kind === 'word' && client.serverNow() - last.at < FRESH_MS);
    }

    function statusChip(s) {
      if (s.status === 'accepted') return FF.ui.span('wf-chip wf-chip--good', t('wfPlusN', '+{n}', { n: s.words.length }));
      if (s.status === 'rejected') return FF.ui.span('wf-chip wf-chip--bad', t('wfNoPoints', 'No points'));
      var chip = FF.ui.span('wf-chip wf-chip--wait');
      chip.appendChild(FF.ui.span('wf-chip__dot'));
      chip.appendChild(document.createTextNode(t('wfChecking', 'Checking…')));
      return chip;
    }

    /* The shared text: finished sentences above, the one being written below. */
    function textPanel(wf) {
      var panel = FF.ui.el('section', { class: 'wf-text', 'aria-label': t('wfSharedText', 'The shared text') });
      var done = wf.sentences;
      var fresh = isFresh(wf);
      if (!done.length && !wf.current.length) {
        panel.appendChild(FF.ui.el('p', { class: 'wf-text__empty' }, wf.mode === 'story'
          ? t('wfEmptyStory', 'The story starts with the first word. Once upon a…?')
          : t('wfEmptySentences', 'The first sentence starts with the first word.')));
      }
      if (done.length) {
        if (wf.mode === 'story') {
          var para = FF.ui.el('p', { class: 'wf-story' });
          done.forEach(function (s, i) {
            if (i) para.appendChild(document.createTextNode(' '));
            var part = FF.ui.span('wf-story__s wf-sent--' + s.status);
            wordsInto(part, s.words, null);
            para.appendChild(part);
            if (s.status !== 'accepted') { para.appendChild(document.createTextNode(' ')); para.appendChild(statusChip(s)); }
          });
          panel.appendChild(para);
          var bad = done.filter(function (s) { return s.status === 'rejected'; });
          if (bad.length) {
            var last = bad[bad.length - 1];
            panel.appendChild(FF.ui.el('p', { class: 'wf-why' }, t('wfLastRejected', 'Left out: {why}', { why: C.reasonText(last.reason) })));
          }
        } else {
          var ol = FF.ui.el('ol', { class: 'wf-sentences' });
          done.forEach(function (s) {
            var li = FF.ui.el('li', { class: 'wf-sent wf-sent--' + s.status });
            var line = FF.ui.span('wf-sent__text');
            wordsInto(line, s.words, null);
            li.appendChild(line);
            li.appendChild(statusChip(s));
            if (s.status === 'rejected') li.appendChild(FF.ui.el('p', { class: 'wf-why' }, C.reasonText(s.reason)));
            ol.appendChild(li);
          });
          panel.appendChild(ol);
        }
      }
      if (wf.phase !== 'ended') {
        var cur = FF.ui.el('div', { class: 'wf-current', 'aria-live': 'polite' });
        cur.appendChild(FF.ui.span('wf-current__label', t('wfNowWriting', 'Now writing')));
        var line2 = FF.ui.el('p', { class: 'wf-current__text' });
        if (wf.current.length) wordsInto(line2, wf.current, fresh ? true : null);
        if (wf.phase === 'playing') line2.appendChild(FF.ui.span('wf-caret'));
        else if (wf.phase === 'judging' && wf.unfinished.length) {
          var gone = FF.ui.span('wf-sent--discarded');
          wordsInto(gone, wf.unfinished, null);
          line2.appendChild(gone);
        }
        cur.appendChild(line2);
        if (wf.phase === 'judging' && wf.unfinished.length) cur.appendChild(FF.ui.el('p', { class: 'wf-why' }, t('wfUnfinished', 'Unfinished when time ran out, so it does not count.')));
        panel.appendChild(cur);
      }
      return panel;
    }

    /* Your turn: one word and a button. Not your turn: whose it is. */
    function turnPanel(wf, v) {
      var box = FF.ui.el('section', { class: 'wf-turn' + (v.myTurn ? ' wf-turn--me' : '') });
      if (wf.phase === 'starting') {
        box.appendChild(FF.ui.el('p', { class: 'wf-turn__label' }, t('wfStartsIn', 'Starting in')));
        box.appendChild(FF.ui.span('wf-turn__count', ''));
        var first = wf.order[0];
        box.appendChild(FF.GameUI.sub(first === v.uid ? t('wfYouFirst', 'You go first.') : t('wfGoesFirst', '{name} goes first.', { name: nameOf(first) })));
        return box;
      }
      if (wf.phase === 'judging') {
        box.appendChild(FF.GameUI.feedback('info', t('wfJudgingSub', 'No more words. The last sentences are being checked.')));
        return box;
      }
      var top = FF.ui.div('wf-turn__top');
      var who = v.myTurn ? t('wfYourTurn', 'Your turn') : t('wfTheirTurn', '{name}’s turn', { name: nameOf(wf.turnUid) });
      top.appendChild(FF.ui.el('h3', { class: 'wf-turn__who' }, who));
      var tt = FF.ui.el('span', { class: 'wf-turn__clock', role: 'timer', 'aria-label': t('wfTurnClock', 'Time left for this word') });
      top.appendChild(tt);
      box.appendChild(top);
      if (!v.myTurn) {
        var lastSkip = wf.last && wf.last.kind === 'skip' && client.serverNow() - wf.last.at < 4000;
        box.appendChild(FF.GameUI.sub(lastSkip
          ? t('wfSkipped', '{name} ran out of time, so the turn moved on.', { name: nameOf(wf.last.uid) })
          : t('wfWaitFor', 'Waiting for {name} to add a word…', { name: nameOf(wf.turnUid) })));
        return box;
      }
      var position = wf.current.length;
      var row = FF.GameUI.inputRow({
        placeholder: position === 0 ? t('wfFirstWord', 'Start a new sentence') : t('wfNextWord', 'Next word'),
        label: t('wfYourWord', 'Your word'), buttonLabel: t('wfAdd', 'Add'), buttonIcon: 'arrow-right', maxlength: R.MAX_INPUT,
        onSubmit: function (value) { submit(wf, value); }
      });
      row.input.id = 'wf-word-input';
      row.input.setAttribute('autocapitalize', position === 0 ? 'sentences' : 'off');
      row.input.addEventListener('input', function () { local.draft = row.input.value; });
      box.appendChild(row.row);
      var end = FF.UI.button(t('wfAddAndEnd', 'Add and end the sentence'), {
        class: 'btn-soft wf-turn__end', icon: 'check',
        onClick: function () {
          var val = String(row.input.value || '').replace(/[.,\s]+$/, '');
          submit(wf, val ? val + '.' : '');
        }
      });
      box.appendChild(end);
      box.appendChild(FF.GameUI.note(position >= R.MAX_WORDS - 1
        ? t('wfMustEnd', 'This sentence is long enough: end it with a full stop.')
        : t('wfTip', 'One word. A full stop (like “dragon.”) finishes the sentence.')));
      var fb = local.localError ? C.feedbackText(local.localError)
        : (v.feedback && v.feedback.id === local.lastCmd ? C.feedbackText(v.feedback.code) : null);
      if (fb) box.appendChild(FF.GameUI.feedback('bad', fb));
      return box;
    }

    function submit(wf, value) {
      // A quick check on the phone saves a round trip; the referee checks again and decides.
      var check = R.parseWord(value, {
        isWord: FF.Words && FF.Words.ready && FF.Words.ready() ? function (w) { return FF.Words.isWord(w); } : null,
        isQuiet: FF.Words && FF.Words.isQuiet ? function (w) { return FF.Words.isQuiet(w); } : null,
        position: wf.current.length
      });
      if (!check.ok) { local.localError = check.error; FF.Audio.play('wrong'); render(); return; }
      local.localError = null;
      FF.Audio.play('click');
      // Empty the box now: the turn moves on (and redraws) before the send settles.
      var box = root.querySelector('#wf-word-input');
      if (box) box.value = '';
      local.draft = '';
      client.send(String(value).trim()).then(function (id) {
        if (id) { local.lastCmd = id; schedule(); }
      }).catch(function () {
        var again = root.querySelector('#wf-word-input');
        if (again && !again.value) { again.value = value; local.draft = value; }
        FF.UI.toast(t('wfSendFailed', 'That did not reach the game. Check your connection.'), { type: 'error' });
      });
    }

    /* ---------- the end ---------- */

    function endedScreen(stage, wf, v) {
      var res = wf.result || {};
      var winners = res.winners || [];
      var seats = C.seats(wf, players());
      var banner = FF.ui.div('wf-win');
      banner.appendChild(icon('trophy'));
      var title = !winners.length ? t('wfNoWinner', 'No sentences counted this time')
        : winners.length > 1 ? t('wfTie', 'It’s a tie: {names}', { names: winners.map(nameOf).join(', ') })
          : winners[0] === v.uid ? t('wfYouWin', 'You win!') : t('wfWins', '{name} wins!', { name: nameOf(winners[0]) });
      banner.appendChild(FF.GameUI.prompt(title, 'xl'));
      var nWords = res.totalWords || 0;
      var nSent = res.accepted || 0;
      banner.appendChild(FF.GameUI.sub(t('wfTotals', '{words} in {sentences}.', {
        words: nWords === 1 ? t('wfOneValidWord', '1 valid word') : t('wfValidWords', '{n} valid words', { n: nWords }),
        sentences: nSent === 1 ? t('wfOneAccepted', '1 accepted sentence') : t('wfAccepted', '{n} accepted sentences', { n: nSent })
      })));
      stage.appendChild(banner);
      if (!local.cheered) { local.cheered = true; FF.Audio.play(winners.indexOf(v.uid) !== -1 ? 'streak' : 'roundEnd'); }

      // The final text: only what was accepted.
      var accepted = wf.sentences.filter(function (s) { return s.status === 'accepted'; });
      var final = FF.ui.el('section', { class: 'wf-final' });
      final.appendChild(FF.ui.el('h3', { class: 'wf-final__title' }, wf.mode === 'story' ? t('wfYourStory', 'Your story') : t('wfYourSentences', 'Your sentences')));
      if (!accepted.length) {
        final.appendChild(FF.ui.el('p', { class: 'wf-text__empty' }, t('wfNoneAccepted', 'No sentence was finished and accepted. Try shorter ones next time!')));
      } else if (wf.mode === 'story') {
        var p = FF.ui.el('p', { class: 'wf-story' });
        accepted.forEach(function (s, i) { if (i) p.appendChild(document.createTextNode(' ')); wordsInto(p, s.words, null); });
        final.appendChild(p);
      } else {
        var ol = FF.ui.el('ol', { class: 'wf-sentences' });
        accepted.forEach(function (s) {
          var li = FF.ui.el('li', { class: 'wf-sent wf-sent--accepted' });
          var line = FF.ui.span('wf-sent__text');
          wordsInto(line, s.words, null);
          li.appendChild(line);
          ol.appendChild(li);
        });
        final.appendChild(ol);
      }
      var parts = [];
      var rej = res.rejected || 0;
      if (rej) parts.push(rej === 1 ? t('wfLeftRejected1', '1 sentence that did not make sense') : t('wfLeftRejected', '{n} sentences that did not make sense', { n: rej }));
      if (res.unfinished) parts.push(res.unfinished === 1 ? t('wfLeftUnfinished1', 'the unfinished sentence (1 word)') : t('wfLeftUnfinished', 'the unfinished sentence ({n} words)', { n: res.unfinished }));
      if (parts.length) {
        final.appendChild(FF.GameUI.note(t('wfLeftOut', 'No points for {what}.', { what: parts.join(t('wfAnd', ' and ')) })));
      }
      stage.appendChild(final);

      // Each player's valid words and points, best first.
      var table = FF.ui.el('section', { class: 'wf-recap' });
      table.appendChild(FF.ui.el('h3', { class: 'wf-final__title' }, t('wfWhoWrote', 'Who wrote what')));
      var ul = FF.ui.el('ol', { class: 'wf-recap__list' });
      var order = (res.ranked || wf.order).slice();
      order.forEach(function (uid, i) {
        var s = seats.filter(function (x) { return x.uid === uid; })[0];
        if (!s) return;
        var sc = (res.score || {})[uid] || { points: 0, words: [] };
        var li = FF.ui.el('li', { class: 'wf-recap__row' + (uid === v.uid ? ' wf-recap__row--me' : '') + (winners.indexOf(uid) !== -1 ? ' wf-recap__row--win' : '') });
        if (s.color) li.style.setProperty('--wf-c', s.color);
        var top = FF.ui.div('wf-recap__top');
        top.appendChild(FF.ui.span('wf-recap__rank', String(i + 1)));
        top.appendChild(FF.Players.avatarEl(s, 'wf-recap__ava'));
        top.appendChild(FF.ui.span('wf-recap__name', s.name + (uid === v.uid ? ' ' + t('youTag', '(you)') : '')));
        top.appendChild(FF.ui.span('wf-recap__pts', sc.points === 1 ? t('wfOnePoint', '1 point') : t('wfNPoints', '{n} points', { n: sc.points })));
        li.appendChild(top);
        // As written (names keep their capitals), without the full stop or comma.
        var words = (sc.words || []).map(function (w) { return String(w).replace(/[.,]$/, ''); });
        li.appendChild(FF.ui.el('p', { class: 'wf-recap__words' }, words.length ? words.join(', ') : t('wfNoWords', 'No words in accepted sentences')));
        ul.appendChild(li);
      });
      table.appendChild(ul);
      stage.appendChild(table);

      stage.appendChild(FF.GameUI.action(t('wfSeeScores', 'See scores'), function () { FF.Audio.play('click'); finish(); }, { icon: 'trophy' }));
      if (!autoScores) autoScores = setTimeout(finish, AUTO_SCORES_MS);
    }

    /* ---------- the clocks ---------- */

    function tick() {
      if (ended) return;
      var wf = client.view().wf;
      if (!wf) return;
      var now = client.serverNow();
      var gameLeft = wf.phase === 'starting' ? wf.settings.gameSeconds * 1000
        : wf.phase === 'playing' ? wf.gameDeadline - now : 0;
      var text = root.querySelector('.wf-timer__text');
      if (text) {
        text.textContent = clock(gameLeft);
        text.parentNode.classList.toggle('wf-timer--warn', wf.phase === 'playing' && gameLeft <= 15000);
      }
      var meter = root.querySelector('.wf-head__meter');
      if (meter && meter.set) meter.set(Math.max(0, gameLeft) / (wf.settings.gameSeconds * 1000));
      var tc = root.querySelector('.wf-turn__clock');
      if (tc && wf.phase === 'playing') {
        var left = Math.max(0, Math.min(wf.turnDeadline, wf.gameDeadline) - now);
        tc.textContent = clock(left);
        tc.classList.toggle('wf-turn__clock--warn', left <= 5000);
      }
      var count = root.querySelector('.wf-turn__count');
      if (count && wf.phase === 'starting') count.textContent = clock(wf.startAt - now);
      var fresh = root.querySelector('.wf-word--new');
      if (fresh && !isFresh(wf)) fresh.classList.remove('wf-word--new');
    }

    render();
  }

  FF.registerGame({
    id: 'wordFlow',
    featured: true,
    name: 'WordFlow',
    description: 'Build sentences or a whole story together, one word each. Finish a sentence with a full stop: if it makes sense, every word scores for whoever wrote it.',
    category: 'words',
    icon: '✍️',
    coverFocus: 'center 46%',
    players: [R.MIN_PLAYERS, R.MAX_PLAYERS],
    difficulty: 'Easy',
    duration: 5,
    tags: ['words', 'party', 'story', 'creative', 'online'],
    modes: ['everyone'],
    defaultMode: 'everyone',
    howToPlay: [
      'Play in an online room with 2 to 12 players. The host picks Make sentences or Make a story.',
      'Players take turns. On your turn, add exactly one word before your time runs out.',
      'Put a full stop on a word (like “dragon.”) to finish the sentence.',
      'Each finished sentence is checked. If it makes sense (and, in a story, follows on), every word in it is a point for whoever wrote it.',
      'When the game clock runs out, the sentence still being written does not count. Most points wins.'
    ],
    room: ROOM,
    start: function (api) {
      var room = FF.Room && FF.Room.current();
      if (!api.config.room || !room) { showIntro(api); return; }
      play(api, room);
    }
  });
})();
