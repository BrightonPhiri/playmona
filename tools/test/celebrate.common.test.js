'use strict';
/* Celebrations shared helpers (js/celebrate/common.js): what an event celebrates, and when it starts. */
const { loadFF, test, assertEqual } = require('./harness');

function common() { return loadFF(['js/core.js', 'js/celebrate/common.js']).Celebrate; }

test('celebrate common: kinds read old and new events', function () {
  const C = common();
  assertEqual(C.typesOf({ type: 'wedding' }), ['wedding']);
  assertEqual(C.typesOf({ type: 'birthday', types: ['birthday', 'graduation'] }), ['birthday', 'graduation']);
  assertEqual(C.typesLabel({ types: ['birthday', 'graduation'] }), 'Birthday · Graduation');
  assertEqual(C.typesLabel({ type: 'babyShower' }), 'Baby shower');
});
