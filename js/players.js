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
    COLOR_NAMES: ['Purple', 'Blue', 'Green', 'Orange', 'Pink', 'Yellow', 'Red', 'Sky blue'],
    MIN: 1,
    MAX: 8,

    get: function () {
      const list = FF.Storage.get('players', null);
      if (list && Array.isArray(list) && list.length) return list;
      return this.defaultPlayers();
    },

    defaultPlayers: function () {
      return [
        { id: 'p1', name: 'Player 1', avatar: '😀', color: '#8b5cf6' }
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
      if (list.length < this.MIN) return this.get();
      this.save(list);
      return list;
    },

    ensureCount: function (n) {
      n = FF.util.clamp(n, this.MIN, this.MAX);
      let list = this.get().slice();
      while (list.length < n) {
        list.push({
          id: FF.util.uid(),
          name: 'Player ' + (list.length + 1),
          avatar: FF.util.pick(this.AVATARS),
          color: this.COLORS[list.length % this.COLORS.length]
        });
      }
      if (list.length > n) list = list.slice(0, n);
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
    setAvatar: function (id, avatar) { return this.update(id, { avatar: avatar, photo: null }); },
    setColor: function (id, color) { return this.update(id, { color: color }); },
    setPhoto: function (id, photo) { return this.update(id, { photo: photo || null }); },

    // Renders a photo if one was uploaded, otherwise the emoji avatar.
    avatarEl: function (entity, cls) {
      cls = cls || 'ff-avatar';
      const photo = entity && entity.photo;
      if (photo) {
        return FF.ui.el('img', {
          class: cls + ' ff-avatar--photo',
          src: photo,
          alt: (entity && entity.name) || 'Player'
        });
      }
      return FF.ui.el('span', { class: cls + ' ff-avatar--emoji' }, (entity && entity.avatar) || '😀');
    },

    readPhotoFile: function (file, done) {
      if (!file || !file.type || file.type.indexOf('image/') !== 0) {
        if (done) done(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = function () {
        const img = new Image();
        img.onload = function () {
          const size = 160;
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          const side = Math.min(img.width, img.height);
          const sx = (img.width - side) / 2;
          const sy = (img.height - side) / 2;
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

    // Avatar / photo picker sheet. opts: { kind: 'player'|'team', onDone() }
    pickLook: function (id, opts) {
      opts = opts || {};
      const isTeam = opts.kind === 'team';
      const entity = isTeam
        ? (FF.Teams.get().teams.find(function (t) { return t.id === id; }) || null)
        : this.byId(id);
      if (!entity) return;

      function live() {
        return isTeam
          ? (FF.Teams.get().teams.find(function (t) { return t.id === id; }) || entity)
          : (FF.Players.byId(id) || entity);
      }

      const body = FF.ui.div('');
      const preview = FF.ui.div('look-preview');
      function refreshPreview() {
        FF.ui.clear(preview);
        const cur = live();
        preview.appendChild(FF.Players.avatarEl(cur, 'look-preview__face'));
        preview.appendChild(FF.ui.div('look-preview__name', cur.name || ''));
      }
      refreshPreview();
      body.appendChild(preview);

      const file = FF.ui.el('input', { type: 'file', accept: 'image/*', hidden: true, 'aria-hidden': 'true', tabindex: -1 });
      file.addEventListener('change', function () {
        const chosen = file.files && file.files[0];
        file.value = '';
        if (!chosen) return;
        FF.Players.readPhotoFile(chosen, function (data) {
          if (!data) { if (FF.UI) FF.UI.toast(FF.t('photoFailed', 'That picture could not be used.'), { type: 'error' }); return; }
          if (isTeam) FF.Teams.setPhoto(id, data);
          else FF.Players.setPhoto(id, data);
          FF.ui.$$('.avatar-btn', grid).forEach(function (b) { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
          refreshPreview();
        });
      });
      body.appendChild(file);

      const photoRow = FF.ui.div('look-photo-row');
      photoRow.appendChild(FF.UI.button(FF.t('uploadPhoto', 'Upload photo'), { icon: 'image', onClick: function () { file.click(); } }));
      photoRow.appendChild(FF.UI.button(FF.t('removePhoto', 'Remove photo'), {
        icon: 'trash',
        class: 'btn-ghost',
        onClick: function () {
          if (isTeam) FF.Teams.setPhoto(id, null);
          else FF.Players.setPhoto(id, null);
          refreshPreview();
        }
      }));
      body.appendChild(photoRow);
      body.appendChild(FF.ui.el('p', { class: 'details__note' }, FF.t('photoPrivacy', 'Photos stay on this device. They are never uploaded or shared.')));

      const grid = FF.ui.el('div', { class: 'avatar-grid', role: 'group', 'aria-label': FF.t('emojiAvatars', 'Emoji pictures') });
      const current = entity.avatar;
      FF.Players.AVATARS.forEach(function (a) {
        const on = a === current && !entity.photo;
        const b = FF.ui.el('button', {
          type: 'button',
          class: 'avatar-btn' + (on ? ' active' : ''),
          'aria-pressed': on ? 'true' : 'false',
          'aria-label': a
        }, a);
        b.addEventListener('click', function () {
          if (isTeam) FF.Teams.setAvatar(id, a);
          else FF.Players.setAvatar(id, a);
          FF.ui.$$('.avatar-btn', grid).forEach(function (x) { x.classList.remove('active'); x.setAttribute('aria-pressed', 'false'); });
          b.classList.add('active');
          b.setAttribute('aria-pressed', 'true');
          refreshPreview();
        });
        grid.appendChild(b);
      });
      body.appendChild(grid);

      FF.UI.sheet({
        title: isTeam ? FF.t('teamPicture', 'Team picture') : FF.t('chooseLook', 'Choose a picture'),
        body: body,
        actions: [{ label: FF.t('done', 'Done'), primary: true }],
        onClose: function () { if (opts.onDone) opts.onDone(); }
      });
    },

    // Colour picker sheet with named swatches and a visible selected state.
    pickColor: function (id, onDone) {
      const p = this.byId(id);
      if (!p) return;
      const grid = FF.ui.el('div', { class: 'avatar-grid', role: 'group', 'aria-label': FF.t('playerColour', 'Player colour') });
      let sheet = null;
      FF.Players.COLORS.forEach(function (c, i) {
        const on = (p.color || '').toLowerCase() === c.toLowerCase();
        const name = FF.Players.COLOR_NAMES[i] || c;
        const b = FF.ui.el('button', {
          type: 'button',
          class: 'avatar-btn color-btn' + (on ? ' active' : ''),
          style: { background: c },
          'aria-pressed': on ? 'true' : 'false',
          'aria-label': name,
          title: name
        });
        if (on) b.appendChild(FF.Icons.icon('check', '✓'));
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
    },

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

    setPhoto: function (teamId, photo) {
      const t = this.get();
      t.teams.forEach(function (tm) { if (tm.id === teamId) tm.photo = photo || null; });
      this.save(t);
      return t;
    },

    setAvatar: function (teamId, avatar) {
      const t = this.get();
      t.teams.forEach(function (tm) {
        if (tm.id === teamId) {
          tm.avatar = avatar || '👥';
          tm.photo = null;
        }
      });
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
        return { id: tm.id, name: tm.name, avatar: tm.avatar || '👥', photo: tm.photo || null, color: tm.color, players: tm.playerIds };
      });
    },

    enabled: function () { return this.get().enabled; }
  };
})();
