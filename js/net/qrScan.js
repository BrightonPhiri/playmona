/* ============================================================
   PLAYMONA — net/qrScan.js
   Join a room by pointing the camera at the host's QR code.
   Uses the browser's own QR reader (BarcodeDetector) where it
   exists, otherwise the vendored jsQR decoder (js/vendor/jsQR.js,
   Apache-2.0), loaded only when someone opens the scanner.
     FF.QRScan.open(function (code) { ... })
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var t = function (k, f, v) { return FF.t(k, f, v); };
  var JSQR_SRC = 'js/vendor/jsQR.js';
  var jsqrPromise = null;

  function loadJsQR() {
    if (window.jsQR) return Promise.resolve(window.jsQR);
    if (jsqrPromise) return jsqrPromise;
    jsqrPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = JSQR_SRC;
      s.onload = function () { window.jsQR ? resolve(window.jsQR) : reject(new Error('jsQR missing')); };
      s.onerror = function () { jsqrPromise = null; reject(new Error('Could not load the QR reader.')); };
      document.head.appendChild(s);
    });
    return jsqrPromise;
  }

  /* Returns a function(video) -> Promise<string|null> that reads one frame. */
  function makeReader() {
    if (typeof window.BarcodeDetector === 'function') {
      var formats = window.BarcodeDetector.getSupportedFormats
        ? window.BarcodeDetector.getSupportedFormats() : Promise.resolve(['qr_code']);
      return Promise.resolve(formats).then(function (list) {
        if (list.indexOf('qr_code') === -1) throw new Error('no qr_code');
        var detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        return function (video) {
          return detector.detect(video).then(function (found) {
            return found && found.length ? found[0].rawValue : null;
          });
        };
      }).catch(jsqrReader);
    }
    return jsqrReader();
  }

  function jsqrReader() {
    return loadJsQR().then(function (jsQR) {
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d', { willReadFrequently: true });
      return function (video) {
        var w = video.videoWidth, h = video.videoHeight;
        if (!w || !h) return Promise.resolve(null);
        // Scan a smaller copy: much faster on phones and still readable.
        var scale = Math.min(1, 640 / Math.max(w, h));
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        var hit = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        return Promise.resolve(hit ? hit.data : null);
      };
    });
  }

  FF.QRScan = {
    available: function () {
      return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    },

    /* Opens the camera in a dialog. Calls onCode(code) with a room code. */
    open: function (onCode) {
      var stream = null;
      var timer = null;
      var done = false;

      var video = FF.ui.el('video', { class: 'rm-scan__video', playsinline: true, muted: true, autoplay: true });
      video.muted = true;
      video.setAttribute('playsinline', '');
      var frame = FF.ui.div('rm-scan', [video, FF.ui.div('rm-scan__frame')]);
      var status = FF.ui.el('p', { class: 'rm-scan__status', role: 'status' }, t('scanStarting', 'Starting the camera…'));

      function stop() {
        done = true;
        if (timer) { clearTimeout(timer); timer = null; }
        if (stream) { stream.getTracks().forEach(function (tr) { try { tr.stop(); } catch (e) {} }); stream = null; }
        try { video.srcObject = null; } catch (e) {}
      }

      var dlg = FF.UI.dialog({
        title: t('scanTitle', 'Scan the room’s QR code'),
        body: [frame, status],
        actions: [{ label: t('cancel', 'Cancel') }],
        onClose: stop
      });

      function fail(err) {
        if (done) return;
        var name = (err && err.name) || '';
        frame.hidden = true;
        status.textContent = /NotAllowed|Security|PermissionDenied/.test(name)
          ? t('scanBlocked', 'Camera access is blocked. Allow the camera for this site in your browser settings, or open your phone’s camera app and point it at the QR code instead.')
          : /NotFound|DevicesNotFound|Overconstrained/.test(name)
            ? t('scanNoCamera', 'No camera was found. Type the room code instead.')
            : t('scanFailed', 'The camera could not start. Type the room code instead, or use your phone’s camera app.');
      }

      navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        .then(function (s) {
          if (done) { s.getTracks().forEach(function (tr) { tr.stop(); }); return; }
          stream = s;
          video.srcObject = s;
          var p = video.play();
          if (p && p.catch) p.catch(function () {});
          status.textContent = t('scanAim', 'Point the camera at the QR code on the host’s screen.');
          return makeReader().then(function (read) {
            var wrongShown = false;
            function tick() {
              if (done) return;
              read(video).then(function (text) {
                if (done) return;
                var code = text ? FF.Room.codeFromText(text) : null;
                if (code) {
                  stop();
                  FF.Audio.play('select');
                  dlg.close();
                  onCode(code);
                  return;
                }
                if (text && !wrongShown) {
                  wrongShown = true;
                  status.textContent = t('scanWrong', 'That QR code isn’t a PlayMona room. Try the one on the host’s screen.');
                }
                timer = setTimeout(tick, 200);
              }, function () { timer = setTimeout(tick, 400); });
            }
            tick();
          });
        })
        .catch(fail);

      return dlg;
    }
  };
})();
