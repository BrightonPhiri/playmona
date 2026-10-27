'use strict';
/* The Imposters referee (js/imposters/referee.js) running whole matches over the app's own dev
   transport with a hand-moved clock: dealing, secrecy, clues, votes, ties, eliminations, wins,
   replayed and stale commands, a restart from saved state, and Number Imposter timing. */
const crypto = require('crypto');
const { loadFF, test, assert, assertEqual } = require('./harness');

const FILES = ['js/core.js', 'js/net/transport.js', 'js/imposters/rules.js', 'js/imposters/modes/word.js',
  'js/imposters/modes/number.js', 'js/imposters/referee.js'];

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
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };

const PAIR = { id: 'water-car', a: 'Water', b: 'Car', hintsA: ['wet', 'drink'], hintsB: ['drive', 'road'], shared: ['wash'] };

async function match(opts) {
  opts = opts || {};
  const app = loadFF(FILES);
  const bus = opts.bus || makeBus();
  const clock = opts.clock || makeClock(1000000);
  const code = opts.code || 'ROOM01';
  const room = app.Transport.dev({ bus, root: 'rooms/' + code });
  const sec = app.Transport.dev({ bus, root: 'imposterSecrets/' + code });
  await room.connect(); await sec.connect();
  room.serverNow = () => clock.now;
  const n = opts.players || 5;
  const seats = [];
  const players = {};
  for (let i = 0; i < n; i++) {
    const uid = 'p' + (i + 1);
    seats.push(uid);
    players[uid] = { name: 'Player ' + (i + 1), online: true, joinedAt: i };
  }
  if (!opts.bus) await room.set('', { meta: { seed: 's', status: 'playing', appVersion: '2.0.0', hostUid: 'p1', startAt: clock.now }, players });
  const saved = opts.saved || { value: null };
  const reports = [];
  const run = Object.assign({
    matchId: 'm_1', roomCode: code, seats, crew: {}, startAt: clock.now,
    settings: { mode: 'word', imposters: opts.imposters || 1, rounds: opts.rounds || 4, clueSeconds: 30, discussSeconds: 60, difficulty: 'normal' },
    pair: PAIR
  }, opts.run || {});
  const ref = app.ImpostersReferee.create({
    run, room,
    secrets: { set: (u, v) => sec.set(u, v), update: (u, v) => sec.update(u, v), clear: () => sec.set('', null) },
    store: { load: () => Promise.resolve(saved.value), save: (s) => { saved.value = s; return Promise.resolve(); } },
    randomInt: opts.randomInt || ((k) => crypto.randomInt(k)),
    isQuiet: (w) => w === 'rude',
    timers: clock, report: (e, p) => { reports.push({ e, p }); return Promise.resolve(); }
  });
  await ref.start();
  await flush();
  let seq = 0;
  let round = 0;
  const tag = crypto.randomBytes(4).toString('hex');
  const m = {
    app, bus, clock, room, sec, ref, seats, saved, reports, run,
    imp: () => bus.read('rooms/' + code).imp || null,
    secret: (uid) => (bus.read('imposterSecrets/' + code) || {})[uid] || null,
    minority: () => ref.state().minority.slice(),
    majority: () => seats.filter((u) => ref.state().minority.indexOf(u) === -1),
    async send(uid, type, extra, over) {
      const imp = m.imp();
      const id = 'c' + tag + (++seq);
      const cmd = Object.assign({ type, matchId: imp.matchId, phaseId: imp.phaseId, t: clock.now }, extra || {}, over || {});
      await room.set('impInbox/' + uid + '/' + id, cmd);
      await flush();
      return id;
    },
    async everyone(type, extraFor) {
      for (const uid of seats) {
        if (!m.imp().seats[uid].alive) continue;
        await m.send(uid, type, extraFor ? extraFor(uid) : {});
      }
    },
    async readyAll() { await m.everyone('ready'); },
    async cluesAll() {
      let i = 0;
      const r = 'abcdefghijkl'[round++];
      await m.everyone('clue', () => ({ clue: 'clue' + r + 'abcdefghijkl'[i++] }));
    },
    // Everyone votes for target; the target votes for someone else.
    async voteFor(target, voters) {
      for (const uid of voters || seats) {
        if (!m.imp().seats[uid].alive) continue;
        const pick = uid === target ? seats.filter((u) => u !== target && m.imp().seats[u].alive)[0] : target;
        await m.send(uid, 'vote', { target: pick });
      }
    },
    async callVote() {
      for (const uid of seats) { if (m.imp().phase !== 'discuss') break; if (m.imp().seats[uid].alive) await m.send(uid, 'callVote'); }
    },
    feedback: (uid) => (m.secret(uid) || {}).feedback || null
  };
  return m;
}

