/* ============================================================
   FAMILY FUN — net/raceUI.js
   The two screens every racing game shares: the lockout note
   after a wrong answer, and the settled-round result. Written
   once so the engines stay thin.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var STYLE_READY = false;
  function ensureStyles() {
    if (STYLE_READY) return;
    STYLE_READY = true;
    if (!document || !document.head) return;
    var style = document.createElement('style');
    style.id = 'ff-raceui-style';
    style.textContent = [
      '.ffr-out{font-weight:800;text-align:center;margin-top:14px;color:var(--danger,#ef4444);}',
      '.ffr-result{display:flex;flex-direction:column;align-items:center;gap:10px;',
      'max-width:620px;margin:0 auto;text-align:center;}',
      '.ffr-verdict{font-size:1.7rem;font-weight:800;}',
      '.ffr-win{color:var(--success,#10b981);}',
      '.ffr-lose{color:var(--danger,#ef4444);}',
      '.ffr-points{color:var(--accent,#8b5cf6);font-weight:800;font-size:1.2rem;}',
      '.ffr-answer{font-weight:700;}',
      '.ffr-board{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:6px;}',
      '.ffr-chip{display:flex;align-items:center;gap:6px;padding:5px 12px;border-radius:999px;',
      'background:var(--surface,#f8fafc);border:1px solid var(--border,#e2e8f0);font-weight:700;}',
      '.ffr-chip--off{opacity:.45;}'
    ].join('\n');
    document.head.appendChild(style);
  }

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
          FF.ui.span('', p.avatar || '😀'),
          (p.uid === me ? 'You' : p.name) + '  ' + (scores[p.uid] || 0)
        ]));
      });
    return wrap;
  }

  FF.RaceUI = {
    scoreboard: scoreboard,

    /* Wrong answer in a room: disable the options, stay on the
       question, and let the round play out for everyone else. */
    lockOut: function (root, optionSelector) {
      FF.Audio.play('wrong');
      FF.ui.$$(optionSelector || 'button', root).forEach(function (b) {
        if (b.classList.contains('shell-btn') || b.classList.contains('host-btn')) return;
        b.disabled = true;
        b.style.opacity = '0.45';
        b.style.cursor = 'default';
      });
      var note = FF.ui.div('ffr-out', "❌ You're out — watch it play out");
      root.appendChild(note);
      return note;
    },

    /* The round settled for everyone.
       opts: { payload, answerText, isLast, onNext } */
    result: function (root, opts) {
      ensureStyles();
      opts = opts || {};
      var payload = opts.payload || {};
      FF.ui.clear(root);

      var wrap = FF.ui.div('ffr-result');
      var verdict = FF.ui.div('ffr-verdict');

      if (payload.reason === 'winner') {
        var mine = !!payload.correct;
        verdict.textContent = mine ? '✅ You got it!' : '🏆 ' + payload.winnerName + ' got it';
        verdict.classList.add(mine ? 'ffr-win' : 'ffr-lose');
        FF.Audio.play(mine ? 'correct' : 'select');
      } else {
        // Devices can reach a no-winner round by different routes (a local
        // timeout, or reading the published sentinel). Show identical copy
        // either way so two phones never disagree on screen.
        verdict.textContent = '⏰ Nobody got that one';
        verdict.classList.add('ffr-lose');
        FF.Audio.play('wrong');
      }
      wrap.appendChild(verdict);

      if (payload.reason === 'winner' && payload.points) {
        wrap.appendChild(FF.ui.div('ffr-points', '+' + payload.points + ' points'));
      }

      if (opts.answerText != null && opts.answerText !== '') {
        wrap.appendChild(FF.ui.div('ffr-answer', 'The answer was ' + opts.answerText));
      }

      wrap.appendChild(scoreboard());

      wrap.appendChild(FF.Advance.button(
        opts.isLast ? '🏆 See Results' : 'Next ➜',
        opts.onNext || function () {},
        { class: 'btn btn-lg' }
      ));

      root.appendChild(wrap);
      if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(root);
      return wrap;
    }
  };
})();
