/* ============================================================
   PLAYMONA — reader.js
   Privacy, Terms and Refunds open inside the app, over whatever is
   on screen (the app, the sign-in screen, a checkout), with a Back
   button. The text comes from the same pages the website serves,
   which the service worker keeps for offline use.
   The phone's back button closes it too: each page opened adds a
   history entry, and Back is always history.back().
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var DOCS = ['privacy', 'terms', 'refunds'];
  var t = function (k, f) { return FF.t ? FF.t(k, f) : f; };

  var state = { el: null, stack: [], previous: null };

  function docName(href) {
    var m = /^(?:\.\/|\/)?(privacy|terms|refunds)(?:\.html)?(?:[?#].*)?$/.exec(href || '');
    return m ? m[1] : null;
  }

  function build() {
    var el = FF.ui.el('div', { class: 'reader', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'reader-title', tabindex: -1 });
    var bar = FF.ui.div('reader__bar');
    var back = FF.UI.button(t('back', 'Back'), { class: 'btn-ghost reader__back', icon: 'arrow-left', onClick: function () { FF.Reader.back(); } });
    bar.appendChild(back);
    el.appendChild(bar);
    var page = FF.ui.div('reader__page');
    page.appendChild(FF.ui.el('h1', { class: 'reader__title', id: 'reader-title' }, ''));
    page.appendChild(FF.ui.el('p', { class: 'reader__sub' }, ''));
    page.appendChild(FF.ui.div('reader__body'));
    el.appendChild(page);
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.key === 'BrowserBack' || e.key === 'GoBack' || e.keyCode === 461) {
        e.preventDefault(); e.stopPropagation();
        FF.Reader.back();
      }
    });
    // Links to the other pages stay in the reader; other sites open in a new tab.
    el.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a || !el.contains(a)) return;
      var name = docName(a.getAttribute('href'));
      if (name) { e.preventDefault(); FF.Reader.open(name); return; }
      if (/^https?:/i.test(a.getAttribute('href'))) { a.target = '_blank'; a.rel = 'noopener'; }
    });
    return el;
  }

  function setLoading(el) {
    el.querySelector('.reader__title').textContent = '';
    el.querySelector('.reader__sub').textContent = '';
    var body = el.querySelector('.reader__body');
    FF.ui.clear(body);
    body.appendChild(FF.UI.loader ? FF.UI.loader({ size: 'md' }) : FF.ui.el('p', {}, t('loading', 'Loading')));
  }

  function show(el, name) {
    setLoading(el);
    el.scrollTop = 0;
    fetch(FF.page(name), { credentials: 'same-origin' }).then(function (res) {
      if (!res.ok) throw new Error('status ' + res.status);
      return res.text();
    }).then(function (html) {
      if (state.stack[state.stack.length - 1] !== name) return;   // moved on meanwhile
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var h1 = doc.querySelector('.doc-head h1');
      var sub = doc.querySelector('.doc-head p');
      var main = doc.querySelector('main.doc');
      if (!main) throw new Error('no content');
      el.querySelector('.reader__title').textContent = h1 ? h1.textContent : '';
      el.querySelector('.reader__sub').textContent = sub ? sub.textContent : '';
      var body = el.querySelector('.reader__body');
      FF.ui.clear(body);
      while (main.firstChild) body.appendChild(document.adoptNode(main.firstChild));
      document.title = (h1 ? h1.textContent + ' · ' : '') + 'PlayMona';
    }).catch(function () {
      if (state.stack[state.stack.length - 1] !== name) return;
      el.querySelector('.reader__title').textContent = t('notSavedYet', 'Not saved on this device yet');
      var body = el.querySelector('.reader__body');
      FF.ui.clear(body);
      body.appendChild(FF.ui.el('p', {}, t('readerOffline', 'Connect to the internet once to read this page. After that it opens even when you are offline.')));
      body.appendChild(FF.UI.button(t('tryAgain', 'Try again'), { class: 'btn-primary', icon: 'restart', onClick: function () { show(el, name); } }));
    });
  }

  function close() {
    if (!state.el) return;
    var el = state.el;
    state.el = null;
    state.stack = [];
    el.classList.add('reader--out');
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 160);
    document.body.classList.remove('reader-open');
    document.title = state.title || document.title;
    var prev = state.previous;
    if (prev && prev.focus && document.contains(prev)) { try { prev.focus({ preventScroll: true }); } catch (e) {} }
  }

  FF.Reader = {
    DOCS: DOCS,
    docName: docName,
    isOpen: function () { return !!state.el; },

    // name: 'privacy' | 'terms' | 'refunds'
    open: function (name) {
      if (DOCS.indexOf(name) === -1) return;
      // Opened from disk (file://) the browser will not load the page into the app.
      if (location.protocol === 'file:') { location.href = FF.page(name); return; }
      if (!state.el) {
        state.previous = document.activeElement;
        state.title = document.title;
        state.el = build();
        document.body.appendChild(state.el);
        document.body.classList.add('reader-open');
      }
      if (state.stack[state.stack.length - 1] === name) return;
      state.stack.push(name);
      try { history.pushState({ __ffReader: state.stack.length }, document.title); } catch (e) {}
      show(state.el, name);
      try { state.el.focus({ preventScroll: true }); } catch (e) {}
    },

    // The Back button and Escape go through the browser history, so the
    // phone's back button and ours always do the same thing.
    back: function () {
      if (!state.el) return;
      if (history.state && history.state.__ffReader) history.back();
      else this.handlePop();
    },

    // A history step back: the previous page, or close. True when the reader used it.
    handlePop: function () {
      if (!state.el) return false;
      state.stack.pop();
      if (state.stack.length) show(state.el, state.stack[state.stack.length - 1]);
      else close();
      return true;
    },

    // Links anywhere in the app to these pages open the reader instead of a new tab.
    link: function (name, label, cls) {
      var a = FF.ui.el('a', { href: FF.page(name), class: cls || '' }, label);
      a.addEventListener('click', function (e) {
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return;   // the player asked for a new tab
        e.preventDefault();
        FF.Reader.open(name);
      });
      return a;
    }
  };

  // Before the app has started (the sign-in screen) nothing else listens to Back.
  window.addEventListener('popstate', function () {
    if (FF.App && FF.App._navReady) return;   // FF.Nav asks the reader first
    FF.Reader.handlePop();
  });
})();
