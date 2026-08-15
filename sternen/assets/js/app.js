/* ═══════════════════════════════════════════════════════════════
   Gasthaus Sternen — Bewegung
   Leitgedanke: nichts läuft synchron. Jedes Element bekommt eigene
   Dauer, eigene Verzögerung, eigene Kurve. Der Zufall ist gesät,
   damit das Ergebnis reproduzierbar bleibt.
   ═══════════════════════════════════════════════════════════════ */
// Three.js wird erst geladen, wenn der Hero-Effekt wirklich läuft — es ist mit
// Abstand die grösste Datei. Wer „Bewegung reduzieren" gesetzt hat oder kein
// WebGL bekommt, lädt sie gar nicht erst.

const { gsap } = window;
gsap.registerPlugin(window.ScrollTrigger);
const ST = window.ScrollTrigger;

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const COARSE  = window.matchMedia('(hover: none), (pointer: coarse)').matches;

/* Schwache Geräte und Datensparmodus: kein WebGL, kein langer Vorhang.
   Das Foto darunter trägt den Hero ohnehin vollwertig. */
const VERB = navigator.connection || {};
const SPARSAM = VERB.saveData === true
  || /(^|-)2g$/.test(VERB.effectiveType || '')
  || (navigator.deviceMemory && navigator.deviceMemory < 3);


/* ── Gesäter Zufall (Mulberry32) ─────────────────────────────── */
function seeded(seed){
  return function(){
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rnd = seeded(19031113);           // 1903 + Hausnummer 70 -> feste Signatur
const between = (a, b) => a + rnd() * (b - a);
const pick = arr => arr[Math.floor(rnd() * arr.length)];
const EASES = ['expo.out','power4.out','power3.out','circ.out','back.out(1.35)','power2.out'];

/* ═══════════════ 1 · Sanftes Scrollen ═══════════════ */
let lenis = null;
if (!REDUCED && window.Lenis){
  lenis = new window.Lenis({ duration:1.15, wheelMultiplier:.95, touchMultiplier:1.6,
                             easing:t => Math.min(1, 1.001 - Math.pow(2, -10 * t)) });
  lenis.on('scroll', ST.update);
  gsap.ticker.add(t => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const el = document.querySelector(a.getAttribute('href'));
      if (!el) return;
      e.preventDefault();
      lenis.scrollTo(el, { offset:0, duration:1.4 });
      closeDrawer();
    });
  });
}

/* ═══════════════ 2 · Cursor ═══════════════ */
if (!COARSE){
  const cur = document.querySelector('.cursor');
  const dot = cur.querySelector('.cursor__dot');
  const ring = cur.querySelector('.cursor__ring');
  const p = { x:innerWidth/2, y:innerHeight/2 };
  const s = { x:p.x, y:p.y };
  addEventListener('pointermove', e => { p.x = e.clientX; p.y = e.clientY;
    gsap.set(dot, { x:p.x, y:p.y }); }, { passive:true });
  gsap.ticker.add(() => {                       // Ring läuft träger als der Punkt
    s.x += (p.x - s.x) * .14; s.y += (p.y - s.y) * .14;
    gsap.set(ring, { x:s.x, y:s.y });
  });
  document.querySelectorAll('[data-cursor], a, button').forEach(el => {
    el.addEventListener('pointerenter', () => cur.classList.add('is-hot'));
    el.addEventListener('pointerleave', () => cur.classList.remove('is-hot'));
  });
}

