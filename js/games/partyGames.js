/* ============================================================
   PLAYMONA — partyGames.js
   Party voting games: Would You Rather?, This or That, and
   Who Is Most Likely. Classic script (no ES modules).
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  /* ================= shared helpers ================= */



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
    api.ui.clear(api.shell.root);
    var wrap = api.ui.el('div', { class: 'pg-exit' });
    wrap.appendChild(api.ui.el('div', { class: 'pg-exit__emoji' }, FF.Icons.icon('alert')));
    wrap.appendChild(api.ui.el('h2', { class: 'pg-exit__title' }, title));
    wrap.appendChild(api.ui.el('p', { class: 'pg-exit__body' }, body));
    wrap.appendChild(FF.UI.button('Back to home', { icon: 'house',
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
      if (votes[p.id]) { cls += ' pg-chip--done'; marker = 'check-circle'; }
      else if (i === currentIndex) { cls += ' pg-chip--current'; marker = 'pencil'; }
      else { marker = 'clock'; }
      wrap.appendChild(api.ui.el('span', { class: cls }, [
        FF.Icons.icon(marker),
        FF.Players.avatarEl(p, 'pg-chip__ava'),
        p.name
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
        r.player ? FF.Players.avatarEl(r.player, 'pg-row__ava') : api.ui.el('span', { class: 'pg-row__emoji' }, r.icon || ''),
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
    var party = getParty(api);
    var data = party && party[opts.dataKey];
    if (!data || !data.length) {
      friendlyExit(api, opts.emptyTitle, opts.emptyBody);
      return;
    }
    if (FF.Race && FF.Race.active && FF.Race.active()) {
      runVoteOnline(api, { kind: 'choice', list: data, roundCount: opts.roundCount, points: opts.points, promptKey: opts.promptKey, prompt: opts.prompt });
      return;
    }
    var rounds = pickRounds(data, FF.GameLength.rounds(api, opts.roundCount, data.length));
    var players = api.config.players.slice();
    var animate = !!api.config.animations;
    var b = bonusMul(api.config.difficulty);
    var basePts = opts.points;
    var gameEnded = false;

    if (api.config.timer > 0) {
      api.shell.setTimer(api.config.timer, function () {
        if (gameEnded) return;
        finish();
      });
    }

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
          FF.Players.avatarEl(current, 'pg-voter__avatar'),
          FF.t('pickYourChoice', '{name}, pick your choice!', { name: current.name })
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
        actions.appendChild(api.ui.button(index + 1 >= rounds.length ? FF.t('seeResults', 'See results') : FF.t('nextRound', 'Next round'), {
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
      if (gameEnded) return;
      gameEnded = true;
      if (api.shell && api.shell.hideTimer) api.shell.hideTimer();
      var ranked = api.scoring.ranked();
      api.end({
        results: ranked,
        winnerId: ranked.length ? ranked[0].id : null
      });
    }

    playRound(0);
  }

  function runWhoIsMostLikely(api) {
    var party = getParty(api);
    var data = party && party.whoIsMostLikely;
    if (!data || !data.length) {
      friendlyExit(api, 'No prompts yet', 'Who Is Most Likely prompts are missing. Please add the party data pack.');
      return;
    }
    // Online, each phone votes for itself and two players are enough.
    if (FF.Race && FF.Race.active && FF.Race.active()) {
      runVoteOnline(api, { kind: 'likely', list: data, roundCount: 8, points: 50, crown: 50 });
      return;
    }
    var players = api.config.players.slice();
    if (players.length < 3) {
      friendlyExit(api, 'Need at least 3 players', 'Who Is Most Likely is best with 3 or more players. Add another player and try again!');
      return;
    }
    var rounds = pickRounds(data, FF.GameLength.rounds(api, 8, data.length));
    var animate = !!api.config.animations;
    var b = bonusMul(api.config.difficulty);
    var ended = false;

    if (api.config.timer > 0) {
      api.shell.setTimer(api.config.timer, function () { finish(); });
    }

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
          FF.Players.avatarEl(current, 'pg-voter__avatar'),
          FF.t('castYourVote', '{name}, cast your vote!', { name: current.name })
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
            FF.Players.avatarEl(cand, 'pg-cand__avatar'),
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
            player: p,
            label: p.name,
            count: counts[p.id] || 0,
            color: p.color || '#8b5cf6',
            win: counts[p.id] === maxVotes && maxVotes > 0
          };
        });
        root.appendChild(revealBars(api, rows, animate));

        var headline;
        if (winners.length === 1) {
          headline = '' + winners[0].name + ' is most likely! (+' + Math.round(100 * b) + ' per vote)';
        } else {
          headline = "It's a tie! " + winners.map(function (w) { return w.name; }).join(' & ') + ' share the crown.';
        }
        root.appendChild(api.ui.el('div', { class: 'pg-note' }, headline));
        root.appendChild(api.ui.el('div', { class: 'pg-note' }, 'Every voter earns ' + Math.round(30 * b) + ' points.'));

        var actions = api.ui.div('pg-actions');
        actions.appendChild(api.ui.button(index + 1 >= rounds.length ? FF.t('seeResults', 'See results') : FF.t('nextRound', 'Next round'), {
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
      if (ended) return;
      ended = true;
      if (api.shell && api.shell.hideTimer) api.shell.hideTimer();
      var ranked = api.scoring.ranked();
      api.end({
        results: ranked,
        winnerId: ranked.length ? ranked[0].id : null
      });
    }

    playRound(0);
  }

  /* ================= online rooms =================
     Every phone votes for its own player at the same moment. A round
     settles once everyone has voted (or the vote clock runs out); then
     every phone shows the same split and moves on after the same pause.
     Points are derived from the stored votes ('vote' race mode), never
     stored, so phones cannot drift apart. */

  var VOTE = {
    VOTE_MS: 30000,     // how long a vote stays open when the room sets no time limit
    REVEAL_MS: 7000,    // how long the split shows before the next round

    /* Choice games: everyone on the side most people picked scores
       (on a tie, everyone who voted). */
    majorityPoints: function (answers, tally, pts) {
      var out = {};
      Object.keys(answers || {}).forEach(function (uid) {
        var a = answers[uid];
        if (a && a.choice != null && tally.top.indexOf(String(a.choice)) !== -1) out[uid] = pts;
      });
      return out;
    },

    /* Who Is Most Likely: voters who agreed with the room score, and so
       does whoever the room picked. */
    likelyPoints: function (answers, tally, pts, crown) {
      var out = this.majorityPoints(answers, tally, pts);
      tally.top.forEach(function (uid) { out[uid] = (out[uid] || 0) + crown; });
      return out;
    },

    /* The prompt for a round, drawn straight after FF.Race.beginRound seeds
       it, so every phone shows the same one. used (index -> true) keeps
       prompts from repeating; every phone draws the rounds in the same
       order, so it stays the same everywhere too. */
    draw: function (list, used, rand) {
      var left = [];
      for (var i = 0; i < list.length; i++) if (!used[i]) left.push(i);
      if (!left.length) {
        Object.keys(used).forEach(function (k) { delete used[k]; });
        for (var j = 0; j < list.length; j++) left.push(j);
      }
      var k = left[Math.floor(rand() * left.length)];
      used[k] = true;
      return list[k];
    }
  };
  FF.PartyVote = VOTE;

  function t(key, fallback, vars) { return FF.t ? FF.t(key, fallback, vars) : String(fallback); }

  // A row of small avatars: who sided with this option.
  function voterChips(api, voters) {
    var wrap = api.ui.div('pg-voters');
    voters.forEach(function (p) {
      wrap.appendChild(api.ui.el('span', { class: 'pg-vchip' + (p.me ? ' pg-vchip--me' : '') }, [
        FF.Players.avatarEl(p, 'pg-vchip__ava'),
        p.me ? t('you', 'You') : p.name
      ]));
    });
    return wrap;
  }

  // How the votes split. rows: [{ lead (node), label, count, win, tone, voters }]
  function splitRows(api, rows, total, animate) {
    var wrap = api.ui.div('pg-results');
    rows.forEach(function (r) {
      var pct = total > 0 ? Math.round(r.count / total * 100) : 0;
      var row = api.ui.div('pg-row' + (r.win ? ' pg-row--win' : ''));
      var top = api.ui.div('pg-row__top');
      var label = api.ui.span('pg-row__label');
      if (r.lead) label.appendChild(r.lead);
      label.appendChild(api.ui.span('', r.label));
      // The top choice is marked with an icon and words, not colour alone.
      if (r.win) {
        var mark = api.ui.span('pg-row__win');
        mark.appendChild(FF.Icons.icon('trophy'));
        mark.appendChild(api.ui.span('sr-only', t('pgTopPick', 'Top pick')));
        label.appendChild(mark);
      }
      top.appendChild(label);
      top.appendChild(api.ui.span('pg-row__count', t('pgVotesPct', '{n} · {pct}%', { n: r.count, pct: pct })));
      var track = api.ui.div('pg-row__track');
      var fill = api.ui.div('pg-row__fill' + (r.tone ? ' pg-row__fill--' + r.tone : ''));
      track.appendChild(fill);
      row.appendChild(top);
      row.appendChild(track);
      if (r.voters.length) row.appendChild(voterChips(api, r.voters));
      wrap.appendChild(row);
      if (animate) setTimeout(function () { fill.style.width = pct + '%'; }, 50);
      else fill.style.width = pct + '%';
    });
    return wrap;
  }

  /* cfg: { kind: 'choice'|'likely', list, roundCount, points, crown, promptKey, prompt } */
  function runVoteOnline(api, cfg) {
    var room = FF.Room.current();
    var meId = room ? room.uid : null;
    var bonus = bonusMul(api.config.difficulty);
    var pts = Math.round(cfg.points * bonus);
    var crown = Math.round((cfg.crown || 0) * bonus);
    var rounds = FF.GameLength.rounds(api, cfg.roundCount, cfg.list.length);
    var animate = !!api.config.animations;
    var likely = cfg.kind === 'likely';
    // The room's time to answer; with no limit one idle phone could hold up
    // every round, so a vote still closes after VOTE_MS.
    var voteMs = api.config.timer > 0 ? api.config.timer * 1000 : VOTE.VOTE_MS;

    function person(p) {
      return { id: p.uid, name: p.name, avatar: p.avatar, photo: p.photo, color: p.color, joinedAt: p.joinedAt || 0, me: p.uid === meId };
    }
    // The players this round waits for, in the same order on every phone.
    function people() {
      var inGame = FF.Race.playersInGame ? FF.Race.playersInGame() : FF.Room.racePlayers();
      return inGame.map(person).sort(function (a, b) { return (a.joinedAt - b.joinedAt) || (a.id < b.id ? -1 : 1); });
    }
    // Anyone in the room, so a vote for someone who has since left still shows.
    function byId(uid) {
      var all = FF.Room.racePlayers();
      for (var i = 0; i < all.length; i++) if (all[i].uid === uid) return person(all[i]);
      return { id: uid, name: t('someone', 'Someone'), me: false };
    }
    function scoreRound(answers, tally) {
      return likely ? VOTE.likelyPoints(answers, tally, pts, crown) : VOTE.majorityPoints(answers, tally, pts);
    }

    FF.Race.begin(api.def.id, {
      rounds: rounds,
      mode: 'vote',
      timerMs: voteMs,
      pointsFor: scoreRound
    });

    var n = 0;
    var used = {};
    var item = null;
    var candidates = [];
    var myVote = null;
    var open = false;
    var finished = false;
    var offRounds = null;
    var cancelOpen = null;
    var clock = null;
    var view = null;      // { choices, status, chips, count, meter }

    var offSettle = FF.Race.onSettle(function () {
      stopRound();
      if (FF.Race.catchingUp && FF.Race.catchingUp()) { n++; round(); return; }
      FF.Race.syncScoring();
      api.shell.updateScores();
      reveal();
    });

    function stopRound() {
      if (offRounds) { offRounds(); offRounds = null; }
      if (cancelOpen) { cancelOpen(); cancelOpen = null; }
      if (clock) { clearInterval(clock); clock = null; }
    }

    function roundNode(i) {
      var r = FF.Room.current();
      return (r && r.rounds && r.rounds[i]) || {};
    }

    function optionText(choice) {
      if (likely) return byId(choice).name;
      return choice === 'a' ? item.a : item.b;
    }

    function round() {
      if (finished) return;
      if (n >= rounds || (n > 0 && FF.Race.over(n))) { finish(); return; }
      FF.Race.beginRound(n);
      // Drawn straight after beginRound seeds the round: the same on every phone.
      item = VOTE.draw(cfg.list, used, FF._rand);
      myVote = null;
      open = false;
      var everyone = people();
      // With only two players you may vote for yourself; otherwise it would
      // be a forced pick every round.
      candidates = likely ? everyone.filter(function (p) { return everyone.length < 3 || !p.me; }) : [];
      FF.Race.describe(likely
        ? { kind: 'choice', text: t('pgLikelyAsk', 'Who is most likely to…') + ' ' + item, options: everyone.map(function (p) { return p.name; }) }
        : { kind: 'choice', text: t(cfg.promptKey, cfg.prompt), options: [item.a, item.b] }, null);
      renderVote();
      var thisRound = n;
      updateVoted(roundNode(n).answers);
      offRounds = FF.Room.on('rounds', function (all) {
        var node = (all || {})[thisRound];
        updateVoted(node ? node.answers : {});
      });
      cancelOpen = FF.Race.whenOpen(function () {
        open = true;
        if (!view) return;
        Array.prototype.forEach.call(view.choices.querySelectorAll('button'), function (b) { b.disabled = false; });
        view.status.textContent = t('pgVoteNow', 'Vote now. Nobody sees your pick until everyone is in.');
        clock = setInterval(tickClock, 250);
        tickClock();
      });
    }

    function tickClock() {
      if (!view || !view.meter.isConnected) { if (clock) { clearInterval(clock); clock = null; } return; }
      var left = voteMs - (FF.Race.msSinceOpen() || 0);
      view.meter.set(left / voteMs);
    }

    function topBar() {
      var bar = api.ui.div('gm-turnbar');
      bar.appendChild(FF.GameUI.pill(t('everyoneVotes', 'Everyone votes'), 'users-three', 'turn'));
      bar.appendChild(FF.GameUI.pill(FF.GameLength.roundText(n + 1, rounds), 'list-numbers'));
      return bar;
    }

    function promptBlock(wrap) {
      if (likely) {
        wrap.appendChild(api.ui.div('pg-prompt', t('pgLikelyAsk', 'Who is most likely to…')));
        wrap.appendChild(api.ui.div('pg-question', item));
      } else {
        wrap.appendChild(api.ui.div('pg-prompt', t(cfg.promptKey, cfg.prompt)));
      }
    }

    function renderVote() {
      var root = api.shell.root;
      api.ui.clear(root);
      var wrap = api.ui.div('pg-root');
      wrap.appendChild(topBar());
      promptBlock(wrap);

      var choices;
      if (likely) {
        choices = api.ui.div('pg-cands');
        candidates.forEach(function (cand) {
          var btn = api.ui.el('button', {
            class: 'pg-cand',
            type: 'button',
            disabled: true,
            onclick: function () { vote(cand.id, btn); },
            'aria-label': t('pgVoteFor', 'Vote for {name}', { name: cand.me ? t('you', 'You') : cand.name })
          }, [
            FF.Players.avatarEl(cand, 'pg-cand__avatar'),
            api.ui.el('span', { class: 'pg-cand__name' }, cand.me ? t('you', 'You') : cand.name)
          ]);
          choices.appendChild(btn);
        });
      } else {
        choices = api.ui.div('pg-choices');
        [['a', item.aIcon, item.a, t('optionA', 'Option A')], ['b', item.bIcon, item.b, t('optionB', 'Option B')]].forEach(function (o) {
          var card = choiceCard(api, o[1], o[2], o[3], function () { vote(o[0], card); });
          card.disabled = true;
          choices.appendChild(card);
        });
      }
      wrap.appendChild(choices);

      var meter = FF.GameUI.meter(1);
      meter.classList.add('pg-meter');
      meter.setAttribute('aria-label', t('pgTimeToVote', 'Time to vote'));
      wrap.appendChild(meter);

      var status = api.ui.el('p', { class: 'pg-note', role: 'status' }, t('getReady', 'Get ready'));
      wrap.appendChild(status);
      var count = api.ui.div('pg-count');
      wrap.appendChild(count);
      var chips = api.ui.div('pg-chiprow');
      wrap.appendChild(chips);

      root.appendChild(wrap);
      view = { choices: choices, status: status, chips: chips, count: count, meter: meter };
    }

    // Live: who has voted, never what they picked.
    function updateVoted(answers) {
      if (!view) return;
      answers = answers || {};
      var everyone = people();
      var done = everyone.filter(function (p) { return !!answers[p.id]; }).length;
      view.count.textContent = t('pgVotedCount', '{n} of {total} have voted', { n: done, total: everyone.length });
      api.ui.clear(view.chips);
      everyone.forEach(function (p) {
        var voted = !!answers[p.id];
        view.chips.appendChild(api.ui.el('span', { class: 'pg-chip' + (voted ? ' pg-chip--done' : '') }, [
          FF.Icons.icon(voted ? 'check-circle' : 'clock'),
          FF.Players.avatarEl(p, 'pg-chip__ava'),
          p.me ? t('you', 'You') : p.name,
          api.ui.span('sr-only', voted ? t('pgHasVoted', 'has voted') : t('pgStillVoting', 'still voting'))
        ]));
      });
    }

    function vote(choice, btn) {
      if (myVote != null || !open || finished) return;
      myVote = choice;
      api.audio.play('tap');
      FF.GameUI.lock(view.choices);
      btn.classList.add('pg-picked');
      btn.setAttribute('aria-pressed', 'true');
      btn.appendChild(api.ui.el('span', { class: 'pg-picked__mark' }, [FF.Icons.icon('check-circle'), t('pgYourPick', 'Your pick')]));
      view.status.textContent = t('pgVoteIn', 'Vote in. Waiting for everyone else…');
      FF.Race.submit(choice, true, FF.Race.msSinceOpen(), null);
    }

    function reveal() {
      if (finished) return;
      view = null;
      var node = roundNode(n);
      var answers = node.answers || {};
      var tally = FF.RaceRules.tally(node);
      var gained = scoreRound(answers, tally);
      var total = 0;
      Object.keys(tally.counts).forEach(function (k) { total += tally.counts[k]; });

      function votersFor(choice) {
        return Object.keys(answers).filter(function (uid) {
          return answers[uid] && answers[uid].choice != null && String(answers[uid].choice) === choice;
        }).map(byId).sort(function (a, b) { return a.me ? -1 : b.me ? 1 : (a.name < b.name ? -1 : 1); });
      }

      var rows;
      if (likely) {
        rows = Object.keys(tally.counts).sort(function (a, b) {
          return (tally.counts[b] - tally.counts[a]) || (byId(a).name < byId(b).name ? -1 : 1);
        }).map(function (uid) {
          var p = byId(uid);
          return { lead: FF.Players.avatarEl(p, 'pg-row__ava'), label: p.me ? t('you', 'You') : p.name, count: tally.counts[uid], win: tally.top.indexOf(uid) !== -1, tone: null, voters: votersFor(uid) };
        });
      } else {
        rows = ['a', 'b'].map(function (side) {
          return {
            lead: api.ui.span('pg-row__emoji', side === 'a' ? item.aIcon : item.bIcon),
            label: side === 'a' ? item.a : item.b,
            count: tally.counts[side] || 0,
            win: tally.top.indexOf(side) !== -1,
            tone: side,
            voters: votersFor(side)
          };
        });
      }

      var headline;
      if (!tally.max) headline = t('pgNoVotes', 'Nobody voted this time');
      else if (likely && tally.top.length === 1) {
        var picked = byId(tally.top[0]);
        headline = picked.me ? t('pgRoomPickedYou', 'The room picked you') : t('pgIsMostLikely', '{name} is most likely', { name: picked.name });
      } else if (likely) {
        headline = t('pgLikelyTie', 'A tie between {names}', { names: tally.top.map(function (uid) { return byId(uid).name; }).join(' & ') });
      } else if (tally.top.length > 1) headline = t('pgSplit', 'A perfect split');
      else headline = t('pgTopPickIs', 'Top pick: {choice}', { choice: optionText(tally.top[0]) });

      var root = api.shell.root;
      api.ui.clear(root);
      var wrap = api.ui.div('pg-root');
      wrap.appendChild(topBar());
      promptBlock(wrap);
      wrap.appendChild(api.ui.el('h2', { class: 'pg-headline', role: 'status' }, headline));
      wrap.appendChild(splitRows(api, rows, total, animate));

      var mine = answers[meId];
      var got = gained[meId] || 0;
      if (!mine || mine.choice == null) {
        wrap.appendChild(FF.GameUI.feedback('info', got ? t('pgPickedPlus', 'You did not vote, but the room picked you. +{n} points', { n: got }) : t('pgMissed', 'You did not vote in time')));
      } else if (got && likely && tally.top.indexOf(meId) !== -1) {
        wrap.appendChild(FF.GameUI.feedback('good', t('pgPickedYouPlus', 'The room picked you. +{n} points', { n: got })));
      } else if (got && tally.top.length > 1) {
        wrap.appendChild(FF.GameUI.feedback('good', t('pgTiePlus', 'It’s a tie, so every voter scores. +{n} points', { n: got })));
      } else if (got) {
        wrap.appendChild(FF.GameUI.feedback('good', t('pgWithRoom', 'You voted with the room. +{n} points', { n: got })));
      } else {
        wrap.appendChild(FF.GameUI.feedback('info', t('pgOwnWay', 'You went your own way this time')));
      }
      api.audio.play(got ? 'correct' : 'roundEnd');

      var last = FF.Race.isLastRound(n, rounds);
      // A fixed pause in a room, so every phone starts the next round together.
      wrap.appendChild(FF.Advance.button(last ? t('seeResults', 'See results') : t('nextRound', 'Next round'), function () {
        api.audio.play('select');
        n++;
        round();
      }, { class: 'btn-lg', ms: VOTE.REVEAL_MS }));
      root.appendChild(wrap);
    }

    function finish() {
      if (finished) return;
      finished = true;
      stopRound();
      view = null;
      FF.Race.syncScoring();
      if (offSettle) { offSettle(); offSettle = null; }
      FF.Race.end();
      var res = api.scoring.results();
      api.end({ results: res.results, winnerId: res.winnerId });
    }

    round();
  }

  /* ================= registrations ================= */

  FF.registerGame({
    id: 'wouldYouRather',
    name: 'Would You Rather?',
    description: 'Pick between two wild options — side with the crowd to score!',
    category: 'party',
    icon: '🤔',
    players: [1, 8],
    difficulty: 'Easy',
    duration: 5,
    tags: ['voting', 'party'],
    modes: ['solo', 'everyone', 'team'],
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
        tag: 'Everyone plays: discuss & choose',
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
        promptKey: 'pgWyrPrompt',
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
    players: [1, 8],
    difficulty: 'Easy',
    duration: 4,
    tags: ['quick', 'voting'],
    modes: ['solo', 'everyone'],
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
        tag: 'Everyone plays: quick picks',
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
        promptKey: 'pgTotPrompt',
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
        tag: 'Everyone plays: point & discuss',
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
