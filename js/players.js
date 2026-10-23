/* ============================================================
   PLAYMONA — players.js
   Saved players and teams.

   The roster is saved once and kept: each player has an `active`
   flag for "playing in the next game". Choosing to play solo just
   switches the others off, so nobody has to be deleted and added
   again later. The signed-in account is always in the roster as
   the "me" player (it mirrors the profile's name and avatar).

   FF.Players.get()  -> the players in the next game (active)
   FF.Players.all()  -> everyone saved
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var ME = 'me';

  function cleanName(name, fallback) {
    name = String(name == null ? '' : name).replace(/\s+/g, ' ').trim().slice(0, 24);
    return name || fallback;
  }

  FF.Players = {
    ME: ME,
    COLORS: ['#8b5cf6', '#3b82f6', '#10b981', '#f97316', '#ec4899', '#eab308', '#ef4444', '#22d3ee'],
    COLOR_NAMES: ['Purple', 'Blue', 'Green', 'Orange', 'Pink', 'Yellow', 'Red', 'Sky blue'],
    MIN: 1,
    MAX: 8,          // players in one game
    MAX_SAVED: 24,   // players kept in the roster

    _temp: null,     // temporary players (demo mode); never saved

    /* ---------- Reading ---------- */
    all: function () {
      var list = FF.Storage.get('players', null);
      if (!list || !Array.isArray(list) || !list.length) list = this.defaultPlayers();
      return list.map(function (p, i) {
        var out = Object.assign({}, p);
        if (out.active == null) out.active = true;   // rosters saved before this flag
        out.avatar = FF.Avatars ? FF.Avatars.normalize(out.avatar, out.id || out.name) : out.avatar;
        if (!out.color) out.color = FF.Players.COLORS[i % FF.Players.COLORS.length];
        return out;
      });
    },

    // The players taking part in the next game.
    get: function () {
      if (this._temp) return this._temp.slice();
      var all = this.all();
      var active = all.filter(function (p) { return p.active; });
      if (!active.length && all.length) { active = [all[0]]; }
      return active.slice(0, this.MAX);
    },

    entities: function () { return this.get(); },

    byId: function (id) {
      var src = this._temp || this.all();
      return src.filter(function (p) { return p.id === id; })[0] || null;
    },

    me: function () { return this.all().filter(function (p) { return p.isMe; })[0] || null; },

    defaultPlayers: function () {
      var profile = FF.Auth && FF.Auth.profile ? FF.Auth.profile() : null;
      return [{
        id: ME,
        isMe: true,
        name: profile ? profile.displayName : 'Player 1',
        avatar: profile ? profile.avatar : (FF.Avatars ? FF.Avatars.normalize(null, 'me') : ''),
        color: this.COLORS[0],
        active: true
      }];
    },

    /* ---------- Writing ---------- */
    // Save the whole roster (callers pass all(), never get()).
    save: function (list) {
      FF.Storage.set('players', (list || []).slice(0, this.MAX_SAVED));
    },

    add: function (name, avatar, color) {
      var list = this.all();
      if (list.length >= this.MAX_SAVED) return list;
      var used = list.map(function (p) { return p.avatar; });
      var activeCount = list.filter(function (p) { return p.active; }).length;
      list.push({
        id: FF.util.uid(),
        name: cleanName(name, 'Player ' + (list.length + 1)),
        avatar: avatar || (FF.Avatars ? FF.Avatars.random(used) : ''),
        color: color || this.COLORS[list.length % this.COLORS.length],
        active: activeCount < this.MAX
      });
      this.save(list);
      return list;
    },

    // Remove someone from the saved roster for good (never the account owner).
    remove: function (id) {
      var list = this.all();
      var target = list.filter(function (p) { return p.id === id; })[0];
      if (!target || target.isMe) return list;
      list = list.filter(function (p) { return p.id !== id; });
      if (!list.some(function (p) { return p.active; }) && list.length) list[0].active = true;
      this.save(list);
      return list;
    },

    // In or out of the next game. At least one player always stays in.
    setActive: function (id, on) {
      var list = this.all();
      var activeCount = list.filter(function (p) { return p.active; }).length;
      list.forEach(function (p) {
        if (p.id !== id) return;
        if (on && !p.active && activeCount >= FF.Players.MAX) return;
        if (!on && p.active && activeCount <= 1) return;
        p.active = !!on;
      });
      this.save(list);
      return list;
    },

    isActive: function (id) {
      var p = this.all().filter(function (x) { return x.id === id; })[0];
      return !!(p && p.active);
    },

    // Play with just this one person; everyone else stays saved.
    only: function (id) {
      var list = this.all();
      if (!list.some(function (p) { return p.id === id; })) return list;
      list.forEach(function (p) { p.active = p.id === id; });
      this.save(list);
      return list;
    },

    /* A game needs n players: switch on saved players first, then add new
       ones. Extra players are switched off, never deleted. */
    ensureCount: function (n) {
      n = FF.util.clamp(n, this.MIN, this.MAX);
      var list = this.all();
      var active = list.filter(function (p) { return p.active; });
      list.forEach(function (p) {
        if (active.length < n && !p.active) { p.active = true; active.push(p); }
      });
      this.save(list);
      while (this.get().length < n && this.all().length < this.MAX_SAVED) this.add();
      list = this.all();
      var count = 0;
      list.forEach(function (p) {
        if (!p.active) return;
        count++;
        if (count > n && !p.isMe) p.active = false;
      });
      this.save(list);
      return this.get();
    },

    update: function (id, patch) {
      var list = this.all();
      list.forEach(function (p) { if (p.id === id) Object.assign(p, patch); });
      this.save(list);
      if (id === ME && FF.Auth && FF.Auth.updateProfile && (patch.name || patch.avatar)) {
        var up = {};
        if (patch.name) up.displayName = patch.name;
        if (patch.avatar) up.avatar = patch.avatar;
        FF.Auth.updateProfile(up, { fromRoster: true });
      }
      return list;
    },

    rename: function (id, name) { return this.update(id, { name: cleanName(name, 'Player') }); },
    setAvatar: function (id, avatar) { return this.update(id, { avatar: avatar, photo: null }); },
    setColor: function (id, color) { return this.update(id, { color: color }); },
    setPhoto: function (id, photo) { return this.update(id, { photo: photo || null }); },

    reorder: function (orderedIds) {
      var map = {};
      this.all().forEach(function (p) { map[p.id] = p; });
      var list = orderedIds.map(function (id) { return map[id]; }).filter(Boolean);
      this.save(list);
      return list;
    },

    move: function (id, delta) {
      var list = this.all();
      var i = list.map(function (p) { return p.id; }).indexOf(id);
      var j = i + delta;
      if (i < 0 || j < 0 || j >= list.length) return list;
      var t = list[i]; list[i] = list[j]; list[j] = t;
      this.save(list);
      return list;
    },

    // Keep the "me" player in step with the account profile.
    syncMe: function (profile) {
      if (!profile) return;
      var list = FF.Storage.get('players', null);
      list = Array.isArray(list) && list.length ? this.all() : [];
      var me = list.filter(function (p) { return p.isMe; })[0];
      if (!me) {
        me = { id: ME, isMe: true, color: this.COLORS[0], active: true };
        list.unshift(me);
      }
      me.name = cleanName(profile.displayName, 'Me');
      me.avatar = profile.avatar || me.avatar;
      if (profile.photo !== undefined) me.photo = profile.photo || me.photo || null;
      FF.Storage.set('players', list);
    },

    // Forget everyone except the account owner.
    reset: function () {
      var me = this.me();
      FF.Storage.set('players', me ? [Object.assign(me, { active: true })] : this.defaultPlayers());
    },

    /* ---------- Temporary players (demo mode) ---------- */
    useTemporary: function (list) { this._temp = (list || []).slice(0, this.MAX); },
    clearTemporary: function () { this._temp = null; },
    isTemporary: function () { return !!this._temp; },

    /* ---------- Rendering ---------- */
    // A picture for a player or team: uploaded photo, character avatar,
    // or (teams without one) a coloured team badge.
    avatarEl: function (entity, cls) {
      cls = cls || 'ff-avatar';
      var name = (entity && entity.name) || 'Player';
      if (entity && entity.photo) {
        return FF.ui.el('img', { class: cls + ' ff-avatar--photo avatar-img', src: entity.photo, alt: '' });
      }
      if (entity && (entity.isTeam || entity.avatar === '👥') && !(FF.Avatars && FF.Avatars.has(entity.avatar))) {
        var badge = FF.ui.el('span', { class: cls + ' team-badge', style: { '--team-color': entity.color || '#8b5cf6' }, 'aria-hidden': 'true' });
        badge.appendChild(FF.Icons.icon('users'));
        return badge;
      }
      if (FF.Avatars && FF.Avatars.all().length) {
        return FF.Avatars.img(FF.Avatars.normalize(entity && entity.avatar, (entity && (entity.id || entity.name)) || name), cls);
      }
      return FF.ui.el('span', { class: cls + ' ff-avatar--initial', 'aria-hidden': 'true' }, name.charAt(0).toUpperCase());
    },

    readPhotoFile: function (file, done) {
      if (!file || !file.type || file.type.indexOf('image/') !== 0) {
        if (done) done(null);
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          var size = 160;
          var canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          var ctx = canvas.getContext('2d');
          var side = Math.min(img.width, img.height);
          var sx = (img.width - side) / 2;
          var sy = (img.height - side) / 2;
          ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
          try {
            done(canvas.toDataURL('image/jpeg', 0.72));
          } catch (e) {
            done(null);
          }
        };
        img.onerror = function () { if (done) done(null); };
        img.src = reader.result;
      };
      reader.onerror = function () { if (done) done(null); };
      reader.readAsDataURL(file);
    },

    /* Avatar picker sheet: the character set, filterable, plus an optional
       photo. opts: { kind: 'player'|'team'|'profile', onDone(avatarId), current, title } */
    pickLook: function (id, opts) {
      opts = opts || {};
      var isTeam = opts.kind === 'team';
      var isProfile = opts.kind === 'profile';
      var entity = isProfile ? { name: opts.name || '', avatar: opts.current }
        : isTeam ? (FF.Teams.get().teams.filter(function (t) { return t.id === id; })[0] || null)
          : this.byId(id);
      if (!entity) return;
      var chosen = entity.avatar;
      var sheet = null;

      function live() {
        if (isProfile) return { name: entity.name, avatar: chosen };
        return isTeam
          ? (FF.Teams.get().teams.filter(function (t) { return t.id === id; })[0] || entity)
          : (FF.Players.byId(id) || entity);
      }

      var body = FF.ui.div('look-picker');
      var preview = FF.ui.div('look-preview');
      function refreshPreview() {
        FF.ui.clear(preview);
        var cur = live();
        preview.appendChild(FF.Players.avatarEl(cur, 'look-preview__face'));
        if (cur.name) preview.appendChild(FF.ui.div('look-preview__name', cur.name));
      }
      refreshPreview();
      body.appendChild(preview);

      var grid = FF.ui.el('div', { class: 'avatar-grid', role: 'radiogroup', 'aria-label': FF.t('characters', 'Characters') });
      function pick(aid) {
        chosen = aid;
        if (!isProfile) {
          if (isTeam) FF.Teams.setAvatar(id, aid);
          else FF.Players.setAvatar(id, aid);
        }
        FF.ui.$$('.avatar-btn', grid).forEach(function (b) {
          var on = b.dataset.avatar === aid;
          b.classList.toggle('active', on);
          b.setAttribute('aria-checked', on ? 'true' : 'false');
        });
        refreshPreview();
      }
      function renderGrid(group) {
        FF.ui.clear(grid);
        FF.Avatars.all().filter(function (a) { return group === 'all' || a.group === group; }).forEach(function (a) {
          var on = a.id === chosen && !live().photo;
          var b = FF.ui.el('button', {
            type: 'button', class: 'avatar-btn' + (on ? ' active' : ''), role: 'radio',
            'aria-checked': on ? 'true' : 'false', 'aria-label': a.name, title: a.name,
            dataset: { avatar: a.id }
          });
          b.appendChild(FF.Avatars.img(a.id, 'avatar-btn__img'));
          b.addEventListener('click', function () { pick(a.id); });
          grid.appendChild(b);
        });
      }
      body.appendChild(FF.UI.segmented({
        label: FF.t('characterType', 'Character type'), value: 'all', compact: true,
        options: [
          { label: FF.t('all', 'All'), value: 'all' },
          { label: FF.t('people', 'People'), value: 'people' },
          { label: FF.t('animals', 'Animals'), value: 'animals' },
          { label: FF.t('fantasy', 'Fantasy'), value: 'fantasy' }
        ],
        onChange: function (v) { renderGrid(v); }
      }));
      renderGrid('all');
      body.appendChild(grid);

      if (!isProfile) {
        var file = FF.ui.el('input', { type: 'file', accept: 'image/*', hidden: true, 'aria-hidden': 'true', tabindex: -1 });
        file.addEventListener('change', function () {
          var picked = file.files && file.files[0];
          file.value = '';
          if (!picked) return;
          FF.Players.readPhotoFile(picked, function (data) {
            if (!data) { FF.UI.toast(FF.t('photoFailed', 'That picture could not be used.'), { type: 'error' }); return; }
            if (isTeam) FF.Teams.setPhoto(id, data);
            else FF.Players.setPhoto(id, data);
            refreshPreview();
          });
        });
        body.appendChild(file);
        var photoRow = FF.ui.div('look-photo-row');
        photoRow.appendChild(FF.UI.button(FF.t('uploadPhoto', 'Use a photo instead'), { class: 'btn-sm', icon: 'image', onClick: function () { file.click(); } }));
        if (live().photo) {
          photoRow.appendChild(FF.UI.button(FF.t('removePhoto', 'Remove photo'), {
            class: 'btn-sm btn-ghost', icon: 'trash',
            onClick: function () {
              if (isTeam) FF.Teams.setPhoto(id, null); else FF.Players.setPhoto(id, null);
              refreshPreview();
            }
          }));
        }
        body.appendChild(photoRow);
        body.appendChild(FF.ui.el('p', { class: 'details__note' }, FF.t('photoPrivacy', 'Photos stay on this device. They are never uploaded or shared.')));
      }

      sheet = FF.UI.sheet({
        title: opts.title || (isTeam ? FF.t('teamPicture', 'Team picture') : FF.t('chooseCharacter', 'Choose a character')),
        body: body,
        wide: true,
        actions: [{ label: FF.t('done', 'Done'), primary: true }],
        onClose: function () { if (opts.onDone) opts.onDone(chosen); }
      });
      return sheet;
    },

    // Colour picker sheet with named swatches and a visible selected state.
    pickColor: function (id, onDone) {
      var p = this.byId(id);
      if (!p) return;
      var grid = FF.ui.el('div', { class: 'color-grid', role: 'radiogroup', 'aria-label': FF.t('playerColour', 'Player colour') });
      var sheet = null;
      FF.Players.COLORS.forEach(function (c, i) {
        var on = (p.color || '').toLowerCase() === c.toLowerCase();
        var name = FF.Players.COLOR_NAMES[i] || c;
        var b = FF.ui.el('button', {
          type: 'button', class: 'color-btn' + (on ? ' active' : ''), role: 'radio',
          style: { background: c }, 'aria-checked': on ? 'true' : 'false', 'aria-label': name, title: name
        });
        if (on) b.appendChild(FF.Icons.icon('check'));
        b.addEventListener('click', function () {
          FF.Players.setColor(id, c);
          if (sheet) sheet.close();
        });
        grid.appendChild(b);
      });
      sheet = FF.UI.sheet({
        title: FF.t('chooseColour', 'Choose a colour'),
        body: grid,
        onClose: function () { if (onDone) onDone(); }
      });
    }
  };

  FF.Teams = {
    COLORS: ['#ef4444', '#3b82f6', '#10b981', '#eab308'],
    NAMES: ['Team A', 'Team B', 'Team C', 'Team D'],

    get: function () {
      var t = FF.Storage.get('teams', null);
      if (t && t.teams) return t;
      return { enabled: false, count: 2, teams: this.build(2) };
    },

    build: function (count) {
      count = FF.util.clamp(count, 2, 4);
      var teams = [];
      for (var i = 0; i < count; i++) {
        teams.push({ id: 'team' + (i + 1), name: this.NAMES[i], color: this.COLORS[i], playerIds: [] });
      }
      return teams;
    },

    save: function (t) { FF.Storage.set('teams', t); },

    setEnabled: function (on) {
      var t = this.get();
      t.enabled = !!on;
      if (on) this.autoAssign(t);
      this.save(t);
      return t;
    },

    setCount: function (count) {
      var t = this.get();
      t.count = FF.util.clamp(count, 2, 4);
      t.teams = this.build(t.count);
      if (t.enabled) this.autoAssign(t);
      this.save(t);
      return t;
    },

    rename: function (teamId, name) {
      var t = this.get();
      t.teams.forEach(function (tm) { if (tm.id === teamId) tm.name = name; });
      this.save(t);
      return t;
    },

    setPhoto: function (teamId, photo) {
      var t = this.get();
      t.teams.forEach(function (tm) { if (tm.id === teamId) tm.photo = photo || null; });
      this.save(t);
      return t;
    },

    setAvatar: function (teamId, avatar) {
      var t = this.get();
      t.teams.forEach(function (tm) {
        if (tm.id === teamId) {
          tm.avatar = avatar || null;
          tm.photo = null;
        }
      });
      this.save(t);
      return t;
    },

    assign: function (teamId, playerId) {
      var t = this.get();
      t.teams.forEach(function (tm) {
        tm.playerIds = tm.playerIds.filter(function (id) { return id !== playerId; });
      });
      t.teams.forEach(function (tm) { if (tm.id === teamId) tm.playerIds.push(playerId); });
      this.save(t);
      return t;
    },

    unassign: function (playerId) {
      var t = this.get();
      t.teams.forEach(function (tm) {
        tm.playerIds = tm.playerIds.filter(function (id) { return id !== playerId; });
      });
      this.save(t);
      return t;
    },

    // Spread the players in the next game evenly across the teams.
    autoAssign: function (t) {
      var players = FF.Players.get();
      t.teams.forEach(function (tm) { tm.playerIds = []; });
      players.forEach(function (p, i) {
        t.teams[i % t.teams.length].playerIds.push(p.id);
      });
    },

    teamOf: function (playerId) {
      var t = this.get();
      for (var i = 0; i < t.teams.length; i++) if (t.teams[i].playerIds.indexOf(playerId) !== -1) return t.teams[i];
      return null;
    },

    // Scoring entities for team play: only players who are in the next game.
    entities: function () {
      var inGame = FF.Players.get().map(function (p) { return p.id; });
      return this.get().teams.map(function (tm) {
        return {
          id: tm.id, name: tm.name, isTeam: true,
          avatar: tm.avatar || null, photo: tm.photo || null, color: tm.color,
          players: tm.playerIds.filter(function (id) { return inGame.indexOf(id) !== -1; })
        };
      });
    },

    enabled: function () { return this.get().enabled; }
  };
})();