/* Every word, target or side that must stay hidden, for scanning public data. */
function leaks(json, words) {
  return words.filter((w) => json.toLowerCase().indexOf(String(w).toLowerCase()) !== -1);
}

test('referee: each player gets exactly one secret word, the right number of them the other word', async function () {
  for (const [n, k] of [[3, 1], [5, 1], [6, 2], [12, 2]]) {
    const m = await match({ players: n, imposters: k });
    const words = m.seats.map((u) => m.secret(u) && m.secret(u).word);
    assert(words.every(Boolean), n + ' players: everyone has a word');
    const counts = {};
    words.forEach((w) => { counts[w] = (counts[w] || 0) + 1; });
    assertEqual(Object.keys(counts).length, 2);
    assertEqual(Math.min.apply(null, Object.values(counts)), k, n + ' players, ' + k + ' imposter(s)');
    m.ref.stop();
  }
});

test('referee: asking for two imposters with five players still deals one', async function () {
  const m = await match({ players: 5, imposters: 2 });
  assertEqual(m.minority().length, 1);
  assertEqual(m.imp().settings.imposters, 1);
  m.ref.stop();
});

test('referee: the public view never holds a word, a hint or a side before the end', async function () {
  const m = await match({ players: 6, imposters: 2 });
  const secretBits = ['Water', 'Car', 'drive', 'wash', 'minority', 'majority'];
  const check = (label) => {
    const pub = JSON.stringify(m.bus.read('rooms/ROOM01'));
    assertEqual(JSON.stringify(leaks(pub, secretBits)), '[]', label);
  };
  check('reveal');
  await m.readyAll(); check('clues');
  await m.cluesAll(); check('discuss');
  await m.callVote(); check('vote');
  await m.voteFor(m.majority()[0]); check('elimination');
  m.ref.stop();
});

test('referee: secrets are written only under each player\'s own key', async function () {
  const m = await match({ players: 4 });
  const tree = m.bus.read('imposterSecrets/ROOM01');
  assertEqual(Object.keys(tree).sort().join(','), m.seats.slice().sort().join(','));
  m.seats.forEach((u) => { assertEqual(Object.keys(tree[u]).sort().join(','), 'matchId,word'); });
  m.ref.stop();
});

test('referee: crew seats also get hints for their own word, and only their own', async function () {
  const m = await match({ players: 4, run: { crew: { p2: true } } });
  const s = m.secret('p2');
  const own = s.word === 'Water' ? PAIR.hintsA : PAIR.hintsB;
  assertEqual(JSON.stringify(s.hints), JSON.stringify(own));
  assertEqual(m.secret('p1').hints, undefined);
  m.ref.stop();
});

test('referee: one clue per player per round, and bad clues are refused privately', async function () {
  const m = await match({ players: 4 });
  await m.readyAll();
  assertEqual(m.imp().phase, 'clues');
  const p1Word = m.secret('p1').word;
  await m.send('p1', 'clue', { clue: 'two words' });
  assertEqual(m.feedback('p1').code, 'spaces');
  await m.send('p1', 'clue', { clue: p1Word.toLowerCase() + 's' });
  assertEqual(m.feedback('p1').code, 'secret');
  await m.send('p1', 'clue', { clue: '' });
  assertEqual(m.feedback('p1').code, 'empty');
  await m.send('p1', 'clue', { clue: 'rude' });
  assertEqual(m.feedback('p1').code, 'rude');
  assertEqual(m.imp().seats.p1.submitted, false);
  await m.send('p1', 'clue', { clue: 'shiny' });
  assertEqual(m.imp().seats.p1.submitted, true);
  await m.send('p1', 'clue', { clue: 'other' });
  assertEqual(m.feedback('p1').code, 'done');
  // Clues stay hidden until everyone has sent one, then appear together.
  assertEqual(JSON.stringify(m.imp().board || {}), '{}');
  for (const u of ['p2', 'p3', 'p4']) await m.send(u, 'clue', { clue: 'clue' + u.slice(1).replace(/\d/g, (d) => 'xyzw'[d]) });
  assertEqual(m.imp().phase, 'discuss');
  assertEqual(m.imp().board.r1.p1, 'Shiny');
  m.ref.stop();
});

