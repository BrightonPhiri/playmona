/* ============================================================
   PLAYMONA — celebrate/library/rules.js
   Games from the library at a celebration: the organiser picks a
   finished PlayMona game (Verse Rush, Bible Quiz …). When the MC
   starts it, every group plays the same seeded run of it on their
   own phones (on the game page), and each phone sends its score
   once. A team counts its best score; teams are ranked by it and
   get points by place, so every game's own scale fits the event.

   The rules every side shares: the organiser's editor, the guest
   phone, the game page, the TV, the referee in the crew runner and
   (for the settings lists) api/lib/CelebrationGames.php, which must
   stay in step.
   Classic script, ES2017 or older, no DOM.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var MINUTES = [5, 10, 15, 20];
  var PRIZES = [1000, 2000, 3000, 5000];
  var DEFAULTS = { minutes: 10, prize: 3000 };
  var MAX_SCORE = 10000000;

  function pick(v, allowed, fallback) {
    v = Number(v);
    return allowed.indexOf(v) !== -1 ? v : fallback;
  }

  function gameId(v) {
    return typeof v === 'string' && /^[A-Za-z0-9]{1,40}$/.test(v) ? v : '';
  }

  /* The organiser's settings, with anything unknown put back to the standard. */
  function sanitize(raw) {
    raw = raw || {};
    return { game: gameId(raw.game), minutes: pick(raw.minutes, MINUTES, DEFAULTS.minutes), prize: pick(raw.prize, PRIZES, DEFAULTS.prize) };
  }

  /* Points for a place: first gets the prize, each later place an even step less. n = teams that finished. */
  function placePoints(prize, place, n) {
    if (!(place >= 1) || !(n >= 1) || place > n) return 0;
    return Math.round(prize * (n - place + 1) / n / 10) * 10;
  }

  /* scores: { teamId: { score, at } } (a team's best score and when it came in).
     Best score first, then whoever finished first; exact ties share a place.
     Teams with no score come last with place 0 and no points. */
  function ranked(scores, teamIds, prize) {
    scores = scores || {};
    var ids = (teamIds || []).slice();
    var done = ids.filter(function (id) { return scores[id]; });
    var rest = ids.filter(function (id) { return !scores[id]; }).sort();
    var rows = done.map(function (id) { return { teamId: id, score: scores[id].score || 0, at: scores[id].at || 0 }; });
    rows.sort(function (a, b) { return b.score - a.score || a.at - b.at || (a.teamId < b.teamId ? -1 : 1); });
    rows.forEach(function (r, i) {
      var prev = rows[i - 1];
      r.place = prev && prev.score === r.score && prev.at === r.at ? prev.place : i + 1;
      r.points = placePoints(prize || DEFAULTS.prize, r.place, rows.length);
    });
    return rows.concat(rest.map(function (id) { return { teamId: id, score: 0, at: 0, place: 0, points: 0 }; }));
  }

  function validScore(v) { return typeof v === 'number' && isFinite(v) && v >= 0 && v <= MAX_SCORE; }

  /* ---------- the play link (event page -> game page) ---------- */

  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

  function toB64(str) {
    var bytes = unescape(encodeURIComponent(str));
    var out = '';
    for (var i = 0; i < bytes.length; i += 3) {
      var a = bytes.charCodeAt(i), b = bytes.charCodeAt(i + 1), c = bytes.charCodeAt(i + 2);
      var n = (a << 16) | ((b || 0) << 8) | (c || 0);
      out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
      if (i + 1 < bytes.length) out += B64[(n >> 6) & 63];
      if (i + 2 < bytes.length) out += B64[n & 63];
    }
    return out;
  }

  function fromB64(s) {
    var bits = 0, val = 0, out = '';
    for (var i = 0; i < s.length; i++) {
      var k = B64.indexOf(s[i]);
      if (k === -1) return null;
      val = (val << 6) | k;
      bits += 6;
      if (bits >= 8) { bits -= 8; out += String.fromCharCode((val >> bits) & 255); }
    }
    try { return decodeURIComponent(escape(out)); } catch (e) { return null; }
  }

  function safeBack(v) { return typeof v === 'string' && v.charAt(0) === '/' && v.charAt(1) !== '/' && v.charAt(1) !== '\\' ? v.slice(0, 200) : '/'; }
  function word(v, max) { return typeof v === 'string' && v.length <= max && /^[A-Za-z0-9_-]+$/.test(v) ? v : ''; }

  /* o: { cid, runId, game, seed, uid, back } -> page + '#celebrate=…' (uid: the guest's id at the event). */
  function link(page, o) {
    return page + '#celebrate=' + toB64(JSON.stringify({ c: o.cid, r: o.runId, g: o.game, s: o.seed, u: o.uid, b: o.back }));
  }

  /* The run a game-page link carries, or null. */
  function decode(hash) {
    var m = /[#&]celebrate=([A-Za-z0-9_-]+)/.exec(hash || '');
    if (!m) return null;
    var raw = fromB64(m[1]);
    var o = null;
    try { o = raw ? JSON.parse(raw) : null; } catch (e) { o = null; }
    if (!o || typeof o !== 'object') return null;
    var out = { cid: word(o.c, 60), runId: word(o.r, 60), game: gameId(o.g), seed: word(o.s, 40), uid: word(o.u, 128), back: safeBack(o.b) };
    return out.cid && out.runId && out.game && out.seed && out.uid ? out : null;
  }

  FF.LibraryRules = {
    MINUTES: MINUTES, PRIZES: PRIZES, DEFAULTS: DEFAULTS, MAX_SCORE: MAX_SCORE,
    sanitize: sanitize, placePoints: placePoints, ranked: ranked, validScore: validScore, link: link, decode: decode
  };
})();
