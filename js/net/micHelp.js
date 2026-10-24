/* ============================================================
   PLAYMONA — net/micHelp.js
   When voice chat can't get the microphone, show steps for this
   player's own browser and phone to turn it back on, instead of
   a short error toast. Used by the room screen and the game bar.
     FF.MicHelp.handle(err, retry)   err from FF.Voice.join()
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var t = function (k, f, v) { return FF.t(k, f, v); };

  /* ---------- Where are we? ---------- */
  function ua() { return navigator.userAgent || ''; }

  function isIOS() {
    return /iPad|iPhone|iPod/.test(ua()) || (/Macintosh/.test(ua()) && navigator.maxTouchPoints > 1);
  }
  function isAndroid() { return /Android/i.test(ua()); }

  // Mini browsers inside other apps (Facebook, Instagram, TikTok...) usually
  // can't use the microphone at all, whatever the player allows.
  function isInApp() {
    var u = ua();
    if (/FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|TikTok|musical_ly|BytedanceWebview|Twitter/i.test(u)) return true;
    if (isAndroid() && /; wv\)/.test(u)) return true;
    // iOS app web views leave "Safari" out of the user agent; so does a
    // home-screen app, which can use the microphone, so that one is excluded.
    if (isIOS() && !/Safari/.test(u) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(u) && window.navigator.standalone !== true) return true;
    return false;
  }

  function browserName() {
    var u = ua();
    if (/SamsungBrowser/.test(u)) return 'Samsung Internet';
    if (/EdgiOS|EdgA|Edg\//.test(u)) return 'Edge';
    if (/OPiOS|OPR\//.test(u)) return 'Opera';
    if (/FxiOS|Firefox\//.test(u)) return 'Firefox';
    if (/CriOS|Chrome\//.test(u)) return 'Chrome';
    if (/Safari\//.test(u)) return 'Safari';
    return '';
  }

  /* ---------- Steps ---------- */
  function li(text) { return FF.ui.el('li', {}, text); }
  function steps(list) { return FF.ui.el('ol', { class: 'install-steps' }, list.map(li)); }
  function para(text) { return FF.ui.el('p', {}, text); }

  function blockedSteps() {
    var name = browserName();
    var body = [para(t('micHelpIntro', 'Voice chat needs your microphone, and your browser is blocking it for PlayMona. Here is how to turn it on:'))];

    if (isIOS()) {
      if (name === 'Safari' || !name) {
        body.push(steps([
          t('micIosSafari1', 'Tap the aA button (page menu) at the left of the address bar.'),
          t('micIosSafari2', 'Tap Website Settings.'),
          t('micIosSafari3', 'Set Microphone to Allow.'),
          t('micTryAgainStep', 'Tap Try again below.')
        ]));
        body.push(para(t('micIosSafariTip', 'Still blocked? Open the Settings app, go to Safari (on newer iPhones: Apps, then Safari), tap Microphone and choose Ask or Allow.')));
      } else {
        body.push(steps([
          t('micIosApp1', 'Open the Settings app on your iPhone or iPad.'),
          t('micIosApp2', 'Scroll down and tap {browser} (on newer iPhones: Apps, then {browser}).', { browser: name }),
          t('micIosApp3', 'Turn on Microphone.'),
          t('micIosApp4', 'Come back here and tap Try again.')
        ]));
      }
      return body;
    }

    if (isAndroid()) {
      var app = name || t('micYourBrowser', 'your browser');
      body.push(steps([
        t('micAndroid1', 'Tap the icon at the left of the web address (it looks like a lock or two sliders).'),
        t('micAndroid2', 'Tap Permissions (or Site settings).'),
        t('micAndroid3', 'Set Microphone to Allow.'),
        t('micTryAgainStep', 'Tap Try again below.')
      ]));
      body.push(para(t('micAndroidTip', 'Still blocked? Open your phone’s Settings, go to Apps, then {browser}, then Permissions, and allow Microphone.', { browser: app })));
      return body;
    }

    // Computers.
    if (name === 'Firefox') {
      body.push(steps([
        t('micFirefox1', 'Click the microphone or lock icon at the left of the web address.'),
        t('micFirefox2', 'Next to Use the microphone, click the X to clear Blocked.'),
        t('micFirefox3', 'Click Try again, then choose Allow when Firefox asks.')
      ]));
    } else if (name === 'Safari') {
      body.push(steps([
        t('micMacSafari1', 'In the menu bar, choose Safari, then Settings for This Website.'),
        t('micMacSafari2', 'Set Microphone to Allow.'),
        t('micTryAgainStep', 'Click Try again below.')
      ]));
    } else {
      body.push(steps([
        t('micDesktop1', 'Click the icon at the left of the web address (a lock or two sliders).'),
        t('micDesktop2', 'Turn on Microphone, or open Site settings and set Microphone to Allow.'),
        t('micDesktop3', 'Click Try again. If it still fails, reload the page first.')
      ]));
    }
    body.push(para(/Mac/.test(ua())
      ? t('micMacTip', 'Still blocked? Open System Settings, then Privacy & Security, then Microphone, and turn on {browser}.', { browser: name || t('micYourBrowser', 'your browser') })
      : t('micWindowsTip', 'Still blocked? Open Windows Settings, then Privacy & security, then Microphone, and turn on microphone access for apps and for your browser.')));
    return body;
  }

  function copyLink() {
    var url = location.href;
    var done = function () { FF.UI.toast(t('linkCopied', 'Link copied'), { type: 'success' }); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, function () { window.prompt(t('copyThisLink', 'Copy this link'), url); });
    } else {
      window.prompt(t('copyThisLink', 'Copy this link'), url);
    }
  }

  /* ---------- The dialog ---------- */
  function show(code, retry) {
    var tryAgain = { label: t('tryAgain', 'Try again'), primary: true, icon: 'mic', onClick: function () { if (retry) retry(); } };
    var close = { label: t('close', 'Close') };

    if (code === 'blocked' && isInApp()) {
      return FF.UI.dialog({
        title: t('micInAppTitle', 'Open PlayMona in your browser'),
        body: [
          para(t('micInAppIntro', 'You opened PlayMona inside another app (like Facebook, Instagram or TikTok). These apps can’t use the microphone.')),
          steps([
            t('micInApp1', 'Tap the menu (⋮ or …) at the top of the screen.'),
            t('micInApp2', 'Choose Open in browser (or Open in Chrome / Safari).'),
            t('micInApp3', 'Join the room again and turn on voice chat.')
          ])
        ],
        actions: [close, { label: t('copyLink', 'Copy link'), primary: true, icon: 'link', onClick: copyLink, keepOpen: true }]
      });
    }

    if (code === 'nomic') {
      return FF.UI.dialog({
        title: t('micNoneTitle', 'No microphone found'),
        body: [para(t('micNoneBody', 'Plug in headphones with a microphone, or check that your microphone is switched on, then try again.'))],
        actions: [close, tryAgain]
      });
    }

    if (code === 'busy') {
      return FF.UI.dialog({
        title: t('micBusyTitle', 'The microphone is busy'),
        body: [para(t('micBusyBody', 'Another app or tab is using the microphone, like a phone call or a video chat. Close it, then try again.'))],
        actions: [close, tryAgain]
      });
    }

    return FF.UI.dialog({
      title: t('micAllowTitle', 'Allow the microphone'),
      body: blockedSteps(),
      actions: [close, tryAgain]
    });
  }

  FF.MicHelp = {
    show: show,
    isInApp: isInApp,

    // Shows steps for microphone problems; any other error is a toast.
    handle: function (err, retry) {
      var code = err && err.code;
      if (code === 'blocked' || code === 'nomic' || code === 'busy') return show(code, retry);
      FF.UI.toast((err && err.message) || t('voiceFailed', 'Could not join voice chat.'), { type: 'error' });
      return null;
    }
  };
})();
