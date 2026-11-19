/* ============================================================
   PLAYMONA — celebrate/wordByWord/rules.js
   Word by Word: all the groups write one message to the
   celebrant together, one word per turn, in a fixed order.
   Every letter is a point.

   The rules every side shares: the organiser's editor, the
   phones, the TV, the referee in the crew runner and (for the
   settings lists) api/lib/CelebrationGames.php, which must stay
   in step. Words are checked by FF.WordFlowRules.parseWord.
   Classic script, ES2017 or older, no DOM.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var MODES = ['open', 'blind'];
  var MIN_UNITS = ['rounds', 'words'];
  var SECONDS = [10, 15, 20, 30, 45, 60];
  var ROUNDS_MAX = 10;
  var WORDS_MIN_MAX = 100;
  var MAX_NAMES = 20;
  var MAX_NAME = 24;
  var MAX_OPENING = 60;
  var MAX_INPUT = 26;            // what the inbox rule lets through (word + ending)
  var MARKS = '.,!';             // the endings a word may have
  var DEFAULTS = { mode: 'open', rounds: 3, minUnit: 'rounds', minCount: 2, seconds: 20 };

  function pick(v, allowed, fallback) {
    if (typeof allowed[0] === 'number') v = Number(v);
    return allowed.indexOf(v) !== -1 ? v : fallback;
  }

  function clampInt(v, lo, hi, fallback) {
    if (v == null || v === '') return fallback;
    var n = Number(v);
    if (!isFinite(n)) return fallback;
    return Math.max(lo, Math.min(hi, Math.round(n)));
  }

  function cleanText(v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  }

  function list(v) {
    if (Array.isArray(v)) return v.filter(function (x) { return x != null; });
    if (v && typeof v === 'object') return Object.keys(v).sort(function (a, b) { return a - b; }).map(function (k) { return v[k]; });
    return [];
  }

  /* The organiser's settings, with anything unknown put back to the standard. */
  function sanitize(raw) {
    raw = raw || {};
    var rounds = clampInt(raw.rounds, 1, ROUNDS_MAX, DEFAULTS.rounds);
    var minUnit = pick(raw.minUnit, MIN_UNITS, DEFAULTS.minUnit);
    var minCount = clampInt(raw.minCount, 0, minUnit === 'rounds' ? rounds : WORDS_MIN_MAX, Math.min(DEFAULTS.minCount, rounds));
    var seen = {};
    var names = [];
    list(raw.names).forEach(function (n) {
      var w = cleanText(n, 100);
      if (!w || /\s/.test(w) || w.length > MAX_NAME || names.length >= MAX_NAMES) return;
      var k = key(w);
      if (!k || seen[k]) return;
      seen[k] = true;
      names.push(w);
    });
    return {
      mode: pick(raw.mode, MODES, DEFAULTS.mode),
      rounds: rounds,
      minUnit: minUnit,
      minCount: minCount,
      seconds: pick(raw.seconds, SECONDS, DEFAULTS.seconds),
      opening: cleanText(raw.opening, MAX_OPENING),
      names: names
    };
  }

  function isLetter(ch) { return ch.toLowerCase() !== ch.toUpperCase(); }

  /* The letters in a word: not ' or -, the ending or digits. */
  function letters(text) {
    var n = 0;
    String(text || '').split('').forEach(function (ch) { if (isLetter(ch)) n++; });
    return n;
  }

  /* How a name is compared: lower case, letters only, without a closing 's. */
  function key(w) {
    var s = String(w || '').toLowerCase().replace(/[.,!]+$/, '').replace(/['’]s$/, '');
    return s.split('').filter(isLetter).join('');
  }

  /* The names that score in full: the celebrant's (each part) and the organiser's own words. */
  function known(names, celebrant) {
    var set = {};
    list(names).concat(String(celebrant || '').split(/\s+/)).forEach(function (w) {
      var k = key(w);
      if (k) set[k] = true;
    });
    return set;
  }

  /* A parsed word's points: its letters, or 1 for a name nobody listed. */
  function points(word, knownSet) {
    if (!word || !word.text) return 0;
    var n = letters(word.text);
    if (!n) return 0;
    if (word.name && !(knownSet || {})[key(word.text)]) return 1;
    return n;
  }

  /* One word as typed. capital: this word starts a sentence, so it gets a capital (and that capital
     doesn't make it a name). A capital makes a name only when the word bank doesn't know the word
     ("Happy" is a word, "Harare" a name). known: names typed in capitals ("VICKY!") are still names. */
  function parse(raw, opts) {
    opts = opts || {};
    var typed = String(raw == null ? '' : raw).trim();
    var k = key(typed);
    if (k.length > 1 && opts.known && opts.known[k] && typed === typed.toUpperCase()) {
      typed = typed.charAt(0) + typed.slice(1).toLowerCase();
    }
    var res = FF.WordFlowRules.parseWord(typed, {
      isWord: opts.isWord, isQuiet: opts.isQuiet, position: opts.capital ? 0 : 1, marks: MARKS, maxWords: 0
    });
    if (!res.ok) return res;
    var name = !!res.name && !(typeof opts.isWord === 'function' && k && opts.isWord(k));
    return { ok: true, text: res.text, name: name, ends: !!res.ends };
  }

  /* Can a group end the message now? added: words added so far (not the opening); teams: in the order. */
  function minReached(config, added, teams) {
    var need = config.minUnit === 'words' ? config.minCount : config.minCount * Math.max(1, teams);
    return added >= need;
  }

  /* The kept message: the opening and the words, with a full stop if it has no ending. */
  function finalText(opening, words) {
    var parts = [];
    if (opening) parts.push(opening);
    list(words).forEach(function (x) { if (x && x.w) parts.push(x.w); });
    var text = parts.join(' ');
    if (!text) return '';
    var last = text.charAt(text.length - 1);
    if (last === ',') text = text.slice(0, -1);
    if (!/[.!]$/.test(text)) text += '.';
    return text;
  }

  /* Does the next word start a sentence? After nothing, or after a . or ! */
  function startsSentence(opening, words) {
    var all = list(words);
    var prev = all.length ? all[all.length - 1].w : opening;
    if (!prev) return true;
    return /[.!]$/.test(prev);
  }

  FF.WordByWordRules = {
    MODES: MODES, MIN_UNITS: MIN_UNITS, SECONDS: SECONDS, ROUNDS_MAX: ROUNDS_MAX, WORDS_MIN_MAX: WORDS_MIN_MAX,
    MAX_NAMES: MAX_NAMES, MAX_NAME: MAX_NAME, MAX_OPENING: MAX_OPENING, MAX_INPUT: MAX_INPUT, MARKS: MARKS, DEFAULTS: DEFAULTS,
    sanitize: sanitize, letters: letters, key: key, known: known, points: points, parse: parse,
    minReached: minReached, finalText: finalText, startsSentence: startsSentence, list: list, cleanText: cleanText
  };
})();
