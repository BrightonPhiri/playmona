/* ============================================================
   PLAYMONA — games/logoRush.js
   Logo Rush: see a brand's symbol, name the brand.
   The symbol never shows the name; the full logo, the name and a
   fact appear at the reveal.

   - Rules: js/logorush/rules.js (FF.LogoRushRules), shared with the referee.
   - Look: GeoSpin's arcade frame, letter tiles and answer list
     (FF.GeoSpinGame), re-coloured by the .lgo tokens in css/games.css.
   - Answer styles: letter tiles (standard), pick a name, type it
     (Expert) and, for a group on one device, say it out loud: the
     host taps whoever said it first.
   - Solo, take turns and everyone together on one device; daily and
     friend challenges play the standard settings on a shared deal.
   - Online rooms: the server's referee (js/logorush/referee.js) deals,
     checks and scores; this phone shows its view (FF.LogoRushClient).
   Classic script, ES5.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var R = FF.LogoRushRules;
  var SETUP_KEY = 'logoRush:setup';
  var SEEN_KEY = 'logoRushSeen';
  var SEEN_MAX = 300;
  var LOAD_WAIT_MS = 3000;      // the clock starts once the symbol shows, or after this
  var NO_CLOCK_ZOOM_S = 10;     // Zoom out with no clock: pull back over this long
  var MIN_TILE = 140;
  var MIN_GROUP = 10;           // a category button needs this many playable logos
  var AUTO_SCORES_MS = 90000;
  var NUDGE_MS = 8000;

  /* Category buttons. Small categories share one, so no button deals the same few logos. */
  var GROUPS = [
    { id: 'tech', cats: ['tech'], name: 'Tech & apps' },
    { id: 'social', cats: ['social'], name: 'Social & media' },
    { id: 'foodshops', cats: ['food', 'shops'], name: 'Food, drink & shops' },
    { id: 'fashion', cats: ['fashion'], name: 'Fashion & sportswear' },
    { id: 'cars', cats: ['cars'], name: 'Cars & motoring' },
    { id: 'fun', cats: ['fun'], name: 'Entertainment & games' },
    { id: 'travel', cats: ['travel'], name: 'Travel & airlines' },
    { id: 'money', cats: ['money'], name: 'Banks & money' },
    { id: 'football', cats: ['football'], name: 'Football clubs' },
    { id: 'africa', cats: ['africa'], name: 'African brands' }
  ];

  function G() { return FF.GeoSpinGame; }
  function t(key, fallback, vars) { return FF.t ? FF.t(key, fallback, vars) : String(fallback); }
  function store() { return FF.Storage || { get: function (k, d) { return d; }, set: function () {} }; }
  function rand0() { return FF._rand ? FF._rand() : Math.random(); }
  function reduceMotion() {
    try {
      if (document.documentElement.getAttribute('data-reduce') === '1') return true;
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { return false; }
  }
  function animationsOn() { return !reduceMotion() && (!FF.Settings || !FF.Settings.get || FF.Settings.get('animations') !== false); }
  function racingRoom(api) { return !!(api.config.room && FF.Room && FF.Room.current()); }
  function stillShown(api) { return !!(api.shell.root && document.body && document.body.contains(api.shell.root)); }
  function nameOf(id) { var b = R.brand(id); return b ? b.name : id; }

  function levelName(l) { return l === 'easy' ? t('easy', 'Easy') : l === 'hard' ? t('hard', 'Hard') : t('normal', 'Normal'); }
  function modeName(m) {
    return m === 'choice' ? t('lgoModeChoice', 'Pick the name') : m === 'type' ? t('lgoModeType', 'Type it (Expert)')
      : m === 'say' ? t('lgoModeSay', 'Say it out loud') : t('lgoModeTiles', 'Letter tiles');
  }
  function modeMeta(m) {
    return m === 'choice' ? t('lgoModeChoiceMeta', 'Choose the brand from a list')
      : m === 'type' ? t('lgoModeTypeMeta', 'No tiles: type the name yourself, +50')
      : m === 'say' ? t('lgoModeSayMeta', 'Everyone shouts; tap who said it first')
      : t('lgoModeTilesMeta', 'Spell the name with letter tiles');
  }
  function timeName(x) {
    return x === 'quick' ? t('lgoQuick', 'Quick') : x === 'relaxed' ? t('lgoRelaxed', 'Relaxed') : x === 'none' ? t('lgoNoLimit', 'No limit') : t('normal', 'Normal');
  }
  function twistName(x) {
    return x === 'zoom' ? t('lgoZoom', 'Zoom out') : x === 'flash' ? t('lgoFlash', 'Flash') : x === 'grey' ? t('lgoGrey', 'Colourless') : t('lgoNoTwist', 'No twist');
  }
  function twistMeta(x) {
    return x === 'zoom' ? t('lgoZoomMeta', 'Starts close up and pulls back. Early answers score double speed points')
      : x === 'flash' ? t('lgoFlashMeta', 'The logo hides after 1.5 seconds, +25')
      : x === 'grey' ? t('lgoGreyMeta', 'No colours to help you, +25')
      : t('lgoNoTwistMeta', 'The logo as it is');
  }
  function catName(id) {
    var c = (FF.data.logos.categories || []).filter(function (x) { return x.id === id; })[0];
    return t('lgoCat_' + id, c ? c.name : id);
  }
  function catsName(cats) {
    if (cats === 'mixed' || !cats || !cats.length) return t('lgoMixed', 'Mixed');
    var names = GROUPS.filter(function (g) { return g.cats.every(function (c) { return cats.indexOf(c) !== -1; }); }).map(function (g) { return t('lgoGroup_' + g.id, g.name); });
    return names.length > 2 ? t('lgoNCats', '{n} categories', { n: names.length }) : names.join(' & ');
  }
  function summary(s) {
    var c = R.sanitize(s);
    var secs = R.secondsFor(c);
    var bits = [levelName(c.level), modeName(c.mode), catsName(c.cats), secs ? t('lgoSecs', '{n} s a logo', { n: secs }) : timeName('none')];
    if (c.twist !== 'none') bits.push(twistName(c.twist));
    return bits.join(' · ');
  }

  /* How many logos can be dealt from these categories (before the level narrows them). */
  function groupCount(cats) {
    return FF.data.logos.brands.filter(function (b) {
      return (!b.named || b.crop) && (cats.indexOf(b.cat) !== -1 || (b.africa && cats.indexOf('africa') !== -1));
    }).length;
  }
  function shownGroups() { return GROUPS.filter(function (g) { return groupCount(g.cats) >= MIN_GROUP; }); }

  /* ================= the frame ================= */

  /* GeoSpin's arcade screen with a logo tile where the globe was. */
  function frame(api, opts) {
    opts = opts || {};
    var root = api.shell.root;
    FF.ui.clear(root);
    if (api.shell.el) api.shell.el.classList.add('gs-shell');
    var gs = FF.ui.div('gs lgo' + (opts.className ? ' ' + opts.className : ''));
    var top = FF.ui.div('gs-top');
    var brand = FF.ui.div('gs-brand');
    brand.appendChild(FF.ui.span('gs-brand__geo', 'Logo'));
    brand.appendChild(FF.ui.span('gs-brand__spin', 'Rush'));
    top.appendChild(brand);
    var chips = FF.ui.div('gs-chips');
    top.appendChild(chips);
    top.appendChild(G().soundButtons(api));
    gs.appendChild(top);

    var main = FF.ui.div('gs-main');
    var side = FF.ui.div('gs-side');
    var stage = FF.ui.div('gs-stage');
    var tile = logoTile();
    stage.appendChild(tile.el);
    var panel = FF.ui.div('gs-panel');
    main.appendChild(side);
    main.appendChild(stage);
    main.appendChild(panel);
    gs.appendChild(main);
    root.appendChild(gs);
    var out = { root: gs, top: top, chips: chips, side: side, stage: stage, panel: panel, tile: tile };
    out.fit = function () { fitPhone(out); };
    function onResize() { if (!gs.isConnected) { window.removeEventListener('resize', onResize); return; } out.fit(); }
    window.addEventListener('resize', onResize);
    return out;
  }

  /* Phones: the logo and the answers share one screen with nothing to scroll. The tile takes
     whatever height the top bar and the answer panel leave (never under MIN_TILE). */
  function fitPhone(f) {
    var host = f.tile.el;
    if (!f.root.isConnected) return;
    if (window.innerWidth >= 900 || !f.root.classList.contains('gs--play') || f.root.classList.contains('is-recap')) { host.style.width = ''; return; }
    var cs = window.getComputedStyle(f.root);
    var scroller = f.root.closest ? f.root.closest('.game-shell__content') : null;
    var top = f.root.getBoundingClientRect().top + (scroller ? scroller.scrollTop : 0);
    var extra = f.stage.offsetHeight - host.offsetHeight;
    var gap = parseFloat(window.getComputedStyle(f.root.querySelector('.gs-main')).rowGap) || 0;
    var used = top + (parseFloat(cs.paddingTop) || 0) + f.top.offsetHeight + (parseFloat(window.getComputedStyle(f.top).marginBottom) || 0) +
      extra + gap + f.panel.offsetHeight + (parseFloat(cs.paddingBottom) || 0);
    var size = Math.floor(Math.min(f.stage.clientWidth, 340, Math.max(MIN_TILE, window.innerHeight - used)));
    host.style.width = size + 'px';
    if (scroller && !f.root.classList.contains('is-revealed')) scroller.scrollTop = 0;
  }

  /* ================= the logo tile ================= */

  /* A glossy tile with the brand's symbol; at the reveal the full logo fades in over it.
     Twists: zoom (scale from 4x at a point back to 1x), flash (hide after a moment), grey. */
  function logoTile() {
    var el = FF.ui.div('lgo-tile is-empty');
    var zoom = FF.ui.div('lgo-zoom');
    var sym = FF.ui.el('img', { class: 'lgo-sym', alt: '', draggable: 'false' });
    var full = FF.ui.el('img', { class: 'lgo-full', alt: '', draggable: 'false' });
    zoom.appendChild(sym);
    el.appendChild(zoom);
    el.appendChild(full);
    var gone = FF.ui.span('lgo-gone', '?');
    gone.setAttribute('aria-hidden', 'true');
    el.appendChild(gone);
    var shine = FF.ui.span('lgo-shine');
    shine.setAttribute('aria-hidden', 'true');
    el.appendChild(shine);
    var token = 0, flashTimer = null;

    function clearTwists() {
      if (flashTimer) { clearTimeout(flashTimer); flashTimer = null; }
      el.classList.remove('is-flashed', 'is-grey', 'is-zooming');
      zoom.style.transition = '';
      zoom.style.transform = '';
    }
    return {
      el: el,
      /* Show a brand's symbol. Resolves true once it has loaded (or after LOAD_WAIT_MS),
         false if the file failed. */
      show: function (id, twist, z) {
        var my = ++token;
        clearTwists();
        el.classList.remove('is-empty', 'is-revealed', 'is-good', 'is-bad');
        el.classList.add('is-loading');
        full.removeAttribute('src');
        if (twist === 'grey') el.classList.add('is-grey');
        if (twist === 'zoom' && z) {
          zoom.style.transformOrigin = z.x + '% ' + z.y + '%';
          zoom.style.transform = 'scale(4)';
          el.classList.add('is-zooming');
        }
        el.setAttribute('role', 'img');
        el.setAttribute('aria-label', t('lgoWhichLogo', 'A brand’s logo'));
        return new Promise(function (resolve) {
          var done = false;
          function end(ok) {
            if (done) return;
            done = true;
            if (my === token) el.classList.remove('is-loading');
            resolve(my === token ? ok : null);
          }
          var timer = setTimeout(function () { end(true); }, LOAD_WAIT_MS);
          sym.onload = function () { clearTimeout(timer); end(true); };
          sym.onerror = function () { clearTimeout(timer); end(false); };
          var src = R.logoPath(id, false);
          if (!src) { clearTimeout(timer); end(false); return; }
          sym.src = src;
          if (sym.complete && sym.naturalWidth) { clearTimeout(timer); end(true); }
        });
      },
      /* Zoom out: p = share of the round left (1 = just shown, 0 = time up). */
      zoomTo: function (p) {
        if (!el.classList.contains('is-zooming')) return;
        zoom.style.transition = 'transform 0.25s linear';
        zoom.style.transform = 'scale(' + (1 + 3 * Math.max(0, Math.min(1, p))).toFixed(3) + ')';
      },
      zoomOver: function (secs) {
        if (!el.classList.contains('is-zooming')) return;
        zoom.style.transition = 'transform ' + secs + 's linear';
        void zoom.offsetWidth;
        zoom.style.transform = 'scale(1)';
      },
      flash: function (ms) {
        if (flashTimer) clearTimeout(flashTimer);
        flashTimer = setTimeout(function () { flashTimer = null; el.classList.add('is-flashed'); }, Math.max(0, ms));
      },
      /* The full logo, in colour and whole. */
      reveal: function (id, state) {
        token++;
        clearTwists();
        el.classList.remove('is-loading');
        el.classList.add('is-revealed', state === 'good' ? 'is-good' : 'is-bad');
        var src = R.logoPath(id, true);
        if (src) full.src = src;
        el.setAttribute('aria-label', t('lgoLogoOf', 'The {b} logo', { b: nameOf(id) }));
      },
      clear: function () {
        token++;
        clearTwists();
        sym.removeAttribute('src');
        full.removeAttribute('src');
        el.classList.remove('is-loading', 'is-revealed', 'is-good', 'is-bad');
        el.classList.add('is-empty');
      },
      stop: clearTwists
    };
  }

  function preload(id) {
    [R.logoPath(id, false), R.logoPath(id, true)].forEach(function (src) {
      if (!src) return;
      var img = new Image();
      img.src = src;
    });
  }

  /* ================= answer boards ================= */

  /* Type it (Expert): a text box and Check. The same face as GeoSpin's boards. */
  function typeBoard(api, round, opts) {
    var el = FF.ui.div('gs-board lgo-type is-waiting');
    var input = FF.ui.el('input', {
      type: 'text', class: 'lgo-type__input', maxlength: '60', autocomplete: 'off', autocapitalize: 'words',
      spellcheck: 'false', enterkeyhint: 'done', 'aria-label': t('lgoTypeLabel', 'The brand’s name'),
      placeholder: t('lgoTypePh', 'Type the brand…')
    });
    var tools = FF.ui.div('gs-actions');
    var check = FF.ui.el('button', { type: 'button', class: 'gs-btn gs-btn--go' });
    check.appendChild(G().glyph('check'));
    check.appendChild(FF.ui.span('', t('lgoCheck', 'Check')));
    tools.appendChild(check);
    el.appendChild(input);
    el.appendChild(tools);
    var open = false, locked = false;
    function draw() {
      input.disabled = locked || !open;
      check.disabled = locked || !open || !input.value.trim();
      check.classList.toggle('is-ready', open && !locked && !!input.value.trim());
    }
    function submit() {
      if (locked || !open) return;
      if (!input.value.trim()) { input.classList.remove('is-shake'); void input.offsetWidth; input.classList.add('is-shake'); return; }
      if (opts.onSubmit) opts.onSubmit(input.value.trim());
    }
    input.addEventListener('input', draw);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
      e.stopPropagation();
    });
    check.addEventListener('click', submit);
    draw();
    return {
      el: el,
      open: function () { open = true; el.classList.remove('is-waiting'); draw(); try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); } },
      lock: function () { locked = true; draw(); },
      finish: function (correct) {
        locked = true; open = true;
        el.classList.remove('is-waiting');
        draw();
        input.classList.add(correct ? 'is-right' : 'is-wrong');
        el.classList.add(correct ? 'is-correct' : 'is-missed');
      },
      destroy: function () {}
    };
  }

  /* Say it out loud: everyone shouts; "Got it!" (or the clock) asks who said it first. */
  function sayBoard(api, players, opts) {
    var el = FF.ui.div('gs-board lgo-say is-waiting');
    var note = FF.ui.el('p', { class: 'lgo-say__note' }, t('lgoSayNote', 'Shout the brand’s name! First right answer wins the points.'));
    el.appendChild(note);
    var got = FF.ui.el('button', { type: 'button', class: 'gs-btn gs-btn--go gs-btn--big lgo-say__got' });
    got.appendChild(G().glyph('check'));
    got.appendChild(FF.ui.span('', t('lgoGotIt', 'Someone got it!')));
    el.appendChild(got);
    var pick = FF.ui.el('div', { class: 'lgo-say__pick', role: 'group', 'aria-label': t('lgoWhoFirst', 'Who said it first?') });
    el.appendChild(pick);
    var open = false, locked = false, asking = false;

    function ask() {
      if (locked || asking) return;
      asking = true;
      el.classList.add('is-asking');
      FF.ui.clear(pick);
      pick.appendChild(FF.ui.el('h3', { class: 'gs-h lgo-say__q' }, t('lgoWhoFirst', 'Who said it first?')));
      var grid = FF.ui.div('lgo-say__grid');
      players.forEach(function (p) {
        var b = FF.ui.el('button', { type: 'button', class: 'lgo-say__who' });
        var ava = FF.ui.span('gs-row__ava');
        ava.appendChild(FF.Players.avatarEl(p, ''));
        b.appendChild(ava);
        b.appendChild(FF.ui.span('lgo-say__name', p.name || t('playerLabel', 'Player')));
        b.addEventListener('click', function () { choose(p.id); });
        grid.appendChild(b);
      });
      var none = FF.ui.el('button', { type: 'button', class: 'lgo-say__who lgo-say__who--none' });
      none.appendChild(FF.ui.span('lgo-say__name', t('lgoNobody', 'Nobody')));
      none.addEventListener('click', function () { choose(null); });
      grid.appendChild(none);
      pick.appendChild(grid);
      if (opts.onAsk) opts.onAsk();
      if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(grid);
    }
    function choose(id) {
      if (locked) return;
      locked = true;
      api.audio.play('tap');
      if (opts.onAward) opts.onAward(id);
    }
    got.addEventListener('click', function () { if (open && !locked) { api.audio.play('select'); ask(); } });
    return {
      el: el,
      ask: ask,
      open: function () { open = true; el.classList.remove('is-waiting'); },
      lock: function () { locked = true; },
      finish: function (correct) {
        locked = true;
        el.classList.add(correct ? 'is-correct' : 'is-missed');
        Array.prototype.forEach.call(el.querySelectorAll('button'), function (b) { b.disabled = true; });
      },
      destroy: function () {}
    };
  }

  /* ================= the reveal card ================= */

  function revealCard(info) {
    var card = FF.ui.div('gs-reveal gs-reveal--' + info.state);
    var stamp = FF.ui.div('gs-stamp');
    stamp.textContent = info.stampText || (info.state === 'good' ? t('gsCorrect', 'Correct!') : info.state === 'late' ? t('gsTimesUp', 'Time’s up!') : t('gsIncorrect', 'Incorrect'));
    card.appendChild(stamp);
    var b = R.brand(info.id) || { name: info.name, cat: '' };
    var head = FF.ui.div('gs-reveal__head');
    var mark = FF.ui.span('lgo-reveal__logo');
    var src = R.logoPath(info.id, false);
    if (src) mark.appendChild(FF.ui.el('img', { src: src, alt: '' }));
    head.appendChild(mark);
    var who = FF.ui.div('gs-reveal__who');
    who.appendChild(FF.ui.el('p', { class: 'gs-reveal__name' }, info.name || b.name));
    if (b.cat) who.appendChild(FF.ui.el('p', { class: 'gs-reveal__meta' }, catName(b.cat) + (b.africa && b.cat !== 'africa' ? ' · ' + t('lgoAfrican', 'African brand') : '')));
    head.appendChild(who);
    var pts = FF.ui.div('gs-reveal__pts');
    var num = FF.ui.span('gs-reveal__num', '0');
    pts.appendChild(FF.ui.span('gs-reveal__plus', '+'));
    pts.appendChild(num);
    pts.appendChild(FF.ui.span('gs-reveal__unit', t('gsPts', 'pts')));
    head.appendChild(pts);
    card.appendChild(head);
    if (info.said) card.appendChild(FF.ui.el('p', { class: 'gs-reveal__said' }, info.said));
    if (info.breakdown && info.points > 0) {
      var br = info.breakdown;
      var bits = [t('lgoBase', '{n} for the brand', { n: br.base })];
      if (br.speed) bits.push(t('gsSpeed', '+{n} speed', { n: br.speed }));
      if (br.bonus) bits.push(t('lgoBonus', '+{n} bonus', { n: br.bonus }));
      card.appendChild(FF.ui.el('p', { class: 'gs-reveal__break' }, bits.join(' · ')));
    }
    if (b.fact) {
      var f = FF.ui.div('gs-fact');
      f.appendChild(G().glyph('bulb'));
      f.appendChild(FF.ui.el('p', {}, b.fact));
      card.appendChild(f);
    }
    setTimeout(function () { G().countUp(num, 0, info.points || 0, 700); }, 250);
    return card;
  }

  /* What the player gave, when it was wrong. */
  function saidLine(text, res, picked) {
    if (!text) return '';
    if (picked) return res && res.near ? t('lgoYouPicked', 'You picked {x}.', { x: res.near }) : '';
    if (res && res.near && FF.AnswerMatch.normalise(text) === FF.AnswerMatch.normalise(res.near)) return t('lgoOtherBrand', '{o} is a different brand.', { o: res.near });
    if (res && res.near) return t('lgoTooNear', 'You gave “{x}”, which is closer to {o}.', { x: text, o: res.near });
    return t('lgoYouGave', 'You gave “{x}”.', { x: text });
  }

  /* ================= setup ================= */

  function setupScreen(api, playMode, onGo) {
    api.shell.hideTimer();
    if (FF.GameLength && FF.GameLength.pause) FF.GameLength.pause();
    var saved = R.sanitize(store().get(SETUP_KEY, null) || R.STANDARD);
    var everyone = playMode === 'everyone';
    var modes = everyone ? ['say'] : ['tiles', 'choice', 'type'];
    var mode = everyone ? 'say' : (saved.mode === 'say' ? 'tiles' : saved.mode);
    var level = saved.level, time = saved.time, twist = saved.twist;
    var groups = shownGroups();
    var on = {};
    if (saved.cats !== 'mixed') groups.forEach(function (g) { on[g.id] = g.cats.every(function (c) { return saved.cats.indexOf(c) !== -1; }); });
    var f = frame(api, { className: 'gs--setup' });
    f.tile.show('apple', 'none').then(function () {});
    f.tile.el.classList.add('is-teaser');

    f.side.appendChild(FF.ui.el('p', { class: 'gs-tagline' }, [
      FF.ui.span('', t('lgoTag1', 'See the symbol. ')), FF.ui.span('', t('lgoTag2', 'Name the brand. ')), FF.ui.span('gs-gold', t('lgoTag3', 'Beat the clock!'))
    ]));
    var how = FF.ui.el('ul', { class: 'gs-how' });
    [t('lgoHow1', 'A brand’s symbol appears, without its name.'),
      everyone ? t('lgoHow2Say', 'Everyone shouts the name; tap who said it first.') : t('lgoHow2', 'Spell, pick or type the brand’s name.'),
      t('lgoHow3', 'Faster answers score more. The full logo and a fact follow.')].forEach(function (x, i) {
      var li = FF.ui.el('li', {});
      li.appendChild(FF.ui.span('gs-how__n', String(i + 1)));
      li.appendChild(FF.ui.span('', x));
      how.appendChild(li);
    });
    f.side.appendChild(how);

    var p = f.panel;
    function heading(text) { p.appendChild(FF.ui.el('h2', { class: 'gs-h' }, text)); }
    function toggles(cls, label) { var g = FF.ui.el('div', { class: cls, role: 'group', 'aria-label': label }); p.appendChild(g); return g; }

    heading(t('gsAnswerStyle', 'How do you answer?'));
    var modeWrap = toggles('gs-modes' + (modes.length === 1 ? ' lgo-modes--one' : ''), t('gsAnswerStyle', 'How do you answer?'));
    var modeBtns = modes.map(function (m) {
      var b = FF.ui.el('button', { type: 'button', class: 'gs-mode' });
      b.appendChild(G().glyph(m === 'choice' ? 'list' : m === 'say' ? 'soundOn' : m === 'type' ? 'check' : 'letter'));
      var txt = FF.ui.span('gs-mode__text');
      txt.appendChild(FF.ui.span('gs-mode__name', modeName(m)));
      txt.appendChild(FF.ui.span('gs-mode__meta', modeMeta(m)));
      b.appendChild(txt);
      b.addEventListener('click', function () { mode = m; api.audio.play('select'); sync(); });
      modeWrap.appendChild(b);
      return { el: b, id: m };
    });

    heading(t('gsChooseLevel', 'Choose your level'));
    var levelWrap = toggles('gs-levels', t('gcLevel', 'Level'));
    var levelBtns = R.LEVELS.map(function (l) {
      var b = FF.ui.el('button', { type: 'button', class: 'gs-level gs-lv-' + l });
      b.appendChild(G().levelChip(l));
      var meta = FF.ui.span('gs-level__meta', '');
      b.appendChild(meta);
      b.appendChild(FF.ui.span('gs-level__pts', t('gsLevelPts', '{n} pts', { n: R.BASE[l] })));
      b.addEventListener('click', function () { level = l; api.audio.play('select'); sync(); });
      levelWrap.appendChild(b);
      return { el: b, id: l, meta: meta };
    });

    heading(t('lgoCategories', 'Categories'));
    var catWrap = toggles('gs-regions lgo-cats', t('lgoCategories', 'Categories'));
    var mixedBtn = FF.ui.el('button', { type: 'button', class: 'gs-region' }, t('lgoMixed', 'Mixed'));
    mixedBtn.addEventListener('click', function () { on = {}; api.audio.play('tap'); sync(); });
    catWrap.appendChild(mixedBtn);
    var catBtns = groups.map(function (g) {
      var b = FF.ui.el('button', { type: 'button', class: 'gs-region' });
      b.appendChild(FF.ui.span('', t('lgoGroup_' + g.id, g.name)));
      b.appendChild(FF.ui.span('lgo-count', String(groupCount(g.cats))));
      b.addEventListener('click', function () { on[g.id] = !on[g.id]; api.audio.play('tap'); sync(); });
      catWrap.appendChild(b);
      return { el: b, g: g };
    });

    heading(t('lgoTimeEach', 'Time for each logo'));
    var timeWrap = toggles('gs-regions lgo-times', t('lgoTimeEach', 'Time for each logo'));
    var timeBtns = R.TIMES.map(function (x) {
      var b = FF.ui.el('button', { type: 'button', class: 'gs-region' });
      var label = FF.ui.span('', '');
      b.appendChild(label);
      b.addEventListener('click', function () { time = x; api.audio.play('tap'); sync(); });
      timeWrap.appendChild(b);
      return { el: b, id: x, label: label };
    });

    heading(t('lgoTwist', 'Twist'));
    var twistWrap = toggles('gs-regions lgo-twists', t('lgoTwist', 'Twist'));
    var twistBtns = R.TWISTS.map(function (x) {
      var b = FF.ui.el('button', { type: 'button', class: 'gs-region', title: twistMeta(x) }, twistName(x));
      b.addEventListener('click', function () { twist = x; api.audio.play('tap'); sync(); });
      twistWrap.appendChild(b);
      return { el: b, id: x };
    });
    var twistNote = FF.ui.el('p', { class: 'gs-note' });
    p.appendChild(twistNote);

    var foot = FF.ui.div('gs-setup__foot');
    var info = FF.ui.el('p', { class: 'gs-note', 'aria-live': 'polite' });
    foot.appendChild(info);
    var go = FF.ui.el('button', { type: 'button', class: 'gs-btn gs-btn--go gs-btn--big' });
    go.appendChild(FF.Icons.icon('play'));
    go.appendChild(FF.ui.span('', t('lgoGo', 'Start the rush')));
    go.addEventListener('click', function () {
      var cfg = current();
      try { store().set(SETUP_KEY, cfg); } catch (e) { /* storage full */ }
      api.audio.play('roundStart');
      if (FF.GameLength && FF.GameLength.resume) FF.GameLength.resume();
      onGo(cfg);
    });
    foot.appendChild(go);
    p.appendChild(foot);

    function current() {
      var cats = [];
      groups.forEach(function (g) { if (on[g.id]) cats = cats.concat(g.cats); });
      return R.sanitize({ level: level, cats: cats.length ? cats : 'mixed', mode: mode, time: time, twist: twist, rounds: saved.rounds });
    }
    function pressed(x, yes) { x.el.classList.toggle('is-on', yes); x.el.setAttribute('aria-pressed', yes ? 'true' : 'false'); }
    function sync() {
      var anyCat = groups.some(function (g) { return on[g.id]; });
      modeBtns.forEach(function (x) { pressed(x, x.id === mode); });
      levelBtns.forEach(function (x) {
        pressed(x, x.id === level);
        x.meta.textContent = mode === 'choice' ? t('lgoLevelChoice', '{n} names to pick from', { n: R.CHOICES[x.id] })
          : x.id === 'easy' ? t('lgoLevelEasy', 'Household names') : x.id === 'hard' ? t('lgoLevelHard', 'For brand experts') : t('lgoLevelNormal', 'Well-known brands');
      });
      pressed({ el: mixedBtn }, !anyCat);
      catBtns.forEach(function (x) { pressed(x, !!on[x.g.id]); });
      timeBtns.forEach(function (x) {
        pressed(x, x.id === time);
        var secs = R.secondsFor({ mode: mode, time: x.id });
        x.label.textContent = timeName(x.id) + (secs ? ' · ' + secs + ' s' : '');
      });
      twistBtns.forEach(function (x) { pressed(x, x.id === twist); });
      twistNote.textContent = twistMeta(twist) + '.';
      var cfg = current();
      var ranked = FF.Leaderboards && FF.Leaderboards.active && FF.Leaderboards.active(api.def);
      info.textContent = t('lgoNReady', '{n} logos ready', { n: R.pool(cfg).length }) +
        (ranked && (!R.isStandard(cfg) || everyone) ? ' · ' + t('nrUnranked', 'Leaderboards use the standard settings') : '');
    }
    sync();
    if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(p);
  }

  /* ================= solo, turns and everyone ================= */

  function scorerList(config) {
    if (config.scorers && config.scorers.length) return config.scorers.slice();
    if (config.players && config.players.length) return config.players.slice();
    return [{ id: 'p1', name: t('you', 'You'), avatar: null }];
  }
  function playModeOf(config) {
    var n = scorerList(config).length;
    if (n > 1 && config.mode === 'everyone') return 'everyone';
    if (n > 1 && config.mode === 'turn') return 'turn';
    return 'solo';
  }

  function seenSet(list, need) {
    var arr = store().get(SEEN_KEY, []) || [];
    var s = {};
    arr.forEach(function (c) { s[c] = true; });
    var fresh = list.filter(function (x) { return !s[x.id]; }).length;
    if (fresh >= need) return s;
    var ids = {};
    list.forEach(function (x) { ids[x.id] = true; });
    try { store().set(SEEN_KEY, arr.filter(function (c) { return !ids[c]; })); } catch (e) { /* storage full */ }
    return {};
  }
  function markSeen(id) {
    var arr = store().get(SEEN_KEY, []) || [];
    arr.push(id);
    if (arr.length > SEEN_MAX) arr = arr.slice(arr.length - SEEN_MAX);
    try { store().set(SEEN_KEY, arr); } catch (e) { /* storage full */ }
  }

  function play(api, cfg, seed, playMode) {
    cfg = R.sanitize(cfg);
    if (playMode === 'everyone') cfg.mode = 'say';
    else if (cfg.mode === 'say') cfg.mode = 'tiles';
    var config = api.config;
    var scorers = scorerList(config);
    var n = scorers.length;
    var turns = playMode === 'turn';
    var list = R.pool(cfg);
    var timed = FF.GameLength.timed(config);
    var rounds = FF.GameLength.rounds(api, 10, list.length);
    if (!timed && turns) rounds = Math.ceil(rounds / n) * n;
    if (timed) FF.GameLength.manual();
    var shared = !!config.sharedDeal || !!config.daily || !!config.challenge;
    // A fresh run skips logos seen lately (a shared deal must not: everyone gets the same).
    var ids = R.deal(cfg, seed, Math.max(rounds, 1));
    if (!shared) {
      var seen = seenSet(list, rounds);
      var fresh = ids.filter(function (c) { return !seen[c]; });
      if (fresh.length < ids.length) {
        var more = R.deal(cfg, seed, list.length).filter(function (c) { return !seen[c] && fresh.indexOf(c) === -1; });
        ids = fresh.concat(more).concat(ids).filter(function (c, i, a) { return a.indexOf(c) === i; }).slice(0, rounds);
      }
    }
    var failed = [];
    var f = frame(api, { className: 'gs--play' });
    var round = -1;
    var stats = {};
    scorers.forEach(function (e) { stats[e.id] = { right: 0, played: 0, fastest: null, streak: 0, best: 0 }; });
    var missed = [];
    var totals = { right: 0, played: 0 };
    var passed = {};

    var scoreBox = FF.ui.div('gs-card gs-score');
    f.side.appendChild(scoreBox);
    var roundChip = G().chip('', 'gs-chip--round');
    f.chips.appendChild(roundChip);
    f.chips.appendChild(G().levelChip(cfg.level));
    if (cfg.twist !== 'none') f.chips.appendChild(G().chip(twistName(cfg.twist), 'gs-chip--cat'));
    var ring = G().timerRing();
    f.stage.appendChild(ring.el);
    f.side.appendChild(G().chip(catsName(cfg.cats), 'gs-chip--cat', 'list'));

    function drawScores(activeId, bump) {
      FF.ui.clear(scoreBox);
      scoreBox.appendChild(FF.ui.el('p', { class: 'gs-card__title' }, n > 1 ? (turns ? t('lgoTakeTurns', 'Taking turns') : t('lgoEveryone', 'Everyone plays')) : t('gsYourScore', 'Your score')));
      var rows = FF.ui.el('ol', { class: 'gs-board-list' });
      scorers.slice().sort(function (a, b) { return (api.scoring.get(b.id) || 0) - (api.scoring.get(a.id) || 0); }).forEach(function (e, i) {
        var li = FF.ui.el('li', { class: 'gs-row' + (e.id === activeId && n > 1 ? ' is-active' : '') });
        li.appendChild(FF.ui.span('gs-row__place', String(i + 1)));
        var ava = FF.ui.span('gs-row__ava');
        ava.appendChild(FF.Players.avatarEl(e, ''));
        li.appendChild(ava);
        li.appendChild(FF.ui.span('gs-row__name', e.name || t('playerLabel', 'Player')));
        var pts = FF.ui.span('gs-row__pts', FF.util.formatNumber(api.scoring.get(e.id) || 0));
        li.appendChild(pts);
        if (bump && bump.id === e.id) G().countUp(pts, bump.from, bump.to, 800);
        rows.appendChild(li);
      });
      scoreBox.appendChild(rows);
      if (n === 1 || turns) {
        var st = stats[activeId] || { streak: 0 };
        var meta = FF.ui.div('gs-streak');
        meta.appendChild(FF.ui.span('gs-streak__flame' + (st.streak >= 3 ? ' is-hot' : ''), t('gsStreakN', 'Streak {n}', { n: st.streak })));
        scoreBox.appendChild(meta);
      }
    }

    function over() {
      if (round >= rounds) return true;
      return timed && FF.GameLength.timeUp() && (!turns || round % n === 0);
    }
    function next() {
      round++;
      if (over() || !ids.length) { recap(); return; }
      render();
    }

    /* Take turns: hand the device over before each logo. */
    function passCard(entity, go) {
      f.tile.clear();
      ring.idle();
      FF.ui.clear(f.panel);
      var card = FF.ui.div('gs-card lgo-pass');
      var ava = FF.ui.span('lgo-pass__ava');
      ava.appendChild(FF.Players.avatarEl(entity, ''));
      card.appendChild(ava);
      card.appendChild(FF.ui.el('h2', { class: 'gs-h gs-h--xl' }, t('lgoPassTo', 'Pass to {name}', { name: entity.name || t('playerLabel', 'Player') })));
      card.appendChild(FF.ui.el('p', { class: 'gs-note' }, t('lgoPassNote', 'No peeking, everyone else!')));
      var b = FF.ui.el('button', { type: 'button', class: 'gs-btn gs-btn--go gs-btn--big' });
      b.appendChild(FF.Icons.icon('play'));
      b.appendChild(FF.ui.span('', t('lgoReady', 'I’m ready')));
      b.addEventListener('click', function () { api.audio.play('click'); go(); });
      card.appendChild(b);
      f.panel.appendChild(card);
      f.fit();
      if (FF.Nav && FF.Nav.focus) FF.Nav.focus(b);
    }

    function render() {
      var k = round;
      var entity = turns ? scorers[k % n] : scorers[0];
      api.shell.hideTimer();
      api.shell.updateScores(n > 1 && turns ? entity.id : undefined);
      roundChip.lastChild.textContent = (turns && n > 1 ? (entity.name || '') + ' · ' : '') + t('lgoRoundOf', 'Logo {r} of {n}', { r: k + 1, n: rounds });
      var active = turns || n === 1 ? entity.id : null;
      drawScores(active);
      if (turns && n > 1 && !passed[k]) { passCard(entity, function () { passed[k] = true; render(); }); return; }
      var info = R.roundAt(cfg, seed, k, ids);
      if (!shared) markSeen(info.id);
      if (ids[k + 1]) preload(ids[k + 1]);
      ring.idle();
      FF.ui.clear(f.panel);
      f.panel.appendChild(FF.ui.el('h2', { class: 'gs-question' }, [
        FF.ui.span('', t('lgoWhich1', 'Which ')), FF.ui.span('gs-gold', t('lgoWhich2', 'brand')), FF.ui.span('', t('lgoWhich3', ' is this?'))
      ]));
      var done = false, started = 0, stopped = 0;
      var board;
      if (cfg.mode === 'choice') {
        board = G().choiceBoard(api, { code: info.id, choices: info.choices }, {
          nameOf: nameOf, label: t('lgoPickBrand', 'Pick the brand'), onSubmit: function (id) { answer(id, false); }
        });
      } else if (cfg.mode === 'type') {
        board = typeBoard(api, info, { onSubmit: function (text) { answer(text, false); } });
      } else if (cfg.mode === 'say') {
        board = sayBoard(api, scorers, { onAsk: stopClock, onAward: award });
      } else {
        board = G().letterBoard(api, info, { onSubmit: function (text) { answer(text, false); } });
      }
      f.panel.appendChild(board.el);
      var after = FF.ui.div('gs-after');
      f.panel.appendChild(after);
      f.fit();

      f.tile.show(info.id, info.twist, info.zoom).then(function (ok) {
        if (ok == null || round !== k || !stillShown(api)) return;
        if (!ok) {
          // The file is missing or broken: another brand takes this round, unscored.
          failed.push(info.id);
          var swap = R.nextUnused(cfg, ids, failed);
          board.destroy();
          if (swap) { ids[k] = swap; render(); } else { rounds = Math.max(k, 1); round = k; recap(); }
          return;
        }
        api.audio.play('land');
        started = Date.now();
        board.open();
        if (info.flashMs) f.tile.flash(info.flashMs);
        if (info.seconds) {
          api.shell.setOnTick(function (rem) { ring.set(rem, info.seconds); f.tile.zoomTo(rem / info.seconds); });
          api.shell.setTimer(info.seconds, function () { if (cfg.mode === 'say') { stopClock(); board.ask(); } else answer('', true); });
          ring.set(info.seconds, info.seconds);
        } else {
          f.tile.zoomOver(NO_CLOCK_ZOOM_S);
        }
        if (cfg.mode !== 'type' && FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(board.el);
      });

      function stopClock() {
        if (stopped) return;
        stopped = started ? Date.now() - started : 0;
        api.shell.setOnTick(null);
        api.shell.hideTimer();
      }

      /* Say it out loud: the host tapped who said it first (null: nobody). */
      function award(pid) {
        if (done) return;
        done = true;
        stopClock();
        var ms = stopped || (info.seconds ? info.seconds * 1000 : 0);
        var winner = pid ? scorers.filter(function (e) { return e.id === pid; })[0] : null;
        var pts = R.points({ level: cfg.level, ok: !!winner, ms: ms, secs: info.seconds, mode: 'say', twist: cfg.twist });
        totals.played++;
        scorers.forEach(function (e) { stats[e.id].played++; });
        var before = winner ? api.scoring.get(winner.id) || 0 : 0;
        if (winner) {
          var st = stats[winner.id];
          st.right++; totals.right++;
          if (st.fastest == null || ms < st.fastest) st.fastest = ms;
          api.scoring.add(winner.id, pts.total, { correct: true, fastest: ms / 1000 });
          api.audio.play('correct');
          if (animationsOn() && FF.Confetti) FF.Confetti.burst(40);
        } else {
          api.audio.play('wrong');
          if (missed.indexOf(info.id) === -1) missed.push(info.id);
        }
        finishRound(!!winner, {
          state: winner ? 'good' : 'late', stampText: winner ? t('lgoPointTo', 'Point to {name}!', { name: winner.name || t('playerLabel', 'Player') }) : t('lgoNobodyGot', 'Nobody got it'),
          points: pts.total, breakdown: pts, said: ''
        }, winner ? { id: winner.id, from: before, to: api.scoring.get(winner.id) || 0 } : null);
      }

      function answer(text, timeout) {
        if (done) return;
        done = true;
        var ms = started ? Date.now() - started : (info.seconds || 0) * 1000;
        stopClock();
        if (timeout) ring.set(0, info.seconds);
        var choice = cfg.mode === 'choice';
        var res = timeout || !text ? { ok: false } : choice ? R.checkChoice(info, text) : R.check(text, info.id);
        var st = stats[entity.id];
        st.played++; totals.played++;
        var pts = R.points({ level: cfg.level, ok: res.ok, ms: ms, secs: info.seconds, mode: cfg.mode, twist: cfg.twist });
        var before = api.scoring.get(entity.id) || 0;
        if (res.ok) {
          st.right++; totals.right++;
          st.streak++;
          st.best = Math.max(st.best, st.streak);
          if (st.fastest == null || ms < st.fastest) st.fastest = ms;
          api.scoring.add(entity.id, pts.total, { correct: true, fastest: ms / 1000 });
          api.audio.play(st.streak >= 3 ? 'streak' : 'correct');
          if (animationsOn() && FF.Confetti) FF.Confetti.burst(st.streak >= 3 ? 70 : 40);
        } else {
          st.streak = 0;
          api.scoring.add(entity.id, 0, { wrong: true });
          if (api.scoring.resetStreak) api.scoring.resetStreak(entity.id);
          api.audio.play('wrong');
          if (missed.indexOf(info.id) === -1) missed.push(info.id);
        }
        finishRound(res.ok, {
          state: res.ok ? 'good' : timeout ? 'late' : 'bad', points: pts.total, breakdown: pts,
          said: res.ok ? (res.exact || choice ? '' : t('lgoSpelt', 'It is spelt {c}.', { c: info.name })) : saidLine(text, res, choice)
        }, { id: entity.id, from: before, to: api.scoring.get(entity.id) || 0 });
      }

      function finishRound(ok, card, bump) {
        board.finish(ok);
        f.tile.reveal(info.id, ok ? 'good' : 'bad');
        drawScores(active, bump);
        api.shell.updateScores(turns ? entity.id : undefined);
        card.id = info.id;
        card.name = info.name;
        after.appendChild(revealCard(card));
        f.root.classList.add('is-revealed');
        var last = round + 1 >= rounds || (timed && FF.GameLength.timeUp() && (!turns || (round + 1) % n === 0));
        var nextBtn = FF.Advance.button(last ? t('seeResults', 'See results') : t('lgoNextLogo', 'Next logo'), function () {
          api.audio.play('click');
          board.destroy();
          f.root.classList.remove('is-revealed');
          next();
        }, { class: 'gs-btn gs-btn--go gs-next' });
        after.appendChild(nextBtn);
        f.fit();
        if (after.scrollIntoView && window.innerWidth < 900) { try { after.scrollIntoView({ behavior: animationsOn() ? 'smooth' : 'auto', block: 'nearest' }); } catch (e) { /* old browser */ } }
        if (FF.Nav && FF.Nav.focus) setTimeout(function () { if (document.body.contains(nextBtn)) FF.Nav.focus(nextBtn); }, 400);
      }
    }

    function recap() {
      api.shell.hideTimer();
      api.shell.setOnTick(null);
      f.tile.clear();
      FF.ui.clear(f.panel);
      FF.ui.clear(f.chips);
      f.root.classList.add('is-recap');
      var box = FF.ui.div('gs-recap');
      var pct = totals.played ? Math.round(totals.right / totals.played * 100) : 0;
      var ringEl = FF.ui.div('gs-recap__ring');
      ringEl.style.setProperty('--p', String(pct));
      ringEl.appendChild(FF.ui.span('', pct + '%'));
      box.appendChild(ringEl);
      box.appendChild(FF.ui.el('h2', { class: 'gs-h gs-h--xl' }, t('lgoRecapTitle', '{c} of {a} brands named', { c: totals.right, a: totals.played })));
      box.appendChild(FF.ui.el('p', { class: 'gs-note' }, summary(cfg)));
      var people = FF.ui.el('ol', { class: 'gs-board-list gs-board-list--big' });
      scorers.slice().sort(function (a, b) { return (api.scoring.get(b.id) || 0) - (api.scoring.get(a.id) || 0); }).forEach(function (e, i) {
        var s = stats[e.id];
        var li = FF.ui.el('li', { class: 'gs-row' + (i === 0 ? ' is-top' : '') });
        li.appendChild(FF.ui.span('gs-row__place', String(i + 1)));
        var ava = FF.ui.span('gs-row__ava');
        ava.appendChild(FF.Players.avatarEl(e, ''));
        li.appendChild(ava);
        var who = FF.ui.span('gs-row__name');
        who.appendChild(FF.ui.span('', e.name || t('playerLabel', 'Player')));
        var bits = [t('qmRightOf', '{c}/{a} right', { c: s.right, a: s.played })];
        if (s.best > 1) bits.push(t('qmBestStreak', 'best streak {n}', { n: s.best }));
        if (s.fastest != null) bits.push(t('qmFastest', 'fastest {s}s', { s: (s.fastest / 1000).toFixed(1) }));
        who.appendChild(FF.ui.span('gs-row__meta', bits.join(' · ')));
        li.appendChild(who);
        li.appendChild(FF.ui.span('gs-row__pts', FF.util.formatNumber(api.scoring.get(e.id) || 0)));
        people.appendChild(li);
      });
      box.appendChild(people);
      if (missed.length) {
        box.appendChild(FF.ui.el('h3', { class: 'gs-h' }, t('lgoToLearn', 'Logos to learn')));
        var learn = FF.ui.el('ul', { class: 'gs-learn lgo-learn' });
        missed.slice(0, 12).forEach(function (id) {
          var li = FF.ui.el('li', {});
          var src = R.logoPath(id, false);
          if (src) li.appendChild(FF.ui.el('img', { src: src, alt: '' }));
          li.appendChild(FF.ui.span('', nameOf(id)));
          learn.appendChild(li);
        });
        box.appendChild(learn);
      }
      var go = FF.ui.el('button', { type: 'button', class: 'gs-btn gs-btn--go gs-btn--big' });
      go.appendChild(FF.Icons.icon('trophy'));
      go.appendChild(FF.ui.span('', t('seeResults', 'See results')));
      go.addEventListener('click', end);
      box.appendChild(go);
      f.panel.appendChild(box);
      api.audio.play('winner');
      if (pct >= 80 && animationsOn() && FF.Confetti) FF.Confetti.burst(90);
      if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(box);
    }

    function end() {
      var res = api.scoring.results ? api.scoring.results() : null;
      var ranked = (res && res.results) || [];
      var best = 0, fastest = null;
      Object.keys(stats).forEach(function (id) {
        best = Math.max(best, stats[id].best);
        if (stats[id].fastest != null && (fastest == null || stats[id].fastest < fastest)) fastest = stats[id].fastest / 1000;
      });
      api.end({ results: ranked, winnerId: res ? res.winnerId : null, bestStreak: best, fastest: fastest, quizCorrect: totals.right, quizAnswered: totals.played });
    }

    next();
  }

  /* ================= online ================= */

  /* Slots from the referee's masked name ('_' a letter, ' ' a gap, marks as they are). */
  function maskedCells(masked) {
    var cells = [];
    String(masked || '').split('').forEach(function (ch) {
      if (ch === '_') cells.push({ ch: '', letter: true });
      else if (ch === ' ') cells.push({ ch: ' ', gap: true });
      else cells.push({ ch: ch, fixed: true });
    });
    return cells;
  }

  function online(api, room) {
    var f = frame(api, { className: 'gs--play gs--online' });
    api.shell.hideTimer();
    if (FF.Race && FF.Race.begin) FF.Race.begin(api.def.id, { rounds: 1, mode: 'parallel' });
    var client = FF.LogoRushClient.create({ room: room, onChange: schedule });
    var ended = false, pending = null, nudged = {}, autoScores = null;
    var shownRound = null, board = null, boardRound = null, sentText = null, revealShown = null, finishedShown = false, opened = null;
    var ring = G().timerRing();
    var lastScores = {};
    f.stage.appendChild(ring.el);
    var roundChip = G().chip('', 'gs-chip--round');
    f.chips.appendChild(roundChip);
    var levelHolder = FF.ui.span('');
    f.chips.appendChild(levelHolder);
    var boardBox = FF.ui.div('gs-card gs-leader');
    f.side.appendChild(boardBox);
    var ticker = setInterval(tick, 200);

    function expected() { return room.meta && room.meta.lrMatch; }
    function who(uid) {
      var p = (room.players || {})[uid] || {};
      return { id: uid, uid: uid, name: p.name || t('playerLabel', 'Player'), avatar: p.avatar || null, color: p.color || null };
    }
    function schedule() { if (!pending) pending = setTimeout(function () { pending = null; render(); }, 0); }
    function cleanup() {
      if (ended) return;
      ended = true;
      clearInterval(ticker);
      if (pending) clearTimeout(pending);
      if (autoScores) clearTimeout(autoScores);
      if (board) board.destroy();
      f.tile.stop();
      client.stop();
      if (FF.Race && FF.Race.end) { try { FF.Race.end(); } catch (e) { /* not running */ } }
    }
    function finish() { if (ended) return; cleanup(); api.end({}); }
    function maybeNudge(key, due) {
      if (nudged[key] || !due) return;
      if (client.serverNow() - due < NUDGE_MS) return;
      nudged[key] = true;
      FF.LogoRushApi.nudge(room.code);
    }

    function drawLeader(lr, reveal) {
      FF.ui.clear(boardBox);
      var head = FF.ui.div('gs-card__head');
      head.appendChild(FF.Icons.icon('trophy'));
      var ht = FF.ui.div('');
      ht.appendChild(FF.ui.el('p', { class: 'gs-card__title' }, t('lgoRace', 'Logo race')));
      if (lr.k >= 0) ht.appendChild(FF.ui.el('p', { class: 'gs-card__sub' }, t('lgoRoundOf', 'Logo {r} of {n}', { r: lr.k + 1, n: lr.total })));
      head.appendChild(ht);
      boardBox.appendChild(head);
      var rows = FF.ui.el('ol', { class: 'gs-board-list' });
      var order = (lr.order || []).slice().sort(function (a, b) { return ((lr.p[b] || {}).score || 0) - ((lr.p[a] || {}).score || 0); });
      order.forEach(function (uid, i) {
        var row = lr.p[uid] || {};
        var li = FF.ui.el('li', { class: 'gs-row' + (uid === client.uid ? ' is-me' : '') + (i < 3 ? ' is-p' + (i + 1) : '') });
        li.appendChild(FF.ui.span('gs-row__place', String(i + 1)));
        var ava = FF.ui.span('gs-row__ava');
        ava.appendChild(FF.Players.avatarEl(who(uid), ''));
        li.appendChild(ava);
        li.appendChild(FF.ui.span('gs-row__name', who(uid).name + (uid === client.uid ? ' ' + t('youTag', '(you)') : '')));
        var pts = FF.ui.span('gs-row__pts', FF.util.formatNumber(row.score || 0));
        li.appendChild(pts);
        if (lr.phase === 'open' && row.inK === lr.k) li.appendChild(FF.ui.span('gs-row__in', '✓'));
        if (reveal && row.last && row.last.k === lr.k) {
          li.classList.add(row.last.ok ? 'is-good' : 'is-bad');
          var before = lastScores[uid] != null ? lastScores[uid] : (row.score || 0) - (row.last.pts || 0);
          G().countUp(pts, before, row.score || 0, 900);
        }
        lastScores[uid] = row.score || 0;
        rows.appendChild(li);
      });
      boardBox.appendChild(rows);
    }

    function waiting(title, sub) {
      FF.ui.clear(f.panel);
      var w = FF.ui.div('gs-wait');
      w.appendChild(FF.ui.div('gs-wait__spin'));
      w.appendChild(FF.ui.el('h2', { class: 'gs-h' }, title));
      if (sub) w.appendChild(FF.ui.el('p', { class: 'gs-note' }, sub));
      f.panel.appendChild(w);
    }

    function tick() {
      if (ended) return;
      var lr = client.view().lr;
      if (!lr || lr.matchId !== expected()) return;
      var now = client.serverNow();
      if (lr.phase === 'open' && lr.round) {
        var secs = lr.round.seconds || 1;
        var rem = (lr.closeAt - now) / 1000;
        ring.set(rem, secs);
        f.tile.zoomTo(rem / secs);
      }
      var due = lr.phase === 'starting' ? lr.readyAt : lr.phase === 'ready' ? lr.openAt : lr.phase === 'open' ? lr.closeAt : lr.phase === 'reveal' ? lr.nextAt : 0;
      if (due) maybeNudge(lr.phase + lr.k, due);
    }

    function render() {
      if (ended) return;
      if (!f.root.isConnected) { cleanup(); return; }
      var v = client.view();
      var lr = v.lr;
      if (!lr || (expected() && lr.matchId !== expected()) || !FF.LogoRushClient.ready(lr)) {
        if (!lr || lr.matchId !== expected()) {
          waiting(t('lgoGettingReady', 'Shuffling the logos…'), t('lgoGettingReadySub', 'Everyone gets the same logos at the same moment.'));
          f.tile.clear();
        }
        return;
      }
      FF.ui.clear(levelHolder);
      levelHolder.appendChild(G().levelChip(lr.settings.level));
      roundChip.lastChild.textContent = lr.k >= 0 ? t('lgoRoundOf', 'Logo {r} of {n}', { r: lr.k + 1, n: lr.total }) : t('gsGetReady', 'Get ready');
      drawLeader(lr, lr.phase === 'reveal');
      if (lr.phase === 'ended') { if (!finishedShown) showEnd(lr, v); return; }
      if (lr.phase === 'starting') {
        f.tile.clear();
        ring.idle();
        waiting(t('lgoBrief', 'See the symbol. Name the brand.'), lr.settings.mode === 'choice'
          ? t('lgoBriefChoice', 'Pick each brand from the names. Faster right answers score more. One answer per logo.')
          : t('lgoBriefTiles', 'Spell each brand with the letter tiles. Faster right answers score more. One answer per logo.'));
        return;
      }
      if (!v.seated) {
        waiting(t('gsWatching', 'This game started without you'), t('gsWatchingSub', 'You can join the next one.'));
        return;
      }
      var key = lr.matchId + '|' + lr.k;
      if (shownRound !== key) buildRound(lr, key);
      if (lr.phase === 'open' && board && opened !== key) {
        opened = key;
        board.open();
        var since = Math.max(0, client.serverNow() - lr.openAt);
        if (lr.round.flashMs) f.tile.flash(lr.round.flashMs - since);
        if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(board.el);
      }
      var me = lr.p[v.uid] || {};
      if ((lr.phase === 'open' || lr.phase === 'ready') && me.inK === lr.k && board && !board.sent) {
        board.sent = true;
        board.lock();
      }
      if (lr.phase === 'reveal' && revealShown !== key) showReveal(lr, v, key);
    }

    function buildRound(lr, key) {
      shownRound = key;
      revealShown = null;
      sentText = null;
      if (board) board.destroy();
      FF.ui.clear(f.panel);
      f.root.classList.remove('is-revealed');
      var rd = lr.round;
      var choice = lr.settings.mode === 'choice';
      boardRound = choice ? { code: null, choices: rd.choices } : { cells: maskedCells(rd.cells), tiles: rd.tiles, letters: [] };
      f.panel.appendChild(FF.ui.el('h2', { class: 'gs-question' }, [
        FF.ui.span('', t('lgoWhich1', 'Which ')), FF.ui.span('gs-gold', t('lgoWhich2', 'brand')), FF.ui.span('', t('lgoWhich3', ' is this?'))
      ]));
      var lock;
      function onSubmit(text, shown) {
        if (board.sent) return;
        if (!client.send(text)) return;
        board.sent = true;
        sentText = choice ? nameOf(text) : (shown || text);
        board.lock();
        api.audio.play('select');
        lock.textContent = t('bqLockedIn', 'Answer locked in. Waiting for everyone…');
        lock.classList.add('is-on');
      }
      board = choice ? G().choiceBoard(api, boardRound, { nameOf: nameOf, label: t('lgoPickBrand', 'Pick the brand'), onSubmit: onSubmit })
        : G().letterBoard(api, boardRound, { onSubmit: onSubmit });
      f.panel.appendChild(board.el);
      lock = FF.ui.el('p', { class: 'gs-locked', 'aria-live': 'polite' });
      f.panel.appendChild(lock);
      f.panel.appendChild(FF.ui.div('gs-after'));
      f.fit();
      f.tile.show(rd.id, rd.twist, rd.zoom).then(function (ok) {
        if (ok && shownRound === key && !ended) api.audio.play('land');
      });
    }

    function showReveal(lr, v, key) {
      revealShown = key;
      var rv = lr.reveal || {};
      var me = (lr.p[v.uid] || {}).last || {};
      var mine = me.k === lr.k ? me : { ok: false, pts: 0 };
      if (board) {
        if (boardRound && boardRound.choices) { boardRound.code = rv.id; board.finish(!!mine.ok); }
        else board.finish(!!mine.ok, FF.SpellTiles.lettersOf(rv.target || rv.name || ''));
      }
      ring.set(0, 1);
      f.root.classList.add('is-revealed');
      f.tile.reveal(rv.id, mine.ok ? 'good' : 'bad');
      api.audio.play(mine.ok ? 'correct' : 'wrong');
      if (mine.ok && animationsOn() && FF.Confetti) FF.Confetti.burst(40);
      var lockEl = f.panel.querySelector('.gs-locked');
      if (lockEl) lockEl.classList.remove('is-on');
      var after = f.panel.querySelector('.gs-after') || f.panel.appendChild(FF.ui.div('gs-after'));
      FF.ui.clear(after);
      var choice = lr.settings.mode === 'choice';
      var text = mine.text || sentText;
      var said = '';
      if (!mine.ok && text) said = choice ? saidLine(text, { near: nameOf(mine.text || '') || mine.near }, true) : saidLine(text, mine.near ? { near: mine.near } : null);
      after.appendChild(revealCard({
        state: mine.ok ? 'good' : text ? 'bad' : 'late', id: rv.id, name: rv.name, points: mine.pts || 0,
        breakdown: mine.ok ? { base: mine.base || 0, speed: mine.speed || 0, bonus: mine.bonus || 0 } : null, said: said
      }));
      after.appendChild(FF.ui.el('p', { class: 'gs-note gs-nextin' }, lr.k + 1 >= lr.total ? t('gsFinalSoon', 'Final results coming up…') : t('lgoNextSoon', 'Next logo in a moment…')));
      f.fit();
    }

    function showEnd(lr, v) {
      finishedShown = true;
      if (board) board.destroy();
      board = null;
      f.tile.clear();
      ring.idle();
      FF.ui.clear(f.panel);
      f.root.classList.add('is-recap');
      var rows = (lr.result && lr.result.rows) || [];
      var box = FF.ui.div('gs-recap gs-recap--room');
      var top = rows[0];
      var meWon = top && top.uid === v.uid && !(rows[1] && rows[1].place === 1);
      box.appendChild(FF.ui.el('h2', { class: 'gs-h gs-h--xl' }, meWon ? t('lgoYouWin', 'You win the logo race!') : top ? t('lgoWinner', '{name} wins the logo race!', { name: who(top.uid).name }) : t('gsOver', 'Game over')));
      var podium = FF.ui.div('gs-podium');
      [1, 0, 2].forEach(function (i) {
        var r = rows[i];
        if (!r) return;
        var col = FF.ui.div('gs-podium__col gs-podium__col--' + (i + 1));
        var ava = FF.ui.span('gs-podium__ava');
        ava.appendChild(FF.Players.avatarEl(who(r.uid), ''));
        col.appendChild(ava);
        col.appendChild(FF.ui.span('gs-podium__name', who(r.uid).name));
        col.appendChild(FF.ui.span('gs-podium__pts', FF.util.formatNumber(r.points || 0)));
        var step = FF.ui.div('gs-podium__step');
        step.appendChild(FF.ui.span('', String(r.place || i + 1)));
        col.appendChild(step);
        podium.appendChild(col);
      });
      box.appendChild(podium);
      var list = FF.ui.el('ol', { class: 'gs-board-list gs-board-list--big' });
      rows.forEach(function (r) {
        var li = FF.ui.el('li', { class: 'gs-row' + (r.uid === v.uid ? ' is-me' : '') });
        li.appendChild(FF.ui.span('gs-row__place', String(r.place)));
        var ava = FF.ui.span('gs-row__ava');
        ava.appendChild(FF.Players.avatarEl(who(r.uid), ''));
        li.appendChild(ava);
        var nm = FF.ui.span('gs-row__name');
        nm.appendChild(FF.ui.span('', who(r.uid).name));
        var bits = [t('qmRightOf', '{c}/{a} right', { c: r.right || 0, a: lr.total })];
        if (r.best > 1) bits.push(t('qmBestStreak', 'best streak {n}', { n: r.best }));
        nm.appendChild(FF.ui.span('gs-row__meta', bits.join(' · ')));
        li.appendChild(nm);
        li.appendChild(FF.ui.span('gs-row__pts', FF.util.formatNumber(r.points || 0)));
        list.appendChild(li);
      });
      box.appendChild(list);
      var go = FF.ui.el('button', { type: 'button', class: 'gs-btn gs-btn--go gs-btn--big' });
      go.appendChild(FF.Icons.icon('trophy'));
      go.appendChild(FF.ui.span('', t('srtSeeScores', 'See scores')));
      go.addEventListener('click', function () { api.audio.play('click'); finish(); });
      box.appendChild(go);
      f.panel.appendChild(box);
      api.audio.play(meWon ? 'winner' : 'roundEnd');
      if (meWon && animationsOn() && FF.Confetti) FF.Confetti.burst(100);
      if (FF.Nav && FF.Nav.focusFirst) FF.Nav.focusFirst(box);
      if (!autoScores) autoScores = setTimeout(finish, AUTO_SCORES_MS);
    }

    render();
  }

  /* ================= room settings ================= */

  function fields() {
    function opt(label, value) { return { label: label, value: value }; }
    return [
      { key: 'mode', label: t('gsAnswerStyle', 'How do you answer?'), options: R.ROOM_MODES.map(function (m) { return opt(modeName(m), m); }) },
      { key: 'level', label: t('gcLevel', 'Level'), options: R.LEVELS.map(function (l) { return opt(levelName(l), l); }) },
      { key: 'time', label: t('lgoTimeEach', 'Time for each logo'), options: ['quick', 'normal', 'relaxed'].map(function (x) { return opt(timeName(x), x); }) },
      { key: 'twist', label: t('lgoTwist', 'Twist'), options: R.TWISTS.map(function (x) { return opt(twistName(x), x); }) },
      { key: 'rounds', label: t('lgoLogos', 'Logos'), options: R.ROUNDS.map(function (n) { return opt(String(n), n); }) }
    ];
  }

  var ROOM = {
    minPlayers: R.MIN_PLAYERS,
    defaults: R.STANDARD,
    fields: function () { return fields(); },
    sanitize: function (s) { return R.sanitizeRoom(s); },
    summary: function (s) { var c = R.sanitizeRoom(s); return summary(c) + ' · ' + t('lgoNLogos', '{n} logos', { n: c.rounds }); },
    start: function (room, pick) { return FF.LogoRushApi.start(room, pick); }
  };

  /* ================= registration ================= */

  FF.registerGame({
    id: 'logoRush',
    name: 'Logo Rush',
    description: 'See a brand’s symbol and name the brand before time runs out. Spell it, pick it, type it, or shout it out with friends.',
    category: 'quiz',
    icon: '🔎',
    players: [1, R.MAX_PLAYERS],
    difficulty: 'Normal',
    duration: 5,
    tags: ['quiz', 'brands', 'logos', 'online', 'race'],
    modes: ['solo', 'turn', 'everyone'],
    defaultMode: 'solo',
    leaderboard: true,
    howToPlay: [
      'A brand’s symbol appears without its name: the Nike tick, the YouTube play button, a football club’s crest.',
      'Name the brand. Spell it with the letter tiles, pick it from a list, or type it yourself on Expert.',
      'Small spelling slips are forgiven, and other known names count (Man Utd, Maccas…). Another brand’s name never does.',
      'Faster right answers score more. Hard brands and typing score extra.',
      'Twists: Zoom out starts close up, Flash hides the logo after a moment, Colourless takes the colours away.',
      'Everyone together on one device? Choose Say it out loud: shout the name, then tap who said it first.'
    ],
    room: ROOM,
    start: function (api) {
      var room = FF.Room && FF.Room.current();
      if (racingRoom(api) && room) { online(api, room); return; }
      // One number decides the whole deal, drawn first so a challenge deals the same everywhere.
      var seed = Math.floor(rand0() * 4294967296);
      var playMode = playModeOf(api.config);
      if (api.config.daily || api.config.challenge) { play(api, R.STANDARD, seed, 'solo'); return; }
      setupScreen(api, playMode, function (cfg) {
        if (!stillShown(api)) return;
        if (!R.isStandard(cfg) || playMode === 'everyone') api.config.customRules = true;
        play(api, cfg, seed, playMode);
      });
    }
  });

  FF.LogoRushGame = { frame: frame, revealCard: revealCard, summary: summary, fields: fields, GROUPS: GROUPS, maskedCells: maskedCells };
})();
