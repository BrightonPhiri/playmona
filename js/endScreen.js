/* PlayMona — the one end screen every game finishes on.
   Draw-only: FF.GameFlow.showResults builds the data, games send a
   `summary` through api.end (see docs/superpowers/specs/2026-11-27-one-settings-one-end-design.md). */
(function () {
  'use strict';
  var FF = window.FF = window.FF || {};

  var MAX_STATS = 6;
  var MAX_STATS_WITH_RING = 3;

  function t(key, fallback, vars) { return FF.t ? FF.t(key, fallback, vars) : fallback; }
  function num(n) { return FF.util && FF.util.formatNumber ? FF.util.formatNumber(n || 0) : String(n || 0); }
  function icon(key) { return FF.Icons && FF.Icons.icon ? FF.Icons.icon(key) : FF.ui.span('', ''); }

  function animate() {
    return !!(FF.Settings && FF.Settings.get && FF.Settings.get('animations') && !FF.Settings.get('reduceMotion'));
  }

  /* A copy of the summary with the limits applied. Over-limit input is trimmed, never refused. */
  function trim(summary) {
    if (!summary || typeof summary !== 'object') return {};
    var s = {};
    Object.keys(summary).forEach(function (k) { s[k] = summary[k]; });
    var stats = Array.isArray(s.stats) ? s.stats.filter(Boolean) : [];
    if (s.ring && typeof s.ring.value === 'number') {
      s.ring = { value: Math.max(0, Math.min(1, s.ring.value)), label: s.ring.label || '' };
      stats = stats.slice(0, MAX_STATS_WITH_RING);
    } else {
      delete s.ring;
      stats = stats.slice(0, MAX_STATS);
    }
    if (stats.length) s.stats = stats; else delete s.stats;
    if (s.panel && typeof s.panel.draw === 'function') delete s.rounds;
    else delete s.panel;
    if (!Array.isArray(s.rounds) || !s.rounds.length) delete s.rounds;
    return s;
  }

  function rankMedal(i) {
    if (i > 2) return FF.ui.span('end-rank', String(i + 1));
    var m = FF.ui.span('rank-medal rank-medal--' + (i + 1));
    m.appendChild(icon('medal'));
    return m;
  }

  function badge(tie) {
    var b = FF.ui.el('div', { class: 'end-badge result-badge result-badge--gold', 'aria-hidden': 'true' });
    b.appendChild(icon(tie ? 'users' : 'trophy'));
    return b;
  }

  function defaultTitle(ranked) {
    var top = ranked[0];
    if (!top) return t('wellPlayed', 'Well played!');
    if (ranked.length === 1) return t('wellPlayed', 'Well played!');
    var pts = top.points || 0;
    var tied = ranked.filter(function (r) { return (r.points || 0) === pts; }).length > 1;
    if (tied) return t('itsATie', 'It’s a tie!');
    return t('nrWins', '{name} wins!', { name: top.name });
  }

  // The big solo number. The final value is always in the DOM; it counts up only when animations are on.
  function bigScore(points) {
    var box = FF.ui.div('end-score');
    var n = FF.ui.span('end-score__value', num(points));
    box.appendChild(n);
    box.appendChild(FF.ui.span('end-score__label', t('endPoints', 'points')));
    if (animate() && points > 0 && typeof requestAnimationFrame === 'function') {
      var start = null, dur = 900;
      var step = function (ts) {
        if (start == null) start = ts;
        var k = Math.min(1, (ts - start) / dur);
        n.textContent = num(Math.round(points * (1 - Math.pow(1 - k, 3))));
        if (k < 1) requestAnimationFrame(step);
      };
      n.textContent = num(0);
      requestAnimationFrame(step);
    }
    return box;
  }

  function podium(ranked) {
    var box = FF.ui.div('end-podium');
    var order = ranked.length >= 3 ? [1, 0, 2] : [1, 0];
    order.forEach(function (i) {
      var r = ranked[i];
      if (!r) return;
      var step = FF.ui.div('end-podium__step end-podium__step--' + (i + 1));
      if (FF.Players && FF.Players.avatarEl) step.appendChild(FF.Players.avatarEl(r, 'end-podium__face'));
      step.appendChild(FF.ui.span('end-podium__name', r.name || ''));
      var block = FF.ui.div('end-podium__block');
      block.appendChild(rankMedal(i));
      block.appendChild(FF.ui.span('end-podium__pts', num(r.points)));
      step.appendChild(block);
      box.appendChild(step);
    });
    return box;
  }

  function table(ranked, lines) {
    var ol = FF.ui.el('ol', { class: 'end-table', 'aria-label': t('leaderboard', 'Leaderboard') });
    ranked.forEach(function (r, i) {
      var li = FF.ui.el('li', { class: 'end-row' + (i === 0 ? ' is-winner' : '') + (r.isMe ? ' is-me' : '') });
      li.appendChild(FF.ui.el('span', { class: 'end-row__rank', 'aria-label': t('place', 'Place {n}', { n: i + 1 }) }, rankMedal(i)));
      if (FF.Players && FF.Players.avatarEl) li.appendChild(FF.Players.avatarEl(r, 'end-row__face'));
      var who = FF.ui.span('end-row__who');
      who.appendChild(FF.ui.span('end-row__name', r.name || ''));
      var line = lines && r.id != null ? lines[r.id] : null;
      who.appendChild(FF.ui.span('end-row__line', line ? String(line) : ''));
      li.appendChild(who);
      li.appendChild(FF.ui.span('end-row__pts', num(r.points)));
      ol.appendChild(li);
    });
    return ol;
  }

  function stats(s) {
    var box = FF.ui.div('end-stats');
    if (s.ring) {
      var pct = Math.round(s.ring.value * 100);
      var ring = FF.ui.el('div', { class: 'end-ring', role: 'img', 'aria-label': s.ring.label + ' ' + pct + '%', style: { '--p': String(pct) } });
      ring.appendChild(FF.ui.span('end-ring__value', pct + '%'));
      ring.appendChild(FF.ui.span('end-ring__label', s.ring.label));
      box.appendChild(ring);
    }
    (s.stats || []).forEach(function (st) {
      var tile = FF.ui.div('end-stat');
      if (st.icon) tile.appendChild(icon(st.icon));
      tile.appendChild(FF.ui.span('end-stat__value', String(st.value == null ? '–' : st.value)));
      tile.appendChild(FF.ui.span('end-stat__label', String(st.label || '')));
      box.appendChild(tile);
    });
    return box;
  }

  var MARK_ICON = { right: 'check-circle', wrong: 'x-circle', skip: 'minus' };

  function panel(s) {
    var wide = false;
    try { wide = !!(window.matchMedia && window.matchMedia('(min-width: 768px)').matches); } catch (e) { wide = false; }
    var d = FF.ui.el('details', { class: 'end-panel disclosure' });
    if (wide) d.open = true;
    var title = s.panel ? (s.panel.title || t('endYourGame', 'Your game')) : t('endRoundByRound', 'Round by round');
    var sum = FF.ui.el('summary', {});
    sum.appendChild(FF.ui.span('', title));
    var chev = icon('chevron-down');
    if (chev.classList) chev.classList.add('disclosure__chev');
    sum.appendChild(chev);
    d.appendChild(sum);
    var body = FF.ui.div('end-panel__body');
    if (s.panel) {
      try { s.panel.draw(body); } catch (e) { if (window.console) console.error('[FF.EndScreen panel]', e); }
    } else {
      var ol = FF.ui.el('ol', { class: 'end-rounds' });
      s.rounds.forEach(function (r) {
        var li = FF.ui.el('li', { class: 'end-round' + (r.mark ? ' end-round--' + r.mark : '') });
        if (r.mark && MARK_ICON[r.mark]) li.appendChild(icon(MARK_ICON[r.mark]));
        li.appendChild(FF.ui.span('end-round__label', String(r.label || '')));
        if (r.note) li.appendChild(FF.ui.span('end-round__note', String(r.note)));
        if (r.points != null) li.appendChild(FF.ui.span('end-round__pts', num(r.points)));
        ol.appendChild(li);
      });
      body.appendChild(ol);
    }
    d.appendChild(body);
    return d;
  }

  function earned(data) {
    var box = FF.ui.el('section', { class: 'end-earned', 'aria-label': t('endEarned', 'What you earned') });
    box.appendChild(FF.ui.el('h2', { class: 'end-earned__title' }, t('endEarned', 'What you earned')));
    if (data.xp) {
      var xp = FF.ui.div('end-xp');
      xp.appendChild(FF.ui.span('end-xp__gain', t('endXp', '+{n} XP', { n: num(data.xp.gained) })));
      var lv = FF.Stats && FF.Stats.level ? FF.Stats.level(data.xp.total || 0) : null;
      if (lv) {
        xp.appendChild(FF.ui.span('end-xp__level', t('endLevel', 'Level {n}', { n: lv.level })));
        var bar = FF.ui.el('div', { class: 'end-xp__bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(lv.need), 'aria-valuenow': String(lv.into) });
        bar.appendChild(FF.ui.el('span', { class: 'end-xp__fill', style: { width: Math.round((lv.progress || 0) * 100) + '%' } }));
        xp.appendChild(bar);
        xp.appendChild(FF.ui.span('end-xp__into', lv.into + ' / ' + lv.need));
      }
      box.appendChild(xp);
    }
    var places = FF.ui.div('end-places');
    if (data.placesPending) places.appendChild(FF.ui.el('p', { class: 'end-places__checking' }, t('endChecking', 'Checking the leaderboard…')));
    box.appendChild(places);
    return { box: box, places: places };
  }

  function actionsRow(actions) {
    var row = FF.ui.div('end-actions');
    (actions || []).forEach(function (a) {
      var b = FF.UI.button(a.label, { class: 'btn-lg' + (a.primary ? ' btn-primary' : ''), icon: a.icon, onClick: a.onClick });
      if (a.id) b.dataset.action = a.id;
      row.appendChild(b);
    });
    return row;
  }

  function render(container, data) {
    data = data || {};
    var ranked = data.ranked || [];
    var s = trim(data.summary);
    FF.ui.clear(container);
    var root = FF.ui.el('main', { class: 'end-screen', 'aria-labelledby': 'end-title' });

    var top = ranked[0];
    var tie = ranked.length > 1 && top && ranked.filter(function (r) { return (r.points || 0) === (top.points || 0); }).length > 1;
    root.appendChild(badge(tie));
    if (s.kicker) root.appendChild(FF.ui.el('p', { class: 'end-kicker' }, String(s.kicker)));
    var title = s.headline || data.title || defaultTitle(ranked);
    root.appendChild(FF.ui.el('h1', { class: 'end-title', id: 'end-title' }, String(title)));

    if (ranked.length === 1) {
      root.appendChild(bigScore(top.points || 0));
    } else if (ranked.length > 1) {
      root.appendChild(podium(ranked));
      root.appendChild(table(ranked, s.lines));
    }
    if (s.best) {
      if (s.best.isNew) root.appendChild(FF.ui.el('p', { class: 'end-best end-best--new' }, t('endNewBest', 'New personal best!')));
      else if (s.best.value != null) root.appendChild(FF.ui.el('p', { class: 'end-best' }, t('endYourBest', 'Your best on these settings: {n}', { n: num(s.best.value) })));
    }
    if (s.stats || s.ring) root.appendChild(stats(s));

    var earn = null;
    if (data.xp || data.placesPending) {
      earn = earned(data);
      root.appendChild(earn.box);
    }
    if (s.panel || s.rounds) root.appendChild(panel(s));
    if (data.note) {
      var note = FF.ui.div('end-note');
      if (typeof data.note === 'string') note.textContent = data.note;
      else note.appendChild(data.note);
      root.appendChild(note);
    }
    root.appendChild(actionsRow(data.actions));
    container.appendChild(root);

    if (FF.UI && FF.UI.announce && top) {
      FF.UI.announce(ranked.length === 1 ? t('endAnnounceSolo', '{n} points', { n: top.points || 0 }) : t('winnerIs', '{name} wins with {n} points', { name: top.name, n: top.points || 0 }));
    }

    return {
      root: root,
      // The leaderboard place may arrive after the screen draws, or after the player left it.
      setPlaces: function (lines) {
        if (!root.isConnected || !earn) return;
        FF.ui.clear(earn.places);
        lines = (lines || []).filter(function (p) { return p && p.rank; });
        if (!lines.length) {
          if (!data.xp && earn.box.parentNode) earn.box.parentNode.removeChild(earn.box);
          return;
        }
        var LB = FF.Leaderboards;
        var n = LB && LB.threshold ? LB.threshold() : 10;
        lines.forEach(function (p) {
          var line = FF.ui.el('p', { class: 'end-place' });
          line.appendChild(icon('trophy'));
          line.appendChild(FF.ui.span('', LB && LB.placeLine ? LB.placeLine(p, data.gameId, n) : '#' + p.rank));
          earn.places.appendChild(line);
        });
      }
    };
  }

  FF.EndScreen = { trim: trim, render: render, MAX_STATS: MAX_STATS };
})();
