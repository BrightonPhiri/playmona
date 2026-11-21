/* PlayMona Celebrations: moving effects drawn over the TV's opening slide (FF.CelebrateEffects).
   start(canvas, kind, opts) fills the canvas with gentle particles and returns { stop() }.
   Kinds: sparkles (gold stars and glitter), confetti, snow, leaves, petals (rose petals),
   balloons and hearts. One canvas, no library. requestAnimationFrame drives it, with a timer
   as a safety net because hidden or preview tabs throttle animation frames. People who ask for
   less motion get fewer, slower particles.
   opts: { colors: ['#hex', ...] (the event's colours, used by confetti and balloons), scale: 0.4–1 }
   Classic script, ES2017 or older. */
window.FF = window.FF || {};
(function () {
  'use strict';

  var KINDS = [
    ['none', ['celFxNone', 'None']],
    ['sparkles', ['celFxSparkles', 'Gold sparkles']],
    ['confetti', ['celFxConfetti', 'Confetti']],
    ['snow', ['celFxSnow', 'Snow']],
    ['leaves', ['celFxLeaves', 'Leaves']],
    ['petals', ['celFxPetals', 'Rose petals']],
    ['balloons', ['celFxBalloons', 'Balloons']],
    ['hearts', ['celFxHearts', 'Hearts']]
  ];

  var GOLD = ['#f7d27a', '#ffe9a8', '#e0a93b', '#fff6d8'];
  var LEAF = ['#c8641e', '#e08a2c', '#a8401c', '#d9a441', '#8a5a2b'];
  var PETAL = ['#e6395f', '#f06d8a', '#c2183f', '#f9a3b5'];
  var HEART = ['#ff4d6d', '#ff8fa3', '#e0a93b', '#ffffff'];
  var BALLOON = ['#ff5d73', '#ffcf4a', '#5ec8ff', '#9b7bff', '#5fe0a1', '#ff9a3c'];

  // Particles per million pixels of canvas (CSS pixels), and the most there can be.
  var DENSITY = { sparkles: 110, confetti: 90, snow: 130, leaves: 26, petals: 34, balloons: 12, hearts: 26 };
  var MAX = { sparkles: 220, confetti: 180, snow: 260, leaves: 50, petals: 70, balloons: 22, hearts: 50 };

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  function reduced() {
    try { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  }

  function start(canvas, kind, opts) {
    opts = opts || {};
    if (!canvas || !canvas.getContext || !DENSITY[kind]) return { stop: function () {} };
    var ctx = canvas.getContext('2d');
    var calm = reduced();
    var speed = calm ? 0.45 : 1;
    var colors = (opts.colors || []).filter(Boolean);
    var mix = colors.concat(GOLD.slice(0, 2));
    var W = 0, H = 0, dpr = 1, parts = [], stopped = false, last = 0, raf = 0, timer = 0;

    function size() {
      var r = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var want = Math.min(MAX[kind], Math.round(DENSITY[kind] * (W * H) / 1e6 * (opts.scale || 1) * (calm ? 0.4 : 1)));
      want = Math.max(kind === 'balloons' ? 4 : 8, want);
      while (parts.length < want) parts.push(make(true));
      if (parts.length > want) parts.length = want;
    }

    // A new particle; "anywhere" spreads the first ones over the screen instead of the edge.
    function make(anywhere) {
      var u = Math.min(W, H) / 100;   // one hundredth of the shorter side
      var p = { x: rnd(0, W), t: rnd(0, 1000), spin: rnd(-1, 1) };
      if (kind === 'sparkles') {
        p.y = rnd(0, H); p.r = rnd(0.25, 1.1) * u; p.star = Math.random() < 0.35; p.c = pick(GOLD);
        p.vy = -rnd(2, 8); p.vx = rnd(-3, 3); p.tw = rnd(0.8, 2.4);
        if (p.star) p.r *= 2.2;
      } else if (kind === 'confetti') {
        p.y = anywhere ? rnd(-H, H) : rnd(-H * 0.2, -10); p.w = rnd(0.9, 1.7) * u; p.h = p.w * rnd(1.6, 2.6);
        p.c = pick(mix.length ? mix : BALLOON); p.vy = rnd(30, 70); p.vx = rnd(-15, 15); p.rot = rnd(0, 6.28); p.flip = rnd(2, 6);
      } else if (kind === 'snow') {
        p.y = anywhere ? rnd(0, H) : -10; p.r = rnd(0.2, 0.75) * u; p.vy = rnd(14, 40) * (p.r / u + 0.4); p.sway = rnd(10, 30); p.a = rnd(0.5, 0.95);
      } else if (kind === 'leaves' || kind === 'petals') {
        p.y = anywhere ? rnd(-H, H) : rnd(-H * 0.3, -20); p.s = rnd(kind === 'leaves' ? 1.6 : 1.1, kind === 'leaves' ? 3.2 : 2.2) * u;
        p.c = pick(kind === 'leaves' ? LEAF : PETAL); p.vy = rnd(24, 50); p.sway = rnd(20, 60); p.rot = rnd(0, 6.28);
      } else if (kind === 'balloons') {
        p.y = anywhere ? rnd(H * 0.2, H * 1.6) : H + rnd(40, H * 0.5); p.s = rnd(3, 5.5) * u; p.c = pick(colors.length ? colors.concat(BALLOON) : BALLOON);
        p.vy = -rnd(30, 60); p.sway = rnd(10, 26);
      } else { // hearts
        p.y = anywhere ? rnd(0, H * 1.3) : H + rnd(20, 120); p.s = rnd(1.2, 3) * u; p.c = pick(HEART); p.vy = -rnd(30, 70); p.sway = rnd(12, 34);
      }
      return p;
    }

    function star(x, y, r) {
      ctx.beginPath();
      for (var i = 0; i < 8; i++) {
        var a = i * Math.PI / 4, d = i % 2 ? r * 0.28 : r;
        ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
      }
      ctx.closePath();
      ctx.fill();
    }
    function heart(s) {
      ctx.beginPath();
      ctx.moveTo(0, s * 0.35);
      ctx.bezierCurveTo(-s, -s * 0.25, -s * 0.45, -s, 0, -s * 0.45);
      ctx.bezierCurveTo(s * 0.45, -s, s, -s * 0.25, 0, s * 0.35);
      ctx.fill();
    }

    function step(dt) {
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.t += dt;
        if (kind === 'sparkles') {
          p.x += p.vx * dt * speed; p.y += p.vy * dt * speed;
          var a = 0.15 + 0.85 * Math.pow(Math.abs(Math.sin(p.t * p.tw)), 3);
          ctx.globalAlpha = a; ctx.fillStyle = p.c;
          if (p.star) {
            ctx.shadowColor = p.c; ctx.shadowBlur = p.r * 2;
            star(p.x, p.y, p.r * (0.7 + 0.3 * a));
            ctx.shadowBlur = 0;
          } else {
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
          }
          if (p.y < -20 || p.x < -20 || p.x > W + 20) { parts[i] = make(false); parts[i].y = H + 10; }
        } else if (kind === 'confetti') {
          p.y += p.vy * dt * speed; p.x += (p.vx + Math.sin(p.t * 1.3) * 20) * dt * speed; p.rot += p.spin * 3 * dt * speed;
          ctx.globalAlpha = 0.95; ctx.fillStyle = p.c;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.cos(p.t * p.flip));
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
          if (p.y > H + 20) parts[i] = make(false);
        } else if (kind === 'snow') {
          p.y += p.vy * dt * speed; var sx = p.x + Math.sin(p.t * 0.8) * p.sway;
          ctx.globalAlpha = p.a; ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(sx, p.y, p.r, 0, 6.283); ctx.fill();
          if (p.y > H + 10) parts[i] = make(false);
        } else if (kind === 'leaves' || kind === 'petals') {
          p.y += p.vy * dt * speed; p.rot += p.spin * 1.5 * dt * speed;
          var lx = p.x + Math.sin(p.t * 0.7) * p.sway;
          ctx.globalAlpha = 0.92; ctx.fillStyle = p.c;
          ctx.save(); ctx.translate(lx, p.y); ctx.rotate(p.rot); ctx.scale(1, 0.55 + 0.45 * Math.abs(Math.cos(p.t * 1.1)));
          ctx.beginPath();
          if (kind === 'leaves') {
            ctx.moveTo(0, -p.s); ctx.quadraticCurveTo(p.s * 0.7, 0, 0, p.s); ctx.quadraticCurveTo(-p.s * 0.7, 0, 0, -p.s); ctx.fill();
            ctx.strokeStyle = 'rgba(60,25,5,0.45)'; ctx.lineWidth = Math.max(1, p.s * 0.06);
            ctx.beginPath(); ctx.moveTo(0, -p.s * 0.9); ctx.lineTo(0, p.s * 1.15); ctx.stroke();
          } else {
            ctx.moveTo(0, p.s * 0.6); ctx.bezierCurveTo(p.s * 0.9, 0, p.s * 0.5, -p.s * 0.8, 0, -p.s * 0.45);
            ctx.bezierCurveTo(-p.s * 0.5, -p.s * 0.8, -p.s * 0.9, 0, 0, p.s * 0.6); ctx.fill();
          }
          ctx.restore();
          if (p.y > H + 30) parts[i] = make(false);
        } else if (kind === 'balloons') {
          p.y += p.vy * dt * speed; var bx = p.x + Math.sin(p.t * 0.6) * p.sway;
          ctx.globalAlpha = 0.92;
          ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(bx, p.y + p.s * 1.2);
          ctx.quadraticCurveTo(bx + Math.sin(p.t * 1.4) * p.s * 0.4, p.y + p.s * 2.2, bx, p.y + p.s * 3.4); ctx.stroke();
          ctx.fillStyle = p.c;
          ctx.beginPath(); ctx.ellipse(bx, p.y, p.s * 0.85, p.s * 1.1, 0, 0, 6.283); ctx.fill();
          ctx.beginPath(); ctx.moveTo(bx - p.s * 0.15, p.y + p.s * 1.25); ctx.lineTo(bx + p.s * 0.15, p.y + p.s * 1.25); ctx.lineTo(bx, p.y + p.s * 1.05); ctx.fill();
          ctx.globalAlpha = 0.35; ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.ellipse(bx - p.s * 0.3, p.y - p.s * 0.4, p.s * 0.18, p.s * 0.32, -0.5, 0, 6.283); ctx.fill();
          if (p.y < -p.s * 4) parts[i] = make(false);
        } else { // hearts
          p.y += p.vy * dt * speed; var hx = p.x + Math.sin(p.t * 0.9) * p.sway;
          ctx.globalAlpha = Math.max(0, Math.min(0.9, p.y / H * 1.4)); ctx.fillStyle = p.c;
          ctx.save(); ctx.translate(hx, p.y); ctx.rotate(Math.sin(p.t) * 0.25); heart(p.s); ctx.restore();
          if (p.y < -p.s * 2) parts[i] = make(false);
        }
      }
      ctx.globalAlpha = 1;
    }

    function frame(now) {
      if (stopped) return;
      now = now || Date.now();
      var dt = last ? Math.min(0.1, (now - last) / 1000) : 0.016;
      last = now;
      step(dt);
    }
    function loop(ts) {
      if (stopped) return;
      frame(performance.now ? performance.now() : ts);
      raf = requestAnimationFrame(loop);
    }

    size();
    window.addEventListener('resize', size);
    raf = requestAnimationFrame(loop);
    // The safety net: when frames stop coming (a hidden tab), keep moving at about 20 a second.
    timer = setInterval(function () {
      var now = performance.now ? performance.now() : Date.now();
      if (now - last > 120) frame(now);
    }, 50);

    return {
      stop: function () {
        stopped = true;
        cancelAnimationFrame(raf);
        clearInterval(timer);
        window.removeEventListener('resize', size);
        ctx.clearRect(0, 0, W, H);
      }
    };
  }

  FF.CelebrateEffects = { start: start, KINDS: KINDS };
})();
