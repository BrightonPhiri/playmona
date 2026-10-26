/* ============================================================
   PLAYMONA — words.js
   FF.Words: the shared English word bank for every word game.

   The words themselves (about 113,000, js/data/lexicon.js) load
   on demand: call FF.Words.load() when a word game opens. Until
   they arrive, isWord() falls back to the small built-in list in
   js/data/words.js, so nothing breaks offline or on file://.

   Tiers: 1 everyday, 2 common, 3 known, 4 rare. Deal letters and
   show answers from the low tiers; accept every tier when typed.
   "Quiet" words are real but rude-sounding: accepted, never shown.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var SRC = 'js/data/lexicon.js';
  var A = 97;

  var byWord = null;   // word -> tier (1-4), 5 for quiet words
  var lists = null;    // [tier1[], tier2[], tier3[], tier4[]]
  var masks = null;    // parallel to lists: 26-bit letter masks
  var loading = null;
  var meanings = {};

  function decode(str) {
    var out = [];
    var prev = '';
    var i = 0;
    var n = str.length;
    while (i < n) {
      var p = str.charCodeAt(i) - 65;
      var j = i + 1;
      while (j < n && str.charCodeAt(j) >= A) j++;
      prev = prev.slice(0, p) + str.slice(i + 1, j);
      out.push(prev);
      i = j;
    }
    return out;
  }

  function maskOf(w) {
    var m = 0;
    for (var i = 0; i < w.length; i++) m |= 1 << (w.charCodeAt(i) - A);
    return m;
  }

  function clean(w) {
    return String(w == null ? '' : w).toLowerCase().replace(/[^a-z]/g, '');
  }

  // Unpack FF.Lexicon once it is on the page.
  function attach() {
    if (byWord || !FF.Lexicon || !FF.Lexicon.tiers) return !!byWord;
    var map = {};
    var all = [];
    var allMasks = [];
    FF.Lexicon.tiers.forEach(function (str, t) {
      var words = decode(str);
      var m = new Array(words.length);
      for (var i = 0; i < words.length; i++) {
        map[words[i]] = t + 1;
        m[i] = maskOf(words[i]);
      }
      all.push(words);
      allMasks.push(m);
    });
    String(FF.Lexicon.quiet || '').split(' ').forEach(function (w) { if (w) map[w] = 5; });
    byWord = map;
    lists = all;
    masks = allMasks;
    return true;
  }

  // Letter counts for a rack, so a word can be checked against it quickly.
  function counts(letters) {
    var c = [];
    for (var i = 0; i < 26; i++) c.push(0);
    for (var j = 0; j < letters.length; j++) {
      var k = letters.charCodeAt(j) - A;
      if (k >= 0 && k < 26) c[k]++;
    }
    return c;
  }

  function fits(word, have) {
    var need = {};
    for (var i = 0; i < word.length; i++) {
      var k = word.charCodeAt(i) - A;
      need[k] = (need[k] || 0) + 1;
      if (need[k] > have[k]) return false;
    }
    return true;
  }

  function legacyIsWord(w) {
    var d = FF.data && FF.data.words;
    return !!(d && typeof d.isWord === 'function' && d.isWord(w));
  }

  FF.Words = {
    _attach: attach,

    /* Load the full word bank. Resolves true when it is ready, false if
       it could not load (the small built-in list keeps working). */
    load: function () {
      if (attach()) return Promise.resolve(true);
      if (loading) return loading;
      if (typeof document === 'undefined') return Promise.resolve(false);
      loading = new Promise(function (resolve) {
        var s = document.createElement('script');
        s.src = SRC;
        s.async = true;
        s.onload = function () { resolve(attach()); };
        s.onerror = function () { loading = null; resolve(false); };
        document.head.appendChild(s);
      });
      return loading;
    },

    ready: function () { return attach(); },

    count: function () {
      if (!attach()) return 0;
      var n = 0;
      lists.forEach(function (l) { n += l.length; });
      return n;
    },

    /* 1-4 for a word in the bank, 0 if it is not there. */
    tier: function (word) {
      if (!attach()) return 0;
      var t = byWord[clean(word)];
      return t && t < 5 ? t : 0;
    },

    /* Real but rude-sounding: accept it, never show it. */
    isQuiet: function (word) {
      return !!(attach() && byWord[clean(word)] === 5);
    },

    /* Any real word of 3+ letters. Uses the built-in list too, so names
       like "lego" that the family list adds still count. */
    isWord: function (word) {
      var w = clean(word);
      if (w.length < 3) return false;
      if (attach() && byWord[w]) return true;
      return legacyIsWord(w);
    },

    /* Every word that can be made from the letters (each letter used at
       most as often as it appears). opts: { min (3), max, maxTier (4),
       quiet (false) }. Longest first, then A-Z. */
    wordsFrom: function (letters, opts) {
      opts = opts || {};
      if (!attach()) return [];
      var rack = clean(Array.isArray(letters) ? letters.join('') : letters);
      var have = counts(rack);
      var rackMask = maskOf(rack);
      var min = opts.min || 3;
      var max = Math.min(opts.max || rack.length, rack.length);
      var top = Math.min(opts.maxTier || 4, 4);
      var out = [];
      for (var t = 0; t < top; t++) {
        var words = lists[t];
        var m = masks[t];
        for (var i = 0; i < words.length; i++) {
          var w = words[i];
          if (w.length < min || w.length > max || (m[i] & ~rackMask)) continue;
          if (fits(w, have)) out.push(w);
        }
      }
      return out.sort(function (a, b) { return b.length - a.length || (a < b ? -1 : 1); });
    },

    /* A random word. opts: { min, max, maxTier (2), test(word) }.
       Uses FF.util.pick, so it follows the room's seeded random. */
    random: function (opts) {
      opts = opts || {};
      if (!attach()) return null;
      var min = opts.min || 3;
      var max = opts.max || 15;
      var pool = [];
      for (var t = 0; t < Math.min(opts.maxTier || 2, 4); t++) {
        var words = lists[t];
        for (var i = 0; i < words.length; i++) {
          var w = words[i];
          if (w.length >= min && w.length <= max && (!opts.test || opts.test(w))) pool.push(w);
        }
      }
      return pool.length ? FF.util.pick(pool) : null;
    },

    /* Letters for an anagram round, built from one "key" word that uses
       them all. opts: { length (7), keyTier (2), maxTier (2), min (3),
       minWords (10), maxWords, tries (40) }. Returns { letters[], key, words[] }
       with words = the answers worth finding (tier <= maxTier). With
       maxWords, rounds land in that band, so players taking turns get
       puzzles of a similar size. */
    rack: function (opts) {
      opts = opts || {};
      if (!attach()) return null;
      var len = opts.length || 7;
      var keyTier = opts.keyTier || 2;
      var maxTier = opts.maxTier || 2;
      var min = opts.min || 3;
      var want = opts.minWords || 10;
      var cap = opts.maxWords || Infinity;
      function miss(n) { return n < want ? want - n : (n > cap ? n - cap : 0); }
      var keys = [];
      for (var t = 0; t < keyTier; t++) {
        var words = lists[t];
        for (var i = 0; i < words.length; i++) {
          // No plurals as the key word: "PLANETS" makes a weaker round than "PLANET" + E.
          if (words[i].length === len && words[i].charAt(len - 1) !== 's') keys.push(words[i]);
        }
      }
      if (!keys.length) return null;
      var best = null;
      for (var n = 0; n < (opts.tries || 40); n++) {
        var key = FF.util.pick(keys);
        var found = this.wordsFrom(key, { min: min, maxTier: maxTier });
        if (!best || miss(found.length) < miss(best.words.length)) best = { key: key, words: found };
        if (!miss(found.length)) break;
      }
      var letters = FF.util.shuffle(best.key.split(''));
      // Never deal the key word already spelled out.
      if (letters.join('') === best.key) letters.push(letters.shift());
      return { letters: letters, key: best.key, words: best.words };
    },

    /* What a word means, from the Free Dictionary API (dictionaryapi.dev,
       no key). Resolves { word, phonetic, senses: [{ pos, text, example }] }
       or null when offline or the word has no entry. */
    define: function (word) {
      var w = clean(word);
      if (!w) return Promise.resolve(null);
      if (meanings[w]) return meanings[w];
      if (typeof fetch !== 'function') return Promise.resolve(null);
      var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 8000) : null;
      var p = fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(w), ctrl ? { signal: ctrl.signal } : {})
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (data) {
          if (timer) clearTimeout(timer);
          var entry = data && data[0];
          if (!entry) return null;
          var senses = [];
          (entry.meanings || []).forEach(function (m) {
            var d = m.definitions && m.definitions[0];
            if (d && d.definition && senses.length < 3) senses.push({ pos: m.partOfSpeech || '', text: d.definition, example: d.example || '' });
          });
          var phonetic = entry.phonetic || '';
          if (!phonetic && entry.phonetics) entry.phonetics.forEach(function (ph) { if (!phonetic && ph.text) phonetic = ph.text; });
          return senses.length ? { word: w, phonetic: phonetic, senses: senses } : null;
        })
        .catch(function () {
          if (timer) clearTimeout(timer);
          delete meanings[w];   // offline: try again next time
          return null;
        });
      meanings[w] = p;
      return p;
    }
  };

  // Let the older check see the full bank too, so Word Builder and Word
  // Chain accept every real word without changing their code.
  var d = FF.data && FF.data.words;
  if (d && typeof d.isWord === 'function' && !d._bankLinked) {
    var smallCheck = d.isWord;
    d.isWord = function (word) {
      var w = clean(word);
      if (w.length >= 3 && attach() && byWord[w]) return true;
      return smallCheck.call(d, word);
    };
    d._bankLinked = true;
  }
})();
