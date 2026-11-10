/* ============================================================
   PLAYMONA — spellTiles.js
   Letter tiles for every Expert level that asks players to spell
   an answer (Guess the Country, the Bible games...). Answers are
   checked by FF.AnswerMatch; this file only deals the tiles and
   draws the board.

     var set = FF.SpellTiles.deal('Zimbabwe', rand, {
       difficulty: api.config.difficulty,   // easy 1.5x, normal 1.75x, hard 2x the letters
       related: ['Zambia', 'Malawi']          // names whose letters make good decoys
     });
     var board = FF.SpellTiles.board(set, { audio: api.audio, onSubmit: function (text) { ... } });
     stage.appendChild(board.el);
     board.open();            // when the clock starts (hidden until then)
     board.finish(correct);   // lock it and show the answer in the slots

   Optional board opts.onChange(chars) hears the slot letters (null
   when empty) after every change (Say What? fills its saying live).

   Tap a tile to send it to the next empty slot, tap a filled slot to
   send it back; Undo, Clear and Check. A full row checks itself, and
   Check also sends a shorter accepted name (USA from United States).
   On a keyboard: letters and digits pick tiles, Backspace undoes,
   Enter checks (caught first, so Backspace never means "back").
   Spaces, hyphens and apostrophes are laid out for the player.
   Classic script, ES5. deal/layout/spelled have no DOM.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var MULT = { easy: 1.5, normal: 1.75, hard: 2 };
  var MAX_TILES = 30;
  var COMMON = 'AEIOURSTLNMDCBGHKPY';
  var DIGITS = '123';

  function t(key, fallback, vars) { return FF.t ? FF.t(key, fallback, vars) : String(fallback).replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] != null ? vars[k] : m; }); }

  function plainUpper(s) {
    var x = String(s == null ? '' : s);
    if (x.normalize) x = x.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return x.toUpperCase();
  }

  /* A name as cells: letters and digits to spell, gaps between words, and
     marks (hyphens, apostrophes, full stops) shown for you. */
  function layout(name) {
    var cells = [];
    plainUpper(name).split('').forEach(function (ch) {
      if (/[A-Z0-9]/.test(ch)) cells.push({ ch: ch, letter: true });
      else if (/\s/.test(ch)) { if (cells.length && !cells[cells.length - 1].gap) cells.push({ ch: ' ', gap: true }); }
      else cells.push({ ch: ch, fixed: true });
    });
    while (cells.length && cells[cells.length - 1].gap) cells.pop();
    return cells;
  }

  function lettersOf(name) {
    return layout(name).filter(function (c) { return c.letter; }).map(function (c) { return c.ch; });
  }

  /* What the slots spell, with the name's own gaps and marks between the
     letters (so SAINT KITTS reads as Saint Kitts, not SAINTKITTS). */
  function spelled(cells, chars) {
    var i = 0, out = '';
    cells.forEach(function (c) {
      if (c.letter) out += chars[i++] || '';
      else out += c.ch;
    });
    return out.replace(/\s+/g, ' ').trim();
  }

  function shuffle(list, rand) {
    var a = list.slice();
    for (var j = a.length - 1; j > 0; j--) {
      var k = Math.floor(rand() * (j + 1));
      var x = a[j]; a[j] = a[k]; a[k] = x;
    }
    return a;
  }

  /* How many tiles a name of n letters gets at this difficulty. */
  function tileCount(n, difficulty) {
    var mult = MULT[difficulty] || MULT.normal;
    return Math.min(Math.max(n + 2, Math.round(n * mult)), Math.max(MAX_TILES, n));
  }

  /* The tiles for one name: every letter it needs, plus decoys. Decoys are
     hard on purpose: extra copies of the name's own letters, letters from
     related names (lookalikes, neighbours, the other choices), then common
     letters. A name with a number (1 Kings) gets another number too. */
  function deal(target, rand, opts) {
    opts = opts || {};
    var cells = layout(target);
    var letters = cells.filter(function (c) { return c.letter; }).map(function (c) { return c.ch; });
    var n = letters.length;
    var total = tileCount(n, opts.difficulty);
    var related = [];
    (opts.related || []).forEach(function (name) { related = related.concat(lettersOf(name)); });
    var decoys = [];
    var digit = letters.filter(function (c) { return /\d/.test(c); })[0];
    if (digit && total > n) {
      var others = DIGITS.split('').filter(function (d) { return d !== digit; });
      decoys.push(others[Math.floor(rand() * others.length)]);
    }
    while (n + decoys.length < total) {
      var r = rand();
      var from = r < 0.4 ? letters : (r < 0.8 && related.length ? related : COMMON.split(''));
      decoys.push(from[Math.floor(rand() * from.length)]);
    }
    var tiles = shuffle(letters.concat(decoys), rand);
    // Never deal the answer already spelled out at the start.
    if (tiles.length > 1 && tiles.slice(0, n).join('') === letters.join('')) tiles.push(tiles.shift());
    return { target: target, cells: cells, letters: letters, tiles: tiles };
  }

  function reducedMotion() {
    try {
      if (document.documentElement.getAttribute('data-reduce') === '1') return true;
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { return false; }
  }

  /* ---------- the board ---------- */

  function board(set, opts) {
    opts = opts || {};
    var audio = opts.audio || { play: function () {} };
    var onSubmit = opts.onSubmit || function () {};
    var still = reducedMotion();

    var el = FF.ui.div('spell is-waiting');
    var row = FF.ui.el('div', { class: 'spell-slots', role: 'group', 'aria-label': t('spYourAnswer', 'Your answer') });
    var word = FF.ui.div('spell-word');
    row.appendChild(word);
    var slots = [];
    set.cells.forEach(function (c) {
      if (c.gap) { word = FF.ui.div('spell-word'); row.appendChild(word); return; }
      if (c.fixed) { word.appendChild(FF.ui.span('spell-slot spell-slot--mark', c.ch)); return; }
      var b = FF.ui.el('button', { type: 'button', class: 'spell-slot', 'aria-label': t('spEmpty', 'Empty') });
      var s = { el: b, tile: null, want: c.ch };
      b.addEventListener('click', function () { unplace(s, true); });
      word.appendChild(b);
      slots.push(s);
    });
    // Slots shrink so the longest word stays on one line on a phone.
    var longest = 0;
    set.cells.reduce(function (n, c) { var m = c.gap ? 0 : n + 1; longest = Math.max(longest, m); return m; }, 0);
    row.style.setProperty('--spell-longest', String(Math.max(longest, 8)));
    el.appendChild(row);

    var tray = FF.ui.el('div', { class: 'spell-tiles', role: 'group', 'aria-label': t('spLetters', 'Letters') });
    var tiles = set.tiles.map(function (ch) {
      var b = FF.ui.el('button', { type: 'button', class: 'spell-tile' }, ch);
      var tile = { el: b, ch: ch, used: false };
      b.addEventListener('click', function () { place(tile); });
      tray.appendChild(b);
      return tile;
    });
    el.appendChild(tray);

    var tools = FF.ui.div('spell-tools');
    var undoBtn = FF.UI.button(t('spUndo', 'Undo'), { class: 'btn btn-ghost', onClick: function () { undo(); } });
    var clearBtn = FF.UI.button(t('spClear', 'Clear'), { icon: 'x', class: 'btn btn-ghost', onClick: function () { clear(); } });
    var checkBtn = FF.UI.button(t('spCheck', 'Check'), { icon: 'check', primary: true, class: 'btn', onClick: function () { submit(); } });
    tools.appendChild(undoBtn);
    tools.appendChild(clearBtn);
    tools.appendChild(checkBtn);
    el.appendChild(tools);

    var history = [];
    var locked = false;
    var open = false;

    function firstEmpty() {
      for (var i = 0; i < slots.length; i++) if (!slots[i].tile) return slots[i];
      return null;
    }
    function place(tile) {
      if (locked || !open || tile.used) return;
      var s = firstEmpty();
      if (!s) return;
      tile.used = true;
      s.tile = tile;
      history.push(s);
      fly(tile.el, s);
      draw();
      audio.play('tap');
      if (!firstEmpty()) setTimeout(function () { if (!locked) submit(); }, still ? 60 : 280);
    }
    function unplace(s, sound) {
      if (locked || !s.tile) return;
      s.tile.used = false;
      var back = s.tile.el;
      s.tile = null;
      history = history.filter(function (x) { return x !== s; });
      draw();
      if (!still) { back.classList.remove('is-back'); void back.offsetWidth; back.classList.add('is-back'); }
      if (sound) audio.play('tap');
    }
    function undo() { var s = history[history.length - 1]; if (s) unplace(s, true); }
    function clear() {
      if (locked || !history.length) return;
      slots.forEach(function (s) { unplace(s, false); });
      audio.play('flip');
    }
    function text() { return spelled(set.cells, slots.map(function (s) { return s.tile ? s.tile.ch : ''; })); }
    function shake(node) { node.classList.remove('is-shake'); void node.offsetWidth; node.classList.add('is-shake'); }
    function submit() {
      if (locked || !open) return;
      if (!history.length) { shake(row); return; }
      onSubmit(text());
    }

    /* The letter flies from its tile to its slot. */
    function fly(from, s) {
      if (still || !from.getBoundingClientRect) { s.el.classList.add('is-landed'); return; }
      var a = from.getBoundingClientRect();
      var b = s.el.getBoundingClientRect();
      if (!a.width || !b.width) { s.el.classList.add('is-landed'); return; }
      var ghost = FF.ui.span('spell-ghost', s.tile.ch);
      ghost.style.left = a.left + 'px';
      ghost.style.top = a.top + 'px';
      ghost.style.width = a.width + 'px';
      ghost.style.height = a.height + 'px';
      document.body.appendChild(ghost);
      s.el.classList.add('is-incoming');
      void ghost.offsetWidth;
      ghost.style.transform = 'translate(' + (b.left - a.left) + 'px,' + (b.top - a.top) + 'px) scale(' +
        (b.width / a.width).toFixed(3) + ',' + (b.height / a.height).toFixed(3) + ')';
      setTimeout(function () {
        if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
        s.el.classList.remove('is-incoming', 'is-landed');
        void s.el.offsetWidth;
        s.el.classList.add('is-landed');
      }, 230);
    }

    function draw() {
      slots.forEach(function (s) {
        s.el.textContent = s.tile ? s.tile.ch : '';
        s.el.classList.toggle('is-filled', !!s.tile);
        if (!s.tile) s.el.classList.remove('is-incoming', 'is-landed');
        s.el.disabled = locked || !s.tile;
        s.el.setAttribute('aria-label', s.tile ? t('spTakeBack', 'Take back {l}', { l: s.tile.ch }) : t('spEmpty', 'Empty'));
      });
      tiles.forEach(function (tl) {
        tl.el.classList.toggle('is-used', tl.used);
        tl.el.disabled = locked || tl.used;
      });
      undoBtn.disabled = locked || !history.length;
      clearBtn.disabled = locked || !history.length;
      checkBtn.disabled = locked || !history.length;
      if (opts.onChange) opts.onChange(slots.map(function (s) { return s.tile ? s.tile.ch : null; }));
    }

    // Capture phase: these keys belong to the tiles, not the app's own
    // shortcuts (Backspace is "back" everywhere else).
    function onKey(e) {
      if (locked || !document.body.contains(el)) { document.removeEventListener('keydown', onKey, true); return; }
      if (!open || e.ctrlKey || e.metaKey || e.altKey) return;
      var k = e.key || '';
      var mine = true;
      if (/^[a-z0-9]$/i.test(k)) {
        var ch = plainUpper(k), hit = null;
        for (var i = 0; i < tiles.length && !hit; i++) if (!tiles[i].used && tiles[i].ch === ch) hit = tiles[i];
        if (hit) place(hit); else shake(tray);
      } else if (k === 'Backspace') undo();
      else if (k === 'Enter' && history.length) submit();
      else mine = false;
      if (mine) { e.preventDefault(); e.stopPropagation(); }
    }
    document.addEventListener('keydown', onKey, true);
    draw();

    return {
      el: el,
      text: text,
      /* The clock has started: show the board. */
      open: function () { if (locked) return; open = true; el.classList.remove('is-waiting'); draw(); },
      /* Lock the board and show the answer in the slots. */
      finish: function (correct) {
        locked = true;
        open = true;
        el.classList.remove('is-waiting');
        document.removeEventListener('keydown', onKey, true);
        draw();
        slots.forEach(function (s) {
          var had = s.tile ? s.tile.ch : '';
          s.el.textContent = s.want;
          s.el.classList.remove('is-incoming');
          s.el.classList.add(correct || had === s.want ? 'is-right' : 'is-wrong');
        });
        el.classList.add(correct ? 'is-correct' : 'is-missed');
      }
    };
  }

  /* The usual feedback line after a spelled answer, from an FF.AnswerMatch result. */
  function feedbackText(text, res, rightName) {
    if (!res || res.ok) return res && !res.exact ? t('spSpelt', 'It is spelt {c}.', { c: res.matched || rightName }) : '';
    if (!text) return '';
    if (res.near && FF.AnswerMatch && FF.AnswerMatch.normalise(text) === FF.AnswerMatch.normalise(res.near)) {
      return t('spOther', '{o} is a different answer.', { o: res.near });
    }
    return res.near
      ? t('spCloser', 'You spelled “{x}”, which is closer to {o}.', { x: text, o: res.near })
      : t('spYouSpelled', 'You spelled “{x}”.', { x: text });
  }

  FF.SpellTiles = {
    MULT: MULT, MAX_TILES: MAX_TILES,
    plainUpper: plainUpper, layout: layout, lettersOf: lettersOf, spelled: spelled,
    tileCount: tileCount, deal: deal, board: board, feedbackText: feedbackText
  };
})();
