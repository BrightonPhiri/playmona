'use strict';
/* The WordFlow referee (js/wordflow/referee.js) running whole matches over the app's own dev
   transport with a hand-moved clock: turn order, skips, out-of-turn, stale and replayed words,
   two words for one turn, sentences judged by the AI or the rules, time running out with a
   sentence half written or still being judged, both modes, a restart, and scoring. */
const crypto = require('crypto');
const { loadFF, test, assert, assertEqual } = require('./harness');

const FILES = ['js/core.js', 'js/net/transport.js', 'js/wordflow/rules.js', 'js/wordflow/referee.js'];
const WORDS = new Set(['the', 'cat', 'sat', 'mat', 'dragon', 'flew', 'over', 'castle', 'dog', 'ran', 'home', 'blue', 'happy', 'and', 'then', 'slept', 'big', 'red']);

function makeBus() {
  const store = {};
  const listeners = [];
  return {
    store,
    read: (k) => (store[k] === undefined ? null : JSON.parse(JSON.stringify(store[k]))),
    write: (k, v) => { if (v === null) delete store[k]; else store[k] = JSON.parse(JSON.stringify(v)); listeners.slice().forEach((fn) => fn(k)); },
    subscribe: (fn) => { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i !== -1) listeners.splice(i, 1); }; }
  };
}

function makeClock(start) {
  const c = { now: start, jobs: [], n: 0 };
  c.setTimeout = (fn, ms) => { const id = ++c.n; c.jobs.push({ id, at: c.now + ms, fn }); return id; };
  c.clearTimeout = (id) => { c.jobs = c.jobs.filter((j) => j.id !== id); };
  c.advance = async (ms) => {
    const end = c.now + ms;
    for (;;) {
      await flush();
      c.jobs.sort((a, b) => a.at - b.at);
      const j = c.jobs[0];
      if (!j || j.at > end) break;
      c.now = j.at;
      c.jobs.shift();
      j.fn();
    }
    c.now = end;
    await flush();
  };
  return c;
}
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };

/* A judge we control: answers right away with ok, or holds answers until released. */
function makeJudge(mode) {
  const j = { calls: [], held: [], mode: mode || 'ok' };
  j.fn = (req) => {
    j.calls.push(req);
    if (j.mode === 'ok') return Promise.resolve({ ok: true, reason: '' });
    if (j.mode === 'no') return Promise.resolve({ ok: false, reason: 'That does not make sense.' });
    if (j.mode === 'fail') return Promise.reject(new Error('down'));
    if (j.mode === 'null') return Promise.resolve(null);
    return new Promise((resolve) => j.held.push(resolve));
  };
  return j;
}

