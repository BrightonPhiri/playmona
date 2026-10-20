/* ============================================================
   PLAYMORA — net/roomUI.js
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
    'visualRiddle'
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
      var joinBtn = FF.UI.button(FF.t('joinVoice', 'Join voice chat'), {
        class: 'btn-primary', icon: 'mic',
        onClick: function () {
          joinBtn.disabled = true;
          FF.Voice.join().then(function () {
            FF.Audio.play('select');
            renderFn();
          }).catch(function (err) {
            joinBtn.disabled = false;
            FF.UI.toast((err && err.message) || FF.t('voiceFailed', 'Could not join voice chat.'), { type: 'error' });
          });
        }
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

    /* A playful waiting screen for the moments that need a network round
       trip. Returns a handle: setStatus(text) to update the caption, and
       stop() when the screen is replaced. */
    showLoading: function (main, opts) {
      opts = opts || {};
      FF.ui.clear(main);

      var stage = FF.ui.div('rm-load__stage');
      var emoji = FF.ui.div('rm-load__emoji');
      var castImg = FF.Avatars.img(LOAD_CAST[0], 'rm-load__ava');
      emoji.appendChild(castImg);
      stage.appendChild(FF.ui.div('rm-load__ring'));
      stage.appendChild(FF.ui.div('rm-load__ring rm-load__ring--slow'));
      stage.appendChild(emoji);

      var dots = FF.ui.div('rm-load__dots');
      for (var d = 0; d < 4; d++) dots.appendChild(FF.ui.div('rm-load__dot'));

      var status = FF.ui.div('rm-load__status', (opts.messages && opts.messages[0]) || 'Connecting…');

      var box = FF.ui.div('rm-load');
      box.appendChild(stage);
      box.appendChild(status);
      box.appendChild(dots);

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
      FF.Room.offAll();
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
        else if (o.cast) top.appendChild(o.cast);
        b.appendChild(top);
        b.appendChild(FF.ui.el('h2', { class: 'mode-card__title', id: o.id }, o.title));
        b.appendChild(FF.ui.el('p', { class: 'mode-card__desc', id: o.id + '-desc' }, o.desc));
        var go = FF.ui.span('mode-card__go', o.cta);
        go.appendChild(FF.Icons.icon('arrow-right'));
        b.appendChild(go);
        b.addEventListener('click', o.onClick);
        li.appendChild(b);
        grid.appendChild(li);
      }

      var cast = FF.ui.span('mode-card__cast');
      ['nia', 'fox', 'kenji', 'unicorn'].forEach(function (id) { cast.appendChild(FF.Avatars.img(id, 'mode-card__ava')); });

      card({
        id: 'mode-friends', tone: 'blue', icon: 'users', cast: cast,
        title: t('playWithFriends', 'Play with friends'),
        desc: t('playWithFriendsDesc', 'Make a private room and share the code. Everyone plays the same game at the same time on their own phone.'),
        cta: t('createOrJoin', 'Create or join a room'),
        onClick: function () { self.showFriends(main); }
      });
      card({
        id: 'mode-match', tone: 'green', icon: 'globe', soon: true,
        title: t('quickMatch', 'Quick match'),
        desc: t('quickMatchDesc', 'Get matched with players or teams who are online and ready to play right now.'),
        cta: t('seeWhatsComing', 'See what is coming'),
        onClick: function () { self.showQuickMatch(main); }
      });
      card({
        id: 'mode-tours', tone: 'orange', icon: 'trophy', soon: true,
        title: t('tournaments', 'Tournaments'),
        desc: t('tournamentsDesc', 'Register for tournaments hosted by PlayMora. Play the rounds and climb the leaderboard.'),
        cta: t('seeWhatsComing', 'See what is coming'),
        onClick: function () { self.showTournaments(main); }
      });
      main.appendChild(grid);

      // Shortcut for the most common case: someone sent you a code.
      var quick = FF.ui.div('online-quick');
      quick.appendChild(FF.ui.span('online-quick__text', t('haveCode', 'Got a room code from a friend?')));
      quick.appendChild(FF.UI.button(t('joinRoom', 'Join with a code'), { class: 'btn-sm', icon: 'arrow-right', onClick: function () { self.showJoin(main, FF.Room.codeFromUrl()); } }));
      main.appendChild(quick);
      FF.Nav.focusFirst(main);
    },

    /* Play with friends: private rooms with a code. */
    showFriends: function (main) {
      FF.Room.offAll();
      FF.ui.clear(main);
      var self = this;
      main.appendChild(panel([
        hero('users', FF.t('playWithFriends', 'Play with friends'), FF.t('playTogetherLead', 'Everyone plays the same game at the same time, each on their own phone or tablet. The first correct answer wins the point.')),
        FF.UI.button(FF.t('createRoom', 'Create a room'), { class: 'btn-lg btn-primary', icon: 'plus', onClick: function () { self.showModePicker(main); } }),
        FF.UI.button(FF.t('joinRoom', 'Join with a code'), { class: 'btn-lg', icon: 'arrow-right', onClick: function () { self.showJoin(main, FF.Room.codeFromUrl()); } }),
        FF.ui.el('p', { class: 'rm-hint' }, FF.t('roomPrivacy', 'Rooms are private: only people with the code can join. Names and characters are shared while the room is open.')),
        backButton(function () { self.showHome(main); })
      ]));
      FF.Nav.focusFirst(main);
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

    // Tournaments: placeholder until they are planned.
    showTournaments: function (main) {
      this.showComingSoon(main, {
        icon: 'trophy', tone: 'orange',
        title: FF.t('tournaments', 'Tournaments'),
        lead: FF.t('tournamentsLead', 'Game tournaments hosted by PlayMora, open to everyone who registers.'),
        planned: [
          FF.t('tourPlan1', 'Browse upcoming tournaments and register to join.'),
          FF.t('compPlan2', 'Play the rounds at set times, on your own or in a team.'),
          FF.t('compPlan3', 'Follow the live leaderboard and see the winners.')
        ],
        empty: FF.t('noTournaments', 'No tournaments are open yet.')
      });
    },

    showComingSoon: function (main, o) {
      FF.Room.offAll();
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
      FF.Room.offAll();
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
        backButton(function () { self.showFriends(main); })
      ]));
      FF.Nav.focusFirst(main);
    },

    showLobby: function (main) {
      var self = this;
      if (!FF.Room.current()) { this.showHome(main); return; }

      FF.Room.offAll();

      // Remembered across re-renders so an arriving player does not reset
      // the host's choice.
      var chosen = self._lastGame || ONLINE_GAMES[0];
      if (!self._roomSettings) {
        self._roomSettings = {
          difficulty: (FF.Settings && FF.Settings.get('difficulty')) || 'normal',
          length: (FF.Settings && FF.Settings.get('length')) || 'normal',
          timer: FF.Settings ? FF.Settings.get('timer') : 20
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

      function gameGrid(onPick) {
        var grid = FF.ui.div('rm-games');
        ONLINE_GAMES.forEach(function (id) {
          var def = FF.Games.get(id);
          if (!def) return;
          var cat = (FF.Categories && FF.Categories[def.category]) || { name: def.category, color: '#8b5cf6' };

          var card = FF.ui.el('button', {
            class: 'rm-game' + (id === chosen ? ' rm-game--on' : ''),
            type: 'button',
            'aria-pressed': id === chosen ? 'true' : 'false',
            style: { '--rm-game-color': cat.color },
            onclick: function () {
              chosen = id;
              self._lastGame = id;
              FF.Audio.play('click');
              onPick();
            }
          });
          var gi = FF.ui.div('rm-game__icon');
          gi.appendChild(FF.Icons.icon(FF.Icons.game[id] || cat.iconKey, def.icon || '🎮'));
          card.appendChild(gi);
          card.appendChild(FF.ui.div('rm-game__name', def.name));
          card.appendChild(FF.ui.div('rm-game__cat', cat.name));
          grid.appendChild(card);
        });
        return grid;
      }

      function render() {
        var s = FF.Room.current();
        if (!s) return;
        FF.ui.clear(main);

        var url = FF.Room.shareUrl(s.code);
        var players = FF.Room.racePlayers();

        var qrWrap = FF.ui.div('rm-qr');
        var qr = (FF.QR && FF.QR.available()) ? FF.QR.svg(url, { size: 170 }) : null;
        if (qr) qrWrap.appendChild(qr);

        var share = FF.ui.div('rm-share', [
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
            icon: 'share', onClick: function () {
              navigator.share({ title: 'Family Fun', url: url }).catch(function () {});
            }
          }) : null
        ].filter(Boolean));

        var codeBox = FF.ui.el('div', { class: 'rm-code', 'aria-label': FF.t('roomCodeIs', 'Room code {code}', { code: s.code.split('').join(' ') }) }, s.code);

        var children = [
          hero('wifi', s.isHost ? FF.t('yourRoom', 'Your room') : FF.t('youreIn', 'You’re in!'), s.isHost ? FF.t('shareCode', 'Share this code, or let others scan the QR code.') : null),
          codeBox,
          share,
          qrWrap,
          FF.ui.el('h2', { class: 'rm-subtitle' }, FF.t('whosHere', 'Who’s here ({n} of {max})', { n: players.length, max: FF.Room.MAX_PLAYERS })),
          playerChips(players, s.uid)
        ];

        var vPanel = voicePanel(render);
        if (vPanel) children.push(vPanel);

        if (s.isHost) {
          var def = FF.Games.get(chosen);
          children.push(FF.ui.el('h2', { class: 'rm-subtitle' }, FF.t('pickAGame', 'Pick a game')));
          children.push(gameGrid(render));
          if (def) children.push(FF.ui.el('p', { class: 'rm-chosen', 'aria-live': 'polite' }, def.name + ': ' + (def.description || '')));
          var opts = FF.ui.el('section', { class: 'settings-section' });
          opts.appendChild(settingRow(FF.t('difficulty', 'Difficulty'), segs([['Easy', 'easy'], ['Normal', 'normal'], ['Hard', 'hard']], 'difficulty', FF.t('difficulty', 'Difficulty'))));
          opts.appendChild(settingRow(FF.t('gameLength', 'Game length'), segs([['Quick', 'quick'], ['Short', 'short'], ['Normal', 'normal'], ['Long', 'long']], 'length', FF.t('gameLength', 'Game length'))));
          opts.appendChild(settingRow(FF.t('timeLimit', 'Time limit'), FF.SettingsUI.duration(rs.timer, function (v) { rs.timer = v; }, { allowOff: true })));
          children.push(FF.ui.el('h2', { class: 'rm-subtitle' }, FF.t('settingsForAll', 'Settings for everyone')));
          children.push(opts);
          children.push(FF.UI.button(def ? FF.t('startName', 'Start {name}', { name: def.name }) : FF.t('startGame', 'Start game'), {
            class: 'btn-lg btn-primary', icon: 'play',
            onClick: function () {
              FF.Audio.play('roundStart');
              FF.Room.startGame(chosen, {
                difficulty: rs.difficulty,
                length: rs.length,
                timer: rs.timer
              }).catch(function (err) {
                self.showError(main, (err && err.message) || 'The game could not be started.');
              });
            }
          }));
        } else {
          children.push(FF.UI.emptyState({ icon: 'clock', title: FF.t('waitingHost', 'Waiting for the host'), text: FF.t('waitingHostText', 'The host is picking a game. It will start on everyone’s screen at the same time.') }));
        }

        children.push(FF.UI.button(FF.t('leaveRoom', 'Leave room'), {
          class: 'btn-lg btn-ghost', icon: 'close',
          onClick: function () {
            if (FF.Voice) FF.Voice.leave();
            FF.Room.leave();
            self.showFriends(main);
          }
        }));

        main.appendChild(panel(children));
        FF.Nav.focusFirst(main);
      }

      FF.Room.on('players', render);
      FF.Room.on('meta', function (meta) {
        if (meta && meta.status === 'playing' && meta.gameId) {
          self.startWhenReady(main, meta);
        }
      });
      if (FF.Voice) {
        FF.Voice.on('change', render);
        FF.Voice.on('speaking', function (ev) {
          var chip = main.querySelector('.rm-player[data-uid="' + ev.uid + '"]');
          if (chip) {
            chip.classList.toggle('rm-player--speaking', !!ev.speaking);
            var ava = chip.querySelector('.rm-player__ava');
            if (ava) ava.classList.toggle('rm-player__ava--speaking', !!ev.speaking);
          }
        });
      }
      render();
    },

    /* Everyone counts down to the same instant and starts together. A device
       that arrives late (startAt already past) just launches straight away. */
    startWhenReady: function (main, meta) {
      var s = FF.Room.current();
      if (!s) return;
      var startToken = String(meta.startAt || 0) + ':' + String(meta.gameId || '');
      if (this._lastStartAt === startToken) return;
      if (this._starting) return;

      var def = FF.Games.get(meta.gameId);
      var serverNow = function () { return s.transport.serverNow(); };
      var startAt = meta.startAt || 0;

      function launch() {
        FF.RoomUI._starting = false;
        FF.RoomUI._lastStartAt = startToken;
        FF.Room.offAll();
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

      if (!startAt || serverNow() >= startAt) { launch(); return; }

      this._starting = true;
      FF.ui.clear(main);

      var num = FF.ui.div('rm-count__num', '');
      var wrap = panel([
        FF.ui.el('h1', { class: 'rm-count__game' }, def ? def.name : FF.t('getReady', 'Get ready')),
        num,
        FF.ui.div('rm-hint', FF.t('startsTogether', 'Everyone starts together at zero.')),
        playerChips(FF.Room.racePlayers(), s.uid)
      ]);
      wrap.classList.add('rm-count');
      main.appendChild(wrap);

      var lastShown = null;
      var iv = setInterval(function () {
        if (!FF.Room.current()) { clearInterval(iv); FF.RoomUI._starting = false; return; }
        var left = startAt - serverNow();
        var secs = Math.ceil(left / 1000);
        if (secs !== lastShown) {
          lastShown = secs;
          num.textContent = secs > 0 ? String(secs) : FF.t('go', 'Go!');
          num.classList.remove('rm-count__num--pop');
          void num.offsetWidth;              // restart the pop animation
          num.classList.add('rm-count__num--pop');
          if (secs > 0 && secs <= 3) FF.Audio.play('countdown');
        }
        if (left <= 0) {
          clearInterval(iv);
          FF.Audio.play('roundStart');
          launch();
        }
      }, 100);
    },
    showResults: function (main) {
      var self = this;
      if (!FF.Room.current()) { this.showHome(main); return; }

      FF.Room.offAll();

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

        children.push(FF.UI.button(FF.t('leaveRoom', 'Leave room'), { icon: 'close',
          class: 'btn-lg btn-ghost',
          onClick: function () { FF.Room.leave(); self.showFriends(main); }
        }));

        main.appendChild(panel(children));
        FF.Nav.focusFirst(main);
      }

      // Play Again returns everyone to the lobby together.
      FF.Room.on('meta', function (meta) {
        if (meta && meta.status === 'lobby') self.showLobby(main);
        else if (meta && meta.status === 'playing' && meta.gameId) self.startWhenReady(main, meta);
      });
      FF.Room.on('players', render);
      render();
    },

    showVersionBlock: function (main) {
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
