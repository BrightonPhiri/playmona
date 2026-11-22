/* ============================================================
   PLAYMONA — offline/screen.js  (FF.OfflineScreen)
   The projector window of Offline Event Mode: /offline?screen.
   Audience-facing only. It reads the event the MC window saves and
   draws it on a 1920×1080 stage scaled to fit the screen. Each
   scene is built once and then patched, so animations play once.
   Sounds are made in the browser (Web Audio), no files.
   /offline?screen&preview is the MC's small silent copy.
   Classic script, ES2017 or older.
   ============================================================ */
window.FF = window.FF || {};
(function () {
  'use strict';

  var L = function () { return FF.OfflineLogic; };
  var Store = function () { return FF.OfflineStore; };
  var preview = /[?&]preview\b/.test(location.search);

  /* ---------- tiny DOM helper ---------- */
  function h(tag, cls, kids, attrs) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'style') n.style.cssText = attrs[k]; else n.setAttribute(k, attrs[k]);
    });
    [].concat(kids == null ? [] : kids).forEach(function (c) {
      if (c == null || c === false) return;
      n.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
    return n;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function first(name) { return String(name || '').replace(/^team\s+/i, ''); }

  /* ---------- sound ---------- */
  var ac = null;
  function audio() {
    if (preview) return null;
    if (!ac) try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; }
    if (ac && ac.state === 'suspended') try { ac.resume(); } catch (e) {}
    return ac;
  }
  function tone(freq, at, dur, type, vol) {
    var a = audio();
    if (!a) return;
    var o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    var t0 = a.currentTime + (at || 0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.25, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (dur || 0.2));
    o.connect(g); g.connect(a.destination);
    o.start(t0); o.stop(t0 + (dur || 0.2) + 0.05);
  }
  var SFX = {
    tick: function () { tone(880, 0, 0.08, 'square', 0.06); },
    buzz: function () { tone(150, 0, 0.5, 'sawtooth', 0.18); tone(110, 0.05, 0.55, 'sawtooth', 0.14); },
    right: function () { tone(660, 0, 0.15, 'triangle', 0.3); tone(990, 0.12, 0.3, 'triangle', 0.3); },
    wrong: function () { tone(220, 0, 0.25, 'square', 0.12); tone(185, 0.18, 0.35, 'square', 0.12); },
    word: function () { tone(1046, 0, 0.18, 'sine', 0.2); },
    reveal: function () { [523, 659, 784].forEach(function (f, i) { tone(f, i * 0.09, 0.4, 'triangle', 0.22); }); },
    fanfare: function () { [523, 659, 784, 1046, 784, 1046].forEach(function (f, i) { tone(f, i * 0.14, i === 5 ? 0.9 : 0.25, 'triangle', 0.28); }); }
  };
  function sfx(k) { try { SFX[k](); } catch (e) {} }

  /* ---------- the stage ---------- */
  var st = { s: null, key: '', scene: null, lastTick: -1, seen: {} };
  var stage, fx = null, fxKind = '';

  function fit() {
    var k = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.transform = 'translate(-50%, -50%) scale(' + k + ')';
  }

  function effects(kind) {
    if (preview) kind = '';
    if (kind === fxKind) return;
    if (fx) { fx.stop(); fx = null; }
    fxKind = kind;
    var c = document.getElementById('offFx');
    if (kind && FF.CelebrateEffects && c) fx = FF.CelebrateEffects.start(c, kind, { colors: ['#e2b23a', '#f3dfb3', '#a77bff'], scale: 0.7 });
  }
  function confetti(n) { if (!preview && FF.Confetti) try { FF.Confetti.burst(n || 160); } catch (e) {} }

  /* A score strip along the foot of every game screen. */
  function strip(s) {
    var row = h('div', 'os-strip');
    L().standings(s).forEach(function (r) {
      row.appendChild(h('div', 'os-strip__team', [
        h('span', 'os-dot', null, { style: 'background:' + r.team.color }),
        h('span', 'os-strip__name', r.team.name),
        h('span', 'os-strip__pts', String(r.pts))
      ]));
    });
    return row;
  }
  function header(s, title, sub) {
    return h('header', 'os-head', [
      h('div', 'os-head__event', s.event.title),
      h('div', 'os-head__title', title),
      h('div', 'os-head__sub', sub || '')
    ]);
  }

  /* A round clock. update(tm, paused) redraws it. */
  function clockEl() {
    var R = 88, C = 2 * Math.PI * R;
    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 200 200');
    svg.setAttribute('class', 'os-clock__ring');
    var bg = document.createElementNS(svgNS, 'circle');
    bg.setAttribute('cx', 100); bg.setAttribute('cy', 100); bg.setAttribute('r', R); bg.setAttribute('class', 'os-clock__bg');
    var fg = document.createElementNS(svgNS, 'circle');
    fg.setAttribute('cx', 100); fg.setAttribute('cy', 100); fg.setAttribute('r', R); fg.setAttribute('class', 'os-clock__fg');
    fg.setAttribute('stroke-dasharray', C);
    svg.appendChild(bg); svg.appendChild(fg);
    var num = h('div', 'os-clock__num', '');
    var tag = h('div', 'os-clock__tag', '');
    var box = h('div', 'os-clock', [svg, num, tag]);
    box.update = function (tm) {
      var left = L().timeLeft(tm), frac = tm && tm.dur ? left / tm.dur : 0;
      fg.setAttribute('stroke-dashoffset', String(C * (1 - frac)));
      var secs = Math.ceil(left / 1000);
      num.textContent = secs >= 60 ? Math.floor(secs / 60) + ':' + ('0' + secs % 60).slice(-2) : String(secs);
      var paused = tm && !tm.running && left > 0 && left < tm.dur;
      var waiting = tm && !tm.running && left >= tm.dur;
      tag.textContent = paused ? 'Paused' : waiting ? 'Ready' : left <= 0 ? 'Time!' : '';
      box.classList.toggle('is-low', !!(tm && tm.running && secs <= 5));
      box.classList.toggle('is-paused', !!paused);
      box.classList.toggle('is-out', left <= 0);
      return { secs: secs, running: !!(tm && tm.running) };
    };
    return box;
  }

  /* Put a turn chip in host, unless the same one is already there (so it doesn't re-animate). */
  function setTurn(host, t, label) {
    var k = (t ? t.id + t.name + t.color : '-') + '|' + label;
    if (host._k === k) return;
    host._k = k;
    clear(host);
    host.appendChild(turnChip(t, label));
  }
  function turnChip(t, label) {
    if (!t) return h('div', 'os-turn os-turn--none', '');
    return h('div', 'os-turn', [
      h('div', 'os-turn__label', label || 'Your turn'),
      h('div', 'os-turn__name', t.name)
    ], { style: '--team:' + t.color });
  }

  /* ---------- scenes: build(s) returns { el, update(s), timer() } ---------- */

  function sceneWelcome(s) {
    var bg = h('div', 'os-welcome__bg');
    var el = h('section', 'os-scene os-welcome', [
      bg,
      h('div', 'os-welcome__veil'),
      h('div', 'os-welcome__inner', [
        h('div', 'os-welcome__kicker', 'Welcome to'),
        h('h1', 'os-gold os-welcome__title', s.event.title),
        h('div', 'os-welcome__tag', s.event.tagline || ''),
        h('div', 'os-welcome__rule')
      ])
    ]);
    if (s.event.welcomePhotoId) Store().photoUrl(s.event.welcomePhotoId).then(function (u) { if (u) { bg.style.backgroundImage = 'url("' + u + '")'; el.classList.add('has-photo'); } });
    effects('sparkles');
    return { el: el };
  }

  function sceneBlank() { effects(''); return { el: h('section', 'os-scene os-blank', h('img', 'os-blank__mark', null, { src: 'assets/brand/mark-256.webp', alt: '' })) }; }

  function bars(list, max) {
    var box = h('div', 'os-board');
    var top = Math.max(1, list.length ? list[0].pts : 1);
    list.slice(0, max || 10).forEach(function (r, i) {
      var bar = h('div', 'os-bar__fill', null, { style: 'background:' + r.team.color });
      var row = h('div', 'os-bar' + (r.place === 1 && r.pts > 0 ? ' is-lead' : ''), [
        h('div', 'os-bar__place', String(r.place)),
        h('div', 'os-bar__name', r.team.name),
        h('div', 'os-bar__track', bar),
        h('div', 'os-bar__pts', String(r.pts))
      ], { style: 'animation-delay:' + (i * 0.12) + 's' });
      box.appendChild(row);
      setTimeout(function () { bar.style.width = Math.max(3, r.pts / top * 100) + '%'; }, 120 + i * 120);
    });
    return box;
  }

  function sceneScores(s) {
    effects('');
    var el = h('section', 'os-scene os-scores', [
      h('h1', 'os-gold os-scores__title', 'Leaderboard'),
      h('div', 'os-scores__sub', 'Points from every game tonight'),
      bars(L().standings(s))
    ]);
    return { el: el };
  }

  function sceneWinners(s) {
    var list = L().standings(s);
    var top = list.filter(function (r) { return r.place === 1; });
    var podium = h('div', 'os-podium');
    var order = [1, 0, 2];
    order.forEach(function (i) {
      var r = list[i];
      if (!r) return;
      podium.appendChild(h('div', 'os-podium__step os-podium__step--' + r.place, [
        h('div', 'os-podium__name', r.team.name),
        h('div', 'os-podium__pts', r.pts + ' pts'),
        h('div', 'os-podium__block', [h('span', 'os-podium__place', String(r.place))], { style: '--team:' + r.team.color })
      ], { style: 'animation-delay:' + (i === 0 ? 1.2 : i === 1 ? 0.6 : 0.2) + 's' }));
    });
    var names = top.map(function (r) { return r.team.name; }).join(' & ');
    var el = h('section', 'os-scene os-winners', [
      h('div', 'os-winners__kicker', top.length > 1 ? 'Our winners, tied at the top' : 'Tonight\'s winners'),
      h('h1', 'os-gold os-winners__title', names || 'Everyone!'),
      podium
    ]);
    effects('sparkles');
    setTimeout(function () { confetti(220); sfx('fanfare'); }, 1300);
    setTimeout(function () { confetti(160); }, 3200);
    return { el: el };
  }

  /* ----- Picture Rush ----- */
  function scenePictureRush(s) {
    var g = s.pr;
    var size = g.size, n = size * size;
    var maxW = 1180, maxH = 720, aspect = g.aspect || 1;
    var bw = Math.min(maxW, maxH * aspect), bh = bw / aspect;
    var board = h('div', 'os-prb', null, { style: 'width:' + bw + 'px;height:' + bh + 'px;--n:' + size });
    var cols = h('div', 'os-prb__cols', null, { style: 'width:' + bw + 'px' });
    var rows = h('div', 'os-prb__rows', null, { style: 'height:' + bh + 'px' });
    for (var i = 0; i < size; i++) {
      cols.appendChild(h('span', '', L().LETTERS[i]));
      rows.appendChild(h('span', '', String(i + 1)));
    }
    var cells = [];
    for (var p = 0; p < n; p++) {
      var c = h('div', 'os-prb__cell', [h('span', 'os-prb__co', L().coord(p, size)), h('span', 'os-prb__tick', '✓')]);
      cells.push(c);
      board.appendChild(c);
    }
    var full = h('div', 'os-prb__full');
    board.appendChild(full);
    var url = null;
    var wrap = h('div', 'os-pr__boardwrap', [h('div', 'os-prb__corner'), cols, rows, board]);

    var clock = clockEl();
    var turn = h('div', 'os-pr__turn');
    var feed = h('div', 'os-pr__feed');
    var prog = h('div', 'os-pr__prog');
    var side = h('aside', 'os-pr__side', [turn, clock, feed, prog]);
    var done = h('div', 'os-pr__done');
    var foot = h('div', 'os-footwrap');
    var el = h('section', 'os-scene os-pr', [
      header(s, 'Picture Rush', size + ' × ' + size + ' · say “move A1 to B4”'),
      h('div', 'os-pr__main', [wrap, side]),
      done, foot
    ]);
    effects('');

    function paint(cell, piece) {
      var row = Math.floor(piece / size), col = piece % size, step = size > 1 ? 100 / (size - 1) : 0;
      if (url) cell.style.backgroundImage = 'url("' + url + '")';
      cell.style.backgroundSize = (size * 100) + '% ' + (size * 100) + '%';
      cell.style.backgroundPosition = (col * step) + '% ' + (row * step) + '%';
    }
    var shown = [];
    var wasDone = false;
    function update(s) {
      var g = s.pr;
      g.tiles.forEach(function (piece, pos) {
        var c = cells[pos];
        if (shown[pos] !== piece) {
          paint(c, piece);
          if (shown[pos] != null) { c.classList.remove('is-in'); void c.offsetWidth; c.classList.add('is-in'); }
          shown[pos] = piece;
        }
        c.classList.toggle('is-home', piece === pos);
      });
      var last = g.last;
      if (last && st.seen.pr !== last.id) {
        var fresh = st.seen.pr != null;
        st.seen.pr = last.id;
        var who = last.teamId ? L().team(s, last.teamId) : null;
        clear(feed);
        if (last.skip) feed.appendChild(h('div', 'os-feed os-feed--skip', 'Turn skipped'));
        else if (last.timeout) { feed.appendChild(h('div', 'os-feed os-feed--skip', (who ? who.name + ': ' : '') + 'time up!')); if (fresh) sfx('buzz'); }
        else if (last.from != null) {
          var txt = L().coord(last.from, size) + ' → ' + L().coord(last.to, size);
          feed.appendChild(h('div', 'os-feed ' + (last.ok ? 'os-feed--ok' : 'os-feed--no'), [
            h('div', 'os-feed__who', who ? who.name : ''),
            h('div', 'os-feed__move', txt),
            h('div', 'os-feed__res', last.ok ? (last.bonus ? '✓ +2 (lucky bonus!)' : '✓ +1 point') : '✗ Not there')
          ], who ? { style: '--team:' + who.color } : null));
          if (fresh) {
            [last.from, last.to].forEach(function (q) {
              var c = cells[q], k = last.ok ? 'is-good' : 'is-bad';
              c.classList.remove('is-good', 'is-bad'); void c.offsetWidth; c.classList.add(k);
            });
            sfx(last.ok ? 'right' : 'wrong');
          }
        }
      }
      if (g.done) { clear(turn); turn._k = ''; } else setTurn(turn, L().turnTeam(s, g), g.started ? 'Your turn' : 'First up');
      var placed = L().prPlaced(g);
      clear(prog);
      prog.appendChild(h('div', 'os-pr__progtext', placed + ' of ' + n + ' in place'));
      prog.appendChild(h('div', 'os-pr__progbar', h('div', 'os-pr__progfill', null, { style: 'width:' + (placed / n * 100) + '%' })));
      clear(foot);
      foot.appendChild(strip(s));
      if (g.done && !wasDone) {
        wasDone = true;
        el.classList.add('is-done');
        clear(done);
        var pts = L().prRoundPoints(s);
        var rows = L().activeTeams(s).map(function (t) { return { t: t, p: pts[t.id] || 0 }; }).sort(function (a, b) { return b.p - a.p; });
        done.appendChild(h('div', 'os-pr__donebox', [
          h('div', 'os-gold os-pr__donetitle', 'Picture complete!'),
          h('div', 'os-pr__donelist', rows.map(function (r) {
            return h('div', 'os-pr__donerow', [h('span', 'os-dot', null, { style: 'background:' + r.t.color }), h('span', '', r.t.name), h('b', '', '+' + r.p)]);
          }))
        ]));
        if (st.ready) { sfx('fanfare'); setTimeout(function () { confetti(200); }, 400); }
      } else if (!g.done && wasDone) { wasDone = false; el.classList.remove('is-done'); clear(done); }
    }
    Store().photoUrl(g.photoId).then(function (u) {
      url = u;
      full.style.backgroundImage = u ? 'url("' + u + '")' : '';
      shown = [];
      update(st.s);
    });
    return { el: el, update: update, timer: function (s) { return clock.update(s.pr.tm); } };
  }

  /* ----- Who Knows Vicky Best? ----- */
  function sceneQuiz(s) {
    var z = s.quiz, qs = L().quizQuestions(s);
    effects('');
    if (z.phase === 'done' || !qs[z.i]) {
      var list = L().standings(s, function (a) { return a.key && a.key.indexOf('quiz:' + z.round + ':') === 0; });
      return { el: h('section', 'os-scene os-scores', [
        h('h1', 'os-gold os-scores__title', 'Who Knows ' + s.event.celebrant + ' Best?'),
        h('div', 'os-scores__sub', 'Quiz results'),
        bars(list)
      ]) };
    }
    var q = qs[z.i];
    var clock = clockEl();
    var opts = h('div', 'os-quiz__opts os-quiz__opts--' + q.options.length);
    var optEls = q.options.map(function (o, i) {
      var e = h('div', 'os-quiz__opt', [h('span', 'os-quiz__letter', 'ABCDEF'.charAt(i)), h('span', 'os-quiz__text', o)], { style: 'animation-delay:' + (0.25 + i * 0.12) + 's' });
      opts.appendChild(e);
      return e;
    });
    var answer = h('div', 'os-quiz__answer');
    var who = h('div', 'os-quiz__who');
    var right = h('div', 'os-quiz__right');
    var el = h('section', 'os-scene os-quiz', [
      header(s, 'Who Knows ' + s.event.celebrant + ' Best?', 'Question ' + (z.i + 1) + ' of ' + qs.length),
      h('div', 'os-quiz__top', [h('h2', 'os-quiz__q', q.q), h('div', 'os-quiz__aside', [who, clock])]),
      q.options.length ? opts : h('div', 'os-quiz__open', z.mode === 'turns' ? 'What do you think? Say it out loud!' : 'Write your answer down!'),
      answer, right, h('div', 'os-footwrap', strip(s))
    ]);
    var wasRevealed = null;
    function update(s) {
      var z = s.quiz;
      if (z.mode === 'turns') setTurn(who, L().turnTeam(s, z), 'Answering');
      else if (who._k !== 'all') { who._k = 'all'; clear(who); who.appendChild(h('div', 'os-quiz__all', ['All teams', h('br'), 'write your answer'])); }
      if (z.revealed !== wasRevealed) {
        var first = wasRevealed === null;
        wasRevealed = z.revealed;
        el.classList.toggle('is-revealed', !!z.revealed);
        optEls.forEach(function (e, i) { e.classList.toggle('is-right', z.revealed && i === q.answer); e.classList.toggle('is-dim', z.revealed && i !== q.answer); });
        clear(answer);
        if (z.revealed && !q.options.length) answer.appendChild(h('div', 'os-quiz__answerbox', [h('div', 'os-quiz__answerlabel', 'The answer'), h('div', 'os-gold os-quiz__answertext', q.answerText || '—')]));
        if (z.revealed && !first) sfx('reveal');
      }
      clear(right);
      var got = L().activeTeams(s).filter(function (t) { return L().hasAward(s, L().quizKey(s, z.i, t.id)); });
      if (got.length) right.appendChild(h('div', 'os-quiz__gotrow', got.map(function (t) {
        return h('span', 'os-quiz__got', [h('span', 'os-dot', null, { style: 'background:' + t.color }), t.name + ' +' + s.settings.quizPoints]);
      })));
      var foot = el.querySelector('.os-footwrap');
      clear(foot); foot.appendChild(strip(s));
    }
    return { el: el, update: update, timer: function (s) { return clock.update(s.quiz.tm); } };
  }

  /* ----- Word by Word ----- */
  function sceneWbw(s) {
    var w = s.wbw;
    if (w.done) return sceneWbwDone(s);
    var msg = h('div', 'os-wbw__msg');
    var turn = h('div', 'os-wbw__turn');
    var bar = h('div', 'os-wbw__barfill');
    var secs = h('div', 'os-wbw__secs');
    var el = h('section', 'os-scene os-wbw', [
      header(s, 'Word by Word', 'A message for ' + s.event.celebrant + ', one word per team'),
      h('div', 'os-wbw__paper', msg),
      h('div', 'os-wbw__foot', [turn, h('div', 'os-wbw__bar', bar), secs]),
      h('div', 'os-footwrap')
    ]);
    effects('');
    var shownIds = '';
    function update(s) {
      var w = s.wbw;
      var ids = w.words.map(function (x) { return x.id; }).join(',');
      if (ids !== shownIds) {
        var grew = ids.length > shownIds.length && ids.indexOf(shownIds) === 0;
        shownIds = ids;
        clear(msg);
        if (w.opening) msg.appendChild(h('span', 'os-wbw__opening', w.opening + ' '));
        w.words.forEach(function (x, i) {
          var t = L().team(s, x.teamId);
          var isNew = grew && i === w.words.length - 1;
          msg.appendChild(h('span', 'os-wbw__word' + (isNew ? ' is-new' : ''), x.w, t ? { style: '--team:' + t.color } : null));
          msg.appendChild(document.createTextNode(' '));
        });
        msg.appendChild(h('span', 'os-wbw__caret', ''));
        if (grew && st.ready) sfx('word');
        var paper = msg.parentNode;
        if (paper) paper.scrollTop = paper.scrollHeight;
      }
      if (w.last && st.seen.wbw !== w.last.id) {
        var fresh = st.seen.wbw != null;
        st.seen.wbw = w.last.id;
        if (fresh && w.last.kind === 'timeout') sfx('buzz');
      }
      setTurn(turn, L().turnTeam(s, w), w.started ? 'Your word' : 'First word');
      var foot = el.querySelector('.os-footwrap');
      clear(foot); if (s.settings.wbwPoints) foot.appendChild(strip(s));
    }
    function timer(s) {
      var tm = s.wbw.tm, left = L().timeLeft(tm);
      bar.style.width = (tm.dur ? left / tm.dur * 100 : 0) + '%';
      var sec = Math.ceil(left / 1000);
      var paused = !tm.running && left > 0 && left < tm.dur;
      secs.textContent = paused ? 'Paused' : !tm.running && left >= tm.dur ? 'Ready' : sec + ' s';
      el.classList.toggle('is-low', tm.running && sec <= 3);
      return { secs: sec, running: tm.running };
    }
    return { el: el, update: update, timer: timer };
  }
  function sceneWbwDone(s) {
    var w = s.wbw;
    var text = L().wbwText(w);
    var big = text.length > 420 ? 'is-long' : text.length > 220 ? 'is-mid' : '';
    var teams = L().activeTeams(s).map(function (t) { return t.name; });
    var el = h('section', 'os-scene os-wbwdone', [
      h('div', 'os-wbwdone__kicker', 'Our message for ' + s.event.celebrant),
      h('div', 'os-wbwdone__card ' + big, [
        h('div', 'os-wbwdone__quote', '“'),
        h('div', 'os-wbwdone__text', text),
        h('div', 'os-wbwdone__from', 'With love, from ' + (teams.length > 1 ? teams.slice(0, -1).join(', ') + ' and ' + teams[teams.length - 1] : teams[0] || 'everyone'))
      ])
    ]);
    effects('sparkles');
    if (st.ready) setTimeout(function () { sfx('fanfare'); confetti(140); }, 500);
    return { el: el };
  }

  /* ----- Memory Challenge ----- */
  function objectsOf(s) {
    var byId = {};
    (FF.OfflineObjects || []).forEach(function (o) { byId[o.id] = o; });
    return s.memory.items.map(function (id) { return byId[id]; }).filter(Boolean);
  }
  function sceneMemory(s) {
    var m = s.memory, items = objectsOf(s);
    var clock = clockEl();
    effects('');
    var body;
    if (m.phase === 'ready') {
      body = h('div', 'os-mem__intro', [
        h('div', 'os-gold os-mem__big', items.length + ' things'),
        h('div', 'os-mem__line', 'You will see them for ' + Math.round(s.settings.memShowMs / 1000) + ' seconds.'),
        h('div', 'os-mem__line', 'No writing while they are on screen. Just look!')
      ]);
    } else if (m.phase === 'show' || m.phase === 'reveal') {
      body = h('div', 'os-mem__grid os-mem__grid--' + (items.length > 20 ? 'many' : 'some'), items.map(function (o, i) {
        return h('div', 'os-mem__item', [h('img', '', null, { src: o.src, alt: '' }), h('div', 'os-mem__name', o.name)],
          { style: 'animation-delay:' + (m.phase === 'reveal' ? i * 0.35 : i * 0.03) + 's' });
      }));
    } else {
      body = h('div', 'os-mem__intro', [
        h('div', 'os-gold os-mem__big', 'Pens ready!'),
        h('div', 'os-mem__line', 'Write down everything you remember.'),
        h('div', 'os-mem__line os-mem__dim', items.length + ' things were on the screen')
      ]);
    }
    var sub = m.phase === 'show' ? '' : m.phase === 'reveal' ? 'Here they are. Count your matches!' : 'How much can your team remember?';
    var showClock = m.phase === 'show' || m.phase === 'write';
    var el = h('section', 'os-scene os-mem os-mem--' + m.phase, [
      header(s, 'Memory Challenge', sub),
      h('div', 'os-mem__body', body),
      showClock ? h('div', 'os-mem__clock', clock) : null,
      h('div', 'os-footwrap', strip(s))
    ]);
    if (m.phase === 'reveal' && st.ready) sfx('reveal');
    function update(s) { var foot = el.querySelector('.os-footwrap'); clear(foot); foot.appendChild(strip(s)); }
    return { el: el, update: update, timer: function (s) { return showClock ? clock.update(s.memory.tm) : null; } };
  }

  /* ---------- which scene ---------- */
  function sceneKey(s) {
    if (s.screen === 'scores' || s.screen === 'winners') return s.screen + ':' + JSON.stringify(L().totals(s)) + s.active.join();
    if (s.screen === 'welcome') return 'welcome:' + s.event.title + s.event.tagline + s.event.welcomePhotoId;
    if (s.screen !== 'game' || !s.game) return s.screen;
    if (s.game === 'pictureRush' && s.pr) return 'pr:' + s.pr.round;
    if (s.game === 'quiz') return 'quiz:' + s.quiz.round + ':' + s.quiz.phase + ':' + s.quiz.i + ':' + (L().quizQuestions(s)[s.quiz.i] || {}).q;
    if (s.game === 'wbw' && s.wbw) return 'wbw:' + s.wbw.round + ':' + s.wbw.done;
    if (s.game === 'memory' && s.memory) return 'mem:' + s.memory.round + ':' + s.memory.phase;
    return 'welcome';
  }
  function build(s) {
    var k = s.screen === 'game' ? s.game : s.screen;
    if (k === 'pictureRush' && s.pr) return scenePictureRush(s);
    if (k === 'quiz') return sceneQuiz(s);
    if (k === 'wbw' && s.wbw) return sceneWbw(s);
    if (k === 'memory' && s.memory) return sceneMemory(s);
    if (k === 'scores') return sceneScores(s);
    if (k === 'winners') return sceneWinners(s);
    if (k === 'blank') return sceneBlank(s);
    return sceneWelcome(s);
  }

  function render() {
    var s = st.s = Store().load();
    var key = sceneKey(s);
    if (key !== st.key || !st.scene) {
      st.key = key;
      var old = stage.querySelector('.os-scene');
      st.scene = build(s);
      if (old) { old.classList.add('is-leaving'); setTimeout(function () { if (old.parentNode) old.parentNode.removeChild(old); }, 450); }
      stage.appendChild(st.scene.el);
    }
    if (st.scene.update) st.scene.update(s);
    tickClock();
  }
  function tickClock() {
    if (!st.scene || !st.scene.timer || !st.s) return;
    var r = st.scene.timer(st.s);
    if (r && r.running && r.secs <= 5 && r.secs > 0 && r.secs !== st.lastTick) { st.lastTick = r.secs; sfx('tick'); }
    if (r && !r.running) st.lastTick = -1;
  }

  function start() {
    document.body.classList.add('os-page');
    if (preview) document.body.classList.add('os-preview');
    stage = h('div', 'os-stage');
    document.body.appendChild(h('canvas', 'os-fx', null, { id: 'offFx' }));
    document.body.appendChild(stage);
    fit();
    window.addEventListener('resize', fit);
    Store().onChange(function (m) { if (m.type === 'state') render(); });
    render();
    st.ready = true;
    setInterval(tickClock, 100);
    // A slow safety net: if a message is ever missed, the screen still catches up.
    setInterval(function () {
      var raw = null;
      try { raw = localStorage.getItem(Store().KEY); } catch (e) {}
      var rev = raw ? (JSON.parse(raw).rev || 0) : 0;
      if (st.s && rev !== st.s.rev) render();
    }, 1500);
    if (!preview) {
      var hello = function () { Store().send({ type: 'screen', at: Date.now(), full: !!document.fullscreenElement, w: window.innerWidth, h: window.innerHeight }); };
      hello(); setInterval(hello, 2000);
      var gate = h('button', 'os-gate', [h('div', 'os-gold os-gate__title', 'Projector display'), h('div', 'os-gate__line', 'Click to go full screen and turn on sound'), h('div', 'os-gate__hint', 'Press F11 or Esc to leave full screen')]);
      gate.type = 'button';
      gate.addEventListener('click', function () {
        audio();
        try { if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {}); } catch (e) {}
        if (gate.parentNode) gate.parentNode.removeChild(gate);
      });
      document.body.appendChild(gate);
      document.addEventListener('dblclick', function () {
        try { if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); } catch (e) {}
      });
      var hideCursor = 0;
      document.addEventListener('mousemove', function () {
        document.body.classList.remove('os-nocursor');
        clearTimeout(hideCursor);
        hideCursor = setTimeout(function () { document.body.classList.add('os-nocursor'); }, 2500);
      });
    }
  }

  FF.OfflineScreen = { start: start };
})();