/* ═══════════════ 3 · Ladevorhang ═══════════════ */
function runLoader(){
  return new Promise(resolve => {
    if (REDUCED){ document.body.classList.remove('is-loading'); resolve(); return; }
    const num = document.getElementById('loaderNum');
    const counter = { v:0 };
    const tl = gsap.timeline({ onComplete:() => {
      document.getElementById('loader').style.display = 'none';
      document.body.classList.remove('is-loading');
      resolve();
    }});
    tl.to('.loader__star path', { strokeDashoffset:0, duration:1.5, ease:'power2.inOut' })
      .to('.loader__word span', {                       // Buchstaben einzeln, ungleich
        y:0, duration:1.05, ease:'expo.out',
        stagger:{ each:.055, from:'start' }
      }, .35)
      .to(counter, { v:100, duration:1.7, ease:'power1.inOut',
        onUpdate:() => num.textContent = Math.round(counter.v) }, .3)
      .to('.loader__inner', { y:-28, opacity:0, duration:.7, ease:'power3.in' }, '+=.12')
      .to('.loader__panels i', {                        // fünf Bahnen, gestaffelt
        scaleY:0, duration:1.05, ease:'expo.inOut',
        stagger:{ each:.075, from:'edges' }
      }, '-=.35');
  });
}

