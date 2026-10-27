/* ============================================================
   PLAYMONA — net/chat.js
   A small text chat for a room (rooms/<code>/chat/<id>), for games
   where players talk things over, such as Imposters. Voice chat
   keeps working alongside it.

     var chat = FF.RoomChat.create({ room: FF.Room.current(), canSend: fn });
     parent.appendChild(chat.el); ... chat.destroy();

   Messages are one line, up to 120 characters, written once by
   their sender (database.rules.json checks that, and that an
   eliminated Imposters player cannot write). Rude words from the
   word bank's quiet list are masked when shown.
   Classic script, ES2017 or older.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var MAX_LEN = 120;
  var SHOW = 60;           // the newest messages kept on screen
  var GAP_MS = 800;        // one message at a time, please

  function t(key, fallback, vars) { return FF.t ? FF.t(key, fallback, vars) : fallback; }

  function msgId() {
    var c = window.crypto;
    var bytes = c && c.getRandomValues ? Array.prototype.slice.call(c.getRandomValues(new Uint8Array(10))) : [];
    while (bytes.length < 10) bytes.push(Math.floor(Math.random() * 256));
    return 'm' + bytes.map(function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
  }

  /* "you ****" for words on the word bank's quiet list. */
  function mask(text) {
    if (!FF.Words || !FF.Words.isQuiet) return text;
    return String(text).replace(/[A-Za-zÀ-ɏ']+/g, function (w) {
      return FF.Words.isQuiet(w.toLowerCase()) ? w.charAt(0) + new Array(w.length).join('•') : w;
    });
  }

  function create(opts) {
    var room = opts.room;
    var T = room.transport;
    var canSend = opts.canSend || function () { return true; };
    var lastSent = 0;
    var messages = {};
    var seen = 0;

    var el = FF.ui.el('section', { class: 'rchat', 'aria-label': t('chatLabel', 'Room chat') });
    var head = FF.ui.div('rchat__head');
    head.appendChild(FF.Icons.icon('chat'));
    head.appendChild(FF.ui.span('rchat__title', t('chatTitle', 'Chat')));
    el.appendChild(head);
    var list = FF.ui.el('ol', { class: 'rchat__list', 'aria-live': 'polite', 'aria-relevant': 'additions' });
    el.appendChild(list);
    var empty = FF.ui.el('p', { class: 'rchat__empty' }, t('chatEmpty', 'No messages yet. Say what you think.'));
    el.appendChild(empty);

    var form = FF.ui.el('form', { class: 'rchat__form', autocomplete: 'off' });
    var input = FF.ui.el('input', {
      type: 'text', class: 'gm-input rchat__input', maxlength: MAX_LEN, enterkeyhint: 'send',
      placeholder: t('chatPlaceholder', 'Message'), 'aria-label': t('chatPlaceholder', 'Message')
    });
    var btn = FF.ui.el('button', { type: 'submit', class: 'btn btn-primary btn-icon rchat__send', 'aria-label': t('chatSend', 'Send') });
    btn.appendChild(FF.Icons.icon('arrow-right'));
    form.appendChild(input);
    form.appendChild(btn);
    el.appendChild(form);
    var note = FF.ui.el('p', { class: 'rchat__note', hidden: true });
    el.appendChild(note);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = String(input.value || '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '').slice(0, MAX_LEN);
      if (!text || !canSend()) return;
      var now = Date.now();
      if (now - lastSent < GAP_MS) return;
      lastSent = now;
      var me = (room.players && room.players[room.uid]) || {};
      input.value = '';
      T.set('chat/' + msgId(), {
        uid: room.uid, name: String(me.name || t('impPlayer', 'Player')).slice(0, 40), text: text,
        t: T.serverTimestamp ? T.serverTimestamp() : T.serverNow()
      }).catch(function () {
        FF.UI.toast(t('chatFailed', 'That message could not be sent.'), { type: 'error' });
      });
    });

    function render() {
      var ids = Object.keys(messages).sort(function (a, b) { return (messages[a].t || 0) - (messages[b].t || 0); }).slice(-SHOW);
      var atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
      FF.ui.clear(list);
      ids.forEach(function (id) {
        var m = messages[id];
        var mine = m.uid === room.uid;
        var li = FF.ui.el('li', { class: 'rchat__msg' + (mine ? ' rchat__msg--me' : '') });
        li.appendChild(FF.ui.span('rchat__who', mine ? t('youTag', '(you)') : String(m.name || '')));
        li.appendChild(FF.ui.span('rchat__text', mask(m.text || '')));
        list.appendChild(li);
      });
      empty.hidden = ids.length > 0;
      if (atBottom || ids.length > seen) list.scrollTop = list.scrollHeight;
      seen = ids.length;
    }

    function sync() {
      var ok = canSend();
      input.disabled = !ok;
      btn.disabled = !ok;
      note.hidden = ok;
      note.textContent = ok ? '' : (opts.closedText || t('chatClosed', 'You can read the chat but not write.'));
    }

    var off = T.watch('chat', function (v) { messages = v || {}; render(); });
    sync();

    return {
      el: el,
      refresh: sync,
      destroy: function () { if (off) off(); off = null; }
    };
  }

  FF.RoomChat = { create: create, mask: mask, MAX_LEN: MAX_LEN };
})();
