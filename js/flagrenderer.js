/* ============================================================
   FAMILY FUN — flagrenderer.js
   Renders country flags from SVG strings or compact specs.
   Flags are local, sharp (vector) and scale to any resolution.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  const PLACEHOLDER = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200">' +
    '<rect width="300" height="200" fill="#e5e7eb"/>' +
    '<text x="150" y="115" font-size="56" text-anchor="middle">🏳️</text></svg>';

  function starPoints(cx, cy, outer, inner) {
    inner = inner || outer * 0.382;
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = Math.PI / 5 * i - Math.PI / 2;
      pts.push((cx + r * Math.cos(a)).toFixed(1) + ',' + (cy + r * Math.sin(a)).toFixed(1));
    }
    return pts.join(' ');
  }

  function emblem(spec) {
    const t = spec.type;
    const color = spec.color || '#000';
    if (t === 'circle') {
      return '<circle cx="' + (spec.x || 150) + '" cy="' + (spec.y || 100) + '" r="' + (spec.r || 40) + '" fill="' + color + '"/>';
    }
    if (t === 'star') {
      return '<polygon points="' + starPoints(spec.x || 150, spec.y || 100, spec.r || 44) + '" fill="' + color + '"/>';
    }
    if (t === 'starSmall') {
      return '<polygon points="' + starPoints(spec.x || 150, spec.y || 100, spec.r || 18) + '" fill="' + color + '"/>';
    }
    if (t === 'crescent') {
      const cx = spec.x || 150, cy = spec.y || 100, r = spec.r || 44;
      return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + color + '"/>' +
        '<circle cx="' + (cx + r * 0.42) + '" cy="' + cy + '" r="' + (r * 0.82) + '" fill="' + (spec.bg || '#fff') + '"/>';
    }
    if (t === 'sun') {
      const cx = spec.x || 150, cy = spec.y || 100, r = spec.r || 28;
      let out = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + color + '"/>';
      const rays = spec.rays || 12;
      for (let i = 0; i < rays; i++) {
        const a = Math.PI * 2 / rays * i;
        const x1 = cx + Math.cos(a) * (r + 6);
        const y1 = cy + Math.sin(a) * (r + 6);
        const x2 = cx + Math.cos(a) * (r + 16);
        const y2 = cy + Math.sin(a) * (r + 16);
        out += '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" stroke="' + color + '" stroke-width="5" stroke-linecap="round"/>';
      }
      return out;
    }
    return '';
  }

  FF.Flags = {
    placeholder: PLACEHOLDER,

    svg: function (flag) {
      if (!flag) return PLACEHOLDER;
      if (typeof flag === 'string') return flag;
      if (flag.svg) return flag.svg;
      if (flag.spec) return this.fromSpec(flag.spec);
      return PLACEHOLDER;
    },

    // Resolve a real flag file path (if available) for a country flag.
    // Priority: explicit flag.image -> flag.code/opts.code -> none (inline).
    imagePath: function (flag, opts) {
      opts = opts || {};
      if (flag && flag.image) return flag.image;
      const code = (opts.code) || (flag && flag.code) || null;
      if (code) return 'assets/flags/' + code + '.svg';
      return null;
    },

    render: function (flag, opts) {
      opts = opts || {};
      const wrap = FF.ui.div('flag' + (opts.cls ? ' ' + opts.cls : ''));

      // Prefer the real file-based SVG flag, with the inline SVG/spec as
      // an automatic fallback if the file is missing (keeps file:// offline).
      const path = this.imagePath(flag, opts);
      if (path) {
        wrap.appendChild(FF.Assets.img({
          cls: 'flag-file',
          src: path,
          svg: this.svg(flag),
          alt: opts.alt || 'Flag'
        }));
        return wrap;
      }

      // No file flag available: render the inline vector artwork.
      wrap.innerHTML = this.svg(flag);
      const svgEl = wrap.querySelector('svg');
      if (svgEl) {
        svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        if (opts.alt) { wrap.setAttribute('role', 'img'); wrap.setAttribute('aria-label', opts.alt); }
      }
      return wrap;
    },

    fromSpec: function (spec) {
      let body = '';
      const W = 300, H = 200;
      if (spec.type === 'stripes' || spec.type === 'bicolor' || spec.type === 'tricolor-h') {
        const colors = spec.colors || ['#fff'];
        const dir = spec.dir || (spec.type === 'tricolor' ? 'v' : 'h');
        const n = colors.length;
        if (dir === 'h') {
          const h = H / n;
          colors.forEach(function (c, i) {
            body += '<rect y="' + (h * i).toFixed(1) + '" width="' + W + '" height="' + h.toFixed(1) + '" fill="' + c + '"/>';
          });
        } else {
          const w = W / n;
          colors.forEach(function (c, i) {
            body += '<rect x="' + (w * i).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + H + '" fill="' + c + '"/>';
          });
        }
      } else if (spec.type === 'tricolor') {
        body = this.fromSpec({ type: 'stripes', dir: 'v', colors: spec.colors }).replace(/<\/?svg[^>]*>/g, '');
      } else if (spec.type === 'solid') {
        body = '<rect width="' + W + '" height="' + H + '" fill="' + (spec.color || '#fff') + '"/>';
      } else if (spec.type === 'canton') {
        const stripes = spec.stripes || ['#fff'];
        const n = stripes.length;
        const h = H / n;
        stripes.forEach(function (c, i) {
          body += '<rect y="' + (h * i).toFixed(1) + '" width="' + W + '" height="' + h.toFixed(1) + '" fill="' + c + '"/>';
        });
        body += '<rect width="' + (W * 0.45) + '" height="' + (H * 0.5) + '" fill="' + (spec.canton.color || '#003') + '"/>';
        if (spec.canton.emblem) {
          const em = spec.canton.emblem;
          em.x = em.x != null ? em.x : W * 0.22;
          em.y = em.y != null ? em.y : H * 0.25;
          body += emblem(em);
        }
      } else if (spec.type === 'cross' || spec.type === 'nordic') {
        body = '<rect width="' + W + '" height="' + H + '" fill="' + (spec.color || '#fff') + '"/>';
        const cc = spec.crossColor || '#c00';
        const t = spec.crossThickness || 40;
        const verticalX = spec.crossX != null ? spec.crossX : W * 0.37;
        body += '<rect x="' + verticalX + '" width="' + t + '" height="' + H + '" fill="' + cc + '"/>';
        body += '<rect width="' + W + '" height="' + t + '" y="' + ((H - t) / 2) + '" fill="' + cc + '"/>';
      } else {
        body = '<rect width="' + W + '" height="' + H + '" fill="' + (spec.color || '#fff') + '"/>';
      }

      if (spec.emblem) body += emblem(spec.emblem);
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200">' + body + '</svg>';
    }
  };
})();