/* ═══════════════ 4 · Hero: WebGL-Fassade ═══════════════ */
async function initHeroGL(){
  const canvas = document.getElementById('heroGL');
  const src = document.getElementById('heroFallback');
  if (!canvas || REDUCED || SPARSAM) return null;

  // Über file:// blockiert Chrome jeden Modul-Import. Dann gar nicht erst versuchen —
  // das Foto darunter trägt den Hero vollwertig.
  if (location.protocol === 'file:') return null;

  let THREE, renderer;
  try {
    THREE = await import('./three.module.js');
    renderer = new THREE.WebGLRenderer({ canvas, antialias:false, alpha:true, powerPreference:'high-performance' });
  } catch(e){ return null; }        // ohne WebGL bleibt das Foto darunter stehen
  if (!renderer.getContext()) return null;

  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight, false);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
  camera.position.z = 1;

  const tex = new THREE.TextureLoader().load(src.currentSrc || src.src, () => {
    canvas.classList.add('is-on');
  });
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;

  const seg = innerWidth < 760 ? 48 : 96;
  const uniforms = {
    uTex:     { value: tex },
    uTime:    { value: 0 },
    uScroll:  { value: 0 },
    uMouse:   { value: new THREE.Vector2(.5, .5) },
    uRes:     { value: new THREE.Vector2(innerWidth, innerHeight) },
    uImg:     { value: new THREE.Vector2(2400, 1603) },
    uReveal:  { value: 0 }
  };

  const material = new THREE.ShaderMaterial({
    uniforms, transparent:true,
    vertexShader:`
      uniform float uTime; uniform float uScroll; uniform vec2 uMouse;
      varying vec2 vUv; varying float vWave;
      void main(){
        vUv = uv;
        vec3 p = position;
        // drei Wellen mit teilerfremden Frequenzen -> kein sichtbarer Rhythmus
        float w1 = sin(p.x * 2.7 + uTime * 0.21) * 0.030;
        float w2 = sin(p.y * 3.9 - uTime * 0.147) * 0.021;
        float w3 = sin((p.x + p.y) * 1.7 + uTime * 0.093) * 0.016;
        float d  = w1 + w2 + w3;
        float mDist = distance(uv, uMouse);
        d += smoothstep(0.55, 0.0, mDist) * 0.030 * sin(mDist * 13.0 - uTime * 1.1);
        vWave = d;
        p.x += d * 0.62;
        p.y += d * 0.42 - uScroll * 0.14;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader:`
      uniform sampler2D uTex; uniform vec2 uRes; uniform vec2 uImg;
      uniform float uTime; uniform float uScroll; uniform float uReveal;
      varying vec2 vUv; varying float vWave;
      void main(){
        // Bildausschnitt wie object-fit: cover
        float rS = uRes.x / uRes.y, rI = uImg.x / uImg.y;
        vec2 uv = vUv;
        if (rS > rI) { uv.y = (uv.y - 0.5) * (rI / rS) + 0.5; }
        else         { uv.x = (uv.x - 0.5) * (rS / rI) + 0.5; }
        uv.y = (uv.y - 0.5) / (1.0 + uScroll * 0.14) + 0.5;   // sanftes Zoomen beim Scrollen

        // Farbtrennung nur als Hauch am Rand — sonst entstehen Regenbogenstreifen
        float edge = smoothstep(0.28, 0.72, distance(vUv, vec2(0.5)));
        float shift = (abs(vWave) * 0.035 + 0.0009) * edge;
        float r = texture2D(uTex, uv + vec2( shift, 0.0)).r;
        float g = texture2D(uTex, uv).g;
        float b = texture2D(uTex, uv - vec2( shift, 0.0)).b;
        vec3 col = vec3(r, g, b);

        col *= 1.0 - smoothstep(0.42, 1.05, distance(vUv, vec2(0.5))) * 0.42;  // Vignette
        col = mix(col, col * vec3(1.03, 0.99, 0.94), 0.55);                     // warmer Ton
        float rev = smoothstep(0.0, 1.0, uReveal);
        gl_FragColor = vec4(col, rev);
      }`
  });

  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2, seg, seg), material));

  const mouse = { tx:.5, ty:.5, x:.5, y:.5 };
  if (!COARSE) addEventListener('pointermove', e => {
    mouse.tx = e.clientX / innerWidth; mouse.ty = 1 - e.clientY / innerHeight;
  }, { passive:true });

  gsap.to(uniforms.uReveal, { value:1, duration:1.6, ease:'power2.inOut', delay:.1 });
  ST.create({ trigger:'.hero', start:'top top', end:'bottom top', scrub:true,
    onUpdate:self => uniforms.uScroll.value = self.progress });

  const clock = new THREE.Clock();
  let visible = true;
  ST.create({ trigger:'.hero', start:'top bottom', end:'bottom top',
    onToggle:self => visible = self.isActive });

  gsap.ticker.add(() => {
    if (!visible) return;
    mouse.x += (mouse.tx - mouse.x) * .045;      // träge Nachführung
    mouse.y += (mouse.ty - mouse.y) * .045;
    uniforms.uMouse.value.set(mouse.x, mouse.y);
    uniforms.uTime.value = clock.getElapsedTime();
    renderer.render(scene, camera);
  });

  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight, false);
    uniforms.uRes.value.set(innerWidth, innerHeight);
  });
  return true;
}

/* ═══════════════ 5 · Hero-Typografie ═══════════════ */
function heroIntro(){
  const chars = gsap.utils.toArray('.hero__h1 .ch');
  const tl = gsap.timeline();

  if (!REDUCED){
    gsap.set(chars, { yPercent:118, rotate:() => between(-9, 9), opacity:0 });
    chars.forEach((ch, i) => {
      tl.to(ch, {
        yPercent:0, rotate:0, opacity:1,
        duration:between(1.0, 1.7),          // jeder Buchstabe eigene Dauer
        ease:pick(EASES)
      }, .12 + i * between(.045, .105));     // und eigener Einsatz
    });
    tl.from('.hero__brow span, .hero__brow i',
            { y:16, opacity:0, duration:.9, ease:'power3.out', stagger:.05 }, .35);
    gsap.utils.toArray('.hero__sub .lift').forEach((l, i) => {
      tl.from(l, { yPercent:105, duration:1.05, ease:'expo.out' }, .75 + i * .09);
    });
    tl.from('.hero__foot > *', { y:24, opacity:0, duration:1, ease:'power3.out', stagger:.09 }, .95)
      .from('.hero__star', { scale:.3, opacity:0, rotate:-140, duration:1.8, ease:'expo.out' }, .5)
      .from('.nav', { y:-70, opacity:0, duration:1, ease:'power3.out' }, .3);
  }

  // Stern dreht endlos, langsam und ungerade
  if (!REDUCED) gsap.to('.hero__star', { rotate:'+=360', duration:97, ease:'none', repeat:-1 });

  // Text löst sich beim Wegscrollen unterschiedlich schnell auf
  if (!REDUCED) gsap.to('.hero__type', {
    yPercent:-34, opacity:0, ease:'none',
    scrollTrigger:{ trigger:'.hero', start:'top top', end:'bottom top', scrub:.6 }
  });
  return tl;
}

/* ═══════════════ 6 · Manifest: Wörter füllen sich ═══════════════ */
function initManifest(){
  const el = document.querySelector('[data-fill]');
  if (!el) return;
  const words = el.textContent.trim().split(/\s+/);
  el.innerHTML = words.map(w => `<span class="w">${w}</span>`).join(' ');
  if (REDUCED){ el.querySelectorAll('.w').forEach(w => w.style.color = 'var(--ink)'); return; }
  gsap.to(el.querySelectorAll('.w'), {
    color:'#12100E', ease:'none', stagger:.55,
    scrollTrigger:{ trigger:el, start:'top 82%', end:'bottom 55%', scrub:.5 }
  });
  gsap.from('.manifest__meta div', {
    y:40, opacity:0, duration:1.1, ease:'power3.out',
    stagger:{ each:.12, from:'random' },
    scrollTrigger:{ trigger:'.manifest__meta', start:'top 84%' }
  });
}

/* ═══════════════ 7 · Räume: waagrechter Lauf ═══════════════ */
function initRooms(){
  const pin = document.querySelector('.rooms__pin');
  const track = document.getElementById('roomsTrack');
  if (!pin || !track) return;
  // Grenze muss zum @media (max-width:999px) im Stylesheet passen
  if (REDUCED || innerWidth < 1000){
    gsap.utils.toArray('.room').forEach((r, i) => {
      gsap.from(r, { y:60, opacity:0, duration:1, ease:'power3.out',
        scrollTrigger:{ trigger:r, start:'top 86%' } });
    });
    return;
  }
  const dist = () => track.scrollWidth - innerWidth + parseFloat(getComputedStyle(track).paddingRight || 0);

  const tween = gsap.to(track, {
    x:() => -dist(), ease:'none',
    scrollTrigger:{
      trigger:pin, start:'top top', end:() => '+=' + dist() * 1.15,
      pin:true, scrub:.8, invalidateOnRefresh:true, anticipatePin:1
    }
  });

  // Bilder wandern innerhalb ihres Rahmens gegenläufig, jedes anders schnell
  gsap.utils.toArray('.room').forEach((room, i) => {
    const img = room.querySelector('.room__media img');
    const aside = room.querySelector('.room__aside');
    gsap.fromTo(img, { yPercent:-10 }, {
      yPercent:-2 - i * 1.4, ease:'none',
      scrollTrigger:{ trigger:room, containerAnimation:tween, start:'left right', end:'right left', scrub:true }
    });
    gsap.fromTo(aside, { y:26, rotate:between(-5, 5) }, {
      y:-30, rotate:between(-3, 3), ease:'none',
      scrollTrigger:{ trigger:room, containerAnimation:tween, start:'left right', end:'right left', scrub:between(.4, 1.1) }
    });
    gsap.from(room.querySelector('.room__body'), {
      y:34, opacity:0, duration:between(.8, 1.3), ease:pick(EASES),
      scrollTrigger:{ trigger:room, containerAnimation:tween, start:'left 78%' }
    });
  });
}

/* ═══════════════ 8 · Die Teller ═══════════════ */
function initPlates(){
  const plates = gsap.utils.toArray('.plate');
  if (!plates.length || REDUCED) return;

  plates.forEach(pl => {
    const inner = pl.querySelector('.plate__in');
    const spin  = parseFloat(pl.dataset.spin);      // Sekunden je Umdrehung
    const dir   = parseFloat(pl.dataset.dir);
    const tilt  = parseFloat(pl.dataset.tilt);
    const depth = parseFloat(pl.dataset.depth);

    gsap.set(inner, { rotate:tilt });

    // Eigenrotation: jede Scheibe eine andere Dauer, keine gemeinsame Phase
    gsap.to(inner, { rotate:`+=${360 * dir}`, duration:spin, ease:'none', repeat:-1 });

    // Schweben: x und y mit verschiedenen Perioden ergibt eine Lissajous-Bahn
    gsap.to(inner, { xPercent:between(-9, 9), duration:between(7, 15),
                     ease:'sine.inOut', repeat:-1, yoyo:true, delay:between(0, 3) });
    gsap.to(inner, { yPercent:between(-13, 13), duration:between(9, 19),
                     ease:'sine.inOut', repeat:-1, yoyo:true, delay:between(0, 4) });

    // Tiefenstaffelung beim Scrollen
    gsap.fromTo(inner, { y:depth * 150 }, {
      y:-depth * 190, ease:'none',
      scrollTrigger:{ trigger:'.kitchen', start:'top bottom', end:'bottom top', scrub:between(.3, 1.2) }
    });

    // Auftritt
    gsap.from(inner, {
      scale:0, opacity:0, duration:between(1.1, 2.0), ease:'back.out(1.5)',
      delay:between(0, .5),
      scrollTrigger:{ trigger:'.kitchen', start:'top 72%' }
    });
  });

  // Mausparallaxe auf dem Rahmen — tiefe Teller reagieren stärker
  if (!COARSE){
    const m = { tx:0, ty:0, x:0, y:0 };
    addEventListener('pointermove', e => {
      m.tx = (e.clientX / innerWidth - .5) * 2;
      m.ty = (e.clientY / innerHeight - .5) * 2;
    }, { passive:true });
    gsap.ticker.add(() => {
      m.x += (m.tx - m.x) * .05; m.y += (m.ty - m.y) * .05;
      plates.forEach(pl => {
        const d = parseFloat(pl.dataset.depth);
        pl.style.setProperty('--mx', (m.x * d * 26).toFixed(2) + 'px');
        pl.style.setProperty('--my', (m.y * d * 20).toFixed(2) + 'px');
      });
    });
  }

  gsap.utils.toArray('.kitchen__h2 .lift').forEach((l, i) => {
    gsap.from(l, { yPercent:110, duration:between(.9, 1.4), ease:'expo.out', delay:i * .08,
      scrollTrigger:{ trigger:'.kitchen__mid', start:'top 76%' } });
  });
  gsap.from('.kitchen__list li', {
    x:-24, opacity:0, duration:.9, ease:'power3.out', stagger:.11,
    scrollTrigger:{ trigger:'.kitchen__list', start:'top 86%' }
  });
}

/* ═══════════════ 9 · Sternbild ═══════════════ */
function initConstellation(){
  const wrap = document.getElementById('constellation');
  const svg  = document.getElementById('lines');
  const nodes = gsap.utils.toArray('.star-node');
  if (!wrap || !nodes.length) return;

  // Linien zwischen den Sternen zeichnen (Reihenfolge = Sternbild, nicht Reihe)
  const order = [0,1,2,3,6,5,4,0];
  function drawLines(){
    svg.innerHTML = '';
    const box = wrap.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    for (let i = 0; i < order.length - 1; i++){
      const a = nodes[order[i]].getBoundingClientRect();
      const b = nodes[order[i+1]].getBoundingClientRect();
      const x1 = a.left - box.left + a.width/2,  y1 = a.top - box.top + a.height/2;
      const x2 = b.left - box.left + b.width/2,  y2 = b.top - box.top + b.height/2;
      const len = Math.hypot(x2-x1, y2-y1);
      const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      ln.setAttribute('x1',x1); ln.setAttribute('y1',y1);
      ln.setAttribute('x2',x2); ln.setAttribute('y2',y2);
      ln.style.setProperty('--len', len);
      svg.appendChild(ln);
    }
  }
  // Zwischenträger einziehen: GSAP dreht ihn, CSS skaliert das Bild beim Hover.
  // Beide auf demselben Element würden sich die transform-Eigenschaft streitig machen.
  nodes.forEach(n => {
    if (n.querySelector('.star-node__art')) return;
    const grafik = n.querySelector('img, svg');
    if (!grafik) return;
    const art = document.createElement('span');
    art.className = 'star-node__art';
    grafik.replaceWith(art);         // nur die Grafik dreht sich mit
    art.appendChild(grafik);         // der Name daneben bleibt gerade und lesbar
  });

  drawLines();
  addEventListener('resize', () => { drawLines(); if (!REDUCED) revealLines(); });

  function revealLines(){
    gsap.to(svg.querySelectorAll('line'), {
      strokeDashoffset:0, duration:1.3, ease:'power2.inOut', stagger:.14,
      scrollTrigger:{ trigger:wrap, start:'top 72%' }
    });
  }
  if (!REDUCED){
    revealLines();
    nodes.forEach((n, i) => {
      const d = parseFloat(n.style.getPropertyValue('--d')) || 1;
      const art = n.querySelector('.star-node__art');  // Träger der Drehung
      // Auftritt ohne Drehung: sonst kämpft er mit der Dauerbewegung und der
      // Stern bleibt verdreht stehen (Namen standen kopf).
      gsap.from(n, { scale:0, opacity:0,
        duration:between(1.0, 1.9), ease:'back.out(1.6)', delay:i * between(.05, .14),
        scrollTrigger:{ trigger:wrap, start:'top 76%' } });
      // jeder Stern schwebt eigenständig — Drehung dezent und auf dem Kind
      gsap.to(n, { y:between(-22, 22), duration:between(6, 13),
        ease:'sine.inOut', repeat:-1, yoyo:true, delay:between(0, 3) });
      gsap.fromTo(art, { rotate:between(-3.5, -1) },
        { rotate:between(1, 3.5), duration:between(9, 17),
          ease:'sine.inOut', repeat:-1, yoyo:true, delay:between(0, 4) });
      gsap.to(n, { yPercent:-d * 22, ease:'none',
        scrollTrigger:{ trigger:wrap, start:'top bottom', end:'bottom top', scrub:.8 } });
    });
  }

  // Vorschaubild folgt dem Zeiger
  const peek = document.getElementById('peek');
  const pImg = document.getElementById('peekImg');
  const pCap = document.getElementById('peekCap');
  const MAP = {
    wolke7:['assets/img/zi-wolke7.webp','Wolke 7'],
    immergruen:['assets/img/zi-immergruen.webp','Immergrün'],
    almrausch:['assets/img/zi-almrausch.webp','Almrausch'],
    easyrider:['assets/img/zi-easyrider.webp','Easy Rider'],
    kirschbluete:['assets/img/zi-kirschbluete.webp','Kirschblüte'],
    shabbychic:['assets/img/zi-shabbychic.webp','Shabby Chic'],
    playboy:['assets/img/zi-playboy.webp','Playboy']
  };
  if (!COARSE && peek){
    nodes.forEach(n => {
      n.addEventListener('pointerenter', () => {
        const m = MAP[n.dataset.room]; if (!m) return;
        pImg.src = m[0]; pCap.textContent = m[1];
        gsap.to(peek, { opacity:1, duration:.45, ease:'power2.out' });
      });
      n.addEventListener('pointerleave', () =>
        gsap.to(peek, { opacity:0, duration:.35, ease:'power2.out' }));
    });
    wrap.addEventListener('pointermove', e => {
      const box = wrap.getBoundingClientRect();
      gsap.to(peek, { x:e.clientX - box.left + 26, y:e.clientY - box.top - 90,
                      duration:.7, ease:'power3.out' });
    });
  }

  gsap.from('.rcard', {
    y:56, opacity:0, duration:1.15, ease:'power3.out',
    stagger:{ each:.09, from:'random' },
    scrollTrigger:{ trigger:'.rooms-grid', start:'top 84%' }
  });
}

/* ═══════════════ 10 · Bar ═══════════════ */
function initBar(){
  const m = document.getElementById('marqueeA');
  if (m && !REDUCED){
    gsap.to(m, { xPercent:-50, duration:26, ease:'none', repeat:-1 });
    gsap.to(m, { xPercent:'-=3', duration:1.2, ease:'power2.out',
      scrollTrigger:{ trigger:'.bar', start:'top bottom', end:'bottom top', scrub:1 } });
  }
  const glow = document.getElementById('barGlow');
  const bar = document.querySelector('.bar');
  if (glow && bar && !COARSE && !REDUCED){
    gsap.set(glow, { x:innerWidth*.3, y:300 });
    bar.addEventListener('pointermove', e => {
      const b = bar.getBoundingClientRect();
      gsap.to(glow, { x:e.clientX - b.left, y:e.clientY - b.top, duration:1.1, ease:'power3.out' });
    });
  }
  if (!REDUCED){
    gsap.from('.bar__stack figure', {
      y:70, opacity:0, duration:1.25, ease:'power3.out',
      stagger:{ each:.13, from:'end' },
      scrollTrigger:{ trigger:'.bar__stack', start:'top 86%' }
    });
    gsap.from('.bar__copy > *', {
      y:36, opacity:0, duration:1, ease:'power3.out', stagger:.1,
      scrollTrigger:{ trigger:'.bar__copy', start:'top 82%' }
    });
    gsap.to('.bar__bg img', { yPercent:12, ease:'none',
      scrollTrigger:{ trigger:'.bar', start:'top bottom', end:'bottom top', scrub:true } });
  }
}

/* ═══════════════ 11 · Geschichte, Gastgeber, Gruppe ═══════════════ */
function initRest(){
  if (REDUCED) return;
  gsap.from('.postcard', {
    y:70, opacity:0, rotate:-2.4, filter:'blur(9px)', duration:1.6, ease:'expo.out',
    scrollTrigger:{ trigger:'.postcard', start:'top 84%' }
  });
  gsap.to('.postcard img', {                       // Bild „entwickelt" sich
    filter:'sepia(0) contrast(1.02)', ease:'none',
    scrollTrigger:{ trigger:'.postcard', start:'top 78%', end:'bottom 55%', scrub:.8 }
  });
  gsap.from('.timeline li', {
    x:-30, opacity:0, duration:1, ease:'power3.out', stagger:.14,
    scrollTrigger:{ trigger:'.timeline', start:'top 86%' }
  });
  gsap.from('.hosts__pic', {
    scale:.9, opacity:0, rotate:2, duration:1.4, ease:'expo.out',
    scrollTrigger:{ trigger:'.hosts', start:'top 80%' }
  });
  gsap.from('.hosts blockquote p', {
    y:40, opacity:0, duration:1.3, ease:'expo.out',
    scrollTrigger:{ trigger:'.hosts', start:'top 78%' }
  });
  gsap.utils.toArray('.gcard').forEach((c, i) => {
    gsap.from(c, { y:70, opacity:0, duration:1.3, ease:'power4.out', delay:i * .14,
      scrollTrigger:{ trigger:'.group__cards', start:'top 84%' } });
  });
  gsap.from('.contact__h2', {
    yPercent:24, opacity:0, duration:1.3, ease:'expo.out',
    scrollTrigger:{ trigger:'.contact__cta', start:'top 82%' }
  });
  gsap.from('.ccol', {
    y:44, opacity:0, duration:1.05, ease:'power3.out', stagger:.13,
    scrollTrigger:{ trigger:'.contact__cols', start:'top 86%' }
  });
}

/* ═══════════════ 12 · Navigation ═══════════════ */
const burger = document.getElementById('burger');
const drawer = document.getElementById('drawer');
function closeDrawer(){
  if (!drawer || drawer.hidden) return;
  gsap.to(drawer.querySelectorAll('nav a'), { y:-20, opacity:0, duration:.3, stagger:.03,
    onComplete:() => { drawer.hidden = true; document.body.classList.remove('no-scroll'); } });
  burger.setAttribute('aria-expanded', 'false');
  burger.setAttribute('aria-label', 'Menü öffnen');
}
if (burger){
  burger.addEventListener('click', () => {
    const open = burger.getAttribute('aria-expanded') === 'true';
    if (open){ closeDrawer(); return; }
    drawer.hidden = false;
    document.body.classList.add('no-scroll');
    burger.setAttribute('aria-expanded', 'true');
    burger.setAttribute('aria-label', 'Menü schliessen');
    gsap.fromTo(drawer.querySelectorAll('nav a'),
      { y:34, opacity:0 }, { y:0, opacity:1, duration:.75, ease:'expo.out', stagger:.06 });
  });
  drawer.querySelectorAll('a').forEach(a => a.addEventListener('click', closeDrawer));
}
function initNavState(){
  const nav = document.getElementById('nav');
  ST.create({ trigger:'.hero', start:'bottom top+=70',
    onEnter:() => nav.classList.add('is-stuck'),
    onLeaveBack:() => nav.classList.remove('is-stuck') });
}

/* ═══════════════ 13 · Offen oder geschlossen? ═══════════════ */
function initOpenState(){
  const box = document.getElementById('heroNow');
  const out = document.getElementById('openState');
  if (!out) return;
  const now = new Date();
  const day = now.getDay();                 // 0 = Sonntag
  const mins = now.getHours() * 60 + now.getMinutes();
  const NAMES = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
  const barDay = day >= 4 && day <= 6;      // Do, Fr, Sa

  if (day === 0){
    out.textContent = 'Sonntag ist Ruhetag · Montag ab 11.00';
    return;
  }
  const mittag = mins >= 660 && mins < 840;         // 11.00–14.00
  const abend  = mins >= 1020 && mins < 1380;       // 17.00–23.00
  const bar    = barDay && (mins >= 1290 || mins < 120);  // ab 21.30
  if (mittag || abend){
    box.classList.add('is-open');
    out.textContent = mittag ? 'Jetzt offen · Mittagsmenü bis 14.00' : 'Jetzt offen · Küche bis 23.00';
  } else if (bar){
    box.classList.add('is-open');
    out.textContent = 'Hühnerstall Bar ist offen';
  } else if (mins < 660){
    out.textContent = `${NAMES[day]} · wir öffnen um 11.00`;
  } else {
    out.textContent = mins < 1020 ? 'Küchenpause · ab 17.00 wieder offen'
                                  : (barDay ? 'Bar ab 21.30' : 'Geschlossen · morgen ab 11.00');
  }
}


/* ═══ Schnellzugriff: „Nach oben" ═══ */
function initDock(){
  const btn = document.getElementById('toTop');
  if (!btn) return;
  let sichtbar = false;
  const schwelle = () => innerHeight * 0.6;

  function pruefen(){
    const soll = scrollY > schwelle();
    if (soll === sichtbar) return;
    sichtbar = soll;
    if (soll){
      btn.hidden = false;
      if (REDUCED) return;
      gsap.fromTo(btn, { scale:.4, opacity:0, y:14 },
        { scale:1, opacity:1, y:0, duration:.55, ease:'back.out(1.7)' });
    } else if (REDUCED){
      btn.hidden = true;
    } else {
      gsap.to(btn, { scale:.4, opacity:0, y:14, duration:.32, ease:'power2.in',
        onComplete:() => { btn.hidden = true; gsap.set(btn, { clearProps:'all' }); } });
    }
  }
  addEventListener('scroll', pruefen, { passive:true });
  pruefen();

  btn.addEventListener('click', () => {
    if (lenis && !REDUCED) lenis.scrollTo(0, { duration:1.5 });
    else window.scrollTo({ top:0, behavior:REDUCED ? 'auto' : 'smooth' });
  });
}

/* ═══════════════ Start ═══════════════ */
async function boot(){
  initOpenState();
  initHeroGL();
  initManifest();
  initRooms();
  initPlates();
  initConstellation();
  initBar();
  initRest();
  initNavState();
  initDock();
  await runLoader();
  heroIntro();
  ST.refresh();
}

if (document.readyState === 'complete') boot();
else addEventListener('load', boot);
