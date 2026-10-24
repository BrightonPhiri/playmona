/* ============================================================
   PLAYMONA — admin/admin.js
   Boots the admin portal (playmona.com/admin): signs in with the
   PlayMona account already on this device, checks it is an admin,
   then shows the pages in js/admin/pages.js.

   Making someone an admin (once, by hand): Firebase console →
   Realtime Database → add  admins / <their uid> : true
   Everyone else just sees "No access". To find a new admin's uid,
   they open /admin#setup while signed in.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var PAGES = [
    { id: 'overview', label: 'Overview', icon: 'chart-line' },
    { id: 'games', label: 'Games', icon: 'game-controller' },
    { id: 'users', label: 'Players', icon: 'users' },
    { id: 'finance', label: 'Finances', icon: 'stack' },
    { id: 'rooms', label: 'Live rooms', icon: 'wifi' },
    { id: 'site', label: 'Site', icon: 'gear' }
  ];

  var el = function (tag, attrs, kids) { return FF.ui.el(tag, attrs, kids); };
  function main() { return document.getElementById('admin-main'); }

  function message(title, body, actions) {
    var m = FF.ui.clear(main());
    var box = el('section', { class: 'locked-panel' });
    var ic = FF.ui.span('locked-panel__icon');
    ic.appendChild(FF.Icons.icon('shield'));
    box.appendChild(ic);
    box.appendChild(el('h1', { class: 'page-title' }, title));
    if (typeof body === 'string') box.appendChild(el('p', { class: 'page-sub' }, body));
    else if (body) box.appendChild(body);
    if (actions) box.appendChild(el('div', { class: 'btn-stack locked-panel__actions' }, actions));
    m.appendChild(box);
  }

  function signInLink() {
    var a = el('a', { class: 'btn btn-lg btn-primary', href: FF.page('play') });
    a.appendChild(FF.Icons.icon('arrow-right'));
    a.appendChild(FF.ui.span('', 'Sign in to PlayMona'));
    return a;
  }

  // What a signed-in non-admin sees: nothing about how admin works.
  function noAccess() {
    var home = el('a', { class: 'btn btn-lg btn-primary', href: FF.page('play') });
    home.appendChild(FF.Icons.icon('arrow-right'));
    home.appendChild(FF.ui.span('', 'Go to PlayMona'));
    message('No access', 'This page is not available for your account.', [home]);
  }

  // /admin#setup: shows the account id to add as an admin in the Firebase console.
  function notAdmin() {
    var uid = FF.AdminData.uid() || '';
    var body = el('div', {});
    body.appendChild(el('p', { class: 'page-sub' }, 'This account is not an admin. To make it one, open the Firebase console → Realtime Database, and add admins → this account id → true.'));
    var code = el('input', { class: 'input admin-uid', readonly: true, value: uid, 'aria-label': 'Account id' });
    code.addEventListener('focus', function () { code.select(); });
    body.appendChild(code);
    message('Admins only', body, [
      FF.UI.button('Copy account id', { class: 'btn-lg', icon: 'copy', onClick: function () {
        try { navigator.clipboard.writeText(uid).then(function () { FF.UI.toast('Copied'); }); } catch (e) { code.focus(); }
      } }),
      FF.UI.button('Check again', { class: 'btn-lg btn-primary', icon: 'arrow-right', onClick: function () { window.location.reload(); } })
    ]);
  }

  function me() {
    var box = FF.ui.clear(document.getElementById('admin-me'));
    var s = FF.Auth.user() || {};
    if (s.avatar && FF.Avatars) box.appendChild(FF.Avatars.img(s.avatar, 'admin-me__ava'));
    box.appendChild(el('span', { class: 'admin-me__name' }, s.displayName || ''));
    var app = el('a', { class: 'btn btn-sm btn-ghost', href: FF.page('play') }, 'Open app');
    box.appendChild(app);
  }

  function current() {
    var id = (window.location.hash || '').replace('#', '');
    return PAGES.some(function (p) { return p.id === id; }) ? id : 'overview';
  }

  function nav() {
    var n = FF.ui.clear(document.getElementById('admin-nav'));
    n.hidden = false;
    var cur = current();
    PAGES.forEach(function (p) {
      var a = el('a', { class: 'admin-nav__item' + (p.id === cur ? ' is-active' : ''), href: '#' + p.id });
      if (p.id === cur) a.setAttribute('aria-current', 'page');
      a.appendChild(FF.Icons.icon(p.icon));
      a.appendChild(FF.ui.span('', p.label));
      n.appendChild(a);
    });
  }

  function show() {
    nav();
    var id = current();
    var m = FF.ui.clear(main());
    if (FF.AdminData.mode() === 'local') {
      m.appendChild(el('p', { class: 'notice notice--info admin-devnote' }, 'Test mode: showing this browser\'s own test data (device-only accounts), not the live site.'));
    }
    FF.safe(function () { FF.AdminPages[id](m); });
    var label = PAGES.filter(function (p) { return p.id === id; })[0].label;
    document.title = label + ' · Admin · PlayMona';
    m.focus({ preventScroll: true });
  }

  function boot() {
    FF.Storage.init();
    if (FF.i18n) FF.i18n.init();
    FF.Theme.init();
    FF.Auth.init().then(function () {
      return FF.AdminData.connect();
    }).then(function (result) {
      if (result === 'signed-out') {
        message('Sign in', 'Sign in to PlayMona to continue.', [signInLink()]);
        return;
      }
      if (result === 'not-admin') {
        if (window.location.hash === '#setup') notAdmin(); else noAccess();
        return;
      }
      me();
      // Admins count as active too, and get their own entry in the player list.
      if (FF.Track) FF.Track.seen();
      window.addEventListener('hashchange', show);
      show();
    }).catch(function () {
      message('Could not connect', 'Check the internet connection and try again.', [
        FF.UI.button('Try again', { class: 'btn-lg btn-primary', onClick: function () { window.location.reload(); } })
      ]);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
