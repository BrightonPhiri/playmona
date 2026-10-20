/* ============================================================
   PLAYMORA — data/bible.js
   Content library for Bible games:
     - questions: Trivia spanning Old & New Testaments, Miracles,
                  Parables, Heroes of Faith, and Kids Bible.
     - whoAmI: Progressive clue riddles for Biblical figures.
     - verses: Memorable scriptures for unscramble & fill challenges.
     - books: The complete canon of 66 books categorized.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  FF.data = FF.data || {};

  FF.data.bible = {
    questions: [
      // Old Testament / Creation & Patriarchs
      { q: 'How many days did God take to create the world before resting on the seventh?', options: ['5', '6', '7', '10'], answer: 1, explanation: 'God created the heavens and the earth in 6 days and rested on the 7th (Genesis 2:2).', difficulty: 'easy', category: 'Old Testament' },
      { q: 'What was the name of the garden where Adam and Eve first lived?', options: ['Babylon', 'Gethsemane', 'Eden', 'Sinai'], answer: 2, explanation: 'The Lord God planted a garden in the east, in Eden (Genesis 2:8).', difficulty: 'easy', category: 'Kids' },
      { q: 'What sign did God place in the sky as a covenant never to flood the whole earth again?', options: ['A rainbow', 'A shooting star', 'A white dove', 'A pillar of cloud'], answer: 0, explanation: 'God set His rainbow in the clouds as a sign of the covenant (Genesis 9:13).', difficulty: 'easy', category: 'Kids' },
      { q: 'Who built the ark to survive the great flood?', options: ['Abraham', 'Moses', 'Noah', 'Enoch'], answer: 2, explanation: 'Noah found favor in the eyes of the Lord and built the ark (Genesis 6:8-14).', difficulty: 'easy', category: 'Kids' },
      { q: 'What were the names of Abraham and Sarah’s miracle son?', options: ['Isaac', 'Ishmael', 'Jacob', 'Esau'], answer: 0, explanation: 'Sarah gave birth to Isaac in her old age as God promised (Genesis 21:2-3).', difficulty: 'easy', category: 'Old Testament' },
      { q: 'Which son of Jacob received a colorful coat from his father and was sold into Egypt?', options: ['Benjamin', 'Judah', 'Joseph', 'Reuben'], answer: 2, explanation: 'Jacob loved Joseph more than any of his other sons and made him an ornate robe (Genesis 37:3).', difficulty: 'easy', category: 'Kids' },
      { q: 'What happened to Pharaoh’s dreams that Joseph was able to interpret through God?', options: ['7 stars falling', '7 fat cows eaten by 7 skinny cows', 'A fiery furnace', 'A giant statue of gold'], answer: 1, explanation: 'Pharaoh dreamed of 7 healthy cows devoured by 7 gaunt cows, foretelling 7 years of plenty and 7 of famine (Genesis 41).', difficulty: 'normal', category: 'Old Testament' },

      // Exodus & Law
      { q: 'Through what miracle did God speak to Moses in the desert of Horeb?', options: ['A roaring lion', 'A burning bush that was not consumed', 'A gentle whisper in the wind', 'Writing in the sand'], answer: 1, explanation: 'The angel of the Lord appeared in flames of fire from within a bush that did not burn up (Exodus 3:2).', difficulty: 'easy', category: 'Old Testament' },
      { q: 'What body of water did Moses part with his staff so the Israelites could escape Egypt?', options: ['River Jordan', 'Red Sea', 'Sea of Galilee', 'Dead Sea'], answer: 1, explanation: 'Moses stretched out his hand and the Lord drove the sea back with a strong east wind (Exodus 14:21).', difficulty: 'easy', category: 'Kids' },
      { q: 'What miraculous food did God provide from heaven each morning for the Israelites in the desert?', options: ['Manna', 'Pomegranate bread', 'Honey wafers', 'Figs'], answer: 0, explanation: 'When the dew vanished, thin flakes like frost appeared: Manna, meaning "What is it?" (Exodus 16:14-15).', difficulty: 'easy', category: 'Old Testament' },
      { q: 'On which mountain did Moses receive the Ten Commandments written on stone tablets?', options: ['Mount Carmel', 'Mount Sinai', 'Mount Nebo', 'Mount of Olives'], answer: 1, explanation: 'Moses went up to Mount Sinai to meet with God (Exodus 19–20).', difficulty: 'easy', category: 'Old Testament' },
      { q: 'Which commandment comes with a promise of long life?', options: ['You shall not steal', 'Honor your father and mother', 'Remember the Sabbath', 'You shall not murder'], answer: 1, explanation: '"Honor your father and mother, so that you may live long in the land" (Exodus 20:12; Ephesians 6:2).', difficulty: 'normal', category: 'Old Testament' },

      // Kings, Judges & Prophets
      { q: 'What weapon and items did young David use to defeat the giant Goliath?', options: ['A heavy bronze sword and shield', 'A spear and helmet', 'A sling and five smooth stones', 'A chariot of fire'], answer: 2, explanation: 'David chose five smooth stones from the stream, put them in his pouch, and took his sling (1 Samuel 17:40).', difficulty: 'easy', category: 'Kids' },
      { q: 'What supreme gift did young King Solomon ask God for when he became king?', options: ['Vast wealth and gold', 'A long life', 'Wisdom and an understanding heart', 'Victory over all enemies'], answer: 2, explanation: 'Solomon asked for wisdom to govern God’s great people, which pleased the Lord (1 Kings 3:9-10).', difficulty: 'easy', category: 'Old Testament' },
      { q: 'Which prophet was taken up to heaven in a chariot of fire and horses of fire?', options: ['Elisha', 'Elijah', 'Isaiah', 'Jeremiah'], answer: 1, explanation: 'A chariot of fire and horses of fire appeared, and Elijah went up to heaven in a whirlwind (2 Kings 2:11).', difficulty: 'normal', category: 'Old Testament' },
      { q: 'Who spent three days and three nights in the belly of a great fish after trying to flee from God?', options: ['Jonah', 'Job', 'Jeremiah', 'Joel'], answer: 0, explanation: 'The Lord provided a huge fish to swallow Jonah after he fled towards Tarshish (Jonah 1:17).', difficulty: 'easy', category: 'Kids' },
      { q: 'Who was thrown into the lions’ den because he refused to stop praying to the God of Israel?', options: ['Daniel', 'Shadrach', 'Meshach', 'Abednego'], answer: 0, explanation: 'Daniel was cast into the lions’ den, but God sent His angel to shut the lions’ mouths (Daniel 6:22).', difficulty: 'easy', category: 'Kids' },
      { q: 'What were the Babylonian names of the three Hebrew youths who survived the blazing furnace?', options: ['Cain, Abel, and Seth', 'Shem, Ham, and Japheth', 'Shadrach, Meshach, and Abednego', 'Hophni, Phinehas, and Eli'], answer: 2, explanation: 'Shadrach, Meshach, and Abednego were thrown into the blazing furnace and emerged unharmed (Daniel 3).', difficulty: 'normal', category: 'Old Testament' },
      { q: 'Which brave queen risked her life by going before the king unsummoned to save her people, saying "If I perish, I perish"?', options: ['Deborah', 'Ruth', 'Esther', 'Rebekah'], answer: 2, explanation: 'Queen Esther saved the Jewish people from Haman’s decree (Esther 4:16).', difficulty: 'normal', category: 'Old Testament' },
      { q: 'Who was Naomi’s faithful daughter-in-law who said, "Where you go I will go, and your people will be my people"?', options: ['Orpah', 'Ruth', 'Hannah', 'Miriam'], answer: 1, explanation: 'Ruth showed deep loyalty to Naomi and married Boaz in Bethlehem (Ruth 1:16).', difficulty: 'easy', category: 'Old Testament' },

      // Gospels & Jesus
      { q: 'In which town was Jesus Christ born?', options: ['Nazareth', 'Jerusalem', 'Bethlehem', 'Jericho'], answer: 2, explanation: 'Jesus was born in Bethlehem in Judea, during the time of King Herod (Matthew 2:1).', difficulty: 'easy', category: 'Kids' },
      { q: 'What gifts did the Magi (Wise Men) present to the young child Jesus?', options: ['Gold, silver, and precious stones', 'Gold, frankincense, and myrrh', 'Bread, wine, and olive oil', 'Silk, spices, and honey'], answer: 1, explanation: 'They bowed down and presented gifts of gold, frankincense, and myrrh (Matthew 2:11).', difficulty: 'easy', category: 'Gospels' },
      { q: 'Who baptized Jesus in the Jordan River?', options: ['John the Baptist', 'Peter', 'Simon of Cyrene', 'Nicodemus'], answer: 0, explanation: 'John the Baptist baptized Jesus, and the Holy Spirit descended like a dove (Matthew 3:13-16).', difficulty: 'easy', category: 'Kids' },
      { q: 'How many disciples did Jesus choose as His closest apostles?', options: ['7', '10', '12', '14'], answer: 2, explanation: 'Jesus called His twelve disciples to Himself (Matthew 10:1).', difficulty: 'easy', category: 'Kids' },
      { q: 'What was Jesus’ first recorded miracle in the Gospel of John?', options: ['Feeding the 5,000', 'Walking on water', 'Turning water into wine at Cana', 'Healing the blind man'], answer: 2, explanation: 'Jesus turned water into wine at the wedding in Cana of Galilee (John 2:1-11).', difficulty: 'normal', category: 'Miracles' },
      { q: 'With how many loaves of bread and fish did Jesus miraculously feed 5,000 men plus women and children?', options: ['5 loaves and 2 fish', '7 loaves and 3 fish', '12 loaves and 2 fish', '3 loaves and 5 fish'], answer: 0, explanation: 'A boy had five barley loaves and two small fish, which Jesus blessed and multiplied (John 6:9-11).', difficulty: 'easy', category: 'Kids' },
      { q: 'Which disciple stepped out of the boat to walk on water toward Jesus?', options: ['John', 'Peter', 'James', 'Andrew'], answer: 1, explanation: 'Peter got down out of the boat, walked on the water and came toward Jesus (Matthew 14:29).', difficulty: 'easy', category: 'Gospels' },
      { q: 'Whom did Jesus raise from the dead after he had been in the tomb for four days?', options: ['Jairus', 'Lazarus', 'Stephen', 'Bartimaeus'], answer: 1, explanation: 'Jesus called out in a loud voice, "Lazarus, come out!" and he came forth (John 11:43-44).', difficulty: 'normal', category: 'Miracles' },
      { q: 'In the Beatitudes from the Sermon on the Mount, who does Jesus say will inherit the earth?', options: ['The poor in spirit', 'The meek', 'The merciful', 'The peacemakers'], answer: 1, explanation: '"Blessed are the meek, for they will inherit the earth" (Matthew 5:5).', difficulty: 'normal', category: 'Gospels' },
      { q: 'What is the greatest commandment, according to Jesus in Matthew 22?', options: ['Give to the poor', 'Love the Lord your God with all your heart, soul, and mind', 'Do not judge others', 'Observe the feasts'], answer: 1, explanation: 'Jesus replied: "Love the Lord your God with all your heart and with all your soul and with all your mind" (Matthew 22:37).', difficulty: 'easy', category: 'Gospels' },
      { q: 'In the Parable of the Good Samaritan, who stopped to help the wounded traveler?', options: ['A priest', 'A Levite', 'A Samaritan', 'An innkeeper'], answer: 2, explanation: 'While the priest and Levite passed by on the other side, a Samaritan had compassion and bandaged his wounds (Luke 10:33).', difficulty: 'easy', category: 'Gospels' },
      { q: 'In the Parable of the Prodigal Son, what did the father do when he saw his wayward son returning from afar?', options: ['Locked the gate', 'Ran to him, threw his arms around him, and kissed him', 'Demanded repayment', 'Sent his servants to question him'], answer: 1, explanation: 'While he was still a long way off, his father saw him, was filled with compassion, ran, threw his arms around him, and kissed him (Luke 15:20).', difficulty: 'easy', category: 'Gospels' },

      // Passion & Resurrection
      { q: 'In what garden did Jesus pray in deep agony before His arrest?', options: ['Garden of Eden', 'Garden of Gethsemane', 'Pool of Siloam', 'Mount Zion'], answer: 1, explanation: 'Jesus went with His disciples to a place called Gethsemane to pray (Matthew 26:36).', difficulty: 'normal', category: 'Gospels' },
      { q: 'How many times did the apostle Peter deny knowing Jesus before the rooster crowed?', options: ['Once', 'Twice', 'Three times', 'Seven times'], answer: 2, explanation: 'Before the rooster crows, you will disown me three times (Matthew 26:75).', difficulty: 'easy', category: 'Kids' },
      { q: 'Who was the first person to see the risen Jesus on Easter Sunday morning in John 20?', options: ['Peter', 'John', 'Mary Magdalene', 'Mary the mother of Jesus'], answer: 2, explanation: 'Early on the first day of the week, Mary Magdalene went to the tomb and saw Jesus (John 20:1-16).', difficulty: 'normal', category: 'Gospels' },
      { q: 'On the road to which village did the resurrected Jesus walk and talk with two disciples unrecognized?', options: ['Nazareth', 'Emmaus', 'Capernaum', 'Bethany'], answer: 1, explanation: 'Two disciples were going to a village called Emmaus when Jesus drew near (Luke 24:13-15).', difficulty: 'normal', category: 'Gospels' },

      // Acts & Epistles
      { q: 'On what feast day did the Holy Spirit descend upon the believers as tongues of fire?', options: ['Passover', 'Pentecost', 'Tabernacles', 'Yom Kippur'], answer: 1, explanation: 'When the day of Pentecost came, they saw what seemed to be tongues of fire that separated and came to rest on each of them (Acts 2:1-3).', difficulty: 'normal', category: 'New Testament' },
      { q: 'Who was blinded by a radiant light on the road to Damascus and converted from a persecutor to an apostle?', options: ['Barnabas', 'Saul (Paul)', 'Silas', 'Timothy'], answer: 1, explanation: 'A light from heaven flashed around Saul, and Jesus spoke: "Saul, Saul, why do you persecute me?" (Acts 9:3-4).', difficulty: 'easy', category: 'New Testament' },
      { q: 'In Philippians 4:13, what can believers do through Christ who strengthens them?', options: ['Win all battles', 'Gain great wealth', 'Do all things', 'Fly like eagles'], answer: 2, explanation: '"I can do all things through Christ who strengthens me" (Philippians 4:13).', difficulty: 'easy', category: 'Wisdom' },
      { q: 'What is described in Galatians 5 as the Fruit of the Spirit?', options: ['Gold, silver, bronze', 'Love, joy, peace, patience, kindness, goodness, faithfulness, gentleness, self-control', 'Faith, hope, charity', 'Wisdom, courage, strength'], answer: 1, explanation: 'The fruit of the Spirit is love, joy, peace, forbearance, kindness, goodness, faithfulness, gentleness and self-control (Galatians 5:22-23).', difficulty: 'normal', category: 'Wisdom' },
      { q: 'According to 1 Corinthians 13:13, what three things remain, and which is the greatest?', options: ['Faith, Hope, and Love — the greatest is Love', 'Truth, Justice, and Mercy — the greatest is Mercy', 'Prayer, Fasting, and Giving — the greatest is Prayer', 'Wisdom, Knowledge, and Power — the greatest is Wisdom'], answer: 0, explanation: '"And now these three remain: faith, hope and love. But the greatest of these is love" (1 Corinthians 13:13).', difficulty: 'easy', category: 'Wisdom' },
      { q: 'What is the last book of the Christian Bible?', options: ['Jude', 'Hebrews', 'Revelation', 'Acts'], answer: 2, explanation: 'The Book of Revelation (Apocalypse of St. John) concludes the New Testament canon.', difficulty: 'easy', category: 'Kids' },
      { q: 'What is the longest chapter in the entire Bible?', options: ['Genesis 1', 'Psalm 23', 'Psalm 119', 'Isaiah 53'], answer: 2, explanation: 'Psalm 119 has 176 verses, celebrating God’s word and law.', difficulty: 'normal', category: 'Old Testament' },
      { q: 'What is the shortest verse in the English Bible (KJV/NIV)?', options: ['God is love', 'Jesus wept', 'Pray continually', 'Rejoice always'], answer: 1, explanation: '"Jesus wept" (John 11:35) is the shortest verse.', difficulty: 'easy', category: 'Kids' },
      { q: 'Who wrote the majority of the Psalms in the Bible?', options: ['Solomon', 'David', 'Moses', 'Asaph'], answer: 1, explanation: 'King David is credited with authoring at least 73 of the 150 Psalms.', difficulty: 'easy', category: 'Old Testament' }
    ],

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
