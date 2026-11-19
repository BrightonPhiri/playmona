'use strict';
/* Celebrations shared helpers (js/celebrate/common.js): what an event celebrates, and when it starts. */
const { loadFF, test, assertEqual } = require('./harness');

function common() { return loadFF(['js/core.js', 'js/i18n.js', 'js/celebrate/common.js']).Celebrate; }

test('celebrate common: kinds read old and new events', function () {
  const C = common();
  assertEqual(C.typesOf({ type: 'wedding' }), ['wedding']);
  assertEqual(C.typesOf({ type: 'birthday', types: ['birthday', 'graduation'] }), ['birthday', 'graduation']);
  assertEqual(C.typesLabel({ types: ['birthday', 'graduation'] }), 'Birthday · Graduation');
  assertEqual(C.typesLabel({ type: 'babyShower' }), 'Baby shower');
});

test('celebrate common: start time in the event time zone', function () {
  const C = common();
  assertEqual(C.startsAt({ date: '2026-11-22', startTime: '14:00', timezone: 'Africa/Harare' }), Date.UTC(2026, 10, 22, 12, 0));
  assertEqual(C.startsAt({ date: '2026-11-22', startTime: '14:00', timezone: 'Europe/London' }), Date.UTC(2026, 10, 22, 14, 0));
  assertEqual(C.startsAt({ date: '2026-07-01', startTime: '09:30', timezone: 'Europe/London' }), Date.UTC(2026, 6, 1, 8, 30), 'summer time');
  assertEqual(C.startsAt({ date: '2026-11-22', startTime: null }), null);
  assertEqual(C.startsAt({ date: null, startTime: '14:00' }), null);
  assertEqual(C.startsAt({ date: '2026-11-22', startTime: '14:00', timezone: 'Not/AZone' }), new Date(2026, 10, 22, 14, 0).getTime(), 'bad zone: device time');
  assertEqual(C.startsAt({ date: '2026-11-22', startTime: '14:00', timezone: null }), new Date(2026, 10, 22, 14, 0).getTime(), 'no zone: device time');
});

test('celebrate common: countdown wording', function () {
  const C = common();
  assertEqual(C.countdownText((2 * 24 + 4) * 3600e3 + 59e3), 'Starts in 2 days 4 h');
  assertEqual(C.countdownText(24 * 3600e3), 'Starts in 1 day 0 h');
  assertEqual(C.countdownText(3 * 3600e3 + 5 * 60e3), 'Starts in 3 h 5 min');
  assertEqual(C.countdownText(12 * 60e3 + 30e3), 'Starts in 12 min 30 s');
  assertEqual(C.countdownText(40e3), 'Starts in 0 min 40 s');
});
