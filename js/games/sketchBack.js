/* ============================================================
   PLAYMONA — games/sketchBack.js
   SketchBack: Draw it. Remember it. Name it.

   A black-and-white sketch and its name appear for a few seconds;
   the player copies it on the paper below. At zero the sketch
   vanishes and the paper locks. After every sketch comes the
   memory part: the player's own drawings, shuffled and without
   names, and for each one "What did you draw?". 100 points for
   every drawing named right; nothing for drawing well.

   Solo here; online rooms in online() below, refereed by the
   server (js/sketchback/referee.js). Rules in js/sketchback/rules.js,
   the paper in js/sketchback/pad.js, objects in js/data/sketches.js.
   Listed on the games pages only once enough sketches exist.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.SketchBackRules;
  var ART = 'sketchback';
  var SETUP_KEY = 'sketchBack:setup';
  var RUN_KEY = 'sketchBack:run';
  var RUN_MAX_AGE = 30 * 60 * 1000;   // an unfinished game can be continued for half an hour
  var READY_MS = 2400;                // "3, 2, 1" before the first sketch
  var NEXT_MS = 700;                  // between sketches
  var WARN_MS = 1500;                 // the clock pulses in its last moments
  var TICK_MS = 50;

  function t(key, fallback, vars) { return FF.t ? FF.t(key, fallback, vars) : String(fallback); }
  function store() { return FF.Storage || { get: function (k, d) { return d; }, set: function () {}, remove: function () {} }; }
  function rand0() { return FF._rand ? FF._rand() : Math.random(); }
  function reduceMotion() {
    try {
      if (document.documentElement.getAttribute('data-reduce') === '1') return true;
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { return false; }
  }
  function animationsOn() { return !reduceMotion() && (!FF.Settings || !FF.Settings.get || FF.Settings.get('animations') !== false); }
  function racingRoom(api) { return !!(api.config.room && FF.Room && FF.Room.current()); }
  function stillShown(api) { return !!(api.shell.root && document.body && document.body.contains(api.shell.root)); }
  function later(fn, ms) { return setTimeout(fn, animationsOn() ? ms : Math.min(ms, 80)); }
  function el(tag, cls, text) { return FF.ui.el(tag, cls ? { class: cls } : {}, text); }
  function forget(key) { try { if (store().remove) store().remove(key); else store().set(key, null); } catch (e) { /* storage off */ } }
  function keep(key, v) { try { store().set(key, v); } catch (e) { /* storage full or off */ } }

  function levelName(l) { return l === 'easy' ? t('easy', 'Easy') : l === 'hard' ? t('hard', 'Hard') : t('normal', 'Normal'); }
  function nameOf(id) { var o = R.object(id); return o ? t('skbObj_' + id, o.name) : String(id); }
  function clockText(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
  }
  function summary(s) {
    var c = R.sanitize(s);
    return [t('skbNSketches', '{n} sketches', { n: c.count }), levelName(c.level), t('skbSecsEach', '{n} s each', { n: R.SECONDS[c.level] })].join(' · ');
  }

  /* ---------- pictures ---------- */

  function hasSketch(id) {
    var files = FF.SketchFiles && FF.SketchFiles.ids;
    return !!(files && files.indexOf(id) !== -1);
  }
  function sketchSrc(id) { return FF.Assets ? FF.Assets.artPath(ART, id) : 'assets/images/' + ART + '/' + id + '.webp'; }
  /* The reference sketch. Never named in alt text: the label beside it does that while it shows. */
  function sketchEl(id, cls) {
    var box = el('div', 'skb-ref__art' + (cls ? ' ' + cls : ''));
    if (hasSketch(id)) box.appendChild(FF.ui.el('img', { src: sketchSrc(id), alt: '', draggable: 'false', decoding: 'async' }));
    else box.appendChild(el('span', 'skb-ref__none', t('skbNoSketch', 'No sketch yet')));   // dev preview only
    return box;
  }
  function preload(ids) {
    if (typeof Image !== 'function') return;
    ids.forEach(function (id) { if (hasSketch(id)) { var im = new Image(); im.src = sketchSrc(id); } });
  }

  /* ---------- small pieces ---------- */

  var GLYPHS = {
    pencil: '<path d="M4 20l1.2-4.6L15.8 4.8a2 2 0 0 1 2.8 0l.6.6a2 2 0 0 1 0 2.8L8.6 18.8z"/><path d="M13.5 7l3.5 3.5"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    clear: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    cross: '<path d="M6 6l12 12M18 6L6 18"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.5 6.6C3.8 8.3 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 4.5-1.1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    play: '<path d="M7 5v14l12-7z"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4"/><path d="M12 13v4M8 20h8M10 17h4"/>',
    soundOn: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/>',
    soundOff: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9l5 6M22 9l-5 6"/>'
  };
  function glyph(name, cls) {
    var s = document.createElement('span');
    s.className = 'skb-glyph' + (cls ? ' ' + cls : '');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + GLYPHS[name] + '</svg>';
    return s;
  }
  function button(cls, icon, label, onClick) {
    var b = FF.ui.el('button', { type: 'button', class: 'skb-btn' + (cls ? ' ' + cls : '') });
    if (icon) b.appendChild(glyph(icon));
    if (label) b.appendChild(FF.ui.span('', label));
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }
  function chip(text, cls) { return FF.ui.span('skb-chip' + (cls ? ' ' + cls : ''), text); }
  function soundButton() {
    var b = FF.ui.el('button', { type: 'button', class: 'skb-iconbtn' });
    function sync() {
      var on = !FF.Audio || FF.Audio.effectsEnabled !== false;
      FF.ui.clear(b);
      b.appendChild(glyph(on ? 'soundOn' : 'soundOff'));
      var label = on ? t('gsFxOff', 'Turn sound effects off') : t('gsFxOn', 'Turn sound effects on');
      b.setAttribute('aria-label', label);
      b.title = label;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    b.addEventListener('click', function () {
      if (FF.Audio && FF.Audio.setEffects) FF.Audio.setEffects(FF.Audio.effectsEnabled === false);
      else if (FF.Audio) FF.Audio.effectsEnabled = FF.Audio.effectsEnabled === false;
      sync();
    });
    sync();
    return b;
  }
  function countUp(node, to, ms, fmt) {
    fmt = fmt || function (v) { return FF.util && FF.util.formatNumber ? FF.util.formatNumber(v) : String(v); };
    if (!animationsOn() || !to) { node.textContent = fmt(to); return; }
    var start = Date.now();
    var iv = setInterval(function () {
      var p = Math.min(1, (Date.now() - start) / ms);
      node.textContent = fmt(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p >= 1 || !node.isConnected) clearInterval(iv);
    }, 30);
  }

  /* The countdown ring: an SVG circle that empties as the sketch's time runs out. */
  function timerRing() {
    var wrap = el('div', 'skb-ring');
    wrap.setAttribute('role', 'timer');
    wrap.innerHTML = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle class="skb-ring__track" cx="24" cy="24" r="20"/>' +
      '<circle class="skb-ring__bar" cx="24" cy="24" r="20" pathLength="100"/></svg>';
    var num = el('span', 'skb-ring__num', '');
    wrap.appendChild(num);
    var bar = wrap.querySelector('.skb-ring__bar');
    return {
      el: wrap,
      set: function (leftMs, totalMs) {
        var p = totalMs ? Math.max(0, Math.min(1, leftMs / totalMs)) : 0;
        if (bar) bar.style.strokeDashoffset = String(100 - p * 100);
        var s = Math.ceil(leftMs / 1000);
        num.textContent = String(Math.max(0, s));
        wrap.setAttribute('aria-label', t('skbSecondsLeft', '{n} seconds left', { n: Math.max(0, s) }));
        wrap.classList.toggle('is-warn', leftMs > 0 && leftMs <= WARN_MS);
        wrap.classList.toggle('is-out', leftMs <= 0);
      }
    };
  }

  /* ---------- the frame ---------- */

  function frame(api, cls) {
    var root = api.shell.root;
    FF.ui.clear(root);
    if (api.shell.el) api.shell.el.classList.add('skb-shell');
    var skb = el('div', 'skb' + (cls ? ' ' + cls : ''));
    var top = el('div', 'skb-top');
    var brand = el('div', 'skb-brand');
    brand.appendChild(glyph('pencil', 'skb-brand__icon'));
    var word = FF.ui.span('skb-brand__word');
    word.appendChild(FF.ui.span('skb-brand__a', 'Sketch'));
    word.appendChild(FF.ui.span('skb-brand__b', 'Back'));
    brand.appendChild(word);
    top.appendChild(brand);
    var chips = el('div', 'skb-chips');
    top.appendChild(chips);
    top.appendChild(soundButton());
    skb.appendChild(top);
    var main = el('div', 'skb-main');
    skb.appendChild(main);
    root.appendChild(skb);
    return { root: skb, top: top, chips: chips, main: main };
  }

  /* A sample sketch for the setup screen: a real one when the art is in, else a drawn tree. */
  function demoSketch() {
    var pick = ['tree', 'cat', 'bicycle', 'umbrella'].filter(hasSketch)[0];
    if (pick) return sketchEl(pick, 'skb-demo__art');
    var box = el('div', 'skb-ref__art skb-demo__art');
    box.innerHTML = '<svg viewBox="0 0 120 120" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M54 108c2-14 2-26 0-38M66 108c-2-14-2-26 0-38M54 82c-6-4-10-4-14-2M66 78c6-4 10-5 15-3"/>' +
      '<path d="M40 74c-14 1-24-8-22-20 1-8 8-13 15-13-1-12 9-21 21-20 6-9 20-10 28-2 11-2 21 7 19 18 8 4 10 15 3 22-5 6-13 7-19 5-6 6-17 7-24 2-6 5-15 5-21 0z"/>' +
      '<path d="M48 108h26"/></svg>';
    return box;
  }

  /* ================= setup ================= */

  /* Where a saved game picks up: the sketch that was up when it stopped stays blank. */
  function resumeText(run) {
    var n = run.deal.length;
    var done = run.drawings.length + (run.open != null && run.open === run.drawings.length ? 1 : 0);
    if (run.recall || done >= n) return t('skbResumeNaming', 'You have a game going: naming your drawings.');
    return t('skbResumeText', 'You have a game going: sketch {k} of {n}.', { k: done + 1, n: n });
  }

  function setupScreen(api, resume, onGo, onResume) {
    api.shell.hideTimer();
    if (FF.GameLength && FF.GameLength.pause) FF.GameLength.pause();
    var c = R.sanitize(store().get(SETUP_KEY, null) || R.STANDARD);
    var f = frame(api, 'skb--setup');

    var hero = el('section', 'skb-hero');
    var demo = el('div', 'skb-demo');
    demo.appendChild(demoSketch());
    var copy = el('div', 'skb-demo__copy');
    copy.appendChild(glyph('pencil'));
    demo.appendChild(copy);
    hero.appendChild(demo);
    var words = el('div', 'skb-hero__words');
    words.appendChild(el('h2', 'skb-hero__title', t('skbTagline', 'Draw it. Remember it. Name it.')));
    var how = el('ol', 'skb-how');
    [t('skbHow1', 'Copy each sketch before the clock runs out.'),
      t('skbHow2', 'It vanishes, and your paper locks.'),
      t('skbHow3', 'Then name your own drawings. 100 points for each one you get right.')].forEach(function (x, i) {
      var li = el('li', '');
      li.appendChild(FF.ui.span('skb-how__n', String(i + 1)));
      li.appendChild(FF.ui.span('', x));
      how.appendChild(li);
    });
    words.appendChild(how);
    hero.appendChild(words);
    f.main.appendChild(hero);

    var panel = el('section', 'skb-card skb-setup');
    if (resume) {
      var cont = el('div', 'skb-resume');
      cont.appendChild(el('p', 'skb-resume__text', resumeText(resume)));
      cont.appendChild(button('skb-btn--soft', 'play', t('skbContinue', 'Continue'), function () { api.audio.play('select'); onResume(resume); }));
      panel.appendChild(cont);
    }
    function field(label) {
      var wrap = el('div', 'skb-field');
      wrap.appendChild(el('h3', 'skb-h', label));
      return wrap;
    }
    var countField = field(t('skbHowMany', 'Sketches'));
    var seg = FF.ui.el('div', { class: 'skb-seg', role: 'group', 'aria-label': t('skbHowMany', 'Sketches') });
    var countBtns = R.COUNTS.map(function (n) {
      var b = FF.ui.el('button', { type: 'button', class: 'skb-seg__btn' }, String(n));
      b.addEventListener('click', function () { c.count = n; api.audio.play('tap'); sync(); });
      seg.appendChild(b);
      return { el: b, id: n };
    });
    countField.appendChild(seg);
    panel.appendChild(countField);

    var levelField = field(t('skbDifficulty', 'Difficulty'));
    var levels = FF.ui.el('div', { class: 'skb-levels', role: 'group', 'aria-label': t('skbDifficulty', 'Difficulty') });
    var levelBtns = R.LEVELS.map(function (l) {
      var b = FF.ui.el('button', { type: 'button', class: 'skb-level skb-lv-' + l });
      b.appendChild(FF.ui.span('skb-level__name', levelName(l)));
      b.appendChild(FF.ui.span('skb-level__meta', t('skbSecsPer', '{n} seconds a sketch', { n: R.SECONDS[l] })));
      b.addEventListener('click', function () { c.level = l; api.audio.play('select'); sync(); });
      levels.appendChild(b);
      return { el: b, id: l };
    });
    levelField.appendChild(levels);
    panel.appendChild(levelField);

    var info = FF.ui.el('p', { class: 'skb-note', 'aria-live': 'polite' });
    panel.appendChild(info);
    var go = button('skb-btn--go skb-btn--big', 'pencil', t('skbStart', 'Start drawing'), function () {
      var cfg = R.sanitize(c);
      keep(SETUP_KEY, cfg);
      api.audio.play('roundStart');
      if (FF.GameLength && FF.GameLength.resume) FF.GameLength.resume();
      onGo(cfg);
    });
    panel.appendChild(go);
    f.main.appendChild(panel);

    function sync() {
      countBtns.forEach(function (x) { x.el.classList.toggle('is-on', x.id === c.count); x.el.setAttribute('aria-pressed', x.id === c.count ? 'true' : 'false'); });
      levelBtns.forEach(function (x) { x.el.classList.toggle('is-on', x.id === c.level); x.el.setAttribute('aria-pressed', x.id === c.level ? 'true' : 'false'); });
      var ranked = FF.Leaderboards && FF.Leaderboards.active && FF.Leaderboards.active(api.def);
      info.textContent = ranked && !R.isStandard(c) ? t('nrUnranked', 'Leaderboards use the standard settings') : summary(c);
    }
    sync();
    if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(panel);
  }

  /* ================= drawing ================= */

  /* One sketch: the reference, its name and the clock on top, the paper below.
     opts: { k, total, id, secs, until() -> the moment it closes (ms), now(), onDone(strokes), ready } */
  function drawScreen(api, f, opts) {
    FF.ui.clear(f.main);
    FF.ui.clear(f.chips);
    f.chips.appendChild(chip(t('skbSketchOf', 'Sketch {k}/{n}', { k: opts.k + 1, n: opts.total }), 'skb-chip--round'));
    f.chips.appendChild(chip(levelName(opts.level), 'skb-chip--level skb-lv-' + opts.level));

    var view = el('div', 'skb-draw' + (animationsOn() ? ' is-animated' : ''));
    var ref = el('section', 'skb-ref');
    var head = el('div', 'skb-ref__head');
    var label = el('div', 'skb-ref__label');
    label.appendChild(el('span', 'skb-ref__kicker', t('skbCopyThis', 'Copy this')));
    label.appendChild(el('h2', 'skb-ref__name', nameOf(opts.id)));
    head.appendChild(label);
    var ring = timerRing();
    head.appendChild(ring.el);
    ref.appendChild(head);
    ref.appendChild(sketchEl(opts.id));
    var gone = el('div', 'skb-ref__gone');
    gone.appendChild(glyph('eyeOff'));
    gone.appendChild(el('span', '', t('skbGone', 'Gone! On to the next one')));
    ref.appendChild(gone);
    view.appendChild(ref);

    var sheet = el('section', 'skb-sheet');
    var paper = el('div', 'skb-paper');
    var canvas = FF.ui.el('canvas', { class: 'skb-paper__canvas', 'aria-label': t('skbPaper', 'Your drawing paper') });
    paper.appendChild(canvas);
    var lockMark = el('div', 'skb-paper__lock');
    lockMark.appendChild(glyph('check'));
    lockMark.appendChild(el('span', '', t('skbSaved', 'Saved')));
    paper.appendChild(lockMark);
    sheet.appendChild(paper);
    var tools = el('div', 'skb-tools');
    var undo = button('skb-btn--tool', 'undo', t('skbUndo', 'Undo'), function () { pad.undo(); });
    var clear = button('skb-btn--tool', 'clear', t('skbClear', 'Clear'), function () { pad.clear(); });
    tools.appendChild(undo);
    tools.appendChild(el('p', 'skb-hint', t('skbHint', 'Copy the sketch above')));
    tools.appendChild(clear);
    sheet.appendChild(tools);
    view.appendChild(sheet);
    f.main.appendChild(view);

    var pad = FF.SketchPad.create(canvas, { onChange: syncTools });
    function syncTools() {
      var off = pad.locked() || pad.isEmpty();
      undo.disabled = off;
      clear.disabled = off;
    }
    syncTools();

    var total = opts.secs * 1000;
    var done = false, iv = null, warned = false;
    function tick() {
      if (done) return;
      if (!stillShown(api)) { stop(); return; }
      var left = opts.until() - opts.now();
      ring.set(left, total);
      if (!warned && left <= WARN_MS && left > 0) { warned = true; api.audio.play('warning'); }
      if (left <= 0) finish();
    }
    function finish() {
      if (done) return;
      done = true;
      clearInterval(iv);
      // The sketch and its name go in the same frame as the paper locks.
      view.classList.add('is-gone');
      pad.lock();
      syncTools();
      api.audio.play('whoosh');
      opts.onDone(pad.strokes());
    }
    function stop() { done = true; clearInterval(iv); pad.destroy(); }
    ring.set(total, total);
    iv = setInterval(tick, TICK_MS);
    tick();
    return { stop: stop, finish: finish, strokes: pad.strokes };
  }

  /* "3, 2, 1" over the first sketch's place, before its clock starts. */
  function readyScreen(api, f, opts, onGo) {
    FF.ui.clear(f.main);
    var box = el('section', 'skb-card skb-ready');
    box.appendChild(el('p', 'skb-ready__kicker', t('skbGetReady', 'Get ready')));
    box.appendChild(el('h2', 'skb-ready__title', t('skbReadyLine', '{n} sketches · {s} seconds each', { n: opts.total, s: opts.secs })));
    var num = el('div', 'skb-ready__num', '3');
    box.appendChild(num);
    box.appendChild(el('p', 'skb-ready__tip', t('skbReadyTip', 'Draw fast. Later you must remember what each drawing was.')));
    f.main.appendChild(box);
    var n = 3;
    api.audio.play('countdown');
    var iv = setInterval(function () {
      if (!stillShown(api)) { clearInterval(iv); return; }
      n--;
      if (n <= 0) { clearInterval(iv); onGo(); return; }
      num.textContent = String(n);
      num.classList.remove('is-pop');
      void num.offsetWidth;
      num.classList.add('is-pop');
      api.audio.play('countdown');
    }, READY_MS / 3);
  }

  /* ================= naming ================= */

  /* The gallery of the player's own drawings, shuffled, with no names.
     opts: { drawings: [encoded], order: [k], answers: {k: text}, startedAt, now(), limitMs,
             onAnswer(k, text), onFinish(answers), waiting? } */
  function recallScreen(api, f, opts) {
    FF.ui.clear(f.main);
    FF.ui.clear(f.chips);
    var answers = opts.answers || {};
    var n = opts.drawings.length;
    var countChip = chip('', 'skb-chip--round');
    f.chips.appendChild(countChip);

    var wrap = el('section', 'skb-recall');
    var head = el('div', 'skb-recall__head');
    head.appendChild(el('h2', 'skb-recall__title', t('skbWhatDidYouDraw', 'What did you draw?')));
    head.appendChild(el('p', 'skb-recall__sub', t('skbRecallSub', 'Tap each drawing and name it. The answers come at the end.')));
    var note = FF.ui.el('p', { class: 'skb-note skb-recall__note', 'aria-live': 'polite' });
    head.appendChild(note);
    wrap.appendChild(head);
    var grid = el('div', 'skb-gallery');
    var cards = {};
    opts.order.forEach(function (k, i) {
      var card = FF.ui.el('button', { type: 'button', class: 'skb-tile' });
      card.style.setProperty('--i', String(i));
      var art = el('div', 'skb-tile__paper');
      var cv = FF.ui.el('canvas', { class: 'skb-tile__canvas' });
      art.appendChild(cv);
      card.appendChild(art);
      var foot = el('div', 'skb-tile__foot');
      card.appendChild(foot);
      card.addEventListener('click', function () { api.audio.play('tap'); ask(k); });
      grid.appendChild(card);
      cards[k] = { el: card, canvas: cv, foot: foot, n: i + 1 };
    });
    wrap.appendChild(grid);
    var bar = el('div', 'skb-recall__bar');
    var go = button('skb-btn--go skb-btn--big', 'trophy', t('seeResults', 'See results'), function () {
      if (go.disabled) return;
      finish();
    });
    bar.appendChild(go);
    wrap.appendChild(bar);
    f.main.appendChild(wrap);

    // Thumbnails are painted once they have a size.
    setTimeout(function () {
      opts.order.forEach(function (k) { FF.SketchPad.paint(cards[k].canvas, R.decode(opts.drawings[k])); });
    }, 0);

    var modal = null, finished = false, noted = false;
    function sync() {
      var named = Object.keys(answers).filter(function (k) { return String(answers[k] || '').trim(); }).length;
      countChip.textContent = t('skbNamedOf', '{a} of {n} named', { a: named, n: n });
      opts.order.forEach(function (k) {
        var c = cards[k];
        var text = String(answers[k] || '').trim();
        c.el.classList.toggle('is-done', !!text);
        FF.ui.clear(c.foot);
        if (text) {
          c.foot.appendChild(glyph('check', 'skb-tile__tick'));
          c.foot.appendChild(el('span', 'skb-tile__answer', text));
          c.el.setAttribute('aria-label', t('skbDrawingNamed', 'Drawing {n}, named {a}', { n: c.n, a: text }));
        } else {
          c.foot.appendChild(el('span', 'skb-tile__ask', t('skbNameIt', 'Name it')));
          c.el.setAttribute('aria-label', t('skbDrawingN', 'Drawing {n}, not named yet', { n: c.n }));
        }
      });
      go.disabled = named < n;
      go.classList.toggle('is-ready', named === n);
    }

    function ask(k) {
      if (finished) return;
      closeModal();
      var back = el('div', 'skb-modal');
      var box = FF.ui.el('div', { class: 'skb-modal__box', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'skb-modal-title' });
      var x = FF.ui.el('button', { type: 'button', class: 'skb-iconbtn skb-modal__close', 'aria-label': t('close', 'Close') });
      x.appendChild(glyph('cross'));
      x.addEventListener('click', closeModal);
      box.appendChild(x);
      var paper = el('div', 'skb-paper skb-paper--big');
      var cv = FF.ui.el('canvas', { class: 'skb-paper__canvas' });
      paper.appendChild(cv);
      box.appendChild(paper);
      box.appendChild(FF.ui.el('h2', { class: 'skb-modal__title', id: 'skb-modal-title' }, t('skbWhatDidYouDraw', 'What did you draw?')));
      var form = FF.ui.el('form', { class: 'skb-answer', autocomplete: 'off' });
      var input = FF.ui.el('input', {
        type: 'text', class: 'skb-answer__input', maxlength: '40', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
        enterkeyhint: 'done', 'aria-label': t('skbWhatDidYouDraw', 'What did you draw?'), placeholder: t('skbAnswerHint', 'Type what it is')
      });
      input.value = answers[k] || '';
      form.appendChild(input);
      var submit = FF.ui.el('button', { type: 'submit', class: 'skb-btn skb-btn--go' });
      submit.appendChild(glyph('check'));
      submit.appendChild(FF.ui.span('', t('skbSubmit', 'Submit')));
      form.appendChild(submit);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var v = input.value.trim().slice(0, 40);
        if (!v) {
          input.classList.remove('is-shake');
          void input.offsetWidth;
          input.classList.add('is-shake');
          input.focus();
          return;
        }
        answers[k] = v;
        opts.onAnswer(k, v);
        api.audio.play('select');
        closeModal();
        sync();
        var c = cards[k];
        c.el.classList.remove('is-pop');
        void c.el.offsetWidth;
        c.el.classList.add('is-pop');
        c.el.focus();
      });
      box.appendChild(form);
      back.appendChild(box);
      back.addEventListener('click', function (e) { if (e.target === back) closeModal(); });
      back.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeModal(); } }, true);
      f.root.appendChild(back);
      modal = { el: back, input: input, k: k };
      setTimeout(function () { FF.SketchPad.paint(cv, R.decode(opts.drawings[k])); input.focus(); }, 0);
    }
    function closeModal() {
      if (!modal) return;
      var k = modal.k;
      if (modal.el.parentNode) modal.el.parentNode.removeChild(modal.el);
      modal = null;
      if (cards[k]) cards[k].el.focus();
    }

    function finish() {
      if (finished) return;
      // Time ran out with the answer box open: what was written there counts too.
      if (modal) {
        var v = modal.input.value.trim().slice(0, 40);
        if (v) { answers[modal.k] = v; opts.onAnswer(modal.k, v); }
      }
      finished = true;
      clearInterval(iv);
      closeModal();
      opts.onFinish(answers);
    }

    var iv = setInterval(function () {
      if (finished) return;
      if (!stillShown(api)) { clearInterval(iv); return; }
      var used = opts.now() - opts.startedAt;
      if (!noted && used >= R.RECALL_NOTE_MS) {
        noted = true;
        note.textContent = t('skbThirtyLeft', '30 seconds left to name your drawings.');
        note.classList.add('is-on');
      }
      if (used >= opts.limitMs) { api.audio.play('roundEnd'); finish(); }
    }, 250);

    sync();
    return { finish: finish, stop: function () { finished = true; clearInterval(iv); closeModal(); } };
  }

  /* ================= results ================= */

  /* opts: { deal, drawings, answers, ok: [bool], timeMs, title?, onDone, doneLabel, extra? (an element) } */
  function resultsScreen(api, f, opts) {
    FF.ui.clear(f.main);
    FF.ui.clear(f.chips);
    var s = R.score(opts.ok);
    var wrap = el('section', 'skb-results' + (animationsOn() ? ' is-animated' : ''));
    var head = el('div', 'skb-card skb-results__head');
    head.appendChild(el('p', 'skb-results__kicker', opts.title || t('skbResults', 'Your results')));
    var big = el('div', 'skb-results__score');
    var pts = el('span', 'skb-results__pts', '0');
    big.appendChild(pts);
    big.appendChild(el('span', 'skb-results__unit', t('points', 'points')));
    head.appendChild(big);
    head.appendChild(el('p', 'skb-results__line', s.accuracy >= 80 ? t('skbGreatMemory', 'What a memory!')
      : s.accuracy >= 50 ? t('skbGoodMemory', 'Nicely remembered.') : t('skbTryAgain', 'Tricky! Try again and draw the shape that stands out.')));
    var stats = el('div', 'skb-stats');
    [
      [t('skbStatSketches', 'Sketches'), s.total],
      [t('skbStatCorrect', 'Correct'), s.correct, 'is-good'],
      [t('skbStatWrong', 'Wrong'), s.wrong, 'is-bad'],
      [t('skbStatAccuracy', 'Accuracy'), s.accuracy, '', function (v) { return v + '%'; }],
      [t('skbStatTime', 'Time to name'), opts.timeMs, '', clockText]
    ].forEach(function (row) {
      var tile = el('div', 'skb-stat ' + (row[2] || ''));
      var v = el('span', 'skb-stat__v', '');
      tile.appendChild(v);
      tile.appendChild(el('span', 'skb-stat__k', row[0]));
      stats.appendChild(tile);
      if (row[4] === clockText) v.textContent = clockText(row[1]);
      else countUp(v, row[1], 700, row[3]);
    });
    head.appendChild(stats);
    var done = button('skb-btn--go skb-btn--big', 'trophy', opts.doneLabel || t('skbFinish', 'Finish'), function () { opts.onDone(); });
    head.appendChild(done);
    wrap.appendChild(head);
    countUp(pts, s.points, 900);
    if (opts.extra) wrap.appendChild(opts.extra);

    wrap.appendChild(el('h3', 'skb-h skb-results__h', t('skbYourDrawings', 'Your drawings')));
    var list = el('ol', 'skb-review');
    opts.deal.forEach(function (id, k) {
      var good = !!opts.ok[k];
      var li = el('li', 'skb-review__row ' + (good ? 'is-good' : 'is-bad'));
      li.style.setProperty('--i', String(k));
      var pair = el('div', 'skb-review__pair');
      var mine = el('div', 'skb-paper skb-paper--thumb');
      var cv = FF.ui.el('canvas', { class: 'skb-paper__canvas' });
      mine.appendChild(cv);
      mine.appendChild(el('span', 'skb-review__tag', t('skbYours', 'Yours')));
      pair.appendChild(mine);
      var refBox = el('div', 'skb-paper skb-paper--thumb skb-paper--ref');
      refBox.appendChild(sketchEl(id));
      refBox.appendChild(el('span', 'skb-review__tag', t('skbOriginal', 'Original')));
      pair.appendChild(refBox);
      li.appendChild(pair);
      var words = el('div', 'skb-review__words');
      var said = String(opts.answers[k] || '').trim();
      words.appendChild(el('p', 'skb-review__said', said ? t('skbYouSaid', 'You said “{a}”', { a: said }) : t('skbNoAnswer', 'No answer')));
      words.appendChild(el('p', 'skb-review__truth', t('skbItWas', 'It was {name}', { name: nameOf(id) })));
      li.appendChild(words);
      var badge = el('span', 'skb-review__badge');
      badge.appendChild(glyph(good ? 'check' : 'cross'));
      badge.setAttribute('aria-label', good ? t('correct', 'Correct') : t('wrong', 'Wrong'));
      badge.setAttribute('role', 'img');
      li.appendChild(badge);
      list.appendChild(li);
      setTimeout(function () { FF.SketchPad.paint(cv, R.decode(opts.drawings[k])); }, 0);
    });
    wrap.appendChild(list);
    f.main.appendChild(wrap);

    api.audio.play(s.accuracy >= 50 ? 'winner' : 'roundEnd');
    if (s.accuracy >= 80 && animationsOn() && FF.Confetti) FF.Confetti.burst(90);
    if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(head);
    return s;
  }

  /* ================= solo ================= */

  function scorer(config) {
    var list = (config.scorers && config.scorers.length) ? config.scorers : (config.players && config.players.length) ? config.players : null;
    return list ? list[0] : { id: 'p1', name: t('you', 'You'), avatar: null };
  }

  /* The saved game, if it can still be continued. */
  function savedRun(api) {
    var run = store().get(RUN_KEY, null);
    if (!run || typeof run !== 'object' || !Array.isArray(run.deal) || !Array.isArray(run.drawings)) return null;
    if (!(Date.now() - (run.savedAt || 0) < RUN_MAX_AGE)) return null;
    if ((run.daily || null) !== (api.config.daily || null)) return null;
    if (!run.deal.every(function (id) { return !!R.object(id); })) return null;
    return run;
  }

  function play(api, run) {
    var who = scorer(api.config);
    var f = frame(api, 'skb--play');
    var cfg = R.sanitize(run.settings);
    var secs = R.SECONDS[cfg.level];
    var current = null;
    preload(run.deal);

    function save() { run.savedAt = Date.now(); keep(RUN_KEY, run); }

    function nextSketch() {
      if (!stillShown(api)) return;
      var k = run.drawings.length;
      if (k >= run.deal.length) { startRecall(); return; }
      var until = Date.now() + secs * 1000;
      run.open = k;     // a reload while this sketch is up leaves it blank (see resume)
      save();
      api.audio.play('roundStart');
      current = drawScreen(api, f, {
        k: k, total: run.deal.length, id: run.deal[k], secs: secs, level: cfg.level,
        until: function () { return until; }, now: Date.now,
        onDone: function (strokes) {
          run.drawings.push(R.encode(strokes));
          run.open = null;
          save();
          later(nextSketch, NEXT_MS);
        }
      });
    }

    function startRecall() {
      if (!run.recall) {
        run.recall = { startedAt: Date.now(), answers: {} };
        save();
      }
      api.audio.play('flip');
      recallScreen(api, f, {
        drawings: run.drawings,
        order: R.recallOrder(run.drawings.length, run.seed, who.id),
        answers: run.recall.answers,
        startedAt: run.recall.startedAt,
        now: Date.now,
        limitMs: R.RECALL_MS,
        onAnswer: function (k, v) { run.recall.answers[k] = v; save(); },
        onFinish: function (answers) {
          run.recall.answers = answers;
          run.recall.endedAt = Math.min(Date.now(), run.recall.startedAt + R.RECALL_MS);
          save();
          results();
        }
      });
    }

    var scored = false;
    function results() {
      forget(RUN_KEY);
      var answers = run.recall.answers || {};
      var ok = run.deal.map(function (id, k) { return R.check(answers[k], id).ok; });
      if (!scored) {
        scored = true;
        ok.forEach(function (good) {
          if (good) api.scoring.add(who.id, R.POINTS, { correct: true });
          else api.scoring.add(who.id, 0, { wrong: true });
        });
      }
      if (ok.length) api.audio.play(ok.some(Boolean) ? 'correct' : 'wrong');
      resultsScreen(api, f, {
        deal: run.deal, drawings: run.drawings, answers: answers, ok: ok,
        timeMs: (run.recall.endedAt || Date.now()) - run.recall.startedAt,
        onDone: function () {
          var res = api.scoring.results ? api.scoring.results() : null;
          var correct = ok.filter(Boolean).length;
          api.end({ results: (res && res.results) || [], winnerId: res ? res.winnerId : null, quizCorrect: correct, quizAnswered: ok.length });
        }
      });
    }

    if (run.recall && run.recall.endedAt) { results(); return; }
    if (run.drawings.length >= run.deal.length) { startRecall(); return; }
    if (run.drawings.length === 0 && run.open == null) {
      readyScreen(api, f, { total: run.deal.length, secs: secs }, nextSketch);
    } else {
      // Continued after a reload: a sketch that was up when the page went away stays blank.
      if (run.open != null && run.open === run.drawings.length) { run.drawings.push(''); run.open = null; save(); }
      nextSketch();
    }
  }

  function newRun(api, cfg) {
    // One number decides the whole deal, drawn first so a challenge or the daily game deals the same everywhere.
    var seed = String(Math.floor(rand0() * 4294967296));
    return { v: 1, seed: seed, settings: R.sanitize(cfg), deal: R.deal(cfg, seed), drawings: [], open: null, recall: null, daily: api.config.daily || null, savedAt: Date.now() };
  }

  /* ================= registration ================= */

  FF.SketchBackGame = { summary: summary, drawScreen: drawScreen, recallScreen: recallScreen, resultsScreen: resultsScreen, frame: frame, sketchEl: sketchEl };

  var preview = false;
  try { preview = !!(window.localStorage && window.localStorage.getItem('playmona:sketchPreview') === '1'); } catch (e) { /* storage off */ }
  if (!R.listed(FF.SketchFiles && FF.SketchFiles.ids, preview)) return;

  FF.registerGame({
    id: 'sketchBack',
    name: 'SketchBack',
    description: 'Draw it. Remember it. Name it. Copy each sketch before it vanishes, then name your own drawings from memory.',
    category: 'memory',
    icon: '✏️',
    players: [1, R.MAX_PLAYERS],
    difficulty: 'Normal',
    duration: 4,
    tags: ['memory', 'drawing', 'sketch', 'online'],
    modes: ['solo'],
    defaultMode: 'solo',
    leaderboard: true,
    howToPlay: [
      'A black-and-white sketch appears with its name. Copy it on the paper below before the clock runs out.',
      'When time is up the sketch vanishes and your paper locks. You can Undo or Clear until then.',
      'After the last sketch, your drawings come back shuffled and without names. Tap each one and type what you drew.',
      'Small spelling slips and other names count (bike for bicycle, TV for television). Vague answers like “animal” do not.',
      '100 points for every drawing you name right. Nothing for drawing well: it is all memory.',
      'You have 3 minutes to name them all. Easy gives 7 seconds a sketch, Normal 5, Hard 4.'
    ],
    start: function (api) {
      var room = FF.Room && FF.Room.current();
      if (racingRoom(api) && room && FF.SketchBackGame.online) { FF.SketchBackGame.online(api, room); return; }
      if (api.config.daily || api.config.challenge) {
        var saved = savedRun(api);
        play(api, saved && api.config.daily ? saved : newRun(api, R.STANDARD));
        return;
      }
      var fresh = newRun(api, R.STANDARD);   // the seed is drawn before the setup, as other games do
      setupScreen(api, savedRun(api), function (cfg) {
        if (!stillShown(api)) return;
        if (!R.isStandard(cfg)) api.config.customRules = true;
        fresh.settings = R.sanitize(cfg);
        fresh.deal = R.deal(fresh.settings, fresh.seed);
        play(api, fresh);
      }, function (resume) {
        if (!R.isStandard(resume.settings)) api.config.customRules = true;
        play(api, resume);
      });
    }
  });
})();
