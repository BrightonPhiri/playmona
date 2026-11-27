/* ============================================================
   PLAYMONA — missiontrail/screens.js
   Mission Trail's DOM screens. They only draw and report taps; the
   game file (js/games/missionTrail.js) owns the engine, renderer and
   progress, and passes in what each screen needs.

     landing(root, ctx)                       title, three numbers, Continue / Select stage / Done
     picker(root, ctx, groupIndex)            one group of stages per page
     letter(root, stage, playerName, onUnderstood)
                                              the mission letter; "I understand" removes it
     tip(root, onDone)                        first-time controls tip, over the play screen
     play(root, opts) -> handle               HUD (with the bag), town canvas, message line,
                                              arrows + Check, and pick scenes over the town
     results(root, ctx, info)                 complete / failed, stars, score, breakdown

   ctx = { progress, stages, groups, open(stageId), home(), picker(groupIndex), done() }
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';
  FF.MissionTrail = FF.MissionTrail || {};

  function t(key, fallback, vars) {
    if (FF.t) return FF.t(key, fallback, vars);
    return String(fallback).replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] != null ? vars[k] : m; });
  }
  // Children are appended one by one (strings as text), so the screens build the
  // same tree in the browser and in the test harness's plain-object DOM.
  function add(node, kids) {
    if (kids == null || kids === false) return;
    if (!Array.isArray(kids)) kids = [kids];
    kids.forEach(function (c) {
      if (c == null || c === false) return;
      if (Array.isArray(c)) add(node, c);
      else if (typeof c === 'string' || typeof c === 'number') node.appendChild(document.createTextNode(String(c)));
      else node.appendChild(c);
    });
  }
  function el(tag, attrs, children) { var n = FF.ui.el(tag, attrs); add(n, children); return n; }
  function div(cls, children) { return el('div', cls ? { class: cls } : null, children); }
  function span(cls, children) { return el('span', cls ? { class: cls } : null, children); }
  function icon(key) {
    return (FF.Icons && FF.Icons.icon) ? FF.Icons.icon(key) : span('mt-icon-missing');
  }
  function button(label, opts) {
    return FF.UI && FF.UI.button ? FF.UI.button(label, opts) : FF.ui.button(label, opts);
  }
  function P() { return FF.MissionTrail.Progress; }
  function sound(name) { if (FF.Audio && FF.Audio.play) FF.Audio.play(name); }
  function pad2(n) { return n < 10 ? '0' + n : String(n); }
  function clock(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    return Math.floor(s / 60) + ':' + pad2(s % 60);
  }
  function mount(root, node) {
    FF.ui.clear(root);
    root.appendChild(node);
    return node;
  }

  /* The groups that have at least one stage, each with its stages. */
  function pages(ctx) {
    var groups = ctx.groups || [];
    var out = [];
    groups.forEach(function (g, i) {
      var to = i + 1 < groups.length ? groups[i + 1].from - 1 : Infinity;
      var list = ctx.stages.filter(function (s) { return s.id >= g.from && s.id <= to; });
      if (list.length) out.push({ name: g.name, from: g.from, stages: list });
    });
    return out;
  }

  function pageOf(ctx, stageId) {
    var list = pages(ctx);
    for (var i = 0; i < list.length; i++) {
      if (list[i].stages.some(function (s) { return s.id === stageId; })) return i;
    }
    return 0;
  }

  function stars(count, cls) {
    var row = div('mt-stars' + (cls ? ' ' + cls : ''));
    row.setAttribute('aria-label', t('mtStarsN', '{n} of 3 stars', { n: count }));
    row.setAttribute('role', 'img');
    for (var i = 0; i < 3; i++) {
      var s = span('mt-star' + (i < count ? ' is-on' : ''));
      s.style.setProperty('--i', i);
      s.appendChild(icon(i < count ? 'star-fill' : 'star'));
      row.appendChild(s);
    }
    return row;
  }

  function stat(label, value) {
    return div('mt-stat', [span('mt-stat__value', String(value)), span('mt-stat__label', label)]);
  }

  /* ---------------- landing ---------------- */

  function coverSrc() {
    var m = FF.AssetManifest;
    if (m && m.covers && m.covers.missionTrail && FF.Assets) return FF.Assets.artPath('covers', 'missionTrail');
    return FF.MissionTrail.Assets ? FF.MissionTrail.Assets.path('ui', 'envelope') : '';
  }

  function landing(root, ctx) {
    var prog = ctx.progress;
    var ids = ctx.stages.map(function (s) { return s.id; });
    var tot = P().totals(prog);
    var lastId = ids.length ? ids[ids.length - 1] : 1;
    var nextId = P().next(prog, ids);
    var art = el('img', { class: 'mt-landing__art', src: coverSrc(), alt: '' });
    var wrap = div('mt-screen mt-landing', [
      art,
      el('h1', { class: 'mt-title' }, t('mtName', 'Mission Trail')),
      el('p', { class: 'mt-tagline' }, t('mtTagline', 'Read. Remember. Explore. Complete!')),
      div('mt-stats', [
        stat(t('mtCompleted', 'Completed'), t('mtXofY', '{x} of {y}', { x: tot.completed, y: ids.length })),
        stat(t('mtStarsLabel', 'Stars'), tot.stars),
        stat(t('mtHighest', 'Highest stage'), Math.min(prog.highest, lastId))
      ]),
      div('mt-actions', [
        button(t('mtContinue', 'Continue playing'), { primary: true, icon: 'play', class: 'mt-btn-main', onClick: function () { ctx.open(nextId); } }),
        button(t('mtSelect', 'Select stage'), { icon: 'map-trifold', onClick: function () { ctx.picker(pageOf(ctx, nextId)); } }),
        button(t('mtDone', 'Done'), { class: 'btn-ghost', icon: 'check', onClick: function () { ctx.done(); } })
      ])
    ]);
    return mount(root, wrap);
  }

  /* ---------------- stage picker ---------------- */

  function card(ctx, stage) {
    var prog = ctx.progress;
    var st = P().state(prog, stage.id);
    var saved = prog.stages[String(stage.id)];
    var num = span('mt-card__num', pad2(stage.id));
    var title = span('mt-card__title', t('mtStage_' + stage.id, stage.title));
    var c;
    if (st === 'locked') {
      c = div('mt-card is-locked', [num, span('mt-card__lock', [icon('lock')]),
        span('mt-card__note', t('mtFinishFirst', 'Finish stage {n} first', { n: stage.id - 1 }))]);
      c.setAttribute('aria-disabled', 'true');
    } else {
      var foot;
      if (st === 'done') foot = saved && saved.stars > 0 ? stars(saved.stars, 'mt-stars--sm') : span('mt-card__tick', [icon('check-circle')]);
      else foot = span('mt-card__note', t('mtPlay', 'Play'));
      c = el('button', { class: 'mt-card' + (st === 'done' ? ' is-done' : ' is-open'), type: 'button' }, [num, title, foot]);
      c.setAttribute('aria-label', t('mtStageN', 'Stage {n}', { n: stage.id }) + ', ' + stage.title);
      c.addEventListener('click', function () { sound('select'); ctx.open(stage.id); });
    }
    c.dataset.stage = String(stage.id);
    return c;
  }

  function picker(root, ctx, groupIndex) {
    var list = pages(ctx);
    var gi = Math.max(0, Math.min(list.length - 1, groupIndex | 0));
    var page = list[gi];
    var prog = ctx.progress;
    var done = 0;
    var got = 0;
    page.stages.forEach(function (s) {
      var saved = prog.stages[String(s.id)];
      if (saved && saved.done) { done += 1; got += saved.stars; }
    });
    var fill = span('mt-bar__fill');
    var bar = div('mt-bar', [fill]);
    fill.style.width = Math.round(done / page.stages.length * 100) + '%';
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', String(page.stages.length));
    bar.setAttribute('aria-valuenow', String(done));
    var prev = button(t('mtPrevGroup', 'Previous'), { icon: 'chevron-left', class: 'btn-ghost', onClick: function () { picker(root, ctx, gi - 1); } });
    var next = button(t('mtNextGroup', 'Next'), { icon: 'chevron-right', class: 'btn-ghost', onClick: function () { picker(root, ctx, gi + 1); } });
    prev.disabled = gi === 0;
    next.disabled = gi >= list.length - 1;
    var grid = div('mt-grid', page.stages.map(function (s) { return card(ctx, s); }));
    var wrap = div('mt-screen mt-picker', [
      div('mt-picker__head', [
        button(t('mtBack', 'Back'), { icon: 'chevron-left', class: 'btn-ghost mt-back', onClick: function () { ctx.home(); } }),
        span('mt-kicker', t('mtGroupNofM', 'Group {n} of {m}', { n: gi + 1, m: list.length }))
      ]),
      el('h2', { class: 'mt-title mt-title--sm' }, t('mtGroup_' + page.from, page.name)),
      div('mt-picker__meta', [
        span('', t('mtDoneOf', '{x} of {y} completed', { x: done, y: page.stages.length })),
        span('mt-picker__stars', [icon('star-fill'), span('', t('mtXofY', '{x} of {y}', { x: got, y: page.stages.length * 3 }))])
      ]),
      bar,
      grid,
      list.length > 1 ? div('mt-picker__nav', [prev, next]) : null,
      button(t('mtDone', 'Done'), { class: 'btn-ghost', icon: 'check', onClick: function () { ctx.done(); } })
    ].filter(Boolean));
    return mount(root, wrap);
  }

  /* ---------------- the letter ---------------- */

  function letter(root, stage, playerName, onUnderstood) {
    var b = stage.briefing || {};
    var names = (FF.data && FF.data.missionTrail && FF.data.missionTrail.identityNames) || {};
    var steps = FF.MissionTrail.Rules.directions(stage.route || [], {
      name: function (key) {
        var id = stage.identities && stage.identities[key];
        return id ? t('mtPlace_' + id, names[id] || id) : key;
      }
    });
    var ok = button(t('mtUnderstand', 'I understand'), { primary: true, icon: 'check', class: 'mt-understand' });
    var used = false;
    ok.addEventListener('click', function () {
      if (used) return;
      used = true;
      sound('click');
      FF.ui.clear(root);   // the mission is never on the page again during this attempt
      onUnderstood();
    });
    var paper = el('article', { class: 'mt-paper mt-paper--' + (stage.letter || 'letter') }, [
      span('mt-kicker', t('mtMissionN', 'Mission {n}', { n: pad2(stage.id) })),
      el('h2', { class: 'mt-paper__title' }, b.title || stage.title),
      el('p', { class: 'mt-paper__dear' }, t('mtDear', 'Dear {name},', { name: playerName || t('you', 'You') })),
      el('p', null, b.message || ''),
      el('p', { class: 'mt-paper__lead' }, t('mtHereAre', 'Here are the directions:')),
      el('ol', { class: 'mt-paper__steps' }, steps.map(function (s) { return el('li', null, s); })),
      b.arrive ? el('p', null, b.arrive) : null,
      el('p', null, t('mtBeforeTime', 'Please complete this task before your time runs out.')),
      el('p', { class: 'mt-paper__luck' }, t('mtGoodLuck', 'Good luck!')),
      b.from ? el('p', { class: 'mt-paper__from' }, '— ' + b.from) : null,
      el('p', { class: 'mt-paper__once' }, [icon('scroll'), span('', t('mtReadOnce', 'You can read this only once. Remember it!'))]),
      div('mt-paper__time', [icon('timer'), span('', t('mtTimeLimit', 'Time limit: {t}', { t: clock((stage.time || 60) * 1000) }))]),
      ok
    ].filter(Boolean));
    var env = FF.MissionTrail.Assets ? el('img', { class: 'mt-envelope', src: FF.MissionTrail.Assets.path('ui', 'envelope'), alt: '' }) : null;
    var wrap = div('mt-screen mt-letter', [env, paper].filter(Boolean));
    sound('flip');
    return mount(root, wrap);
  }

  /* ---------------- first-time tip ---------------- */

  function tip(root, onDone) {
    var used = false;
    var box;
    function close() {
      if (used) return;
      used = true;
      if (box && box.parentNode) box.parentNode.removeChild(box);
      onDone();
    }
    var ok = button(t('mtGotIt', 'Got it'), { primary: true, onClick: function (e) { if (e && e.stopPropagation) e.stopPropagation(); close(); } });
    box = div('mt-tip', [div('mt-tip__card', [
      span('mt-tip__icon', [icon('arrow-up')]),
      el('p', null, t('mtTip', 'Use the arrows to walk. When you are next to a place, tap it to check it.')),
      ok
    ])]);
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', t('mtTipTitle', 'How to move'));
    box.addEventListener('click', close);
    root.appendChild(box);
    if (ok.focus) ok.focus();
    return box;
  }

  /* ---------------- play ---------------- */

  // Where choices stand in a pick scene, as % of the scene (centre x, bottom y). Things lie
  // scattered around a room; people stand in two rows. Choices are shuffled onto these spots.
  var SPOTS = {
    objects: [[14, 40], [39, 33], [63, 41], [86, 34], [26, 70], [51, 64], [75, 72], [10, 92], [40, 95], [66, 93], [90, 90], [88, 62]],
    characters: [[14, 62], [38, 58], [62, 62], [86, 58], [26, 96], [50, 92], [74, 96], [8, 90], [92, 92]]
  };
  var SCENE_PROMPT = {
    collect: ['mtSceneCollect', 'Pick what your letter asks for.'],
    give: ['mtSceneGive', 'Who should get it?'],
    meet: ['mtSceneMeet', 'Who are you looking for?']
  };

  function shuffled(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  var DIR_KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right' };

  /* opts = { stage, total, onMove(dir), onCheck(), onTap(event), onPick(id), onCloseScene() }.
     Returns a handle the game drives. */
  function play(root, opts) {
    var stage = opts.stage;
    var timeText = span('mt-clock__text', clock((stage.time || 60) * 1000));
    var clockEl = div('mt-clock', [icon('timer'), timeText]);
    clockEl.setAttribute('role', 'timer');
    var dots = div('mt-dots');
    for (var i = 0; i < (opts.total || 0); i++) dots.appendChild(span('mt-dot'));
    dots.setAttribute('aria-label', t('mtStepsLeft', '{x} of {y} done', { x: 0, y: opts.total || 0 }));
    var bag = div('mt-bag is-empty');
    bag.setAttribute('aria-label', t('mtBagEmpty', 'Your bag is empty'));
    var canvas = el('canvas', { class: 'mt-map' });
    canvas.setAttribute('aria-label', t('mtMapLabel', 'The town. Use the arrows to walk.'));
    canvas.addEventListener('click', function (e) { opts.onTap(e); });
    var msg = el('p', { class: 'mt-msg' });
    msg.setAttribute('aria-live', 'polite');

    function arrow(dir, label) {
      var b = el('button', { class: 'mt-arrow mt-arrow--' + dir, type: 'button' }, [icon('arrow-' + dir)]);
      b.setAttribute('aria-label', label);
      b.addEventListener('click', function () { opts.onMove(dir); });
      return b;
    }
    var check = el('button', { class: 'mt-check is-hidden', type: 'button' }, [icon('check-circle'), span('', t('mtCheck', 'Check'))]);
    check.disabled = true;
    check.addEventListener('click', function () { opts.onCheck(); });
    var padEl = div('mt-pad', [
      arrow('up', t('mtUp', 'Up')), arrow('left', t('mtLeft', 'Left')), check,
      arrow('right', t('mtRight', 'Right')), arrow('down', t('mtDown', 'Down'))
    ]);

    var view = div('mt-view', [canvas]);
    var sceneEl = null;
    var wrap = div('mt-play', [
      div('mt-hud', [span('mt-pill', t('mtStageN', 'Stage {n}', { n: stage.id })), clockEl, div('mt-hud__end', [bag, dots])]),
      view,
      msg,
      padEl
    ]);
    mount(root, wrap);

    // Listens on the document in the capture phase and stops the keys it uses, so the
    // page's arrow-key focus navigation (FF.Nav) never moves focus while walking; that
    // would make Enter press Pause or Exit instead of checking a place.
    var bound = false;
    function overlayOpen() {
      return !!(document.querySelector && (document.querySelector('.pause-overlay') || document.querySelector('.ff-dialog')));
    }
    function onKey(e) {
      if (!wrap.isConnected) { unbind(); return; }
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      var tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (overlayOpen() || (root.querySelector && root.querySelector('.mt-tip'))) return;
      // In a pick scene the keys move between the choices (the page's own focus moves).
      if (sceneEl) {
        if (e.key === 'Escape' && opts.onCloseScene) { e.preventDefault(); e.stopPropagation(); opts.onCloseScene(); }
        return;
      }
      var dir = DIR_KEYS[e.key];
      if (dir) {
        e.preventDefault();
        e.stopPropagation();
        opts.onMove(dir, !!e.repeat);
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        if (tag === 'BUTTON' && !(e.target.classList && e.target.classList.contains('mt-arrow'))) return;
        e.preventDefault();
        e.stopPropagation();
        opts.onCheck();
      }
    }
    function bind() { if (!bound) { bound = true; document.addEventListener('keydown', onKey, true); } }
    function unbind() { if (bound) { bound = false; document.removeEventListener('keydown', onKey, true); } }
    var msgTimer = null;
    var warned = false;
    // The low-time look starts at 10 s, or at 30% of a short limit.
    var warnAt = Math.min(10000, Math.round((stage.time || 60) * 1000 * 0.3));

    return {
      canvas: canvas,
      root: wrap,
      bind: bind,
      unbind: unbind,
      setClock: function (ms) {
        timeText.textContent = clock(ms);
        var warn = ms <= warnAt;
        clockEl.classList.toggle('is-warn', warn);
        if (warn && !warned && ms > 0) { warned = true; sound('warning'); }
      },
      setSteps: function (done) {
        for (var k = 0; k < dots.children.length; k++) dots.children[k].classList.toggle('is-done', k < done);
        dots.setAttribute('aria-label', t('mtStepsLeft', '{x} of {y} done', { x: done, y: opts.total || 0 }));
      },
      say: function (text, tone) {
        msg.textContent = text || '';
        msg.className = 'mt-msg' + (tone ? ' is-' + tone : '');
        if (msgTimer) clearTimeout(msgTimer);
        msgTimer = text ? setTimeout(function () { msg.textContent = ''; msg.className = 'mt-msg'; }, 2600) : null;
      },
      penalty: function () {
        clockEl.classList.remove('is-hit');
        void clockEl.offsetWidth;   // restart the animation
        clockEl.classList.add('is-hit');
      },
      showCheck: function (on) {
        check.classList.toggle('is-hidden', !on);
        check.disabled = !on;
      },
      /* items: [{ id, src, name }] the player carries. */
      setBag: function (items) {
        FF.ui.clear(bag);
        items.forEach(function (it) {
          var im = el('img', { class: 'mt-bag__item', src: it.src, alt: it.name || '' });
          bag.appendChild(im);
        });
        bag.className = 'mt-bag' + (items.length ? '' : ' is-empty');
        bag.setAttribute('aria-label', items.length
          ? t('mtBagHolds', 'In your bag: {list}', { list: items.map(function (it) { return it.name; }).join(', ') })
          : t('mtBagEmpty', 'Your bag is empty'));
      },
      /* A pick scene over the town. sc = { kind, backdrop: src, options: [{ id, src, name }],
         closable, category: 'objects' | 'characters' }. */
      openScene: function (sc) {
        if (sceneEl && sceneEl.parentNode) sceneEl.parentNode.removeChild(sceneEl);
        var spots = shuffled(SPOTS[sc.category] || SPOTS.objects);
        var room = div('mt-scene__room');
        if (sc.backdrop) room.appendChild(el('img', { class: 'mt-scene__bg', src: sc.backdrop, alt: '' }));
        var buttons = [];
        shuffled(sc.options).forEach(function (o, i) {
          var spot = spots[i % spots.length];
          var b = el('button', { class: 'mt-thing mt-thing--' + (sc.category || 'objects'), type: 'button' },
            [el('img', { src: o.src, alt: '' })]);
          b.setAttribute('aria-label', o.name || o.id);
          b.dataset.pick = o.id;
          b.style.left = spot[0] + '%';
          b.style.top = spot[1] + '%';
          b.addEventListener('click', function () { if (opts.onPick) opts.onPick(o.id); });
          buttons.push(b);
          room.appendChild(b);
        });
        var prompt = SCENE_PROMPT[sc.kind] || SCENE_PROMPT.collect;
        var kids = [el('p', { class: 'mt-scene__prompt' }, t(prompt[0], prompt[1])), room];
        if (sc.closable) {
          var back = button(t('mtSceneBack', 'Back to the street'), { variant: 'secondary', icon: 'arrow-left', onClick: function () { if (opts.onCloseScene) opts.onCloseScene(); } });
          if (back.classList) back.classList.add('mt-scene__back');
          kids.push(back);
        }
        sceneEl = div('mt-scene', kids);
        sceneEl.setAttribute('role', 'dialog');
        sceneEl.setAttribute('aria-label', t(prompt[0], prompt[1]));
        view.appendChild(sceneEl);
        padEl.classList.add('is-off');
        if (buttons[0] && buttons[0].focus) buttons[0].focus();
      },
      sceneWrong: function (id) {
        if (!sceneEl) return;
        var kids = sceneEl.querySelectorAll ? sceneEl.querySelectorAll('.mt-thing') : [];
        for (var k = 0; k < kids.length; k++) {
          if (kids[k].dataset.pick !== id) continue;
          kids[k].classList.remove('is-wrong');
          void kids[k].offsetWidth;   // restart the animation
          kids[k].classList.add('is-wrong');
        }
      },
      closeScene: function () {
        if (sceneEl && sceneEl.parentNode) sceneEl.parentNode.removeChild(sceneEl);
        sceneEl = null;
        padEl.classList.remove('is-off');
      },
      sceneOpen: function () { return !!sceneEl; }
    };
  }

  /* ---------------- results ---------------- */

  var PARTS = [
    ['task', 'mtPartTask', 'Task'],
    ['nav', 'mtPartNav', 'Directions'],
    ['obs', 'mtPartObs', 'Observation'],
    ['seq', 'mtPartSeq', 'Order'],
    ['time', 'mtPartTime', 'Time']
  ];

  /* info = { stage, result, before (saved stage before this attempt, or null), nextId (or null), timeUp } */
  function results(root, ctx, info) {
    var r = info.result;
    var stage = info.stage;
    var before = info.before;
    var m = r.mistakes || {};
    var mistakes = (m.wrongTurns || 0) + (m.wrongChecks || 0) + (m.wrongPicks || 0) + (m.bumps || 0);
    var head = r.done ? t('mtComplete', 'Mission complete!') : (info.timeUp ? t('mtTimeUp', 'Time is up!') : t('mtFailed', 'Mission failed'));
    var best = null;
    if (r.done && before && before.done) {
      best = r.score > before.best ? span('mt-best is-new', t('mtNewBest', 'New best! Before: {n}', { n: before.best }))
        : span('mt-best', t('mtBestWas', 'Your best: {n}', { n: before.best }));
    } else if (!r.done && before && before.done) {
      best = span('mt-best', t('mtBestWas', 'Your best: {n}', { n: before.best }));
    }
    var breakdown = div('mt-breakdown');
    PARTS.forEach(function (p) {
      var v = r.parts ? r.parts[p[0]] : null;
      if (v === null || v === undefined) return;
      var pct = Math.round(v * 100);
      var fill = span('mt-bar__fill');
      fill.style.width = pct + '%';
      breakdown.appendChild(div('mt-part', [span('mt-part__label', t(p[1], p[2])), div('mt-bar', [fill]), span('mt-part__value', pct + '%')]));
    });
    var actions = [
      button(t('mtReplay', 'Replay'), { icon: 'restart', primary: !r.done || !info.nextId, onClick: function () { ctx.open(stage.id); } })
    ];
    if (info.nextId) actions.push(button(t('mtNextStage', 'Next stage'), { icon: 'chevron-right', primary: true, onClick: function () { ctx.open(info.nextId); } }));
    actions.push(button(t('mtStages', 'Stages'), { icon: 'map-trifold', class: 'btn-ghost', onClick: function () { ctx.picker(pageOf(ctx, stage.id)); } }));
    var wrap = div('mt-screen mt-results' + (r.done ? ' is-done' : ' is-failed'), [
      span('mt-kicker', t('mtMissionN', 'Mission {n}', { n: pad2(stage.id) }) + ' · ' + t('mtStage_' + stage.id, stage.title)),
      el('h2', { class: 'mt-title mt-title--sm' }, head),
      stars(r.done ? r.stars : 0, 'mt-stars--big'),
      div('mt-score', [span('mt-score__n', String(r.done ? r.score : 0)), span('mt-score__of', t('mtOutOf', 'out of 100'))]),
      best,
      div('mt-stats', [
        stat(t('mtTimeTaken', 'Time taken'), clock(r.ms)),
        stat(t('mtAccuracy', 'Accuracy'), r.parts && r.parts.nav !== null && r.parts.nav !== undefined ? Math.round(r.parts.nav * 100) + '%' : '—'),
        stat(t('mtMistakes', 'Mistakes'), mistakes)
      ]),
      r.done ? breakdown : el('p', { class: 'mt-results__hint' }, t('mtTryAgain', 'Read the letter carefully and try again.')),
      div('mt-actions', actions)
    ].filter(Boolean));
    sound(r.done ? 'winner' : 'wrong');
    return mount(root, wrap);
  }

  FF.MissionTrail.Screens = {
    landing: landing,
    picker: picker,
    letter: letter,
    tip: tip,
    play: play,
    results: results,
    pages: pages,
    pageOf: pageOf,
    clock: clock
  };
})();
