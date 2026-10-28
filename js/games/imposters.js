/* ============================================================
   PLAYMONA — games/imposters.js
   Imposters: most players share a secret, one or two get a
   different one, and nobody is told which side they are on.
   Give clues (Word Imposter) or stop a hidden clock (Number
   Imposter), talk it over, and vote someone out.

   Online only. The server deals the secrets and runs every phase
   (js/imposters/referee.js in the crew runner); this file only
   draws what the room's public view and this player's own secret
   say, and sends commands through FF.ImpostersClient.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.ImpostersRules;
  var C = FF.ImpostersClient;
  var NUDGE_MS = 8000;           // the server this late: ask the API to wake it
  var CLOCK_SHOWN_MS = 1000;     // Number Imposter shows the clock this long, then counts blind
  var AUTO_SCORES_MS = 90000;    // the results screen moves on by itself after this

  function t(key, fallback, vars) { return FF.t ? FF.t(key, fallback, vars) : fallback; }
  function icon(key) { return FF.Icons.icon(key); }
  function seconds(ms) { return (Math.round(ms / 10) / 100).toFixed(2); }
  function targetText(ms) { return t('impSeconds', '{n} seconds', { n: (ms / 1000).toFixed(1).replace(/\.0$/, '') }); }

  /* ---------- lobby settings (js/net/roomUI.js draws them) ---------- */

  function opt(label, value) { return { label: label, value: value }; }

  var ROOM = {
    minPlayers: R.MIN_PLAYERS,
    defaults: { mode: 'word', imposters: 1, rounds: 4, clueSeconds: 45, discussSeconds: 90 },

    fields: function (gs, ctx) {
      var n = ctx.players;
      var out = [{
        key: 'mode', label: t('impMode', 'Game'), redraw: true,
        options: [opt(t('impModeWord', 'Word Imposter'), 'word'), opt(t('impModeNumber', 'Number Imposter'), 'number')]
      }];
      if (R.canChoose(n)) {
        out.push({ key: 'imposters', label: t('impImposters', 'Imposters'), options: [opt('1', 1), opt('2', 2)] });
      } else {
        out.push({ note: n < R.MIN_PLAYERS
          ? t('impNeedThree', 'Imposters needs at least 3 players. The game will use 1 imposter.')
          : t('impOneFixed', 'With {n} players the game uses 1 imposter. With 6 or more you can choose 2.', { n: n }) });
      }
      out.push({ key: 'difficulty', label: t('difficulty', 'Difficulty'), options: [opt(t('easy', 'Easy'), 'easy'), opt(t('normal', 'Normal'), 'normal'), opt(t('hard', 'Hard'), 'hard')] });
      out.push({ key: 'rounds', label: t('impRounds', 'Rounds'), options: R.ROUNDS.map(function (r) { return opt(String(r), r); }) });
      if (gs.mode !== 'number') {
        out.push({ key: 'clueSeconds', label: t('impClueTime', 'Time for clues'), options: R.CLUE_SECONDS.map(function (s) { return opt(s + 's', s); }) });
      }
      out.push({ key: 'discussSeconds', label: t('impTalkTime', 'Time to talk'), options: R.DISCUSS_SECONDS.map(function (s) {
        return opt(s % 60 ? (s / 60).toFixed(1).replace('.5', '½') + 'm' : (s / 60) + 'm', s);
      }) });
      return out;
    },

    sanitize: function (s, n) { return R.sanitizeSettings(s, n); },

    summary: function (s, n) {
      s = R.sanitizeSettings(s, n);
      var parts = [
        s.mode === 'number' ? t('impModeNumber', 'Number Imposter') : t('impModeWord', 'Word Imposter'),
        s.imposters === 2 ? t('impTwoImposters', '2 imposters') : t('impOneImposter', '1 imposter'),
        t('impNRounds', '{n} rounds', { n: s.rounds })
      ];
      if (s.mode !== 'number') parts.push(t('impClueSecs', '{n}s for clues', { n: s.clueSeconds }));
      parts.push(t('impTalkSecs', '{n}s to talk', { n: s.discussSeconds }));
      return parts.join(' · ');
    },

    refitText: function (s, n) {
      return t('impRefit', 'Now {n} players: the game will use 1 imposter.', { n: n });
    },

    start: function (room, pick) { return FF.ImpostersApi.start(room, pick); },
    findPlayers: function (code, difficulty) { return FF.ImpostersApi.findPlayers(code, difficulty); }
  };

  /* ---------- offline: what it is and where to play ---------- */

  function showIntro(api) {
    var root = api.shell.root;
    api.shell.hideTimer();
    FF.ui.clear(root);
    var stage = FF.GameUI.stage({ center: true, className: 'imp imp-intro' });
    var badge = FF.ui.div('imp-intro__badge');
    badge.appendChild(icon('detective'));
    stage.appendChild(badge);
    stage.appendChild(FF.GameUI.prompt(t('impIntroTitle', 'Who got a different secret?'), 'xl'));
    stage.appendChild(FF.GameUI.sub(t('impIntroSub', 'Most players share a secret word or number. One or two get a different one, and nobody knows which side they are on, not even the imposters.')));
    var steps = FF.ui.el('ol', { class: 'imp-intro__steps' });
    [
      ['eye', t('impStep1', 'Look at your secret. Keep it to yourself.')],
      ['pencil', t('impStep2', 'Give a one-word clue, or stop the hidden clock on your target.')],
      ['chat', t('impStep3', 'Talk it over. Whose clue sounds off?')],
      ['megaphone', t('impStep4', 'Vote someone out. Catch every imposter to win.')]
    ].forEach(function (s) {
      var li = FF.ui.el('li', { class: 'imp-intro__step' });
      li.appendChild(icon(s[0]));
      li.appendChild(FF.ui.span('', s[1]));
      steps.appendChild(li);
    });
    stage.appendChild(steps);
    stage.appendChild(FF.GameUI.note(t('impIntroOnline', 'Imposters is played online, with 3 to 12 players on their own phones.')));
    stage.appendChild(FF.GameUI.action(t('impPlayOnline', 'Play online'), function () {
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
    if (FF.Words && FF.Words.load) { try { FF.Words.load(); } catch (e) { /* masking waits */ } }
    if (FF.Race && FF.Race.begin) FF.Race.begin(api.def.id, { rounds: 6, mode: 'parallel' });

    var local = {};
    var pending = null;
    var ended = false;
    var nudged = {};
    var autoScores = null;

    var client = C.create({ room: room, onChange: schedule });
    // Set before the chat starts: its first count can arrive while it is being made.
    var chatSheet = null;
    var chatCount = 0;
    var chatSeen = 0;
    var chat = FF.RoomChat.create({
      room: room,
      canSend: function () {
        var v = client.view();
        var ph = v.imp && v.imp.phase;
        return v.seated && v.alive && (ph === 'discuss' || ph === 'vote' || ph === 'elimination' || ph === 'ended');
      },
      closedText: t('impChatClosed', 'The chat opens when everyone has given their clues.'),
      onChange: function (n) { chatCount = n; if (chatSheet) chatSeen = n; updateChatButton(); }
    });
    var ticker = setInterval(tick, 200);

    function expectedMatch() { return room.meta && room.meta.impMatch; }
    function players() { return room.players || {}; }

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
      if (chatSheet) chatSheet.close();
      client.stop();
      chat.destroy();
      if (FF.Race && FF.Race.end) { try { FF.Race.end(); } catch (e) { /* not running */ } }
    }

    function finish() {
      if (ended) return;
      cleanup();
      api.end({});
    }

    /* Local, per-phase things (what you typed, who you picked) reset when the phase changes. */
    function phaseLocal(imp) {
      if (local.phaseId !== imp.phaseId || local.matchId !== imp.matchId) {
        local = { phaseId: imp.phaseId, matchId: imp.matchId, myClues: local.matchId === imp.matchId ? (local.myClues || []) : [] };
        describe(imp);
      }
      return local;
    }

    /* People watching see the phase and the clues, never a secret. */
    function describe(imp) {
      if (!FF.Race || !FF.Race.describe) return;
      var text;
      var left = C.aliveCount(imp);
      if (imp.phase === 'reveal') text = t('impTvReveal', 'Round {n}: everyone is looking at their secret', { n: imp.round });
      else if (imp.phase === 'clues') text = t('impTvClues', 'Round {n}: one-word clues · {left} players in', { n: imp.round, left: left });
      else if (imp.phase === 'challenge') text = t('impTvChallenge', 'Round {n}: stop the hidden clock · {left} players in', { n: imp.round, left: left });
      else if (imp.phase === 'discuss') text = t('impTvDiscuss', 'Round {n}: who sounds off?', { n: imp.round });
      else if (imp.phase === 'vote') text = t('impTvVote', 'Voting · {left} players in', { left: left });
      else if (imp.phase === 'elimination') text = t('impTvOut', 'The vote is in');
      else text = t('impTvEnded', 'Game over');
      FF.Race.describe({ kind: 'card', text: text }, null);
    }

    /* ---------- chat: a floating button that opens it in a sheet ---------- */

    function chatButton() {
      var btn = FF.ui.el('button', { type: 'button', class: 'imp-chatfab', 'aria-haspopup': 'dialog' });
      btn.appendChild(icon('chat'));
      btn.appendChild(FF.ui.span('imp-chatfab__label', t('chatTitle', 'Chat')));
      btn.appendChild(FF.ui.span('imp-chatfab__badge'));
      btn.addEventListener('click', function () { FF.Audio.play('click'); openChat(); });
      return btn;
    }

    function updateChatButton() {
      var btn = root.querySelector('.imp-chatfab');
      if (!btn) return;
      var unread = chatSheet ? 0 : Math.max(0, chatCount - chatSeen);
      var badge = btn.querySelector('.imp-chatfab__badge');
      badge.textContent = unread > 9 ? '9+' : (unread ? String(unread) : '');
      btn.classList.toggle('imp-chatfab--new', unread > 0);
      btn.setAttribute('aria-label', unread
        ? t('impChatUnread', 'Chat, {n} new', { n: unread })
        : t('chatTitle', 'Chat'));
    }

    function openChat() {
      if (chatSheet) return;
      chatSeen = chatCount;
      chat.refresh();
      chatSheet = FF.UI.sheet({
        title: t('chatTitle', 'Chat'), body: chat.el, className: 'imp-chatsheet',
        onClose: function () { chatSheet = null; chatSeen = chatCount; updateChatButton(); }
      });
      chat.scrollToEnd();
      chat.focus();
      updateChatButton();
    }

    /* ---------- drawing ---------- */

    function render() {
      if (ended) return;
      if (!root.isConnected) { cleanup(); return; }
      var v = client.view();
      var imp = v.imp;
      var focusId = document.activeElement && root.contains(document.activeElement) ? document.activeElement.id : null;
      var draft = local.draftEl ? local.draftEl.value : null;
      var draftPhase = local.phaseId;
      FF.ui.clear(root);

      if (!imp || (expectedMatch() && imp.matchId !== expectedMatch())) {
        root.appendChild(waiting(t('impDealing', 'Dealing the secrets…'), t('impDealingSub', 'The game starts on every phone at the same time.')));
        maybeNudge('start', (room.meta && room.meta.startAt) || 0);
        return;
      }
      var l = phaseLocal(imp);
      var stage = FF.GameUI.stage({ wide: true, className: 'imp imp--' + imp.phase });
      stage.appendChild(header(imp));
      stage.appendChild(seatStrip(imp, v));
      var layout = FF.ui.div('imp-layout');
      var mainCol = FF.ui.div('imp-main');

      if (!v.seated) mainCol.appendChild(FF.GameUI.feedback('info', t('impWatching', 'This game started without you. You can watch, and join the next one.')));
      else if (!v.alive && imp.phase !== 'ended') mainCol.appendChild(FF.GameUI.feedback('info', t('impYouAreOut', 'You were voted out. Watch how it ends: your secret stays hidden.')));

      var screens = { reveal: revealScreen, clues: cluesScreen, challenge: challengeScreen, discuss: discussScreen, vote: voteScreen, elimination: eliminationScreen, ended: endedScreen };
      (screens[imp.phase] || function () {})(mainCol, imp, v, l);

      layout.appendChild(mainCol);
      stage.appendChild(layout);
      stage.appendChild(chatButton());
      root.appendChild(stage);
      chat.refresh();
      updateChatButton();

      if (local.draftEl && draft != null && draftPhase === imp.phaseId) local.draftEl.value = draft;
      if (focusId) {
        var again = document.getElementById(focusId);
        if (again) { try { again.focus(); } catch (e) { /* gone */ } }
      }
      if (imp.phase !== 'ended') maybeNudge('p' + imp.phaseId, imp.deadline);
      tick();
    }

    function waiting(title, text) {
      var stage = FF.GameUI.stage({ center: true, className: 'imp imp-wait' });
      var spin = FF.ui.div('imp-wait__spin');
      spin.appendChild(icon('detective'));
      stage.appendChild(spin);
      stage.appendChild(FF.GameUI.prompt(title, 'md'));
      if (text) stage.appendChild(FF.GameUI.sub(text));
      return stage;
    }

    function maybeNudge(key, due) {
      if (nudged[key] || !due) return;
      var late = client.serverNow() - due;
      if (late < NUDGE_MS) return;
      nudged[key] = true;
      FF.ImpostersApi.nudge(room.code);
    }

    var PHASE_NAMES = {
      reveal: ['impPhaseReveal', 'Your secret'],
      clues: ['impPhaseClues', 'Clues'],
      challenge: ['impPhaseChallenge', 'Stop the clock'],
      discuss: ['impPhaseDiscuss', 'Talk it over'],
      vote: ['impPhaseVote', 'Vote'],
      elimination: ['impPhaseOut', 'The result'],
      ended: ['impPhaseEnded', 'Game over']
    };

    function header(imp) {
      var head = FF.ui.el('header', { class: 'imp-head' });
      var left = FF.ui.div('imp-head__info');
      var name = PHASE_NAMES[imp.phase] || ['', ''];
      left.appendChild(FF.GameUI.kicker(imp.mode === 'number' ? t('impModeNumber', 'Number Imposter') : t('impModeWord', 'Word Imposter')));
      left.appendChild(FF.ui.el('h2', { class: 'imp-head__phase' }, t(name[0], name[1])));
      head.appendChild(left);
      if (imp.phase !== 'ended') {
        var prog = FF.ui.el('ol', { class: 'imp-rounds', 'aria-label': t('impRoundOf', 'Round {n} of {total}', { n: imp.round, total: imp.rounds }) });
        for (var i = 1; i <= imp.rounds; i++) {
          prog.appendChild(FF.ui.el('li', { class: 'imp-rounds__dot' + (i < imp.round ? ' imp-rounds__dot--done' : '') + (i === imp.round ? ' imp-rounds__dot--on' : '') }));
        }
        var right = FF.ui.div('imp-head__side');
        right.appendChild(FF.ui.span('imp-head__round', t('impRoundOf', 'Round {n} of {total}', { n: imp.round, total: imp.rounds })));
        right.appendChild(prog);
        // The talk has no clock on screen: players move on with Vote now or More clues.
        var timed = imp.phase !== 'discuss';
        if (timed) {
          var timer = FF.ui.el('div', { class: 'imp-timer', role: 'timer' });
          timer.appendChild(icon('timer'));
          timer.appendChild(FF.ui.span('imp-timer__text', ''));
          right.appendChild(timer);
        }
        head.appendChild(right);
        if (timed) {
          var bar = FF.GameUI.meter(1);
          bar.classList.add('imp-head__meter');
          head.appendChild(bar);
        }
      }
      return head;
    }

    /* Everyone in the match, with what they have done this phase. */
    function seatStrip(imp, v) {
      var list = FF.ui.el('ul', { class: 'imp-seats', 'aria-label': t('impPlayers', 'Players') });
      C.seats(imp, players()).forEach(function (s) {
        var done = imp.phase === 'reveal' ? s.ready
          : (imp.phase === 'clues' || imp.phase === 'challenge') ? s.submitted
            : imp.phase === 'vote' ? s.voted
              : imp.phase === 'discuss' ? (s.wantsVote || s.wantsClues) : false;
        var li = FF.ui.el('li', { class: 'imp-seat' + (s.alive ? '' : ' imp-seat--out') + (done ? ' imp-seat--done' : '') + (s.uid === v.uid ? ' imp-seat--me' : '') });
        li.appendChild(FF.Players.avatarEl(s, 'imp-seat__ava'));
        li.appendChild(FF.ui.span('imp-seat__name', s.name + (s.uid === v.uid ? ' ' + t('youTag', '(you)') : '')));
        var moreClues = imp.phase === 'discuss' && s.wantsClues;
        var state = !s.alive ? t('impOut', 'Out')
          : done ? (imp.phase === 'discuss' ? (moreClues ? t('impWantsClues', 'More clues') : t('impWantsVote', 'Wants to vote')) : t('impDone', 'Done'))
            : '';
        if (state) {
          var tag = FF.ui.span('imp-seat__tag');
          tag.appendChild(icon(!s.alive ? 'x' : (imp.phase === 'discuss' ? (moreClues ? 'pencil' : 'megaphone') : 'check')));
          tag.appendChild(document.createTextNode(state));
          li.appendChild(tag);
        }
        list.appendChild(li);
      });
      return list;
    }

    function count(imp, field) {
      var all = C.seats(imp, players()).filter(function (s) { return s.alive; });
      return { done: all.filter(function (s) { return s[field]; }).length, total: all.length };
    }

    /* Press and hold to see your own secret again; it hides when you let go. */
    function peekButton(v) {
      var secret = v.secret;
      if (!secret) return null;
      var wrap = FF.ui.div('imp-peek');
      var shown = FF.ui.el('span', { class: 'imp-peek__value', 'aria-live': 'polite' });
      var btn = FF.ui.el('button', { type: 'button', class: 'btn btn-soft btn-icon imp-peek__btn', 'aria-pressed': 'false' });
      btn.appendChild(icon('eye'));
      btn.appendChild(FF.ui.span('', t('impHoldPeek', 'Hold to see your secret')));
      function show(on) {
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        shown.textContent = on ? (secret.word || targetText(secret.target)) : '';
        wrap.classList.toggle('imp-peek--on', on);
      }
      btn.addEventListener('pointerdown', function (e) { e.preventDefault(); show(true); });
      ['pointerup', 'pointerleave', 'pointercancel', 'blur'].forEach(function (ev) { btn.addEventListener(ev, function () { show(false); }); });
      btn.addEventListener('keydown', function (e) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); show(true); } });
      btn.addEventListener('keyup', function () { show(false); });
      btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      wrap.appendChild(btn);
      wrap.appendChild(shown);
      return wrap;
    }

    function feedbackFor(v, l) {
      var f = v.feedback;
      if (!f || !l.lastCmd || f.id !== l.lastCmd) return null;
      return FF.GameUI.feedback('bad', C.feedbackText(f.code));
    }

    function sendCmd(l, type, extra) {
      return client.send(type, extra).then(function (id) {
        if (id) { l.lastCmd = id; schedule(); }
        return id;
      }).catch(function () {
        FF.UI.toast(t('impSendFailed', 'That did not reach the game. Check your connection.'), { type: 'error' });
      });
    }

    /* ---------- reveal ---------- */

    function revealScreen(box, imp, v, l) {
      if (!v.seated || !v.alive) { box.appendChild(board(imp)); return; }
      var secret = v.secret;
      if (!secret) { box.appendChild(FF.GameUI.sub(t('impGettingSecret', 'Getting your secret…'))); return; }
      var isNumber = imp.mode === 'number';
      var label = isNumber ? t('impYourTarget', 'Your target time') : t('impYourWord', 'Your word');
      var value = isNumber ? targetText(secret.target) : secret.word;
      var ready = v.me && v.me.ready;

      var card = FF.ui.el('div', { class: 'imp-card' + (l.revealed && !ready ? ' imp-card--up' : '') });
      if (ready) {
        card.appendChild(icon('lock'));
        card.appendChild(FF.ui.div('imp-card__label', t('impHidden', 'Hidden. Only you know it.')));
        box.appendChild(card);
        box.appendChild(peekButton(v));
        var c = count(imp, 'ready');
        box.appendChild(FF.GameUI.note(t('impReadyCount', '{n} of {total} players are ready.', { n: c.done, total: c.total })));
      } else if (!l.revealed) {
        var flip = FF.ui.el('button', { type: 'button', class: 'imp-card imp-card--down', onclick: function () { FF.Audio.play('select'); l.revealed = true; render(); } });
        flip.appendChild(icon('eye'));
        flip.appendChild(FF.ui.div('imp-card__label', isNumber ? t('impTapTarget', 'Tap to see your target') : t('impTapWord', 'Tap to see your word')));
        flip.appendChild(FF.ui.div('imp-card__hint', t('impCoverScreen', 'Make sure nobody can see your screen.')));
        box.appendChild(flip);
      } else {
        card.appendChild(FF.ui.div('imp-card__label', label));
        card.appendChild(FF.ui.div('imp-card__value', value));
        box.appendChild(card);
        box.appendChild(FF.GameUI.sub(isNumber
          ? t('impTargetHint', 'Stop the clock as close to this as you can. Some players have a different target, and nobody knows who.')
          : t('impWordHint', 'Remember it. Some players have a different word, and nobody knows who, not even them.')));
        box.appendChild(FF.GameUI.action(t('impGotIt', 'I’ve got it'), function () {
          FF.Audio.play('click');
          sendCmd(l, 'ready');
        }, { icon: 'check' }));
      }
      if (imp.round > 1) box.appendChild(board(imp));
    }

    /* ---------- Word Imposter: clues ---------- */

    function cluesScreen(box, imp, v, l) {
      if (v.seated && v.alive) {
        if (v.me && v.me.submitted) {
          box.appendChild(FF.GameUI.feedback('good', l.sentClue
            ? t('impClueSent', 'Your clue “{clue}” is in. Clues appear together when everyone has sent one.', { clue: l.sentClue })
            : t('impClueIn', 'Your clue is in. Clues appear together when everyone has sent one.')));
        } else {
          box.appendChild(FF.GameUI.prompt(t('impGiveClue', 'Give a one-word clue for your word'), 'md'));
          box.appendChild(FF.GameUI.sub(t('impClueTip', 'Close enough that your side recognises it, vague enough that the other side cannot tell.')));
          var row = FF.GameUI.inputRow({
            placeholder: t('impOneWord', 'One word'), label: t('impYourClue', 'Your clue'),
            buttonLabel: t('impSend', 'Send'), buttonIcon: 'arrow-right', maxlength: R.MAX_CLUE,
            onSubmit: function (value) {
              var check = R.validateClue(value, {
                secret: v.secret && v.secret.word, used: l.myClues,
                isQuiet: FF.Words && FF.Words.isQuiet ? function (w) { return FF.Words.isQuiet(w); } : null
              });
              if (!check.ok) { l.localError = check.error; render(); return; }
              l.localError = null;
              l.sentClue = check.value;
              FF.Audio.play('click');
              sendCmd(l, 'clue', { clue: check.value }).then(function (id) {
                if (id) local.myClues = (local.myClues || []).concat([check.value.toLowerCase()]);
              });
            }
          });
          row.input.id = 'imp-clue-input';
          local.draftEl = row.input;
          box.appendChild(row.row);
          if (l.localError) box.appendChild(FF.GameUI.feedback('bad', C.feedbackText(l.localError)));
          else { var fb = feedbackFor(v, l); if (fb) box.appendChild(fb); }
        }
        box.appendChild(peekButton(v));
      }
      var c = count(imp, 'submitted');
      box.appendChild(FF.GameUI.note(t('impCluesCount', '{n} of {total} clues in.', { n: c.done, total: c.total })));
      box.appendChild(board(imp));
    }

    /* ---------- Number Imposter: the hidden clock ---------- */

    function challengeScreen(box, imp, v, l) {
      var stage = FF.ui.div('imp-clock');
      var ring = FF.ui.div('imp-clock__ring');
      var face = FF.ui.el('div', { class: 'imp-clock__face', 'aria-live': 'off' });
      ring.appendChild(face);
      stage.appendChild(ring);
      var status = FF.ui.el('p', { class: 'imp-clock__status', 'aria-live': 'polite' });
      stage.appendChild(status);
      box.appendChild(stage);
      local.clock = { face: face, ring: ring, status: status, goAt: imp.goAt };

      if (v.seated && v.alive && !(v.me && v.me.submitted) && l.stoppedMs == null) {
        var stop = FF.ui.el('button', { type: 'button', class: 'btn btn-lg btn-primary imp-stop', id: 'imp-stop' });
        stop.appendChild(icon('hand-tap'));
        stop.appendChild(FF.ui.span('', t('impStop', 'Stop')));
        stop.addEventListener('click', function () {
          var ms = client.serverNow() - imp.goAt;
          if (ms < 0) { FF.UI.toast(C.feedbackText('early')); return; }
          l.stoppedMs = ms;
          FF.Audio.play('correct');
          sendCmd(l, 'stop', { ms: Math.round(ms) });
          render();
        });
        local.clock.stop = stop;
        box.appendChild(stop);
        box.appendChild(peekButton(v));
      } else if (l.stoppedMs != null || (v.me && v.me.submitted)) {
        box.appendChild(FF.GameUI.feedback('good', l.stoppedMs != null
          ? t('impYouStopped', 'You stopped at {s} seconds. Waiting for the others.', { s: seconds(l.stoppedMs) })
          : t('impStoppedIn', 'Your time is in. Waiting for the others.')));
        var fb = feedbackFor(v, l);
        if (fb) box.appendChild(fb);
      }
      var c = count(imp, 'submitted');
      box.appendChild(FF.GameUI.note(t('impStopsCount', '{n} of {total} have stopped.', { n: c.done, total: c.total })));
      if (imp.round > 1) box.appendChild(board(imp));
    }

    function tickClock(imp) {
      var k = local.clock;
      if (!k || !k.face.isConnected) return;
      var now = client.serverNow();
      var since = now - k.goAt;
      if (since < 0) {
        k.face.textContent = String(Math.ceil(-since / 1000));
        k.status.textContent = t('impGetReady', 'Get ready. The clock starts on every phone at once.');
        k.ring.className = 'imp-clock__ring imp-clock__ring--wait';
        if (k.stop) k.stop.disabled = true;
        return;
      }
      if (k.stop) k.stop.disabled = false;
      if (local.stoppedMs != null) {
        k.face.textContent = seconds(local.stoppedMs);
        k.ring.className = 'imp-clock__ring imp-clock__ring--stopped';
        k.status.textContent = '';
        return;
      }
      if (since < CLOCK_SHOWN_MS) {
        k.face.textContent = seconds(since);
        k.status.textContent = t('impClockGo', 'Go! The clock is running.');
      } else {
        k.face.textContent = '?.??';
        k.status.textContent = t('impClockHidden', 'The clock is hidden now. Count in your head and stop on your target.');
      }
      k.ring.className = 'imp-clock__ring imp-clock__ring--run';
    }

    /* ---------- the board: every round's clues or times ---------- */

    function board(imp) {
      var rounds = C.boardRounds(imp);
      if (!rounds.length) return FF.ui.div('imp-board imp-board--empty');
      var wrap = FF.ui.div('imp-board');
      var table = FF.ui.el('table', { class: 'imp-board__table' });
      table.appendChild(FF.ui.el('caption', { class: 'imp-board__caption' }, imp.mode === 'number' ? t('impTimesBoard', 'Everyone’s times') : t('impCluesBoard', 'Everyone’s clues')));
      var head = FF.ui.el('tr');
      head.appendChild(FF.ui.el('th', { scope: 'col' }, t('impPlayer', 'Player')));
      rounds.forEach(function (r) { head.appendChild(FF.ui.el('th', { scope: 'col' }, t('impRoundShort', 'R{n}', { n: r.round }))); });
      table.appendChild(FF.ui.el('thead', null, [head]));
      var body = FF.ui.el('tbody');
      C.seats(imp, players()).forEach(function (s) {
        var tr = FF.ui.el('tr', { class: s.alive ? '' : 'imp-board__row--out' });
        var who = FF.ui.el('th', { scope: 'row', class: 'imp-board__who' });
        who.appendChild(FF.Players.avatarEl(s, 'imp-board__ava'));
        who.appendChild(FF.ui.span('', s.name));
        tr.appendChild(who);
        rounds.forEach(function (r) {
          var has = C.has(r.values, s.uid);
          var val = r.values[s.uid];
          var text;
          if (!has) text = '';
          else if (imp.mode === 'number') text = val === -1 ? t('impNoStop', 'No stop') : seconds(val) + 's';
          else text = val || t('impNoClue', 'No clue');
          tr.appendChild(FF.ui.el('td', { class: (has && (val === '' || val === -1)) ? 'imp-board__none' : '' }, text));
        });
        body.appendChild(tr);
      });
      table.appendChild(body);
      wrap.appendChild(table);
      return wrap;
    }

    /* ---------- discussion ---------- */

    function discussScreen(box, imp, v, l) {
      box.appendChild(board(imp));
      if (imp.final) box.appendChild(FF.GameUI.feedback('tip', t('impFinalRound', 'Last round. When the time is up, everyone votes.')));
      var moreLabel = imp.mode === 'number' ? t('impMoreRound', 'Another round') : t('impMoreClues', 'More clues');
      if (v.seated && v.alive) {
        var wantsVote = !!(v.me && v.me.wantsVote);
        var wantsMore = !!(v.me && v.me.wantsClues);
        var row = FF.ui.div('imp-actions' + (imp.final ? ' imp-actions--one' : ''));
        // Your pick stays lit; the other button switches you over.
        if (!imp.final) {
          var more = FF.UI.button(moreLabel, {
            class: 'btn-lg ' + (wantsMore ? 'btn-primary imp-actions__on' : 'btn-soft') + ' imp-actions__btn', icon: 'pencil',
            onClick: function () { if (wantsMore) return; FF.Audio.play('select'); sendCmd(l, 'moreClues'); }
          });
          more.setAttribute('aria-pressed', wantsMore ? 'true' : 'false');
          row.appendChild(more);
        }
        var vote = FF.UI.button(t('impVoteNow', 'Vote now'), {
          class: 'btn-lg ' + (wantsVote || !wantsMore ? 'btn-primary' : 'btn-soft') + (wantsVote ? ' imp-actions__on' : '') + ' imp-actions__btn', icon: 'megaphone',
          onClick: function () { if (wantsVote) return; FF.Audio.play('select'); sendCmd(l, 'callVote'); }
        });
        vote.setAttribute('aria-pressed', wantsVote ? 'true' : 'false');
        row.appendChild(vote);
        box.appendChild(row);
        var fb = feedbackFor(v, l);
        if (fb) box.appendChild(fb);
        box.appendChild(peekButton(v));
      }
      box.appendChild(FF.GameUI.note(imp.final
        ? t('impVoteNeedFinal', '{n} of {need} players want to vote. In the last round the vote starts anyway when the talk ends.', { n: imp.wantCount || 0, need: imp.need })
        : t('impMoveOn', '{need} players need to agree. Vote now: {votes}. {more}: {clues}.', {
          need: imp.need, votes: imp.wantCount || 0, clues: imp.moreCount || 0, more: moreLabel
        })));
    }

    /* ---------- voting ---------- */

    function voteScreen(box, imp, v, l) {
      if (imp.revote) box.appendChild(FF.GameUI.feedback('tip', t('impRevote', 'It’s a tie. Vote again, between the tied players only.')));
      var candidates = (imp.candidates || []).filter(function (u) { return u !== v.uid; });
      var c = count(imp, 'voted');
      if (v.seated && v.alive && !(v.me && v.me.voted)) {
        box.appendChild(FF.GameUI.prompt(t('impWhoVote', 'Who has a different secret?'), 'md'));
        box.appendChild(FF.GameUI.sub(t('impVotePrivate', 'Your vote is private until the end of the game.')));
        var grid = FF.ui.el('div', { class: 'imp-vote', role: 'radiogroup', 'aria-label': t('impVoteFor', 'Vote for') });
        C.seats(imp, players()).filter(function (s) { return candidates.indexOf(s.uid) !== -1; }).forEach(function (s) {
          var on = l.choice === s.uid;
          var b = FF.ui.el('button', { type: 'button', class: 'imp-vote__pick' + (on ? ' imp-vote__pick--on' : ''), role: 'radio', 'aria-checked': on ? 'true' : 'false' });
          b.appendChild(FF.Players.avatarEl(s, 'imp-vote__ava'));
          b.appendChild(FF.ui.span('imp-vote__name', s.name));
          b.addEventListener('click', function () { FF.Audio.play('select'); l.choice = s.uid; render(); });
          grid.appendChild(b);
        });
        box.appendChild(grid);
        var picked = C.seats(imp, players()).filter(function (s) { return s.uid === l.choice; })[0];
        var go = FF.GameUI.action(picked ? t('impVoteForName', 'Vote for {name}', { name: picked.name }) : t('impPickSomeone', 'Pick someone'), function () {
          if (!picked) return;
          FF.Audio.play('click');
          sendCmd(l, 'vote', { target: picked.uid });
        }, { icon: 'check' });
        go.disabled = !picked;
        box.appendChild(go);
        var fb = feedbackFor(v, l);
        if (fb) box.appendChild(fb);
      } else if (v.seated && v.alive) {
        box.appendChild(FF.GameUI.feedback('good', t('impVoted', 'Vote cast.')));
      }
      box.appendChild(FF.GameUI.note(t('impVotesCount', '{n} of {total} have voted.', { n: c.done, total: c.total })));
      box.appendChild(board(imp));
    }

    /* ---------- elimination ---------- */

    function eliminationScreen(box, imp) {
      var rec = (imp.votes || {})['v' + imp.voteNo] || {};
      var out = rec.out ? C.seats(imp, players()).filter(function (s) { return s.uid === rec.out; })[0] : null;
      var card = FF.ui.div('imp-out' + (out ? ' imp-out--gone' : ' imp-out--none'));
      if (out) {
        card.appendChild(FF.Players.avatarEl(out, 'imp-out__ava'));
        card.appendChild(FF.GameUI.prompt(t('impIsOut', '{name} is out', { name: out.name }), 'xl'));
        card.appendChild(FF.GameUI.sub(t('impStaysSecret', 'Their secret stays hidden until the end of the game.')));
        if (!local.sounded) { local.sounded = true; FF.Audio.play('wrong'); }
      } else {
        card.appendChild(icon('scales'));
        card.appendChild(FF.GameUI.prompt(t('impNobodyOut', 'Nobody is out'), 'xl'));
        card.appendChild(FF.GameUI.sub(t('impSplit', 'The vote was split. The game goes on.')));
      }
      box.appendChild(card);
      var counts = rec.counts || {};
      var rows = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
      if (rows.length) {
        var tally = FF.ui.el('ul', { class: 'imp-tally', 'aria-label': t('impVotesFor', 'Votes') });
        var max = counts[rows[0]];
        C.seats(imp, players()).filter(function (s) { return counts[s.uid]; }).sort(function (a, b) { return counts[b.uid] - counts[a.uid]; }).forEach(function (s) {
          var li = FF.ui.el('li', { class: 'imp-tally__row' });
          li.appendChild(FF.ui.span('imp-tally__name', s.name));
          var bar = FF.ui.span('imp-tally__bar');
          bar.style.width = Math.round(counts[s.uid] / max * 100) + '%';
          li.appendChild(bar);
          li.appendChild(FF.ui.span('imp-tally__n', counts[s.uid] === 1 ? t('impOneVote', '1 vote') : t('impNVotes', '{n} votes', { n: counts[s.uid] })));
          tally.appendChild(li);
        });
        box.appendChild(tally);
      }
    }

    /* ---------- the end: everything revealed ---------- */

    function endedScreen(box, imp, v) {
      var res = imp.result || {};
      var seats = C.seats(imp, players());
      var sides = res.sides || {};
      var mine = sides[v.uid] || null;
      var won = mine && mine === res.winner;
      var nameOf = function (u) { var s = seats.filter(function (x) { return x.uid === u; })[0]; return s ? s.name : '?'; };

      var banner = FF.ui.div('imp-win imp-win--' + (res.winner || 'majority'));
      banner.appendChild(icon(res.winner === 'minority' ? 'detective' : 'trophy'));
      banner.appendChild(FF.GameUI.prompt(res.winner === 'minority' ? t('impMinorityWins', 'The imposters win!') : t('impMajorityWins', 'The majority wins!'), 'xl'));
      if (mine) banner.appendChild(FF.GameUI.sub(won ? t('impYouWon', 'You were on the winning side.') : t('impYouLost', 'Your side lost this time.')));
      box.appendChild(banner);
      if (!local.cheered) { local.cheered = true; FF.Audio.play(won ? 'streak' : 'roundEnd'); }

      // Who the imposters were, before anything else.
      var imposters = seats.filter(function (s) { return sides[s.uid] === 'minority'; });
      var reveal = FF.ui.el('section', { class: 'imp-reveal' });
      reveal.appendChild(FF.ui.el('h3', { class: 'imp-reveal__title' }, imposters.length > 1 ? t('impTheyWere', 'The imposters were') : t('impItWas', 'The imposter was')));
      var faces = FF.ui.el('ul', { class: 'imp-reveal__list' });
      imposters.forEach(function (s) {
        var li = FF.ui.el('li', { class: 'imp-reveal__who' });
        li.appendChild(FF.Players.avatarEl(s, 'imp-reveal__ava'));
        li.appendChild(FF.ui.span('imp-reveal__name', s.name + (s.uid === v.uid ? ' ' + t('youTag', '(you)') : '')));
        if (res.words && res.assignments) li.appendChild(FF.ui.span('imp-chip imp-chip--imp', res.assignments[s.uid]));
        faces.appendChild(li);
      });
      reveal.appendChild(faces);
      if (res.words) {
        reveal.appendChild(FF.GameUI.sub(t('impWordsWere', 'Most players had “{maj}”. The imposters had “{min}”.', { maj: res.words.majority, min: res.words.minority })));
      }
      box.appendChild(reveal);

      if (res.targets) {
        var tl = FF.ui.el('ul', { class: 'imp-targets' });
        Object.keys(res.targets).sort().forEach(function (k) {
          var tg = res.targets[k];
          tl.appendChild(FF.ui.el('li', null, t('impTargetsWere', 'Round {n}: most aimed for {maj}, the imposters for {min}.', { n: k.slice(1), maj: targetText(tg.majority), min: targetText(tg.minority) })));
        });
        box.appendChild(tl);
      }

      // Everyone: their word, their side, and each vote they cast, right or wrong.
      var voteKeys = Object.keys(res.ballots || {}).sort(function (a, b) { return Number(a.slice(1)) - Number(b.slice(1)); });
      var list = FF.ui.el('section', { class: 'imp-recap' });
      list.appendChild(FF.ui.el('h3', { class: 'imp-recap__title' }, t('impEveryone', 'Everyone’s word and vote')));
      var ul = FF.ui.el('ul', { class: 'imp-recap__list' });
      imposters.concat(seats.filter(function (s) { return sides[s.uid] !== 'minority'; })).forEach(function (s) {
        var isImp = sides[s.uid] === 'minority';
        var li = FF.ui.el('li', { class: 'imp-recap__row' + (isImp ? ' imp-recap__row--imp' : '') + (s.uid === v.uid ? ' imp-recap__row--me' : '') });
        var top = FF.ui.div('imp-recap__top');
        top.appendChild(FF.Players.avatarEl(s, 'imp-recap__ava'));
        top.appendChild(FF.ui.span('imp-recap__name', s.name + (s.uid === v.uid ? ' ' + t('youTag', '(you)') : '')));
        if (res.words && res.assignments) top.appendChild(FF.ui.span('imp-chip' + (isImp ? ' imp-chip--imp' : ''), res.assignments[s.uid]));
        if (isImp) top.appendChild(FF.ui.span('imp-recap__side', t('impImposter', 'Imposter')));
        li.appendChild(top);

        var votes = FF.ui.el('ul', { class: 'imp-recap__votes' });
        voteKeys.forEach(function (k) {
          var target = (res.ballots[k] || {})[s.uid];
          if (!target) return;
          var right = sides[target] === 'minority';
          // Only the majority are out to catch someone; an imposter's vote is just shown.
          var kind = isImp ? 'plain' : (right ? 'good' : 'bad');
          var item = FF.ui.el('li', { class: 'imp-recap__vote imp-recap__vote--' + kind });
          if (kind !== 'plain') item.appendChild(icon(right ? 'check' : 'x'));
          item.appendChild(FF.ui.span('', voteKeys.length > 1
            ? t('impVotedForN', 'Vote {n}: {name}', { n: k.slice(1), name: nameOf(target) })
            : t('impVotedFor', 'Voted for {name}', { name: nameOf(target) })));
          if (kind !== 'plain') item.appendChild(FF.ui.span('sr-only', right ? t('impRight', 'right') : t('impWrong', 'wrong')));
          votes.appendChild(item);
        });
        if (!votes.children.length) votes.appendChild(FF.ui.el('li', { class: 'imp-recap__vote imp-recap__vote--plain' }, t('impNoVote', 'Did not vote')));
        var st = (res.stats || {})[s.uid] || {};
        if (st.out) votes.appendChild(FF.ui.el('li', { class: 'imp-recap__vote imp-recap__vote--plain' }, t('impOutRound', 'Out in round {n}', { n: st.out })));
        li.appendChild(votes);
        ul.appendChild(li);
      });
      list.appendChild(ul);
      box.appendChild(list);

      box.appendChild(FF.GameUI.action(t('impSeeScores', 'See scores'), function () { FF.Audio.play('click'); finish(); }, { icon: 'trophy' }));
      if (!autoScores) autoScores = setTimeout(finish, AUTO_SCORES_MS);
    }

    /* ---------- the clock ---------- */

    function tick() {
      if (ended) return;
      var imp = client.view().imp;
      if (!imp) return;
      var left = Math.max(0, imp.deadline - client.serverNow());
      var text = root.querySelector('.imp-timer__text');
      if (text) {
        var s = Math.ceil(left / 1000);
        text.textContent = s >= 60 ? Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2) : String(s);
        var timer = text.parentNode;
        if (timer) timer.classList.toggle('imp-timer--warn', s <= 5);
      }
      var meter = root.querySelector('.imp-head__meter');
      if (meter && meter.set) {
        if (!local.span || local.spanPhase !== imp.phaseId) { local.span = Math.max(1, left); local.spanPhase = imp.phaseId; }
        meter.set(left / local.span);
      }
      if (imp.phase === 'challenge') tickClock(imp);
    }

    render();
  }

  FF.registerGame({
    id: 'imposters',
    featured: true,
    name: 'Imposters',
    description: 'Everyone gets a secret, except one or two who get a different one. Nobody knows which side they are on. Give clues, talk, and vote the imposters out.',
    category: 'party',
    icon: '🕵️',
    players: [R.MIN_PLAYERS, R.MAX_PLAYERS],
    difficulty: 'Medium',
    duration: 10,
    tags: ['party', 'social', 'deduction', 'words', 'online'],
    modes: ['everyone'],
    defaultMode: 'everyone',
    howToPlay: [
      'Play in an online room with 3 to 12 players.',
      'Most players get the same secret word (or target time). One or two get a different one. Nobody is told which side they are on.',
      'Word Imposter: give a one-word clue. Number Imposter: stop the hidden clock on your target.',
      'Talk it over and press Vote now. When more than half want to vote, everyone votes in private.',
      'Catch every imposter to win. If an imposter lasts to the end, the imposters win.'
    ],
    room: ROOM,
    start: function (api) {
      var room = FF.Room && FF.Room.current();
      if (!api.config.room || !room) { showIntro(api); return; }
      play(api, room);
    }
  });
})();
