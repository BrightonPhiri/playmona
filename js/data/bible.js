/* ============================================================
   PLAYMONA — data/bible.js
   Content library for Bible games:
     (Bible Quiz questions live in data/bibleQuiz.js.)
     - whoAmI: Progressive clue riddles for Biblical figures.
     - verses: Memorable scriptures for unscramble & fill challenges.
     - books: The complete canon of 66 books categorized.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  FF.data = FF.data || {};

  FF.data.bible = {
    whoAmI: [
      {
        answer: 'Moses',
        clues: [
          'As a baby, I was placed in a papyrus basket among the reeds of the Nile River.',
          'God appeared to me in a burning bush that did not burn up.',
          'With God’s power, I led the Israelites out of slavery in Egypt through the Red Sea.',
          'I went up to Mount Sinai and received the Ten Commandments written on stone.'
        ],
        difficulty: 'easy'
      },
      {
        answer: 'David',
        clues: [
          'I was the youngest son of Jesse and tended my father’s sheep in Bethlehem.',
          'With only a sling and five smooth stones, I struck down the giant Goliath.',
          'I was a skilled harpist and composed dozens of beloved Psalms.',
          'I became the greatest king of Israel and was called a man after God’s own heart.'
        ],
        difficulty: 'easy'
      },
      {
        answer: 'Noah',
        clues: [
          'I lived in a time when the earth was corrupt, but I walked faithfully with God.',
          'God instructed me to build a massive vessel made of gopher wood covered with pitch.',
          'I brought pairs of every living creature onto the ark with my family.',
          'After the great flood receded, God sent a rainbow as an eternal promise to me.'
        ],
        difficulty: 'easy'
      },
      {
        answer: 'Abraham',
        clues: [
          'God called me to leave my homeland in Ur and go to a land He would show me.',
          'God promised me that my descendants would be as numerous as the stars in the night sky.',
          'My original name was Abram before God gave me a new name meaning "Father of many nations".',
          'My wife Sarah and I were blessed with our son Isaac in our very old age.'
        ],
        difficulty: 'normal'
      },
      {
        answer: 'Joseph',
        clues: [
          'My father loved me dearly and gave me an ornate coat of many colors.',
          'My jealous brothers threw me into a cistern and sold me as a slave into Egypt.',
          'God gave me the ability to interpret Pharaoh’s dreams of seven fat and skinny cows.',
          'I became governor of all Egypt and saved my entire family during a severe famine.'
        ],
        difficulty: 'easy'
      },
      {
        answer: 'Daniel',
        clues: [
          'I was taken captive to Babylon as a youth and resolved not to defile myself with royal food.',
          'God gave me wisdom to interpret King Nebuchadnezzar’s mysterious dreams.',
          'When an unchangeable decree forbade prayer to anyone but the king, I continued praying by my open window.',
          'I was thrown into a den of hungry lions, but God shut the lions’ mouths.'
        ],
        difficulty: 'easy'
      },
      {
        answer: 'Esther',
        clues: [
          'I was an orphaned Jewish girl raised by my wise older cousin Mordecai.',
          'I was chosen by King Xerxes to become the Queen of the Persian Empire.',
          'When wicked Haman plotted to annihilate my people, I called for three days of fasting.',
          'I courageously approached the king unsummoned, proclaiming, "If I perish, I perish."'
        ],
        difficulty: 'normal'
      },
      {
        answer: 'Peter',
        clues: [
          'I was a humble fisherman on the Sea of Galilee before Jesus called me to follow Him.',
          'Jesus said to me, "Follow Me, and I will make you fishers of men."',
          'I stepped out of the boat to walk on water toward Jesus, and later confessed Him as the Christ.',
          'Though I denied Jesus three times on the night of His arrest, He restored me to feed His sheep.'
        ],
        difficulty: 'easy'
      },
      {
        answer: 'Paul',
        clues: [
          'I was born in Tarsus, was a strict Pharisee, and originally persecuted early Christians.',
          'On the road to Damascus, a blinding light shone from heaven and Jesus spoke directly to me.',
          'I was healed of my blindness and baptized, becoming the Apostle to the Gentiles.',
          'I took three missionary journeys across the Mediterranean and wrote many New Testament epistles.'
        ],
        difficulty: 'normal'
      },
      {
        answer: 'Jonah',
        clues: [
          'God commanded me to go preach repentance to the great city of Nineveh.',
          'Instead of obeying, I boarded a ship heading in the exact opposite direction toward Tarshish.',
          'A violent storm arose at sea, and the sailors threw me overboard at my own request.',
          'I spent three days and three nights in the belly of a huge fish before repenting.'
        ],
        difficulty: 'easy'
      },
      {
        answer: 'Solomon',
        clues: [
          'I was the son of King David and Bathsheba.',
          'When God offered me anything in a dream, I asked not for riches, but for wisdom.',
          'Two mothers came before me claiming the same baby, and I wisely discerned the true mother.',
          'I built the magnificent First Temple in Jerusalem and wrote many Proverbs.'
        ],
        difficulty: 'normal'
      },
      {
        answer: 'Elijah',
        clues: [
          'I was a fiery prophet from Tishbe in Gilead during the reign of wicked King Ahab.',
          'Ravens brought me bread and meat by the brook Cherith during a severe drought.',
          'On Mount Carmel, I challenged 450 prophets of Baal to a contest of fire from heaven.',
          'I did not taste death, but was caught up to heaven in a whirlwind by a chariot of fire.'
        ],
        difficulty: 'hard'
      },
      {
        answer: 'Mary',
        clues: [
          'I was a humble young woman living in the town of Nazareth, betrothed to a carpenter named Joseph.',
          'The angel Gabriel visited me and greeted me as "highly favored of the Lord."',
          'I sang the song of praise known as the Magnificat, rejoicing in God my Savior.',
          'I gave birth to Jesus Christ in Bethlehem and laid Him in a manger.'
        ],
        difficulty: 'easy'
      },
      {
        answer: 'John the Baptist',
        clues: [
          'My miraculous birth was announced to my father Zechariah in the temple when he was old.',
          'I lived in the Judean wilderness, wore camel’s hair clothing, and ate locusts and wild honey.',
          'I preached a baptism of repentance, crying out: "Prepare the way of the Lord!"',
          'I pointed to Jesus and said, "Look, the Lamb of God who takes away the sin of the world!"'
        ],
        difficulty: 'normal'
      }
    ],

    verses: [
      {
        reference: 'John 3:16',
        text: 'For God so loved the world that He gave His only begotten Son, that whoever believes in Him should not perish but have everlasting life.',
        scramble: ['For', 'God', 'so', 'loved', 'the', 'world', 'that', 'He', 'gave', 'His', 'only', 'Son'],
        difficulty: 'easy'
      },
      {
        reference: 'Psalm 23:1',
        text: 'The Lord is my shepherd; I shall not want.',
        scramble: ['The', 'Lord', 'is', 'my', 'shepherd', 'I', 'shall', 'not', 'want'],
        difficulty: 'easy'
      },
      {
        reference: 'Philippians 4:13',
        text: 'I can do all things through Christ who strengthens me.',
        scramble: ['I', 'can', 'do', 'all', 'things', 'through', 'Christ', 'who', 'strengthens', 'me'],
        difficulty: 'easy'
      },
      {
        reference: 'Proverbs 3:5',
        text: 'Trust in the Lord with all your heart, and lean not on your own understanding.',
        scramble: ['Trust', 'in', 'the', 'Lord', 'with', 'all', 'your', 'heart', 'and', 'lean', 'not', 'on', 'understanding'],
        difficulty: 'normal'
      },
      {
        reference: 'Genesis 1:1',
        text: 'In the beginning God created the heavens and the earth.',
        scramble: ['In', 'the', 'beginning', 'God', 'created', 'the', 'heavens', 'and', 'the', 'earth'],
        difficulty: 'easy'
      },
      {
        reference: 'Romans 8:28',
        text: 'And we know that all things work together for good to those who love God.',
        scramble: ['And', 'we', 'know', 'that', 'all', 'things', 'work', 'together', 'for', 'good'],
        difficulty: 'normal'
      },
      {
        reference: 'Joshua 1:9',
        text: 'Be strong and of good courage; do not be afraid, for the Lord your God is with you.',
        scramble: ['Be', 'strong', 'and', 'of', 'good', 'courage', 'do', 'not', 'be', 'afraid'],
        difficulty: 'normal'
      },
      {
        reference: 'Matthew 28:19',
        text: 'Go therefore and make disciples of all nations, baptizing them in the name of the Father, Son, and Holy Spirit.',
        scramble: ['Go', 'therefore', 'and', 'make', 'disciples', 'of', 'all', 'the', 'nations'],
        difficulty: 'normal'
      }
    ],

    books: [
      // Old Testament - Law (Torah / Pentateuch)
      { name: 'Genesis', testament: 'OT', division: 'Law', order: 1, chapters: 50 },
      { name: 'Exodus', testament: 'OT', division: 'Law', order: 2, chapters: 40 },
      { name: 'Leviticus', testament: 'OT', division: 'Law', order: 3, chapters: 27 },
      { name: 'Numbers', testament: 'OT', division: 'Law', order: 4, chapters: 36 },
      { name: 'Deuteronomy', testament: 'OT', division: 'Law', order: 5, chapters: 34 },
      // Old Testament - History
      { name: 'Joshua', testament: 'OT', division: 'History', order: 6, chapters: 24 },
      { name: 'Judges', testament: 'OT', division: 'History', order: 7, chapters: 21 },
      { name: 'Ruth', testament: 'OT', division: 'History', order: 8, chapters: 4 },
      { name: '1 Samuel', testament: 'OT', division: 'History', order: 9, chapters: 31 },
      { name: '2 Samuel', testament: 'OT', division: 'History', order: 10, chapters: 24 },
      { name: '1 Kings', testament: 'OT', division: 'History', order: 11, chapters: 22 },
      { name: '2 Kings', testament: 'OT', division: 'History', order: 12, chapters: 25 },
      { name: '1 Chronicles', testament: 'OT', division: 'History', order: 13, chapters: 29 },
      { name: '2 Chronicles', testament: 'OT', division: 'History', order: 14, chapters: 36 },
      { name: 'Ezra', testament: 'OT', division: 'History', order: 15, chapters: 10 },
      { name: 'Nehemiah', testament: 'OT', division: 'History', order: 16, chapters: 13 },
      { name: 'Esther', testament: 'OT', division: 'History', order: 17, chapters: 10 },
      // Old Testament - Poetry / Wisdom
      { name: 'Job', testament: 'OT', division: 'Poetry', order: 18, chapters: 42 },
      { name: 'Psalms', testament: 'OT', division: 'Poetry', order: 19, chapters: 150 },
      { name: 'Proverbs', testament: 'OT', division: 'Poetry', order: 20, chapters: 31 },
      { name: 'Ecclesiastes', testament: 'OT', division: 'Poetry', order: 21, chapters: 12 },
      { name: 'Song of Solomon', testament: 'OT', division: 'Poetry', order: 22, chapters: 8 },
      // Old Testament - Major Prophets
      { name: 'Isaiah', testament: 'OT', division: 'Major Prophets', order: 23, chapters: 66 },
      { name: 'Jeremiah', testament: 'OT', division: 'Major Prophets', order: 24, chapters: 52 },
      { name: 'Lamentations', testament: 'OT', division: 'Major Prophets', order: 25, chapters: 5 },
      { name: 'Ezekiel', testament: 'OT', division: 'Major Prophets', order: 26, chapters: 48 },
      { name: 'Daniel', testament: 'OT', division: 'Major Prophets', order: 27, chapters: 12 },
      // Old Testament - Minor Prophets
      { name: 'Hosea', testament: 'OT', division: 'Minor Prophets', order: 28, chapters: 14 },
      { name: 'Joel', testament: 'OT', division: 'Minor Prophets', order: 29, chapters: 3 },
      { name: 'Amos', testament: 'OT', division: 'Minor Prophets', order: 30, chapters: 9 },
      { name: 'Obadiah', testament: 'OT', division: 'Minor Prophets', order: 31, chapters: 1 },
      { name: 'Jonah', testament: 'OT', division: 'Minor Prophets', order: 32, chapters: 4 },
      { name: 'Micah', testament: 'OT', division: 'Minor Prophets', order: 33, chapters: 7 },
      { name: 'Nahum', testament: 'OT', division: 'Minor Prophets', order: 34, chapters: 3 },
      { name: 'Habakkuk', testament: 'OT', division: 'Minor Prophets', order: 35, chapters: 3 },
      { name: 'Zephaniah', testament: 'OT', division: 'Minor Prophets', order: 36, chapters: 3 },
      { name: 'Haggai', testament: 'OT', division: 'Minor Prophets', order: 37, chapters: 2 },
      { name: 'Zechariah', testament: 'OT', division: 'Minor Prophets', order: 38, chapters: 14 },
      { name: 'Malachi', testament: 'OT', division: 'Minor Prophets', order: 39, chapters: 4 },

      // New Testament - Gospels & Acts
      { name: 'Matthew', testament: 'NT', division: 'Gospels', order: 40, chapters: 28 },
      { name: 'Mark', testament: 'NT', division: 'Gospels', order: 41, chapters: 16 },
      { name: 'Luke', testament: 'NT', division: 'Gospels', order: 42, chapters: 24 },
      { name: 'John', testament: 'NT', division: 'Gospels', order: 43, chapters: 21 },
      { name: 'Acts', testament: 'NT', division: 'History NT', order: 44, chapters: 28 },
      // New Testament - Epistles (Letters)
      { name: 'Romans', testament: 'NT', division: 'Epistles', order: 45, chapters: 16 },
      { name: '1 Corinthians', testament: 'NT', division: 'Epistles', order: 46, chapters: 16 },
      { name: '2 Corinthians', testament: 'NT', division: 'Epistles', order: 47, chapters: 13 },
      { name: 'Galatians', testament: 'NT', division: 'Epistles', order: 48, chapters: 6 },
      { name: 'Ephesians', testament: 'NT', division: 'Epistles', order: 49, chapters: 6 },
      { name: 'Philippians', testament: 'NT', division: 'Epistles', order: 50, chapters: 4 },
      { name: 'Colossians', testament: 'NT', division: 'Epistles', order: 51, chapters: 4 },
      { name: '1 Thessalonians', testament: 'NT', division: 'Epistles', order: 52, chapters: 5 },
      { name: '2 Thessalonians', testament: 'NT', division: 'Epistles', order: 53, chapters: 3 },
      { name: '1 Timothy', testament: 'NT', division: 'Epistles', order: 54, chapters: 6 },
      { name: '2 Timothy', testament: 'NT', division: 'Epistles', order: 55, chapters: 4 },
      { name: 'Titus', testament: 'NT', division: 'Epistles', order: 56, chapters: 3 },
      { name: 'Philemon', testament: 'NT', division: 'Epistles', order: 57, chapters: 1 },
      { name: 'Hebrews', testament: 'NT', division: 'Epistles', order: 58, chapters: 13 },
      { name: 'James', testament: 'NT', division: 'Epistles', order: 59, chapters: 5 },
      { name: '1 Peter', testament: 'NT', division: 'Epistles', order: 60, chapters: 5 },
      { name: '2 Peter', testament: 'NT', division: 'Epistles', order: 61, chapters: 3 },
      { name: '1 John', testament: 'NT', division: 'Epistles', order: 62, chapters: 5 },
      { name: '2 John', testament: 'NT', division: 'Epistles', order: 63, chapters: 1 },
      { name: '3 John', testament: 'NT', division: 'Epistles', order: 64, chapters: 1 },
      { name: 'Jude', testament: 'NT', division: 'Epistles', order: 65, chapters: 1 },
      // New Testament - Prophecy
      { name: 'Revelation', testament: 'NT', division: 'Prophecy', order: 66, chapters: 22 }
    ]
  };
})();
