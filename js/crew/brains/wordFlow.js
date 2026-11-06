/* ============================================================
   PLAYMONA — crew/brains/wordFlow.js
   How PlayMona-run players play WordFlow. Two parts, kept apart:

   FF.CrewWordFlow.strategy   pure decisions: the next word from a
                              small word bank that follows the shape
                              of a simple sentence (the AI's word is
                              used instead when it answers), and when
                              to end a sentence.
   FF.CrewWordFlow.create     plays one room's crew seats through the
                              same inbox a phone uses, so the referee
                              checks a crew word like any other.

   A crew player sees only the public view, like everyone else.
   Classic script, ES2017 or older, no DOM.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.WordFlowRules;

  /* A tiny grammar: each kind of word and what may follow it. Past tense keeps
     verbs agreeing with any subject. */
  var BANK = {
    det: ['the', 'a', 'my', 'our', 'one', 'every', 'that'],
    adj: ['little', 'happy', 'brave', 'sleepy', 'tiny', 'giant', 'clever', 'shiny', 'quiet', 'funny', 'old', 'golden'],
    noun: ['dog', 'cat', 'dragon', 'teacher', 'farmer', 'robot', 'baby', 'goat', 'king', 'bird', 'friend', 'rabbit', 'chef', 'monkey'],
    verb: ['found', 'saw', 'chased', 'painted', 'carried', 'visited', 'cooked', 'built', 'lost', 'hugged', 'followed', 'loved'],
    place: ['garden', 'river', 'kitchen', 'market', 'school', 'forest', 'village', 'mountain', 'beach', 'castle'],
    prep: ['in', 'near', 'behind', 'under', 'beside', 'across', 'into'],
    adv: ['today', 'yesterday', 'quickly', 'slowly', 'happily', 'again', 'together', 'outside']
  };
  // det → adj/noun → verb → det → noun → prep → det → place → adv. (with "." on the last word)
  var NEXT = {
    start: ['det'], det: ['adj', 'noun', 'noun'], adj: ['noun'], noun: ['verb'], verb: ['det2'],
    det2: ['adj2', 'noun2', 'noun2'], adj2: ['noun2'], noun2: ['prep', 'adv'], prep: ['det3'], det3: ['place'], place: ['adv', 'end'], adv: ['end']
  };
  var KIND = { det2: 'det', det3: 'det', adj2: 'adj', noun2: 'noun' };
  var ENDABLE = { noun2: true, place: true, adv: true };

  function low(s) { return String(s || '').replace(/[.,]$/, '').toLowerCase(); }
  function pickOne(list, random) { return list[Math.floor(random() * list.length)]; }

  /* What kind of word was this, as far as the bank can tell, given where it fell. */
  function slotOf(words) {
    var slot = 'start';
    for (var i = 0; i < words.length; i++) {
      var w = low(words[i].w);
      var choices = NEXT[slot] || [];
      var found = null;
      for (var c = 0; c < choices.length; c++) {
        var kind = KIND[choices[c]] || choices[c];
        if (BANK[kind] && BANK[kind].indexOf(w) !== -1) { found = choices[c]; break; }
      }
      if (!found) {
        // Someone wrote their own word: guess its place from the word bank, or call it a noun.
        found = BANK.verb.indexOf(w) !== -1 ? 'verb' : BANK.prep.indexOf(w) !== -1 ? 'prep'
          : BANK.det.indexOf(w) !== -1 ? (i ? 'det2' : 'det') : BANK.adv.indexOf(w) !== -1 ? 'adv'
            : BANK.place.indexOf(w) !== -1 ? 'place' : (slot === 'start' || slot === 'det' || slot === 'adj') ? 'noun' : 'noun2';
      }
      slot = found;
    }
    return slot;
  }

  var strategy = {
    /* The next word from the bank. opts: { words (the sentence so far), random, wantEnd } */
    bankWord: function (opts) {
      var words = opts.words || [];
      var random = opts.random || Math.random;
      var slot = slotOf(words);
      var used = {};
      words.forEach(function (x) { used[low(x.w)] = true; });
      var options = (NEXT[slot] || ['end']).filter(function (n) { return n !== 'end'; });
      // Long enough, or nowhere left to go: end on a word that can close the sentence.
      if (!options.length || (opts.wantEnd && ENDABLE[slot])) return null;
      var next = pickOne(options, random);
      if (opts.wantEnd) {
        var closing = options.filter(function (n) { return ENDABLE[n]; });
        if (closing.length) next = pickOne(closing, random);
      }
      var kind = KIND[next] || next;
      var fresh = BANK[kind].filter(function (w) { return !used[w]; });
      var word = pickOne(fresh.length ? fresh : BANK[kind], random);
      var endsHere = ENDABLE[next] && (opts.wantEnd || !(NEXT[next] || []).some(function (n) { return n !== 'end'; }));
      return word + (endsHere ? '.' : '');
    },

    /* After this many words a crew player tries to finish the sentence. */
    targetLength: function (random) { return 6 + Math.floor(random() * 5); },

    /* A word that can end whatever has been written. */
    closer: function (words, random) {
      var slot = slotOf(words);
      if (slot === 'det' || slot === 'det2' || slot === 'det3' || slot === 'adj' || slot === 'adj2') return pickOne(BANK.noun, random) + '.';
      if (slot === 'prep') return 'home.';
      return pickOne(BANK.adv, random) + '.';
    },

    /* The word to send: the AI's, if it is a word the referee will take; else the bank's. */
    choose: function (opts) {
      var words = opts.words || [];
      var random = opts.random || Math.random;
      var wantEnd = words.length + 1 >= (opts.target || 8) || words.length + 1 >= R.MAX_WORDS - 2;
      var ai = opts.aiWord;
      if (ai) {
        var p = R.parseWord(ai, { isWord: opts.isWord, isQuiet: opts.isQuiet, position: words.length });
        if (p.ok && (!wantEnd || p.ends || words.length + 1 < R.MAX_WORDS - 2)) return p.text;
      }
      var w = strategy.bankWord({ words: words, random: random, wantEnd: wantEnd });
      if (!w) w = strategy.closer(words, random);
      return w;
    }
  };

  /* ---------- playing the seats ---------- */

  function cmdId() {
    var s = 'c';
    for (var i = 0; i < 24; i++) s += '0123456789abcdef'.charAt(Math.floor(Math.random() * 16));
    return s;
  }

  /* opts: { transport (room), uids (array or function), crew (run sheets), later(fn, ms), log, random,
     suggest({ matchId, mode, current, story, end }) -> Promise<word|null>, isWord, isQuiet } */
  function create(opts) {
    var T = opts.transport;
    var random = opts.random || Math.random;
    var log = opts.log || function () {};
    var done = {};
    var targets = {};
    var latest = null;
    var off = null;

    function now() { return T.serverNow(); }
    function seats() { return typeof opts.uids === 'function' ? opts.uids() : (opts.uids || []); }

    function patience(uid) {
      var p = ((opts.crew[uid] || {}).persona || {}).patience;
      return typeof p === 'number' ? p / 100 : 0.5;
    }

    function send(uid, wf, word) {
      var cmd = { type: 'word', matchId: wf.matchId, turnId: wf.turnId, word: word, t: T.serverTimestamp ? T.serverTimestamp() : now() };
      return T.set('wfInbox/' + uid + '/' + cmdId(), cmd).catch(function (e) { log('wordflow word failed: ' + e.message); });
    }

    function story(wf) {
      return (wf.sentences || []).filter(function (s) { return s.status === 'accepted'; }).map(function (s) { return R.sentenceText(s.words); });
    }

    function onWf(wf) {
      latest = wf;
      if (!wf || wf.phase !== 'playing' || !wf.turnUid) return;
      var uid = wf.turnUid;
      if (seats().indexOf(uid) === -1) return;
      var key = wf.matchId + ':' + wf.turnId;
      if (done[key]) return;
      done[key] = true;
      var words = (wf.current || []).slice();
      var sentenceNo = (wf.sentences || []).length;
      var tKey = wf.matchId + ':' + sentenceNo;
      if (!targets[tKey]) targets[tKey] = strategy.targetLength(random);
      var wantEnd = words.length + 1 >= targets[tKey];
      // A human-like moment to think, never past the turn clock.
      var think = 1800 + random() * 2600 + patience(uid) * 1500;
      var due = Math.min(think, Math.max(300, wf.turnDeadline - now() - 1200));
      var asked = typeof opts.suggest === 'function'
        ? Promise.resolve().then(function () {
          return opts.suggest({ matchId: wf.matchId, mode: wf.mode, current: R.sentenceText(words), story: story(wf), end: wantEnd });
        }).catch(function () { return null; })
        : Promise.resolve(null);
      var started = now();
      asked.then(function (aiWord) {
        var waited = now() - started;
        opts.later(function () {
          var cur = latest;
          if (!cur || cur.matchId !== wf.matchId || cur.turnId !== wf.turnId || cur.phase !== 'playing') return;
          var word = strategy.choose({ words: words, random: random, aiWord: aiWord, target: targets[tKey], isWord: opts.isWord, isQuiet: opts.isQuiet });
          send(uid, cur, word);
        }, Math.max(0, due - waited));
      });
    }

    return {
      start: function () { off = T.watch('wf', onWf); },
      stop: function () { if (off) off(); off = null; latest = null; }
    };
  }

  FF.CrewWordFlow = { strategy: strategy, create: create, BANK: BANK };

  // WordFlow has no seeded rounds to plan; the seats play through FF.CrewWordFlow instead.
  if (FF.CrewBrains) FF.CrewBrains.register(['wordFlow'], { plan: function () { return null; } });
})();
