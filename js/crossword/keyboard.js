/* ============================================================
   PLAYMONA — crossword/keyboard.js
   Mini Crossword's own on-screen keyboard, so the phone keyboard
   never covers the grid. Keys act on pointerdown (no 300 ms wait,
   no focus stolen from the grid) and give a little press bounce.

     var kb = FF.CrosswordKeyboard.create({
       onKey(ch), onBack(), onPrev(), onNext(), onFlip()
     });
     host.appendChild(kb.el); ... kb.destroy();
   Classic script, ES5.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
  var GLYPH = {
    back: '<path d="M21 6H9l-6 6 6 6h12z"/><path d="M17 10l-4 4M13 10l4 4"/>',
    prev: '<path d="M15 5l-7 7 7 7"/>',
    next: '<path d="M9 5l7 7-7 7"/>',
    flip: '<path d="M4 9h13l-3-3M20 15H7l3 3"/>'
  };
  function t(key, fallback) { return FF.t ? FF.t(key, fallback) : fallback; }
  function svg(name) {
    var s = document.createElement('span');
    s.className = 'cw-key__glyph';
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' + GLYPH[name] + '</svg>';
    return s;
  }

  function create(h) {
    var el = document.createElement('div');
    el.className = 'cw-kb';
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', t('cwKeyboard', 'Keyboard'));
    var keys = [];

    function key(label, cls, fn, aria) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'cw-key' + (cls ? ' ' + cls : '');
      b.tabIndex = -1;
      if (GLYPH[label]) b.appendChild(svg(label)); else b.textContent = label;
      if (aria) b.setAttribute('aria-label', aria);
      var fired = false;
      function press(e) {
        if (e && e.preventDefault) e.preventDefault();
        fired = true;
        b.classList.remove('is-down'); void b.offsetWidth; b.classList.add('is-down');
        fn();
      }
      b.addEventListener('pointerdown', press);
      // Keyboard or screen reader activation (no pointer).
      b.addEventListener('click', function (e) { if (fired) { fired = false; return; } press(e); });
      b.addEventListener('animationend', function () { b.classList.remove('is-down'); });
      keys.push(b);
      return b;
    }

    ROWS.forEach(function (letters, i) {
      var row = document.createElement('div');
      row.className = 'cw-kb__row cw-kb__row--' + (i + 1);
      if (i === 2) row.appendChild(key('flip', 'cw-key--wide cw-key--fn', function () { h.onFlip(); }, t('cwFlip', 'Switch between Across and Down')));
      letters.split('').forEach(function (ch) { row.appendChild(key(ch, '', function () { h.onKey(ch); })); });
      if (i === 2) row.appendChild(key('back', 'cw-key--wide cw-key--fn', function () { h.onBack(); }, t('cwBackspace', 'Delete')));
      el.appendChild(row);
    });
    var nav = document.createElement('div');
    nav.className = 'cw-kb__row cw-kb__row--nav';
    nav.appendChild(key('prev', 'cw-key--nav', function () { h.onPrev(); }, t('cwPrevClue', 'Previous clue')));
    var space = key(t('cwNextClueKey', 'Next clue'), 'cw-key--nav cw-key--next', function () { h.onNext(); });
    nav.appendChild(space);
    nav.appendChild(key('next', 'cw-key--nav', function () { h.onNext(); }, t('cwNextClue', 'Next clue')));
    el.appendChild(nav);

    return {
      el: el,
      setDisabled: function (on) { keys.forEach(function (b) { b.disabled = !!on; }); el.classList.toggle('is-off', !!on); },
      destroy: function () { if (el.parentNode) el.parentNode.removeChild(el); }
    };
  }

  FF.CrosswordKeyboard = { create: create };
})();
