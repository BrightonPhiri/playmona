'use strict';
/* WordFlow crew seats (js/crew/brains/wordFlow.js), loaded the way the runner loads them: the
   word bank builds sentences the referee accepts, AI words are used only when valid, and a crew
   seat plays a whole match against the real referee through the inbox, like a phone. */
const { test, assert, assertEqual } = require('./harness');
const loader = require('../../api/crew/lib/loader.js');

const FF = loader.load();
const S = FF.CrewWordFlow.strategy;
const R = FF.WordFlowRules;
const isWord = (w) => FF.Words.isWord(w);
const isQuiet = (w) => FF.Words.isQuiet(w);

function seeded(n) {
  let a = n >>> 0;
  return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
}

test('wordflow crew: every word-bank word is one the referee takes', function () {
  Object.keys(FF.CrewWordFlow.BANK).forEach((kind) => {
    FF.CrewWordFlow.BANK[kind].forEach((w) => {
      const p = R.parseWord(w, { isWord, isQuiet, position: 1 });
      assert(p.ok, kind + ' ' + w + ' ' + p.error);
    });
  });
});

test('wordflow crew: on its own the bank writes whole sentences that end and pass the rules', function () {
  for (let seed = 1; seed <= 200; seed++) {
    const random = seeded(seed);
    const words = [];
    const target = S.targetLength(random);
    let ended = false;
    for (let i = 0; i < R.MAX_WORDS && !ended; i++) {
      const w = S.choose({ words, random, target, isWord, isQuiet });
      const p = R.parseWord(w, { isWord, isQuiet, position: words.length });
      assert(p.ok, 'seed ' + seed + ': "' + w + '" ' + p.error + ' after ' + R.sentenceText(words));
      words.push({ w: p.text, uid: 'c' });
      ended = p.ends;
    }
    assert(ended, 'seed ' + seed + ' never ended: ' + R.sentenceText(words));
    assert(words.length >= R.MIN_SENTENCE && words.length <= 14, 'length ' + words.length + ': ' + R.sentenceText(words));
    assert(R.fallbackJudge(words).ok, R.sentenceText(words));
  }
});

test('wordflow crew: it carries on after words a person wrote, and closes when asked', function () {
  const random = seeded(7);
  const human = [{ w: 'Yesterday', uid: 'h' }, { w: 'Grandma', uid: 'h' }];
  const w = S.choose({ words: human, random, target: 9, isWord, isQuiet });
  assert(R.parseWord(w, { isWord, isQuiet, position: 2 }).ok, w);
  const close = S.choose({ words: human.concat([{ w: 'baked', uid: 'h' }, { w: 'the', uid: 'h' }]), random, target: 3, isWord, isQuiet });
  assert(/\.$/.test(close), 'ends when the sentence is long enough: ' + close);
});

test('wordflow crew: an AI word is used only when the referee would take it', function () {
  const words = [{ w: 'The', uid: 'h' }];
  assertEqual(S.choose({ words, random: seeded(1), aiWord: 'dragon', isWord, isQuiet }), 'dragon');
  const bad = S.choose({ words, random: seeded(1), aiWord: 'two words', isWord, isQuiet });
  assert(bad !== 'two words' && R.parseWord(bad, { isWord, isQuiet, position: 1 }).ok);
  const wrong = S.choose({ words, random: seeded(1), aiWord: 'qzxvv', isWord, isQuiet });
  assert(wrong !== 'qzxvv');
});

const flush = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };

test('wordflow crew: two crew seats and the referee play a whole match through the inbox', async function () {
  const { loadFF } = require('./harness');
  const app = loadFF(['js/core.js', 'js/net/transport.js']);
  const store = {};
  const listeners = [];
  const bus = {
    read: (k) => (store[k] === undefined ? null : JSON.parse(JSON.stringify(store[k]))),
    write: (k, v) => { if (v === null) delete store[k]; else store[k] = JSON.parse(JSON.stringify(v)); listeners.slice().forEach((fn) => fn(k)); },
    subscribe: (fn) => { listeners.push(fn); return () => listeners.splice(listeners.indexOf(fn), 1); }
  };
  let now = 5000000;
  const jobs = [];
  const clock = {
    setTimeout: (fn, ms) => { const j = { at: now + ms, fn }; jobs.push(j); return j; },
    clearTimeout: (j) => { const i = jobs.indexOf(j); if (i !== -1) jobs.splice(i, 1); }
  };
  async function advance(ms) {
    const end = now + ms;
    for (;;) {
      await flush();
      jobs.sort((a, b) => a.at - b.at);
      const j = jobs[0];
      if (!j || j.at > end) break;
      now = Math.max(now, j.at);
      jobs.shift();
      j.fn();
    }
    now = end;
    await flush();
  }
  const room = app.Transport.dev({ bus, root: 'rooms/CREW1' });
  await room.connect();
  room.serverNow = () => now;
  await room.set('', { meta: { status: 'playing', gameId: 'wordFlow', hostUid: 'c1', startAt: now }, players: { c1: { name: 'Crew 1', online: true }, c2: { name: 'Crew 2', online: true } } });
  const run = { matchId: 'w_crew', roomCode: 'CREW1', seats: ['c1', 'c2'], crew: { c1: true, c2: true }, settings: { mode: 'sentences', gameSeconds: 120, turnSeconds: 10 }, startAt: now };
  const ref = FF.WordFlowReferee.create({ run, room, randomInt: (k) => k - 1, isWord, isQuiet, timers: clock, judge: () => Promise.resolve(null) });
  await ref.start();
  const seats = FF.CrewWordFlow.create({
    transport: room, uids: ['c1', 'c2'], crew: { c1: { persona: { patience: 50 } }, c2: {} },
    later: (fn, ms) => clock.setTimeout(fn, ms), random: seeded(3), isWord, isQuiet,
    suggest: () => Promise.resolve(null)
  });
  seats.start();
  await advance(130000);
  const wf = bus.read('rooms/CREW1').wf;
  assertEqual(wf.phase, 'ended');
  const sentences = R.score(wf.sentences, ['c1', 'c2']);
  assert((wf.sentences || []).length >= 3, 'crew finished several sentences: ' + (wf.sentences || []).length);
  assert(sentences.c1.points > 0 && sentences.c2.points > 0, 'both scored');
  assert(!Object.keys(wf.seats).some((u) => wf.seats[u].skips > 0), 'crew never ran out of time');
  seats.stop();
  ref.stop();
});
