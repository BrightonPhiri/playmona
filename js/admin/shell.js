/* ============================================================
   PLAYMONA — admin/shell.js
   The admin portal's frame: the account button with its menu,
   the section tabs in the header (tablets and computers) and the
   bottom tab bar on phones (with a "More" sheet when the sections
   do not fit). admin.js decides which pages exist and calls these.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var MAX_TABS = 5;   // the bottom bar shows up to five buttons
  var el = function (tag, attrs, kids) { return FF.ui.el(tag, attrs, kids); };

  /* ---------- Account button and menu ---------- */

  function chip() { return document.getElementById('admin-account'); }

  function closeMenu(returnFocus) {
    var m = document.getElementById('admin-account-menu');
    if (!m) return;
    if (m._cleanup) m._cleanup();
    m.parentNode.removeChild(m);
    var c = chip();
    if (c) {
      c.setAttribute('aria-expanded', 'false');
      if (returnFocus) c.focus();
    }
  }

  // My profile lives in the app: tell /play to open it (the app reads this on start).
  function openProfile() {
    var s = FF.Auth.user() || {};
    try {
      sessionStorage.setItem('playmona:lastView', JSON.stringify({ uid: s.uid || null, view: 'profile', params: {} }));
    } catch (e) {}
    window.location.assign(FF.page('play'));
  }

  function signOut() {
    FF.UI.confirm({
      title: 'Sign out of PlayMona?',
      body: 'You will need to sign in again to use the admin portal.',
      confirmLabel: 'Sign out',
      onConfirm: function () {
        Promise.resolve(FF.Auth.signOut()).then(function () { window.location.reload(); });
      }
    });
  }

  function openMenu(anchor) {
    var s = FF.Auth.user() || {};
    var menu = el('div', { class: 'acct-menu admin-acct-menu', id: 'admin-account-menu' });

    var head = FF.ui.div('acct-menu__head');
    var ava = FF.ui.div('acct-menu__ava');
    if (s.avatar && FF.Avatars) ava.appendChild(FF.Avatars.img(s.avatar, 'acct-menu__img'));
    head.appendChild(ava);
    var who = FF.ui.div('acct-menu__who');
    who.appendChild(el('strong', { class: 'acct-menu__name' }, s.displayName || 'Admin'));
    if (s.email) who.appendChild(FF.ui.span('acct-menu__user', s.email));
    else if (s.username) who.appendChild(FF.ui.span('acct-menu__user', '@' + s.username));
    head.appendChild(who);
    menu.appendChild(head);

    var list = el('div', { class: 'acct-menu__list', role: 'menu', 'aria-label': 'Account' });
    function item(iconKey, label, onClick, opts) {
      opts = opts || {};
      var b = el('button', { type: 'button', class: 'acct-menu__item' + (opts.cls ? ' ' + opts.cls : ''), role: opts.role || 'menuitem' });
      if (opts.checked != null) b.setAttribute('aria-checked', opts.checked ? 'true' : 'false');
      b.appendChild(FF.Icons.icon(iconKey));
      b.appendChild(FF.ui.span('acct-menu__label', label));
      if (opts.switch) b.appendChild(FF.ui.span('acct-menu__switch'));
      b.addEventListener('click', function () {
        if (!opts.keepOpen) closeMenu();
        onClick(b);
      });
      list.appendChild(b);
      return b;
    }
    function divider() { list.appendChild(el('div', { class: 'acct-menu__sep', role: 'separator' })); }

    item('play', 'Open app', function () { window.location.assign(FF.page('play')); });
    item('user', 'My profile', openProfile);
    divider();
    var dark = FF.Theme.resolvedTheme() === 'dark';
    item(dark ? 'moon' : 'sun', 'Dark mode', function (b) {
      var nowDark = FF.Theme.resolvedTheme() !== 'dark';
      FF.Theme.setTheme(nowDark ? 'dark' : 'light');
      b.setAttribute('aria-checked', nowDark ? 'true' : 'false');
      var ic = b.querySelector('.icon-svg');
      if (ic) b.replaceChild(FF.Icons.icon(nowDark ? 'moon' : 'sun'), ic);
    }, { role: 'menuitemcheckbox', checked: dark, keepOpen: true, switch: true, cls: 'acct-menu__item--toggle' });
    divider();
    item('sign-out', 'Sign out', signOut, { cls: 'acct-menu__item--danger' });
    menu.appendChild(list);

    document.body.appendChild(menu);
    anchor.setAttribute('aria-expanded', 'true');

    // Under the avatar, right-aligned with it.
    var r = anchor.getBoundingClientRect();
    menu.style.top = Math.round(r.bottom + 8) + 'px';
    menu.style.right = Math.max(12, Math.round(window.innerWidth - r.right)) + 'px';

    var items = function () { return FF.ui.$$('.acct-menu__item', menu); };
    menu.addEventListener('keydown', function (e) {
      var all = items();
      var i = all.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); return; }
      if (e.key === 'Tab') { closeMenu(); return; }
      var next = null;
      if (e.key === 'ArrowDown') next = all[(i + 1) % all.length];
      else if (e.key === 'ArrowUp') next = all[(i - 1 + all.length) % all.length];
      else if (e.key === 'Home') next = all[0];
      else if (e.key === 'End') next = all[all.length - 1];
      if (next) { e.preventDefault(); next.focus(); }
    });
    var outside = function (e) { if (!menu.contains(e.target) && !anchor.contains(e.target)) closeMenu(); };
    var onResize = function () { closeMenu(); };
    setTimeout(function () { document.addEventListener('pointerdown', outside, true); }, 0);
    window.addEventListener('resize', onResize);
    menu._cleanup = function () {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('resize', onResize);
    };
    var first = items()[0];
    if (first) setTimeout(function () { try { first.focus({ preventScroll: true }); } catch (e) {} }, 0);
  }

  // Fills the header's right side: name (wide screens), "Open app", avatar button.
  function account(box) {
    FF.ui.clear(box);
    var s = FF.Auth.user() || {};
    box.appendChild(el('span', { class: 'admin-me__name' }, s.displayName || ''));
    var app = el('a', { class: 'btn btn-sm btn-ghost admin-me__app', href: FF.page('play') });
    app.appendChild(FF.Icons.icon('play'));
    app.appendChild(FF.ui.span('', 'Open app'));
    box.appendChild(app);
    var b = el('button', {
      type: 'button', class: 'account-chip admin-me__chip', id: 'admin-account',
      'aria-label': 'Account menu: ' + (s.displayName || 'admin'),
      'aria-haspopup': 'menu', 'aria-expanded': 'false'
    });
    if (s.avatar && FF.Avatars) b.appendChild(FF.Avatars.img(s.avatar, 'account-chip__ava'));
    else b.appendChild(FF.Icons.icon('user'));
    b.addEventListener('click', function () {
      if (document.getElementById('admin-account-menu')) closeMenu();
      else openMenu(b);
    });
    box.appendChild(b);
  }

  /* ---------- Section navigation ---------- */

  function link(p, cur, cls) {
    var a = el('a', { class: cls + (p.id === cur ? ' is-active' : ''), href: '#' + p.id });
    if (p.id === cur) a.setAttribute('aria-current', 'page');
    return a;
  }

  // Header tabs (tablets and computers): every section.
  function topNav(n, pages, cur) {
    FF.ui.clear(n);
    n.hidden = false;
    pages.forEach(function (p) {
      var a = link(p, cur, 'admin-nav__item');
      a.appendChild(FF.Icons.icon(p.icon));
      a.appendChild(FF.ui.span('', p.label));
      n.appendChild(a);
    });
    var active = n.querySelector('.is-active');
    if (active && active.scrollIntoView) {
      try { active.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {}
    }
  }

  function tabItem(node, iconKey, label) {
    var ic = FF.ui.span('tabbar__icon');
    ic.appendChild(FF.Icons.icon(iconKey));
    node.appendChild(ic);
    node.appendChild(FF.ui.span('tabbar__label', label));
    return node;
  }

  function openMore(rest, cur) {
    var body = el('nav', { class: 'admin-more', 'aria-label': 'More sections' });
    var sheet;
    rest.forEach(function (p) {
      var a = link(p, cur, 'admin-more__item');
      a.appendChild(FF.Icons.icon(p.icon));
      a.appendChild(FF.ui.span('', p.label));
      a.addEventListener('click', function () { if (sheet) sheet.close(); });
      body.appendChild(a);
    });
    sheet = FF.UI.sheet({ title: 'More', body: body });
  }

  // Bottom bar (phones). More than five sections: four plus "More".
  function tabBar(pages, cur) {
    var bar = document.getElementById('admin-tabbar');
    if (!bar) {
      bar = el('nav', { class: 'tabbar admin-tabbar', id: 'admin-tabbar', 'aria-label': 'Admin sections' });
      document.body.appendChild(bar);
      document.body.classList.add('has-admin-tabbar');
    }
    FF.ui.clear(bar);
    var shown = pages.length > MAX_TABS ? pages.slice(0, MAX_TABS - 1) : pages;
    var rest = pages.slice(shown.length);
    shown.forEach(function (p) {
      bar.appendChild(tabItem(link(p, cur, 'tabbar__item'), p.icon, p.short || p.label));
    });
    if (rest.length) {
      var inRest = rest.some(function (p) { return p.id === cur; });
      var more = el('button', { type: 'button', class: 'tabbar__item' + (inRest ? ' is-active' : ''), 'aria-haspopup': 'dialog' });
      if (inRest) more.setAttribute('aria-current', 'page');
      tabItem(more, 'squares-four', 'More');
      more.addEventListener('click', function () { openMore(rest, cur); });
      bar.appendChild(more);
    }
  }

  function nav(pages, cur) {
    closeMenu();
    topNav(document.getElementById('admin-nav'), pages, cur);
    tabBar(pages, cur);
  }

  FF.AdminShell = { account: account, nav: nav, closeMenu: closeMenu };
})();
