/* ============================================================
   FAMILY FUN — scoring.js
   Reusable scoring engine (players or teams), streaks,
   leaderboard, final results, session stats and achievements.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  FF.Scoring = {
    _entities: [],
    _records: {},       // id -> record
    mode: 'players',    // 'players' | 'teams'

    init: function (entities, mode) {
      this._entities = entities || [];
      this.mode = mode || 'players';
      this._records = {};
      const self = this;
      this._entities.forEach(function (e) {
        self._records[e.id] = {
          id: e.id, name: e.name, avatar: e.avatar || '😀', color: e.color || '#8b5cf6',
          points: 0, correct: 0, wrong: 0, answers: 0,
          streak: 0, bestStreak: 0, fastest: null, roundPoints: 0, events: []
        };
      });
    },

    record: function (id) { return this._records[id]; },

    add: function (id, points, meta) {
      const r = this._records[id];
      if (!r) return 0;
      points = Math.round(points || 0);
      r.points += points;
      r.roundPoints += points;
      if (meta) {
        if (meta.correct) r.correct++;
        if (meta.wrong) r.wrong++;
        if (meta.fastest != null) r.fastest = r.fastest == null ? meta.fastest : Math.min(r.fastest, meta.fastest);
      }
      if (points > 0 && meta && meta.correct) this._bumpStreak(id);
      return r.points;
    },

    subtract: function (id, points) {
      const r = this._records[id];
      if (!r) return 0;
      r.points = Math.max(0, r.points - Math.round(points || 0));
      return r.points;
    },

    _bumpStreak: function (id) {
      const r = this._records[id];
      if (!r) return;
      r.streak++;
      if (r.streak > r.bestStreak) r.bestStreak = r.streak;
    },

    resetStreak: function (id) {
      const r = this._records[id];
      if (r) r.streak = 0;
    },

    markAnswer: function (id, correct, timeMs) {
      const r = this._records[id];
      if (!r) return;
      r.answers++;
      if (correct) {
        r.correct++;
        this._bumpStreak(id);
      } else {
        r.wrong++;
        r.streak = 0;
      }
      if (timeMs != null) {
        r.fastest = r.fastest == null ? timeMs : Math.min(r.fastest, timeMs);
      }
    },

    get: function (id) { return this._records[id] ? this._records[id].points : 0; },

    set: function (id, points) {
      const r = this._records[id];
      if (r) { r.points = Math.max(0, points); r.roundPoints = 0; }
    },

    leaderboard: function () {
      return this._entities.slice().sort(function (a, b) {
        const ra = FF.Scoring._records[a.id]; const rb = FF.Scoring._records[b.id];
        return (rb ? rb.points : 0) - (ra ? ra.points : 0);
      });
    },

    ranked: function () {
      return this.leaderboard().map(function (e) {
        const r = FF.Scoring._records[e.id];
        return { id: e.id, name: e.name, avatar: e.avatar, color: e.color, points: r.points, correct: r.correct, wrong: r.wrong, bestStreak: r.bestStreak, fastest: r.fastest, answers: r.answers };
      });
    },

    // Round-level deltas (since last resetRound)
    resetRound: function () {
      for (const id in this._records) this._records[id].roundPoints = 0;
    },
    roundDeltas: function () {
      return this._entities.slice().sort(function (a, b) {
        return FF.Scoring._records[b.id].roundPoints - FF.Scoring._records[a.id].roundPoints;
      }).map(function (e) { return { id: e.id, name: e.name, avatar: e.avatar, color: e.color, points: FF.Scoring._records[e.id].roundPoints }; });
    },

    winner: function () {
      const lb = this.leaderboard();
      return lb.length ? lb[0] : null;
    },

    results: function () {
      const ranked = this.ranked();
      const winner = ranked.length ? ranked[0] : null;
      return { winner: winner, winnerId: winner ? winner.id : null, results: ranked, mode: this.mode };
    }
  };

  /* ---------- Session / lifetime stats + achievements ---------- */
  FF.Stats = {
    ACHIEVEMENTS: [
      { id: 'firstWin', icon: '🏆', name: 'First Win', desc: 'Win your first game.' },
      { id: 'streak5', icon: '🔥', name: '5 Answer Streak', desc: 'Get 5 correct answers in a row.' },
      { id: 'streak10', icon: '🔥', name: '10 Answer Streak', desc: 'Get 10 correct answers in a row.' },
      { id: 'fastest', icon: '⚡', name: 'Fastest Finger', desc: 'Answer in under 1 second.' },
      { id: 'wordMaster', icon: '🔤', name: 'Word Master', desc: 'Find 15 words in a word game.' },
      { id: 'brainBox', icon: '🧠', name: 'Brain Box', desc: 'Get 10 quiz answers right in one game.' },
      { id: 'explorer', icon: '🌍', name: 'World Explorer', desc: 'Identify 10 countries, flags or landmarks.' },
      { id: 'creative', icon: '🎨', name: 'Creative Genius', desc: 'Complete a drawing challenge.' },
      { id: 'perfect', icon: '🎯', name: 'Perfect Round', desc: 'Finish a round with zero mistakes.' },
      { id: 'champion', icon: '👑', name: 'Game Night Champion', desc: 'Win a full Game Night.' },
      { id: 'tenGames', icon: '🎮', name: 'Game Collector', desc: 'Play 10 games.' }
    ],

    defaultStats: function () {
      return {
        gamesPlayed: 0,
        wins: {},           // player name -> wins
        totalPoints: 0,
        bestStreak: 0,
        fastest: null,
        mostWords: 0,
        quizCorrect: 0,
        quizAnswered: 0,
        achievements: []
      };
    },

    get: function () {
      const s = FF.Storage.get('stats', null);
      if (s && typeof s === 'object' && s.gamesPlayed != null) return s;
      return this.defaultStats();
    },

    save: function (s) { FF.Storage.set('stats', s); },

    unlock: function (id) {
      const s = this.get();
      if (s.achievements.indexOf(id) === -1) {
        s.achievements.push(id);
        this.save(s);
        return true;
      }
      return false;
    },

    isUnlocked: function (id) { return this.get().achievements.indexOf(id) !== -1; },

    recordGamePlayed: function (gameId, gameName) {
      const s = this.get();
      s.gamesPlayed++;
      if (s.gamesPlayed >= 10) this.unlock('tenGames');
      if (gameName) {
        s.recent = s.recent || [];
        s.recent.unshift({ id: gameId, name: gameName, at: Date.now() });
        s.recent = s.recent.slice(0, 12);
        FF.Recents.save(s.recent);
      }
      this.save(s);
    },

    recordResult: function (data) {
      const s = this.get();
      if (data.winnerName) {
        s.wins[data.winnerName] = (s.wins[data.winnerName] || 0) + 1;
        if (Object.keys(s.wins).length >= 1 && (s.wins[data.winnerName] || 0) === 1) this.unlock('firstWin');
      }
      if (data.bestStreak) s.bestStreak = Math.max(s.bestStreak, data.bestStreak);
      if (data.fastest != null) s.fastest = s.fastest == null ? data.fastest : Math.min(s.fastest, data.fastest);
      if (data.mostWords) s.mostWords = Math.max(s.mostWords, data.mostWords);
      if (data.quizCorrect != null) s.quizCorrect += data.quizCorrect;
      if (data.quizAnswered != null) s.quizAnswered += data.quizAnswered;
      this.save(s);
    }
  };

  /* ---------- Recently played ---------- */
  FF.Recents = {
    get: function () { return FF.Storage.get('recents', []); },
    save: function (list) { FF.Storage.set('recents', list); },
    add: function (gameId, name) {
      const list = this.get();
      list.unshift({ id: gameId, name: name, at: Date.now() });
      while (list.length > 12) list.pop();
      this.save(list);
      return list;
    },
    clear: function () { FF.Storage.set('recents', []); }
  };

  /* ---------- Favorites ---------- */
  FF.Favorites = {
    get: function () { return FF.Storage.get('favorites', []); },
    toggle: function (gameId) {
      const list = this.get();
      const i = list.indexOf(gameId);
      if (i === -1) list.push(gameId); else list.splice(i, 1);
      FF.Storage.set('favorites', list);
      return list;
    },
    has: function (gameId) { return this.get().indexOf(gameId) !== -1; },
    clear: function () { FF.Storage.set('favorites', []); }
  };
})();
