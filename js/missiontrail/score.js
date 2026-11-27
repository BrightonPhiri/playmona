/* ============================================================
   PLAYMONA — missiontrail/score.js
   Mission Trail scoring: five categories, each 0 to 1, weighted into a
   score out of 100, and the stars it earns. A category a stage does not
   use is null; the others are scaled up to 100.
   Numbers from docs/superpowers/specs/2026-11-27-mission-trail-design.md.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';
  FF.MissionTrail = FF.MissionTrail || {};

  var WEIGHTS = { task: 30, nav: 25, obs: 20, seq: 15, time: 10 };
  var WRONG_TURN = 0.2;
  var EXTRA_STEP = 0.03;
  var BUMP = 0.02;
  var WRONG_CHECK = 0.5;
  // Par: a quick, sure run. 0.6 s a step, 1.5 s a place checked, 2 s to get going.
  var PAR_STEP_S = 0.6;
  var PAR_ACTION_S = 1.5;
  var PAR_START_S = 2;

  function clamp01(n) { return Math.max(0, Math.min(1, n)); }

  function nav(m) {
    m = m || {};
    return clamp01(1 - WRONG_TURN * (m.wrongTurns || 0) - EXTRA_STEP * (m.extraSteps || 0) - BUMP * (m.bumps || 0));
  }

  function obs(wrongChecks) { return clamp01(1 - WRONG_CHECK * (wrongChecks || 0)); }

  function time(usedMs, limitMs, parMs) {
    if (usedMs <= parMs) return 1;
    if (limitMs <= parMs) return 0;
    return clamp01((limitMs - usedMs) / (limitMs - parMs));
  }

  function parMs(routeSteps, actions) {
    var a = actions === undefined ? 1 : Math.max(0, actions);
    return Math.round((PAR_STEP_S * Math.max(0, routeSteps || 0) + PAR_ACTION_S * a + PAR_START_S) * 1000);
  }

  function total(parts, weights) {
    var w = weights || WEIGHTS;
    var sum = 0;
    var weight = 0;
    Object.keys(WEIGHTS).forEach(function (k) {
      var p = parts ? parts[k] : null;
      var wk = w[k] || 0;
      if (p === null || p === undefined || wk <= 0) return;
      sum += wk * clamp01(p);
      weight += wk;
    });
    return weight ? Math.round(sum / weight * 100) : 0;
  }

  function stars(score) {
    if (score >= 90) return 3;
    if (score >= 70) return 2;
    if (score >= 50) return 1;
    return 0;
  }

  FF.MissionTrail.Score = {
    WEIGHTS: WEIGHTS,
    nav: nav,
    obs: obs,
    time: time,
    parMs: parMs,
    total: total,
    stars: stars
  };
})();
