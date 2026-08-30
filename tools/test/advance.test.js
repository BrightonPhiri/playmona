'use strict';
const { loadFF, test, assert, assertEqual } = require('./harness');

/* A controllable clock so tests never depend on real time. */
function fakeClock() {
  let t = 1000;
  return {
    now: function () { return t; },
    advance: function (ms) { t += ms; }
  };
}

function make(FF, ms, clock, onDone) {
  return FF.Advance.controller({ ms: ms, now: clock.now, onDone: onDone });
}

test('controller starts idle and does not fire early', function () {
  const FF = loadFF(['js/advance.js']);
  const clock = fakeClock();
  let fired = 0;
  const c = make(FF, 2000, clock, function () { fired++; });

  assertEqual(c.state(), 'idle');
  c.start();
  assertEqual(c.state(), 'running');

  clock.advance(1999);
  c.tick();
  assertEqual(fired, 0, 'must not fire before ms elapses');
  assertEqual(c.state(), 'running');
});

test('controller fires exactly once when the time elapses', function () {
  const FF = loadFF(['js/advance.js']);
  const clock = fakeClock();
  let fired = 0;
  const c = make(FF, 2000, clock, function () { fired++; });

  c.start();
  clock.advance(2000);
  c.tick();
  assertEqual(fired, 1);
  assertEqual(c.state(), 'done');

  clock.advance(5000);
  c.tick();
  c.tick();
  assertEqual(fired, 1, 'extra ticks must not re-fire');
});

test('pause freezes elapsed time and resume continues it', function () {
  const FF = loadFF(['js/advance.js']);
  const clock = fakeClock();
  let fired = 0;
  const c = make(FF, 2000, clock, function () { fired++; });

  c.start();
  clock.advance(500);
  c.tick();
  c.pause();
  assertEqual(c.state(), 'paused');

  clock.advance(60000);           // a whole minute paused
  c.tick();
  assertEqual(fired, 0, 'a paused countdown must never fire');

  c.resume();
  assertEqual(c.state(), 'running');
  clock.advance(1499);
  c.tick();
  assertEqual(fired, 0, '1999ms of running time is not enough');

  clock.advance(1);
  c.tick();
  assertEqual(fired, 1, 'fires after 2000ms of running time');
});

test('skip fires immediately and only once', function () {
  const FF = loadFF(['js/advance.js']);
  const clock = fakeClock();
  let fired = 0;
  const c = make(FF, 2000, clock, function () { fired++; });

  c.start();
  c.skip();
  assertEqual(fired, 1);
  assertEqual(c.state(), 'done');

  c.skip();
  clock.advance(9999);
  c.tick();
  assertEqual(fired, 1, 'skip is idempotent');
});

test('cancel prevents the callback forever', function () {
  const FF = loadFF(['js/advance.js']);
  const clock = fakeClock();
  let fired = 0;
  const c = make(FF, 2000, clock, function () { fired++; });

  c.start();
  c.cancel();
  assertEqual(c.state(), 'cancelled');

  clock.advance(9999);
  c.tick();
  c.skip();
  c.resume();
  c.tick();
  assertEqual(fired, 0, 'a cancelled controller must never fire');
});

test('progress runs 0 to 1 and remaining never goes negative', function () {
  const FF = loadFF(['js/advance.js']);
  const clock = fakeClock();
  const c = make(FF, 2000, clock, function () {});

  c.start();
  assertEqual(c.progress(), 0);
  assertEqual(c.remaining(), 2000);

  clock.advance(1000);
  c.tick();
  assertEqual(c.progress(), 0.5);
  assertEqual(c.remaining(), 1000);

  clock.advance(5000);
  c.tick();
  assertEqual(c.progress(), 1);
  assertEqual(c.remaining(), 0, 'remaining must clamp at zero');
});

test('ms of 0 fires on the first tick', function () {
  const FF = loadFF(['js/advance.js']);
  const clock = fakeClock();
  let fired = 0;
  const c = make(FF, 0, clock, function () { fired++; });
  c.start();
  c.tick();
  assertEqual(fired, 1, 'a zero-length pause still completes');
});
