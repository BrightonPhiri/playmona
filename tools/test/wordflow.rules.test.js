'use strict';
/* WordFlow's pure rules (js/wordflow/rules.js): one word per turn, punctuation and capitals,
   the built-in judge, and scoring that only ever counts accepted sentences, once. */
const { loadFF, test, assert, assertEqual } = require('./harness');

const app = loadFF(['js/core.js', 'js/wordflow/rules.js']);
const R = app.WordFlowRules;
const WORDS = new Set(['the', 'cat', 'sat', 'mat', 'dragon', 'flew', 'over', 'castle', 'dog', 'ran', 'home', 'blue', 'happy', 'well', 'mother', 'law', 'dogs', 'cannot']);
const isWord = (w) => WORDS.has(w);
const isQuiet = (w) => w === 'rudeword';
const parse = (raw, position) => R.parseWord(raw, { isWord, isQuiet, position: position == null ? 1 : position });

test('wordflow rules: empty, several words and long input are refused', function () {
  assertEqual(parse('').error, 'empty');
  assertEqual(parse('   ').error, 'empty');
  assertEqual(parse('.').error, 'empty');
  assertEqual(parse('the cat').error, 'spaces');
  assertEqual(parse('a\tb').error, 'spaces');
  assertEqual(parse('x'.repeat(30)).error, 'long');
});

test('wordflow rules: a full stop ends a sentence, a comma does not, other marks are refused', function () {
  const d = parse('dragon.');
  assert(d.ok);
  assertEqual(d.text, 'dragon.');
  assertEqual(d.ends, true);
  const c = parse('dragon,');
  assertEqual(c.text, 'dragon,');
  assertEqual(c.ends, false);
  assertEqual(parse('dragon!').error, 'punct');
  assertEqual(parse('dragon?').error, 'punct');
  assertEqual(parse('dragon..').error, 'punct');
  assertEqual(parse('dra.gon').error, 'punct');
  assertEqual(parse('dragon;').error, 'punct');
  assertEqual(parse('dr@gon').error, 'letters');
  assertEqual(parse('cat3').error, 'letters');
});

test('wordflow rules: capitals are tidied, names are allowed, the first word gets a capital', function () {
  assertEqual(parse('DRAGON').text, 'dragon');
  assertEqual(parse('dRaGoN').text, 'dragon');
  assertEqual(parse('the', 0).text, 'The');
  assertEqual(parse('i').text, 'I');
  assertEqual(parse('Tendai').text, 'Tendai', 'a capitalised unknown word is a name');
  assertEqual(parse('Tendai', 0).text, 'Tendai');
  assertEqual(parse('tendai').error, 'unknown', 'lower case unknown words are typos');
  assertEqual(parse('42').text, '42', 'numbers are fine');
});

test('wordflow rules: short words, contractions and hyphens', function () {
  ['a', 'I', 'is', 'to', 'of', 'an'].forEach((w) => assert(parse(w).ok, w));
  assert(parse("don't").ok, "don't");
  assert(parse('don’t').ok, 'curly apostrophe');
  assert(parse("dog's").ok, "dog's");
  assert(parse("dogs'").ok, "dogs'");
  assert(parse("can't").ok, "can't");
  assert(parse('mother-in-law').ok, 'mother-in-law');
  assertEqual(parse('cat-').error, 'letters');
  assertEqual(parse("'cat").error, 'letters');
  assertEqual(parse("cat's's").error, 'unknown');
});

test('wordflow rules: rude words are refused', function () {
  assertEqual(parse('rudeword').error, 'rude');
  assertEqual(parse('RUDEWORD.').error, 'rude');
});

test('wordflow rules: the 30th word of a sentence must end it', function () {
  assertEqual(parse('cat', R.MAX_WORDS - 1).error, 'tooLong');
  assert(parse('cat.', R.MAX_WORDS - 1).ok);
  assert(parse('cat', R.MAX_WORDS - 2).ok);
});

test('wordflow rules: settings fall back to defaults', function () {
  assertEqual(JSON.stringify(R.sanitizeSettings({})), JSON.stringify({ mode: 'sentences', gameSeconds: 180, turnSeconds: 20 }));
  assertEqual(R.sanitizeSettings({ mode: 'story', gameSeconds: '300', turnSeconds: 10 }).gameSeconds, 300);
  assertEqual(R.sanitizeSettings({ mode: 'novel', gameSeconds: 999, turnSeconds: 1 }).mode, 'sentences');
  assertEqual(R.sanitizeSettings({ gameSeconds: 999 }).gameSeconds, 180);
});

const w = (list, uid) => list.map((x, i) => ({ w: x, uid: uid || ('p' + (i % 2 + 1)) }));

test('wordflow rules: the built-in judge catches only obvious junk', function () {
  assert(R.fallbackJudge(w(['The', 'cat', 'sat.'])).ok);
  assertEqual(R.fallbackJudge(w(['Cat', 'sat.'])).reason, 'short');
  assertEqual(R.fallbackJudge(w(['The', 'cat', 'cat', 'cat.'])).reason, 'repeat');
  assertEqual(R.fallbackJudge(w(['Dog', 'dog', 'cat', 'dog', 'dog', 'dog.'])).reason, 'repeat');
  assert(R.fallbackJudge(w(['The', 'dog', 'and', 'the', 'cat', 'ran.'])).ok, 'ordinary repeats are fine');
});

test('wordflow rules: only accepted sentences score, each once, to the writer', function () {
  const sentences = [
    { id: 's1', status: 'accepted', words: [{ w: 'The', uid: 'a' }, { w: 'cat', uid: 'b' }, { w: 'sat.', uid: 'a' }] },
    { id: 's2', status: 'rejected', words: [{ w: 'Blue', uid: 'a' }, { w: 'blue', uid: 'b' }, { w: 'blue.', uid: 'a' }] },
    { id: 's1', status: 'accepted', words: [{ w: 'The', uid: 'a' }] },
    { id: 's3', status: 'checking', words: [{ w: 'Dog', uid: 'b' }, { w: 'ran', uid: 'a' }, { w: 'home.', uid: 'b' }] },
    { id: 's4', status: 'accepted', words: [{ w: 'Sneaky', uid: 'stranger' }, { w: 'dog', uid: 'b' }, { w: 'ran.', uid: 'b' }] }
  ];
  const sc = R.score(sentences, ['a', 'b']);
  assertEqual(sc.a.points, 2);
  assertEqual(sc.b.points, 3);
  assertEqual(sc.a.words.join(' '), 'The sat.');
  assertEqual(sc.stranger, undefined, 'a word from outside the seats never scores');
  assertEqual(R.ranked(sc, ['a', 'b'])[0].uid, 'b');
  assertEqual(R.winners(sc, ['a', 'b']).join(','), 'b');
  assertEqual(R.winners({ a: { points: 2 }, b: { points: 2 } }, ['a', 'b']).join(','), 'a,b', 'ties share the win');
  assertEqual(R.winners({}, ['a', 'b']).length, 0, 'nobody wins on zero');
});