async function match(opts) {
  opts = opts || {};
  const app = loadFF(FILES);
  const bus = opts.bus || makeBus();
  const clock = opts.clock || makeClock(1000000);
  const code = 'ROOM01';
  const room = app.Transport.dev({ bus, root: 'rooms/' + code });
  await room.connect();
  room.serverNow = () => clock.now;
  const n = opts.players || 3;
  const seats = [];
  const players = {};
  for (let i = 0; i < n; i++) {
    const uid = 'p' + (i + 1);
    seats.push(uid);
    players[uid] = { name: 'Player ' + (i + 1), online: true, joinedAt: i };
  }
  if (!opts.bus) await room.set('', { meta: { seed: 's', status: 'playing', appVersion: '2.0.0', hostUid: 'p1', startAt: clock.now + 1000 }, players });
  const saved = opts.saved || { value: null };
  const reports = [];
  const judge = opts.judge || makeJudge('ok');
  const run = Object.assign({
    matchId: 'w_1', roomCode: code, seats, crew: {}, startAt: clock.now + 1000,
    settings: Object.assign({ mode: 'sentences', gameSeconds: 120, turnSeconds: 10 }, opts.settings || {})
  }, opts.run || {});
  const ref = app.WordFlowReferee.create({
    run, room,
    store: { load: () => Promise.resolve(saved.value), save: (s) => { saved.value = s; return Promise.resolve(); } },
    judge: judge.fn,
    randomInt: opts.randomInt || ((k) => k - 1),   // j = i every time: the seat order stays p1, p2, p3...
    isWord: (w) => WORDS.has(w), isQuiet: (w) => w === 'rudeword',
    judgeMs: opts.judgeMs, wrapMs: opts.wrapMs,
    timers: clock, report: (e, p) => { reports.push({ e, p }); return Promise.resolve(); }
  });
  await ref.start();
  await flush();
  let seq = 0;
  const tag = crypto.randomBytes(4).toString('hex');
  const m = {
    app, bus, clock, room, ref, seats, saved, reports, run, judge,
    wf: () => bus.read('rooms/' + code).wf || null,
    meta: () => bus.read('rooms/' + code).meta,
    async go() { await clock.advance(1000); },          // the countdown ends
    async send(uid, word, over) {
      const wf = m.wf();
      const id = 'c' + tag + (++seq);
      const cmd = Object.assign({ type: 'word', matchId: wf.matchId, turnId: wf.turnId, word, t: clock.now }, over || {});
      await room.set('wfInbox/' + uid + '/' + id, cmd);
      await flush();
      return id;
    },
    /* Whoever's turn it is plays each word in order. */
    async say(text) {
      for (const word of text.split(' ')) await m.send(m.wf().turnUid, word);
    },
    feedback: (uid) => (m.wf().feedback || {})[uid] || null,
    sentences: () => m.wf().sentences || []
  };
  return m;
}

test('wordflow referee: waits for the countdown, then turns go round in seat order', async function () {
  const m = await match();
  assertEqual(m.wf().phase, 'starting');
  await m.go();
  const wf = m.wf();
  assertEqual(wf.phase, 'playing');
  assertEqual(wf.turnUid, 'p1');
  assertEqual(wf.gameDeadline, m.run.startAt + 120000);
  await m.send('p1', 'the');
  assertEqual(m.wf().turnUid, 'p2');
  await m.send('p2', 'cat');
  assertEqual(m.wf().turnUid, 'p3');
  await m.send('p3', 'sat');
  assertEqual(m.wf().turnUid, 'p1', 'back to the first player');
  assertEqual(m.wf().current.map((x) => x.w).join(' '), 'The cat sat');
  assertEqual(m.wf().current.map((x) => x.uid).join(','), 'p1,p2,p3', 'every word keeps its author');
});

test('wordflow referee: the turn order is shuffled with the server random', async function () {
  const m = await match({ randomInt: () => 0 });
  assertEqual(m.ref.state().seats.length, 3);
  assertEqual(new Set(m.ref.state().seats).size, 3);
  assert(m.ref.state().seats.join(',') !== 'p1,p2,p3', 'not the join order');
});

test('wordflow referee: out-of-turn, stale, late and replayed words never land', async function () {
  const m = await match();
  await m.go();
  await m.send('p2', 'cat');
  assertEqual(m.feedback('p2').code, 'turn');
  assertEqual(m.wf().current.length, 0);
  await m.send('p1', 'the', { turnId: m.wf().turnId - 1 });
  assertEqual(m.feedback('p1').code, 'stale');
  await m.send('p1', 'the', { matchId: 'w_old' });
  assertEqual(m.wf().current.length, 0, 'an old match is ignored');
  await m.send('stranger', 'the');
  assertEqual(m.wf().current.length, 0, 'not a seat');
  // Replaying the same command id twice: once only.
  const wf = m.wf();
  const cmd = { type: 'word', matchId: wf.matchId, turnId: wf.turnId, word: 'the', t: m.clock.now };
  await m.room.set('wfInbox/p1/creplay1', cmd);
  await m.app.Transport && null;
  await flush();
  await m.room.set('wfInbox/p1/creplay1', cmd);
  await flush();
  assertEqual(m.wf().current.length, 1);
  assertEqual(m.wf().turnUid, 'p2');
  // Sent after the turn clock (server-stamped), even if handled before the timer fires.
  const late = m.wf();
  m.clock.now = late.turnDeadline + 10;     // the timer has not fired yet
  await m.send('p2', 'cat');
  assertEqual(m.feedback('p2').code, 'late');
  assertEqual(m.wf().current.length, 1);
});

