/* ============================================================
   PLAYMONA — games/numberChallenge.js
   Number Challenge: mental maths four ways.
     Quick sums       one sum at a time, beat the clock (the standard)
     Sprint           as many as you can before the clock runs out
     Chain            keep a running total in your head
     Make the target  merge number tiles to hit a target

   - Rules: js/numberchallenge/rules.js (FF.NumberChallengeRules),
     shared with the server's referee and the crew.
   - Levels Easy / Normal / Hard / Expert. Expert answers on a number
     pad (+6 s, +50); in Make the target it pays +50 for every tile.
   - Looks: Neon arcade or Notebook, the player's own choice
     (numberChallenge:look), drawn by data-nc-look.
   - Solo and Turns on one phone. In Turns every player gets their own
     sums, matched in kind and size (R.deal(cfg, seed, p)).
   - Daily, challenges and celebrations play R.STANDARD from the seed.
   - Online rooms: the server's referee deals, checks and scores.
   Classic script, ES5.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.NumberChallengeRules;
  var SETUP_KEY = 'numberChallenge:setup:v1';
  var LOOK_KEY = 'numberChallenge:look';
  var LOOKS = ['arcade', 'notebook'];
  var MODE_ICON = { quick: 'calculator', sprint: 'lightning', chain: 'link', target: 'target' };
  var MINUS = '−', TIMES_SIGN = '×', DIVIDE = '÷';

  function G() { return FF.GeoSpinGame; }
  function t(key, fallback, vars) { return FF.t ? FF.t(key, fallback, vars) : String(fallback).replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] != null ? vars[k] : m; }); }
  function store() { return FF.Storage || { get: function (k, d) { return d; }, set: function () {} }; }
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
  function look() { var l = store().get(LOOK_KEY, 'arcade'); return LOOKS.indexOf(l) !== -1 ? l : 'arcade'; }
  function icon(name) { return FF.Icons && FF.Icons.icon ? FF.Icons.icon(name) : FF.ui.span('', ''); }
  function focus(el) { if (FF.Nav && FF.Nav.focus && el) FF.Nav.focus(el); }

  function modeName(m) {
    return m === 'sprint' ? t('ncSprint', 'Sprint') : m === 'chain' ? t('ncChain', 'Chain') : m === 'target' ? t('ncTarget', 'Make the target') : t('ncQuick', 'Quick sums');
  }
  function modeLine(m) {
    return m === 'sprint' ? t('ncSprintLine', 'As many as you can before time runs out')
      : m === 'chain' ? t('ncChainLine', 'Keep the running total in your head')
        : m === 'target' ? t('ncTargetLine', 'Join number tiles to hit the target')
          : t('ncQuickLine', 'One sum at a time. Beat the clock');
  }
  function levelName(l) { return l === 'easy' ? t('easy', 'Easy') : l === 'hard' ? t('hard', 'Hard') : l === 'expert' ? t('ncExpert', 'Expert') : t('normal', 'Normal'); }
  function levelLine(l) {
    return l === 'easy' ? t('ncEasyNote', 'Adding and taking away to 20, the 2, 5 and 10 times tables.')
      : l === 'hard' ? t('ncHardNote', 'Up to 1000, tables to 12, order of operations, % and fractions.')
        : l === 'expert' ? t('ncExpertNote', 'Hard maths, typed on a number pad. +50 for every right answer.')
          : t('ncNormalNote', 'Up to 100, tables to 10, dividing, doubles and halves.');
  }
  function timeName(x) { return x === 'quick' ? t('swQuick', 'Quick') : x === 'relaxed' ? t('swRelaxed', 'Relaxed') : x === 'none' ? t('swNoLimit', 'No limit') : t('normal', 'Normal'); }
  function speedName(x) { return x === 'fast' ? t('ncFast', 'Fast') : t('ncSteady', 'Steady'); }
  function lookName(l) { return l === 'notebook' ? t('ncNotebook', 'Notebook') : t('ncArcade', 'Neon arcade'); }
  function roundsName(cfg) {
    if (cfg.mode === 'sprint') return t('ncNSeconds', '{n} seconds', { n: cfg.sprint });
    if (cfg.mode === 'chain') return t('ncNChains', '{n} chains', { n: cfg.rounds });
    if (cfg.mode === 'target') return t('ncNTargets', '{n} targets', { n: cfg.rounds });
    return t('ncNSums', '{n} sums', { n: cfg.rounds });
  }
  function summary(cfg) { return [modeName(cfg.mode), levelName(cfg.level), roundsName(cfg)].join(' · '); }

  /* How a sum is read aloud. */
  function spoken(text) {
    return String(text).replace(/×/g, ' times ').replace(/÷/g, ' divided by ').replace(/−/g, ' minus ')
      .replace(/²/g, ' squared').replace(/½/g, 'a half').replace(/⅓/g, 'a third').replace(/¼/g, 'a quarter')
      .replace(/¾/g, 'three quarters').replace(/\?/g, ' what ').replace(/\s+/g, ' ').trim();
  }
  function opText(op) { return op === '*' ? TIMES_SIGN : op === '/' ? DIVIDE : op === '-' ? MINUS : '+'; }
  /* '25*4,100+7' -> ['25 × 4 = 100', '100 + 7 = 107'] */
  function stepLines(steps) {
    if (!steps) return [];
    return String(steps).split(',').filter(Boolean).map(function (s) {
      var m = /^(\d+)([+\-*\/])(\d+)$/.exec(s);
      if (!m) return s;
      var v = R.merge(Number(m[1]), m[2], Number(m[3]));
      return m[1] + ' ' + opText(m[2]) + ' ' + m[3] + ' = ' + v;
    });
  }

  /* ================= the frame ================= */

  function frame(api, opts) {
    opts = opts || {};
    var root = api.shell.root;
    FF.ui.clear(root);
    if (api.shell.el) api.shell.el.classList.add('nc-shell');
    var nc = FF.ui.div('nc' + (opts.className ? ' ' + opts.className : ''));
    nc.setAttribute('data-nc-look', look());
    var top = FF.ui.div('nc-top');
    var brand = FF.ui.div('nc-brand');
    brand.appendChild(FF.ui.span('nc-brand__a', t('ncBrandA', 'Number')));
    brand.appendChild(FF.ui.span('nc-brand__b', t('ncBrandB', 'Challenge')));
    top.appendChild(brand);
    var chips = FF.ui.div('nc-chips');
    top.appendChild(chips);
    if (G() && G().soundButtons) top.appendChild(G().soundButtons(api));
    nc.appendChild(top);
    var main = FF.ui.div('nc-main');
    var side = FF.ui.div('nc-side');
    var stage = FF.ui.div('nc-stage');
    var panel = FF.ui.div('nc-panel');
    main.appendChild(side);
    main.appendChild(stage);
    main.appendChild(panel);
    nc.appendChild(main);
    root.appendChild(nc);
    return { root: nc, top: top, chips: chips, side: side, stage: stage, panel: panel };
  }

  function chip(text, cls) { return FF.ui.span('nc-chip' + (cls ? ' ' + cls : ''), text); }

  function timerRing() {
    var el = FF.ui.div('nc-ring is-idle');
    el.setAttribute('aria-hidden', 'true');
    var num = FF.ui.span('nc-ring__num', '');
    el.appendChild(num);
    return {
      el: el,
      set: function (rem, total) {
        el.classList.remove('is-idle');
        var p = total ? Math.max(0, Math.min(1, rem / total)) : 0;
        el.style.setProperty('--p', String(p));
        num.textContent = String(Math.max(0, Math.ceil(rem)));
        el.classList.toggle('is-low', rem <= 5);
      },
      idle: function () { el.classList.add('is-idle'); el.classList.remove('is-low'); num.textContent = ''; el.style.setProperty('--p', '1'); }
    };
  }

  function flame(n) {
    var el = FF.ui.span('nc-flame' + (n >= 8 ? ' is-blaze' : n >= 5 ? ' is-hot' : n >= 3 ? ' is-warm' : '') + (n ? '' : ' is-out'));
    el.appendChild(icon('fire'));
    el.appendChild(FF.ui.span('nc-flame__n', String(n)));
    el.setAttribute('aria-label', t('swStreakN', 'Streak {n}', { n: n }));
    return el;
  }

  /* The points line at the reveal. */
  function revealBar(info) {
    var bar = FF.ui.div('nc-reveal nc-reveal--' + info.state);
    bar.appendChild(FF.ui.span('nc-stamp', info.stampText || (info.state === 'good' ? t('gsCorrect', 'Correct!') : info.state === 'late' ? t('gsTimesUp', 'Time’s up!') : info.state === 'close' ? t('ncClose', 'So close!') : t('gsIncorrect', 'Incorrect'))));
    var pts = FF.ui.span('nc-reveal__pts');
    pts.appendChild(FF.ui.span('', '+'));
    var num = FF.ui.span('nc-reveal__num', '0');
    pts.appendChild(num);
    pts.appendChild(FF.ui.span('nc-reveal__unit', t('gsPts', 'pts')));
    bar.appendChild(pts);
    (info.lines || []).forEach(function (line) { if (line) bar.appendChild(FF.ui.el('p', { class: 'nc-reveal__line' }, line)); });
    setTimeout(function () { if (G() && G().countUp) G().countUp(num, 0, info.points || 0, 700); else num.textContent = String(info.points || 0); }, 250);
    return bar;
  }

  /* ================= the sum card ================= */

  /* A sum drawn as glowing digits (or pencil): numbers, signs and the ? to fill. */
  function sumCard(text, opts) {
    opts = opts || {};
    var el = FF.ui.div('nc-card' + (opts.className ? ' ' + opts.className : ''));
    var line = FF.ui.el('p', { class: 'nc-sum', role: 'text', 'aria-label': spoken(text) });
    var q = null;
    String(text).split(' ').forEach(function (tok, i) {
      if (i) line.appendChild(document.createTextNode(' '));
      var m;
      if (tok === '?') { q = FF.ui.span('nc-q', '?'); line.appendChild(q); }
      else if ((m = /^(\d+)(,|%|²)?$/.exec(tok))) {
        line.appendChild(FF.ui.span('nc-n', m[1]));
        if (m[2]) line.appendChild(FF.ui.span(m[2] === ',' ? 'nc-comma' : 'nc-op', m[2]));
      } else if (/^[+=−×÷½⅓¼¾]$/.test(tok)) line.appendChild(FF.ui.span('nc-op', tok));
      else line.appendChild(FF.ui.span('nc-w', tok === 'Double' ? t('ncDouble', 'Double') : tok === 'Half' ? t('ncHalf', 'Half') : tok === 'of' ? t('ncOf', 'of') : tok));
    });
    el.appendChild(line);
    return {
      el: el,
      /* The answer drops into the ?; a wrong guess shows struck through above it. */
      reveal: function (answer, ok, given) {
        if (!q) return;
        q.textContent = String(answer);
        q.className = 'nc-q nc-q--ans ' + (ok ? 'is-right' : 'is-wrong');
        if (!ok && given != null && given !== '') {
          var g = FF.ui.span('nc-given', String(given));
          q.parentNode.insertBefore(g, q);
          q.parentNode.insertBefore(document.createTextNode(' '), q);
        }
        el.classList.add(ok ? 'is-right' : 'is-wrong');
      }
    };
  }

  /* ================= answering ================= */

  function choiceBoard(api, values, onPick) {
    var el = FF.ui.el('div', { class: 'nc-choices is-waiting', role: 'group', 'aria-label': t('ncPickAnswer', 'Pick the answer') });
    var open = false, locked = false;
    var btns = (values || []).map(function (v, i) {
      var b = FF.ui.el('button', { type: 'button', class: 'nc-choice nc-choice--' + i, 'aria-label': String(v), 'aria-keyshortcuts': String(i + 1) });
      b.appendChild(FF.ui.span('nc-choice__k', String(i + 1)));
      b.appendChild(FF.ui.span('nc-choice__v', String(v)));
      b.addEventListener('click', function () { pick(v, b); });
      el.appendChild(b);
      return { el: b, v: v };
    });
    function pick(v, b) {
      if (!open || locked) return;
      locked = true;
      b.classList.add('is-picked');
      api.audio.play('tap');
      onPick(String(v));
    }
    function onKey(e) {
      if (locked || !document.body.contains(el)) { document.removeEventListener('keydown', onKey, true); return; }
      if (!open || e.ctrlKey || e.metaKey || e.altKey) return;
      var n = parseInt(e.key, 10);
      if (n >= 1 && n <= btns.length) { e.preventDefault(); e.stopPropagation(); pick(btns[n - 1].v, btns[n - 1].el); }
    }
    document.addEventListener('keydown', onKey, true);
    return {
      el: el,
      open: function () { open = true; el.classList.remove('is-waiting'); },
      finish: function (answer) {
        locked = true;
        document.removeEventListener('keydown', onKey, true);
        btns.forEach(function (x) {
          x.el.disabled = true;
          if (x.v === answer) x.el.classList.add('is-right');
          else if (x.el.classList.contains('is-picked')) x.el.classList.add('is-wrong');
          else x.el.classList.add('is-dim');
        });
      },
      destroy: function () { locked = true; document.removeEventListener('keydown', onKey, true); }
    };
  }

  /* Expert: type the exact number. One go: ✓ locks it in. */
  function numberPad(api, onSubmit) {
    var el = FF.ui.el('div', { class: 'nc-padwrap is-waiting' });
    var entry = FF.ui.el('div', { class: 'nc-entry', 'aria-live': 'polite', role: 'status' });
    var shown = FF.ui.span('nc-entry__v', '');
    entry.appendChild(shown);
    entry.appendChild(FF.ui.span('nc-entry__caret', ''));
    el.appendChild(entry);
    var pad = FF.ui.el('div', { class: 'nc-pad', role: 'group', 'aria-label': t('ncNumberPad', 'Number pad') });
    var value = '', open = false, locked = false;
    function draw() { shown.textContent = value; entry.classList.toggle('is-empty', !value); ok.disabled = !value || locked; }
    function press(k) {
      if (!open || locked) return;
      if (k === 'back') value = value.slice(0, -1);
      else if (k === 'ok') { if (!value) return; locked = true; api.audio.play('tap'); draw(); onSubmit(value); return; }
      else if (value.length < 4) value = (value === '0' ? '' : value) + k;
      api.audio.play('tap');
      draw();
    }
    function key(label, k, cls, aria) {
      var b = FF.ui.el('button', { type: 'button', class: 'nc-key' + (cls ? ' ' + cls : ''), 'aria-label': aria || label });
      b.appendChild(FF.ui.span('', label));
      b.addEventListener('click', function () { press(k); });
      pad.appendChild(b);
      return b;
    }
    ['1', '2', '3', '4', '5', '6', '7', '8', '9'].forEach(function (d) { key(d, d); });
    key('⌫', 'back', 'nc-key--back', t('ncDelete', 'Delete'));
    key('0', '0');
    var ok = key('✓', 'ok', 'nc-key--ok', t('ncEnter', 'Enter'));
    el.appendChild(pad);
    function onKey(e) {
      if (locked || !document.body.contains(el)) { document.removeEventListener('keydown', onKey, true); return; }
      if (!open || e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); press(e.key); }
      else if (e.key === 'Backspace') { e.preventDefault(); press('back'); }
      else if (e.key === 'Enter') { e.preventDefault(); press('ok'); }
    }
    document.addEventListener('keydown', onKey, true);
    draw();
    return {
      el: el,
      value: function () { return value; },
      open: function () { open = true; el.classList.remove('is-waiting'); },
      finish: function (answer) {
        var right = value !== '' && Number(value) === Number(answer);
        locked = true;
        document.removeEventListener('keydown', onKey, true);
        entry.classList.add(right ? 'is-right' : 'is-wrong');
        Array.prototype.forEach.call(pad.querySelectorAll ? pad.querySelectorAll('button') : [], function (b) { b.disabled = true; });
      },
      destroy: function () { locked = true; document.removeEventListener('keydown', onKey, true); }
    };
  }

  /* Choices, or the pad on Expert. */
  function answerBoard(api, cfg, item, onAnswer) {
    if (cfg.level === 'expert' || !item.choices) return numberPad(api, onAnswer);
    return choiceBoard(api, item.choices, onAnswer);
  }

  /* ================= chain ================= */

  /* Shows the start, then each step in place of the one before; ends on "= ?". */
  function chainCard(item, stepMs) {
    var el = FF.ui.div('nc-card nc-card--chain');
    var label = FF.ui.el('p', { class: 'nc-chain__label' });
    label.textContent = t('ncStartAt', 'Start at');
    var big = FF.ui.el('p', { class: 'nc-chain__big', 'aria-live': 'assertive' });
    big.textContent = String(item.start);
    var pips = FF.ui.div('nc-pips');
    item.steps.forEach(function () { pips.appendChild(FF.ui.span('nc-pip')); });
    el.appendChild(label);
    el.appendChild(big);
    el.appendChild(pips);
    var timer = null, stopped = false;
    function show(text, kind) {
      big.textContent = text;
      big.className = 'nc-chain__big' + (kind ? ' is-' + kind : '');
      if (animationsOn()) { big.classList.remove('is-in'); void big.offsetWidth; big.classList.add('is-in'); }
    }
    function stepText(st) {
      if (st.op === 'double') return t('ncDoubleIt', 'double it');
      if (st.op === 'half') return t('ncHalfIt', 'half it');
      return opText(st.op === 'x' ? '*' : st.op) + ' ' + st.n;
    }
    return {
      el: el,
      run: function (onDone) {
        var i = 0;
        function next() {
          if (stopped) return;
          if (i < item.steps.length) {
            label.textContent = t('ncStepN', 'Step {n} of {m}', { n: i + 1, m: item.steps.length });
            show(stepText(item.steps[i]), 'step');
            if (pips.children[i]) pips.children[i].classList.add('is-on');
            i++;
            timer = setTimeout(next, stepMs);
          } else {
            label.textContent = t('ncWhatNow', 'What is the total now?');
            show('= ?', 'ask');
            onDone();
          }
        }
        timer = setTimeout(next, Math.max(900, stepMs * 0.8));
      },
      stop: function () { stopped = true; if (timer) clearTimeout(timer); },
      reveal: function (ok, given) {
        label.textContent = ok ? t('ncRightTotal', 'Right total!') : given ? t('ncYouSaid', 'You said {x}', { x: given }) : t('ncTheTotal', 'The total');
        show(String(item.answer), ok ? 'right' : 'wrong');
        var full = FF.ui.el('p', { class: 'nc-chain__full' }, R.chainText(item));
        el.appendChild(full);
        el.classList.add(ok ? 'is-right' : 'is-wrong');
      }
    };
  }

  /* ================= make the target ================= */

  function targetBoard(api, item, cfg, onSubmit) {
    var expert = cfg.level === 'expert';
    var el = FF.ui.div('nc-tboard');
    var tilesEl = FF.ui.el('div', { class: 'nc-tiles', role: 'group', 'aria-label': t('ncTiles', 'Number tiles') });
    var signs = FF.ui.el('div', { class: 'nc-signs', role: 'group', 'aria-label': t('ncSigns', 'Signs') });
    var log = FF.ui.el('ol', { class: 'nc-log', 'aria-live': 'polite' });
    var msg = FF.ui.el('p', { class: 'nc-tmsg', 'aria-live': 'polite' });
    var tools = FF.ui.div('nc-ttools');
    el.appendChild(tilesEl);
    el.appendChild(signs);
    el.appendChild(msg);
    el.appendChild(log);
    el.appendChild(tools);
    var nextId = 0;
    function fresh() { return item.tiles.map(function (v) { return { id: nextId++, v: v, made: false }; }); }
    var tiles = fresh(), steps = [], history = [], first = null, op = null, open = false, locked = false;

    var signBtns = item.ops.map(function (o) {
      var b = FF.ui.el('button', { type: 'button', class: 'nc-sign', 'aria-label': o === '*' ? t('ncTimes', 'times') : o === '/' ? t('ncDividedBy', 'divided by') : o === '-' ? t('ncMinus', 'minus') : t('ncPlus', 'plus') }, opText(o));
      b.addEventListener('click', function () {
        if (!open || locked || first == null) return;
        api.audio.play('tap');
        op = op === o ? null : o;
        draw();
      });
      signs.appendChild(b);
      return { el: b, op: o };
    });
    function tool(label, ic, fn, cls) {
      var b = FF.ui.el('button', { type: 'button', class: 'nc-btn nc-btn--ghost' + (cls ? ' ' + cls : '') });
      if (ic) b.appendChild(icon(ic));
      b.appendChild(FF.ui.span('', label));
      b.addEventListener('click', function () { if (open && !locked) fn(); });
      tools.appendChild(b);
      return b;
    }
    var undoBtn = tool(t('ncUndo', 'Undo'), null, function () {
      var h = history.pop();
      if (!h) return;
      api.audio.play('tap');
      tiles = h.tiles; steps = h.steps; first = null; op = null; say('');
      draw();
    });
    var clearBtn = tool(t('ncClear', 'Clear'), null, function () {
      if (!steps.length) return;
      api.audio.play('tap');
      history = []; tiles = fresh(); steps = []; first = null; op = null; say('');
      draw();
    });
    var doneBtn = tool(t('ncDone', 'Done'), 'check', function () { submit(); }, 'nc-btn--done');

    function say(text, bad) { msg.textContent = text || ''; msg.classList.toggle('is-bad', !!bad); }
    function nearest() {
      var best = null;
      tiles.forEach(function (x) { if (!best || Math.abs(x.v - item.target) < Math.abs(best.v - item.target)) best = x; });
      return best;
    }
    function submit(tile) {
      if (locked) return;
      locked = true;
      var pickT = tile || nearest();
      draw();
      onSubmit(R.submitText(steps.join(','), pickT ? pickT.v : ''), pickT ? pickT.v : null);
    }
    function tapTile(x) {
      if (!open || locked) return;
      api.audio.play('tap');
      if (first == null || (op == null)) { first = first === x.id ? null : x.id; draw(); return; }
      if (x.id === first) { first = null; op = null; draw(); return; }
      var a = tiles.filter(function (y) { return y.id === first; })[0];
      var v = R.merge(a.v, op, x.v);
      if (v == null) {
        say(op === '/' ? t('ncNotExact', '{a} ÷ {b} is not a whole number.', { a: a.v, b: x.v }) : t('ncNotAbove', 'That has to come out above 0.'), true);
        api.audio.play('wrong');
        return;
      }
      history.push({ tiles: tiles.slice(), steps: steps.slice() });
      steps.push(a.v + op + x.v);
      var made = { id: nextId++, v: v, made: true, fresh: true };
      tiles = tiles.filter(function (y) { return y.id !== a.id && y.id !== x.id; });
      tiles.push(made);
      first = null; op = null;
      api.audio.play('land');
      if (v === item.target) {
        if (expert && tiles.length > 1) {
          say(t('ncHitSpare', 'You hit it! Use every tile for +50, or press Done.'));
          draw();
          return;
        }
        say(t('ncHit', 'Target hit!'));
        draw();
        submit(made);
        return;
      }
      say('');
      draw();
    }
    function draw() {
      FF.ui.clear(tilesEl);
      tiles.forEach(function (x) {
        var b = FF.ui.el('button', { type: 'button', class: 'nc-tile' + (x.made ? ' is-made' : '') + (x.fresh && animationsOn() ? ' is-fresh' : '') + (x.id === first ? ' is-first' : '') + (x.v === item.target ? ' is-hit' : ''), 'aria-pressed': x.id === first ? 'true' : 'false' }, String(x.v));
        x.fresh = false;
        b.disabled = locked;
        b.addEventListener('click', function () { tapTile(x); });
        tilesEl.appendChild(b);
      });
      signBtns.forEach(function (s) { s.el.classList.toggle('is-on', s.op === op); s.el.disabled = locked || first == null; });
      FF.ui.clear(log);
      stepLines(steps.join(',')).forEach(function (line) { log.appendChild(FF.ui.el('li', {}, line)); });
      undoBtn.disabled = locked || !history.length;
      clearBtn.disabled = locked || !steps.length;
      doneBtn.disabled = locked;
    }
    draw();
    return {
      el: el,
      open: function () { open = true; el.classList.add('is-open'); draw(); },
      timeUp: function () { submit(); },
      finish: function () { locked = true; draw(); },
      destroy: function () { locked = true; }
    };
  }

  function targetCard(item) {
    var el = FF.ui.div('nc-card nc-card--target');
    el.appendChild(FF.ui.el('p', { class: 'nc-target__label' }, t('ncMake', 'Make')));
    var big = FF.ui.el('p', { class: 'nc-target__big' }, String(item.target));
    el.appendChild(big);
    return {
      el: el,
      reveal: function (res) {
        var line = res.off === 0 ? t('ncExact', 'Exactly {n}!', { n: item.target })
          : res.value == null ? t('ncNoTile', 'No tile was picked.')
            : t('ncOffBy', 'You made {v}, {d} away.', { v: res.value, d: res.off });
        el.appendChild(FF.ui.el('p', { class: 'nc-target__res' }, line));
        el.classList.add(res.off === 0 ? 'is-right' : 'is-wrong');
      }
    };
  }

  /* ================= setup ================= */

  var GLYPH_SUM = '7 × 8 = ?';

  function setupScreen(api, players, onGo) {
    api.shell.hideTimer();
    if (FF.GameLength && FF.GameLength.pause) FF.GameLength.pause();
    var saved = R.sanitize(store().get(SETUP_KEY, null) || R.STANDARD);
    var cfg = JSON.parse(JSON.stringify(saved));
    var f = frame(api, { className: 'nc--setup' });

    var teaser = sumCard(GLYPH_SUM, { className: 'is-teaser' });
    f.stage.appendChild(teaser.el);
    f.side.appendChild(FF.ui.el('p', { class: 'nc-tagline' }, [
      FF.ui.span('', t('ncTag1', 'Quick sums. ')), FF.ui.span('', t('ncTag2', 'Big streaks. ')), FF.ui.span('nc-hi', t('ncTag3', 'How fast is your head?'))
    ]));
    var how = FF.ui.el('ul', { class: 'nc-how' });
    [t('ncHow1', 'Pick a way to play and a level.'),
      t('ncHow2', 'Answer before the clock runs out. Faster scores more.'),
      t('ncHow3', 'Expert: type the exact answer on the number pad.')].forEach(function (x, i) {
      var li = FF.ui.el('li', {});
      li.appendChild(FF.ui.span('nc-how__n', String(i + 1)));
      li.appendChild(FF.ui.span('', x));
      how.appendChild(li);
    });
    f.side.appendChild(how);

    var box = FF.ui.div('nc-setup');
    f.panel.appendChild(box);
    function heading(text, host) { (host || box).appendChild(FF.ui.el('h2', { class: 'nc-h' }, text)); }
    function group(cls, label, host) { var g = FF.ui.el('div', { class: 'nc-seg ' + cls, role: 'group', 'aria-label': label }); (host || box).appendChild(g); return g; }
    function seg(wrap, label, meta, fn) {
      var b = FF.ui.el('button', { type: 'button', class: 'nc-opt' });
      b.appendChild(FF.ui.span('nc-opt__name', label));
      var m = FF.ui.span('nc-opt__meta', meta || '');
      b.appendChild(m);
      b.addEventListener('click', function () { if (b.disabled) return; api.audio.play('tap'); fn(); sync(); });
      wrap.appendChild(b);
      return { el: b, meta: m };
    }
    function pressed(el, yes) { el.classList.toggle('is-on', yes); el.setAttribute('aria-pressed', yes ? 'true' : 'false'); }

    heading(t('ncWayToPlay', 'Way to play'));
    var modeWrap = group('nc-modes', t('ncWayToPlay', 'Way to play'));
    var modeBtns = R.MODES.map(function (m) {
      var b = FF.ui.el('button', { type: 'button', class: 'nc-mode nc-mode--' + m });
      var ic = FF.ui.span('nc-mode__ic');
      ic.appendChild(icon(MODE_ICON[m]));
      b.appendChild(ic);
      b.appendChild(FF.ui.span('nc-mode__name', modeName(m)));
      b.appendChild(FF.ui.span('nc-mode__line', modeLine(m)));
      b.addEventListener('click', function () {
        api.audio.play('tap');
        if (cfg.mode !== m) { cfg.mode = m; cfg.rounds = R.sanitize({ mode: m }).rounds; drawOptions(); }
        sync();
      });
      modeWrap.appendChild(b);
      return { el: b, id: m };
    });

    heading(t('gsChooseLevel', 'Choose your level'));
    var levelWrap = group('nc-levels', t('gcLevel', 'Level'));
    var levelBtns = R.LEVELS.map(function (l) { var x = seg(levelWrap, levelName(l), '', function () { cfg.level = l; }); x.id = l; return x; });
    var levelNote = FF.ui.el('p', { class: 'nc-note' });
    box.appendChild(levelNote);

    var optsHost = FF.ui.div('nc-modeopts');
    box.appendChild(optsHost);
    var optBtns = [];
    function drawOptions() {
      FF.ui.clear(optsHost);
      optBtns = [];
      function add(title, list, getter, setter, name, metaOf) {
        heading(title, optsHost);
        var wrap = group('nc-opts', title, optsHost);
        list.forEach(function (v) {
          var x = seg(wrap, name(v), '', function () { setter(v); });
          optBtns.push({ x: x, on: function () { return getter() === v; }, meta: metaOf ? function () { return metaOf(v); } : null });
        });
      }
      var m = cfg.mode;
      if (m === 'sprint') {
        add(t('ncLength', 'Sprint length'), R.SPRINTS, function () { return cfg.sprint; }, function (v) { cfg.sprint = v; }, function (v) { return v + ' s'; });
      } else {
        add(m === 'chain' ? t('ncChains', 'Chains') : m === 'target' ? t('ncTargets', 'Targets') : t('ncSums', 'Sums'), R.ROUNDS[m],
          function () { return cfg.rounds; }, function (v) { cfg.rounds = v; }, function (v) { return String(v); });
        if (m === 'chain') {
          add(t('ncSpeed', 'Speed'), R.SPEEDS, function () { return cfg.speed; }, function (v) { cfg.speed = v; }, speedName,
            function (v) { return (R.STEP_MS[v] / 1000).toFixed(1) + ' s'; });
        } else {
          add(m === 'target' ? t('ncTimeTarget', 'Time for each target') : t('ncTimeSum', 'Time for each sum'), R.TIMES,
            function () { return cfg.time; }, function (v) { cfg.time = v; }, timeName,
            function (v) { var secs = R.secondsFor(R.sanitize({ mode: m, level: cfg.level, time: v }), {}); return secs ? secs + ' s' : '∞'; });
        }
      }
    }
    drawOptions();

    heading(t('swLook', 'Look'));
    var lookWrap = group('nc-looks', t('swLook', 'Look'));
    var lookBtns = LOOKS.map(function (l) {
      var b = seg(lookWrap, lookName(l), '', function () {
        try { store().set(LOOK_KEY, l); } catch (e) { /* storage full */ }
        f.root.setAttribute('data-nc-look', l);
      });
      b.id = l;
      b.el.classList.add('nc-look--' + l);
      return b;
    });

    var foot = FF.ui.div('nc-setup__foot');
    var info = FF.ui.el('p', { class: 'nc-note', 'aria-live': 'polite' });
    foot.appendChild(info);
    var go = FF.ui.el('button', { type: 'button', class: 'nc-btn nc-btn--go nc-btn--big' });
    go.appendChild(icon('play'));
    go.appendChild(FF.ui.span('', t('swGo', 'Start')));
    go.addEventListener('click', function () {
      var c = R.sanitize(cfg);
      try { store().set(SETUP_KEY, c); } catch (e) { /* storage full */ }
      api.audio.play('roundStart');
      if (FF.GameLength && FF.GameLength.resume) FF.GameLength.resume();
      onGo(c);
    });
    foot.appendChild(go);
    box.appendChild(foot);

    function sync() {
      modeBtns.forEach(function (x) { pressed(x.el, x.id === cfg.mode); });
      levelBtns.forEach(function (x) { pressed(x.el, x.id === cfg.level); });
      levelNote.textContent = levelLine(cfg.level);
      optBtns.forEach(function (o) { pressed(o.x.el, o.on()); if (o.meta) o.x.meta.textContent = o.meta(); });
      lookBtns.forEach(function (x) { pressed(x.el, x.id === look()); });
      var bits = [summary(R.sanitize(cfg))];
      if (players > 1) bits.push(t('ncTurnsNote', '{n} players take turns', { n: players }));
      var ranked = FF.Leaderboards && FF.Leaderboards.active && FF.Leaderboards.active(api.def);
      if (ranked && !R.isStandard(cfg)) bits.push(t('nrUnranked', 'Leaderboards use the standard settings'));
      info.textContent = bits.join(' · ');
    }
    sync();
    if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(box);
  }

  /* ================= solo and turns ================= */

  function scorerList(config) {
    if (config.scorers && config.scorers.length) return config.scorers;
    return config.players && config.players.length ? config.players : [{ id: 'p1', name: t('playerLabel', 'Player') }];
  }
  function playModeOf(config) { return scorerList(config).length > 1 && config.mode === 'turn' ? 'turn' : 'solo'; }
  /* Daily, challenge and celebration runs always play the standard settings. */
  function settingsFor(config, cfg) { return R.sanitize(config && (config.daily || config.challenge) ? R.STANDARD : cfg); }
  /* The order of turns: Quick sums, Chain and Make the target go item by item round the players;
     Sprint is one whole sprint each. */
  function turnPlan(cfg, n) {
    var out = [];
    if (cfg.mode === 'sprint') { for (var p = 0; p < n; p++) out.push({ p: p, k: 0 }); return out; }
    for (var k = 0; k < cfg.rounds; k++) for (var q = 0; q < n; q++) out.push({ p: q, k: k });
    return out;
  }

  FF.NumberChallengeTurns = {
    create: function (ids) {
      var s = { order: ids.slice(), cur: 0, points: {}, streak: {}, best: {} };
      ids.forEach(function (id) { s.points[id] = 0; s.streak[id] = 0; s.best[id] = 0; });
      return s;
    },
    next: function (s) {
      var o = JSON.parse(JSON.stringify(s));
      o.cur = o.order.length ? (o.cur + 1) % o.order.length : 0;
      return o;
    },
    award: function (s, id, pts, ok) {
      var o = JSON.parse(JSON.stringify(s));
      o.points[id] = (o.points[id] || 0) + (pts || 0);
      o.streak[id] = ok ? (o.streak[id] || 0) + 1 : 0;
      o.best[id] = Math.max(o.best[id] || 0, o.streak[id]);
      return o;
    }
  };

  /* One run on this phone: every mode, Solo or Turns. */
  function play(api, cfg, seed, playMode) {
    cfg = settingsFor(api.config, cfg);
    var scorers = scorerList(api.config);
    var turns = playMode === 'turn' && scorers.length > 1;
    if (!turns) scorers = scorers.slice(0, 1);
    var n = scorers.length;
    var deals = scorers.map(function (e, p) { return R.deal(cfg, seed, p).items; });
    var plan = turnPlan(cfg, n);
    var turn = FF.NumberChallengeTurns.create(scorers.map(function (e) { return e.id; }));
    var f = frame(api, { className: 'nc--play nc--' + cfg.mode });
    var idx = -1;
    var stats = {};
    scorers.forEach(function (e) { stats[e.id] = { right: 0, played: 0, fastest: null, exact: 0, sprint: null }; });
    var played = [];
    var totals = { right: 0, played: 0 };
    var passed = {};
    var current = null;   // the open item's cleanup

    var scoreBox = FF.ui.div('nc-card-s nc-score');
    f.side.appendChild(scoreBox);
    var roundChip = chip('', 'nc-chip--round');
    f.chips.appendChild(roundChip);
    f.chips.appendChild(chip(levelName(cfg.level), 'nc-chip--lv nc-lv-' + cfg.level));
    var scoreChip = chip('0', 'nc-chip--score');
    f.chips.appendChild(scoreChip);
    var flameHost = FF.ui.span('nc-flamehost');
    f.chips.appendChild(flameHost);
    var ring = timerRing();
    var head = FF.ui.div('nc-head');
    f.stage.appendChild(head);
    head.appendChild(ring.el);
    var cardHost = FF.ui.div('nc-cardhost');
    f.stage.appendChild(cardHost);
    f.side.appendChild(chip(modeName(cfg.mode), 'nc-chip--mode'));

    function drawScores(activeId, bump) {
      FF.ui.clear(scoreBox);
      scoreBox.appendChild(FF.ui.el('p', { class: 'nc-card-s__title' }, n > 1 ? t('swTakingTurns', 'Taking turns') : t('gsYourScore', 'Your score')));
      var rows = FF.ui.el('ol', { class: 'nc-board' });
      scorers.slice().sort(function (a, b) { return (api.scoring.get(b.id) || 0) - (api.scoring.get(a.id) || 0); }).forEach(function (e, i) {
        var li = FF.ui.el('li', { class: 'nc-row' + (e.id === activeId && n > 1 ? ' is-active' : '') });
        li.appendChild(FF.ui.span('nc-row__place', String(i + 1)));
        var ava = FF.ui.span('nc-row__ava');
        if (FF.Players && FF.Players.avatarEl) ava.appendChild(FF.Players.avatarEl(e, ''));
        li.appendChild(ava);
        li.appendChild(FF.ui.span('nc-row__name', e.name || t('playerLabel', 'Player')));
        var pts = FF.ui.span('nc-row__pts', FF.util.formatNumber(api.scoring.get(e.id) || 0));
        li.appendChild(pts);
        if (bump && bump.id === e.id && G() && G().countUp) G().countUp(pts, bump.from, bump.to, 800);
        rows.appendChild(li);
      });
      scoreBox.appendChild(rows);
      if (api.shell.updateScores) api.shell.updateScores(n > 1 ? activeId : undefined);
      scoreChip.textContent = FF.util.formatNumber(api.scoring.get(activeId) || 0);
      FF.ui.clear(flameHost);
      flameHost.appendChild(flame(turn.streak[activeId] || 0));
    }

    function next() {
      idx++;
      if (idx >= plan.length) { recap(); return; }
      render();
    }

    /* Turns: hand the phone over. */
    function passCard(entity, go, sprint) {
      ring.idle();
      FF.ui.clear(cardHost);
      FF.ui.clear(f.panel);
      var card = FF.ui.div('nc-pass');
      var ava = FF.ui.span('nc-pass__ava');
      if (FF.Players && FF.Players.avatarEl) ava.appendChild(FF.Players.avatarEl(entity, ''));
      card.appendChild(ava);
      var name = entity.name || t('playerLabel', 'Player');
      card.appendChild(FF.ui.el('h2', { class: 'nc-h nc-h--xl' }, sprint ? t('swPassTo', 'Pass to {name}', { name: name }) : t('ncTurnOf', '{name}’s turn', { name: name })));
      card.appendChild(FF.ui.el('p', { class: 'nc-note' }, sprint ? t('ncSprintPass', '{s} seconds. Ready, steady…', { s: cfg.sprint }) : t('ncTurnNote', 'Your own sum, the same kind as everyone else’s.')));
      var b = FF.ui.el('button', { type: 'button', class: 'nc-btn nc-btn--go nc-btn--big' });
      b.appendChild(icon('play'));
      b.appendChild(FF.ui.span('', t('ncGo', 'Go!')));
      b.addEventListener('click', function () { api.audio.play('click'); go(); });
      card.appendChild(b);
      f.panel.appendChild(card);
      focus(b);
    }

    function render() {
      var step = plan[idx];
      var entity = scorers[step.p];
      var item = deals[step.p][step.k];
      api.shell.hideTimer();
      api.shell.setOnTick(null);
      api.shell.updateScores(n > 1 ? entity.id : undefined);
      turn.cur = step.p;
      roundChip.textContent = (n > 1 ? (entity.name || '') + ' · ' : '') + (cfg.mode === 'sprint' ? modeName('sprint') : t('ncRoundOf', '{r} of {n}', { r: step.k + 1, n: cfg.rounds }));
      drawScores(entity.id);
      if (n > 1 && !passed[idx]) { passCard(entity, function () { passed[idx] = true; render(); }, cfg.mode === 'sprint'); return; }
      ring.idle();
      FF.ui.clear(cardHost);
      FF.ui.clear(f.panel);
      f.root.classList.remove('is-revealed');
      if (cfg.mode === 'sprint') { runSprint(entity, step.p); return; }
      if (cfg.mode === 'chain') { runChain(entity, item); return; }
      if (cfg.mode === 'target') { runTarget(entity, item); return; }
      runQuick(entity, item);
    }

    /* Start the item's clock; returns how long it has been open. */
    function clock(secs, onEnd) {
      var started = Date.now();
      if (secs) {
        api.shell.setOnTick(function (rem) { ring.set(rem, secs); });
        api.shell.setTimer(secs, onEnd);
        ring.set(secs, secs);
      }
      return function () { return Date.now() - started; };
    }
    function stopClock() { api.shell.setOnTick(null); api.shell.hideTimer(); }

    /* Score one finished item and draw its reveal bar with the Next button. */
    function settle(entity, item, res, given, timeout, lines, ms) {
      var st = stats[entity.id];
      st.played++; totals.played++;
      var before = api.scoring.get(entity.id) || 0;
      turn = FF.NumberChallengeTurns.award(turn, entity.id, res.points, res.ok);
      played.push({ item: item, ok: res.ok, given: given, res: res, who: entity });
      if (res.points > 0 || res.ok) {
        if (res.ok) { st.right++; totals.right++; if (st.fastest == null || ms < st.fastest) st.fastest = ms; }
        api.scoring.add(entity.id, res.points, res.ok ? { correct: true, fastest: ms / 1000 } : null);
      } else {
        api.scoring.add(entity.id, 0, { wrong: true });
      }
      if (!res.ok && api.scoring.resetStreak) api.scoring.resetStreak(entity.id);
      var streakNow = turn.streak[entity.id] || 0;
      if (res.ok) {
        api.audio.play(streakNow >= 3 ? 'streak' : 'correct');
        if (animationsOn() && FF.Confetti && (streakNow >= 3 || cfg.mode === 'target')) FF.Confetti.burst(streakNow >= 5 ? 70 : 40);
      } else api.audio.play(res.points > 0 ? 'correct' : 'wrong');
      f.root.classList.add('is-revealed');
      drawScores(entity.id, { id: entity.id, from: before, to: api.scoring.get(entity.id) || 0 });
      var after = FF.ui.div('nc-after');
      f.panel.appendChild(after);
      after.appendChild(revealBar({ state: res.ok ? 'good' : res.points > 0 ? 'close' : timeout ? 'late' : 'bad', points: res.points, lines: lines }));
      var last = idx + 1 >= plan.length;
      var nextBtn = FF.Advance.button(last ? t('seeResults', 'See results') : t('ncNext', 'Next'), function () {
        api.audio.play('click');
        if (current) { current(); current = null; }
        next();
      }, { class: 'nc-btn nc-btn--go nc-next', primary: false });
      after.appendChild(nextBtn);
      if (after.scrollIntoView && window.innerWidth < 900) { try { after.scrollIntoView({ behavior: animationsOn() ? 'smooth' : 'auto', block: 'nearest' }); } catch (e) { /* old browser */ } }
      setTimeout(function () { if (document.body.contains(nextBtn)) focus(nextBtn); }, 400);
    }

    function runQuick(entity, item) {
      var card = sumCard(item.text);
      cardHost.appendChild(card.el);
      var done = false;
      var secs = R.secondsFor(cfg, item);
      var board = answerBoard(api, cfg, item, function (text) { answer(text, false); });
      f.panel.appendChild(board.el);
      current = function () { board.destroy(); };
      api.audio.play('land');
      var elapsed = clock(secs, function () { answer(null, true); });
      board.open();
      if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(board.el);
      function answer(text, timeout) {
        if (done || !stillShown(api)) return;
        done = true;
        var ms = timeout ? secs * 1000 : elapsed();
        stopClock();
        if (timeout && secs) ring.set(0, secs);
        var res = R.judge(cfg, item, text, ms);
        board.finish(item.answer);
        card.reveal(item.answer, res.ok, timeout ? null : text);
        settle(entity, item, res, text, timeout, [res.ok ? '' : t('ncAnswerIs', 'The answer is {a}.', { a: item.answer })], ms);
      }
    }

    function runChain(entity, item) {
      var card = chainCard(item, R.STEP_MS[cfg.speed]);
      cardHost.appendChild(card.el);
      var done = false, elapsed = null;
      var secs = R.secondsFor(cfg, item);
      var board = answerBoard(api, cfg, item, function (text) { answer(text, false); });
      f.panel.appendChild(board.el);
      current = function () { card.stop(); board.destroy(); };
      api.audio.play('land');
      card.run(function () {
        if (!stillShown(api)) return;
        api.audio.play('roundStart');
        elapsed = clock(secs, function () { answer(null, true); });
        board.open();
        if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(board.el);
      });
      function answer(text, timeout) {
        if (done || !elapsed || !stillShown(api)) return;
        done = true;
        var ms = timeout ? secs * 1000 : elapsed();
        stopClock();
        var res = R.judge(cfg, item, text, ms);
        board.finish(item.answer);
        card.reveal(res.ok, timeout ? '' : text);
        settle(entity, item, res, text, timeout, [], ms);
      }
    }

    function runTarget(entity, item) {
      var card = targetCard(item);
      cardHost.appendChild(card.el);
      var done = false;
      var secs = R.secondsFor(cfg, item);
      var board = targetBoard(api, item, cfg, function (text) { answer(text, false); });
      f.panel.appendChild(board.el);
      current = function () { board.destroy(); };
      api.audio.play('land');
      var elapsed = clock(secs, function () { board.timeUp(); });
      board.open();
      function answer(text, timeout) {
        if (done || !stillShown(api)) return;
        done = true;
        var ms = elapsed();
        stopClock();
        var res = R.judge(cfg, item, text, ms);
        if (res.ok) stats[entity.id].exact++;
        board.finish();
        card.reveal(res);
        var lines = [];
        if (res.ok && cfg.level === 'expert') lines.push(res.usedAll ? t('ncAllTiles', 'Every tile used: +50!') : t('ncNotAll', 'Use every tile next time for +50.'));
        if (!res.ok) lines.push(t('ncOneWay', 'One way: {w}', { w: stepLines(item.solution).join(' · ') }));
        settle(entity, item, res, text, timeout, lines, ms);
      }
    }

    /* Sprint: one player, one clock, sum after sum. */
    function runSprint(entity, p) {
      var items = deals[p];
      var st = R.sprintCreate(cfg, Date.now());
      var total = cfg.sprint;
      var bar = FF.ui.div('nc-bar');
      var fill = FF.ui.div('nc-bar__fill');
      bar.appendChild(fill);
      var info = FF.ui.div('nc-sprintinfo');
      var rightChip = chip(t('ncNRight', '{n} right', { n: 0 }), 'nc-chip--right');
      var tierPips = FF.ui.span('nc-tiers');
      for (var i = 1; i <= 5; i++) tierPips.appendChild(FF.ui.span('nc-tier'));
      info.appendChild(rightChip);
      info.appendChild(tierPips);
      FF.ui.clear(cardHost);
      cardHost.appendChild(bar);
      cardHost.appendChild(info);
      var sumHost = FF.ui.div('nc-sumhost');
      cardHost.appendChild(sumHost);
      var board = null, card = null, ticker = null, finished = false, flash = null;
      current = function () { finished = true; if (ticker) clearInterval(ticker); if (board) board.destroy(); };
      function tick() {
        if (!stillShown(api)) { current(); return; }
        var rem = Math.max(0, (R.sprintEndAt(st) - Date.now()) / 1000);
        ring.set(rem, total);
        fill.style.width = (100 * Math.min(1, rem / total)) + '%';
        bar.classList.toggle('is-low', rem <= 5);
        if (R.sprintOver(st, Date.now())) finish();
      }
      function show() {
        if (finished) return;
        var item = items[st.i];
        if (!item) { finish(); return; }
        Array.prototype.forEach.call(tierPips.children, function (pip, j) { pip.classList.toggle('is-on', j < item.tier); });
        FF.ui.clear(sumHost);
        FF.ui.clear(f.panel);
        card = sumCard(item.text, { className: 'nc-card--sprint' });
        sumHost.appendChild(card.el);
        board = answerBoard(api, cfg, item, function (text) { answer(text); });
        f.panel.appendChild(board.el);
        board.open();
      }
      function answer(text) {
        if (finished) return;
        var r = R.sprintAnswer(st, items, text, Date.now());
        if (r.ignored) { finish(); return; }
        rightChip.textContent = t('ncNRight', '{n} right', { n: st.right });
        FF.ui.clear(flameHost);
        flameHost.appendChild(flame(st.streak));
        if (r.right) {
          api.audio.play('correct');
          scoreChip.textContent = FF.util.formatNumber((api.scoring.get(entity.id) || 0) + st.score);
          show();
          return;
        }
        api.audio.play('wrong');
        board.finish(r.item.answer);
        card.reveal(r.item.answer, false, text);
        bar.classList.add('is-hit');
        cardHost.appendChild(flash = FF.ui.span('nc-penalty', '−' + (r.penaltyMs / 1000) + ' s'));
        setTimeout(function () {
          bar.classList.remove('is-hit');
          if (flash && flash.parentNode) flash.parentNode.removeChild(flash);
          show();
        }, 700);
      }
      function finish() {
        if (finished) return;
        finished = true;
        if (ticker) clearInterval(ticker);
        if (board) board.destroy();
        ring.set(0, total);
        var s = stats[entity.id];
        s.played += st.right + st.wrong; s.right += st.right; s.sprint = st;
        totals.played += st.right + st.wrong; totals.right += st.right;
        var before = api.scoring.get(entity.id) || 0;
        turn = FF.NumberChallengeTurns.award(turn, entity.id, st.score, st.right > 0);
        turn.best[entity.id] = Math.max(turn.best[entity.id] || 0, st.best);
        if (st.score) api.scoring.add(entity.id, st.score, { correct: true });
        played.push({ sprint: st, who: entity, items: items });
        FF.ui.clear(sumHost);
        FF.ui.clear(f.panel);
        var per = Math.round(st.right / Math.max(1, (st.lengthMs - Math.max(0, R.sprintEndAt(st) - Date.now())) / 60000));
        drawScores(entity.id, { id: entity.id, from: before, to: api.scoring.get(entity.id) || 0 });
        api.audio.play(st.right ? 'winner' : 'wrong');
        if (st.right >= 10 && animationsOn() && FF.Confetti) FF.Confetti.burst(80);
        var after = FF.ui.div('nc-after');
        f.panel.appendChild(after);
        after.appendChild(revealBar({
          state: st.right ? 'good' : 'late', stampText: t('ncTimeUpSprint', 'Time!'), points: st.score,
          lines: [t('ncSprintLineOut', '{r} right, {w} wrong · best streak {b}', { r: st.right, w: st.wrong, b: st.best }),
            st.right ? t('ncPerMinute', 'About {n} a minute', { n: per }) : '']
        }));
        var last = idx + 1 >= plan.length;
        var nextBtn = FF.Advance.button(last ? t('seeResults', 'See results') : t('ncNext', 'Next'), function () { api.audio.play('click'); current = null; next(); }, { class: 'nc-btn nc-btn--go nc-next', primary: false });
        after.appendChild(nextBtn);
        setTimeout(function () { if (document.body.contains(nextBtn)) focus(nextBtn); }, 400);
      }
      api.audio.play('roundStart');
      ticker = setInterval(tick, 100);
      tick();
      show();
    }

    function recap() {
      api.shell.hideTimer();
      api.shell.setOnTick(null);
      FF.ui.clear(cardHost);
      FF.ui.clear(f.panel);
      FF.ui.clear(f.chips);
      head.style.display = 'none';
      f.root.classList.add('is-recap');
      var box = FF.ui.div('nc-recap');
      var pct = totals.played ? Math.round(totals.right / totals.played * 100) : 0;
      var ringEl = FF.ui.div('nc-recap__ring');
      ringEl.style.setProperty('--p', String(pct));
      ringEl.appendChild(FF.ui.span('', pct + '%'));
      box.appendChild(ringEl);
      box.appendChild(FF.ui.el('h2', { class: 'nc-h nc-h--xl' },
        cfg.mode === 'target' ? t('ncRecapTarget', '{c} of {a} targets hit', { c: totals.right, a: totals.played })
          : t('ncRecapTitle', '{c} of {a} right', { c: totals.right, a: totals.played })));
      box.appendChild(FF.ui.el('p', { class: 'nc-note' }, summary(cfg)));
      var people = FF.ui.el('ol', { class: 'nc-board nc-board--big' });
      scorers.slice().sort(function (a, b) { return (api.scoring.get(b.id) || 0) - (api.scoring.get(a.id) || 0); }).forEach(function (e, i) {
        var s = stats[e.id];
        var li = FF.ui.el('li', { class: 'nc-row' + (i === 0 ? ' is-top' : '') });
        li.appendChild(FF.ui.span('nc-row__place', String(i + 1)));
        var ava = FF.ui.span('nc-row__ava');
        if (FF.Players && FF.Players.avatarEl) ava.appendChild(FF.Players.avatarEl(e, ''));
        li.appendChild(ava);
        var who = FF.ui.span('nc-row__name');
        who.appendChild(FF.ui.span('', e.name || t('playerLabel', 'Player')));
        var bits = [t('qmRightOf', '{c}/{a} right', { c: s.right, a: s.played })];
        if ((turn.best[e.id] || 0) > 1) bits.push(t('qmBestStreak', 'best streak {n}', { n: turn.best[e.id] }));
        who.appendChild(FF.ui.span('nc-row__meta', bits.join(' · ')));
        li.appendChild(who);
        li.appendChild(FF.ui.span('nc-row__pts', FF.util.formatNumber(api.scoring.get(e.id) || 0)));
        people.appendChild(li);
      });
      box.appendChild(people);
      var check = [];
      played.forEach(function (p) {
        if (p.sprint) {
          for (var i = 0; i < p.sprint.i; i++) { /* sprint misses are shown in the bar at the time */ }
          return;
        }
        if (!p.ok) check.push(p);
      });
      if (check.length) {
        box.appendChild(FF.ui.el('h3', { class: 'nc-h' }, t('ncToCheck', 'Sums to check')));
        var list = FF.ui.el('ul', { class: 'nc-learn' });
        check.forEach(function (p) {
          var it = p.item, text;
          if (it.kind === 'chain') text = R.chainText(it);
          else if (it.kind === 'target') text = t('ncMakeFrom', 'Make {t} from {tiles}: {w}', { t: it.target, tiles: it.tiles.join(', '), w: stepLines(it.solution).join(' · ') });
          else text = it.text.replace('?', String(it.answer));
          var li = FF.ui.el('li', {});
          li.appendChild(FF.ui.el('p', { class: 'nc-learn__text' }, text));
          if (n > 1) li.appendChild(FF.ui.el('p', { class: 'nc-learn__who' }, p.who.name || ''));
          list.appendChild(li);
        });
        box.appendChild(list);
      }
      var go = FF.ui.el('button', { type: 'button', class: 'nc-btn nc-btn--go nc-btn--big' });
      go.appendChild(icon('trophy'));
      go.appendChild(FF.ui.span('', t('seeResults', 'See results')));
      go.addEventListener('click', end);
      box.appendChild(go);
      f.panel.appendChild(box);
      api.audio.play('winner');
      if (pct >= 80 && animationsOn() && FF.Confetti) FF.Confetti.burst(90);
      if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(box);
    }

    function end() {
      var res = api.scoring.results ? api.scoring.results() : null;
      var best = 0, fastest = null;
      Object.keys(stats).forEach(function (id) {
        best = Math.max(best, turn.best[id] || 0);
        if (stats[id].fastest != null && (fastest == null || stats[id].fastest < fastest)) fastest = stats[id].fastest / 1000;
      });
      var ach = [];
      if (best >= 5) ach.push('streak5');
      if (best >= 10) ach.push('streak10');
      if (cfg.mode !== 'sprint' && totals.played > 0 && totals.right === totals.played) ach.push('perfect');
      api.end({ results: (res && res.results) || [], winnerId: res ? res.winnerId : null, bestStreak: best, fastest: fastest, quizCorrect: totals.right, quizAnswered: totals.played, achievements: ach });
    }

    next();
  }

  /* ================= online Race ================= */

  var AUTO_SCORES_MS = 90000;
  var NUDGE_MS = 8000;

  /* The chain as the referee publishes it: the start, then the step on show, then "= ?". */
  function onlineChainCard() {
    var el = FF.ui.div('nc-card nc-card--chain');
    var label = FF.ui.el('p', { class: 'nc-chain__label' });
    var big = FF.ui.el('p', { class: 'nc-chain__big', 'aria-live': 'assertive' });
    var pips = FF.ui.div('nc-pips');
    el.appendChild(label);
    el.appendChild(big);
    el.appendChild(pips);
    var drawn = null;
    function show(text, kind) {
      big.textContent = text;
      big.className = 'nc-chain__big' + (kind ? ' is-' + kind : '');
      if (animationsOn()) { big.classList.remove('is-in'); void big.offsetWidth; big.classList.add('is-in'); }
    }
    function stepText(st) {
      if (st.op === 'double') return t('ncDoubleIt', 'double it');
      if (st.op === 'half') return t('ncHalfIt', 'half it');
      return opText(st.op === 'x' ? '*' : st.op) + ' ' + st.n;
    }
    return {
      el: el,
      draw: function (rd, phase) {
        var key = phase === 'steps' ? 's' + rd.shown : 'ask';
        if (drawn === key) return;
        drawn = key;
        if (pips.children.length !== rd.steps) { FF.ui.clear(pips); for (var i = 0; i < rd.steps; i++) pips.appendChild(FF.ui.span('nc-pip')); }
        Array.prototype.forEach.call(pips.children, function (p, i) { p.classList.toggle('is-on', i < (phase === 'steps' ? rd.shown : rd.steps)); });
        if (phase === 'steps' && rd.shown === 0) { label.textContent = t('ncStartAt', 'Start at'); show(String(rd.start)); return; }
        if (phase === 'steps') { label.textContent = t('ncStepN', 'Step {n} of {m}', { n: rd.shown, m: rd.steps }); show(stepText(rd.step), 'step'); return; }
        label.textContent = t('ncWhatNow', 'What is the total now?');
        show('= ?', 'ask');
      },
      reveal: function (answer, ok, given) {
        drawn = 'reveal';
        label.textContent = ok ? t('ncRightTotal', 'Right total!') : given ? t('ncYouSaid', 'You said {x}', { x: given }) : t('ncTheTotal', 'The total');
        show(String(answer), ok ? 'right' : 'wrong');
        el.classList.add(ok ? 'is-right' : 'is-wrong');
      }
    };
  }

  /* Everyone gets the same item at once; the server's referee (js/numberchallenge/referee.js)
     checks, times and scores every answer. Each phone keeps its own look. */
  function online(api, room) {
    var mode0 = (room.meta && room.meta.settings && R.sanitizeRoom(room.meta.settings).mode) || 'quick';
    var f = frame(api, { className: 'nc--play nc--online nc--' + mode0 });
    api.shell.hideTimer();
    if (FF.Race && FF.Race.begin) FF.Race.begin(api.def.id, { rounds: 1, mode: 'parallel' });
    var client = FF.NumberChallengeClient.create({ room: room, onChange: schedule });
    var ended = false, pending = null, nudged = {}, autoScores = null;
    var shownRound = null, board = null, card = null, sentText = null, revealShown = null, finishedShown = false, opened = null;
    var sprint = null;     // this phone's own marking of its Sprint
    var lastScores = {};
    var ring = timerRing();
    var head = FF.ui.div('nc-head');
    head.appendChild(ring.el);
    f.stage.appendChild(head);
    var cardHost = FF.ui.div('nc-cardhost');
    f.stage.appendChild(cardHost);
    var roundChip = chip('', 'nc-chip--round');
    f.chips.appendChild(roundChip);
    var levelHolder = FF.ui.span('');
    f.chips.appendChild(levelHolder);
    var flameHost = FF.ui.span('nc-flamehost');
    f.chips.appendChild(flameHost);
    var boardBox = FF.ui.div('nc-card-s nc-score');
    f.side.appendChild(boardBox);
    var ticker = setInterval(tick, 100);

    function expected() { return room.meta && room.meta.ncMatch; }
    function who(uid) {
      var p = (room.players || {})[uid] || {};
      return { id: uid, uid: uid, name: p.name || t('playerLabel', 'Player'), avatar: p.avatar || null, color: p.color || null };
    }
    function schedule() { if (!pending) pending = setTimeout(function () { pending = null; render(); }, 0); }
    function cleanup() {
      if (ended) return;
      ended = true;
      clearInterval(ticker);
      if (pending) clearTimeout(pending);
      if (autoScores) clearTimeout(autoScores);
      if (board) board.destroy();
      client.stop();
      if (FF.Race && FF.Race.end) { try { FF.Race.end(); } catch (e) { /* not running */ } }
    }
    function finish() { if (ended) return; cleanup(); api.end({}); }
    function maybeNudge(key, due) {
      if (nudged[key] || !due) return;
      if (client.serverNow() - due < NUDGE_MS) return;
      nudged[key] = true;
      FF.NumberChallengeApi.nudge(room.code);
    }

    /* The race board: points, who has answered (a tick, never what), Sprint counts live. */
    function drawLeader(nc) {
      FF.ui.clear(boardBox);
      boardBox.appendChild(FF.ui.el('p', { class: 'nc-card-s__title' }, t('ncRace', 'Number race')));
      var rows = FF.ui.el('ol', { class: 'nc-board' });
      var reveal = nc.phase === 'reveal' && nc.last && nc.last.k === nc.k;
      var order = (nc.order || []).slice().sort(function (a, b) { return ((nc.p[b] || {}).score || 0) - ((nc.p[a] || {}).score || 0); });
      order.forEach(function (uid, i) {
        var row = nc.p[uid] || {};
        var li = FF.ui.el('li', { class: 'nc-row' + (uid === client.uid ? ' is-me' : '') });
        li.appendChild(FF.ui.span('nc-row__place', String(i + 1)));
        var ava = FF.ui.span('nc-row__ava');
        if (FF.Players && FF.Players.avatarEl) ava.appendChild(FF.Players.avatarEl(who(uid), ''));
        li.appendChild(ava);
        var nm = FF.ui.span('nc-row__name');
        nm.appendChild(FF.ui.span('', who(uid).name + (uid === client.uid ? ' ' + t('youTag', '(you)') : '')));
        if (nc.settings.mode === 'sprint' && nc.phase === 'open') nm.appendChild(FF.ui.span('nc-row__meta', t('ncNRight', '{n} right', { n: row.right || 0 })));
        li.appendChild(nm);
        var pts = FF.ui.span('nc-row__pts', FF.util.formatNumber(row.score || 0));
        li.appendChild(pts);
        if (nc.phase === 'open' && nc.settings.mode !== 'sprint' && row.inK === nc.k) {
          var tickEl = FF.ui.span('nc-row__in', '✓');
          tickEl.setAttribute('aria-label', t('swAnswered', 'answered'));
          li.appendChild(tickEl);
        }
        if (reveal) {
          var res = nc.last.results[uid] || {};
          li.classList.add(res.right ? 'is-good' : 'is-bad');
          var before = lastScores[uid] != null ? lastScores[uid] : (row.score || 0) - (res.points || 0);
          if (before !== (row.score || 0) && G() && G().countUp) G().countUp(pts, before, row.score || 0, 900);
        }
        lastScores[uid] = row.score || 0;
        rows.appendChild(li);
      });
      boardBox.appendChild(rows);
      FF.ui.clear(flameHost);
      var me = nc.p[client.uid];
      if (me) flameHost.appendChild(flame(sprint ? sprint.st.streak : me.streak || 0));
    }

    function waiting(title, sub) {
      FF.ui.clear(cardHost);
      FF.ui.clear(f.panel);
      var w = FF.ui.div('nc-wait');
      w.appendChild(FF.ui.div('nc-wait__spin'));
      w.appendChild(FF.ui.el('h2', { class: 'nc-h' }, title));
      if (sub) w.appendChild(FF.ui.el('p', { class: 'nc-note' }, sub));
      f.panel.appendChild(w);
    }

    function tick() {
      if (ended) return;
      var nc = client.view().nc;
      if (!nc || nc.matchId !== expected()) return;
      var now = client.serverNow();
      if (nc.phase === 'open' && nc.round) {
        if (sprint) sprintTick(now);
        else ring.set((nc.closeAt - now) / 1000, nc.round.seconds || 1);
        // Make the target: send the nearest tile just before the clock, so it reaches the referee in time.
        if (nc.settings.mode === 'target' && board && !board.sent && board.timeUp && now >= nc.closeAt - 400) board.timeUp();
      }
      var due = nc.phase === 'starting' ? nc.readyAt : nc.phase === 'ready' || nc.phase === 'steps' ? nc.openAt : nc.phase === 'open' ? nc.closeAt : nc.phase === 'reveal' ? nc.nextAt : 0;
      if (due) maybeNudge(nc.phase + nc.k, due);
    }

    function brief(s) {
      return s.mode === 'sprint' ? t('ncBriefSprint', 'As many sums as you can before your clock runs out. A wrong answer takes seconds off your clock.')
        : s.mode === 'chain' ? t('ncBriefChain', 'Keep the running total in your head as the steps appear, then pick the total.')
          : s.mode === 'target' ? t('ncBriefTarget', 'Join tiles with a sign to make new tiles. Hit the target, or get as close as you can.')
            : t('ncBriefQuick', 'Everyone gets the same sum. Faster right answers score more. One answer per sum.');
    }

    function render() {
      if (ended) return;
      if (!f.root.isConnected) { cleanup(); return; }
      var v = client.view();
      var nc = v.nc;
      if (!nc || (expected() && nc.matchId !== expected()) || !FF.NumberChallengeClient.ready(nc)) {
        if (!nc || nc.matchId !== expected()) waiting(t('ncGettingReady', 'Dealing the numbers…'), t('ncGettingReadySub', 'Everyone gets the same sum at the same moment.'));
        return;
      }
      var s = nc.settings;
      FF.ui.clear(levelHolder);
      levelHolder.appendChild(chip(levelName(s.level), 'nc-chip--lv nc-lv-' + s.level));
      roundChip.textContent = nc.k < 0 ? t('gsGetReady', 'Get ready') : s.mode === 'sprint' ? modeName('sprint') : t('ncRoundOf', '{r} of {n}', { r: nc.k + 1, n: nc.total });
      drawLeader(nc);
      if (nc.phase === 'ended') { if (!finishedShown) showEnd(nc, v); return; }
      if (nc.phase === 'starting') {
        ring.idle();
        waiting(modeName(s.mode), brief(s));
        return;
      }
      if (!v.seated) {
        waiting(t('gsWatching', 'This game started without you'), t('gsWatchingSub', 'You can join the next one.'));
        return;
      }
      var key = nc.matchId + '|' + nc.k;
      if (shownRound !== key) buildRound(nc, key, v);
      if (card && card.draw) card.draw(nc.round, nc.phase);
      if (!board && s.mode !== 'sprint' && nc.phase !== 'steps') attachBoard(nc);
      if (nc.phase === 'open' && board && opened !== key) {
        opened = key;
        board.open();
        api.audio.play('land');
        if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(board.el);
      }
      var me = nc.p[v.uid] || {};
      if (s.mode !== 'sprint' && nc.phase === 'open' && me.inK === nc.k && board && !board.sent) { board.sent = true; board.lock(); }
      if (nc.phase === 'reveal' && revealShown !== key) showReveal(nc, v, key);
    }

    var lockEl = null;
    function onSubmit(text) {
      if (!board || board.sent) return;
      if (!client.send(text)) return;
      board.sent = true;
      sentText = text;
      board.lock();
      api.audio.play('select');
      if (lockEl) { lockEl.textContent = t('bqLockedIn', 'Answer locked in. Waiting for everyone…'); lockEl.classList.add('is-on'); }
    }

    function buildRound(nc, key, v) {
      shownRound = key;
      revealShown = null;
      sentText = null;
      sprint = null;
      opened = null;
      if (board) board.destroy();
      board = null;
      card = null;
      FF.ui.clear(cardHost);
      FF.ui.clear(f.panel);
      f.root.classList.remove('is-revealed');
      ring.idle();
      var rd = nc.round;
      var s = nc.settings;
      if (s.mode === 'sprint') { buildSprint(nc, v); return; }
      if (s.mode === 'target') card = targetCard({ tiles: rd.tiles, ops: rd.ops, target: rd.target });
      else if (s.mode === 'chain') card = onlineChainCard();
      else card = sumCard(rd.text);
      cardHost.appendChild(card.el);
      // A chain's choices come with the open, so its board waits for them.
      if (s.mode !== 'chain' || nc.phase !== 'steps') attachBoard(nc);
    }

    function attachBoard(nc) {
      var rd = nc.round;
      var s = nc.settings;
      var inner = s.mode === 'target'
        ? targetBoard(api, { tiles: rd.tiles, ops: rd.ops, target: rd.target }, s, function (text) { onSubmit(text); })
        : answerBoard(api, s, { choices: rd.choices }, onSubmit);
      board = {
        el: inner.el, sent: false, timeUp: inner.timeUp,
        open: inner.open, finish: inner.finish, destroy: inner.destroy,
        lock: function () { inner.el.classList.add('is-locked'); }
      };
      lockEl = FF.ui.el('p', { class: 'nc-locked', 'aria-live': 'polite' });
      f.panel.appendChild(board.el);
      f.panel.appendChild(lockEl);
      f.panel.appendChild(FF.ui.div('nc-after'));
    }

    /* ---------- Sprint: this phone marks at once; the referee's numbers are the ones that count ---------- */

    function buildSprint(nc, v) {
      var rd = nc.round;
      var items = rd.list.map(function (x) { return { text: x.text, tier: x.tier, choices: x.choices, answer: R.solveText(x.text) }; });
      var st = R.sprintCreate(nc.settings, nc.openAt);
      var me = nc.p[v.uid] || {};
      // Back after a reload: carry on from where the referee has this player.
      if (typeof me.at === 'number') { st.i = me.at; st.right = me.right || 0; st.wrong = me.wrong || 0; st.penalty = Math.max(0, nc.openAt + st.lengthMs - (me.end || nc.openAt + st.lengthMs)); st.done = !!me.done; }
      var bar = FF.ui.div('nc-bar');
      var fill = FF.ui.div('nc-bar__fill');
      bar.appendChild(fill);
      var info = FF.ui.div('nc-sprintinfo');
      var rightChip = chip(t('ncNRight', '{n} right', { n: st.right }), 'nc-chip--right');
      var tierPips = FF.ui.span('nc-tiers');
      for (var i = 1; i <= 5; i++) tierPips.appendChild(FF.ui.span('nc-tier'));
      info.appendChild(rightChip);
      info.appendChild(tierPips);
      cardHost.appendChild(bar);
      cardHost.appendChild(info);
      var sumHost = FF.ui.div('nc-sumhost');
      cardHost.appendChild(sumHost);
      var sumCardNow = null, inner = null, done = false;
      sprint = { st: st, items: items, bar: bar, fill: fill };
      function show() {
        if (done) return;
        var item = items[st.i];
        if (!item || st.done) { over(); return; }
        Array.prototype.forEach.call(tierPips.children, function (pip, j) { pip.classList.toggle('is-on', j < item.tier); });
        FF.ui.clear(sumHost);
        FF.ui.clear(f.panel);
        sumCardNow = sumCard(item.text, { className: 'nc-card--sprint' });
        sumHost.appendChild(sumCardNow.el);
        inner = answerBoard(api, nc.settings, item, answer);
        f.panel.appendChild(inner.el);
        if (opened) inner.open();
      }
      function answer(text) {
        if (done) return;
        var i = st.i;
        var r = R.sprintAnswer(st, items, text, client.serverNow());
        if (r.ignored) { over(); return; }
        client.sendSprint(i, text);
        rightChip.textContent = t('ncNRight', '{n} right', { n: st.right });
        FF.ui.clear(flameHost);
        flameHost.appendChild(flame(st.streak));
        if (r.right) { api.audio.play('correct'); show(); return; }
        api.audio.play('wrong');
        inner.finish(r.item.answer);
        sumCardNow.reveal(r.item.answer, false, text);
        bar.classList.add('is-hit');
        var pen = FF.ui.span('nc-penalty', '−' + (r.penaltyMs / 1000) + ' s');
        cardHost.appendChild(pen);
        setTimeout(function () {
          bar.classList.remove('is-hit');
          if (pen.parentNode) pen.parentNode.removeChild(pen);
          show();
        }, 700);
      }
      function over() {
        if (done) return;
        done = true;
        client.flushSprint();
        if (inner) inner.destroy();
        FF.ui.clear(sumHost);
        FF.ui.clear(f.panel);
        var w = FF.ui.div('nc-wait');
        w.appendChild(FF.ui.el('h2', { class: 'nc-h nc-h--xl' }, t('ncTimeUpSprint', 'Time!')));
        w.appendChild(FF.ui.el('p', { class: 'nc-note' }, t('ncSprintMine', '{r} right, {w} wrong', { r: st.right, w: st.wrong })));
        w.appendChild(FF.ui.el('p', { class: 'nc-note' }, t('ncWaitOthers', 'Waiting for the others to finish…')));
        f.panel.appendChild(w);
      }
      sprint.show = show;
      sprint.over = over;
      sprint.open = function () { if (!inner) show(); else inner.open(); };
      board = { el: FF.ui.div(''), sent: true, open: function () { sprint.open(); }, finish: function () {}, destroy: function () { done = true; if (inner) inner.destroy(); }, lock: function () {} };
      show();
    }

    function sprintTick(now) {
      var st = sprint.st;
      var total = st.lengthMs / 1000;
      var rem = Math.max(0, (R.sprintEndAt(st) - now) / 1000);
      ring.set(rem, total);
      sprint.fill.style.width = (100 * Math.min(1, rem / total)) + '%';
      sprint.bar.classList.toggle('is-low', rem <= 5);
      if (R.sprintOver(st, now)) sprint.over();
    }

    /* ---------- the reveal ---------- */

    function showReveal(nc, v, key) {
      revealShown = key;
      var last = nc.last;
      var s = nc.settings;
      var mine = last.results[v.uid] || { right: false, points: 0, text: '' };
      ring.set(0, 1);
      f.root.classList.add('is-revealed');
      if (lockEl) lockEl.classList.remove('is-on');
      if (s.mode === 'sprint') {
        if (sprint) sprint.over();
        FF.ui.clear(f.panel);
      } else {
        if (board) board.finish(s.mode === 'target' ? undefined : last.answer);
        var given = mine.text || sentText;
        if (s.mode === 'target') card.reveal({ off: mine.off == null ? null : mine.off, value: mine.value == null ? null : mine.value });
        else if (s.mode === 'chain') card.reveal(last.answer, !!mine.right, given);
        else card.reveal(last.answer, !!mine.right, mine.right ? null : given);
      }
      var good = s.mode === 'sprint' ? (mine.points || 0) > 0 : mine.right === true;
      api.audio.play(good ? 'correct' : 'wrong');
      if ((s.mode === 'sprint' ? (mine.right || 0) >= 10 : good) && animationsOn() && FF.Confetti) FF.Confetti.burst(40);
      var after = (f.panel.querySelector && f.panel.querySelector('.nc-after')) || f.panel.appendChild(FF.ui.div('nc-after'));
      FF.ui.clear(after);
      var lines = [];
      if (s.mode === 'sprint') lines.push(t('ncSprintLineOut', '{r} right, {w} wrong · best streak {b}', { r: mine.right || 0, w: mine.wrong || 0, b: mine.best || 0 }));
      else if (s.mode === 'target' && !mine.right && last.solution) lines.push(t('ncOneWay', 'One way: {w}', { w: stepLines(last.solution).join(' · ') }));
      else if (!mine.right && s.mode === 'quick') lines.push(t('ncAnswerIs', 'The answer is {a}.', { a: last.answer }));
      after.appendChild(revealBar({
        state: s.mode === 'sprint' ? (mine.points ? 'good' : 'late') : mine.right ? 'good' : mine.points > 0 ? 'close' : mine.answered ? 'bad' : 'late',
        stampText: s.mode === 'sprint' ? t('ncTimeUpSprint', 'Time!') : null,
        points: mine.points || 0, lines: lines
      }));
      // Everyone's result, best first.
      var listEl = FF.ui.el('ul', { class: 'nc-results' });
      (nc.order || []).slice().sort(function (a, b) {
        var ra = last.results[a] || {}, rb = last.results[b] || {};
        return (rb.points || 0) - (ra.points || 0) || (ra.ms || 0) - (rb.ms || 0);
      }).forEach(function (uid) {
        var r = last.results[uid] || {};
        var good = s.mode === 'sprint' ? (r.points || 0) > 0 : !!r.right;
        var li = FF.ui.el('li', { class: 'nc-results__row ' + (good ? 'is-good' : 'is-bad') });
        li.appendChild(FF.ui.span('nc-results__name', who(uid).name));
        var said = s.mode === 'sprint' ? t('ncNRight', '{n} right', { n: r.right || 0 })
          : s.mode === 'target' ? (r.value != null ? t('ncMade', 'made {v}', { v: r.value }) + (r.off ? ' (' + r.off + ' off)' : '') : t('swNoAnswer', 'no answer'))
            : r.right ? (r.ms / 1000).toFixed(1) + 's' : r.answered && r.text ? r.text : t('swNoAnswer', 'no answer');
        li.appendChild(FF.ui.span('nc-results__said', said));
        li.appendChild(FF.ui.span('nc-results__pts', '+' + FF.util.formatNumber(r.points || 0)));
        listEl.appendChild(li);
      });
      after.appendChild(listEl);
      after.appendChild(FF.ui.el('p', { class: 'nc-note nc-nextin' }, nc.k + 1 >= nc.total ? t('gsFinalSoon', 'Final results coming up…') : t('ncNextSoon', 'Next one in a moment…')));
    }

    function showEnd(nc, v) {
      finishedShown = true;
      if (board) board.destroy();
      board = null;
      ring.idle();
      head.style.display = 'none';
      FF.ui.clear(cardHost);
      FF.ui.clear(f.panel);
      f.root.classList.add('is-recap');
      var rows = (nc.result && nc.result.rows) || [];
      var box = FF.ui.div('nc-recap nc-recap--room');
      var top = rows[0];
      var meWon = top && top.uid === v.uid && !(rows[1] && rows[1].place === 1);
      box.appendChild(FF.ui.el('h2', { class: 'nc-h nc-h--xl' }, meWon ? t('ncYouWin', 'You win the number race!')
        : top ? t('ncWinner', '{name} wins the number race!', { name: who(top.uid).name }) : t('gsOver', 'Game over')));
      var podium = FF.ui.div('nc-podium');
      [1, 0, 2].forEach(function (i) {
        var r = rows[i];
        if (!r) return;
        var col = FF.ui.div('nc-podium__col nc-podium__col--' + (i + 1));
        var ava = FF.ui.span('nc-podium__ava');
        if (FF.Players && FF.Players.avatarEl) ava.appendChild(FF.Players.avatarEl(who(r.uid), ''));
        col.appendChild(ava);
        col.appendChild(FF.ui.span('nc-podium__name', who(r.uid).name));
        col.appendChild(FF.ui.span('nc-podium__pts', FF.util.formatNumber(r.points || 0)));
        var step = FF.ui.div('nc-podium__step');
        step.appendChild(FF.ui.span('', String(r.place || i + 1)));
        col.appendChild(step);
        podium.appendChild(col);
      });
      box.appendChild(podium);
      var listEl = FF.ui.el('ol', { class: 'nc-board nc-board--big' });
      rows.forEach(function (r) {
        var li = FF.ui.el('li', { class: 'nc-row' + (r.uid === v.uid ? ' is-me' : '') + (r.place === 1 ? ' is-top' : '') });
        li.appendChild(FF.ui.span('nc-row__place', String(r.place)));
        var ava = FF.ui.span('nc-row__ava');
        if (FF.Players && FF.Players.avatarEl) ava.appendChild(FF.Players.avatarEl(who(r.uid), ''));
        li.appendChild(ava);
        var nm = FF.ui.span('nc-row__name');
        nm.appendChild(FF.ui.span('', who(r.uid).name));
        var bits = [nc.settings.mode === 'sprint' ? t('ncNRight', '{n} right', { n: r.right || 0 }) : t('qmRightOf', '{c}/{a} right', { c: r.right || 0, a: nc.total })];
        if (r.best > 1) bits.push(t('qmBestStreak', 'best streak {n}', { n: r.best }));
        nm.appendChild(FF.ui.span('nc-row__meta', bits.join(' · ')));
        li.appendChild(nm);
        li.appendChild(FF.ui.span('nc-row__pts', FF.util.formatNumber(r.points || 0)));
        listEl.appendChild(li);
      });
      box.appendChild(listEl);
      var go = FF.ui.el('button', { type: 'button', class: 'nc-btn nc-btn--go nc-btn--big' });
      go.appendChild(icon('trophy'));
      go.appendChild(FF.ui.span('', t('srtSeeScores', 'See scores')));
      go.addEventListener('click', function () { api.audio.play('click'); finish(); });
      box.appendChild(go);
      f.panel.appendChild(box);
      api.audio.play(meWon ? 'winner' : 'roundEnd');
      if (meWon && animationsOn() && FF.Confetti) FF.Confetti.burst(100);
      if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(box);
      if (!autoScores) autoScores = setTimeout(finish, AUTO_SCORES_MS);
    }

    render();
  }

  /* ================= room settings ================= */

  /* The host's choices for a room, each mode with its own options (rooms always have a clock). */
  function roomFields(gs) {
    function opt(label, value) { return { label: label, value: value }; }
    gs = gs || {};
    var s = R.sanitizeRoom(gs);
    // A mode change can leave a count the new mode does not offer: show its usual one.
    if (gs.mode != null && gs.rounds !== s.rounds) gs.rounds = s.rounds;
    if (gs.time != null && gs.time !== s.time) gs.time = s.time;
    var out = [
      { key: 'mode', label: t('ncWayToPlay', 'Way to play'), redraw: true, options: R.MODES.map(function (m) { return opt(modeName(m), m); }) },
      { key: 'level', label: t('gcLevel', 'Level'), options: R.LEVELS.map(function (l) { return opt(levelName(l), l); }) }
    ];
    if (s.mode === 'sprint') out.push({ key: 'sprint', label: t('ncLength', 'Sprint length'), options: R.SPRINTS.map(function (x) { return opt(x + ' s', x); }) });
    else out.push({ key: 'rounds', label: s.mode === 'chain' ? t('ncChains', 'Chains') : s.mode === 'target' ? t('ncTargets', 'Targets') : t('ncSums', 'Sums'), options: R.ROUNDS[s.mode].map(function (x) { return opt(String(x), x); }) });
    if (s.mode === 'chain') out.push({ key: 'speed', label: t('ncSpeed', 'Speed'), options: R.SPEEDS.map(function (x) { return opt(speedName(x), x); }) });
    if (s.mode === 'quick' || s.mode === 'target') out.push({ key: 'time', label: s.mode === 'target' ? t('ncTimeTarget', 'Time for each target') : t('ncTimeSum', 'Time for each sum'), options: ['quick', 'normal', 'relaxed'].map(function (x) { return opt(timeName(x), x); }) });
    return out;
  }

  var ROOM = {
    minPlayers: R.MIN_PLAYERS,
    defaults: R.STANDARD,
    fields: function (gs) { return roomFields(gs); },
    sanitize: function (s) { return R.sanitizeRoom(s); },
    summary: function (s) { return summary(R.sanitizeRoom(s)); },
    start: function (room, pick) { return FF.NumberChallengeApi.start(room, pick); }
  };

  /* ================= registration ================= */

  FF.registerGame({
    id: 'numberChallenge',
    name: 'Number Challenge',
    description: 'Mental maths four ways: quick sums, a sprint against the clock, running-total chains and make-the-target puzzles.',
    category: 'numbers',
    icon: '🔢',
    players: [1, R.MAX_PLAYERS],
    difficulty: 'Normal',
    duration: 5,
    tags: ['maths', 'quick', 'online', 'race'],
    modes: ['solo', 'turn'],
    defaultMode: 'solo',
    leaderboard: true,
    howToPlay: [
      'Quick sums: answer each sum before the clock runs out. Faster answers score more.',
      'Sprint: as many as you can in 30, 60 or 90 seconds. A wrong answer costs 3 seconds.',
      'Chain: start with a number, follow each step in your head, then give the total.',
      'Make the target: join two tiles with a sign to make a new tile, and hit the target number.',
      'Expert: type the exact answer on the number pad for +50. In Make the target, use every tile for +50.',
      'Pick a Neon arcade or Notebook look.'
    ],
    room: ROOM,
    start: function (api) {
      var room = FF.Room && FF.Room.current();
      if (racingRoom(api) && room) { online(api, room); return; }
      // One seed decides the whole deal, drawn first so a challenge deals the same everywhere.
      var seed = Math.floor(rand0() * 4294967296);
      var playMode = playModeOf(api.config);
      if (api.config.daily || api.config.challenge) { play(api, R.STANDARD, seed, 'solo'); return; }
      var players = playMode === 'turn' ? scorerList(api.config).length : 1;
      setupScreen(api, players, function (cfg) {
        if (!stillShown(api)) return;
        if (!R.isStandard(cfg)) api.config.customRules = true;
        play(api, cfg, seed, playMode);
      });
    }
  });

  FF.NumberChallengeGame = {
    frame: frame, sumCard: sumCard, choiceBoard: choiceBoard, numberPad: numberPad, chainCard: chainCard,
    targetBoard: targetBoard, targetCard: targetCard, revealBar: revealBar, timerRing: timerRing, flame: flame, chip: chip,
    summary: summary, modeName: modeName, levelName: levelName, timeName: timeName, speedName: speedName, stepLines: stepLines,
    look: look, settingsFor: settingsFor, turnPlan: turnPlan, room: ROOM, online: online
  };
})();