test('referee: a missing clue shows as none when the clue time runs out', async function () {
  const m = await match({ players: 3 });
  await m.readyAll();
  await m.send('p1', 'clue', { clue: 'shiny' });
  await m.clock.advance(31000);
  assertEqual(m.imp().phase, 'discuss');
  assertEqual(m.imp().board.r1.p2, '');
  m.ref.stop();
});

test('referee: the same command twice, an old phase, or another match does nothing', async function () {
  const m = await match({ players: 4 });
  await m.readyAll();
  await m.cluesAll();
  const phaseId = m.imp().phaseId;
  // Replay p1's ready from the reveal phase.
  await m.send('p1', 'ready', {}, { phaseId: phaseId - 2 });
  assertEqual(m.feedback('p1').code, 'stale');
  await m.send('p1', 'callVote', {}, { matchId: 'm_other' });
  assertEqual(m.feedback('p1').code, 'stale');
  assertEqual(m.imp().seats.p1.wantsVote, false);
  // An exact duplicate (same id) arriving again is skipped.
  const id = await m.send('p1', 'callVote');
  await m.room.set('impInbox/p1/' + id, { type: 'callVote', matchId: 'm_1', phaseId, t: m.clock.now });
  await flush();
  assertEqual(m.imp().wantCount, 1);
  // Someone not in the match is ignored.
  await m.room.set('impInbox/zz/x1', { type: 'callVote', matchId: 'm_1', phaseId, t: m.clock.now });
  await flush();
  assertEqual(m.imp().wantCount, 1);
  m.ref.stop();
});

test('referee: VOTE NOW needs more than half of the players still in', async function () {
  const m = await match({ players: 5 });
  await m.readyAll(); await m.cluesAll();
  await m.send('p1', 'callVote');
  await m.send('p2', 'callVote');
  assertEqual(m.imp().phase, 'discuss');
  assertEqual(m.imp().wantCount, 2);
  await m.send('p3', 'callVote');
  assertEqual(m.imp().phase, 'vote');
  m.ref.stop();
});

test('referee: no self votes, no double votes, and ballots stay private until the end', async function () {
  const m = await match({ players: 4 });
  await m.readyAll(); await m.cluesAll(); await m.callVote();
  await m.send('p1', 'vote', { target: 'p1' });
  assertEqual(m.feedback('p1').code, 'self');
  await m.send('p1', 'vote', { target: 'nobody' });
  assertEqual(m.feedback('p1').code, 'target');
  await m.send('p1', 'vote', { target: 'p2' });
  await m.send('p1', 'vote', { target: 'p3' });
  assertEqual(m.feedback('p1').code, 'voted');
  const pub = JSON.stringify(m.imp());
  assertEqual(m.imp().seats.p1.voted, true);
  assert(pub.indexOf('"p1":"p2"') === -1, 'who p1 voted for is not public');
  m.ref.stop();
});

test('referee: a tie goes to one revote among the tied, then nobody leaves', async function () {
  const m = await match({ players: 4, rounds: 6 });
  await m.readyAll(); await m.cluesAll(); await m.callVote();
  await m.send('p1', 'vote', { target: 'p2' });
  await m.send('p2', 'vote', { target: 'p1' });
  await m.send('p3', 'vote', { target: 'p1' });
  await m.send('p4', 'vote', { target: 'p2' });
  let imp = m.imp();
  assertEqual(imp.phase, 'vote');
  assertEqual(imp.revote, true);
  assertEqual(imp.candidates.slice().sort().join(','), 'p1,p2');
  await m.send('p3', 'vote', { target: 'p4' });
  assertEqual(m.feedback('p3').code, 'target', 'only the tied stand in a revote');
  await m.send('p1', 'vote', { target: 'p2' });
  await m.send('p2', 'vote', { target: 'p1' });
  await m.send('p3', 'vote', { target: 'p1' });
  await m.send('p4', 'vote', { target: 'p2' });
  imp = m.imp();
  assertEqual(imp.phase, 'elimination');
  assertEqual(imp.votes.v2.out, '');
  assertEqual((imp.eliminated || []).length, 0);
  m.ref.stop();
});

