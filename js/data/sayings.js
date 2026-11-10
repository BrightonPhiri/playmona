/* ============================================================
   PLAYMONA — data/sayings.js
   Every saying in Say What?. A saying shows with one word (or,
   on Hard, two) missing and players fill the gap.

   Row: [id, level, text, meaning, decoys, opts]
     id: short, stable, lowercase a-z0-9 (history keys on it).
     level: 'easy' | 'normal' | 'hard'. Kids rows are all easy.
     text: the commonly known form; {word} marks every word that
       may be a gap (1 to 3 per saying). Bible: KJV wording.
     meaning: one plain, child-friendly line shown at the reveal.
     decoys: { gap: [4-6 wrong words] }, same word class, never a
       right answer, never another real form of the saying.
     opts.also: { gap: [other words that are also right] }.
     opts.two: [gapA, gapB], a pair that may be hidden together
       (Hard rows only).
   Checked by tools/saywhat/check.js.
   Classic script, ES5.
   ============================================================ */
window.FF = window.FF || {};
(function () {
  'use strict';
  FF.data = FF.data || {};

  var PACKS = [
    { id: 'everyday', name: 'Everyday' },
    { id: 'african', name: 'African proverbs' },
    { id: 'bible', name: 'Bible' },
    { id: 'kids', name: 'Kids' }
  ];

  var rows = [];
  function P(pack, list) {
    list.forEach(function (x) {
      var o = x[5] || {};
      var r = { id: x[0], pack: pack, level: x[1], text: x[2], meaning: x[3], decoys: x[4] };
      if (o.also) r.also = o.also;
      if (o.two) r.two = o.two;
      rows.push(r);
    });
  }

  /* The words inside {} in order: "{Rome} wasn't {built}" -> ['Rome', 'built']. */
  function gapsOf(text) {
    var out = [];
    String(text).replace(/\{([^}]*)\}/g, function (m, w) { out.push(w); return m; });
    return out;
  }
  /* The saying with the braces removed. */
  function plain(text) { return String(text).replace(/[{}]/g, ''); }

  /* everyday */
P('everyday', [
  ['erome', 'easy', "{Rome} wasn't {built} in a day", 'Big things take time.', { Rome: ['Paris', 'London', 'Athens', 'Cairo'], built: ['found', 'won', 'cleaned', 'painted'] }],
  ['ebird', 'easy', 'The early {bird} catches the {worm}', 'People who start early get the best chances.', { bird: ['cat', 'fox', 'dog', 'owl', 'frog'], worm: ['fly', 'fish', 'mouse', 'ball', 'beetle'] }],
  ['eapple', 'easy', 'An {apple} a day keeps the {doctor} away', 'Eating healthy food helps you stay well.', { apple: ['orange', 'egg', 'banana', 'carrot', 'biscuit'], doctor: ['teacher', 'dentist', 'postman', 'farmer', 'baker'] }],
  ['epractice', 'easy', '{Practice} makes {perfect}', 'The more you do something, the better you get.', { Practice: ['Patience', 'Money', 'Kindness', 'Time', 'Effort'], perfect: ['happy', 'tired', 'rich', 'easy', 'strong'] }, { also: { Practice: ['Practise'] } }],
  ['elate', 'easy', 'Better {late} than {never}', 'Doing something late is better than not doing it.', { late: ['early', 'quick', 'tired', 'small', 'loud'], never: ['always', 'sometimes', 'today', 'tomorrow', 'soon'] }],
  ['elook', 'easy', 'Look before you {leap}', 'Think carefully before you act.', { leap: ['run', 'speak', 'eat', 'sleep', 'sing'] }],
  ['eactions', 'easy', '{Actions} speak {louder} than {words}', 'What you do shows more than what you say.', { Actions: ['Children', 'Birds', 'Drums', 'Pictures'], louder: ['softer', 'quicker', 'slower', 'sweeter'], words: ['songs', 'drums', 'whispers', 'letters', 'bells'] }],
  ['ehonesty', 'easy', '{Honesty} is the best {policy}', 'Telling the truth is always the best choice.', { Honesty: ['Kindness', 'Silence', 'Patience', 'Courage', 'Sleep'], policy: ['answer', 'choice', 'plan', 'gift', 'rule'] }],
  ['elaughter', 'easy', '{Laughter} is the best {medicine}', 'Having a good laugh helps you feel better.', { Laughter: ['Sleep', 'Music', 'Chocolate', 'Exercise', 'Dancing'], medicine: ['food', 'gift', 'game', 'toy', 'friend'] }],
  ['etwoheads', 'easy', 'Two {heads} are better than one', 'Two people thinking together find better ideas.', { heads: ['hands', 'cats', 'eyes', 'feet', 'hats'] }],
  ['ewill', 'easy', "Where there's a {will}, there's a {way}", 'If you really want something, you will find a way.', { will: ['wall', 'hill', 'road', 'door', 'wish'], way: ['door', 'light', 'cake', 'friend', 'bridge'] }],
  ['eeggs', 'easy', "Don't put all your {eggs} in one {basket}", "Don't risk everything on just one thing.", { eggs: ['apples', 'toys', 'coins', 'socks', 'books'], basket: ['box', 'bag', 'bucket', 'drawer', 'pocket'] }],
  ['echickens', 'easy', "Don't count your {chickens} before they {hatch}", "Don't be sure of something before it happens.", { chickens: ['ducks', 'sheep', 'kittens', 'coins', 'cows'], hatch: ['wake', 'grow', 'sing', 'swim', 'run'] }],
  ['ebook', 'easy', "Don't judge a {book} by its {cover}", "Don't decide about something just by how it looks.", { book: ['cake', 'house', 'car', 'box', 'film'], cover: ['colour', 'size', 'smell', 'price', 'pages'] }],
  ['egrass', 'easy', 'The {grass} is always {greener} on the other side', "Other people's things often seem better than ours.", { grass: ['sky', 'sea', 'road', 'bread', 'cake'], greener: ['bluer', 'taller', 'warmer', 'softer', 'brighter'] }],
  ['ecloud', 'easy', 'Every {cloud} has a {silver} lining', 'Even bad times have something good in them.', { cloud: ['coat', 'sky', 'storm', 'box', 'door'], silver: ['golden', 'woolly', 'bright', 'purple', 'paper'] }],
  ['efeather', 'normal', '{Birds} of a {feather} flock together', 'People who are alike like to spend time together.', { Birds: ['Cats', 'Sheep', 'Fish', 'Bees', 'Friends'], feather: ['colour', 'nest', 'song', 'wing', 'tail'] }],
  ['erains', 'normal', 'It never {rains} but it {pours}', 'When one bad thing happens, more tend to follow.', { rains: ['snows', 'shines', 'blows', 'hails'], pours: ['stops', 'ends', 'shines', 'dries'] }],
  ['ebroom', 'normal', 'A new {broom} sweeps {clean}', 'Someone new in a job often makes lots of changes.', { broom: ['brush', 'mop', 'cloth', 'rake', 'sponge'], clean: ['slowly', 'badly', 'loudly', 'sideways', 'twice'] }],
  ['ehaste', 'hard', 'More {haste}, less {speed}', 'Rushing often makes things take longer.', { haste: ['sleep', 'noise', 'food', 'rain', 'money'], speed: ['noise', 'sleep', 'food', 'rain', 'money'] }],
  ['elaughs', 'normal', 'He who {laughs} last laughs {longest}', 'Whoever wins in the end is happiest.', { laughs: ['sings', 'smiles', 'runs', 'eats', 'cries'], longest: ['loudest', 'quietest', 'first', 'slowest', 'sweetest'] }, { also: { longest: ['best'] } }],
  ['eknowledge', 'easy', '{Knowledge} is {power}', 'Knowing things helps you do more.', { Knowledge: ['Money', 'Time', 'Music', 'Laughter', 'Kindness'], power: ['magic', 'gold', 'fun', 'food'] }],
  ['etime', 'easy', '{Time} is {money}', 'Wasting time is like wasting money.', { Time: ['Food', 'Work', 'Sleep', 'Love', 'Music'], money: ['water', 'food', 'fun', 'magic', 'paper'] }],
  ['enothing', 'hard', 'Nothing {ventured}, nothing {gained}', 'If you never try, you can never win anything.', { ventured: ['spent', 'lost', 'given', 'planted', 'asked'], gained: ['lost', 'spent', 'broken', 'wasted', 'learned'] }],
  ['epot', 'normal', 'A {watched} {pot} never {boils}', 'Waiting and watching makes time feel slower.', { watched: ['hungry', 'empty', 'small', 'cold', 'heavy'], pot: ['cup', 'bath', 'jug', 'oven', 'egg'], boils: ['breaks', 'spills', 'cools', 'shines', 'sleeps'] }],
  ['ecooks', 'normal', 'Too many {cooks} spoil the {broth}', 'Too many people in charge can mess things up.', { cooks: ['bakers', 'children', 'waiters', 'farmers', 'dogs'], broth: ['cake', 'party', 'garden', 'bread', 'game'] }],
  ['enecessity', 'hard', '{Necessity} is the {mother} of {invention}', 'When you really need something, you find clever ways to get it.', { Necessity: ['Patience', 'Music', 'Silence', 'Money', 'Kindness'], mother: ['father', 'sister', 'teacher', 'friend', 'baby'], invention: ['music', 'laughter', 'dinner', 'learning', 'kindness'] }, { two: ['mother', 'invention'] }],
  ['eabsence', 'hard', '{Absence} makes the {heart} grow {fonder}', 'We miss people more when they are away.', { Absence: ['Kindness', 'Music', 'Sunshine', 'Laughter', 'Patience'], heart: ['nose', 'hair', 'garden', 'cake', 'tree'], fonder: ['louder', 'colder', 'bigger', 'older', 'softer'] }, { two: ['heart', 'fonder'] }],
  ['eknocks', 'normal', '{Opportunity} only {knocks} once', 'Grab a good chance when it comes.', { Opportunity: ['Trouble', 'Thunder', 'Winter', 'Breakfast', 'Grandma'], knocks: ['rings', 'sings', 'waves', 'sleeps', 'laughs'] }],
  ['ebarking', 'hard', '{Barking} {dogs} seldom {bite}', 'People who make the most noise often do the least.', { Barking: ['Hungry', 'Happy', 'Little', 'Muddy', 'Spotted'], dogs: ['cats', 'geese', 'birds', 'horses', 'foxes'], bite: ['sleep', 'swim', 'sing', 'eat', 'run'] }],
  ['esleeping', 'normal', 'Let {sleeping} {dogs} lie', 'Leave a problem alone if it is quiet now.', { sleeping: ['hungry', 'happy', 'muddy', 'little', 'spotted'], dogs: ['cats', 'horses', 'sheep', 'foxes', 'pigs'] }],
  ['ebridge', 'normal', "We'll {cross} that {bridge} when we come to it", "Don't worry about a problem until it happens.", { cross: ['build', 'paint', 'sweep', 'fix'], bridge: ['river', 'road', 'street', 'field', 'hill'] }],
  ['emilk', 'easy', "It's no use {crying} over {spilt} {milk}", "Don't be upset about things that can't be changed.", { crying: ['laughing', 'shouting', 'singing', 'worrying'], spilt: ['cold', 'sour', 'warm', 'fresh', 'old'], milk: ['tea', 'juice', 'water', 'soup', 'paint'] }, { also: { spilt: ['spilled'] } }],
  ['eignorance', 'normal', '{Ignorance} is {bliss}', 'Sometimes not knowing something keeps you happier.', { Ignorance: ['Kindness', 'Silence', 'Music', 'Sleep', 'Laughter'], bliss: ['magic', 'gold', 'fun', 'sunshine', 'treasure'] }],
  ['ebeholder', 'hard', '{Beauty} is in the {eye} of the {beholder}', 'Different people find different things beautiful.', { Beauty: ['Music', 'Kindness', 'Truth', 'Wisdom', 'Laughter'], eye: ['hand', 'ear', 'heart', 'nose', 'mind'], beholder: ['painter', 'farmer', 'owner', 'baker', 'singer'] }, { two: ['eye', 'beholder'] }],
  ['eheart', 'easy', '{Home} is where the {heart} is', 'Home is wherever the people you love are.', { Home: ['School', 'Work', 'Paris', 'Breakfast', 'Lunch'], heart: ['kettle', 'dog', 'garden', 'music', 'money'] }],
  ['eeast', 'normal', '{East} or {west}, {home} is best', 'No place is as good as your own home.', { East: ['North', 'South', 'Up', 'Left'], west: ['south', 'north', 'up', 'left'], home: ['school', 'work', 'bed', 'food', 'sleep'] }],
  ['eroads', 'normal', 'All {roads} lead to {Rome}', 'There are many ways to reach the same result.', { roads: ['rivers', 'trains', 'boats', 'birds', 'ships'], Rome: ['Paris', 'London', 'Athens', 'Madrid', 'Cairo'] }],
  ['eromans', 'normal', 'When in {Rome}, do as the {Romans} do', 'Follow the ways of the place you are visiting.', { Rome: ['Paris', 'Athens', 'London', 'Madrid', 'Venice'], Romans: ['Greeks', 'Spanish', 'Italians', 'Vikings', 'English'] }],
  ['ewrongs', 'easy', "Two {wrongs} don't make a {right}", 'Doing something bad back does not fix things.', { wrongs: ['halves', 'fools', 'shoes', 'socks', 'lefts'], right: ['left', 'friend', 'circle', 'rule', 'song'] }],
  ['esteady', 'easy', '{Slow} and {steady} wins the {race}', 'Keeping going carefully beats rushing.', { Slow: ['Fast', 'Quick', 'Loud', 'Big', 'Lazy'], steady: ['quiet', 'lazy', 'sleepy', 'happy', 'careful'], race: ['game', 'prize', 'cup', 'match', 'medal'] }],
  ['ecats', 'easy', "When the {cat's} away, the {mice} will {play}", 'People misbehave when no one is in charge.', { "cat's": ["dog's", "cook's", "owl's", "fox's", "king's"], mice: ['dogs', 'birds', 'ducks', 'frogs', 'rabbits'], play: ['sing', 'eat', 'hide', 'sleep', 'run'] }],
  ['evessels', 'hard', '{Empty} {vessels} make the most {noise}', 'People who know the least often talk the most.', { Empty: ['Small', 'Heavy', 'Old', 'Golden', 'Wooden'], vessels: ['chairs', 'rooms', 'shoes', 'plates', 'pockets'], noise: ['mess', 'money', 'friends', 'smoke', 'dust'] }, { also: { vessels: ['barrels'], noise: ['sound'] } }],
  ['esmoke', 'normal', "There's no {smoke} without {fire}", 'If people are talking about something, it may be true.', { smoke: ['steam', 'rain', 'cake', 'light', 'noise'], fire: ['wind', 'water', 'cake', 'bread', 'rain'] }],
  ['eleopard', 'normal', "A {leopard} can't change its {spots}", 'People do not easily change who they are.', { leopard: ['tiger', 'zebra', 'giraffe', 'lion', 'snake'], spots: ['tail', 'shoes', 'name', 'mind', 'voice'] }],
  ['etricks', 'easy', "You can't teach an {old} {dog} new {tricks}", 'It is hard to change habits you have had a long time.', { old: ['young', 'big', 'small', 'lazy', 'tired'], dog: ['cat', 'horse', 'fish', 'bird', 'parrot'], tricks: ['words', 'games', 'songs', 'dances', 'jokes'] }],
  ['eneedle', 'easy', 'Like looking for a {needle} in a {haystack}', 'Something that is very hard to find.', { needle: ['button', 'coin', 'key', 'ring', 'spoon'], haystack: ['garden', 'cupboard', 'bucket', 'sandpit', 'bath'] }],
  ['ecake', 'easy', 'A {piece} of {cake}', 'Something that is very easy to do.', { piece: ['bowl', 'bag', 'cup', 'jar', 'plate'], cake: ['bread', 'cheese', 'toast', 'paper', 'wood'] }],
  ['eraining', 'easy', "It's raining {cats} and {dogs}", 'It is raining very hard.', { cats: ['frogs', 'fish', 'birds', 'mice', 'cows'], dogs: ['mice', 'birds', 'fish', 'frogs', 'sheep'] }],
  ['ebeans', 'easy', '{Spill} the {beans}', 'Tell a secret.', { Spill: ['Cook', 'Eat', 'Plant', 'Count', 'Drop'], beans: ['peas', 'rice', 'soup', 'sweets', 'nuts'] }],
  ['echew', 'normal', 'Bite off more than you can {chew}', 'Take on more than you can manage.', { chew: ['carry', 'read', 'lift', 'hold', 'spend'] }],
  ['eice', 'easy', '{Break} the {ice}', 'Do something to help people feel relaxed.', { Break: ['Melt', 'Eat', 'Skate', 'Freeze', 'Paint'], ice: ['glass', 'bread', 'door', 'chair', 'wall'] }],
  ['emoon', 'easy', 'Once in a {blue} {moon}', 'Very rarely.', { blue: ['red', 'green', 'pink', 'yellow', 'silver'], moon: ['sky', 'sun', 'star', 'sea', 'cloud'] }],
  ['enail', 'normal', '{Hit} the {nail} on the {head}', 'Say exactly the right thing.', { Hit: ['Tap', 'Paint', 'Push', 'Kick', 'Pull'], nail: ['hat', 'ball', 'bell', 'drum', 'coin'], head: ['nose', 'top', 'toe', 'side', 'tail'] }],
  ['ehorsemouth', 'normal', "Straight from the {horse's} {mouth}", 'Heard from the person who really knows.', { "horse's": ["cow's", "dog's", "cat's", "lion's", "fox's"], mouth: ['nose', 'tail', 'ear', 'back', 'foot'] }],
  ['eelephant', 'normal', 'The {elephant} in the {room}', 'A big problem that nobody wants to talk about.', { elephant: ['giraffe', 'tiger', 'monkey', 'hippo', 'rhino'], room: ['garden', 'kitchen', 'car', 'zoo', 'house'] }],
  ['ebush', 'normal', "Don't {beat} about the {bush}", 'Say what you mean without wasting time.', { beat: ['walk', 'dance', 'run', 'jump', 'sing'], bush: ['tree', 'house', 'garden', 'hedge', 'table'] }],
  ['ehand', 'normal', 'A {bird} in the {hand} is worth two in the {bush}', 'Something you already have beats something you might get.', { bird: ['fish', 'cat', 'coin', 'frog', 'mouse'], hand: ['pocket', 'nest', 'box', 'cage', 'basket'], bush: ['tree', 'sky', 'field', 'garden', 'pond'] }],
  ['ekettle', 'normal', 'The {pot} calling the {kettle} black', 'Blaming someone for something you do too.', { pot: ['pan', 'cup', 'jug', 'spoon', 'plate'], kettle: ['cooker', 'oven', 'toaster', 'teapot', 'chimney'] }],
  ['ehay', 'normal', 'Make {hay} while the {sun} {shines}', 'Use a good chance while you have it.', { hay: ['tea', 'bread', 'cake', 'jam', 'friends'], sun: ['moon', 'sky', 'sea', 'lamp', 'fire'], shines: ['sets', 'rises', 'sleeps', 'smiles', 'sings'] }],
  ['esilence', 'easy', '{Silence} is {golden}', 'Sometimes it is best to say nothing.', { Silence: ['Music', 'Laughter', 'Kindness', 'Patience', 'Sleep'], golden: ['lovely', 'magic', 'boring', 'sweet', 'purple'] }],
  ['ecookie', 'normal', "That's the way the {cookie} {crumbles}", 'Sometimes things just happen and you have to accept it.', { cookie: ['cake', 'bread', 'cheese', 'castle', 'ball'], crumbles: ['melts', 'rolls', 'tastes', 'smells', 'shines'] }],
  ['etree', 'normal', "The {apple} doesn't {fall} far from the {tree}", 'Children are often like their parents.', { apple: ['pear', 'plum', 'leaf', 'orange', 'nut'], fall: ['roll', 'grow', 'fly', 'swim', 'run'], tree: ['house', 'road', 'garden', 'bush', 'river'] }],
  ['epen', 'normal', 'The {pen} is mightier than the {sword}', 'Words can be stronger than fighting.', { pen: ['book', 'brush', 'spoon', 'drum', 'hat'], sword: ['shield', 'spoon', 'hammer', 'drum', 'rock'] }],
  ['echain', 'normal', 'A {chain} is only as {strong} as its {weakest} link', 'A group is only as strong as its weakest part.', { chain: ['rope', 'team', 'bridge', 'fence', 'wall'], strong: ['long', 'short', 'heavy', 'shiny', 'fast'], weakest: ['shortest', 'strongest', 'newest', 'oldest', 'smallest'] }],
  ['estone', 'normal', 'A {rolling} {stone} gathers no {moss}', 'People who keep moving do not get stuck.', { rolling: ['falling', 'sleeping', 'sitting', 'spinning', 'jumping'], stone: ['ball', 'wheel', 'egg', 'barrel', 'coin'], moss: ['friends', 'leaves', 'money', 'sand', 'mud'] }],
  ['ebeggars', 'normal', "{Beggars} can't be {choosers}", 'If you need help, take what you are given.', { Beggars: ['Bakers', 'Farmers', 'Sailors', 'Kings', 'Winners'], choosers: ['singers', 'dancers', 'sleepers', 'leaders', 'eaters'] }],
  ['egold', 'normal', 'All that {glitters} is not {gold}', 'Things that look good are not always good.', { glitters: ['rattles', 'wobbles', 'sings', 'bounces', 'floats'], gold: ['silver', 'glass', 'paper', 'cheese', 'honey'] }, { also: { glitters: ['glisters'] } }],
  ['edogday', 'easy', 'Every {dog} has its {day}', 'Everyone gets a turn to shine.', { dog: ['cat', 'bird', 'horse', 'cow', 'sheep'], day: ['bone', 'bed', 'toy', 'ball', 'name'] }],
  ['esight', 'easy', 'Out of {sight}, out of {mind}', 'We forget things we no longer see.', { sight: ['time', 'breath', 'town', 'school', 'bed'], mind: ['town', 'school', 'house', 'bed', 'garden'] }],
  ['ehands', 'normal', 'Many {hands} make {light} work', 'Jobs are easier when lots of people help.', { hands: ['feet', 'eyes', 'friends', 'heads', 'birds'], light: ['heavy', 'slow', 'hard', 'long', 'dull'] }],
  ['etreasure', 'normal', "One man's {trash} is another man's {treasure}", 'Something one person throws away, another may love.', { trash: ['lunch', 'hat', 'shoes', 'garden', 'dog'], treasure: ['hat', 'lunch', 'problem', 'homework', 'friend'] }, { also: { trash: ['rubbish'] } }],
  ['eswallow', 'hard', "One {swallow} doesn't make a {summer}", 'One good sign does not mean everything has changed.', { swallow: ['robin', 'sparrow', 'pigeon', 'duck', 'owl'], summer: ['winter', 'holiday', 'birthday', 'party', 'garden'] }, { two: ['swallow', 'summer'] }],
  ['eroost', 'hard', 'The {chickens} have come home to {roost}', 'Past mistakes are now causing trouble.', { chickens: ['ducks', 'cows', 'sheep', 'pigeons', 'ponies'], roost: ['dinner', 'play', 'sing', 'bathe', 'dance'] }],
  ['esafe', 'easy', 'Better {safe} than {sorry}', 'It is wiser to be careful than to have regrets.', { safe: ['rich', 'quick', 'loud', 'happy', 'tall'], sorry: ['hungry', 'tired', 'cold', 'bored', 'grumpy'] }],
  ['esaid', 'easy', '{Easier} {said} than {done}', 'Talking about something is easier than doing it.', { Easier: ['Harder', 'Quicker', 'Louder', 'Funnier', 'Nicer'], said: ['sung', 'eaten', 'drawn', 'cooked', 'written'], done: ['eaten', 'sung', 'drawn', 'cooked', 'read'] }],
  ['elemons', 'easy', 'When {life} gives you {lemons}, make {lemonade}', 'Turn a bad thing into something good.', { life: ['school', 'winter', 'work', 'luck', 'rain'], lemons: ['oranges', 'apples', 'onions', 'potatoes', 'carrots'], lemonade: ['soup', 'tea', 'jam', 'cake', 'pie'] }],
  ['efortune', 'normal', '{Fortune} favours the {bold}', 'People who are brave often get lucky.', { Fortune: ['Winter', 'Music', 'Silence', 'Kindness', 'Weather'], bold: ['quiet', 'slow', 'shy', 'lazy', 'tall'] }, { also: { bold: ['brave'] } }],
  ['ehabits', 'normal', 'Old {habits} die {hard}', 'It is difficult to stop doing things you always do.', { habits: ['shoes', 'songs', 'friends', 'books', 'toys'], hard: ['fast', 'slow', 'soft', 'easy', 'loud'] }],
  ['eskin', 'normal', '{Beauty} is only {skin} deep', 'How someone looks matters less than who they are.', { Beauty: ['Music', 'Kindness', 'Wisdom', 'Laughter', 'Sunshine'], skin: ['knee', 'ankle', 'ocean', 'puddle', 'sock'] }],
  ['elightning', 'normal', '{Lightning} never {strikes} twice in the same {place}', 'The same unusual thing rarely happens twice.', { Lightning: ['Thunder', 'Rain', 'Snow', 'Wind', 'Sunshine'], strikes: ['lands', 'sings', 'sleeps', 'knocks', 'shines'], place: ['tree', 'house', 'cloud', 'week', 'town'] }, { also: { place: ['spot'] } }],
  ['epain', 'easy', 'No {pain}, no {gain}', 'You have to work hard to get good results.', { pain: ['rain', 'play', 'sun', 'cake', 'fun'], gain: ['fun', 'prize', 'cake', 'gold', 'rest'] }],
  ['eunited', 'normal', '{United} we {stand}, {divided} we fall', 'We are stronger when we stick together.', { United: ['Happy', 'Quiet', 'Hungry', 'Brave', 'Ready'], stand: ['sit', 'sing', 'run', 'eat', 'dance'], divided: ['hungry', 'sleepy', 'lazy', 'tired', 'grumpy'] }],
  ['etrees', 'easy', "{Money} doesn't {grow} on {trees}", 'Money is hard to get, so be careful with it.', { Money: ['Bread', 'Cake', 'Chocolate', 'Cheese', 'Pizza'], grow: ['sleep', 'hang', 'sit', 'dance', 'fall'], trees: ['roofs', 'clouds', 'chairs', 'walls', 'plates'] }],
  ['epreach', 'normal', '{Practise} what you {preach}', 'Do the things you tell other people to do.', { Practise: ['Eat', 'Sing', 'Write', 'Draw', 'Cook'], preach: ['sing', 'cook', 'buy', 'wear', 'draw'] }],
  ['erose', 'normal', 'Every {rose} has its {thorn}', 'Even lovely things have a bad side.', { rose: ['tree', 'cat', 'fish', 'bird', 'daisy'], thorn: ['petal', 'bee', 'smell', 'leaf', 'colour'] }],
  ['efeeds', 'normal', "Don't {bite} the {hand} that {feeds} you", "Don't be unkind to people who help you.", { bite: ['shake', 'wash', 'hold', 'kiss', 'paint'], hand: ['cat', 'man', 'dog', 'cook', 'mouth'], feeds: ['tickles', 'washes', 'paints', 'waves', 'holds'] }],
  ['epudding', 'hard', 'The {proof} of the {pudding} is in the {eating}', 'You only know if something is good by trying it.', { proof: ['secret', 'colour', 'price', 'smell', 'size'], pudding: ['cake', 'soup', 'bread', 'pie', 'apple'], eating: ['cooking', 'baking', 'buying', 'smelling', 'washing'] }, { two: ['pudding', 'eating'] }],
  ['ebathwater', 'hard', "Don't throw the {baby} out with the {bathwater}", "Don't throw away the good part with the bad.", { baby: ['duck', 'cat', 'soap', 'toy', 'towel'], bathwater: ['rubbish', 'dishes', 'bubbles', 'washing', 'sand'] }, { two: ['baby', 'bathwater'] }],
  ['egoing', 'hard', 'When the {going} gets {tough}, the tough get going', 'Strong people work harder when things get difficult.', { going: ['weather', 'cooking', 'music', 'party', 'walking'], tough: ['wet', 'late', 'cold', 'loud', 'busy'] }, { two: ['going', 'tough'] }],
  ['ehorse', 'normal', "You can lead a {horse} to {water}, but you can't make it {drink}", 'You can help people, but they must choose to act.', { horse: ['cow', 'dog', 'camel', 'sheep', 'goat'], water: ['food', 'school', 'bed', 'grass', 'town'], drink: ['swim', 'sing', 'sleep', 'dance', 'laugh'] }],
  ['esqueaky', 'hard', 'The {squeaky} {wheel} gets the {grease}', 'People who complain the loudest get help first.', { squeaky: ['shiny', 'broken', 'little', 'wobbly', 'heavy'], wheel: ['chair', 'bike', 'car', 'cart', 'toy'], grease: ['cake', 'prize', 'money', 'paint', 'water'] }, { also: { grease: ['oil'] } }],
  ['eiron', 'normal', 'Strike while the {iron} is {hot}', 'Act quickly while you have a good chance.', { iron: ['kettle', 'soup', 'oven', 'pan', 'tea'], hot: ['cold', 'wet', 'new', 'clean', 'dry'] }],
  ['eallswell', 'normal', "{All's} well that {ends} well", 'If things end happily, the problems along the way matter less.', { "All's": ["That's", "It's", "Life's", "Here's", "What's"], ends: ['starts', 'sings', 'looks', 'smells', 'plays'] }],
  ['ehavecake', 'normal', "You can't have your {cake} and {eat} it", 'You cannot have two things that do not go together.', { cake: ['pie', 'bread', 'sandwich', 'apple', 'biscuit'], eat: ['share', 'sell', 'hide', 'cook', 'wrap'] }],
  ['epennies', 'hard', 'Look after the {pennies} and the {pounds} will look after themselves', 'Saving small amounts soon adds up to a lot.', { pennies: ['buttons', 'sweets', 'cats', 'plants', 'shoes'], pounds: ['kittens', 'flowers', 'dogs', 'dollars', 'coins'] }, { two: ['pennies', 'pounds'] }],
  ['eflies', 'hard', 'You catch more {flies} with {honey} than with {vinegar}', 'Being kind gets you further than being rude.', { flies: ['bees', 'fish', 'birds', 'frogs', 'mice'], honey: ['jam', 'cake', 'bread', 'milk', 'cheese'], vinegar: ['salt', 'water', 'pepper', 'mustard', 'lemon'] }, { two: ['honey', 'vinegar'] }],
  ['efool', 'hard', 'A {fool} and his {money} are soon {parted}', 'Silly people spend their money quickly.', { fool: ['king', 'dog', 'baker', 'farmer', 'pirate'], money: ['hat', 'shoes', 'dog', 'lunch', 'sweets'], parted: ['found', 'mended', 'washed', 'counted', 'painted'] }, { two: ['money', 'parted'] }],
  ['eloaf', 'hard', 'Half a {loaf} is {better} than none', 'Having a little is better than having nothing.', { loaf: ['cake', 'pie', 'apple', 'pizza', 'sandwich'], better: ['worse', 'bigger', 'smaller', 'warmer', 'softer'] }],
  ['ewater', 'normal', "It's {water} under the {bridge}", 'It happened in the past, so let it go.', { water: ['sand', 'fish', 'rain', 'snow', 'mud'], bridge: ['table', 'tree', 'door', 'bed', 'road'] }],
  ['ecourt', 'normal', "The {ball's} in your {court}", 'It is your turn to decide or act.', { "ball's": ["cat's", "dog's", "cake's", "bird's", "key's"], court: ['garden', 'pocket', 'kitchen', 'bag', 'room'] }],
  ['earmleg', 'easy', 'It costs an {arm} and a {leg}', 'It is very expensive.', { arm: ['ear', 'eye', 'hand', 'nose', 'elbow'], leg: ['foot', 'toe', 'knee', 'nose', 'hand'] }],
  ['estraw', 'hard', "The {straw} that broke the {camel's} back", 'The last small problem that makes everything too much.', { straw: ['feather', 'apple', 'stick', 'hat', 'spoon'], "camel's": ["horse's", "donkey's", "elephant's", "cow's", "pony's"] }, { two: ['straw', "camel's"] }],
  ['ebag', 'easy', 'Let the {cat} out of the {bag}', 'Give away a secret by accident.', { cat: ['dog', 'bird', 'mouse', 'rabbit', 'fish'], bag: ['box', 'house', 'car', 'basket', 'shed'] }],
  ['ebitten', 'normal', 'Once {bitten}, twice {shy}', 'After a bad time, you are more careful.', { bitten: ['kissed', 'tickled', 'chased', 'washed', 'fed'], shy: ['brave', 'sad', 'happy', 'quick', 'lucky'] }, { also: { bitten: ['burnt', 'burned'] } }],
  ['eminds', 'normal', '{Great} {minds} think {alike}', 'Clever people often have the same ideas.', { Great: ['Tiny', 'Young', 'Busy', 'Happy', 'Sleepy'], minds: ['dogs', 'cooks', 'friends', 'birds', 'hands'], alike: ['aloud', 'slowly', 'often', 'quickly', 'twice'] }],
  ['ewait', 'easy', '{Good} {things} come to those who {wait}', 'Be patient and good things will happen.', { Good: ['Big', 'Small', 'Funny', 'Sweet', 'Strange'], things: ['dogs', 'cakes', 'letters', 'birds', 'parcels'], wait: ['sing', 'run', 'shout', 'hide', 'sleep'] }],
  ['evariety', 'normal', '{Variety} is the {spice} of {life}', 'Trying different things makes life fun.', { Variety: ['Pepper', 'Cheese', 'Homework', 'Winter', 'Kindness'], spice: ['salt', 'bread', 'cake', 'sugar', 'juice'], life: ['soup', 'dinner', 'school', 'cake', 'summer'] }],
  ['epenny', 'normal', 'A {penny} {saved} is a penny {earned}', 'Saving money is as good as earning it.', { penny: ['sweet', 'minute', 'cake', 'button', 'smile'], saved: ['spent', 'lost', 'found', 'dropped', 'given'], earned: ['lost', 'spent', 'wasted', 'found', 'dropped'] }],
  ['etango', 'normal', 'It takes two to {tango}', 'When two people argue, both are part of it.', { tango: ['skate', 'cook', 'sing', 'swim', 'juggle'] }],
  ['efish', 'easy', 'Like a {fish} out of {water}', 'Feeling strange in a new place.', { fish: ['duck', 'frog', 'cat', 'bird', 'whale'], water: ['bed', 'school', 'town', 'bread', 'wool'] }],
  ['ewrongtree', 'easy', 'Barking up the {wrong} {tree}', 'Looking for an answer in the wrong place.', { wrong: ['right', 'tall', 'green', 'old', 'big'], tree: ['bush', 'wall', 'house', 'door', 'hill'] }],
  ['emidnight', 'hard', 'Burn the {midnight} {oil}', 'Stay up late working.', { midnight: ['morning', 'evening', 'kitchen', 'birthday', 'winter'], oil: ['toast', 'wood', 'rice', 'bread', 'paper'] }, { two: ['midnight', 'oil'] }],
  ['ehorses', 'easy', '{Hold} your {horses}', 'Wait a moment and slow down.', { Hold: ['Feed', 'Wash', 'Ride', 'Brush', 'Count'], horses: ['dogs', 'cows', 'sheep', 'hats', 'ponies'] }],
  ['efriend', 'normal', 'A {friend} in {need} is a friend {indeed}', 'A true friend helps you when you need it.', { friend: ['dog', 'cat', 'teacher', 'neighbour', 'cousin'], need: ['town', 'school', 'bed', 'red', 'time'], indeed: ['forever', 'today', 'inside', 'again', 'outside'] }],
  ['eblood', 'hard', '{Blood} is {thicker} than {water}', 'Family bonds are the strongest.', { Blood: ['Milk', 'Soup', 'Honey', 'Juice', 'Paint'], thicker: ['thinner', 'warmer', 'sweeter', 'colder', 'redder'], water: ['milk', 'juice', 'soup', 'tea', 'honey'] }, { two: ['thicker', 'water'] }],
  ['etongue', 'normal', 'Has the {cat} got your {tongue}?', 'Asked when someone is very quiet.', { cat: ['dog', 'mouse', 'bird', 'cow', 'fox'], tongue: ['nose', 'hat', 'shoe', 'sock', 'ball'] }],
  ['ecart', 'normal', "Don't put the {cart} before the {horse}", 'Do things in the right order.', { cart: ['car', 'bike', 'boat', 'chair', 'saddle'], horse: ['cow', 'dog', 'donkey', 'goat', 'train'] }],
  ['efrying', 'hard', 'Out of the {frying} {pan} into the {fire}', 'From one bad situation into a worse one.', { frying: ['baking', 'washing', 'empty', 'shiny', 'little'], pan: ['pot', 'bowl', 'kettle', 'oven', 'box'], fire: ['sea', 'bath', 'oven', 'river', 'snow'] }, { two: ['pan', 'fire'] }],
  ['ejest', 'hard', 'Many a {true} word is spoken in {jest}', 'Jokes often have some truth in them.', { true: ['kind', 'long', 'sad', 'wise', 'big'], jest: ['whispers', 'song', 'school', 'sleep', 'haste'] }],
  ['eboat', 'normal', "Don't {rock} the {boat}", "Don't cause trouble when things are calm.", { rock: ['paint', 'sink', 'sail', 'wash', 'steer'], boat: ['car', 'bus', 'house', 'table', 'chair'] }],
  ['eexception', 'hard', 'The {exception} proves the {rule}', 'A rare odd case shows there is a usual rule.', { exception: ['teacher', 'answer', 'mistake', 'winner', 'question'], rule: ['point', 'story', 'game', 'test', 'sum'] }],
  ['eleaf', 'normal', 'Turn over a {new} {leaf}', 'Start again and behave better.', { new: ['green', 'big', 'old', 'small', 'red'], leaf: ['rock', 'coin', 'card', 'log', 'plate'] }],
  ['eunturned', 'hard', 'Leave no {stone} {unturned}', 'Try every possible way to find something.', { stone: ['shoe', 'cake', 'book', 'door', 'plate'], unturned: ['unpainted', 'unwashed', 'uneaten', 'unopened', 'unread'] }, { two: ['stone', 'unturned'] }],
  ['eseeing', 'easy', '{Seeing} is {believing}', 'You believe things more when you see them yourself.', { Seeing: ['Hearing', 'Eating', 'Sleeping', 'Singing', 'Reading'], believing: ['dancing', 'sleeping', 'cooking', 'winning', 'smiling'] }],
  ['efools', 'hard', '{Fools} {rush} in where {angels} fear to tread', 'Silly people jump into things wise people avoid.', { Fools: ['Kings', 'Dogs', 'Children', 'Sailors', 'Cats'], rush: ['walk', 'sing', 'dance', 'sneak', 'crawl'], angels: ['kittens', 'giants', 'ducks', 'teachers', 'mice'] }, { two: ['rush', 'angels'] }],
  ['evalour', 'hard', '{Discretion} is the better part of {valour}', 'Sometimes being careful is wiser than being brave.', { Discretion: ['Kindness', 'Breakfast', 'Music', 'Silence', 'Laughter'], valour: ['dinner', 'school', 'winter', 'football', 'music'] }],
  ['estill', 'hard', '{Still} {waters} run {deep}', 'Quiet people often have deep thoughts.', { Still: ['Muddy', 'Warm', 'Cold', 'Little', 'Noisy'], waters: ['trains', 'dogs', 'cats', 'horses', 'children'], deep: ['fast', 'slow', 'cold', 'dry', 'wild'] }, { two: ['Still', 'deep'] }],
  ['equestions', 'hard', "Ask me no {questions} and I'll tell you no {lies}", 'If you do not ask, nobody can fib to you.', { questions: ['songs', 'riddles', 'jokes', 'favours', 'stories'], lies: ['songs', 'jokes', 'birds', 'bells', 'music'] }],
  ['ebrevity', 'hard', '{Brevity} is the {soul} of {wit}', 'Short jokes and words are often the best.', { Brevity: ['Music', 'Kindness', 'Patience', 'Silence', 'Laughter'], soul: ['end', 'cake', 'enemy', 'shoe', 'door'], wit: ['dinner', 'music', 'school', 'sport', 'kindness'] }],
  ['econtempt', 'hard', '{Familiarity} {breeds} {contempt}', 'Knowing something too well can make you stop caring.', { Familiarity: ['Kindness', 'Laughter', 'Music', 'Boredom', 'Silence'], breeds: ['cooks', 'paints', 'sings', 'sells', 'hides'], contempt: ['kittens', 'flowers', 'music', 'laughter', 'sunshine'] }, { two: ['breeds', 'contempt'] }],
  ['emuck', 'hard', "Where there's {muck}, there's {brass}", 'Dirty jobs can make good money.', { muck: ['smoke', 'sand', 'rain', 'snow', 'music'], brass: ['wood', 'cheese', 'glass', 'paper', 'wool'] }],
  ['eleast', 'hard', '{Least} {said}, soonest {mended}', 'Saying less helps a quarrel heal faster.', { Least: ['Most', 'Last', 'First', 'Best', 'Worst'], said: ['eaten', 'sung', 'spent', 'drawn', 'cooked'], mended: ['washed', 'painted', 'cooked', 'cleaned', 'sold'] }, { two: ['said', 'mended'] }],
  ['efaint', 'hard', '{Faint} {heart} never won fair {lady}', 'You have to be brave to win what you want.', { Faint: ['Warm', 'Big', 'Kind', 'Cold', 'Happy'], heart: ['dog', 'hand', 'horse', 'voice', 'smile'], lady: ['castle', 'prize', 'cake', 'horse', 'garden'] }],
  ['ehope', 'hard', '{Hope} {springs} {eternal}', 'People never stop hoping for good things.', { Hope: ['Winter', 'Rain', 'Music', 'Water', 'Dinner'], springs: ['sings', 'sleeps', 'sits', 'walks', 'grows'], eternal: ['early', 'sideways', 'slowly', 'quietly', 'backwards'] }, { two: ['springs', 'eternal'] }],
  ['eillwind', 'hard', "It's an {ill} {wind} that blows nobody any {good}", 'Even bad events help someone.', { ill: ['cold', 'warm', 'big', 'wet', 'strong'], wind: ['rain', 'cloud', 'bird', 'dog', 'river'], good: ['money', 'cake', 'presents', 'rain', 'sunshine'] }],
  ['eoaks', 'hard', '{Little} {strokes} fell great {oaks}', 'Small efforts, kept up, can do big things.', { Little: ['Big', 'Lazy', 'Loud', 'Quick', 'Soft'], strokes: ['birds', 'winds', 'mice', 'dogs', 'songs'], oaks: ['castles', 'mountains', 'walls', 'houses', 'ships'] }, { two: ['strokes', 'oaks'] }],
  ['eplans', 'hard', 'The best-laid {plans} of {mice} and {men}', 'Even careful plans can go wrong.', { plans: ['cakes', 'maps', 'songs', 'games', 'toys'], mice: ['cats', 'dogs', 'birds', 'kings', 'ducks'], men: ['cats', 'dogs', 'kings', 'owls', 'sheep'] }, { also: { plans: ['schemes'] }, two: ['mice', 'men'] }],
  ['eshared', 'normal', 'A {problem} shared is a problem {halved}', 'Talking about a worry makes it feel smaller.', { problem: ['secret', 'cake', 'story', 'joke', 'toy'], halved: ['lost', 'painted', 'hidden', 'forgotten', 'broken'] }, { also: { problem: ['trouble'] } }]
]);

  /* african */
P('african', [
  ['afvillage', 'easy', 'It takes a {village} to raise a {child}', 'Everyone helps a child grow up well.', { village: ['family', 'teacher', 'city', 'school'], child: ['house', 'king', 'goat', 'tree'] }], // Igbo and Yoruba (Nigeria)
  ['afgofar', 'easy', 'If you want to go {fast}, go {alone}; if you want to go far, go together', 'Working with others gets you further.', { fast: ['high', 'home', 'back', 'deep'], alone: ['home', 'early', 'quietly', 'barefoot'] }], // popularly called an African proverb; exact origin unknown
  ['afelephants', 'easy', 'When two {elephants} fight, it is the {grass} that suffers', 'When big people quarrel, others get hurt too.', { elephants: ['lions', 'kings', 'giants', 'rhinos'], grass: ['trees', 'river', 'mouse', 'sky', 'ground'] }], // Swahili (East Africa)
  ['afhands', 'easy', 'One {hand} {washes} the other', 'When we help each other, everyone gains.', { hand: ['foot', 'eye', 'friend', 'cloth'], washes: ['holds', 'feeds', 'carries', 'pushes'] }], // Zulu and Xhosa (South Africa)
  ['afperson', 'easy', 'A {person} is a person through other {people}', 'We become who we are by living with others.', { person: ['child', 'king', 'friend', 'teacher'], people: ['books', 'stories', 'animals', 'gifts'] }], // Zulu (South Africa)
  ['afnight', 'easy', 'However long the {night}, the {dawn} will break', 'Hard times always come to an end.', { night: ['road', 'river', 'storm', 'winter'], dawn: ['wave', 'branch', 'bread', 'storm'] }],
  ['aflittle', 'easy', 'Little by little, a little becomes a {lot}', 'Small steps add up to big results.', { lot: ['bit', 'mountain', 'meal', 'tree'] }], // Swahili (Tanzania)
  ['afmusic', 'easy', 'When the {music} changes, so does the {dance}', 'When things change, we must change too.', { music: ['wind', 'weather', 'singer', 'season'], dance: ['song', 'dancer', 'singer', 'crowd'] }], // Hausa (West Africa)
  ['aflearns', 'normal', 'He who {learns}, {teaches}', 'What you learn, you can pass on to others.', { learns: ['listens', 'reads', 'waits', 'sings', 'plays'], teaches: ['wins', 'grows', 'leads', 'speaks', 'travels'] }], // Ethiopia
  ['afsky', 'easy', 'No one shows a {child} the {sky}', 'Some things everyone can see for themselves.', { child: ['bird', 'king', 'farmer', 'friend'], sky: ['sea', 'road', 'river', 'door', 'moon'] }], // Akan (Ghana)
  ['afwalkdance', 'easy', 'If you can {walk}, you can {dance}; if you can talk, you can {sing}', 'Everyone can join in the fun.', { walk: ['run', 'stand', 'swim', 'jump'], dance: ['fly', 'swim', 'climb', 'skip'], sing: ['shout', 'read', 'write', 'whistle'] }], // Shona (Zimbabwe)
  ['afsticks', 'easy', 'Sticks in a {bundle} are {unbreakable}', 'People who stick together are hard to beat.', { bundle: ['basket', 'pile', 'fire', 'row', 'box'], unbreakable: ['wet', 'blue', 'tiny', 'sleepy', 'green'] }], // Kenya
  ['afrain', 'easy', '{Rain} does not fall on one {roof} alone', 'Troubles come to everyone, not just you.', { Rain: ['Snow', 'Wind', 'Hail', 'Dust'], roof: ['head', 'field', 'tree', 'garden', 'hill'] }], // Cameroon
  ['afhurry', 'normal', 'Hurry, hurry has no {blessing}', 'Rushing often spoils things.', { blessing: ['ending', 'friend', 'reason', 'prize', 'brakes'] }], // Swahili (East Africa)

  ['afriver', 'normal', 'No one tests the {depth} of a {river} with both {feet}', 'Be careful when trying something new.', { depth: ['width', 'colour', 'speed', 'taste'], river: ['lake', 'pond', 'well', 'bath'], feet: ['hands', 'eyes', 'arms', 'sticks'] }], // Akan (Ghana)
  ['afcoffee', 'normal', '{Coffee} and {love} taste best when {hot}', 'Some things are best enjoyed fresh and warm.', { Coffee: ['Tea', 'Soup', 'Bread', 'Porridge', 'Milk'], love: ['bread', 'soup', 'tea', 'honey'], hot: ['cold', 'square', 'late', 'quiet', 'blue'] }], // Ethiopia
  ['aflion', 'normal', 'Until the {lion} learns to {write}, every story will glorify the {hunter}', 'Every story has another side worth hearing.', { lion: ['zebra', 'eagle', 'monkey', 'rabbit'], write: ['roar', 'count', 'sing', 'dance', 'draw'], hunter: ['king', 'farmer', 'chief', 'runner'] }], // West Africa
  ['afbaobab', 'normal', 'Wisdom is like a {baobab} tree; no one person can {embrace} it', 'No one person knows everything.', { baobab: ['mango', 'palm', 'banana', 'lemon', 'fig'], embrace: ['climb', 'carry', 'plant', 'reach', 'see'] }], // Ewe (Ghana and Togo)
  ['afgarden', 'normal', 'Knowledge is like a {garden}; if it is not {cultivated}, it cannot be {harvested}', 'Keep learning, or what you know will not grow.', { garden: ['river', 'house', 'fire', 'window', 'book'], cultivated: ['painted', 'watered', 'shared', 'opened', 'counted'], harvested: ['eaten', 'sold', 'seen', 'kept'] }], // Guinea
  ['afslipped', 'normal', 'Do not look where you {fell}, but where you {slipped}', 'Find the real cause of a mistake.', { fell: ['sat', 'stood', 'slept', 'stopped', 'ran'], slipped: ['started', 'walked', 'landed', 'rested', 'jumped'] }], // West Africa
  ['afbracelet', 'normal', 'A single {bracelet} does not {jingle}', 'We need others to make things happen.', { bracelet: ['drum', 'coin', 'key', 'spoon'], jingle: ['shine', 'sparkle', 'break', 'fit', 'fall'] }], // Congo
  ['afspider', 'normal', 'When {spider} webs unite, they can tie up a {lion}', 'Small things working together can do big things.', { spider: ['ant', 'bird', 'fish', 'bee'], lion: ['buffalo', 'giraffe', 'leopard', 'rhino', 'hippo'] }], // Ethiopia (Amharic)
  ['affool', 'normal', 'The {fool} speaks, the {wise} man listens', 'Listening is often wiser than talking.', { fool: ['child', 'king', 'teacher', 'bird', 'chief'], wise: ['old', 'young', 'rich', 'tall', 'quiet'] }], // Ethiopia
  ['afpatience', 'normal', '{Patience} is the mother of a {beautiful} child', 'Good things come to those who wait.', { Patience: ['Kindness', 'Wisdom', 'Laughter', 'Hope', 'Love'], beautiful: ['strong', 'happy', 'clever', 'noisy', 'hungry'] }], // Bantu (East and Southern Africa)
  ['afstream', 'normal', 'However far the {stream} flows, it never {forgets} its {source}', 'Never forget where you come from.', { stream: ['bird', 'wind', 'road', 'boat', 'cloud'], forgets: ['leaves', 'sees', 'finds', 'reaches'], source: ['sea', 'mouth', 'banks', 'end', 'fish'] }], // Yoruba (Nigeria)
  ['afforest', 'normal', 'Do not call the {forest} that {shelters} you a {jungle}', 'Be thankful to those who look after you.', { forest: ['house', 'tree', 'village', 'mountain', 'cave'], shelters: ['feeds', 'scares', 'hides', 'follows', 'surrounds'], jungle: ['desert', 'swamp', 'prison', 'stranger', 'mess'] }], // Akan (Ghana)
  ['affalsehood', 'normal', 'One {falsehood} spoils a thousand {truths}', 'One lie can make people doubt everything you say.', { falsehood: ['mistake', 'apple', 'word', 'drop', 'stone'], truths: ['friends', 'smiles', 'stories', 'meals', 'promises'] }, { also: { falsehood: ['lie'] } }], // Akan (Ghana)
  ['afsankofa', 'normal', 'It is not {wrong} to go {back} for that which you have {forgotten}', 'It is fine to go back and learn from the past.', { wrong: ['late', 'hard', 'easy', 'strange', 'rude'], back: ['home', 'out', 'away', 'far', 'up'], forgotten: ['found', 'bought', 'borrowed', 'finished', 'eaten'] }], // Akan (Ghana), Sankofa
  ['afwashhands', 'normal', 'If a {child} washes his {hands}, he could eat with {kings}', 'Good manners and hard work open doors.', { child: ['dog', 'farmer', 'stranger', 'singer'], hands: ['feet', 'face', 'clothes', 'plate', 'bowl'], kings: ['friends', 'dogs', 'spoons', 'birds', 'soldiers'] }, { also: { kings: ['elders'] } }], // Igbo (Nigeria)
  ['afmother', 'normal', 'He who is not {taught} by his mother will be taught by the {world}', 'Learn at home, or life will teach you the hard way.', { taught: ['fed', 'found', 'seen', 'loved', 'carried'], world: ['wind', 'river', 'teacher', 'king', 'book'] }], // Swahili (East Africa)
  ['afcrack', 'normal', 'If you do not fill a {crack}, you will {build} a {wall}', 'Fix small problems before they grow big.', { crack: ['cup', 'bucket', 'basket', 'pot', 'bag'], build: ['paint', 'break', 'climb', 'find', 'move'], wall: ['door', 'road', 'fire', 'boat', 'bridge'] }], // Swahili (East Africa)
  ['aftusks', 'normal', 'An {elephant} is never {burdened} by its own {tusks}', 'Looking after your own is never too heavy.', { elephant: ['ostrich', 'antelope', 'eagle', 'owl', 'ox'], burdened: ['frightened', 'tickled', 'surprised', 'hurt', 'slowed'], tusks: ['ears', 'feet', 'babies', 'friends', 'spots'] }], // Shona (Zimbabwe)
  ['afthumb', 'normal', 'One {thumb} cannot crush a {louse}', 'Some jobs need more than one helper.', { thumb: ['stick', 'leaf', 'feather', 'spoon', 'toe'], louse: ['nut', 'stone', 'grape', 'shell', 'seed'] }, { also: { thumb: ['finger'] } }], // Shona (Zimbabwe) and Swahili
  ['afway', 'normal', 'The {way} is asked of those who have gone {before}', 'Ask people with experience for advice.', { way: ['food', 'time', 'name', 'price', 'song'], before: ['home', 'away', 'fishing', 'early', 'out'] }], // Zulu and Xhosa (South Africa)
  ['afchief', 'normal', 'A {chief} is a chief through the {people}', 'Leaders need the people who follow them.', { chief: ['farmer', 'singer', 'teacher', 'hunter'], people: ['cattle', 'drums', 'crown', 'rain', 'gold'] }, { also: { chief: ['king'] } }], // Ndebele (Zimbabwe) and Zulu
  ['afbemba', 'normal', 'A {child} who does not {travel} thinks his mother is the only good {cook}', 'Seeing the world opens your mind.', { child: ['bird', 'king', 'farmer', 'goat'], travel: ['eat', 'listen', 'sleep', 'sing', 'read'], cook: ['singer', 'teacher', 'farmer', 'dancer', 'builder'] }], // Bemba (Zambia)
  ['afonehead', 'normal', 'One {head} cannot carry a {roof}', 'Big jobs need many people.', { head: ['hand', 'child', 'bird', 'ant', 'leg'], roof: ['mountain', 'river', 'boat', 'tree', 'house'] }], // Nyanja and Chewa (Zambia and Malawi)
  ['afchameleon', 'normal', 'Be like the {chameleon}: keep one eye on the {future} and one on the {past}', 'Learn from the past while planning ahead.', { chameleon: ['eagle', 'owl', 'lion', 'tortoise', 'frog'], future: ['sky', 'road', 'prize', 'sun', 'door'], past: ['ground', 'river', 'floor', 'window', 'moon'] }], // Malagasy (Madagascar)

  ['afmoon', 'hard', 'The {moon} moves {slowly}, but it crosses the {town}', 'Slow and steady still gets there.', { moon: ['sun', 'tortoise', 'river', 'snail', 'cloud'], slowly: ['backwards', 'loudly', 'sideways', 'upside-down'], town: ['river', 'sky', 'road', 'desert', 'field'] }], // Akan (Ghana)
  ['afleopard', 'hard', "Rain beats a {leopard}'s skin, but it does not wash out the {spots}", 'Who you truly are does not wash away.', { leopard: ['zebra', 'lion', 'giraffe', 'tiger', 'cheetah'], spots: ['stripes', 'colour', 'smell', 'dust', 'mud'] }, { two: ['leopard', 'spots'] }], // Akan (Ghana)
  ['afwords', 'hard', '{Words} are sweet, but they never take the place of {food}', 'Kind words are nice, but actions count most.', { Words: ['Songs', 'Dreams', 'Stories', 'Promises', 'Smiles'], food: ['rain', 'friends', 'money', 'work', 'sleep'] }], // Igbo (Nigeria)
  ['afanthill', 'hard', 'A {bird} that flies off the earth and lands on an {anthill} is still on the {ground}', 'A small step up does not change where you are.', { bird: ['frog', 'goat', 'child', 'lizard', 'chicken'], anthill: ['island', 'elephant', 'apple', 'umbrella', 'oak'], ground: ['moon', 'road', 'tree', 'water', 'sky'] }], // Igbo (Nigeria)
  ['afpalmoil', 'hard', 'Proverbs are the {palm} oil with which {words} are {eaten}', 'Proverbs make our talk richer and tastier.', { palm: ['olive', 'coconut', 'peanut', 'castor'], words: ['stories', 'yams', 'songs', 'meals', 'friends'], eaten: ['spoken', 'cooked', 'written', 'sung', 'shared'] }, { two: ['palm', 'eaten'] }], // Igbo (Nigeria)
  ['afcarried', 'hard', 'He who is being {carried} does not realise how {far} the {town} is', 'Those who are helped may not see how hard it is.', { carried: ['followed', 'fed', 'helped', 'taught', 'watched'], far: ['near', 'big', 'old', 'busy', 'quiet'], town: ['river', 'sea', 'market', 'farm', 'sun'] }, { two: ['carried', 'far'] }], // West Africa
  ['afsitold', 'hard', 'Where you will {sit} when you are old shows where you {stood} in youth', 'What you do when young shapes your later life.', { sit: ['sleep', 'eat', 'walk', 'live', 'dance'], stood: ['sat', 'slept', 'played', 'danced', 'worked'] }], // Yoruba (Nigeria)
  ['affamily', 'hard', 'A family is like a {forest}: when you are outside it is {dense}, when you are inside you see that each {tree} has its own place', 'Everyone in a family has their own special place.', { forest: ['river', 'mountain', 'garden', 'village', 'basket'], dense: ['quiet', 'small', 'empty', 'cold', 'noisy'], tree: ['bird', 'stone', 'leaf', 'flower', 'path'] }, { two: ['forest', 'tree'] }], // Akan (Ghana)
  ['afruin', 'hard', 'The {ruin} of a nation begins in the {homes} of its people', 'A strong country starts with strong families.', { ruin: ['story', 'name', 'wealth', 'music', 'pride'], homes: ['markets', 'schools', 'fields', 'songs', 'streets'] }], // Akan (Ghana)
  ['afpath', 'hard', 'When you follow in the {path} of your {father}, you learn to {walk} like him', 'Children learn by copying their parents.', { path: ['house', 'shadow', 'shoes', 'song', 'field'], father: ['brother', 'teacher', 'uncle', 'friend', 'chief'], walk: ['talk', 'sing', 'eat', 'dance', 'laugh'] }, { also: { path: ['footsteps'] }, two: ['path', 'walk'] }], // Akan (Ghana)
  ['afguest', 'hard', 'Treat your {guest} as a guest for two days; on the third day, give him a {hoe}', 'Visitors who stay long should help with the work.', { guest: ['friend', 'child', 'teacher', 'brother', 'neighbour'], hoe: ['bed', 'gift', 'meal', 'hug', 'song'] }], // Swahili (East Africa)
  ['afhair', 'hard', '{Wisdom} is like {hair}: everyone has their own', 'Everyone has their own way of thinking.', { Wisdom: ['Money', 'Laughter', 'Patience', 'Courage', 'Beauty'], hair: ['rain', 'bread', 'shoes', 'sunlight', 'water'] }], // Swahili (East Africa)
  ['afegg', 'hard', 'Little by little, an {egg} will {walk}', 'With time and patience, great changes happen.', { egg: ['ant', 'apple', 'owl', 'orange', 'acorn'], walk: ['fly', 'sing', 'hatch', 'grow', 'swim'] }, { two: ['egg', 'walk'] }], // Ethiopia (Amharic)
  ['afhorns', 'hard', 'What has {horns} cannot be {wrapped} up', 'Some things are too big to keep hidden.', { horns: ['wings', 'legs', 'fur', 'spots', 'teeth'], wrapped: ['picked', 'locked', 'tied', 'eaten', 'cleaned'] }], // Shona (Zimbabwe)
  ['afbaboon', 'hard', 'A big {baboon} folds its {tail}', 'Grown-ups should set a good, calm example.', { baboon: ['monkey', 'lion', 'dog', 'cat', 'bird'], tail: ['arms', 'ears', 'wings', 'legs', 'paws'] }], // Shona (Zimbabwe)
  ['afclever', 'hard', 'No {clever} person ever {licked} their own {back}', 'Even the smartest people need help sometimes.', { clever: ['tall', 'strong', 'happy', 'kind', 'young'], licked: ['washed', 'painted', 'tickled', 'brushed'], back: ['elbow', 'ears', 'nose', 'neck', 'feet'] }], // Zulu (South Africa)
  ['afbull', 'hard', 'The {bull} is among the {calves}', 'Tomorrow\'s leaders are among today\'s children.', { bull: ['king', 'farmer', 'lion', 'shepherd', 'horse'], calves: ['goats', 'stars', 'trees', 'sheep', 'stones'] }], // Zulu (South Africa)
  ['afthorn', 'hard', 'A {thorn} pricks while it is still {young}', 'Talent shows itself early.', { thorn: ['bee', 'needle', 'cactus', 'rose', 'pin'], young: ['old', 'dry', 'hidden', 'green', 'small'] }, { also: { young: ['growing'] } }], // Zulu (South Africa)
  ['aflocust', 'hard', 'Children of one {father} share the {head} of a {locust}', 'Families share whatever they have, however small.', { father: ['village', 'farmer', 'table', 'river'], head: ['leg', 'wing', 'tail', 'shell', 'seed'], locust: ['bean', 'grape', 'peanut', 'mouse', 'fish'] }, { two: ['head', 'locust'] }], // Sotho (Lesotho)
  ['afbag', 'hard', 'A {bag} of {locusts} is carried by working {together}', 'Heavy loads are easy when we share them.', { bag: ['box', 'pot', 'cart', 'crate', 'bowl'], locusts: ['stones', 'feathers', 'beans', 'apples', 'bricks'], together: ['quickly', 'alone', 'slowly', 'hard', 'early'] }], // Tswana (Botswana)
  ['aftrees', 'hard', 'The {growing} trees are the {forest}', 'Today\'s children are tomorrow\'s grown-ups.', { growing: ['tall', 'old', 'green', 'fallen', 'lonely'], forest: ['river', 'village', 'roof', 'garden', 'fire'] }] // Bemba (Zambia)
]);

  /* bible */
P('bible', [
  ['bilord', 'easy', 'The {Lord} is my {shepherd}; I shall not {want}', 'God looks after me like a shepherd cares for sheep.', { Lord: ['King', 'Father', 'Master', 'Prince'], shepherd: ['farmer', 'keeper', 'servant', 'teacher'], want: ['fall', 'sleep', 'wander', 'hunger'] }], // Psalm 23:1
  ['biwept', 'easy', 'Jesus {wept}', 'Jesus cried because he loved his friend Lazarus.', { wept: ['smiled', 'prayed', 'slept', 'sang', 'laughed'] }], // John 11:35
  ['bibegin', 'easy', 'In the {beginning} God {created} the heaven and the {earth}', 'God made everything at the very start.', { beginning: ['morning', 'darkness', 'garden', 'start'], created: ['built', 'painted', 'filled', 'lit'], earth: ['sea', 'stars', 'moon', 'sky'] }], // Genesis 1:1
  ['bijohn', 'easy', 'For God so {loved} the {world}, that he gave his only begotten {Son}', 'God loves everyone so much that he sent Jesus.', { loved: ['blessed', 'helped', 'watched', 'missed'], world: ['people', 'land', 'nations', 'children'], Son: ['Lamb', 'Word', 'Prince', 'Child', 'King'] }], // John 3:16
  ['biway', 'easy', 'I am the {way}, the {truth}, and the {life}', 'Jesus shows us how to get to God.', { way: ['door', 'king', 'road', 'gate'], truth: ['love', 'hope', 'word', 'peace'], life: ['joy', 'hope', 'peace', 'rock'] }], // John 14:6
  ['bilight', 'easy', 'And God said, Let there be {light}', 'God spoke and light came into the world.', { light: ['water', 'life', 'day', 'sun', 'peace'] }], // Genesis 1:3
  ['biobey', 'easy', 'Children, {obey} your {parents} in the Lord: for this is {right}', 'Children should listen to their mum and dad.', { obey: ['hug', 'follow', 'trust', 'serve', 'thank'], parents: ['teachers', 'elders', 'brothers', 'friends'], right: ['good', 'kind', 'fair', 'wise'] }], // Ephesians 6:1
  ['bineighbour', 'easy', 'Thou shalt {love} thy {neighbour} as thyself', 'Care for other people as much as you care for yourself.', { love: ['help', 'serve', 'greet', 'feed'], neighbour: ['brother', 'friend', 'father', 'servant'] }], // Matthew 22:39
  ['bistrength', 'easy', 'I can do all {things} through {Christ} which strengtheneth me', 'Jesus gives me the strength to do hard things.', { things: ['work', 'tasks', 'deeds', 'jobs'], Christ: ['prayer', 'faith', 'hope', 'friends'] }], // Philippians 4:13
  ['biworld', 'easy', 'Ye are the {light} of the {world}', 'We should shine and show kindness to everyone.', { light: ['joy', 'hope', 'heart', 'voice', 'song'], world: ['town', 'land', 'church', 'sky'] }], // Matthew 5:14
  ['bishepherd', 'easy', 'I am the good {shepherd}', 'Jesus takes care of us like a shepherd with his sheep.', { shepherd: ['farmer', 'teacher', 'keeper', 'servant', 'king'] }], // John 10:11
  ['bibread', 'easy', 'Give us this {day} our {daily} {bread}', 'We ask God for the food we need each day.', { day: ['morning', 'night', 'hour', 'week'], daily: ['holy', 'warm', 'fresh', 'sweet', 'good'], bread: ['water', 'fish', 'milk', 'cake', 'rest'] }], // Matthew 6:11
  ['bifather', 'easy', 'Our {Father} which art in {heaven}, Hallowed be thy {name}', 'The start of the prayer Jesus taught us.', { Father: ['King', 'Master', 'Shepherd', 'Saviour', 'Maker'], heaven: ['glory', 'light', 'power', 'splendour'], name: ['word', 'house', 'home', 'day', 'song'] }], // Matthew 6:9

  ['bihonour', 'easy', 'Honour thy {father} and thy {mother}', 'Show respect to your dad and your mum.', { father: ['brother', 'teacher', 'neighbour', 'king'], mother: ['sister', 'family', 'friend', 'elders'] }], // Exodus 20:12
  ['bimeek', 'normal', 'Blessed are the {meek}: for they shall {inherit} the {earth}', 'Gentle, humble people will receive a great gift.', { meek: ['kind', 'strong', 'brave', 'rich', 'wise'], inherit: ['rule', 'build', 'own', 'guard'], earth: ['world', 'land', 'sea', 'sky'] }], // Matthew 5:5
  ['bistill', 'normal', 'Be {still}, and know that I am {God}', 'Be calm and quiet, and remember God is in charge.', { still: ['calm', 'quiet', 'glad', 'brave', 'strong'], God: ['King', 'Father', 'Master', 'Shepherd'] }], // Psalm 46:10
  ['bilamp', 'normal', 'Thy {word} is a {lamp} unto my {feet}, and a light unto my path', 'The Bible helps us see which way to go.', { word: ['love', 'voice', 'hand', 'smile'], lamp: ['candle', 'torch', 'guide', 'map', 'shoe'], feet: ['eyes', 'hands', 'head', 'heart'] }], // Psalm 119:105
  ['bipeace', 'normal', 'Blessed are the {peacemakers}: for they shall be called the {children} of {God}', 'People who make peace are part of God\'s family.', { peacemakers: ['teachers', 'builders', 'helpers', 'singers', 'farmers'], children: ['servants', 'friends', 'people', 'workers'], God: ['Abraham', 'Israel', 'David', 'Moses'] }], // Matthew 5:9
  ['bitruth', 'normal', 'And ye shall {know} the truth, and the {truth} shall make you {free}', 'Knowing what is true helps us live freely.', { know: ['love', 'find', 'seek', 'hear'], truth: ['love', 'word', 'law', 'light'], free: ['glad', 'strong', 'wise', 'safe', 'whole'] }], // John 8:32
  ['bimoney', 'normal', 'The love of {money} is the {root} of all {evil}', 'Wanting money too much leads to lots of wrong things.', { money: ['power', 'fame', 'gold', 'food', 'self'], root: ['seed', 'start', 'heart', 'door', 'cause'], evil: ['trouble', 'sorrow', 'sadness', 'fighting', 'pain'] }], // 1 Timothy 6:10
  ['bigive', 'normal', 'It is more {blessed} to {give} than to {receive}', 'Giving to others brings more joy than getting things.', { blessed: ['joyful', 'helpful', 'holy', 'honest', 'happy'], give: ['share', 'help', 'pray', 'serve'], receive: ['take', 'keep', 'ask', 'get', 'win'] }], // Acts 20:35
  ['bimerry', 'normal', 'A {merry} heart doeth good like a {medicine}', 'Being cheerful is good for you, like medicine.', { merry: ['happy', 'kind', 'brave', 'pure', 'warm'], medicine: ['friend', 'song', 'gift', 'meal', 'blessing'] }], // Proverbs 17:22
  ['bishine', 'normal', 'Let your {light} so {shine} before men', 'Let your good deeds show so others see God.', { light: ['love', 'joy', 'faith', 'smile', 'kindness'], shine: ['glow', 'show', 'burn', 'grow'] }], // Matthew 5:16
  ['biword', 'normal', 'In the beginning was the {Word}, and the Word was with God', 'Jesus was with God from the very start.', { Word: ['Light', 'King', 'Lamb', 'Truth', 'Spirit'] }], // John 1:1
  ['bihouse', 'normal', 'As for me and my {house}, we will {serve} the Lord', 'My whole family will follow God.', { house: ['friends', 'children', 'people', 'town', 'tent'], serve: ['praise', 'follow', 'love', 'thank', 'seek'] }], // Joshua 24:15
  ['bicheerful', 'normal', 'God loveth a {cheerful} {giver}', 'God is happy when we give with a smile.', { cheerful: ['humble', 'honest', 'faithful', 'gentle', 'patient'], giver: ['heart', 'child', 'helper', 'worker', 'singer'] }], // 2 Corinthians 9:7
  ['biglory', 'normal', 'Glory to God in the {highest}, and on {earth} peace, good will toward men', 'The angels sang this when Jesus was born.', { highest: ['morning', 'temple', 'heavens', 'church', 'sky'], earth: ['land', 'sea', 'hills', 'roads'] }], // Luke 2:14
  ['biiron', 'normal', 'Iron {sharpeneth} iron', 'Good friends help each other become better.', { sharpeneth: ['strengtheneth', 'breaketh', 'bendeth', 'polisheth', 'toucheth'] }], // Proverbs 27:17
  ['bipure', 'normal', 'Blessed are the {pure} in {heart}: for they shall {see} God', 'People with clean, honest hearts will see God.', { pure: ['kind', 'brave', 'glad', 'strong', 'humble'], heart: ['mind', 'home', 'voice', 'words'], see: ['love', 'hear', 'find', 'meet', 'praise'] }], // Matthew 5:8
  ['biseason', 'normal', 'To every thing there is a {season}, and a {time} to every purpose under the heaven', 'There is a right time for everything that happens.', { season: ['reason', 'place', 'story', 'answer', 'plan'], time: ['day', 'place', 'hour', 'plan', 'path'] }], // Ecclesiastes 3:1
  ['bialone', 'normal', 'Man shall not live by {bread} {alone}', 'We need God\'s word as well as food.', { bread: ['food', 'money', 'water', 'gold', 'work'], alone: ['only', 'always', 'daily', 'forever'] }], // Matthew 4:4
  ['bilean', 'normal', 'Trust in the Lord with all thine {heart}; and lean not unto thine own {understanding}', 'Trust God fully, even when you do not understand.', { heart: ['hands', 'voice', 'days', 'plans'], understanding: ['strength', 'feelings', 'cleverness', 'judgement', 'knowledge'] }], // Proverbs 3:5
  ['biday', 'normal', 'This is the {day} which the Lord hath made; we will {rejoice} and be {glad} in it', 'Every day is a gift from God to enjoy.', { day: ['world', 'place', 'house', 'land', 'song'], rejoice: ['dance', 'sing', 'rest', 'play', 'pray'], glad: ['kind', 'still', 'safe', 'calm'] }], // Psalm 118:24

  ['bipride', 'hard', 'Pride goeth before {destruction}, and an haughty {spirit} before a {fall}', 'Being too proud often leads to trouble.', { destruction: ['sorrow', 'trouble', 'shame', 'sadness'], spirit: ['heart', 'look', 'mind', 'word'], fall: ['fight', 'loss', 'storm', 'end'] }, { two: ['destruction', 'fall'] }], // Proverbs 16:18
  ['bitrain', 'hard', 'Train up a {child} in the {way} he should go: and when he is old, he will not {depart} from it', 'What children learn when young stays with them.', { child: ['boy', 'pupil', 'servant', 'lamb', 'son'], way: ['path', 'road', 'house', 'church'], depart: ['turn', 'stray', 'run', 'fall'] }, { two: ['child', 'way'] }], // Proverbs 22:6
  ['bisoft', 'hard', 'A {soft} {answer} turneth away {wrath}', 'Gentle words can calm an angry person.', { soft: ['kind', 'wise', 'quick', 'sweet', 'quiet'], answer: ['word', 'song', 'look', 'gift'], wrath: ['friends', 'sorrow', 'trouble', 'fear', 'foes'] }, { two: ['soft', 'wrath'] }], // Proverbs 15:1
  ['bisoweth', 'hard', 'For whatsoever a man {soweth}, that shall he also {reap}', 'What you do to others comes back to you.', { soweth: ['planteth', 'giveth', 'saith', 'buildeth', 'taketh'], reap: ['keep', 'eat', 'find', 'grow', 'receive'] }, { two: ['soweth', 'reap'] }], // Galatians 6:7
  ['bicharity', 'hard', 'And now abideth {faith}, {hope}, charity, these three; but the {greatest} of these is charity', 'Faith and hope matter, but love matters most.', { faith: ['joy', 'peace', 'truth', 'grace'], hope: ['joy', 'peace', 'grace', 'truth'], greatest: ['best', 'first', 'sweetest', 'strongest', 'least'] }, { two: ['faith', 'hope'] }], // 1 Corinthians 13:13
  ['bikind', 'hard', 'Charity {suffereth} long, and is {kind}', 'Real love is patient and kind.', { suffereth: ['waiteth', 'standeth', 'liveth', 'singeth', 'worketh'], kind: ['wise', 'strong', 'brave', 'glad', 'true'] }], // 1 Corinthians 13:4
  ['bifaith', 'hard', 'Now {faith} is the {substance} of things hoped for, the {evidence} of things not seen', 'Faith means trusting God for things we cannot see yet.', { faith: ['love', 'grace', 'joy', 'peace'], substance: ['promise', 'message', 'picture', 'story', 'measure'], evidence: ['promise', 'shadow', 'picture', 'story', 'answer'] }, { two: ['faith', 'evidence'] }], // Hebrews 11:1
  ['biunity', 'hard', 'Behold, how good and how {pleasant} it is for {brethren} to dwell together in {unity}', 'It is lovely when families and friends get along.', { pleasant: ['happy', 'lovely', 'joyful', 'peaceful', 'kind'], brethren: ['children', 'neighbours', 'families', 'friends'], unity: ['peace', 'love', 'joy', 'gladness'] }], // Psalm 133:1
  ['bitreasure', 'hard', 'For where your {treasure} is, there will your {heart} be also', 'What we value most shows what we really love.', { treasure: ['family', 'house', 'friends', 'home', 'gold'], heart: ['mind', 'hope', 'eyes', 'feet', 'love'] }, { two: ['treasure', 'heart'] }], // Matthew 6:21
  ['bigospel', 'hard', 'Go ye into all the {world}, and {preach} the gospel to every {creature}', 'Jesus asked his friends to tell everyone the good news.', { world: ['land', 'towns', 'cities', 'villages'], preach: ['sing', 'read', 'bring', 'show', 'carry'], creature: ['child', 'family', 'village', 'city', 'house'] }], // Mark 16:15
  ['bieagles', 'hard', 'They shall mount up with {wings} as {eagles}; they shall {run}, and not be weary', 'God gives fresh strength to those who trust him.', { wings: ['feathers', 'songs', 'arms', 'hearts'], eagles: ['sparrows', 'ravens', 'angels', 'swallows', 'hawks'], run: ['sing', 'swim', 'climb', 'dance', 'work'] }, { two: ['wings', 'eagles'] }], // Isaiah 40:31
  ['birest', 'hard', 'Come unto me, all ye that {labour} and are heavy laden, and I will give you {rest}', 'Jesus helps tired people feel calm and rested.', { labour: ['wander', 'hunger', 'weep', 'wait', 'travel'], rest: ['bread', 'joy', 'hope', 'strength', 'comfort'] }, { two: ['labour', 'rest'] }], // Matthew 11:28
  ['bidoers', 'hard', 'But be ye {doers} of the {word}, and not {hearers} only', 'Do what the Bible says, do not just listen to it.', { doers: ['lovers', 'keepers', 'readers', 'singers', 'teachers'], word: ['truth', 'faith', 'light', 'gospel'], hearers: ['readers', 'talkers', 'thinkers', 'watchers', 'speakers'] }, { two: ['doers', 'hearers'] }], // James 1:22
  ['biant', 'hard', 'Go to the {ant}, thou {sluggard}; consider her ways, and be {wise}', 'Lazy people can learn hard work from the busy ant.', { ant: ['bee', 'bird', 'lion', 'mouse', 'sheep'], sluggard: ['farmer', 'servant', 'stranger', 'wanderer'], wise: ['strong', 'glad', 'still', 'busy', 'kind'] }], // Proverbs 6:6
  ['bigathered', 'hard', 'For where two or three are {gathered} together in my {name}, there am I in the {midst} of them', 'Jesus is with us when we meet together.', { gathered: ['sitting', 'playing', 'singing', 'standing', 'praying'], name: ['house', 'church', 'love', 'light'], midst: ['hearts', 'homes', 'prayers', 'songs'] }, { two: ['gathered', 'name'] }], // Matthew 18:20
  ['biovercome', 'hard', 'Be not overcome of evil, but overcome evil with {good}', 'Answer unkindness by being kind.', { good: ['love', 'peace', 'kindness', 'patience', 'joy'] }], // Romans 12:21
  ['bihid', 'hard', 'Thy {word} have I {hid} in mine heart, that I might not {sin} against thee', 'Learning the Bible by heart helps us do right.', { word: ['love', 'name', 'voice', 'peace'], hid: ['sung', 'laid', 'planted', 'written'], sin: ['fall', 'fear', 'stray', 'fail', 'stumble'] }], // Psalm 119:11
  ['bimercy', 'hard', 'To do {justly}, and to love {mercy}, and to walk {humbly} with thy God', 'Be fair, be kind and stay humble with God.', { justly: ['kindly', 'gladly', 'boldly', 'wisely'], mercy: ['peace', 'music', 'wisdom', 'learning', 'beauty'], humbly: ['proudly', 'quickly', 'slowly', 'happily', 'bravely'] }, { two: ['mercy', 'humbly'] }] // Micah 6:8
]);

  /* kids */
P('kids', [
  ['kbee', 'easy', 'As busy as a {bee}', 'Working hard all the time.', { bee: ['cat', 'fish', 'snail', 'cloud'] }],
  ['kice', 'easy', 'As cold as {ice}', 'Very, very cold.', { ice: ['toast', 'soup', 'fire', 'sunshine'] }, { also: { ice: ['snow'] } }],
  ['kfeather', 'easy', 'As light as a {feather}', 'Not heavy at all.', { feather: ['brick', 'rock', 'car', 'piano'] }],
  ['kmouse', 'easy', 'As quiet as a {mouse}', 'Making hardly any sound.', { mouse: ['drum', 'lion', 'trumpet', 'dog'] }],
  ['kbutton', 'easy', 'As cute as a {button}', 'Very sweet and lovely.', { button: ['brick', 'spoon', 'sock', 'bin'] }],
  ['kpancake', 'easy', 'As flat as a {pancake}', 'Totally flat, with no bumps.', { pancake: ['ball', 'hill', 'mountain', 'balloon'] }],
  ['kfox', 'easy', 'As sly as a {fox}', 'Clever at playing tricks.', { fox: ['cow', 'sheep', 'duck', 'hen'] }],
  ['kowl', 'easy', 'As wise as an {owl}', 'Very clever and knows a lot.', { owl: ['ant', 'egg', 'eel', 'apple'] }],
  ['kgold', 'easy', 'As good as {gold}', 'Behaving really well.', { gold: ['mud', 'sand', 'paper', 'soap'] }],
  ['kgrass', 'easy', 'As {green} as grass', 'Very green indeed.', { green: ['blue', 'red', 'pink', 'purple'] }],
  ['ksnow', 'easy', 'As white as {snow}', 'Very, very white.', { snow: ['coal', 'mud', 'night', 'grass'] }],
  ['kox', 'easy', 'As strong as an {ox}', 'Very strong.', { ox: ['ant', 'egg', 'eel', 'owl'] }],
  ['ksnail', 'easy', 'As slow as a {snail}', 'Moving very slowly.', { snail: ['rocket', 'cheetah', 'jet', 'rabbit'] }, { also: { snail: ['tortoise'] } }],
  ['kflash', 'easy', 'As quick as a {flash}', 'Very fast.', { flash: ['snail', 'slug', 'sloth', 'rock'] }, { also: { flash: ['wink'] } }],
  ['kpie', 'easy', 'As easy as {pie}', 'Very easy to do.', { pie: ['rocks', 'glue', 'mud', 'soup'] }],
  ['kwhistle', 'easy', 'As clean as a {whistle}', 'Spotlessly clean.', { whistle: ['puddle', 'pig', 'boot', 'bin'] }],
  ['ktomato', 'easy', 'As red as a {tomato}', 'Very red, like a face when you blush.', { tomato: ['lemon', 'banana', 'pea', 'cloud'] }, { also: { tomato: ['beetroot', 'cherry'] } }],
  ['kcucumber', 'easy', 'As cool as a {cucumber}', 'Calm and not worried at all.', { cucumber: ['kettle', 'toast', 'oven', 'fire'] }],
  ['ksnug', 'easy', 'As {snug} as a bug in a {rug}', 'Warm, cosy and comfy.', { snug: ['cold', 'wet', 'sad', 'grumpy'], rug: ['tree', 'pond', 'box', 'shoe'] }],
  ['kpeas', 'easy', 'Like two {peas} in a {pod}', 'Two people who are very alike.', { peas: ['cats', 'cars', 'shoes', 'socks'], pod: ['car', 'bag', 'box', 'tent'] }],
  ['kcaring', 'easy', 'Sharing is {caring}', 'Sharing shows you care about others.', { caring: ['boring', 'sleeping', 'shouting', 'hiding'] }],
  ['kfinders', 'easy', 'Finders {keepers}, losers {weepers}', 'If you find it, you get to keep it.', { keepers: ['sleepers', 'sweepers', 'jumpers', 'beepers'], weepers: ['seekers', 'singers', 'sleepers', 'bakers'] }],
  ['kpeasy', 'easy', 'Easy {peasy} lemon {squeezy}', 'Really, really easy.', { peasy: ['cheesy', 'breezy', 'sneezy', 'sleepy'], squeezy: ['sneezy', 'wheezy', 'breezy', 'cheesy'] }],
  ['ktight', 'easy', 'Night night, {sleep} {tight}', 'Have a lovely, cosy sleep.', { sleep: ['jump', 'swim', 'run', 'sing'], tight: ['loud', 'fast', 'wet', 'cold'] }],
  ['khome', 'easy', "There's no place like {home}", 'Home is the best place of all.', { home: ['school', 'shops', 'beach', 'park'] }],
  ['ksweet', 'easy', 'Home {sweet} home', 'It is lovely to be back home.', { sweet: ['sour', 'salty', 'grumpy', 'messy'] }],
  ['kmanners', 'easy', '{Manners} cost nothing', 'Being polite is free and kind.', { Manners: ['Sweets', 'Toys', 'Bikes', 'Shoes'] }],
  ['kteam', 'easy', '{Teamwork} makes the {dream} work', 'Working together gets great things done.', { Teamwork: ['Homework', 'Bathtime', 'Bedtime', 'Shouting'], dream: ['cake', 'car', 'clock', 'train'] }],
  ['kturn', 'easy', 'Wait your {turn}', 'Be patient until it is your go.', { turn: ['nap', 'coat', 'bath', 'dinner'] }],
  ['kmoon', 'easy', 'Over the {moon}', 'Very, very happy.', { moon: ['hill', 'bridge', 'fence', 'wall'] }],
  ['kspeak', 'easy', '{Think} before you {speak}', 'Choose your words kindly and carefully.', { Think: ['Jump', 'Dance', 'Sneeze', 'Shout'], speak: ['jump', 'sleep', 'eat', 'swim'] }],
  ['kchip', 'easy', 'A {chip} off the old {block}', 'A child who is just like their mum or dad.', { chip: ['leaf', 'sock', 'cake', 'sweet'], block: ['tree', 'shoe', 'hat', 'chair'] }],
  ['ktreated', 'easy', 'Treat others how you want to be {treated}', 'Be kind to others, like you want them to be.', { treated: ['tickled', 'chased', 'splashed', 'squashed'] }],
['klion', 'easy', 'As {brave} as a {lion}', 'Very brave and not afraid.', { brave: ['shy', 'sleepy', 'tiny', 'silly'], lion: ['mouse', 'kitten', 'snail', 'worm'] }],
  ['kbone', 'easy', 'As {dry} as a {bone}', 'Not wet at all.', { dry: ['wet', 'soggy', 'muddy', 'sticky'], bone: ['fish', 'pond', 'sponge', 'puddle'] }],
  ['klamb', 'easy', 'As {gentle} as a {lamb}', 'Very kind and soft.', { gentle: ['fierce', 'noisy', 'grumpy', 'cross'], lamb: ['tiger', 'shark', 'bull', 'wasp'] }],
  ['kpicture', 'easy', 'As {pretty} as a {picture}', 'Very lovely to look at.', { pretty: ['muddy', 'smelly', 'grumpy', 'soggy'], picture: ['puddle', 'bin', 'boot', 'sock'] }],
  ['kdaisy', 'easy', 'As {fresh} as a {daisy}', 'Full of energy and not tired.', { fresh: ['tired', 'sleepy', 'grumpy', 'muddy'], daisy: ['sock', 'slug', 'brick', 'kettle'] }],
  ['kpeacock', 'easy', 'As {proud} as a {peacock}', 'Very pleased with yourself.', { proud: ['shy', 'sad', 'quiet', 'tiny'], peacock: ['worm', 'snail', 'mouse', 'slug'] }],
  ['kbell', 'easy', 'As {clear} as a {bell}', 'Very easy to hear or understand.', { clear: ['muddy', 'fuzzy', 'quiet', 'soft'], bell: ['fog', 'mud', 'cloud', 'soup'] }],
  ['knails', 'easy', 'As {hard} as {nails}', 'Very tough and strong.', { hard: ['soft', 'squishy', 'fluffy', 'wobbly'], nails: ['jelly', 'pillows', 'feathers', 'custard'] }],
  ['khoney', 'easy', 'As {sweet} as {honey}', 'Very sweet and kind.', { sweet: ['sour', 'salty', 'bitter', 'spicy'], honey: ['lemons', 'vinegar', 'salt', 'pepper'] }, { also: { honey: ['sugar'] } }],
  ['kgiraffe', 'easy', 'As {tall} as a {giraffe}', 'Very, very tall.', { tall: ['short', 'tiny', 'small', 'flat'], giraffe: ['mouse', 'ant', 'snail', 'worm'] }],
  ['kelephant', 'easy', 'As {big} as an {elephant}', 'Really huge.', { big: ['tiny', 'small', 'short', 'thin'], elephant: ['ant', 'egg', 'eel', 'apple'] }],
  ['kplease', 'easy', 'Say {please} and thank you', 'Always use your good manners.', { please: ['goodbye', 'boo', 'cheese', 'hooray'] }],
  ['kkind', 'easy', "It's {cool} to be {kind}", 'Being kind to others is a great thing.', { cool: ['hard', 'sad', 'odd', 'boring'], kind: ['grumpy', 'sulky', 'noisy', 'bossy'] }],
  ['kbest', 'easy', 'Try your {best}', 'Do the very best you can.', { best: ['worst', 'socks', 'shoes', 'hat'] }],
  ['kmistakes', 'easy', 'Everyone makes {mistakes}', "It's fine to get things wrong sometimes.", { mistakes: ['cakes', 'pancakes', 'puddles', 'castles'] }],
  ['klisten', 'easy', 'Stop, {look} and {listen}', 'Be careful and check before crossing the road.', { look: ['jump', 'sing', 'dance', 'sneeze'], listen: ['run', 'hop', 'skip', 'shout'] }],
  ['kbed', 'easy', 'Early to {bed} and early to {rise}', 'Going to bed early helps you get up early.', { bed: ['school', 'shops', 'park', 'beach'], rise: ['sing', 'eat', 'shout', 'play'] }],
  ['kold', 'easy', "You're never too {old} to learn", 'You can keep learning all your life.', { old: ['tall', 'small', 'busy', 'short'] }],
  ['kfrog', 'easy', 'A {frog} in your {throat}', 'When your voice goes croaky.', { frog: ['cat', 'sheep', 'duck', 'horse'], throat: ['shoe', 'pocket', 'bath', 'hat'] }],
  ['kants', 'easy', 'Ants in your {pants}', 'When you just cannot sit still.', { pants: ['socks', 'hair', 'shoes', 'hat'] }]
]);


  FF.data.sayings = { packs: PACKS, rows: rows, gapsOf: gapsOf, plain: plain };
})();
