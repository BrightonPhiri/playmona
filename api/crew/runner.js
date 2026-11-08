#!/usr/bin/env node
'use strict';
/*
 * PlayMona crew runner: one process plays every crew seat in every room.
 * Started by the API (Runner::ensure) when Quick Match seats crew; exits by itself after a few
 * minutes with nothing to play. Never needs a crontab entry.
 *
 *   node api/crew/runner.js <runner.json>
 *
 * runner.json (written by the API, mode 0600): apiBase, secret, databaseUrl, serviceAccount, idleMinutes.
 * It follows /crewRuns (written only by the server), plays each match with js/crew/controller.js,
 * checks in with the API every few seconds and reports each finished game.
 * After a deploy changes its code it starts a fresh copy of itself and exits (lib/stamp.js).
 * Referees save their state, so the new copy carries on with every game.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');
const { spawn } = require('child_process');
const loader = require('./lib/loader.js');
const codeStamp = require('./lib/stamp.js');
const { Rtdb, tokenSource, roomTransport, request } = require('./lib/rtdb.js');

const HEARTBEAT_MS = 8000;
const CODE_CHECK_MS = 30000;   // how often to look for a deploy

function log(msg) { process.stdout.write(new Date().toISOString() + ' ' + msg + '\n'); }

/** Only one runner at a time: a lock file holding our pid (a dead pid's lock is taken over). */
function takeLock(file) {
  for (let i = 0; i < 2; i++) {
    try {
      const fd = fs.openSync(file, 'wx', 0o600);
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      return true;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const pid = parseInt(fs.readFileSync(file, 'utf8'), 10);
      try { if (pid) { process.kill(pid, 0); return false; } } catch (gone) { /* stale */ }
      fs.unlinkSync(file);
    }
  }
  return false;
}

