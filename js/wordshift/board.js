/* ============================================================
   PLAYMONA — wordshift/board.js
   FF.WordShiftBoard: the typing model behind WordShift's tiles,
   shared by the solo screen and the online Race. No DOM.

   The player picks a tile and types a letter: candidate(ch) gives
   the word to check at once (no Enter). The board itself changes
   only when the screen accepts that word (reset(word, true) keeps
   the picked tile, so the next try is one key away). Nothing is
   ever picked or typed for the player: no tile starts selected, and
   the model has no way to suggest a letter or a word.
   Classic script, ES5.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  /* A keydown event -> 'a'..'z' | 'left' | 'right' | null. */
  function keyFilter(e) {
    if (!e || e.ctrlKey || e.metaKey || e.altKey) return null;
    var k = e.key;
    if (k === 'ArrowLeft') return 'left';
    if (k === 'ArrowRight') return 'right';
    if (typeof k === 'string' && k.length === 1 && /[a-z]/i.test(k)) return k.toLowerCase();
    return null;
  }

  function create(word) {
    var cur = [];
    var sel = -1;

    function reset(w, keepSel) {
      cur = String(w || '').toLowerCase().split('');
      if (!keepSel || sel >= cur.length) sel = -1;
    }
    reset(word);

    return {
      reset: reset,
      word: function () { return cur.join(''); },
      letters: function () { return cur.slice(); },
      selected: function () { return sel; },
      select: function (i) { if (i >= 0 && i < cur.length) sel = i; },
      move: function (d) {
        if (!cur.length) return;
        sel = Math.max(0, Math.min(cur.length - 1, (sel < 0 ? 0 : sel) + (sel < 0 ? 0 : d)));
      },
      // The word with `ch` in the picked tile, or null (no tile picked, not a letter, the same letter).
      candidate: function (ch) {
        if (sel < 0 || !/^[a-z]$/.test(ch) || cur[sel] === ch) return null;
        var next = cur.slice();
        next[sel] = ch;
        return next.join('');
      }
    };
  }

  FF.WordShiftBoard = { create: create, keyFilter: keyFilter };
})();
