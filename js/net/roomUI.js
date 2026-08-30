/* ============================================================
   FAMILY FUN — net/roomUI.js
   Screens for online play: create, join, lobby, results.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var ONLINE_GAMES = [
    'whereInWorld', 'mapChallenge', 'capitalChallenge', 'guessFlag',
    'guessCountry', 'guessLandmark', 'guessAnimal', 'guessFood',
    'guessObject', 'guessSport', 'guessVehicle',
    'familyQuiz', 'trueOrFalse', 'guessWho', 'pictureQuiz',
    'quickTap', 'colorReaction',
    // Parallel play: same letters for everyone, each keeps their own score.
    'letterRush'
    // Brain Battle is deliberately absent: its format is a personal
    // streak run per player, so there is no shared question to race for.
  ];

  var STYLE_READY = false;
  function ensureStyles() {
    if (STYLE_READY) return;
    STYLE_READY = true;
    if (!document || !document.head) return;
    var s = document.createElement('style');
    s.id = 'ff-roomui-style';
    s.textContent = [
      '.rm-wrap{max-width:720px;margin:0 auto;width:100%;display:flex;flex-direction:column;gap:16px;}',
      '.rm-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:2.4rem;',
      'font-weight:800;letter-spacing:.35em;text-align:center;padding:18px 6px 18px 22px;',
      'background:var(--accent-soft,#ede9fe);border-radius:18px;}',
      '.rm-share{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;}',
      '.rm-qr{display:flex;justify-content:center;padding:6px;}',
      '.rm-players{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;}',
      '.rm-player{display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;',
      'background:var(--surface,#f8fafc);border:1px solid var(--border,#e2e8f0);font-weight:700;}',
      '.rm-player--off{opacity:.45;}',
      '.rm-player__ava{font-size:1.3rem;}',
      '.rm-input{font-size:1.9rem;text-align:center;letter-spacing:.3em;text-transform:uppercase;',
      'padding:14px;border-radius:14px;border:2px solid var(--border,#e2e8f0);width:100%;',
      'box-sizing:border-box;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;}',
      '.rm-input--text{font-size:1.2rem;letter-spacing:0;text-transform:none;',
      'font-family:inherit;}',
      '.rm-error{color:#b91c1c;font-weight:700;text-align:center;min-height:1.2em;}',
      '.rm-hint{color:var(--muted,#6b7280);text-align:center;}',
      '.rm-row{display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap;}',
      '.rm-subtitle{font-size:1.05rem;font-weight:800;text-align:center;margin:6px 0 0;',
      'letter-spacing:.5px;color:var(--muted,#6b7280);text-transform:uppercase;}',
      '.rm-chosen{min-height:1.2em;font-style:italic;}',

      /* Game picker */
      '.rm-games{display:grid;gap:10px;',
      'grid-template-columns:repeat(auto-fill,minmax(104px,1fr));}',
      '.rm-game{display:flex;flex-direction:column;align-items:center;gap:4px;',
      'padding:12px 8px;border-radius:16px;cursor:pointer;text-align:center;',
      'background:var(--surface,#f8fafc);border:2px solid var(--border,#e2e8f0);',
      'color:var(--text,#111827);transition:transform .12s ease,border-color .12s ease;}',
      '.rm-game:hover{transform:translateY(-2px);border-color:var(--rm-game-color,#8b5cf6);}',
      '.rm-game:focus-visible{outline:3px solid var(--rm-game-color,#8b5cf6);outline-offset:2px;}',
      '.rm-game--on{border-color:var(--rm-game-color,#8b5cf6);',
      'box-shadow:inset 0 0 0 3px color-mix(in srgb, var(--rm-game-color,#8b5cf6) 22%, transparent);}',
      '.rm-game__icon{font-size:1.7rem;line-height:1;}',
      '.rm-game__name{font-weight:800;font-size:.86rem;line-height:1.15;}',
      '.rm-game__cat{font-size:.68rem;font-weight:700;letter-spacing:.4px;',
      'text-transform:uppercase;color:var(--rm-game-color,#8b5cf6);}',

      /* Start countdown */
      '.rm-count{align-items:center;text-align:center;gap:10px;}',
      '.rm-count__game{font-size:1.4rem;font-weight:800;}',
      '.rm-count__num{font-size:6rem;font-weight:800;line-height:1;',
      'color:var(--accent,#8b5cf6);}',
      '.rm-count__num--pop{animation:rm-pop .45s ease;}',
      '@keyframes rm-pop{from{transform:scale(.55);opacity:.35;}to{transform:scale(1);opacity:1;}}',

      /* Gamified loading */
      '.rm-load{display:flex;flex-direction:column;align-items:center;gap:18px;padding:26px 0;}',
      '.rm-load__stage{position:relative;width:132px;height:132px;}',
      '.rm-load__ring{position:absolute;inset:0;border-radius:50%;',
      'border:5px solid var(--accent-soft,#ede9fe);border-top-color:var(--accent,#8b5cf6);',
      'animation:rm-spin 1.1s linear infinite;}',
      '.rm-load__ring--slow{inset:14px;border-width:4px;opacity:.6;',
      'border-top-color:transparent;border-right-color:var(--accent,#8b5cf6);',
      'animation:rm-spin 1.8s linear infinite reverse;}',
      '.rm-load__emoji{position:absolute;inset:0;display:flex;align-items:center;',
      'justify-content:center;font-size:3.1rem;animation:rm-bob 1.5s ease-in-out infinite;}',
      '.rm-load__status{font-weight:800;font-size:1.05rem;text-align:center;min-height:1.4em;}',
      '.rm-load__dots{display:flex;gap:9px;}',
      '.rm-load__dot{width:11px;height:11px;border-radius:50%;',
      'background:var(--accent,#8b5cf6);animation:rm-bounce 1s ease-in-out infinite;}',
      '.rm-load__dot:nth-child(2){animation-delay:.15s;}',
      '.rm-load__dot:nth-child(3){animation-delay:.3s;}',
      '.rm-load__dot:nth-child(4){animation-delay:.45s;}',
      '@keyframes rm-spin{to{transform:rotate(360deg);}}',
      '@keyframes rm-bob{0%,100%{transform:translateY(-5px) scale(1);}',
      '50%{transform:translateY(5px) scale(1.08);}}',
      '@keyframes rm-bounce{0%,100%{transform:translateY(0);opacity:.45;}',
      '50%{transform:translateY(-11px);opacity:1;}}',

      /* Anyone who asked for less motion gets a calm version. */
      '[data-reduce="1"] .rm-load__ring,',
      '[data-reduce="1"] .rm-load__ring--slow,',
      '[data-reduce="1"] .rm-load__emoji,',
      '[data-reduce="1"] .rm-load__dot{animation:none;}',
      '[data-reduce="1"] .rm-load__dot{opacity:.8;}',

      '@media (max-width:420px){',
      '  .rm-games{grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px;}',
      '  .rm-code{font-size:1.9rem;letter-spacing:.28em;}',
      '  .rm-count__num{font-size:4.5rem;}',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function panel(children) {
    var w = FF.ui.div('rm-wrap');
    (children || []).forEach(function (c) { if (c) w.appendChild(c); });
    return w;
  }

  function title(text) { return FF.ui.el('h1', { class: 'section-title' }, text); }

  function backButton(fn) {
    return FF.ui.button('← Back', { class: 'btn btn-lg', onClick: fn });
  }

  function playerChips(players, myUid) {
    var list = FF.ui.div('rm-players');
    players.forEach(function (p) {
      list.appendChild(FF.ui.div('rm-player' + (p.online ? '' : ' rm-player--off'), [
        FF.ui.span('rm-player__ava', p.avatar || '😀'),
        p.name + (p.uid === myUid ? ' (you)' : '') + (p.online ? '' : ' — offline')
      ]));
    });
    return list;
  }

  var LOAD_EMOJI = ['🎮', '🎲', '🧩', '🎯', '🌍', '🎪', '🔠', '🥇'];

  FF.RoomUI = {
    ONLINE_GAMES: ONLINE_GAMES,

    /* A playful waiting screen for the moments that need a network round
       trip. Returns a handle: setStatus(text) to update the caption, and
       stop() when the screen is replaced. */
    showLoading: function (main, opts) {
      ensureStyles();
      opts = opts || {};
      FF.ui.clear(main);

      var stage = FF.ui.div('rm-load__stage');
      var emoji = FF.ui.div('rm-load__emoji', LOAD_EMOJI[0]);
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

      main.appendChild(panel([title(opts.title || '🌐 Getting ready'), box]));

      // Cycle the face and the caption so the wait feels alive rather than
      // frozen - people read a static 'Connecting...' as a hang.
      var i = 0;
      var faceTimer = setInterval(function () {
        i = (i + 1) % LOAD_EMOJI.length;
        emoji.textContent = LOAD_EMOJI[i];
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

    showHome: function (main) {
      ensureStyles();
      FF.Room.offAll();
      FF.ui.clear(main);
      var self = this;
      main.appendChild(panel([
        title('🌐 PLAY TOGETHER'),
        FF.ui.div('rm-hint', 'Everyone plays the same game at the same time, on their own device. First correct answer takes the point.'),
        FF.ui.button('➕ CREATE A ROOM', {
          class: 'btn btn-lg', primary: true,
          onClick: function () { self.showModePicker(main); }
        }),
        FF.ui.button('🔑 JOIN WITH A CODE', {
          class: 'btn btn-lg',
          onClick: function () { self.showJoin(main, FF.Room.codeFromUrl()); }
        }),
        backButton(function () { FF.Nav.go('home'); })
      ]));
      FF.Nav.focusFirst(main);
    },

    showModePicker: function (main) {
      ensureStyles();
      FF.ui.clear(main);
      var self = this;
      main.appendChild(panel([
        title('How are you playing?'),
        FF.ui.button('👤 AS INDIVIDUAL PLAYERS', {
          class: 'btn btn-lg', primary: true,
          onClick: function () { self.showCreate(main, 'players'); }
        }),
        FF.ui.div('rm-hint', 'Each device is one player with their own score.'),
        FF.ui.button('👥 IN TEAMS', {
          class: 'btn btn-lg',
          onClick: function () { self.showCreate(main, 'teams'); }
        }),
        FF.ui.div('rm-hint', 'Each device picks a team; points go to the team.'),
        backButton(function () { self.showHome(main); })
      ]));
      FF.Nav.focusFirst(main);
    },

    showCreate: function (main, mode) {
      ensureStyles();
      var self = this;
      var load = this.showLoading(main, {
        title: '🎪 Building your room',
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
      ensureStyles();
      FF.Room.offAll();
      FF.ui.clear(main);
      var self = this;
      var id = FF.Room.identity();

      var codeInput = FF.ui.el('input', {
        class: 'rm-input', type: 'text', maxlength: 6,
        value: prefill || '', 'aria-label': 'Room code', placeholder: 'ABC123',
        autocapitalize: 'characters', autocorrect: 'off', spellcheck: 'false'
      });
      var nameInput = FF.ui.el('input', {
        class: 'rm-input rm-input--text', type: 'text', maxlength: 14,
        value: id.name, 'aria-label': 'Your name'
      });
      var error = FF.ui.div('rm-error', '');
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
            title: '🔑 Joining room',
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

      joinBtn = FF.ui.button('▶ JOIN', { class: 'btn btn-lg', primary: true, onClick: go });

      main.appendChild(panel([
        title('Join a room'),
        FF.ui.div('rm-hint', 'Enter the 6-character code the host shared.'),
        codeInput,
        FF.ui.div('rm-hint', 'Your name'),
        nameInput,
        error,
        joinBtn,
        backButton(function () { self.showHome(main); })
      ]));
      FF.Nav.focusFirst(main);
    },

    showLobby: function (main) {
      ensureStyles();
      var self = this;
      if (!FF.Room.current()) { this.showHome(main); return; }

      FF.Room.offAll();

      // Remembered across re-renders so an arriving player does not reset
      // the host's choice.
      var chosen = self._lastGame || ONLINE_GAMES[0];

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
          card.appendChild(FF.ui.div('rm-game__icon', def.icon || '🎮'));
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
          FF.ui.button('📋 Copy link', {
            class: 'btn', onClick: function () {
              if (navigator.clipboard) navigator.clipboard.writeText(url);
              FF.Audio.play('click');
            }
          }),
          navigator.share ? FF.ui.button('📤 Share', {
            class: 'btn', onClick: function () {
              navigator.share({ title: 'Family Fun', url: url }).catch(function () {});
            }
          }) : null
        ].filter(Boolean));

        var children = [
          title(s.isHost ? '🌐 Your room' : '🌐 Joined'),
          FF.ui.div('rm-code', s.code),
          share,
          qrWrap,
          FF.ui.div('rm-hint', FF.util.plural(players.length, 'device') +
            ' connected · up to ' + FF.Room.MAX_PLAYERS),
          playerChips(players, s.uid)
        ];

        if (s.isHost) {
          var def = FF.Games.get(chosen);
          children.push(FF.ui.el('h2', { class: 'rm-subtitle' }, 'Pick a game'));
          children.push(gameGrid(render));
          if (def) children.push(FF.ui.div('rm-hint rm-chosen', def.description || ''));
          children.push(FF.ui.button('▶ START ' + (def ? def.name.toUpperCase() : 'GAME'), {
            class: 'btn btn-lg', primary: true,
            onClick: function () {
              FF.Audio.play('roundStart');
              FF.Room.startGame(chosen);
            }
          }));
        } else {
          children.push(FF.ui.div('rm-hint', '⏳ Waiting for the host to start…'));
        }

        children.push(FF.ui.button('🚪 Leave room', {
          class: 'btn btn-lg',
          onClick: function () { FF.Room.leave(); self.showHome(main); }
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
      render();
    },

    /* Everyone counts down to the same instant and starts together. A device
       that arrives late (startAt already past) just launches straight away. */
    startWhenReady: function (main, meta) {
      ensureStyles();
      var s = FF.Room.current();
      if (!s) return;
      if (this._starting) return;

      var def = FF.Games.get(meta.gameId);
      var serverNow = function () { return s.transport.serverNow(); };
      var startAt = meta.startAt || 0;

      function launch() {
        FF.RoomUI._starting = false;
        FF.GameFlow.launch(meta.gameId, { skipIntro: true, room: true });
      }

      if (!startAt || serverNow() >= startAt) { launch(); return; }

      this._starting = true;
      FF.ui.clear(main);

      var num = FF.ui.div('rm-count__num', '');
      var wrap = panel([
        FF.ui.div('rm-count__game', (def ? (def.icon + '  ' + def.name) : 'Get ready')),
        num,
        FF.ui.div('rm-hint', 'Everyone starts together when this hits zero'),
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
          num.textContent = secs > 0 ? String(secs) : 'GO!';
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
      ensureStyles();
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

        var list = FF.ui.div('rm-players');
        list.style.flexDirection = 'column';
        ranked.forEach(function (r, i) {
          var medal = i === 0 ? '🥇' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : '　'));
          list.appendChild(FF.ui.div('rm-player', [
            FF.ui.span('rm-player__ava', medal + ' ' + (r.avatar || '😀')),
            r.name + (r.uid === state.uid ? ' (you)' : ''),
            FF.ui.span('', '　' + FF.util.formatNumber(r.points))
          ]));
        });

        var headline = (ranked.length && ranked[0].points > 0)
          ? '🏆 ' + ranked[0].name + ' wins!'
          : '🏁 Game over';

        var children = [title(headline), list];

        if (state.isHost) {
          children.push(FF.ui.button('🔄 PLAY AGAIN', {
            class: 'btn btn-lg', primary: true,
            onClick: function () { FF.Audio.play('click'); FF.Room.playAgain(); }
          }));
        } else {
          children.push(FF.ui.div('rm-hint', '⏳ Waiting for the host…'));
        }

        children.push(FF.ui.button('🚪 Leave room', {
          class: 'btn btn-lg',
          onClick: function () { FF.Room.leave(); self.showHome(main); }
        }));

        main.appendChild(panel(children));
        FF.Nav.focusFirst(main);
      }

      // Play Again returns everyone to the lobby together.
      FF.Room.on('meta', function (meta) {
        if (meta && meta.status === 'lobby') self.showLobby(main);
      });
      FF.Room.on('players', render);
      render();
    },

    showVersionBlock: function (main) {
      ensureStyles();
      FF.ui.clear(main);
      main.appendChild(panel([
        title('🔄 Update needed'),
        FF.ui.div('rm-hint', 'This device is running an older version of the game than the room. Refresh the page to update, then join again.'),
        FF.ui.button('🔄 REFRESH NOW', {
          class: 'btn btn-lg', primary: true,
          onClick: function () { window.location.reload(); }
        })
      ]));
      FF.Nav.focusFirst(main);
    },

    showError: function (main, message) {
      ensureStyles();
      FF.ui.clear(main);
      var self = this;
      main.appendChild(panel([
        title('😅 Something went wrong'),
        FF.ui.div('rm-error', message),
        FF.ui.button('← Back', {
          class: 'btn btn-lg', primary: true,
          onClick: function () { self.showHome(main); }
        })
      ]));
      FF.Nav.focusFirst(main);
    },

    /* A fixed banner for transient connection trouble. */
    banner: function (text) {
      var existing = document.getElementById('rm-banner');
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
      if (!text) return;
      var b = FF.ui.el('div', {
        id: 'rm-banner',
        style: {
          position: 'fixed', left: '0', right: '0', top: '0', zIndex: '9999',
          padding: '10px', textAlign: 'center', fontWeight: '800',
          background: '#f59e0b', color: '#111827'
        }
      }, text);
      document.body.appendChild(b);
    }
  };
})();
