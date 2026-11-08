/* ============================================================
   PLAYMONA — answerMatch.js
   Forgiving checks for typed answers (Expert levels): case,
   accents, spaces and punctuation never matter, and small
   spelling mistakes are allowed ("zimbbwe", "RuSia"). A guess
   that is as close to another answer as to the right one (or is
   exactly another answer) does not count, so "Iraq" never
   passes for Iran and "Niger" never passes for Nigeria.

     FF.AnswerMatch.check(guess, ['Zimbabwe'], otherNames)
       -> { ok, exact, empty, target, near }

   Classic script, ES5.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  /* Lower case, no accents, "&" read as "and", "Saint" as "St", a
     leading "the" dropped, and only letters and digits kept. */
  function normalise(s) {
    var x = String(s == null ? '' : s);
    if (x.normalize) x = x.normalize('NFD').replace(/[̀-ͯ]/g, '');
    x = x.toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/\bsaint\b|\bste?\b\.?/g, ' st ')
      .replace(/^\s*the\s+/, ' ');
    return x.replace(/[^a-z0-9]/g, '');
  }

  /* Edits needed to turn a into b: insert, delete, change or swap two
     neighbouring letters (optimal string alignment distance). */
  function distance(a, b) {
    if (a === b) return 0;
    var n = a.length, m = b.length;
    if (!n) return m;
    if (!m) return n;
    var prev2 = null, prev = [], cur, i, j;
    for (j = 0; j <= m; j++) prev[j] = j;
    for (i = 1; i <= n; i++) {
      cur = [i];
      for (j = 1; j <= m; j++) {
        var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        var v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (prev2 && i > 1 && j > 1 && a.charAt(i - 1) === b.charAt(j - 2) && a.charAt(i - 2) === b.charAt(j - 1)) {
          v = Math.min(v, prev2[j - 2] + 1);
        }
        cur[j] = v;
      }
      prev2 = prev;
      prev = cur;
    }
    return prev[m];
  }

  /* How many mistakes an answer of this length may have. */
  function tolerance(len) {
    if (len <= 3) return 0;
    if (len <= 5) return 1;
    if (len <= 9) return 2;
    return 3;
  }

  function closest(g, names) {
    var best = { d: Infinity, name: null };
    (names || []).forEach(function (name) {
      var t = normalise(name);
      if (!t) return;
      var d = distance(g, t);
      if (d < best.d) best = { d: d, name: name, len: t.length };
    });
    return best;
  }

  /* accepted: the right answer and its other names. others: every
     other answer the game could have (names and other names). */
  function check(guess, accepted, others) {
    var g = normalise(guess);
    if (!g) return { ok: false, empty: true, exact: false, target: null, near: null };
    var right = closest(g, accepted);
    var res = { ok: false, empty: false, exact: right.d === 0, target: right.name, near: null };
    if (right.d === 0) { res.ok = true; return res; }
    var other = closest(g, others);
    if (right.d > tolerance(right.len)) {
      // Too far off. Say so if it was (nearly) another answer.
      if (other.d <= tolerance(other.len)) res.near = other.name;
      return res;
    }
    if (other.d <= right.d) { res.near = other.name; return res; }   // as close to another answer
    res.ok = true;
    return res;
  }

  FF.AnswerMatch = { normalise: normalise, distance: distance, tolerance: tolerance, check: check };
})();
