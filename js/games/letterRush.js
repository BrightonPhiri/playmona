/* ============================================================
   PLAYMONA — letterRush.js
   Letter Rush: make as many words as you can from one set of
   letters before the clock runs out. Every set hides a "rush
   word" that uses all the letters.

   Words come from FF.Words (js/words.js), which loads the full
   word bank on demand. Tap the tiles or type on a keyboard.
   Classic script (no modules), offline, ES2017-or-older.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  // Letters dealt, which words count as "to find", shortest word allowed,
  // and how many words a set should hide (so turns are equally fair).
  var LEVELS = {
    easy: { length: 6, keyTier: 1, maxTier: 1, min: 3, minWords: 8, maxWords: 24 },
    normal: { length: 7, keyTier: 1, maxTier: 2, min: 3, minWords: 16, maxWords: 42 },
    hard: { length: 8, keyTier: 2, maxTier: 2, min: 4, minWords: 16, maxWords: 45 }
  };
  // Seconds per turn by game length. A longer Time limit setting wins.
  var CLOCK = { quick: 60, short: 75, normal: 90, long: 120 };
  // Share of the set's points needed for each rank.
  var RANKS = [
    { at: 0, key: 'lrRank0', name: 'Warming up' },
    { at: 0.06, key: 'lrRank1', name: 'Good start' },
    { at: 0.14, key: 'lrRank2', name: 'Nice' },
    { at: 0.25, key: 'lrRank3', name: 'Great' },
    { at: 0.4, key: 'lrRank4', name: 'Amazing' },
    { at: 0.6, key: 'lrRank5', name: 'Word wizard' }
  ];
  var HINTS = 3;
  var MISSED_SHOWN = 18;

  var t = function (key, fallback, vars) { return FF.t(key, fallback, vars); };

  function icon(key) { return FF.Icons.icon(key); }

  function level(api) { return LEVELS[api.config.difficulty] || LEVELS.normal; }

  function roundSeconds(api) {
    var timer = api.config.timer;
    if (timer === 0) return 0;
    return Math.max(timer || 0, CLOCK[api.config.length] || CLOCK.normal);
  }

  // One point per letter; the rush word scores double.
  function points(word, rackSize) {
    return word.length + (word.length === rackSize ? rackSize : 0);
  }

  // The rules other code needs to deal and score a set the same way the game does
  // (the Players Engine's Letter Rush brain). Read-only use; the game is unchanged.
  FF.LetterRush = {
    LEVELS: LEVELS,
    points: points,
    roundSeconds: function (config) { return roundSeconds({ config: config || {} }); },
    deal: function (difficulty) { return deal({ config: { difficulty: difficulty } }); }
  };

  function entities(api) {
    if (api.config.scorers && api.config.scorers.length) return api.config.scorers.slice();
    if (api.config.players && api.config.players.length) return api.config.players.slice();
    return [];
  }

  function rankFor(fraction) {
    var r = 0;
    for (var i = 0; i < RANKS.length; i++) if (fraction >= RANKS[i].at) r = i;
    return { index: r, name: t(RANKS[r].key, RANKS[r].name), next: RANKS[r + 1] || null };
  }

  function upper(w) { return String(w).toUpperCase(); }

  function bestWord(words) {
    var best = '';
    (words || []).forEach(function (w) { if (w.length > best.length) best = w; });
    return best;
  }

  /* A new set of letters plus everything worth knowing about it. */
  function deal(api) {
    var lv = level(api);
    var rack = FF.Words.rack({
      length: lv.length, keyTier: lv.keyTier, maxTier: lv.maxTier,
      min: lv.min, minWords: lv.minWords, maxWords: lv.maxWords
    });
    if (!rack) return null;
    var size = rack.letters.length;
    var target = {};
    var total = 0;
    rack.words.forEach(function (w) { target[w] = true; total += points(w, size); });
    rack.target = target;
    rack.total = total;
    rack.min = lv.min;
    return rack;
  }

  /* ---------- Shared pieces ---------- */

  function stillShown(api) {
    return !!(api.shell.root && document.body.contains(api.shell.root));
  }

  // Wait for the word bank (first time only), with a friendly screen.
  function whenReady(api, go) {
    if (FF.Words && FF.Words.ready()) { go(); return; }
    var root = api.shell.root;
    FF.ui.clear(root);
    api.shell.hideTimer();
    var stage = FF.GameUI.stage({ center: true, className: 'lr-loading' });
    var dots = FF.ui.div('lr-loading__tiles');
    'WORDS'.split('').forEach(function (ch, i) {
      var tile = FF.ui.span('lr-loading__tile', ch);
      tile.style.animationDelay = (i * 90) + 'ms';
      dots.appendChild(tile);
    });
    stage.appendChild(dots);
    stage.appendChild(FF.GameUI.sub(t('lrLoading', 'Getting 100,000 words ready…')));
    root.appendChild(stage);
    var load = (FF.Words && FF.Words.load) ? FF.Words.load() : Promise.resolve(false);
    load.then(function (ok) {
      if (!stillShown(api)) return;
      if (ok) go();
      else FF.GameUI.exitCard(api, t('lrNoWords', 'The word list did not load'), t('lrNoWordsText', 'Check your connection, then try again. Once it has loaded, it works offline.'));
    });
  }

  // What a word means, in a sheet. Online only; says so kindly when offline.
  function showMeaning(word) {
    FF.Audio.play('click');
    var body = FF.ui.div('lr-meaning');
    var status = FF.ui.el('p', { class: 'lr-meaning__status' }, t('lrLooking', 'Looking it up…'));
    body.appendChild(status);
    FF.UI.sheet({ title: upper(word), body: body });
    FF.Words.define(word).then(function (m) {
      FF.ui.clear(body);
      if (!m) {
        body.appendChild(FF.ui.el('p', { class: 'lr-meaning__status' }, t('lrNoMeaning', 'No meaning found. You may be offline, or the dictionary does not have this word yet.')));
        return;
      }
      if (m.phonetic) body.appendChild(FF.ui.el('p', { class: 'lr-meaning__phon' }, m.phonetic));
      m.senses.forEach(function (s) {
        var row = FF.ui.div('lr-meaning__sense');
        if (s.pos) row.appendChild(FF.ui.span('lr-meaning__pos', s.pos));
        row.appendChild(FF.ui.el('p', { class: 'lr-meaning__text' }, s.text));
        if (s.example) row.appendChild(FF.ui.el('p', { class: 'lr-meaning__eg' }, '“' + s.example + '”'));
        body.appendChild(row);
      });
      body.appendChild(FF.ui.el('p', { class: 'lr-meaning__credit' }, t('lrCredit', 'From the Free Dictionary API (Wiktionary).')));
    });
  }

  /* One word as a tappable chip. kind: 'rush' | 'bonus' | 'missed' | 'new' */
  function wordChip(word, kind) {
    var b = FF.ui.el('button', { type: 'button', class: 'lr-chip' + (kind ? ' lr-chip--' + kind.split(' ').join(' lr-chip--') : '') });
    if (kind && kind.indexOf('rush') !== -1) b.appendChild(icon('lightning'));
    if (kind && kind.indexOf('bonus') !== -1) b.appendChild(icon('star-fill'));
    b.appendChild(FF.ui.span('', upper(word)));
    if (kind && kind.indexOf('rush') !== -1) b.appendChild(FF.ui.span('sr-only', t('lrRushWord', 'Rush word')));
    if (kind && kind.indexOf('bonus') !== -1) b.appendChild(FF.ui.span('sr-only', t('lrBonusWord', 'Bonus word')));
    b.setAttribute('title', t('lrSeeMeaning', 'See what it means'));
    b.addEventListener('click', function () { showMeaning(word); });
    b.dataset.word = word;
    return b;
  }

  function kindOf(word, rack) {
    if (word.length === rack.letters.length) return 'rush';
    return rack.target[word] ? '' : 'bonus';
  }

  /* Words grouped by length, longest first. counts: show "n of m" per group. */
  function groupedWords(words, rack, opts) {
    opts = opts || {};
    var box = FF.ui.div('lr-groups');
    var byLen = {};
    words.forEach(function (w) { (byLen[w.length] = byLen[w.length] || []).push(w); });
    var lens = Object.keys(byLen).map(Number).sort(function (a, b) { return b - a; });
    lens.forEach(function (len) {
      var g = FF.ui.div('lr-group');
      var head = FF.ui.div('lr-group__head', t('lrLetters', '{n} letters', { n: len }));
      if (opts.counts) {
        var of = rack.words.filter(function (w) { return w.length === len; }).length;
        if (of) head.appendChild(FF.ui.span('lr-group__count', t('lrOf', '{a} of {b}', { a: byLen[len].filter(function (w) { return rack.target[w]; }).length, b: of })));
      }
      g.appendChild(head);
      var chips = FF.ui.div('lr-group__chips');
      byLen[len].slice().sort().forEach(function (w) {
        var kind = opts.kind || kindOf(w, rack);
        if (opts.fresh === w) kind = (kind ? kind + ' ' : '') + 'new';
        chips.appendChild(wordChip(w, kind));
      });
      g.appendChild(chips);
      box.appendChild(g);
    });
    return box;
  }

  // The answers worth showing after a turn: everyday words first, then longest.
  function missedWords(rack, found) {
    var have = {};
    found.forEach(function (w) { have[w] = true; });
    return rack.words.filter(function (w) { return !have[w]; })
      .sort(function (a, b) { return (FF.Words.tier(a) - FF.Words.tier(b)) || (b.length - a.length); })
      .slice(0, MISSED_SHOWN);
  }

  /* ---------- One turn ----------
     opts: { entity, rack, label, racing, onDone({ words, score }) } */
  function playTurn(api, opts) {
    var rack = opts.rack;
    var entity = opts.entity;
    var size = rack.letters.length;
    var seconds = roundSeconds(api);
    var animate = api.config.animations !== false;
    var root = api.shell.root;

    var tiles = rack.letters.map(function (ch, i) { return { ch: ch, id: i, el: null, used: false }; });
    var picked = [];
    var found = [];
    var foundSet = {};
    var score = 0;
    var hints = HINTS;
    var over = false;
    var open = !opts.racing;
    var flashing = null;   // timeout while the last word shows its result

    FF.ui.clear(root);
    api.shell.hideTimer();
    api.shell.setTitle(api.def.name);

    var stage = FF.GameUI.stage({ wide: true, className: 'lr' });
    stage.appendChild(FF.GameUI.turnBar(entity, opts.label));

    // ---- Score, words and rank ----
    var hud = FF.ui.div('lr-hud');
    var scoreNum = FF.ui.span('lr-stat__num', '0');
    var wordsNum = FF.ui.span('lr-stat__num', '0');
    function stat(numEl, label, extra) {
      var s = FF.ui.div('lr-stat');
      var val = FF.ui.span('lr-stat__val');
      val.appendChild(numEl);
      if (extra) val.appendChild(extra);
      s.appendChild(val);
      s.appendChild(FF.ui.span('lr-stat__label', label));
      return s;
    }
    hud.appendChild(stat(scoreNum, t('lrPoints', 'Points')));
    hud.appendChild(stat(wordsNum, t('lrWords', 'Words'), FF.ui.span('lr-stat__of', '/' + rack.words.length)));
    var rankBox = FF.ui.div('lr-rank');
    var rankName = FF.ui.div('lr-rank__name', '');
    var rankTrack = FF.ui.el('div', { class: 'lr-rank__track', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(RANKS.length - 1), 'aria-label': t('lrRank', 'Rank') });
    var rankFill = FF.ui.div('lr-rank__fill');
    rankTrack.appendChild(rankFill);
    var pips = RANKS.map(function (r, i) {
      var pip = FF.ui.span('lr-rank__pip');
      pip.style.left = (i / (RANKS.length - 1) * 100) + '%';
      rankTrack.appendChild(pip);
      return pip;
    });
    rankBox.appendChild(rankName);
    rankBox.appendChild(rankTrack);
    hud.appendChild(rankBox);
    stage.appendChild(hud);

    // ---- The board: time, the word being built, message, tiles, controls ----
    var board = FF.ui.div('lr-board');
    var meter = null;
    if (seconds) {
      meter = FF.GameUI.meter(1);
      meter.classList.add('lr-time');
      meter.setAttribute('aria-label', t('timeLeft', 'Time left'));
      board.appendChild(meter);
    }
    var wordEl = FF.ui.el('div', { class: 'lr-word', 'aria-label': t('lrYourWord', 'Your word') });
    board.appendChild(wordEl);
    var msg = FF.ui.el('div', { class: 'lr-msg', role: 'status', 'aria-live': 'polite' });
    board.appendChild(msg);
    var rackEl = FF.ui.el('div', { class: 'lr-rack', role: 'group', 'aria-label': t('lrLettersLabel', 'Letters') });
    // One row whatever the number of letters: tiles share the width.
    rackEl.style.setProperty('--n', String(size));
    wordEl.style.setProperty('--n', String(size));
    board.appendChild(rackEl);

    var controls = FF.ui.div('lr-controls');
    var shuffleBtn = ctrl('shuffle', t('lrShuffle', 'Shuffle'), shuffle);
    var deleteBtn = ctrl('backspace', t('lrDelete', 'Delete'), removeLast);
    var enterBtn = FF.ui.el('button', { type: 'button', class: 'lr-ctrl lr-ctrl--enter' });
    enterBtn.appendChild(icon('check'));
    enterBtn.appendChild(FF.ui.span('', t('lrEnter', 'Enter')));
    enterBtn.addEventListener('click', submit);
    controls.appendChild(shuffleBtn);
    controls.appendChild(deleteBtn);
    controls.appendChild(enterBtn);
    board.appendChild(controls);
    stage.appendChild(board);

    // ---- Words found ----
    var foundBox = FF.ui.div('lr-found');
    stage.appendChild(foundBox);

    // ---- Footer ----
    var foot = FF.ui.div('lr-foot');
    var hintBtn = FF.ui.el('button', { type: 'button', class: 'btn lr-hint' });
    hintBtn.addEventListener('click', hint);
    foot.appendChild(hintBtn);
    foot.appendChild(FF.UI.button(opts.racing ? t('lrImDone', 'I’m done') : t('lrFinishTurn', 'Finish turn'), { icon: 'chevron-right', class: 'btn lr-done', onClick: function () { finish(); } }));
    stage.appendChild(foot);
    stage.appendChild(FF.ui.el('p', { class: 'lr-keys' }, t('lrKeys', 'Keyboard: type letters · Enter to submit · Backspace to delete · Space to shuffle')));
    if (!seconds) stage.appendChild(FF.GameUI.note(t('lrNoClock', 'No clock this time. Press Finish turn when you are done.')));
    root.appendChild(stage);

    function ctrl(iconKey, label, fn) {
      var b = FF.ui.el('button', { type: 'button', class: 'lr-ctrl', 'aria-label': label, title: label });
      b.appendChild(icon(iconKey));
      b.appendChild(FF.ui.span('lr-ctrl__label', label));
      b.addEventListener('click', fn);
      return b;
    }

    /* ---- Rendering ---- */

    function renderRack() {
      FF.ui.clear(rackEl);
      tiles.forEach(function (tile) {
        if (!tile.el) {
          tile.el = FF.ui.el('button', { type: 'button', class: 'lr-tile', 'aria-label': upper(tile.ch) }, upper(tile.ch));
          tile.el.addEventListener('click', function () { pick(tile); });
        }
        tile.el.classList.toggle('is-used', tile.used);
        tile.el.disabled = tile.used || !open;
        rackEl.appendChild(tile.el);
      });
    }

    function renderWord(state) {
      FF.ui.clear(wordEl);
      wordEl.className = 'lr-word' + (state ? ' lr-word--' + state : '');
      if (!picked.length) {
        wordEl.appendChild(FF.ui.span('lr-word__hint', open ? t('lrTapLetters', 'Tap letters to make a word') : ''));
        return;
      }
      picked.forEach(function (tile, i) {
        var ch = FF.ui.el('button', { type: 'button', class: 'lr-word__ch', 'aria-label': t('lrRemove', 'Remove {l}', { l: upper(tile.ch) }) }, upper(tile.ch));
        ch.addEventListener('click', function () { unpickAt(i); });
        wordEl.appendChild(ch);
      });
    }

    function renderHud() {
      scoreNum.textContent = FF.util.formatNumber(score);
      wordsNum.textContent = String(found.filter(function (w) { return rack.target[w]; }).length);
      var r = rankFor(rack.total ? score / rack.total : 0);
      rankName.textContent = r.name;
      rankTrack.setAttribute('aria-valuenow', String(r.index));
      rankTrack.setAttribute('aria-valuetext', r.name);
      // Fill runs smoothly between the pips.
      var lo = RANKS[r.index].at;
      var hi = r.next ? r.next.at : 1;
      var frac = rack.total ? Math.min(1, score / rack.total) : 0;
      var within = r.next ? Math.max(0, Math.min(1, (frac - lo) / (hi - lo))) : 1;
      rankFill.style.width = ((r.index + within) / (RANKS.length - 1) * 100) + '%';
      pips.forEach(function (pip, i) { pip.classList.toggle('is-on', i <= r.index); });
      return r;
    }

    function renderFound(fresh) {
      FF.ui.clear(foundBox);
      var head = FF.ui.div('lr-found__head');
      head.appendChild(FF.ui.el('h3', { class: 'lr-found__title' }, t('lrFound', 'Words found')));
      foundBox.appendChild(head);
      if (!found.length) {
        foundBox.appendChild(FF.ui.el('p', { class: 'lr-found__empty' }, t('lrFoundEmpty', 'Every set hides a rush word that uses all {n} letters. Can you find it?', { n: size })));
        return;
      }
      foundBox.appendChild(groupedWords(found, rack, { counts: true, fresh: fresh }));
    }

    function renderHint() {
      FF.ui.clear(hintBtn);
      hintBtn.appendChild(icon('lightbulb'));
      hintBtn.appendChild(FF.ui.span('', t('lrHint', 'Hint ({n})', { n: hints })));
      hintBtn.disabled = !hints || !open;
    }

    function say(kind, text) {
      FF.ui.clear(msg);
      msg.className = 'lr-msg' + (kind ? ' lr-msg--' + kind : '');
      if (!text) return;
      if (kind === 'good' || kind === 'rush') msg.appendChild(icon(kind === 'rush' ? 'lightning' : 'check-circle'));
      else if (kind === 'bad') msg.appendChild(icon('x-circle'));
      else if (kind === 'tip') msg.appendChild(icon('lightbulb'));
      msg.appendChild(FF.ui.span('', text));
    }

    /* ---- Actions ---- */

    function settleFlash() {
      if (!flashing) return;
      clearTimeout(flashing);
      flashing = null;
      clearPicked();
    }

    function pick(tile) {
      if (over || !open || tile.used) return;
      settleFlash();
      tile.used = true;
      picked.push(tile);
      api.audio.play('tap');
      renderRack();
      renderWord();
    }

    function unpickAt(i) {
      if (over || !open) return;
      settleFlash();
      var tile = picked.splice(i, 1)[0];
      if (tile) tile.used = false;
      renderRack();
      renderWord();
    }

    function removeLast() {
      if (!picked.length) return;
      unpickAt(picked.length - 1);
    }

    function clearPicked() {
      picked.forEach(function (tile) { tile.used = false; });
      picked = [];
      renderRack();
      renderWord();
    }

    function shuffle() {
      if (over || !open) return;
      // Keep shuffling until the order really changes.
      var before = tiles.map(function (x) { return x.id; }).join(',');
      for (var n = 0; n < 6; n++) {
        tiles = FF.util.shuffle(tiles);
        if (tiles.map(function (x) { return x.id; }).join(',') !== before) break;
      }
      api.audio.play('flip');
      renderRack();
      if (animate) {
        rackEl.classList.remove('is-shuffled');
        void rackEl.offsetWidth;
        rackEl.classList.add('is-shuffled');
      }
    }

    function flash(state, after) {
      renderWord(state);
      flashing = setTimeout(function () { flashing = null; clearPicked(); if (after) after(); }, state === 'good' || state === 'rush' ? 420 : 520);
    }

    function reject(text) {
      say('bad', text);
      api.audio.play('wrong');
      flash('bad');
    }

    function submit() {
      if (over || !open || flashing) return;
      var word = picked.map(function (x) { return x.ch; }).join('');
      if (!word) { say('tip', t('lrTapFirst', 'Tap letters first, then Enter.')); return; }
      if (word.length < rack.min) { reject(t('lrShort', 'Words need at least {n} letters.', { n: rack.min })); return; }
      if (foundSet[word]) {
        reject(t('lrAgain', 'You already have {w}.', { w: upper(word) }));
        var chip = foundBox.querySelector('[data-word="' + word + '"]');
        if (chip && animate) { chip.classList.remove('lr-chip--pulse'); void chip.offsetWidth; chip.classList.add('lr-chip--pulse'); }
        return;
      }
      if (!FF.Words.isWord(word)) { reject(t('lrNotWord', '{w} is not in the word list.', { w: upper(word) })); return; }

      var pts = points(word, size);
      var isRush = word.length === size;
      var before = rankFor(rack.total ? score / rack.total : 0).index;
      found.push(word);
      foundSet[word] = true;
      score += pts;
      api.scoring.add(entity.id, pts, { correct: true });
      api.shell.updateScores(entity.id);
      var r = renderHud();
      renderFound(word);

      if (isRush) {
        say('rush', t('lrRush', 'Rush word! +{n}', { n: pts }));
        api.audio.play('streak');
        if (animate && FF.Confetti) FF.Confetti.burst(90);
      } else if (r.index > before) {
        say('good', t('lrRankUp', '{rank}! +{n}', { rank: r.name, n: pts }));
        api.audio.play('streak');
      } else {
        say('good', (rack.target[word] ? '' : t('lrBonus', 'Bonus word') + ' · ') + '+' + pts + ' ' + upper(word));
        api.audio.play('correct');
      }
      flash(isRush ? 'rush' : 'good');
    }

    function hint() {
      if (over || !open || !hints) return;
      var left = rack.words.filter(function (w) { return !foundSet[w]; });
      if (!left.length) { say('tip', t('lrAllFound', 'You found every word!')); return; }
      // Everyday words make the best hints.
      left.sort(function (a, b) { return (FF.Words.tier(a) - FF.Words.tier(b)) || (a.length - b.length); });
      var w = left[Math.min(left.length - 1, FF.util.int(0, Math.min(4, left.length - 1)))];
      hints--;
      renderHint();
      var shown = upper(w.slice(0, w.length >= 6 ? 2 : 1));
      say('tip', t('lrHintText', 'Try a {n}-letter word that starts with {s}', { n: w.length, s: shown }));
      api.audio.play('select');
    }

    /* ---- Keyboard ---- */

    function onKey(e) {
      if (!document.body.contains(stage)) { document.removeEventListener('keydown', onKey); return; }
      if (over || !open || e.ctrlKey || e.metaKey || e.altKey) return;
      var target = e.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (document.querySelector('.ff-dialog')) return;
      var k = e.key;
      if (k === 'Enter') { e.preventDefault(); submit(); return; }
      if (k === 'Backspace') { e.preventDefault(); removeLast(); return; }
      if (k === 'Escape' && picked.length) { e.preventDefault(); settleFlash(); clearPicked(); return; }
      if (k === ' ' || k === 'Spacebar') { e.preventDefault(); shuffle(); return; }
      if (k && k.length === 1 && /[a-z]/i.test(k)) {
        var ch = k.toLowerCase();
        if (flashing) settleFlash();
        var tile = tiles.filter(function (x) { return x.ch === ch && !x.used; })[0];
        if (tile) pick(tile);
        else {
          var has = tiles.some(function (x) { return x.ch === ch; });
          say('bad', has ? t('lrNoMore', 'No more {l}s left.', { l: upper(ch) }) : t('lrNoLetter', 'There is no {l}.', { l: upper(ch) }));
          if (animate) { rackEl.classList.remove('is-nudged'); void rackEl.offsetWidth; rackEl.classList.add('is-nudged'); }
        }
      }
    }
    document.addEventListener('keydown', onKey);

    /* ---- Clock and finish ---- */

    function finish() {
      if (over) return;
      over = true;
      if (flashing) { clearTimeout(flashing); flashing = null; }
      document.removeEventListener('keydown', onKey);
      api.shell.setOnTick(null);
      api.shell.hideTimer();
      api.audio.play('roundEnd');
      opts.onDone({ words: found.slice(), score: score });
    }

    function start() {
      open = true;
      renderRack();
      renderWord();
      renderHint();
      if (seconds) {
        api.shell.setOnTick(function (rem) { if (meter) meter.set(rem / seconds); });
        api.shell.setTimer(seconds, finish);
      }
      api.audio.play('roundStart');
    }

    renderRack();
    renderWord();
    renderHud();
    renderFound();
    renderHint();

    if (opts.racing) {
      // Hold every device until the shared open instant, so nobody starts early.
      FF.Race.beginRound(0);
      // For people watching: the letters everyone is making words from.
      FF.Race.describe({ kind: 'card', text: t('lrWatch', 'Make words from these letters: {letters}', { letters: rack.letters.join(' ').toUpperCase() }) }, null);
      FF.RaceUI.gate(root, '.lr-tile, .lr-ctrl, .lr-hint', start);
    } else {
      start();
    }
  }

  /* ---------- After a turn ---------- */

  function turnSummary(api, entity, rack, result, opts) {
    var root = api.shell.root;
    FF.ui.clear(root);
    api.shell.hideTimer();
    var stage = FF.GameUI.stage({ className: 'lr-sum' });
    var r = rankFor(rack.total ? result.score / rack.total : 0);

    var hero = FF.ui.div('lr-sum__hero');
    hero.appendChild(FF.ui.div('lr-sum__badge', icon(r.index >= 4 ? 'crown' : (r.index >= 2 ? 'trophy' : 'star'))));
    if (opts.who) hero.appendChild(FF.GameUI.kicker(opts.who));
    hero.appendChild(FF.GameUI.prompt(r.name, 'xl'));
    stage.appendChild(hero);

    var stats = FF.ui.div('lr-sum__stats');
    function stat(num, label) {
      var s = FF.ui.div('lr-stat');
      s.appendChild(FF.ui.span('lr-stat__num', num));
      s.appendChild(FF.ui.span('lr-stat__label', label));
      return s;
    }
    var targetFound = result.words.filter(function (w) { return rack.target[w]; }).length;
    stats.appendChild(stat(FF.util.formatNumber(result.score), t('lrPoints', 'Points')));
    stats.appendChild(stat(targetFound + '/' + rack.words.length, t('lrWords', 'Words')));
    var best = bestWord(result.words);
    stats.appendChild(stat(best ? upper(best) : '—', t('lrBest', 'Best word')));
    stage.appendChild(stats);

    // The rush word: found it, or here it is.
    var rush = rack.words.filter(function (w) { return w.length === rack.letters.length; });
    var gotRush = result.words.some(function (w) { return w.length === rack.letters.length; });
    var rushBox = FF.ui.div('lr-sum__rush' + (gotRush ? ' is-found' : ''));
    rushBox.appendChild(icon('lightning'));
    var rushText = FF.ui.div('lr-sum__rush-text');
    rushText.appendChild(FF.ui.span('lr-sum__rush-label', gotRush ? t('lrGotRush', 'You found the rush word') : t('lrRushWas', 'The rush word was')));
    var rushWords = FF.ui.div('lr-sum__rush-words');
    (rush.length ? rush : [rack.key]).forEach(function (w) { rushWords.appendChild(wordChip(w, 'rush')); });
    rushText.appendChild(rushWords);
    rushBox.appendChild(rushText);
    stage.appendChild(rushBox);

    if (result.words.length) {
      stage.appendChild(FF.ui.el('h3', { class: 'lr-sum__h' }, t('lrYouFound', 'You found')));
      stage.appendChild(groupedWords(result.words, rack, {}));
    }
    var missed = missedWords(rack, result.words);
    if (missed.length) {
      stage.appendChild(FF.ui.el('h3', { class: 'lr-sum__h' }, t('lrMissed', 'Words you missed')));
      stage.appendChild(groupedWords(missed, rack, { kind: 'missed' }));
    }
    stage.appendChild(FF.GameUI.note(t('lrTapMeaning', 'Tap any word to see what it means.')));
    if (opts.extra) stage.appendChild(opts.extra);
    if (opts.action) stage.appendChild(opts.action);
    root.appendChild(stage);
    if (opts.action) FF.Nav.focusFirst(stage);
  }

  /* Pass the device: nothing starts until the next player is ready. */
  function readyCard(api, entity, label, go) {
    var root = api.shell.root;
    FF.ui.clear(root);
    api.shell.hideTimer();
    var stage = FF.GameUI.stage({ center: true, className: 'lr-ready' });
    var ava = FF.ui.div('lr-ready__ava');
    ava.appendChild(FF.Players.avatarEl(entity, ''));
    stage.appendChild(ava);
    stage.appendChild(FF.GameUI.kicker(label));
    stage.appendChild(FF.GameUI.prompt(t('lrUp', '{name}, you’re up', { name: entity.name || t('playerLabel', 'Player') }), 'xl'));
    var secs = roundSeconds(api);
    stage.appendChild(FF.GameUI.sub(secs
      ? t('lrReadySub', 'Pass the device to {name}. The clock starts when you tap Start: {time} to find as many words as you can.', { name: entity.name || t('playerLabel', 'Player'), time: FF.util.formatTime(secs) })
      : t('lrReadySubNoClock', 'Pass the device to {name}, then tap Start.', { name: entity.name || t('playerLabel', 'Player') })));
    stage.appendChild(FF.GameUI.action(t('lrStart', 'Start'), function () { api.audio.play('click'); go(); }, { icon: 'play' }));
    root.appendChild(stage);
    FF.Nav.focusFirst(stage);
  }

  /* ---------- TV display: big letters for a room, answers at the end ---------- */

  function runTv(api) {
    var root = api.shell.root;
    var seconds = api.config.displaySeconds || 60;
    var rack = deal(api);
    if (!rack) { FF.GameUI.exitCard(api); return; }
    var ended = false;

    FF.ui.clear(root);
    api.shell.hideTimer();
    api.shell.setTitle(api.def.name);

    var wrap = FF.ui.div('dsp-wrap lr-tv');
    wrap.appendChild(FF.ui.div('dsp-tag', t('lrTvTag', 'Everyone plays · write your words down')));
    wrap.appendChild(FF.ui.div('dsp-title', api.def.name));
    var sub = FF.ui.div('dsp-sub', '');
    wrap.appendChild(sub);
    var letterRow = FF.ui.div('lr-tv__rack');
    wrap.appendChild(letterRow);
    var timerEl = FF.ui.div('dsp-timer', FF.util.formatTime(seconds));
    wrap.appendChild(timerEl);
    var answers = FF.ui.div('lr-tv__answers');
    wrap.appendChild(answers);

    var actions = FF.ui.div('dsp-actions');
    var revealBtn = FF.UI.button(t('lrReveal', 'Show the words'), { icon: 'eye', class: 'btn btn-lg', onClick: reveal });
    actions.appendChild(FF.UI.button(t('lrShuffle', 'Shuffle'), { icon: 'shuffle', class: 'btn btn-lg', onClick: function () {
      rack.letters = FF.util.shuffle(rack.letters);
      render();
      api.audio.play('flip');
    } }));
    actions.appendChild(FF.UI.button(t('lrNewLetters', 'New letters'), { icon: 'restart', class: 'btn btn-lg', onClick: function () {
      rack = deal(api) || rack;
      FF.ui.clear(answers);
      revealBtn.disabled = false;
      timerEl.hidden = false;
      render();
      api.audio.play('flip');
      api.shell.setTimer(seconds, end);
    } }));
    actions.appendChild(revealBtn);
    actions.appendChild(FF.UI.button(t('finish', 'Finish'), { icon: 'check', class: 'btn btn-lg', primary: true, onClick: end }));
    wrap.appendChild(actions);
    root.appendChild(wrap);

    function render() {
      FF.ui.clear(letterRow);
      rack.letters.forEach(function (ch) { letterRow.appendChild(FF.ui.span('lr-tile lr-tile--tv', upper(ch))); });
      sub.textContent = t('lrTvSub', '{n} words to find. One of them uses all {k} letters. Words need {m}+ letters.', { n: rack.words.length, k: rack.letters.length, m: rack.min });
    }

    function reveal() {
      revealBtn.disabled = true;
      api.shell.hideTimer();
      timerEl.hidden = true;
      FF.ui.clear(answers);
      answers.appendChild(groupedWords(rack.words, rack, {}));
      api.audio.play('roundEnd');
    }

    function end() {
      if (ended) return;
      ended = true;
      api.shell.hideTimer();
      api.end({ title: t('timesUp', 'Time’s up!') });
    }

    render();
    api.shell.setOnTick(function (rem) { timerEl.textContent = FF.util.formatTime(rem); });
    api.shell.setTimer(seconds, reveal);
  }

  /* ---------- The game ---------- */

  FF.registerGame({
    id: 'letterRush',
    featured: true,
    name: 'Letter Rush',
    description: 'One set of letters, one clock. Find every word you can, and hunt for the rush word that uses them all.',
    category: 'words',
    icon: '🔤',
    // The wide banner shows the RUSH tiles above the title, not behind it.
    coverFocus: 'center 63%',
    players: [1, 8],
    difficulty: 'Easy',
    duration: 5,
    tags: ['quick', 'spelling'],
    modes: ['solo', 'turn', 'team'],
    defaultMode: 'turn',
    howToPlay: [
      'You get a set of letters. Tap them, or type, to make words of 3 letters or more.',
      'Every set hides a rush word that uses all the letters. It scores double.',
      '1 point per letter. Rare words count too, as bonus words.',
      'Climb the ranks from Warming up to Word wizard before the clock runs out.',
      'After your turn, tap any word to see what it means.'
    ],
    display: true,
    displayStart: function (api) {
      whenReady(api, function () { runTv(api); });
    },
    start: function (api) {
      var order = entities(api);
      if (!order.length) { FF.GameUI.exitCard(api, t('lrNoPlayers', 'No players were found')); return; }
      if (api.config.randomOrder) order = FF.util.shuffle(order);
      var racing = !!(FF.Race && FF.Race.active && FF.Race.active());

      whenReady(api, function () {
        if (racing) startRace(api, order);
        else startTurns(api, order);
      });
    }
  });

  // Pass and play: each player (or team) gets their own set of a similar size.
  function startTurns(api, order) {
    var results = {};   // entityId -> { words, score, rack }
    var idx = 0;
    var many = order.length > 1;

    function label(i) { return t('turnNofM', 'Turn {n} of {total}', { n: i + 1, total: order.length }); }

    function next() {
      var entity = order[idx];
      var rack = deal(api);
      if (!rack) { FF.GameUI.exitCard(api); return; }
      var go = function () {
        playTurn(api, {
          entity: entity, rack: rack, label: many ? label(idx) : null, racing: false,
          onDone: function (res) {
            res.rack = rack;
            results[entity.id] = res;
            var last = idx >= order.length - 1;
            turnSummary(api, entity, rack, res, {
              who: many ? (entity.name || '') : null,
              action: FF.GameUI.action(last ? t('seeResults', 'See results') : t('nextPlayer', 'Next player'), function () {
                api.audio.play('click');
                if (last) { if (many) standings(); else finishGame(); return; }
                idx++;
                next();
              })
            });
          }
        });
      };
      if (many) readyCard(api, entity, label(idx), go);
      else go();
    }

    function standings() {
      var root = api.shell.root;
      FF.ui.clear(root);
      api.shell.hideTimer();
      var stage = FF.GameUI.stage({ className: 'lr-end' });
      stage.appendChild(FF.GameUI.prompt(t('lrStandings', 'How everyone did'), 'md'));
      var rows = order.slice().sort(function (a, b) { return ((results[b.id] || {}).score || 0) - ((results[a.id] || {}).score || 0); });
      var list = FF.ui.el('ol', { class: 'lr-end__list' });
      rows.forEach(function (e, i) {
        var res = results[e.id] || { words: [], score: 0 };
        var li = FF.ui.el('li', { class: 'lr-end__row' + (i === 0 ? ' is-top' : '') });
        li.appendChild(FF.ui.span('lr-end__place', String(i + 1)));
        var ava = FF.ui.span('lr-end__ava');
        ava.appendChild(FF.Players.avatarEl(e, ''));
        li.appendChild(ava);
        var who = FF.ui.div('lr-end__who');
        who.appendChild(FF.ui.span('lr-end__name', e.name || t('playerLabel', 'Player')));
        var best = bestWord(res.words);
        who.appendChild(FF.ui.span('lr-end__meta', FF.util.plural(res.words.length, 'word') + (best ? ' · ' + t('lrBestIs', 'best: {w}', { w: upper(best) }) : '')));
        li.appendChild(who);
        li.appendChild(FF.ui.span('lr-end__score', FF.util.formatNumber(res.score)));
        list.appendChild(li);
      });
      stage.appendChild(list);
      stage.appendChild(FF.GameUI.action(t('finish', 'Finish'), function () { finishGame(); }, { icon: 'check' }));
      root.appendChild(stage);
      FF.Nav.focusFirst(stage);
    }

    function finishGame() {
      var mostWords = 0;
      Object.keys(results).forEach(function (id) { if (results[id].words.length > mostWords) mostWords = results[id].words.length; });
      api.audio.play('winner');
      var sr = api.scoring.results();
      api.end({
        results: sr.results,
        winnerId: sr.winnerId,
        mostWords: mostWords,
        achievements: mostWords >= 15 ? ['wordMaster'] : []
      });
    }

    next();
  }

  // Online room: everyone gets the SAME letters at the same moment and keeps
  // whatever they score, so it runs in 'parallel' mode with one shared round.
  function startRace(api, order) {
    var me = FF.Room.current();
    var mine = order.filter(function (e) { return e.id === me.uid; });
    var entity = mine.length ? mine[0] : order[0];
    var ended = false;

    // The word bank may have loaded at different moments on each device:
    // re-seed so every device deals the same letters.
    FF.Random.seed(FF.Random.roundSeed((me.meta || {}).seed, api.def.id, 'rack'));
    var rack = deal(api);
    if (!rack) { FF.GameUI.exitCard(api); return; }

    FF.Race.begin(api.def.id, {
      rounds: 1,
      mode: 'parallel',
      timerMs: ((roundSeconds(api) || 120) + 25) * 1000,
      pointsFor: function (answer) { return answer.value || 0; }
    });

    var offSettle = FF.Race.onSettle(function () {
      if (ended) return;
      ended = true;
      FF.Race.syncScoring();
      api.shell.updateScores();
      if (offSettle) { offSettle(); offSettle = null; }
      FF.Race.end();
      // The shared room results screen shows the final standings.
      api.end({});
    });

    playTurn(api, {
      entity: entity, rack: rack, label: null, racing: true,
      onDone: function (res) {
        // Bank this device's score and wait for everyone else.
        FF.Race.submit(null, true, FF.Race.msSinceOpen(), { value: res.score });
        if (ended) return;
        var wait = FF.ui.div('lr-wait');
        wait.appendChild(FF.GameUI.feedback('info', t('lrWaiting', 'Waiting for the other players to finish…')));
        if (FF.RaceUI && FF.RaceUI.scoreboard) wait.appendChild(FF.RaceUI.scoreboard());
        turnSummary(api, entity, rack, res, { extra: wait });
      }
    });
  }
})();
