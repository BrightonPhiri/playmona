/* ============================================================
   PLAYMORA — authUI.js
   Sign in, create account, reset password, and the "make it
   yours" step (character + name, and a username for Google
   sign-ups). Rendered full screen before the app shell.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  function t(k, f, v) { return FF.t(k, f, v); }
  function icon(k) { return FF.Icons.icon(k); }

  var GOOGLE_G = '<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';

  var root = null;
  var view = 'signin';
  var busy = false;

  // The PlayMora wordmark: "Play" in ink, "Mora" in the brand gradient.
  function wordmark(cls) {
    var w = FF.ui.el('span', { class: 'wordmark' + (cls ? ' ' + cls : ''), 'aria-label': 'PlayMora' });
    w.appendChild(FF.ui.el('span', { class: 'wordmark__play', 'aria-hidden': 'true' }, 'Play'));
    w.appendChild(FF.ui.el('span', { class: 'wordmark__mora', 'aria-hidden': 'true' }, 'Mora'));
    return w;
  }

  function brandLockup() {
    var b = FF.ui.div('auth__brand');
    b.appendChild(FF.ui.el('img', { class: 'auth__mark', src: 'assets/brand/mark-256.webp', alt: '', width: 72, height: 72 }));
    b.appendChild(wordmark('wordmark--lg'));
    b.appendChild(FF.ui.el('p', { class: 'auth__tagline' }, t('tagline', 'Games for everyone. Everywhere.')));
    return b;
  }

  // A labelled input with an error line underneath.
  function field(opts) {
    var id = 'auth-' + opts.name;
    var wrap = FF.ui.div('field');
    wrap.appendChild(FF.ui.el('label', { class: 'field__label', for: id }, opts.label));
    var row = FF.ui.div('field__row');
    var input = FF.ui.el('input', {
      id: id, name: opts.name, type: opts.type || 'text', class: 'input field__input',
      autocomplete: opts.autocomplete || 'off', autocapitalize: opts.autocapitalize || 'off',
      spellcheck: 'false', placeholder: opts.placeholder || '', value: opts.value || '',
      maxlength: opts.maxlength || null, required: true, 'aria-describedby': id + '-err'
    });
    row.appendChild(input);
    if (opts.type === 'password') {
      var toggle = FF.UI.iconButton('eye', t('showPassword', 'Show password'), function () {
        var show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        FF.ui.clear(toggle);
        toggle.appendChild(icon(show ? 'eye-slash' : 'eye'));
        toggle.setAttribute('aria-label', show ? t('hidePassword', 'Hide password') : t('showPassword', 'Show password'));
        toggle.setAttribute('aria-pressed', show ? 'true' : 'false');
      }, 'field__toggle icon-btn--ghost');
      toggle.setAttribute('aria-pressed', 'false');
      row.appendChild(toggle);
    }
    wrap.appendChild(row);
    if (opts.hint) wrap.appendChild(FF.ui.el('p', { class: 'field__hint' }, opts.hint));
    var errEl = FF.ui.el('p', { class: 'field__error', id: id + '-err', 'aria-live': 'polite' });
    wrap.appendChild(errEl);
    return {
      el: wrap, input: input,
      error: function (msg) {
        errEl.textContent = msg || '';
        input.setAttribute('aria-invalid', msg ? 'true' : 'false');
        wrap.classList.toggle('field--error', !!msg);
      }
    };
  }

  function formError(form) {
    var box = FF.ui.el('div', { class: 'auth__alert', role: 'alert', hidden: true });
    form.appendChild(box);
    return function (msg, kind) {
      FF.ui.clear(box);
      box.hidden = !msg;
      box.className = 'auth__alert' + (kind === 'ok' ? ' auth__alert--ok' : '');
      if (msg) {
        box.appendChild(icon(kind === 'ok' ? 'check-circle' : 'alert'));
        box.appendChild(FF.ui.span('', msg));
      }
    };
  }

  function submitButton(label, iconKey) {
    var b = FF.UI.button(label, { class: 'btn-lg btn-primary btn-block', icon: iconKey });
    b.type = 'submit';
    return b;
  }

  function setBusy(btn, on) {
    busy = on;
    btn.disabled = on;
    btn.classList.toggle('is-busy', on);
  }

  function googleButton(showError) {
    if (!FF.Auth.googleAvailable()) return null;
    var g = FF.ui.el('button', { type: 'button', class: 'btn btn-lg btn-block btn-google' });
    g.appendChild(FF.ui.el('span', { class: 'btn-google__g', html: GOOGLE_G }));
    g.appendChild(FF.ui.span('', t('continueGoogle', 'Continue with Google')));
    g.addEventListener('click', function () {
      if (busy) return;
      setBusy(g, true);
      FF.Auth.signInWithGoogle().then(function () { setBusy(g, false); }).catch(function (e) {
        setBusy(g, false);
        showError(e.message);
      });
    });
    return g;
  }

  function offlineNote() {
    if (navigator.onLine !== false || FF.Auth.isLocal()) return null;
    var n = FF.ui.el('div', { class: 'auth__alert', role: 'status' });
    n.appendChild(icon('wifi'));
    n.appendChild(FF.ui.span('', t('offlineSignIn', 'You are offline. Signing in needs the internet the first time; after that PlayMora works offline.')));
    return n;
  }

  function tabs() {
    var nav = FF.ui.el('div', { class: 'auth__tabs', role: 'tablist', 'aria-label': t('account', 'Account') });
    [['signin', t('signIn', 'Sign in')], ['signup', t('createAccount', 'Create account')]].forEach(function (pair) {
      var on = view === pair[0];
      var b = FF.ui.el('button', {
        type: 'button', class: 'auth__tab' + (on ? ' active' : ''), role: 'tab',
        'aria-selected': on ? 'true' : 'false', tabindex: on ? 0 : -1
      }, pair[1]);
      b.addEventListener('click', function () { FF.AuthUI.show(pair[0]); });
      nav.appendChild(b);
    });
    nav.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        FF.AuthUI.show(view === 'signin' ? 'signup' : 'signin');
        var active = root.querySelector('.auth__tab.active');
        if (active) active.focus();
      }
    });
    return nav;
  }

  // Play without an account (not shown to someone who is already a guest).
  function guestBlock() {
    if (FF.Auth.isGuest()) return null;
    var wrap = FF.ui.div('auth__guest');
    var b = FF.UI.button(t('playAsGuest', 'Play as guest'), { class: 'btn-lg btn-block btn-ghost auth__guest-btn', icon: 'user', onClick: function () {
      if (busy) return;
      FF.Auth.playAsGuest();
    } });
    wrap.appendChild(b);
    wrap.appendChild(FF.ui.el('p', { class: 'auth__fine' }, t('guestFine', 'No account needed. Your progress stays on this device until you create one.')));
    return wrap;
  }

  // Leave the sign-in screen: back to the game for guests, else to the home page.
  function cancelLink() {
    var bar = FF.ui.div('auth__top');
    if (FF.Auth.isGuest()) {
      bar.appendChild(FF.UI.button(t('backToGames', 'Back to the games'), { class: 'btn-ghost btn-sm auth__cancel', icon: 'arrow-left', onClick: function () {
        FF.AuthUI.hide();
        if (FF.App && FF.App._route) FF.App._route(FF.Auth.user());
      } }));
    } else {
      var a = FF.ui.el('a', { class: 'btn btn-ghost btn-sm auth__cancel', href: 'index.html' });
      a.appendChild(icon('arrow-left'));
      a.appendChild(FF.ui.span('', t('cancel', 'Cancel')));
      bar.appendChild(a);
    }
    return bar;
  }

  function localNote() {
    if (!FF.Auth.isLocal()) return null;
    return FF.ui.el('p', { class: 'auth__fine' }, t('localAccounts', 'Accounts are saved on this device only. They do not sync to other devices.'));
  }

  /* ---------------- Views ---------------- */
  function signInView(panel) {
    panel.appendChild(FF.ui.el('h1', { class: 'auth__title' }, t('welcomeBack', 'Welcome back')));
    panel.appendChild(FF.ui.el('p', { class: 'auth__sub' }, t('signInSub', 'Sign in to pick up where you left off.')));
    panel.appendChild(tabs());
    var form = FF.ui.el('form', { class: 'auth__form', novalidate: true });
    var who = field({ name: 'identifier', label: t('emailOrUsername', 'Email or username'), autocomplete: 'username', placeholder: 'you@example.com' });
    var pw = field({ name: 'password', type: 'password', label: t('password', 'Password'), autocomplete: 'current-password' });
    form.appendChild(who.el);
    form.appendChild(pw.el);
    var forgot = FF.ui.el('button', { type: 'button', class: 'link-btn auth__forgot' }, t('forgotPassword', 'Forgot password?'));
    forgot.addEventListener('click', function () { FF.AuthUI.show('reset', { identifier: who.input.value }); });
    form.appendChild(forgot);
    var showError = formError(form);
    var go = submitButton(t('signIn', 'Sign in'), 'arrow-right');
    form.appendChild(go);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return;
      who.error(''); pw.error(''); showError('');
      if (!who.input.value.trim()) { who.error(t('enterIdentifier', 'Enter your email or username.')); who.input.focus(); return; }
      if (!pw.input.value) { pw.error(t('enterPassword', 'Enter your password.')); pw.input.focus(); return; }
      setBusy(go, true);
      FF.Auth.signIn(who.input.value, pw.input.value).then(function () {
        setBusy(go, false);
      }).catch(function (err) {
        setBusy(go, false);
        showError(err.message || t('authFailed', 'Something went wrong. Please try again.'));
      });
    });
    panel.appendChild(form);
    var g = googleButton(showError);
    var guest = guestBlock();
    if (g || guest) panel.appendChild(FF.ui.div('auth__divider', FF.ui.span('', t('or', 'or'))));
    if (g) panel.appendChild(g);
    if (guest) panel.appendChild(guest);
    return who.input;
  }

  function signUpView(panel) {
    panel.appendChild(FF.ui.el('h1', { class: 'auth__title' }, t('joinPlayMora', 'Join PlayMora')));
    panel.appendChild(FF.ui.el('p', { class: 'auth__sub' }, FF.Auth.isGuest()
      ? t('signUpGuestSub', 'Free account. Everything you did as a guest comes with you, on every device.')
      : t('signUpSub', 'Free account. Your players, scores and favourites follow you to every device.')));
    panel.appendChild(tabs());
    var form = FF.ui.el('form', { class: 'auth__form', novalidate: true });
    var email = field({ name: 'email', type: 'email', label: t('email', 'Email'), autocomplete: 'email', placeholder: 'you@example.com' });
    var user = field({ name: 'username', label: t('username', 'Username'), autocomplete: 'username', maxlength: 20, placeholder: 'starplayer', hint: t('usernameHint', '3 to 20 letters, numbers, dots or underscores. Shown to other players.') });
    var pw = field({ name: 'newpassword', type: 'password', label: t('password', 'Password'), autocomplete: 'new-password', hint: t('passwordHint', 'At least 8 characters.') });
    form.appendChild(email.el);
    form.appendChild(user.el);
    form.appendChild(pw.el);

    var checkTimer = null;
    user.input.addEventListener('input', function () {
      user.error('');
      clearTimeout(checkTimer);
      var v = user.input.value;
      if (!v) return;
      checkTimer = setTimeout(function () {
        var problem = FF.Auth.usernameError(v);
        if (problem) { user.error(problem); return; }
        FF.Auth.usernameAvailable(v).then(function (ok) {
          if (user.input.value === v && !ok) user.error(t('usernameTaken', 'That username is taken. Try another.'));
        });
      }, 400);
    });

    var showError = formError(form);
    var go = submitButton(t('createAccount', 'Create account'), 'arrow-right');
    form.appendChild(go);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return;
      showError('');
      var problems = [
        [email, FF.Auth.emailError(email.input.value)],
        [user, FF.Auth.usernameError(user.input.value)],
        [pw, FF.Auth.passwordError(pw.input.value)]
      ];
      var first = null;
      problems.forEach(function (p) { p[0].error(p[1]); if (p[1] && !first) first = p[0]; });
      if (first) { first.input.focus(); return; }
      setBusy(go, true);
      FF.AuthUI._justJoined = true;
      FF.Auth.signUp({
        email: email.input.value, username: user.input.value, password: pw.input.value,
        displayName: user.input.value, avatar: FF.Avatars.random()
      }).then(function () {
        setBusy(go, false);
      }).catch(function (err) {
        FF.AuthUI._justJoined = false;
        setBusy(go, false);
        if (err.code === 'auth/username-taken') { user.error(err.message); user.input.focus(); }
        else if (err.code === 'auth/email-already-in-use') { email.error(err.message); email.input.focus(); }
        else showError(err.message);
      });
    });
    panel.appendChild(form);
    var g = googleButton(showError);
    var guest = guestBlock();
    if (g || guest) panel.appendChild(FF.ui.div('auth__divider', FF.ui.span('', t('or', 'or'))));
    if (g) panel.appendChild(g);
    if (guest) panel.appendChild(guest);
    var fine = FF.ui.el('p', { class: 'auth__fine' });
    fine.appendChild(document.createTextNode(t('agreeLead', 'By creating an account you agree to how we handle your data in our ')));
    fine.appendChild(FF.ui.el('a', { href: 'privacy.html', target: '_blank', rel: 'noopener' }, t('privacyNotice', 'privacy notice')));
    fine.appendChild(document.createTextNode('.'));
    panel.appendChild(fine);
    return email.input;
  }

  function resetView(panel, opts) {
    panel.appendChild(FF.ui.el('h1', { class: 'auth__title' }, t('resetTitle2', 'Reset your password')));
    panel.appendChild(FF.ui.el('p', { class: 'auth__sub' }, t('resetSub', 'Enter your email or username and we will email you a link to choose a new password.')));
    var form = FF.ui.el('form', { class: 'auth__form', novalidate: true });
    var who = field({ name: 'reset', label: t('emailOrUsername', 'Email or username'), autocomplete: 'username', value: (opts && opts.identifier) || '' });
    form.appendChild(who.el);
    var showError = formError(form);
    var go = submitButton(t('sendLink', 'Send reset link'), 'arrow-right');
    form.appendChild(go);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return;
      if (!who.input.value.trim()) { who.error(t('enterIdentifier', 'Enter your email or username.')); return; }
      setBusy(go, true);
      FF.Auth.resetPassword(who.input.value).then(function () {
        setBusy(go, false);
        showError(t('resetSent', 'If an account matches, a reset link is on its way. Check your inbox and spam folder.'), 'ok');
      }).catch(function (err) {
        setBusy(go, false);
        showError(err.message);
      });
    });
    panel.appendChild(form);
    var back = FF.UI.button(t('backToSignIn', 'Back to sign in'), { class: 'btn-ghost btn-block', icon: 'arrow-left', onClick: function () { FF.AuthUI.show('signin'); } });
    panel.appendChild(back);
    return who.input;
  }

  // After signing up (or a first Google sign-in): character, name, username.
  function personalizeView(panel) {
    var s = FF.Auth.user() || {};
    var needsUsername = FF.Auth.needsProfile();
    var chosen = s.avatar || FF.Avatars.random();

    panel.appendChild(FF.ui.el('h1', { class: 'auth__title' }, t('makeItYours', 'Make it yours')));
    panel.appendChild(FF.ui.el('p', { class: 'auth__sub' }, t('makeItYoursSub', 'Pick a character and the name other players will see.')));

    var preview = FF.ui.div('auth__avatar-preview');
    var big = FF.Avatars.img(chosen, 'auth__avatar-big');
    preview.appendChild(big);
    panel.appendChild(preview);

    var grid = FF.ui.el('div', { class: 'avatar-grid avatar-grid--compact', role: 'radiogroup', 'aria-label': t('characters', 'Characters') });
    FF.Avatars.all().forEach(function (a) {
      var on = a.id === chosen;
      var b = FF.ui.el('button', {
        type: 'button', class: 'avatar-btn' + (on ? ' active' : ''), role: 'radio',
        'aria-checked': on ? 'true' : 'false', 'aria-label': a.name, title: a.name, dataset: { avatar: a.id }
      });
      b.appendChild(FF.Avatars.img(a.id, 'avatar-btn__img'));
      b.addEventListener('click', function () {
        chosen = a.id;
        big.src = FF.Avatars.url(a.id);
        FF.ui.$$('.avatar-btn', grid).forEach(function (x) {
          var sel = x.dataset.avatar === a.id;
          x.classList.toggle('active', sel);
          x.setAttribute('aria-checked', sel ? 'true' : 'false');
        });
      });
      grid.appendChild(b);
    });
    panel.appendChild(grid);

    var form = FF.ui.el('form', { class: 'auth__form', novalidate: true });
    var name = field({ name: 'displayname', label: t('displayName', 'Display name'), autocomplete: 'nickname', maxlength: 24, value: s.displayName || '', autocapitalize: 'words' });
    form.appendChild(name.el);
    var user = null;
    if (needsUsername) {
      var suggested = String((s.email || '').split('@')[0] || '').toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 20);
      user = field({ name: 'username2', label: t('username', 'Username'), maxlength: 20, value: suggested, hint: t('usernameHint', '3 to 20 letters, numbers, dots or underscores. Shown to other players.') });
      form.appendChild(user.el);
    }
    var showError = formError(form);
    var go = submitButton(t('letsPlay', 'Let’s play'), 'play');
    form.appendChild(go);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return;
      showError('');
      if (!name.input.value.trim()) { name.error(t('enterName', 'Enter a name.')); name.input.focus(); return; }
      if (user) {
        var problem = FF.Auth.usernameError(user.input.value);
        user.error(problem);
        if (problem) { user.input.focus(); return; }
      }
      setBusy(go, true);
      var done = function () { setBusy(go, false); FF.AuthUI._justJoined = false; FF.AuthUI.hide(); if (FF.App && FF.App.start) FF.App.start(); };
      var p = needsUsername
        ? FF.Auth.completeProfile({ username: user.input.value, displayName: name.input.value, avatar: chosen })
        : FF.Auth.updateProfile({ displayName: name.input.value, avatar: chosen });
      p.then(done).catch(function (err) {
        setBusy(go, false);
        if (user && err.code === 'auth/username-taken') user.error(err.message);
        else showError(err.message);
      });
    });
    panel.appendChild(form);
    return name.input;
  }

  /* ---------------- Public ---------------- */
  FF.AuthUI = {
    _justJoined: false,
    wordmark: wordmark,

    isOpen: function () { return !!(root && root.parentNode); },
    current: function () { return this.isOpen() ? view : null; },

    show: function (which, opts) {
      view = which || 'signin';
      busy = false;
      if (!root) {
        root = FF.ui.el('div', { class: 'auth', id: 'auth-root' });
      }
      FF.ui.clear(root);
      document.body.classList.add('auth-open');

      var art = FF.ui.div('auth__art');
      var artInner = FF.ui.div('auth__art-inner');
      artInner.appendChild(brandLockup());
      var cast = FF.ui.div('auth__cast');
      ['nia', 'fox', 'bolt', 'kenji', 'unicorn', 'amara', 'panda'].forEach(function (id, i) {
        var a = FF.Avatars.img(id, 'auth__cast-ava');
        a.style.setProperty('--i', i);
        cast.appendChild(a);
      });
      artInner.appendChild(cast);
      art.appendChild(artInner);
      root.appendChild(art);

      var panel = FF.ui.el('main', { class: 'auth__panel', id: 'auth-panel' });
      // Brand links back to the playmora.com landing page.
      var mobileBrand = FF.ui.el('a', { class: 'auth__mobile-brand', href: 'index.html', 'aria-label': 'PlayMora home' });
      mobileBrand.appendChild(FF.ui.el('img', { src: 'assets/brand/mark-256.webp', alt: '', width: 40, height: 40 }));
      mobileBrand.appendChild(wordmark());
      panel.appendChild(mobileBrand);
      if (view !== 'personalize') panel.appendChild(cancelLink());
      var off = offlineNote();
      if (off) panel.appendChild(off);
      var firstInput;
      if (view === 'signup') firstInput = signUpView(panel);
      else if (view === 'reset') firstInput = resetView(panel, opts);
      else if (view === 'personalize') firstInput = personalizeView(panel);
      else firstInput = signInView(panel);
      var ln = localNote();
      if (ln) panel.appendChild(ln);
      root.appendChild(panel);

      if (!root.parentNode) document.body.appendChild(root);
      document.title = (view === 'signup' ? t('createAccount', 'Create account') : view === 'personalize' ? t('makeItYours', 'Make it yours') : t('signIn', 'Sign in')) + ' · PlayMora';
      if (firstInput && window.innerWidth >= 768) setTimeout(function () { try { firstInput.focus(); } catch (e) {} }, 30);
    },

    hide: function () {
      if (root && root.parentNode) root.parentNode.removeChild(root);
      document.body.classList.remove('auth-open');
    }
  };
})();
