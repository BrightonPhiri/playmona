/* PlayMona Celebrations: opening the TV display and the MC panel (FF.CelebrateStage).
     /c/<event>/tv#k=<secret>   the TV display (FF.CelebrateTV)
     /c/<event>/mc#k=<secret>   the MC panel (FF.CelebrateMC)
   The secret stays after "#" (never sent to a server log) and travels to the API in a header.
   Both pages sign in anonymously: the API lets that sign-in read the game being played.

     FF.CelebrateStage.open(slug, roles) -> Promise of { id, role, event, api(method, path, body) }
     FF.CelebrateStage.connect(cid)      -> Promise of the live transport for celebrations/<cid>
     FF.CelebrateStage.joinUrl(ev, join) the address guests open (with the code if private)
     FF.CelebrateStage.plain(main, title, text)
   Classic script, ES2017 or older. */
window.FF = window.FF || {};
(function () {
  'use strict';

  function t(k, f, v) { return FF.t ? FF.t(k, f, v) : f; }
  function el(tag, attrs, kids) { return FF.ui.el(tag, attrs, kids); }

  function key() {
    var m = /[#&]k=([^&]+)/.exec(location.hash || '');
    return m ? decodeURIComponent(m[1]) : '';
  }

  function fail(message, code) {
    var e = new Error(message);
    e.code = code;
    return e;
  }

  function open(slug, roles) {
    var k = key();
    if (k.length < 20) return Promise.reject(fail(t('celForBrokenText', 'Open the whole link the organiser sent you. It ends with a long code after #k=.'), 'short-key'));
    var headers = { 'x-celebration-key': k };
    function api(method, path, body) { return FF.Api.call(method, path, body, { guest: true, headers: headers }); }
    return api('GET', '/c/private?slug=' + encodeURIComponent(slug)).then(function (r) {
      if (roles.indexOf(r.role) === -1) throw fail(t('celStageWrongLink', 'This link opens another page. Ask the organiser for the right one.'), 'wrong-role');
      return { id: r.id, role: r.role, event: r.event, api: api, upload: function (path, blob) { return FF.Api.upload(path, blob, { guest: true, headers: headers }); } };
    });
  }

  function connect(cid) { return FF.Transport.open('celebrations/' + cid); }

  function joinUrl(ev, join) {
    return FF.Celebrate.eventUrl(ev.slug) + (join && join.private ? '?code=' + join.code : '');
  }

  /* "playmona.com/c/vicky-birthday": the address without https:// for reading off a screen. */
  function shortUrl(ev) { return FF.Celebrate.eventUrl(ev.slug).replace(/^https?:\/\//, ''); }

  function plain(main, title, text) {
    FF.ui.clear(main);
    var c = el('section', { class: 'ev-card' });
    c.appendChild(el('h1', { class: 'ev-h1' }, title));
    if (text) c.appendChild(el('p', {}, text));
    main.appendChild(c);
  }

  function team(ev, id) {
    var found = null;
    (ev.teams || []).forEach(function (tm) { if (tm.id === id) found = tm; });
    return found;
  }

  FF.CelebrateStage = { open: open, connect: connect, joinUrl: joinUrl, shortUrl: shortUrl, plain: plain, team: team, key: key };
})();
