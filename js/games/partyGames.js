/* ============================================================
   FAMILY FUN — partyGames.js
   Party voting games: Would You Rather?, This or That, and
   Who Is Most Likely. Classic script (no ES modules).
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  /* ================= shared helpers ================= */

  var STYLE_ID = 'party-games-style';

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      '.pg-root { display:flex; flex-direction:column; align-items:center; gap:18px; padding:8px 4px 30px; text-align:center; max-width:900px; margin:0 auto; }' +
      '.pg-round { font-size:0.8rem; font-weight:800; letter-spacing:.12em; text-transform:uppercase; color:var(--muted); }' +
      '.pg-prompt { font-size:clamp(1.5rem,4.5vw,2.3rem); font-weight:800; line-height:1.2; color:var(--text); }' +
      '.pg-question { font-size:clamp(1.1rem,3vw,1.6rem); font-weight:700; color:var(--accent); max-width:760px; line-height:1.35; }' +
      '.pg-choices { display:flex; gap:14px; width:100%; flex-wrap:wrap; justify-content:center; }' +
      '.pg-choice { flex:1 1 230px; min-width:210px; max-width:360px; display:flex; flex-direction:column; align-items:center; gap:10px; padding:24px 16px; border-radius:var(--radius); border:2px solid var(--border); background:var(--surface); color:var(--text); cursor:pointer; font:inherit; box-shadow:var(--shadow); transition:transform .15s ease, border-color .15s ease, box-shadow .15s ease; }' +
      '.pg-choice:hover, .pg-choice:focus-visible { transform:translateY(-4px); border-color:var(--accent); box-shadow:var(--shadow-lg); }' +
      '.pg-choice__tag { font-size:0.72rem; font-weight:800; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); }' +
      '.pg-choice__icon { font-size:3rem; line-height:1; }' +
      '.pg-choice__text { font-size:1.15rem; font-weight:700; line-height:1.3; }' +
      '.pg-voter { display:flex; align-items:center; gap:8px; font-size:1.15rem; font-weight:800; color:var(--text); }' +
      '.pg-voter__avatar { font-size:1.7rem; }' +
      '.pg-chiprow { display:flex; flex-wrap:wrap; gap:8px; justify-content:center; }' +
      '.pg-chip { display:inline-flex; align-items:center; gap:6px; padding:6px 13px; border-radius:999px; background:var(--surface-2); border:1px solid var(--border); color:var(--muted); font-size:0.88rem; font-weight:700; }' +
      '.pg-chip--current { border-color:var(--accent); color:var(--text); box-shadow:0 0 0 3px var(--accent-soft); }' +
      '.pg-chip--done { color:var(--success); }' +
      '.pg-results { width:100%; max-width:680px; display:flex; flex-direction:column; gap:12px; }' +
      '.pg-row { display:flex; flex-direction:column; gap:6px; background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-sm); padding:12px 14px; box-shadow:var(--shadow); }' +
      '.pg-row--win { border-color:var(--warn); box-shadow:0 0 0 3px var(--accent-soft), var(--shadow); }' +
      '.pg-row__top { display:flex; align-items:center; justify-content:space-between; gap:12px; }' +
      '.pg-row__label { display:flex; align-items:center; gap:8px; font-weight:700; color:var(--text); font-size:1rem; text-align:left; flex:1; }' +
      '.pg-row__emoji { font-size:1.5rem; flex:0 0 auto; }' +
      '.pg-row__count { font-weight:800; color:var(--muted); font-variant-numeric:tabular-nums; white-space:nowrap; }' +
      '.pg-row--win .pg-row__count { color:var(--warn); }' +
      '.pg-row__track { height:20px; border-radius:999px; background:var(--surface-2); overflow:hidden; }' +
      '.pg-row__fill { height:100%; width:0%; border-radius:999px; transition:width .7s cubic-bezier(.22,.8,.36,1); }' +
      '.pg-big-emoji { font-size:4.5rem; line-height:1; }' +
      '.pg-note { color:var(--muted); font-weight:700; font-size:0.95rem; max-width:640px; }' +
      '.pg-cands { display:flex; flex-wrap:wrap; gap:12px; justify-content:center; }' +
      '.pg-cand { display:flex; flex-direction:column; align-items:center; gap:6px; padding:14px 16px; min-width:120px; border-radius:var(--radius-sm); border:2px solid var(--border); background:var(--surface); color:var(--text); cursor:pointer; font:inherit; box-shadow:var(--shadow); transition:transform .15s ease, border-color .15s ease; }' +
      '.pg-cand:hover, .pg-cand:focus-visible { transform:translateY(-3px); border-color:var(--accent); }' +
      '.pg-cand__avatar { font-size:2rem; }' +
      '.pg-cand__name { font-weight:700; font-size:0.95rem; }' +
      '.pg-actions { display:flex; gap:14px; justify-content:center; flex-wrap:wrap; margin-top:4px; }' +
      '.pg-exit { max-width:560px; margin:8vh auto; text-align:center; background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:34px 26px; box-shadow:var(--shadow); }' +
      '.pg-exit__emoji { font-size:3.4rem; }' +
      '.pg-exit__title { font-size:1.6rem; font-weight:800; margin:10px 0 6px; color:var(--text); }' +
      '.pg-exit__body { color:var(--muted); margin-bottom:20px; }';
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function getParty() {
    return (window.FF && window.FF.data && window.FF.data.party) ? window.FF.data.party : null;
  }

  function bonusMul(difficulty) {
    if (difficulty === 'hard') return 2;
    if (difficulty === 'normal') return 1.5;
    return 1; // easy (and any unknown value)
  }

  // Pick `count` distinct-ish rounds, cycling if the pool is smaller.
  function pickRounds(list, count) {
    var arr = FF.util.shuffle(list);
    var out = [];
    for (var i = 0; i < count; i++) out.push(arr[i % arr.length]);
    return out;
  }

  // Map an individual player id to the entity that should receive points
  // (the player itself in "everyone" mode, their team in "team" mode).
  function scorerForPlayer(api, playerId) {
    if (api.config.mode === 'team') {
      var scorers = api.config.scorers || [];
      for (var i = 0; i < scorers.length; i++) {
        var s = scorers[i];
        if (s.players && s.players.indexOf(playerId) !== -1) return s.id;
      }
    }
    return playerId;
  }

  function friendlyExit(api, title, body) {
    ensureStyle();
    api.ui.clear(api.shell.root);
    var wrap = api.ui.el('div', { class: 'pg-exit' });
    wrap.appendChild(api.ui.el('div', { class: 'pg-exit__emoji' }, '😅'));
    wrap.appendChild(api.ui.el('h2', { class: 'pg-exit__title' }, title));
    wrap.appendChild(api.ui.el('p', { class: 'pg-exit__body' }, body));
    wrap.appendChild(api.ui.button('🏠 Back to Home', {
      primary: true,
      class: 'btn-lg',
      onClick: function () { api.audio.play('click'); FF.GameFlow.exitToHome(); }
    }));
    api.shell.root.appendChild(wrap);
    if (FF.Nav && FF.Nav.focusFirst) { try { FF.Nav.focusFirst(wrap); } catch (e) {} }
  }

  // Row of voter chips showing who has voted / is voting now / is pending.
  function chipRow(api, voters, votes, currentIndex) {
    var wrap = api.ui.div('pg-chiprow');
    voters.forEach(function (p, i) {
      var cls = 'pg-chip';
      var marker;
      if (votes[p.id]) { cls += ' pg-chip--done'; marker = '✓'; }
      else if (i === currentIndex) { cls += ' pg-chip--current'; marker = '🗳️'; }
      else { marker = '⏳'; }
      wrap.appendChild(api.ui.el('span', { class: cls }, [
        api.ui.el('span', {}, marker + ' '),
        api.ui.el('span', {}, p.avatar || '😀'),
        ' ' + p.name
      ]));
    });
    return wrap;
  }

  function choiceCard(api, icon, text, tag, onClick) {
    return api.ui.el('button', {
      class: 'pg-choice',
      type: 'button',
      onclick: onClick,
      'aria-label': (tag ? tag + ': ' : '') + text
    }, [
      api.ui.el('span', { class: 'pg-choice__tag' }, tag),
      api.ui.el('span', { class: 'pg-choice__icon' }, icon || '❓'),
      api.ui.el('span', { class: 'pg-choice__text' }, text)
    ]);
  }

  // Animated percentage bars. rows: [{icon,label,count,color,win}]
  function revealBars(api, rows, animate) {
    var wrap = api.ui.el('div', { class: 'pg-results' });
    var total = 0;
    rows.forEach(function (r) { total += r.count; });
    rows.forEach(function (r) {
      var pct = total > 0 ? Math.round(r.count / total * 100) : 0;
      var row = api.ui.el('div', { class: 'pg-row' + (r.win ? ' pg-row--win' : '') });
      var top = api.ui.el('div', { class: 'pg-row__top' });
      top.appendChild(api.ui.el('span', { class: 'pg-row__label' }, [
        api.ui.el('span', { class: 'pg-row__emoji' }, r.icon || ''),
        r.label
      ]));
      top.appendChild(api.ui.el('span', { class: 'pg-row__count' }, r.count + ' · ' + pct + '%'));
      var track = api.ui.el('div', { class: 'pg-row__track' });
      var fill = api.ui.el('div', { class: 'pg-row__fill', style: { background: r.color || 'var(--accent)' } });
      track.appendChild(fill);
      row.appendChild(top);
      row.appendChild(track);
      wrap.appendChild(row);
      if (animate) {
        setTimeout(function () { fill.style.width = pct + '%'; }, 50);
      } else {
        fill.style.width = pct + '%';
      }
    });
    return wrap;
  }

  /* ============ shared engine for the two choice games ============ */

  // opts: { dataKey, roundCount, points, prompt, bigEmoji, emptyTitle, emptyBody, colorA, colorB }
  function runChoiceGame(api, opts) {
    ensureStyle();
    var party = getParty(api);
    var data = party && party[opts.dataKey];
    if (!data || !data.length) {
      friendlyExit(api, opts.emptyTitle, opts.emptyBody);
      return;
    }
    var rounds = pickRounds(data, opts.roundCount);
    var players = api.config.players.slice();
    var animate = !!api.config.animations;
    var b = bonusMul(api.config.difficulty);
    var basePts = opts.points;

    function playRound(index) {
      if (index >= rounds.length) { finish(); return; }
      var item = rounds[index];
      var voters = players.slice();
      var votes = {};
      var aCount = 0;
      var bCount = 0;
      var voterIndex = 0;

      function renderVote() {
        var current = voters[voterIndex];
        var root = api.ui.el('div', { class: 'pg-root' });
        root.appendChild(api.ui.el('div', { class: 'pg-round' }, 'Round ' + (index + 1) + ' of ' + rounds.length));
        root.appendChild(api.ui.el('div', { class: 'pg-prompt' }, opts.prompt));

        var choices = api.ui.div('pg-choices');
        choices.appendChild(choiceCard(api, item.aIcon, item.a, 'Option A', function () { vote('a'); }));
        choices.appendChild(choiceCard(api, item.bIcon, item.b, 'Option B', function () { vote('b'); }));
        root.appendChild(choices);

        root.appendChild(api.ui.el('div', { class: 'pg-voter' }, [
          api.ui.el('span', { class: 'pg-voter__avatar' }, current.avatar || '😀'),
          current.name + ', pick your choice!'
        ]));

        root.appendChild(chipRow(api, voters, votes, voterIndex));

        api.ui.clear(api.shell.root);
        api.shell.root.appendChild(root);
      }

      function vote(choice) {
        if (voterIndex >= voters.length) return;
        var player = voters[voterIndex];
        votes[player.id] = choice;
        if (choice === 'a') aCount++; else bCount++;
        api.audio.play('tap');
        voterIndex++;
        if (voterIndex < voters.length) renderVote();
        else reveal();
      }

      function reveal() {
        api.audio.play('roundEnd');
        var tie = aCount === bCount;
        var majority = aCount > bCount ? 'a' : 'b';

        // Award: everyone who sided with the majority choice earns points.
        var winners = [];
        voters.forEach(function (p) {
          var v = votes[p.id];
          if (tie || v === majority) winners.push(p.id);
        });
        var byScorer = {};
        winners.forEach(function (pid) {
          var sid = scorerForPlayer(api, pid);
          byScorer[sid] = (byScorer[sid] || 0) + 1;
        });
        Object.keys(byScorer).forEach(function (sid) {
          api.scoring.add(sid, Math.round(basePts * b) * byScorer[sid]);
        });
        api.shell.updateScores();

        var root = api.ui.el('div', { class: 'pg-root' });
        root.appendChild(api.ui.el('div', { class: 'pg-round' }, 'Round ' + (index + 1) + ' results'));

        if (opts.bigEmoji) {
          var emoji = tie ? (item.aIcon + ' ' + item.bIcon) : (majority === 'a' ? item.aIcon : item.bIcon);
          root.appendChild(api.ui.el('div', { class: 'pg-big-emoji' }, emoji));
        } else {
          root.appendChild(api.ui.el('div', { class: 'pg-prompt' }, opts.prompt));
        }

        root.appendChild(revealBars(api, [
          { icon: item.aIcon, label: item.a, count: aCount, color: opts.colorA || '#8b5cf6', win: tie || majority === 'a' },
          { icon: item.bIcon, label: item.b, count: bCount, color: opts.colorB || '#3b82f6', win: tie || majority === 'b' }
        ], animate));

        var note = tie
          ? "It's a tie! Everyone earns " + Math.round(basePts * b) + ' points.'
          : 'Majority picked ' + (majority === 'a' ? item.a : item.b) + ' — each of them earns ' + Math.round(basePts * b) + ' points!';
        root.appendChild(api.ui.el('div', { class: 'pg-note' }, note));

        var actions = api.ui.div('pg-actions');
        actions.appendChild(api.ui.button(index + 1 >= rounds.length ? '🏁 See Final Results' : '▶ Next Round', {
          primary: true,
          class: 'btn-lg',
          onClick: function () { api.audio.play('click'); playRound(index + 1); }
        }));
        root.appendChild(actions);

        api.ui.clear(api.shell.root);
        api.shell.root.appendChild(root);
      }

      renderVote();
    }

    function finish() {
      var ranked = api.scoring.ranked();
      api.end({
        results: ranked,
        winnerId: ranked.length ? ranked[0].id : null
      });
    }

    playRound(0);
  }

  /* ============ Who Is Most Likely? ============ */

  function runWhoIsMostLikely(api) {
    ensureStyle();
    var party = getParty(api);
    var data = party && party.whoIsMostLikely;
    if (!data || !data.length) {
      friendlyExit(api, 'No prompts yet', 'Who Is Most Likely prompts are missing. Please add the party data pack.');
      return;
    }
    var players = api.config.players.slice();
    if (players.length < 3) {
      friendlyExit(api, 'Need at least 3 players', 'Who Is Most Likely is best with 3 or more players. Add another player and try again!');
      return;
    }
    var rounds = pickRounds(data, 8);
    var animate = !!api.config.animations;
    var b = bonusMul(api.config.difficulty);

    function playRound(index) {
      if (index >= rounds.length) { finish(); return; }
      var prompt = rounds[index];
      var voters = players.slice();
      var votes = {}; // voterId -> candidateId
      var voterIndex = 0;

      function renderVote() {
        var current = voters[voterIndex];
        var root = api.ui.el('div', { class: 'pg-root' });
        root.appendChild(api.ui.el('div', { class: 'pg-round' }, 'Round ' + (index + 1) + ' of ' + rounds.length));
        root.appendChild(api.ui.el('div', { class: 'pg-prompt' }, 'Who is most likely to…'));
        root.appendChild(api.ui.el('div', { class: 'pg-question' }, prompt));

        root.appendChild(api.ui.el('div', { class: 'pg-voter' }, [
          api.ui.el('span', { class: 'pg-voter__avatar' }, current.avatar || '😀'),
          current.name + ', cast your vote!'
        ]));

        var cands = api.ui.div('pg-cands');
        players.forEach(function (cand) {
          if (cand.id === current.id) return; // can't vote for yourself
          cands.appendChild(api.ui.el('button', {
            class: 'pg-cand',
            type: 'button',
            onclick: function () { vote(cand.id); },
            'aria-label': 'Vote for ' + cand.name
          }, [
            api.ui.el('span', { class: 'pg-cand__avatar' }, cand.avatar || '😀'),
            api.ui.el('span', { class: 'pg-cand__name' }, cand.name)
          ]));
        });
        root.appendChild(cands);

        root.appendChild(chipRow(api, voters, votes, voterIndex));

        api.ui.clear(api.shell.root);
        api.shell.root.appendChild(root);
      }

      function vote(candidateId) {
        if (voterIndex >= voters.length) return;
        votes[voters[voterIndex].id] = candidateId;
        api.audio.play('tap');
        voterIndex++;
        if (voterIndex < voters.length) renderVote();
        else reveal();
      }

      function reveal() {
        api.audio.play('roundEnd');
        var counts = {};
        players.forEach(function (p) { counts[p.id] = 0; });
        voters.forEach(function (v) {
          var c = votes[v.id];
          if (c) counts[c] = (counts[c] || 0) + 1;
        });

        var maxVotes = 0;
        players.forEach(function (p) { if (counts[p.id] > maxVotes) maxVotes = counts[p.id]; });
        var winners = players.filter(function (p) { return counts[p.id] === maxVotes && maxVotes > 0; });

        // Award: the most-voted player earns +100 per vote; every voter earns +30.
        winners.forEach(function (w) {
          api.scoring.add(w.id, Math.round(100 * b) * (counts[w.id] || 0));
        });
        voters.forEach(function (v) {
          api.scoring.add(v.id, Math.round(30 * b));
        });
        api.shell.updateScores();

        var root = api.ui.el('div', { class: 'pg-root' });
        root.appendChild(api.ui.el('div', { class: 'pg-round' }, 'Round ' + (index + 1) + ' results'));
        root.appendChild(api.ui.el('div', { class: 'pg-prompt' }, 'Who is most likely to…'));
        root.appendChild(api.ui.el('div', { class: 'pg-question' }, prompt));

        var rows = players.slice().sort(function (a, c) { return (counts[c.id] || 0) - (counts[a.id] || 0); }).map(function (p) {
          return {
            icon: p.avatar || '😀',
            label: p.name,
            count: counts[p.id] || 0,
            color: p.color || '#8b5cf6',
            win: counts[p.id] === maxVotes && maxVotes > 0
          };
        });
        root.appendChild(revealBars(api, rows, animate));

        var headline;
        if (winners.length === 1) {
          headline = '🏆 ' + winners[0].name + ' is most likely! (+' + Math.round(100 * b) + ' per vote)';
        } else {
          headline = "🤝 It's a tie! " + winners.map(function (w) { return w.name; }).join(' & ') + ' share the crown.';
        }
        root.appendChild(api.ui.el('div', { class: 'pg-note' }, headline));
        root.appendChild(api.ui.el('div', { class: 'pg-note' }, 'Every voter earns ' + Math.round(30 * b) + ' points.'));

        var actions = api.ui.div('pg-actions');
        actions.appendChild(api.ui.button(index + 1 >= rounds.length ? '🏁 See Final Results' : '▶ Next Round', {
          primary: true,
          class: 'btn-lg',
          onClick: function () { api.audio.play('click'); playRound(index + 1); }
        }));
        root.appendChild(actions);

        api.ui.clear(api.shell.root);
        api.shell.root.appendChild(root);
      }

      renderVote();
    }

    function finish() {
      var ranked = api.scoring.ranked();
      api.end({
        results: ranked,
        winnerId: ranked.length ? ranked[0].id : null
      });
    }

    playRound(0);
  }

  /* ================= registrations ================= */

  FF.registerGame({
    id: 'wouldYouRather',
    name: 'Would You Rather?',
    description: 'Pick between two wild options — side with the crowd to score!',
    category: 'party',
    icon: '🤔',
    players: [2, 8],
    difficulty: 'Easy',
    duration: 5,
    tags: ['voting', 'party'],
    modes: ['everyone', 'team'],
    defaultMode: 'everyone',
    howToPlay: [
      'Read the two "Would you rather" options.',
      'Each player picks their favourite option.',
      'The option chosen by the most players wins the round.',
      'Everyone on the winning side scores points.'
    ],
    display: true,
    displayStart: function (api) {
      var party = getParty();
      var data = party && party.wouldYouRather;
      if (!data || !data.length) { friendlyExit(api, 'No questions yet', 'Would You Rather questions are missing. Please add the party data pack and try again.'); return; }
      FF.Display.deck(api, {
        title: 'Would You Rather?',
        tag: '👥 EVERYONE PLAYS — DISCUSS & CHOOSE',
        items: data,
        interval: 45,
        render: function (item) {
          var wrap = FF.ui.div('dsp-choices');
          wrap.appendChild(FF.ui.el('div', { class: 'dsp-choice' }, [
            FF.ui.div('dsp-choice__icon', item.aIcon || '🏝️'),
            FF.ui.div('dsp-choice__text', item.a)
          ]));
          wrap.appendChild(FF.ui.el('div', { class: 'dsp-choice' }, [
            FF.ui.div('dsp-choice__icon', item.bIcon || '🏔️'),
            FF.ui.div('dsp-choice__text', item.b)
          ]));
          return wrap;
        },
        label: function () { return 'Would you rather…'; }
      });
    },
    start: function (api) {
      runChoiceGame(api, {
        dataKey: 'wouldYouRather',
        roundCount: 8,
        points: 50,
        prompt: 'Would you rather…',
        bigEmoji: false,
        emptyTitle: 'No questions yet',
        emptyBody: 'Would You Rather questions are missing. Please add the party data pack and try again.',
        colorA: '#8b5cf6',
        colorB: '#3b82f6'
      });
    }
  });

  FF.registerGame({
    id: 'thisOrThat',
    name: 'This or That',
    description: 'A lightning round of quick either-or picks. Go with the majority to win!',
    category: 'party',
    icon: '⚡',
    players: [2, 8],
    difficulty: 'Easy',
    duration: 4,
    tags: ['quick', 'voting'],
    modes: ['everyone'],
    defaultMode: 'everyone',
    howToPlay: [
      'See two emoji choices.',
      'Each player picks one quickly.',
      'The most popular choice wins the round.',
      'Voters on the winning side score points.'
    ],
    display: true,
    displayStart: function (api) {
      var party = getParty();
      var data = party && party.thisOrThat;
      if (!data || !data.length) { friendlyExit(api, 'No picks yet', 'This or That choices are missing. Please add the party data pack and try again.'); return; }
      FF.Display.deck(api, {
        title: 'This or That',
        tag: '👥 EVERYONE PLAYS — QUICK PICKS',
        items: data,
        interval: 20,
        render: function (item) {
          var wrap = FF.ui.div('dsp-choices');
          wrap.appendChild(FF.ui.el('div', { class: 'dsp-choice' }, [
            FF.ui.div('dsp-choice__icon', item.aIcon || '1️⃣'),
            FF.ui.div('dsp-choice__text', item.a)
          ]));
          wrap.appendChild(FF.ui.el('div', { class: 'dsp-choice' }, [
            FF.ui.div('dsp-choice__icon', item.bIcon || '2️⃣'),
            FF.ui.div('dsp-choice__text', item.b)
          ]));
          return wrap;
        },
        label: function () { return 'This or that?'; }
      });
    },
    start: function (api) {
      runChoiceGame(api, {
        dataKey: 'thisOrThat',
        roundCount: 10,
        points: 40,
        prompt: 'This or that?',
        bigEmoji: true,
        emptyTitle: 'No picks yet',
        emptyBody: 'This or That choices are missing. Please add the party data pack and try again.',
        colorA: '#f97316',
        colorB: '#10b981'
      });
    }
  });

  FF.registerGame({
    id: 'whoIsMostLikely',
    name: 'Who Is Most Likely?',
    description: 'Vote for the friend who is most likely to do each silly thing.',
    category: 'party',
    icon: '🎯',
    players: [3, 8],
    difficulty: 'Easy',
    duration: 5,
    tags: ['voting', 'party'],
    modes: ['everyone'],
    defaultMode: 'everyone',
    howToPlay: [
      'Read the prompt aloud.',
      'Each player secretly votes for another player.',
      'The most-voted player earns big points.',
      'Every voter also earns points.'
    ],
    display: true,
    displayStart: function (api) {
      var party = getParty();
      var data = party && party.whoIsMostLikely;
      if (!data || !data.length) { friendlyExit(api, 'No prompts yet', 'Who Is Most Likely prompts are missing. Please add the party data pack.'); return; }
      FF.Display.deck(api, {
        title: 'Who Is Most Likely?',
        tag: '👥 EVERYONE PLAYS — POINT & DISCUSS',
        items: data,
        interval: 40,
        render: function (prompt) {
          return [FF.ui.div('dsp-sub', 'Who is most likely to…'), FF.ui.div('dsp-word', prompt)];
        },
        label: function () { return 'Everyone points at their pick — count points manually.'; }
      });
    },
    start: function (api) {
      runWhoIsMostLikely(api);
    }
  });
})();