test('referee: the eliminated cannot vote, clue or call a vote, and their word stays secret', async function () {
  const m = await match({ players: 5, rounds: 6 });
  const victim = m.majority()[0];
  await m.readyAll(); await m.cluesAll(); await m.callVote();
  await m.voteFor(victim);
  assertEqual(m.imp().phase, 'elimination');
  assertEqual(m.imp().seats[victim].alive, false);
  const word = m.secret(victim).word;
  assert(JSON.stringify(m.imp()).indexOf(word) === -1, 'the word is not shown');
  await m.clock.advance(6000);
  assertEqual(m.imp().phase, 'clues');
  await m.send(victim, 'clue', { clue: 'sneaky' });
  assertEqual(m.feedback(victim).code, 'out');
  assertEqual(m.imp().seats[victim].submitted, false);
  m.ref.stop();
});

test('referee: catching the only imposter wins for the majority', async function () {
  const m = await match({ players: 5 });
  await m.readyAll(); await m.cluesAll(); await m.callVote();
  await m.voteFor(m.minority()[0]);
  await m.clock.advance(6000);
  const imp = m.imp();
  assertEqual(imp.phase, 'ended');
  assertEqual(imp.result.winner, 'majority');
  assertEqual(Object.keys(imp.result.assignments).length, 5);
  assertEqual(imp.result.words.minority, m.secret(m.minority()[0]).word);
  const meta = m.bus.read('rooms/ROOM01').meta;
  assertEqual(meta.status, 'ended');
  assertEqual(meta.results.startAt, m.run.startAt);
  assertEqual(meta.results.ranked.length, 5);
  assertEqual(m.reports.length, 1);
  assertEqual(m.reports[0].p.winner, 'majority');
  m.ref.stop();
});

test('referee: with two imposters, one caught is not enough', async function () {
  const m = await match({ players: 6, imposters: 2, rounds: 6 });
  const [i1, i2] = m.minority();
  await m.readyAll(); await m.cluesAll(); await m.callVote();
  await m.voteFor(i1);
  await m.clock.advance(6000);
  assertEqual(m.imp().phase, 'clues');
  await m.cluesAll(); await m.callVote();
  await m.voteFor(i2);
  await m.clock.advance(6000);
  assertEqual(m.imp().result.winner, 'majority');
  m.ref.stop();
});

test('referee: the minority wins when it equals the majority still in', async function () {
  const m = await match({ players: 3, rounds: 6 });
  await m.readyAll(); await m.cluesAll(); await m.callVote();
  await m.voteFor(m.majority()[0]);
  await m.clock.advance(6000);
  assertEqual(m.imp().result.winner, 'minority');
  m.ref.stop();
});

test('referee: the last round ends in a final vote, and surviving it wins for the minority', async function () {
  const m = await match({ players: 5, rounds: 3 });
  await m.readyAll();
  for (let r = 1; r <= 3; r++) {
    assertEqual(m.imp().phase, 'clues', 'round ' + r);
    await m.cluesAll();
    await m.clock.advance(61000);      // nobody calls a vote: the discussion runs out
  }
  assertEqual(m.imp().phase, 'vote');
  assertEqual(m.imp().final, true);
  await m.voteFor(m.majority()[0]);
  await m.clock.advance(6000);
  assertEqual(m.imp().phase, 'ended');
  assertEqual(m.imp().result.winner, 'minority');
  m.ref.stop();
});

test('referee: two closing events at once still eliminate one player once', async function () {
  const m = await match({ players: 4, rounds: 6 });
  const target = m.majority()[0];
  await m.readyAll(); await m.cluesAll(); await m.callVote();
  const voters = m.seats.filter((u) => u !== target);
  const imp = m.imp();
  // The last ballot lands at the same instant as the vote clock running out.
  for (const u of voters.slice(0, -1)) await m.send(u, 'vote', { target });
  m.clock.now = imp.deadline;
  await Promise.all([
    m.room.set('impInbox/' + voters[voters.length - 1] + '/last', { type: 'vote', target, matchId: 'm_1', phaseId: imp.phaseId, t: m.clock.now }),
    m.clock.advance(0)
  ]);
  await flush();
  assertEqual(m.ref.state().eliminated.length, 1);
  assertEqual(Object.keys(m.ref.state().votes).length, 1);
  m.ref.stop();
});