test('wordflow referee: two words for one turn: only the first counts', async function () {
  const m = await match();
  await m.go();
  const wf = m.wf();
  const a = { type: 'word', matchId: wf.matchId, turnId: wf.turnId, word: 'the', t: m.clock.now };
  const b = { type: 'word', matchId: wf.matchId, turnId: wf.turnId, word: 'dog', t: m.clock.now + 1 };
  await m.room.update('wfInbox/p1', { ca1111: a, cb2222: b });
  await flush();
  assertEqual(m.wf().current.map((x) => x.w).join(' '), 'The');
  assertEqual(m.feedback('p1').code, 'turn', 'the second was out of turn by then');
  const left = m.bus.read('rooms/ROOM01').wfInbox || {};
  assertEqual(Object.keys(left.p1 || {}).length, 0, 'handled commands are cleared');
});

test('wordflow referee: a command that arrives one field at a time is used once it is whole', async function () {
  const m = await match();
  await m.go();
  const wf = m.wf();
  await m.room.set('wfInbox/p1/cpart1/type', 'word');
  await flush();
  await m.room.set('wfInbox/p1/cpart1/matchId', wf.matchId);
  await flush();
  assertEqual(m.wf().current.length, 0, 'not yet');
  await m.room.update('wfInbox/p1/cpart1', { turnId: wf.turnId, word: 'the', t: m.clock.now });
  await flush();
  assertEqual(m.wf().current.map((x) => x.w).join(' '), 'The');
  assertEqual(m.wf().turnUid, 'p2');
  const left = m.bus.read('rooms/ROOM01').wfInbox || {};
  assertEqual(Object.keys(left.p1 || {}).length, 0, 'cleared once handled');
});

test('wordflow referee: a bad word keeps the turn and says why', async function () {
  const m = await match();
  await m.go();
  const id = await m.send('p1', 'the cat');
  assertEqual(m.feedback('p1').code, 'spaces');
  assertEqual(m.feedback('p1').id, id);
  await m.send('p1', 'zzqx');
  assertEqual(m.feedback('p1').code, 'unknown');
  await m.send('p1', 'rudeword');
  assertEqual(m.feedback('p1').code, 'rude');
  assertEqual(m.wf().turnUid, 'p1');
  await m.send('p1', 'the');
  assertEqual(m.feedback('p1'), null, 'a good word clears it');
  assertEqual(m.wf().turnUid, 'p2');
});

test('wordflow referee: no word in time passes the turn on', async function () {
  const m = await match();
  await m.go();
  await m.clock.advance(10000);
  assertEqual(m.wf().turnUid, 'p2');
  assertEqual(m.wf().last.kind, 'skip');
  assertEqual(m.wf().seats.p1.skips, 1);
});

test('wordflow referee: players who left are skipped', async function () {
  const m = await match();
  await m.room.update('players/p2', { online: false });
  await flush();
  await m.go();
  await m.send('p1', 'the');
  assertEqual(m.wf().turnUid, 'p3');
  await m.room.update('players/p3', { away: true });
  await flush();
  await m.send('p3', 'cat');
  assertEqual(m.wf().turnUid, 'p1');
});

