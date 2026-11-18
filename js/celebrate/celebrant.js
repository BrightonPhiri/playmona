/* PlayMona Celebrations: the celebrant's private page, /c/<event>/for#k=<secret> (FF.CelebrantPage).
   Every approved message from the Wall of Love, with search, a filter by kind, favourites and
   the guests' photos to keep, plus the memory book (#k=...&view=book): a designed page the
   browser prints or saves as a PDF. The secret stays in the address's # part, so it never
   reaches a server log; it travels to the API in a header. Uses the PHP API only (no live
   Firebase connection). Classic script, ES2017 or older. */
window.FF = window.FF || {};
(function () {
  'use strict';

  var C = function () { return FF.Celebrate; };
  var W = function () { return FF.CelebrateWall; };
  function t(k, f, v) { return FF.t ? FF.t(k, f, v) : f; }
  function el(tag, attrs, kids) { return FF.ui.el(tag, attrs, kids); }
  function div(cls, kids) { return FF.ui.div(cls, kids); }
  function icon(k) { return FF.Icons.icon(k); }
  function toast(m) { if (FF.UI && FF.UI.toast) FF.UI.toast(m); }

  function hashParams() {
    var out = {};
    String(location.hash || '').replace(/^#/, '').split('&').forEach(function (kv) {
      var i = kv.indexOf('=');
      if (i > 0) out[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1));
    });
    return out;
  }
  function setView(view) {
    var p = hashParams();
    var h = '#k=' + encodeURIComponent(p.k || '') + (view === 'book' ? '&view=book' : '');
    try { history.replaceState(null, '', location.pathname + location.search + h); } catch (e) { /* fine */ }
  }

  function start(main, slug) {
    var key = hashParams().k || '';
    var st = { ev: null, id: null, messages: [], q: '', cat: 'all', favOnly: false,
      book: { photos: true, anonymous: true, favourites: false } };
    var headers = { 'x-celebration-key': key };
    function api(method, path, body) { return FF.Api.call(method, path, body, { noAuth: true, headers: headers }); }

    function plain(title, text) {
      FF.ui.clear(main);
      C().applyTheme(document.body, (st.ev && st.ev.theme) || { look: 'gala' });
      var c = el('section', { class: 'ev-card' });
      c.appendChild(el('h1', { class: 'ev-h1' }, title));
      if (text) c.appendChild(el('p', {}, text));
      main.appendChild(c);
    }

    if (key.length < 20) {
      plain(t('celForBroken', 'This link is not complete'), t('celForBrokenText', 'Open the whole link the organiser sent you. It ends with a long code after #k=.'));
      return;
    }
    main.appendChild(div('ev-loading', t('loading', 'Loading…')));
    api('GET', '/c/private?slug=' + encodeURIComponent(slug)).then(function (r) {
      if (r.role !== 'celebrant') {
        plain(t('celForWrongLink', 'This link opens another page'), t('celForWrongLinkText', 'Ask the organiser for your own link to read your messages.'));
        return null;
      }
      st.id = r.id;
      st.ev = r.event;
      C().applyTheme(document.body, st.ev.theme);
      document.title = t('celForTitle', 'Messages for {name}', { name: st.ev.celebrantName }) + ' · PlayMona';
      return load();
    }).catch(function (e) {
      plain(t('celForClosed', 'This link does not work'), e.message);
    });

    function load() {
      return api('GET', '/c/' + st.id + '/for').then(function (r) {
        st.ev = r.event;
        st.messages = r.messages || [];
        if (hashParams().view === 'book') book(); else read();
      });
    }

    /* ================= Reading ================= */

    function read() {
      setView('read');
      document.body.classList.remove('is-book');
      FF.ui.clear(main);
      var ev = st.ev;
      main.appendChild(C().hero(ev, { tag: 'h1' }));
      var n = st.messages.length;
      var intro = el('section', { class: 'ev-card ev-for__intro' });
      intro.appendChild(el('h2', {}, t('celForHello', 'Messages for you, {name}', { name: ev.celebrantName })));
      intro.appendChild(el('p', {}, n
        ? t(n === 1 ? 'celForCountOne' : 'celForCountMany', n === 1 ? '1 message from the people celebrating you.' : '{n} messages from the people celebrating you.', { n: n })
        : t('celForNone', 'No messages yet. They appear here once the organiser has read them, so come back later.')));
      if (n) {
        var bookBtn = el('button', { type: 'button', class: 'ev-btn' });
        bookBtn.appendChild(icon('book-open'));
        bookBtn.appendChild(FF.ui.span('', t('celForBook', 'Make my memory book')));
        bookBtn.addEventListener('click', function () { load().then(book); });
        intro.appendChild(bookBtn);
      }
      main.appendChild(intro);
      if (!n) return;

      // Search and filters
      var tools = el('section', { class: 'ev-for__tools', 'aria-label': t('celForFind', 'Find messages') });
      var search = el('input', { type: 'search', class: 'input', placeholder: t('celForSearch', 'Search the messages'), 'aria-label': t('celForSearch', 'Search the messages') });
      search.value = st.q;
      tools.appendChild(search);
      var chips = el('div', { class: 'ev-cats', role: 'group', 'aria-label': t('celForFilter', 'Show') });
      var counts = { all: n, fav: 0 };
      st.messages.forEach(function (m) { counts[m.category] = (counts[m.category] || 0) + 1; if (m.favourite) counts.fav++; });
      function chip(id, text, ic) {
        var b = el('button', { type: 'button', class: 'ev-cat', 'aria-pressed': (id === 'fav' ? st.favOnly : (!st.favOnly && st.cat === id)) ? 'true' : 'false' });
        if (ic) b.appendChild(icon(ic));
        var label = FF.ui.span('', text + ' (' + (counts[id] || 0) + ')');
        b.appendChild(label);
        if (id === 'fav') {
          // A heart tapped on a card updates this count straight away.
          st.onFav = function () {
            var f = st.messages.filter(function (m) { return m.favourite; }).length;
            label.textContent = text + ' (' + f + ')';
            if (st.favOnly) fill();
          };
        }
        b.addEventListener('click', function () {
          if (id === 'fav') { st.favOnly = !st.favOnly; st.cat = 'all'; } else { st.cat = id; st.favOnly = false; }
          read();
        });
        chips.appendChild(b);
      }
      chip('all', t('celForAll', 'All'));
      W().CATEGORIES.forEach(function (c) { if (counts[c.id]) chip(c.id, W().label(c.label), c.icon); });
      chip('fav', t('celForFavs', 'Favourites'), 'heart');
      tools.appendChild(chips);
      main.appendChild(tools);

      var ul = el('ul', { class: 'ev-msgs ev-for__list', 'aria-live': 'polite' });
      main.appendChild(ul);
      var shown = el('p', { class: 'ev-note ev-center' });
      main.appendChild(shown);
      function fill() {
        FF.ui.clear(ul);
        var q = st.q.trim().toLowerCase();
        var list = st.messages.filter(function (m) {
          if (st.favOnly && !m.favourite) return false;
          if (st.cat !== 'all' && m.category !== st.cat) return false;
          return !q || (m.body + ' ' + (m.name || '')).toLowerCase().indexOf(q) !== -1;
        });
        list.forEach(function (m) { ul.appendChild(card(m)); });
        shown.textContent = list.length === n ? '' : t('celForShown', 'Showing {n} of {total}', { n: list.length, total: n });
        if (!list.length) shown.textContent = st.favOnly ? t('celForNoFavs', 'Tap the heart on a message to keep it in your favourites.') : t('celForNoMatch', 'No messages match.');
      }
      search.addEventListener('input', function () { st.q = search.value; fill(); });
      fill();
    }

    function card(m) {
      var cat = W().category(m.category);
      var li = el('li', { class: 'ev-msg ev-for__msg' + (m.favourite ? ' is-fav' : '') });
      var top = div('ev-msg__top');
      var tag = el('span', { class: 'ev-msg__tag' });
      tag.appendChild(icon(cat.icon));
      tag.appendChild(FF.ui.span('', W().label(cat.label)));
      top.appendChild(tag);
      var fav = el('button', { type: 'button', class: 'ev-fav', 'aria-pressed': m.favourite ? 'true' : 'false', 'aria-label': t('celForFav', 'Favourite') });
      fav.appendChild(icon(m.favourite ? 'heart-fill' : 'heart'));
      fav.addEventListener('click', function () {
        var on = !m.favourite;
        fav.disabled = true;
        api('POST', '/c/' + st.id + '/for/' + m.id + '/favourite', { on: on }).then(function () {
          m.favourite = on;
          fav.disabled = false;
          fav.setAttribute('aria-pressed', on ? 'true' : 'false');
          FF.ui.clear(fav);
          fav.appendChild(icon(on ? 'heart-fill' : 'heart'));
          li.classList.toggle('is-fav', on);
          if (st.onFav) st.onFav();
        }, function (e) { fav.disabled = false; toast(e.message); });
      });
      top.appendChild(fav);
      li.appendChild(top);
      li.appendChild(el('p', { class: 'ev-msg__body' }, m.body));
      if (m.photo) {
        var pb = el('button', { type: 'button', class: 'ev-for__photo', 'aria-label': t('celForPhotoOpen', 'Open the photo from {name}', { name: W().byline(m) }) });
        pb.appendChild(el('img', { src: m.photo.play, alt: '', loading: 'lazy' }));
        pb.addEventListener('click', function () { openPhoto(m); });
        li.appendChild(pb);
      }
      var foot = div('ev-msg__foot');
      foot.appendChild(el('span', { class: 'ev-msg__by' }, '— ' + W().byline(m)));
      foot.appendChild(el('span', { class: 'ev-note' }, W().when(m.createdAt)));
      li.appendChild(foot);
      return li;
    }

    function openPhoto(m) {
      var body = div('ev-for__big');
      body.appendChild(el('img', { src: m.photo.play, alt: t('celMsgPhotoBy', 'Photo from {name}', { name: W().byline(m) }) }));
      var dl = el('a', { class: 'ev-btn', href: m.photo.full, download: 'photo-from-' + String(m.name || 'a-guest').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.jpg' });
      dl.appendChild(icon('download'));
      dl.appendChild(FF.ui.span('', t('celForDownload', 'Save the photo')));
      body.appendChild(dl);
      FF.UI.dialog({ title: t('celForPhotoFrom', 'From {name}', { name: W().byline(m) }), body: body, wide: true, className: 'ev-dialog' });
    }

    /* ================= The memory book ================= */

    function book() {
      setView('book');
      document.body.classList.add('is-book');
      FF.ui.clear(main);
      var ev = st.ev;
      var o = st.book;

      var tools = el('section', { class: 'ev-card book-tools', 'aria-label': t('celBookTools', 'Memory book options') });
      var back = el('button', { type: 'button', class: 'ev-linklike' });
      back.appendChild(icon('arrow-left'));
      back.appendChild(FF.ui.span('', t('celBookBack', 'Back to my messages')));
      back.addEventListener('click', read);
      tools.appendChild(back);
      tools.appendChild(el('h2', {}, t('celBookTitle', 'Your memory book')));
      tools.appendChild(el('p', {}, t('celBookLead', 'Every message from your guests, made into a book. It includes new messages each time you open it.')));
      [['photos', t('celBookPhotos', 'Include photos')], ['anonymous', t('celBookAnon', 'Include messages sent without a name')], ['favourites', t('celBookFavs', 'Only my favourites')]].forEach(function (s) {
        tools.appendChild(FF.UI.switchRow({ label: s[1], checked: !!o[s[0]], onChange: function (on) { o[s[0]] = on; paint(); } }));
      });
      var save = el('button', { type: 'button', class: 'ev-btn' });
      save.appendChild(icon('download'));
      save.appendChild(FF.ui.span('', t('celBookSave', 'Save as PDF or print')));
      save.addEventListener('click', function () { window.print(); });
      tools.appendChild(save);
      tools.appendChild(el('p', { class: 'ev-note' }, t('celBookHow', 'In the window that opens, choose "Save as PDF" as the printer to keep a copy.')));
      main.appendChild(tools);

      var pages = el('article', { class: 'book', 'aria-label': t('celBookTitle', 'Your memory book') });
      main.appendChild(pages);

      function paint() {
        FF.ui.clear(pages);
        var list = st.messages.filter(function (m) {
          if (o.favourites && !m.favourite) return false;
          if (!o.anonymous && m.anonymous) return false;
          return true;
        });
        // Cover
        var cover = el('section', { class: 'book__page book__cover' });
        if (ev.cover) cover.appendChild(el('img', { class: 'book__coverimg', src: ev.cover.play, alt: '' }));
        cover.appendChild(el('p', { class: 'book__kicker' }, t('celBookFor', 'A memory book for')));
        cover.appendChild(el('h1', { class: 'book__name' }, ev.celebrantName));
        cover.appendChild(el('p', { class: 'book__event' }, ev.title));
        var facts = [C().formatDate(ev.date), ev.venue].filter(Boolean).join(' · ');
        if (facts) cover.appendChild(el('p', { class: 'book__facts' }, facts));
        pages.appendChild(cover);
        // Introduction
        var intro = el('section', { class: 'book__page book__intro' });
        intro.appendChild(el('h2', {}, t('celBookIntroTitle', 'With love')));
        intro.appendChild(el('p', {}, list.length
          ? t(list.length === 1 ? 'celBookIntroOne' : 'celBookIntroMany', list.length === 1 ? 'One message from someone who celebrated with you.' : '{n} messages from the people who celebrated with you.', { n: list.length })
          : t('celBookIntroNone', 'No messages match these choices yet.')));
        if (ev.description) intro.appendChild(el('p', { class: 'book__quote' }, ev.description));
        pages.appendChild(intro);
        // A part for each kind of message
        W().CATEGORIES.forEach(function (c) {
          var items = list.filter(function (m) { return m.category === c.id; });
          if (!items.length) return;
          var part = el('section', { class: 'book__part' });
          var h = el('h2', { class: 'book__parttitle' });
          h.appendChild(icon(c.icon));
          h.appendChild(FF.ui.span('', bookTitle(c.id)));
          part.appendChild(h);
          items.forEach(function (m) {
            var fig = el('figure', { class: 'book__msg' + (o.photos && m.photo ? ' has-photo' : '') });
            if (o.photos && m.photo) fig.appendChild(el('img', { class: 'book__photo', src: m.photo.play, alt: t('celMsgPhotoBy', 'Photo from {name}', { name: W().byline(m) }) }));
            var cap = el('figcaption', {});
            cap.appendChild(el('p', { class: 'book__body' }, m.body));
            cap.appendChild(el('p', { class: 'book__by' }, '— ' + W().byline(m)));
            fig.appendChild(cap);
            part.appendChild(fig);
          });
          pages.appendChild(part);
        });
        // Closing
        var end = el('section', { class: 'book__page book__end' });
        end.appendChild(icon('heart'));
        end.appendChild(el('p', {}, t('celBookEnd', 'Made with love by everyone at {title}.', { title: ev.title })));
        end.appendChild(el('p', { class: 'book__made' }, t('celBookMade', 'Made with PlayMona Celebrations')));
        pages.appendChild(end);
      }
      paint();
      window.scrollTo(0, 0);
    }

    function bookTitle(id) {
      return ({
        wish: t('celBookWishes', 'Wishes for you'),
        memory: t('celBookMemories', 'Memories we share'),
        advice: t('celBookAdvice', 'Words of wisdom'),
        thanks: t('celBookThanks', 'Thank you'),
        funny: t('celBookFunny', 'The funny stories')
      })[id] || id;
    }
  }

  FF.CelebrantPage = { start: start, _hash: hashParams };
})();
