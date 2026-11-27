/* ============================================================
   PLAYMONA — missiontrail/progress.js
   The player's Mission Trail progress, kept in the account key
   'missionTrail' (saved on the device at once and synced to the account
   by FF.Sync, which merges two copies with merge() below):

     { v: 1, highest: 2, last: '<attempt id>',
       stages: { '1': { stars, best, bestMs, done, plays } } }

   A replay only ever raises stars and best and lowers bestMs. A failed
   attempt counts as a play and unlocks nothing. One attempt id saves once.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';
  FF.MissionTrail = FF.MissionTrail || {};

  var KEY = 'missionTrail';

  function empty() { return { v: 1, stages: {}, highest: 1 }; }

  function num(n, d) { return typeof n === 'number' && isFinite(n) ? n : d; }

  function cleanStage(s) {
    s = s && typeof s === 'object' ? s : {};
    return {
      stars: Math.max(0, Math.min(3, num(s.stars, 0) | 0)),
      best: Math.max(0, Math.min(100, num(s.best, 0))),
      bestMs: typeof s.bestMs === 'number' && isFinite(s.bestMs) ? s.bestMs : null,
      done: !!s.done,
      plays: Math.max(0, num(s.plays, 0) | 0)
    };
  }

  /* Any stored value as a valid progress object. */
  function clean(p) {
    if (!p || typeof p !== 'object' || !p.stages || typeof p.stages !== 'object') return empty();
    var out = { v: 1, stages: {}, highest: Math.max(1, num(p.highest, 1) | 0) };
    Object.keys(p.stages).forEach(function (id) {
      if (/^\d+$/.test(id)) out.stages[id] = cleanStage(p.stages[id]);
    });
    if (typeof p.last === 'string') out.last = p.last;
    return out;
  }

  function minMs(a, b) {
    if (a === null) return b;
    if (b === null) return a;
    return Math.min(a, b);
  }

  function record(prog, stageId, result, attemptId) {
    var p = clean(prog);
    if (attemptId && p.last === attemptId) return p;
    var id = String(stageId);
    var s = p.stages[id] || cleanStage(null);
    s.plays += 1;
    if (result && result.done) {
      s.done = true;
      s.stars = Math.max(s.stars, result.stars | 0);
      s.best = Math.max(s.best, num(result.score, 0));
      s.bestMs = minMs(s.bestMs, num(result.ms, null));
      p.highest = Math.max(p.highest, (stageId | 0) + 1);
    }
    p.stages[id] = s;
    if (attemptId) p.last = attemptId;
    return p;
  }

  function merge(a, b) {
    var x = clean(a);
    var y = clean(b);
    var out = { v: 1, stages: {}, highest: Math.max(x.highest, y.highest) };
    var ids = Object.keys(x.stages).concat(Object.keys(y.stages));
    ids.forEach(function (id) {
      if (out.stages[id]) return;
      var s = x.stages[id];
      var t = y.stages[id];
      if (!s || !t) { out.stages[id] = cleanStage(s || t); return; }
      out.stages[id] = {
        stars: Math.max(s.stars, t.stars),
        best: Math.max(s.best, t.best),
        bestMs: minMs(s.bestMs, t.bestMs),
        done: s.done || t.done,
        plays: Math.max(s.plays, t.plays)
      };
    });
    if (x.last) out.last = x.last;
    return out;
  }

  function totals(prog) {
    var p = clean(prog);
    var stars = 0;
    var completed = 0;
    Object.keys(p.stages).forEach(function (id) {
      var s = p.stages[id];
      if (s.done) { completed += 1; stars += s.stars; }
    });
    return { stars: stars, completed: completed };
  }

  function state(prog, stageId) {
    var p = clean(prog);
    var s = p.stages[String(stageId)];
    if (s && s.done) return 'done';
    if (stageId === 1 || stageId <= p.highest) return 'open';
    return 'locked';
  }

  /* Where "Continue playing" goes: the first open stage not yet done, else the last one reached. */
  function next(prog, stageIds) {
    var ids = stageIds || [];
    for (var i = 0; i < ids.length; i++) if (state(prog, ids[i]) === 'open') return ids[i];
    for (var j = ids.length - 1; j >= 0; j--) if (state(prog, ids[j]) !== 'locked') return ids[j];
    return ids[0];
  }

  function load() {
    return clean(FF.Storage ? FF.Storage.get(KEY, null) : null);
  }

  function save(prog) {
    if (FF.Storage) FF.Storage.set(KEY, clean(prog));
  }

  FF.MissionTrail.Progress = {
    KEY: KEY,
    empty: empty,
    clean: clean,
    record: record,
    merge: merge,
    totals: totals,
    state: state,
    next: next,
    load: load,
    save: save
  };
})();
