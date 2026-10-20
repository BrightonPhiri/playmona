/* ============================================================
   FAMILY FUN — core.js
   Global namespace, DOM helpers, and utilities.
   Classic script (no ES modules) so the app runs from file://
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  /* ---------- DOM helpers ---------- */
  function appendChildren(node, children) {
    if (children == null) return;
    if (!Array.isArray(children)) children = [children];
    for (const c of children) {
      if (c == null || c === false || c === undefined) continue;
      if (typeof c === 'string' || typeof c === 'number') {
        node.appendChild(document.createTextNode(String(c)));
      } else if (c instanceof Node) {
        node.appendChild(c);
      } else if (Array.isArray(c)) {
        appendChildren(node, c);
      } else {
        node.appendChild(document.createTextNode(String(c)));
      }
    }
  }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class' || k === 'className') node.className = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'dataset') { if (typeof v === 'object') Object.assign(node.dataset, v); }
        else if (k === 'style' && typeof v === 'object') {
          for (const sk in v) {
            if (!Object.prototype.hasOwnProperty.call(v, sk)) continue;
            if (sk.indexOf('--') === 0) node.style.setProperty(sk, v[sk]);
            else node.style[sk] = v[sk];
          }
        }
        else if (k === 'value') node.value = v;
        else if (k === 'checked') node.checked = !!v;
        else if (k === 'disabled') node.disabled = !!v;
        else if (k === 'for') node.setAttribute('for', v);
        else if (k === 'ariaLabel') node.setAttribute('aria-label', v);
        else if (k === 'role') node.setAttribute('role', v);
        else if (k === 'tabindex') node.tabIndex = v;
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
        else if (v === true) node.setAttribute(k, '');
        else if (v !== false) node.setAttribute(k, v);
      }
    }
    appendChildren(node, children);
    return node;
  }

  FF.ui = {
    el: el,
    clear: function (node) { while (node && node.firstChild) node.removeChild(node.firstChild); return node; },
    $: function (sel, root) { return (root || document).querySelector(sel); },
    $$: function (sel, root) { return Array.from((root || document).querySelectorAll(sel)); },
    txt: function (tag, text, cls) { return el(tag, cls ? { class: cls } : null, text); },
    div: function (cls, children) { return el('div', cls ? { class: cls } : null, children); },
    span: function (cls, children) { return el('span', cls ? { class: cls } : null, children); },
    button: function (label, opts) {
      opts = opts || {};
      var cls = String(opts.class || '').replace(/\s+/g, ' ').trim();
      var special = /(?:^|\s)(nav-link|seg__btn|tool-btn|shell-btn|icon-btn|switch|hero-btn|filter-chip|mini-btn|link-btn|fav-btn|host-btn|avatar-btn|rail__btn|color-btn|accent-swatch|font-option|player-row|chip|tabbar__item|topnav__link|fav-toggle|gcard__link|cat-tile|gm-[a-z-]+|swatch|sheet-close)/.test(cls);
      if (!special && !/(?:^|\s)btn(?:\s|$)/.test(cls)) cls = ('btn ' + cls).trim();
      if (opts.primary && cls.indexOf('btn-primary') === -1) cls += ' btn-primary';
      if (opts.icon && cls.indexOf('btn-icon') === -1) cls += ' btn-icon';
      const b = el('button', {
        class: cls,
        tabindex: 0,
        onclick: opts.onClick,
        'aria-label': opts.ariaLabel || (typeof label === 'string' ? label : null)
      }, label);
      if (opts.dataset) Object.assign(b.dataset, opts.dataset);
      return b;
    },
    icon: function (emoji) { return el('span', { class: 'icon-emoji', 'aria-hidden': 'true' }, emoji); }
  };

  /* ---------- Seedable random source ----------
     Every random call in the app routes through FF._rand(). Normally that
     is Math.random. Inside a multiplayer round it is a seeded PRNG, so all
     devices generate identical questions from the room's seed. */
  var _seeded = null;

  // xmur3: string -> 32-bit seed
  function _hashSeed(str) {
    var text = String(str);
    var h = 1779033703 ^ text.length;
    for (var i = 0; i < text.length; i++) {
      h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return h >>> 0;
    };
  }

  // mulberry32: 32-bit seed -> uniform [0,1)
  function _mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  FF._rand = function () {
    return _seeded ? _seeded() : Math.random();
  };

  /* ---------- Utilities ---------- */
  FF.util = {
    $: function (sel, root) { return (root || document).querySelector(sel); },
    $$: function (sel, root) { return Array.from((root || document).querySelectorAll(sel)); },

    shuffle: function (arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(FF._rand() * (i + 1));
        const t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    },

    pick: function (arr) { return arr[Math.floor(FF._rand() * arr.length)]; },

    // sample n distinct items (returns fewer if not enough)
    sample: function (arr, n) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(FF._rand() * (i + 1));
        const t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a.slice(0, n);
    },

    int: function (min, max) { return Math.floor(FF._rand() * (max - min + 1)) + min; },
    clamp: function (v, min, max) { return Math.max(min, Math.min(max, v)); },

    formatTime: function (totalSeconds) {
      const s = Math.max(0, Math.ceil(totalSeconds));
      const m = Math.floor(s / 60);
      const r = s % 60;
      return (m < 10 ? '0' + m : m) + ':' + (r < 10 ? '0' + r : r);
    },

    // Grouped for the current language (1,234 / 1.234 / 1 234).
    formatNumber: function (n) {
      n = n == null ? 0 : n;
      var lang = (FF.i18n && FF.i18n.getLang) ? FF.i18n.getLang() : 'en';
      try { return new Intl.NumberFormat(lang).format(n); } catch (e) { return String(n); }
    },

    escapeHtml: function (s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    },

    uid: function () { return 'id' + FF._rand().toString(36).slice(2, 10); },

    plural: function (n, word, pluralWord) {
      return n + ' ' + (n === 1 ? word : (pluralWord || word + 's'));
    },

    // Standardize a guess/answer for loose comparison
    normalize: function (s) {
      return String(s == null ? '' : s).toLowerCase().trim()
        .replace(/[^a-z0-9\s'-]/g, '')
        .replace(/\s+/g, ' ');
    },

    lettersOnly: function (s) {
      return String(s == null ? '' : s).toLowerCase().replace(/[^a-z]/g, '');
    },

    isAlpha: function (s) {
      return /^[a-zA-Z]+$/.test(String(s || ''));
    },

    // Fisher-Yates in place
    shuffleInPlace: function (arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(FF._rand() * (i + 1));
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    }
  };

  /* ---------- Random manager with anti-repeat pool ---------- */
  // A Bag returns items in random order without immediate repeats,
  // reshuffling when exhausted.
  FF.Random = {
    int: function (min, max) { return FF.util.int(min, max); },
    pick: function (arr) { return FF.util.pick(arr); },
    shuffle: function (arr) { return FF.util.shuffle(arr); },
    sample: function (arr, n) { return FF.util.sample(arr, n); },

    seed: function (seedString) { _seeded = _mulberry32(_hashSeed(seedString)()); },

    unseed: function () { _seeded = null; },

    seeded: function () { return !!_seeded; },

    // Per-round seed: round N depends only on N, never on earlier rounds.
    roundSeed: function (roomSeed, gameId, roundIndex) {
      return String(roomSeed) + '|' + String(gameId) + '|' + String(roundIndex);
    },

    // Room seeds must never come from the seeded stream.
    newSeed: function () {
      var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
      var out = '';
      for (var i = 0; i < 8; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
      return out;
    },

    Bag: function (items) {
      let pool = [];
      function refill() {
        pool = FF.util.shuffle(items.slice());
      }
      refill();
      return {
        next: function () {
          if (!pool.length) refill();
          // avoid the same item appearing twice in a row across refills
          if (pool.length === 1) return pool[0];
          return pool.pop();
        },
        nextN: function (n) {
          const out = [];
          for (let i = 0; i < n; i++) out.push(this.next());
          return out;
        },
        remaining: function () { return pool.length; },
        reset: refill
      };
    }
  };

  /* ---------- Error boundary ---------- */
  FF.safe = function (fn, fallback) {
    try { return fn(); } catch (e) {
      if (window.console && console.error) console.error('[FamilyFun]', e);
      return (typeof fallback === 'function') ? fallback(e) : fallback;
    }
  };

  /* ---------- Device detection ---------- */
  FF.device = {
    isTouch: function () { return ('ontouchstart' in window) || navigator.maxTouchPoints > 0; },
    isTV: function () { return /SmartTV|Android TV|WebTV|AppleTV|Tizen|webOS/i.test(navigator.userAgent) || /TV/i.test(navigator.userAgent); },
    isSmall: function () { return window.innerWidth < 700; }
  };

  window.addEventListener('error', function (e) {
    // Never expose raw errors; keep the app alive.
    if (window.console && console.error) console.error('[FamilyFun runtime]', e.message);
  });
})();
