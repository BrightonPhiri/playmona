/* ============================================================
   PLAYMONA — data/bible.js
   Content for three Bible games (Bible Quiz has its own bank in
   data/bibleQuiz.js). Quoted words are from the King James Version
   (public domain); clues and notes are our own words.
     - whoAmI: people of the Bible, four clues each, hardest first.
     - verses: well-known verses, word for word, for Verse Rush.
     - books:  the 66 books, with their part of the Bible and a key verse.
   Levels: k = kids, f = family, s = scholar.
   Classic script, ES5.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  FF.data = FF.data || {};

  var LEVELS = { k: 'kids', f: 'family', s: 'scholar' };

  /* ---------- Who Am I? ----------
     [name, level, testament, m|f, [four clues, hardest first: the last
      one gives it away], where the story is, [verse ref, KJV text]] */
  var WHO = [
    ['Adam', 'k', 'OT', 'm', [
      'I lived nine hundred and thirty years.',
      'God took one of my ribs while I slept.',
      'I gave names to every beast and every bird.',
      'I was the first man, made from the dust of the ground.'
    ], 'Genesis 2 – 5', ['Genesis 2:7', 'And the LORD God formed man of the dust of the ground, and breathed into his nostrils the breath of life; and man became a living soul.']],
    ['Eve', 'k', 'OT', 'f', [
      'I was called the mother of all living.',
      'My sons were Cain, Abel and Seth.',
      'A serpent spoke to me in a garden.',
      'I was the first woman, made from a rib of the first man.'
    ], 'Genesis 2 – 4', ['Genesis 3:20', 'And Adam called his wife’s name Eve; because she was the mother of all living.']],
    ['Noah', 'k', 'OT', 'm', [
      'My father was Lamech, and my sons were Shem, Ham and Japheth.',
      'I sent out a raven, and then a dove.',
      'God told me to build a great boat of gopher wood.',
      'After the flood, God set a rainbow in the cloud as a promise to me.'
    ], 'Genesis 6 – 9', ['Genesis 6:8', 'But Noah found grace in the eyes of the LORD.']],
    ['Abraham', 'k', 'OT', 'm', [
      'I gave a tenth of everything to Melchizedek, king of Salem.',
      'God changed my name from Abram.',
      'God told me to count the stars, for so many would my children be.',
      'My wife Sarah and I had a son, Isaac, when I was a hundred years old.'
    ], 'Genesis 12 – 25', ['Genesis 15:6', 'And he believed in the LORD; and he counted it to him for righteousness.']],
    ['Sarah', 'f', 'OT', 'f', [
      'My name was once Sarai.',
      'I gave my maid Hagar to my husband.',
      'I laughed when I heard I would have a son in my old age.',
      'I was Abraham’s wife and Isaac’s mother.'
    ], 'Genesis 17 – 23', ['Genesis 21:6', 'And Sarah said, God hath made me to laugh, so that all that hear will laugh with me.']],
    ['Isaac', 'f', 'OT', 'm', [
      'I dug again the wells my father had dug.',
      'When I was old and could not see, I blessed my younger son by mistake.',
      'My father’s servant found my wife Rebekah at a well.',
      'My father took me up a mountain, and God gave a ram in my place.'
    ], 'Genesis 21 – 27', ['Genesis 22:8', 'And Abraham said, My son, God will provide himself a lamb for a burnt offering: so they went both of them together.']],
    ['Jacob', 'f', 'OT', 'm', [
      'I served seven years for the woman I loved, and they seemed but a few days.',
      'I dreamed of a ladder reaching to heaven, with angels going up and down.',
      'I tricked my twin brother Esau out of his blessing.',
      'God changed my name to Israel, and I had twelve sons.'
    ], 'Genesis 25 – 35', ['Genesis 32:28', 'And he said, Thy name shall be called no more Jacob, but Israel: for as a prince hast thou power with God and with men, and hast prevailed.']],
    ['Joseph', 'k', 'OT', 'm', [
      'I married Asenath, and my sons were Manasseh and Ephraim.',
      'In prison, I told a butler and a baker what their dreams meant.',
      'My brothers sold me to traders for twenty pieces of silver.',
      'My father gave me a coat of many colours.'
    ], 'Genesis 37 – 50', ['Genesis 50:20', 'But as for you, ye thought evil against me; but God meant it unto good, to bring to pass, as it is this day, to save much people alive.']],
    ['Moses', 'k', 'OT', 'm', [
      'I ran away to Midian and kept the flock of Jethro, my father-in-law.',
      'God spoke to me from a bush that burned but was not burnt up.',
      'I told Pharaoh, Let my people go.',
      'I brought the Ten Commandments down from Mount Sinai.'
    ], 'Exodus 2 – 20', ['Exodus 3:14', 'And God said unto Moses, I AM THAT I AM: and he said, Thus shalt thou say unto the children of Israel, I AM hath sent me unto you.']],
    ['Miriam', 'f', 'OT', 'f', [
      'I was shut out of the camp for seven days after I spoke against my brother.',
      'I took a timbrel and led the women in song after the sea crossing.',
      'I watched over my baby brother in a basket on the river.',
      'I was the sister of Moses and Aaron.'
    ], 'Exodus 2, 15; Numbers 12', ['Exodus 15:21', 'And Miriam answered them, Sing ye to the LORD, for he hath triumphed gloriously; the horse and his rider hath he thrown into the sea.']],
    ['Aaron', 'f', 'OT', 'm', [
      'My rod budded, bloomed blossoms and yielded almonds.',
      'I made a golden calf while my brother was up the mountain.',
      'I was the first high priest of Israel.',
      'I spoke for my brother Moses before Pharaoh.'
    ], 'Exodus 4 – 32; Numbers 17', ['Numbers 6:24-26', 'The LORD bless thee, and keep thee: The LORD make his face shine upon thee, and be gracious unto thee: The LORD lift up his countenance upon thee, and give thee peace.']],
    ['Joshua', 'f', 'OT', 'm', [
      'I was the son of Nun, and the servant of Moses.',
      'I was one of the twelve spies, and I brought back a good report.',
      'When I prayed, the sun stood still.',
      'I led Israel around Jericho until its walls fell down flat.'
    ], 'Joshua 1 – 24', ['Joshua 1:9', 'Have not I commanded thee? Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.']],
    ['Rahab', 'f', 'OT', 'f', [
      'I am named among the faithful in Hebrews chapter eleven.',
      'My house was built on the town wall.',
      'I hid two spies under stalks of flax on my roof.',
      'I tied a scarlet line in my window, and my family was saved when Jericho fell.'
    ], 'Joshua 2, 6', ['Joshua 2:21', 'And she said, According unto your words, so be it. And she sent them away, and they departed: and she bound the scarlet line in the window.']],
    ['Gideon', 'f', 'OT', 'm', [
      'An angel found me threshing wheat by the winepress, hiding it from the Midianites.',
      'God cut my army down to three hundred men.',
      'I asked God for a sign with a fleece of wool, wet one night and dry the next.',
      'With trumpets, pitchers and lamps, my three hundred men beat the Midianites.'
    ], 'Judges 6 – 8', ['Judges 6:12', 'And the angel of the LORD appeared unto him, and said unto him, The LORD is with thee, thou mighty man of valour.']],
    ['Samson', 'k', 'OT', 'm', [
      'I tied torches to the tails of three hundred foxes.',
      'I killed a lion with my bare hands and later found honey in it.',
      'I told Delilah the secret of my strength.',
      'My great strength was in my long hair, which was never to be cut.'
    ], 'Judges 13 – 16', ['Judges 13:24', 'And the woman bare a son, and called his name Samson: and the child grew, and the LORD blessed him.']],
    ['Deborah', 'f', 'OT', 'f', [
      'I sat under a palm tree between Ramah and Bethel.',
      'I was a prophetess, the wife of Lapidoth.',
      'I told Barak to lead ten thousand men against Sisera.',
      'I was a woman who judged Israel, and I sang a victory song with Barak.'
    ], 'Judges 4 – 5', ['Judges 4:4', 'And Deborah, a prophetess, the wife of Lapidoth, she judged Israel at that time.']],
    ['Ruth', 'f', 'OT', 'f', [
      'I came from the land of Moab.',
      'I gleaned barley in the field of a man named Boaz.',
      'When my husband died, I would not leave my mother-in-law.',
      'I said, Whither thou goest, I will go.'
    ], 'Ruth 1 – 4', ['Ruth 1:16', 'And Ruth said, Intreat me not to leave thee, or to return from following after thee: for whither thou goest, I will go; and where thou lodgest, I will lodge: thy people shall be my people, and thy God my God']],
    ['Naomi', 's', 'OT', 'f', [
      'My husband was Elimelech, and we left Bethlehem in a famine.',
      'Both my sons died in the land of Moab.',
      'I asked people to call me Mara, which means bitter.',
      'My daughter-in-law Ruth would not leave me.'
    ], 'Ruth 1 – 4', ['Ruth 1:20', 'And she said unto them, Call me not Naomi, call me Mara: for the Almighty hath dealt very bitterly with me.']],
    ['Hannah', 'f', 'OT', 'f', [
      'My husband was Elkanah, and he gave me a worthy portion.',
      'Eli the priest thought I was drunk while I prayed.',
      'I prayed for a son and promised to give him to the LORD.',
      'I was the mother of the prophet Samuel.'
    ], '1 Samuel 1 – 2', ['1 Samuel 1:27', 'For this child I prayed; and the LORD hath given me my petition which I asked of him']],
    ['Samuel', 'f', 'OT', 'm', [
      'My sons Joel and Abiah did not walk in my ways.',
      'I anointed both Saul and David as king.',
      'My mother Hannah brought me to live with Eli the priest.',
      'As a boy I heard God call me in the night, and I said, Speak; for thy servant heareth.'
    ], '1 Samuel 1 – 16', ['1 Samuel 3:10', 'And the LORD came, and stood, and called as at other times, Samuel, Samuel. Then Samuel answered, Speak; for thy servant heareth.']],
    ['Saul', 'f', 'OT', 'm', [
      'I was from the tribe of Benjamin and stood head and shoulders above everyone.',
      'I hid among the baggage when they came to make me king.',
      'A shepherd boy played the harp to calm me, but I threw a javelin at him.',
      'I was the first king of Israel.'
    ], '1 Samuel 9 – 31', ['1 Samuel 10:24', 'And Samuel said to all the people, See ye him whom the LORD hath chosen, that there is none like him among all the people? And all the people shouted, and said, God save the king.']],
    ['David', 'k', 'OT', 'm', [
      'I danced before the LORD with all my might.',
      'I played the harp for King Saul.',
      'I was a shepherd boy, the youngest son of Jesse.',
      'I beat the giant Goliath with a sling and a stone.'
    ], '1 Samuel 16 – 1 Kings 2', ['Psalm 23:1', 'The LORD is my shepherd; I shall not want.']],
    ['Goliath', 'k', 'OT', 'm', [
      'The staff of my spear was like a weaver’s beam.',
      'I came from Gath, and I stood six cubits and a span tall.',
      'For forty days I dared Israel to send a man to fight me.',
      'I was a giant Philistine beaten by a shepherd boy with a sling.'
    ], '1 Samuel 17', ['1 Samuel 17:45', 'Then said David to the Philistine, Thou comest to me with a sword, and with a spear, and with a shield: but I come to thee in the name of the LORD of hosts, the God of the armies of Israel, whom thou hast defied.']],
    ['Jonathan', 'f', 'OT', 'm', [
      'I climbed a cliff with my armourbearer and beat a Philistine garrison.',
      'I shot arrows in a field as a secret signal to my friend.',
      'I gave my friend my robe, my sword and my bow.',
      'I was King Saul’s son and David’s dearest friend.'
    ], '1 Samuel 14 – 20', ['1 Samuel 18:1', 'And it came to pass, when he had made an end of speaking unto Saul, that the soul of Jonathan was knit with the soul of David, and Jonathan loved him as his own soul.']],
    ['Solomon', 'f', 'OT', 'm', [
      'The Queen of Sheba came to test me with hard questions.',
      'I built the temple in Jerusalem.',
      'Two women claimed one baby, and I said to divide the child in two.',
      'When God said, Ask what I shall give thee, I asked for wisdom.'
    ], '1 Kings 1 – 11', ['1 Kings 3:9', 'Give therefore thy servant an understanding heart to judge thy people, that I may discern between good and bad: for who is able to judge this thy so great a people?']],
    ['Elijah', 'f', 'OT', 'm', [
      'I was a Tishbite, and I wore a girdle of leather.',
      'Ravens brought me bread and meat by the brook Cherith.',
      'On Mount Carmel, fire fell from heaven on my altar.',
      'I went up into heaven by a whirlwind, with a chariot of fire.'
    ], '1 Kings 17 – 2 Kings 2', ['1 Kings 18:39', 'And when all the people saw it, they fell on their faces: and they said, The LORD, he is the God; the LORD, he is the God.']],
    ['Elisha', 's', 'OT', 'm', [
      'I was ploughing with twelve yoke of oxen when I was called.',
      'I asked for a double portion of my master’s spirit.',
      'I told Naaman to wash seven times in the Jordan.',
      'I picked up Elijah’s mantle when he went up to heaven.'
    ], '1 Kings 19 – 2 Kings 13', ['2 Kings 6:16', 'And he answered, Fear not: for they that be with us are more than they that be with them.']],
    ['Daniel', 'k', 'OT', 'm', [
      'I would not eat the king’s meat, and asked for pulse and water.',
      'I read the writing on the wall at Belshazzar’s feast.',
      'I prayed three times a day with my windows open toward Jerusalem.',
      'I was thrown into a den of lions, and God shut their mouths.'
    ], 'Daniel 1 – 12', ['Daniel 6:22', 'My God hath sent his angel, and hath shut the lions’ mouths, that they have not hurt me: forasmuch as before him innocency was found in me; and also before thee, O king, have I done no hurt.']],
    ['Esther', 'f', 'OT', 'f', [
      'My Hebrew name was Hadassah.',
      'My cousin Mordecai brought me up as his own daughter.',
      'I went to the king without being called and said, If I perish, I perish.',
      'I was the Jewish queen of King Ahasuerus, and I saved my people from Haman.'
    ], 'Esther 2 – 9', ['Esther 4:14', 'For if thou altogether holdest thy peace at this time, then shall there enlargement and deliverance arise to the Jews from another place; but thou and thy father’s house shall be destroyed: and who knoweth whether thou art come to the kingdom for such a time as this?']],
    ['Jonah', 'k', 'OT', 'm', [
      'God made a gourd grow to shade me, then sent a worm to kill it.',
      'I ran away on a ship going to Tarshish.',
      'Sailors threw me into the sea in a great storm.',
      'I spent three days and three nights in the belly of a great fish.'
    ], 'Jonah 1 – 4', ['Jonah 1:17', 'Now the LORD had prepared a great fish to swallow up Jonah. And Jonah was in the belly of the fish three days and three nights.']],
    ['Nehemiah', 's', 'OT', 'm', [
      'I was cupbearer to King Artaxerxes.',
      'The king saw my sad face and let me go home.',
      'Sanballat and Tobiah mocked my work.',
      'I led the people to rebuild the walls of Jerusalem in fifty-two days.'
    ], 'Nehemiah 1 – 13', ['Nehemiah 8:10', 'Then he said unto them, Go your way, eat the fat, and drink the sweet, and send portions unto them for whom nothing is prepared: for this day is holy unto our Lord: neither be ye sorry; for the joy of the LORD is your strength.']],
    ['Isaiah', 's', 'OT', 'm', [
      'I was the son of Amoz.',
      'A seraph touched my lips with a live coal from the altar.',
      'When God asked, Whom shall I send, I said, Here am I; send me.',
      'I wrote, Unto us a child is born, unto us a son is given.'
    ], 'Isaiah 6, 9, 53', ['Isaiah 6:8', 'Also I heard the voice of the Lord, saying, Whom shall I send, and who will go for us? Then said I, Here am I; send me.']],
    ['Jeremiah', 's', 'OT', 'm', [
      'I watched a potter remake a pot that was spoiled.',
      'I was let down by ropes into a dungeon full of mire.',
      'When God called me, I said, I cannot speak: for I am a child.',
      'I am called the weeping prophet, and I warned Jerusalem before Babylon came.'
    ], 'Jeremiah 1, 18, 38', ['Jeremiah 29:11', 'For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end.']],
    ['Job', 'f', 'OT', 'm', [
      'I lived in the land of Uz.',
      'Three friends came to comfort me and sat with me seven days.',
      'I lost my children, my animals and my health, but I did not curse God.',
      'I said, The LORD gave, and the LORD hath taken away.'
    ], 'Job 1 – 42', ['Job 1:21', 'And said, Naked came I out of my mother’s womb, and naked shall I return thither: the LORD gave, and the LORD hath taken away; blessed be the name of the LORD.']],
    ['Cain', 'f', 'OT', 'm', [
      'I built a city and named it after my son Enoch.',
      'God set a mark on me so that no one would kill me.',
      'I asked God, Am I my brother’s keeper?',
      'I was the first son of Adam and Eve, and I worked the ground.'
    ], 'Genesis 4', ['Genesis 4:9', 'And the LORD said unto Cain, Where is Abel thy brother? And he said, I know not: Am I my brother’s keeper?']],
    ['Rebekah', 's', 'OT', 'f', [
      'My brother was Laban.',
      'At a well I gave water to a stranger and to all his camels.',
      'I was the mother of twins, Esau and Jacob.',
      'I married Isaac, and I helped Jacob get his father’s blessing.'
    ], 'Genesis 24 – 27', ['Genesis 24:67', 'And Isaac brought her into his mother Sarah’s tent, and took Rebekah, and she became his wife; and he loved her: and Isaac was comforted after his mother’s death.']],
    ['Lot', 's', 'OT', 'm', [
      'I chose the plain of Jordan and pitched my tent toward Sodom.',
      'Two angels came to my house in Sodom.',
      'Angels pulled me out of the city before fire fell from heaven.',
      'My wife looked back and became a pillar of salt.'
    ], 'Genesis 13, 19', ['Genesis 19:26', 'But his wife looked back from behind him, and she became a pillar of salt.']],
    ['Ezekiel', 's', 'OT', 'm', [
      'I was a priest, the son of Buzi, by the river Chebar.',
      'I saw wheels full of eyes beside four living creatures.',
      'God told me to eat a scroll, and it tasted as sweet as honey.',
      'I saw a valley of dry bones come to life.'
    ], 'Ezekiel 1 – 3, 37', ['Ezekiel 37:4', 'Again he said unto me, Prophesy upon these bones, and say unto them, O ye dry bones, hear the word of the LORD.']],
    ['Nebuchadnezzar', 's', 'OT', 'm', [
      'I dreamed of a great image with a head of gold.',
      'I set up a golden image and ordered everyone to bow down to it.',
      'I saw a fourth man walking in my fiery furnace.',
      'I was a king of Babylon who lived with the beasts and ate grass as oxen.'
    ], 'Daniel 2 – 4', ['Daniel 4:37', 'Now I Nebuchadnezzar praise and extol and honour the King of heaven, all whose works are truth, and his ways judgment: and those that walk in pride he is able to abase.']],
    ['Caleb', 's', 'OT', 'm', [
      'I was the son of Jephunneh, of the tribe of Judah.',
      'At eighty-five I said I was as strong as the day Moses sent me out.',
      'With Joshua, I said we were well able to take the land.',
      'I was one of only two spies who trusted God, and I was given Hebron.'
    ], 'Numbers 13 – 14; Joshua 14', ['Numbers 13:30', 'And Caleb stilled the people before Moses, and said, Let us go up at once, and possess it; for we are well able to overcome it.']],
    ['Jezebel', 's', 'OT', 'f', [
      'I was the daughter of Ethbaal, king of the Zidonians.',
      'I had Naboth killed for his vineyard.',
      'I swore to kill Elijah after Mount Carmel.',
      'I was the wicked wife of King Ahab, and I was thrown from a window.'
    ], '1 Kings 16 – 21; 2 Kings 9', ['1 Kings 21:25', 'But there was none like unto Ahab, which did sell himself to work wickedness in the sight of the LORD, whom Jezebel his wife stirred up.']],
    ['Boaz', 's', 'OT', 'm', [
      'My mother was Rahab of Jericho.',
      'I was a rich man of Bethlehem and a kinsman of Elimelech.',
      'I told my reapers to drop handfuls of barley on purpose.',
      'I married Ruth and became the great-grandfather of King David.'
    ], 'Ruth 2 – 4', ['Ruth 2:12', 'The LORD recompense thy work, and a full reward be given thee of the LORD God of Israel, under whose wings thou art come to trust.']],
    ['Enoch', 's', 'OT', 'm', [
      'I was the father of Methuselah.',
      'I lived three hundred and sixty-five years on the earth.',
      'I walked with God.',
      'I did not die: God took me.'
    ], 'Genesis 5; Hebrews 11:5', ['Genesis 5:24', 'And Enoch walked with God: and he was not; for God took him.']],

    ['Mary', 'k', 'NT', 'f', [
      'My cousin Elisabeth was the mother of John the Baptist.',
      'I sang, My soul doth magnify the Lord.',
      'The angel Gabriel told me I would have a son.',
      'I laid my baby in a manger in Bethlehem.'
    ], 'Luke 1 – 2', ['Luke 1:38', 'And Mary said, Behold the handmaid of the Lord; be it unto me according to thy word. And the angel departed from her.']],
    ['John the Baptist', 'f', 'NT', 'm', [
      'My father Zacharias could not speak until I was named.',
      'I wore camel’s hair and ate locusts and wild honey.',
      'I preached in the wilderness, Repent ye: for the kingdom of heaven is at hand.',
      'I baptized Jesus in the river Jordan.'
    ], 'Luke 1, 3; Matthew 3', ['John 1:29', 'The next day John seeth Jesus coming unto him, and saith, Behold the Lamb of God, which taketh away the sin of the world.']],
    ['Peter', 'k', 'NT', 'm', [
      'My brother Andrew brought me to Jesus.',
      'I cut off the ear of the high priest’s servant.',
      'I walked on the water toward Jesus, then began to sink.',
      'I was a fisherman who denied Jesus three times before the cock crew.'
    ], 'The Gospels; Acts 1 – 12', ['Matthew 16:16', 'And Simon Peter answered and said, Thou art the Christ, the Son of the living God.']],
    ['Paul', 'f', 'NT', 'm', [
      'I was born in Tarsus, and I made tents for a living.',
      'I was shipwrecked on the island of Melita.',
      'A light from heaven blinded me on the road to Damascus.',
      'I became the apostle to the Gentiles and wrote many New Testament letters.'
    ], 'Acts 9 – 28', ['2 Timothy 4:7', 'I have fought a good fight, I have finished my course, I have kept the faith']],
    ['Zacchaeus', 'k', 'NT', 'm', [
      'I was the chief among the tax collectors in Jericho.',
      'I was rich, and people grumbled when Jesus came to my house.',
      'I promised to give half of my goods to the poor.',
      'I was a little man who climbed a sycomore tree to see Jesus.'
    ], 'Luke 19:1-10', ['Luke 19:5', 'And when Jesus came to the place, he looked up, and saw him, and said unto him, Zacchaeus, make haste, and come down; for to day I must abide at thy house.']],
    ['Lazarus', 'k', 'NT', 'm', [
      'I lived in the village of Bethany.',
      'My sisters were Martha and Mary.',
      'I had been in the grave for four days.',
      'Jesus called me out of my tomb, and I came back to life.'
    ], 'John 11 – 12', ['John 11:43', 'And when he thus had spoken, he cried with a loud voice, Lazarus, come forth.']],
    ['Martha', 'f', 'NT', 'f', [
      'I lived in Bethany with my sister and my brother.',
      'I said, Lord, if thou hadst been here, my brother had not died.',
      'I was cumbered about much serving.',
      'I complained that my sister Mary left me to serve alone.'
    ], 'Luke 10; John 11', ['Luke 10:41', 'And Jesus answered and said unto her, Martha, Martha, thou art careful and troubled about many things']],
    ['Mary Magdalene', 'f', 'NT', 'f', [
      'Jesus cast seven devils out of me.',
      'I stood by the cross with the mother of Jesus.',
      'I came to the tomb early, while it was yet dark.',
      'I was the first to see Jesus risen; I thought he was the gardener.'
    ], 'Luke 8; John 19 – 20', ['John 20:18', 'Mary Magdalene came and told the disciples that she had seen the Lord, and that he had spoken these things unto her.']],
    ['Thomas', 'f', 'NT', 'm', [
      'I was also called Didymus.',
      'I said, Let us also go, that we may die with him.',
      'I was not with the others when Jesus first came to them after he rose.',
      'I said I would not believe unless I saw the print of the nails.'
    ], 'John 11, 14, 20', ['John 20:28', 'And Thomas answered and said unto him, My Lord and my God.']],
    ['Judas Iscariot', 'f', 'NT', 'm', [
      'I carried the money bag for the twelve.',
      'I grumbled that costly ointment was not sold for the poor.',
      'I was paid thirty pieces of silver.',
      'I betrayed Jesus with a kiss.'
    ], 'Matthew 26 – 27; John 12', ['Matthew 26:49', 'And forthwith he came to Jesus, and said, Hail, master; and kissed him.']],
    ['Matthew', 's', 'NT', 'm', [
      'I was also called Levi.',
      'I made Jesus a great feast in my own house.',
      'I was sitting at the tax table when Jesus said, Follow me.',
      'I was a tax collector who became an apostle and wrote the first Gospel.'
    ], 'Matthew 9; Luke 5', ['Matthew 9:9', 'And as Jesus passed forth from thence, he saw a man, named Matthew, sitting at the receipt of custom: and he saith unto him, Follow me. And he arose, and followed him.']],
    ['Timothy', 's', 'NT', 'm', [
      'My grandmother was Lois and my mother was Eunice.',
      'Paul called me his own son in the faith.',
      'I was told, Let no man despise thy youth.',
      'Paul wrote two letters to me.'
    ], 'Acts 16; 1 and 2 Timothy', ['1 Timothy 4:12', 'Let no man despise thy youth; but be thou an example of the believers, in word, in conversation, in charity, in spirit, in faith, in purity.']],
    ['Stephen', 's', 'NT', 'm', [
      'I was chosen as one of seven to care for the widows.',
      'My face looked like the face of an angel.',
      'I saw heaven opened and Jesus standing at the right hand of God.',
      'I was the first Christian martyr, stoned while Saul looked on.'
    ], 'Acts 6 – 7', ['Acts 7:59', 'And they stoned Stephen, calling upon God, and saying, Lord Jesus, receive my spirit.']],
    ['Barnabas', 's', 'NT', 'm', [
      'I was a Levite from Cyprus, and my name means son of consolation.',
      'I sold my land and laid the money at the apostles’ feet.',
      'I brought Saul to the apostles when they were afraid of him.',
      'I went with Paul on his first missionary journey.'
    ], 'Acts 4, 9, 11 – 15', ['Acts 11:24', 'For he was a good man, and full of the Holy Ghost and of faith: and much people was added unto the Lord.']],
    ['Nicodemus', 's', 'NT', 'm', [
      'I was a Pharisee and a ruler of the Jews.',
      'I brought about a hundred pound weight of myrrh and aloes for the burial of Jesus.',
      'I asked how a man can be born when he is old.',
      'I came to Jesus by night.'
    ], 'John 3, 7, 19', ['John 3:3', 'Jesus answered and said unto him, Verily, verily, I say unto thee, Except a man be born again, he cannot see the kingdom of God.']],
    ['Pontius Pilate', 'f', 'NT', 'm', [
      'My wife sent me word about a dream she had.',
      'I asked, What is truth?',
      'I washed my hands before the crowd.',
      'I was the Roman governor who handed Jesus over to be crucified.'
    ], 'Matthew 27; John 18 – 19', ['Matthew 27:24', 'When Pilate saw that he could prevail nothing, but that rather a tumult was made, he took water, and washed his hands before the multitude, saying, I am innocent of the blood of this just person: see ye to it.']],
    ['King Herod', 's', 'NT', 'm', [
      'I asked the chief priests where Christ should be born.',
      'I told the wise men to come back and tell me where the child was.',
      'The wise men went home another way so as not to see me.',
      'I ordered that the young children of Bethlehem be killed.'
    ], 'Matthew 2', ['Matthew 2:12', 'And being warned of God in a dream that they should not return to Herod, they departed into their own country another way.']],
    ['Lydia', 's', 'NT', 'f', [
      'I came from the city of Thyatira.',
      'I met Paul by a river where people prayed at Philippi.',
      'The Lord opened my heart, and my whole household was baptized.',
      'I was a seller of purple cloth.'
    ], 'Acts 16', ['Acts 16:14', 'And a certain woman named Lydia, a seller of purple, of the city of Thyatira, which worshipped God, heard us: whose heart the Lord opened, that she attended unto the things which were spoken of Paul.']],
    ['Elisabeth', 'f', 'NT', 'f', [
      'I came from the family of Aaron.',
      'My husband was a priest who saw an angel in the temple.',
      'My baby leaped inside me when Mary greeted me.',
      'In my old age I became the mother of John the Baptist.'
    ], 'Luke 1', ['Luke 1:41', 'And it came to pass, that, when Elisabeth heard the salutation of Mary, the babe leaped in her womb; and Elisabeth was filled with the Holy Ghost']],
    ['Andrew', 's', 'NT', 'm', [
      'I was first a disciple of John the Baptist.',
      'I brought a boy with five barley loaves and two small fishes to Jesus.',
      'I was a fisherman from Bethsaida.',
      'I brought my brother Simon Peter to Jesus.'
    ], 'John 1, 6', ['John 1:41', 'He first findeth his own brother Simon, and saith unto him, We have found the Messias, which is, being interpreted, the Christ.']],
    ['John the apostle', 'f', 'NT', 'm', [
      'My father was Zebedee, and Jesus called my brother and me sons of thunder.',
      'I was called the disciple whom Jesus loved.',
      'From the cross, Jesus gave his mother into my care.',
      'On the isle of Patmos I saw the visions written in Revelation.'
    ], 'John 13, 19, 21; Revelation 1', ['John 21:24', 'This is the disciple which testifieth of these things, and wrote these things: and we know that his testimony is true.']],
    ['Luke', 's', 'NT', 'm', [
      'Paul called me the beloved physician.',
      'At the end, I was the only one still with Paul.',
      'I wrote my books for a man called Theophilus.',
      'I wrote a Gospel and the Acts of the Apostles.'
    ], 'Luke 1:1-4; Acts 1:1', ['Colossians 4:14', 'Luke, the beloved physician, and Demas, greet you.']],
    ['Silas', 's', 'NT', 'm', [
      'I was chosen to carry the letter from Jerusalem to Antioch.',
      'I went with Paul on his second journey.',
      'At midnight in a jail at Philippi, I prayed and sang praises with Paul.',
      'I was in prison with Paul when an earthquake opened all the doors.'
    ], 'Acts 15 – 17', ['Acts 16:25', 'And at midnight Paul and Silas prayed, and sang praises unto God: and the prisoners heard them.']],
    ['Simeon', 's', 'NT', 'm', [
      'I was a just and devout man in Jerusalem, waiting for the consolation of Israel.',
      'The Holy Ghost showed me I would not die before I saw the Lord’s Christ.',
      'I took the baby Jesus up in my arms in the temple.',
      'I said, Lord, now lettest thou thy servant depart in peace.'
    ], 'Luke 2:25-35', ['Luke 2:29', 'Lord, now lettest thou thy servant depart in peace, according to thy word']],
    ['Dorcas', 's', 'NT', 'f', [
      'I was also called Tabitha.',
      'I lived in Joppa and was full of good works.',
      'Widows showed Peter the coats and clothes I had made.',
      'Peter prayed, and I came back to life.'
    ], 'Acts 9:36-42', ['Acts 9:40', 'But Peter put them all forth, and kneeled down, and prayed; and turning him to the body said, Tabitha, arise. And she opened her eyes: and when she saw Peter, she sat up.']]
  ];

  /* ---------- Verse Rush ----------
     [reference, level, KJV text, the part to build when the verse is long
      or runs on (optional: an exact piece of the text)] */
  var VERSES = [
    ['Genesis 1:1', 'k', 'In the beginning God created the heaven and the earth.'],
    ['Genesis 1:27', 's', 'So God created man in his own image, in the image of God created he him; male and female created he them.'],
    ['Exodus 20:3', 'k', 'Thou shalt have no other gods before me.'],
    ['Exodus 20:12', 'f', 'Honour thy father and thy mother: that thy days may be long upon the land which the LORD thy God giveth thee.'],
    ['Deuteronomy 6:5', 'f', 'And thou shalt love the LORD thy God with all thine heart, and with all thy soul, and with all thy might.'],
    ['Deuteronomy 31:6', 's', 'Be strong and of a good courage, fear not, nor be afraid of them: for the LORD thy God, he it is that doth go with thee; he will not fail thee, nor forsake thee.'],
    ['Joshua 1:9', 's', 'Have not I commanded thee? Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.'],
    ['Joshua 24:15', 's', 'And if it seem evil unto you to serve the LORD, choose you this day whom ye will serve; whether the gods which your fathers served that were on the other side of the flood, or the gods of the Amorites, in whose land ye dwell: but as for me and my house, we will serve the LORD.', 'but as for me and my house, we will serve the LORD.'],
    ['Psalm 23:1', 'k', 'The LORD is my shepherd; I shall not want.'],
    ['Psalm 23:4', 'f', 'Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me; thy rod and thy staff they comfort me.'],
    ['Psalm 27:1', 'f', 'The LORD is my light and my salvation; whom shall I fear? the LORD is the strength of my life; of whom shall I be afraid?'],
    ['Psalm 34:8', 'f', 'O taste and see that the LORD is good: blessed is the man that trusteth in him.'],
    ['Psalm 37:4', 'f', 'Delight thyself also in the LORD; and he shall give thee the desires of thine heart.'],
    ['Psalm 46:1', 'f', 'God is our refuge and strength, a very present help in trouble.'],
    ['Psalm 46:10', 's', 'Be still, and know that I am God: I will be exalted among the heathen, I will be exalted in the earth.'],
    ['Psalm 51:10', 'f', 'Create in me a clean heart, O God; and renew a right spirit within me.'],
    ['Psalm 56:3', 'k', 'What time I am afraid, I will trust in thee.'],
    ['Psalm 100:1', 'k', 'Make a joyful noise unto the LORD, all ye lands.'],
    ['Psalm 103:1', 'f', 'Bless the LORD, O my soul: and all that is within me, bless his holy name.'],
    ['Psalm 118:24', 'k', 'This is the day which the LORD hath made; we will rejoice and be glad in it.'],
    ['Psalm 119:105', 'k', 'Thy word is a lamp unto my feet, and a light unto my path.'],
    ['Psalm 121:1', 'f', 'I will lift up mine eyes unto the hills, from whence cometh my help.'],
    ['Psalm 133:1', 's', 'Behold, how good and how pleasant it is for brethren to dwell together in unity!'],
    ['Psalm 136:1', 'k', 'O give thanks unto the LORD; for he is good: for his mercy endureth for ever.'],
    ['Psalm 139:14', 's', 'I will praise thee; for I am fearfully and wonderfully made: marvellous are thy works; and that my soul knoweth right well.'],
    ['Psalm 150:6', 'k', 'Let every thing that hath breath praise the LORD. Praise ye the LORD.'],
    ['Proverbs 3:5', 'f', 'Trust in the LORD with all thine heart; and lean not unto thine own understanding.'],
    ['Proverbs 3:6', 'f', 'In all thy ways acknowledge him, and he shall direct thy paths.'],
    ['Proverbs 15:1', 's', 'A soft answer turneth away wrath: but grievous words stir up anger.'],
    ['Proverbs 17:17', 's', 'A friend loveth at all times, and a brother is born for adversity.'],
    ['Proverbs 18:10', 's', 'The name of the LORD is a strong tower: the righteous runneth into it, and is safe.'],
    ['Proverbs 22:6', 'f', 'Train up a child in the way he should go: and when he is old, he will not depart from it.'],
    ['Ecclesiastes 3:1', 'f', 'To every thing there is a season, and a time to every purpose under the heaven:', 'To every thing there is a season, and a time to every purpose under the heaven'],
    ['Isaiah 9:6', 's', 'For unto us a child is born, unto us a son is given: and the government shall be upon his shoulder: and his name shall be called Wonderful, Counsellor, The mighty God, The everlasting Father, The Prince of Peace.'],
    ['Isaiah 40:31', 'f', 'But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint.'],
    ['Isaiah 41:10', 's', 'Fear thou not; for I am with thee: be not dismayed; for I am thy God: I will strengthen thee; yea, I will help thee; yea, I will uphold thee with the right hand of my righteousness.'],
    ['Isaiah 53:6', 's', 'All we like sheep have gone astray; we have turned every one to his own way; and the LORD hath laid on him the iniquity of us all.'],
    ['Jeremiah 29:11', 'f', 'For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end.'],
    ['Lamentations 3:22-23', 's', 'It is of the LORD’s mercies that we are not consumed, because his compassions fail not. They are new every morning: great is thy faithfulness.'],
    ['Micah 6:8', 's', 'He hath shewed thee, O man, what is good; and what doth the LORD require of thee, but to do justly, and to love mercy, and to walk humbly with thy God?'],
    ['Nahum 1:7', 's', 'The LORD is good, a strong hold in the day of trouble; and he knoweth them that trust in him.'],

    ['Matthew 4:19', 'k', 'And he saith unto them, Follow me, and I will make you fishers of men.'],
    ['Matthew 5:9', 'k', 'Blessed are the peacemakers: for they shall be called the children of God.'],
    ['Matthew 5:14', 'f', 'Ye are the light of the world. A city that is set on an hill cannot be hid.'],
    ['Matthew 5:16', 'f', 'Let your light so shine before men, that they may see your good works, and glorify your Father which is in heaven.'],
    ['Matthew 6:21', 'f', 'For where your treasure is, there will your heart be also.'],
    ['Matthew 6:33', 'f', 'But seek ye first the kingdom of God, and his righteousness; and all these things shall be added unto you.'],
    ['Matthew 7:7', 'f', 'Ask, and it shall be given you; seek, and ye shall find; knock, and it shall be opened unto you:', 'Ask, and it shall be given you; seek, and ye shall find; knock, and it shall be opened unto you'],
    ['Matthew 11:28', 'f', 'Come unto me, all ye that labour and are heavy laden, and I will give you rest.'],
    ['Matthew 19:26', 'f', 'But Jesus beheld them, and said unto them, With men this is impossible; but with God all things are possible.'],
    ['Matthew 22:39', 'f', 'And the second is like unto it, Thou shalt love thy neighbour as thyself.'],
    ['Matthew 28:20', 's', 'Teaching them to observe all things whatsoever I have commanded you: and, lo, I am with you alway, even unto the end of the world. Amen.'],
    ['Mark 10:14', 's', 'But when Jesus saw it, he was much displeased, and said unto them, Suffer the little children to come unto me, and forbid them not: for of such is the kingdom of God.'],
    ['Mark 16:15', 'f', 'And he said unto them, Go ye into all the world, and preach the gospel to every creature.'],
    ['Luke 1:37', 'k', 'For with God nothing shall be impossible.'],
    ['Luke 2:11', 'k', 'For unto you is born this day in the city of David a Saviour, which is Christ the Lord.'],
    ['Luke 2:14', 'k', 'Glory to God in the highest, and on earth peace, good will toward men.'],
    ['Luke 6:31', 'f', 'And as ye would that men should do to you, do ye also to them likewise.'],
    ['Luke 19:10', 'f', 'For the Son of man is come to seek and to save that which was lost.'],
    ['John 1:1', 'f', 'In the beginning was the Word, and the Word was with God, and the Word was God.'],
    ['John 3:16', 'k', 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.'],
    ['John 8:12', 's', 'Then spake Jesus again unto them, saying, I am the light of the world: he that followeth me shall not walk in darkness, but shall have the light of life.'],
    ['John 10:11', 'k', 'I am the good shepherd: the good shepherd giveth his life for the sheep.'],
    ['John 13:34', 'f', 'A new commandment I give unto you, That ye love one another; as I have loved you, that ye also love one another.'],
    ['John 14:1', 'f', 'Let not your heart be troubled: ye believe in God, believe also in me.'],
    ['John 14:6', 'f', 'Jesus saith unto him, I am the way, the truth, and the life: no man cometh unto the Father, but by me.'],
    ['John 15:13', 'f', 'Greater love hath no man than this, that a man lay down his life for his friends.'],
    ['Acts 1:8', 's', 'But ye shall receive power, after that the Holy Ghost is come upon you: and ye shall be witnesses unto me both in Jerusalem, and in all Judaea, and in Samaria, and unto the uttermost part of the earth.'],
    ['Acts 16:31', 'f', 'And they said, Believe on the Lord Jesus Christ, and thou shalt be saved, and thy house.'],
    ['Romans 3:23', 'f', 'For all have sinned, and come short of the glory of God;', 'For all have sinned, and come short of the glory of God'],
    ['Romans 6:23', 'f', 'For the wages of sin is death; but the gift of God is eternal life through Jesus Christ our Lord.'],
    ['Romans 8:28', 'f', 'And we know that all things work together for good to them that love God, to them who are the called according to his purpose.'],
    ['Romans 10:13', 'f', 'For whosoever shall call upon the name of the Lord shall be saved.'],
    ['Romans 12:21', 'f', 'Be not overcome of evil, but overcome evil with good.'],
    ['1 Corinthians 10:31', 's', 'Whether therefore ye eat, or drink, or whatsoever ye do, do all to the glory of God.'],
    ['1 Corinthians 13:4', 's', 'Charity suffereth long, and is kind; charity envieth not; charity vaunteth not itself, is not puffed up,', 'Charity suffereth long, and is kind; charity envieth not'],
    ['1 Corinthians 13:13', 'f', 'And now abideth faith, hope, charity, these three; but the greatest of these is charity.'],
    ['2 Corinthians 5:17', 's', 'Therefore if any man be in Christ, he is a new creature: old things are passed away; behold, all things are become new.'],
    ['Galatians 5:22-23', 'f', 'But the fruit of the Spirit is love, joy, peace, longsuffering, gentleness, goodness, faith, Meekness, temperance: against such there is no law.'],
    ['Ephesians 4:32', 'f', 'And be ye kind one to another, tenderhearted, forgiving one another, even as God for Christ’s sake hath forgiven you.'],
    ['Ephesians 6:1', 'k', 'Children, obey your parents in the Lord: for this is right.'],
    ['Philippians 4:4', 'k', 'Rejoice in the Lord alway: and again I say, Rejoice.'],
    ['Philippians 4:13', 'k', 'I can do all things through Christ which strengtheneth me.'],
    ['Colossians 3:23', 's', 'And whatsoever ye do, do it heartily, as to the Lord, and not unto men;', 'And whatsoever ye do, do it heartily, as to the Lord, and not unto men'],
    ['1 Thessalonians 5:16-18', 's', 'Rejoice evermore. Pray without ceasing. In every thing give thanks: for this is the will of God in Christ Jesus concerning you.'],
    ['2 Timothy 3:16', 's', 'All scripture is given by inspiration of God, and is profitable for doctrine, for reproof, for correction, for instruction in righteousness:', 'All scripture is given by inspiration of God, and is profitable for doctrine'],
    ['Hebrews 11:1', 'f', 'Now faith is the substance of things hoped for, the evidence of things not seen.'],
    ['Hebrews 13:8', 'f', 'Jesus Christ the same yesterday, and to day, and for ever.'],
    ['James 4:8', 's', 'Draw nigh to God, and he will draw nigh to you. Cleanse your hands, ye sinners; and purify your hearts, ye double minded.', 'Draw nigh to God, and he will draw nigh to you.'],
    ['1 Peter 5:7', 'f', 'Casting all your care upon him; for he careth for you.'],
    ['1 John 1:9', 'f', 'If we confess our sins, he is faithful and just to forgive us our sins, and to cleanse us from all unrighteousness.'],
    ['1 John 4:8', 'f', 'He that loveth not knoweth not God; for God is love.'],
    ['1 John 4:19', 'k', 'We love him, because he first loved us.'],
    ['Revelation 3:20', 's', 'Behold, I stand at the door, and knock: if any man hear my voice, and open the door, I will come in to him, and will sup with him, and he with me.'],
    ['Revelation 21:4', 's', 'And God shall wipe away all tears from their eyes; and there shall be no more death, neither sorrow, nor crying, neither shall there be any more pain: for the former things are passed away.']
  ];

  /* ---------- Books of the Bible ----------
     The parts of the Bible, in order. */
  var DIVISIONS = [
    { id: 'law', name: 'The Law', testament: 'OT' },
    { id: 'history', name: 'History', testament: 'OT' },
    { id: 'poetry', name: 'Poetry & wisdom', testament: 'OT' },
    { id: 'major', name: 'Major prophets', testament: 'OT' },
    { id: 'minor', name: 'Minor prophets', testament: 'OT' },
    { id: 'gospels', name: 'Gospels', testament: 'NT' },
    { id: 'acts', name: 'Church history', testament: 'NT' },
    { id: 'paul', name: 'Paul’s letters', testament: 'NT' },
    { id: 'general', name: 'General letters', testament: 'NT' },
    { id: 'prophecy', name: 'Prophecy', testament: 'NT' }
  ];

  /* [name, chapters, division, level, what it is about, [key verse ref, KJV text]]
     in Bible order. */
  var BOOKS = [
    ['Genesis', 50, 'law', 'k', 'Creation, the flood, and the families of Abraham, Isaac, Jacob and Joseph.', ['Genesis 1:1', 'In the beginning God created the heaven and the earth.']],
    ['Exodus', 40, 'law', 'k', 'Moses leads Israel out of Egypt, and God gives the Ten Commandments.', ['Exodus 20:3', 'Thou shalt have no other gods before me.']],
    ['Leviticus', 27, 'law', 'f', 'Laws for the priests, the offerings and the feasts of Israel.', ['Leviticus 19:18', 'Thou shalt not avenge, nor bear any grudge against the children of thy people, but thou shalt love thy neighbour as thyself: I am the LORD.']],
    ['Numbers', 36, 'law', 'f', 'Forty years in the wilderness, from Sinai to the edge of the promised land.', ['Numbers 6:24-26', 'The LORD bless thee, and keep thee: The LORD make his face shine upon thee, and be gracious unto thee: The LORD lift up his countenance upon thee, and give thee peace.']],
    ['Deuteronomy', 34, 'law', 'f', 'Moses’ last words to Israel before they cross the Jordan.', ['Deuteronomy 6:5', 'And thou shalt love the LORD thy God with all thine heart, and with all thy soul, and with all thy might.']],
    ['Joshua', 24, 'history', 'k', 'Israel enters the promised land, and the walls of Jericho fall.', ['Joshua 1:9', 'Have not I commanded thee? Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.']],
    ['Judges', 21, 'history', 'f', 'Deborah, Gideon, Samson and the other judges who rescued Israel.', ['Judges 21:25', 'In those days there was no king in Israel: every man did that which was right in his own eyes.']],
    ['Ruth', 4, 'history', 'k', 'Ruth stays with Naomi and marries Boaz of Bethlehem.', ['Ruth 1:16', 'for whither thou goest, I will go; and where thou lodgest, I will lodge: thy people shall be my people, and thy God my God']],
    ['1 Samuel', 31, 'history', 'k', 'Samuel, King Saul, and young David who beats Goliath.', ['1 Samuel 16:7', 'But the LORD said unto Samuel, Look not on his countenance, or on the height of his stature; because I have refused him: for the LORD seeth not as man seeth; for man looketh on the outward appearance, but the LORD looketh on the heart.']],
    ['2 Samuel', 24, 'history', 'f', 'The reign of King David.', ['2 Samuel 7:16', 'And thine house and thy kingdom shall be established for ever before thee: thy throne shall be established for ever.']],
    ['1 Kings', 22, 'history', 'f', 'Solomon builds the temple, the kingdom splits, and Elijah faces Ahab.', ['1 Kings 3:9', 'Give therefore thy servant an understanding heart to judge thy people, that I may discern between good and bad: for who is able to judge this thy so great a people?']],
    ['2 Kings', 25, 'history', 'f', 'Elisha, the kings of Israel and Judah, and the fall of Jerusalem.', ['2 Kings 2:11', 'And it came to pass, as they still went on, and talked, that, behold, there appeared a chariot of fire, and horses of fire, and parted them both asunder; and Elijah went up by a whirlwind into heaven.']],
    ['1 Chronicles', 29, 'history', 's', 'Family records from Adam, and the reign of David.', ['1 Chronicles 16:34', 'O give thanks unto the LORD; for he is good; for his mercy endureth for ever.']],
    ['2 Chronicles', 36, 'history', 's', 'Solomon and the kings of Judah, to the exile in Babylon.', ['2 Chronicles 7:14', 'If my people, which are called by my name, shall humble themselves, and pray, and seek my face, and turn from their wicked ways; then will I hear from heaven, and will forgive their sin, and will heal their land.']],
    ['Ezra', 10, 'history', 'f', 'The people return from Babylon and rebuild the temple.', ['Ezra 7:10', 'For Ezra had prepared his heart to seek the law of the LORD, and to do it, and to teach in Israel statutes and judgments.']],
    ['Nehemiah', 13, 'history', 'f', 'Nehemiah leads the rebuilding of the walls of Jerusalem.', ['Nehemiah 8:10', 'for the joy of the LORD is your strength.']],
    ['Esther', 10, 'history', 'k', 'Queen Esther saves her people from wicked Haman.', ['Esther 4:14', 'and who knoweth whether thou art come to the kingdom for such a time as this?']],
    ['Job', 42, 'poetry', 'k', 'Job loses everything but keeps trusting God.', ['Job 1:21', 'And said, Naked came I out of my mother’s womb, and naked shall I return thither: the LORD gave, and the LORD hath taken away; blessed be the name of the LORD.']],
    ['Psalms', 150, 'poetry', 'k', 'One hundred and fifty songs and prayers, many by King David.', ['Psalm 23:1', 'The LORD is my shepherd; I shall not want.']],
    ['Proverbs', 31, 'poetry', 'k', 'Wise sayings, many from King Solomon.', ['Proverbs 3:5', 'Trust in the LORD with all thine heart; and lean not unto thine own understanding.']],
    ['Ecclesiastes', 12, 'poetry', 'f', 'The Preacher asks what life under the sun is for.', ['Ecclesiastes 3:1', 'To every thing there is a season, and a time to every purpose under the heaven']],
    ['Song of Solomon', 8, 'poetry', 'f', 'A love song between a bride and her beloved.', ['Song of Solomon 2:4', 'He brought me to the banqueting house, and his banner over me was love.']],
    ['Isaiah', 66, 'major', 'k', 'The prophet who foretold the coming Messiah.', ['Isaiah 40:31', 'But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint.']],
    ['Jeremiah', 52, 'major', 'f', 'The weeping prophet warns Judah before Babylon comes.', ['Jeremiah 29:11', 'For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end.']],
    ['Lamentations', 5, 'major', 's', 'Five sad poems over fallen Jerusalem.', ['Lamentations 3:22-23', 'It is of the LORD’s mercies that we are not consumed, because his compassions fail not. They are new every morning: great is thy faithfulness.']],
    ['Ezekiel', 48, 'major', 'f', 'Visions in exile: wheels, a new temple and a valley of dry bones.', ['Ezekiel 37:4', 'Again he said unto me, Prophesy upon these bones, and say unto them, O ye dry bones, hear the word of the LORD.']],
    ['Daniel', 12, 'major', 'k', 'Daniel and his friends stay faithful in Babylon.', ['Daniel 6:22', 'My God hath sent his angel, and hath shut the lions’ mouths, that they have not hurt me']],
    ['Hosea', 14, 'minor', 'f', 'A prophet’s faithful love pictures God’s love for Israel.', ['Hosea 6:6', 'For I desired mercy, and not sacrifice; and the knowledge of God more than burnt offerings.']],
    ['Joel', 3, 'minor', 's', 'A plague of locusts and the promise of God’s spirit.', ['Joel 2:28', 'And it shall come to pass afterward, that I will pour out my spirit upon all flesh; and your sons and your daughters shall prophesy, your old men shall dream dreams, your young men shall see visions']],
    ['Amos', 9, 'minor', 's', 'A shepherd from Tekoa calls Israel to justice.', ['Amos 5:24', 'But let judgment run down as waters, and righteousness as a mighty stream.']],
    ['Obadiah', 1, 'minor', 's', 'The shortest book of the Old Testament, about Edom.', ['Obadiah 1:15', 'For the day of the LORD is near upon all the heathen: as thou hast done, it shall be done unto thee: thy reward shall return upon thine own head.']],
    ['Jonah', 4, 'minor', 'k', 'Jonah runs from God, is swallowed by a great fish, and preaches to Nineveh.', ['Jonah 1:17', 'Now the LORD had prepared a great fish to swallow up Jonah. And Jonah was in the belly of the fish three days and three nights.']],
    ['Micah', 7, 'minor', 'f', 'The prophet who named Bethlehem as the Messiah’s birthplace.', ['Micah 6:8', 'He hath shewed thee, O man, what is good; and what doth the LORD require of thee, but to do justly, and to love mercy, and to walk humbly with thy God?']],
    ['Nahum', 3, 'minor', 's', 'The fall of Nineveh, the city Jonah preached to.', ['Nahum 1:7', 'The LORD is good, a strong hold in the day of trouble; and he knoweth them that trust in him.']],
    ['Habakkuk', 3, 'minor', 's', 'A prophet asks God hard questions and learns to wait.', ['Habakkuk 2:4', 'Behold, his soul which is lifted up is not upright in him: but the just shall live by his faith.']],
    ['Zephaniah', 3, 'minor', 's', 'The day of the LORD, and God rejoicing over his people.', ['Zephaniah 3:17', 'The LORD thy God in the midst of thee is mighty; he will save, he will rejoice over thee with joy; he will rest in his love, he will joy over thee with singing.']],
    ['Haggai', 2, 'minor', 's', 'A call to finish rebuilding the temple.', ['Haggai 1:5', 'Now therefore thus saith the LORD of hosts; Consider your ways.']],
    ['Zechariah', 14, 'minor', 's', 'Visions of hope, and a king riding on a donkey.', ['Zechariah 4:6', 'Then he answered and spake unto me, saying, This is the word of the LORD unto Zerubbabel, saying, Not by might, nor by power, but by my spirit, saith the LORD of hosts.']],
    ['Malachi', 4, 'minor', 'f', 'The last book of the Old Testament.', ['Malachi 3:6', 'For I am the LORD, I change not; therefore ye sons of Jacob are not consumed.']],

    ['Matthew', 28, 'gospels', 'k', 'The life of Jesus, the King foretold by the prophets.', ['Matthew 28:19', 'Go ye therefore, and teach all nations, baptizing them in the name of the Father, and of the Son, and of the Holy Ghost']],
    ['Mark', 16, 'gospels', 'k', 'The shortest Gospel, full of the things Jesus did.', ['Mark 10:45', 'For even the Son of man came not to be ministered unto, but to minister, and to give his life a ransom for many.']],
    ['Luke', 24, 'gospels', 'k', 'Written by a doctor: the Christmas story, the lost sheep and the good Samaritan.', ['Luke 19:10', 'For the Son of man is come to seek and to save that which was lost.']],
    ['John', 21, 'gospels', 'k', 'Seven signs and the I am sayings of Jesus.', ['John 3:16', 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.']],
    ['Acts', 28, 'acts', 'k', 'The Holy Ghost comes, and the church spreads from Jerusalem to Rome.', ['Acts 1:8', 'But ye shall receive power, after that the Holy Ghost is come upon you: and ye shall be witnesses unto me both in Jerusalem, and in all Judaea, and in Samaria, and unto the uttermost part of the earth.']],
    ['Romans', 16, 'paul', 'k', 'Paul explains the good news to the church in Rome.', ['Romans 8:28', 'And we know that all things work together for good to them that love God, to them who are the called according to his purpose.']],
    ['1 Corinthians', 16, 'paul', 'f', 'Paul writes to a troubled church, with the great chapter on love.', ['1 Corinthians 13:13', 'And now abideth faith, hope, charity, these three; but the greatest of these is charity.']],
    ['2 Corinthians', 13, 'paul', 'f', 'Paul writes about comfort, weakness and new life.', ['2 Corinthians 5:17', 'Therefore if any man be in Christ, he is a new creature: old things are passed away; behold, all things are become new.']],
    ['Galatians', 6, 'paul', 'f', 'Freedom in Christ, and the fruit of the Spirit.', ['Galatians 2:20', 'I am crucified with Christ: nevertheless I live; yet not I, but Christ liveth in me: and the life which I now live in the flesh I live by the faith of the Son of God, who loved me, and gave himself for me.']],
    ['Ephesians', 6, 'paul', 'f', 'Saved by grace, and the whole armour of God.', ['Ephesians 2:8', 'For by grace are ye saved through faith; and that not of yourselves: it is the gift of God']],
    ['Philippians', 4, 'paul', 'f', 'A joyful letter Paul wrote from prison.', ['Philippians 4:13', 'I can do all things through Christ which strengtheneth me.']],
    ['Colossians', 4, 'paul', 'f', 'Christ above all things.', ['Colossians 3:2', 'Set your affection on things above, not on things on the earth.']],
    ['1 Thessalonians', 5, 'paul', 'f', 'Paul encourages a young church about the coming of the Lord.', ['1 Thessalonians 5:17', 'Pray without ceasing.']],
    ['2 Thessalonians', 3, 'paul', 's', 'Stand firm and keep working while you wait.', ['2 Thessalonians 3:13', 'But ye, brethren, be not weary in well doing.']],
    ['1 Timothy', 6, 'paul', 'f', 'Paul guides young Timothy in leading a church.', ['1 Timothy 4:12', 'Let no man despise thy youth; but be thou an example of the believers, in word, in conversation, in charity, in spirit, in faith, in purity.']],
    ['2 Timothy', 4, 'paul', 'f', 'Paul’s last letter, written from prison.', ['2 Timothy 4:7', 'I have fought a good fight, I have finished my course, I have kept the faith']],
    ['Titus', 3, 'paul', 's', 'Advice for the churches on the island of Crete.', ['Titus 3:5', 'Not by works of righteousness which we have done, but according to his mercy he saved us, by the washing of regeneration, and renewing of the Holy Ghost']],
    ['Philemon', 1, 'paul', 's', 'Paul asks Philemon to welcome back Onesimus as a brother.', ['Philemon 1:7', 'For we have great joy and consolation in thy love, because the bowels of the saints are refreshed by thee, brother.']],
    ['Hebrews', 13, 'general', 'f', 'Jesus is greater than the angels, Moses and the priests, and the hall of faith.', ['Hebrews 11:1', 'Now faith is the substance of things hoped for, the evidence of things not seen.']],
    ['James', 5, 'general', 'f', 'Faith that shows itself in what we do.', ['James 1:22', 'But be ye doers of the word, and not hearers only, deceiving your own selves.']],
    ['1 Peter', 5, 'general', 'f', 'Hope for Christians who suffer.', ['1 Peter 5:7', 'Casting all your care upon him; for he careth for you.']],
    ['2 Peter', 3, 'general', 's', 'Grow in grace, and the promise of the Lord’s return.', ['2 Peter 3:9', 'The Lord is not slack concerning his promise, as some men count slackness; but is longsuffering to us-ward, not willing that any should perish, but that all should come to repentance.']],
    ['1 John', 5, 'general', 'f', 'God is light, and God is love.', ['1 John 4:8', 'He that loveth not knoweth not God; for God is love.']],
    ['2 John', 1, 'general', 's', 'A short letter to the elect lady and her children.', ['2 John 1:6', 'And this is love, that we walk after his commandments. This is the commandment, That, as ye have heard from the beginning, ye should walk in it.']],
    ['3 John', 1, 'general', 's', 'A short letter to Gaius about welcoming travelling teachers.', ['3 John 1:4', 'I have no greater joy than to hear that my children walk in truth.']],
    ['Jude', 1, 'general', 's', 'Contend for the faith, and a famous blessing at the end.', ['Jude 1:24', 'Now unto him that is able to keep you from falling, and to present you faultless before the presence of his glory with exceeding joy']],
    ['Revelation', 22, 'prophecy', 'k', 'John’s vision of the end, and a new heaven and a new earth.', ['Revelation 21:4', 'And God shall wipe away all tears from their eyes; and there shall be no more death, neither sorrow, nor crying, neither shall there be any more pain: for the former things are passed away.']]
  ];

  // A short stable id, so "already seen" lists survive edits elsewhere.
  function hashId(prefix, s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return prefix + (h >>> 0).toString(36);
  }

  var DIV = {};
  DIVISIONS.forEach(function (d) { DIV[d.id] = d; });

  var books = BOOKS.map(function (r, i) {
    var d = DIV[r[2]];
    return {
      name: r[0], chapters: r[1], division: d.name, divisionId: d.id,
      testament: i < 39 ? 'OT' : 'NT', order: i + 1, level: LEVELS[r[3]],
      about: r[4], ref: r[5][0], verse: r[5][1]
    };
  });

  var NT_FIRST = 'Matthew';
  var bookOrder = {};
  books.forEach(function (b) { bookOrder[b.name] = b; });
  function testamentOf(ref) {
    var name = String(ref).replace(/\s+\d+:[\d\-,]+$/, '').replace(/^Psalm$/, 'Psalms');
    var b = bookOrder[name];
    return b ? b.testament : (ref.indexOf(NT_FIRST) === 0 ? 'NT' : 'OT');
  }

  FF.data.bible = {
    whoAmI: WHO.map(function (r) {
      return {
        id: hashId('bw', r[0]), answer: r[0], level: LEVELS[r[1]], testament: r[2], gender: r[3],
        clues: r[4].slice(), story: r[5], ref: r[6][0], verse: r[6][1]
      };
    }),
    verses: VERSES.map(function (r) {
      return {
        id: hashId('bv', r[0]), reference: r[0], level: LEVELS[r[1]], text: r[2],
        part: r[3] || r[2], testament: testamentOf(r[0])
      };
    }),
    divisions: DIVISIONS.slice(),
    books: books
  };
})();
