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

  var BIG_SCORE = 1000000;   // any game's points (the leaderboard cap); quiz links keep MAX_SCORE

  // FNV-1a, so a challenge picks the same wording on every phone.
  function hash(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }

  function cleanText(s, max) { return String(s == null ? '' : s).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max); }

  FF.Challenge = {
    // The invite's headline and main button. Each challenge keeps one pair everywhere.
    TAGLINES: [
      ['chTag1', '{name} has challenged you!'],
      ['chTag2', '{name} dares you to beat this'],
      ['chTag3', 'You’ve been called out by {name}'],
      ['chTag4', '{name} thinks they can beat you'],
      ['chTag5', '{name} set the score. Your move.'],
      ['chTag6', 'Can you top {name}?'],
      ['chTag7', '{name} wants a rematch… with you'],
      ['chTag8', '{name} says you can’t beat this']
    ],
    BUTTONS: [
      ['chBtn1', 'Accept the challenge'],
      ['chBtn2', 'Take them on'],
      ['chBtn3', 'I’m in']
    ],
    wording: function (id) {
      var h = hash(String(id || ''));
      var tg = this.TAGLINES[h % this.TAGLINES.length];
      var bt = this.BUTTONS[Math.floor(h / this.TAGLINES.length) % this.BUTTONS.length];
      return { tagline: t(tg[0], tg[1]), button: t(bt[0], bt[1]) };
    },

    // Up to three highlights from a game's results, for the ticket and the brag image.
    stats: function (results) {
      results = results || {};
      var out = [];
      if (results.quizCorrect) out.push({ value: String(results.quizCorrect), label: t('stCorrect', 'Correct') });
      if (results.bestStreak) out.push({ value: String(results.bestStreak), label: t('stStreak', 'Best streak') });
      if (results.fastest != null && isFinite(results.fastest)) out.push({ value: Number(results.fastest).toFixed(2) + ' s', label: t('stFastest', 'Fastest') });
      if (results.mostWords) out.push({ value: String(results.mostWords), label: t('stWords', 'Words') });
      return out.slice(0, 3);
    },

    // The game a challenge is for (v2), or null for a quiz-topic challenge.
    gameOf: function (c) { return c && c.game && FF.Games ? FF.Games.get(c.game) || null : null; },

    // Whether this version of PlayMona can play the challenge.
    playable: function (c) {
      if (!c) return false;
      if (c.v !== 2) return true;
      var def = this.gameOf(c);
      return !!(def && FF.Leaderboards && FF.Leaderboards.active(def));
    },

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
      var owner = rec.from || { name: me().name, avatar: me().avatar, score: rec.me.score, correct: rec.me.correct, stats: rec.me.stats };
      var payload = rec.v === 2
        ? { v: 2, i: rec.id, s: rec.seed, g: rec.game, n: owner.name, a: owner.avatar, sc: owner.score,
            st: (owner.stats || []).slice(0, 3).map(function (x) { return [x.value, x.label]; }),
            d: rec.from ? rec.from.at : (rec.at ? Math.floor(rec.at / 3600000) : undefined) }
        : { v: 1, i: rec.id, s: rec.seed, k: rec.topic, n: owner.name, a: owner.avatar, sc: owner.score, c: owner.correct };
      var code = b64encode(payload);
      var base = window.location.protocol === 'file:' ? 'https://playmona.com/play' : window.location.origin + window.location.pathname;
      return base + '#challenge=' + code;
    },

    // Read and check a challenge code from a link.
    decode: function (code) {
      try {
        var p = b64decode(code);
        if (!p || (p.v !== 1 && p.v !== 2) || typeof p.i !== 'string' || typeof p.s !== 'string') return null;
        if (!/^[a-z0-9]{6,24}$/.test(p.i) || !/^[a-z0-9]{4,24}$/.test(p.s)) return null;
        var from = {
          name: cleanText(p.n || t('aFriend', 'A friend'), 24) || t('aFriend', 'A friend'),
          avatar: FF.Avatars.has(p.a) ? p.a : FF.Avatars.normalize(p.a, p.n)
        };
        if (p.v === 2) {
          if (typeof p.g !== 'string' || !/^[A-Za-z]{2,40}$/.test(p.g)) return null;
          from.score = Math.max(0, Math.min(BIG_SCORE, Math.round(Number(p.sc) || 0)));
          from.stats = (Array.isArray(p.st) ? p.st : []).slice(0, 3).filter(Array.isArray).map(function (x) {
            return { value: cleanText(x[0], 12), label: cleanText(x[1], 16) };
          });
          // d: when it was sent, in hours (never in the future).
          var hrs = Math.floor(Number(p.d));
          if (hrs > 0 && hrs * 3600000 <= Date.now() + 3600000) from.at = hrs;
          return { v: 2, id: p.i, seed: p.s, game: p.g, at: from.at ? from.at * 3600000 : null, from: from };
        }
        var topic = FF.QuizRun.topic(p.k).id;
        return {
          v: 1, id: p.i, seed: p.s, topic: topic,
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
      if (c.v === 2) {
        if (!this.playable(c)) { FF.UI.toast(t('chNotHere', 'This game is not in this version of PlayMona. Reload the page to update.'), { type: 'error' }); return; }
        FF.GameFlow.launch(c.game, { challenge: { id: c.id, seed: c.seed }, skipIntro: true });
        return;
      }
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

    /* A game just ended on a challenge-ready run: save it as a challenge to send.
       cur is FF.GameFlow.current; results is what the game ended with. */
    fromRun: function (cur, results) {
      results = results || {};
      var mine = FF.GameFlow && FF.GameFlow._myResult ? FF.GameFlow._myResult(results.results) : (results.results || [])[0];
      var rec = { id: FF.Random.newSeed() + FF.Random.newSeed(), v: 2, game: cur.def.id,
        seed: results.challengeSeed || cur.config.challengeSeed, role: 'sent', at: Date.now(),
        me: { score: Math.max(0, Math.round(mine ? mine.points || 0 : 0)), ms: 0, stats: this.stats(results) } };
      if (typeof results.quizCorrect === 'number') rec.me.correct = results.quizCorrect;
      this._put(rec);
      this._post(rec);
      return rec;
    },

    /* A friend's challenge game ended (or was left early: the points so far count). */
    finishRun: function (cur, points, results) {
      var id = cur.config.challenge.id;
      var c = this._incoming[id];
      if (!c || this.byId(id)) return;
      var rec = { id: c.id, v: 2, game: c.game, seed: c.seed, role: 'received', from: c.from, at: Date.now(),
        me: { score: Math.max(0, Math.round(points || 0)), ms: 0, stats: this.stats(results) } };
      if (results && typeof results.quizCorrect === 'number') rec.me.correct = results.quizCorrect;
      this._put(rec);
      delete this._incoming[id];
      this._post(rec);
    },

    // Share results so the sender can see who took them on (accounts only).
    _post: function (rec) {
      if (!FF.Cloud.available()) return;
      var who = me();
      var row = { name: who.name, avatar: who.avatar, ms: rec.me.ms || 0, t: Date.now() };
      if (rec.v === 2) {
        row.score = Math.min(BIG_SCORE, rec.me.score);
        row.game = rec.game;
        if (typeof rec.me.correct === 'number') row.correct = Math.min(1000, rec.me.correct);
      } else {
        row.score = Math.min(MAX_SCORE, rec.me.score);
        row.correct = rec.me.correct;
      }
      FF.Cloud.set('challenges/' + rec.id + '/' + who.uid, row).catch(function () {});
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

  // What a challenge is for: the game's name, or the quiz topic.
  function challengeName(c) {
    if (c.v === 2) return FF.Games.get(c.game) && FF.Leaderboards ? FF.Leaderboards.gameName(c.game) : c.game;
    return t('topic_' + c.topic, FF.QuizRun.topic(c.topic).name);
  }

  function loadingRow() {
    return FF.UI.loading(t('loading', 'Loading…'));
  }

  function allChallengesLink() {
    return FF.UI.button(t('allChallenges', 'All challenges'), { class: 'btn-ghost btn-sm social-back', icon: 'arrow-left', onClick: function () { FF.Nav.go('challenges'); } });
  }

  // The cover art behind a challenge: the game's, or Quiz Mix's for a quiz topic.
  function challengeArt(c) {
    var def = FF.Challenge.gameOf(c);
    var id = def ? def.id : 'familyQuiz';
    return { url: FF.Assets.artUrl('covers', id), wash: FF.Assets.wash(def ? def.category : 'quiz') };
  }

  function dayText(at) {
    if (!at) return t('chSentRecently', 'Recently');
    var d = new Date(at), now = new Date();
    var days = Math.round((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
    if (days <= 0) return t('today', 'Today');
    if (days === 1) return t('yesterday', 'Yesterday');
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  /* The golden ticket: game art and name, who sent it and their line, a tear,
     and the score to beat. who = { name, avatar, score, stats, tagline, at, preview } */
  function ticket(c, who) {
    var art = challengeArt(c);
    var card = FF.ui.el('article', { class: 'ch-ticket' + (who.preview ? ' ch-ticket--preview' : '') });
    var cover = FF.ui.div('ch-ticket__art');
    cover.style.setProperty('--art', art.url);
    cover.style.setProperty('--wash', art.wash);
    cover.appendChild(FF.ui.span('ch-ticket__chip', challengeName(c)));
    card.appendChild(cover);
    var head = FF.ui.div('ch-ticket__head');
    head.appendChild(FF.Players.avatarEl({ name: who.name, avatar: who.avatar }, 'ch-ticket__ava'));
    var txt = FF.ui.div('ch-ticket__text');
    txt.appendChild(FF.ui.el(who.preview ? 'h2' : 'h1', { class: 'ch-ticket__title' }, who.tagline.replace('{name}', who.name)));
    txt.appendChild(FF.ui.el('p', { class: 'ch-ticket__line' }, t('chLine', 'One go. Same {game}. Winner takes the bragging rights.', { game: challengeName(c) })));
    head.appendChild(txt);
    card.appendChild(head);
    card.appendChild(FF.ui.div('ch-ticket__tear'));
    var stub = FF.ui.div('ch-ticket__stub');
    var beat = FF.ui.div('ch-ticket__beat');
    beat.appendChild(FF.ui.span('ch-ticket__label', t('chScoreToBeat', 'Score to beat')));
    beat.appendChild(FF.ui.el('strong', { class: 'ch-ticket__score' }, fmt(who.score)));
    stub.appendChild(beat);
    var sentAt = FF.ui.div('ch-ticket__sent');
    sentAt.appendChild(FF.ui.span('ch-ticket__label', t('chSent', 'Sent')));
    sentAt.appendChild(FF.ui.el('strong', {}, dayText(who.at)));
    stub.appendChild(sentAt);
    card.appendChild(stub);
    if (who.stats && who.stats.length) {
      var st = FF.ui.el('ul', { class: 'ch-ticket__stats', 'aria-label': t('chTheirStats', 'Their game') });
      who.stats.forEach(function (s) {
        var li = FF.ui.el('li', {});
        li.appendChild(FF.ui.el('strong', {}, s.value));
        li.appendChild(FF.ui.span('', s.label));
        st.appendChild(li);
      });
      card.appendChild(st);
    }
    return card;
  }

  function reducedMotion() {
    return !FF.Settings.get('animations') || FF.Settings.get('reduceMotion');
  }

  // Count a score up from 0. rAF can be throttled (hidden tabs), so a timer finishes it too.
  function countUp(el, to) {
    if (reducedMotion() || !to) { el.textContent = fmt(to); return; }
    var start = Date.now(), dur = 900, done = false;
    function step() {
      if (done) return;
      var p = Math.min(1, (Date.now() - start) / dur);
      el.textContent = fmt(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p >= 1) { done = true; return; }
      if (window.requestAnimationFrame) requestAnimationFrame(step);
    }
    el.textContent = '0';
    step();
    setTimeout(function () { if (!done) { done = true; el.textContent = fmt(to); } }, dur + 200);
  }

  // Who won a received challenge, and by how much.
  function outcome(rec) {
    var mine = rec.me.score, theirs = rec.from.score;
    var hi = Math.max(mine, theirs);
    return { won: mine > theirs, lost: mine < theirs, margin: Math.abs(mine - theirs), close: hi > 0 && Math.abs(mine - theirs) <= hi * 0.05 };
  }

  // Play the same game again and send it back (a new challenge).
  function challengeBack(rec) {
    FF.Access.gate('challenge', function () {
      if (rec.v === 2) FF.GameFlow.launch(rec.game, { standard: true, skipIntro: true });
      else FF.Challenge.create(rec.topic);
    });
  }

  /* After playing a friend's challenge: both scores count up, then the verdict. */
  function reveal(rec, self, name, fresh) {
    var o = outcome(rec);
    var box = FF.ui.el('section', { class: 'ch-reveal' + (o.won ? ' ch-reveal--won' : '') });
    box.appendChild(FF.ui.span('ch-reveal__kicker', name));
    var title = o.won ? t('chYouBeat', 'You beat {name}!', { name: rec.from.name })
      : (o.lost ? t('chHoldsCrown', '{name} holds the crown', { name: rec.from.name }) : t('itsATie', 'It’s a tie!'));
    var h = FF.ui.el('h1', { class: 'ch-reveal__title' }, title);
    box.appendChild(h);
    var duel = FF.ui.div('vs-duel ch-reveal__duel');
    function side(who, score, win) {
      var s = FF.ui.div('vs-side' + (win ? ' is-win' : ''));
      var crown = FF.ui.span('ch-reveal__crown');
      if (win) crown.appendChild(icon('crown'));
      s.appendChild(crown);
      s.appendChild(FF.Players.avatarEl({ name: who.name, avatar: who.avatar }, 'vs-side__ava'));
      s.appendChild(FF.ui.el('strong', { class: 'vs-side__name' }, who.name));
      var sc = FF.ui.el('span', { class: 'vs-side__score' }, '0');
      s.appendChild(sc);
      countUp(sc, score);
      return s;
    }
    duel.appendChild(side({ name: self.name, avatar: self.avatar }, rec.me.score, o.won));
    duel.appendChild(FF.ui.span('vs-duel__vs ch-reveal__vs', 'VS'));
    duel.appendChild(side(rec.from, rec.from.score, o.lost));
    box.appendChild(duel);
    var line = o.won ? (o.close ? t('chWonClose', 'Only {n} points in it. Phew!', { n: fmt(o.margin) }) : t('chWonBy', 'You won by {n} points.', { n: fmt(o.margin) }))
      : (o.lost ? (o.close ? t('chLostClose', 'So close: just {n} points short.', { n: fmt(o.margin) }) : t('chLostBy', '{n} points short. Rematch?', { n: fmt(o.margin) }))
        : t('chTied', 'Exactly the same score. Go again?'));
    box.appendChild(FF.ui.el('p', { class: 'ch-reveal__line' }, line));
    var acts = FF.ui.div('social-actions');
    acts.appendChild(FF.UI.button(o.lost ? t('chRematch', 'Rematch') : t('challengeBack', 'Challenge them back'), { class: 'btn-lg btn-primary', icon: 'swords', onClick: function () { challengeBack(rec); } }));
    if (FF.ShareCard) acts.appendChild(FF.UI.button(t('chSaveImage', 'Save image'), { class: 'btn-lg', icon: 'image', onClick: function () { saveBrag(rec, 'result'); } }));
    acts.appendChild(FF.UI.button(t('shareResult', 'Share result'), { class: 'btn-lg', icon: 'share', onClick: function () {
      shareOrCopy('PlayMona', t('vsShareGame', 'I scored {a} vs {name}’s {b} in {game} on PlayMona.', { a: fmt(rec.me.score), name: rec.from.name, b: fmt(rec.from.score), game: name }), FF.Challenge.link(rec));
    } }));
    box.appendChild(acts);
    FF.UI.announce(title + '. ' + line);
    if (fresh && o.won && !reducedMotion() && FF.Confetti) setTimeout(function () { FF.Confetti.burst(140); if (FF.Confetti.sideCannons) FF.Confetti.sideCannons(); }, 700);
    return box;
  }

  // The brag image for a challenge (js/shareCard.js). kind: 'dare' (sent) | 'result' (received).
  function saveBrag(rec, kind) {
    if (!FF.ShareCard) return;
    var self = me();
    var art = challengeArt(rec);
    var name = challengeName(rec);
    var spec = { game: name, cover: art.url, wash: art.wash, footer: { url: FF.Challenge.link(rec) } };
    if (kind === 'dare') {
      spec.verdict = t('cardScored', '{name} scored {pts}', { name: self.name, pts: fmt(rec.me.score) });
      spec.sub = FF.Challenge.wording(rec.id).tagline.replace('{name}', self.name);
      spec.players = [{ name: self.name, avatar: self.avatar, score: rec.me.score, winner: false }, { name: t('you', 'You'), avatar: null, score: null, mystery: true }];
      spec.stats = rec.me.stats || [];
      spec.footer.hook = t('cardDareHook', 'Your turn. Same {game}.', { game: name });
      spec.footer.cta = t('cardScanAccept', 'Scan to accept');
    } else {
      var o = outcome(rec);
      var winner = o.won ? self.name : rec.from.name, loser = o.won ? rec.from.name : self.name;
      spec.verdict = o.won || o.lost
        ? (o.close ? t('cardHoldsCrown', '{name} holds the crown', { name: winner }) : t('cardBeat', '{a} beat {b} by {n} points!', { a: winner, b: loser, n: fmt(o.margin) }))
        : t('cardTie', '{a} and {b} tied!', { a: self.name, b: rec.from.name });
      spec.sub = t('cardSub', 'Same {game}. One go. No excuses.', { game: name });
      spec.players = [{ name: self.name, avatar: self.avatar, score: rec.me.score, winner: o.won }, { name: rec.from.name, avatar: rec.from.avatar, score: rec.from.score, winner: o.lost }];
      spec.stats = rec.me.stats || [];
      spec.confetti = o.won;
      spec.footer.hook = o.close && (o.won || o.lost) ? t('cardClose', 'Only {n} points in it', { n: fmt(o.margin) })
        : t('cardBeatHook', 'Think you can beat {pts}?', { pts: fmt(Math.max(rec.me.score, rec.from.score)) });
      spec.footer.cta = t('cardScanPlay', 'Scan to play');
    }
    FF.ShareCard.choose(spec, 'playmona-' + (rec.game || 'quiz') + '-' + rec.id.slice(0, 6));
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
        t('challengeSubAny', 'Play any game, then send the link. Your friend gets the same game and tries to beat your score.')));

      // Pick a game: it plays on the standard settings, and its results screen sends it.
      main.appendChild(FF.App.sectionHead(t('chPickGame', 'Pick a game')));
      var games = FF.Leaderboards.games().filter(function (g) { return !FF.Access || FF.Access.canPlay(g.id); });
      var quizCard = FF.ui.el('button', { type: 'button', class: 'topic-card ch-quiz-card' });
      var qic = FF.ui.span('topic-card__icon');
      qic.appendChild(icon('lightbulb'));
      quizCard.appendChild(qic);
      quizCard.appendChild(FF.ui.el('strong', { class: 'topic-card__name' }, t('chQuizTopic', 'Quiz by topic')));
      quizCard.appendChild(FF.ui.span('topic-card__desc', t('chQuizTopicDesc', '10 questions on a topic you pick.')));
      quizCard.addEventListener('click', function () { Views._topicSheet(); });
      main.appendChild(quizCard);
      main.appendChild(FF.App.gameGrid(games, { onPlay: function (def) {
        var played = FF.Recents && FF.Recents.get().some(function (r) { return r.id === def.id; });
        FF.GameFlow.launch(def.id, { standard: true, skipIntro: !!played });
      } }));

      var list = FF.Challenge.list();
      main.appendChild(FF.App.sectionHead(t('yourChallenges', 'Your challenges')));
      if (!list.length) {
        main.appendChild(FF.ui.el('p', { class: 'social-empty' }, t('noChallenges', 'Challenges you send and receive show up here.')));
        return;
      }
      Views._challengeList(main, list);
    },

    // The old quiz challenge: pick a topic, answer 10 questions.
    _topicSheet: function () {
      var grid = FF.ui.el('ul', { class: 'topic-grid' });
      var sheet = null;
      FF.QuizRun.TOPICS.forEach(function (tp) {
        var li = FF.ui.el('li', {});
        var b = FF.ui.el('button', { type: 'button', class: 'topic-card' });
        var ic = FF.ui.span('topic-card__icon');
        ic.appendChild(icon(tp.icon));
        b.appendChild(ic);
        b.appendChild(FF.ui.el('strong', { class: 'topic-card__name' }, t('topic_' + tp.id, tp.name)));
        b.appendChild(FF.ui.span('topic-card__desc', t('topicDesc_' + tp.id, tp.desc)));
        b.addEventListener('click', function () { if (sheet) sheet.close(); FF.Challenge.create(tp.id); });
        li.appendChild(b);
        grid.appendChild(li);
      });
      sheet = FF.UI.sheet({ title: t('pickTopic', 'Pick a topic'), body: grid });
    },

    _challengeList: function (main, list) {
      var ul = FF.ui.el('ul', { class: 'ch-list' });
      list.forEach(function (c) {
        var li = FF.ui.el('li', {});
        var b = FF.ui.el('button', { type: 'button', class: 'ch-row' });
        var other = c.role === 'received' ? c.from : null;
        b.appendChild(FF.Players.avatarEl(other ? { name: other.name, avatar: other.avatar } : { name: me().name, avatar: me().avatar }, 'ch-row__ava'));
        var txt = FF.ui.div('ch-row__text');
        var topicName = c.v === 2 ? challengeName(c) : t('topic_' + c.topic, FF.QuizRun.topic(c.topic).name);
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
      var self = me();

      if (!rec && !incoming) {
        main.appendChild(allChallengesLink());
        main.appendChild(FF.ui.el('p', { class: 'social-empty' }, t('challengeGone', 'This challenge is not on this device. Open the link again to play it.')));
        return;
      }

      // Someone challenged you and you have not played yet: the golden ticket.
      if (!rec) {
        var c = incoming;
        var words = C.wording(c.id);
        var wrap = FF.ui.el('section', { class: 'ch-invite' });
        wrap.appendChild(ticket(c, { name: c.from.name, avatar: c.from.avatar, score: c.from.score, stats: c.from.stats, tagline: words.tagline, at: c.at }));
        if (!C.playable(c)) {
          wrap.appendChild(FF.ui.el('p', { class: 'social-done' }, t('chNotHere', 'This game is not in this version of PlayMona. Reload the page to update.')));
        } else {
          wrap.appendChild(FF.UI.button(words.button, { class: 'btn-lg btn-primary btn-block', icon: 'swords', onClick: function () { C.accept(c.id); } }));
        }
        wrap.appendChild(FF.UI.button(t('notNow', 'Not now'), { class: 'btn-ghost btn-block', onClick: function () { FF.Nav.go('home'); } }));
        main.appendChild(wrap);
        return;
      }

      main.appendChild(allChallengesLink());
      var link = C.link(rec);
      var name = challengeName(rec);

      if (rec.role === 'received') {
        main.appendChild(reveal(rec, self, name, !!params.reveal));
        return;
      }

      // Your challenge: a preview of the ticket your friends get, and ways to send it.
      var sent = FF.ui.el('section', { class: 'ch-send' });
      sent.appendChild(FF.ui.el('h1', { class: 'ch-send__title' }, params.fresh ? t('niceRun', 'Nice run!') : t('youChallenged', 'Your challenge')));
      sent.appendChild(FF.ui.el('p', { class: 'ch-send__lead' }, t('sendLinkLeadGame', 'Send this to your friends. They play the same {game} and try to beat {pts}.', { game: name, pts: fmt(rec.me.score) })));
      sent.appendChild(ticket(rec, { name: self.name, avatar: self.avatar, score: rec.me.score, stats: rec.me.stats, tagline: C.wording(rec.id).tagline, at: rec.at, preview: true }));
      var text = rec.v === 2
        ? t('chShareTextGame', 'I scored {pts} in {game} on PlayMona. Can you beat me?', { pts: fmt(rec.me.score), game: name })
        : t('challengeShareText', 'I scored {pts} on PlayMona. Can you beat me?', { pts: fmt(rec.me.score) });
      var acts = FF.ui.div('social-actions ch-send__actions');
      acts.appendChild(FF.UI.button(t('sendChallenge', 'Send challenge'), { class: 'btn-lg btn-primary', icon: 'share', onClick: function () { shareOrCopy(t('challengeFriend', 'Challenge a friend'), text, link); } }));
      var wa = FF.ui.el('a', { class: 'btn btn-lg btn-wa', href: whatsappUrl(text, link), target: '_blank', rel: 'noopener' });
      wa.appendChild(icon('chat'));
      wa.appendChild(FF.ui.span('', 'WhatsApp'));
      acts.appendChild(wa);
      if (FF.ShareCard) acts.appendChild(FF.UI.button(t('chSaveImage', 'Save image'), { class: 'btn-lg', icon: 'image', onClick: function () { saveBrag(rec, 'dare'); } }));
      sent.appendChild(acts);
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
        holder.appendChild(board(rows, self.uid, { showCorrect: rec.v !== 2 }));
      }).catch(function () {
        FF.ui.clear(holder);
        holder.appendChild(cloudNote('offline'));
      });
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
