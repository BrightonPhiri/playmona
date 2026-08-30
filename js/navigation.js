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

      // Keep the device/browser "back" button inside the app instead of
      // ejecting the player mid-game or leaving the hub by accident.
      window.addEventListener('popstate', function () { self._onPopState(); });

      // Warn before an accidental refresh/close while a game is running.
      window.addEventListener('beforeunload', function (e) {
        if (document.body.classList.contains('game-active')) {
          e.preventDefault();
          e.returnValue = '';
          return '';
        }
      });

      this._armBackGuard();
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

    // Ensure there is always a history entry to pop so that the browser
    // back button fires `popstate` (which we route) rather than leaving.
    _armBackGuard: function () {
      try {
        if (!history.state || !history.state.__ff) {
          history.replaceState({ __ff: true }, document.title);
          history.pushState({ __ff: true }, document.title);
        }
      } catch (e) {}
    },

    // After we handle a back press in-app, restore the guard entry.
    _rearmBackGuard: function () {
      try { history.pushState({ __ff: true }, document.title); } catch (e) {}
    },

    _onPopState: function () {
      const gameActive = document.body.classList.contains('game-active');
      if (gameActive && typeof FF.GameFlow !== 'undefined') {
        FF.GameFlow.handleBack();
        this._rearmBackGuard();
        return;
      }
      if (this.history.length) {
        this.back();
        this._rearmBackGuard();
        return;
      }
      // No in-app history: fall back to home before leaving the app.
      if (this.current !== 'home') {
        this.go('home');
        this._rearmBackGuard();
      }
      // else: already home — let the browser go back.
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

    // Whether the user is currently typing in a text field, in which case
    // Backspace must delete characters rather than act as a "back" key.
    _isTextEditing: function () {
      const a = document.activeElement;
      if (!a || !a.tagName) return false;
      const tag = a.tagName.toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select' || a.isContentEditable;
    },

    _keydown: function (e) {
      const key = e.key;
      const dirs = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
      const dir = dirs[key];

      // Backspace deletes text when the user is typing; it only acts as a
      // "back" key when focus is outside a text field.
      const isBack = key === 'Escape' || key === 'BrowserBack' || e.keyCode === 461 || key === 'GoBack' ||
        (key === 'Backspace' && !this._isTextEditing());
      if (isBack) {
        // Back: confirm before leaving a game; otherwise pop the previous view.
        if (document.body.classList.contains('game-active')) {
          e.preventDefault();
          if (FF.GameFlow && FF.GameFlow.handleBack) FF.GameFlow.handleBack();
          else FF.GameFlow.exitToHome();
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
