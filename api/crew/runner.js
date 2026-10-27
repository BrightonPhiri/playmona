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
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');
const loader = require('./lib/loader.js');
const { Rtdb, tokenSource, roomTransport, request } = require('./lib/rtdb.js');

const HEARTBEAT_MS = 8000;

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
  let lastActive = Date.now();
  const isQuiet = (w) => FF.Words.isQuiet(w);

  function startMatch(matchId, run) {
    if (!run || !run.roomCode || !run.crew) return;
    const transport = roomTransport(rtdb, run.roomCode, serverNow, (m) => log(matchId + ': ' + m));
    const ctl = FF.CrewController.create({
      transport, run, matchId,
      report: (event, payload) => api('report', Object.assign({ matchId, event }, payload)),
      log: (m) => log(matchId + ': ' + m),
      // Imposters: each crew seat reads its own secret, never anyone else's.
      secretOf: (uid) => (run.crew[uid] ? rtdb.get('imposterSecrets/' + run.roomCode + '/' + uid) : Promise.resolve(null)),
      isQuiet,
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

  async function beat() {
    try {
      const res = await api('heartbeat', { pid: process.pid, matches: Array.from(playing.keys()), imposters: Array.from(referees.keys()) });
      (res.drop || []).forEach((id) => { const m = playing.get(id); if (m) m.ctl.stop(); });
      (res.dropImposters || []).forEach((id) => {
        const r = referees.get(id);
        if (r) { r.ref.stop(); r.transport.close(); referees.delete(id); }
      });
    } catch (e) {
      log('heartbeat failed: ' + e.message);
    }
    if (!playing.size && !referees.size && Date.now() - lastActive > (cfg.idleMinutes || 5) * 60000) {
      log('nothing to play; stopping');
      runs.close();
      imposterRuns.close();
      try { await api('stopped', { pid: process.pid }); } catch (e) { /* the API notices anyway */ }
      process.exit(0);
    }
  }
  setInterval(beat, HEARTBEAT_MS);
  beat();
}

main().catch((e) => { log('runner failed: ' + (e && e.stack || e)); process.exit(1); });
