/* ============================================================
   PLAYMONA — assets.js
   Asset manager: local file images with SVG/data fallback,
   inline SVG illustrations, and light preloading.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  function svgToDataUri(svg) {
    if (!svg) return null;
    if (svg.indexOf('data:') === 0) return svg;
    if (svg.indexOf('<svg') !== -1) {
      const clean = svg.replace(/\s+/g, ' ').replace(/#/g, '%23').replace(/"/g, "'");
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }
    return svg;
  }

  FF.Assets = {
    // Build an inline-SVG illustration container.
    illustration: function (svg, cls, altText) {
      const wrap = FF.ui.div(cls || 'illustration');
      if (svg) {
        wrap.innerHTML = svg;
        if (altText) wrap.setAttribute('role', 'img');
        if (altText) wrap.setAttribute('aria-label', altText);
      } else if (altText) {
        wrap.appendChild(FF.ui.div('asset-fallback-text', altText));
      }
      return wrap;
    },

    // Create an <img> with graceful fallback: file -> svg -> text.
    img: function (opts) {
      opts = opts || {};
      const img = document.createElement('img');
      if (opts.cls) img.className = opts.cls;
      if (opts.alt) img.alt = opts.alt;
      img.draggable = false;
      let usedSvg = false;
      img.addEventListener('error', function () {
        if (opts.svg && !usedSvg) {
          usedSvg = true;
          img.src = svgToDataUri(opts.svg);
        } else {
          // final fallback: text
          const parent = img.parentNode;
          if (parent && opts.alt) {
            const t = FF.ui.div('asset-fallback-text', opts.alt);
            parent.insertBefore(t, img);
            if (img.parentNode) img.parentNode.removeChild(img);
          }
        }
      });
      img.src = opts.src || svgToDataUri(opts.svg);
      return img;
    },

    svgUri: svgToDataUri,

    // Optional UI artwork. Missing files are fine: CSS falls back to a
    // category colour wash so the hub never looks broken. The manifest's
    // fingerprint goes on the address, so redrawn art beats the image cache.
    artPath: function (folder, id) {
      var m = FF.AssetManifest;
      var v = m && m[folder] && m[folder][id];
      return 'assets/images/' + folder + '/' + id + '.webp' + (typeof v === 'string' ? '?v=' + v : '');
    },
    // Absolute url() so CSS custom properties in css/styles.css do not
    // resolve against the stylesheet folder (css/assets/images/...).
    cssUrl: function (relPath) {
      var href = relPath;
      try {
        if (typeof URL === 'function' && document.baseURI) {
          href = new URL(relPath, document.baseURI).href;
        }
      } catch (e) {
        href = '../' + relPath;
      }
      return 'url("' + href.replace(/"/g, '\\"') + '")';
    },
    // Whether a piece of optional art exists (js/data/assetManifest.js).
    // Without a manifest, assume it does and let CSS fall back.
    has: function (folder, id) {
      const m = FF.AssetManifest;
      if (!m || !m[folder]) return true;
      return !!m[folder][id];
    },
    // CSS url() for optional art, or 'none' when the file is not bundled,
    // so missing covers never cost a network request.
    artUrl: function (folder, id) {
      if (!this.has(folder, id)) return 'none';
      return this.cssUrl(this.artPath(folder, id));
    },
    // Category colour wash used behind (or instead of) a cover photo.
    wash: function (category) {
      const washes = {
        words:    'linear-gradient(160deg, #6d4aff 0%, #24145a 58%, #120a28 100%)',
        quiz:     'linear-gradient(160deg, #3b82f6 0%, #12305f 58%, #0a182e 100%)',
        visual:   'linear-gradient(160deg, #10b981 0%, #0f3d36 58%, #08201c 100%)',
        memory:   'linear-gradient(160deg, #f97316 0%, #5a2a0c 58%, #2a1408 100%)',
        reaction: 'linear-gradient(160deg, #ef4444 0%, #5a1218 58%, #2a080c 100%)',
        creative: 'linear-gradient(160deg, #ec4899 0%, #5a1640 58%, #2a0c1c 100%)',
        numbers:  'linear-gradient(160deg, #22d3ee 0%, #0d3d4a 58%, #071c24 100%)',
        party:    'linear-gradient(160deg, #eab308 0%, #5a3d08 58%, #2a1c06 100%)',
        world:    'linear-gradient(160deg, #14b8a6 0%, #0d3d38 58%, #071c1a 100%)',
        bible:    'linear-gradient(160deg, #9333ea 0%, #3b1260 58%, #1a0a2c 100%)'
      };
      return washes[category] || 'linear-gradient(160deg, var(--accent) 0%, #121826 100%)';
    },

    // Light preloading of a list of image file paths (best effort).
    preload: function (paths, onProgress) {
      if (!paths || !paths.length) { if (onProgress) onProgress(1); return; }
      let loaded = 0;
      paths.forEach(function (p) {
        if (!p || p.indexOf('<svg') !== -1 || p.indexOf('data:') === 0) {
          loaded++;
          if (onProgress) onProgress(loaded / paths.length);
          return;
        }
        const im = new Image();
        im.onload = im.onerror = function () {
          loaded++;
          if (onProgress) onProgress(loaded / paths.length);
        };
        im.src = p;
      });
    }
  };
})();
