/* PlayMona Celebrations: the "Press when ready" step before a game's countdown (FF.CelebrateReady).
   While run.waitReady is true the referee holds the countdown. A phone writes ready/<uid> = runId;
   one press readies the whole team, and the countdown starts once every team with players is
   ready (or the MC presses Start now). Used by every game's phone screen. Classic script, ES2017. */
window.FF = window.FF || {};
(function () {
  'use strict';

  function t(k, f, v) { return FF.t ? FF.t(k, f, v) : f; }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* Teams with players that have not pressed yet. */
  function waiting(v) {
    var ready = v.ready || {};
    return Object.keys(v.teams || {}).filter(function (tid) {
      return Object.keys((v.teams[tid] || {}).players || {}).length > 0 && !ready[tid];
    });
  }

  /* o: { uid, team, T }. Returns the block for the starting card. */
  function block(v, o) {
    var box = el('div', 'cel-ready');
    var left = waiting(v).length;
    var more = left === 1 ? t('celReadyOneMore', 'Waiting for 1 more team…') : t('celReadyMore', 'Waiting for {n} more teams…', { n: left });
    if (!o.team) {
      box.appendChild(el('p', 'cel-ready__note', t('celReadyWatch', 'The game starts when every team is ready.')));
      return box;
    }
    if ((v.ready || {})[o.team]) {
      box.appendChild(el('p', 'cel-ready__done', t('celReadyDone', 'Your team is ready ✓')));
      box.appendChild(el('p', 'cel-ready__note', more));
      return box;
    }
    var btn = el('button', 'btn btn-primary btn-lg cel-ready__go', t('celReadyPress', 'Press when ready'));
    btn.type = 'button';
    var err = el('p', 'cel-ready__note');
    btn.addEventListener('click', function () {
      btn.disabled = true;
      btn.textContent = t('celReadySent', 'Ready ✓');
      o.T.set('ready/' + o.uid, v.runId).catch(function () {
        btn.disabled = false;
        btn.textContent = t('celReadyPress', 'Press when ready');
        err.textContent = t('celReadyFailed', 'That did not go through. Try again.');
      });
    });
    box.appendChild(btn);
    box.appendChild(el('p', 'cel-ready__note', t('celReadyHow', 'One press is enough for your whole team. The countdown starts when every team is ready.')));
    box.appendChild(err);
    return box;
  }

  FF.CelebrateReady = { block: block, waiting: waiting };
})();
