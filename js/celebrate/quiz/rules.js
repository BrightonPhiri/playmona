/* ============================================================
   PLAYMONA — celebrate/quiz/rules.js
   Quiz: the organiser writes questions with the right answer and
   1–3 wrong ones; every team picks one answer together (any member
   can change it until the time runs out, or lock it with "We're
   sure"); every right answer scores the same points.
   Kinds: whoKnows (questions about the celebrant). Birthday Trivia
   and Who Said It? come later as more kinds.

   The rules every side shares: the organiser's editor, the
   phones, the TV, the referee in the crew runner and (for the
   settings lists) api/lib/CelebrationGames.php, which must stay
   in step.
   Classic script, ES2017 or older, no DOM.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var KINDS = ['whoKnows'];
  var SECONDS = [10, 15, 20, 30, 45, 60];
  var POINTS_MIN = 100;
  var POINTS_MAX = 5000;
  var POINTS_STEP = 100;
  var MAX_QUESTIONS = 30;
  var MAX_TEXT = 140;
  var MAX_ANSWER = 60;
  var MAX_WRONG = 3;
  var REVEAL_MS = 6000;          // the right answer stays up this long
  var DEFAULTS = { kind: 'whoKnows', seconds: 20, points: 500 };

  function pick(v, allowed, fallback) {
    if (typeof allowed[0] === 'number') v = Number(v);
    return allowed.indexOf(v) !== -1 ? v : fallback;
  }

  function cleanText(v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  }

  function list(v) {
    if (Array.isArray(v)) return v.filter(function (x) { return x != null; });
    if (v && typeof v === 'object') return Object.keys(v).sort(function (a, b) { return a - b; }).map(function (k) { return v[k]; });
    return [];
  }

  function points(v) {
    if (v == null || v === '') return DEFAULTS.points;
    var n = Number(v);
    if (!isFinite(n)) return DEFAULTS.points;
    n = Math.round(n / POINTS_STEP) * POINTS_STEP;
    return Math.max(POINTS_MIN, Math.min(POINTS_MAX, n));
  }

  /* The organiser's settings, with anything unknown put back to the standard.
     Incomplete questions are kept: a draft may hold them. */
  function sanitize(raw) {
    raw = raw || {};
    var questions = list(raw.questions).filter(function (q) { return q && typeof q === 'object'; }).slice(0, MAX_QUESTIONS).map(function (q, i) {
      var id = typeof q.id === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(q.id) ? q.id : 'q' + i;
      var wrong = list(q.wrong).map(function (w) { return cleanText(w, MAX_ANSWER); }).filter(Boolean).slice(0, MAX_WRONG);
      return { id: id, text: cleanText(q.text, MAX_TEXT), right: cleanText(q.right, MAX_ANSWER), wrong: wrong };
    });
    return {
      kind: pick(raw.kind, KINDS, DEFAULTS.kind),
      seconds: pick(raw.seconds, SECONDS, DEFAULTS.seconds),
      points: points(raw.points),
      questions: questions
    };
  }

  function same(a) { return String(a || '').replace(/\s+/g, '').toLowerCase(); }

  /* Why a question can't be played yet, or '' when it can. */
  function problem(q) {
    q = q || {};
    if (!cleanText(q.text, MAX_TEXT)) return 'noText';
    if (!cleanText(q.right, MAX_ANSWER)) return 'noRight';
    var wrong = list(q.wrong).map(function (w) { return cleanText(w, MAX_ANSWER); }).filter(Boolean);
    if (!wrong.length) return 'noWrong';
    var seen = {};
    var all = [q.right].concat(wrong);
    for (var i = 0; i < all.length; i++) {
      var k = same(all[i]);
      if (seen[k]) return 'same';
      seen[k] = true;
    }
    return '';
  }

  function playable(config) {
    return list(config && config.questions).filter(function (q) { return problem(q) === ''; });
  }

  /* The question's choices in a shuffled order, and where the right one went. */
  function deal(q, randomInt) {
    var items = [{ text: q.right, right: true }].concat(list(q.wrong).map(function (w) { return { text: w, right: false }; }));
    for (var i = items.length - 1; i > 0; i--) {
      var j = randomInt(i + 1);
      var x = items[i]; items[i] = items[j]; items[j] = x;
    }
    var right = 0;
    items.forEach(function (it, k) { if (it.right) right = k; });
    return { choices: items.map(function (it) { return it.text; }), right: right };
  }

  /* Most points first; equal points share a place. Speed is not part of this game. */
  function ranked(totals, teamIds) {
    var rows = list(teamIds).map(function (tid) {
      return { teamId: tid, points: ((totals || {})[tid] || {}).points || 0, usedMs: 0 };
    });
    rows.sort(function (a, b) { return b.points - a.points || (a.teamId < b.teamId ? -1 : 1); });
    rows.forEach(function (r, i) {
      var prev = rows[i - 1];
      r.place = prev && prev.points === r.points ? prev.place : i + 1;
    });
    return rows;
  }

  FF.QuizRules = {
    KINDS: KINDS, SECONDS: SECONDS, POINTS_MIN: POINTS_MIN, POINTS_MAX: POINTS_MAX, POINTS_STEP: POINTS_STEP,
    MAX_QUESTIONS: MAX_QUESTIONS, MAX_TEXT: MAX_TEXT, MAX_ANSWER: MAX_ANSWER, MAX_WRONG: MAX_WRONG,
    REVEAL_MS: REVEAL_MS, DEFAULTS: DEFAULTS,
    sanitize: sanitize, problem: problem, playable: playable, deal: deal, ranked: ranked, list: list, cleanText: cleanText
  };
})();
