/* ═══════════════════════════════════════════════════════════════
   Gästehaus Sonne — Bewegung

   Leitbild ist die Sonnenbahn. Die Uhr im Abschnitt "Check-in"
   zeigt die echte Zeit, die Teller im Restaurant gehen auf und
   unter wie die Sonne. Nichts läuft synchron: jede Bahn hat eigene
   Geschwindigkeit, Richtung und Phase. Der Zufall ist gesät, damit
   das Ergebnis reproduzierbar bleibt.
   ═══════════════════════════════════════════════════════════════ */

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


function seeded(seed){
  return function(){
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rnd = seeded(96067);                 // Postleitzahl Bütschwil als feste Signatur
const between = (a, b) => a + rnd() * (b - a);
const pick = arr => arr[Math.floor(rnd() * arr.length)];
const EASES = ['expo.out','power4.out','power3.out','circ.out','back.out(1.3)'];

/* ═══════════════ 1 · Sanftes Scrollen ═══════════════ */
let lenis = null;
if (!REDUCED && window.Lenis){
  lenis = new window.Lenis({ duration:1.1, wheelMultiplier:.95, touchMultiplier:1.6,
                             easing:t => Math.min(1, 1.001 - Math.pow(2, -10 * t)) });
  lenis.on('scroll', ST.update);
  gsap.ticker.add(t => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const el = document.querySelector(a.getAttribute('href'));
      if (!el) return;
      e.preventDefault(); lenis.scrollTo(el, { duration:1.35 }); closeDrawer();
    });
  });
}

/* ═══════════════ 2 · Cursor ═══════════════ */
if (!COARSE){
  const cur = document.querySelector('.cursor');
  const dot = cur.querySelector('.cursor__dot');
  const ring = cur.querySelector('.cursor__ring');
  const p = { x:innerWidth/2, y:innerHeight/2 }, s = { x:p.x, y:p.y };
  addEventListener('pointermove', e => { p.x = e.clientX; p.y = e.clientY;
    gsap.set(dot, { x:p.x, y:p.y }); }, { passive:true });
  gsap.ticker.add(() => {
    s.x += (p.x - s.x) * .15; s.y += (p.y - s.y) * .15;
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
    const tl = gsap.timeline({ onComplete:() => {
      document.getElementById('loader').style.display = 'none';
      document.body.classList.remove('is-loading');
      resolve();
    }});
    tl.from('.loader__sun', { scale:0, rotate:-150, opacity:0, duration:1.5, ease:'back.out(1.5)' })
      .to('.loader__sun', { rotate:'+=18', duration:2.4, ease:'sine.inOut' }, .8)
      .to('.loader__word span', { y:0, duration:.95, ease:'expo.out',
        stagger:{ each:.06 } }, .55)
      .to('.loader__sub', { opacity:1, duration:.7, ease:'power2.out' }, 1.15)
      .to('.loader__inner', { y:-24, opacity:0, duration:.6, ease:'power3.in' }, '+=.35')
      // vier Bahnen, ungleich gestaffelt, von unten weg
      .to('.loader__panels i', { scaleY:0, duration:1.0, ease:'expo.inOut',
        stagger:{ each:.085, from:'random' } }, '-=.3');
  });
}

/* ═══════════════ 4 · Sonnenstand: die eine Formel ═══════════════
   Sonnenuhr, kein Zifferblatt: 6 Uhr rechts (Aufgang), 12 Uhr oben
   (Höchststand), 18 Uhr links (Untergang), 0 Uhr unten.
   Gerechnet wird mathematisch (y nach oben); beim Zeichnen wird y
   deshalb abgezogen, nicht addiert. */
const winkelFuerStunde = h => (15 * (h - 6)) * Math.PI / 180;
const jetztAlsStunde = () => { const d = new Date();
  return d.getHours() + d.getMinutes() / 60; };

