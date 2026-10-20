/* ============================================================
   FAMILY FUN — games/bibleGames.js
   Four complete, family-friendly Bible games:
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
    return [{ id: 'p1', name: 'Player 1', avatar: '😀', color: '#8b5cf6' }];
  }

  function getBibleData() {
    return (FF.data && FF.data.bible) ? FF.data.bible : null;
  }

  /* ============================================================
     1. BIBLE QUIZ
     ============================================================ */
  FF.registerGame({
    id: 'bibleQuiz',
    name: 'Bible Quiz',
    description: 'Test your knowledge on stories, miracles, heroes of faith, and scripture!',
    category: 'bible',
    icon: '📖',
    players: [1, 8],
    difficulty: 'Normal',
    duration: 4,
    tags: ['quiz', 'faith', 'trivia', 'family'],
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
      var totalRounds = (api.config.length === 'quick') ? 6 : (api.config.length === 'long' ? 15 : 10);
      var racing = !!(FF.Race && FF.Race.active());
      if (racing && FF.Room && FF.Room.current()) {
        FF.Random.seed(FF.Random.roundSeed(FF.Room.current().meta.seed, api.def.id, 'deck'));
      }
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

        var wrap = FF.ui.el('div', {
          style: { maxWidth: '680px', margin: '0 auto', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '16px' }
        });

        // Round & active player header
        var headRow = FF.ui.div('rm-row');
        headRow.appendChild(FF.ui.el('span', { class: 'meta-chip' }, 'Question ' + (currentIndex + 1) + ' of ' + questions.length));
        headRow.appendChild(FF.ui.el('span', { class: 'meta-chip' }, '📖 ' + (q.category || 'Bible')));
        if (scorers.length > 1 && !race) {
          headRow.appendChild(FF.ui.el('span', {
            class: 'meta-chip',
            style: { background: scorer.color || 'var(--accent)', color: '#fff', fontWeight: '800' }
          }, scorer.name + "'s Turn"));
        }
        wrap.appendChild(headRow);

        // Question text
        var qBox = FF.ui.el('div', {
          class: 'panel',
          style: { padding: '24px 20px', borderRadius: '18px', background: 'var(--surface)', border: '2px solid var(--border)' }
        });
        qBox.appendChild(FF.ui.el('h2', {
          style: { fontSize: 'clamp(1.2rem, 3.5vw, 1.7rem)', fontWeight: '800', lineHeight: '1.3' }
        }, q.q));
        wrap.appendChild(qBox);

        // Options grid
        var optGrid = FF.ui.el('div', {
          style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }
        });

        q.options.forEach(function (optText, idx) {
          var btn = FF.ui.el('button', {
            type: 'button',
            class: 'btn bible-quiz-option',
            tabindex: 0,
            style: {
              padding: '16px 20px', fontSize: '1.05rem', fontWeight: '700',
              textAlign: 'left', borderRadius: '14px', border: '2px solid var(--border)',
              background: 'var(--surface)', color: 'var(--text)', transition: 'all .15s ease'
            },
            onclick: function () {
              if (answered) return;
              handleAnswer(idx, btn, optGrid, q);
            }
          }, [
            FF.ui.el('span', {
              style: {
                display: 'inline-block', width: '28px', height: '28px', lineHeight: '28px',
                textAlign: 'center', borderRadius: '8px', background: 'var(--accent-soft)',
                color: 'var(--accent)', marginRight: '10px', fontWeight: '800'
              }
            }, String.fromCharCode(65 + idx)),
            document.createTextNode(optText)
          ]);
          optGrid.appendChild(btn);
        });

        wrap.appendChild(optGrid);

        var feedbackBox = FF.ui.div('hint hidden');
        feedbackBox.id = 'bible-quiz-feedback';
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

        if (race) race.beginRound(currentIndex).then(function () { race.gate(openQuestion); });
        else openQuestion();
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
          if (i === q.answer) {
            b.style.borderColor = 'var(--success)';
            b.style.background = 'rgba(16, 185, 129, 0.18)';
          } else if (i === choiceIdx && !isCorrect) {
            b.style.borderColor = 'var(--danger)';
            b.style.background = 'rgba(239, 68, 68, 0.18)';
          }
        });

        var feedback = document.getElementById('bible-quiz-feedback');
        if (feedback) {
          feedback.classList.remove('hidden');
          feedback.innerHTML = '<strong>' + (isCorrect ? '✅ Correct!' : '❌ ' + (choiceIdx === -1 ? 'Time is up!' : 'Not quite!')) + '</strong> ' + (q.explanation || '');
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
          var isLast = currentIndex >= questions.length - 1;
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
      var totalCards = (api.config.length === 'quick') ? 4 : (api.config.length === 'long' ? 10 : 6);
      var deck = api.util.shuffle(data.whoAmI.slice()).slice(0, totalCards);

      var cardIdx = 0;
      var scorerIdx = 0;
      var clueLevel = 0;
      var clueTimer = null;
      var resolved = false;

      function renderCard() {
        if (cardIdx >= deck.length) {
          api.audio.play('winner');
          api.end({});
          return;
        }

        resolved = false;
        clueLevel = 1;
        var item = deck[cardIdx];
        var scorer = scorers[scorerIdx % scorers.length];
        api.shell.updateScores(scorer.id);

        // Generate 3 random wrong options from other characters
        var distractors = data.whoAmI
          .filter(function (x) { return x.answer !== item.answer; })
          .map(function (x) { return x.answer; });
        distractors = api.util.shuffle(distractors).slice(0, 3);
        var choices = api.util.shuffle([item.answer].concat(distractors));

        FF.ui.clear(api.shell.root);

        var wrap = FF.ui.el('div', {
          style: { maxWidth: '680px', margin: '0 auto', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '16px' }
        });

        var head = FF.ui.div('rm-row');
        head.appendChild(FF.ui.el('span', { class: 'meta-chip' }, 'Figure ' + (cardIdx + 1) + ' of ' + deck.length));
        head.appendChild(FF.ui.el('span', { class: 'meta-chip' }, scorer.name + "'s Turn"));
        wrap.appendChild(head);

        var clueContainer = FF.ui.el('div', {
          class: 'panel',
          style: { padding: '24px', borderRadius: '20px', background: 'var(--surface)', border: '2px solid var(--border)', textAlign: 'left' }
        });
        clueContainer.id = 'clue-box';

        var clueTitle = FF.ui.el('h2', { style: { textAlign: 'center', marginBottom: '16px', fontSize: '1.4rem' } }, '🔍 Who Am I?');
        clueContainer.appendChild(clueTitle);

        var clueList = FF.ui.el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });
        clueList.id = 'clue-items';
        clueContainer.appendChild(clueList);
        wrap.appendChild(clueContainer);

        // Next clue countdown / button
        var clueProgress = FF.ui.el('div', { class: 'rm-row', style: { justifyContent: 'space-between' } });
        var clueCountText = FF.ui.el('span', { class: 'hint', style: { margin: 0 } }, 'Clue 1 of ' + item.clues.length);
        clueCountText.id = 'clue-counter';
        var nextClueBtn = FF.ui.button('Next Clue ⏭', {
          class: 'mini-btn',
          onClick: function () { advanceClue(); }
        });
        nextClueBtn.id = 'next-clue-btn';
        clueProgress.appendChild(clueCountText);
        clueProgress.appendChild(nextClueBtn);
        wrap.appendChild(clueProgress);

        // Choice buttons
        var choiceGrid = FF.ui.el('div', {
          style: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }
        });

        choices.forEach(function (name) {
          var b = FF.ui.el('button', {
            type: 'button',
            class: 'btn',
            tabindex: 0,
            style: {
              padding: '16px', fontSize: '1.15rem', fontWeight: '800',
              borderRadius: '16px', border: '2px solid var(--border)', background: 'var(--surface)'
            },
            onclick: function () {
              if (resolved) return;
              submitGuess(name, b, choiceGrid, item);
            }
          }, name);
          choiceGrid.appendChild(b);
        });

        wrap.appendChild(choiceGrid);
        api.shell.root.appendChild(wrap);

        updateCluesDisplay(item);
        startClueTimer(item);
      }

      function updateCluesDisplay(item) {
        var list = document.getElementById('clue-items');
        var counter = document.getElementById('clue-counter');
        var nextBtn = document.getElementById('next-clue-btn');
        if (!list) return;

        FF.ui.clear(list);
        for (var i = 0; i < clueLevel; i++) {
          var row = FF.ui.el('div', {
            style: {
              padding: '12px 14px', borderRadius: '12px',
              background: (i === clueLevel - 1) ? 'var(--accent-soft)' : 'var(--surface-2)',
              borderLeft: '4px solid var(--accent)',
              fontWeight: (i === clueLevel - 1) ? '700' : '600'
            }
          }, (i + 1) + '. ' + item.clues[i]);
          list.appendChild(row);
        }

        if (counter) counter.textContent = 'Clue ' + clueLevel + ' of ' + item.clues.length;
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

        var buttons = choiceGrid.querySelectorAll('button');
        buttons.forEach(function (b) {
          b.disabled = true;
          if (b.textContent === item.answer) {
            b.style.borderColor = 'var(--success)';
            b.style.background = 'rgba(16, 185, 129, 0.2)';
          } else if (b === btn && !isCorrect) {
            b.style.borderColor = 'var(--danger)';
            b.style.background = 'rgba(239, 68, 68, 0.2)';
          }
        });

        // Award points inversely proportional to clues used
        if (isCorrect) {
          api.audio.play('correct');
          var points = (5 - clueLevel) * 75; // 300 for clue 1, 225 for clue 2, 150 for clue 3, 75 for clue 4
          api.scoring.add(scorer.id, points, { correct: true });
        } else {
          api.audio.play('wrong');
          api.scoring.markAnswer(scorer.id, false);
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
      var rounds = (api.config.length === 'quick') ? 3 : 5;
      var verses = api.util.shuffle(data.verses.slice()).slice(0, rounds);

      var verseIdx = 0;
      var scorerIdx = 0;
      var assembled = [];
      var targetWords = [];
      var poolWords = [];
      var solved = false;

      function renderVerse() {
        if (verseIdx >= verses.length) {
          api.audio.play('winner');
          api.end({});
          return;
        }

        solved = false;
        assembled = [];
        var item = verses[verseIdx];
        var scorer = scorers[scorerIdx % scorers.length];
        api.shell.updateScores(scorer.id);

        targetWords = item.scramble.slice();
        poolWords = api.util.shuffle(targetWords.slice());

        FF.ui.clear(api.shell.root);

        var wrap = FF.ui.el('div', {
          style: { maxWidth: '720px', margin: '0 auto', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '16px' }
        });

        var head = FF.ui.div('rm-row');
        head.appendChild(FF.ui.el('span', { class: 'meta-chip' }, 'Verse ' + (verseIdx + 1) + ' of ' + verses.length));
        head.appendChild(FF.ui.el('span', { class: 'meta-chip', style: { fontWeight: '800' } }, '📖 ' + item.reference));
        if (scorers.length > 1) {
          head.appendChild(FF.ui.el('span', { class: 'meta-chip' }, scorer.name));
        }
        wrap.appendChild(head);

        // Assembly container (sentence preview)
        var assembleBox = FF.ui.el('div', {
          class: 'panel',
          style: {
            minHeight: '120px', padding: '18px', borderRadius: '18px',
            background: 'var(--surface)', border: '2px dashed var(--accent)',
            display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', justifyContent: 'center'
          }
        });
        assembleBox.id = 'assemble-box';
        wrap.appendChild(assembleBox);

        // Pool container
        var poolBox = FF.ui.el('div', {
          style: { display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', padding: '10px 0' }
        });
        poolBox.id = 'pool-box';
        wrap.appendChild(poolBox);

        // Action buttons (Clear / Check)
        var actionRow = FF.ui.div('rm-row');
        var clearBtn = FF.ui.button('Clear', {
          class: 'btn',
          onClick: function () {
            assembled = [];
            poolWords = api.util.shuffle(targetWords.slice());
            refreshDisplay();
          }
        });
        actionRow.appendChild(clearBtn);
        wrap.appendChild(actionRow);

        api.shell.root.appendChild(wrap);

        function refreshDisplay() {
          FF.ui.clear(assembleBox);
          FF.ui.clear(poolBox);

          if (!assembled.length) {
            assembleBox.appendChild(FF.ui.el('span', { class: 'hint', style: { fontStyle: 'italic' } }, 'Tap words below in order…'));
          } else {
            assembled.forEach(function (word, idx) {
              var wBtn = FF.ui.el('button', {
                type: 'button',
                class: 'btn',
                style: {
                  padding: '10px 16px', fontSize: '1.1rem', fontWeight: '700',
                  borderRadius: '12px', background: 'var(--accent)', color: '#fff', border: 'none'
                },
                onclick: function () {
                  if (solved) return;
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
              class: 'btn',
              style: {
                padding: '12px 18px', fontSize: '1.05rem', fontWeight: '700',
                borderRadius: '14px', background: 'var(--surface)', border: '2px solid var(--border)',
                boxShadow: 'var(--shadow)'
              },
              onclick: function () {
                if (solved) return;
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

          if (isMatch) {
            solved = true;
            api.shell.hideTimer();
            api.audio.play('correct');
            assembleBox.style.borderColor = 'var(--success)';
            assembleBox.style.background = 'rgba(16, 185, 129, 0.15)';
            api.scoring.add(scorer.id, 150, { correct: true });
            api.shell.updateScores(scorer.id);

            setTimeout(function () {
              verseIdx++;
              scorerIdx++;
              renderVerse();
            }, 1800);
          } else {
            api.audio.play('wrong');
            assembleBox.style.borderColor = 'var(--danger)';
            setTimeout(function () {
              assembleBox.style.borderColor = 'var(--accent)';
            }, 600);
          }
        }

        refreshDisplay();
        var timerSecs = api.config.timer != null ? api.config.timer : 30;
        if (timerSecs > 0) {
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
        api.shell.root.innerHTML = '<div class="empty">Books data not loaded.</div>';
        return;
      }

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

        var wrap = FF.ui.el('div', {
          style: { maxWidth: '580px', margin: '0 auto', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '20px' }
        });

        var head = FF.ui.div('rm-row');
        head.appendChild(FF.ui.el('span', { class: 'meta-chip' }, 'Book ' + (idx + 1) + ' of ' + deck.length));
        if (scorers.length > 1) head.appendChild(FF.ui.el('span', { class: 'meta-chip' }, scorer.name));
        wrap.appendChild(head);

        var card = FF.ui.el('div', {
          class: 'panel',
          style: { padding: '36px 20px', borderRadius: '24px', background: 'var(--surface)', border: '2px solid var(--border)' }
        });
        card.appendChild(FF.ui.el('div', { style: { fontSize: '1.2rem', color: 'var(--muted)', fontWeight: '700', marginBottom: '8px' } }, 'Which Testament?'));
        card.appendChild(FF.ui.el('h1', { style: { fontSize: 'clamp(2.2rem, 6vw, 3.2rem)', fontWeight: '900', color: 'var(--accent)' } }, book.name));
        card.appendChild(FF.ui.el('div', { style: { fontSize: '0.95rem', color: 'var(--muted)', marginTop: '8px' } }, book.chapters + ' chapters'));
        wrap.appendChild(card);

        var btnRow = FF.ui.el('div', {
          style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }
        });

        var otBtn = FF.ui.el('button', {
          type: 'button', class: 'btn btn-lg',
          style: { padding: '24px 16px', fontSize: '1.25rem', fontWeight: '800', borderRadius: '18px' },
          onclick: function () { pick('OT'); }
        }, '📜 Old Testament (39)');

        var ntBtn = FF.ui.el('button', {
          type: 'button', class: 'btn btn-lg',
          style: { padding: '24px 16px', fontSize: '1.25rem', fontWeight: '800', borderRadius: '18px' },
          onclick: function () { pick('NT'); }
        }, '✝️ New Testament (27)');

        btnRow.appendChild(otBtn);
        btnRow.appendChild(ntBtn);
        wrap.appendChild(btnRow);

        api.shell.root.appendChild(wrap);

        function pick(choice) {
          var isCorrect = (choice === book.testament);
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
          idx++;
          scorerIdx++;
          renderCard();
        }
      }

      renderCard();
    }
  });

})();
