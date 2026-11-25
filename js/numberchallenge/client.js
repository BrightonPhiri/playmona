/* ============================================================
   PLAYMONA — numberchallenge/client.js
   A phone's side of an online Number Challenge Race (filled in with
   the referee). Classic script, ES2017 or older.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  function tidy(nc) { return nc || null; }
  function ready(nc) { return !!(nc && nc.settings && typeof nc.phase === 'string'); }
  function create() { return { view: function () { return { nc: null }; }, send: function () { return false; }, stop: function () {} }; }

  FF.NumberChallengeApi = {
    start: function () { return Promise.reject(new Error('Online Number Challenge is not ready yet.')); },
    nudge: function () { return Promise.resolve({ started: false }); }
  };
  FF.NumberChallengeClient = { create: create, tidy: tidy, ready: ready };
})();
