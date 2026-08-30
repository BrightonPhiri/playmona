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
    'familyQuiz', 'trueOrFalse', 'guessWho', 'pictureQuiz'
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
      '.rm-row{display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap;}'
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

  FF.RoomUI = {
    ONLINE_GAMES: ONLINE_GAMES,

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
      FF.ui.clear(main);
      main.appendChild(panel([
        title('Creating room…'),
        FF.ui.div('rm-hint', 'Connecting…')
      ]));
      var self = this;

      FF.Room.create({ mode: mode }).then(function () {
        self.showLobby(main);
      }).catch(function (e) {
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
        FF.Room.join(codeInput.value, { name: nameInput.value || 'Player' }).then(function () {
          self.showLobby(main);
        }).catch(function (e) {
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

      function render() {
        var s = FF.Room.current();
        if (!s) return;
        FF.ui.clear(main);

        var url = FF.Room.shareUrl(s.code);
        var players = FF.Room.racePlayers();

        var qrWrap = FF.ui.div('rm-qr');
        var qr = (FF.QR && FF.QR.available()) ? FF.QR.svg(url, { size: 190 }) : null;
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
          var select = FF.ui.el('select', { class: 'rm-input rm-input--text', 'aria-label': 'Choose a game' });
          ONLINE_GAMES.forEach(function (id) {
            var def = FF.Games.get(id);
            if (!def) return;
            select.appendChild(FF.ui.el('option', { value: id }, def.icon + '  ' + def.name));
          });
          children.push(FF.ui.div('rm-hint', 'Choose a game'));
          children.push(select);
          children.push(FF.ui.button('▶ START GAME', {
            class: 'btn btn-lg', primary: true,
            onClick: function () {
              FF.Audio.play('roundStart');
              FF.Room.setMeta({ gameId: select.value, status: 'playing' });
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
          FF.GameFlow.launch(meta.gameId, { skipIntro: true, room: true });
        }
      });
      render();
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
