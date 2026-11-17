/* ============================================================
   PLAYMONA — wordshift/board.js
   FF.WordShiftBoard: the typing model behind WordShift's tiles,
   shared by the solo screen and the online Race. No DOM.

   The player picks a tile and types a letter into it. Nothing is
   ever picked or typed for them: no tile starts selected, and the
   model has no way to suggest a letter or a word. Several tiles may
   be edited; the rules then refuse the move ("change one letter").
   Classic script, ES5.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  /* A keydown event -> 'a'..'z' | 'enter' | 'back' | 'left' | 'right' | null. */
  function keyFilter(e) {
    if (!e || e.ctrlKey || e.metaKey || e.altKey) return null;
    var k = e.key;
    if (k === 'Enter') return 'enter';
    if (k === 'Backspace' || k === 'Delete') return 'back';
    if (k === 'ArrowLeft') return 'left';
    if (k === 'ArrowRight') return 'right';
    if (typeof k === 'string' && k.length === 1 && /[a-z]/i.test(k)) return k.toLowerCase();
    return null;
  }

  function create(word) {
    var base = [];
    var cur = [];
    var sel = -1;

    function reset(w) {
      base = String(w || '').toLowerCase().split('');
      cur = base.slice();
      sel = -1;
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
      type: function (ch) {
        if (sel < 0 || !/^[a-z]$/.test(ch)) return false;
        cur[sel] = ch;
        return true;
      },
      // Puts the selected tile back to the word before; with nothing selected, the last edited one.
      back: function () {
        var i = sel;
        if (i < 0 || cur[i] === base[i]) {
          var ed = this.edited();
          if (!ed.length) return false;
          i = ed[ed.length - 1];
        }
        cur[i] = base[i];
        return true;
      },
      edited: function () {
        var out = [];
        for (var i = 0; i < cur.length; i++) if (cur[i] !== base[i]) out.push(i);
        return out;
      }
    };
  }

  FF.WordShiftBoard = { create: create, keyFilter: keyFilter };
})();
