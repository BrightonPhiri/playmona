/* ============================================================
   PLAYMONA — games/stacoend.js
   Stacoend (Start · Contain · End): each round sets a challenge, such
   as "words that start with BR", "contain IGHT" or "end with ING".
   Type as many real words that fit as you can before the clock runs out.

   - Modes: Start, Contain, End, or Mixed (every round a different kind,
     including "starts with B and ends with T").
   - Levels: easy, medium, hard letters; the round clock is set apart.
   - Solo with a setup screen and personal bests; pass and play (everyone
     gets the same challenges, in turn).
   - Online rooms: a parallel challenge (js/net/parallel.js). Every phone
     draws the same challenge from the round seed.

   Words are checked against the shared word bank (FF.Words, about
   113,000 English words, js/data/lexicon.js). Only real words count:
   "brxyz" fits BR but is not a word.

   The pure rules are FF.Stacoend (tools/test/stacoend.test.js).
   Looks: css/games.css (.sc-*).
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  function t(key, fallback, vars) {
    if (FF.t) return FF.t(key, fallback, vars);
    return String(fallback).replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] != null ? vars[k] : m; });
  }

  /* ================= rules (pure, tested) ================= */

  var MODES = ['start', 'contain', 'end', 'mixed'];
  var LEVELS = ['easy', 'medium', 'hard'];
  var ROUNDS = [1, 2, 3, 4, 5];
  var SECONDS = [30, 45, 60, 90, 120];
  var KINDS = ['start', 'contain', 'end', 'both'];   // 'both' = starts with A and ends with B
  var ROOM_ROUNDS = 3;
  var COUNT_IN = 3;

  /* Points. Change these to retune the game; the rules screen and the
     results read them, so nothing else needs editing. */
  var SCORING = {
    base: 10,           // every accepted word
    perLetter: 5,       // each letter past minLength
    minLength: 3,       // shortest word accepted
    longAt: 8,          // a word this long or longer...
    longBonus: 15,      // ...earns this on top
    rareTier: 3,        // a word from the bank's "known" or "rare" tiers...
    rareBonus: 10       // ...earns this on top
  };

  /* A round must have at least this many common words that fit, so it is
     never impossible (counted from the bank's everyday + common tiers). */
  var ENOUGH = { easy: 120, medium: 50, hard: 15 };
  var ENOUGH_BOTH = { easy: 30, medium: 15, hard: 8 };

  /* The letters each kind of round can ask for, by level. Each one is
     checked against the word bank before it is used (see ENOUGH). */
  var FRAGMENTS = {
    start: {
      easy: ['b', 'c', 'd', 'f', 'g', 'h', 'l', 'm', 'p', 'r', 's', 't', 'w', 'co', 're', 'de', 'pr', 'st', 'ca', 'ma', 'pa', 'tr', 'ch', 'sp', 'ba', 'mo', 'sh', 'cr', 'gr', 'ho', 'br', 'fl', 'sa', 'cl', 'bl', 'li', 'ta', 'fr', 'th', 'sl', 'pl', 'dr'],
      medium: ['con', 'dis', 'pro', 'com', 'int', 'tra', 'sta', 'per', 'str', 'cha', 'mis', 'gra', 'sw', 'sn', 'wh', 'gl', 'sub', 'pla', 'sk', 'ph', 'qu', 'ex', 'un', 'imp', 'ove'],
      hard: ['sho', 'spe', 'scr', 'tri', 'wr', 'squ', 'thr', 'kn', 'bre', 'tw', 'cle', 'fri', 'spr', 'shr', 'sch', 'spl']
    },
    contain: {
      easy: ['ou', 'ea', 'ch', 'sh', 'th', 'oo', 'ee', 'ai', 'ow', 'ar', 'or', 'an', 'st'],
      medium: ['ate', 'tion', 'ent', 'ble', 'all', 'ive', 'ine', 'and', 'ove', 'ell', 'ide', 'ack', 'oun', 'oi', 'ain', 'ure', 'one', 'igh', 'ear', 'x', 'qu', 'pp', 'mb', 'ph'],
      hard: ['ght', 'ust', 'aw', 'tch', 'nch', 'ock', 'wn', 'ice', 'ame', 'own', 'ope', 'dge', 'rth', 'ink', 'ook', 'zz', 'ump', 'oar', 'eig', 'ough', 'ike', 'mpt']
    },
    end: {
      easy: ['ing', 'ed', 'y', 't', 'er', 'ly', 'st', 'le', 'al', 'est'],
      medium: ['ion', 'tion', 'ate', 'ty', 'ent', 'ry', 'ic', 'able', 'en', 'ous', 'ive', 'ness', 'ment', 'nd', 'an', 'ck', 'ze', 'ist', 'll', 'ful', 'ay', 'at', 'ish', 'less', 'ow'],
      hard: ['ight', 'ore', 'ship', 'ake', 'ock', 'dge', 'ency', 'ward', 'ame', 'ank', 'ink', 'mb', 'ism', 'ure', 'ant', 'ine']
    },
    // Starts with one of a AND ends with one of b, in groups that pair
    // well (two rare ends together leave too few words to play).
    both: {
      easy: [
        { a: ['b', 'c', 'd', 'f', 'g', 'h', 'l', 'm', 'p', 'r', 's', 't', 'w'], b: ['ing', 'ed', 'er', 'y', 't', 'e', 'ly'] }
      ],
      medium: [
        { a: ['b', 'c', 'd', 'f', 'h', 'm', 'p', 'r', 's', 't'], b: ['est', 'le', 'al', 'ty', 'ry', 'ion'] },
        { a: ['st', 'tr', 'pr', 'ch', 'sh', 'br', 'cr', 'gr', 'sp', 'fl', 'cl', 'bl', 'dr', 'sl', 'fr', 'th'], b: ['ing', 'ed', 'er'] }
      ],
      hard: [
        { a: ['b', 'c', 'd', 'f', 'm', 'p', 'r', 's', 't'], b: ['ness', 'ent', 'en', 'ish', 'ful', 'ic'] },
        { a: ['st', 'tr', 'pr', 'ch', 'sh', 'br', 'cr', 'gr', 'sp', 'fl', 'cl', 'bl', 'dr', 'sl', 'fr'], b: ['est', 'ly', 'y'] }
      ]
    }
  };

  function pickOf(list, v, fallback) { return list.indexOf(v) !== -1 ? v : fallback; }

  function levelOf(difficulty) {
    if (difficulty === 'easy') return 'easy';
    if (difficulty === 'hard') return 'hard';
    return 'medium';
  }

  function defaults(difficulty) {
    var level = levelOf(difficulty);
    return {
      mode: 'mixed',
      level: level,
      rounds: 3,
      seconds: level === 'easy' ? 90 : level === 'hard' ? 45 : 60
    };
  }

  function sanitize(s) {
    s = s || {};
    var d = defaults(s.difficulty);
    var out = {
      mode: pickOf(MODES, s.mode, d.mode),
      level: pickOf(LEVELS, s.level, d.level),
      rounds: pickOf(ROUNDS, Number(s.rounds), d.rounds),
      seconds: pickOf(SECONDS, Number(s.seconds), d.seconds)
    };
    if (s.difficulty) out.difficulty = String(s.difficulty);
    return out;
  }

  var STANDARD = defaults('normal');
  function isStandard(s) {
    var c = sanitize(s);
    return c.mode === STANDARD.mode && c.level === STANDARD.level && c.rounds === STANDARD.rounds && c.seconds === STANDARD.seconds;
  }
  function key(s) { return [s.mode, s.level, s.rounds, s.seconds].join('|'); }

  function shuffle(list, rand) {
    var a = list.slice();
    for (var j = a.length - 1; j > 0; j--) {
      var k = Math.floor(rand() * (j + 1));
      var x = a[j]; a[j] = a[k]; a[k] = x;
    }
    return a;
  }

  /* Does a (clean, lower-case) word fit the challenge? The word must be
     more than the letters themselves: "ing" never fits END ING. */
  function fits(word, ch) {
    if (!word || !ch) return false;
    if (ch.kind === 'start') return word.length > ch.a.length && word.indexOf(ch.a) === 0;
    if (ch.kind === 'end') return word.length > ch.a.length && word.slice(-ch.a.length) === ch.a;
    if (ch.kind === 'contain') return word.length > ch.a.length && word.indexOf(ch.a) !== -1;
    if (ch.kind === 'both') {
      return word.length >= ch.a.length + ch.b.length && word.length > Math.max(ch.a.length, ch.b.length) &&
        word.indexOf(ch.a) === 0 && word.slice(-ch.b.length) === ch.b;
    }
    return false;
  }

  /* Common words (bank tiers 1-2) that fit, up to limit. */
  function answers(ch, limit, maxTier) {
    if (!FF.Words || !FF.Words.matching) return [];
    return FF.Words.matching(function (w) { return fits(w, ch); }, { min: SCORING.minLength, maxTier: maxTier || 2, limit: limit });
  }

  function playable(ch, level) {
    var need = (ch.kind === 'both' ? ENOUGH_BOTH : ENOUGH)[level] || 15;
    return answers(ch, need).length >= need;
  }

  function same(a, b) { return a.kind === b.kind && a.a === b.a && (a.b || '') === (b.b || ''); }

  /* One challenge of a kind, at a level, from rand (the room's seeded
     random in a room). avoid: challenges already used this game. */
  function challenge(kind, level, rand, avoid) {
    avoid = avoid || [];
    level = pickOf(LEVELS, level, 'medium');
    kind = pickOf(KINDS, kind, 'start');
    var tries = [];
    if (kind === 'both') {
      FRAGMENTS.both[level].forEach(function (set) {
        set.a.forEach(function (a) {
          set.b.forEach(function (b) { tries.push({ kind: 'both', a: a, b: b }); });
        });
      });
      tries = shuffle(tries, rand);
    } else {
      tries = shuffle(FRAGMENTS[kind][level], rand).map(function (a) { return { kind: kind, a: a }; });
    }
    // Every pair is tried before the safety net (most pass at once).
    for (var i = 0; i < tries.length; i++) {
      var ch = tries[i];
      if (avoid.some(function (u) { return same(u, ch); })) continue;
      if (playable(ch, level)) return ch;
    }
    // Every list above passes its check; this is only a safety net.
    return kind === 'end' ? { kind: 'end', a: 'ing' } : kind === 'contain' ? { kind: 'contain', a: 'an' } : { kind: 'start', a: 's' };
  }

  /* Which kind of challenge round n is. Mixed walks through all four
     kinds; rooms rotate from a fixed order so every phone agrees. */
  function kindFor(cfg, n, order) {
    if (cfg.mode !== 'mixed') return cfg.mode;
    var list = order || KINDS;
    return list[n % list.length];
  }

  /* Every round's challenge for a local game (one deal for everyone). */
  function deal(cfg, rand) {
    var order = shuffle(KINDS, rand);
    var out = [];
    for (var n = 0; n < cfg.rounds; n++) out.push(challenge(kindFor(cfg, n, order), cfg.level, rand, out));
    return out;
  }

  /* Clean what the player typed: trimmed, lower case, outer punctuation
     dropped ("Bread!" -> "bread"). Returns '' when nothing is left. */
  function normalize(raw) {
    return String(raw == null ? '' : raw)
      .toLowerCase()
      .replace(/[‘’“”]/g, "'")
      .trim()
      .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
  }

  /* Check one submission. found: map of words accepted this round.
     isWord(word): the dictionary check (FF.Words.isWord by default).
     Returns { ok, word, reason } with reason one of
     empty | symbols | dupe | short | bare | pattern | word. */
  function check(raw, ch, found, isWord) {
    var word = normalize(raw);
    if (!word) return { ok: false, word: '', reason: 'empty' };
    if (/[^a-z]/.test(word)) return { ok: false, word: word, reason: 'symbols' };
    if (found && found[word]) return { ok: false, word: word, reason: 'dupe' };
    if (word.length < SCORING.minLength) return { ok: false, word: word, reason: 'short' };
    if (word === ch.a || word === ch.b) return { ok: false, word: word, reason: 'bare' };
    if (!fits(word, ch)) return { ok: false, word: word, reason: 'pattern' };
    var real = isWord ? isWord(word) : !!(FF.Words && FF.Words.isWord(word));
    if (!real) return { ok: false, word: word, reason: 'word' };
    return { ok: true, word: word, reason: null };
  }

  /* Points for one accepted word. tier: the bank's tier (0 if unknown). */
  function wordPoints(word, tier) {
    var len = String(word || '').length;
    if (len < SCORING.minLength) return { points: 0, long: false, rare: false };
    var long = len >= SCORING.longAt;
    var rare = tier >= SCORING.rareTier;
    var pts = SCORING.base + SCORING.perLetter * (len - SCORING.minLength) + (long ? SCORING.longBonus : 0) + (rare ? SCORING.rareBonus : 0);
    return { points: pts, long: long, rare: rare };
  }

  /* A round's totals from its accepted words and attempts. The score is
     always worked out from the words, never added up on the side. */
  function tally(words, rejected, tierOf) {
    var total = 0, longest = '', best = null, rare = 0;
    var seen = {};
    (words || []).forEach(function (w) {
      if (seen[w]) return;   // a word only ever counts once
      seen[w] = true;
      var p = wordPoints(w, tierOf ? tierOf(w) : 0);
      total += p.points;
      if (p.rare) rare++;
      if (w.length > longest.length) longest = w;
      if (!best || p.points > best.points) best = { word: w, points: p.points };
    });
    var count = Object.keys(seen).length;
    var tries = count + (rejected || 0);
    return {
      points: total, words: count, rejected: rejected || 0, rare: rare,
      longest: longest, best: best ? best.word : '',
      accuracy: tries ? Math.round((count / tries) * 100) : 0
    };
  }

  function roomSeconds(cfg) { return cfg.seconds; }

  /* ================= labels and settings ================= */

  function modeLabel(m) {
    return {
      start: t('scModeStart', 'Start'), contain: t('scModeContain', 'Contain'),
      end: t('scModeEnd', 'End'), mixed: t('scModeMixed', 'Mixed')
    }[m] || m;
  }
  function levelLabel(l) {
    return { easy: t('easy', 'Easy'), medium: t('medium', 'Medium'), hard: t('hard', 'Hard') }[l] || l;
  }
  function kindLabel(k) {
    return { start: t('scStart', 'Start'), contain: t('scContain', 'Contain'), end: t('scEnd', 'End'), both: t('scBoth', 'Start + End') }[k] || k;
  }
  function up(s) { return String(s || '').toUpperCase(); }

  /* "Words that start with BR" */
  function sentence(ch) {
    if (ch.kind === 'start') return t('scSayStart', 'Words that start with {a}', { a: up(ch.a) });
    if (ch.kind === 'end') return t('scSayEnd', 'Words that end with {a}', { a: up(ch.a) });
    if (ch.kind === 'contain') return t('scSayContain', 'Words that contain {a}', { a: up(ch.a) });
    return t('scSayBoth', 'Words that start with {a} and end with {b}', { a: up(ch.a), b: up(ch.b) });
  }
  function shortText(ch) {
    if (ch.kind === 'start') return up(ch.a) + '…';
    if (ch.kind === 'end') return '…' + up(ch.a);
    if (ch.kind === 'contain') return '…' + up(ch.a) + '…';
    return up(ch.a) + '…' + up(ch.b);
  }

  function summary(s) {
    s = sanitize(s);
    return [
      modeLabel(s.mode),
      levelLabel(s.level),
      t('scNRounds', '{n} rounds', { n: s.rounds }),
      t('scNSec', '{n}s each', { n: s.seconds })
    ].join(' · ');
  }

  function fields(opts) {
    function opt(label, value) { return { label: label, value: value }; }
    var list = [
      { key: 'mode', label: t('scMode', 'Challenge'), options: MODES.map(function (m) { return opt(modeLabel(m), m); }) },
      { key: 'level', label: t('scLevel', 'Letters'), options: LEVELS.map(function (l) { return opt(levelLabel(l), l); }) },
      { key: 'seconds', label: t('scClock', 'Round clock'), options: SECONDS.map(function (n) { return opt(n + 's', n); }) }
    ];
    if (!(opts && opts.room)) list.splice(2, 0, { key: 'rounds', label: t('scRounds', 'Rounds'), options: ROUNDS.map(function (n) { return opt(String(n), n); }) });
    return list;
  }

  function reasonText(r, ch) {
    switch (r) {
      case 'symbols': return t('scWhySymbols', 'Letters only: one word, no spaces or symbols.');
      case 'dupe': return t('scWhyDupe', 'You already have that one.');
      case 'tried': return t('scWhyTried', 'You already tried that.');
      case 'short': return t('scWhyShort', 'Too short: use at least {n} letters.', { n: SCORING.minLength });
      case 'bare': return t('scWhyBare', 'Add some letters: that is just the challenge.');
      case 'pattern':
        if (ch.kind === 'start') return t('scWhyStart', 'Doesn’t start with {a}.', { a: up(ch.a) });
        if (ch.kind === 'end') return t('scWhyEnd', 'Doesn’t end with {a}.', { a: up(ch.a) });
        if (ch.kind === 'contain') return t('scWhyContain', 'Doesn’t contain {a}.', { a: up(ch.a) });
        return t('scWhyBoth', 'Must start with {a} and end with {b}.', { a: up(ch.a), b: up(ch.b) });
      case 'word': return t('scWhyWord', 'Not in the dictionary.');
      default: return '';
    }
  }

  function scoringLines() {
    return [
      t('scRuleBase', '{b} points a word, +{p} for each letter past {m}.', { b: SCORING.base, p: SCORING.perLetter, m: SCORING.minLength }),
      t('scRuleLong', '+{n} for a word of {l} letters or more.', { n: SCORING.longBonus, l: SCORING.longAt }),
      t('scRuleRare', '+{n} for a rare word.', { n: SCORING.rareBonus })
    ];
  }

  /* ================= device helpers ================= */

  function reduceMotion() {
    var setting = FF.Settings && FF.Settings.get && FF.Settings.get('reduceMotion');
    var os = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return !!(setting || os);
  }

  function buzz(pattern) {
    if (FF.Audio && FF.Audio.effectsEnabled === false) return;
    var touched = !navigator.userActivation || navigator.userActivation.hasBeenActive;
    try { if (touched && navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* not supported */ }
  }

  function rand() { return FF._rand ? FF._rand() : Math.random(); }
  function tierOf(w) { return FF.Words && FF.Words.tier ? FF.Words.tier(w) : 0; }
  function icon(k) { return FF.Icons && FF.Icons.icon ? FF.Icons.icon(k) : FF.ui.span(''); }

  function whenReady(api, go) {
    if (FF.LetterRush && FF.LetterRush.whenReady) { FF.LetterRush.whenReady(api, go); return; }
    if (FF.Words && FF.Words.ready && FF.Words.ready()) { go(); return; }
    FF.GameUI.exitCard(api, t('lrNoWords', 'The word list did not load'));
  }

  function showMeaning(word) {
    if (FF.LetterRush && FF.LetterRush.showMeaning) FF.LetterRush.showMeaning(word);
  }

  /* The challenge as tiles: BR _ _ _, _ IGHT _, _ _ ING, B _ _ T. */
  function challengeCard(ch, big) {
    var card = FF.ui.div('sc-card sc-card--' + ch.kind + (big ? ' sc-card--big' : ''));
    var badge = FF.ui.span('sc-badge sc-badge--' + ch.kind);
    badge.appendChild(icon(ch.kind === 'start' ? 'play' : ch.kind === 'end' ? 'flag' : ch.kind === 'contain' ? 'magnifying-glass' : 'arrows-left-right'));
    badge.appendChild(FF.ui.span('', kindLabel(ch.kind)));
    card.appendChild(badge);
    var row = FF.ui.el('div', { class: 'sc-tiles', role: 'img', 'aria-label': sentence(ch) });
    var k = 0;
    function tiles(s) { up(s).split('').forEach(function (c) { row.appendChild(FF.ui.span('sc-tile sc-tile--' + (k++ % 6), c)); }); }
    function gap(n) { for (var i = 0; i < n; i++) row.appendChild(FF.ui.span('sc-gap')); }
    if (ch.kind === 'start') { tiles(ch.a); gap(3); }
    else if (ch.kind === 'end') { gap(3); tiles(ch.a); }
    else if (ch.kind === 'contain') { gap(2); tiles(ch.a); gap(2); }
    else { tiles(ch.a); gap(2); tiles(ch.b); }
    card.appendChild(row);
    card.appendChild(FF.ui.el('p', { class: 'sc-say' }, sentence(ch)));
    return card;
  }

  function wordChip(w, pts, opts) {
    opts = opts || {};
    var b = FF.ui.el('button', {
      type: 'button',
      class: 'sc-chip' + (opts.fresh ? ' is-new' : '') + (opts.missed ? ' sc-chip--missed' : '') + (opts.rare ? ' sc-chip--rare' : '') + (opts.long ? ' sc-chip--long' : ''),
      'aria-label': opts.missed ? t('scMeaningOf', 'What {w} means', { w: w }) : t('scChipLabel', '{w}, {n} points', { w: w, n: pts })
    });
    if (opts.rare || opts.long) b.appendChild(icon(opts.rare ? 'sparkle' : 'star'));
    b.appendChild(FF.ui.span('sc-chip__word', up(w)));
    if (pts != null) b.appendChild(FF.ui.span('sc-chip__pts', '+' + pts));
    b.addEventListener('click', function () { showMeaning(w); });
    return b;
  }

  /* ================= one round on one phone =================
     o: { ch, n, total, turnEntity, roundText, live, timer (s, 0 = the
     room runs the clock), countIn (bool), onDone(stats) }
     Returns { start, stop } (stop returns the round so far). */
  function playRound(api, o) {
    var ch = o.ch;
    var calm = reduceMotion();
    var root = api.shell.root;
    FF.ui.clear(root);
    api.shell.hideTimer();

    var found = {};       // word -> true
    var words = [];       // accepted, in order
    var tried = {};       // rejected words, counted once each
    var rejected = 0;
    var open = false;
    var ended = false;
    var timers = [];
    var totalSecs = o.timer > 0 ? o.timer : (o.roomSeconds || 60);

    var stage = FF.GameUI.stage({ center: true, className: 'sc' });
    if (o.live) stage.appendChild(o.live);
    stage.appendChild(FF.GameUI.turnBar(o.turnEntity || null, o.roundText || null));

    var hud = FF.ui.div('sc-hud');
    function stat(label, value, cls) {
      var s = FF.ui.span('sc-stat ' + (cls || ''));
      s.appendChild(FF.ui.span('sc-stat__label', label));
      var v = FF.ui.span('sc-stat__value', value);
      s.appendChild(v);
      hud.appendChild(s);
      return { el: s, value: v };
    }
    var scoreStat = stat(t('scScore', 'Score'), '0', 'sc-stat--score');
    var wordsStat = stat(t('scWords', 'Words'), '0');
    stage.appendChild(hud);

    stage.appendChild(challengeCard(ch, true));

    var bar = FF.ui.el('div', { class: 'sc-time', 'aria-hidden': 'true' });
    var fill = FF.ui.div('sc-time__fill');
    bar.appendChild(fill);
    stage.appendChild(bar);

    var form = FF.ui.el('form', { class: 'sc-form', autocomplete: 'off', novalidate: 'novalidate' });
    var input = FF.ui.el('input', {
      type: 'text', class: 'sc-input', id: 'sc-input',
      placeholder: t('scTypeHint', 'Type a word, then Enter'),
      'aria-label': sentence(ch) + '. ' + t('scYourWord', 'Your word'),
      autocomplete: 'off', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false',
      inputmode: 'text', enterkeyhint: 'send', maxlength: 24
    });
    var submit = FF.ui.el('button', { type: 'submit', class: 'btn btn-primary sc-submit', 'aria-label': t('scSubmit', 'Submit word') });
    submit.appendChild(icon('check'));
    submit.appendChild(FF.ui.span('sc-submit__text', t('scAdd', 'Add')));
    form.appendChild(input);
    form.appendChild(submit);
    stage.appendChild(form);

    var say = FF.ui.el('p', { class: 'sc-feedback', role: 'status', 'aria-live': 'polite' }, '');
    stage.appendChild(say);

    var listHead = FF.ui.div('sc-list-head');
    var listCount = FF.ui.span('sc-list-head__count', t('scNoneYet', 'Your words will show here'));
    listHead.appendChild(listCount);
    stage.appendChild(listHead);
    var list = FF.ui.el('div', { class: 'sc-list', role: 'list', 'aria-label': t('scYourWords', 'Your words') });
    stage.appendChild(list);

    var foot = FF.ui.div('sc-foot');
    var doneBtn = FF.UI.button(t('scImDone', 'I’m out of words'), {
      class: 'btn-ghost sc-done', icon: 'check',
      onClick: function () { if (open) { api.audio.play('select'); finish(false); } }
    });
    foot.appendChild(doneBtn);
    stage.appendChild(foot);
    root.appendChild(stage);

    setOpen(false);

    form.addEventListener('submit', function (e) { e.preventDefault(); add(); });
    input.addEventListener('input', function () {
      var w = normalize(input.value);
      form.classList.toggle('is-fit', !!w && /^[a-z]+$/.test(w) && fits(w, ch));
      form.classList.remove('is-bad');
    });

    function alive() { return !!stage.isConnected && !ended; }
    function later(fn, ms) {
      var id = setTimeout(function () {
        timers.splice(timers.indexOf(id), 1);
        if (alive()) fn();
      }, ms);
      timers.push(id);
    }
    function setOpen(on) {
      open = on;
      input.disabled = !on;
      submit.disabled = !on;
      doneBtn.disabled = !on;
    }
    function feedback(kind, text) {
      say.className = 'sc-feedback sc-feedback--' + kind;
      FF.ui.clear(say);
      say.appendChild(icon(kind === 'good' ? 'check' : kind === 'bad' ? 'x' : 'info'));
      say.appendChild(FF.ui.span('', text));
    }
    function bump(el) {
      if (calm) return;
      el.classList.remove('is-bump');
      void el.offsetWidth;
      el.classList.add('is-bump');
    }
    function stats() { return tally(words, rejected, tierOf); }
    function refresh() {
      var s = stats();
      scoreStat.value.textContent = FF.util.formatNumber(s.points);
      wordsStat.value.textContent = String(s.words);
      listCount.textContent = s.words ? t('scNWordsPts', '{n} words · {p} points', { n: s.words, p: FF.util.formatNumber(s.points) }) : t('scNoneYet', 'Your words will show here');
    }
    function onTick(remaining) {
      var f = Math.max(0, Math.min(1, remaining / totalSecs));
      fill.style.transform = 'scaleX(' + f + ')';
      bar.classList.toggle('is-low', remaining <= 10);
    }

    function add() {
      if (!open) return;
      var raw = input.value;
      var res = check(raw, ch, found);
      if (res.reason === 'empty') { feedback('info', t('scTypeFirst', 'Type a word first.')); focus(); return; }
      input.value = '';
      form.classList.remove('is-fit');
      if (!res.ok) {
        var reason = res.reason;
        if (reason !== 'dupe' && tried[res.word]) reason = 'tried';
        else if (reason !== 'dupe') { tried[res.word] = true; rejected++; }
        feedback('bad', (res.word ? up(res.word) + ': ' : '') + reasonText(reason, ch));
        api.audio.play('wrong');
        buzz([20, 40, 20]);
        form.classList.remove('is-bad');
        void form.offsetWidth;
        if (!calm) form.classList.add('is-bad');
        focus();
        return;
      }
      found[res.word] = true;
      words.push(res.word);
      var p = wordPoints(res.word, tierOf(res.word));
      var extra = p.long ? ' · ' + t('scLongWord', 'long word') : p.rare ? ' · ' + t('scRareWord', 'rare find') : '';
      feedback('good', '+' + p.points + ' ' + up(res.word) + extra);
      api.audio.play(p.long || p.rare ? 'streak' : 'correct');
      buzz(12);
      list.insertBefore(wordChip(res.word, p.points, { fresh: !calm, long: p.long, rare: p.rare }), list.firstChild);
      refresh();
      bump(scoreStat.el);
      if (o.onWord) o.onWord(stats());
      focus();
    }
    function focus() {
      if (!open) return;
      try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); }
    }

    function begin() {
      if (!alive()) return;
      setOpen(true);
      stage.classList.add('is-open');
      feedback('info', t('scGo', 'Go! {s}', { s: sentence(ch) }));
      if (o.timer > 0) {
        api.shell.setTimer(o.timer, function () { if (open) finish(true); });
      }
      if (api.shell.setOnTick) api.shell.setOnTick(onTick);
      onTick(totalSecs);
      focus();
    }
    function countIn(k) {
      if (k === 0) { begin(); return; }
      feedback('info', t('scReadyN', 'Read the challenge… {n}', { n: k }));
      api.audio.play('tick');
      later(function () { countIn(k - 1); }, 800);
    }

    function cleanup() {
      ended = true;
      setOpen(false);
      timers.forEach(clearTimeout);
      timers = [];
      if (api.shell.setOnTick) api.shell.setOnTick(null);
    }

    function result(outOfTime) {
      var s = stats();
      s.list = words.slice();
      s.out = !!outOfTime;
      return s;
    }

    function finish(outOfTime) {
      if (ended) return;
      api.shell.hideTimer();
      var res = result(outOfTime);
      cleanup();
      if (o.onDone) o.onDone(res);
    }

    return {
      start: function () { if (o.countIn) countIn(COUNT_IN); else begin(); },
      stop: function () { var res = result(true); cleanup(); return res; }
    };
  }

  /* ================= round summary (local games) ================= */

  function roundSummary(api, o) {
    var root = api.shell.root;
    api.shell.hideTimer();
    FF.ui.clear(root);
    var ch = o.ch, st = o.st;
    var stage = FF.GameUI.stage({ center: true, className: 'sc sc-sum' });
    stage.appendChild(FF.GameUI.turnBar(o.turnEntity || null, o.roundText || null));
    stage.appendChild(FF.GameUI.kicker(st.out ? t('scTimeUp', 'Time’s up!') : t('scRoundOver', 'Round over')));
    stage.appendChild(challengeCard(ch, false));
    var nums = FF.ui.div('sc-nums');
    [[t('scPoints', 'Points'), FF.util.formatNumber(st.points)], [t('scWords', 'Words'), st.words], [t('scAccuracy', 'Accuracy'), st.accuracy + '%']].forEach(function (r) {
      var c = FF.ui.div('sc-num');
      c.appendChild(FF.ui.span('sc-num__value', String(r[1])));
      c.appendChild(FF.ui.span('sc-num__label', r[0]));
      nums.appendChild(c);
    });
    stage.appendChild(nums);

    if (st.list.length) {
      var mine = FF.ui.div('sc-list sc-list--sum');
      st.list.slice().sort(function (a, b) { return b.length - a.length || (a < b ? -1 : 1); }).forEach(function (w) {
        var p = wordPoints(w, tierOf(w));
        mine.appendChild(wordChip(w, p.points, { long: p.long, rare: p.rare }));
      });
      stage.appendChild(mine);
    } else {
      stage.appendChild(FF.GameUI.note(t('scNoWords', 'No words this round. The ideas below might help next time.')));
    }

    // A few everyday words that fit, to learn from.
    var could = answers(ch, 400, 1).filter(function (w) { return !st.list.some(function (m) { return m === w; }); });
    if (could.length) {
      // A spread of lengths, short to long, so there are easy ones to learn too.
      could = could.sort(function (a, b) { return a.length - b.length || (a < b ? -1 : 1); });
      var step = Math.max(1, could.length / 10);
      var pickd = [];
      for (var q = 0; q < 10 && Math.floor(q * step) < could.length; q++) pickd.push(could[Math.floor(q * step)]);
      could = pickd;
      stage.appendChild(FF.ui.el('h3', { class: 'sc-h' }, t('scCouldHave', 'You could also have had')));
      var miss = FF.ui.div('sc-list sc-list--sum');
      could.forEach(function (w) { miss.appendChild(wordChip(w, null, { missed: true })); });
      stage.appendChild(miss);
      stage.appendChild(FF.GameUI.note(t('scTapMeaning', 'Tap any word to see what it means.')));
    }
    stage.appendChild(FF.GameUI.action(o.nextLabel || t('next', 'Next'), function () {
      api.audio.play('select');
      o.onNext();
    }, { icon: 'arrow-right' }));
    root.appendChild(stage);
    if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(stage);
  }

  /* ================= personal bests ================= */

  var BEST_KEY = 'stacoend:best';
  function bests() { return (FF.Storage && FF.Storage.get(BEST_KEY, {})) || {}; }
  function bestFor(id, cfg) { return bests()[id + '|' + key(cfg)] || null; }
  function saveBest(id, cfg, st) {
    var all = bests();
    var k = id + '|' + key(cfg);
    var old = all[k];
    if (old && old.points >= st.points) return;
    all[k] = { points: st.points, words: st.words };
    try { FF.Storage.set(BEST_KEY, all); } catch (e) { /* storage full */ }
  }

  /* ================= setup, pass and results screens ================= */

  function setupScreen(api, onGo) {
    var root = api.shell.root;
    api.shell.hideTimer();
    FF.ui.clear(root);
    var saved = (FF.Storage && FF.Storage.get('stacoend:setup', null)) || null;
    var gs = sanitize(Object.assign({}, defaults(api.config.difficulty), saved || {}));
    var stage = FF.GameUI.stage({ center: true, className: 'sc sq-setup' });
    stage.appendChild(FF.GameUI.kicker(t('scName', 'Stacoend')));
    stage.appendChild(FF.GameUI.prompt(t('scSetupTitle', 'Start, contain or end?'), 'md'));

    var demo = FF.ui.div('sc-demo');
    [{ kind: 'start', a: 'br' }, { kind: 'contain', a: 'ight' }, { kind: 'end', a: 'ing' }].forEach(function (ch) {
      var d = FF.ui.div('sc-demo__item sc-demo__item--' + ch.kind);
      d.appendChild(FF.ui.span('sc-demo__kind', kindLabel(ch.kind)));
      d.appendChild(FF.ui.span('sc-demo__frag', shortText(ch)));
      d.appendChild(FF.ui.span('sc-demo__eg', { start: 'bread, bridge', contain: 'light, night', end: 'singing, playing' }[ch.kind]));
      demo.appendChild(d);
    });
    stage.appendChild(demo);

    var box = FF.ui.el('section', { class: 'settings-section nr-setup__rows' });
    var note = FF.ui.el('p', { class: 'gm-note nr-setup__note', 'aria-live': 'polite' });
    function render() {
      FF.ui.clear(box);
      fields().forEach(function (f) {
        box.appendChild(FF.UI.settingRow(f.label, FF.UI.segmented({
          label: f.label, value: gs[f.key], options: f.options,
          onChange: function (v) { gs[f.key] = v; renote(); }
        })));
      });
      var rules = FF.ui.el('ul', { class: 'sc-rules' });
      scoringLines().forEach(function (line) { rules.appendChild(FF.ui.el('li', null, line)); });
      box.appendChild(rules);
      renote();
    }
    function renote() {
      var ranked = FF.Leaderboards && FF.Leaderboards.active && FF.Leaderboards.active(api.def);
      note.textContent = summary(gs) + (ranked && !isStandard(gs) ? ' · ' + t('nrUnranked', 'Leaderboards use the standard settings') : '');
    }
    render();
    stage.appendChild(box);
    stage.appendChild(note);
    var row = FF.ui.div('nr-setup__actions');
    row.appendChild(FF.UI.button(t('nrStandard', 'Standard settings'), {
      class: 'btn-lg btn-ghost', icon: 'restart',
      onClick: function () { api.audio.play('click'); gs = sanitize(STANDARD); render(); }
    }));
    row.appendChild(FF.GameUI.action(t('rsStart', 'Start'), function () {
      api.audio.play('select');
      var cfg = sanitize(gs);
      try { if (FF.Storage) FF.Storage.set('stacoend:setup', cfg); } catch (e) { /* storage full */ }
      onGo(cfg);
    }, { icon: 'play' }));
    stage.appendChild(row);
    root.appendChild(stage);
    if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(stage);
  }

  function passScreen(api, who, roundText, onReady) {
    var root = api.shell.root;
    api.shell.hideTimer();
    FF.ui.clear(root);
    var stage = FF.GameUI.stage({ center: true, className: 'sc nr-pass' });
    stage.appendChild(FF.GameUI.turnBar(who, roundText));
    var ava = FF.ui.div('nr-pass__ava');
    ava.appendChild(FF.Players.avatarEl(who, 'nr-pass__img'));
    stage.appendChild(ava);
    stage.appendChild(FF.GameUI.prompt(t('nrPassTo', 'Pass to {name}', { name: who.name }), 'md'));
    stage.appendChild(FF.GameUI.sub(t('scPassSub', 'Same challenges for everyone. No peeking at other players’ words!')));
    stage.appendChild(FF.GameUI.action(t('nrReady', 'I’m ready'), function () { api.audio.play('select'); onReady(); }, { icon: 'play' }));
    root.appendChild(stage);
    if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(stage);
  }

  function stillShown(api) { return !!(api.shell.root && (!document.body || !document.body.contains || document.body.contains(api.shell.root))); }

  /* Add up a player's rounds into one game total. */
  function gameTotals(rounds) {
    var out = { points: 0, words: 0, rejected: 0, rare: 0, longest: '', best: '', bestPts: 0 };
    rounds.forEach(function (r) {
      out.points += r.points;
      out.words += r.words;
      out.rejected += r.rejected;
      out.rare += r.rare;
      if (r.longest.length > out.longest.length) out.longest = r.longest;
      var bp = r.best ? wordPoints(r.best, tierOf(r.best)).points : 0;
      if (bp > out.bestPts) { out.best = r.best; out.bestPts = bp; }
    });
    var tries = out.words + out.rejected;
    out.accuracy = tries ? Math.round((out.words / tries) * 100) : 0;
    return out;
  }

  function playLocal(api, cfg) {
    var list = (api.config.scorers || []).slice();
    if (!list.length) list = [{ id: 'me', name: t('you', 'You') }];
    var multi = list.length > 1;
    var plan = deal(cfg, rand);    // one deal: everyone in pass and play gets the same challenges
    var runs = [];
    var p = 0;
    function nextPlayer() {
      if (!stillShown(api)) return;
      if (p >= list.length) { results(api, cfg, plan, runs); return; }
      var who = list[p];
      var rt = multi ? t('nrPlayerOf', 'Player {n} of {total}', { n: p + 1, total: list.length }) : null;
      if (multi) passScreen(api, who, rt, function () { go(who); });
      else go(who);
    }
    function go(who) {
      var rounds = [];
      api.shell.updateScores(who.id);
      function round(n) {
        if (!stillShown(api)) return;
        if (n >= plan.length) {
          var tot = gameTotals(rounds);
          runs.push({ who: who, st: tot, rounds: rounds });
          p++;
          nextPlayer();
          return;
        }
        var rt = t('scRoundOf', 'Round {n} of {total}', { n: n + 1, total: plan.length });
        var h = playRound(api, {
          ch: plan[n], turnEntity: multi ? who : null, roundText: rt,
          timer: cfg.seconds, countIn: true,
          onDone: function (st) {
            rounds.push(st);
            api.scoring.add(who.id, st.points, { correct: st.words > 0 });
            api.shell.updateScores(who.id);
            var last = n + 1 >= plan.length;
            roundSummary(api, {
              ch: plan[n], st: st, turnEntity: multi ? who : null, roundText: rt,
              nextLabel: !last ? t('scNextRound', 'Next round') : multi && p + 1 < list.length ? t('bkNextPlayer', 'Next player') : t('seeResults', 'See results'),
              onNext: function () { round(n + 1); }
            });
          }
        });
        h.start();
      }
      round(0);
    }
    nextPlayer();
  }

  function rankRuns(runs) {
    var sorted = runs.slice().sort(function (a, b) { return b.st.points - a.st.points || b.st.words - a.st.words; });
    var place = 0, prev = null;
    sorted.forEach(function (r, i) {
      if (!prev || prev.st.points !== r.st.points || prev.st.words !== r.st.words) place = i + 1;
      r.place = place;
      prev = r;
    });
    return sorted;
  }

  function cell(label, value) {
    var c = FF.ui.span('nr-cell');
    c.appendChild(FF.ui.span('nr-cell__label', label));
    c.appendChild(FF.ui.span('nr-cell__value', String(value)));
    return c;
  }

  function results(api, cfg, plan, runs) {
    var root = api.shell.root;
    api.shell.hideTimer();
    FF.ui.clear(root);
    var ranked = rankRuns(runs);
    var top = ranked[0];
    var tie = ranked.length > 1 && ranked[1].place === 1;
    var solo = ranked.length === 1;
    var newBest = {};
    ranked.forEach(function (r) {
      var had = bestFor(r.who.id, cfg);
      if (!had || r.st.points > had.points) { newBest[r.who.id] = !!had; saveBest(r.who.id, cfg, r.st); }
    });
    var stage = FF.GameUI.stage({ center: true, className: 'sc nr-results' });
    var title;
    if (solo) title = top.st.words ? t('scSoloN', '{n} words found', { n: top.st.words }) : t('scSoloNone', 'No words this time');
    else if (tie) title = t('nrTie', 'It’s a tie!');
    else title = t('nrWins', '{name} wins!', { name: top.who.name });
    stage.appendChild(FF.GameUI.kicker(summary(cfg)));
    stage.appendChild(FF.GameUI.prompt(title, 'xl'));
    if (solo) {
      stage.appendChild(FF.ui.div('nr-results__score', FF.util.formatNumber(top.st.points)));
      if (newBest[top.who.id] === true) stage.appendChild(FF.GameUI.feedback('good', t('nrNewBest', 'New personal best!')));
      else {
        var b = bestFor(top.who.id, cfg);
        if (b && b.points > top.st.points) stage.appendChild(FF.GameUI.note(t('nrYourBest', 'Your best on these settings: {n}', { n: FF.util.formatNumber(b.points) })));
      }
      var nums = FF.ui.div('sc-nums');
      [[t('scWords', 'Words'), top.st.words], [t('scAccuracy', 'Accuracy'), top.st.accuracy + '%'], [t('scRejected', 'Rejected'), top.st.rejected],
        [t('scLongest', 'Longest'), top.st.longest ? up(top.st.longest) : '–'], [t('scRare', 'Rare finds'), top.st.rare]].forEach(function (r) {
        var c = FF.ui.div('sc-num');
        c.appendChild(FF.ui.span('sc-num__value', String(r[1])));
        c.appendChild(FF.ui.span('sc-num__label', r[0]));
        nums.appendChild(c);
      });
      stage.appendChild(nums);
      // Round by round: the challenge and what it earned.
      var rl = FF.ui.el('ol', { class: 'sc-rounds' });
      plan.forEach(function (ch, i) {
        var r = top.rounds[i];
        if (!r) return;
        var li = FF.ui.el('li', { class: 'sc-round' });
        li.appendChild(FF.ui.span('sc-badge sc-badge--' + ch.kind, shortText(ch)));
        li.appendChild(FF.ui.span('sc-round__words', t('scNWords', '{n} words', { n: r.words })));
        li.appendChild(FF.ui.span('sc-round__pts', FF.util.formatNumber(r.points)));
        rl.appendChild(li);
      });
      stage.appendChild(rl);
    } else {
      var table = FF.ui.el('ol', { class: 'nr-table' });
      ranked.forEach(function (r) {
        var li = FF.ui.el('li', { class: 'nr-row' + (r.place === 1 ? ' is-winner' : '') });
        li.appendChild(FF.ui.span('nr-row__rank', String(r.place)));
        li.appendChild(FF.Players.avatarEl(r.who, 'nr-row__ava'));
        var who = FF.ui.span('nr-row__who');
        who.appendChild(FF.ui.span('nr-row__name', r.who.name));
        who.appendChild(FF.ui.span('nr-row__status', t('scNWords', '{n} words', { n: r.st.words }) +
          (newBest[r.who.id] === true ? ' · ' + t('nrBestShort', 'personal best') : '')));
        li.appendChild(who);
        li.appendChild(FF.ui.span('nr-row__pts', FF.util.formatNumber(r.st.points)));
        var cells = FF.ui.span('nr-row__nums');
        cells.appendChild(cell(t('scAccuracy', 'Accuracy'), r.st.accuracy + '%'));
        if (r.st.longest) cells.appendChild(cell(t('scLongest', 'Longest'), up(r.st.longest)));
        li.appendChild(cells);
        table.appendChild(li);
      });
      stage.appendChild(table);
    }
    stage.appendChild(FF.GameUI.action(t('seeResults', 'See results'), function () {
      api.audio.play('select');
      api.end({
        results: ranked.map(function (r) {
          return { id: r.who.id, name: r.who.name, avatar: r.who.avatar, color: r.who.color, photo: r.who.photo, points: r.st.points, correct: r.st.words };
        }),
        winnerId: tie ? null : top.who.id
      });
    }, { icon: 'trophy' }));
    root.appendChild(stage);
    if (!solo || top.st.words) {
      if (!reduceMotion() && FF.Confetti && (!FF.Settings || FF.Settings.get('animations') !== false) && (newBest[top.who.id] === true || !solo)) FF.Confetti.rain(60);
    }
    if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(stage);
  }

  /* ================= online room ================= */

  function roomSettings() {
    var r = FF.Room && FF.Room.current();
    return (r && r.meta && r.meta.settings) || {};
  }

  function playOnline(api) {
    var cfg = sanitize(roomSettings());
    FF.Parallel.run(api, {
      rounds: ROOM_ROUNDS,
      seconds: roomSeconds(cfg),
      gate: '.sc-input, .sc-submit, .sc-done',
      play: function (n, ctx) {
        // Drawn from the round seed alone (no memory of earlier rounds), so
        // every phone, even one that rejoined, gets the same challenge.
        var ch = challenge(kindFor(cfg, n), cfg.level, rand);
        var h = playRound(api, {
          ch: ch, live: ctx.live, roundText: ctx.roundText, timer: 0, roomSeconds: cfg.seconds, countIn: false,
          onDone: function (st) { ctx.done(roomResult(st)); }
        });
        return {
          start: h.start,
          stop: function () { return roomResult(h.stop()); }
        };
      },
      describe: function (n) {
        return { kind: 'card', text: t('scRoomWatch', 'Everyone gets the same letters: {s}', { s: summary(Object.assign({}, cfg, { rounds: ROOM_ROUNDS })) }) };
      },
      detail: function (a) {
        return t('scNWords', '{n} words', { n: a.words || 0 }) + (a.longest ? ' · ' + up(a.longest) : '');
      }
    });
  }

  function roomResult(st) {
    return { value: st.points, words: st.words, rejected: st.rejected, longest: st.longest };
  }

  /* ================= registration ================= */

  var ROOM = {
    defaults: { mode: STANDARD.mode, level: STANDARD.level, seconds: STANDARD.seconds },
    fields: function () { return fields({ room: true }); },
    sanitize: function (s) { var c = sanitize(s); c.rounds = ROOM_ROUNDS; return c; },
    summary: function (s) { return summary(Object.assign({}, sanitize(s), { rounds: ROOM_ROUNDS })); }
  };

  FF.Stacoend = {
    MODES: MODES, LEVELS: LEVELS, ROUNDS: ROUNDS, SECONDS: SECONDS, KINDS: KINDS, FRAGMENTS: FRAGMENTS,
    SCORING: SCORING, ENOUGH: ENOUGH, ENOUGH_BOTH: ENOUGH_BOTH, STANDARD: STANDARD, ROOM_ROUNDS: ROOM_ROUNDS,
    defaults: defaults, sanitize: sanitize, isStandard: isStandard, key: key,
    fits: fits, normalize: normalize, check: check, wordPoints: wordPoints, tally: tally, gameTotals: gameTotals,
    challenge: challenge, kindFor: kindFor, deal: deal, answers: answers, playable: playable,
    sentence: sentence, shortText: shortText, summary: summary, fields: fields, reasonText: reasonText,
    roomSeconds: roomSeconds, ROOM: ROOM
  };

  FF.registerGame({
    id: 'stacoend',
    name: 'Stacoend',
    description: 'Start, Contain, End: race the clock to type real words that start with, contain or end with the letters shown.',
    category: 'words',
    icon: '🔡',
    players: [1, 8],
    difficulty: 'Normal',
    duration: 4,
    tags: ['spelling', 'quick', 'vocabulary'],
    modes: ['solo', 'turn'],
    defaultMode: 'solo',
    howToPlay: [
      'Each round shows letters and a rule: START (words that begin with them), CONTAIN (anywhere inside) or END (words that finish with them).',
      'Mixed plays all three, plus rounds like “starts with B and ends with T”.',
      'Type a word and press Enter. Only real English words that fit count, and each word only once.',
      '10 points a word, +5 for each letter past 3, +15 for 8 letters or more, +10 for a rare word.',
      'Find as many as you can before the clock runs out. Play alone, pass the phone, or race friends online.'
    ],
    room: ROOM,
    start: function (api) {
      whenReady(api, function () {
        if (FF.Parallel && FF.Parallel.active()) { playOnline(api); return; }
        // The daily challenge and a friend's challenge play the standard rules on the shared deal.
        if (api.config.daily || api.config.challenge) { playLocal(api, sanitize(STANDARD)); return; }
        setupScreen(api, function (cfg) {
          if (!isStandard(cfg)) api.config.customRules = true;
          playLocal(api, cfg);
        });
      });
    }
  });
})();
