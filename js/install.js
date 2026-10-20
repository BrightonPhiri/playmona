/* ============================================================
   PLAYMORA — install.js
   "Install the app" support, shared by the landing page and the
   app. Self-contained: needs nothing else from FF.

   - Chrome, Edge, Samsung Internet (Android and desktop) fire
     beforeinstallprompt; we keep it and show our own button.
   - iPhone and iPad Safari have no prompt, so we explain
     Share > Add to Home Screen instead.
   - Nothing shows once PlayMora runs as an installed app.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var deferred = null;
  var listeners = [];
  var installed = false;

  function notify() { listeners.slice().forEach(function (fn) { try { fn(); } catch (e) {} }); }

  function standalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true;
  }

  // iOS Safari (including iPadOS, which reports itself as a Mac with touch).
  function isIOS() {
    var ua = navigator.userAgent || '';
    var iDevice = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    var otherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
    return iDevice && !otherBrowser;
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();          // we show our own banner instead
    deferred = e;
    notify();
  });
  window.addEventListener('appinstalled', function () {
    installed = true;
    deferred = null;
    notify();
  });

  FF.Install = {
    // 'prompt' (one-tap install), 'ios' (show steps), or null (not possible here).
    kind: function () {
      if (installed || standalone()) return null;
      if (deferred) return 'prompt';
      if (isIOS()) return 'ios';
      return null;
    },
    available: function () { return !!this.kind(); },

    // Shows the browser's install dialog. Resolves 'accepted', 'dismissed' or 'unavailable'.
    prompt: function () {
      if (!deferred) return Promise.resolve('unavailable');
      var e = deferred;
      deferred = null;
      e.prompt();
      return e.userChoice.then(function (c) {
        if (c && c.outcome === 'accepted') installed = true;
        notify();
        return c ? c.outcome : 'dismissed';
      });
    },

    onChange: function (fn) { listeners.push(fn); },

    // The "dismissed" note lasts two weeks, then the banner may come back.
    dismissed: function () {
      try { return Number(localStorage.getItem('playmora:installDismissed') || 0) > Date.now() - 14 * 864e5; } catch (e) { return false; }
    },
    dismiss: function () {
      try { localStorage.setItem('playmora:installDismissed', String(Date.now())); } catch (e) {}
    }
  };

  // Offline support and installability need the service worker on every page.
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
})();
