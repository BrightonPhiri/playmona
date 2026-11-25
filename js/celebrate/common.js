/* PlayMona Celebrations: shared helpers for the organiser screens (play.html) and the
   event page (event.html). FF.Celebrate.
   - TYPES / LOOKS / FONTS: what an organiser can pick (the server checks the same lists).
   - applyTheme(el, theme): dresses an element in the event's look (css/tokens.css .cel-look),
     with the organiser's own colours on top and a readable text colour worked out here.
   - links, dates, QR codes, copying and sharing, shrinking photos before upload. */
window.FF = window.FF || {};
(function () {
  'use strict';

  function t(k, f, v) { return FF.t ? FF.t(k, f, v) : f; }

  var TYPES = [
    { id: 'birthday', icon: 'cake', label: ['celTypeBirthday', 'Birthday'], title: ['celTitleBirthday', "{name}'s Birthday"] },
    { id: 'graduation', icon: 'graduation-cap', label: ['celTypeGraduation', 'Graduation'], title: ['celTitleGraduation', "{name}'s Graduation"] },
    { id: 'wedding', icon: 'rings', label: ['celTypeWedding', 'Wedding'], title: ['celTitleWedding', "{name}'s Wedding"] },
    { id: 'anniversary', icon: 'heart', label: ['celTypeAnniversary', 'Anniversary'], title: ['celTitleAnniversary', "{name}'s Anniversary"] },
    { id: 'babyShower', icon: 'baby', label: ['celTypeBabyShower', 'Baby shower'], title: ['celTitleBabyShower', "{name}'s Baby Shower"] },
    { id: 'engagement', icon: 'sparkle', label: ['celTypeEngagement', 'Engagement'], title: ['celTitleEngagement', "{name}'s Engagement"] },
    { id: 'retirement', icon: 'sun', label: ['celTypeRetirement', 'Retirement'], title: ['celTitleRetirement', "{name}'s Retirement"] },
    { id: 'corporate', icon: 'briefcase', label: ['celTypeCorporate', 'Company event'], title: ['celTitleCorporate', '{name} Celebration'] },
    { id: 'reunion', icon: 'users-three', label: ['celTypeReunion', 'Family reunion'], title: ['celTitleReunion', '{name} Family Reunion'] },
    { id: 'farewell', icon: 'balloon', label: ['celTypeFarewell', 'Farewell'], title: ['celTitleFarewell', 'Farewell, {name}'] },
    { id: 'custom', icon: 'confetti', label: ['celTypeCustom', 'Something else'], title: ['celTitleCustom', "{name}'s Celebration"] }
  ];

  var LOOKS = [
    { id: 'gala', label: ['celLookGala', 'Gold gala'] },
    { id: 'rose', label: ['celLookRose', 'Rose garden'] },
    { id: 'ocean', label: ['celLookOcean', 'Ocean night'] },
    { id: 'garden', label: ['celLookGarden', 'Garden party'] },
    { id: 'confetti', label: ['celLookConfetti', 'Confetti pop'] },
    { id: 'ivory', label: ['celLookIvory', 'Classic ivory'] }
  ];

  var FONTS = [
    { id: 'classic', label: ['celFontClassic', 'Classic'] },
    { id: 'elegant', label: ['celFontElegant', 'Elegant'] },
    { id: 'modern', label: ['celFontModern', 'Modern'] },
    { id: 'playful', label: ['celFontPlayful', 'Playful'] }
  ];

  /* ---------- colour sums (WCAG relative luminance) ---------- */
  function rgb(hex) {
    var m = /^#([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return null;
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function lum(hex) {
    var c = rgb(hex);
    if (!c) return 0;
    var l = c.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
  }
  function contrast(a, b) {
    var x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  /* Near-black or white, whichever reads better on this colour. */
  function readableOn(hex) {
    return contrast(hex, '#14101f') >= contrast(hex, '#ffffff') ? '#14101f' : '#ffffff';
  }
  function mix(hex, toward, amount) {
    var a = rgb(hex), b = rgb(toward);
    if (!a || !b) return hex;
    var out = a.map(function (v, i) { return Math.round(v + (b[i] - v) * amount); });
    return '#' + out.map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join('');
  }
  function alpha(hex, a) {
    var c = rgb(hex);
    return c ? 'rgba(' + c[0] + ', ' + c[1] + ', ' + c[2] + ', ' + a + ')' : '';
  }

  /* Dresses `el` in the event's look. Organiser colours are data, so they go in as custom properties. */
  function applyTheme(el, theme) {
    theme = theme || {};
    el.classList.add('cel-look');
    el.setAttribute('data-look', theme.look || 'gala');
    el.setAttribute('data-font', theme.font || 'classic');
    ['--ev-primary', '--ev-on-primary', '--ev-glow', '--ev-secondary', '--ev-bg', '--ev-bg-2', '--ev-surface', '--ev-edge', '--ev-text', '--ev-muted']
      .forEach(function (p) { el.style.removeProperty(p); });
    if (theme.background) {
      var bg = theme.background;
      var dark = lum(bg) < 0.2;
      var text = dark ? '#fdfaf3' : '#1d1826';
      el.style.setProperty('--ev-bg', bg);
      el.style.setProperty('--ev-bg-2', mix(bg, dark ? '#ffffff' : '#000000', 0.06));
      el.style.setProperty('--ev-surface', mix(bg, dark ? '#ffffff' : '#ffffff', dark ? 0.08 : 0.7));
      el.style.setProperty('--ev-edge', mix(bg, dark ? '#ffffff' : '#000000', dark ? 0.2 : 0.14));
      el.style.setProperty('--ev-text', text);
      el.style.setProperty('--ev-muted', mix(text, bg, 0.28));
    }
    if (theme.primary) {
      var p = theme.primary;
      // A colour too close to the background would vanish: nudge it until it stands out (3:1).
      var page = theme.background || getComputedStyle(el).getPropertyValue('--ev-bg').trim() || '#ffffff';
      for (var i = 0; i < 8 && contrast(p, page) < 3; i++) p = mix(p, lum(page) < 0.3 ? '#ffffff' : '#000000', 0.15);
      el.style.setProperty('--ev-primary', p);
      el.style.setProperty('--ev-on-primary', readableOn(p));
      el.style.setProperty('--ev-glow', alpha(p, 0.3));
    }
    if (theme.secondary) el.style.setProperty('--ev-secondary', theme.secondary);
  }

  /* ---------- words ---------- */
  function type(id) {
    for (var i = 0; i < TYPES.length; i++) if (TYPES[i].id === id) return TYPES[i];
    return TYPES[TYPES.length - 1];
  }
  function typeLabel(id) { var x = type(id); return t(x.label[0], x.label[1]); }
  /* What an event celebrates, main kind first ("Birthday · Graduation"). Old events have only "type". */
  function typesOf(ev) {
    var list = ev && Array.isArray(ev.types) ? ev.types.filter(function (x) { return typeof x === 'string'; }) : [];
    return list.length ? list : [ev && ev.type ? ev.type : 'custom'];
  }
  function typesLabel(ev) { return typesOf(ev).map(typeLabel).join(' · '); }
  function defaultTitle(typeId, name) { var x = type(typeId); return t(x.title[0], x.title[1], { name: name || '' }); }

  /* "Sat, 22 Nov 2026" from "2026-11-22", read as a calendar date (no time-zone shift). */
  function formatDate(ymd, opts) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
    if (!m) return '';
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
    try {
      return d.toLocaleDateString(undefined, opts || { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) { return ymd; }
  }
  function formatTime(hm) {
    var m = /^(\d{2}):(\d{2})$/.exec(hm || '');
    if (!m) return '';
    var d = new Date(2000, 0, 1, Number(m[1]), Number(m[2]));
    try { return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); } catch (e) { return hm; }
  }
  function timeRange(ev) {
    var a = formatTime(ev.startTime), b = formatTime(ev.endTime);
    return a && b ? a + ' – ' + b : (a || '');
  }

  /* When the event starts (ms since 1970), from its date, start time and time zone; null without both.
     A missing or unknown time zone reads the time on this device's clock. */
  function startsAt(ev) {
    var d = /^(\d{4})-(\d{2})-(\d{2})$/.exec((ev && ev.date) || '');
    var h = /^(\d{2}):(\d{2})$/.exec((ev && ev.startTime) || '');
    if (!d || !h) return null;
    var y = +d[1], mo = +d[2] - 1, da = +d[3], hr = +h[1], mi = +h[2];
    var guess = Date.UTC(y, mo, da, hr, mi);
    try {
      if (!ev.timezone) throw new Error('no zone');
      var parts = {};
      new Intl.DateTimeFormat('en-US', { timeZone: ev.timezone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
        .formatToParts(new Date(guess)).forEach(function (p) { parts[p.type] = +p.value; });
      // What the zone's clock shows at "guess", read as if it were UTC: the difference is the zone's offset.
      var shown = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second);
      return guess - (shown - guess);
    } catch (e) {
      return new Date(y, mo, da, hr, mi).getTime();
    }
  }

  /* "Starts in 2 days 4 h", "Starts in 3 h 5 min", "Starts in 12 min 30 s". */
  function countdownText(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var days = Math.floor(s / 86400), hours = Math.floor(s % 86400 / 3600), mins = Math.floor(s % 3600 / 60), secs = s % 60;
    if (days) return t(days === 1 ? 'celStartsInDay' : 'celStartsInDays', days === 1 ? 'Starts in 1 day {h} h' : 'Starts in {d} days {h} h', { d: days, h: hours });
    if (hours) return t('celStartsInHours', 'Starts in {h} h {m} min', { h: hours, m: mins });
    return t('celStartsInMins', 'Starts in {m} min {s} s', { m: mins, s: secs });
  }

  /* ---------- links ---------- */
  function origin() {
    return (typeof location !== 'undefined' && /^https?:$/.test(location.protocol)) ? location.origin : 'https://playmona.com';
  }
  var LINK_PATH = { celebrant: 'for', mc: 'mc', display: 'tv' };
  function eventUrl(slug) { return origin() + '/c/' + slug; }
  // The secret goes after "#": browsers never send that part to the server.
  function privateUrl(slug, kind, token) { return origin() + '/c/' + slug + '/' + LINK_PATH[kind] + '#k=' + token; }

  /* ---------- QR codes ---------- */
  function qrSvg(url, size, label) {
    var svg = FF.QR && FF.QR.svg(url, { size: size || 200 });
    if (svg) svg.setAttribute('aria-label', label || t('celQrLabel', 'QR code to open the celebration'));
    return svg;
  }

  /* A printable QR card (PNG): the code, the event title and the address under it. */
  function downloadQr(url, title, filename) {
    if (typeof window.qrcode !== 'function') return Promise.reject(new Error('no qr'));
    var qr = window.qrcode(0, 'M');
    qr.addData(String(url));
    qr.make();
    var W = 1200, H = 1460, pad = 110, size = W - pad * 2;
    var c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    var n = qr.getModuleCount(), cell = size / n;
    ctx.fillStyle = '#111111';
    for (var r = 0; r < n; r++) {
      for (var k = 0; k < n; k++) {
        if (qr.isDark(r, k)) ctx.fillRect(Math.floor(pad + k * cell), Math.floor(pad + r * cell), Math.ceil(cell), Math.ceil(cell));
      }
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = '#111111';
    ctx.font = '700 58px Fredoka, Nunito, sans-serif';
    var text = String(title || '');
    while (ctx.measureText(text).width > W - 120 && text.length > 4) text = text.slice(0, -2);
    if (text !== String(title || '')) text = text.slice(0, -1) + '…';
    ctx.fillText(text, W / 2, pad + size + 130);
    ctx.font = '600 40px Nunito, sans-serif';
    ctx.fillStyle = '#444444';
    ctx.fillText(url.replace(/^https?:\/\//, ''), W / 2, pad + size + 200);
    return new Promise(function (resolve) { c.toBlob(resolve, 'image/png'); }).then(function (blob) {
      if (!blob) throw new Error('no image');
      var a = document.createElement('a');
      var href = URL.createObjectURL(blob);
      a.href = href;
      a.download = (filename || 'celebration-qr') + '.png';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(href); if (a.parentNode) a.parentNode.removeChild(a); }, 1500);
    });
  }

  /* ---------- copy and share ---------- */
  function copy(text, done) {
    function ok() { if (FF.UI) FF.UI.toast(done || t('copied', 'Copied')); }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); ok(); } catch (e) { if (FF.UI) FF.UI.toast(t('copyFailed', 'Could not copy. Select the text and copy it yourself.')); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback);
    else fallback();
  }
  function share(url, title, text) {
    if (navigator.share) {
      navigator.share({ title: title, text: text || title, url: url }).catch(function () {});
      return;
    }
    copy(url, t('celLinkCopied', 'Link copied'));
  }

  /* ---------- photos ---------- */
  /* Makes a phone photo small enough to send (longest side `max`, JPEG). The browser turns it
     upright and drawing it again drops hidden photo data before it ever leaves the phone. */
  function shrinkPicture(file, max) {
    max = max || 2048;
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type || '')) { reject(new Error(t('celNotPicture', 'Choose a picture (JPG, PNG or WebP).'))); return; }
      if (file.size > 30 * 1024 * 1024) { reject(new Error(t('celPictureHuge', 'That picture is too big. Choose a smaller one.'))); return; }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        var scale = Math.min(1, max / Math.max(w, h));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * scale));
        c.height = Math.max(1, Math.round(h * scale));
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (blob) {
          if (blob) resolve(blob); else reject(new Error(t('celPictureFailed', 'That picture could not be read. Try another one.')));
        }, 'image/jpeg', 0.88);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error(t('celPictureFailed', 'That picture could not be read. Try another one.')));
      };
      img.src = url;
    });
  }

  /* Opens the phone's picture chooser; calls back with the File. */
  function choosePicture(onFile) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/heic,image/*';
    input.style.display = 'none';
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      if (input.parentNode) input.parentNode.removeChild(input);
      if (f) onFile(f);
    });
    document.body.appendChild(input);
    input.click();
  }

  /* The event header: cover photo, kind, title and the when/where facts, in the event's look.
     opts.tag: heading level ('h1' on the event page), opts.compact for cards. */
  function hero(ev, opts) {
    opts = opts || {};
    var el = FF.ui.el('section', { class: 'cel-hero' + (opts.compact ? ' cel-hero--compact' : '') + (ev.cover ? ' has-cover' : '') });
    applyTheme(el, ev.theme);
    if (ev.cover && ev.cover.play) {
      var art = FF.ui.div('cel-hero__art');
      art.appendChild(FF.ui.el('img', { src: ev.cover.play, alt: '', loading: 'lazy', decoding: 'async' }));
      el.appendChild(art);
    }
    var body = FF.ui.div('cel-hero__body');
    var kicker = FF.ui.el('p', { class: 'cel-hero__kicker' });
    kicker.appendChild(FF.Icons.icon(type(typesOf(ev)[0]).icon));
    kicker.appendChild(document.createTextNode(typesLabel(ev)));
    body.appendChild(kicker);
    body.appendChild(FF.ui.el(opts.tag || 'h2', { class: 'cel-hero__title' }, ev.title || defaultTitle(ev.type, ev.celebrantName)));
    var facts = FF.ui.el('ul', { class: 'cel-hero__facts' });
    function fact(iconKey, text) {
      if (!text) return;
      var li = FF.ui.el('li', {});
      li.appendChild(FF.Icons.icon(iconKey));
      li.appendChild(FF.ui.span('', text));
      facts.appendChild(li);
    }
    fact('calendar', formatDate(ev.date));
    fact('clock', timeRange(ev));
    fact('map-pin', ev.venue);
    if (facts.childNodes.length) body.appendChild(facts);
    if (opts.extra) body.appendChild(opts.extra);
    el.appendChild(body);
    return el;
  }

  /* "3 groups have joined" when games are played by groups, "12 guests have joined" when by individuals. */
  function joinedText(ev) {
    var settings = ev.settings || {};
    if (!settings.individuals && typeof ev.groupCount === 'number') {
      var g = ev.groupCount;
      return t(g === 1 ? 'celGroupsHereOne' : 'celGroupsHereMany', g === 1 ? '1 group has joined' : '{n} groups have joined', { n: g });
    }
    var n = ev.guestCount || 0;
    return t(n === 1 ? 'celHereOne' : 'celHereMany', n === 1 ? '1 guest has joined' : '{n} guests have joined', { n: n });
  }

  /* Each game's cover picture (assets/images/covers), by template. Picture Rush shares the
     library game's cover once it exists, and shows its icon until then (the MC list shows
     its first photo instead). */
  var GAME_ART = {
    pictureRush: { cover: 'pictureRush', icon: 'puzzle-piece', optional: true },
    wordByWord: { cover: 'wordByWord', icon: 'text-aa' },
    quiz: { cover: 'celebrationQuiz', icon: 'question' }
  };
  /* A library game (template 'library') shows that game's own cover, when it has one. */
  function gameCover(template, game) {
    var m = FF.AssetManifest && FF.AssetManifest.covers;
    if (template === 'library') {
      return game && m && m[game] ? 'assets/images/covers/' + game + '.webp?v=' + m[game] : null;
    }
    var a = GAME_ART[template];
    if (!a || !a.cover) return null;
    if (a.optional && !(m && m[a.cover])) return null;     // not drawn yet
    return 'assets/images/covers/' + a.cover + '.webp' + (m && m[a.cover] ? '?v=' + m[a.cover] : '');
  }
  /* The cover as an element: the picture, or the game's icon on a tile. */
  function gameArt(template, cls, game) {
    var src = gameCover(template, game);
    var box = FF.ui.el('div', { class: 'cel-gameart' + (cls ? ' ' + cls : '') + (src ? '' : ' cel-gameart--icon'), 'aria-hidden': 'true' });
    if (src) box.appendChild(FF.ui.el('img', { src: src, alt: '', decoding: 'async' }));
    else box.appendChild(FF.Icons.icon(template === 'library' ? 'game-controller' : (GAME_ART[template] || {}).icon || 'confetti'));
    return box;
  }

  FF.Celebrate = {
    hero: hero,
    gameCover: gameCover,
    gameArt: gameArt,
    joinedText: joinedText,
    TYPES: TYPES,
    LOOKS: LOOKS,
    FONTS: FONTS,
    type: type,
    typeLabel: typeLabel,
    typesOf: typesOf,
    startsAt: startsAt,
    countdownText: countdownText,
    typesLabel: typesLabel,
    defaultTitle: defaultTitle,
    applyTheme: applyTheme,
    readableOn: readableOn,
    contrast: contrast,
    formatDate: formatDate,
    formatTime: formatTime,
    timeRange: timeRange,
    eventUrl: eventUrl,
    privateUrl: privateUrl,
    qrSvg: qrSvg,
    downloadQr: downloadQr,
    copy: copy,
    share: share,
    shrinkPicture: shrinkPicture,
    choosePicture: choosePicture,
    label: function (pair) { return t(pair[0], pair[1]); }
  };
})();
