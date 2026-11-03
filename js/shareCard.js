/* ============================================================
   PLAYMONA — shareCard.js
   FF.ShareCard draws a brag image on a <canvas>: the game's cover,
   a verdict, both players, a few stats and a QR code that opens
   the same challenge. Story (1080×1920) or square (1080×1080).

   layout(spec) is pure (sizes and boxes, no drawing), so it can be
   tested; render(spec) draws it; choose(spec, name) shows a sheet to
   pick the size and save or share the image.

   spec = { size: 'story'|'square', game, cover (image path or null), tint,
            verdict, sub, players: [{ name, avatar, score, winner, mystery }],
            stats: [{ value, label }], confetti, footer: { hook, cta, url } }

   Made for challenges first; the daily challenge, leaderboard places
   and badges can reuse it with their own spec.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var t = function (k, f, v) {
    if (FF.t) return FF.t(k, f, v);
    return String(f).replace(/\{(\w+)\}/g, function (m, n) { return v && v[n] != null ? v[n] : m; });
  };

  // Fixed brand colours (an image looks the same in either app theme).
  var C = {
    navy: '#0b1030', deep: '#2a1f7a', white: '#ffffff', soft: '#c9cff0', muted: '#4f587e',
    yellow: '#ffc83d', pink: '#ff2f8f', cyan: '#19c3f0', blue: '#1e7bff', purple: '#8b3cf7', green: '#2ec84b', orange: '#ff8a1f'
  };
  var DISPLAY = '"Fredoka", system-ui, sans-serif';
  var BODY = '"Nunito", system-ui, sans-serif';
  var SIZES = { story: { w: 1080, h: 1920 }, square: { w: 1080, h: 1080 } };

  /* ---------- Layout (pure) ---------- */
  function layout(spec) {
    var size = SIZES[spec.size] ? spec.size : 'story';
    var W = SIZES[size].w, H = SIZES[size].h;
    var sq = size === 'square';
    var pad = sq ? 54 : 72;
    var items = [{ type: 'bg', x: 0, y: 0, w: W, h: H }];
    if (spec.confetti) items.push({ type: 'confetti', x: 0, y: 0, w: W, h: H });
    var y = pad;
    items.push({ type: 'brand', x: pad, y: y, w: W - pad * 2, h: sq ? 48 : 60 });
    y += sq ? 70 : 96;
    var coverH = sq ? 230 : 368;
    items.push({ type: 'cover', x: pad, y: y, w: W - pad * 2, h: coverH, r: sq ? 40 : 56, label: spec.game || '' });
    y += coverH + (sq ? 34 : 56);
    var verdictH = sq ? 150 : 210;
    items.push({ type: 'verdict', x: pad, y: y, w: W - pad * 2, h: verdictH, size: sq ? 66 : 88, lines: 2, text: spec.verdict || '' });
    y += verdictH;
    if (spec.sub && !sq) {
      items.push({ type: 'sub', x: pad, y: y, w: W - pad * 2, h: 60, size: 42, text: spec.sub });
      y += 84;
    }
    var footerH = sq ? 178 : 260;
    var footerY = H - pad - footerH;
    var stats = sq ? [] : (spec.stats || []).slice(0, 3);
    var statsH = stats.length ? 150 : 0;
    var statsY = footerY - (stats.length ? statsH + 48 : 0);
    // The duel fills what is left between the verdict and the stats.
    var duelH = Math.max(sq ? 230 : 380, statsY - y - (sq ? 16 : 32));
    var players = (spec.players || []).slice(0, 2);
    var duelY = y;
    var r = sq ? 72 : 112;
    var cy = duelY + (sq ? 30 : 56) + r;
    if (players.length === 1) {
      items.push({ type: 'player', x: W / 2 - r, y: cy - r, w: r * 2, h: r * 2 + (sq ? 110 : 170), r: r, p: players[0], sq: sq });
    } else {
      var gapX = sq ? 270 : 300;
      players.forEach(function (p, i) {
        var cx = i === 0 ? W / 2 - gapX : W / 2 + gapX;
        items.push({ type: 'player', x: cx - r, y: cy - r, w: r * 2, h: r * 2 + (sq ? 110 : 170), r: r, p: p, sq: sq });
      });
      var vr = sq ? 46 : 64;
      items.push({ type: 'vs', x: W / 2 - vr, y: cy - vr, w: vr * 2, h: vr * 2, r: vr });
    }
    if (stats.length) {
      var gap = 24;
      var sw = (W - pad * 2 - gap * (stats.length - 1)) / stats.length;
      stats.forEach(function (s, i) {
        items.push({ type: 'stat', x: pad + i * (sw + gap), y: statsY, w: sw, h: statsH, s: s });
      });
    }
    var f = spec.footer || {};
    var qr = footerH - (sq ? 36 : 48);
    items.push({ type: 'footer', x: pad, y: footerY, w: W - pad * 2, h: footerH, r: sq ? 36 : 48, qr: f.url ? qr : 0,
      hook: f.hook || '', cta: f.cta || '', sq: sq, url: f.url || '' });
    return { w: W, h: H, size: size, items: items, duelH: duelH };
  }

  /* ---------- Drawing ---------- */
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Break text into at most maxLines lines, shrinking the font until it fits.
  function fitText(ctx, text, maxW, size, maxLines, family, weight) {
    for (var s = size; s >= size * 0.55; s -= 2) {
      ctx.font = weight + ' ' + s + 'px ' + family;
      var words = String(text).split(/\s+/), lines = [], line = '';
      for (var i = 0; i < words.length; i++) {
        var next = line ? line + ' ' + words[i] : words[i];
        if (ctx.measureText(next).width <= maxW || !line) line = next;
        else { lines.push(line); line = words[i]; }
      }
      if (line) lines.push(line);
      var widest = lines.reduce(function (m, l) { return Math.max(m, ctx.measureText(l).width); }, 0);
      if (lines.length <= maxLines && widest <= maxW) return { size: s, lines: lines };
    }
    return { size: size * 0.55, lines: [String(text)].slice(0, 1) };
  }

  function loadImage(src) {
    return new Promise(function (resolve) {
      if (!src) { resolve(null); return; }
      var img = new Image();
      var done = false;
      img.onload = function () { if (!done) { done = true; resolve(img); } };
      img.onerror = function () { if (!done) { done = true; resolve(null); } };
      setTimeout(function () { if (!done) { done = true; resolve(null); } }, 4000);
      img.src = src;
    });
  }

  function avatarSrc(p) {
    if (!p || p.mystery || !FF.Avatars) return null;
    try { return FF.Avatars.url(FF.Avatars.normalize(p.avatar, p.name)); } catch (e) { return null; }
  }

  function fontsReady() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    var wait = Promise.all([document.fonts.load('700 88px "Fredoka"'), document.fonts.load('800 40px "Nunito"')]).catch(function () {});
    return Promise.race([wait, new Promise(function (r) { setTimeout(r, 1500); })]);
  }

  var draw = {
    bg: function (ctx, it) {
      var g = ctx.createRadialGradient(it.w / 2, it.h * 0.16, 0, it.w / 2, it.h * 0.16, it.h * 0.9);
      g.addColorStop(0, C.deep);
      g.addColorStop(0.62, C.navy);
      g.addColorStop(1, C.navy);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, it.w, it.h);
      // A soft rainbow glow from the logo's colours.
      [[C.pink, 0.15, 0.25], [C.blue, 0.85, 0.35], [C.green, 0.2, 0.78], [C.yellow, 0.82, 0.86]].forEach(function (c) {
        var gx = it.w * c[1], gy = it.h * c[2];
        var rg = ctx.createRadialGradient(gx, gy, 0, gx, gy, it.w * 0.55);
        rg.addColorStop(0, c[0] + '30');
        rg.addColorStop(1, c[0] + '00');
        ctx.fillStyle = rg;
        ctx.fillRect(0, 0, it.w, it.h);
      });
    },
    confetti: function (ctx, it) {
      var cols = [C.yellow, C.pink, C.green, C.cyan, C.purple, C.orange];
      // Fixed positions, so the same result always makes the same picture.
      for (var i = 0; i < 46; i++) {
        var x = ((i * 7919) % 1000) / 1000 * it.w;
        var y = ((i * 104729) % 1000) / 1000 * it.h * 0.7;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((i * 37) % 360 * Math.PI / 180);
        ctx.fillStyle = cols[i % cols.length];
        ctx.globalAlpha = 0.85;
        if (i % 3) ctx.fillRect(-9, -4, 18, 8);
        else { ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
      }
    },
    brand: function (ctx, it) {
      var dots = [C.cyan, C.pink, C.yellow];
      ctx.font = '700 ' + Math.round(it.h * 0.8) + 'px ' + DISPLAY;
      var label = 'PlayMona';
      var tw = ctx.measureText(label).width;
      var dotR = it.h * 0.14, dotsW = dotR * 2 * 3 + dotR * 2;
      var x = it.x + (it.w - tw - dotsW - 18) / 2;
      dots.forEach(function (c, i) {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(x + dotR + i * dotR * 2.9, it.y + it.h / 2, dotR, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.fillStyle = C.white;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(label, x + dotsW + 18, it.y + it.h / 2 + 2);
    },
    cover: function (ctx, it, assets, spec) {
      ctx.save();
      rr(ctx, it.x, it.y, it.w, it.h, it.r);
      ctx.clip();
      var g = ctx.createLinearGradient(it.x, it.y, it.x + it.w, it.y + it.h);
      g.addColorStop(0, spec.tint || C.purple);
      g.addColorStop(1, C.navy);
      ctx.fillStyle = g;
      ctx.fillRect(it.x, it.y, it.w, it.h);
      var img = assets.cover;
      if (img) {
        var s = Math.max(it.w / img.width, it.h / img.height);
        var dw = img.width * s, dh = img.height * s;
        ctx.drawImage(img, it.x + (it.w - dw) / 2, it.y + (it.h - dh) / 2, dw, dh);
      }
      ctx.restore();
      if (!it.label) return;
      var fs = Math.round(it.h * 0.11);
      ctx.font = '800 ' + fs + 'px ' + BODY;
      var cw = ctx.measureText(it.label).width + fs * 1.4;
      var ch = fs * 1.9;
      var cx = it.x + fs, cy = it.y + it.h - ch - fs * 0.8;
      ctx.fillStyle = C.yellow;
      rr(ctx, cx, cy, cw, ch, ch / 2);
      ctx.fill();
      ctx.fillStyle = C.navy;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(it.label, cx + fs * 0.7, cy + ch / 2 + 1);
    },
    verdict: function (ctx, it) {
      var fit = fitText(ctx, it.text, it.w, it.size, it.lines, DISPLAY, '700');
      ctx.font = '700 ' + fit.size + 'px ' + DISPLAY;
      ctx.fillStyle = C.white;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var lh = fit.size * 1.12;
      var top = it.y + (it.h - lh * fit.lines.length) / 2 + lh / 2;
      fit.lines.forEach(function (l, i) { ctx.fillText(l, it.x + it.w / 2, top + i * lh); });
    },
    sub: function (ctx, it) {
      var fit = fitText(ctx, it.text, it.w, it.size, 1, BODY, '700');
      ctx.font = '700 ' + fit.size + 'px ' + BODY;
      ctx.fillStyle = C.soft;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(fit.lines[0], it.x + it.w / 2, it.y + it.h / 2);
    },
    player: function (ctx, it, assets) {
      var p = it.p, cx = it.x + it.r, cy = it.y + it.r;
      if (p.winner) {
        ctx.fillStyle = 'rgba(255, 200, 61, 0.35)';
        ctx.beginPath(); ctx.arc(cx, cy, it.r + 18, 0, Math.PI * 2); ctx.fill();
        // A simple crown above the winner.
        var cw = it.r * 0.9, chh = it.r * 0.5, bx = cx - cw / 2, by = it.y - chh - 22;
        ctx.fillStyle = C.yellow;
        ctx.beginPath();
        ctx.moveTo(bx, by + chh); ctx.lineTo(bx, by + chh * 0.25); ctx.lineTo(bx + cw * 0.27, by + chh * 0.6);
        ctx.lineTo(cx, by); ctx.lineTo(bx + cw * 0.73, by + chh * 0.6); ctx.lineTo(bx + cw, by + chh * 0.25); ctx.lineTo(bx + cw, by + chh);
        ctx.closePath(); ctx.fill();
      }
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, it.r, 0, Math.PI * 2); ctx.closePath();
      ctx.fillStyle = p.mystery ? 'rgba(255,255,255,0.08)' : C.purple;
      ctx.fill();
      ctx.clip();
      var img = assets.avatars[it.index];
      if (img) ctx.drawImage(img, cx - it.r, cy - it.r, it.r * 2, it.r * 2);
      else {
        ctx.fillStyle = C.white;
        ctx.font = '700 ' + Math.round(it.r) + 'px ' + DISPLAY;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(p.mystery ? '?' : String(p.name || '?').charAt(0).toUpperCase(), cx, cy + 4);
      }
      ctx.restore();
      ctx.lineWidth = it.sq ? 6 : 8;
      ctx.strokeStyle = p.winner ? C.yellow : C.white;
      if (p.mystery) ctx.setLineDash([18, 14]);
      ctx.beginPath(); ctx.arc(cx, cy, it.r, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      var nameSize = it.sq ? 34 : 44;
      var nf = fitText(ctx, p.name || '', it.r * 2.6, nameSize, 1, BODY, '800');
      ctx.font = '800 ' + nf.size + 'px ' + BODY;
      ctx.fillStyle = C.white; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(nf.lines[0], cx, cy + it.r + (it.sq ? 36 : 52));
      ctx.font = '700 ' + (it.sq ? 56 : 76) + 'px ' + DISPLAY;
      ctx.fillStyle = p.winner ? C.yellow : C.white;
      var score = p.score == null ? '???' : FF.util.formatNumber(p.score);
      ctx.fillText(score, cx, cy + it.r + (it.sq ? 88 : 124));
    },
    vs: function (ctx, it) {
      var cx = it.x + it.r, cy = it.y + it.r;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-10 * Math.PI / 180);
      ctx.fillStyle = 'rgba(255, 47, 143, 0.3)';
      ctx.beginPath(); ctx.arc(0, 0, it.r + 14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.pink;
      ctx.beginPath(); ctx.arc(0, 0, it.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.white;
      ctx.font = '700 ' + Math.round(it.r * 0.8) + 'px ' + DISPLAY;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('VS', 0, 3);
      ctx.restore();
    },
    stat: function (ctx, it) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      rr(ctx, it.x, it.y, it.w, it.h, 32);
      ctx.fill();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      var vf = fitText(ctx, it.s.value, it.w - 24, 58, 1, DISPLAY, '700');
      ctx.font = '700 ' + vf.size + 'px ' + DISPLAY;
      ctx.fillStyle = C.white;
      ctx.fillText(vf.lines[0], it.x + it.w / 2, it.y + it.h * 0.4);
      var lf = fitText(ctx, String(it.s.label).toUpperCase(), it.w - 24, 28, 1, BODY, '800');
      ctx.font = '800 ' + lf.size + 'px ' + BODY;
      ctx.fillStyle = C.soft;
      ctx.fillText(lf.lines[0], it.x + it.w / 2, it.y + it.h * 0.76);
    },
    footer: function (ctx, it, assets) {
      ctx.fillStyle = C.white;
      rr(ctx, it.x, it.y, it.w, it.h, it.r);
      ctx.fill();
      var inset = (it.h - it.qr) / 2;
      var textX = it.x + inset;
      if (it.qr && assets.qr) {
        drawQR(ctx, assets.qr, it.x + inset, it.y + inset, it.qr);
        textX = it.x + inset * 2 + it.qr;
      }
      var maxW = it.x + it.w - inset - textX;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      var hf = fitText(ctx, it.hook, maxW, it.sq ? 44 : 56, 2, DISPLAY, '700');
      ctx.font = '700 ' + hf.size + 'px ' + DISPLAY;
      ctx.fillStyle = C.navy;
      var lh = hf.size * 1.1;
      var top = it.y + it.h / 2 - (lh * hf.lines.length + (it.sq ? 40 : 52)) / 2 + lh / 2;
      hf.lines.forEach(function (l, i) { ctx.fillText(l, textX, top + i * lh); });
      var cta = (it.cta ? it.cta + ' · ' : '') + 'playmona.com';
      var cf = fitText(ctx, cta, maxW, it.sq ? 30 : 38, 1, BODY, '800');
      ctx.font = '800 ' + cf.size + 'px ' + BODY;
      ctx.fillStyle = C.muted;
      ctx.fillText(cf.lines[0], textX, top + lh * hf.lines.length + (it.sq ? 14 : 20));
    }
  };

  function makeQR(url) {
    if (!url || typeof window.qrcode !== 'function') return null;
    try {
      var qr = window.qrcode(0, 'M');
      qr.addData(String(url));
      qr.make();
      return qr;
    } catch (e) { return null; }
  }

  // Dark modules on white with the required quiet zone (an inverted code fails on many cameras).
  function drawQR(ctx, qr, x, y, size) {
    var n = qr.getModuleCount(), quiet = 2, cell = size / (n + quiet * 2);
    ctx.fillStyle = C.white;
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = C.navy;
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (qr.isDark(r, c)) ctx.fillRect(Math.floor(x + (c + quiet) * cell), Math.floor(y + (r + quiet) * cell), Math.ceil(cell), Math.ceil(cell));
      }
    }
  }

  FF.ShareCard = {
    SIZES: SIZES,
    layout: layout,

    /* Draw the card. Resolves the canvas. Pictures that fail to load fall back to
       initials and the colour wash, so this never rejects for a missing image. */
    render: function (spec) {
      var L = layout(spec);
      var players = (spec.players || []).slice(0, 2);
      return fontsReady().then(function () {
        return Promise.all([loadImage(spec.cover)].concat(players.map(function (p) { return loadImage(avatarSrc(p)); })));
      }).then(function (imgs) {
        var canvas = document.createElement('canvas');
        canvas.width = L.w;
        canvas.height = L.h;
        var ctx = canvas.getContext('2d');
        var assets = { cover: imgs[0], avatars: imgs.slice(1), qr: makeQR(spec.footer && spec.footer.url) };
        var pi = 0;
        L.items.forEach(function (it) {
          if (it.type === 'player') it.index = pi++;
          try { draw[it.type](ctx, it, assets, spec); } catch (e) { if (window.console) console.warn('[ShareCard]', it.type, e); }
        });
        return canvas;
      });
    },

    toBlob: function (canvas) {
      return new Promise(function (resolve) {
        if (canvas.toBlob) canvas.toBlob(function (b) { resolve(b); }, 'image/png');
        else resolve(null);
      });
    },

    // Share the picture where the phone allows it, else download it.
    save: function (canvas, filename) {
      var name = (filename || 'playmona') + '.png';
      return this.toBlob(canvas).then(function (blob) {
        if (!blob) throw new Error('no image');
        var file = typeof File === 'function' ? new File([blob], name, { type: 'image/png' }) : null;
        if (file && navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
          return navigator.share({ files: [file], title: 'PlayMona' }).catch(function () {});
        }
        var url = URL.createObjectURL(blob);
        var a = FF.ui.el('a', { href: url, download: name, style: { display: 'none' } });
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(url); a.parentNode && a.parentNode.removeChild(a); }, 1000);
      });
    },

    /* A sheet with a preview, a story / square choice and the save button. */
    choose: function (spec, filename) {
      var self = this;
      var state = { size: 'story', canvas: null, token: 0 };
      var preview = FF.ui.div('share-card__preview');
      var body = FF.ui.div('share-card');
      var seg = FF.UI.segmented({
        label: t('cardSize', 'Image size'), value: 'story', compact: true,
        options: [{ label: t('cardStory', 'Story'), value: 'story' }, { label: t('cardSquare', 'Square'), value: 'square' }],
        onChange: function (v) { state.size = v; paint(); }
      });
      body.appendChild(seg.el || seg);
      body.appendChild(preview);
      var sheet = FF.UI.sheet({
        title: t('cardTitle', 'Save your image'), body: body,
        actions: [{ label: t('chSaveImage', 'Save image'), primary: true, icon: 'download', keepOpen: true, onClick: function (api) {
          if (!state.canvas) return;
          self.save(state.canvas, filename).then(function () { api.close(); }, function () {
            FF.UI.toast(t('cardFailed', 'The image could not be saved. Try again.'), { type: 'error' });
          });
        } }]
      });
      function paint() {
        var token = ++state.token;
        state.canvas = null;
        FF.ui.clear(preview);
        preview.appendChild(FF.UI.loading ? FF.UI.loading(t('cardMaking', 'Making your image…')) : FF.ui.span('', '…'));
        self.render(Object.assign({}, spec, { size: state.size })).then(function (canvas) {
          if (token !== state.token) return;
          state.canvas = canvas;
          FF.ui.clear(preview);
          var img = FF.ui.el('img', { class: 'share-card__img share-card__img--' + state.size, alt: t('cardAlt', 'Preview of your image: {text}', { text: spec.verdict || '' }) });
          img.src = canvas.toDataURL('image/png');
          preview.appendChild(img);
        }).catch(function () {
          if (token !== state.token) return;
          FF.ui.clear(preview);
          preview.appendChild(FF.ui.el('p', {}, t('cardFailed', 'The image could not be saved. Try again.')));
        });
      }
      paint();
      return sheet;
    }
  };
})();
