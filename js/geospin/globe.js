/* ============================================================
   PLAYMONA — geospin/globe.js
   GeoSpin's globe: a real 3D Earth (Three.js, loaded only when
   GeoSpin opens) with the NASA Blue Marble surface, country borders
   from Natural Earth (assets/geospin/countries-50m.json), a cloud
   layer, an atmosphere glow, sun glints on the sea and stars.
   It spins, slows and lands with a country facing the player,
   then lights that country's real outline in gold and pulses it.
   Small countries get a zoom and a locator ring; shapes are never
   enlarged. Devices without WebGL get a flat-shaded canvas globe
   with the same borders and the same moves.

     FF.GeoSpinGlobe.preload();                 // start fetching early (setup screen)
     var g = FF.GeoSpinGlobe.create(hostEl);    // g.ready -> Promise
     g.spin('zw', { duration: 3200, elapsed: 0 }) -> Promise (landed)
     g.show('zw')        // face it and light it at once (a rejoin, the reveal)
     g.mark('good'|'bad'|'gold')  // the highlight's colour after an answer
     g.clear(); g.idle(); g.pause(); g.resume(); g.destroy();

   Rendering only runs while the globe is on screen and the tab is
   visible. Spin timing never depends on frames: a spin ends on time
   even if no frame was drawn, so rooms stay in step.
   Classic script, ES5.
   ============================================================ */
window.FF = window.FF || {};

