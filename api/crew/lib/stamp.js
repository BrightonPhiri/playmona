'use strict';
/*
 * The crew runner is one long-lived process, and a deploy only copies files: without this it
 * would keep playing the old code (a new game it does not know would never start). It takes a
 * stamp of its own code when it starts and compares it now and then; once the files on disk
 * have changed, and stayed the same for one more check (the upload has finished), it restarts.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const loader = require('./loader.js');

const ROOT = path.resolve(__dirname, '..', '..', '..');

/** Every file the runner runs: itself, its helpers and the shared game code it loads. */
function files(root) {
  root = root || ROOT;
  const own = ['api/crew/runner.js', 'api/crew/lib/loader.js', 'api/crew/lib/rtdb.js', 'api/crew/lib/stamp.js'];
  return own.concat(loader.FILES).map((f) => path.join(root, f));
}

/** A hash of all their contents, or null while one cannot be read (an upload in progress). */
function stamp(list) {
  const h = crypto.createHash('sha1');
  for (const f of list || files()) {
    try { h.update(f + '\0'); h.update(fs.readFileSync(f)); } catch (e) { return null; }
  }
  return h.digest('hex');
}

/**
 * watcher(start): call check() now and then; it returns true once the code has changed and the
 * new code has been the same for two checks in a row.
 */
function watcher(start, read) {
  read = read || (() => stamp());
  let seen = null;
  return {
    check() {
      const now = read();
      if (!now || now === start) { seen = null; return false; }
      if (now === seen) return true;
      seen = now;
      return false;
    }
  };
}

module.exports = { files, stamp, watcher };
