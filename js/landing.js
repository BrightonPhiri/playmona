/* ============================================================
   PLAYMORA — landing.js
   The playmora.com home page: signed-in buttons, rotating hero
   pictures, the live player count and the install banner.
   ============================================================ */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function store(key, val) {
    try {
      if (val === undefined) return JSON.parse(localStorage.getItem('playmora:' + key) || 'null');
      localStorage.setItem('playmora:' + key, JSON.stringify(val));
    } catch (e) { return null; }
  }

  var year = $('#year');
  if (year) year.textContent = new Date().getFullYear();

  /* ---------- Already signed in (or a guest) on this device ---------- */
  if (store('session')) {
    document.documentElement.classList.add('is-signed-in');
    $$('.js-cta').forEach(function (a) {
      a.href = 'play.html';
      var label = a.textContent.trim();
      if (label === 'Play now' || label === 'Get started') a.textContent = 'Open PlayMora';
      else if (/Start playing/.test(label)) a.firstChild.textContent = 'Continue playing ';
      else a.textContent = 'Go to my profile';
    });
  }

  /* ---------- Rotating hero pictures ---------- */
  (function slideshow() {
    var slides = $$('.hero__slide');
    if (slides.length < 2) return;
    var small = window.matchMedia('(max-width: 820px)').matches;
    slides.forEach(function (el) {
      if (el.getAttribute('data-pos')) el.style.setProperty('--pos', el.getAttribute('data-pos'));
      if (el.getAttribute('data-pos-sm')) el.style.setProperty('--pos-sm', el.getAttribute('data-pos-sm'));
    });
    // Load the other pictures only after the page has finished loading.
    function loadImage(el) {
      if (el._loaded) return;
      el._loaded = true;
      el.style.backgroundImage = 'url("' + el.getAttribute('data-img') + (small ? '-sm' : '') + '.webp")';
    }
    window.addEventListener('load', function () { slides.forEach(loadImage); });

    var current = 0;
    var timer = null;
    var paused = reduceMotion;          // no automatic changes when motion is reduced
    var controls = $('.hero__controls');
    var dotsBox = $('.hero__dots');
    var pauseBtn = $('.hero__pause');
    var dots = slides.map(function (el, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'hero__dot';
      b.setAttribute('aria-label', 'Picture ' + (i + 1) + ' of ' + slides.length);
      b.addEventListener('click', function () { show(i); restart(); });
      dotsBox.appendChild(b);
      return b;
    });
    controls.hidden = false;

    function show(i) {
      i = (i + slides.length) % slides.length;
      loadImage(slides[i]);
      slides[current].classList.remove('is-on');
      current = i;
      // Restart the slow zoom on the picture coming in.
      var el = slides[current];
      el.classList.remove('is-on');
      void el.offsetWidth;
      el.classList.add('is-on');
      dots.forEach(function (d, j) { d.setAttribute('aria-current', j === current ? 'true' : 'false'); });
    }
    function restart() {
      clearInterval(timer);
      if (!paused) timer = setInterval(function () { if (!document.hidden) show(current + 1); }, 7000);
    }
    function setPaused(on) {
      paused = on;
      pauseBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      pauseBtn.setAttribute('aria-label', on ? 'Play background pictures' : 'Pause background pictures');
      restart();
    }
    pauseBtn.addEventListener('click', function () { setPaused(!paused); });
    dots[0].setAttribute('aria-current', 'true');
    setPaused(paused);
  })();

  /* ---------- Live player count (Firebase, read-only, no sign-in) ---------- */
  (function playerCount() {
    var el = $('#player-count');
    if (!el) return;
    function render(n) {
      n = Math.max(1, Number(n) || 1);
      var text = n >= 1e6 ? (Math.floor(n / 1e5) / 10) + 'M' : n >= 1e4 ? Math.floor(n / 1e3) + 'K' : n >= 1e3 ? (Math.floor(n / 100) / 10) + 'K' : String(n);
      el.textContent = text.replace('.0', '') + '+';
    }
    render(store('playerCount'));
    var cfg = window.FF && window.FF.FirebaseConfig;
    if (!cfg || !cfg.databaseURL || !window.fetch) return;
    fetch(cfg.databaseURL.replace(/\/$/, '') + '/stats/players.json')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (n) { if (typeof n === 'number') { store('playerCount', n); render(n); } })
      .catch(function () {});
  })();

  /* ---------- Install banner ---------- */
  (function installBanner() {
    var box = $('#install');
    if (!box || !window.FF || !FF.Install) return;
    var shown = false;
    function update() {
      var kind = FF.Install.kind();
      if (!kind || FF.Install.dismissed()) { hide(); return; }
      $$('[data-prompt]', box).forEach(function (n) { n.hidden = kind !== 'prompt'; });
      $$('[data-ios]', box).forEach(function (n) { n.hidden = kind !== 'ios'; });
      if (shown) return;
      shown = true;
      box.hidden = false;
      document.body.classList.add('has-install');
      setTimeout(function () { box.classList.add('is-shown'); }, 30);
    }
    function hide() {
      if (!shown) return;
      shown = false;
      box.classList.remove('is-shown');
      document.body.classList.remove('has-install');
      setTimeout(function () { box.hidden = true; }, 450);
    }
    $('.install__go', box).addEventListener('click', function () {
      FF.Install.prompt().then(function (outcome) { if (outcome !== 'accepted') FF.Install.dismiss(); update(); });
    });
    $('.install__close', box).addEventListener('click', function () { FF.Install.dismiss(); hide(); });
    FF.Install.onChange(update);
    // Give the page a moment before sliding the banner in.
    setTimeout(update, 1500);
  })();
})();
