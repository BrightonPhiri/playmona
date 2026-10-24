/* ============================================================
   PLAYMONA — watch/view.js
   Watching (phase 3). Turns a room's broadcast (js/net/broadcast.js)
   into what the TV view draws. Pure: no DOM, no network.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  // A broadcast this old means the host's phone stopped publishing.
  var STALE_MS = 45000;

  function t(key, fallback, vars) {
    if (FF.t) return FF.t(key, fallback, vars);
    var s = fallback;
    Object.keys(vars || {}).forEach(function (k) { s = s.split('{' + k + '}').join(vars[k]); });
    return s;
  }

  function teamName(id) {
    var m = /^team(\d+)$/.exec(String(id || ''));
    return m ? t('teamN', 'Team {n}', { n: m[1] }) : String(id || t('team', 'Team'));
  }

  function byScore(a, b) {
    return (b.score - a.score) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  }

  // Places with ties sharing a place: 1, 2, 2, 4.
  function rank(list) {
    var place = 0;
    var last = null;
    list.forEach(function (p, i) {
      if (last === null || p.score !== last) { place = i + 1; last = p.score; }
      p.rank = place;
    });
    return list;
  }

  function players(b) {
    var all = b.players || {};
    return Object.keys(all).map(function (id) {
      var p = all[id] || {};
      return {
        id: id,
        name: String(p.name || 'Player'),
        avatar: p.avatar || null,
        score: Number(p.score) || 0,
        answered: !!p.answered,
        correct: p.correct === true ? true : (p.correct === false ? false : null),
        talking: !!p.talking,
        teamId: p.teamId || null
      };
    });
  }

  function teams(list) {
    var byId = {};
    var order = [];
    list.forEach(function (p) {
      var id = p.teamId || 'team1';
      if (!byId[id]) {
        byId[id] = { id: id, name: teamName(id), avatar: p.avatar, score: 0, answered: true, correct: null, talking: false, members: [] };
        order.push(id);
      }
      var tm = byId[id];
      tm.score += p.score;
      tm.answered = tm.answered && p.answered;
      tm.talking = tm.talking || p.talking;
      if (p.correct === true) tm.correct = true;
      else if (p.correct === false && tm.correct !== true) tm.correct = false;
      tm.members.push(p);
    });
    return order.map(function (id) { return byId[id]; });
  }

  function model(b, now) {
    now = now || Date.now();
    var empty = {
      state: 'ended', roomName: '', gameName: '', roundText: '', countdownMs: 0,
      screen: null, answer: null, timerMs: null, opensAt: null, leaderboard: [], podium: [], players: []
    };
    if (!b || typeof b !== 'object') return empty;
    if (typeof b.updatedAt !== 'number' || now - b.updatedAt > STALE_MS) {
      empty.roomName = String(b.name || '');
      return empty;
    }

    var people = players(b);
    var board = rank((b.mode === 'teams' ? teams(people) : people).slice().sort(byScore));
    var round = b.round || null;
    var state;
    if (b.status === 'ended') state = 'podium';
    else if (b.status !== 'playing') state = 'lobby';
    else if (b.startAt && now < b.startAt) state = 'countdown';
    else if (round && round.answer != null) state = 'reveal';
    else state = 'question';

    var roundText = '';
    if (round && typeof round.n === 'number') {
      roundText = round.total
        ? t('questionOf', 'Question {n} of {total}', { n: round.n + 1, total: round.total })
        : t('questionN', 'Question {n}', { n: round.n + 1 });
    }

    var podium = [];
    if (state === 'podium') {
      var source = (b.mode !== 'teams' && Array.isArray(b.results) && b.results.length)
        ? b.results.map(function (r) { return { id: r.id, name: String(r.name || 'Player'), avatar: r.avatar || null, score: Number(r.score) || 0 }; }).sort(byScore)
        : board;
      podium = source.slice(0, 3).map(function (p, i) { return { id: p.id, name: p.name, avatar: p.avatar, score: p.score, place: i + 1 }; });
    }

    return {
      state: state,
      roomName: String(b.name || ''),
      gameName: b.game && b.game.name ? String(b.game.name) : '',
      roundText: roundText,
      countdownMs: state === 'countdown' ? Math.max(0, b.startAt - now) : 0,
      screen: round && round.screen ? round.screen : null,
      answer: round && round.answer != null ? round.answer : null,
      timerMs: round && round.timerMs ? round.timerMs : null,
      opensAt: round && round.opensAt ? round.opensAt : null,
      leaderboard: board,
      podium: podium,
      players: people
    };
  }

  FF.WatchView = { STALE_MS: STALE_MS, model: model };
})();
