'use strict';
const { loadFF, test, assertEqual } = require('./harness');

function boot() {
  const FF = loadFF(['js/core.js', 'js/storage.js', 'js/i18n.js', 'js/icons.js', 'js/ui-kit.js', 'js/gameUI.js']);
  FF.Storage.init();
  return FF;
}

test('gameUI: setupOrReplay replays a sanitized saved setup, else shows setup', function () {
  const FF = boot();
  const sanitize = function (s) { return { rounds: Math.min(6, s.rounds || 4) }; };
  let played = null, shown = 0;
  const play = function (cfg) { played = cfg; };
  const show = function (go) { shown++; assertEqual(go, play); };

  FF.Storage.set('game:setup', { rounds: 99 });
  FF.GameUI.setupOrReplay({ config: { replay: true } }, { key: 'game:setup', sanitize: sanitize, show: show, play: play });
  assertEqual([played, shown], [{ rounds: 6 }, 0]);

  played = null;
  FF.GameUI.setupOrReplay({ config: { replay: false } }, { key: 'game:setup', sanitize: sanitize, show: show, play: play });
  assertEqual([played, shown], [null, 1]);

  FF.Storage.remove('game:setup');
  FF.GameUI.setupOrReplay({ config: { replay: true } }, { key: 'game:setup', sanitize: sanitize, show: show, play: play });
  assertEqual([played, shown], [null, 2]);
});

test('util: secondsOr keeps a whole number of seconds from 0 to 600, else the fallback', function () {
  const FF = boot();
  assertEqual([FF.util.secondsOr(0, 20), FF.util.secondsOr('15', 20), FF.util.secondsOr(12.6, 20), FF.util.secondsOr(-1, 20),
    FF.util.secondsOr('x', 20), FF.util.secondsOr(undefined, 20), FF.util.secondsOr(9999, 20)], [0, 15, 13, 20, 20, 20, 600]);
  assertEqual(FF.util.DEFAULT_TIMER, 20);
});
