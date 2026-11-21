/* PlayMona Celebrations: the TV's opening slide (FF.CelebrateSlide).
   - render(box, { slide, images, ev }) draws the slide into box and returns { stop() }: one picture,
     a slideshow that fades from picture to picture, or a built text slide; a slow movement on the
     picture (zoom in, zoom out, pan) and an effect drawn over it (js/celebrate/effects.js).
     Sizes follow the box (container units), so the same slide fills a TV or a small preview.
   - editor(opts) is the organiser's and the MC's slide settings, with a live preview.
     opts: { ev, load() → Promise<{display, slideImages}>, save(partial) → Promise<{display, slideImages}>,
             upload(file) → Promise<media>, onShow() optional: put the slide on the TV now }
   Classic script, ES2017 or older. */
window.FF = window.FF || {};
(function () {
  'use strict';

  var C = function () { return FF.Celebrate; };
  function t(k, f, v) { return FF.t ? FF.t(k, f, v) : f; }
  function el(tag, attrs, kids) { return FF.ui.el(tag, attrs, kids); }
  function div(cls, kids) { return FF.ui.div(cls, kids); }
  function icon(k) { return FF.Icons.icon(k); }
  function list(x) { return Array.isArray(x) ? x : (x && typeof x === 'object' ? Object.keys(x).map(function (k) { return x[k]; }) : []); }

  var DEFAULTS = {
    kind: 'built', mediaIds: [], seconds: 8, kicker: 'Welcome to', title: '', subtitle: '',
    showFacts: true, background: 'theme', motion: 'zoomIn', effect: 'sparkles'
  };
  var PICTURES_MAX = 12;
  var KINDS = [
    ['picture', 'image', ['celSlidePicture', 'One picture']],
    ['slideshow', 'images', ['celSlideSlideshow', 'Slideshow']],
    ['built', 'sparkle', ['celSlideBuilt', 'Build a slide']]
  ];
  var MOTIONS = [
    ['none', ['celMotionNone', 'Still']],
    ['zoomIn', ['celMotionZoomIn', 'Slow zoom in']],
    ['zoomOut', ['celMotionZoomOut', 'Slow zoom out']],
    ['pan', ['celMotionPan', 'Slow pan']]
  ];

  /* The slide with every field filled in. Firebase drops empty lists, so mediaIds may be missing. */
  function normal(slide) {
    var s = {};
    Object.keys(DEFAULTS).forEach(function (k) { s[k] = slide && slide[k] !== undefined && slide[k] !== null ? slide[k] : DEFAULTS[k]; });
    s.mediaIds = list(s.mediaIds);
    return s;
  }

  /* The pictures in the slide's order (the API sends them in order; a newer list may be live already). */
  function ordered(s, images) {
    var byId = {};
    list(images).forEach(function (m) { if (m && m.id) byId[m.id] = m; });
    return s.mediaIds.map(function (id) { return byId[id]; }).filter(Boolean);
  }

  function themeColors(node) {
    var cs = window.getComputedStyle(node);
    return ['--ev-primary', '--ev-secondary', '--ev-glow'].map(function (p) { return (cs.getPropertyValue(p) || '').trim(); }).filter(Boolean);
  }

  function render(box, o) {
    var s = normal(o.slide);
    var ev = o.ev || {};
    var imgs = ordered(s, o.images);
    var kind = s.kind;
    // A picture slide without its picture yet shows the built slide, never an empty screen.
    if (kind !== 'built' && !imgs.length) kind = 'built';
    if (kind === 'picture') imgs = imgs.slice(0, 1);
    FF.ui.clear(box);
    box.classList.add('cel-slide');
    box.setAttribute('data-kind', kind);
    box.style.setProperty('--slide-ms', (kind === 'slideshow' ? s.seconds * 1000 + 1500 : 40000) + 'ms');
    var media = div('cel-slide__media is-motion-' + s.motion + (kind === 'slideshow' ? ' is-show' : ''));
    var timers = [];
    if (kind === 'built') {
      var bg = div('cel-slide__pic is-on cel-slide__pic--bg');
      if (s.background === 'cover' && ev.cover && ev.cover.play) {
        bg.appendChild(el('img', { class: 'cel-slide__blur', src: ev.cover.play, alt: '' }));
      } else {
        bg.appendChild(div('cel-slide__glow'));
      }
      media.appendChild(bg);
      box.appendChild(media);
      box.appendChild(built(s, ev));
    } else {
      imgs.forEach(function (m, i) {
        var pic = div('cel-slide__pic' + (i === 0 ? ' is-on' : ''));
        pic.appendChild(el('img', { class: 'cel-slide__blur', src: m.play || m.full, alt: '' }));
        pic.appendChild(el('img', { class: 'cel-slide__img', src: m.full || m.play, alt: '' }));
        media.appendChild(pic);
      });
      box.appendChild(media);
      if (kind === 'slideshow' && imgs.length > 1) {
        var at = 0;
        var show = setInterval(function () {
          if (!box.isConnected) { clearInterval(show); return; }
          var pics = media.children, out = pics[at];
          // The picture leaving keeps moving while it fades, then lets go of its movement.
          out.classList.add('is-off');
          out.classList.remove('is-on');
          setTimeout(function () { out.classList.remove('is-off'); }, 1600);
          at = (at + 1) % pics.length;
          pics[at].classList.add('is-on');
        }, s.seconds * 1000);
        timers.push(show);
      }
    }
    var fx = null;
    if (s.effect !== 'none' && FF.CelebrateEffects) {
      var canvas = el('canvas', { class: 'cel-slide__fx', 'aria-hidden': 'true' });
      box.appendChild(canvas);
      // The canvas needs its size, so the effect starts once the slide is on the page.
      timers.push(setTimeout(function () {
        fx = FF.CelebrateEffects.start(canvas, s.effect, { colors: themeColors(box), scale: o.scale || 1 });
      }, 40));
    }
    return {
      stop: function () {
        timers.forEach(function (x) { clearInterval(x); clearTimeout(x); });
        if (fx) fx.stop();
      }
    };
  }

  function built(s, ev) {
    var text = div('cel-slide__text');
    if (s.kicker) {
      var k = div('cel-slide__kicker');
      k.appendChild(el('span', {}, s.kicker));
      text.appendChild(k);
    }
    text.appendChild(el('h1', { class: 'cel-slide__title' }, s.title || ev.title || ''));
    if (s.subtitle) text.appendChild(el('p', { class: 'cel-slide__subtitle' }, s.subtitle));
    if (s.showFacts) {
      var facts = [[ 'calendar', ev.date ? C().formatDate(ev.date) : '' ], [ 'clock', ev.startTime ? C().timeRange(ev) : '' ], [ 'map-pin', ev.venue || '' ]]
        .filter(function (f) { return f[1]; });
      if (facts.length) {
        var ul = el('ul', { class: 'cel-slide__facts' });
        facts.forEach(function (f) {
          var li = el('li', {});
          li.appendChild(icon(f[0]));
          li.appendChild(FF.ui.span('', f[1]));
          ul.appendChild(li);
        });
        text.appendChild(ul);
      }
    }
    return text;
  }

  /* ---------- the settings, for the dashboard and the MC panel ---------- */

  function editor(opts) {
    var st = { slide: normal(null), images: [], chain: Promise.resolve(), saving: 0, uploading: false, handle: null };
    var root = div('cel-slide-ed');
    var preview = div('cel-slide-ed__preview');
    var stage = div('cel-slide-ed__stage');
    preview.appendChild(stage);
    var form = div('cel-slide-ed__form');
    var note = el('p', { class: 'cel-slide-ed__note', role: 'status' });
    root.appendChild(preview);
    root.appendChild(form);
    root.appendChild(note);
    C().applyTheme(stage, opts.ev && opts.ev.theme);

    opts.load().then(take, function (e) { say(e.message); });

    function take(r) {
      st.slide = normal(r.display && r.display.slide);
      st.images = list(r.slideImages);
      // Someone typing in the next box keeps it: only the preview changes then.
      var a = document.activeElement;
      if (a && form.contains(a) && (a.tagName === 'INPUT' || a.tagName === 'SELECT') && a.type !== 'checkbox') drawPreview();
      else draw();
    }
    function say(msg) { note.textContent = msg || ''; }

    /* Saves wait for each other, so a quick title-then-effect never loses one. Resolves true when saved. */
    function save(part) {
      st.saving++;
      say(t('celSaving', 'Saving…'));
      var p = st.chain.then(function () { return opts.save(part); }).then(function (r) {
        st.saving--;
        take(r);
        if (!st.saving && !st.uploading) say(t('celSlideSaved', 'Saved. The TV shows it when the Programme screen is on.'));
        return true;
      }, function (e) {
        st.saving--;
        say(e.message);
        return false;
      });
      st.chain = p;
      return p;
    }

    function chips(name, items, value, onPick) {
      var g = el('div', { class: 'cel-slide-ed__chips', role: 'group', 'aria-label': name });
      items.forEach(function (it) {
        var on = it[0] === value;
        var b = el('button', { type: 'button', class: 'cel-chip' + (on ? ' is-on' : ''), 'aria-pressed': on ? 'true' : 'false' });
        if (it.length > 2 && typeof it[1] === 'string') { b.appendChild(icon(it[1])); b.appendChild(FF.ui.span('', t(it[2][0], it[2][1]))); } else b.appendChild(FF.ui.span('', t(it[1][0], it[1][1])));
        b.addEventListener('click', function () { if (!on) onPick(it[0]); });
        g.appendChild(b);
      });
      return g;
    }
    function field(label, kids) {
      var f = div('cel-slide-ed__field');
      f.appendChild(el('span', { class: 'cel-slide-ed__label' }, label));
      (Array.isArray(kids) ? kids : [kids]).forEach(function (k) { f.appendChild(k); });
      return f;
    }
    function textInput(key, max, placeholder) {
      var i = el('input', { type: 'text', class: 'input', maxlength: String(max), value: st.slide[key] || '', placeholder: placeholder || '' });
      i.addEventListener('change', function () { var o = {}; o[key] = i.value; save(o); });
      return i;
    }

    function pictures() {
      var wrap = div('cel-slide-ed__pics');
      var max = st.slide.kind === 'picture' ? 1 : PICTURES_MAX;
      var shown = ordered(st.slide, st.images).slice(0, max);
      shown.forEach(function (m, i) {
        var tile = div('cel-slide-ed__pic');
        tile.appendChild(el('img', { src: m.thumb || m.play, alt: '' }));
        var acts = div('cel-slide-ed__picacts');
        if (st.slide.kind === 'slideshow' && i > 0) acts.appendChild(tinyBtn('arrow-left', t('celSlideEarlier', 'Show earlier'), function () { move(i, -1); }));
        acts.appendChild(tinyBtn('trash', t('celSlideRemove', 'Remove'), function () {
          var ids = st.slide.mediaIds.slice(); ids.splice(i, 1); save({ mediaIds: ids });
        }));
        if (st.slide.kind === 'slideshow' && i < shown.length - 1) acts.appendChild(tinyBtn('arrow-right', t('celSlideLater', 'Show later'), function () { move(i, 1); }));
        tile.appendChild(acts);
        wrap.appendChild(tile);
      });
      if (shown.length < max || st.slide.kind === 'picture') {
        var pick = el('input', { type: 'file', accept: 'image/*', hidden: '' });
        if (st.slide.kind === 'slideshow') pick.multiple = true;
        var add = el('button', { type: 'button', class: 'cel-slide-ed__add' });
        add.appendChild(icon('image'));
        add.appendChild(FF.ui.span('', st.slide.kind === 'picture' && shown.length ? t('celSlideReplace', 'Change picture') : t('celSlideAdd', 'Add pictures')));
        add.addEventListener('click', function () { pick.click(); });
        pick.addEventListener('change', function () { addFiles(Array.prototype.slice.call(pick.files || [])); });
        wrap.appendChild(add);
        wrap.appendChild(pick);
      }
      return wrap;
    }
    function tinyBtn(ic, label, fn) {
      var b = el('button', { type: 'button', class: 'cel-slide-ed__tiny', 'aria-label': label, title: label });
      b.appendChild(icon(ic));
      b.addEventListener('click', fn);
      return b;
    }
    function move(i, by) {
      var ids = st.slide.mediaIds.slice();
      var x = ids[i]; ids[i] = ids[i + by]; ids[i + by] = x;
      save({ mediaIds: ids });
    }
    function addFiles(files) {
      if (!files.length || st.uploading) return;
      var picture = st.slide.kind === 'picture';
      var room = picture ? 1 : PICTURES_MAX - st.slide.mediaIds.length;
      files = files.slice(0, Math.max(0, room));
      if (!files.length) { say(t('celSlideFull', 'The slideshow has {n} pictures already. Remove one first.', { n: PICTURES_MAX })); return; }
      st.uploading = true;
      var ids = [], failed = null;
      say(t('celSlideUploading', 'Adding pictures… {n} of {total}', { n: 0, total: files.length }));
      // One at a time keeps a phone on a slow line from timing out.
      files.reduce(function (p, f) {
        return p.then(function () {
          if (failed) return;
          return opts.upload(f).then(function (m) {
            ids.push(m.id);
            say(t('celSlideUploading', 'Adding pictures… {n} of {total}', { n: ids.length, total: files.length }));
          }, function (e) { failed = e; });
        });
      }, Promise.resolve()).then(function () {
        st.uploading = false;
        if (!ids.length) { say(failed ? failed.message : ''); return; }
        // One picture: the new one goes first (the one shown); the rest stay for a slideshow.
        var rest = st.slide.mediaIds;
        var next = picture ? ids.slice(-1).concat(rest.slice(1)) : rest.concat(ids);
        return save({ mediaIds: next.slice(0, PICTURES_MAX) }).then(function (ok) {
          if (ok && failed) say(t('celSlideSomeFailed', 'Added {n} of {total}. {reason}', { n: ids.length, total: files.length, reason: failed.message }));
        });
      });
    }

    function drawPreview() {
      if (st.handle) st.handle.stop();
      st.handle = render(stage, { slide: st.slide, images: st.images, ev: opts.ev, scale: 0.6 });
    }

    function draw() {
      drawPreview();
      var s = st.slide;
      FF.ui.clear(form);
      form.appendChild(field(t('celSlideKind', 'Kind of slide'), chips(t('celSlideKind', 'Kind of slide'), KINDS, s.kind, function (v) { save({ kind: v }); })));
      if (s.kind === 'built') {
        form.appendChild(field(t('celSlideKicker', 'Small line on top'), textInput('kicker', 40, 'Welcome to')));
        form.appendChild(field(t('celSlideTitle', 'Title'), textInput('title', 80, opts.ev && opts.ev.title)));
        form.appendChild(field(t('celSlideSubtitle', 'Subtitle'), textInput('subtitle', 120, t('celSlideSubtitleHint', 'For example: 40, Fortified and Qualified'))));
        var facts = el('label', { class: 'cel-slide-ed__check' });
        var box = el('input', { type: 'checkbox' });
        box.checked = !!s.showFacts;
        box.addEventListener('change', function () { save({ showFacts: box.checked }); });
        facts.appendChild(box);
        facts.appendChild(FF.ui.span('', t('celSlideFacts', 'Show the date, time and place')));
        form.appendChild(facts);
        var bgs = [['theme', ['celSlideBgTheme', 'Event colours']]];
        if (opts.ev && opts.ev.cover) bgs.push(['cover', ['celSlideBgCover', 'Cover photo, softened']]);
        form.appendChild(field(t('celSlideBg', 'Background'), chips(t('celSlideBg', 'Background'), bgs, s.background, function (v) { save({ background: v }); })));
      } else {
        form.appendChild(field(s.kind === 'picture' ? t('celSlidePic', 'Picture (a wide 16:9 picture fills the TV)') : t('celSlidePics', 'Pictures (up to {n}, shown in this order)', { n: PICTURES_MAX }), pictures()));
        if (s.kind === 'slideshow') {
          var secs = el('select', { class: 'input' });
          [4, 6, 8, 10, 12, 15, 20, 30].forEach(function (n) {
            var o = el('option', { value: String(n) }, t('celSlideSecs', '{n} seconds', { n: n }));
            if (n === s.seconds) o.selected = true;
            secs.appendChild(o);
          });
          secs.addEventListener('change', function () { save({ seconds: Number(secs.value) }); });
          form.appendChild(field(t('celSlideEach', 'Each picture shows for'), secs));
        }
      }
      form.appendChild(field(t('celSlideMotion', 'Movement'), chips(t('celSlideMotion', 'Movement'), MOTIONS, s.motion, function (v) { save({ motion: v }); })));
      form.appendChild(field(t('celSlideEffect', 'Effect'), chips(t('celSlideEffect', 'Effect'), FF.CelebrateEffects.KINDS, s.effect, function (v) { save({ effect: v }); })));
      if (opts.onShow) {
        form.appendChild(FF.UI.button(t('celSlideShowNow', 'Show on the TV now'), { class: 'btn-primary', icon: 'monitor', onClick: opts.onShow }));
      }
    }

    root.stop = function () { if (st.handle) st.handle.stop(); };
    return root;
  }

  FF.CelebrateSlide = { render: render, editor: editor, normal: normal };
})();
