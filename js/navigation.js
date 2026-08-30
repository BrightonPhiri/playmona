/* ============================================================
   FAMILY FUN — navigation.js
   Simple view router + spatial (D-pad / arrow-key) focus manager
   for TV remotes and desktop keyboards.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  FF.Nav = {
    history: [],
    current: 'home',
    params: {},

    init: function () {
      const self = this;
      document.addEventListener('keydown', function (e) { self._keydown(e); });
      document.addEventListener('click', function (e) { FF.Audio.unlock(); }, true);
      document.addEventListener('pointerdown', function (e) { FF.Audio.unlock(); }, true);
    },

    go: function (viewId, params) {
      this.history.push({ view: this.current, params: this.params });
      this._show(viewId, params);
    },

    replace: function (viewId, params) { this._show(viewId, params); },

    back: function () {
      if (this.history.length) {
        const prev = this.history.pop();
        this._show(prev.view, prev.params);
      }
    },

    _show: function (viewId, params) {
      this.current = viewId;
      this.params = params || {};
      if (typeof FF.App !== 'undefined' && FF.App.render) FF.App.render(viewId, this.params);
      try { window.scrollTo(0, 0); } catch (e) {}
      this.focusFirst();
    },

    /* ---------- focusable collection ---------- */
    focusables: function (root) {
      root = root || document;
      const sels = '[data-focusable],button,a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])';
      return Array.from(root.querySelectorAll(sels)).filter(function (el) {
        const r = el.getBoundingClientRect();
        const st = window.getComputedStyle(el);
        return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
      });
    },

    focus: function (el) {
      if (!el) return;
      const prev = document.querySelector('.focused');
      if (prev && prev !== el) prev.classList.remove('focused');
      el.classList.add('focused');
      try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (e2) {} }
    },

    focusFirst: function (root) {
      const els = this.focusables(root || (typeof FF.App !== 'undefined' ? FF.App.root() : document));
      if (els.length) this.focus(els[0]);
    },

    _activeContainer: function () {
      if (document.body.classList.contains('game-active')) return FF.ui.$('#game-screen') || document;
      return FF.ui.$('#app-main') || document;
    },

    _keydown: function (e) {
      const key = e.key;
      const dirs = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
      const dir = dirs[key];

      if (key === 'Escape' || key === 'Backspace' || key === 'BrowserBack' || e.keyCode === 461 || key === 'GoBack') {
        // Back: close game -> exit; else pop view
        if (document.body.classList.contains('game-active')) {
          e.preventDefault();
          FF.GameFlow.exitToHome();
        } else {
          e.preventDefault();
          FF.Nav.back();
        }
        return;
      }

      if (dir) {
        e.preventDefault();
        const container = this._activeContainer();
        const els = this.focusables(container);
        if (!els.length) return;
        const active = document.activeElement;
        let current = els.indexOf(active);
        if (current === -1) {
          this.focus(els[0]);
          return;
        }
        const next = this._nearest(active, els, dir);
        if (next) this.focus(next);
      } else if (key === 'Enter') {
        const active = document.activeElement;
        const container = this._activeContainer();
        if (active && container.contains(active)) {
          const tag = active.tagName.toLowerCase();
          if (tag !== 'button' && tag !== 'input' && tag !== 'select' && tag !== 'textarea' && tag !== 'a') {
            e.preventDefault();
            active.click();
          }
        }
      }
    },

    _nearest: function (current, candidates, dir) {
      const cur = current.getBoundingClientRect();
      const cx = cur.left + cur.width / 2;
      const cy = cur.top + cur.height / 2;
      let best = null;
      let bestScore = Infinity;
      for (const el of candidates) {
        if (el === current) continue;
        const r = el.getBoundingClientRect();
        const ex = r.left + r.width / 2;
        const ey = r.top + r.height / 2;
        const dx = ex - cx;
        const dy = ey - cy;
        let primary, secondary;
        if (dir === 'left') { primary = -dx; secondary = Math.abs(dy); if (dx >= 0) continue; }
        else if (dir === 'right') { primary = dx; secondary = Math.abs(dy); if (dx <= 0) continue; }
        else if (dir === 'up') { primary = -dy; secondary = Math.abs(dx); if (dy >= 0) continue; }
        else { primary = dy; secondary = Math.abs(dx); if (dy <= 0) continue; }
        // overlap bonus
        const score = primary + secondary * 2.2;
        if (score < bestScore) { bestScore = score; best = el; }
      }
      return best;
    }
  };
})();
