/* ============================================================
   PLAYMONA — answerMatch.js
   The one place typed (or spelled) answers are checked, for every
   game with an Expert level. Runs on phones and on the server (the
   Node crew runner loads it, api/crew/lib/loader.js), so a room
   referee checks answers exactly as a phone does.

   What it forgives:
   - case, accents, spaces, hyphens, apostrophes and other punctuation,
     a leading "the", "&" for "and", "St"/"St." for "Saint";
   - other accepted names (USA, UK, Holland...) the game lists;
   - small spelling mistakes: a missing, extra, changed or swapped
     letter. By default 0 for answers up to 4 letters, 1 for 5 to 8,
     2 for 9 to 12 and 3 for longer ones;
   - letters typed twice by accident ("Russsia", "Zimbabbwe").
   What it never accepts: another valid answer, or a guess at least as
   close to another valid answer as to the right one ("Iraq" for Iran,
   "Niger" for Nigeria, "Slovenia" for Slovakia).

   Each game sets up its own checker once:

     var check = FF.AnswerMatch.create({
       answers: [{ id: 'zw', names: ['Zimbabwe'] }, ...],   // every valid answer
       tolerance: [[4, 0], [8, 1], [12, 2], [Infinity, 3]], // optional: up to N letters -> mistakes
       repeats: true                                        // optional: forgive doubled letters
     });
     check.check('zimbbwe', 'zw')
       -> { ok, exact, empty, matched, near, distance }

   matched is the accepted name it was read as; near is the other
   answer it was too close to. FF.AnswerMatch.check(guess, accepted,
   others, rules) does the same without setting up a list.
   Classic script, ES5, no DOM.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var DEFAULT_TOLERANCE = [[4, 0], [8, 1], [12, 2], [Infinity, 3]];

  /* Lower case, no accents, "&" read as "and", "Saint" and "St." as
     "st", a leading "the" dropped, and only letters and digits kept. */
  function normalise(s) {
    var x = String(s == null ? '' : s);
    if (x.normalize) x = x.normalize('NFD').replace(/[̀-ͯ]/g, '');
    x = x.toLowerCase()
      .replace(/[‘’ʼ`']/g, '')
      .replace(/&/g, ' and ')
      .replace(/\bsaint\b|\bst\b\.?/g, ' st ')
      .replace(/^\s*the\s+/, ' ');
    return x.replace(/[^a-z0-9]/g, '');
  }

  /* The same letters with any run of one letter squeezed to one
     ("russsia" and "russia" both become "rusia"). */
  function squeeze(s) { return String(s).replace(/(.)\1+/g, '$1'); }

  /* Edits needed to turn a into b: insert, delete, change, or swap two
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

  /* How many mistakes an answer of this many letters may have. */
  function tolerance(len, table) {
    var t = table || DEFAULT_TOLERANCE;
    for (var i = 0; i < t.length; i++) if (len <= t[i][0]) return t[i][1];
    return 0;
  }

  /* Prepared form of one accepted name. */
  function prep(name) {
    var n = normalise(name);
    return { name: name, n: n, s: squeeze(n) };
  }

  /* Distance from a prepared guess to a prepared name. With repeats on,
     doubled letters cost nothing. */
  function dist(g, t, repeats) {
    if (g.n === t.n) return 0;
    var d = distance(g.n, t.n);
    if (repeats && d > 0) d = Math.min(d, distance(g.s, t.s));
    return d;
  }

  function closest(g, list, repeats) {
    var best = { d: Infinity, item: null };
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (!t.n) continue;
      var d = dist(g, t, repeats);
      if (d < best.d || (d === best.d && best.item && t.n.length > best.item.n.length)) best = { d: d, item: t };
    }
    return best;
  }

  /* The core rule, on prepared lists. */
  function judge(guess, right, others, rules) {
    rules = rules || {};
    var repeats = rules.repeats !== false;
    var g = prep(guess);
    if (!g.n) return { ok: false, empty: true, exact: false, matched: null, near: null, distance: null };
    var r = closest(g, right, repeats);
    var res = { ok: false, empty: false, exact: false, matched: r.item ? r.item.name : null, near: null, distance: r.d };
    if (!r.item) return res;
    if (g.n === r.item.n) { res.ok = true; res.exact = true; return res; }
    var o = closest(g, others, repeats);
    var allowed = tolerance(r.item.n.length, rules.tolerance);
    if (r.d > allowed) {
      // Too far off. Say so if it was (nearly) another answer.
      if (o.item && o.d <= tolerance(o.item.n.length, rules.tolerance)) res.near = o.item.name;
      return res;
    }
    if (o.item && o.d <= r.d) { res.near = o.item.name; return res; }   // as close to another answer
    res.ok = true;
    return res;
  }

  /* One-off check: the accepted names, every other valid answer's names, and rules. */
  function check(guess, accepted, others, rules) {
    return judge(guess, (accepted || []).map(prep), (others || []).map(prep), rules);
  }

  /* A checker for one game's whole answer list, prepared once. */
  function create(config) {
    config = config || {};
    var rules = { tolerance: config.tolerance || DEFAULT_TOLERANCE, repeats: config.repeats !== false };
    var byId = {};
    var all = [];
    (config.answers || []).forEach(function (a) {
      var list = (a.names || []).filter(function (n) { return normalise(n); }).map(function (n) {
        var p = prep(n);
        p.id = a.id;
        return p;
      });
      byId[a.id] = list;
      all = all.concat(list);
    });
    return {
      rules: rules,
      /* Is `guess` the answer `id`? */
      check: function (guess, id) {
        var right = byId[id] || [];
        var others = all.filter(function (p) { return p.id !== id; });
        return judge(guess, right, others, rules);
      },
      /* Which answer (if any) is `guess`, and only that one? */
      identify: function (guess) {
        var g = prep(guess);
        if (!g.n) return null;
        var best = closest(g, all, rules.repeats);
        if (!best.item) return null;
        var res = judge(guess, byId[best.item.id], all.filter(function (p) { return p.id !== best.item.id; }), rules);
        return res.ok ? best.item.id : null;
      },
      names: function (id) { return (byId[id] || []).map(function (p) { return p.name; }); }
    };
  }

  FF.AnswerMatch = {
    DEFAULT_TOLERANCE: DEFAULT_TOLERANCE,
    normalise: normalise, squeeze: squeeze, distance: distance, tolerance: tolerance,
    check: check, create: create
  };
})();
