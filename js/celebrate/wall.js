/* PlayMona Celebrations: the Wall of Love on a guest's event page (FF.CelebrateWall).
     FF.CelebrateWall.mount(host, { ev, me })   the Wall card: write a message (with a photo),
                                                 your messages and their status, the wall itself
     FF.CelebrateWall.CATEGORIES / category(id) / byline(msg, celebrantName)   shared with the
                                                 organiser's and the celebrant's screens
   Everything goes through the PHP API: writing a message needs no live Firebase connection.
   The page redraws itself often (teams, games), so a half-written message is kept here, outside
   the card, and in this phone's storage until it is sent. Classic script, ES2017 or older. */
window.FF = window.FF || {};
(function () {
  'use strict';

  var C = function () { return FF.Celebrate; };
  function t(k, f, v) { return FF.t ? FF.t(k, f, v) : f; }
  function el(tag, attrs, kids) { return FF.ui.el(tag, attrs, kids); }
  function div(cls, kids) { return FF.ui.div(cls, kids); }
  function toast(m) { if (FF.UI && FF.UI.toast) FF.UI.toast(m); }

  var MAX = 1000;
  var CATEGORIES = [
    { id: 'wish', icon: 'sparkle', label: ['celCatWish', 'A wish'], prompt: ['celPromptWish', 'What do you wish for {name} in the year ahead?'] },
    { id: 'memory', icon: 'heart', label: ['celCatMemory', 'A memory'], prompt: ['celPromptMemory', 'Tell {name} about a moment with them you will never forget.'] },
    { id: 'advice', icon: 'lightbulb', label: ['celCatAdvice', 'Advice'], prompt: ['celPromptAdvice', 'What advice would you give {name} for what comes next?'] },
    { id: 'thanks', icon: 'gift', label: ['celCatThanks', 'Thank you'], prompt: ['celPromptThanks', 'What would you like to thank {name} for?'] },
    { id: 'funny', icon: 'confetti', label: ['celCatFunny', 'Something funny'], prompt: ['celPromptFunny', 'Share a story about {name} that still makes you laugh.'] }
  ];
  function category(id) {
    for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].id === id) return CATEGORIES[i];
    return CATEGORIES[0];
  }
  function label(pair, vars) { return t(pair[0], pair[1], vars); }
  function byline(m) { return m.name ? m.name : t('celAnonymous', 'Someone who loves you'); }
  function when(ms) {
    try { return new Date(ms).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; }
  }

  /* One wall per event and guest: what was loaded, and the message being written. */
  var states = {};
  function stateFor(ev, me) {
    var key = ev.id + ':' + me.uid;
    if (!states[key]) {
      states[key] = { data: null, loadedAt: 0, loading: null, open: false, showWall: false, draft: loadDraft(key, me), key: key };
    }
    return states[key];
  }
  function loadDraft(key, me) {
    var d = null;
    try { d = JSON.parse(localStorage.getItem('playmona:cel:draft:' + key) || 'null'); } catch (e) { d = null; }
    return d && typeof d === 'object' ? d : { category: 'wish', body: '', name: me.name, anonymous: false, photo: null };
  }
  function saveDraft(s) {
    try {
      if (s.draft.body || s.draft.photo) localStorage.setItem('playmona:cel:draft:' + s.key, JSON.stringify(s.draft));
      else localStorage.removeItem('playmona:cel:draft:' + s.key);
    } catch (e) { /* storage full or blocked: the draft still lives in memory */ }
  }

  function mount(host, ctx) {
    var ev = ctx.ev, me = ctx.me;
    var s = stateFor(ev, me);
    var card = el('section', { class: 'ev-card ev-wall', 'aria-labelledby': 'ev-wall-title' });
    host.appendChild(card);
    var name = ev.celebrantName || t('celTheCelebrant', 'them');

    function load(force) {
      // The page may draw this card again while a load is on its way: every card waiting redraws.
      var wait = s.loading || (!force && s.data && Date.now() - s.loadedAt < 30000 ? Promise.resolve(s.data) : null);
      if (!wait) {
        wait = s.loading = FF.Api.call('GET', '/c/' + ev.id + '/wall', null, { guest: true }).then(function (r) {
          s.data = r;
          s.loadedAt = Date.now();
          s.loading = null;
          return r;
        }, function (e) { s.loading = null; throw e; });
      }
      return wait.then(function (r) { if (card.isConnected) draw(); return r; });
    }

    // Keep "waiting for the organiser" and the wall fresh while the guest looks at the page,
    // but never redraw under someone typing a message.
    function refresh() {
      if (!card.isConnected) { clearInterval(timer); document.removeEventListener('visibilitychange', onShow); return; }
      if (document.hidden || s.open || s.loading) return;
      if (Date.now() - s.loadedAt >= 30000) load(true).catch(function () {});
    }
    function onShow() { if (!document.hidden) refresh(); }
    var timer = setInterval(refresh, 45000);
    document.addEventListener('visibilitychange', onShow);

    function draw() {
      FF.ui.clear(card);
      var head = div('ev-wall__head');
      var ic = div('ev-wall__icon');
      ic.appendChild(FF.Icons.icon('heart'));
      head.appendChild(ic);
      var ht = div('');
      ht.appendChild(el('h2', { id: 'ev-wall-title' }, t('celWallTitle', 'Wall of Love')));
      ht.appendChild(el('p', {}, t('celWallLead', 'Leave a message for {name}. It goes into {name}\'s memory book.', { name: name })));
      head.appendChild(ht);
      card.appendChild(head);
      if (s.open) card.appendChild(form());
      else {
        var write = el('button', { type: 'button', class: 'ev-btn' });
        write.appendChild(FF.Icons.icon('pencil'));
        write.appendChild(FF.ui.span('', s.draft.body ? t('celWallContinue', 'Finish your message') : t('celWallWrite', 'Write a message')));
        write.addEventListener('click', function () { s.open = true; draw(); var ta = card.querySelector('textarea'); if (ta) ta.focus(); });
        card.appendChild(write);
      }
      if (!s.data) { card.appendChild(el('p', { class: 'ev-note' }, t('loading', 'Loading…'))); return; }
      if (s.data.mine.length) card.appendChild(mine());
      card.appendChild(wallList());
    }

    /* ---------- writing ---------- */

    function form() {
      var d = s.draft;
      var settings = ev.settings || {};
      var f = el('form', { class: 'ev-form ev-wall__form', novalidate: 'novalidate' });

      var cats = el('div', { class: 'ev-cats', role: 'radiogroup', 'aria-label': t('celWallKind', 'What kind of message?') });
      var prompt = el('p', { class: 'ev-wall__prompt', 'aria-live': 'polite' });
      CATEGORIES.forEach(function (c) {
        var b = el('button', { type: 'button', class: 'ev-cat', role: 'radio', 'aria-checked': d.category === c.id ? 'true' : 'false' });
        b.appendChild(FF.Icons.icon(c.icon));
        b.appendChild(FF.ui.span('', label(c.label)));
        b.addEventListener('click', function () {
          d.category = c.id;
          saveDraft(s);
          Array.prototype.forEach.call(cats.children, function (x) { x.setAttribute('aria-checked', x === b ? 'true' : 'false'); });
          prompt.textContent = label(c.prompt, { name: name });
          ta.placeholder = label(c.prompt, { name: name });
        });
        cats.appendChild(b);
      });
      f.appendChild(cats);
      prompt.textContent = label(category(d.category).prompt, { name: name });
      f.appendChild(prompt);

      var ta = el('textarea', { class: 'input ev-wall__text', id: 'ev-wall-text', rows: '5', maxlength: String(MAX), placeholder: label(category(d.category).prompt, { name: name }), 'aria-label': t('celWallYourMessage', 'Your message') });
      ta.value = d.body || '';
      var count = el('span', { class: 'ev-wall__count', 'aria-live': 'polite' });
      function counted() { count.textContent = t('celCharsLeft', '{n} letters left', { n: MAX - ta.value.length }); count.hidden = ta.value.length < MAX - 150; }
      ta.addEventListener('input', function () { d.body = ta.value; saveDraft(s); counted(); });
      counted();
      f.appendChild(ta);
      f.appendChild(count);

      // Photo
      if (settings.photoUploads) {
        var pic = div('ev-wall__photo');
        f.appendChild(pic);
        var drawPic = function () {
          FF.ui.clear(pic);
          if (d.photo) {
            pic.appendChild(el('img', { src: d.photo.thumb, alt: t('celWallPhotoAlt', 'Your photo') }));
            var rm = el('button', { type: 'button', class: 'ev-linklike' }, t('celWallPhotoRemove', 'Remove photo'));
            rm.addEventListener('click', function () { d.photo = null; saveDraft(s); drawPic(); });
            pic.appendChild(rm);
            return;
          }
          var add = el('button', { type: 'button', class: 'ev-btn ev-btn--ghost' });
          add.appendChild(FF.Icons.icon('image'));
          add.appendChild(FF.ui.span('', t('celWallPhotoAdd', 'Add a photo (optional)')));
          add.addEventListener('click', function () {
            C().choosePicture(function (file) {
              add.disabled = true;
              add.lastChild.textContent = t('celWallPhotoSending', 'Adding your photo…');
              C().shrinkPicture(file, 2048).then(function (blob) {
                return FF.Api.upload('/c/' + ev.id + '/wall/photo', blob, { guest: true });
              }).then(function (m) {
                d.photo = { id: m.id, thumb: m.thumb };
                saveDraft(s);
                drawPic();
              }, function (e) {
                toast(e.message);
                drawPic();
              });
            });
          });
          pic.appendChild(add);
        };
        drawPic();
      }

      // Who it is from
      var nameIn = el('input', { type: 'text', class: 'input', id: 'ev-wall-name', maxlength: '40', autocomplete: 'name' });
      nameIn.value = d.name || me.name;
      nameIn.addEventListener('input', function () { d.name = nameIn.value; saveDraft(s); });
      var nameRow = div('ev-wall__from');
      nameRow.appendChild(el('label', { class: 'field__label', for: 'ev-wall-name' }, t('celWallFrom', 'From')));
      nameRow.appendChild(nameIn);
      f.appendChild(nameRow);
      if (settings.anonymousMessages) {
        var sw = FF.UI.switchRow({
          label: t('celWallAnon', 'Send without my name'),
          description: t('celWallAnonDesc', 'Only the organiser will see who sent it.'),
          checked: !!d.anonymous,
          onChange: function (on) { d.anonymous = on; saveDraft(s); nameRow.hidden = on; }
        });
        sw.classList.add('ev-wall__anon');
        f.appendChild(sw);
        nameRow.hidden = !!d.anonymous;
      } else d.anonymous = false;

      f.appendChild(el('p', { class: 'ev-note' }, settings.approveMessages
        ? t('celWallConsentCheck', 'The organiser reads messages before they go on the wall. Your message and photo are kept for {name}\'s memory book.', { name: name })
        : t('celWallConsentOpen', 'Your message goes on the wall straight away, for everyone at the celebration to read, and into {name}\'s memory book.', { name: name })));
      var err = el('p', { class: 'field__error', 'aria-live': 'assertive' });
      f.appendChild(err);
      var send = el('button', { type: 'submit', class: 'ev-btn' });
      send.appendChild(FF.Icons.icon('heart'));
      send.appendChild(FF.ui.span('', t('celWallSend', 'Send my message')));
      f.appendChild(send);
      var cancel = el('button', { type: 'button', class: 'ev-linklike' }, t('celWallLater', 'Not now (your words are kept)'));
      cancel.addEventListener('click', function () { s.open = false; draw(); });
      f.appendChild(cancel);

      f.addEventListener('submit', function (e) {
        e.preventDefault();
        if (ta.value.trim().length < 2) { err.textContent = t('celWallEmpty', 'Write your message first.'); ta.focus(); return; }
        send.disabled = true;
        err.textContent = '';
        FF.Api.call('POST', '/c/' + ev.id + '/wall', {
          body: ta.value, category: d.category, name: d.anonymous ? '' : (nameIn.value || me.name),
          anonymous: !!d.anonymous, mediaId: d.photo ? d.photo.id : undefined
        }, { guest: true }).then(function (r) {
          s.draft = { category: d.category, body: '', name: d.name, anonymous: d.anonymous, photo: null };
          saveDraft(s);
          s.open = false;
          toast(r.message.status === 'approved'
            ? t('celWallSentLive', 'Thank you! Your message is on the wall.')
            : t('celWallSentWait', 'Thank you! Your message will appear once the organiser has read it.'));
          if (FF.Audio && FF.Audio.play) FF.Audio.play('correct');
          return load(true);
        }).catch(function (e2) {
          send.disabled = false;
          err.textContent = e2.message;
        });
      });
      return f;
    }

    /* ---------- reading ---------- */

    var STATUS = {
      pending: ['celMsgWaiting', 'Waiting for the organiser'],
      approved: ['celMsgOnWall', 'On the wall'],
      rejected: ['celMsgNotShown', 'Not shown on the wall']
    };

    function message(m, opts) {
      var li = el('li', { class: 'ev-msg' });
      var cat = category(m.category);
      var top = div('ev-msg__top');
      var tag = el('span', { class: 'ev-msg__tag' });
      tag.appendChild(FF.Icons.icon(cat.icon));
      tag.appendChild(FF.ui.span('', label(cat.label)));
      top.appendChild(tag);
      if (opts.status) top.appendChild(el('span', { class: 'ev-msg__status is-' + m.status }, label(STATUS[m.status] || ['', m.status])));
      li.appendChild(top);
      li.appendChild(el('p', { class: 'ev-msg__body' }, m.body));
      if (m.photo) li.appendChild(el('img', { class: 'ev-msg__photo', src: m.photo.play, alt: t('celMsgPhotoBy', 'Photo from {name}', { name: byline(m) }), loading: 'lazy' }));
      var foot = div('ev-msg__foot');
      foot.appendChild(el('span', { class: 'ev-msg__by' }, '— ' + byline(m) + (m.anonymous && opts.status ? ' ' + t('celMsgAnonMine', '(sent without your name)') : '')));
      if (opts.remove) {
        var rm = el('button', { type: 'button', class: 'ev-linklike' }, t('celMsgRemove', 'Remove'));
        rm.addEventListener('click', function () {
          FF.UI.confirm({
            title: t('celMsgRemoveTitle', 'Remove your message?'), body: t('celMsgRemoveText', 'It comes off the wall and out of the memory book.'),
            confirmLabel: t('celMsgRemove', 'Remove'), danger: true,
            onConfirm: function () {
              FF.Api.call('POST', '/c/' + ev.id + '/wall/' + m.id + '/remove', {}, { guest: true }).then(function () { load(true); }, function (e) { toast(e.message); });
            }
          });
        });
        foot.appendChild(rm);
      }
      if (opts.report && !m.mine) {
        var rep = el('button', { type: 'button', class: 'ev-linklike ev-msg__report' }, m.reported ? t('celMsgReported', 'Reported') : t('celMsgReport', 'Report'));
        rep.disabled = !!m.reported;
        rep.setAttribute('aria-label', t('celMsgReportLabel', 'Report this message to the organiser'));
        rep.addEventListener('click', function () {
          FF.UI.confirm({
            title: t('celMsgReportTitle', 'Report this message?'), body: t('celMsgReportText', 'The organiser will take another look. If several guests report it, it comes off the wall until then.'),
            confirmLabel: t('celMsgReport', 'Report'),
            onConfirm: function () {
              FF.Api.call('POST', '/c/' + ev.id + '/wall/' + m.id + '/report', {}, { guest: true }).then(function () {
                toast(t('celMsgReportedThanks', 'Thank you. The organiser will look at it.'));
                load(true);
              }, function (e) { toast(e.message); });
            }
          });
        });
        foot.appendChild(rep);
      }
      li.appendChild(foot);
      return li;
    }

    function mine() {
      var box = div('ev-wall__mine');
      box.appendChild(el('h3', {}, t('celWallYours', 'Your messages')));
      var ul = el('ul', { class: 'ev-msgs' });
      s.data.mine.forEach(function (m) { ul.appendChild(message(m, { status: true, remove: true })); });
      box.appendChild(ul);
      return box;
    }

    function wallList() {
      var others = s.data.wall;
      var box = div('ev-wall__list');
      var waiting = s.data.mine.some(function (m) { return m.status === 'pending'; });
      if (!others.length) {
        box.appendChild(el('p', { class: 'ev-note' }, waiting
          ? t('celWallMineWaiting', 'Your message is safe. It shows on the wall for everyone once the organiser has read it.')
          : t('celWallEmptyYet', 'No messages on the wall yet. Yours could be the first!')));
        return box;
      }
      var toggle = el('button', { type: 'button', class: 'ev-btn ev-btn--ghost', 'aria-expanded': s.showWall ? 'true' : 'false' });
      toggle.appendChild(FF.Icons.icon(s.showWall ? 'eye-slash' : 'eye'));
      toggle.appendChild(FF.ui.span('', s.showWall ? t('celWallHide', 'Hide the wall')
        : t(others.length === 1 ? 'celWallReadOne' : 'celWallReadMany', others.length === 1 ? 'Read the wall (1 message)' : 'Read the wall ({n} messages)', { n: others.length })));
      toggle.addEventListener('click', function () { s.showWall = !s.showWall; if (s.showWall) load(true); draw(); });
      box.appendChild(toggle);
      if (s.showWall) {
        var ul = el('ul', { class: 'ev-msgs' });
        others.forEach(function (m) { ul.appendChild(message(m, { report: true })); });
        box.appendChild(ul);
      }
      return box;
    }

    draw();
    load(false).catch(function (e) {
      if (!card.isConnected) return;
      FF.ui.clear(card);
      card.appendChild(el('h2', {}, t('celWallTitle', 'Wall of Love')));
      card.appendChild(el('p', {}, e.message));
    });
    return card;
  }

  FF.CelebrateWall = { mount: mount, CATEGORIES: CATEGORIES, category: category, byline: byline, label: label, when: when };
})();
