/* ============================================================
   PLAYMONA — offline/logic.js  (FF.OfflineLogic)
   Offline Event Mode for Vicky's celebration: the whole event as
   one plain object, and every change the MC can make to it.
   No DOM, no network: the MC window is the only writer, the
   projector only reads. Timers are stored as end times, so both
   windows (same laptop, same clock) count down together.

     var L = FF.OfflineLogic;
     var s = L.fresh();
     L.prStart(s, { photoId, size: 4, aspect: 1.33 });
     L.prMove(s, 'A1', 'B4')  -> { ok, piece, error }
     L.totals(s) -> { teamId: points }

   Classic script, ES2017 or older. Runs in node for tests.
   ============================================================ */
(function (root) {
  'use strict';

  var FF = root.FF = root.FF || {};

  var TEAM_COLORS = ['#e2b23a', '#a77bff', '#f3dfb3', '#f08ba8', '#c9ced6', '#5fd4c4', '#ff9f5a', '#7fb2ff'];
  var DEFAULT_TEAMS = ['Team Gold', 'Team Purple', 'Team Champagne', 'Team Rose', 'Team Silver'];
  var LETTERS = 'ABCDEFGHIJ';

  function uid(p) { return (p || 'x') + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3); }
  function now() { return Date.now(); }

  /* ---------- timers: { dur, endsAt, left, running } ---------- */
  function timer(dur) { return { dur: dur, endsAt: null, left: dur, running: false }; }
  function timeLeft(tm, at) {
    if (!tm) return 0;
    if (tm.running && tm.endsAt) return Math.max(0, tm.endsAt - (at || now()));
    return Math.max(0, tm.left == null ? tm.dur : tm.left);
  }
  function tStart(tm, dur) {
    if (dur != null) tm.dur = dur;
    tm.left = tm.dur; tm.endsAt = now() + tm.dur; tm.running = true;
    return tm;
  }
  function tPause(tm) { if (tm && tm.running) { tm.left = timeLeft(tm); tm.running = false; tm.endsAt = null; } }
  function tResume(tm) { if (tm && !tm.running && tm.left > 0) { tm.endsAt = now() + tm.left; tm.running = true; } }
  function tStop(tm) { if (tm) { tm.running = false; tm.endsAt = null; tm.left = tm.dur; } }
  function expired(tm, at) { return !!(tm && tm.running && tm.endsAt && tm.endsAt <= (at || now())); }

  /* ---------- the event ---------- */
  function fresh() {
    var teams = DEFAULT_TEAMS.map(function (n, i) { return { id: 't' + (i + 1), name: n, color: TEAM_COLORS[i] }; });
    return {
      v: 1, rev: 0,
      event: { title: "Vicky's Birthday & Graduation", tagline: 'Celebration', celebrant: 'Vicky', welcomePhotoId: null },
      teams: teams,
      active: teams.map(function (t) { return t.id; }),
      awards: [],             // { id, teamId, pts, game, note, key, at }
      screen: 'welcome',      // welcome | game | scores | winners | blank
      game: null,             // pictureRush | quiz | wbw | memory
      photos: [],             // { id, name, w, h }  (the pictures live in IndexedDB)
      pr: null, quiz: quizFresh(), wbw: null, memory: null,
      settings: { prTurnMs: 20000, prKeepTurn: false, wbwTurnMs: 10000, wbwPoints: 0, quizMs: 30000, quizPoints: 1, memShowMs: 20000, memWriteMs: 60000 }
    };
  }

  function team(s, id) { for (var i = 0; i < s.teams.length; i++) if (s.teams[i].id === id) return s.teams[i]; return null; }
  function activeTeams(s) { return s.active.map(function (id) { return team(s, id); }).filter(Boolean); }

  function addTeam(s, name) {
    var used = s.teams.map(function (t) { return t.color; });
    var color = TEAM_COLORS.filter(function (c) { return used.indexOf(c) < 0; })[0] || TEAM_COLORS[s.teams.length % TEAM_COLORS.length];
    var t = { id: uid('t'), name: String(name || '').trim() || 'Team ' + (s.teams.length + 1), color: color };
    s.teams.push(t);
    s.active.push(t.id);
    return t;
  }
  function removeTeam(s, id) {
    s.teams = s.teams.filter(function (t) { return t.id !== id; });
    s.active = s.active.filter(function (x) { return x !== id; });
    s.awards = s.awards.filter(function (a) { return a.teamId !== id; });
  }
  function setActive(s, id, on) {
    var i = s.active.indexOf(id);
    if (on && i < 0) {
      // Keep the teams' own order, so turns go round the same way every game.
      s.active = s.teams.map(function (t) { return t.id; }).filter(function (x) { return x === id || s.active.indexOf(x) >= 0; });
    } else if (!on && i >= 0) s.active.splice(i, 1);
  }

  /* ---------- points ---------- */
  function award(s, teamId, pts, game, note, key) {
    if (!team(s, teamId) || !pts) return null;
    if (key) s.awards = s.awards.filter(function (a) { return a.key !== key; });
    var a = { id: uid('a'), teamId: teamId, pts: pts, game: game || 'mc', note: note || '', key: key || null, at: now() };
    s.awards.push(a);
    return a;
  }
  function unaward(s, key) { s.awards = s.awards.filter(function (a) { return a.key !== key; }); }
  function hasAward(s, key) { return s.awards.some(function (a) { return a.key === key; }); }
  function dropWhere(s, fn) { s.awards = s.awards.filter(function (a) { return !fn(a); }); }
  function totals(s, filter) {
    var out = {};
    s.teams.forEach(function (t) { out[t.id] = 0; });
    s.awards.forEach(function (a) { if (out[a.teamId] != null && (!filter || filter(a))) out[a.teamId] += a.pts; });
    return out;
  }
  /* Teams by points, highest first, with shared places for ties. */
  function standings(s, filter, all) {
    var tot = totals(s, filter);
    var list = (all ? s.teams : activeTeams(s)).map(function (t) { return { team: t, pts: tot[t.id] || 0 }; });
    list.sort(function (a, b) { return b.pts - a.pts; });
    var place = 0, last = null;
    list.forEach(function (r, i) { if (r.pts !== last) { place = i + 1; last = r.pts; } r.place = place; });
    return list;
  }

  /* ---------- turns ---------- */
  function nextTurn(g) {
    if (!g.order.length) return;
    g.turn = (g.turn + 1) % g.order.length;
  }
  function turnTeam(s, g) { return g && g.order.length ? team(s, g.order[g.turn % g.order.length]) : null; }

  /* ---------- Picture Rush: coordinates ---------- */
  function coord(pos, size) { return LETTERS[pos % size] + (Math.floor(pos / size) + 1); }
  /* "A1", "a1", "1A", " b 4 " -> position, or -1. Columns are letters, rows are numbers. */
  function parseCoord(text, size) {
    var x = String(text || '').toUpperCase().replace(/\s+/g, '');
    var m = /^([A-J])(\d{1,2})$/.exec(x) || /^(\d{1,2})([A-J])$/.exec(x);
    if (!m) return -1;
    var letter = /[A-J]/.test(m[1]) ? m[1] : m[2];
    var num = Number(/[A-J]/.test(m[1]) ? m[2] : m[1]);
    var col = LETTERS.indexOf(letter), row = num - 1;
    if (col < 0 || col >= size || row < 0 || row >= size) return -1;
    return row * size + col;
  }
  /* "A1 B4", "A1 to B4", "a1b4", "A1-B4" -> [from, to] or null. */
  function parseMove(text, size) {
    var x = String(text || '').toUpperCase().replace(/\bTO\b|->|→|-|,/g, ' ').trim();
    var parts = x.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      var m = /^([A-J]\d{1,2})([A-J]\d{1,2})$/.exec(parts[0]);
      if (m) parts = [m[1], m[2]];
    }
    if (parts.length !== 2) return null;
    var a = parseCoord(parts[0], size), b = parseCoord(parts[1], size);
    return a < 0 || b < 0 ? null : [a, b];
  }

  /* A shuffle where no piece starts on its own square's coordinate. */
  function derange(n, rnd) {
    rnd = rnd || Math.random;
    var a = [];
    for (var i = 0; i < n; i++) a.push(i);
    for (var tries = 0; tries < 50; tries++) {
      for (var j = n - 1; j > 0; j--) { var k = Math.floor(rnd() * (j + 1)); var t = a[j]; a[j] = a[k]; a[k] = t; }
      if (a.every(function (p, q) { return p !== q; })) return a;
    }
    return a;
  }

  function prStart(s, o) {
    var size = Math.max(3, Math.min(6, Number(o.size) || 4));
    var n = size * size;
    s.pr = {
      round: uid('r'), photoId: o.photoId, aspect: o.aspect || 1, size: size,
      // tiles[pos] = the piece shown at that square; piece p belongs at square p.
      tiles: derange(n),
      order: s.active.slice(), turn: 0, tm: timer(s.settings.prTurnMs),
      last: null, moves: 0, done: false, started: false
    };
    s.game = 'pictureRush';
    return s.pr;
  }
  function prGo(s) { var g = s.pr; if (!g || g.done) return; g.started = true; tStart(g.tm, s.settings.prTurnMs); }
  function prPlaced(g) { return g.tiles.filter(function (p, i) { return p === i; }).length; }

  /* "Move A1 to B4": right when the tile now at A1 belongs at B4. Then the two tiles swap,
     the moved tile locks in place and earns the team a point. If the tile pushed out of B4
     happens to land on its own square too, it locks as well and earns a bonus point.
     A wrong move changes nothing on the board. Locked tiles can't be moved again. */
  function prMove(s, from, to) {
    var g = s.pr;
    if (!g || g.done) return { error: 'over' };
    var size = g.size;
    if (typeof from === 'string') from = parseCoord(from, size);
    if (typeof to === 'string') to = parseCoord(to, size);
    if (from < 0 || to < 0 || from >= size * size || to >= size * size) return { error: 'coord' };
    if (from === to) return { error: 'same' };
    if (g.tiles[from] === from) return { error: 'locked', pos: from };
    if (g.tiles[to] === to) return { error: 'locked', pos: to };
    var piece = g.tiles[from];
    var tm = turnTeam(s, g);
    var ok = piece === to;
    var bonus = false;
    g.moves++;
    if (ok) {
      var other = g.tiles[to];
      g.tiles[to] = piece;
      g.tiles[from] = other;
      bonus = other === from;
      if (tm) {
        award(s, tm.id, 1, 'pictureRush', coord(from, size) + ' → ' + coord(to, size), 'pr:' + g.round + ':' + piece);
        if (bonus) award(s, tm.id, 1, 'pictureRush', 'Bonus ' + coord(from, size), 'pr:' + g.round + ':' + other);
      }
    }
    g.last = { id: uid('m'), from: from, to: to, ok: ok, bonus: bonus, piece: piece, teamId: tm ? tm.id : null, at: now() };
    if (prPlaced(g) === size * size) {
      g.done = true;
      tStop(g.tm);
    } else if (!(ok && s.settings.prKeepTurn)) {
      nextTurn(g);
      if (g.started) tStart(g.tm, s.settings.prTurnMs);
    } else if (g.started) tStart(g.tm, s.settings.prTurnMs);
    return { ok: ok, bonus: bonus, piece: piece, team: tm };
  }
  function prSkip(s) {
    var g = s.pr;
    if (!g || g.done) return;
    nextTurn(g);
    g.last = { id: uid('m'), skip: true, teamId: null, at: now() };
    if (g.started) tStart(g.tm, s.settings.prTurnMs);
  }
  function prSetTurn(s, teamId) {
    var g = s.pr;
    if (!g) return;
    var i = g.order.indexOf(teamId);
    if (i < 0) { g.order.push(teamId); i = g.order.length - 1; }
    g.turn = i;
    if (g.started && !g.done) tStart(g.tm, s.settings.prTurnMs);
  }
  /* Same photo, fresh shuffle; the points from this round are taken back. */
  function prRestart(s) {
    var g = s.pr;
    if (!g) return;
    var round = g.round;
    dropWhere(s, function (a) { return a.key && a.key.indexOf('pr:' + round + ':') === 0; });
    prStart(s, { photoId: g.photoId, size: g.size, aspect: g.aspect });
  }
  function prRoundPoints(s) {
    var g = s.pr;
    if (!g) return {};
    return totals(s, function (a) { return a.key && a.key.indexOf('pr:' + g.round + ':') === 0; });
  }

  /* ---------- Who Knows Vicky Best? ---------- */
  var QUIZ_DEFAULT = [
    'What is Vicky\'s favourite food?',
    'What is Vicky\'s favourite colour?',
    'In which town or city was Vicky born?',
    'What did Vicky want to be as a child?',
    'What did Vicky study for this graduation?',
    'What was Vicky\'s first job?',
    'Which song does Vicky always sing along to?',
    'What is Vicky\'s favourite drink?',
    'Where is Vicky\'s dream holiday?',
    'What does Vicky say all the time?',
    'Which dish does Vicky cook best?',
    'What is Vicky most scared of?',
    'What is Vicky\'s hidden talent?',
    'Which food will Vicky never eat?',
    'What is Vicky\'s favourite film?',
    'Which TV show does Vicky watch again and again?',
    'What was Vicky\'s favourite subject at school?',
    'What is Vicky\'s idea of a perfect weekend?',
    'What sweet treat can Vicky never say no to?',
    'What is Vicky\'s proudest moment?'
  ];
  function quizFresh() {
    return { mode: 'turns', i: 0, phase: 'ready', revealed: false, order: [], turn: 0, tm: timer(30000), round: uid('q'),
      text: QUIZ_DEFAULT.map(function (q) { return q + ' | ? | ? | ? | ?'; }).join('\n') };
  }
  /* One question per line: "Question | option | *right option | option".
     A line with no options is an open question; "Question | = answer" gives its answer. */
  function parseQuiz(text) {
    var out = [];
    String(text || '').split(/\r?\n/).forEach(function (line) {
      line = line.trim();
      if (!line || line.charAt(0) === '#') return;
      var parts = line.split('|').map(function (x) { return x.trim(); });
      var q = { q: parts.shift(), options: [], answer: -1, answerText: '' };
      parts.forEach(function (p) {
        if (!p) return;
        if (p.charAt(0) === '=') { q.answerText = p.slice(1).trim(); return; }
        if (p.charAt(0) === '*') { q.answer = q.options.length; p = p.slice(1).trim(); }
        q.options.push(p);
      });
      q.options = q.options.slice(0, 6);
      if (q.answer >= q.options.length) q.answer = -1;
      if (q.answer >= 0) q.answerText = q.options[q.answer];
      q.ready = !!q.q && (q.options.length ? q.answer >= 0 && q.options.every(function (o) { return o && o !== '?'; }) : !!q.answerText);
      if (q.q) out.push(q);
    });
    return out;
  }
  function quizQuestions(s) { return parseQuiz(s.quiz.text); }
  function quizStart(s, mode) {
    var z = s.quiz;
    z.mode = mode === 'all' ? 'all' : 'turns';
    z.i = 0; z.phase = 'question'; z.revealed = false; z.round = uid('q');
    z.order = s.active.slice(); z.turn = 0;
    z.tm = timer(s.settings.quizMs);
    s.game = 'quiz';
  }
  function quizGo(s) { tStart(s.quiz.tm, s.settings.quizMs); }
  function quizReveal(s) { var z = s.quiz; z.revealed = true; tPause(z.tm); z.tm.running = false; }
  function quizGoto(s, i) {
    var z = s.quiz, qs = quizQuestions(s);
    if (i >= qs.length) { z.phase = 'done'; tStop(z.tm); return; }
    var forward = i > z.i;
    z.i = Math.max(0, i); z.revealed = false; z.phase = 'question';
    if (forward && z.mode === 'turns') nextTurn(z);
    tStop(z.tm);
  }
  function quizKey(s, qi, teamId) { return 'quiz:' + s.quiz.round + ':' + qi + ':' + teamId; }
  function quizMark(s, teamId, right) {
    var z = s.quiz, key = quizKey(s, z.i, teamId);
    if (right) award(s, teamId, s.settings.quizPoints, 'quiz', 'Question ' + (z.i + 1), key);
    else unaward(s, key);
  }

  /* ---------- Word by Word ---------- */
  function wbwStart(s, opening) {
    s.wbw = { round: uid('w'), opening: opening == null ? 'Dear Vicky,' : opening, words: [], order: s.active.slice(), turn: 0,
      tm: timer(s.settings.wbwTurnMs), done: false, started: false, last: null };
    s.game = 'wbw';
  }
  function wbwGo(s) { var w = s.wbw; if (!w || w.done) return; w.started = true; tStart(w.tm, s.settings.wbwTurnMs); }
  function wbwAdd(s, word) {
    var w = s.wbw;
    word = String(word || '').trim().replace(/\s+/g, ' ');
    if (!w || w.done || !word) return null;
    var tm = turnTeam(s, w);
    var item = { id: uid('w'), w: word, teamId: tm ? tm.id : null };
    w.words.push(item);
    w.last = { id: item.id, kind: 'word', at: now() };
    if (tm && s.settings.wbwPoints) award(s, tm.id, s.settings.wbwPoints, 'wbw', word, 'wbw:' + w.round + ':' + item.id);
    nextTurn(w);
    if (w.started) tStart(w.tm, s.settings.wbwTurnMs);
    return item;
  }
  function wbwUndo(s) {
    var w = s.wbw;
    if (!w || !w.words.length) return;
    var item = w.words.pop();
    unaward(s, 'wbw:' + w.round + ':' + item.id);
    // Hand the turn back to the team that gave that word.
    var i = w.order.indexOf(item.teamId);
    if (i >= 0) w.turn = i;
    w.last = { id: uid('u'), kind: 'undo', at: now() };
    if (w.started && !w.done) tStart(w.tm, s.settings.wbwTurnMs);
  }
  function wbwPass(s) {
    var w = s.wbw;
    if (!w || w.done) return;
    nextTurn(w);
    w.last = { id: uid('p'), kind: 'pass', at: now() };
    if (w.started) tStart(w.tm, s.settings.wbwTurnMs);
  }
  function wbwFinish(s) { var w = s.wbw; if (!w) return; w.done = true; tStop(w.tm); }
  function wbwText(w) {
    if (!w) return '';
    var text = w.words.map(function (x) { return x.w; }).join(' ');
    return (w.opening ? w.opening + ' ' : '') + text;
  }

  /* ---------- Memory Challenge ---------- */
  function shuffle(a, rnd) {
    rnd = rnd || Math.random;
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function memStart(s, pool, count) {
    s.memory = { round: uid('m'), items: shuffle(pool).slice(0, count || 20), phase: 'ready', tm: timer(s.settings.memShowMs) };
    s.game = 'memory';
  }
  function memPhase(s, phase) {
    var m = s.memory;
    if (!m) return;
    m.phase = phase;
    if (phase === 'show') tStart(m.tm, s.settings.memShowMs);
    else if (phase === 'write') tStart(m.tm, s.settings.memWriteMs);
    else tStop(m.tm);
  }
  function memScore(s, teamId, n) {
    var key = 'mem:' + s.memory.round + ':' + teamId;
    n = Math.max(0, Math.round(Number(n) || 0));
    if (n) award(s, teamId, n, 'memory', n + ' remembered', key); else unaward(s, key);
  }
  function memGot(s, teamId) {
    var key = 'mem:' + (s.memory && s.memory.round) + ':' + teamId;
    for (var i = 0; i < s.awards.length; i++) if (s.awards[i].key === key) return s.awards[i].pts;
    return 0;
  }

  /* ---------- the MC's clock: what happens when a timer runs out ---------- */
  function tick(s, at) {
    at = at || now();
    var changed = false;
    var g = s.pr;
    if (g && !g.done && expired(g.tm, at)) {
      g.last = { id: uid('m'), timeout: true, teamId: (turnTeam(s, g) || {}).id || null, at: at };
      nextTurn(g); tStart(g.tm, s.settings.prTurnMs); changed = true;
    }
    var w = s.wbw;
    if (w && !w.done && expired(w.tm, at)) {
      w.last = { id: uid('p'), kind: 'timeout', at: at };
      nextTurn(w); tStart(w.tm, s.settings.wbwTurnMs); changed = true;
    }
    var z = s.quiz;
    if (z && expired(z.tm, at)) { z.tm.running = false; z.tm.left = 0; z.tm.endsAt = null; changed = true; }
    var m = s.memory;
    if (m && expired(m.tm, at)) {
      if (m.phase === 'show') { m.phase = 'hidden'; tStop(m.tm); }
      else { m.tm.running = false; m.tm.left = 0; m.tm.endsAt = null; }
      changed = true;
    }
    return changed;
  }
  /* Pause or resume whichever clock belongs to the game on screen. */
  function currentTimer(s) {
    if (s.game === 'pictureRush' && s.pr) return s.pr.tm;
    if (s.game === 'wbw' && s.wbw) return s.wbw.tm;
    if (s.game === 'quiz') return s.quiz.tm;
    if (s.game === 'memory' && s.memory) return s.memory.tm;
    return null;
  }
  function togglePause(s) {
    var tm = currentTimer(s);
    if (!tm) return;
    if (tm.running) tPause(tm); else tResume(tm);
  }

  FF.OfflineLogic = {
    TEAM_COLORS: TEAM_COLORS, LETTERS: LETTERS,
    fresh: fresh, uid: uid, team: team, activeTeams: activeTeams, addTeam: addTeam, removeTeam: removeTeam, setActive: setActive,
    award: award, unaward: unaward, hasAward: hasAward, totals: totals, standings: standings, turnTeam: turnTeam,
    timeLeft: timeLeft, tStart: tStart, tPause: tPause, tResume: tResume, tStop: tStop, expired: expired,
    coord: coord, parseCoord: parseCoord, parseMove: parseMove, derange: derange,
    prStart: prStart, prGo: prGo, prMove: prMove, prSkip: prSkip, prSetTurn: prSetTurn, prRestart: prRestart, prPlaced: prPlaced, prRoundPoints: prRoundPoints,
    parseQuiz: parseQuiz, quizQuestions: quizQuestions, quizStart: quizStart, quizGo: quizGo, quizReveal: quizReveal, quizGoto: quizGoto, quizKey: quizKey, quizMark: quizMark,
    wbwStart: wbwStart, wbwGo: wbwGo, wbwAdd: wbwAdd, wbwUndo: wbwUndo, wbwPass: wbwPass, wbwFinish: wbwFinish, wbwText: wbwText,
    memStart: memStart, memPhase: memPhase, memScore: memScore, memGot: memGot,
    tick: tick, currentTimer: currentTimer, togglePause: togglePause
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = FF.OfflineLogic;
})(typeof window !== 'undefined' ? window : globalThis);