(function () {
  'use strict';

  var THREE_SRC = 'js/vendor/three.min.js';
  var TOPO_SRC = 'assets/geospin/countries-50m.json';
  var EARTH_4K = 'assets/geospin/earth-4k.webp';
  var EARTH_2K = 'assets/geospin/earth-2k.webp';
  var OCEAN_SRC = 'assets/geospin/ocean-2k.webp';
  var CLOUDS_SRC = 'assets/geospin/clouds-1k.webp';
  var DEG = Math.PI / 180;
  var TAU = Math.PI * 2;
  var SMALL_SPAN = 3;            // degrees: smaller countries get a locator ring
  var TILT_MAX = 58;             // big countries far north or south stop a little short of facing straight on
  var IDLE_SPEED = 0.08;         // radians a second while waiting

  var GOLD = '#ffc940', GOLD_HI = '#fff1b3', CYAN = '#3ee6ff', GOOD = '#4dffa6', BAD = '#ff6b8a';

  /* ---------- loading (once per page) ---------- */

  var loads = {};
  function loadScript(src) {
    if (loads[src]) return loads[src];
    loads[src] = new Promise(function (resolve, reject) {
      if (src === THREE_SRC && window.THREE) { resolve(); return; }
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { delete loads[src]; reject(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
    return loads[src];
  }
  function loadJSON(src) {
    if (loads[src]) return loads[src];
    loads[src] = fetch(src).then(function (r) {
      if (!r.ok) throw new Error(src + ' ' + r.status);
      return r.json();
    }).catch(function (e) { delete loads[src]; throw e; });
    return loads[src];
  }
  function loadImage(src) {
    if (loads[src]) return loads[src];
    loads[src] = new Promise(function (resolve, reject) {
      var img = new Image();
      img.decoding = 'async';
      img.onload = function () { resolve(img); };
      img.onerror = function () { delete loads[src]; reject(new Error('Could not load ' + src)); };
      img.src = src;
    });
    return loads[src];
  }

  var glOk = null;
  function webglOk() {
    if (glOk != null) return glOk;
    try {
      var c = document.createElement('canvas');
      glOk = !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
    } catch (e) { glOk = false; }
    return glOk;
  }
  function bigScreen() {
    var w = Math.max(window.screen ? window.screen.width : 0, window.innerWidth || 0);
    var mem = navigator.deviceMemory || 8;
    return w * Math.min(window.devicePixelRatio || 1, 2) >= 1500 && mem >= 4;
  }
  function reducedMotion() {
    try {
      if (document.documentElement.getAttribute('data-reduce') === '1') return true;
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { return false; }
  }

  /* Everything both renderers need: the borders, decoded once. */
  var geoPromise = null;
  function geo() {
    if (!geoPromise) geoPromise = loadJSON(TOPO_SRC).then(decodeTopo).catch(function (e) { geoPromise = null; throw e; });
    return geoPromise;
  }
  function preload() {
    var jobs = [geo()];
    if (webglOk()) {
      jobs.push(loadScript(THREE_SRC));
      jobs.push(loadImage(bigScreen() ? EARTH_4K : EARTH_2K));
    }
    return Promise.all(jobs).catch(function () { /* the globe will retry or fall back */ });
  }

  /* ---------- TopoJSON (only what GeoSpin needs) ---------- */

  function decodeTopo(topo) {
    var tf = topo.transform;
    var arcs = topo.arcs.map(function (arc) {
      var x = 0, y = 0;
      return arc.map(function (p) {
        x += p[0]; y += p[1];
        return [x * tf.scale[0] + tf.translate[0], y * tf.scale[1] + tf.translate[1]];
      });
    });
    function ring(ids) {
      var pts = [];
      ids.forEach(function (id) {
        var a = id < 0 ? arcs[~id].slice().reverse() : arcs[id];
        for (var k = pts.length ? 1 : 0; k < a.length; k++) pts.push(a[k]);
      });
      return pts;
    }
    var shapes = topo.objects.countries.geometries.map(function (g) {
      if (g.type === 'Polygon') return [g.arcs.map(ring)];
      if (g.type === 'MultiPolygon') return g.arcs.map(function (poly) { return poly.map(ring); });
      return [];
    });
    return { arcs: arcs, shapes: shapes };
  }

  /* Rings of a country, each with its longitudes unwrapped so it never jumps across the date line. */
  function countryRings(G, code) {
    var p = place(code);
    if (!p) return [];
    var out = [];
    p[0].forEach(function (i) {
      (G.shapes[i] || []).forEach(function (poly) {
        poly.forEach(function (r, hole) {
          var prev = null, shift = 0;
          out.push({
            hole: hole > 0,
            pts: r.map(function (q) {
              var lon = q[0] + shift;
              if (prev != null) {
                if (lon - prev > 180) { shift -= 360; lon -= 360; } else if (prev - lon > 180) { shift += 360; lon += 360; }
              }
              prev = lon;
              return [lon, q[1]];
            })
          });
        });
      });
    });
    return out;
  }

  function place(code) { var P = FF.data && FF.data.geoSpinPlaces; return P ? P[code] : null; }

  /* Where the globe stops for a country: its middle, tilted at most TILT_MAX for big ones. */
  function poseFor(code) {
    var p = place(code);
    if (!p) return { lat: 0, lon: 0, span: 30, small: false };
    var lat = p[1];
    if (p[3] > 12) lat = Math.max(-TILT_MAX, Math.min(TILT_MAX, lat));
    return { lat: lat, lon: p[2], span: p[3], small: p[3] < SMALL_SPAN };
  }

  /* Camera distance (in globe radii from the centre) for a country of this span. */
  function zoomFor(span) {
    if (span >= 24) return 1;
    if (span >= 14) return 0.72;
    if (span >= 8) return 0.5;
    if (span >= 4) return 0.36;
    if (span >= 2) return 0.27;
    if (span >= 1) return 0.22;
    return 0.2;
  }

  function ease(t) { return 1 - Math.pow(1 - t, 4); }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* Rotation about the vertical axis that brings this longitude to face the camera. */
  function spinFor(lon) {
    var phi = (lon + 180) * DEG;
    var x = -Math.cos(phi), z = Math.sin(phi);
    return -Math.atan2(x, z);
  }

  /* ---------- the highlight picture (one country, drawn on its own patch of sphere) ---------- */

  function highlightCanvas(rings, tone) {
    var minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
    rings.forEach(function (r) {
      r.pts.forEach(function (q) {
        if (q[0] < minLon) minLon = q[0];
        if (q[0] > maxLon) maxLon = q[0];
        if (q[1] < minLat) minLat = q[1];
        if (q[1] > maxLat) maxLat = q[1];
      });
    });
    var w = Math.max(maxLon - minLon, 0.05), h = Math.max(maxLat - minLat, 0.05);
    var ppd = Math.min(160, 1800 / Math.max(w, h * 1.4));
    var pad = 22 / ppd;
    minLon -= pad; maxLon += pad; minLat = Math.max(-89.9, minLat - pad); maxLat = Math.min(89.9, maxLat + pad);
    w = maxLon - minLon; h = maxLat - minLat;
    var cw = Math.max(8, Math.min(2048, Math.ceil(w * ppd))), ch = Math.max(8, Math.min(2048, Math.ceil(h * ppd)));
    var c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    var x = c.getContext('2d');
    function path() {
      x.beginPath();
      rings.forEach(function (r) {
        r.pts.forEach(function (q, i) {
          var px = (q[0] - minLon) / w * cw, py = (maxLat - q[1]) / h * ch;
          if (i) x.lineTo(px, py); else x.moveTo(px, py);
        });
        x.closePath();
      });
    }
    var line = tone === 'good' ? GOOD : tone === 'bad' ? BAD : tone === 'cyan' ? CYAN : GOLD;
    // Fill: a warm wash that lets the land show through.
    path();
    var grad = x.createLinearGradient(0, 0, cw, ch);
    grad.addColorStop(0, tone === 'good' ? 'rgba(77,255,166,0.55)' : tone === 'bad' ? 'rgba(255,107,138,0.5)' : 'rgba(255,201,64,0.58)');
    grad.addColorStop(1, tone === 'good' ? 'rgba(62,230,255,0.45)' : tone === 'bad' ? 'rgba(255,160,64,0.45)' : 'rgba(255,140,40,0.5)');
    x.fillStyle = grad;
    x.fill('evenodd');
    // Glowing outline: a wide soft glow, then a crisp bright edge.
    x.lineJoin = 'round';
    x.lineCap = 'round';
    x.shadowColor = line;
    x.shadowBlur = 14;
    x.strokeStyle = line;
    x.lineWidth = 4;
    path();
    x.stroke();
    x.shadowBlur = 0;
    x.strokeStyle = GOLD_HI;
    x.lineWidth = 1.6;
    path();
    x.stroke();
    return { canvas: c, minLon: minLon, maxLon: maxLon, minLat: minLat, maxLat: maxLat };
  }

  /* ================= WebGL (Three.js) ================= */

  function webglGlobe(host, G, earthImg, opts) {
    var THREE = window.THREE;
    var still = reducedMotion();
    var canvas = document.createElement('canvas');
    canvas.className = 'gs-globe__canvas';
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);

    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(30, 1, 0.05, 200);
    var baseDist = 5;

    var tilt = new THREE.Group();
    var spinner = new THREE.Group();
    tilt.add(spinner);
    scene.add(tilt);

    var aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1);
    function tex(img) {
      var t = new THREE.Texture(img);
      if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = aniso;
      t.needsUpdate = true;
      return t;
    }

    // The Earth.
    var earthMat = new THREE.MeshPhongMaterial({ map: tex(earthImg), specular: new THREE.Color(0x3a5a8c), shininess: 22 });
    var earth = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), earthMat);
    spinner.add(earth);
    loadImage(OCEAN_SRC).then(function (img) {
      if (dead) return;
      var t = new THREE.Texture(img); t.needsUpdate = true;
      earthMat.specularMap = t;
      earthMat.needsUpdate = true;
      dirty = true;
    }, function () { /* glints are optional */ });

    // Country borders: every arc once, a hair above the surface.
    var pos = [];
    function v3(lon, lat, r) {
      var phi = (lon + 180) * DEG, th = (90 - lat) * DEG;
      return [-r * Math.cos(phi) * Math.sin(th), r * Math.cos(th), r * Math.sin(phi) * Math.sin(th)];
    }
    G.arcs.forEach(function (arc) {
      for (var i = 1; i < arc.length; i++) {
        var a = arc[i - 1], b = arc[i];
        if (Math.abs(a[0] - b[0]) > 180) continue;
        var p = v3(a[0], a[1], 1.0018), q = v3(b[0], b[1], 1.0018);
        pos.push(p[0], p[1], p[2], q[0], q[1], q[2]);
      }
    });
    var borderGeo = new THREE.BufferGeometry();
    borderGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    var borderMat = new THREE.LineBasicMaterial({ color: 0xf4f0ff, transparent: true, opacity: 0.42, depthWrite: false });
    var borders = new THREE.LineSegments(borderGeo, borderMat);
    spinner.add(borders);

    // Clouds drift a little on their own.
    var clouds = null;
    loadImage(CLOUDS_SRC).then(function (img) {
      if (dead) return;
      var t = new THREE.Texture(img); t.needsUpdate = true;
      clouds = new THREE.Mesh(new THREE.SphereGeometry(1.014, 96, 64),
        new THREE.MeshPhongMaterial({ color: 0xffffff, alphaMap: t, transparent: true, opacity: 0.3, depthWrite: false, shininess: 0 }));
      spinner.add(clouds);
      dirty = true;
    }, function () { /* clouds are optional */ });

    // Atmosphere: a soft blue-violet halo round the edge, and a thin rim of light on the globe.
    var haloMat = new THREE.ShaderMaterial({
      uniforms: { c1: { value: new THREE.Color(0x4fc3ff) }, c2: { value: new THREE.Color(0x8a5cff) } },
      vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 c1; uniform vec3 c2; varying vec3 vN; void main(){ float i = pow(clamp(0.78 - dot(vN, vec3(0.0,0.0,1.0)), 0.0, 1.0), 2.6); gl_FragColor = vec4(mix(c1, c2, clamp(vN.y*0.5+0.5,0.0,1.0)) , 1.0) * i * 1.6; }',
      side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false
    });
    var halo = new THREE.Mesh(new THREE.SphereGeometry(1.16, 64, 48), haloMat);
    scene.add(halo);
    var rimMat = new THREE.ShaderMaterial({
      uniforms: { c: { value: new THREE.Color(0x6fd6ff) } },
      vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 c; varying vec3 vN; void main(){ float i = pow(1.0 - clamp(dot(vN, vec3(0.0,0.0,1.0)),0.0,1.0), 3.2); gl_FragColor = vec4(c * i, i * 0.9); }',
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false
    });
    var rim = new THREE.Mesh(new THREE.SphereGeometry(1.02, 64, 48), rimMat);
    scene.add(rim);

    // Light: a warm sun up and to the left of the camera, a violet back light for the edge.
    scene.add(new THREE.AmbientLight(0x9aa8ff, 0.9));
    var sun = new THREE.DirectionalLight(0xfff4e0, 2.6);
    sun.position.set(-3.2, 2.2, 4.2);
    scene.add(sun);
    var back = new THREE.DirectionalLight(0x9b6bff, 1.2);
    back.position.set(3, -1, -3);
    scene.add(back);

    // Stars far behind, and a few slow sparks circling the globe.
    function points(n, rMin, rMax, size, color, opacity) {
      var p = [];
      for (var i = 0; i < n; i++) {
        var u = Math.random() * 2 - 1, a = Math.random() * TAU, r = rMin + Math.random() * (rMax - rMin);
        var s = Math.sqrt(1 - u * u);
        p.push(r * s * Math.cos(a), r * u, r * s * Math.sin(a) - (rMin > 10 ? 20 : 0));
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      return new THREE.Points(g, new THREE.PointsMaterial({ size: size, color: color, transparent: true, opacity: opacity, depthWrite: false, sizeAttenuation: true }));
    }
    var stars = points(900, 30, 60, 0.16, 0xdfe6ff, 0.85);
    scene.add(stars);
    var sparks = points(70, 1.35, 2.1, 0.022, 0xffd77a, 0.7);
    scene.add(sparks);

    // The highlight patch and the locator ring.
    var hl = null, hlTone = 'gold', hlCode = null, hlStart = 0, hlFade = 0;
    var ring = null;
    function dropHighlight() {
      if (hl) { spinner.remove(hl); hl.geometry.dispose(); hl.material.map.dispose(); hl.material.dispose(); hl = null; }
      if (ring) { spinner.remove(ring); ring.children.forEach(function (m) { m.geometry.dispose(); m.material.dispose(); }); ring = null; }
    }
    function makeHighlight(code, tone) {
      dropHighlight();
      hlCode = code; hlTone = tone || 'gold';
      var rings = countryRings(G, code);
      var pose = poseFor(code);
      if (rings.length) {
        var h = highlightCanvas(rings, hlTone);
        var t = new THREE.CanvasTexture(h.canvas);
        if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = aniso;
        var phiStart = (h.minLon + 180) * DEG, phiLen = (h.maxLon - h.minLon) * DEG;
        var thStart = (90 - h.maxLat) * DEG, thLen = (h.maxLat - h.minLat) * DEG;
        var segW = Math.max(8, Math.min(128, Math.ceil(phiLen / DEG / 1.5))), segH = Math.max(6, Math.min(96, Math.ceil(thLen / DEG / 1.5)));
        hl = new THREE.Mesh(new THREE.SphereGeometry(1.0032, segW, segH, phiStart, phiLen, thStart, thLen),
          new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0 }));
        hl.renderOrder = 3;
        spinner.add(hl);
      }
      if (pose.small || !rings.length) {
        ring = new THREE.Group();
        var color = new THREE.Color(hlTone === 'good' ? GOOD : hlTone === 'bad' ? BAD : GOLD);
        var r0 = 0.03;
        [0, 1].forEach(function (k) {
          var m = new THREE.Mesh(new THREE.RingGeometry(r0 * (k ? 1 : 0.82), r0 * (k ? 1.18 : 1), 64),
            new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
          ring.add(m);
        });
        var p = v3(pose.lon, place(code) ? place(code)[1] : pose.lat, 1.006);
        ring.position.set(p[0], p[1], p[2]);
        ring.lookAt(p[0] * 2, p[1] * 2, p[2] * 2);
        ring.renderOrder = 4;
        spinner.add(ring);
      }
      hlStart = now();
      dirty = true;
    }

    /* ---------- pose and motion ---------- */

    var pose = { spin: 0, tilt: 0.25, zoom: 1 };
    var anim = null;       // { from, to, start, duration, code, resolve }
    var idle = true;
    var dead = false, paused = false, raf = 0, dirty = true, last = 0;
    function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }

    function size() {
      var w = host.clientWidth || 300, h = host.clientHeight || 300;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      var fit = 1.24;      // globe plus halo
      var half = Math.tan(15 * DEG);
      baseDist = fit / (half * Math.min(1, camera.aspect)) + 0.0;
      camera.updateProjectionMatrix();
      dirty = true;
    }

    function apply() {
      spinner.rotation.y = pose.spin;
      tilt.rotation.x = pose.tilt;
      var d = 1 + (baseDist - 1) * pose.zoom;
      camera.position.set(0, 0, d);
      camera.lookAt(0, 0, 0);
      halo.visible = pose.zoom > 0.66;
      stars.visible = pose.zoom > 0.6;
    }

    function step(t) {
      var dt = last ? Math.min(0.1, (t - last) / 1000) : 0;
      last = t;
      if (anim) {
        var p = clamp01((t - anim.start) / anim.duration);
        var e = still ? easeInOut(p) : ease(p);
        pose.spin = lerp(anim.from.spin, anim.to.spin, e);
        pose.tilt = lerp(anim.from.tilt, anim.to.tilt, easeInOut(clamp01(p * 1.15)));
        // Zoom out early in the spin, in to the country at the end.
        var zOut = Math.min(anim.from.zoom, 1);
        pose.zoom = p < 0.55 ? lerp(anim.from.zoom, 1, easeInOut(clamp01(p / 0.3))) : lerp(1, anim.to.zoom, easeInOut(clamp01((p - 0.6) / 0.4)));
        if (zOut === 1 && p < 0.55) pose.zoom = 1;
        if (p >= 1) { var done = anim; anim = null; pose.spin = done.to.spin; pose.tilt = done.to.tilt; pose.zoom = done.to.zoom; }
      } else if (idle) {
        pose.spin += IDLE_SPEED * dt * (still ? 0.3 : 1);
      }
      if (clouds) clouds.rotation.y += dt * 0.012;
      sparks.rotation.y -= dt * 0.05;
      stars.rotation.y += dt * 0.003;
      // Highlight: fades in as the globe lands, then breathes.
      if (hl || ring) {
        var land = anim ? clamp01((t - anim.start) / anim.duration) : 1;
        var vis = anim ? clamp01((land - 0.78) / 0.22) : 1;
        var pulse = still ? 0.9 : 0.78 + 0.22 * Math.sin((t - hlStart) / 260);
        if (hl) hl.material.opacity = vis * pulse;
        if (ring) {
          var k = ((t - hlStart) % 1600) / 1600;
          ring.children[0].material.opacity = vis * 0.95;
          ring.children[1].material.opacity = vis * (still ? 0.6 : 0.9 * (1 - k));
          var s = still ? 1.4 : 1 + k * 2.2;
          ring.children[1].scale.set(s, s, s);
          var rs = Math.max(0.35, (1 + (baseDist - 1) * pose.zoom - 1) / (baseDist - 1));
          ring.scale.set(rs, rs, rs);
        }
      }
      apply();
      renderer.render(scene, camera);
    }

    function loop(t) {
      raf = 0;
      if (dead || paused) return;
      if (!host.isConnected) { stop(); return; }
      step(t);
      raf = requestAnimationFrame(loop);
    }
    function start() { if (!raf && !dead && !paused) raf = requestAnimationFrame(loop); }
    function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; last = 0; }

    function onVisible() { if (document.hidden) stop(); else start(); }
    document.addEventListener('visibilitychange', onVisible);
    var ro = window.ResizeObserver ? new ResizeObserver(function () { size(); if (!raf) { step(now()); } }) : null;
    if (ro) ro.observe(host); else window.addEventListener('resize', size);

    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      if (opts.onLost) opts.onLost();
    });

    size();
    pose.spin = spinFor(20);
    apply();
    step(now());
    start();

    function target(code) {
      var ps = poseFor(code);
      return { spin: spinFor(ps.lon), tilt: ps.lat * DEG, zoom: zoomFor(ps.span) };
    }

    return {
      mode: 'webgl',
      el: canvas,
      spin: function (code, o) {
        o = o || {};
        var duration = Math.max(200, o.duration || 3200);
        var elapsed = Math.max(0, o.elapsed || 0);
        var to = target(code);
        var turns = still ? 0 : (duration >= 2000 ? 1 : 0);
        var delta = ((to.spin - pose.spin) % TAU + TAU) % TAU;
        to.spin = pose.spin + delta + turns * TAU;
        idle = false;
        makeHighlight(code, o.tone || 'gold');
        var t0 = now() - elapsed;
        anim = { from: { spin: pose.spin, tilt: pose.tilt, zoom: pose.zoom }, to: to, start: t0, duration: duration };
        start();
        var left = Math.max(0, duration - elapsed);
        return new Promise(function (resolve) { setTimeout(resolve, left); });
      },
      show: function (code, tone) {
        var to = target(code);
        anim = null; idle = false;
        pose.spin = to.spin; pose.tilt = to.tilt; pose.zoom = to.zoom;
        if (hlCode !== code || !hl && !ring || (tone && tone !== hlTone)) makeHighlight(code, tone || hlTone);
        hlStart = now();
        dirty = true;
        start();
      },
      mark: function (tone) { if (hlCode) { makeHighlight(hlCode, tone); } },
      clear: function () { dropHighlight(); hlCode = null; },
      idle: function () { dropHighlight(); hlCode = null; anim = null; idle = true; pose.zoom = 1; start(); },
      pause: function () { paused = true; stop(); },
      resume: function () { paused = false; start(); },
      renderOnce: function () { step(now()); },
      destroy: function () {
        dead = true; stop();
        document.removeEventListener('visibilitychange', onVisible);
        if (ro) ro.disconnect(); else window.removeEventListener('resize', size);
        dropHighlight();
        scene.traverse(function (o) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            ['map', 'specularMap', 'alphaMap'].forEach(function (k) { if (o.material[k]) o.material[k].dispose(); });
            o.material.dispose();
          }
        });
        renderer.dispose();
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      }
    };
  }

  /* ================= Canvas fallback (no WebGL) ================= */

  var PALETTE = ['#5f9f4a', '#7aa851', '#9c9a52', '#b98e55', '#6d9a5c', '#8aa35a', '#a7a35e', '#c49a62'];

  function canvasGlobe(host, G) {
    var still = reducedMotion();
    var canvas = document.createElement('canvas');
    canvas.className = 'gs-globe__canvas';
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 300, H = 300;

    var colours = G.shapes.map(function (s, i) { return PALETTE[(i * 7 + 3) % PALETTE.length]; });
    var pose = { lon: 20, lat: 15, zoom: 1 };
    var anim = null, idle = true, hlCode = null, hlTone = 'gold', hlRings = null, hlShapes = {}, hlStart = 0;
    var dead = false, paused = false, raf = 0, last = 0;
    function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }

    function size() {
      W = host.clientWidth || 300; H = host.clientHeight || 300;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    }

    function draw(t) {
      var R = Math.min(W, H) * 0.42 / pose.zoom;
      var cx = W / 2, cy = H / 2;
      var l0 = pose.lon * DEG, p0 = pose.lat * DEG, sp0 = Math.sin(p0), cp0 = Math.cos(p0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      // Halo and ocean.
      var halo = ctx.createRadialGradient(cx, cy, R * 0.95, cx, cy, R * 1.18);
      halo.addColorStop(0, 'rgba(79,195,255,0.55)'); halo.addColorStop(1, 'rgba(138,92,255,0)');
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, R * 1.18, 0, TAU); ctx.fill();
      var sea = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.35, R * 0.1, cx, cy, R);
      sea.addColorStop(0, '#2f6fd6'); sea.addColorStop(1, '#0a1f5c');
      ctx.fillStyle = sea; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
      function proj(q) {
        var l = q[0] * DEG - l0, p = q[1] * DEG, cp = Math.cos(p), sp = Math.sin(p);
        var x = cp * Math.sin(l), y = cp0 * sp - sp0 * cp * Math.cos(l);
        var cz = sp0 * sp + cp0 * cp * Math.cos(l);
        if (cz < 0) { var m = Math.sqrt(x * x + y * y) || 1; x /= m; y /= m; }
        return [cx + x * R, cy - y * R, cz];
      }
      function trace(poly) {
        poly.forEach(function (r) {
          var any = false;
          var pts = r.map(function (q) { var p = proj(q); if (p[2] > 0) any = true; return p; });
          if (!any) return;
          pts.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
          ctx.closePath();
        });
      }
      ctx.lineWidth = 0.6;
      ctx.strokeStyle = 'rgba(244,240,255,0.45)';
      G.shapes.forEach(function (shape, i) {
        ctx.beginPath();
        shape.forEach(trace);
        ctx.fillStyle = colours[i];
        ctx.fill('evenodd');
        ctx.stroke();
      });
      if (hlCode) {
        var land = anim ? clamp01((t - anim.start) / anim.duration) : 1;
        var vis = anim ? clamp01((land - 0.78) / 0.22) : 1;
        var pulse = still ? 0.9 : 0.75 + 0.25 * Math.sin((t - hlStart) / 260);
        var line = hlTone === 'good' ? GOOD : hlTone === 'bad' ? BAD : GOLD;
        ctx.globalAlpha = vis * pulse;
        ctx.beginPath();
        (place(hlCode) || [[]])[0].forEach(function (i) { (G.shapes[i] || []).forEach(trace); });
        ctx.fillStyle = hlTone === 'good' ? 'rgba(77,255,166,0.6)' : hlTone === 'bad' ? 'rgba(255,107,138,0.55)' : 'rgba(255,201,64,0.65)';
        ctx.fill('evenodd');
        ctx.shadowColor = line; ctx.shadowBlur = 12; ctx.strokeStyle = line; ctx.lineWidth = 2.4; ctx.stroke();
        ctx.shadowBlur = 0;
        var ps = poseFor(hlCode);
        if (ps.small || !(place(hlCode) || [[]])[0].length) {
          var c = proj([place(hlCode)[2], place(hlCode)[1]]);
          var k = still ? 0.4 : ((t - hlStart) % 1600) / 1600;
          ctx.strokeStyle = line; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(c[0], c[1], 9, 0, TAU); ctx.stroke();
          ctx.globalAlpha = vis * (1 - k);
          ctx.beginPath(); ctx.arc(c[0], c[1], 9 + k * 22, 0, TAU); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      // Light from the top left, shade at the bottom right.
      var shade = ctx.createRadialGradient(cx - R * 0.4, cy - R * 0.45, R * 0.2, cx, cy, R * 1.02);
      shade.addColorStop(0, 'rgba(255,255,255,0.14)'); shade.addColorStop(0.6, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(6,8,40,0.55)');
      ctx.fillStyle = shade; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    }

    function step(t) {
      var dt = last ? Math.min(0.1, (t - last) / 1000) : 0;
      last = t;
      if (anim) {
        var p = clamp01((t - anim.start) / anim.duration);
        pose.lon = lerp(anim.from.lon, anim.to.lon, still ? easeInOut(p) : ease(p));
        pose.lat = lerp(anim.from.lat, anim.to.lat, easeInOut(p));
        pose.zoom = p < 0.55 ? lerp(anim.from.zoom, 1, easeInOut(clamp01(p / 0.3))) : lerp(1, anim.to.zoom, easeInOut(clamp01((p - 0.6) / 0.4)));
        if (p >= 1) { pose.lon = anim.to.lon; pose.lat = anim.to.lat; pose.zoom = anim.to.zoom; anim = null; }
      } else if (idle) {
        pose.lon -= IDLE_SPEED * dt / DEG * (still ? 0.3 : 1);
      }
      draw(t);
    }
    function loop(t) {
      raf = 0;
      if (dead || paused) return;
      if (!host.isConnected) { stop(); return; }
      step(t);
      raf = requestAnimationFrame(loop);
    }
    function start() { if (!raf && !dead && !paused) raf = requestAnimationFrame(loop); }
    function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; last = 0; }
    function onVisible() { if (document.hidden) stop(); else start(); }
    document.addEventListener('visibilitychange', onVisible);
    var ro = window.ResizeObserver ? new ResizeObserver(function () { size(); step(now()); }) : null;
    if (ro) ro.observe(host); else window.addEventListener('resize', size);
    size();
    step(now());
    start();

    return {
      mode: 'canvas',
      el: canvas,
      spin: function (code, o) {
        o = o || {};
        var duration = Math.max(200, o.duration || 3200), elapsed = Math.max(0, o.elapsed || 0);
        var ps = poseFor(code);
        var turns = still ? 0 : (duration >= 2000 ? 1 : 0);
        // Turning east means the centre longitude goes down.
        var delta = (((pose.lon - ps.lon) % 360) + 360) % 360;
        var to = { lon: pose.lon - delta - turns * 360, lat: ps.lat, zoom: zoomFor(ps.span) };
        hlCode = code; hlTone = o.tone || 'gold'; hlStart = now(); idle = false;
        anim = { from: { lon: pose.lon, lat: pose.lat, zoom: pose.zoom }, to: to, start: now() - elapsed, duration: duration };
        start();
        return new Promise(function (resolve) { setTimeout(resolve, Math.max(0, duration - elapsed)); });
      },
      show: function (code, tone) {
        var ps = poseFor(code);
        anim = null; idle = false; hlCode = code; if (tone) hlTone = tone; hlStart = now();
        pose.lon = ps.lon; pose.lat = ps.lat; pose.zoom = zoomFor(ps.span);
        start();
      },
      mark: function (tone) { hlTone = tone; hlStart = now(); },
      clear: function () { hlCode = null; },
      idle: function () { hlCode = null; anim = null; idle = true; pose.zoom = 1; start(); },
      pause: function () { paused = true; stop(); },
      resume: function () { paused = false; start(); },
      renderOnce: function () { step(now()); },
      destroy: function () {
        dead = true; stop();
        document.removeEventListener('visibilitychange', onVisible);
        if (ro) ro.disconnect(); else window.removeEventListener('resize', size);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      }
    };
  }

  /* ================= the public globe ================= */

  /* A globe in `host`. Until its pictures arrive it shows a glowing placeholder;
     calls made before then (spin, show) are replayed once it is ready. */
  function create(host, opts) {
    opts = opts || {};
    var wrap = document.createElement('div');
    wrap.className = 'gs-globe is-loading';
    var glow = document.createElement('div');
    glow.className = 'gs-globe__placeholder';
    glow.setAttribute('aria-hidden', 'true');
    wrap.appendChild(glow);
    host.appendChild(wrap);

    var impl = null, dead = false, queued = [];
    var api = {
      el: wrap, mode: null,
      ready: null,
      spin: function (code, o) {
        if (impl) return impl.spin(code, o);
        var at = Date.now();
        return new Promise(function (resolve) {
          queued.push(function () {
            var oo = Object.assign({}, o || {});
            oo.elapsed = (oo.elapsed || 0) + (Date.now() - at);
            impl.spin(code, oo).then(resolve);
          });
          // Never hold the game up: land on time even if the pictures are late.
          setTimeout(resolve, Math.max(0, ((o && o.duration) || 3200) - ((o && o.elapsed) || 0)));
        });
      },
      show: function (code, tone) { if (impl) impl.show(code, tone); else queued.push(function () { impl.show(code, tone); }); },
      mark: function (tone) { if (impl) impl.mark(tone); else queued.push(function () { impl.mark(tone); }); },
      clear: function () { if (impl) impl.clear(); else queued.push(function () { impl.clear(); }); },
      idle: function () { if (impl) impl.idle(); else queued = [function () { impl.idle(); }]; },
      pause: function () { if (impl) impl.pause(); },
      resume: function () { if (impl) impl.resume(); },
      renderOnce: function () { if (impl) impl.renderOnce(); },
      destroy: function () {
        dead = true;
        if (impl) impl.destroy();
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      }
    };

    function useCanvas(G) {
      impl = canvasGlobe(wrap, G);
      api.mode = 'canvas';
    }
    function finish() {
      wrap.classList.remove('is-loading');
      wrap.classList.add('is-ready', 'gs-globe--' + api.mode);
      var q = queued; queued = [];
      q.forEach(function (fn) { try { fn(); } catch (e) { /* skip */ } });
    }

    api.ready = geo().then(function (G) {
      if (dead) return api;
      var wantGL = webglOk() && opts.mode !== 'canvas';
      if (!wantGL) { useCanvas(G); finish(); return api; }
      return Promise.all([loadScript(THREE_SRC), loadImage(bigScreen() ? EARTH_4K : EARTH_2K)]).then(function (r) {
        if (dead) return api;
        try {
          impl = webglGlobe(wrap, G, r[1], {
            onLost: function () {
              // The GPU went away: carry on with the canvas globe.
              try { impl.destroy(); } catch (e) { /* gone */ }
              useCanvas(G);
              wrap.classList.remove('gs-globe--webgl');
              wrap.classList.add('gs-globe--canvas');
            }
          });
          api.mode = 'webgl';
        } catch (e) {
          useCanvas(G);
        }
        finish();
        return api;
      }, function () {
        if (!dead) { useCanvas(G); finish(); }
        return api;
      });
    }).catch(function (e) {
      wrap.classList.remove('is-loading');
      wrap.classList.add('is-failed');
      throw e;
    });
    api.ready.catch(function () { /* shown as the placeholder */ });
    return api;
  }

  FF.GeoSpinGlobe = {
    create: create, preload: preload, webglOk: webglOk,
    // For tests.
    poseFor: poseFor, zoomFor: zoomFor, spinFor: spinFor, decodeTopo: decodeTopo
  };
})();