function textFuerStunde(h){
  const s = Math.floor(h) % 24;
  if (s >= 22 || s < 5)  return 'Spät dran? Der Automat ist wach.';
  if (s < 9)             return 'Früh unterwegs? Die Tür geht auf.';
  if (s < 17)            return 'Mitten am Tag angekommen? Auch gut.';
  return 'Feierabend. Das Zimmer steht bereit.';
}
const zeitText = h => String(Math.floor(h) % 24).padStart(2,'0') + ':' +
                      String(Math.round((h % 1) * 60) % 60).padStart(2,'0');

/* ═══════════════ 5 · Hero: WebGL-Licht ═══════════════ */
async function initHeroGL(){
  const canvas = document.getElementById('heroGL');
  const src = document.getElementById('heroFallback');
  if (!canvas || REDUCED || SPARSAM) return null;
  if (location.protocol === 'file:') return null;   // Module über file:// gesperrt

  let THREE, renderer;
  try {
    THREE = await import('./three.module.js');
    renderer = new THREE.WebGLRenderer({ canvas, antialias:false, alpha:true });
  } catch(e){ return null; }
  if (!renderer.getContext()) return null;

  const box = () => canvas.getBoundingClientRect();
  let b = box();
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(b.width, b.height, false);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
  camera.position.z = 1;

  const tex = new THREE.TextureLoader().load(src.currentSrc || src.src,
    () => canvas.classList.add('is-on'));
  tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;

  // Lichtquelle steht dort, wo die Sonne gerade wirklich steht.
  // In der Textur wächst y nach oben — mittags also hoch, nachts unter dem Rand.
  const h = jetztAlsStunde();
  const a = winkelFuerStunde(h);
  const sonne = new THREE.Vector2(0.5 + Math.cos(a) * 0.42, 0.5 + Math.sin(a) * 0.55);
  const tag = Math.max(0, Math.sin(a));      // 0 nachts, 1 zur Mittagszeit

  const uniforms = {
    uTex:{value:tex}, uTime:{value:0}, uScroll:{value:0}, uReveal:{value:0},
    uSun:{value:sonne}, uDay:{value:tag},
    uRes:{value:new THREE.Vector2(b.width, b.height)},
    uImg:{value:new THREE.Vector2(2000, 1250)}
  };

  const mat = new THREE.ShaderMaterial({
    uniforms, transparent:true,
    vertexShader:`
      uniform float uTime;
      varying vec2 vUv;
      void main(){
        vUv = uv;
        vec3 p = position;
        // ruhiger als beim Sternen: es soll flimmern wie warme Luft, nicht wogen
        p.x += sin(p.y * 3.1 + uTime * 0.127) * 0.008;
        p.y += sin(p.x * 2.3 - uTime * 0.083) * 0.006;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader:`
      uniform sampler2D uTex; uniform vec2 uRes; uniform vec2 uImg; uniform vec2 uSun;
      uniform float uTime; uniform float uScroll; uniform float uReveal; uniform float uDay;
      varying vec2 vUv;
      void main(){
        float rS = uRes.x / uRes.y, rI = uImg.x / uImg.y;
        vec2 uv = vUv;
        if (rS > rI) { uv.y = (uv.y - 0.5) * (rI / rS) + 0.5; }
        else         { uv.x = (uv.x - 0.5) * (rS / rI) + 0.5; }
        uv.y = (uv.y - 0.5) / (1.0 + uScroll * 0.10) + 0.5;

        vec3 col = texture2D(uTex, uv).rgb;

        // Lichtschleier zur Sonne hin: acht Abtastungen entlang der Richtung
        vec2 dir = (uSun - vUv) * 0.16;
        float strahl = 0.0;
        for (int i = 0; i < 8; i++){
          vec2 s = vUv + dir * (float(i) / 8.0);
          vec3 c = texture2D(uTex, clamp(
            vec2(rS > rI ? s.x : (s.x - 0.5) * (rS / rI) + 0.5,
                 rS > rI ? (s.y - 0.5) * (rI / rS) + 0.5 : s.y), 0.001, 0.999)).rgb;
          strahl += max(0.0, (c.r + c.g + c.b) / 3.0 - 0.66) * (1.0 - float(i) / 8.0);
        }
        float naehe = 1.0 - smoothstep(0.0, 0.95, distance(vUv, uSun));
        float kraft = 0.3 + 0.7 * uDay;          // nachts bleibt nur ein Rest
        col += vec3(1.0, 0.74, 0.34) * strahl * 0.19 * (0.45 + naehe) * kraft;
        col += vec3(1.0, 0.80, 0.45) * naehe * naehe * 0.10 * kraft;

        col = mix(col, col * vec3(1.05, 1.00, 0.92), 0.6);          // warmer Ton
        col *= 1.0 - smoothstep(0.55, 1.15, distance(vUv, vec2(0.5))) * 0.20;

        gl_FragColor = vec4(col, smoothstep(0.0, 1.0, uReveal));
      }`
  });
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2, 64, 64), mat));

  gsap.to(uniforms.uReveal, { value:1, duration:1.4, ease:'power2.inOut' });
  ST.create({ trigger:'.hero', start:'top top', end:'bottom top', scrub:true,
    onUpdate:self => uniforms.uScroll.value = self.progress });

  const clock = new THREE.Clock();
  let sichtbar = true;
  ST.create({ trigger:'.hero', start:'top bottom', end:'bottom top',
    onToggle:self => sichtbar = self.isActive });

  gsap.ticker.add(() => {
    if (!sichtbar) return;
    uniforms.uTime.value = clock.getElapsedTime();
    renderer.render(scene, camera);
  });

  addEventListener('resize', () => {
    b = box();
    renderer.setSize(b.width, b.height, false);
    uniforms.uRes.value.set(b.width, b.height);
  });
  return true;
}

/* ═══════════════ 6 · Hero-Typografie und Uhr ═══════════════ */
function heroIntro(){
  if (REDUCED) return;
  const chars = gsap.utils.toArray('.hero__h1 .ch');
  gsap.set(chars, { yPercent:115, opacity:0, rotate:() => between(-7, 7) });
  const tl = gsap.timeline();
  chars.forEach((c, i) => {
    tl.to(c, { yPercent:0, opacity:1, rotate:0,
      duration:between(1.0, 1.6), ease:pick(EASES) }, .1 + i * between(.05, .11));
  });
  tl.from('.hero__brow span, .hero__brow i', { y:14, opacity:0, duration:.8,
        ease:'power3.out', stagger:.045 }, .3)
    .from('.hero__claim', { y:20, opacity:0, duration:1.1, ease:'expo.out' }, .7);
  gsap.utils.toArray('.hero__sub .lift').forEach((l, i) =>
    tl.from(l, { yPercent:105, duration:1, ease:'expo.out' }, .8 + i * .1));
  tl.from('.hero__foot > *', { y:20, opacity:0, duration:.9, ease:'power3.out', stagger:.09 }, .95)
    .from('.nav', { y:-60, opacity:0, duration:.9, ease:'power3.out' }, .25);

  gsap.to('.hero__clocksun', { rotate:'+=360', duration:151, ease:'none', repeat:-1 });
}

function heroClock(){
  const t = document.getElementById('heroTime');
  const s = document.getElementById('heroState');
  if (!t) return;
  const tick = () => {
    const h = jetztAlsStunde();
    t.textContent = zeitText(h);
    s.textContent = textFuerStunde(h);
  };
  tick(); setInterval(tick, 20000);
}

/* ═══════════════ 7 · Die Sonnenuhr ═══════════════ */
function initDial(){
  const dial = document.getElementById('dial');
  const svg  = document.getElementById('dialSvg');
  const sun  = document.getElementById('dialSun');
  const outH = document.getElementById('dialHour');
  const outN = document.getElementById('dialNote');
  const hint = document.getElementById('dialHint');
  if (!dial) return;

  const CX = 280, CY = 280, R = 212;
  const gTicks  = document.getElementById('dialTicks');
  const gLabels = document.getElementById('dialLabels');
  const NS = 'http://www.w3.org/2000/svg';

  for (let h = 0; h < 24; h++){
    const a = winkelFuerStunde(h);
    const gross = h % 3 === 0;
    const r1 = R - (gross ? 20 : 11), r2 = R;
    const ln = document.createElementNS(NS, 'line');
    ln.setAttribute('x1', CX + Math.cos(a) * r1); ln.setAttribute('y1', CY - Math.sin(a) * r1);
    ln.setAttribute('x2', CX + Math.cos(a) * r2); ln.setAttribute('y2', CY - Math.sin(a) * r2);
    ln.setAttribute('class', 'tick' + (gross ? ' tick--major' : ''));
    ln.dataset.h = h;
    gTicks.appendChild(ln);

    if (h % 3 === 0){
      const tx = document.createElementNS(NS, 'text');
      tx.setAttribute('x', CX + Math.cos(a) * (R - 40));
      tx.setAttribute('y', CY - Math.sin(a) * (R - 40));
      tx.setAttribute('class', 'lbl'); tx.dataset.h = h;
      tx.textContent = String(h).padStart(2, '0');
      gLabels.appendChild(tx);
    }
  }

  const ticks = [...gTicks.children], labels = [...gLabels.children];
  const stand = { h: jetztAlsStunde() };
  let gehalten = false;

  function zeichne(){
    const a = winkelFuerStunde(stand.h);
    // Sonne sitzt auf dem Ring; die Prozentangaben beziehen sich auf die Box
    const px = 50 + (Math.cos(a) * R / 560) * 100;
    const py = 50 - (Math.sin(a) * R / 560) * 100;
    sun.style.left = px + '%';
    sun.style.top  = py + '%';
    outH.textContent = zeitText(stand.h);
    outN.textContent = textFuerStunde(stand.h);
    const akt = Math.floor(stand.h) % 24;
    ticks.forEach(t => t.classList.toggle('is-on', +t.dataset.h === akt));
    labels.forEach(l => l.classList.toggle('is-on', +l.dataset.h === akt));
  }
  zeichne();

  if (REDUCED) return;

  // Auftritt: Striche einzeln, nicht im Gleichtakt
  gsap.from(ticks, { opacity:0, scale:.4, transformOrigin:`${CX}px ${CY}px`,
    duration:.7, ease:'power2.out', stagger:{ each:.028, from:'random' },
    scrollTrigger:{ trigger:dial, start:'top 78%' } });
  gsap.from(labels, { opacity:0, duration:.9, ease:'power2.out',
    stagger:{ each:.06, from:'random' },
    scrollTrigger:{ trigger:dial, start:'top 78%' } });
  gsap.from(sun, { scale:0, rotate:-180, duration:1.6, ease:'back.out(1.6)',
    scrollTrigger:{ trigger:dial, start:'top 76%' } });
  gsap.to(sun, { rotate:'+=360', duration:83, ease:'none', repeat:-1 });

  // echte Zeit alle 30 Sekunden nachführen, solange niemand daran dreht
  setInterval(() => { if (!gehalten) gsap.to(stand, { h:jetztAlsStunde(),
    duration:1.2, ease:'power2.inOut', onUpdate:zeichne }); }, 30000);

  if (COARSE) { hint.textContent = 'Kreis antippen'; }

  function ausZeiger(e){
    const r = dial.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = (r.top + r.height / 2) - e.clientY;      // nach oben positiv
    const winkel = Math.atan2(dy, dx) * 180 / Math.PI;   // -180..180
    let h = winkel / 15 + 6;                             // Umkehrung von winkelFuerStunde
    h = ((h % 24) + 24) % 24;
    gehalten = true;
    gsap.to(stand, { h, duration:.55, ease:'power3.out', onUpdate:zeichne });
    hint.textContent = 'Egal wann — Check-in möglich';
  }
  dial.addEventListener('pointermove', ausZeiger);
  dial.addEventListener('pointerdown', ausZeiger);
  dial.addEventListener('pointerleave', () => {
    gehalten = false;
    hint.textContent = COARSE ? 'Kreis antippen' : 'über den Kreis fahren';
    gsap.to(stand, { h:jetztAlsStunde(), duration:1.1, ease:'power3.out', onUpdate:zeichne });
  });

  gsap.from('.clock__facts li', { x:-26, opacity:0, duration:.95, ease:'power3.out',
    stagger:.12, scrollTrigger:{ trigger:'.clock__facts', start:'top 84%' } });
}

/* ═══════════════ 8 · Zimmer: Preise zählen hoch ═══════════════ */
function initRooms(){
  if (REDUCED) return;
  gsap.utils.toArray('.rcard').forEach((c, i) => {
    gsap.from(c, { y:54, opacity:0, duration:between(1.0, 1.5), ease:pick(EASES),
      delay:i * between(.05, .13),
      scrollTrigger:{ trigger:'.rgrid', start:'top 84%' } });
  });
  gsap.utils.toArray('[data-count]').forEach(el => {
    const ziel = +el.dataset.count;
    const o = { v:0 };
    gsap.to(o, { v:ziel, duration:between(1.2, 1.9), ease:'power2.out',
      onUpdate:() => el.textContent = 'CHF ' + Math.round(o.v),
      scrollTrigger:{ trigger:el, start:'top 92%' } });
  });
  gsap.utils.toArray('.rooms__strip figure').forEach((f, i) => {
    gsap.from(f, { y:46, opacity:0, duration:between(.9, 1.4), ease:'power3.out',
      delay:i * between(.04, .12),
      scrollTrigger:{ trigger:'.rooms__strip', start:'top 88%' } });
  });
}

/* ═══════════════ 9 · Teller gehen auf und unter ═══════════════ */
function initArc(){
  const arc = document.getElementById('restArc');
  const rest = document.querySelector('.rest');
  if (!arc || REDUCED) return;

  const discs = gsap.utils.toArray('.disc').map(el => ({
    el,
    img: el.querySelector('img'),
    winkel: parseFloat(el.dataset.off),                 // Startphase in Grad
    tempo: parseFloat(el.dataset.speed) * 0.02,          // Grad je Sekunde, teils negativ
    skala: parseFloat(el.dataset.scale)
  }));

  // Eigendrehung: jede Scheibe anders, keine gemeinsame Phase
  discs.forEach(d => {
    gsap.to(d.img, { rotate:`+=${360 * (d.tempo > 0 ? 1 : -1)}`,
      duration:between(29, 61), ease:'none', repeat:-1 });
  });

  let scrollAnteil = 0;
  ST.create({ trigger:rest, start:'top bottom', end:'bottom top', scrub:true,
    onUpdate:self => scrollAnteil = self.progress });

  let letzte = performance.now();
  gsap.ticker.add(() => {
    const jetzt = performance.now();
    const dt = Math.min((jetzt - letzte) / 1000, 0.05);
    letzte = jetzt;
    const r = rest.getBoundingClientRect();
    if (r.bottom < -200 || r.top > innerHeight + 200) return;

    // Bahn wie ein Sonnenlauf: Mittelpunkt unterhalb des Abschnitts, die Scheiben
    // gehen rechts auf, ziehen über den Scheitel und gehen links wieder unter.
    const W = r.width, H = r.height;
    const cx = W * 0.5, cy = H * 1.14, R = Math.max(H * 0.98, W * 0.42);
    const ankerX = W * 0.5, ankerY = H * 0.52;   // muss zu left:50%/top:52% passen

    discs.forEach(d => {
      d.winkel += d.tempo * dt;
      const a = (d.winkel + scrollAnteil * 42) * Math.PI / 180;
      const x = cx + Math.cos(a) * R;
      const y = cy - Math.sin(a) * R;
      d.el.style.transform =
        `translate(-50%,-50%) translate(${x - ankerX}px, ${y - ankerY}px) scale(${d.skala})`;
    });
  });

  gsap.utils.toArray('.rest__h2 .lift').forEach((l, i) => {
    gsap.from(l, { yPercent:110, duration:between(.9, 1.3), ease:'expo.out', delay:i * .09,
      scrollTrigger:{ trigger:'.rest__mid', start:'top 78%' } });
  });
}

/* ═══════════════ 10 · Restliche Abschnitte ═══════════════ */
function initRest(){
  if (REDUCED) return;
  gsap.from('.breakfast__big', { y:56, opacity:0, duration:1.4, ease:'expo.out',
    scrollTrigger:{ trigger:'.breakfast', start:'top 80%' } });
  gsap.from('.breakfast__small', { scale:.6, opacity:0, rotate:-8, duration:1.5,
    ease:'back.out(1.4)', delay:.28,
    scrollTrigger:{ trigger:'.breakfast', start:'top 80%' } });
  gsap.from('.breakfast__copy > *', { y:30, opacity:0, duration:1, ease:'power3.out',
    stagger:.1, scrollTrigger:{ trigger:'.breakfast__copy', start:'top 84%' } });

  const m = document.getElementById('marquee');
  if (m){
    gsap.to(m, { xPercent:-50, duration:24, ease:'none', repeat:-1 });
    gsap.to(m, { xPercent:'-=4', ease:'none',
      scrollTrigger:{ trigger:'.place', start:'top bottom', end:'bottom top', scrub:1 } });
  }
  gsap.from('.place__pic', { y:60, opacity:0, duration:1.3, ease:'power4.out',
    scrollTrigger:{ trigger:'.place__grid', start:'top 82%' } });
  gsap.from('.place__copy > *', { y:30, opacity:0, duration:1, ease:'power3.out', stagger:.09,
    scrollTrigger:{ trigger:'.place__copy', start:'top 84%' } });
  gsap.utils.toArray('.gcard').forEach((c, i) => {
    gsap.from(c, { y:60, opacity:0, duration:1.2, ease:'power4.out', delay:i * .15,
      scrollTrigger:{ trigger:'.group__cards', start:'top 84%' } });
  });
  gsap.from('.book__h2', { yPercent:22, opacity:0, duration:1.2, ease:'expo.out',
    scrollTrigger:{ trigger:'.book__cta', start:'top 84%' } });
  gsap.from('.bcol', { y:40, opacity:0, duration:1, ease:'power3.out', stagger:.12,
    scrollTrigger:{ trigger:'.book__cols', start:'top 86%' } });
}

/* ═══════════════ 11 · Navigation ═══════════════ */
const burger = document.getElementById('burger');
const drawer = document.getElementById('drawer');
function closeDrawer(){
  if (!drawer || drawer.hidden) return;
  gsap.to(drawer.querySelectorAll('nav a'), { y:-18, opacity:0, duration:.28, stagger:.03,
    onComplete:() => { drawer.hidden = true; document.body.classList.remove('no-scroll'); } });
  burger.setAttribute('aria-expanded', 'false');
  burger.setAttribute('aria-label', 'Menü öffnen');
}
if (burger){
  burger.addEventListener('click', () => {
    if (burger.getAttribute('aria-expanded') === 'true'){ closeDrawer(); return; }
    drawer.hidden = false;
    document.body.classList.add('no-scroll');
    burger.setAttribute('aria-expanded', 'true');
    burger.setAttribute('aria-label', 'Menü schliessen');
    gsap.fromTo(drawer.querySelectorAll('nav a'),
      { y:30, opacity:0 }, { y:0, opacity:1, duration:.7, ease:'expo.out', stagger:.055 });
  });
  drawer.querySelectorAll('a').forEach(a => a.addEventListener('click', closeDrawer));
}
function initNavState(){
  const nav = document.getElementById('nav');
  ST.create({ trigger:'.hero', start:'bottom top+=70',
    onEnter:() => nav.classList.add('is-stuck'),
    onLeaveBack:() => nav.classList.remove('is-stuck') });
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
  heroClock();
  initHeroGL();
  initDial();
  initRooms();
  initArc();
  initRest();
  initNavState();
  initDock();
  await runLoader();
  heroIntro();
  ST.refresh();
}
if (document.readyState === 'complete') boot();
else addEventListener('load', boot);
