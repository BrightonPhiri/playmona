/* ============================================================
   PLAYMONA — wordflow/rules.js
   The rules of WordFlow as pure functions, shared by the phone,
   the referee (in the Node crew runner), the crew seats and the
   tests. Players take turns adding exactly one word; a sentence
   counts only once it ends with a full stop and the judge accepts
   it. Every word of an accepted sentence is a point for whoever
   wrote it.

     FF.WordFlowRules.sanitizeSettings(raw)
     FF.WordFlowRules.parseWord(raw, { isWord, isQuiet, position })
       -> { ok: true, text, ends } | { ok: false, error }
     FF.WordFlowRules.sentenceText(words)
     FF.WordFlowRules.fallbackJudge(words) -> { ok, reason }
     FF.WordFlowRules.score(sentences, seats) -> { uid: { points, words } }
     FF.WordFlowRules.ranked(score, seats) -> [{ uid, points }] best first

   Classic script, ES2017 or older, no DOM.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var MIN_PLAYERS = 2;
  var MAX_PLAYERS = 12;
  var MODES = ['sentences', 'story'];
  var GAME_SECONDS = [120, 180, 300];
  var TURN_SECONDS = [10, 20, 30];
  var MAX_WORD = 24;              // letters in one word
  var MAX_INPUT = 26;             // what the inbox rule lets through (word + punctuation)
  var MAX_WORDS = 30;             // words in one sentence: the 30th must end it
  var MIN_SENTENCE = 3;           // fewer words than this is not a sentence

  var DEFAULTS = { mode: 'sentences', gameSeconds: 180, turnSeconds: 20 };

  /* Real one- and two-letter words. The word bank only knows words of 3+ letters. */
  var SHORT = {};
  ('a i am an as at be by do go he hi if in is it me my no of oh ok on or ox so to up us we yo ' +
   'ah eh ha ho lo ma pa ye').split(' ').forEach(function (w) { SHORT[w] = true; });

  /* Contraction endings: "don't", "it's", "we'll", "they're". */
  var CONTRACTIONS = { s: true, t: true, re: true, ve: true, ll: true, d: true, m: true };

  function pick(list, value, fallback) {
    for (var i = 0; i < list.length; i++) if (list[i] === value) return value;
    return fallback;
  }

  function sanitizeSettings(raw) {
    raw = raw || {};
    return {
      mode: pick(MODES, raw.mode, DEFAULTS.mode),
      gameSeconds: pick(GAME_SECONDS, Number(raw.gameSeconds), DEFAULTS.gameSeconds),
      turnSeconds: pick(TURN_SECONDS, Number(raw.turnSeconds), DEFAULTS.turnSeconds)
    };
  }

  function isLetter(ch) { return ch.toLowerCase() !== ch.toUpperCase(); }
  function isDigit(ch) { return ch >= '0' && ch <= '9'; }

  /* Is this (lower-case, letters only, maybe ' or -) a word we know? */
  function known(low, isWord) {
    if (SHORT[low]) return true;
    if (typeof isWord !== 'function') return true;   // no word bank here: the judge decides
    if (low.indexOf('-') !== -1) {
      return low.split('-').every(function (part) { return part && known(part, isWord); });
    }
    var ap = low.replace(/’/g, "'");
    var at = ap.indexOf("'");
    if (at !== -1) {
      var base = ap.slice(0, at);
      var end = ap.slice(at + 1);
      if (ap.lastIndexOf("'") !== at) return false;
      if (base === 'can' || base === 'won' || base === 'shan') return end === 't';
      if (base.slice(-1) === 'n' && end === 't') return known(base.slice(0, -1), isWord) || isWord(base);
      // Possessive plurals ("dogs'") end on the apostrophe.
      if (!end) return known(base, isWord);
      return !!CONTRACTIONS[end] && known(base, isWord);
    }
    return !!isWord(low);
  }

  /* One word, as typed. Allows one trailing full stop (it ends the sentence) or comma.
     error: empty | spaces | long | punct | letters | rude | unknown */
  function parseWord(rawText, opts) {
    opts = opts || {};
    var raw = String(rawText == null ? '' : rawText).replace(/^\s+|\s+$/g, '');
    if (!raw) return { ok: false, error: 'empty' };
    if (/\s/.test(raw)) return { ok: false, error: 'spaces' };
    if (raw.length > MAX_INPUT) return { ok: false, error: 'long' };
    var mark = '';
    var last = raw.charAt(raw.length - 1);
    if (last === '.' || last === ',') { mark = last; raw = raw.slice(0, -1); }
    if (!raw) return { ok: false, error: 'empty' };
    if (raw.length > MAX_WORD) return { ok: false, error: 'long' };
    var chars = raw.split('');
    var letters = 0, digits = 0;
    for (var i = 0; i < chars.length; i++) {
      var ch = chars[i];
      var inner = i > 0 && i < chars.length - 1;
      if (isLetter(ch)) { letters++; continue; }
      if (isDigit(ch)) { digits++; continue; }
      if (ch === "'" || ch === '’') {
        if (inner || (i === chars.length - 1 && i > 0)) continue;
        return { ok: false, error: 'letters' };
      }
      if (ch === '-' && inner && chars[i - 1] !== '-') continue;
      // "!", "?", "..", ";" and friends: a full stop is the only ending.
      if ('.,!?;:…"'.indexOf(ch) !== -1) return { ok: false, error: 'punct' };
      return { ok: false, error: 'letters' };
    }
    if (letters && digits) return { ok: false, error: 'letters' };
    var low = raw.toLowerCase();
    if (letters && typeof opts.isQuiet === 'function' && opts.isQuiet(low.replace(/['’-]/g, ''))) return { ok: false, error: 'rude' };

    // Capitals: "WATER" is "water"; "Paris" stays a name; "i" is "I".
    var shout = letters > 1 && raw === raw.toUpperCase();
    var capital = letters && !shout && raw.charAt(0) !== raw.charAt(0).toLowerCase();
    var word = shout ? low : (capital ? raw.charAt(0) + raw.slice(1).toLowerCase() : low);
    if (low === 'i') word = 'I';
    else if (/^i['’]/.test(low)) word = 'I' + low.slice(1);
    // Names ("Tendai", "Harare") are fine even if the word bank has never heard of them:
    // typing the capital is how a player says it is a name. The judge still reads the sentence.
    var isName = capital;
    if (letters && !isName && !known(low, opts.isWord)) return { ok: false, error: 'unknown' };
    if ((opts.position || 0) === 0) word = word.charAt(0).toUpperCase() + word.slice(1);
    if ((opts.position || 0) >= MAX_WORDS - 1 && mark !== '.') return { ok: false, error: 'tooLong' };
    return { ok: true, text: word + mark, ends: mark === '.' };
  }

  function bare(text) { return String(text || '').replace(/[.,]$/, '').toLowerCase(); }

  /* "The cat sat." from [{ w: 'The' }, { w: 'cat' }, { w: 'sat.' }]. */
  function sentenceText(words) {
    return (words || []).map(function (x) { return x.w; }).join(' ');
  }

  /* When no AI judge answers: every word is already a real word, so only catch
     the obvious junk. reason: short | repeat | ok */
  function fallbackJudge(words) {
    var list = (words || []).map(function (x) { return bare(x.w); });
    if (list.length < MIN_SENTENCE) return { ok: false, reason: 'short' };
    var run = 1;
    for (var i = 1; i < list.length; i++) {
      run = list[i] === list[i - 1] ? run + 1 : 1;
      if (run > 2) return { ok: false, reason: 'repeat' };
    }
    var seen = {};
    list.forEach(function (w) { seen[w] = (seen[w] || 0) + 1; });
    var distinct = Object.keys(seen).length;
    if (distinct * 2 < list.length) return { ok: false, reason: 'repeat' };
    var most = 0;
    Object.keys(seen).forEach(function (w) { if (seen[w] > most) most = seen[w]; });
    if (list.length >= 4 && most > Math.ceil(list.length / 2)) return { ok: false, reason: 'repeat' };
    return { ok: true, reason: 'ok' };
  }

  /* Points: one per word in an accepted sentence, to whoever wrote it. Each
     sentence id counts once, however often it appears. */
  function score(sentences, seats) {
    var out = {};
    (seats || []).forEach(function (uid) { out[uid] = { points: 0, words: [] }; });
    var counted = {};
    (sentences || []).forEach(function (s) {
      if (!s || s.status !== 'accepted' || counted[s.id]) return;
      counted[s.id] = true;
      (s.words || []).forEach(function (x) {
        if (!out[x.uid]) return;           // not a seat in this match: never a point
        out[x.uid].points++;
        out[x.uid].words.push(x.w);
      });
    });
    return out;
  }

  /* Best first; ties keep the seat order. */
  function ranked(sc, seats) {
    return (seats || []).map(function (uid, i) { return { uid: uid, points: (sc[uid] || {}).points || 0, i: i }; })
      .sort(function (a, b) { return b.points - a.points || a.i - b.i; })
      .map(function (r) { return { uid: r.uid, points: r.points }; });
  }

  /* Everyone with the top score (none if nobody scored). */
  function winners(sc, seats) {
    var best = 0;
    (seats || []).forEach(function (uid) { best = Math.max(best, (sc[uid] || {}).points || 0); });
    if (!best) return [];
    return seats.filter(function (uid) { return ((sc[uid] || {}).points || 0) === best; });
  }

  FF.WordFlowRules = {
    MIN_PLAYERS: MIN_PLAYERS, MAX_PLAYERS: MAX_PLAYERS, MODES: MODES,
    GAME_SECONDS: GAME_SECONDS, TURN_SECONDS: TURN_SECONDS, DEFAULTS: DEFAULTS,
    MAX_WORD: MAX_WORD, MAX_INPUT: MAX_INPUT, MAX_WORDS: MAX_WORDS, MIN_SENTENCE: MIN_SENTENCE,
    sanitizeSettings: sanitizeSettings,
    parseWord: parseWord,
    known: known,
    bare: bare,
    sentenceText: sentenceText,
    fallbackJudge: fallbackJudge,
    score: score,
    ranked: ranked,
    winners: winners
  };
})();
