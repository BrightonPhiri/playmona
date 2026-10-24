/* ============================================================
   PLAYMONA — photo.js
   Profile photos.

   The photo is shrunk here first: the middle square is drawn at
   256 px onto a canvas, which also leaves behind hidden photo data
   (such as where it was taken). It goes to POST /api/avatar, which
   checks it, draws it again and answers with an avatar value
   ('photo:<file>') that the profile then saves like a character.
   Needs a real account on the live site (not a guest, not file://).
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var t = function (k, f, v) {
    if (FF.t) return FF.t(k, f, v);
    return String(f).replace(/\{(\w+)\}/g, function (m, n) { return v && v[n] != null ? v[n] : m; });
  };

  var SIZE = 256;
  var MAX_INPUT = 20 * 1024 * 1024;   // what the phone may hand us before shrinking

  function idToken() {
    return FF.Net.ensureFirebase().then(function (firebase) {
      var u = firebase.auth().currentUser;
      if (!u || u.isAnonymous) throw new Error(t('photoSignIn', 'Please sign in again to add a photo.'));
      return u.getIdToken();
    });
  }

  function send(path, body, type) {
    return idToken().then(function (tok) {
      var headers = { 'Authorization': 'Bearer ' + tok };
      if (type) headers['Content-Type'] = type;
      return fetch('/api' + path, { method: 'POST', headers: headers, body: body, cache: 'no-store' });
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.message || t('photoDown', 'The photo could not be saved. Please try again.'));
        return data;
      });
    });
  }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { resolve({ img: img, done: function () { URL.revokeObjectURL(url); } }); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error(t('photoUnreadable', 'That file is not a picture we can use. Try a JPG or PNG.'))); };
      img.src = url;
    });
  }

  function toBlob(canvas, type, quality) {
    return new Promise(function (resolve) {
      if (canvas.toBlob) canvas.toBlob(resolve, type, quality);
      else resolve(null);
    });
  }

  FF.Photo = {
    SIZE: SIZE,

    // Uploading needs the server and a signed-in (not guest) Firebase account.
    available: function () {
      return typeof location !== 'undefined' && /^https?:$/.test(location.protocol) &&
        !!(FF.Auth && FF.Auth.mode && FF.Auth.mode() === 'firebase' && !FF.Auth.isGuest());
    },

    /* File -> a 256 px square Blob (WebP, or JPEG where the browser cannot make WebP). */
    shrink: function (file) {
      if (!file || !/^image\//.test(file.type || '')) {
        return Promise.reject(new Error(t('photoUnreadable', 'That file is not a picture we can use. Try a JPG or PNG.')));
      }
      if (file.size > MAX_INPUT) return Promise.reject(new Error(t('photoHuge', 'That picture is too big. Choose a smaller one.')));
      return loadImage(file).then(function (loaded) {
        var img = loaded.img;
        var w = img.naturalWidth, h = img.naturalHeight;
        var side = Math.min(w, h);
        var canvas = document.createElement('canvas');
        canvas.width = SIZE;
        canvas.height = SIZE;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, SIZE, SIZE);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, SIZE, SIZE);
        loaded.done();
        return toBlob(canvas, 'image/webp', 0.85).then(function (blob) {
          if (blob && blob.type === 'image/webp') return blob;
          return toBlob(canvas, 'image/jpeg', 0.88);
        });
      }).then(function (blob) {
        if (!blob) throw new Error(t('photoUnreadable', 'That file is not a picture we can use. Try a JPG or PNG.'));
        return blob;
      });
    },

    /* Uploads a picture made by shrink(). Resolves with the avatar value to save in the profile. */
    send: function (blob) {
      return send('/avatar', blob, blob.type).then(function (data) {
        if (!FF.Avatars.isPhoto(data.avatar)) throw new Error(t('photoDown', 'The photo could not be saved. Please try again.'));
        return data.avatar;
      });
    },

    /* Shrinks and uploads in one go. */
    upload: function (file) {
      var self = this;
      return this.shrink(file).then(function (blob) { return self.send(blob); });
    },

    /* The player went back to a character: delete the file on the server (best effort). */
    remove: function () {
      if (!this.available()) return Promise.resolve();
      return send('/avatar/remove', '{}', 'application/json').catch(function () {});
    },

    /* Opens the phone's photo picker. onFile(file) runs with the chosen file. */
    choose: function (onFile) {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/jpeg,image/png,image/webp,image/heic,image/heif';
      input.style.display = 'none';
      input.addEventListener('change', function () {
        var file = input.files && input.files[0];
        if (input.parentNode) input.parentNode.removeChild(input);
        if (file) onFile(file);
      });
      document.body.appendChild(input);
      input.click();
    }
  };
})();
