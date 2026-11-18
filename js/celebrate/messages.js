/* PlayMona Celebrations: the organiser's Wall tab (FF.CelebrateMessages.tab(panel, ev, update)).
   Messages waiting to be read, approve / not show / delete, reports from guests, the real name
   behind an anonymous message (only the organiser sees it), and the celebrant's private link
   with the memory book. PHP API only. Classic script, ES2017 or older. */
window.FF = window.FF || {};
(function () {
  'use strict';

  var C = function () { return FF.Celebrate; };
  var W = function () { return FF.CelebrateWall; };
  function t(k, f, v) { return FF.t(k, f, v); }
  function el(tag, attrs, kids) { return FF.ui.el(tag, attrs, kids); }
  function div(cls, kids) { return FF.ui.div(cls, kids); }
  function icon(k) { return FF.Icons.icon(k); }

  var FILTERS = [
    ['pending', ['celWallWaiting', 'To read']],
    ['approved', ['celWallShown', 'On the wall']],
    ['rejected', ['celWallHidden', 'Not shown']],
    ['all', ['celWallAll', 'All']]
  ];
  var filter = 'pending';

  function tab(panel, ev, update) {
    panel.appendChild(linkCard(ev, update));
    var box = div('cel-wall');
    panel.appendChild(box);
    box.appendChild(FF.UI.loading(t('loading', 'Loading…')));
    var data = null, last = '';

    function load() {
      return FF.Api.call('GET', '/c/' + ev.id + '/messages').then(function (r) {
        var key = JSON.stringify([r.counts, r.messages.map(function (m) { return [m.id, m.status, m.reports]; })]);
        data = r;
        if (key !== last) { last = key; draw(); }
      }, function (e) {
        FF.ui.clear(box);
        box.appendChild(FF.UI.emptyState({ icon: 'alert', title: t('celLoadFailed', 'That did not load'), text: e.message,
          action: { label: t('tryAgain', 'Try again'), icon: 'restart', onClick: load } }));
      });
    }

    function act(m, action, done) {
      return FF.Api.call('POST', '/c/' + ev.id + '/messages/' + m.id + '/' + action, {}).then(function (r) {
        data = r;
        last = '';
        draw();
        if (done) FF.UI.toast(done);
      }, function (e) { FF.UI.toast(e.message); });
    }

    function draw() {
      FF.ui.clear(box);
      var head = div('cel-games__head');
      head.appendChild(el('h2', { class: 'cel-section-title' }, t('celWallTitle', 'Wall of Love')));
      box.appendChild(head);
      box.appendChild(el('p', { class: 'hint' }, ev.settings.approveMessages
        ? t('celWallApproveOn', 'Guests\' messages wait here until you put them on the wall. You can change this in Settings.')
        : t('celWallApproveOff', 'Messages go on the wall as soon as guests send them. You can still take any message off. Turn on checking in Settings.')));
      var c = data.counts;
      box.appendChild(FF.UI.segmented({
        label: t('celWallShow', 'Show'), value: filter, compact: true,
        options: FILTERS.map(function (f) {
          var n = f[0] === 'all' ? c.pending + c.approved + c.rejected : c[f[0]];
          return { label: C().label(f[1]) + ' (' + n + ')', value: f[0] };
        }),
        onChange: function (v) { filter = v; draw(); }
      }));
      var list = data.messages.filter(function (m) { return filter === 'all' || m.status === filter; });
      if (!list.length) {
        box.appendChild(el('p', { class: 'cel-wall__empty' }, filter === 'pending'
          ? t('celWallNothingToRead', 'Nothing to read right now. New messages appear here.')
          : t('celWallNoneHere', 'No messages here.')));
        return;
      }
      var ul = el('ul', { class: 'cel-msgs' });
      list.forEach(function (m) { ul.appendChild(row(m)); });
      box.appendChild(ul);
    }

    function row(m) {
      var cat = W().category(m.category);
      var li = el('li', { class: 'cel-msg is-' + m.status });
      var top = div('cel-msg__top');
      var tag = el('span', { class: 'cel-msg__tag' });
      tag.appendChild(icon(cat.icon));
      tag.appendChild(FF.ui.span('', W().label(cat.label)));
      top.appendChild(tag);
      if (filter === 'all') top.appendChild(el('span', { class: 'cel-status cel-status--' + (m.status === 'approved' ? 'published' : m.status) }, C().label(FILTERS.filter(function (f) { return f[0] === m.status; })[0][1])));
      if (m.reports) top.appendChild(el('span', { class: 'cel-msg__reports' }, t(m.reports === 1 ? 'celWallReportOne' : 'celWallReportMany', m.reports === 1 ? 'Reported by 1 guest' : 'Reported by {n} guests', { n: m.reports })));
      if (m.favourite) top.appendChild(el('span', { class: 'cel-msg__fav', title: t('celWallFavOf', 'A favourite of {name}', { name: ev.celebrantName }) }, '♥'));
      li.appendChild(top);
      li.appendChild(el('p', { class: 'cel-msg__body' }, m.body));
      if (m.photo) {
        var a = el('a', { href: m.photo.full, target: '_blank', rel: 'noopener', class: 'cel-msg__photo' });
        a.appendChild(el('img', { src: m.photo.thumb, alt: t('celMsgPhotoBy', 'Photo from {name}', { name: m.name }), loading: 'lazy' }));
        li.appendChild(a);
      }
      li.appendChild(el('p', { class: 'cel-msg__by' }, m.anonymous
        ? t('celWallAnonBy', 'Sent without a name, by {name} (only you see this)', { name: m.name })
        : '— ' + m.name + ' · ' + W().when(m.createdAt)));
      var acts = div('cel-msg__acts');
      if (m.status !== 'approved') acts.appendChild(FF.UI.button(t('celWallApprove', 'Put on the wall'), { class: 'btn-primary btn-sm', icon: 'check', onClick: function () { act(m, 'approve'); } }));
      if (m.status !== 'rejected') acts.appendChild(FF.UI.button(m.status === 'approved' ? t('celWallTakeOff', 'Take off the wall') : t('celWallReject', 'Do not show'), { class: 'btn-secondary btn-sm', icon: 'eye-slash', onClick: function () { act(m, 'reject'); } }));
      acts.appendChild(FF.UI.button(t('delete', 'Delete'), { class: 'btn-ghost btn-sm', icon: 'trash', onClick: function () {
        FF.UI.confirm({
          title: t('celWallDeleteTitle', 'Delete this message?'),
          body: t('celWallDeleteText', 'It is gone for good, with its photo, and leaves the memory book. "Do not show" keeps it out of sight instead.'),
          confirmLabel: t('delete', 'Delete'), danger: true,
          onConfirm: function () { act(m, 'delete', t('celWallDeleted', 'Message deleted')); }
        });
      } }));
      li.appendChild(acts);
      return li;
    }

    load();
    var poll = setInterval(function () {
      if (!box.isConnected) { clearInterval(poll); return; }
      if (!document.hidden && !document.querySelector('.ff-dialog')) load();
    }, 15000);
  }

  /* The celebrant's private link and the memory book. */
  function linkCard(ev, update) {
    var card = el('section', { class: 'cel-linkcard' });
    var head = div('cel-linkcard__head');
    head.appendChild(icon('gift'));
    head.appendChild(el('h2', { class: 'cel-section-title' }, t('celForLinkTitle', '{name}\'s private link', { name: ev.celebrantName })));
    card.appendChild(head);
    card.appendChild(el('p', { class: 'hint' }, t('celForLinkText', 'This opens every message on the wall, with the photos, and makes the memory book. Give it to {name} only: anyone with the link can read the messages.', { name: ev.celebrantName })));
    var url = C().privateUrl(ev.slug, 'celebrant', ev.tokens.celebrant);
    var acts = div('cel-linkcard__acts');
    acts.appendChild(FF.UI.button(t('celCopyLink', 'Copy link'), { class: 'btn-secondary btn-sm', icon: 'copy', onClick: function () { C().copy(url, t('celLinkCopied', 'Link copied')); } }));
    acts.appendChild(FF.UI.button(t('celForOpen', 'Open'), { class: 'btn-ghost btn-sm', icon: 'arrows-out', onClick: function () { window.open(url, '_blank', 'noopener'); } }));
    acts.appendChild(FF.UI.button(t('celForBookOpen', 'Memory book'), { class: 'btn-ghost btn-sm', icon: 'book-open', onClick: function () { window.open(url + '&view=book', '_blank', 'noopener'); } }));
    acts.appendChild(FF.UI.button(t('celNewLink', 'Make a new link'), { class: 'btn-ghost btn-sm', icon: 'restart', onClick: function () {
      FF.UI.confirm({
        title: t('celNewLinkTitle', 'Make a new private link?'),
        body: t('celNewLinkText', 'The old link stops working at once. Use this if the link reached the wrong person.'),
        confirmLabel: t('celNewLink', 'Make a new link'),
        onConfirm: function () {
          update(FF.Api.call('POST', '/c/' + ev.id + '/links/celebrant/regenerate', {})).then(function () {
            FF.UI.toast(t('celNewLinkDone', 'New link made. The old one no longer works.'));
          }, function () {});
        }
      });
    } }));
    card.appendChild(acts);
    return card;
  }

  FF.CelebrateMessages = { tab: tab };
})();