test('wordflow referee: a full stop closes the sentence; the AI accepts it; points go to the writers', async function () {
  const m = await match();
  await m.go();
  await m.say('the cat sat.');
  await flush();
  const s = m.sentences();
  assertEqual(s.length, 1);
  assertEqual(s[0].status, 'accepted');
  assertEqual(s[0].by, 'judge');
  assertEqual(m.judge.calls[0].sentence, 'The cat sat.');
  assertEqual(m.wf().current.length, 0, 'a new sentence starts');
  assertEqual(m.wf().seats.p1.points, 1);
  assertEqual(m.wf().seats.p3.points, 1);
  await m.say('the dog ran home.');
  await flush();
  assertEqual(m.wf().seats.p1.points, 3, 'p1 wrote The, The and home');
  assertEqual(m.wf().seats.p2.points, 2);
  assertEqual(m.wf().seats.p3.points, 2);
});

test('wordflow referee: a rejected sentence scores nothing and keeps the reason; play goes on', async function () {
  const m = await match({ judge: makeJudge('no') });
  await m.go();
  await m.say('blue happy home.');
  await flush();
  const s = m.sentences()[0];
  assertEqual(s.status, 'rejected');
  assertEqual(s.reason, 'That does not make sense.');
  assertEqual(m.wf().seats.p1.points + m.wf().seats.p2.points + m.wf().seats.p3.points, 0);
  assertEqual(m.wf().turnUid, 'p1', 'the next player starts a new sentence');
});

test('wordflow referee: obvious junk is rejected by the rules without asking the AI', async function () {
  const m = await match();
  await m.go();
  await m.say('cat cat cat.');
  await flush();
  assertEqual(m.sentences()[0].status, 'rejected');
  assertEqual(m.sentences()[0].reason, 'repeat');
  assertEqual(m.judge.calls.length, 0);
});

test('wordflow referee: when the AI fails, times out or has no answer, the rules decide', async function () {
  for (const mode of ['fail', 'null']) {
    const m = await match({ judge: makeJudge(mode) });
    await m.go();
    await m.say('the cat sat.');
    await flush();
    assertEqual(m.sentences()[0].status, 'accepted', mode);
    assertEqual(m.sentences()[0].by, 'rules', mode);
  }
  const m = await match({ judge: makeJudge('hold') });
  await m.go();
  await m.say('the cat sat.');
  assertEqual(m.sentences()[0].status, 'checking');
  assertEqual(m.wf().turnUid, 'p1', 'play does not wait for the judge');
  await m.clock.advance(m.app.WordFlowReferee.JUDGE_MS);
  assertEqual(m.sentences()[0].status, 'accepted');
  assertEqual(m.sentences()[0].by, 'rules');
  m.judge.held[0]({ ok: false, reason: 'late' });
  await flush();
  assertEqual(m.sentences()[0].status, 'accepted', 'a late answer changes nothing');
});

test('wordflow referee: story mode judges each sentence against the accepted story before it', async function () {
  const m = await match({ settings: { mode: 'story' } });
  await m.go();
  await m.say('the dragon flew.');
  await flush();
  await m.say('the cat sat.');
  await flush();
  assertEqual(m.judge.calls[0].mode, 'story');
  assertEqual(JSON.stringify(m.judge.calls[0].story), '[]');
  assertEqual(JSON.stringify(m.judge.calls[1].story), JSON.stringify(['The dragon flew.']));
  const s = await match({ judge: makeJudge('ok') });
  await s.go();
  await s.say('the dragon flew.');
  await flush();
  assertEqual(JSON.stringify(s.judge.calls[0].story), '[]', 'sentences mode sends no story');
});

