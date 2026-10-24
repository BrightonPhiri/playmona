/* ============================================================
   PLAYMONA — ui-kit.js
   Shared, accessible UI components built on FF.ui:
   dialog / sheet, toast + screen-reader announcer, switch,
   segmented control, chip, icon button, empty state.
   Every screen uses these instead of hand-rolling its own.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var FOCUSABLE = 'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  var _uid = 0;
  function uid(prefix) { _uid += 1; return (prefix || 'ff') + '-' + _uid; }

  function icon(key, fallback) {
    return (FF.Icons && FF.Icons.icon) ? FF.Icons.icon(key, fallback) : FF.ui.span('', fallback || '');
  }

  function liveRegion() {
    var el = document.getElementById('ff-live');
    if (!el && document.body) {
      el = FF.ui.el('div', { id: 'ff-live', class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' });
      document.body.appendChild(el);
    }
    return el;
  }

  // The seven dots of the PlayMona logo, in the order they sit around the "P":
  // up the left side (pink, orange, green, blue), then down the right (cyan, orange, purple).
  var LOGO_DOTS = ['#ff2f6d', '#ffa51f', '#2ec84b', '#1e9bff', '#19c3f0', '#ff8a1f', '#8b3cf7'];

  FF.UI = {
    uid: uid,
    LOGO_DOTS: LOGO_DOTS,

    /* ---------- Loader: the logo's seven dots chasing round a circle ----------
       opts: { size: 'sm' | 'md' | 'lg' | 'xl' (default 'md'), center: node shown in the
       middle (a photo, an avatar), label: text for screen readers (makes it a status) }. */
    loader: function (opts) {
      opts = opts || {};
      var box = FF.ui.span('pm-loader pm-loader--' + (opts.size || 'md') + (opts.center ? ' pm-loader--ring' : '') + (opts.className ? ' ' + opts.className : ''));
      if (opts.label) {
        box.setAttribute('role', 'status');
        box.setAttribute('aria-label', opts.label);
      } else {
        box.setAttribute('aria-hidden', 'true');
      }
      LOGO_DOTS.forEach(function (color, i) {
        var dot = FF.ui.span('pm-loader__dot');
        dot.style.setProperty('--i', i);
        dot.style.setProperty('--c', color);
        box.appendChild(dot);
      });
      if (opts.center) {
        var mid = FF.ui.span('pm-loader__center');
        mid.appendChild(opts.center);
        box.appendChild(mid);
      }
      return box;
    },

    /* A loader with a line of text, for a panel that is waiting on the network. */
    loading: function (text, opts) {
      opts = opts || {};
      var wrap = FF.ui.div('pm-loading' + (opts.compact ? ' pm-loading--compact' : '') + (opts.className ? ' ' + opts.className : ''));
      wrap.setAttribute('role', 'status');
      wrap.appendChild(FF.UI.loader({ size: opts.size || (opts.compact ? 'sm' : 'md') }));
      wrap.appendChild(FF.ui.span('pm-loading__text', text || FF.t('loading', 'Loading…')));
      return wrap;
    },

    /* Shows a button as busy (the dots replace its label) or back to normal. */
    busy: function (button, on) {
      if (!button) return;
      button.disabled = !!on;
      button.classList.toggle('is-busy', !!on);
      if (on) button.setAttribute('aria-busy', 'true');
      else button.removeAttribute('aria-busy');
    },

    /* ---------- Screen-reader announcements ---------- */
    announce: function (msg) {
      var el = liveRegion();
      if (!el) return;
      el.textContent = '';
      setTimeout(function () { el.textContent = msg; }, 30);
    },

    /* ---------- Toast ----------
       Visual toast plus a polite announcement. type: 'info' | 'success' | 'error' */
    toast: function (msg, opts) {
      opts = opts || {};
      var host = document.getElementById('ff-toasts');
      if (!host) {
        host = FF.ui.div('toast-host');
        host.id = 'ff-toasts';
        document.body.appendChild(host);
      }
      var t = FF.ui.div('toast toast--' + (opts.type || 'info'), msg);
      host.appendChild(t);
      FF.UI.announce(msg);
      setTimeout(function () {
        t.classList.add('toast--out');
        setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 220);
      }, opts.duration || 2200);
      return t;
    },

    /* ---------- Dialog / sheet ----------
       opts: {
         title, body (node | string | node[]), actions: [{ label, primary, danger, icon, onClick, keepOpen }],
         kind: 'dialog' | 'sheet', dismissible (default true), onClose, wide, className
       }
       Returns { el, box, body, close }. On phones a sheet slides up from
       the bottom; on larger screens both render as a centred card. */
    dialog: function (opts) {
      opts = opts || {};
      var previous = document.activeElement;
      var dismissible = opts.dismissible !== false;
      var titleId = uid('dlg-title');

      var overlay = FF.ui.div('ff-dialog ff-dialog--' + (opts.kind || 'dialog') + (opts.className ? ' ' + opts.className : ''));
      var box = FF.ui.el('div', {
        class: 'ff-dialog__box' + (opts.wide ? ' ff-dialog__box--wide' : ''),
        role: opts.role || 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': titleId,
        tabindex: -1
      });

      var head = FF.ui.div('ff-dialog__head');
      head.appendChild(FF.ui.el('h2', { class: 'ff-dialog__title', id: titleId }, opts.title || ''));
      if (dismissible) {
        var x = FF.UI.iconButton('close', FF.t('close', 'Close'), function () { api.close(); }, 'sheet-close');
        head.appendChild(x);
      }
      box.appendChild(head);

      var body = FF.ui.div('ff-dialog__body');
      if (typeof opts.body === 'string') body.appendChild(FF.ui.el('p', {}, opts.body));
      else if (Array.isArray(opts.body)) opts.body.forEach(function (n) { if (n) body.appendChild(n); });
      else if (opts.body) body.appendChild(opts.body);
      box.appendChild(body);

      if (opts.actions && opts.actions.length) {
        var foot = FF.ui.div('ff-dialog__actions');
        opts.actions.forEach(function (a) {
          var b = FF.ui.button('', {
            class: 'btn' + (a.danger ? ' btn-danger' : '') + (a.primary ? ' btn-primary' : ''),
            onClick: function () {
              if (a.onClick) a.onClick(api);
              if (!a.keepOpen) api.close();
            }
          });
          if (a.icon) b.appendChild(icon(a.icon));
          b.appendChild(FF.ui.span('', a.label));
          b.setAttribute('aria-label', a.label);
          foot.appendChild(b);
        });
        box.appendChild(foot);
      }

      overlay.appendChild(box);

      var closed = false;
      var api = {
        el: overlay,
        box: box,
        body: body,
        close: function () {
          if (closed) return;
          closed = true;
          overlay.classList.add('ff-dialog--out');
          setTimeout(function () { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 160);
          document.removeEventListener('focusin', keepFocus, true);
          if (opts.onClose) opts.onClose();
          if (previous && previous.focus && document.contains(previous)) {
            try { previous.focus({ preventScroll: true }); } catch (e) {}
          }
        }
      };

      overlay.addEventListener('click', function (e) {
        if (e.target === overlay && dismissible) api.close();
      });
      overlay.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' || e.key === 'BrowserBack' || e.key === 'GoBack' || e.keyCode === 461) {
          e.stopPropagation();
          e.preventDefault();
          if (dismissible) api.close();
          return;
        }
        if (e.key === 'Tab') {
          var items = Array.prototype.filter.call(box.querySelectorAll(FOCUSABLE), function (n) {
            return n.offsetParent !== null || n === document.activeElement;
          });
          if (!items.length) { e.preventDefault(); return; }
          var first = items[0];
          var last = items[items.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      });

      // If focus escapes (for example a click on the page behind), pull it back.
      function keepFocus(e) {
        if (!closed && overlay.parentNode && !overlay.contains(e.target) &&
            !(e.target.closest && e.target.closest('.ff-dialog'))) {
          try { box.focus({ preventScroll: true }); } catch (err) {}
        }
      }
      document.addEventListener('focusin', keepFocus, true);

      document.body.appendChild(overlay);
      // Focus the first control for keyboard users, the box itself otherwise
      // (so screen readers land inside the dialog without a visible ring).
      var firstControl = body.querySelector(FOCUSABLE) || box.querySelector('.ff-dialog__actions ' + 'button');
      if (FF.Nav && FF.Nav.modality === 'keyboard' && firstControl) FF.Nav.focus(firstControl);
      else { try { box.focus({ preventScroll: true }); } catch (e) {} }
      return api;
    },

    sheet: function (opts) {
      opts = opts || {};
      opts.kind = 'sheet';
      return FF.UI.dialog(opts);
    },

    confirm: function (opts) {
      opts = opts || {};
      return FF.UI.dialog({
        title: opts.title,
        body: opts.body,
        role: 'alertdialog',
        actions: [
          { label: opts.cancelLabel || FF.t('cancel', 'Cancel'), onClick: opts.onCancel },
          { label: opts.confirmLabel || FF.t('confirm', 'Confirm'), primary: !opts.danger, danger: !!opts.danger, icon: opts.icon, onClick: opts.onConfirm }
        ]
      });
    },

    /* ---------- Icon button (label is required for accessibility) ---------- */
    iconButton: function (iconKey, label, onClick, extraCls) {
      var b = FF.ui.el('button', {
        type: 'button',
        class: 'icon-btn' + (extraCls ? ' ' + extraCls : ''),
        'aria-label': label,
        title: label,
        onclick: onClick
      });
      b.appendChild(icon(iconKey));
      return b;
    },

    /* ---------- Switch row ----------
       opts: { label, description, checked, onChange } */
    switchRow: function (opts) {
      var labelId = uid('sw');
      var row = FF.ui.div('setting');
      var text = FF.ui.div('setting__text');
      text.appendChild(FF.ui.el('span', { class: 'setting__label', id: labelId }, opts.label));
      if (opts.description) text.appendChild(FF.ui.el('span', { class: 'setting__desc' }, opts.description));
      row.appendChild(text);
      var sw = FF.ui.el('button', {
        type: 'button',
        class: 'switch' + (opts.checked ? ' on' : ''),
        role: 'switch',
        'aria-checked': opts.checked ? 'true' : 'false',
        'aria-labelledby': labelId
      });
      sw.appendChild(FF.ui.div('switch__knob', ''));
      sw.addEventListener('click', function () {
        var on = sw.getAttribute('aria-checked') !== 'true';
        sw.setAttribute('aria-checked', on ? 'true' : 'false');
        sw.classList.toggle('on', on);
        if (FF.Audio) FF.Audio.play('click');
        if (opts.onChange) opts.onChange(on);
      });
      row.appendChild(sw);
      return row;
    },

    /* ---------- Segmented control (radio group) ----------
       opts: { label (accessible name), options: [{ label, value, icon }], value, onChange, compact }
       Keeps the legacy .seg / .seg__btn.active classes. */
    segmented: function (opts) {
      var wrap = FF.ui.el('div', {
        class: 'seg' + (opts.compact ? ' seg--compact' : ''),
        role: 'radiogroup',
        'aria-label': opts.label || null
      });
      var buttons = [];
      function select(i, focus) {
        buttons.forEach(function (b, j) {
          var on = i === j;
          b.classList.toggle('active', on);
          b.setAttribute('aria-checked', on ? 'true' : 'false');
          b.tabIndex = on ? 0 : -1;
        });
        if (focus) buttons[i].focus();
      }
      opts.options.forEach(function (o, i) {
        var b = FF.ui.el('button', { type: 'button', class: 'seg__btn', role: 'radio' });
        if (o.icon) b.appendChild(icon(o.icon));
        b.appendChild(FF.ui.span('', o.label));
        b.addEventListener('click', function () {
          select(i);
          if (opts.onChange) opts.onChange(o.value, o);
        });
        buttons.push(b);
        wrap.appendChild(b);
      });
      var start = 0;
      opts.options.forEach(function (o, i) { if (o.value === opts.value) start = i; });
      select(start);
      wrap.addEventListener('keydown', function (e) {
        var cur = buttons.indexOf(document.activeElement);
        if (cur === -1) return;
        var next = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (cur + 1) % buttons.length;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (cur - 1 + buttons.length) % buttons.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = buttons.length - 1;
        if (next == null) return;
        e.preventDefault();
        buttons[next].click();
        buttons[next].focus();
      });
      return wrap;
    },

    /* ---------- Labelled setting row wrapping any control ---------- */
    settingRow: function (label, control, description) {
      var row = FF.ui.div('setting setting--stack');
      var text = FF.ui.div('setting__text');
      text.appendChild(FF.ui.el('span', { class: 'setting__label' }, label));
      if (description) text.appendChild(FF.ui.el('span', { class: 'setting__desc' }, description));
      row.appendChild(text);
      row.appendChild(control);
      return row;
    },

    /* ---------- Chip (toggle button) ---------- */
    chip: function (opts) {
      var b = FF.ui.el('button', {
        type: 'button',
        class: 'chip' + (opts.active ? ' active' : '') + (opts.className ? ' ' + opts.className : ''),
        'aria-pressed': opts.active ? 'true' : 'false',
        onclick: opts.onClick
      });
      if (opts.icon) b.appendChild(icon(opts.icon, opts.fallback));
      b.appendChild(FF.ui.span('chip__label', opts.label));
      if (opts.count != null) b.appendChild(FF.ui.span('chip__count', String(opts.count)));
      return b;
    },

    /* ---------- Empty state ----------
       opts: { icon, title, text, action: { label, onClick, icon } } */
    emptyState: function (opts) {
      var box = FF.ui.div('empty-state');
      var ic = FF.ui.div('empty-state__icon');
      ic.appendChild(icon(opts.icon || 'sparkle'));
      box.appendChild(ic);
      if (opts.title) box.appendChild(FF.ui.el('h2', { class: 'empty-state__title' }, opts.title));
      if (opts.text) box.appendChild(FF.ui.el('p', { class: 'empty-state__text' }, opts.text));
      if (opts.action) {
        var b = FF.ui.button('', { class: 'btn btn-primary', onClick: opts.action.onClick });
        if (opts.action.icon) b.appendChild(icon(opts.action.icon));
        b.appendChild(FF.ui.span('', opts.action.label));
        b.setAttribute('aria-label', opts.action.label);
        box.appendChild(b);
      }
      return box;
    },

    /* ---------- Button with leading icon ---------- */
    button: function (label, opts) {
      opts = opts || {};
      var b = FF.ui.button('', { class: 'btn ' + (opts.class || ''), primary: opts.primary, onClick: opts.onClick, ariaLabel: opts.ariaLabel || label });
      if (opts.icon) b.appendChild(icon(opts.icon, opts.fallback));
      b.appendChild(FF.ui.span('', label));
      return b;
    }
  };
})();
