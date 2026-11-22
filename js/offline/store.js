/* ============================================================
   PLAYMONA — offline/store.js  (FF.OfflineStore)
   Keeps the offline event on this laptop and in step between the
   MC window and the projector window. Nothing leaves the laptop:
     - the event (teams, points, games) is JSON in localStorage,
       saved on every change, so a refresh picks up where it was;
     - photos are pictures in IndexedDB (they are too big for
       localStorage), shrunk to 1600 px when they are added;
     - a BroadcastChannel (and the storage event as a fallback)
       tells the other window that something changed.
   Only the MC writes. The projector reads and says it is there.
   Classic script, ES2017 or older.
   ============================================================ */
window.FF = window.FF || {};
(function () {
  'use strict';

  var KEY = 'playmona:offlineEvent:vicky';
  var BACKUP = KEY + ':backup';
  var DB = 'playmona-offline';
  var L = function () { return FF.OfflineLogic; };

  var chan = null;
  try { chan = new BroadcastChannel('playmona-offline'); } catch (e) { chan = null; }
  var listeners = [];

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) {}
    if (!raw) try { raw = localStorage.getItem(BACKUP); } catch (e) {}
    if (raw) {
      try {
        var s = JSON.parse(raw);
        if (s && s.v === 1 && Array.isArray(s.teams)) return upgrade(s);
      } catch (e) {}
    }
    return L().fresh();
  }
  /* Fill in anything a newer version added, so an older save still opens. */
  function upgrade(s) {
    var f = L().fresh();
    Object.keys(f).forEach(function (k) { if (s[k] === undefined) s[k] = f[k]; });
    Object.keys(f.settings).forEach(function (k) { if (s.settings[k] === undefined) s.settings[k] = f.settings[k]; });
    if (!s.quiz || typeof s.quiz.text !== 'string') s.quiz = f.quiz;
    return s;
  }

  var lastGood = '';
  function save(s) {
    s.rev = (s.rev || 0) + 1;
    s.savedAt = Date.now();
    var raw = JSON.stringify(s);
    try {
      localStorage.setItem(KEY, raw);
      // A second copy, a few seconds behind, in case a save is ever cut short.
      if (!lastGood || Date.now() - (save.at || 0) > 5000) { localStorage.setItem(BACKUP, raw); save.at = Date.now(); }
      lastGood = raw;
    } catch (e) {
      if (window.console) console.warn('Offline event: could not save', e);
    }
    if (chan) try { chan.postMessage({ type: 'state', rev: s.rev }); } catch (e) {}
    return s;
  }

  function onChange(fn) { listeners.push(fn); }
  function emit(msg) { listeners.forEach(function (fn) { try { fn(msg); } catch (e) { if (window.console) console.error(e); } }); }
  if (chan) chan.onmessage = function (e) { emit(e.data || {}); };
  window.addEventListener('storage', function (e) { if (e.key === KEY) emit({ type: 'state', via: 'storage' }); });

  function send(msg) { if (chan) try { chan.postMessage(msg); } catch (e) {} }

  /* ---------- photos in IndexedDB ---------- */
  var dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('photos'); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbp;
  }
  function idb(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (resolve, reject) {
        var tx = d.transaction('photos', mode);
        var out = fn(tx.objectStore('photos'));
        tx.oncomplete = function () { resolve(out && out.result !== undefined ? out.result : out); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  function putPhoto(id, blob) { return idb('readwrite', function (st) { st.put(blob, id); }); }
  function getPhoto(id) { return idb('readonly', function (st) { return st.get(id); }); }
  function delPhoto(id) { return idb('readwrite', function (st) { st.delete(id); }); }

  var urls = {};
  function photoUrl(id) {
    if (!id) return Promise.resolve(null);
    if (urls[id]) return Promise.resolve(urls[id]);
    return getPhoto(id).then(function (b) {
      if (!b) return null;
      urls[id] = URL.createObjectURL(b);
      return urls[id];
    });
  }

  /* A picture file -> a smaller JPEG, so 6×6 boards stay smooth on the projector. */
  function shrink(file, max) {
    max = max || 1600;
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
        var c = document.createElement('canvas');
        c.width = Math.round(w * k); c.height = Math.round(h * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { if (b) resolve({ blob: b, w: c.width, h: c.height }); else reject(new Error('shrink')); }, 'image/jpeg', 0.88);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('That file is not a picture this browser can open.')); };
      img.src = url;
    });
  }
  function addPhoto(s, file) {
    return shrink(file).then(function (r) {
      var id = L().uid('p');
      return putPhoto(id, r.blob).then(function () {
        var meta = { id: id, name: String(file.name || 'Photo').replace(/\.[a-z0-9]+$/i, '').slice(0, 60), w: r.w, h: r.h };
        s.photos.push(meta);
        return meta;
      });
    });
  }
  function removePhoto(s, id) {
    s.photos = s.photos.filter(function (p) { return p.id !== id; });
    if (s.event.welcomePhotoId === id) s.event.welcomePhotoId = null;
    if (urls[id]) { URL.revokeObjectURL(urls[id]); delete urls[id]; }
    return delPhoto(id);
  }

  /* ---------- a backup file: the event and its photos in one JSON file ---------- */
  function blobToData(b) {
    return new Promise(function (resolve) { var r = new FileReader(); r.onload = function () { resolve(r.result); }; r.readAsDataURL(b); });
  }
  function exportAll(s) {
    var pics = {};
    return s.photos.reduce(function (p, m) {
      return p.then(function () { return getPhoto(m.id); }).then(function (b) { return b ? blobToData(b) : null; }).then(function (d) { if (d) pics[m.id] = d; });
    }, Promise.resolve()).then(function () {
      return JSON.stringify({ kind: 'playmona-offline-event', at: new Date().toISOString(), state: s, photos: pics });
    });
  }
  function importAll(text) {
    var data = JSON.parse(text);
    if (!data || data.kind !== 'playmona-offline-event' || !data.state) throw new Error('This is not an offline event backup.');
    var s = upgrade(data.state);
    var ids = Object.keys(data.photos || {});
    return ids.reduce(function (p, id) {
      return p.then(function () { return fetch(data.photos[id]); }).then(function (r) { return r.blob(); }).then(function (b) { return putPhoto(id, b); });
    }, Promise.resolve()).then(function () { return s; });
  }

  FF.OfflineStore = {
    KEY: KEY, load: load, save: save, onChange: onChange, send: send,
    addPhoto: addPhoto, removePhoto: removePhoto, photoUrl: photoUrl,
    exportAll: exportAll, importAll: importAll
  };
})();
