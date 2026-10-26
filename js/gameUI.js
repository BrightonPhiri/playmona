/* ============================================================
   PLAYMONA — gameUI.js
   Shared in-game building blocks (styles in css/games.css).
   Games build their screens from these instead of inline styles,
   so every game looks consistent, follows the theme, and gives
   feedback that never relies on colour alone.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  function icon(key, fallback) {
    return (FF.Icons && FF.Icons.icon) ? FF.Icons.icon(key, fallback) : FF.ui.span('', fallback || '');
  }

  FF.GameUI = {
    /* Centred column that holds one screen of a game.
       opts: { wide, left, center, className } */
    stage: function (opts) {
      opts = opts || {};
      var cls = 'gm-stage' + (opts.wide ? ' gm-stage--wide' : '') + (opts.left ? ' gm-stage--left' : '') +
        (opts.center ? ' gm-stage--center' : '') + (opts.className ? ' ' + opts.className : '');
      return FF.ui.div(cls);
    },

    /* The question or instruction. size: 'sm' | 'md' | 'xl' */
    prompt: function (text, size, tag) {
      return FF.ui.el(tag || 'h2', { class: 'gm-prompt' + (size && size !== 'md' ? ' gm-prompt--' + size : '') }, text);
    },

    kicker: function (text) { return FF.ui.div('gm-kicker', text); },
    sub: function (text) { return FF.ui.el('p', { class: 'gm-sub' }, text); },
    note: function (text) { return FF.ui.el('p', { class: 'gm-note' }, text); },

    /* A pill with an optional icon. kind: 'turn' for the active player. */
    pill: function (text, iconKey, kind) {
      var p = FF.ui.span('gm-pill' + (kind ? ' gm-pill--' + kind : ''));
      if (iconKey) p.appendChild(icon(iconKey));
      p.appendChild(document.createTextNode(text));
      return p;
    },

    /* Whose turn + round, shown above the question. In a room everyone
       races the same question, so no single player is named. */
    turnBar: function (entity, roundText) {
      var bar = FF.ui.div('gm-turnbar');
      if (FF.Race && FF.Race.active && FF.Race.active()) {
        bar.appendChild(FF.GameUI.pill(FF.t('everyoneRaces', 'Everyone races'), 'lightning', 'turn'));
      } else if (entity && !(FF.Scoring && FF.Scoring._entities && FF.Scoring._entities.length <= 1)) {
        var p = FF.ui.span('gm-pill gm-pill--turn');
        var ava = FF.ui.span('gm-pill__ava');
        ava.appendChild(FF.Players.avatarEl(entity, ''));
        p.appendChild(ava);
        p.appendChild(document.createTextNode(FF.t('turnOf', '{name}’s turn', { name: entity.name })));
        bar.appendChild(p);
      }
      if (roundText) bar.appendChild(FF.GameUI.pill(roundText, 'list-numbers'));
      return bar;
    },

    roundText: function (n, total) {
      // While a game clock decides the end, the total means nothing.
      if (FF.GameLength && (total >= FF.GameLength.UNBOUNDED || FF.GameLength.secondsLeft() != null)) total = 0;
      return total ? FF.t('qOf', 'Question {n} of {total}', { n: n, total: total }) : FF.t('qN', 'Question {n}', { n: n });
    },

    /* Answer options with A/B/C/D markers.
       opts: { columns: 1 | 2 | 'auto', className } */
    options: function (opts) {
      opts = opts || {};
      var cols = opts.columns === 2 ? ' gm-options--2' : (opts.columns === 'auto' ? ' gm-options--auto' : '');
      return FF.ui.el('div', { class: 'gm-options' + cols + (opts.className ? ' ' + opts.className : ''), role: 'group' });
    },

    /* One answer button. index sets the A/B/C/D key; pass -1 for none.
       label may be a string or a node. opts: { media (node), emoji, center, className } */
    option: function (label, onClick, index, opts) {
      opts = opts || {};
      var b = FF.ui.el('button', {
        type: 'button',
        class: 'gm-opt' + (opts.emoji ? ' gm-opt--emoji' : '') + (opts.center ? ' gm-opt--center' : '') + (opts.className ? ' ' + opts.className : '')
      });
      if (index != null && index >= 0 && !opts.emoji) {
        b.appendChild(FF.ui.el('span', { class: 'gm-opt__key', 'aria-hidden': 'true' }, KEYS[index % KEYS.length]));
      }
      if (opts.media) {
        var m = FF.ui.span('gm-opt__media');
        m.appendChild(opts.media);
        b.appendChild(m);
      }
      var lab = FF.ui.span('gm-opt__label');
      if (label && label.nodeType) lab.appendChild(label);
      else lab.textContent = label == null ? '' : String(label);
      b.appendChild(lab);
      var status = FF.ui.span('gm-opt__status');
      b.appendChild(status);
      if (opts.ariaLabel) b.setAttribute('aria-label', opts.ariaLabel);
      if (onClick) b.addEventListener('click', onClick);
      return b;
    },

    /* Mark an answer after the reveal. kind: 'correct' | 'wrong' | 'dim' | 'picked'.
       Adds an icon and a screen-reader word so the state never depends on colour. */
    markOption: function (btn, kind) {
      if (!btn) return;
      btn.classList.remove('gm-opt--correct', 'gm-opt--wrong', 'gm-opt--dim', 'gm-opt--picked');
      if (kind === 'correct' || kind === 'wrong' || kind === 'dim' || kind === 'picked') btn.classList.add('gm-opt--' + kind);
      var status = btn.querySelector('.gm-opt__status');
      if (status) {
        FF.ui.clear(status);
        if (kind === 'correct' || kind === 'wrong') {
          status.appendChild(icon(kind === 'correct' ? 'check-circle' : 'x-circle', kind === 'correct' ? '✓' : '✗'));
          status.appendChild(FF.ui.span('sr-only', kind === 'correct' ? FF.t('correctAnswer', 'Correct answer') : FF.t('wrongAnswer', 'Wrong answer')));
        }
      }
    },

    /* Disable every option in a group (after an answer is locked in). */
    lock: function (container) {
      if (!container) return;
      Array.prototype.forEach.call(container.querySelectorAll('button'), function (b) { b.disabled = true; });
    },

    /* Large two-way choice button. kind: 'yes' | 'no' | 'up' | 'down' | null */
    duoButton: function (label, onClick, kind, iconKey) {
      var b = FF.ui.el('button', { type: 'button', class: 'gm-duo-btn' + (kind ? ' gm-duo-btn--' + kind : '') });
      if (iconKey) b.appendChild(icon(iconKey));
      b.appendChild(FF.ui.span('', label));
      if (onClick) b.addEventListener('click', onClick);
      return b;
    },
    duo: function () { return FF.ui.div('gm-duo'); },

    /* Result message, announced to screen readers.
       kind: 'good' | 'bad' | 'info' | 'tip' */
    feedback: function (kind, text) {
      var iconKey = kind === 'good' ? 'check-circle' : (kind === 'bad' ? 'x-circle' : (kind === 'tip' ? 'lightbulb' : 'info'));
      var box = FF.ui.el('div', { class: 'gm-feedback gm-feedback--' + (kind || 'info'), role: 'status' });
      box.appendChild(icon(iconKey));
      box.appendChild(FF.ui.span('', text));
      return box;
    },

    /* The common "correct, +N points" line. */
    correctText: function (pts, extra) {
      return FF.t('correctPlus', 'Correct! +{n} points', { n: FF.util.formatNumber(pts) }) + (extra ? ' ' + extra : '');
    },

    /* Text input + submit button. Returns { row, input, button }.
       opts: { placeholder, label, buttonLabel, onSubmit(value), maxlength, inputmode } */
    inputRow: function (opts) {
      opts = opts || {};
      var row = FF.ui.el('form', { class: 'gm-input-row', autocomplete: 'off' });
      var input = FF.ui.el('input', {
        type: 'text', class: 'gm-input', placeholder: opts.placeholder || '',
        'aria-label': opts.label || opts.placeholder || FF.t('yourAnswer', 'Your answer'),
        autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
        maxlength: opts.maxlength || null, inputmode: opts.inputmode || null, enterkeyhint: 'done'
      });
      var btn = FF.ui.el('button', { type: 'submit', class: 'btn btn-primary' });
      btn.appendChild(icon(opts.buttonIcon || 'check'));
      btn.appendChild(FF.ui.span('', opts.buttonLabel || FF.t('submit', 'Submit')));
      row.appendChild(input);
      row.appendChild(btn);
      row.addEventListener('submit', function (e) {
        e.preventDefault();
        if (opts.onSubmit) opts.onSubmit(input.value);
      });
      return { row: row, input: input, button: btn };
    },

    tiles: function (letters, opts) {
      opts = opts || {};
      var wrap = FF.ui.el('div', { class: 'gm-tiles', 'aria-label': opts.label || null, role: opts.label ? 'img' : null });
      (letters || []).forEach(function (ch) { wrap.appendChild(FF.ui.span('gm-tile' + (opts.soft ? ' gm-tile--soft' : ''), ch)); });
      return wrap;
    },

    meter: function (fraction) {
      var m = FF.ui.el('div', { class: 'gm-meter', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100' });
      var f = FF.ui.div('gm-meter__fill');
      m.appendChild(f);
      m.set = function (x) {
        x = Math.max(0, Math.min(1, x));
        f.style.width = Math.round(x * 100) + '%';
        m.setAttribute('aria-valuenow', String(Math.round(x * 100)));
        m.classList.toggle('gm-meter--warn', x < 0.25);
      };
      m.set(fraction == null ? 1 : fraction);
      return m;
    },

    media: function (node, large) {
      var m = FF.ui.div('gm-media' + (large ? ' gm-media--lg' : ''));
      if (node) m.appendChild(node);
      return m;
    },

    /* Friendly card for when a game cannot run (missing data). */
    exitCard: function (api, title, text) {
      if (api.shell && api.shell.hideTimer) api.shell.hideTimer();
      FF.ui.clear(api.shell.root);
      var wrap = FF.ui.div('gm-exit');
      wrap.appendChild(FF.UI.emptyState({
        icon: 'alert',
        title: title || FF.t('notReady', 'This game is not ready yet'),
        text: text || FF.t('notReadyText', 'It needs more content before it can be played. Try another game.'),
        action: { label: FF.t('backHome', 'Back to home'), icon: 'house', onClick: function () { FF.Audio.play('click'); FF.GameFlow.exitToHome(); } }
      }));
      api.shell.root.appendChild(wrap);
      FF.Nav.focusFirst(api.shell.root);
    },

    /* Primary action button with an icon (Next, Reveal, Start turn…). */
    action: function (label, onClick, opts) {
      opts = opts || {};
      return FF.UI.button(label, {
        class: (opts.size === 'md' ? '' : 'btn-lg') + (opts.primary === false ? '' : ' btn-primary') + (opts.className ? ' ' + opts.className : ''),
        icon: opts.icon || (opts.primary === false ? null : 'arrow-right'),
        onClick: onClick
      });
    }
  };
})();