async function main() {
  const cfgFile = process.argv[2];
  if (!cfgFile) { log('usage: node runner.js <runner.json>'); process.exit(2); }
  const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
  const lock = path.join(path.dirname(cfgFile), 'runner.lock');
  if (!takeLock(lock)) { log('another runner is already playing'); return; }
  const cleanup = () => { try { if (fs.readFileSync(lock, 'utf8') === String(process.pid)) fs.unlinkSync(lock); } catch (e) { /* gone */ } };
  process.on('exit', cleanup);
  ['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, () => process.exit(0)));

  const code = codeStamp.watcher(codeStamp.stamp());
  const FF = loader.load();
  const account = JSON.parse(fs.readFileSync(cfg.serviceAccount, 'utf8'));
  const rtdb = new Rtdb(cfg.databaseUrl, tokenSource(account));
  let offset = 0;
  try { offset = await rtdb.clockOffset(); } catch (e) { log('clock check failed, using local time: ' + e.message); }
  const serverNow = () => Date.now() + offset;
  log('runner ' + process.pid + ' up (clock offset ' + offset + ' ms)');

  async function api(action, body) {
    const url = new URL(cfg.apiBase + '/internal/crew/' + action);
    const res = await request('POST', url.toString(), { 'Content-Type': 'application/json', 'X-Crew-Secret': cfg.secret }, JSON.stringify(body || {}));
    if (res.status !== 200) throw new Error(action + ' answered ' + res.status);
    return res.json || {};
  }

  const playing = new Map();   // matchId -> { ctl, transport }
  const referees = new Map();  // Imposters matchId -> { ref, transport }
  const wordflows = new Map(); // WordFlow matchId -> { ref, transport }
  const ballswaps = new Map(); // Ball Swap matchId -> { ref, transport }
  const sortrushes = new Map(); // SortRush matchId -> { ref, transport }
  const geospins = new Map();   // GeoSpin matchId -> { ref, transport }
  const whatsmissings = new Map(); // What's Missing? matchId -> { ref, transport }
  let lastActive = Date.now();
  const isQuiet = (w) => FF.Words.isQuiet(w);
  const isWord = (w) => FF.Words.isWord(w);

  function startMatch(matchId, run) {
    if (!run || !run.roomCode || !run.crew) return;
    const transport = roomTransport(rtdb, run.roomCode, serverNow, (m) => log(matchId + ': ' + m));
    const ctl = FF.CrewController.create({
      transport, run, matchId,
      report: (event, payload) => api('report', Object.assign({ matchId, event }, payload)),
      log: (m) => log(matchId + ': ' + m),
      // Imposters: each crew seat reads its own secret, never anyone else's.
      secretOf: (uid) => (run.crew[uid] ? rtdb.get('imposterSecrets/' + run.roomCode + '/' + uid) : Promise.resolve(null)),
      isQuiet, isWord,
      // WordFlow: a crew seat's next word from the AI (null: it uses its word bank).
      suggestWord: (req) => api('wordflow/word', req).then((r) => (r.suggestion && r.suggestion.word) || null, () => null),
      onStop: () => { transport.close(); playing.delete(matchId); lastActive = Date.now(); }
    });
    playing.set(matchId, { ctl, transport });
    log('playing ' + matchId + ' in ' + run.roomCode + ' (' + Object.keys(run.crew).length + ' seat(s))');
    ctl.start();
  }

  function reconcile(runs) {
    runs = runs || {};
    Object.keys(runs).forEach((id) => { if (!playing.has(id)) startMatch(id, runs[id]); });
    Array.from(playing.keys()).forEach((id) => { if (!runs[id]) playing.get(id).ctl.stop(); });
    if (playing.size) lastActive = Date.now();
  }

  const runs = rtdb.stream('crewRuns', reconcile, log);

  /* Imposters: the runner is the referee for every match the API started (imposterRuns). */
  function startReferee(matchId, run) {
    if (!run || !run.roomCode || !Array.isArray(run.seats)) return;
    const code = run.roomCode;
    const transport = roomTransport(rtdb, code, serverNow, (m) => log(matchId + ': ' + m));
    const stopReferee = () => {
      const r = referees.get(matchId);
      if (!r) return;
      r.ref.stop();
      transport.close();
      referees.delete(matchId);
      lastActive = Date.now();
    };
    const ref = FF.ImpostersReferee.create({
      run, room: transport,
      secrets: {
        set: (uid, v) => rtdb.set('imposterSecrets/' + code + '/' + uid, v),
        update: (uid, v) => rtdb.update('imposterSecrets/' + code + '/' + uid, v),
        clear: () => rtdb.set('imposterSecrets/' + code, null)
      },
      store: {
        load: () => rtdb.get('imposterState/' + matchId),
        save: (s) => rtdb.set('imposterState/' + matchId, s)
      },
      randomInt: (n) => crypto.randomInt(n),
      isQuiet,
      log: (m) => log(matchId + ': ' + m),
      report: (event, payload) => api('report', Object.assign({}, payload, { matchId, event })),
      // Players read the results for a while; then the API clears the run and we let go.
      onEnd: () => setTimeout(stopReferee, 60000)
    });
    referees.set(matchId, { ref, transport });
    log('refereeing ' + matchId + ' in ' + code + ' (' + run.seats.length + ' players)');
    ref.start().catch((e) => { log(matchId + ': referee failed: ' + (e && e.message)); stopReferee(); });
  }

  const imposterRuns = rtdb.stream('imposterRuns', (all) => {
    all = all || {};
    Object.keys(all).forEach((id) => { if (!referees.has(id)) startReferee(id, all[id]); });
    if (referees.size) lastActive = Date.now();
  }, log);

  /* WordFlow: the runner is the referee for every match the API started (wordflowRuns). */
  function startWordflow(matchId, run) {
    if (!run || !run.roomCode || !run.seats) return;
    const code = run.roomCode;
    const transport = roomTransport(rtdb, code, serverNow, (m) => log(matchId + ': ' + m));
    const stopIt = () => {
      const r = wordflows.get(matchId);
      if (!r) return;
      r.ref.stop();
      transport.close();
      wordflows.delete(matchId);
      lastActive = Date.now();
    };
    const ref = FF.WordFlowReferee.create({
      run, room: transport,
      store: {
        load: () => rtdb.get('wordflowState/' + matchId),
        save: (s) => rtdb.set('wordflowState/' + matchId, s)
      },
      // The AI judge, through the API. null (no AI, or it failed) means the rules decide.
      judge: (req) => api('wordflow/judge', req).then((r) => r.verdict || null),
      randomInt: (n) => crypto.randomInt(n),
      isWord, isQuiet,
      log: (m) => log(matchId + ': ' + m),
      report: (event, payload) => api('report', Object.assign({}, payload, { matchId, event })),
      onEnd: () => setTimeout(stopIt, 60000)
    });
    wordflows.set(matchId, { ref, transport });
    log('refereeing WordFlow ' + matchId + ' in ' + code);
    ref.start().catch((e) => { log(matchId + ': referee failed: ' + (e && e.message)); stopIt(); });
  }

  const wordflowRuns = rtdb.stream('wordflowRuns', (all) => {
    all = all || {};
    Object.keys(all).forEach((id) => { if (!wordflows.has(id)) startWordflow(id, all[id]); });
    if (wordflows.size) lastActive = Date.now();
  }, log);

  /* Ball Swap: the runner is the referee for every match the API started (ballswapRuns). */
  function startBallswap(matchId, run) {
    if (!run || !run.roomCode || !run.seats) return;
    const code = run.roomCode;
    const transport = roomTransport(rtdb, code, serverNow, (m) => log(matchId + ': ' + m));
    const stopIt = () => {
      const r = ballswaps.get(matchId);
      if (!r) return;
      r.ref.stop();
      transport.close();
      ballswaps.delete(matchId);
      lastActive = Date.now();
    };
    const ref = FF.BallSwapReferee.create({
      run, room: transport,
      store: {
        load: () => rtdb.get('ballswapState/' + matchId),
        save: (s) => rtdb.set('ballswapState/' + matchId, s)
      },
      randomInt: (n) => crypto.randomInt(n),
      log: (m) => log(matchId + ': ' + m),
      report: (event, payload) => api('report', Object.assign({}, payload, { matchId, event })),
      onEnd: () => setTimeout(stopIt, 60000)
    });
    ballswaps.set(matchId, { ref, transport });
    log('refereeing Ball Swap ' + matchId + ' in ' + code);
    ref.start().catch((e) => { log(matchId + ': referee failed: ' + (e && e.message)); stopIt(); });
  }

  const ballswapRuns = rtdb.stream('ballswapRuns', (all) => {
    all = all || {};
    Object.keys(all).forEach((id) => { if (!ballswaps.has(id)) startBallswap(id, all[id]); });
    if (ballswaps.size) lastActive = Date.now();
  }, log);

  /* SortRush: the runner is the referee for every match the API started (sortrushRuns). */
  function startSortrush(matchId, run) {
    if (!run || !run.roomCode || !run.seats) return;
    const code = run.roomCode;
    const transport = roomTransport(rtdb, code, serverNow, (m) => log(matchId + ': ' + m));
    const stopIt = () => {
      const r = sortrushes.get(matchId);
      if (!r) return;
      r.ref.stop();
      transport.close();
      sortrushes.delete(matchId);
      lastActive = Date.now();
    };
    const ref = FF.SortRushReferee.create({
      run, room: transport,
      store: {
        load: () => rtdb.get('sortrushState/' + matchId),
        save: (s) => rtdb.set('sortrushState/' + matchId, s)
      },
      randomInt: (n) => crypto.randomInt(n),
      log: (m) => log(matchId + ': ' + m),
      report: (event, payload) => api('report', Object.assign({}, payload, { matchId, event })),
      onEnd: () => setTimeout(stopIt, 60000)
    });
    sortrushes.set(matchId, { ref, transport });
    log('refereeing SortRush ' + matchId + ' in ' + code);
    ref.start().catch((e) => { log(matchId + ': referee failed: ' + (e && e.message)); stopIt(); });
  }

  const sortrushRuns = rtdb.stream('sortrushRuns', (all) => {
    all = all || {};
    Object.keys(all).forEach((id) => { if (!sortrushes.has(id)) startSortrush(id, all[id]); });
    if (sortrushes.size) lastActive = Date.now();
  }, log);

  /* GeoSpin: the runner is the referee for every match the API started (geospinRuns). */
  function startGeospin(matchId, run) {
    if (!run || !run.roomCode || !run.seats) return;
    const code = run.roomCode;
    const transport = roomTransport(rtdb, code, serverNow, (m) => log(matchId + ': ' + m));
    const stopIt = () => {
      const r = geospins.get(matchId);
      if (!r) return;
      r.ref.stop();
      transport.close();
      geospins.delete(matchId);
      lastActive = Date.now();
    };
    const ref = FF.GeoSpinReferee.create({
      run, room: transport,
      store: {
        load: () => rtdb.get('geospinState/' + matchId),
        save: (s) => rtdb.set('geospinState/' + matchId, s)
      },
      randomInt: (n) => crypto.randomInt(n),
      log: (m) => log(matchId + ': ' + m),
      report: (event, payload) => api('report', Object.assign({}, payload, { matchId, event })),
      onEnd: () => setTimeout(stopIt, 60000)
    });
    geospins.set(matchId, { ref, transport });
    log('refereeing GeoSpin ' + matchId + ' in ' + code);
    ref.start().catch((e) => { log(matchId + ': referee failed: ' + (e && e.message)); stopIt(); });
  }

  const geospinRuns = rtdb.stream('geospinRuns', (all) => {
    all = all || {};
    Object.keys(all).forEach((id) => { if (!geospins.has(id)) startGeospin(id, all[id]); });
    if (geospins.size) lastActive = Date.now();
  }, log);

  /* What's Missing?: the runner is the referee for every match the API started (whatsmissingRuns). */
  function startWhatsmissing(matchId, run) {
    if (!run || !run.roomCode || !run.seats) return;
    const code = run.roomCode;
    const transport = roomTransport(rtdb, code, serverNow, (m) => log(matchId + ': ' + m));
    const stopIt = () => {
      const r = whatsmissings.get(matchId);
      if (!r) return;
      r.ref.stop();
      transport.close();
      whatsmissings.delete(matchId);
      lastActive = Date.now();
    };
    const ref = FF.WhatsMissingReferee.create({
      run, room: transport,
      store: {
        load: () => rtdb.get('whatsmissingState/' + matchId),
        save: (s) => rtdb.set('whatsmissingState/' + matchId, s)
      },
      randomInt: (n) => crypto.randomInt(n),
      log: (m) => log(matchId + ': ' + m),
      report: (event, payload) => api('report', Object.assign({}, payload, { matchId, event })),
      onEnd: () => setTimeout(stopIt, 60000)
    });
    whatsmissings.set(matchId, { ref, transport });
    log("refereeing What's Missing? " + matchId + ' in ' + code);
    ref.start().catch((e) => { log(matchId + ': referee failed: ' + (e && e.message)); stopIt(); });
  }

  const whatsmissingRuns = rtdb.stream('whatsmissingRuns', (all) => {
    all = all || {};
    Object.keys(all).forEach((id) => { if (!whatsmissings.has(id)) startWhatsmissing(id, all[id]); });
    if (whatsmissings.size) lastActive = Date.now();
  }, log);

  async function beat() {
    try {
      const res = await api('heartbeat', { pid: process.pid, matches: Array.from(playing.keys()), imposters: Array.from(referees.keys()), wordflow: Array.from(wordflows.keys()), ballswap: Array.from(ballswaps.keys()), sortrush: Array.from(sortrushes.keys()), geospin: Array.from(geospins.keys()), whatsmissing: Array.from(whatsmissings.keys()) });
      (res.drop || []).forEach((id) => { const m = playing.get(id); if (m) m.ctl.stop(); });
      (res.dropImposters || []).forEach((id) => {
        const r = referees.get(id);
        if (r) { r.ref.stop(); r.transport.close(); referees.delete(id); }
      });
      (res.dropWordflow || []).forEach((id) => {
        const r = wordflows.get(id);
        if (r) { r.ref.stop(); r.transport.close(); wordflows.delete(id); }
      });
      (res.dropBallswap || []).forEach((id) => {
        const r = ballswaps.get(id);
        if (r) { r.ref.stop(); r.transport.close(); ballswaps.delete(id); }
      });
      (res.dropSortrush || []).forEach((id) => {
        const r = sortrushes.get(id);
        if (r) { r.ref.stop(); r.transport.close(); sortrushes.delete(id); }
      });
      (res.dropGeospin || []).forEach((id) => {
        const r = geospins.get(id);
        if (r) { r.ref.stop(); r.transport.close(); geospins.delete(id); }
      });
      (res.dropWhatsmissing || []).forEach((id) => {
        const r = whatsmissings.get(id);
        if (r) { r.ref.stop(); r.transport.close(); whatsmissings.delete(id); }
      });
    } catch (e) {
      log('heartbeat failed: ' + e.message);
    }
    if (!playing.size && !referees.size && !wordflows.size && !ballswaps.size && !sortrushes.size && !geospins.size && !whatsmissings.size && Date.now() - lastActive > (cfg.idleMinutes || 5) * 60000) {
      log('nothing to play; stopping');
      runs.close();
      imposterRuns.close();
      wordflowRuns.close();
      ballswapRuns.close();
      sortrushRuns.close();
      geospinRuns.close();
      whatsmissingRuns.close();
      try { await api('stopped', { pid: process.pid }); } catch (e) { /* the API notices anyway */ }
      process.exit(0);
    }
  }
  /* A deploy changed our code: hand over to a fresh copy. Players' phones see a short pause;
     the new copy resumes every referee from its saved state and every crew match from crewRuns. */
  function restart() {
    log('new code deployed; restarting');
    runs.close();
    imposterRuns.close();
    wordflowRuns.close();
    ballswapRuns.close();
    sortrushRuns.close();
    geospinRuns.close();
    whatsmissingRuns.close();
    playing.forEach((m) => { try { m.transport.close(); } catch (e) { /* gone */ } });
    referees.forEach((r) => { try { r.ref.stop(); r.transport.close(); } catch (e) { /* gone */ } });
    wordflows.forEach((r) => { try { r.ref.stop(); r.transport.close(); } catch (e) { /* gone */ } });
    ballswaps.forEach((r) => { try { r.ref.stop(); r.transport.close(); } catch (e) { /* gone */ } });
    sortrushes.forEach((r) => { try { r.ref.stop(); r.transport.close(); } catch (e) { /* gone */ } });
    geospins.forEach((r) => { try { r.ref.stop(); r.transport.close(); } catch (e) { /* gone */ } });
    whatsmissings.forEach((r) => { try { r.ref.stop(); r.transport.close(); } catch (e) { /* gone */ } });
    cleanup();   // free the lock for the new copy
    try {
      const child = spawn(process.execPath, process.argv.slice(1), { detached: true, stdio: 'inherit' });
      child.unref();
    } catch (e) {
      log('could not start the new copy (the API starts one when needed): ' + e.message);
    }
    process.exit(0);
  }

  setInterval(beat, HEARTBEAT_MS);
  setInterval(() => { if (code.check()) restart(); }, CODE_CHECK_MS);
  beat();
}

main().catch((e) => { log('runner failed: ' + (e && e.stack || e)); process.exit(1); });
