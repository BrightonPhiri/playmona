/* ============================================================
   FAMILY FUN — players.js
   Player and team management (up to 8 players, 2-4 teams).
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  FF.Players = {
    AVATARS: ['😀', '😎', '🤓', '🥳', '🦊', '🐼', '🦁', '🐸', '🦄', '🐯', '🐨', '🦉', '🐙', '🦖', '🐳', '🐵', '🤠', '👽', '🤖', '👸', '🧙', '🐶'],
    COLORS: ['#8b5cf6', '#3b82f6', '#10b981', '#f97316', '#ec4899', '#eab308', '#ef4444', '#22d3ee'],
    MAX: 8,

    get: function () {
      const list = FF.Storage.get('players', null);
      if (list && Array.isArray(list)) return list;
      return this.defaultPlayers();
    },

    defaultPlayers: function () {
      return [
        { id: 'p1', name: 'Player 1', avatar: '😀', color: '#8b5cf6' },
        { id: 'p2', name: 'Player 2', avatar: '😎', color: '#3b82f6' }
      ];
    },

    save: function (list) { FF.Storage.set('players', list); },

    add: function (name, avatar, color) {
      const list = this.get();
      if (list.length >= this.MAX) return list;
      list.push({
        id: FF.util.uid(),
        name: name || ('Player ' + (list.length + 1)),
        avatar: avatar || FF.util.pick(this.AVATARS),
        color: color || this.COLORS[list.length % this.COLORS.length]
      });
      this.save(list);
      return list;
    },

    remove: function (id) {
      const list = this.get().filter(function (p) { return p.id !== id; });
      this.save(list);
      return list;
    },

    update: function (id, patch) {
      const list = this.get();
      list.forEach(function (p) { if (p.id === id) Object.assign(p, patch); });
      this.save(list);
      return list;
    },

    rename: function (id, name) { return this.update(id, { name: name }); },
    setAvatar: function (id, avatar) { return this.update(id, { avatar: avatar }); },
    setColor: function (id, color) { return this.update(id, { color: color }); },

    reorder: function (orderedIds) {
      const map = {};
      this.get().forEach(function (p) { map[p.id] = p; });
      const list = orderedIds.map(function (id) { return map[id]; }).filter(Boolean);
      this.save(list);
      return list;
    },

    reset: function () { FF.Storage.remove('players'); },

    byId: function (id) {
      return this.get().find(function (p) { return p.id === id; }) || null;
    },

    // Scoring entities for solo/individual play
    entities: function () { return this.get(); }
  };

  FF.Teams = {
    COLORS: ['#ef4444', '#3b82f6', '#10b981', '#eab308'],
    NAMES: ['Team A', 'Team B', 'Team C', 'Team D'],

    get: function () {
      const t = FF.Storage.get('teams', null);
      if (t && t.teams) return t;
      return { enabled: false, count: 2, teams: this.build(2) };
    },

    build: function (count) {
      count = FF.util.clamp(count, 2, 4);
      const teams = [];
      for (let i = 0; i < count; i++) {
        teams.push({ id: 'team' + (i + 1), name: this.NAMES[i], color: this.COLORS[i], playerIds: [] });
      }
      return teams;
    },

    save: function (t) { FF.Storage.set('teams', t); },

    setEnabled: function (on) {
      const t = this.get();
      t.enabled = !!on;
      if (on) this.autoAssign(t);
      this.save(t);
      return t;
    },

    setCount: function (count) {
      const t = this.get();
      t.count = FF.util.clamp(count, 2, 4);
      t.teams = this.build(t.count);
      if (t.enabled) this.autoAssign(t);
      this.save(t);
      return t;
    },

    rename: function (teamId, name) {
      const t = this.get();
      t.teams.forEach(function (tm) { if (tm.id === teamId) tm.name = name; });
      this.save(t);
      return t;
    },

    assign: function (teamId, playerId) {
      const t = this.get();
      // remove player from any team first
      t.teams.forEach(function (tm) {
        tm.playerIds = tm.playerIds.filter(function (id) { return id !== playerId; });
      });
      t.teams.forEach(function (tm) { if (tm.id === teamId) tm.playerIds.push(playerId); });
      this.save(t);
      return t;
    },

    unassign: function (playerId) {
      const t = this.get();
      t.teams.forEach(function (tm) {
        tm.playerIds = tm.playerIds.filter(function (id) { return id !== playerId; });
      });
      this.save(t);
      return t;
    },

    autoAssign: function (t) {
      const players = FF.Players.get();
      t.teams.forEach(function (tm) { tm.playerIds = []; });
      players.forEach(function (p, i) {
        t.teams[i % t.teams.length].playerIds.push(p.id);
      });
    },

    teamOf: function (playerId) {
      const t = this.get();
      for (const tm of t.teams) if (tm.playerIds.indexOf(playerId) !== -1) return tm;
      return null;
    },

    // Scoring entities for team play
    entities: function () {
      return this.get().teams.map(function (tm) {
        return { id: tm.id, name: tm.name, avatar: '👥', color: tm.color, players: tm.playerIds };
      });
    },

    enabled: function () { return this.get().enabled; }
  };
})();