test('wordflow referee: time up throws away the unfinished sentence and keeps the finished ones', async function () {
  const m = await match({ settings: { gameSeconds: 120, turnSeconds: 30 } });
  await m.go();
  await m.say('the cat sat.');
  await flush();
  await m.say('the dog');
  await m.clock.advance(m.wf().gameDeadline - m.clock.now);
  const wf = m.wf();
  assertEqual(wf.phase, 'ended');
  assertEqual(wf.unfinished.map((x) => x.w).join(' '), 'The dog');
  assertEqual(wf.result.totalWords, 3);
  assertEqual(wf.result.unfinished, 2);
  assertEqual(wf.seats.p1.points + wf.seats.p2.points + wf.seats.p3.points, 3, 'the unfinished words score nothing');
  assertEqual(m.meta().status, 'ended');
  assertEqual(m.meta().results.gameId, 'wordFlow');
  assertEqual(m.meta().results.ranked.length, 3);
  await m.send(wf.order[0], 'late');
  assertEqual(m.wf().current.length, 0, 'nothing lands after the end');
});

test('wordflow referee: time up while a sentence is being judged waits for it, then ends', async function () {
  const m = await match({ judge: makeJudge('hold'), judgeMs: 600000, settings: { gameSeconds: 120, turnSeconds: 30 } });
  await m.go();
  await m.say('the cat sat.');
  m.clock.now = m.wf().gameDeadline - 1;
  await m.clock.advance(1);
  assertEqual(m.wf().phase, 'judging');
  m.judge.held[0]({ ok: false, reason: 'nope' });
  await flush();
  assertEqual(m.wf().phase, 'ended');
  assertEqual(m.sentences()[0].status, 'rejected');
  assertEqual(m.wf().result.totalWords, 0);
});

test('wordflow referee: a judge that never answers after time up: the rules decide and the game ends', async function () {
  const m = await match({ judge: makeJudge('hold'), judgeMs: 600000, settings: { gameSeconds: 120, turnSeconds: 30 } });
  await m.go();
  await m.say('the cat sat.');
  await m.say('the dog ran.');
  m.clock.now = m.wf().gameDeadline - 1;
  await m.clock.advance(1);
  assertEqual(m.wf().phase, 'judging');
  await m.clock.advance(m.app.WordFlowReferee.WRAP_MS);
  assertEqual(m.wf().phase, 'ended');
  assert(m.sentences().every((s) => s.status === 'accepted'));
  assertEqual(m.wf().result.totalWords, 6);
});

test('wordflow referee: the result is reported once with each seat\'s points', async function () {
  const m = await match({ settings: { gameSeconds: 120, turnSeconds: 30 } });
  await m.go();
  await m.say('the cat sat.');
  await flush();
  await m.clock.advance(200000);
  await m.clock.advance(200000);
  assertEqual(m.reports.length, 1);
  const r = m.reports[0];
  assertEqual(r.e, 'wordflow');
  assertEqual(r.p.matchId, 'w_1');
  assertEqual(r.p.totalWords, 3);
  assertEqual(r.p.seats.filter((s) => s.won).length, 3, 'one point each: a three-way tie');
});

test('wordflow referee: restarts from saved state without losing words or scores', async function () {
  const bus = makeBus();
  const clock = makeClock(1000000);
  const saved = { value: null };
  const m = await match({ bus: null, clock, saved });
  await m.go();
  await m.say('the cat sat.');
  await flush();
  await m.say('the');
  m.ref.stop();
  const turn = m.wf().turnUid;
  const again = await match({ bus: m.bus, clock, saved });
  assertEqual(again.wf().phase, 'playing');
  assertEqual(again.wf().turnUid, turn);
  assertEqual(again.wf().current.map((x) => x.w).join(' '), 'The');
  assertEqual(again.sentences()[0].status, 'accepted');
  await again.say('dog ran.');
  await flush();
  assertEqual(again.sentences().length, 2);
  void bus;
});

test('wordflow referee: two phones see the same view', async function () {
  const m = await match();
  await m.go();
  const other = m.app.Transport.dev({ bus: m.bus, root: 'rooms/ROOM01' });
  await other.connect();
  let seen = null;
  other.watch('wf', (v) => { seen = v; });
  await m.say('the cat sat.');
  await flush();
  assertEqual(JSON.stringify(seen), JSON.stringify(m.wf()));
});
