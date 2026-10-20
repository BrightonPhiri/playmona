/* ============================================================
   PLAYMORA — auth.js
   Player accounts.

   Two back ends, one API:
   - 'firebase': Firebase Authentication (email or username + password,
     and Google). Profiles live at /users/{uid}/profile and usernames are
     reserved at /usernames/{name} (see database.rules.json).
   - 'local': accounts kept on this device only. Used automatically when
     Firebase is not configured, and for development and tests
     (FF.Storage.set('devAuth', true)).

   Offline: the signed-in session is cached on the device, so a player
   who has signed in once can keep playing without a connection. Firebase
   re-checks the session in the background when it can.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var USERNAME_RE = /^[a-z0-9_.]{3,20}$/;
  var listeners = [];
  var session = null;
  var mode = 'local';
  var firebaseRef = null;
  var googleRedirectChecked = false;

  function t(key, fallback, vars) { return FF.t ? FF.t(key, fallback, vars) : fallback; }

  function err(code, message) {
    var e = new Error(message);
    e.code = code;
    return e;
  }

  function normalizeUsername(name) {
    return String(name || '').trim().replace(/^@/, '').toLowerCase();
  }

  function usernameError(name) {
    var u = normalizeUsername(name);
    if (u.length < 3) return t('usernameShort', 'Usernames need at least 3 characters.');
    if (u.length > 20) return t('usernameLong', 'Usernames can have up to 20 characters.');
    if (!USERNAME_RE.test(u)) return t('usernameChars', 'Use letters, numbers, dots and underscores only.');
    return null;
  }

  function emailError(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim()) ? null : t('emailInvalid', 'Enter a valid email address.');
  }

  function passwordError(pw) {
    return String(pw || '').length >= 8 ? null : t('passwordShort', 'Passwords need at least 8 characters.');
  }

  function cleanDisplayName(name, fallback) {
    name = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 24);
    return name || fallback || 'Player';
  }

  function notify() {
    listeners.slice().forEach(function (fn) { try { fn(session); } catch (e) { if (window.console) console.error(e); } });
  }

  // Make a session current: scope storage to it and mirror it into the roster.
  function apply(next) {
    if (session && session.mode === 'guest' && next && next.mode !== 'guest') {
      FF.Storage.set('guestUpgrade', session.uid);
    }
    session = next;
    if (next) {
      FF.Storage.set('session', next);
      FF.Storage.setScope(next.uid);
      FF.Storage.claimLegacy(next.uid);
      if (!next.needsProfile && FF.Players) FF.Players.syncMe(next);
    } else {
      FF.Storage.remove('session');
      FF.Storage.setScope(null);
    }
    notify();
    return next;
  }

  function online() { return typeof navigator === 'undefined' || navigator.onLine !== false; }

  /* ---------------- Guests ---------------- */
  // A guest plays without an account. Their data stays on this device under
  // one guest id, and moves into the account if they sign up later.
  function guestSession() {
    var id = FF.Storage.get('guestId', null);
    if (!id) { id = FF.util.uid() + FF.util.uid(); FF.Storage.set('guestId', id); }
    var saved = FF.Storage.get('guestProfile', null) || {};
    var avatar = saved.avatar || (FF.Avatars ? FF.Avatars.random() : '');
    if (!saved.avatar) FF.Storage.set('guestProfile', { displayName: saved.displayName || '', avatar: avatar });
    return {
      uid: 'guest-' + id, guest: true, mode: 'guest', provider: 'guest',
      username: null, email: null,
      displayName: saved.displayName || t('guest', 'Guest'), avatar: avatar, createdAt: Date.now()
    };
  }

  // A new account takes over what the person did as a guest on this device.
  function adoptGuest(uid) {
    var from = session && session.mode === 'guest' ? session.uid : FF.Storage.get('guestUpgrade', null);
    if (from && from !== uid) {
      FF.Storage.moveScope(from, uid);
      FF.Storage.remove('guestProfile');
    }
    FF.Storage.remove('guestUpgrade');
  }

  // Public player count shown on the landing page (Firebase only).
  function countNewPlayer(firebase) {
    try {
      firebase.database().ref('stats/players').transaction(function (n) { return (n || 0) + 1; }).catch(function () {});
    } catch (e) {}
  }

  /* ---------------- Local (on-device) accounts ---------------- */
  function sha256(text) {
    var c = (typeof window !== 'undefined') && window.crypto && window.crypto.subtle;
    if (c && window.TextEncoder) {
      return c.digest('SHA-256', new TextEncoder().encode(text)).then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
      });
    }
    // Fallback for very old browsers: not cryptographic, but local accounts
    // only lock a profile on a shared device; nothing leaves the device.
    var h = 5381;
    for (var i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
    return Promise.resolve('x' + (h >>> 0).toString(16));
  }

  var Local = {
    accounts: function () { return FF.Storage.get('devAccounts', {}) || {}; },
    save: function (all) { FF.Storage.set('devAccounts', all); },
    findBy: function (field, value) {
      var all = this.accounts();
      value = String(value || '').toLowerCase();
      for (var k in all) {
        if (Object.prototype.hasOwnProperty.call(all, k) && String(all[k][field] || '').toLowerCase() === value) return all[k];
      }
      return null;
    },
    signUp: function (o) {
      var self = this;
      if (this.findBy('email', o.email)) return Promise.reject(err('auth/email-already-in-use', t('emailTaken', 'An account with this email already exists.')));
      if (this.findBy('username', o.username)) return Promise.reject(err('auth/username-taken', t('usernameTaken', 'That username is taken. Try another.')));
      var uid = 'local-' + FF.util.uid() + FF.util.uid();
      return sha256(uid + ':' + o.password).then(function (hash) {
        var all = self.accounts();
        all[uid] = {
          uid: uid, email: o.email, username: o.username, hash: hash,
          displayName: o.displayName, avatar: o.avatar, createdAt: Date.now()
        };
        self.save(all);
        return all[uid];
      });
    },
    signIn: function (identifier, password) {
      var acct = identifier.indexOf('@') !== -1 ? this.findBy('email', identifier) : this.findBy('username', normalizeUsername(identifier));
      if (!acct) return Promise.reject(err('auth/invalid-credential', t('badLogin', 'That email, username or password is not right.')));
      return sha256(acct.uid + ':' + password).then(function (hash) {
        if (hash !== acct.hash) throw err('auth/invalid-credential', t('badLogin', 'That email, username or password is not right.'));
        return acct;
      });
    },
    update: function (uid, patch) {
      var all = this.accounts();
      if (!all[uid]) return;
      if (patch.username && patch.username !== all[uid].username && this.findBy('username', patch.username)) {
        throw err('auth/username-taken', t('usernameTaken', 'That username is taken. Try another.'));
      }
      Object.keys(patch).forEach(function (k) { if (patch[k] != null) all[uid][k] = patch[k]; });
      this.save(all);
    },
    remove: function (uid) {
      var all = this.accounts();
      delete all[uid];
      this.save(all);
    }
  };

  function localSession(acct) {
    return {
      uid: acct.uid, email: acct.email, username: acct.username,
      displayName: acct.displayName, avatar: acct.avatar,
      provider: 'local', mode: 'local', createdAt: acct.createdAt
    };
  }

  /* ---------------- Firebase accounts ---------------- */
  function fb() {
    if (firebaseRef) return Promise.resolve(firebaseRef);
    return FF.Net.ensureFirebase().then(function (firebase) {
      firebaseRef = firebase;
      return firebase;
    });
  }

  function fbMessage(e) {
    var code = (e && e.code) || '';
    var map = {
      'auth/email-already-in-use': t('emailTaken', 'An account with this email already exists. Try signing in.'),
      'auth/invalid-email': t('emailInvalid', 'Enter a valid email address.'),
      'auth/weak-password': t('passwordShort', 'Passwords need at least 8 characters.'),
      'auth/wrong-password': t('badLogin', 'That email, username or password is not right.'),
      'auth/user-not-found': t('badLogin', 'That email, username or password is not right.'),
      'auth/invalid-credential': t('badLogin', 'That email, username or password is not right.'),
      'auth/invalid-login-credentials': t('badLogin', 'That email, username or password is not right.'),
      'auth/too-many-requests': t('tooManyTries', 'Too many attempts. Wait a minute and try again.'),
      'auth/network-request-failed': t('noNetwork', 'No internet connection. Check your connection and try again.'),
      'auth/popup-closed-by-user': t('googleCancelled', 'Google sign-in was closed before it finished.'),
      'auth/cancelled-popup-request': t('googleCancelled', 'Google sign-in was closed before it finished.'),
      'auth/operation-not-allowed': t('providerOff', 'This sign-in method is not switched on for PlayMora yet.'),
      'auth/unauthorized-domain': t('domainOff', 'Google sign-in is not allowed on this web address yet.'),
      'auth/operation-not-supported-in-this-environment': t('googleNeedsWeb', 'Google sign-in only works when PlayMora is opened from a website.'),
      'auth/requires-recent-login': t('recentLogin', 'For your security, sign out and sign in again, then try once more.')
    };
    if (map[code]) return err(code, map[code]);
    if (e && e.code) return e;
    return err('auth/unknown', (e && e.message) || t('authFailed', 'Something went wrong. Please try again.'));
  }

  function profileRef(firebase, uid) { return firebase.database().ref('users/' + uid + '/profile'); }

  function loadProfile(firebase, user) {
    return profileRef(firebase, user.uid).once('value').then(function (snap) {
      var p = snap.val();
      var provider = (user.providerData && user.providerData[0] && user.providerData[0].providerId) || 'password';
      if (!p || !p.username) {
        return {
          uid: user.uid, email: user.email || '', username: '',
          displayName: cleanDisplayName(user.displayName, (user.email || '').split('@')[0]),
          avatar: (FF.Avatars ? FF.Avatars.random() : ''),
          provider: provider, mode: 'firebase', needsProfile: true
        };
      }
      return {
        uid: user.uid, email: user.email || p.email || '', username: p.username,
        displayName: p.displayName, avatar: p.avatar, provider: provider,
        mode: 'firebase', createdAt: p.createdAt
      };
    });
  }

  // Reserve a username for uid. Fails if someone else holds it.
  function claimUsername(firebase, username, uid, email) {
    var ref = firebase.database().ref('usernames/' + username);
    return ref.transaction(function (cur) {
      if (cur && cur.uid && cur.uid !== uid) return undefined; // abort: taken
      return email ? { uid: uid, email: email } : { uid: uid };
    }).then(function (res) {
      if (!res.committed) throw err('auth/username-taken', t('usernameTaken', 'That username is taken. Try another.'));
    });
  }

  function startSync(s) {
    if (FF.Sync && s && s.mode === 'firebase' && !s.needsProfile) {
      fb().then(function (firebase) { FF.Sync.start(s.uid, firebase); }).catch(function () {});
    }
  }

  /* ---------------- Public API ---------------- */
  FF.Auth = {
    normalizeUsername: normalizeUsername,
    usernameError: usernameError,
    emailError: emailError,
    passwordError: passwordError,

    // Resolves true when nobody holds this username (false when taken or invalid).
    usernameAvailable: function (name) {
      var u = normalizeUsername(name);
      if (usernameError(u)) return Promise.resolve(false);
      if (session && session.username === u) return Promise.resolve(true);
      if (mode === 'local') return Promise.resolve(!Local.findBy('username', u));
      if (!online()) return Promise.resolve(true);   // checked again when saving
      return fb().then(function (firebase) {
        return firebase.database().ref('usernames/' + u).once('value').then(function (snap) {
          var v = snap.val();
          return !v || !!(session && v.uid === session.uid);
        });
      }).catch(function () { return true; });
    },

    mode: function () { return mode; },
    isLocal: function () { return mode === 'local'; },
    isGuest: function () { return !!(session && session.mode === 'guest'); },

    // Play without an account. Progress stays on this device.
    playAsGuest: function () {
      if (session && session.mode !== 'guest') return Promise.resolve(session);
      return Promise.resolve(apply(guestSession()));
    },
    googleAvailable: function () {
      return mode === 'firebase' && typeof location !== 'undefined' && /^https?:$/.test(location.protocol);
    },

    user: function () { return session; },
    profile: function () { return session && !session.needsProfile ? session : null; },
    signedIn: function () { return !!session; },
    needsProfile: function () { return !!(session && session.needsProfile); },

    onChange: function (fn) {
      listeners.push(fn);
      return function () { var i = listeners.indexOf(fn); if (i !== -1) listeners.splice(i, 1); };
    },

    /* Resolve the starting session. A cached session resolves straight
       away (offline friendly); Firebase confirms it in the background. */
    init: function () {
      // Firebase sign-in does not work from file://, so a copy opened from disk uses device-only accounts.
      var fromDisk = typeof location !== 'undefined' && location.protocol === 'file:';
      var useLocal = fromDisk || !!FF.Storage.get('devAuth', false) || !(FF.Net && FF.Net.sdkConfigured && FF.Net.sdkConfigured());
      mode = useLocal ? 'local' : 'firebase';
      var cached = FF.Storage.get('session', null);
      if (cached && cached.mode === 'guest') {
        apply(guestSession());
        return Promise.resolve(session);
      }
      if (cached && cached.mode !== mode) cached = null;

      if (mode === 'local') {
        if (cached && !Local.accounts()[cached.uid]) cached = null;
        apply(cached);
        return Promise.resolve(cached);
      }

      if (cached) {
        apply(cached);
        this._watchFirebase(true);
        startSync(cached);
        return Promise.resolve(cached);
      }
      if (!online()) return Promise.resolve(null);
      return this._watchFirebase(false);
    },

    // Follow Firebase's view of the session. Returns a promise for the first answer.
    _watchFirebase: function (hadCached) {
      var self = this;
      return fb().then(function (firebase) {
        var first = true;
        return new Promise(function (resolve) {
          var done = function (v) { if (first) { first = false; resolve(v); } };
          var redirect = googleRedirectChecked ? Promise.resolve() :
            firebase.auth().getRedirectResult().catch(function () {}).then(function () { googleRedirectChecked = true; });
          redirect.then(function () {
            firebase.auth().onAuthStateChanged(function (user) {
              if (!user || user.isAnonymous) {
                // Signed out elsewhere, or the session expired.
                if (session && session.mode === 'firebase') { apply(null); if (FF.Sync) FF.Sync.stop(); }
                done(null);
                return;
              }
              if (session && session.uid === user.uid && !session.needsProfile) { done(session); return; }
              loadProfile(firebase, user).then(function (s) {
                apply(s);
                startSync(s);
                done(s);
              }).catch(function () {
                done(session);
              });
            });
          });
        });
      }).catch(function () {
        // Offline or the SDK could not load: keep any cached session.
        return hadCached ? session : null;
      });
    },

    signUp: function (o) {
      o = o || {};
      var username = normalizeUsername(o.username);
      var email = String(o.email || '').trim();
      var problem = emailError(email) || usernameError(username) || passwordError(o.password);
      if (problem) return Promise.reject(err('auth/invalid', problem));
      var displayName = cleanDisplayName(o.displayName, o.username);
      var avatar = o.avatar || (FF.Avatars ? FF.Avatars.random() : '');

      if (mode === 'local') {
        return Local.signUp({ email: email, username: username, password: o.password, displayName: displayName, avatar: avatar })
          .then(function (acct) { adoptGuest(acct.uid); return apply(localSession(acct)); });
      }
      if (!online()) return Promise.reject(err('auth/network-request-failed', t('noNetwork', 'No internet connection. Check your connection and try again.')));

      var created = null;
      return fb().then(function (firebase) {
        return firebase.database().ref('usernames/' + username).once('value').then(function (snap) {
          if (snap.exists()) throw err('auth/username-taken', t('usernameTaken', 'That username is taken. Try another.'));
          return firebase.auth().createUserWithEmailAndPassword(email, o.password);
        }).then(function (cred) {
          created = cred.user;
          return claimUsername(firebase, username, created.uid, email);
        }).then(function () {
          var profile = { username: username, displayName: displayName, avatar: avatar, createdAt: Date.now() };
          return Promise.all([
            profileRef(firebase, created.uid).set(profile),
            created.updateProfile({ displayName: displayName })
          ]).then(function () {
            var s = { uid: created.uid, email: email, username: username, displayName: displayName, avatar: avatar, provider: 'password', mode: 'firebase', createdAt: profile.createdAt };
            adoptGuest(s.uid);
            countNewPlayer(firebase);
            apply(s);
            startSync(s);
            return s;
          });
        }).catch(function (e) {
          // Roll back a half-made account so the email can be used again.
          if (created && e && e.code === 'auth/username-taken') { created.delete().catch(function () {}); }
          throw fbMessage(e);
        });
      });
    },

    // identifier: email address or username.
    signIn: function (identifier, password) {
      identifier = String(identifier || '').trim();
      if (!identifier || !password) return Promise.reject(err('auth/invalid', t('fillBoth', 'Enter your email or username and your password.')));
      FF.Storage.remove('guestUpgrade');
      if (mode === 'local') {
        return Local.signIn(identifier, password).then(function (acct) { return apply(localSession(acct)); });
      }
      if (!online()) return Promise.reject(err('auth/network-request-failed', t('noNetwork', 'No internet connection. Check your connection and try again.')));
      return fb().then(function (firebase) {
        var emailP = identifier.indexOf('@') !== -1 ? Promise.resolve(identifier)
          : firebase.database().ref('usernames/' + normalizeUsername(identifier)).once('value').then(function (snap) {
            var v = snap.val();
            if (!v) throw err('auth/invalid-credential', '');
            if (!v.email) throw err('auth/google-only', t('googleOnly', 'This account signs in with Google. Use the Google button.'));
            return v.email;
          });
        return emailP.then(function (email) {
          return firebase.auth().signInWithEmailAndPassword(email, password);
        }).then(function (cred) {
          return loadProfile(firebase, cred.user);
        }).then(function (s) {
          apply(s);
          startSync(s);
          return s;
        });
      }).catch(function (e) { throw fbMessage(e); });
    },

    signInWithGoogle: function () {
      if (mode !== 'firebase') return Promise.reject(err('auth/operation-not-allowed', t('providerOff', 'This sign-in method is not switched on for PlayMora yet.')));
      if (!this.googleAvailable()) return Promise.reject(fbMessage({ code: 'auth/operation-not-supported-in-this-environment' }));
      return fb().then(function (firebase) {
        var provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        return firebase.auth().signInWithPopup(provider).catch(function (e) {
          // Popups are often blocked on phones: fall back to a full-page redirect.
          if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) {
            return firebase.auth().signInWithRedirect(provider).then(function () { return new Promise(function () {}); });
          }
          throw e;
        }).then(function (cred) {
          return loadProfile(firebase, cred.user);
        }).then(function (s) {
          apply(s);
          startSync(s);
          return s;
        });
      }).catch(function (e) { throw fbMessage(e); });
    },

    // First sign-in with Google: choose a username, name and character.
    completeProfile: function (o) {
      if (!session) return Promise.reject(err('auth/no-session', t('authFailed', 'Something went wrong. Please try again.')));
      var username = normalizeUsername(o.username);
      var problem = usernameError(username);
      if (problem) return Promise.reject(err('auth/invalid', problem));
      var displayName = cleanDisplayName(o.displayName, username);
      var avatar = o.avatar || session.avatar;
      var uid = session.uid;
      if (mode === 'local') {
        Local.update(uid, { username: username, displayName: displayName, avatar: avatar });
        adoptGuest(uid);
        return Promise.resolve(apply(Object.assign({}, session, { username: username, displayName: displayName, avatar: avatar, needsProfile: false })));
      }
      return fb().then(function (firebase) {
        return claimUsername(firebase, username, uid, null).then(function () {
          var profile = { username: username, displayName: displayName, avatar: avatar, createdAt: Date.now() };
          return profileRef(firebase, uid).set(profile).then(function () {
            var s = Object.assign({}, session, profile, { needsProfile: false });
            adoptGuest(uid);
            countNewPlayer(firebase);
            apply(s);
            startSync(s);
            return s;
          });
        });
      }).catch(function (e) { throw fbMessage(e); });
    },

    // Change name, character or username. opts.fromRoster: the roster already updated itself.
    updateProfile: function (patch, opts) {
      if (!session || session.needsProfile) return Promise.resolve(session);
      patch = patch || {};
      var next = Object.assign({}, session);
      var oldUsername = session.username;
      var newUsername = patch.username != null ? normalizeUsername(patch.username) : oldUsername;
      if (newUsername !== oldUsername && session.mode !== 'guest') {
        var problem = usernameError(newUsername);
        if (problem) return Promise.reject(err('auth/invalid', problem));
      }
      if (patch.displayName != null) next.displayName = cleanDisplayName(patch.displayName, session.displayName);
      if (patch.avatar) next.avatar = patch.avatar;
      next.username = newUsername;

      function finish() {
        session = next;
        FF.Storage.set('session', next);
        if (!(opts && opts.fromRoster) && FF.Players) FF.Players.syncMe(next);
        notify();
        return next;
      }

      if (next.mode === 'guest') {
        next.username = null;
        FF.Storage.set('guestProfile', { displayName: next.displayName, avatar: next.avatar });
        return Promise.resolve(finish());
      }
      if (mode === 'local') {
        try { Local.update(next.uid, { displayName: next.displayName, avatar: next.avatar, username: next.username }); } catch (e) { return Promise.reject(e); }
        return Promise.resolve(finish());
      }
      // Save locally now; the server catches up when online.
      var result = finish();
      if (!online()) return Promise.resolve(result);
      return fb().then(function (firebase) {
        var chain = Promise.resolve();
        if (newUsername !== oldUsername) {
          chain = claimUsername(firebase, newUsername, next.uid, next.provider === 'password' ? next.email : null).then(function () {
            return firebase.database().ref('usernames/' + oldUsername).remove();
          });
        }
        return chain.then(function () {
          return profileRef(firebase, next.uid).update({ username: next.username, displayName: next.displayName, avatar: next.avatar });
        }).then(function () { return next; });
      }).catch(function (e) {
        if (newUsername !== oldUsername) {
          // Username change failed: put the old one back locally.
          next.username = oldUsername;
          finish();
        }
        throw fbMessage(e);
      });
    },

    resetPassword: function (identifier) {
      identifier = String(identifier || '').trim();
      if (mode === 'local') {
        return Promise.reject(err('auth/local', t('localReset', 'Accounts on this device cannot be reset by email. Ask whoever set up the device, or create a new account.')));
      }
      return fb().then(function (firebase) {
        var emailP = identifier.indexOf('@') !== -1 ? Promise.resolve(identifier)
          : firebase.database().ref('usernames/' + normalizeUsername(identifier)).once('value').then(function (snap) {
            var v = snap.val();
            return v && v.email ? v.email : null;
          });
        return emailP.then(function (email) {
          // Same reply whether or not the account exists, so this cannot be
          // used to discover who has an account.
          if (!email) return true;
          return firebase.auth().sendPasswordResetEmail(email).then(function () { return true; });
        });
      }).catch(function (e) {
        if (e && e.code === 'auth/user-not-found') return true;
        throw fbMessage(e);
      });
    },

    signOut: function () {
      if (FF.Sync) FF.Sync.stop();
      var wasFirebase = mode === 'firebase' && !(session && session.mode === 'guest');
      apply(null);
      if (!wasFirebase) return Promise.resolve();
      return fb().then(function (firebase) { return firebase.auth().signOut(); }).catch(function () {});
    },

    // Permanently delete the account and its saved data.
    deleteAccount: function () {
      if (!session) return Promise.resolve();
      var s = session;
      if (mode === 'local') {
        Local.remove(s.uid);
        FF.Storage.clear();
        apply(null);
        return Promise.resolve();
      }
      return fb().then(function (firebase) {
        var user = firebase.auth().currentUser;
        if (!user) throw err('auth/requires-recent-login', '');
        var db = firebase.database();
        // Firebase only deletes accounts that signed in recently. Check first,
        // so saved data is never removed from an account that then survives.
        return user.getIdTokenResult().then(function (token) {
          var signedInAt = Number(token.claims.auth_time || 0);
          if (Date.now() / 1000 - signedInAt > 280) throw err('auth/requires-recent-login', '');
          var cleanup = [db.ref('users/' + s.uid).remove()];
          if (s.username) cleanup.push(db.ref('usernames/' + s.username).remove());
          return Promise.all(cleanup);
        }).then(function () { return user.delete(); }).then(function () {
          if (FF.Sync) FF.Sync.stop();
          FF.Storage.clear();
          apply(null);
        });
      }).catch(function (e) { throw fbMessage(e); });
    }
  };
})();