test('referee: a restarted referee picks up the same match where it was', async function () {
  const m = await match({ players: 4, rounds: 6 });
  await m.readyAll();
  await m.send('p1', 'clue', { clue: 'shiny' });
  await m.ref.flush();
  m.ref.stop();
  const before = m.ref.state();
  const again = await match({ bus: m.bus, clock: m.clock, saved: m.saved, players: 4, rounds: 6 });
  assertEqual(again.ref.state().phase, 'clues');
  assertEqual(again.ref.state().phaseId, before.phaseId);
  assertEqual(JSON.stringify(again.ref.state().minority), JSON.stringify(before.minority));
  assertEqual(again.secret('p1').word, m.secret('p1').word, 'nobody is dealt a new word');
  for (const u of ['p2', 'p3', 'p4']) await again.send(u, 'clue', { clue: 'clue' + 'xyz'[Number(u.slice(1)) - 2] });
  assertEqual(again.imp().phase, 'discuss');
  again.ref.stop();
});

test('referee: a reconnecting player rebuilds the match from the public view and their own secret', async function () {
  const m = await match({ players: 5 });
  await m.readyAll(); await m.cluesAll();
  // What a fresh phone can read: the room (public) and its own secret path only.
  const roomTree = m.bus.read('rooms/ROOM01');
  const mine = m.secret('p3');
  assertEqual(roomTree.imp.phase, 'discuss');
  assertEqual(Object.keys(roomTree.imp.board.r1).length, 5);
  assertEqual(mine.matchId, roomTree.imp.matchId);
  assert(typeof mine.word === 'string' && mine.word.length > 0);
  m.ref.stop();
});

test('referee: Number Imposter records clamped times and keeps the targets secret', async function () {
  const m = await match({ players: 4, run: { settings: { mode: 'number', imposters: 1, rounds: 3, difficulty: 'hard', clueSeconds: 30, discussSeconds: 60 } } });
  const targets = m.seats.map((u) => m.secret(u).target);
  assert(targets.every((t) => typeof t === 'number' && t % 500 === 0));
  assertEqual(new Set(targets).size, 2);
  await m.readyAll();
  const imp = m.imp();
  assertEqual(imp.phase, 'challenge');
  // Too early: before the shared clock starts.
  await m.send('p1', 'stop', { ms: 10 });
  assertEqual(m.feedback('p1').code, 'early');
  await m.clock.advance(imp.goAt - m.clock.now + 5000);
  await m.send('p1', 'stop', { ms: 4900 });          // honest: a little under what the server saw
  await m.send('p2', 'stop', { ms: 9999 });          // claims later than it arrived
  await m.send('p3', 'stop', { ms: 100 });           // claims far earlier
  await m.send('p3', 'stop', { ms: 5000 });
  assertEqual(m.feedback('p3').code, 'done');
  await m.clock.advance(20000);                      // p4 never stops
  const board = m.imp().board.r1;
  assertEqual(board.p1, 4900);
  assertEqual(board.p2, 5000);
  assertEqual(board.p3, 4000);
  assertEqual(board.p4, -1);
  const pub = JSON.stringify(m.bus.read('rooms/ROOM01'));
  assert(pub.indexOf('target') === -1, 'no target in public data');
  m.ref.stop();
});

test('referee: Number Imposter deals new targets each round to the same groups', async function () {
  const m = await match({ players: 5, run: { settings: { mode: 'number', imposters: 1, rounds: 4, difficulty: 'easy', clueSeconds: 30, discussSeconds: 60 } } });
  const imposter = m.minority()[0];
  const groups = () => m.seats.filter((u) => m.secret(u).target === m.secret(imposter).target).join(',');
  assertEqual(groups(), imposter);
  await m.readyAll();
  await m.clock.advance(30000);                       // challenge times out
  await m.clock.advance(61000);                       // discussion runs out
  assertEqual(m.imp().phase, 'reveal');
  assertEqual(m.secret(imposter).round, 2);
  assertEqual(groups(), imposter);
  m.ref.stop();
});
