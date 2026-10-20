/* ============================================================
   PLAYMORA — confetti.js
   Lightweight canvas confetti. No external library.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  const COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f97316', '#ec4899', '#eab308', '#ef4444', '#22d3ee'];

  let canvas = null;
  let ctx = null;
  let particles = [];
  let raf = null;

  function ensureCanvas() {
    if (canvas) return true;
    canvas = document.createElement('canvas');
    canvas.className = 'confetti-canvas';
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999;';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    return !!ctx;
  }

  function resize() {
    if (!canvas) return;
    canvas.width = window.innerWidth * (window.devicePixelRatio || 1);
    canvas.height = window.innerHeight * (window.devicePixelRatio || 1);
  }

  function spawn(count, opts) {
    opts = opts || {};
    if (!ensureCanvas()) return;
    resize();
    const W = canvas.width;
    const H = canvas.height;
    for (let i = 0; i < count; i++) {
      particles.push({
        x: opts.x != null ? opts.x * (window.devicePixelRatio || 1) : Math.random() * W,
        y: opts.y != null ? opts.y * (window.devicePixelRatio || 1) : -20 * (window.devicePixelRatio || 1),
        w: (FF.util.int(6, 12)) * (window.devicePixelRatio || 1),
        h: (FF.util.int(8, 16)) * (window.devicePixelRatio || 1),
        color: opts.colors ? FF.util.pick(opts.colors) : FF.util.pick(COLORS),
        vx: (Math.random() - 0.5) * 8,
        vy: Math.random() * 6 + 3,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.3,
        life: 1,
        decay: 0.004 + Math.random() * 0.006,
        shape: Math.random() < 0.7 ? 'rect' : 'circle'
      });
    }
    if (!raf) loop();
  }

  function loop() {
    if (!ctx) { raf = null; return; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles = particles.filter(function (p) { return p.life > 0; });
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.08;
      p.vx *= 0.99;
      p.rot += p.vr;
      p.life -= p.decay;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.shape === 'rect') ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      else { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    if (particles.length > 0) {
      raf = requestAnimationFrame(loop);
    } else {
      raf = null;
      if (canvas) { canvas.width = 0; canvas.height = 0; }
    }
  }

  FF.Confetti = {
    burst: function (count) {
      count = count || 120;
      const W = window.innerWidth;
      spawn(Math.floor(count / 2), { x: W * 0.35, y: 40 });
      spawn(Math.floor(count / 2), { x: W * 0.65, y: 40 });
    },
    rain: function (count) {
      spawn(count || 180);
    },
    sideCannons: function () {
      const W = window.innerWidth;
      spawn(60, { x: 10, y: window.innerHeight * 0.5 });
      spawn(60, { x: W - 10, y: window.innerHeight * 0.5 });
    }
  };
})();
