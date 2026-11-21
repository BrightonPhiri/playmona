/* ============================================================
   PLAYMONA — celebrate/quiz/questions.js
   Ready-made questions for the quiz editor ("Add from ideas"), by
   kind. The organiser picks some and types the answers.

     FF.QuizQuestions.forKind('whoKnows', 'Vicky Banda')
       -> [{ key, text }]   {name} filled with the first name

   Written for birthdays and graduations alike; none assumes an
   age or a gender.
   Classic script, ES2017 or older, no DOM.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  function t(k, f, v) { return FF.t ? FF.t(k, f, v) : f.replace(/\{(\w+)\}/g, function (m, x) { return v && v[x] != null ? v[x] : m; }); }

  var IDEAS = {
    whoKnows: [
      ['firstJob', 'What was {name}\'s first job?'],
      ['favFood', 'What is {name}\'s favourite food?'],
      ['alwaysOrders', 'What does {name} always order when eating out?'],
      ['firstHoliday', 'Where did {name} go on their first holiday abroad?'],
      ['childDream', 'What did {name} want to be as a child?'],
      ['firstCar', 'What was {name}\'s first car?'],
      ['hiddenTalent', 'What is {name}\'s hidden talent?'],
      ['singAlong', 'Which song does {name} always sing along to?'],
      ['liveAnywhere', 'If {name} could live anywhere in the world, where would it be?'],
      ['morningCoffee', 'What is {name} like before their morning tea or coffee?'],
      ['favColour', 'What is {name}\'s favourite colour?'],
      ['favFilm', 'What is {name}\'s favourite film?'],
      ['comfortTv', 'Which TV show does {name} watch again and again?'],
      ['favSubject', 'What was {name}\'s favourite subject at school?'],
      ['bornWhere', 'In which town or city was {name} born?'],
      ['biggestFear', 'What is {name} most scared of?'],
      ['bestDish', 'Which dish does {name} cook best?'],
      ['neverEat', 'Which food will {name} never eat?'],
      ['favDrink', 'What is {name}\'s favourite drink?'],
      ['dreamTrip', 'Where is {name}\'s dream holiday?'],
      ['sayALot', 'What does {name} say all the time?'],
      ['firstPhone', 'What was {name}\'s first mobile phone?'],
      ['favSport', 'Which sport or team does {name} follow?'],
      ['weekend', 'What is {name}\'s idea of a perfect weekend?'],
      ['lateFor', 'What is {name} always late for?'],
      ['proudestMoment', 'What is {name}\'s proudest moment?'],
      ['favSeason', 'What is {name}\'s favourite time of year?'],
      ['petName', 'What was the name of {name}\'s first pet?'],
      ['superpower', 'Which superpower would {name} choose?'],
      ['danceMove', 'What is {name}\'s signature dance move?'],
      ['favSweet', 'What sweet treat can {name} never say no to?']
    ]
  };

  function forKind(kind, name) {
    var first = String(name || '').trim().split(/\s+/)[0] || t('quizThem', 'them');
    return (IDEAS[kind] || []).map(function (x) {
      return { key: x[0], text: t('quizIdea_' + x[0], x[1], { name: first }) };
    });
  }

  FF.QuizQuestions = { forKind: forKind };
})();
