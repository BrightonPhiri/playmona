'use strict';
/* Live match (js/net/liveMatch.js, formerly Quick Match): the phone asks the server with the
   signed-in player's token, sends "any" when no game is picked, and turns the server's
   message into the error it shows. The Online page offers it as a working card. */
const fs = require('fs');
const path = require('path');
const { loadFF, test, assert, assertEqual, ROOT } = require('./harness');

function app(reply) {
  const FF = loadFF(['js/core.js', 'js/net/liveMatch.js']);
  const sb = FF.__sandbox;
  const calls = [];
  sb.firebase = { auth: () => ({ currentUser: { getIdToken: () => Promise.resolve('tok123') } }) };
  sb.fetch = function (url, opts) {
    calls.push({ url, opts });
    const r = reply || { ok: true, status: 200, body: { ticket: 't_1', status: 'waiting', waitedMs: 0 } };
    return Promise.resolve({ ok: r.ok, status: r.status, json: () => Promise.resolve(r.body) });
  };
  return { FF, calls };
}

test('live match: asks for any game with the player\'s token', async function () {
  const { FF, calls } = app();
  const t = await FF.LiveMatch.find({ roomCode: 'ABC234', difficulty: 'hard' });
  assertEqual(t.ticket, 't_1');
  assertEqual(calls[0].url, '/api/match/queue');
  assertEqual(calls[0].opts.method, 'POST');
  assertEqual(calls[0].opts.headers.Authorization, 'Bearer tok123');
  assertEqual(calls[0].opts.body, JSON.stringify({ gameId: 'any', difficulty: 'hard', roomCode: 'ABC234' }));
});

test('live match: checks and cancels a ticket, and counts who is here', async function () {
  const { FF, calls } = app();
  await FF.LiveMatch.ticket('t_1');
  await FF.LiveMatch.cancel('t_1');
  await FF.LiveMatch.online();
  assertEqual(calls.map((c) => c.opts.method + ' ' + c.url).join(' | '), 'GET /api/match/ticket/t_1 | POST /api/match/ticket/t_1/cancel | GET /api/match/online');
});

test('live match: the server\'s message becomes the error shown', async function () {
  const { FF } = app({ ok: false, status: 403, body: { error: 'not-host', message: 'You can only match from a room you host.' } });
  let err = null;
  try { await FF.LiveMatch.find({ roomCode: 'ABC234' }); } catch (e) { err = e; }
  assert(err, 'rejected');
  assertEqual(err.message, 'You can only match from a room you host.');
  assertEqual(err.code, 'not-host');
});

test('live match: the Online page offers Live match, not a coming-soon Quick Match', function () {
  const src = fs.readFileSync(path.join(ROOT, 'js/net/roomUI.js'), 'utf8');
  assert(/title: t\('liveMatch', 'Live match'\)/.test(src));
  assert(!/quickMatch|Quick match/.test(src), 'no Quick Match left');
  const card = src.slice(src.indexOf("id: 'mode-match'"), src.indexOf("id: 'mode-leagues'"));
  assert(card.indexOf('soon: true') === -1, 'not marked coming soon');
  assert(/<script src="js\/net\/liveMatch\.js"><\/script>/.test(fs.readFileSync(path.join(ROOT, 'play.html'), 'utf8')));
});
