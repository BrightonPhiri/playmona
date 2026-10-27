/* ============================================================
   PLAYMONA — net/roomUI.js
   Screens for online play: create, join, lobby, results.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var ONLINE_GAMES = [
    'bibleQuiz',
    'whereInWorld', 'mapChallenge', 'capitalChallenge', 'guessFlag',
    'guessCountry', 'guessLandmark', 'guessAnimal', 'guessFood',
    'guessObject', 'guessSport', 'guessVehicle',
    'familyQuiz', 'trueOrFalse', 'guessWho', 'pictureQuiz',
    'quickTap', 'colorReaction',
    // Parallel play: same letters for everyone, each keeps their own score.
    'letterRush',
    'whatsMissing',
    'numberChallenge',
    'visualRiddle',
    // Races: the same card, word, clues or verse for everyone at once.
    'higherOrLower', 'wordScramble', 'bibleWhoAmI', 'bibleVerseRush',
    // Parallel challenges (js/net/parallel.js): the same puzzle on every
    // phone at once, each player keeps their own score.
    'memoryMatch', 'pictureMemory', 'rememberSequence',
    'picturePuzzle', 'spotDifference', 'hiddenObject',
    'wordBuilder', 'bibleBooks'
    // Brain Battle is deliberately absent: its format is a personal
    // streak run per player, so there is no shared question to race for.
  ];


  function panel(children) {
    var w = FF.ui.div('rm-wrap');
    (children || []).forEach(function (c) { if (c) w.appendChild(c); });
    return w;
  }

  function title(text) { return FF.ui.el('h1', { class: 'page-title' }, text); }

  // Icon + title + hint, centred: the top of each room screen.
  function hero(iconKey, text, hint) {
    var h = FF.ui.div('rm-hero');
    var ic = FF.ui.span('rm-hero__icon');
    ic.appendChild(FF.Icons.icon(iconKey));
    h.appendChild(ic);
    h.appendChild(title(text));
    if (hint) h.appendChild(FF.ui.el('p', { class: 'rm-hint' }, hint));
    return h;
  }

  function backButton(fn) {
    return FF.UI.button(FF.t('back', 'Back'), { class: 'btn-lg btn-ghost', icon: 'arrow-left', onClick: fn });
  }

  function playerChips(players, myUid) {
    var list = FF.ui.div('rm-players');
    players.forEach(function (p) {
      var isSpk = FF.Voice && FF.Voice.isSpeaking(p.uid);
      // Rooms only ever show emoji avatars: photos stay on their own device.
      var chip = FF.ui.div('rm-player' + (p.online ? '' : ' rm-player--off') + (isSpk ? ' rm-player--speaking' : ''), [
        FF.Players.avatarEl(p, 'rm-player__ava' + (isSpk ? ' rm-player__ava--speaking' : '')),
        p.name + (p.uid === myUid ? ' ' + FF.t('youTag', '(you)') : '') + (p.online ? '' : ' · ' + FF.t('offline', 'offline'))
      ]);
      chip.dataset.uid = p.uid;
      list.appendChild(chip);
    });
    return list;
  }

  /* Speaking highlight on every player chip on screen (lobby, countdown and
     the game's score bar), for everyone talking at once, you included. */
  if (FF.Voice && FF.Voice.on) {
    FF.Voice.on('speaking', function (ev) {
      if (!ev || !ev.uid || !document.querySelectorAll) return;
      var on = !!ev.speaking;
      Array.prototype.forEach.call(document.querySelectorAll('[data-uid="' + ev.uid + '"]'), function (chip) {
        if (chip.classList.contains('rm-player')) {
          chip.classList.toggle('rm-player--speaking', on);
          var ava = chip.querySelector('.rm-player__ava');
          if (ava) ava.classList.toggle('rm-player__ava--speaking', on);
        } else if (chip.classList.contains('score-chip')) {
          chip.classList.toggle('speaking', on);
        }
      });
    });
  }

  /* Listeners that belong to the screen on show. Each screen switch removes
     them, so an old lobby can never redraw itself over the countdown, a game
     or the results (voice listeners used to pile up and do exactly that). */
  var screenOffs = [];
  var screenName = 'home';
  function onScreen(off) { if (typeof off === 'function') screenOffs.push(off); }
  function resetScreen(name) {
    screenOffs.splice(0).forEach(function (off) { try { off(); } catch (e) {} });
    FF.Room.offAll();
    if (name) screenName = name;
  }

  // The QR code for a link, drawn once and reused on every lobby redraw.
  var qrCache = { url: null, node: null };
  function qrFor(url) {
    if (qrCache.url !== url) {
      qrCache.url = url;
      qrCache.node = (FF.QR && FF.QR.available()) ? FF.QR.svg(url, { size: 170 }) : null;
    }
    return qrCache.node;
  }

  /* ---------- Watching (phase 3) ---------- */

  // "N watching": one small chip for everyone in a room, in the lobby and during games.
  var viewerChip = null;
  var offViewerChip = null;
  function trackViewers() {
    if (offViewerChip || !FF.Broadcast || !FF.Broadcast.onViewers) return;
    offViewerChip = FF.Broadcast.onViewers(function (n) {
      if (!viewerChip) {
        viewerChip = FF.ui.el('div', { class: 'rm-viewers', role: 'status', 'aria-live': 'polite' });
        viewerChip.hidden = true;
        document.body.appendChild(viewerChip);
      }
      FF.ui.clear(viewerChip);
      var show = n > 0 && !!FF.Room.current();
      viewerChip.hidden = !show;
      if (!show) return;
      viewerChip.appendChild(FF.Icons.icon('eye'));
      viewerChip.appendChild(FF.ui.span('', FF.t('nWatching', '{n} watching', { n: n })));
    });
  }

  function copyText(value) {
    FF.Audio.play('click');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(function () {
        FF.UI.toast(FF.t('linkCopied', 'Link copied'), { type: 'success' });
      }, function () { FF.UI.toast(value); });
    } else {
      FF.UI.toast(value);
    }
  }

  // The watch link to share, with copy, share and a QR code.
  function inviteViewers() {
    FF.Broadcast.ensureCode().then(function (code) {
      var url = FF.Broadcast.watchUrl(code);
      var body = FF.ui.div('rm-invite');
      body.appendChild(FF.ui.el('p', { class: 'rm-hint' }, FF.t('inviteViewersText', 'This link is for watching. Viewers see the game but can\u2019t play.')));
      body.appendChild(FF.ui.el('p', { class: 'rm-invite__link' }, url));
      body.appendChild(FF.ui.div('rm-share', [
        FF.UI.button(FF.t('copyLink', 'Copy link'), { icon: 'copy', onClick: function () { copyText(url); } }),
        navigator.share ? FF.UI.button(FF.t('share', 'Share'), { icon: 'share', onClick: function () {
          navigator.share({ title: 'PlayMona', text: FF.t('watchShareText', 'Watch our game live on PlayMona'), url: url }).catch(function () {});
        } }) : null
      ].filter(Boolean)));
      var qr = (FF.QR && FF.QR.available()) ? FF.QR.svg(url, { size: 170 }) : null;
      if (qr) body.appendChild(FF.ui.div('rm-qr', [qr]));
      FF.UI.sheet({ title: FF.t('inviteViewers', 'Invite viewers'), body: body, actions: [{ label: FF.t('done', 'Done'), primary: true }] });
    }, function () {
      FF.UI.toast(FF.t('watchLinkFailed', 'The watch link is not ready. Try again in a moment.'), { type: 'error' });
    });
  }

  // Host only: Public or Private, watching on or off, invite viewers, new link.
  function watchPanel(renderFn) {
    if (!FF.Broadcast) return null;
    var B = FF.Broadcast;
    var wrap = FF.ui.el('section', { class: 'rm-watch', 'aria-label': FF.t('watching', 'Watching') });
    var title = FF.ui.el('strong', { class: 'rm-watch__title' });
    title.appendChild(FF.Icons.icon('eye'));
    title.appendChild(document.createTextNode(FF.t('watching', 'Watching')));
    wrap.appendChild(title);

    // Read the room itself: it is up to date when the lobby redraws, the broadcaster may not be yet.
    var meta = (FF.Room.current() && FF.Room.current().meta) || {};
    var delisted = B.delisted();
    var isPublic = meta.public === true && !delisted;
    var watching = meta.watching !== false;
    var pub = FF.UI.switchRow({
      label: FF.t('publicRoom', 'Public'),
      description: isPublic
        ? FF.t('publicOnHint', 'Anyone can find this game on Watch live.')
        : FF.t('publicOffHint', 'Only people with the watch link can watch.'),
      checked: isPublic,
      onChange: function (on) {
        B.setPublic(on).then(renderFn, function (e) {
          FF.UI.toast(e && e.message === 'DELISTED'
            ? FF.t('delistedNote', 'An admin removed this room from Watch live.')
            : FF.t('tryAgain', 'That did not work. Try again.'), { type: 'error' });
          renderFn();
        });
      }
    });
    if (delisted) {
      var sw = pub.children[pub.children.length - 1];
      sw.disabled = true;
      sw.setAttribute('aria-disabled', 'true');
    }
    wrap.appendChild(pub);
    if (delisted) wrap.appendChild(FF.ui.el('p', { class: 'rm-watch__note' }, FF.t('delistedNote', 'An admin removed this room from Watch live.')));

    wrap.appendChild(FF.UI.switchRow({
      label: FF.t('letPeopleWatch', 'Let people watch'),
      description: watching ? FF.t('watchOnHint', 'People with the watch link can watch.') : FF.t('watchOffHint', 'Nobody can watch this room.'),
      checked: watching,
      onChange: function (on) { B.setWatching(on).then(renderFn, renderFn); }
    }));

    var actions = FF.ui.div('rm-row rm-watch__actions');
    actions.appendChild(FF.UI.button(FF.t('inviteViewers', 'Invite viewers'), { class: 'btn-soft', icon: 'link', onClick: inviteViewers }));
    actions.appendChild(FF.UI.button(FF.t('newWatchLink', 'New watch link'), {
      class: 'btn-ghost', icon: 'arrows-left-right',
      onClick: function () {
        FF.UI.confirm({
          title: FF.t('newWatchLinkQ', 'Make a new watch link?'),
          body: FF.t('newWatchLinkBody', 'The old link will stop working.'),
          confirmLabel: FF.t('newLink', 'New link'),
          onConfirm: function () {
            B.newLink().then(function () {
              FF.UI.toast(FF.t('newLinkMade', 'New watch link made'), { type: 'success' });
            }, function () { FF.UI.toast(FF.t('tryAgain', 'That did not work. Try again.'), { type: 'error' }); });
          }
        });
      }
    }));
    wrap.appendChild(actions);
    return wrap;
  }

  function scanButton(onCode, cls) {
    if (!FF.QRScan || !FF.QRScan.available()) return null;
    return FF.UI.button(FF.t('scanQr', 'Scan QR code'), {
      class: cls || 'btn-lg', icon: 'qr-scan',
      onClick: function () { FF.QRScan.open(onCode); }
    });
  }

  /* "5 min", "2 min 30 s", "45 s" */
  function spanText(secs) {
    secs = Math.round(secs || 0);
    var m = Math.floor(secs / 60), s = secs % 60;
    if (!m) return FF.t('nSec', '{n} s', { n: s });
    return s ? FF.t('nMinSec', '{m} min {s} s', { m: m, s: s }) : FF.t('nMin', '{n} min', { n: m });
  }

  /* One plain sentence about how long the game runs and the time to answer. */
  function lengthSummary(set) {
    set = set || {};
    var q = Number(set.questions) || 0, clock = Number(set.clock) || 0, timer = Number(set.timer) || 0;
    var ends;
    if (q && clock) ends = FF.t('endsQorClock', 'Ends after {q} questions or {time}, whichever comes first.', { q: q, time: spanText(clock) });
    else if (q) ends = FF.t('endsQ', 'Ends after {q} questions.', { q: q });
    else if (clock) ends = FF.t('endsClock', 'Questions keep coming until the {time} clock runs out.', { time: spanText(clock) });
    else ends = FF.t('endsUsual', 'Plays the game\u2019s usual number of questions.');
    var answer = timer
      ? FF.t('answerIn', '{time} to answer each question.', { time: spanText(timer) })
      : FF.t('answerNoLimit', 'No time limit on answers.');
    return ends + ' ' + answer;
  }

  function renameRoom(onDone) {
    var s = FF.Room.current();
    if (!s) return;
    var input = FF.ui.el('input', {
      class: 'rm-input rm-input--text', type: 'text', id: 'rm-rename-input',
      maxlength: FF.Room.NAME_MAX, value: (s.meta && s.meta.name) || '',
      placeholder: FF.Room.displayName(), autocomplete: 'off', enterkeyhint: 'done'
    });
    function save() {
      FF.Room.rename(input.value).then(function () {
        FF.UI.toast(FF.t('roomRenamed', 'Room renamed'), { type: 'success' });
        if (onDone) onDone();
      }, function (e) {
        FF.UI.toast((e && e.message) || FF.t('renameFailed', 'Could not rename the room.'), { type: 'error' });
      });
    }
    var dlg = FF.UI.dialog({
      title: FF.t('nameRoom', 'Name this room'),
      body: [
        FF.ui.el('label', { class: 'setting__label', for: 'rm-rename-input' }, FF.t('roomName', 'Room name')),
        input,
        FF.ui.el('p', {}, FF.t('nameRoomHint', 'Everyone in the room sees this name, and it shows in their saved rooms.'))
      ],
      actions: [
        { label: FF.t('cancel', 'Cancel') },
        { label: FF.t('saveName', 'Save name'), primary: true, icon: 'check', onClick: save }
      ]
    });
    input.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { save(); dlg.close(); } });
    setTimeout(function () { try { input.focus(); input.select(); } catch (e) {} }, 60);
  }

  function voicePanel(renderFn) {
    if (!FF.Voice || !FF.Voice.isSupported()) return null;
    var vWrap = FF.ui.el('section', { class: 'rm-voice', 'aria-label': FF.t('voiceChat', 'Voice chat') });
    var topRow = FF.ui.div('rm-row');
    var label = FF.ui.el('strong', { class: 'rm-voice__title' });
    label.appendChild(FF.Icons.icon('mic'));
    label.appendChild(document.createTextNode(FF.t('voiceChatOptional', 'Voice chat (optional)')));
    topRow.appendChild(label);
    if (FF.Voice.isActive()) {
      var peers = FF.Voice.peers();
      topRow.appendChild(FF.ui.span('badge badge--online', FF.t('inChatN', '{n} in chat', { n: peers.length + 1 })));
    }
    vWrap.appendChild(topRow);

    var ctrlRow = FF.ui.div('rm-row');
    if (!FF.Voice.isActive()) {
      var joinVoice = function () {
        joinBtn.disabled = true;
        FF.Voice.join().then(function () {
          FF.Audio.play('select');
          renderFn();
        }).catch(function (err) {
          joinBtn.disabled = false;
          // Mic blocked, missing or busy: show how to fix it here.
          FF.MicHelp.handle(err, joinVoice);
        });
      };
      var joinBtn = FF.UI.button(FF.t('joinVoice', 'Join voice chat'), {
        class: 'btn-primary', icon: 'mic', onClick: joinVoice
      });
      ctrlRow.appendChild(joinBtn);
      vWrap.appendChild(ctrlRow);
      vWrap.appendChild(FF.ui.el('p', { class: 'rm-hint' }, FF.t('voicePrivacy', 'Voice goes straight between devices in this room and is never recorded.')));
    } else {
      var muted = FF.Voice.isMuted();
      var muteBtn = FF.UI.button(muted ? FF.t('micUnmute', 'Unmute') : FF.t('micMute', 'Mute'), {
        class: muted ? 'btn-danger' : '', icon: muted ? 'mic-off' : 'mic',
        onClick: function () { FF.Voice.toggleMute(); FF.Audio.play('click'); renderFn(); }
      });
      muteBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
      var deaf = FF.Voice.isDeafened();
      var deafBtn = FF.UI.button(deaf ? FF.t('undeafen', 'Hear others') : FF.t('deafen', 'Silence others'), {
        icon: 'speaker',
        onClick: function () { FF.Voice.toggleDeafen(); FF.Audio.play('click'); renderFn(); }
      });
      deafBtn.setAttribute('aria-pressed', deaf ? 'true' : 'false');
      var leaveVoiceBtn = FF.UI.button(FF.t('leaveVoice', 'Leave voice'), {
        class: 'btn-ghost', icon: 'close',
        onClick: function () { FF.Voice.leave(); FF.Audio.play('click'); renderFn(); }
      });
      ctrlRow.appendChild(muteBtn);
      ctrlRow.appendChild(deafBtn);
      ctrlRow.appendChild(leaveVoiceBtn);
      vWrap.appendChild(ctrlRow);
    }
    return vWrap;
  }

  // Characters that take turns waving while a room connects.
  var LOAD_CAST = ['fox', 'nia', 'bolt', 'kenji', 'unicorn', 'amara', 'panda', 'astronaut'];

  FF.RoomUI = {
    ONLINE_GAMES: ONLINE_GAMES,

    /* The Watch live page (its own page, so viewers need no account). */
    openWatch: function () {
      window.location.href = FF.page ? FF.page('watch') : 'watch';
    },

    /* A playful waiting screen for the moments that need a network round
       trip. Returns a handle: setStatus(text) to update the caption, and
       stop() when the screen is replaced. */
    /* True while a room screen other than the Play online page is showing,
       so the app does not redraw that page over it. */
    busy: function () { return screenName !== 'home'; },

    showLoading: function (main, opts) {
      opts = opts || {};
      resetScreen('loading');
      FF.ui.clear(main);

      var castImg = FF.Avatars.img(LOAD_CAST[0], 'rm-load__ava');
      var stage = FF.UI.loader({ size: 'xl', center: castImg, className: 'rm-load__stage' });

      var status = FF.ui.div('rm-load__status', (opts.messages && opts.messages[0]) || 'Connecting…');
      status.setAttribute('role', 'status');

      var box = FF.ui.div('rm-load');
      box.appendChild(stage);
      box.appendChild(status);

      main.appendChild(panel([title(opts.title || FF.t('gettingReady', 'Getting ready')), box]));

      // Cycle the face and the caption so the wait feels alive rather than
      // frozen - people read a static 'Connecting...' as a hang.
      var i = 0;
      var faceTimer = setInterval(function () {
        i = (i + 1) % LOAD_CAST.length;
        castImg.src = FF.Avatars.url(LOAD_CAST[i]);
      }, 620);

      var msgTimer = null;
      if (opts.messages && opts.messages.length > 1) {
        var m = 0;
        msgTimer = setInterval(function () {
          m = (m + 1) % opts.messages.length;
          status.textContent = opts.messages[m];
        }, 1600);
      }

      return {
        setStatus: function (text) {
          if (msgTimer) { clearInterval(msgTimer); msgTimer = null; }
          status.textContent = text;
        },
        stop: function () {
          clearInterval(faceTimer);
          if (msgTimer) clearInterval(msgTimer);
        }
      };
    },

    /* The Online page: the ways to play with other people. */
    showHome: function (main) {
      resetScreen('home');
      FF.ui.clear(main);
      var self = this;
      var t = FF.t;

      var head = FF.ui.div('online-head');
      head.appendChild(FF.ui.el('h1', { class: 'page-title' }, t('playOnline', 'Play online')));
      head.appendChild(FF.ui.el('p', { class: 'page-sub' }, t('playOnlineSub', 'Play with people on their own phones, wherever they are.')));
      main.appendChild(head);

      var grid = FF.ui.el('ul', { class: 'mode-grid' });
      function card(o) {
        var li = FF.ui.el('li', { class: 'mode-card-item' });
        var b = FF.ui.el('button', { type: 'button', class: 'mode-card mode-card--' + o.tone, 'aria-describedby': o.id + '-desc' });
        var top = FF.ui.div('mode-card__top');
        var ic = FF.ui.span('mode-card__icon');
        ic.appendChild(FF.Icons.icon(o.icon));
        top.appendChild(ic);
        if (o.soon) top.appendChild(FF.ui.span('mode-card__soon', t('comingSoon', 'Coming soon')));
        else if (o.badge) top.appendChild(FF.ui.span('mode-card__badge', o.badge));
        else if (o.cast) top.appendChild(o.cast);
        b.appendChild(top);
        var h = FF.ui.el('h2', { class: 'mode-card__title', id: o.id }, o.title);
        h.appendChild(FF.Icons.icon('chevron-right'));
        b.appendChild(h);
        b.appendChild(FF.ui.el('p', { class: 'mode-card__desc', id: o.id + '-desc' }, o.desc));
        b.addEventListener('click', o.onClick);
        li.appendChild(b);
        grid.appendChild(li);
      }

      var cast = FF.ui.span('mode-card__cast');
      ['nia', 'fox', 'kenji', 'unicorn'].forEach(function (id) { cast.appendChild(FF.Avatars.img(id, 'mode-card__ava')); });

      card({
        id: 'mode-friends', tone: 'blue', icon: 'users', cast: cast,
        title: t('playWithFriends', 'Play with friends'),
        desc: t('playWithFriendsDesc', 'Make a private room and share the code. Everyone plays at the same time on their own phone.'),
        onClick: function () { FF.Access.gate('online', function () { self.showFriends(main); }); }
      });
      card({
        id: 'mode-watch', tone: 'teal', icon: 'eye',
        title: t('watchLive', 'Watch live'),
        desc: t('watchLiveDesc', 'Watch public games being played right now.'),
        // Open to everyone, guests included.
        onClick: function () { self.openWatch(); }
      });
      var daily = FF.Daily && FF.Daily.today();
      card({
        id: 'mode-daily', tone: 'purple', icon: 'calendar',
        badge: daily ? t('doneToday', 'Done today') : t('newToday', 'New today'),
        title: t('dailyChallenge', 'Daily challenge'),
        desc: t('dailyCardDesc', '10 questions, the same for everyone. One try a day, with a daily leaderboard.'),
        onClick: function () { FF.Access.gate('daily', function () { FF.Nav.go('daily'); }); }
      });
      card({
        id: 'mode-challenge', tone: 'pink', icon: 'swords',
        title: t('challengeFriend', 'Challenge a friend'),
        desc: t('challengeCardDesc', 'Set a score and send a link. Your friend plays the same questions whenever they like.'),
        onClick: function () { FF.Access.gate('challenge', function () { FF.Nav.go('challenges'); }); }
      });
      card({
        id: 'mode-match', tone: 'green', icon: 'globe', soon: true,
        title: t('quickMatch', 'Quick match'),
        desc: t('quickMatchDesc', 'Get matched with players or teams who are online and ready to play right now.'),
        onClick: function () { self.showQuickMatch(main); }
      });
      card({
        id: 'mode-leagues', tone: 'teal', icon: 'medal', soon: true,
        title: t('leagues', 'Leagues'),
        desc: t('leaguesDesc', 'Weekly leagues with players at your level. Finish near the top to move up.'),
        onClick: function () { self.showLeagues(main); }
      });
      card({
        id: 'mode-tours', tone: 'orange', icon: 'trophy', soon: true,
        title: t('tournaments', 'Tournaments'),
        desc: t('tournamentsDesc', 'Register for tournaments hosted by PlayMona. Play the rounds and climb the leaderboard.'),
        onClick: function () { self.showTournaments(main); }
      });
      main.appendChild(grid);
      FF.Nav.focusFirst(main);
    },

    /* Play with friends: private rooms with a code. */
    showFriends: function (main) {
      resetScreen('friends');
      FF.ui.clear(main);
      var self = this;
      var children = [
        hero('users', FF.t('playWithFriends', 'Play with friends'), FF.t('playTogetherLead', 'Everyone plays the same game at the same time, each on their own phone or tablet. The first correct answer wins the point.'))
      ];
      var saved = FF.Room.saved.list();
      if (saved.length) {
        children.push(FF.ui.el('h2', { class: 'rm-subtitle' }, FF.t('yourRooms', 'Your rooms')));
        var list = FF.ui.el('ul', { class: 'rm-saved' });
        saved.forEach(function (r) {
          var label = r.name || FF.t('roomCodeN', 'Room {code}', { code: r.code });
          var info = FF.ui.div('rm-saved__info', [
            FF.ui.div('rm-saved__name', label),
            FF.ui.div('rm-saved__code', r.code + (r.mode === 'teams' ? ' \u00b7 ' + FF.t('inTeams', 'In teams') : ''))
          ]);
          var join = FF.UI.button(FF.t('open', 'Open'), {
            class: 'btn-primary', icon: 'arrow-right', ariaLabel: FF.t('openRoomName', 'Open {name}', { name: label }),
            onClick: function () { self.joinCode(main, r.code); }
          });
          var remove = FF.UI.iconButton('trash', FF.t('removeRoomName', 'Remove {name} from your rooms', { name: label }), function () {
            FF.Room.saved.remove(r.code);
            FF.UI.toast(FF.t('roomRemoved', 'Removed from your rooms'));
            self.showFriends(main);
          }, 'rm-saved__remove');
          list.appendChild(FF.ui.el('li', { class: 'rm-saved__item' }, [info, join, remove]));
        });
        children.push(list);
        children.push(FF.ui.el('h2', { class: 'rm-subtitle' }, FF.t('newRoomOrCode', 'Start or join another room')));
      }
      children.push(FF.UI.button(FF.t('createRoom', 'Create a room'), { class: 'btn-lg' + (saved.length ? '' : ' btn-primary'), icon: 'plus', onClick: function () { self.showModePicker(main); } }));
      children.push(FF.UI.button(FF.t('joinRoom', 'Join with a code'), { class: 'btn-lg', icon: 'arrow-right', onClick: function () { self.showJoin(main, FF.Room.codeFromUrl()); } }));
      children.push(scanButton(function (code) { self.joinCode(main, code); }));
      children.push(FF.ui.el('p', { class: 'rm-hint' }, FF.t('roomPrivacy', 'Rooms are private: only people with the code can join. Names and characters are shared while the room is open.')));
      children.push(backButton(function () { self.showHome(main); }));
      main.appendChild(panel(children));
      FF.Nav.focusFirst(main);
    },

    /* Open a room straight from a link, a QR code or a saved room, with this
       player's usual name. Falls back to the join form when that fails or
       when this device has never chosen a name. */
    joinCode: function (main, code) {
      var self = this;
      code = String(code || '').toUpperCase();
      var id = FF.Room.identity();
      var signedIn = !!(FF.Auth && FF.Auth.profile && FF.Auth.profile() && !(FF.Auth.isGuest && FF.Auth.isGuest()));
      if (!signedIn && (!id.name || id.name === 'Player')) { this.showJoin(main, code); return; }
      var load = this.showLoading(main, {
        title: FF.t('joiningRoom', 'Joining the room'),
        messages: ['Knocking on the door\u2026', 'Finding the other players\u2026', 'Taking your seat\u2026']
      });
      FF.Room.join(code, {}).then(function () {
        load.stop();
        self.showLobby(main);
      }).catch(function (e) {
        load.stop();
        if (e && e.message === 'VERSION_MISMATCH') { self.showVersionBlock(main); return; }
        self.showJoin(main, code);
        var err = main.querySelector('.rm-error');
        if (err) err.textContent = (e && e.message) || 'Could not join that room.';
      });
    },

    // Quick match: placeholder until matchmaking is planned.
    showQuickMatch: function (main) {
      this.showComingSoon(main, {
        icon: 'globe', tone: 'green',
        title: FF.t('quickMatch', 'Quick match'),
        lead: FF.t('quickMatchLead', 'Soon you will be able to play with anyone who is online, not just people you know.'),
        planned: [
          FF.t('findPlan1', 'Quick match: pick a game and get paired with players who are online now.'),
          FF.t('findPlan2', 'Join a team that needs players, or fill your own team.'),
          FF.t('findPlan3', 'See who is online and ready to play.')
        ]
      });
    },

    // Leagues: placeholder until they are planned.
    showLeagues: function (main) {
      this.showComingSoon(main, {
        icon: 'medal', tone: 'teal',
        title: FF.t('leagues', 'Leagues'),
        lead: FF.t('leaguesLead', 'Compete each week with players at your level.'),
        planned: [
          FF.t('leaguePlan1', 'Join a weekly group of about 20 players.'),
          FF.t('leaguePlan2', 'Every game you play earns league points.'),
          FF.t('leaguePlan3', 'Finish near the top to move up a division: Bronze, Silver, Gold and beyond.')
        ]
      });
    },

    // Tournaments: placeholder until they are planned.
    showTournaments: function (main) {
      this.showComingSoon(main, {
        icon: 'trophy', tone: 'orange',
        title: FF.t('tournaments', 'Tournaments'),
        lead: FF.t('tournamentsLead', 'Game tournaments hosted by PlayMona, open to everyone who registers.'),
        planned: [
          FF.t('tourPlan1', 'Browse upcoming tournaments and register to join.'),
          FF.t('compPlan2', 'Play the rounds at set times, on your own or in a team.'),
          FF.t('compPlan3', 'Follow the live leaderboard and see the winners.')
        ],
        empty: FF.t('noTournaments', 'No tournaments are open yet.')
      });
    },

    showComingSoon: function (main, o) {
      resetScreen('soon');
      FF.ui.clear(main);
      var self = this;
      var h = hero(o.icon, o.title, o.lead);
      h.classList.add('rm-hero--' + o.tone);
      h.insertBefore(FF.ui.span('mode-card__soon', FF.t('comingSoon', 'Coming soon')), h.children[1]);
      var plan = FF.ui.el('section', { class: 'soon-plan', 'aria-labelledby': 'soon-plan-title' });
      plan.appendChild(FF.ui.el('h2', { class: 'soon-plan__title', id: 'soon-plan-title' }, FF.t('whatsPlanned', 'What is planned')));
      var list = FF.ui.el('ul', { class: 'soon-plan__list' });
      o.planned.forEach(function (line) {
        var li = FF.ui.el('li', {});
        li.appendChild(FF.Icons.icon('check'));
        li.appendChild(FF.ui.span('', line));
        list.appendChild(li);
      });
      plan.appendChild(list);
      main.appendChild(panel([
        h,
        o.empty ? FF.ui.el('p', { class: 'soon-empty' }, o.empty) : null,
        plan,
        FF.UI.button(FF.t('playWithFriendsNow', 'Play with friends now'), { class: 'btn-lg btn-primary', icon: 'users', onClick: function () { self.showFriends(main); } }),
        backButton(function () { self.showHome(main); })
      ]));
      FF.Nav.focusFirst(main);
    },

    showModePicker: function (main) {
      resetScreen('modes');
      FF.ui.clear(main);
      var self = this;
      main.appendChild(panel([
        hero('users', FF.t('howPlaying', 'How are you playing?')),
        FF.UI.button(FF.t('asIndividuals', 'As individual players'), { class: 'btn-lg btn-primary', icon: 'user', onClick: function () { self.showCreate(main, 'players'); } }),
        FF.ui.div('rm-hint', FF.t('asIndividualsDesc', 'Each device is one player with their own score.')),
        FF.UI.button(FF.t('inTeams', 'In teams'), { class: 'btn-lg', icon: 'users', onClick: function () { self.showCreate(main, 'teams'); } }),
        FF.ui.div('rm-hint', FF.t('inTeamsDesc', 'Each device picks a team, and points go to the team.')),
        backButton(function () { self.showFriends(main); })
      ]));
      FF.Nav.focusFirst(main);
    },

    showCreate: function (main, mode) {
      var self = this;
      var load = this.showLoading(main, {
        title: FF.t('buildingRoom', 'Building your room'),
        messages: [
          'Waking up the game room…',
          'Shuffling the questions…',
          'Printing your room code…'
        ]
      });

      FF.Room.create({ mode: mode }).then(function () {
        load.stop();
        self.showLobby(main);
      }).catch(function (e) {
        load.stop();
        self.showError(main, e.message || 'Could not create the room.');
      });
    },

    showJoin: function (main, prefill) {
      resetScreen('join');
      FF.ui.clear(main);
      var self = this;
      var id = FF.Room.identity();

      var codeInput = FF.ui.el('input', {
        class: 'rm-input', type: 'text', maxlength: 6, id: 'rm-code-input',
        value: prefill || '', placeholder: 'ABC123',
        autocapitalize: 'characters', autocorrect: 'off', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'go'
      });
      var nameInput = FF.ui.el('input', {
        class: 'rm-input rm-input--text', type: 'text', maxlength: 14, id: 'rm-name-input',
        value: id.name, autocomplete: 'nickname', enterkeyhint: 'go'
      });
      var error = FF.ui.el('div', { class: 'rm-error', role: 'alert' }, '');
      var joinBtn;

      function go() {
        error.textContent = '';
        if (joinBtn) joinBtn.disabled = true;

        var code = codeInput.value;
        var name = nameInput.value || 'Player';

        // Only take over the screen once the code looks plausible, so a
        // typo still shows the inline error rather than a flash of loading.
        var load = null;
        if (String(code).trim().length === FF.Room.CODE_LENGTH) {
          load = self.showLoading(main, {
            title: FF.t('joiningRoom', 'Joining the room'),
            messages: [
              'Knocking on the door…',
              'Finding the other players…',
              'Taking your seat…'
            ]
          });
        }

        FF.Room.join(code, { name: name }).then(function () {
          if (load) load.stop();
          self.showLobby(main);
        }).catch(function (e) {
          if (load) {
            // The loading screen replaced the form, so rebuild it and put
            // the message where the player can act on it.
            load.stop();
            self.showJoin(main, code);
            if (e && e.message === 'VERSION_MISMATCH') { self.showVersionBlock(main); return; }
            var err = main.querySelector('.rm-error');
            if (err) err.textContent = (e && e.message) || 'Could not join that room.';
            return;
          }
          if (joinBtn) joinBtn.disabled = false;
          if (e && e.message === 'VERSION_MISMATCH') { self.showVersionBlock(main); return; }
          error.textContent = (e && e.message) || 'Could not join that room.';
        });
      }

      codeInput.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') go(); });
      nameInput.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') go(); });

      joinBtn = FF.UI.button(FF.t('join', 'Join'), { class: 'btn-lg btn-primary', icon: 'arrow-right', onClick: go });

      main.appendChild(panel([
        hero('arrow-right', FF.t('joinARoom', 'Join a room'), FF.t('enterCode', 'Enter the 6-character code from the host’s screen.')),
        FF.ui.el('label', { class: 'setting__label', for: 'rm-code-input' }, FF.t('roomCode', 'Room code')),
        codeInput,
        FF.ui.el('label', { class: 'setting__label', for: 'rm-name-input' }, FF.t('yourName', 'Your name')),
        nameInput,
        error,
        joinBtn,
        scanButton(function (code) { codeInput.value = code; go(); }),
        backButton(function () { self.showFriends(main); })
      ]));
      FF.Nav.focusFirst(main);
    },

    showLobby: function (main) {
      var self = this;
      if (!FF.Room.current()) { this.showHome(main); return; }
      // Coming back to the lobby while the countdown runs: show the countdown.
      var cur = FF.Room.current();
      if (this._starting && cur.meta && cur.meta.status === 'playing') { this.startWhenReady(main, cur.meta); return; }

      resetScreen('lobby');
      trackViewers();

      // Remembered across re-renders so an arriving player does not reset
      // the host's choice.
      // The host picks a game first; the list then folds away and the
      // settings for that game appear. "Change game" opens the list again.
      var chosen = self._lastGame || null;
      // Back from a game: the ready check is over, so the host picks again
      // (the last game stays chosen) and everyone else waits on step 5.
      if (self._step === 5 && !(cur.meta && cur.meta.pick) && cur.isHost) self._step = chosen ? 4 : 3;
      if (!self._roomSettings) {
        self._roomSettings = {
          difficulty: (FF.Settings && FF.Settings.get('difficulty')) || 'normal',
          timer: FF.Settings ? FF.Settings.get('timer') : 20,
          questions: 0,   // 0 = the game's usual number
          clock: 0        // seconds; 0 = no game clock
        };
      }
      var rs = self._roomSettings;

      function settingRow(label, node) { return FF.UI.settingRow(label, node); }

      function segs(opts, key, label) {
        return FF.UI.segmented({
          label: label,
          value: rs[key],
          options: opts.map(function (o) { return { label: FF.t(o[1], o[0]), value: o[1] }; }),
          onChange: function (v) { rs[key] = v; }
        });
      }

      // Pick a game: cover cards with the name on a scrim, and a search box.
      function gameGrid(onPick) {
        var grid = FF.ui.div('rm-games');
        var q = String(self._gameQuery || '').trim().toLowerCase();
        var shown = 0;
        ONLINE_GAMES.forEach(function (id) {
          var def = FF.Games.get(id);
          if (!def) return;
          var cat = (FF.Categories && FF.Categories[def.category]) || { name: def.category, color: '#8b5cf6' };
          if (q && (def.name + ' ' + (cat.name || '') + ' ' + (def.description || '')).toLowerCase().indexOf(q) === -1) return;
          shown++;

          // The host needs the game (Plus games, or free plays left); everyone else joins free.
          var pay = FF.Access && FF.Access.cardBadge ? FF.Access.cardBadge(id) : null;
          var hasArt = FF.Assets.has('covers', id);
          var card = FF.ui.el('button', {
            class: 'rm-game' + (hasArt ? ' rm-game--art' : '') + (id === chosen ? ' rm-game--on' : '') + (pay && pay.kind === 'plus' ? ' rm-game--plus' : ''),
            type: 'button',
            'aria-pressed': id === chosen ? 'true' : 'false',
            'aria-label': def.name + '. ' + cat.name + (pay ? '. ' + pay.text : ''),
            style: { '--rm-game-color': cat.color, '--art': FF.Assets.artUrl('covers', id), '--wash': FF.Assets.wash(def.category) },
            onclick: function () {
              if (FF.Access && !FF.Access.canPlay(id)) { FF.Access.explain(id); return; }
              chosen = id;
              self._lastGame = id;
              FF.Audio.play('select');
              onPick();
            }
          });
          if (!hasArt) {
            var gi = FF.ui.div('rm-game__icon');
            gi.appendChild(FF.Icons.icon(FF.Icons.game[id] || cat.iconKey, def.icon || '🎮'));
            card.appendChild(gi);
          }
          if (id === chosen) {
            var tick = FF.ui.span('rm-game__tick');
            tick.appendChild(FF.Icons.icon('check'));
            card.appendChild(tick);
          }
          var label = FF.ui.div('rm-game__label');
          label.appendChild(FF.ui.div('rm-game__name', def.name));
          label.appendChild(FF.ui.div('rm-game__cat', cat.name));
          card.appendChild(label);
          if (pay) {
            var tag = FF.ui.span('rm-game__pay rm-game__pay--' + pay.kind);
            tag.appendChild(FF.Icons.icon(pay.kind === 'plus' ? 'crown' : 'play'));
            tag.appendChild(document.createTextNode(pay.text));
            card.appendChild(tag);
          }
          grid.appendChild(card);
        });
        if (!shown) {
          grid.appendChild(FF.UI.emptyState({ icon: 'search', title: FF.t('noGamesFound', 'No games found'), text: FF.t('rmTryAnother', 'Try another name, like Quiz or Tap.') }));
        }
        return grid;
      }

      function searchBox(onChange) {
        var box = FF.ui.div('searchbox rm-search');
        var sIcon = FF.ui.span('searchbox__icon');
        sIcon.appendChild(FF.Icons.icon('search'));
        box.appendChild(sIcon);
        var input = FF.ui.el('input', {
          type: 'search', class: 'input searchbox__input', id: 'rm-game-search',
          placeholder: FF.t('searchPlaceholder', 'Search games'), 'aria-label': FF.t('searchGames', 'Search games'),
          autocomplete: 'off', enterkeyhint: 'search', value: self._gameQuery || ''
        });
        input.addEventListener('input', function () { self._gameQuery = input.value; onChange(); });
        box.appendChild(input);
        var clear = FF.UI.iconButton('close', FF.t('clearSearch', 'Clear search'), function () {
          input.value = ''; self._gameQuery = ''; onChange(); input.focus();
        }, 'searchbox__clear');
        clear.hidden = !self._gameQuery;
        box.appendChild(clear);
        return box;
      }

      var STEPS = [
        { key: 'invite', icon: 'users-three', label: FF.t('rmStepInvite', 'Invite') },
        { key: 'voice', icon: 'speaker', label: FF.t('rmStepVoice', 'Voice') },
        { key: 'game', icon: 'game-controller', label: FF.t('rmStepGame', 'Game') },
        { key: 'settings', icon: 'sliders', label: FF.t('rmStepSettings', 'Settings') },
        { key: 'ready', icon: 'check', label: FF.t('rmStepReady', 'Ready') }
      ];
      if (!self._step) self._step = 1;

      function goStep(n) {
        self._step = Math.max(1, Math.min(STEPS.length, n));
        FF.Audio.play('click');
        render();
        var top = main.querySelector('.rm-steps');
        if (top && top.scrollIntoView) { try { top.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} }
      }

      function stepper(s, players, pick) {
        var nav = FF.ui.el('nav', { class: 'rm-steps', 'aria-label': FF.t('rmSteps', 'Room setup') });
        STEPS.forEach(function (st, i) {
          var n = i + 1;
          var done = n < self._step;
          var btn = FF.ui.el('button', {
            type: 'button',
            class: 'rm-step' + (n === self._step ? ' rm-step--on' : '') + (done ? ' rm-step--done' : ''),
            'aria-current': n === self._step ? 'step' : null,
            'aria-label': FF.t('rmStepN', 'Step {n}: {label}', { n: n, label: st.label }),
            onclick: function () { goStep(n); }
          });
          var dot = FF.ui.span('rm-step__dot');
          if (done) dot.appendChild(FF.Icons.icon('check'));
          else dot.appendChild(document.createTextNode(String(n)));
          btn.appendChild(dot);
          btn.appendChild(FF.ui.span('rm-step__label', st.label));
          if (st.key === 'invite') btn.appendChild(FF.ui.span('rm-step__badge', String(players.length)));
          if (st.key === 'ready' && pick) {
            var readyCount = players.filter(function (p) { return p.ready === pick.id; }).length;
            btn.appendChild(FF.ui.span('rm-step__badge' + (readyCount === players.length ? ' rm-step__badge--ok' : ''), readyCount + '/' + players.length));
          }
          nav.appendChild(btn);
        });
        return nav;
      }

      function stepNav(backLabel, nextLabel, onNext, opts) {
        opts = opts || {};
        var row = FF.ui.div('rm-stepnav');
        if (self._step > 1) {
          row.appendChild(FF.UI.button(backLabel || FF.t('back', 'Back'), { class: 'btn-ghost', icon: 'arrow-left', onClick: function () { goStep(self._step - 1); } }));
        }
        if (nextLabel) {
          var next = FF.UI.button(nextLabel, { class: 'btn-lg btn-primary', icon: opts.icon || 'arrow-right', onClick: onNext || function () { goStep(self._step + 1); } });
          if (opts.disabled) next.disabled = true;
          row.appendChild(next);
        }
        return row;
      }

      // Who's here, with the newest arrival popping in.
      function lobbyChips(players, myUid) {
        var list = playerChips(players, myUid);
        var fresh = self._fresh || {};
        var now = Date.now();
        Array.prototype.forEach.call(list.children || [], function (chip) {
          var uid = chip.dataset && chip.dataset.uid;
          if (uid && fresh[uid] && fresh[uid] > now) chip.classList.add('rm-player--joined');
        });
        return list;
      }

      // Toast, sound and a pop for anyone new since the last draw.
      function noticeArrivals(s, players) {
        if (self._seenCode !== s.code) { self._seenCode = s.code; self._seen = null; }
        var seen = self._seen;
        self._fresh = self._fresh || {};
        if (!seen) {
          self._seen = {};
          players.forEach(function (p) { self._seen[p.uid] = true; });
          return;
        }
        players.forEach(function (p) {
          if (seen[p.uid]) return;
          seen[p.uid] = true;
          if (p.uid === s.uid) return;
          // Highlighted for a moment, through any redraws in between.
          self._fresh[p.uid] = Date.now() + 1600;
          FF.Audio.play('streak');
          FF.UI.toast(FF.t('rmJoined', '{name} joined the room', { name: p.name }), { type: 'success', duration: 2600 });
          if (FF.UI.announce) FF.UI.announce(FF.t('rmJoined', '{name} joined the room', { name: p.name }));
        });
        // Someone who left and comes back is announced again.
        Object.keys(seen).forEach(function (uid) {
          if (!players.some(function (p) { return p.uid === uid; })) delete seen[uid];
        });
      }

      function currentSettings() {
        return { difficulty: rs.difficulty, timer: rs.timer, questions: rs.questions || 0, clock: rs.clock || 0 };
      }

      // Step 4 -> 5: tell everyone what we're playing. The same game and
      // settings keep their id, so nobody has to tap ready twice.
      function publishPick() {
        var s = FF.Room.current();
        if (!s || !chosen) return;
        if (FF.Access && !FF.Access.canPlay(chosen)) { FF.Access.explain(chosen); return; }
        var settings = currentSettings();
        var old = s.meta && s.meta.pick;
        var same = old && old.gameId === chosen && JSON.stringify(old.settings || {}) === JSON.stringify(settings);
        var pick = same ? old : { id: FF.util.uid() + FF.util.uid(), gameId: chosen, settings: settings };
        var p = same ? Promise.resolve() : FF.Room.setPick(pick);
        p.then(function () {
          // The host is ready by choosing; they can still undo it.
          return FF.Room.setReady(pick.id);
        }).then(function () {
          self._step = 5;
          FF.Audio.play('select');
          render();
        }).catch(function (err) {
          self.showError(main, (err && err.message) || 'The game could not be chosen.');
        });
      }

      // Everyone ready: the host's device starts the 10 second countdown.
      function maybeStart(s, pick) {
        if (!s.isHost || !pick || !FF.Room.everyoneReady()) return;
        if (self._autoStarted === pick.id) return;
        self._autoStarted = pick.id;
        FF.Audio.play('roundStart');
        FF.Room.startGame(pick.gameId, pick.settings || {}).then(function () {
          if (FF.Access) FF.Access.usePlay(pick.gameId);   // the host's free play, for limited games
        }).catch(function (err) {
          self._autoStarted = null;
          self.showError(main, (err && err.message) || 'The game could not be started.');
        });
      }

      function readyList(players, pick, myUid) {
        var list = FF.ui.el('ul', { class: 'rm-ready', 'aria-live': 'polite' });
        players.forEach(function (p) {
          var ok = !!pick && p.ready === pick.id;
          var row = FF.ui.el('li', { class: 'rm-ready__row' + (ok ? ' rm-ready__row--ok' : '') + (p.uid === myUid ? ' rm-ready__row--me' : '') });
          row.dataset.uid = p.uid;
          row.appendChild(FF.Players.avatarEl(p, 'rm-ready__ava'));
          row.appendChild(FF.ui.span('rm-ready__name', p.name + (p.uid === myUid ? ' ' + FF.t('youTag', '(you)') : '')));
          var pill = FF.ui.span('rm-ready__pill ' + (ok ? 'rm-ready__pill--ok' : 'rm-ready__pill--no'));
          pill.appendChild(FF.Icons.icon(ok ? 'check' : 'x'));
          pill.appendChild(document.createTextNode(ok ? FF.t('rmReady', 'Ready') : FF.t('rmNotReady', 'Not ready')));
          row.appendChild(pill);
          list.appendChild(row);
        });
        return list;
      }

      function render() {
        var s = FF.Room.current();
        if (!s) return;
        // Keep typing in the game search through a redraw.
        var active = document.activeElement;
        var searching = active && active.id === 'rm-game-search' ? { start: active.selectionStart, end: active.selectionEnd } : null;
        FF.ui.clear(main);

        var url = FF.Room.shareUrl(s.code);
        var players = FF.Room.presentPlayers();
        var roomName = FF.Room.displayName();
        var pick = (s.meta && s.meta.pick && s.meta.pick.id) ? s.meta.pick : null;
        var pickDef = pick ? FF.Games.get(pick.gameId) : null;
        var isSaved = FF.Room.saved.has(s.code);
        if (isSaved) FF.Room.saved.touch(s.code, { name: (s.meta && s.meta.name) || '', mode: s.meta && s.meta.mode });
        noticeArrivals(s, players);

        // A new pick from the host takes everyone else to the ready check.
        if (pick && self._seenPick !== pick.id) {
          var firstLook = self._seenPick === undefined;
          self._seenPick = pick.id;
          if (!s.isHost && !firstLook) {
            self._step = 5;
            FF.Audio.play('select');
            if (pickDef) FF.UI.toast(FF.t('rmHostPicked', 'The host picked {name}. Tap Ready.', { name: pickDef.name }), { duration: 3200 });
          } else if (!s.isHost && firstLook) {
            self._step = 5;
          }
        }
        if (!pick) self._seenPick = null;

        // Room name (host can rename), save for later, and leave: on every step.
        var head = FF.ui.div('rm-roomhead');
        var nameRow = FF.ui.div('rm-roomhead__name');
        nameRow.appendChild(FF.ui.el('h1', { class: 'page-title rm-title' }, roomName));
        if (s.isHost) {
          nameRow.appendChild(FF.UI.iconButton('pencil', FF.t('renameRoom', 'Rename room'), function () { renameRoom(render); }, 'rm-roomhead__edit'));
        }
        head.appendChild(nameRow);
        var tools = FF.ui.div('rm-row rm-roomhead__tools');
        var saveBtn = FF.UI.button(isSaved ? FF.t('savedRoom', 'Saved') : FF.t('saveRoom', 'Save room'), {
          class: isSaved ? 'btn-soft is-on' : 'btn-soft', icon: isSaved ? 'star-fill' : 'star',
          onClick: function () {
            if (FF.Room.saved.has(s.code)) {
              FF.Room.saved.remove(s.code);
              FF.UI.toast(FF.t('roomRemoved', 'Removed from your rooms'));
            } else {
              FF.Room.saved.add(s.code, { name: (s.meta && s.meta.name) || '', mode: s.meta && s.meta.mode });
              FF.UI.toast(FF.t('roomSavedToast', 'Saved. Find it under Your rooms next time, no code needed.'), { type: 'success', duration: 3500 });
            }
            render();
          }
        });
        saveBtn.setAttribute('aria-pressed', isSaved ? 'true' : 'false');
        tools.appendChild(saveBtn);
        tools.appendChild(FF.UI.button(FF.t('leaveRoom', 'Leave room'), {
          class: 'btn-danger-soft', icon: 'sign-out', onClick: function () { self.leaveRoom(main); }
        }));
        head.appendChild(tools);

        var children = [head];

        // A game is being played without this device (it stepped out, or just
        // arrived): offer to join it. The host cannot start another one meanwhile.
        var running = FF.Room.gameRunningWithoutMe && FF.Room.gameRunningWithoutMe() ? runningPanel(s) : null;
        if (running) {
          children.push(running);
          children.push(FF.ui.el('h2', { class: 'rm-subtitle' }, FF.t('whosHere', 'Who’s here ({n} of {max})', { n: players.length, max: FF.Room.MAX_PLAYERS })));
          children.push(lobbyChips(players, s.uid));
          main.appendChild(panel(children));
          FF.Nav.focusFirst(main);
          return;
        }

        children.push(stepper(s, players, pick));
        var body = FF.ui.el('section', { class: 'rm-stepbody', 'aria-labelledby': 'rm-step-title' });
        var stepKey = STEPS[self._step - 1].key;
        function stepTitle(text, hint) {
          body.appendChild(FF.ui.el('h2', { class: 'rm-steptitle', id: 'rm-step-title' }, text));
          if (hint) body.appendChild(FF.ui.el('p', { class: 'rm-hint' }, hint));
        }

        if (stepKey === 'invite') {
          stepTitle(FF.t('rmInviteTitle', 'Invite your friends'), s.isHost
            ? FF.t('shareCode', 'Share this code, or let others scan the QR code.')
            : FF.t('youreIn', 'You’re in!'));
          var invite = FF.ui.div('rm-invitegrid');
          var qrWrap = FF.ui.div('rm-qr');
          var qr = qrFor(url);
          if (qr) qrWrap.appendChild(qr);
          var side = FF.ui.div('rm-invitegrid__side');
          side.appendChild(FF.ui.el('div', { class: 'rm-code', 'aria-label': FF.t('roomCodeIs', 'Room code {code}', { code: s.code.split('').join(' ') }) }, s.code));
          side.appendChild(FF.ui.div('rm-share', [
            FF.UI.button(FF.t('copyLink', 'Copy link'), {
              icon: 'copy', onClick: function () {
                FF.Audio.play('click');
                if (navigator.clipboard && navigator.clipboard.writeText) {
                  navigator.clipboard.writeText(url).then(function () {
                    FF.UI.toast(FF.t('linkCopied', 'Link copied'), { type: 'success' });
                  }, function () { FF.UI.toast(url); });
                } else {
                  FF.UI.toast(url);
                }
              }
            }),
            navigator.share ? FF.UI.button(FF.t('share', 'Share'), {
              icon: 'share', onClick: function () { navigator.share({ title: 'PlayMona', url: url }).catch(function () {}); }
            }) : null
          ].filter(Boolean)));
          side.appendChild(FF.ui.el('p', { class: 'rm-invite__link' }, url));
          if (qr) invite.appendChild(qrWrap);
          invite.appendChild(side);
          body.appendChild(invite);
          body.appendChild(FF.ui.el('h3', { class: 'rm-subtitle' }, FF.t('whosHere', 'Who’s here ({n} of {max})', { n: players.length, max: FF.Room.MAX_PLAYERS })));
          body.appendChild(lobbyChips(players, s.uid));
          if (players.length < 2) body.appendChild(FF.ui.el('p', { class: 'rm-hint rm-waitjoin' }, FF.t('rmWaitingJoin', 'Waiting for friends to join…')));
          body.appendChild(stepNav(null, FF.t('rmNextVoice', 'Next: voice and watching')));
        } else if (stepKey === 'voice') {
          stepTitle(FF.t('rmVoiceTitle', 'Voice chat and watching'), FF.t('rmVoiceHint', 'Both are optional. You can skip this step.'));
          var vPanel = voicePanel(render);
          if (vPanel) body.appendChild(vPanel);
          if (s.isHost) {
            var wPanel = watchPanel(render);
            if (wPanel) body.appendChild(wPanel);
          }
          if (!vPanel && !(s.isHost && body.querySelector('.rm-watch'))) {
            body.appendChild(FF.UI.emptyState({ icon: 'speaker', title: FF.t('rmNoVoice', 'Nothing to set up here'), text: FF.t('rmNoVoiceText', 'Voice chat is not available on this device.') }));
          }
          body.appendChild(stepNav(null, s.isHost ? FF.t('rmNextGame', 'Next: pick a game') : FF.t('next', 'Next')));
        } else if (stepKey === 'game') {
          if (s.isHost) {
            stepTitle(FF.t('pickAGame', 'Pick a game'), FF.t('rmPickHint', 'Every game here is played by everyone at the same time.'));
            var gridHolder = FF.ui.div('rm-gamesholder');
            body.appendChild(searchBox(function () {
              var g = gameGrid(function () { goStep(4); });
              FF.ui.clear(gridHolder);
              gridHolder.appendChild(g);
              var c = body.querySelector('.searchbox__clear');
              if (c) c.hidden = !self._gameQuery;
            }));
            gridHolder.appendChild(gameGrid(function () { goStep(4); }));
            body.appendChild(gridHolder);
            body.appendChild(stepNav(null, chosen ? FF.t('rmNextSettings', 'Next: settings') : null));
          } else {
            stepTitle(FF.t('rmGameTitleGuest', 'The game'), null);
            if (pickDef) body.appendChild(pickedCard(pickDef, null));
            else body.appendChild(FF.UI.emptyState({ icon: 'clock', title: FF.t('waitingHost', 'Waiting for the host'), text: FF.t('waitingHostText', 'The host is picking a game. It will start on everyone’s screen at the same time.') }));
            body.appendChild(stepNav(null, FF.t('next', 'Next')));
          }
        } else if (stepKey === 'settings') {
          var def = chosen ? FF.Games.get(chosen) : null;
          if (s.isHost && !def) {
            stepTitle(FF.t('settingsForAll', 'Settings for everyone'), FF.t('rmPickFirst', 'Pick a game first.'));
            body.appendChild(stepNav(null, FF.t('pickAGame', 'Pick a game'), function () { goStep(3); }));
          } else if (s.isHost) {
            stepTitle(FF.t('settingsForAll', 'Settings for everyone'), null);
            body.appendChild(pickedCard(def, function () { goStep(3); }));
            var opts = FF.ui.el('section', { class: 'settings-section', id: 'rm-settings' });
            opts.appendChild(settingRow(FF.t('difficulty', 'Difficulty'), segs([['Easy', 'easy'], ['Normal', 'normal'], ['Hard', 'hard']], 'difficulty', FF.t('difficulty', 'Difficulty'))));
            // How long the game runs: a number of questions, a game clock, or
            // both (it ends at whichever comes first). Presets plus Custom.
            var summary = FF.ui.el('p', { class: 'rm-length-summary', 'aria-live': 'polite' }, lengthSummary(rs));
            var resum = function () { summary.textContent = lengthSummary(rs); };
            opts.appendChild(settingRow(FF.t('timeToAnswer', 'Time to answer'), FF.SettingsUI.duration(rs.timer, function (v) { rs.timer = v; resum(); }, {
              allowOff: true, alwaysCustom: true, label: FF.t('timeToAnswer', 'Time to answer'),
              presets: [
                { label: FF.t('noLimit', 'No limit'), value: 0 },
                { label: '10s', value: 10 }, { label: '20s', value: 20 },
                { label: '30s', value: 30 }, { label: '1m', value: 60 }
              ]
            })));
            opts.appendChild(settingRow(FF.t('numQuestions', 'Number of questions'), FF.SettingsUI.count(rs.questions, function (v) { rs.questions = v; resum(); }, {
              label: FF.t('numQuestions', 'Number of questions'), min: 1, max: 100,
              unit: FF.t('questionsUnit', 'questions'), placeholder: 12,
              presets: [
                { label: FF.t('usual', 'Usual'), value: 0 },
                { label: '5', value: 5 }, { label: '10', value: 10 },
                { label: '15', value: 15 }, { label: '20', value: 20 }
              ]
            })));
            opts.appendChild(settingRow(FF.t('gameClock', 'Game clock'), FF.SettingsUI.duration(rs.clock, function (v) { rs.clock = v; resum(); }, {
              allowOff: true, alwaysCustom: true, label: FF.t('gameClock', 'Game clock'),
              presets: [
                { label: FF.t('off', 'Off'), value: 0 },
                { label: '2m', value: 120 }, { label: '5m', value: 300 },
                { label: '10m', value: 600 }, { label: '15m', value: 900 }
              ]
            })));
            opts.appendChild(summary);
            body.appendChild(opts);
            body.appendChild(stepNav(null, FF.t('rmNextReady', 'Next: ready check'), publishPick, { icon: 'check' }));
          } else {
            stepTitle(FF.t('settingsForAll', 'Settings for everyone'), FF.t('rmHostSets', 'The host chooses these.'));
            if (pick) body.appendChild(FF.ui.el('p', { class: 'rm-length-summary' }, lengthSummary(pick.settings || {})));
            else body.appendChild(FF.ui.el('p', { class: 'rm-hint' }, FF.t('waitingHost', 'Waiting for the host')));
            body.appendChild(stepNav(null, FF.t('next', 'Next')));
          }
        } else {
          // Step 5: everyone taps ready; when all are, the countdown starts.
          if (!pick || !pickDef) {
            stepTitle(FF.t('rmReadyTitle', 'Ready check'), s.isHost ? FF.t('rmPickFirst', 'Pick a game first.') : FF.t('rmWaitPick', 'The ready check starts when the host has picked a game.'));
            if (s.isHost) body.appendChild(stepNav(null, FF.t('pickAGame', 'Pick a game'), function () { goStep(3); }));
            else body.appendChild(stepNav(null, null));
          } else {
            var readyN = players.filter(function (p) { return p.ready === pick.id; }).length;
            var all = readyN === players.length && players.length > 0;
            stepTitle(all ? FF.t('rmAllReady', 'Everyone is ready!') : FF.t('rmReadyTitle', 'Ready check'),
              all ? FF.t('rmStarting', 'Starting…') : FF.t('rmReadyCount', '{n} of {total} ready. The countdown starts when everyone is.', { n: readyN, total: players.length }));
            var mini = pickedCard(pickDef, s.isHost ? function () { goStep(3); } : null);
            mini.classList.add('rm-picked--mini');
            body.appendChild(mini);
            body.appendChild(FF.ui.el('p', { class: 'rm-length-summary' }, lengthSummary(pick.settings || {})));
            body.appendChild(readyList(players, pick, s.uid));
            var me = players.filter(function (p) { return p.uid === s.uid; })[0];
            var amReady = !!me && me.ready === pick.id;
            var readyBtn = FF.UI.button(amReady ? FF.t('rmImReady', 'I’m ready') : FF.t('rmTapReady', 'Tap when you’re ready'), {
              class: 'btn-lg rm-readybtn ' + (amReady ? 'rm-readybtn--on' : 'rm-readybtn--off'),
              icon: amReady ? 'check' : 'x',
              onClick: function () {
                FF.Audio.play(amReady ? 'click' : 'correct');
                FF.Room.setReady(amReady ? null : pick.id).catch(function () {});
              }
            });
            readyBtn.setAttribute('aria-pressed', amReady ? 'true' : 'false');
            body.appendChild(readyBtn);
            if (amReady && !all) body.appendChild(FF.ui.el('p', { class: 'rm-hint' }, FF.t('rmUndoReady', 'Tap again if you’re not ready after all.')));
            body.appendChild(stepNav(null, null));
            maybeStart(s, pick);
          }
        }

        children.push(body);
        main.appendChild(panel(children));
        if (searching) {
          var again = main.querySelector('#rm-game-search');
          if (again) { again.focus(); try { again.setSelectionRange(searching.start, searching.end); } catch (e) {} }
        } else {
          FF.Nav.focusFirst(main);
        }
      }

      // "A game is on": join it where everyone is now.
      function runningPanel(s) {
        var def = FF.Games.get(s.meta.gameId);
        var box = FF.ui.el('section', { class: 'rm-ingame', 'aria-live': 'polite' });
        box.appendChild(FF.ui.el('h2', { class: 'rm-subtitle' }, FF.t('gameOnNow', '{name} is being played', { name: def ? def.name : FF.t('aGame', 'A game') })));
        box.appendChild(FF.ui.el('p', { class: 'rm-hint' }, FF.t('joinGameHint', 'Join in and play from the question everyone is on now.')));
        box.appendChild(FF.UI.button(FF.t('joinTheGame', 'Join the game'), {
          class: 'btn-lg btn-primary', icon: 'play',
          onClick: function () { FF.Audio.play('select'); self.rejoinGame(main); }
        }));
        if (s.isHost) box.appendChild(FF.ui.el('p', { class: 'rm-hint' }, FF.t('newGameAfter', 'You can start a new game when this one ends.')));
        return box;
      }

      // The chosen game, with a button to pick another.
      function pickedCard(def, onChange) {
        var cat = (FF.Categories && FF.Categories[def.category]) || { name: def.category, color: '#8b5cf6' };
        var hasArt = FF.Assets && FF.Assets.has('covers', def.id);
        var icon = FF.ui.el('div', { class: 'rm-picked__icon' + (hasArt ? ' rm-picked__icon--art' : ''), style: hasArt ? { '--art': FF.Assets.artUrl('covers', def.id) } : null });
        if (!hasArt) icon.appendChild(FF.Icons.icon(FF.Icons.game[def.id] || cat.iconKey, def.icon || '\ud83c\udfae'));
        var info = FF.ui.div('rm-picked__info', [
          FF.ui.div('rm-picked__name', def.name),
          FF.ui.div('rm-picked__cat', cat.name),
          def.description ? FF.ui.el('p', { class: 'rm-picked__desc' }, def.description) : null
        ]);
        var change = onChange ? FF.UI.button(FF.t('changeGame', 'Change game'), { icon: 'arrows-left-right', onClick: onChange }) : null;
        var card = FF.ui.el('div', { class: 'rm-picked', style: { '--rm-game-color': cat.color }, 'aria-live': 'polite' }, [icon, info, change].filter(Boolean));
        return card;
      }

      // Redraw when something on screen changed: not on every write.
      function metaKey(m) { m = m || {}; return [m.hostUid, m.name, m.mode, m.status, m.public, m.watching, m.watchCode, m.pick && m.pick.id, FF.Room.current() && FF.Room.current().isHost].join('|'); }
      var lastMeta = metaKey(cur.meta);
      onScreen(FF.Room.on('players', render));
      onScreen(FF.Room.on('meta', function (meta) {
        if (meta && meta.status === 'playing' && meta.gameId) {
          self.startWhenReady(main, meta);
          return;
        }
        var k = metaKey(meta);
        if (k !== lastMeta) { lastMeta = k; render(); }
      }));
      if (FF.Voice) {
        var voiceKey = function (v) { return v ? [v.active, v.muted, v.deafened, v.peerCount].join('|') : ''; };
        var lastVoice = null;
        onScreen(FF.Voice.on('change', function (v) {
          var k = voiceKey(v);
          if (k === lastVoice) return;   // speaking on/off is handled below, without a redraw
          lastVoice = k;
          render();
        }));
        onScreen(FF.Voice.on('speaking', function (ev) {
          var chip = main.querySelector('.rm-player[data-uid="' + ev.uid + '"]');
          if (chip) {
            chip.classList.toggle('rm-player--speaking', !!ev.speaking);
            var ava = chip.querySelector('.rm-player__ava');
            if (ava) ava.classList.toggle('rm-player__ava--speaking', !!ev.speaking);
          }
        }));
      }
      render();
    },

    /* Leave the room. The host role passes to someone still here. */
    leaveRoom: function (main) {
      var self = this;
      var s = FF.Room.current();
      function go() {
        resetScreen('friends');
        self._step = 1;           // a new room starts at the invite step
        self._seen = null;
        self._gameQuery = '';
        if (FF.Voice) FF.Voice.leave();
        FF.Room.leave();
        FF.Room.clearUrlCode();
        self.showFriends(main);
        FF.UI.toast(FF.t('leftRoom', 'You left the room'));
      }
      if (!s) { go(); return; }
      var others = FF.Room.presentPlayers().filter(function (p) { return p.uid !== s.uid; });
      if (s.isHost && others.length) {
        FF.UI.confirm({
          title: FF.t('leaveRoomQ', 'Leave this room?'),
          body: FF.t('leaveRoomHost', '{name} becomes the host and the others can keep playing.', { name: others.slice().sort(function (a, b) { return (a.joinedAt || 0) - (b.joinedAt || 0); })[0].name }),
          confirmLabel: FF.t('leaveRoom', 'Leave room'), danger: true, icon: 'sign-out',
          onConfirm: go
        });
        return;
      }
      go();
    },

    /* Everyone counts down to the same instant and starts together. A device
       that arrives late (startAt already past) just launches straight away. */
    /* Back into the game being played, at the round everyone is on. */
    rejoinGame: function (main) {
      var s = FF.Room.current();
      if (!s || !s.meta || s.meta.status !== 'playing') return;
      this._lastStartAt = null;
      this._starting = null;
      this.startWhenReady(main, s.meta);
    },

    startWhenReady: function (main, meta) {
      var s = FF.Room.current();
      if (!s) return;
      var startToken = String(meta.startAt || 0) + ':' + String(meta.gameId || '');
      if (this._lastStartAt === startToken) return;
      // Already counting down: just put the countdown back on screen.
      if (this._starting) {
        if (this._starting.token === startToken) this._starting.draw(main);
        return;
      }

      var def = FF.Games.get(meta.gameId);
      var serverNow = function () { return s.transport.serverNow(); };
      var startAt = meta.startAt || 0;

      function launch() {
        FF.RoomUI._starting = null;
        FF.RoomUI._lastStartAt = startToken;
        resetScreen('game');
        var set = (meta && meta.settings) || {};
        FF.GameFlow.launch(meta.gameId, {
          skipIntro: true,
          room: true,
          roomStartAt: meta.startAt,
          difficulty: set.difficulty,
          length: set.length,
          timer: set.timer != null ? set.timer : undefined
        });
      }

      // Arriving after the game began (joined late, or came back): skip the
      // rounds already over and count as playing again.
      if (startAt && serverNow() - startAt > 3000) {
        if (FF.Race && FF.Race.rejoinNext) FF.Race.rejoinNext();
        if (FF.Room.rejoinGame) FF.Room.rejoinGame();
      }
      if (!startAt || serverNow() >= startAt) { launch(); return; }

      resetScreen('countdown');
      var num = null;
      var lastShown = null;
      // Drawn by a function so anything that redraws the page can put the
      // countdown straight back (it used to vanish while the clock ran on).
      function draw(target) {
        main = target || main;
        FF.ui.clear(main);
        num = FF.ui.div('rm-count__num', lastShown == null ? '' : (lastShown > 0 ? String(lastShown) : FF.t('go', 'Go!')));
        var stage = FF.ui.div('rm-count__stage', [num]);
        var wrap = panel([
          FF.ui.el('p', { class: 'rm-count__lead' }, FF.t('getReady', 'Get ready')),
          FF.ui.el('h1', { class: 'rm-count__game' }, def ? def.name : FF.t('getReady', 'Get ready')),
          stage,
          FF.ui.div('rm-hint', FF.t('startsTogether', 'Everyone starts together at zero.')),
          FF.ui.div('rm-hint', lengthSummary(meta.settings)),
          playerChips(FF.Room.presentPlayers(), s.uid)
        ]);
        wrap.classList.add('rm-count');
        main.appendChild(wrap);
      }
      this._starting = { token: startToken, draw: draw };
      draw(main);

      var launched = false;
      var iv = setInterval(function () {
        if (!FF.Room.current()) { clearInterval(iv); FF.RoomUI._starting = null; return; }
        if (!num || !num.isConnected) draw(main);   // something cleared the screen: redraw
        var left = startAt - serverNow();
        var secs = Math.max(0, Math.ceil(left / 1000));
        if (secs !== lastShown) {
          lastShown = secs;
          // A fresh number each second, so it zooms in and fades like Quick Tap's.
          var fresh = FF.ui.div('rm-count__num' + (secs > 0 ? '' : ' rm-count__num--go') + (secs > 0 && secs <= 3 ? ' rm-count__num--final' : ''), secs > 0 ? String(secs) : FF.t('go', 'Go!'));
          var holder = num.parentNode;
          if (holder) { holder.removeChild(num); holder.appendChild(fresh); }
          num = fresh;
          if (secs > 0) FF.Audio.play(secs <= 3 ? 'countdown' : 'tick');
        }
        // Everyone sees "Go!" for a moment before the game opens; the pause is
        // the same on every phone, so they still start together.
        if (left <= -600 && !launched) {
          launched = true;
          clearInterval(iv);
          FF.Audio.play('roundStart');
          launch();
        }
      }, 100);
    },
    showResults: function (main) {
      var self = this;
      if (!FF.Room.current()) { this.showHome(main); return; }

      resetScreen('results');

      function render() {
        var state = FF.Room.current();
        if (!state) return;
        FF.ui.clear(main);

        var scores = FF.Race.scores();
        var ranked = FF.Room.racePlayers().map(function (p) {
          return { uid: p.uid, name: p.name, avatar: p.avatar, points: scores[p.uid] || 0 };
        }).sort(function (a, b) { return b.points - a.points; });

        var list = FF.ui.el('ol', { class: 'results__leaderboard', style: { listStyle: 'none' } });
        ranked.forEach(function (r, i) {
          var row = FF.ui.el('li', { class: 'results__row' + (i === 0 && r.points > 0 ? ' results__row--winner' : '') });
          row.appendChild(FF.ui.el('span', { class: 'results__rank' }, ['🥇', '🥈', '🥉'][i] || String(i + 1)));
          row.appendChild(FF.Players.avatarEl(r, 'results__avatar'));
          row.appendChild(FF.ui.el('span', { class: 'results__name' }, r.name + (r.uid === state.uid ? ' ' + FF.t('youTag', '(you)') : '')));
          row.appendChild(FF.ui.el('span', { class: 'results__pts' }, FF.util.formatNumber(r.points)));
          list.appendChild(row);
        });

        var headline = (ranked.length && ranked[0].points > 0)
          ? FF.t('nameWins', '{name} wins!', { name: ranked[0].name })
          : FF.t('gameOver', 'Game over');

        var children = [hero('trophy', headline), list];

        if (state.isHost) {
          children.push(FF.UI.button('Play again', { icon: 'restart',
            class: 'btn btn-lg', primary: true,
            onClick: function () {
              FF.Audio.play('click');
              FF.Room.playAgain().catch(function (err) {
                self.showError(main, (err && err.message) || 'The room could not be restarted.');
              });
            }
          }));
        } else {
          children.push(FF.ui.div('rm-hint', FF.t('waitingHostShort', 'Waiting for the host…')));
        }

        children.push(FF.UI.button(FF.t('leaveRoom', 'Leave room'), { icon: 'sign-out',
          class: 'btn-lg btn-danger-soft',
          onClick: function () { self.leaveRoom(main); }
        }));

        main.appendChild(panel(children));
        FF.Nav.focusFirst(main);
      }

      // Play Again returns everyone to the lobby together.
      onScreen(FF.Room.on('meta', function (meta) {
        if (meta && meta.status === 'lobby') self.showLobby(main);
        else if (meta && meta.status === 'playing' && meta.gameId) self.startWhenReady(main, meta);
      }));
      onScreen(FF.Room.on('players', render));
      render();
    },

    showVersionBlock: function (main) {
      resetScreen('error');
      FF.ui.clear(main);
      main.appendChild(panel([
        hero('restart', FF.t('updateNeeded', 'Update needed'), FF.t('updateNeededText', 'This device has an older version of the game than the room. Refresh the page to update, then join again.')),
        FF.UI.button(FF.t('refreshNow', 'Refresh now'), { icon: 'restart',
          class: 'btn btn-lg', primary: true,
          onClick: function () { window.location.reload(); }
        })
      ]));
      FF.Nav.focusFirst(main);
    },

    showError: function (main, message) {
      resetScreen('error');
      FF.ui.clear(main);
      var self = this;
      main.appendChild(panel([
        hero('alert', FF.t('oops', 'Something went wrong')),
        FF.ui.el('div', { class: 'rm-error', role: 'alert' }, message),
        FF.UI.button(FF.t('back', 'Back'), { class: 'btn-lg btn-primary', icon: 'arrow-left', onClick: function () { self.showFriends(main); } })
      ]));
      FF.Nav.focusFirst(main);
    },

    /* A fixed banner for transient connection trouble. */
    banner: function (text) {
      var existing = document.getElementById('rm-banner');
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
      if (!text) return;
      var b = FF.ui.el('div', { id: 'rm-banner', class: 'rm-banner', role: 'alert' }, text);
      document.body.appendChild(b);
    }
  };
})();
