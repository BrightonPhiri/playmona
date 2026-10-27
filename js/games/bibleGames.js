/* ============================================================
   PLAYMONA — games/bibleGames.js
   Four complete Bible games for all ages:
     1. bibleQuiz      — Bible Trivia (solo, turn, team, room race)
     2. bibleWhoAmI    — Who Am I? (Progressive clue riddles)
     3. bibleVerseRush — Verse Rush (Scramble & memory assembly)
     4. bibleBooks     — Books of the Bible (Rapid sorting)
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  function scorerList(config) {
    if (config && config.scorers && config.scorers.length) return config.scorers;
    if (config && config.players && config.players.length) return config.players;
    return [{ id: 'p1', name: 'Player 1', avatar: null, color: '#8b5cf6' }];
  }

  function getBibleData() {
    return (FF.data && FF.data.bible) ? FF.data.bible : null;
  }

  /* In a room every device must deal the same deck: seed the shuffle from
     the room. Returns true when racing. */
  function seedDeck(api) {
    var racing = !!(FF.Race && FF.Race.active() && FF.Room && FF.Room.current());
    if (racing) FF.Random.seed(FF.Random.roundSeed(FF.Room.current().meta.seed, api.def.id, 'deck'));
    return racing;
  }

  // The scorer this device plays in a room (scores come from the race).
  function myScorer(scorers) {
    var room = FF.Room && FF.Room.current();
    var uid = room ? room.uid : null;
    return scorers.filter(function (s) { return s.id === uid; })[0] || scorers[0];
  }

  /* ---------- Books of the Bible in a room ----------
     A sprint of books per round, the same books on every phone (FF.Parallel).
     Right answers score 80 plus 10 a streak; a finished sprint adds a speed
     bonus, scaled by how many were right. */
  var BOOKS_PER_SPRINT = 6;

  function booksPoints(st, ms, limitMs) {
    var speed = st.total ? FF.Parallel.speedBonus(ms, limitMs, 100) * st.right / st.total : 0;
    return Math.round(st.points + speed);
  }

  function bibleBooksOnline(api, books) {
    FF.Parallel.seed(api, 'books');
    var deck = api.util.shuffle(books.slice());
    var per = Math.min(BOOKS_PER_SPRINT, deck.length);
    FF.Parallel.run(api, {
      rounds: 3,
      available: Math.floor(deck.length / per),
      seconds: 30,
      gate: '.gm-duo-btn',
      play: function (n, ctx) {
        var sprint = [];
        for (var k = 0; k < per; k++) sprint.push(deck[(n * per + k) % deck.length]);
        var idx = 0;
        var st = { points: 0, right: 0, total: per };
        var streak = 0;
        var open = false;
        var over = false;

        var wrap = FF.GameUI.stage();
        wrap.appendChild(ctx.live);
        var slot = FF.ui.div('');
        wrap.appendChild(slot);
        api.shell.root.appendChild(wrap);

        function result(ms) {
          return { value: booksPoints(st, ms, ctx.limitMs), right: st.right, total: st.total };
        }

        function card() {
          FF.ui.clear(slot);
          var book = sprint[idx];
          slot.appendChild(FF.GameUI.turnBar(null, ctx.roundText + ' \u00b7 ' + FF.t('bookOf', 'Book {n} of {total}', { n: idx + 1, total: per })));
          var c = FF.ui.div('gm-card');
          c.appendChild(FF.GameUI.kicker(FF.t('whichTestament', 'Which testament?')));
          c.appendChild(FF.ui.el('h2', { class: 'gm-big' }, book.name));
          c.appendChild(FF.GameUI.note(FF.t('chaptersN', '{n} chapters', { n: book.chapters })));
          slot.appendChild(c);
          var row = FF.GameUI.duo();
          var ot = FF.GameUI.duoButton(FF.t('oldTestament', 'Old Testament'), function () { pick('OT', ot); }, 'up', 'scroll');
          var nt = FF.GameUI.duoButton(FF.t('newTestament', 'New Testament'), function () { pick('NT', nt); }, 'down', 'book-open');
          row.appendChild(ot);
          row.appendChild(nt);
          slot.appendChild(row);
          var picked = false;
          function pick(choice, btn) {
            if (picked || !open || over) return;
            picked = true;
            var right = choice === book.testament;
            ot.disabled = true;
            nt.disabled = true;
            FF.GameUI.markOption(book.testament === 'OT' ? ot : nt, 'correct');
            if (!right) FF.GameUI.markOption(btn, 'wrong');
            if (right) {
              streak++;
              st.right++;
              st.points += 80 + streak * 10;
              api.audio.play('correct');
            } else {
              streak = 0;
              api.audio.play('wrong');
            }
            setTimeout(function () {
              if (over || !slot.isConnected) return;
              idx++;
              if (idx < per) { card(); return; }
              over = true;
              ctx.done(result(ctx.elapsed()));
            }, right ? 450 : 1000);
          }
        }
        card();

        return {
          start: function () { open = true; },
          stop: function () { over = true; return result(null); }
        };
      },
      describe: function () {
        return { kind: 'card', text: FF.t('booksWatch', 'Old or New Testament? Everyone sorts the same {n} books', { n: per }) };
      },
      detail: function (a) {
        var line = FF.t('booksRight', '{c} of {n} right', { c: a.right || 0, n: a.total || 0 });
        return a.out ? line : line + ' \u00b7 ' + FF.Parallel.clock(a.ms);
      }
    });
  }

  /* ============================================================
     1. BIBLE QUIZ
     ============================================================ */
  FF.registerGame({
    id: 'bibleQuiz',
    featured: true,
    name: 'Bible Quiz',
    description: 'Test your knowledge on stories, miracles, heroes of faith, and scripture!',
    category: 'bible',
    icon: '📖',
    players: [1, 8],
    difficulty: 'Normal',
    duration: 4,
    tags: ['quiz', 'faith', 'trivia', 'everyone'],
    modes: ['solo', 'turn', 'team', 'everyone', 'host'],
    defaultMode: 'turn',
    howToPlay: [
      'Read the biblical question on screen.',
      'Select the correct answer among the 4 choices.',
      'Answer quickly to gain a speed bonus and build your streak!',
      'Highest points at the end wins.'
    ],

    start: function (api) {
      var data = getBibleData();
      if (!data || !data.questions || !data.questions.length) {
        api.shell.root.innerHTML = '<div class="empty">Bible questions not loaded.</div>';
        return;
      }

      var scorers = scorerList(api.config);
      var totalRounds = FF.GameLength.rounds(api, 10, data.questions.length);
      seedDeck(api);
      var questions = api.util.shuffle(data.questions.slice()).slice(0, totalRounds);
      var race = FF.Race ? FF.Race.forGame(api, {
        rounds: totalRounds,
        optionSelector: '.bible-quiz-option',
        pointsFor: function (answer) { return answer.value || 0; }
      }) : null;

      var currentIndex = 0;
      var currentScorerIdx = 0;
      var questionStartTime = 0;
      var answered = false;

      function renderQuestion() {
        if (currentIndex >= questions.length) {
          finishGame();
          return;
        }

        answered = false;
        var q = questions[currentIndex];
        var scorer = scorers[currentScorerIdx % scorers.length];
        api.shell.updateScores(scorer.id);

        FF.ui.clear(api.shell.root);

        var wrap = FF.GameUI.stage();

        // Round & active player header
        var headRow = FF.GameUI.turnBar(race ? null : (scorers.length > 1 ? scorer : null), FF.GameUI.roundText(currentIndex + 1, questions.length));
        wrap.appendChild(headRow);
        wrap.appendChild(FF.GameUI.kicker(q.category || FF.t('catBibleShort', 'Bible')));
        wrap.appendChild(FF.GameUI.prompt(q.q));

        var optGrid = FF.GameUI.options({ columns: 'auto' });
        q.options.forEach(function (optText, idx) {
          var btn = FF.GameUI.option(optText, function () {
            if (answered) return;
            handleAnswer(idx, btn, optGrid, q);
          }, idx, { className: 'bible-quiz-option' });
          optGrid.appendChild(btn);
        });

        wrap.appendChild(optGrid);

        var feedbackBox = FF.ui.el('div', { id: 'bible-quiz-feedback', 'aria-live': 'polite' });
        wrap.appendChild(feedbackBox);

        api.shell.root.appendChild(wrap);

        function openQuestion() {
          questionStartTime = Date.now();
          var timerSecs = api.config.timer != null ? api.config.timer : 20;
          if (timerSecs > 0) {
            api.shell.setTimer(timerSecs, function () {
              if (!answered) handleAnswer(-1, null, optGrid, q);
            });
          }
        }

        if (race) {
          race.beginRound(currentIndex).then(function () { race.gate(openQuestion); });
          // For people watching: the question and its answers (the answer is shared after the round).
          race.describe({ kind: 'choice', text: q.q, options: q.options }, q.answer);
        } else openQuestion();
      }

      function handleAnswer(choiceIdx, chosenBtn, optGrid, q) {
        answered = true;
        api.shell.hideTimer();
        var elapsedSecs = (Date.now() - questionStartTime) / 1000;
        var isCorrect = (choiceIdx === q.answer);
        var scorer = scorers[currentScorerIdx % scorers.length];

        var buttons = optGrid.querySelectorAll('button');
        buttons.forEach(function (b, i) {
          b.disabled = true;
          if (i === q.answer) FF.GameUI.markOption(b, 'correct');
          else if (i === choiceIdx && !isCorrect) FF.GameUI.markOption(b, 'wrong');
          else FF.GameUI.markOption(b, 'dim');
        });

        var feedback = document.getElementById('bible-quiz-feedback');
        if (feedback) {
          FF.ui.clear(feedback);
          var verdict = isCorrect ? FF.t('correct', 'Correct!') : (choiceIdx === -1 ? FF.t('timesUp', 'Time’s up!') : FF.t('notQuite', 'Not quite.'));
          feedback.appendChild(FF.GameUI.feedback(isCorrect ? 'good' : 'bad', verdict + (q.explanation ? ' ' + q.explanation : '')));
        }

        var basePoints = 100;
        var speedBonus = Math.max(0, Math.round((20 - elapsedSecs) * 3));
        var earned = isCorrect ? basePoints + speedBonus : 0;

        if (race) {
          race.submit(choiceIdx, isCorrect, elapsedSecs * 1000, { value: earned });
          return;
        }

        if (isCorrect) {
          api.audio.play('correct');
          api.scoring.add(scorer.id, earned, { correct: true, fastest: elapsedSecs });
        } else {
          api.audio.play('wrong');
          api.scoring.markAnswer(scorer.id, false, elapsedSecs);
        }

        api.shell.updateScores(scorer.id);

        setTimeout(function () {
          currentIndex++;
          currentScorerIdx++;
          renderQuestion();
        }, 2200);
      }

      if (race) {
        race.onSettle(function (payload) {
          api.shell.hideTimer();
          var q = questions[currentIndex];
          var isLast = race.isLastRound(currentIndex, questions.length);
          race.showResult(payload, {
            answerText: q && q.options ? q.options[q.answer] : null,
            isLast: isLast,
            onNext: function () {
              currentIndex++;
              if (isLast) finishGame();
              else renderQuestion();
            }
          });
        });
      }

      function finishGame() {
        if (race) race.end();
        api.audio.play('winner');
        api.end({});
      }

      renderQuestion();
    }
  });

  /* ============================================================
     2. WHO AM I? (BIBLE EDITION)
     ============================================================ */
  // A new clue every 8 s, so four clues need about 32 s to read.
  var WHO_ONLINE_MIN_SECS = 40;

  FF.registerGame({
    id: 'bibleWhoAmI',
    name: 'Who Am I? (Bible)',
    description: 'Progressive clues reveal a biblical figure. Can you guess with the fewest clues?',
    category: 'bible',
    icon: '🔍',
    players: [1, 8],
    difficulty: 'Normal',
    duration: 5,
    tags: ['mystery', 'faith', 'riddle', 'characters'],
    modes: ['solo', 'turn', 'team', 'everyone'],
    defaultMode: 'turn',
    howToPlay: [
      'Clues are revealed one by one for a mystery biblical character.',
      'Pick the correct name from the choices.',
      'Guessing early with fewer clues earns maximum points (up to 300 pts)!',
      'An incorrect guess locks you out of this character.'
    ],

    start: function (api) {
      var data = getBibleData();
      if (!data || !data.whoAmI || !data.whoAmI.length) {
        api.shell.root.innerHTML = '<div class="empty">Character data not loaded.</div>';
        return;
      }

      var scorers = scorerList(api.config);
      var totalCards = FF.GameLength.rounds(api, 6, data.whoAmI.length);
      var racing = seedDeck(api);
      var deck = api.util.shuffle(data.whoAmI.slice()).slice(0, totalCards);

      // ---- Race support: everyone reads the same clues, and the first right
      // name takes the round, worth what it was when that player guessed. ----
      // A room's answer clock leaves time to read every clue.
      var timerSecs = api.config.timer > 0 ? Math.max(api.config.timer, WHO_ONLINE_MIN_SECS) : 0;
      var race = racing ? FF.Race.forGame(api, {
        rounds: totalCards,
        timerMs: timerSecs * 1000,
        // 'button' gates the Another clue button too.
        optionSelector: 'button',
        pointsFor: function (answer) { return answer.value || 0; }
      }) : null;

      var cardIdx = 0;
      var scorerIdx = 0;
      var clueLevel = 0;
      var clueTimer = null;
      var resolved = false;
      var settled = false;

      var offSettle = race ? race.onSettle(function (payload) {
        if (settled) return;
        settled = true;
        resolved = true;
        if (clueTimer) clearInterval(clueTimer);
        api.shell.hideTimer();
        var item = deck[cardIdx];
        race.showResult(payload, {
          answerText: item ? item.answer : null,
          isLast: race.isLastRound(cardIdx, deck.length),
          onNext: function () { cardIdx++; renderCard(); }
        });
      }) : null;

      function renderCard() {
        if (cardIdx >= deck.length || (race && race.over(cardIdx))) {
          if (offSettle) offSettle();
          if (race) race.end();
          api.audio.play('winner');
          api.end({});
          return;
        }

        resolved = false;
        settled = false;
        clueLevel = 1;
        var item = deck[cardIdx];
        // Seeded first, so every device builds the same choices.
        var opening = race ? race.beginRound(cardIdx) : null;
        var scorer = race ? myScorer(scorers) : scorers[scorerIdx % scorers.length];
        api.shell.updateScores(scorer.id);

        // Generate 3 random wrong options from other characters
        var distractors = data.whoAmI
          .filter(function (x) { return x.answer !== item.answer; })
          .map(function (x) { return x.answer; });
        distractors = api.util.shuffle(distractors).slice(0, 3);
        var choices = api.util.shuffle([item.answer].concat(distractors));
        // For people watching: the first clue and the names (the answer is shared after the round).
        if (race) race.describe({ kind: 'choice', text: FF.t('whoAmIBible', 'Who am I?') + ' ' + item.clues[0], options: choices }, choices.indexOf(item.answer));

        FF.ui.clear(api.shell.root);

        var wrap = FF.GameUI.stage();

        wrap.appendChild(FF.GameUI.turnBar(scorers.length > 1 ? scorer : null, race ? FF.GameLength.roundText(cardIdx + 1, deck.length) : FF.t('figureOf', 'Figure {n} of {total}', { n: cardIdx + 1, total: deck.length })));
        wrap.appendChild(FF.GameUI.prompt(FF.t('whoAmIBible', 'Who am I?')));

        var clueList = FF.ui.el('ol', { class: 'gm-list', id: 'clue-items', 'aria-live': 'polite', 'aria-label': FF.t('clues', 'Clues') });
        wrap.appendChild(clueList);

        // Next clue countdown / button
        var clueProgress = FF.ui.div('gm-row');
        var clueCountText = FF.GameUI.pill(FF.t('clueOf', 'Clue {n} of {total}', { n: 1, total: item.clues.length }), 'list-numbers');
        clueCountText.id = 'clue-counter';
        var nextClueBtn = FF.UI.button(FF.t('nextClue', 'Another clue'), { class: 'btn-sm', icon: 'plus', onClick: function () { advanceClue(); } });
        nextClueBtn.id = 'next-clue-btn';
        clueProgress.appendChild(clueCountText);
        clueProgress.appendChild(nextClueBtn);
        wrap.appendChild(clueProgress);

        // Choice buttons
        var choiceGrid = FF.GameUI.options({ columns: 'auto' });

        choices.forEach(function (name, ci) {
          var b = FF.GameUI.option(name, function () {
            if (resolved) return;
            submitGuess(name, b, choiceGrid, item);
          }, ci);
          b.dataset.answer = name;
          choiceGrid.appendChild(b);
        });

        wrap.appendChild(choiceGrid);
        api.shell.root.appendChild(wrap);

        updateCluesDisplay(item);
        if (race) {
          // Nobody can guess, or open a clue, before the round opens for everyone.
          var buttons = FF.ui.$$('button', wrap);
          buttons.forEach(function (b) { b.disabled = true; });
          var thisCard = cardIdx;
          opening.then(function () {
            race.gate(function () {
              if (resolved || cardIdx !== thisCard) return;
              buttons.forEach(function (b) { b.disabled = false; });
              updateCluesDisplay(item);
              startClueTimer(item);
              if (timerSecs > 0) api.shell.setTimer(timerSecs, function () { lockOutLocal(); });
            });
          });
        } else {
          startClueTimer(item);
        }
      }

      // Out of time in a room: stop here and let the round settle for everyone.
      function lockOutLocal() {
        if (resolved) return;
        resolved = true;
        if (clueTimer) clearInterval(clueTimer);
        FF.ui.$$('button', api.shell.root).forEach(function (b) { b.disabled = true; });
      }

      function updateCluesDisplay(item) {
        var list = document.getElementById('clue-items');
        var counter = document.getElementById('clue-counter');
        var nextBtn = document.getElementById('next-clue-btn');
        if (!list) return;

        FF.ui.clear(list);
        for (var i = 0; i < clueLevel; i++) {
          var row = FF.ui.el('li', { class: 'gm-list__row gm-list__row--start' + (i === clueLevel - 1 ? ' gm-list__row--new' : '') });
          row.appendChild(FF.ui.el('strong', {}, String(i + 1)));
          row.appendChild(FF.ui.span('', item.clues[i]));
          list.appendChild(row);
        }

        if (counter) {
          FF.ui.clear(counter);
          counter.appendChild(FF.Icons.icon('list-numbers'));
          counter.appendChild(document.createTextNode(FF.t('clueOf', 'Clue {n} of {total}', { n: clueLevel, total: item.clues.length })));
        }
        if (nextBtn) nextBtn.disabled = (clueLevel >= item.clues.length);
      }

      function startClueTimer(item) {
        if (clueTimer) clearInterval(clueTimer);
        clueTimer = setInterval(function () {
          if (resolved) { clearInterval(clueTimer); return; }
          if (clueLevel < item.clues.length) {
            advanceClue();
          } else {
            clearInterval(clueTimer);
          }
        }, 8000);
      }

      function advanceClue() {
        var item = deck[cardIdx];
        if (!item || clueLevel >= item.clues.length) return;
        clueLevel++;
        api.audio.play('select');
        updateCluesDisplay(item);
      }

      function submitGuess(chosenName, btn, choiceGrid, item) {
        resolved = true;
        if (clueTimer) clearInterval(clueTimer);
        var scorer = scorers[scorerIdx % scorers.length];
        var isCorrect = (chosenName === item.answer);

        if (race) {
          // Worth what it was on THIS device's clue count, so send it along.
          // A wrong name locks this player out while the others play on.
          race.submit(chosenName, isCorrect, null, { value: isCorrect ? (5 - clueLevel) * 75 : 0 });
          return;
        }

        var buttons = choiceGrid.querySelectorAll('button');
        buttons.forEach(function (b) {
          b.disabled = true;
          if (b.dataset.answer === item.answer) FF.GameUI.markOption(b, 'correct');
          else if (b === btn && !isCorrect) FF.GameUI.markOption(b, 'wrong');
          else FF.GameUI.markOption(b, 'dim');
        });
        var nextBtnEl = document.getElementById('next-clue-btn');
        if (nextBtnEl) nextBtnEl.disabled = true;

        // Award points inversely proportional to clues used
        if (isCorrect) {
          api.audio.play('correct');
          var points = (5 - clueLevel) * 75; // 300 for clue 1, 225 for clue 2, 150 for clue 3, 75 for clue 4
          api.scoring.add(scorer.id, points, { correct: true });
          choiceGrid.parentNode.appendChild(FF.GameUI.feedback('good', FF.GameUI.correctText(points)));
        } else {
          api.audio.play('wrong');
          api.scoring.markAnswer(scorer.id, false);
          choiceGrid.parentNode.appendChild(FF.GameUI.feedback('bad', FF.t('itWasName', 'It was {name}.', { name: item.answer })));
        }

        api.shell.updateScores(scorer.id);

        setTimeout(function () {
          cardIdx++;
          scorerIdx++;
          renderCard();
        }, 2200);
      }

      renderCard();
    }
  });

  /* ============================================================
     3. VERSE RUSH (SCRIPTURE SCRAMBLE)
     ============================================================ */
  // Online, every finished verse scores; the quickest two earn more.
  function versePlacePoints(place) {
    return 150 + Math.max(0, 3 - (place || 1)) * 50;
  }

  FF.registerGame({
    id: 'bibleVerseRush',
    name: 'Verse Rush',
    description: 'Assemble the scrambled scripture words in the right sequence before time runs out!',
    category: 'bible',
    icon: '📜',
    players: [1, 6],
    difficulty: 'Normal',
    duration: 4,
    tags: ['verse', 'scripture', 'memory', 'words'],
    modes: ['solo', 'turn', 'team'],
    defaultMode: 'turn',
    howToPlay: [
      'Read the scripture reference shown.',
      'Tap words from the scrambled pool to build the verse in the correct order.',
      'If you make a mistake, tap the word in your verse to return it.',
      'Complete the verse before the timer runs out!'
    ],

    start: function (api) {
      var data = getBibleData();
      if (!data || !data.verses || !data.verses.length) {
        api.shell.root.innerHTML = '<div class="empty">Verses not loaded.</div>';
        return;
      }

      var scorers = scorerList(api.config);
      var rounds = FF.GameLength.rounds(api, 5, data.verses.length);
      var racing = seedDeck(api);
      var verses = api.util.shuffle(data.verses.slice()).slice(0, rounds);
      var timerSecs = api.config.timer != null ? api.config.timer : 30;

      // ---- Race support: everyone builds the same verse at once, and every
      // finished verse scores by its place. ----
      var race = racing ? FF.Race.forGame(api, {
        rounds: rounds,
        mode: 'ranked',
        timerMs: timerSecs * 1000,
        optionSelector: '.verse-play',
        pointsFor: function (answer, place) { return versePlacePoints(place); }
      }) : null;

      var verseIdx = 0;
      var scorerIdx = 0;
      var assembled = [];
      var targetWords = [];
      var poolWords = [];
      var solved = false;
      var settled = false;

      var offSettle = race ? race.onSettle(function (payload) {
        if (settled) return;
        settled = true;
        solved = true;
        api.shell.hideTimer();
        var item = verses[verseIdx];
        race.showResult(payload, {
          answerText: item ? item.scramble.join(' ') : null,
          isLast: race.isLastRound(verseIdx, verses.length),
          onNext: function () { verseIdx++; renderVerse(); }
        });
      }) : null;

      function renderVerse() {
        if (verseIdx >= verses.length || (race && race.over(verseIdx))) {
          if (offSettle) offSettle();
          if (race) race.end();
          api.audio.play('winner');
          api.end({});
          return;
        }

        solved = false;
        settled = false;
        assembled = [];
        var item = verses[verseIdx];
        // Seeded first, so every device scatters the words the same way.
        var opening = race ? race.beginRound(verseIdx) : null;
        var scorer = race ? myScorer(scorers) : scorers[scorerIdx % scorers.length];
        api.shell.updateScores(scorer.id);

        targetWords = item.scramble.slice();
        poolWords = api.util.shuffle(targetWords.slice());
        // For people watching: the reference and the scattered words.
        if (race) race.describe({ kind: 'card', text: item.reference + ': ' + poolWords.join(' ') }, null);

        FF.ui.clear(api.shell.root);

        var wrap = FF.GameUI.stage();

        wrap.appendChild(FF.GameUI.turnBar(scorers.length > 1 ? scorer : null, race ? FF.GameLength.roundText(verseIdx + 1, verses.length) : FF.t('verseOf', 'Verse {n} of {total}', { n: verseIdx + 1, total: verses.length })));
        wrap.appendChild(FF.GameUI.prompt(item.reference));
        wrap.appendChild(FF.GameUI.sub(FF.t('verseRule', 'Tap the words in the right order to build the verse.')));

        // Assembly container (sentence preview)
        var assembleBox = FF.ui.el('div', { class: 'verse-build', id: 'assemble-box', 'aria-live': 'polite', 'aria-label': FF.t('yourVerse', 'Your verse') });
        wrap.appendChild(assembleBox);

        // Pool container
        var poolBox = FF.ui.el('div', { class: 'verse-pool', id: 'pool-box', role: 'group', 'aria-label': FF.t('wordsToUse', 'Words to use') });
        wrap.appendChild(poolBox);

        // Action buttons (Clear / Check)
        // In a room nothing can be tapped before the round opens for everyone.
        var open = !race;
        var actionRow = FF.ui.div('gm-row');
        var clearBtn = FF.UI.button(FF.t('startOver', 'Start over'), {
          icon: 'restart',
          class: 'verse-play',
          onClick: function () {
            if (solved || !open) return;
            assembled = [];
            poolWords = api.util.shuffle(targetWords.slice());
            refreshDisplay();
          }
        });
        actionRow.appendChild(clearBtn);
        if (race) {
          // Passing ends this verse for this player, so a round nobody can
          // finish still ends.
          actionRow.appendChild(FF.UI.button(FF.t('giveUp', 'Give up'), {
            icon: 'flag',
            class: 'verse-play',
            onClick: function () {
              if (solved || !open) return;
              solved = true;
              race.submit(null, false, null);
            }
          }));
        }
        wrap.appendChild(actionRow);

        api.shell.root.appendChild(wrap);

        function lockBoard() {
          FF.ui.$$('.verse-play', wrap).forEach(function (b) { b.disabled = true; });
        }

        function refreshDisplay() {
          FF.ui.clear(assembleBox);
          FF.ui.clear(poolBox);

          if (!assembled.length) {
            assembleBox.appendChild(FF.ui.span('verse-build__empty', FF.t('tapWordsInOrder', 'Tap the words below in order…')));
          } else {
            assembled.forEach(function (word, idx) {
              var wBtn = FF.ui.el('button', {
                type: 'button',
                class: 'word-chip word-chip--placed verse-play',
                disabled: !open || solved,
                'aria-label': FF.t('removeWord', 'Remove {w}', { w: word }),
                onclick: function () {
                  if (solved || !open) return;
                  assembled.splice(idx, 1);
                  poolWords.push(word);
                  api.audio.play('tap');
                  refreshDisplay();
                }
              }, word);
              assembleBox.appendChild(wBtn);
            });
          }

          poolWords.forEach(function (word, idx) {
            var pBtn = FF.ui.el('button', {
              type: 'button',
              class: 'word-chip verse-play',
              disabled: !open || solved,
              onclick: function () {
                if (solved || !open) return;
                poolWords.splice(idx, 1);
                assembled.push(word);
                api.audio.play('tap');
                refreshDisplay();

                // Check completion
                if (assembled.length === targetWords.length) {
                  checkCompletion();
                }
              }
            }, word);
            poolBox.appendChild(pBtn);
          });
        }

        function checkCompletion() {
          var isMatch = true;
          for (var i = 0; i < targetWords.length; i++) {
            if (assembled[i] !== targetWords[i]) {
              isMatch = false;
              break;
            }
          }

          if (isMatch && race) {
            // Scored by finishing place once everyone is done.
            solved = true;
            api.shell.hideTimer();
            api.audio.play('correct');
            assembleBox.classList.add('verse-build--good');
            lockBoard();
            wrap.appendChild(FF.GameUI.feedback('good', FF.t('verseDoneWait', 'Verse complete! Waiting for everyone else.')));
            race.submit(assembled.join(' '), true, null);
          } else if (isMatch) {
            solved = true;
            api.shell.hideTimer();
            api.audio.play('correct');
            assembleBox.classList.add('verse-build--good');
            wrap.appendChild(FF.GameUI.feedback('good', FF.GameUI.correctText(150)));
            api.scoring.add(scorer.id, 150, { correct: true });
            api.shell.updateScores(scorer.id);

            setTimeout(function () {
              verseIdx++;
              scorerIdx++;
              renderVerse();
            }, 1800);
          } else {
            api.audio.play('wrong');
            assembleBox.classList.add('verse-build--bad');
            FF.UI.announce(FF.t('notRightOrder', 'Not in the right order yet. Tap a word to take it back.'));
            setTimeout(function () {
              assembleBox.classList.remove('verse-build--bad');
            }, 600);
          }
        }

        refreshDisplay();
        if (race) {
          lockBoard();
          api.shell.hideTimer();
          var thisVerse = verseIdx;
          opening.then(function () {
            race.gate(function () {
              if (solved || verseIdx !== thisVerse) return;
              open = true;
              FF.ui.$$('.verse-play', wrap).forEach(function (b) { b.disabled = false; });
              if (timerSecs > 0) {
                // Out of time: stop here; the round settles for everyone.
                api.shell.setTimer(timerSecs, function () {
                  if (solved) return;
                  solved = true;
                  api.audio.play('wrong');
                  lockBoard();
                });
              }
            });
          });
        } else if (timerSecs > 0) {
          api.shell.setTimer(timerSecs, function () {
            if (!solved) {
              api.audio.play('wrong');
              verseIdx++;
              scorerIdx++;
              renderVerse();
            }
          });
        }
      }

      renderVerse();
    }
  });

  /* ============================================================
     4. BOOKS OF THE BIBLE (SORTING CHALLENGE)
     ============================================================ */
  FF.registerGame({
    id: 'bibleBooks',
    name: 'Books of the Bible',
    description: 'Rapid-fire sorting! Is the book in the Old or New Testament, and which division?',
    category: 'bible',
    icon: '📚',
    players: [1, 6],
    difficulty: 'Easy',
    duration: 3,
    tags: ['books', 'canon', 'speed', 'testament'],
    modes: ['solo', 'turn', 'team'],
    defaultMode: 'turn',
    howToPlay: [
      'A book of the Bible will appear on screen.',
      'Quickly decide if it belongs to the Old Testament or the New Testament.',
      'Answer as many as you can before the clock runs out!'
    ],

    start: function (api) {
      var data = getBibleData();
      if (!data || !data.books || !data.books.length) {
        FF.GameUI.exitCard(api, FF.t('noBooks', 'Books data not loaded'));
        return;
      }

      if (FF.Parallel && FF.Parallel.active()) { bibleBooksOnline(api, data.books); return; }

      var scorers = scorerList(api.config);
      var deck = api.util.shuffle(data.books.slice()).slice(0, 15);
      var idx = 0;
      var scorerIdx = 0;
      var streak = 0;

      function renderCard() {
        if (idx >= deck.length) {
          api.audio.play('winner');
          api.end({});
          return;
        }

        var book = deck[idx];
        var scorer = scorers[scorerIdx % scorers.length];
        api.shell.updateScores(scorer.id);

        FF.ui.clear(api.shell.root);

        var wrap = FF.GameUI.stage();

        wrap.appendChild(FF.GameUI.turnBar(scorers.length > 1 ? scorer : null, FF.t('bookOf', 'Book {n} of {total}', { n: idx + 1, total: deck.length })));

        var card = FF.ui.div('gm-card');
        card.appendChild(FF.GameUI.kicker(FF.t('whichTestament', 'Which testament?')));
        card.appendChild(FF.ui.el('h2', { class: 'gm-big' }, book.name));
        card.appendChild(FF.GameUI.note(FF.t('chaptersN', '{n} chapters', { n: book.chapters })));
        wrap.appendChild(card);

        var btnRow = FF.GameUI.duo();
        var otBtn = FF.GameUI.duoButton(FF.t('oldTestament', 'Old Testament'), function () { pick('OT', otBtn); }, 'up', 'scroll');
        var ntBtn = FF.GameUI.duoButton(FF.t('newTestament', 'New Testament'), function () { pick('NT', ntBtn); }, 'down', 'book-open');

        btnRow.appendChild(otBtn);
        btnRow.appendChild(ntBtn);
        wrap.appendChild(btnRow);

        api.shell.root.appendChild(wrap);

        var picked = false;
        function pick(choice, btn) {
          if (picked) return;
          picked = true;
          var isCorrect = (choice === book.testament);
          otBtn.disabled = true;
          ntBtn.disabled = true;
          FF.GameUI.markOption(book.testament === 'OT' ? otBtn : ntBtn, 'correct');
          if (!isCorrect && btn) FF.GameUI.markOption(btn, 'wrong');
          if (isCorrect) {
            streak++;
            api.audio.play('correct');
            api.scoring.add(scorer.id, 80 + (streak * 10), { correct: true });
          } else {
            streak = 0;
            api.audio.play('wrong');
            api.scoring.markAnswer(scorer.id, false);
          }
          api.shell.updateScores(scorer.id);
          wrap.appendChild(FF.GameUI.feedback(isCorrect ? 'good' : 'bad', isCorrect
            ? FF.t('correct', 'Correct!')
            : FF.t('bookIn', '{book} is in the {t}.', { book: book.name, t: book.testament === 'OT' ? FF.t('oldTestament', 'Old Testament') : FF.t('newTestament', 'New Testament') })));
          // A short beat so everyone sees the answer before the next book.
          setTimeout(function () {
            if (!FF.GameFlow.current) return;
            idx++;
            scorerIdx++;
            renderCard();
          }, isCorrect ? 650 : 1300);
        }
      }

      renderCard();
    }
  });

})();
