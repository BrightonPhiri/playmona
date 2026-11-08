/* ============================================================
   PLAYMONA — data/bibleAliases.js
   Other accepted names for people and books of the Bible, for the
   Expert (spelled) levels of the Bible games. People are keyed by
   the answer used in js/data/bible.js and js/data/bibleQuiz.js;
   books by their name in js/data/bible.js.

   Leave out what FF.AnswerMatch already forgives: case, accents,
   spaces, punctuation, a leading "the", and small spelling mistakes.
   "1 Kings" also accepts First Kings, I Kings and 1st Kings by itself
   (FF.BibleNames.book). Never list a name that belongs to someone or
   something else in the same game (Saul is not an alias of Paul: Saul
   is his own answer; John alone could be two people).
   Classic script, ES5.
   ============================================================ */
window.FF = window.FF || {};
(function () {
  'use strict';
  FF.data = FF.data || {};

  var PEOPLE = {
    'Abraham': ['Abram'],
    'Sarah': ['Sarai'],
    'Jacob': ['Israel'],
    'Rebekah': ['Rebecca'],
    'Noah': ['Noe'],
    'Gideon': ['Jerubbaal'],
    'David': ['King David'],
    'Solomon': ['King Solomon'],
    'Elijah': ['Elias'],
    'Isaiah': ['Esaias'],
    'Jeremiah': ['Jeremias', 'Jeremy'],
    'Jonah': ['Jonas'],
    'Daniel': ['Belteshazzar'],
    'Esther': ['Hadassah'],
    'Nebuchadnezzar': ['King Nebuchadnezzar', 'Nebuchadrezzar'],
    'Mary': ['Mary the mother of Jesus', 'Mary mother of Jesus', 'Virgin Mary', 'Mary, mother of Jesus'],
    'John the Baptist': ['John the Baptiser', 'John Baptist'],
    'John the apostle': ['John the Evangelist', 'John son of Zebedee', 'Saint John'],
    'Peter': ['Simon Peter', 'Simon', 'Cephas'],
    'Paul': ['Saul of Tarsus', 'Paul the apostle'],
    'Zacchaeus': ['Zaccheus'],
    'Mary Magdalene': ['Mary of Magdala'],
    'Thomas': ['Doubting Thomas', 'Didymus'],
    'Judas Iscariot': ['Judas'],
    'Matthew': ['Levi'],
    'Timothy': ['Timotheus'],
    'Silas': ['Silvanus'],
    'Pontius Pilate': ['Pilate'],
    'King Herod': ['Herod', 'Herod the Great'],
    'Elisabeth': ['Elizabeth'],
    'Dorcas': ['Tabitha'],
    'Luke': ['Luke the physician']
  };

  var BOOKS = {
    'Psalms': ['Psalm'],
    'Song of Solomon': ['Song of Songs', 'Canticles'],
    'Acts': ['Acts of the Apostles'],
    'Revelation': ['Revelation of John', 'Apocalypse'],
    'Ecclesiastes': ['Qoheleth'],
    'Lamentations': ['Lamentations of Jeremiah']
  };

  var ORDINALS = { 1: ['First', 'I', '1st'], 2: ['Second', 'II', '2nd'], 3: ['Third', 'III', '3rd'] };

  FF.data.bibleAliases = { people: PEOPLE, books: BOOKS };

  FF.BibleNames = {
    /* Every accepted name of a person, the answer first. Finds the person
       by their answer or by one of their other names ("Pilate"). */
    person: function (name) {
      var key = String(name || '');
      if (!PEOPLE[key]) {
        Object.keys(PEOPLE).forEach(function (k) { if (PEOPLE[k].indexOf(key) !== -1) key = k; });
      }
      return PEOPLE[key] ? [key].concat(PEOPLE[key]) : [String(name || '')];
    },
    /* Every accepted name of a book: "1 Kings" also as First Kings, I Kings and 1st Kings. */
    book: function (name) {
      var n = String(name || '');
      var out = [n].concat(BOOKS[n] || []);
      var m = /^([123]) (.+)$/.exec(n);
      if (m) ORDINALS[m[1]].forEach(function (o) { out.push(o + ' ' + m[2]); });
      return out;
    }
  };
})();
