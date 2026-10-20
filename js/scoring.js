/* ============================================================
   PLAYMORA — scoring.js
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
          id: e.id, name: e.name, avatar: e.avatar || null, photo: e.photo || null, isTeam: !!e.isTeam, color: e.color || '#8b5cf6',
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
        return { id: e.id, name: e.name, avatar: e.avatar, photo: e.photo || r.photo, color: e.color, points: r.points, correct: r.correct, wrong: r.wrong, bestStreak: r.bestStreak, fastest: r.fastest, answers: r.answers };
      });
    },

    // Round-level deltas (since last resetRound)
    resetRound: function () {
      for (const id in this._records) this._records[id].roundPoints = 0;
    },
    roundDeltas: function () {
      return this._entities.slice().sort(function (a, b) {
        return FF.Scoring._records[b.id].roundPoints - FF.Scoring._records[a.id].roundPoints;
      }).map(function (e) { return { id: e.id, name: e.name, avatar: e.avatar, photo: e.photo, color: e.color, points: FF.Scoring._records[e.id].roundPoints }; });
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
      // iconKey: an FF.Icons name; color: the medal colour.
      { id: 'firstWin', iconKey: 'trophy', color: '#f59e0b', name: 'First Win', desc: 'Win your first game.' },
      { id: 'streak5', iconKey: 'flame', color: '#f97316', name: '5 Answer Streak', desc: 'Get 5 correct answers in a row.' },
      { id: 'streak10', iconKey: 'flame', color: '#ef4444', name: '10 Answer Streak', desc: 'Get 10 correct answers in a row.' },
      { id: 'fastest', iconKey: 'lightning', color: '#eab308', name: 'Fastest Finger', desc: 'Answer in under 1 second.' },
      { id: 'wordMaster', iconKey: 'text-aa', color: '#8b5cf6', name: 'Word Master', desc: 'Find 15 words in a word game.' },
      { id: 'brainBox', iconKey: 'brain', color: '#3b82f6', name: 'Brain Box', desc: 'Get 10 quiz answers right in one game.' },
      { id: 'explorer', iconKey: 'globe-hemisphere-west', color: '#14b8a6', name: 'World Explorer', desc: 'Identify 10 countries, flags or landmarks.' },
      { id: 'creative', iconKey: 'paint-brush', color: '#ec4899', name: 'Creative Genius', desc: 'Complete a drawing challenge.' },
      { id: 'perfect', iconKey: 'target', color: '#10b981', name: 'Perfect Round', desc: 'Finish a round with zero mistakes.' },
      { id: 'champion', iconKey: 'crown', color: '#f59e0b', name: 'Game Night Champion', desc: 'Win a full Game Night.' },
      { id: 'tenGames', iconKey: 'game-controller', color: '#1e7bff', name: 'Game Collector', desc: 'Play 10 games.' }
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
        achievements: [],
        daily: {},          // 'YYYY-MM-DD' -> games played that day
        byCategory: {},     // category id -> games played
        myWins: 0,          // games the account owner won against others
        xp: 0
      };
    },

    dayKey: function (d) {
      d = d || new Date();
      return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    },

    // Games played on each of the last n days, oldest first.
    lastDays: function (n) {
      var s = this.get();
      var out = [];
      for (var i = n - 1; i >= 0; i--) {
        var d = new Date();
        d.setHours(12, 0, 0, 0);
        d.setDate(d.getDate() - i);
        out.push({ date: d, key: this.dayKey(d), count: (s.daily && s.daily[this.dayKey(d)]) || 0 });
      }
      return out;
    },

    // Consecutive days with at least one game, ending today (or yesterday).
    dayStreak: function () {
      var s = this.get();
      var daily = s.daily || {};
      var streak = 0;
      var d = new Date();
      if (!daily[this.dayKey(d)]) d.setDate(d.getDate() - 1);
      while (daily[this.dayKey(d)]) { streak++; d.setDate(d.getDate() - 1); }
      return streak;
    },

    // Level from XP: each level needs 50 XP more than the one before.
    level: function (xp) {
      xp = Math.max(0, xp || 0);
      var level = 1;
      var need = 100;
      while (xp >= need) { xp -= need; level++; need = 100 + 50 * (level - 1); }
      return { level: level, into: xp, need: need, progress: need ? xp / need : 0 };
    },

    get: function () {
      const s = FF.Storage.get('stats', null);
      if (s && typeof s === 'object' && s.gamesPlayed != null) {
        // Fill in fields added after this player's stats were first saved.
        const d = this.defaultStats();
        Object.keys(d).forEach(function (k) { if (s[k] == null) s[k] = d[k]; });
        return s;
      }
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

    recordGamePlayed: function (gameId, gameName, category) {
      const s = this.get();
      s.gamesPlayed++;
      const today = this.dayKey();
      s.daily[today] = (s.daily[today] || 0) + 1;
      // Keep about two months of daily history.
      const keys = Object.keys(s.daily).sort();
      while (keys.length > 62) delete s.daily[keys.shift()];
      if (category) s.byCategory[category] = (s.byCategory[category] || 0) + 1;
      s.xp = (s.xp || 0) + 10;
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
      // The account owner's own result: wins against others and XP.
      const ranked = data.results || [];
      const meId = data.meId || 'me';
      const me = ranked.filter(function (r) { return r && r.id === meId; })[0];
      if (me) {
        s.xp = (s.xp || 0) + Math.min(100, Math.floor((me.points || 0) / 50));
        const top = ranked[0];
        const tie = ranked.length > 1 && ranked[1].points === top.points;
        if (ranked.length > 1 && top.id === meId && top.points > 0 && !tie) {
          s.myWins = (s.myWins || 0) + 1;
          s.xp += 25;
        }
      }
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
