/* ============================================================
   PLAYMONA — net/raceUI.js
   The two screens every racing game shares: the lockout note
   after a wrong answer, and the settled-round result. Written
   once so the engines stay thin.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';


  /* A compact live scoreboard so every device shows the same standings. */
  function scoreboard() {
    var wrap = FF.ui.div('ffr-board');
    if (!FF.Room || !FF.Room.current()) return wrap;
    var scores = FF.Race.scores();
    var me = FF.Room.current().uid;
    FF.Room.racePlayers()
      .slice()
      .sort(function (a, b) { return (scores[b.uid] || 0) - (scores[a.uid] || 0); })
      .forEach(function (p) {
        wrap.appendChild(FF.ui.div('ffr-chip' + (p.online ? '' : ' ffr-chip--off'), [
          FF.Players.avatarEl(p, 'ffr-chip__ava'),
          (p.uid === me ? FF.t('you', 'You') : p.name) + '  ' + (scores[p.uid] || 0)
        ]));
      });
    return wrap;
  }

  FF.RaceUI = {
    scoreboard: scoreboard,

    /* Hold this device until the round's shared open instant, so no one
       can answer early. Firebase echoes a device's own write immediately,
       so without this the host always sees the question first.

       Disables the option buttons until then, then enables them and
       calls onOpen() - at the same moment on every device. The hold is
       silent: the only countdown in a room is the one before the game.
       Returns a cancel function. */
    gate: function (root, optionSelector, onOpen) {
      onOpen = onOpen || function () {};

      if (!FF.Race || !FF.Race.active() || FF.Race.msUntilOpen() <= 0) {
        onOpen();
        return function () {};
      }

      var buttons = FF.ui.$$(optionSelector || 'button', root).filter(function (b) {
        return !b.classList.contains('shell-btn') && !b.classList.contains('host-btn');
      });
      buttons.forEach(function (b) { b.disabled = true; });

      return FF.Race.whenOpen(function () {
        buttons.forEach(function (b) { b.disabled = false; });
        onOpen();
      });
    },

    /* Wrong answer in a room: disable the options, stay on the
       question, and let the round play out for everyone else. */
    lockOut: function (root, optionSelector) {
      FF.Audio.play('wrong');
      FF.ui.$$(optionSelector || 'button', root).forEach(function (b) {
        if (b.classList.contains('shell-btn') || b.classList.contains('host-btn')) return;
        b.disabled = true;
        b.classList.add('is-locked');
      });
      var note = FF.ui.el('div', { class: 'ffr-out', role: 'status' });
      note.appendChild(FF.Icons.icon('x-circle'));
      note.appendChild(document.createTextNode(' ' + FF.t('youreOut', 'You’re out this round. Watch how it ends.')));
      root.appendChild(note);
      return note;
    },

    /* The round settled for everyone.
       opts: { payload, answerText, isLast, onNext } */
    result: function (root, opts) {
      opts = opts || {};
      // Joining a game already under way: rounds the others finished go by
      // without their result screens, until the live round is reached.
      if (FF.Race && FF.Race.catchingUp && FF.Race.catchingUp()) {
        setTimeout(function () { (opts.onNext || function () {})(); }, 0);
        return;
      }
      var payload = opts.payload || {};
      FF.ui.clear(root);

      var wrap = FF.ui.div('ffr-result');
      var verdict = FF.ui.el('h2', { class: 'ffr-verdict', role: 'status' });

      if (payload.reason === 'winner') {
        var mine = !!payload.correct;
        verdict.appendChild(FF.Icons.icon(mine ? 'check-circle' : 'trophy'));
        verdict.appendChild(document.createTextNode(mine ? FF.t('youGotIt', 'You got it!') : FF.t('nameGotIt', '{name} got it', { name: payload.winnerName })));
        verdict.classList.add(mine ? 'ffr-win' : 'ffr-lose');
        FF.Audio.play(mine ? 'correct' : 'select');
      } else {
        // Devices can reach a no-winner round by different routes (a local
        // timeout, or reading the published sentinel). Show identical copy
        // either way so two phones never disagree on screen.
        verdict.appendChild(FF.Icons.icon('clock'));
        verdict.appendChild(document.createTextNode(FF.t('nobodyGotIt', 'Nobody got that one')));
        verdict.classList.add('ffr-lose');
        FF.Audio.play('wrong');
      }
      wrap.appendChild(verdict);

      if (payload.reason === 'winner' && payload.points) {
        wrap.appendChild(FF.ui.div('ffr-points', FF.t('plusPoints', '+{n} points', { n: FF.util.formatNumber(payload.points) })));
      }

      if (payload.timeUp) {
        wrap.appendChild(FF.ui.div('ffr-timeup', FF.t('timeUpLast', 'Time\u2019s up! That was the last question.')));
      }

      if (opts.answerText != null && opts.answerText !== '') {
        wrap.appendChild(FF.ui.div('ffr-answer', FF.t('answerWas', 'The answer was {answer}.', { answer: opts.answerText })));
      }

      wrap.appendChild(scoreboard());

      wrap.appendChild(FF.Advance.button(
        opts.isLast ? FF.t('seeResults', 'See results') : FF.t('next', 'Next'),
        opts.onNext || function () {},
        { class: 'btn btn-lg' }
      ));

      root.appendChild(wrap);
      if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(root);
      return wrap;
    }
  };
})();
