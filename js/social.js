/* ============================================================
   PLAYMONA — social.js
   Ways to play with other people that do not need everyone online
   at the same time:

   - FF.Daily      one game a day, the same for everyone, with a
                   daily leaderboard. The game is picked by the
                   server (api/cron.php) or FF.Leaderboards.dailyGame.
   - FF.Challenge  play 10 questions, send a link, a friend plays
                   the same questions and tries to beat your score.

   Challenges use FF.QuizRun for the questions; both use FF.Cloud for
   shared results. Leaderboards need an account.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var t = function (k, f, v) {
    if (FF.t) return FF.t(k, f, v);
    return String(f).replace(/\{(\w+)\}/g, function (m, n) { return v && v[n] != null ? v[n] : m; });
  };
  var icon = function (k) { return FF.Icons.icon(k); };
  var fmt = function (n) { return FF.util.formatNumber(n || 0); };
  var MAX_SCORE = 1500;          // challenges (10 questions)

  function me() {
    var p = (FF.Auth && FF.Auth.profile()) || {};
    return { uid: FF.Auth && FF.Auth.user() ? FF.Auth.user().uid : null, name: p.displayName || t('player', 'Player'), avatar: p.avatar || null };
  }

  function utcKey(d) { return (d || new Date()).toISOString().slice(0, 10); }

  function untilText(ms) {
    var m = Math.max(1, Math.round(ms / 60000));
    var h = Math.floor(m / 60);
    m = m % 60;
    return h ? t('hm', '{h} h {m} min', { h: h, m: m }) : t('mOnly', '{m} min', { m: m });
  }

  function shareOrCopy(title, text, url) {
    if (navigator.share) {
      return navigator.share({ title: title, text: text, url: url }).catch(function () {});
    }
    var full = text + (url ? ' ' + url : '');
    var done = function () { FF.UI.toast(t('linkCopied', 'Link copied'), { type: 'success' }); };
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(full).then(done, function () {});
    var ta = FF.ui.el('textarea', { style: { position: 'fixed', opacity: '0' } }, full);
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) {}
    ta.parentNode.removeChild(ta);
    return Promise.resolve();
  }

  function whatsappUrl(text, url) {
    return 'https://wa.me/?text=' + encodeURIComponent(text + (url ? ' ' + url : ''));
  }

  function siteUrl() {
    var loc = window.location;
    if (loc.protocol === 'http:' || loc.protocol === 'https:') return loc.origin + loc.pathname.replace(/[^/]*$/, '');
    return 'https://playmona.com/';
  }

  // Ranked list of rows: [{ name, avatar, score, correct, ms, key }]
  // The list itself lives in FF.Leaderboards; challenges show n/10 beside each score.
  function board(rows, myUid, opts) {
    opts = opts || {};
    return FF.Leaderboards.board(rows, myUid, {
      meta: opts.showCorrect === false ? null : function (r) { return t('nOfTen', '{n}/10', { n: r.correct || 0 }); }
    });
  }

  function sortRows(rows) { return FF.Leaderboards.sortRows(rows); }

  function cloudNote(kind) {
    var n = FF.ui.div('social-note');
    n.appendChild(icon(kind === 'guest' ? 'user' : 'wifi'));
    if (kind === 'guest') {
      n.appendChild(FF.ui.span('social-note__text', t('lbGuest', 'Create a free account to see the leaderboard and get your name on it.')));
      n.appendChild(FF.UI.button(t('createAccount', 'Create account'), { class: 'btn-sm btn-primary', onClick: function () { FF.App.openAccount('signup'); } }));
    } else {
      n.appendChild(FF.ui.span('social-note__text', t('lbOffline', 'The leaderboard could not load. Check your connection and try again.')));
    }
    return n;
  }

  function addXp(n, correct, total) {
    if (FF.Stats && FF.Stats.recordExtra) FF.Stats.recordExtra({ xp: n, category: 'quiz', quizCorrect: correct, quizAnswered: total });
  }

  /* =======================================================
     Daily challenge
     ======================================================= */
  FF.Daily = {
    key: function () { return utcKey(); },
    seed: function (key) { return 'daily|' + (key || this.key()); },
    msLeft: function () {
      var now = new Date();
      var next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
      return next - now.getTime();
    },
    log: function () { return FF.Storage.get('dailyLog', {}) || {}; },
    today: function () { return this.log()[this.key()] || null; },
    played: function () { var d = this.today(); return !!(d && (d.done || d.started)); },

    // Days in a row with a finished challenge, ending today (or yesterday).
    streak: function () {
      var log = this.log();
      var d = new Date();
      if (!log[utcKey(d)]) d.setUTCDate(d.getUTCDate() - 1);
      var n = 0;
      while (log[utcKey(d)]) { n++; d.setUTCDate(d.getUTCDate() - 1); }
      return n;
    },

    _save: function (key, entry) {
      var log = this.log();
      log[key] = entry;
      var keys = Object.keys(log).sort();
      while (keys.length > 60) delete log[keys.shift()];
      FF.Storage.set('dailyLog', log);
    },

    // Today's game id (the same on every device).
    game: function (key) { return FF.Leaderboards.dailyGame(key || this.key()); },

    start: function () {
      if (this.played()) { FF.Nav.go('daily'); return; }
      if (this._starting) return;
      var key = this.key();
      var self = this;
      this._starting = true;
      this.game(key).then(function (id) {
        self._starting = false;
        var def = id && FF.Games.get(id);
        if (!def) {
          FF.UI.toast(t('dailyNoGame', 'Today’s game is not in this version of PlayMona yet. Reload the page to update.'), { type: 'error' });
          return;
        }
        // Starting uses up today's attempt, so a reload cannot restart it.
        self._save(key, { started: true, game: id, score: 0, ms: 0, t: Date.now() });
        FF.GameFlow.launch(id, { daily: key, skipIntro: true });
      }, function () { self._starting = false; });
    },

    /* GameFlow calls this when the daily game ends, or is left early (the points so far count).
       Resolves the player's place when it is inside the celebration threshold, else 0. */
    finish: function (key, gameId, points, correct) {
      var entry = this.log()[key];
      if (!entry || entry.done) return Promise.resolve(0);
      var done = { done: true, game: gameId, score: Math.max(0, Math.round(points || 0)), ms: Math.max(0, Date.now() - (entry.t || Date.now())), t: Date.now(), submitted: false };
      if (typeof correct === 'number') done.correct = correct;
      this._save(key, done);
      if (key !== this.key()) return Promise.resolve(0);   // finished after midnight: too late for that board
      return this.submit().then(function () {
        var uid = me().uid;
        if (!uid) return 0;
        return FF.Leaderboards.rankIn('daily/' + key, uid, FF.Leaderboards.threshold()).then(function (rank) {
          if (rank) FF.Leaderboards.remember('daily', { rank: rank, game: gameId, period: 'daily' });
          return rank;
        });
      }).catch(function () { return 0; });
    },

    // Put today's score on the leaderboard (once). Retries next visit if offline.
    submit: function () {
      var key = this.key();
      var d = this.today();
      if (!d || !d.done || d.submitted || !FF.Cloud.available()) return Promise.resolve();
      var who = me();
      var self = this;
      var row = { name: who.name, avatar: who.avatar, score: Math.min(FF.Leaderboards.MAX_SCORE, d.score), ms: Math.round(d.ms || 0), t: d.t, game: d.game || 'quiz' };
      if (typeof d.correct === 'number') row.correct = d.correct;
      return FF.Cloud.set('daily/' + key + '/' + who.uid, row).then(function () {
        d.submitted = true; self._save(key, d);
      }).catch(function (e) {
        // Already on the board (a second device, say): nothing more to do.
        if (e && /permission/i.test(e.code || e.message || '')) { d.submitted = true; self._save(key, d); }
        throw e;
      });
    },

    board: function (key) {
      return FF.Cloud.top('daily/' + (key || this.key()), 'score', 50).then(sortRows);
    },

    shareText: function (d) {
      var game = d.game && FF.Games.get(d.game) ? FF.Leaderboards.gameName(d.game) : t('dailyChallenge', 'Daily challenge');
      return t('dailyShareGame', 'PlayMona daily challenge {date} ({game}): {pts} points. Can you beat me?', { date: this.key(), game: game, pts: fmt(d.score) });
    }
  };

  /* =======================================================
     Challenge a friend
     ======================================================= */
  function b64encode(obj) {
    var s = unescape(encodeURIComponent(JSON.stringify(obj)));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64decode(str) {
    var s = String(str).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return JSON.parse(decodeURIComponent(escape(atob(s))));
  }

  FF.Challenge = {
    list: function () { return FF.Storage.get('challenges', []) || []; },
    byId: function (id) { return this.list().filter(function (c) { return c.id === id; })[0] || null; },
    _put: function (rec) {
      var all = this.list().filter(function (c) { return c.id !== rec.id; });
      all.unshift(rec);
      FF.Storage.set('challenges', all.slice(0, 40));
    },
    _incoming: {},

    // The link a friend opens. Everything needed to replay the run is in it.
    link: function (rec) {
      var code = b64encode({ v: 1, i: rec.id, s: rec.seed, k: rec.topic, n: rec.from ? rec.from.name : me().name,
        a: rec.from ? rec.from.avatar : me().avatar, sc: rec.from ? rec.from.score : rec.me.score, c: rec.from ? rec.from.correct : rec.me.correct });
      var base = window.location.protocol === 'file:' ? 'https://playmona.com/play' : window.location.origin + window.location.pathname;
      return base + '#challenge=' + code;
    },

    // Read and check a challenge code from a link.
    decode: function (code) {
      try {
        var p = b64decode(code);
        if (!p || p.v !== 1 || typeof p.i !== 'string' || typeof p.s !== 'string') return null;
        if (!/^[a-z0-9]{6,24}$/.test(p.i) || !/^[a-z0-9]{4,24}$/.test(p.s)) return null;
        var topic = FF.QuizRun.topic(p.k).id;
        return {
          id: p.i, seed: p.s, topic: topic,
          from: {
            name: String(p.n || t('aFriend', 'A friend')).replace(/\s+/g, ' ').trim().slice(0, 24),
            avatar: FF.Avatars.has(p.a) ? p.a : FF.Avatars.normalize(p.a, p.n),
            score: Math.max(0, Math.min(MAX_SCORE, Number(p.sc) || 0)),
            correct: Math.max(0, Math.min(10, Number(p.c) || 0))
          }
        };
      } catch (e) { return null; }
    },

    codeFromUrl: function () {
      var m = /[#&]challenge=([A-Za-z0-9_-]+)/.exec(window.location.hash || '');
      return m ? m[1] : null;
    },

    // A link was opened: show the challenge (or its result if already played).
    openCode: function (code) {
      var c = this.decode(code);
      try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch (e) {}
      if (!c) { FF.UI.toast(t('badChallenge', 'That challenge link is not complete. Ask your friend to send it again.'), { type: 'error' }); return; }
      if (!this.byId(c.id)) this._incoming[c.id] = c;
      FF.Nav.go('challenge', { id: c.id });
    },

    // Play a new run, then share it.
    create: function (topicId) {
      var self = this;
      var topic = FF.QuizRun.topic(topicId);
      var rec = { id: FF.Random.newSeed() + FF.Random.newSeed(), seed: FF.Random.newSeed(), topic: topic.id, role: 'sent', at: Date.now() };
      FF.QuizRun.play({
        title: t('challengeTitle', 'Challenge: {topic}', { topic: t('topic_' + topic.id, topic.name) }), icon: 'swords',
        questions: FF.QuizRun.build(rec.seed, topic.id),
        onDone: function (r) {
          rec.me = { score: r.score, correct: r.correct, ms: Math.round(r.ms) };
          self._put(rec);
          addXp(10 + r.correct * 3, r.correct, r.total);
          self._post(rec);
          FF.Nav.go('challenge', { id: rec.id, fresh: true });
        }
      });
    },

    // Play a challenge someone sent.
    accept: function (id) {
      var self = this;
      var c = this._incoming[id];
      if (!c) return;
      FF.QuizRun.play({
        title: t('challengeFrom', '{name}’s challenge', { name: c.from.name }), icon: 'swords',
        questions: FF.QuizRun.build(c.seed, c.topic),
        onDone: function (r) {
          var rec = { id: c.id, seed: c.seed, topic: c.topic, role: 'received', from: c.from, at: Date.now(),
            me: { score: r.score, correct: r.correct, ms: Math.round(r.ms) } };
          self._put(rec);
          delete self._incoming[id];
          addXp(10 + r.correct * 3, r.correct, r.total);
          self._post(rec);
          FF.Nav.go('challenge', { id: rec.id });
        }
      });
    },

    // Share results so the sender can see who took them on (accounts only).
    _post: function (rec) {
      if (!FF.Cloud.available()) return;
      var who = me();
      FF.Cloud.set('challenges/' + rec.id + '/' + who.uid, {
        name: who.name, avatar: who.avatar, score: Math.min(MAX_SCORE, rec.me.score), correct: rec.me.correct, ms: rec.me.ms, t: Date.now()
      }).catch(function () {});
    },

    results: function (id) {
      return FF.Cloud.get('challenges/' + id).then(function (obj) {
        return sortRows(Object.keys(obj || {}).map(function (k) { return Object.assign({ key: k }, obj[k]); }));
      });
    }
  };

  /* =======================================================
     Screens (registered as app views)
     ======================================================= */
  function banner(iconKey, tone, title, sub) {
    var b = FF.ui.div('social-head social-head--' + tone);
    var ic = FF.ui.span('social-head__icon');
    ic.appendChild(icon(iconKey));
    b.appendChild(ic);
    var txt = FF.ui.div('social-head__text');
    txt.appendChild(FF.ui.el('h1', { class: 'social-head__title' }, title));
    if (sub) txt.appendChild(FF.ui.el('p', { class: 'social-head__sub' }, sub));
    b.appendChild(txt);
    return b;
  }

  function backLink() {
    return FF.UI.button(t('back', 'Back'), { class: 'btn-ghost btn-sm social-back', icon: 'arrow-left', onClick: function () { FF.Nav.back(); } });
  }

  function stat(value, label, iconKey) {
    var s = FF.ui.div('social-stat');
    if (iconKey) s.appendChild(icon(iconKey));
    s.appendChild(FF.ui.el('strong', {}, value));
    s.appendChild(FF.ui.span('', label));
    return s;
  }

  function loadingRow() {
    return FF.UI.loading(t('loading', 'Loading…'));
  }

  var Views = {
    daily: function (main) {
      var D = FF.Daily;
      var d = D.today();
      var streak = D.streak();
      main.appendChild(backLink());
      main.appendChild(banner('calendar', 'blue', t('dailyChallenge', 'Daily challenge'),
        t('dailySubGame', 'One game, the same for everyone today. One try. A new game in {time}.', { time: untilText(D.msLeft()) })));

      var row = FF.ui.div('social-stats');
      row.appendChild(stat(String(streak), streak === 1 ? t('dayStreak1', 'day streak') : t('dayStreakN', 'day streak'), 'fire'));
      if (d && (d.done || d.started)) {
        row.appendChild(stat(fmt(d.score), t('points', 'Points'), 'star-fill'));
        if (typeof d.correct === 'number') row.appendChild(stat(fmt(d.correct), t('correctLabel', 'Correct'), 'check-circle'));
      }
      main.appendChild(row);

      // Today's game: cover, name and how to play, then Start (or the result).
      var card = FF.ui.el('section', { class: 'social-card daily-game' });
      card.appendChild(loadingRow());
      main.appendChild(card);
      var yesterday = FF.ui.el('p', { class: 'daily-game__yesterday' }, '');
      main.appendChild(yesterday);
      D.game(D.key()).then(function (id) {
        FF.ui.clear(card);
        var def = id && FF.Games.get(id);
        if (!def) {
          card.appendChild(FF.ui.el('p', { class: 'social-done' }, t('dailyNoGame', 'Today’s game is not in this version of PlayMona yet. Reload the page to update.')));
          return;
        }
        var cat = FF.Categories && FF.Categories.meta ? FF.Categories.meta(def.category) : { name: def.category };
        var cover = FF.ui.div('daily-game__cover');
        cover.style.setProperty('--art', FF.Assets.artUrl('covers', def.id));
        cover.style.setProperty('--wash', FF.Assets.wash(def.category));
        card.appendChild(cover);
        var text = FF.ui.div('daily-game__text');
        text.appendChild(FF.ui.span('daily-game__kicker', t('dailyTodaysGame', 'Today’s game')));
        text.appendChild(FF.ui.el('h2', { class: 'daily-game__name' }, FF.Leaderboards.gameName(def.id)));
        text.appendChild(FF.ui.span('daily-game__cat', cat.name || def.category));
        if (def.description) text.appendChild(FF.ui.el('p', { class: 'daily-game__desc' }, def.description));
        card.appendChild(text);
        if (!d) {
          var rules = FF.ui.el('ul', { class: 'social-rules' });
          (def.howToPlay || []).slice(0, 3).concat([t('dailyRuleOneTry', 'One try a day. Everyone plays the same game, with the same rounds.')]).forEach(function (r) {
            var li = FF.ui.el('li', {});
            li.appendChild(icon('check'));
            li.appendChild(FF.ui.span('', r));
            rules.appendChild(li);
          });
          card.appendChild(rules);
          card.appendChild(FF.UI.button(t('startDaily', 'Start today’s challenge'), { class: 'btn-lg btn-primary btn-block', icon: 'play', onClick: function () { D.start(); } }));
        } else {
          card.classList.add('social-card--done');
          card.appendChild(FF.ui.el('p', { class: 'social-done' }, t('dailyDoneGame', 'You have played today’s challenge. A new game comes in {time}.', { time: untilText(D.msLeft()) })));
          var acts = FF.ui.div('social-actions');
          acts.appendChild(FF.UI.button(t('shareResult', 'Share result'), { class: 'btn-primary', icon: 'share', onClick: function () {
            shareOrCopy('PlayMona', D.shareText(d), siteUrl());
          } }));
          acts.appendChild(FF.UI.button(t('challengeFriend', 'Challenge a friend'), { icon: 'swords', onClick: function () { FF.Nav.go('challenges'); } }));
          card.appendChild(acts);
        }
      });
      var y = new Date();
      y.setUTCDate(y.getUTCDate() - 1);
      FF.Leaderboards.dailyGameOn(utcKey(y)).then(function (id) {
        if (id && FF.Games.get(id)) yesterday.textContent = t('dailyYesterday', 'Yesterday: {game}', { game: FF.Leaderboards.gameName(id) });
      });

      // Leaderboard
      main.appendChild(FF.App.sectionHead(t('todaysLeaderboard', 'Today’s leaderboard'),
        FF.UI.button(t('allLeaderboards', 'All leaderboards'), { class: 'btn-sm btn-ghost', icon: 'trophy', onClick: function () { FF.Nav.go('leaderboard', { tab: 'daily' }); } })));
      if (!FF.Cloud.available()) { main.appendChild(cloudNote('guest')); return; }
      var holder = FF.ui.div('social-board');
      holder.appendChild(loadingRow());
      main.appendChild(holder);
      var who = me();
      D.submit().catch(function () {}).then(function () { return D.board(); }).then(function (rows) {
        FF.ui.clear(holder);
        if (!rows.length) {
          holder.appendChild(FF.ui.el('p', { class: 'social-empty' }, t('lbEmpty', 'No scores yet today. Be the first.')));
          return;
        }
        holder.appendChild(FF.Leaderboards.board(rows, who.uid));
        var mine = rows.some(function (r) { return r.key === who.uid; });
        if (d && d.done && !mine) holder.appendChild(FF.ui.el('p', { class: 'social-empty' }, t('lbNotTop', 'You are not in the top 50 today. Keep going!')));
      }).catch(function () {
        FF.ui.clear(holder);
        holder.appendChild(cloudNote('offline'));
      });
    },

    challenges: function (main) {
      main.appendChild(backLink());
      main.appendChild(banner('swords', 'pink', t('challengeFriend', 'Challenge a friend'),
        t('challengeSub', 'Answer 10 questions, then send the link. Your friend gets the same questions and tries to beat your score.')));

      main.appendChild(FF.App.sectionHead(t('pickTopic', 'Pick a topic')));
      var grid = FF.ui.el('ul', { class: 'topic-grid' });
      FF.QuizRun.TOPICS.forEach(function (tp) {
        var li = FF.ui.el('li', {});
        var b = FF.ui.el('button', { type: 'button', class: 'topic-card' });
        var ic = FF.ui.span('topic-card__icon');
        ic.appendChild(icon(tp.icon));
        b.appendChild(ic);
        b.appendChild(FF.ui.el('strong', { class: 'topic-card__name' }, t('topic_' + tp.id, tp.name)));
        b.appendChild(FF.ui.span('topic-card__desc', t('topicDesc_' + tp.id, tp.desc)));
        b.addEventListener('click', function () { FF.Challenge.create(tp.id); });
        li.appendChild(b);
        grid.appendChild(li);
      });
      main.appendChild(grid);

      var list = FF.Challenge.list();
      main.appendChild(FF.App.sectionHead(t('yourChallenges', 'Your challenges')));
      if (!list.length) {
        main.appendChild(FF.ui.el('p', { class: 'social-empty' }, t('noChallenges', 'Challenges you send and receive show up here.')));
        return;
      }
      var ul = FF.ui.el('ul', { class: 'ch-list' });
      list.forEach(function (c) {
        var li = FF.ui.el('li', {});
        var b = FF.ui.el('button', { type: 'button', class: 'ch-row' });
        var other = c.role === 'received' ? c.from : null;
        b.appendChild(FF.Players.avatarEl(other ? { name: other.name, avatar: other.avatar } : { name: me().name, avatar: me().avatar }, 'ch-row__ava'));
        var txt = FF.ui.div('ch-row__text');
        var topicName = t('topic_' + c.topic, FF.QuizRun.topic(c.topic).name);
        if (other) {
          var res = c.me.score > other.score ? 'won' : (c.me.score < other.score ? 'lost' : 'tied');
          txt.appendChild(FF.ui.el('strong', {}, t('vsName', 'You vs {name}', { name: other.name })));
          txt.appendChild(FF.ui.span('ch-row__sub', topicName + ' · ' + fmt(c.me.score) + ' – ' + fmt(other.score)));
          b.appendChild(txt);
          b.appendChild(FF.ui.span('ch-badge ch-badge--' + res, res === 'won' ? t('won', 'Won') : (res === 'lost' ? t('lost', 'Lost') : t('tied', 'Tied'))));
        } else {
          txt.appendChild(FF.ui.el('strong', {}, t('youChallenged', 'Your challenge')));
          txt.appendChild(FF.ui.span('ch-row__sub', topicName + ' · ' + t('nPoints', '{n} points', { n: fmt(c.me.score) })));
          b.appendChild(txt);
          b.appendChild(FF.ui.span('ch-badge', t('sent', 'Sent')));
        }
        b.addEventListener('click', function () { FF.Nav.go('challenge', { id: c.id }); });
        li.appendChild(b);
        ul.appendChild(li);
      });
      main.appendChild(ul);
    },

    challenge: function (main, params) {
      var C = FF.Challenge;
      var rec = C.byId(params.id);
      var incoming = C._incoming[params.id];
      main.appendChild(FF.UI.button(t('allChallenges', 'All challenges'), { class: 'btn-ghost btn-sm social-back', icon: 'arrow-left', onClick: function () { FF.Nav.go('challenges'); } }));

      if (!rec && !incoming) {
        main.appendChild(FF.ui.el('p', { class: 'social-empty' }, t('challengeGone', 'This challenge is not on this device. Open the link again to play it.')));
        return;
      }

      // Someone challenged you and you have not played yet.
      if (!rec) {
        var c = incoming;
        var topicName = t('topic_' + c.topic, FF.QuizRun.topic(c.topic).name);
        var intro = FF.ui.el('section', { class: 'vs-card vs-card--intro' });
        intro.appendChild(FF.Players.avatarEl({ name: c.from.name, avatar: c.from.avatar }, 'vs-card__hero'));
        intro.appendChild(FF.ui.el('h1', { class: 'vs-card__title' }, t('challengedYou', '{name} challenged you!', { name: c.from.name })));
        intro.appendChild(FF.ui.el('p', { class: 'vs-card__sub' }, t('challengeIntro', '{topic}. They scored {pts} points ({n}/10). You get the same 10 questions. Can you beat them?', { topic: topicName, pts: fmt(c.from.score), n: c.from.correct })));
        intro.appendChild(FF.UI.button(t('acceptChallenge', 'Accept the challenge'), { class: 'btn-lg btn-primary', icon: 'swords', onClick: function () { C.accept(c.id); } }));
        main.appendChild(intro);
        return;
      }

      var topicName2 = t('topic_' + rec.topic, FF.QuizRun.topic(rec.topic).name);
      var self = me();
      var link = C.link(rec);

      if (rec.role === 'received') {
        var won = rec.me.score > rec.from.score, lost = rec.me.score < rec.from.score;
        var vs = FF.ui.el('section', { class: 'vs-card' });
        vs.appendChild(FF.ui.el('h1', { class: 'vs-card__title' }, won ? t('youWon', 'You won!') : (lost ? t('theyWon', '{name} wins this one', { name: rec.from.name }) : t('itsATie', 'It’s a tie!'))));
        var duel = FF.ui.div('vs-duel');
        function side(name, avatar, score, correct, win) {
          var s = FF.ui.div('vs-side' + (win ? ' is-win' : ''));
          s.appendChild(FF.Players.avatarEl({ name: name, avatar: avatar }, 'vs-side__ava'));
          s.appendChild(FF.ui.el('strong', { class: 'vs-side__name' }, name));
          s.appendChild(FF.ui.el('span', { class: 'vs-side__score' }, fmt(score)));
          s.appendChild(FF.ui.span('vs-side__meta', t('nOfTen', '{n}/10', { n: correct })));
          return s;
        }
        duel.appendChild(side(self.name, self.avatar, rec.me.score, rec.me.correct, won));
        duel.appendChild(FF.ui.span('vs-duel__vs', 'VS'));
        duel.appendChild(side(rec.from.name, rec.from.avatar, rec.from.score, rec.from.correct, lost));
        vs.appendChild(duel);
        vs.appendChild(FF.ui.el('p', { class: 'vs-card__sub' }, topicName2));
        var acts = FF.ui.div('social-actions');
        acts.appendChild(FF.UI.button(t('challengeBack', 'Challenge them back'), { class: 'btn-primary', icon: 'swords', onClick: function () { C.create(rec.topic); } }));
        acts.appendChild(FF.UI.button(t('shareResult', 'Share result'), { icon: 'share', onClick: function () {
          shareOrCopy('PlayMona', t('vsShare', 'I scored {a} vs {name}’s {b} on PlayMona ({topic}).', { a: fmt(rec.me.score), name: rec.from.name, b: fmt(rec.from.score), topic: topicName2 }), siteUrl());
        } }));
        vs.appendChild(acts);
        main.appendChild(vs);
      } else {
        var sent = FF.ui.el('section', { class: 'vs-card' });
        sent.appendChild(FF.ui.el('h1', { class: 'vs-card__title' }, params.fresh ? t('niceRun', 'Nice run!') : t('youChallenged', 'Your challenge')));
        sent.appendChild(FF.ui.el('p', { class: 'vs-card__big' }, fmt(rec.me.score)));
        sent.appendChild(FF.ui.el('p', { class: 'vs-card__sub' }, topicName2 + ' · ' + t('nOfTenCorrect', '{n}/10 correct', { n: rec.me.correct })));
        sent.appendChild(FF.ui.el('p', { class: 'vs-card__lead' }, t('sendLinkLead', 'Send this link. Your friends get the same 10 questions and try to beat {pts}.', { pts: fmt(rec.me.score) })));
        var text = t('challengeShareText', 'I scored {pts} on PlayMona. Can you beat me?', { pts: fmt(rec.me.score) });
        var acts2 = FF.ui.div('social-actions');
        acts2.appendChild(FF.UI.button(t('sendChallenge', 'Send challenge'), { class: 'btn-primary', icon: 'share', onClick: function () { shareOrCopy(t('challengeFriend', 'Challenge a friend'), text, link); } }));
        var wa = FF.ui.el('a', { class: 'btn btn-wa', href: whatsappUrl(text, link), target: '_blank', rel: 'noopener' });
        wa.appendChild(icon('chat'));
        wa.appendChild(FF.ui.span('', 'WhatsApp'));
        acts2.appendChild(wa);
        sent.appendChild(acts2);
        var linkBox = FF.ui.el('input', { class: 'input ch-link', type: 'text', readonly: true, value: link, 'aria-label': t('challengeLink', 'Challenge link') });
        linkBox.addEventListener('focus', function () { linkBox.select(); });
        sent.appendChild(linkBox);
        main.appendChild(sent);

        main.appendChild(FF.App.sectionHead(t('whoPlayed', 'Who took you on')));
        if (!FF.Cloud.available()) {
          main.appendChild(FF.ui.el('p', { class: 'social-empty' }, FF.Auth.isGuest()
            ? t('whoPlayedGuest', 'Create an account to see who played your challenge. Until then, ask friends to send you their score.')
            : t('whoPlayedNone', 'Results show up here when friends play.')));
          return;
        }
        var holder = FF.ui.div('social-board');
        holder.appendChild(loadingRow());
        main.appendChild(holder);
        C.results(rec.id).then(function (rows) {
          FF.ui.clear(holder);
          if (rows.length <= 1) { holder.appendChild(FF.ui.el('p', { class: 'social-empty' }, t('noOneYet', 'Nobody has played it yet. Send the link to a few friends.'))); if (!rows.length) return; }
          holder.appendChild(board(rows, self.uid));
        }).catch(function () {
          FF.ui.clear(holder);
          holder.appendChild(cloudNote('offline'));
        });
      }
    }
  };

  /* Home: compact cards for the daily challenge and challenges. */
  function homeCards() {
    var wrap = FF.ui.el('section', { class: 'play-today', 'aria-label': t('playToday', 'Play today') });
    var D = FF.Daily;
    var d = D.today();
    var daily = FF.ui.el('button', { type: 'button', class: 'today-card today-card--blue' });
    var di = FF.ui.span('today-card__icon');
    di.appendChild(icon('calendar'));
    daily.appendChild(di);
    var dt = FF.ui.div('today-card__text');
    dt.appendChild(FF.ui.el('strong', {}, t('dailyChallenge', 'Daily challenge')));
    var sub = FF.ui.span('', d && d.done ? t('dailyDoneShortPts', 'Done · {pts} pts', { pts: fmt(d.score) }) : t('dailyNewGame', 'A new game today. One try.'));
    dt.appendChild(sub);
    daily.appendChild(dt);
    if (!(d && d.done)) {
      D.game(D.key()).then(function (id) {
        if (id && FF.Games.get(id)) sub.textContent = t('dailyTodayIs', 'Today: {game}. One try.', { game: FF.Leaderboards.gameName(id) });
      }).catch(function () {});
    }
    var streak = D.streak();
    if (streak) {
      var st = FF.ui.span('today-card__streak');
      st.appendChild(icon('fire'));
      st.appendChild(document.createTextNode(String(streak)));
      st.setAttribute('aria-label', t('streakN', '{n} day streak', { n: streak }));
      daily.appendChild(st);
    }
    daily.appendChild(FF.ui.span('today-card__go', d ? t('seeLeaderboard', 'Leaderboard') : t('play', 'Play')));
    daily.addEventListener('click', function () { if (d) FF.Nav.go('daily'); else FF.Daily.start(); });
    wrap.appendChild(daily);

    var ch = FF.ui.el('button', { type: 'button', class: 'today-card today-card--pink' });
    var ci = FF.ui.span('today-card__icon');
    ci.appendChild(icon('swords'));
    ch.appendChild(ci);
    var ct = FF.ui.div('today-card__text');
    ct.appendChild(FF.ui.el('strong', {}, t('challengeFriend', 'Challenge a friend')));
    ct.appendChild(FF.ui.span('', t('challengeShort', 'Set a score, send a link, see who wins.')));
    ch.appendChild(ct);
    ch.appendChild(FF.ui.span('today-card__go', t('start', 'Start')));
    ch.addEventListener('click', function () { FF.Nav.go('challenges'); });
    wrap.appendChild(ch);
    return wrap;
  }

  FF.Social = {
    views: Views,
    homeCards: homeCards
  };
})();
