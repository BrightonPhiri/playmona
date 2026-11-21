/* PlayMona Celebrations: the live panel for a game being played (FF.CelebrateLivePanel).
   Used by the organiser's Games tab and by the MC panel:

     var p = FF.CelebrateLivePanel.create(ev, active, {
       alive()            false once the panel left the page
       reload()           the game is over and the panel was closed
       control(action)    -> Promise of { control }: pause, resume, next or end through the API
       watch()            -> Promise: the API call that lets this sign-in read the game
     });
     p.el, p.runId, p.stop(), p.ended()

   It reads celebrations/<cid>/run (written only by the referee) and shows each team's
   progress, the clock and the controls. FF.CelebrateLivePanel.loadDev() loads the local
   referee (development only). Classic script, ES2017 or older. */
window.FF = window.FF || {};
(function () {
  'use strict';

  var R = function () { return FF.PictureRushRules; };
  function t(k, f, v) { return FF.t(k, f, v); }
  function el(tag, attrs, kids) { return FF.ui.el(tag, attrs, kids); }
  function div(cls, kids) { return FF.ui.div(cls, kids); }
  function icon(k) { return FF.Icons.icon(k); }
  function devMode() { return !!(FF.Net && FF.Net.devMode && FF.Net.devMode()); }
  function clock(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
  }

  /* Local development has no crew runner: this tab referees (js/celebrate/dev.js, loaded on demand). */
  function loadDev() {
    if (FF.CelebrateDev) return Promise.resolve(FF.CelebrateDev);
    var files = [];
    if (!FF.WordFlowRules) files.push('js/wordflow/rules.js');
    if (!FF.WordByWordRules) files.push('js/celebrate/wordByWord/rules.js');
    if (!FF.QuizRules) files.push('js/celebrate/quiz/rules.js');
    files.push('js/celebrate/pictureRush/referee.js', 'js/celebrate/wordByWord/referee.js', 'js/celebrate/quiz/referee.js', 'js/celebrate/dev.js');
    return files.reduce(function (p, src) {
      return p.then(function () {
        return new Promise(function (resolve, reject) {
          var s = document.createElement('script');
          s.src = src;
          s.onload = resolve;
          s.onerror = function () { reject(new Error('Could not load ' + src)); };
          document.head.appendChild(s);
        });
      });
    }, Promise.resolve()).then(function () { return FF.CelebrateDev; });
  }

  /* ================= The live panel ================= */

  function create(ev, active, opts) {
    var alive = opts.alive, reload = opts.reload;
    var card = el('section', { class: 'cel-live', 'aria-live': 'polite' });
    var head = div('cel-live__head');
    head.appendChild(el('span', { class: 'cel-live__dot', 'aria-hidden': 'true' }));
    head.appendChild(el('strong', {}, t('celLiveNow', 'Playing now: {name}', { name: active.name })));
    var timer = el('span', { class: 'cel-live__timer', role: 'timer' });
    head.appendChild(timer);
    card.appendChild(head);
    var status = el('p', { class: 'cel-live__status' }, t('celConnecting', 'Connecting…'));
    card.appendChild(status);
    var teams = el('ul', { class: 'cel-live__teams' });
    card.appendChild(teams);
    var acts = div('cel-live__acts');
    card.appendChild(acts);

    var T = null, off = null, offStaff = null, v = null, staff = null, ticker = null, gone = false;
    var words = el('ol', { class: 'cel-wbw-live' });
    var quizBox = div('cel-quiz-live');
    var pauseBtn = FF.UI.button(t('celPause', 'Pause'), { class: 'btn-secondary btn-sm', icon: 'pause', onClick: function () { control(v && v.paused ? 'resume' : 'pause', pauseBtn); } });
    var nextBtn = FF.UI.button(t('celNext', 'Next'), { class: 'btn-secondary btn-sm', icon: 'arrow-right', onClick: function () { control('next', nextBtn); } });
    var endBtn = FF.UI.button(t('celEndGame', 'End game'), { class: 'btn-danger-soft btn-sm', icon: 'flag', onClick: function () {
      FF.UI.confirm({
        title: t('celEndTitle', 'End {name} now?', { name: active.name }),
        body: active.template === 'quiz' ? t('celQuizEndText', 'The game stops for everyone. Points won so far count; the question on screen does not.')
          : t('celEndText', 'The game stops for everyone. Points won so far count, and unfinished pictures score their tiles in place.'),
        confirmLabel: t('celEndGame', 'End game'), danger: true,
        onConfirm: function () { control('end', endBtn); }
      });
    } });
    [pauseBtn, nextBtn, endBtn].forEach(function (b) { acts.appendChild(b); });

    function control(action, btn, index, word) {
      FF.UI.busy(btn, true);
      opts.control(action, index, word).then(function (r) {
        // Locally the referee runs in this tab on the dev transport, so the control goes there too.
        if (devMode() && T) return T.set('control', r.control);
        return null;
      }).then(function () { FF.UI.busy(btn, false); }, function (e) { FF.UI.busy(btn, false); FF.UI.toast(e.message); });
    }

    function stop() {
      gone = true;
      if (ticker) clearInterval(ticker);
      if (typeof off === 'function') off();
      if (typeof offStaff === 'function') offStaff();
    }

    var PHASE = {
      starting: ['celPhStarting', 'Counting down. Guests see the instructions.'],
      reveal: ['celPhReveal', 'Showing picture {n} of {total}.'],
      playing: ['celPhPlaying', 'Picture {n} of {total}: teams are swapping tiles.'],
      roundEnd: ['celPhRoundEnd', 'Picture {n} of {total} is over. The scores are up.'],
      ended: ['celPhEnded', 'The game is over.']
    };

    var WBW_PHASE = {
      starting: ['celPhStarting', 'Counting down. Guests see the instructions.'],
      playing: ['celWbwPhTurn', 'Turn: {team} · round {n} of {total}'],
      reveal: ['celWbwPhReveal', 'The message is being revealed.'],
      ended: ['celPhEnded', 'The game is over.']
    };

    /* Word by Word: whose turn it is, the teams in turn order, and the message with a Strike on each word. */
    function drawWords() {
      var p = WBW_PHASE[v.phase] || ['', ''];
      var cur = v.turn && v.teams[v.turn.teamId];
      status.textContent = (v.paused ? t('celPausedNow', 'Paused.') + ' ' : '') + t(p[0], p[1], { team: cur ? cur.name : '', n: (v.round || 0) + 1, total: v.rounds });
      pauseBtn.hidden = v.phase !== 'playing';
      FF.ui.clear(pauseBtn);
      pauseBtn.appendChild(icon(v.paused ? 'play' : 'pause'));
      pauseBtn.appendChild(FF.ui.span('', v.paused ? t('celResume', 'Resume') : t('celPause', 'Pause')));
      nextBtn.hidden = v.phase === 'ended';
      FF.ui.clear(nextBtn);
      nextBtn.appendChild(icon('arrow-right'));
      nextBtn.appendChild(FF.ui.span('', v.phase === 'playing' ? t('celWbwSkip', 'Skip turn') : v.phase === 'reveal' ? t('celFinalResults', 'Final results') : t('celNext', 'Next')));
      endBtn.hidden = v.phase === 'ended';

      FF.ui.clear(teams);
      var totals = v.totals || {};
      R().list(v.order).forEach(function (tid) {
        var tm = v.teams[tid];
        if (!tm) return;
        var li = el('li', { class: 'cel-live__team' + (v.turn && v.turn.teamId === tid ? ' is-turn' : '') });
        li.style.setProperty('--team', tm.color);
        var name = div('cel-live__name');
        name.appendChild(el('span', { class: 'cel-live__swatch', 'aria-hidden': 'true' }));
        name.appendChild(el('strong', {}, tm.name));
        name.appendChild(el('span', { class: 'cel-live__people' }, t('celPlayersN', '{n} playing', { n: Object.keys(tm.players || {}).length })));
        li.appendChild(name);
        li.appendChild(el('span', { class: 'cel-live__pts' }, t('celPts', '{n} pts', { n: (totals[tid] || {}).points || 0 })));
        teams.appendChild(li);
      });

      // The message: the run has it in open mode; in blind mode only staff (this panel) can read it.
      var list = v.words ? R().list(v.words) : (staff && staff.runId === v.runId ? R().list(staff.words) : null);
      FF.ui.clear(words);
      if (v.opening) words.appendChild(el('li', { class: 'cel-wbw-live__word is-opening' }, v.opening));
      (list || []).forEach(function (x, i) {
        var tm = v.teams[x.teamId] || {};
        var li = el('li', { class: 'cel-wbw-live__word' });
        li.style.setProperty('--team', tm.color || 'var(--border)');
        li.appendChild(el('span', {}, x.w));
        if (v.phase === 'playing' || v.phase === 'reveal') {
          var b = FF.UI.iconButton('x', t('celWbwStrikeN', 'Strike "{word}"', { word: x.w }), function () {
            FF.UI.confirm({
              title: t('celWbwStrikeTitle', 'Strike "{word}"?', { word: x.w }),
              body: t('celWbwStrikeText', 'It leaves the message and its points go back. The turn is not played again.'),
              confirmLabel: t('celWbwStrike', 'Strike'), danger: true,
              onConfirm: function () { control('strike', b, i, x.w); }
            });
          }, 'btn-ghost btn-sm cel-wbw-live__strike');
          li.appendChild(b);
        }
        words.appendChild(li);
      });
      if (!list && v.count) words.appendChild(el('li', { class: 'cel-wbw-live__note' }, t('celWbwWordsSoFar', '{n} words so far', { n: v.count })));
      else if (!(list || []).length && !v.opening) words.appendChild(el('li', { class: 'cel-wbw-live__note' }, t('celWbwNoWords', 'No words yet.')));
      if (!words.isConnected) card.insertBefore(words, acts);
    }

    var QZ_PHASE = {
      starting: ['celPhStarting', 'Counting down. Guests see the instructions.'],
      question: ['celQuizPhQuestion', 'Question {n} of {total}: teams are choosing.'],
      reveal: ['celQuizPhReveal', 'Question {n} of {total}: the answer is up.'],
      ended: ['celPhEnded', 'The game is over.']
    };
    var QZ_LETTERS = ['A', 'B', 'C', 'D'];

    /* Quiz: the question with its right answer (only staff can read it before the reveal) and every team's pick. */
    function drawQuiz() {
      var p = QZ_PHASE[v.phase] || ['', ''];
      status.textContent = (v.paused ? t('celPausedNow', 'Paused.') + ' ' : '') + t(p[0], p[1], { n: (v.q || 0) + 1, total: v.total });
      pauseBtn.hidden = v.phase !== 'question' && v.phase !== 'reveal';
      FF.ui.clear(pauseBtn);
      pauseBtn.appendChild(icon(v.paused ? 'play' : 'pause'));
      pauseBtn.appendChild(FF.ui.span('', v.paused ? t('celResume', 'Resume') : t('celPause', 'Pause')));
      nextBtn.hidden = v.phase === 'ended';
      FF.ui.clear(nextBtn);
      nextBtn.appendChild(icon('arrow-right'));
      nextBtn.appendChild(FF.ui.span('', v.phase === 'starting' ? t('celQuizStartNow', 'Start now')
        : v.phase === 'question' ? t('celQuizShowAnswer', 'Show the answer')
        : (v.q || 0) + 1 >= v.total ? t('celFinalResults', 'Final results') : t('celQuizNextQ', 'Next question')));
      endBtn.hidden = v.phase === 'ended';

      var right = v.phase === 'reveal' ? v.right : (staff && staff.runId === v.runId && staff.q === v.q ? staff.right : -1);
      var choices = v.question ? R().list(v.question.choices) : [];
      FF.ui.clear(quizBox);
      if (v.question) {
        quizBox.appendChild(el('p', { class: 'cel-quiz-live__q' }, v.question.text));
        if (right >= 0 && choices[right] != null) {
          var a = el('p', { class: 'cel-quiz-live__right' });
          a.appendChild(icon('check'));
          a.appendChild(FF.ui.span('', t('celQuizAnswerIs', 'Answer: {letter}. {answer}', { letter: QZ_LETTERS[right], answer: choices[right] })));
          quizBox.appendChild(a);
        }
      }
      if (!quizBox.isConnected) card.insertBefore(quizBox, teams);

      FF.ui.clear(teams);
      var totals = v.totals || {};
      var picks = v.picks || {};
      R().list(v.order).forEach(function (tid) {
        var tm = v.teams[tid];
        if (!tm) return;
        var pk = picks[tid];
        var li = el('li', { class: 'cel-live__team' + (pk && pk.sure ? ' is-done' : '') });
        li.style.setProperty('--team', tm.color);
        var name = div('cel-live__name');
        name.appendChild(el('span', { class: 'cel-live__swatch', 'aria-hidden': 'true' }));
        name.appendChild(el('strong', {}, tm.name));
        name.appendChild(el('span', { class: 'cel-live__people' }, t('celPlayersN', '{n} playing', { n: Object.keys(tm.players || {}).length })));
        li.appendChild(name);
        if (v.phase === 'question' || v.phase === 'reveal') {
          var note = !pk ? t('celQuizNoPick', 'No pick yet') : QZ_LETTERS[pk.choice] + (pk.sure ? ' · ' + t('celQuizSureShort', 'sure') : '');
          if (v.phase === 'reveal') note += ' · ' + (v.got && v.got[tid] ? t('celQuizRightShort', 'right') : t('celQuizWrongShort', 'wrong'));
          li.appendChild(el('span', { class: 'cel-quiz-live__pick' }, note));
        }
        li.appendChild(el('span', { class: 'cel-live__pts' }, t('celPts', '{n} pts', { n: (totals[tid] || {}).points || 0 })));
        teams.appendChild(li);
      });
    }

    function draw() {
      if (!v) return;
      if (v.template === 'quiz') { drawQuiz(); ended(); tick(); return; }
      if (v.template === 'wordByWord') { drawWords(); ended(); tick(); return; }
      var p = PHASE[v.phase] || ['', ''];
      status.textContent = (v.paused ? t('celPausedNow', 'Paused.') + ' ' : '') + t(p[0], p[1], { n: v.round + 1, total: v.rounds });
      pauseBtn.hidden = v.phase === 'ended' || v.phase === 'starting';
      FF.ui.clear(pauseBtn);
      pauseBtn.appendChild(icon(v.paused ? 'play' : 'pause'));
      pauseBtn.appendChild(FF.ui.span('', v.paused ? t('celResume', 'Resume') : t('celPause', 'Pause')));
      nextBtn.hidden = v.phase === 'ended';
      FF.ui.clear(nextBtn);
      nextBtn.appendChild(icon('arrow-right'));
      nextBtn.appendChild(FF.ui.span('', v.phase === 'playing' ? t('celEndPicture', 'End this picture')
        : v.phase === 'roundEnd' && v.round + 1 >= v.rounds ? t('celFinalResults', 'Final results') : t('celNext', 'Next')));
      endBtn.hidden = v.phase === 'ended';

      FF.ui.clear(teams);
      var ids = Object.keys(v.teams || {});
      var totals = v.totals || {};
      ids.sort(function (a, b) { return ((totals[b] || {}).points || 0) - ((totals[a] || {}).points || 0); });
      ids.forEach(function (tid) {
        var tm = v.teams[tid];
        var b = (v.boards || {})[tid] || {};
        var n = R().list(b.tiles).length || 1;
        var li = el('li', { class: 'cel-live__team' + (b.solved ? ' is-done' : '') });
        li.style.setProperty('--team', tm.color);
        var name = div('cel-live__name');
        name.appendChild(el('span', { class: 'cel-live__swatch', 'aria-hidden': 'true' }));
        name.appendChild(el('strong', {}, tm.name));
        name.appendChild(el('span', { class: 'cel-live__people' }, t('celPlayersN', '{n} playing', { n: Object.keys(tm.players || {}).length })));
        li.appendChild(name);
        if (v.phase === 'playing' || v.phase === 'roundEnd') {
          var bar = el('span', { class: 'cel-live__bar', role: 'img', 'aria-label': t('celTilesOf', '{n} of {total} tiles in place', { n: b.correct || 0, total: n }) });
          var fill = el('span', {});
          fill.style.width = Math.round(100 * (b.correct || 0) / n) + '%';
          bar.appendChild(fill);
          li.appendChild(bar);
        }
        li.appendChild(el('span', { class: 'cel-live__pts' }, b.solved ? t('celSolvedShort', 'Solved') + ' · ' + t('celPts', '{n} pts', { n: (totals[tid] || {}).points || 0 }) : t('celPts', '{n} pts', { n: (totals[tid] || {}).points || 0 })));
        teams.appendChild(li);
      });
      ended();
      tick();
    }

    /* The winners, once the game is over (every template). */
    function ended() {
      if (v.phase === 'ended') {
        var res = v.result || {};
        var names = R().list(res.winners).map(function (id) { return (v.teams[id] || {}).name; }).filter(Boolean);
        if (!R().list(res.rows).some(function (r) { return r.points > 0; })) names = [];
        head.querySelector('strong').textContent = t('celLiveDone', 'Finished: {name}', { name: active.name });
        head.querySelector('.cel-live__dot').hidden = true;
        status.textContent = names.length ? t(names.length > 1 ? 'celWinnersAre' : 'celWinnerIs', names.length > 1 ? 'A tie! Winners: {names}' : 'Winner: {names}!', { names: names.join(' & ') }) : t('celNoScore', 'The game is over. Nobody scored this time.');
        if (!card.querySelector('.cel-live__done')) {
          acts.appendChild(FF.UI.button(t('celDoneClose', 'Close'), { class: 'btn-primary btn-sm cel-live__done', icon: 'check', onClick: function () { stop(); reload(); } }));
        }
      }
    }

    function tick() {
      if (!alive()) { stop(); return; }
      if (!v) return;
      if (v.template === 'wordByWord') {
        var left = v.phase === 'playing' && v.turn ? (v.paused ? v.turn.leftMs : v.turn.endsAt - T.serverNow()) : v.phase === 'starting' ? v.startAt - T.serverNow() : null;
        timer.textContent = left == null ? '' : clock(left);
        return;
      }
      if (v.template === 'quiz') {
        var qLeft = v.phase === 'question' ? (v.paused ? v.leftMs : v.deadline - T.serverNow()) : v.phase === 'starting' ? v.startAt - T.serverNow() : null;
        timer.textContent = qLeft == null ? '' : clock(qLeft);
        return;
      }
      var due = { starting: v.startAt, reveal: v.revealUntil, playing: v.deadline, roundEnd: v.nextAt }[v.phase] || 0;
      timer.textContent = v.phase === 'ended' || !due ? '' : clock(due - (v.paused ? v.pausedAt : T.serverNow()));
    }

    // Asking the server first lets this sign-in watch the game (it marks it as a viewer).
    opts.watch().then(function () {
      return FF.Transport.open('celebrations/' + ev.id);
    }).then(function (tr) {
      if (gone) return;
      T = tr;
      off = T.watch('run', function (val) {
        if (gone) return;
        if (val && val.runId === active.runId) { v = val; draw(); }
      });
      // A blind Word by Word message: only the MC and the organiser may read it.
      // The quiz answer before the reveal, likewise.
      if (active.template === 'wordByWord' || active.template === 'quiz') {
        offStaff = T.watch('staff', function (val) {
          if (gone) return;
          staff = val;
          if (v) draw();
        });
      }
      ticker = setInterval(tick, 500);
    }, function (e) { status.textContent = (e && e.message) || t('celLiveFailed', 'We could not connect for the games. Check your connection and reload.'); });
    return { el: card, runId: active.runId, stop: stop, ended: function () { return !!(v && v.phase === 'ended'); } };
  }

  FF.CelebrateLivePanel = { create: create, loadDev: loadDev, clock: clock };
})();
